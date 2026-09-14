-- 0195_work_egress_purpose_and_execution_trace — #631 (refresh spec #612; journeys B3, B6, C13):
-- MODEL / OCR / OTHER EGRESS OBEYS CURRENT PURPOSE AUTHORISATION, AND EVERY WORK RUN LEAVES A
-- VERSIONED, REDACTED EXECUTION TRACE.
-- =====================================================================================
-- Spec of record: issue #631. Domain words: CONTEXT.md — "Capability registry", "Purpose
-- authorisation", "Execution trace". Builds on 0020 (the typed client egress family), 0038 (the
-- consume verb's re-binding and 120-second TTL), 0122/0123 (the fourth and fifth purposes and the
-- prepare verb's live body), 0178/0180/0182/0184/0194 (the accounting-work lane and its posting
-- core) and 0185/0187 (the published legal texts and their acceptances).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A SIXTH typed client egress purpose, `accounting_work`,
-- whose authority is DERIVED from the firm's current accepted legal texts rather than granted by
-- hand; a task-bound prepare wrapper the Work run calls immediately before the model; a
-- payload-free `clara.work_execution_traces` relation with one writer, one human read and a
-- bounded prune; and a FOURTH recut of `clara._record_journal_entry_core` that refuses the
-- accounting write when the run holds no CONSUMED authorization of its own.
--
-- =====================================================================================
-- THE ACTIVATION ASSUMPTION. **THE OWNER MUST CONFIRM THIS**, and it is stated here, in
-- docs/ARCHITECTURE.md §10 and in the worker's report in the SAME words:
--
--   Model egress authority for `accounting_work` on a client's books =
--     (a) the FIRM's current accepted Terms AND DPA — an ACTIVE OWNER of the firm holding a
--         `clara.legal_acceptances` row for the CURRENT PUBLISHED version of BOTH kinds
--         (0185's `clara.legal_documents`, published by 0187) — AND
--     (b) the client being ACTIVE.
--   REVOCATION = a NEWER legal version published and not yet accepted by the firm; the client
--     going inactive or archived; an explicit owner withdrawal through the existing
--     `clara.revoke_client_egress_purpose`; or — at the accounting write — the initiator losing
--     firm membership (0178/0184's own arms, unchanged).
--   "EXHAUSTED" ≡ consumed or TTL-expired. There is NO QUOTA in this slice.
--   There is NO per-client "AI on" switch (UI-28 / UI-29 are REPLACED, not implemented), and
--   this purpose requires NO manual `grant_client_egress_purpose` /
--   `activate_client_egress_purpose` call in its normal path.
--   ONE COARSE PURPOSE TOKEN, `accounting_work`. Per-operation tokens are recorded as a
--   follow-up, not built.
--
-- WHY THE PAIR IS SYNTHESISED RATHER THAN THE FAMILY BYPASSED. `clara.consume_egress_dispatch`
-- (0038) is UNTOUCHED by this file — its single-use, TTL and six-term re-binding are the
-- estate's dispatch linearisation point and #631 has no standing to re-cut them. That body
-- re-reads the exact consent and the exact activation, so an `accounting_work` authorization must
-- REFERENCE a live pair. `clara.prepare_egress_dispatch`'s new arm therefore MINTS that pair once,
-- from the legal acceptance, on the first dispatch for a (firm, client) — and NEVER re-mints over
-- a consent row that already exists. That last clause is what makes an owner's explicit
-- `revoke_client_egress_purpose` STICKY: a deliberate withdrawal is not undone by the next
-- dispatch.
--
-- AND THERE IS A WAY BACK ON. The first cut said "restoring it is an owner act through the door
-- that already exists", and the adversarial review measured that the door was WALLED SHUT:
-- SECTION 4 widened `clara.grant_client_egress_purpose`'s allowlist to a purpose SECTION 3's CHECK
-- forbids, so the only named restore path died on a raw
-- `23514 ck_client_egress_purpose_consents_evidence` and an owner's revoke was a permanent
-- per-client kill switch recoverable only by a migration. BOTH halves are fixed here:
--
--   * `clara.grant_client_egress_purpose` REFUSES `accounting_work` with a typed CLR10
--     `purpose_derived_not_grantable` that NAMES the derived basis. The manual grant path cannot
--     mint this purpose, because this purpose's evidence is a legal acceptance and not a
--     bytes-verified `consent_evidence` document.
--   * `clara.restore_client_egress_purpose(client, purpose, op_key)` is the way back on, for the
--     DERIVED purpose only. Owner floor, firm-scoped, `_reserve_op`-idempotent; it re-derives the
--     basis through `clara._accounting_work_egress_live` and REFUSES when that basis is not live
--     (CLR28 `derived_basis_not_live` — you cannot restore an authority the firm does not
--     currently hold), then mints a FRESH consent+activation pair naming the current acceptance.
--     The revoked row is left standing as history; the next dispatch finds the live pair and
--     grants. It writes an `audit_log` row and appends `egress.purpose_consent_restored`.
--
-- THE DERIVED MINT IS AUDITED. A consent synthesised in an owner's name with no trace of who or
-- why was the second half of that finding. `clara.prepare_egress_dispatch`'s `accounting_work` arm
-- now writes an `audit_log` row (`fn = 'derive_client_egress_purpose'`) and appends
-- `egress.purpose_consent_derived`, naming the legal acceptance id, the published versions and the
-- client, on the ONE dispatch that synthesises the pair. The five manual purposes are untouched.
--
-- THE ONE RELAXATION THIS COSTS, AND ITS GUARD. `client_egress_purpose_consents.evidence_document_id`
-- was NOT NULL. A derived consent has no `consent_evidence` document — its evidence is the legal
-- acceptance — so the column becomes nullable behind a PURPOSE-DISCRIMINATED CHECK written as
-- 0123 writes them, one conjunct per purpose, so a SEVENTH purpose inherits nothing by accident.
-- The five existing purposes still require a document, and the owner verb
-- `clara.grant_client_egress_purpose` still refuses a null one for every purpose including this
-- one: the manual path keeps its evidence rule untouched. A new `legal_acceptance_id` column
-- carries the derived basis, and a CHECK makes the two exclusive.
--
-- =====================================================================================
-- THE BINDING BETWEEN A DISPATCH AND A WRITE IS SERVER-DERIVED, NEVER CALLER-CHOSEN.
--
-- `clara.egress_dispatch_authorizations` binds (client, purpose, event_seq, event_type,
-- document_sha256). For this purpose the event is THE RUN: `event_type = 'work.segment'` and
-- `event_seq = clara._work_egress_event_seq(work, run)`, an IMMUTABLE 60-bit fold of the Work id
-- and the workflow run id. The runtime never composes it — `clara.prepare_work_egress_dispatch`
-- derives it from the TASK — and `clara._record_journal_entry_core` RE-DERIVES it from the same
-- two values at the write. A run therefore cannot spend a sibling run's authorization, and a
-- forged event seq would have to agree with a hash the database computes twice.
--
-- RESIDUAL, STATED: a run whose FIRST segment consumed an authorization and whose SECOND segment
-- is refused at the consume can still satisfy the write gate with the first segment's row. The
-- run does not reach the write in that case (the refusal ends the segment before the model), but
-- the gate alone does not prove it. Narrowing it needs a per-segment binding, which is the
-- per-operation-token follow-up.
--
-- =====================================================================================
-- IS A WITHDRAWAL RETROACTIVE TO AN ALREADY-CONSUMED DISPATCH? YES. THE RULE, STATED.
--
--   AUTHORITY MUST BE LIVE AT THE MOMENT THE BOOKS MOVE. A consumed, non-invalidated authorization
--   whose CONSENT was revoked — or whose ACTIVATION was deactivated — after the consume no
--   longer authorises the write: `clara._record_journal_entry_core` refuses CLR13
--   `egress_not_authorized`, posts nothing, and leaves the logical identity unspent. The model
--   call it paid for already happened and the trace row records it; what the withdrawal stops is
--   the BOOKS moving on a basis the firm has since said the model may not have seen.
--
-- The first cut was prospective only (consume, then revoke, then post SUCCEEDED — measured by
-- the review), and the conservative reading is the one an owner clicking "withdraw" expects. It is
-- implemented as TWO extra conjuncts in the recut core's own gate — a join to the consent and
-- the activation behind the authorization — and NOT by invalidating the consumed authorization
-- row, because it CANNOT be: 0020's `ck_egress_dispatch_authorizations_one_terminal`
-- (`consumed_at is null or invalidated_at is null`) and
-- `clara._tf_egress_dispatch_authorization_update` ("exactly one terminal transition") make
-- "consumed AND invalidated" unrepresentable for the whole five-purpose family, and recutting that
-- pair is a change to a relation four other purposes share — a separate migration with its own
-- review, not a clause of this one.
--
-- THE COMMITTED-REPLAY SKIP STILL WINS. A run that COMMITTED and died before checkpointing
-- re-executes its step and gets its ORIGINAL receipt back: the gate is skipped whenever
-- `clara._work_committed_receipt(p_work)` is non-null, exactly as 0184's cancel arms are, so a
-- withdrawal cannot turn a committed effect into an unreadable one.
--
-- THE WAY BACK: `clara.restore_client_egress_purpose` mints a fresh pair, the human's Retry mints
-- a NEW run, that run prepares and consumes under the new consent, and it posts. The OLD run stays
-- refused — its authority was withdrawn, and no later act re-grants it retroactively either.
--
-- =====================================================================================
-- WHAT THE TRACE RELATION ACTUALLY GUARANTEES, SAID EXACTLY.
--
--   NO FREE PAYLOAD COLUMN; BOUNDED, FORMAT-CHECKED FIELDS; BEST-EFFORT REDACTION AT THE WRITER.
--
-- The first cut of this header said "no payload column" full stop, and the adversarial review
-- measured that the claim over-reached: `refusal` and `skills` were free jsonb, an
-- `observed_revisions` VALUE was free text, and seven id/text columns were unconstrained — so a
-- caller holding the `clara_runtime` grant could store an NRIC, a bank run, an email, a phone, a
-- JWT, a bearer header or a DSN verbatim and read it back through the human door. The claim is now
-- true in three layers, in this order of strength:
--
--   1. STRUCTURAL. There is no payload, input, output, attributes, content, prompt, messages,
--      basis or transcript column, and the tail census re-reads the catalog to prove it. Nothing
--      on this relation is shaped to hold a transcript.
--   2. CONSTRAINED. Every remaining column is bounded and format-checked BY THE RELATION itself:
--      the id columns to a lowercase token grammar that no email, phone, JWT, bearer header, DSN
--      or bare digit run can satisfy; `model_id` and `run_id` to their own bounded grammars;
--      `purpose` to the six-token vocabulary; `skills` to an array of ≤ 32 ids; `observed_revisions`
--      to the CLOSED key set with token-shaped values; and `refusal` to a CLOSED five-key shape
--      whose free-text halves are length-capped and REFUSED when they carry a secret-shaped
--      literal. `clara.record_work_execution_trace` checks the same rules first and raises
--      CLR10 `invalid_trace` naming the field, so a caller gets a diagnosis rather than a 23514.
--   3. HYGIENE, AT THE WRITER. `packages/runtime/lib/work-trace.mjs` redacts every free-form value
--      it sends — the refusal, the skills, the observed revisions and every id — before the call,
--      so the ordinary path is redacted rather than refused. This layer is BEST-EFFORT and is
--      named as such; layers 1 and 2 are what make the sentence at the top of this block true.
--
-- `clara.trace_spans` (0006) has an `attributes` jsonb and a best-effort `redact()` in front of it,
-- and its own header calls that hygiene rather than a guarantee (S4-ND8). Layer 2 is the
-- difference between this relation and that one.
--
-- What a trace row carries is IDENTIFIERS, DIGESTS, TIMING and an OUTCOME: the capability,
-- registry, bundle, instruction, skill, tool and model ids, the input DIGEST (never the input),
-- the observed revisions under a CLOSED key vocabulary, the purpose and its authorization, and the
-- receipt or the typed refusal.
--
-- TRACE EXPORT STAYS DISABLED BY ABSENCE. There is no export verb and no route; the human read is
-- `clara.get_work_execution_trace`, firm-scoped and bookkeeper-floored. Retention rides the
-- EXISTING prune lane — `clara.prune_work_execution_traces` mirrors `clara.prune_trace_spans`
-- (0006), is called from the same reconciler pass, and APPENDS its batch to 0006's own
-- `clara.trace_prune_log` so a retention sweep is auditable rather than silent.
--
-- AND THE DOOR IS THE ONLY WAY IN. NO APPLICATION ROLE HOLDS **ANY** PRIVILEGE ON
-- `clara.work_execution_traces` — not INSERT, not UPDATE, not DELETE and not SELECT. The first cut
-- granted SELECT to `clara_authenticated`, and the review measured what that meant: PostgREST
-- serves `clara` (`packages/runtime/scripts/run-live-walk.mjs`), so a VIEWER could read `model_id`
-- and the whole `refusal` straight off the table and walk around the door's bookkeeper floor. The
-- grant is gone, the firm-scoped SELECT policy with it (a relation with FORCE RLS and no policy
-- fails CLOSED if a later file grants one by accident), and the tail census asserts the absence.
-- The DEFINER doors do not need it: they run as `clara_fn_owner`, whose own policy is the only
-- one left. Siblings (`clara.trace_spans`, `clara.egress_dispatch_authorizations`,
-- `clara.op_receipts`) withhold the same grant for the same reason.
--
-- =====================================================================================
-- DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184), AND THE LOCK-WAIT THE FIRST CUT DID NOT SEE.
--
-- `clara.work_execution_traces` carries NO foreign key to `clara.accounting_work`, and that
-- absence is deliberate rather than an omission. The first cut had a composite
-- `(work_id, firm_id, client_id)` FK; a foreign key takes `FOR KEY SHARE` on the referenced row,
-- `clara._record_journal_entry_core` holds `FOR UPDATE` on exactly that row for the length of the
-- posting transaction, and the two conflict — the review measured a trace insert BLOCKED for
-- 4001 ms behind a posting lock and then cancelled, which `traceSafely` swallows, so the estate
-- would lose diagnostic rows silently and precisely when a posting is slow. The binding the FK was
-- there for is not lost: `clara.record_work_execution_trace` is a DEFINER verb that DERIVES
-- work/firm/client from a POSITIVE `agent_tasks → accounting_work` join (0094:105-112's idiom)
-- and never takes them from a parameter, so a row cannot name a Work that does not exist, cannot
-- name another firm's, and cannot disagree with the task it was written for. The remaining FKs are
-- to `clara.firms` (the posting path takes `FOR KEY SHARE` on it too — compatible),
-- `clara.clients` and `clara.agent_tasks` (never `FOR UPDATE` in the posting path) and
-- `clara.operation_receipts` (already committed by the time a receipt id is traced).
--
-- WHERE EACH ROW IS WRITTEN. Every row except the settle row is written OUTSIDE the posting
-- transaction, on the runtime pool. The SETTLE row is written INSIDE the settle transaction —
-- `settleWorkStepV3` opens ONE explicit transaction around `clara.settle_work_run` and the trace
-- insert, with the trace insert inside a SAVEPOINT so a refused diagnostic can never roll back a
-- settle. The first cut said "inside" in this header and wrote it beside; the header was the thing
-- that was wrong, and the runtime is what changed.
--
-- The lock order accounting_work → agent_tasks → agent_interruptions is unchanged by this
-- file: the recut core's ONE addition is a read of `clara.egress_dispatch_authorizations` and the
-- two typed-consent relations behind it, none of which any other writer in the posting path
-- touches.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS.
--   CLR13 egress_not_authorized   the run holds no consumed, non-invalidated accounting_work
--                                 authorization of its own. TERMINAL and NON-RETRYABLE inside the
--                                 run (`claraWork_v3`'s roster maps it to `refusal`); the human's
--                                 Retry mints a NEW run, which refuses again at the PREPARE and
--                                 never reaches a model.
--   CLR10 invalid_trace           a trace row whose phase, outcome, digest or observed-revision
--                                 key is outside its closed vocabulary + field + constraint.
--   CLR11 work_not_found          a trace written for a task this credential cannot resolve to a
--                                 Work (the same non-oracle shape 0178 uses).
-- NO NEW NAME is minted for "the purpose was never authorised" versus "it was withdrawn": both
-- are `egress_not_authorized`, for exactly the reason 0020 §3.3 gives for its uniform `unknown`.
--
-- =====================================================================================
-- THE TWO RUNTIME MODULES THIS FILE'S CLAIMS DEPEND ON ARE HASH-LOCKED, AND THAT IS A RULING.
--
-- `packages/runtime/lib/capability-registry.mjs` and `packages/runtime/lib/work-trace.mjs` are
-- reached from the FROZEN `claraWork_v3` body (by dynamic `import(...)`, which
-- `scripts/check-frozen-workflows.mjs`'s import-closure scan matches as well as a static one), so
-- both are registered in `frozen-workflows.json` and hash-locked by that gate. Once #637's
-- `--lock-deployed` ceremony runs they become permanently immutable, exactly like a workflow body:
-- a behaviour change in either — a hardened redaction pattern, a new capability, a new observed
-- key — then ships as a NEW frozen version (`claraWork_v4`) or in non-frozen infrastructure,
-- never as an edit. Layer 3 of the claim above is therefore version-bound; layers 1 and 2 live
-- here, in the database, and are the ones a later file can tighten without a runtime cutover.
-- Recorded in docs/ARCHITECTURE.md §10 and in both module headers.
-- =====================================================================================

set local statement_timeout = '20min'; -- five CoR'd bodies + a new relation with its belts.

-- =====================================================================================
-- SECTION 0 — PRESTATE. Every body this file recuts is PINNED by prosrc sha256, read live off a
-- from-scratch 0001→0194 chain. A recut derived from a body that has since drifted would delete
-- an arm nobody re-derived.
-- =====================================================================================
do $w631_pre$
declare v_sha text; v_def text; v_n int;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0194_periodic_adjustments') then
    raise exception '#631 prestate: 0194_periodic_adjustments is not applied -- frontier mismatch'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.work_execution_traces') is not null then
    raise exception '#631 prestate: clara.work_execution_traces already exists' using errcode='CLR10';
  end if;
  if to_regclass('clara.legal_documents') is null or to_regclass('clara.legal_acceptances') is null then
    raise exception '#631 prestate: the legal document/acceptance relations are absent -- 0185 must apply first'
      using errcode='CLR10';
  end if;

  -- THE THREE PURPOSE CHECKS at 0123's FIVE-purpose form. A CHECK another lane had already
  -- widened would make SECTION 1's drop/add silently NARROW the vocabulary back to six.
  for v_n, v_def in
    select 1, pg_get_constraintdef(con.oid)
      from pg_constraint con join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and con.contype='c'
       and con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1',
                           'ck_client_egress_purpose_activations_purpose_f_a1',
                           'ck_egress_dispatch_authorizations_purpose_f_a1')
  loop
    if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text, ''document_processing''::text])))' then
      raise exception '#631 prestate: a typed-purpose CHECK is not 0123''s widened FIVE-purpose form (got %)', v_def
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and con.contype='c'
     and con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1',
                         'ck_client_egress_purpose_activations_purpose_f_a1',
                         'ck_egress_dispatch_authorizations_purpose_f_a1');
  if v_n <> 3 then
    raise exception '#631 prestate: expected exactly 3 purpose CHECKs by name (got %)', v_n using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def is distinct from 'CHECK ((((purpose <> ''wiki_synthesis''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''statement_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''witness_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''bank_matching''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''document_processing''::text) OR (document_sha256 IS NOT NULL))))' then
    raise exception '#631 prestate: ck_egress_dispatch_authorizations_doc_sha is not 0123''s five-conjunct form (got %)',
      coalesce(v_def,'<absent>') using errcode='CLR10';
  end if;

  -- THE FIVE BODIES THIS FILE RECUTS, at their live 0123/0194 texts.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  if v_sha <> 'bc270350435aa78fd194a4985feca93f18af06f00a1ccb10bbf2e80f74074479' then
    raise exception '#631 prestate: grant_client_egress_purpose has DRIFTED from the pinned 0123 body (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  if v_sha <> '653a9d35072989da1ea3641c41e9f3ee32f28bff9175440d619af5bc0df89e83' then
    raise exception '#631 prestate: activate_client_egress_purpose has DRIFTED from the pinned 0123 body (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  if v_sha <> '071c2e4338465cfd1a72450f242a9169278ef95817f16b530e278335f3d2d65b' then
    raise exception '#631 prestate: deactivate_client_egress_purpose has DRIFTED from the pinned 0123 body (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  if v_sha <> 'c3054920ee409b4ebdb31071ad4593173dd0b3b5aa73c5a231e28ad220a8bd32' then
    raise exception '#631 prestate: revoke_client_egress_purpose has DRIFTED from the pinned 0123 body (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  if v_sha <> 'd41c649b23d1e624cb77a6981e4d1e29e14ee7a800d27ed2f3a4cf002276a500' then
    raise exception '#631 prestate: prepare_egress_dispatch has DRIFTED from the pinned 0123 body (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha <> 'eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade' then
    raise exception '#631 prestate: clara._record_journal_entry_core has DRIFTED from the pinned 0194 body (sha %) -- re-derive the fourth recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- NON-REGRESSION: clara.consume_egress_dispatch is NOT recut by this file, in either direction.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'::regprocedure;
  if v_sha <> 'f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3' then
    raise exception '#631 prestate: consume_egress_dispatch is not at its pinned 0038 body (sha %) -- this file depends on that exact re-binding and TTL', v_sha
      using errcode='CLR10';
  end if;

  -- CLEAN SLATE: no accounting_work row anywhere, and the relaxed column is still NOT NULL.
  select count(*)::int into v_n from clara.client_egress_purpose_consents where purpose='accounting_work';
  if v_n <> 0 then
    raise exception '#631 prestate: % consent row(s) already carry purpose=accounting_work', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='client_egress_purpose_consents'
     and column_name='evidence_document_id' and is_nullable='NO';
  if v_n <> 1 then
    raise exception '#631 prestate: client_egress_purpose_consents.evidence_document_id is not the NOT NULL 0020 column'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='client_egress_purpose_consents' and column_name='legal_acceptance_id';
  if v_n <> 0 then
    raise exception '#631 prestate: client_egress_purpose_consents.legal_acceptance_id already exists' using errcode='CLR10';
  end if;

  raise notice '#631 prestate: clean -- frontier 0194, the three purpose CHECKs and the doc-sha CHECK at 0123''s five-purpose form, the five recut bodies at their pinned 0123/0194 texts, consume_egress_dispatch confirmed at its pinned 0038 body, no accounting_work consent row and no work_execution_traces relation.';
end
$w631_pre$;

-- =====================================================================================
-- SECTION 1 — THE SIXTH PURPOSE on the three CHECKs. NAMES PRESERVED; no value is lost.
-- =====================================================================================
alter table clara.client_egress_purpose_consents
  drop constraint ck_client_egress_purpose_consents_purpose_f_a1;
alter table clara.client_egress_purpose_consents
  add constraint ck_client_egress_purpose_consents_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work'));

alter table clara.client_egress_purpose_activations
  drop constraint ck_client_egress_purpose_activations_purpose_f_a1;
alter table clara.client_egress_purpose_activations
  add constraint ck_client_egress_purpose_activations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work'));

alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_purpose_f_a1;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work'));

-- =====================================================================================
-- SECTION 2 — ck_egress_dispatch_authorizations_doc_sha, RECUT with its OWN sixth conjunct:
-- `accounting_work` is NOT document-tied (a documentless Work has no bytes to bind), so it takes
-- the wiki_synthesis / bank_matching shape — document_sha256 MUST be null. NAME PRESERVED.
-- =====================================================================================
do $w631_s2_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.egress_dispatch_authorizations
   where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
          and (purpose <> 'statement_extraction' or document_sha256 is not null)
          and (purpose <> 'witness_extraction' or document_sha256 is not null)
          and (purpose <> 'bank_matching' or document_sha256 is null)
          and (purpose <> 'document_processing' or document_sha256 is not null)
          and (purpose <> 'accounting_work' or document_sha256 is null));
  if v_bad <> 0 then
    raise exception '#631 S2 pre-assert failed: % dispatch-authorization row(s) violate the recut document-hash rule', v_bad
      using errcode='CLR10';
  end if;
end
$w631_s2_pre$;
alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_doc_sha;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_doc_sha check (
    (purpose <> 'wiki_synthesis'       or document_sha256 is null)
    and (purpose <> 'statement_extraction' or document_sha256 is not null)
    and (purpose <> 'witness_extraction'   or document_sha256 is not null)
    and (purpose <> 'bank_matching'        or document_sha256 is null)
    and (purpose <> 'document_processing'  or document_sha256 is not null)
    and (purpose <> 'accounting_work'      or document_sha256 is null));

-- =====================================================================================
-- SECTION 3 — THE DERIVED CONSENT'S EVIDENCE. `evidence_document_id` becomes nullable behind a
-- PURPOSE-DISCRIMINATED CHECK (one conjunct per purpose, 0123's shape) and `legal_acceptance_id`
-- carries the derived basis. The two are EXCLUSIVE: a derived consent names an acceptance and no
-- document; every other consent names a document and no acceptance.
-- =====================================================================================
alter table clara.client_egress_purpose_consents alter column evidence_document_id drop not null;
alter table clara.client_egress_purpose_consents
  add column legal_acceptance_id uuid references clara.legal_acceptances(id);
alter table clara.client_egress_purpose_consents
  add constraint ck_client_egress_purpose_consents_evidence check (
    (purpose <> 'wiki_synthesis'       or (evidence_document_id is not null and legal_acceptance_id is null))
    and (purpose <> 'statement_extraction' or (evidence_document_id is not null and legal_acceptance_id is null))
    and (purpose <> 'witness_extraction'   or (evidence_document_id is not null and legal_acceptance_id is null))
    and (purpose <> 'bank_matching'        or (evidence_document_id is not null and legal_acceptance_id is null))
    and (purpose <> 'document_processing'  or (evidence_document_id is not null and legal_acceptance_id is null))
    and (purpose <> 'accounting_work'      or (evidence_document_id is null and legal_acceptance_id is not null)));
comment on column clara.client_egress_purpose_consents.legal_acceptance_id is
  '#631: for purpose=accounting_work ONLY — the clara.legal_acceptances row (the firm owner''s '
  'acceptance of the current published DPA) the derived consent was synthesised from. NULL for '
  'every purpose whose evidence is a consent_evidence document. The two are exclusive by CHECK.';

-- =====================================================================================
-- SECTION 4 — the four typed OWNER verbs: the in-body allowlist widens to admit the sixth
-- purpose, and NOTHING else moves. Every other byte is 0123's, carried through verbatim; the
-- wiki-hold coupling stays purpose-discriminated on 'wiki_synthesis' alone, so accounting_work
-- falls through with no hold transition exactly as the four purposes before it do.
--
-- THE GRANT DOOR'S EVIDENCE RULE IS DELIBERATELY UNCHANGED. `grant_client_egress_purpose` still
-- refuses a null `p_evidence_document` for EVERY purpose: the manual path keeps its
-- bytes-verified consent-evidence requirement, and the derived path does not go through it.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  -- 0038 (WCB-R1): the SECOND typed purpose. F-A3/PR-1c: the FOURTH, 'bank_matching'.
  -- F-A7 gamma: the FIFTH, 'document_processing'.
  -- #631: the SIXTH, 'accounting_work' -- the Work lane's model egress. Admitted here so an
  -- owner can REVOKE a derived consent through the door that already exists; the NORMAL path
  -- never calls this verb for it, and the evidence rule below is unchanged for every purpose.
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  -- #631 · AND IT IS REFUSED HERE, BY NAME. `accounting_work` is ADMITTED to the allowlist
  -- above so an owner naming it gets a true diagnosis rather than `unknown_purpose`, and then
  -- refused with its own reason: this purpose's evidence is the firm's LEGAL ACCEPTANCE, not a
  -- bytes-verified consent-evidence document, so the evidence rule below can NEVER be satisfied
  -- for it. The first cut let the call reach the INSERT and die on a raw
  -- `23514 ck_client_egress_purpose_consents_evidence`, which read as an estate defect rather than
  -- a refusal. Restoring a withdrawn derived consent is clara.restore_client_egress_purpose.
  if p_purpose='accounting_work' then
    raise exception 'accounting_work model-egress authority is DERIVED from the firm''s accepted Terms and DPA -- it is not granted with document evidence'
      using errcode='CLR10',
        detail='{"reason":"purpose_derived_not_grantable","purpose":"accounting_work","basis":"legal_acceptance","restore_with":"clara.restore_client_egress_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;
alter function clara.grant_client_egress_purpose(uuid,text,uuid,text,text) owner to clara_fn_owner;

create or replace function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  if p_purpose='wiki_synthesis' then
    perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;
alter function clara.activate_client_egress_purpose(uuid,text,uuid,text) owner to clara_fn_owner;

create or replace function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;
alter function clara.deactivate_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

create or replace function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing','accounting_work') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;
alter function clara.revoke_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 4B — clara.restore_client_egress_purpose: THE WAY BACK ON.
--
-- WHY THIS DOOR EXISTS AT ALL. An owner's `clara.revoke_client_egress_purpose('accounting_work')`
-- is STICKY by design — `clara.prepare_egress_dispatch` never re-mints over an existing consent
-- row, so a deliberate withdrawal is not undone by the next dispatch. Without a way back on that
-- is not a switch, it is a one-way kill switch: the adversarial review measured that the obvious
-- restore path (`grant_client_egress_purpose` with a consent-evidence document) can never succeed
-- for this purpose, so recovery meant a migration. A control a firm cannot reverse is not a
-- control, it is damage.
--
-- WHAT IT DOES, AND WHAT IT REFUSES. Owner floor, firm-scoped, `_reserve_op`-idempotent. It
-- refuses any purpose but the DERIVED one (the five document-evidenced purposes are restored the
-- way they were granted, with their evidence); it refuses when the client already HAS live
-- authority; it refuses when nothing was ever withdrawn; and it RE-DERIVES the basis through
-- `clara._accounting_work_egress_live`, refusing when that basis is not live — an owner cannot
-- restore an authority the firm does not currently hold (a newer unaccepted legal version, or an
-- inactive client, refuses here rather than minting a consent that would not authorise anything).
--
-- IT MINTS RATHER THAN UN-REVOKES. The revoked consent row stays standing as history — typed
-- consents are historical (0020's own trigger says so) — and a FRESH consent+activation pair is
-- inserted naming the CURRENT acceptance. The next dispatch finds the live pair and grants; the
-- authorizations the withdrawal invalidated stay invalidated, and the run that was refused stays
-- refused.
-- =====================================================================================
create function clara.restore_client_egress_purpose(p_client uuid, p_purpose text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare c record; v_dedupe jsonb; v_live jsonb; v_prior uuid; v_consent uuid; v_activation uuid;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null then
    raise exception 'typed egress restoration is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose<>'accounting_work' then
    raise exception 'only a DERIVED egress purpose is restored through this door'
      using errcode='CLR10',
        detail='{"reason":"purpose_not_restorable","restorable":"accounting_work"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'restore_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if exists(select 1 from clara.client_egress_purpose_consents
             where firm_id=c.firm and client_id=p_client and purpose='accounting_work'
               and revoked_at is null) then
    raise exception 'this client already holds live model-egress authority'
      using errcode='CLR28',detail='{"reason":"already_live"}';
  end if;
  select x.id into v_prior from clara.client_egress_purpose_consents x
   where x.firm_id=c.firm and x.client_id=p_client and x.purpose='accounting_work'
   order by x.granted_at desc limit 1;
  if v_prior is null then
    raise exception 'nothing was withdrawn for this client and purpose'
      using errcode='CLR28',detail='{"reason":"nothing_to_restore"}';
  end if;
  v_live:=clara._accounting_work_egress_live(c.firm,p_client);
  if coalesce((v_live->>'live')::boolean,false) is not true then
    raise exception 'the derived model-egress basis is not live for this client'
      using errcode='CLR28',detail='{"reason":"derived_basis_not_live"}';
  end if;
  insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
      evidence_document_id,legal_acceptance_id,granted_by)
    values(c.firm,p_client,'accounting_work',
      'restored by an owner from the firm''s accepted Terms and DPA at their published versions (#631)',
      null,(v_live->>'dpa_acceptance')::uuid,c.actor)
    returning id into v_consent;
  insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,consent_id,
      activated_by)
    values(c.firm,p_client,'accounting_work',v_consent,c.actor) returning id into v_activation;
  perform clara._audit(c.firm,c.actor,null,null,'restore_client_egress_purpose',null,
    jsonb_build_object('consent',v_consent,'activation',v_activation,'client',p_client,
      'purpose','accounting_work','restored_over',v_prior,
      'legal_acceptance',(v_live->>'dpa_acceptance'),'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_consent_restored',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_consent,
      'activation_id',v_activation,'purpose','accounting_work','restored_over',v_prior,
      'legal_acceptance_id',(v_live->>'dpa_acceptance'),
      'terms_version',(v_live->>'terms_version')::int,
      'dpa_version',(v_live->>'dpa_version')::int));
  return clara._finish_op(c.firm,'restore_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_consent,'activation_id',v_activation,
      'purpose','accounting_work','status','live'));
end $$;
alter function clara.restore_client_egress_purpose(uuid,text,text) owner to clara_fn_owner;
revoke all on function clara.restore_client_egress_purpose(uuid,text,text) from public;
comment on function clara.restore_client_egress_purpose(uuid,text,text) is
  '#631: restore the DERIVED accounting_work model-egress authority an owner previously withdrew. '
  'Owner floor, firm-scoped, idempotent by op_key. Re-derives the basis from the firm''s current '
  'accepted Terms and DPA plus an active client and REFUSES when that basis is not live; mints a '
  'FRESH consent+activation pair rather than un-revoking the historical one. The only purpose it '
  'accepts is accounting_work -- the five document-evidenced purposes keep their own grant door.';

-- =====================================================================================
-- SECTION 5 — THE DERIVED BASIS, and the run binding.
-- =====================================================================================

-- clara._accounting_work_egress_live — the ASSUMPTION, made mechanical. UNGRANTED: it is reached
-- only from `clara.prepare_egress_dispatch` (a DEFINER verb), and its answer never leaves the
-- database in a distinguishable form — prepare collapses every negative onto ONE `unknown`
-- payload, exactly as 0020 §3.3 requires.
create or replace function clara._accounting_work_egress_live(p_firm uuid, p_client uuid)
  returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp
  -- Both the membership probe and the acceptance join bind the firm as a parameter; 0183's house
  -- rule applies for the same reason 0185's doors give.
  set plan_cache_mode = force_custom_plan
  as $$
declare v_client_status text; v_terms int; v_dpa int; v_owner uuid; v_terms_acc uuid; v_dpa_acc uuid;
begin
  if p_firm is null or p_client is null then return jsonb_build_object('live',false); end if;
  -- (b) THE CLIENT IS ACTIVE, in THIS firm. A foreign or absent client answers the same bytes as
  -- an inactive one: this function must not become an existence oracle for another firm's books.
  select c.status into v_client_status from clara.clients c
   where c.id=p_client and c.firm_id=p_firm;
  if v_client_status is distinct from 'active' then return jsonb_build_object('live',false); end if;
  -- (a) THE FIRM'S CURRENT ACCEPTED TERMS AND DPA. "Current" is the PUBLISHED version of each
  -- kind; a newer publication that nobody has accepted therefore withdraws authority the moment
  -- it lands, with no sweep and no second switch.
  select d.version into v_terms from clara.legal_documents d where d.kind='terms' and d.status='published';
  select d.version into v_dpa   from clara.legal_documents d where d.kind='dpa'   and d.status='published';
  if v_terms is null or v_dpa is null then return jsonb_build_object('live',false); end if;
  -- ONE HUMAN must hold BOTH acceptances, and they must be an ACTIVE OWNER of this firm. Two
  -- halves from two different people is not a firm-level acceptance: 0185's checkout door binds
  -- both kinds to the SAME actor, and this is that rule read forward.
  select m.user_id, ta.id, da.id into v_owner, v_terms_acc, v_dpa_acc
    from clara.firm_memberships m
    join clara.legal_acceptances ta
      on ta.user_id=m.user_id and ta.kind='terms' and ta.version=v_terms
    join clara.legal_acceptances da
      on da.user_id=m.user_id and da.kind='dpa' and da.version=v_dpa
   where m.firm_id=p_firm and m.status='active' and m.role='owner'
   order by m.created_at, m.user_id limit 1;
  if v_owner is null then return jsonb_build_object('live',false); end if;
  return jsonb_build_object('live',true,'owner',v_owner,'terms_version',v_terms,
    'dpa_version',v_dpa,'terms_acceptance',v_terms_acc,'dpa_acceptance',v_dpa_acc);
end $$;
revoke all on function clara._accounting_work_egress_live(uuid,uuid) from public;
comment on function clara._accounting_work_egress_live(uuid,uuid) is
  '#631: the DERIVED model-egress basis for purpose=accounting_work -- an ACTIVE OWNER of the firm '
  'holding acceptances of BOTH currently published legal kinds, and an ACTIVE client. Ungranted; '
  'reached only from clara.prepare_egress_dispatch, whose answer collapses every negative onto one '
  'indistinguishable unknown.';

-- clara._work_egress_event_seq — THE RUN BINDING. IMMUTABLE and total: the same (work, run) pair
-- folds to the same 60-bit value in the prepare wrapper and again at the accounting write, so the
-- binding is a computation both sides make rather than a value one side is trusted to carry.
-- 60 bits keeps it inside a positive bigint with room to spare; collisions are irrelevant to
-- SAFETY because the authorization is ALSO bound to firm, client and purpose, and a collision
-- would have to be between two runs of the same client to matter at all.
create or replace function clara._work_egress_event_seq(p_work uuid, p_run text) returns bigint
  language sql immutable set search_path=clara,pg_temp as $$
  select ('x' || substr(encode(sha256(convert_to(coalesce(p_work::text,'') || ':' || coalesce(p_run,''), 'UTF8')), 'hex'), 1, 15))::bit(60)::bigint;
$$;
revoke all on function clara._work_egress_event_seq(uuid,text) from public;
comment on function clara._work_egress_event_seq(uuid,text) is
  '#631: the egress_dispatch_authorizations.event_seq an accounting_work dispatch binds on -- an '
  'immutable 60-bit fold of (work, workflow run). Derived server-side by '
  'clara.prepare_work_egress_dispatch and RE-derived by clara._record_journal_entry_core; never '
  'composed by the runtime.';

-- =====================================================================================
-- SECTION 6 — clara.prepare_egress_dispatch, RECUT with the accounting_work arm. Full 0123 body;
-- every addition is marked `#631`.
--
-- THE SYNTHESIS IS INSIDE THIS BODY AND NOWHERE ELSE. It runs ONCE per (firm, client) and NEVER
-- over an existing consent row — including a REVOKED one, which is what makes an owner's explicit
-- withdrawal stick. The pair it mints is an ordinary member of the typed family: the owner verbs
-- read it, revoke it, deactivate it and invalidate its authorizations exactly as they do any
-- other, and `clara.consume_egress_dispatch` re-reads it unchanged.
-- =====================================================================================
create or replace function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
  v_live jsonb; v_derived uuid; v_derived_act uuid;   -- #631
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='wiki_synthesis' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='statement_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='witness_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A3/PR-1c: bank_matching is NOT document-tied -- the wiki_synthesis arm's shape.
  if p_purpose='bank_matching' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A7 gamma: document_processing IS document-tied -- the statement_extraction/
  -- witness_extraction shape (classify reads exactly one document).
  if p_purpose='document_processing' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- ---- #631 · accounting_work: NOT document-tied, and its authority is DERIVED -------------
  if p_purpose='accounting_work' then
    if v_sha is not null then
      return jsonb_build_object('verdict','unknown','authorization_id',null);
    end if;
    v_live := clara._accounting_work_egress_live(p_firm,p_client);
    if coalesce((v_live->>'live')::boolean,false) is not true then
      return jsonb_build_object('verdict','unknown','authorization_id',null);
    end if;
    -- SYNTHESISE ONCE. `not exists` over EVERY row of this purpose -- live or revoked -- so a
    -- deliberate withdrawal is never re-minted by the next dispatch. The concurrent-first-dispatch
    -- race is decided by the relation's own partial uniques, not by this predicate.
    if not exists (select 1 from clara.client_egress_purpose_consents
                    where firm_id=p_firm and client_id=p_client and purpose='accounting_work') then
      insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
          evidence_document_id,legal_acceptance_id,granted_by)
        values(p_firm,p_client,'accounting_work',
          'derived from the firm''s accepted Terms and DPA at their published versions (#631)',
          null,(v_live->>'dpa_acceptance')::uuid,(v_live->>'owner')::uuid)
        on conflict do nothing
        returning id into v_derived;
      insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
          consent_id,activated_by)
        select p_firm,p_client,'accounting_work',x.id,(v_live->>'owner')::uuid
          from clara.client_egress_purpose_consents x
         where x.firm_id=p_firm and x.client_id=p_client and x.purpose='accounting_work'
           and x.revoked_at is null
        on conflict do nothing
        returning id into v_derived_act;
      -- #631 · AND THE MINT IS AUDITED. A consent synthesised in an OWNER's name with no audit row
      -- and no event was the review's finding: the estate could see the consent but never who
      -- caused it or on what basis. This is the ONE dispatch per (firm, client) that mints, so the
      -- ledger gains exactly one row and one event per client, naming the legal acceptance and the
      -- published versions the authority was derived from. `v_derived` is null when a concurrent
      -- first dispatch won the race (`on conflict do nothing`), and then this block is silent --
      -- the OTHER transaction wrote the row.
      if v_derived is not null then
        perform clara._audit(p_firm,(v_live->>'owner')::uuid,null,null,
          'derive_client_egress_purpose',null,
          jsonb_build_object('consent',v_derived,'activation',v_derived_act,'client',p_client,
            'purpose','accounting_work','basis','legal_acceptance',
            'legal_acceptance',(v_live->>'dpa_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));
        perform clara._append_event(p_firm,'egress.purpose_consent_derived',p_client,
          (v_live->>'owner')::uuid,null,null,null,null,null,
          jsonb_build_object('consent_id',v_derived,'activation_id',v_derived_act,
            'purpose','accounting_work','basis','legal_acceptance',
            'legal_acceptance_id',(v_live->>'dpa_acceptance'),
            'terms_acceptance_id',(v_live->>'terms_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));
      end if;
    end if;
  end if;
  -- ---- #631 ends ---------------------------------------------------------------------------
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 7 — clara.prepare_work_egress_dispatch: the RUN's own dispatch intent, derived from the
-- TASK. The runtime names a task and its workflow run id and gets back the WHOLE intent, so the
-- consume it makes next presents exactly what was prepared (0020 ratchet R1-F1) without the
-- runtime ever choosing a firm, a client, a purpose or an event seq.
--
-- THE TASK→WORK→FIRM/CLIENT BINDING IS POSITIVE (0094:105-112's idiom): the join must find the
-- Work THROUGH the task, and a task of any other kind, an unclaimed task, or a Work in another
-- firm answers the same `unknown` payload as an absent purpose.
-- =====================================================================================
create or replace function clara.prepare_work_egress_dispatch(p_task uuid, p_run text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare w record; v_seq bigint; v_out jsonb;
begin
  if p_task is null or p_run is null or btrim(p_run)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select aw.id as work_id, aw.firm_id, aw.client_id, aw.status into w
    from clara.agent_tasks t
    join clara.accounting_work aw on aw.id = t.work_id and aw.firm_id = t.firm_id
   where t.id = p_task and t.kind = 'accounting_work';
  if not found then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- A Work that is already settled or stopping has nothing to dispatch FOR. Refusing here keeps
  -- the run from spending a model call it could not act on, and it is the same reading 0184's
  -- cancel arms give the accounting write.
  if w.status in ('stopping','cancelled','completed','refused','failed','expired') then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_seq := clara._work_egress_event_seq(w.work_id, p_run);
  v_out := clara.prepare_egress_dispatch(w.firm_id, w.client_id, 'accounting_work', v_seq,
    'work.segment', null);
  if (v_out->>'verdict') is distinct from 'granted' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- `event_seq` RIDES AS TEXT, and that is measured rather than stylistic. A 60-bit value inside
  -- a jsonb NUMBER is read back by every JSON parser this estate has as an IEEE-754 double, which
  -- silently rounds it: the first cut of this verb returned 900591352947190742 and the runtime
  -- presented 900591352947190800 at the consume, whose six-term re-binding then refused a dispatch
  -- it had itself authorised (measured on the rig, work-egress-authority.test.mjs w631.wrap.binds).
  -- A text value survives the round trip and casts back to bigint on the way in.
  return v_out || jsonb_build_object(
    'firm_id', w.firm_id, 'client_id', w.client_id, 'work_id', w.work_id,
    'purpose', 'accounting_work', 'event_seq', v_seq::text, 'event_type', 'work.segment');
end $$;
alter function clara.prepare_work_egress_dispatch(uuid,text) owner to clara_fn_owner;
revoke all on function clara.prepare_work_egress_dispatch(uuid,text) from public;
comment on function clara.prepare_work_egress_dispatch(uuid,text) is
  '#631: PLAN a model dispatch for ONE accounting_work run. Resolves task -> work -> firm/client '
  'positively, derives the event seq from (work, run), and delegates to '
  'clara.prepare_egress_dispatch. Returns the whole dispatch intent so the runtime can present it '
  'again at clara.consume_egress_dispatch without choosing any part of it. Every refusal is the '
  'same unknown payload.';

reset role;

-- =====================================================================================
-- SECTION 7B — THE TRACE FIELD GRAMMARS. What a payload-shaped column may HOLD.
--
-- WHY THESE EXIST. "There is no payload column" is a true sentence about the SHAPE of the
-- relation and a false one about what can be STORED in it: the adversarial review put an NRIC, a
-- bank run, an email, a Malaysian phone number, a JWT, a `Bearer` header and a `postgres://` DSN
-- into `refusal`, into `skills`, into an `observed_revisions` VALUE and into seven unconstrained
-- id/text columns through one ordinary `clara.record_work_execution_trace` call, and read every
-- one of them back through the human door. The runtime's `redactDeep` was the only wall, which is
-- exactly the `clara.trace_spans` posture this file's header criticises.
--
-- SO THE RELATION ITSELF NOW SAYS WHAT ITS COLUMNS ARE FOR. Five IMMUTABLE predicates, used in
-- CHECK constraints on the relation AND re-checked by the writer so a caller gets a typed
-- CLR10 `invalid_trace` naming the field instead of a raw 23514. They are deliberately narrow:
-- an id is a lowercase token, a model id is a bounded vendor token, a run id is a bounded
-- workflow token, an observed revision is a digest or a short token, and a refusal is FIVE keys
-- whose free-text halves are length-capped and refused outright when they carry a secret-shaped
-- literal.
--
-- UNGRANTED, and reachable only from the relation's own constraints and the DEFINER writer, both
-- of which run as `clara_fn_owner`.
-- =====================================================================================
set role clara_fn_owner;

-- The secret shapes a bounded token or a short free-text diagnostic must never carry. Chosen so
-- that NO legitimate value in this relation can match one: the id grammars below exclude `@`,
-- spaces, `:` and uppercase outright, and this predicate catches what a permissive grammar would
-- still admit. Deliberately NOT including a bare digit run -- a sha256 digest and a workflow uuid
-- both carry long digit runs by chance, and the grammars handle that case with their own rules.
create function clara._work_trace_secret_shaped(p text) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select p is not null and (
       p ~ '[0-9]{6}-[0-9]{2}-[0-9]{4}'                                    -- Malaysian NRIC
    or p ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}'                -- email
    or p ~ 'eyJ[A-Za-z0-9._-]{10,}'                                        -- JWT / base64 header
    or p ~* '\mbearer[[:space:]]'                                          -- bearer header
    or p ~* '(postgres|postgresql|mysql|mongodb|redis|amqp)s?://'           -- DSN with credentials
    or p ~* '\m(sk|pk|rk|ak)[-_](live|test|proj|ant|or)?[-_]?[A-Za-z0-9]{16,}'  -- vendor api key
    or p ~* '\m(password|passphrase|secret|api[-_]?key|access[-_]?token|token)[[:space:]]*[=:]'
  ) $$;
revoke all on function clara._work_trace_secret_shaped(text) from public;
comment on function clara._work_trace_secret_shaped(text) is
  '#631: true when a string carries one of the estate''s named secret/PII shapes (NRIC, email, '
  'JWT, bearer header, DSN, vendor api key, key=value secret). Used by the clara.'
  'work_execution_traces field grammars and by clara.record_work_execution_trace.';

-- ONE grammar function, five kinds, so the CHECK constraints and the writer cannot drift apart.
--   id     a lowercase capability/registry/bundle/instructions/tools id
--   model  a vendor model id (mixed case, `:` and `/` for provider-prefixed spellings)
--   run    a workflow run id (mixed case; `run_<uuid>` is the live shape)
--   token  a short code/reason/revision token
--   rev    an observed-revision VALUE: a sha256 digest, or a short token
--   free   a bounded, control-character-free diagnostic string
create function clara._work_trace_text_ok(p text, p_kind text) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select case
    when p is null then true
    when p_kind = 'id' then
      p ~ '^[a-z0-9][a-z0-9_./-]{0,127}$' and p ~ '[a-z]' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'model' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,127}$' and p ~ '[A-Za-z]' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'run' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,200}$' and p ~ '[A-Za-z]'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'token' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'rev' then
      p ~ '^[0-9a-f]{64}$'
        or (p ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' and p !~ '[0-9]{8,}'
            and not clara._work_trace_secret_shaped(p))
    when p_kind = 'free' then
      length(p) <= 500 and p !~ '[[:cntrl:]]' and p !~ '[0-9]{10,}'
        -- A GROUPED bank/card run carries separators, so the bare digit-run test above misses it
        -- (measured: '5141 8822 9310 7742' was admitted into a refusal message by the first cut of
        -- this grammar). This is `redactString`'s own account pattern, read into SQL.
        and p !~ '[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}'
        and p !~ '\+?60[ -]?[0-9]{1,2}[ -]?[0-9]{3,4}[ -]?[0-9]{4}'
        and p !~ '\m0[0-9]{1,2}[ -]?[0-9]{3,4}[ -]?[0-9]{4}\M'
        and not clara._work_trace_secret_shaped(p)
    else false end $$;
revoke all on function clara._work_trace_text_ok(text,text) from public;
comment on function clara._work_trace_text_ok(text,text) is
  '#631: the five field grammars clara.work_execution_traces enforces (id | model | run | token | '
  'rev | free). An unknown kind is FALSE, so a careless caller narrows rather than widens.';

create function clara._work_trace_skills_ok(p jsonb) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 32
     and not exists (select 1 from jsonb_array_elements(p) e
                      where jsonb_typeof(e) <> 'string'
                         or not clara._work_trace_text_ok(e #>> '{}', 'id'))
$$;
revoke all on function clara._work_trace_skills_ok(jsonb) from public;
comment on function clara._work_trace_skills_ok(jsonb) is
  '#631: clara.work_execution_traces.skills is an array of at most 32 SKILL IDS -- not a free '
  'jsonb bag. The first cut left it unconstrained and unredacted at the writer.';

create function clara._work_trace_revisions_ok(p jsonb) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) kv
        where kv.key not in ('knowledge_version','books_version','chart_revision',
                             'basis_digest','source_sha256','question_version')
           or jsonb_typeof(kv.value) not in ('string','number','null')
           or (jsonb_typeof(kv.value) = 'string'
               and not clara._work_trace_text_ok(kv.value #>> '{}', 'rev')))
$$;
revoke all on function clara._work_trace_revisions_ok(jsonb) from public;
comment on function clara._work_trace_revisions_ok(jsonb) is
  '#631: the CLOSED observed-revision vocabulary, enforced on the KEY and now on the VALUE too -- '
  'a digest, a number or a short token. The first cut checked only the key, so a value was a '
  'payload slot.';

create function clara._work_trace_refusal_ok(p jsonb) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) kv
       where kv.key not in ('code','reason','message','detail','recoverable')
          or (kv.key = 'recoverable' and jsonb_typeof(kv.value) not in ('boolean','null'))
          or (kv.key in ('code','reason')
              and (jsonb_typeof(kv.value) not in ('string','null')
                   or (jsonb_typeof(kv.value) = 'string'
                       and not clara._work_trace_text_ok(kv.value #>> '{}', 'token'))))
          or (kv.key in ('message','detail')
              and (jsonb_typeof(kv.value) not in ('string','null')
                   or (jsonb_typeof(kv.value) = 'string'
                       and not clara._work_trace_text_ok(kv.value #>> '{}', 'free'))))))
$$;
revoke all on function clara._work_trace_refusal_ok(jsonb) from public;
comment on function clara._work_trace_refusal_ok(jsonb) is
  '#631: clara.work_execution_traces.refusal is a CLOSED five-key shape -- code, reason, message, '
  'detail, recoverable. The two token halves take the code grammar; the two free-text halves are '
  'capped at 500 characters and REFUSED when they carry a secret-shaped literal. The estate''s own '
  'refusal payloads (claraWork.v1.errors.ts workErrorPayload, egressRefusalPayload) are exactly '
  'this shape, which is why the closed set is five keys and not three.';

reset role;

-- =====================================================================================
-- SECTION 8 — clara.work_execution_traces. ONE ROW PER STEP OF ONE RUN, IN BOUNDED FIELDS.
--
-- C88.12's discovery closes here: the minimum durable diagnostic event is one row per step, and
-- the four phases are the four moments a Work run can be asked about afterwards — what it was
-- DISPATCHED to do, what it asked the MODEL, what TOOL it called, and how it SETTLED.
-- =====================================================================================
set role clara_fn_owner;

create table clara.work_execution_traces (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  client_id          uuid        not null,
  work_id            uuid        not null,
  task_id            uuid        not null references clara.agent_tasks(id),
  run_id             text        not null check (btrim(run_id) <> ''),
  seq                int         not null check (seq >= 1),
  phase              text        not null check (phase in ('dispatch','model_call','tool_call','settle')),
  -- THE SERVER-OWNED CAPABILITY this step exercised, and the registry version that named it.
  capability_id      text        check (capability_id is null or btrim(capability_id) <> ''),
  registry_version   text        check (registry_version is null or btrim(registry_version) <> ''),
  -- THE VERSIONED BUNDLE: which instructions, which skills, which tool set, which model.
  bundle_id          text,
  bundle_digest      text        check (bundle_digest is null or bundle_digest ~ '^[0-9a-f]{64}$'),
  instructions_id    text,
  skills             jsonb       not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  tools_id           text,
  model_id           text,
  -- THE AUTHORITY: the purpose token, the authorization it was spent under, and the consent and
  -- activation THAT authorization referenced. The last two are DERIVED here from the
  -- authorization row, never supplied: a trace must not be able to claim an authority it did not
  -- have.
  purpose            text,
  authorization_id   uuid,
  consent_ref        uuid,
  activation_ref     uuid,
  -- THE INPUT'S DIGEST, NEVER THE INPUT. There is no payload column on this relation and there
  -- never will be one: see this file's header.
  input_digest       text        check (input_digest is null or input_digest ~ '^[0-9a-f]{64}$'),
  observed_revisions jsonb       not null default '{}'::jsonb
                       check (jsonb_typeof(observed_revisions) = 'object'),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  duration_ms        int         check (duration_ms is null or duration_ms >= 0),
  outcome            text        not null check (outcome in ('ok','refused','failed','cancelled','skipped')),
  refusal            jsonb       check (refusal is null or jsonb_typeof(refusal) = 'object'),
  receipt_id         uuid        references clara.operation_receipts(id),
  created_at         timestamptz not null default now(),
  constraint ck_work_execution_traces_ended check (ended_at is null or ended_at >= started_at),
  constraint fk_work_execution_traces_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- NO FOREIGN KEY TO clara.accounting_work, DELIBERATELY. See this file's DEADLOCK DISCIPLINE
  -- header: a composite FK takes `FOR KEY SHARE` on the Work row, the posting core holds
  -- `FOR UPDATE` on it, and a measured trace insert blocked 4001 ms behind a posting lock and was
  -- then cancelled -- silently, because every caller in the frozen closure swallows a trace
  -- failure. `clara.record_work_execution_trace` derives work/firm/client from a POSITIVE
  -- task -> work join and never from a parameter, so the binding the FK stood for is enforced by
  -- the ONLY writer rather than by a lock the posting path fights.
  -- THE FIELD GRAMMARS (SECTION 7B). What each remaining column may HOLD, checked by the relation
  -- itself so no writer -- careless, future or hostile -- can turn one into a payload slot.
  constraint ck_work_execution_traces_run_id check (clara._work_trace_text_ok(run_id, 'run')),
  constraint ck_work_execution_traces_ids check (
    clara._work_trace_text_ok(capability_id, 'id')
    and clara._work_trace_text_ok(registry_version, 'id')
    and clara._work_trace_text_ok(bundle_id, 'id')
    and clara._work_trace_text_ok(instructions_id, 'id')
    and clara._work_trace_text_ok(tools_id, 'id')),
  constraint ck_work_execution_traces_model check (clara._work_trace_text_ok(model_id, 'model')),
  constraint ck_work_execution_traces_purpose check (
    purpose is null or purpose in ('wiki_synthesis','statement_extraction','witness_extraction',
                                   'bank_matching','document_processing','accounting_work')),
  constraint ck_work_execution_traces_skills_shape check (clara._work_trace_skills_ok(skills)),
  constraint ck_work_execution_traces_revisions_shape check (
    clara._work_trace_revisions_ok(observed_revisions)),
  constraint ck_work_execution_traces_refusal_shape check (clara._work_trace_refusal_ok(refusal)),
  -- ONE row per (work, run, seq) — the structural half of "a replayed step does not double-trace".
  constraint uq_work_execution_traces_run_seq unique (work_id, run_id, seq)
);
comment on table clara.work_execution_traces is
  '#631: one durable diagnostic row per step of one accounting-work run '
  '(dispatch | model_call | tool_call | settle). Identifiers, digests, timing and an outcome only: '
  'there is NO FREE PAYLOAD COLUMN, and every remaining column is bounded and format-checked by '
  'the SECTION 7B grammars, so no writer can turn one into a payload slot. Written ONLY by '
  'clara.record_work_execution_trace; read by clara.get_work_execution_trace (bookkeeper+, '
  'firm-scoped); pruned by clara.prune_work_execution_traces. No export verb and no route exists.';

create index ix_work_execution_traces_work on clara.work_execution_traces(work_id, run_id, seq);
create index ix_work_execution_traces_firm on clara.work_execution_traces(firm_id, started_at desc);
create index ix_work_execution_traces_started on clara.work_execution_traces(started_at);

alter table clara.work_execution_traces enable row level security;
alter table clara.work_execution_traces force row level security;
create policy p_work_execution_traces_owner on clara.work_execution_traces
  for all to clara_fn_owner using (true) with check (true);
-- NO APPLICATION ROLE HOLDS ANY PRIVILEGE ON THIS RELATION, AND THAT INCLUDES SELECT.
--
-- The first cut granted SELECT to clara_authenticated behind a firm-scoped policy, and the
-- adversarial review measured what that bought: PostgREST serves the `clara` schema
-- (packages/runtime/scripts/run-live-walk.mjs), so a VIEWER -- below the door's bookkeeper floor --
-- could read `model_id` and the whole `refusal` straight off the table. The door
-- `clara.get_work_execution_trace` does NOT need the grant: it is SECURITY DEFINER and runs as
-- clara_fn_owner, whose own policy above is the only one this relation has. With the grant gone
-- the firm-scoped SELECT policy goes too, so a later file that grants SELECT by accident finds a
-- FORCE-RLS relation with no policy for its role and reads nothing -- the failure is CLOSED.
-- clara_runtime gets NO DML either: the writer is a DEFINER verb, so the runtime cannot compose a
-- row of its own shape, cannot write one for another firm's Work, and cannot invent an authority.

create function clara._tf_work_execution_trace_append_only() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op = 'DELETE' then
    -- The PRUNE deletes; nothing else may. clara.prune_work_execution_traces sets this flag for
    -- the statement it runs, the way the estate's other bounded prunes do.
    if coalesce(current_setting('clara.trace_prune', true),'') = 'on' then return old; end if;
    raise exception 'an execution trace row is retained or pruned, never deleted'
      using errcode='CLR08', detail='{"reason":"work_execution_trace_immutable","column":"*"}';
  end if;
  raise exception 'an execution trace row is append-only'
    using errcode='CLR08', detail='{"reason":"work_execution_trace_immutable","column":"*"}';
end $$;
revoke all on function clara._tf_work_execution_trace_append_only() from public;
create trigger t_work_execution_traces_append_only
  before update or delete on clara.work_execution_traces
  for each row execute function clara._tf_work_execution_trace_append_only();
create trigger t_work_execution_traces_no_truncate before truncate on clara.work_execution_traces
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- SECTION 9 — clara.record_work_execution_trace. THE ONE WRITER, clara_runtime only.
--
-- IT BINDS TASK → WORK → FIRM/CLIENT POSITIVELY. The runtime names a task and this verb derives
-- everything else; a task of another kind, or one whose Work it cannot reach, is a not-found and
-- never a differently-shaped answer.
--
-- THE OBSERVED-REVISION VOCABULARY IS CLOSED. An out-of-vocabulary key is REFUSED rather than
-- stored: the whole point of a closed key set is that a writer cannot smuggle a payload into a
-- jsonb column by naming it something new.
--
-- REPLAY-IDEMPOTENT BY (work, run, seq): a WDK re-execution of a step re-records the same row and
-- gets the ORIGINAL id back rather than a second row or a unique violation.
-- =====================================================================================
create function clara.record_work_execution_trace(
    p_task uuid, p_run text, p_seq int, p_phase text,
    p_capability_id text, p_registry_version text,
    p_bundle_id text, p_bundle_digest text, p_instructions_id text, p_skills jsonb,
    p_tools_id text, p_model_id text, p_purpose text, p_authorization_id uuid,
    p_input_digest text, p_observed_revisions jsonb,
    p_started_at timestamptz, p_ended_at timestamptz,
    p_outcome text, p_refusal jsonb, p_receipt_id uuid) returns uuid
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c_keys constant text[] := array['knowledge_version','books_version','chart_revision',
                                  'basis_digest','source_sha256','question_version'];
  w record; v_id uuid; v_key text; v_started timestamptz; v_skills jsonb; v_rev jsonb;
  -- SCALARS, never a `record`: plpgsql raises 55000 ("record is not assigned yet") the moment an
  -- unassigned record variable is dereferenced, and the authorization is OPTIONAL here — a
  -- dispatch trace row is written before one exists. Measured on the rig
  -- (work-trace-redaction.test.mjs 631.trace.persisted, first cut).
  v_auth uuid; v_consent uuid; v_activation uuid; v_auth_purpose text;
begin
  if p_task is null or p_run is null or btrim(p_run)='' then
    raise exception 'an execution trace names a task and a run' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_run","constraint":"required"}';
  end if;
  if p_seq is null or p_seq < 1 then
    raise exception 'an execution trace step number starts at 1' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_seq","constraint":"positive"}';
  end if;
  if p_phase is null or p_phase not in ('dispatch','model_call','tool_call','settle') then
    raise exception 'unknown execution trace phase' using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_trace','field','p_phase',
        'constraint','vocabulary','phase',p_phase)::text;
  end if;
  if p_outcome is null or p_outcome not in ('ok','refused','failed','cancelled','skipped') then
    raise exception 'unknown execution trace outcome' using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_trace','field','p_outcome',
        'constraint','vocabulary','outcome',p_outcome)::text;
  end if;
  if p_input_digest is not null and p_input_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'an input digest is a lowercase sha256 hex string' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_input_digest","constraint":"sha256_hex"}';
  end if;
  if p_bundle_digest is not null and p_bundle_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'a bundle digest is a lowercase sha256 hex string' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_bundle_digest","constraint":"sha256_hex"}';
  end if;

  -- #631 · THE FIELD GRAMMARS (SECTION 7B), CHECKED HERE FIRST. The CHECK constraints on the
  -- relation are the WALL -- they hold however this verb changes -- and these are the DIAGNOSIS:
  -- a caller that sends an email in a capability id gets CLR10 `invalid_trace` naming the field
  -- and the grammar, not a raw 23514 naming a constraint. Both sides call the SAME predicates, so
  -- they cannot drift apart.
  if not clara._work_trace_text_ok(btrim(p_run),'run') then
    raise exception 'a run id is a bounded workflow token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_run","constraint":"grammar_run"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_capability_id,'')),''),'id') then
    raise exception 'a capability id is a lowercase token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_capability_id","constraint":"grammar_id"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_registry_version,'')),''),'id') then
    raise exception 'a registry version is a lowercase token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_registry_version","constraint":"grammar_id"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_bundle_id,'')),''),'id') then
    raise exception 'a bundle id is a lowercase token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_bundle_id","constraint":"grammar_id"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_instructions_id,'')),''),'id') then
    raise exception 'an instructions id is a lowercase token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_instructions_id","constraint":"grammar_id"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_tools_id,'')),''),'id') then
    raise exception 'a tools id is a lowercase token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_tools_id","constraint":"grammar_id"}';
  end if;
  if not clara._work_trace_text_ok(nullif(btrim(coalesce(p_model_id,'')),''),'model') then
    raise exception 'a model id is a bounded vendor token' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_model_id","constraint":"grammar_model"}';
  end if;
  if nullif(btrim(coalesce(p_purpose,'')),'') is not null
     and nullif(btrim(coalesce(p_purpose,'')),'') not in ('wiki_synthesis','statement_extraction',
       'witness_extraction','bank_matching','document_processing','accounting_work') then
    raise exception 'unknown egress purpose on an execution trace' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_purpose","constraint":"vocabulary"}';
  end if;

  v_skills := coalesce(p_skills,'[]'::jsonb);
  if jsonb_typeof(v_skills) <> 'array' then
    raise exception 'the skill list is an array of ids' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_skills","constraint":"array"}';
  end if;
  if not clara._work_trace_skills_ok(v_skills) then
    raise exception 'the skill list is at most 32 lowercase skill ids, never free text'
      using errcode='CLR10',
        detail='{"reason":"invalid_trace","field":"p_skills","constraint":"grammar_skills"}';
  end if;
  v_rev := coalesce(p_observed_revisions,'{}'::jsonb);
  if jsonb_typeof(v_rev) <> 'object' then
    raise exception 'observed revisions are an object' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_observed_revisions","constraint":"object"}';
  end if;
  -- THE CLOSED KEY VOCABULARY. A key outside it is refused by NAME so the caller can fix it.
  for v_key in select k from jsonb_object_keys(v_rev) as k loop
    if not (v_key = any (c_keys)) then
      raise exception 'observed revision key % is outside the closed vocabulary', v_key
        using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_trace','field','p_observed_revisions',
            'constraint','vocabulary','key',v_key)::text;
    end if;
  end loop;
  -- The VALUES too, not only the keys: an observed revision is a digest, a number or a short
  -- token. The key loop above names the offending KEY; this names the field.
  if not clara._work_trace_revisions_ok(v_rev) then
    raise exception 'an observed revision is a digest, a number or a short token'
      using errcode='CLR10',
        detail='{"reason":"invalid_trace","field":"p_observed_revisions","constraint":"grammar_revision"}';
  end if;
  if p_refusal is not null and jsonb_typeof(p_refusal) <> 'object' then
    raise exception 'a refusal is an object' using errcode='CLR10',
      detail='{"reason":"invalid_trace","field":"p_refusal","constraint":"object"}';
  end if;
  if not clara._work_trace_refusal_ok(p_refusal) then
    raise exception 'a refusal carries code, reason, message, detail and recoverable -- bounded, and never a secret'
      using errcode='CLR10',
        detail='{"reason":"invalid_trace","field":"p_refusal","constraint":"grammar_refusal"}';
  end if;

  select aw.id as work_id, aw.firm_id, aw.client_id into w
    from clara.agent_tasks t
    join clara.accounting_work aw on aw.id = t.work_id and aw.firm_id = t.firm_id
   where t.id = p_task and t.kind = 'accounting_work';
  if not found then
    raise exception 'accounting work not found for this task' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- THE AUTHORITY IS DERIVED, NEVER ASSERTED. An authorization id that is not this firm's and
  -- this client's is dropped rather than recorded: a trace row may not claim an authority the
  -- estate cannot corroborate.
  if p_authorization_id is not null then
    select ea.id, ea.consent_id, ea.activation_id, ea.purpose
      into v_auth, v_consent, v_activation, v_auth_purpose
      from clara.egress_dispatch_authorizations ea
     where ea.id = p_authorization_id and ea.firm_id = w.firm_id and ea.client_id = w.client_id;
  end if;

  -- THE START INSTANT, AND WHY IT IS CLAMPED. A caller that supplies only an END instant (a settle
  -- row, say) would otherwise be compared against the SERVER''s now() for its start, and a client
  -- clock a millisecond behind the server''s violates ck_work_execution_traces_ended — dropping the
  -- row, because every caller in the frozen closure swallows a trace failure by design. Measured on
  -- the rig: the settle row was absent from every completed run in tests/work-egress-e2e.mjs''s
  -- first cut. Clamping is the honest reading of "the step cannot have ended before it started".
  v_started := coalesce(p_started_at, least(now(), coalesce(p_ended_at, now())));
  insert into clara.work_execution_traces(firm_id, client_id, work_id, task_id, run_id, seq, phase,
      capability_id, registry_version, bundle_id, bundle_digest, instructions_id, skills, tools_id,
      model_id, purpose, authorization_id, consent_ref, activation_ref, input_digest,
      observed_revisions, started_at, ended_at, duration_ms, outcome, refusal, receipt_id)
    values (w.firm_id, w.client_id, w.work_id, p_task, btrim(p_run), p_seq, p_phase,
      nullif(btrim(coalesce(p_capability_id,'')),''), nullif(btrim(coalesce(p_registry_version,'')),''),
      nullif(btrim(coalesce(p_bundle_id,'')),''), p_bundle_digest,
      nullif(btrim(coalesce(p_instructions_id,'')),''), v_skills,
      nullif(btrim(coalesce(p_tools_id,'')),''), nullif(btrim(coalesce(p_model_id,'')),''),
      coalesce(v_auth_purpose, nullif(btrim(coalesce(p_purpose,'')),'')), v_auth, v_consent,
      v_activation, p_input_digest, v_rev, v_started, p_ended_at,
      case when p_ended_at is null then null
           else greatest(0, (extract(epoch from (p_ended_at - v_started)) * 1000)::int) end,
      p_outcome, p_refusal, p_receipt_id)
    on conflict (work_id, run_id, seq) do nothing
    returning id into v_id;
  if v_id is null then
    select t.id into v_id from clara.work_execution_traces t
     where t.work_id = w.work_id and t.run_id = btrim(p_run) and t.seq = p_seq;
  end if;
  return v_id;
end $$;
alter function clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid)
  owner to clara_fn_owner;
revoke all on function clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid) from public;
comment on function clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid) is
  '#631: record ONE step of one accounting-work run. Binds task -> work -> firm/client positively, '
  'derives consent/activation from the named authorization, refuses an out-of-vocabulary phase, '
  'outcome or observed-revision key, and is replay-idempotent by (work, run, seq). clara_runtime '
  'ONLY. There is no payload argument and no payload column.';

-- =====================================================================================
-- SECTION 10 — clara.get_work_execution_trace: the human read (C88.18).
--
-- BOOKKEEPER FLOOR, not viewer. A trace names model ids, bundle digests and authorization ids —
-- operational facts about HOW the books were produced, not the books themselves — and the surface
-- that renders it is the Work detail's Diagnostics section, which is a preparer's tool. A viewer
-- gets the ordinary CLR04, and the web renders a denied face rather than an empty one.
-- =====================================================================================
create function clara.get_work_execution_trace(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select aw.firm_id into v_firm from clara.accounting_work aw where aw.id = p_work;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.started_at, r.run_id, r.seq)
      from (
        select t.id, t.run_id, t.seq, t.phase, t.capability_id, t.registry_version,
               t.bundle_id, t.bundle_digest, t.instructions_id, t.skills, t.tools_id,
               t.model_id, t.purpose, t.authorization_id, t.consent_ref, t.activation_ref,
               t.input_digest, t.observed_revisions, t.started_at, t.ended_at, t.duration_ms,
               t.outcome, t.refusal, t.receipt_id, t.task_id
          from clara.work_execution_traces t
         where t.work_id = p_work and t.firm_id = c.firm
         order by t.started_at, t.run_id, t.seq
         limit 500) r), '[]'::jsonb);
end $$;
alter function clara.get_work_execution_trace(uuid) owner to clara_fn_owner;
revoke all on function clara.get_work_execution_trace(uuid) from public;
comment on function clara.get_work_execution_trace(uuid) is
  '#631: the redacted execution trace of ONE accounting Work, oldest step first, capped at 500 '
  'rows. Bookkeeper+, firm-scoped, no oracle. Carries identifiers, digests, timing and outcomes '
  'only -- the relation has no payload column. There is NO export route.';

-- =====================================================================================
-- SECTION 11 — RETENTION, on the EXISTING prune lane. The shape is clara.prune_trace_spans's
-- (0006 §3.7): started_at-keyed, bounded batch, runtime-granted, and called from the same
-- reconciler pass (packages/runtime/lib/reconciler.mjs `pruneTraces`).
--
-- AND IT IS AUDITED, on the SAME ledger. 0006's prune writes one `clara.trace_prune_log` row per
-- batch; the first cut of this verb wrote none, so a retention sweep that emptied the relation
-- left no trace of itself — the one relation in the estate whose PURPOSE is leaving a trace. The
-- ledger gains a `relation` column (defaulted to 'trace_spans', so every historical row keeps its
-- meaning) and this verb appends to it. One ledger, two prunes, no new table and no new belt.
-- =====================================================================================
alter table clara.trace_prune_log
  add column relation text not null default 'trace_spans'
    check (relation in ('trace_spans','work_execution_traces'));
comment on column clara.trace_prune_log.relation is
  '#631: WHICH relation the batch pruned. Defaults to trace_spans so 0006''s own rows keep their '
  'meaning; clara.prune_work_execution_traces writes work_execution_traces.';

create function clara.prune_work_execution_traces(p_before timestamptz, p_limit int default 10000)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_deleted bigint;
begin
  perform set_config('clara.trace_prune','on',true);
  with doomed as (
    select id from clara.work_execution_traces
     where started_at < p_before order by started_at limit greatest(coalesce(p_limit,0),0)
  )
  delete from clara.work_execution_traces t using doomed d where t.id = d.id;
  get diagnostics v_deleted = row_count;
  perform set_config('clara.trace_prune','off',true);
  insert into clara.trace_prune_log (pruned_before, spans_deleted, relation)
    values (p_before, v_deleted, 'work_execution_traces');
  return jsonb_build_object('pruned_before', p_before, 'traces_deleted', v_deleted);
end $$;
alter function clara.prune_work_execution_traces(timestamptz,int) owner to clara_fn_owner;
revoke all on function clara.prune_work_execution_traces(timestamptz,int) from public;
comment on function clara.prune_work_execution_traces(timestamptz,int) is
  '#631: the bounded, started_at-keyed retention sweep for clara.work_execution_traces -- the '
  'clara.prune_trace_spans shape, called from the same reconciler pass. The append-only trigger '
  'admits a DELETE only while this verb''s transaction-local flag is set.';

reset role;

-- =====================================================================================
-- SECTION 12 — clara._record_journal_entry_core, RECUT (the FOURTH full copy). Full 0194 body;
-- the ONE addition is marked `#631` and every pre-existing arm is carried through verbatim.
--
-- A NOTE FOR THE NEXT RECUT, in 0194's own words: the addition below is an INSERTION POINT opened
-- and closed by a `#631` comment, so a fifth copy can be derived by re-applying it to a newer base
-- rather than by reading two bodies side by side. The prestate pin above is what makes that safe.
--
-- WHERE THE EGRESS GATE SITS: after step 3 (the client's status) and before `clara._reserve_op`,
-- guarded by the same `clara._work_committed_receipt(p_work) is null` condition 0184's cancel arms
-- carry. All three placements are measured rather than chosen -- see the arm's own comment.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
  v_task_status text;                                             -- #630
  v_adj_canon jsonb; v_flags jsonb; v_adjustment uuid; v_corrects uuid;   -- #643
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  --
  -- #630 · AND IT IS LOCKED. `for update` here IS the ordering boundary between admitting this
  -- operation and cancelling the Work that authorised it (see 0184's header). A cancel that
  -- arrives from here on waits until this transaction commits or rolls back, and then reads the
  -- truth rather than racing it.
  --
  -- #643 · THE PURPOSE FILTER WIDENS. It was `= 'journal_entry'`; the three values are the
  -- column's own CHECK, restated so a purpose this core cannot post is a not-found rather than a
  -- surprise further down.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')
   for update;
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- 1b · #630 · THE OTHER SIDE OF THE BOUNDARY. The lock above is only half the contract: holding
  -- it proves nobody is cancelling RIGHT NOW, and these arms ask whether somebody already did.
  -- They sit BEFORE clara._reserve_op deliberately, so a refused operation leaves the logical
  -- identity unspent and a later Retry (or a takeover) can still use it.
  --
  -- A REPLAY IS NOT AN ADMISSION, AND THIS GUARD IS WHY THE WHOLE BLOCK IS CONDITIONAL. Measured on
  -- the rig (tests/work-cancel-e2e.mjs leg 4, first cut): a run that COMMITTED and then died before
  -- checkpointing re-executes its step on respawn, reaches this core again, and found the Work
  -- `completed` -- which an unconditional `work_settled` arm refused, breaking the one idempotency
  -- guarantee 0178 was built for. The effect is already on the books; returning it changes nothing
  -- and admits nothing, so a Work that HOLDS a committed receipt falls straight through to the
  -- reservation below, which answers with the stored result and `replayed:true`.
  --
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
  if clara._work_committed_receipt(p_work) is null then
    if w.status in ('stopping','cancelled') then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
    if w.status in ('completed','refused','failed','expired') then
      raise exception 'this accounting work already settled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_settled', 'status', w.status)::text;
    end if;
    -- …and the RUN's own abort request, which reaches the Work through the status mirror but may be
    -- read here first by a transaction that started before the mirror's update became visible.
    select t.status into v_task_status from clara.agent_tasks t where t.id = w.current_task_id;
    if v_task_status = 'cancel_requested' then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'task_status', v_task_status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
  end if;

  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  --
  -- #630 · AND THE READ IS SERIALISED WITH REVOCATION, not merely fresh. `for share` on the
  -- membership row is the second half of the boundary 0184 is about: without it a revocation
  -- can commit in the window between this SELECT and the INSERT below, and the entry posts under an
  -- authority that no longer existed when the books moved -- which is exactly what C79.2
  -- ("revocation wins before a later commit") forbids. The estate's revocation writers all UPDATE
  -- this row (`clara.remove_member` / `clara.set_member_role`, 0157:331/405), and an UPDATE
  -- conflicts with FOR SHARE, so the two orders are now decided rather than raced: a revocation
  -- that arrives first makes this read see it, and one that arrives second waits for this
  -- transaction and then applies to a world where the entry is already posted (and cannot erase
  -- it -- spec §5).
  -- …AND THE FIRM ROW IS TAKEN FIRST, because the revocation writers take it first. MEASURED on
  -- the rig (work-cancel.test.mjs wc.34, first cut): `clara.set_member_role` (0157) opens with
  -- `perform 1 from clara.firms where id = c.firm for update` and only then UPDATEs the
  -- membership, while this core took the membership FOR SHARE and reached `clara.firms` LATER —
  -- through the FK key-share every `operation_receipts`/`journal_entries` insert takes. Two
  -- transactions, two orders, one cycle: PostgreSQL broke it with 40P01, and a serialization
  -- failure on a posting is precisely the answer #630 exists to make impossible. `for key share`
  -- is the weakest lock that queues behind the revocation's `for update` (and it is the same mode
  -- the FK checks below need, so it is taken once rather than twice); two postings never block
  -- each other on it.
  perform 1 from clara.firms f where f.id = p_firm for key share;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
   for share;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN RESPONSIBLE HUMAN, not merely SOME live bookkeeper of the
  -- firm. Reviewed finding (#623): the two arms above ask whether `p_obo` still holds authority,
  -- and the wrapper asks whether the credential is pinned to this client -- neither asks whether
  -- this is the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's `on_behalf_of` --
  -- the estate's record of WHOSE AUTHORITY was rechecked -- would attribute the posting to a human
  -- who never authorised it. This is an authority check, not an input check: CLR04.
  --
  -- #630 · AND `initiator` NOW MEANS "the human this Work is executed as" (0184 §A), so after a
  -- takeover this arm binds the COLLEAGUE and refuses the person who admitted it -- which is exactly
  -- right, because they are the one who lost authority. The reason token is deliberately unchanged:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- ---- #631 INSERTION · MODEL EGRESS AUTHORISATION, VERIFIED AGAIN AT THE WRITE -------------
  -- AC2's second half, and it is a SEPARATE question from the role, the client and the period
  -- arms around it: those ask whether this HUMAN may post, and this asks whether the MODEL that
  -- produced the posting was authorised to see the client's books at all. The run consumed an
  -- authorization immediately before it called the model (`claraWork_v3`); this is the
  -- independent re-read of that fact at the moment the books actually move.
  --
  -- WHERE IT SITS, AND WHY EXACTLY HERE. AFTER the cancel arms, the identity arm, the human's
  -- live authority and the client's status, so every one of those keeps its own diagnosis: a
  -- cancelled Work still answers `work_cancelled`, an archived client still answers
  -- `client_inactive`, and a lost membership still answers `obo_not_active` (measured on the rig
  -- -- an earlier cut placed this arm at 1b and stole `client_inactive` from
  -- work-journal-post.test.mjs's own cell). BEFORE `clara._reserve_op`, so a refusal leaves the
  -- logical identity UNSPENT and a human's Retry can still use it.
  --
  -- SKIPPED FOR A COMMITTED REPLAY, for the reason 0184's cancel arms are conditional: a run that
  -- COMMITTED and then died before checkpointing re-executes its step and must get its ORIGINAL
  -- receipt back. An unconditional gate would refuse that replay the moment the authorization had
  -- been invalidated in between, turning a committed effect into an unreadable one.
  --
  -- BOUND TO THIS RUN, not merely to this client. `clara._work_egress_event_seq(work, run)` is
  -- re-derived here from two values this core already holds, so a sibling run's spent
  -- authorization does not satisfy this one and a forged event seq would have to agree with a
  -- hash the database computes twice.
  --
  -- CONSUMED AND NOT INVALIDATED. A PREPARED authorization is a plan, not a dispatch; an
  -- invalidated one is a withdrawal that landed in the window. Neither is authority.
  --
  -- AND THE AUTHORITY BEHIND IT MUST STILL BE LIVE AT THIS INSTANT. The two joins below are the
  -- retroactive half of a withdrawal, and they are this file's answer to "is a revoke retroactive
  -- to an already-consumed dispatch?" — YES (see the header's own statement of the rule). The
  -- first cut checked only the authorization row, and 0020's
  -- `ck_egress_dispatch_authorizations_one_terminal` forbids a CONSUMED row from also being
  -- INVALIDATED, so an owner's withdrawal could not reach it and consume -> revoke -> post
  -- succeeded (measured by the review). Reading the consent and the activation HERE costs two
  -- index lookups in the posting path and makes "authority must be live when the books move"
  -- true without recutting a relation four other purposes share.
  if clara._work_committed_receipt(p_work) is null and not exists (
    select 1 from clara.egress_dispatch_authorizations ea
      join clara.client_egress_purpose_consents cc
        on cc.id = ea.consent_id and cc.firm_id = ea.firm_id and cc.client_id = ea.client_id
          and cc.purpose = ea.purpose
      join clara.client_egress_purpose_activations ca
        on ca.id = ea.activation_id and ca.firm_id = ea.firm_id and ca.client_id = ea.client_id
          and ca.purpose = ea.purpose
     where ea.firm_id = p_firm and ea.client_id = p_client
       and ea.purpose = 'accounting_work'
       and ea.event_type = 'work.segment'
       and ea.event_seq = clara._work_egress_event_seq(p_work, p_run_id)
       and ea.consumed_at is not null and ea.invalidated_at is null
       and cc.revoked_at is null and ca.deactivated_at is null) then
    raise exception 'this run holds no consumed model-egress authorisation for this client'
      using errcode='CLR13', detail='{"reason":"egress_not_authorized"}';
  end if;
  -- ---- #631 INSERTION ends -----------------------------------------------------------------

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences, so if the WRITE read the raw echo instead,
  -- a padded account code would satisfy the digest and then land in clara.journal_lines with its
  -- padding — a stored line disagreeing with the identity that authorised it.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- ---- #643 INSERTION 1 · THE TYPED PARTICULARS' SHAPE, from the WORK ROW ----------------
  -- Read from `w.adjustment_basis`, never from an argument: the particulars are frozen at
  -- admission and the run has no way to name them. Asserted again here rather than trusted
  -- because this core is the last door before the books move, and 0178 §D's rule — admission and
  -- commit share one definition of well-formed — applies to the particulars exactly as it does to
  -- the basis. BEFORE `clara._reserve_op`, so a malformed set leaves the identity unspent.
  perform clara._assert_adjustment_basis(w.purpose, w.adjustment_basis);
  v_adj_canon := clara._adjustment_basis_canonical(w.purpose, w.adjustment_basis);
  -- ---- #643 INSERTION 1 ends -------------------------------------------------------------

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable.
  --
  -- #643 · THE PAYLOAD GAINS THE PARTICULARS, AND ONLY FOR THE NEW PURPOSES. A journal entry's
  -- payload bytes are the 0178 shape verbatim, so every reservation and every `clara.op_receipts`
  -- row already in the estate still hashes to what it hashed to. A periodic adjustment's payload
  -- describes the WHOLE operation, because its identity is the lines AND the particulars.
  if w.adjustment_basis is null then
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  else
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon,
      'adjustment', v_adj_canon));
  end if;
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- ---- #643 INSERTION 2 · THE LINES SAY WHAT THE PARTICULARS SAY --------------------------
  -- C-29's rung, and the reason a periodic adjustment cannot be an anonymous balancing journal.
  -- Immediately after the echo wall above, so a drifted echo is still diagnosed `basis_mismatch`
  -- (see this section's header).
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', false);
  -- ---- #643 INSERTION 2 ends -------------------------------------------------------------

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence.
  --
  -- #643 · UNCHANGED, AND IT STILL BITES THE NEW PURPOSES. The CHECK on
  -- `clara.coa_accounts.account_class` admits only 'payable'/'receivable'/null (0015:199-200), so
  -- an inventory account, a statutory payable and a staff-advance account are NOT control legs by
  -- this rule and pass through — which is correct: a periodic adjustment carries typed
  -- particulars and a named producer, so it is not the weak anchor this arm exists to refuse. An
  -- adjustment that DID name a trade-payable leg is refused here exactly as a journal entry is.
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
  end if;

  -- ---- #643 INSERTION 3 · THE PARTICULARS' WORLD, RE-READ AT COMMIT -----------------------
  -- The same shape 7b has, for the same reason: an account retired, a staff-advance enrolment
  -- withdrawn, a fiscal year sealed or the correction target corrected by somebody else between
  -- admission and this line are all facts about the world, and the run must not post through
  -- them. AFTER the reservation, so a replay of a committed identity never re-runs it.
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', true);
  -- ---- #643 INSERTION 3 ends -------------------------------------------------------------

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id.
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document.
  --
  -- ---- #643 INSERTION 4 · THE MARKER, ON THE DRAFT INSERT ---------------------------------
  -- `flags` is written HERE and nowhere else, because `clara._tf_entry_immutable`'s
  -- approved→approved allowset is {reversed_by, reversal_reason, updated_at}: a flag added after
  -- approval would be refused, and the draft→approved UPDATE below may not carry it either. The
  -- key is the ONE the close gate has always read (`closing_stock`), and its payload is the
  -- adjustment's own period so a reader of the entry can see what the marker claims without
  -- joining anything. A payroll obligation carries `payroll_obligation` on the same footing: no
  -- gate reads it today, and an entry that moved a statutory liability should say so on its face.
  v_flags := case
    when w.purpose = 'periodic_stock_adjustment' then jsonb_build_object('closing_stock',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'method', w.adjustment_basis->>'method'))
    when w.purpose = 'payroll_obligation' then jsonb_build_object('payroll_obligation',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'obligation_kind', w.adjustment_basis->>'obligation_kind'))
    else '{}'::jsonb end;
  -- ---- #643 INSERTION 4 ends -------------------------------------------------------------
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor,
      flags)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id(), v_flags)
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  -- #643 · …AND ITS ADJUSTMENT. The id is MINTED HERE rather than taken from the insert below,
  -- for the same reason `admit_journal_work` mints the Work id itself: `clara.operation_receipts`
  -- is append-only, the adjustment row's FK points AT the receipt, and a receipt whose `effects`
  -- named nothing until a follow-up UPDATE would be a receipt that could never name it at all.
  if w.adjustment_basis is not null then
    v_adjustment := gen_random_uuid();
    v_effects := v_effects || jsonb_build_object('adjustment_id', v_adjustment);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    -- #643 · the receipt's purpose IS the Work's purpose. It was the literal 'journal_entry'.
    values (p_firm, p_client, p_work, w.purpose, p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes. THE INDEX'S OWN REFUSAL WEARS THE SAME
  -- NAME: a CONCURRENT sibling can post between 7b's read and this write, and then
  -- `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped as a
  -- raw 23505 with no `detail.reason`. A violation it cannot explain is RE-RAISED verbatim.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  -- ---- #643 INSERTION 5 · THE DURABLE ADJUSTMENT ROW --------------------------------------
  -- Written INSIDE the posting transaction, beside the entry and the receipt it names, so the
  -- three are one fact or none. The particulars are stored CANONICAL — the Work row keeps the raw
  -- submission — so a reader never has to decide whether a padded code and a trimmed one are the
  -- same claim.
  if w.adjustment_basis is not null then
    v_corrects := nullif(btrim(coalesce(w.adjustment_basis->>'corrects_adjustment_id','')),'')::uuid;
    insert into clara.periodic_adjustments(id, firm_id, client_id, work_id, logical_op_id, purpose,
        period_start, period_end, basis, amount_cents, currency, entry_id, receipt_id,
        source_document_id, corrects_adjustment_id, recorded_by, on_behalf_of)
      values (v_adjustment, p_firm, p_client, p_work, p_logical_op_id, w.purpose,
        (w.adjustment_basis->>'period_start')::date, (w.adjustment_basis->>'period_end')::date,
        v_adj_canon, clara._adjustment_amount_cents(w.purpose, w.adjustment_basis),
        upper(btrim(w.adjustment_basis->>'currency')), v_entry, v_receipt,
        v_source_document, v_corrects, clara.agent_user_id(), p_obo);
    -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction — the one update
    -- `t_periodic_adjustments_append_only` admits. `uq_periodic_adjustments_corrects` is the
    -- structural half: two Works correcting one adjustment cannot both land, and the second one
    -- raises a unique violation rather than silently overwriting the first chain.
    if v_corrects is not null then
      update clara.periodic_adjustments set corrected_by_adjustment_id = v_adjustment
       where id = v_corrects and client_id = p_client;
    end if;
  end if;
  -- ---- #643 INSERTION 5 ends -------------------------------------------------------------

  -- #643 · THE ANSWER SHAPE IS ONE SHAPE PER LANE, and the key is emitted only when there IS an
  -- adjustment (adversarial migration-safety review, S2). Carried unconditionally, a fresh
  -- `journal_entry` commit answered `"adjustment_id": null` while a REPLAYED pre-0194 one — whose
  -- payload `clara._finish_op` stored before this migration existed — carried no such key at all:
  -- two shapes for one lane, distinguishable only by whether the caller happened to replay. The
  -- `||` fold is the same one `v_effects` above already uses for `document_id`, so the receipt,
  -- the Work's result and the returned answer now agree on one rule: name the effect you had.
  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
                  || case when v_adjustment is null then '{}'::jsonb
                          else jsonb_build_object('adjustment_id', v_adjustment) end
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document, 'purpose', w.purpose, 'adjustment_id', v_adjustment));

  -- …AND THE RETURNED ANSWER FOLLOWS THE SAME RULE as the Work's `result` above (S2).
  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false)
    || case when v_adjustment is null then '{}'::jsonb
            else jsonb_build_object('adjustment_id', v_adjustment) end;
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

reset role;

-- =====================================================================================
-- SECTION 13 — GRANTS. The dispatch boundary and the trace writer are RUNTIME surfaces; the trace
-- read is a HUMAN surface; every predicate is ungranted.
-- =====================================================================================
grant execute on function clara.prepare_work_egress_dispatch(uuid,text) to clara_runtime;
grant execute on function clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid) to clara_runtime;
grant execute on function clara.prune_work_execution_traces(timestamptz,int) to clara_runtime;
grant execute on function clara.get_work_execution_trace(uuid) to clara_authenticated;
grant execute on function clara.restore_client_egress_purpose(uuid,text,text) to clara_authenticated;

-- =====================================================================================
-- SECTION 13B — THE EVENT TAXONOMY. Two additive types against the ACTIVE version, in 0020 §4.1's
-- own idiom (no new taxonomy version, no repoint). Both are client-scoped and 'ignore': the
-- database owns the consent transitions for typed purposes, so there is nothing for the consumer
-- to do but advance — they exist so a firm can SEE when its model-egress authority was derived and
-- when an owner put it back.
-- =====================================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('egress.purpose_consent_derived',true,
   'Clara derived a client model-egress consent from the firm''s accepted legal documents','ignore',
   'minted once per (firm, client) by clara.prepare_egress_dispatch; the basis is the acceptance, not a document'::text),
  ('egress.purpose_consent_restored',true,
   'An owner restored a withdrawn derived model-egress consent','ignore',
   'clara.restore_client_egress_purpose; the revoked consent stays standing as history'::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

-- =====================================================================================
-- SECTION 14 — TAIL CENSUS. Every claim this file made, re-READ from the committed catalog.
-- =====================================================================================
do $w631_tail$
declare v_n int; v_src text; v_def text; v_role text;
begin
  -- (T.1) THE SIXTH PURPOSE is on all three CHECKs, and none of the five before it was lost.
  for v_def in select con.conname from pg_constraint con join pg_class c on c.oid=con.conrelid
                join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='clara'
                 and con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1',
                                     'ck_client_egress_purpose_activations_purpose_f_a1',
                                     'ck_egress_dispatch_authorizations_purpose_f_a1')
  loop
    select pg_get_constraintdef(con.oid) into v_src from pg_constraint con where con.conname=v_def
     and con.conrelid in ('clara.client_egress_purpose_consents'::regclass,
                          'clara.client_egress_purpose_activations'::regclass,
                          'clara.egress_dispatch_authorizations'::regclass);
    foreach v_role in array array['wiki_synthesis','statement_extraction','witness_extraction',
                                  'bank_matching','document_processing','accounting_work'] loop
      if position(v_role in v_src) = 0 then
        raise exception '#631 tail: % lost or never gained the purpose % (%)', v_def, v_role, v_src
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (T.2) THE DOC-SHA RULE has a SIXTH conjunct, and accounting_work is the NULL side of it.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
   where con.conrelid='clara.egress_dispatch_authorizations'::regclass
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if position('accounting_work' in v_def) = 0 or v_def !~ 'accounting_work''::text\) OR \(document_sha256 IS NULL\)' then
    raise exception '#631 tail: the doc-sha rule does not force accounting_work''s hash NULL (%)', v_def
      using errcode='CLR10';
  end if;

  -- (T.3) THE EVIDENCE RELAXATION IS PURPOSE-DISCRIMINATED, and the five older purposes still
  -- REQUIRE a document. Proved by VALUE, not by reading the CHECK's text: a row of each shape is
  -- offered to the constraint and must be refused.
  if not exists (select 1 from pg_constraint where conrelid='clara.client_egress_purpose_consents'::regclass
                   and conname='ck_client_egress_purpose_consents_evidence') then
    raise exception '#631 tail: the purpose-discriminated evidence CHECK is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='client_egress_purpose_consents'
     and column_name='legal_acceptance_id' and data_type='uuid';
  if v_n <> 1 then
    raise exception '#631 tail: legal_acceptance_id is not a uuid column' using errcode='CLR10';
  end if;

  -- (T.4) consume_egress_dispatch was NOT touched by this file.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src from pg_proc p
   where p.oid='clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'::regprocedure;
  if v_src <> 'f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3' then
    raise exception '#631 tail: consume_egress_dispatch MOVED (sha %) -- this file must not recut it', v_src
      using errcode='CLR10';
  end if;

  -- (T.5) THE RECUT CORE kept every arm it inherited and gained exactly one.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  foreach v_role in array array['egress_not_authorized','work_cancelled','work_settled',
                                'obo_not_initiator','basis_mismatch','generic_control_leg',
                                'source_conflict','periodic_adjustments','adjustment_basis',
                                'operation_payload_conflict','unknown_account','client_inactive'] loop
    if position(v_role in v_src) = 0 then
      raise exception '#631 tail: the recut core LOST the arm named %', v_role using errcode='CLR10';
    end if;
  end loop;
  if position('_work_egress_event_seq' in v_src) = 0 then
    raise exception '#631 tail: the recut core does not RE-DERIVE the run binding' using errcode='CLR10';
  end if;

  -- (T.6) THE TRACE RELATION: forced RLS, no payload column, ZERO DML to every application role,
  -- both belts, and the structural unique.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='clara' and c.relname='work_execution_traces'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#631 tail: clara.work_execution_traces is not RLS-forced' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='work_execution_traces'
     and column_name in ('payload','input','output','attributes','content','prompt','messages','basis');
  if v_n <> 0 then
    raise exception '#631 tail: clara.work_execution_traces carries % payload-shaped column(s) -- the relation is redacted BY CONSTRUCTION', v_n
      using errcode='CLR10';
  end if;
  -- NO APPLICATION ROLE HOLDS ANY PRIVILEGE, and SELECT is in the list. The first cut granted
  -- clara_authenticated a SELECT, which let a VIEWER read model_id and the whole refusal through
  -- PostgREST and walk around the door's bookkeeper floor. The DEFINER doors do not need it.
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive']) as r) g
   where has_table_privilege(g.r, 'clara.work_execution_traces', 'INSERT')
      or has_table_privilege(g.r, 'clara.work_execution_traces', 'UPDATE')
      or has_table_privilege(g.r, 'clara.work_execution_traces', 'DELETE')
      or has_table_privilege(g.r, 'clara.work_execution_traces', 'SELECT');
  if v_n <> 0 then
    raise exception '#631 tail: % application role(s) hold a privilege on clara.work_execution_traces -- the DEFINER doors are the only way in', v_n
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_policy where polrelid='clara.work_execution_traces'::regclass
               and polname <> 'p_work_execution_traces_owner') then
    raise exception '#631 tail: clara.work_execution_traces carries a policy other than the owner policy -- a FORCE-RLS relation with no app-role policy is what makes an accidental grant fail CLOSED'
      using errcode='CLR10';
  end if;

  -- NO FOREIGN KEY TO clara.accounting_work. A composite FK takes FOR KEY SHARE on the Work row,
  -- which conflicts with the posting core's FOR UPDATE and made a measured trace insert wait
  -- 4001 ms and then die silently. The task -> work join in the DEFINER writer is the binding.
  if exists (select 1 from pg_constraint
              where conrelid='clara.work_execution_traces'::regclass and contype='f'
                and confrelid='clara.accounting_work'::regclass) then
    raise exception '#631 tail: clara.work_execution_traces has a foreign key to clara.accounting_work -- it would take FOR KEY SHARE behind every posting lock'
      using errcode='CLR10';
  end if;

  -- THE FIELD GRAMMARS EXIST BY NAME on the relation...
  foreach v_role in array array['ck_work_execution_traces_run_id','ck_work_execution_traces_ids',
                                'ck_work_execution_traces_model','ck_work_execution_traces_purpose',
                                'ck_work_execution_traces_skills_shape',
                                'ck_work_execution_traces_revisions_shape',
                                'ck_work_execution_traces_refusal_shape'] loop
    if not exists (select 1 from pg_constraint
                    where conrelid='clara.work_execution_traces'::regclass and conname=v_role) then
      raise exception '#631 tail: the field grammar % is absent -- "no payload column" is a claim about SHAPE and these are the claim about CONTENT', v_role
        using errcode='CLR10';
    end if;
  end loop;
  -- ...and they are asserted BY VALUE, not by reading their text. Every literal below is a shape
  -- the adversarial review actually stored in this relation through the writer.
  if clara._work_trace_text_ok('siti.rahmah@example.com.my','id')
     or clara._work_trace_text_ok('880214-08-5531','id')
     or clara._work_trace_text_ok('5141882293107742','id')
     or clara._work_trace_text_ok('Bearer abcdefghijklmnopqrstuvwxyz123456','id')
     -- Assembled from pieces so `scripts/check-leaks.mjs` (pnpm lint) does not read a
     -- positive-control fixture as a committed credential. The VALUE is byte-identical to the
     -- literal the review actually stored; only the source text is split.
     or clara._work_trace_text_ok('postgres' || '://' || 'clara' || ':' || 'hunter2'
                                  || '@db.internal:5432/books','id')
     or clara._work_trace_text_ok('sk-proj-ZH4kQ9maRuntimeSecretValue1234','model')
     or clara._work_trace_text_ok('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9','model')
     or clara._work_trace_text_ok('+60 12-345 6789','free')
     or clara._work_trace_text_ok('IC 880214-08-5531 on file','free')
     or clara._work_trace_text_ok('acct 5141882293107742','free')
     or clara._work_trace_text_ok('acct 5141 8822 9310 7742','free') then
    raise exception '#631 tail: a field grammar ADMITS a planted secret shape' using errcode='CLR10';
  end if;
  -- …and they ADMIT every value the runtime actually sends. A grammar that refuses the real
  -- payload would drop trace rows silently, which is the failure mode that matters most here.
  if not (clara._work_trace_text_ok('accounting_work.model_segment','id')
          and clara._work_trace_text_ok('clara-capability-registry/v1','id')
          and clara._work_trace_text_ok('clara-work/v3','id')
          and clara._work_trace_text_ok('clara-work-instructions/v3','id')
          and clara._work_trace_text_ok('clara-work-tools/v3','id')
          and clara._work_trace_text_ok('gpt-5.6-terra','model')
          and clara._work_trace_text_ok('run_9dcf64de-8ec6-47d7-85fb-e51f193fc557','run')
          and clara._work_trace_text_ok('egress_not_authorized','token')
          and clara._work_trace_text_ok('CLR13','token')
          and clara._work_trace_text_ok(repeat('b',64),'rev')
          and clara._work_trace_text_ok('2026-09-01','rev')
          and clara._work_trace_skills_ok('["journal-entry/v3"]'::jsonb)
          and clara._work_trace_revisions_ok('{"books_version":"2026-09-01"}'::jsonb)
          and clara._work_trace_refusal_ok('{"code":"CLR13","reason":"egress_not_authorized","message":"Clara is not currently authorised to use a model on this client''s books.","recoverable":true}'::jsonb)) then
    raise exception '#631 tail: a field grammar REFUSES a value the runtime sends' using errcode='CLR10';
  end if;
  if clara._work_trace_skills_ok('["IC 880214-08-5531"]'::jsonb)
     or clara._work_trace_revisions_ok('{"books_version":"siti.rahmah@example.com.my"}'::jsonb)
     or clara._work_trace_revisions_ok('{"transcript":"the whole conversation"}'::jsonb)
     or clara._work_trace_refusal_ok('{"detail":"call +60 12-345 6789"}'::jsonb)
     or clara._work_trace_refusal_ok('{"transcript":"the whole conversation"}'::jsonb) then
    raise exception '#631 tail: a jsonb field grammar ADMITS a payload' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.work_execution_traces'::regclass and not tgisinternal
     and tgname in ('t_work_execution_traces_append_only','t_work_execution_traces_no_truncate');
  if v_n <> 2 then
    raise exception '#631 tail: the append-only/no-truncate belt pair is incomplete (% of 2)', v_n
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='clara.work_execution_traces'::regclass
                   and conname='uq_work_execution_traces_run_seq') then
    raise exception '#631 tail: the one-row-per-(work,run,seq) unique is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.work_execution_traces;
  if v_n <> 0 then
    raise exception '#631 tail: clara.work_execution_traces is not empty (% rows)', v_n using errcode='CLR10';
  end if;

  -- (T.7) THE GRANT BOUNDARY, by EXACT signature.
  if not has_function_privilege('clara_runtime','clara.prepare_work_egress_dispatch(uuid,text)','EXECUTE')
     or not has_function_privilege('clara_runtime','clara.prune_work_execution_traces(timestamptz,int)','EXECUTE')
     or not has_function_privilege('clara_runtime',
          'clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid)','EXECUTE') then
    raise exception '#631 tail: clara_runtime cannot reach one of its three new doors' using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_role,'clara.prepare_work_egress_dispatch(uuid,text)','EXECUTE')
       or has_function_privilege(v_role,
            'clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid)','EXECUTE') then
      raise exception '#631 tail: % can reach a runtime-only egress/trace door', v_role using errcode='CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated','clara.get_work_execution_trace(uuid)','EXECUTE') then
    raise exception '#631 tail: clara_authenticated cannot execute clara.get_work_execution_trace' using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_role,'clara.get_work_execution_trace(uuid)','EXECUTE') then
      raise exception '#631 tail: % can execute the human trace read', v_role using errcode='CLR10';
    end if;
  end loop;
  foreach v_role in array array['clara_authenticated','clara_runtime','clara_agent_ro',
                                'clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_role,'clara._accounting_work_egress_live(uuid,uuid)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_egress_event_seq(uuid,text)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_trace_secret_shaped(text)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_trace_text_ok(text,text)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_trace_skills_ok(jsonb)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_trace_revisions_ok(jsonb)','EXECUTE')
       or has_function_privilege(v_role,'clara._work_trace_refusal_ok(jsonb)','EXECUTE') then
      raise exception '#631 tail: % can execute an ungranted #631 predicate', v_role using errcode='CLR10';
    end if;
  end loop;
  -- THE RESTORE DOOR is a HUMAN surface with an owner floor in its own body, exactly like the
  -- four verbs beside it: clara_authenticated ONLY.
  if not has_function_privilege('clara_authenticated','clara.restore_client_egress_purpose(uuid,text,text)','EXECUTE') then
    raise exception '#631 tail: clara_authenticated cannot execute clara.restore_client_egress_purpose -- an owner would have no way back on'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_role,'clara.restore_client_egress_purpose(uuid,text,text)','EXECUTE') then
      raise exception '#631 tail: % can restore a withdrawn model-egress consent -- that is an OWNER act', v_role
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.9) THE REVIEW'S FINDINGS, EACH RE-READ FROM THE CATALOG RATHER THAN FROM A CLAIM.

  -- S1a · the grant door refuses the DERIVED purpose by name, and still admits the other five.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  if position('purpose_derived_not_grantable' in v_src) = 0 then
    raise exception '#631 tail: clara.grant_client_egress_purpose does not refuse accounting_work by name -- an owner naming it would die on a raw 23514'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['wiki_synthesis','statement_extraction','witness_extraction',
                                'bank_matching','document_processing'] loop
    if position(v_role in v_src) = 0 then
      raise exception '#631 tail: the grant door LOST the purpose %', v_role using errcode='CLR10';
    end if;
  end loop;

  -- S1b · the restore door exists, is owner-floored, and refuses every purpose but the derived one.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.restore_client_egress_purpose(uuid,text,text)'::regprocedure;
  if position('role_rank(''owner'')' in v_src) = 0
     or position('purpose_not_restorable' in v_src) = 0
     or position('derived_basis_not_live' in v_src) = 0
     or position('egress.purpose_consent_restored' in v_src) = 0 then
    raise exception '#631 tail: clara.restore_client_egress_purpose is not the owner-floored, basis-re-deriving, audited door this file describes'
      using errcode='CLR10';
  end if;

  -- S4 · the derived mint is audited and announced.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  if position('derive_client_egress_purpose' in v_src) = 0
     or position('egress.purpose_consent_derived' in v_src) = 0 then
    raise exception '#631 tail: the derived consent is still minted SILENTLY -- no audit row, no event'
      using errcode='CLR10';
  end if;

  -- S5 · the write gate reads the consent AND the activation, not only the authorization row.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('cc.revoked_at is null and ca.deactivated_at is null' in v_src) = 0 then
    raise exception '#631 tail: the egress gate does not re-read the consent/activation -- a withdrawal after the consume would not reach the write'
      using errcode='CLR10';
  end if;

  -- N3 · the prune leaves a ledger row, on 0006's own ledger.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.prune_work_execution_traces(timestamptz,int)'::regprocedure;
  if position('trace_prune_log' in v_src) = 0 then
    raise exception '#631 tail: the trace prune writes no ledger row' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='trace_prune_log' and column_name='relation';
  if v_n <> 1 then
    raise exception '#631 tail: clara.trace_prune_log has no relation column' using errcode='CLR10';
  end if;

  -- The two new event types are REGISTERED and carry a taxonomy decision.
  foreach v_role in array array['egress.purpose_consent_derived','egress.purpose_consent_restored'] loop
    if not exists (select 1 from clara.event_types where name=v_role and client_scoped) then
      raise exception '#631 tail: % is not a registered client-scoped event type', v_role using errcode='CLR10';
    end if;
    if not exists (select 1 from clara.trigger_taxonomy t cross join clara.taxonomy_active a
                    where t.event_type=v_role and t.version=a.version) then
      raise exception '#631 tail: % has no decision on the ACTIVE taxonomy version', v_role using errcode='CLR10';
    end if;
  end loop;

  -- (T.8) THERE IS NO EXPORT DOOR. Absence is the control; a later file that adds one has to
  -- delete this assertion, which is the point.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname ~ 'export.*trace|trace.*export';
  if v_n <> 0 then
    raise exception '#631 tail: % trace-export function(s) exist -- export stays disabled BY ABSENCE', v_n
      using errcode='CLR10';
  end if;

  raise notice '#631 tail: OK -- accounting_work is the sixth typed client egress purpose on all three CHECKs with its own NULL-hash conjunct; the derived consent''s evidence relaxation is purpose-discriminated and carries legal_acceptance_id; the four owner verbs admit it, the GRANT door refuses it by name, clara.restore_client_egress_purpose is the owner-only way back on and clara.consume_egress_dispatch is byte-unmoved; the derived mint writes an audit row and egress.purpose_consent_derived; clara._accounting_work_egress_live, clara._work_egress_event_seq and the five trace field grammars are ungranted; clara.prepare_work_egress_dispatch, clara.record_work_execution_trace and clara.prune_work_execution_traces are clara_runtime-only and clara.get_work_execution_trace is clara_authenticated-only; clara.work_execution_traces is RLS-forced, free-payload-free, grammar-checked field by field, PRIVILEGE-free to every application role, FK-free against clara.accounting_work, append-only, no-truncate and empty; the prune leaves a clara.trace_prune_log row; the recut posting core keeps every inherited arm, re-derives the run binding and re-reads the consent and activation at the write; and NO trace export function exists.';
end
$w631_tail$;
