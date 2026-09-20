-- 0246_business_operation_proposal_only — #988: business_operation GAINS A FIFTH LEVEL, "CLARA
-- PROPOSES, A PERSON CONFIRMS".
-- =====================================================================================
-- Spec of record: issue #988, owner ruling 2026-09-20:
--
--   "Confirmed Option B: business_operation gains a fifth level meaning 'Clara proposes, a
--    person confirms' (the exact token is left to the implementer). This differs from the
--    ticket's own 'After the decision' list in one load-bearing way: prior_gl is NOT
--    reclassified onto the new level. The same session's #983 ruling retires the prior-GL
--    seeding lane outright, because the product direction is the Client KB and nobody hand
--    pre-registers what Clara can learn from a source. So prior_gl stays stored_only with an
--    honest basis until the Client KB actually ingests a prior GL. The new level exists for the
--    next pairing shaped this way, not for prior_gl."
--
-- and #988's own newest Agent Brief: "A fifth level names this case: Clara proposes, a person
-- confirms, and no typed fact reaches a posted operation on Clara's own authority ... No row is
-- reclassified onto it beyond what the owner explicitly names in the implementing migration;
-- prior_gl is excluded by ruling and stays at the store-only level."
--
-- PARENT FILE, NOT EDITED HERE: 0191_document_capability_registry.sql (the table, its four
-- single-column CHECKs, business_operation's own among them, its column comments). This file
-- drops and re-adds ONLY the business_operation CHECK, under the SAME name Postgres minted for
-- 0191's inline column check (measured on this rig, never guessed). custody, byte_extraction and
-- typed_facts are OUT OF SCOPE (the ticket's own words) and are read back byte-identical in the
-- tail. 0207's version-monotone wall and 0244's high-water mark + uniformity wall (#846, this
-- lane's own prior ticket) and 0245's content republish (#782, this lane's own prior ticket,
-- registry_version 2 -> 3) are neither edited nor ridden by any real write: this file changes
-- VOCABULARY, not DATA.
--
-- WHY ZERO ROWS MOVE, AND WHY THAT MEANS ZERO registry_version RAISE. The owner's ruling is
-- explicit: no row is reclassified onto the new level in this migration (prior_gl stays
-- stored_only pending the Client KB's own prior-GL ingestion path, #1012). registry_version is a
-- per-row PUBLICATION mark -- 0244/0245's own header prose states the promise it exists for:
-- "every row published together carries the same integer". A mark whose whole reason to exist is
-- DATA does not move for a change that republishes no row's data. This lane's own #846 (0244) is
-- the direct precedent: it minted a whole new relation and two new walls, touched ZERO rows of
-- clara.document_capabilities, and did not raise registry_version -- the version stayed at 2
-- (0228's own publish) for the whole of 0244, and only 0245 (#782), which DID correct 28 rows'
-- `limits`, raised it to 3. This file follows 0244's shape: a vocabulary change with no
-- row-content correction leaves registry_version exactly where it is. The tail proves the
-- registry is STILL uniformly at 3 after this file runs.
--
-- WHAT "AN HONESTY-INVARIANT CHECK" MEANS HERE. clara.document_capabilities carries no live
-- CROSS-COLUMN CHECK constraint for its existing analogous rule either: "business_operation
-- never claims supported where typed_facts is not supported" has ALWAYS lived only in
-- packages/db/tests/document-capability-registry.test.mjs's repeatable battery (the ticket's own
-- name for that cell, "the existing check that refuses an operation promised over facts that do
-- not exist") and, once, in 0191's one-time migration-apply tail. This file adds the new level's
-- OWN parallel cell to that SAME battery rather than minting a mechanism the estate does not
-- otherwise use for this family of rule: a proposal_only row that could not actually derive a
-- proposal (typed_facts <> 'supported') would be the identical over-claim #988 exists to
-- prevent, so the new cell fails a row at the new level unless typed_facts = 'supported'.
--
-- THE TOKEN. "proposal_only", sitting beside `stored_only` in the same "X_only" shape this table
-- already uses for a level that promises less than `supported`: stored_only says "we keep it, we
-- derive nothing"; proposal_only says "we derive a real proposal, we never post it ourselves".
-- The brief leaves the exact spelling to the implementer.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A PRESTATE. Measured on THIS rig (127.0.0.1:55743 / clara_l03) on 2026-09-20, never
-- transcribed from another file's text -- #846/#782 are this lane's own prior tickets and may
-- have recut a body #988 touches: pin what is LIVE now.
-- =====================================================================================
do $w988_pre$
declare
  v_n int; v_def text; v_conname text; v_redo boolean;
  v_sha_monotone text; v_sha_hw_insert text; v_sha_hw_record text; v_sha_hw_monotone text; v_sha_uniform text;
  v_versions int; v_v int; v_rows int;
begin
  foreach v_conname in array array['clara_fn_owner','clara_authenticated','clara_agent_ro'] loop
    if not exists (select 1 from pg_roles where rolname = v_conname) then
      raise exception '#988 prestate: role % is missing', v_conname using errcode = 'CLR10';
    end if;
  end loop;

  if to_regclass('clara.document_capabilities') is null then
    raise exception '#988 prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;

  -- (a) THE CHECK THIS FILE REPLACES, BY NAME AND BY BODY -- Postgres's own auto-generated name
  -- for 0191's inline column CHECK, measured rather than guessed. A REDO (this file re-applied
  -- after 0246 already landed) reads the FIVE-value form already; a FIRST apply reads the
  -- original four. Anything else is drift this file refuses to build on.
  select c.conname, pg_get_constraintdef(c.oid) into v_conname, v_def from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%business_operation%';
  if v_conname is distinct from 'document_capabilities_business_operation_check' then
    raise exception '#988 prestate: the business_operation CHECK is named % rather than the measured document_capabilities_business_operation_check', coalesce(v_conname, '<absent>')
      using errcode = 'CLR10';
  end if;
  v_redo := v_def like '%proposal_only%';
  if not v_redo and v_def is distinct from
      'CHECK ((business_operation = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))' then
    raise exception '#988 prestate: the business_operation CHECK reads % rather than the measured four-value form -- a prior ticket may have recut it', v_def
      using errcode = 'CLR10';
  end if;

  -- (b) THE THREE SIBLING CHECKS STAY OUT OF SCOPE (the ticket's own words) -- custody,
  -- byte_extraction, typed_facts are untouched by this file and must still read their ORIGINAL
  -- four-value form, whether this is a first apply or a redo.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_custody_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((custody = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 prestate: document_capabilities_custody_check drifted from its measured four-value form -- out of scope for #988' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_byte_extraction_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((byte_extraction = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 prestate: document_capabilities_byte_extraction_check drifted from its measured four-value form -- out of scope for #988' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_typed_facts_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((typed_facts = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 prestate: document_capabilities_typed_facts_check drifted from its measured four-value form -- out of scope for #988' using errcode = 'CLR10';
  end if;

  -- (c) THE WALLS A BEHAVIOURAL PROBE IN THIS FILE'S TAIL RIDES, PINNED BY BODY -- #846/#782 are
  -- this lane's own prior tickets and may have recut a body #988's tail touches: pin what is
  -- LIVE now, never transcribed from 0207's, 0244's or 0245's file text.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha_monotone from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha_monotone <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#988 prestate: clara._tf_document_capabilities_version_monotone body drifted (sha %)', v_sha_monotone
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha_hw_insert from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure;
  if v_sha_hw_insert <> 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#988 prestate: clara._tf_document_capabilities_version_high_water body drifted (sha %)', v_sha_hw_insert
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha_hw_record from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure;
  if v_sha_hw_record <> '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d' then
    raise exception '#988 prestate: clara._tf_document_capabilities_high_water_record body drifted (sha %)', v_sha_hw_record
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha_hw_monotone from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha_hw_monotone <> '196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27' then
    raise exception '#988 prestate: clara._tf_document_capability_high_water_monotone body drifted (sha %)', v_sha_hw_monotone
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha_uniform from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure;
  if v_sha_uniform <> 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#988 prestate: clara._tf_document_capabilities_version_uniform body drifted (sha %)', v_sha_uniform
      using errcode = 'CLR10';
  end if;

  -- (d) THE REGISTRY IS UNIFORM TODAY, AT 3 (0245's own publish, #782) -- this file's tail
  -- proves it is STILL 3 after the vocabulary widens, since zero rows move.
  select count(distinct registry_version)::int, min(registry_version)::int, count(*)::int
    into v_versions, v_v, v_rows
    from clara.document_capabilities;
  if v_versions <> 1 then
    raise exception '#988 prestate: the registry publishes % distinct registry_versions, not one', v_versions
      using errcode = 'CLR10';
  end if;
  if v_v <> 3 then
    raise exception '#988 prestate: the registry publishes version %, not the 3 this file must leave unchanged', v_v
      using errcode = 'CLR10';
  end if;
  if v_rows <> 240 then
    raise exception '#988 prestate: the registry holds % rows, not 240 -- this file inserts and deletes nothing', v_rows
      using errcode = 'CLR10';
  end if;

  -- (e) ZERO ROWS ALREADY CARRY THE NEW TOKEN (a first apply) OR THE STATE IS ALREADY A CLEAN
  -- REDO'S PREMISE -- either way, no row reclassification is smuggled in ahead of this file.
  select count(*)::int into v_n from clara.document_capabilities where business_operation = 'proposal_only';
  if v_n <> 0 then
    raise exception '#988 prestate: % row(s) already carry business_operation = proposal_only -- the owner named none for this migration', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#988 prestate: OK -- business_operation''s CHECK reads its measured %-value form, custody/byte_extraction/typed_facts are untouched at their original four, the five #779/#846 wall bodies are at their measured pre-image shas, the registry publishes version 3 uniformly across 240 rows, zero rows carry proposal_only, and this is a % apply.',
    case when v_redo then 'five' else 'four' end, case when v_redo then 'REDO' else 'FIRST' end;
end
$w988_pre$;

-- =====================================================================================
-- §B THE CHANGE. business_operation's CHECK widens from four values to five. Nothing else on
-- the table moves: no column, no trigger, no policy, no grant, no other CHECK.
-- =====================================================================================
set role clara_fn_owner;

alter table clara.document_capabilities
  drop constraint if exists document_capabilities_business_operation_check;
alter table clara.document_capabilities
  add constraint document_capabilities_business_operation_check
  check (business_operation in ('supported', 'stored_only', 'unsupported', 'planned', 'proposal_only'));

comment on column clara.document_capabilities.business_operation is
  'Can this pair drive an accounting operation? supported where Clara can carry typed facts into it; proposal_only where Clara reads deterministically and derives a real proposal but never carries it into a posted operation on its own authority -- a person confirms first (#988); stored_only where the filing is work a PERSON completes and Clara derives nothing to drive it (the honest "no placeholder success"); unsupported where the kind carries no business operation at all. No row is proposal_only unless a migration explicitly names it; prior_gl is NOT one of them (owner ruling 2026-09-20, #983/#1012) and stays stored_only.';

reset role;

-- =====================================================================================
-- §C TAIL. The CHECK reads its new five-value form under the SAME name, the three sibling
-- CHECKs are byte-identical, the CHECK still refuses garbage, a behavioural probe proves the
-- new value is genuinely ADMITTED (never merely present in the constraint's own text), zero
-- rows carry it for real, the registry is still uniformly at version 3 across 240 rows, the
-- high-water mark agrees, and nothing else about the table moved.
-- =====================================================================================
do $w988_tail$
declare
  v_n int; v_def text; v_conname text; v_row clara.document_capabilities%rowtype;
  v_err text; v_detail text; v_reason jsonb; v_stored text; v_violations int;
begin
  -- (1) THE CHECK NOW READS THE FIVE-VALUE FORM, SAME NAME.
  select c.conname, pg_get_constraintdef(c.oid) into v_conname, v_def from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%business_operation%';
  if v_conname <> 'document_capabilities_business_operation_check' then
    raise exception '#988 tail: the business_operation CHECK is named % after this file ran, not the original name', v_conname
      using errcode = 'CLR10';
  end if;
  if v_def <> 'CHECK ((business_operation = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text, ''proposal_only''::text])))' then
    raise exception '#988 tail: the business_operation CHECK reads % rather than the five-value form this file installs', v_def
      using errcode = 'CLR10';
  end if;

  -- (2) THE THREE SIBLING CHECKS ARE BYTE-IDENTICAL TO THE PRESTATE -- out of scope means
  -- untouched, not merely unmentioned.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_custody_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((custody = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 tail: document_capabilities_custody_check moved -- #988 is business_operation only' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_byte_extraction_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((byte_extraction = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 tail: document_capabilities_byte_extraction_check moved -- #988 is business_operation only' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
                    and c.conname = 'document_capabilities_typed_facts_check'
                    and pg_get_constraintdef(c.oid) = 'CHECK ((typed_facts = ANY (ARRAY[''supported''::text, ''stored_only''::text, ''unsupported''::text, ''planned''::text])))') then
    raise exception '#988 tail: document_capabilities_typed_facts_check moved -- #988 is business_operation only' using errcode = 'CLR10';
  end if;

  -- (3) THE CHECK STILL REFUSES GARBAGE -- widening admits a fifth NAMED value, not "anything".
  begin
    insert into clara.document_capabilities
      (format, document_kind, mime_type, custody, byte_extraction, typed_facts,
       business_operation, engine_id, engine_byte, registry_version, basis)
    values ('zzz988a', 'invoice', 'application/zzz988a', 'supported', 'supported', 'supported',
            'maybe_someday', null, null, 1, 'probe');
    raise exception '#988 tail: a sixth, out-of-set business_operation value was ACCEPTED -- the CHECK no longer bounds the vocabulary'
      using errcode = 'CLR10';
  exception when sqlstate '23514' then null;
  end;

  -- (4) A BEHAVIOURAL PROBE PROVES THE FIFTH VALUE IS GENUINELY ADMITTED -- not merely present
  -- in pg_get_constraintdef's own text -- and that it reads back distinct from stored_only.
  -- Rolled back WHOLE through the estate's in-migration sentinel idiom (0016 D-P1's shape,
  -- 0207's / 0244's own usage).
  begin
    select * into v_row from clara.document_capabilities where format = 'pdf' and document_kind = 'invoice';
    if v_row.typed_facts <> 'supported' then
      raise exception '#988 tail: the probe pair pdf x invoice is not typed_facts-supported -- the honest-use probe needs it to be' using errcode = 'CLR10';
    end if;
    update clara.document_capabilities set business_operation = 'proposal_only'
     where format = 'pdf' and document_kind = 'invoice';
    select business_operation into v_stored from clara.document_capabilities
     where format = 'pdf' and document_kind = 'invoice';
    if v_stored <> 'proposal_only' then
      raise exception '#988 tail: business_operation = proposal_only was not accepted by the widened CHECK (stored %)', v_stored
        using errcode = 'CLR10';
    end if;
    if v_stored = 'stored_only' then
      raise exception '#988 tail: proposal_only collapsed into stored_only -- the two levels must read as distinct strings'
        using errcode = 'CLR10';
    end if;

    -- The SAME level over a pair whose typed_facts is NOT supported (ofx x bank_statement,
    -- C-37) is the over-claim the new honesty-invariant TEST cell (document-capability-registry.
    -- test.mjs) exists to catch. The CHECK has no opinion on typed_facts, so this UPDATE
    -- succeeds; the invariant lives in the repeatable test file, proven there against the SAME
    -- live shape this probe sets up.
    update clara.document_capabilities set business_operation = 'proposal_only'
     where format = 'ofx' and document_kind = 'bank_statement';
    select count(*)::int into v_violations from clara.document_capabilities
     where business_operation = 'proposal_only' and typed_facts <> 'supported';
    if v_violations <> 1 then
      raise exception '#988 tail: expected exactly 1 dishonest proposal_only row inside the probe, found %', v_violations
        using errcode = 'CLR10';
    end if;

    raise exception '#988 probe rollback' using errcode = 'ZA988';
  exception when sqlstate 'ZA988' then null;
  end;

  -- (5) THE PROBE LEFT NOTHING BEHIND -- zero rows carry proposal_only for real, exactly as the
  -- owner's ruling requires (no row named for reclassification this round).
  select count(*)::int into v_n from clara.document_capabilities where business_operation = 'proposal_only';
  if v_n <> 0 then
    raise exception '#988 tail: the probe leaked -- % row(s) carry business_operation = proposal_only after rollback', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) THE REGISTRY IS STILL UNIFORMLY AT VERSION 3, 240 ROWS -- a vocabulary widening
  -- republishes no row, so nothing here moved.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#988 tail: the registry publishes % distinct registry_versions -- #988 must leave this at 1', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 3 then
    raise exception '#988 tail: the registry publishes version %, not the 3 it published before this file ran', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#988 tail: the registry now holds % rows -- this file inserts and deletes nothing (permanently)', v_n
      using errcode = 'CLR10';
  end if;

  -- (7) THE HIGH-WATER MARK STILL AGREES WITH THE REGISTRY -- #846's mark is untouched because
  -- no row's registry_version moved.
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#988 tail: % pair(s) carry a high-water mark that disagrees with the published registry', v_n
      using errcode = 'CLR10';
  end if;

  -- (8) NOTHING ELSE ABOUT THE TABLE MOVED -- RLS, policies, grants, the five wall bodies.
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid = 'clara.document_capabilities'::regclass) then
    raise exception '#988 tail: clara.document_capabilities is no longer RLS-enabled AND forced' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'document_capabilities';
  if v_n <> 2 then
    raise exception '#988 tail: clara.document_capabilities carries % policies, not 0191''s owner + human-read pair', v_n
      using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception '#988 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure), 'UTF8')), 'hex')
     <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56'
  or encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure), 'UTF8')), 'hex')
     <> 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9'
  or encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure), 'UTF8')), 'hex')
     <> '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d'
  or encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure), 'UTF8')), 'hex')
     <> '196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27'
  or encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure), 'UTF8')), 'hex')
     <> 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#988 tail: one of the five #779/#846 wall bodies was modified by this file' using errcode = 'CLR10';
  end if;

  -- (9) THE COLUMN COMMENT NAMES THE FIFTH LEVEL.
  if position('proposal_only' in coalesce(pg_catalog.col_description('clara.document_capabilities'::regclass, (
        select attnum from pg_attribute where attrelid = 'clara.document_capabilities'::regclass and attname = 'business_operation'
      )), '')) = 0 then
    raise exception '#988 tail: the business_operation column comment does not name proposal_only' using errcode = 'CLR10';
  end if;

  raise notice '#988 tail: OK -- document_capabilities_business_operation_check now reads supported/stored_only/unsupported/planned/proposal_only under its original name, custody/byte_extraction/typed_facts are byte-identical to prestate, the CHECK still refuses a sixth out-of-set value, a rolled-back behavioural probe proved proposal_only is genuinely ADMITTED and reads distinct from stored_only, the SAME probe proved the honesty-invariant test cell has a real row to discriminate rather than passing only because none exists, the probe left nothing behind (zero real rows carry proposal_only), the registry still publishes version 3 uniformly across 240 rows with the high-water mark in agreement, RLS/policies/grants are unchanged, and none of the five #779/#846 wall bodies moved. Neither 0191, 0207, 0244 nor 0245 is edited by this file.';
end
$w988_tail$;
