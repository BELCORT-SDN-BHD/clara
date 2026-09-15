-- 0202_document_source_revision — #646: A HUMAN CAN REVISE A DOCUMENT'S TYPED FACTS, THE
-- REVISION RECORDS WHICH SOURCE VERSION THE HUMAN WAS READING, AND AN ORPHANED CLASSIFICATION
-- QUESTION FINALLY HAS A DOOR.
-- =====================================================================================
-- Spec of record: issue #646, its Agent Brief
-- (docs/plan/active/refresh-wave-2026-09-15/brief-646.md) and the wave's binding
-- DECISIONS.md §2 #646. Migration number 0202 is assigned there and nowhere else.
--
-- WHAT THIS FILE ADDS, IN FIVE SENTENCES.
--   1. `clara.document_fact_revisions` — an append-only, FORCE-RLS identity + receipt relation
--      for the TWO source revisions a human can make on a document's own reading: a FACT value
--      and the document KIND. It carries no third kind and no `correction_id`, because nothing
--      in this file ever writes a wrong-client refile row — that identity already lives in
--      `clara.filing_corrections` (0007:310-335) and is joined READ-SIDE by door 3 below.
--   2. `clara.revise_document_fact` — the human fact door. It NEVER updates
--      `clara.document_regions`; it APPENDS a whole new `invoice_facts` extraction under the
--      declarative engine id `clara-fact-human:v1`, exactly the shape `clara.set_document_kind`
--      already uses for `clara-classify-human:v1` (0169:283-291), so the kind-scoped supersede
--      chain (0089), the DEFERRABLE arithmetic belt (0191:932, :1030) and the canonical
--      field-path grammar (0191:554) all fire on their own existing terms.
--   3. `clara.dismiss_orphaned_classification_question` — the narrow door the live
--      `set_document_kind` body names as MISSING in its own prose (0169:236-255). It admits a
--      question only when `origin='classification'`, `status='open'` AND the (document, client)
--      pair carries ZERO live filings. `clara._active_document_filing` (0007:982) is NOT
--      relaxed: `resolve_open_question` and `dismiss_open_question` ride that same predicate
--      (0011:2023-2025, :2058-2060) and relaxing it would quietly widen both.
--   4. Two READS — `clara.list_source_revisions` (the one chronological lineage: this file's
--      revisions LEFT-JOINED read-side to `clara.filing_corrections` and to the retired filings
--      `clara.get_document_state` already projects, 0191:1320-1332) and
--      `clara.list_source_dependents` (a READ-ONLY projection of the knowledge records,
--      open questions and parked Work questions standing on this document). Neither carries a
--      reason or an op key and neither writes a row: reason and idempotency are WRITE-door
--      properties, and no read in this estate carries them.
--   5. ONE minimal recut, `clara.set_document_kind` — SIGNATURE UNCHANGED (#633 mounts this
--      control; a signature change breaks its call site). The body gains the observation stamp
--      AC1 asks for and a `document_fact_revisions` row of kind 'kind'. Every one of 0169's
--      guards, comments and statements is carried verbatim.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO, and why each is a decision rather than an omission.
--
-- IT MINTS NO `clara.accounting_work` ROW (wave decision D6). `clara._admit_accounting_work_core`
-- calls `clara._assert_journal_basis` UNCONDITIONALLY (0194:1152), and that assertion demands a
-- posting date, a memo, MYR, at least two lines, exactly one positive side per line and a strict
-- non-zero balance (0178:693-789). A "correction Work" in that table would therefore have to
-- carry the complete reversing entry AT ADMISSION — which is precisely the work AC4 itself hands
-- to #676 ("Consume accepted source-change/correction Work, then atomically apply complete
-- posted-result changes"). So the accepted SOURCE revision ships here and the POSTED-EFFECT
-- integration ships in #676, stated as two separate rows on the surface rather than one silently
-- half-done thing. `accounting_work_purpose_check` and `operation_receipts_purpose_check` are
-- read in the prestate and re-read byte-identical in the tail: that pair IS the proof this file
-- stays out of the wave's purpose-CHECK contention.
--
-- IT WRITES NOTHING ON `clara.knowledge_records`. `clara._tf_knowledge_records_supersede_only`
-- (0192:521-566, trigger :598) admits EXACTLY ONE update shape — `superseded_by` + `superseded_at`
-- + `state='superseded'` together — so any "re-assessment stamp" would be refused by the estate's
-- strictest immutability belt. The automatic re-assessment engine is accepted-but-deferred by
-- `docs/PRD.md:123` and owned by #658/#663. This file ships the READ a future consumer would ask.
--
-- IT OPENS NO `source_already_posted` ARM. That refusal is raised in FIVE places (0182:713,
-- :1160, :1205; 0194:1219; 0197:360 and its `entry_evidence_links` sibling), and the last two are
-- BEFORE ROW triggers that neither take nor can obtain a purpose argument. Nothing here needs the
-- opening, because nothing here admits Work. `clara._document_posting_entry` is re-pinned at
-- 0197's own sha in BOTH the prestate and the tail, so 0197's promise is re-asserted rather than
-- merely undisturbed.
--
-- THE LOCK ORDER IS UNCHANGED, and that is provable rather than asserted. The declared global
-- order is `accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions`, and it
-- does not name `clara.documents`; 0197:329's `_lock_document_binding` takes `clara.documents`
-- FOR UPDATE from two BEFORE ROW triggers on the journal side. A transaction that BOTH revised a
-- document AND admitted accounting work would introduce a documents<->accounting_work edge the
-- declared order does not cover. NO DOOR IN THIS FILE TOUCHES `clara.accounting_work`,
-- `clara.agent_tasks` or `clara.agent_interruptions` AT ALL — the two writers take
-- `clara.documents` (update) and, for the orphan door, `clara.open_questions` (update), which is
-- the order `set_document_kind` has taken since 0169. The new edge is therefore not introduced,
-- and `packages/db/tests/rig-docs-source-revision.test.mjs` cell p646.horn_a.no_work is the cell
-- that goes RED the day it is.
--
-- WHY A REVISION CARRIES THE WHOLE FACT SET FORWARD. A revision APPENDS an extraction, and
-- `clara._tf_set_authoritative_extraction_0017` (0089:237) supersedes every other done extraction
-- of the SAME engine_kind when the new row wins its (extracted_at, id) comparison. An appended
-- extraction carrying ONE region would therefore make a one-field extraction the document's
-- current facts and silently drop the rest — a data loss wearing a correction's clothes. So
-- `revise_document_fact` copies every region of the observed authoritative facts extraction
-- forward, replacing (or adding) the one at `p_field_path`, and the six-term arithmetic belt
-- re-derives over the NEW numbers rather than the old ones. The superseded extraction's own
-- regions are never touched: that is what makes "the original reading stays readable" true at the
-- row level and not merely in prose.
--
-- D1 WRITE-QUIESCE IS OWED for `clara.set_document_kind`: this file replaces an audited writer's
-- body, and PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it STARTED with.
-- One body, one door, one window — see packages/db/README.md's "Deploy contract".
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- 0 · PRESTATE. Every premise this file rests on, measured before anything moves.
--
-- THE PINS ARE REVIEWED LITERALS, NOT SELF-MEASUREMENTS (0196:155-157: "A literal, not a
-- self-measurement: a prestate that pins whatever it finds proves only that the value did not
-- change WHILE THIS FILE RAN"). All three were read from a clara_646 rig replayed to the 193-file
-- frontier on 2026-09-16, before this file existed:
--
--   select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
--     where p.oid = '<signature>'::regprocedure;
--
--   clara.set_document_kind(uuid,text,text,text)
--     -> 74bb929ec7c38e451e6bc734203499ad03d2dfd46cabae9d3d38187d08b3b4db
--     This is 0169's POST-image, and there is NO literal for it anywhere in the tree: 0169's own
--     prestate pinned the 0123 PRE-image (611bc543..., 0169:100), which is a different body. A
--     transcribed pin would have refused on a correct database, so it was measured.
--   clara._document_posting_entry(uuid,uuid)
--     -> 8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0
--     0197's own literal (0197:221, :634), re-measured and found equal. NON-REGRESSION: this file
--     must not move it, and the tail re-reads it.
--   clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)
--     -> 0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905
--     0191's own post-splice literal (0191:659), re-measured and found equal. NON-REGRESSION.
-- =====================================================================================
create temp table _d646_prestate (k text primary key, v text not null) on commit drop;

do $d646_pre$
declare
  c_set_kind_sha  constant text := '74bb929ec7c38e451e6bc734203499ad03d2dfd46cabae9d3d38187d08b3b4db';
  c_posting_sha   constant text := '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0';
  c_persist_sha   constant text := '0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905';
  c_set_kind_sig  constant text := 'clara.set_document_kind(uuid,text,text,text)';
  c_posting_sig   constant text := 'clara._document_posting_entry(uuid,uuid)';
  c_persist_sig   constant text := 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)';
  v_sha text; v_src text; v_n int; v_aw text; v_or text;
begin
  -- (a) THE BODY THIS FILE RECUTS, BY IDENTITY. Never by name, never by a schema_migrations row.
  if to_regprocedure(c_set_kind_sig) is null then
    raise exception '#646 prestate: % does not resolve by its exact signature', c_set_kind_sig
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = c_set_kind_sig::regprocedure;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha is distinct from c_set_kind_sha then
    raise exception '#646 prestate: % prosrc is % (pinned %) -- this file recuts THAT body and no other. STOP.',
      c_set_kind_sig, v_sha, c_set_kind_sha using errcode = 'CLR10';
  end if;
  -- …and it is still the 0169 body, with every guard 0169 promised to carry. A file that recut a
  -- body missing one of these would be silently dropping a wall while claiming to add a stamp.
  if position('agent identity cannot set a document kind' in v_src) = 0
     or position('consent-evidence classification is owned by the egress consent path' in v_src) = 0
     or position('clara._bank_live_statement_on_document(p_document)' in v_src) = 0
     or position('clara-classify-human:v1' in v_src) = 0
     or position('skipped_kind' in v_src) = 0
     or position('oq.origin=''classification''' in v_src) = 0
     or position('clara._active_document_filing(q.document_id, d.sha256, q.client_id, true)' in v_src) = 0 then
    raise exception '#646 prestate: the live set_document_kind is missing one of the seven guards this file carries verbatim'
      using errcode = 'CLR10';
  end if;
  if position('document_fact_revisions' in v_src) <> 0 then
    raise exception '#646 prestate: set_document_kind already records a source revision -- already applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (b) THE TWO NON-REGRESSION PINS. This file must leave both bodies exactly where it found
  --     them; the tail re-reads both and compares against the SAME literals.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = c_posting_sig::regprocedure;
  if v_sha is distinct from c_posting_sha then
    raise exception '#646 prestate: % prosrc is % (0197 pinned %) -- 0197''s promise is already broken on this chain',
      c_posting_sig, coalesce(v_sha, '(absent)'), c_posting_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = c_persist_sig::regprocedure;
  if v_sha is distinct from c_persist_sha then
    raise exception '#646 prestate: % prosrc is % (0191 pinned %) -- the field-path splice is not the one this file reasons about',
      c_persist_sig, coalesce(v_sha, '(absent)'), c_persist_sha using errcode = 'CLR10';
  end if;

  -- (c) HORN A's OWN PREMISE, stashed so the tail can prove this file did not touch it. The two
  --     purpose CHECKs are the wave's four-way merge hot spot (#646/#652/#653/#639); #646's whole
  --     claim is that it needs NEITHER.
  select pg_get_constraintdef(con.oid) into v_aw from pg_constraint con
   where con.conrelid = 'clara.accounting_work'::regclass and con.conname = 'accounting_work_purpose_check';
  select pg_get_constraintdef(con.oid) into v_or from pg_constraint con
   where con.conrelid = 'clara.operation_receipts'::regclass and con.conname = 'operation_receipts_purpose_check';
  if v_aw is null or v_or is null then
    raise exception '#646 prestate: one of the two purpose CHECKs does not resolve (accounting_work=%, operation_receipts=%)',
      coalesce(v_aw, '(absent)'), coalesce(v_or, '(absent)') using errcode = 'CLR10';
  end if;

  -- (d) THE SURFACES THE NEW DOORS STAND ON. Each is a premise, not a remark: without it the
  --     door below would be closing, validating or reading nothing.
  if to_regprocedure('clara._assert_field_path(text)') is null then
    raise exception '#646 prestate: clara._assert_field_path does not resolve -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.document_fact_validations') is null then
    raise exception '#646 prestate: clara.document_fact_validations is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.filing_corrections') is null or to_regclass('clara.open_questions') is null then
    raise exception '#646 prestate: filing_corrections / open_questions are absent -- 0007 and 0011 must apply first'
      using errcode = 'CLR10';
  end if;
  -- The engine_kind this file writes must ALREADY be admitted. `invoice_facts` joined the CHECK at
  -- 0016:181-182; #646 widens NO vocabulary and mints no new engine_kind.
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.document_extractions'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%''invoice_facts''%';
  if v_n < 1 then
    raise exception '#646 prestate: no CHECK on clara.document_extractions admits engine_kind=''invoice_facts'' -- the human fact revision would have nowhere to land'
      using errcode = 'CLR10';
  end if;
  -- …and the origin the orphan door closes must be admitted too (0016's widening).
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.open_questions'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%''classification''%';
  if v_n < 1 then
    raise exception '#646 prestate: no CHECK on clara.open_questions admits origin=''classification'' -- the orphan door would close a question nothing opens'
      using errcode = 'CLR10';
  end if;

  -- (e) THE RELATION THIS FILE CREATES MUST NOT EXIST.
  if to_regclass('clara.document_fact_revisions') is not null then
    raise exception '#646 prestate: clara.document_fact_revisions already exists -- already applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (f) NO CONTROL WITNESS NAMES THE BODY THIS FILE RECUTS, read from the LIVE registry
  --     (0196:256-260's discipline). If one ever does, this file owes a re-witnessed prosrc_sha
  --     and this check is what says so out loud instead of leaving it to be discovered.
  if to_regclass('clara.control_witnesses') is not null then
    select count(*)::int into v_n from clara.control_witnesses w
     where w.proc = c_set_kind_sig or w.proc like '%set\_document\_kind%';
    if v_n <> 0 then
      raise exception '#646 prestate: % control witness row(s) name clara.set_document_kind -- the recut owes a re-witnessed prosrc_sha in THIS file', v_n
        using errcode = 'CLR10';
    end if;
  end if;

  insert into _d646_prestate(k, v) values
    ('set_kind_sha', c_set_kind_sha),
    ('posting_sha', c_posting_sha),
    ('persist_sha', c_persist_sha),
    ('accounting_work_purpose_check', v_aw),
    ('operation_receipts_purpose_check', v_or);

  raise notice '#646 prestate: clean -- clara.set_document_kind is byte-identical to its 0169 post-image (%), carries all seven guards and references document_fact_revisions nowhere; clara._document_posting_entry and clara.persist_document_extraction are at 0197''s and 0191''s own pinned shas; both purpose CHECKs are stashed for the tail; clara.document_fact_revisions does not exist; no control witness names the recut body.',
    left(c_set_kind_sha, 12);
end $d646_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- 1 · clara.document_fact_revisions — THE SOURCE-REVISION LEDGER.
--
-- TWO KINDS, AND NO THIRD. `revise_document_fact` writes 'fact'; the `set_document_kind` recut
-- writes 'kind'; NOTHING in this file writes a wrong-client refile row, and the tail proves the
-- recut set is exactly one function. A third CHECK value plus the `correction_id` FK it would
-- need would therefore be dead in every row this ticket can produce — and a dead column in an
-- append-only ledger is a claim a future reader cannot check. Wrong-client identity and its
-- receipt stay where they already live, `clara.filing_corrections` (0007:310-335); door 3 joins
-- the two READ-SIDE into one chronological lineage, so nothing is denormalised and nothing is
-- lost.
--
-- WHAT `observed_*` MEAN, stated once so both writers agree. `observed_extraction_id` is
-- `clara.documents.authoritative_extraction_id` AS IT STOOD inside the revising transaction — the
-- source version the human was reading. `observed_version_n` is the document's FACTS VERSION at
-- that same instant: the number of `status='done'` `invoice_facts` extractions it carries. For a
-- 'fact' revision the caller QUOTES that number and the door refuses CLR19 when it has moved; for
-- a 'kind' revision the caller quotes nothing (a classification does not race the facts chain) and
-- the door derives it. Both are answers to one question — "which reading was this decision made
-- against" — which is the whole of AC1's second half.
--
-- `client_id` IS NULLABLE AND DERIVED, never supplied. A document can be live in more than one
-- client of a firm at once (`uq_document_filing_active` is per (document, client)), and it can be
-- live in none. So the column carries the SOLE live filing's client when there is exactly one and
-- NULL otherwise — an honest "this revision is not about one client" rather than a guess. The
-- composite FK is MATCH SIMPLE, so a NULL client satisfies it.
-- =====================================================================================
create table clara.document_fact_revisions (
  id                    uuid        primary key default gen_random_uuid(),
  firm_id               uuid        not null references clara.firms(id),
  client_id             uuid,
  document_id           uuid        not null,
  revision_kind         text        not null check (revision_kind in ('fact', 'kind')),
  field_path            text,
  prior_value           jsonb,
  new_value             jsonb       not null,
  observed_extraction_id uuid,
  observed_version_n    int         not null check (observed_version_n >= 0),
  resulting_extraction_id uuid      not null,
  reason                text        not null check (btrim(reason) <> ''),
  recorded_by           uuid        not null references clara.users(id),
  recorded_at           timestamptz not null default now(),
  op_key                text        not null check (btrim(op_key) <> ''),
  unique (id, firm_id),
  constraint fk_document_fact_revisions_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_document_fact_revisions_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_document_fact_revisions_observed foreign key (observed_extraction_id, firm_id)
    references clara.document_extractions(id, firm_id),
  constraint fk_document_fact_revisions_resulting foreign key (resulting_extraction_id, firm_id)
    references clara.document_extractions(id, firm_id),
  -- A FACT revision names the field it revised; a KIND revision names none. Without this the two
  -- kinds could drift into one another's shape and a reader could not tell a fact row with a lost
  -- path from a kind row.
  constraint ck_document_fact_revisions_field_path check (
    (revision_kind = 'fact') = (field_path is not null))
);

-- ONE REVISION ROW PER (firm, kind, operation identity). This is the STRUCTURAL half of "a
-- duplicate or lost response converges on the accepted revision": `_reserve_op` already collapses
-- a replay of the SAME door, and this index makes a second row impossible even if a future writer
-- forgot to reserve. The `revision_kind` term is in the key on purpose — `set_document_kind` and
-- `revise_document_fact` are different `clara.op_receipts` functions, so one caller may legitimately
-- use one op key for each.
create unique index uq_document_fact_revisions_op
  on clara.document_fact_revisions(firm_id, revision_kind, op_key);
create index ix_document_fact_revisions_document
  on clara.document_fact_revisions(document_id, recorded_at desc, id desc);
create index ix_document_fact_revisions_resulting
  on clara.document_fact_revisions(resulting_extraction_id);

comment on table clara.document_fact_revisions is
  '#646: the append-only identity + receipt for a human SOURCE revision of a document''s own '
  'reading -- a typed fact value (revision_kind=''fact'') or the document kind (''kind''). Written '
  'ONLY by clara.revise_document_fact and clara.set_document_kind, inside their own transactions; '
  'no application role holds DML and the append-only + no-truncate belts refuse every later edit. '
  'Wrong-client refiles are NOT recorded here -- their identity is clara.filing_corrections '
  '(0007:310-335) and clara.list_source_revisions joins the two read-side.';
comment on column clara.document_fact_revisions.observed_extraction_id is
  '#646: clara.documents.authoritative_extraction_id as it stood inside the revising transaction '
  '-- the source version the human was reading. NULL where the document carried no extraction at '
  'all (a kind set on a never-extracted document).';
comment on column clara.document_fact_revisions.observed_version_n is
  '#646: the document''s FACTS version at the revising instant -- the count of status=''done'' '
  'invoice_facts extractions. A ''fact'' revision QUOTES this number (clara.revise_document_fact '
  'refuses CLR19 stale_source_version when it has moved); a ''kind'' revision derives it.';
comment on column clara.document_fact_revisions.client_id is
  '#646: the SOLE live filing''s client, or NULL when the document has zero or more than one. '
  'Derived by the door, never supplied.';

alter table clara.document_fact_revisions enable row level security;
alter table clara.document_fact_revisions force row level security;
create policy p_document_fact_revisions_owner on clara.document_fact_revisions
  for all to clara_fn_owner using (true) with check (true);
create policy p_document_fact_revisions_human on clara.document_fact_revisions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
-- SELECT AND ONLY SELECT, and only for the human lane. The runtime and the agent read role gain
-- NOTHING: which reading a professional decided against is a human judgement record, and a wake
-- credential makes no judgements.
grant select on clara.document_fact_revisions to clara_authenticated;

create trigger t_document_fact_revisions_append_only
  before update or delete on clara.document_fact_revisions
  for each row execute function clara._tf_append_only();
create trigger t_document_fact_revisions_no_truncate
  before truncate on clara.document_fact_revisions
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- 2 · EVENT TAXONOMY. ONE additive triple against the active version (0192 §C's idiom).
--
-- Registered BEFORE the door that emits it: `clara.domain_events.event_type` is an FK onto
-- `clara.event_types`, so a door emitting an unregistered type fails on its FIRST successful call.
--
-- `context_update`, for 0192's own reason: the three WAKE-BOUND decisions each mint a
-- `wake_intents` row that becomes a HELD `clara.agent_tasks` row -- a task nothing in this slice
-- would execute. A revised source changes what a later read must see and has NO consumer in this
-- file (the automatic re-assessment engine is #658/#663, docs/PRD.md:123), so the router advances
-- its checkpoint and mints no intent. Upgrading it later is one additive taxonomy row in the
-- migration that builds the consumer.
--
-- `client_scoped = true`: clara._tf_validate_domain_event only FORBIDS a client_id on a
-- NON-client-scoped type (0005:175-177), so a revision on a document with no single live client
-- passes under the same row with client_id NULL.
--
-- The ORPHAN door mints NO new type: it appends `open_question.resolved` with
-- `status='dismissed'`, verbatim clara.dismiss_open_question's own event (0011:2074-2075), plus a
-- `source` key naming the door -- the same courtesy 0169 added to the resolved event, so a
-- timeline reader can still tell which door closed a question.
--
-- The activity ladder is UNTOUCHED (wave decision D13): `list_activity` files any `document.%`
-- type under the `documents` kind by PREFIX (0181:308, :522), which is where a document fact
-- revision belongs. The ladder's own known misfiling -- firm permission changes filed under
-- documents -- is a named residual of this wave and is not repaired here.
-- =====================================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('document.fact_revised', true,
   'A human revised a typed fact on a document, appending a new declarative extraction',
   'context_update',
   'a revised source changes what a later read must see; #646 builds no consumer (the automatic re-assessment engine is #658/#663), so this advances the checkpoint and mints no intent')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- =====================================================================================
-- 3 · clara._document_source_observation — WHICH READING IS CURRENT, ASKED IN EXACTLY ONE PLACE.
--
-- Both writers stamp the same observation, so it is derived HERE and nowhere else: two transcribed
-- copies would eventually disagree about the same document, which is precisely the failure
-- 0191's "ONE READER, TWO TRIGGERS" note exists to prevent.
--
-- `facts_version` is a COUNT, not a `version_n`. `clara.document_extractions.version_n` is scoped
-- to (document, engine_id) by `unique (document_id, engine_id, version_n)` (0007:196), so the
-- machine's first invoice-facts pass and the first human revision are BOTH version_n 1 — a
-- comparator that could not tell them apart. The count of done `invoice_facts` extractions moves
-- once per accepted revision, whoever wrote it, which is exactly the quantity a stale-version
-- refusal has to compare.
--
-- `facts_extraction_id` is the KIND-CURRENT row (0089's own comparison: the newest done,
-- not-superseded `invoice_facts` extraction by (extracted_at, id)), which is the set of regions a
-- revision must carry forward. `authoritative_extraction_id` is the DOCUMENT-WIDE pointer, which
-- may legitimately be a row of a different kind — the two are different questions and 0089's
-- header says so.
-- =====================================================================================
create function clara._document_source_observation(p_document uuid)
  returns table (authoritative_extraction_id uuid, facts_extraction_id uuid, facts_version int)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
begin
  return query
    select d.authoritative_extraction_id,
      (select e.id from clara.document_extractions e
        where e.document_id = d.id and e.firm_id = d.firm_id
          and e.engine_kind = 'invoice_facts' and e.status = 'done' and e.superseded_by is null
        order by e.extracted_at desc, e.id desc limit 1),
      (select count(*)::int from clara.document_extractions e
        where e.document_id = d.id and e.firm_id = d.firm_id
          and e.engine_kind = 'invoice_facts' and e.status = 'done')
    from clara.documents d where d.id = p_document;
end $fn$;
revoke all on function clara._document_source_observation(uuid) from public;

-- The SOLE live filing's client, or NULL. See the table's `client_id` comment for why "or NULL"
-- is the right answer rather than "the first one".
create function clara._document_sole_live_client(p_document uuid) returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select case when count(*) = 1 then (array_agg(f.client_id))[1] end
    from clara.document_filings f
   where f.document_id = p_document and f.retired_at is null;
$fn$;
revoke all on function clara._document_sole_live_client(uuid) from public;

-- THE CLOSED SET A HUMAN MAY REVISE. It is `clara.persist_invoice_facts`' own allowlist
-- (0026:742-751), re-stated rather than widened: a human revision lands in an `invoice_facts`
-- extraction, so it must be a path that regime can carry. The grammar wall
-- (`clara._assert_field_path`, 0191:554) runs FIRST and refuses anything that is not a canonical
-- path at all; this second, narrower wall then refuses a canonical path from another lane
-- (`statement.*`, `pages.1.lines.0`) landing inside an invoice-facts row where the six-term
-- identity would never measure it.
create function clara._revisable_invoice_field(p_path text) returns boolean
  language sql immutable set search_path = clara, pg_temp as $fn$
  select p_path in ('invoice.total','invoice.amount_due','invoice.currency',
    'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
    'invoice.invoice_date','invoice.deposit',
    'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
    'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
    'invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid');
$fn$;
revoke all on function clara._revisable_invoice_field(text) from public;

-- Which of those paths is MONETARY -- the set `persist_invoice_facts` normalises to cents
-- (0026:765-767). Stated once so the writer below and the arithmetic belt cannot disagree about
-- which values are money.
create function clara._monetary_invoice_field(p_path text) returns boolean
  language sql immutable set search_path = clara, pg_temp as $fn$
  select p_path in ('invoice.total','invoice.amount_due','invoice.deposit',
    'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
    'invoice.service_charge','invoice.discount','invoice.delivery');
$fn$;
revoke all on function clara._monetary_invoice_field(text) from public;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- 4 · clara.revise_document_fact — THE HUMAN FACT DOOR (AC1, AC2).
--
-- WHAT WAS MISSING. `clara.persist_invoice_facts` is granted to `clara_runtime` alone
-- (0009:2916-2924) and 0038:9426 records it as human-unreachable BY DESIGN. The one
-- human-reachable fact verb, `clara.request_reextraction` (0026:994), re-runs the MACHINE: it
-- cannot carry a corrected value, because a human does not have one to give it. So a professional
-- who could SEE that the reader had taken RM1,050.00 for RM1,150.00 had no door at all.
--
-- WHAT THIS DOOR IS, AND WHAT IT IS NOT. It is an APPENDED DECLARATIVE EXTRACTION -- the exact
-- shape clara.set_document_kind already uses for a human classification (0169:283-291), pointed at
-- the facts chain instead of the classify chain. It is NOT an UPDATE of clara.document_regions,
-- and that is the whole design rather than a preference:
--   * the kind-scoped supersede chain (0089) is what makes "the previous reading is still
--     readable" true at the ROW level;
--   * the DEFERRABLE arithmetic belt (0191:932 header-side, :1030 region-side) re-derives the
--     six-term identity at COMMIT over whatever regions are on file, so an in-place edit would
--     leave a recorded verdict measuring numbers that no longer exist -- a false "pass";
--   * the estate's no-in-place-rewrite law applies to a document's reading exactly as it applies
--     to a posted entry.
--
-- THE GUARD ORDER, and the one place it deliberately differs from set_document_kind. Identity ->
-- role floor -> shape -> document lock + firm -> RESERVE -> every value guard. The reserve sits
-- ABOVE the stale-version guard on purpose: a successful revision MOVES the facts version, so a
-- replay of that same call quotes a version that is now stale. If the stale guard ran first, the
-- REPLAY of a committed operation would refuse CLR19 instead of returning its original receipt --
-- which is exactly the "duplicate or lost response" case AC2 says must converge on the accepted
-- revision. Reserve-then-guard makes the replay answer with the receipt, byte-identical.
--
-- WHY THE STALE COMPARISON IS `is distinct from` RATHER THAN `<`. A caller quoting a version
-- ABOVE the live one is not reading this document's facts at all -- a stale client cache from
-- another document, a hand-edited request, a bug. Admitting it because it is "not behind" would
-- record an observation that never existed. Both directions refuse, and `detail` names both
-- numbers so the surface can say which way round it is.
-- =====================================================================================
create function clara.revise_document_fact(p_document uuid, p_field_path text, p_value jsonb,
    p_observed_version int, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  c record; wk record; d record; obs record; r record; prior record;
  v_dedupe jsonb; v_ext uuid; v_version int; v_format text; v_cap jsonb;
  v_raw text; v_cents bigint; v_monetary boolean; v_carried int := 0;
  v_prior_value jsonb; v_new_value jsonb; v_client uuid; v_revision uuid;
  v_locator_kind text; v_locator jsonb; v_found boolean;
begin
  -- THE AGENT WALL, verbatim from clara.set_document_kind (0169:162-165). A revision of what a
  -- document SAYS is a human judgement; a wake credential makes none.
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id = clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot revise a document fact' using errcode = 'CLR03';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_document is null or p_field_path is null
     or p_reason is null or nullif(btrim(p_reason), '') is null then
    raise exception 'a document, a field path and a reason are required' using errcode = 'CLR10',
      detail = '{"reason":"revision_incomplete"}';
  end if;

  -- SERIALISED AGAINST EVERY OTHER WRITER OF THIS DOCUMENT'S READING, on the same row
  -- clara.set_document_kind takes (0169:184). Two concurrent revisions of the same document
  -- therefore queue here rather than racing the facts-version comparison below.
  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id <> c.firm then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'revise_document_fact', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'value', p_value, 'observed_version', p_observed_version, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- 0038's LIVE BANK STATEMENT PIN, the same family as set_document_kind's (0169:199-203): a
  -- statement, its lines and every match on them cite this document's reading. Void the statement
  -- first, then revise.
  if clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before revising its facts'
      using errcode = 'CLR10', detail = '{"reason":"live_bank_statement_present"}';
  end if;

  -- THE GRAMMAR WALL FIRST (0191:554 -- CLR10 with its own detail), then the narrower lane wall.
  -- Order matters: a string that is not a path at all must be refused as a SYNTAX error, while
  -- `statement.closing_balance` is a perfectly canonical path that simply cannot live in an
  -- invoice-facts extraction.
  perform clara._assert_field_path(p_field_path);
  if not clara._revisable_invoice_field(p_field_path) then
    raise exception 'field path % is not one this door can revise', quote_literal(left(p_field_path, 160))
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'field_path_not_revisable',
        'field_path', p_field_path)::text;
  end if;

  -- THE CAPABILITY REGISTRY'S OWN VERDICT (0191:460), asked rather than re-derived. An
  -- unclassified document reads `typed_facts: unsupported` with `kind_known:false`, which is the
  -- honest refusal for "there are no typed facts here to revise yet".
  v_format := clara._document_format(d.mime_type);
  v_cap := clara._document_capability(v_format, d.document_kind);
  if coalesce(v_cap->>'typed_facts', 'unsupported') <> 'supported' then
    raise exception 'typed facts are not supported for this document'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'typed_facts_not_supported',
        'format', v_format, 'document_kind', d.document_kind,
        'typed_facts', v_cap->>'typed_facts')::text;
  end if;

  select * into obs from clara._document_source_observation(p_document);
  if obs.facts_version = 0 or obs.facts_extraction_id is null then
    raise exception 'this document carries no typed facts to revise'
      using errcode = 'CLR10', detail = '{"reason":"no_facts_to_revise"}';
  end if;

  -- THE VALUE, decoded before the staleness comparison so a malformed value is not reported as a
  -- version problem. A jsonb scalar only: an object or an array is not a value a fact region can
  -- carry, and silently stringifying one would store JSON text where a professional expects the
  -- figure they typed.
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception 'a revised fact value must be a JSON string or number'
      using errcode = 'CLR10', detail = '{"reason":"value_not_scalar"}';
  end if;
  v_raw := p_value #>> '{}';
  if nullif(btrim(coalesce(v_raw, '')), '') is null then
    raise exception 'a revised fact value must not be blank -- this door revises a value, it does not remove one'
      using errcode = 'CLR10', detail = '{"reason":"value_blank"}';
  end if;
  v_raw := btrim(v_raw);
  v_monetary := clara._monetary_invoice_field(p_field_path);
  if v_monetary then
    v_cents := clara._normalize_invoice_cents(v_raw);
    -- STRICTER THAN clara.persist_invoice_facts ON `invoice.total`, DELIBERATELY. That writer
    -- admits an unparseable total because an OCR engine legitimately cannot read one and the
    -- fail-closed corroboration path handles it (0026:846-851). A HUMAN typing a total that does
    -- not normalise to cents is a typo, and accepting it would store a fact with no number in the
    -- one field the six-term identity is measured against.
    if v_cents is null then
      raise exception 'a revised monetary value must be readable as cents'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'monetary_value_malformed',
          'field_path', p_field_path, 'attempted_value', v_raw)::text;
    end if;
    -- 0022's (b2) and 0023's (b3) sign conventions, re-stated at this boundary because an
    -- emitter convention is not a control: the identity SUBTRACTS the discount, so a negative one
    -- becomes a plus and a wrong total ties.
    if p_field_path in ('invoice.service_charge','invoice.discount','invoice.delivery',
                        'invoice.total_excl_tax','invoice.tax_total') and v_cents < 0 then
      raise exception 'a stated invoice component must not be negative'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'component_must_not_be_negative',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
  end if;

  -- THE STALE-SOURCE REFUSAL (CLR19), with the attempted value echoed back so the surface can
  -- re-show what the human typed beside what the document now says. AC2: "preserves the attempted
  -- values and converges on the accepted revision".
  if p_observed_version is distinct from obs.facts_version then
    raise exception 'this revision was written against facts version %, the current version is %',
      coalesce(p_observed_version, -1), obs.facts_version
      using errcode = 'CLR19', detail = jsonb_build_object('reason', 'stale_source_version',
        'observed_version', p_observed_version, 'current_version', obs.facts_version,
        'current_extraction_id', obs.facts_extraction_id,
        'field_path', p_field_path, 'attempted_value', v_raw)::text;
  end if;

  -- THE APPENDED EXTRACTION. version_n is scoped to (document, engine_id, engine_kind) exactly as
  -- 0169:291-292 scopes the human classification's, so it counts THIS engine's revisions and
  -- collides with nothing the machine wrote.
  select coalesce(max(version_n), 0) + 1 into v_version from clara.document_extractions
   where document_id = p_document and engine_id = 'clara-fact-human:v1' and engine_kind = 'invoice_facts';

  select * into prior from clara.document_regions rg
   where rg.extraction_id = obs.facts_extraction_id and rg.field_path = p_field_path
   order by rg.created_at, rg.id limit 1;
  v_found := found;
  if v_found then
    v_prior_value := jsonb_strip_nulls(jsonb_build_object(
      'text', prior.text_content, 'cents', prior.monetary_cents));
    -- THE LOCATOR IS CARRIED, not invented: the human is correcting the value read AT THAT PLACE
    -- on the page, so the overlay keeps pointing at the same polygon and UI-17's highlight still
    -- lands where the figure is printed.
    v_locator_kind := prior.locator_kind;
    v_locator := prior.locator;
  else
    v_prior_value := null;
    -- A fact the reader never persisted has no place on the page to point at. An EMPTY polygon is
    -- the honest locator: clara.document_regions.locator is NOT NULL, and the page overlay skips a
    -- region whose polygon is missing or too short rather than drawing a degenerate shape.
    v_locator_kind := 'page_polygon';
    v_locator := jsonb_build_object('page', 1, 'polygon', '[]'::jsonb, 'source', 'human');
  end if;
  v_new_value := jsonb_strip_nulls(jsonb_build_object('text', v_raw, 'cents', v_cents));

  insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
      version_n, status, page_count, envelope)
    values (c.firm, p_document, 'clara-fact-human:v1', 'invoice_facts', v_version, 'done',
      coalesce(d.page_count, 0),
      jsonb_build_object('source', 'human', 'actor', c.actor, 'reason', btrim(p_reason),
        'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
        'revises_extraction_id', obs.facts_extraction_id,
        'observed_version', obs.facts_version, 'op_key', p_op_key))
    returning id into v_ext;

  -- EVERY OTHER FACT CARRIED FORWARD. Without this the appended extraction would supersede the
  -- machine's whole reading with a single field (0089:280-285 supersedes the entire kind), and the
  -- arithmetic belt would then measure a document with no total. Each carried path passes the
  -- canonical grammar on the way in, so a path that predates 0191's splice cannot ride through
  -- this door.
  for r in select rg.* from clara.document_regions rg
            where rg.extraction_id = obs.facts_extraction_id
              and rg.field_path is distinct from p_field_path
            order by rg.created_at, rg.id loop
    perform clara._assert_field_path(r.field_path);
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
        field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
      values (c.firm, v_ext, r.locator_kind, r.locator, r.field_path, r.text_content,
        r.engine_confidence, r.monetary_raw, r.monetary_cents);
    v_carried := v_carried + 1;
  end loop;

  insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
      field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
    values (c.firm, v_ext, v_locator_kind, v_locator, p_field_path, v_raw, 1,
      case when v_monetary then v_raw end, v_cents);

  v_client := clara._document_sole_live_client(p_document);
  insert into clara.document_fact_revisions(firm_id, client_id, document_id, revision_kind,
      field_path, prior_value, new_value, observed_extraction_id, observed_version_n,
      resulting_extraction_id, reason, recorded_by, op_key)
    values (c.firm, v_client, p_document, 'fact', p_field_path, v_prior_value, v_new_value,
      obs.authoritative_extraction_id, obs.facts_version, v_ext, btrim(p_reason), c.actor, p_op_key)
    returning id into v_revision;

  perform clara._audit(c.firm, c.actor, null, null, 'revise_document_fact', null,
    jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'prior_value', v_prior_value, 'new_value', v_new_value,
      'observed_extraction', obs.authoritative_extraction_id,
      'observed_version', obs.facts_version, 'extraction', v_ext, 'revision', v_revision,
      'reason', p_reason, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'document.fact_revised', v_client, c.actor, null, null,
    null, p_document, null,
    jsonb_build_object('revision_id', v_revision, 'field_path', p_field_path,
      'extraction_id', v_ext, 'observed_version', obs.facts_version,
      'facts_version', obs.facts_version + 1, 'source', 'human'));

  return clara._finish_op(c.firm, 'revise_document_fact', p_op_key,
    jsonb_build_object('document_id', p_document, 'revision_id', v_revision,
      'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
      'extraction_id', v_ext, 'observed_extraction_id', obs.authoritative_extraction_id,
      'observed_version', obs.facts_version, 'facts_version', obs.facts_version + 1,
      'carried_regions', v_carried));
end $fn$;

-- =====================================================================================
-- 5 · clara.dismiss_orphaned_classification_question — THE DOOR 0169 NAMES AS MISSING.
--
-- THE DEAD END, IN THE LIVE BODY'S OWN WORDS (0169:236-255): "NO DOOR CAN CLOSE AN ORPHANED
-- CLASSIFICATION QUESTION whose filing was retired. retire_document_filing (0007:1434-1466) never
-- touches clara.open_questions; approve_wrong_client_correction references it nowhere; and
-- resolve_open_question / dismiss_open_question are walled by THIS SAME predicate." The question
-- outlives the filing it was asked about, `clara._open_question_blocks` keeps counting it
-- (0012:88-108), and since 0169 the same predicate also refuses the re-kind.
--
-- THIS DOOR IS THE NARROW ONE, and narrow is the whole point. Relaxing
-- `clara._active_document_filing` would silently relax `resolve_open_question` and
-- `dismiss_open_question` too -- a blast radius far larger than the row that needs closing.
--
-- ITS PREDICATE IS "ZERO LIVE FILINGS", NOT "THE ORIGINAL FILING WAS RETIRED". A document retired
-- from a client and then filed to that client again is NOT orphaned: its classification question
-- has a live subject once more and belongs to `resolve_open_question`'s lane. Drifting from "zero
-- live" to "not the current one" would hand this door questions that are still answerable;
-- packages/db/tests/rig-docs-source-revision.test.mjs cell p646.orphan.narrow is the cell that
-- goes RED the day it does.
--
-- IT DISMISSES, IT NEVER RESOLVES, and that is 0169's own distinction pointed the other way: the
-- human did NOT answer "what kind of document is this?" -- the question simply lost its subject.
-- Recording an answer nobody gave is exactly the defect H-22 existed to remove.
-- =====================================================================================
create function clara.dismiss_orphaned_classification_question(p_question uuid, p_reason text,
    p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; wk record; q record; v_dedupe jsonb; v_live int;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id = clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot dismiss a classification question' using errcode = 'CLR03';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_question is null or p_reason is null or nullif(btrim(p_reason), '') is null then
    raise exception 'dismissal reason is required' using errcode = 'CLR10',
      detail = '{"reason":"dismissal_incomplete"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'dismiss_orphaned_classification_question', p_op_key,
    clara._hash(jsonb_build_object('question', p_question, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- NO EXISTENCE ORACLE: an unknown id and another firm's question answer identically, the shape
  -- clara.dismiss_open_question already uses (0011:2058-2059).
  select * into q from clara.open_questions where id = p_question for update;
  if not found or q.firm_id <> c.firm then
    raise exception 'question not found' using errcode = 'CLR11',
      detail = '{"reason":"question_not_found"}';
  end if;
  if q.origin <> 'classification' then
    raise exception 'this door closes an orphaned classification question only'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'question_not_classification',
        'origin', q.origin)::text;
  end if;
  if q.status <> 'open' then
    raise exception 'question is not open' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'question_not_open', 'status', q.status)::text;
  end if;
  if q.document_id is null then
    raise exception 'a classification question with no document has no filing to be orphaned from'
      using errcode = 'CLR10', detail = '{"reason":"question_has_no_document"}';
  end if;
  select count(*)::int into v_live from clara.document_filings f
   where f.document_id = q.document_id and f.client_id = q.client_id and f.retired_at is null;
  if v_live <> 0 then
    raise exception 'this question still has a live filing -- answer it through resolve_open_question'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'filing_still_live',
        'live_filings', v_live)::text;
  end if;

  update clara.open_questions
     set status = 'dismissed', resolved_by = c.actor, resolved_at = now(),
         resolution_text = btrim(p_reason)
   where id = p_question and status = 'open';

  perform clara._audit(c.firm, c.actor, null, null, 'dismiss_orphaned_classification_question', null,
    jsonb_build_object('question', p_question, 'document', q.document_id, 'client', q.client_id,
      'reason', p_reason, 'op_key', p_op_key));
  -- clara.dismiss_open_question's OWN event, verbatim (0011:2074-2075), plus the `source` key
  -- 0169 added to the resolved half so a timeline can still say WHICH door closed it.
  perform clara._append_event(c.firm, 'open_question.resolved', q.client_id, c.actor, null, null,
    null, q.document_id, null,
    jsonb_build_object('question_id', p_question, 'status', 'dismissed',
      'source', 'dismiss_orphaned_classification_question'));

  return clara._finish_op(c.firm, 'dismiss_orphaned_classification_question', p_op_key,
    jsonb_build_object('question_id', p_question, 'status', 'dismissed',
      'document_id', q.document_id, 'client_id', q.client_id));
end $fn$;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- 6 · clara.list_source_revisions — ONE CHRONOLOGICAL LINEAGE, JOINED READ-SIDE.
--
-- THE POINT OF THE READ-SIDE JOIN. A document's source history has TWO identity relations and
-- always did: `clara.document_fact_revisions` (this file's — what the document SAYS) and
-- `clara.filing_corrections` (0007:310-335 — WHOSE the document is). DECISIONS §2 #646 frames the
-- two as PARALLEL, not unified. Denormalising a refile into the new ledger would mint a row no
-- door in this file writes and no door in 0125 knows about — a second, drifting copy of an
-- identity that already exists. So the lineage is assembled HERE, at read time, and the surface
-- gets one ordered list without any writer ever lying about what it wrote.
--
-- RETIRED FILINGS RIDE THEIR CORRECTION where one exists (`document_filings.correction_id`, the
-- same pair `clara.get_document_state` projects at 0191:1320-1332) and appear as their own entry
-- where it does not — a plain `retire_document_filing` is a real event in this history and folding
-- it into nothing would leave a gap a reader would have to guess at.
--
-- NO REASON, NO OP KEY, NO RECEIPT. A reason is what a WRITER owes for a decision it records and
-- idempotency is what a WRITER owes for an effect it may repeat; a read makes no decision and has
-- no effect. No read in this estate carries either (`clara.get_document_state` 0191:1197,
-- `clara.get_document_for_human_read_v2` 0190:176), and this one does not become the first.
--
-- A DOCUMENT THIS CALLER MAY NOT READ ANSWERS NULL — `get_document_state`'s own posture, and the
-- reason it is right here too: a shaped object with empty arrays would be an existence oracle
-- wearing an empty state's clothes.
-- =====================================================================================
create function clara.list_source_revisions(p_document uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare c record; d record; obs record; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_document is null then return null; end if;
  select * into d from clara.documents where id = p_document and firm_id = c.firm;
  if not found then return null; end if;
  select * into obs from clara._document_source_observation(p_document);

  with revisions as (
    select r.recorded_at as at,
      jsonb_build_object(
        'entry_kind', r.revision_kind,
        'at', r.recorded_at,
        'revision_id', r.id,
        'client_id', r.client_id,
        'field_path', r.field_path,
        'prior_value', r.prior_value,
        'new_value', r.new_value,
        'observed_extraction_id', r.observed_extraction_id,
        'observed_version_n', r.observed_version_n,
        'resulting_extraction_id', r.resulting_extraction_id,
        'reason', r.reason,
        'recorded_by', r.recorded_by) as entry
      from clara.document_fact_revisions r
     where r.document_id = p_document and r.firm_id = c.firm
  ), corrections as (
    select coalesce(fc.completed_at, fc.approved_at, fc.proposed_at) as at,
      jsonb_build_object(
        'entry_kind', 'wrong_client_correction',
        'at', coalesce(fc.completed_at, fc.approved_at, fc.proposed_at),
        'correction_id', fc.id,
        'status', fc.status,
        'from_client', fc.from_client,
        'to_client', fc.to_client,
        'reason', fc.reason,
        'maker', fc.maker,
        'checker', fc.checker,
        'proposed_at', fc.proposed_at,
        'approved_at', fc.approved_at,
        'completed_at', fc.completed_at,
        'retired_filings', coalesce((select jsonb_agg(jsonb_build_object(
              'filing_id', f.id, 'client_id', f.client_id, 'retired_at', f.retired_at,
              'retirement_reason', f.retirement_reason) order by f.retired_at, f.id)
            from clara.document_filings f
           where f.document_id = p_document and f.firm_id = c.firm
             and f.correction_id = fc.id and f.retired_at is not null), '[]'::jsonb)) as entry
      from clara.filing_corrections fc
     where fc.document_id = p_document and fc.firm_id = c.firm
  ), retirements as (
    select f.retired_at as at,
      jsonb_build_object(
        'entry_kind', 'filing_retired',
        'at', f.retired_at,
        'filing_id', f.id,
        'client_id', f.client_id,
        'retirement_reason', f.retirement_reason) as entry
      from clara.document_filings f
     where f.document_id = p_document and f.firm_id = c.firm
       and f.retired_at is not null and f.correction_id is null
  ), merged as (
    select at, entry from revisions
    union all select at, entry from corrections
    union all select at, entry from retirements
  )
  select jsonb_build_object(
    'document_id', p_document,
    'document_kind', d.document_kind,
    'facts_version', obs.facts_version,
    'authoritative_extraction_id', obs.authoritative_extraction_id,
    'current_facts_extraction_id', obs.facts_extraction_id,
    'lineage', coalesce((select jsonb_agg(m.entry order by m.at, m.entry->>'entry_kind') from merged m), '[]'::jsonb))
  into v_result;
  return v_result;
end $fn$;
revoke all on function clara.list_source_revisions(uuid) from public;

-- =====================================================================================
-- 7 · clara.list_source_dependents — A READ-ONLY PROJECTION, AND NOTHING MORE (AC3).
--
-- WHAT IT ANSWERS: "what is standing on this document's reading?" — the knowledge records pinned
-- to one of its extractions (`source_extraction_id` / `source_region_id` are real foreign keys,
-- 0192:495-497), the open questions about it, and the parked Work questions whose Work names it in
-- `source_refs` (0182:496-551).
--
-- IT WRITES NOTHING, AND THAT IS A RULING RATHER THAN A LIMITATION. `docs/PRD.md:123` records
-- automatic re-assessment of experience whose basis was corrected as ACCEPTED BUT DEFERRED, with
-- #658 and #663 named as its owners; the current accepted posture is HUMAN review. And the
-- mechanism a "re-assessment stamp" would need does not exist:
-- `clara._tf_knowledge_records_supersede_only` (0192:521-566) admits exactly one UPDATE shape, so
-- a stamp would fall on its first arm. So #646 ships the READ such a consumer would ask, and
-- `clara.knowledge_records` is not touched by one byte — proven by cell p646.dependents.projection,
-- which re-reads every listed record and asserts `state` and `superseded_by` are unmoved.
--
-- `source_superseded` IS DERIVED, NEVER STORED. A record is standing on a superseded reading when
-- its pinned extraction is itself superseded, or is simply no longer the document's current facts
-- extraction. Both are computed here, from rows this read does not own, so nothing has to be
-- backfilled and nothing goes stale.
-- =====================================================================================
create function clara.list_source_dependents(p_document uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare c record; d record; obs record; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_document is null then return null; end if;
  select * into d from clara.documents where id = p_document and firm_id = c.firm;
  if not found then return null; end if;
  select * into obs from clara._document_source_observation(p_document);

  select jsonb_build_object(
    'document_id', p_document,
    'current_facts_extraction_id', obs.facts_extraction_id,
    'facts_version', obs.facts_version,
    'knowledge_records', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'record_id', k.record_id, 'revision_n', k.revision_n,
        'knowledge_key', k.knowledge_key, 'scope_kind', k.scope_kind, 'client_id', k.client_id,
        'kind', k.kind, 'state', k.state, 'trust', k.trust,
        'source_extraction_id', k.source_extraction_id, 'source_region_id', k.source_region_id,
        'source_field_path', k.source_field_path, 'recorded_at', k.recorded_at,
        'superseded_by', k.superseded_by,
        'source_superseded', (k.source_extraction_id is not null
          and (obs.facts_extraction_id is null or k.source_extraction_id <> obs.facts_extraction_id
               or exists(select 1 from clara.document_extractions e
                          where e.id = k.source_extraction_id and e.superseded_by is not null))))
        order by k.recorded_at, k.id)
      from clara.knowledge_records k
     where k.firm_id = c.firm and k.source_document_id = p_document
       and k.state in ('live', 'withdrawn')), '[]'::jsonb),
    'open_questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'client_id', q.client_id, 'origin', q.origin, 'status', q.status,
        'question_text', q.question_text, 'opened_at', q.opened_at,
        'live_filings', (select count(*)::int from clara.document_filings f
                          where f.document_id = q.document_id and f.client_id = q.client_id
                            and f.retired_at is null),
        'orphaned', (q.origin = 'classification' and q.status = 'open'
          and not exists(select 1 from clara.document_filings f
                          where f.document_id = q.document_id and f.client_id = q.client_id
                            and f.retired_at is null)))
        order by q.opened_at, q.id)
      from clara.open_questions q
     where q.firm_id = c.firm and q.document_id = p_document and q.status = 'open'), '[]'::jsonb),
    'work_questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'work_id', i.work_id, 'client_id', i.client_id,
        'question_version', i.question_version, 'status', i.status,
        'delivery_state', i.delivery_state, 'created_at', i.created_at, 'expires_at', i.expires_at,
        'work_status', w.status)
        order by i.created_at, i.id)
      from clara.agent_interruptions i
      join clara.accounting_work w on w.id = i.work_id
     where i.firm_id = c.firm and i.work_id is not null and i.status = 'pending'
       and exists (select 1 from jsonb_array_elements(coalesce(w.source_refs, '[]'::jsonb)) x
                    where x->>'kind' = 'document' and x->>'document_id' = p_document::text)),
      '[]'::jsonb))
  into v_result;
  return v_result;
end $fn$;
revoke all on function clara.list_source_dependents(uuid) from public;

reset role;

-- =====================================================================================
-- 8 · THE GRANT WALL. All four doors reach clara_authenticated and NOBODY else.
--
-- ZERO clara_runtime, ZERO clara_agent_ro, ZERO wake role, ZERO PUBLIC — asserted in the tail the
-- 0169:333-345 way, name by name and role by role. The reasoning is the same for all four: which
-- reading a set of books rests on is a professional's judgement, and neither a wake credential nor
-- the runtime makes one. The two READS are walled with the writers for the same reason
-- `clara.list_periodic_adjustments` is (0194): a definer read gated on `_human_ctx` and granted to
-- a role that carries no JWT would be a DARK grant — reachable in the catalog, refusing at runtime,
-- and misleading to everyone who reads the ACL.
-- =====================================================================================
revoke all on function clara.revise_document_fact(uuid,text,jsonb,int,text,text) from public;
revoke all on function clara.dismiss_orphaned_classification_question(uuid,text,text) from public;
revoke all on function clara.list_source_revisions(uuid) from public;
revoke all on function clara.list_source_dependents(uuid) from public;
grant execute on function clara.revise_document_fact(uuid,text,jsonb,int,text,text) to clara_authenticated;
grant execute on function clara.dismiss_orphaned_classification_question(uuid,text,text) to clara_authenticated;
grant execute on function clara.list_source_revisions(uuid) to clara_authenticated;
grant execute on function clara.list_source_dependents(uuid) to clara_authenticated;

set role clara_fn_owner;

-- =====================================================================================
-- 9 · THE ONE RECUT — clara.set_document_kind, SIGNATURE UNCHANGED.
--
-- 0169's body VERBATIM plus, exactly: THREE declare variables (`obs`, `v_obs_client`,
-- `v_revision`), ONE observation read placed immediately after the op reservation and before any
-- write, ONE insert into clara.document_fact_revisions placed after the human extraction it names,
-- and THREE added keys on the audit payload plus THREE on the op result. Every guard, every
-- comment, every other statement and the whole question-resolution block are unmoved, so a
-- reviewer diffs two bodies rather than reading a rewrite.
--
-- WHY THE OBSERVATION IS READ BEFORE THE WRITES, and it is not a style point. This body inserts a
-- `clara-classify-human:v1` doc_classify extraction near its end, and
-- `clara._tf_set_authoritative_extraction_0017` (0089:237) REPOINTS
-- `clara.documents.authoritative_extraction_id` at it when it wins the document-wide comparison.
-- An observation read after that insert would therefore stamp the row THIS CALL just created as
-- "what the human was reading" — which is exactly backwards. It is read while the document row is
-- held FOR UPDATE and before the kind flip.
--
-- WHY A KIND CHANGE RECORDS A SOURCE REVISION AT ALL. AC1 asks for one revision receipt carrying
-- the source version, the actor and the reason for a fact, type OR client revision. The type half
-- already had a receipt (`_finish_op`) and an audit row, but neither said which reading the human
-- was looking at when they decided — gap-646's second named defect on AC1. The revision row is
-- that sentence, in the same relation the fact half writes, so one read answers "how did this
-- document's reading get here" for both.
-- =====================================================================================
create or replace function clara.set_document_kind(p_document uuid, p_kind text, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare c record; wk record; d record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
        q record; v_resolved uuid[] := '{}'::uuid[];
        obs record; v_obs_client uuid; v_revision uuid;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot set a document kind' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_document is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'a document and a reason are required' using errcode='CLR10';
  end if;
  -- F-A7 gamma (AB-5/D-9): identity_document joins the settleable kind vocabulary here too --
  -- same list as classify_document's, same reasoning.
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other',
      'identity_document') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- ADV-R4#6: locked — serialized against the classifier writer.
  select * into d from clara.documents where id=p_document for update;
  if not found or d.firm_id<>c.firm then
    raise exception 'document not in your firm' using errcode='CLR11';
  end if;
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  -- 0038 (design 4.2 / part2 section 5): A LIVE BANK STATEMENT PINS THE DOCUMENT KIND. The
  -- kind is what routed this document to the statement lane; changing it under a live
  -- statement leaves that statement, its lines and every match on them citing a document the
  -- schema now calls something else. Same family as the filing refusals in
  -- approve_wrong_client_correction and retire_document_filing, same remedy: void the
  -- statement first (which itself requires zero pending/live match groups on its lines,
  -- WCB-R5), then re-classify, then re-ingest. A SAME-KIND write is untouched.
  if p_kind is distinct from d.document_kind
     and clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before re-classifying'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'set_document_kind',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- #646: WHICH READING THIS DECISION WAS MADE AGAINST, derived inside the transaction, under the
  -- document lock taken above, and BEFORE this body's own human extraction repoints the
  -- authoritative pointer (0089:237). AC1's second half: a revision receipt that does not say
  -- which source version the human was looking at cannot be audited later.
  select * into obs from clara._document_source_observation(p_document);
  v_obs_client:=clara._document_sole_live_client(p_document);
  v_prior:=d.document_kind;
  update clara.documents set document_kind=p_kind where id=p_document;
  -- H-22 (handover 2026-09-04): THE VERB THAT ANSWERS THE QUESTION CLOSES IT.
  -- clara.classify_document's low-confidence arm opens an origin='classification' question
  -- asking exactly what this call just answered (0123:1917-1935). Until now nothing closed
  -- it, and clara._open_question_blocks -> clara._coding_lane_core pinned the filing at
  -- lane='needs_you' on that open row forever -- a correctly-classified document reading as
  -- blocked, with the human asked to answer the same question a second time.
  --
  -- RESOLVED, not dismissed: the human DID answer it. The row is locked FOR UPDATE and
  -- re-read inside the lock, so a concurrent resolve_open_question on the same row cannot be
  -- overwritten -- whoever gets there first wins and the loser skips it.
  --
  -- SCOPE: origin='classification' AND status='open' AND this firm, only. A
  -- clarify_promotion or manual question about the same document is a different question and
  -- survives untouched.
  for q in select oq.id, oq.client_id, oq.document_id
             from clara.open_questions oq
            where oq.document_id=p_document and oq.origin='classification'
              and oq.status='open' and oq.firm_id=c.firm
            order by oq.opened_at, oq.id
              for update loop
    -- THE SAME PROVENANCE PREDICATE clara.resolve_open_question applies to a document-scoped
    -- question (0011:2023-2025), called rather than re-derived: the (document, client) pair
    -- must still carry a LIVE filing whose bytes are verified, and the call takes that
    -- filing's `for share` lock. Without it this verb would record "answered" on a question
    -- whose subject filing has since been retired -- a resolution about nothing.
    --
    -- IT RAISES CLR02 AND THE WHOLE CALL REFUSES. That is stated rather than discovered, and
    -- #646 is where the dead end it names finally ends: a question whose filing was retired is
    -- now closable through clara.dismiss_orphaned_classification_question (0202), which admits
    -- ONLY origin='classification', status='open' and ZERO live filings for that (document,
    -- client). retire_document_filing (0007:1434-1466) still never touches clara.open_questions
    -- and approve_wrong_client_correction still references it nowhere, so the orphan is still
    -- MADE the same way -- what changed is that there is now a door out of it, and this arm's
    -- refusal is what routes a human to that door instead of to a wall.
    --
    -- IT IS STILL THE RIGHT TRADE, and the alternative is worse: skipping the question quietly
    -- records "answered" on a question about a filing that no longer exists, which is H-22's
    -- original defect wearing a new hat.
    --
    -- An UNFILED document reaches no iteration at all (classify_document mints these questions
    -- per active filing), so the ordinary human re-kind is untouched.
    perform clara._active_document_filing(q.document_id, d.sha256, q.client_id, true);
    update clara.open_questions
       set status='resolved', resolved_by=c.actor, resolved_at=now(),
           resolution_text='Classified as '||p_kind||' — '||btrim(p_reason)
     where id=q.id and status='open';
    if found then
      v_resolved:=v_resolved||q.id;
      -- clara.resolve_open_question's own event, verbatim (0011:2038-2039), plus a source
      -- key so the timeline can still say WHICH door closed it. The client_id is the
      -- QUESTION's, never a filing lookup: one document can carry one question per client.
      perform clara._append_event(c.firm,'open_question.resolved',q.client_id,c.actor,null,null,
        null,q.document_id,null,
        jsonb_build_object('question_id',q.id,'status','resolved','source','set_document_kind'));
    end if;
  end loop;
  -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT.
  -- The lane a document sits in was chosen from the kind it carried at enqueue. Now that the
  -- kind has changed, a QUEUED task in a kind-bound lane is not merely wasted work -- it is a
  -- BLOCKER: the router's in-flight short-circuit returns that stale task instead of enqueuing
  -- the correct lane, so a mis-classified document that a human corrects never reaches the
  -- lane it belongs in. Retired here, in the same transaction as the flip, with the receipt on
  -- the task trail (the `skipped_kind` idiom the router already uses for "nowhere to go").
  --
  -- THE SCOPE IS AS NARROW AS THE INTENT: only QUEUED tasks (the transition trigger admits
  -- nothing else), only lanes whose kind set NO LONGER admits the new kind, and never the
  -- kind-independent 'classify' lane. A receipt re-kinded to invoice keeps its invoice_facts
  -- task untouched. NO RE-ENQUEUE happens here: minting work is the router's authority, not a
  -- classification verb's -- retiring the blocker is what lets the ordinary enqueue path do
  -- its job on the next fire.
  update clara.document_processing_tasks
    set status='failed', error_code='skipped_kind', finished_at=now()
    where document_id=p_document and status='queued'
      and ((lane in ('invoice_facts','llm_witness')
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))
        or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));
  -- 0026 P1 (O-round finding): scoped to engine_kind='doc_classify' — same reasoning as
  -- classify_document's own mint, applied to the human-attestation writer's dedicated
  -- engine_id.
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id='clara-classify-human:v1' and engine_kind='doc_classify';
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(c.firm,p_document,'clara-classify-human:v1','doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',1,
        'source','human','actor',c.actor,'reason',btrim(p_reason)))
    returning id into v_ext;
  -- #646: THE SOURCE-REVISION ROW, kind 'kind'. Same relation, same shape and same read as the
  -- fact half writes, so clara.list_source_revisions answers "how did this document's reading get
  -- here" once rather than twice. `new_value` is the kind this call set; `prior_value` is the one
  -- it replaced (legitimately NULL on a first classification, which is why the column is
  -- nullable); `observed_*` are the reading stamped above, before any write.
  insert into clara.document_fact_revisions(firm_id,client_id,document_id,revision_kind,
      field_path,prior_value,new_value,observed_extraction_id,observed_version_n,
      resulting_extraction_id,reason,recorded_by,op_key)
    values(c.firm,v_obs_client,p_document,'kind',
      null,to_jsonb(v_prior),to_jsonb(p_kind),obs.authoritative_extraction_id,obs.facts_version,
      v_ext,btrim(p_reason),c.actor,p_op_key)
    returning id into v_revision;
  perform clara._audit(c.firm,c.actor,null,null,'set_document_kind',null,
    jsonb_build_object('document',p_document,'kind',p_kind,'prior_kind',v_prior,
      'reason',p_reason,'extraction',v_ext,'op_key',p_op_key,
      'resolved_questions',to_jsonb(v_resolved),
      'observed_extraction',obs.authoritative_extraction_id,
      'observed_version',obs.facts_version,'revision',v_revision));
  perform clara._append_event(c.firm,'document.classified',null,c.actor,null,null,
    null,p_document,null,
    jsonb_build_object('document_kind',p_kind,'prior_kind',v_prior,
      'extraction_id',v_ext,'source','human'));
  return clara._finish_op(c.firm,'set_document_kind',p_op_key,
    jsonb_build_object('document_id',p_document,'document_kind',p_kind,
      'prior_kind',v_prior,'extraction_id',v_ext,
      'resolved_questions',to_jsonb(v_resolved),
      'resolved_question_count',coalesce(array_length(v_resolved,1),0),
      'revision_id',v_revision,
      'observed_extraction_id',obs.authoritative_extraction_id,
      'observed_version',obs.facts_version));
end $$;

reset role;

alter function clara.set_document_kind(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- 10 · TAIL CENSUS — every claim re-derived from the POST-state, never handed over from §0.
-- =====================================================================================
do $d646_tail$
declare
  v_src text; v_sha text; v_n int; v_names text; v_role text; v_fn text;
  v_relacl text; v_forced boolean; v_enabled boolean;
begin
  -- (1) THE RECUT SET IS EXACTLY ONE FUNCTION, and the two non-regression bodies are byte-identical
  --     to the shas the prestate pinned. This pair IS "no create or replace outside the named set":
  --     0197's document-posting oracle and 0191's field-path-spliced region writer are the two
  --     bodies a file working in this area is most likely to disturb, and both are re-read here.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha is distinct from (select v from _d646_prestate where k = 'posting_sha') then
    raise exception '#646 tail: clara._document_posting_entry MOVED (now %) -- 0197''s pin is broken', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_sha is distinct from (select v from _d646_prestate where k = 'persist_sha') then
    raise exception '#646 tail: clara.persist_document_extraction MOVED (now %) -- 0191''s field-path splice is not what this file left', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  if v_sha = (select v from _d646_prestate where k = 'set_kind_sha') then
    raise exception '#646 tail: clara.set_document_kind is byte-identical to its pre-image -- the recut did not apply'
      using errcode = 'CLR10';
  end if;

  -- (2) HORN A's PROOF. Both purpose CHECKs re-read and compared to the texts §0 stashed. If either
  --     had moved, #646 would have joined the wave's 0206->0208 purpose-CHECK spine, which is the
  --     one thing D6 exists to prevent.
  select pg_get_constraintdef(con.oid) into v_src from pg_constraint con
   where con.conrelid = 'clara.accounting_work'::regclass and con.conname = 'accounting_work_purpose_check';
  if v_src is distinct from (select v from _d646_prestate where k = 'accounting_work_purpose_check') then
    raise exception '#646 tail: accounting_work_purpose_check MOVED (now %) -- this file must widen no purpose', coalesce(v_src, '(absent)')
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_src from pg_constraint con
   where con.conrelid = 'clara.operation_receipts'::regclass and con.conname = 'operation_receipts_purpose_check';
  if v_src is distinct from (select v from _d646_prestate where k = 'operation_receipts_purpose_check') then
    raise exception '#646 tail: operation_receipts_purpose_check MOVED (now %) -- this file must widen no purpose', coalesce(v_src, '(absent)')
      using errcode = 'CLR10';
  end if;
  -- …and the classification origin the orphan door closes is still admitted (0169:121-129's idiom).
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.open_questions'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%''classification''%';
  if v_n < 1 then
    raise exception '#646 tail: no CHECK on clara.open_questions admits origin=''classification'' any more'
      using errcode = 'CLR10';
  end if;
  -- …and this file widened NO document_extractions vocabulary: the human fact revision rides the
  -- `invoice_facts` engine_kind 0016 already admits, and mints no new one.
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.document_extractions'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%''invoice_facts''%'
     and pg_get_constraintdef(con.oid) not like '%human%';
  if v_n < 1 then
    raise exception '#646 tail: the document_extractions engine_kind CHECK no longer reads as the 0016 vocabulary'
      using errcode = 'CLR10';
  end if;

  -- (3) THE NEW RELATION: FORCE RLS, append-only, no-truncate, SELECT-only for the human lane and
  --     NO DML for any application role.
  select c.relrowsecurity, c.relforcerowsecurity, coalesce(c.relacl::text, 'NULL')
    into v_enabled, v_forced, v_relacl
    from pg_class c where c.oid = 'clara.document_fact_revisions'::regclass;
  if not v_enabled or not v_forced then
    raise exception '#646 tail: document_fact_revisions rls=% force=%', v_enabled, v_forced using errcode = 'CLR10';
  end if;
  foreach v_role in array array['insert','update','delete','truncate','references','trigger'] loop
    if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_fact_revisions', v_role) then
      raise exception '#646 tail: clara_authenticated holds % on document_fact_revisions (acl %) -- every write goes through a door', v_role, v_relacl
        using errcode = 'CLR10';
    end if;
  end loop;
  if not pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_fact_revisions', 'select') then
    raise exception '#646 tail: clara_authenticated cannot SELECT document_fact_revisions (acl %)', v_relacl
      using errcode = 'CLR10';
  end if;
  foreach v_role in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive','public'] loop
    if pg_catalog.has_table_privilege(v_role, 'clara.document_fact_revisions', 'select') then
      raise exception '#646 tail: % reaches document_fact_revisions (acl %) -- which reading a professional decided against is a human record', v_role, v_relacl
        using errcode = 'CLR10';
    end if;
  end loop;
  select coalesce(string_agg(t.tgname, ',' order by t.tgname), '(none)') into v_names
    from pg_trigger t where t.tgrelid = 'clara.document_fact_revisions'::regclass and not t.tgisinternal;
  if v_names <> 't_document_fact_revisions_append_only,t_document_fact_revisions_no_truncate' then
    raise exception '#646 tail: document_fact_revisions carries triggers % (want the append-only pair)', v_names
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_class c where c.oid = 'clara.document_fact_revisions'::regclass
                   and c.relowner = 'clara_fn_owner'::regrole) then
    raise exception '#646 tail: document_fact_revisions is not owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  -- TWO KINDS AND NO THIRD, read from the live CHECK rather than from this file's own text.
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.document_fact_revisions'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%revision_kind%'
     and pg_get_constraintdef(con.oid) like '%''fact''%'
     and pg_get_constraintdef(con.oid) like '%''kind''%'
     and pg_get_constraintdef(con.oid) not like '%client_refile%';
  if v_n < 1 then
    raise exception '#646 tail: the revision_kind CHECK is not the two-value one this file declares'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'clara' and table_name = 'document_fact_revisions'
                and column_name = 'correction_id') then
    raise exception '#646 tail: document_fact_revisions grew a correction_id column -- a wrong-client refile''s identity is clara.filing_corrections, joined READ-side'
      using errcode = 'CLR10';
  end if;

  -- (4) THE FOUR DOORS: posture, ownership, search_path and the EXACT ACL, name by name.
  foreach v_fn in array array[
    'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)',
    'clara.dismiss_orphaned_classification_question(uuid,text,text)',
    'clara.list_source_revisions(uuid)',
    'clara.list_source_dependents(uuid)',
    'clara.set_document_kind(uuid,text,text,text)'] loop
    if to_regprocedure(v_fn) is null then
      raise exception '#646 tail: % does not resolve', v_fn using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_fn::regprocedure and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole
       and array_to_string(p.proconfig, ',') like '%search_path%';
    if v_n <> 1 then
      raise exception '#646 tail: % is not a SECURITY DEFINER search_path-pinned body owned by clara_fn_owner', v_fn
        using errcode = 'CLR10';
    end if;
    if not pg_catalog.has_function_privilege('clara_authenticated', v_fn, 'execute') then
      raise exception '#646 tail: % is not executable by clara_authenticated', v_fn using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_agent_ro','clara_runtime','clara_wake_interactive','clara_wake_proactive','public'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'execute') then
        raise exception '#646 tail: % became callable by % -- these are human doors', v_fn, v_role
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  -- …and the four INTERNAL helpers reach nobody at all.
  foreach v_fn in array array[
    'clara._document_source_observation(uuid)', 'clara._document_sole_live_client(uuid)',
    'clara._revisable_invoice_field(text)', 'clara._monetary_invoice_field(text)'] loop
    if to_regprocedure(v_fn) is null then
      raise exception '#646 tail: % does not resolve', v_fn using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','public'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'execute') then
        raise exception '#646 tail: internal % is reachable by %', v_fn, v_role using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (5) THE RECUT BODY, re-read from the INSTALLED function. Every guard 0169 promised to carry,
  --     plus the new stamp, plus the properties this file promises NOT to have added.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  if position('agent identity cannot set a document kind' in v_src) = 0
     or position('consent-evidence classification is owned by the egress consent path' in v_src) = 0
     or position('clara._bank_live_statement_on_document(p_document)' in v_src) = 0
     or position('clara-classify-human:v1' in v_src) = 0
     or position('skipped_kind' in v_src) = 0
     or position('oq.origin=''classification''' in v_src) = 0
     or position('oq.status=''open''' in v_src) = 0
     or position('oq.firm_id=c.firm' in v_src) = 0
     or position('for update loop' in v_src) = 0
     or position('''open_question.resolved''' in v_src) = 0
     or position('''source'',''set_document_kind''' in v_src) = 0
     or position('clara._active_document_filing(q.document_id, d.sha256, q.client_id, true)' in v_src) = 0 then
    raise exception '#646 tail: the recut body LOST one of the guards 0169 installed and this file promised to carry verbatim'
      using errcode = 'CLR10';
  end if;
  if position('clara._document_source_observation(p_document)' in v_src) = 0
     or position('document_fact_revisions' in v_src) = 0
     or position('''observed_version'',obs.facts_version' in v_src) = 0 then
    raise exception '#646 tail: the recut body does not stamp the observation it was recut to stamp'
      using errcode = 'CLR10';
  end if;
  -- THE OBSERVATION IS READ BEFORE THE HUMAN EXTRACTION IS WRITTEN. If it were not, the stamp
  -- would name the row this very call created (0089:237 repoints the pointer at it).
  if position('clara._document_source_observation(p_document)' in v_src)
     > position('insert into clara.document_extractions' in v_src) then
    raise exception '#646 tail: the observation is read AFTER the human extraction is inserted -- the stamp would name this call''s own row'
      using errcode = 'CLR10';
  end if;
  if position('accounting_work' in v_src) <> 0 or position('agent_tasks' in v_src) <> 0 then
    raise exception '#646 tail: the recut body names the Work lane -- #646 mints no accounting work (D6)'
      using errcode = 'CLR10';
  end if;

  -- (6) NEITHER NEW WRITER TOUCHES THE WORK LANE, read from their installed bodies. This is the
  --     static half of cell p646.horn_a.no_work, and it is also what keeps the declared lock order
  --     (accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions) free of a
  --     documents<->accounting_work edge it does not cover.
  foreach v_fn in array array[
    'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)',
    'clara.dismiss_orphaned_classification_question(uuid,text,text)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_fn::regprocedure;
    if position('accounting_work' in v_src) <> 0 or position('agent_tasks' in v_src) <> 0
       or position('agent_interruptions' in v_src) <> 0 or position('knowledge_records' in v_src) <> 0 then
      raise exception '#646 tail: % names the Work or Knowledge lane -- both are read-only to this ticket', v_fn
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …and the fact door never UPDATEs a region: the append IS the design (0191's belt measures
  -- whatever regions are on file, so an in-place edit would leave a verdict describing numbers
  -- that no longer exist).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)'::regprocedure;
  if position('update clara.document_regions' in v_src) <> 0
     or position('delete from clara.document_regions' in v_src) <> 0 then
    raise exception '#646 tail: revise_document_fact edits clara.document_regions in place -- it must APPEND a new extraction'
      using errcode = 'CLR10';
  end if;
  if position('clara._assert_field_path' in v_src) = 0 then
    raise exception '#646 tail: revise_document_fact does not apply the canonical field-path grammar'
      using errcode = 'CLR10';
  end if;
  -- …and the orphan door's predicate is ZERO LIVE FILINGS, not "not the current one".
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.dismiss_orphaned_classification_question(uuid,text,text)'::regprocedure;
  if position('f.retired_at is null' in v_src) = 0
     or position('q.origin <> ''classification''' in v_src) = 0
     or position('filing_still_live' in v_src) = 0 then
    raise exception '#646 tail: the orphan door''s predicate is not the zero-live-filings one it declares'
      using errcode = 'CLR10';
  end if;
  if position('clara._active_document_filing' in v_src) <> 0 then
    raise exception '#646 tail: the orphan door calls clara._active_document_filing -- that predicate is exactly what it must NOT relax or reuse'
      using errcode = 'CLR10';
  end if;
  -- …and clara._active_document_filing itself is untouched by this file: resolve_open_question and
  -- dismiss_open_question ride it and a relaxation there would widen both.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._active_document_filing(uuid,text,uuid,boolean)'::regprocedure;
  if position('active verified filing provenance not established' in v_src) = 0
     or position('f.retired_at is null' in v_src) = 0 then
    raise exception '#646 tail: clara._active_document_filing is not the 0007 predicate this file promised to leave alone'
      using errcode = 'CLR10';
  end if;

  -- (7) THE EVENT TYPE landed with its taxonomy row, on the ACTIVE version.
  if not exists (select 1 from clara.event_types where name = 'document.fact_revised' and client_scoped) then
    raise exception '#646 tail: document.fact_revised did not register in clara.event_types as client_scoped'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
   where tt.event_type = 'document.fact_revised' and tt.decision = 'context_update';
  if v_n <> 1 then
    raise exception '#646 tail: document.fact_revised has % active taxonomy row(s) at context_update (want 1)', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#646 tail: OK -- clara.document_fact_revisions exists, FORCE-RLS, clara_fn_owner-owned, SELECT-only for clara_authenticated and unreachable by the runtime or agent lanes, append-only + no-truncate, two revision kinds and NO correction_id column. Four doors (revise_document_fact, dismiss_orphaned_classification_question, list_source_revisions, list_source_dependents) plus the recut set_document_kind are VOLATILE-or-STABLE SECURITY DEFINER search_path-pinned bodies owned by clara_fn_owner, executable by clara_authenticated and by NOBODY else (agent_ro, runtime, both wake roles and PUBLIC all refused); the four internal helpers reach nobody at all. The recut carries every 0169 guard re-read from the INSTALLED body, reads its observation BEFORE writing its own extraction, names neither accounting_work nor agent_tasks, and both new writers name neither the Work lane nor knowledge_records. revise_document_fact APPENDS (no UPDATE or DELETE on clara.document_regions) and applies the canonical field-path grammar; the orphan door''s predicate is ZERO LIVE FILINGS and it never calls clara._active_document_filing, which is itself re-read unchanged. clara._document_posting_entry and clara.persist_document_extraction are byte-identical to 0197''s and 0191''s pinned shas, and BOTH purpose CHECKs are byte-identical to the texts the prestate stashed -- #646 widens no purpose and joins no purpose-CHECK spine. document.fact_revised is registered client_scoped with exactly one active context_update taxonomy row. No table in workflow/graphile_worker/spike touched. D1 WRITE-QUIESCE IS OWED -- clara.set_document_kind is an audited writer body replacement, one door, one window.';
end $d646_tail$;
