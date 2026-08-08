-- 0051_extraction_recovery_door.sql -- §7-A ACCEPTANCE FINDING F6 (task #31) + the ADR-062
-- extraction-recovery-door registration, built as ONE item per the Wave E contract E-R1:
-- a terminally-FAILED FIRST facts extraction has no recovery path.
--
-- GOVERNING EVIDENCE, in the order it was minted:
--   * ADR-062 (docs/PROJECTLOG-ARCHIVE-ADR-060-064.md:18) -- "a terminally-failed document
--     ingest has no recovery door", registered from the 2026-08-06 Azure DI credential
--     outage.
--   * ADR-064 §3 / F6 (same file:31) -- the real-document exhibit, with FOUR doors measured
--     closed: request_reextraction refuses CLR16 - content-addressed re-ingest ADOPTS the
--     same document_id and spawns no attempt - terminal document_processing_tasks rows are
--     IMMUTABLE - the only working path is an out-of-product re-export.
--   * The exhibit itself, quoted verbatim: docs/plan/wave-7a-acceptance-h1.md:540-604
--     (E6, LUMINOUS / document c597a24b-c6e2-4a25-aa1a-3ba0c20cb165) -- "invoice_facts
--     FAILED on its only-ever attempt: document_processing_tasks status='failed',
--     error_code='internal', attempt_count=1 (OCR on the SAME document completed fine)".
--   * docs/plan/wave-e-contract.md E-R1 (lines 20-24) -- "F6 merges with the ADR-062
--     extraction-recovery door (ONE item)", the Wave E build's FIRST STRIKE, full Law-1
--     ladder.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). The
-- frontier probe below pins 0050_egress_release_skip_consent, the last migration on main
-- when this file was authored. If the F6-F9 batch lands more than one migration, this file
-- is renumbered per RENUMBER.md and the pin re-read; it names only a migration that is
-- already applied ahead of it, never a sibling in the same merge train.
--
-- =====================================================================================
-- PROVENANCE OF THE BODY BEING PATCHED -- read this before touching the admission chain.
-- =====================================================================================
-- The LIVE body of clara.request_reextraction(uuid,text,text) is NOT 0022's. Its lineage,
-- read off the migration files rather than assumed:
--   0022_extraction_slice_x1.sql:170   the original CREATE (two admission doors).
--   0025_receipt_routing.sql:273       CoR -- the kind gate widens to 'receipt', the
--                                      receipt-backfill door, the `for update` TOCTOU fix.
--   0026_lane_widen.sql:994            CoR -- the LAST full CREATE OR REPLACE. Three
--                                      admission doors ('reextraction' / 'receipt_backfill'
--                                      / 'filed_bootstrap'), v_admission threaded into both
--                                      the audit row and the receipt, the corrected
--                                      exhausted-retry message.
--   0040_wave_c_c_tieout.sql:6609      S4.13 -- a DYNAMIC splice (pg_get_functiondef +
--                                      count-guarded replace) adding the bank_statement
--                                      re-fire branch, which RETURNS before the admission
--                                      chain is ever reached and DELEGATES to
--                                      clara._enqueue_invoice_facts_core.
-- Because 0040 patched the live catalog rather than the file text, THERE IS NO FILE IN THIS
-- REPO THAT CONTAINS THE LIVE BODY. A `create or replace` re-typed from 0026's text would
-- silently revert 0040 S4.13 -- the exact failure 0050's own header records having made once
-- ("the first cut of this migration recut 0009's body by mistake and silently dropped
-- statement_facts"). This migration therefore follows the 0046 S7.1 / 0048 S1 law: HARVEST
-- pg_get_functiondef FROM THE LIVE CATALOG, patch ONE anchor under a count guard, execute.
-- Never re-typed.
--
-- =====================================================================================
-- THE DEFECT, AND THE ONE THING THAT WAS WRONG IN EVERY SUMMARY OF IT
-- =====================================================================================
-- Every prior write-up of F6 (including the brief this file was built from) assumed a
-- terminally-failed facts attempt leaves a `clara.document_extractions` row with
-- status='failed', and that the admission gate could therefore be widened by reading the
-- extraction table. IT DOES NOT. Measured, not assumed:
--
--   * clara.fail_invoice_facts (0009_coding_floor.sql:2152-2178) is the ONLY terminal-fail
--     writer for lane='invoice_facts'. Its whole body is: lock the task, replay-if-already-
--     failed, refuse-if-not-running, normalise the reason, `update clara.
--     document_processing_tasks set status='failed',error_code=v_code,finished_at=now()`,
--     refund the processing call, audit, event. IT WRITES NO clara.document_extractions
--     ROW AT ALL.
--   * clara.persist_invoice_facts (live body 0026_lane_widen.sql:674+) inserts the
--     engine_kind='invoice_facts' extraction row ONLY on the success path -- the insert at
--     0026:709-717 hard-codes status='done'; the function has no failure branch that
--     reaches the extraction table.
--   * clara.persist_document_extraction (live body 0016:3737) DOES write a failed row --
--     but 0026's own §G tail (0026:1783) records that it is restricted to the
--     ocr/structured_parse lanes and REFUSES an invoice_facts/local_facts caller outright.
--     It is not on this lane's path.
--
-- So the LUMINOUS shape is: ONE document_processing_tasks row, lane='invoice_facts',
-- status='failed', error_code='internal' -- and ZERO document_extractions rows for that
-- lane. The 0026 admission chain's first door asks
--     exists(... document_extractions ... engine_kind='invoice_facts' and status='done')
-- which is false; 'receipt_backfill' is false (kind='invoice'); 'filed_bootstrap' requires
-- ZERO tasks in v_lane and this document has one; so the chain falls to
--     raise exception 'no completed extraction to re-extract' using errcode = 'CLR16'
-- (0026:1146) -- byte-for-byte the refusal the acceptance record quotes.
--
-- THE ADMISSION READ MUST THEREFORE BE OF THE TASK, NOT OF THE EXTRACTION. That is also the
-- only shape compatible with evidence law 2 ("absence is not evidence, and a derived state
-- is not evidence"): "no extraction row exists" is an ABSENCE and is shared by a
-- never-started document, a mid-flight document, and a failed one. `status='failed'` on a
-- task row is a POSITIVE read of a state some writer actually committed -- and TWO
-- independent schema facts make it TERMINAL by construction, so no second column has to be
-- consulted: ck_processing_task_terminal (0007_document_pipeline.sql:175,
-- `(status in ('done','failed')) = (finished_at is not null)`), and the live transition
-- trigger, which admits no transition whose OLD status is 'failed' at all
-- (0011_daily_loop.sql:1298-1307) and refuses any UPDATE of a terminal row one line earlier
-- (0011:1292).
--
-- =====================================================================================
-- THE CUT: ONE NEW ADMISSION DOOR, APPENDED LAST. Nothing that is admitted today changes.
-- =====================================================================================
-- A FOURTH door, 'failed_retry', is spliced in as the LAST elsif -- after 'filed_bootstrap',
-- immediately before the else-raise. Placing it last is the whole containment argument:
--
--   * Every call the chain admits TODAY still takes the SAME door, with the SAME
--     v_admission label on its audit row and its receipt. A receipt whose kind is 'receipt'
--     AND whose lane carries a failed task keeps answering 'receipt_backfill', because that
--     door is still reached first. This migration cannot change any existing admission's
--     observable behaviour, because it adds no branch any existing admission can reach.
--   * The ONLY population whose answer changes is the one that reaches the else-raise
--     today: a document whose facts lane holds a terminally-failed task and no successful
--     extraction. That is exactly F6's population, and it is exactly the population the
--     else-raise was refusing wrongly.
--   * The genuinely-never-extracted document -- packages/db/tests/x1-reextraction.test.mjs:
--     110-129, "a document with NO completed extraction is refused" -- STILL REFUSES. Its
--     lane task is the 0009 coding-time backstop's row, which is 'queued', never 'failed',
--     so the new door's positive read finds nothing and the chain still falls to the raise.
--     That cell is required to stay green UNMODIFIED and is not touched by this migration.
--
-- The new door reuses, untouched, everything below it in the same function: the op-key
-- reservation and its request hash, the in-flight short-circuit (a queued/held_egress/
-- running task in this lane is RETURNED, never double-queued), the bounded 3-attempt
-- version-race loop, the page-budget reservation and its CLR18 branch, the audit row, and
-- the receipt. ADR-062's requirement -- "admit a NEW attempt row per (document,lane), NEVER
-- mutate or reopen the terminal row" -- is satisfied by that existing machinery, not by
-- anything new here: the loop's `select coalesce(max(version_n),0)+1 ... insert ... on
-- conflict do nothing` mints a fresh row at the next version and never issues an UPDATE
-- against the failed one.
--
-- WHY THE SECOND CONDITION IS STATED EVEN THOUGH THE CHAIN ALREADY IMPLIES IT. Reaching
-- this elsif proves door 1 was false, i.e. no done invoice_facts extraction exists -- so
-- `and not exists(... status='done')` is logically redundant TODAY. It is written anyway so
-- the door is correct ON ITS OWN, independent of its position in the chain: a future
-- reordering, or a door inserted above it, must not be able to turn this branch into a
-- silent re-extraction of a document that already extracted successfully. A guard whose
-- correctness depends on where it sits is the class of defect the review laws exist for.
--
-- =====================================================================================
-- LANE SYMMETRY, MEASURED RATHER THAN SCOPED
-- =====================================================================================
-- The predicate keys on v_lane, so it covers BOTH facts lanes the kind/mime gate can
-- produce ('invoice_facts' for pdf/image, 'local_facts' for xml). It is nonetheless INERT
-- for local_facts today, and the reason is worth writing down because it is a measurement,
-- not a scoping decision:
--   * clara.fail_invoice_facts's own guard is `if not found or t.lane<>'invoice_facts'`
--     (0009:2157) -- grepped across every migration 0001-0050, NEVER widened (0015/0016/
--     0022/0023/0026/0028 widened persist_invoice_facts to the pair, and 0038 widened
--     _reserve_processing_call, but the FAIL verb was left invoice_facts-only).
--   * packages/runtime/lib/local-facts.mjs:128-132 calls it anyway and SWALLOWS the
--     refusal, so a non-retryable local_facts fault leaves the task 'running' and the
--     lane's own stranded-requeue path (local-facts.mjs:151-168) re-drives it.
--   * The claim-time attempt cap that CAN terminalise a task is scoped to
--     `t.lane in ('invoice_facts','statement_facts')` (0038:6907), not local_facts.
-- So no writer in this schema can currently put a local_facts task into status='failed';
-- the door covers the lane by construction and will start working the day one can, with no
-- further migration. The statement lanes never reach this chain at all -- 0040 S4.13's
-- bank_statement branch RETURNS before it.
--
-- =====================================================================================
-- WHAT IS DELIBERATELY UNTOUCHED (each re-asserted in the tail)
-- =====================================================================================
--   * clara._tf_processing_task_update -- the trigger that makes terminal task rows
--     immutable (CLR16) and undeletable (CLR08). Its LIVE body is 0011_daily_loop.sql:
--     1287-1310, NOT 0007's original (0009:69 and 0011:1287 both recut it); the immutability
--     line is 0011:1292 and no legal transition at 0011:1298-1307 exits 'failed'. Door (3)
--     of ADR-064 §3 STAYS CLOSED: this migration mints a sibling row and never reopens the
--     failed one. The prestate reads that refusal POSITIVELY before relying on it and the
--     tail compares the trigger function's source against a prestate hash.
--   * clara._enqueue_invoice_facts_core (live body 0038:6199) -- a separate machine with
--     four live automatic callers and DIFFERENT cap semantics; 0022's own header
--     (0022:151-156) records why this verb owns its logic instead of widening that core.
--     The tail compares its source against a prestate hash AND re-asserts 0040's own
--     property (0040:7635-7644): request_reextraction still DELEGATES to it on the
--     statement path, and still carries EXACTLY ONE direct task INSERT -- so this splice
--     provably grew no second enqueue.
--   * The kind gate and the mime gate (0026:1053-1064) -- byte-untouched. A document with
--     no classified kind is still refused, which is why the ADR-062 FAILED-INGEST half is
--     NOT closed here (see the next section).
--   * The three existing doors, the in-flight short-circuit, the bounded retry, the page
--     budget, the audit shape, the receipt shape, the CLR16 refusal message.
--   * THE GRANTS. request_reextraction stays clara_authenticated-ONLY with zero
--     clara.wake_fn_allowlist rows -- ADR-047 Q4's structural cost bound: no numeric
--     per-document cap was ever added because no machine lane can execute the verb at all.
--     Widening the ADMISSION must not widen the REACH. CREATE OR REPLACE preserves an
--     ACL by Postgres's own rule; the tail PROVES it by comparing proacl before and after,
--     and independently re-reads the role-by-role privilege and the allowlist count.
--
-- =====================================================================================
-- WHAT THIS MIGRATION DOES *NOT* CLOSE -- the ADR-062 failed-INGEST half, stated plainly
-- =====================================================================================
-- ADR-062's registration names the failed INGEST (lane 'ocr' / 'structured_parse') -- the
-- credential outage "that failed seven fresh ingests" -- and PROJECTLOG.md:128 hangs Gate
-- P's four waiting manual bills off it. THAT HALF IS NOT BUILT HERE, deliberately, and the
-- reason is a measured runtime fact rather than a scoping preference:
--
--   * packages/runtime/workflows/documentIngest.behavior_v2.mjs:176-177 --
--       const task = await services.readTaskMeta(taskId);
--       if (!task) throw Object.assign(new Error(`document task ${taskId} has no durable
--                                    runtime metadata`), { code: "internal" });
--     and it then reads task.storageKey / task.sha256 / task.mime / task.format (:190-193).
--     That file is @frozen AND deployed (frozen-workflows.json).
--   * The sidecar it reads (spool `task-<id>.json`) is keyed BY TASK ID and is written only
--     by the intake flow, for the task the intake itself minted
--     (packages/runtime/lib/intake.mjs:366-383). A DB-minted task has none.
--   * packages/runtime/workflows/documentIngest.impl.ts:56-59 (also @frozen + deployed)
--     reads ONLY `result.status` off the claim receipt and calls noteClaim(taskId, status,
--     runId) -- the storage_path/sha256/mime_type/byte_size that clara.
--     claim_document_processing_task returns (0038:6942-6946) are DISCARDED inside the
--     frozen step, so no unfrozen code ever sees them.
--   * packages/runtime/lib/intake.mjs:450-455 -- noteDocumentTaskClaim uses
--     mergeTaskMeta(..., {requireExists:true}) and THROWS for a sidecar-less task, by
--     design ("A claim with no sidecar at all is a real bug worth surfacing loud").
--   * The runtime holds NO SELECT on clara.documents -- PIN-AB-6, recorded at
--     packages/runtime/lib/reconciler-documents.mjs:157-162 ("The former clara.documents
--     join always 42501'd on live ... deliberately"). And `format` is not a column of
--     clara.documents at all; it is an intake-time detection (intake.mjs:348,374).
--
-- Therefore an ocr/structured_parse task minted by this verb would be dispatched by
-- enqueueForLane (reconciler-documents.mjs:75) and then die on the missing sidecar. Making
-- it live requires a NEW definer verb granted to clara_runtime that returns a task's
-- transport metadata without a claim -- i.e. a deliberate widening of the PIN-AB-6
-- boundary -- plus an unfrozen self-heal in intake.mjs. That is a security-boundary
-- decision, not an implementation detail, and it is left to the owner/orchestrator rather
-- than smuggled into a guard fix. REGISTERED, NOT BUILT. (A second candidate shape, not
-- evaluated here: teach clara.finalize_document_intake's ADOPTED branch to mint a recovery
-- attempt when the ingest lane is terminally failed, which would ride the intake path that
-- already holds all four transport fields and needs no new grant.)
--
-- =====================================================================================
-- KNOWN, PRE-EXISTING, DELIBERATELY NOT DUPLICATED: the claim-time attempt cap
-- =====================================================================================
-- clara.claim_document_processing_task (0038:6907-6924) fails a task with
-- error_code='attempt_cap' once sum(attempt_count) over the document's tasks IN THAT LANE
-- reaches 3. That control is unchanged and still fires on every task this door mints. It is
-- more REACHABLE through this door than through 'reextraction' (every prior attempt here is
-- a failure), so state it rather than discover it: a document whose facts lane has already
-- burned three attempts will be admitted, minted, and then terminated by the cap at claim
-- time with that named error_code. Re-deriving the cap inside the admission gate was
-- rejected for 0050's own recorded reason -- two copies of one rule is drift risk, and the
-- lane that owns the control already answers, by name, one step later. The LUMINOUS exhibit
-- sits at attempt_count=1, so two attempts remain for it.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE (packages/db/README.md:99-118)
-- =====================================================================================
-- This migration replaces the body of an audited writer, so the D1 obligation applies once
-- it ships to a live runtime: quiesce the human RPCs that reach request_reextraction, apply,
-- resume. The change is strictly WIDENING (a branch added ahead of a raise), so an
-- interleaved apply cannot corrupt an in-flight call -- but the quiesce remains the recorded
-- procedure and this file does not license skipping it. THIS PR DOES NOT DEPLOY OR APPLY
-- ANYTHING LIVE.
--
-- NO clara.migration_receipts ROW. That channel (0049:1197) exists for migrations that
-- MEASURE an estate at apply time and must hand a number to a ceremony. This file changes
-- one function body and backfills nothing, so it has no measurement to persist; 0050, the
-- other pure-body fix in this train, likewise carries none.
--
-- CELLS: packages/db/tests/x51-extraction-recovery.test.mjs (the admission battery, the
-- refusal battery, the bookkeeper floor + the structural cost bound, and the forced
-- version-race variant) and two added cells in packages/db/tests/x1-supersede.test.mjs (a
-- recovery that settles 'done' becomes the FIRST invoice_facts extraction the document has
-- ever had -- the failed attempt left no row to supersede -- and takes the authority
-- pointer; and a LATER re-extraction of that recovered document supersedes normally through
-- the ordinary door). packages/db/tests/x1-reextraction.test.mjs is UNMODIFIED by design:
-- its negative cell at :110-129 is the regression this widening must not cause, and a cell
-- edited alongside the change it exists to catch has stopped being evidence.
set local statement_timeout = '2min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim the header makes about the body being patched is
-- measured here, before anything changes. Stashed into a temp table so the tail compares
-- against what THIS run actually saw rather than a fresh assumption (0047/0048's idiom).
-- =====================================================================
create temp table _x51_pre(
  secdef      boolean not null,
  config      text    not null,
  acl         text    not null,
  core_hash   text    not null,
  trigger_hash text   not null
) on commit drop;

do $prestate51$
declare
  v_n int; v_def text; v_count int; v_secdef boolean; v_config text; v_acl text;
  v_anchor text; v_key text; v_core text; v_trg text;
begin
  -- (0.1) FRONTIER.
  select count(*) into v_n from clara.schema_migrations
    where version = '0050_egress_release_skip_consent';
  if v_n <> 1 then
    raise exception '0051 prestate: 0050_egress_release_skip_consent is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- (0.2) EXACTLY ONE request_reextraction overload, at the pinned 3-arity signature.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'request_reextraction';
  if v_n <> 1 then
    raise exception '0051 prestate: expected exactly ONE clara.request_reextraction overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara.request_reextraction(uuid,text,text)'::regprocedure;

  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure)
    into v_def;
  if v_def is null then
    raise exception '0051 prestate: clara.request_reextraction is GONE' using errcode = 'CLR10';
  end if;

  -- (0.3) ALREADY-APPLIED GUARD. Fail loudly rather than splicing a second door in.
  if position('failed_retry' in v_def) <> 0 then
    raise exception '0051 prestate: the failed-retry door is already installed -- 0051 (or an equivalent recut) has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE FULL LINEAGE, marker by marker. 0026 §G's three doors + its TOCTOU lock + the
  -- v_admission diagnostic, AND 0040 S4.13's statement branch + its delegation to the
  -- router. A body missing any of these is not the body this file was authored against, and
  -- patching it would build on a reverted base.
  foreach v_key in array array['''reextraction''', '''receipt_backfill''', '''filed_bootstrap''',
      'where id = p_document for update', 'v_admission', '''statement_refire''',
      'clara._enqueue_invoice_facts_core'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0051 prestate: request_reextraction is missing the lineage marker % -- the live body is not the 0026 section-G recut as spliced by 0040 S4.13, and this patch would build on a reverted base', v_key
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.5) 0040's OWN invariant, re-read here BEFORE the splice so the tail's identical read
  -- afterwards means something: exactly ONE direct task INSERT in the whole body (0026's
  -- bounded-retry loop). 0040:7639-7644 asserts this to prove the statement path did not
  -- grow its own enqueue; this migration must not grow one either.
  v_count := (length(v_def) - length(replace(v_def, 'insert into clara.document_processing_tasks', '')))
    / length('insert into clara.document_processing_tasks');
  if v_count <> 1 then
    raise exception '0051 prestate: request_reextraction carries % direct task INSERT(s), expected exactly 1 (0026''s bounded-retry loop) -- the body is not the one this file accounts for', v_count
      using errcode = 'CLR10';
  end if;

  -- (0.6) THE ANCHOR -- the tail of the admission chain -- occurs EXACTLY ONCE.
  v_anchor := '    v_admission := ''filed_bootstrap'';' || chr(10)
    || '  else' || chr(10)
    || '    raise exception ''no completed extraction to re-extract'' using errcode = ''CLR16'';' || chr(10)
    || '  end if;';
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0051 prestate: the admission-chain tail anchor occurs % times in the live body (expected 1) -- this is not the body this migration was authored against', v_count
      using errcode = 'CLR10';
  end if;

  -- (0.7) THE TWO FUNCTIONS THIS FILE PROMISES NOT TO TOUCH. Hashed now, compared in the
  -- tail. A NAME check would only prove something is spelled the same (review law 3); a
  -- source hash proves the body itself is byte-identical.
  select p.prosrc into v_core from pg_proc p
    where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_core is null then
    raise exception '0051 prestate: clara._enqueue_invoice_facts_core(uuid) is GONE' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_trg from pg_proc p
    where p.oid = 'clara._tf_processing_task_update()'::regprocedure;
  if v_trg is null then
    raise exception '0051 prestate: clara._tf_processing_task_update() is GONE' using errcode = 'CLR10';
  end if;
  -- The immutability the whole ADR-062 shape depends on, read POSITIVELY before we rely on
  -- it: no legal transition exits 'failed', and DELETE is refused.
  if position('terminal document processing task is immutable' in v_trg) = 0 then
    raise exception '0051 prestate: _tf_processing_task_update no longer refuses a terminal-row UPDATE -- this migration''s whole premise (mint a sibling, never reopen) assumes that refusal is live'
      using errcode = 'CLR10';
  end if;

  -- (0.8) STASH SECURITY DEFINER / search_path / ACL / the two source hashes.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure;
  if not v_secdef then
    raise exception '0051 prestate: clara.request_reextraction is not SECURITY DEFINER -- refusing to re-ship a body whose privilege shape this file does not recognise'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0051 prestate: clara.request_reextraction carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x51_pre(secdef, config, acl, core_hash, trigger_hash)
    values (v_secdef, v_config, v_acl,
      encode(sha256(convert_to(v_core, 'UTF8')), 'hex'),
      encode(sha256(convert_to(v_trg, 'UTF8')), 'hex'));

  raise notice '0051 prestate: clean (frontier 0050, one request_reextraction overload, the 0026 section-G + 0040 S4.13 lineage intact, one task INSERT, the admission-chain anchor occurs exactly once, the terminal-row trigger is live)';
end
$prestate51$;

-- THE GRANT FLOOR, read before the splice so section 2's comparison is against a MEASURED
-- baseline rather than against this file's belief about it.
--
-- IN ITS OWN BLOCK, DELIBERATELY, and the reason is a lint contract rather than a style
-- preference. scripts/check-wiki-dynamic-sql.mjs classifies any `do` block that mentions
-- pg_get_functiondef AND the token `execute` as a change-of-record PATCH, then scans that
-- block's quoted LITERALS as if they were the body being installed (wiki-lint-checks.mjs,
-- parseCoRPatches + the fragment rule). The privilege probes below are spelled
-- has_function_privilege(..., 'execute'), so folding them into the functiondef-bearing
-- blocks makes the linter read the string 'execute' as an installed dynamic statement and
-- fail closed -- correctly, by its own fail-closed design. Splitting is not a way around the
-- rule: this block installs nothing and reads no function body, so it is genuinely not a
-- patch site. It is the same split 0050's tail already has (that file reads p.prosrc, never
-- pg_get_functiondef, alongside its own has_function_privilege arms).
do $prestate51_grants$
declare v_n int;
begin
  if not has_function_privilege('clara_authenticated',
      'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute') then
    raise exception '0051 prestate: clara_authenticated does not hold EXECUTE on request_reextraction -- the bookkeeper floor this file preserves is not there to preserve'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.wake_fn_allowlist where function_name = 'request_reextraction';
  if v_n <> 0 then
    raise exception '0051 prestate: request_reextraction already carries % wake_fn_allowlist row(s) -- ADR-047 Q4''s structural cost bound is that there are NONE, and this file cannot preserve a floor that is already breached', v_n
      using errcode = 'CLR10';
  end if;
  raise notice '0051 prestate grants: clean (clara_authenticated holds EXECUTE, zero wake_fn_allowlist rows)';
end
$prestate51_grants$;

-- =====================================================================
-- SECTION 1 -- THE SPLICE. Harvested from the live catalog, patched at ONE anchor under a
-- count guard, executed. Never re-typed (the 0046 S7.1 / 0048 S1 law; re-typing would
-- silently revert 0040 S4.13's statement branch).
-- =====================================================================
set role clara_fn_owner;
do $splice51$
declare
  v_def text; v_next text; v_anchor text; v_repl text; v_count int; v_frm text;
begin
  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure)
    into v_def;

  -- EDIT 0 (review follow-through, 0024's ruled ordering) -- MOVE THE OP-KEY RESERVATION
  -- ABOVE THE ADMISSION CHAIN. Making the failed_retry door read the lane's NEWEST task is
  -- correct, but it turns the admission into a STATE-DEPENDENT branch that the state a
  -- successful first call itself creates can flip: once the recovery is queued, a caller
  -- replaying the SAME op_key was refused CLR16 instead of receiving its stored receipt --
  -- so a lost ack became indistinguishable from a refusal, on a verb whose whole retry
  -- contract is that it is not. 0024_fail_classify.sql:45-55 already ruled this exact class,
  -- in its own words: "that only holds if the op_key reservation runs BEFORE the task-state
  -- shortcut ... Ordering the reservation first makes a same-key replay return the identical
  -- stored jsonb, no exceptions." Nothing else moves, and a refusal still costs nothing: a
  -- raise rolls the reservation back inside this same transaction (0026's own note on the
  -- bounded-retry raise). The 0040 statement branch is unaffected -- it takes its OWN
  -- reservation and RETURNS before this point is ever reached. The anchor includes the
  -- comment above the call precisely so it cannot match that branch's identical two lines.
  v_frm := $r0$  -- The request hash covers EVERY argument that reaches a stored column or an audit row.
  -- An argument left OUT is one a caller can change under a re-used op_key and have
  -- silently ignored — so a corrected reason under the old key is an honest CLR10, not a
  -- stale receipt for the request they were trying to fix.
  v_dedupe := clara._reserve_op(c.firm, 'request_reextraction', p_op_key,
    clara._hash(jsonb_build_object('d', p_document, 'r', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;$r0$;
  v_count := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_count <> 1 then
    raise exception '0051 S1 edit 0: the op-key reservation block appears % times (expected 1)', v_count using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm, $r1$  -- [0051] the op-key reservation moved ABOVE the admission chain (0024:45-55).$r1$);

  v_frm := $r2$  if exists (select 1 from clara.document_extractions e$r2$;
  v_count := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_count <> 1 then
    raise exception '0051 S1 edit 0b: the admission-chain opening appears % times (expected 1)', v_count using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm, $r3$  -- The request hash covers EVERY argument that reaches a stored column or an audit row.
  -- An argument left OUT is one a caller can change under a re-used op_key and have
  -- silently ignored — so a corrected reason under the old key is an honest CLR10, not a
  -- stale receipt for the request they were trying to fix.
  -- [0051] RESERVED BEFORE THE DOORS (0024:45-55's ruled ordering): the admission below is
  -- state-dependent, and the state a successful first call creates would otherwise make a
  -- same-key replay refuse instead of replaying its own receipt.
  v_dedupe := clara._reserve_op(c.firm, 'request_reextraction', p_op_key,
    clara._hash(jsonb_build_object('d', p_document, 'r', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  if exists (select 1 from clara.document_extractions e$r3$);

  v_anchor := '    v_admission := ''filed_bootstrap'';' || chr(10)
    || '  else' || chr(10)
    || '    raise exception ''no completed extraction to re-extract'' using errcode = ''CLR16'';' || chr(10)
    || '  end if;';

  v_repl := '    v_admission := ''filed_bootstrap'';' || chr(10)
    || '  --   ''failed_retry'' (0051, §7-A finding F6 / task #31 + the ADR-062' || chr(10)
    || '  --     extraction-recovery-door registration, ONE item per wave-e-contract E-R1) --' || chr(10)
    || '  --     a document whose OWN facts lane (v_lane) holds a TERMINALLY FAILED task and' || chr(10)
    || '  --     whose facts extraction never succeeded. Before this door that population had' || chr(10)
    || '  --     NO recovery path at all: four doors were measured closed on the real exhibit' || chr(10)
    || '  --     (docs/plan/wave-7a-acceptance-h1.md:540-604, LUMINOUS c597a24b -- invoice_facts' || chr(10)
    || '  --     failed on its only-ever attempt, error_code=''internal'', attempt_count=1) --' || chr(10)
    || '  --     THIS verb refused CLR16, a content-addressed re-ingest ADOPTS the same' || chr(10)
    || '  --     document_id and spawns no attempt, the terminal task row is immutable by' || chr(10)
    || '  --     trigger, and the only thing that worked was an out-of-product re-export.' || chr(10)
    || '  --' || chr(10)
    || '  --     THE READ IS OF THE TASK, NOT OF THE EXTRACTION, and that is load-bearing:' || chr(10)
    || '  --     clara.fail_invoice_facts (0009:2152-2178) writes NO document_extractions row' || chr(10)
    || '  --     -- it only terminalises the task -- and persist_invoice_facts inserts its' || chr(10)
    || '  --     extraction row on the ''done'' path alone. A failed-first attempt therefore' || chr(10)
    || '  --     leaves ZERO extraction rows for the lane, so any widening phrased against' || chr(10)
    || '  --     document_extractions would never admit the very shape this door exists for.' || chr(10)
    || '  --     Reading status=''failed'' is also the only form compatible with evidence law 2:' || chr(10)
    || '  --     it is a POSITIVE read of a state a writer committed, where "no extraction row"' || chr(10)
    || '  --     is an ABSENCE shared by never-started, mid-flight and failed documents alike.' || chr(10)
    || '  --     ck_processing_task_terminal (0007) makes status=''failed'' terminal by' || chr(10)
    || '  --     construction, so no second column has to be consulted to know the row is done' || chr(10)
    || '  --     moving.' || chr(10)
    || '  --' || chr(10)
    || '  --     PLACED LAST, deliberately. Every call the chain admits today still takes the' || chr(10)
    || '  --     same earlier door and keeps the same v_admission label; the only answer that' || chr(10)
    || '  --     changes belongs to callers that reached the raise below. In particular the' || chr(10)
    || '  --     genuinely-never-extracted document still refuses: the 0009 coding-time' || chr(10)
    || '  --     backstop leaves its lane task ''queued'', never ''failed'', so the NEWEST-task' || chr(10)
    || '  --     read below sees ''queued'' and the chain falls through' || chr(10)
    || '  --     (x1-reextraction.test.mjs:110-129, kept green unmodified).' || chr(10)
    || '  --' || chr(10)
    || '  --     NEWEST, NOT "ANY" (cross-model review finding #5, CONFIRMED). The first cut' || chr(10)
    || '  --     asked `exists(... status=''failed'')`, i.e. ANY historical failure. Two ways' || chr(10)
    || '  --     that is wrong, one of them ordinary: (a) once a recovery is queued or running,' || chr(10)
    || '  --     a second call was still ADMITTED here because v1 was failed, and only the' || chr(10)
    || '  --     in-flight short-circuit further down stopped a double mint -- an admission that' || chr(10)
    || '  --     depends on a later guard for its safety is the wrong admission; (b) in a' || chr(10)
    || '  --     schema-valid state where the newest task is ''done'' but its extraction row is' || chr(10)
    || '  --     absent, the stale v1 failure would mint v3 instead of failing closed on a' || chr(10)
    || '  --     POSITIVE newest-''done'' read. The scalar subquery below answers with the LANE''s' || chr(10)
    || '  --     newest task and nothing else; when the lane is empty it returns NULL, and' || chr(10)
    || '  --     `NULL = ''failed''` is NULL, which is not true -- fail-closed by construction.' || chr(10)
    || '  --     Engine-AGNOSTIC on purpose: version_n is minted as max+1 over (document,lane),' || chr(10)
    || '  --     so it orders the lane regardless of which engine snapshot took each attempt.' || chr(10)
    || '  --     `id desc` is the deterministic tiebreak the 0026 P2 lesson asks for.' || chr(10)
    || '  --' || chr(10)
    || '  --     The second condition is LOGICALLY REDUNDANT here -- reaching this elsif' || chr(10)
    || '  --     already proves the first door was false -- and is written anyway so the door' || chr(10)
    || '  --     stays correct independent of its position: a future reordering must not be' || chr(10)
    || '  --     able to turn this branch into a silent re-extraction of a document that' || chr(10)
    || '  --     already extracted successfully.' || chr(10)
    || '  --' || chr(10)
    || '  --     NOTHING NEW IS BUILT BELOW THIS POINT. ADR-062''s "admit a NEW attempt row per' || chr(10)
    || '  --     (document,lane), never mutate or reopen the terminal row" is satisfied by the' || chr(10)
    || '  --     machinery this function already has: the in-flight short-circuit, the bounded' || chr(10)
    || '  --     3-attempt version-race loop (max(version_n)+1, insert ... on conflict do' || chr(10)
    || '  --     nothing), the page-budget reservation, the audit row and the receipt.' || chr(10)
    || '  --     THIS POPULATION IS RESERVED AND CAPPED BY THAT EXISTING MACHINERY, verified' || chr(10)
    || '  --     rather than assumed (review ruling 1c): every non-reused invoice_facts mint' || chr(10)
    || '  --     falls into `if not v_reused and v_lane = ''invoice_facts'' then' || chr(10)
    || '  --     clara._reserve_processing_call(v_task, v_pages)` with its CLR18 ->' || chr(10)
    || '  --     failed/''budget'' branch (0026:1229-1238), and clara.' || chr(10)
    || '  --     claim_document_processing_task caps the lane at three summed attempts' || chr(10)
    || '  --     (0038:6907-6924, whose scope is exactly invoice_facts + statement_facts). The' || chr(10)
    || '  --     local_facts lane is deliberately unreserved -- a local XML parse buys nothing.' || chr(10)
    || '  elsif (select pft.status from clara.document_processing_tasks pft' || chr(10)
    || '           where pft.document_id = p_document and pft.lane = v_lane' || chr(10)
    || '           order by pft.version_n desc, pft.id desc limit 1) = ''failed''' || chr(10)
    || '     and not exists (select 1 from clara.document_extractions efx' || chr(10)
    || '      where efx.document_id = p_document' || chr(10)
    || '        and efx.engine_kind = ''invoice_facts'' and efx.status = ''done'') then' || chr(10)
    || '    v_admission := ''failed_retry'';' || chr(10)
    || '  else' || chr(10)
    || '    raise exception ''no completed extraction to re-extract'' using errcode = ''CLR16'';' || chr(10)
    || '  end if;';

  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0051 S1: the admission-chain tail anchor occurs % times in the functiondef about to be edited (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor, v_repl);
  execute v_next;
  raise notice '0051 S1: request_reextraction recut -- a fourth admission door (failed_retry) admits a document whose facts lane holds a terminally failed task and no successful extraction';
end
$splice51$;
reset role;

-- The grant is UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a
-- function's existing ACL by Postgres's own rule. Section 2 PROVES that rather than trusting
-- it, by comparing proacl before and after AND by re-reading the floor role by role.

-- =====================================================================
-- SECTION 2 -- TAIL. Proves the splice landed, landed exactly once, and disturbed nothing
-- else. Every arm asserts a PROPERTY a regression cannot satisfy by accident -- not merely
-- that a token is spelled somewhere in the body (review law 3).
-- =====================================================================
do $tail51$
declare
  v_def text; v_n int; v_secdef boolean; v_config text; v_acl text; v_pre record;
  v_core text; v_trg text; v_key text; v_pos int; v_window text;
begin
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'request_reextraction';
  if v_n <> 1 then
    raise exception '0051 tail: expected exactly ONE clara.request_reextraction overload after the splice, found %', v_n
      using errcode = 'CLR10';
  end if;

  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure)
    into v_def;

  ---- (1) THE NEW DOOR IS PRESENT, EXACTLY ONCE, AND IS THE ONE THIS FILE WROTE.
  if position('v_admission := ''failed_retry'';' in v_def) = 0 then
    raise exception '0051 tail: the failed_retry admission is missing from the post-splice body'
      using errcode = 'CLR10';
  end if;
  if (length(v_def) - length(replace(v_def, 'v_admission := ''failed_retry'';', '')))
      / length('v_admission := ''failed_retry'';') <> 1 then
    raise exception '0051 tail: the failed_retry admission occurs more than once -- the replace matched more than the intended anchor'
      using errcode = 'CLR10';
  end if;

  ---- (2) THE PREDICATE ITSELF, read as a PROPERTY of the branch rather than as a loose
  ---- token: the door's own condition must read the LANE's NEWEST task and require it to be
  ---- terminally failed. A door that admitted on anything weaker -- any task, any status, any
  ---- lane, or ANY HISTORICAL failure (the shape review finding #5 confirmed) -- would satisfy
  ---- a token check and be a different, wrong door.
  v_pos := position('elsif (select pft.status from clara.document_processing_tasks pft' in v_def);
  if v_pos = 0 then
    raise exception '0051 tail: the failed_retry door does not open with a positive NEWEST-task read of clara.document_processing_tasks -- an admission derived from an ABSENCE, or from any historical failure, is exactly what evidence law 2 and review finding #5 forbid here'
      using errcode = 'CLR10';
  end if;
  v_window := substring(v_def from v_pos for 460);
  if position('pft.lane = v_lane' in v_window) = 0 then
    raise exception '0051 tail: the failed_retry door is not scoped to the document''s OWN facts lane (pft.lane = v_lane)'
      using errcode = 'CLR10';
  end if;
  ---- NEWEST semantics, asserted as the ORDER BY + LIMIT that produces them. Without this the
  ---- branch degrades to "any historical failure" and a queued recovery re-admits forever.
  if position('order by pft.version_n desc, pft.id desc limit 1) = ''failed''' in v_window) = 0 then
    raise exception '0051 tail: the failed_retry door does not read the LANE''s NEWEST task (order by version_n desc, id desc limit 1) and compare it to ''failed'' -- it would admit on ANY historical failure, re-admitting while a recovery is already queued and minting over a newest-''done'' task whose extraction row is missing'
      using errcode = 'CLR10';
  end if;
  ---- and it must NOT have regressed to the exists() shape.
  if position('elsif exists (select 1 from clara.document_processing_tasks pft' in v_def) <> 0 then
    raise exception '0051 tail: the failed_retry door still carries the ANY-historical-failure exists() shape' using errcode = 'CLR10';
  end if;
  if position('efx.status = ''done''' in v_window) = 0
     or position('not exists' in v_window) = 0 then
    raise exception '0051 tail: the failed_retry door lost its position-independent second condition (no successful extraction for the lane)'
      using errcode = 'CLR10';
  end if;
  -- ORDERING: the door must sit AFTER the three pre-existing ones, which is what makes this
  -- change unable to alter any admission that already works today.
  if position('v_admission := ''reextraction'';' in v_def) > v_pos
     or position('v_admission := ''receipt_backfill'';' in v_def) > v_pos
     or position('v_admission := ''filed_bootstrap'';' in v_def) > v_pos then
    raise exception '0051 tail: the failed_retry door is not LAST in the admission chain -- placed earlier it would relabel, or divert, a population one of the three existing doors already admits'
      using errcode = 'CLR10';
  end if;

  ---- (3) THE REFUSAL SURVIVES. The chain must still end in the CLR16 raise -- the widening
  ---- adds a door, it does not remove the wall.
  if position('raise exception ''no completed extraction to re-extract'' using errcode = ''CLR16'';' in v_def) = 0 then
    raise exception '0051 tail: the CLR16 refusal at the end of the admission chain is GONE -- this migration adds a door, it does not open the wall'
      using errcode = 'CLR10';
  end if;

  ---- (4) THE FULL LINEAGE SURVIVED THE SPLICE -- 0026 §G and 0040 S4.13 alike.
  foreach v_key in array array['''reextraction''', '''receipt_backfill''', '''filed_bootstrap''',
      'where id = p_document for update', 'v_admission', '''statement_refire''',
      'clara._enqueue_invoice_facts_core'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0051 tail: the lineage marker % was lost by this splice', v_key
        using errcode = 'CLR10';
    end if;
  end loop;

  ---- (5) 0040's OWN invariant, re-read: still EXACTLY ONE direct task INSERT. This is the
  ---- arm that proves the new door reuses the bounded-retry loop instead of growing its own
  ---- enqueue (which would inherit neither the version race nor the budget).
  if (length(v_def) - length(replace(v_def, 'insert into clara.document_processing_tasks', '')))
      / length('insert into clara.document_processing_tasks') <> 1 then
    raise exception '0051 tail: request_reextraction no longer carries exactly ONE direct task INSERT -- the new door grew its own enqueue instead of falling through to the bounded-retry loop'
      using errcode = 'CLR10';
  end if;

  ---- (6) THE TWO FUNCTIONS THIS FILE PROMISED NOT TO TOUCH ARE BYTE-IDENTICAL. Hash
  ---- comparison, not a name check.
  select * into v_pre from _x51_pre;
  select p.prosrc into v_core from pg_proc p
    where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if encode(sha256(convert_to(v_core, 'UTF8')), 'hex') is distinct from v_pre.core_hash then
    raise exception '0051 tail: clara._enqueue_invoice_facts_core''s source changed -- 0022:151-156 records that this verb owns its own logic precisely so the core''s four automatic callers keep their behaviour'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_trg from pg_proc p
    where p.oid = 'clara._tf_processing_task_update()'::regprocedure;
  if encode(sha256(convert_to(v_trg, 'UTF8')), 'hex') is distinct from v_pre.trigger_hash then
    raise exception '0051 tail: clara._tf_processing_task_update''s source changed -- terminal task rows must stay immutable; the recovery door mints a SIBLING row and never reopens the failed one'
      using errcode = 'CLR10';
  end if;

  ---- (7) SECURITY DEFINER, the pinned search_path, and the ACL are byte-identical to
  ---- prestate -- the widened ADMISSION must not have widened the REACH.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0051 tail: SECURITY DEFINER changed by this splice (was %, now %)', v_pre.secdef, v_secdef
      using errcode = 'CLR10';
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0051 tail: proconfig changed by this splice (was %, now %)', v_pre.config, v_config
      using errcode = 'CLR10';
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0051 tail: proacl changed by this splice (was %, now %)', v_pre.acl, v_acl
      using errcode = 'CLR10';
  end if;

  raise notice '0051 tail: clean -- the failed_retry door is present exactly once, LAST in the chain, reads a POSITIVE terminally-failed task scoped to the document''s own facts lane, the CLR16 refusal survives, the 0026 section-G + 0040 S4.13 lineage is intact with exactly one task INSERT, and _enqueue_invoice_facts_core + _tf_processing_task_update are byte-identical';
end
$tail51$;

-- SECTION 3 -- THE COST BOUND, re-read role by role and INDEPENDENTLY of section 2's proacl
-- comparison (which proves "nothing changed"; this proves "and what did not change is still
-- the right thing"). ADR-047 Q4 declined a numeric per-document re-extraction cap and put a
-- STRUCTURAL bound in its place: no workflow, sweep or wake can execute the verb at all, so
-- none can spend Azure pages in a loop. A widened ADMISSION is precisely the change that
-- could erode that by accident, so it is asserted here rather than inherited.
--
-- In its own block for the same lint-contract reason as the prestate's grant probes above --
-- see that block's comment. This block installs nothing and reads no function body.
do $tail51_grants$
declare v_n int;
begin
  if not has_function_privilege('clara_authenticated',
      'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute') then
    raise exception '0051 tail: clara_authenticated lost EXECUTE on request_reextraction -- the bookkeeper floor is the point of the verb'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara.request_reextraction(uuid,text,text)'::regprocedure, 'execute') then
    raise exception '0051 tail: a MACHINE role holds EXECUTE on request_reextraction -- the widened admission must not widen the reach; ADR-047 Q4''s whole cost bound is that no workflow, sweep or wake can spend Azure pages in a loop'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
             where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure
               and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception '0051 tail: PUBLIC holds EXECUTE on request_reextraction' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.wake_fn_allowlist where function_name = 'request_reextraction';
  if v_n <> 0 then
    raise exception '0051 tail: request_reextraction gained % wake_fn_allowlist row(s) -- it must remain unreachable from every wake kind', v_n
      using errcode = 'CLR10';
  end if;
  raise notice '0051 tail grants: clean -- request_reextraction is still clara_authenticated-only, no machine role, no PUBLIC, zero wake_fn_allowlist rows';
end
$tail51_grants$;

-- #####################################################################################
--
--  PART 2 -- THE INTAKE RECOVERY DOOR: re-uploading the same file recovers a failed
--  INGEST. (Sections 4-6. Part 1, above, is the facts-lane door in
--  clara.request_reextraction.)
--
-- #####################################################################################
--
-- WHY A SECOND DOOR. Part 1 closes the FACTS-lane half of F6 (a failed invoice_facts /
-- local_facts attempt). ADR-062's own registration names the other half -- "a
-- terminally-failed document INGEST has no recovery door ... surfaced by the 2026-08-06
-- Azure DI credential outage that failed seven fresh ingests" -- and PROJECTLOG.md:128 hangs
-- Gate P's four waiting manual bills off it. Part 1 CANNOT reach that population: an ingest
-- that died was never classified, so request_reextraction's kind gate (0026:1053-1058)
-- refuses it before the admission chain is consulted at all.
--
-- THE ROUTE THAT WAS REFUSED, AND WHY THIS FILE LOOKS THE WAY IT DOES. The obvious fix --
-- have request_reextraction mint an 'ocr' task -- is unbuildable without widening the
-- runtime's privilege surface, and that widening is REFUSED (orchestrator ruling: the
-- security posture is the product under test). The measurement behind the refusal:
--   * packages/runtime/workflows/documentIngest.behavior_v2.mjs:176-177 hard-fails a task
--     whose spool sidecar is absent (`if (!task) throw ... {code:"internal"}`), then reads
--     task.storageKey/.sha256/.mime/.format at :190-193. @frozen AND deployed.
--   * packages/runtime/workflows/documentIngest.impl.ts:56-59 (also @frozen + deployed)
--     keeps only `result.status` from the claim receipt -- the storage_path/sha256/mime_type
--     clara.claim_document_processing_task returns (0038:6942-6946) are DISCARDED inside the
--     frozen step, so no unfrozen code can ever see them.
--   * The runtime holds NO SELECT on clara.documents (PIN-AB-6,
--     packages/runtime/lib/reconciler-documents.mjs:157-162), and `format` is not a column
--     of clara.documents at all.
-- A DB-minted ingest task is therefore undispatchable unless clara_runtime gains a new
-- definer verb handing out document transport metadata WITHOUT a claim. Refused.
--
-- THE GRANT-CLEAN ROUTE THIS PART BUILDS. The user-natural recovery action for a failed
-- ingest is RE-UPLOADING THE SAME FILE -- and that action already carries every input the
-- frozen workflow needs, because the intake path computed them itself moments earlier.
-- Today it dead-ends: finalize_document_intake's duplicate branch ADOPTS the existing
-- document (door 3 of ADR-064's four), refunds the reservation and mints nothing
-- (0026:298-309), and the runtime's `needsStart` is false for an adopted receipt
-- (intake.mjs:364), so no run starts. This part opens exactly that door for the FAILED case
-- and only for it. NO NEW GRANT OF ANY KIND: finalize_document_intake is already granted to
-- clara_runtime (0015:3663) and already reads every row the recovery needs.
--
-- =====================================================================================
-- LINEAGE OF THE BODY BEING PATCHED, CHECKED THE SAME WAY PART 1'S WAS
-- =====================================================================================
--   0007_document_pipeline.sql:1977  the original CREATE.
--   0015_ar_myinvois_rules.sql:3431  CoR -- retire the 'fixture-engine' default.
--   0026_lane_widen.sql:234          CoR (§C) -- the LAST full CREATE OR REPLACE: the ON
--                                    CONFLICT target widens to include lane, the
--                                    duplicate-path re-select gains its (engine_id,lane) pin
--                                    (P2), and the impossible-state CLR35 raise lands.
-- Grepped 0027..0050 for any later CoR **or dynamic splice**: NONE. No `pg_get_functiondef`
-- anywhere in the tree names this function; 0027/0038 mention it only in comments and an
-- existence probe, and 0042/0044 only carry its name inside a census array. So unlike Part
-- 1's target, 0026's file text IS the live body here.
--
-- THIS PART STILL USES HARVEST-AND-SPLICE ANYWAY. A from-file `create or replace` would be
-- defensible (it is what 0050 did) but it is strictly weaker: it re-ships ~120 lines this
-- migration has no business re-typing, and one transcription slip in any of them is a silent
-- revert no prestate probe would catch -- because the probe would be written against the
-- same mistaken text. Three small anchors under count guards can only change what they name.
-- One discipline for both parts.
--
-- =====================================================================================
-- THE ADMISSION, AND EVERY POPULATION IT REFUSES
-- =====================================================================================
-- Inside the ADOPTED branch only (`not v_created and not v_upgraded`; a fresh or upgraded
-- document already mints its own task and is untouched here), the door mints ONE new attempt
-- row when ALL of these hold:
--   (1) p_lane is an INGEST lane -- 'ocr' / 'structured_parse' / 'none'. A facts lane
--       reaching this argument is refused outright: a failed FACTS attempt is Part 1's verb,
--       under a bookkeeper's hand and an audited reason, not something a re-upload should
--       silently re-buy. (Reachable today only by a caller passing a lane
--       packages/runtime/lib/intake-lanes.mjs never produces -- the gate is the wall for it.)
--   (2) The NEWEST task on this document's own (engine_id, lane) is status='failed'. A
--       POSITIVE read of a committed row -- the same Law-2 form Part 1 uses and for the same
--       reason: "no successful task" is an ABSENCE shared by never-started, in-flight and
--       failed documents alike. Terminality needs no second column
--       (ck_processing_task_terminal, 0007:175; 0011:1292 and 1298-1307 admit no transition
--       out of 'failed').
--       Scoped to (engine_id, lane) deliberately: it is the scope 0026's own duplicate-path
--       re-select already uses (P2, 0026:300-308); it makes version_n UNIQUE within the
--       scope, so `order by version_n desc limit 1` is deterministic rather than a
--       nondeterministic tie-break (0026 P2's own lesson); and if the engine snapshot has
--       changed since the original ingest the read finds nothing and NO recovery is minted,
--       which is the fail-closed answer, not a bug.
--   (3) NO task on that lane -- ANY engine -- is 'queued'/'held_egress'/'running'. Widened
--       past (2)'s engine scope on purpose: an in-flight task under a different engine id
--       would still egress, and two live tasks on one lane is exactly the double vendor read
--       this condition exists to prevent.
-- REFUSED, each deliberately: an ingest lane whose newest task is 'done' (a healthy
-- adoption -- unchanged, and the overwhelmingly common case); anything in flight; a document
-- whose INGEST succeeded but whose FACTS extraction failed (Part 1's verb -- this door never
-- looks at a facts lane); and every non-adopted path.
--
-- THE MINT mirrors Part 1: version_n = max+1 over (document_id, lane), a fresh row, `on
-- conflict do nothing`. It NEVER touches the failed row -- _tf_processing_task_update would
-- refuse it anyway, and ADR-062's binding requirement is a sibling, never a reopen.
--
-- WHY NO BOUNDED RETRY LOOP HERE (Part 1 has one). Part 1's loop exists because two humans
-- can press its button concurrently with nothing serialising them. This function has already
-- taken `select * into d from clara.documents ... for update` (0026:263) before reaching this
-- branch, and clara.documents is the ONLY row an ingest-lane minter locks -- so two
-- concurrent finalizes of the same bytes serialise on it, and nothing else mints on an ingest
-- lane at all (request_reextraction and _enqueue_invoice_facts_core are facts-lane writers).
-- A conflict here is genuinely impossible, and the file's own impossible-state-loud idiom
-- (the CLR35 raise §C itself installed, 0026:292-295) is the honest response to one -- not a
-- retry pretending to handle a case that cannot arise.
--
-- THE RECEIPT gains a `recovery` object -- {task_id, lane, version_n, engine_id,
-- storage_path, sha256, mime_type} -- and ONLY when a recovery was actually minted. It is
-- appended with `|| case when ... then '{}'::jsonb ...`, never through jsonb_build_object's
-- own argument list, so a receipt with no recovery is BYTE-IDENTICAL to what this function
-- returns today (a `'recovery', null` key would have changed every intake receipt in the
-- product for the sake of one branch). `status` stays 'adopted': the document really was
-- adopted, and re-labelling it would lie to every existing reader.
--
-- `task_id` DOES change for this one population -- it becomes the recovery task. Verified
-- before doing it rather than assumed: `finalized.task_id` has exactly ONE consumer,
-- packages/runtime/lib/intake.mjs:365-368, and it is guarded by `needsStart`, which is FALSE
-- for every adopted receipt today. So no live reader can observe the change, and the
-- alternative -- a receipt (and an audit row, 0026:335-337) naming a DEAD task while the same
-- transaction just minted a live one -- is the stale answer this repo does not ship.
--
-- =====================================================================================
-- THE RESERVATION: a recovery is a real vendor attempt and PAYS like one
-- =====================================================================================
-- THE FIRST CUT WAS WRONG HERE, and it was the review's CRITICAL finding. It minted after
-- the adopted branch's refund and charged nothing, and this header then claimed the result
-- was "NOT unbounded" because a recovery needs a real prior failure. That sentence was
-- FALSE: every terminal failure is another admission, so re-uploading identical bytes after
-- each engine fault bought vendor reads indefinitely inside one day's headroom. A file that
-- discloses an exemption must not also reassure the reader about it.
--
-- WHAT IT COSTS NOW, and the four bounds that are actually true:
--   * RESERVED. On a MINT the door BINDS this re-upload's own intake reservation to the new
--     task -- `update clara.document_ingest_reservations set task_id=... where intake_id=...`,
--     the same single statement the created/upgraded branch above already uses (0026:297) --
--     instead of refunding it. The lifecycle is then a first ingest's, exactly:
--     clara._settle_document_reservation settles it by task_id when the read succeeds
--     (0007:1694-1712) and clara._refund_document_reservation refunds it when it fails
--     (0007:1679-1692, reached through persist_document_extraction's own failure arm).
--     THE BUDGET IS ENFORCED, one step earlier and harder: clara._reserve_document_ingest
--     checks docs_per_day AND pages_per_day and raises CLR18 (0007:1632-1653) when
--     clara.create_document_intake opens the intake (0007:1852), so an over-budget firm
--     cannot even BEGIN the re-upload -- there is no path from an exhausted budget to a
--     recovery mint. And the reservation carries the document's TRUE page count by then:
--     clara.verify_document_intake resizes it from the detected pages before finalize runs
--     (0007:1937 -> _resize_document_reservation).
--     WHY BIND RATHER THAN TAKE A FRESH ONE: clara.document_ingest_reservations is
--     `unique (intake_id)` (0007), so a second reservation for this intake is not merely
--     redundant, it is impossible -- and it would be double-charging the same upload anyway.
--     WHY NOT clara._reserve_processing_call: it REFUSES every lane outside
--     ('invoice_facts','statement_facts') (0038:7059), and a processing-call reservation
--     could never settle on this lane because persist_document_extraction settles through
--     _settle_document_reservation, which reads document_ingest_reservations by task_id.
--     That function is the FACTS lane's budget; §1 rides it already (0026:1229-1238).
--   * CAPPED. The lane's summed attempt_count must be under 3. This is the ONLY cap an
--     ingest lane has -- clara.claim_document_processing_task's cap is scoped to
--     ('invoice_facts','statement_facts') (0038:6907) and never sees ocr.
--   * RETRYABLE-ONLY. A deterministic failure (corrupt/encrypted/bad_type/internal/...) is
--     refused by name, so unreadable bytes cannot be re-bought at all.
--   * IN-FLIGHT-GUARDED. Nothing is minted while any task on that lane is live, so the
--     attempts are strictly sequential.
-- The kill switch and the per-firm OCR concurrency cap still gate the claim on top of all
-- four (0038:6866-6868, 6926-6933).
--
-- =====================================================================================
-- THE RUNTIME HALF (packages/runtime/lib/intake.mjs -- UNFROZEN, same commit)
-- =====================================================================================
-- The DB half alone would mint a task the deployed image cannot run. intake.mjs now
-- materialises the spool sidecar for the recovery task id BEFORE any enqueue, exactly as it
-- already does for a freshly finalized task (intake.mjs:366-383), and extends `needsStart`
-- to include a recovery-bearing receipt. documentIngest.behavior_v2 / .impl.ts stay
-- BYTE-UNTOUCHED -- by the time the workflow claims, a recovered task is indistinguishable
-- from an intake-minted one.
--
-- THE storage_path NAMESPACE QUESTION, ANSWERED BY A SCHEMA CONSTRAINT RATHER THAN BY
-- INFERENCE. The runtime writes the sidecar's storageKey from the receipt's
-- `recovery.storage_path` (clara.documents.storage_path), not from its own freshly computed
-- key. The two are provably the same string:
--   * clara.documents carries ck_documents_storage_path_v2 (0007_document_pipeline.sql:53-54)
--     -- `storage_path ~ ('^firms/' || firm_id::text || '/docs/' || sha256 ||
--     '[.][a-z0-9]{1,12}$')`. The DB ENFORCES the content-addressed layout.
--   * packages/runtime/lib/intake.mjs:273 computes exactly that template:
--     `firms/${meta.firmId}/docs/${meta.sha256}.${detected.ext}`.
-- Adoption MEANS same firm + same sha256 (0026:263 matches on firm_id+sha256), which leaves
-- only the extension free -- and that comes from detectDocument over identical bytes. So the
-- fresh upload discards nothing: putCanonical (intake.mjs:274) re-writes the SAME
-- content-addressed object, and verifyCanonical (:275/:280) has already proven the object at
-- that key hashes to that sha256 in this very call.
-- The DB value is nonetheless the one used, for two reasons that survive even if that
-- equality ever stopped holding: it is what the DOCUMENT row asserts and therefore what
-- clara.claim_document_processing_task hands every other lane (0038:6851-6852), and it is a
-- positive read of the durable record rather than a recomputation. The runtime cross-checks
-- the two and, on any divergence, re-verifies the DB's object before using it -- refusing to
-- start if that verification fails.
-- `format` is the ONE field that cannot come from the DB (clara.documents has no such
-- column; it is an intake-time detection, intake.mjs:348). The recovery path takes it from
-- THIS upload's own detection over the same bytes, and cross-checks that
-- laneSnapshot(format).lane equals the lane the DB minted on; a mismatch refuses to start
-- rather than handing the workflow a reader its lane disagrees with.
--
-- =====================================================================================
-- ACCEPTANCE CAUTION, RECORDED AT THE ORCHESTRATOR'S INSTRUCTION
-- =====================================================================================
-- NOBODY MAY CLAIM THIS DOOR UNBLOCKS GATE P'S FOUR WAITING MANUAL BILLS UNTIL A LIVE READ
-- SAYS SO. ADR-062 and PROJECTLOG.md:128 describe those four in prose; NO document_id and NO
-- failed lane is recorded in any file in this repo. Whether each is a failed INGEST (this
-- door), a failed FACTS extraction (Part 1's door), or neither, is a measurement that must be
-- taken against the live database at acceptance time -- `select lane, status, error_code,
-- version_n from clara.document_processing_tasks where document_id = ...` per bill -- BEFORE
-- any claim is made. A door that exists is not evidence that a specific document can walk
-- through it.

-- =====================================================================
-- SECTION 4 -- PART 2 PRESTATE. Same discipline as section 0: every claim the Part 2 header
-- makes about the body being patched is measured before a byte changes.
-- =====================================================================
create temp table _x51_pre2(
  secdef boolean not null,
  config text not null,
  acl    text not null
) on commit drop;

do $prestate51b$
declare
  v_n int; v_def text; v_count int; v_secdef boolean; v_config text; v_acl text;
  v_key text; v_a1 text; v_a2 text; v_a3 text;
begin
  -- (4.1) EXACTLY ONE finalize_document_intake overload, at the pinned 9-arity signature.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'finalize_document_intake';
  if v_n <> 1 then
    raise exception '0051 §2 prestate: expected exactly ONE clara.finalize_document_intake overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure;

  select pg_get_functiondef('clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure)
    into v_def;
  if v_def is null then
    raise exception '0051 §2 prestate: clara.finalize_document_intake is GONE' using errcode = 'CLR10';
  end if;

  -- (4.2) ALREADY-APPLIED GUARD.
  if position('v_recovery' in v_def) <> 0 then
    raise exception '0051 §2 prestate: the intake recovery door is already installed -- 0051 (or an equivalent recut) has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (4.3) THE 0026 §C LINEAGE, marker by marker. Each of these is a real fix that a
  -- from-file rebuild of an OLDER body would silently revert.
  foreach v_key in array array[
      'on conflict (document_id,engine_id,version_n,lane) do nothing',
      'duplicate-adopted',
      'impossible state: an ON CONFLICT fired',
      'where document_id=v_doc and engine_id=p_engine_id and lane=p_lane'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0051 §2 prestate: finalize_document_intake is missing the 0026 section-C marker % -- the live body is not the 0026 recut this patch was authored against', v_key
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (4.4) THE LOCK THE "NO RETRY LOOP NEEDED" ARGUMENT RESTS ON, read POSITIVELY. If this
  -- function ever stops locking the documents row before the adopted branch, two concurrent
  -- finalizes of the same bytes could both reach the recovery mint and the CLR35 raise below
  -- would stop being an impossible-state assertion and start being a reachable crash.
  if position('where firm_id=i.firm_id and sha256=i.sha256 for update' in v_def) = 0 then
    raise exception '0051 §2 prestate: finalize_document_intake no longer locks the documents row FOR UPDATE before adopting -- the recovery mint below is written on the premise that this lock serialises every concurrent finalize of the same bytes, and without it the mint needs a bounded retry loop this file does not ship'
      using errcode = 'CLR10';
  end if;

  -- (4.5) EXACTLY ONE direct task INSERT today (the intake mint). Section 6 asserts TWO.
  v_count := (length(v_def) - length(replace(v_def, 'insert into clara.document_processing_tasks', '')))
    / length('insert into clara.document_processing_tasks');
  if v_count <> 1 then
    raise exception '0051 §2 prestate: finalize_document_intake carries % direct task INSERT(s), expected exactly 1 (the intake mint) -- the body is not the one this file accounts for', v_count
      using errcode = 'CLR10';
  end if;

  -- (4.6) THE THREE ANCHORS, each exactly once.
  v_a1 := $p1$declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
begin$p1$;
  v_a2 := $p2$    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc and engine_id=p_engine_id and lane=p_lane
      order by version_n desc limit 1;
  end if;$p2$;
  v_a3 := $p3$  return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'document_id',v_doc,'task_id',v_task,
      'filing_id',v_filing,'status',case when v_created then 'finalized' else 'adopted' end,
      'upgraded',v_upgraded));$p3$;
  foreach v_key in array array[v_a1, v_a2, v_a3] loop
    v_count := (length(v_def) - length(replace(v_def, v_key, ''))) / length(v_key);
    if v_count <> 1 then
      raise exception '0051 §2 prestate: a splice anchor occurs % times in the live body (expected 1) -- the body drifted from the 0026 section-C text this file was authored against. Anchor: %', v_count, left(v_key, 80)
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (4.7) STASH the privilege shape for section 6's byte-identical proof.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure;
  if not v_secdef then
    raise exception '0051 §2 prestate: clara.finalize_document_intake is not SECURITY DEFINER'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0051 §2 prestate: clara.finalize_document_intake carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x51_pre2(secdef, config, acl) values (v_secdef, v_config, v_acl);

  raise notice '0051 §2 prestate: clean (one finalize_document_intake overload, the 0026 section-C lineage intact, the documents FOR UPDATE lock live, one task INSERT, all three anchors occur exactly once)';
end
$prestate51b$;

-- =====================================================================
-- SECTION 5 -- PART 2 SPLICE. Three anchors, each count-guarded, harvested from the live
-- catalog and never re-typed (same law as section 1).
-- =====================================================================
set role clara_fn_owner;
do $splice51b$
declare
  v_def text; v_frm text; v_to text; v_count int;
begin
  select pg_get_functiondef('clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure)
    into v_def;

  -- EDIT 1 -- four locals for the recovery door.
  v_frm := $f1$declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
begin$f1$;
  v_count := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_count <> 1 then
    raise exception '0051 S5 edit 1: the declare block appears % times (expected 1)', v_count using errcode='CLR10';
  end if;
  v_to := $t1$declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
  -- 0051 §2 (the intake recovery door): the receipt fragment, the lane's newest task the
  -- decision was taken on, the resulting row's version + id, which mode fired (mint | echo),
  -- a NAMED refusal when the door declines, and the lane's summed attempts for the cap.
  v_recovery jsonb; v_ing record; v_rvn int; v_rtask uuid;
  v_rmode text; v_rrefuse jsonb; v_attempts int;
begin$t1$;
  v_def := replace(v_def, v_frm, v_to);

  -- EDIT 2 -- the recovery door, spliced over the WHOLE adopted branch. The anchor now spans
  -- the refund as well, because the refund itself is what changes: a recovery that mints a
  -- real vendor attempt must PAY for it, and the money it pays with is this very re-upload's
  -- own intake reservation. The 0026 P2 comment + re-select are reproduced BYTE-IDENTICALLY
  -- inside the replacement.
  v_frm := $f2$  else
    perform clara._refund_document_reservation(i.firm_id,p_intake,'duplicate-adopted');
    -- 0026 P2 (O-round finding): pinned to THIS call's own engine_id + lane — post-
    -- widening, an unscoped `document_id=v_doc order by version_n desc limit 1` can grab
    -- a facts/re-extraction task from a DIFFERENT lane entirely (now legal coexistence),
    -- or tie-break nondeterministically between two lanes at the same version_n,
    -- persisting the WRONG task_id into the intake receipt. Scoped to the SAME
    -- (engine_id,lane) a fresh creation on this call would have looked up.
    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc and engine_id=p_engine_id and lane=p_lane
      order by version_n desc limit 1;
  end if;$f2$;
  v_count := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_count <> 1 then
    raise exception '0051 S5 edit 2: the adopted branch appears % times (expected 1)', v_count using errcode='CLR10';
  end if;
  v_to := $t2$  else
    -- 0051 §2 -- THE INTAKE RECOVERY DOOR (§7-A finding F6 / task #31 + the ADR-062
    -- extraction-recovery-door registration; the INGEST half, whose facts-lane twin is the
    -- 'failed_retry' door in clara.request_reextraction).
    --
    -- Re-uploading the same file is the recovery action a human actually takes when an
    -- ingest dies. Until now it dead-ended right here: the document is ADOPTED by sha256,
    -- the reservation is refunded, nothing is minted, and the runtime's needsStart is false
    -- for an adopted receipt -- so a document whose ONLY ingest attempt failed had no way
    -- back into the pipeline except an out-of-product re-export with different bytes
    -- (ADR-064 §3's fourth door, a user workaround rather than a product one).
    --
    -- IT PAYS LIKE A FRESH INGEST, AND IT IS CAPPED (cross-model review finding #1,
    -- CRITICAL, CONFIRMED). The first cut minted after the refund and charged nothing, so a
    -- user could re-upload identical bytes after every engine failure and buy vendor reads
    -- forever inside one day's headroom. Two controls, and the SECOND one is the only one
    -- this lane has:
    --   * RESERVED: on a MINT the intake reservation this very re-upload already took is
    --     BOUND to the new task instead of being refunded -- the same one statement the
    --     created/upgraded branch above uses. That is the correct instrument for this lane:
    --     clara._reserve_processing_call REFUSES anything outside
    --     ('invoice_facts','statement_facts') (0038:7059), and a processing-call reservation
    --     would never settle here anyway because persist_document_extraction settles through
    --     clara._settle_document_reservation, which keys on document_ingest_reservations by
    --     task_id (0007:1694-1701). The budget was charged when the re-upload BEGAN --
    --     clara._reserve_document_ingest enforces docs_per_day AND pages_per_day and raises
    --     CLR18 before an over-budget firm can even open the intake (0007:1632-1653) -- and
    --     the bound reservation then settles or refunds on the recovered task's own outcome,
    --     exactly like a first ingest's.
    --   * CAPPED: the lane's summed attempt_count must be under 3. State plainly why this
    --     lives here and is not the 0050 two-copies-of-one-rule sin: the claim-time cap in
    --     clara.claim_document_processing_task is scoped to ('invoice_facts','statement_facts')
    --     (0038:6907) and does NOT cover ocr / structured_parse / none. For an ingest lane
    --     THIS IS THE ONLY CAP THERE IS. Three matches the repo's existing number.
    --
    -- THE READ IS OF THE TASK ROW, POSITIVELY (evidence law 2), AND IT IS THE LANE'S NEWEST
    -- (review finding #4/#5). "No successful ingest" is an ABSENCE shared by never-started,
    -- in-flight and failed documents alike; status='failed' is a state a writer committed.
    -- ck_processing_task_terminal (0007:175) and the transition trigger (0011:1292,
    -- 1298-1307) make that read terminal by construction.
    -- ENGINE-AGNOSTIC, deliberately: the first cut looked only under THIS call's
    -- p_engine_id, so an engine-snapshot upgrade between the failure and the remediation
    -- deploy silently adopted with no recovery -- the exact pre-F6 symptom this door exists
    -- to remove. version_n is minted as max+1 over (document,lane), so it orders the lane
    -- across snapshots; `id desc` is the deterministic tiebreak 0026's P2 lesson asks for.
    -- The MINT then uses THIS call's CURRENT engine (p_engine_id/p_engine_config), which is
    -- fresh-ingest semantics: the attempt is bought from the engine this image would use,
    -- and the envelope it writes names that engine truthfully.
    --
    -- FIVE CONDITIONS, each load-bearing:
    --   (1) an INGEST lane only. A facts lane is refused outright -- a failed FACTS attempt
    --       is request_reextraction's verb, under a bookkeeper's hand and an audited reason,
    --       never something a silent re-upload re-buys.
    --   (1b) the failure must be RETRYABLE. A 100-page corrupt or encrypted PDF fails
    --       DETERMINISTICALLY: the same bytes will not read differently, so admitting it
    --       would buy a full vendor read of a document that cannot succeed, once per
    --       re-upload, forever. The admitted set is documentIngest.behavior_v2.mjs's OWN
    --       ratified RETRYABLE set, copied rather than reinvented --
    --       (engine_error, timeout, engine_lost, storage_error) -- out of the nine codes
    --       that lane can write (its processingFailureCode, :122-127, also yields corrupt,
    --       encrypted, bad_type, limit and internal). `internal` is deliberately EXCLUDED,
    --       and that is the frozen file's own doctrine quoted at its :130-131: "the catch-all
    --       for an uncategorised error is deliberately NOT retryable ... fail closed on the
    --       unknown". A NULL code is refused for the same reason -- a failure that never
    --       said why is not provably transient.
    --       The refusal NAMES the honest remedy: correct or re-export the file. New bytes
    --       are a new document and take the ordinary pipeline -- which is exactly the
    --       LUMINOUS precedent, where a re-export was the remedy of last resort rather than
    --       a door. REGISTERED RESIDUAL, stated rather than discovered later: a task that
    --       terminalised on `internal` is therefore not re-uploadable either. That is the
    --       ruled taxonomy working, but it does leave a runtime-defect class with no
    --       self-service door; it is not widened here on this file's own authority.
    --   (2) the fresh upload's declared mime EQUALS the document's durable mime. Detection is
    --       filename-sensitive for the ambiguous text formats: identical bytes sent once as
    --       .csv and again as .tsv keep the same sha256, the same lane and the same engine,
    --       so every other check passes -- and the frozen worker would then parse a CSV
    --       document as TSV and write rows that disagree with the durable document (review
    --       finding #2). intake.mjs:271 refuses an upload whose detected mime differs from
    --       its declared one, so i.declared_mime IS the detected mime by the time this runs.
    --       A mismatch is a NAMED refusal, not silence: the receipt tells the human to
    --       re-upload in the document's original form.
    --   (3) the lane's NEWEST task is terminally 'failed', and nothing on that lane -- under
    --       ANY engine -- is queued/held_egress/running. Two live tasks on one ingest lane
    --       is a double vendor read.
    --   (4) the lane's summed attempt_count is under 3.
    --
    -- THE ECHO, and why a second mode exists (review finding #3). The sidecar the frozen
    -- worker needs is written by the runtime AFTER this transaction commits, so a crash in
    -- that window leaves a queued task with no transport metadata and no way to rebuild it.
    -- When the lane's newest task is already QUEUED this door therefore mints NOTHING and
    -- ECHOES that task's transport instead; the runtime materialises the missing sidecar and
    -- dispatches idempotently. A lost sidecar heals on the next re-upload of the same bytes,
    -- which is the same action the human was already taking. An echo buys nothing, so its
    -- reservation is refunded exactly as an ordinary adoption's is.
    --
    -- THE FAILED ROW IS NEVER TOUCHED -- a sibling at the next version, exactly as ADR-062
    -- requires (and as _tf_processing_task_update would enforce regardless).
    if p_lane in ('ocr','structured_parse','none') then
      select * into v_ing from clara.document_processing_tasks
        where document_id=v_doc and lane=p_lane
        order by version_n desc, id desc limit 1;
      if found and v_ing.status in ('failed','queued')
         and lower(btrim(coalesce(i.declared_mime,''))) is distinct from lower(btrim(coalesce(d.mime_type,''))) then
        v_rrefuse := jsonb_build_object('reason','mime_mismatch',
          'document_mime',d.mime_type,'upload_mime',i.declared_mime);
      elsif found and v_ing.status='queued' then
        v_rmode := 'echo'; v_rtask := v_ing.id; v_rvn := v_ing.version_n;
      elsif found and v_ing.status='failed' then
        if coalesce(v_ing.error_code,'') not in ('engine_error','timeout','engine_lost','storage_error') then
          v_rrefuse := jsonb_build_object('reason','not_retryable','error_code',v_ing.error_code,
            'remedy','this document could not be READ, and the same bytes will not read differently. Correct or re-export the file: new bytes are a new document and take the ordinary pipeline.');
        elsif exists (select 1 from clara.document_processing_tasks pit
             where pit.document_id=v_doc and pit.lane=p_lane
               and pit.status in ('queued','held_egress','running')) then
          v_rrefuse := jsonb_build_object('reason','lane_busy');
        else
          select coalesce(sum(attempt_count),0)::int into v_attempts
            from clara.document_processing_tasks
            where document_id=v_doc and lane=p_lane;
          if v_attempts >= 3 then
            v_rrefuse := jsonb_build_object('reason','attempt_cap','attempts',v_attempts);
          else
            select coalesce(max(version_n),0)+1 into v_rvn
              from clara.document_processing_tasks
              where document_id=v_doc and lane=p_lane;
            insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
                version_n,lane,status)
              values(i.firm_id,v_doc,p_engine_id,coalesce(p_engine_config,'{}'::jsonb),v_rvn,p_lane,'queued')
              on conflict (document_id,engine_id,version_n,lane) do nothing
              returning id into v_rtask;
            if v_rtask is null then
              raise exception 'impossible state: the intake recovery mint conflicted at (document=%,engine=%,version=%,lane=%) while this transaction holds the documents row FOR UPDATE',
                v_doc,p_engine_id,v_rvn,p_lane using errcode='CLR35';
            end if;
            v_rmode := 'mint';
            -- PAY FOR IT. The same single statement the created/upgraded branch above uses;
            -- the reservation then settles or refunds on this task's own outcome.
            update clara.document_ingest_reservations set task_id=v_rtask where intake_id=p_intake;
          end if;
        end if;
      end if;
      if v_rtask is not null then
        -- Every field is read off rows this function already holds: the recovered task and
        -- the adopted document. mime_type and format come from the DOCUMENT'S DURABLE
        -- IDENTITY, never from the re-upload's filename-sensitive detection -- storage_path's
        -- extension is pinned by ck_documents_storage_path_v2 (0007:53-54), which is the same
        -- content-addressed key the runtime just computed and verified for these bytes.
        v_recovery := jsonb_build_object('task_id',v_rtask,'lane',p_lane,'version_n',v_rvn,
          'engine_id',(select engine_id from clara.document_processing_tasks where id=v_rtask),
          'storage_path',d.storage_path,'sha256',d.sha256,'mime_type',d.mime_type,
          'format',substring(d.storage_path from '[.]([a-z0-9]{1,12})$'),'mode',v_rmode);
      end if;
    end if;
    -- An adoption that bought nothing refunds, exactly as it always did. Only a MINT keeps
    -- the reservation, because only a mint spends it.
    if v_rmode is distinct from 'mint' then
      perform clara._refund_document_reservation(i.firm_id,p_intake,'duplicate-adopted');
    end if;
    -- 0026 P2 (O-round finding): pinned to THIS call's own engine_id + lane — post-
    -- widening, an unscoped `document_id=v_doc order by version_n desc limit 1` can grab
    -- a facts/re-extraction task from a DIFFERENT lane entirely (now legal coexistence),
    -- or tie-break nondeterministically between two lanes at the same version_n,
    -- persisting the WRONG task_id into the intake receipt. Scoped to the SAME
    -- (engine_id,lane) a fresh creation on this call would have looked up.
    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc and engine_id=p_engine_id and lane=p_lane
      order by version_n desc limit 1;
    -- The receipt's task_id names the LIVE task whenever this door produced one. Its only
    -- consumer (packages/runtime/lib/intake.mjs) is gated on needsStart, which is false for
    -- every adopted receipt that carries no recovery, so nothing that works today observes
    -- the change -- and naming a dead task while the same transaction just minted a live one
    -- would be a stale answer.
    if v_rtask is not null then v_task := v_rtask; end if;
  end if;$t2$;
  v_def := replace(v_def, v_frm, v_to);

  -- EDIT 3 -- the receipt gains `recovery`, and ONLY when there is one. Appended with `||`
  -- rather than added to jsonb_build_object's argument list, so a receipt with no recovery
  -- stays byte-identical to what this function returns today.
  v_frm := $f3$  return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'document_id',v_doc,'task_id',v_task,
      'filing_id',v_filing,'status',case when v_created then 'finalized' else 'adopted' end,
      'upgraded',v_upgraded));$f3$;
  v_count := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_count <> 1 then
    raise exception '0051 S5 edit 3: the receipt return appears % times (expected 1)', v_count using errcode='CLR10';
  end if;
  v_to := $t3$  return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'document_id',v_doc,'task_id',v_task,
      'filing_id',v_filing,'status',case when v_created then 'finalized' else 'adopted' end,
      'upgraded',v_upgraded)
    || case when v_recovery is null then '{}'::jsonb
            else jsonb_build_object('recovery',v_recovery) end
    || case when v_rrefuse is null then '{}'::jsonb
            else jsonb_build_object('recovery_refused',v_rrefuse) end);$t3$;
  v_def := replace(v_def, v_frm, v_to);

  execute v_def;
  raise notice '0051 S5: finalize_document_intake recut -- an ADOPTED re-upload of a document whose ingest lane is terminally failed now mints a recovery attempt and reports it in a `recovery` receipt fragment';
end
$splice51b$;
reset role;

-- =====================================================================
-- SECTION 6 -- PART 2 TAIL. Properties, not spellings.
-- =====================================================================
do $tail51b$
declare
  v_def text; v_n int; v_secdef boolean; v_config text; v_acl text; v_pre record;
  v_key text; v_pos int; v_window text; v_trg text; v_pre1 record; v_lockpos int;
begin
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'finalize_document_intake';
  if v_n <> 1 then
    raise exception '0051 §2 tail: expected exactly ONE finalize_document_intake overload after the splice, found %', v_n
      using errcode = 'CLR10';
  end if;

  select pg_get_functiondef('clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure)
    into v_def;

  ---- (1) THE DOOR IS PRESENT, EXACTLY ONCE.
  if (length(v_def) - length(replace(v_def, 'v_recovery := jsonb_build_object(', '')))
      / length('v_recovery := jsonb_build_object(') <> 1 then
    raise exception '0051 §2 tail: the recovery receipt fragment is missing, or occurs more than once, in the post-splice body'
      using errcode = 'CLR10';
  end if;

  ---- (2) THE ADMISSION CONDITIONS, read as properties of the door's own window.
  v_pos := position('if p_lane in (''ocr'',''structured_parse'',''none'') then' in v_def);
  if v_pos = 0 then
    raise exception '0051 §2 tail: the recovery door is not gated to the INGEST lanes -- a facts-lane failure must stay request_reextraction''s verb, never something a silent re-upload re-buys'
      using errcode = 'CLR10';
  end if;
  -- NB: the tokens below are searched over the WHOLE body, not a fixed-size window. Each is
  -- text unique to this door, so a window buys no extra strength and a magic length is a
  -- silent trap the moment the branch grows (it did, and it failed this tail honestly).
  -- The one genuinely POSITIONAL proof is the lock ordering in (5b) below.
  if position('v_ing.status=''failed''' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery door does not require a TERMINALLY FAILED ingest task -- an admission resting on an ABSENCE is what evidence law 2 forbids here'
      using errcode = 'CLR10';
  end if;
  ---- NEWEST-PER-LANE, ENGINE-AGNOSTIC (review findings #4/#5). The read must order the whole
  ---- lane and take one row; and it must NOT carry an engine pin, or an engine-snapshot
  ---- upgrade between the failure and the remediation deploy silently closes the door again.
  if position('where document_id=v_doc and lane=p_lane' || chr(10)
              || '        order by version_n desc, id desc limit 1;' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery door does not read the LANE''s NEWEST task engine-agnostically (order by version_n desc, id desc limit 1) -- an engine-pinned or unordered read reintroduces review finding #4''s silent adopt'
      using errcode = 'CLR10';
  end if;
  if position('where document_id=v_doc and engine_id=p_engine_id and lane=p_lane' || chr(10)
              || '        order by version_n desc, id desc limit 1;' in v_def) <> 0 then
    raise exception '0051 §2 tail: the newest-task read is still pinned to p_engine_id' using errcode = 'CLR10';
  end if;
  ---- THE IN-FLIGHT GUARD. Note the shape: it is a POSITIVE read of a live task that
  ---- REFUSES, not an absence that admits -- the Law-2 direction. Its refusal is named.
  if position('pit.status in (''queued'',''held_egress'',''running'')' in v_def) = 0
     or position('if exists (select 1 from clara.document_processing_tasks pit' in v_def) = 0
     or position('''reason'',''lane_busy''' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery door lost its in-flight guard -- it would mint a second live task on a lane that already has one, and buy a second vendor read'
      using errcode = 'CLR10';
  end if;
  -- The in-flight guard must span the whole lane, never a single engine.
  if position('pit.document_id=v_doc and pit.lane=p_lane' in v_def) = 0
     or position('pit.engine_id' in v_def) <> 0 then
    raise exception '0051 §2 tail: the in-flight guard is pinned to engine_id -- it must span the whole lane, or a live task under another engine snapshot would still egress alongside the one this door mints'
      using errcode = 'CLR10';
  end if;
  ---- THE MIME GATE (review finding #2): the durable mime and the fresh upload's declared
  ---- mime must be compared, and the refusal must be NAMED rather than silent.
  if position('lower(btrim(coalesce(i.declared_mime,'''')))' in v_def) = 0
     or position('lower(btrim(coalesce(d.mime_type,'''')))' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery door does not compare the fresh upload''s declared mime against the document''s DURABLE mime -- identical bytes re-sent under another extension would be parsed by the wrong reader (review finding #2)'
      using errcode = 'CLR10';
  end if;
  if position('''reason'',''mime_mismatch''' in v_def) = 0 then
    raise exception '0051 §2 tail: the mime mismatch is refused SILENTLY -- it must name itself on the receipt so the human knows to re-upload in the document''s original form'
      using errcode = 'CLR10';
  end if;
  ---- THE BUDGET AND THE CAP (review finding #1, CRITICAL). A recovery mint must bind this
  ---- re-upload's own intake reservation instead of refunding it, and the lane must be capped.
  if position('update clara.document_ingest_reservations set task_id=v_rtask where intake_id=p_intake;' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery mint does not BIND the intake reservation to the new task -- it would buy a real vendor attempt and charge nothing, which is review finding #1''s unbounded budget bypass'
      using errcode = 'CLR10';
  end if;
  if position('if v_rmode is distinct from ''mint'' then' in v_def) = 0
     or position('clara._refund_document_reservation(i.firm_id,p_intake,''duplicate-adopted'')' in v_def) = 0 then
    raise exception '0051 §2 tail: the adoption refund is no longer conditional on NOT having minted -- either every adoption keeps a reservation it never spends, or every mint gives back the one it did'
      using errcode = 'CLR10';
  end if;
  if position('if v_attempts >= 3 then' in v_def) = 0
     or position('''reason'',''attempt_cap''' in v_def) = 0 then
    raise exception '0051 §2 tail: the ingest lane''s summed-attempt cap is missing or unnamed -- the claim-time cap covers only invoice_facts/statement_facts (0038:6907), so for ocr this door is the ONLY cap there is'
      using errcode = 'CLR10';
  end if;
  ---- THE ECHO (review finding #3): a queued newest task hands its transport back instead of
  ---- minting, so a sidecar lost to a crash heals on the next re-upload of the same bytes.
  if position('v_rmode := ''echo''' in v_def) = 0 then
    raise exception '0051 §2 tail: the queued-task ECHO is missing -- a recovery whose sidecar was lost in the post-commit crash window could never be healed without it'
      using errcode = 'CLR10';
  end if;
  ---- The fragment's transport must come from the DOCUMENT's durable identity, never from
  ---- the re-upload's detection: mime from the column, format from the storage_path extension
  ---- that ck_documents_storage_path_v2 pins.
  if position('''format'',substring(d.storage_path from ''[.]([a-z0-9]{1,12})$'')' in v_def) = 0
     or position('''mime_type'',d.mime_type' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery fragment does not derive format/mime from the DOCUMENT''s durable identity -- the runtime would fall back to filename-sensitive detection (review finding #2)'
      using errcode = 'CLR10';
  end if;

  ---- (3) THE MINT IS A SIBLING, NEVER A REOPEN: no UPDATE of a task row was introduced.
  if position('update clara.document_processing_tasks' in v_def) <> 0 then
    raise exception '0051 §2 tail: finalize_document_intake now UPDATEs a document_processing_tasks row -- the recovery must mint a SIBLING at the next version and never reopen the terminal one (ADR-062, and _tf_processing_task_update would refuse it anyway)'
      using errcode = 'CLR10';
  end if;
  if position('coalesce(max(version_n),0)+1' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery mint does not compute version_n = max+1' using errcode = 'CLR10';
  end if;
  ---- and it mints under THIS call's CURRENT engine, not the failed attempt's.
  if position('values(i.firm_id,v_doc,p_engine_id,coalesce(p_engine_config,''{}''::jsonb),v_rvn,p_lane,''queued'')' in v_def) = 0 then
    raise exception '0051 §2 tail: the recovery does not mint under the CURRENT engine snapshot -- reusing the failed attempt''s engine would label a read with an engine that did not perform it'
      using errcode = 'CLR10';
  end if;

  ---- (4) EXACTLY TWO task INSERTs now -- the intake mint and the recovery mint. Prestate
  ---- 4.5 measured exactly one; anything but two here means an edit landed twice or not at all.
  v_n := (length(v_def) - length(replace(v_def, 'insert into clara.document_processing_tasks', '')))
    / length('insert into clara.document_processing_tasks');
  if v_n <> 2 then
    raise exception '0051 §2 tail: finalize_document_intake carries % direct task INSERT(s), expected exactly 2 (the intake mint + the recovery mint)', v_n
      using errcode = 'CLR10';
  end if;

  ---- (5) THE RECEIPT: both new keys are CONDITIONAL, and the existing object is intact.
  if position('else jsonb_build_object(''recovery'',v_recovery) end' in v_def) = 0
     or position('else jsonb_build_object(''recovery_refused'',v_rrefuse) end)' in v_def) = 0 then
    raise exception '0051 §2 tail: a receipt key is not appended conditionally -- an unconditional key would change every intake receipt in the product for the sake of one branch'
      using errcode = 'CLR10';
  end if;
  if position('jsonb_build_object(''intake_id'',p_intake,''document_id'',v_doc,''task_id'',v_task,' in v_def) = 0 then
    raise exception '0051 §2 tail: the existing receipt object was not preserved verbatim' using errcode = 'CLR10';
  end if;
  if position('''status'',case when v_created then ''finalized'' else ''adopted'' end' in v_def) = 0 then
    raise exception '0051 §2 tail: the receipt no longer reports adopted/finalized as it did -- a recovery does not change the fact that the document was ADOPTED'
      using errcode = 'CLR10';
  end if;

  ---- (5b) THE SERIALIZATION PROOF IS POSITIONAL, not token-only (review finding #6). The
  ---- mint carries no retry loop because this transaction already holds the documents row
  ---- FOR UPDATE before it reaches the adopted branch. Asserting only that the token exists
  ---- SOMEWHERE would let a refactor move the lock BELOW the branch -- keeping every anchor
  ---- green while turning concurrent re-uploads into CLR35 failures. Assert the ORDER.
  v_lockpos := position('where firm_id=i.firm_id and sha256=i.sha256 for update' in v_def);
  if v_lockpos = 0 then
    raise exception '0051 §2 tail: the documents FOR UPDATE lock is gone' using errcode = 'CLR10';
  end if;
  if v_lockpos >= v_pos then
    raise exception '0051 §2 tail: the documents FOR UPDATE lock (offset %) does not PRECEDE the recovery door (offset %) -- the mint''s no-retry-loop design rests on that lock serialising concurrent re-uploads of the same bytes, and a lock taken after the branch serialises nothing',
      v_lockpos, v_pos using errcode = 'CLR10';
  end if;

  ---- (6) THE 0026 §C LINEAGE AND THE LOCK BOTH SURVIVED.
  foreach v_key in array array[
      'on conflict (document_id,engine_id,version_n,lane) do nothing',
      'duplicate-adopted',
      'impossible state: an ON CONFLICT fired',
      'where document_id=v_doc and engine_id=p_engine_id and lane=p_lane',
      'where firm_id=i.firm_id and sha256=i.sha256 for update'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0051 §2 tail: the 0026 section-C marker % was lost by this splice', v_key
        using errcode = 'CLR10';
    end if;
  end loop;

  ---- (7) THE TERMINAL-ROW TRIGGER IS STILL BYTE-IDENTICAL TO SECTION 0'S STASH. Part 1's
  ---- tail asserted this BEFORE Part 2 spliced anything; re-read here so the assertion covers
  ---- this migration end to end rather than only its first half.
  select * into v_pre1 from _x51_pre;
  select p.prosrc into v_trg from pg_proc p
    where p.oid = 'clara._tf_processing_task_update()'::regprocedure;
  if encode(sha256(convert_to(v_trg, 'UTF8')), 'hex') is distinct from v_pre1.trigger_hash then
    raise exception '0051 §2 tail: clara._tf_processing_task_update''s source changed during Part 2 -- terminal task rows must stay immutable'
      using errcode = 'CLR10';
  end if;

  ---- (8) SECURITY DEFINER / search_path / ACL byte-identical to the Part 2 prestate.
  select * into v_pre from _x51_pre2;
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0051 §2 tail: SECURITY DEFINER changed by this splice (was %, now %)', v_pre.secdef, v_secdef
      using errcode = 'CLR10';
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0051 §2 tail: proconfig changed by this splice (was %, now %)', v_pre.config, v_config
      using errcode = 'CLR10';
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0051 §2 tail: proacl changed by this splice (was %, now %)', v_pre.acl, v_acl
      using errcode = 'CLR10';
  end if;

  raise notice '0051 §2 tail: clean -- the intake recovery door is present exactly once, gated to the ingest lanes, resting on a POSITIVE terminally-failed task read plus a lane-wide in-flight guard; it mints a sibling (two task INSERTs, no task UPDATE); the recovery receipt key is conditional and the existing receipt object is intact; the 0026 section-C lineage and the documents FOR UPDATE lock survive; the terminal-row trigger is unchanged; SECURITY DEFINER + search_path + ACL byte-identical to prestate';
end
$tail51b$;

-- SECTION 7 -- PART 2's GRANT FLOOR. In its own block for the same lint-contract reason as
-- sections 0/3's grant probes (see the prestate grants block above): this block installs
-- nothing and reads no function body.
--
-- The point being asserted: this part opens a recovery door WITHOUT widening anybody's
-- reach. finalize_document_intake was already a clara_runtime verb (0015:3663) and stays
-- exactly that -- no human role, no agent role, no wake lane, no PUBLIC.
do $tail51b_grants$
declare v_n int; v_sig text := 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)';
begin
  if not has_function_privilege('clara_runtime', v_sig::regprocedure, 'execute') then
    raise exception '0051 §2 tail: clara_runtime lost EXECUTE on finalize_document_intake -- the intake lane is the only caller there has ever been'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_sig::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', v_sig::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', v_sig::regprocedure, 'execute') then
    raise exception '0051 §2 tail: a non-runtime role holds EXECUTE on finalize_document_intake -- the recovery door must not have widened anyone''s reach'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
             where p.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception '0051 §2 tail: PUBLIC holds EXECUTE on finalize_document_intake' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.wake_fn_allowlist where function_name = 'finalize_document_intake';
  if v_n <> 0 then
    raise exception '0051 §2 tail: finalize_document_intake carries % wake_fn_allowlist row(s)', v_n
      using errcode = 'CLR10';
  end if;
  raise notice '0051 §2 tail grants: clean -- finalize_document_intake is still clara_runtime-only, no human/agent/wake role, no PUBLIC, zero wake_fn_allowlist rows';
end
$tail51b_grants$;
