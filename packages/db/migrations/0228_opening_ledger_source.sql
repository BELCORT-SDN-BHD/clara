-- 0228_opening_ledger_source — #656: THE OPENING GENERAL LEDGER GETS A SOURCE, AND THE
-- CAPABILITY REGISTRY STOPS SAYING OTHERWISE.
-- =====================================================================================
-- Spec of record: issue #656 (导入并核对有来源的期初总账) and the wave-2026-09-18 orchestrator
-- decisions (DECISIONS.md §2 row 0228, §6.1 row #656, D13). Domain words: CONTEXT.md — "Opening
-- basis", "Opening source", "Opening target", "Provenance (document / keyed)".
--
-- THIS FILE CREATES NO FUNCTION, NO TABLE, NO COLUMN, NO TRIGGER, NO CHECK, NO POLICY AND NO
-- GRANT, AND IT RECUTS NOTHING. Its whole content is a republication of
-- `clara.document_capabilities` — an UPDATE that RAISES `registry_version` and corrects the two
-- document kinds whose business operation this branch actually builds. Everything else it does
-- is assertion: a prestate that refuses to apply if any body in the blast radius has drifted,
-- and a tail that re-reads every one of them unmoved.
--
-- =====================================================================================
-- WHAT WAS MEASURED, AND WHY A REGISTRY ROW WAS LYING IN BOTH DIRECTIONS.
--
--   `packages/runtime/lib/opening-tb-cells.mjs` — the `opening_tb.line` PRODUCER — has been
--   written, adversarially tested and called by NOTHING since Wave B (every import of it in this
--   repo is a test; `packages/runtime/scripts/parts-parity-exemptions.mjs` names the file but is
--   a lint roster, not a caller). The CONSUMER half has been live and unreachable for just as
--   long: `clara.record_opening_targets_parsed` (0017), `packages/runtime/lib/opening-parse.mjs`
--   and `POST /api/opening/parse-targets` (`openingRoutes.ts:32`, mounted `src/index.ts:115`),
--   with no web caller anywhere. So `opening_balance_doc` read `business_operation =
--   'stored_only'` truthfully — the operation did not exist — and this branch is what makes it
--   exist: the producer is wired IN-LINE at the OCR pass (`normalizeAzureLayout`, through the new
--   non-frozen `lib/opening-tb-produce.mjs`), and the browser gets the tie-document picker, the
--   read action and the document-sourced target panel.
--
--   `prior_gl` read `stored_only` and that was WRONG ALREADY. `packages/runtime/lib/
--   seeding-parse.mjs`'s `prepareSeeding` drives `clara.create_seeding_batch` off a filed prior
--   general ledger today, from three sources — (a) `prior_gl.line` extraction facts, (c) a
--   PRINTED ledger's `tables.*` OCR cells through `prior-gl-cells.mjs`, (b) xlsx bytes decided by
--   byte sniff — and `POST /api/seeding/prepare` is mounted (`src/index.ts:116`). That operation
--   is proved by DB-backed cells (`packages/runtime/tests/wave-b-seeding-prepare.test.mjs`), which
--   is `0191:25`'s own bar for `supported`: "Clara does this today, and a test proves it."
--
--   THE TWO CORRECTIONS ARE THEREFORE NOT SYMMETRIC, and the asymmetry is the point (design lens
--   F1). `opening_balance_doc`'s row is corrected because this branch BUILDS the operation, so it
--   ships in the same merge as the wiring and never one migration ahead of it — shipping it early
--   is exactly the "success that did not happen" `0191:217-218` promises a professional will never
--   be shown. `prior_gl`'s row is corrected because the operation has existed for a wave and the
--   registry never caught up; what it lacks is a BROWSER ENTRANCE, and nothing in `apps/web` calls
--   `POST /api/seeding/prepare`. A named `limits` entry is 0191's own instrument for exactly that
--   (`:235-236`, "A limit is not a lower level").
--
-- =====================================================================================
-- THE ONE THING #656's BRIEF ASKED FOR THAT THIS FILE DOES NOT DO, AND THE MEASUREMENT THAT
-- STOPPED IT. The brief (D13.3) rules `prior_gl → business_operation = 'supported'` with
-- `typed_facts` left at `stored_only`. That combination is REFUSED BY THE REGISTRY ITSELF, and
-- it was measured rather than reasoned about: `0228` was written, applied to clara_656, and
-- `packages/db/tests/document-capability-registry.test.mjs` then failed the cell
--
--     "business_operation never claims 'supported' where typed_facts is not supported
--      — Clara cannot drive what it cannot read"   (`:278-284`)
--
-- which selects `business_operation='supported' and typed_facts<>'supported'` across all 240 rows
-- and asserts the set is EMPTY. The column's own contract says the same thing in words
-- (`0191:229-230`): "`supported` where Clara can carry TYPED FACTS into it". `prior_gl` has no
-- typed-facts producer at all — `prior_gl.line` stands at 0 regions and nothing has ever written
-- one — and the operation it does drive yields human-ticked PROPOSALS carrying counterparty,
-- account and date and NEVER an amount. So raising the level needs either a false `typed_facts`
-- claim or the relaxation of a 240-row honesty law to let one row through, and #656's own Risk 1
-- forbids the second in the reader and the same discipline applies here.
--
-- THE HONEST READING, and it is a finding rather than a workaround: `prior_gl` fits NEITHER level
-- cleanly. `stored_only` is defined as "the work is a person's to do … and Clara derives nothing
-- to drive it" — the first half is TRUE (every seeding proposal is ticked or declined by a human,
-- `tick_seeding_proposal` / `decline_seeding_proposal`) and the second half is FALSE (Clara
-- derives the proposals). The registry's four-level vocabulary has no cell for "read
-- deterministically into human-ticked proposals, carrying no typed facts". So this file fixes the
-- part that is unambiguously a LIE — the basis sentence "Clara derives nothing to drive it" — and
-- leaves the LEVEL where an executable law and a column contract both put it, with the gap NAMED
-- in `limits`. The level question goes to the orchestrator as a residual with this measurement,
-- and #656's report files it. Nothing here hides the capability: a professional reading
-- `capability-tiers.tsx` now sees the operation, the reader that runs it and the missing entrance.
--
-- =====================================================================================
-- WHY EVERY ROW MOVES TO VERSION 2 WHEN ONLY TWO KINDS CHANGE CONTENT.
--
--   This looks like a widening of DECISIONS §2 row 0228 and it is not; it is that row refined by
--   a LIVE CENSUS, ratified in DECISIONS §6.1 (2026-09-19). `packages/db/tests/
--   document-capability-registry.test.mjs:204-212` asserts `count(distinct registry_version) = 1`
--   — "the registry publishes exactly one version at a time" — and its rollback-hygiene cell
--   asserts `min(registry_version) = 1` besides. Raising two kinds alone REDS that battery. The
--   registry's own header names one distinct version as a registry-wide invariant it exists to
--   hold, and 0207's comment records cross-row uniformity as convention. So the honest shape is a
--   WHOLE-REGISTRY republication in which only the two named kinds change content, and the battery
--   is re-based in the SAME commit with the reason written beside each changed number. The
--   precedent is exact: `af3b5955` (#779) shipped 0207 and +147 lines of this same battery
--   together.
--
--   UPDATE, NEVER DELETE-THEN-INSERT (#846). 0207's BEFORE UPDATE monotone trigger refuses a
--   DECREASE with CLR08 `registry_version_monotone` and permits a raise; a DELETE-then-INSERT is
--   the hole 0207 recorded as out of scope, and going through it here would be using the one gap
--   the wall names. Measured on the rig before a line of this file was written: 240 rows,
--   `count(distinct registry_version) = 1`, `min = max = 1`.
--
-- =====================================================================================
-- WHICH FORMATS MOVE, AND WHY NOT ALL OF THEM (the one place this file is NARROWER than the
-- brief's literal wording, applied under WORK-ORDER rule 6's "take the most conservative
-- reading"). The brief reads "prior_gl × EVERY format → supported". Its own justification is
-- `0191:25`'s bar, which is a PER-ROW test — and measured row by row, five prior_gl formats have
-- no reader at all:
--
--   · `ofx`  — `byte_extraction = 'stored_only'` (`clara-store-only:v1`): the bytes are
--              deliberately never read, so no source can exist.
--   · `csv` / `tsv` / `docx` — the `structured_parse` lane emits `rows.*` / `paragraphs.*`
--              regions, never `tables.*`; `readPriorGlCells` sees nothing, and the xlsx byte
--              sniff (`looksLikeXlsx`) refuses a non-zip source with 422 `no_parse_source`.
--   · `xml`  — `clara-myinvois:v1` reads MyInvois UBL only; its `typed_facts` is already
--              `unsupported` and it carries its own `limits` saying so.
--
-- Describing those five as readable would print a business operation that cannot run, which is the
-- single thing `0191:217-218` promises never to print. So the corrected BASIS lands on exactly the
-- seven prior_gl formats whose reader exists and is tested: the six `azure-di:prebuilt-layout`
-- formats (the printed ledger, source (c)) and `xlsx` (the byte path, source (b)). The same logic
-- bounds `opening_balance_doc`'s LEVEL raise to the six `azure-di` formats:
-- `lib/opening-tb-produce.mjs` is wired into `normalizeAzureLayout` and nowhere else, so a
-- spreadsheet trial balance has no producer and must not claim one. Every other row keeps its
-- level, its basis and its limits byte-for-byte and moves only its version number. The narrowing
-- is recorded in the report as an assumption.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · NO recut of `approve_opening_seed`. DECISIONS §2 row 0228's conditional arm turns on a
--     measurement — "if the rig cell proves `approve_opening_seed` has no period/lock guard" —
--     and the measurement (p656.m3, on clara_656) says a guard fires EARLIER than anyone expected:
--     drafting an opening item into a CLOSED fiscal year is refused CLR19 `write_into_closed_period`
--     by `clara._tf_period_wall_lines()` on `clara.journal_lines`, before the approval is ever
--     reached. The approval is therefore never the first wall, and the narrow recut is not
--     written. `packages/db/tests/opening-ledger-source.test.mjs`'s `p656.period.closed_fy` is the
--     pin for that measurement, and the residual it leaves — that the refusal names the FISCAL
--     YEAR and the entry, never the opening basis — is recorded in the ticket's report.
--   · NO new processing lane, no new `engine_kind`, no CHECK widening, no facts-router splice
--     (D13.1 refuses the routed arm). The three migration-numbered CHECKs `ck_processing_task_lane_*`
--     / `ck_processing_task_lane_engine_*` / `ck_document_extractions_engine_kind_*` are not read,
--     not dropped and not re-added here.
--   · NO grant, NO policy change. `clara.document_capabilities` keeps 0191's posture exactly:
--     FORCE RLS, an owner `for all` policy, `grant select` to `clara_authenticated` and nothing
--     else; the agent lane still reaches the vocabulary only through `clara._document_capability`.
--   · NO `accounting_work` row, no `operation_receipts` row and no widening of
--     `accounting_work.purpose` (a closed three-value IN-list, pinned by 0194's own census). The
--     opening lane has never carried a Work shape; whether it should is an owner question, named
--     as a residual rather than answered by a migration.
-- =====================================================================================

-- =====================================================================================
-- §0  PRESTATE. Every sha below was MEASURED on the rig with
--     `select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid = …`,
--     never transcribed from a creating file: five of these bodies are demonstrable SPLICES
--     (`approve_opening_seed` = 0017 + 0018 §3b + 0056 §S9 + 0171's ALTER;
--     `approve_opening_correction` = 0017 + five splices; `_draft_opening_item_core` = 0017 +
--     0018 + 0041 + 0042; `_approve_opening_entry` was recut WHOLE at 0037:2410, not 0017:3784;
--     `persist_document_extraction` = 0007 + 0026 + 0017's opening-fact chain + 0191's
--     `_assert_field_path`), so a pin copied out of any one of those files matches nothing.
--     These are NON-REGRESSION pins: this file recuts none of them, and the tail re-reads every
--     one at the same value.
-- =====================================================================================
do $w656_pre$
declare
  v_sha text; v_sig text; v_expected text; v_n int; v_def text;
  v_pins text[][] := array[
    ['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
     'f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132'],
    ['clara.approve_opening_correction(uuid,jsonb,text,text)',
     '4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4'],
    ['clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
     '642967d213f75b3d92f3259ee273657c8870e63dd3a4a81663d8a94d421d368f'],
    ['clara._approve_opening_entry(uuid,uuid,uuid,text,int)',
     '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7'],
    ['clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)',
     'b94260ab1999db379c79a6ad2ad44f07445f019c1e7c8640bb5699725f74d7a8'],
    ['clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
     'f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1'],
    ['clara.record_opening_target(uuid,jsonb,text)',
     '290ee6e8cd41d35fd6a3739e49850b14d1ef106c28b32d1284a32702784839cc'],
    ['clara.create_opening_seed(uuid,uuid,date,uuid,text,text)',
     '7300cf1285fb252b34bbcf45037e27b319425fad7b72e4be004bbc11e44edbce'],
    ['clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)',
     'b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305'],
    ['clara._assert_opening_extraction_ref(uuid,uuid,jsonb)',
     'a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0'],
    ['clara._assert_opening_tie(uuid)',
     'afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30'],
    ['clara._tf_period_wall()',
     '44602ba87026be692993950d7c809512bf6087a20bf928dfac3f99d3a62867b0'],
    -- The instrument p656.m3 actually met: the LINES wall, which refuses an opening DRAFT into a
    -- closed fiscal year long before the approval is reached. Pinned because the whole "no recut"
    -- verdict rests on this body doing what it does today.
    ['clara._tf_period_wall_lines()',
     '68c7d2b0db657f8ce92af74f4a9da1582970cdb6e4fe97d2849b37a1ebf5bafe']
  ];
begin
  for i in 1 .. array_length(v_pins, 1) loop
    v_sig := v_pins[i][1];
    v_expected := v_pins[i][2];
    if to_regprocedure(v_sig) is null then
      raise exception '#656 prestate: % does not resolve -- the opening lane this file republishes is not present', v_sig
        using errcode = 'CLR10';
    end if;
    execute format(
      'select encode(sha256(convert_to(p.prosrc,''UTF8'')),''hex'') from pg_proc p where p.oid = %L::regprocedure', v_sig)
      into v_sha;
    if v_sha is distinct from v_expected then
      raise exception '#656 prestate: % has DRIFTED from its measured live body (sha %, expected %) -- re-measure on the rig before applying; this file recuts nothing and must not apply over a moved body',
        v_sig, v_sha, v_expected using errcode = 'CLR10';
    end if;
  end loop;

  -- THE FACTS THE REPUBLICATION'S ARITHMETIC RESTS ON. If any of these is false, the "+1 from a
  -- uniform 1" reading is wrong and this file must refuse rather than guess.
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#656 prestate: the capability registry holds % rows, not the seeded 12 formats x 20 kinds = 240', v_n
      using errcode = 'CLR10';
  end if;
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#656 prestate: the registry already publishes % distinct registry_versions -- the one-version invariant this republication rests on is already broken', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#656 prestate: the registry publishes version %, not 1 -- re-derive the target version before applying', v_n
      using errcode = 'CLR10';
  end if;

  -- 0207's monotone wall must be installed BEFORE this UPDATE, because the UPDATE is exactly the
  -- transition it governs: a raise is permitted, a decrease is CLR08 `registry_version_monotone`.
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_monotone' and not t.tgisinternal;
  if v_def is null then
    raise exception '#656 prestate: t_document_capabilities_version_monotone (0207) is not installed -- this republication must run under the wall that governs it'
      using errcode = 'CLR10';
  end if;
  if v_def !~* 'BEFORE UPDATE' or v_def !~* 'FOR EACH ROW' then
    raise exception '#656 prestate: the version wall is not a BEFORE UPDATE FOR EACH ROW trigger -- got %', v_def
      using errcode = 'CLR10';
  end if;

  -- …and the positivity CHECK 0191 put on the column is still the column's own.
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.document_capabilities'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ~ 'registry_version >= 1';
  if v_n < 1 then
    raise exception '#656 prestate: the registry_version >= 1 positivity CHECK is gone from clara.document_capabilities'
      using errcode = 'CLR10';
  end if;

  -- THE TWO KINDS ARE WHERE THIS FILE EXPECTS THEM. Both read stored_only today; if either has
  -- already been corrected by another hand, the basis sentences below would describe a row that
  -- is no longer there.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind in ('prior_gl', 'opening_balance_doc') and business_operation <> 'stored_only';
  if v_n <> 0 then
    raise exception '#656 prestate: % prior_gl/opening_balance_doc row(s) already read a business_operation other than stored_only -- re-derive this republication against the live rows', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#656 prestate: OK -- 13 opening-lane bodies at their measured shas, 240 registry rows at one distinct registry_version = 1, 0207''s monotone wall installed, both corrected kinds still stored_only.';
end
$w656_pre$;

-- =====================================================================================
-- §A  THE REPUBLICATION. Three statements, in this order: the two content corrections (each
--     under the version it is published at), then the registry-wide raise. The raise runs LAST
--     so a failure in either correction cannot leave the registry at a version whose content
--     never landed — the whole file is one migration transaction, but the ORDER is still what a
--     reader checks first.
-- =====================================================================================
set role clara_fn_owner;

-- A1 · `prior_gl` — the operation exists and is proved; the ENTRANCE is what is missing, and the
--      LEVEL is held by the registry's own law (see the header). What changes is the sentence that
--      was false — "Clara derives nothing to drive it" — and the machine-readable gap. The
--      trailing business-operation sentence is replaced IN PLACE, so each row's basis still
--      describes the row it sits on (the byte-extraction and facts-router sentences are true and
--      untouched). `typed_facts` stays `stored_only`: nothing has ever produced a `prior_gl.line`
--      region, and the reader that works reads TABLE CELLS and xlsx bytes instead.
update clara.document_capabilities
   set limits = limits || '{"browser_entrance":"absent"}'::jsonb,
       basis = replace(
         basis,
         'The filing appears as work a person completes; Clara derives nothing to drive it.',
         'The filing is work a person completes -- but Clara does NOT derive nothing: a filed prior general '
         || 'ledger drives clara.create_seeding_batch through the deterministic reader '
         || 'packages/runtime/lib/seeding-parse.mjs, whose proposals carry counterparty, account and date and '
         || 'NEVER an amount, and a professional ticks or declines each one. The level stays stored_only '
         || 'because this registry reserves a supported business operation for a pair Clara can carry TYPED '
         || 'FACTS into, and nothing has ever produced a prior_gl.line region. NO BROWSER ENTRANCE EXISTS '
         || 'YET either: nothing in the web app calls POST /api/seeding/prepare, so today the operation is '
         || 'reachable only by the runtime route itself -- the gap is named here rather than left silent.')
 where document_kind = 'prior_gl'
   and (engine_id = 'azure-di:prebuilt-layout:2024-11-30' or format = 'xlsx');

-- A2 · `opening_balance_doc` — the operation is BUILT BY THIS BRANCH, and both the facts level
--      and the operation level move together because the same wiring earns both: the producer
--      materialises `opening_tb.line` evidence regions (typed facts) and the governed door
--      carries them into the opening basis (the business operation). The whole basis is rewritten
--      rather than patched, because its facts-router sentence ("Clara derives no typed facts from
--      it") is exactly what stops being true.
update clara.document_capabilities
   set typed_facts = 'supported',
       business_operation = 'supported',
       basis = format(
         'Bytes are sealed at intake and read by %s. A filed opening trial balance is read into '
         || 'opening_tb.line evidence regions by packages/runtime/lib/opening-tb-cells.mjs, wired in line at '
         || 'the OCR pass, and carried into the governed opening-seed door by '
         || 'clara.record_opening_targets_parsed; every figure is re-derived by the database from the stored '
         || 'region text before a target is recorded, and one unreadable row refuses the whole document.',
         engine_id)
 where document_kind = 'opening_balance_doc'
   and engine_id = 'azure-di:prebuilt-layout:2024-11-30';

-- A3 · THE REGISTRY-WIDE RAISE. One statement, every row, +1 from the uniform 1 the prestate
--      measured — so `count(distinct registry_version)` stays 1, which is the invariant
--      `document-capability-registry.test.mjs` makes executable. 0207's wall sees each row's
--      transition and permits it because it is a raise.
update clara.document_capabilities
   set registry_version = registry_version + 1;

reset role;

-- =====================================================================================
-- §B  TAIL. Nothing was recut, the two kinds read what they now claim, the registry publishes
--     exactly one version, and no application role gained a single privilege on the table.
-- =====================================================================================
do $w656_tail$
declare
  v_sha text; v_sig text; v_expected text; v_n int; v_def text; v_row record;
  v_pins text[][] := array[
    ['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
     'f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132'],
    ['clara.approve_opening_correction(uuid,jsonb,text,text)',
     '4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4'],
    ['clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
     '642967d213f75b3d92f3259ee273657c8870e63dd3a4a81663d8a94d421d368f'],
    ['clara._approve_opening_entry(uuid,uuid,uuid,text,int)',
     '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7'],
    ['clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)',
     'b94260ab1999db379c79a6ad2ad44f07445f019c1e7c8640bb5699725f74d7a8'],
    ['clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
     'f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1'],
    ['clara.record_opening_target(uuid,jsonb,text)',
     '290ee6e8cd41d35fd6a3739e49850b14d1ef106c28b32d1284a32702784839cc'],
    ['clara.create_opening_seed(uuid,uuid,date,uuid,text,text)',
     '7300cf1285fb252b34bbcf45037e27b319425fad7b72e4be004bbc11e44edbce'],
    ['clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)',
     'b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305'],
    ['clara._assert_opening_extraction_ref(uuid,uuid,jsonb)',
     'a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0'],
    ['clara._assert_opening_tie(uuid)',
     'afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30'],
    ['clara._tf_period_wall()',
     '44602ba87026be692993950d7c809512bf6087a20bf928dfac3f99d3a62867b0'],
    ['clara._tf_period_wall_lines()',
     '68c7d2b0db657f8ce92af74f4a9da1582970cdb6e4fe97d2849b37a1ebf5bafe']
  ];
begin
  -- 1 · NOTHING WAS RECUT. The same thirteen bodies, at the same thirteen shas.
  for i in 1 .. array_length(v_pins, 1) loop
    v_sig := v_pins[i][1];
    v_expected := v_pins[i][2];
    execute format(
      'select encode(sha256(convert_to(p.prosrc,''UTF8'')),''hex'') from pg_proc p where p.oid = %L::regprocedure', v_sig)
      into v_sha;
    if v_sha is distinct from v_expected then
      raise exception '#656 tail: % MOVED during this migration (sha %) -- 0228 recuts nothing', v_sig, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 2 · THE REGISTRY PUBLISHES EXACTLY ONE VERSION, AND IT IS 2.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#656 tail: the registry publishes % distinct registry_versions -- the whole-registry raise is what keeps this at 1', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 2 then
    raise exception '#656 tail: the registry publishes version %, not 2', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#656 tail: the registry now holds % rows -- this file inserts and deletes nothing', v_n
      using errcode = 'CLR10';
  end if;

  -- 3 · THE SEVEN prior_gl ROWS STOPPED LYING, AND THE GAP IS NAMED. The LEVEL is deliberately
  --     unchanged (see the header's measurement); what must be true is that the false sentence is
  --     gone, the operation and its reader are named, and the missing browser entrance is
  --     machine-readable in `limits` rather than silent.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'prior_gl' and limits ? 'browser_entrance';
  if v_n <> 7 then
    raise exception '#656 tail: % prior_gl rows carry the named browser-entrance gap, expected the 6 azure-di formats + xlsx = 7', v_n
      using errcode = 'CLR10';
  end if;
  for v_row in select format, limits, basis from clara.document_capabilities
                where document_kind = 'prior_gl' and limits ? 'browser_entrance' loop
    if v_row.limits ->> 'browser_entrance' is distinct from 'absent' then
      raise exception '#656 tail: prior_gl x % names the entrance gap as % -- the value the face renders must be `absent`',
        v_row.format, v_row.limits ->> 'browser_entrance' using errcode = 'CLR10';
    end if;
    if position('create_seeding_batch' in v_row.basis) = 0
       or position('/api/seeding/prepare' in v_row.basis) = 0 then
      raise exception '#656 tail: prior_gl x %''s basis does not name the operation and the missing entrance', v_row.format
        using errcode = 'CLR10';
    end if;
    if position('Clara derives nothing to drive it' in v_row.basis) > 0 then
      raise exception '#656 tail: prior_gl x % still says Clara derives nothing to drive it -- that sentence is the lie this file exists to remove', v_row.format
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …and the five formats with no reader did NOT gain the claim.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'prior_gl' and not (limits ? 'browser_entrance')
     and format in ('csv','tsv','docx','ofx','xml');
  if v_n <> 5 then
    raise exception '#656 tail: the five prior_gl formats with no reader (csv/tsv/docx/ofx/xml) must keep their untouched basis -- only % did', v_n
      using errcode = 'CLR10';
  end if;
  -- …and the REGISTRY'S OWN LAW still holds across all 240 rows: no business operation is
  -- promised over facts that do not exist. This is the cell (`document-capability-registry.
  -- test.mjs:278-284`) that held prior_gl's level, asserted here from inside the migration so a
  -- future republication cannot quietly cross it.
  select count(*)::int into v_n from clara.document_capabilities
   where business_operation = 'supported' and typed_facts <> 'supported';
  if v_n <> 0 then
    raise exception '#656 tail: % row(s) promise a supported business operation over facts that are not supported -- Clara cannot drive what she cannot read (0191:229-230)', v_n
      using errcode = 'CLR10';
  end if;

  -- 4 · THE SIX opening_balance_doc ROWS READ supported ON BOTH LEVELS, with a basis that names
  --     the producer and the door. This is the row that must never ship ahead of its wiring.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'opening_balance_doc'
     and business_operation = 'supported' and typed_facts = 'supported';
  if v_n <> 6 then
    raise exception '#656 tail: % opening_balance_doc rows read supported on both levels, expected the 6 azure-di formats', v_n
      using errcode = 'CLR10';
  end if;
  for v_row in select format, basis from clara.document_capabilities
                where document_kind = 'opening_balance_doc' and business_operation = 'supported' loop
    if position('opening_tb.line' in v_row.basis) = 0
       or position('record_opening_targets_parsed' in v_row.basis) = 0 then
      raise exception '#656 tail: opening_balance_doc x %''s basis does not name the producer and the governed door', v_row.format
        using errcode = 'CLR10';
    end if;
    if position('derives no typed facts' in v_row.basis) > 0 then
      raise exception '#656 tail: opening_balance_doc x % still carries the old facts-router sentence beside a supported typed_facts level', v_row.format
        using errcode = 'CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'opening_balance_doc' and business_operation = 'stored_only';
  if v_n <> 6 then
    raise exception '#656 tail: the six opening_balance_doc formats with no producer must stay stored_only -- only % did', v_n
      using errcode = 'CLR10';
  end if;

  -- 5 · NO OTHER KIND MOVED. 240 rows, 13 corrected, 227 untouched but for their version number.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind not in ('prior_gl', 'opening_balance_doc')
     and position('The filing appears as work a person completes' in basis) = 0
     and business_operation = 'stored_only';
  if v_n <> 0 then
    raise exception '#656 tail: % row(s) outside the two corrected kinds lost their business-operation sentence', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind not in ('prior_gl', 'opening_balance_doc') and limits ? 'browser_entrance';
  if v_n <> 0 then
    raise exception '#656 tail: % row(s) outside the two corrected kinds gained a browser-entrance limit', v_n
      using errcode = 'CLR10';
  end if;

  -- 6 · NO APPLICATION ROLE GAINED A PRIVILEGE. 0191's posture, re-proved after the UPDATE: the
  --     human read role holds SELECT and nothing else; the runtime and both agent read roles hold
  --     NOTHING at all; the agent still reaches the vocabulary only through the DEFINER door.
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive']) as r) roles
   where has_table_privilege(roles.r, 'clara.document_capabilities', 'INSERT')
      or has_table_privilege(roles.r, 'clara.document_capabilities', 'UPDATE')
      or has_table_privilege(roles.r, 'clara.document_capabilities', 'DELETE')
      or has_table_privilege(roles.r, 'clara.document_capabilities', 'TRUNCATE');
  if v_n <> 0 then
    raise exception '#656 tail: % application role(s) hold a WRITE privilege on clara.document_capabilities -- a republication written with a convenience grant', v_n
      using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'SELECT') then
    raise exception '#656 tail: clara_authenticated lost SELECT on clara.document_capabilities' using errcode = 'CLR10';
  end if;
  for v_row in select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive']) as r loop
    if has_table_privilege(v_row.r, 'clara.document_capabilities', 'SELECT') then
      raise exception '#656 tail: % gained SELECT on clara.document_capabilities -- the agent lane reads the registry only through clara._document_capability', v_row.r
        using errcode = 'CLR10';
    end if;
  end loop;
  if to_regprocedure('clara._document_capability(text,text)') is null then
    raise exception '#656 tail: clara._document_capability(text,text) -- the agent lane''s only road to the registry -- is gone'
      using errcode = 'CLR10';
  end if;

  -- 7 · RLS AND THE WALL SURVIVED THE UPDATE.
  select count(*)::int into v_n from pg_class
   where oid = 'clara.document_capabilities'::regclass and relrowsecurity and relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#656 tail: clara.document_capabilities is no longer FORCE RLS' using errcode = 'CLR10';
  end if;
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_monotone' and not t.tgisinternal;
  if v_def is null or v_def !~* 'BEFORE UPDATE' or v_def !~* 'FOR EACH ROW' then
    raise exception '#656 tail: 0207''s monotone wall is missing or changed shape -- got %', coalesce(v_def, '(absent)')
      using errcode = 'CLR10';
  end if;

  raise notice '#656 tail: OK -- clara.document_capabilities republished at registry_version 2 across all 240 rows by UPDATE (never DELETE-then-INSERT, #846), under 0207''s monotone wall. Six opening_balance_doc rows (the azure-di formats the in-line producer actually reads) now read typed_facts=supported and business_operation=supported with a basis naming opening_tb.line and clara.record_opening_targets_parsed, and they ship in the same branch as that wiring, never ahead of it. Seven prior_gl rows (the six azure-di printed-ledger formats plus xlsx) lost the false sentence "Clara derives nothing to drive it" and gained a basis naming clara.create_seeding_batch, packages/runtime/lib/seeding-parse.mjs, the proposal shape and the unbuilt POST /api/seeding/prepare entrance, plus limits {"browser_entrance":"absent"} -- but their business_operation LEVEL stays stored_only, because the registry''s own executable law (document-capability-registry.test.mjs:278-284) and this column''s own contract (0191:229-230) both reserve a supported business operation for a pair Clara can carry TYPED FACTS into, and prior_gl.line has never been produced. That level question is a residual for the orchestrator, not something a migration may settle by relaxing a 240-row honesty law. The five prior_gl and six opening_balance_doc formats with no reader kept their rows untouched. This file created no function, no table, no column, no trigger, no CHECK, no policy and no grant, and recut nothing: thirteen opening-lane bodies -- five of them splices -- re-read at their measured pre-image shas, unmoved. approve_opening_seed was NOT recut because p656.m3 measured that clara._tf_period_wall_lines already refuses an opening DRAFT into a closed fiscal year with CLR19 write_into_closed_period, long before the approval is reached. clara.document_capabilities keeps 0191''s posture exactly: FORCE RLS, owner policy, SELECT for clara_authenticated alone, no write privilege for any application role, and the agent lane still reading it only through clara._document_capability.';
end
$w656_tail$;
