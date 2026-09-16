-- 0200_counterparty_identity_provenance — #647 (refresh spec #612; journeys A6/C1/C4/C6/C13):
-- COUNTERPARTY IDENTITY GETS PROVENANCE, ONE APPEND-ONLY CORRECTION HISTORY, AND A HUMAN READ.
-- =====================================================================================
-- Spec of record: issue #647 — "Clara maintains source-backed client counterparties and aliases
-- without a prerequisite binding ritual, preserves vendor/customer roles and historical
-- references, and asks only when cross-client or same-name evidence is materially ambiguous."
-- Brief of record: docs/plan/active/refresh-wave-2026-09-15/brief-647.md, whose "Orchestrator
-- decisions" section is binding. Domain words: CONTEXT.md — "Counterparty identity",
-- "Counterparty alias", "Identity correction", "Merge lineage".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. Provenance columns on `clara.counterparty_aliases`
-- (which lane wrote it, on what basis, off which document/extraction/region/field), ONE
-- append-only relation `clara.counterparty_identity_revisions` carrying all five identity acts,
-- four domain event types with NO consumer, and three SECURITY DEFINER reads so a human can
-- finally SEE an identity's source, history and conflicts.
--
-- =====================================================================================
-- WHAT WAS MEASURED ON THE 0198 FRONTIER (rig 127.0.0.1:55506 / clara_647), AND IS WRONG.
--
--   `clara.counterparty_aliases` (0011:651-672) records `origin` — a bare three-value CHECK
--   ('former_name','trade_name','human') — and `created_by`. It records NO source and NO
--   machine-lane bit. Compare `clara.knowledge_records.recorded_via text NOT NULL check in
--   ('human_ui','clara_runtime')` (0192:424), which #644 shipped for exactly this reason.
--   `clara.tick_seeding_proposal` (0118:315-319) inserts into the table DIRECTLY and hard-writes
--   `origin='human'` — the VALUE is the lie; the lane is admin-gated.
--
--   IDENTIFIERS HAVE NO HISTORY. `clara.set_counterparty_identifiers` (0174:785) overwrites
--   registration_no / registration_normalized / tin in place and records the former values only
--   inside a `clara._audit` payload (0174:846-849), which is an operator forensics trail, not a
--   professional's correction history.
--
--   NOTHING LEARNS THAT AN IDENTITY MOVED. rename / add-alias / retire-alias / set-identifiers
--   emit no domain event at all; `counterparty.renamed` and `counterparty.alias_added` do not
--   exist in `clara.event_types`.
--
--   AND A HUMAN CANNOT SEE ANY OF IT. `clara.counterparty_aliases_visible` (0145:960-964)
--   projects six columns and deliberately not `client_id`, `kind`, `origin` or `created_by`
--   ("no more per the ruling", 0145:946-947); `clara.counterparty_merges` (0149:312) has zero
--   consumers outside packages/db/tests.
--
-- =====================================================================================
-- FIVE CHOICES THIS FILE MAKES, EACH WITH THE MEASUREMENT THAT PICKS IT.
--
-- (1) THE THREE NEW READS ARE FUNCTIONS, NEVER MASKED VIEWS. The "debt-BAR1" human-read view
--     family is CATALOG-DERIVED — `relkind='v'`, owner clara_fn_owner, clara_authenticated
--     SELECT, a viewdef matching jwt_firm|actor_role_rank|jwt_sub (packages/db/tests/
--     debt-human-read-surfaces.test.mjs:264-271). Any NEW masked human-read view therefore joins
--     that closed-world roster and REDS it. Widening an EXISTING member's projection does not,
--     which is why `clara.counterparty_aliases_visible` is widened in place (§8) and the three
--     reads are `_human_ctx`-floored SECURITY DEFINER functions.
--
-- (2) `recorded_via` IS NOT NULL **WITH A DEFAULT**, AND THE DEFAULT IS THE HONEST UNKNOWN.
--     A nullable column lets a machine writer lie BY OMISSION, which the honesty trigger below
--     cannot catch. A bare NOT NULL would break `clara.tick_seeding_proposal`'s direct insert at
--     runtime. `NOT NULL DEFAULT 'legacy_unknown'` resolves both: an omitted lane is a RECORDED
--     unknown rather than an invisible one.
--
-- (3) FOUR VALUES, NOT THREE (orchestrator ruling, brief §D11): 'human_ui' | 'agent' |
--     'seeding' | 'legacy_unknown'. Deliberately NOT `clara_runtime`: `clara.knowledge_records`'
--     two-value union names a ROLE, and this column names a LANE, of which the estate has three
--     that can reach this table plus the recorded unknown.
--
-- (4) THE ALIAS DOOR IS **ONE** FUNCTION, WIDENED — NOT AN OVERLOAD, AND NOT A CREATE OR REPLACE.
--     MEASURED ON THIS RIG rather than reasoned about: `create or replace function
--     clara.add_counterparty_alias(... , p_recorded_via text default 'human_ui')` leaves
--     `pg_proc` holding TWO rows —
--       clara.add_counterparty_alias(uuid,uuid,text,text,text)          acl {…clara_authenticated=X…}
--       clara.add_counterparty_alias(uuid,uuid,text,text,text,text)     acl (none)
--     — because adding a parameter CHANGES the signature, so PostgreSQL creates a second
--     function rather than replacing the first. The live web door posts FIVE **NAMED** args
--     (apps/web/lib/registers/counterparty-doors.ts:89-101) and `clara.wake_fn_allowlist` is
--     keyed by BARE NAME (0011:3903), so a second overload would be both a `42725 function is
--     not unique` hazard at the call site and a silent widening of wake reach. The brief forbids
--     the overload; the probe shows CREATE OR REPLACE cannot avoid one. So this file DROPS the
--     five-argument body and CREATES ONE ten-argument body whose trailing five parameters are
--     DEFAULTED, then re-grants explicitly. The five-named-arg call still resolves (measured on
--     the same rig, and celled at p647.overload.one); the tail asserts exactly one
--     `regprocedure` and the exact ACL, because a DROP is the one edit that can silently lose a
--     grant.
--
--     The OTHER two recuts are plain CREATE OR REPLACE at their EXACT existing signatures —
--     `clara.rename_counterparty(uuid,uuid,text,text)` and
--     `clara.set_counterparty_identifiers(uuid,uuid,text,text,text)` — so their ACLs are
--     preserved by construction and the two live signature pins that name them
--     (packages/db/tests/name-only-guard.test.mjs:241, web-reads-and-doors.test.mjs:46) stay
--     green. Neither gains a parameter: a correction's BASIS is synthesised from the act's own
--     before/after values, and the human's typed reason rides `add_counterparty_alias`'s new
--     `p_basis` onto the alias row it qualifies.
--
-- (5) THREE OF THE FIVE ACTS ARE RECORDED BY **TRIGGERS**, NOT BY RECUTS. DECISIONS §1.3 forbids
--     recutting `clara.merge_counterparties` (whose live body is a SPLICE — 0149:436-536
--     re-substitutes from its own `pg_get_functiondef`, and that proof cannot be re-run to check
--     a further recut) and this file does not recut `clara.retire_counterparty_alias` or
--     `clara.tick_seeding_proposal` either. So:
--       · alias_added   — AFTER INSERT on clara.counterparty_aliases (every lane, including the
--                         two declared-residue writers)
--       · alias_retired — AFTER UPDATE on clara.counterparty_aliases, on the retired_at
--                         null -> not-null transition ONLY
--       · merged        — AFTER INSERT on clara.counterparty_merges, appended to the ABSORBED
--                         party, whose identity is the one that changed
--     A lane-agnostic trigger covers writers a recut could not reach, which is strictly more
--     honest than three recut bodies. `rename` and `identifiers_set` are appended IN-BODY,
--     because only the body holds the before-image.
--
-- DECLARED RESIDUE, stated here and in the ticket evidence rather than implied by absence:
--   · `clara.merge_counterparties` (0015:2295) and `clara.tick_seeding_proposal` (0118:315)
--     are NOT recut. Their alias inserts take the `recorded_via='legacy_unknown'` default.
--     Both still produce a revision, via the triggers above.
--   · The three alias writers' own pre-checks remain KIND-BLIND (0011:1730-1734, :1799-1806) —
--     a residue 0176 named. Celled at p647.h17.kind_blind_prechecks so it is recorded rather
--     than silently inherited.
--   · `origin='agent_proposed'` is admitted by the widened CHECK and reachable from NO door in
--     this slice (D11: Clara gets no write verb here). It is the vocabulary the successor
--     contract in the #647 report will use; the human door refuses it explicitly.
--   · The activity kind ladder still files identity events under 'documents'
--     (0184:2078, :2320). DECISIONS §0 D13: not this wave's, in any ticket.
--
-- WHAT THIS FILE DOES NOT TOUCH, deliberately: `clara._record_journal_entry_core`,
-- `clara._draft_entry_core` / `_approve_entry_core` (position-probed by 0197:638-642),
-- `clara._document_posting_entry` (sha-pinned twice by 0197), `clara._resolve_counterparty`,
-- `clara._canonical_counterparty`, `clara.merge_counterparties`, `clara.list_activity` /
-- `clara.get_activity_event`, `clara._knowledge_capture_core` / `_knowledge_floor` /
-- `capture_knowledge`, `clara.knowledge_keys`, `clara.knowledge_plan_item_map`,
-- `clara.get_knowledge_pack`, `clara.list_client_knowledge`. No `wake_fn_allowlist` row (C-22).
-- No firm-wide identifier unique (C-17). No `clara.unmerge_counterparties` (AC3's prohibition
-- holds by ABSENCE). No EXECUTE for any machine role on anything here.
--
-- LOCKS. §1 ALTERs `clara.counterparty_aliases`, which the agent's alias-matching resolver reads
-- constantly, so `lock_timeout` is bounded ONCE at the top of the file — the 0138/0145 shape
-- (packages/db/README.md, "Put the timeout in the file, not in the ceremony").
-- =====================================================================================

set local lock_timeout = '15s';

-- =====================================================================================
-- 0a. PRESTATE (SUBSTRATE). Every claim this file rests on, re-read from the LIVE catalog at
--     apply time. A derived state is not evidence; what is installed is.
-- =====================================================================================
do $pre$
declare v_def text; v_sha text; v_n integer; v_names text;
begin
  -- (P1) The table and its 0176 shape are present. Matched on the catalog's own rendering.
  select indexdef into v_def from pg_indexes
   where schemaname='clara' and indexname='uq_counterparty_aliases_live_name';
  if v_def is distinct from 'CREATE UNIQUE INDEX uq_counterparty_aliases_live_name ON clara.counterparty_aliases USING btree (client_id, kind, alias_normalized) WHERE (retired_at IS NULL)' then
    raise exception 'identity prestate: uq_counterparty_aliases_live_name is not the 0176 kind-scoped shape (found: %)', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;

  -- (P2) NONE of this file's columns, constraints, triggers, relations or functions exists —
  -- this file is not a re-run, under any spelling of its own names.
  select string_agg(column_name, ', ' order by column_name) into v_names
    from information_schema.columns
   where table_schema='clara' and table_name='counterparty_aliases'
     and column_name in ('recorded_via','recorded_basis','source_document_id',
                         'source_extraction_id','source_region_id','source_field_path');
  if v_names is not null then
    raise exception 'identity prestate: clara.counterparty_aliases already carries {%} -- this file is not a re-run', v_names
      using errcode='CLR10';
  end if;
  if to_regclass('clara.counterparty_identity_revisions') is not null then
    raise exception 'identity prestate: clara.counterparty_identity_revisions already exists'
      using errcode='CLR10';
  end if;
  if to_regproc('clara.get_counterparty_identity') is not null
     or to_regproc('clara.list_counterparty_identity') is not null
     or to_regproc('clara.list_counterparty_merge_corrections') is not null
     or to_regproc('clara._append_counterparty_identity_revision') is not null then
    raise exception 'identity prestate: one of this file''s read/helper names is already taken'
      using errcode='CLR10';
  end if;

  -- (P3) The origin CHECK is the bare three-value 0011 one this file widens.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.counterparty_aliases'::regclass and conname='counterparty_aliases_origin_check';
  if v_def is distinct from 'CHECK ((origin = ANY (ARRAY[''former_name''::text, ''trade_name''::text, ''human''::text])))' then
    raise exception 'identity prestate: counterparty_aliases_origin_check is not the pinned 0011 three-value CHECK (found: %) -- re-derive the widening before applying', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;

  -- (P4) The immutability trigger this file DISABLES for the backfill exists and is ENABLED
  -- right now, so the re-enable in the tail restores a MEASURED state rather than a guess
  -- (the 0176:140-143 shape).
  select count(*) into v_n from pg_trigger
   where tgrelid='clara.counterparty_aliases'::regclass and tgname='t_counterparty_aliases_update'
     and tgenabled='O';
  if v_n <> 1 then
    raise exception 'identity prestate: t_counterparty_aliases_update is not present-and-enabled (% found) -- the backfill''s disable/re-enable pair has nothing to restore', v_n
      using errcode='CLR10';
  end if;

  -- (P5) THE THREE BODIES THIS FILE RECUTS, PINNED BY PRE-IMAGE sha256(prosrc). MEASURED on
  -- THIS migrated rig (0001->0198), never transcribed from a creating file: several live bodies
  -- in this estate are splices. A recut derived from a body that has since DRIFTED would delete
  -- an arm nobody re-derived.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.add_counterparty_alias(uuid,uuid,text,text,text)'::regprocedure;
  if v_sha <> '89956fc3faf4132ab8db233866670ea8e1300e4d2a73f9e1300e3fedf1b30dbf' then
    raise exception '#647 prestate: clara.add_counterparty_alias has DRIFTED from the pinned 0011 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.rename_counterparty(uuid,uuid,text,text)'::regprocedure;
  if v_sha <> 'be3c49cc8efbb6ea48921fd66684cf6ac52b1922f321b504cb47d099c23f34e3' then
    raise exception '#647 prestate: clara.rename_counterparty has DRIFTED from the pinned 0011 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.set_counterparty_identifiers(uuid,uuid,text,text,text)'::regprocedure;
  if v_sha <> 'd9cfad05e97d73ae96adfafccc1a8a3b38fcc785a2315449a09a86d8eca4db59' then
    raise exception '#647 prestate: clara.set_counterparty_identifiers has DRIFTED from the pinned 0174 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- (P6) THE TWO DECLARED-RESIDUE WRITERS, pinned too — not because this file recuts them, but
  -- because the residue statement in the header and in the ticket evidence is a claim about
  -- THESE EXACT BODIES. A residue nobody pinned is a rumour.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_sha <> '840180a8c22a4d43c2ed9b69c0907c568368201a0b348bb9415b66a1d46546c2' then
    raise exception '#647 prestate: clara.merge_counterparties is not the pinned 0149 SPLICED body (sha %) -- the residue claim in this file''s header was made against that text', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.tick_seeding_proposal(uuid,text)'::regprocedure;
  if v_sha <> '17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b' then
    raise exception '#647 prestate: clara.tick_seeding_proposal is not the pinned 0118 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- (P7) THE VIEW THIS FILE WIDENS IS THE 0145 SIX-COLUMN MASKED READ, and it is a
  -- security_barrier. Read off pg_get_viewdef and pg_class.reloptions, not off 0145's text.
  select pg_get_viewdef('clara.counterparty_aliases_visible'::regclass, true) into v_def;
  if v_def is null or position('clara.jwt_firm()' in v_def) = 0 then
    raise exception 'identity prestate: counterparty_aliases_visible is absent or no longer firm-predicated (found: %)', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_def
    from information_schema.columns
   where table_schema='clara' and table_name='counterparty_aliases_visible';
  if v_def is distinct from 'id,counterparty_id,alias_display,alias_normalized,created_at,retired_at' then
    raise exception 'identity prestate: counterparty_aliases_visible is not 0145''s six-column projection (found: %) -- the widening below is written against that exact list', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_class where oid='clara.counterparty_aliases_visible'::regclass
                  and 'security_barrier=true' = any(coalesce(reloptions,'{}'::text[]))) then
    raise exception 'identity prestate: counterparty_aliases_visible has lost security_barrier -- debt-BAR1 requires it'
      using errcode='CLR10';
  end if;

  -- (P8) THE BASE TABLE IS STILL FN-FRONTED. clara.counterparty_aliases is the FIRST member of
  -- wave-a-shape.test.mjs's WA_NEW_TABLES family, whose whole point is zero direct DML/SELECT to
  -- any application role. Widening the VIEW must not become a widening of the TABLE.
  select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
    into v_names
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='counterparty_aliases'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive');
  if v_names is not null then
    raise exception 'identity prestate: clara.counterparty_aliases already carries application-role grants {%} -- the fn-fronted family invariant is already broken and this file must not build on it', v_names
      using errcode='CLR10';
  end if;

  -- (P9) The four event names are free, and the active taxonomy exists to route them into.
  select string_agg(name, ', ' order by name) into v_names from clara.event_types
   where name in ('counterparty.renamed','counterparty.alias_added','counterparty.alias_retired',
                  'counterparty.identifiers_set');
  if v_names is not null then
    raise exception 'identity prestate: event type(s) {%} already registered', v_names using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.taxonomy_active;
  if v_n <> 1 then
    raise exception 'identity prestate: clara.taxonomy_active does not name exactly one version (% found)', v_n
      using errcode='CLR10';
  end if;

  raise notice 'identity prestate (substrate) OK: the 0176 kind-scoped alias unique is the pinned shape; none of this file''s columns/objects exists; the origin CHECK is the bare 0011 three-value one; t_counterparty_aliases_update is present and enabled; five live bodies match their measured pre-image shas; counterparty_aliases_visible is the 0145 six-column security_barrier read; the base table carries no application-role grant; the four event names are free at taxonomy version %.',
    (select version from clara.taxonomy_active);
end
$pre$;

-- =====================================================================================
-- 0b. PRESTATE (PRIVILEGE) -- A SEPARATE `do` BLOCK, AND THE SEPARATION IS LOAD-BEARING (0176's
--     own reason, 0046:2721-2731's before it): the wiki-authority gate classifies a `do` block
--     mentioning BOTH catalog-definition reads and the bare token `execute` as a change-of-record
--     patch and scans its literals as a persistent surface. Splitting costs nothing.
-- =====================================================================================
do $pre_acl$
declare r record;
begin
  if not has_function_privilege('clara_authenticated',
       'clara.add_counterparty_alias(uuid,uuid,text,text,text)'::regprocedure, 'execute') then
    raise exception 'identity prestate: clara_authenticated cannot EXECUTE add_counterparty_alias today -- the DROP/CREATE below is written to RESTORE exactly this grant'
      using errcode='CLR10';
  end if;
  for r in select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                              'clara_wake_proactive','clara_freeform_ro']) as role
  loop
    if has_function_privilege(r.role,
         'clara.add_counterparty_alias(uuid,uuid,text,text,text)'::regprocedure, 'execute') then
      raise exception 'identity prestate: % already holds EXECUTE on add_counterparty_alias -- D11 says no machine lane writes an identity, so the post-state this file restores would be wrong', r.role
        using errcode='CLR10';
    end if;
  end loop;
  raise notice 'identity prestate (privilege) OK: add_counterparty_alias is executable by clara_authenticated and by no machine role -- the exact post-state the DROP/CREATE restores.';
end
$pre_acl$;

set role clara_fn_owner;

-- =====================================================================================
-- 1. PROVENANCE ON THE ALIAS.
--
--    The columns land NULLABLE, are BACKFILLED with the trigger disabled, and only then become
--    NOT NULL with their default — the 0176:255-268 shape, and for the same reason:
--    `t_counterparty_aliases_update` refuses ANY update that changes a column other than
--    retired_at (0011:962-976, errcode CLR08), so the backfill is genuinely impossible with it
--    on. The disable/enable pair sits inside the runner's own per-migration transaction, so a
--    failure anywhere below rolls the disable back with everything else; the tail ASSERTS the
--    re-enable rather than trusting these three lines.
-- =====================================================================================
alter table clara.counterparty_aliases add column recorded_via         text;
alter table clara.counterparty_aliases add column recorded_basis       text;
alter table clara.counterparty_aliases add column source_document_id   uuid;
alter table clara.counterparty_aliases add column source_extraction_id uuid;
alter table clara.counterparty_aliases add column source_region_id     uuid;
alter table clara.counterparty_aliases add column source_field_path    text;

alter table clara.counterparty_aliases disable trigger t_counterparty_aliases_update;
update clara.counterparty_aliases set recorded_via = 'legacy_unknown' where recorded_via is null;
alter table clara.counterparty_aliases enable trigger t_counterparty_aliases_update;

alter table clara.counterparty_aliases alter column recorded_via set not null;
alter table clara.counterparty_aliases alter column recorded_via set default 'legacy_unknown';

alter table clara.counterparty_aliases
  add constraint ck_counterparty_aliases_recorded_via
  check (recorded_via in ('human_ui','agent','seeding','legacy_unknown'));
alter table clara.counterparty_aliases
  add constraint ck_counterparty_aliases_basis
  check (recorded_basis is null or btrim(recorded_basis) <> '');
alter table clara.counterparty_aliases
  add constraint ck_counterparty_aliases_field_path
  check (source_field_path is null or btrim(source_field_path) <> '');

-- THE WIDENED ORIGIN VOCABULARY. 'extracted' is what a name read off a document is; a stated
-- name is 'human'; 'agent_proposed' is reachable from NO door in this slice and is declared here
-- so the successor contract has a value to write rather than a migration to wait for.
alter table clara.counterparty_aliases drop constraint counterparty_aliases_origin_check;
alter table clara.counterparty_aliases
  add constraint counterparty_aliases_origin_check
  check (origin in ('former_name','trade_name','human','extracted','agent_proposed'));

-- THE SOURCE PINS, as COMPOSITE FIRM-CONGRUENT foreign keys (the 0192:489-497 idiom): the (row,
-- firm) pair is ONE fact, so a source from another tenant cannot be pinned at all. CLIENT
-- congruence is NOT expressible here — `clara.documents` carries no client_id; attribution lives
-- in `clara.document_filings` and #646 MOVES it — so it is the DOOR's job, written rather than
-- inherited (§7's `source_not_this_client`).
alter table clara.counterparty_aliases add constraint fk_counterparty_aliases_source_document
  foreign key (source_document_id, firm_id) references clara.documents (id, firm_id);
-- …and the two DEEPER pins ride the TRIPLE-KEY house pattern (0149:361-372, the same shape this
-- file uses on the revision relation's own counterparty/alias keys) rather than the (id, firm_id)
-- pair: `uq_document_extractions_id_firm_document` and `uq_document_regions_id_firm_extraction`
-- already exist for exactly this, so the trio is made to HANG TOGETHER structurally — an
-- extraction must be an extraction OF the pinned document and a region a region OF the pinned
-- extraction. With the pair FKs alone an alias could name THIS client's document while its
-- extraction and region belonged to a SIBLING CLIENT's page, and `get_counterparty_identity`
-- would render that mixture as provenance. MATCH SIMPLE keeps the unpinned row free: a NULL in
-- any column satisfies the constraint, and the CHECKs below are what make `source_extraction_id`
-- non-null imply `source_document_id` non-null.
alter table clara.counterparty_aliases add constraint fk_counterparty_aliases_source_extraction
  foreign key (source_extraction_id, firm_id, source_document_id)
  references clara.document_extractions (id, firm_id, document_id);
alter table clara.counterparty_aliases add constraint fk_counterparty_aliases_source_region
  foreign key (source_region_id, firm_id, source_extraction_id)
  references clara.document_regions (id, firm_id, extraction_id);

-- TWO-WAY, the 0192:455-470 reading: an extraction pin RIDES an 'extracted' origin and nothing
-- else (a stray extraction id on a human statement is provenance theatre), an 'extracted' origin
-- OWES its document and extraction, and each deeper pin needs the one above it.
alter table clara.counterparty_aliases add constraint ck_counterparty_aliases_extraction_pins
  check ((origin = 'extracted')
      or (source_extraction_id is null and source_region_id is null and source_field_path is null));
alter table clara.counterparty_aliases add constraint ck_counterparty_aliases_extraction_required
  check (origin <> 'extracted'
      or (source_document_id is not null and source_extraction_id is not null));
alter table clara.counterparty_aliases add constraint ck_counterparty_aliases_region_needs_extraction
  check (source_region_id is null or source_extraction_id is not null);
alter table clara.counterparty_aliases add constraint ck_counterparty_aliases_field_needs_extraction
  check (source_field_path is null or source_extraction_id is not null);

comment on column clara.counterparty_aliases.recorded_via is
  '#647 D11: WHICH LANE wrote this alias -- human_ui | agent | seeding | legacy_unknown. NOT NULL
   with the legacy_unknown default, so an omitted lane is a RECORDED unknown rather than an
   invisible one and clara.tick_seeding_proposal''s direct insert (0118:315) keeps working.
   t_counterparty_aliases_recorded_via refuses the value ''human_ui'' when clara.jwt_sub() is
   null, so a machine lane cannot claim a human wrote it.';
comment on column clara.counterparty_aliases.recorded_basis is
  '#647: the HUMAN''S OWN WORDS for why this alias exists, supplied through
   clara.add_counterparty_alias''s p_basis. Null where nobody stated one; the revision log then
   synthesises a structural basis from the row itself rather than inventing a reason.';
comment on column clara.counterparty_aliases.source_document_id is
  '#647 AC1: the document this name was read off. Firm-congruent by composite FK; CLIENT
   congruence is checked in clara.add_counterparty_alias, because clara.documents carries no
   client_id and #646 re-attributes filings between clients.';

-- =====================================================================================
-- 2. THE HONESTY TRIGGER. The column is what a writer CLAIMS; this is what the estate CHECKS.
--    clara._human_ctx already makes it impossible for a machine lane to reach a human DOOR
--    (it demands clara.jwt_sub()), but the reverse was not structural: a direct insert could
--    claim 'human_ui' from any lane. It sorts AFTER t_counterparty_aliases_kind_derive, which
--    is deliberate and harmless -- the two read disjoint columns.
-- =====================================================================================
create function clara._tf_counterparty_alias_recorded_via() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $fn$
begin
  if new.recorded_via = 'human_ui' and clara.jwt_sub() is null then
    raise exception 'an alias may not claim recorded_via=''human_ui'' with no authenticated actor'
      using errcode='CLR08', detail='{"reason":"recorded_via_not_human"}';
  end if;
  return new;
end $fn$;
-- THE REVOKE IS NOT DECORATION (0176 §5's measured lesson): through the migration runner a
-- function lands with a NULL proacl, which IS PUBLIC, on a SECURITY DEFINER body. ALTER DEFAULT
-- PRIVILEGES is an empirical no-op here. The tail reads the object.
revoke all on function clara._tf_counterparty_alias_recorded_via() from public;

create trigger t_counterparty_aliases_recorded_via
  before insert on clara.counterparty_aliases
  for each row execute function clara._tf_counterparty_alias_recorded_via();

-- =====================================================================================
-- 3. ONE APPEND-ONLY REVISION LOG, CARRYING ALL FIVE IDENTITY ACTS.
--
--    NOT an identifier log. A professional correcting an identity wants ONE timeline: the name
--    changed, an alias was added, an alias was retired, the registration moved, the party was
--    absorbed. Five relations would be five half-answers.
--
--    ITS POLICY PAIR IS clara.counterparty_merges' (0149:425-431), NEVER clara.counterparties'.
--    counterparty_aliases is the first member of wave-a-shape's fn-fronted family and the first
--    cut of 裁-11 got this exact choice wrong by copying the wrong sibling. The merge carrier is
--    the right precedent: a real SELECT grant, because "who changed this identity, when and why"
--    is precisely the fact a professional needs, and ZERO app-role DML, because the only lawful
--    writer is a DEFINER body.
-- =====================================================================================
create table clara.counterparty_identity_revisions (
  id                   uuid        primary key default gen_random_uuid(),

  -- TENANCY. firm_id is the RLS dimension; client_id scopes it, and an identity never crosses
  -- clients (every counterparty door refuses cross_client outright).
  firm_id              uuid        not null,
  client_id            uuid        not null,
  counterparty_id      uuid        not null,

  -- THE ACT, and its position in this counterparty's own history.
  revision_n           integer     not null check (revision_n > 0),
  act                  text        not null check (act in
                         ('rename','alias_added','alias_retired','identifiers_set','merged')),

  -- WHAT IT CHANGED. Objects, never scalars: a rename and an identifier correction do not carry
  -- the same fields, and a per-act column set would be five nullable groups nobody can read.
  before_state         jsonb       not null default '{}'::jsonb
                         check (jsonb_typeof(before_state) = 'object'),
  after_state          jsonb       not null default '{}'::jsonb
                         check (jsonb_typeof(after_state) = 'object'),

  -- WHO / BASIS / WHEN — the ADR-062 trio 0055 rules and 0192:419-425 restates. A revision
  -- without its basis is refused, never defaulted.
  basis                text        not null check (btrim(basis) <> ''),
  changed_by           uuid        not null references clara.users(id),
  recorded_via         text        not null check (recorded_via in
                         ('human_ui','agent','seeding','legacy_unknown')),
  changed_at           timestamptz not null default now(),

  -- THE ALIAS THIS REVISION IS ABOUT, where it is about one. NULL is a recorded fact
  -- ("this act touched no alias"), which is why the composite FK is MATCH SIMPLE.
  alias_id             uuid,

  -- THE SAME FOUR SOURCE PINS, so a correction can say what it was read off.
  source_document_id   uuid,
  source_extraction_id uuid,
  source_region_id     uuid,
  source_field_path    text        check (source_field_path is null or btrim(source_field_path) <> ''),

  constraint uq_cir_id_firm_client unique (id, firm_id, client_id),
  -- "WHICH REVISION IS NEXT" IS NEVER AMBIGUOUS, and two concurrent corrections cannot silently
  -- become one: THIS KEY is the wall that says so, and the helper below retries against it. It is
  -- deliberately the ONLY wall -- an earlier cut serialised the choice under a
  -- clara.counterparties row lock instead, which inverted the lock order clara.rename_counterparty
  -- itself takes, and deadlocked two shipped human doors (see section 4).
  constraint uq_cir_counterparty_revision unique (counterparty_id, revision_n),

  -- THE TRIPLE-KEY HOUSE PATTERN (0149:361-372) for the ALIAS -- and DELIBERATELY NOT for the
  -- counterparty, which is the one wall in this file that is a writer check rather than a
  -- constraint. The reason is measured, not stylistic: a foreign key check takes FOR KEY SHARE on
  -- the row it points at, so an FK here would make EVERY append -- including the one the
  -- retirement trigger fires while it already holds the alias row -- ask for a lock on
  -- clara.counterparties. clara.rename_counterparty holds that same row FOR UPDATE (and its own
  -- UPDATE of name_normalized takes a key lock, because that column sits in
  -- uq_counterparties_client_unregistered_name) and only THEN inserts its former-name alias, so
  -- the two orders invert and two SHIPPED human doors on one counterparty deadlock. MEASURED on
  -- rig clara_647 (2026-09-17): 6 of 10 rounds raised 40P01, victim context
  -- "while locking tuple in relation counterparties ... FOR KEY SHARE" inside this very insert,
  -- and clara.merge_counterparties -- which this file may NOT recut -- takes the same
  -- counterparty-then-alias order, so no recut of rename alone would close the class.
  -- The alias key is safe and stays a constraint: every appender either just inserted that alias
  -- row or already holds it locked, so its KEY SHARE is a self-lock and adds no wait edge.
  -- Tenant congruence for the counterparty is asserted instead, lock-free, in the ONE writer
  -- below (clara._append_counterparty_identity_revision, which is ungranted and the only body
  -- that may insert here at all -- no application role holds DML on this relation).
  constraint fk_cir_alias foreign key (alias_id, firm_id, client_id)
    references clara.counterparty_aliases (id, firm_id, client_id),
  constraint fk_cir_source_document foreign key (source_document_id, firm_id)
    references clara.documents (id, firm_id),
  constraint fk_cir_source_extraction foreign key (source_extraction_id, firm_id)
    references clara.document_extractions (id, firm_id),
  constraint fk_cir_source_region foreign key (source_region_id, firm_id)
    references clara.document_regions (id, firm_id),
  constraint ck_cir_region_needs_extraction
    check (source_region_id is null or source_extraction_id is not null),
  constraint ck_cir_field_needs_extraction
    check (source_field_path is null or source_extraction_id is not null)
);

-- The detail read's own access path: one counterparty's timeline, newest first.
create index ix_cir_counterparty on clara.counterparty_identity_revisions
  (counterparty_id, revision_n desc);
-- The list read's: "how much history does this client's identity estate carry".
create index ix_cir_client on clara.counterparty_identity_revisions
  (client_id, changed_at desc);

create function clara._tf_counterparty_identity_revision_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'a counterparty identity revision is never deleted'
      using errcode = 'CLR08', detail = '{"reason":"identity_revision_immutable"}';
  end if;
  raise exception 'clara.counterparty_identity_revisions is append-only: a revision is corrected by appending the next one, never by editing this one'
    using errcode = 'CLR08', detail = '{"reason":"identity_revision_immutable"}';
end $fn$;
revoke all on function clara._tf_counterparty_identity_revision_immutable() from public;

create trigger t_cir_append_only
  before update or delete on clara.counterparty_identity_revisions
  for each row execute function clara._tf_counterparty_identity_revision_immutable();
create trigger t_cir_no_truncate
  before truncate on clara.counterparty_identity_revisions
  for each statement execute function clara._tf_no_truncate();

alter table clara.counterparty_identity_revisions enable row level security;
alter table clara.counterparty_identity_revisions force row level security;
create policy p_cir_owner on clara.counterparty_identity_revisions
  for all to clara_fn_owner using (true) with check (true);
create policy p_cir_human on clara.counterparty_identity_revisions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.counterparty_identity_revisions to clara_authenticated;

comment on table clara.counterparty_identity_revisions is
  '#647 AC5: THE ONE VERSIONED CORRECTION PATH for a counterparty identity. Append-only; carries
   rename, alias_added, alias_retired, identifiers_set and merged, each with its before/after
   objects, its basis, its actor and its lane. SELECT for clara_authenticated inside its own firm
   (the clara.counterparty_merges shape, 0149:425-431); ZERO application-role DML -- the only
   lawful writer is clara._append_counterparty_identity_revision, called from a DEFINER door or a
   DEFINER trigger. No agent policy and no wake grant: D11 gives Clara no identity verb here, so
   she has nothing to read either.';

-- =====================================================================================
-- 4. THE ONE WRITER. Ungranted, DEFINER, and the ONLY place a revision number is chosen.
--
--    IT TAKES NO LOCK OF ITS OWN, AND THAT IS THE POINT. The obvious shape -- lock the
--    counterparty row, then read max(revision_n)+1 -- serialises the choice, but it also hands
--    every writer of clara.counterparty_aliases an alias-row -> counterparty-row lock order,
--    because this helper is reached from an AFTER trigger on that table. clara.rename_counterparty
--    takes the OPPOSITE order (counterparty row first in 7.2 below, then an alias insert), so two
--    SHIPPED human doors on ONE counterparty deadlocked: MEASURED 6 of 10 rounds on rig clara_647
--    (2026-09-17) with that lock and 0 of 10 without it, and the act that died was the human
--    retirement, raised as a bare 40P01 rather than as a governed refusal. Both doors are wired in
--    the browser (the retire dialog renders per live alias on the identity detail; the rename is
--    posted from the hygiene panel), so that was a real journey, not a rig artefact. An advisory
--    lock keyed on the counterparty does NOT fix it -- it rebuilds the same cycle out of a
--    different lock type -- and neither does dropping this body's own `for update` ALONE: a
--    counterparty FOREIGN KEY on the revision relation takes the very same row lock implicitly
--    (FOR KEY SHARE), measured 7 of 10 rounds after the explicit lock was gone, which is why that
--    one key is a lock-free writer check here instead (section 3's note on fk_cir_alias).
--
--    SO THE NUMBER IS CHOSEN OPTIMISTICALLY AND uq_cir_counterparty_revision IS THE WALL. An
--    appender that wins the number first makes this one fail with a unique_violation, caught in
--    its OWN subtransaction and retried against a re-read max(). Five attempts: a retry happens
--    only when another append COMMITTED in between, so the loop is bounded by real contention on
--    ONE counterparty, and exhausting it is reported as a retryable 40001 (the 0059:235 idiom)
--    rather than as a lost correction. The helper still touches no relation other than its own,
--    so it joins no lock ordering constraint (accounting_plans -> accounting_work -> agent_tasks
--    -> agent_interruptions is untouched here). Cells of record: p647.revisions.lock_order and
--    p647.revisions.race.
-- =====================================================================================
create function clara._append_counterparty_identity_revision(
    p_firm uuid, p_client uuid, p_counterparty uuid, p_act text,
    p_before jsonb, p_after jsonb, p_basis text, p_changed_by uuid, p_recorded_via text,
    p_alias uuid default null,
    p_source_document uuid default null, p_source_extraction uuid default null,
    p_source_region uuid default null, p_source_field_path text default null)
  returns integer
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_n integer;
begin
  -- TENANT CONGRUENCE, ASSERTED RATHER THAN INHERITED (see the note on fk_cir_alias above): a
  -- plain SELECT takes no row lock at all, so this wall costs the estate nothing in lock order
  -- while saying exactly what the dropped foreign key would have said.
  if not exists (select 1 from clara.counterparties cp
                  where cp.id = p_counterparty and cp.firm_id = p_firm and cp.client_id = p_client) then
    raise exception 'a counterparty identity revision must name a counterparty of its own firm and client'
      using errcode = 'CLR10', detail = '{"reason":"identity_revision_tenant_mismatch"}';
  end if;
  for v_attempt in 1..5 loop
    select coalesce(max(r.revision_n), 0) + 1 into v_n
      from clara.counterparty_identity_revisions r where r.counterparty_id = p_counterparty;
    begin
      insert into clara.counterparty_identity_revisions(firm_id, client_id, counterparty_id,
          revision_n, act, before_state, after_state, basis, changed_by, recorded_via, alias_id,
          source_document_id, source_extraction_id, source_region_id, source_field_path)
        values (p_firm, p_client, p_counterparty, v_n, p_act,
          coalesce(p_before,'{}'::jsonb), coalesce(p_after,'{}'::jsonb),
          p_basis, p_changed_by, p_recorded_via, p_alias,
          p_source_document, p_source_extraction, p_source_region, p_source_field_path);
      return v_n;
    exception when unique_violation then
      -- Another correction on THIS counterparty committed that number while this one was
      -- choosing it. Nothing is lost and nothing is guessed: re-read the maximum and take the
      -- next one. A bounded loop rather than an unbounded one, so a defect elsewhere can never
      -- turn this into a spin.
      null;
    end;
  end loop;
  raise exception 'this counterparty is being corrected by several sessions at once and the revision number could not be settled'
    using errcode = '40001',
          detail = '{"reason":"identity_revision_contended","fix":"retry the correction; nothing was written"}';
end $fn$;
revoke all on function clara._append_counterparty_identity_revision(uuid,uuid,uuid,text,jsonb,
  jsonb,text,uuid,text,uuid,uuid,uuid,uuid,text) from public;

-- =====================================================================================
-- 5. THREE LANE-AGNOSTIC TRIGGERS, so the two writers this file may not recut are covered too.
--
--    `clara.merge_counterparties`' live body is a SPLICE (0149:436-536 re-substitutes it from
--    its own pg_get_functiondef and proves the substitution byte-for-byte; that proof cannot be
--    re-run to check a further recut) and DECISIONS §1.3 forbids recutting it.
--    `clara.retire_counterparty_alias` and `clara.tick_seeding_proposal` are outside the brief's
--    three-recut list. A trigger on the ROW each of them writes reaches all of them at once.
-- =====================================================================================
create function clara._tf_counterparty_alias_revision() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_actor uuid; v_via text;
begin
  if tg_op = 'INSERT' then
    perform clara._append_counterparty_identity_revision(
      new.firm_id, new.client_id, new.counterparty_id, 'alias_added',
      '{}'::jsonb,
      jsonb_build_object('alias_id', new.id, 'alias_display', new.alias_display,
        'alias_normalized', new.alias_normalized, 'origin', new.origin, 'kind', new.kind),
      coalesce(new.recorded_basis,
        format('alias recorded: %s (origin %s)', new.alias_display, new.origin)),
      new.created_by, new.recorded_via, new.id,
      new.source_document_id, new.source_extraction_id, new.source_region_id, new.source_field_path);
    perform clara._append_event(new.firm_id, 'counterparty.alias_added', new.client_id,
      new.created_by, null, null, null, new.source_document_id, null,
      jsonb_build_object('counterparty_id', new.counterparty_id, 'alias_id', new.id,
        'alias_display', new.alias_display, 'origin', new.origin,
        'recorded_via', new.recorded_via));
    return new;
  end if;
  -- UPDATE: the ONE lawful one on this table is the retirement stamp (0011:962-976), so this arm
  -- fires on that transition and on nothing else.
  if old.retired_at is null and new.retired_at is not null then
    -- WHO retired it is not on the row -- clara.retire_counterparty_alias stamps only
    -- retired_at -- so the honest answer is the session's own subject, falling back to the
    -- alias's author with the lane recorded as unknown rather than asserted.
    v_actor := coalesce(clara.jwt_sub(), new.created_by);
    v_via := case when clara.jwt_sub() is null then 'legacy_unknown' else 'human_ui' end;
    perform clara._append_counterparty_identity_revision(
      new.firm_id, new.client_id, new.counterparty_id, 'alias_retired',
      jsonb_build_object('alias_id', new.id, 'alias_display', new.alias_display,
        'retired_at', null),
      jsonb_build_object('alias_id', new.id, 'alias_display', new.alias_display,
        'retired_at', new.retired_at),
      format('alias retired: %s', new.alias_display), v_actor, v_via, new.id);
    perform clara._append_event(new.firm_id, 'counterparty.alias_retired', new.client_id,
      v_actor, null, null, null, null, null,
      jsonb_build_object('counterparty_id', new.counterparty_id, 'alias_id', new.id,
        'alias_display', new.alias_display));
  end if;
  return new;
end $fn$;
revoke all on function clara._tf_counterparty_alias_revision() from public;

create trigger t_counterparty_aliases_revision
  after insert or update on clara.counterparty_aliases
  for each row execute function clara._tf_counterparty_alias_revision();

create function clara._tf_counterparty_merge_revision() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_via text;
begin
  -- The revision lands on the ABSORBED party: its identity is the one that changed. The
  -- survivor's own timeline already gains "alias added: <merged name> (former_name)" from the
  -- insert trigger above, and both pages read the lineage itself from clara.counterparty_merges
  -- through clara.get_counterparty_identity.
  v_via := case when clara.jwt_sub() is null then 'legacy_unknown' else 'human_ui' end;
  perform clara._append_counterparty_identity_revision(
    new.firm_id, new.client_id, new.merged_id, 'merged',
    jsonb_build_object('merged_into', null),
    jsonb_build_object('merged_into', new.survivor_id, 'merge_id', new.id,
      'alias_id', new.alias_id),
    format('merged into %s: %s', new.survivor_id, new.reason),
    new.merged_by, v_via, new.alias_id);
  return new;
end $fn$;
revoke all on function clara._tf_counterparty_merge_revision() from public;

create trigger t_counterparty_merges_revision
  after insert on clara.counterparty_merges
  for each row execute function clara._tf_counterparty_merge_revision();

-- =====================================================================================
-- 6. THE FOUR EVENT TYPES + THEIR TAXONOMY ROWS, shipped as ONE coupled pair (the 0149:724-735
--    idiom): clara.event_types' own coverage law requires the ACTIVE taxonomy to route EVERY
--    catalog row, so registering a type without its route would leave the anti-join non-empty
--    for a whole migration.
--
--    ALL FOUR ROUTE `context_update`, deliberately NOT one of the wake-bound decisions.
--    docs/PRD.md:123 records automatic re-evaluation after a correction as 已接受、留待以后 on
--    #658/#663. This file therefore EMITS and builds NO consumer -- an implementation ticket may
--    not re-open a blueprint ruling.
-- =====================================================================================
with inserted as (
  insert into clara.event_types(name, client_scoped, description) values
    ('counterparty.renamed', true,
     'A counterparty was renamed; its uuid is unchanged and its former name became an alias'),
    ('counterparty.alias_added', true,
     'An alias was recorded for a counterparty, with the lane and source that recorded it'),
    ('counterparty.alias_retired', true,
     'A counterparty alias was retired; history is kept and retrieval stops matching it'),
    ('counterparty.identifiers_set', true,
     'A counterparty''s registration number or TIN was recorded or corrected')
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select ta.version, i.name, 'context_update',
       '#647: an identity correction changes what Clara resolves against, so the context pack learns immediately; the re-evaluation CONSUMER is parked on #658/#663 by docs/PRD.md:123'
  from inserted i cross join clara.taxonomy_active ta;

-- =====================================================================================
-- 7. THE THREE WRITER RECUTS.
-- =====================================================================================

-- 7.1 clara.add_counterparty_alias — DROP + CREATE at ONE widened signature (header note (4)).
--     Every rung of the 0011:1706-1748 body is preserved in order; what is ADDED is the origin
--     vocabulary guard, the client-congruence check on the source document, the provenance
--     columns on the insert, and the op_key hash covering the new stored arguments.
drop function clara.add_counterparty_alias(uuid,uuid,text,text,text);

create function clara.add_counterparty_alias(p_client uuid, p_counterparty uuid,
    p_alias text, p_origin text, p_op_key text,
    p_basis text default null,
    p_source_document uuid default null, p_source_extraction uuid default null,
    p_source_region uuid default null, p_source_field_path text default null) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $fn$
declare c record; v_dedupe jsonb; v_norm text; v_id uuid; v_basis text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- THE HUMAN DOOR ADMITS FOUR OF THE FIVE ORIGINS. 'agent_proposed' is refused here rather than
  -- silently accepted: D11 gives Clara no write verb in this slice, and a human door that let a
  -- caller label their own statement as the agent's would defeat the column.
  if p_client is null or p_counterparty is null or p_alias is null
     or nullif(btrim(p_alias),'') is null or p_origin is null
     or p_origin not in ('former_name','trade_name','human','extracted') then
    raise exception 'counterparty alias is malformed' using errcode='CLR10';
  end if;
  v_basis := nullif(btrim(coalesce(p_basis,'')),'');
  -- The pin shape is the table's own CHECK; saying it here first turns a 23514 a human cannot
  -- read into a typed refusal naming the missing half.
  if p_origin='extracted' and (p_source_document is null or p_source_extraction is null) then
    raise exception 'an extracted alias must name the document and the extraction it was read off'
      using errcode='CLR10', detail='{"reason":"source_incomplete"}';
  end if;
  if p_origin<>'extracted' and (p_source_extraction is not null or p_source_region is not null
       or p_source_field_path is not null) then
    raise exception 'only an extracted alias may carry an extraction, region or field pin'
      using errcode='CLR10', detail='{"reason":"source_not_extracted"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'add_counterparty_alias',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'alias',p_alias,'origin',p_origin,'basis',v_basis,'document',p_source_document,
      'extraction',p_source_extraction,'region',p_source_region,'field',p_source_field_path)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_norm:=lower(regexp_replace(p_alias,'[^a-zA-Z0-9]','','g'));
  if v_norm='' then raise exception 'counterparty alias is malformed' using errcode='CLR10'; end if;
  if not exists(select 1 from clara.counterparties cp where cp.id=p_counterparty
      and cp.client_id=p_client and cp.firm_id=c.firm and cp.merged_into is null
      and cp.retired_at is null) then
    raise exception 'counterparty target is retired or not found'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  -- CLIENT CONGRUENCE ON THE SOURCE, and it has to be here. The composite FKs above are
  -- FIRM-congruent only, because clara.documents carries no client_id; attribution is a LIVE
  -- clara.document_filings row, and #646 re-attributes those between clients. Without this check
  -- a re-attribution silently leaves an alias pinned to a sibling client's page.
  if p_source_document is not null
     and not exists(select 1 from clara.document_filings f
                     where f.document_id=p_source_document and f.firm_id=c.firm
                       and f.client_id=p_client and f.retired_at is null) then
    raise exception 'the source document is not filed to this client'
      using errcode='CLR23',detail='{"reason":"source_not_this_client"}';
  end if;
  -- AND THE PIN TRIO HAS TO HANG TOGETHER. The check above asks only whether the DOCUMENT is
  -- filed to this client; the FKs ask only whether each row belongs to this FIRM. Neither asks
  -- whether the extraction is an extraction OF that document, or the region a region OF that
  -- extraction -- so without these two the door would admit this client's document carrying a
  -- SIBLING CLIENT's extraction and region, and the detail would render the mixture as
  -- provenance. The triple-key FKs refuse the same thing structurally; these say it in a sentence
  -- a human can act on rather than as a bare 23503.
  if p_source_extraction is not null
     and not exists(select 1 from clara.document_extractions e
                     where e.id=p_source_extraction and e.firm_id=c.firm
                       and e.document_id=p_source_document) then
    raise exception 'the extraction named is not an extraction of that document'
      using errcode='CLR10',detail='{"reason":"source_extraction_not_of_document"}';
  end if;
  if p_source_region is not null
     and not exists(select 1 from clara.document_regions g
                     where g.id=p_source_region and g.firm_id=c.firm
                       and g.extraction_id=p_source_extraction) then
    raise exception 'the region named is not a region of that extraction'
      using errcode='CLR10',detail='{"reason":"source_region_not_of_extraction"}';
  end if;
  if exists(select 1 from clara.counterparties cp where cp.client_id=p_client
      and cp.name_normalized=v_norm) then
    raise exception 'alias collides with a canonical counterparty name'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end if;
  begin
    insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
        alias_normalized,alias_display,origin,created_by,
        recorded_via,recorded_basis,source_document_id,source_extraction_id,
        source_region_id,source_field_path)
      values(c.firm,p_client,p_counterparty,v_norm,btrim(p_alias),p_origin,c.actor,
        'human_ui',v_basis,p_source_document,p_source_extraction,p_source_region,
        nullif(btrim(coalesce(p_source_field_path,'')),''))
      returning id into v_id;
  exception when unique_violation then
    raise exception 'a live counterparty alias already owns this name'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'add_counterparty_alias',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,'alias',v_id,
      'origin',p_origin,'basis',v_basis,'source_document',p_source_document,'op_key',p_op_key));
  -- The revision AND the domain event are appended by t_counterparty_aliases_revision, so every
  -- lane that writes this table is recorded, not only this door.
  return clara._finish_op(c.firm,'add_counterparty_alias',p_op_key,
    jsonb_build_object('alias_id',v_id,'counterparty_id',p_counterparty));
end $fn$;
revoke all on function clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text) from public;
grant execute on function clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text) to clara_authenticated;
comment on function clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text) is
  '#647 AC1: record an alias WITH ITS PROVENANCE. bookkeeper+. The five leading parameters and
   their names are 0011:1706''s exactly, so the shipped web door''s five-NAMED-argument call
   still resolves; the five trailing ones are DEFAULTED. recorded_via is stamped ''human_ui'' by
   the door from its OWN lane and is never caller-supplied. origin ''agent_proposed'' is refused
   here (D11). A source document must be FILED TO THIS CLIENT (CLR23 source_not_this_client) --
   the composite FK is firm-congruent only and #646 moves filings between clients.';

-- 7.2 clara.rename_counterparty — CREATE OR REPLACE at the EXACT 0011:1774 signature, so the ACL
--     is preserved by construction. Every rung of that body is byte-preserved; what is ADDED is
--     the provenance on the auto-minted former-name alias, the revision append and the event.
create or replace function clara.rename_counterparty(p_client uuid,p_counterparty uuid,
    p_new_name text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $fn$
declare c record; v_dedupe jsonb; cp record; v_norm text; v_changed boolean;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_counterparty is null or p_new_name is null
     or nullif(btrim(p_new_name),'') is null then
    raise exception 'counterparty rename is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'rename_counterparty',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'name',p_new_name)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into cp from clara.counterparties where id=p_counterparty for update;
  if not found or cp.firm_id<>c.firm or cp.client_id<>p_client then
    raise exception 'counterparty not found' using errcode='CLR11';
  end if;
  if cp.merged_into is not null or cp.retired_at is not null then
    raise exception 'counterparty target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  v_norm:=lower(regexp_replace(p_new_name,'[^a-zA-Z0-9]','','g'));
  if v_norm='' then raise exception 'counterparty rename is malformed' using errcode='CLR10'; end if;
  if exists(select 1 from clara.counterparties x where x.client_id=p_client
      and x.id<>p_counterparty and x.name_normalized=v_norm)
     or exists(select 1 from clara.counterparty_aliases a where a.client_id=p_client
      and a.alias_normalized=v_norm and a.retired_at is null
      and a.counterparty_id<>p_counterparty) then
    raise exception 'counterparty name collides with an existing identity'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end if;
  -- A RENAME TO THE NAME IT ALREADY CARRIES IS NOT A CORRECTION. The update below stays
  -- unconditional (0011's own behaviour, and wave-a-aliases.test.mjs drives the repeat case),
  -- but a no-op must not append a revision saying the identity moved when it did not.
  v_changed := cp.name_normalized is distinct from v_norm or cp.name is distinct from btrim(p_new_name);
  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
      alias_normalized,alias_display,origin,created_by,recorded_via,recorded_basis)
    values(c.firm,p_client,p_counterparty,cp.name_normalized,cp.name,
      'former_name',c.actor,'human_ui',
      format('former name kept by a rename to %s', btrim(p_new_name)))
    on conflict do nothing;
  update clara.counterparties set name=btrim(p_new_name),name_normalized=v_norm,
    updated_at=now() where id=p_counterparty;
  if v_changed then
    perform clara._append_counterparty_identity_revision(
      c.firm, p_client, p_counterparty, 'rename',
      jsonb_build_object('name', cp.name, 'name_normalized', cp.name_normalized),
      jsonb_build_object('name', btrim(p_new_name), 'name_normalized', v_norm),
      format('renamed %s to %s', cp.name, btrim(p_new_name)), c.actor, 'human_ui');
    perform clara._append_event(c.firm,'counterparty.renamed',p_client,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',p_counterparty,
        'former_name',cp.name,'name',btrim(p_new_name)));
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'rename_counterparty',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'former_name',cp.name,'new_name',btrim(p_new_name),'op_key',p_op_key));
  return clara._finish_op(c.firm,'rename_counterparty',p_op_key,
    jsonb_build_object('counterparty_id',p_counterparty,'name',btrim(p_new_name)));
end $fn$;
comment on function clara.rename_counterparty(uuid,uuid,text,text) is
  '#647 AC2: rename keeps the uuid, mints the former name as a PROVENANCED former_name alias,
   appends ONE ''rename'' revision and emits counterparty.renamed. bookkeeper+. Signature and
   return envelope unchanged from 0011:1774. A rename to the name already carried updates
   updated_at (0011''s own behaviour) but appends NO revision and emits NO event.';

-- 7.3 clara.set_counterparty_identifiers — CREATE OR REPLACE at the EXACT 0174:785 signature.
--     Two live signature pins name it (packages/db/tests/name-only-guard.test.mjs:241,
--     web-reads-and-doors.test.mjs:46), so the arity is not this file's to move; the correction
--     BASIS is therefore synthesised from the act's own before/after values. Every rung of
--     0174's body is byte-preserved, including its two named unique_violation refusals and its
--     _finish_op envelope.
create or replace function clara.set_counterparty_identifiers(
    p_client uuid, p_counterparty uuid,
    p_registration_no text, p_tin text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $fn$
declare
  c record; v_dedupe jsonb; cp record;
  v_reg text; v_reg_n text; v_tin text; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_counterparty is null then
    raise exception 'counterparty identifiers are malformed' using errcode='CLR10';
  end if;

  -- Normalisation is BYTE-IDENTICAL to create_counterparty's (`0021:99-101`), which is itself
  -- byte-identical to the approve_entry birth path (`0011:3035-3037`). A door that normalised
  -- differently would let a human-set registration and a document-born one live side by side
  -- instead of colliding on the same partial unique.
  v_reg   := nullif(btrim(coalesce(p_registration_no,'')),'');
  v_tin   := nullif(btrim(coalesce(p_tin,'')),'');
  v_reg_n := case when v_reg is null then null
                  else lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
  -- A registration that normalises away entirely is not a registration; admitting it would store
  -- a display value under a NULL key and silently move the row into the unregistered-name index.
  if v_reg is not null and (v_reg_n is null or v_reg_n='') then
    raise exception 'the registration number contains no alphanumeric characters'
      using errcode='CLR10',detail='{"reason":"registration_unusable"}';
  end if;

  v_dedupe:=clara._reserve_op(c.firm,'set_counterparty_identifiers',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'r',v_reg,'t',v_tin)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into cp from clara.counterparties where id=p_counterparty for update;
  if not found or cp.firm_id<>c.firm or cp.client_id<>p_client then
    raise exception 'counterparty not found' using errcode='CLR11';
  end if;
  if cp.merged_into is not null or cp.retired_at is not null then
    raise exception 'counterparty target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;

  begin
    update clara.counterparties
       set registration_no=v_reg, registration_normalized=v_reg_n, tin=v_tin, updated_at=now()
     where id=p_counterparty;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_counterparties_client_registration' then
      raise exception 'another live counterparty of this client and kind already carries that registration number'
        using errcode='CLR23',detail='{"reason":"registration_collision"}';
    elsif v_constraint='uq_counterparties_client_unregistered_name' then
      raise exception 'clearing the registration would collide with an existing unregistered party of the same name and kind'
        using errcode='CLR23',detail='{"reason":"unregistered_name_collision"}';
    end if;
    raise;
  end;

  -- #647 AC1/AC5: the former values stop being forensics-only. A correction that changes nothing
  -- appends nothing -- an unchanged value is not a correction.
  if (cp.registration_no, cp.tin) is distinct from (v_reg, v_tin) then
    perform clara._append_counterparty_identity_revision(
      c.firm, p_client, p_counterparty, 'identifiers_set',
      jsonb_build_object('registration_no', cp.registration_no,
        'registration_normalized', cp.registration_normalized, 'tin', cp.tin),
      jsonb_build_object('registration_no', v_reg,
        'registration_normalized', v_reg_n, 'tin', v_tin),
      format('identifiers corrected: registration %s -> %s, TIN %s -> %s',
        coalesce(cp.registration_no,'(none)'), coalesce(v_reg,'(none)'),
        coalesce(cp.tin,'(none)'), coalesce(v_tin,'(none)')),
      c.actor, 'human_ui');
    perform clara._append_event(c.firm,'counterparty.identifiers_set',p_client,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',p_counterparty,
        'former_registration_no',cp.registration_no,'former_tin',cp.tin,
        'registration_no',v_reg,'tin',v_tin));
  end if;

  perform clara._audit(c.firm,c.actor,null,null,'set_counterparty_identifiers',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'former_registration_no',cp.registration_no,'former_tin',cp.tin,
      'registration_no',v_reg,'tin',v_tin,'op_key',p_op_key));
  return clara._finish_op(c.firm,'set_counterparty_identifiers',p_op_key,
    jsonb_build_object('counterparty_id',p_counterparty,
      'registration_no',v_reg,'registration_normalized',v_reg_n,'tin',v_tin));
end $fn$;
comment on function clara.set_counterparty_identifiers(uuid,uuid,text,text,text) is
  'H-09 + #647 AC5: record or clear the registration number and TIN on an EXISTING counterparty,
   KEEPING HISTORY. Admin floor; signature, op_key hash and _finish_op envelope unchanged from
   0174:785. Each real change appends one ''identifiers_set'' revision carrying both the before
   and the after values and emits counterparty.identifiers_set; an unchanged value appends
   nothing. The two partial uniques still refuse by name and the 0062 name-only guard is still
   left to raise on its own.';

-- =====================================================================================
-- 8. THE HUMAN READS.
--
--    8.1 widens the EXISTING masked view in place -- CREATE OR REPLACE VIEW keeps the
--        security_barrier reloption, the firm predicate and the base-table grants untouched, and
--        (measured by debt-human-read-surfaces.test.mjs:264-271's own predicate) a widened
--        member of the family is not a NEW member of it.
--    8.2-8.4 are SECURITY DEFINER FUNCTIONS floored at viewer, granted to clara_authenticated
--        ONLY. Each pins search_path and plan_cache_mode=force_custom_plan -- the 0183:458 shape:
--        a read whose every predicate binds the session firm and one client id serves the sixth
--        call of a pooled connection from a generic plan without it.
-- =====================================================================================
create or replace view clara.counterparty_aliases_visible with (security_barrier) as
  select ca.id, ca.counterparty_id, ca.alias_display, ca.alias_normalized, ca.created_at,
         ca.retired_at,
         -- #647: the four facts 0145:946-947 deliberately withheld, plus the provenance this
         -- slice adds. The ruling that withheld them was "no more per the ruling" on a table
         -- with no correction surface at all; the surface now exists and cannot show provenance
         -- it cannot read. firm_id stays unprojected (RLS-redundant, and 0145's own reason).
         ca.client_id, ca.kind, ca.origin, ca.recorded_via, ca.created_by, ca.source_document_id
    from clara.counterparty_aliases ca
   where ca.firm_id = clara.jwt_firm();

comment on view clara.counterparty_aliases_visible is
  '裁-11 (0145) + #647: the masked human read of clara.counterparty_aliases, scoped by
   clara.jwt_firm() in the view predicate. WIDENED by 0200 to project client_id, kind, origin,
   recorded_via, created_by and source_document_id, because the identity surface #647 ships
   cannot show provenance it cannot read. firm_id is still unprojected (RLS-redundant). The base
   table gains NO grant -- clara.counterparty_aliases is the first member of wave-a-shape''s
   fn-fronted family and this view is the only widening.';

-- 8.2 — THE DETAIL. One counterparty's whole identity: what it is now, every alias with its
--       provenance, the correction timeline, the merge lineage on both sides, and the conflicts
--       the estate can SEE but deliberately does not resolve (AC4).
create function clara.get_counterparty_identity(p_client uuid, p_counterparty uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare
  ctx record; cp record; v_aliases jsonb; v_revisions jsonb; v_merges jsonb; v_conflicts jsonb;
begin
  ctx := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = ctx.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into cp from clara.counterparties x
   where x.id = p_counterparty and x.client_id = p_client and x.firm_id = ctx.firm;
  if not found then
    raise exception 'counterparty not found' using errcode = 'CLR11';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'alias_display', a.alias_display, 'alias_normalized', a.alias_normalized,
           'kind', a.kind, 'origin', a.origin, 'recorded_via', a.recorded_via,
           'recorded_basis', a.recorded_basis, 'created_by', a.created_by,
           'created_by_name', au.display_name, 'created_at', a.created_at,
           'retired_at', a.retired_at,
           'source', jsonb_build_object('document_id', a.source_document_id,
             'extraction_id', a.source_extraction_id, 'region_id', a.source_region_id,
             'field_path', a.source_field_path))
         order by a.retired_at nulls first, a.created_at desc), '[]'::jsonb)
    into v_aliases
    from clara.counterparty_aliases a
    left join clara.users au on au.id = a.created_by
   where a.counterparty_id = p_counterparty and a.firm_id = ctx.firm;

  select coalesce(jsonb_agg(jsonb_build_object(
           'revision_n', r.revision_n, 'act', r.act, 'before_state', r.before_state,
           'after_state', r.after_state, 'basis', r.basis, 'changed_by', r.changed_by,
           'changed_by_name', ru.display_name, 'recorded_via', r.recorded_via,
           'changed_at', r.changed_at, 'alias_id', r.alias_id,
           'source', jsonb_build_object('document_id', r.source_document_id,
             'extraction_id', r.source_extraction_id, 'region_id', r.source_region_id,
             'field_path', r.source_field_path))
         order by r.revision_n desc), '[]'::jsonb)
    into v_revisions
    from clara.counterparty_identity_revisions r
    left join clara.users ru on ru.id = r.changed_by
   where r.counterparty_id = p_counterparty and r.firm_id = ctx.firm;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'survivor_id', m.survivor_id, 'survivor_name', sv.name,
           'merged_id', m.merged_id, 'merged_name', mg.name, 'reason', m.reason,
           'merged_by', m.merged_by, 'merged_by_name', mu.display_name, 'merged_at', m.merged_at,
           'alias_id', m.alias_id, 'unmerged_at', m.unmerged_at,
           'side', case when m.survivor_id = p_counterparty then 'survivor' else 'merged' end)
         order by m.merged_at desc), '[]'::jsonb)
    into v_merges
    from clara.counterparty_merges m
    left join clara.counterparties sv on sv.id = m.survivor_id
    left join clara.counterparties mg on mg.id = m.merged_id
    left join clara.users mu on mu.id = m.merged_by
   where m.firm_id = ctx.firm and (m.survivor_id = p_counterparty or m.merged_id = p_counterparty);

  -- THE CONFLICTS ARE STATED, NEVER RESOLVED (AC4). Two clients of one firm MAY carry the same
  -- registration or TIN -- uq_client_identifiers_client_kind_value starts at client_id on
  -- purpose (0155:402-414) and clara._resolve_counterparty is client-scoped at every arm -- so
  -- the honest surface names the sibling instead of linking to it. Likewise a vendor and a
  -- customer of one client may share a name: the roles are distinct and the reader is told.
  select coalesce(jsonb_agg(q.c order by q.c->>'kind', q.c->>'other_counterparty_id'), '[]'::jsonb)
    into v_conflicts
    from (
      select jsonb_build_object('kind','cross_client_identifier','identifier_kind','registration',
               'value', cp.registration_no, 'other_client_id', o.client_id,
               'other_client_name', cl.name, 'other_counterparty_id', o.id,
               'other_counterparty_name', o.name, 'other_kind', o.kind) as c
        from clara.counterparties o join clara.clients cl on cl.id = o.client_id
       where o.firm_id = ctx.firm and o.client_id <> p_client
         and o.merged_into is null and o.retired_at is null
         and cp.registration_normalized is not null
         and o.registration_normalized = cp.registration_normalized
      union all
      select jsonb_build_object('kind','cross_client_identifier','identifier_kind','tin',
               'value', cp.tin, 'other_client_id', o.client_id, 'other_client_name', cl.name,
               'other_counterparty_id', o.id, 'other_counterparty_name', o.name,
               'other_kind', o.kind)
        from clara.counterparties o join clara.clients cl on cl.id = o.client_id
       where o.firm_id = ctx.firm and o.client_id <> p_client
         and o.merged_into is null and o.retired_at is null
         and cp.tin is not null and o.tin = cp.tin
      union all
      select jsonb_build_object('kind','cross_kind_same_name',
               'value', cp.name, 'other_client_id', o.client_id, 'other_client_name', cl.name,
               'other_counterparty_id', o.id, 'other_counterparty_name', o.name,
               'other_kind', o.kind)
        from clara.counterparties o join clara.clients cl on cl.id = o.client_id
       where o.firm_id = ctx.firm and o.client_id = p_client and o.kind <> cp.kind
         and o.merged_into is null and o.retired_at is null
         and o.name_normalized = cp.name_normalized
    ) q;

  return jsonb_build_object(
    'client_id', p_client,
    'as_of', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'current', jsonb_build_object(
      'id', cp.id, 'kind', cp.kind, 'name', cp.name, 'name_normalized', cp.name_normalized,
      'registration_no', cp.registration_no, 'registration_normalized', cp.registration_normalized,
      'tin', cp.tin, 'payment_terms_days', cp.payment_terms_days,
      'merged_into', cp.merged_into, 'retired_at', cp.retired_at,
      'canonical_id', clara._canonical_counterparty(p_client, p_counterparty),
      'created_at', cp.created_at, 'updated_at', cp.updated_at),
    'aliases', v_aliases,
    'identifier_revisions', v_revisions,
    'merges', v_merges,
    'conflicts', v_conflicts);
end $read$;
revoke all on function clara.get_counterparty_identity(uuid,uuid) from public;
grant execute on function clara.get_counterparty_identity(uuid,uuid) to clara_authenticated;
comment on function clara.get_counterparty_identity(uuid,uuid) is
  '#647 AC2/AC4/AC5: ONE counterparty''s identity -- current facts, every alias with its lane and
   source, the whole append-only correction timeline, the merge lineage from whichever side this
   party sits on, and the conflicts the estate can SEE but must not resolve (a sibling client
   carrying the same registration or TIN; a counterparty of the other role with the same name).
   viewer+. `identifier_revisions` carries EVERY act, not only identifier ones: there is one
   revision relation, by orchestrator ruling, and the key name is the brief''s.';

-- 8.3 — THE LIST. Every count comes from a read that actually ran (H-34's REDESIGN obligation).
create function clara.list_counterparty_identity(p_client uuid, p_kind text default null) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare ctx record; v_rows jsonb;
begin
  ctx := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = ctx.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_kind is not null and p_kind not in ('vendor','customer') then
    raise exception 'counterparty kind is malformed' using errcode = 'CLR10',
      detail = '{"reason":"kind_unknown"}';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'name', x.name,
           'registration_no', x.registration_no, 'tin', x.tin,
           'merged_into', x.merged_into, 'retired_at', x.retired_at,
           'status', case when x.merged_into is not null then 'merged'
                          when x.retired_at is not null then 'retired' else 'live' end,
           'alias_count', (select count(*) from clara.counterparty_aliases a
                            where a.counterparty_id = x.id),
           'live_alias_count', (select count(*) from clara.counterparty_aliases a
                                 where a.counterparty_id = x.id and a.retired_at is null),
           'revision_count', (select count(*) from clara.counterparty_identity_revisions r
                               where r.counterparty_id = x.id),
           'last_revision_at', (select max(r.changed_at) from clara.counterparty_identity_revisions r
                                 where r.counterparty_id = x.id),
           'merge_count', (select count(*) from clara.counterparty_merges m
                            where m.survivor_id = x.id or m.merged_id = x.id),
           'unsourced_alias_count', (select count(*) from clara.counterparty_aliases a
                                      where a.counterparty_id = x.id and a.retired_at is null
                                        and a.source_document_id is null))
         order by x.name), '[]'::jsonb)
    into v_rows
    from clara.counterparties x
   where x.firm_id = ctx.firm and x.client_id = p_client
     and (p_kind is null or x.kind = p_kind);

  return jsonb_build_object(
    'client_id', p_client,
    'kind', p_kind,
    'as_of', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'counterparties', v_rows);
end $read$;
revoke all on function clara.list_counterparty_identity(uuid,text) from public;
grant execute on function clara.list_counterparty_identity(uuid,text) to clara_authenticated;
comment on function clara.list_counterparty_identity(uuid,text) is
  '#647 AC5/H-34: one client''s counterparty identity estate, optionally narrowed to one role.
   viewer+. Every count is computed HERE from the relations themselves, so a surface can never
   show a number no read produced; a null p_kind means BOTH roles and is a different answer from
   a role that happens to be empty.';

-- 8.4 — AC3's BOUNDED DISCOVERY. It separates a merge that CAN be represented (a
--       clara.counterparty_merges carrier row records what the merge actually did) from a
--       pre-0149 legacy one (clara.counterparties.merged_into set, no carrier). It offers NO
--       reversal: clara.unmerge_counterparties does not exist and this file does not create it.
create function clara.list_counterparty_merge_corrections(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare ctx record; v_rows jsonb;
begin
  ctx := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = ctx.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'merged_id', x.id, 'merged_name', x.name, 'kind', x.kind,
           'survivor_id', coalesce(m.survivor_id, x.merged_into),
           'survivor_name', sv.name,
           'merged_at', m.merged_at, 'merged_by', m.merged_by, 'merged_by_name', mu.display_name,
           'merge_id', m.id, 'merge_reason', m.reason,
           'alias_id', m.alias_id,
           'representable', (m.id is not null),
           'reason', case when m.id is not null then 'carrier_recorded' else 'legacy_no_carrier' end,
           'unmerged_at', m.unmerged_at)
         order by x.name), '[]'::jsonb)
    into v_rows
    from clara.counterparties x
    left join clara.counterparty_merges m
           on m.merged_id = x.id and m.firm_id = ctx.firm and m.unmerged_at is null
    left join clara.counterparties sv on sv.id = coalesce(m.survivor_id, x.merged_into)
    left join clara.users mu on mu.id = m.merged_by
   where x.firm_id = ctx.firm and x.client_id = p_client and x.merged_into is not null;

  return jsonb_build_object(
    'client_id', p_client,
    'as_of', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'merges', v_rows);
end $read$;
revoke all on function clara.list_counterparty_merge_corrections(uuid) from public;
grant execute on function clara.list_counterparty_merge_corrections(uuid) to clara_authenticated;
comment on function clara.list_counterparty_merge_corrections(uuid) is
  '#647 AC3: BOUNDED DISCOVERY, and nothing else. Every merged counterparty of one client, each
   marked representable=true with reason carrier_recorded (clara.counterparty_merges records what
   the merge actually did, so a correction could be described) or representable=false with reason
   legacy_no_carrier (a pre-0149 merge: merged_into is set and nothing records the alias or the
   coding rules it touched). viewer+. There is NO un-merge door and this file creates none --
   AC3''s prohibition holds by absence, and a reversal built beside the discovery that justifies
   it would land untested against the legacy case it cannot serve.';

reset role;

-- =====================================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure; every
-- notice re-READS the live catalog rather than restating what the statements above intended.
-- =====================================================================================
do $tail$
declare
  v_def text; v_n integer; v_names text; r record;
begin
  -- (T1) THE IMMUTABILITY TRIGGER IS BACK ON. This is the one the backfill switched off; a file
  -- that left it disabled would silently retire the append-only wall on the whole table.
  select count(*) into v_n from pg_trigger
   where tgrelid='clara.counterparty_aliases'::regclass and tgname='t_counterparty_aliases_update'
     and tgenabled='O';
  if v_n <> 1 then
    raise exception 'identity tail: t_counterparty_aliases_update is not enabled after the backfill (% found)', v_n;
  end if;

  -- (T2) THE COLUMNS, their nullability and their default, read off the catalog.
  select string_agg(column_name || ':' || is_nullable, ', ' order by column_name) into v_names
    from information_schema.columns
   where table_schema='clara' and table_name='counterparty_aliases'
     and column_name in ('recorded_via','recorded_basis','source_document_id',
                         'source_extraction_id','source_region_id','source_field_path');
  if v_names is distinct from 'recorded_basis:YES, recorded_via:NO, source_document_id:YES, source_extraction_id:YES, source_field_path:YES, source_region_id:YES' then
    raise exception 'identity tail: the provenance columns are not the expected shape (found: %)', coalesce(v_names,'ABSENT');
  end if;
  select column_default into v_def from information_schema.columns
   where table_schema='clara' and table_name='counterparty_aliases' and column_name='recorded_via';
  if v_def is distinct from '''legacy_unknown''::text' then
    raise exception 'identity tail: counterparty_aliases.recorded_via has no legacy_unknown default (found: %) -- clara.tick_seeding_proposal''s direct insert would break', coalesce(v_def,'ABSENT');
  end if;
  select count(*) into v_n from clara.counterparty_aliases where recorded_via is null;
  if v_n <> 0 then
    raise exception 'identity tail: % alias row(s) carry a NULL lane after the backfill', v_n;
  end if;

  -- (T3) THE WIDENED ORIGIN CHECK, read off the catalog's own rendering.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.counterparty_aliases'::regclass and conname='counterparty_aliases_origin_check';
  if v_def is distinct from 'CHECK ((origin = ANY (ARRAY[''former_name''::text, ''trade_name''::text, ''human''::text, ''extracted''::text, ''agent_proposed''::text])))' then
    raise exception 'identity tail: the widened origin CHECK is not the expected shape (found: %)', coalesce(v_def,'ABSENT');
  end if;

  -- (T4) THE FOUR CONSTRAINT WALLS AND THE THREE SOURCE FKs are installed, by name.
  select string_agg(conname, ', ' order by conname) into v_names
    from pg_constraint where conrelid='clara.counterparty_aliases'::regclass
     and conname in ('ck_counterparty_aliases_recorded_via','ck_counterparty_aliases_extraction_pins',
                     'ck_counterparty_aliases_extraction_required',
                     'ck_counterparty_aliases_region_needs_extraction',
                     'ck_counterparty_aliases_field_needs_extraction',
                     'fk_counterparty_aliases_source_document',
                     'fk_counterparty_aliases_source_extraction',
                     'fk_counterparty_aliases_source_region');
  if v_names is null or (select count(*) from regexp_split_to_table(v_names, ', ')) <> 8 then
    raise exception 'identity tail: only {%} of the eight provenance constraints landed', coalesce(v_names,'none');
  end if;

  -- (T5) THE REVISION RELATION: forced RLS, the owner+human policy PAIR, a real SELECT grant and
  -- ZERO DML to any application role. The first cut of 裁-11 broke exactly this by copying
  -- clara.counterparties' shape onto a member of the fn-fronted family.
  if not exists (select 1 from pg_class where oid='clara.counterparty_identity_revisions'::regclass
                  and relrowsecurity and relforcerowsecurity) then
    raise exception 'identity tail: clara.counterparty_identity_revisions does not FORCE row level security';
  end if;
  select string_agg(polname || ':' || polcmd::text, ', ' order by polname) into v_names
    from pg_policy where polrelid='clara.counterparty_identity_revisions'::regclass;
  if v_names is distinct from 'p_cir_human:r, p_cir_owner:*' then
    raise exception 'identity tail: the revision relation''s policy pair is not the clara.counterparty_merges shape (found: %)', coalesce(v_names,'none');
  end if;
  select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
    into v_names
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='counterparty_identity_revisions'
     and grantee <> 'clara_fn_owner';
  if v_names is distinct from 'clara_authenticated:SELECT' then
    raise exception 'identity tail: clara.counterparty_identity_revisions grants {%} -- it must be SELECT to clara_authenticated and nothing else', coalesce(v_names,'none');
  end if;
  select string_agg(tgname, ', ' order by tgname) into v_names
    from pg_trigger where tgrelid='clara.counterparty_identity_revisions'::regclass
     and not tgisinternal and tgenabled='O';
  if v_names is distinct from 't_cir_append_only, t_cir_no_truncate' then
    raise exception 'identity tail: the revision relation''s append-only trigger pair is not installed and enabled (found: %)', coalesce(v_names,'none');
  end if;

  -- (T6) THE THREE LANE-AGNOSTIC TRIGGERS.
  select string_agg(tgname, ', ' order by tgname) into v_names
    from pg_trigger where tgrelid='clara.counterparty_aliases'::regclass
     and not tgisinternal and tgenabled='O';
  if v_names is distinct from 't_counterparty_aliases_kind_derive, t_counterparty_aliases_no_truncate, t_counterparty_aliases_recorded_via, t_counterparty_aliases_revision, t_counterparty_aliases_update' then
    raise exception 'identity tail: clara.counterparty_aliases'' enabled trigger set is not the expected one (found: %)', coalesce(v_names,'none');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='clara.counterparty_merges'::regclass
                  and tgname='t_counterparty_merges_revision' and tgenabled='O') then
    raise exception 'identity tail: the merge revision trigger is absent or disabled -- clara.merge_counterparties is declared residue and this trigger is the only thing that records it';
  end if;

  -- (T7) ADD_COUNTERPARTY_ALIAS IS EXACTLY ONE FUNCTION, AT THE WIDENED SIGNATURE, WITH THE ACL
  -- THE PRESTATE MEASURED. A DROP is the one edit that can silently lose a grant.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='add_counterparty_alias';
  if v_n <> 1 then
    raise exception 'identity tail: % add_counterparty_alias bodies exist -- a second overload makes the web door''s five-named-argument call 42725 function is not unique, and clara.wake_fn_allowlist is keyed by bare name', v_n;
  end if;
  if to_regprocedure('clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)') is null then
    raise exception 'identity tail: add_counterparty_alias is not at the widened ten-argument signature';
  end if;

  -- (T8) THE READS EXIST AS FUNCTIONS, pinned, and this file minted NO new view.
  for r in select unnest(array['clara.get_counterparty_identity(uuid,uuid)',
                              'clara.list_counterparty_identity(uuid,text)',
                              'clara.list_counterparty_merge_corrections(uuid)']) as sig loop
    select count(*) into v_n from pg_proc p
     where p.oid = r.sig::regprocedure and p.prokind='f' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(coalesce(p.proconfig,'{}'::text[]))
       and 'plan_cache_mode=force_custom_plan' = any(coalesce(p.proconfig,'{}'::text[]));
    if v_n <> 1 then
      raise exception 'identity tail: % is not a SECURITY DEFINER function pinning search_path and plan_cache_mode', r.sig;
    end if;
  end loop;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relkind='v' and c.relname like 'counterparty_identity%';
  if v_n <> 0 then
    raise exception 'identity tail: this file minted % new counterparty-identity VIEW(s) -- any new masked human-read view joins debt-BAR1''s catalog-derived roster and reds its closed world', v_n;
  end if;

  -- (T9) THE WIDENED VIEW: twelve columns, security_barrier kept, firm predicate kept,
  -- clara_authenticated ONLY, and the BASE TABLE gained nothing.
  select string_agg(column_name, ',' order by ordinal_position) into v_def
    from information_schema.columns
   where table_schema='clara' and table_name='counterparty_aliases_visible';
  if v_def is distinct from 'id,counterparty_id,alias_display,alias_normalized,created_at,retired_at,client_id,kind,origin,recorded_via,created_by,source_document_id' then
    raise exception 'identity tail: counterparty_aliases_visible does not project the widened list (found: %)', coalesce(v_def,'ABSENT');
  end if;
  if not exists (select 1 from pg_class where oid='clara.counterparty_aliases_visible'::regclass
                  and 'security_barrier=true' = any(coalesce(reloptions,'{}'::text[]))) then
    raise exception 'identity tail: counterparty_aliases_visible lost security_barrier across the CREATE OR REPLACE';
  end if;
  select pg_get_viewdef('clara.counterparty_aliases_visible'::regclass, true) into v_def;
  if position('clara.jwt_firm()' in v_def) = 0 then
    raise exception 'identity tail: counterparty_aliases_visible lost its firm predicate';
  end if;
  select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
    into v_names
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='counterparty_aliases'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive');
  if v_names is not null then
    raise exception 'identity tail: clara.counterparty_aliases itself gained application-role grants {%} -- the VIEW is the only widening', v_names;
  end if;

  -- (T10) THE FOUR EVENT TYPES, client-scoped, routed context_update at the ACTIVE version, and
  -- the estate-wide coverage anti-join still empty.
  select count(*) into v_n from clara.event_types
   where name in ('counterparty.renamed','counterparty.alias_added','counterparty.alias_retired',
                  'counterparty.identifiers_set') and client_scoped;
  if v_n <> 4 then
    raise exception 'identity tail: % of 4 identity event types are registered client-scoped', v_n;
  end if;
  select count(*) into v_n from clara.trigger_taxonomy tt join clara.taxonomy_active ta on ta.version=tt.version
   where tt.event_type in ('counterparty.renamed','counterparty.alias_added',
                           'counterparty.alias_retired','counterparty.identifiers_set')
     and tt.decision='context_update';
  if v_n <> 4 then
    raise exception 'identity tail: % of 4 identity event types route context_update at the ACTIVE taxonomy version', v_n;
  end if;
  select string_agg(et.name, ', ' order by et.name) into v_names from clara.event_types et
   where not exists (select 1 from clara.trigger_taxonomy tt
                      join clara.taxonomy_active ta on ta.version=tt.version
                     where tt.event_type = et.name);
  if v_names is not null then
    raise exception 'identity tail: the active taxonomy no longer routes {%}', v_names;
  end if;

  -- (T11) THE GRANT MATRIX. Every door and read this file created or recut is reachable by
  -- clara_authenticated and by NO machine role; PUBLIC holds EXECUTE on nothing, including the
  -- four DEFINER trigger/helper bodies (0176 §5's measured lesson: through the runner a function
  -- lands with a NULL proacl, which IS PUBLIC).
  for r in select unnest(array[
      'clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)',
      'clara.rename_counterparty(uuid,uuid,text,text)',
      'clara.set_counterparty_identifiers(uuid,uuid,text,text,text)',
      'clara.get_counterparty_identity(uuid,uuid)',
      'clara.list_counterparty_identity(uuid,text)',
      'clara.list_counterparty_merge_corrections(uuid)']) as sig loop
    if not has_function_privilege('clara_authenticated', r.sig::regprocedure, 'execute') then
      raise exception 'identity tail: clara_authenticated cannot EXECUTE % -- the human lane is the only lane and it just lost it', r.sig;
    end if;
  end loop;
  for r in select f.sig, g.role from
      unnest(array[
        'clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)',
        'clara.rename_counterparty(uuid,uuid,text,text)',
        'clara.set_counterparty_identifiers(uuid,uuid,text,text,text)',
        'clara.get_counterparty_identity(uuid,uuid)',
        'clara.list_counterparty_identity(uuid,text)',
        'clara.list_counterparty_merge_corrections(uuid)']) as f(sig)
      cross join unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                              'clara_wake_proactive','clara_freeform_ro']) as g(role) loop
    if has_function_privilege(r.role, r.sig::regprocedure, 'execute') then
      raise exception 'identity tail: % can EXECUTE % -- D11 gives Clara no identity verb in this slice', r.role, r.sig;
    end if;
  end loop;
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('_tf_counterparty_alias_recorded_via','_tf_counterparty_alias_revision',
                       '_tf_counterparty_merge_revision','_append_counterparty_identity_revision',
                       '_tf_counterparty_identity_revision_immutable')
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a
                                       where a.grantee=0 and a.privilege_type='EXECUTE'));
  if v_names is not null then
    raise exception 'identity tail: PUBLIC holds EXECUTE on {%}', v_names;
  end if;

  -- (T12) NO WAKE ALLOWLIST ROW (C-22), and no un-merge door (AC3).
  select count(*) into v_n from clara.wake_fn_allowlist
   where fn_name in ('add_counterparty_alias','rename_counterparty','set_counterparty_identifiers',
                     'get_counterparty_identity','list_counterparty_identity',
                     'list_counterparty_merge_corrections','retire_counterparty_alias');
  if v_n <> 0 then
    raise exception 'identity tail: % wake_fn_allowlist row(s) name an identity verb -- the allowlist is keyed by BARE NAME and this file adds none', v_n;
  end if;
  if to_regproc('clara.unmerge_counterparties') is not null then
    raise exception 'identity tail: clara.unmerge_counterparties exists -- AC3''s prohibition is that it does not';
  end if;

  select count(*) into v_n from clara.counterparty_aliases;
  raise notice 'identity tail: OK -- % alias row(s) all carry a lane (default legacy_unknown, NOT NULL, honesty trigger installed); the origin CHECK admits five values; eight provenance constraints and three source FKs landed (the document pinned firm-congruent, and the extraction and region on TRIPLE keys, so a pin trio that does not hang together is a row this table cannot hold); clara.counterparty_identity_revisions FORCEs RLS with the counterparty_merges owner+human policy pair, SELECT to clara_authenticated alone, zero DML, and its append-only + no-truncate pair enabled; three lane-agnostic revision triggers cover the two declared-residue writers; clara.add_counterparty_alias is EXACTLY ONE body at the widened ten-argument signature with clara_authenticated EXECUTE restored; the three reads are SECURITY DEFINER FUNCTIONS pinning search_path and plan_cache_mode with no new masked view minted; counterparty_aliases_visible projects twelve columns behind its kept security_barrier and firm predicate while the base table gained NOTHING; the four event types route context_update at taxonomy version % with the coverage anti-join empty; no machine role and no PUBLIC grant reaches anything here; no wake_fn_allowlist row and no clara.unmerge_counterparties exists.',
    v_n, (select version from clara.taxonomy_active);
end
$tail$;
