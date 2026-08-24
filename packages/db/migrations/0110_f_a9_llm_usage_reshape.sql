-- UNNUMBERED_f_a9_llm_usage_reshape.sql -- Wave-F Track A, F-A9 (metering) PR-1A.
-- =====================================================================================
-- Design of record: docs/plan/active/metering-design.md v2 SS3.1 (the ledger reshape),
-- SS3.2 (the second door), SS3.5 (the price table), SS3.6 (the spend evaluator), SS3.7
-- (the monthly rollup); Annex B DDL 3; Annex F. Ruled shape: TA-P13 = A (ONE ledger),
-- TA-P2 = A+ (spend is a versioned-policy-table CALCULATION), R-L10 (platform calls
-- record with no firm), R-L19 (2026-08-23, owner: price rows are DEVELOPER-SEEDED
-- migration data -- there is no proposal table, no propose verb and no approval door).
--
-- Numbers are claimed at MERGE time (hard constraint 10; .claude/rules/db-migrations.md).
-- This file is deliberately UNNUMBERED; the conductor renames it at merge. Note that
-- packages/db/scripts/migrate.mjs skips any file whose name does not start with a digit,
-- so on a rig this file is applied through a temporary numbered copy, never committed.
--
-- ------------------------------------------------------------------------------------
-- SS0 QUIESCE INVENTORY: **NO D1 WRITE-QUIESCE OBLIGATION.** This file replaces NO live
-- body. The closed-world writer census on the frontier rig (every clara function whose
-- prosrc names clara.llm_usage_events or clara.record_llm_usage_event) returned exactly
-- two rows, and BOTH are left byte-identical by this file:
--     clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)
--       prosrc sha256 9d9bc3ce7f97d2886311f10f524edabe3a152ba7de69b47740e42abbe915ff44
--     clara.persist_witness_facts(uuid,jsonb,jsonb,integer)
--       prosrc sha256 e3264e052061ce41846fd882bdb1fe38fdfca56af50d46a0ae80b1c68da75539
-- SS1's prestate re-reads both shas and ABORTS on a mismatch, and the tail re-reads them
-- again after the DDL: a reshape that silently moved a writer's body is the one thing
-- this file must never do. Everything else here is a brand-new object (the 0094
-- precedent for "no D1 on a pure addition").
--
-- WHY THE OLD VERB IS NOT WIDENED (Annex A D2): a function's identity in Postgres is its
-- full declared parameter type list, so trailing DEFAULTed parameters would break the
-- to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)')
-- capability probe INSIDE two live frozen closures (witnessFacts.v1.dispatch.mjs:86,
-- imported unchanged by witnessFacts_v2; statementFacts.v2.dispatch.mjs:68). The new
-- shape therefore ships as a differently-NAMED sibling. No consumer of the old verb
-- changes at any merge order.
--
-- PINNED PRESTATE (rig replay at frontier 0102_f_a2_statement_activation, 2026-08-23):
-- clara.llm_usage_events' live shape sha256 (a canonical projection of its column list
-- and its constraint definitions -- see SS1) is
--     3105053c8cb055ade7832d4d1511fe1a753c5d16f1034bc8181c1d83f890d5e5
-- and the POST-shape sha this file installs is raised as a notice by the tail census, so
-- a later lane's prestate probe (F-A7/PR-5rho) has a named value to require rather than
-- a name to grep for.
--
-- CONCURRENCY NOTE, and why the two new CHECKs are NOT shipped NOT VALID: Annex B offers
-- the NOT VALID + VALIDATE split "if the table is large at merge time". Measured, that
-- split buys nothing HERE: packages/db/scripts/migrate.mjs runs each migration inside ONE
-- transaction, so the ACCESS EXCLUSIVE lock taken by ADD CONSTRAINT ... NOT VALID is held
-- until commit anyway and the later VALIDATE cannot shorten it. If this table is ever
-- large enough that the validating scan matters, the split has to be a SEPARATE migration
-- file (a second transaction), not two statements in this one.
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Measure every claim this file makes about what it is editing.
-- =====================================================================================
do $pre$
declare
  v_shape text; v_sha text; v_n int;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0102_f_a2_statement_activation') then
    raise exception 'f_a9_llm_usage_reshape prestate: 0102_f_a2_statement_activation is not applied -- frontier mismatch'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.llm_usage_events') is null then
    raise exception 'f_a9_llm_usage_reshape prestate: clara.llm_usage_events does not exist -- 0094 is not applied'
      using errcode = 'CLR10';
  end if;

  -- (0.1) ALREADY-APPLIED GUARD (the 0094 idiom). Any one of this file's objects being
  -- present means the file already ran; refuse rather than half-apply on top of itself.
  if exists (select 1 from pg_attribute
              where attrelid = 'clara.llm_usage_events'::regclass and attname = 'call_kind' and not attisdropped)
     or to_regclass('clara.llm_price_table') is not null
     or to_regclass('clara.llm_usage_events_priced') is not null
     or to_regprocedure('clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)') is not null then
    raise exception 'f_a9_llm_usage_reshape prestate: already applied' using errcode = 'CLR10';
  end if;

  -- (0.2) THE PINNED LIVE SHAPE. This lane is FIRST on clara.llm_usage_events (the table
  -- is append-only and the reshape is irreversible once production rows land), so the
  -- prestate is an EQUALITY, not a floor: if any other change reached this table before
  -- this file, the merge order was violated and the right answer is to stop.
  v_shape :=
    (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
                       || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), E'\n' order by a.attnum)
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'clara.llm_usage_events'::regclass and a.attnum > 0 and not a.attisdropped)
    || E'\n--\n' ||
    (select string_agg(conname || ' ' || pg_get_constraintdef(oid), E'\n' order by conname)
       from pg_constraint where conrelid = 'clara.llm_usage_events'::regclass);
  v_sha := encode(sha256(convert_to(v_shape, 'UTF8')), 'hex');
  if v_sha <> '3105053c8cb055ade7832d4d1511fe1a753c5d16f1034bc8181c1d83f890d5e5' then
    raise exception 'f_a9_llm_usage_reshape prestate: clara.llm_usage_events is NOT at the pinned 0094 shape (observed sha %) -- something changed this table ahead of F-A9 PR-1A; re-derive the reshape against the real tip before applying', v_sha
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE TWO LIVE WRITER BODIES, pinned by prosrc sha. This file must leave both
  -- byte-identical; pinning them here is what makes the tail's re-read meaningful.
  if (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p
       where p.oid = 'clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)'::regprocedure)
     <> '9d9bc3ce7f97d2886311f10f524edabe3a152ba7de69b47740e42abbe915ff44' then
    raise exception 'f_a9_llm_usage_reshape prestate: record_llm_usage_event is not at its pinned body' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p
       where p.oid = 'clara.persist_witness_facts(uuid,jsonb,jsonb,integer)'::regprocedure)
     <> 'e3264e052061ce41846fd882bdb1fe38fdfca56af50d46a0ae80b1c68da75539' then
    raise exception 'f_a9_llm_usage_reshape prestate: persist_witness_facts is not at its pinned body' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara'
      and (p.prosrc like '%llm_usage_events%' or p.prosrc like '%record_llm_usage_event%');
  if v_n <> 2 then
    raise exception 'f_a9_llm_usage_reshape prestate: the writer census is not the pinned closed world of 2 bodies (got %) -- a third body now reaches this ledger and must be assessed for a D1 obligation before this file applies', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE LEAVES THIS FILE'S NEW FKs BIND TO. Read positively; a missing unique key
  -- would silently turn a composite FK into an error at ADD CONSTRAINT time, and a
  -- missing table into a different one -- neither should be discovered mid-file.
  if not exists (select 1 from pg_constraint where conname = 'uq_clients_id_firm') then
    raise exception 'f_a9_llm_usage_reshape prestate: clara.clients(id,firm_id) is not uniquely keyed -- the client FK would not bind'
      using errcode = 'CLR10';
  end if;
  perform 'clara.agent_tasks'::regclass;
  perform 'clara.users'::regclass;
  -- The rollup resolves a legacy extraction row's client through clara.document_filings,
  -- NOT through a clara.documents.client_id column (which the design cites at 0003:67 and
  -- which no longer exists live -- see SECTION 5). Assert the columns the join reads, so a
  -- future move of this surface fails HERE rather than at the first monthly read.
  if (select count(*) from pg_attribute
       where attrelid = 'clara.document_filings'::regclass and not attisdropped
         and attname in ('document_id','firm_id','client_id','retired_at')) <> 4 then
    raise exception 'f_a9_llm_usage_reshape prestate: clara.document_filings does not carry the four columns the rollup resolves a document''s client through'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid = 'clara.documents'::regclass and attname = 'client_id' and not attisdropped) then
    raise notice 'f_a9_llm_usage_reshape prestate: NOTE -- clara.documents carries a client_id column again. The rollup deliberately resolves through document_filings (the live one-to-many attribution surface); revisit SECTION 5 if that has changed.';
  end if;
  perform 'clara.jwt_firm()'::regprocedure;
  perform 'clara._tf_no_truncate()'::regprocedure;

  raise notice 'f_a9_llm_usage_reshape prestate: clean -- llm_usage_events at the pinned 0094 shape (sha %), both live writer bodies at their pinned prosrc shas, writer census closed at 2, every FK leaf present. NO D1 quiesce: this file replaces no body.', v_sha;
end
$pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- THE LEDGER RESHAPE (design SS3.1 / Annex B DDL 3).
-- Four NOT NULLs relaxed, six columns added, five CHECKs added. Every existing row
-- satisfies the new shape: call_kind takes its column DEFAULT, and a pre-reshape row is
-- by construction a document_extraction row with all three of document_id / task_id /
-- channel present, which is exactly what the extraction-shape wall requires.
-- =====================================================================================

-- The relaxations. The table must be able to hold ANY call kind: a chat turn has no
-- document and no document_processing_task, and a platform call has neither plus no
-- channel. Both FKs are MATCH SIMPLE, so a NULL component skips the check rather than
-- failing it -- the FKs stay exactly as 0094 wrote them.
--
-- CHANNEL, and why its CHECK is NOT rewritten: design SS3.1's table cell describes the
-- resulting semantics as "channel is null or channel in ('text','vision')". The LIVE
-- constraint llm_usage_events_channel_check is `channel = ANY (ARRAY['text','vision'])`,
-- which under SQL's three-valued CHECK evaluation already ADMITS NULL (a CHECK fails only
-- on FALSE, never on UNKNOWN). Annex B's DDL 3 lists two new CHECKs, not three, and a
-- drop+add here would change a constraint's NAME for no behavioural gain. The admission
-- is PROVEN behaviourally by this file's tail census (an actual NULL-channel insert,
-- rolled back) rather than asserted from the text -- spelling is not identity.
--
-- FIRM_ID, THE FOURTH RELAXATION (R-L10, docs/plan/index.md:76): "firm_id becomes NULLABLE
-- for platform-level calls -- a NULL firm is a platform call, never an unmetered one."
-- metering-design.md v2 SS3.1 predates that ruling and still lists three relaxations; the
-- ruling governs, and PR-1A is the only PR that touches this table's nullability. Two
-- consequences are executed below rather than left as side effects: SECTION 1b recuts the
-- human read policy (a NULL firm_id makes `firm_id = jwt_firm()` evaluate NULL, and RLS
-- admits only TRUE -- so without the recut every platform row would be billed, recorded
-- and invisible to every human in both directions), and ck_llm_usage_events_platform_shape
-- closes the reference hole the relaxation opens in the composite client FK.
alter table clara.llm_usage_events
  alter column firm_id     drop not null,
  alter column document_id drop not null,
  alter column task_id     drop not null,
  alter column channel     drop not null,
  -- call_kind: NOT NULL, because a call always HAS a kind -- including the legacy one.
  -- The DEFAULT is what keeps clara.record_llm_usage_event byte-identical: its INSERT
  -- never names this column, and both of its live callers are exactly this kind.
  add column call_kind        text not null default 'document_extraction',
  -- client_id: nullable so an attribution-pending or firm-wide call still records. The
  -- ruling names its ABSENCE irreversible (months recorded without it can never be split
  -- per client), which is why it lands NOW rather than when a lane first needs it.
  add column client_id        uuid,
  -- triggering_actor: the human who caused the call, when there is one. NULL for an
  -- unattended lane -- which is a fact about the call, not a missing value.
  add column triggering_actor uuid,
  -- agent_task_id: the chat/wake task. A SECOND, independent FK rather than a widening of
  -- task_id, because the two task tables are disjoint (Annex A D3).
  add column agent_task_id    uuid,
  -- via_wake_kind: the wake kind when the call was unattended. Free text, deliberately
  -- unconstrained -- descriptive metadata about an upstream lane this ledger does not own.
  -- The design cites entry_post_receipts.via_wake_kind (F-A2 design SS3.3) as the mirror;
  -- that table is not live yet, so the shape is taken from the LIVE mirrors instead --
  -- clara.audit_log.via_wake_kind (0002:281) and clara.domain_events.via_wake_kind
  -- (0005:87), both bare nullable text.
  add column via_wake_kind    text,
  -- scope: R-L26's contract discriminator, adopted here on L19's objection (measured, not
  -- theorised). The ruled policy arm below keys on `firm_id is null`, which INFERS "this is
  -- a platform row" from an ABSENCE -- so a future writer that merely FORGETS to set
  -- firm_id would mint a row visible to every authenticated user of every firm, silently,
  -- and the predicate would be failing OPEN. scope makes the platform claim POSITIVE and
  -- ck_llm_usage_events_scope_firm pairs the two, so a forgotten firm_id is a constraint
  -- violation (23514) instead of a leak. It also lines this ledger up with
  -- agent_receipts_visible, so a future F-A9 receipt projection inherits R-L26 rather than
  -- re-litigating it. DEFAULT 'firm' is what keeps record_llm_usage_event byte-identical:
  -- its INSERT never names this column and always carries a firm.
  add column scope            text not null default 'firm';

-- The four new FKs.
--   client: the composite (client_id, firm_id) -> clara.clients(id, firm_id), the same
--     shape documents / journal_entries already use. This makes a cross-firm client
--     STRUCTURALLY impossible rather than checked in a body.
--   triggering_actor: a plain reference to clara.users(id). The firm-membership half is
--     NOT expressible as an FK (membership is a row in another table with a status), so
--     the writer reads it positively -- see SECTION 2.
--   agent_task: SIMPLE, not composite. clara.agent_tasks carries PRIMARY KEY (id) and
--     UNIQUE (id, firm_id, client_id) and NOTHING keyed (id, firm_id) alone; a composite
--     FK through the triple would skip validation entirely whenever client_id is NULL
--     (MATCH SIMPLE), i.e. exactly on the unattributed rows that most need it. So the
--     firm consistency is a manual positive read in the writer instead (Annex A D3).
-- AND A FOURTH, NOT IN THE DESIGN'S LIST, for the same reason the design added the
-- extraction-shape wall: the relaxation removes a safety net the original table relied on.
-- 0094 gave firm_id NO direct FK, and did not need one: BOTH composite FKs
-- ((document_id, firm_id) -> documents and (task_id, firm_id) -> document_processing_tasks)
-- were NOT NULL, so every row's firm_id was transitively bound to a real firm by
-- construction. Relax those two NOT NULLs and a non-extraction row's firm_id is bound by
-- NOTHING: clara.record_agent_usage_event(p_firm => <any uuid>, 'chat', ...) would append
-- a row naming a firm that does not exist: invisible to RLS (it can never equal
-- jwt_firm()), invisible to every rollup, and unfixable, because this table is
-- append-only. fk_llm_usage_events_firm restores the binding structurally: a firm_id that
-- is PRESENT must name a real firm, while R-L10's platform row (firm_id NULL) skips the
-- check by MATCH SIMPLE, which is exactly the intended pair of behaviours. It validates
-- trivially on existing rows, all of which are transitively bound already.
--
-- NONE of the four carries an ON DELETE action: plain NO ACTION. This ledger is
-- append-only and its rows are evidence of spend that really happened, so a parent row
-- must not be able to erase or blank one. A lane that wants to delete an agent_task must
-- reckon with its usage rows.
alter table clara.llm_usage_events
  add constraint fk_llm_usage_events_firm
    foreign key (firm_id) references clara.firms(id),
  add constraint fk_llm_usage_events_client
    foreign key (client_id, firm_id) references clara.clients(id, firm_id),
  add constraint fk_llm_usage_events_actor
    foreign key (triggering_actor) references clara.users(id),
  add constraint fk_llm_usage_events_agent_task
    foreign key (agent_task_id) references clara.agent_tasks(id);

-- WALL 1 -- the call-kind roster. Extend-only, closed enum, mirroring the wake_credentials
-- CHECK-extension idiom. call_kind is DESCRIPTIVE metadata and never authority-bearing,
-- so widening it later is not a "narrows an enumeration" hazard -- but an UNRECOGNISED
-- kind is refused at INSERT time, so a lane that forgets to register its kind fails
-- loudly instead of silently mislabelling itself as an existing one.
-- THE ROSTER LIVES HERE AND NOWHERE ELSE. clara.record_agent_usage_event deliberately
-- does NOT restate it: a later item extends the roster with a one-line CHECK swap, and a
-- duplicate list inside a function body would be a second place to forget.
alter table clara.llm_usage_events
  add constraint ck_llm_usage_events_call_kind check (call_kind in (
    'document_extraction',   -- F-A1, live
    'chat',                  -- F-A9 PR-2's retrofit
    'unattended_posting',    -- F-A2's own coder, distinct from chat
    'freeform_read',         -- F-A6
    'interview_extraction',  -- F-A7b
    'filing_attribution',    -- F-A7a
    'web_fetch',             -- F-A8 tier 2
    'tier1_policy_fetch',    -- F-A8 tier 1
    'reporting'              -- F-A5
  ));

-- WALL 2 -- the extraction-shape wall. THE ONE NEW CHECK THAT MATTERS MOST.
-- Relaxing document_id/task_id/channel silently removes a safety net the ORIGINAL author relied
-- on: record_llm_usage_event's nit-3 comment (0094:107-108) reads "both columns are NOT
-- NULL on the table, so the FKs catch that case with their own error" -- true when it was
-- written, FALSE the moment the table relaxes, unless a replacement wall takes over
-- exactly that case. It is call-kind-scoped, which is the point of the reshape: every
-- OTHER kind may omit what a document-extraction call cannot.
alter table clara.llm_usage_events
  add constraint ck_llm_usage_events_extraction_shape check (
    call_kind <> 'document_extraction'
    or (document_id is not null and task_id is not null and channel is not null));

-- WALL 3 -- the platform-shape wall. R-L10's relaxation of firm_id opens a REFERENCE hole
-- that the extraction-shape wall's argument applies to word for word.
-- fk_llm_usage_events_client binds the COMPOSITE (client_id, firm_id) and is MATCH SIMPLE:
-- with firm_id NULL the whole FK is SKIPPED, so a platform row could carry a client_id
-- naming nothing at all, on an append-only table. It is also incoherent on its face -- a
-- client belongs to a firm, and a firm-less call cannot be one client's. agent_task_id is
-- included for the same coherence reason (its own FK does validate, so this is semantics
-- rather than a dangling reference). triggering_actor is deliberately NOT in this CHECK:
-- its FK to clara.users(id) is simple and always validates, and whether a human may cause
-- a platform call is a product question, not a referential one -- SECTION 2's door refuses
-- it explicitly and says why, which is the reviewable place for that judgement.
alter table clara.llm_usage_events
  add constraint ck_llm_usage_events_platform_shape check (
    firm_id is not null or (client_id is null and agent_task_id is null));

-- WALL 4 -- the scope roster and THE PAIRING. The pairing is the load-bearing half: it is
-- what turns "firm_id happens to be NULL" from an INFERENCE the read policy trusts into a
-- DECLARED fact the table enforces. With it, the forgotten-firm_id case (scope left at its
-- 'firm' default, firm_id never set) is refused with a 23514 at INSERT time; without it,
-- that same row would be readable by every authenticated user of every firm and nothing
-- would say so. `(a) = (b)` over two non-null booleans is the estate's own paired-CHECK
-- idiom. Both directions are proven behaviourally by the battery, not read off the text.
alter table clara.llm_usage_events
  add constraint ck_llm_usage_events_scope check (scope in ('firm','platform')),
  add constraint ck_llm_usage_events_scope_firm check ((scope = 'firm') = (firm_id is not null));

-- -------------------------------------------------------------------------------------
-- SECTION 1b -- THE HUMAN READ POLICY, RECUT. **JUDGEMENT LOGIC** (review law 1): this
-- statement decides which rows a human session can see.
--
-- The live policy is 0094:83-84, verbatim:
--     create policy p_llm_usage_events_human on clara.llm_usage_events
--       for select to clara_authenticated using (firm_id = clara.jwt_firm());
-- With firm_id NULLABLE from this file onward, a platform row makes that predicate
-- evaluate to NULL, and RLS admits only TRUE. The row would therefore be recorded, billed
-- and INVISIBLE TO EVERY HUMAN in both directions -- including when jwt_firm() is itself
-- NULL. An empty result would read as "no platform calls happened", which is the precise
-- shape of defect law 22 forbids: a visible record that lies by omission. This is not a
-- tenancy leak; it is the opposite, and on an audit surface it is worse.
--
-- Measured by lane L19 on the live frontier while building F-A8/R-L26, where the identical
-- three-valued-logic defect appears on agent_receipts_visible; 144 clara policies carry
-- jwt_firm() in a USING clause, so the pattern is estate-wide rather than ours.
--
-- RULED (orchestrator, 2026-08-23, revised the same day on L19's measurement, mirroring
-- R-L26's contract): the human SELECT gains a platform arm, keyed on the POSITIVE scope
-- declaration rather than on a NULL. A platform row belongs to NO firm, so showing it to a
-- firm's session is not a cross-tenant read -- there is no tenant to cross. FORCE RLS and
-- the owner policy are untouched, the role is unchanged, and a SIBLING FIRM's row stays
-- invisible exactly as before: the only rows this admits are ones declared firm-less.
--
-- The first draft of this arm was `firm_id = jwt_firm() or firm_id is null`. It was
-- REJECTED: it infers the platform claim from an absence, so a writer that merely forgot
-- to set firm_id would publish a row to every firm, silently -- failing OPEN. Keying on
-- scope, with ck_llm_usage_events_scope_firm pairing scope to firm_id, makes that same
-- omission a constraint violation.
--
-- NO D1 OBLIGATION: a policy is not a writer body. PostgreSQL re-plans a policy predicate
-- per statement, so there is no in-flight call that can complete on the old predicate the
-- way a PL/pgSQL body can. The tail census proves the recut BEHAVIOURALLY, from a real
-- clara_authenticated session, in both directions.
-- (still running as clara_fn_owner, set at the top of SECTION 1 -- the table's owner.)
drop policy p_llm_usage_events_human on clara.llm_usage_events;
create policy p_llm_usage_events_human on clara.llm_usage_events
  for select to clara_authenticated
  using ((scope = 'firm' and firm_id = clara.jwt_firm()) or scope = 'platform');

-- =====================================================================================
-- SECTION 2 -- clara.record_agent_usage_event: THE SECOND DOOR (design SS3.2).
-- Brand-new object. The old verb is untouched; this one carries the new shape for every
-- future lane. NO SPEND REFUSAL ANYWHERE (law 76) -- see the body's own comment.
-- =====================================================================================
create function clara.record_agent_usage_event(
    p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text,
    p_client uuid default null, p_document uuid default null, p_document_task uuid default null,
    p_agent_task uuid default null, p_triggering_actor uuid default null,
    p_via_wake_kind text default null, p_channel text default null, p_prompt_hash text default null,
    p_input_tokens int default null, p_output_tokens int default null, p_duration_ms int default null)
  returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid;
begin
  -- ONE CALL-KIND, ONE DOOR (CLR10). document_extraction keeps its own verb, byte-identical
  -- and probe-stable; letting this door also mint that kind would give one kind two writers
  -- with two different wall sets -- the shape TA-P11's one-architecture instinct refuses.
  if p_call_kind = 'document_extraction' then
    raise exception 'document_extraction usage is recorded through clara.record_llm_usage_event, not this door'
      using errcode = 'CLR10';
  end if;
  if p_call_kind is null or btrim(p_call_kind) = '' then
    raise exception 'a call_kind is required' using errcode = 'CLR10';
  end if;
  -- The ROSTER itself is NOT restated here on purpose: ck_llm_usage_events_call_kind is
  -- the single place a kind is registered, and an unregistered kind fails on the INSERT
  -- below with that constraint's own error.
  if coalesce(p_outcome, '') not in ('success','refused','error','timeout') then
    raise exception 'llm usage outcome is not a recognised value' using errcode = 'CLR10';
  end if;
  -- R-L10's PLATFORM CALL: p_firm NULL is legitimate and means "no firm", never "unknown
  -- firm" and never "unmetered". Everything firm-scoped must then be absent, and the
  -- refusal is stated HERE rather than left to fall out of the checks below -- each of
  -- which would otherwise refuse with a message about a firm that does not exist, sending
  -- the reader hunting for a firm bug that is not there. p_client and p_agent_task are
  -- also refused structurally by ck_llm_usage_events_platform_shape; p_triggering_actor is
  -- refused ONLY here, deliberately: a platform call has no firm, so there is no
  -- membership that could make an actor's attribution meaningful, and inventing one would
  -- put a human's name on a spend row nobody authorised.
  if p_firm is null
     and (p_client is not null or p_agent_task is not null or p_triggering_actor is not null) then
    raise exception 'a platform call (no firm) cannot name a client, an agent task or a triggering actor'
      using errcode = 'CLR10';
  end if;
  if p_channel is not null and p_channel not in ('text','vision') then
    raise exception 'llm usage channel must be text or vision' using errcode = 'CLR10';
  end if;

  -- THE TASK AND THE DOCUMENT MUST BE THE SAME DOCUMENT'S -- 0094:109-113's positive-read
  -- pattern, re-used verbatim in intent. Read POSITIVELY and fail closed: only a task row
  -- this read actually SAW, naming this document, passes. Unlike 0094 this door may be
  -- called with either side NULL (a chat call has neither), and a NULL on either side
  -- skips the comparison rather than inventing one -- which is now the ONLY behaviour,
  -- since the table's own NOT NULLs no longer backstop it for this call kind.
  if p_document_task is not null and p_document is not null
     and not exists (select 1 from clara.document_processing_tasks t
                      where t.id = p_document_task and t.document_id = p_document) then
    raise exception 'llm usage event names a task that does not belong to this document' using errcode = 'CLR10';
  end if;

  -- THE AGENT TASK MUST BE THIS FIRM'S. There is no (id, firm_id) unique key on
  -- clara.agent_tasks to FK against (only the (id, firm_id, client_id) triple, which
  -- MATCH SIMPLE would skip whenever client_id is NULL), so the firm consistency is a
  -- manual POSITIVE read: a row this query actually saw, in this firm. A missing task and
  -- a foreign task both fall through to the same refusal -- absence is not evidence.
  if p_agent_task is not null
     and not exists (select 1 from clara.agent_tasks at where at.id = p_agent_task and at.firm_id = p_firm) then
    raise exception 'llm usage event names an agent task that is not in this firm' using errcode = 'CLR10';
  end if;

  -- THE TRIGGERING ACTOR MUST BE A LIVE ACTIVE MEMBER OF THIS FIRM -- begin_chat_turn's
  -- own idiom (0006:938-940), same errcode. A user row alone is not enough: membership is
  -- what makes the attribution meaningful, and a deactivated member must not be minted as
  -- the cause of new spend.
  if p_triggering_actor is not null
     and not exists (select 1 from clara.firm_memberships fm
                      where fm.user_id = p_triggering_actor and fm.firm_id = p_firm and fm.status = 'active') then
    raise exception 'triggering actor is not a live active member of this firm' using errcode = 'CLR04';
  end if;

  -- p_client's firm consistency is STRUCTURAL (fk_llm_usage_events_client binds the
  -- composite (client_id, firm_id)), so it is deliberately not re-checked here.
  --
  -- NO SPEND REFUSAL ANYWHERE (law 76): this verb never inspects a budget, a cap or a
  -- concurrency window -- it is a pure metering record, always accepted for a well-formed
  -- call. Exactly the posture of its sibling. A cap, if one is ever ruled, is a different
  -- object's job; metering must never be the thing that refuses work.
  -- scope is DECLARED, never inferred at read time: this door is the one place that knows
  -- whether the caller meant "no firm" (R-L10 platform call) or named one, and
  -- ck_llm_usage_events_scope_firm refuses the pair if the two ever disagree.
  insert into clara.llm_usage_events(firm_id, scope, call_kind, client_id, triggering_actor,
      agent_task_id, via_wake_kind, document_id, task_id, channel, engine_id, prompt_hash,
      input_tokens, output_tokens, duration_ms, outcome)
    values (p_firm, case when p_firm is null then 'platform' else 'firm' end,
      p_call_kind, p_client, p_triggering_actor, p_agent_task,
      p_via_wake_kind, p_document, p_document_task, p_channel, p_engine_id, p_prompt_hash,
      p_input_tokens, p_output_tokens, p_duration_ms, p_outcome)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int) from public;
grant execute on function clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int) to clara_runtime;

-- =====================================================================================
-- SECTION 3 -- clara.llm_price_table (design SS3.5 / Annex F, as amended by R-L19).
--
-- R-L19 (owner, 2026-08-23) DISSOLVED the price-approval question: price rows are
-- DEVELOPER-SEEDED PLATFORM DATA -- a versioned, effective-dated migration seed through
-- the full PR ladder, and a price change is a ticket and a PR. Consequences carried here:
--   * clara.llm_price_proposals, propose_llm_price, approve_llm_price_proposal and
--     reject_llm_price_proposal are NOT BUILT (dropped, not deferred).
--   * Annex F's approved_by / approved_at pair dies with the approver. A column that can
--     never be non-null is a lie in a visible record (law 22), so it is not created. The
--     provenance that replaces it is the reviewed migration itself plus the row's own
--     mandatory source_note and source_urls.
--   * D19's third wall -- "approve REFUSES a backdated effective_from" -- died with the
--     verb, and it was the wall against two price rows matching ONE usage row (which
--     double-counts a money number). SECTION 3 replaces it with a behavioural one:
--     clara._tf_llm_price_no_overlap, below. The remaining two D19 walls (the range CHECK
--     and the partial unique index) are built as designed.
--
-- Posture: FORCE RLS with an OWNER POLICY ONLY and NO clara_authenticated grant -- the
-- sst_threshold_schedule idiom, verified live on the frontier rig (forced RLS, exactly
-- one owner policy, zero grants to any app role). This is PLATFORM data, not tenant data:
-- it carries no firm_id, so a firm-scoped read policy is not even expressible. Reads go
-- through SECTION 5's typed DEFINER function (Annex A D5).
-- =====================================================================================
create table clara.llm_price_table (
  engine_id      text   not null check (btrim(engine_id) <> ''),
  effective_from date   not null,
  effective_to   date,
  input_price_cents_per_million_tokens  bigint not null check (input_price_cents_per_million_tokens  >= 0),
  output_price_cents_per_million_tokens bigint not null check (output_price_cents_per_million_tokens >= 0),
  -- USD-only by CHECK: a deliberate, named, single-value floor rather than an unenforced
  -- convention (Annex A D11). Vendor billing is USD; the books are MYR-only until the FX
  -- wave (law 18 / P-FX), and MYR conversion is a named non-goal.
  currency       text   not null default 'USD' check (currency = 'USD'),
  source_note    text   not null check (btrim(source_note) <> ''),
  source_urls    jsonb  not null default '[]'::jsonb,
  recorded_at    timestamptz not null default now(),
  primary key (engine_id, effective_from),
  constraint ck_llm_price_range check (effective_to is null or effective_to >= effective_from)
);
-- D19 wall 2: at most ONE open-ended row per engine. Contiguity by construction --
-- deliberately NOT an EXCLUDE over a daterange, because btree_gist is installed nowhere
-- in this estate (the estate says so itself at 0056:266-269 and 0057:305-313) and adding
-- an extension to a ceremony for a wall we can build from house parts is the wrong trade.
create unique index uq_llm_price_open on clara.llm_price_table(engine_id) where effective_to is null;

-- D19 wall 3, REBUILT: no two rows for one engine may overlap in time. Without this, two
-- overlapping CLOSED rows make one usage row match two price rows and the evaluator
-- doubles its spend -- silently, with no error anywhere. The dropped approve verb used to
-- be the only thing standing between us and that; a statement-level trigger is the
-- estate's own idiom for a wall a CHECK cannot express, and unlike the verb it binds
-- EVERY writer, including a future seed migration that forgets.
create function clara._tf_llm_price_no_overlap() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_pair text;
begin
  select a.engine_id || ' [' || a.effective_from || ',' || coalesce(a.effective_to::text, 'open') || '] vs ['
         || b.effective_from || ',' || coalesce(b.effective_to::text, 'open') || ']'
    into v_pair
    from clara.llm_price_table a
    join clara.llm_price_table b
      on b.engine_id = a.engine_id and b.effective_from > a.effective_from
   where coalesce(a.effective_to, 'infinity'::date) >= b.effective_from
   limit 1;
  if v_pair is not null then
    raise exception 'llm_price_table would hold overlapping effective ranges for one engine (%) -- one usage row must never match two price rows', v_pair
      using errcode = 'CLR10';
  end if;
  return null;
end $$;
revoke all on function clara._tf_llm_price_no_overlap() from public;
create trigger t_llm_price_table_no_overlap after insert or update or delete
  on clara.llm_price_table for each statement execute function clara._tf_llm_price_no_overlap();
-- The house no-truncate guard. NOTE the deliberate absence of clara._tf_append_only: a
-- price row is IMMUTABLE-AND-SUPERSEDE (law 16), and superseding means UPDATEing the
-- prior open row's effective_to in the same transaction as the new INSERT. An append-only
-- trigger would forbid exactly that lawful act. This mirrors sst_threshold_schedule,
-- which carries the no-truncate guard and no append-only guard for the same reason.
create trigger t_llm_price_table_no_truncate before truncate
  on clara.llm_price_table for each statement execute function clara._tf_no_truncate();
alter table clara.llm_price_table enable row level security;
alter table clara.llm_price_table force row level security;
create policy p_llm_price_table_owner on clara.llm_price_table
  for all to clara_fn_owner using (true) with check (true);

-- -------------------------------------------------------------------------------------
-- SECTION 3b -- THE FIRST EFFECTIVE-DATED SEED (R-L19: this is the whole price machine).
--
-- SOURCE, FETCHED TODAY: OpenAI's official API pricing page,
--   https://developers.openai.com/api/docs/pricing   (fetched 2026-08-23)
-- Standard-tier, SHORT-CONTEXT rates, verbatim from that page on that date:
--   gpt-5.6-terra : input $2.00 / output $12.00 per 1M tokens
--   gpt-5.6-sol   : input $4.00 / output $20.00 per 1M tokens
-- and the page also states: "GPT-5.6 Sol's promotional pricing is available at least
-- through November 21, 2026."
--
-- THREE THINGS THIS SEED DOES NOT PRETEND (law 22 -- a visible record must not lie):
--
-- (1) ONE RATE PAIR PER ROW. The same page lists LONG-CONTEXT rates (terra $4.00/$18.00,
--     sol $8.00/$30.00) and CACHED-INPUT rates (terra $0.20, sol $0.40) per 1M tokens.
--     This table has no context-tier and no cache dimension, and the ledger records no
--     cache split, so a long-context or cache-heavy call is UNDERSTATED by these rows.
--     Every row's source_note says so; modelling the tiers is a schema change and its own
--     item, not something to smuggle in behind a seed.
--
-- (2) THE SOL ROW IS CLOSED AT THE PUBLISHED GUARANTEE. "at least through November 21,
--     2026" is a floor, not a term: past that date the price is UNKNOWN. Carrying a
--     promotional rate forward past its published guarantee would be a guess wearing a
--     money number's clothes, so the row ends 2026-11-21 and calls after it read as
--     UNPRICED -- the tripwire firing, which is the correct visible state.
--
-- (3) effective_from IS THE DAY THE PAGE WAS READ, not a backdated guess at when the
--     price started. Usage rows recorded before 2026-08-23 therefore price as UNPRICED.
--     That is the honest state of our knowledge, not a gap to paper over.
--
-- WHY FIVE ROWS FOR TWO MODELS. SS3.6's join is an EXACT STRING EQUALITY on engine_id, and
-- clara.llm_usage_events.engine_id is the TASK's own engine SNAPSHOT stamp, not a bare
-- model id: the live lanes stamp 'llm-openai:gpt-5.6-terra:v2' (witnessFacts_v2, the live
-- registry tip) and 'llm-openai:gpt-5.6-terra:stmt-witness-v1' (statementFacts_v2), with
-- 'llm-openai:gpt-5.6-terra:v1' on the historical rows witnessFacts_v1 wrote. The chat
-- retrofit (SS3.8) will instead pass the BARE model id. Seeding only the bare ids would
-- price zero live rows. Each snapshot row is self-evidencing -- the stamp CONTAINS the
-- model whose published price it carries -- and the mapping is DATA, reviewed in this PR,
-- never a parse rule inferred at read time. An engine stamp that is not seeded (a model
-- override, a new lane) stays UNPRICED and shows up in the rollup's unpriced count. That
-- is the design's tripwire and it is deliberately not pattern-matched away.
-- -------------------------------------------------------------------------------------
insert into clara.llm_price_table
  (engine_id, effective_from, effective_to,
   input_price_cents_per_million_tokens, output_price_cents_per_million_tokens,
   source_note, source_urls)
values
  ('gpt-5.6-terra', date '2026-08-23', null, 200, 1200,
   'OpenAI official API pricing page, fetched 2026-08-23: gpt-5.6-terra standard tier, SHORT CONTEXT, input $2.00 / output $12.00 per 1M tokens. UNDERSTATES a long-context call (published $4.00/$18.00) and a cache-hit call (published cached input $0.20): this table carries one rate pair per row and the ledger records no context or cache split.',
   '["https://developers.openai.com/api/docs/pricing"]'::jsonb),

  ('llm-openai:gpt-5.6-terra:v1', date '2026-08-23', null, 200, 1200,
   'Engine SNAPSHOT stamp of the witnessFacts v1 lane (witnessFacts.v1.services.mjs: llm-openai:<model>:v1, model default gpt-5.6-terra). Priced at gpt-5.6-terra''s published rate -- OpenAI official API pricing page, fetched 2026-08-23, standard tier, SHORT CONTEXT, input $2.00 / output $12.00 per 1M tokens; long-context and cached-input calls are understated.',
   '["https://developers.openai.com/api/docs/pricing"]'::jsonb),

  ('llm-openai:gpt-5.6-terra:v2', date '2026-08-23', null, 200, 1200,
   'Engine SNAPSHOT stamp of the witnessFacts v2 lane, the live registry tip (witnessFacts.v2.services.mjs: llm-openai:<model>:v2, model default gpt-5.6-terra). Priced at gpt-5.6-terra''s published rate -- OpenAI official API pricing page, fetched 2026-08-23, standard tier, SHORT CONTEXT, input $2.00 / output $12.00 per 1M tokens; long-context and cached-input calls are understated.',
   '["https://developers.openai.com/api/docs/pricing"]'::jsonb),

  ('llm-openai:gpt-5.6-terra:stmt-witness-v1', date '2026-08-23', null, 200, 1200,
   'Engine SNAPSHOT stamp of the statementFacts v2 witness lane, the live registry tip (statementFacts.v2.services.mjs: llm-openai:<model>:stmt-witness-v1, model default gpt-5.6-terra). Priced at gpt-5.6-terra''s published rate -- OpenAI official API pricing page, fetched 2026-08-23, standard tier, SHORT CONTEXT, input $2.00 / output $12.00 per 1M tokens; long-context and cached-input calls are understated.',
   '["https://developers.openai.com/api/docs/pricing"]'::jsonb),

  ('gpt-5.6-sol', date '2026-08-23', date '2026-11-21', 400, 2000,
   'OpenAI official API pricing page, fetched 2026-08-23: gpt-5.6-sol standard tier, SHORT CONTEXT, input $4.00 / output $20.00 per 1M tokens. CLOSED at 2026-11-21 because the same page states "GPT-5.6 Sol''s promotional pricing is available at least through November 21, 2026" -- a floor, not a term, so the rate past that day is unknown and a call there reads UNPRICED rather than carrying a promotional number forward. UNDERSTATES a long-context call (published $8.00/$30.00) and a cache-hit call (published cached input $0.40).',
   '["https://developers.openai.com/api/docs/pricing"]'::jsonb);

-- =====================================================================================
-- SECTION 4 -- clara.llm_usage_events_priced: THE SPEND EVALUATOR (design SS3.6).
--
-- This is the "versioned deterministic evaluator ... from DB-owned inputs" hard constraint
-- 2 / law 1 asks for: the CALCULATION lives in ONE named, reviewable SQL object, not in
-- scattered inline arithmetic in a dashboard query. No model-generated numeral enters it;
-- both factors are DB-owned (the token counts from the ledger, the rates from the seeded
-- policy table).
--
-- THE JOIN IS ANCHORED TO UTC EXPLICITLY. created_at is timestamptz and effective_from /
-- effective_to are date; comparing them directly makes Postgres cast the DATE to
-- timestamptz at midnight IN THE CALLER'S SESSION TimeZone, so one boundary-day call
-- would price against September for a UTC session and August for an Asia/Kuala_Lumpur one
-- -- two money numbers out of one deterministic evaluator, with no error. Nothing in this
-- repo pins a session TimeZone, so the cast is written here, not assumed.
--
-- A row with no matching price yields spend_cents NULL -- never zero, never the nearest
-- neighbour's rate. The LEFT JOIN is what makes the unpriced row still APPEAR (an inner
-- join would hide the very rows the tripwire exists to count).
--
-- THE VIEW IS INVOKER-EXECUTED (security_invoker = true) -- REVERSING Annex A D16, on a
-- measurement rather than an argument. L19 built this table's exact posture on a rig (RLS
-- + FORCE, owner policy USING (true), human policy USING (firm_id = jwt_firm()), direct
-- SELECT grant), put an own-firm, a foreign-firm and a firm-less row in it, and read a
-- plain owner-executed view over it as a real firm-A bookkeeper: it returned ALL THREE
-- ROWS. FORCE RLS does not save an owner-executed view -- the view runs as its OWNER, and
-- the owner's own policy is USING (true), so the tenant boundary is crossed by the default
-- behaviour, the one you get by not thinking about it. `security_invoker = true` closed it
-- completely in the same probe.
--
-- D16's ground for the owner form was that clara_authenticated would take 42501 on
-- llm_price_table under invoker semantics. That is TRUE and is now the DESIRED behaviour,
-- not a defect: no role is granted anything on this view (a closed-world catalog census in
-- the tail and a behavioural 42501 cell in the battery both hold that door shut), so the
-- only reader is SECTION 5's SECURITY DEFINER function -- whose effective user IS
-- clara_fn_owner, so the invoker setting changes nothing about how the rollup reads, and
-- the rollup's own firm predicate remains the confinement. What the setting buys is that
-- the day someone grants this view to a tenant role, the read fails CLOSED instead of
-- leaking every firm's spend.
-- =====================================================================================
create view clara.llm_usage_events_priced with (security_invoker = true) as
select
  u.id, u.firm_id, u.scope, u.call_kind, u.client_id, u.triggering_actor, u.agent_task_id,
  u.via_wake_kind, u.document_id, u.task_id, u.channel, u.engine_id, u.prompt_hash,
  u.input_tokens, u.output_tokens, u.duration_ms, u.outcome, u.created_at,
  p.effective_from as price_effective_from,
  p.input_price_cents_per_million_tokens,
  p.output_price_cents_per_million_tokens,
  case when p.engine_id is null then null
       else round((coalesce(u.input_tokens, 0)::numeric  * p.input_price_cents_per_million_tokens
                 + coalesce(u.output_tokens, 0)::numeric * p.output_price_cents_per_million_tokens)
                  / 1000000)::bigint
  end as spend_cents
from clara.llm_usage_events u
left join clara.llm_price_table p
  on p.engine_id = u.engine_id
 and (u.created_at at time zone 'utc')::date >= p.effective_from
 and (p.effective_to is null or (u.created_at at time zone 'utc')::date <= p.effective_to);

-- =====================================================================================
-- SECTION 5 -- clara.get_llm_usage_summary: THE MONTHLY ROLLUP (design SS3.7).
--
-- SECURITY DEFINER, owned by clara_fn_owner, EXECUTE to clara_authenticated. Under DEFINER
-- the caller's RLS no longer narrows anything, so p_firm IS the privilege boundary and the
-- body's own first statement is the wall.
--
-- client_id resolution follows SS3.1's RULE -- a stored client_id when the lane had one,
-- otherwise the document's client joined at READ time, never a trigger-written copy that
-- can drift (Annex A D4) -- but NOT its cited surface.
--
-- MEASURED DIVERGENCE (rig replay, frontier 0102): SS3.1 and D4 both resolve through
-- "documents.client_id (nullable, 0003:67)". That column was real when 0003 was written
-- and is GONE from the live table: Slice 5 moved document-to-client attribution out of
-- clara.documents and into clara.document_filings, and the live clara.documents carries
-- 21 columns, none of them client_id. A join written from the design's cite raises
-- 42703 column d.client_id does not exist -- which is how this was found.
--
-- The live surface is ONE-TO-MANY, not one nullable column: the partial unique index
-- uq_document_filings_active is on (document_id, client_id) WHERE retired_at is null, so
-- one document may carry several ACTIVE filings to different clients. There is therefore
-- no such thing as "the" document's client in general, and picking one with a LIMIT 1
-- would publish an arbitrary choice as a fact (law 22). This resolves fail-closed:
-- EXACTLY ONE active filing resolves the client; zero or several resolve to NULL and the
-- spend rolls up as unattributed -- which SS3.1 itself calls visibility, not a gap to
-- paper over.
--
-- unpriced_calls is PUBLISHED, not hidden. It is the tripwire R-L19 keeps in place of the
-- approval door: a day with no effective price row reads honestly empty rather than
-- guessing, and the count says how much of the period that covers.
-- =====================================================================================
create function clara.get_llm_usage_summary(p_firm uuid, p_period date, p_client uuid default null)
  returns table(scope text, call_kind text, calls bigint, input_tokens bigint, output_tokens bigint,
                priced_calls bigint, unpriced_calls bigint, spend_cents bigint)
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_from date := date_trunc('month', p_period)::date;
  v_to   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
begin
  if p_firm is distinct from clara.jwt_firm() then
    raise exception 'usage summary is readable for your own firm only'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  -- TWO BUCKETS, NEVER ONE FIGURE. A platform call is real spend and must be visible
  -- (R-L10: "a NULL firm is a platform call, never an unmetered one"), but adding it to a
  -- firm's total would bill one tenant for a global act -- a lie in a money number (law
  -- 22). It is returned as its own scope='platform' rows, which every caller must add up
  -- deliberately or not at all. The firm arm is UNCHANGED from before this fold: it is
  -- still exactly `scope='firm' and firm_id = p_firm`, so no foreign firm's row can enter
  -- either bucket -- the battery reads this as firm B and counts firm A's rows at zero.
  -- p_client narrows to a firm's client, so it EXCLUDES the platform bucket by
  -- construction: a firm-less call cannot be one client's, and pretending otherwise would
  -- re-import the misattribution this split exists to prevent.
  return query
  select v.scope,
         v.call_kind,
         count(*)::bigint,
         coalesce(sum(v.input_tokens), 0)::bigint,
         coalesce(sum(v.output_tokens), 0)::bigint,
         count(v.spend_cents)::bigint,
         (count(*) - count(v.spend_cents))::bigint,
         coalesce(sum(v.spend_cents), 0)::bigint
    from (select pv.scope, pv.call_kind, pv.input_tokens, pv.output_tokens, pv.spend_cents,
                 coalesce(pv.client_id, f.filed_client) as resolved_client
            from clara.llm_usage_events_priced pv
            left join lateral (
              -- EXACTLY ONE active filing resolves; zero or several resolve to NULL.
              select case when count(distinct df.client_id) = 1
                          then (array_agg(distinct df.client_id))[1] end as filed_client
                from clara.document_filings df
               where df.document_id = pv.document_id and df.firm_id = pv.firm_id
                 and df.retired_at is null
            ) f on pv.document_id is not null
           where ((pv.scope = 'firm' and pv.firm_id = p_firm)
                  or (pv.scope = 'platform' and p_client is null))
             and (pv.created_at at time zone 'utc')::date between v_from and v_to) v
   where p_client is null or v.resolved_client = p_client
   group by v.scope, v.call_kind
   order by v.scope, v.call_kind;
end $$;
revoke all on function clara.get_llm_usage_summary(uuid,date,uuid) from public;
grant execute on function clara.get_llm_usage_summary(uuid,date,uuid) to clara_authenticated;

reset role;

-- =====================================================================================
-- SECTION 6 -- TAIL CENSUS. Re-reads the live catalog and PROVES, behaviourally where a
-- behaviour is what is claimed. A tail that only says OK has proven nothing.
-- =====================================================================================
do $tail$
declare
  v_sha text; v_n int; v_id uuid; v_spend bigint; v_ok boolean;
  v_firm uuid; v_doc uuid; v_task uuid;
begin
  -- (6.1) THE RESHAPE LANDED, and all four relaxations really are relaxed.
  select count(*)::int into v_n from pg_attribute
    where attrelid = 'clara.llm_usage_events'::regclass and not attisdropped and attnum > 0
      and attname in ('call_kind','client_id','triggering_actor','agent_task_id','via_wake_kind','scope');
  if v_n <> 6 then
    raise exception 'f_a9 tail: expected 6 new columns on llm_usage_events, found %', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid = 'clara.llm_usage_events'::regclass and attnotnull
                and attname in ('firm_id','document_id','task_id','channel')) then
    raise exception 'f_a9 tail: one of firm_id / document_id / task_id / channel is still NOT NULL' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.llm_usage_events'::regclass and attname = 'scope' and attnotnull) then
    raise exception 'f_a9 tail: scope is not NOT NULL -- the paired CHECK would be defeatable by a NULL' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.llm_usage_events'::regclass and attname = 'call_kind' and attnotnull) then
    raise exception 'f_a9 tail: call_kind is not NOT NULL' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
    where conrelid = 'clara.llm_usage_events'::regclass
      and conname in ('ck_llm_usage_events_call_kind','ck_llm_usage_events_extraction_shape',
                      'ck_llm_usage_events_platform_shape','ck_llm_usage_events_scope',
                      'ck_llm_usage_events_scope_firm',
                      'fk_llm_usage_events_firm','fk_llm_usage_events_client',
                      'fk_llm_usage_events_actor','fk_llm_usage_events_agent_task');
  if v_n <> 9 then
    raise exception 'f_a9 tail: expected 5 new CHECKs + 4 new FKs on llm_usage_events, found % of 9', v_n using errcode = 'CLR10';
  end if;
  -- The FKs must carry NO delete action: confdeltype 'a' = NO ACTION. A cascade here would
  -- let a parent delete erase evidence of spend that really happened.
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.llm_usage_events'::regclass and contype = 'f' and confdeltype <> 'a') then
    raise exception 'f_a9 tail: an llm_usage_events FK carries a delete action other than NO ACTION' using errcode = 'CLR10';
  end if;

  -- (6.2) THE TWO LIVE WRITER BODIES ARE STILL BYTE-IDENTICAL, and the probe string both
  -- frozen closures use still resolves. This is the whole no-D1 claim, re-measured.
  if (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p
       where p.oid = 'clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)'::regprocedure)
     <> '9d9bc3ce7f97d2886311f10f524edabe3a152ba7de69b47740e42abbe915ff44' then
    raise exception 'f_a9 tail: record_llm_usage_event MOVED -- this file must leave it byte-identical' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p
       where p.oid = 'clara.persist_witness_facts(uuid,jsonb,jsonb,integer)'::regprocedure)
     <> 'e3264e052061ce41846fd882bdb1fe38fdfca56af50d46a0ae80b1c68da75539' then
    raise exception 'f_a9 tail: persist_witness_facts MOVED -- this file must leave it byte-identical' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is null then
    raise exception 'f_a9 tail: the frozen closures'' capability probe string no longer resolves' using errcode = 'CLR10';
  end if;

  -- (6.3) BEHAVIOURAL: the live channel CHECK really does admit NULL. Proven by making the
  -- table accept one, not by reading the constraint's text (spelling is not identity).
  -- Rolled back inside a subtransaction -- this census leaves no row behind.
  begin
    select f.id into v_firm from clara.firms f limit 1;
    if v_firm is null then
      raise notice 'f_a9 tail: (6.3) SKIPPED -- no firm row on this database to build a probe against';
    else
      insert into clara.llm_usage_events(firm_id, call_kind, channel, engine_id, outcome)
        values (v_firm, 'chat', null, 'f-a9-tail-probe', 'success') returning id into v_id;
      raise exception 'f_a9_tail_rollback_63';
    end if;
  exception
    when raise_exception then
      if sqlerrm <> 'f_a9_tail_rollback_63' then raise; end if;
      raise notice 'f_a9 tail: (6.3) PROVEN -- a NULL-channel, NULL-document, NULL-task chat row INSERTS; the live channel CHECK admits NULL and the relaxations are real. Probe rolled back.';
  end;

  -- (6.4) BEHAVIOURAL: the extraction-shape wall REFUSES. A wall's proof is a cell that
  -- makes it say NO -- a document_extraction row missing its channel must not insert.
  if v_firm is not null then
    v_ok := false;
    begin
      insert into clara.llm_usage_events(firm_id, call_kind, channel, engine_id, outcome)
        values (v_firm, 'document_extraction', null, 'f-a9-tail-probe', 'success');
      raise exception 'f_a9_tail_wall_open_64';
    exception
      when check_violation then v_ok := true;
      when raise_exception then
        if sqlerrm = 'f_a9_tail_wall_open_64' then
          raise exception 'f_a9 tail: (6.4) the extraction-shape wall did NOT refuse a channel-less document_extraction row' using errcode = 'CLR10';
        end if;
        raise;
    end;
    if not v_ok then
      raise exception 'f_a9 tail: (6.4) the extraction-shape wall did not raise a check_violation' using errcode = 'CLR10';
    end if;
    raise notice 'f_a9 tail: (6.4) PROVEN -- a document_extraction row with a NULL channel is REFUSED by ck_llm_usage_events_extraction_shape.';

    -- (6.5) BEHAVIOURAL: an unregistered call_kind is refused by the roster CHECK, which
    -- is the fail-closed default for a lane that forgets to register its kind.
    v_ok := false;
    begin
      insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
        values (v_firm, 'not_a_registered_kind', 'f-a9-tail-probe', 'success');
      raise exception 'f_a9_tail_wall_open_65';
    exception
      when check_violation then v_ok := true;
      when raise_exception then
        if sqlerrm = 'f_a9_tail_wall_open_65' then
          raise exception 'f_a9 tail: (6.5) the call-kind roster did NOT refuse an unregistered kind' using errcode = 'CLR10';
        end if;
        raise;
    end;
    if not v_ok then
      raise exception 'f_a9 tail: (6.5) the call-kind roster did not raise a check_violation' using errcode = 'CLR10';
    end if;
    raise notice 'f_a9 tail: (6.5) PROVEN -- an unregistered call_kind is REFUSED by ck_llm_usage_events_call_kind.';
  end if;

  -- (6.6) THE NEW DOOR installed with the right privilege shape, and PUBLIC cannot reach it.
  if to_regprocedure('clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)') is null then
    raise exception 'f_a9 tail: record_agent_usage_event did not install' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)'::regprocedure
        and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a9 tail: record_agent_usage_event is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid = 'clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)'::regprocedure
        and a.grantee = 'clara_runtime'::regrole and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a9 tail: record_agent_usage_event is not EXECUTE-granted to clara_runtime' using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where f.oid = 'clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)'::regprocedure
        and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a9 tail: PUBLIC executes record_agent_usage_event' using errcode = 'CLR10';
  end if;
  -- BEHAVIOURAL: the one-call-kind-one-door wall REFUSES document_extraction.
  v_ok := false;
  begin
    perform clara.record_agent_usage_event(p_firm := coalesce(v_firm, gen_random_uuid()),
      p_call_kind := 'document_extraction', p_engine_id := 'f-a9-tail-probe', p_outcome := 'success');
    raise exception 'f_a9_tail_wall_open_66';
  exception
    when sqlstate 'CLR10' then v_ok := true;
    when raise_exception then
      if sqlerrm = 'f_a9_tail_wall_open_66' then
        raise exception 'f_a9 tail: (6.6) record_agent_usage_event did NOT refuse call_kind document_extraction' using errcode = 'CLR10';
      end if;
      raise;
  end;
  if not v_ok then
    raise exception 'f_a9 tail: (6.6) record_agent_usage_event did not refuse document_extraction with CLR10' using errcode = 'CLR10';
  end if;
  raise notice 'f_a9 tail: (6.6) PROVEN -- record_agent_usage_event REFUSES call_kind document_extraction (one call-kind, one door).';

  -- (6.7) THE PRICE TABLE: posture, walls, and the seed actually present.
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'clara.llm_price_table'::regclass) then
    raise exception 'f_a9 tail: llm_price_table is missing ENABLE/FORCE row level security' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid = 'clara.llm_price_table'::regclass;
  if v_n <> 1 then
    raise exception 'f_a9 tail: llm_price_table does not carry exactly 1 (owner) policy (got %)', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'clara' and table_name = 'llm_price_table' and grantee <> 'clara_fn_owner') then
    raise exception 'f_a9 tail: llm_price_table carries a grant to a role other than clara_fn_owner -- D5 says typed function only' using errcode = 'CLR10';
  end if;
  -- THE OVERLAP WALL'S TRIGGER FUNCTION IS REACHABLE BY NO ROLE, PUBLIC included -- the
  -- 0038 trigger-fn revoke idiom (_tf_bank_statement_transition et al.), asserted here
  -- because a trigger function otherwise carries PostgreSQL's default PUBLIC EXECUTE.
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'clara._tf_llm_price_no_overlap()'::regprocedure
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a9 tail: PUBLIC executes clara._tf_llm_price_no_overlap -- the trigger fn was not revoked from PUBLIC' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.llm_price_table;
  if v_n <> 5 then
    raise exception 'f_a9 tail: expected the 5 seeded price rows, found %', v_n using errcode = 'CLR10';
  end if;
  -- BEHAVIOURAL: the overlap wall REFUSES. Proven by attempting an overlapping row, not by
  -- reading the trigger's source.
  v_ok := false;
  begin
    insert into clara.llm_price_table(engine_id, effective_from, effective_to,
        input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
      values ('gpt-5.6-terra', date '2026-09-01', date '2026-09-30', 999, 999, 'f-a9 tail overlap probe');
    raise exception 'f_a9_tail_wall_open_67';
  exception
    when sqlstate 'CLR10' then v_ok := true;
    when raise_exception then
      if sqlerrm = 'f_a9_tail_wall_open_67' then
        raise exception 'f_a9 tail: (6.7) an OVERLAPPING price range was accepted -- one usage row could match two price rows' using errcode = 'CLR10';
      end if;
      raise;
  end;
  if not v_ok then
    raise exception 'f_a9 tail: (6.7) the overlap wall did not refuse with CLR10' using errcode = 'CLR10';
  end if;
  -- BEHAVIOURAL: the inverted-range CHECK refuses.
  v_ok := false;
  begin
    insert into clara.llm_price_table(engine_id, effective_from, effective_to,
        input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
      values ('f-a9-tail-probe-engine', date '2026-09-30', date '2026-09-01', 1, 1, 'f-a9 tail inverted probe');
    raise exception 'f_a9_tail_wall_open_67b';
  exception
    when check_violation then v_ok := true;
    when raise_exception then
      if sqlerrm = 'f_a9_tail_wall_open_67b' then
        raise exception 'f_a9 tail: (6.7b) an INVERTED price range was accepted' using errcode = 'CLR10';
      end if;
      raise;
  end;
  if not v_ok then
    raise exception 'f_a9 tail: (6.7b) ck_llm_price_range did not refuse an inverted range' using errcode = 'CLR10';
  end if;
  raise notice 'f_a9 tail: (6.7) PROVEN -- llm_price_table is FORCE-RLS with exactly one owner policy and zero app-role grants; 5 seeded rows; an overlapping range and an inverted range are both REFUSED.';

  -- (6.8) THE EVALUATOR: a priced row and an unpriced row, both computed for real.
  if v_firm is not null then
    begin
      insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
        values (v_firm, 'chat', 'llm-openai:gpt-5.6-terra:v2', 'success', 1000000, 1000000,
                timestamptz '2026-08-24 03:00:00+00') returning id into v_id;
      select pv.spend_cents into v_spend from clara.llm_usage_events_priced pv where pv.id = v_id;
      -- 1M input @200c/1M + 1M output @1200c/1M = 1400 cents.
      if v_spend is distinct from 1400::bigint then
        raise exception 'f_a9 tail: (6.8) the evaluator priced a seeded engine at % cents, expected 1400', coalesce(v_spend::text, 'NULL') using errcode = 'CLR10';
      end if;
      insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
        values (v_firm, 'chat', 'llm-openai:gpt-5.6-terra:NOT-SEEDED', 'success', 1000000, 1000000,
                timestamptz '2026-08-24 03:00:00+00') returning id into v_id;
      select pv.spend_cents into v_spend from clara.llm_usage_events_priced pv where pv.id = v_id;
      if v_spend is not null then
        raise exception 'f_a9 tail: (6.8) an UNSEEDED engine stamp priced at % cents -- it must read unpriced, never a guess', v_spend using errcode = 'CLR10';
      end if;
      -- The sol row is closed at its published guarantee: a call after it is unpriced.
      insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
        values (v_firm, 'chat', 'gpt-5.6-sol', 'success', 1000000, 1000000,
                timestamptz '2026-11-22 03:00:00+00') returning id into v_id;
      select pv.spend_cents into v_spend from clara.llm_usage_events_priced pv where pv.id = v_id;
      if v_spend is not null then
        raise exception 'f_a9 tail: (6.8) a call PAST the sol row''s published effective_to priced at % cents -- a price must never carry forward', v_spend using errcode = 'CLR10';
      end if;
      raise exception 'f_a9_tail_rollback_68';
    exception
      when raise_exception then
        if sqlerrm <> 'f_a9_tail_rollback_68' then raise; end if;
        raise notice 'f_a9 tail: (6.8) PROVEN -- the evaluator prices a seeded engine stamp at the seeded rate (1400c for 1M+1M on gpt-5.6-terra), returns NULL for an UNSEEDED stamp, and returns NULL for a day past a closed row''s effective_to. All probe rows rolled back.';
    end;
  end if;

  -- (6.8b) THE SCOPE PAIRING, BEHAVIOURALLY, IN BOTH DIRECTIONS. This is the wall that
  -- makes the recut read policy safe, so it is proven by making it REFUSE and by making it
  -- ADMIT -- a wall that only ever refuses could be refusing for the wrong reason.
  v_ok := false;
  begin
    -- THE FORGOTTEN-firm_id CASE: scope left at its 'firm' default, firm_id never set.
    insert into clara.llm_usage_events(call_kind, engine_id, outcome)
      values ('chat','f-a9-tail-probe','success');
    raise exception 'f_a9_tail_wall_open_68b';
  exception
    when check_violation then v_ok := true;
    when raise_exception then
      if sqlerrm = 'f_a9_tail_wall_open_68b' then
        raise exception 'f_a9 tail: (6.8b) a row with NO firm_id and scope=''firm'' was ACCEPTED -- the read policy''s platform arm is then defeatable by an omission' using errcode = 'CLR10';
      end if;
      raise;
  end;
  if not v_ok then
    raise exception 'f_a9 tail: (6.8b) the scope pairing did not refuse a firm-less scope=''firm'' row' using errcode = 'CLR10';
  end if;
  -- And the mirror: a firm_id present with scope='platform' is equally refused.
  if v_firm is not null then
    v_ok := false;
    begin
      insert into clara.llm_usage_events(firm_id, scope, call_kind, engine_id, outcome)
        values (v_firm,'platform','chat','f-a9-tail-probe','success');
      raise exception 'f_a9_tail_wall_open_68c';
    exception
      when check_violation then v_ok := true;
      when raise_exception then
        if sqlerrm = 'f_a9_tail_wall_open_68c' then
          raise exception 'f_a9 tail: (6.8b) a row claiming scope=''platform'' while naming a firm was ACCEPTED' using errcode = 'CLR10';
        end if;
        raise;
    end;
    if not v_ok then
      raise exception 'f_a9 tail: (6.8b) the scope pairing did not refuse a firm-bearing platform row' using errcode = 'CLR10';
    end if;
  end if;
  -- The ADMIT direction: a properly declared platform row inserts, and rolls back here.
  begin
    insert into clara.llm_usage_events(scope, call_kind, engine_id, outcome)
      values ('platform','tier1_policy_fetch','f-a9-tail-probe','success');
    raise exception 'f_a9_tail_rollback_68d';
  exception
    when raise_exception then
      if sqlerrm <> 'f_a9_tail_rollback_68d' then raise; end if;
      raise notice 'f_a9 tail: (6.8b) PROVEN -- a DECLARED platform row (scope=''platform'', no firm) inserts; a firm-less scope=''firm'' row and a firm-bearing scope=''platform'' row are both REFUSED. R-L10 records the platform call; the omission fails closed.';
  end;

  -- (6.8e) THE RECUT READ POLICY, as a catalog differential. The BEHAVIOURAL proof (a
  -- foreign bookkeeper sees the platform row and does NOT see a sibling firm's row) needs
  -- a seeded firm and a real clara_authenticated session, which a migration running before
  -- any seed cannot build -- so it lives in the battery, where it can never silently skip.
  -- What is checkable HERE is that the predicate is no longer the 0094 one: a differential
  -- against the exact superseded text, not a substring match on the new one.
  select count(*)::int into v_n from pg_policy
    where polrelid = 'clara.llm_usage_events'::regclass and polcmd = 'r'
      and 'clara_authenticated'::regrole = any(polroles);
  if v_n <> 1 then
    raise exception 'f_a9 tail: llm_usage_events does not carry exactly one clara_authenticated SELECT policy (got %)', v_n using errcode = 'CLR10';
  end if;
  if (select pg_get_expr(polqual, polrelid) from pg_policy
       where polrelid = 'clara.llm_usage_events'::regclass and polname = 'p_llm_usage_events_human')
     = '(firm_id = jwt_firm())' then
    raise exception 'f_a9 tail: p_llm_usage_events_human is STILL 0094''s predicate -- every platform row would be invisible to every human' using errcode = 'CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'clara.llm_usage_events'::regclass) then
    raise exception 'f_a9 tail: the policy recut disturbed ENABLE/FORCE row level security' using errcode = 'CLR10';
  end if;

  -- (6.8f) THE PRICED VIEW IS INVOKER-EXECUTED AND REACHABLE BY NO APP ROLE. An
  -- owner-executed view over this table LEAKS every firm's rows to any grantee (measured
  -- on a rig by L19: FORCE RLS does not help, because the view runs as the owner and the
  -- owner policy is USING (true)). Two independent guards, both asserted: the setting, and
  -- a CLOSED-WORLD census that nothing but the owner holds any privilege on it.
  if not exists (select 1 from pg_class c
                  where c.oid = 'clara.llm_usage_events_priced'::regclass
                    and c.reloptions @> array['security_invoker=true']) then
    raise exception 'f_a9 tail: llm_usage_events_priced is not security_invoker=true -- an owner-executed view over this table crosses the tenant boundary' using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'clara' and table_name = 'llm_usage_events_priced'
                and grantee <> 'clara_fn_owner') then
    raise exception 'f_a9 tail: llm_usage_events_priced carries a grant to a role other than clara_fn_owner' using errcode = 'CLR10';
  end if;

  -- (6.9) THE ROLLUP: installed, DEFINER, granted to clara_authenticated, and its firm
  -- wall REFUSES. This session is the owner (jwt_firm() is NULL here), so naming any firm
  -- must be refused -- which is the wall doing its job, measured rather than assumed.
  if to_regprocedure('clara.get_llm_usage_summary(uuid,date,uuid)') is null then
    raise exception 'f_a9 tail: get_llm_usage_summary did not install' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.get_llm_usage_summary(uuid,date,uuid)'::regprocedure
        and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a9 tail: get_llm_usage_summary is not a SECURITY DEFINER owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid = 'clara.get_llm_usage_summary(uuid,date,uuid)'::regprocedure
        and a.grantee = 'clara_authenticated'::regrole and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a9 tail: get_llm_usage_summary is not EXECUTE-granted to clara_authenticated' using errcode = 'CLR10';
  end if;
  v_ok := false;
  begin
    perform * from clara.get_llm_usage_summary(coalesce(v_firm, gen_random_uuid()), date '2026-08-01');
    raise exception 'f_a9_tail_wall_open_69';
  exception
    when sqlstate 'CLR11' then v_ok := true;
    when raise_exception then
      if sqlerrm = 'f_a9_tail_wall_open_69' then
        raise exception 'f_a9 tail: (6.9) get_llm_usage_summary did NOT refuse a p_firm that is not the session''s jwt_firm()' using errcode = 'CLR10';
      end if;
      raise;
  end;
  if not v_ok then
    raise exception 'f_a9 tail: (6.9) get_llm_usage_summary''s firm wall did not raise CLR11' using errcode = 'CLR10';
  end if;
  raise notice 'f_a9 tail: (6.9) PROVEN -- get_llm_usage_summary is a clara_fn_owner DEFINER, EXECUTE-granted to clara_authenticated, and REFUSES (CLR11) a p_firm that is not the session''s own jwt_firm().';

  -- (6.10) THE POST-RESHAPE SHAPE SHA -- the named value a later lane's prestate probe
  -- (F-A7/PR-5rho) can require, so its absence aborts loudly instead of reading as fine.
  v_sha := encode(sha256(convert_to(
    (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
                       || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), E'\n' order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'clara.llm_usage_events'::regclass and a.attnum > 0 and not a.attisdropped)
    || E'\n--\n' ||
    (select string_agg(conname || ' ' || pg_get_constraintdef(oid), E'\n' order by conname)
       from pg_constraint where conrelid = 'clara.llm_usage_events'::regclass)
  , 'UTF8')), 'hex');

  raise notice 'f_a9_llm_usage_reshape tail: OK -- llm_usage_events reshaped (4 NOT NULLs relaxed incl. firm_id per R-L10, 6 columns added incl. the scope discriminator, 5 CHECKs + 4 NO-ACTION FKs added; the firm FK restores the binding the relaxed composite FKs used to carry, and the scope biconditional makes a forgotten firm_id a write-time refusal rather than a visibility decision nobody made; the human read policy is recut scope-aware and the priced view is security_invoker=true with no app-role grant; POST-shape sha256 %); both live writer bodies byte-unmoved and the frozen closures'' probe string still resolves; record_agent_usage_event installed (definer, search_path pinned, EXECUTE to clara_runtime only, no PUBLIC, NO SPEND REFUSAL); llm_price_table installed FORCE-RLS owner-only with 5 effective-dated seed rows from OpenAI''s official pricing page fetched 2026-08-23; llm_usage_events_priced installed (security_invoker=true, UTC-anchored join, NULL for an unpriced row); get_llm_usage_summary installed (definer, jwt_firm wall). No table in workflow/graphile_worker/spike touched. NO D1 quiesce: this file replaces no live body.', v_sha;
end
$tail$;
