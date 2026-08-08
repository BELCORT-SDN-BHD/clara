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
  v_def text; v_next text; v_anchor text; v_repl text; v_count int;
begin
  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure)
    into v_def;

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
    || '  --     backstop leaves its lane task ''queued'', never ''failed'', so this positive' || chr(10)
    || '  --     read finds nothing (x1-reextraction.test.mjs:110-129, kept green unmodified).' || chr(10)
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
    || '  --     nothing), the page-budget reservation, the audit row and the receipt. The' || chr(10)
    || '  --     claim-time attempt cap (0038:6907-6924) is likewise unchanged and still fires' || chr(10)
    || '  --     on the row this door mints.' || chr(10)
    || '  elsif exists (select 1 from clara.document_processing_tasks pft' || chr(10)
    || '      where pft.document_id = p_document and pft.lane = v_lane' || chr(10)
    || '        and pft.status = ''failed'')' || chr(10)
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
  ---- token: the door's own condition must read the TASK table for status='failed' scoped to
  ---- v_lane. A door that admitted on anything weaker (any task, any status, any lane) would
  ---- satisfy a token check and be a different, wrong door.
  v_pos := position('elsif exists (select 1 from clara.document_processing_tasks pft' in v_def);
  if v_pos = 0 then
    raise exception '0051 tail: the failed_retry door does not open with a positive read of clara.document_processing_tasks -- an admission derived from an ABSENCE is exactly what evidence law 2 forbids here'
      using errcode = 'CLR10';
  end if;
  v_window := substring(v_def from v_pos for 420);
  if position('pft.lane = v_lane' in v_window) = 0 then
    raise exception '0051 tail: the failed_retry door is not scoped to the document''s OWN facts lane (pft.lane = v_lane)'
      using errcode = 'CLR10';
  end if;
  if position('pft.status = ''failed''' in v_window) = 0 then
    raise exception '0051 tail: the failed_retry door does not require a TERMINALLY FAILED task -- it would admit a queued/running lane and race the in-flight pipeline'
      using errcode = 'CLR10';
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
