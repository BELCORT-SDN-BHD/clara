-- UNNUMBERED_f_a1_statements.sql -- Wave-F Track A, F-A1 PR-4: THE STATEMENT CUTOVER.
-- The bank-statement reader pair moves onto the witness spine (design
-- `docs/plan/active/f-a1-witness-pair-design.md` SS3.7, binding; annexes Annex A/C).
-- Numbers are claimed at MERGE time (hard constraint 10; .claude/rules/db-migrations.md).
-- =====================================================================================
-- APPLY ORDER: after 0089 (kind-scoped supersede), 0090 (walls), 0092/0093 (predicate +
-- dispatch) and 0095 (the witness writer). All five are prestate-asserted below.
--
-- NO D1 WRITE-QUIESCE OBLIGATION FOR THE CORE. This file does NOT replace a live writer's
-- body: `clara._persist_statement_core` is left BYTE-UNTOUCHED and keeps serving the
-- structured (`statement_parse`) and human (`enter_bank_statement`) lanes exactly as today.
-- What this file adds is a SUCCESSOR, `clara._persist_statement_core_v2`, SPLICED OFF THE
-- CATALOG from the live body -- the 0039/0040 CoR-patch idiom -- so that the CHAIN, the
-- both-edge continuity, the refusal ORDER and the write-time-only continuity discipline
-- survive VERBATIM by construction rather than by a re-typing a reviewer would have to
-- diff by eye. Sections 1 and 2 DO recut two live CHECK constraints; both are additive
-- widenings asserted non-vacuously in the tail.
--
-- =====================================================================================
-- WHAT MOVES (design SS3.7, stated as the file's contract)
-- =====================================================================================
--   * reader-2's Azure seat -> the WITNESS PAIR (text channel + vision channel).
--   * reader-1's stored-geometry re-read RETIRES.
--   * the pair persists under the TWO WITNESS KINDS (`llm_text_facts`/`llm_vision_facts`)
--     sharing ONE engine_id -- the M15 INVERSION of the legacy statement pair's
--     discriminator (there: one kind, two engine_ids, same-engine_id refused --
--     0038:1769-1780; here the KIND discriminates and the engine_id carries the shared
--     model identity). Precedent + rationale recorded at 0092:181-188.
--   * `bank_statements.reader1_extraction_id` -> the TEXT row,
--     `bank_statements.reader2_extraction_id` -> the VISION row.
--   * **THE VISION CHANNEL OWNS LINE DESCRIPTIONS IN THE BOOKS, and that is stated rather than
--     left to be discovered.** The live core takes the agreed NUMBERS from reader-1 and the
--     DESCRIPTIONS from reader-2 (0038:1536-1554), then hashes the merged read into
--     `facts_hash`. That block is carried VERBATIM by the splice, so under the pair it is the
--     VISION channel's description text that reaches `bank_statement_lines` and the hash, and
--     the TEXT channel's is discarded. This is FAITHFUL to the rule's own stated reason ("the
--     typed engine reads prose better than the geometry pass" -- the channel that sees the
--     printed page, not the one that sees a transcription), and it is the same precedent the
--     Azure OCR lane already ran on. Descriptions remain NON-LOAD-BEARING either way: they are
--     stripped from the agreement test (0039's skeleton compare) and from every refusal, so no
--     verdict can turn on which channel supplied them -- a battery cell proves exactly that.
--     The two facts are not in tension and the second is why the first is safe; recording both
--     here so a later reader cannot mistake the channels for interchangeable.
--   * the statement lane's egress purpose moves to `witness_extraction`, TWO dispatches per
--     statement -- which is part of why the runtime half is a NEW workflow version
--     (statementFacts_v2), the frozen v1 body having assumed ONE egressing reader.
--
-- THE WALL BETWEEN THE TWO WITNESS REGIMES IS A KEY NAMESPACE, and it is deliberate.
-- The statement pair persists under the SAME two engine_kinds the INVOICE witness pair uses,
-- so something has to stop an invoice consumer from reading a bank statement as an invoice
-- corroboration. Two independent layers do, and both carry a battery cell:
--   (1) THE LANE. `clara._invoice_fact_state` (the 1-arg cross-regime resolver) keys the
--       witness regime on `t.lane = 'llm_witness'` (0093:255-263). This pair's task is lane
--       `statement_facts`, so the resolver never scans it at all. That is the main reason the
--       statement lane is NOT moved onto `llm_witness` -- see THE LANE DECISION below.
--   (2) THE ENVELOPE KEY. These rows carry `statement_witness`, NEVER a bare `witness` key.
--       `clara.evaluate_witness_fact_state_v1` reads `envelope->'witness'->'answers'`; under
--       `statement_witness` it finds nothing, and its belts are a conjunction over eleven
--       REQUIRED answers, so the 2-arg pinned overload fails CLOSED rather than reporting a
--       verdict on a document it does not understand. A statement envelope can therefore never
--       masquerade as an invoice witness read BY SHAPE, only by an explicit mis-pin that the
--       cell proves is refused.
--
-- THE COIN FLIP HEALS HERE (design SS3.9 note 5). The live statement pair self-supersedes
-- TODAY -- one transaction, SAME kind, default `extracted_at`, so the kind-scoped 0089
-- trigger's tie-break falls to a uuid coin flip. Two rows of DIFFERENT kinds can never
-- supersede each other under that trigger, so the v2 pair lands un-coin-flipped BY
-- CONSTRUCTION. The historical pairs are COUNTED in section 0 and left exactly as they are:
-- `superseded_by` is a one-way once-only transition (0007:663-676, CLR08), so in-place
-- repair is impossible and none is attempted.
--
-- =====================================================================================
-- THE SIDE-EFFECT CENSUS -- the successor's checklist, carried or justified (adjudicated)
-- =====================================================================================
-- The live core's COMPLETE write set, and where v2 carries it:
--   (1) the two conditional document_extractions INSERTs   -- REPLACED in the witness arm
--       (two kinds / one engine_id); byte-identical in every other arm.
--   (2) the clara.bank_statements INSERT                    -- CARRIED VERBATIM (spliced).
--   (3) the clara.bank_statement_lines bulk INSERT          -- CARRIED VERBATIM (spliced).
--   (4) the void-lineage `superseded_by` UPDATE             -- CARRIED VERBATIM (spliced).
--   (5) the UNCONDITIONAL documents.financial_date UPDATE   -- CARRIED VERBATIM (spliced).
--   (6) the `bank.statement_ingested` event                 -- CARRIED VERBATIM (spliced).
-- The task-lane wrapper's own set (proposal row, _refund/_settle_processing_call, _audit,
-- the failed/done task updates, the `bank.account_proposal` event) is carried by
-- `clara.persist_statement_facts_v2` in section 4, one for one.
--
-- STALE-DECISION DEFENSE -- ADJUDICATED "SATISFIED BY STRUCTURE", and no token is invented.
-- The invoice family defends a human decision made against pre-swap data by ROTATING
-- `clara.journal_entries.revision_token` in its writers. The statement family reaches the
-- SAME outcome class by a DIFFERENT, ratified mechanism, and this file preserves every part
-- of it verbatim rather than bolting a second one beside it:
--   * the core touches NEITHER journal_entries NOR open_items (its own lock-order law,
--     0038:1374-1378 -- machine-verified: zero occurrences of either identifier in the body),
--     so there is no draft whose inputs it can move under a human;
--   * `bank_statement_lines` is append-only and a live statement cannot be edited in place:
--     the partial unique `(bank_account_id, period_end) where status='live'` plus the
--     `duplicate_period` / `overlapping_period` refusals mean REPLACING a statement requires
--     an explicit human VOID first, and `void_bank_statement` refuses while matched;
--   * the per-account advisory chain lock (203005006) serializes the check-then-insert races
--     the duplicate / overlap / both-edge-continuity guards depend on;
--   * 0040's `recon_frontier_backfill` refusal stops a backfill from demoting a completed
--     reconciliation's first-period exemption after the fact.
-- RE-RUN INVALIDATION follows that same discipline and this file creates NO second path: a
-- witness pair persisted against a document that already owns a live statement lands in the
-- core's own replay branch (step 1, keyed on the DOCUMENT) or its duplicate/overlap refusals
-- (step 7) EXACTLY as v1 does -- facts are never swapped under a live statement. Battery cell.
--
-- REGISTERED, NOT FIXED (pre-existing, orthogonal to the witness spine, needs its own design
-- round): a human mid-review of a `bank_account_proposals` card is undefended against a
-- SECOND document re-ingesting the same (account, period). The proposal branch is idempotent
-- by read, not by a decision token. This file inherits the gap; it does not widen it.
--
-- PAGE BUDGET -- NO LAPSE HERE, and that is a consequence of the lane decision below. The
-- statement task keeps lane `statement_facts`, so it stays inside the enqueue-time page-budget
-- reservation set and its wrapper still settles it. The invoice half's registered spend
-- exposure (design SS3.6/SS8: the firm daily page budget stops applying at the invoice
-- cutover) therefore does NOT extend to statements under this shape.
--
-- =====================================================================================
-- THE LANE DECISION -- reported, not silently taken (design SS3.7 is silent)
-- =====================================================================================
-- The statement witness task keeps the EXISTING `statement_facts` lane, re-aimed at the new
-- `statementFacts_v2` workflow version (the runtime-workflows law's own mechanism: a new
-- `_vN` export + a registry repoint). It does NOT join `llm_witness`. Two reasons, both
-- fail-closed:
--   (a) `clara._invoice_fact_state` resolves the WITNESS regime by `t.lane = 'llm_witness'`
--       (0093:255-263). A statement pair on that lane would be resolved by the INVOICE
--       cross-regime dispatcher and reach the duplicate-bill / sales walls and autopost as if
--       it were an invoice corroboration. The LANE is what keeps the two regimes apart.
--   (b) `witnessFacts.v1` is FROZEN AND DEPLOYED and its `ownsWitnessLane()` claims every
--       `llm_witness` task BY LANE ALONE; the runtime's `enqueueForLane` maps a lane to
--       exactly one workflow and never sees the document. A statement minted onto that lane
--       would be claimed by the invoice witness workflow and read with INVOICE prompts.
-- Cost of the choice, stated: `statement_facts` shares the `ocr_concurrency` window rather
-- than getting an M10-style own window. Reported as a follow-up, not taken here -- the
-- concurrency accounting lives in `claim_document_processing_task`, a wb-0020-PINNED body
-- whose recut owes its own machine-derived restore pair.
--
-- =====================================================================================
-- DELIBERATELY NOT IN THIS FILE -- the `_enqueue_invoice_facts_core` recut (COLLISION)
-- =====================================================================================
-- SS3.7's "statement egress moves to witness_extraction" and the router's bank_statement arm
-- BOTH live inside `clara._enqueue_invoice_facts_core` -- the same wb-0020-PINNED body that
-- F-A1 PR-3 is concurrently recutting for the INVOICE witness arm. Authoring a second
-- independent recut of the pre-PR-3 body here would produce two divergent successors of one
-- pinned function and a restore pair that reverts the wrong one. So this file ships the
-- persist half only, and the enqueue half is specified for a follow-on migration to apply on
-- top of PR-3's body:
--   (i)  the classification arm `document_kind='bank_statement'` + pdf/image (live at
--        0038:6231-6238, carried byte-identical through 0090 SS7e) re-aims its engine literal
--        from 'azure-di:prebuilt-bankStatement.us:2024-11-30' to the witness engine snapshot
--        (`llm-%`), which section 2 below has already made admissible against the prefix CHECK.
--        **THE LITERAL IS PAIRED AND MUST STRING-EQUAL ITS RUNTIME TWIN**: the image's snapshot
--        is `llm-openai:{model}:stmt-witness-v1` (packages/runtime/workflows/
--        statementFacts.v2.services.mjs). This is not a style preference -- statementFacts_v2
--        compares the two BEFORE any egress (assertStatementEngineStamp) and WAITS on a
--        mismatch rather than sending bytes under a receipt naming a model it did not call, so
--        a drifted literal does not mis-stamp, it STALLS the lane. The follow-up piece carries
--        the equality battery cell; the same discipline PR-3 applies to the invoice literal;
--   (ii) the statement typed-consent arm (0038:6328-6348) re-keys its activation lookup from
--        `a.purpose='statement_extraction'` to `'witness_extraction'`, keeping its OWN refusal
--        codes (`statement_multi_client` / `consent_inactive`) and its own
--        `document.statement_facts_failed` emit -- i.e. the shape 0090 SS7e built for the
--        llm_witness arm, applied to the statement arm.
-- AND THE DEPLOY ORDER THAT FALLS OUT OF THAT DEFERRAL, stated because getting it wrong is
-- expensive: this migration is INERT on its own (nothing routes to the v2 verb until the arm
-- above lands), but the runtime's registry repoint is NOT -- `statement_facts` is a lane that
-- is minted TODAY, so pointing `statementFacts:` at v2 takes live traffic immediately. Between
-- this file and the router arm, a repointed image would meet statement tasks still stamped
-- `azure-di:%`, and v2's pre-egress provenance guard WAITS on that mismatch (correctly -- it
-- must not egress under a receipt naming a model it did not call). Those waits occupy the
-- SHARED ocr concurrency window, so they would starve intake OCR too. The order is therefore:
--   (1) THIS migration  ->  (2) PR-3 merges  ->  (3) the router/consent arm migration
--   ->  (4) ONLY THEN the runtime registry repoint to statementFacts_v2.
-- The image built alongside this file ships statementFacts_v2 BUILT, FROZEN and UNPOINTED.
--
-- `statement_extraction` STAYS REGISTERED in the purpose CHECKs regardless: historical
-- authorization rows reference it and drops are BY NAME per the 0038:5462 contract. The design
-- does not imply retiring it, and SS3.5 explicitly trues GOVERNED_EGRESS_PURPOSES to
-- (statement_extraction + witness_extraction) -- BOTH.
-- THE TWO TIMEOUTS, and WHICH ONE IS LOAD-BEARING (the migration rules ask for exactly this
-- distinction rather than leaving a reader to guess).
--   * `statement_timeout` is PRECAUTIONARY. Section 3 is catalog work, and the two CHECK
--     recuts validate `clara.document_processing_tasks` / `clara.bank_statements`, which are
--     small at this frontier. Nothing here scans a large relation.
--   * `lock_timeout` IS LOAD-BEARING, and the earlier draft's blanket "nothing scans" claim
--     hid why. Sections 1 and 2 DROP and re-ADD a CHECK on each of those two tables, which
--     takes ACCESS EXCLUSIVE and then validates every existing row. ACCESS EXCLUSIVE does not
--     merely wait for the live document pipeline's writers -- once it is queued, every READER
--     arriving behind it queues too. A bounded wait makes this file fail fast and retryable
--     instead of stalling document intake for the length of a `statement_timeout`.
set local statement_timeout = '5min';
set local lock_timeout = '3s';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $pre$
declare
  v_sig text := 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_cnt int; v_docs int; v_pairs int;
begin
  -- (0.1) FRONTIER + THE FOUR F-A1 PR-1 DEPENDENCIES, each read POSITIVELY.
  if not exists (select 1 from clara.schema_migrations where version like '0095%f_a1_writer') then
    raise exception 'f_a1_statements prestate: 0095_f_a1_writer is not applied -- frontier mismatch' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is null then
    raise exception 'f_a1_statements prestate: clara.persist_witness_facts is absent -- apply the F-A1 PR-1 writer first' using errcode='CLR10';
  end if;
  if position('v_kind_current' in (select p.prosrc from pg_proc p
        where p.oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure)) = 0 then
    raise exception 'f_a1_statements prestate: the 0089 kind-scoped supersede fix is not applied -- the two-kind pair would still coin-flip' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint con
      join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'document_extractions'
        and con.conname = 'ck_document_extractions_engine_kind_f_a1'
        and pg_get_constraintdef(con.oid) like '%llm\_text\_facts%'
        and pg_get_constraintdef(con.oid) like '%llm\_vision\_facts%') then
    raise exception 'f_a1_statements prestate: the engine_kind CHECK is not widened for the two witness kinds -- apply 0090 first' using errcode='CLR10';
  end if;

  -- (0.2) NOT ALREADY APPLIED.
  if to_regprocedure('clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)') is not null
     or to_regprocedure('clara.persist_statement_facts_v2(uuid,jsonb)') is not null then
    raise exception 'f_a1_statements prestate: already applied' using errcode='CLR10';
  end if;

  -- (0.3) THE SPLICE SOURCE, PINNED BY CONTENT. The live body is 0038-born, 0039-SPLICED
  -- (null-defers-to-chain) and 0040-SPLICED (recon_frontier_backfill). Each marker is
  -- re-asserted with its EXACT live count, so a drifted or partially-migrated source cannot
  -- be spliced from silently -- the 0040 S4.6 discipline, applied to its own successor.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'f_a1_statements prestate: clara._persist_statement_core is GONE' using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'null-defers-to-chain', ''))) / length('null-defers-to-chain');
  if v_cnt <> 1 then
    raise exception 'f_a1_statements prestate: the 0039 null-defers-to-chain marker appears % times (expected exactly 1) -- 0039 is missing or the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'with ordinality', ''))) / length('with ordinality');
  if v_cnt <> 2 then
    raise exception 'f_a1_statements prestate: "with ordinality" appears % times (expected exactly 2 -- 0039''s paired skeleton walk) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'recon_frontier_backfill', ''))) / length('recon_frontier_backfill');
  if v_cnt <> 1 then
    raise exception 'f_a1_statements prestate: the 0040 recon_frontier_backfill marker appears % times (expected exactly 1) -- 0040 is missing or the body drifted', v_cnt using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005006' in v_def) = 0 then
    raise exception 'f_a1_statements prestate: the splice source carries no 203005006 chain lock' using errcode='CLR10';
  end if;
  -- BOTH continuity edges must be in the source, or "both-edge continuity survives verbatim"
  -- would be a claim about a body that no longer has two edges.
  v_cnt := (length(v_def) - length(replace(v_def, 'continuity_mismatch', ''))) / length('continuity_mismatch');
  if v_cnt <> 2 then
    raise exception 'f_a1_statements prestate: continuity_mismatch appears % times (expected exactly 2 -- the prior AND next edges)', v_cnt using errcode='CLR10';
  end if;

  -- (0.4) THE ANCESTOR'S BYTES, PINNED FOR THE TAIL. The tail must prove the live core is
  -- BYTE-UNTOUCHED, and the only honest way to prove that is to compare its bytes -- not to
  -- grep it for a word. (The first cut of this file probed the tail for the string 'witness'
  -- and RED-FLAGGED a clean apply: 0039's own spliced prose says "defers that row's balance
  -- witness to the chain walk", so the probe was reading a NAME as if it were the thing --
  -- review law 3. The rig caught it; the sha is the fix.)
  create temp table _fa1_stmt_prestate(k text primary key, v text) on commit drop;
  insert into _fa1_stmt_prestate(k, v)
    select 'ancestor_prosrc_sha256',
           encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex')   -- builtin; no pgcrypto needed
      from pg_proc p where p.oid = v_sig::regprocedure;
  if not exists (select 1 from _fa1_stmt_prestate where k = 'ancestor_prosrc_sha256' and v is not null) then
    raise exception 'f_a1_statements prestate: could not pin the ancestor''s prosrc sha' using errcode='CLR10';
  end if;

  -- (0.5) THE HISTORICAL COIN-FLIPPED STATEMENT PAIRS -- design SS3.9 note 5: COUNTED AND
  -- DOCUMENTED, never repaired. This is the population the re-kinding heals GOING FORWARD.
  select count(distinct e.document_id), count(*) into v_docs, v_pairs
    from clara.document_extractions e
    where e.engine_kind = 'statement_facts' and e.superseded_by is not null;
  raise notice 'f_a1_statements prestate: % historical statement_facts extraction row(s) across % document(s) carry superseded_by -- the SS3.9-note-5 same-kind coin flip. LEFT AS THEY ARE (superseded_by is once-only, CLR08; in-place repair is impossible). The two-kind pair this file introduces cannot reach that state.', v_pairs, v_docs;

  raise notice 'f_a1_statements prestate: clean -- frontier 0095; the 0089 fix, the 0090 walls and the PR-1 writer are live; the splice source carries 0039 x1, 0040 x1, the chain lock and BOTH continuity edges; no v2 surface exists yet';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- WALL: clara.bank_statements.ingest_mode admits 'witness'.
--
-- WHY A FOURTH MODE RATHER THAN REUSING 'ocr'. `ingest_mode` is the row's record of HOW the
-- read was bought, and the dashboard renders it verbatim (StatementDetail.tsx). Stamping a
-- witness-pair statement 'ocr' would put a false provenance on every cutover row -- the
-- statement family's own MAJOR-2 lesson, one layer up. The three existing values are
-- preserved exactly, so no existing row and no existing lane changes meaning.
--
-- THE NAME IS DISCOVERED, NOT ASSUMED. 0038 declares this CHECK INLINE on the column
-- (0038:393), so PostgreSQL auto-generated its name -- there is no `_0038`-suffixed identifier
-- to drop, and a hardcoded guess would fail at apply on any database whose name differs. The
-- file finds the one CHECK on `ingest_mode` by its DEFINITION, asserts there is exactly one,
-- and re-adds under an explicit name so every later migration can drop it BY NAME (the
-- 0038:5462 contract, adopted here for a constraint that never had it).
-- =====================================================================================
do $s1$
declare v_name text; v_n int;
begin
  select count(*)::int into v_n from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'bank_statements' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%ingest_mode%'
      and pg_get_constraintdef(con.oid) like '%structured%';
  if v_n <> 1 then
    raise exception 'f_a1_statements S1: found % CHECK(s) on bank_statements.ingest_mode (expected exactly 1) -- the shape drifted; re-derive this recut', v_n
      using errcode='CLR10';
  end if;
  select con.conname into v_name from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'bank_statements' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%ingest_mode%'
      and pg_get_constraintdef(con.oid) like '%structured%';
  -- The human-actor coherence CHECK (ck_bank_statements_human_actor) also names ingest_mode
  -- but not 'structured', so the definition probe above cannot pick it up; asserted rather
  -- than assumed, because dropping THAT one would silently let a human row carry no actor.
  if v_name = 'ck_bank_statements_human_actor' then
    raise exception 'f_a1_statements S1: the discovery probe resolved the human-actor CHECK -- refusing to drop it' using errcode='CLR10';
  end if;
  execute format('alter table clara.bank_statements drop constraint %I', v_name);
  raise notice 'f_a1_statements S1: dropped the auto-named ingest_mode CHECK (%) and re-added it as ck_bank_statements_ingest_mode_f_a1 with the fourth mode', v_name;
end
$s1$;
alter table clara.bank_statements add constraint ck_bank_statements_ingest_mode_f_a1
  check (ingest_mode in ('structured','ocr','human','witness'));

-- =====================================================================================
-- SECTION 2 -- WALL: the lane<->engine prefix CHECK admits an `llm-%` engine on the
-- `statement_facts` lane.
--
-- BOTH prefixes stay legal for that lane, deliberately: `azure-%` is the provenance of every
-- statement task minted before the cutover and those rows must remain admissible, while
-- `llm-%` is what the re-aimed router will stamp. Stated rather than hidden -- after this
-- widening the prefix CHECK can no longer tell a legacy statement task from a witness one by
-- engine prefix alone; the discriminator that DOES survive is the extraction's engine_kind
-- (`statement_facts` vs the two witness kinds), which is what every consumer keys on. The
-- lane-blind `clara-fixture:%` first arm (the rig's door) stands untouched, per design SS3.2.
-- Existing rows are pre-asserted against the POST-widen predicate (the 0016/0038/0090 idiom).
-- =====================================================================================
do $s2_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.document_processing_tasks t
  where not (
    t.engine_id like 'clara-fixture:%'
    or (t.lane in ('ocr','invoice_facts') and t.engine_id like 'azure-%')
    or (t.lane = 'statement_facts' and (t.engine_id like 'azure-%' or t.engine_id like 'llm-%'))
    or (t.lane in ('structured_parse','local_facts','none') and t.engine_id like 'clara-%')
    or (t.lane = 'classify' and t.engine_id like 'clara-classify-%')
    or (t.lane = 'statement_parse' and t.engine_id like 'clara-statement-%')
    or (t.lane = 'llm_witness' and t.engine_id like 'llm-%'));
  if v_bad <> 0 then
    raise exception 'f_a1_statements S2 pre-assert failed: % existing task row(s) would violate the widened prefix CHECK', v_bad
      using errcode='CLR10';
  end if;
end
$s2_pre$;
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_engine_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_f_a1_stmt check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts') and engine_id like 'azure-%')
  or (lane = 'statement_facts' and (engine_id like 'azure-%' or engine_id like 'llm-%'))
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%')
  or (lane = 'classify' and engine_id like 'clara-classify-%')
  or (lane = 'statement_parse' and engine_id like 'clara-statement-%')
  or (lane = 'llm_witness' and engine_id like 'llm-%'));

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 3 -- clara._persist_statement_core_v2, SPLICED OFF THE CATALOG.
--
-- FOUR splices, each with an exactly-once prestate probe and a postcheck. Everything this
-- file does not name is carried through BYTE-IDENTICAL from the live body -- which is the
-- whole point of splicing rather than re-typing: SS3.7 requires the CHAIN, both-edge
-- continuity, the refusal ORDER and the write-time-only continuity discipline to survive
-- VERBATIM, and a splice makes that a mechanical fact a postcheck can assert rather than a
-- claim a reviewer has to diff by eye.
--
--   (a) the function NAME -> the _v2 successor (the live core stays, untouched, for the
--       structured and human lanes).
--   (b) the DECLARE block gains the two witness insert clocks.
--   (c) the ingest-mode allowlist gains 'witness', and `v_two` -- the flag the ENTIRE
--       two-reader ladder keys on (mandatory printed totals, full header agreement, the
--       0039 line-skeleton compare, the per-row printed running balance) -- admits it. This
--       is what makes the witness pair inherit every corroboration control the Azure pair
--       had, with no control re-implemented and none silently dropped.
--   (d) the step-11 extraction insert block gains its witness arm.
--
-- A NOTE ON THE REFUSAL MESSAGES, so a reader is not surprised. Several inherited messages
-- say "the OCR statement lane" (e.g. the per-row running-balance refusal). They are LEFT
-- EXACTLY AS THEY ARE on the witness lane: their ERROR CODES and their ORDER are the thing
-- SS3.7 preserves, and rewording them would break the verbatim survival this section exists
-- to guarantee for the sake of cosmetics.
-- =====================================================================================
do $s3$
declare
  v_sig text := 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_new text := 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  -- ---------------------------------------------------------------- (a) THE NAME.
  v_frm := 'FUNCTION clara._persist_statement_core(';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3a: the function header appears % times (expected exactly 1)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm, 'FUNCTION clara._persist_statement_core_v2(');
  -- The body must not self-reference; if it ever does, the rename above would have been
  -- partial and the successor would call its own ancestor.
  if position('_persist_statement_core(' in v_def) <> 0 then
    raise exception 'f_a1_statements S3a: the body still names _persist_statement_core -- a self-reference this splice does not handle' using errcode='CLR10';
  end if;

  -- ---------------------------------------------------------------- (b) THE DECLARE BLOCK.
  v_frm := '  v_stmt uuid; v_ext1 uuid; v_ext2 uuid; v_e1 text; v_e2 text; v_version int;
  v_facts_hash bytea;';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3b: the declare block appears % times (expected exactly 1) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := '  v_stmt uuid; v_ext1 uuid; v_ext2 uuid; v_e1 text; v_e2 text; v_version int;
  v_facts_hash bytea;
  -- F-A1 PR-4: the two witness insert clocks (design SS3.9 note 4).
  v_wit_vis_at timestamptz; v_wit_txt_at timestamptz;';
  v_def := replace(v_def, v_frm, v_to);

  -- ---------------------------------------------------------------- (c) THE FOURTH MODE.
  v_frm := '  if p_ingest_mode not in (''structured'',''ocr'',''human'') then
    raise exception ''ingest_mode must be one of structured / ocr / human''
      using errcode=''CLR10'',detail=''{"reason":"internal"}'';
  end if;
  v_two := (p_ingest_mode = ''ocr'');';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3c: the ingest-mode guard appears % times (expected exactly 1) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := '  if p_ingest_mode not in (''structured'',''ocr'',''human'',''witness'') then
    raise exception ''ingest_mode must be one of structured / ocr / human / witness''
      using errcode=''CLR10'',detail=''{"reason":"internal"}'';
  end if;
  -- F-A1 PR-4 (design SS3.7): ''witness'' is a TWO-READ mode exactly like ''ocr'', and it says so
  -- HERE -- in the one flag the whole two-reader ladder keys on -- rather than by duplicating
  -- that ladder. Everything v_two gates is therefore inherited with no control re-implemented
  -- and none silently dropped: the MANDATORY printed totals (totals_unreadable), the full
  -- load-bearing header agreement, 0039''s line-skeleton compare with its one-sided-null
  -- deferral, and the per-row printed running balance the chain walk needs. The channels are
  -- the two readers: reader1 = the TEXT channel, reader2 = the VISION channel.
  --
  -- (This comment deliberately does NOT spell 0039''s marker phrase: the postcheck below
  -- COUNTS that phrase to prove the splice did not disturb 0039, and a second copy of it in
  -- new prose would defeat the very probe that guards it. Caught by that postcheck on the
  -- first rig run, which is what it is for.)
  v_two := (p_ingest_mode in (''ocr'',''witness''));';
  v_def := replace(v_def, v_frm, v_to);

  -- ---------------------------------------------------------------- (d) THE INSERT BLOCK.
  v_frm := '    if v_two and (v_e2 is null or v_e2 = v_e1) then
      raise exception ''the two statement readers must name two distinct engine_ids''
        using errcode=''CLR10'',detail=''{"reason":"internal"}'';
    end if;
    insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
      values (p_firm, p_document, v_e1, p_engine_kind, v_version, ''done'',
        nullif((p_payload->>''pages_used''),'''')::int,
        jsonb_build_object(''reader'',''reader1'',''ingest_mode'',p_ingest_mode,
          ''header'', v_h1, ''lines'', v_l1, ''line_count'', jsonb_array_length(v_l1),
          ''corroboration_claimed'', p_payload->''corroboration''))
      returning id into v_ext1;
    if v_two then
      insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope)
        values (p_firm, p_document, v_e2, p_engine_kind, v_version, ''done'',
          nullif((p_payload->>''pages_used''),'''')::int,
          jsonb_build_object(''reader'',''reader2'',''ingest_mode'',p_ingest_mode,
            ''header'', v_h2, ''lines'', v_l2, ''line_count'', jsonb_array_length(v_l2),
            ''corroboration_claimed'', p_payload->''corroboration''))
        returning id into v_ext2;
    end if;';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3d: the step-11 extraction insert block appears % times (expected exactly 1) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := '    if p_ingest_mode = ''witness'' then
      -- F-A1 PR-4 (design SS3.7; the M15 inversion of SS3.1, precedent recorded 0092:181-188).
      -- THE PAIR PERSISTS UNDER THE TWO WITNESS KINDS SHARING ONE ENGINE_ID -- the exact
      -- INVERSE of the legacy statement pair in the else-arm below (ONE kind, TWO engine_ids,
      -- same-engine_id refused, 0038:1769-1780).
      --
      -- THE SAME-ENGINE_ID REFUSAL IS NOT MIRRORED, deliberately: under two KINDS it could
      -- never fire -- a probe that cannot say NO. What replaces it is the POSITIVE requirement
      -- that both channels name the TASK''S OWN stamp, so the pair carries a provenance receipt
      -- naming the model that actually received the egress. That is the statement lane''s own
      -- MAJOR-2 lesson (never a hardcoded engine literal) strengthened: not a literal, and not
      -- a runtime assertion either -- the DB''s own task row decides.
      --
      -- AND THE COIN FLIP HEALS HERE (design SS3.9 note 5). The 0089 kind-scoped supersede
      -- trigger compares within a KIND, so two different-kind rows can never supersede each
      -- other. The live same-kind self-supersede stops occurring from this migration forward;
      -- the historical rows are counted in this file''s prestate and left as they are.
      if p_task_engine_id is null then
        raise exception ''the witness statement lane requires the task to carry its own engine_id''
          using errcode=''CLR10'',detail=''{"reason":"internal"}'';
      end if;
      -- THE DB IS THE DECIDER -- which the note above already CLAIMS, and this line is what
      -- makes the claim true. Section 2 deliberately keeps `azure-%` admissible on lane
      -- `statement_facts` (every pre-cutover statement task carries that provenance and those
      -- rows must stay legal), so "all three agree" on its own would happily persist a pair of
      -- llm_text_facts/llm_vision_facts rows under an AZURE engine id -- a witness receipt
      -- naming a model that never saw the document. The WITNESS KINDS are what this arm mints,
      -- so the witness ENGINE FAMILY is a precondition of minting them, and it is enforced
      -- here rather than trusted from the wrapper or the router. Battery cell.
      if p_task_engine_id not like ''llm-%'' then
        raise exception ''the witness statement lane requires an llm-%% engine stamp; the task carries %'', p_task_engine_id
          using errcode=''CLR10'',detail=''{"reason":"internal"}'';
      end if;
      -- READER2''S SILENCE IS NOT AGREEMENT. Step 3 sets
      -- `v_e2 := coalesce(nullif(btrim(...)), p_task_engine_id)` -- 0038''s own line, carried
      -- VERBATIM by this splice and deliberately NOT recut, because the legacy `ocr` arm''s
      -- contract is 0038''s and stays byte-compatible. But that fallback makes the equality
      -- test below VACUOUS for reader2 on THIS arm: an absent engine_id silently BECOMES the
      -- task stamp before it is ever tested, so a vision channel that claimed no provenance at
      -- all would read as one that claimed the right provenance -- a probe that cannot say NO.
      -- The witness arm therefore tests the RAW payload value, which is the thing that
      -- actually carries the second channel''s claim. Battery cell.
      if nullif(btrim(coalesce(v_r2->>''engine_id'','''')),'''') is null then
        raise exception ''the witness statement lane requires reader2 to name its own engine_id''
          using errcode=''CLR10'',detail=''{"reason":"internal"}'';
      end if;
      if v_e1 is distinct from p_task_engine_id or v_e2 is distinct from p_task_engine_id then
        raise exception ''the witness statement channels name an engine_id that is not the task''''s own stamp -- provenance must name the model that received the egress''
          using errcode=''CLR10'',detail=''{"reason":"internal"}'';
      end if;
      -- VISION FIRST, TEXT LAST, each with an EXPLICIT clock_timestamp() (design SS3.9 note 4),
      -- so the document-wide pointer lands on the TEXT row deterministically rather than on a
      -- uuid coin flip. TWO SEPARATE INSERT STATEMENTS (note 3): AFTER INSERT FOR EACH ROW
      -- triggers fire at end of STATEMENT, so a one-statement pair would supersede both rows.
      -- The text clock is bumped at least a microsecond past the vision one -- 0095 SS8''s
      -- defensive strengthening, which makes a same-instant tie impossible rather than merely
      -- unlikely on fast hardware.
      --
      -- THE ENVELOPE CARRIES NO BARE `witness` KEY, and that is load-bearing.
      -- clara.evaluate_witness_fact_state_v1 reads envelope->''witness''->''answers'' off rows of
      -- exactly these two kinds; an envelope presenting a `witness` object could be mistaken
      -- for an INVOICE witness read by SHAPE. Under `statement_witness` it cannot be: the
      -- invoice predicate finds no answers and fails closed (its belts are a conjunction over
      -- eleven REQUIRED answers), and the 1-arg cross-regime resolver never reaches these rows
      -- at all -- it keys the witness regime on t.lane=''llm_witness'' (0093:255-263) and this
      -- pair''s task is lane ''statement_facts''. Both halves carry a battery cell.
      v_wit_vis_at := clock_timestamp();
      insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope, extracted_at)
        values (p_firm, p_document, p_task_engine_id, ''llm_vision_facts'', v_version, ''done'',
          nullif((p_payload->>''pages_used''),'''')::int,
          jsonb_build_object(''reader'',''reader2'',''ingest_mode'',p_ingest_mode,
            ''statement_witness'', jsonb_build_object(''channel'',''vision''),
            ''header'', v_h2, ''lines'', v_l2, ''line_count'', jsonb_array_length(v_l2),
            ''corroboration_claimed'', p_payload->''corroboration''), v_wit_vis_at)
        returning id into v_ext2;
      v_wit_txt_at := greatest(clock_timestamp(), v_wit_vis_at + interval ''1 microsecond'');
      insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope, extracted_at)
        values (p_firm, p_document, p_task_engine_id, ''llm_text_facts'', v_version, ''done'',
          nullif((p_payload->>''pages_used''),'''')::int,
          jsonb_build_object(''reader'',''reader1'',''ingest_mode'',p_ingest_mode,
            ''statement_witness'', jsonb_build_object(''channel'',''text''),
            ''header'', v_h1, ''lines'', v_l1, ''line_count'', jsonb_array_length(v_l1),
            ''corroboration_claimed'', p_payload->''corroboration''), v_wit_txt_at)
        returning id into v_ext1;
    else
    if v_two and (v_e2 is null or v_e2 = v_e1) then
      raise exception ''the two statement readers must name two distinct engine_ids''
        using errcode=''CLR10'',detail=''{"reason":"internal"}'';
    end if;
    insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
      values (p_firm, p_document, v_e1, p_engine_kind, v_version, ''done'',
        nullif((p_payload->>''pages_used''),'''')::int,
        jsonb_build_object(''reader'',''reader1'',''ingest_mode'',p_ingest_mode,
          ''header'', v_h1, ''lines'', v_l1, ''line_count'', jsonb_array_length(v_l1),
          ''corroboration_claimed'', p_payload->''corroboration''))
      returning id into v_ext1;
    if v_two then
      insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope)
        values (p_firm, p_document, v_e2, p_engine_kind, v_version, ''done'',
          nullif((p_payload->>''pages_used''),'''')::int,
          jsonb_build_object(''reader'',''reader2'',''ingest_mode'',p_ingest_mode,
            ''header'', v_h2, ''lines'', v_l2, ''line_count'', jsonb_array_length(v_l2),
            ''corroboration_claimed'', p_payload->''corroboration''))
        returning id into v_ext2;
    end if;
    end if;';
  v_def := replace(v_def, v_frm, v_to);

  execute v_def;

  -- ---------------------------------------------------------------- POSTCHECKS.
  -- Re-read the LIVE catalog for the successor and re-assert every survival marker. This is
  -- the evidence that "verbatim" is a fact about the deployed body, not about this file.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_new::regprocedure;
  if v_def is null then
    raise exception 'f_a1_statements S3 postcheck: the v2 successor did not land' using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005006' in v_def) = 0 then
    raise exception 'f_a1_statements S3 postcheck: the successor lost the 203005006 chain lock' using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'null-defers-to-chain', ''))) / length('null-defers-to-chain');
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3 postcheck: 0039''s null-defers-to-chain marker count is % (expected 1)', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'with ordinality', ''))) / length('with ordinality');
  if v_cnt <> 2 then
    raise exception 'f_a1_statements S3 postcheck: "with ordinality" count is % (expected 2)', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'recon_frontier_backfill', ''))) / length('recon_frontier_backfill');
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3 postcheck: 0040''s recon_frontier_backfill marker count is % (expected 1)', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'continuity_mismatch', ''))) / length('continuity_mismatch');
  if v_cnt <> 2 then
    raise exception 'f_a1_statements S3 postcheck: continuity_mismatch count is % (expected 2 -- BOTH edges)', v_cnt using errcode='CLR10';
  end if;
  -- The witness arm actually landed, and it landed with the two kinds and the ordered clocks.
  if position('llm_vision_facts' in v_def) = 0 or position('llm_text_facts' in v_def) = 0 then
    raise exception 'f_a1_statements S3 postcheck: the successor does not name both witness kinds' using errcode='CLR10';
  end if;
  if position('v_wit_txt_at := greatest(' in v_def) = 0 then
    raise exception 'f_a1_statements S3 postcheck: the successor lost the ordered insert clocks (SS3.9 note 4)' using errcode='CLR10';
  end if;
  -- THE TWO REVIEW-FOLD HARDENINGS, read off the LIVE body. Both are witness-arm-only
  -- judgement logic, so a splice that dropped one would leave a successor that still passes
  -- every other probe in this file while accepting a pair it must refuse.
  if position('not like ''llm-%''' in v_def) = 0 then
    raise exception 'f_a1_statements S3 postcheck: the successor lost the witness-arm llm-%% engine-prefix gate' using errcode='CLR10';
  end if;
  if position('requires reader2 to name its own engine_id' in v_def) = 0 then
    raise exception 'f_a1_statements S3 postcheck: the successor lost the witness-arm RAW reader2 engine_id requirement (the 0038 coalesce fallback would make the equality test vacuous on silence)' using errcode='CLR10';
  end if;
  -- AND THE LEGACY ARM IS UNDISTURBED: 0038''s same-engine_id refusal must survive exactly
  -- once. The witness arm deliberately does NOT mirror it (under two KINDS it could never
  -- fire), so a second copy would mean the splice landed the new arm in the wrong place.
  v_cnt := (length(v_def) - length(replace(v_def, 'must name two distinct engine_ids', ''))) / length('must name two distinct engine_ids');
  if v_cnt <> 1 then
    raise exception 'f_a1_statements S3 postcheck: the legacy arm''s distinct-engine_id refusal count is % (expected exactly 1 -- the ocr arm''s contract is 0038''s and stays byte-compatible)', v_cnt using errcode='CLR10';
  end if;
  -- And the LIVE ANCESTOR is still there and still serving the other three lanes.
  if to_regprocedure(v_sig) is null then
    raise exception 'f_a1_statements S3 postcheck: the live _persist_statement_core is GONE -- the successor must not replace it' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_new::regprocedure) <> 'clara_fn_owner' then
    raise exception 'f_a1_statements S3 postcheck: the successor has the wrong owner' using errcode='CLR10';
  end if;
end
$s3$;
revoke all on function clara._persist_statement_core_v2(
  uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text) from public;

-- =====================================================================================
-- SECTION 4 -- clara.persist_statement_facts_v2 -- THE WITNESS STATEMENT TASK WRAPPER.
--
-- Shaped one-for-one on `clara.persist_statement_facts` (0038:1888-2024) and carrying its
-- WHOLE side-effect set: the two-phase replay branch, the filings-resolved client, the
-- proposal branch (proposal row + failed task + refund + audit + the id-only
-- `bank.account_proposal` event), and the settle path (page-budget settle + done task +
-- audit). Nothing statement-shaped lives here and nothing task-shaped lives in the core --
-- the same split its ancestor draws.
--
-- THE THREE DELIBERATE DIFFERENCES, each stated:
--   (1) it serves the `statement_facts` lane ONLY. `statement_parse` (the free in-process
--       csv/ofx parse) is untouched by SS3.7 and keeps riding the v1 wrapper and the v1 core.
--   (2) it calls the core with p_ingest_mode => 'witness', so the pair persists under the two
--       witness kinds.
--   (3) it passes the TASK's engine_id as p_task_engine_id, which the witness arm requires
--       BOTH channels to match -- the provenance receipt names the model the router stamped.
--
-- THE PAGE BUDGET IS KEPT. The witness statement task stays on lane `statement_facts`, so it
-- is still reserved at enqueue and still settled here. The invoice half's registered spend
-- exposure (design SS3.6/SS8) does not extend to statements under this shape.
-- =====================================================================================
create function clara.persist_statement_facts_v2(p_task uuid, p_payload jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_client uuid; v_clients int; v_pages int;
  v_res jsonb; v_stmt uuid; v_prop uuid; v_existing uuid; v_reason text;
begin
  select * into t from clara.document_processing_tasks where id = p_task;
  if not found or t.lane <> 'statement_facts' then
    raise exception 'witness statement-facts task not found or not in the statement_facts lane' using errcode='CLR16';
  end if;
  if t.status = 'done' then
    select id into v_existing from clara.bank_statements
      where document_id = t.document_id and firm_id = t.firm_id and status = 'live' limit 1;
    return jsonb_build_object('task_id', p_task, 'statement_id', v_existing,
      'status', 'done', 'replayed', true);
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'the statement payload is malformed'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  if p_payload ? 'pages_used'
     and (jsonb_typeof(p_payload->'pages_used') <> 'number'
       or (p_payload->>'pages_used')::numeric < 0
       or (p_payload->>'pages_used')::numeric <> trunc((p_payload->>'pages_used')::numeric)) then
    raise exception 'pages_used must be a whole non-negative number'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  v_pages := coalesce(nullif(p_payload->>'pages_used','')::int, 0);

  -- The task row lock, then the status re-read: the 0026:697-707 double-check, inherited.
  select * into t from clara.document_processing_tasks where id = p_task for update;
  if t.status = 'done' then
    select id into v_existing from clara.bank_statements
      where document_id = t.document_id and firm_id = t.firm_id and status = 'live' limit 1;
    return jsonb_build_object('task_id', p_task, 'statement_id', v_existing,
      'status', 'done', 'replayed', true);
  end if;
  if t.status <> 'running' then
    raise exception 'witness statement-facts task is not running' using errcode='CLR16';
  end if;

  -- THE CLIENT, THROUGH THE FILINGS. Exactly one active filing, or nothing to answer. The
  -- min(uuid)-by-text-cast is the house idiom for a deterministic pick (0035:196).
  select count(*)::int, min(f.client_id::text)::uuid into v_clients, v_client
    from clara.document_filings f
    where f.document_id = t.document_id and f.retired_at is null;
  if v_clients = 0 then
    raise exception 'document % carries no active filing; a statement cannot be attributed', t.document_id
      using errcode='CLR02';
  end if;
  if v_clients > 1 then
    raise exception 'document % is filed to % clients; a statement filed to more than one client has no single answerable client', t.document_id, v_clients
      using errcode='CLR10',detail='{"reason":"statement_multi_client"}';
  end if;

  v_res := clara._persist_statement_core_v2(
    p_firm            => t.firm_id,
    p_client          => v_client,
    p_document        => t.document_id,
    p_payload         => p_payload,
    p_ingest_mode     => 'witness',
    p_actor           => null,
    p_task            => p_task,
    p_bank_account    => null,
    p_engine_kind     => 'statement_facts',   -- unread by the witness arm (it names both kinds
                                              -- itself); passed for signature congruence only
    p_task_engine_id  => t.engine_id);

  -- ---------------------------------------------------------------- THE PROPOSAL BRANCH.
  -- The two account-binding verdicts are RETURNED, not raised, so the proposal row, the failed
  -- task and the event all commit together (the 0038 lane contract).
  if not coalesce((v_res->>'ok')::boolean, false) then
    v_reason := v_res->>'reason';
    if v_reason not in ('account_unregistered','account_inactive') then
      raise exception 'impossible state: the statement core returned a non-ok verdict % that is not an account-binding verdict', coalesce(v_reason,'(null)')
        using errcode='CLR35';
    end if;
    -- IDEMPOTENT BY READ, not by an index name: a re-enqueued read of the same unregistered
    -- account must not breed a second card in front of the same human.
    select id into v_prop from clara.bank_account_proposals bp
      where bp.client_id = v_client and bp.status = 'open'
        and bp.bank_code = (v_res->>'institution_code')
        and bp.account_number_normalized = (v_res->>'account_digits')
      order by bp.created_at limit 1;
    if v_prop is null then
      insert into clara.bank_account_proposals(firm_id, client_id, document_id, task_id,
          reason, bank_code, account_number, account_number_normalized,
          existing_bank_account_id, header, status)
        values (t.firm_id, v_client, t.document_id, p_task,
          v_reason, v_res->>'institution_code',
          v_res->>'account_printed', v_res->>'account_digits',
          nullif(v_res->>'bank_account_id','')::uuid, v_res->'header', 'open')
        returning id into v_prop;
    end if;

    update clara.document_processing_tasks
      set status = 'failed', error_code = v_reason, finished_at = now()
      where id = p_task;
    perform clara._refund_processing_call(p_task, v_reason);
    perform clara._audit(t.firm_id, null, null, null, 'persist_statement_facts_v2', null,
      jsonb_build_object('task', p_task, 'document', t.document_id, 'client', v_client,
        'outcome', v_reason, 'proposal', v_prop));
    -- ID-ONLY: the account number NEVER enters an event payload; the card reads the proposal
    -- row, which is human-only and carries no agent grant.
    perform clara._append_event(t.firm_id, 'bank.account_proposal', v_client, null,
      null, null, null, t.document_id, null,
      jsonb_build_object('proposal_id', v_prop, 'document_id', t.document_id,
        'task_id', p_task));
    return jsonb_build_object('task_id', p_task, 'status', 'failed', 'reason', v_reason,
      'proposal_id', v_prop);
  end if;

  -- ---------------------------------------------------------------- THE SETTLE PATH.
  v_stmt := (v_res->>'statement_id')::uuid;
  -- The witness statement lane KEEPS the page-budget settle its Azure predecessor had: it is
  -- lane `statement_facts`, so it was reserved at enqueue and the reservation must be closed.
  perform clara._settle_processing_call(p_task, v_pages);
  update clara.document_processing_tasks
    set status = 'done', finished_at = now() where id = p_task;
  perform clara._audit(t.firm_id, null, null, null, 'persist_statement_facts_v2', null,
    jsonb_build_object('task', p_task, 'document', t.document_id, 'client', v_client,
      'statement', v_stmt, 'version', t.version_n, 'pages', v_pages,
      'reader1_extraction', v_res->>'reader1_extraction_id',
      'reader2_extraction', v_res->>'reader2_extraction_id',
      'replayed', coalesce((v_res->>'replayed')::boolean, false)));
  return jsonb_build_object('task_id', p_task, 'statement_id', v_stmt, 'status', 'done',
    'replayed', coalesce((v_res->>'replayed')::boolean, false),
    'line_count', (v_res->>'line_count')::int,
    'bank_account_id', (v_res->>'bank_account_id')::uuid,
    'reader1_extraction_id', (v_res->>'reader1_extraction_id')::uuid,
    'reader2_extraction_id', (v_res->>'reader2_extraction_id')::uuid);
end $$;
revoke all on function clara.persist_statement_facts_v2(uuid,jsonb) from public;
grant execute on function clara.persist_statement_facts_v2(uuid,jsonb) to clara_runtime;

reset role;

-- =====================================================================================
-- SECTION 5 -- TAIL CENSUS. Re-read the live catalog and say what was found.
-- =====================================================================================
do $tail$
declare
  v_new text := 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_txt text; v_n int;
begin
  -- (1) BOTH cores live, and the ancestor is byte-unmoved in the ways that matter.
  if to_regprocedure('clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)') is null
     or to_regprocedure(v_new) is null then
    raise exception 'f_a1_statements tail: the core pair is incomplete' using errcode='CLR10';
  end if;
  -- BY ITS BYTES, against the sha pinned in the prestate -- never by grepping it for a word
  -- (review law 3: a guard that reads a NAME reads a projection of the thing, not the thing).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_txt from pg_proc p
    where p.oid = 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
  if v_txt is distinct from (select v from _fa1_stmt_prestate where k = 'ancestor_prosrc_sha256') then
    raise exception 'f_a1_statements tail: the LIVE ancestor''s prosrc sha CHANGED -- it must stay byte-untouched for the structured (statement_parse) and human (enter_bank_statement) lanes' using errcode='CLR10';
  end if;

  -- (2) The successor's refusal ORDER, asserted POSITIONALLY rather than by presence alone --
  -- SS3.7 preserves the ORDER, so the census reads the order, not just the vocabulary.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_new::regprocedure;
  if not (position('"reason":"readers_disagree"' in v_def) > 0
      and position('"reason":"header_unreadable"' in v_def) > position('"reason":"readers_disagree"' in v_def)
      and position('"reason":"non_myr_statement"' in v_def) > position('"reason":"header_unreadable"' in v_def)
      and position('"reason":"duplicate_period"' in v_def) > position('"reason":"non_myr_statement"' in v_def)
      and position('"reason":"chain_broken"' in v_def) > position('"reason":"duplicate_period"' in v_def)
      and position('"reason":"continuity_mismatch"' in v_def) > position('"reason":"chain_broken"' in v_def)) then
    raise exception 'f_a1_statements tail: the successor''s refusal ORDER does not match the live ladder (readers_disagree -> header_unreadable -> non_myr_statement -> duplicate_period -> chain_broken -> continuity_mismatch)' using errcode='CLR10';
  end if;

  -- (3) The WC-R5 absence->MYR posture, and the fact it is NOT the invoice posture. The
  -- statement normalizer coalesces an absent currency to MYR and flags currency_stated=false;
  -- only an EXPLICIT non-MYR refuses. This is read here so a later reader cannot quietly
  -- unify it with the invoice belt, where absence yields '' and never corroborates.
  select pg_get_functiondef(p.oid) into v_txt from pg_proc p
    where p.oid = 'clara._stmt_header_norm(jsonb)'::regprocedure;
  if position('coalesce(v_ccy, ''MYR'')' in v_txt) = 0 or position('''currency_stated''' in v_txt) = 0 then
    raise exception 'f_a1_statements tail: clara._stmt_header_norm no longer carries the WC-R5 absence->MYR posture' using errcode='CLR10';
  end if;
  if position('(v_hdr->>''currency_stated'')::boolean' in v_def) = 0 then
    raise exception 'f_a1_statements tail: the successor lost the WC-R5 explicit-non-MYR refusal' using errcode='CLR10';
  end if;

  -- (4) The two widened CHECKs, read NON-VACUOUSLY (the value must actually be admitted).
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname='bank_statements'
      and con.conname='ck_bank_statements_ingest_mode_f_a1';
  if v_txt is null or position('witness' in v_txt) = 0 or position('human' in v_txt) = 0 then
    raise exception 'f_a1_statements tail: the ingest_mode CHECK did not widen, or dropped an existing mode' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks'
      and con.conname='ck_processing_task_lane_engine_f_a1_stmt';
  if v_txt is null or position('llm_witness' in v_txt) = 0 then
    raise exception 'f_a1_statements tail: the prefix CHECK recut dropped the llm_witness arm' using errcode='CLR10';
  end if;

  -- (5) The refusal codes the v2 wrapper can hand fail_statement_facts must ALL be storable.
  -- Read positively against the live CHECK rather than assumed from the taxonomy's age.
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks'
      and con.conname like 'ck_processing_task_error_code%';
  if v_txt is null then
    raise exception 'f_a1_statements tail: no error-code CHECK found' using errcode='CLR10';
  end if;
  foreach v_txt in array array['chain_broken','continuity_mismatch','readers_disagree',
      'header_unreadable','totals_unreadable','duplicate_period','overlapping_period',
      'non_myr_statement','account_unregistered','account_inactive','statement_multi_client',
      'period_invalid','line_date_out_of_period']
  loop
    if not exists (select 1 from pg_constraint con
        join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='clara' and c.relname='document_processing_tasks'
          and con.conname like 'ck_processing_task_error_code%'
          and position(v_txt in pg_get_constraintdef(con.oid)) > 0) then
      raise exception 'f_a1_statements tail: the error-code CHECK cannot store the statement refusal %', v_txt using errcode='CLR10';
    end if;
  end loop;

  -- (6) THE GRANT SURFACE, read off the ACL TEXT FORM rather than has_function_privilege.
  -- Two reasons, and the second is load-bearing: (a) the ACL is the thing the revoke/grant
  -- pair actually wrote, so reading it proves the WRITE rather than a derived answer, and the
  -- same read also shows PUBLIC holds nothing; (b) the privilege-name LITERAL that
  -- has_function_privilege takes is a token the WB-R21 dynamic-SQL scanner keys on inside a
  -- DO block, and a verification tail must not spend a lint waiver to say something the
  -- catalog states plainly. `=X/` is the ACL spelling of the call privilege.
  select coalesce(array_to_string(p.proacl, ','), '') into v_txt from pg_proc p
    where p.oid = 'clara.persist_statement_facts_v2(uuid,jsonb)'::regprocedure;
  if position('clara_runtime=X/' in v_txt) = 0 then
    raise exception 'f_a1_statements tail: clara_runtime cannot call persist_statement_facts_v2 (acl=%)', v_txt using errcode='CLR10';
  end if;
  if v_txt like '=X/%' or position(',=X/' in v_txt) > 0 then
    raise exception 'f_a1_statements tail: persist_statement_facts_v2 is granted to PUBLIC (acl=%)', v_txt using errcode='CLR10';
  end if;
  select coalesce(array_to_string(p.proacl, ','), '') into v_txt from pg_proc p
    where p.oid = v_new::regprocedure;
  if position('clara_runtime=X/' in v_txt) <> 0 then
    raise exception 'f_a1_statements tail: the _core_v2 must stay ungranted to clara_runtime (the one-ungranted-core law, 0004:6-12) -- acl=%', v_txt using errcode='CLR10';
  end if;

  select count(*)::int into v_n from clara.document_extractions
    where engine_kind in ('llm_text_facts','llm_vision_facts');
  raise notice 'f_a1_statements tail: clean -- _persist_statement_core_v2 spliced (chain lock, 0039 x1, 0040 x1, BOTH continuity edges, refusal ORDER and the WC-R5 absence->MYR posture all re-asserted on the LIVE successor); the witness arm carries all four provenance gates (task stamp present, task stamp llm-%%, reader2 names its OWN engine_id, all three equal) and the legacy arm''s distinct-engine_id refusal survives exactly once; the ancestor is untouched and still serves statement_parse + enter_bank_statement; persist_statement_facts_v2 granted to clara_runtime; ingest_mode and the lane<->engine prefix CHECK widened non-vacuously; % witness-kind extraction row(s) exist so far. NOT IN THIS FILE (collision with PR-3 on the wb-0020-pinned _enqueue_invoice_facts_core): the router arm re-aim and the statement typed-consent purpose move to witness_extraction.', v_n;
end
$tail$;
