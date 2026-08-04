-- 0043_wave_d_b1_staff_advances.sql -- WAVE D-b, SLICE D-b1: THE STAFF-ADVANCE FAMILY
-- (the B-lite register), AND THE COMPLETION OF THE RESERVATION UNION D-b0 SHIPPED AS A SHELL.
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. The as-built ladder's round-11 conditional rule fired
-- (ladder-r11-record.md, 2026-08-04), so the 21,163-line Wave D-b unit is PROVEN NON-CONVERGENT
-- and THE SPLIT IS THE EXECUTED RULING: D-b0 (the shared class authorities + the D-a residual
-- recuts) ships FIRST, THIS FILE (D-b1, staff advances) ships SECOND, then D-b3 (the AF-2
-- composite + the producer), and D-b2 (recurring adjustments) is HELD BACK with the round-11
-- fixes and its own ladder. The partition is not invented here: it is the measured file map of
-- `split-dependency-census.md` sect.8 (the D-b1 map), whose sect.2 classifies all 22 cross-slice
-- order violations, sect.3 gives the per-block purity verdict, sect.5 the tail split, sect.6 the
-- test split and sect.7 the seven hazards this extraction honours -- AS CORRECTED BY THE BINDING
-- ERRATA in `split-build-record.md` (E1: D-b0 shipped S5.9's CORRECTION-DATE half, so the
-- REVERSAL-WALL half and its ordering postcheck are THIS slice's and are anchored on the body AS
-- D-b0 LEFT IT, harvested with pg_get_functiondef on a rig with D-b0 applied -- never on the 0041
-- text; E5: the S5.25 roster keeps clara.settle_from_bank_line in D-b0/D-b1; E6: S5.12's
-- authority arm is already in D-b0 and is NOT re-shipped here).
--
-- SCOPE OF THIS SLICE (census sect.8's D-b1 bullet list, in order): the pre-DDL probes narrowed
-- to this slice's own relations; SS1.4-SS1.7 (clara.staff_advance_accounts, clara.staff_advances,
-- clara.staff_advance_applications and clara.ea1955_policy with its three-row EA 1955 seed --
-- including, inside SS1.5/SS1.6, the two entry_id indexes tail 21 is about); the two s2 class
-- authorities this slice owns (clara._acct_role_reserved RE-CREATED WITH ITS ADVANCE ARMS, which
-- COMPLETES the FA-only shell D-b0 shipped, and clara._wdb_reversal_blocked); SECTION S3 WHOLE
-- (the twenty advance bodies, the deferred movement belt, the three reads, the grant loop and the
-- clara.list_review_queue splice) under its OWN role scaffolding; the re-create of
-- clara._acct_role_reserved_at with its advance arms; the S5.8-b1 hook splice (the
-- clara._adv_on_approve line); the S5.9-b1 reversal-wall splice and its ordering postcheck; S5.19
-- (clara.fa_register_tie's reader recut, which reads this slice's registers); and tails 10's
-- D-b1 half, 19 and 21 pure plus the slice-local forms of 1, 3, 6, 7, 8, 9 and 20.
--
-- EVERY ALTERED SITE IS MARKED IN SOURCE with a `-- [SPLIT D-b1 2026-08-04] ...` comment naming what
-- was narrowed or completed and WHERE the final form lands. Everything else is byte-exact from
-- the canonical sections (0042-sections/s0,s1,s2,s3,s5,s6), comments included.
--
-- DESIGN OF RECORD (unchanged): docs/plan/wave-d-b-design.md v8 [WDB-G1..G16] +
-- docs/plan/wave-d-b-design-abi.md (the builder ABI). Governing law above the design:
-- docs/plan/wave-d-contract.md (WD-R1..WD-R15, ADR-055); docs/prd/PRD.md SS6 (LAW) always.
-- The staff-advance family's statutory ground is
-- docs/plan/research/wave-d/staff-advance-research-2026-08-01.md (EA 1955, verified).
--
-- ROLE SCOPING IS PER-FILE AND PER-BLOCK (census hazard sect.7.4). In the whole unit SECTION S2
-- opened `set role clara_fn_owner` at its L39 and NEVER reset, and SECTION S3 then relied on that
-- INHERITED role for its first 2,650 lines -- the exact coupling that breaks the instant the
-- sections are split across migrations. Every section file of this slice OPENS AND CLOSES ITS
-- OWN scopes, and the assembler asserts the balance per file rather than trusting it.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law); the frontier probe below pins
-- 0042_wave_d_b0_shared_authorities as the applied predecessor -- not 0041, because this slice
-- COMPLETES bodies D-b0 created and would silently CREATE them if D-b0 were missing.
--
-- THE `0042` IN EVERY MESSAGE BELOW IS THE WAVE TAG, NOT THIS FILE'S NUMBER, and it is kept that
-- way ON PURPOSE (D-b0's convention, followed here rather than diverged from). All four slices
-- are the content of ONE authored unit -- Wave D-b, migration 0042 as designed -- and the tail
-- blocks, the S5 splice censuses and the S3 prestates are cut BYTE-EXACT from that unit's own
-- sections, every one of them raising '0042 tail N'/'0042 S5.x'. Renumbering the strings this
-- slice authors to 0043 while the cut ones still said 0042 would make one file speak with two
-- voices about which migration it is. The SLICE is identified by its own discriminator instead --
-- `D-b1`, `S5.8-b1`, `S5.9-b1`, `(D-b1 slice)` -- which is what a reader greps for when a census
-- fails. The FILE NUMBER lives in the filename and in clara.schema_migrations, and is claimed at
-- merge like every other.

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
  -- [SPLIT D-b1 2026-08-04] THE FRONTIER IS D-b0, NOT 0041. The whole unit pinned
  -- 0041_wave_d_a_fa_register because it was the applied predecessor of the ONE file; this slice's
  -- predecessor is the slice before it in the ship order, and the dependency is REAL rather than
  -- ceremonial: SECTION S2 below RE-CREATES clara._acct_role_reserved and SECTION S5 RE-CREATES
  -- clara._acct_role_reserved_at, both with `create or replace` (they must exist, in D-b0's
  -- FA-only shell form, for this slice to complete them), SECTION S3 calls clara._book_today,
  -- clara._wdb_correction_posting_date and clara._fa_status_holds_account_role, and S5.9-b1's
  -- splice is anchored on the body D-b0 left behind. Applying this file onto a bare 0041 would
  -- CREATE the two authorities instead of completing them -- silently, and in the wrong slice's
  -- shape. 0041 is not re-asserted here: D-b0's own frontier probe pinned it, and
  -- clara.schema_migrations is append-only, so 0042 present implies 0041 applied.
  select count(*)::int into v_n from clara.schema_migrations
    where version = '0042_wave_d_b0_shared_authorities';
  if v_n <> 1 then
    raise exception '0042 D-b1 probe 1: migration 0042_wave_d_b0_shared_authorities is not recorded as applied -- the D-b slices ship in the order D-b0 -> D-b1 -> D-b3 -> D-b2 and this one COMPLETES authorities D-b0 creates; apply in order';
  end if;

  -- PROBE 2 -- PRE-STATE SAFETY: none of the FOUR relations this file creates already exist
  -- (ABI SSD.4/D.5/D.6/D.7).
  -- [SPLIT D-b1 2026-08-04] NARROWED TO THIS SLICE'S OWN FOUR. The whole-unit probe 2 lists all seven new
  -- relations; clara.adjustment_templates / clara.adjustment_runs /
  -- clara.adjustment_pair_reversals are D-b2's and are probed by D-b2 beside their own DDL
  -- (census sect.4: "each keeps only its own relations/columns/indexes/event names").
  -- THE NINETEEN D-b1 INDEXES ARE COVERED BY THIS PROBE AND NEED NO SEPARATE ONE, stated rather
  -- than assumed: every one of them -- the three pkeys, ea1955_policy_pkey, the three
  -- uq_*_id_firm_client, uq_staff_advance_accounts_active, ix_staff_advance_accounts_interval,
  -- ix_staff_advance_accounts_client, uq_staff_advances_disbursement_line,
  -- ix_staff_advances_enrolment, ix_staff_advances_client, ix_staff_advances_entry,
  -- uq_staff_advance_applications_line_advance, ix_staff_advance_applications_advance,
  -- ix_staff_advance_applications_enrolment, ix_staff_advance_applications_reverses and
  -- ix_staff_advance_applications_entry (the last two of those being tail 21's subjects) -- is
  -- created INSIDE SS1.4/SS1.5/SS1.6 on a table this probe has just proved absent, so an index
  -- that pre-existed would require a table that pre-existed. The whole unit's probe 4 lists four
  -- indexes and NONE of them is this slice's (two are D-b2's hot-loop partials, one is D-b0's
  -- pair-linkage unique -- already shipped -- and one is D-b2's pair-correction lookup), which is
  -- why no narrowed copy of it appears here.
  -- FINAL FORM: the whole-unit probes 2 and 4, reassembled across the four slices.
  select count(*)::int, string_agg(t.relname, ', ' order by t.relname) into v_n, v_names
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname in
    ('staff_advance_accounts', 'staff_advances', 'staff_advance_applications',
     'ea1955_policy');
  if v_n <> 0 then
    raise exception '0042 D-b1 probe 2: % relation(s) already exist in schema clara that this migration is about to create (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_n, v_names;
  end if;

  -- [SPLIT D-b1 2026-08-04] PROBES 3, 5, 6, 12 AND 13 ARE NOT IN THIS SLICE, AND EACH IS NARROWED OR
  -- RECORDED RATHER THAN SILENTLY DROPPED (split-dependency census sect.8: "drop the
  -- relation/column/index/event negative probes for the other slices' objects").
  --   * 3 (the three new columns) -- clara.journal_entries.auto_reversal_of shipped in D-b0
  --     (SS1.10, census sect.4 Option A) and the two clara.bank_matches columns are D-b3's. This
  --     slice adds NO column to any pre-existing table.
  --   * 5 (the two event names) -- adjustment.posted is D-b2's and bank.line_exception_reopened
  --     is D-b3's; this slice registers no event at all, which is also why tail 20 arm (d) is
  --     deferred rather than asserted vacuously.
  --   * 6 (the complete created-function census) -- its list is the WHOLE unit's set of 56 names.
  --     A slice-local copy would enumerate this slice's 24 new bodies (SECTION S3's twenty plus
  --     SS1.4/SS1.5/SS1.6's three trigger functions plus clara._wdb_reversal_blocked -- MEASURED
  --     on the rig, not counted off the census, whose sect.1g files clara._wdb_reversal_blocked
  --     inside D-b2's 42 because that is the section it was authored in), and every
  --     one of them is created with `create function`, never `create or replace`, so a duplicate
  --     re-apply fails at the CREATE with Postgres's own duplicate-function error -- and, before
  --     that, at probe 2 above, since this slice's four relations would already exist. The TWO
  --     bodies this file writes with `create or replace` (clara._acct_role_reserved,
  --     clara._acct_role_reserved_at) are deliberately OUT of any such list for the same reason
  --     the whole-unit probe 6 excludes the four bodies 0042 RECUTS rather than creates: they
  --     MUST already exist, and probe 7 below asserts exactly that.
  --     RECORDED, NOT REPAIRED (carried forward from D-b0's identical finding, census errata E4):
  --     the whole-unit probe 6 documents itself as "the COMPLETE as-built set of names this file
  --     CREATES" and clara._assert_due_read_ctx is missing from it. That is a whole-unit debt, and
  --     a slice must not repair a list it does not ship; the fix belongs to D-b2's final form.
  --   * 12 (the fixed_assets NULL cost_cents prestate) -- D-b0's, and already SPENT: D-b0 set that
  --     column NOT NULL, so the same query is now trivially zero and would be a probe that cannot
  --     fail. Its post-state is D-b0's tail 16.
  --   * 13 (the clara.bank_line_exceptions resolution columns) -- the SS4 reopen arm is D-b3's.
  -- FINAL FORM: the whole-unit 13-probe block, reassembled across the four slices.

  -- PROBE 7 -- ANCHOR: every live body SECTION S5 splices or factors is present at its EXACT
  -- signature. A missing one here is a far better error than a regprocedure cast failing
  -- mid-splice.
  -- [SPLIT D-b1 2026-08-04] NARROWED TO THIS SLICE'S OWN SPLICE/FACTOR SUBJECTS, AND WIDENED BY THE SIX
  -- ANCHORS THE SPLIT ITSELF CREATED.
  --   NARROWED: the eleven bank-domain entries and clara._tf_bank_* belong to SECTION S4 (D-b3),
  --   and census hazard sect.7.3 is explicit that no other slice may splice them;
  --   clara.revise_entry, clara.withdraw_draft and clara._hash are D-b2's (S5.10/S5.10a/S5.11 and
  --   the template content hash); clara.set_client_fy_end, clara._fa_assert_code_unreserved,
  --   clara._fa_asset_json, clara._draft_opening_item_core, clara.dispose_fixed_asset,
  --   clara.revise_fixed_asset_particulars and clara.approve_opening_correction were D-b0's
  --   subjects and are not touched here. A slice must not claim an anchor it never uses.
  --   WIDENED, and this is a DEVIATION FROM THE CANONICAL ARRAY, named rather than smuggled: the
  --   six entries marked [SPLIT-CREATED] below are dependencies the SPLIT invented and the whole
  --   unit could not have carried, because in one file these bodies were created a few thousand
  --   lines above their use. Two of them this file RE-CREATES with `create or replace` -- an
  --   idiom that CREATES silently when the target is absent, which is the precise failure probe 6
  --   exists to prevent, inverted -- and four are D-b0 bodies SECTION S3 and S5.19 call. The
  --   precedent for stating a split-created dependency in the slice that has it is errata E1
  --   (D-b0's S5.9-b0 shipped an idempotency probe keyed on a different term for the same
  --   reason); the alternative is a `create or replace` that quietly manufactures an FA-only
  --   authority nobody audited.
  --   RECORDED, NOT REPAIRED (D-b0's finding E3, carried): the census's phrase "the 25 S5
  --   target-signature probes (7)" is imprecise -- the whole-unit array holds 27 entries and does
  --   NOT enumerate every S5 subject. clara.fa_register_tie (S5.19) and
  --   clara.list_review_queue (S3.8) are two such omissions that fall in THIS slice; neither is
  --   added here, because each block carries its own prestate probe naming the body it splices,
  --   and adding a probe this slice's source never carried would be invention.
  -- FINAL FORM: the whole-unit 27-entry array, reassembled across the four slices.
  foreach v_names in array array[
      'clara._subledger_on_approve(uuid)',
      'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
      'clara._fa_on_approve(uuid)',
      'clara.reverse_entry(uuid,text,text)',
      'clara._reserve_op(uuid,text,text,bytea)',
      'clara._finish_op(uuid,text,text,jsonb)',
      -- [SPLIT-CREATED] the two D-b0 shells this slice COMPLETES with `create or replace`
      'clara._acct_role_reserved(uuid,text)',
      'clara._acct_role_reserved_at(uuid,text,timestamptz)',
      -- [SPLIT-CREATED] the FOUR D-b0 bodies this slice's SECTION S3 and S5.19 call
      'clara._wdb_correction_posting_date(uuid,date)',
      'clara._fa_gl_leg_foreign(uuid,text,uuid,timestamptz)',
      'clara._book_today()',
      'clara._fa_status_holds_account_role(text)'] loop
    if to_regprocedure(v_names) is null then
      raise exception '0042 D-b1 probe 7: % is not present at that exact signature -- SECTION S3/S5 cannot splice, factor or complete it', v_names;
    end if;
  end loop;

  -- [SPLIT D-b1 2026-08-04] PROBE 8 IS KEPT although this slice registers no event, for the reason D-b0
  -- kept it: clara.taxonomy_active holding exactly one row is a live-schema invariant that both
  -- later slices' event CTEs cross-join, and a slice that re-confirms it costs nothing and gives
  -- the split a regression floor at every step. It is an anchor, not a claim about this file's
  -- own writes.
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

  -- PROBE 9 -- ANCHOR: the tenancy anchors this file's composite FKs target.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'clara.clients'::regclass and conname = 'uq_clients_id_firm') then
    raise exception '0042 probe 9: clara.clients is missing uq_clients_id_firm -- the (client_id, firm_id) FK anchor';
  end if;
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'clara.coa_accounts'::regclass and c.contype in ('p','u')
                   and pg_get_constraintdef(c.oid) like '%(client_id, account_code)%') then
    raise exception '0042 probe 9b: clara.coa_accounts has no (client_id, account_code) unique/pk -- the enrolment FK anchor';
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

  raise notice '0042 D-b1 SECTION 0 probe OK (0/6): 0042_wave_d_b0_shared_authorities is the applied frontier; none of the four staff-advance/EA-1955 relations pre-exist; the ten splice/factor/completion subjects this slice touches (including the four the split itself created), the taxonomy singleton, both tenancy FK anchors, the four-caller census and the single _fa_on_approve splice anchor are all present in their expected shape.';
end
$probe$;

-- #####################################################################################
-- ####### SECTION S1 (D-b1 SLICE) -- DDL: SS1.4-SS1.7, THE STAFF-ADVANCE RELATIONS ####
-- #####################################################################################
-- [SPLIT D-b1 2026-08-04] THIS SLICE CARRIES FOUR OF SECTION S1's ELEVEN DDL BLOCKS, at their existing
-- SS1.x boundaries (census sect.4: "split s1 at its existing SS1.x boundaries -- already clean"):
--   SS1.1-SS1.3 (adjustment_templates / adjustment_runs / adjustment_pair_reversals
--                and their triggers, policies and grants)      -> D-b2
--   SS1.4-SS1.6 (staff_advance_accounts / staff_advances /
--                staff_advance_applications)                   -> HERE
--   SS1.7       (ea1955_policy + its three-row EA 1955 seed)    -> HERE
--   SS1.8       (the clara.bank_matches ALTERs + the set-once trigger) -> D-b3
--   SS1.9       (ix_je_adj_draft, ix_je_adj_occurrence)         -> D-b2
--   SS1.10      (auto_reversal_of + uq_je_auto_reversal_of)     -> ALREADY SHIPPED, D-b0
--   SS1.11      (ix_adj_pair_corrections)                       -> D-b2
--   SECTION EVENTS (adjustment.posted / bank.line_exception_reopened) -> D-b2 / D-b3
--
-- THE TWO entry_id INDEXES ARE ALREADY HERE, INSIDE THEIR OWN TABLES' BLOCKS -- they are not a
-- separate item to remember. Census sect.4 adjudicates them without ambiguity ("indexes on
-- D-b1's own tables; they cannot exist in a slice that doesn't create those tables"):
-- ix_staff_advances_entry is created inside SS1.5 and ix_staff_advance_applications_entry inside
-- SS1.6, exactly where the canonical section puts them, and tail 21 -- which this slice also
-- carries, pure -- is their post-state census.
--
-- NOTHING HERE IS A COLUMN ON A PRE-EXISTING TABLE. All four relations are new, so this slice
-- adds no ALTER to any live table and the whole unit's SS1.0 probes 3 (bank_matches columns),
-- 4 (the hot-loop partials) and 5 (the event names) have no D-b1 form; probes 6 and 7 (the
-- clara.bank_matches status CHECK and the clara.bank_line_exceptions primary key) anchor
-- SS1.8's FK and CHECK, which are D-b3's. What remains of SS1.0 for this slice is its probe 8
-- -- the two GENERIC guard functions this section's nine triggers reuse -- kept verbatim, plus
-- the relation pre-state, which SECTION 0 probe 2 above already made.
-- FINAL FORM: the whole-unit SS1.0 block and SS1.1-SS1.11, reassembled across the four slices.
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4): the probe runs as the plain migration
-- role, every CREATE inside an explicit `set role clara_fn_owner` scope this file opens and
-- closes.

-- #####################################################################################
-- ################## SS1.0 (D-b1 SLICE) -- THE PRE-DDL LIVE PROBES ####################
-- #####################################################################################

do $s1_probe$
declare
  v_anchor int;
begin
  -- PROBE 8 -- ANCHOR PROBE, positive: the generic guard functions this section's triggers
  -- reuse are present (clara._tf_no_truncate on all seven tables; clara._tf_append_only on
  -- staff_advance_applications' pure-append-only guard).
  select count(*)::int into v_anchor
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'clara' and p.proname in ('_tf_no_truncate', '_tf_append_only');
  if v_anchor <> 2 then
    raise exception '0042 SS1 probe 8: clara._tf_no_truncate / clara._tf_append_only are not both present -- the generic guard functions this section''s triggers reuse are missing';
  end if;

  raise notice '0042 D-b1 SS1 probe OK (0/1): clara._tf_no_truncate and clara._tf_append_only -- the generic guard functions this section''s nine triggers reuse -- are both present. (The four new relations were probed absent in SECTION 0 probe 2 above.)';
end
$s1_probe$;

set role clara_fn_owner;

-- =====================================================================================
-- SS1.4 -- clara.staff_advance_accounts (design SS3.1; ABI SSD.4; WDB-G6/G15). Clones
-- clara.fa_account_profiles' (0041:419-500) VERSION-FORWARD enrolment posture: no
-- update-transition guard at all (an enrolment row is freely UPDATEd -- the retire verb
-- flips active/retired_* under the CHECK's pairing law), only a no-delete + no-truncate
-- pair, RLS forced, select-only grant. [enrolled_at, retired_at] is the belt watermark
-- exactly as design SS3.4 restates for the tie's window-scoped GL side.
--
-- ABI SSD.4 WIDENS THE FA CLONE BY TWO COLUMNS the FA precedent does not carry:
-- created_op_key and retired_op_key (fa_account_profiles has neither -- it predates the
-- op-key-matrix idiom this design's SSA/SSE formalise). Both are included here VERBATIM
-- per ABI, over the "clone fa_account_profiles" instruction, because ABI SSD is authoritative
-- for columns (flagged to the orchestrator; see this lane's return).
--
-- enrolment_attestation IS explicitly "NOT NULL non-blank" in ABI SSD.4; person_label is
-- explicitly just "NOT NULL" (no non-blank check) -- the contrast is ABI's own, held here
-- literally rather than harmonised.
-- =====================================================================================
create table clara.staff_advance_accounts (
  id                    uuid        primary key default gen_random_uuid(),
  firm_id               uuid        not null,
  client_id             uuid        not null,
  account_code          text        not null,
  person_label          text        not null,
  enrolment_attestation text        not null check (btrim(enrolment_attestation) <> ''),
  active                boolean     not null default true,
  enrolled_at           timestamptz not null default now(),
  created_by            uuid        not null references clara.users(id),
  created_op_key        text        not null,
  retired_by            uuid        references clara.users(id),
  retired_at            timestamptz,
  retired_reason        text,
  retired_op_key        text,
  constraint fk_staff_advance_accounts_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_staff_advance_accounts_account foreign key (client_id, account_code)
    references clara.coa_accounts(client_id, account_code),
  -- active XOR retired-pair (ABI SSD.4); the pair also carries retired_op_key, since ABI
  -- groups all four retired_* columns together.
  constraint ck_staff_advance_accounts_retired check (
    (active and retired_by is null and retired_at is null and retired_reason is null
      and retired_op_key is null)
    or (not active and retired_by is not null and retired_at is not null
        and retired_reason is not null and btrim(retired_reason) <> ''
        and retired_op_key is not null)),
  constraint uq_staff_advance_accounts_id_firm_client unique (id, firm_id, client_id)
);
-- Re-enrolment mints a NEW row (version-forward, the 0041:456-460 precedent); a retired
-- same-code enrolment does NOT block re-enrolment (design SS3.1) -- the uniqueness is
-- scoped to the LIVE row only.
create unique index uq_staff_advance_accounts_active
  on clara.staff_advance_accounts (client_id, account_code) where active;
-- The belt/tie evaluate the INTERVAL (design SS3.4's window-scoped GL side), so this index
-- covers retired rows too, matching 0041:472-473's ix_fa_account_profiles_interval exactly.
create index ix_staff_advance_accounts_interval
  on clara.staff_advance_accounts (client_id, enrolled_at, retired_at);
create index ix_staff_advance_accounts_client on clara.staff_advance_accounts (client_id, active);

-- NO-DELETE ONLY (the 0041:481-492 `_tf_fa_profile_no_delete` clone, literal shape and
-- errcode family -- CLR37, "register identity": the D-a family this enrolment concept is
-- cloned from). No update-transition guard exists on the FA precedent either; the CHECK
-- above is the whole of the retire law.
create function clara._tf_staff_advance_account_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'a staff advance enrolment is retired, never deleted (retire_staff_advance_account)'
    using errcode = 'CLR37',
      detail = jsonb_build_object('reason', 'staff_advance_account_never_deleted', 'enrolment_id', old.id)::text;
end $$;
revoke all on function clara._tf_staff_advance_account_no_delete() from public;
create trigger t_staff_advance_accounts_no_delete before delete on clara.staff_advance_accounts
  for each row execute function clara._tf_staff_advance_account_no_delete();
create trigger t_staff_advance_accounts_no_truncate before truncate
  on clara.staff_advance_accounts for each statement execute function clara._tf_no_truncate();

alter table clara.staff_advance_accounts enable row level security;
alter table clara.staff_advance_accounts force row level security;
create policy p_staff_advance_accounts_owner on clara.staff_advance_accounts
  for all to clara_fn_owner using (true) with check (true);
create policy p_staff_advance_accounts_human on clara.staff_advance_accounts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.staff_advance_accounts to clara_authenticated;

-- =====================================================================================
-- SS1.5 -- clara.staff_advances (design SS3.2; ABI SSD.5). The disbursement register --
-- append-only with exactly TWO independent set-once column pairs (ABI SSD.5): {purpose,
-- reference} via `complete_staff_advance_particulars` (verb-only, refuses already-set --
-- CLR10 `particulars_already_set`, the ONE token ABI SSF pins for this table) and
-- {voided_by_entry_id, void_effective_date} via the reversal hook only. Every other
-- column, including enrolment_id, is immutable from INSERT -- an advance's enrolment
-- lineage never moves.
--
-- purpose/reference are asserted PAIRED (both null or both set together) since the one
-- verb that ever sets them always sets both in the same call; ABI SSD.5 lists them as
-- independent nullable columns but design SS3.2 names one verb, one call, one moment for
-- both -- this CHECK is an inferred strengthening, not a literal ABI line, flagged in this
-- lane's return.
-- =====================================================================================
create table clara.staff_advances (
  id                    uuid        primary key default gen_random_uuid(),
  firm_id               uuid        not null,
  client_id             uuid        not null,
  enrolment_id          uuid        not null,
  account_code          text        not null,
  disbursement_line_id  uuid        not null,
  entry_id              uuid        not null,
  issue_date            date        not null,
  amount_cents          bigint      not null check (amount_cents > 0),
  purpose               text,
  reference             text,
  voided_by_entry_id    uuid,
  void_effective_date   date,
  created_at            timestamptz not null default now(),
  constraint fk_staff_advances_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_staff_advances_enrolment foreign key (enrolment_id, firm_id, client_id)
    references clara.staff_advance_accounts(id, firm_id, client_id),
  constraint fk_staff_advances_account foreign key (client_id, account_code)
    references clara.coa_accounts(client_id, account_code),
  -- The 0041:326 precedent shape: journal_lines carries no (id, firm_id, client_id)
  -- congruence anchor anywhere in this schema, so this is necessarily a simple id FK.
  constraint fk_staff_advances_disbursement_line foreign key (disbursement_line_id)
    references clara.journal_lines(id),
  constraint fk_staff_advances_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_staff_advances_voided_entry foreign key (voided_by_entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint ck_staff_advances_particulars_pair check ((purpose is null) = (reference is null)),
  constraint ck_staff_advances_void_pair check ((voided_by_entry_id is null) = (void_effective_date is null)),
  constraint uq_staff_advances_id_firm_client unique (id, firm_id, client_id),
  constraint uq_staff_advances_disbursement_line unique (disbursement_line_id)
);
create index ix_staff_advances_enrolment on clara.staff_advances (enrolment_id, issue_date);
create index ix_staff_advances_client on clara.staff_advances (client_id, issue_date);
-- [round-7 E4, task #63, the D-a F10 class] entry_id carries an FK to journal_entries but
-- Postgres never auto-indexes the REFERENCING side of a foreign key, so every entry_id-keyed
-- read here was a sequential scan: clara._adv_net_applications and
-- clara._adv_reversal_blocked's row-lock statement both filter on it directly. MEASURED on a
-- 60,000-row synthetic population (packages/db/tests/x42-r7-s5-entry-indexes.test.mjs):
-- `where entry_id = $1` moved from a Seq Scan (~1225 buffer hits, Rows Removed by Filter:
-- 59999) to an Index Only Scan (~4 buffer hits) -- about a 300x reduction in buffer touches
-- for the identical answer.
create index ix_staff_advances_entry on clara.staff_advances (entry_id);

-- APPEND-ONLY WITH TWO SET-ONCE PAIRS. The whole-row-minus-settable comparison protects
-- every column a later migration might add (the 0041:566-568 fa_depreciation precedent's
-- reasoning, restated); each settable column then gets its OWN set-once test (old value
-- non-null and changing => refuse), so the two pairs are independently enforced even
-- though they share one function.
create function clara._tf_staff_advance_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_settable text[] := array['purpose', 'reference', 'voided_by_entry_id', 'void_effective_date'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a staff advance disbursement is voided, never deleted'
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'staff_advance_never_deleted', 'advance_id', old.id)::text;
  end if;
  if (to_jsonb(new) - v_settable) is distinct from (to_jsonb(old) - v_settable) then
    raise exception 'a staff advance disbursement is immutable outside its particulars/void set-once columns'
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'staff_advance_immutable', 'advance_id', old.id)::text;
  end if;
  -- SET-ONCE PAIR 1: {purpose, reference} -- complete_staff_advance_particulars, once ever.
  if old.purpose is not null and new.purpose is distinct from old.purpose then
    raise exception 'a staff advance''s purpose is set once, never revised'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'particulars_already_set', 'advance_id', old.id)::text;
  end if;
  if old.reference is not null and new.reference is distinct from old.reference then
    raise exception 'a staff advance''s reference is set once, never revised'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'particulars_already_set', 'advance_id', old.id)::text;
  end if;
  -- SET-ONCE PAIR 2: {voided_by_entry_id, void_effective_date} -- the reversal hook, once.
  if old.voided_by_entry_id is not null and new.voided_by_entry_id is distinct from old.voided_by_entry_id then
    raise exception 'a staff advance''s void stamp is set once, never revised'
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'staff_advance_void_already_set', 'advance_id', old.id)::text;
  end if;
  if old.void_effective_date is not null and new.void_effective_date is distinct from old.void_effective_date then
    raise exception 'a staff advance''s void effective date is set once, never revised'
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'staff_advance_void_already_set', 'advance_id', old.id)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_staff_advance_append_only() from public;
create trigger t_staff_advances_append_only before delete or update on clara.staff_advances
  for each row execute function clara._tf_staff_advance_append_only();
create trigger t_staff_advances_no_truncate before truncate
  on clara.staff_advances for each statement execute function clara._tf_no_truncate();

alter table clara.staff_advances enable row level security;
alter table clara.staff_advances force row level security;
create policy p_staff_advances_owner on clara.staff_advances
  for all to clara_fn_owner using (true) with check (true);
create policy p_staff_advances_human on clara.staff_advances
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.staff_advances to clara_authenticated;

-- =====================================================================================
-- SS1.6 -- clara.staff_advance_applications (design SS3.2; ABI SSD.6). PURE append-only:
-- no UPDATE at all (the generic clara._tf_append_only() precedent -- 0016's
-- sst_future_attestations/compliance_watch_events/compliance_eval_runs shape, reused
-- directly since this table needs no set-once carve-out). Corrections are HOOK-BORN ONLY
-- (design SS3.2) -- a fresh INSERT with kind='correction', never a revision of an existing
-- row.
--
-- reverses_application_id "must reference a non-correction row" (ABI SSD.6) cannot be
-- expressed as a plain CHECK (Postgres CHECK constraints cannot look at another row), so
-- it is enforced by a narrow BEFORE INSERT trigger -- the structural backstop for the
-- design SS7 acceptance cell "correction-of-correction refusal". ABI SSF does not pin a
-- literal errcode/reason for this specific site; CLR39 (the reversal/correction family --
-- correction_entry_irreversible lives here too) is this lane's judgment call, flagged in
-- this lane's return for reconciliation against the S2/S3 hook, which may enforce the same
-- law independently.
-- =====================================================================================
create table clara.staff_advance_applications (
  id                      uuid        primary key default gen_random_uuid(),
  firm_id                 uuid        not null,
  client_id               uuid        not null,
  advance_id              uuid        not null,
  enrolment_id            uuid        not null,
  application_line_id     uuid        not null,
  entry_id                uuid        not null,
  kind                    text        not null check (kind in
                              ('payroll_deduction', 'bank_return', 'claim', 'correction')),
  amount_cents            bigint      not null check (amount_cents > 0),
  effective_date          date        not null,
  reverses_application_id uuid,
  created_by              uuid        not null references clara.users(id),
  reason                  text,
  created_at              timestamptz not null default now(),
  constraint fk_staff_advance_applications_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_staff_advance_applications_advance foreign key (advance_id, firm_id, client_id)
    references clara.staff_advances(id, firm_id, client_id),
  constraint fk_staff_advance_applications_enrolment foreign key (enrolment_id, firm_id, client_id)
    references clara.staff_advance_accounts(id, firm_id, client_id),
  -- The 0041:326 simple-id-FK precedent, restated (journal_lines has no composite anchor).
  constraint fk_staff_advance_applications_application_line foreign key (application_line_id)
    references clara.journal_lines(id),
  constraint fk_staff_advance_applications_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint uq_staff_advance_applications_id_firm_client unique (id, firm_id, client_id),
  constraint fk_staff_advance_applications_reverses foreign key (reverses_application_id, firm_id, client_id)
    references clara.staff_advance_applications(id, firm_id, client_id),
  constraint ck_staff_advance_applications_self_reverse check (reverses_application_id is distinct from id),
  constraint uq_staff_advance_applications_line_advance unique (application_line_id, advance_id)
);
create index ix_staff_advance_applications_advance on clara.staff_advance_applications (advance_id, effective_date);
create index ix_staff_advance_applications_enrolment on clara.staff_advance_applications (enrolment_id, effective_date);
create index ix_staff_advance_applications_reverses on clara.staff_advance_applications (reverses_application_id)
  where reverses_application_id is not null;
-- [round-7 E4, task #63, the D-a F10 class -- the ix_staff_advances_entry header above states
-- the general reasoning in full] clara._adv_entry_carries_correction and the s2/s3 reversal
-- wall's own arm 1a loop (`for ap in select x.* from clara.staff_advance_applications x where
-- x.entry_id = o.id ...`) both filter on entry_id directly; the round-4 row-lock statement's
-- subquery does too. MEASURED on the same 60,000-row population: Seq Scan (~1579 buffer hits)
-- to Index Only Scan (~4 buffer hits).
create index ix_staff_advance_applications_entry on clara.staff_advance_applications (entry_id);

-- THE CORRECTION-OF-CORRECTION GUARD (BEFORE INSERT only -- UPDATE/DELETE are refused
-- unconditionally by the generic append-only trigger installed below, so this function
-- never needs to handle them).
create function clara._tf_staff_advance_application_correction_guard() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.reverses_application_id is not null and exists (
      select 1 from clara.staff_advance_applications a
       where a.id = new.reverses_application_id and a.kind = 'correction') then
    raise exception 'a staff advance application correction cannot itself be corrected'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'correction_of_correction_refused',
          'reverses_application_id', new.reverses_application_id)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_staff_advance_application_correction_guard() from public;
create trigger t_staff_advance_applications_correction_guard before insert
  on clara.staff_advance_applications
  for each row execute function clara._tf_staff_advance_application_correction_guard();
-- PURE append-only: the generic guard (0016 precedent), reused directly -- CLR08 "%
-- is append-only", not a bespoke D-b errcode.
create trigger t_staff_advance_applications_append_only before update or delete
  on clara.staff_advance_applications
  for each row execute function clara._tf_append_only();
create trigger t_staff_advance_applications_no_truncate before truncate
  on clara.staff_advance_applications for each statement execute function clara._tf_no_truncate();

alter table clara.staff_advance_applications enable row level security;
alter table clara.staff_advance_applications force row level security;
create policy p_staff_advance_applications_owner on clara.staff_advance_applications
  for all to clara_fn_owner using (true) with check (true);
create policy p_staff_advance_applications_human on clara.staff_advance_applications
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.staff_advance_applications to clara_authenticated;

-- =====================================================================================
-- SS1.7 -- clara.ea1955_policy (design SS3.4; ABI SSD.7). GLOBAL reference data -- the
-- 0016 system-reference idiom (clara.sst_threshold_schedule, 0016:237-248): no firm_id, no
-- client_id, PK (fact, effective_from), no-truncate only, writes ONLY by migrations (the
-- SECTION TAIL's own probe asserts no granted fn writes it -- this section makes that true
-- by granting SELECT alone, never INSERT/UPDATE/DELETE, to any app role).
--
-- WIDENED FROM THE 0016 PRECEDENT: 0016's system-reference tables carry no direct
-- clara_authenticated grant at all (read is RPC-mediated); ABI SSD.7 explicitly asks for a
-- direct `GRANT SELECT TO clara_authenticated`. Under FORCE ROW LEVEL SECURITY a grant
-- alone admits nothing without a matching policy, so this section adds a SECOND select
-- policy (`using (true)`, no firm predicate -- "global reference data") beside the owner
-- policy; ABI's prose names only "the OWNER policy" but the human-readable grant it also
-- asks for cannot function without one. Flagged in this lane's return.
-- =====================================================================================
create table clara.ea1955_policy (
  fact           text not null,
  effective_from date not null,
  effective_to   date,
  note           text not null check (btrim(note) <> ''),
  source_note    text not null check (btrim(source_note) <> ''),
  primary key (fact, effective_from),
  constraint ck_ea1955_policy_effective check (effective_to is null or effective_to >= effective_from)
);
create trigger t_ea1955_policy_no_truncate before truncate
  on clara.ea1955_policy for each statement execute function clara._tf_no_truncate();

alter table clara.ea1955_policy enable row level security;
alter table clara.ea1955_policy force row level security;
create policy p_ea1955_policy_owner on clara.ea1955_policy
  for all to clara_fn_owner using (true) with check (true);
create policy p_ea1955_policy_human on clara.ea1955_policy
  for select to clara_authenticated using (true);
grant select on clara.ea1955_policy to clara_authenticated;

-- THE THREE SEED ROWS (ABI SSD.7, verbatim). Effective from the research record's date;
-- no expiry stated.
insert into clara.ea1955_policy (fact, effective_from, effective_to, note, source_note) values
  ('s22_prior_month_wage_cap', '2026-08-01', null,
   'An advance of wages not yet earned may not exceed the wages earned in the immediately preceding month',
   'EA 1955 s.22 (primary text; research record 2026-08-01)'),
  ('s24_2c_interest_free_recovery', '2026-08-01', null,
   'Payroll-deduction recovery of a s.22 advance is lawful only if no interest is charged',
   'EA 1955 s.24(2)(c)'),
  ('s27_no_interest', '2026-08-01', null,
   'Interest on advances is prohibited',
   'EA 1955 s.27');

reset role;

-- #####################################################################################
-- ##### SECTION S2 (D-b1 SLICE) -- THE TWO CLASS AUTHORITIES THIS FAMILY OWNS #########
-- #####################################################################################
-- [SPLIT D-b1 2026-08-04] TWO FRAGMENTS OF THE ADJUSTMENT SECTION LAND HERE, and one of them is the
-- SECOND HALF OF A SPLIT AUTHORITY (census sect.2 Class B -- the one genuine three-family object
-- in the wave):
--   * clara._acct_role_reserved   (s2 L45-94)     -- RE-CREATED WITH ITS ADVANCE ARMS. D-b0
--     shipped the FA-only shell because the two disjuncts below read clara.staff_advance_accounts
--     and clara.staff_advances, which SECTION S1 of THIS file has just created. This is the
--     completion, and it is the ONLY resolution the census measured for Class B: an FA-only
--     intermediate form plus a second create in the slice that ships the advance tables.
--   * clara._wdb_reversal_blocked (s2 L4367-4455) -- created here, whole and byte-exact. Census
--     sect.4 Option A put clara.journal_entries.auto_reversal_of in D-b0 for exactly this: this
--     body reads ONLY that column plus clara._adv_reversal_blocked (SECTION S3 below), never an
--     adjustment table, so shipping it here resolves BOTH the D-b0 reverse_entry wall term (which
--     S5.9-b1 in this file installs) and the D-b3 clara._wdb_line_booking_block edge in one move.
-- WHAT STAYS IN D-b2: the other 35 s2 bodies. WHAT WENT TO D-b0: clara._assert_due_read_ctx,
-- clara._wdb_period_stamps, clara._wdb_correction_posting_date, clara._wdb_iso_date_supported,
-- clara._adj_line_eligibility_breach and clara._wdb_rerun_breach (FA-arm form). WHAT GOES TO
-- D-b3: clara._wdb_suggestion_rule_hit / clara._wdb_suggestion_lines.
--
-- ORDER INSIDE THIS SLICE IS LOAD-BEARING AND IS WHY THIS FILE SITS WHERE IT DOES:
-- clara._acct_role_reserved is `language sql`, so its body is PARSED AT CREATE TIME and both
-- advance tables must already exist -- SECTION S1 above. clara._wdb_reversal_blocked is plpgsql
-- and its call to clara._adv_reversal_blocked is a FORWARD REFERENCE BY DESIGN (resolved at
-- EXECUTION; the whole migration is one transaction), exactly as the canonical section says at
-- its own site -- so it may precede SECTION S3.
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4). In the whole unit s2 opened
-- `set role clara_fn_owner` at its L39 and NEVER reset -- s3 then relied on that role for its
-- first 2,650 lines. This slice opens its own scope and closes it at the end of the file, and
-- SECTION S3 below opens its own, so nothing inherits a role by accident.

set role clara_fn_owner;

-- =====================================================================================
-- S2.0 (D-b1 SLICE) -- THE SHARED READER, COMPLETED.
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
-- [SPLIT D-b1 2026-08-04] THIS IS THE COMPLETION OF D-b0's FA-ONLY SHELL, AND IT IS THE CANONICAL FULL
-- UNION FORM -- byte-exact from 0042-sections/s2-adjustments.sql L77-93, with ONE character
-- sequence changed: `create function` becomes `create or replace function`, because D-b0 already
-- created this body and PostgreSQL would otherwise refuse the duplicate. NOTHING ELSE MOVES: the
-- signature, the return shape (domain, role, owner_ref), the volatility, the security-definer
-- posture, the search_path and the FA disjunct are the same text D-b0 shipped, so every FA answer
-- this authority gave yesterday it gives today, and what is ADDED is the two advance disjuncts
-- the paragraph above ("THE ADVANCE ARM ADMITS RETIRED HISTORY") has always described. The
-- consumers that were reading the shell -- clara._fa_assert_code_unreserved (the bank belt),
-- clara._fa_role_claim_conflict, clara._adj_line_eligibility_breach,
-- clara.upsert_fa_account_profile, clara._draft_opening_item_core, clara._fa_reversal_blocked,
-- all D-b0's -- pick the new body up with no edit of their own, which is the whole point of
-- routing them through ONE authority. From this slice onward there IS advance enrolment for the
-- new arms to answer about, and tail 9(d) below asserts BOTH advance sources rather than the FA
-- half alone, which was the strongest claim D-b0 could honestly make.
-- `create or replace` on an ABSENT body would CREATE it silently, in this slice's shape, on a
-- database that never ran D-b0 -- so SECTION 0 probe 7 asserts the shell exists first.
-- THIS IS THE FINAL FORM (census sect.8's "L77-145 clara._acct_role_reserved re-created with the
-- advance arms"); D-b2 and D-b3 do not touch this body.
create or replace function clara._acct_role_reserved(p_client uuid, p_code text)
  returns table(domain text, role text, owner_ref text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select 'fa'::text, rr.fa_role, rr.owner_asset_code
    from clara._fa_reserved_roles(p_client) rr
   where p_client is not null and p_code is not null and rr.account_code = p_code
  union
  select 'staff_advance'::text, 'advance'::text, en.account_code
    from clara.staff_advance_accounts en
   where p_client is not null and p_code is not null
     and en.client_id = p_client and en.active and en.account_code = p_code
  union
  select 'staff_advance'::text, 'advance'::text, adv.account_code
    from clara.staff_advances adv
    join clara.staff_advance_accounts en2 on en2.id = adv.enrolment_id and en2.active
   where p_client is not null and p_code is not null
     and adv.client_id = p_client and adv.account_code = p_code $$;
revoke all on function clara._acct_role_reserved(uuid, text) from public;

-- =====================================================================================
-- S2.7 -- clara._wdb_reversal_blocked (design SS2.4 + SS3.3). THE BODY BEHIND
-- clara.reverse_entry's SEVENTH SPLICE (SECTION S5 installs the call, right after the
-- 0041 `perform clara._fa_reversal_blocked(p_entry);` wall).
--
-- IT IS A VERB-SIDE WALL AND NOTHING CALLS IT FROM AN APPROVE PATH. That is deliberate and
-- load-bearing: arm (a) refuses reversing EITHER half of an auto pair, and the sanctioned
-- remedy -- clara.reverse_adjustment_pair -- reverses both halves. If the approve hook also
-- ran this body, the pair machine would refuse its own remedy [L3/6]. clara._fa_on_approve's
-- arm (3) keeps calling clara._fa_reversal_blocked (the FA walls, which have no such
-- self-refusal), and nothing here changes that.
--
-- ITS OTHER READER IS A DIAGNOSIS, NOT A GATE (round 8). clara._adj_correction_door PERFORMs
-- this body inside an exception block purely to learn WHICH door admits an entry -- for the
-- re-run gate's remedy sentence and for the run receipt's `correctable`. That is a read path,
-- it authorises nothing, and it is the WDB-R2 shape: one wall, asked, rather than two bodies
-- with opinions about clara.reverse_entry's admission logic. The sentence above still holds
-- exactly as written -- no APPROVE path calls it.
--
-- Signature and return idiom cloned from clara._fa_reversal_blocked: void, STABLE, and it
-- returns silently on an entry that does not exist or is an opening balance (the K family
-- owns its own lifecycle).
--
-- [CROSS-SECTION EDIT by the s3-advances lane, round 4. Reported, not silent.] The sentence
-- above about no approve path calling this body remains TRUE OF THIS BODY -- but its two
-- ADVANCE arms are now owned by clara._adv_reversal_blocked (S3.0) and are additionally asked
-- by clara._adv_on_approve at the moment the register is actually written, because at or above
-- the high-stakes floor clara.reverse_entry only DRAFTS the mirror and everything decided here
-- would otherwise be trusted across that gap. Arm (a) is deliberately NOT in the shared body.
-- =====================================================================================
-- [SPLIT D-b1 2026-08-04] BYTE-EXACT FROM THE CANONICAL SECTION, INCLUDING ITS HEADER ARGUMENT. Nothing
-- in this body is narrowed: arm (a) reads clara.journal_entries.auto_reversal_of (D-b0's SS1.10)
-- and the delegated arms (b)+(c) call clara._adv_reversal_blocked, which SECTION S3 of THIS file
-- creates. The header's own "FORWARD REFERENCE, BY DESIGN" paragraph is therefore true of the
-- slice exactly as it was true of the unit -- with one correction, reported rather than silently
-- edited: it says "Section 0's probe 6 lists the new name", and this slice ships no probe 6 (see
-- SECTION 0's own [SPLIT D-b1] note on why a slice-local copy would add nothing that probe 2 and
-- the `create function` idiom do not already give).
-- ITS CONSUMERS: clara.reverse_entry gains the call at S5.9-b1 in THIS file, and D-b3's
-- clara._wdb_line_booking_block reaches it later. D-b2's clara._adj_correction_door PERFORMs it
-- inside an exception block as a diagnosis, not a gate -- that reader arrives with D-b2 and
-- changes nothing here.
create function clara._wdb_reversal_blocked(p_original uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare o record;
begin
  select * into o from clara.journal_entries where id = p_original;
  if not found or o.is_opening_balance then return; end if;

  -- (a) EITHER HALF OF AN AUTO PAIR (design SS2.4). An accrual and its auto-reversal are one
  -- act in two entries: reversing the occurrence alone would leave the mirror standing as a
  -- naked credit, and reversing the mirror alone would silently re-open an accrual the books
  -- have already released. Both directions are named -- the entry may BE a mirror
  -- (auto_reversal_of set) or HAVE one.
  if o.auto_reversal_of is not null then
    raise exception 'entry % is the auto-reversal half of a recurring adjustment and cannot be reversed on its own; correct the pair with clara.reverse_adjustment_pair', p_original
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'adjustment_pair_locked', 'entry_id', p_original,
          'half', 'reversal', 'occurrence_id', o.auto_reversal_of)::text;
  end if;
  if exists (select 1 from clara.journal_entries m where m.auto_reversal_of = p_original) then
    raise exception 'entry % is an accrual whose auto-reversal has already been booked; correct the pair with clara.reverse_adjustment_pair', p_original
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'adjustment_pair_locked', 'entry_id', p_original,
          'half', 'occurrence',
          'mirror_id', (select m.id from clara.journal_entries m
                         where m.auto_reversal_of = p_original))::text;
  end if;

  -- ---------------------------------------------------------------------------------
  -- (b) + (c) THE ADVANCE-SIDE WALL, DELEGATED TO ITS ONE OWNING BODY.
  --
  -- [CROSS-SECTION EDIT by the s3-advances lane, round 4. Reported, not silent.]
  --
  -- Arms (b) (a disbursement whose advances still carry net applications) and (c) (an entry
  -- carrying hook-born corrections) USED TO BE INLINED HERE, in a second copy of arithmetic
  -- that clara._adv_net_applications and clara._adv_entry_carries_correction already owned.
  -- That was survivable while this was the only asker. It stopped being survivable when the
  -- round-4 ladder measured that these two arms are asked at clara.reverse_entry -- which, at
  -- or above the firm's high-stakes floor, only DRAFTS the mirror -- while the register act
  -- they authorise happens later, at the checker's approve. clara._adv_on_approve's GUARD III
  -- now re-asks the SAME rule at that act, under that act's row locks; two copies of the rule
  -- would have been two chances for the courtesy and the authority to drift apart, which is
  -- the failure this whole ladder keeps finding.
  --
  -- SO THE RULE LIVES IN ONE BODY (clara._adv_reversal_blocked, S3.0) and both moments call
  -- it. Behaviour here is UNCHANGED to the character: same order (b) then (c), same messages,
  -- same CLR39, same {"reason"} tokens; the body adds an `axis` and a `moment` key so a
  -- surface can tell WHICH of the two moments refused without parsing English.
  --
  -- ARM (a) STAYS HERE and is NOT in the shared body -- it is the one arm that must remain
  -- verb-side, because clara.reverse_adjustment_pair is its sanctioned remedy and a hook that
  -- ran it would make the pair machine refuse its own remedy [L3/6].
  --
  -- FORWARD REFERENCE, BY DESIGN. Section 3 is assembled after section 2; plpgsql resolves
  -- callees at EXECUTION, and the whole migration runs in one transaction, so the callee
  -- exists long before anything can call this. Section 0's probe 6 lists the new name.
  -- ---------------------------------------------------------------------------------
  perform clara._adv_reversal_blocked(p_original, 'reverse_entry');
end $$;
revoke all on function clara._wdb_reversal_blocked(uuid) from public;

reset role;

-- #####################################################################################
-- ###### SECTION S3 (D-b1 SLICE) -- THE WHOLE SECTION, UNDER ITS OWN ROLE SCOPE #######
-- #####################################################################################
-- [SPLIT D-b1 2026-08-04] SECTION S3 MOVES AS A WHOLE FILE. Census sect.8: "s3 and s4 move as whole
-- files -- the two cleanest slices, which is what the r11 ruling (advances, AF-2/bank and FA
-- families are DRY) predicted and this census confirms." Every body below is byte-exact from
-- 0042-sections/s3-advances.sql, comments included; the ONLY additions this slice makes to it
-- are the two role statements named in the next paragraph and this header.
--
-- THE ONE THING THE SPLIT HAD TO CHANGE IS THE ROLE SCAFFOLDING (census hazard sect.7.4, the
-- single most easily missed break in the whole partition). In the assembled unit, SECTION S2
-- opened `set role clara_fn_owner` at its L39 and NEVER reset, and THIS SECTION relied on that
-- INHERITED role for its first 2,650 lines -- it opens a `set role` of its own only at S3.8, for
-- the clara.list_review_queue splice. Extracted into a slice whose S2 fragment closes its own
-- scope (as it must, or nothing downstream could reason about what role it runs as), those 2,650
-- lines would run as the plain migration role: every `create function` would land with the wrong
-- owner and every SECURITY DEFINER body would then execute as the wrong principal. So this file
-- opens ITS OWN scope immediately below and closes it immediately above S3.8's own scope, giving
-- two clean, non-overlapping regions instead of one inherited one.
--
-- THE SECTION'S OWN ASSEMBLY NOTE IS NOW STALE AND IS CORRECTED HERE RATHER THAN EDITED IN
-- PLACE, because the note is the section's own record of what it assumed: it reads "this section
-- runs inside the `set role clara_fn_owner` region section 1 opens", which was true of the
-- assembled unit and is FALSE of this slice -- SECTION S1 above closes its scope at the end of
-- its DDL, and this file opens its own. It also reads "It creates NO tables -- the six
-- advance-side relations ... belong to section 1"; that remains true, and in this slice section 1
-- is the FOUR-relation SS1.4-SS1.7 block of the same file.
--
-- WHAT THIS SECTION CARRIES, unchanged: S3.0's derived readers (including
-- clara._adv_reversal_blocked, the callee clara._wdb_reversal_blocked forward-references), S3.1
-- enrolment/retire (both fa-roles leaf doors), S3.2 particulars, S3.3 the authoritative
-- application guards + clara.book_staff_advance_application, S3.4 the approve hook
-- clara._adv_on_approve (which S5.8-b1 below splices into clara._subledger_on_approve), S3.5 the
-- deferred movement belt on clara.journal_entries, S3.6's three reads, S3.7's grant loop, S3.9's
-- named non-action, and S3.8's clara.list_review_queue splice with its own prestate/postcheck.
--
-- ITS D-b0 DEPENDENCIES, measured rather than assumed (all four asserted by SECTION 0 probe 7 or
-- created by D-b0's own S5 blocks): clara._book_today x3, clara._wdb_correction_posting_date x2
-- (clara._adv_release_one_way and clara._adv_reversal_admission -- census sect.2 Class A's
-- resolution), clara._acct_role_reserved x1 (the body SECTION S2 above has just completed) and
-- clara._fa_status_holds_account_role x1 (D-b0's S5.15 lifecycle gate). Its pre-D-b dependencies
-- are 0037's clara._reserve_op x5 / clara._finish_op x4 and clara._approve_entry_core x1 (inside
-- clara.book_staff_advance_application, never inside the hook -- tail 1(d) below asserts that
-- distinction, which is what bounds the recursion).
-- #####################################################################################
-- ########## SECTION S3 -- THE STAFF-ADVANCE FAMILY (design SS3; WD-R10, ADR-055) #####
-- #####################################################################################
-- The B-lite register: one immutable clara.staff_advances row per POSTED disbursement leg on
-- a per-person ENROLLED advance account, one append-only clara.staff_advance_applications row
-- per explicit allocation against it, and outstanding/age DERIVED at read time -- never
-- stored, never invented. The GL owns the money; the register owns WHO owes WHAT SINCE WHEN.
--
-- ASSEMBLY NOTE: this section runs inside the `set role clara_fn_owner` region section 1
-- opens. It creates NO tables -- the six advance-side relations are ABI SSD.4/D.5/D.6/D.7 and
-- belong to section 1; this file is functions, one constraint trigger, and the grant loop.
--
-- FOUR LAWS THIS WHOLE SECTION OBEYS, stated once here so no individual body has to argue:
--
--   1. NO EMPLOYEE COUNTERPARTY, EVER (WC-R10, WD-R10, design SS3 boundary). The subject
--      identity of an advance is the DEDICATED ACCOUNT ENROLMENT, never a clara.counterparties
--      row. Nothing in this section reads, writes or resolves a counterparty; the SAP-B1
--      employee-as-vendor shape is forbidden, and a staff master is Wave F's mapping (contract
--      SS5 debt 2). person_label is a LABEL ON THE ACCOUNT, not a person record.
--
--   2. CORRECTIONS ARE HOOK-BORN ONLY (design SS3.2). kind='correction' rows exist solely
--      because clara._adv_on_approve arm (1) minted them when a reversal mirror was approved.
--      There is NO public correction verb and none may ever be added: a correction that a
--      human could type is a correction that can disagree with the GL movement that caused it.
--
--   3. NOTHING IS EXCLUDED BY FLAG (design SS3.2). The outstanding equation reads EVERY row
--      that is effective at the as-of date. An application that was later reversed still
--      stands at every as-of before the reversal, because it really did stand in the books
--      until then; the UNWIND is the correction row, dated at the reversal ACT. There is no
--      is_live column here and no "skip the reversed ones" predicate anywhere.
--
--   4. THE DB OWNS EVERY NUMBER (PRD F-law). outstanding, age, the tie and the statement's
--      running balance are all computed here, in SQL, from rows. No caller ever supplies one.
--
-- REFUSAL TOKENS are ABI SSF verbatim (enrolment_balance_nonzero, advance_outstanding_on_retire,
-- particulars_already_set, advance_over_application, application_predates_advance,
-- advance_application_missing, advance_movement_unregistered). Pure argument-shape refusals
-- ride the house CLR10 + reason idiom (the 0038 `adjustments_malformed` precedent).
--
-- ONE TOKEN IS AN AS-BUILT ADDITION TO SSF, named here rather than discovered later:
-- `advance_reversal_predates_movement` (CLR39, hook arm (1); axes void_predates_issue /
-- correction_predates_application) -- the refusal that keeps a reversal mirror, which
-- clara.reverse_entry always dates at TODAY (MYT), from unwinding a FUTURE-DATED fact and
-- producing an as-of outstanding with no meaning. It is a distinct token rather than a reuse
-- because the house rule is one token per (defect, REMEDY) pair and this remedy is its own:
-- WAIT FOR THE MOVEMENT'S OWN DATE (reverse_entry takes no date argument, so the calendar is
-- the whole remedy -- the refusal carries `reversible_on` and says so in as many words, rather
-- than instructing the caller to do something no verb can do [round-2 fix]).
-- `advance_movement_unregistered` is REUSED, not
-- widened, for arm (1)'s retired-enrolment refusal (axis enrolment_closed) -- same defect, same
-- remedy shape (make the register able to hold the movement), so SSF's row for it now reads
-- "the belt + hook arm (1)". Both are argued at their sites in S3.4/S3.5.
-- It is reused ONCE MORE, for the same reason, by the round-3 hook GUARD 0 (axis
-- `enrolment_closed_mid_approval`, remedy `retry_the_approval`): an approval that began before
-- a `retire_staff_advance_account` committed would otherwise land its movement on a generation
-- that is already closed -- the register cannot hold it and the retirement's own outstanding
-- check can never look again. Argued in full at clara._adv_window_closed_under (S3.0).

-- [SPLIT D-b1 2026-08-04] THIS SCOPE IS THE SPLIT'S OWN ADDITION (see the header). It closes immediately
-- above S3.8's own `set role`, so the two regions never nest.
set role clara_fn_owner;

-- =====================================================================================
-- S3.0 -- THE DERIVED READERS. Every one of them is STABLE and lock-free; they are the ONLY
-- place the outstanding arithmetic is written, so the verb, the hook, the belt, the three
-- reads and the tie can never drift into two different answers to the same question (the
-- 0041 _fa_reserved_roles / _fa_included_at "one predicate over both worlds" doctrine).
-- =====================================================================================

-- THE ENROLMENT GENERATION IN FORCE AT AN INSTANT (design SS3.3 watermark). An enrolment
-- interval is an immutable historical fact evaluated at the entry's approved_at, exactly as
-- 0041's FA belt evaluates fa_account_profiles [0041 round-3 fold F5a]: the interval is CLOSED
-- at BOTH ends on purpose, because now() is transaction-constant, so a same-transaction retire
-- stamps retired_at EQUAL to approved_at -- and a half-open bound would hand that race to the
-- retirer, letting a GL movement commit with no register act and no way to say why.
--
-- Windows on one (client, code) cannot overlap except at that shared instant (the partial
-- unique index on active + the active/retired CHECK), so `order by enrolled_at desc limit 1`
-- picks the NEWEST generation, which is the honest owner of a boundary-instant movement.
--
-- ---------------------------------------------------------------------------------
-- AN APPROVAL IS AN INTERVAL, NOT AN INSTANT [as-built ladder round 2 fix; cells x42v.w1/w2].
--
-- THE DEFECT THIS CLOSES. `journal_entries.approved_at` is stamped `now()` -- the approving
-- TRANSACTION'S START, not the moment of the act -- and a transaction-start timestamp is
-- never a visibility boundary (the standing house lesson; the same family as the 0037 op-key
-- and 0041 lineage findings). So an approve whose transaction BEGAN at 10:05 and ran the
-- approve statement at 10:07 stamps 10:05, and an enrolment made and COMMITTED at 10:06 --
-- fully visible to that approve, and unambiguously earlier than the act -- scored the
-- movement OUT of its own window. Measured, twice, on the shipped build: the belt's join
-- skipped the leg, arm (3) did not soft-birth, the GL carried 100,000 on a code the register
-- held nothing for, `retire_staff_advance_account` then succeeded against that live balance,
-- and staff_advance_tie reported `explained: true` with the whole 100,000 filed under
-- out_of_window_cents. ENROL-CLEAN-ONLY -- the guarantee that a register born at the
-- watermark can hold everything that follows it -- was voided SILENTLY.
--
-- THE INSTRUMENT. The one thing an approving transaction can measure honestly is what it can
-- SEE: an enrolment row visible to it committed before the act, whatever the two clocks say.
-- So the act is treated as the interval [approved_at, clock_timestamp()] -- from the stamp to
-- the real time of the question -- and the two bounds are evaluated with the end that keeps
-- the movement INSIDE the window, in BOTH directions:
--   * the LOWER bound (enrolment) is tested against the CEILING, so an enrolment that
--     committed after this transaction started but before it acted is honoured;
--   * the UPPER bound (retirement) is tested against the STAMP, so a retirement that
--     committed in that same band does NOT steal the movement -- which is the very ruling
--     the closed-at-both-ends paragraph above already made against the retirer.
-- `clock_timestamp()` collapses to `p_at` for any historical read (`p_at < now()`), so a
-- read of the past is bit-for-bit what it was; the ceiling only opens inside the transaction
-- that stamped the approval, which is exactly the band where a timestamp compare is meaningless.
--
-- STRICTLY WIDENING, AND THE ORDER SAYS SO. `enrolled_at <= p_at` implies
-- `enrolled_at <= ceiling`, so the new reader returns the OLD answer wherever the old answer
-- existed and only fills in the band where it was NULL -- and the first ORDER BY key prefers a
-- generation already in force AT THE STAMP, so a boundary-instant movement is still attributed
-- to the generation that owned it rather than to the one that opened a microsecond later.
--
-- ONE PREDICATE, THREE INSTRUMENTS. The S3.5 belt and the S3.6 tie both call THIS function
-- rather than re-inlining the interval, so the hook, the belt and the tie cannot answer the
-- same question two ways (the S3.0 doctrine). The tie -- which reads long after the fact and
-- can only see the stamp -- carries the matching as-built widening at its own site: a GL leg
-- the register DEMONSTRABLY acted on is in-window by positive evidence, whatever the stamp says.
--
-- ---------------------------------------------------------------------------------
-- AN ACTIVE GENERATION ALWAYS BEATS A RETIRED ONE [as-built ladder round 3; cell x42v.w6].
-- Two generations can BOTH qualify only where the widened lower bound admits one that opened
-- after the stamp -- i.e. only inside the live band (and, degenerately, at the exact boundary
-- instant, where the old key order already picked the newer one). In that band the round-2 key
-- `(p_at >= enrolled_at) desc` preferred the generation in force AT THE STAMP, which is the
-- RETIRED one: a code retired and re-enrolled while an approval was in flight bound its
-- movement to the CLOSED generation. Asking for the live one first is the honest answer -- the
-- act happened when the new generation was already in force -- and it is what keeps the
-- window-closed gate below from firing on a lawful retire-then-re-enrol.
-- ---------------------------------------------------------------------------------
create function clara._adv_enrolment_at(p_client uuid, p_code text, p_at timestamptz)
  returns uuid
  language sql volatile security definer set search_path = clara, pg_temp as $$
  select en.id from clara.staff_advance_accounts en
   where en.client_id = p_client and en.account_code = p_code
     and en.enrolled_at <= (case when coalesce(p_at, now()) >= now()
                                 then clock_timestamp() else p_at end)
     and (en.retired_at is null or coalesce(p_at, now()) <= en.retired_at)
   order by (en.retired_at is null) desc,
            (coalesce(p_at, now()) >= en.enrolled_at) desc, en.enrolled_at desc, en.id
   limit 1 $$;
revoke all on function clara._adv_enrolment_at(uuid, text, timestamptz) from public;

-- ---------------------------------------------------------------------------------
-- DID THE ENROLMENT WINDOW CLOSE **UNDER** THIS ACT? [as-built ladder round 3 fix; cells
-- x42v.w6a..w6e]. THE SECOND HALF OF THE WATERMARK RULING, AND THE DIRECTION ROUND 2 LEFT OPEN.
--
-- THE DEFECT, MEASURED ON THE SHIPPED BUILD. Round 2 made the LOWER bound honest (an enrolment
-- that committed before the act counts) but deliberately left the UPPER bound on the stamp,
-- arguing that clock-correcting it "would hand the boundary to the retirer". The cost of that
-- choice: an approving transaction that BEGAN at 10:05, while a `retire_staff_advance_account`
-- committed at 10:06 and the approve statement actually ran at 10:07, still scored the movement
-- INSIDE the closed generation -- so arm (3) SOFT-BIRTHED a 100,000 register row onto an
-- ALREADY-RETIRED enrolment. `retire_staff_advance_account`'s `advance_outstanding_on_retire`
-- guard had looked, honestly, and the row did not exist yet; it can never look again. The money
-- was then stranded behind three refusals (probed: `book_staff_advance_application` -> CLR39
-- not-enrolled; `enrol_staff_advance_account` -> CLR10 enrolment_balance_nonzero on the live
-- 100,000; `reverse_entry` -> CLR40 enrolment_closed). BOTH directions of that boundary can
-- strand money, which is exactly what re-opens the round-2 adjudication.
--
-- WHICH WAY THE BOUNDARY NOW FALLS, AND WHY -- SAY IT PLAINLY:
--   A RETIREMENT THAT IS COMMITTED AND VISIBLE, AND STAMPED AT OR AFTER THIS APPROVAL'S OWN
--   STAMP, WINS. The act is not re-dated and the movement is not silently re-filed: THE ACT IS
--   REFUSED (S3.4 GUARD 0), and the caller retries.
-- The asymmetry with the lower bound is not a preference, it is an evidence asymmetry. The
-- RETIRER's guard ran at a moment when the approval had not yet acted and cannot be re-run; the
-- APPROVER's act has not committed yet and can still be re-made against a world it can see
-- whole. So the side that can still change its mind is the side that yields.
--
-- WHY REFUSE RATHER THAN QUIETLY SCORE IT OUT-OF-WINDOW. Scoring it out silently would be
-- defensible -- a retired code's movement rides `out_of_window_cents` by design (SS3.4) -- but
-- only the STAMP survives the transaction, and every later instrument reads the stamp: the tie
-- and a belt re-fire (an UPDATE on an approved entry re-runs the deferred trigger) would both
-- read `approved_at <= retired_at` and put the leg back IN the window, then find no register
-- act behind it. Refusing is the one answer that needs no instrument to remember a decision it
-- cannot reconstruct -- so THE BELT, `_adv_enrolment_at`, THE TIE AND THE RETIRE GUARD ALL
-- AGREE, by construction, because the state they would have disagreed about can no longer be
-- created. None of the three needed a line changed.
--
-- THE REMEDY IS EXECUTABLE AND SELF-HEALING, which is why a refusal is affordable here: the
-- approval rolled back, so the entry is still a DRAFT at its original revision token and the
-- op-key reservation is gone with it. Retrying in a fresh transaction stamps `approved_at`
-- after `retired_at`, `_adv_enrolment_at` returns NULL, and the movement posts as an ordinary
-- entry outside every window (the tie reports it under out_of_window_cents). Re-enrolling first
-- instead makes it a register act on the NEW generation. Both endings are pinned by cells.
--
-- IT IS BUILT ON `_adv_enrolment_at`, NOT BESIDE IT. The band is "the generation this act would
-- be attributed to is already retired", so the only honest way to ask it is to ask the SAME
-- reader which generation that is. A re-derived interval here would be a fourth reading of one
-- window, which is the drift the S3.0 doctrine exists to prevent.
-- ---------------------------------------------------------------------------------
create function clara._adv_window_closed_under(p_client uuid, p_code text, p_at timestamptz)
  returns uuid
  language sql volatile security definer set search_path = clara, pg_temp as $$
  select en.id from clara.staff_advance_accounts en
   where en.id = clara._adv_enrolment_at(p_client, p_code, p_at)
     -- ONLY A LIVE ACT. `p_at >= now()` is true exactly when the stamp is this transaction's
     -- own (approved_at is `now()`), which is the only band in which a timestamp compare is
     -- meaningless -- the same discriminator the reader above uses for its lower bound. A
     -- historical read (the tie; a belt re-fire on an already-approved entry) is never touched.
     and coalesce(p_at, now()) >= now()
     -- ...AND THE GENERATION IN FORCE IS ALREADY RETIRED, visibly, by an act stamped at or after
     -- our own start. (The second test is implied by the reader's upper bound; it is written
     -- out so the band this gate covers is readable at the site rather than inferred.)
     and en.retired_at is not null
     and en.retired_at >= coalesce(p_at, now()) $$;
revoke all on function clara._adv_window_closed_under(uuid, text, timestamptz) from public;

-- ---------------------------------------------------------------------------------
-- THE OUTSTANDING EQUATION (design SS3.2), written ONCE:
--
--   outstanding(advance, as_of) = (amount_cents if issue_date <= as_of else 0)
--                               - SUM(application effects with effective_date <= as_of)
--                               - (amount_cents if void_effective_date <= as_of)
--
-- An application EFFECT is +amount for the three real kinds (payroll_deduction, bank_return,
-- claim -- each of them discharges the advance) and -amount for a hook-born CORRECTION, which
-- gives the discharge back. That single sign rule is why nothing here needs a "reversed"
-- filter: the original row persists at every later as-of and the correction, dated at the
-- reversal act, unwinds it from that date forward. Law 3 of the section header, in arithmetic.
--
-- NO STORED OUTSTANDING. There is deliberately no column: a stored balance is a number that
-- can disagree with its own history, and the whole point of WD-R10's register over
-- convention-only bookkeeping is that "who owes what since when" is derivable from rows.
--
-- 'infinity'::date is a lawful as-of and means "after every recorded fact" -- the retire
-- guard uses it (see clara.retire_staff_advance_account).
-- ---------------------------------------------------------------------------------
create function clara._adv_outstanding(p_advance uuid, p_as_of date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select ((case when a.issue_date <= p_as_of then a.amount_cents else 0 end)
        - coalesce((select sum(case when ap.kind = 'correction' then -ap.amount_cents
                                    else ap.amount_cents end)
                      from clara.staff_advance_applications ap
                     where ap.advance_id = a.id and ap.effective_date <= p_as_of), 0)
        - (case when a.void_effective_date is not null and a.void_effective_date <= p_as_of
                then a.amount_cents else 0 end))::bigint
    from clara.staff_advances a where a.id = p_advance $$;
revoke all on function clara._adv_outstanding(uuid, date) from public;

-- ---------------------------------------------------------------------------------
-- THE TEMPORAL CAP, IN ONE BODY [as-built ladder round 8 fix, lane M3; cells x42.r8s-c1..c3].
-- Design SS3.3's "an advance can never be over-applied at any date", written ONCE and asked
-- from BOTH the place that ENFORCES it (clara._adv_assert_proposal arm (iii), which raises
-- CLR39 advance_over_application) and the place that PREDICTS it (S4.6A's release report, which
-- has to tell a human whether re-booking a released advance repayment AT THE LINE'S OWN DATE
-- will be admitted at all).
--
-- WHY IT EXISTS AS A SEPARATE BODY -- MEASURED, not anticipated. The round-8 seam lens drove the
-- whole chain: an AF-2 booking carrying a staff-advance application was released through the
-- block report's OWN named remedy (clara.reverse_entry), and the line was then un-bookable at
-- EVERY date -- at its own date this cap refused (the correction is dated at the mirror, so the
-- historic outstanding never came back), and at every date the cap allowed, the bank period gate
-- refused. The report had promised a remedy whose end state it had never asked anybody about.
-- A hand-rolled second copy of this arithmetic inside the report would have been the same class
-- of defect one round later, which is why the arm's own walk moved here rather than being
-- duplicated (the `_acct_role_reserved` / `_adv_enrolment_admission` pattern, third use).
--
-- WHAT IT ANSWERS: "if `p_proposed` cents were applied against this advance with effective date
-- `p_from`, would the SS3.2 outstanding equation go negative at `p_from` or at ANY later
-- boundary?" NULL means admitted. A non-null answer IS the raise's detail body -- the enforcing
-- caller adds only `reason` and its own `entry_id` -- so the arithmetic a refusal reports and
-- the arithmetic a report predicts are the same bytes, never two readings of one rule.
--
-- THE BOUNDARY SET IS THE ARM'S OWN, unchanged: `p_from` itself, every application effective at
-- or after it (a later CORRECTION is a boundary too -- it gives a discharge BACK), and a void
-- effective at or after it. The FIRST breaching boundary in date order is what is reported,
-- which is exactly what the arm always did (`order by t.bd`, raise on the first).
--
-- A ZERO OR NULL PROPOSAL IS ADMITTED WITHOUT A WALK, and that is not laziness: the arm only
-- ever groups POSITIVE allocations (its own shape guard refuses `amount_cents <= 0`), so a zero
-- can only arrive from the predictive caller asking about an entry that applied nothing -- and
-- "nothing over-applies nothing" is the honest answer, not a boundary scan.
--
-- THE PENDING CREDIT: THE ONE THING A PREDICTION KNOWS THAT THE TABLES DO NOT YET.
-- `p_pending_cents` / `p_pending_from` state "a correction of this size WILL become effective on
-- this date", and they exist because the first cut of the predictive caller got this wrong in a
-- way its own off-path cell caught. That cut measured the cap against TODAY'S rows and argued the
-- answer was invariant across the release, on the ground that a correction dated at the mirror
-- cannot change the outstanding at an EARLIER date. True -- and silently false for the case the
-- argument did not cover: when the mirror lands ON OR BEFORE the entry's own date (a same-day
-- booking, or a period-stamped entry whose mirror inherits the original's date), the correction
-- IS counted at that date, the cap clears, and a prediction made from today's rows cried wolf.
--
-- SO THE DELTA IS NAMED RATHER THAN SIMULATED. It is added to the SAME `_adv_outstanding` the
-- walk already uses, at the same boundaries, plus its own date as a boundary -- so there is still
-- exactly ONE reading of the SS3.2 equation and one comparison. Both parameters default to
-- nothing, and with them absent this body is byte-identical to the arm it was factored out of:
-- clara._adv_assert_proposal passes neither and cannot be affected by either.
--
-- THE SIGN IS THE EQUATION'S OWN. A correction carries a NEGATIVE effect in the outstanding sum
-- (SS3.2), so a pending correction of C cents RAISES the outstanding by C from its date forward.
-- p_pending_cents is therefore stated as the amount the correction gives BACK, positive.
-- ---------------------------------------------------------------------------------
create function clara._adv_over_application(p_advance uuid, p_proposed bigint, p_from date,
    p_pending_cents bigint default 0, p_pending_from date default null)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare b record; v_out bigint; v_at bigint; v_pend bigint;
begin
  if p_advance is null or p_from is null or coalesce(p_proposed, 0) = 0 then return null; end if;
  v_pend := case when p_pending_from is null then 0 else coalesce(p_pending_cents, 0) end;
  for b in select t.bd from (
               select p_from::date as bd
               union
               select ap.effective_date from clara.staff_advance_applications ap
                 where ap.advance_id = p_advance and ap.effective_date >= p_from
               union
               select sv.void_effective_date from clara.staff_advances sv
                 where sv.id = p_advance and sv.void_effective_date is not null
                   and sv.void_effective_date >= p_from
               union
               select p_pending_from where v_pend <> 0 and p_pending_from >= p_from) t
           order by t.bd loop
    v_at := clara._adv_outstanding(p_advance, b.bd)
          + case when v_pend <> 0 and p_pending_from <= b.bd then v_pend else 0 end;
    v_out := v_at - p_proposed;
    if v_out < 0 then
      return jsonb_build_object('advance_id', p_advance, 'proposed_cents', p_proposed,
        'boundary_date', b.bd,
        'outstanding_cents', v_at,
        'resulting_cents', v_out);
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._adv_over_application(uuid, bigint, date, bigint, date) from public;

-- ---------------------------------------------------------------------------------
-- IS RELEASING THIS BOOKING ONE-WAY? [as-built ladder round 8 fix, lane M3; cells
-- x42.r8s-a1..a4]. THE SECOND HALF OF THE SAME FINDING, and the reason the cap above became a
-- body rather than staying an arm.
--
-- THE TRUTH IT STATES. clara.reverse_entry takes NO date: it stamps its mirror at TODAY (MYT),
-- and design SS3.3 pins the register's correction to that mirror's posting_date. So unwinding
-- an application booked in a PAST period gives the discharge back FROM TODAY FORWARD and never
-- restores the outstanding as it stood on the day of the original booking. Re-applying the same
-- repayment at that original date is therefore refused by the cap above -- not by a bug, but by
-- the SS3.2 equation working exactly as ruled (rounds 1-3 adjudicated that the correction must
-- NOT be re-dated: clamping it forward would make the register disagree with a GL that really
-- did post the mirror today).
--
-- WHY IT IS SAID AT THE RELEASE AND NOT LEFT TO BE DISCOVERED. A release receipt that names
-- clara.reverse_entry and says nothing else is asserting that the line goes back to being
-- bookable. For an advance-carrying booking it does not, at that line's own date, and the human
-- finds out three calls later with the booking already destroyed. WDB-R2's rule is that a
-- refusal (or a remedy) which promises something about ANOTHER verb's admission logic must ASK
-- that verb -- so this asks the cap, per advance, at the entry's own posting date.
--
-- THE POST-RELEASE WORLD IS STATED, NOT ASSUMED [the off-path cell x42.r8s-a4 caught the first
-- cut of this body doing the opposite]. The reversal will mint one correction per UNCORRECTED
-- REMAINDER, effective at the mirror's date, and that correction gives the discharge back. Where
-- the mirror lands AFTER the entry's own posting date -- the ordinary case, a booking in a closed
-- period unwound today -- it cannot change the outstanding at that date and the release really is
-- one-way. Where it lands ON OR BEFORE it (a same-day booking, or a period-stamped entry whose
-- mirror inherits the original's date) the correction IS counted there, the cap clears, and
-- saying "one-way" would be crying wolf. Both cases fall out of handing the cap the pending
-- credit by name rather than reasoning about which of them applies.
--
-- THE MIRROR'S DATE IS ASKED, NEVER ASSUMED. It comes from clara._wdb_correction_posting_date
-- with clara.reverse_entry's own MYT-today default -- the same call reverse_entry itself makes
-- -- so a period-stamped entry (recurring_adjustment / depreciation_charges / fa_disposal),
-- whose mirror inherits the ORIGINAL's posting date, is answered correctly rather than being
-- told it will land today when it will not.
--
-- THE SUBJECT IS THE REGISTER ROWS, NOT THE FLAGS PROPOSAL. `flags.staff_advance_application` is
-- the caller's copy of the request; clara.staff_advance_applications is what the approve hook
-- actually minted and what the reversal will actually correct. They agree on every approved
-- entry (the hook mints one row per allocation), and the report only ever reaches approved
-- entries -- so reading the rows costs nothing and cannot be fooled by a payload the hook
-- rejected, reshaped or never saw.
-- ---------------------------------------------------------------------------------
create function clara._adv_release_one_way(p_entry uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  e record; r record; v_rows jsonb := '[]'::jsonb; v_cap jsonb; v_first jsonb;
  v_corr date; v_one boolean := false;
begin
  if p_entry is null then return null; end if;
  select je.id, je.posting_date into e from clara.journal_entries je where je.id = p_entry;
  if not found then return null; end if;
  -- clara._book_today() IS THE HOUSE MYT-TODAY AUTHORITY (S5.25) and is called rather than
  -- re-spelled: the conversion lives in exactly one body, and this reader's whole value is that
  -- it answers the same question clara.reverse_entry will. The one recorded difference is the
  -- CLOCK inside it -- statement_timestamp() rather than reverse_entry's transaction now() --
  -- and it cannot move this answer for any caller the product has: a report read and an RPC are
  -- each ONE statement, where the two are the same instant (round-7 finding C's own measurement).
  v_corr := clara._wdb_correction_posting_date(p_entry, clara._book_today());
  -- THE REMAINDER, per advance, is the arm's own arithmetic: the original application minus
  -- everything already given back. It is BOTH the credit the reversal will mint and the amount a
  -- re-book would re-apply, which is why one number serves as both here.
  for r in select ap.advance_id,
                  sum(ap.amount_cents - coalesce((
                        select sum(cx.amount_cents) from clara.staff_advance_applications cx
                         where cx.reverses_application_id = ap.id), 0))::bigint as applied_cents
             from clara.staff_advance_applications ap
            where ap.entry_id = p_entry and ap.kind <> 'correction'
            group by ap.advance_id
           having sum(ap.amount_cents - coalesce((
                        select sum(cx.amount_cents) from clara.staff_advance_applications cx
                         where cx.reverses_application_id = ap.id), 0)) > 0
            order by ap.advance_id loop
    v_cap := clara._adv_over_application(r.advance_id, r.applied_cents, e.posting_date,
               r.applied_cents, v_corr);
    if v_cap is not null then
      v_one := true;
      if v_first is null then v_first := v_cap; end if;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'advance_id', r.advance_id, 'applied_cents', r.applied_cents,
      'reapplication_admitted_at_entry_date', v_cap is null,
      'boundary_date', v_cap ->> 'boundary_date',
      'outstanding_cents', (v_cap ->> 'outstanding_cents')::bigint,
      'resulting_cents', (v_cap ->> 'resulting_cents')::bigint));
  end loop;
  if jsonb_array_length(v_rows) = 0 then return null; end if;
  return jsonb_build_object(
    'entry_id', p_entry,
    'entry_posting_date', e.posting_date,
    'correction_posting_date', v_corr,
    'one_way_at_entry_date', v_one,
    'advances', v_rows,
    'statement', case when v_one then
        format('Releasing this booking is ONE-WAY at the line''s own date. clara.reverse_entry takes no date -- it stamps its mirror at %s -- so the staff-advance register''s correction is dated %s and the outstanding as at %s does not come back: re-booking the same application at %s is refused by the register''s temporal cap (advance_over_application, first breaching boundary %s). What IS admitted afterwards: re-book on or after %s and acknowledge the statement-period exception (clara.resolve_and_book_bank_line p_ack_period_exceptions => true), or leave this booking standing and unwind nothing.',
          v_corr, v_corr, e.posting_date, e.posting_date,
          v_first ->> 'boundary_date', v_corr)
      else
        format('Releasing this booking is reversible at the line''s own date: clara.reverse_entry''s correction lands on %s, on or before this entry''s own posting date (%s), so the register''s temporal cap admits re-applying the same amounts at that date.',
          v_corr, e.posting_date)
      end);
end $$;
revoke all on function clara._adv_release_one_way(uuid) from public;

-- ---------------------------------------------------------------------------------
-- THE NET APPLICATION EFFECT AN ENTRY'S ADVANCES CARRY (design SS3.3). Read by
-- clara._adv_reversal_blocked below -- which is now the ONE body that owns this rule and is
-- called from BOTH moments of a reversal: reversing a DISBURSEMENT whose advances still carry
-- live applications would delete the claim while its repayments stayed in the books, so it
-- refuses by name (CLR39 advance_applications_outstanding).
--
-- NET, not "any": an application that has already been fully corrected nets to zero and must
-- not block the disbursement's reversal -- the books really do show nothing applied.
-- ---------------------------------------------------------------------------------
create function clara._adv_net_applications(p_entry uuid) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(case when ap.kind = 'correction' then -ap.amount_cents
                           else ap.amount_cents end), 0)::bigint
    from clara.staff_advance_applications ap
    join clara.staff_advances a on a.id = ap.advance_id
   where a.entry_id = p_entry $$;
revoke all on function clara._adv_net_applications(uuid) from public;

-- Does this entry CARRY hook-born corrections? Read by clara._adv_reversal_blocked below:
-- a correction-carrying entry is a reversal mirror, and reversing it would be a correction of
-- a correction -- a shape with no accounting meaning and no remedy (CLR39
-- correction_entry_irreversible). Defence in depth: reverse_entry already refuses an entry
-- whose reversal_of is set, and every correction lives on such an entry today.
create function clara._adv_entry_carries_correction(p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (select 1 from clara.staff_advance_applications ap
                 where ap.entry_id = p_entry and ap.kind = 'correction') $$;
revoke all on function clara._adv_entry_carries_correction(uuid) from public;

-- =====================================================================================
-- THE ADVANCE-SIDE REVERSAL WALL, IN ONE BODY, ASKED AT BOTH MOMENTS OF A REVERSAL
-- [as-built ladder round 4 fix; cells x42v.g1..g4]. THE INVARIANT IT OWNS:
--
--     a disbursement may be voided, and an entry may be unwound, ONLY while the register
--     carries no live claim against it -- and that question is answered AT THE MOMENT THE
--     REGISTER IS WRITTEN, never inherited from an answer given earlier.
--
-- WHY IT EXISTS AS A SEPARATE BODY. `clara.reverse_entry` is a TWO-MOMENT verb: below the
-- firm's high-stakes floor it drafts and approves the mirror in one transaction, but AT OR
-- ABOVE it the mirror is left a DRAFT and the register act -- the void stamp, the corrections
-- -- happens later, at the checker's approve, in a different transaction. Section 2's
-- clara._wdb_reversal_blocked runs at the FIRST moment only. Its arm (b) asked "does this
-- disbursement carry net applications?" once, and the void stamp in clara._adv_on_approve
-- trusted that answer across the gap. MEASURED on this rig at the frontier: firm floor
-- 1,000,000; disburse 1,100,000; reverse_entry (admitted -- net 0, mirror DRAFTS); book the
-- full 1,100,000 repayment inside the window; approve the mirror -> the void stamped anyway,
-- design SS3.2 outstanding went to MINUS 1,100,000, `staff_advance_tie` reported
-- explained:true (both sides agreeing on a meaningless number) and
-- `retire_staff_advance_account` then CLOSED the enrolment over it, because its
-- `outstanding > 0` filter cannot see a negative. That is the D-a "value read before a
-- decision and trusted after it" class, by name.
--
-- WHY THE HOOK IS THE ENFORCEMENT POINT AND NOT THE VERB. Six live bodies mint an entry
-- carrying `reversal_of` (clara.reverse_entry, clara._pair_reverse_core,
-- clara.approve_wrong_client_correction, and their kin) and only ONE of them consults section
-- 2's wall -- so a per-door fix would have closed one door of several. Every one of them ends
-- at clara._approve_entry_core -> clara._subledger_on_approve -> clara._adv_on_approve, which
-- is also the ONLY body in the catalog that stamps a void or mints an application row (cell
-- x42v.g4 asserts both facts against pg_proc, so a future second writer turns red rather than
-- silently re-opening the class). The hook is therefore the single place every reversal of
-- every producer must pass, and that is where this body is called AUTHORITATIVELY, under the
-- advance row locks the hook takes. Section 2 keeps calling it too, as the EARLY DIAGNOSIS the
-- 0038 "deferring the write must never defer the diagnosis" law requires -- one body, so the
-- courtesy and the authority can never reach different answers.
--
-- ARM (a) OF SECTION 2 IS DELIBERATELY NOT HERE. The auto-pair wall must stay verb-side: the
-- sanctioned remedy (clara.reverse_adjustment_pair) reverses both halves, and a hook that ran
-- arm (a) would make the pair machine refuse its own remedy [L3/6]. It also cannot suffer this
-- defect -- clara._adj_on_approve mints the auto-reversal mirror inside the OCCURRENCE'S OWN
-- approval, so the row arm (a) looks for already exists before anyone can reverse the
-- occurrence at all, and neither `auto_reversal_of` direction can change inside a draft window.
--
-- STABLE and lock-free: the LOCK belongs to the caller that is about to write (the hook takes
-- it; a read-only courtesy caller must not acquire one by accident -- the SS2.1 doctrine).
-- =====================================================================================
-- =====================================================================================
-- ...AND ALL FOUR WALLS, NOT TWO [as-built ladder round 8 fix, lane M3; cells
-- x42.r8s-w1..w5]. THE DEFECT, MEASURED. Round 4 moved arms (b) and (c) into one body so the
-- courtesy and the authority could not drift. It left the OTHER TWO advance-side reversal walls
-- inlined inside clara._adv_on_approve's arms (1a)/(1b) -- the enrolment window (`the code is
-- not enrolled at the mirror's approve instant`) and the date ordering (`an unwind may never be
-- dated before the fact it unwinds`) -- and NOTHING outside the hook could ask about them. So
-- S4.6A's release report, whose whole job is to say whether clara.reverse_entry(E) will be
-- admitted, predicted `reverse_blocked_by: null` on a booking whose reversal refuses CLR40
-- advance_movement_unregistered, handed the human a `remedy_calls` array naming that very call,
-- and a surface that renders remedy_calls as buttons offered a button that cannot work. A
-- pre-flight that models HALF the walls is a promise about another verb's admission logic that
-- nobody asked the verb -- WDB-R2's exact subject, one round on.
--
-- SO ALL FOUR LIVE HERE, IN THE ENFORCING ORDER, and this body is the only one that states
-- them. [ROUND 9 AMENDS THIS COUNT -- r9 finding 3, HIGH: a FIFTH wall, `_tf_adv_movement_
-- belt` door (c)'s `unregistered_mirror` refusal, was still un-mirrored; it now lives at arm
-- (1c) below, in the `dated` half, for the same reason (1a)/(1b) do -- it is a property of the
-- mirror, not of the original alone. "Four" in the paragraphs below now reads as FIVE; the
-- shape of the argument (return not raise, carried-then-dated, one authority) is unchanged.]
-- It RETURNS rather than raises, because the two halves are known at different moments:
--
--   * `carried` -- arms (b) and (c). Properties of the ORIGINAL entry alone, true whenever they
--     are asked, so clara.reverse_entry can enforce them at the FIRST moment (the 0038
--     "deferring the write must never defer the diagnosis" law).
--   * `dated`   -- the enrolment-window and date-ordering walls. Both are properties of THE
--     MIRROR: which enrolment generation is in force at the mirror's approve instant, and
--     whether the mirror's posting date precedes the movement it unwinds. At the first moment
--     the mirror does not exist yet, and at or above the firm's high-stakes floor it will not
--     be approved for hours or days -- during which somebody may lawfully re-enrol the account
--     and make the very same reversal admissible. THAT is why this half is an ANSWER and not a
--     raise at clara.reverse_entry: raising it early would wall in the caller whose checker was
--     going to re-enrol first, which is the corridor, not the cure.
--
-- WHO ENFORCES WHAT, AND WHY THE SPLIT IS NOT A SELECTOR IN DISGUISE:
--   * clara._adv_reversal_blocked (just below) raises `carried`. Same signature, same tokens,
--     same order, same `moment` key -- clara._wdb_reversal_blocked's call is untouched.
--   * clara._adv_on_approve GUARD III raises `first` -- carried THEN dated -- with the mirror's
--     REAL posting date and approve instant, under the row locks it already takes. That is the
--     authority, and it is the only site that can be one.
--   * S4.6A's release report READS `dated` at the mirror clara.reverse_entry WOULD mint, and
--     reports the wall by its own token. It never re-derives a wall.
-- Each caller enforces the prefix its moment can honestly know; none of them owns a rule.
--
-- THE DATED WALLS ARE WALKED IN THE HOOK'S OWN ORDER, item by item, so the FIRST refusal a
-- caller meets is byte-identical to the one arms (1a)/(1b) used to raise in place: every
-- application of the original with an UNCORRECTED REMAINDER (id order) -- enrolment, then date
-- -- and then every un-voided advance the original BORE (id order), same two questions. The
-- remainder and voided filters are the arms' own: an application already fully corrected mints
-- nothing and therefore refuses nothing, and neither does an advance already voided. Arm (1c)
-- [round 9] walks a THIRD, disjoint set -- the original's own advance-account lines that carry
-- NO register row at all -- and can never re-ask a question (1a)/(1b) already asked of the same
-- line, by construction (S3.5's own (1c) header argues the disjointness).
--
-- STABLE, LOCK-FREE, AND VOLATILE-BY-DEPENDENCY. It takes no lock (the SS2.1 doctrine: the lock
-- belongs to the caller that is about to write) and it is declared VOLATILE because
-- clara._adv_enrolment_at is -- the enrolment reader samples clock_timestamp() inside the live
-- band, and a body that claimed to be stable while reading a moving clock would be lying to the
-- planner about the one question this half is asked at two different moments.
-- =====================================================================================
create function clara._adv_reversal_admission(p_original uuid,
    p_moment text default 'reverse_entry', p_client uuid default null,
    p_posting_date date default null, p_at timestamptz default null,
    p_mirror uuid default null)
  returns jsonb
  language plpgsql volatile security definer set search_path = clara, pg_temp as $$
declare
  o record; ap record; a record; l record;
  v_net bigint; v_corrected bigint; v_remainder bigint; v_adm jsonb;
  v_client uuid; v_pd date; v_at timestamptz; v_src text;
  v_carried jsonb := jsonb_build_object('admitted', true);
  v_dated jsonb := jsonb_build_object('admitted', true);
  v_first jsonb;
begin
  select je.id, je.client_id, je.is_opening_balance into o
    from clara.journal_entries je where je.id = p_original;
  -- An opening entry is skipped WHOLE, exactly as arm (1) skips it: the K-family owns its own
  -- rows and clara.reverse_entry refuses an opening entry outright (CLR31), so there is no
  -- advance-side wall to state about one.
  if not found or o.is_opening_balance then
    return jsonb_build_object('original_entry_id', p_original, 'moment', p_moment,
      'admitted', true, 'blocked_by', null, 'first', null,
      'carried', v_carried, 'dated', v_dated, 'posting_date_source', 'not_asked');
  end if;
  v_client := coalesce(p_client, o.client_id);
  -- THE MIRROR'S DATE AND INSTANT: SUPPLIED BY THE AUTHORITY, PREDICTED FOR EVERYBODY ELSE --
  -- and the envelope SAYS WHICH, because a prediction and a measurement must never read the
  -- same on the wire. The prediction is not a guess: it is the same call clara.reverse_entry
  -- makes to date its own mirror, so a period-stamped original (which the mirror inherits the
  -- date of) is answered correctly rather than assumed to land today.
  v_src := case when p_posting_date is null then 'predicted' else 'supplied' end;
  v_pd := coalesce(p_posting_date,
            clara._wdb_correction_posting_date(p_original, clara._book_today()));
  v_at := coalesce(p_at, now());

  -- (b) A STAFF-ADVANCE DISBURSEMENT WHOSE ADVANCE STILL CARRIES NET APPLICATIONS
  -- (design SS3.3). The reversal arm of clara._adv_on_approve voids the disbursement as of
  -- the mirror's posting date; doing that while repayments are still live against it would
  -- leave applications pointing at an advance the register says was never made. Remedy:
  -- reverse (or correct) the applications first, then the disbursement -- and that remedy is
  -- EXECUTABLE from either moment, which cell x42v.g3 performs rather than promises.
  -- NET = originals minus corrections, exactly the sign convention the outstanding equation
  -- uses (SS3.2): corrections are negative effects.
  v_net := clara._adv_net_applications(p_original);
  if v_net <> 0 then
    v_carried := jsonb_build_object('admitted', false, 'errcode', 'CLR39',
      'reason', 'advance_applications_outstanding', 'axis', 'net_applications_live',
      'message', format('a staff advance disbursed by entry %s still carries net applications (%s cents); reverse or correct those applications first', p_original, v_net),
      'detail', jsonb_build_object('reason', 'advance_applications_outstanding',
        'axis', 'net_applications_live',
        -- WHICH MOMENT REFUSED, machine-visibly. The token and the remedy are the same at
        -- both, but the caller's position is not: at `reverse_entry` no mirror exists yet,
        -- while at `mirror_approval` a DRAFT mirror is already sitting in the checker's
        -- queue and stays there until the applications are cleared or it is cancelled. A
        -- surface must not have to parse English to tell those two apart.
        'moment', p_moment,
        'entry_id', p_original, 'net_applied_cents', v_net));
  end if;

  -- (c) A CORRECTION-CARRYING ENTRY (design SS3.3). Correction rows are HOOK-BORN ONLY, as
  -- the unwind of a reversed application. Reversing the entry that carries them would ask the
  -- hook to unwind an unwind -- a correction of a correction, which the register refuses by
  -- construction. Remedy: book an offsetting application.
  if (v_carried ->> 'admitted')::boolean and clara._adv_entry_carries_correction(p_original) then
    v_carried := jsonb_build_object('admitted', false, 'errcode', 'CLR39',
      'reason', 'correction_entry_irreversible', 'axis', 'correction_carried',
      'message', format('entry %s carries staff-advance correction rows and is not reversible; book an offsetting application instead', p_original),
      'detail', jsonb_build_object('reason', 'correction_entry_irreversible',
        'axis', 'correction_carried', 'moment', p_moment,
        'entry_id', p_original));
  end if;

  -- (1a) THE APPLICATION SIDE OF THE MIRROR: one correction per UNCORRECTED remainder, and the
  -- two walls each of those corrections must pass. GUARD I asks the CODE at the mirror's
  -- approve instant (the belt's and the tie's own instrument, so all three answer one question
  -- one way); GUARD II refuses a correction dated before the discharge it gives back, because
  -- every as-of in between would report MORE owed than was ever advanced. The full argument for
  -- both -- and for why the act is refused rather than re-dated or silently filed out of window
  -- -- is written at clara._adv_on_approve's arm (1) header, which is where they used to live.
  for ap in select x.* from clara.staff_advance_applications x
             where x.entry_id = p_original and x.kind <> 'correction'
             order by x.id loop
    exit when not (v_dated ->> 'admitted')::boolean;
    select coalesce(sum(cx.amount_cents), 0) into v_corrected
      from clara.staff_advance_applications cx where cx.reverses_application_id = ap.id;
    v_remainder := ap.amount_cents - v_corrected;
    if v_remainder > 0 then
      select * into a from clara.staff_advances sa where sa.id = ap.advance_id;
      if clara._adv_enrolment_at(v_client, a.account_code, v_at) is null then
        -- The remedy is composed by the SAME body clara.enrol_staff_advance_account enforces
        -- (round 3's fix, kept whole), so this message can only ever say what that door will do.
        -- The balance is measured WITHOUT the mirror that is about to roll back -- p_mirror is
        -- the in-flight entry at the authoritative moment and NULL at the predictive one, where
        -- no mirror exists to exclude.
        v_adm := clara._adv_enrolment_admission(v_client, a.account_code, p_mirror);
        v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR40',
          'reason', 'advance_movement_unregistered', 'axis', 'enrolment_closed',
          'message', format('account %s is not an enrolled staff-advance account at this moment, so unwinding this application cannot be recorded in the register. %s', a.account_code, v_adm ->> 'advice'),
          'detail', jsonb_build_object('reason', 'advance_movement_unregistered',
            'axis', 'enrolment_closed', 'entry_id', p_mirror,
            'account_code', a.account_code, 'advance_id', a.id,
            'application_id', ap.id, 'reversal_of', p_original,
            'reenrolment_balance_cents', (v_adm ->> 'balance_cents')::bigint,
            'reenrolment_admitted', (v_adm ->> 'admitted')::boolean,
            'reenrolment_axis', v_adm ->> 'axis',
            'remedy', v_adm ->> 'remedy'));
      elsif v_pd < ap.effective_date then
        v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR39',
          'reason', 'advance_reversal_predates_movement',
          'axis', 'correction_predates_application',
          'message', format('this reversal is dated %s but the application it unwinds is dated %s; a correction dated before the application it gives back would make the register report more owed than was ever advanced. clara.reverse_entry takes no date -- it always stamps the mirror at TODAY (MYT) -- so this entry cannot be unwound until %s arrives. There is nothing to retry before then.', v_pd, ap.effective_date, ap.effective_date),
          'detail', jsonb_build_object('reason', 'advance_reversal_predates_movement',
            'axis', 'correction_predates_application', 'entry_id', p_mirror,
            'advance_id', ap.advance_id, 'application_id', ap.id,
            'mirror_posting_date', v_pd,
            'effective_date', ap.effective_date,
            'reversible_on', ap.effective_date));
      end if;
    end if;
  end loop;

  -- (1b) THE DISBURSEMENT SIDE OF THE MIRROR: the void stamp, and the same two walls asked of
  -- every row it would touch. A void dated before the issue subtracts an advance that has not
  -- been made yet and drives every as-of in between negative.
  for a in select sv.* from clara.staff_advances sv
            where sv.entry_id = p_original and sv.voided_by_entry_id is null
            order by sv.id loop
    exit when not (v_dated ->> 'admitted')::boolean;
    if clara._adv_enrolment_at(v_client, a.account_code, v_at) is null then
      v_adm := clara._adv_enrolment_admission(v_client, a.account_code, p_mirror);
      v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR40',
        'reason', 'advance_movement_unregistered', 'axis', 'enrolment_closed',
        'message', format('account %s is not an enrolled staff-advance account at this moment, so voiding this disbursement cannot be recorded in the register. %s', a.account_code, v_adm ->> 'advice'),
        'detail', jsonb_build_object('reason', 'advance_movement_unregistered',
          'axis', 'enrolment_closed', 'entry_id', p_mirror,
          'account_code', a.account_code, 'advance_id', a.id,
          'reversal_of', p_original,
          'reenrolment_balance_cents', (v_adm ->> 'balance_cents')::bigint,
          'reenrolment_admitted', (v_adm ->> 'admitted')::boolean,
          'reenrolment_axis', v_adm ->> 'axis',
          'remedy', v_adm ->> 'remedy'));
    elsif v_pd < a.issue_date then
      v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR39',
        'reason', 'advance_reversal_predates_movement', 'axis', 'void_predates_issue',
        'message', format('this reversal is dated %s but the advance it voids is issued on %s; a void dated before the disbursement it cancels would drive the register''s outstanding negative at every date in between. clara.reverse_entry takes no date -- it always stamps the mirror at TODAY (MYT) -- so this entry cannot be unwound until %s arrives. There is nothing to retry before then.', v_pd, a.issue_date, a.issue_date),
        'detail', jsonb_build_object('reason', 'advance_reversal_predates_movement',
          'axis', 'void_predates_issue', 'entry_id', p_mirror,
          'advance_id', a.id, 'mirror_posting_date', v_pd,
          'issue_date', a.issue_date,
          'reversible_on', a.issue_date));
    end if;
  end loop;

  -- =====================================================================================
  -- (1c) THE FIFTH WALL, MIRRORED [as-built ladder round 9 fix, lane N2; r9 finding 3, HIGH].
  -- THE DEFECT, MEASURED (probe y2/p1-fifth-wall.mjs, both leg directions). `_tf_adv_movement_
  -- belt` door (c) (S3.5, just above) refuses a mirror leg that carries no POSITIVE register
  -- evidence -- a debit leg the register never voided, or a credit leg the register never
  -- corrected -- and until this fix that refusal had no admission-side twin: arms (1a)/(1b)
  -- above only ever walk EXISTING staff_advance_applications/staff_advances rows, so a line
  -- that was NEVER registered in the first place -- the account was not yet enrolled when the
  -- original entry was booked, design SS3.1's own named migration path ("carry any
  -- pre-enrolment balance down BEFORE the account is enrolled") -- produced no row for either
  -- loop to walk, and this body admitted a booking the belt refuses at COMMIT. Round 8 closed
  -- the "four walls, not two" gap and asked "is 4 all?"; round 9 answered no -- ALL FIVE now
  -- live here, not four.
  --
  -- THE WALL IS ASKED ON THE ORIGINAL'S OWN LINES, PREDICTIVELY -- the belt tests the MIRROR's
  -- lines, which do not exist yet at `reverse_entry`, but `clara.reverse_entry` copies every
  -- line at the SAME line_no with the two sides swapped (the belt's own door-(c) argument), so
  -- a line's registration state on the ORIGINAL is exactly the question the belt will ask of
  -- the MIRROR's twin. Enrolment is read through `clara._adv_enrolment_at`, the SAME reader the
  -- belt uses, at THIS admission's own `v_at` -- never re-inlined (S3.0's "one predicate over
  -- both worlds" doctrine that already governs every other wall in this body). A line whose
  -- code is NOT enrolled at v_at is not this wall's question at all (the belt's own WHERE
  -- clause skips it too -- an unenrolled code's movement carries no register consequence,
  -- enrol-clean-only's whole point).
  --
  -- MUTUALLY EXCLUSIVE WITH (1a)/(1b) BY CONSTRUCTION, NOT BY ORDERING. A line either already
  -- has a register row for (1a)/(1b) to walk, or it has none and this arm asks about it -- the
  -- two can never both fire for the same line, so where this loop sits relative to (1a)/(1b)
  -- changes only which of several SIMULTANEOUS defects a caller is told about first, never
  -- whether the wall is seen at all.
  -- =====================================================================================
  for l in select jl.id as line_id, jl.debit_cents, jl.credit_cents, jl.account_code
           from clara.journal_lines jl
           where jl.entry_id = p_original
             and clara._adv_enrolment_at(v_client, jl.account_code, v_at) is not null
           order by jl.id loop
    exit when not (v_dated ->> 'admitted')::boolean;
    if l.debit_cents > 0 then
      -- The original's DEBIT leg mirrors into a CREDIT; door (c) backs a mirror credit ONLY
      -- with a void naming the advance THIS line birthed -- ask for that advance row itself,
      -- exactly as arm (1b) above walks it once it exists.
      if not exists (select 1 from clara.staff_advances sa where sa.disbursement_line_id = l.line_id) then
        v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR40',
          'reason', 'advance_movement_unregistered', 'axis', 'unregistered_mirror',
          'message', format('this entry reverses a movement on staff-advance account %s that the register never held: the mirror would credit %s cents, but the leg it unwinds carried no register act (no advance row to void), so the GL would move where the register cannot follow. Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.', l.account_code, l.debit_cents),
          'detail', jsonb_build_object('reason', 'advance_movement_unregistered',
            'axis', 'unregistered_mirror', 'entry_id', p_mirror,
            'account_code', l.account_code, 'line_id', l.line_id,
            'debit_cents', 0, 'credit_cents', l.debit_cents,
            'reversal_of', p_original));
      end if;
    elsif l.credit_cents > 0 then
      -- The original's CREDIT leg mirrors into a DEBIT; door (c) backs a mirror debit ONLY
      -- with a correction naming THIS application line -- ask for that application row itself,
      -- exactly as arm (1a) above walks it once it exists.
      -- ALIAS apx, NOT ap -- `ap` is already this function's own `record` variable (the (1a)
      -- loop above), and PL/pgSQL cannot disambiguate a query alias from a same-named RECORD
      -- variable inside an EXISTS subquery (measured: 42702 "column reference ... is
      -- ambiguous" the first time this arm was written with the shared name).
      if not exists (select 1 from clara.staff_advance_applications apx
                     where apx.application_line_id = l.line_id and apx.kind <> 'correction') then
        v_dated := jsonb_build_object('admitted', false, 'errcode', 'CLR40',
          'reason', 'advance_movement_unregistered', 'axis', 'unregistered_mirror',
          'message', format('this entry reverses a movement on staff-advance account %s that the register never held: the mirror would debit %s cents, but the leg it unwinds carried no register act (no application to correct), so the GL would move where the register cannot follow. Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.', l.account_code, l.credit_cents),
          'detail', jsonb_build_object('reason', 'advance_movement_unregistered',
            'axis', 'unregistered_mirror', 'entry_id', p_mirror,
            'account_code', l.account_code, 'line_id', l.line_id,
            'debit_cents', l.credit_cents, 'credit_cents', 0,
            'reversal_of', p_original));
      end if;
    end if;
  end loop;

  -- CARRIED FIRST, THEN DATED -- the hook's own order, so `first` is the refusal a caller
  -- actually meets and a report that renders it is not inventing a priority of its own.
  v_first := case when not (v_carried ->> 'admitted')::boolean then v_carried
                  when not (v_dated ->> 'admitted')::boolean then v_dated end;
  return jsonb_build_object('original_entry_id', p_original, 'moment', p_moment,
    'posting_date', v_pd, 'posting_date_source', v_src, 'evaluated_at', v_at,
    'admitted', v_first is null,
    'blocked_by', v_first ->> 'reason',
    'first', v_first, 'carried', v_carried, 'dated', v_dated);
end $$;
revoke all on function clara._adv_reversal_admission(uuid, text, uuid, date, timestamptz, uuid)
  from public;

-- THE CARRIED-ONLY RAISER, kept at its exact signature so clara._wdb_reversal_blocked's call is
-- untouched. It owns no rule: it enforces the `carried` half of the admission envelope above,
-- which is the half that is true whenever it is asked. Same tokens, same messages, same
-- `moment` key, same order -- what changed at round 8 is that the two arms it used to inline
-- came to live beside the two the hook used to inline, in ONE body.
--
-- [round-10 CORRECTION of this paragraph's own claim. It used to end "...so no future round can
-- add a fifth wall to one of the four sites and leave the other three predicting from three."
-- ROUND 9 DID ADD A FIFTH WALL (arm (1c) above, the belt's `unregistered_mirror` refusal), and
-- what the one-body shape actually bought is what happened next: the fifth wall joined THE
-- BODY, so every caller got it at once and no site was left predicting from four. The claim as
-- written was false and is deleted rather than softened -- this file's own rule. The count is
-- FIVE, and the instrument that keeps it honest is the x42.r9n2.f1-census cell (site-level
-- since round 10), not this sentence.]
create function clara._adv_reversal_blocked(p_original uuid, p_moment text default 'reverse_entry')
  returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_c jsonb;
begin
  v_c := clara._adv_reversal_admission(p_original, p_moment) -> 'carried';
  if not (v_c ->> 'admitted')::boolean then
    raise exception '%', v_c ->> 'message'
      using errcode = v_c ->> 'errcode', detail = v_c ->> 'detail';
  end if;
end $$;
revoke all on function clara._adv_reversal_blocked(uuid, text) from public;

-- =====================================================================================
-- S3.1 -- ENROLMENT (design SS3.1; WD-R10, [WDB-G6] admin+, [WDB-G7] free coding /
-- enrolment is the truth, [WDB-G15] related-party is ATTESTATION, not structure).
--
-- ENROLMENT IS THE ONE ACT IN THIS FAMILY WITH UNBOUNDED BLAST RADIUS, exactly as the FA
-- profile is in 0041: it makes every future movement on the account a register act, so a
-- mis-typed code would (i) soft-birth a bogus advance on every debit and (ii) refuse every
-- credit at approval with a remedy that means nothing for that account. It therefore gets the
-- FULL guard set -- typing, the bank door, the shared reservation predicate, a clean balance,
-- an explicit dedication confirmation and a stored attestation -- and the admin+ floor.
--
-- THE ENROLMENT-SIDE RESERVATION IS NON-DEFERRED, and that asymmetry with the MOVEMENT belt
-- (S3.4, a DEFERRED constraint trigger) is deliberate. The belt asks a question about an
-- entry, which is only fully written at commit, so it must fire late. The reservation asks
-- "does anyone else already own this code", which is a question about a world that another
-- transaction can change under it -- so it is answered INLINE, while this call still holds the
-- leaf rung, and the answer is acted on immediately. Deferring it would hand the race to
-- whichever transaction committed last and leave a bank account bound to an enrolled advance
-- code with no verb ever refused.
-- =====================================================================================

-- ---------------------------------------------------------------------------------
-- THE ENROLMENT ADMISSION PREDICATE -- ONE BODY, ENFORCED BY THE VERB AND CONSULTED BY EVERY
-- REFUSAL THAT PROMISES RE-ENROLMENT [as-built ladder round 3 fix; cells x42v.w7a..w7f].
--
-- THE CLASS THIS CLOSES: THE WALLED CORRIDOR, THIRD OCCURRENCE. A refusal that NAMES A REMEDY
-- is asserting something about ANOTHER verb's admission logic. Three rounds running, that
-- assertion was re-derived by hand and drifted: round 1 hard-coded "its balance is what it was
-- when the enrolment was retired" (unenforceable); round 2 replaced it with a MEASUREMENT --
-- but of ONE gate, the GL balance -- and so promised "its approved balance is zero, so
-- enrolment will admit it" in every state where one of the THREE gates that run BEFORE the
-- balance test refuses outright. MEASURED on the shipped build, both routes admitted by design
-- SS3.1 (which blesses re-using a retired advance code): bind an FA profile to the retired code
-- -> enrolment refuses `role_reserved`; register a bank account on it -> enrolment refuses
-- `bank_account`. In both, the hook still said the balance was zero and enrolment would admit
-- it. A third point-fix would repeat the mistake.
--
-- SO THE ANSWER IS STRUCTURAL, ON THIS BUILD'S OWN TWICE-PROVEN PATTERN (`_acct_role_reserved`
-- -- one reservation union, four readers; `_wdb_suggestion_lines` -- one derivation, producer
-- and approve-time validator): ONE BODY ANSWERS "MAY AN ENROLMENT ON THIS CODE BE ADMITTED, AND
-- IF NOT WHY", `clara.enrol_staff_advance_account` ENFORCES ITS ANSWER (it no longer carries a
-- gate of its own), and `clara._adv_on_approve`'s `enrolment_closed` refusal CONSULTS it. The
-- promise and the enforcement are now the same code; they cannot drift apart again, and a gate
-- added here is honoured by both sites the day it is written.
--
-- THE GATE ORDER IS THE VERB'S OWN, PRESERVED EXACTLY: (i) chart typing, (ii) the bank door,
-- (iii) the shared reservation union, (iv) enrol-clean-only. The FIRST failure is reported, with
-- the verb's verbatim message and its verbatim DETAIL, so every existing refusal keeps its
-- wording, its axis and its token.
--
-- `p_exclude_entry` IS WHY THIS TAKES A PARAMETER RATHER THAN NONE. The hook runs INSIDE the
-- approving transaction, so the in-flight mirror's own legs are already approved and would be
-- counted in a balance the caller will never actually face -- they are the one movement
-- guaranteed not to survive the refusal. The verb passes NULL; the hook passes its entry.
--
-- THE BALANCE IS MEASURED ON EVERY PATH, not only when it is the blocking gate: a consultant
-- reports `reenrolment_balance_cents` unconditionally, and a figure that existed only on one
-- branch would read as zero exactly when an earlier gate hid it -- the same false comfort this
-- fix exists to remove.
--
-- IS THE OBSTACLE RELEASABLE? MEASURED PER OWNER, NEVER ASSUMED -- because a message that says
-- "retire the fixed-asset profile" when a fixed-asset REGISTER ROW owns the code would be the
-- fourth walled corridor. `clara._fa_reserved_roles` (0041's body, LIVE IN PRODUCTION) reads
-- `clara.fixed_assets` with NO active/disposed test at all, so a DISPOSED asset reserves its
-- code FOREVER and no verb in the schema releases it. That asymmetry is design SS3.1's stated
-- law ("on the FA side, a code any register row ever carried stays reserved forever"), so it is
-- NOT quietly gated here -- see the S3.9 note at the foot of this section for the full ruling
-- and its blast radius. What changes is that the refusal now SAYS SO and names the act that
-- still works: an ordinary correcting journal entry on the retired code, which nothing guards,
-- and which staff_advance_tie reports in its own `out_of_window_cents` column (design SS3.4).
-- ---------------------------------------------------------------------------------
create function clara._adv_enrolment_admission(p_client uuid, p_code text,
    p_exclude_entry uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_bal bigint; v_dom text; v_role text; v_owner text; v_bank uuid; v_perm boolean;
  v_axis text; v_reason text; v_msg text; v_remedy text; v_advice text; v_detail jsonb;
  v_fallback constant text :=
    ' Or leave the code as it is and post an ordinary correcting journal entry on it instead: nothing guards a retired advance code, and staff_advance_tie reports movement outside every enrolment window in its own out_of_window_cents column.';
begin
  select coalesce(sum(l.debit_cents - l.credit_cents), 0) into v_bal
    from clara.journal_lines l
    join clara.journal_entries j on j.id = l.entry_id
    where l.client_id = p_client and l.account_code = p_code and j.status = 'approved'
      and (p_exclude_entry is null or j.id <> p_exclude_entry);

  -- (i) TYPING (the verb's own argument, kept at its own site).
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_code
                   and a.is_active and a.account_type = 'asset'
                   and a.account_class is null) then
    v_axis := 'account_type'; v_reason := 'advance_enrolment_invalid';
    v_msg := 'a staff-advance account must be an active, asset-typed, non-control account on this client''s chart';
    v_remedy := 'fix_chart_account_then_re_enrol';
    v_advice := format('Re-enrolment is refused today: %s is not an active, asset-typed, non-control account on this client''s chart. Restore the chart account (active, asset-typed, no control class) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_fallback);
  end if;

  -- (ii) THE BANK DOOR. Status-blind, exactly as the verb wrote it -- a bank account that was
  -- deactivated still carries `coa_account_code`, so the code stays bound until the binding is
  -- MOVED. The advice names the verb that moves it rather than implying deactivation frees it.
  if v_axis is null then
    select ba.id into v_bank from clara.bank_accounts ba
      where ba.client_id = p_client and ba.coa_account_code = p_code limit 1;
    if v_bank is not null then
      v_axis := 'bank_account'; v_reason := 'advance_enrolment_invalid';
      v_msg := format('account %s is a registered bank account for this client and cannot be enrolled as a staff-advance account', p_code);
      v_remedy := 'move_bank_binding_then_re_enrol';
      v_advice := format('Re-enrolment is refused today: %s is bound to a registered bank account for this client (deactivating that bank account does NOT free the code -- the binding survives it). Move the binding onto another chart code (remap_bank_account_coa) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_fallback);
    end if;
  end if;

  -- (iii) THE SHARED RESERVATION UNION.
  if v_axis is null then
    select rr.domain, rr.role, rr.owner_ref into v_dom, v_role, v_owner
      from clara._acct_role_reserved(p_client, p_code) rr limit 1;
    if v_dom is not null then
      v_axis := 'role_reserved'; v_reason := 'advance_enrolment_invalid';
      v_msg := format('chart account %s is already reserved by the %s register (%s role) for this client; pick a different account', p_code, v_dom, v_role);
      -- WHICH SHAPE HOLDS IT, AND WHAT ACTUALLY RELEASES THAT SHAPE. `_fa_reserved_roles`
      -- unions two: an ACTIVE fa_account_profiles row (released by retire_fa_account_profile)
      -- and a clara.fixed_assets REGISTER ROW, which keeps the codes it was born with and so
      -- survives the profile being retired or version-forwarded.
      --
      -- [CROSS-SECTION EDIT, authored by the S5 reservation-authority lane -- owner ruling
      -- 2026-08-03 / WDB-R1 item 2. Reported, not silent.] This arm used to answer
      -- "permanent, and it will never become possible". That was a TRUE statement about the
      -- pre-0042 world, where the register disjuncts carried no status test -- and it was
      -- precisely the defect the ruling ordered eradicated, because it made a lawful advance
      -- reversal un-recordable FOREVER. 0042 S5.15 gates those disjuncts, so a DISPOSED,
      -- SUPERSEDED or UNWOUND row no longer holds the code: this branch now has a followable
      -- remedy and, under WDB-R2, must name it instead of promising an impossibility.
      --
      -- THE PROBE IS GATED IDENTICALLY TO THE UNION, which is the whole point: a message that
      -- measured "does any row carry this code" while the union measured "does any LIVE row
      -- carry it" would report a claim that does not exist -- telling a professional to end an
      -- asset that is already disposed. One predicate, both places, so they cannot drift.
      v_perm := (v_dom = 'fa') and exists (
        select 1 from clara.fixed_assets f
         where f.client_id = p_client
           and clara._fa_status_holds_account_role(f.status)
           and p_code in (f.asset_account_code, f.accum_depr_account_code,
                          f.depr_expense_account_code));
      if v_perm then
        v_remedy := 'release_fa_register_row_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: the FIXED-ASSET REGISTER holds %s (%s role, owner asset %s) on a LIVE register row, and retiring the account profile alone does NOT release it -- a register row keeps the codes it was born with. End that row first (dispose the asset, or reverse its acquisition, which unwinds it -- each has its own preconditions and will say so), then re-enrol this code, then reverse the entry again.%s', p_code, v_role, coalesce(v_owner, '(unnamed)'), v_fallback);
      elsif v_dom = 'fa' then
        v_remedy := 'retire_fa_profile_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: %s is reserved by the fixed-asset register (%s role, owner asset %s) through an ACTIVE account profile. Retire that profile (retire_fa_account_profile) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, v_role, coalesce(v_owner, '(unnamed)'), v_fallback);
      else
        v_remedy := 'retire_advance_enrolment_then_re_enrol';
        v_advice := format('Re-enrolment is refused today: %s is already reserved by the staff-advance register for this client (owner %s). Retire that enrolment (retire_staff_advance_account, which needs every advance on it settled) FIRST, then re-enrol this code, then reverse the entry again.%s', p_code, coalesce(v_owner, '(unnamed)'), v_fallback);
      end if;
    end if;
  end if;

  -- (iv) ENROL-CLEAN-ONLY.
  if v_axis is null and v_bal <> 0 then
    v_axis := 'balance'; v_reason := 'enrolment_balance_nonzero';
    v_msg := format('account %s already carries an approved GL balance of %s cents; a staff-advance enrolment can only start from a clean account (carry the existing balances down onto a fresh dedicated code, or use a new account for this person)', p_code, v_bal);
    v_remedy := 'clear_balance_then_re_enrol';
    v_advice := format('The code now carries an approved GL balance of %s cents from other use, so a re-enrolment would be refused (a staff-advance enrolment can only start from a clean account): carry that balance down onto its own dedicated code FIRST, then re-enrol this code, then reverse the entry again.', v_bal);
  end if;

  if v_axis is null then
    return jsonb_build_object('admitted', true, 'account_code', p_code,
      'balance_cents', v_bal, 'axis', null, 'reason', null, 'remedy', 're_enrol',
      'advice', 'Re-enrol the account, then reverse the entry again -- every enrolment gate (chart typing, the bank door, the shared register reservations and the account''s approved balance) passes for this code right now, so enrolment will admit it.');
  end if;

  v_detail := jsonb_build_object('reason', v_reason, 'axis', v_axis,
    'account_code', p_code, 'remedy', v_remedy);
  if v_axis = 'role_reserved' then
    v_detail := v_detail || jsonb_build_object('reserved_domain', v_dom,
      'reserved_role', v_role, 'reserved_owner', v_owner);
  elsif v_axis = 'balance' then
    v_detail := v_detail || jsonb_build_object('balance_cents', v_bal);
  elsif v_axis = 'bank_account' then
    v_detail := v_detail || jsonb_build_object('bank_account_id', v_bank);
  end if;
  return jsonb_build_object('admitted', false, 'account_code', p_code,
    'balance_cents', v_bal, 'axis', v_axis, 'reason', v_reason, 'remedy', v_remedy,
    'message', v_msg, 'advice', v_advice, 'detail', v_detail);
end $$;
revoke all on function clara._adv_enrolment_admission(uuid, text, uuid) from public;

create function clara.enrol_staff_advance_account(p_client uuid, p_account_code text,
    p_person_label text, p_confirm_dedicated boolean, p_attestation text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_id uuid; v_adm jsonb;
  v_code text; v_label text; v_attest text;
begin
  -- [WDB-G6]: enrol/retire sit at admin+, one floor above the bookkeeper verbs. Enrolment
  -- decides what an account MEANS for every future entry; that is a supervisory act.
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_code := nullif(btrim(coalesce(p_account_code, '')), '');
  -- ABI SSE: the enrol key hashes (client, account) -- both are pre-lock-knowable and both
  -- decide what the act does. The label and the attestation are deliberately NOT in the hash:
  -- a retry that re-types the same enrolment with a better-worded attestation is the SAME act
  -- and must return the first call's receipt, not raise "reused with different args".
  v_dedupe := clara._reserve_op(c.firm, 'enrol_staff_advance_account', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'account', v_code)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;

  -- ARGUMENT SHAPE FIRST, BEFORE ANY LOCK: a caller who left a field blank learns it now,
  -- in the call they made, without ever queuing behind another transaction's rung.
  if v_code is null then
    raise exception 'an advance enrolment needs an account code'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_enrolment_invalid","axis":"account_code"}';
  end if;
  v_label := nullif(btrim(coalesce(p_person_label, '')), '');
  if v_label is null then
    raise exception 'an advance enrolment needs a person label -- the account is dedicated to ONE person and the register says who'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_enrolment_invalid","axis":"person_label"}';
  end if;
  -- [WDB-G15] RELATED-PARTY IS ATTESTATION, NOT STRUCTURE. There is no is_director column and
  -- there will not be one: whether this advance is a related-party balance is a professional
  -- judgement, and the honest artefact is the professional's own words, stored verbatim and
  -- shown beside the balance forever. A blank attestation is a refusal, not a default.
  --
  -- [ROOT-ERADICATION residue R8 / WDB-R1 -- ruled 2026-08-03] THIS ONE FIELD DOES NOT USE THE
  -- HOUSE BLANKNESS IDIOM, AND THE DEVIATION IS DELIBERATE. Clara's non-blank idiom is
  -- `nullif(btrim(x),'')`, used 573 times across the 41 shipped migrations; Postgres `btrim/1`
  -- strips SPACES only, so a tab/newline-only string is "non-blank" by that idiom and used to be
  -- stored verbatim as this enrolment's attestation. Everywhere else in the schema that idiom
  -- guards a name, a memo or a reason -- a field whose emptiness costs a reader nothing they
  -- cannot recover. Here it guards the SOLE evidence for a G15 judgement: the only artefact a
  -- reviewer, an auditor or a successor practitioner will ever see for "is this a related-party
  -- balance". "Non-blank" has to mean something on that field. The house idiom ELSEWHERE IS
  -- DELIBERATELY UNTOUCHED -- widening it schema-wide is a 41-migration change of record, not a
  -- D-b act -- and this comment is the record of why exactly one call site differs.
  --
  -- The rule, and why it is written this way rather than as `[[:alnum:]]`:
  --   * trim on the FULL ASCII whitespace set, not btrim's space-only default, so the stored
  --     evidence never carries leading/trailing tabs or newlines. Content is untouched: this
  --     narrows the EDGES, it never rewrites what the professional wrote.
  --   * refuse when nothing survives deleting ASCII whitespace + ASCII punctuation -- i.e. the
  --     professional typed nothing but whitespace and dashes. `translate` is used rather than a
  --     `[[:alnum:]]` class BECAUSE THAT CLASS IS LOCALE-DEPENDENT AND WOULD REFUSE A CHINESE
  --     OR TAMIL ATTESTATION: measured on the Windows rig, a CJK-only string does NOT match
  --     `[[:alnum:]]`, while the same expression matches under a `*.UTF-8` ctype. A rule that
  --     admits a Malaysian firm's Bahasa Malaysia wording and refuses its Chinese wording --
  --     and does so DIFFERENTLY on the rig than in production -- would be a worse defect than
  --     the one it fixes. The translate form is byte-exact on every locale. (The multilingual
  --     admit-side cells live in x42-advances-guards.test.mjs, cell x42v.g-r8.)
  v_attest := nullif(btrim(coalesce(p_attestation, ''), E' \t\n\r\f\v'), '');
  if v_attest is null
     or translate(v_attest, E' \t\n\r\f\v' || '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~', '') = '' then
    raise exception 'an advance enrolment must carry a written attestation (who this account is for, and whether the balance is a related-party balance)'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_enrolment_invalid","axis":"attestation"}';
  end if;
  if coalesce(p_confirm_dedicated, false) is not true then
    raise exception 'confirm that % is DEDICATED to this one person: the register''s tie-out is meaningless on a mixed account (a director current account carrying advances answers no question honestly)', v_code
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'advance_enrolment_invalid',
          'axis', 'confirm_dedicated', 'account_code', v_code)::text;
  end if;

  -- ---------------------------------------------------------------------------------
  -- LOCKS: THE CLIENT RUNG FIRST, THE ROLE LEAF LAST (design SS3.1, SS2.1 leaf census).
  -- The rung is taken BEFORE the leaf and before the GL balance read, because that balance
  -- is a statement about the books that a concurrent approval can move: reading it under the
  -- rung is what makes "this account is clean" true at the moment it is written down rather
  -- than a moment earlier. The leaf (client:fa-roles, 0041's clara._fa_lock_roles) is the
  -- LAST rung and serialises this enrolment against a concurrent bank binding, an FA profile
  -- upsert and an adjustment-template propose -- every door that WRITES role-claiming state.
  -- ---------------------------------------------------------------------------------
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform clara._fa_lock_roles(p_client);

  -- ---------------------------------------------------------------------------------
  -- THE FOUR WORLD GATES, ENFORCED THROUGH THE SHARED ADMISSION PREDICATE [as-built ladder
  -- round 3 fix]. They used to be written out here -- typing, the bank door, the shared
  -- reservation union, enrol-clean-only, in that order -- and `clara._adv_on_approve` composed
  -- a promise about them from ONE of the four. They now live in `clara._adv_enrolment_admission`
  -- and this verb ENFORCES its answer, so the door and every message that speaks for the door
  -- are the same code. The messages, axes, tokens and gate ORDER are unchanged; what changed is
  -- that they can no longer be true here and stale somewhere else.
  --
  -- STILL READ UNDER BOTH RUNGS, and that is why the call sits exactly here rather than above
  -- them: the GL balance is a statement about the books a concurrent approval can move, and the
  -- reservation is a statement about a world a concurrent bank binding can change. Reading them
  -- under the leaf is what makes "this account is free and clean" true at the moment it is
  -- written down rather than a moment earlier.
  --
  -- WHY A RETIRED same-code enrolment does NOT block re-enrolment is unchanged and lives with
  -- the predicate: it is absent from `clara._acct_role_reserved` on purpose (design SS3.1) --
  -- an advance account is a PERSON's account, the person leaves, and the code is legitimately
  -- re-used. The tie's window scoping (S3.6) is what keeps that honest.
  -- ---------------------------------------------------------------------------------
  v_adm := clara._adv_enrolment_admission(p_client, v_code, null);
  if not (v_adm ->> 'admitted')::boolean then
    raise exception '%', v_adm ->> 'message'
      using errcode = 'CLR10', detail = (v_adm -> 'detail')::text;
  end if;

  insert into clara.staff_advance_accounts(firm_id, client_id, account_code, person_label,
      enrolment_attestation, active, enrolled_at, created_by, created_op_key)
    values (c.firm, p_client, v_code, v_label, v_attest, true, now(), c.actor, p_op_key)
    returning id into v_id;

  perform clara._audit(c.firm, c.actor, null, null, 'enrol_staff_advance_account', null,
    jsonb_build_object('client', p_client, 'account_code', v_code,
      'person_label', v_label, 'attestation', v_attest, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'enrol_staff_advance_account', p_op_key,
    jsonb_build_object('enrolment_id', v_id, 'status', 'active',
      'client_id', p_client, 'account_code', v_code, 'person_label', v_label));
end $$;
revoke all on function clara.enrol_staff_advance_account(uuid, text, text, boolean, text, text)
  from public;

-- =====================================================================================
-- RETIRE (design SS3.1; [WDB-G6] admin+). Retirement CLOSES the watermark, so from that
-- instant every movement on the code escapes the S3.4 belt. Retiring while a real advance is
-- still owed would therefore turn a live claim into an unwatched GL balance with no register
-- act ever required again -- which is the exact failure the register exists to prevent.
-- =====================================================================================
create function clara.retire_staff_advance_account(p_client uuid, p_enrolment uuid,
    p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; en record; v_reason text;
  v_open_advance uuid; v_open_cents bigint;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- ABI SSE: the retire key hashes (enrolment) alone -- the enrolment id already pins the
  -- client, the code and the generation.
  v_dedupe := clara._reserve_op(c.firm, 'retire_staff_advance_account', p_op_key,
    clara._hash(jsonb_build_object('enrolment', p_enrolment)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a retirement reason is required' using errcode = 'CLR10',
      detail = '{"reason":"advance_enrolment_invalid","axis":"reason"}';
  end if;

  -- THE SAME TWO RUNGS THE ENROLMENT DOOR TAKES, in the same order (0041's
  -- retire_fa_account_profile [round-3.5 fold G4] precedent): retiring CHANGES the reservation
  -- set, so it must serialise against a concurrent bank binding exactly as the enrolment does.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform clara._fa_lock_roles(p_client);

  select * into en from clara.staff_advance_accounts a
    where a.id = p_enrolment and a.client_id = p_client and a.firm_id = c.firm
    for update;
  if not found then
    raise exception 'staff-advance enrolment is not in this client' using errcode = 'CLR11';
  end if;
  if not en.active then
    raise exception 'this staff-advance enrolment is already retired'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'advance_enrolment_invalid',
          'axis', 'not_active', 'enrolment_id', p_enrolment)::text;
  end if;

  -- ---------------------------------------------------------------------------------
  -- OUTSTANDING AT 'infinity' (token advance_outstanding_on_retire). The as-of is deliberately
  -- AFTER every recorded fact, not "today": an advance whose repayment is already booked with
  -- a later posting date IS settled -- the books say so -- and an advance whose disbursement is
  -- booked with a later posting date is NOT, and would otherwise slip out under a today-scoped
  -- test and land on a code nobody watches any more.
  --
  -- SCOPED TO THE ACCOUNT CODE, NOT TO THIS GENERATION. Retirement closes the watermark for the
  -- CODE, so the code is the grain the guard has to protect. By induction the two are the same
  -- set (an earlier generation could only have been retired at zero, and re-enrolment demands a
  -- clean GL balance) -- the wider scope costs nothing and defends the invariant directly
  -- rather than by argument.
  -- ---------------------------------------------------------------------------------
  select a.id, clara._adv_outstanding(a.id, 'infinity'::date)
    into v_open_advance, v_open_cents
    from clara.staff_advances a
    where a.client_id = p_client and a.account_code = en.account_code
      and clara._adv_outstanding(a.id, 'infinity'::date) > 0
    order by a.issue_date, a.id limit 1;
  if v_open_advance is not null then
    raise exception 'account % still has at least one advance outstanding (% cents on advance %); record the repayment, write-off or claim first, then retire the enrolment', en.account_code, v_open_cents, v_open_advance
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'advance_outstanding_on_retire',
          'enrolment_id', p_enrolment, 'account_code', en.account_code,
          'advance_id', v_open_advance, 'outstanding_cents', v_open_cents)::text;
  end if;

  update clara.staff_advance_accounts
    set active = false, retired_by = c.actor, retired_at = now(),
        retired_reason = v_reason, retired_op_key = p_op_key
    where id = p_enrolment;

  perform clara._audit(c.firm, c.actor, null, null, 'retire_staff_advance_account', null,
    jsonb_build_object('client', p_client, 'enrolment', p_enrolment,
      'account_code', en.account_code, 'reason', v_reason, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'retire_staff_advance_account', p_op_key,
    jsonb_build_object('enrolment_id', p_enrolment, 'status', 'retired',
      'client_id', p_client, 'account_code', en.account_code));
end $$;
revoke all on function clara.retire_staff_advance_account(uuid, uuid, text, text) from public;

-- =====================================================================================
-- S3.2 -- PARTICULARS (design SS3.2). The register row is SOFT-BORN by the approve hook with
-- no purpose and no reference -- the WD-R1 doctrine carried across from the FA register:
-- books are never blocked on data entry, so an advance is structurally guaranteed and
-- HONESTLY INCOMPLETE at birth, and the /advances surface chases it (row_kind
-- staff_advance_incomplete) until a human completes it.
--
-- SET-ONCE, by act. purpose and reference are written together, once; a second call refuses by
-- name rather than silently overwriting the first professional's words. There is deliberately
-- no revision verb in v1: unlike the FA particulars (which drive arithmetic and therefore need
-- a prospective revision door), these two fields drive nothing but the narrative, and a wrong
-- one is corrected by a note on the account rather than by rewriting the register.
-- =====================================================================================
create function clara.complete_staff_advance_particulars(p_client uuid, p_advance uuid,
    p_purpose text, p_reference text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; a record; v_purpose text; v_reference text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- ABI SSE: the particulars key hashes (advance) alone. NOTE the consequence, stated rather
  -- than hidden: a replay under the SAME op_key with DIFFERENT particulars returns the first
  -- call's receipt instead of raising "reused with different args". That is the ABI's pinned
  -- field set and it is also the behaviour set-once wants -- the second wording was never
  -- going to be written anyway, and refusing it as a hash mismatch would report a race as a
  -- programming error.
  v_dedupe := clara._reserve_op(c.firm, 'complete_staff_advance_particulars', p_op_key,
    clara._hash(jsonb_build_object('advance', p_advance)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_purpose := nullif(btrim(coalesce(p_purpose, '')), '');
  if v_purpose is null then
    raise exception 'state what this advance was for'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_particulars_invalid","axis":"purpose"}';
  end if;
  v_reference := nullif(btrim(coalesce(p_reference, '')), '');
  -- THE PAIR IS A PAIR, AND THE DOOR SAYS SO [as-built ladder round 2 fix; cell x42v.w5].
  -- ABI SSD.5's ck_staff_advances_particulars_pair makes purpose and reference NULL together
  -- or set together, and this verb is the only writer of either -- so a call that states a
  -- purpose and leaves the reference blank cannot land. Without this test the UPDATE below
  -- tripped that CHECK and the caller got a RAW SQLSTATE 23514 naming a constraint they have
  -- never heard of, three statements away from the field they actually left empty. A blank
  -- reference is refused BY NAME at the door instead, on its own axis, exactly as a blank
  -- purpose already was: same idiom, same shape, no raw constraint text ever reaches a human.
  if v_reference is null then
    raise exception 'state the reference this advance was paid against (the payment voucher, cheque or transfer reference) -- the register records the purpose and the reference together, once'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_particulars_invalid","axis":"reference"}';
  end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into a from clara.staff_advances sa
    where sa.id = p_advance and sa.client_id = p_client and sa.firm_id = c.firm
    for update;
  if not found then
    raise exception 'staff advance is not in this client' using errcode = 'CLR11';
  end if;
  if a.purpose is not null or a.reference is not null then
    raise exception 'this advance''s particulars are already recorded (purpose: %); the register is append-only and they are set once', a.purpose
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'particulars_already_set',
          'advance_id', p_advance)::text;
  end if;

  update clara.staff_advances set purpose = v_purpose, reference = v_reference
    where id = p_advance;

  perform clara._audit(c.firm, c.actor, null, null, 'complete_staff_advance_particulars', null,
    jsonb_build_object('client', p_client, 'advance', p_advance, 'purpose', v_purpose,
      'reference', v_reference, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'complete_staff_advance_particulars', p_op_key,
    jsonb_build_object('advance_id', p_advance, 'purpose', v_purpose,
      'reference', v_reference));
end $$;
revoke all on function clara.complete_staff_advance_particulars(uuid, uuid, text, text, text)
  from public;

-- =====================================================================================
-- S3.3 -- THE AUTHORITATIVE APPLICATION GUARDS (design SS3.3), in ONE body called from BOTH
-- sides of the WCA-R7 gap.
--
-- WHY ONE BODY. clara.book_staff_advance_application validates so the MAKER learns now (the
-- 0038 "deferring the write must never defer the diagnosis" law), and clara._adv_on_approve
-- re-derives at the CHECKER's approve because the draft window is a window in which other
-- applications land, disbursements are voided and enrolments are retired. Two copies of this
-- arithmetic would be two chances to drift; one body means the verb and the hook can never
-- name different tokens or reach different answers.
--
-- HYPOTHETICAL BY CONSTRUCTION. It runs BEFORE the rows are minted on both sides, so the cap
-- test adds the proposal's own effect to the derived outstanding rather than reading rows that
-- do not exist yet: outstanding_with_proposal(a, d) = _adv_outstanding(a, d) - proposed(a)
-- for every boundary d at or after the entry's posting date (every allocation on one entry
-- shares that one effective_date, so `proposed` is a single number per advance).
--
-- THE ROW LOCKS ARE TAKEN HERE, sorted by advance id -- the same total order the hook and the
-- verb would otherwise each have to remember. The client rung (203005004) is already held by
-- every caller that reaches this point (the verb takes it explicitly; _approve_entry_core and
-- reverse_entry take it before _subledger_on_approve, the 0037 lock-order note).
-- =====================================================================================
create function clara._adv_assert_proposal(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_prop jsonb; v_kind text; v_at timestamptz; v_pd date;
  v_ids uuid[]; al record; l record; a record; g record;
  v_cov bigint;
  -- The temporal cap's answer (arm (iii)), now returned by the shared body rather than
  -- computed here [round 8, lane M3]. `b` and `v_out` went with the walk.
  v_cap jsonb;
  v_line_id uuid; v_line_code text; v_line_credit bigint;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_prop := e.flags -> 'staff_advance_application';
  if v_prop is null then return; end if;
  v_pd := e.posting_date;
  -- The enrolment window is asked at approved_at once the entry is approved and at now() while
  -- it is still a draft -- the same instant the S3.4 belt will use when this entry commits.
  v_at := coalesce(e.approved_at, now());

  v_kind := v_prop ->> 'kind';
  if v_kind is null or v_kind not in ('payroll_deduction', 'bank_return', 'claim') then
    raise exception 'a staff-advance application must state one of the three kinds (payroll_deduction, bank_return, claim); % is not one of them', coalesce(v_kind, '(none)')
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'advance_application_invalid', 'axis', 'kind',
          'entry_id', p_entry, 'kind', v_kind)::text;
  end if;
  -- The type test is a SEPARATE statement from the length test on purpose: jsonb_array_length
  -- raises a raw error on a non-array, and SQL's OR carries no short-circuit guarantee.
  if jsonb_typeof(v_prop -> 'allocations') is distinct from 'array' then
    raise exception 'a staff-advance application must carry at least one explicit allocation -- there is NO silent FIFO in this register (WD-R10)'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'advance_application_invalid',
          'axis', 'allocations', 'entry_id', p_entry)::text;
  end if;
  if jsonb_array_length(v_prop -> 'allocations') = 0 then
    raise exception 'a staff-advance application must carry at least one explicit allocation -- there is NO silent FIFO in this register (WD-R10)'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'advance_application_invalid',
          'axis', 'allocations', 'entry_id', p_entry)::text;
  end if;
  -- ELEMENT SHAPE, RE-CHECKED HERE AND NOT ONLY AT THE VERB. This body is also reached from
  -- the AF-2 composite, whose ABI copies p_advance_applications VERBATIM into the flags -- so
  -- the proposal arriving here is not guaranteed to have passed
  -- book_staff_advance_application's argument validation. Without this, a malformed line_no
  -- would surface at approve time as a raw cast error instead of a named refusal. CASE, not a
  -- flat OR chain, because CASE is what PostgreSQL guarantees will short-circuit.
  if exists (
    select 1 from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem ->> 'advance_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or case when jsonb_typeof(x.elem -> 'line_no') = 'number'
               then (x.elem ->> 'line_no')::numeric <> trunc((x.elem ->> 'line_no')::numeric)
                 or (x.elem ->> 'line_no')::numeric < 1
               else true end
       or case when jsonb_typeof(x.elem -> 'amount_cents') = 'number'
               then (x.elem ->> 'amount_cents')::numeric <= 0
                 or (x.elem ->> 'amount_cents')::numeric
                      <> trunc((x.elem ->> 'amount_cents')::numeric)
               else true end) then
    raise exception 'each staff-advance allocation must state a line_no (a positive whole line number), an advance_id and a positive whole amount_cents'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'advance_application_invalid',
          'axis', 'allocation_shape', 'entry_id', p_entry)::text;
  end if;
  -- ONE ALLOCATION PER (LINE, ADVANCE). The register's unique (application_line_id, advance_id)
  -- would catch a duplicate at mint time as a raw unique_violation; refusing it by name here
  -- tells the caller what to fix -- state one line per advance and add the amounts up.
  if exists (
    select 1 from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
    group by (x.elem ->> 'line_no'), (x.elem ->> 'advance_id') having count(*) > 1) then
    raise exception 'the same advance appears twice against one line of this entry; state one allocation per (line, advance)'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'advance_application_invalid',
          'axis', 'allocation_duplicated', 'entry_id', p_entry)::text;
  end if;

  -- THE BATCH ROW LOCK, IN THE TOTAL ORDER (the 0037 open_items idiom). Every advance this
  -- proposal names is locked before ANY of them is read, so two concurrent applications
  -- against the same advance serialise here rather than both passing a cap test and both
  -- committing (the over-application concurrency cell, design SS7).
  select array_agg(distinct (x.elem ->> 'advance_id')::uuid) into v_ids
    from jsonb_array_elements(v_prop -> 'allocations') as x(elem);
  if v_ids is not null then
    perform 1 from clara.staff_advances sa where sa.id = any(v_ids) order by sa.id for update;
  end if;

  -- ---------------------------------------------------------------------------------
  -- (i) EVERY ALLOCATION NAMES A REAL ADVANCE ON THE LINE IT CREDITS.
  -- ---------------------------------------------------------------------------------
  for al in select (x.elem ->> 'line_no')::int as line_no,
                   (x.elem ->> 'advance_id')::uuid as advance_id,
                   (x.elem ->> 'amount_cents')::bigint as amount_cents
            from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
            order by 2, 1 loop
    if al.line_no is null or al.advance_id is null or coalesce(al.amount_cents, 0) <= 0 then
      raise exception 'each allocation must state a line_no, an advance_id and a positive whole amount_cents'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'advance_application_invalid',
            'axis', 'allocation_shape', 'entry_id', p_entry)::text;
    end if;
    select * into a from clara.staff_advances sa where sa.id = al.advance_id;
    if not found then
      raise exception 'advance % is not in this client', al.advance_id
        using errcode = 'CLR11';
    end if;
    if a.client_id <> e.client_id then
      raise exception 'advance % is not in this client', al.advance_id
        using errcode = 'CLR11';
    end if;
    -- Scalar targets rather than a record: a line_no naming a line this entry does not have is
    -- an ordinary caller mistake, and the refusal must be the NAMED one below rather than a
    -- record-field access on an empty SELECT INTO.
    v_line_id := null; v_line_code := null; v_line_credit := null;
    select jl.id, jl.account_code, jl.credit_cents
      into v_line_id, v_line_code, v_line_credit
      from clara.journal_lines jl
      where jl.entry_id = p_entry and jl.line_no = al.line_no;
    if v_line_id is null or coalesce(v_line_credit, 0) <= 0 then
      raise exception 'allocation line % is not a CREDIT line on this entry; an application discharges an advance and therefore credits it', al.line_no
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'advance_application_invalid',
            'axis', 'line', 'entry_id', p_entry, 'line_no', al.line_no)::text;
    end if;
    -- THE LINE AND THE ADVANCE MUST NAME THE SAME ACCOUNT. Without this test an entry could
    -- credit person A's account while discharging person B's advance: the GL would balance,
    -- the belt's coverage sum would balance, and the register would carry a repayment that
    -- never happened for one person and a debt that was never repaid for another.
    if v_line_code is distinct from a.account_code then
      raise exception 'line % credits % but advance % sits on %; an application must credit the advance''s own account', al.line_no, v_line_code, a.id, a.account_code
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'advance_application_invalid',
            'axis', 'account_mismatch', 'entry_id', p_entry, 'line_no', al.line_no,
            'line_account_code', v_line_code, 'advance_account_code', a.account_code)::text;
    end if;
    if clara._adv_enrolment_at(e.client_id, v_line_code, v_at) is null then
      raise exception 'account % is not an enrolled staff-advance account at this moment; enrol it (or re-enrol it) before applying against it', v_line_code
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'advance_application_invalid',
            'axis', 'not_enrolled', 'entry_id', p_entry,
            'account_code', v_line_code)::text;
    end if;
    -- NO-PREDATE (token application_predates_advance). An application dated before the advance
    -- exists would make the register report a repayment of a debt that had not been incurred,
    -- and would drive the as-of outstanding negative at every date in between.
    if v_pd < a.issue_date then
      raise exception 'this application is dated % but advance % was only issued on %; an advance cannot be repaid before it exists', v_pd, a.id, a.issue_date
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'application_predates_advance',
            'entry_id', p_entry, 'advance_id', a.id, 'posting_date', v_pd,
            'issue_date', a.issue_date)::text;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------------
  -- (ii) COVERAGE EQUALITY -- EVERY CREDIT CENT ON AN ENROLLED ACCOUNT IS ALLOCATED, and no
  -- allocation invents a cent the GL did not move. Equality, not "fits": an under-allocated
  -- credit is a GL movement the register cannot explain (which the S3.4 belt would refuse at
  -- commit anyway) and an over-allocated one is a register discharge the GL never made.
  --
  -- SAME TOKEN AS THE BELT (advance_application_missing, ABI SSF). It is the same defect with
  -- the same remedy -- state the allocations that add up to the credit -- and one token for one
  -- defect is the house doctrine; the axis says which side is short.
  -- ---------------------------------------------------------------------------------
  for l in select jl.line_no, jl.account_code, jl.credit_cents
           from clara.journal_lines jl
           where jl.entry_id = p_entry and jl.credit_cents > 0
             and clara._adv_enrolment_at(e.client_id, jl.account_code, v_at) is not null
           order by jl.line_no loop
    select coalesce(sum((x.elem ->> 'amount_cents')::bigint), 0) into v_cov
      from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
      where (x.elem ->> 'line_no')::int = l.line_no;
    if v_cov <> l.credit_cents then
      raise exception 'line % credits % cents on staff-advance account % but the allocations account for % cents; state one allocation per advance so the two agree exactly', l.line_no, l.credit_cents, l.account_code, v_cov
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'advance_application_missing',
            'axis', case when v_cov < l.credit_cents then 'under' else 'over' end,
            'entry_id', p_entry, 'line_no', l.line_no, 'account_code', l.account_code,
            'credit_cents', l.credit_cents, 'allocated_cents', v_cov)::text;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------------
  -- (iii) THE TEMPORAL CAP (design SS3.3; token advance_over_application). The application must
  -- fit the outstanding at ITS OWN effective_date AND hold that cap at EVERY date boundary at
  -- or after it.
  --
  -- WHY BOTH HALVES. Outstanding is a step function whose steps are the advance's own dates, so
  -- "fits today" says nothing about a BACKDATED application: allocate RM1,000 on 1 March against
  -- an advance that already carries an RM1,000 repayment dated 1 April, and every as-of read
  -- between those two dates reports MINUS RM1,000 owed -- a figure with no meaning, produced by
  -- an act that looked lawful at the moment it was made. Checking every boundary at or after the
  -- new effective date closes that whole class, in both directions (a later correction that has
  -- already given a discharge back is also a boundary, and it is checked too).
  --
  -- THE WALK ITSELF NOW LIVES IN clara._adv_over_application [as-built ladder round 8, lane M3]
  -- and this arm ENFORCES its answer. Nothing about the rule changed -- same boundary set, same
  -- first-breach-in-date-order, same message, same token, same detail keys -- what changed is
  -- that S4.6A's release report can now ASK the cap whether re-booking a released advance
  -- repayment at the line's own date will be admitted, instead of promising a remedy nobody had
  -- asked the cap about (the measured round-8 seam defect; see that body's header).
  -- ---------------------------------------------------------------------------------
  for g in select (x.elem ->> 'advance_id')::uuid as advance_id,
                  sum((x.elem ->> 'amount_cents')::bigint)::bigint as proposed
           from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
           group by 1 order by 1 loop
    v_cap := clara._adv_over_application(g.advance_id, g.proposed, v_pd);
    if v_cap is not null then
      raise exception 'applying % cents against advance % would leave % cents outstanding as at % -- an advance can never be over-applied at any date', g.proposed, g.advance_id, (v_cap ->> 'resulting_cents')::bigint, (v_cap ->> 'boundary_date')::date
        using errcode = 'CLR39',
          detail = (jsonb_build_object('reason', 'advance_over_application',
            'entry_id', p_entry) || v_cap)::text;
    end if;
  end loop;
end $$;
revoke all on function clara._adv_assert_proposal(uuid) from public;

-- =====================================================================================
-- THE PROPOSAL VERB (design SS3.3; ABI SSA/SSB). It DIRECT-INSERTS its draft rather than going
-- through clara.draft_entry, for the reason the Wave-D contract SS3 trap table states:
-- _draft_entry_core extracts only three named booleans from p_flags (0016:4079-4089), so a
-- flags proposal handed to it is silently dropped. The direct INSERT is the SS9.5 lane, and the
-- section-6 tail enumerates every writer that takes it.
--
-- THE WCA-R7 BRANCH, verbatim from clara.allocate_receipt: below the high-stakes threshold the
-- act completes in ONE transaction (draft -> approve -> the hook mints the application rows);
-- at or above it a DRAFT is left carrying the validated proposal and the checker approves it
-- through the ordinary /queue lane, at which point the hook re-derives everything. The envelope
-- says which happened -- application_ids is populated on the posted branch and EMPTY on the
-- drafted branch, because on that branch no register row exists yet and reporting one would be
-- a lie.
-- =====================================================================================
create function clara.book_staff_advance_application(p_client uuid, p_posting_date date,
    p_memo text, p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_memo text; v_reason text;
  v_allocs jsonb; v_n int; v_dis int; v_lines jsonb; v_entry uuid; v_rev uuid;
  v_approve_key text; v_status text; v_app_ids jsonb; v_total bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_posting_date is null then
    raise exception 'a staff-advance application must state its posting date'
      using errcode = 'CLR10',
        detail = '{"reason":"advance_application_invalid","axis":"posting_date"}';
  end if;
  -- ONLY THE THREE PUBLIC KINDS. 'correction' is hook-born only (law 2 of the section header)
  -- and is refused here by name so the boundary is stated at the door rather than discovered
  -- as a CHECK violation.
  if p_kind is null or p_kind not in ('payroll_deduction', 'bank_return', 'claim') then
    raise exception 'a staff-advance application is one of payroll_deduction, bank_return or claim; corrections are born only by reversing the application entry'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'advance_kind_invalid', 'kind', p_kind)::text;
  end if;

  -- NORMALISE AND VALIDATE THE ALLOCATION SET BEFORE ANYTHING ELSE (the allocate_receipt
  -- precedent): a malformed uuid or a fractional amount becomes a NAMED refusal rather than a
  -- raw cast error the caller cannot act on.
  -- Type first, LENGTH SECOND, as two statements: jsonb_array_length raises a raw error on a
  -- non-array and SQL's OR carries no short-circuit guarantee.
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a non-empty json array -- this register has NO silent FIFO (WD-R10)'
      using errcode = 'CLR10', detail = '{"reason":"allocations_malformed"}';
  end if;
  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'the allocation set must be a non-empty json array -- this register has NO silent FIFO (WD-R10)'
      using errcode = 'CLR10', detail = '{"reason":"allocations_malformed"}';
  end if;
  -- The numeric tests sit inside CASE expressions rather than in the OR chain: CASE is the one
  -- construct PostgreSQL guarantees will short-circuit, so a line_no of "abc" is reported as a
  -- malformed allocation instead of as a raw invalid-input-syntax cast error the caller cannot
  -- act on. (allocate_receipt's live body uses the flat OR chain; this is the same test with
  -- the evaluation order made explicit rather than assumed.)
  if exists (
    select 1 from jsonb_array_elements(p_allocations) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem ->> 'advance_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or case when jsonb_typeof(x.elem -> 'line_no') = 'number'
               then (x.elem ->> 'line_no')::numeric <> trunc((x.elem ->> 'line_no')::numeric)
                 or (x.elem ->> 'line_no')::numeric < 1
               else true end
       or case when jsonb_typeof(x.elem -> 'amount_cents') = 'number'
               then (x.elem ->> 'amount_cents')::numeric <= 0
                 or (x.elem ->> 'amount_cents')::numeric
                      <> trunc((x.elem ->> 'amount_cents')::numeric)
               else true end
  ) then
    raise exception 'each allocation must state a line_no (a positive whole line number), an advance_id and a positive whole amount_cents'
      using errcode = 'CLR10', detail = '{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('line_no', t.ln, 'advance_id', t.adv,
             'amount_cents', t.amt) order by t.ln, t.adv), '[]'::jsonb),
         count(*)::int, count(distinct (t.ln::text || ':' || t.adv::text))::int,
         coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_total
    from (select (x.elem ->> 'line_no')::int as ln,
                 (x.elem ->> 'advance_id')::uuid as adv,
                 (x.elem ->> 'amount_cents')::bigint as amt
          from jsonb_array_elements(p_allocations) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same advance appears twice against one line; state one allocation per (line, advance)'
      using errcode = 'CLR10', detail = '{"reason":"allocations_duplicated"}';
  end if;

  -- ABI SSE: the application key hashes (client, date, kind, alloc) and NOTHING ELSE. Two
  -- consequences, stated rather than discovered:
  --   * The allocation array is hashed AS PASSED rather than canonicalised, because the ABI
  --     pins p_allocations itself. A retry that re-orders the array is therefore reported as
  --     different args instead of silently replaying an earlier receipt -- the loud direction.
  --   * p_lines, p_memo and p_reason are NOT in the hash, so a replay under the same op_key
  --     with a different LINE SET returns the first call's receipt. That is the ABI's pinned
  --     field list; the allocations (which name every advance and every cent that reaches the
  --     register) are in it, so no replay can silently move register money -- but a caller who
  --     re-uses one key for two different entries gets the first entry back.
  -- A failed call leaves NO reservation behind (the whole transaction rolls back, 0004:43-60),
  -- so a corrected retry under the same key is always free to proceed.
  v_dedupe := clara._reserve_op(c.firm, 'book_staff_advance_application', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'date', p_posting_date,
      'kind', p_kind, 'alloc', p_allocations)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- PRE-RESERVE THE DERIVED APPROVE SUB-KEY BEFORE ANY LOCK (the allocate_receipt reasoning,
  -- 0037:2678-2698): _reserve_op writes a row and can therefore BLOCK on a concurrent inserter
  -- of the same key, and taking that block while already holding the client rung makes a
  -- deadlock reachable. ON THE DRAFT BRANCH this key stays CLAIMED BUT UNFINISHED for the life
  -- of the draft (ABI SSE) -- the honest cost of moving the reservation ahead of the locks, and
  -- the safe direction: the namespace stays reserved and the checker approves through their own
  -- op_key on the ordinary /queue lane.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'book_staff_advance_application',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- THE ENTRY. The house line validator is used unchanged, so an application entry is exactly
  -- as well-formed as any other draft (it may pick up the 5-sen rounding leg, which lands at
  -- the END of the array and therefore never shifts a caller's line_no).
  --
  -- coding_kind stays NULL BY DESIGN. WC-R9 fixed its meaning as "which control account, which
  -- direction", and an advance has no control account -- WD-R10 keeps the register beside the
  -- GL precisely so it never becomes one. A settlement kind here would also make the entry
  -- non-autopostable machinery's business, which it is not.
  v_lines := clara._validate_entry_lines(p_client, p_lines);
  v_memo := coalesce(nullif(btrim(coalesce(p_memo, '')), ''),
    'Staff advance ' || replace(p_kind, '_', ' '));
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual', c.actor, c.actor,
      -- ABI SSB, the named THIRD proposal key. revise_entry refuses any draft carrying it
      -- (token proposal_not_revisable, section 2's recut): a revision rewrites the lines
      -- wholesale without carrying the proposal's line_no mapping, so a revised application
      -- draft would allocate against lines that no longer mean what the maker said.
      jsonb_build_object('staff_advance_application', jsonb_build_object(
        'kind', p_kind, 'reason', v_reason, 'allocations', v_allocs)))
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description)
    select v_entry, x.ord::int, x.elem ->> 'account_code',
      (x.elem ->> 'debit_cents')::bigint, (x.elem ->> 'credit_cents')::bigint,
      x.elem ->> 'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, ord);
  perform clara._assert_balanced(v_entry);

  -- THE MAKER'S DIAGNOSIS, NOW. Same body the hook will re-run at approve; the allocations are
  -- checked against the lines, the advances, the enrolment window and the temporal cap while
  -- the human who typed them is still here to be told.
  perform clara._adv_assert_proposal(v_entry);

  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read at
  -- INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    -- WCA-R7: leave a DRAFT carrying the validated proposal for a distinct checker.
    v_status := 'drafted';
    v_app_ids := '[]'::jsonb;
  else
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
    -- The ids the HOOK minted -- read back, never predicted. If the hook refused, this line is
    -- never reached: the whole call rolls back and nothing half-lands.
    select coalesce(jsonb_agg(ap.id order by ap.id), '[]'::jsonb) into v_app_ids
      from clara.staff_advance_applications ap where ap.entry_id = v_entry;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'book_staff_advance_application', v_entry,
    jsonb_build_object('client', p_client, 'kind', p_kind, 'posting_date', p_posting_date,
      'allocations', v_allocs, 'allocated_cents', v_total, 'reason', v_reason,
      'status', v_status, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'book_staff_advance_application', p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry,
      'application_ids', v_app_ids, 'allocated_cents', v_total));
end $$;
revoke all on function clara.book_staff_advance_application(uuid, date, text, jsonb, jsonb,
  text, text, text) from public;

-- =====================================================================================
-- S3.4 -- THE APPROVE HOOK (design SS3.3). Section 6 splices `perform
-- clara._adv_on_approve(p_entry);` into clara._subledger_on_approve immediately AFTER
-- clara._adj_on_approve and above the settlement early-return, so all FOUR approve paths reach
-- it and the register materialises in the SAME TRANSACTION as the GL movement (ARCHITECTURE
-- SS3.5, PRD F3) -- one act, or none.
--
-- ARM ORDER IS LOAD-BEARING and is stated in the design:
--   (1) REVERSAL FIRST, THEN RETURN. A mirror never mints a proposal and never soft-births;
--       it unwinds. Returning immediately is what keeps arms (2) and (3) off it.
--   (2) CREDIT LEGS -> the applications named by the proposal, after the authoritative guards
--       have re-derived under the held client rung and the sorted advance row locks.
--   (3) DEBIT LEGS -> soft-birth, ASYMMETRICALLY [WDB-G5]: a debit on an enrolled account
--       births its register row with no particulars and no argument, because a disbursement is
--       an unambiguous fact and blocking books on data entry is the WD-R1 failure this product
--       refuses; a BARE CREDIT is refused by the belt, because which advance a repayment
--       discharges is a JUDGEMENT and the agent inventing it would break "the DB owns every
--       number".
--
-- NO NAMED EVENTS (design SS2.5, ruled): register mutations ride the generic entry.* events
-- their entry already carries. A staff_advance.* event kind would be a second, weaker source
-- of truth for a row that is derived from an entry the stream already reports.
-- =====================================================================================
create function clara._adv_on_approve(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; o record; ap record; l record; a record;
  v_actor uuid; v_prop jsonb; v_kind text; v_reason text; v_at timestamptz;
  v_corrected bigint; v_remainder bigint; v_line_id uuid;
  -- GUARD III's answer: the ADVANCE-SIDE REVERSAL ADMISSION for the entry this mirror unwinds,
  -- all FIVE walls (four at round 8, lane M3; the fifth -- arm (1c)'s `unregistered_mirror` --
  -- at round 9, lane N2; the count corrected here at round 10, Codex finding 4), evaluated at
  -- THIS mirror's own posting date and approve instant. Its enrolment_closed arm carries the
  -- round-2/3 enrolment-admission envelope that
  -- used to be read here (`v_adm`) -- the message still names only the remedy
  -- clara.enrol_staff_advance_account will actually admit, because it is still that body that
  -- composes it [cells x42v.w3, x42v.w7a..w7f].
  v_radm jsonb;
  -- GUARD 0's finding: the enrolment generation this act would be attributed to, when that
  -- generation has already been retired by a committed act stamped at or after our own.
  v_closed uuid; v_closed_at timestamptz;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_actor := coalesce(e.checker_actor, e.maker_actor);
  v_at := coalesce(e.approved_at, now());

  -- ---------------------------------------------------------------------------------
  -- GUARD 0 -- THE ENROLMENT WINDOW CLOSED UNDER THIS ACT [as-built ladder round 3 fix; cells
  -- x42v.w6a..w6e]. Asked ONCE, ABOVE every arm, because every arm is wrong in the same way
  -- when it fires: arm (1) would mint a correction or a void stamp onto a closed generation,
  -- arm (2) would attach an application to it, arm (3) would SOFT-BIRTH a whole advance onto it
  -- -- and `retire_staff_advance_account`'s outstanding guard has already run and cannot run
  -- again. The full ruling, and the reason this is a refusal rather than a re-dating or a
  -- silent out-of-window filing, is argued at `clara._adv_window_closed_under` (S3.0).
  --
  -- THE SCAN IS PRUNED TO CODES THAT COULD POSSIBLY TRIP IT -- a code with at least one RETIRED
  -- enrolment on this client. Every ordinary entry in the product touches none, so the guard
  -- costs one EXISTS per distinct account code and nothing more.
  -- ---------------------------------------------------------------------------------
  for l in select distinct jl.account_code as account_code
           from clara.journal_lines jl
           where jl.entry_id = p_entry
             and exists (select 1 from clara.staff_advance_accounts en
                         where en.client_id = jl.client_id
                           and en.account_code = jl.account_code
                           and en.retired_at is not null)
           order by 1 loop
    v_closed := clara._adv_window_closed_under(e.client_id, l.account_code, v_at);
    if v_closed is not null then
      select en.retired_at into v_closed_at
        from clara.staff_advance_accounts en where en.id = v_closed;
      raise exception 'the staff-advance enrolment on account % was retired at %, after this approval''s own stamp (%) and before the approval ran -- so this movement would land on a register generation that is already closed, and the retirement''s outstanding check could not see it. Retry the approval: the register is shut for this code now, so the entry will post as an ordinary movement outside every enrolment window (staff_advance_tie reports it under out_of_window_cents). If it really is a staff advance, re-enrol the account first and then approve.',
        l.account_code, v_closed_at, v_at
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'advance_movement_unregistered',
            'axis', 'enrolment_closed_mid_approval', 'entry_id', p_entry,
            'account_code', l.account_code, 'enrolment_id', v_closed,
            'approved_at', v_at, 'retired_at', v_closed_at,
            'remedy', 'retry_the_approval')::text;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------------
  -- (1) THE REVERSAL MIRROR (design SS3.3 arm 1). Two effects, and each is dated at the
  -- MIRROR'S posting_date -- which the 0041 SS5.2 MYT splice makes the Malaysian legal date --
  -- so every as-of read BEFORE the reversal still shows the world as the books then stood.
  -- That act-dating IS law 3 of the section header: nothing is retracted from history.
  --
  -- K-family mirrors are skipped whole: the carry-down owns its own rows and reverse_entry
  -- refuses opening entries outright (CLR31), so this is a forward guard, not a live lane.
  -- ---------------------------------------------------------------------------------
  -- ---------------------------------------------------------------------------------
  -- TWO ORDERING GUARDS GOVERN BOTH SUB-ARMS BELOW, stated once here so neither mint has to
  -- argue [as-built ladder fix; cells x42v.d5/d6/d7]. Both are asked AT THE SITE OF THE ACT --
  -- a register act that mints nothing (a zero remainder, an already-voided advance) has nothing
  -- to refuse, so the guards ride inside the loops rather than above them.
  --
  -- GUARD I -- THE WATERMARK, ON THE REGISTER SIDE TOO. Arms (2) and (3) are both window-scoped
  -- (the proposal guards refuse `not_enrolled`; soft-birth skips a line whose code has no
  -- enrolment at approved_at) and so is the tie's GL side and the S3.5 belt -- arm (1) alone
  -- was not, and that asymmetry is a hole, not an economy. Disburse 100,000, apply 100,000
  -- (outstanding 0), retire the enrolment (lawful at 0), then reverse the APPLICATION entry:
  -- the mirror is approved AFTER retired_at, so the belt's join never sees it and the tie's GL
  -- side scores it out-of-window -- but the unguarded arm minted a correction anyway, putting
  -- 100,000 back outstanding on a retired code NOTHING watches and leaving staff_advance_tie
  -- reporting a permanent unclearable break (register 100,000 vs GL 0) where the two sides
  -- actually agree. `clara._adv_enrolment_at` at the MIRROR'S OWN approve instant is the same
  -- instrument the belt and the tie use, so all three now answer one question one way (the S3.0
  -- "one predicate over both worlds" doctrine).
  --
  -- WHY REFUSE RATHER THAN MINT NOTHING. Minting nothing keeps the tie green and silently drops
  -- a debt a person really owes off /advances -- the confident wrong answer this product
  -- refuses (design SS3.4). Refusing states the problem at the act, and the remedy is real and
  -- ordinary: re-enrol the account (admin+), then reverse -- and where the code has been used
  -- for something else since it was retired, the message names the extra step that makes the
  -- re-enrolment admissible rather than sending the caller into a door that will refuse them
  -- [round-2 fix; see the raise site]. The correction then lands inside the new
  -- generation's window, the belt sees the mirror leg and finds its correction, and the tie
  -- holds to the sen across both generations (design SS3.1 -- a retired same-code enrolment
  -- never blocks re-enrolment, precisely so the code can be re-opened).
  --
  -- GUARD II -- AN UNWIND MAY NEVER BE DATED BEFORE THE FACT IT UNWINDS. `clara.reverse_entry`
  -- stamps every mirror at TODAY (MYT) and design SS3.3 pins both register acts to that date
  -- ("dated at the mirror's posting_date"), with no ordering test anywhere -- so a FUTURE-DATED
  -- original produced an unwind that lands BEFORE its own fact and made the SS3.2 equation
  -- report figures with no meaning: a disbursement dated 2026-11-01 reversed today gave
  -- void_effective_date < issue_date and drove historical outstanding to MINUS 100,000, and an
  -- application dated 2026-11-01 reversed today gave a correction effective before the
  -- application it gives back, so the register reported 200,000 owed on a 100,000 advance.
  --
  -- THE DATE IS NOT RE-DERIVED, THE ACT IS REFUSED. Clamping the register act forward (to the
  -- issue date / the application's date) would make the register disagree with the GL over the
  -- whole interval -- and the GL is equally unordered here, because the mirror really is posted
  -- today -- which is the one thing the tie exists to make impossible. Design SS3.3 pins the
  -- date; this guard keeps the case that pinning cannot describe from being created at all.
  -- The refusal aborts the whole reversal (the hook runs in the approving transaction), and it
  -- is exactly as narrow as the defect: it can only fire when the entry being reversed is dated
  -- in the future, which is also the honest accounting answer -- August cannot un-do something
  -- the books say happens in November.
  -- ---------------------------------------------------------------------------------
  if e.reversal_of is not null then
    if not e.is_opening_balance then
      select * into o from clara.journal_entries where id = e.reversal_of;
      if not found then return; end if;

      -- -------------------------------------------------------------------------------
      -- GUARD III -- THE WALL IS RE-ASKED HERE, AT THE ACT, UNDER THIS ACT'S OWN LOCKS
      -- [as-built ladder round 4 fix; cells x42v.g1/g2/g3]. Section 2's
      -- clara._wdb_reversal_blocked ran at clara.reverse_entry -- which, at or above the
      -- firm's high-stakes floor, only DRAFTS the mirror. Everything it decided was a value
      -- read before a decision and trusted after it, across a gap in which repayments land.
      -- The full argument, the measured failure and the reason arm (a) is NOT re-asked are
      -- written at clara._adv_reversal_blocked (S3.0).
      --
      -- THE LOCK COMES FIRST, AND IT IS THE POINT. "Re-asked at the act" is worth nothing if
      -- a concurrent clara.book_staff_advance_application can commit a repayment between the
      -- question and the void. clara._adv_assert_proposal locks exactly the advances it will
      -- apply to, `order by sa.id for update`; this takes the same rows in the same total
      -- order (the 0037 open_items idiom, under the 203005004 client rung both callers
      -- already hold), so the two serialise: either the repayment commits first and this read
      -- sees it, or this act holds the row and the repayment re-derives its cap against a
      -- voided advance. BOTH SETS are locked -- the advances this entry BORE (arm 1b would
      -- void them) and the advances its applications DISCHARGED (arm 1a would correct them).
      --
      -- IT SITS ABOVE BOTH SUB-ARMS AND WRITES NOTHING FIRST. A refusal must abort the whole
      -- reversal by name, never leave a half-corrected, half-voided entry -- so the question
      -- is asked before the first row is minted rather than per-row inside the loops. (Arm
      -- 1a's own corrections cannot legitimately clear arm (b) here: an application on an
      -- entry can only name an advance that ALREADY existed when that entry was drafted, so
      -- an entry's applications never point at the advances that same entry bore.)
      -- -------------------------------------------------------------------------------
      perform 1 from clara.staff_advances sa
        where sa.entry_id = o.id
           or sa.id in (select ax.advance_id from clara.staff_advance_applications ax
                        where ax.entry_id = o.id)
        order by sa.id
        for update;
      -- ...AND ALL FIVE WALLS, NOT TWO [as-built ladder round 8 fix, lane M3; the count amended
      -- at round 9 when arm (1c) joined, and this comment corrected at round 10 -- Codex r10
      -- finding 4: it still said FOUR while the source three screens down correctly said five,
      -- and a stale count in the one comment a reader consults about completeness is how the
      -- next author concludes the set is closed]. GUARD III used to ask
      -- clara._adv_reversal_blocked -- arms (b) and (c) -- and the OTHER walls were written out
      -- inside the two loops below. Nothing outside this body could ask about them, so S4.6A's
      -- release report promised clara.reverse_entry(E) on bookings this hook refuses CLR40
      -- (measured). All FIVE now live in clara._adv_reversal_admission and THIS is the
      -- site that enforces them: `first` is carried-then-dated, the hook's own order, so the
      -- refusal a caller meets is byte-identical to the one the arms used to raise in place.
      -- The mirror's REAL posting date and approve instant travel with the question -- the
      -- report can only PREDICT them, and the envelope says which it got.
      v_radm := clara._adv_reversal_admission(o.id, 'mirror_approval', e.client_id,
                  e.posting_date, v_at, p_entry);
      if not (v_radm ->> 'admitted')::boolean then
        raise exception '%', v_radm -> 'first' ->> 'message'
          using errcode = v_radm -> 'first' ->> 'errcode',
                detail = v_radm -> 'first' ->> 'detail';
      end if;

      -- (1a) A REVERSED APPLICATION ENTRY -> ONE CORRECTION PER ORIGINAL ROW, AT THE
      -- UNCORRECTED REMAINDER. The remainder arithmetic (original minus everything already
      -- given back) is what makes a second correction structurally incapable of handing back
      -- more than was ever applied -- the SS3.2 "cumulative <= original" law, enforced rather
      -- than assumed. A zero remainder mints NO row: an application that has already been
      -- fully corrected has nothing left to unwind, and an amount_cents=0 row would violate the
      -- table's own CHECK and would be a lie in the statement besides.
      for ap in select x.* from clara.staff_advance_applications x
                where x.entry_id = o.id and x.kind <> 'correction'
                order by x.id loop
        select coalesce(sum(cx.amount_cents), 0) into v_corrected
          from clara.staff_advance_applications cx
          where cx.reverses_application_id = ap.id;
        v_remainder := ap.amount_cents - v_corrected;
        if v_remainder > 0 then
          -- GUARDS I AND II ARE NO LONGER ASKED HERE [round 8, lane M3]: GUARD III above has
          -- just asked BOTH of them, for THIS application and for every other one this mirror
          -- would touch, through clara._adv_reversal_admission -- in this exact order, with this
          -- mirror's own posting date and approve instant, under the row locks already held. The
          -- full argument for each wall stays in the arm header above (it is the record of why
          -- they exist); the raises moved so that the release report can ask the same body
          -- instead of predicting from half of it. This loop now only MINTS.
          -- THE CORRECTION CARRIES THE MIRROR'S OWN LINE. application_line_id is NOT NULL and
          -- unique per (line, advance), and the only honest line for an unwind is the mirror
          -- leg that reversed the original leg -- same line_no, opposite side. It is a DEBIT
          -- leg, which reads oddly for an "application" until you remember what the row means:
          -- a correction gives the discharge back, so the GL leg that carries it is a debit.
          select ml.id into v_line_id
            from clara.journal_lines ml
            join clara.journal_lines ol on ol.line_no = ml.line_no and ol.entry_id = o.id
            where ml.entry_id = p_entry and ol.id = ap.application_line_id;
          if v_line_id is null then
            -- An internal-contract violation, not a lane: reverse_entry copies every line at
            -- the same line_no, so a missing twin means the mirror was built by something that
            -- does not follow that recipe. Loud at first execution (the 0037
            -- 'subledger_hook_not_approved' precedent).
            raise exception 'the reversal mirror carries no line matching the application leg being corrected'
              using errcode = 'CLR39',
                detail = jsonb_build_object('reason', 'advance_application_invalid',
                  'axis', 'mirror_line_missing', 'entry_id', p_entry,
                  'application_id', ap.id)::text;
          end if;
          insert into clara.staff_advance_applications(firm_id, client_id, advance_id,
              enrolment_id, application_line_id, entry_id, kind, amount_cents,
              effective_date, reverses_application_id, created_by, reason)
            values (e.firm_id, e.client_id, ap.advance_id, ap.enrolment_id, v_line_id,
              p_entry, 'correction', v_remainder, e.posting_date, ap.id, v_actor,
              coalesce(nullif(btrim(coalesce(e.reversal_reason, '')), ''), 'reversal'));
        end if;
      end loop;

      -- (1b) A REVERSED DISBURSEMENT -> THE VOID STAMP. The register row is NEVER deleted and
      -- never rewritten: it keeps its cost, its date and its particulars, and gains the two
      -- void columns so the outstanding equation drops it from the void date FORWARD. GUARD
      -- III above has just re-asked the advance-side admission UNDER THIS TRANSACTION'S ROW
      -- LOCKS, so a void can only ever land on a clean row. That sentence used to read
      -- "section 2's arm (b) has already refused this reversal" -- which was TRUE of the
      -- one-transaction path and FALSE of the high-stakes one, where section 2 ran at a
      -- reverse_entry that merely drafted this mirror [round 4].
      --
      -- THE TWO ROW-LEVEL GUARDS THIS ARM USED TO WALK ITSELF -- the enrolment window and the
      -- date ordering, asked of EVERY row the stamp would touch, in id order, before any of
      -- them is written -- are now walked by clara._adv_reversal_admission's own (1b) pass at
      -- GUARD III [round 8, lane M3]. The reason they are walked row by row rather than folded
      -- into a WHERE clause is unchanged and is the reason they had to move together: a row
      -- that fails must ABORT the reversal by name, never be silently skipped into a
      -- half-voided entry -- and a report that could see only two of the walls promised a
      -- reversal this hook refuses.
      update clara.staff_advances sv
        set voided_by_entry_id = p_entry, void_effective_date = e.posting_date
        where sv.entry_id = o.id and sv.voided_by_entry_id is null;
    end if;
    return;
  end if;

  -- ---------------------------------------------------------------------------------
  -- (2) THE APPLICATION PROPOSAL (design SS3.3 arm 2). The guards below are the AUTHORITATIVE
  -- ones -- the verb's identical call was a courtesy to the maker; THIS one decides, because
  -- it runs under the held client rung with the advances row-locked at the moment the money
  -- actually moves. The WCA-R7 draft window is a window in which other applications land and
  -- disbursements are voided.
  -- ---------------------------------------------------------------------------------
  v_prop := e.flags -> 'staff_advance_application';
  if v_prop is not null then
    perform clara._adv_assert_proposal(p_entry);
    v_kind := v_prop ->> 'kind';
    v_reason := nullif(btrim(coalesce(v_prop ->> 'reason', '')), '');
    for ap in select (x.elem ->> 'line_no')::int as line_no,
                     (x.elem ->> 'advance_id')::uuid as advance_id,
                     (x.elem ->> 'amount_cents')::bigint as amount_cents
              from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
              order by 2, 1 loop
      select * into a from clara.staff_advances sa where sa.id = ap.advance_id;
      select jl.id into v_line_id from clara.journal_lines jl
        where jl.entry_id = p_entry and jl.line_no = ap.line_no;
      -- enrolment_id is the ADVANCE's generation, not the one live today: an application
      -- belongs to the enrolment that issued the advance, and that binding must survive a
      -- retire-and-re-enrol of the same code (the SS3.4 historical as-of drill).
      insert into clara.staff_advance_applications(firm_id, client_id, advance_id,
          enrolment_id, application_line_id, entry_id, kind, amount_cents,
          effective_date, reverses_application_id, created_by, reason)
        values (e.firm_id, e.client_id, a.id, a.enrolment_id, v_line_id, p_entry,
          v_kind, ap.amount_cents,
          -- THE EFFECTIVE DATE IS THE ENTRY'S POSTING DATE, hook-derived (design SS3.2). The
          -- day the money moved is the only date an as-of read can honestly use; a caller-
          -- supplied one would let the register and the GL disagree about when.
          e.posting_date, null, v_actor, v_reason);
    end loop;
  end if;

  -- ---------------------------------------------------------------------------------
  -- (3) SOFT-BIRTH (design SS3.3 arm 3; [WDB-G5] the asymmetry). ONE ROW PER DEBIT LINE on an
  -- account enrolled AT THIS ENTRY'S approved_at -- two people paid on one entry births two
  -- rows, which is the truth. EXCLUSIONS: opening entries (the K-family owns its own rows, and
  -- there is no itemised advance opening kind in v1 -- an enrolled code must be carried down
  -- BEFORE it is enrolled, which the enrol-clean-only rule already forces) and reversal mirrors
  -- (arm 1 owns those, and it has already returned).
  --
  -- ON CONFLICT DO NOTHING on the unique disbursement line: a replay births nothing twice, and
  -- the register's 1:1 with the GL leg is structural rather than remembered.
  -- ---------------------------------------------------------------------------------
  if not e.is_opening_balance and e.reversal_of is null then
    for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                    clara._adv_enrolment_at(jl.client_id, jl.account_code, v_at) as enrolment_id
             from clara.journal_lines jl
             where jl.entry_id = p_entry and jl.debit_cents > 0
             order by jl.id loop
      if l.enrolment_id is null then continue; end if;
      insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
          disbursement_line_id, entry_id, issue_date, amount_cents)
        values (e.firm_id, e.client_id, l.enrolment_id, l.account_code, l.line_id,
          p_entry, e.posting_date, l.debit_cents)
        on conflict (disbursement_line_id) do nothing;
    end loop;
  end if;
end $$;
revoke all on function clara._adv_on_approve(uuid) from public;

-- =====================================================================================
-- S3.5 -- THE MOVEMENT BELT (design SS3.3). A DEFERRED CONSTRAINT TRIGGER on
-- clara.journal_entries, gated WHEN (new.status='approved'), with the legs re-derived by join
-- -- the 0041 clara._tf_fa_movement_belt shape, cloned. It is the F3 bar made structural: an
-- approved GL movement on an enrolled advance account CANNOT skip the register, whatever verb
-- wrote it, because this fires in the same transaction and aborts it.
--
-- THE WATERMARK is the enrolment interval evaluated at approved_at, closed at both ends, for
-- the reason 0041's belt states [round-3 fold F5a]: this trigger is INITIALLY DEFERRED, so one
-- transaction could approve a hand journal against an enrolled account and retire the enrolment
-- before commit -- and a half-open bound would hand that race to the retirer.
--
-- THE ASYMMETRY IS THE RULING [WDB-G5]. A DEBIT is admitted because arm (3) of the hook has
-- already soft-birthed its row; a bare CREDIT is REFUSED, because which advance a repayment
-- discharges cannot be derived from the GL and the register would otherwise have to guess.
-- =====================================================================================
create function clara._tf_adv_movement_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_cov bigint; v_backed boolean;
begin
  for r in
    -- line_no is selected for DOOR (c) ONLY: reverse_entry (and clara._pair_reverse_core)
    -- copy every leg at the SAME line_no with the two sides swapped, so the line_no is the
    -- only handle that says WHICH original leg this mirror leg unwinds.
    --
    -- THE WATERMARK IS READ THROUGH clara._adv_enrolment_at, NOT RE-INLINED HERE [as-built
    -- ladder round 2 fix]. The interval test lives in exactly one body (S3.0), so the belt,
    -- the hook and the tie cannot drift into two readings of one window -- and this site in
    -- particular is where a re-inlined `approved_at >= enrolled_at` silently skipped a leg
    -- whose enrolment had committed before the approve actually ran (see S3.0's argument).
    -- The `distinct` the join needed is gone with the join: the reader returns ONE generation,
    -- so a line appears once whatever its code's enrolment history looks like.
    select jl.id as line_id, jl.line_no, jl.account_code,
           jl.debit_cents, jl.credit_cents
    from clara.journal_lines jl
    where jl.entry_id = new.id
      and clara._adv_enrolment_at(jl.client_id, jl.account_code, new.approved_at) is not null
    order by 1
  loop
    -- (a) THE DEBIT CARRIES ITS REGISTER ROW. Status-blind on purpose: a voided advance still
    -- opens the door for its own reversal mirror, exactly as 0041's door (a) does.
    if r.debit_cents > 0
       and exists (select 1 from clara.staff_advances sa
                   where sa.disbursement_line_id = r.line_id) then
      continue;
    end if;
    -- (b) THE CREDIT IS COVERED TO THE SEN. Corrections are excluded from the coverage sum
    -- because they never attach to an ordinary application leg -- they attach to the MIRROR's
    -- leg, and mirrors leave through door (c) below. Excluding them explicitly says so rather
    -- than relying on that being true forever.
    if r.credit_cents > 0 then
      select coalesce(sum(ap.amount_cents), 0) into v_cov
        from clara.staff_advance_applications ap
        where ap.application_line_id = r.line_id and ap.kind <> 'correction';
      if v_cov = r.credit_cents then continue; end if;
    end if;
    -- ---------------------------------------------------------------------------------
    -- (c) THE REVERSAL-MIRROR DOOR -- CONDITIONAL ON THE UNWIND ACTUALLY EXISTING
    -- [as-built ladder fix; cells x42v.b5/b6/b7].
    --
    -- A mirror's advance leg is the swap of the original's: a reversed application DEBITS the
    -- advance account (and its register effect is the correction row arm (1a) minted, which is
    -- keyed to this very line but is not a "register row" door (a) would find), and a reversed
    -- disbursement CREDITS it (and its register effect is the void stamp, which mints no
    -- application at all). Neither shape can satisfy (a) or (b) -- so the door exists.
    --
    -- BUT THE DOOR'S PREMISE IS "AND BOTH ARE FULLY ACCOUNTED FOR", AND THAT IS ONLY TRUE OF A
    -- MIRROR OF A REGISTERED MOVEMENT. An unconditional `reversal_of is not null -> continue`
    -- exempts every leg of every mirror, including the mirror of a movement the register never
    -- held -- and a mirror of an UNREGISTERED movement is accounted for by NOTHING. The lane
    -- that proved it: book Dr X / Cr bank and Dr wages / Cr X while X is NOT yet enrolled (no
    -- register rows, net GL zero, so enrol-clean-only still admits X), enrol X, then reverse
    -- the credit entry. The mirror DEBITS X in window; arm (1a) finds no application on the
    -- original and mints nothing; arm (3) never runs on a mirror [design SS3.3]; door (a) finds
    -- no register row -- and the unconditional door waved it through. The GL then said 50,000
    -- was owed while the register said 0: retire_staff_advance_account succeeded against a real
    -- balance and a later repayment credit could never be applied (there was no advance row to
    -- apply to). The credit direction is the same defect mirrored -- reversing a PRE-enrolment
    -- disbursement credits X in window with no advance row to void, and the GL went NEGATIVE.
    --
    -- SO THE DOOR ASKS FOR THE UNWIND ITSELF, PER LEG, as POSITIVE EVIDENCE rather than as an
    -- inference from `reversal_of`:
    --   * a mirror DEBIT passes iff arm (1a) minted a correction ONTO THIS LEG;
    --   * a mirror CREDIT passes iff arm (1b) stamped the void of THE ADVANCE THIS LEG'S TWIN
    --     ORIGINAL LEG BIRTHED, naming this very mirror.
    -- Every lawful correction and every lawful void satisfies one of those by construction (the
    -- hook has already run in this transaction -- this trigger is DEFERRED), so nothing lawful
    -- changes; only the mirror with no register act behind it now falls through to the named
    -- refusals.
    --
    -- POSITIVE EVIDENCE RATHER THAN "THE ORIGINAL WAS IN WINDOW", MEASURED NOT ASSUMED. The
    -- proxy would be cheaper but it answers a different question: it asserts that the register
    -- SHOULD have acted, where the belt's whole job is to establish that it DID. The one case
    -- that separates them -- a second mirror of the same original, which would mint nothing at a
    -- zero remainder -- turns out to be caught upstream already: reverse_entry leaves a DRAFT
    -- mirror on its high-stakes branch without stamping reversed_by, so two drafts really are
    -- reachable, but the approve path refuses the second with the pre-existing 'the original was
    -- already reversed' (CLR10, probed). So the difference is defence in depth today, not a live
    -- lane -- and the evidence shape is still the right one, because it cannot go stale if that
    -- upstream guard ever moves.
    --
    -- NOT SOFT-BIRTH. Design SS3.3 pins arm (3) at `NOT is_opening_balance AND reversal_of IS
    -- NULL`; birthing an advance off a mirror debit would rewrite that pinned predicate and
    -- invent a disbursement the books never made. The register refuses instead, and says why.
    -- ---------------------------------------------------------------------------------
    if new.reversal_of is not null then
      if r.debit_cents > 0 then
        v_backed := exists (select 1 from clara.staff_advance_applications ap
                            where ap.application_line_id = r.line_id
                              and ap.kind = 'correction');
      else
        v_backed := exists (select 1 from clara.staff_advances sv
                            join clara.journal_lines ol on ol.id = sv.disbursement_line_id
                            where ol.entry_id = new.reversal_of and ol.line_no = r.line_no
                              and sv.voided_by_entry_id = new.id);
      end if;
      if v_backed then continue; end if;
      raise exception 'this entry reverses a movement on staff-advance account % that the register never held: the mirror % % cents, but the leg it unwinds carried no register act (no advance row to void, no application to correct), so the GL would move where the register cannot follow. Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.',
        r.account_code,
        case when r.debit_cents > 0 then 'debits' else 'credits' end,
        greatest(r.debit_cents, r.credit_cents)
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'advance_movement_unregistered',
            'axis', 'unregistered_mirror', 'entry_id', new.id,
            'account_code', r.account_code, 'line_id', r.line_id,
            'debit_cents', r.debit_cents, 'credit_cents', r.credit_cents,
            'reversal_of', new.reversal_of)::text;
    end if;

    if r.credit_cents > 0 then
      raise exception 'this entry credits % cents on staff-advance account % without saying which advance it discharges; book it through book_staff_advance_application (or resolve_and_book_bank_line) with an explicit allocation -- the register never guesses', r.credit_cents, r.account_code
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'advance_application_missing',
            'entry_id', new.id, 'account_code', r.account_code,
            'line_id', r.line_id, 'credit_cents', r.credit_cents,
            'allocated_cents', coalesce(v_cov, 0))::text;
    end if;
    raise exception 'this entry moves staff-advance account % without a register act; disburse through an ordinary coded entry (the register row is born at approval), and carry any pre-enrolment balance down BEFORE the account is enrolled', r.account_code
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'advance_movement_unregistered',
          'entry_id', new.id, 'account_code', r.account_code,
          'line_id', r.line_id, 'debit_cents', r.debit_cents,
          'is_opening_balance', new.is_opening_balance)::text;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_adv_movement_belt() from public;
create constraint trigger t_je_adv_movement_belt after insert or update on clara.journal_entries
  deferrable initially deferred for each row when (new.status = 'approved')
  execute function clara._tf_adv_movement_belt();

-- #####################################################################################
-- ################ S3.6 -- THE READS (design SS3.4; the /advances surface) #############
-- #####################################################################################
-- Three visibility-only RPCs, each viewer-floored, firm-scoped, returning ONE jsonb object,
-- and each computing every figure it shows from rows. EXPLAINED COLUMNS throughout (the
-- Gate-1 C3 posture the FA tie already carries): a number the register cannot hold is
-- reported in its own named column rather than left to read as an unexplained break.

-- =====================================================================================
-- staff_advance_summary (ABI SSA). The as-of register: one row per advance issued by p_as_of,
-- with its derived outstanding and age, plus the EA 1955 advisory notes.
--
-- THE POLICY NOTES ARE READ AT TODAY, NOT AT p_as_of, and that is deliberate. The as-of governs
-- the FIGURES; the notes are compliance guidance addressed to the professional reading the
-- screen now. clara.ea1955_policy's effective_from is the date a note entered Clara (the
-- migration date), NOT the date the statute began -- so filtering them by a historical as-of
-- would report "no EA 1955 rules were in force in June 2026", which is false and is exactly the
-- kind of confident wrong answer this product refuses to give. The effective-dating still does
-- its real job: a note that has been superseded (effective_to set) stops showing.
-- =====================================================================================
create function clara.staff_advance_summary(p_client uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_as_of date; v_today date; v_rows jsonb; v_notes jsonb;
  v_incomplete int; v_open bigint;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl
                 where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_today := clara._fa_today();
  v_as_of := coalesce(p_as_of, v_today);

  select coalesce(jsonb_agg(jsonb_build_object(
             'enrolment_id', t.enrolment_id, 'account_code', t.account_code,
             'person_label', t.person_label, 'advance_id', t.advance_id,
             'issue_date', t.issue_date, 'amount_cents', t.amount_cents,
             'outstanding_cents', t.outstanding_cents,
             'days_outstanding', t.days_outstanding,
             'purpose', t.purpose, 'reference', t.reference,
             'voided', t.voided, 'particulars_complete', t.purpose is not null,
             'enrolment_active', t.enrolment_active)
           order by t.account_code, t.issue_date, t.advance_id), '[]'::jsonb),
         coalesce(sum(t.outstanding_cents), 0),
         (count(*) filter (where t.purpose is null and not t.voided))::int
    into v_rows, v_open, v_incomplete
    from (select en.id as enrolment_id, a.account_code, en.person_label, en.active as enrolment_active,
                 a.id as advance_id, a.issue_date, a.amount_cents,
                 clara._adv_outstanding(a.id, v_as_of) as outstanding_cents,
                 (v_as_of - a.issue_date) as days_outstanding,
                 a.purpose, a.reference,
                 (a.void_effective_date is not null
                    and a.void_effective_date <= v_as_of) as voided
          from clara.staff_advances a
          join clara.staff_advance_accounts en on en.id = a.enrolment_id
          -- AN ADVANCE THAT HAS NOT BEEN ISSUED BY THE AS-OF DATE IS NOT IN THE REGISTER AT
          -- THAT DATE. Its outstanding would be zero anyway; showing the row would report a
          -- debt that did not yet exist.
          where a.client_id = p_client and a.firm_id = c.firm
            and a.issue_date <= v_as_of) t;

  select coalesce(jsonb_agg(jsonb_build_object('fact', p.fact, 'note', p.note,
             'source_note', p.source_note) order by p.fact), '[]'::jsonb)
    into v_notes from clara.ea1955_policy p
    where p.effective_from <= v_today
      and (p.effective_to is null or p.effective_to > v_today);

  return jsonb_build_object('client_id', p_client, 'as_of', v_as_of,
    'advances', v_rows, 'outstanding_cents', v_open,
    'incomplete_count', v_incomplete, 'policy_notes', v_notes);
end $$;
revoke all on function clara.staff_advance_summary(uuid, date) from public;

-- =====================================================================================
-- staff_advance_statement (ABI SSA). The per-ACCOUNT movement statement, walking EVERY
-- enrolment generation on the code (design SS3.4) -- an account that was retired and re-issued
-- to a second holder still reads as one continuous account history, which is what the GL shows
-- and therefore what the statement must show.
--
-- THE RUNNING BALANCE IS ABSOLUTE, NOT WINDOWED. It is accumulated from the FIRST movement ever
-- and only then filtered to [p_from, p_to], so a row in the middle of a window reports the true
-- outstanding at that point rather than a balance that starts from zero at the window's edge.
-- opening_cents/closing_cents state the two ends explicitly.
--
-- amount_cents is the SIGNED movement (+ disbursement, - application, + correction, - void), so
-- the running column is visibly the sum of the amount column and nothing is hidden in a sign
-- convention the reader has to infer.
-- =====================================================================================
create function clara.staff_advance_statement(p_client uuid, p_account_code text,
    p_from date, p_to date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_from date; v_to date; v_rows jsonb; v_open bigint; v_close bigint;
  v_gens jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl
                 where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_account_code is null or btrim(p_account_code) = '' then
    raise exception 'an account code is required' using errcode = 'CLR10';
  end if;
  v_from := coalesce(p_from, '-infinity'::date);
  v_to := coalesce(p_to, clara._fa_today());

  -- SAME-DAY ORDERING IS EXPLICIT: a disbursement precedes an application precedes a void on
  -- one date (seq 0/1/2), and the row id breaks any remaining tie -- so the running balance is
  -- deterministic rather than dependent on scan order.
  with mv as (
    select a.issue_date as d, 0 as seq, 'disbursement'::text as kind,
           a.entry_id as entry_id, a.amount_cents as delta,
           null::text as application_kind, null::text as reason,
           a.id as advance_id, a.id::text as sort_id
      from clara.staff_advances a
      where a.client_id = p_client and a.firm_id = c.firm
        and a.account_code = p_account_code
    union all
    select ap.effective_date, 1, 'application',
           ap.entry_id,
           case when ap.kind = 'correction' then ap.amount_cents else -ap.amount_cents end,
           ap.kind, ap.reason, ap.advance_id, ap.id::text
      from clara.staff_advance_applications ap
      join clara.staff_advances a on a.id = ap.advance_id
      where a.client_id = p_client and a.firm_id = c.firm
        and a.account_code = p_account_code
    union all
    select a.void_effective_date, 2, 'void',
           a.voided_by_entry_id, -a.amount_cents, null, null, a.id, a.id::text
      from clara.staff_advances a
      where a.client_id = p_client and a.firm_id = c.firm
        and a.account_code = p_account_code
        and a.void_effective_date is not null
  ), ord as (
    select mv.*, (sum(mv.delta) over (order by mv.d, mv.seq, mv.sort_id
             rows between unbounded preceding and current row))::bigint as running
      from mv
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', o.d, 'kind', o.kind,
             'entry_id', o.entry_id, 'advance_id', o.advance_id,
             'amount_cents', o.delta, 'running_cents', o.running,
             'application_kind', o.application_kind, 'reason', o.reason)
           order by o.d, o.seq, o.sort_id)
           filter (where o.d >= v_from and o.d <= v_to), '[]'::jsonb),
         coalesce(sum(o.delta) filter (where o.d < v_from), 0),
         coalesce(sum(o.delta) filter (where o.d <= v_to), 0)
    into v_rows, v_open, v_close
    from ord o;

  -- EVERY GENERATION, NAMED. The statement spans them all, so the reader is told which person
  -- held the account when -- otherwise a re-issued code reads as one person's impossible history.
  select coalesce(jsonb_agg(jsonb_build_object('enrolment_id', en.id,
             'person_label', en.person_label, 'enrolled_at', en.enrolled_at,
             'retired_at', en.retired_at, 'active', en.active,
             'attestation', en.enrolment_attestation)
           order by en.enrolled_at, en.id), '[]'::jsonb)
    into v_gens from clara.staff_advance_accounts en
    where en.client_id = p_client and en.firm_id = c.firm
      and en.account_code = p_account_code;

  return jsonb_build_object('client_id', p_client, 'account_code', p_account_code,
    'from', case when v_from = '-infinity'::date then null else to_jsonb(v_from) end,
    'to', v_to, 'opening_cents', v_open, 'closing_cents', v_close,
    'rows', v_rows, 'generations', v_gens);
end $$;
revoke all on function clara.staff_advance_statement(uuid, text, date, date) from public;

-- =====================================================================================
-- staff_advance_tie (ABI SSA; design SS3.4). The as-of Sigma-register = GL assertion, GROUPED BY
-- ACCOUNT CODE and walking every enrolment generation.
--
-- THE GL SIDE IS SCOPED TO THE UNION OF THE CODE'S ENROLMENT WINDOWS, matching the belt's
-- watermark exactly -- and that is the whole point. The register is born at enrolment and
-- nothing is created retroactively, so GL history the account carried BEFORE it was ever
-- enrolled, or AFTER it was retired and repurposed, is movement the register can never hold.
-- Comparing against the whole account would report that as a permanent red break with nothing
-- to point at; scoping the comparison and reporting the remainder in its own
-- out_of_window_cents column turns it into an EXPLAINED number a professional can act on -- and
-- means a retired code re-used as an ordinary expense account cannot permanently break this
-- surface (design SS3.4, stated).
--
-- `explained` is TRUE when the scoped comparison ties to the sen. out_of_window_cents is not a
-- failure: it is the named, expected residue the scoping deliberately excludes, and it is shown
-- so the reader can see it rather than infer it.
-- =====================================================================================
create function clara.staff_advance_tie(p_client uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; r record; v_rows jsonb := '[]'::jsonb; v_tie boolean := true;
  v_reg bigint; v_gl bigint; v_out bigint; v_active uuid; v_n int; v_incomplete int;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl
                 where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_as_of is null then
    raise exception 'an as-of date is required' using errcode = 'CLR10';
  end if;

  for r in
    select t.code from (
        select en.account_code as code from clara.staff_advance_accounts en
          where en.client_id = p_client and en.firm_id = c.firm
        union
        select a.account_code from clara.staff_advances a
          where a.client_id = p_client and a.firm_id = c.firm) t
    order by 1
  loop
    -- THE REGISTER SIDE: the derived outstanding of every advance the code has ever carried,
    -- across every generation. _adv_outstanding already returns zero for an advance not yet
    -- issued and for a voided one past its void date, so no extra filter is written here --
    -- the equation is the filter.
    select coalesce(sum(clara._adv_outstanding(a.id, p_as_of)), 0), count(*)::int,
           (count(*) filter (where a.purpose is null
                               and (a.void_effective_date is null
                                    or a.void_effective_date > p_as_of)
                               and a.issue_date <= p_as_of))::int
      into v_reg, v_n, v_incomplete
      from clara.staff_advances a
      where a.client_id = p_client and a.firm_id = c.firm and a.account_code = r.code;

    -- ---------------------------------------------------------------------------------
    -- THE GL SIDE AND ITS REMAINDER, IN ONE PASS OVER ONE PREDICATE. An entry is in scope iff
    -- its approval falls inside SOME enrolment window for this code -- asked through
    -- clara._adv_enrolment_at, the SAME body the S3.5 belt calls, so the two instruments agree
    -- by construction rather than by coincidence. The two sums used to be two queries carrying
    -- two copies of an inlined interval test; they are now one scan with `filter`, so the
    -- in-window set and its complement cannot drift apart even by a typo.
    --
    -- ...PLUS POSITIVE REGISTER EVIDENCE [as-built ladder round 2 fix; cell x42v.w1]. The tie
    -- reads long after the act and can only see the STAMP, so it cannot re-derive the approval
    -- INTERVAL that S3.0 uses at act time: an entry approved in the race band carries an
    -- approved_at that really does predate the enrolment, and a stamp compare alone would score
    -- its leg out-of-window while the register genuinely holds the row the belt demanded. So a
    -- leg the register DEMONSTRABLY acted on is in-window whatever the stamp says.
    --
    -- WHY THAT CANNOT OVER-ADMIT, BY CONSTRUCTION. Every register act is minted by
    -- clara._adv_on_approve under the same watermark and then re-checked by the belt, and the
    -- belt admits a leg only on POSITIVE evidence: a debit needs its staff_advances row, a
    -- credit needs allocations to the sen, a mirror needs its correction or its void stamp
    -- (S3.5 doors (a)/(b)/(c)). So "the register acted on this entry for this code" is exactly
    -- "the belt looked at this leg and let it through" -- the disjunct adds the race band and
    -- nothing else. A pre-enrolment movement, or a movement on a code retired and repurposed,
    -- has no register act and still rides out_of_window_cents, which is the design SS3.4 posture.
    -- ---------------------------------------------------------------------------------
    select coalesce(sum(x.net) filter (where x.in_window), 0),
           coalesce(sum(x.net) filter (where not x.in_window), 0)
      into v_gl, v_out
      from (select (l.debit_cents - l.credit_cents) as net,
                   (clara._adv_enrolment_at(p_client, r.code,
                      coalesce(j.approved_at, j.created_at)) is not null
                    or exists (select 1 from clara.staff_advances sa
                               where sa.account_code = r.code and sa.client_id = p_client
                                 and (sa.entry_id = j.id or sa.voided_by_entry_id = j.id))
                    or exists (select 1 from clara.staff_advance_applications ap
                               join clara.staff_advances sa2 on sa2.id = ap.advance_id
                               where ap.entry_id = j.id and sa2.account_code = r.code
                                 and sa2.client_id = p_client)) as in_window
              from clara.journal_lines l
              join clara.journal_entries j on j.id = l.entry_id
             where l.client_id = p_client and l.account_code = r.code
               and j.status = 'approved' and j.posting_date <= p_as_of) x;

    select en.id into v_active from clara.staff_advance_accounts en
      where en.client_id = p_client and en.account_code = r.code and en.active limit 1;

    if v_reg <> v_gl then v_tie := false; end if;
    v_rows := v_rows || jsonb_build_object('account_code', r.code,
      'register_cents', v_reg, 'gl_cents', v_gl,
      'difference_cents', v_reg - v_gl, 'out_of_window_cents', v_out,
      'explained', v_reg = v_gl,
      'advance_count', v_n, 'incomplete_count', v_incomplete,
      'active_enrolment_id', v_active);
  end loop;

  return jsonb_build_object('client_id', p_client, 'as_of', p_as_of, 'tie', v_tie,
    'accounts', v_rows);
end $$;
revoke all on function clara.staff_advance_tie(uuid, date) from public;

-- =====================================================================================
-- S3.7 -- GRANTS (the 0038:8056-8064 idiom, copied 0041:4405-4424): revoke from public, grant
-- to clara_authenticated only, re-assert clara_fn_owner ownership. There is NO machine lane in
-- this family -- every advance act is a human act, and the runtime never books one.
-- =====================================================================================
do $sadv_acl$ declare f text; begin
  foreach f in array array[
      'clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)',
      'clara.retire_staff_advance_account(uuid,uuid,text,text)',
      'clara.complete_staff_advance_particulars(uuid,uuid,text,text,text)',
      'clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)',
      'clara.staff_advance_summary(uuid,date)',
      'clara.staff_advance_statement(uuid,text,date,date)',
      'clara.staff_advance_tie(uuid,date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $sadv_acl$;

-- The THIRTEEN internal helpers (clara._adv_enrolment_at, _adv_window_closed_under,
-- _adv_enrolment_admission, _adv_outstanding, _adv_over_application, _adv_release_one_way,
-- _adv_net_applications, _adv_entry_carries_correction, _adv_reversal_admission,
-- _adv_reversal_blocked, _adv_assert_proposal, _adv_on_approve, _tf_adv_movement_belt) stay
-- UNGRANTED: each was revoked from public at its own creation site, and each is reached only
-- through a SECURITY DEFINER verb, the approve hook, the belt, or one of the two SECURITY
-- DEFINER cross-section readers that speak for this family [round 8, lane M3]:
--   * clara._adv_reversal_admission -- the ONE body owning all FIVE advance-side reversal walls
--     [round 9 adds the belt door-(c) `unregistered_mirror` wall as arm (1c) -- r9 finding 3]
--     -- is enforced by clara._adv_on_approve's GUARD III (the authority, at the act), raised in
--     its `carried` half by clara._adv_reversal_blocked (which section 2's
--     clara._wdb_reversal_blocked calls as the early diagnosis at clara.reverse_entry), and READ
--     in its `dated` half by S4.6A's release report, which must be able to say whether
--     clara.reverse_entry(E) will be admitted without re-deriving a single wall.
--   * clara._adv_over_application -- the temporal cap -- is enforced by
--     clara._adv_assert_proposal arm (iii) and read by clara._adv_release_one_way, which is how
--     that same release report can say whether re-booking at the line's own date is possible at
--     all. None of the three is reachable by a human role.

-- =====================================================================================
-- S3.9 -- A NAMED, MEASURED RULING THIS SECTION DOES **NOT** ACT ON: THE FA-SIDE RESERVATION
-- IS PERMANENT, INCLUDING AFTER DISPOSAL [as-built ladder round 3; cell x42v.w7d].
--
-- THE FACT, MEASURED IN THE CATALOG rather than inferred: `clara._fa_reserved_roles` (0041's
-- body, LIVE IN PRODUCTION) unions three reads of `clara.fixed_assets` -- cost, accum and
-- expense -- and NONE of them carries a `status` or `disposed_at` test. So a DISPOSED asset
-- reserves its three codes forever; `clara._acct_role_reserved` inherits that, and a staff-
-- advance enrolment on such a code is refused permanently. Where a historical advance entry
-- sits on a code the FA register has since claimed, that entry can therefore never be reversed
-- through `clara.reverse_entry` at all: arm (1)'s enrolment_closed refusal is unclearable.
--
-- WHY 0042 DOES NOT GATE IT -- three reasons, any one of which is sufficient:
--   1. IT IS DESIGN LAW, NOT AN OVERSIGHT. Design SS3.1 states the asymmetry in as many words:
--      "on the FA side, a code any register row ever carried stays reserved forever", set
--      against the advance side, where a retired enrolment deliberately does NOT reserve.
--      Gating it here would contradict the design of record from a section that does not own it.
--   2. THE BODY IS NOT IN THE SS8 CHANGE-OF-RECORD REGISTER. 0042 recuts named bodies only;
--      widening a 0041 guard inside the migration that ships the money hooks is exactly the
--      scope creep the contract forbids (the same ruling residue R6 already carries for
--      `upsert_fa_account_profile`).
--   3. THE BLAST RADIUS IS THE WHOLE FA FAMILY AND CANNOT BE SHOWN SAFE FROM HERE. That union
--      has four readers -- `_acct_role_reserved`, `_fa_assert_code_unreserved` (the bank belt),
--      `upsert_fa_account_profile`, and adjustment-template line eligibility. Releasing a
--      disposed asset's codes would let the SAME code be re-bound to another FA profile, to a
--      bank account, or to a staff-advance enrolment while the disposed asset's historical cost
--      and accumulated-depreciation lines still sit on it -- which is precisely the state
--      `fa_register_tie` is built to call a break. Demonstrating the FA family still behaves is
--      an 0041-scoped exercise with its own cells; this lane cannot honestly claim it.
--
-- WHAT 0042 DOES INSTEAD -- and this is the part that closes the walled corridor. The refusal
-- no longer PROMISES a re-enrolment it cannot deliver. `clara._adv_enrolment_admission` measures
-- the difference between an ACTIVE fa_account_profiles row (releasable: retire_fa_account_profile
-- clears `active` and the union drops it) and a LIVE `clara.fixed_assets` REGISTER ROW, reports
-- `remedy = 'release_fa_register_row_then_re_enrol'` for the second, and names the act that DOES
-- work: an ordinary correcting journal entry on the retired code, which nothing guards, and which
-- staff_advance_tie reports honestly in its own out_of_window_cents column. Cell x42v.w7d walks
-- that whole fallback and proves the tie stays explained afterwards.
--
-- ...AND THE OWNER HAS SINCE RULED ON THE PARAGRAPH ABOVE (2026-08-03, WDB-R1 item 2). The
-- deferral this section recorded -- "if disposed assets SHOULD release their codes, that is a
-- 0043 change with its own acceptance, never a silent edit here" -- was answered: fix it at the
-- ROOT, in 0042. The gate lives in S5.15 (clara._fa_status_holds_account_role, which releases
-- ALL THREE terminal statuses, not only the `disposed` this note anticipated), the FA-family
-- regression pass this note asked for is x41-round35-reservation plus the whole x41 battery, and
-- the new x42.ra1..ra4 cells pin the gate, the symmetry, the resurrection window it opens and the
-- tie consequence. The one thing this note got exactly right is recorded there rather than
-- silenced: a released code re-used by another register DOES make fa_register_tie report a
-- difference -- which is the tie telling the truth, and is x42.ra4(b)'s measured lane note.
-- =====================================================================================

-- =====================================================================================
-- S3.8 -- clara.list_review_queue: THE staff_advance_incomplete ROW KIND (design SS3.4:
-- "/advances clones /aging; row_kind staff_advance_incomplete; part staff_advance"; WD-R1's
-- "the queue chases it until a human completes it").
--
-- INTEGRATION FINDING [x42v.r4, build_defect]. S3.2's own header already promised this row
-- kind in prose ("the /advances surface chases it (row_kind staff_advance_incomplete) until a
-- human completes it") and both the dashboard catalog and reviewTypes.ts were already built
-- against it (`advance_id` is a declared, mapped QueueRow key) -- but no producer was ever
-- written, so the whole chase was silent: an advance born honestly incomplete (WD-R1: books
-- are never blocked on particulars nobody has yet) had NOTHING anywhere telling a human it was
-- waiting. Soft-birth without the chase is not "visibility, never blocking" -- it is just
-- invisible.
--
-- 0041 S4.9 IS THE TEMPLATE, COPIED RATHER THAN REINVENTED: same splice shape, same shared
-- column vector (the seven CTEs share one vector, so the new kind carries its id in the shared
-- `id` column and the row json projects `advance_id` from it under a row_kind test -- one
-- splice instead of eight), same lint_rows lane-NULL posture so the ready/needs_review/needs_you
-- counters are untouched. This body is already in tail 2(b)'s adjudicated mentioner allowlist.
--
-- WHICH ADVANCES CHASE: purpose IS NULL (the pair CHECK ck_staff_advances_particulars_pair
-- makes purpose and reference null together, so one column decides it) AND not voided. A voided
-- advance is a disbursement the books say never happened; chasing a human for the purpose of a
-- debt that no longer exists is the advance twin of 0041's "disposed rows never chase".
-- =====================================================================================

-- [SPLIT D-b1 2026-08-04] ...AND THIS CLOSES IT, immediately before S3.8 opens its own. Two flat regions,
-- not one nested pair: `reset role` returns to the SESSION role, never to an enclosing `set role`,
-- so a nested pair would silently leave the rest of the file running as the migration role.
reset role;
set role clara_fn_owner;

do $s3_8$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S3.8 prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;
  if position('staff_advance_incomplete' in v_def) <> 0 then
    raise exception '0042 S3.8 prestate: the queue already projects staff_advance_incomplete -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE PRESTATE IS ALSO A 0041 WITNESS. fixed_asset_incomplete twice (the CTE literal + the
  -- row-json test) is exactly what 0041 S4.9 left behind; if it is not there, this database is
  -- not the body this splice was derived against and the anchors below cannot be trusted.
  for r in select * from (values
      ('fixed_asset_incomplete', 2),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S3.8 prestate: list_review_queue carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE NEW CTE + the union (anchored on 0041 S4.9's own output, fa_rows included).
  v_frm := $f$  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows
  ), keyed as ($f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S3.8 prestate (a): the all_rows union appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$  ), adv_rows as (
    -- 0042 (Wave D-b, design SS3.4; WD-R1): INCOMPLETE ADVANCES CHASE. The register row is
    -- soft-born by clara._adv_on_approve with no purpose and no reference -- the disbursement
    -- is never blocked on particulars nobody has typed yet -- so the queue is the only thing
    -- that ever asks for them. fa_rows above is copied exactly (lane NULL, section
    -- needs_review, section_rank 2), which is what keeps the counters untouched.
    -- question_text is composed here rather than left null so the row reads as a sentence in
    -- every consumer, including ones with no advance-specific rendering.
    select 2 section_rank,'staff_advance_incomplete'::text row_kind,'needs_review'::text section,
      sa.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,sa.created_at aged_since,
      sa.amount_cents,null::text period,
      format('Staff advance (particulars pending) - %s RM%s', sa.account_code,
        to_char(sa.amount_cents / 100.0, 'FM999,999,990.00')) question_text,
      sa.created_at,sa.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id
    from clara.staff_advances sa
    join clara.clients active_adv_client on active_adv_client.id=sa.client_id
      and active_adv_client.status='active'
    where sa.firm_id=c.firm and sa.purpose is null and sa.voided_by_entry_id is null
      and (v_client is null or sa.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
  ), keyed as ($t$);

  -- (b) THE ROW JSON gains advance_id, beside 0041's asset_id and under the same row_kind test.
  v_frm := $f$'asset_id',case when p.row_kind='fixed_asset_incomplete' then p.id end,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S3.8 prestate (b): the asset_id projection appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$'asset_id',case when p.row_kind='fixed_asset_incomplete' then p.id end,'advance_id',case when p.row_kind='staff_advance_incomplete' then p.id end,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, 'staff_advance_incomplete', '')))
     / length('staff_advance_incomplete') <> 2 then
    raise exception '0042 S3.8 postcheck: staff_advance_incomplete did not land exactly twice (the CTE row_kind literal and the row-json projection test)'
      using errcode = 'CLR10';
  end if;
  if position('union all select * from adv_rows' in v_def) = 0
     or position($p$'advance_id',case when p.row_kind='staff_advance_incomplete'$p$ in v_def) = 0 then
    raise exception '0042 S3.8 postcheck: the queue recut did not land' using errcode = 'CLR10';
  end if;
  -- EVERY PRE-EXISTING KIND SURVIVES. A splice that dropped one would still answer this cell's
  -- own question and silently blind the queue to filings, questions, tasks, watches or assets.
  for r in select * from (values
      ('fixed_asset_incomplete', 2),
      ($$'uncoded_filing'::text row_kind$$, 1), ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1), ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1), ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S3.8 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S3.8 postcheck: list_review_queue changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S3.8 OK: the review queue chases particulars-incomplete staff advances (row_kind staff_advance_incomplete, advance_id projected), and every pre-0042 row kind is intact.';
end $s3_8$;

reset role;

-- #####################################################################################
-- ###### SECTION S5 (D-b1 SLICE) -- THE THREE LIVE-BODY SPLICES THIS FAMILY OWNS ######
-- #####################################################################################
-- [SPLIT D-b1 2026-08-04] THREE OF SECTION S5's THIRTY-THREE LABELLED BLOCKS LAND HERE, and each is a
-- SPLICE on a body that already exists in production. Census sect.8's D-b1 bullets, in order:
--   * S5.8-b1  -- the clara._adv_on_approve line into clara._subledger_on_approve. Census sect.2
--                 Class C splits S5.8 in two: PL/pgSQL resolves neither of the whole unit's two
--                 `perform` lines at CREATE time, so a slice that shipped both would break every
--                 approve path at the first call. D-b0 shipped NO hook edit; this slice adds the
--                 ADVANCE line; D-b2 later inserts the ADJUSTMENT line ABOVE it, and the anchor
--                 comment this splice leaves in the body says so in as many words.
--   * S5.9-b1  -- the reversal WALL into clara.reverse_entry, plus the ordering postcheck that
--                 travels with it. BINDING ERRATA E1: D-b0 already shipped S5.9's OTHER half (the
--                 correction-date term), because shipping the re-run ENFORCEMENT without it was
--                 measured to refuse every reverse-then-re-run of a depreciation period,
--                 permanently. So this block's prestate census is anchored on the body AS D-b0
--                 LEFT IT -- SEVEN markers, harvested with pg_get_functiondef from a rig with
--                 D-b0 applied, never from the 0041 text -- and its splice makes ONE replacement,
--                 not two.
--   * S5.19    -- clara.fa_register_tie's GL-SIDE reader recut, which reads
--                 clara.staff_advance_accounts, clara.staff_advances, clara._adv_enrolment_at and
--                 clara.staff_advance_tie (census sect.3: "NOT PURE -- reads ... (D-b1)"),
--                 together with the re-create of clara._acct_role_reserved_at in its full union
--                 form. BINDING: D-b0 already shipped S5.19's WALK GATE as S5.19-b0 -- the same
--                 shape as E1 above, and for the same reason (the gate is the PAIR of S5.15,
--                 which D-b0 ships; releasing a terminal row's codes without gating the reader
--                 was measured to put a permanent, unclearable difference into the tie for the
--                 whole D-b0-only window). So this block's walk prestate is anchored on the body
--                 AS D-b0 LEFT IT -- the ALREADY-GATED walk -- and it makes no walk replacement.
-- EVERY OTHER S5 BLOCK IS SOMEBODY ELSE'S: S5.1-S5.7, S5.9's correction-date half, S5.12's rung
-- and authority arms, S5.13, S5.15/S5.15b/S5.15c/S5.15d/S5.15f, S5.16-S5.18, S5.19's two helper
-- creates and its walk gate, S5.20-S5.27 and the four censuses all shipped in D-b0; S5.10,
-- S5.10a, S5.11 and S5.12's annual-cadence guard are D-b2's.
--
-- ROLE SCOPING IS PER-BLOCK, as it is in the canonical section (census hazard sect.7.4): each
-- block below opens and closes its own `set role clara_fn_owner` scope.

-- =====================================================================================
-- S5.8 -- clara._subledger_on_approve: THE ADJUSTMENT AND STAFF-ADVANCE HOOK SPLICES
-- (design SS2.6 / SS3.3).
--
-- Placed IMMEDIATELY AFTER the FA hook and ABOVE the settlement early-return, for the
-- identical reason 0041 recorded when it put the FA hook there: everything below
-- `if v_prop is null then return; end if;` is DEAD CODE for every non-settlement entry --
-- which is every adjustment occurrence, every auto-reversal mirror, every staff-advance
-- disbursement and every application. All four approve paths funnel through this one body,
-- so these two lines are what make recurring-adjustment materialisation and staff-advance
-- register movement intrinsic at each of them (ARCHITECTURE SS3.5, PRD F3).
--
-- THE ORDER IS LOAD-BEARING AND IS ASSERTED BELOW, NOT ASSUMED. The adjustment hook runs
-- first: its arm (2) mints the auto-reversal mirror and its arm (1) is the pair-correction
-- defense, both of which must settle before the advance hook reads the entry's legs. The
-- advance hook then runs UNCONDITIONALLY -- including on an auto-reversal mirror -- because a
-- reversal mirror can carry advance-bearing legs whose register effect is exactly what its
-- correction arm exists to write.
-- [SPLIT D-b1 2026-08-04] THE HEADER ABOVE IS THE WHOLE UNIT'S AND IS KEPT VERBATIM, BECAUSE IT STATES
-- THE FINAL LAW THIS SPLICE AND D-b2's MUST TOGETHER SATISFY -- not because both lines land here.
-- What lands here is the ADVANCE line alone (census sect.2 Class C, the highest-severity edge in
-- the partition: both `perform` lines are unconditional, PL/pgSQL resolves neither at CREATE
-- time, and a slice that installed a call to a body it does not create breaks every approve path
-- in production at the first approval). D-b0 therefore made NO hook edit at all; this slice
-- installs `perform clara._adv_on_approve(p_entry);` immediately after the fixed-asset hook, and
-- the comment it leaves in the body NAMES the position D-b2's adjustment line must take -- ABOVE
-- this one -- because the order the header argues for is load-bearing and would otherwise be a
-- fact nobody wrote down where the next author will look.
-- CONSEQUENCE FOR D-b2, stated here so it is not rediscovered: D-b2's splice-marker census must
-- anchor on the body AS THIS SLICE LEAVES IT (seven markers, one of them clara._adv_on_approve),
-- not on the 0041 body and not on the whole unit's eight-marker postcheck. This block's own
-- prestate does the same thing one slice earlier: it reads the body D-b0 left.
-- FINAL FORM: D-b2's S5.8-b2, at which point the whole unit's eight-marker postcheck and its
-- four-anchor ordering claim are both true of the live body.
-- =====================================================================================
set role clara_fn_owner;

do $s5_8_b1$
declare
  v_sig text := 'clara._subledger_on_approve(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.8-b1 prestate: clara._subledger_on_approve is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._adv_on_approve(' in v_def) <> 0 then
    raise exception '0042 S5.8-b1 prestate: _subledger_on_approve already calls the staff-advance hook -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- [SPLIT D-b1 2026-08-04] THE ADJUSTMENT LINE'S PRESENCE IS A DIFFERENT AND WORSE ERROR, so it gets
  -- its own name rather than being folded into the idempotency arm above. If it is here, D-b2
  -- landed before D-b1 -- the ship order the census measured (D-b0 -> D-b1 -> D-b3 -> D-b2) was
  -- not followed, this slice would splice BELOW a line whose position is the thing being
  -- guaranteed, and four legal edges (census sect.2's "the D-b1-before-D-b3-before-D-b2 order is
  -- correct and is load-bearing in four places") were crossed to get here.
  if position('clara._adj_on_approve(' in v_def) <> 0 then
    raise exception '0042 S5.8-b1 prestate: _subledger_on_approve already calls the adjustment hook -- D-b2 has been applied BEFORE D-b1, which is not the ship order this splice''s ordering claim is derived from; apply the D-b slices in order'
      using errcode = 'CLR10';
  end if;
  -- THE SIX-MARKER PRESTATE CENSUS: 0041's five originals at their measured counts PLUS
  -- 0041's own splice marker. A body rebuilt from 0037 file text upstream would have lost the
  -- FA hook, and this splice must not be the thing that hides it.
  -- [SPLIT D-b1 2026-08-04] MEASURED ON A RIG WITH D-b0 APPLIED, not assumed from the 0041 text: D-b0
  -- makes no edit to this body, so all six counts are exactly the whole unit's.
  for r in select * from (values
      ('payment_terms_days', 1),
      ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1),
      ('allocation_stale', 6),
      ('clara._fa_on_approve(p_entry)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.8-b1 prestate: the live _subledger_on_approve body carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  v_frm := $f$  perform clara._fa_on_approve(p_entry);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.8-b1 prestate: the FA hook call anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  perform clara._fa_on_approve(p_entry);

  -- 0042 (Wave D-b, design SS3.3): THE STAFF-ADVANCE HOOK. Spliced immediately after the
  -- fixed-asset hook and BEFORE the settlement early-return below, for the reason 0041
  -- recorded here: everything under that early return is dead code for every non-settlement
  -- entry, which is every advance disbursement, every application and every reversal mirror
  -- that carries one. All four approve paths funnel through this body, so this line is what
  -- makes staff-advance register movement intrinsic at each of them.
  --
  -- THE NEXT LINE TO ARRIVE GOES ABOVE THIS ONE, NOT BELOW IT [wave D-b slice D-b1, the
  -- split-dependency census's Class C order note]. The recurring-adjustment hook ships in the
  -- adjustment slice, and when it does it must be spliced BETWEEN the fixed-asset hook above
  -- and this line -- because it mints the auto-reversal mirror (its arm 2) and carries the
  -- pair-correction defense (its arm 1), and both must settle before the advance side reads
  -- this entry's legs. The advance hook then runs UNCONDITIONALLY -- including on a reversal
  -- mirror, whose correction arm is the whole reason the mirror needs to reach it. The law is
  -- fa -> adjustment -> advance -> the settlement early-return; two of those four anchors are
  -- in place today and the census below asserts them in that order.
  perform clara._adv_on_approve(p_entry);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- THE SEVEN-MARKER POSTCHECK CENSUS -- the six re-pinned at their measured counts plus the
  -- one this splice added, exactly once.
  -- [SPLIT D-b1 2026-08-04] The whole unit's eighth row (clara._adj_on_approve(p_entry), 1) is D-b2's
  -- and is asserted at ZERO here instead, on the same instrument: the ordering claim below is
  -- only about the anchors that exist, and a body that somehow acquired the adjustment call
  -- during THIS transaction would have acquired it from nowhere.
  for r in select * from (values
      ('payment_terms_days', 1),
      ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1),
      ('allocation_stale', 6),
      ('clara._fa_on_approve(p_entry)', 1),
      ('clara._adv_on_approve(p_entry)', 1),
      ('clara._adj_on_approve(p_entry)', 0)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.8-b1 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED, ALL-PRESENT: FA hook -> advance hook -> the settlement early return. A bare
  -- position(a) < position(b) reads a MISSING marker (position 0) as correctly ordered and
  -- passes vacuously -- the absence-from-the-wrong-instrument mistake this repo has already paid
  -- for three times.
  -- [SPLIT D-b1 2026-08-04] THREE ANCHORS, NOT FOUR: the adjustment hook is D-b2's and is asserted
  -- absent above rather than ordered here. The relation this claim really carries is the one
  -- that matters for THIS line -- the advance hook is below the FA hook and ABOVE the settlement
  -- early-return, so it is not dead code for any non-settlement entry. FINAL FORM: D-b2's
  -- four-anchor chain.
  if not (position('clara._fa_on_approve(p_entry)' in v_def) > 0
          and position('clara._adv_on_approve(p_entry)' in v_def) > 0
          and position($p$v_prop := e.flags -> 'settlement_allocation'$p$ in v_def) > 0
          and position('clara._fa_on_approve(p_entry)' in v_def)
              < position('clara._adv_on_approve(p_entry)' in v_def)
          and position('clara._adv_on_approve(p_entry)' in v_def)
              < position($p$v_prop := e.flags -> 'settlement_allocation'$p$ in v_def)) then
    raise exception '0042 S5.8-b1 postcheck: the staff-advance hook is not ordered after the FA hook and ABOVE the settlement early-return -- it is dead code for every non-settlement entry, which is every advance movement there is'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.8-b1 postcheck: _subledger_on_approve changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.8-b1 OK: the staff-advance hook is spliced after the FA hook and above the settlement early-return, with the position D-b2''s adjustment hook must take named in the body itself; the six-marker census is re-pinned at its new seven-marker membership.';
end $s5_8_b1$;

reset role;

-- =====================================================================================
-- S5.9-b1 -- clara.reverse_entry: THE REVERSAL WALL, THE HALF D-b0 DID NOT SHIP.
--
-- [SPLIT D-b1 2026-08-04] THE WHOLE UNIT'S S5.9 MAKES TWO INDEPENDENT REPLACEMENTS ON THIS BODY and the
-- split separates them, on the BINDING ERRATA of split-build-record.md (E1):
--   (i)  the mirror's DATE, through clara._wdb_correction_posting_date -- SHIPPED BY D-b0 as
--        S5.9-b0. The census's exclusion list excluded only "S5.9(reversal-wall half)", and D-b0
--        measured that omitting the date half while shipping the re-run ENFORCEMENT (S5.15c /
--        S5.15d put the fixed-asset due oracle and poster on clara._wdb_rerun_breach) refuses a
--        LAWFUL reverse-then-re-run of any depreciation period with CLR38, permanently and
--        irreparably, because clara.fa_depreciation is append-only. It is not in this file.
--   (ii) the D-b reversal WALL, clara._wdb_reversal_blocked -- HERE, together with the ordering
--        postcheck (bank wall -> FA wall -> D-b wall -> the mirror INSERT) and the idempotency
--        probe keyed on it, both of which D-b0 explicitly deferred to this slice.
--
-- THE PRESTATE IS ANCHORED ON THE BODY AS D-b0 LEFT IT, WHICH IS THE WHOLE POINT OF THE ERRATA.
-- It is SEVEN markers, not six: the six pre-0042 ones the whole unit counts PLUS
-- clara._wdb_correction_posting_date(p_entry, which D-b0's splice installed. Every count was
-- HARVESTED with pg_get_functiondef from a rig with D-b0 applied, never read off the 0041 file
-- text -- including the two that a careless read would get wrong: Asia/Kuala_Lumpur is STILL
-- exactly 1 (D-b0's replacement kept 0041 S4.4's expression as the default INSIDE the new call,
-- which is what makes "scoped to the registry" a measured fact rather than a promise), and
-- current_date is STILL 0.
--
-- THE ANCHOR IS UNCHANGED: immediately after 0041's FA wall -- the last refusal position in the
-- body, so it fires after every cheaper wall and before anything is written. The rest of this
-- block, header argument included, is the whole unit's.
-- =====================================================================================
set role clara_fn_owner;

do $s5_9_b1$
declare
  v_sig text := 'clara.reverse_entry(uuid,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.9-b1 prestate: clara.reverse_entry is GONE' using errcode = 'CLR10';
  end if;
  if position('_wdb_reversal_blocked' in v_def) <> 0 then
    raise exception '0042 S5.9-b1 prestate: reverse_entry already carries the D-b reversal wall -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE PRIOR SPLICE MARKERS, POSITIVELY PROBED at their measured counts, including both
  -- of 0041's (this migration must not be able to land its splice on a body that lost the MYT
  -- mirror date or the FA wall).
  -- [SPLIT D-b1 2026-08-04] SEVEN, NOT SIX -- the seventh is D-b0's own correction-date term, and
  -- requiring it is what makes this block refuse to run on a database that skipped D-b0 or
  -- applied a D-b0 that lost half of S5.9 (errata E1). Measured on the rig, after D-b0.
  for r in select * from (values
      ('opening_entry_k_family_only', 1),
      ('allocated_items_present', 2),
      ('live_bank_match_present', 1),
      ('pg_advisory_xact_lock(203005004', 1),
      ('Asia/Kuala_Lumpur', 1),
      ('clara._fa_reversal_blocked(p_entry)', 1),
      ('clara._wdb_correction_posting_date(p_entry,', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.9-b1 prestate: reverse_entry carries the marker "%" % time(s), expected % -- the body drifted, lost a prior splice, or D-b0''s correction-date half was never applied', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  v_frm := $f$  perform clara._fa_reversal_blocked(p_entry);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.9-b1 prestate: the FA reversal wall anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  perform clara._fa_reversal_blocked(p_entry);
  -- 0042 (Wave D-b, design SS2.4 / SS3.3): THE D-b REVERSAL WALL, VERB SIDE -- the seventh
  -- splice on this body, mounted exactly where 0041 mounted the fixed-asset one and for the
  -- same measured reason: a HIGH-STAKES mirror is left a DRAFT here and never reaches the
  -- approve-time hook, so without this the maker gets a success receipt for a reversal that
  -- can never complete. Three arms live inside that one body: either half of an auto-reversal
  -- PAIR is un-reversible individually (the pair machine is the only lawful door for a pair);
  -- a staff-advance disbursement whose applications do not net to zero is un-reversible; and
  -- an entry carrying hook-born correction rows is un-reversible. Same body the hook calls,
  -- so the verb and the hook can never name different tokens.
  perform clara._wdb_reversal_blocked(p_entry);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._wdb_reversal_blocked(p_entry)', 1),
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
      raise exception '0042 S5.9-b1 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED, ALL-PRESENT: bank wall -> FA wall -> D-b wall -> the mirror INSERT.
  -- [SPLIT D-b1 2026-08-04] THIS IS THE CLAIM D-b0 COULD NOT MAKE and deferred to this slice by name.
  if not (position('live_bank_match_present' in v_def) > 0
          and position('clara._fa_reversal_blocked(p_entry)' in v_def) > 0
          and position('clara._wdb_reversal_blocked(p_entry)' in v_def) > 0
          and position('insert into clara.journal_entries(client_id,status,posting_date' in v_def) > 0
          and position('live_bank_match_present' in v_def)
              < position('clara._fa_reversal_blocked(p_entry)' in v_def)
          and position('clara._fa_reversal_blocked(p_entry)' in v_def)
              < position('clara._wdb_reversal_blocked(p_entry)' in v_def)
          and position('clara._wdb_reversal_blocked(p_entry)' in v_def)
              < position('insert into clara.journal_entries(client_id,status,posting_date' in v_def)) then
    raise exception '0042 S5.9-b1 postcheck: the D-b reversal wall is not between the FA wall and the mirror INSERT'
      using errcode = 'CLR10';
  end if;
  -- 0041 S4.4 IS STILL UNDONE-PROOF: the mirror is dated from the DB clock in MYT, never the
  -- session date.
  if position('current_date' in v_def) <> 0 then
    raise exception '0042 S5.9-b1 postcheck: current_date reappeared in reverse_entry -- 0041 S4.4 was undone'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.9-b1 postcheck: reverse_entry changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.9-b1 OK: reverse_entry carries the D-b reversal wall as its seventh splice, ordered after the FA wall and before the mirror INSERT; D-b0''s correction-date term and all six pre-0042 splice markers survived.';
end $s5_9_b1$;

reset role;

-- =====================================================================================
-- S5.19 -- clara.fa_register_tie: THE READER RECUT TO THE GATE (round-4 root fix).
--
-- THE INVARIANT, IN ONE SENTENCE: clara.fa_register_tie's ACCOUNT UNIVERSE is exactly the set
-- of accounts the fixed-asset family holds AT p_as_of -- an ACTIVE profile's codes, or the
-- codes of a register row INCLUDED at p_as_of -- and nothing else. It is enforced in the walk
-- itself, the one place both compared sides are derived from.
--
-- WHY THIS BLOCK EXISTS: A WRITER CHANGED AND ITS READER DID NOT. S5.15 gated
-- clara._fa_reserved_roles so a disposed, superseded or unwound register row RELEASES its
-- three codes. Nothing recut this reader. Its walk took EVERY clara.fixed_assets row of the
-- client regardless of status, and its GL side sums the whole account, so the moment a
-- released code was lawfully claimed by the staff-advance register the advance's own postings
-- landed inside a fixed-asset tie row: tie=false, with a difference NO ACCOUNTING ACT CAN
-- CLEAR, because the register row that put the account in the walk is terminal and can never
-- move again. A tie that goes red with nothing to point at is worse than no tie -- it trains
-- a professional to ignore it.
--
-- THE GATE IS `_fa_included_at`, NOT `_fa_status_holds_account_role`, AND THE DIFFERENCE IS
-- LOAD-BEARING. The obvious recut -- copy S5.15's status predicate into the walk -- is WRONG,
-- and wrong in the dangerous direction. This function answers AS OF A DATE. An asset disposed
-- on 30 June was genuinely in the register on 31 March, its cost is genuinely in the GL at
-- that date, and gating the walk on CURRENT status would have silently DROPPED that account
-- from a historical tie -- reporting tie=true over an account nobody examined. The as-of form
-- of "this row still holds its codes" already exists and is already what BOTH compared sides
-- use: clara._fa_included_at. Using it makes the walk agree with the sums BY CONSTRUCTION
-- (one predicate, three places) and agree with the lifecycle gate at as_of = today, which is
-- when the reservation is read. The two are checked against each other below rather than
-- asserted: every status the CHECK constraint admits is pushed through both.
--
-- WHAT THIS FIX DOES NOT THINK OF, ASKED AND ANSWERED [WDB-R4]. The walk now excludes an
-- account no live row holds -- but what about an account the FA family RE-CLAIMS after an
-- advance held it? Sequence: dispose the only asset on X (X released), enrol X as a staff
-- advance, disburse and repay, retire the enrolment, seed a new asset on X. X is back in the
-- walk, and the GL on X carries the whole advance era, which the register never held. The
-- answer is that the advance era NETS TO ZERO, and it does so structurally, not by luck:
-- clara.retire_staff_advance_account refuses while ANY advance on the enrolment is still
-- outstanding at 'infinity' (token advance_outstanding_on_retire), and the code cannot be
-- re-claimed by the FA family until the enrolment is retired, because the union still holds
-- it. So every disbursement has its matching settlement inside the window, the net movement
-- the tie sees is zero, and no difference is created. That precondition is ASSERTED below --
-- it is the load-bearing premise of this argument, and an argument whose premise is only
-- commented is the shape of defect this wave exists to stop.
--
-- THE NAMED RESIDUAL WAS NOT A RESIDUAL -- IT WAS THE DEFECT, AND IT IS NOW CLOSED [round-6
-- lens 3]. The paragraph that stood here claimed a backdated advance leg was "not reachable
-- through the D-b doors". MEASURED FALSE. clara.draft_entry takes p_posting_date from the
-- caller, so the disbursement that the advance belt admits carries whatever posting date the
-- act names. End to end on the rig: buy 100,000 on the cost code posted 2025-12-05; dispose it
-- posted 2026-05-20 (register row terminal, GL relieved); enrol the released code as a staff
-- advance; disburse 250,000 posted 2026-03-10. Ask the tie:
--   as_of 2026-02-20  ->  tie TRUE   (nothing has landed yet)
--   as_of 2026-03-20  ->  tie FALSE, cost_diff -250,000, every explanation column ZERO
--   as_of 2026-05-19  ->  tie FALSE, cost_diff -250,000, every explanation column ZERO
--   as_of 2026-05-25  ->  the account leaves the walk entirely (the fix above)
-- and clara.staff_advance_tie, on the SAME code at the SAME date, reports tie TRUE with the
-- fixed-asset purchase riding out_of_window_cents = 100,000. Two instruments, one account,
-- opposite verdicts: the advance family EXPLAINS the other family's movement and the FA family
-- calls it an unexplained break. NO ACCOUNTING ACT CAN CLEAR IT -- the register row is terminal
-- and the advance is lawful -- and it is permanent for every as-of in the band.
--
-- THE FIX WAS ONE-SIDED, WHICH IS THE ROUND-6 CLASS. S5.19 recut the WALK and left the GL side
-- summing the whole account, so the two sides stopped agreeing about WHICH FAMILY OWNS EACH
-- MOVEMENT everywhere before the terminal date. The invariant is now stated for both sides at
-- EVERY as-of: a foreign register's lawful movements ride an EXPLAINED column, never an
-- unexplained difference, at every date.
--
-- WHICH OF THE TWO CANDIDATE SHAPES, AND WHY. Round 6 named two: scope the GL side to the FA
-- family's own windows, or add a foreign-register explanation column. Taken alone each is
-- wrong, and the staff_advance_tie precedent is BOTH AT ONCE -- it excludes out-of-window legs
-- from the compared sum AND reports them in out_of_window_cents. Excluding without reporting
-- hides money; reporting without excluding leaves the red tie nobody can clear. So this does
-- both. But the WINDOW is chosen differently from the advance family's, and the difference is
-- load-bearing:
--   * The advance family's ownership IS an interval table, so its tie can ask "in some
--     enrolment window?" and treat everything else as out-of-window. THE FA FAMILY HAS NO SUCH
--     INSTRUMENT: it owns a code through clara.fa_account_profiles OR through a live
--     clara.fixed_assets row (that union is exactly what clara._fa_reserved_roles is). A
--     register row with no profile is ordinary -- a K-carry-down seed is one -- so a
--     profile-interval window would have scored a real asset's own purchase out-of-window and
--     reported the register side as unexplained. Measured on the probe above: the FA row that
--     owns the 100,000 has NO profile at all.
--   * Therefore a leg is foreign only on POSITIVE EVIDENCE that ANOTHER family held the code at
--     the moment the entry was approved -- never on the absence of evidence for this one. That
--     keeps 0041's deliberate posture intact: GL an account carried before anyone owned it is
--     still an unexplained difference with gl_pre_enrolment_* pointing at it (design SS1.2's
--     "pick a fresh account code, or accept and document a non-tying account"), because nobody
--     owned it and the FA family is the one being asked.
--
-- KEYED ON THE FACT, NOT ON A LANE. The question is not "is this the advance lane's leg" but
-- "which register family held this account code at this instant" -- asked of every family's OWN
-- rows, the way clara._fa_oldest_unmet_period keys on the client's own charge rows. It is
-- answered ONCE, by clara._acct_role_reserved_at below: the as-of form of the same union every
-- claiming door already consults, domain-general, with nothing in it that knows who is asking.
-- A third register family joins by joining the union; the census in S5.19b fails this migration
-- if a domain ever reaches one form of the authority and not the other.
--
-- WHAT THIS FIX DOES NOT THINK OF, ASKED AND ANSWERED [WDB-R4] -- see also x42.ra7.
--   (a) THE DANGEROUS DIRECTION, which is silently dropping the FA family's OWN money into the
--       explained column and reporting green. Guarded twice: a leg is foreign only if NO fa
--       claim exists at that instant, AND only if the FA register did not demonstrably act on
--       that entry (acquisition, disposal or a depreciation charge). Every movement the
--       register side counts is minted by one of those three, so the register side's money can
--       never be excluded from the GL side -- that is what makes the two sides agree by
--       construction rather than by argument.
--   (b) TWO REGISTERS IN SEQUENCE (fa -> advance -> retire -> fa again). Each era is scored at
--       its own approval instant, so the advance era rides the foreign column and both FA eras
--       stay in the compared sum. This no longer rests on the advance era netting to zero --
--       check (3) below is now a belt beside braces, not the argument.
--   (c) AN AS-OF BEFORE THE ASSET EXISTED. The walk gate already excludes the row, and where an
--       active profile keeps the account in the walk both sides are zero at that date.
-- [SPLIT D-b1 2026-08-04] THIS BLOCK IS THE SPLICE, AND THE HEADER ABOVE IS ITS ARGUMENT -- both travel
-- here together, exactly as D-b0 said they would when it lifted the two HELPERS out and left the
-- argument behind. Census sect.3's verdict on S5.19 is "NOT PURE -- reads
-- clara.staff_advance_accounts / clara.staff_advances / clara._adv_enrolment_at /
-- clara.staff_advance_tie (D-b1)", and every one of those four now exists: the first two from
-- SECTION S1 of this file, the last two from SECTION S3.
-- WHAT CHANGES FROM THE CANONICAL BLOCK, and nothing else does:
--   * clara._acct_role_reserved_at is RE-CREATED, with its two advance arms, using
--     `create or replace` -- D-b0 shipped the FA-only shell (census sect.2 Class B's fourth
--     violating edge: this body calls clara._adv_enrolment_at, which did not exist yet). This is
--     the completion, and it is the FINAL form.
--   * clara._fa_gl_leg_foreign is NOT re-created: D-b0 shipped it whole and byte-exact (it reads
--     only the authority above plus 0041 tables), and re-creating it here would be a second
--     opinion about a body nothing has changed.
--   * the do $s5_19$ block is byte-exact EXCEPT at the WALK, which D-b0 already gated as
--     S5.19-b0: the pre-existing marker census counts clara._fa_included_at FOUR times, not
--     three, and the walk prestate anchors on the ALREADY-GATED arm and asserts it survives this
--     slice's six GL splices instead of installing it. Both edits are mechanical consequences of
--     the pull-forward and neither changes what this migration leaves behind: the FINAL body is
--     the same body the whole unit produces, byte for byte.
--   * everything else in the block is byte-exact, including checks (3), (4) and (5) -- which is
--     the point of shipping it in THIS slice rather than D-b0's: (3) reads
--     clara.retire_staff_advance_account,
--     (4) compares the two forms of the reservation authority literal-for-literal, and (5)
--     compares the TABLES they derive claims from. On D-b0's FA-only pair those checks passed
--     while saying nothing about the advance family; here they are the census that proves the two
--     completions -- SECTION S2's and this one's -- did not drift apart.
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
-- [SPLIT D-b1 2026-08-04] THE COMPLETION OF D-b0's FA-ONLY SHELL, IN THE CANONICAL FULL UNION FORM --
-- byte-exact from 0042-sections/s5-residuals.sql L2762-2810, with ONE character sequence changed:
-- `create function` becomes `create or replace function`, because D-b0 already created this body.
-- THE SIX FIXED-ASSET ARMS ARE THE SAME TEXT D-b0 SHIPPED, so every as-of answer about the FA
-- family is unchanged; what is ADDED is the two ADVANCE arms -- the clara._adv_enrolment_at
-- delegate and the clara.staff_advances / clara.staff_advance_accounts disjunct -- which could
-- not exist before this slice created that function and those tables. `create or replace` on an
-- ABSENT body would CREATE it silently, so SECTION 0 probe 7 asserts the shell exists first.
-- Its ONE reader, clara._fa_gl_leg_foreign (D-b0), picks the completed union up with no edit,
-- which is why the tie's four GL sums cannot drift apart on it -- and check (4) of the block
-- below fails this migration by name if the NOW form ever classifies a family the AS-OF form has
-- never heard of.
create or replace function clara._acct_role_reserved_at(p_client uuid, p_code text, p_at timestamptz)
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
  union
  select 'staff_advance'::text, 'advance'::text, p_code
   where p_client is not null and p_code is not null and p_at is not null
     and clara._adv_enrolment_at(p_client, p_code, p_at) is not null
  union
  select 'staff_advance'::text, 'advance'::text, adv.account_code
    from clara.staff_advances adv
    join clara.staff_advance_accounts en2 on en2.id = adv.enrolment_id
   where p_client is not null and p_code is not null and p_at is not null
     and adv.client_id = p_client and adv.account_code = p_code
     and en2.enrolled_at <= p_at and (en2.retired_at is null or p_at <= en2.retired_at)
$$;
revoke all on function clara._acct_role_reserved_at(uuid, text, timestamptz) from public;

-- [SPLIT D-b1 2026-08-04] clara._fa_gl_leg_foreign STANDS HERE IN THE WHOLE UNIT AND IS NOT RE-CREATED:
-- D-b0 shipped it whole (census sect.1g files it as a D-b0 object, and D-b0's S5.19b roster (A3)
-- already reads it). It needs no edit -- it consults the authority above by name, so completing
-- that authority completes this body's answer too.

do $s5_19$
declare
  v_sig text := 'clara.fa_register_tie(uuid,date)';
  v_def text; v_frm text; v_a text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.19 prestate: clara.fa_register_tie is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._fa_gl_leg_foreign(' in v_def) <> 0 then
    raise exception '0042 S5.19 prestate: fa_register_tie already scopes its GL side to the owning register family -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- PRE-EXISTING MARKER CENSUS, counted on the live catalog AS D-b0 LEFT IT.
  -- [SPLIT D-b1 2026-08-04] THE WHOLE UNIT COUNTS clara._fa_included_at THREE TIMES HERE (both register
  -- sums and the before-baseline probe) BECAUSE IT IS COUNTING THE 0041 BODY. This slice counts
  -- FOUR: 0042's S5.19-b0 (D-b0) already spliced the fourth into the WALK, which is why the
  -- idempotency guard below is the survival of the GATED arm rather than of the ungated one.
  -- Four is also the whole unit's POSTCHECK number, unchanged below -- the two builds converge
  -- on the same body.
  for r in select * from (values
      ('clara._fa_included_at(f.id, p_as_of)', 4),
      ('clara._fa_pending_unposted(f.id)', 3),
      ('status in (''pending'', ''active'')', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.19 prestate: fa_register_tie carries the marker "%" % time(s), expected % -- either 0042''s S5.19-b0 half (D-b0, the PREVIOUS migration of this split) did not land or the body drifted', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE WALK IS ALREADY GATED, AND THIS BLOCK ONLY PROVES IT.
  -- [SPLIT D-b1 2026-08-04] The whole unit anchors on the UNGATED walk arm here and replaces it with the
  -- gated one. D-b0's S5.19-b0 performs that replacement -- byte for byte, comment included --
  -- because the gate is the PAIR of S5.15 and S5.15 ships there; a D-b0 that released a terminal
  -- row's codes while its own reader still walked them was MEASURED to put a permanent,
  -- unclearable difference into clara.fa_register_tie. So the anchor here is the GATED text, and
  -- it is asserted, not spliced: if it is absent, D-b0's half did not land (or the body drifted)
  -- and this migration must fail by name rather than half-recut a reader.
  -- The idempotency key for THIS half is unchanged: the clara._fa_gl_leg_foreign probe above.
  v_frm := '      from clara.fixed_assets f where f.client_id = p_client' || chr(10)
    || '        -- 0042 S5.19: THE WALK AGREES WITH THE LIFECYCLE GATE. A register row that no' || chr(10)
    || '        -- longer holds its codes at p_as_of (disposed, superseded, unwound) must not put' || chr(10)
    || '        -- its account into this report: since 0042 S5.15 that code may lawfully belong to' || chr(10)
    || '        -- another register, whose postings would then read as a fixed-asset difference no' || chr(10)
    || '        -- act could clear. This is the SAME predicate both compared sides already use, so' || chr(10)
    || '        -- the universe and the sums cannot drift apart.' || chr(10)
    || '        and clara._fa_included_at(f.id, p_as_of)' || chr(10)
    || '    order by 1, 2';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.19 prestate: the GATED walk anchor appears % time(s) (expected exactly once) -- 0042 S5.19-b0 installs it in the PREVIOUS migration of this split; either that half did not land or the body drifted', v_cnt
      using errcode = 'CLR10';
  end if;

  -- ---------------------------------------------------------------------------------
  -- ROUND-6 LENS 3 -- THE GL SIDE JOINS THE FAMILY QUESTION. Six anchored splices, each
  -- counted before it is applied, so a body that drifted fails by name rather than being
  -- half-recut: (i) two locals; (ii)+(iii) each compared sum becomes ONE SCAN with a
  -- `filter` partition, so this family''s total and the foreign total cannot drift apart
  -- even by a typo -- clara.staff_advance_tie''s own remedy, adopted for the same reason;
  -- (iv)+(v) the pre-enrolment columns stay a SUBSET of the compared sum, so cost_diff
  -- still decomposes into what it says it does; (vi) the two explanation keys.
  -- ---------------------------------------------------------------------------------
  -- (i) THE TWO NEW LOCALS.
  v_a := '        v_gl_cost bigint; v_gl_accum bigint; v_pre_cost bigint; v_pre_accum bigint;';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (i): the tie''s GL locals line is not present exactly once -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a, v_a || chr(10)
        || '        v_for_cost bigint; v_for_accum bigint;');

  -- (ii) THE COST SUM.
  v_a := '    select coalesce(sum(l.debit_cents - l.credit_cents), 0) into v_gl_cost' || chr(10)
      || '      from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id' || chr(10)
      || '      where l.client_id = p_client and l.account_code = r.asset_code and v_cost_row' || chr(10)
      || '        and j.status = ''approved'' and j.posting_date <= p_as_of;';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (ii): the UNSCOPED cost-side GL sum is not present exactly once -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a,
       '    -- THE GL SIDE ANSWERS THE FAMILY QUESTION THE REGISTER SIDE ANSWERS [0042 S5.19,' || chr(10)
    || '    -- round-6 lens 3]. ONE scan, TWO sums, ONE partition: what the fixed-asset family' || chr(10)
    || '    -- must answer for, and what another register family lawfully owned when the entry' || chr(10)
    || '    -- was approved. Two scans would be two copies of one predicate and could drift;' || chr(10)
    || '    -- a filter partition of a single scan cannot, and the two sums always total the' || chr(10)
    || '    -- whole account.' || chr(10)
    || '    select coalesce(sum(x.net) filter (where not x.foreign_leg), 0),' || chr(10)
    || '           coalesce(sum(x.net) filter (where x.foreign_leg), 0)' || chr(10)
    || '      into v_gl_cost, v_for_cost' || chr(10)
    || '      from (select (l.debit_cents - l.credit_cents) as net,' || chr(10)
    || '                   coalesce(clara._fa_gl_leg_foreign(p_client, r.asset_code, j.id,' || chr(10)
    || '                     coalesce(j.approved_at, j.created_at)), false) as foreign_leg' || chr(10)
    || '              from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id' || chr(10)
    || '             where l.client_id = p_client and l.account_code = r.asset_code and v_cost_row' || chr(10)
    || '               and j.status = ''approved'' and j.posting_date <= p_as_of) x;');

  -- (iii) THE ACCUMULATED SUM, including the no-accumulated-code branch, so v_for_accum is
  -- never left carrying the previous loop iteration''s figure.
  v_a := '    if r.accum_code is null then' || chr(10)
      || '      v_gl_accum := 0;' || chr(10)
      || '    else' || chr(10)
      || '      select coalesce(sum(l.credit_cents - l.debit_cents), 0) into v_gl_accum' || chr(10)
      || '        from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id' || chr(10)
      || '        where l.client_id = p_client and l.account_code = r.accum_code' || chr(10)
      || '          and j.status = ''approved'' and j.posting_date <= p_as_of;' || chr(10)
      || '    end if;';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (iii): the UNSCOPED accumulated-side GL sum is not present exactly once -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a,
       '    if r.accum_code is null then' || chr(10)
    || '      v_gl_accum := 0; v_for_accum := 0;' || chr(10)
    || '    else' || chr(10)
    || '      select coalesce(sum(x.net) filter (where not x.foreign_leg), 0),' || chr(10)
    || '             coalesce(sum(x.net) filter (where x.foreign_leg), 0)' || chr(10)
    || '        into v_gl_accum, v_for_accum' || chr(10)
    || '        from (select (l.credit_cents - l.debit_cents) as net,' || chr(10)
    || '                     coalesce(clara._fa_gl_leg_foreign(p_client, r.accum_code, j.id,' || chr(10)
    || '                       coalesce(j.approved_at, j.created_at)), false) as foreign_leg' || chr(10)
    || '                from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id' || chr(10)
    || '               where l.client_id = p_client and l.account_code = r.accum_code' || chr(10)
    || '                 and j.status = ''approved'' and j.posting_date <= p_as_of) x;' || chr(10)
    || '    end if;');

  -- (iv) THE PRE-ENROLMENT COST COLUMN STAYS INSIDE THE COMPARED SUM. It explains part of
  -- cost_diff_cents; a figure that is no longer in that sum would explain nothing.
  v_a := '          and coalesce(j.approved_at, j.created_at) < v_enrolled;';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (iv): the pre-enrolment cost watermark test is not present exactly once -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a,
       '          and coalesce(j.approved_at, j.created_at) < v_enrolled' || chr(10)
    || '          and not coalesce(clara._fa_gl_leg_foreign(p_client, r.asset_code, j.id,' || chr(10)
    || '                    coalesce(j.approved_at, j.created_at)), false);');

  -- (v) ...AND THE PRE-ENROLMENT ACCUMULATED COLUMN, the same way.
  v_a := '          and coalesce(j.approved_at, j.created_at) < v_enrolled_accum;';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (v): the pre-enrolment accumulated watermark test is not present exactly once -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a,
       '          and coalesce(j.approved_at, j.created_at) < v_enrolled_accum' || chr(10)
    || '          and not coalesce(clara._fa_gl_leg_foreign(p_client, r.accum_code, j.id,' || chr(10)
    || '                    coalesce(j.approved_at, j.created_at)), false);');

  -- (vi) THE TWO EXPLANATION KEYS.
  v_a := '      ''gl_pre_enrolment_accum_cents'', v_pre_accum,';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception '0042 S5.19 splice (vi): the tie envelope is not the one this recut expects -- the body drifted' using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_a, v_a || chr(10)
    || '      -- WHAT ANOTHER REGISTER FAMILY LAWFULLY OWNED ON THIS CODE: excluded from the' || chr(10)
    || '      -- compared sums above and reported here instead (the staff_advance_tie' || chr(10)
    || '      -- out_of_window_cents posture, now symmetric). gl_cost_cents plus this figure is' || chr(10)
    || '      -- the whole approved movement on the account at p_as_of -- nothing is dropped,' || chr(10)
    || '      -- and no professional is shown a red tie that no act can clear.' || chr(10)
    || '      ''gl_foreign_register_cost_cents'', v_for_cost,' || chr(10)
    || '      ''gl_foreign_register_accum_cents'', v_for_accum,');

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_included_at(f.id, p_as_of)', 4),
      ('clara._fa_pending_unposted(f.id)', 3),
      ('status in (''pending'', ''active'')', 1),
      -- FOUR GL-side sites, one predicate: the two compared sums and the two pre-enrolment
      -- columns. Three would mean one sum quietly went back to reading the whole account.
      ('clara._fa_gl_leg_foreign(', 4),
      ('''gl_foreign_register_cost_cents''', 1),
      ('''gl_foreign_register_accum_cents''', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.19 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- NO UNSCOPED SUM SURVIVED. The two anchors above were counted before they were spliced;
  -- this asserts the OUTCOME, which is the thing that actually matters: no remaining GL sum
  -- reads `into v_gl_cost`/`into v_gl_accum` straight off clara.journal_lines.
  if position('0), 0) into v_gl_cost' in v_def) <> 0
     or position('0), 0) into v_gl_accum' in v_def) <> 0 then
    raise exception '0042 S5.19 postcheck: an UNSCOPED whole-account GL sum survived the recut -- the tie would still report another register''s lawful movement as an unexplained fixed-asset difference'
      using errcode = 'CLR10';
  end if;
  -- [SPLIT D-b1 2026-08-04] THE WHOLE UNIT ASSERTS THE UNGATED ARM IS GONE; THIS SLICE ASSERTS THE GATED
  -- ARM SURVIVED. Same claim, from the other side of the pull-forward: the walk this block did
  -- not install must still be there after the six GL splices re-created the body.
  if position(v_frm in v_def) = 0 then
    raise exception '0042 S5.19 postcheck: the GATED walk arm did not survive the splice'
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

  -- (3) BELT BESIDE BRACES, AND SAID SO HONESTLY. Before round 6 the re-claim argument RESTED
  -- on this: a released-then-reclaimed code was safe only because the advance era netted to
  -- zero. It no longer does -- the advance era is now scored foreign at its own approval
  -- instant and excluded whatever it nets to -- so this check is retained as a guard on the
  -- ADVANCE family''s own honesty, not as the fixed-asset tie''s load-bearing premise. Keeping
  -- it costs nothing; losing it silently would still be a real regression next door.
  select p.prosrc into v_frm from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'retire_staff_advance_account';
  if v_frm is null or position('advance_outstanding_on_retire' in v_frm) = 0 then
    raise exception '0042 S5.19 (3): clara.retire_staff_advance_account no longer refuses on an outstanding advance -- an enrolment can now be retired with money still out, which the advance register''s own tie and statement both assume cannot happen'
      using errcode = 'CLR10';
  end if;

  -- (4) THE TWO FORMS OF THE RESERVATION AUTHORITY KNOW THE SAME FAMILIES. This is the
  -- class-level half of the fix. clara._acct_role_reserved is what every CLAIMING DOOR asks;
  -- clara._acct_role_reserved_at is what every AS-OF READER asks. If a third register family
  -- is ever unioned into one and not the other, the doors would reserve a code the ties still
  -- score as nobody''s -- which is precisely how the fixed-asset walk and the fixed-asset GL
  -- side came to disagree in the first place. Enforced as CONTAINMENT of the now-form''s own
  -- literals, so a new domain fails here by name rather than being noticed later.
  for r in select unnest(regexp_matches(p.prosrc, '''([a-z_]+)''::text', 'g')) as lit
             from pg_proc p
            where p.pronamespace = 'clara'::regnamespace
              and p.proname = '_acct_role_reserved' loop
    if position('''' || r.lit || '''::text' in
         (select p.prosrc from pg_proc p where p.pronamespace = 'clara'::regnamespace
            and p.proname = '_acct_role_reserved_at')) = 0 then
      raise exception '0042 S5.19 (4): clara._acct_role_reserved classifies a claim as "%" and clara._acct_role_reserved_at has never heard of it. The AS-OF form of the authority must know every family the NOW form knows, or a reader that answers as of a date will score that family''s lawful movements as nobody''s and report them as an unexplained difference no act can clear.', r.lit
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) ...AND THEY READ THE SAME TABLES. A domain literal can be carried while the rows it is
  -- derived from are not: the now-form reaches clara.fixed_assets and clara.fa_account_profiles
  -- through clara._fa_reserved_roles, so both bodies are read together. Restricted to names
  -- that really are TABLES in clara, so the delegate function name is not mistaken for one.
  select coalesce(string_agg(t.rel, ', ' order by t.rel collate "C"), '') into v_frm from (
    select distinct m[1] as rel
      from pg_proc p,
           lateral regexp_matches(p.prosrc, '(?:from|join)[[:space:]]+clara\.([a-z_]+)', 'g') m
     where p.pronamespace = 'clara'::regnamespace
       and p.proname in ('_acct_role_reserved', '_fa_reserved_roles')
       and to_regclass('clara.' || m[1]) is not null
       and (select c.relkind from pg_class c where c.oid = to_regclass('clara.' || m[1])) = 'r'
       and position('clara.' || m[1] in
             (select p2.prosrc from pg_proc p2 where p2.pronamespace = 'clara'::regnamespace
                and p2.proname = '_acct_role_reserved_at')) = 0) t;
  if v_frm <> '' then
    raise exception '0042 S5.19 (5): the NOW form of the reservation authority derives claims from clara.{%} and the AS-OF form never reads them -- the two forms would answer differently about the same fact, and fa_register_tie believes they do not', v_frm
      using errcode = 'CLR10';
  end if;

  raise notice '0042 S5.19 OK: fa_register_tie walks only the accounts the FA family holds AT p_as_of AND sums only the GL that family owns at each entry''s approval instant; a foreign register''s lawful movement rides gl_foreign_register_*; the walk gate and the lifecycle gate agree on every admitted status; both forms of the reservation authority know the same families and read the same tables.';
end $s5_19$;

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
-- [SPLIT D-b1 2026-08-04] THIS FILE IS THE D-b1 SLICE OF SECTION 6. Census sect.5 splits the twenty-one
-- tails four ways under one rule: a tail whose subject is a CLOSED SET ships pure, per-slice; a
-- tail that enumerates a ROSTER SPANNING FAMILIES ships per-slice with a slice-local expected
-- roster and an explicit `FORWARD TOLERANCE` comment naming the final form -- and NEVER as an
-- `if to_regprocedure(...) is not null` guard, which converts a build-time census into a
-- conditionally-vacuous one (the fail-open class round 7 measured). NOT ONE ROSTER BELOW IS A
-- `>=` FLOOR OR A CONDITIONAL: every one is EXACT and fails by name.
-- THIS SLICE CARRIES: tails 10 (its four-table half), 19 and 21 -- pure -- and the slice-local
-- forms of tails 1, 3, 6, 7, 8, 9 and 20. Tail 9 arrives at its FINAL form here rather than in
-- D-b2, and that is the one place this slice completes rather than narrows: arm (d) asserts BOTH
-- advance sources of clara._acct_role_reserved, which is the claim D-b0 could not make while it
-- carried the FA-only shell.
-- The other eleven tails ship with the families they are about:
--   2 (origin='scheduled_run')                     -> D-b2 (this slice keeps 0041's form)
--   4, 5, 11, 13                                   -> D-b3 (pure)
--   12, 15, 17, 18                                 -> D-b2 (pure)
--   14                                             -> split by event name: D-b2 / D-b3
--   16                                             -> ALREADY SHIPPED, D-b0 (pure)
-- FINAL FORMS of tails 1, 3, 6, 7, 8 and 20 land in D-b2, the last slice to ship.
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
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL. (a) and (b) are byte-exact and are still the load-bearing half:
-- this slice ADDS A HOOK LINE to clara._subledger_on_approve (S5.8-b1) without adding an approve
-- path or a hook caller, so the two censuses must read exactly what SECTION 0 probe 10 measured
-- before the migration ran -- a delta of zero, asserted rather than assumed. (c) gains the
-- staff-advance hook beside the D-a one D-b0 pinned: two rows now, on the same instrument, so
-- "called from exactly one body, and exactly once inside it" is a claim this slice makes of its
-- own new hook rather than inherits. (d) is narrowed to its THIRD arm -- the only one whose
-- subject exists here -- and that arm is the one this slice can honestly make: the advance hook
-- mints REGISTER rows only, so it contributes no re-entrant edge and the depth-2 bound does not
-- depend on its arms.
-- FORWARD TOLERANCE: the FINAL (D-b2) form of (c) adds ('clara._adj_on_approve(',
-- '_adj_on_approve'), and (d) arrives whole in D-b2 -- arms (i) and (ii) are about
-- clara._adj_on_approve's role tokens, its auto_reversal_of stamp and its single core call, and
-- the depth-2 recursion they bound does not exist until the adjustment hook does.
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

  -- (c) BOTH D-b HOOKS ARE CALLED FROM THE ONE PLACE, IN THE ONE ORDER. _adj_on_approve mints
  -- the auto-reversal mirror; _adv_on_approve reads the entry's legs. Calling either from a
  -- second site would materialise a proposal twice.
  -- COMMENT-STRIPPED, throughout (c) and (d). A splice comment that names the very call it sits
  -- above is good practice and would inflate every count below on raw source -- a tail that
  -- refuses correct code because the author explained it is a tail nobody keeps.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_sub from pg_proc p
    where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  -- p.proname <> the target itself, per marker [round-8 M2, the S5.15e self-match fix]: under
  -- the widened read, _adj_on_approve's/_adv_on_approve's OWN pg_get_functiondef header
  -- ("CREATE OR REPLACE FUNCTION clara._adj_on_approve(...)") contains its own call shape
  -- verbatim, so unguarded this loop would find TWO callers (the real one plus the hook
  -- self-matching its own signature line) where exactly one is pinned.
  -- [SPLIT D-b1 2026-08-04] TWO ROWS: the D-a hook D-b0 pinned, and this slice's own. The adjustment
  -- hook is D-b2's and is deliberately NOT listed -- a row for a body that does not exist would
  -- fail this census by name, which is the correct behaviour and the wrong slice to have it in.
  for r in select * from (values
      ('clara._fa_on_approve(', '_fa_on_approve'),
      ('clara._adv_on_approve(', '_adv_on_approve')) as t(marker, bare) loop
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

  -- (d) BOUNDED RECURSION, DEPTH 2 (design SS2.4/SS2.6, [L2] "the mirror hook re-entry is
  -- finite and mint-free").
  -- [SPLIT D-b1 2026-08-04] ARM (iii) ONLY, AND IT IS A REAL CLAIM RATHER THAN A PLACEHOLDER. The cycle
  -- (a)/(b) bound runs _approve_entry_core -> _subledger_on_approve -> the ADJUSTMENT hook ->
  -- (arm 2) mirror INSERT + _approve_entry_core(preheld) -> ... and it does not exist in this
  -- slice's world at all, because the body that re-enters the core is D-b2's. What DOES exist is
  -- the advance hook, and the whole-unit arm (iii) is precisely the statement that it adds no
  -- re-entrant edge: "_adv_on_approve calls the core NOT AT ALL -- it mints register rows only,
  -- so the depth-2 bound does not depend on its arms". Asserting it here, at the moment the hook
  -- is first spliced in, is asserting it at the only moment it could first become false.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form restores arms (i) and (ii) -- both role tokens, the
  -- auto_reversal_of stamp and the single core call inside clara._adj_on_approve -- with the body
  -- they are about.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_adv from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_adv_on_approve';
  if v_adv is null then
    raise exception '0042 tail 1(d): clara._adv_on_approve does not exist -- the staff-advance hook this slice splices into clara._subledger_on_approve was not created';
  end if;
  if position('clara._approve_entry_core(' in v_adv) <> 0 then
    raise exception '0042 tail 1(d): clara._adv_on_approve calls clara._approve_entry_core -- the advance hook mints REGISTER rows only (design SS3.3). An approval from there adds a re-entrant edge the depth-2 bound does not cover.';
  end if;

  raise notice '0042 tail 1 OK (D-b1 slice): the four approve paths and the four hook callers are the SAME pinned four (measured by two independent instruments) and this slice moved neither; the D-a and staff-advance hooks are each called exactly once, from clara._subledger_on_approve alone; the advance hook adds no re-entrant edge.';
end $tail1$;

-- =====================================================================================
-- TAIL 3 -- THE POSITIONAL SPLICE CENSUS (design SS8 tail 3 + the SS8 CoR register).
-- One row per change-of-record splice SECTIONS S4/S5 make, asserted on the LIVE body as
-- BOTH-PRESENT-AND-ORDERED. A bare `position(a) < position(b)` reads a MISSING marker
-- (position 0) as correctly ordered and passes vacuously -- the mistake 0041 tail 3 names in
-- its own comment -- so every ordered claim below first asserts both endpoints exist.
--
-- WHY POSITION AND NOT PRESENCE. Four of these splices are only correct in one place:
--   * the two D-b hooks must sit BELOW the FA hook and ABOVE the settlement early-return, or
--     they are dead code for every non-settlement entry (the 0041 [L2/round-1] defect, exactly);
--   * _wdb_reversal_blocked must sit ABOVE the mirror INSERT, or a pair half is reversed and
--     THEN refused, leaving the maker a success receipt for a mirror that can never approve;
--   * the pair/flags refusals must sit BELOW the FOR UPDATE row lock, or they read a world
--     that can change under them;
--   * set_client_fy_end's new rung must sit BETWEEN its op reservation and its write.
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL: ONE ROW PER SPLICE THIS SLICE MAKES. The whole-unit block carries
-- eight numbered sites; this slice makes the advance half of (1) and the WALL half of (2), and it
-- asserts nothing about the other six, which are D-b0's and D-b2's:
--   (1) THE HOOK CHAIN -- asserted here at THREE anchors (fa -> advance -> the settlement early
--       return) rather than four. The adjustment anchor is D-b2's, and its absence is asserted
--       positively by S5.8-b1's own postcheck rather than being ordered vacuously here.
--   (2) THE WALL AND ITS ORDERING -- asserted here IN FULL. D-b0 deferred exactly this to D-b1
--       by name and asserted, in its own copy of this block, only the six pre-0042 markers plus
--       the correction-date term it added. Both of those are re-asserted below as a regression
--       floor: a body that lost D-b0's half while gaining this one would pass a census that only
--       looked at what this slice added.
--   (3) clara.revise_entry's flags + pair refusals    -- D-b2.
--   (4) clara.withdraw_draft's pair refusal           -- D-b2.
--   (5) clara.set_client_fy_end's rung + cadence      -- the rung and the depreciation-authority
--       arm shipped in D-b0 (errata E6); the clara.adjustment_templates arm is D-b2's.
--   (6) clara._fa_assert_code_unreserved              -- D-b0's splice. NOT re-asserted here even
--       though THIS slice completes the union it reads: the splice is D-b0's, the completion is
--       tail 9(d)'s subject below, and duplicating the claim would put two slices' names on one
--       body's ordering.
--   (7)/(7b)/(8) the FA reader and writer guards      -- D-b0's.
-- FORWARD TOLERANCE: the FINAL form of this block is D-b2's, at all eight sites.
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
  -- [SPLIT D-b1 2026-08-04] THREE ANCHORS. v_b (the adjustment hook) is D-b2's and is not measured here;
  -- the relation this slice can prove is that ITS line sits below the D-a hook and above the
  -- settlement early-return, which is the whole of what makes it not dead code.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form measures four anchors and asserts a < b < c < d.
  v_a := position('clara._fa_on_approve(p_entry)' in v_src);
  v_c := position('clara._adv_on_approve(' in v_src);
  v_d := position('v_prop := e.flags -> ''settlement_allocation''' in v_src);
  if v_a = 0 or v_c = 0 or v_d = 0 then
    raise exception '0042 tail 3(1): _subledger_on_approve is missing one of the three ordered anchors this slice pins (fa=%, adv=%, settlement early-return=%) -- the SS3.3 splice has no position to be measured at', v_a, v_c, v_d;
  end if;
  if not (v_a < v_c and v_c < v_d) then
    raise exception '0042 tail 3(1): the hook chain is out of order (fa=%, adv=%, settlement early-return=%). The law is _fa_on_approve -> _adv_on_approve, BOTH of them above `v_prop := e.flags -> ''settlement_allocation''` -- below that line the body returns for every non-settlement entry, which is every advance movement.', v_a, v_c, v_d;
  end if;
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
  v_a := position('clara._fa_reversal_blocked(p_entry)' in v_src);
  v_b := position('clara._wdb_reversal_blocked(' in v_src);
  v_c := position('insert into clara.journal_entries(' in v_src);
  if v_b = 0 then
    raise exception '0042 tail 3(2): reverse_entry does not call clara._wdb_reversal_blocked -- the pair halves, the advance disbursement with live applications and the correction-carrying entry all stay reversible one-sidedly (ABI SSF: adjustment_pair_locked / advance_applications_outstanding / correction_entry_irreversible)';
  end if;
  if v_c = 0 then
    raise exception '0042 tail 3(2): reverse_entry no longer contains the mirror INSERT anchor this ordering is measured against -- re-derive it';
  end if;
  if not (v_a < v_b and v_b < v_c) then
    raise exception '0042 tail 3(2): the D-b reversal wall is misplaced (fa=%, wdb=%, mirror insert=%) -- it must sit beside the FA wall and STRICTLY ABOVE the mirror INSERT, or a refused reversal has already written its mirror', v_a, v_b, v_c;
  end if;
  -- [SPLIT D-b1 2026-08-04] D-b0's HALF OF THIS BODY IS RE-ASSERTED AS A REGRESSION FLOOR. The six
  -- markers above are the PRE-0042 ones; the correction-date term is the one D-b0's S5.9-b0
  -- added, and without it the re-run gate D-b0 also shipped refuses every lawful
  -- reverse-then-re-run of a depreciation period permanently (errata E1). A census that looked
  -- only at what THIS slice added would green a body that gained the wall and lost the date.
  if position('clara._wdb_correction_posting_date(' in v_src) = 0 then
    raise exception '0042 tail 3(2): reverse_entry no longer dates a period-stamped entry''s mirror through clara._wdb_correction_posting_date -- D-b0''s half of S5.9 was undone, and with the re-run gate live that refuses every lawful reverse-then-re-run of a depreciation period, permanently';
  end if;

  raise notice '0042 tail 3 OK (D-b1 slice): the hook chain runs _fa_on_approve -> _adv_on_approve above the settlement early-return with all six 0041 markers intact; reverse_entry carries the D-b reversal wall between the FA wall and the mirror INSERT, keeps its six pre-0042 markers and still dates a period-stamped mirror through the correction-date authority.';
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
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL: ARM (a), FOR THE ONE KEY THIS SLICE MINTS. Census sect.5 tail 6
-- carries the explicit warning this block exists to honour: "staff_advance_application's writer
-- set is {book_staff_advance_application} in D-b1 and {..., resolve_and_book_bank_line} in D-b3
-- -- a copied tail FAILS". So the expected set below is this slice's own, exact, and it is
-- expected to CHANGE at D-b3 -- which is the point of stating it rather than floor-ing it.
-- FORWARD TOLERANCE: at D-b3 this key's set becomes {book_staff_advance_application,
-- resolve_and_book_bank_line} and D-b3 ships that form; the FINAL (D-b2) form is the whole
-- unit's three-row loop, which adds 'recurring_adjustment' -> {_adj_on_approve,
-- _adj_run_occurrence_core} and 'bank_rule_suggested' -> {accept_bank_rule_suggestion}.
-- ARMS (b) AND (c) SHIPPED IN D-b0 with the full five-key list and are not repeated: (b) is a
-- claim about clara._draft_entry_core, which this slice does not touch, and (c) is a claim about
-- grants on clara.journal_entries, which this slice does not widen.
-- THE DETECTOR SELF-TEST IS BYTE-EXACT and is deliberately NOT re-aimed at this slice's key: it
-- is a pure string test of the regex SHAPE (minting vs reading), independent of which key it is
-- built for, and rewriting it would be changing an instrument to match a census rather than the
-- other way round.
-- =====================================================================================
do $tail6$
declare
  r record; v_n int; v_names text; v_def text; v_pat text;
begin
  -- (a) ONE WRITER SET PER KEY. The writer marker is the house minting form -- either
  -- jsonb_build_object('<key>', ...) or a jsonb literal carrying "<key>": -- measured on the
  -- normalised body so a reader that merely NAMES the key (revise_entry's refusal, the hook's
  -- own arm test, the S5 sighting carve-out) is not miscounted as a minter.
  if not ($$jsonb_build_object('bank_rule_suggested', jsonb_build_object($$
            ~* 'jsonb_build_object\([[:space:]]*''bank_rule_suggested''|"bank_rule_suggested"[[:space:]]*:')
     or not ($${"bank_rule_suggested": {"rule_id": 1}}$$
            ~* 'jsonb_build_object\([[:space:]]*''bank_rule_suggested''|"bank_rule_suggested"[[:space:]]*:')
     or ($$e.flags ? 'bank_rule_suggested'$$
            ~* 'jsonb_build_object\([[:space:]]*''bank_rule_suggested''|"bank_rule_suggested"[[:space:]]*:') then
    raise exception '0042 tail 6(a): the flags-key WRITER detector no longer separates minting from reading -- a census from it would count every reader as a writer, or every writer as neither';
  end if;
  for r in select * from (values
      -- key, the exact lawful writer set, and why it is that set
      ('staff_advance_application', 'book_staff_advance_application')
    ) as t(flagkey, want) loop
    v_pat := 'jsonb_build_object\([[:space:]]*''' || r.flagkey || '''|"' || r.flagkey || '"[[:space:]]*:';
    select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
      into v_names
      from pg_proc p
     where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
       and lower(regexp_replace(regexp_replace(regexp_replace(
             (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) ~* v_pat;
    if v_names <> r.want then
      raise exception '0042 tail 6(a): the writers of the "%" proposal key are {%} -- expected exactly {%}. A key is an instruction the approve hook executes against the books; every minting site has to be an audited verb somebody adjudicated (design SS9.5, ABI SSB).', r.flagkey, v_names, r.want;
    end if;
  end loop;

  raise notice '0042 tail 6 OK (D-b1 slice): the staff_advance_application proposal key has exactly one writer (clara.book_staff_advance_application); D-b3 adds clara.resolve_and_book_bank_line to that set and ships its own form of this arm.';
end $tail6$;

-- =====================================================================================
-- TAIL 7 -- THE NO-WAKE CENSUS (the wake-authority structural invariant, restated for D-b).
--
-- The agent never signs a template, never enrols an advance account, never approves a pair
-- correction and never resolves-and-books a bank line. That is not a policy the model is asked
-- to respect: the per-wake allowlist is the authority, and this census is what proves no D-b
-- verb slipped into it. Kept in its own block, free of pg_get_functiondef, so the ACL-shaped
-- literals here can never read as a change-of-record patch to the wiki gate.
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL: THE FOUR STAFF-ADVANCE VERBS THIS SLICE ADDS, AND ONLY THEM
-- (census sect.5 tail 7: "per-slice -- trivially: assert only the verbs this slice adds"). The
-- allowlist pattern set is narrowed to '%advance%' for the same reason the grant loop is: a
-- slice asserting that no wake row names an adjustment template is asserting something about a
-- verb it does not ship, in a file that cannot be the place that claim is kept honest.
-- THE MACHINE-VERB ARM IS D-b2's WHOLE, and its absence here is not a gap: it is about
-- clara.run_adjustment_occurrence, the ONE verb clara_runtime gains in the entire wave (census
-- sect.1e measured it: "clara_runtime gains exactly 2 -- run_adjustment_occurrence +
-- adjustment_run_due -- BOTH D-b2, so D-b0/D-b1/D-b3 change no runtime grant at all"). THERE IS
-- NO MACHINE LANE IN THE STAFF-ADVANCE FAMILY AT ALL -- S3.7 says so in as many words -- so this
-- slice has no positive machine claim to make in its place, and inventing one would be adding an
-- assertion the source never carried.
-- FORWARD TOLERANCE: D-b3 asserts its own two verbs, and the FINAL (D-b2) form restores the
-- fourteen-name loop, the full pattern set and both machine-verb arms.
-- =====================================================================================
do $tail7$
declare v_n int; v_names text; f text;
begin
  select count(*)::int, coalesce(string_agg(coalesce(fn_name, function_name), ', '), '')
    into v_n, v_names
    from clara.wake_fn_allowlist
   where coalesce(fn_name, function_name) like '%advance%';
  if v_n <> 0 then
    raise exception '0042 tail 7: % wake-allowlist row(s) name a staff-advance verb (%) -- the agent never enrols a staff advance, books an application or completes its particulars; every advance act is a professional act taken by a named human', v_n, v_names;
  end if;
  -- ...and no D-b verb is reachable by a wake role or the read-only agent role by GRANT either
  -- (the allowlist and the grant are two independent gates; D-a's tail pinned both).
  foreach f in array array[
      'enrol_staff_advance_account', 'retire_staff_advance_account',
      'book_staff_advance_application', 'complete_staff_advance_particulars'] loop
    select count(*)::int into v_n
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
      join pg_roles rr on rr.oid = a.grantee
     where p.pronamespace = 'clara'::regnamespace and p.proname = f
       and a.privilege_type = 'EXECUTE'
       and rr.rolname in ('clara_agent_ro', 'clara_wake_interactive', 'clara_wake_proactive');
    if v_n <> 0 then
      raise exception '0042 tail 7: clara.% is granted to an agent or wake role -- every D-b act is a professional act taken by a named human', f;
    end if;
  end loop;

  raise notice '0042 tail 7 OK (D-b1 slice): no wake-allowlist row names a staff-advance verb; none of the four staff-advance human verbs is granted to an agent or wake role.';
end $tail7$;

-- =====================================================================================
-- TAIL 8 -- THE _reserve_op RAISES-ON-MISMATCH PROBE + THE DERIVED-KEY COLLISION TOKEN
-- (design SS8 tail 8; ABI SSE's non-null rule, stated ONCE and asserted here).
--
-- THE WHOLE EAGER-RESERVATION DESIGN RESTS ON ONE PROPERTY OF _reserve_op: a key already
-- taken with DIFFERENT arguments RAISES; a key already taken with the SAME arguments REPLAYS
-- its stored result. D-b reserves derived sub-keys (`<op>:approve`, `<op>:mirror:approve`,
-- the two pair halves, the composite's draft leg) BEFORE any lock, unconditionally -- and then
-- spends them, pre-held, from a LATER approving transaction. If _reserve_op ever stopped
-- raising on mismatch, a derived key collision would silently REPLAY somebody else's receipt
-- instead of refusing, and the mirror of one occurrence could be attached to another.
--
-- The second half is the callers' obligation: a derived pre-reservation that returns non-null
-- is a COLLISION, never a replay -- because the derived key is minted from the very identity
-- the caller is about to create. ABI SSE names the token; every deriving body must carry it.
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL IN ITS SECOND HALF ONLY. The three clara._reserve_op arms are
-- byte-exact and are a closed-set claim about a 0037 body every slice depends on -- the eager
-- derived reservation this family performs is built on that raise, so re-asserting it here is a
-- regression floor, not a duplication of somebody else's claim. The DERIVING-BODY roster is
-- narrowed to the one this slice ships.
-- FORWARD TOLERANCE: D-b3 adds clara.resolve_and_book_bank_line and the FINAL (D-b2) form is the
-- whole unit's four-name loop {_adj_run_occurrence_core, _pair_reverse_core,
-- book_staff_advance_application, resolve_and_book_bank_line}.
-- =====================================================================================
do $tail8$
declare v_src text; v_name text; v_n int;
begin
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p
    where p.oid = 'clara._reserve_op(uuid,text,text,bytea)'::regprocedure;
  if v_src is null then
    raise exception '0042 tail 8: clara._reserve_op(uuid,text,text,bytea) is GONE -- every op-keyed act in this schema depends on it';
  end if;
  if position('v_hash is distinct from p_req_hash' in v_src) = 0 then
    raise exception '0042 tail 8: _reserve_op no longer compares the stored request hash against the caller''s -- an op key reused with different arguments would replay a foreign result instead of refusing';
  end if;
  if position('op_key reused with different args' in v_src) = 0 then
    raise exception '0042 tail 8: _reserve_op no longer RAISES on a request-hash mismatch -- the eager derived reservations of design SS2.3 and ABI SSE are built on that raise, not on a return value the caller might ignore';
  end if;
  if position('on conflict (firm_id, fn, op_key) do nothing' in v_src) = 0 then
    raise exception '0042 tail 8: _reserve_op no longer claims its receipt with an ON CONFLICT DO NOTHING insert -- the claim must be atomic, or two concurrent reservers both believe they won';
  end if;

  -- EVERY BODY THAT DERIVES A SUB-KEY NAMES THE COLLISION TOKEN (ABI SSE, the non-null rule).
  foreach v_name in array array['book_staff_advance_application'] loop
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_src is null then
      raise exception '0042 tail 8: clara.% does not exist -- it is one of the four bodies that pre-reserve a DERIVED approve sub-key', v_name;
    end if;
    if position('approve_key_collision' in v_src) = 0 then
      raise exception '0042 tail 8: clara.% pre-reserves a derived approve sub-key but never raises approve_key_collision -- a non-null return from a DERIVED reservation is a collision on an identity this transaction is about to create, and treating it as a replay hands back a receipt for somebody else''s act (ABI SSE)', v_name;
    end if;
    if position('clara._reserve_op(' in v_src) = 0 then
      raise exception '0042 tail 8: clara.% does not call clara._reserve_op -- its derived sub-keys are not reserved at all', v_name;
    end if;
  end loop;

  raise notice '0042 tail 8 OK (D-b1 slice): _reserve_op still claims atomically and RAISES on request-hash mismatch; clara.book_staff_advance_application, this slice''s one derived-key reserver, carries the approve_key_collision refusal.';
end $tail8$;

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
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL ROSTERS in (b) and (c); (a) is byte-exact; AND (d) REACHES ITS
-- FINAL FORM HERE. This is the one tail the split makes STRONGER at D-b1 than at D-b0 rather
-- than weaker: D-b0 could only assert the FA half of the union predicate, because it shipped the
-- FA-only shell; SECTION S2 of this file re-created clara._acct_role_reserved WITH its two
-- advance arms, so the whole-unit requirement -- "reads BOTH advance sources" -- is restored
-- below verbatim, not narrowed. Census sect.5 tail 9: "per-slice with forward tolerance; final
-- form in D-b2" -- which is true of (b) and (c), whose rosters D-b2 completes, and NOT of (d),
-- which has nothing left to gain.
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
  -- [SPLIT D-b1 2026-08-04] SLICE-LOCAL: D-b0's four FA-family doors PLUS this slice's two advance
  -- doors (clara.enrol_staff_advance_account and clara.retire_staff_advance_account, both of
  -- which take the leaf LEAF-LAST after the 203005004 client rung -- S3.1). Still EXACT, still
  -- failing by name.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form of this roster adds propose_adjustment_template and
  -- retire_adjustment_template, giving {_draft_opening_item_core, _fa_assert_code_unreserved,
  -- enrol_staff_advance_account, propose_adjustment_template, retire_adjustment_template,
  -- retire_fa_account_profile, retire_staff_advance_account, upsert_fa_account_profile}.
  v_expect := '_draft_opening_item_core, _fa_assert_code_unreserved, enrol_staff_advance_account, '
              || 'retire_fa_account_profile, retire_staff_advance_account, '
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
  -- [SPLIT D-b1 2026-08-04] SLICE-LOCAL: D-b0's two PLUS this slice's own hook. clara._adv_on_approve
  -- is the body this slice splices into an approve path, so it is exactly the body that would
  -- newly break this property; asserting it at the moment it is created is asserting it at the
  -- only moment it could first become false.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form of this list is {_adj_run_occurrence_core,
  -- _adj_on_approve, _adv_on_approve, _pair_reverse_core, approve_pair_reversal,
  -- _approve_entry_core, _subledger_on_approve, _settle_from_bank_line_core,
  -- resolve_and_book_bank_line}.
  foreach v_name in array array['_adv_on_approve', '_approve_entry_core', '_subledger_on_approve'] loop
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
  -- follows automatically. The ADVANCE half has no such reader (0042 creates it), so those two
  -- tables must still be named directly. Accept EITHER the delegated FA half or both FA table
  -- names inline; require both advance sources either way.
  if position('staff_advance_accounts' in v_src) = 0
     or position('staff_advances' in v_src) = 0 then
    raise exception '0042 tail 9(d): clara._acct_role_reserved does not read BOTH advance sources (ACTIVE enrolments and their register rows) -- a partial union lets the FA family claim a code an advance already owns';
  end if;
  if position('clara._fa_reserved_roles(' in v_src) = 0
     and (position('fa_account_profiles' in v_src) = 0 or position('fixed_assets' in v_src) = 0) then
    raise exception '0042 tail 9(d): clara._acct_role_reserved covers neither FA source -- it must either delegate to clara._fa_reserved_roles (the live 0041 union, preferred) or read fa_account_profiles AND fixed_assets directly; without one of those an advance enrolment can claim a code the FA register already owns';
  end if;

  raise notice '0042 tail 9 OK (D-b1 slice): one direct taker of the fa-roles leaf; exactly this slice''s six role-claiming doors call it; no posting or approve path takes it -- including the staff-advance hook this slice adds; the shared reservation predicate is lock-free and reads ALL FOUR sources, which is the completion of the FA-only shell D-b0 shipped.';
end $tail9$;

-- =====================================================================================
-- TAIL 10 -- THE SEVEN NEW TABLES: LIFECYCLE TRIGGERS, FORCED RLS, POLICIES AND GRANTS
-- (design SS2.1 "all seven asserted in the tail"; ABI SSD).
--
-- Asserted STRUCTURALLY -- by trigger type bits and policy shape -- rather than by trigger
-- name, because six independent lanes name their triggers, and a census keyed on names would
-- either be wrong or force a naming convention the design never stated. What is asserted is
-- what actually protects the data:
--   * FORCE row level security (without FORCE, clara_fn_owner -- the owner of every one of
--     these tables -- bypasses its own policies, which is every write path in this schema);
--   * a BEFORE TRUNCATE statement trigger bound to clara._tf_no_truncate (a TRUNCATE is the
--     one write that no append-only or transition trigger can see);
--   * at least one BEFORE ROW trigger on DELETE or UPDATE (the lifecycle guard: transition,
--     append-only, immutable, or no-delete -- which one depends on the table);
--   * an owner policy, and for the SIX firm-scoped tables a firm-predicated read policy;
--   * clara_authenticated holds SELECT and nothing else; no machine role holds anything.
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL BY CONSTRUCTION: the SAME loop over THIS slice's FOUR tables.
-- Census sect.5 tail 10: "split 4/3 -- trivially separable". Nothing in the loop body changes --
-- not one predicate, not one message -- because the property is per-table and the block was
-- already written as a loop over a table list. D-b2 ships the same block over
-- clara.adjustment_templates, clara.adjustment_runs and clara.adjustment_pair_reversals.
-- THE firm_scoped FLAG IS THE WHOLE OF THE ea1955_policy EXEMPTION and it travels with the row:
-- three firm-scoped tables carry the BEFORE-ROW lifecycle guard and a firm-predicated read
-- policy; clara.ea1955_policy instead proves it has NO write grant to any role, which assembly
-- reconciliation S6-A3 (kept verbatim below) argues is strictly stronger for reference data.
-- =====================================================================================
do $tail10$
declare
  r record; v_n int; v_names text; v_qual text;
begin
  for r in select * from (values
      ('staff_advance_accounts', true),
      ('staff_advances', true),
      ('staff_advance_applications', true),
      -- ea1955_policy is GLOBAL reference data (the 0016 system-reference idiom): same RLS
      -- posture, NO firm predicate, and no firm_id column to write one against.
      ('ea1955_policy', false)
    ) as t(tbl, firm_scoped) loop

    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'clara' and c.relname = r.tbl and c.relkind = 'r') then
      raise exception '0042 tail 10: clara.% was not created (ABI SSD names all seven)', r.tbl;
    end if;
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'clara' and c.relname = r.tbl
                     and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0042 tail 10: clara.% does not carry ENABLE + FORCE row level security -- without FORCE, clara_fn_owner (which owns the table and runs every SECURITY DEFINER verb) bypasses the very policies this row is about', r.tbl;
    end if;
    -- the TRUNCATE guard, bound to the house function rather than to any function that happens
    -- to be attached to a truncate trigger
    select count(*)::int into v_n from pg_trigger t
     where t.tgrelid = ('clara.' || r.tbl)::regclass and not t.tgisinternal
       and (t.tgtype & 32) <> 0 and (t.tgtype & 1) = 0
       and t.tgfoid = 'clara._tf_no_truncate()'::regprocedure;
    if v_n < 1 then
      raise exception '0042 tail 10: clara.% has no BEFORE TRUNCATE statement trigger bound to clara._tf_no_truncate -- a TRUNCATE is the one write no row-level guard can see', r.tbl;
    end if;
    -- The lifecycle guard (transition / append-only / immutable / no-delete).
    --
    -- ASSEMBLY RECONCILIATION S6-A3 (corrected at assembly, reported not relaxed). This was
    -- originally required of ALL SEVEN tables. It is right for the six FIRM-SCOPED tables,
    -- which are written by audited SECURITY DEFINER verbs running as clara_fn_owner: for
    -- those, a row trigger is the ONLY thing standing between a verb and a rewrite, because
    -- FORCE RLS does not distinguish one owner-run body from another.
    --
    -- clara.ea1955_policy is a different kind of object and ABI SSD.7 gives it a different
    -- posture on purpose: GLOBAL statutory reference data on the 0016 system-reference idiom,
    -- written ONLY by migrations. Its protection is not a row trigger but the ABSENCE of any
    -- write path -- no role outside the owner holds INSERT/UPDATE/DELETE, and tail 19 asserts
    -- that no granted function writes it either. That combination is strictly stronger than a
    -- row trigger for reference data, and it has direct precedent: clara.sst_threshold_schedule
    -- (the SST rate schedule, the closest live analogue -- an effective-dated statutory policy
    -- table) carries exactly this shape, no row triggers and no write grants.
    --
    -- So: the six firm-scoped tables must carry the row guard; ea1955_policy must instead
    -- prove it has NO write grant to any role. The exemption is evidence-backed, not a hole.
    if r.firm_scoped then
      select count(*)::int into v_n from pg_trigger t
       where t.tgrelid = ('clara.' || r.tbl)::regclass and not t.tgisinternal
         and (t.tgtype & 1) <> 0 and (t.tgtype & 2) <> 0 and (t.tgtype & (8 | 16)) <> 0;
      if v_n < 1 then
        raise exception '0042 tail 10: clara.% has no BEFORE-ROW trigger on DELETE or UPDATE -- every firm-scoped D-b table is transition-guarded, append-only or immutable (ABI SSD); an unguarded one can be rewritten by any owner-run body that reaches it', r.tbl;
      end if;
    else
      select count(*)::int, coalesce(string_agg(distinct g.grantee || ':' || g.privilege_type, ', '), '')
        into v_n, v_names
      from information_schema.role_table_grants g
      where g.table_schema = 'clara' and g.table_name = r.tbl
        and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
        and g.grantee <> 'clara_fn_owner';
      if v_n <> 0 then
        raise exception '0042 tail 10: clara.% is GLOBAL migration-written reference data (ABI SSD item 7) and carries NO row-level lifecycle trigger by design -- its ONLY protection is that nothing outside the owner may write it, but % write grant(s) exist (%). Either revoke them or give the table a row guard.', r.tbl, v_n, v_names;
      end if;
    end if;
    -- the owner policy
    select count(*)::int into v_n from pg_policies
     where schemaname = 'clara' and tablename = r.tbl and cmd = 'ALL'
       and 'clara_fn_owner' = any (roles);
    if v_n < 1 then
      raise exception '0042 tail 10: clara.% has no FOR ALL policy for clara_fn_owner -- with FORCE RLS on and no owner policy, the audited verbs cannot write their own table', r.tbl;
    end if;
    -- the read posture
    select coalesce(string_agg(distinct qual, ' | '), '') into v_qual from pg_policies
     where schemaname = 'clara' and tablename = r.tbl and 'clara_authenticated' = any (roles);
    if r.firm_scoped then
      if v_qual = '' or position('firm_id' in v_qual) = 0 then
        raise exception '0042 tail 10: clara.% has no firm-predicated read policy for clara_authenticated (qual is "%") -- a firm-scoped table without a firm predicate is a cross-tenant read', r.tbl, v_qual;
      end if;
    else
      if position('firm_id' in v_qual) <> 0 then
        raise exception '0042 tail 10: clara.ea1955_policy carries a firm predicate (qual is "%") -- it is GLOBAL reference data (ABI SSD item 7); a firm predicate there would hide the statutory notes from every firm', v_qual;
      end if;
      if exists (select 1 from information_schema.columns
                 where table_schema = 'clara' and table_name = 'ea1955_policy'
                   and column_name = 'firm_id') then
        raise exception '0042 tail 10: clara.ea1955_policy has a firm_id column -- EA 1955 is the law of Malaysia, not of a firm';
      end if;
    end if;
    -- grants: SELECT for humans, nothing else, nothing for machines
    select count(*)::int into v_n from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = r.tbl
       and grantee = 'clara_authenticated' and privilege_type <> 'SELECT';
    if v_n <> 0 then
      raise exception '0042 tail 10: clara_authenticated holds % non-SELECT grant(s) on clara.% -- every write goes through an audited verb', v_n, r.tbl;
    end if;
    if not has_table_privilege('clara_authenticated', 'clara.' || r.tbl, 'SELECT') then
      raise exception '0042 tail 10: clara_authenticated cannot SELECT clara.% -- the dashboard reads these tables directly', r.tbl;
    end if;
    select count(*)::int, coalesce(string_agg(distinct grantee::text, ', '), '') into v_n, v_names
      from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = r.tbl
       and grantee in ('clara_agent_ro', 'clara_runtime', 'clara_wake_interactive',
                       'clara_wake_proactive', 'PUBLIC');
    if v_n <> 0 then
      raise exception '0042 tail 10: % machine-role or PUBLIC grant(s) exist on clara.% (%) -- the agent never reads or writes a D-b register directly', v_n, r.tbl, v_names;
    end if;
  end loop;

  raise notice '0042 tail 10 OK (D-b1 slice): all four staff-advance/EA-1955 tables carry FORCE RLS, a _tf_no_truncate statement trigger, an owner policy and SELECT-only human grants with zero machine grants; the three firm-scoped tables carry a BEFORE-ROW lifecycle guard and a firm predicate, and ea1955_policy deliberately carries neither and holds no write grant instead.';
end $tail10$;

-- =====================================================================================
-- TAIL 19 -- clara.ea1955_policy IS MIGRATION-WRITTEN ONLY (design SS3.4; the 0016:5216-5229
-- sst_threshold_schedule precedent).
--
-- The EA 1955 notes are STATUTORY REFERENCE DATA: what the Employment Act says about advances
-- of wages, with a source note per fact. They are not firm data and not client data, and the
-- product must never be able to edit the law from inside itself -- a note edited through a verb
-- would be Clara telling a user what the statute says on Clara's own authority. Changing a
-- statutory fact is a MIGRATION, with a research record behind it (docs/plan/research/wave-d/).
--
-- ITS WRITE-DETECTOR IS NOT WIDENED [round-8 M2, adjudicated -- reported, not silently
-- skipped -- and this note deliberately sits HERE, in the section header ABOVE the do-block,
-- rather than inside it]. Every OTHER prosrc-only census in this file was widened this round
-- to read the source through BOTH prosrc and the deparsed body, closing the PG14+ standard-body
-- (a SQL function whose body is stored as a parsed tree rather than raw text) blind spot the
-- round-7 lens (S5.15e) and this round's TAIL 2(a)/TAIL 6(a) close. THIS census cannot take
-- that same widening: it lives in the SAME do-block as the ACL privilege-name literal two
-- lines below, and scripts/check-wiki-dynamic-sql.mjs's own comment-mask does NOT look inside
-- a dollar-quoted do-block body at all (Postgres's own lexer does not either -- a do-block's
-- $tag$...$tag$ body is one opaque string to it) -- so the gate's classification test runs on
-- the RAW text of the block, comments included, and a mention of the widening helper's name
-- ANYWHERE inside this specific block -- even in a comment explaining why it is absent --
-- reads exactly like a call to it, once combined with that privilege-name literal (MEASURED:
-- putting this very explanation INSIDE the block, instead of here, broke the gate on this
-- exact false positive). TAIL 7 above stays free of the same helper name for the identical
-- reason (its own header note says so). A correct widening would need the write-detector
-- split into its own block free of that literal, bridged back to this one -- which this
-- file's own header rules out ("each block is INDEPENDENT ... no shared state", line 5) -- so
-- it is reported here rather than forced.
-- =====================================================================================
do $tail19$
declare v_names text; v_n int;
begin
  -- Measured before trusted: the write detector must recognise bare and qualified forms and
  -- must not sweep in a sibling name.
  if not ('insert into clara.ea1955_policy(fact) values(x)'
            ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?ea1955_policy(?![a-z0-9_])')
     or not ('update  ea1955_policy  set note = x'
            ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?ea1955_policy(?![a-z0-9_])')
     or ('update clara.ea1955_policy_history set note = x'
            ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?ea1955_policy(?![a-z0-9_])') then
    raise exception '0042 tail 19: the ea1955_policy write detector no longer recognises the bare/whitespaced forms (or now sweeps in a sibling table) -- an empty census from it would be silence, not evidence';
  end if;
  select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '') into v_names
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
    join pg_roles rr on rr.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace
     and a.privilege_type = 'EXECUTE'
     and rr.rolname in ('clara_authenticated', 'clara_agent_ro', 'clara_runtime',
                        'clara_runtime_login', 'clara_wake_interactive', 'clara_wake_proactive')
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?ea1955_policy(?![a-z0-9_])';
  if v_names <> '' then
    raise exception '0042 tail 19: {%} are granted to an app or machine role AND write clara.ea1955_policy -- the statutory notes are migration-written only (design SS3.4). A statute changes by amendment, with a research record; it does not change because a verb was called.', v_names;
  end if;
  -- ...and the seed really landed, with a source note on every row (a note without a citation
  -- is the product asserting the law on its own authority, which is the thing being prevented).
  select count(*)::int into v_n from clara.ea1955_policy
   where nullif(btrim(coalesce(source_note, '')), '') is null;
  if v_n <> 0 then
    raise exception '0042 tail 19: % clara.ea1955_policy row(s) carry no source_note -- every statutory fact cites its primary source (ABI SSD item 7)', v_n;
  end if;
  select count(*)::int into v_n from clara.ea1955_policy;
  if v_n < 3 then
    raise exception '0042 tail 19: clara.ea1955_policy holds % row(s) -- ABI SSD item 7 seeds three (s.22 prior-month wage cap, s.24(2)(c) interest-free recovery, s.27 no interest)', v_n;
  end if;

  raise notice '0042 tail 19 OK: no granted function writes clara.ea1955_policy; every seeded row carries a source note.';
end $tail19$;
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
-- [SPLIT D-b1 2026-08-04] SLICE-LOCAL. The BOUNDARY CLAIMS THEMSELVES are byte-exact -- the
-- clara.open_items CHECK vocabulary and column shape (a), the counterparty kind vocabulary (b),
-- the two-NOTIFY-channel census (c) and the [WDB-G16] literal over the six immutability and belt
-- bodies (e) are closed-set negatives about 0041 relations, and a boundary is exactly the kind of
-- property that must be re-asserted at every slice that adds a writer.
-- ARM (b) SHIPS IN FULL, ROSTER INCLUDED, and it is the arm this whole family exists under: all
-- four bodies its writer census names (clara._adv_on_approve, clara.book_staff_advance_application,
-- clara.enrol_staff_advance_account, clara.complete_staff_advance_particulars) are created by
-- THIS slice, so "the staff-advance family never mints a counterparty" is measured here at the
-- only moment it could first become false. [WDB-G7] / WD-R10 / WC-R10: no employee counterparty,
-- EVER.
-- WHAT IS NARROWED is the two OTHER writer rosters -- (a)'s "which bodies write clara.open_items"
-- and (e)'s "the posters disable nothing" -- each cut to the D-b1 members. Arm (d) stays deferred
-- whole: this slice registers NO event, so a taxonomy-decision census over two names that do not
-- exist would pass vacuously, which census sect.5 forbids as a shape.
-- FORWARD TOLERANCE: D-b3 and D-b2 each restore the roster members their own bodies join; the
-- FINAL form is D-b2's, at which point (d)'s two event names both exist.
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
  select coalesce(string_agg(p.proname, ', ' order by p.proname), '') into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     -- [SPLIT D-b1 2026-08-04] THIS SLICE'S FOUR. FORWARD TOLERANCE: the FINAL (D-b2) form names
     -- _adj_run_occurrence_core, _adj_on_approve, _pair_reverse_core, accept_bank_rule_suggestion
     -- and resolve_and_book_bank_line beside these.
     and p.proname in ('_adv_on_approve', 'book_staff_advance_application',
                       'enrol_staff_advance_account', 'retire_staff_advance_account')
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?open_items(?![a-z0-9_])';
  if v_names <> '' then
    raise exception '0042 tail 20(a): {%} write clara.open_items directly -- open items are materialised by clara._subledger_on_approve from approved entries and by nothing else', v_names;
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
  select coalesce(string_agg(p.proname, ', ' order by p.proname), '') into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('_adv_on_approve', 'book_staff_advance_application',
                       'enrol_staff_advance_account', 'complete_staff_advance_particulars')
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* '(insert[[:space:]]+into|update)[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?counterparties(?![a-z0-9_])';
  if v_names <> '' then
    raise exception '0042 tail 20(b): {%} write clara.counterparties -- the staff-advance family never mints a counterparty', v_names;
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

  -- [SPLIT D-b1 2026-08-04] ARM (d) -- "no new frozen workflow class" -- IS NOT IN THIS SLICE. Its
  -- instrument is a count over clara.trigger_taxonomy rows for 'adjustment.posted' (D-b2) and
  -- 'bank.line_exception_reopened' (D-b3) whose decision is other than 'ignore'. Neither name is
  -- registered by this file, so the count is zero for the reason that makes a census worthless:
  -- there is nothing to count. Census sect.5 names that shape as the fail-open class round 7
  -- measured and forbids it. FINAL FORM: D-b2, when both event names exist.

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
  -- ...and the D-b posters do not disable anything either (no ALTER TABLE, no session_replication_role).
  -- [SPLIT D-b1 2026-08-04] THIS SLICE'S ONE POSTER. FORWARD TOLERANCE: the FINAL (D-b2) form is
  -- {_adj_run_occurrence_core, _adj_on_approve, _adv_on_approve, _pair_reverse_core}.
  foreach v_name in array array['_adv_on_approve'] loop
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_src is null then
      raise exception '0042 tail 20(e): clara.% does not exist -- the poster census has lost a subject', v_name;
    end if;
    if position('session_replication_role' in v_src) <> 0
       or position('alter table' in v_src) <> 0
       or position('disable trigger' in v_src) <> 0 then
      raise exception '0042 tail 20(e): clara.% disables a trigger or alters a table at run time -- a poster that turns a belt off to get its own write through is the one shape [WDB-G16] forbids outright', v_name;
    end if;
  end loop;

  raise notice '0042 tail 20 OK (D-b1 slice): open_items is unwidened and unwritten by the advance family; no employee counterparty kind and no counterparty write from ANY of the four bodies that could have made one; exactly the two pre-existing NOTIFY channels; the immutability triggers and all four belts are innocent of D-b, and the advance hook disables nothing.';
end $tail20$;

-- =====================================================================================
-- TAIL 21 -- THE TWO staff_advance ENTRY_ID INDEXES [round-7 E4, task #63, the D-a F10
-- class]. The ix_je_adj_draft/ix_je_adj_occurrence pin at tail 18 is the precedent this one
-- clones exactly, for the sibling reason: entry_id carries a foreign key to
-- journal_entries, and Postgres never auto-indexes the REFERENCING side of a foreign key, so
-- every entry_id-keyed read in the advance family -- clara._adv_net_applications,
-- clara._adv_entry_carries_correction, and the round-4 row-lock statement's `for update` scan
-- and its arm-1a application loop -- was a sequential scan over the whole table. MEASURED on
-- a 60,000-row synthetic population (packages/db/tests/x42-r7-s5-entry-indexes.test.mjs):
-- both moved from a Seq Scan (~1225-1579 buffer hits, ~59,999 rows removed by filter) to an
-- Index Only Scan (~4 buffer hits) for the identical answer.
-- =====================================================================================
do $tail21$
declare r record; v_def text; v_norm text;
begin
  for r in select * from (values
      ('ix_staff_advances_entry', 'staff_advances', 'entry_id'),
      ('ix_staff_advance_applications_entry', 'staff_advance_applications', 'entry_id')
    ) as t(idx, table_name, want_key) loop
    select pg_get_indexdef(c.oid) into v_def
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = r.idx and c.relkind = 'i';
    if v_def is null then
      raise exception '0042 tail 21: the entry_id index clara.% does not exist (round-7 E4) -- every entry_id-keyed scan in the advance family (the round-4 row-lock statement, both _adv_ helper predicates) would stay sequential', r.idx;
    end if;
    if position(r.table_name in v_def) = 0 then
      raise exception '0042 tail 21: clara.% is not an index on clara.% (def is %)', r.idx, r.table_name, v_def;
    end if;
    v_norm := replace(replace(replace(replace(replace(lower(v_def),
                '::text', ''), ' ', ''), '(', ''), ')', ''), '"', '');
    if position(r.want_key in v_norm) = 0 then
      raise exception '0042 tail 21: clara.% does not key on % (normalised def is %) -- the index would not answer the question it exists for', r.idx, r.want_key, v_norm;
    end if;
    -- UNLIKE tail 18's two hot-loop indexes, these are NOT partial -- entry_id is NOT
    -- NULL on both tables (SS1.5/SS1.6) and every reader filters on it unconditionally, so
    -- a WHERE clause would narrow nothing; asserted as its ABSENCE, the mirror image of
    -- tail 18's assertion that ITS indexes MUST carry one.
    if position('where' in v_norm) <> 0 then
      raise exception '0042 tail 21: clara.% carries a WHERE clause -- entry_id is NOT NULL on both tables and every reader filters on it unconditionally, so a partial predicate would narrow nothing and only risk excluding a legitimate row', r.idx;
    end if;
  end loop;

  raise notice '0042 tail 21 OK: both staff_advance entry_id indexes exist, key on entry_id, and are unconditional (entry_id is NOT NULL on both tables).';
end $tail21$;

do $tail_final$
begin
  raise notice '0042 wave D-b SLICE D-b1 (staff advances): APPLIED. SECTION 0 (6 probes) + S1 (staff_advance_accounts, staff_advances, staff_advance_applications, ea1955_policy + its 3-row EA 1955 seed, 9 triggers, 8 policies, 4 grants, 19 indexes incl. both entry_id indexes) + S2 (clara._acct_role_reserved COMPLETED with its advance arms; clara._wdb_reversal_blocked) + S3 (the whole staff-advance family: enrolment, the register, the authoritative guards, the approve hook, the deferred movement belt, 3 reads, the grant loop and the list_review_queue splice) + S5 (S5.8-b1 the advance hook splice, S5.9-b1 the reversal wall + its ordering postcheck, S5.19 the fa_register_tie recut with clara._acct_role_reserved_at COMPLETED) + tails 1, 3, 6, 7, 8, 9, 10, 19, 20, 21, all green. NEXT: D-b3 (the AF-2 composite + the producer), then D-b2 (recurring adjustments, held back with the round-11 fixes).';
end $tail_final$;

