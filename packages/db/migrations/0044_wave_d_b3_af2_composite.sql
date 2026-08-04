-- 0044_wave_d_b3_af2_composite.sql -- WAVE D-b, SLICE D-b3: THE AF-2 RESOLVE-AND-BOOK
-- COMPOSITE AND THE bank_rule_suggested PRODUCER.
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. The as-built ladder's round-11 conditional rule fired
-- (ladder-r11-record.md, 2026-08-04), so the 21,163-line Wave D-b unit is PROVEN NON-CONVERGENT
-- and THE SPLIT IS THE EXECUTED RULING: D-b0 (the shared class authorities + the D-a residual
-- recuts) shipped FIRST, D-b1 (staff advances) SECOND, THIS FILE (D-b3, the AF-2 composite +
-- the producer) THIRD, and D-b2 (recurring adjustments) is HELD BACK with the round-11 fixes and
-- its own ladder. The partition is not invented here: it is the measured file map of
-- `split-dependency-census.md` sect.8 (the D-b3 bullet list), whose sect.2 classifies all 22
-- cross-slice order violations, sect.3 gives the per-block purity verdict, sect.5 the tail split,
-- sect.6 the test split and sect.7 the seven hazards this extraction honours -- AS CORRECTED BY
-- THE BINDING ERRATA in `split-build-record.md` (E5: the S5.25 arm (D) clock roster carries
-- clara.settle_from_bank_line in D-b0/D-b1 "until D-b3's SECTION S4 factors it" -- SECTION S4 of
-- THIS file does exactly that, and the residue is recorded as errata E12 in the split build
-- record rather than repaired by a block this slice's map never carried; E8's INVERSE: clara._subledger_on_approve
-- is D-b0/D-b1/D-b2's body and this slice does not splice, read or name-with-an-open-paren it
-- anywhere -- census hazard sect.7.3 read backwards; E9: the [SPLIT-CREATED] probe class, applied
-- below to the FIVE D-b0/D-b1 bodies SECTION S4 CALLS; E3/E10/E11: census counts are measured on
-- the rig, never taken from the census's arithmetic).
--
-- SHIP ORDER: this file applies AFTER 0043_wave_d_b1_staff_advances and BEFORE D-b2's 0045. Both
-- halves of that sentence are load-bearing and both are measured, not assumed. AFTER D-b1,
-- because SECTION S4's clara._wdb_line_booking_block calls clara._wdb_reversal_blocked,
-- clara._adv_reversal_admission and clara._adv_release_one_way, and the composite's hand-draft
-- leg calls clara._adv_assert_proposal -- four D-b1 bodies (census sect.2's "legal under the
-- order" list, which is explicit that D-b1-before-D-b3 is load-bearing in four places). BEFORE
-- D-b2, because D-b2's SECTION S2 remainder creates clara._adj_on_approve, whose arm (3)
-- re-derives the producer's legs through the two suggestion bodies THIS file creates in its
-- SECTION S2 fragment -- so the derivation authority has to exist before its second reader does.
--
-- SCOPE OF THIS SLICE (census sect.8's D-b3 bullet list, in order): the pre-DDL probes narrowed
-- to this slice's own column/event/splice subjects; SS1.8 (the two clara.bank_matches park
-- columns, their CHECK and FK, and the set-once trigger); the bank.line_exception_reopened HALF
-- of SECTION EVENTS; the two s2 suggestion-derivation bodies (clara._wdb_suggestion_rule_hit and
-- clara._wdb_suggestion_lines -- census sect.2 Class A, misfiled in the adjustment section and
-- carrying no adjustment dependency at all); SECTION S4 WHOLE, including its four live-body
-- splices and the seven-site parked-declaration admission; and tails 4, 5, 11, 13 and the D-b3
-- half of 14 pure, plus the slice-local forms of 6, 7, 8 and 20.
--
-- EVERY ALTERED SITE IS MARKED IN SOURCE with a `-- [SPLIT D-b3 2026-08-04] ...` comment naming what
-- was narrowed or completed and WHERE the final form lands. Everything else is byte-exact from
-- the canonical sections (0042-sections/s0,s1,s2,s4,s6), comments included. SECTION S4 MOVES
-- WHOLE: not one line of it is edited, added or removed.
--
-- DESIGN OF RECORD (unchanged): docs/plan/wave-d-b-design.md v8 [WDB-G1..G16] +
-- docs/plan/wave-d-b-design-abi.md (the builder ABI). Governing law above the design:
-- docs/plan/wave-d-contract.md (WD-R1..WD-R15, ADR-055); docs/prd/PRD.md SS6 (LAW) always. The
-- AF-2 composite is WD-R13; the high-stakes park is [WDB-G9]; the boundary ruling is [WDB-G16].
--
-- ROLE SCOPING IS PER-FILE AND PER-BLOCK (census hazard sect.7.4). In the whole unit SECTION S2
-- opened `set role clara_fn_owner` at its L39 and NEVER reset, and SECTION S3 then relied on that
-- INHERITED role for its first 2,650 lines -- the exact coupling that breaks the instant the
-- sections are split across migrations. SECTION S4 is the one canonical section that already
-- opens and closes its OWN scope (its L252 / L4370), which is why it can move whole; every OTHER
-- section file of this slice opens and closes its own, and the assembler asserts the balance PER
-- FILE rather than trusting it.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law); the frontier probe below pins
-- 0043_wave_d_b1_staff_advances as the applied predecessor -- not 0041 and not 0042, because the
-- dependency on D-b1 is a REAL call graph (see SHIP ORDER above), not a ceremony, and because
-- clara.schema_migrations is append-only, so 0043 present implies 0042 and 0041 applied.
--
-- THE `0042` IN EVERY MESSAGE BELOW IS THE WAVE TAG, NOT THIS FILE'S NUMBER, and it is kept that
-- way ON PURPOSE (D-b0's convention, followed by D-b1, followed here rather than diverged from).
-- All four slices are the content of ONE authored unit -- Wave D-b, migration 0042 as designed --
-- and SECTION S4, the tail blocks and the probes are cut BYTE-EXACT from that unit's own
-- sections, every one of them raising '0042 S4.x'/'0042 tail N'. Renumbering the strings this
-- slice authors to 0044 while the cut ones still said 0042 would make one file speak with two
-- voices about which migration it is. The SLICE is identified by its own discriminator instead --
-- `D-b3`, `(D-b3 slice)` -- which is what a reader greps for when a census fails. The FILE NUMBER
-- lives in the filename and in clara.schema_migrations, and is claimed at merge like every other.

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
  v_n int; v_names text; v_ver int;
begin
  -- PROBE 1 -- FRONTIER ASSERT.
  -- [SPLIT D-b3 2026-08-04] THE FRONTIER IS D-b1, NOT 0041 AND NOT D-b0. The whole unit pinned
  -- 0041_wave_d_a_fa_register because it was the applied predecessor of the ONE file; this slice's
  -- predecessor is the slice before it in the ship order, and the dependency is a REAL CALL GRAPH:
  -- SECTION S4's clara._wdb_line_booking_block calls clara._wdb_reversal_blocked (D-b1's SECTION
  -- S2 fragment), clara._adv_reversal_admission and clara._adv_release_one_way (D-b1's SECTION
  -- S3), and the composite's hand-draft leg calls clara._adv_assert_proposal (D-b1's SECTION S3).
  -- Applied onto a bare 0041 or onto D-b0 alone, SECTION S4 would CREATE bodies whose plpgsql
  -- forward references can never resolve -- every advance wall in the release report and every
  -- advance proposal on the hand-draft leg would raise `undefined_function` at the first real
  -- call, in the middle of a booking. 0041 and 0042 are not re-asserted here: D-b0's own frontier
  -- probe pinned 0041 and D-b1's pinned 0042, and clara.schema_migrations is append-only, so 0043
  -- present implies both.
  select count(*)::int into v_n from clara.schema_migrations
    where version = '0043_wave_d_b1_staff_advances';
  if v_n <> 1 then
    raise exception '0042 D-b3 probe 1: migration 0043_wave_d_b1_staff_advances is not recorded as applied -- the D-b slices ship in the order D-b0 -> D-b1 -> D-b3 -> D-b2 and SECTION S4 of this one CALLS four D-b1 bodies; apply in order';
  end if;

  -- [SPLIT D-b3 2026-08-04] PROBE 2 HAS NO D-b3 FORM, AND IT IS RECORDED RATHER THAN SILENTLY DROPPED
  -- (split-dependency census sect.8: "each keeps only its own relations/columns/indexes/event
  -- names"). THIS SLICE CREATES NO RELATION AT ALL: the four staff-advance/EA-1955 tables are
  -- D-b1's (shipped) and the three adjustment tables are D-b2's. What this slice adds to the
  -- SCHEMA is two COLUMNS on a pre-existing table, which is probe 3's subject below.
  -- FINAL FORM: the whole-unit probe 2, reassembled across the four slices.

  -- PROBE 3 -- PRE-STATE SAFETY: neither clara.bank_matches column this file adds exists yet.
  -- [SPLIT D-b3 2026-08-04] NARROWED TO THIS SLICE'S OWN TWO. The whole-unit probe 3 lists three columns;
  -- clara.journal_entries.auto_reversal_of shipped in D-b0 (SS1.10, census sect.4 Option A) and
  -- is deliberately NOT re-probed here -- it EXISTS now, so the whole-unit predicate would refuse
  -- this migration on a correctly-ordered database. That is the exact shape of error a
  -- copied-unchanged probe produces, and it is why every negative probe in a split has to be cut
  -- to the objects its OWN slice creates.
  -- FINAL FORM: the whole-unit probe 3, reassembled across D-b0 (auto_reversal_of) and here.
  select count(*)::int, string_agg(column_name, ', ' order by column_name) into v_n, v_names
  from information_schema.columns
  where table_schema = 'clara' and table_name = 'bank_matches'
    and column_name in ('pending_resolution', 'resolution_exception_id');
  if v_n <> 0 then
    raise exception '0042 D-b3 probe 3: clara.bank_matches already carries % of the 2 SS4 column(s) (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_n, v_names;
  end if;

  -- [SPLIT D-b3 2026-08-04] PROBE 4 HAS NO D-b3 FORM, AND THE REASON IS MEASURED RATHER THAN ASSUMED.
  -- The whole-unit probe 4 names four indexes and NOT ONE of them is this slice's (two are D-b2's
  -- hot-loop partials, one is D-b0's pair-linkage unique -- already shipped -- and one is D-b2's
  -- pair-correction lookup). Census sect.8's D-b3 bullet asks for "the two s4 indexes"; MEASURED
  -- on the canonical section, that direction cannot be honoured as written and the reason is
  -- worth stating once so nobody re-opens it:
  --   * uq_je_bank_rule_suggested_line (s4 L3994) is created with a PLAIN `create unique index`,
  --     so a duplicate re-apply fails at the CREATE with Postgres's own duplicate-relation error
  --     -- and, long before that, at SECTION S4's own S4.0(a) prestate, which refuses the apply
  --     by name if ANY of eleven SS4 function names already exists. That block is this slice's
  --     real re-apply gate and it is far more specific than an index probe.
  --   * ix_ble_line (s4 L2204) is created with `create index IF NOT EXISTS` -- the canonical
  --     author's deliberate choice for an index on a 0038 table. A negative pre-state probe on it
  --     would REFUSE the migration on any database where a DBA had already added that index by
  --     hand, which is precisely the situation `if not exists` exists to tolerate. Adding such a
  --     probe would not strengthen the slice; it would make a correct deploy fail.
  -- Recorded as errata E13. FINAL FORM: the whole-unit probe 4, reassembled across D-b0 and D-b2.

  -- PROBE 5 -- PRE-STATE SAFETY: the event name this file registers is not registered yet.
  -- [SPLIT D-b3 2026-08-04] NARROWED TO THIS SLICE'S ONE NAME. adjustment.posted is D-b2's and is probed
  -- by D-b2 beside its own half of SECTION EVENTS (census sect.4: "the CTE + local postcheck
  -- duplicate cleanly").
  -- FINAL FORM: the whole-unit probe 5, reassembled across D-b2 and here.
  select count(*)::int, string_agg(name, ', ' order by name) into v_n, v_names
    from clara.event_types where name = 'bank.line_exception_reopened';
  if v_n <> 0 then
    raise exception '0042 D-b3 probe 5: event type(s) already registered that this migration adds (%) -- partial or duplicate re-apply', v_names;
  end if;

  -- [SPLIT D-b3 2026-08-04] PROBE 6 HAS NO D-b3 FORM, for the reason D-b0 and D-b1 both recorded and one
  -- of this slice's own. Its list is the WHOLE unit's set of 56 names. A slice-local copy would
  -- enumerate this slice's SIXTEEN new bodies (SECTION S1's one trigger function, SECTION S2's
  -- two suggestion bodies and SECTION S4's thirteen -- MEASURED on the rig as the pg_proc delta
  -- across this file's apply, not counted off census sect.1g, which says "s4 | D-b3 | 13" but
  -- files clara._wdb_suggestion_rule_hit / clara._wdb_suggestion_lines inside D-b2's 42 because
  -- that is the section they were AUTHORED in, while sect.2 Class A correctly moves them here;
  -- errata E15), and every one of them is created with `create function`, never `create or replace`,
  -- so a duplicate re-apply fails at the CREATE with Postgres's own duplicate-function error --
  -- and, before that, at SECTION S4's S4.0(a) prestate, which names eleven of them explicitly.
  -- THE FIVE BODIES THIS FILE WRITES WITH `create or replace` (clara.allocate_receipt,
  -- clara.allocate_payment, BOTH clara.settle_from_bank_line overloads and
  -- clara._tf_bank_line_exception_transition) are deliberately OUT of any such list for exactly
  -- the reason the whole-unit probe 6 excludes them: they are the bodies 0042 RECUTS rather than
  -- creates, they MUST already exist, and probe 7 below asserts exactly that.
  -- RECORDED, NOT REPAIRED (carried forward from D-b0's finding, census errata E4): the
  -- whole-unit probe 6 documents itself as "the COMPLETE as-built set of names this file CREATES"
  -- and clara._assert_due_read_ctx is missing from it. That is a whole-unit debt, and a slice must
  -- not repair a list it does not ship; the fix belongs to D-b2's final form.
  -- FINAL FORM: the whole-unit 56-name probe 6, reassembled across the four slices.

  -- PROBE 7 -- ANCHOR: every live body SECTION S4 splices, factors or calls is present at its
  -- EXACT signature. A missing one here is a far better error than a regprocedure cast failing
  -- mid-splice.
  -- [SPLIT D-b3 2026-08-04] NARROWED TO THIS SLICE'S OWN SUBJECTS, AND WIDENED BY THE FIVE ANCHORS THE
  -- SPLIT ITSELF CREATED.
  --   NARROWED: clara._subledger_on_approve, clara._fa_on_approve and clara.reverse_entry are the
  --   HOOK/WALL subjects of D-b0/D-b1/D-b2 -- census hazard sect.7.3 read backwards: the four
  --   bank bodies are S4-owned and no other slice may splice them, and by the same law THIS slice
  --   may not splice, and does not name, the hook. clara.revise_entry, clara.withdraw_draft and
  --   clara._hash's template use are D-b2's (S5.10/S5.10a/S5.11). clara.set_client_fy_end,
  --   clara._fa_assert_code_unreserved, clara._fa_asset_json, clara._draft_opening_item_core,
  --   clara.dispose_fixed_asset, clara.revise_fixed_asset_particulars and
  --   clara.approve_opening_correction were D-b0's subjects. A slice must not claim an anchor it
  --   never uses.
  --   NOTE the two OVERLOAD PAIRS, kept as PAIRS (assembly adjudication 2 of the whole-unit
  --   header, and census sect.8's D-b3 bullet names them by hand): clara.settle_from_bank_line
  --   exists at a 12- and a 13-argument signature and SECTION S4 re-creates BOTH as wrappers over
  --   ONE core, so a single-signature probe would green a build that left an overload
  --   un-factored. clara.match_bank_line's pair is pinned for the same reason it was pinned in the
  --   unit -- the composite calls the 6-argument form on its hand-draft leg, and the pair is
  --   pinned as a pair rather than trimmed, because trimming a canonical anchor whose subject IS
  --   in this slice's call graph would be a narrowing nothing asked for.
  --   WIDENED, and this is a DEVIATION FROM THE CANONICAL ARRAY, named rather than smuggled: the
  --   five entries marked [SPLIT-CREATED] below are dependencies the SPLIT invented and the whole
  --   unit could not have carried, because in one file these bodies were created a few thousand
  --   lines above their use. The precedent is errata E9 (D-b1's probe 7 was widened by four such
  --   anchors); the difference here is that this slice COMPLETES no shell, so every one of the
  --   five is a CALL dependency rather than a `create or replace` target -- and a missing one
  --   would not be caught by any create-time error, because plpgsql resolves a call at EXECUTION.
  --   Without this probe the failure surfaces months later, inside somebody's booking.
  --   RECORDED, NOT REPAIRED (D-b0's finding E3, carried and extended): the census's phrase "the
  --   25 S5 target-signature probes (7)" is imprecise -- the whole-unit array holds 27 entries and
  --   does NOT enumerate every splice subject. clara.get_bank_reconciliation(uuid) is one such
  --   omission and it falls in THIS slice (S4.12b splices it); it is not added here, because
  --   S4.12b carries its own prestate naming the body it splices, and adding a probe this slice's
  --   source never carried would be invention. Errata E14.
  -- FINAL FORM: the whole-unit 27-entry array, reassembled across the four slices.
  foreach v_names in array array[
      'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
      'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
      'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)',
      'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)',
      'clara.complete_pending_match(uuid,uuid,text)',
      'clara.unmatch_bank_match(uuid,uuid,text,text)',
      'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
      'clara._tf_bank_settled_authority_belt()',
      'clara._tf_bank_line_exception_transition()',
      'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
      'clara._reserve_op(uuid,text,text,bytea)',
      'clara._finish_op(uuid,text,text,jsonb)',
      'clara._hash(jsonb)',
      -- [SPLIT-CREATED] the ONE D-b0 body SECTION S4's producer calls (its account-role door)
      'clara._adj_line_eligibility_breach(uuid,jsonb)',
      -- [SPLIT-CREATED] the FOUR D-b1 bodies SECTION S4's booking-block predicate and hand-draft
      -- leg call. Each is a plpgsql call resolved at EXECUTION, so nothing at CREATE time would
      -- notice their absence.
      'clara._wdb_reversal_blocked(uuid)',
      'clara._adv_reversal_admission(uuid,text,uuid,date,timestamptz,uuid)',
      'clara._adv_release_one_way(uuid)',
      'clara._adv_assert_proposal(uuid)'] loop
    if to_regprocedure(v_names) is null then
      raise exception '0042 D-b3 probe 7: % is not present at that exact signature -- SECTION S4 cannot splice, factor or call it', v_names;
    end if;
  end loop;

  -- PROBE 8 -- ANCHOR: exactly one ACTIVE taxonomy version exists and the new row will attach to
  -- it (the 0041:978-996 CTE cross-joins clara.taxonomy_active).
  -- [SPLIT D-b3 2026-08-04] KEPT WHOLE AND IT IS THIS SLICE'S OWN CLAIM, not an inherited floor: SECTION
  -- EVENTS below registers bank.line_exception_reopened by cross-joining clara.taxonomy_active,
  -- so a second active version would silently write a second taxonomy row and tail 14's exact
  -- count would then be the first thing to notice. D-b0 and D-b1 kept this probe as an anchor
  -- while registering nothing; here it is load-bearing.
  select count(*)::int into v_n from clara.taxonomy_active;
  if v_n <> 1 then
    raise exception '0042 probe 8: clara.taxonomy_active must hold exactly one row (found %)', v_n;
  end if;
  select version into v_ver from clara.taxonomy_active;
  if v_ver is null then
    raise exception '0042 probe 8b: clara.taxonomy_active carries no version';
  end if;

  -- [SPLIT D-b3 2026-08-04] PROBES 9, 10, 11 AND 12 ARE NOT IN THIS SLICE, EACH RECORDED RATHER THAN
  -- SILENTLY DROPPED.
  --   * 9 (the clara.clients / clara.coa_accounts tenancy anchors) -- they anchor the COMPOSITE
  --     (client_id, firm_id) FKs of the seven new relations, and this slice creates none. The one
  --     FK it adds (SS1.8's resolution_exception_id -> clara.bank_line_exceptions(id)) is a PLAIN
  --     single-column reference, and SS1.0's probe 7 below anchors exactly that primary key
  --     instead -- the right anchor for the FK this slice actually writes.
  --   * 10 and 11 (the four-caller census of clara._subledger_on_approve and its
  --     clara._fa_on_approve splice marker) -- both exist to make a HOOK SPLICE's claim a delta
  --     rather than a guess. This slice splices no hook: the advance line is D-b1's (shipped) and
  --     the adjustment line is D-b2's. Census hazard sect.7.3 read backwards -- and errata E8's
  --     inverse -- says this body is not this slice's to touch, so this slice makes no
  --     measurement about it either. Tail 1, which is where that claim lives, is likewise not in
  --     this slice's tail set (census sect.5: tail 1 is D-b0+1+2, final form in D-b2).
  --   * 12 (the clara.fixed_assets NULL cost_cents prestate) -- D-b0's, and already SPENT: D-b0
  --     set that column NOT NULL, so the same query is now trivially zero and would be a probe
  --     that cannot fail. Its post-state is D-b0's tail 16.
  -- FINAL FORM: the whole-unit 13-probe block, reassembled across the four slices.

  -- PROBE 13 -- ANCHOR: clara.bank_line_exceptions carries the FIVE resolution columns the
  -- SS4 reopen arm NULLs, under their LIVE names, plus status (the transition trigger's
  -- comparison set is those five + status). The live names are resolution_disposition /
  -- resolution_note / counterpart_line_id -- NOT the design prose's shorthand
  -- "disposition"/"note" -- which is exactly the drift this probe exists to catch.
  select count(*)::int, string_agg(column_name, ', ' order by column_name) into v_n, v_names
  from information_schema.columns
  where table_schema = 'clara' and table_name = 'bank_line_exceptions'
    and column_name in ('status', 'resolved_at', 'resolved_by',
                        'resolution_disposition', 'resolution_note', 'counterpart_line_id');
  if v_n <> 6 then
    raise exception '0042 probe 13: clara.bank_line_exceptions must carry status + the 5 resolution columns the SS4 reopen arm clears (resolved_by, resolved_at, resolution_disposition, resolution_note, counterpart_line_id); found % (%) -- re-derive the reopen against the live catalog', v_n, v_names;
  end if;

  raise notice '0042 D-b3 SECTION 0 probe OK (0/6): 0043_wave_d_b1_staff_advances is the applied frontier; neither clara.bank_matches park column and no bank.line_exception_reopened event type pre-exists; the twenty splice/factor/call subjects this slice touches (including BOTH settle and match overloads and the five the split itself created), the taxonomy singleton and the clara.bank_line_exceptions resolution columns the SS4 reopen arm clears are all present in their expected shape.';
end
$probe$;

-- #####################################################################################
-- ###### SECTION S1 (D-b3 SLICE) -- DDL: SS1.8, THE clara.bank_matches PARK COLUMNS ###
-- #####################################################################################
-- [SPLIT D-b3 2026-08-04] THIS SLICE CARRIES ONE OF SECTION S1's ELEVEN DDL BLOCKS, at its existing
-- SS1.x boundary (census sect.4: "split s1 at its existing SS1.x boundaries -- already clean"),
-- plus the bank.line_exception_reopened HALF of SECTION EVENTS:
--   SS1.1-SS1.3 (adjustment_templates / adjustment_runs / adjustment_pair_reversals
--                and their triggers, policies and grants)      -> D-b2
--   SS1.4-SS1.6 (staff_advance_accounts / staff_advances /
--                staff_advance_applications)                   -> ALREADY SHIPPED, D-b1
--   SS1.7       (ea1955_policy + its three-row EA 1955 seed)    -> ALREADY SHIPPED, D-b1
--   SS1.8       (the clara.bank_matches ALTERs + the set-once trigger) -> HERE
--   SS1.9       (ix_je_adj_draft, ix_je_adj_occurrence)         -> D-b2
--   SS1.10      (auto_reversal_of + uq_je_auto_reversal_of)     -> ALREADY SHIPPED, D-b0
--   SS1.11      (ix_adj_pair_corrections)                       -> D-b2
--   SECTION EVENTS -- SPLIT BY NAME: adjustment.posted -> D-b2, bank.line_exception_reopened
--                -> HERE. Census sect.4: "the CTE + local postcheck duplicate cleanly".
--
-- THE TWO SS4 INDEXES ARE NOT HERE AND THAT IS THE CANONICAL SHAPE, not an omission of this
-- split: ix_ble_line and uq_je_bank_rule_suggested_line are created inside SECTION S4 itself
-- (s4 L2204 and L3994), beside the bodies that need them, and census sect.1c records exactly
-- that ("D-b3 = 2: ix_ble_line, uq_je_bank_rule_suggested_line -- both created in s4, not s1").
--
-- WHAT THIS SLICE ADDS TO THE SCHEMA IS TWO COLUMNS ON A LIVE, POPULATED TABLE. clara.bank_matches
-- carries real reconciliation history (census sect.6 measured 74 live match rows on the deploy
-- target), so both ALTERs are of the only shape that is safe against one: a NULLABLE column with
-- no default and no rewrite, a CHECK that is trivially satisfied by every existing row
-- (pending_resolution is null on all of them), and an FK that constrains only future non-null
-- values. The trigger is ADDITIVE and NARROW by design (see SS1.8's own header, kept verbatim).
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4): the probe runs as the plain migration
-- role, the ALTERs and the trigger inside an explicit `set role clara_fn_owner` scope this file
-- opens and closes, and SECTION EVENTS then runs as the PLAIN MIGRATION ROLE -- the same
-- 0038:8413-8423 / 0040:2769-2776 / 0041:963-968 precedent the canonical section states, kept
-- rather than flattened.

-- #####################################################################################
-- ################## SS1.0 (D-b3 SLICE) -- THE PRE-DDL LIVE PROBES ####################
-- #####################################################################################
-- [SPLIT D-b3 2026-08-04] TWO OF SS1.0's EIGHT PROBES ARE THIS SLICE'S: the two POSITIVE ANCHORS that
-- SS1.8's own CHECK and FK are derived from. Its probes 1 (frontier), 3 (the two bank_matches
-- columns) and 5 (the event name) are made by SECTION 0 above -- a slice with one DDL block has
-- no reason to ask the same negative question twice, and D-b1 set that precedent. Its probes 2
-- (the seven relations), 4 (the two hot-loop partials) and 8 (the generic guard functions the
-- seven new tables' triggers reuse) are about objects this slice does not create.
-- FINAL FORM: the whole-unit SS1.0 block, reassembled across the four slices.

do $s1_probe$
declare
  v_anchor int;
begin
  -- PROBE 6 -- ANCHOR PROBE, positive: clara.bank_matches' live status CHECK admits
  -- 'pending' (0038:610). The new pending_resolution CHECK below (`pending_resolution IS
  -- NULL OR status = 'pending'`) is meaningless if 0038 did not land the vocabulary this
  -- section assumes -- checked against the CATALOG definition, never guessed from prose.
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_matches' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%' and pg_get_constraintdef(c.oid) ilike '%pending%';
  if v_anchor < 1 then
    raise exception '0042 SS1 probe 6: clara.bank_matches carries no CHECK admitting status=''pending'' -- 0038 did not land in the shape this section assumes';
  end if;

  -- PROBE 7 -- ANCHOR PROBE, positive: clara.bank_line_exceptions' primary key is exactly
  -- (id) (0040:425 -- no composite anchor), targeted by this section's
  -- resolution_exception_id FK (ABI SSD tail block: `REFERENCES clara.bank_line_exceptions
  -- (id)`, a plain id reference, matching the same simple-FK shape 0041:326 uses for
  -- journal_lines because that table, too, carries no (id, firm_id, client_id) anchor).
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_line_exceptions' and c.contype = 'p'
    and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)';
  if v_anchor <> 1 then
    raise exception '0042 SS1 probe 7: clara.bank_line_exceptions'' primary key is not exactly (id) -- the resolution_exception_id FK this section adds needs re-deriving';
  end if;

  raise notice '0042 D-b3 SS1 probe OK (0/2): clara.bank_matches carries a CHECK admitting status=''pending'' (the vocabulary SS1.8''s new CHECK is written against) and clara.bank_line_exceptions'' primary key is exactly (id) (the target of SS1.8''s resolution_exception_id FK). (Both new columns and the new event name were probed absent in SECTION 0 probes 3 and 5 above.)';
end
$s1_probe$;

set role clara_fn_owner;

-- =====================================================================================
-- SS1.8 -- clara.bank_matches ALTER (design SS4; ABI SSD tail block; WDB-G9). The AF-2
-- high-stakes PARK: a pending group carries its declared (but not yet booked) resolution
-- disposition, and the group's booking eventually names the exception it discharges.
--
-- resolution_exception_id IS NEVER CLEARED ONCE SET (design SS4: "which the cancel LEAVES
-- INTACT"; the post-flip unmatch reopen flips bank_line_exceptions.status back to 'open',
-- a DIFFERENT table's own transition trigger -- out of this DDL section's scope, a live-
-- body splice for another lane) -- so the guard below is a plain immutable-once-non-null
-- rule, no exceptions, ever.
-- =====================================================================================
alter table clara.bank_matches add column pending_resolution jsonb;
alter table clara.bank_matches add constraint ck_bank_matches_pending_resolution
  check (pending_resolution is null or status = 'pending');
alter table clara.bank_matches add column resolution_exception_id uuid;
alter table clara.bank_matches add constraint fk_bank_matches_resolution_exception
  foreign key (resolution_exception_id) references clara.bank_line_exceptions(id);

-- ADDITIVE (design SS4: "the table has no update guard today"). Raises ONLY when OLD is
-- non-null and NEW differs from OLD -- null->value (first stamp) and value->same-value
-- (an idempotent re-affirming UPDATE that happens to touch this column) both pass.
create function clara._tf_bank_matches_resolution_exception_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.resolution_exception_id is not null
     and new.resolution_exception_id is distinct from old.resolution_exception_id then
    raise exception 'a bank match''s resolution_exception_id is set once, never revised'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'resolution_exception_immutable', 'match_id', old.id)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_bank_matches_resolution_exception_immutable() from public;
create trigger t_bank_matches_resolution_exception_immutable before update on clara.bank_matches
  for each row execute function clara._tf_bank_matches_resolution_exception_immutable();

reset role;

-- #####################################################################################
-- ####### SECTION EVENTS (D-b3 SLICE) -- bank.line_exception_reopened #################
-- #####################################################################################
-- [SPLIT D-b3 2026-08-04] THE bank.line_exception_reopened HALF. The canonical block registers TWO
-- names in one CTE; census sect.4 adjudicates the split ("the CTE + local postcheck duplicate
-- cleanly") and this file carries the AF-2 name only -- adjustment.posted is the occurrence
-- poster's fact and ships with the poster, in D-b2. The CTE's SHAPE is unchanged (the same
-- values/insert/insert-select/cross-join clara.taxonomy_active chain, the 0041:978-996 idiom);
-- what is narrowed is its VALUES list, and with it the postcheck's three counts, from 2 to 1.
-- A copied-unchanged block would insert a name whose emitter does not exist in this slice at
-- all, and tail 14's "exactly one emitter" arm would then fail by name -- correctly, and in the
-- wrong slice.
-- FINAL FORM: the whole-unit SECTION EVENTS block, reassembled across D-b2 and here.
-- ROLE NOTE (0038:8413-8423 / 0040:2769-2776 / 0041:963-968 precedent): clara.event_types
-- and clara.trigger_taxonomy are migration-owned; this section runs as the PLAIN MIGRATION
-- ROLE, between SS1's clara_fn_owner close (above) and whatever later section next needs
-- `set role clara_fn_owner` re-opened for its own DDL/splices.
--
-- TWO NAMES (contrast 0040/0041's larger batches): adjustment.posted is the one new
-- occurrence-poster fact (design SS2.5; ABI SSG) and bank.line_exception_reopened is the
-- AF-2 post-flip-unmatch fact (design SS4). Both CLIENT-SCOPED, both decision 'ignore' --
-- /rules and /bank read the underlying tables directly, the same 0040/0041 bank/asset-kind
-- reasoning restated. Payloads carry IDENTIFIERS + the receipt's already-public totals ONLY
-- (ABI SSG); the payload-key allowlist scan against these two names is a SECTION TAIL
-- deliverable, not this section's.

with added(name, client_scoped, description, decision, note) as (values
  ('bank.line_exception_reopened', true,
    'A resolved bank line exception was reopened by a post-flip unmatch release',
    'ignore', null::text)
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- LOCAL POSTCHECK (the 0040 SS3-probe-6 style, reproduced downstream of the write instead
-- of upstream of it, since THIS section is the registrar rather than a later consumer of
-- someone else's prior registration). Confirms only that THIS section's own INSERT landed
-- in the shape it claims -- both names in event_types, exactly one active-taxonomy row
-- apiece, decision 'ignore'. SECTION TAIL re-asserts this against the WHOLE migration's
-- emission sites (the poster + the reopen arm, sections this lane cannot see); this probe
-- is narrower on purpose.
-- [SPLIT D-b3 2026-08-04] NARROWED WITH THE CTE ABOVE: one name, so all three counts drop from 2
-- to 1. The comment above says "both names ... exactly one active-taxonomy row apiece", which is
-- the WHOLE UNIT's claim; this slice registers one of the two and says so rather than leaving a
-- count that quietly passes for the wrong reason.
do $s1_events_check$
declare v_types int; v_rows int; v_bad int;
begin
  select count(*)::int into v_types from clara.event_types
    where name = 'bank.line_exception_reopened';
  if v_types <> 1 then
    raise exception '0042 SS1 events postcheck (D-b3 slice): the new event type did not land in clara.event_types'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_rows from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
    where tt.event_type = 'bank.line_exception_reopened';
  if v_rows <> 1 then
    raise exception '0042 SS1 events postcheck (D-b3 slice): expected exactly 1 active trigger_taxonomy row for the new event type, found %', v_rows
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_bad from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
    where tt.event_type = 'bank.line_exception_reopened'
      and tt.decision <> 'ignore';
  if v_bad <> 0 then
    raise exception '0042 SS1 events postcheck (D-b3 slice): the new event type landed with a decision other than ''ignore'''
      using errcode = 'CLR10';
  end if;
  raise notice '0042 SS1 events OK (D-b3 slice): bank.line_exception_reopened registered in event_types and active-taxonomy at decision ''ignore''; adjustment.posted is D-b2''s half of this block.';
end
$s1_events_check$;

-- SS1 END. Role is the plain migration role on exit (matching 0041's own exit posture at
-- its SECTION EVENTS boundary) -- the next section, if it needs clara_fn_owner, opens its
-- own `set role clara_fn_owner;` scope, exactly the 0041 SS1/SS2 precedent.

-- #####################################################################################
-- ##### SECTION S2 (D-b3 SLICE) -- THE SUGGESTION DERIVATION, ITS REAL FAMILY #########
-- #####################################################################################
-- [SPLIT D-b3 2026-08-04] ONE FRAGMENT OF THE ADJUSTMENT SECTION LANDS HERE, and it is a pure
-- MISFILING repair (census sect.2 Class A -- "callee has zero later-slice dependency, move it to
-- its real family; zero-risk"):
--   * clara._wdb_suggestion_rule_hit  (s2 L3425-3448) -- the (line, rule) predicate
--   * clara._wdb_suggestion_lines     (s2 L3450-3482) -- the derived two-leg coding
-- BOTH read ONLY clara.bank_statement_lines, clara.bank_rules and clara.bank_accounts, and call
-- only clara._bank_desc_word_match (0040). Census sect.1g files them among SECTION S2's 42 new
-- bodies because that is the section they were AUTHORED in; sect.2 measures that they carry "no
-- adjustment dependency at all" and sect.8's D-b3 map assigns them here, to the family whose
-- verb is their first reader. They are BANK bodies that happened to be written in the adjustment
-- lane.
--
-- THEY MUST PRECEDE SECTION S4, AND SECTION S4 SAYS SO ITSELF. S4.0's prestate asserts that
-- clara._wdb_suggestion_rule_hit, clara._wdb_suggestion_lines and clara._adj_line_eligibility_
-- breach are ALL present and calls a missing one "a section-ORDER error (S2 must run before S4),
-- not a drift". Two of that trio are created below; the third is D-b0's (census sect.2 Class A
-- moved it there alongside the reservation union). So the canonical S4.0 block applies to this
-- slice UNCHANGED -- which is the whole reason SECTION S4 can move whole.
--
-- WHY THE PRODUCER AND THE APPROVE HOOK MUST SHARE THEM, restated because the split is exactly
-- where a shared authority gets duplicated by accident: clara.accept_bank_rule_suggestion (this
-- slice's SECTION S4) derives a draft's legs from these two bodies, and D-b2's
-- clara._adj_on_approve arm (3) RE-DERIVES from the SAME two at approve time -- that is what
-- makes "the checker approves what the rule says TODAY" a fact rather than a hope. Two
-- independent derivations would only ever prove that two pieces of code agree with themselves.
-- D-b2 must therefore NOT create a second copy: it arrives after this slice and finds them here.
-- THIS IS THE FINAL FORM; D-b2 does not touch either body.
--
-- WHAT STAYS IN D-b2: the other 35 s2 bodies. WHAT WENT TO D-b0: clara._assert_due_read_ctx,
-- clara._wdb_period_stamps, clara._wdb_correction_posting_date, clara._wdb_iso_date_supported,
-- clara._adj_line_eligibility_breach and clara._wdb_rerun_breach (FA-arm form). WHAT WENT TO
-- D-b1: clara._acct_role_reserved (completed with its advance arms) and
-- clara._wdb_reversal_blocked.
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4). In the whole unit s2 opened
-- `set role clara_fn_owner` at its L39 and NEVER reset -- s3 then relied on that role for its
-- first 2,650 lines, and s4 ran its S4.0 prestate under whatever s3 left behind. This slice opens
-- its own scope and closes it at the end of the file; SECTION S4 below opens its own (it is the
-- one canonical section that always did), so nothing inherits a role by accident.

set role clara_fn_owner;

-- -------------------------------------------------------------------------------------
-- THE SUGGESTION DERIVATION, AS ONE BODY (design SS5). Both the producer verb
-- (clara.accept_bank_rule_suggestion, SECTION S4) and clara._adj_on_approve's arm (3) below
-- MUST derive from these two functions: the point of the approve-time re-validation is that
-- the checker approves what the rule says TODAY, and two independent derivations would only
-- ever prove that two pieces of code agree with themselves.
-- -------------------------------------------------------------------------------------

-- THE PREDICATE, cloned from clara.list_bank_line_suggestions (0040:4673-4681) -- tokens by
-- word boundary over the description, direction against the line's sign, and the optional
-- amount shape. Scoped to ONE (line, rule) pair; "most specific wins" is the LIST's ranking
-- job, not this one's.
create function clara._wdb_suggestion_rule_hit(p_line uuid, p_rule uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1
    from clara.bank_statement_lines l
    join clara.bank_rules r on r.id = p_rule
    where l.id = p_line
      and r.client_id = l.client_id
      and clara._bank_desc_word_match(l.description,
            (select array_agg(x) from jsonb_array_elements_text(r.pattern -> 'tokens') x))
      and (r.pattern ->> 'direction' = 'either'
           or (r.pattern ->> 'direction' = 'credit' and l.amount_cents > 0)
           or (r.pattern ->> 'direction' = 'debit' and l.amount_cents < 0))
      and (r.pattern -> 'amount_shape' is null
           or (abs(l.amount_cents)
                 >= coalesce((r.pattern -> 'amount_shape' ->> 'min_cents')::bigint, 0)
               and abs(l.amount_cents)
                 <= coalesce((r.pattern -> 'amount_shape' ->> 'max_cents')::bigint,
                             9223372036854775807)))) $$;
revoke all on function clara._wdb_suggestion_rule_hit(uuid, uuid) from public;

-- THE DERIVED TWO-LEG CODING, canonical and ordered DEBIT LEG FIRST (the same ordering
-- convention the D-a poster uses for its expense/accumulated pair), so byte-equality against
-- a stored draft is a total order rather than a set comparison.
--   money IN  (amount_cents > 0): Dr the client's bank GL account / Cr the rule's account
--   money OUT (amount_cents < 0): Dr the rule's account            / Cr the bank GL account
-- The bank GL code comes from clara.bank_accounts.coa_account_code -- the binding itself,
-- never a guess -- and the magnitude is the line's own, to the sen. Returns NULL when the
-- line or the rule cannot be resolved, which every caller treats as a refusal.
create function clara._wdb_suggestion_lines(p_client uuid, p_line uuid, p_rule uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare ln record; v_bank text; v_acct text; v_amt bigint;
begin
  select l.amount_cents, l.bank_account_id, l.client_id into ln
    from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client then return null; end if;
  select ba.coa_account_code into v_bank from clara.bank_accounts ba
    where ba.id = ln.bank_account_id;
  if v_bank is null then return null; end if;
  select nullif(btrim(coalesce(r.proposal ->> 'account_code', '')), '') into v_acct
    from clara.bank_rules r where r.id = p_rule and r.client_id = p_client;
  if v_acct is null then return null; end if;
  v_amt := abs(ln.amount_cents);
  if ln.amount_cents > 0 then
    return jsonb_build_array(
      jsonb_build_object('account_code', v_bank, 'debit_cents', v_amt, 'credit_cents', 0::bigint),
      jsonb_build_object('account_code', v_acct, 'debit_cents', 0::bigint, 'credit_cents', v_amt));
  end if;
  return jsonb_build_array(
    jsonb_build_object('account_code', v_acct, 'debit_cents', v_amt, 'credit_cents', 0::bigint),
    jsonb_build_object('account_code', v_bank, 'debit_cents', 0::bigint, 'credit_cents', v_amt));
end $$;
revoke all on function clara._wdb_suggestion_lines(uuid, uuid, uuid) from public;

reset role;

-- #####################################################################################
-- ###### SECTION S4 (D-b3 SLICE) -- MOVED WHOLE, NOT ONE LINE EDITED ##################
-- #####################################################################################
-- [SPLIT D-b3 2026-08-04] EVERYTHING BELOW THIS BANNER IS THE CANONICAL SECTION S4, BYTE-EXACT
-- (0042-sections/s4-af2.sql, all 4,436 lines, comments included). This banner is the ONLY text
-- the split adds to it. Census sect.8: "s3 and s4 move as whole files -- the two cleanest slices,
-- which is what the r11 ruling (advances, AF-2/bank and FA families are DRY) predicted and this
-- census confirms." That prediction was MEASURED against the live rig before it was believed, and
-- four separate things had to be true for it to hold:
--
--   1. S4.0's PRESTATE CENSUS STILL PASSES AFTER D-b0 AND D-b1. Its 35 live-body marker counts
--      across eight subjects were measured on a database migrated 0001..0041; this slice applies
--      to one that has since had D-b0 and D-b1 on top. Re-measured on THIS slice's rig with both
--      predecessors applied: 35 of 35 markers at their canonical counts, 0 drift. That is census
--      hazard sect.7.3 confirmed from the other end -- "D-b0 must not splice
--      clara._tf_bank_settled_authority_belt, clara.complete_pending_match,
--      clara.get_bank_reconciliation or clara.unmatch_bank_match" -- and D-b1's own report
--      recorded ZERO references of any kind to those four. Neither slice touched them, so the
--      chain-of-recut prestates this section makes against the LIVE catalog are the same
--      prestates the whole unit made.
--   2. S4.0's ANCHOR TRIO IS SATISFIED BY THE SLICE ORDER. It requires
--      clara._wdb_suggestion_rule_hit, clara._wdb_suggestion_lines and
--      clara._adj_line_eligibility_breach to exist and calls a missing one "a section-ORDER
--      error". SECTION S2 of THIS file creates the first two; D-b0 created the third. Count on
--      the rig before this section runs: 3 of 3.
--   3. S4.0(c) REQUIRES THE clara.bank_matches ALTER. SECTION S1 of this file makes it, above.
--   4. THIS SECTION NAMES NO D-b2 OBJECT IN EXECUTABLE CODE. Measured: zero references to
--      clara.adjustment_templates, clara.adjustment_runs or clara.adjustment_pair_reversals
--      anywhere in the section, and every one of its six mentions of clara._adj_on_approve is
--      inside a COMMENT explaining that arm (3) re-derives through SECTION S2's shared bodies.
--      Its five cross-slice CALLS are clara._adj_line_eligibility_breach (D-b0) and
--      clara._wdb_reversal_blocked / clara._adv_reversal_admission / clara._adv_release_one_way /
--      clara._adv_assert_proposal (D-b1) -- all four D-b1 names being census sect.2's "legal under
--      the order" list, which is why D-b1-before-D-b3 is load-bearing and why SECTION 0's probe 7
--      pins all five as [SPLIT-CREATED] anchors.
--
-- ROLE SCOPING NEEDS NO ADDITION HERE, AND THAT IS MEASURED TOO (census hazard sect.7.4). This is
-- the one canonical section that already opens AND closes its own scope: `set role
-- clara_fn_owner` at its L252 (after the S4.0 prestate, which reads the catalog as the plain
-- migration role) and `reset role` at its L4370 (before S4.6C's late half and the landing
-- notice, both of which are catalog reads). One open, one close, balanced -- so the assembler's
-- per-file balance assertion passes on an untouched file, and this slice adds no role statement
-- to it. In the whole unit that balance was invisible because SECTION S3 had left the role
-- closed before it; here it is the file's own property and is asserted as such.
--
-- THE FOUR LIVE-BODY SPLICES AND THE SEVEN-SITE PARKED ADMISSION are therefore exactly the
-- canonical ones, harvested through pg_get_functiondef at APPLY time against whatever catalog
-- this file lands on -- never against 0041's file text (the 0036:381-395 chain-of-recut law).
-- Their prestates were re-harvested on this slice's rig AFTER D-b0 and D-b1 applied, and they
-- match; the splices themselves read the catalog again when they run, so they cannot go stale
-- between now and the deploy.
--
-- FINAL FORM: this IS the final form. No later slice re-splices any body this section writes.
--
-- ONE EXCEPTION, ADDED BY THE CONFIRMING ROUND'S FIX WAVE AND MARKED AT ITS OWN SITE: S4.13's
-- ACL block (canonical s4 L4342-4350) is the ONE place this section is not byte-exact. The
-- producer's `grant execute ... to clara_authenticated` is WITHHELD here and ships with D-b2
-- (0045). Nothing else in these 4,436 lines moves: no body, no index, no splice, no prestate --
-- the diff of this file against 0042-sections/s4-af2.sql is exactly that one grant plus the
-- note that explains it. See the [SPLIT D-b3] block at S4.13 for the measured mechanism.

-- #####################################################################################
-- ############ SECTION S4 -- THE AF-2 COMPOSITE + THE bank_rule_suggested PRODUCER ####
-- #####################################################################################
-- Design of record: wave-d-b-design.md SS4 (the composite) + SS5 (the producer), ABI SSA
-- (signatures), SSE (the single-owner op-key matrix), SSF (the refusal tokens), SSG (event
-- payloads). Contract: WD-R13 (both items ride D-b/0042). Ruling of record for the boundary:
-- [WDB-G16] -- the AF-2 recuts are WD-R13-authorized; [WDB-G9] -- the high-stakes branch is
-- the settlement leg ONLY and the declared resolution rides the group.
--
-- WHAT THIS SECTION IS. Wave C shipped a bank-line EXCEPTION door whose two BOOKING
-- dispositions were structurally unreachable: an OPEN-excepted line cannot be matched
-- (`line_excepted`), and a resolution that names `matched_booking` or
-- `written_off_adjustment` without a live match refuses at commit (`disposition_unbooked`,
-- the deferred authority belt). The only lawful order is resolve-and-book INSIDE ONE
-- TRANSACTION -- which no verb offered. clara.resolve_and_book_bank_line is that verb, and
-- it doubles as the bank-side producer of staff-advance applications (WD-R10 / SS3.3).
--
-- THE SHAPE OF THE SECTION (order is load-bearing -- each block's subject must exist before
-- the next block names it):
--   S4.0   prestate: the idempotency probe + the LIVE-BODY marker census for every function
--          this section factors or splices, at counts MEASURED against the harvested
--          pg_get_functiondef bodies (the chain-of-recut law -- never file text).
--   S4.1   clara._bank_adjustments_norm + clara._settle_request_hash -- the two single-owner
--          primitives the settle core and the composite MUST agree on byte-for-byte.
--   S4.2   clara._allocate_receipt_core   (preheld-aware factoring of the live body)
--   S4.3   clara._allocate_payment_core   (idem)
--   S4.4   clara.allocate_receipt / clara.allocate_payment -- thin reserve-then-delegate
--          wrappers (CoR; the S4.Z behavioural pins move to the cores).
--   S4.5   clara._settle_from_bank_line_core -- the factoring, plus the FIRST of the seven
--          parked-declaration admissions (the `line_excepted` wall, p_ctx channel).
--   S4.6   clara.settle_from_bank_line -- BOTH live overloads, as wrappers.
--   S4.6A  clara._wdb_line_booking_block (+ the exception-keyed wrapper) -- the SHARED "what
--          standing booking does this LINE carry, and what would clear it" derivation
--          (as-built ladder rounds 3-5). ONE derivation, THREE readers: the composite and the
--          belt ENFORCE it, clara.unmatch_bank_match PROMISES it.
--   S4.6B  clara._wdb_assert_line_booking_lawful -- the SINGLE enforcement body.
--   S4.6C  the causal test's PREMISE, asserted at build time (round 5).
--   S4.7   clara.resolve_and_book_bank_line -- the composite (owner floor).
--   S4.8   clara.complete_pending_match (CoR) -- the flip: admission site 3, the stale
--          re-read, the declarant-resolved exception, the cleared declaration.
--   S4.9   clara.unmatch_bank_match (CoR) -- admission site 6 + the post-flip REOPEN.
--   S4.10  clara._tf_bank_line_exception_transition (CoR) -- the resolved->open arm.
--   S4.11  clara._tf_bank_settled_authority_belt (CoR) -- admission sites 2, 4, 5 and 7.
--   S4.12  the producer: the dedup index + clara.accept_bank_rule_suggestion, which derives
--          through SECTION S2's shared bodies (clara._wdb_suggestion_rule_hit /
--          clara._wdb_suggestion_lines) so the accept and clara._adj_on_approve arm (3)
--          cannot disagree. This section authors NO approve-time splice (arm (3) is S2's).
--   S4.13  ACLs.
--
-- THE SEVEN-SITE PARKED-DECLARATION ADMISSION [L3/C3-2, L4/V4-12..16], each with its own
-- evidence channel, and NOTHING wider:
--   (1) S4.5  the settle core's `line_excepted` wall .................. p_ctx declaration
--   (2) S4.11 the belt's line-member INSERT arm ....................... the in-snapshot group
--   (3) S4.8  complete_pending_match's settled guard .................. the FOR-UPDATE group
--   (4) S4.11 the line-member pending->live cascade arm ............... group id + exception
--   (5) S4.11 the entry-member pending->live cascade arm .............. group id + exception
--   (6) S4.9  unmatch_bank_match's verb-side settled guard ............ the FOR-UPDATE group
--   (7) S4.11 the line-member pending->unmatched cascade arm .......... group id + exception
-- SITES 6 AND 7 ARE THE SAME ACT SEEN TWICE (the verb and the deferred belt) and they must
-- therefore key on the same evidence: pending + the identity column, never the exception's
-- current STATUS. Round 2 of the as-built ladder found them disagreeing on exactly one
-- reachable state, and the disagreement was a walled corridor -- see S4.11's predicate.
-- ORDINARY GROUPS AND live->unmatched RELEASES KEEP THEIR UNCONDITIONAL REFUSALS. Rationale
-- of scope [L3]: an OPEN exception inside a COMPLETED reconciliation is lawful C-c state --
-- precisely the class the parked resolution serves -- so the settled-period machinery must
-- admit the park's INSERT, its flip AND its cancel, and nothing else.
--
-- ASSEMBLY ADJUDICATIONS APPLIED IN THIS SECTION (each is reported to the orchestrator; none
-- overrides the design):
--   A. THE BOOKING LEG IS ARGUMENT-CHOSEN. ABI SSA gives the composite no p_counterparty and
--      no explicit leg selector, so the leg is derived: `p_draft` non-null => the HAND-DRAFT
--      leg (draft_entry -> _approve_entry_core -> match_bank_line); `p_draft` null =>
--      the SETTLEMENT leg (_settle_from_bank_line_core), whose counterparty and domain are
--      DERIVED from the open items named in p_allocations (every allocate wall already
--      demands one counterparty per allocation set, so the derivation is the callee's own
--      law read forwards). Exactly one leg per call; neither-or-both refuses
--      `booking_request_invalid` with an axis (the 0041 `disposal_request_invalid` additive
--      -token precedent).
--   B. THE PARK IS REACHABLE ONLY ON THE SETTLEMENT LEG, which is [WDB-G9] read as code:
--      clara.bank_matches anchors exactly ONE draft, and only the settle core can create a
--      group in the `pending` state. A hand-draft that would be HIGH-STAKES therefore
--      refuses `pending_branch_ancillary_unsupported` BEFORE it is approved rather than
--      dying on _approve_entry_core's CLR05 with a message about checkers.
--   C. TWO SINGLE-OWNER PRIMITIVES (S4.1). The composite must reproduce the settle verb's
--      live 11-field request hash BYTE-EXACTLY to pre-reserve `<op>:settle` (ABI SSE), and
--      that hash is a function of the CANONICALISED adjustment array. Duplicating either
--      expression would create precisely the drift the op-hash exists to prevent, so both
--      are extracted into private primitives that the core and the composite share. The
--      extracted text is the LIVE text, verbatim -- a behaviour-preserving factoring.

-- =====================================================================================
-- S4.0 -- PRESTATE: THE CHAIN-OF-RECUT CENSUS.
-- =====================================================================================
-- Every function this section factors or splices is re-derived from the LIVE CATALOG
-- (pg_get_functiondef), never from a migration file's text -- the 0036:381-395 law, restated
-- by 0041's SECTION S4 header. This block is the dual-grep: each anchor and each
-- pre-existing marker is COUNTED, not merely probed, because replace() rewrites EVERY
-- occurrence and a drifted body holding two copies of an anchor would take two splices while
-- a bare position()>0 postcheck stayed green (0038:7785-7790 / 0040:7004-7006 / 0041:4458).
--
-- Every count below was MEASURED on the harvested live bodies of a database migrated
-- 0001..0041 from zero. A mismatch here means the live body drifted (or lost a prior
-- splice) and the remedy is to re-derive this section against the live catalog -- never to
-- relax the count.
--
-- ANTI-REVERT, SPECIFICALLY: `allocation_to_unborn_item` must be present exactly ONCE in
-- each allocate body. That marker is 0041's AF-1 splice (S4.2/S4.3). A body rebuilt from
-- 0037's file text upstream would have LOST it, and this section would then factor a core
-- that silently un-does WD-R13's hard refuse.
do $s4_0$
declare
  v_sig text; v_def text; v_n int; r record;
begin
  -- (a) IDEMPOTENCY. None of the five new SS4 function names may already exist, and no live
  -- body may already carry this section's new markers.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname in ('_settle_from_bank_line_core', '_allocate_receipt_core',
        '_allocate_payment_core', 'resolve_and_book_bank_line', 'accept_bank_rule_suggestion',
        '_bank_adjustments_norm', '_settle_request_hash', '_bank_parked_cascade_admitted',
        '_bank_recon_snapshot_parked',
        -- as-built ladder round 4: the line-keyed booking law and its single enforcement body.
        '_wdb_line_booking_block', '_wdb_assert_line_booking_lawful');
  if v_n <> 0 then
    raise exception '0042 S4.0 prestate: % SS4 function name(s) already exist -- this section has already been applied to this database', v_n
      using errcode = 'CLR10';
  end if;
  -- ANCHOR: the SS5 producer derives its legs from SECTION S2's shared bodies -- the SAME two
  -- clara._adj_on_approve arm (3) re-derives against -- so the accept verb and the
  -- approve-time re-validation can never disagree about what a signed rule says. A missing one
  -- here is a section-ORDER error (S2 must run before S4), not a drift.
  -- clara._adj_line_eligibility_breach joins the anchor set (as-built ladder round 2): the
  -- producer's account-role door reads the SAME shared census the template producer does, and
  -- clara._adj_on_approve arm (3) re-asks through it -- so it is a section-ORDER dependency of
  -- exactly the same kind as the two derivation bodies.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname in ('_wdb_suggestion_rule_hit', '_wdb_suggestion_lines',
        '_adj_line_eligibility_breach');
  if v_n <> 3 then
    raise exception '0042 S4.0 prestate: clara._wdb_suggestion_rule_hit / clara._wdb_suggestion_lines / clara._adj_line_eligibility_breach are not all present (found %) -- SECTION S2 must run before SECTION S4; the producer derives and judges through them and must not own a second copy of either', v_n
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array[
      'clara.complete_pending_match(uuid,uuid,text)',
      'clara.unmatch_bank_match(uuid,uuid,text,text)',
      'clara._tf_bank_settled_authority_belt()',
      'clara._tf_bank_line_exception_transition()'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
    if v_def is null then
      raise exception '0042 S4.0 prestate: % is GONE', v_sig using errcode = 'CLR10';
    end if;
    if position('pending_resolution' in v_def) <> 0
       or position('resolution_exception_id' in v_def) <> 0 then
      raise exception '0042 S4.0 prestate: % already carries the SS4 parked-declaration markers -- this section has already been applied to this database', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE LIVE-BODY MARKER CENSUS, per subject, at MEASURED counts.
  for r in select * from (values
      -- clara.allocate_receipt -- the S4.2 factoring subject.
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_to_unborn_item', 1),
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_target_reversed', 1),
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'expected_outstanding_cents', 1),
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'approve_key_collision', 1),
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'ar_control_not_unique', 1),
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'receipt_preheld', 2),
      -- clara.allocate_payment -- the S4.3 factoring subject.
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_to_unborn_item', 1),
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_target_reversed', 1),
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'credit_note_item', 1),
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'ap_control_not_unique', 1),
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'receipt_preheld', 1),
      -- clara.settle_from_bank_line, BOTH overloads -- the S4.5 factoring subject. The
      -- 13-argument variant differs from the 12-argument one by exactly the p_via_rule arity
      -- (`rule_not_signed` present once) and NOTHING else, which is what lets ONE core serve
      -- both wrappers byte-identically (assembly adjudication 2 of the file header).
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
        'line_excepted', 1),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
        'ancillaries_deferred', 2),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
        'approve_key_collision', 2),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
        'settlement_amount_invalid', 2),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',
        'rule_not_signed', 0),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
        'line_excepted', 1),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
        'ancillaries_deferred', 2),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
        'rule_not_signed', 1),
      -- clara.complete_pending_match -- the S4.8 splice subject.
      ('clara.complete_pending_match(uuid,uuid,text)', 'recon_period_settled', 1),
      ('clara.complete_pending_match(uuid,uuid,text)', 'match_not_pending', 2),
      ('clara.complete_pending_match(uuid,uuid,text)', 'pending_ancillaries', 6),
      ('clara.complete_pending_match(uuid,uuid,text)', 'entry_not_approved', 1),
      -- clara.unmatch_bank_match -- the S4.9 splice subject.
      ('clara.unmatch_bank_match(uuid,uuid,text,text)', 'recon_period_settled', 1),
      ('clara.unmatch_bank_match(uuid,uuid,text,text)', 'already_unmatched', 1),
      ('clara.unmatch_bank_match(uuid,uuid,text,text)', 'draft_withdrawn', 6),
      ('clara.unmatch_bank_match(uuid,uuid,text,text)', 'pending_ancillaries', 2),
      -- clara._tf_bank_settled_authority_belt -- the S4.11 splice subject (four arms).
      ('clara._tf_bank_settled_authority_belt()', 'recon_period_settled', 4),
      ('clara._tf_bank_settled_authority_belt()', 'disposition_unbooked', 1),
      ('clara._tf_bank_settled_authority_belt()', 'line_already_matched', 2),
      ('clara._tf_bank_settled_authority_belt()', 'resolved_at > v_cover_at', 2),
      ('clara._tf_bank_settled_authority_belt()', 'completing_recon', 3),
      -- clara._tf_bank_line_exception_transition -- the S4.10 recut subject.
      ('clara._tf_bank_line_exception_transition()', 'line_exception_immutable', 1),
      ('clara._tf_bank_line_exception_transition()', 'line_exception_transition_illegal', 1),
      ('clara._tf_bank_line_exception_transition()', 'counterpart_line_id', 3)
    ) as t(sig, marker, want) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    if v_def is null then
      raise exception '0042 S4.0 prestate: % is GONE', r.sig using errcode = 'CLR10';
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.0 prestate: % carries the marker "%" % time(s), expected % -- the live body drifted or lost a prior splice; re-derive SECTION S4 against the live catalog', r.sig, r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (c) THE clara.bank_matches ALTER (SECTION S1 / ABI SSD tail) must already be in place:
  -- every one of the seven admission sites reads one of these two columns, and the composite
  -- stamps both. A missing column here is a section-ORDER error, not a drift.
  select count(*)::int into v_n from information_schema.columns
    where table_schema = 'clara' and table_name = 'bank_matches'
      and column_name in ('pending_resolution', 'resolution_exception_id');
  if v_n <> 2 then
    raise exception '0042 S4.0 prestate: clara.bank_matches carries % of the 2 SS4 columns (pending_resolution, resolution_exception_id) -- SECTION S1 must run before SECTION S4', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '0042 S4.0 prestate OK: 9 new SS4 names are free, no live body carries the parked-declaration markers, 33 live-body markers across 8 subjects (both settle overloads, both allocate bodies, the flip, the release, the belt and the exception transition) stand at their measured counts, and the bank_matches ALTER is in place.';
end $s4_0$;

set role clara_fn_owner;

-- =====================================================================================
-- S4.1 -- THE TWO SINGLE-OWNER PRIMITIVES (assembly adjudication C).
-- =====================================================================================
-- ABI SSE pins `<op>:settle` as reserved BY THE COMPOSITE, PRE-LOCK, under the settle verb's
-- LIVE 11-FIELD REQUEST HASH, and spent by _settle_from_bank_line_core preheld. Two frames
-- therefore have to agree on that hash byte-for-byte, and it is a function of the
-- CANONICALISED adjustment array. Writing either expression twice is exactly the drift an op
-- hash exists to prevent -- a caller that canonicalises one way and the core the other would
-- replay a receipt for a request nobody made. So both are extracted here, VERBATIM from the
-- live settle body, and both call sites read them.
--
-- IMMUTABLE, not STABLE: each is a pure function of its arguments and nothing else, which is
-- what lets a hash computed in the composite's frame be the same bytes the core computes in
-- its own.

-- The adjustment-array validator + canonicaliser: the live settle body's normalisation block,
-- moved without a semantic change (same refusal token, same sort key, same null-memo
-- handling). The sort is (account_code, amount_cents, coalesce(memo,'')) so two callers who
-- name the same adjustments in a different order hash identically -- the 0037:2101-2102
-- "normalize BEFORE hashing" law.
create function clara._bank_adjustments_norm(p_adjustments jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_adjs jsonb;
begin
  if p_adjustments is not null and jsonb_typeof(p_adjustments) <> 'array' then
    raise exception 'the adjustment set must be a json array'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(btrim(x.elem->>'account_code'),'') = ''
       or jsonb_typeof(x.elem->'amount_cents') is distinct from 'number'
       or (x.elem->>'amount_cents')::numeric = 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each adjustment must state an account_code and a non-zero whole amount_cents'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', t.acc,
             'amount_cents', t.amt, 'memo', t.memo)
           order by t.acc, t.amt, coalesce(t.memo,'')), '[]'::jsonb)
    into v_adjs
    from (select btrim(x.elem->>'account_code') as acc,
                 (x.elem->>'amount_cents')::bigint as amt,
                 nullif(btrim(x.elem->>'memo'),'') as memo
          from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)) t;
  return v_adjs;
end $$;
revoke all on function clara._bank_adjustments_norm(jsonb) from public;

-- THE SETTLE REQUEST HASH, verbatim (ABI SSE: "the settle verb's live 11-field hash").
-- p_control_account is in it for the reason 0037:2664-2669 states of its twin: it DECIDES
-- which control account the settlement touches, and a replay under the same key with a
-- different one must not return the first call's receipt. p_via_rule is appended ONLY when
-- non-null, which is precisely what makes the 12-argument and 13-argument overloads produce
-- the SAME bytes for the same request -- one core, two wrappers, no receipt divergence.
-- p_adjustments_canonical MUST already be canonical (clara._bank_adjustments_norm).
create function clara._settle_request_hash(p_client uuid, p_line uuid, p_counterparty uuid,
    p_allocations jsonb, p_memo text, p_posting_date date, p_charge_cents bigint,
    p_charge_account text, p_adjustments_canonical jsonb, p_attestation text,
    p_control_account text, p_via_rule uuid) returns bytea
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select clara._hash(jsonb_build_object('client', p_client, 'line', p_line,
      'counterparty', p_counterparty, 'allocations', coalesce(p_allocations,'[]'::jsonb),
      'memo', nullif(btrim(coalesce(p_memo,'')),''), 'posting_date', p_posting_date,
      'charge_cents', p_charge_cents, 'charge_account', p_charge_account,
      'adjustments', p_adjustments_canonical, 'attestation', p_attestation,
      'control_account', p_control_account)
      || case when p_via_rule is null then '{}'::jsonb
              else jsonb_build_object('via_rule', p_via_rule) end);
$$;
revoke all on function clara._settle_request_hash(uuid,uuid,uuid,jsonb,text,date,bigint,text,
  jsonb,text,text,uuid) from public;

-- =====================================================================================
-- S4.2 -- clara._allocate_receipt_core (design SS4; [L2/FI1+C2-1], [L3/V3+C3-1]).
-- =====================================================================================
-- THE FACTORING, AND WHY IT IS SHAPED THIS WAY. clara._reserve_op RAISES CLR10 on a
-- same-transaction re-reserve with a different hash and returns a `{pending:true}` stub on a
-- match -- so a composite that pre-reserves a key its callee will also reserve gets either a
-- refusal or a callee that no-ops. The ratified answer [L2/FI1] is the 0041:3559 poster
-- shape: keys spent through a core call are pre-reserved by the caller and the core is told
-- `receipt_preheld`, exactly as clara._approve_entry_core has done since 0016.
--
-- THE BODY BELOW IS THE LIVE clara.allocate_receipt BODY, harvested from pg_get_functiondef
-- and MOVED, with three changes and no others:
--   1. the caller context arrives as p_ctx (actor/firm/receipt_preheld) instead of being read
--      from the JWT by clara._human_ctx -- the floor moves OUT to the public wrapper (S4.4),
--      which is where a floor belongs;
--   2. the verb's own clara._reserve_op is skipped when the caller holds the receipt;
--   3. nothing else. The AF-1 unborn-item wall (0041 S4.2), the reversed-entry wall, the
--      control-account explicit lane, the expected_outstanding pin and the WCA-R7 branch are
--      byte-for-byte the live text -- S4.0's census is what proves the source was the LIVE
--      body and not 0037's file text.
create function clara._allocate_receipt_core(p_ctx jsonb, p_client uuid, p_counterparty uuid,
    p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint,
    p_allocations jsonb, p_op_key text, p_discount_cents bigint, p_discount_account text,
    p_attestation text, p_control_account text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core_ar$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
  v_preheld boolean;
begin
  -- THE CONTEXT, from the caller's frame (the clara._approve_entry_core convention,
  -- 0016:15-20). The FLOOR is the wrapper's job: a core never decides who may call it,
  -- because every caller is itself a floored SECURITY DEFINER verb.
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the allocate core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a receipt amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  -- ck_je_basis demands a document or a memo, and a settlement never has a document, so the
  -- memo is synthesised rather than refused when blank: a receipt is real work and should not
  -- fail on a blank field the system can fill honestly.
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Customer receipt');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'customer' then
    raise exception 'a customer receipt requires a counterparty of kind customer'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  -- NORMALIZE the allocation set BEFORE hashing it. Validated straight off the raw argument
  -- so a malformed uuid or a fractional amount becomes a NAMED refusal rather than a raw cast
  -- error a caller cannot act on.
  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the receipt (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_receipt"}';
  end if;

  -- THE REQUEST HASH CARRIES EVERY ARGUMENT THAT REACHES A STORED COLUMN OR A DECISION, and
  -- p_control_account is both: it decides WHICH receivable control account the entry credits.
  -- Omitting it would let the same op_key replayed with a different control account return
  -- the FIRST call's receipt while the caller believes the second request landed -- a silent
  -- wrong-account post with a green receipt, which is exactly the failure mode op hashes
  -- exist to prevent.
  -- 0042 (D-b SS4): SKIPPED when the CALLER already reserved this key (receipt_preheld) --
  -- the clara._approve_entry_core convention. The fn name stays 'allocate_receipt' on every
  -- path, so a preheld caller must reserve under that same fn or its receipt is unfindable.
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, 'allocate_receipt', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
        'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
        'amount_cents', p_amount_cents, 'discount_cents', v_disc,
        'discount_account', p_discount_account, 'control_account', p_control_account,
        'attestation', p_attestation, 'allocations', v_allocs)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- PRE-RESERVE THE DERIVED APPROVE SUB-KEY HERE, BEFORE ANY LOCK. _reserve_op writes an
  -- op_receipts row, so it can BLOCK on a concurrent inserter of the same key. Taking that
  -- block while already holding the two client advisory locks (as the original build did, at
  -- the bottom of this body) makes a deadlock reachable: two sessions, each holding the other
  -- session's next rung. Claiming the sub-key namespace first -- before 203005003 -- closes
  -- the window entirely, and it costs nothing, because the reservation is rolled back with
  -- everything else if this call fails (0004:43-60). The hash pins the COMPOSITE's own key
  -- rather than (entry, revision), which do not exist yet; the core never re-checks it
  -- (receipt_preheld:true skips its own reserve) and its only jobs are to claim the namespace
  -- against a later human approve_entry replay and to be finished by the core's _finish_op.
  -- ON THE WCA-R7 DRAFT BRANCH the core is never called, so the sub-key stays CLAIMED BUT
  -- UNFINISHED for the life of the draft. That is the honest cost of moving the reservation
  -- ahead of the locks, and it is the safe direction: the namespace stays reserved, and the
  -- checker approves through their OWN op_key on the ordinary /queue lane.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_receipt',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  -- LOCKS, in the total order. See the section header for why the two advisory locks are
  -- taken HERE rather than left to the core.
  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- THE CONTROL ACCOUNT. Plural control accounts per class are legal (design 2.7), so the
  -- composite NEVER silently picks: with one active receivable-class account it is used;
  -- with several, the caller must name one via p_control_account (the explicit lane).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'receivable' and a.is_active) then
      raise exception 'p_control_account % is not an active receivable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'receivable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active receivable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ar_control_not_unique"}';
    end if;
  end if;
  -- The bank leg must be an ACTIVE, ASSET-typed, NON-CONTROL account. Asset-typed is not
  -- decoration: the receipt floor forbids income legs, so an income-typed "bank" account would
  -- build an entry that refuses at commit with a message about the floor rather than about the
  -- account the caller actually got wrong.
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the receipt account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- account_class IS NULL on the discount account too, for the same reason it is demanded of
  -- the bank leg: a control-class account admitted here would put a SECOND receivable leg on
  -- a customer_receipt, which the shape floor refuses at commit with a message about the
  -- floor rather than about the account the caller actually got wrong -- and, worse, a
  -- payable-class "discount" account would build a cross-domain contra out of a settlement.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'expense'
                        and a.account_class is null) then
      raise exception 'a receipt discount must be booked to an active, non-control expense account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  -- VALIDATE THE ALLOCATION SET AGAINST OUTSTANDING, UNDER THE BATCH ROW LOCK.
  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ar' then
      raise exception 'open item % is not a receivable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    -- Canonicalise on READ as well as on write: a merge performed after the item was written
    -- does not repoint history, exactly as it does not for journal_lines.
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different customer', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path. An entry that has been REVERSED is out
    -- of the books; its item's outstanding is a number the reversal has already answered with
    -- an unwind item of the exact opposite sign. Receipting against it would take real money
    -- in against a claim that no longer exists, leave the unwind permanently un-applied, and
    -- show the customer as paid on an invoice that was cancelled. The remedy is the sanctioned
    -- one and the message names it: apply the unwind to the item (apply_open_items), which
    -- takes both to zero with no GL movement at all.
    --
    -- READ SEPARATELY, not folded into the credit-note wall's `join clara.documents`: that
    -- join is INNER and silently skips every entry with no document -- which is every generic
    -- JV, every opening entry and every entry born outside a filing. A wall that cannot see
    -- document-less entries is not a wall.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of receipting against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to receipt against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- PIN THE OUTSTANDING THIS VALIDATION ACTUALLY SAW into the stored proposal. On the
    -- WCA-R7 draft branch the hook re-validates at the CHECKER's approve, and "still fits"
    -- is not the same statement as "nothing moved": an intervening partial allocation that
    -- leaves room would silently change what the maker proposed. The pin rides the PROPOSAL,
    -- never the op hash -- the hash must stay a function of the CALLER's request alone, or a
    -- legitimate retry of the identical request would be rejected as different args.
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  -- THE SETTLEMENT ENTRY. Dr bank (amount) [+ Dr discount] / Cr receivable control (gross).
  -- The control credit of amount+discount is what makes the settlement item exactly -gross,
  -- so the classifier needs no knowledge of discounts at all.
  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'customer_receipt', c.actor, c.actor,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ar', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, p_amount_cents, 0, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, v_disc, 0, 'Settlement discount', null);
  end if;
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, 0, v_gross, v_memo, v_cp);
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    -- WCA-R7: leave a DRAFT carrying the validated proposal. The checker approves it through
    -- the ordinary /queue lane and the hook materialises everything, re-validating outstanding
    -- at that moment.
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_receipt', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_receipt', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $core_ar$;
revoke all on function clara._allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,
  jsonb,text,bigint,text,text,text) from public;

-- =====================================================================================
-- S4.3 -- clara._allocate_payment_core (the AP twin of S4.2; same three changes, same law).
-- =====================================================================================
create function clara._allocate_payment_core(p_ctx jsonb, p_client uuid, p_counterparty uuid,
    p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint,
    p_allocations jsonb, p_op_key text, p_discount_cents bigint, p_discount_account text,
    p_attestation text, p_control_account text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core_ap$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_doc_kind text; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
  v_preheld boolean;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the allocate core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Supplier payment');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'vendor' then
    raise exception 'a supplier payment requires a counterparty of kind vendor'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the payment (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_payment"}';
  end if;

  -- p_control_account is in the hash for the reason its AR twin states: it decides WHICH
  -- payable control account the entry debits, so a replay under the same key with a different
  -- control account must not return the first call's receipt.
  -- 0042 (D-b SS4): skipped when the CALLER already holds this receipt (see the AR twin).
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, 'allocate_payment', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
        'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
        'amount_cents', p_amount_cents, 'discount_cents', v_disc,
        'discount_account', p_discount_account, 'control_account', p_control_account,
        'attestation', p_attestation, 'allocations', v_allocs)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- The derived approve sub-key is pre-reserved BEFORE any lock, exactly as in the AR twin
  -- (see the full reasoning there): _reserve_op can block on a concurrent inserter, and
  -- blocking on it while holding the two client advisory locks makes a deadlock reachable.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_payment',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- The control account: same explicit-lane law as the receipt side (never a silent pick).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'payable' and a.is_active) then
      raise exception 'p_control_account % is not an active payable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'payable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active payable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ap_control_not_unique"}';
    end if;
  end if;
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the payment account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- THE ONE ASYMMETRY: a supplier settlement discount is INCOME (a discount received), where a
  -- customer settlement discount is an expense (a discount given). account_class IS NULL is
  -- demanded here too -- a control-class "discount" account would put a second payable leg on
  -- the payment, or a receivable one, which is a cross-domain contra dressed as a discount.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'income'
                        and a.account_class is null) then
      raise exception 'a payment discount must be booked to an active, non-control income account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ap' then
      raise exception 'open item % is not a payable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different supplier', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path -- and on THIS side it is money going
    -- OUT. Paying against an item whose entry has been reversed pays a bill the books have
    -- already cancelled. Read as its OWN statement rather than folded into the credit-note
    -- join below: that join is INNER on clara.documents and cannot see a document-less entry
    -- at all, which is every generic JV and every opening entry. The remedy named in the
    -- message is the sanctioned one -- apply the unwind item to this item, zero GL movement.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    -- THE CREDIT-NOTE WALL (Wave-C contract section 3, discharged). supplier_credit_note has
    -- no coding home yet, so a supplier CN mis-coded AS a bill still mints a payable item --
    -- and paying against it would turn a coding error into a path to real cash. Refusing when
    -- the item's entry is bound to a document the classifier called a credit_note converts the
    -- trap back into a VISIBLE coding error the human must fix first. The residual exposure is
    -- recorded honestly: a CN whose document was never classified as one is still reachable,
    -- and only supplier_credit_note closes that for good.
    select d.document_kind into v_doc_kind
      from clara.journal_entries je
      join clara.documents d on d.id = je.document_id
      where je.id = i.entry_id;
    if v_doc_kind = 'credit_note' then
      raise exception 'open item % comes from a document classified as a credit note; fix the coding before paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"credit_note_item"}';
    end if;
    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to pay against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- The outstanding THIS validation saw, pinned into the proposal so the hook can require
    -- EQUALITY at the checker's approve rather than "still fits" (see the AR twin).
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'supplier_payment', c.actor, c.actor,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ap', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, v_gross, 0, v_memo, v_cp);
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, 0, p_amount_cents, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, 0, v_disc, 'Settlement discount', null);
  end if;
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_payment', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_payment', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $core_ap$;
revoke all on function clara._allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,
  jsonb,text,bigint,text,text,text) from public;

-- =====================================================================================
-- S4.4 -- clara.allocate_receipt / clara.allocate_payment -- THE PUBLIC WRAPPERS (CoR).
-- =====================================================================================
-- CREATE OR REPLACE, so the existing ACL and owner survive untouched (the 0018:55 CoR note).
-- Each keeps EXACTLY the public arity it has had since 0037 -- defaults included -- so every
-- live caller, the dashboard RPC layer and x37/x38 are unaffected; what changes is that the
-- body is now four lines. The FLOOR STAYS HERE (bookkeeper+): a core takes its authority from
-- its caller, and the only lawful callers are floored verbs.
--
-- receipt_preheld is FALSE on this path, so the core reserves its own op receipt under the
-- same fn name it always used -- a replay of a pre-0042 op_key returns the pre-0042 receipt.
create or replace function clara.allocate_receipt(p_client uuid, p_counterparty uuid,
    p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint,
    p_allocations jsonb, p_op_key text, p_discount_cents bigint default 0,
    p_discount_account text default null, p_attestation text default null,
    p_control_account text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._allocate_receipt_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false),
    p_client, p_counterparty, p_posting_date, p_memo, p_bank_account, p_amount_cents,
    p_allocations, p_op_key, p_discount_cents, p_discount_account, p_attestation,
    p_control_account);
end $$;

create or replace function clara.allocate_payment(p_client uuid, p_counterparty uuid,
    p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint,
    p_allocations jsonb, p_op_key text, p_discount_cents bigint default 0,
    p_discount_account text default null, p_attestation text default null,
    p_control_account text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._allocate_payment_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false),
    p_client, p_counterparty, p_posting_date, p_memo, p_bank_account, p_amount_cents,
    p_allocations, p_op_key, p_discount_cents, p_discount_account, p_attestation,
    p_control_account);
end $$;

-- =====================================================================================
-- S4.5 -- clara._settle_from_bank_line_core (design SS4; ABI SSE row `<op>:settle`).
-- =====================================================================================
-- ONE CORE, TWO PUBLIC OVERLOADS. The live verb exists at a 12-argument and a 13-argument
-- signature whose bodies differ by EXACTLY the p_via_rule arity: the rule-signed pre-check,
-- the `origin` value and one conditional hash field. Every one of those three is a no-op when
-- p_via_rule is null, so the 13-argument body IS the 12-argument body generalised -- which is
-- what lets one core serve both wrappers with byte-identical receipts (S4.0's census pins the
-- difference at `rule_not_signed` 0-vs-1, which is the whole delta).
--
-- THE THREE CHANGES FROM THE LIVE BODY, and no others:
--   1. context via p_ctx: actor / firm / receipt_preheld / fn / exception_declaration.
--      `fn` is the op_receipts namespace this call reserves and finishes under. It is
--      'settle_from_bank_line' for both public wrappers -- so a pre-0042 op_key replays to
--      its pre-0042 receipt -- and '_settle_from_bank_line_core' for the AF-2 composite,
--      which is the fn ABI SSE names for the `<op>:settle` row.
--   2. the request hash + the adjustment canonicalisation move to the S4.1 primitives, so
--      the composite can reproduce the hash byte-exactly without owning a second copy.
--   3. the `line_excepted` wall gains ADMISSION SITE 1 OF 7 -- and nothing else in this body
--      moves. The allocate calls go to the S4.2/S4.3 cores rather than the public verbs
--      (the ctx is threaded, not re-derived from a JWT); every wall, every sign convention,
--      every deferral marker and the whole pending/live branch are the live text.
--
-- WHY SITE 1 EXISTS AT ALL. On the composite's park branch the exception is STILL OPEN when
-- the settlement is built -- it must be, because [WDB-G9] parks the resolution for the
-- checker rather than executing it -- so the wall that exists to keep an excepted line out of
-- a match would refuse the very act the design ratifies. The evidence channel is the
-- CALLER'S OWN DECLARATION in p_ctx (no GUC, no table round-trip): the wall still refuses
-- every OTHER open exception on the line, and a declaration that does not name an open
-- exception on THIS line admits nothing at all.
create function clara._settle_from_bank_line_core(p_ctx jsonb, p_client uuid, p_line uuid,
    p_counterparty uuid, p_allocations jsonb, p_memo text, p_posting_date date,
    p_charge_cents bigint, p_charge_account text, p_adjustments jsonb, p_attestation text,
    p_control_account text, p_op_key text, p_via_rule uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core_settle$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  ln record; st record; v_coa text; v_bank uuid;
  v_adjs jsonb; v_adj_cents bigint := 0; v_charge bigint; v_pd date;
  v_domain text; v_settle_cents bigint; v_res jsonb; v_entry uuid; v_status text;
  v_match uuid; v_match_status text; v_ctx jsonb; v_memo text;
  v_adj_entries uuid[] := '{}'::uuid[]; v_adj_entry uuid; v_charge_entry uuid;
  v_i int; v_key text; aj record;
  v_preheld boolean; v_fn text; v_decl uuid;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the settle core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  v_fn := coalesce(nullif(btrim(coalesce(p_ctx->>'fn','')),''), 'settle_from_bank_line');
  -- The parked-declaration channel (admission site 1). Absent on every ordinary call.
  v_decl := nullif(btrim(coalesce(p_ctx->'exception_declaration'->>'exception_id','')),'')::uuid;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- 0040 (C-c, design section 4.3 engineering pin; register entry 4): THE RULE ARITY --
  -- identical law to match_bank_line's. Settlement KINDS stay composite-born and no rule ever
  -- executes anything; this arity records WHICH signed rule a human accepted a pre-fill from.
  -- Vacuous when p_via_rule is null, which is the 12-argument wrapper's whole delta.
  if p_via_rule is not null then
    if not exists (select 1 from clara.bank_rules r
                   where r.id = p_via_rule and r.firm_id = c.firm and r.client_id = p_client
                     and r.kind = 'match_settle' and r.status = 'signed') then
      raise exception 'bank rule % is not a signed match/settle rule for this client', p_via_rule
        using errcode='CLR10',detail='{"reason":"rule_not_signed"}';
    end if;
  end if;
  v_charge := coalesce(p_charge_cents, 0);
  if v_charge < 0 then
    raise exception 'a bank charge cannot be negative'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge = 0 and p_charge_account is not null then
    raise exception 'a charge account was named but no charge amount was stated'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge > 0 and (p_charge_account is null or btrim(p_charge_account) = '') then
    raise exception 'a bank charge must name the expense account it is booked to'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;

  -- The adjustment set, validated and canonicalised by the S4.1 primitive (the live block,
  -- moved: same refusal token, same sort key). The sum is derived from the canonical form so
  -- there is exactly one arithmetic of "how much do the adjustments explain away".
  v_adjs := clara._bank_adjustments_norm(p_adjustments);
  select coalesce(sum((x.elem->>'amount_cents')::bigint), 0) into v_adj_cents
    from jsonb_array_elements(v_adjs) as x(elem);

  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;

  -- THE REQUEST HASH. Every argument that reaches a stored column or a decision, with the
  -- adjustment array canonicalised -- clara._settle_request_hash is the single owner of that
  -- expression (S4.1), so the AF-2 composite's pre-reservation and this call agree by
  -- construction rather than by two people typing the same eleven fields.
  -- 0042 (D-b SS4): skipped when the CALLER already reserved this key (ABI SSE: the composite
  -- reserves `<op>:settle` pre-lock and the core spends it preheld).
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, v_fn, p_op_key,
      clara._settle_request_hash(p_client, p_line, v_cp, p_allocations, p_memo,
        p_posting_date, v_charge, p_charge_account, v_adjs, p_attestation,
        p_control_account, p_via_rule));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- ALL SUB-KEY RESERVATIONS BEFORE THE FIRST LOCK (part2 section 4.9's composite order,
  -- and 0037:2678-2698's deadlock reasoning). The ':settle' key is the composite's own;
  -- the ':adj:i' family covers the difference adjustments; ':charge' covers the payment-side
  -- bank charge. The composite reserves its own ':settle:approve' internally.
  -- These derive from THIS call's p_op_key, so under the AF-2 composite they are namespaced
  -- beneath `<op>:settle` -- the AF-2 caller never names them (ABI SSE's `descendants` row).
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_key := p_op_key || ':adj:' || v_i;
    if clara._reserve_op(c.firm, 'bank_match_adjustment', v_key,
         clara._hash(jsonb_build_object('op_key', p_op_key, 'i', v_i,
           'account_code', aj.acc, 'amount_cents', aj.amt))) is not null then
      raise exception 'the derived adjustment op key % is already in use', v_key
        using errcode='CLR10',detail='{"reason":"adjustment_key_collision"}';
    end if;
    if clara._reserve_op(c.firm, 'approve_entry', v_key || ':approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'i', v_i))) is not null then
      raise exception 'the derived approve op key %:approve is already in use', v_key
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end loop;
  -- The charge sub-key is claimed ONLY on the branch that will spend it -- the payment side
  -- with a stated charge. The receipt side books its charge through C-a's expense slot and
  -- mints no second entry, and claiming a namespace a branch can never reach would leave an
  -- op_receipts row nobody can ever finish.
  if v_charge > 0 and v_cp_kind = 'vendor' then
    if clara._reserve_op(c.firm, 'approve_entry', p_op_key || ':charge:approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'leg', 'charge'))) is not null then
      raise exception 'the derived charge approve op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- READ AND VALIDATE THE LINE BEFORE ANY LOCK. The line row is locked LAST (part2 4.9:
  -- "then bank rows LAST"), and the exclusivity index is the structural guard against the
  -- window this opens -- a concurrent matcher that wins the race is caught by the index and
  -- reported as already_matched, which is the same answer the human would have got.
  -- ---------------------------------------------------------------
  select * into ln from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client or ln.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode='CLR11';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found then
    raise exception 'statement line % has no statement', p_line
      using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
  end if;
  if st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a settlement', p_line, st.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',p_line,
          'statement_id',st.id,'statement_status',st.status)::text;
  end if;
  if exists (select 1 from clara.bank_match_line_members mm
             join clara.bank_matches bm on bm.id = mm.match_id
             where mm.line_id = p_line and bm.status in ('pending','live')) then
    raise exception 'statement line % already rides a pending or live match; unmatch it first', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end if;
  v_bank := st.bank_account_id;
  -- THE GL BANK ACCOUNT COMES FROM THE LINE'S STATEMENT, NEVER CALLER-PASSED (design
  -- section 4.6). A caller-passed bank account is how a settlement gets posted to the wrong
  -- ledger and still reconciles on paper.
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client and ba.active;
  if v_coa is null then
    raise exception 'this bank account has no active mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- p_posting_date defaults to the LINE's entry_date and is validated within the statement
  -- period. v1 named no date at all while the composites require one.
  v_pd := coalesce(p_posting_date, ln.entry_date);
  if v_pd < st.period_start or v_pd > st.period_end then
    raise exception 'a settlement posted from a statement line must post inside the statement period (% .. %), not on %', st.period_start, st.period_end, v_pd
      using errcode='CLR10',
        detail=jsonb_build_object('reason','posting_date_out_of_period',
          'posting_date',v_pd,'period_start',st.period_start,
          'period_end',st.period_end)::text;
  end if;

  -- ---------------------------------------------------------------
  -- DOMAIN FROM THE KIND; SIGN AS CONSISTENCY. The refund quadrants refuse BY NAME with the
  -- sanctioned workaround in the message.
  -- ---------------------------------------------------------------
  if v_cp_kind = 'customer' then
    v_domain := 'ar';
    if ln.amount_cents < 0 then
      raise exception 'money leaving the bank to a CUSTOMER is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped receivable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ar',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  elsif v_cp_kind = 'vendor' then
    v_domain := 'ap';
    if ln.amount_cents > 0 then
      raise exception 'money arriving from a VENDOR is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped payable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ap',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  else
    raise exception 'a settlement requires a counterparty of kind customer or vendor, not %', coalesce(v_cp_kind,'(unknown)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','counterparty_kind_mismatch',
          'counterparty_kind',v_cp_kind)::text;
  end if;

  v_memo := coalesce(nullif(btrim(p_memo), ''),
    case when v_domain='ar' then 'Customer receipt' else 'Supplier payment' end);
  v_ctx := jsonb_build_object('actor', c.actor, 'firm', c.firm);

  -- ---------------------------------------------------------------
  -- THE SETTLEMENT, through the C-a composite. See the section header for the arithmetic.
  -- 0042 (D-b SS4): through the CORE rather than the public verb, so the caller context is
  -- THREADED instead of being re-derived from a JWT the AF-2 lane may be several frames away
  -- from. receipt_preheld is false: the allocate key is this call's own derived namespace and
  -- the allocate core is still its reserver (ABI SSE, the `descendants` row).
  -- ---------------------------------------------------------------
  if v_domain = 'ar' then
    v_settle_cents := ln.amount_cents - v_adj_cents;
    if v_settle_cents <= 0 then
      raise exception 'after % cents of adjustments this line leaves % cents to receipt; a receipt must be positive', v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'adjustment_cents',v_adj_cents,
            'settlement_cents',v_settle_cents)::text;
    end if;
    v_res := clara._allocate_receipt_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false),
      p_client, v_cp, v_pd, v_memo, v_coa,
      v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      v_charge, p_charge_account, p_attestation, p_control_account);
  else
    -- P = L + C - A, i.e. the payment's own bank credit is |L| minus the charge and minus
    -- whatever the adjustments explain away.
    v_settle_cents := ln.amount_cents + v_charge - v_adj_cents;
    if v_settle_cents >= 0 then
      raise exception 'after % cents of bank charge and % cents of adjustments this line leaves % cents to pay; a payment must move money out', v_charge, v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'charge_cents',v_charge,
            'adjustment_cents',v_adj_cents,'settlement_cents',v_settle_cents)::text;
    end if;
    -- NO discount slot on this side: _assert_supplier_payment_shape_at forbids expense legs,
    -- and a supplier settlement DISCOUNT is income (a discount received), which a bank
    -- charge is not. The charge rides its own adjustment entry below.
    v_res := clara._allocate_payment_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false),
      p_client, v_cp, v_pd, v_memo, v_coa,
      -v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      0, null, p_attestation, p_control_account);
  end if;
  v_entry := (v_res->>'entry_id')::uuid;
  v_status := v_res->>'status';
  if v_entry is null or v_status is null then
    raise exception 'the settlement composite returned no entry'
      using errcode='CLR10',detail='{"reason":"settlement_composite_no_entry"}';
  end if;

  -- ---------------------------------------------------------------
  -- THE BRANCH IS DECIDED HERE, BEFORE ANY ANCILLARY IS POSTED (as-built ladder fix
  -- 2026-07-31, Codex wave). The composite's own answer -- approved, or a draft awaiting a
  -- checker -- decides whether this act BOOKS anything beyond the settlement itself.
  --
  -- WHY IT MOVED. The first cut posted the bank charge and the difference adjustments
  -- unconditionally, before the group was even written, on the reading that they are
  -- "ordinary approved entries in both branches". At high stakes that puts real money in the
  -- books for a settlement the checker has not seen and may reject -- and if the maker then
  -- cancels the reservation, those entries are stranded in the GL with no group, no line and
  -- no remedy but a hand-driven reversal nobody prompted. They are not independent facts:
  -- a bank charge on a payment and a difference adjustment on a receipt are PARTS of the one
  -- act whose principal half is still a draft. So on the pending branch they are VALIDATED
  -- now (a bad account must refuse while the human is still here to be told) and CARRIED on
  -- the group; clara.complete_pending_match creates them at the flip.
  -- ---------------------------------------------------------------
  v_match_status := case when v_status = 'approved' then 'live' else 'pending' end;

  if v_match_status = 'live' then
    -- The payment-side bank charge, as its own adjustment entry in this same transaction.
    if v_domain = 'ap' and v_charge > 0 then
      v_charge_entry := clara._bank_match_adjustment_entry(
        v_ctx, p_client, v_coa, p_charge_account, -v_charge, v_pd,
        'Bank charge on ' || v_memo,
        jsonb_build_object('bank_match', jsonb_build_object(
          'line_id', p_line, 'kind', 'bank_charge')),
        p_op_key || ':charge:approve', p_attestation);
    end if;

    -- The difference adjustments, on either side.
    v_i := 0;
    for aj in select (x.elem->>'account_code') as acc,
                     (x.elem->>'amount_cents')::bigint as amt,
                     (x.elem->>'memo') as memo
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      v_i := v_i + 1;
      v_adj_entry := clara._bank_match_adjustment_entry(
        v_ctx, p_client, v_coa, aj.acc, aj.amt, v_pd,
        coalesce(aj.memo, 'Bank settlement difference'),
        jsonb_build_object('bank_match', jsonb_build_object(
          'line_id', p_line, 'kind', 'adjustment', 'index', v_i)),
        p_op_key || ':adj:' || v_i || ':approve', p_attestation);
      perform clara._finish_op(c.firm, 'bank_match_adjustment',
        p_op_key || ':adj:' || v_i, jsonb_build_object('entry_id', v_adj_entry));
      v_adj_entries := v_adj_entries || v_adj_entry;
    end loop;
  else
    -- THE PENDING BRANCH POSTS NOTHING AND VALIDATES EVERYTHING. The account tests are the
    -- SAME tests clara._bank_match_adjustment_entry runs at build time -- active, non-control
    -- (account_class is null), expense- or income-typed, and never the bank account itself --
    -- under the SAME refusal token, because the remedy is the same one: name a real expense or
    -- income account. Deferring the write must never defer the diagnosis: a maker who typed a
    -- dead account learns it now, in the call they made, not days later when a checker's
    -- approval fails on a body they never saw.
    if v_domain = 'ap' and v_charge > 0
       and (p_charge_account = v_coa
            or not exists (select 1 from clara.coa_accounts a
                           where a.client_id = p_client and a.account_code = p_charge_account
                             and a.is_active and a.account_class is null
                             and a.account_type in ('expense','income'))) then
      raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_account_invalid',
            'account_code',p_charge_account)::text;
    end if;
    for aj in select (x.elem->>'account_code') as acc,
                     (x.elem->>'amount_cents')::bigint as amt
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      if aj.acc = v_coa
         or not exists (select 1 from clara.coa_accounts a
                        where a.client_id = p_client and a.account_code = aj.acc
                          and a.is_active and a.account_class is null
                          and a.account_type in ('expense','income')) then
        raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','adjustment_account_invalid',
              'account_code',aj.acc)::text;
      end if;
    end loop;
    -- AND THE DERIVED SUB-KEYS ARE CLOSED, NOT ABANDONED. They were reserved before the first
    -- lock (the branch is not knowable until the composite answers), and on THIS branch
    -- nothing will ever spend them: complete_pending_match creates the ancillaries under ITS
    -- OWN op_key, because a receipt another transaction reserved is not that call's to spend.
    -- Leaving them open would be precisely the "op_receipts row nobody can ever finish" this
    -- verb's own reservation note refuses to create, so each is finished with an honest
    -- deferral marker instead.
    if v_domain = 'ap' and v_charge > 0 then
      perform clara._finish_op(c.firm, 'approve_entry', p_op_key || ':charge:approve',
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
    end if;
    for v_i in 1 .. jsonb_array_length(v_adjs) loop
      perform clara._finish_op(c.firm, 'bank_match_adjustment', p_op_key || ':adj:' || v_i,
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
      perform clara._finish_op(c.firm, 'approve_entry',
        p_op_key || ':adj:' || v_i || ':approve',
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
    end loop;
  end if;

  -- ---------------------------------------------------------------
  -- THE BANK ROWS, LAST (part2 section 4.9). The line is locked here and the group is
  -- written in the SAME TRANSACTION the settlement was born -- which IS the interval C-a
  -- named and C-b closes.
  -- ---------------------------------------------------------------
  perform 1 from clara.bank_statement_lines l where l.id = p_line for update;
  perform 1 from clara.bank_statements s where s.id = ln.statement_id for share;

  -- 0040 (C-c, design section 4.2 / finding 38 [C8]): THE EXCEPTION RE-CHECK, AFTER THE LINE
  -- LOCK -- the same write-skew law match_bank_line carries, on the same shared serialization
  -- point. It sits HERE, at the bank rows, and not beside the unlocked already_matched probe
  -- near the top, because a check taken before the lock is a read of a world that can change:
  -- the authority statement has to be made where the lock is held. The cost is that an
  -- excepted line is discovered after the settlement composite has run -- the whole call rolls
  -- back, so nothing is stranded, and the refusal names the remedy.
  --
  -- 0042 (D-b SS4, ADMISSION SITE 1 OF 7 [WDB-G9]): ...AND THE ONE DECLARED EXCEPTION IS
  -- ADMITTED. clara.resolve_and_book_bank_line books the settlement leg of a parked
  -- resolution while the exception is deliberately still OPEN -- the checker executes it at
  -- the flip -- so the caller declares that exception in p_ctx and this wall stops refusing
  -- THAT ONE. It keeps refusing every other open exception on the line, and a declaration
  -- that names no open exception ON THIS LINE admits nothing (it simply fails to match the
  -- exclusion), so a stale or mistyped id can never widen the wall.
  if exists (select 1 from clara.bank_line_exceptions x
             where x.line_id = p_line and x.status = 'open'
               and (v_decl is null or x.id is distinct from v_decl)) then
    raise exception 'statement line % is under an open bank-line exception; resolve the exception before settling from it', p_line
      using errcode='CLR10',detail='{"reason":"line_excepted"}';
  end if;

  v_match := gen_random_uuid();
  insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin,
      matched_via_rule_id, draft_entry_id, pending_ancillaries, created_by, completed_at)
    values (v_match, c.firm, p_client, v_bank, v_match_status,
      case when p_via_rule is null then 'human' else 'rule' end, p_via_rule,
      case when v_match_status = 'pending' then v_entry else null end,
      -- THE CARRIED ANCILLARY PAYLOAD, on the pending branch only. Every field is one this
      -- call already validated: the charge account and each adjustment account against the
      -- coa (just above), the posting date against the statement period (step 11 of the
      -- read), the adjustment array canonicalised into v_adjs by the same normalisation the
      -- request hash used. complete_pending_match builds from THIS, never from a second
      -- caller opinion -- the checker approves the act the maker made.
      --
      -- charge_cents IS DOMAIN-AWARE and that is not a detail: on the RECEIPT side the charge
      -- rides C-a's expense slot INSIDE the settlement entry (the section header's asymmetry)
      -- and no separate entry is ever minted, so carrying a non-zero charge here would make
      -- complete_pending_match post a charge entry settle would never have posted, and the
      -- group would then fail its own tie. Only the PAYMENT side has an ancillary charge.
      case when v_match_status = 'pending' then jsonb_build_object(
          'domain', v_domain,
          'charge_cents', case when v_domain = 'ap' then v_charge else 0 end,
          'charge_account', case when v_domain = 'ap' and v_charge > 0
                                 then p_charge_account end,
          'adjustments', v_adjs,
          'posting_date', v_pd,
          'memo', v_memo)
        else null end,
      c.actor, case when v_match_status = 'live' then now() else null end);

  begin
    insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id,
        amount_cents, group_status)
      values (c.firm, p_client, v_match, p_line, ln.amount_cents, v_match_status);
  exception when unique_violation then
    raise exception 'statement line % was matched by another transaction while this settlement was being written', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end;

  -- The settlement entry becomes a member ONLY once it is approved. Below the threshold
  -- that is now; at or above it, clara.complete_pending_match writes it after the checker
  -- acts, and until then the group holds the line against draft_entry_id.
  if v_match_status = 'live' then
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      -- v_settle_cents already carries the bank-side sign: + on the receipt side (the entry
      -- DEBITS the bank), - on the payment side (it CREDITS it). No case analysis is needed
      -- and none is written -- the sign convention is the arithmetic.
      values (c.firm, p_client, v_match, v_entry, v_settle_cents, 'live', false);
  end if;
  -- The charge and the difference adjustments join the group ON THE LIVE BRANCH ONLY (as-built
  -- ladder fix 2026-07-31, Codex wave). On the pending branch they have not been created --
  -- they ride pending_ancillaries until clara.complete_pending_match posts them at the flip --
  -- which is what makes "a pending group holds ZERO entry members" a shape the group-tie belt
  -- can assert (tension T1 in the file header, as corrected there).
  if v_match_status = 'live' then
    if v_charge_entry is not null then
      insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
          matched_cents, group_status, posting_date_exception)
        values (c.firm, p_client, v_match, v_charge_entry, -v_charge, 'live', false);
    end if;
    v_i := 0;
    for aj in select (x.elem->>'amount_cents')::bigint as amt
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      v_i := v_i + 1;
      insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
          matched_cents, group_status, posting_date_exception)
        values (c.firm, p_client, v_match, v_adj_entries[v_i], aj.amt, 'live', false);
    end loop;
  end if;

  perform clara._bank_match_audit(c.firm, p_client, v_match,
    case when v_match_status = 'live' then 'settle' else 'settle_pending' end,
    c.actor, null,
    jsonb_build_object('line_id', p_line, 'line_cents', ln.amount_cents,
      'domain', v_domain, 'counterparty_id', v_cp,
      'settlement_entry_id', v_entry, 'settlement_cents', v_settle_cents,
      'settlement_status', v_status,
      'charge_cents', v_charge, 'charge_entry_id', v_charge_entry,
      'adjustments', v_adjs, 'adjustment_entry_ids', to_jsonb(v_adj_entries),
      -- Says out loud that this act posted its ancillaries or carried them: on the pending
      -- branch charge_entry_id is null and adjustment_entry_ids is empty because nothing was
      -- created, not because nothing was asked for.
      'ancillaries_deferred', v_match_status = 'pending',
      'bank_account_id', v_bank, 'account_code', v_coa,
      'posting_date', v_pd, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, v_fn, v_entry,
    jsonb_build_object('client', p_client, 'match_id', v_match, 'line_id', p_line,
      'domain', v_domain, 'settlement_cents', v_settle_cents,
      'status', v_match_status, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_created', p_client, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('match_id', v_match, 'bank_account_id', v_bank,
      'status', v_match_status, 'line_ids', jsonb_build_array(p_line),
      'entry_ids', case when v_match_status='live'
                        then jsonb_build_array(v_entry) else '[]'::jsonb end,
      'draft_entry_id', case when v_match_status='pending' then to_jsonb(v_entry)
                             else 'null'::jsonb end,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', 0));
  return clara._finish_op(c.firm, v_fn, p_op_key,
    jsonb_build_object('match_id', v_match, 'status', v_match_status,
      'entry_id', v_entry, 'entry_status', v_status, 'domain', v_domain,
      'settlement_cents', v_settle_cents,
      'charge_entry_id', v_charge_entry,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'ancillaries_deferred', v_match_status = 'pending',
      'group_id', v_res->>'group_id', 'residue_cents', v_res->>'residue_cents'));
end $core_settle$;
revoke all on function clara._settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,
  bigint,text,jsonb,text,text,text,uuid) from public;

-- =====================================================================================
-- S4.6 -- clara.settle_from_bank_line -- BOTH LIVE OVERLOADS, as wrappers (CoR).
-- =====================================================================================
-- CREATE OR REPLACE on each: the ACL, the owner and the exact public arity survive, so /bank,
-- the RPC layer and x38 see no change at all. The 12-argument form delegates with
-- p_via_rule => null, which is why one core is enough (S4.5's header).
create or replace function clara.settle_from_bank_line(p_client uuid, p_line uuid,
    p_counterparty uuid, p_allocations jsonb, p_memo text, p_posting_date date default null,
    p_charge_cents bigint default 0, p_charge_account text default null,
    p_adjustments jsonb default null, p_attestation text default null,
    p_control_account text default null, p_op_key text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._settle_from_bank_line_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false,
      'fn', 'settle_from_bank_line'),
    p_client, p_line, p_counterparty, p_allocations, p_memo, p_posting_date, p_charge_cents,
    p_charge_account, p_adjustments, p_attestation, p_control_account, p_op_key, null);
end $$;

create or replace function clara.settle_from_bank_line(p_client uuid, p_line uuid,
    p_counterparty uuid, p_allocations jsonb, p_memo text, p_posting_date date,
    p_charge_cents bigint, p_charge_account text, p_adjustments jsonb, p_attestation text,
    p_control_account text, p_op_key text, p_via_rule uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._settle_from_bank_line_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', false,
      'fn', 'settle_from_bank_line'),
    p_client, p_line, p_counterparty, p_allocations, p_memo, p_posting_date, p_charge_cents,
    p_charge_account, p_adjustments, p_attestation, p_control_account, p_op_key, p_via_rule);
end $$;

-- =====================================================================================
-- S4.6A -- clara._wdb_exception_booking_block -- THE SHARED "MAY THIS EXCEPTION BE BOOKED,
-- AND IF NOT WHY" PREDICATE (as-built ladder round 3).
-- =====================================================================================
-- THE MONEY DEFECT IT CLOSES. Design SS4's reopen is right: a LIVE release carrying
-- `resolution_exception_id` MUST put the exception back to `open`, because both booking
-- dispositions assert "this line ends matched" and a resolved exception on an unmatched line
-- has fallen out of every reconciliation term. But `unmatch_bank_match` DOES NOT UN-APPROVE
-- MONEY -- its own one-way lifecycle note says so in as many words, and it must not, because
-- clara.reverse_entry refuses `live_bank_match_present` until the group is released, so a
-- release that demanded the reversal first would wall the human into a reservation nobody can
-- unwind. The consequence, MEASURED on the as-built build: after a live release the exception
-- is open, the first booking is still APPROVED and unreversed, and the composite's only
-- "has this been booked?" test is `ex.status = 'open'`. A second call books it again --
-- 84,000 of bank GL against ONE 42,000 statement line -- and clara.get_bank_reconciliation
-- absorbs the surplus as an outstanding entry side, so the receipt still ties at zero and
-- NOTHING surfaces it. That is the very "one deposit posts twice" WCB-R3 protects, and the
-- pending branch already names it by name (unmatch_bank_match's own draft-withdrawal note).
--
-- WHERE THE LAW LANDS. The release must always proceed (the corridor), so the wall belongs on
-- the BOOKING side: ONE statement line carries ONE live booking, and a second is refused until
-- the first is unwound. That is C-b/C-c's own arithmetic read forwards -- every live group is
-- a term of the identity a receipt certifies, and a booking that no group holds is an
-- outstanding item forever.
--
-- WHY IT IS A SHARED BODY AND NOT AN INLINE TEST -- the walled-corridor lesson, third
-- recurrence. A refusal that names a remedy is asserting something about ANOTHER verb's
-- admission logic, and hand-derived assertions have drifted every single time. This body
-- therefore ASKS the real gates, in clara.reverse_entry's OWN order, and reports the FIRST one
-- that will actually fire: the K-family boundary, "cannot reverse a reversal",
-- clara._bank_live_match_present, clara._subledger_allocated_items_present (the settlement leg
-- ALWAYS lands here -- measured: reverse_entry refuses `allocated_items_present` and the
-- remedy is clara.unallocate_group on the named application_group FIRST), and finally
-- clara._fa_reversal_blocked / clara._wdb_reversal_blocked, which are CALLED rather than
-- re-implemented so their tokens can never diverge from what the human will meet. Two readers,
-- one derivation -- the clara._acct_role_reserved / clara._wdb_suggestion_lines pattern:
--   * clara.resolve_and_book_bank_line ENFORCES it (S4.7, under the locks, before any write);
--   * clara.unmatch_bank_match PROMISES it (S4.9): the release that creates the state reports,
--     in its own receipt and audit row, exactly what it left standing and what will clear it.
-- A message that cannot honestly promise an outcome must not promise it.
--
-- NULL means "this line carries no standing booking" -- which is also the honest answer for a
-- cancelled PARK (its settlement draft is withdrawn, so nothing is approved) and for a booking
-- somebody has already reversed. The park's `resolution_exception_id` survives the cancel by
-- design (site 7), so keying on the ENTRY's liveness rather than on the group's status is what
-- keeps the SS7 parked-cancel drill re-bookable.
--
-- =====================================================================================
-- AS-BUILT LADDER ROUND 4 -- THE SAME LAW, RE-KEYED FROM THE EXCEPTION TO THE LINE, AND
-- MOVED OFF THE VERB ONTO THE ONE ROW EVERY BOOKING DOOR MUST WRITE.
-- =====================================================================================
-- WHAT ROUND 3 GOT WRONG. The law it stated is right and unchanged -- "ONE statement line
-- carries ONE standing booking" -- but it was SPLICED INTO ONE VERB and KEYED ON ONE COLUMN:
--   * only clara.resolve_and_book_bank_line asked it, so the OLDER, ALWAYS-PUBLIC door pair
--     (clara.resolve_bank_line_exception + clara.match_bank_line in one transaction -- the very
--     route S4.7's own high-stakes refusal NAMES as sanctioned) re-booked the released line
--     with nothing in its path: 84,000 of bank GL for one 42,000 statement line, and
--     clara.get_bank_reconciliation absorbing the surplus as an outstanding entry side so the
--     receipt still ties at zero and `blockers` comes back EMPTY;
--   * and the predicate walked `bm.resolution_exception_id = p_exception`, a column ONLY the
--     AF-2 composite ever stamps -- so a booking made through that same two-step pair was
--     invisible to the wall even for the identical exception, and a FRESH exception minted on
--     the line by clara.except_bank_line was a different key entirely.
--
-- THE CENSUS THAT SETTLED WHERE IT BELONGS (measured on the live catalog, not inferred: the
-- set of bodies that INSERT clara.bank_match_line_members is EXACTLY
-- {clara._settle_from_bank_line_core, clara.match_bank_line x2 overloads}, and the set that
-- inserts clara.bank_matches is the same three). Every public door that can put a line into a
-- match -- the composite, the two-step pair, both match_bank_line overloads, both
-- settle_from_bank_line overloads, clara.accept_bank_rule_suggestion (which mints a DRAFT and
-- no match at all) -- reaches a clara.bank_match_line_members INSERT, and every group status
-- transition reaches the SAME ROW as an UPDATE through the fk_bmlm_match_status ON UPDATE
-- CASCADE. That row's deferred constraint trigger is therefore the one place all of them must
-- pass, and S4.11 puts the law there. A per-verb wall has now failed once; this is not a
-- second one.
--
-- WHY THE SUBJECT IS AN *ORPHANED* BOOKING AND NOT MERELY A STANDING ONE. A standing entry
-- that is CURRENTLY held by some other pending/live group has found its home -- two identical
-- deposits on one day, the first entry mis-assigned to this line and then matched to its real
-- one -- and refusing the re-book there would be the walled corridor again, with a remedy
-- ("unmatch that group, then reverse") that is actively WRONG advice. So the row carries
-- `orphaned` (computed through clara._bank_live_match_present, the same shared predicate
-- clara.reverse_entry's own gate uses) and the object carries `blocking`; only orphaned rows
-- compose the remedy, and only `blocking` refuses. Non-blocking rows are still REPORTED,
-- because clara.unmatch_bank_match's receipt is a diagnosis, not a gate.
--
-- =====================================================================================
-- AS-BUILT LADDER ROUND 5 -- THE SUBJECT WAS STILL NARROWER THAN THE INVARIANT, AND THE
-- MISSING CASE WAS THE COMMONEST BOOKING IN THE PRODUCT.
-- =====================================================================================
-- THE INVARIANT, STATED WITHOUT ANY NARROWING: an APPROVED, UNREVERSED entry that a statement
-- line CAUSED TO BE POSTED, and that no live or pending match now holds, BLOCKS any further
-- booking of that line until it is unwound or matched to the line it really belongs to.
--
-- ROUND 4 KEYED "CAUSED" ON `bm.resolution_exception_id is not null` -- "the group discharged
-- an exception" -- with the argument that an ordinary match to a PRE-EXISTING entry is not the
-- harm class. That argument is right and it is kept (see 15e / 14g). But it answered the wrong
-- question: a SETTLEMENT entry is not pre-existing. clara.settle_from_bank_line BUILDS it, out
-- of the line, in the line's own transaction, and no exception is anywhere in the story. So
--     settle_from_bank_line -> unmatch_bank_match -> settle_from_bank_line
-- posted the same bank movement TWICE with nothing at all in its path. MEASURED on the
-- checksum-verified build, x42.af2-15a's own fixture: 84,000 of bank GL for ONE 42,000 deposit,
-- across TWO approved entries, with clara.get_bank_reconciliation absorbing the surplus as an
-- outstanding entry side -- `difference_cents` 0, `can_complete` TRUE, `blockers` EMPTY. The
-- instrument a professional would trust CERTIFIED the doubled state.
--
-- ROUND 5 ANSWERED IT WITH A CLOCK, AND ROUND 7 TOOK THE CLOCK OUT. Round 5's primary test was
-- `je.created_at >= bm.created_at` -- "you cannot match an entry that does not exist yet", with
-- the argument that both columns default to now() and are therefore one comparable stamp.
-- now() IS THE TRANSACTION-START TIMESTAMP, NOT THE INSTANT OF THE WRITE, so that argument only
-- holds INSIDE one transaction. ACROSS transactions it is false, and falsely in the direction
-- that hurts: a booking transaction that opens at 10:00 stamps EVERY row it writes 10:00, so a
-- genuinely pre-existing entry another session committed at 10:01 and this transaction matched
-- at 10:02 reads as `10:01 >= 10:00` -- BORN IN THE BOOKING ACT. MEASURED on this rig (round-7
-- probe, clara_r7f_l2): entry.created_at 22:58:57.691 against a group stamped 22:58:57.658,
-- classified `born_in_the_booking_act`, and after the release `blocking` TRUE with the remedy
-- "reverse that entry" -- an entry that belongs to the NEXT deposit on the same statement and
-- will clear against it. The refusal was wrong AND its first named exit was wrong advice.
-- This is the THIRD sighting of the transaction-start-watermark class in this build; the
-- standing lesson is that a transaction-start timestamp is never an identity or a visibility
-- boundary, and the fix is to remove the class from this body rather than tighten the compare.
--
-- SO "CAUSED" IS EVIDENCED, NOT TIMED. The question "did this group's own act CREATE this
-- entry" has exactly one honest answer in this database: WHAT THE BOOKING ACT ITSELF RECORDED.
-- Five disjuncts, every one of them a structural identity some door wrote, and not one of them
-- a clock:
--   (0) clara._wdb_born_in_booking_act(bm.id, entry) -- the group's OWN clara.bank_match_audit
--       rows, read through the three keys that can only ever name an entry the act CREATED
--       (`settlement_entry_id`, `charge_entry_id`, `adjustment_entry_ids`). This is the
--       replacement for the clock and it covers exactly what the clock was there for: the
--       SETTLEMENT entry clara._settle_from_bank_line_core builds out of the line, which no
--       flag and no column on either row otherwise names. It is RETROACTIVE to 0038 -- every
--       settle since bank matching existed wrote that row in its own transaction -- and the
--       table is append-only and un-truncatable by trigger, so the record cannot be revised
--       into a different past. (`entries` / `entry_id` on the 'match' and 'unmatch' rows name
--       PRE-EXISTING entries and are deliberately NOT read; S4.6C pins the key set.)
--   (1) `bm.resolution_exception_id is not null` -- round 4's subject, kept whole: S4.9's
--       release stamps it even for the two-step pair, which is what makes 14f's chain visible.
--       It is what carries the AF-2 composite's HAND-DRAFT leg, whose entry is born through
--       clara.draft_entry and matched as an ordinary entry.
--   (2) `ent.entry_id = bm.draft_entry_id`      -- the parked settlement's anchored draft.
--   (3) flags->'bank_match'->>'match_id'/'line_id' -- what clara._bank_match_adjustment_entry
--       stamps on every difference adjustment and every settle-core bank charge.
--   (4) SOURCE B, which is not about groups at all: an entry clara.accept_bank_rule_suggestion
--       minted FOR THIS LINE (flags->'bank_rule_suggested'->>'line_id'). It may be in no group
--       whatsoever -- accept mints a DRAFT and matches nothing -- so approving it and then
--       booking the line by any other door doubles the movement. The producer's own dedup law
--       already says an approved-but-unmatched suggestion "is still an outstanding claim on
--       this bank movement"; this is that same sentence enforced against the OTHER doors.
-- The union OVER-BLOCKS rather than under-blocks by construction, which is the correct
-- direction for a money law whose refusal names two real exits.
--
-- THE FALLBACK LAW, STATED OUT LOUD: SILENCE IS NOT EVIDENCE. A group that recorded no created
-- entry, holding an entry that carries no birth stamp, contributes NOTHING to the subject --
-- the classifier never manufactures a causation verdict out of a missing record. Two things
-- force that direction. (a) An entry that PRE-EXISTED the match is the 14g/15f protected case,
-- and a false verdict there is exactly the walled corridor this file exists to prevent -- it is
-- also the shape a pre-0042 row and a hand-forged row both take, so "no marker" must never
-- block. (b) It is safe for money because the set of bodies that can put an entry into a bank
-- match is CLOSED -- measured on the live catalog as
-- {clara._settle_from_bank_line_core, clara.complete_pending_match, clara.match_bank_line x2}
-- -- and every one of them writes its own clara.bank_match_audit row in the same transaction.
-- S4.6C re-measures that closed set at BUILD time and fails the migration if a fifth door
-- appears, so a future writer cannot join the lane silently and be believed by its silence.
--
-- WHAT ROUND 7 DELIBERATELY GAVE UP, NAMED. The clock also caught a case no door records: a
-- CALLER that drafts an entry, approves it and matches it to the line in ONE transaction. It is
-- not re-covered, and the reason is that it was never a stated invariant -- the SAME caller
-- doing the same three acts across TWO transactions produces the identical end state and has
-- always been admitted (`created_at` older than the group). A boundary that moves with where
-- the caller put its COMMIT is not a law; the doors' own records are. Every act that both
-- creates an entry AND books the line -- the settle core, the flip, both match overloads, the
-- AF-2 composite, the suggestion producer -- is covered by (0)..(4) above.

-- =====================================================================================
-- S4.6A0 -- clara._wdb_born_in_booking_act -- THE ONE PLACE THE STRUCTURAL QUESTION IS ASKED
-- (as-built ladder round 7; WDB-R1 -- the CLASS, not the symptom).
-- =====================================================================================
-- "Did the act that wrote THIS GROUP bring THIS ENTRY into existence?" It is asked twice in
-- the subject below -- once to admit the row and once to label WHY -- and a body that answered
-- the two by two copies of an expression is a body whose refusal and whose explanation can
-- drift. One function, called from both.
--
-- THE EVIDENCE IS clara.bank_match_audit, and it is evidence rather than inference for three
-- measured reasons. (1) Every body that can put an entry into a bank match writes a row there
-- IN THE SAME TRANSACTION as the group -- so the record commits if and only if the booking
-- does, and a deferred belt firing at COMMIT already sees it. (2) The table carries
-- t_bank_match_audit_append_only and t_bank_match_audit_no_truncate (0038), so no later act can
-- revise or erase what an act said it created -- which is precisely the property a clock read
-- off two mutable-by-VACUUM-or-NTP sources never had. (3) It reaches back to 0038, so nothing
-- has to be backfilled -- and nothing COULD be: clara._tf_entry_immutable's approved->approved
-- allowset is {reversed_by, reversal_reason, updated_at}, so `flags` on an APPROVED entry
-- cannot be stamped after the fact by anybody, migration included (measured on this rig).
--
-- ONLY THE THREE CREATION KEYS ARE READ. `settlement_entry_id`, `charge_entry_id` and
-- `adjustment_entry_ids` name an entry the recording act BUILT, on every action that writes
-- them. The sibling keys that name PRE-EXISTING entries -- 'match'.`entries`,
-- 'unmatch'.`entries`, 'complete'.`entry_id` (the group's own draft_entry_id, which disjunct
-- (2) already owns) -- are NOT read, because reading them would turn every ordinary match into
-- a causation verdict and re-open the walled corridor from the other side. S4.6C pins both the
-- key set and the writer set at build time.
--
-- jsonb_typeof is asked before `?` deliberately: `?` on an OBJECT tests key existence, so an
-- adjustment_entry_ids that a future writer shaped as an object would silently answer a
-- different question. A money guard does not get to be approximately typed.
create function clara._wdb_born_in_booking_act(p_match uuid, p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $bibn$
  select p_match is not null and p_entry is not null and exists (
    select 1 from clara.bank_match_audit a
     where a.match_id = p_match
       and (a.payload ->> 'settlement_entry_id' = p_entry::text
         or a.payload ->> 'charge_entry_id' = p_entry::text
         or (jsonb_typeof(a.payload -> 'adjustment_entry_ids') = 'array'
             and a.payload -> 'adjustment_entry_ids' ? p_entry::text)));
$bibn$;
revoke all on function clara._wdb_born_in_booking_act(uuid,uuid) from public;

create function clara._wdb_line_booking_block(p_line uuid, p_exclude_match uuid default null,
    p_exception uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $bblk$
declare
  r record;
  v_rows jsonb := '[]'::jsonb; v_steps text[] := '{}'::text[];
  v_gate text; v_calls jsonb; v_groups uuid[]; v_detail text; v_g uuid;
  v_live boolean; v_orphans int := 0;
  -- ROUND 5: the group ACTUALLY holding a non-orphaned entry (see the live branch below).
  v_hold uuid;
  -- ROUND 8 (lane M3): the advance family's own two answers about this booking -- the reversal
  -- walls only the MIRROR's date and instant can decide (`dated`), and whether releasing it is
  -- one-way at the line's own date. Both are ASKED of the bodies that own them; nothing here
  -- re-derives a wall or a cap. See the two call sites for the measured reason each exists.
  v_advd jsonb; v_advrel jsonb;
begin
  if p_line is null then return null; end if;

  -- EVERY entry THIS LINE CAUSED TO EXIST, from either of the two places such an entry can be
  -- found: attached to a group that has held the line (source A -- the entry MEMBERS, plus the
  -- anchored settlement draft, since a parked group holds no entry members at all), or carrying
  -- the line's own birth stamp with no group at all (source B). Entry status is the test, not
  -- the group's state.
  --
  -- WHAT THE SUBJECT MUST NOT SWALLOW -- the walled-corridor reading, and the reason the causal
  -- test is EVIDENCE-based rather than "any entry a group on this line ever held". A human
  -- who matches line L to a REAL pre-existing entry E, realises E belongs to a different
  -- deposit, unmatches, and then books L properly must NOT be told "reverse E first": E is a
  -- genuine outstanding item that will clear against its own statement line, and the only honest
  -- remedy would be "wait for a statement that has not arrived". NO GROUP EVER RECORDED CREATING
  -- E and no door ever stamped it, so no disjunct here reaches it -- and, round 7, that stays
  -- true however long the matching transaction was open and whatever the two clocks say.
  -- x42.af2-14g and 15f hold that line; x42.r7-af2-1 holds the long-transaction shape.
  --
  -- AND WHY THE EXCEPTION STAMP STAYS AS ONE DISJUNCT rather than being replaced: it is the only
  -- evidence that survives for a booking made through the older two-step pair
  -- (clara.resolve_bank_line_exception + clara.match_bank_line), whose entry may well pre-date
  -- its group. S4.9's release STAMPS the exception it is about to reopen, on the same UPDATE,
  -- before erasing the evidence from the exception row -- so every group that ever discharged an
  -- exception carries the identity by the time anyone can re-book, and
  -- _tf_bank_matches_resolution_exception_immutable forbids ever revising it. Round 4 built that
  -- and it is kept whole; round 5 only stopped it being the ONLY thing asked.
  --
  -- `p_exclude_match` is the group the CALLER is writing right now -- the belt is deferred and
  -- re-queries at COMMIT, by which time the new group's own entries exist, so without the
  -- exclusion every first booking would block itself.
  -- DISTINCT ON (e.id): one entry can be a member of two groups on the same line over time, and
  -- reporting it twice would compose the remedy twice. A group-backed sighting ORDERS FIRST
  -- (`nulls last`) because it can compose a richer remedy than a bare line stamp.
  for r in
    select distinct on (e.id)
           s.match_id, s.match_status, e.id as entry_id,
           e.is_opening_balance, e.reversal_of, s.cause
      from (
        -- SOURCE A -- an entry a group that HELD THIS LINE brought into existence. The five
        -- disjuncts are the section header's (0)..(3); every one of them is a record some door
        -- WROTE, and none of them is a clock.
        --
        -- THE CAUSE LADDER IS ORDERED SO THE STRONGEST EVIDENCE NAMES THE ROW. The act's own
        -- creation record and the door's own birth stamp both say the same thing --
        -- `born_in_the_booking_act`, the name /bank, four rounds of cells and the round-5
        -- receipts already carry -- so they share the label rather than teaching a human a
        -- second word for one state. `anchored_settlement_draft` sits BELOW them and is now
        -- what a group with no creation record at all falls back to (the forged / pre-lane
        -- shape), which is exactly where a weaker name belongs. Round 5's
        -- `match_born_ancillary` is retired: it existed to describe an ancillary sighted
        -- through a group that was not its own, and that is the booking act's own record
        -- speaking, not a lesser fact.
        --
        -- WITHIN each arm the COLUMN tests are written before the function call, and that is
        -- a cost decision, not a taste one: this body runs on every line-member write, and
        -- clara._wdb_born_in_booking_act is SECURITY DEFINER (so it cannot be inlined) and
        -- costs an index probe of clara.bank_match_audit per candidate pair. OR short-circuits
        -- left to right, so the flag stamp -- which covers every ancillary -- answers first and
        -- the record is asked only for the settlement entries nothing else names.
        select bm.id as match_id, bm.status as match_status, ent.entry_id,
               case when je0.flags -> 'bank_match' ->> 'match_id' = bm.id::text
                      or je0.flags -> 'bank_match' ->> 'line_id' = p_line::text
                      or clara._wdb_born_in_booking_act(bm.id, ent.entry_id)
                         then 'born_in_the_booking_act'
                    when ent.entry_id = bm.draft_entry_id then 'anchored_settlement_draft'
                    else 'exception_discharging_booking' end as cause
          from clara.bank_matches bm
          join clara.bank_match_line_members lm on lm.match_id = bm.id and lm.line_id = p_line
          cross join lateral (
            select m.entry_id from clara.bank_match_entry_members m where m.match_id = bm.id
            union
            select bm.draft_entry_id where bm.draft_entry_id is not null
          ) as ent(entry_id)
          join clara.journal_entries je0 on je0.id = ent.entry_id
         where (p_exclude_match is null or bm.id <> p_exclude_match)
           -- The five column tests first, the RECORD last -- same set, cheapest evidence
           -- asked first (see the cause ladder's note just above).
           and (bm.resolution_exception_id is not null
                or ent.entry_id = bm.draft_entry_id
                -- TEXT comparison, never a ::uuid cast: flags are caller-shaped jsonb on some
                -- paths and a malformed value must not turn a money guard into a cast error.
                or je0.flags -> 'bank_match' ->> 'match_id' = bm.id::text
                or je0.flags -> 'bank_match' ->> 'line_id' = p_line::text
                or clara._wdb_born_in_booking_act(bm.id, ent.entry_id))
        union all
        -- SOURCE B -- an entry a bank door stamped with THIS LINE at birth and that may be in
        -- no group at all.
        --
        -- ALL THREE OF THE PRODUCER INDEX'S PREDICATE TERMS ARE RESTATED HERE, and that is a
        -- correctness-preserving MEASUREMENT, not a style choice: uq_je_bank_rule_suggested_line
        -- is PARTIAL on `flags ? 'bank_rule_suggested' AND status in ('draft','approved') AND
        -- reversed_by is null`, and with only the first term stated the planner cannot use it --
        -- measured on this rig with enable_seqscan=off, which still chose a SEQ SCAN OF
        -- clara.journal_entries. This body runs on EVERY line-member write, so an unindexed
        -- probe here would put a whole-journal scan behind every bank match in production. The
        -- two added terms are a strict superset of the outer filter (`approved` + unreversed),
        -- so nothing is admitted or excluded by stating them.
        select null::uuid, null::text, je1.id, 'line_stamped_at_birth'
          from clara.journal_entries je1
         where je1.flags ? 'bank_rule_suggested'
           and je1.status in ('draft','approved') and je1.reversed_by is null
           and je1.flags -> 'bank_rule_suggested' ->> 'line_id' = p_line::text
      ) as s(match_id, match_status, entry_id, cause)
      join clara.journal_entries e on e.id = s.entry_id
     where e.status = 'approved' and e.reversed_by is null
     order by e.id, s.match_id nulls last
  loop
    -- Computed ONCE and reused by the gate chain below, so "is this entry orphaned" and "is
    -- clara.reverse_entry going to refuse live_bank_match_present" can never disagree.
    v_live := clara._bank_live_match_present(r.entry_id);
    if not v_live then v_orphans := v_orphans + 1; end if;
    v_gate := null; v_calls := '[]'::jsonb; v_groups := null;
    v_advd := null; v_advrel := null;
    if r.is_opening_balance then
      v_gate := 'opening_entry_k_family_only';
      if not v_live then
        v_steps := v_steps || format('entry %s is an opening entry -- unwind it through the K-family, not clara.reverse_entry', r.entry_id);
      end if;
    elsif r.reversal_of is not null then
      v_gate := 'entry_is_a_reversal';
      if not v_live then
        v_steps := v_steps || format('entry %s is itself a reversal mirror and clara.reverse_entry refuses it (cannot reverse a reversal)', r.entry_id);
      end if;
    elsif v_live then
      -- NOT ORPHANED, and therefore NOT blocking: this entry is currently held by another
      -- pending/live group, i.e. it has found the line it really belongs to. It is still
      -- reported (a release's receipt is a diagnosis), and the remedy chain deliberately does
      -- NOT name it -- telling a human to unmatch a group that is correct today is the walled
      -- corridor, not a fix.
      --
      -- ROUND 5: the group named here is THE ONE ACTUALLY HOLDING THE ENTRY, read back rather
      -- than carried over from the sighting. A SOURCE B row has no match_id at all, and a
      -- source A row's group is the RELEASED one -- neither is the group a human would have to
      -- unmatch, and a remedy naming the wrong id (or null) is a remedy that cannot be run.
      select min(mm.match_id::text)::uuid into v_hold
        from clara.bank_match_entry_members mm
       where mm.entry_id = r.entry_id and mm.group_status in ('pending','live');
      if v_hold is null then
        select min(bm2.id::text)::uuid into v_hold from clara.bank_matches bm2
         where bm2.draft_entry_id = r.entry_id and bm2.status = 'pending';
      end if;
      v_gate := 'live_bank_match_present';
      v_calls := jsonb_build_array(
        jsonb_build_object('fn', 'clara.unmatch_bank_match', 'match_id', v_hold),
        jsonb_build_object('fn', 'clara.reverse_entry', 'entry_id', r.entry_id));
    elsif clara._subledger_allocated_items_present(r.entry_id) then
      -- The application groups that actually still hold a net allocation against this entry's
      -- own open items -- the exact argument clara.unallocate_group takes. Named, not implied:
      -- "unallocate first" is useless to a human who cannot see WHICH group.
      select array_agg(distinct a.application_group order by a.application_group)
        into v_groups
        from clara.open_items i
        join clara.open_item_allocations a on a.item_id = i.id
       where i.entry_id = r.entry_id
         and coalesce((select sum(a2.amount_cents) from clara.open_item_allocations a2
                       where a2.item_id = i.id), 0) <> 0;
      v_gate := 'allocated_items_present';
      v_calls := '[]'::jsonb;
      foreach v_g in array coalesce(v_groups, '{}'::uuid[]) loop
        v_calls := v_calls || jsonb_build_array(
          jsonb_build_object('fn', 'clara.unallocate_group', 'group_id', v_g));
        v_steps := v_steps || format('clara.unallocate_group(group => %s)', v_g);
      end loop;
      v_calls := v_calls || jsonb_build_array(
        jsonb_build_object('fn', 'clara.reverse_entry', 'entry_id', r.entry_id));
      v_steps := v_steps || format('clara.reverse_entry(entry => %s)', r.entry_id);
    else
      -- THE TWO REVERSAL WALLS ARE ASKED, NEVER RE-DERIVED. Both raise; both are the very
      -- bodies clara.reverse_entry calls, so whatever they say here is what the human meets.
      --
      -- THE ADMITTED STEP IS COMPOSED BELOW, NOT HERE [round 8, lane M3]. It used to be written
      -- inside this try, which was correct while these two were the only walls: a THIRD wall
      -- asked afterwards then appended its refusal to a remedy chain that had already promised
      -- the call would work, and the receipt said both things at once (measured on the first
      -- run of this fix). The remedy is now stated ONCE, after every wall has answered.
      begin
        perform clara._fa_reversal_blocked(r.entry_id);
        perform clara._wdb_reversal_blocked(r.entry_id);
      exception when others then
        get stacked diagnostics v_detail = pg_exception_detail;
        v_gate := 'reversal_blocked';
        begin
          v_gate := coalesce(nullif(btrim(coalesce(v_detail, '')), '')::jsonb->>'reason',
                             'reversal_blocked');
        exception when others then v_gate := 'reversal_blocked';
        end;
        v_steps := v_steps || format('clara.reverse_entry(entry => %s) will refuse %s -- that booking must be unwound through the door that owns it first', r.entry_id, v_gate);
      end;
      -- ---------------------------------------------------------------------------
      -- ...AND THE MIRROR-DATED ADVANCE WALLS THE PAIR ABOVE CANNOT SEE [round 8, lane M3; the
      -- COUNT corrected at round 10, Codex r10 finding 4 -- this paragraph still said "TWO
      -- MORE" after round 9 made it three, and a stale count in the one comment a reader
      -- consults about completeness is how the next author concludes the set is closed]. The
      -- pair above raises the walls that are true whenever they are asked. THREE MORE decide a
      -- reversal and are properties of THE MIRROR -- which enrolment generation is in force at
      -- its approve instant, whether its posting date precedes the movement it unwinds, and
      -- (round 9's arm (1c)) whether the leg it unwinds carried any register act at all --
      -- so clara.reverse_entry cannot raise them at all and clara._adv_reversal_blocked
      -- deliberately does not (a high-stakes mirror is approved hours later, by which time a
      -- lawful re-enrolment may have made it admissible; raising early would wall THAT caller
      -- in). MEASURED before this line existed: a booking on a RETIRED enrolment reported
      -- `reverse_blocked_by: null` with `remedy_calls:[clara.reverse_entry]`, and running
      -- exactly that call refused CLR40 advance_movement_unregistered. The report asserted an
      -- admission it had never asked about, and a surface rendering remedy_calls as buttons
      -- offered a button that cannot work.
      --
      -- IT IS AN ANSWER, NOT A RAISE, and it comes from clara._adv_reversal_admission -- the
      -- one body clara._adv_on_approve's GUARD III ENFORCES. Its `dated` half is evaluated at
      -- the mirror clara.reverse_entry WOULD mint (that body asks the correction-date authority
      -- for the date, exactly as reverse_entry does), so the token here is the token the human
      -- will meet, by construction rather than by agreement.
      --
      -- IT RUNS ONLY WHERE THE PAIR ABOVE PASSED. A booking already blocked has its gate and its
      -- remedy; overwriting them with a second, later wall would tell a human to fix the wrong
      -- thing first. And the whole probe costs two index scans on an entry with no advance rows,
      -- which is every entry in the product bar the advance lane's own.
      --
      -- IT IS NOT WRAPPED IN A HANDLER, AND THAT IS THE POINT OF ITS SHAPE. The pair above is
      -- wrapped because those two bodies RAISE BY DESIGN -- that is how they answer. This one
      -- and the release probe below RETURN, always, and neither mints anything; so there is no
      -- by-design exception to catch, and a handler here would only hide a genuine defect. That
      -- matters at THIS site more than most: this body runs inside S4.11's DEFERRED belt, where
      -- an escaping error aborts a lawful bank match. Neither call may ever be given a raising
      -- arm without moving it inside a handler first. Note also that nothing added here can
      -- change `blocking` -- that verdict is `v_orphans`, computed from entry status alone --
      -- so the belt's admission is exactly what it was; what changed is only what the receipt
      -- can SAY.
      if v_gate is null then
        v_advd := clara._adv_reversal_admission(r.entry_id) -> 'dated';
        if (v_advd ->> 'admitted')::boolean then
          -- ADMITTED IS REPORTED AS SILENCE, deliberately: `advance_reversal` on the row means
          -- "a mirror-dated advance wall stands here", and a key that was also present, saying
          -- nothing, on every ordinary booking would train a reader to skip it.
          v_advd := null;
        else
          v_gate := v_advd ->> 'reason';
          v_steps := v_steps || format('clara.reverse_entry(entry => %s) mints a mirror the staff-advance register refuses at APPROVAL (%s) -- %s', r.entry_id, v_gate, v_advd ->> 'message');
        end if;
      end if;
      -- THE REMEDY, ONCE, AND ONLY IF EVERY WALL ADMITTED IT. `v_calls` is what a surface
      -- renders as a BUTTON, so it is composed at the one point where nothing is left to ask.
      if v_gate is null then
        v_calls := jsonb_build_array(
          jsonb_build_object('fn', 'clara.reverse_entry', 'entry_id', r.entry_id));
        v_steps := v_steps || format('clara.reverse_entry(entry => %s)', r.entry_id);
      end if;
      -- ...AND, WHETHER OR NOT THE RELEASE IS ADMITTED, WHETHER IT IS ONE-WAY. A release
      -- receipt that names clara.reverse_entry and stops there is asserting that the line goes
      -- back to being bookable. MEASURED: for a booking carrying a staff-advance application it
      -- does not, at that line's own date -- the register's correction is dated at the mirror,
      -- so the historic outstanding never returns and the temporal cap refuses the re-book,
      -- while every date the cap allows is refused by the bank period gate. The statement is
      -- DERIVED from the cap's own body (clara._adv_over_application, which
      -- clara._adv_assert_proposal enforces), never predicted here -- and it is null for every
      -- booking that carries no advance application at all.
    end if;
    -- ...AND, ON EVERY BRANCH, WHETHER RELEASING THIS BOOKING IS ONE-WAY. A release receipt
    -- that names clara.reverse_entry -- alone, or after clara.unmatch_bank_match, or after an
    -- unallocate chain -- is asserting that the line goes back to being bookable. MEASURED: for
    -- a booking carrying a staff-advance application it does not, at that line's own date. The
    -- register's correction is dated at the MIRROR, so the historic outstanding never returns
    -- and the temporal cap refuses the re-book; every date the cap allows is then refused by the
    -- bank period gate, and until round 8 the composite had no argument to acknowledge it. The
    -- statement is DERIVED from the cap's own body (clara._adv_over_application, the same one
    -- clara._adv_assert_proposal enforces), never predicted here, and it is NULL for every
    -- booking that carries no advance application at all -- which is one index probe on
    -- ix_staff_advance_applications_entry for every ordinary bank booking in the product.
    --
    -- IT IS REPORTED ON EVERY BRANCH, INCLUDING THE NON-BLOCKING ONES, because a human reading a
    -- release receipt is deciding whether to unwind AT ALL -- and "this is one-way" is exactly
    -- the fact that decides it. A gate is not a precondition for wanting to know.
    v_advrel := clara._adv_release_one_way(r.entry_id);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'entry_id', r.entry_id, 'match_id', r.match_id, 'match_status', r.match_status,
      'orphaned', not v_live,
      -- ROUND 5: WHY this entry is the line's to answer for. A refusal that cannot say what
      -- made an entry the line's own is a refusal a human cannot argue with, and it is also
      -- how a future round tells an over-block from a real one.
      'caused_by', r.cause,
      'reverse_blocked_by', v_gate, 'remedy_calls', v_calls,
      -- ROUND 8 (lane M3): the advance family's two answers, on the row they are about.
      -- `advance_reversal` is present ONLY when a mirror-dated advance wall is what blocks
      -- (it carries that wall's own remedy keys, so a surface can act rather than parse
      -- prose); `advance_release` is present whenever this booking carries an advance
      -- application at all, blocked or not, because whether the release is REVERSIBLE is a
      -- different question from whether it is ADMITTED.
      'advance_reversal', v_advd, 'advance_release', v_advrel));
  end loop;

  if jsonb_array_length(v_rows) = 0 then return null; end if;
  return jsonb_build_object(
    -- THE TOKEN IS DELIBERATELY UNCHANGED although round 5's subject is no longer only about
    -- exceptions. It is the name a human, /bank and four rounds of cells already know for this
    -- one state, and this file's own rule is that a human must not learn two names for it.
    -- `caused_by` on each row is where the widened subject explains itself.
    'reason', 'exception_booking_outstanding',
    'exception_id', p_exception,
    'line_id', p_line,
    -- THE ONE KEY EVERY ENFORCER READS. A non-null answer is a REPORT; `blocking` is the
    -- VERDICT, and it is derived here so the composite (S4.7), the belt (S4.11) and the
    -- release's receipt (S4.9) cannot each decide it differently.
    'blocking', (v_orphans > 0),
    'bookings', v_rows,
    'remedy', array_to_string(v_steps, '; '));
end $bblk$;
revoke all on function clara._wdb_line_booking_block(uuid,uuid,uuid) from public;

-- THE EXCEPTION-KEYED READER. Signature preserved for S4.7's eager refusal, whose subject
-- genuinely IS an exception (the caller names one): an exception IS a line, so it delegates
-- rather than owning a second derivation. NULL for a null / unknown exception, exactly as
-- before. ROUND 5: S4.9's release NO LONGER goes through here -- a plain settlement release
-- has no exception to key on and reported nothing, so it reads the line-keyed body directly
-- (and S4.9's own postcheck now REFUSES this wrapper's name in that body).
create function clara._wdb_exception_booking_block(p_exception uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._wdb_line_booking_block(x.line_id, null, x.id)
    from clara.bank_line_exceptions x where x.id = p_exception;
$$;
revoke all on function clara._wdb_exception_booking_block(uuid) from public;

-- =====================================================================================
-- S4.6B -- clara._wdb_assert_line_booking_lawful -- THE SINGLE ENFORCEMENT BODY.
-- =====================================================================================
-- ONE function, called from ONE place (S4.11's line-member arm), stating TWO halves of one
-- invariant. Both halves were previously enforced on only ONE of the two tables they are
-- about, which is exactly why both were reachable:
--
--   P1 -- AT MOST ONE STANDING BOOKING PER LINE. A line may not enter a NEW match, nor complete
--        a parked one, while a booking previously made ON IT is still approved, unreversed and
--        orphaned.
--
--        ROUND 5 REMOVED THE CORRIDOR GATE. Round 4 asked P1 only when the line carried an
--        exception that was OPEN or resolved as matched_booking / written_off_adjustment, on
--        the reading that "outside that corridor clara.match_bank_line never CREATES an entry".
--        That reading is false twice over: clara.settle_from_bank_line creates one on a line
--        that need never have been excepted at all, and clara.match_bank_line creates one per
--        p_adjustments element. Worse, `bank_corrective_line` is the THIRD ratified
--        disposition, so ONE call to the always-public clara.resolve_bank_line_exception moved
--        a line OUT of the corridor and the law stopped being asked at all -- measured, both
--        halves, as 84,000 of bank GL on one 42,000 line with the receipt still tying (see
--        S4.6A's header). A GATE NARROWER THAN THE INVARIANT IS STILL A POINT-FIX, even when
--        the enforcement behind it is perfectly placed. It is now UNCONDITIONAL, and what keeps
--        ordinary re-matching lawful is the SUBJECT (S4.6A) and the `orphaned` test -- which is
--        where that judgement belonged all along.
--
--        ...AND IT IS ASKED ON THE FLIP TOO, not only on INSERT. Round 4 asked on INSERT alone
--        ("an INSERT is the only event that puts a line into a group it was not already in"),
--        which is true and still leaves a hole: a PARKED group's line member is written at park
--        time and only UPDATED at the flip, so a blocking orphan that appears DURING the park
--        was never re-asked and clara.complete_pending_match posted straight over it. The
--        reachable constructor is measured in x42.af2-15d. The predicate is therefore "is this
--        write BOOKING the line" -- an INSERT, or a cascade into 'live' -- and NOT "is it an
--        INSERT". A release (live->unmatched) and a cancel (pending->unmatched) are the only
--        other transitions this row sees, and they REMOVE a booking; they must always proceed,
--        which is the corridor S4.6A's header names.
--
--   P2 -- THE EXCEPTION AND THE MATCH MAY NEVER DISAGREE ABOUT WHETHER THE LINE IS BOOKED.
--        `matched_booking` and `written_off_adjustment` both assert "this line ends matched",
--        and the belt's own exception arm has refused `disposition_unbooked` since 0040 -- but
--        that arm is a trigger on clara.bank_line_exceptions, and the writer that can break the
--        predicate is clara.unmatch_bank_match, which writes clara.bank_matches. A two-table
--        predicate enforced on one table is not enforced. Asked on INSERT *and* UPDATE, so the
--        release cascade cannot leave the pair inconsistent; the token and the detail shape are
--        the belt arm's own, byte-for-byte, because a human must not learn two names for one
--        state.
create function clara._wdb_assert_line_booking_lawful(p_line uuid, p_match uuid, p_op text,
    p_group_status text default null)
  returns void language plpgsql stable security definer
  set search_path = clara, pg_temp as $abl$
declare
  v_booked uuid; v_block jsonb;
begin
  if p_line is null then return; end if;
  -- P2's ANTECEDENT ONLY: which resolved-with-booking exception on this line is asserting that
  -- the line ends matched. Round 4 read a `v_corridor` flag out of this same query and used it
  -- to gate P1; round 5 deleted that flag rather than widening it, because P1's subject is the
  -- thing that decides what is lawful and an exception's disposition never was.
  select min(case when x.status = 'resolved'
                   and x.resolution_disposition in ('matched_booking','written_off_adjustment')
                  then x.id::text end)::uuid
    into v_booked
    from clara.bank_line_exceptions x where x.line_id = p_line;

  -- IS THIS WRITE BOOKING THE LINE? An INSERT puts the line into a group; a cascade into 'live'
  -- is clara.complete_pending_match executing a parked one. Those are the two events that can
  -- ADD a bank movement to this line. Everything else this row sees -- live->unmatched (the
  -- release) and pending->unmatched (the cancel) -- REMOVES one and must always proceed.
  if p_op = 'INSERT' or p_group_status = 'live' then
    v_block := clara._wdb_line_booking_block(p_line, p_match, null);
    if v_block is not null and coalesce((v_block->>'blocking')::boolean, false) then
      -- TWO LAWFUL EXITS, both named, because a refusal that offers one is a wall when that one
      -- is the wrong act: unwind the standing booking, OR match it to the statement line it
      -- really belongs to (which makes it no longer orphaned and lifts this refusal).
      raise exception 'statement line % already carries a booking that nobody has unwound; a second booking would post the same bank movement twice. Either unwind it -- % -- or match that entry to the statement line it really belongs to', p_line, coalesce(nullif(v_block->>'remedy',''), '(no remedy composed)')
        using errcode='CLR10', detail=v_block::text;
    end if;
  end if;

  if v_booked is not null
     and not exists (select 1 from clara.bank_match_line_members lm
                       join clara.bank_matches bm on bm.id = lm.match_id
                      where lm.line_id = p_line and bm.status = 'live') then
    raise exception 'bank line exception % is resolved as a booking disposition but its line is in no live match; the booking must land in the same transaction', v_booked
      using errcode='CLR10',
        detail=jsonb_build_object('reason','disposition_unbooked','exception_id',v_booked,
          'line_id',p_line,'disposition','matched_booking_or_written_off',
          'match_id',p_match)::text;
  end if;
end $abl$;
revoke all on function clara._wdb_assert_line_booking_lawful(uuid,uuid,text,text) from public;

-- The law's own access path. clara.bank_line_exceptions carries a partial unique index on
-- line_id for OPEN rows only (uq_ble_line_open), so a by-line read that must see RESOLVED rows
-- had no index at all; the assert above runs on every line-member write.
create index if not exists ix_ble_line on clara.bank_line_exceptions (line_id);

-- =====================================================================================
-- S4.6C -- THE STRUCTURAL PREMISE, ASSERTED RATHER THAN ASSUMED (as-built ladder round 7;
-- this block REPLACES round 5's clock premise, which is the thing round 7 deleted).
-- =====================================================================================
-- ROUND 5 PUT A CENSUS HERE AND IT ASSERTED THE WRONG PREMISE. It proved that both
-- `created_at` columns default to now() and that no body writes them by hand -- both TRUE, and
-- neither of them the premise the law actually needed. now() is the TRANSACTION-START stamp, so
-- "both columns are one clock" says nothing at all about two rows written by two DIFFERENT
-- transactions, which is exactly the pair the law compared. A census that measures a true fact
-- next to the load-bearing one is worse than none: it reads like a proof. Round 7's census
-- measures the premises the STRUCTURAL law rests on, one assertion per premise:
--
--   (1) THE LAW NO LONGER READS A CLOCK. If any future edit puts a created_at comparison back
--       into clara._wdb_line_booking_block, the migration fails here rather than shipping the
--       third instance of a class this build has now paid for three times.
--   (2) THE LAW DOES ASK THE STRUCTURAL QUESTION, in BOTH places it must -- the admission
--       predicate AND the `caused_by` label. An edit that drops one and keeps the other makes a
--       refusal whose explanation disagrees with the refusal.
--   (3) THE EVIDENCE CANNOT BE REVISED. clara.bank_match_audit's append-only and no-truncate
--       triggers must both still be ENABLED, and no clara body may UPDATE or DELETE that table.
--       The whole reason this record beats a timestamp is that nothing can rewrite it; a
--       DISABLE TRIGGER somewhere upstream would turn provenance into an opinion.
--   (4) THE THREE CREATION KEYS STAY CREATION KEYS. `settlement_entry_id`, `charge_entry_id`
--       and `adjustment_entry_ids` are read as "this act BUILT that entry". MEASURED on the
--       live catalog, the only bodies that name them are the booking doors themselves
--       ({_settle_from_bank_line_core} / {+complete_pending_match} / {+match_bank_line x2}).
--       A NEW body naming one of those keys is a body that could make a PRE-EXISTING entry
--       look created -- the walled corridor, re-opened from the other side -- so it must come
--       to S4.6A and be adjudicated, not merely compile.
--
-- The source scans FAIL CLOSED on an unreadable body, the same shape tail 11 uses.
do $s4_6c$
declare
  r record; v_src text; v_def text; v_n int; v_bad text := '';
  v_keys text[] := array['settlement_entry_id','charge_entry_id','adjustment_entry_ids'];
  -- The doors MEASURED (this rig, post-S4.6) as the only bodies that name a creation key.
  -- complete_pending_match is listed pre-splice; S4.8 rewrites the body but not this property,
  -- and the LATE half of this census (just before S4.14) re-measures it after every splice.
  v_ok_key_writers text[] := array['_settle_from_bank_line_core','complete_pending_match',
                                   'match_bank_line'];
  v_k text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara._wdb_line_booking_block(uuid,uuid,uuid)'::regprocedure;
  if v_def is null then
    raise exception '0042 S4.6C: clara._wdb_line_booking_block is gone -- fails closed'
      using errcode = 'CLR10';
  end if;

  -- (1) NO CLOCK. The normalised body must contain no comparison of the two created_at
  -- columns in either direction, and no bare `bm.created_at` at all.
  --
  -- COMMENTS ARE NOT STRIPPED HERE, and that is deliberate rather than sloppy: this test is
  -- "does the body TALK ABOUT comparing the two stamps at all", and a comment that still
  -- explains the deleted comparison is a comment a future author will re-implement from.
  -- The cost is a possible false alarm; the message says exactly what to do about it, and a
  -- failed migration is the cheap direction for a money law that has now been wrong twice.
  v_src := lower(regexp_replace(v_def, '\s+', ' ', 'g'));
  if v_src ~ 'created_at *[<>]' or v_src ~ 'bm\.created_at' then
    raise exception '0042 S4.6C: clara._wdb_line_booking_block compares created_at again. now() is the TRANSACTION-START stamp on both tables, so that comparison classifies an entry ANOTHER SESSION committed during a long booking transaction as born inside the act -- measured, and it produced a blocking orphan verdict with "reverse it" as the remedy for an entry belonging to a different statement line. Derive causation from what the booking act RECORDED (clara._wdb_born_in_booking_act), never from a clock.'
      using errcode = 'CLR10';
  end if;

  -- (2) ...AND IT DOES ASK THE STRUCTURAL QUESTION, TWICE: once to admit the row into the
  -- subject and once to label WHY. Both call sites, or the refusal and its explanation drift.
  -- Counted over the same un-stripped definition, so the body's own prose must name the
  -- function WITHOUT its opening paren (the note beside the cause ladder does exactly that).
  v_n := (length(v_def) - length(replace(v_def, 'clara._wdb_born_in_booking_act(', '')))
         / length('clara._wdb_born_in_booking_act(');
  if v_n <> 2 then
    raise exception '0042 S4.6C: clara._wdb_line_booking_block calls clara._wdb_born_in_booking_act % time(s), expected exactly 2 (the admission predicate and the caused_by label). One without the other is a refusal that cannot explain itself.', v_n
      using errcode = 'CLR10';
  end if;

  -- (3) THE EVIDENCE IS IMMUTABLE. Both guards present AND enabled ('D' is disabled).
  for r in select t.tgname::text as nm, t.tgenabled as en
             from pg_trigger t where t.tgrelid = 'clara.bank_match_audit'::regclass
              and not t.tgisinternal loop
    if r.en = 'D' then
      raise exception '0042 S4.6C: trigger % on clara.bank_match_audit is DISABLED -- the one-standing-booking law reads that table as the booking act''s own unrevisable record of what it created', r.nm
        using errcode = 'CLR10';
    end if;
  end loop;
  for r in select unnest(array['t_bank_match_audit_append_only','t_bank_match_audit_no_truncate']) as nm loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = 'clara.bank_match_audit'::regclass
                     and t.tgname = r.nm) then
      raise exception '0042 S4.6C: clara.bank_match_audit has lost %; the causal law reads that table as evidence and evidence that can be rewritten is not evidence', r.nm
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3b) + (4), one pass over every clara body.
  for r in select p.proname::text as proname, p.prosrc, pg_get_functiondef(p.oid) as fdef,
                  (p.oid::regprocedure)::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'clara' and p.prokind = 'f'
            order by p.proname::text collate "C", p.oid loop
    -- WIDENED [round-8 M2 finding, cross-section patch]: prosrc AND pg_get_functiondef(oid),
    -- concatenated -- a PG14+ standard-body function stores its body in prosqlbody and leaves
    -- prosrc the EMPTY STRING (not NULL), so the null-only check and the creation-key/audit-
    -- rewrite scan below would both have silently missed one. EMPIRICALLY VERIFIED against the
    -- round-8 M2 lane DB: the widened read changes NO verdict on the live catalog (creation-key
    -- census stays empty; the door set stays the pinned four; _bank_match_audit's own self-match
    -- under pg_get_functiondef is harmless here because it never passes the outer 'inserts into
    -- bank_match_entry_members' filter).
    if r.prosrc is null and r.fdef is null then
      raise exception '0042 S4.6C: could not read the body of % -- fails closed', r.sig
        using errcode = 'CLR10';
    end if;
    v_src := lower(regexp_replace(regexp_replace(regexp_replace(
      coalesce(r.prosrc, '') || coalesce(r.fdef, ''), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
    if v_src ~ 'update +clara\.bank_match_audit' or v_src ~ 'delete +from +clara\.bank_match_audit' then
      raise exception '0042 S4.6C: % rewrites clara.bank_match_audit. The one-standing-booking law reads it as the booking act''s own record of the entries that act CREATED; a body that can revise it can make a doubled bank movement invisible.', r.proname
        using errcode = 'CLR10';
    end if;
    if r.proname <> '_wdb_born_in_booking_act' and not (r.proname = any (v_ok_key_writers)) then
      foreach v_k in array v_keys loop
        if position(v_k in v_src) <> 0 then
          v_bad := v_bad || case when v_bad = '' then '' else ', ' end || r.proname || ':' || v_k;
        end if;
      end loop;
    end if;
  end loop;
  if v_bad <> '' then
    raise exception '0042 S4.6C: {%} name a clara.bank_match_audit CREATION key outside the measured booking doors. Those three keys are read by clara._wdb_born_in_booking_act as "the act that wrote this group BUILT this entry"; a body that writes one of them about a PRE-EXISTING entry turns an ordinary match into a causation verdict and walls the line in. Adjudicate against S4.6A before allowing this.', v_bad
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.6C OK: the one-standing-booking subject reads no clock, asks clara._wdb_born_in_booking_act at both of its sites, clara.bank_match_audit is still append-only/un-truncatable and unrewritten by any body, and the three creation keys are still written only by the booking doors.';
end $s4_6c$;

-- =====================================================================================
-- S4.7 -- clara.resolve_and_book_bank_line -- THE AF-2 COMPOSITE (design SS4; WD-R13;
-- ABI SSA signature; ABI SSE `composite <op>` / `<op>:draft` / `<op>:draft:approve` /
-- `<op>:settle` / `<op>:match` / `<op>:resolve`). OWNER FLOOR.
-- =====================================================================================
-- WHAT IT CLOSES. C-c's exception door ratified three dispositions and shipped two of them
-- structurally unreachable: `matched_booking` and `written_off_adjustment` both END WITH THE
-- LINE MATCHED (that is what stops a resolved line falling out of every reconciliation term),
-- but an OPEN-excepted line cannot be matched at all -- so the only lawful ordering is
-- resolve-and-book INSIDE ONE TRANSACTION, and no verb offered it. The /bank UI has carried
-- both dispositions disabled since C-c. This verb is the missing transaction.
--
-- THE TWO BOOKING LEGS (assembly adjudication A -- ABI SSA gives no counterparty argument and
-- no leg selector, so the leg is DERIVED from what the caller supplied, and exactly one leg
-- runs per call):
--   * THE HAND-DRAFT LEG (p_draft non-null). An inline client resolution at confidence 1.0
--     (the ONE D-b writer whose client is not FK-anchored -- see the attribution posture in
--     design SS4) -> clara.draft_entry under `<op>:draft` -> the optional
--     `staff_advance_application` proposal copied VERBATIM into the draft's flags (this is
--     the WD-R10 "bank-side application producer": a staff repayment arriving in the bank is
--     a hand-coded entry whose credit legs the SS3 hook must see) -> clara._approve_entry_core
--     preheld under `<op>:draft:approve` -> the exception RESOLVED -> clara.match_bank_line
--     under `<op>:match`. match_bank_line is UNTOUCHED by this migration: by the time it runs,
--     its `line_excepted` wall sees status='resolved'.
--   * THE SETTLEMENT LEG (p_draft null). clara._settle_from_bank_line_core preheld under
--     `<op>:settle`, whose counterparty and domain are DERIVED from the open items named in
--     p_allocations. This is the ONLY leg that can PARK: clara.bank_matches anchors exactly
--     one draft and only the settle core writes a group in the `pending` state.
--
-- THE ORDER OF THE TWO ACTS IS NOT SYMMETRIC, AND THAT IS THE DESIGN:
--   * hand-draft leg -- RESOLVE FIRST, then match. The draft's high-stakes-ness is knowable
--     the moment the draft exists, before anything is resolved, so a would-be park refuses
--     cleanly ([WDB-G9]: the park is the settlement leg only) and the resolution is only ever
--     executed on a path that will finish live.
--   * settlement leg -- BOOK FIRST, then decide. The settle core alone knows whether the
--     settlement is high-stakes (it builds the entry and asks clara.is_high_stakes), so the
--     exception is still OPEN while the core runs -- which is exactly why admission site 1
--     exists and why the declaration travels in p_ctx.
--
-- THE PARK [WDB-G9]. When the settlement lands as a WCA-R7 draft, the resolution is NOT
-- executed: it is DECLARED on the group (`pending_resolution`) beside the immutable
-- `resolution_exception_id`, and clara.complete_pending_match executes it -- resolved_by = the
-- DECLARANT, never the checker -- at the flip. The ancillaries refuse by name on that branch:
-- a carried bank charge or difference adjustment would ride `pending_ancillaries` past the
-- settlement-only boundary the ruling draws.
--
-- LOCK ORDER (design SS4; 0037 invariant (1) + part2 4.9): every PRE-EXISTING journal entry
-- this call will match is row-locked BEFORE the rungs, then 203005003 (per counterparty,
-- ascending) -> 203005004 -> 203005006. Pre-acquiring all three up front is what makes every
-- inner verb's own acquisition same-transaction RE-ENTRANT, so no inner ordering can invert:
-- the settle core takes the line row before 203005006 would otherwise be reachable, and
-- resolve_bank_line_exception takes 203005006 before the line row. "Pre-acquiring all three"
-- means EVERY 203005003 an inner verb can reach -- on the hand-draft leg that is the line-stamped
-- counterparties AND the top-level p_draft.counterparty proposal, because clara._approve_entry_core
-- resolves the latter and locks it after this call already holds the client and bank rungs
-- (as-built ladder round 2; the derivation below carries the full note).
-- ---------------------------------------------------------------------------------------
-- THE ACKNOWLEDGEMENT DOOR [as-built ladder round 8 fix, lane M3; cells x42.r8s-k1..k5]. It is
-- clara.match_bank_line's OWN argument, by name, with its own grammar and its own refusal --
-- WDB-R2 parity, not a new mechanism. Read that body before touching this: `v_ack :=
-- coalesce(p_ack_period_exceptions, false)`, the flag is in the request hash BECAUSE it decides
-- an admission AND is recorded on the member row and in the audit, and an unacknowledged
-- posting date after the statement period end refuses CLR10 period_exception_unacknowledged.
--
-- WHY IT WAS MISSING, AND WHAT THAT COST -- MEASURED, not argued. A bank booking carrying a
-- staff-advance application was released through the block report's own named remedy
-- (clara.reverse_entry). The register's correction is dated at the mirror -- TODAY -- so the
-- historic outstanding never came back and re-booking at the LINE'S OWN DATE was refused by the
-- register's temporal cap (CLR39 advance_over_application); at every date the cap DID allow --
-- today or later -- clara.match_bank_line refused CLR10 period_exception_unacknowledged for a
-- statement whose period closed years ago, and this composite had no argument to acknowledge
-- it. Two correct laws, no door between them: the statement line was permanently un-bookable
-- while clara.get_bank_reconciliation went on reporting difference 0 and can_complete true.
-- The control -- the identical chain with no advance payload -- re-booked at its own date and
-- ran clean, which is what isolates this to the composition rather than to either family.
--
-- IT DEFAULTS TO NULL AND IS COALESCED TO FALSE, so every existing caller is byte-unchanged:
-- the hand-draft leg still passes FALSE unless a human says otherwise, and "a hand-draft dated
-- outside the statement's period is a date the human chose and must be told about" stays the
-- law -- what changes is that the human can now answer.
--
-- IT IS APPENDED AT THE END OF THE ARGUMENT LIST rather than beside match_bank_line's own
-- position, and that is a compatibility decision with a reason: every positional caller of the
-- twelve-argument form keeps binding, and the PostgREST surface names its arguments anyway.
-- ---------------------------------------------------------------------------------------
create function clara.resolve_and_book_bank_line(p_client uuid, p_exception uuid,
    p_disposition text, p_note text, p_draft jsonb default null,
    p_allocations jsonb default null, p_adjustments jsonb default null,
    p_advance_applications jsonb default null, p_charge_cents bigint default 0,
    p_charge_account text default null, p_attestation text default null,
    p_op_key text default null, p_ack_period_exceptions boolean default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $af2$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_note text; v_leg text; v_charge bigint;
  -- 0042 (round 8, lane M3): the posting-date acknowledgement, coalesced ONCE, exactly as
  -- clara.match_bank_line coalesces its own -- so the hash, the refusal, the audit and the
  -- receipt can never disagree about what the caller said.
  v_ack boolean;
  ex record; ln record; st record; v_bank uuid;
  v_item_ids uuid[]; v_cp uuid; v_cps uuid[]; v_one uuid;
  -- 0042 (as-built ladder round 2): the hand-draft leg's TOP-LEVEL counterparty proposal,
  -- pre-resolved so its rung can be taken in the house order (see the derivation below).
  v_fp jsonb; v_top_cp uuid;
  v_pre_entries uuid[] := '{}'::uuid[];
  v_resolution uuid; v_entry uuid; v_rev uuid;
  v_res jsonb; v_match uuid; v_match_status text; v_branch text;
  v_adj_n int;
  -- 0042 (as-built ladder round 3): the prior-booking wall + the counterparty-landscape
  -- re-check, both taken under the rungs and before the first write (see there).
  v_block jsonb; v_moved uuid;
  -- 0042 (round 8, lane M3): the HIGH-STAKES hand-draft refusal's own measurement of the ONE
  -- door it is allowed to name (see that raise site). v_reg_ok is the register door's own
  -- verdict on THIS payload, taken a microsecond before the refusal rolls everything back.
  v_reg_ok boolean; v_reg_why text; v_advice text;
begin
  -- ---------------------------------------------------------------
  -- ARGUMENT TIME. Every refusal below is reachable with the caller still on the line and
  -- BEFORE anything is reserved, locked or written.
  -- ---------------------------------------------------------------
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- ABI SSA / SSF: the disposition enum is validated at ARGUMENT TIME ON BOTH BRANCHES, which
  -- is the whole point of the token. `bank_corrective_line` is a REAL disposition of the
  -- direct verb and it ALWAYS refuses here: a corrective pair closes two excepted lines
  -- against each other and books nothing, so there is no "and book" for this verb to do --
  -- and parking one would strand a group that can never tie. The message names the remedy.
  if p_disposition is null or p_disposition not in
      ('matched_booking', 'written_off_adjustment') then
    raise exception 'resolve_and_book supports only the two BOOKING dispositions (matched_booking, written_off_adjustment), not %; a bank_corrective_line pair books nothing -- close it with clara.resolve_bank_line_exception', coalesce(p_disposition, '(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','disposition_unsupported',
          'disposition',p_disposition)::text;
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'a resolution note is required'
      using errcode='CLR10',detail='{"reason":"resolution_note_required"}';
  end if;
  v_charge := coalesce(p_charge_cents, 0);
  v_ack := coalesce(p_ack_period_exceptions, false);

  -- THE LEG, derived (assembly adjudication A). Additive refusal token with an AXIS -- the
  -- 0041 `disposal_request_invalid` precedent -- because "which booking did you mean" is a
  -- caller-shape error with several distinct remedies and one token per remedy would be six
  -- tokens for one mistake.
  if p_draft is not null and p_allocations is not null then
    raise exception 'name a hand-draft OR an open-item settlement, never both: p_draft books a new entry and p_allocations settles existing items, which are two bookings for one statement line'
      using errcode='CLR10',
        detail='{"reason":"booking_request_invalid","axis":"draft_and_allocations"}';
  end if;
  if p_draft is null and (p_allocations is null
      or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0) then
    raise exception 'resolve_and_book must book something: name p_draft (a hand-coded entry) or a non-empty p_allocations (an open-item settlement, whose counterparty this verb derives from the items named)'
      using errcode='CLR10',
        detail='{"reason":"booking_request_invalid","axis":"no_booking"}';
  end if;
  v_leg := case when p_draft is not null then 'draft' else 'settle' end;
  if v_leg = 'draft' then
    if p_adjustments is not null or v_charge <> 0 or p_charge_account is not null then
      raise exception 'p_adjustments and p_charge_cents/p_charge_account belong to the settlement leg (they are difference adjustments against an open-item settlement); a hand-draft states its own lines'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"settle_argument_on_draft_leg"}';
    end if;
    if jsonb_typeof(p_draft) <> 'object' or jsonb_typeof(p_draft->'lines') <> 'array'
       or jsonb_array_length(p_draft->'lines') = 0
       or nullif(btrim(coalesce(p_draft->>'posting_date','')),'') is null then
      raise exception 'p_draft must be an object carrying posting_date, memo and a non-empty lines array (ABI SSA)'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"draft_malformed"}';
    end if;
  else
    -- The advance proposal is a DRAFT-leg payload by construction: it names line_no positions
    -- inside p_draft.lines, and a settlement entry's legs are built by the allocate core, not
    -- by the caller. (On the PARK branch it refuses again, by its own [WDB-G9] token, below.)
    if p_advance_applications is not null then
      raise exception 'p_advance_applications names line_no positions inside p_draft.lines, so it requires the hand-draft leg; a staff-advance repayment is coded, not settled against open items'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"advance_payload_without_draft"}';
    end if;
    -- ...AND THE ACKNOWLEDGEMENT IS A DRAFT-LEG ARGUMENT TOO, for a reason that is measured
    -- rather than stylistic [round 8, lane M3]. A posting-date exception is a statement about a
    -- date the CALLER chose, and on the settlement leg the caller chooses none: this verb hands
    -- clara._settle_from_bank_line_core a NULL posting date, the core defaults it to the LINE'S
    -- OWN entry_date and then refuses anything outside the statement period outright
    -- (`posting_date_out_of_period`, both directions) -- so no period exception can arise and
    -- there is nothing here to acknowledge. Accepting the flag and quietly ignoring it would be
    -- the walled corridor inverted: a caller who ticked the box would believe an
    -- acknowledgement had been recorded when the receipt and the audit say nothing of the kind.
    -- It is therefore REFUSED BY NAME, at argument time, on the same wall its sibling payload
    -- uses -- and only when it is TRUE, so an explicit `false` (which asserts nothing) still
    -- binds exactly as omitting it does.
    if v_ack then
      raise exception 'p_ack_period_exceptions acknowledges a posting date outside the statement period, and the settlement leg has no such date to acknowledge: it posts at the statement line''s own entry_date, which is inside the period by construction'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"ack_without_draft"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- THE EXCEPTION AND ITS LINE, read UNLOCKED -- only to learn what to lock and to refuse the
  -- obvious before any reservation exists. Every authority statement below is re-made under
  -- the locks by the callee that owns it (resolve_bank_line_exception re-reads the exception
  -- FOR UPDATE; the settle core re-checks the line after the line lock).
  -- ---------------------------------------------------------------
  select e.id, e.firm_id, e.client_id, e.line_id, e.status, e.statement_id into ex
    from clara.bank_line_exceptions e where e.id = p_exception and e.firm_id = c.firm;
  if not found or ex.client_id <> p_client then
    raise exception 'bank line exception % is not in this client', p_exception
      using errcode='CLR11';
  end if;
  if ex.status <> 'open' then
    raise exception 'bank line exception % is already resolved', p_exception
      using errcode='CLR10',detail='{"reason":"already_resolved"}';
  end if;
  select * into ln from clara.bank_statement_lines l where l.id = ex.line_id;
  if not found then
    raise exception 'bank line exception % names no statement line', p_exception
      using errcode='CLR10',detail='{"reason":"exception_line_orphan"}';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found or st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a booking', ex.line_id, coalesce(st.status,'missing')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',ex.line_id,
          'statement_id',ln.statement_id,'statement_status',st.status)::text;
  end if;
  v_bank := st.bank_account_id;

  -- THE SETTLEMENT COUNTERPARTY, DERIVED (assembly adjudication A). ABI SSA gives this verb
  -- no p_counterparty, and it needs none: every allocate wall already demands that ONE
  -- counterparty own the whole allocation set, so the set itself names the counterparty. The
  -- pick is the LOWEST item id's canonical counterparty -- deterministic, and the allocate
  -- core refuses `allocation_counterparty_mismatch` if the caller mixed two. Derived here,
  -- BEFORE the rungs, because 203005003 is keyed on it.
  if v_leg = 'settle' then
    if exists (select 1 from jsonb_array_elements(p_allocations) as x(elem)
               where coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'each allocation must state an item_id and a positive whole amount_cents'
        using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
    end if;
    select array_agg(distinct (x.elem->>'item_id')::uuid) into v_item_ids
      from jsonb_array_elements(p_allocations) as x(elem);
    select clara._canonical_counterparty(p_client, min(oi.counterparty_id::text)::uuid)
      into v_cp
      from clara.open_items oi
      where oi.id = any(v_item_ids) and oi.client_id = p_client and oi.firm_id = c.firm;
    if v_cp is null then
      raise exception 'none of the open items named in p_allocations carries a counterparty this client owns, so the settlement has no counterparty to settle with'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"allocation_counterparty_underivable"}';
    end if;
    v_cps := array[v_cp];
  else
    -- On the hand-draft leg the counterparty is whatever clara._approve_entry_core resolves,
    -- and it resolves from TWO independent places. This is the first: every counterparty NAMED
    -- ON A LINE. The second -- the TOP-LEVEL p_draft.counterparty proposal -- is derived in the
    -- lock block below, AFTER the reservations, and that placement is deliberate (see there).
    select array_agg(distinct clara._canonical_counterparty(p_client,
             (x.elem->>'counterparty_id')::uuid)) into v_cps
      from jsonb_array_elements(p_draft->'lines') as x(elem)
      where coalesce(x.elem->>'counterparty_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  end if;

  -- ---------------------------------------------------------------
  -- THE RESERVATIONS, ALL OF THEM, BEFORE THE FIRST LOCK (0037:2678-2698's deadlock
  -- reasoning; the complete_pending_match discipline). ABI SSE:
  --   * `<op>`                -- this verb's own receipt.
  --   * `<op>:draft:approve`  -- PREHELD, spent by _approve_entry_core on the draft leg.
  --   * `<op>:settle`         -- PREHELD, spent by the settle core on the settlement leg.
  --   * `<op>:draft` / `<op>:match` / `<op>:resolve` -- NOT pre-reserved: their spenders are
  --     still-public RESERVING verbs, and pre-reserving a key its callee will also reserve
  --     either raises CLR10 (different hash) or hands the callee a `{pending:true}` stub it
  --     would no-op on [L2/FI1].
  -- Each derived pre-reservation is a NON-NULL-RAISES claim, never a replay: a genuine replay
  -- of this act returns at the composite's OWN receipt above and never reaches here, so a
  -- non-null answer here means somebody else owns that namespace.
  -- ---------------------------------------------------------------
  v_dedupe := clara._reserve_op(c.firm, 'resolve_and_book_bank_line', p_op_key,
    -- THE HASH CARRIES THE ACKNOWLEDGEMENT, for clara.match_bank_line's own stated reason
    -- [round 8, lane M3]: it BOTH decides an admission and is recorded (on the member row, in
    -- that verb's audit payload, and in this verb's). Omitting it would let the same op_key
    -- replayed with ack=true return the ack=false call's receipt while the caller believes an
    -- acknowledgement was recorded. The COALESCED value is hashed, never the raw argument, so
    -- `null` and `false` -- which mean the same thing to every gate -- stay the same act.
    clara._hash(jsonb_build_object('exception', p_exception, 'disposition', p_disposition,
      'note', p_note, 'draft', p_draft, 'alloc', p_allocations, 'adj', p_adjustments,
      'adv', p_advance_applications, 'charge', p_charge_cents,
      'charge_acct', p_charge_account, 'ack', v_ack)));
  if v_dedupe is not null then return v_dedupe; end if;

  if v_leg = 'draft' then
    if clara._reserve_op(c.firm, 'approve_entry', p_op_key || ':draft:approve',
         clara._hash(jsonb_build_object('composite', 'resolve_and_book_bank_line',
           'op_key', p_op_key, 'leg', 'draft'))) is not null then
      raise exception 'the derived draft approve op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  else
    -- The settle key carries the settle verb's LIVE 11-field hash, computed through the S4.1
    -- primitive so the core -- which will spend this receipt preheld -- and this reservation
    -- cannot drift. The memo, posting date and control account are deliberately NULL: the
    -- core synthesises the house memo, defaults the date to the line's own entry_date and
    -- takes the single-control lane, so this verb never has an opinion about any of the three.
    if clara._reserve_op(c.firm, '_settle_from_bank_line_core', p_op_key || ':settle',
         clara._settle_request_hash(p_client, ex.line_id, v_cp, p_allocations, null, null,
           v_charge, p_charge_account, clara._bank_adjustments_norm(p_adjustments),
           p_attestation, null, null)) is not null then
      raise exception 'the derived settle op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- THE LOCKS. Row locks on PRE-EXISTING journal entries FIRST (0037 invariant (1) -- this is
  -- the reverse_entry relative order that match_bank_line is bound by), then the advisory
  -- rungs ascending.
  --
  -- v_pre_entries is EMPTY BY CONSTRUCTION in both of today's legs: the hand-draft leg matches
  -- the entry it just created, and the settlement leg matches the entry the settle core
  -- creates -- transaction-new rows are exempt from the invariant because no other session can
  -- hold them. The loop is written out anyway, and left empty rather than deleted, because the
  -- invariant is about the ORDER a future arity must inherit: the day this verb learns to
  -- match a pre-existing entry, the lock is already in the right place. (Tail probe: the
  -- vacuity is asserted, not assumed.)
  -- ---------------------------------------------------------------
  if array_length(v_pre_entries, 1) is not null then
    perform 1 from clara.journal_entries je where je.id = any(v_pre_entries)
      order by je.id for update;
  end if;
  -- THE HAND-DRAFT LEG'S SECOND COUNTERPARTY SOURCE: the TOP-LEVEL p_draft.counterparty
  -- proposal (as-built ladder round 2 -- A LOCK-ORDER INVERSION). It is handed to
  -- clara.draft_entry as p_proposed_counterparty and stored on the draft, and
  -- clara._approve_entry_core then resolves it and takes 203005003 ON THE RESOLVED ID -- by
  -- which time this call is already holding 203005004 and 203005006. That is the house ladder
  -- run BACKWARDS, and a concurrent clara.allocate_payment / clara.allocate_receipt (which take
  -- 203005003 then 203005004, both by their own law) closes the cycle: MEASURED as a real
  -- 40P01 against a session holding the counterparty rung.
  --
  -- BOTH non-birth decisions are contendable, not just `{"existing_id": …}`: a `{"new": {…}}`
  -- proposal that MATCHES an existing counterparty by registration or normalised name resolves
  -- to that existing id too. Only decision='birth' is safe unlocked -- no other session can hold
  -- an advisory lock on a uuid that does not exist yet -- which is why the test is on the
  -- DECISION rather than on the proposal's shape.
  --
  -- IT IS DERIVED HERE, BELOW THE RESERVATIONS, NOT UP WITH THE LINE-STAMPED SET. A REPLAY of
  -- this act returns at the composite's own receipt ABOVE, and clara._resolve_counterparty is a
  -- body that can RAISE (a counterparty merged or retired since the original call no longer
  -- resolves) -- so deriving it before the dedup check would turn an idempotent replay into a
  -- CLR23. Below the reservations the replay has already returned and only a genuinely new call
  -- reaches this line, where clara.draft_entry would raise the identical refusal moments later.
  -- A non-object payload is left to clara.draft_entry deliberately, so this pre-lock can never
  -- CHANGE which refusal a caller meets.
  if v_leg = 'draft' and jsonb_typeof(p_draft->'counterparty') = 'object' then
    v_fp := clara._resolve_counterparty(p_client, p_draft->'counterparty');
    if coalesce(v_fp->>'decision', '') <> 'birth'
       and nullif(v_fp->>'counterparty_id', '') is not null then
      v_top_cp := clara._canonical_counterparty(p_client, (v_fp->>'counterparty_id')::uuid);
      if v_top_cp is not null and not (v_top_cp = any(coalesce(v_cps, '{}'::uuid[]))) then
        v_cps := coalesce(v_cps, '{}'::uuid[]) || v_top_cp;
      end if;
    end if;
  end if;
  -- ASCENDING, ALWAYS: two calls naming the same two counterparties in a different order must
  -- not be able to hold each other's next rung (the resolve_bank_line_exception two-line-lock
  -- reasoning, applied to advisory keys).
  if v_cps is not null then
    select array_agg(x order by x::text) into v_cps from unnest(v_cps) as t(x);
    foreach v_one in array v_cps loop
      perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_one::text));
    end loop;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(v_bank::text));

  -- ---------------------------------------------------------------
  -- THE PRIOR-BOOKING WALL (as-built ladder round 3 -- A DOUBLE BOOKING). ONE statement line
  -- carries ONE live booking. `ex.status = 'open'` above is an authority test, not a money
  -- test: design SS4's reopen deliberately puts a released line's exception BACK to open (it
  -- must -- a resolved exception on an unmatched line has fallen out of every reconciliation
  -- term), and clara.unmatch_bank_match deliberately does NOT un-approve the booking (it must
  -- not -- clara.reverse_entry refuses `live_bank_match_present` until the group is released,
  -- so a release that demanded the reversal first would wall the human in). Between those two
  -- correct decisions sits an open exception whose GL booking is still standing, and a second
  -- call here books it AGAIN: measured at 84,000 of bank GL for one 42,000 line, with
  -- clara.get_bank_reconciliation absorbing the surplus as an outstanding entry side so the
  -- receipt still ties and nothing surfaces it.
  --
  -- THE ANSWER IS THE SHARED PREDICATE (S4.6A), not a local test -- the walled-corridor class
  -- has now recurred three times, every recurrence a hand-derived claim about another verb's
  -- admission logic. clara._wdb_exception_booking_block ASKS clara.reverse_entry's own gates,
  -- in clara.reverse_entry's own order, and composes a remedy that is executable as written
  -- (the settlement leg genuinely needs clara.unallocate_group on a NAMED application_group
  -- first). clara.unmatch_bank_match reads the SAME body, so the release that creates this
  -- state and the door that refuses because of it can never tell two different stories.
  --
  -- IT IS TAKEN UNDER THE RUNGS, DELIBERATELY: 203005004 is the rung clara.reverse_entry and
  -- every allocation composite take, so a concurrent unwind is serialised against this read
  -- rather than racing it. Nothing has been written yet, so the refusal rolls the reservations
  -- back with it and a retry under the same op key is a genuinely fresh act.
  -- ---------------------------------------------------------------
  -- ROUND 4: the predicate is now LINE-keyed (it walks every group that has ever held this
  -- exception's line, not only the groups this migration's own composite stamped), and the
  -- VERDICT is its `blocking` key rather than mere non-nullness -- a standing entry that some
  -- other live group already holds is reported but does not refuse. The structural backstop
  -- for every OTHER door is S4.11's line-member arm, which reads this same body.
  v_block := clara._wdb_exception_booking_block(p_exception);
  if v_block is not null and coalesce((v_block->>'blocking')::boolean, false) then
    raise exception 'statement line % already carries a booking made for this exception that nobody has unwound; book it once: %', ex.line_id, coalesce(v_block->>'remedy', '(no remedy composed)')
      using errcode='CLR10', detail=v_block::text;
  end if;

  -- THE COUNTERPARTY LANDSCAPE RE-CHECK (as-built ladder round 3 -- A FROZEN-SNAPSHOT READ,
  -- one of the two D-a defect classes by name). Every 203005003 above was keyed on a canonical
  -- id resolved BEFORE the rungs, and clara.merge_counterparties takes no advisory rung at all
  -- -- so a merge committing in that window moves the tail of the chain, clara._approve_entry_core
  -- (or the allocate core, which re-canonicalises its p_counterparty) then takes 203005003 on a
  -- SURVIVOR this call never locked, while this call already holds 203005004 and 203005006.
  -- That is the ladder inversion round 2 closed, re-opened through the map instead of the
  -- payload. Taking the extra rung here is NOT the fix -- a session holding 203005003 on the
  -- survivor and waiting for 203005004 (every allocate verb, by its own law) would close the
  -- cycle from the other side. So the act REFUSES, in the same class clara._approve_entry_core
  -- already uses for a changed counterparty landscape (CLR23), at a point where nothing has
  -- been written: the transaction aborts, every reservation rolls back with it, and re-running
  -- the identical call resolves against the settled landscape. The check is TOTAL over the
  -- rungs actually held, because canonical(canonical(raw)) = canonical(raw) -- asking each
  -- held id whether it is still its own canonical asks the same question of every raw source
  -- that produced it, on both legs.
  if v_cps is not null then
    foreach v_one in array v_cps loop
      v_moved := clara._canonical_counterparty(p_client, v_one);
      if v_moved is distinct from v_one then
        raise exception 'a counterparty merge landed while this act was taking its locks (% is now %); nothing was written -- run the act again and it will resolve against the settled landscape', v_one, coalesce(v_moved::text, '(unresolvable)')
          using errcode='CLR23',
            detail=jsonb_build_object('reason','counterparty_landscape_changed',
              'counterparty_id', v_one, 'canonical_id', v_moved,
              'exception_id', p_exception)::text;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------
  -- THE BOOKING.
  -- ---------------------------------------------------------------
  if v_leg = 'draft' then
    -- THE INLINE RESOLUTION MINT (design SS4, the attribution posture). Every other D-b writer
    -- is FK-anchored -- a template, an enrolment, a statement line -- and carries no resolution
    -- because there is nothing to resolve. THIS draft is free-form: its client is a QUESTION
    -- the owner has just answered by naming an exception on a line that belongs to the client,
    -- so the answer is recorded as evidence at confidence 1.0, method 'human', exactly as
    -- confirm_attribution_candidate records its own (0009:2382-2385). A caller who already
    -- holds a live resolution may name it instead.
    v_resolution := nullif(btrim(coalesce(p_draft->>'resolution','')),'')::uuid;
    if v_resolution is null then
      insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id,
          confidence, method, evidence, resolved_by)
        values (c.firm, p_client, 'manual', ex.line_id, 1.0, 'human',
          jsonb_build_object('verb', 'resolve_and_book_bank_line', 'exception_id', p_exception,
            'line_id', ex.line_id, 'op_key', p_op_key), c.actor)
        returning id into v_resolution;
    end if;

    v_res := clara.draft_entry(p_client, v_resolution,
      (p_draft->>'posting_date')::date, p_draft->>'memo', p_draft->'lines',
      null, null, '{}'::jsonb, p_op_key || ':draft', p_draft->'counterparty', null);
    v_entry := (v_res->>'entry_id')::uuid;
    if v_entry is null then
      raise exception 'the hand-draft leg produced no entry'
        using errcode='CLR10',detail='{"reason":"draft_leg_no_entry"}';
    end if;

    -- THE ADVANCE PROPOSAL, COPIED VERBATIM (ABI SSA/SSB). clara._draft_entry_core extracts
    -- only three named booleans out of p_flags (0016:4079-4089), so a proposal key handed to
    -- draft_entry is SILENTLY DROPPED -- the trap wave-d-contract SS3 names. The payload is
    -- therefore stamped here, on the still-draft row, through the draft->draft allowset that
    -- carries `flags` (0016:4954). Verbatim means verbatim: this verb never reshapes,
    -- re-keys or validates the payload -- clara._adv_on_approve is its single authoritative
    -- reader and every advance guard re-derives there, under the client rung, at approve.
    if p_advance_applications is not null then
      update clara.journal_entries je
        set flags = coalesce(je.flags,'{}'::jsonb)
                    || jsonb_build_object('staff_advance_application', p_advance_applications),
            updated_at = now()
        where je.id = v_entry and je.status = 'draft';
      if not found then
        raise exception 'the hand-draft was no longer a draft when its advance proposal was stamped'
          using errcode='CLR16';
      end if;
    end if;

    -- [WDB-G9] + assembly adjudication B: THE PARK IS THE SETTLEMENT LEG ONLY. A high-stakes
    -- hand-draft cannot be parked -- clara.bank_matches anchors exactly ONE draft and only the
    -- settle core writes a pending group -- so it refuses HERE, by name, rather than dying two
    -- calls later inside _approve_entry_core on a CLR05 about checkers.
    --
    -- =============================================================================
    -- THE MESSAGE IS AN INTERIM, AND IT NO LONGER NAMES A CHAIN THAT IS REFUSED AT EVERY STEP
    -- [as-built ladder round 8 fix, lane M3; cells x42.r8s-f1..f4]. WDB-R2, in its plainest
    -- form: a refusal that names a remedy is asserting something about another verb's
    -- admission logic, and this one asserted three things about three verbs, all false.
    --
    -- WHAT THE OLD MESSAGE SAID, AND WHAT EACH STEP ACTUALLY DOES -- MEASURED, in this exact
    -- state, on both an advance-carrying and a plain high-stakes hand-draft:
    --   "approve the entry through /queue with a distinct checker"  -- THERE IS NO ENTRY. This
    --     raise ABORTS the transaction, so the draft named in `entry_id` rolls back with it;
    --     measured, the client held ZERO journal entries after the refusal. The message sent a
    --     professional to /queue to look for a row that had never committed.
    --   "then resolve the exception with clara.resolve_bank_line_exception"  -- CLR10: "... is
    --     resolved as matched_booking but its line is in no live match; the booking must land
    --     in the same transaction" (the deferred settled-authority belt). Measured for
    --     matched_booking AND written_off_adjustment; bank_corrective_line refuses for want of
    --     a counterpart line, which a genuine deposit has not got.
    --   "plus clara.match_bank_line"  -- CLR10 line_excepted: "... is under an open bank-line
    --     exception; resolve the exception before matching it".
    -- The two refuse each other in BOTH orders, and a PostgREST caller is one RPC = one
    -- transaction, so no ordering of them is executable from the product's own surface. There
    -- is also no withdraw door: clara.bank_line_exceptions.status admits {open, resolved} and
    -- exactly three bodies write it (complete_pending_match, resolve_bank_line_exception,
    -- unmatch_bank_match) -- none of them cancels an open exception.
    --
    -- WHAT THIS FIX IS AND IS NOT. It is the INTERIM the ruling allows: the promise and the
    -- enforcement now come from one predicate, because the only door this message names is one
    -- it MEASURES first. It is NOT the door itself. Whether v1 should be able to book a
    -- high-stakes hand-draft against an open bank-line exception -- by letting the draft leg
    -- park, by teaching clara.draft_entry a staff_advance_application key, or by scoping the
    -- composition out with this honest refusal as shipped -- is an OWNER DECISION, and the
    -- three candidates are recorded with their blast radius in the round-8 lane report rather
    -- than being chosen here.
    --
    -- THE ADVANCE BRANCH NAMES clara.book_staff_advance_application ONLY WHEN THE REGISTER DOOR
    -- ITSELF ADMITS THIS PAYLOAD, and that is a measurement, not a belief: the draft still
    -- exists at this instant with the proposal already stamped on it, so
    -- clara._adv_assert_proposal -- the SAME body clara.book_staff_advance_application runs on
    -- its own draft -- is asked here, about these very allocations, at this posting date. If it
    -- refuses, the message says the register door refuses too and repeats its reason instead of
    -- sending the caller into a second wall. (It takes advance row locks; the transaction is
    -- about to abort, so they cost nothing and are released with it.)
    --
    -- WHAT THE ADVANCE BRANCH DOES **NOT** PROMISE: that the statement line gets disposed of.
    -- Measured -- after the register is put right, the line is still excepted, every
    -- disposition still refuses, and clara.get_bank_reconciliation reports difference 0 with
    -- the line under excepted_cents and can_complete true. So the message says exactly that.
    -- Saying "the exception lane's other dispositions will handle the line" would have been the
    -- same defect in new words.
    -- =============================================================================
    if clara.is_high_stakes(v_entry) then
      if p_advance_applications is not null then
        begin
          perform clara._adv_assert_proposal(v_entry);
          v_reg_ok := true;
        exception when others then
          get stacked diagnostics v_reg_why = message_text;
          v_reg_ok := false;
        end;
        if v_reg_ok then
          v_advice := 'What works today: book the repayment against the register with clara.book_staff_advance_application -- its own proposal validation admits these allocations at this posting date, measured just now -- and a distinct checker approves that draft through /queue, which keeps who owes what right to the cent. The statement line stays excepted: clara.get_bank_reconciliation reports it under excepted_cents (difference unchanged) and the month still completes, but no exception disposition closes the line without a booking landing in the same transaction.';
        else
          v_advice := format('The register door would refuse this payload too, for its own reason (%s), so fix that first; clara.book_staff_advance_application is the door that then keeps the register right, and the statement line stays excepted either way -- clara.get_bank_reconciliation reports it under excepted_cents.', v_reg_why);
        end if;
      else
        v_advice := 'If this booking can be stated as an open-item settlement, name p_allocations instead of p_draft: the SETTLEMENT leg is the one that parks for a distinct checker. Otherwise the statement line stays excepted -- clara.get_bank_reconciliation reports it under excepted_cents (difference unchanged) and the month still completes -- and no exception disposition closes the line without a booking landing in the same transaction.';
      end if;
      raise exception 'this hand-draft is high-stakes, and a parked resolution carries only the settlement leg, so this act cannot book it -- and NOTHING was written: the draft rolled back with this refusal, so there is no entry anywhere to approve. No v1 door books a high-stakes hand-draft against an OPEN bank-line exception in one act; that composition is an owner decision and is still pending. %', v_advice
        using errcode='CLR10',
          detail=jsonb_build_object('reason','pending_branch_ancillary_unsupported',
            'axis','draft',
            -- entry_id is DELIBERATELY GONE. It named the draft this raise destroys, which is
            -- what made the old remedy readable as an instruction; a surface that rendered it
            -- offered a link to a row that never existed.
            'draft_rolled_back', true,
            'advance_payload', p_advance_applications is not null,
            'register_door_admits', v_reg_ok,
            'owner_decision_pending', true,
            'remedy', case when p_advance_applications is not null
                             and coalesce(v_reg_ok, false)
                           then 'book_staff_advance_application'
                           when p_advance_applications is not null then 'fix_advance_payload'
                           else 'settlement_leg_or_none' end)::text;
    end if;

    -- Read the revision token AFTER the flags stamp: the update rotates it, so a token read
    -- before it is already stale by the time the core checks it (the allocate cores' law).
    select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, p_op_key || ':draft:approve');

    -- RESOLVE, THEN MATCH. The order is the whole reason match_bank_line needs no recut: its
    -- `line_excepted` wall re-asks the question under the line lock and, by then, the answer
    -- is 'resolved'. (resolve_bank_line_exception raises a NOTICE here because the line is not
    -- yet a live member -- that notice describes precisely this transaction and is the message
    -- its own header says it exists to give.)
    perform clara.resolve_bank_line_exception(p_exception, p_disposition, v_note, null,
      p_op_key || ':resolve');

    -- THE ACKNOWLEDGEMENT IS THE CALLER'S, PASSED THROUGH VERBATIM [round 8, lane M3]. It was
    -- hard-coded FALSE here, on the reasoning that "a hand-draft dated outside the statement's
    -- period is a date the human chose and must be told about, not one this composite
    -- acknowledges on their behalf" -- which is still exactly right, and is why the default is
    -- false. What was wrong was that there was no way for the human to ANSWER: the composite
    -- took no acknowledgement argument, so a released advance-carrying booking could not be
    -- re-booked at any date at all (see the argument-list header). The composite still never
    -- acknowledges anything on the caller's behalf; it now carries the caller's own answer to
    -- the body that owns the question.
    v_res := clara.match_bank_line(p_client,
      jsonb_build_array(ex.line_id),
      jsonb_build_array(jsonb_build_object('entry_id', v_entry,
        'matched_cents', ln.amount_cents)),
      null, v_ack, p_op_key || ':match');
    v_match := (v_res->>'match_id')::uuid;
    v_branch := 'live';
    v_res := v_res || jsonb_build_object('entry_id', v_entry, 'entry_status', 'approved',
      'resolution_id', v_resolution, 'leg', 'draft');

  else
    -- THE SETTLEMENT LEG. The exception is STILL OPEN here, by design, so the declaration
    -- travels in p_ctx and admission site 1 lets THIS ONE through (and nothing else).
    v_res := clara._settle_from_bank_line_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true,
        'fn', '_settle_from_bank_line_core',
        'exception_declaration', jsonb_build_object('exception_id', p_exception,
          'disposition', p_disposition)),
      p_client, ex.line_id, v_cp, p_allocations, null, null, v_charge, p_charge_account,
      p_adjustments, p_attestation, null, p_op_key || ':settle', null);
    v_match := (v_res->>'match_id')::uuid;
    v_match_status := v_res->>'status';
    if v_match is null or v_match_status is null then
      raise exception 'the settlement leg produced no match group'
        using errcode='CLR10',detail='{"reason":"settlement_composite_no_entry"}';
    end if;

    if v_match_status = 'live' then
      -- Below the threshold the whole act completes now: the settlement is approved, the
      -- group is live, and the resolution executes against a line that IS a live member --
      -- which is exactly what the deferred authority belt asserts at commit.
      perform clara.resolve_bank_line_exception(p_exception, p_disposition, v_note, null,
        p_op_key || ':resolve');
      v_branch := 'live';
    else
      -- THE PARK [WDB-G9]. The ancillaries refuse HERE and not at argument time, because
      -- whether this act parks is not knowable until the settlement entry exists and
      -- clara.is_high_stakes has answered for it. A carried charge or difference adjustment
      -- would ride `pending_ancillaries` and post at the flip -- i.e. past the boundary the
      -- ruling draws around "the settlement leg only" [L3/C3-4].
      select count(*)::int into v_adj_n
        from jsonb_array_elements(clara._bank_adjustments_norm(p_adjustments)) as x(elem);
      if v_adj_n > 0 or v_charge > 0 or p_charge_account is not null then
        raise exception 'this settlement is high-stakes, so the resolution parks for a distinct checker and the parked branch carries the settlement leg ONLY; book the bank charge and the difference adjustments as their own acts after clara.complete_pending_match flips the group'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','pending_branch_ancillary_unsupported',
              'axis','ancillaries','match_id',v_match)::text;
      end if;
      -- THE DECLARATION, on the group, beside the id. The two booking dispositions only (the
      -- CHECK on the column is the durable half); declared_by is the OWNER who made this act,
      -- and complete_pending_match resolves the exception AS THAT ACTOR -- the checker
      -- EXECUTES an owner's decision, they do not make one [WDB-G9].
      update clara.bank_matches bm
        set pending_resolution = jsonb_build_object(
              'exception_id', p_exception, 'disposition', p_disposition, 'note', v_note,
              'declared_by', c.actor, 'declared_at', now())
        where bm.id = v_match;
      v_branch := 'pending';
    end if;
    v_res := v_res || jsonb_build_object('leg', 'settle');
  end if;

  -- ---------------------------------------------------------------
  -- THE IDENTITY, STAMPED IN THE CREATING TRANSACTION ON EVERY PATH [L5/V5-2]. The group is
  -- created by the callee (match_bank_line or the settle core) and this verb stamps the
  -- exception it belongs to before commit. It is what the flip, the cancel, the reopen and
  -- four of the seven admission sites key on -- and the narrow BEFORE-UPDATE trigger SECTION
  -- S1 installs makes it immutable once non-null, so no later act can repoint a group at a
  -- different exception.
  -- ---------------------------------------------------------------
  update clara.bank_matches bm
    set resolution_exception_id = p_exception
    where bm.id = v_match;

  -- THE AUDIT ROW IS THE GENERIC ONE, DELIBERATELY. clara.bank_match_audit's `action` column
  -- carries a CHECK admitting exactly five match-scoped verbs (0038:961) and this act is not
  -- one of them -- and the group's own timeline is NOT thereby thinner, because the callee
  -- that created the group already wrote its row there ('settle'/'settle_pending' from the
  -- settle core, 'match' from match_bank_line). Widening a Wave-C CHECK to add a sixth action
  -- would be a schema change this section has no mandate for, so the composite's own act is
  -- recorded in clara.audit_log, which is human-read behind RLS exactly as bank_match_audit
  -- is. (Reported to the assembler as an optional SECTION S1 follow-up, not taken here.)
  perform clara._audit(c.firm, c.actor, null, null, 'resolve_and_book_bank_line',
    nullif(v_res->>'entry_id','')::uuid,
    jsonb_build_object('client', p_client, 'exception', p_exception, 'line_id', ex.line_id,
      'disposition', p_disposition, 'leg', v_leg, 'branch', v_branch, 'match_id', v_match,
      'match_status', coalesce(v_match_status, 'live'), 'counterparty_id', v_cp,
      'charge_cents', v_charge,
      'advance_proposal', p_advance_applications is not null,
      -- The acknowledgement is AUDITED on both legs, not only where it can fire: an audit that
      -- recorded it only when it mattered would make "the caller did not ask" and "the caller
      -- asked on a leg that has nothing to acknowledge" read the same, and the second of those
      -- is a refusal.
      'ack_period_exceptions', v_ack, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'resolve_and_book_bank_line', p_op_key,
    v_res || jsonb_build_object('resolution_exception_id', p_exception, 'branch', v_branch,
      -- ...and it is on the RECEIPT, beside clara.match_bank_line's own `period_exceptions`
      -- count, so a surface can say "1 posting-date exception, acknowledged" from one read.
      'ack_period_exceptions', v_ack));
end $af2$;
revoke all on function clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,
  jsonb,bigint,text,text,text,boolean) from public;

-- =====================================================================================
-- S4.8 -- clara.complete_pending_match (CoR): admission site 3, the stale re-read, the
-- declarant-resolved exception, the cleared declaration (design SS4; [WDB-G9]).
-- =====================================================================================
-- THREE POSITIONAL SPLICES on the LIVE body, each anchored at a fragment S4.0 has already
-- counted at exactly one occurrence, each postchecked. The 0041 SECTION S4 idiom throughout:
-- fetch from the CATALOG -> anchor at an exact count -> replace -> postcheck the new marker,
-- the survival of the old markers, and the owner.
do $s4_8$
declare
  v_sig text := 'clara.complete_pending_match(uuid,uuid,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S4.8 prestate: clara.complete_pending_match is GONE' using errcode = 'CLR10';
  end if;
  if position('pending_resolution' in v_def) <> 0 then
    raise exception '0042 S4.8 prestate: complete_pending_match already executes a parked resolution -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('recon_period_settled', 1), ('match_not_pending', 2), ('pending_ancillaries', 6),
      ('entry_not_approved', 1), ('amount_beyond_tolerance', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.8 prestate: complete_pending_match carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this splice against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- SPLICE 1 of 3 -- the declare tail. New locals for the parked-resolution execution.
  v_frm := $f$  v_adj_entry uuid; v_adj_entries uuid[] := '{}'::uuid[]; v_i int; v_key text; aj record;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.8 prestate: the declare-tail anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  v_adj_entry uuid; v_adj_entries uuid[] := '{}'::uuid[]; v_i int; v_key text; aj record;
  -- 0042 (D-b SS4): the PARKED RESOLUTION this flip may have to execute, its exception row
  -- re-read FOR UPDATE, and the group's own line (re-derived rather than borrowed from the
  -- ancillary block above, which is skipped when a group carries no ancillaries).
  v_park jsonb; px record; v_park_line uuid;
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 2 of 3 -- ADMISSION SITE 3 OF 7. The settled-period guard admits the parked flip.
  v_frm := $f$  if exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then complete', p_match
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.8 prestate: the settled-period guard anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  -- 0042 (D-b SS4, ADMISSION SITE 3 OF 7 [WDB-G9]): A PARKED FLIP IS ADMITTED, and
  -- nothing else is. An OPEN exception inside a COMPLETED reconciliation is lawful C-c state
  -- -- excepted(P) is a term of the identity that receipt certified -- so the resolution the
  -- owner parked on THIS group is arithmetically neutral for that receipt: the line was
  -- already excluded from the matched set when the receipt was struck, and the flip is what
  -- the receipt's own cutoff-gated re-derivation already expects to see. The evidence channel
  -- is the group row this call holds FOR UPDATE: `pending_resolution` non-null IS the
  -- declaration, and it exists only on a group clara.resolve_and_book_bank_line parked.
  -- Ordinary pending groups keep the unconditional refusal.
  if g.pending_resolution is null and exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then complete', p_match
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 3 of 3 -- the flip. The parked resolution is EXECUTED immediately before the group
  -- goes live, and the declaration is cleared IN the flip statement.
  v_frm := $f$  update clara.bank_matches
    set status = 'live', completed_at = now(), pending_ancillaries = null
    where id = p_match;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.8 prestate: the flip anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  -- ---------------------------------------------------------------
  -- 0042 (D-b SS4, [WDB-G9]): THE PARKED RESOLUTION, EXECUTED. The checker does not MAKE the
  -- resolution decision -- the exception door is an owner act and the belt reads the rank off
  -- the ROW -- they EXECUTE the one the owner declared when they booked the settlement. So
  -- resolved_by is the DECLARANT, read from the declaration, and this verb's own actor never
  -- appears on the exception row.
  --
  -- RE-READ FOR UPDATE, AND REFUSE A STALE DECLARATION. Between the park and this flip the
  -- world can move: somebody may have resolved the exception directly, or excepted the line
  -- again, or the group's identity column and the declaration may disagree. Any of those and
  -- the flip refuses by name rather than executing a decision that no longer describes
  -- anything. The exception row is taken AFTER the line rows above -- the same order
  -- clara.resolve_bank_line_exception itself uses (line FOR UPDATE, then the exception).
  v_park := g.pending_resolution;
  if v_park is not null then
    select min(mm.line_id::text)::uuid into v_park_line
      from clara.bank_match_line_members mm where mm.match_id = p_match;
    select * into px from clara.bank_line_exceptions x
      where x.id = (v_park->>'exception_id')::uuid for update;
    if not found or px.status <> 'open' or px.firm_id <> c.firm or px.client_id <> p_client
       or px.line_id is distinct from v_park_line
       or g.resolution_exception_id is distinct from px.id then
      raise exception 'the resolution parked on bank match % no longer describes an open exception on its line; cancel the reservation with clara.unmatch_bank_match and re-book', p_match
        using errcode='CLR10',
          detail=jsonb_build_object('reason','pending_resolution_stale','match_id',p_match,
            'exception_id',v_park->>'exception_id','line_id',v_park_line)::text;
    end if;
    update clara.bank_line_exceptions
      set status = 'resolved', resolved_by = (v_park->>'declared_by')::uuid,
          resolved_at = now(), resolution_disposition = v_park->>'disposition',
          resolution_note = v_park->>'note', counterpart_line_id = null
      where id = px.id;
    perform clara._audit(c.firm, (v_park->>'declared_by')::uuid, null, null,
      'resolve_bank_line_exception', null,
      jsonb_build_object('exception', px.id, 'disposition', v_park->>'disposition',
        'counterpart_line', null, 'counterpart_exception', null,
        'executed_by', c.actor, 'match_id', p_match, 'op_key', p_op_key));
    perform clara._append_event(c.firm, 'bank.line_exception_resolved', p_client,
      (v_park->>'declared_by')::uuid, null, null, null, null, null,
      jsonb_build_object('exception_id', px.id, 'line_id', px.line_id,
        'resolution_disposition', v_park->>'disposition', 'counterpart_line_id', null,
        'counterpart_exception_id', null));
  end if;
  -- pending_resolution is cleared IN the flip statement (never left behind): it is an
  -- in-flight declaration, and a live group carrying one would be a second, stale account of
  -- a decision that has now actually been executed on the exception row itself.
  update clara.bank_matches
    set status = 'live', completed_at = now(), pending_ancillaries = null,
        pending_resolution = null
    where id = p_match;
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'pending_resolution_stale', '')))
           / length('pending_resolution_stale');
  if v_cnt <> 1 then
    raise exception '0042 S4.8 postcheck: the stale-declaration refusal landed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  if position($p$set status = 'live', completed_at = now(), pending_ancillaries = null
    where id = p_match$p$ in v_def) <> 0 then
    raise exception '0042 S4.8 postcheck: the OLD flip statement survived -- the declaration is not being cleared'
      using errcode = 'CLR10';
  end if;
  if position('g.pending_resolution is null and exists (' in v_def) = 0 then
    raise exception '0042 S4.8 postcheck: admission site 3 did not land on the settled-period guard'
      using errcode = 'CLR10';
  end if;
  -- The five pre-existing markers must stand at EXACTLY their prestate counts: none of the
  -- three splices adds or removes an occurrence of any of them (splice 2 re-emits the guard's
  -- predicate but not its detail payload, which is where recon_period_settled lives).
  for r in select * from (values
      ('recon_period_settled', 1), ('match_not_pending', 2), ('pending_ancillaries', 6),
      ('entry_not_approved', 1), ('amount_beyond_tolerance', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.8 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S4.8 postcheck: complete_pending_match changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.8 OK: complete_pending_match admits the parked flip (site 3 of 7), re-reads the declared exception FOR UPDATE, resolves it as the DECLARANT, and clears the declaration in the flip statement; all five pre-existing markers survived at their measured counts.';
end $s4_8$;

-- =====================================================================================
-- S4.9 -- clara.unmatch_bank_match (CoR): admission site 6 + THE POST-FLIP REOPEN
-- (design SS4; supersedes the x40.z-A1 stale-survives posture).
-- =====================================================================================
-- TWO THINGS LAND HERE AND THEY ARE DIFFERENT ACTS ON DIFFERENT BRANCHES:
--   * a PENDING group carrying a declaration is a PARKED RESERVATION being cancelled: the
--     declaration dies with it, the exception was never resolved and stays OPEN, and the
--     identity column is LEFT INTACT (which is what makes a cancelled park re-bookable and
--     auditable). Admission site 6 lets that cancel through a settled period, for the same
--     reason site 3 lets the flip through.
--   * a LIVE group carrying an identity is a BOOKED RESOLUTION being released: the booking
--     that made the resolution lawful is going away, so the resolution must go with it. The
--     exception transitions resolved -> open (S4.10 makes that a lawful edge), the five
--     resolution columns are erased, and the erased owner act is preserved in the audit row
--     -- because after the UPDATE the row itself no longer says who resolved it or why.
--     A live release inside a reconciled period is NOT admitted: it still takes the void
--     path, exactly as before.
--
-- AND ON BOTH BRANCHES THE RELEASE NOW SAYS WHAT IT LEFT STANDING (as-built ladder round 3).
-- This verb does not un-approve money, by its own one-way lifecycle law -- so a live release
-- (and a parked cancel whose checker already approved the draft) can leave an APPROVED,
-- unreversed booking in the GL while handing the line's exception back to
-- clara.resolve_and_book_bank_line. The composite refuses a SECOND booking on exactly that
-- state, through clara._wdb_exception_booking_block (S4.6A); this verb reads the SAME body and
-- puts the answer in its receipt and its audit row, so the act that creates the state and the
-- door that refuses because of it can never tell two different stories.
do $s4_9$
declare
  v_sig text := 'clara.unmatch_bank_match(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S4.9 prestate: clara.unmatch_bank_match is GONE' using errcode = 'CLR10';
  end if;
  if position('resolution_exception_id' in v_def) <> 0 then
    raise exception '0042 S4.9 prestate: unmatch_bank_match already carries the reopen arm -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('recon_period_settled', 1), ('already_unmatched', 1), ('draft_withdrawn', 6),
      ('pending_ancillaries', 2), ('reason_required', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.9 prestate: unmatch_bank_match carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this splice against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- SPLICE 1 of 5 -- the declare tail.
  v_frm := $f$  v_lines jsonb; v_entries jsonb; v_ln int; v_en int;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.9 prestate: the declare-tail anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  v_lines jsonb; v_entries jsonb; v_ln int; v_en int;
  -- 0042 (D-b SS4): the exception this release REOPENS, if it releases a booked resolution.
  rx record; v_reopened uuid;
  -- 0042 (as-built ladder round 3): what this release LEAVES STANDING in the GL, read through
  -- the SAME predicate clara.resolve_and_book_bank_line refuses on.
  v_left jsonb;
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 2 of 5 -- ADMISSION SITE 6 OF 7. Only the PARKED CANCEL is admitted; a LIVE
  -- release of a reconciled line still takes the void path, unconditionally.
  v_frm := $f$  if exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then unmatch', p_match
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.9 prestate: the settled-period guard anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  -- 0042 (D-b SS4, ADMISSION SITE 6 OF 7 [WDB-G9]): CANCELLING A PARKED RESERVATION IS
  -- ADMITTED THROUGH A SETTLED PERIOD, and nothing else is. The park never posted anything:
  -- the settlement is a draft, the group holds zero entry members, the exception is still
  -- OPEN and therefore still a term of excepted(P) exactly as the receipt certified it.
  -- Cancelling it moves NO number a professional signed -- it puts the line back exactly where
  -- the receipt found it. The design's own SS7 promise ("the parked-cancel drill") is a
  -- promise this guard has to keep, or a parked line inside a reconciled month becomes a
  -- reservation nobody can release. A LIVE group is a different fact: its settlement HAS
  -- posted and is priced into the receipt, so the release keeps the unconditional refusal.
  if not (g.status = 'pending' and g.pending_resolution is not null
          and g.resolution_exception_id is not null)
     and exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then unmatch', p_match
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 3 of 5 -- the reopen, immediately before the flip; the flip clears the declaration,
  -- and the release then READS BACK what it left standing (as-built ladder round 3).
  v_frm := $f$  update clara.bank_matches
    set status = 'unmatched', unmatched_by = c.actor, unmatched_at = now(),
        unmatched_reason = v_reason, pending_ancillaries = null
    where id = p_match;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.9 prestate: the flip anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  -- ---------------------------------------------------------------
  -- 0042 (D-b SS4): THE POST-FLIP REOPEN. A LIVE group carrying resolution_exception_id is a
  -- resolution that was made lawful BY THIS BOOKING: `matched_booking` and
  -- `written_off_adjustment` both mean "the line ends matched", and the deferred authority
  -- belt refuses `disposition_unbooked` the moment that stops being true. Releasing the group
  -- and leaving the exception resolved would therefore either wedge the transaction at commit
  -- or -- worse, on the paths the belt cannot see -- leave a resolved exception on an
  -- unmatched line, which is a line that has fallen out of every reconciliation term. So the
  -- resolution is REOPENED: exactly the row the group names, never "the newest one on the
  -- line", because identity is the whole reason that column exists.
  --
  -- THE PRE-CHECK. If some OTHER exception on this line is already open, reopening this one
  -- would put two open exceptions on one line -- a state the C-c door never mints and the
  -- belt's open-branch arm does not describe. It refuses by name and the remedy is to resolve
  -- the newer one first.
  --
  -- WHAT IS ERASED AND WHERE IT SURVIVES. The transition trigger's comparison set is status
  -- plus the five resolution columns, so all five are nulled together (S4.10 makes that a
  -- lawful edge). That erases an OWNER ACT from the row, so the act is written into the audit
  -- payload BEFORE the update -- clara.audit_log is human-read behind RLS (clara_authenticated
  -- only; no agent or wake role holds a read policy on it), which is where a human's words
  -- belong; the spine event that follows carries identifiers only.
  --
  -- AS-BUILT LADDER ROUND 4 -- THE REOPEN IS KEYED ON THE RELEASED LINES, NOT ON THE GROUP'S
  -- IDENTITY COLUMN. `resolution_exception_id` is stamped by the AF-2 composite and by NOTHING
  -- ELSE, so a booking made through the older, always-public door pair
  -- (clara.resolve_bank_line_exception + clara.match_bank_line in one transaction -- the route
  -- S4.7's own high-stakes refusal names as sanctioned) released with `g.resolution_exception_id
  -- IS NULL` and therefore did NOT reopen: a RESOLVED matched_booking exception was left sitting
  -- on an UNMATCHED line. That is the `disposition_unbooked` state the deferred authority belt
  -- declares unlawful, and it was reachable only because the belt fires on writes to
  -- clara.bank_line_exceptions while this release writes clara.bank_matches. It then let
  -- clara.except_bank_line mint a FRESH exception on the line, which a composite call books a
  -- SECOND time. The belt now asserts the same law from the match side (S4.11) so the state is
  -- structurally impossible; this loop is the verb-side act that keeps the corridor OPEN,
  -- because a release must always be able to proceed.
  --
  -- The identity column is still honoured where it exists -- it orders first, so the receipt's
  -- `reopened_exception_id` still names the row the group was booked against, and the audited
  -- act is unchanged. It is no longer REQUIRED.
  for rx in
    select x.* from clara.bank_line_exceptions x
      join clara.bank_match_line_members lm on lm.line_id = x.line_id
     where lm.match_id = p_match
       and x.status = 'resolved'
       and x.resolution_disposition in ('matched_booking', 'written_off_adjustment')
     order by (x.id = g.resolution_exception_id) desc nulls last, x.line_id, x.id
     for update of x
  loop
      if exists (select 1 from clara.bank_line_exceptions x2
                 where x2.line_id = rx.line_id and x2.status = 'open' and x2.id <> rx.id) then
        raise exception 'statement line % already carries a newer OPEN exception; resolve that one before releasing the booking that closed exception %', rx.line_id, rx.id
          using errcode='CLR10',
            detail=jsonb_build_object('reason','exception_reopen_blocked',
              'exception_id',rx.id,'line_id',rx.line_id,'match_id',p_match)::text;
      end if;
      -- clara.audit_log, not clara.bank_match_audit: the latter's `action` CHECK admits five
      -- match-scoped verbs and a reopen is not one of them (0038:961), and audit_log is
      -- human-read behind RLS exactly as bank_match_audit is (no agent or wake role holds a
      -- read policy on either). The unmatch's own bank_match_audit row still lands below.
      perform clara._audit(c.firm, c.actor, null, null, 'bank_line_exception_reopened', null,
        jsonb_build_object('client', p_client, 'match_id', p_match,
          'exception_id', rx.id, 'line_id', rx.line_id,
          'erased_disposition', rx.resolution_disposition,
          'erased_note', rx.resolution_note,
          'erased_resolved_by', rx.resolved_by, 'erased_resolved_at', rx.resolved_at,
          'erased_counterpart_line_id', rx.counterpart_line_id,
          'unmatch_reason', v_reason, 'op_key', p_op_key));
      update clara.bank_line_exceptions
        set status = 'open', resolved_by = null, resolved_at = null,
            resolution_disposition = null, resolution_note = null,
            counterpart_line_id = null
        where id = rx.id;
      -- FIRST WINS, and the ordering above makes "first" the group's own named exception when
      -- it has one. A group holding several excepted lines reopens ALL of them (the loop) while
      -- the single-valued receipt key keeps its round-3 shape.
      v_reopened := coalesce(v_reopened, rx.id);
      perform clara._append_event(c.firm, 'bank.line_exception_reopened', p_client, c.actor,
        null, null, null, null, null,
        jsonb_build_object('exception_id', rx.id, 'line_id', rx.line_id,
          'match_id', p_match));
  end loop;
  -- pending_resolution dies WITH the reservation, for the same reason pending_ancillaries
  -- does: a cancelled group's declaration was never executed and never will be. The IDENTITY
  -- column is deliberately LEFT INTACT -- it is the audit trail of which exception this group
  -- was booked against, and the SS7 parked-cancel drill asserts exactly that (declaration
  -- cleared, id intact, exception still open).
  -- ROUND 4: THE RELEASE RECORDS THE FACT IT IS ERASING. The reopen above nulls the exception
  -- row's five resolution columns, which destroys the only evidence that THIS group was the one
  -- that discharged THAT exception -- and without it, a booking made through the older two-step
  -- pair is indistinguishable from an ordinary match to a pre-existing entry, so the
  -- one-standing-booking law would either miss it (the round-3 hole) or refuse honest
  -- re-matching (a walled corridor). The identity column is exactly that evidence, it is
  -- write-once by _tf_bank_matches_resolution_exception_immutable (which forbids REVISING a
  -- non-null value and permits null -> non-null), and coalesce keeps a composite-born stamp
  -- untouched. From here, "did this group discharge an exception on this line" is a column.
  update clara.bank_matches
    set status = 'unmatched', unmatched_by = c.actor, unmatched_at = now(),
        unmatched_reason = v_reason, pending_ancillaries = null, pending_resolution = null,
        resolution_exception_id = coalesce(resolution_exception_id, v_reopened)
    where id = p_match;
  -- 0042 (as-built ladder round 3): THE RELEASE TELLS THE TRUTH ABOUT WHAT IT LEFT STANDING.
  -- This verb does not un-approve money -- correctly -- so a release can leave an APPROVED,
  -- unreversed booking behind while putting its exception back in front of
  -- clara.resolve_and_book_bank_line. The composite refuses a second booking on exactly that
  -- state; a release that stayed silent about it would be an act that quietly makes the next
  -- act impossible. Read AFTER the flip, deliberately: the member group_status cascades with
  -- the group row (ON UPDATE CASCADE), so by here the predicate sees an unmatched group and
  -- composes the remedy the human will actually be able to run.
  -- ROUND 4: read through whichever exception this release actually put back in front of the
  -- booking doors -- the group's own named one when it has one, else the line-keyed one the
  -- loop above reopened. The predicate itself is now LINE-keyed, so either id reports every
  -- standing booking on that line, not only the ones this migration's composite stamped.
  --
  -- ROUND 5 -- THE READER IS RECUT TO THE WIDENED LAW. Round 4 asked only when an exception was
  -- in the story (`coalesce(g.resolution_exception_id, v_reopened) is not null`), so releasing
  -- an ORDINARY settlement -- the commonest release in the product, and the one that leaves the
  -- commonest standing booking -- reported NOTHING while the next act was about to be refused.
  -- A release that silently makes the next act impossible is the walled corridor seen from the
  -- other side. It now asks PER RELEASED LINE, with the exception id passed through only as an
  -- echo, and reports the BLOCKING line first so the single-valued receipt key (unchanged
  -- shape, round 3) names the one a human has to deal with.
  select t.b into v_left
    from (select lm.line_id,
                 clara._wdb_line_booking_block(lm.line_id, null,
                   coalesce(g.resolution_exception_id, v_reopened)) as b
            from clara.bank_match_line_members lm where lm.match_id = p_match) t
   where t.b is not null
   order by coalesce((t.b->>'blocking')::boolean, false) desc, t.line_id
   limit 1;
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 4 of 5 -- the audit payload carries the standing booking.
  v_frm := $f$  perform clara._audit(c.firm, c.actor, null, null, 'unmatch_bank_match', null,
    jsonb_build_object('client', p_client, 'match_id', p_match,
      'previous_status', g.status, 'reason', v_reason, 'op_key', p_op_key));
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.9 prestate: the audit anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  perform clara._audit(c.firm, c.actor, null, null, 'unmatch_bank_match', null,
    jsonb_build_object('client', p_client, 'match_id', p_match,
      'previous_status', g.status, 'reason', v_reason, 'op_key', p_op_key,
      'reopened_exception_id', v_reopened, 'booking_outstanding', v_left));
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 5 of 5 -- the RECEIPT carries it too, because the receipt is what the human and
  -- /bank actually read. An additive key only (the 0038 receipt shape is otherwise untouched).
  v_frm := $f$  return clara._finish_op(c.firm, 'unmatch_bank_match', p_op_key,
    jsonb_build_object('match_id', p_match, 'status', 'unmatched',
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en,
      'draft_withdrawn', v_draft_withdrawn,
      'draft_entry_id', g.draft_entry_id));
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.9 prestate: the receipt anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  return clara._finish_op(c.firm, 'unmatch_bank_match', p_op_key,
    jsonb_build_object('match_id', p_match, 'status', 'unmatched',
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en,
      'draft_withdrawn', v_draft_withdrawn,
      'draft_entry_id', g.draft_entry_id,
      'reopened_exception_id', v_reopened,
      'booking_outstanding', v_left));
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'exception_reopen_blocked', '')))
           / length('exception_reopen_blocked');
  if v_cnt <> 1 then
    raise exception '0042 S4.9 postcheck: the reopen pre-check landed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'bank.line_exception_reopened', '')))
           / length('bank.line_exception_reopened');
  if v_cnt <> 1 then
    raise exception '0042 S4.9 postcheck: the reopen event site landed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  if position($p$unmatched_reason = v_reason, pending_ancillaries = null
    where id = p_match$p$ in v_def) <> 0 then
    raise exception '0042 S4.9 postcheck: the OLD flip statement survived -- the declaration is not being cleared'
      using errcode = 'CLR10';
  end if;
  if position($p$if not (g.status = 'pending' and g.pending_resolution is not null$p$ in v_def) = 0 then
    raise exception '0042 S4.9 postcheck: admission site 6 did not land on the settled-period guard'
      using errcode = 'CLR10';
  end if;
  -- The round-3 honesty pair: ONE read of the shared predicate, and its answer on BOTH
  -- channels (the audit row and the receipt). A read whose answer goes nowhere is a promise
  -- nobody hears; an answer with no read is a key that is always null.
  -- ROUND 5: the read is LINE-keyed (clara._wdb_line_booking_block, once, over the group's own
  -- released lines) rather than exception-keyed, because an ordinary settlement release leaves
  -- a standing booking with no exception anywhere in the story. The exception-keyed wrapper must
  -- be GONE from this body -- if it survives, the release is answering the round-4 question.
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._wdb_line_booking_block(', '')))
           / length('clara._wdb_line_booking_block(');
  if v_cnt <> 1 then
    raise exception '0042 S4.9 postcheck: the shared booking-block predicate is read % time(s), expected exactly 1 (after the flip, so the member cascade has already landed)', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('clara._wdb_exception_booking_block(' in v_def) <> 0 then
    raise exception '0042 S4.9 postcheck: the release still reads the EXCEPTION-keyed wrapper -- it would report nothing for a plain settlement release, which is the commonest standing booking there is'
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, '''booking_outstanding''', '')))
           / length('''booking_outstanding''');
  if v_cnt <> 2 then
    raise exception '0042 S4.9 postcheck: booking_outstanding appears % time(s), expected 2 (the audit payload AND the receipt)', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('clara._wdb_line_booking_block(' in v_def)
     < position($p$set status = 'unmatched', unmatched_by = c.actor$p$ in v_def) then
    raise exception '0042 S4.9 postcheck: the booking-block read happens BEFORE the group flip -- the member group_status has not cascaded yet, so the composed remedy would tell the human to unmatch a group this very call is releasing'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('recon_period_settled', 1), ('already_unmatched', 1), ('draft_withdrawn', 6),
      ('reason_required', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.9 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S4.9 postcheck: unmatch_bank_match changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.9 OK: unmatch_bank_match admits the parked cancel (site 6 of 7), reopens exactly the exception a LIVE release was booked against (after the newer-open pre-check), mints bank.line_exception_reopened once, preserves the erased owner act in the audit row, clears the declaration while leaving the identity intact, and reports the booking it left standing on both the audit row and the receipt through the SHARED, LINE-KEYED clara._wdb_line_booking_block predicate (round 5: exception-keyed reporting missed every plain settlement release).';
end $s4_9$;

-- =====================================================================================
-- S4.10 -- clara._tf_bank_line_exception_transition (CoR): the resolved -> open edge.
-- =====================================================================================
-- The live trigger admits ONE transition, open -> resolved, and treats every other change as
-- immutability breach. S4.9's reopen needs the reverse edge -- and it needs it to be a
-- NARROW, FULLY-SPECIFIED edge, not a hole: the row may go back to `open` only if all five
-- resolution columns are erased in the SAME statement. A reopen that left a disposition
-- behind would be an exception that is open and resolved at once, which is exactly the state
-- the belt's two exception arms both refuse.
--
-- The immutability comparison set is UNCHANGED (status + the five resolution columns were
-- already subtracted by 0040 FIX WAVE A2), so nothing else about this row became mutable.
-- Re-emitted in full rather than spliced: the body is thirty lines and one added arm is
-- easier to read whole than as three replace() fragments.
create or replace function clara._tf_bank_line_exception_transition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $$
declare v_old jsonb; v_new jsonb;
begin
  -- 0040 FIX WAVE A2: counterpart_line_id joins the resolution-lifecycle set (it is written by
  -- the SAME open->resolved UPDATE that sets the disposition, and never afterwards).
  v_old := to_jsonb(old) - 'status' - 'resolved_by' - 'resolved_at'
                         - 'resolution_disposition' - 'resolution_note' - 'counterpart_line_id';
  v_new := to_jsonb(new) - 'status' - 'resolved_by' - 'resolved_at'
                         - 'resolution_disposition' - 'resolution_note' - 'counterpart_line_id';
  if v_old is distinct from v_new then
    raise exception 'bank line exceptions are immutable outside the open->resolved transition'
      using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'line_exception_immutable', 'exception_id', old.id)::text;
  end if;
  if old.status = 'open' and new.status = 'resolved'
     and new.resolved_by is not null and new.resolved_at is not null
     and new.resolution_disposition is not null
     and nullif(btrim(coalesce(new.resolution_note, '')), '') is not null then
    return new;
  end if;
  -- 0042 (D-b SS4): THE REOPEN EDGE. clara.unmatch_bank_match releases a LIVE group that a
  -- booking-disposition resolution was made lawful by, and the resolution has to go with the
  -- booking: `matched_booking` and `written_off_adjustment` both assert "this line ends
  -- matched", and the deferred authority belt refuses `disposition_unbooked` the instant that
  -- stops holding. The edge is deliberately TOTAL -- all five resolution columns must be null
  -- in the same statement -- so it can never leave a half-resolved row, which is the state
  -- both exception arms of the belt exist to forbid. Nothing else widens: an UPDATE that
  -- touches any other column still fails the comparison above, and every other status pair
  -- still falls through to the refusal below.
  if old.status = 'resolved' and new.status = 'open'
     and new.resolved_by is null and new.resolved_at is null
     and new.resolution_disposition is null and new.resolution_note is null
     and new.counterpart_line_id is null then
    return new;
  end if;
  raise exception 'bank line exceptions are immutable outside the open->resolved transition'
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'line_exception_transition_illegal',
        'exception_id', old.id, 'from_status', old.status, 'to_status', new.status)::text;
end $$;

do $s4_10$
declare v_def text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    where p.oid = 'clara._tf_bank_line_exception_transition()'::regprocedure;
  if position($p$old.status = 'resolved' and new.status = 'open'$p$ in v_def) = 0 then
    raise exception '0042 S4.10 postcheck: the reopen edge is not present in the live trigger body'
      using errcode = 'CLR10';
  end if;
  -- THREE on the live body (the 0040 A2 note + the two comparison-set subtractions), FOUR
  -- after this recut: the reopen arm's own null test is the added one. Counted, not probed --
  -- a recut that dropped a subtraction and added two would pass a bare position() test.
  v_n := (length(v_def) - length(replace(v_def, 'counterpart_line_id', '')))
         / length('counterpart_line_id');
  if v_n <> 4 then
    raise exception '0042 S4.10 postcheck: counterpart_line_id appears % time(s) (expected 4: the 0040 A2 note, the two comparison-set subtractions, and the reopen arm''s null test)', v_n
      using errcode = 'CLR10';
  end if;
  if position('line_exception_transition_illegal' in v_def) = 0
     or position('line_exception_immutable' in v_def) = 0 then
    raise exception '0042 S4.10 postcheck: the recut lost one of the two live refusal tokens'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p
      where p.oid = 'clara._tf_bank_line_exception_transition()'::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S4.10 postcheck: the exception transition trigger changed owner'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.10 OK: the resolved->open reopen edge is lawful, total (all five resolution columns nulled) and narrow; both live refusal tokens survive and the immutability comparison set is unchanged.';
end $s4_10$;

-- =====================================================================================
-- S4.11 -- clara._tf_bank_settled_authority_belt (CoR): admission sites 2, 4, 5 and 7.
-- =====================================================================================
-- THE BELT IS THE STRUCTURAL BACKSTOP, so its widening is the one that has to be narrowest.
-- Four arms move and they move for three different reasons:
--   * site 2  (line-member INSERT) -- a PARKED group's line member is written while its
--     exception is still OPEN, so the existing resolved-then-booked door cannot see it. The
--     new door is the PARK: the group row exists by then (the group INSERT precedes the member
--     INSERT in the same statement sequence, and this trigger is DEFERRED and re-queries by
--     id at commit), it is `pending`, it carries a declaration, and the exception it names is
--     open ON THIS LINE.
--   * sites 4+5 (both member pending->live cascades) -- the flip. By commit the exception the
--     group names is RESOLVED with a booking disposition, which is the same statement the
--     belt's own exception arm asserts from the other side.
--   * site 7  (line-member pending->unmatched cascade) -- the parked cancel. The identity
--     column survives the cancel (that is the point of it) and names an exception on this very
--     line; nothing the park did was ever posted, so nothing certified moved. The exception's
--     CURRENT status is deliberately not a term -- see the predicate's own note: asking it put
--     this site out of step with site 6 and walled in a cancel the flip's refusal names as the
--     remedy (as-built ladder round 2).
-- live->unmatched cascades and entry-member pending->unmatched cascades are NOT admitted: a
-- live group's settlement has posted and IS priced into the receipt, and a pending group holds
-- zero entry members so the second case cannot arise at all.
--
-- ONE SHARED PREDICATE for sites 4, 5 and 7, so the two cascade arms cannot drift apart and
-- the tail has a single object to pin.
create function clara._bank_parked_cascade_admitted(p_match uuid, p_line uuid,
    p_old_status text, p_new_status text) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case
    -- SITES 4 AND 5 -- the parked FLIP. Evidence: the group's immutable identity column plus
    -- the named exception's own state AT COMMIT. clara.complete_pending_match resolved it in
    -- this same transaction, as the DECLARANT, with a booking disposition -- which is exactly
    -- what makes the line a lawful live member.
    when p_old_status = 'pending' and p_new_status = 'live' then exists (
      select 1 from clara.bank_matches bm
        join clara.bank_line_exceptions px on px.id = bm.resolution_exception_id
       where bm.id = p_match and px.status = 'resolved'
         and px.resolution_disposition in ('matched_booking', 'written_off_adjustment'))
    -- SITE 7 -- the parked CANCEL, LINE members only. Evidence: the identity column the cancel
    -- LEAVES INTACT, plus the named exception living on this very line. Nothing was posted,
    -- nothing certified moved, and the line goes back exactly where the receipt found it.
    --
    -- THE EXCEPTION'S STATUS IS DELIBERATELY NOT ASKED (as-built ladder round 2). The first cut
    -- demanded `px.status = 'open'` and that put site 7 out of step with SITE 6 -- the verb-side
    -- guard in clara.unmatch_bank_match, which asks only "pending + a declaration + the identity
    -- column". The two disagreed on exactly one reachable state and it was a WALLED CORRIDOR:
    -- while a group is parked, its named exception can still be closed by a DIRECT
    -- clara.resolve_bank_line_exception under the `bank_corrective_line` disposition (the only
    -- disposition the 0040 belt admits with no live match -- the other two refuse
    -- `disposition_unbooked` against a merely-pending group). The flip then refuses
    -- `pending_resolution_stale` and NAMES THE CANCEL AS THE REMEDY; site 6 admitted that
    -- cancel; and this predicate aborted it at COMMIT. The reservation could be neither
    -- completed nor released -- the class the ladder has already ruled a defect once.
    --
    -- ADMITTING IT IS ALSO ARITHMETICALLY RIGHT, not merely kinder. The receipt's matched set
    -- is `bm.status = 'live' OR (unmatched AND completed_at IS NOT NULL AND unmatched_at >
    -- cutoff)`, and a parked group is created with completed_at NULL and never goes live -- so
    -- neither the park nor its cancel is a term of any receipt. And excepted(P) is CUTOFF-GATED
    -- ("open" means resolved_at IS NULL or resolved_at > cutoff), so the direct resolution that
    -- made the declaration stale is itself invisible to every covering receipt. Meanwhile
    -- `bank_corrective_line` is the one disposition the C-c terms say lawfully leaves a line
    -- UNMATCHED -- so releasing the line is what that resolution actually requires.
    when p_old_status = 'pending' and p_new_status = 'unmatched' and p_line is not null then exists (
      select 1 from clara.bank_matches bm
        join clara.bank_line_exceptions px on px.id = bm.resolution_exception_id
       where bm.id = p_match and px.line_id = p_line)
    else false
  end;
$$;
revoke all on function clara._bank_parked_cascade_admitted(uuid,uuid,text,text) from public;

do $s4_11$
declare
  v_sig text := 'clara._tf_bank_settled_authority_belt()';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S4.11 prestate: the settled-authority belt is GONE' using errcode = 'CLR10';
  end if;
  if position('_bank_parked_cascade_admitted' in v_def) <> 0
     or position('pending_resolution' in v_def) <> 0
     or position('_wdb_assert_line_booking_lawful' in v_def) <> 0 then
    raise exception '0042 S4.11 prestate: the belt already carries the parked-declaration admissions or the one-standing-booking law -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('recon_period_settled', 4), ('disposition_unbooked', 1), ('line_already_matched', 2),
      ('exception_floor_breached', 2), ('completing_recon', 3),
      ('resolved_at > v_cover_at', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.11 prestate: the belt carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this splice against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- SPLICE 1 of 3 -- ADMISSION SITE 2 OF 7 (the line-member INSERT door). The 0040 A4-v2
  -- resolved-then-booked door is kept EXACTLY as it stands, `resolved_at > v_cover_at` and
  -- all: the park is a SECOND door beside it, never a relaxation of the first.
  v_frm := $f$      if not exists (select 1 from clara.bank_line_exceptions ex
                      where ex.line_id = m.line_id
                        and ex.status = 'resolved'
                        and ex.resolution_disposition in ('matched_booking','written_off_adjustment')
                        and ex.resolved_at > v_cover_at) then
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.11 prestate: the line-member resolved-door anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$      -- 0042 (D-b SS4, ADMISSION SITE 2 OF 7 [WDB-G9]): THE PARK IS A SECOND DOOR beside
      -- the 0040 A4-v2 resolved-then-booked door, never a widening of it. A parked resolution
      -- writes its line member while the exception is deliberately still OPEN -- the checker
      -- executes the declaration at the flip -- so no resolved row exists yet for the first
      -- door to find. What DOES exist, in this same transaction and re-queried here at commit,
      -- is the group: pending, carrying the owner's declaration, and naming an exception that
      -- is open ON THIS LINE. That state is arithmetically neutral for every covering receipt,
      -- because an open exception is precisely what excepted(P) already counted -- the park
      -- changes nothing the receipt certified, which is the whole reason it is a park and not
      -- a booking. The declaration's own exception_id must agree with the group's immutable
      -- identity column, so a stamped id alone can never open this door.
      if not exists (select 1 from clara.bank_line_exceptions ex
                      where ex.line_id = m.line_id
                        and ex.status = 'resolved'
                        and ex.resolution_disposition in ('matched_booking','written_off_adjustment')
                        and ex.resolved_at > v_cover_at)
         and not exists (select 1 from clara.bank_matches bm
                          join clara.bank_line_exceptions px on px.id = bm.resolution_exception_id
                          where bm.id = m.match_id and bm.status = 'pending'
                            and bm.pending_resolution is not null
                            and (bm.pending_resolution->>'exception_id')::uuid = px.id
                            and px.line_id = m.line_id and px.status = 'open') then
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 2 of 3 -- ADMISSION SITES 4 AND 7 (the line-member UPDATE arm).
  v_frm := $f$    raise exception 'statement line % lies in a reconciled period; its match cannot be released or completed until that reconciliation is voided', m.line_id
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.11 prestate: the line-member UPDATE refusal anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$    -- 0042 (D-b SS4, ADMISSION SITES 4 AND 7 OF 7 [WDB-G9]): the two PARKED cascades pass.
    -- pending->live is the flip executing the owner's declared resolution; pending->unmatched
    -- is the cancel putting the line back exactly where the receipt found it. Everything else
    -- -- above all a live->unmatched release, whose settlement HAS posted and IS priced into
    -- the receipt -- keeps the unconditional refusal below.
    if clara._bank_parked_cascade_admitted(m.match_id, m.line_id,
         old.group_status, new.group_status) then
      return null;
    end if;
    raise exception 'statement line % lies in a reconciled period; its match cannot be released or completed until that reconciliation is voided', m.line_id
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 3 of 3 -- ADMISSION SITE 5 (the entry-member UPDATE arm). Only the flip can reach
  -- it: a pending group holds ZERO entry members (settle_from_bank_line writes them on the
  -- live branch only), so pending->unmatched is unreachable here and the shared predicate
  -- answers false for it anyway (p_line is null on this arm).
  v_frm := $f$  raise exception 'bank match % holds statement line(s) in a reconciled period; it cannot be released or completed until that reconciliation is voided', m.match_id
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.11 prestate: the entry-member UPDATE refusal anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  -- 0042 (D-b SS4, ADMISSION SITE 5 OF 7 [WDB-G9]): the parked FLIP's entry members pass.
  -- clara.complete_pending_match writes the settlement (and any deferred ancillary) as
  -- 'pending' members and then flips the group, so these rows cascade pending->live in the
  -- same statement the line members do; admitting one cascade and refusing the other would
  -- wedge the flip halfway. The predicate is the shared one, and it reads the group's
  -- immutable identity plus the named exception's resolved-with-booking state at commit.
  if clara._bank_parked_cascade_admitted(m.match_id, null,
       old.group_status, new.group_status) then
    return null;
  end if;
  raise exception 'bank match % holds statement line(s) in a reconciled period; it cannot be released or completed until that reconciliation is voided', m.match_id
$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- SPLICE 4 of 4 -- AS-BUILT LADDER ROUND 4: THE ONE-STANDING-BOOKING LAW LANDS HERE, ON THE
  -- ONE ROW EVERY BOOKING DOOR MUST WRITE, AND *BEFORE* THE SETTLED-PERIOD EARLY RETURN.
  --
  -- Placement is the whole fix. Round 3 spliced the law into clara.resolve_and_book_bank_line
  -- alone, so the older always-public pair (clara.resolve_bank_line_exception +
  -- clara.match_bank_line in one transaction) walked straight past it and re-booked a released
  -- line -- 84,000 of bank GL for one 42,000 statement line, with `blockers: []` on the
  -- reconciliation receipt. The census that decided this site: the ONLY bodies that insert
  -- clara.bank_match_line_members are clara._settle_from_bank_line_core and both
  -- clara.match_bank_line overloads, and every group status transition reaches the SAME row as
  -- an UPDATE through fk_bmlm_match_status's ON UPDATE CASCADE. So this arm sees every booking,
  -- every flip, every release and every cancel, from every door that exists or will exist --
  -- including doors that never heard of this migration.
  --
  -- IT MUST SIT ABOVE `if v_n = 0 then return null; end if;`. That early return is the
  -- settled-period gate: below it, a line whose account carries no complete reconciliation is
  -- waved through, which is nearly every line. A law placed under it would be a law that only
  -- applies to reconciled months -- and the reachable defect is in UNreconciled ones.
  v_frm := $f$  if tg_table_name = 'bank_match_line_members' then
    select * into m from clara.bank_match_line_members mm where mm.id = new.id;
    if not found then return null; end if;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S4.11 prestate: the line-member arm head anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  if tg_table_name = 'bank_match_line_members' then
    select * into m from clara.bank_match_line_members mm where mm.id = new.id;
    if not found then return null; end if;
    -- 0042 (as-built ladder round 4): AT MOST ONE STANDING BOOKING PER LINE, and the line's
    -- exception state and match state may never disagree about whether it is booked. Both
    -- halves live in ONE shared body (S4.6B) that reads ONE shared derivation (S4.6A) -- the
    -- same derivation clara.resolve_and_book_bank_line refuses on and clara.unmatch_bank_match
    -- reports from -- so no door can be walled by a rule another door does not know.
    -- DELIBERATELY UNCONDITIONAL and deliberately ABOVE the settled-period machinery: this law
    -- is not about reconciled periods.
    -- ROUND 5: m.group_status travels too, because the law is asked on the parked FLIP as well
    -- as on the INSERT (S4.6B carries the derivation). m.group_status is the row re-queried by
    -- id at COMMIT, i.e. the NEW status -- `old` is deliberately not touched here, since it is
    -- unassigned on the INSERT path this same line serves.
    perform clara._wdb_assert_line_booking_lawful(m.line_id, m.match_id, tg_op, m.group_status);
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- ROUND 4: the law is asked EXACTLY once, and it is asked BEFORE the settled-period early
  -- return -- the "a writer changed and its readers did not" lesson, pinned as a position test
  -- rather than left to a reviewer's eye.
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._wdb_assert_line_booking_lawful(', '')))
           / length('clara._wdb_assert_line_booking_lawful(');
  if v_cnt <> 1 then
    raise exception '0042 S4.11 postcheck: the one-standing-booking law is asked % time(s), expected exactly 1 (the line-member arm)', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('clara._wdb_assert_line_booking_lawful(' in v_def)
     > position('if v_n = 0 then return null; end if;' in v_def) then
    raise exception '0042 S4.11 postcheck: the one-standing-booking law landed BELOW the settled-period early return -- it would then apply only to reconciled periods, and the defect it closes lives in unreconciled ones'
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._bank_parked_cascade_admitted(', '')))
           / length('clara._bank_parked_cascade_admitted(');
  if v_cnt <> 2 then
    raise exception '0042 S4.11 postcheck: the shared cascade predicate is called % time(s), expected 2 (one per member arm)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'bm.pending_resolution is not null', '')))
           / length('bm.pending_resolution is not null');
  if v_cnt <> 1 then
    raise exception '0042 S4.11 postcheck: the line-member INSERT park door landed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  -- ANTI-VACUITY: the ORIGINAL doors must all still be there. A splice that accidentally
  -- replaced the resolved-then-booked door instead of adding beside it would leave these
  -- counts intact only if nothing was lost.
  for r in select * from (values
      ('recon_period_settled', 4), ('disposition_unbooked', 1), ('line_already_matched', 2),
      ('exception_floor_breached', 2), ('completing_recon', 3),
      ('resolved_at > v_cover_at', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S4.11 postcheck: marker "%" is now % (expected %) -- the splice damaged the belt', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S4.11 postcheck: the settled-authority belt changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.11 OK: the belt admits the park INSERT (site 2), both pending->live cascades (sites 4 and 5) and the pending->unmatched line cascade (site 7) through one shared predicate; all six pre-existing doors and refusals survive at their measured counts.';
end $s4_11$;

-- #####################################################################################
-- ############### S4.12 -- THE bank_rule_suggested PRODUCER (design SS5) ##############
-- #####################################################################################
-- WD-R13's second D-b item. 0040 shipped the CONSUMER side of this feature complete and the
-- producer side empty, on purpose: clara.list_bank_line_suggestions evaluates signed coding
-- rules over a statement's unmatched, unexcepted lines and returns them as READS (no rule ever
-- executes anything), and 0040's S5 splice already installed the sighting CARVE-OUT inside
-- clara._approve_entry_core keyed on the `bank_rule_suggested` flag -- shipped AHEAD of its
-- producer so the suggestion-to-draft path could never land without its guard in place. This
-- section is that producer, and it stamps exactly the key the carve-out already watches for.
--
-- THE CARVE-OUT NEEDS NO RECUT (measured against the LIVE clara._approve_entry_core body, not
-- inferred): the flag test `and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested')`
-- is live today at the sighting-accrual site, and 0040's own tail pins the token at exactly
-- two occurrences (one comment, one live test). Nothing in this migration touches it.
--
-- THE DEDUP LAW [L5/C5-4]. At most ONE `bank_rule_suggested` entry per statement line across
-- `status in ('draft','approved') and reversed_by is null`. The APPROVED half is the one that
-- matters and it is not obvious: an accepted suggestion that has been approved but not yet
-- matched to its line is still an outstanding claim on that line, and a second accept would
-- mint a second entry for one bank movement -- the double-post the whole feature exists to
-- avoid. Two enforcers, deliberately: a partial unique EXPRESSION index (the structural
-- guarantee, which also closes the concurrent case) and a row-locked precheck (the message a
-- human can act on).
create unique index uq_je_bank_rule_suggested_line
  on clara.journal_entries ((flags -> 'bank_rule_suggested' ->> 'line_id'))
  where (flags ? 'bank_rule_suggested')
    and status in ('draft', 'approved')
    and reversed_by is null;

-- =====================================================================================
-- clara.accept_bank_rule_suggestion (ABI SSA; bookkeeper+).
-- =====================================================================================
-- A HUMAN CLICKING A CHIP, recorded as an audited act. The rule does not execute: a human
-- accepted a pre-fill, the DB derived the legs from the signed proposal, and what lands is an
-- ordinary DRAFT on the ordinary /queue lane -- where a checker approves it and
-- clara._adj_on_approve arm (3) re-asks every question this verb asked.
--
-- THE DERIVATION IS NOT THIS VERB'S. clara._wdb_suggestion_rule_hit and
-- clara._wdb_suggestion_lines (SECTION S2) are the single owners of "does this rule still
-- match this line" and "what legs does it derive", and BOTH this verb and the approve-time
-- arm read them. That is the whole mechanism: arm (3) proves the draft's stored legs are
-- still byte-equal to what the rule derives TODAY, and a second derivation here would only
-- ever prove that two pieces of code agree with themselves. In particular the LEG ORDER is
-- the derivation's, not this verb's -- DEBIT LEG FIRST -- because arm (3) compares an ordered
-- array against `order by line_no`, so line_no 1 must be derived[0] or every approval of a
-- suggested draft would refuse `suggestion_stale` on axis `legs`.
--
-- DIRECT INSERT, not clara.draft_entry (the SS9.5 law, and wave-d-contract SS3's named trap):
-- clara._draft_entry_core extracts only three named booleans out of p_flags, so the
-- `bank_rule_suggested` key handed to it would be SILENTLY DROPPED -- and a dropped key means
-- the 0040 sighting carve-out never fires and three assisted approvals breed a vendor_account
-- autopost rule out of a bank rule's own output. The entry is FK-anchored to the statement
-- line, so it carries no client resolution (the design SS4 attribution posture: the
-- attribution invariant binds where attribution is a QUESTION, and here it is not).
create function clara.accept_bank_rule_suggestion(p_client uuid, p_line uuid, p_rule uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; r record; l record; s record;
  v_lines jsonb; v_memo text; v_acct text; v_coa text; v_entry uuid; v_out uuid;
  v_breach jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- ABI SSE: ('rule', p_rule, 'line', p_line). Everything else this verb writes is DERIVED
  -- from those two ids and the signed rule, so there is nothing else a replay could differ in.
  v_dedupe := clara._reserve_op(c.firm, 'accept_bank_rule_suggestion', p_op_key,
    clara._hash(jsonb_build_object('rule', p_rule, 'line', p_line)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- LOCKS: the client rung, then the LINE ROW -- the match_bank_line order. The line row is
  -- the serialization point for "is there already an outstanding suggestion on this line":
  -- two accepts on one line must not both pass their own unlocked read.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform 1 from clara.bank_statement_lines bl where bl.id = p_line for update;

  -- (1) THE RULE: SIGNED, coding-kind, this client's. A retired or still-proposed rule is not
  -- authority, and a match_settle rule proposes a SETTLEMENT -- judgement about which bills a
  -- payment clears -- which is never a coding suggestion. Same three tests arm (3) re-asks.
  select * into r from clara.bank_rules br where br.id = p_rule;
  if not found or r.firm_id <> c.firm or r.client_id <> p_client
     or r.status <> 'signed' or r.kind <> 'coding' then
    raise exception 'bank rule % is not a signed coding rule for this client', p_rule
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'rule_not_signed', 'rule_id', p_rule)::text;
  end if;

  -- (2) THE LINE AND ITS STATEMENT. A void statement is not a period the books may still be
  -- coded against -- the structural `wrong_period` law every bank writer carries.
  select * into l from clara.bank_statement_lines bl where bl.id = p_line;
  if not found or l.client_id <> p_client or l.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode = 'CLR11';
  end if;
  select * into s from clara.bank_statements bs where bs.id = l.statement_id;
  if not found or s.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a coding suggestion', p_line, coalesce(s.status, 'missing')
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'wrong_period', 'line_id', p_line,
          'statement_id', l.statement_id, 'statement_status', s.status)::text;
  end if;

  -- (3) UNMATCHED AND UNEXCEPTED -- byte-for-byte the population
  -- clara.list_bank_line_suggestions offers from (0040:4659-4665), which is the population
  -- the chip the human clicked came out of. The exception test is deliberately ANY exception
  -- row, open OR resolved: a line that has been through the exception door has a
  -- professional's judgement attached to it, and a signed pattern rule does not code over it.
  if exists (select 1 from clara.bank_match_line_members m
             where m.line_id = p_line and m.group_status in ('pending', 'live')) then
    raise exception 'statement line % already rides a pending or live match; there is nothing left to code', p_line
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'already_matched', 'line_id', p_line)::text;
  end if;
  if exists (select 1 from clara.bank_line_exceptions e where e.line_id = p_line) then
    raise exception 'statement line % carries a bank-line exception; book it through clara.resolve_and_book_bank_line rather than coding it from a rule', p_line
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'line_excepted', 'line_id', p_line)::text;
  end if;

  -- (4) THE PREDICATE STILL MATCHES, through the SHARED body. A suggestion is a READ and
  -- reads go stale: the statement may have been re-imported, the description re-parsed, the
  -- rule superseded, all between the chip rendering and the click.
  if not clara._wdb_suggestion_rule_hit(p_line, p_rule) then
    raise exception 'bank rule % no longer matches statement line %', p_rule, p_line
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'rule_no_longer_matches', 'rule_id', p_rule,
          'line_id', p_line)::text;
  end if;

  -- (5) THE DEDUP PRECHECK, under the line lock (the friendly half of the law -- the partial
  -- unique index above is the structural half). APPROVED-BUT-UNMATCHED counts: it is still an
  -- outstanding claim on this bank movement, and a second accept would double-post it.
  select je.id into v_out from clara.journal_entries je
    where je.client_id = p_client
      and je.flags ? 'bank_rule_suggested'
      and (je.flags -> 'bank_rule_suggested' ->> 'line_id') = p_line::text
      and je.status in ('draft', 'approved') and je.reversed_by is null
    limit 1;
  if v_out is not null then
    raise exception 'statement line % already carries an outstanding suggested entry (%); withdraw or reverse it before accepting another suggestion', p_line, v_out
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'suggestion_outstanding', 'line_id', p_line,
          'entry_id', v_out)::text;
  end if;

  -- (6) THE LEGS, from the shared derivation. It returns NULL when the line, its bank
  -- binding or the rule's proposed account cannot be resolved -- every caller treats that as
  -- a refusal, and this one says which of the three is missing in the message it can.
  v_lines := clara._wdb_suggestion_lines(p_client, p_line, p_rule);
  if v_lines is null or jsonb_array_length(v_lines) <> 2 then
    raise exception 'bank rule % derives no coding for statement line % (the rule names no account_code, or the line''s bank account has no mapped GL account)', p_rule, p_line
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'suggestion_underivable', 'rule_id', p_rule,
          'line_id', p_line)::text;
  end if;
  -- THE CONTRA ACCOUNT IS VALIDATED HERE AND ONLY HERE, argument-time. The shared derivation
  -- deliberately computes rather than judges (it is the byte-equality reference arm (3)
  -- compares against, and a reference that raises is no reference at all), so the account
  -- tests live at the door: ACTIVE, on this client's chart, NON-CONTROL, and never the bank
  -- account itself. account_class IS NULL is the load-bearing half -- a control-class contra
  -- would mint a payable or receivable leg with no counterparty resolution behind it, which
  -- is a subledger item invented by a pattern match.
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = l.bank_account_id;
  v_acct := btrim(coalesce(r.proposal ->> 'account_code', ''));
  if v_acct = '' or v_acct = v_coa
     or not exists (select 1 from clara.coa_accounts a
                    where a.client_id = p_client and a.account_code = v_acct
                      and a.is_active and a.account_class is null) then
    raise exception 'bank rule % proposes account "%", which is not an active, non-control account of this client (and never the bank account itself)', p_rule, v_acct
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'suggestion_account_invalid', 'rule_id', p_rule,
          'account_code', v_acct)::text;
  end if;
  -- ...AND IT MUST NOT BE A CODE ANOTHER REGISTER ALREADY OWNS (as-built ladder round 2 -- THE
  -- PHANTOM STAFF ADVANCE). The four tests above are about the CHART; this one is about the
  -- REGISTERS, and its absence was a MONEY defect: a signed coding rule pointed at an ENROLLED
  -- STAFF-ADVANCE account, accepted on a money-OUT line, derives a DEBIT on that account,
  -- approves clean, and SECTION S3's clara._adv_on_approve arm (3) SOFT-BIRTHS a staff advance
  -- -- so clara.staff_advance_statement says a named person owes the firm money they never
  -- received, while the GL, the entry and clara.staff_advance_tie all agree to the sen and no
  -- instrument fires. An FA cost / accum / expense role is the same defect from the other
  -- family. The sibling producer for adjustment TEMPLATE lines has carried this test since
  -- SS2.1; this door did not, and the two are the same act on the same registers.
  --
  -- ONE BODY, THE SHARED ONE: clara._adj_line_eligibility_breach over clara._acct_role_reserved
  -- (design SS2.1's message-neutral census). The CONTRA leg ALONE is asked -- the other derived
  -- leg IS this client's bank account and that body would refuse it on its own `bank_account`
  -- axis -- and the code asked about is the rule's own `proposal ->> 'account_code'`, which is
  -- exactly what clara._wdb_suggestion_lines derives from. clara._adj_on_approve arm (3)
  -- re-asks the SAME question through the SAME body at approve, because an account can be
  -- enrolled between this accept and the checker's approval; neither site touches the shared
  -- derivation, so the byte-equality the two sides depend on is untouched.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct)));
  if v_breach is not null then
    raise exception 'bank rule % proposes account "%", which cannot carry a coding suggestion (%); retire the rule and propose one naming an ordinary, unreserved account', p_rule, v_acct, v_breach ->> 'axis'
      using errcode = 'CLR10',
        detail = (jsonb_build_object('reason', 'suggestion_line_ineligible', 'rule_id', p_rule,
          'line_id', p_line) || v_breach)::text;
  end if;
  -- narration_template is VERBATIM text (the memo_template grammar of ABI SSC, restated for
  -- the coding proposal): no interpolation, no substitution, in v1. The memo is NOT part of
  -- the derived leg set, so it is this verb's to synthesise when the rule states none --
  -- ck_je_basis demands a document or a memo, and a coded bank line has no document.
  v_memo := coalesce(nullif(btrim(coalesce(r.proposal ->> 'narration_template', '')), ''),
    'Bank line coded from a signed rule');

  -- The INSERT is wrapped ALONE, so the handler can only ever be answering the dedup index.
  -- uq_je_bank_rule_suggested_line: a concurrent accept won the race between the precheck and
  -- this write. Translated back into the SAME named refusal so the racing path and the
  -- ordinary path look identical to the human (the 0038:4080-4084 idiom); the index name is
  -- deliberately not cited, so a rename cannot silently turn this into a raw 23505.
  begin
    insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
        coding_kind, maker_actor, last_human_editor, flags)
      values (p_client, 'draft', l.entry_date, v_memo, 'manual', null, c.actor, c.actor,
        jsonb_build_object('bank_rule_suggested',
          jsonb_build_object('rule_id', p_rule, 'line_id', p_line)))
      returning id into v_entry;
  exception when unique_violation then
    raise exception 'statement line % already carries an outstanding suggested entry; withdraw or reverse it before accepting another suggestion', p_line
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'suggestion_outstanding',
          'line_id', p_line)::text;
  end;

  -- line_no follows the DERIVATION'S OWN ORDER (with ordinality), never a convention of this
  -- verb's: arm (3) compares `order by line_no` against the derived array position for
  -- position, so any re-ordering here is a refusal at every future approval.
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    select v_entry, x.ord::int, x.elem ->> 'account_code',
           (x.elem ->> 'debit_cents')::bigint, (x.elem ->> 'credit_cents')::bigint,
           v_memo, null
      from jsonb_array_elements(v_lines) with ordinality as x(elem, ord);
  perform clara._assert_balanced(v_entry);

  perform clara._audit(c.firm, c.actor, null, null, 'accept_bank_rule_suggestion', v_entry,
    jsonb_build_object('client', p_client, 'line_id', p_line, 'rule_id', p_rule,
      'account_code', v_acct, 'bank_account_code', v_coa,
      'amount_cents', abs(l.amount_cents), 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'accept_bank_rule_suggestion', p_op_key,
    jsonb_build_object('entry_id', v_entry));
end $$;
revoke all on function clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text) from public;

-- #####################################################################################
-- ####### S4.12b -- THE RECON EXCEPTIONS TABLE BADGES "resolution parked" #############
-- #####################################################################################
-- Design SS4's closing sentence -- "The exceptions table badges 'resolution parked'" -- with
-- the MECHANISM the ladder pinned for it [L2/FA6+FA7 MAJOR]: "the recon exceptions table
-- badges 'resolution parked' via a READ JOIN on the group's `pending_resolution`". Without
-- this, the /bank pane cannot tell "open, nobody has touched it" apart from "an owner has
-- declared its resolution and a checker is holding the money" -- a whole professional
-- judgement, invisible.
--
-- WHY THE PREVIEW AND NOT clara._bank_recon_terms. The exceptions enumeration is built ONCE,
-- inside clara._bank_recon_terms, and that function is the SINGLE owner of both the live
-- preview AND the CERTIFIED receipt snapshot (0040's ratified receipt law: "verification
-- recomputes under the cutoff and reproduces the receipt byte-exactly forever"). Adding a key
-- there would change the bytes of every already-certified month -- BELCORT's nine real RPR
-- receipts among them -- for a datum that is provably ALWAYS NULL on that path: a parked
-- declaration lives only on a group with status='pending', and a pending group on the
-- statement is a HARD completion blocker (`recon_line_reserved`), so no receipt can ever be
-- certified while one exists. The badge is therefore a LIVE-PREVIEW fact, and it is attached
-- where the preview is assembled: the last line of clara.get_bank_reconciliation, on its
-- preview branch only. The two receipt branches (the complete body and the void sidecar)
-- return their STORED snapshots and are not touched.
-- (The section is already running as clara_fn_owner -- the S4.1 `set role` above holds until
-- the S4.13 `reset role` -- so the new body is owned correctly without a second switch.)

-- The single owner of the join. `pending_resolution` is carried through under the ABI SSD
-- column's OWN name (the dashboard's reconSnapshotModel reads exactly that key), and the key
-- is ALWAYS PRESENT -- json null on an ordinary exception -- so a reader never has to tell
-- "absent key" from "not parked". Order is preserved through `with ordinality`.
create function clara._bank_recon_snapshot_parked(p_snapshot jsonb) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case
    when p_snapshot is null or jsonb_typeof(p_snapshot->'exceptions') <> 'array'
      then p_snapshot
    else jsonb_set(p_snapshot, '{exceptions}', coalesce((
        select jsonb_agg(x.elem || jsonb_build_object('pending_resolution', (
                 select bm.pending_resolution
                   from clara.bank_matches bm
                  where bm.status = 'pending'
                    and bm.pending_resolution is not null
                    and (bm.pending_resolution->>'exception_id')::uuid
                        = (x.elem->>'exception_id')::uuid
                    -- AND the group must actually OWN this row's line. The
                    -- declaration is only true of the reservation holding THIS
                    -- money; the membership test is also what keeps a SECURITY
                    -- DEFINER read that bypasses RLS from ever reaching a group
                    -- outside the statement the caller was already scoped to.
                    and exists (select 1 from clara.bank_match_line_members lm
                                 where lm.match_id = bm.id
                                   and lm.line_id = (x.elem->>'line_id')::uuid)
                  limit 1))
                 order by x.ord)
          from jsonb_array_elements(p_snapshot->'exceptions') with ordinality as x(elem, ord)),
      '[]'::jsonb))
  end;
$$;
revoke all on function clara._bank_recon_snapshot_parked(jsonb) from public;

-- THE RECUT (chain-of-recut law: spliced against the LIVE body, never file text).
do $s4_12b$
declare
  v_sig text := 'clara.get_bank_reconciliation(uuid)';
  v_def text; v_from text; v_to text; v_n int;
begin
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position('_bank_recon_snapshot_parked' in v_def) <> 0 then
    raise exception '0042 S4.12b prestate: clara.get_bank_reconciliation already badges the parked declaration -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- ANTI-VACUITY: the preview branch's snapshot handoff must exist EXACTLY ONCE, and the two
  -- receipt branches must be visibly untouched by it.
  v_from := $p$    'snapshot', v_terms->'snapshot');$p$;
  v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception '0042 S4.12b prestate: the preview snapshot handoff appears % times in clara.get_bank_reconciliation (expected exactly 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, $p$'snapshot', v_receipt.snapshot)$p$, '')))
         / length($p$'snapshot', v_receipt.snapshot)$p$);
  if v_n <> 1 then
    raise exception '0042 S4.12b prestate: the COMPLETE-receipt branch is not where it was (% occurrences)', v_n
      using errcode = 'CLR10';
  end if;
  v_to := $p$    'snapshot', clara._bank_recon_snapshot_parked(v_terms->'snapshot'));$p$;
  execute replace(v_def, v_from, v_to);

  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position('_bank_recon_snapshot_parked' in v_def) = 0 then
    raise exception '0042 S4.12b postcheck: the badge join did not land' using errcode = 'CLR10';
  end if;
  if position($p$'snapshot', v_receipt.snapshot)$p$ in v_def) = 0
     or position($p$'snapshot', v_void.snapshot)$p$ in v_def) = 0 then
    raise exception '0042 S4.12b postcheck: a RECEIPT branch was damaged -- a certified snapshot must be returned exactly as stored'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.12b OK: the LIVE reconciliation preview carries pending_resolution on every exceptions[] row (json null when not parked), so the /bank exceptions table can badge "resolution parked"; both receipt branches return their stored snapshots byte-unchanged.';
end $s4_12b$;

-- =====================================================================================
-- S4.13 -- ACLs (the 0041:4405-4440 idiom): revoke from PUBLIC, grant to
-- clara_authenticated ONLY, re-assert clara_fn_owner ownership.
-- =====================================================================================
-- BOTH new verbs are HUMAN verbs and reach clara_authenticated only -- no wake role, no
-- clara_runtime, no clara_agent_ro. Their FLOORS live in the bodies (owner for the composite,
-- bookkeeper+ for the producer) because a floor is a statement about the ACTOR, which only
-- clara._human_ctx can make; the grant is a statement about the ROLE, and both are needed.
--
-- The three cores, the two hash primitives, the cascade predicate and the shared
-- booking-block predicate are granted to NOBODY
-- (and SECTION S2's two suggestion bodies keep their own revokes): every caller is itself a
-- SECURITY DEFINER function owned by
-- clara_fn_owner, which holds EXECUTE implicitly as owner. Each still carries its own explicit
-- revoke above, because PostgreSQL grants EXECUTE to PUBLIC on every new function by default
-- and ALTER DEFAULT PRIVILEGES does not stop it (0037:3416-3419 / 0038:5273-5276).
--
-- The four RECUT public verbs (allocate_receipt, allocate_payment and both
-- settle_from_bank_line overloads) were CREATE OR REPLACE'd, so their pre-existing ACLs and
-- ownership survive untouched and are deliberately NOT re-granted here -- re-granting would
-- hide an ACL that had drifted.
-- [SPLIT D-b3 2026-08-04] THE PRODUCER'S AUTHENTICATED GRANT IS WITHHELD AT THIS FRONTIER AND SHIPS
-- WITH D-b2 (0045). THIS IS THE ONE PLACE SECTION S4 IS NOT BYTE-EXACT CANONICAL, and it is a
-- MONEY finding rather than a tidiness one. MEASURED on a live 0044-frontier rig by the
-- confirming round (lens CF-B3-1, independently confirmed by the Codex lens CX1), and refused on
-- the four-slice control, so the exposure is CREATED BY THE PARTITION and is not inherited from
-- the whole unit:
--
--   clara.accept_bank_rule_suggestion HAS TWO ACCOUNT-ROLE DOORS AND ONLY ONE OF THEM IS HERE.
--   The ACCEPT-time door ships in this file (clara._adj_line_eligibility_breach, D-b0's, called
--   by the verb before it mints the draft). The APPROVE-time door is clara._adj_on_approve
--   ARM (3) -- "THE SIXTH AXIS ... the PHANTOM STAFF ADVANCE", as-built ladder round 2 -- and
--   that body is D-b2's, reaching the approve path only when 0045's S5.8-b2 splices it into
--   clara._subledger_on_approve. Between 0044 and 0045 the window is open, and 0043 shipped BOTH
--   halves that make it a money hole: clara.enrol_staff_advance_account (the verb that opens it)
--   and clara._adv_on_approve arm (3) (the soft birth that mints the phantom).
--
--   THE SEQUENCE, PROBED END TO END: accept a money-OUT suggestion whose contra account is an
--   ordinary account; ENROL that account as a staff-advance account; approve. The approve
--   SUCCEEDS, a clara.staff_advances row is born against a named person nobody paid, and
--   clara.staff_advance_summary / clara.staff_advance_statement / clara.staff_advance_tie ALL
--   agree with it (tie true, difference_cents 0). That is what separates this from the staleness
--   axes recorded beside it: those leave a VISIBLE unexplained GL movement the bank
--   reconciliation cannot close over; this leaves an INVISIBLE person-level claim every
--   instrument in the product ties over. On the four-slice chain the identical script is refused
--   CLR39 `suggestion_stale` on the `line_eligibility` axis and the register stays empty.
--
-- WHAT IS WITHHELD IS EXACTLY ONE STATEMENT. The verb is still CREATED by SECTION S4 above, is
-- still REVOKED from PUBLIC and is still OWNED by clara_fn_owner (the block below does both), so
-- no body, no index, no caller and no prestate changes and no later slice re-creates it. What an
-- authenticated caller meets until 0045 is a ROLE-LEVEL refusal -- `permission denied for
-- function accept_bank_rule_suggestion` -- which is the structural door this repo prefers to a
-- body check, and it closes CF-B3-2/CX2 (a revised suggestion draft) and CX4 (rollback
-- asymmetry) with it, because the door that mints those drafts is the same door.
-- D-b2 ADDS THE SINGLE GRANT beside its own S2.9 loop, so the four-slice end state is the whole
-- unit's grant for grant -- the twin-rig equivalence proof is unaffected and was re-measured.
-- CARRIED BY THE OTHER LANES, recorded here so a reader of the SQL finds them: the producer's
-- dashboard chip (the reconApi wrapper + the /bank coding chip) and every test cell whose subject
-- is the GRANTED verb defer to D-b2 with the grant.
-- FINAL FORM: D-b2's. This block reaches its whole-unit shape when 0045 adds the withheld grant.
do $s4_acl$ declare f text; begin
  foreach f in array array[
      'clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $s4_acl$;

-- [SPLIT D-b3 2026-08-04] THE PRODUCER'S OWN ACL BLOCK: the canonical loop's FIRST and THIRD statements,
-- byte-for-byte in effect, with the SECOND (the authenticated grant) deliberately absent per the
-- note above. Kept as its own block rather than folded into $s4_owner$ below, because that block
-- says in as many words that its members are granted to NOBODY and reach their callers as owner;
-- this verb is a HUMAN verb whose grant is DEFERRED BY ONE SLICE, which is a different fact and
-- must not be filed under the other one. A postcheck rather than a comment keeps it honest: the
-- block asserts, on the live catalog, that NO non-owner role can reach this function at all.
--
-- [light re-confirm RC1] THE ASSERT IS THE COMPLETE NON-OWNER ACL, NOT ONE ROW. It used to
-- count only the direct clara_authenticated EXECUTE aclitem, and Codex read that correctly as
-- narrower than the claim above it: a `alter default privileges` in force on this schema, or a
-- between-slice hotfix granting EXECUTE to clara_runtime, clara_agent_ro or any role
-- clara_authenticated INHERITS, leaves the producer reachable while a one-row count still
-- reads 0. So the block now asserts BOTH halves of "unreachable": (a) the ROSTER -- every
-- non-owner grantee in proacl, PUBLIC included, must be empty, which is what aclexplode
-- actually measures; and (b) EFFECTIVE REACHABILITY -- has_function_privilege() is false for
-- each of the three clara roles a human or the runtime can arrive as, which is the only
-- instrument that sees inherited and default-privilege grants. Two instruments because they
-- fail differently: the roster names the illicit grantee, the privilege check catches the
-- grant that never appears in this function's own proacl.
do $s4_acl_b3_withheld$
declare
  f text := 'clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)';
  v_oid oid;
  v_n int;
  v_roster text;
  r record;
begin
  execute format('revoke all on function %s from public', f);
  execute format('alter function %s owner to clara_fn_owner', f);
  -- NO `grant execute ... to clara_authenticated` HERE. D-b2 (0045) adds it.
  select p.oid into v_oid
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname = 'accept_bank_rule_suggestion';
  if v_oid is null then
    raise exception '0042 S4.13 (D-b3 slice): clara.accept_bank_rule_suggestion does not exist at its own ACL block -- SECTION S4 above should have created it'
      using errcode = 'CLR10';
  end if;

  -- (a) THE COMPLETE NON-OWNER ACL ROSTER. `grantee = 0` is PUBLIC; anything else that is not
  -- the owner is a grant to somebody. Not restricted to EXECUTE: this function has no other
  -- privilege kind to hold, so any aclitem here at all is a finding.
  select count(*)::int, coalesce(string_agg(distinct g, ', ' order by g), '(none)')
    into v_n, v_roster
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
    cross join lateral (select case when a.grantee = 0 then 'PUBLIC'
                                    else coalesce((select rolname from pg_roles where oid = a.grantee),
                                                  'oid ' || a.grantee::text) end) as x(g)
   where p.oid = v_oid
     and a.grantee <> p.proowner;
  if v_n <> 0 then
    raise exception '0042 S4.13 (D-b3 slice): clara.accept_bank_rule_suggestion carries % non-owner ACL entr(y/ies) at the 0044 frontier (grantees: %) -- the producer''s approve-time account-role door (clara._adj_on_approve arm (3)) does not exist until D-b2, and the phantom staff advance is reachable while ANY non-owner can execute it. The grant belongs to 0045.', v_n, v_roster
      using errcode = 'CLR10';
  end if;

  -- (b) EFFECTIVE REACHABILITY, the instrument the roster cannot be: has_function_privilege
  -- resolves role INHERITANCE and default privileges, so a grant to a role clara_authenticated
  -- is a member of -- which leaves proacl empty for this OID -- is caught here and only here.
  for r in select rolname from (values ('clara_authenticated'), ('clara_runtime'), ('clara_agent_ro'))
             as t(rolname) loop
    if to_regrole(r.rolname) is not null
       and has_function_privilege(r.rolname, v_oid, 'EXECUTE') then
      raise exception '0042 S4.13 (D-b3 slice): % can EXECUTE clara.accept_bank_rule_suggestion at the 0044 frontier even though this function''s own ACL is empty -- an inherited or default-privilege grant is in force. The producer must be unreachable until D-b2 ships clara._adj_on_approve arm (3).', r.rolname
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '0042 S4.13 OK (D-b3 slice): clara.resolve_and_book_bank_line is granted to clara_authenticated; clara.accept_bank_rule_suggestion is created, revoked from PUBLIC and owned by clara_fn_owner with an EMPTY non-owner ACL and NO effective EXECUTE for clara_authenticated / clara_runtime / clara_agent_ro -- its authenticated grant ships with D-b2 (0045), beside clara._adj_on_approve arm (3).';
end $s4_acl_b3_withheld$;

do $s4_owner$ declare f text; begin
  foreach f in array array[
      'clara._bank_adjustments_norm(jsonb)',
      'clara._settle_request_hash(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,uuid)',
      'clara._allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara._allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara._settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
      'clara._bank_parked_cascade_admitted(uuid,uuid,text,text)',
      'clara._wdb_born_in_booking_act(uuid,uuid)',
      'clara._wdb_exception_booking_block(uuid)',
      'clara._wdb_line_booking_block(uuid,uuid,uuid)',
      'clara._wdb_assert_line_booking_lawful(uuid,uuid,text,text)',
      'clara._bank_recon_snapshot_parked(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $s4_owner$;

reset role;

-- =====================================================================================
-- S4.6C (LATE HALF) -- THE CLOSED DOOR SET, RE-MEASURED AFTER EVERY SPLICE THIS SECTION MAKES
-- (as-built ladder round 7).
-- =====================================================================================
-- S4.6C proper runs beside the law it guards, which is BEFORE S4.7 creates the composite and
-- BEFORE S4.8 rewrites clara.complete_pending_match. The one premise that must be measured on
-- the FINAL catalog is the one the fallback law rests on: "silence is not evidence" is only
-- safe for money because the set of bodies that can put an entry into a bank match is CLOSED
-- and every one of them writes its own clara.bank_match_audit row. A door that books a line
-- and records nothing would be believed by its silence and could double a bank movement.
--
-- MEASURED here (this rig, post-splice): the bodies that INSERT clara.bank_match_entry_members
-- are exactly {_settle_from_bank_line_core, complete_pending_match, match_bank_line x2}, and
-- all four call clara._bank_match_audit. clara.resolve_and_book_bank_line is NOT in the set --
-- it books through those callees and stamps resolution_exception_id, which is disjunct (1);
-- clara.accept_bank_rule_suggestion is not either -- it mints a DRAFT and no group at all,
-- which is SOURCE B. This block fails the migration if a FIFTH body joins, or if one of the
-- four stops recording, and names S4.6A as the place to adjudicate.
do $s4_6c_late$
declare
  r record; v_src text; v_doors text[] := '{}'::text[]; v_silent text := '';
  v_expected text[] := array['_settle_from_bank_line_core','complete_pending_match',
                             'match_bank_line','match_bank_line'];
begin
  for r in select p.proname::text as proname, p.prosrc, pg_get_functiondef(p.oid) as fdef,
                  (p.oid::regprocedure)::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'clara' and p.prokind = 'f'
            order by p.proname::text collate "C", p.oid loop
    -- WIDENED [round-8 M2 finding, cross-section patch] -- same rationale as S4.6C's early
    -- half above; EMPIRICALLY VERIFIED against the round-8 M2 lane DB (unchanged door set;
    -- _bank_match_audit's self-match under pg_get_functiondef never reaches the audit-call
    -- check because it is not itself a bank_match_entry_members writer).
    if r.prosrc is null and r.fdef is null then
      raise exception '0042 S4.6C(late): could not read the body of % -- fails closed', r.sig
        using errcode = 'CLR10';
    end if;
    v_src := lower(regexp_replace(regexp_replace(regexp_replace(
      coalesce(r.prosrc, '') || coalesce(r.fdef, ''), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
    if v_src ~ 'insert into clara\.bank_match_entry_members' then
      v_doors := v_doors || r.proname;
      if position('clara._bank_match_audit(' in v_src) = 0 then
        v_silent := v_silent || case when v_silent = '' then '' else ', ' end || r.proname;
      end if;
    end if;
  end loop;
  if v_doors is distinct from v_expected then
    raise exception '0042 S4.6C(late): the bodies that put an entry into a bank match are now {%}, expected {%}. clara._wdb_line_booking_block treats a group with NO creation record as having caused nothing -- which is only safe while this set is closed and every member records what it built. Adjudicate the new door against S4.6A (disjuncts 0..4) before allowing it.', array_to_string(v_doors, ', '), array_to_string(v_expected, ', ')
      using errcode = 'CLR10';
  end if;
  if v_silent <> '' then
    raise exception '0042 S4.6C(late): {%} put an entry into a bank match without writing a clara.bank_match_audit row. The one-standing-booking law reads that row as the only evidence such an entry was CREATED by the booking act; a silent door''s booking becomes invisible and its line re-bookable, which is the doubled bank movement round 5 measured.', v_silent
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S4.6C(late) OK: the four booking doors are unchanged and every one of them still records the entries its act creates.';
end $s4_6c_late$;

-- =====================================================================================
-- S4.14 -- THE SECTION'S OWN LANDING NOTICE (the file's TAIL owns the census assertions;
-- this is only the human-readable statement of what SECTION S4 put in place).
-- =====================================================================================
do $s4_done$
begin
  raise notice '0042 SECTION S4 OK: the three preheld-aware cores are factored out of the two allocate bodies and both settle overloads (four public wrappers, ACLs untouched); clara.resolve_and_book_bank_line books either leg and parks the high-stakes settlement with a declared resolution beside an immutable resolution_exception_id; the seven-site parked-declaration admission is installed (1 settle-core wall, 2 belt INSERT door, 3 flip guard, 4+5 both pending->live cascades, 6 release guard, 7 pending->unmatched line cascade) and NOTHING wider; the post-flip unmatch reopens exactly the exception its group names, behind the newer-open pre-check and behind the unchanged settled-period law; and the bank_rule_suggested producer lands with its partial unique dedup index, deriving its legs through SECTION S2''s shared bodies so that clara._adj_on_approve arm (3) re-derives against the very same definition. AS-BUILT LADDER ROUND 5: the one-standing-booking law lost BOTH of its narrowings -- the corridor gate is gone (it is asked on every line-member INSERT and on the parked flip, not only inside an exception corridor) and the subject is now "an entry this LINE caused to exist" (born inside the booking act, or carrying a booking door''s own birth stamp) rather than "an entry an exception-discharging group held"; the release reports it LINE-keyed. AS-BUILT LADDER ROUND 7: that subject no longer reads a CLOCK -- now() is the TRANSACTION-START stamp on both journal_entries and bank_matches, so an entry another session committed during a long booking transaction was classified born-in-the-act and became a blocking orphan naming a wrong remedy; causation is now derived from clara._wdb_born_in_booking_act, the booking act''s own append-only clara.bank_match_audit record of the entries it CREATED, and S4.6C pins the structural premises (no clock, both call sites, the record unrewritable, the creation keys and the four booking doors closed) at build time.';
end $s4_done$;

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
-- [SPLIT D-b3 2026-08-04] THIS FILE IS THE D-b3 SLICE OF SECTION 6. Census sect.5 splits the twenty-one
-- tails four ways under one rule: a tail whose subject is a CLOSED SET ships pure, per-slice; a
-- tail that enumerates a ROSTER SPANNING FAMILIES ships per-slice with a slice-local expected
-- roster and an explicit `FORWARD TOLERANCE` comment naming the final form -- and NEVER as an
-- `if to_regprocedure(...) is not null` guard, which converts a build-time census into a
-- conditionally-vacuous one (the fail-open class round 7 measured). NOT ONE ROSTER BELOW IS A
-- `>=` FLOOR OR A CONDITIONAL: every one is EXACT and fails by name.
-- THIS SLICE CARRIES: tails 4, 5, 11 and 13 -- pure -- the bank.line_exception_reopened HALF of
-- tail 14, and the slice-local forms of tails 6, 7, 8 and 20. Tail 6 arm (a) reaches its FINAL
-- form for the staff_advance_application key here rather than in D-b2, and that is this slice's
-- one COMPLETION rather than narrowing: D-b1 shipped that key's writer set as
-- {book_staff_advance_application} under an explicit FORWARD TOLERANCE note naming exactly this
-- slice as the one that adds clara.resolve_and_book_bank_line to it.
-- The other thirteen tails ship with the families they are about:
--   1, 3, 9                                        -> D-b0/D-b1 shipped their forms; FINAL in D-b2
--   2 (origin='scheduled_run')                     -> D-b2 (this slice keeps 0041's form)
--   10                                             -> D-b1 shipped its four-table half; D-b2 ships
--                                                     the other three
--   12, 15, 17, 18                                 -> D-b2 (pure)
--   14                                             -> split by event name: the adjustment.posted
--                                                     half is D-b2's
--   16                                             -> ALREADY SHIPPED, D-b0 (pure)
--   19, 21                                         -> ALREADY SHIPPED, D-b1 (pure)
-- FINAL FORMS of tails 6, 7, 8 and 20 land in D-b2, the last slice to ship.
-- TWO BLOCKS AT THE END OF THIS FILE ARE NOT ON THE CANONICAL TWENTY-ONE, and both were added by
-- the confirming round rather than cut from the source: TAIL b3-IX (the exact pg_get_indexdef +
-- validity postcheck for the two indexes this slice creates -- the OTHER face of `create index
-- if not exists`, which errata E13 adjudicated only on its pre-state side) and S5.25-b3 (the
-- clock census re-run on the catalog this file leaves -- the INTERVAL errata E12 measured and
-- recorded as unasserted, since census sect.8 gives S5.25 to D-b0 alone and this slice re-cuts
-- four clock-bearing money verbs after D-b0 ran it). Each carries its own [SPLIT D-b3] rationale.

-- =====================================================================================
-- TAIL 4 -- THE PARKED-DECLARATION STATE: THE CHECK, THE SET-ONCE COLUMN, AND THE CANCEL
-- (design SS4, [WDB-G9]).
--
-- THE HIGH-STAKES AF-2 BRANCH PARKS a declared resolution on the pending match group and
-- executes it at the bookkeeper+ flip. Three properties make that safe, and each fails
-- silently if lost:
--   (a) `pending_resolution IS NULL OR status='pending'` -- a declaration that survives the
--       flip is a stale instruction nobody will ever execute again;
--   (b) `resolution_exception_id` is set ONCE and never re-pointed -- it is the identity the
--       post-flip unmatch REOPENS, and a re-pointed id reopens somebody else's exception;
--   (c) cancelling a parked group LEAVES the id intact -- the exception is still open on the
--       member line, and erasing its link is how a parked line becomes unfindable.
-- =====================================================================================
do $tail4$
declare
  v_def text; v_n int; v_src text; v_tg record;
begin
  -- (a) THE CHECK, read off the live constraint rather than assumed from the DDL text.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.bank_matches'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%pending_resolution%';
  if v_def is null then
    raise exception '0042 tail 4(a): clara.bank_matches carries no CHECK mentioning pending_resolution -- ABI SSD requires `pending_resolution IS NULL OR status = ''pending''`';
  end if;
  if position('pending' in v_def) = 0 then
    raise exception '0042 tail 4(a): the pending_resolution CHECK does not bind the declaration to status=pending (def is %) -- a declaration that outlives the flip is an instruction with no executor', v_def;
  end if;
  -- ...and both columns exist, with the exception FK on the id (ABI SSD's bank_matches ALTER).
  select count(*)::int into v_n from information_schema.columns
   where table_schema = 'clara' and table_name = 'bank_matches'
     and column_name in ('pending_resolution', 'resolution_exception_id');
  if v_n <> 2 then
    raise exception '0042 tail 4(a): clara.bank_matches carries % of the 2 SS4 columns (pending_resolution, resolution_exception_id)', v_n;
  end if;
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'clara.bank_matches'::regclass and c.contype = 'f'
                   and c.confrelid = 'clara.bank_line_exceptions'::regclass) then
    raise exception '0042 tail 4(a): clara.bank_matches.resolution_exception_id has no FK to clara.bank_line_exceptions -- a dangling exception id cannot be reopened';
  end if;

  -- (b) THE SET-ONCE TRIGGER. The table had NO update guard before 0042 (that is why the
  -- design calls the trigger additive and NARROW: it raises only when old IS NOT NULL AND new
  -- IS DISTINCT FROM old, so the composite's own stamp -- NULL -> id, in the creating
  -- transaction -- passes, and every other UPDATE on this hot table stays untouched).
  select t.tgname, t.tgtype, p.proname, coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) as prosrc into v_tg
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'clara.bank_matches'::regclass and not t.tgisinternal
     and (t.tgtype & 1) <> 0 and (t.tgtype & 2) <> 0 and (t.tgtype & 16) <> 0
     and position('resolution_exception_id' in coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid))) > 0
   limit 1;
  if not found then
    raise exception '0042 tail 4(b): no BEFORE-UPDATE row trigger on clara.bank_matches mentions resolution_exception_id -- the immutable-once-non-null guard (design SS4) is not installed, and the reopen identity can be re-pointed at another exception';
  end if;
  v_src := lower(regexp_replace(regexp_replace(regexp_replace(
             v_tg.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
  if position('old.resolution_exception_id is not null' in v_src) = 0 then
    raise exception '0042 tail 4(b): the set-once guard % does not gate on `old.resolution_exception_id is not null` -- a guard that fires on the FIRST stamp refuses the composite''s own in-transaction write, which is every parked path', v_tg.tgname;
  end if;
  if position('is distinct from' in v_src) = 0 then
    raise exception '0042 tail 4(b): the set-once guard % does not compare with IS DISTINCT FROM -- an idempotent re-write of the SAME id is not a re-point and must not raise', v_tg.tgname;
  end if;

  -- (c) THE CANCEL LEAVES THE ID INTACT (design SS4, admission site 7). unmatch_bank_match is
  -- the cancel door for a parked pending group; the belt's pending->unmatched arm reads
  -- resolution_exception_id to admit the release, and the named exception stays OPEN on the
  -- member line. A verb that NULLs the column on cancel breaks the belt arm that lets the
  -- cancel happen at all -- which is a refusal, not a silent loss, but an unexplainable one.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p where p.oid = 'clara.unmatch_bank_match(uuid,uuid,text,text)'::regprocedure;
  if v_src ~* 'resolution_exception_id[[:space:]]*=[[:space:]]*null' then
    raise exception '0042 tail 4(c): unmatch_bank_match NULLs resolution_exception_id -- design SS4 admission site 7 requires the cancel to LEAVE THE ID INTACT (the exception is still open on the member line, and the id is how the surface finds it)';
  end if;
  if position('pending_resolution' in v_src) = 0 then
    raise exception '0042 tail 4(c): unmatch_bank_match never names pending_resolution -- the parked declaration must be cleared or explicitly left by a verb that knows it exists, not by accident';
  end if;

  raise notice '0042 tail 4 OK: the pending_resolution CHECK binds the declaration to status=pending; the narrow set-once trigger on bank_matches gates on OLD-non-null and IS DISTINCT FROM; the cancel door leaves resolution_exception_id intact.';
end $tail4$;

-- =====================================================================================
-- TAIL 5 -- THE 0040 S4.Z BEHAVIOURAL PINS, RE-RUN ON THE CORES (design SS4, [L3/V3+C3-1]).
--
-- WHY THEY MOVE. AF-2 needs to spend a PRE-HELD op key inside settle and allocate, which the
-- public verbs cannot do (they reserve their own). The factoring keeps the public arities as
-- reserve-then-delegate wrappers and moves the BEHAVIOUR into three cores. Every pin 0038/0040
-- wrote against the public bodies therefore has to be re-run against the cores -- otherwise
-- the migration would ship a build whose behavioural guarantees are asserted on thin wrappers
-- that no longer contain the behaviour, which is the most comfortable way to lose them.
--
-- 0038's own normalisation recipe is reproduced verbatim (strip block comments, strip line
-- comments, collapse whitespace, lowercase) so the pins are the SAME pins, not lookalikes.
-- =====================================================================================
do $tail5$
declare
  r record; v_src text; v_n int; v_a int; v_b int; v_c int; v_x text; v_name text;
begin
  -- (Z0) EACH CORE EXISTS EXACTLY ONCE. An overloaded core is two behaviours wearing one name,
  -- and every pin below would then be asserted against whichever the planner happened to pick.
  foreach v_name in array array['_settle_from_bank_line_core', '_allocate_receipt_core',
                                '_allocate_payment_core'] loop
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_n <> 1 then
      raise exception '0042 tail 5(Z0): clara.% exists at % arities (expected exactly 1) -- the SS4 core factoring must produce ONE core per composite', v_name, v_n;
    end if;
  end loop;

  -- (Z1) THE SETTLE CORE carries 0040 S4.Z (Z3b) in full.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_settle_from_bank_line_core';
  v_x := substring(v_src from 'select \* into [a-z_]+ from clara\.journal_entries where id=[^;]*for update');
  if v_x is not null then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core locks a PRE-EXISTING journal_entries row FOR UPDATE (%) -- the composite invariant (0037 invariant 1) is that the ENTRY locks happen in the CALLER, above the rungs; taking one here inverts the ladder', v_x;
  end if;
  if position('allocate_receipt' in v_src) = 0 or position('allocate_payment' in v_src) = 0 then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core no longer delegates to BOTH C-a allocation composites (the probe accepts either the public verb or its new core, since the core name contains the verb name)';
  end if;
  if position('pg_advisory_xact_lock(203005003' in v_src) <> 0
     or position('pg_advisory_xact_lock(203005004' in v_src) <> 0 then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core takes a house ladder rung in its own body -- the nesting deadlock window 0038/0040 closed is re-opened';
  end if;
  -- THE LINE LOCK IS FOUND BY STATEMENT, NOT BY FIRST MENTION. The live settle body reads
  -- clara.bank_statement_lines UNLOCKED first (to resolve tenancy and the lock keys) and only
  -- then takes `perform 1 from clara.bank_statement_lines l where l.id = p_line for update` --
  -- so anchoring on the first mention would measure the pre-read and certify an ordering that
  -- was never tested. `[^;]*` cannot cross a statement terminator, so this matches the locking
  -- statement and nothing else, whatever the core renamed its parameter to.
  v_x := substring(v_src from 'from clara\.bank_statement_lines[^;]*for update');
  if v_x is null then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core no longer takes a single-line FOR UPDATE lock on clara.bank_statement_lines -- the exception re-check has no anchor to be ordered against';
  end if;
  v_a := position(v_x in v_src);
  v_c := position('clara.bank_line_exceptions' in v_src);
  if v_c = 0 then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core does not re-check clara.bank_line_exceptions -- the write-skew law (0040 finding 38) is unenforced';
  end if;
  if v_c < v_a then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core re-checks bank_line_exceptions BEFORE its line lock (exc=%, lock=%) -- a check taken before the lock reads a world that can change', v_c, v_a;
  end if;
  if position('line_excepted' in v_src) = 0 then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core lost the named line_excepted refusal';
  end if;
  -- ...AND THE PARKED-DECLARATION ADMISSION, site 1 of seven (design SS4): the line_excepted
  -- wall must be able to see a p_ctx declaration, or the composite refuses its OWN park.
  if position('p_ctx' in v_src) = 0 then
    raise exception '0042 tail 5(Z1): _settle_from_bank_line_core takes no p_ctx -- admission site 1 (the settle core''s line_excepted wall, admitted by the caller''s declaration) has no channel, so resolve_and_book_bank_line cannot settle the line it is resolving in the same transaction';
  end if;

  -- (Z2) THE PUBLIC SETTLE ARITIES ARE THIN. Both must delegate; neither may keep a rung.
  for r in select * from (values
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)'),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)')
    ) as t(sig) loop
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('clara._settle_from_bank_line_core(' in v_src) = 0 then
      raise exception '0042 tail 5(Z2): % does not delegate to clara._settle_from_bank_line_core -- one overload left un-factored is one settlement path whose behaviour nothing above asserts', r.sig;
    end if;
    if position('pg_advisory_xact_lock(203005003' in v_src) <> 0
       or position('pg_advisory_xact_lock(203005004' in v_src) <> 0 then
      raise exception '0042 tail 5(Z2): % takes a house ladder rung in the WRAPPER -- the wrapper reserves its op key and delegates; nothing else', r.sig;
    end if;
  end loop;

  -- (Z3) THE ALLOCATION CORES carry the D-a marker the 0041 tail pinned on the public bodies.
  -- This is the pin that MOVES, and saying so out loud matters: 0041 tail 4 asserted
  -- `allocation_to_unborn_item` on clara.allocate_receipt / clara.allocate_payment. After the
  -- factoring those bodies are wrappers, so the assertion has to follow the behaviour or it
  -- becomes a test of nothing.
  for r in select * from (values
      ('_allocate_receipt_core', 'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'),
      ('_allocate_payment_core', 'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)')
    ) as t(core, wrapper) loop
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = r.core;
    if v_src is null then
      raise exception '0042 tail 5(Z3): clara.% does not exist -- the allocation core factoring is incomplete', r.core;
    end if;
    v_n := (length(v_src) - length(replace(v_src, 'allocation_to_unborn_item', '')))
           / length('allocation_to_unborn_item');
    if v_n <> 1 then
      raise exception '0042 tail 5(Z3): clara.% carries the 0041 allocation_to_unborn_item wall % time(s), expected exactly 1 -- the D-a AF-1 guard must ride the CORE now that the core holds the allocation loop', r.core, v_n;
    end if;
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p where p.oid = r.wrapper::regprocedure;
    if position('clara.' || r.core || '(' in v_src) = 0 then
      raise exception '0042 tail 5(Z3): % does not delegate to clara.% -- the public verb must reserve its op key and hand off, so AF-2 can spend a pre-held key through the same code path a human does', r.wrapper, r.core;
    end if;
  end loop;

  -- (Z4) THE COMPOSITE'S OWN LOCK ORDER (design SS4): every PRE-EXISTING entry it will match is
  -- row-locked BEFORE the rungs (0037 invariant 1), then 203005003 -> 203005004 -> 203005006.
  -- An out-of-order rung here is not a style point: three of these rungs are shared with the
  -- bank and subledger ladders, and a composite that inverts them deadlocks against ordinary
  -- traffic under load rather than in a test.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'resolve_and_book_bank_line';
  if v_src is null then
    raise exception '0042 tail 5(Z4): clara.resolve_and_book_bank_line does not exist -- the AF-2 composite was not built';
  end if;
  v_a := position('pg_advisory_xact_lock(203005003' in v_src);
  v_b := position('pg_advisory_xact_lock(203005004' in v_src);
  v_c := position('pg_advisory_xact_lock(203005006' in v_src);
  if v_a = 0 or v_b = 0 or v_c = 0 then
    raise exception '0042 tail 5(Z4): resolve_and_book_bank_line does not take all three rungs (203005003=%, 203005004=%, 203005006=%) -- design SS4 names the order explicitly', v_a, v_b, v_c;
  end if;
  if not (v_a < v_b and v_b < v_c) then
    raise exception '0042 tail 5(Z4): resolve_and_book_bank_line takes its rungs out of order (203005003=%, 203005004=%, 203005006=%) -- the ladder is counterparty -> client -> bank, and inverting it deadlocks against ordinary bank traffic', v_a, v_b, v_c;
  end if;
  v_x := substring(v_src from 'from clara\.journal_entries[^;]*for update');
  if v_x is null then
    raise exception '0042 tail 5(Z4): resolve_and_book_bank_line never row-locks a pre-existing journal_entries row -- 0037 invariant (1) is that the COMPOSITE takes those locks, above the rungs, because the cores cannot';
  end if;
  if position(v_x in v_src) > v_a then
    raise exception '0042 tail 5(Z4): resolve_and_book_bank_line locks pre-existing entries AFTER taking a rung -- entry locks come first, or a concurrent allocation holding the same entry and waiting on the same rung closes the cycle';
  end if;
  -- The AF-2 argument-time disposition wall, on BOTH branches (ABI SSF: disposition_unsupported;
  -- bank_corrective_line always refuses -- use the direct verb).
  if position('disposition_unsupported' in v_src) = 0
     or position('pending_branch_ancillary_unsupported' in v_src) = 0 then
    raise exception '0042 tail 5(Z4): resolve_and_book_bank_line is missing disposition_unsupported and/or pending_branch_ancillary_unsupported (ABI SSF) -- the first is validated at ARGUMENT time on both branches, the second is what keeps the park a settlement-leg-only act ([WDB-G9])';
  end if;

  raise notice '0042 tail 5 OK: all three cores exist at exactly one arity; the settle core keeps every 0040 S4.Z pin (no pre-existing entry lock, both allocation composites, no rung of its own, line lock before the exception re-check, line_excepted) and takes a p_ctx declaration channel; both public settle arities delegate rung-free; both allocation cores carry the AF-1 wall and both wrappers delegate; the composite locks entries above a correctly ordered 203005003/4/6 ladder and carries both AF-2 argument walls.';
end $tail5$;

-- =====================================================================================
-- TAIL 6 -- THE SS9.5 SINGLE-WRITER CENSUSES, MIRRORED FOR THE THREE D-b FLAGS KEYS
-- (design SS8 tail 6; the 0041 tail 5 idiom).
--
-- PROPOSAL AUTHENTICITY IN THIS PRODUCT IS STRUCTURAL, NOT CONVENTIONAL. A flags key is an
-- instruction the approve-time hook will execute against the books. If any body can write one,
-- then "the DB owns every number" reduces to "whoever can call a function owns every number".
-- Three counts keep it structural, and the third is the one a later migration will be tempted
-- to break: the GENERIC drafting core must stay innocent of every proposal key.
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL: ARM (a), FOR THE TWO KEYS THIS SLICE IS ABOUT -- and one of
-- them is a COMPLETION, not a narrowing. Census sect.5 tail 6 carries the explicit warning this
-- block exists to honour: "staff_advance_application's writer set is
-- {book_staff_advance_application} in D-b1 and {..., resolve_and_book_bank_line} in D-b3 -- a
-- copied tail FAILS". D-b1 shipped the one-name form under a FORWARD TOLERANCE note naming this
-- slice by name; SECTION S4 above adds the second writer (the composite stamps the proposal
-- payload verbatim onto its hand-draft leg, ABI SSA/SSB), so the TWO-NAME set below is the
-- whole unit's FINAL form for that key and it is asserted at the only moment it could first
-- become false. The second row, 'bank_rule_suggested', is this slice's own key: SECTION S4's
-- clara.accept_bank_rule_suggestion is its single minting site.
-- FORWARD TOLERANCE: the FINAL (D-b2) form of this loop adds 'recurring_adjustment' ->
-- {_adj_on_approve, _adj_run_occurrence_core}; neither of this slice's two rows changes again.
-- ARMS (b) AND (c) SHIPPED IN D-b0 with the full five-key list and are not repeated: (b) is a
-- claim about clara._draft_entry_core, which this slice does not touch, and (c) is a claim about
-- grants on clara.journal_entries, which this slice does not widen.
-- THE DETECTOR SELF-TEST IS BYTE-EXACT and needs no re-aiming: it is already built on this
-- slice's own key ('bank_rule_suggested'), which is a pure string test of the regex SHAPE
-- (minting vs reading) and is independent of which key it is written for.
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
      ('staff_advance_application', 'book_staff_advance_application, resolve_and_book_bank_line'),
      ('bank_rule_suggested', 'accept_bank_rule_suggestion')
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

  raise notice '0042 tail 6 OK (D-b3 slice): the staff_advance_application proposal key has reached its FINAL two-writer set (clara.book_staff_advance_application + clara.resolve_and_book_bank_line, the second added by SECTION S4 of this file) and the bank_rule_suggested key has exactly one writer (clara.accept_bank_rule_suggestion); D-b2 adds the recurring_adjustment row and ships the final form of this loop.';
end $tail6$;

-- =====================================================================================
-- TAIL 7 -- THE NO-WAKE CENSUS (the wake-authority structural invariant, restated for D-b).
--
-- The agent never signs a template, never enrols an advance account, never approves a pair
-- correction and never resolves-and-books a bank line. That is not a policy the model is asked
-- to respect: the per-wake allowlist is the authority, and this census is what proves no D-b
-- verb slipped into it. Kept in its own block, free of pg_get_functiondef, so the ACL-shaped
-- literals here can never read as a change-of-record patch to the wiki gate.
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL: THE TWO AF-2/PRODUCER VERBS THIS SLICE ADDS, AND ONLY THEM
-- (census sect.5 tail 7: "per-slice -- trivially: assert only the verbs this slice adds"). The
-- allowlist pattern set is narrowed to the two patterns that match them -- '%bank_rule_suggestion%'
-- and '%resolve_and_book%' -- for the same reason the grant loop is: a slice asserting that no
-- wake row names an adjustment template or a staff advance is asserting something about verbs it
-- does not ship, in a file that cannot be the place those claims are kept honest (D-b1 made the
-- advance claim beside the advance verbs; D-b2 makes the template one).
-- THE MACHINE-VERB ARMS ARE D-b2's WHOLE, and their absence here is not a gap: both are about
-- clara.run_adjustment_occurrence, the ONE verb clara_runtime gains in the entire wave (census
-- sect.1e measured it: "clara_runtime gains exactly 2 -- run_adjustment_occurrence +
-- adjustment_run_due -- BOTH D-b2, so D-b0/D-b1/D-b3 change no runtime grant at all"). THIS
-- SLICE'S TWO VERBS ARE BOTH HUMAN VERBS reaching clara_authenticated only (S4.13's ACL block),
-- so it has no positive machine claim to make in their place, and inventing one would be adding
-- an assertion the source never carried.
-- FORWARD TOLERANCE: the FINAL (D-b2) form restores the fourteen-name loop, the full six-pattern
-- set and both machine-verb arms.
-- =====================================================================================
do $tail7$
declare v_n int; v_names text; f text;
begin
  select count(*)::int, coalesce(string_agg(coalesce(fn_name, function_name), ', '), '')
    into v_n, v_names
    from clara.wake_fn_allowlist
   where coalesce(fn_name, function_name) like '%bank_rule_suggestion%'
      or coalesce(fn_name, function_name) like '%resolve_and_book%';
  if v_n <> 0 then
    raise exception '0042 tail 7: % wake-allowlist row(s) name an AF-2 or producer verb (%) -- the agent never resolves-and-books a bank line and never accepts a bank-rule suggestion; both are professional acts taken by a named human', v_n, v_names;
  end if;
  -- ...and no D-b verb is reachable by a wake role or the read-only agent role by GRANT either
  -- (the allowlist and the grant are two independent gates; D-a's tail pinned both).
  foreach f in array array[
      'resolve_and_book_bank_line', 'accept_bank_rule_suggestion'] loop
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

  raise notice '0042 tail 7 OK (D-b3 slice): no wake-allowlist row names the AF-2 composite or the bank-rule producer; neither of this slice''s two human verbs is granted to an agent or wake role.';
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
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL IN ITS SECOND HALF ONLY. The three clara._reserve_op arms are
-- byte-exact and are a closed-set claim about a 0037 body every slice depends on -- this slice's
-- composite pre-reserves THREE derived sub-keys before any lock (`<op>:draft:approve`,
-- `<op>:settle` and `<op>:match`, ABI SSE), so re-asserting the raise those reservations are
-- built on is a regression floor, not a duplication of somebody else's claim. The DERIVING-BODY
-- roster is narrowed to the one this slice ships.
-- FORWARD TOLERANCE: D-b1 shipped clara.book_staff_advance_application's form of this arm and the
-- FINAL (D-b2) form is the whole unit's four-name loop {_adj_run_occurrence_core,
-- _pair_reverse_core, book_staff_advance_application, resolve_and_book_bank_line}.
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
  foreach v_name in array array['resolve_and_book_bank_line'] loop
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

  raise notice '0042 tail 8 OK (D-b3 slice): _reserve_op still claims atomically and RAISES on request-hash mismatch; clara.resolve_and_book_bank_line, this slice''s one derived-key reserver, carries the approve_key_collision refusal.';
end $tail8$;

-- =====================================================================================
-- TAIL 11 -- THE bank_matches WRITER CENSUS, RE-PINNED AT ITS NEW FOUR-NAME MEMBERSHIP
-- (design SS4; 0038's whole-schema leak scan, re-run because ONE of its four names changed).
--
-- 0038 pinned four writers of the three match tables. The AF-2 core factoring replaces
-- `settle_from_bank_line` with `_settle_from_bank_line_core` in that set -- the SAME single
-- writer, one level down. Re-running the census at the new membership is what stops the
-- factoring from being read, by a future migration, as permission to add a fifth writer: a
-- stray INSERT bypasses belt-1/belt-2's deferred group-tie and exhaustion triggers exactly the
-- way an unaudited open_items insert would have bypassed 0037's belts.
--
-- resolve_and_book_bank_line is deliberately NOT in the set: the composite orchestrates and
-- never writes a match row itself -- the callee verb/core creates the group and the composite
-- only stamps resolution_exception_id onto it before commit.
-- =====================================================================================
do $tail11$
declare
  v_key text; v_writers text[]; v_src text; r record; v_expect text[];
begin
  v_expect := array['_settle_from_bank_line_core', 'complete_pending_match',
                    'match_bank_line', 'unmatch_bank_match'];
  foreach v_key in array array['clara.bank_matches', 'clara.bank_match_line_members',
                               'clara.bank_match_entry_members'] loop
    v_writers := array[]::text[];
    for r in select p.proname::text as proname, p.prosrc, pg_get_functiondef(p.oid) as fdef,
                    (p.oid::regprocedure)::text as sig
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara' and p.prokind = 'f'
              order by p.proname::text collate "C", p.oid loop
      -- FAILS CLOSED: a body with no readable source is not evidence of innocence. (Every
      -- clara function is plpgsql or sql, so prosrc is always the real body -- but a C-language
      -- function would carry only a symbol name, and this refuses rather than assuming.)
      -- WIDENED [round-8 M2, the same L1-lens as S5.15e]: prosrc AND pg_get_functiondef(oid),
      -- concatenated. A PG14+ standard-body function (`language sql ... begin atomic`) stores
      -- its body in prosqlbody and leaves prosrc the EMPTY STRING (not NULL), so the ORIGINAL
      -- null-only check would not have caught one either -- it would have silently scanned an
      -- empty string and found no INSERT, reading a real writer as innocent. Requiring BOTH
      -- representations null is the correct fails-closed test under the widened read; the
      -- concatenation itself cannot double-count here because this is a per-function EXISTENCE
      -- test (does the pattern match at all), never an occurrence count.
      if r.prosrc is null and r.fdef is null then
        raise exception '0042 tail 11: the whole-schema leak scan could not read the body of % -- fails closed', r.sig;
      end if;
      v_src := lower(regexp_replace(regexp_replace(regexp_replace(
        coalesce(r.prosrc, '') || coalesce(r.fdef, ''), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
      if v_src ~ ('insert into ' || regexp_replace(lower(v_key), '\.', '\\.', 'g') || ' *\(') then
        v_writers := v_writers || r.proname;
      end if;
    end loop;
    if array_length(v_writers, 1) is null then
      raise exception '0042 tail 11: % has NO writer at all -- the match model can never populate it', v_key;
    end if;
    if exists (select 1 from unnest(v_writers) x where x <> all (v_expect)) then
      raise exception '0042 tail 11: % has a writer outside the four pinned match bodies (match_bank_line, unmatch_bank_match, _settle_from_bank_line_core, complete_pending_match) -- found {%}. A stray INSERT bypasses the deferred group-tie and entry-exhaustion belts, which is how a reconciliation stops reconciling without anybody calling a verb.', v_key, array_to_string(v_writers, ', ');
    end if;
  end loop;
  -- ...and the name that MOVED really did move: the public settle verb must no longer be a
  -- writer (if it still is, the factoring is half-done and two bodies can create groups).
  select coalesce(string_agg(p.proname, ', ' order by p.proname), '') into v_src
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'settle_from_bank_line'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ 'insert into clara\.bank_matches *\(';
  if v_src <> '' then
    raise exception '0042 tail 11: clara.settle_from_bank_line still INSERTs into clara.bank_matches -- the SS4 factoring is half-done, and two bodies can now create a match group';
  end if;

  raise notice '0042 tail 11 OK: the three match tables have exactly the four pinned writers, with _settle_from_bank_line_core in place of the public settle verb, and the public verb writes no match row.';
end $tail11$;

-- =====================================================================================
-- TAIL 13 -- THE SETTLED-AUTHORITY BELT: THE WIDENED ARMS AND THE OPEN-BRANCH PREDICATE PIN
-- (design SS4: "the open-branch arm is write-triggered -- tail probe pins its text").
--
-- THE PARK CREATES A STATE THAT LOOKS ILLEGAL TO THE BELT: a pending match group holding a
-- line whose exception is still OPEN. The design's answer is that the belt's open-branch arm
-- is WRITE-TRIGGERED on the EXCEPTION row -- it fires when the exception is written, not when
-- the group flips -- and at park time the exception is open and the group is pending, which is
-- precisely the pair that arm refuses. So the admission has to be widened at the arms that DO
-- fire, and the open-branch predicate has to keep naming BOTH group statuses, or the widening
-- would be papering over a hole rather than closing one.
--
-- The predicate is pinned as TEXT because its exact membership is the whole argument: an arm
-- that dropped 'pending' would silently permit an open exception on a live-bound line.
-- =====================================================================================
do $tail13$
declare v_src text; v_raw text; v_n int; v_tg int; v_a int; v_qual text;
begin
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_raw from pg_proc p
    where p.oid = 'clara._tf_bank_settled_authority_belt()'::regprocedure;
  v_src := lower(regexp_replace(regexp_replace(regexp_replace(
             v_raw, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));

  -- (a) THE OPEN-BRANCH PREDICATE, pinned by text. Whitespace-normalised, so a reformat is
  -- tolerated and a MEMBERSHIP change is not.
  if position('bm.status in (''pending'',''live'')' in replace(v_src, ', ', ',')) = 0 then
    raise exception '0042 tail 13(a): the belt''s open-exception arm no longer tests `bm.status in (''pending'',''live'')` -- an open exception and a match are mutually exclusive at BOTH group statuses, and dropping either half admits the state the parked-declaration admission is carefully NOT creating';
  end if;
  if position('line_already_matched' in v_src) = 0 then
    raise exception '0042 tail 13(a): the belt lost the named line_already_matched refusal';
  end if;

  -- (b) THE ARM IS WRITE-TRIGGERED ON THE EXCEPTION ROW. The belt is installed on three
  -- relations; the exception-side installation is what makes the open branch fire at exception
  -- write time (and NOT at group flip time), which is the whole basis for the design's claim
  -- that the flip/exception arms need no widening.
  select count(*)::int into v_tg from pg_trigger t
   where t.tgrelid = 'clara.bank_line_exceptions'::regclass and not t.tgisinternal
     and t.tgfoid = 'clara._tf_bank_settled_authority_belt()'::regprocedure;
  if v_tg <> 1 then
    raise exception '0042 tail 13(b): the settled-authority belt is installed on clara.bank_line_exceptions % time(s) (expected exactly 1) -- if it is not write-triggered there, the open-branch arm never fires and the design''s "no widening needed at the flip" argument has no support', v_tg;
  end if;
  select count(*)::int into v_tg from pg_trigger t
   where t.tgrelid in ('clara.bank_match_line_members'::regclass,
                       'clara.bank_match_entry_members'::regclass)
     and not t.tgisinternal
     and t.tgfoid = 'clara._tf_bank_settled_authority_belt()'::regprocedure;
  if v_tg <> 2 then
    raise exception '0042 tail 13(b): the settled-authority belt is installed on % of the 2 member tables -- the member arms are where the parked admission was widened', v_tg;
  end if;
  if exists (select 1 from pg_trigger t
             where t.tgfoid = 'clara._tf_bank_settled_authority_belt()'::regprocedure
               and not t.tgisinternal and not (t.tgdeferrable and t.tginitdeferred)) then
    raise exception '0042 tail 13(b): a settled-authority belt trigger is not DEFERRABLE INITIALLY DEFERRED -- the belt re-queries by id at COMMIT precisely because the transaction is still writing the rows it judges';
  end if;

  -- (c) THE WIDENED ARMS NAME THE ADMISSION CHANNEL. Design SS4 widens the belt at the
  -- line-member INSERT arm and at the member pending->live / pending->unmatched cascade arms;
  -- each names resolution_exception_id (that IS the evidence channel). A LOWER bound of two,
  -- not the design's three: a lane that hoists the shared lookup into one local variable names
  -- the column fewer times without changing behaviour, and x42 owns the arm-by-arm drills. A
  -- count of 0 or 1 cannot be that -- it means the widening did not land.
  -- ASSEMBLY RECONCILIATION S6-A4 (corrected at assembly). The lower-bound-of-two above
  -- anticipated a lane HOISTING the lookup into a local variable. SECTION S4 went one step
  -- further and factored the whole cascade admission into a shared reader,
  -- clara._bank_parked_cascade_admitted(match, line, old_status, new_status) -- so the belt
  -- names the column once (its own line-member INSERT door, design SS4 site 2, which reads
  -- the in-snapshot GROUP ROW rather than the id) and reaches sites 4/5 and 7 through two
  -- calls to that reader, which is where the column is actually read. Counting only the
  -- column therefore undercounts a MORE disciplined build: one definition of "is this
  -- cascade admitted", called twice, instead of two hand-copied predicates that can drift
  -- apart. So accept EITHER form -- two direct mentions, or two calls into the shared reader
  -- whose own body names the column. A build with neither has not widened the belt.
  v_n := (length(v_src) - length(replace(v_src, 'resolution_exception_id', '')))
         / length('resolution_exception_id');
  v_a := (length(v_src) - length(replace(v_src, 'clara._bank_parked_cascade_admitted(', '')))
         / length('clara._bank_parked_cascade_admitted(');
  if v_a > 0 then
    -- the factored form: the shared reader must itself read the evidence channel, or the
    -- belt is delegating its admission decision to a body that cannot make it.
    if to_regprocedure('clara._bank_parked_cascade_admitted(uuid,uuid,text,text)') is null then
      raise exception '0042 tail 13(c): the belt calls clara._bank_parked_cascade_admitted but no such function exists at that signature';
    end if;
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_qual from pg_proc p
      where p.oid = 'clara._bank_parked_cascade_admitted(uuid,uuid,text,text)'::regprocedure;
    if position('resolution_exception_id' in v_qual) = 0 then
      raise exception '0042 tail 13(c): clara._bank_parked_cascade_admitted never reads resolution_exception_id -- the belt delegates its parked-cascade admission to a reader that cannot see the evidence channel, so every pending cascade is admitted or refused blind';
    end if;
  end if;
  if v_n + v_a < 2 then
    raise exception '0042 tail 13(c): the settled-authority belt names resolution_exception_id % time(s) and calls the shared parked-cascade reader % time(s) -- design SS4 widens it at three arms (the line-member INSERT and both member cascades) and each must reach the parked declaration''s exception id by one route or the other; a combined count below two means at most one arm was widened', v_n, v_a;
  end if;
  if position('pending' in v_src) = 0 then
    raise exception '0042 tail 13(c): the settled-authority belt never mentions the pending group status -- the parked admission is entirely about PENDING groups';
  end if;
  -- ...and the 0040 same-transaction receipt exclusion is intact (a widened arm that dropped
  -- it would refuse the book-then-reconcile act the composite performs in one transaction).
  if position('clara.completing_recon' in v_src) = 0 then
    raise exception '0042 tail 13(c): the belt lost the clara.completing_recon transaction-local exclusion (0040 FIX WAVE A6-v2) -- without it a receipt born in THIS transaction reads as a settled period and refuses the very line the transaction just matched';
  end if;

  raise notice '0042 tail 13 OK: the open-branch predicate still names both pending and live; the belt is write-triggered on the exception table and on both member tables, all deferred; the widened arms name the resolution_exception_id channel and the same-transaction receipt exclusion survives.';
end $tail13$;

-- =====================================================================================
-- TAIL 14 -- THE EVENT REGISTRATION + TAXONOMY COVERAGE PROBE, WITH EMISSION SITES AND
-- COUNTS PINNED (design SS2.5, ABI SSG; the 0041:978-996 CTE and the 0040-probe-6 shape,
-- extended to taxonomy coverage as SS2.5 requires).
--
-- TWO HALVES, BOTH NECESSARY. Registration in clara.event_types is a hard FK: an unregistered
-- name makes _append_event raise at emission time, so a missing row is loud. A missing
-- trigger_taxonomy row at the ACTIVE version is the opposite -- SILENT -- and it means the
-- router has no ruling for an event that is now flowing. Both new kinds decide 'ignore'
-- because the surfaces read the tables directly (the 0040/0041 reasoning, restated).
--
-- EMISSION SITES ARE PINNED BY COUNT because "one per occurrence" is an accounting statement:
-- two emitters for adjustment.posted means one posted occurrence looks like two to anything
-- that ever counts events.
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL BY EVENT NAME (census sect.5 tail 14: "split by event name").
-- Every predicate below is the canonical one with its TWO-NAME subject cut to the one name this
-- slice registers; nothing about the block's shape changes, because it was already written as a
-- loop over an (emitter, event) list. adjustment.posted and its emitter clara._adj_on_approve are
-- D-b2's and are asserted there, beside the poster that emits it -- listing them here would fail
-- this census by name, which is the correct behaviour and the wrong slice to have it in.
-- BOTH HALVES OF THE TAIL SURVIVE THE NARROWING INTACT, which is why this is a split rather than
-- a weakening: the registration half still proves the name is in clara.event_types AND covered at
-- the ACTIVE taxonomy version at decision 'ignore' (a missing type raises loudly at emission; a
-- missing taxonomy row is SILENT, which is the one this tail exists for), the emission half still
-- pins the count at exactly one AND proves clara.unmatch_bank_match is the ONLY body schema-wide
-- that names it, and the payload allowlist still scans the 500-character emission window for the
-- five narrative keys. The "only emitter schema-wide" arm is measured over EVERY clara body, so
-- it is not narrowed at all -- it is the same total scan, asked about one name.
-- FORWARD TOLERANCE: the FINAL (D-b2) form restores both names to all three loops.
-- =====================================================================================
do $tail14$
declare v_n int; v_ver int; v_src text; r record;
begin
  select count(*)::int into v_n from clara.event_types
   where name = 'bank.line_exception_reopened' and client_scoped;
  if v_n <> 1 then
    raise exception '0042 tail 14: the client-scoped D-b event type bank.line_exception_reopened is not registered -- an unregistered name raises at the first emission, in the middle of a release';
  end if;
  select version into v_ver from clara.taxonomy_active;
  select count(*)::int into v_n from clara.trigger_taxonomy
   where version = v_ver and event_type = 'bank.line_exception_reopened'
     and decision = 'ignore';
  if v_n <> 1 then
    raise exception '0042 tail 14: expected 1 trigger_taxonomy row at the ACTIVE version (%) with decision ignore, found % -- a registered type with no ruling at the active version is an event flowing past a router that has no opinion about it, and NOTHING raises', v_ver, v_n;
  end if;

  -- EMISSION SITES + COUNTS.
  for r in select * from (values
      ('unmatch_bank_match', 'bank.line_exception_reopened', 1)
    ) as t(fn, evt, want) loop
    -- Comment-stripped: an emitter's own explanatory comment routinely names the event it
    -- emits, and counting those would refuse a correct single emitter as a double one.
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = r.fn;
    if v_src is null then
      raise exception '0042 tail 14: clara.% does not exist -- it is the named emitter of %', r.fn, r.evt;
    end if;
    v_n := (length(v_src) - length(replace(v_src, '''' || r.evt || '''', '')))
           / length('''' || r.evt || '''');
    if v_n <> r.want then
      raise exception '0042 tail 14: clara.% emits % % time(s), expected exactly % (design SS2.5 / SS4)', r.fn, r.evt, v_n, r.want;
    end if;
    -- ...and it is the ONLY emitter schema-wide.
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace = 'clara'::regnamespace
       and position('''' || r.evt || '''' in lower(regexp_replace(regexp_replace(regexp_replace(
             (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) > 0;
    if v_n <> 1 then
      raise exception '0042 tail 14: % is named by % clara body/bodies (expected exactly 1 -- clara.%) -- a second emitter makes one act look like two downstream', r.evt, v_n, r.fn;
    end if;
  end loop;

  -- PAYLOAD ALLOWLIST (ABI SSG: typed primitives only). clara.domain_events is agent-readable
  -- firm-wide, so a memo, a description or an account code in a payload is an egress of client
  -- narrative through a channel nobody reviews. Asserted on the two emitters' bodies.
  -- SCANNED IN A BOUNDED WINDOW, not over the whole body: unmatch_bank_match legitimately
  -- handles a reason and a note elsewhere (it takes p_reason as an argument), and a whole-body
  -- scan would refuse it for words it never puts on the wire. The window is the 500 characters
  -- from the event-name literal, which in the house emission form
  -- (`perform clara._append_event(firm, '<name>', ..., jsonb_build_object(...))`) contains the
  -- payload builder and little else.
  for r in select * from (values
      ('unmatch_bank_match', 'bank.line_exception_reopened')
    ) as t(fn, evt) loop
    select substr(x.norm, position('''' || r.evt || '''' in x.norm), 500) into v_src
      from (select lower(regexp_replace(regexp_replace(regexp_replace(
                     coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) as norm
              from pg_proc p
             where p.pronamespace = 'clara'::regnamespace and p.proname = r.fn) x;
    if v_src is null or v_src = '' then
      raise exception '0042 tail 14: could not locate the % emission window in clara.% -- the payload allowlist scan has nothing to read', r.evt, r.fn;
    end if;
    if position('''memo''' in v_src) <> 0 or position('''description''' in v_src) <> 0
       or position('''account_code''' in v_src) <> 0 or position('''note''' in v_src) <> 0
       or position('''reason''' in v_src) <> 0 then
      raise exception '0042 tail 14: clara.% names memo/description/account_code/note/reason inside its % payload -- ABI SSG payloads carry identifiers, dates and amounts only, because clara.domain_events is agent-readable firm-wide', r.fn, r.evt;
    end if;
  end loop;

  raise notice '0042 tail 14 OK (D-b3 slice): bank.line_exception_reopened is registered client-scoped, covered at the ACTIVE taxonomy version with decision ignore, emitted exactly once by clara.unmatch_bank_match and by no other clara body at all, and its payload names no narrative key. adjustment.posted is D-b2''s half of this tail.';
end $tail14$;

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
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL IN ARMS (a) AND (e)'s POSTER HALF; (b), (c) AND (e)'s SIX-BODY
-- LOOP SHIP WHOLE; (d) IS NARROWED TO THIS SLICE'S ONE EVENT NAME AND IS A REAL CLAIM HERE FOR
-- THE FIRST TIME.
-- ARM (e)'s SIX-BODY LOOP IS THE ARM THIS SLICE MOST NEEDS. It refuses a D-b concept token --
-- and 'bank_rule_suggested' is one of the four it names -- inside clara._tf_entry_immutable,
-- clara._tf_lines_immutable and the four belts. Before this slice that token was a word no live
-- proposal key used; SECTION S4 above makes it a real one, so asserting the boundary here is
-- asserting it at the moment it could first become false.
-- ARM (b) SHIPS BYTE-EXACT AS A REGRESSION FLOOR, roster included. All four of its subjects are
-- D-b1 bodies and D-b1 asserted them; it is re-asserted rather than skipped because THIS slice
-- adds a second writer of the staff_advance_application proposal key (tail 6(a) above), and the
-- composite that writes it books through a bank leg where a counterparty is an ordinary thing to
-- mint. The roster is NOT widened to name clara.resolve_and_book_bank_line: the canonical form
-- names those four and only those four, and adding a fifth would be inventing an assertion the
-- source never carried. What the composite does or does not write to clara.counterparties is
-- measured by arm (a)'s regex instead, whose roster IS this slice's.
-- WHAT IS NARROWED is (a)'s "which bodies write clara.open_items" roster -- cut to the two
-- members this slice creates -- and (e)'s poster roster, cut to the one member that exists.
-- ARM (d) IS NO LONGER DEFERRED. D-b1 deferred it whole because it registered no event, and
-- census sect.5 forbids a census that passes for want of anything to count. This slice registers
-- bank.line_exception_reopened, so the count over its taxonomy decision is a real measurement.
-- FORWARD TOLERANCE: D-b2 restores every roster member its own bodies join, and (d)'s second
-- event name; the FINAL form is D-b2's.
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
     -- [SPLIT D-b3 2026-08-04] THIS SLICE'S TWO. FORWARD TOLERANCE: D-b1's four members
     -- (_adv_on_approve, book_staff_advance_application, enrol_staff_advance_account,
     -- retire_staff_advance_account) shipped with D-b1 and the FINAL (D-b2) form names
     -- _adj_run_occurrence_core, _adj_on_approve and _pair_reverse_core beside all six.
     and p.proname in ('accept_bank_rule_suggestion', 'resolve_and_book_bank_line')
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

  -- (d) no new frozen workflow class, in the evidence the DB can carry: this slice's event kind
  -- decides 'ignore' at the ACTIVE version, so nothing routes it into workflow work. The
  -- code-side half (packages/runtime/workflows is untouched) is CI's, not this file's.
  -- [SPLIT D-b3 2026-08-04] NARROWED TO THE ONE NAME THIS SLICE REGISTERS -- and, unlike D-b1's form of
  -- this tail, it is NOT deferred: bank.line_exception_reopened exists after SECTION EVENTS
  -- above, so this count has something to count. FORWARD TOLERANCE: D-b2 adds adjustment.posted.
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version
   where t.event_type = 'bank.line_exception_reopened'
     and t.decision <> 'ignore';
  if v_n <> 0 then
    raise exception '0042 tail 20(d): the D-b event bank.line_exception_reopened carries a taxonomy decision other than ignore -- a routed decision is what creates workflow work, and Wave D-b ships no new frozen workflow class';
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
  -- ...and the D-b posters do not disable anything either (no ALTER TABLE, no session_replication_role).
  -- [SPLIT D-b3 2026-08-04] THE ONE POSTER THAT EXISTS, re-asserted as a regression floor rather than
  -- claimed as new: clara._adv_on_approve is D-b1's and D-b1 made this claim about it. This slice
  -- adds NO member to the canonical four-name poster roster -- clara.resolve_and_book_bank_line
  -- and clara.accept_bank_rule_suggestion are not posters in this census's sense (neither is on
  -- the canonical list, and adding one would be invention) -- but it does put a new writer into
  -- the same approve path, so the floor is worth its two lines.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form is {_adj_run_occurrence_core, _adj_on_approve,
  -- _adv_on_approve, _pair_reverse_core}.
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

  raise notice '0042 tail 20 OK (D-b3 slice): open_items is unwidened and unwritten by the composite or the producer; no employee counterparty kind and no counterparty write from any of the four advance bodies that could have made one; exactly the two pre-existing NOTIFY channels; bank.line_exception_reopened decides ignore; the immutability triggers and all four belts are innocent of D-b -- including this slice''s new bank_rule_suggested key -- and the advance hook disables nothing.';
end $tail20$;

-- =====================================================================================
-- TAIL b3-IX -- THE TWO INDEXES THIS SLICE CREATES, ASSERTED BY DEFINITION AND BY VALIDITY
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL, ADDED BY THE CONFIRMING ROUND (Codex lens CX8).
-- =====================================================================================
-- WHY THIS BLOCK EXISTS. `create index IF NOT EXISTS` matches on the NAME ALONE. Errata E13
-- adjudicated the pre-state side of that (no absence probe: ix_ble_line lands on a 0038 table
-- and a DBA may lawfully have created it already, so refusing would break a correct deploy),
-- and it is right about that side -- but the same idiom has a second face: if an index of that
-- NAME already exists over a DIFFERENT column, this file's CREATE is a silent no-op, the
-- migration prints OK, and clara._wdb_exception_booking_block's line lookup runs without the
-- access path this slice believes it shipped. A name is not a definition. So the definition is
-- asserted here, EXACTLY, on the live catalog, together with the three flags that separate a
-- usable index from a wreck left by an interrupted build (indisvalid / indisready / indislive:
-- a failed CREATE INDEX CONCURRENTLY leaves an INVALID index that still satisfies IF NOT
-- EXISTS and is never used by the planner).
-- BOTH indexes are asserted, not just the IF-NOT-EXISTS one: the unique index self-detects at
-- its own CREATE, so its row here is a REGRESSION FLOOR rather than a hole being closed -- the
-- dedup law of the whole producer family rests on that predicate (draft OR approved, not
-- reversed, keyed on flags->bank_rule_suggested->>line_id) and it is worth one exact string.
-- PURE, NOT SLICE-LOCAL IN THE ROSTER SENSE: this slice creates exactly these two indexes and
-- no later slice touches either, so the set is CLOSED and the block ships in its final form.
do $tail_b3_ix$
declare
  r record; v_def text; v_ok boolean;
begin
  for r in select * from (values
      ('ix_ble_line',
       'CREATE INDEX ix_ble_line ON clara.bank_line_exceptions USING btree (line_id)'),
      ('uq_je_bank_rule_suggested_line',
       'CREATE UNIQUE INDEX uq_je_bank_rule_suggested_line ON clara.journal_entries USING btree ((((flags -> ''bank_rule_suggested''::text) ->> ''line_id''::text))) WHERE ((flags ? ''bank_rule_suggested''::text) AND (status = ANY (ARRAY[''draft''::text, ''approved''::text])) AND (reversed_by IS NULL))')
    ) as t(idx, want) loop
    select pg_get_indexdef(i.indexrelid), (i.indisvalid and i.indisready and i.indislive)
      into v_def, v_ok
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = r.idx;
    if v_def is null then
      raise exception '0042 tail b3-ix: the index clara.% does not exist after this migration created it', r.idx
        using errcode = 'CLR10';
    end if;
    if v_def <> r.want then
      raise exception '0042 tail b3-ix: clara.% is defined as "%" but this migration ships "%". `create index if not exists` matches on the NAME ONLY -- a pre-existing index of the same name over different columns is accepted silently and the access path this slice depends on was never built. Drop the impostor and re-run, or adjudicate the difference.', r.idx, v_def, r.want
        using errcode = 'CLR10';
    end if;
    if not v_ok then
      raise exception '0042 tail b3-ix: clara.% exists with the right definition but is not valid/ready/live -- an interrupted CREATE INDEX leaves exactly this state, it still satisfies `if not exists`, and the planner never uses it', r.idx
        using errcode = 'CLR10';
    end if;
  end loop;
  raise notice '0042 tail b3-ix OK (D-b3 slice): ix_ble_line and uq_je_bank_rule_suggested_line both exist with their EXACT shipped definitions (pg_get_indexdef, string-equal) and are valid, ready and live -- the `if not exists` name-match cannot have hidden a wrong index.';
end $tail_b3_ix$;

-- =====================================================================================
-- S5.25-b3 -- THE CLOCK CENSUS, RE-RUN AT THIS FRONTIER
-- [SPLIT D-b3 2026-08-04] SLICE-LOCAL, ADDED BY THE CONFIRMING ROUND (Codex lens CX9), closing the
-- INTERVAL errata E12 named and left open.
-- =====================================================================================
-- WHY A SECOND RUN OF SOMEBODY ELSE'S BLOCK. S5.25 is the clock census -- the gate that says no
-- clara body, view, policy, column default or constraint may derive a DATE from the session
-- clock. Census sect.8 gives S5.25 to D-b0 ALONE, and D-b0 ran it against the catalog D-b0
-- leaves. THIS slice then re-cuts four clock-bearing money verbs: SECTION S4 replaces
-- clara.allocate_receipt, clara.allocate_payment and BOTH clara.settle_from_bank_line overloads,
-- factoring their bodies into clara._allocate_receipt_core, clara._allocate_payment_core and
-- clara._settle_from_bank_line_core, and it creates clara.resolve_and_book_bank_line. Errata E12
-- measured the delta exactly -- settle_from_bank_line LOSES its bare clock (it becomes a 4-line
-- wrapper), _settle_from_bank_line_core and resolve_and_book_bank_line GAIN one -- and then
-- recorded the residue honestly: "what is unasserted is the INTERVAL", because no slice re-runs
-- the census after this delta. "Preserved by construction" is an argument, not a catalog
-- assertion, and this file's own tail law (rule 2 above) is that a claim nobody measures is a
-- claim nobody has. So the census runs again here, on the catalog THIS file leaves.
-- IT IS A LIFT, NOT A RE-DERIVATION. Every detector, every self-test, every roster and every
-- raise below is the WHOLE UNIT's text, byte-exact from 0042-sections/s5-residuals.sql
-- L5008-5356 -- a second implementation of a census is two pieces of code agreeing with
-- themselves, which is the thing the whole S5.25 header warns against. FOUR THINGS ARE AUTHORED
-- and each is marked at its own site: the block tag, arm (D)'s six-name narrowing, arm (B)'s
-- pin, and the closing notice.
-- THE TAG IS RUNG-KEYED, and that is errata E6's precedent applied rather than re-derived: D-b0
-- mints `$s5_25$` and this slice mints `$s5_25_b3$`, so the token now exists TWICE in the wave
-- and nothing may key an idempotency or "already applied" decision on it. Nothing does -- this
-- block is a pure catalog READ that creates, alters and drops nothing, so re-running it is
-- always safe and it needs no prestate probe of its own.
-- FORWARD TOLERANCE: D-b2 ships the FINAL form, which is the whole-unit text with both
-- narrowings gone (being last, its final form IS the canonical block).
do $s5_25_b3$
declare
  -- [SPLIT D-b3 2026-08-04] THE SIX NAMES ARM (D)'s WHOLE-UNIT ROSTER CARRIES THAT DO NOT EXIST YET.
  -- All six are bodies D-b2 (0045) creates. They are subtracted from the roster below rather
  -- than deleted out of the literal, so the literal itself stays byte-exact canonical and the
  -- diff of this block against the whole unit stays four marked edits wide.
  v_b3_absent text[] := array['_adj_run_occurrence_core', '_pair_reverse_core',
                              'approve_pair_reversal', 'cancel_pair_reversal',
                              'retire_adjustment_template', 'sign_adjustment_template'];
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
      '_adj_run_occurrence_core', '_adv_assert_proposal', '_adv_enrolment_at', '_adv_on_approve', '_adv_reversal_admission', '_adv_window_closed_under',
      '_approve_entry_core', '_approve_opening_entry', '_derive_vendor_binding_proposal', '_draft_entry_core', '_enqueue_invoice_facts_core',
      '_fa_on_approve', '_ocr_sales_floor', '_pair_reverse_core', '_publish_wiki_page_version_core', '_record_onboarding_contributor',
      '_refund_document_reservation', '_refund_processing_call', '_reserve_document_ingest', '_reserve_processing_call', '_resize_document_reservation',
      '_resolve_vendor_binding', '_seed_verified_document', '_settle_document_reservation', '_settle_from_bank_line_core', '_settle_processing_call',
      '_tf_agent_task_insert', '_tf_agent_task_update', '_tf_autodraft_attempt_update', '_tf_coding_task_update', '_tf_counterparty_update_0011',
      '_tf_document_intake_update', '_tf_fa_movement_belt', '_tf_filing_correction_update', '_tf_firm_document_limits_upsert', '_tf_fixed_assets_immutable_0017',
      '_tf_processing_call_reservation_update', '_tf_processing_task_update', '_tf_reservation_update', '_tf_rotate_token', '_tf_wake_intent_consume',
      '_wake_cred_full', 'ack_compliance_watch', 'acknowledge_rule_posts', 'acknowledge_sweep_run', 'add_bank_account',
      'admit_autodraft_task', 'answer_interruption', 'approve_opening_correction', 'approve_opening_seed', 'approve_pair_reversal',
      'approve_wrong_client_correction', 'begin_chat_turn', 'begin_client_onboarding', 'bootstrap_client_plan', 'cancel_agent_task',
      'cancel_client_onboarding', 'cancel_opening_seed', 'cancel_pair_reversal', 'cancel_seeding_batch', 'claim_document_intake_upload',
      'claim_document_processing_task', 'classify_document', 'commit_client_onboarding', 'complete_bank_reconciliation', 'complete_coding_task',
      'complete_fixed_asset_particulars', 'complete_pending_match', 'complete_seeding_batch', 'complete_stored_document_task', 'confirm_attribution_candidate',
      'consume_egress_dispatch', 'create_client', 'create_firm', 'create_seeding_batch', 'deactivate_bank_account',
      'deactivate_client_egress_purpose', 'decline_coding_rule', 'decline_seeding_proposal', 'dismiss_attribution_candidate', 'dismiss_coding_task',
      'dismiss_open_question', 'enrol_staff_advance_account', 'evaluate_sst_watch', 'evaluate_sst_watches_all', 'execute_rule_post',
      'fail_classify', 'fail_invoice_facts', 'fail_statement_facts', 'finalize_document_intake', 'get_bank_reconciliation',
      'get_context_pack', 'list_autopost_rules', 'list_review_queue', 'list_vendor_bindings', 'mark_document_intake_received',
      'mark_wiki_citations_stale', 'match_bank_line', 'merge_counterparties', 'mint_wake_credential', 'open_interruption',
      'persist_document_extraction', 'persist_invoice_facts', 'persist_statement_facts', 'prepare_egress_dispatch', 'propose_autopost_rule',
      'propose_bank_rule', 'propose_vendor_identity_binding', 'reconcile_autopost_rules', 'reconcile_sweep_runs', 'record_future_attestation',
      'record_opening_keyed_resolution', 'relay_health', 'remove_member', 'rename_counterparty', 'request_reextraction',
      'resolve_and_book_bank_line', 'resolve_bank_line_exception', 'resolve_compliance_watch', 'resolve_lint_finding', 'resolve_onboarding_plan_item',
      'resolve_open_question', 'retire_adjustment_template', 'retire_autopost_rule', 'retire_bank_rule', 'retire_client_alias',
      'retire_coding_rule', 'retire_counterparty_alias', 'retire_depreciation_authority', 'retire_document_filing', 'retire_fa_account_profile',
      'retire_staff_advance_account', 'retire_wiki_page', 'reverse_entry', 'revise_entry', 'revise_fixed_asset_particulars',
      'revoke_client_egress', 'revoke_client_egress_purpose', 'revoke_vendor_identity_binding', 'revoke_wake_credential', 'run_client_lint',
      'run_lint_all', 'set_counterparty_terms', 'set_document_kind', 'set_member_role', 'set_wiki_synthesis_hold',
      'settle_chat_turn', 'settle_ingest_reservation', 'sign_adjustment_template', 'sign_autopost_rule', 'sign_bank_rule',
      'sign_coding_rule', 'sign_depreciation_authority', 'sign_vendor_identity_binding', 'snooze_compliance_watch', 'tick_seeding_proposal',
      'unmatch_bank_match', 'update_onboarding_plan', 'upsert_fa_account_profile', 'verify_document_intake', 'void_bank_reconciliation',
      'void_bank_statement', 'wake_context', 'wake_record_notification', 'withdraw_draft'
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
  -- [SPLIT D-b3 2026-08-04] SLICE-LOCAL NARROWING OF ARM (D)'s ROSTER, AND IT FAILS CLOSED. The
  -- roster declared above is the WHOLE UNIT's, byte-exact. MEASURED on this slice's own
  -- frontier rig before this block was written: the live bare-clock set at 0044 is that roster
  -- MINUS EXACTLY the six names above and PLUS NOTHING (159 live vs 165 rostered, zero extras)
  -- -- which is also E12's finding read forwards, since the D-b3 delta the whole-unit roster
  -- already encodes (settle_from_bank_line absent, _settle_from_bank_line_core and
  -- resolve_and_book_bank_line present) is TRUE here and is asserted by arm (D) below for the
  -- first and only time. The subtraction is guarded: if any of the six ever DOES exist at this
  -- frontier, the narrowing would hide a real bare-clock reader, so the block refuses instead.
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname), '') into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = any(v_b3_absent);
  if v_names <> '' then
    raise exception '0042 S5.25-b3 (D, split narrowing): {%} exist at the D-b3 frontier, but this slice subtracts them from arm (D)''s lawful-use roster as D-b2 bodies -- the narrowing would hide a real bare-clock reader. The roster must not be narrowed for a body that exists.', v_names
      using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(x order by x), array[]::text[]) into v_bare_roster
    from unnest(v_bare_roster) x where x <> all(v_b3_absent);

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
  -- [SPLIT D-b3 2026-08-04] SLICE-LOCAL: clara._adj_on_approve and clara._adj_run_occurrence_core are
  -- D-b2 bodies and neither exists at this frontier. MEASURED here: the live set is exactly the
  -- seven names below -- identical to D-b0's pinned form -- so this slice changes NOTHING about
  -- arm (B) and re-asserts it as a regression floor across its own four body re-cuts and eleven
  -- splices. FORWARD TOLERANCE: the FINAL (D-b2) form restores the two names.
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

  -- (C) THE READER SIDE OF THE TIE. The three money writers this section fixed feed columns
  -- whose readers default their as-of from the MYT clock. Named here so the SYMMETRY is a
  -- recorded claim and not an inference: if a reader ever moved to the session clock the pair
  -- would be asymmetric again from the other end. EITHER spelling counts -- the authority or
  -- its delegate -- because what matters is the answer, not which name reaches it.
  -- [round-7 E2] prosrc || pg_get_functiondef(oid).
  foreach v_names in array array['staff_advance_summary', 'staff_advance_statement'] loop
    if (select count(*)::int from pg_proc p
         where p.pronamespace = 'clara'::regnamespace and p.proname = v_names
           and ((coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara._fa_today()%'
             or (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara._book_today()%')) <> 1 then
      raise exception '0042 S5.25 (C): clara.% no longer defaults its as-of from the house legal date -- the writer/reader pair over open_item_allocations.effective_date would be asymmetric across as-of again', v_names;
    end if;
  end loop;

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

  raise notice '0042 S5.25-b3 OK (D-b3 slice): re-run on the catalog THIS file leaves -- no clara function, view, policy, column default or constraint derives a date from the session clock (arms A/A2..A5/D), directly or through an explicit cross-schema call (arm E); the Asia/Kuala_Lumpur duplication roster is exactly this slice''s pinned set; clara._book_today() still calls statement_timestamp() and no transaction-pinned clock; clara._fa_today delegates to it; both advance readers still default their as-of from it; and the % bare-token lawful-use entries are exactly what the catalog shows AFTER SECTION S4 factored clara.settle_from_bank_line into a wrapper and minted clara._settle_from_bank_line_core and clara.resolve_and_book_bank_line -- the interval errata E12 recorded as unasserted.', array_length(v_bare_roster, 1);
end $s5_25_b3$;

do $tail_final$
begin
  raise notice '0042 wave D-b SLICE D-b3 (the AF-2 composite + the bank_rule_suggested producer): APPLIED. SECTION 0 (6 probes) + S1 (the two clara.bank_matches park columns with their CHECK and FK, the set-once trigger, and the bank.line_exception_reopened half of SECTION EVENTS) + S2 (clara._wdb_suggestion_rule_hit + clara._wdb_suggestion_lines, moved to the family they belong to) + S4 WHOLE (the three preheld-aware cores factored out of both allocate bodies and both settle overloads, clara.resolve_and_book_bank_line, the seven-site parked-declaration admission, the four live-body splices, the post-flip reopen, the shared line-keyed booking-block predicate, clara.accept_bank_rule_suggestion with its dedup index, the parked badge on the live reconciliation preview and the ACL blocks) + tails 4, 5, 6, 7, 8, 11, 13, 14 and 20, the two-index definition census and the S5.25-b3 clock-census re-run, all green. THE PRODUCER IS CREATED BUT NOT GRANTED: clara.accept_bank_rule_suggestion is revoked from PUBLIC and owned by clara_fn_owner, and its clara_authenticated grant ships with D-b2 beside clara._adj_on_approve arm (3) -- the approve-time account-role door that keeps the round-2 PHANTOM STAFF ADVANCE shut. Its dashboard chip and its test cells defer with it. NEXT: D-b2 (recurring adjustments, held back with the round-11 fixes) -- which adds that one grant, and which finds clara._wdb_suggestion_rule_hit and clara._wdb_suggestion_lines already here and must NOT create a second copy: clara._adj_on_approve arm (3) re-derives through these very bodies.';
end $tail_final$;

