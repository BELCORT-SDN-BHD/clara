-- UNNUMBERED_f_a4_pr_1a_measurement_layer.sql -- Wave-F Track A, F-A4 (close key 1),
-- PR-1a: WINDOW A, THE MEASUREMENT LAYER.
--
-- MIGRATION NUMBER claimed at MERGE PREPARATION (standing law, AGENTS.md constraint 10 +
-- .claude/rules/db-migrations.md). This file names no number and nothing in it -- not the
-- prestate, not the tail, not the battery -- keys on one. The battery gates on the CATALOG
-- (what the live bodies carry), never on this filename.
--
-- DESIGN OF RECORD: docs/plan/active/close-key-1-design.md v2 -- SS3.5 (the dry-run
-- extraction), SS3.10 (the undated-document gate, TA-P14 clause 1), SS5 step 2 (PR-1a).
-- MECHANISM: close-key-1-annexes-1-mechanics.md Annex A.5 (the new gate) and Annex A.6 (the
-- extraction). D1 LIST: close-key-1-annexes-2-record.md Annex F.1 (WINDOW A, rows A1-1/A1-2/
-- A1-3). GATE RECORD: close-key-1-gate-record.md (GM-4 -> D-18; GN-1's span corrections).
-- BATTERY: packages/db/tests/f-a4-pr1a-measurement.test.mjs (cells A-3, A-4, A-5, A-11,
-- plus the dry-run cell and census C15).
--
-- =====================================================================================
-- SS0 -- THE D1 QUIESCE INVENTORY, AND THE PRE-QUIESCE TRIPWIRE
-- =====================================================================================
-- THREE D1 rows, exactly Annex F.1's list. Nothing here touches a wake surface, a receipt
-- table or a wake kind; there is no ALTER and no CHECK swap.
--
--   A1-1  clara._evaluate_one_gate(uuid,text)      CoR -- delegates to the new
--         `_measure_one_gate`; its dispatch gains the `undated_documents` arm. D1 because it
--         WRITES clara.close_gate_results and is reached from finalize_close's transaction.
--   A1-2  clara._gate_outstanding_items(text,jsonb) CoR -- one added `undated_documents` arm.
--         D1 because it is read INSIDE finalize_close's transaction (and by
--         get_close_readiness, get_close_plan and attest_close_exception). This is the one
--         body Window A shares with the finalize path -- which is why A runs before B.
--   A1-3  clara.close_gate_checks                   INSERT -- a fourteenth catalog row,
--         `undated_documents` (census C15: 13 -> 14). Not a CoR, but it changes what
--         _evaluate_close_gates loops over inside a live writer's transaction, so it lands
--         WITH A1-1/A1-2 and never between them.
--
-- ADDITIVE, in this same file, needing no window (nothing in flight can be inside a body that
-- does not exist): clara._measure_one_gate, clara._close_gate_undated and
-- clara._close_dry_run_core. Ordering, per Annex F.1: the additive creations FIRST (so A1-1
-- can reference them) -> A1-1 -> A1-2 -> A1-3.
--
-- PRE-QUIESCE TRIPWIRE -- run this BEFORE the window opens, never during it. A mismatch means
-- the body this file was authored against is not the body that is live, and the ceremony must
-- abort while the writers are still up (an abort inside an open window costs hours):
--
--   select p.oid::regprocedure::text,
--          encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha256
--     from pg_proc p
--    where p.oid in ('clara._evaluate_one_gate(uuid,text)'::regprocedure,
--                    'clara._gate_outstanding_items(text,jsonb)'::regprocedure,
--                    'clara._close_gate_uncoded(uuid,uuid)'::regprocedure);
--
--   clara._evaluate_one_gate(uuid,text)
--     63ebc5feef4449b24537870282ae9f6fd0adbf63d42151922bafa05b81ce0b39   (RECUT here, A1-1)
--   clara._gate_outstanding_items(text,jsonb)
--     3f942a043506e834687b13678f968c05bda469efd713696d28a1af0574f6f4e6   (RECUT here, A1-2)
--   clara._close_gate_uncoded(uuid,uuid)
--     e9c5defbfea24942fd7c9936faf5887998ec18fe71519694fb81a7aa97c457df   (MUST NOT MOVE -- D-18)
--
-- All three pins were taken by RIG REPLAY at the 0102 frontier (pg_get_functiondef /
-- pg_proc.prosrc on a throwaway postgres:17 migrated + seeded from zero), never from migration
-- text. They are 0056 originals: 0056 is the only definer of each and 0064 merely CALLS
-- _gate_outstanding_items, so no generation has spliced them. The sha is computed
-- SERVER-SIDE; psql on Windows translates LF to CRLF on stdout, so a client-side hash of a
-- psql dump does NOT reproduce these values (measured, not assumed -- the stored prosrc
-- contains zero CR bytes: position(chr(13) in prosrc) = 0).
--
-- The prestate below re-asserts all three pins and REFUSES on any mismatch. The tail
-- re-asserts that _close_gate_uncoded, _evaluate_close_gates and finalize_close did not move.
--
-- =====================================================================================
-- WHAT THIS FILE SHIPS, in section order
-- =====================================================================================
-- S1  clara._close_gate_undated(p_client uuid, p_fy uuid) returns jsonb  [STABLE, ungranted]
--     THE NEW DRAWER-2 EVALUATOR (design SS3.10, Annex A.5). F3's defect: a document filed
--     against a client with NO financial_date is invisible to _close_gate_uncoded (its
--     population is `d.financial_date between v_fy.starts_on and v_fy.ends_on`, and a NULL
--     satisfies no BETWEEN), and because the dated gate is date-scoped the miss is PERMANENT
--     -- no later close ever asks about that document again. The repair gives the undated
--     population its OWN catalog row and does NOT widen the dated gate: close_gate_checks is
--     append-only BEFORE UPDATE OR DELETE (0056:378-379, proven behaviourally on the rig), so
--     folding the undated set into `uncoded_documents` would make that row's SHIPPED title
--     ("No FY-dated filings without an entry") false and structurally uncorrectable.
--     It answers `unknown`, never `fail`: the gate genuinely cannot place these documents in
--     a year, and drawer 2 treats `unknown` exactly like `fail` for ADMISSION
--     (finalize_close's `elsif g.drawer = 2 and g.state in ('fail','unknown','error')`) while
--     leaving the per-item attested path open. Saying `fail` would assert a placement nobody
--     read.
-- S2  clara._measure_one_gate(p_check_key text, p_client uuid, p_fy uuid) returns jsonb
--     [STABLE, ungranted] -- the pure measurement, extracted VERBATIM out of
--     _evaluate_one_gate (Annex A.6 (1)). One measurement body, two entrances (TA-P11); a
--     separately-written "preview" evaluator would be two and is refused (D-03).
-- S3  clara._close_dry_run_core(p_client uuid, p_fy uuid) returns jsonb  [STABLE, ungranted]
--     -- the whole catalog measured WITHOUT a run, WITHOUT an INSERT and WITHOUT touching
--     fiscal_years.status (Annex A.6 (3)). Nothing calls it yet; PR-1c's
--     `wake_dry_run_close_readiness` wrapper is its first consumer.
-- S4  A1-1  clara._evaluate_one_gate recut to delegate.
-- S5  A1-2  clara._gate_outstanding_items gains its `undated_documents` arm.
-- S6  A1-3  the fourteenth catalog row.
-- S7  the tail self-proof, and the PUBLISHED measurement design SS7 R-3 asks for.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH -- stated so a reader does not go looking
-- =====================================================================================
-- * clara._close_gate_uncoded -- D-18. The dated gate's body, population and digest are
--   unmoved; its prosrc sha is pinned in the prestate AND re-asserted in the tail. This is
--   the whole point of D-18: measured_digest is per check_key (0056:1466), so a new undated
--   filing moves ONLY the undated gate's digest and can never invalidate a professional's
--   signed attestation about the DATED set (cell A-11).
-- * clara._evaluate_close_gates -- it already loops `select * from clara.close_gate_checks
--   order by drawer, check_key`, so the fourteenth row rides it with no code change. Its
--   prosrc is tail-asserted unmoved.
-- * clara.finalize_close, clara.get_close_readiness, clara.get_close_plan,
--   clara.attest_close_exception -- all four reach items through _gate_outstanding_items, so
--   attestation, the digest-staleness rule and get_close_readiness's `attested` computation
--   need no change at all. finalize_close's prosrc is tail-asserted unmoved.
-- * every wake surface, every receipt table, every wake kind, and keys 2 and 3.
--
-- =====================================================================================
-- TWO AUTHORING DECISIONS THAT DIVERGE FROM THE ANNEX SKETCH -- recorded, not smuggled
-- =====================================================================================
-- (i) THE DATE BOUND IS TAKEN IN MYT, NOT IN THE SESSION TIME ZONE. Annex A.5's sketch writes
--     `f.filed_at::date <= v_fy.ends_on`. `filed_at` is timestamptz, so BOTH that cast and any
--     rendering of the raw value into the payload depend on the SESSION's TimeZone setting --
--     and measured_digest is md5 over the payload (0056:1466), re-computed by finalize_close
--     in-transaction and compared for staleness (0056:2083-2100). A session-dependent digest
--     would make a professional's attestation read STALE merely because the next reader
--     connected from a different time zone. This file therefore uses the house MYT idiom
--     (0016:477, 0041:1013 -- `(x at time zone 'Asia/Kuala_Lumpur')::date`, the same clock
--     clara._book_today() runs on) for the bound AND for the payload's `filed_on` key. The
--     annex's own preamble governs: "Sketches below are shape, not source."
-- (ii) THE MISSING-FY BRANCH IS FAIL-CLOSED. If p_fy resolves to no row, the bound
--     `filed_on <= NULL` is NULL for every candidate and the population is EMPTY -- so a
--     naive copy of the dated gate's shape would answer `pass` on a fiscal year that does not
--     exist. That is absence read as evidence. This evaluator answers
--     `unknown / fiscal_year_not_found` instead. The dated gate's identical latent branch is
--     NOT repaired here (D-18 keeps its body unmoved); it is recorded for F-A4's successor.
--
-- WHY `filed_at` IS A LAWFUL BOUND AT ALL: it is DB-owned and NOT NULL (0007:68), so the
-- bound asserts nothing about the document. Without it, ONE new undated filing anywhere in
-- the client's history -- a bank letter for a year nobody is closing -- would move this
-- digest and force a professional to re-sign statements about documents that did not change.
-- THE RESIDUAL, recorded not hidden: an undated document filed AFTER the year end cannot be
-- placed in the year by any fact the DB owns. It is outside this population by construction.
-- OQ-8 was ruled OFF-DIGEST (ruling R-L13): it is surfaced as a plan-level COUNT (a read, not
-- a digest input) and rides OQ-6's typed-question channel. Cell A-11's twin proves a document
-- filed after `ends_on` moves NEITHER digest.

set local statement_timeout = '10min';
-- SEARCH PATH PINNED FOR THE WHOLE FILE (0092:21-26's recorded reason): the tail compares
-- catalog reads taken either side of a DDL, and an unpinned path renders qualified-or-bare
-- inconsistently.
set local search_path = clara, pg_temp;

-- =====================================================================================
-- S0 -- QUIESCE GUARD. FAIL CLOSED ON ABSENCE: 0006 creates the heartbeat table and always
-- precedes this file, so absence is catalog drift -- and drift is exactly when a runtime is
-- most likely alive and unobservable.
-- =====================================================================================
do $fa4_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A4 PR-1a QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode = 'CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A4 PR-1a QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces clara._evaluate_one_gate (a WRITER, reached from finalize_close''s transaction) and clara._gate_outstanding_items (READ inside that same transaction), and PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it STARTED with (D1). Stop clara-runtime, wait for staleness (>90s), and re-apply.',
      v_component, v_beat;
  end if;
end
$fa4_quiesce$;

-- =====================================================================================
-- S0.1 -- PRESTATE. Every claim this file makes about what it is editing, MEASURED. The
-- pinned live sources are also CAPTURED here, so the tail can prove -- by construction, not
-- by assertion -- that the extraction moved the dispatch verbatim and that the item body
-- gained exactly one arm and lost nothing.
-- =====================================================================================
create temporary table f_a4_pr1a_pins (name text primary key, sha text, src text) on commit drop;

do $fa4_pre$
declare
  v_src text; v_sha text; v_n int; v_def text; v_p1 int; v_p2 int;
begin
  -- (0.1) THE TARGETS EXIST, EXACTLY ONCE EACH. A prior recut that CREATEd an overload
  -- instead of REPLACING the live body would leave the old shape reachable (0054:132-146).
  foreach v_def in array array[
      'clara._evaluate_one_gate(uuid,text)',
      'clara._gate_outstanding_items(text,jsonb)',
      'clara._close_gate_uncoded(uuid,uuid)',
      'clara._evaluate_close_gates(uuid)'] loop
    if to_regprocedure(v_def) is null then
      raise exception 'F-A4 PR-1a prestate: % does not exist -- 0056 (the close model) is not live on this database; refuse', v_def
        using errcode = 'CLR10';
    end if;
  end loop;
  for v_def, v_n in
    select p.proname, count(*)::int from pg_proc p
     where p.pronamespace = 'clara'::regnamespace
       and p.proname in ('_evaluate_one_gate','_gate_outstanding_items','_close_gate_uncoded')
     group by p.proname loop
    if v_n <> 1 then
      raise exception 'F-A4 PR-1a prestate: expected exactly 1 clara.% body, found % -- an overload this file does not know about would keep the old shape reachable', v_def, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) NOT ALREADY APPLIED. Checked BEFORE the sha pins, deliberately: a re-run would fail
  -- the pins too (the bodies have moved -- by this very file), and "sha mismatch" is the wrong
  -- diagnosis to hand an operator who simply ran the ceremony twice. All THREE halves are
  -- checked separately: a half-applied Window A must be loud, never a silent re-run.
  if to_regprocedure('clara._measure_one_gate(text,uuid,uuid)') is not null then
    raise exception 'F-A4 PR-1a prestate: clara._measure_one_gate already exists -- Window A looks ALREADY APPLIED' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._close_gate_undated(uuid,uuid)') is not null then
    raise exception 'F-A4 PR-1a prestate: clara._close_gate_undated already exists -- Window A looks ALREADY APPLIED' using errcode = 'CLR10';
  end if;
  perform 1 from clara.close_gate_checks k where k.check_key = 'undated_documents';
  if found then
    raise exception 'F-A4 PR-1a prestate: the close_gate_checks catalog ALREADY carries an undated_documents row -- Window A looks ALREADY APPLIED, and the catalog is append-only so this file cannot correct it' using errcode = 'CLR10';
  end if;

  -- (0.3) CENSUS C15's PRE-IMAGE, measured rather than remembered: the catalog is THIRTEEN
  -- rows, five of them drawer 2. The tail re-reads it as FOURTEEN / SIX.
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 13 then
    raise exception 'F-A4 PR-1a prestate: close_gate_checks carries % row(s), expected 13 (census C15''s pre-image) -- another lane has already extended the catalog; STOP and re-derive C15 before proceeding', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks where drawer = 2;
  if v_n <> 5 then
    raise exception 'F-A4 PR-1a prestate: drawer 2 carries % row(s), expected 5', v_n using errcode = 'CLR10';
  end if;

  -- (0.4) THE CATALOG IS APPEND-ONLY, DISCOVERED BY SHAPE (the 0090 discipline), never by
  -- trusting a migration name. This is D-18's LOAD-BEARING premise: the repair had to be a new
  -- row precisely because the shipped `uncoded_documents` title can never be corrected. If the
  -- guard were absent the design's reasoning would not hold and the review would have to be
  -- re-run, so the file refuses rather than proceeding on a premise it did not verify.
  -- READ BY IDENTITY, NEVER BY SPELLING (review law 3), and this file learned it the hard
  -- way on its own first rig run: with `search_path = clara` pinned for the file,
  -- pg_get_triggerdef DEPARSES the handler BARE (`_tf_append_only()`), so a
  -- `like '%clara._tf_append_only()%'` probe reads FALSE on a database where the trigger is
  -- present and working. The tgfoid comparison below is an OID equality -- it cannot be
  -- fooled by how the deparser chose to render a name. The tgtype bits are read the same
  -- way (2 = BEFORE, 8 = DELETE, 16 = UPDATE, 1 = FOR EACH ROW), and tgenabled is checked
  -- because a DISABLED trigger is a wall that does not refuse.
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.close_gate_checks'::regclass and not t.tgisinternal
     and t.tgfoid = 'clara._tf_append_only()'::regprocedure
     and (t.tgtype & 2) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0
     and (t.tgtype & 1) <> 0 and t.tgenabled <> 'D';
  if v_n <> 1 then
    raise exception 'F-A4 PR-1a prestate: clara.close_gate_checks does not carry exactly one ENABLED, BEFORE DELETE OR UPDATE, FOR EACH ROW trigger on clara._tf_append_only() (found %) -- D-18''s premise (a shipped title is structurally uncorrectable, so the repair must be a NEW row) is not verified on this database', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE CATALOG CHECKS ADMIT THE NEW ROW AS-IS. If they did not, this file would owe an
  -- ALTER and would be a FOUR-row D1 window, not three. The two constraint definitions are
  -- pinned EXACTLY, not matched loosely: a CHECK on a plain column deparses with no schema
  -- qualification, so exact equality is both safe and the loudest possible drift diagnosis.
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.close_gate_checks'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = 'CHECK ((drawer = ANY (ARRAY[1, 2, 3])))';
  if v_n <> 1 then
    raise exception 'F-A4 PR-1a prestate: clara.close_gate_checks does not carry the pinned drawer CHECK `CHECK ((drawer = ANY (ARRAY[1, 2, 3])))` (found % match(es)) -- the drawer domain has moved and PR-1a would owe an ALTER it does not carry', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.close_gate_checks'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = 'CHECK ((applies_when = ANY (ARRAY[''always''::text, ''goods_trading''::text])))';
  if v_n <> 1 then
    raise exception 'F-A4 PR-1a prestate: clara.close_gate_checks does not carry the pinned applies_when CHECK (found % match(es))', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.6) THE THREE PROSRC PINS. See SS0's tripwire block for what a mismatch MEANS: the
  -- bodies below were authored against a body that is not live, so the extraction's
  -- "verbatim" claim was verified against the wrong text. THE CEREMONY STOPS -- it does not
  -- re-cut against a wrong premise.
  for v_def, v_sha in
    select * from (values
      ('clara._evaluate_one_gate(uuid,text)',        '63ebc5feef4449b24537870282ae9f6fd0adbf63d42151922bafa05b81ce0b39'),
      ('clara._gate_outstanding_items(text,jsonb)',  '3f942a043506e834687b13678f968c05bda469efd713696d28a1af0574f6f4e6'),
      ('clara._close_gate_uncoded(uuid,uuid)',       'e9c5defbfea24942fd7c9936faf5887998ec18fe71519694fb81a7aa97c457df')
    ) as t(sig, want) loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_def::regprocedure;
    if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <> v_sha then
      raise exception 'F-A4 PR-1a prestate: % prosrc sha256 mismatch (got %, expected %) -- this is NOT the body PR-1a was authored against. STOP the ceremony.',
        v_def, encode(sha256(convert_to(v_src, 'UTF8')), 'hex'), v_sha using errcode = 'CLR10';
    end if;
    insert into f_a4_pr1a_pins(name, sha, src) values (v_def, v_sha, v_src);
  end loop;

  -- (0.7) THE EXTRACTION ANCHORS ARE UNIQUE IN THE LIVE BODY. The tail proves the moved block
  -- BY CONSTRUCTION -- it slices the pinned live source between these anchors and requires the
  -- slice (with the two stated substitutions) to occur inside the new _measure_one_gate. That
  -- proof is only meaningful if each anchor occurs exactly once, so it is measured here.
  select src into v_src from f_a4_pr1a_pins where name = 'clara._evaluate_one_gate(uuid,text)';
  foreach v_def in array array[
      E'    v_measured := case chk.check_key\n',
      E'\n  end;\n  insert into clara.close_gate_results(',
      E'      else jsonb_build_object(''state'', ''error'', ''reason'', ''no_evaluator_wired'')\n'] loop
    if (length(v_src) - length(replace(v_src, v_def, ''))) / length(v_def) <> 1 then
      raise exception 'F-A4 PR-1a prestate: the extraction anchor %L does not occur EXACTLY once in the live _evaluate_one_gate body -- the tail''s by-construction proof would be meaningless', v_def
        using errcode = 'CLR10';
    end if;
  end loop;
  -- The ELEVEN `v_run.client_id` occurrences inside the dispatch are the only substitution the
  -- extraction makes (the core takes p_client instead of reading a run). Counted here so the
  -- tail's replace() is a proven rewrite of a known population, never a hopeful one.
  v_p1 := position(E'    v_measured := case chk.check_key\n' in v_src);
  v_p2 := position(E'\n  end;\n  insert into clara.close_gate_results(' in v_src);
  v_src := substr(v_src, v_p1, v_p2 - v_p1 + 7);
  v_n := (length(v_src) - length(replace(v_src, 'v_run.client_id', ''))) / length('v_run.client_id');
  if v_n <> 11 then
    raise exception 'F-A4 PR-1a prestate: the dispatch block carries % `v_run.client_id` reference(s), expected 11 -- the live dispatch is not the shape the extraction was written against', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.8) THE ITEM BODY'S TERMINAL ARM is unique, so S5's added arm provably lands in the
  -- `case p_check_key` and nowhere else, and the tail's extend-only proof has one seam.
  select src into v_src from f_a4_pr1a_pins where name = 'clara._gate_outstanding_items(text,jsonb)';
  if (length(v_src) - length(replace(v_src, E'    else ''{}''::text[]\n', ''))) / length(E'    else ''{}''::text[]\n') <> 1 then
    raise exception 'F-A4 PR-1a prestate: the terminal `else ''{}''::text[]` arm does not occur exactly once in the live _gate_outstanding_items body' using errcode = 'CLR10';
  end if;

  raise notice 'F-A4 PR-1a prestate: clean -- 0056''s close model is live; _measure_one_gate/_close_gate_undated absent; the catalog carries 13 rows (5 in drawer 2) with no undated_documents key; the append-only BEFORE UPDATE OR DELETE trigger is present; all three prosrc pins match; the extraction anchors are unique and the dispatch carries exactly 11 v_run.client_id references.';
end
$fa4_pre$;

-- =====================================================================================
-- S1 -- clara._close_gate_undated : THE NEW DRAWER-2 EVALUATOR (design SS3.10, Annex A.5)
-- =====================================================================================
-- ADDITIVE. No window: nothing in flight can be inside a body that does not exist.
--
-- THE LIVE-CODING SUB-PREDICATE IS COPIED VERBATIM from _close_gate_uncoded's own branch,
-- reversal exclusions included -- ONE reading of "coded", never two. (A reversed original
-- keeps status='approved' and its mirror is approved too; neither is standing coding.)
-- WHAT DIFFERS from the dated gate, and only this: the population predicate is
-- `d.financial_date IS NULL` bounded by the filing date instead of
-- `d.financial_date between starts_on and ends_on`, the verdict is `unknown` instead of
-- `fail`, and a missing fiscal year fails CLOSED rather than measuring an empty population.
create function clara._close_gate_undated(p_client uuid, p_fy uuid) returns jsonb
language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_fy record; v_undated jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- FAIL CLOSED ON THE MISSING (design SS3.2 tier B's posture; law 68's ARM-0 shape applied to
  -- a read). Without this branch a non-existent fiscal year yields `ends_on IS NULL`, every
  -- candidate's `filed_on <= NULL` is NULL, the population is empty and the gate answers
  -- `pass` -- absence read as evidence, on the exact gate that exists because a gate which
  -- passes because it cannot see is not a gate.
  if v_fy.id is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_not_found',
      'undated_count', 0, 'undated', '[]'::jsonb);
  end if;
  -- THE BOUND IS TAKEN IN MYT, not in the session time zone (header note (i)): filed_at is
  -- timestamptz and measured_digest is md5 over this payload, so a session-dependent
  -- rendering would make a signed attestation read STALE from a different connection. The
  -- idiom is the house's (0016:477, 0041:1013) and the clock is clara._book_today()'s.
  select coalesce(jsonb_agg(jsonb_build_object('filing_id', f.id, 'document_id', f.document_id,
           'filed_on', (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date)
           order by (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date, f.id), '[]'::jsonb)
    into v_undated
    from clara.document_filings f
    join clara.documents d on d.id = f.document_id
    where f.client_id = p_client and f.retired_at is null
      and d.financial_date is null
      and (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date <= v_fy.ends_on
      and not exists (select 1 from clara.journal_entries je
             where je.document_id = f.document_id and je.client_id = p_client
               and je.status in ('draft', 'approved')
               -- LIVE coding only -- _close_gate_uncoded's own predicate, copied verbatim.
               and je.reversed_by is null and je.reversal_of is null)
  ;
  -- `unknown`, NEVER `fail`: drawer 2 treats unknown exactly like fail for ADMISSION
  -- (finalize_close's drawer-2 arm) while leaving the per-item attested path open (OQ-3).
  -- Saying `fail` would assert a placement nobody read.
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_undated) > 0 then 'unknown' else 'pass' end,
    'undated_count', jsonb_array_length(v_undated), 'undated', v_undated);
end $fn$;
revoke all on function clara._close_gate_undated(uuid, uuid) from public;
alter function clara._close_gate_undated(uuid, uuid) owner to clara_fn_owner;

-- =====================================================================================
-- S2 -- clara._measure_one_gate : THE EXTRACTED MEASUREMENT (design SS3.5, Annex A.6 (1))
-- =====================================================================================
-- ADDITIVE. The `case chk.check_key … end` dispatch, the v_state derivation AND the
-- `begin … exception when others then` block that turns a raising probe into state='error'
-- are moved VERBATIM out of _evaluate_one_gate. Two substitutions, and only two:
--   * `v_run.client_id` becomes `p_client` (11 occurrences, counted in the prestate) -- the
--     core takes the client as an argument instead of reading a close run, which is the whole
--     point: a dry run measures WITHOUT a run, and a run is what arms CLR19 (F4);
--   * ONE ARM IS ADDED, `undated_documents`, so the catalog's fourteenth row is measurable by
--     BOTH entrances.
-- The tail proves this by CONSTRUCTION against the pinned live source, not by assertion.
--
-- STABLE is honest here and was verified, not assumed: all ten dispatched evaluators are
-- STABLE (pg_proc.provolatile = 's'), and the other two arms are literals. The volatility
-- change relative to _evaluate_one_gate is a change to THIS body's declaration only --
-- _evaluate_one_gate stays VOLATILE because it still INSERTs.
--
-- THE RETURN SHAPE carries `measured_present` alongside `measured`. That is not decoration:
-- jsonb_build_object renders a SQL NULL jsonb and a JSON `null` identically, so without the
-- flag a NULL-returning evaluator would come back to _evaluate_one_gate as 'null'::jsonb, and
-- `coalesce(v_measured, '{}'::jsonb)` -- which feeds measured_digest -- would hash "null"
-- instead of "{}". The flag preserves the SQL-NULL/JSON-null distinction exactly.
create function clara._measure_one_gate(p_check_key text, p_client uuid, p_fy uuid)
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
-- S3 -- clara._close_dry_run_core : READINESS WITHOUT ARMING THE WALL (Annex A.6 (3))
-- =====================================================================================
-- ADDITIVE, and nothing calls it yet -- PR-1c's `wake_dry_run_close_readiness` wrapper is its
-- first consumer. Listed as PR-1a's in Annex F.1 ("Additive in the same PR, no window
-- needed") so the measurement layer ships whole.
--
-- F4's problem, stated at the bytes: begin_close arms CLR19 (`update fiscal_years set
-- status='closing'`) BEFORE it measures anything, and the gates only measure inside a run. So
-- today the only way to learn whether a year is ready is to freeze it. This core loops the
-- catalog in _evaluate_close_gates's own order, calls the SAME measurement body, and INSERTS
-- NOTHING, LOCKS NOTHING and TOUCHES fiscal_years.status NOT AT ALL.
--
-- THE TWO IN-BODY DRAWER-1 CHECKS ARE OVERRIDDEN, and this is the honest half of the design
-- (SS3.5's stated limit, risk R-6). `pl_retained_earnings_roll` and `opening_continuity_tie`
-- are computed INSIDE finalize_close, so _measure_one_gate returns a literal `pass` object
-- with a note for them. In a RECORDED run that literal is what the shipped digests were
-- computed over and it stays exactly as it is; in a DRY run there is no finalize to compute
-- them, and reporting `pass` would be the vacuous-green class this item exists to fix. They
-- are therefore reported `not_measurable_before_finalize` -- the note is preserved, only the
-- claim is overridden -- and design SS3.2's rung B3 tests only the MEASURABLE drawer-1 set.
--
-- ITS DIGESTS ARE NOT RECORDABLE. measured_digest is computed the same way (md5 over the
-- payload, 0056:1466) so a caller can compare a dry run against a recorded one, but a dry run
-- writes no close_gate_results row and its digest binds no attestation.
--
-- CONGRUENCE IS A RUNG HERE, unlike in _measure_one_gate. The core takes client and fiscal
-- year as two independent arguments from a caller that has not yet been through Tier A, so a
-- mismatched pair would silently measure one client's books against another client's year
-- end. _measure_one_gate does NOT carry this rung, deliberately: it is a verbatim move and
-- adding a rung to it would change _evaluate_one_gate's behaviour.
create function clara._close_dry_run_core(p_client uuid, p_fy uuid) returns jsonb
language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_fy record; chk record; v_one jsonb; v_measured jsonb; v_state text;
  v_out jsonb := '[]'::jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null then
    raise exception 'fiscal year not found'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  if v_fy.client_id is distinct from p_client then
    raise exception 'fiscal year % does not belong to this client', p_fy
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_client_mismatch"}';
  end if;
  for chk in select * from clara.close_gate_checks order by drawer, check_key loop
    -- NO applies_when SKIP -- _evaluate_close_gates's own rule and its own reason: the
    -- evaluator itself answers 'pass / not_goods_trading' for a service business, and
    -- skipping on absence would be absence-as-evidence.
    v_one := clara._measure_one_gate(chk.check_key, p_client, v_fy.id);
    v_state := v_one ->> 'state';
    v_measured := case when (v_one ->> 'measured_present')::boolean then v_one -> 'measured' else null end;
    if chk.check_key in ('pl_retained_earnings_roll', 'opening_continuity_tie') then
      v_state := 'not_measurable_before_finalize';
      v_measured := jsonb_set(coalesce(v_measured, '{}'::jsonb), '{state}',
        to_jsonb('not_measurable_before_finalize'::text), true);
    end if;
    v_out := v_out || jsonb_build_object('check_key', chk.check_key, 'drawer', chk.drawer,
      'state', v_state, 'measured', v_measured,
      'measured_digest', md5(coalesce(v_measured, '{}'::jsonb)::text));
  end loop;
  return jsonb_build_object('fiscal_year_id', v_fy.id, 'client_id', p_client,
    'dry_run', true, 'checks', v_out);
end $fn$;
revoke all on function clara._close_dry_run_core(uuid, uuid) from public;
alter function clara._close_dry_run_core(uuid, uuid) owner to clara_fn_owner;

-- =====================================================================================
-- S4 -- A1-1 : clara._evaluate_one_gate RECUT TO DELEGATE (D1). Annex A.6 (2).
-- =====================================================================================
-- It keeps its identity, its signature, its volatility, its INSERT and its return object.
-- What moves out is the measurement; what stays is the recording. `chk` is still resolved
-- here because the INSERT and the return read chk.check_key and chk.drawer -- one extra
-- catalog read inside the same snapshot, and the alternative (returning chk out of the core)
-- would change the extracted block.
--
-- WHY THE DIGESTS DO NOT MOVE, and why that is proven rather than claimed: the INSERT and the
-- return below are the pinned live text, byte for byte (the tail slices them out of the
-- pinned source and requires them present); the dispatch is the pinned live text with the two
-- stated substitutions; and the SQL-NULL/JSON-null distinction is carried across the call by
-- `measured_present`. Cell A-3 then replays a fixture close before and after and requires
-- every one of the THIRTEEN pre-existing measured_digest values to be byte-identical, with
-- the fourteenth key present only after -- an ADDED key, never "fourteen equal fourteen",
-- which would be vacuous.
create or replace function clara._evaluate_one_gate(p_run uuid, p_check_key text) returns jsonb
language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_run record; v_fy record; chk record; v_one jsonb; v_measured jsonb; v_state text; v_id uuid;
begin
  select * into v_run from clara.close_runs r where r.id = p_run;
  select * into v_fy from clara.fiscal_years fy where fy.id = v_run.fiscal_year_id;
  select * into chk from clara.close_gate_checks k where k.check_key = p_check_key;
  v_one := clara._measure_one_gate(chk.check_key, v_run.client_id, v_fy.id);
  v_state := v_one ->> 'state';
  v_measured := case when (v_one ->> 'measured_present')::boolean then v_one -> 'measured' else null end;
  insert into clara.close_gate_results(firm_id, close_run_id, check_key, drawer,
      state, measured, measured_digest)
    values (v_run.firm_id, p_run, chk.check_key, chk.drawer, v_state,
      coalesce(v_measured, '{}'::jsonb), md5(coalesce(v_measured, '{}'::jsonb)::text))
    returning id into v_id;
  return jsonb_build_object('result_id', v_id, 'check_key', chk.check_key,
    'drawer', chk.drawer, 'state', v_state, 'measured', v_measured,
    'measured_digest', md5(coalesce(v_measured, '{}'::jsonb)::text));
end $fn$;
revoke all on function clara._evaluate_one_gate(uuid, text) from public;
alter function clara._evaluate_one_gate(uuid, text) owner to clara_fn_owner;

-- =====================================================================================
-- S5 -- A1-2 : clara._gate_outstanding_items GAINS ITS undated_documents ARM (D1).
-- =====================================================================================
-- THE ONE BODY WINDOW A SHARES WITH THE FINALIZE PATH. It is read inside finalize_close's
-- transaction, and by get_close_readiness, get_close_plan and attest_close_exception. Each
-- undated document becomes its OWN item under the new key, keyed by filing_id exactly as the
-- `uncoded_documents` branch is -- which is why attestation, the digest-staleness rule and
-- get_close_readiness's `attested` computation need no change at all.
--
-- WITHOUT this arm the new gate would fall to the terminal `else '{}'::text[]`, every consumer
-- would substitute the single '__gate__' placeholder, and attest_close_exception would take a
-- BLANKET attestation over an unbounded set of documents. Per-item is the ruled shape.
--
-- The four pre-existing arms are retyped from the PINNED live source and the tail proves
-- extend-only BY CONSTRUCTION: removing the added arm from the new prosrc must reproduce the
-- pinned prosrc byte for byte.
create or replace function clara._gate_outstanding_items(p_check_key text, p_measured jsonb)
  returns text[] language sql stable security definer set search_path = clara, pg_temp as $fn$
  select case p_check_key
    when 'unapproved_drafts_in_period' then
      coalesce((select array_agg(x ->> 'entry_id' order by x ->> 'entry_id')
        from jsonb_array_elements(coalesce(p_measured -> 'drafts', '[]'::jsonb)) x), '{}')
    when 'uncoded_documents' then
      coalesce((select array_agg(x ->> 'filing_id' order by x ->> 'filing_id')
        from jsonb_array_elements(coalesce(p_measured -> 'uncoded', '[]'::jsonb)) x), '{}')
    when 'undated_documents' then
      coalesce((select array_agg(x ->> 'filing_id' order by x ->> 'filing_id')
        from jsonb_array_elements(coalesce(p_measured -> 'undated', '[]'::jsonb)) x), '{}')
    when 'depreciation_through_fy_end' then
      coalesce((select array_agg(x ->> 'asset_id' order by x ->> 'asset_id')
        from jsonb_array_elements(coalesce(p_measured -> 'lagging_assets', '[]'::jsonb)) x), '{}')
    when 'open_bank_recon_items' then
      coalesce((select array_agg(k order by k) from (
        select x ->> 'exception_id' as k
          from jsonb_array_elements(coalesce(p_measured -> 'open_exceptions', '[]'::jsonb)) x
        union all
        select (g ->> 'bank_account_id') || ':' || (g ->> 'month')
          from jsonb_array_elements(coalesce(p_measured -> 'statement_gaps', '[]'::jsonb)) g
      ) u), '{}')
    else '{}'::text[]
  end;
$fn$;
revoke all on function clara._gate_outstanding_items(text, jsonb) from public;
alter function clara._gate_outstanding_items(text, jsonb) owner to clara_fn_owner;

-- =====================================================================================
-- S6 -- A1-3 : THE FOURTEENTH CATALOG ROW (census C15).
-- =====================================================================================
-- INSERT is lawful; only UPDATE and DELETE are trapped (0056:378-379, and the prestate
-- verified the trigger by shape). Drawer 2, applies_when 'always' -- an undated filing is a
-- possibility for every client, not only a goods trader. `evaluator_fn` is a documentation
-- column (nothing resolves it dynamically); it names the real function, and the tail proves
-- the name resolves.
--
-- PRICED AS TA-P14 PRICED IT: this flips some currently-green clients red. That is the
-- INTENDED direction -- a gate that passes because it cannot see is not a gate. The tail
-- publishes the population it surfaces (design SS7 R-3 asks for exactly that number).
insert into clara.close_gate_checks (check_key, drawer, title, evaluator_fn, applies_when)
  values ('undated_documents', 2, 'Filed documents carrying no financial date',
          'clara._close_gate_undated', 'always');

-- =====================================================================================
-- S7 -- THE TAIL SELF-PROOF. Raises on failure; prints what it MEASURED, never what it hoped.
-- =====================================================================================
do $fa4_tail$
declare
  v_old text; v_new text; v_want text; v_arm text; v_n int; v_p1 int; v_p2 int;
  v_sha text; v_def text; v_row record;
  v_clients int := 0; v_hits int := 0; v_filings int := 0; v_fys int := 0; v_lines text := '';
begin
  -- (1) THE THREE NEIGHBOURS DID NOT MOVE. _close_gate_uncoded is D-18's whole promise; the
  -- other two are the bodies most likely to be collateral damage from a careless recut.
  for v_def, v_sha in
    select * from (values
      ('clara._close_gate_uncoded(uuid,uuid)',  'e9c5defbfea24942fd7c9936faf5887998ec18fe71519694fb81a7aa97c457df'),
      ('clara._evaluate_close_gates(uuid)',     '72e5d7a7f27ff92188a516bbb8cca9ee0eb93b3d770978b5234aa51e25ec42c3'),
      ('clara.finalize_close(uuid,text,text)',  '64b2c65ee77b4c7b150c1ae09b1238ecaccc5b9f7a0e7204d36b6a1cd0216954')
    ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_new
      from pg_proc p where p.oid = v_def::regprocedure;
    if v_new is distinct from v_sha then
      raise exception 'F-A4 PR-1a tail: % MOVED (prosrc sha256 % , expected %) -- this file must not touch it', v_def, v_new, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) THE EXTRACTION IS VERBATIM, PROVEN BY CONSTRUCTION. Slice the dispatch + v_state
  -- derivation + exception handler out of the PINNED live source, apply the two stated
  -- substitutions, and require the result to occur inside the new _measure_one_gate. This is
  -- a byte claim about the body that is now installed, not a claim about this file's text.
  select src into v_old from f_a4_pr1a_pins where name = 'clara._evaluate_one_gate(uuid,text)';
  v_p1 := position(E'    v_measured := case chk.check_key\n' in v_old);
  v_p2 := position(E'\n  end;\n  insert into clara.close_gate_results(' in v_old);
  v_want := substr(v_old, v_p1, v_p2 - v_p1 + 7);          -- through the exception handler's `  end;`
  v_want := replace(v_want, 'v_run.client_id', 'p_client');
  v_arm := E'      when ''undated_documents''         then clara._close_gate_undated(p_client, v_fy.id)\n';
  v_want := replace(v_want,
    E'      else jsonb_build_object(''state'', ''error'', ''reason'', ''no_evaluator_wired'')\n',
    v_arm || E'      else jsonb_build_object(''state'', ''error'', ''reason'', ''no_evaluator_wired'')\n');
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._measure_one_gate(text,uuid,uuid)'::regprocedure;
  if position(v_want in v_new) = 0 then
    raise exception 'F-A4 PR-1a tail: clara._measure_one_gate does NOT carry the live dispatch verbatim. The extracted block (the pinned _evaluate_one_gate dispatch + v_state derivation + exception handler, with v_run.client_id -> p_client and one added arm) does not occur in the installed body. The extraction is not byte-faithful; every measured_digest in the estate is at risk. REFUSE.'
      using errcode = 'CLR10';
  end if;
  if position('v_run' in v_new) <> 0 then
    raise exception 'F-A4 PR-1a tail: clara._measure_one_gate still references v_run -- the core must read no close run at all' using errcode = 'CLR10';
  end if;

  -- (3) THE RECORDING HALF IS UNTOUCHED, also by construction: the INSERT and the return
  -- object are sliced out of the pinned source and must occur in the new _evaluate_one_gate.
  v_want := substr(v_old, v_p2 + 8);                        -- from `  insert into clara.close_gate_results(`
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._evaluate_one_gate(uuid,text)'::regprocedure;
  if position(v_want in v_new) = 0 then
    raise exception 'F-A4 PR-1a tail: clara._evaluate_one_gate''s INSERT and return object are NOT the pinned live text -- the recut changed the recording half, which is exactly what A1-1 promises it does not' using errcode = 'CLR10';
  end if;
  if position('case chk.check_key' in v_new) <> 0 then
    raise exception 'F-A4 PR-1a tail: clara._evaluate_one_gate still carries its own dispatch -- it must DELEGATE, or the estate has two readings of one measurement (TA-P11)' using errcode = 'CLR10';
  end if;

  -- (4) THE ITEM BODY IS EXTEND-ONLY, proven by removing the added arm and requiring the
  -- pinned source back byte for byte. Nothing else in it moved: not a space, not a comment.
  select src into v_old from f_a4_pr1a_pins where name = 'clara._gate_outstanding_items(text,jsonb)';
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._gate_outstanding_items(text,jsonb)'::regprocedure;
  v_arm := E'    when ''undated_documents'' then\n'
        || E'      coalesce((select array_agg(x ->> ''filing_id'' order by x ->> ''filing_id'')\n'
        || E'        from jsonb_array_elements(coalesce(p_measured -> ''undated'', ''[]''::jsonb)) x), ''{}'')\n';
  if (length(v_new) - length(replace(v_new, v_arm, ''))) / length(v_arm) <> 1 then
    raise exception 'F-A4 PR-1a tail: the undated_documents arm does not occur exactly once in the installed _gate_outstanding_items body' using errcode = 'CLR10';
  end if;
  if replace(v_new, v_arm, '') is distinct from v_old then
    raise exception 'F-A4 PR-1a tail: clara._gate_outstanding_items is NOT extend-only -- removing the added arm does not reproduce the pinned live body byte for byte. Some other arm moved.'
      using errcode = 'CLR10';
  end if;

  -- (5) BEHAVIOURAL DIFFERENTIAL on the item body -- a source proof is not a behaviour proof
  -- (law: spelling is not identity). Each arm is exercised on a synthetic payload, including
  -- the terminal else, and including the NEW arm which is the only reason this row is D1.
  if clara._gate_outstanding_items('undated_documents',
        '{"undated":[{"filing_id":"b"},{"filing_id":"a"}]}'::jsonb) is distinct from array['a','b'] then
    raise exception 'F-A4 PR-1a tail: the undated_documents arm does not itemize by filing_id in sorted order' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('undated_documents', '{"undated":[]}'::jsonb) is distinct from '{}'::text[]
     or clara._gate_outstanding_items('undated_documents', '{}'::jsonb) is distinct from '{}'::text[] then
    raise exception 'F-A4 PR-1a tail: an empty undated population must itemize to the empty array (the scalar __gate__ path), not to NULL' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('uncoded_documents',
        '{"uncoded":[{"filing_id":"z"},{"filing_id":"y"}]}'::jsonb) is distinct from array['y','z'] then
    raise exception 'F-A4 PR-1a tail: the uncoded_documents arm changed behaviour' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('unapproved_drafts_in_period',
        '{"drafts":[{"entry_id":"e2"},{"entry_id":"e1"}]}'::jsonb) is distinct from array['e1','e2'] then
    raise exception 'F-A4 PR-1a tail: the unapproved_drafts_in_period arm changed behaviour' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('depreciation_through_fy_end',
        '{"lagging_assets":[{"asset_id":"a2"},{"asset_id":"a1"}]}'::jsonb) is distinct from array['a1','a2'] then
    raise exception 'F-A4 PR-1a tail: the depreciation_through_fy_end arm changed behaviour' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('open_bank_recon_items',
        '{"open_exceptions":[{"exception_id":"x1"}],"statement_gaps":[{"bank_account_id":"b1","month":"2026-01"}]}'::jsonb)
     is distinct from array['b1:2026-01','x1'] then
    raise exception 'F-A4 PR-1a tail: the open_bank_recon_items arm changed behaviour' using errcode = 'CLR10';
  end if;
  if clara._gate_outstanding_items('ar_control_tie', '{"anything":1}'::jsonb) is distinct from '{}'::text[] then
    raise exception 'F-A4 PR-1a tail: the terminal else arm changed behaviour' using errcode = 'CLR10';
  end if;

  -- (6) CENSUS C15: the catalog is FOURTEEN rows, SIX of them drawer 2, and the new row is
  -- the one this file inserted -- read back from the catalog, never from this file's INSERT.
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 14 then
    raise exception 'F-A4 PR-1a tail: close_gate_checks carries % row(s), expected 14 (census C15)', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks where drawer = 2;
  if v_n <> 6 then
    raise exception 'F-A4 PR-1a tail: drawer 2 carries % row(s), expected 6', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks k
   where k.check_key = 'undated_documents' and k.drawer = 2 and k.applies_when = 'always'
     and k.evaluator_fn = 'clara._close_gate_undated';
  if v_n <> 1 then
    raise exception 'F-A4 PR-1a tail: the undated_documents catalog row is absent or does not read (drawer 2, always, clara._close_gate_undated)' using errcode = 'CLR10';
  end if;
  if to_regprocedure((select k.evaluator_fn || '(uuid,uuid)' from clara.close_gate_checks k
                       where k.check_key = 'undated_documents')) is null then
    raise exception 'F-A4 PR-1a tail: the new row''s evaluator_fn does not resolve to a real function' using errcode = 'CLR10';
  end if;

  -- (7) POSTURE on the three new bodies and the two recut ones: ungranted, definer,
  -- path-pinned, owned by clara_fn_owner. A definer body reachable by an app role would be a
  -- hole this file has no business opening.
  for v_row in
    select p.oid::regprocedure::text as sig, p.provolatile as vol, p.prosecdef as secdef,
           pg_get_userbyid(p.proowner) as own, coalesce(array_to_string(p.proacl, ' '), '') as acl,
           coalesce(array_to_string(p.proconfig, ','), '') as cfg
      from pg_proc p
     where p.oid in ('clara._close_gate_undated(uuid,uuid)'::regprocedure,
                     'clara._measure_one_gate(text,uuid,uuid)'::regprocedure,
                     'clara._close_dry_run_core(uuid,uuid)'::regprocedure,
                     'clara._evaluate_one_gate(uuid,text)'::regprocedure,
                     'clara._gate_outstanding_items(text,jsonb)'::regprocedure) loop
    if not v_row.secdef or v_row.own <> 'clara_fn_owner' or v_row.cfg <> 'search_path=clara, pg_temp' then
      raise exception 'F-A4 PR-1a tail: % posture wrong (secdef=%, owner=%, config=%)', v_row.sig, v_row.secdef, v_row.own, v_row.cfg
        using errcode = 'CLR10';
    end if;
    if v_row.acl <> '' and v_row.acl <> 'clara_fn_owner=X/clara_fn_owner' then
      raise exception 'F-A4 PR-1a tail: % carries an EXECUTE grant beyond its owner (%) -- every body in this file is ungranted; grants ride their consumer''s PR', v_row.sig, v_row.acl
        using errcode = 'CLR10';
    end if;
  end loop;
  -- Volatility, stated per body rather than in one lump: the two new read cores and the item
  -- body are STABLE; _evaluate_one_gate stays VOLATILE because it still INSERTs.
  select p.provolatile into v_def from pg_proc p where p.oid = 'clara._evaluate_one_gate(uuid,text)'::regprocedure;
  if v_def <> 'v' then
    raise exception 'F-A4 PR-1a tail: _evaluate_one_gate is no longer VOLATILE (%) -- it writes close_gate_results', v_def using errcode = 'CLR10';
  end if;
  for v_row in select p.oid::regprocedure::text as sig, p.provolatile as vol from pg_proc p
     where p.oid in ('clara._close_gate_undated(uuid,uuid)'::regprocedure,
                     'clara._measure_one_gate(text,uuid,uuid)'::regprocedure,
                     'clara._close_dry_run_core(uuid,uuid)'::regprocedure) loop
    if v_row.vol <> 's' then
      raise exception 'F-A4 PR-1a tail: % is not STABLE (%) -- it reads and must never write', v_row.sig, v_row.vol using errcode = 'CLR10';
    end if;
  end loop;

  -- (8) THE PUBLISHED MEASUREMENT (design SS7 R-3: "the new gate's population is unmeasured
  -- until PR-1a's replay -- if it is large, publish it and let the owner order the
  -- remediation; never loosen the gate"). This is a READ THAT CAN SAY NO: it names every
  -- client carrying an undated, uncoded, live filing individually, and is silent only when
  -- there is genuinely nothing to name. Both denominators are printed, so a zero is
  -- distinguishable from a population that was never looked at.
  select count(*)::int into v_clients from clara.clients;
  select count(*)::int into v_fys from clara.fiscal_years;
  for v_row in
    select f.client_id, count(*)::int as n
      from clara.document_filings f
      join clara.documents d on d.id = f.document_id
     where f.retired_at is null and d.financial_date is null
       and not exists (select 1 from clara.journal_entries je
              where je.document_id = f.document_id and je.client_id = f.client_id
                and je.status in ('draft','approved')
                and je.reversed_by is null and je.reversal_of is null)
     group by f.client_id order by 2 desc, 1 loop
    v_hits := v_hits + 1;
    v_filings := v_filings + v_row.n;
    v_lines := v_lines || format(' [client %s: %s]', v_row.client_id, v_row.n);
  end loop;
  raise notice 'F-A4 PR-1a MEASURED (design R-3 / prediction P2) -- the undated-document population this gate makes visible, FY BOUND NOT APPLIED (it is a per-fiscal-year predicate and this is an estate-wide census): % client(s) of % carry at least one live, undated, uncoded filing, % filing(s) in total.%',
    v_hits, v_clients, v_filings, case when v_hits = 0 then ' ZERO -- and that is a measured zero, not an unasked question.' else v_lines end;
  -- And the same question asked THROUGH THE GATE ITSELF, per fiscal year that exists. On a
  -- database with no fiscal years this loop runs zero times and SAYS SO -- absence stated,
  -- never a fabricated clean bill.
  v_hits := 0; v_filings := 0; v_lines := '';
  for v_row in
    select fy.id, fy.client_id, fy.label,
           clara._close_gate_undated(fy.client_id, fy.id) as g
      from clara.fiscal_years fy order by fy.client_id, fy.ordinal loop
    if (v_row.g ->> 'state') = 'unknown' then
      v_hits := v_hits + 1;
      v_filings := v_filings + (v_row.g ->> 'undated_count')::int;
      v_lines := v_lines || format(' [fy %s "%s": %s]', v_row.id, v_row.label, v_row.g ->> 'undated_count');
    end if;
  end loop;
  raise notice 'F-A4 PR-1a MEASURED -- through the gate: of % fiscal year(s) on this database, % now read `unknown` on undated_documents (% filing(s) inside the filed_at bound).%',
    v_fys, v_hits, v_filings,
    case when v_fys = 0 then ' THERE ARE ZERO FISCAL YEARS HERE, so this half measured nothing -- it is not a clean bill of health, and the battery (cells A-4/A-5/A-11) is what proves the gate on a rig that mints its own year through the real open_fiscal_year door.'
         when v_hits = 0 then ' ZERO -- a measured zero.' else v_lines end;

  raise notice 'F-A4 PR-1a tail: OK -- THREE D1 rows applied in Annex F.1''s order. _measure_one_gate carries the pinned dispatch VERBATIM (v_run.client_id -> p_client, one added arm) and references no close run; _evaluate_one_gate keeps the pinned INSERT and return byte for byte and now delegates; _gate_outstanding_items is EXTEND-ONLY (removing the new arm reproduces the pinned body exactly) and every arm was exercised behaviourally including the terminal else; the catalog is 14 rows / 6 in drawer 2 with undated_documents naming a function that resolves; _close_gate_uncoded, _evaluate_close_gates and finalize_close are all byte-unmoved; all five bodies are ungranted, definer, path-pinned and owned by clara_fn_owner. Digest equivalence across the extraction is NOT provable from SQL alone -- it is battery cell A-3 (13 pre-existing digests identical + 1 added key), and A-11 proves the dated gate''s digest is independent of the undated population in both directions. No table in workflow/graphile_worker/spike touched. D1 write-quiesce taken (one audited-writer-reached body, one body read inside finalize_close''s transaction, and the catalog both loop over).';
end
$fa4_tail$;
