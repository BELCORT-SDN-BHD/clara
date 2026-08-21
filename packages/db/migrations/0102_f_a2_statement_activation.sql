-- 0102_f_a2_statement_activation.sql -- Wave-F Track A, F-A2 WINDOW B:
-- THE BANK-STATEMENT WITNESS ACTIVATION (the DB half). Authored UNNUMBERED; the number was
-- claimed at MERGE PREPARATION (standing law, AGENTS.md + .claude/rules/db-migrations.md),
-- once the rest of the train had taken its own: 0099/0100 the F-A2 openers, 0101 opener 6.
-- This file lands LAST. The renumber is mechanical and content-free -- the battery gates on
-- the CATALOG (what the live body carries), never on this filename, so nothing moved with it.
-- Spec of record: docs/plan/active/f-a2-statement-activation-spec.md (SS2, SS3, SS5, SS6, SS9);
-- design `docs/plan/active/f-a1-witness-pair-design.md` SS3.7; the deferral contract is
-- 0098_f_a1_statements.sql:141-176 ("DELIBERATELY NOT IN THIS FILE").
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- two literals inside ONE wb-0020-PINNED body, nothing else
-- =====================================================================================
-- `clara._enqueue_invoice_facts_core(uuid)` is recut ONCE, with TWO edits, both inside the
-- bank-statement path and both named by 0098's own deferral list:
--   (1) THE ROUTER RE-KEY. The `document_kind='bank_statement'` + pdf/image classification
--       arm re-aims its ENGINE identity from the retiring Azure prebuilt-bankStatement read
--       to the witness pair's own snapshot. **`v_lane` STAYS `statement_facts`** -- untouched,
--       and that is the whole reason this splice is smaller than PR-3's invoice-arm recut:
--       0098's own LANE DECISION (0098:120-138) rules the statement pair must NOT join
--       `llm_witness`, because `clara._invoice_fact_state` keys the witness regime on that
--       lane and would resolve a statement pair as an INVOICE corroboration, and because
--       witnessFacts.v1 claims every `llm_witness` task BY LANE ALONE and would read a bank
--       statement with INVOICE prompts. Keeping the lane also keeps the statement task inside
--       the enqueue-time page-budget reservation set (0098:114-118, "PAGE BUDGET -- NO LAPSE
--       HERE"), so the invoice half's registered spend exposure does not extend to statements.
--   (2) THE CONSENT RE-KEY. The statement arm's enqueue-time typed-consent lookup moves its
--       `purpose` literal from `statement_extraction` to `witness_extraction` -- the purpose
--       the pair actually egresses under (statementFacts.v2.behavior.mjs mints its dispatch
--       for `witness_extraction`). Its OWN refusal-code vocabulary is UNCHANGED
--       (`statement_multi_client` / `consent_inactive` -- 0098:161-165's own words), as is its
--       `document.statement_facts_failed` emit; the postcheck counts both rather than
--       assuming them.
--
-- REGISTERED SIDE EFFECT, SURFACED RATHER THAN ABSORBED -- edit (2) MOVES BOTH STATEMENT LANES.
-- The typed-consent branch it edits opens `if v_lane in ('statement_facts','statement_parse')`:
-- ONE branch, TWO lanes. So the free, LOCAL csv/ofx parse lane is now gated on
-- `witness_extraction` as well, even though it egresses nothing. Three facts about that, stated
-- plainly because a reader who noticed it deserves the answer rather than a silence:
--   * it is what the deferral contract asks for. 0098:161-165 names "the statement typed-consent
--     arm (0038:6328-6348)" -- that arm, whole -- and the activation spec's SS2 Section 2 quotes
--     the same one-literal move. Splitting the branch so the two lanes read different purposes
--     would be a NEW design decision and a materially larger recut of a wb-0020-PINNED body;
--   * it is not a NEW oddity, only a re-labelled one: the csv lane was already gated on an
--     EGRESS purpose (`statement_extraction`) despite never egressing. This file moves which
--     purpose, not whether one applies;
--   * live impact is nil at this frontier: the F-A1 PR-3 ceremony already granted+activated
--     `witness_extraction` for every live client, so both lanes stay open across the flip. A
--     deployment holding ONLY the retiring purpose would lose BOTH lanes until it activates the
--     witness one -- which is the ceremony's own prestate read (SS6 of the activation spec).
-- FLAGGED FOR THE OWNER as the one judgement call this file does not settle by itself: whether
-- the local csv lane should eventually get its own non-egress gate. Not taken here; recorded.
--
-- NO NEW CONSENT SURFACE IS NEEDED, and that is a fact about the key rather than a hope:
-- `clara.client_egress_purpose_activations` is keyed on (firm_id, client_id, purpose) alone --
-- no lane, no document_kind, no engine column (0038:5981-5987) -- so the `witness_extraction`
-- activations already granted+activated in the F-A1 PR-3 ceremony answer this lookup for the
-- statement lane the moment the literal moves. `statement_extraction` STAYS REGISTERED in the
-- purpose CHECKs regardless: historical authorization rows reference it and drops are BY NAME
-- (the 0038:5462 contract), and GOVERNED_EGRESS_PURPOSES already carries BOTH purposes.
--
-- WHAT THIS FILE DOES NOT TOUCH, stated so a reader does not go looking: the invoice-kind arm
-- (the F-A2 opener-2 `:v2` literal it inherits), the csv/ofx `statement_parse` arm, the classify
-- arm, the xml/local_facts arm, the already_completed engine_kind map and its EITHER-REGIME
-- fallback, the `llm_witness` typed-consent branch, the page-budget reserving lane list, and
-- `clara._persist_statement_core_v2` / `clara.persist_statement_facts_v2` (0098 SS3/SS4 -- the
-- persist half, already live, already byte-frozen; the CHAIN, both continuity edges and the
-- refusal ORDER ride entirely on that already-shipped body and nothing here reaches it). Every
-- one of those is RE-ASSERTED in the postcheck rather than trusted to the splice.
--
-- =====================================================================================
-- THE ENGINE LITERAL CONTRACT (LOCKED, both builders' terms)
-- =====================================================================================
-- 'llm-openai:gpt-5.6-terra:stmt-witness-v1' MUST string-equal
-- STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId in the statementFacts.v2 services module (built
-- from STATEMENT_WITNESS_MODEL_ID default 'gpt-5.6-terra' + STATEMENT_WITNESS_ENGINE_VERSION
-- 'stmt-witness-v1', prefixed 'llm-openai:'). This is not a style preference: statementFacts_v2
-- compares the task's own stamp against the image's snapshot BEFORE any egress and WAITS on a
-- mismatch rather than sending bytes under a receipt naming a model it did not call
-- (0098:154-159), so a drifted literal does not mis-stamp -- it STALLS the lane. **A DB-side
-- migration cannot read a .mjs file**, so the equality is asserted by a battery cell
-- (f-a2.activation-engine-literal, mirroring f-a1.cutover-engine-literal) that reads BOTH sides
-- independently and compares; it is named here so the ceremony's positive-read list carries it.
-- The `llm-%` prefix is already admissible for lane `statement_facts` -- 0098 SS2 widened the
-- lane<->engine prefix CHECK for exactly this file, and the prestate DISCOVERS that CHECK by
-- shape and asserts it rather than trusting the widening happened.
--
-- =====================================================================================
-- THE PRESTATE PIN -- WHOLE-BODY, and the choice is stated rather than left to be inferred
-- =====================================================================================
-- The activation spec left this open (its SS9 item 4: 0097 pinned only its anchor counts).
-- ADJUDICATED: this file pins the WHOLE prosrc sha256 of `_enqueue_invoice_facts_core`, the
-- discipline 0097 applied to its OWN authoring target in section 3 and the one the F-A2
-- openers' part-1 migration applied to all three of its targets. The pinned value is the body
-- that migration's own section-2 tail PRINTS as its handoff -- it recut this same function
-- (the invoice arm's `:v1` -> `:v2` engine bump), so the body this file inherits is ITS
-- output, never the 0097 post-state.
--   REFUSAL MEANING, plainly: a sha mismatch means either the F-A2 openers' part-1 migration
--   did NOT apply first, or this body moved under us for some other reason. Either way the
--   anchors below were verified against a body that is not the live one, so THE CEREMONY
--   STOPS -- it does not proceed on a wrong premise and it does not "try the splice anyway".
-- The anchor-uniqueness counts remain the load-bearing guard; the sha is the tripwire that the
-- base is the exact body those anchors were verified against.
--   THE ORDERING IS ALSO CHECKED FACT-DRIVEN, NOT BY MIGRATION NUMBER. Migration numbers are
--   claimed at merge, so a prestate that named one would be pinning a filename. Instead the
--   prestate reads the openers' own BEHAVIOURAL marker out of the live body (the invoice arm's
--   `:v2` engine literal, which only that migration produces) and reads 0098's persist half by
--   its FUNCTION SIGNATURE. Both are facts this database holds; neither is a spelling.
--
-- =====================================================================================
-- SPLICE DISCIPLINE (0097:78-82's, verbatim in shape)
-- =====================================================================================
-- Read the LIVE body through the catalog, assert the target substring occurs EXACTLY ONCE,
-- replace() only there, execute the result. Nothing else in the body is retyped, so every arm
-- this file does not name survives BY CONSTRUCTION. THE ANCHORS ARE WHOLE BLOCKS, comment
-- included, deliberately: the wb-0020 restore-pair battery (wall 12) reverses this body LAYER
-- BY LAYER, outermost first, and a layer whose reversal pair was a bare literal swap could not
-- carry its comment back. This file's PR extends that battery with the exact inverse of both
-- edits below, as its own layer, reversed FIRST.
--
-- POSITIONAL IDENTITY, not spelling (review law 3). Edit 1's anchor OPENS with the
-- `document_kind='bank_statement'` test, so the literal it moves is proven to be the one inside
-- the bank-statement classification arm rather than any other occurrence; edit 2's anchor
-- CLOSES with the statement arm's own `consent_inactive` verdict, so the purpose literal it
-- moves is proven to be the STATEMENT lookup and not the `llm_witness` branch's twin (the two
-- blocks are byte-identical apart from the purpose and the gate codes).
--
-- =====================================================================================
-- D1 WRITE-QUIESCE -- OWED, and the window has a second, PROCEDURAL half
-- =====================================================================================
-- `clara._enqueue_invoice_facts_core` is a LIVE hot-path body (every document classification
-- call reaches it), exactly the reasoning 0097:72-76 states for itself. PostgreSQL runs an
-- in-flight PL/pgSQL call to completion on the body it STARTED with, so a call spanning this
-- migration silently runs the OLD body. The in-file guard below fails closed on a fresh
-- heartbeat.
--
-- AND A BINDING CEREMONY RULE THIS FILE CANNOT ENFORCE, stated because getting it wrong is the
-- one hazard the design does not name a guard for (activation spec SS3 last bullet / SS9 item 1,
-- ADJUDICATED): the runtime machine stays STOPPED across BOTH steps -- this migration's apply
-- AND the repointed-image deploy that follows it. A task minted by the re-keyed router but
-- claimed by an OLD `statementFacts_v1` image would be read by a body hardcoded to the Azure
-- call, which does not consult the task's own engine_id at all. The MIRROR-image gap is guarded
-- (statementFacts_v2 WAITS on an Azure-stamped task); this one is not, so it is closed
-- procedurally by never letting a claim happen in between. One window, machine stopped, two
-- steps, in this order.
set local statement_timeout = '10min';
-- SEARCH PATH PINNED FOR THE WHOLE FILE (0092:21-26's recorded reason, and the F-A2 openers'
-- part-1 file repeats it): the tail compares catalog reads taken either side of a DDL, and an
-- unpinned path renders qualified-or-bare inconsistently.
set local search_path = clara, pg_temp;

-- =====================================================================================
-- SS0 QUIESCE GUARD. FAIL CLOSED ON ABSENCE: 0006 creates the heartbeat table and always
-- precedes this file, so absence is catalog drift -- and drift is exactly when a runtime is
-- most likely alive and unobservable.
-- =====================================================================================
do $act_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A2 WINDOW B QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 WINDOW B QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces clara._enqueue_invoice_facts_core, a live hot-path body, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply. The machine must then STAY stopped until the repointed image is deployed.',
      v_component, v_beat;
  end if;
end
$act_quiesce$;

-- =====================================================================================
-- SS0.1 PRESTATE -- every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $act_pre$
declare v_src text; v_sha text; v_n int; v_def text;
begin
  -- (0.1) THE TARGET EXISTS, EXACTLY ONCE. A prior recut that CREATEd an overload instead of
  -- REPLACING the live body would leave the old shape reachable (0054:132-146).
  begin
    perform 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  exception when others then
    raise exception 'F-A2 WINDOW B prestate: clara._enqueue_invoice_facts_core(uuid) does not exist -- apply the F-A1 cutover and the F-A2 openers FIRST' using errcode='CLR10';
  end;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_enqueue_invoice_facts_core';
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B prestate: expected exactly 1 _enqueue_invoice_facts_core body, found % -- an overload this file does not know about would keep the old shape reachable', v_n
      using errcode='CLR10';
  end if;

  -- (0.2) 0098's PERSIST HALF IS LIVE. Read by SIGNATURE, not by migration number: the number
  -- is claimed at merge, the signature is the thing the router's tasks will actually reach.
  begin
    perform 'clara.persist_statement_facts_v2(uuid,jsonb)'::regprocedure;
  exception when others then
    raise exception 'F-A2 WINDOW B prestate: clara.persist_statement_facts_v2(uuid,jsonb) is absent -- the statement persist half (0098_f_a1_statements.sql) is not live, so re-keying the router would mint tasks nothing can settle' using errcode='CLR10';
  end;

  -- (0.3) THE LANE<->ENGINE PREFIX CHECK ALREADY ADMITS an llm-% engine on lane
  -- statement_facts. DISCOVERED BY SHAPE (the 0090 discipline), never by trusting a name: if
  -- 0098 SS2's widening were absent, this file's re-key would mint tasks the CHECK refuses and
  -- every bank-statement filing would raise instead of enqueueing.
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid='clara.document_processing_tasks'::regclass and con.contype='c'
     and pg_get_constraintdef(con.oid) like '%engine_id%'
     and pg_get_constraintdef(con.oid) like '%statement_facts%'
     and pg_get_constraintdef(con.oid) like '%llm-%%';
  if v_n < 1 then
    raise exception 'F-A2 WINDOW B prestate: no lane<->engine CHECK on clara.document_processing_tasks admits an llm-%% engine for lane statement_facts -- 0098 section 2''s widening is not live; the re-key would make every bank-statement enqueue raise' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then
    raise exception 'F-A2 WINDOW B prestate: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10';
  end if;

  -- (0.4) NOT ALREADY APPLIED. Checked BEFORE the sha pin, deliberately: a re-run would fail
  -- the pin too (the body has moved -- by this very file), and "sha mismatch" is the wrong
  -- diagnosis to hand an operator who simply ran the ceremony twice. Both halves are checked,
  -- and separately: a HALF-applied activation must be loud, never a silent re-run.
  if position('stmt-witness-v1' in v_src) <> 0 then
    raise exception 'F-A2 WINDOW B prestate: _enqueue_invoice_facts_core ALREADY carries the statement-witness engine identity -- already applied' using errcode='CLR10';
  end if;
  if position($m$and a.purpose='statement_extraction'$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B prestate: the statement typed-consent lookup no longer reads purpose=statement_extraction -- the consent half looks already applied (or the arm moved); refuse rather than splice a body this file does not recognise' using errcode='CLR10';
  end if;

  -- (0.5) THE BODY IS THE F-A2 OPENERS' PART-1 OUTPUT, PINNED BY PROSRC SHA-256. See the
  -- header's PRESTATE PIN section for why the whole body and not just the anchors, and for
  -- what a mismatch means (the ceremony stops).
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '48f53ee4f202ea3d9f07e8299838ae6d889bc1f4a0b92301dee3583251758246' then
    raise exception 'F-A2 WINDOW B prestate: clara._enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected 48f53ee4f202ea3d9f07e8299838ae6d889bc1f4a0b92301dee3583251758246) -- this is NOT the body the F-A2 openers'' part-1 migration hands off, so the splice anchors below were verified against a body that is not live. Either that migration did not apply first, or this body moved for some other reason. STOP the ceremony; do not re-cut against a wrong premise', v_sha
      using errcode='CLR10';
  end if;

  -- (0.6) THE OPENERS' OWN BEHAVIOURAL MARKER, read out of the live body rather than out of a
  -- migration name. Only opener 2 mints the invoice arm's :v2 engine identity, so its presence
  -- IS the ordering evidence -- and it is checked independently of the sha above so a future
  -- re-pin cannot silently drop the ordering claim with it.
  if position($m$v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B prestate: the invoice-kind arm does not mint the :v2 witness engine identity -- the F-A2 openers'' part-1 migration (the nil-tax arm + engine bump) must apply BEFORE this file' using errcode='CLR10';
  end if;

  -- (0.7) BOTH SPLICE ANCHORS ARE UNIQUE, counted on the DEFINITION (the same text `replace`
  -- will run against), not merely on prosrc. A second occurrence would be spliced too; zero
  -- would splice nothing while this file reported success.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_n := (length(v_def) - length(replace(v_def, $m$    elsif d.document_kind='bank_statement' then$m$, ''))) / length($m$    elsif d.document_kind='bank_statement' then$m$);
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B prestate: the bank_statement classification arm opens % times (expected exactly 1)', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, $m$      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';$m$, ''))) / length($m$      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';$m$);
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B prestate: the statement mint line appears % times (expected exactly 1) -- the live body drifted from the shape this file was authored against', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, $m$            and a.purpose='statement_extraction'$m$, ''))) / length($m$            and a.purpose='statement_extraction'$m$);
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B prestate: the statement typed-consent purpose literal appears % times (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A2 WINDOW B prestate: clean -- _enqueue_invoice_facts_core is the F-A2 openers'' part-1 handoff body (sha %), the persist half (persist_statement_facts_v2) is live, the lane<->engine CHECK already admits llm-%% on statement_facts, neither half of the activation is applied, and both splice anchors are unique', v_sha;
end
$act_pre$;

-- =====================================================================================
-- SS1 -- THE RECUT. ONE body, TWO edits, one replace-and-execute. wb-0020 PINNED -- the
-- restore pair in packages/db/tests/wave-b/wb-0020-legacy.test.mjs is extended in the SAME PR
-- (that file is a test, not schema, so it is edited beside this migration rather than in it).
-- =====================================================================================
set role clara_fn_owner;

do $act_router$
declare v_def text; v_frm1 text; v_to1 text; v_frm2 text; v_to2 text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_def is null then
    raise exception 'F-A2 WINDOW B S1: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10';
  end if;

  -- EDIT 1 -- THE ROUTER RE-KEY. The anchor is the WHOLE arm, opening with the document_kind
  -- test so the literal being moved is provably the bank-statement one.
  v_frm1 := $f1$    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1: the statementFacts_v1 OCR lane. This is the arm that closes the
      -- bank_statement -> skipped_kind dead end 0026:392-410 left behind.
      -- as-built ladder fix 2026-07-31, Codex wave: the stamp names `prebuilt-bankStatement.us`,
      -- which is the model the runtime ACTUALLY invokes. Provenance must name the engine that
      -- received the egress -- a stamp naming a model nobody called is a false receipt, and the
      -- ".us" suffix is the whole model identity here, not a regional decoration.
      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm1, ''))) / length(v_frm1);
  if v_cnt <> 1 then
    raise exception 'F-A2 WINDOW B S1: the bank_statement classification arm appears % times (expected exactly 1) -- the live body drifted from the shape this file was authored against', v_cnt
      using errcode='CLR10';
  end if;
  v_to1 := $t1$    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1 closed the bank_statement -> skipped_kind dead end 0026:392-410 left
      -- behind, on the vendor OCR read. F-A2 WINDOW B (the ACTIVATION, design SS3.7) re-aims
      -- it at the WITNESS PAIR: the same lane, a different engine identity.
      -- THE LANE DOES NOT MOVE, and that is 0098's own LANE DECISION (0098:120-138), not an
      -- omission: _invoice_fact_state keys the witness regime on lane llm_witness, so a
      -- statement pair there would be resolved as an INVOICE corroboration, and the invoice
      -- witness workflow claims that lane BY LANE ALONE and would read a statement with
      -- invoice prompts. Staying on statement_facts also keeps this task inside the
      -- enqueue-time page-budget reservation set (0098:114-118).
      -- v_engine MUST string-equal STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId in the
      -- statementFacts.v2 services module: the workflow compares the task's stamp against its
      -- own snapshot BEFORE any egress and WAITS on a mismatch rather than sending bytes under
      -- a receipt naming a model it did not call (0098:154-159), so a drifted literal STALLS
      -- the lane instead of mis-stamping it. Battery cell f-a2.activation-engine-literal reads
      -- both sides independently and asserts equality.
      v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';$t1$;
  v_def := replace(v_def, v_frm1, v_to1);

  -- EDIT 2 -- THE CONSENT RE-KEY. The anchor closes with this arm's OWN consent_inactive
  -- verdict, which is what distinguishes it from the llm_witness branch's byte-identical twin
  -- (that one ends in witness_consent_inactive and is not touched here).
  v_frm2 := $f2$      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='statement_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm2, ''))) / length(v_frm2);
  if v_cnt <> 1 then
    raise exception 'F-A2 WINDOW B S1: the statement typed-consent lookup appears % times (expected exactly 1) -- the live body drifted from the shape this file was authored against', v_cnt
      using errcode='CLR10';
  end if;
  v_to2 := $t2$      v_stmt_client:=v_stmt_clients[1];
      -- F-A2 WINDOW B (the ACTIVATION): the statement lane's typed consent is now keyed on the
      -- purpose the witness pair actually egresses under, not on the retiring vendor-OCR one.
      -- NO NEW CONSENT SURFACE IS NEEDED: the activation relation is keyed on
      -- (firm_id, client_id, purpose) ALONE -- no lane, no document_kind, no engine column
      -- (0038:5981-5987) -- so the activations already on file for the invoice witness pair
      -- answer this lookup unchanged. THIS ARM'S OWN REFUSAL VOCABULARY IS UNCHANGED
      -- (statement_multi_client / consent_inactive, 0098:161-165) and so is its
      -- document.statement_facts_failed emit; only the purpose literal moves. The retiring
      -- purpose STAYS REGISTERED in the purpose CHECKs -- historical authorization rows
      -- reference it and drops are BY NAME (the 0038:5462 contract).
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;$t2$;
  v_def := replace(v_def, v_frm2, v_to2);

  execute v_def;
end
$act_router$;

reset role;

do $act_post$
declare v_src text; v_n int; v_sha text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;

  -- ---- EDIT 1's own evidence: the new literal in, the old literal OUT. -------------------
  if position($m$v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the bank_statement arm does not mint statement_facts with the witness engine literal' using errcode='CLR10';
  end if;
  if position('azure-di:prebuilt-bankStatement.us:2024-11-30' in v_src) <> 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the OLD Azure statement engine literal is still present -- the splice did not remove it' using errcode='CLR10';
  end if;
  -- THE LANE DID NOT MOVE. Asserted as its own fact, because "only the engine changed" is the
  -- claim on which the whole regime separation (0098's LANE DECISION) rests.
  if position($m$elsif d.document_kind='bank_statement' then$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the bank_statement classification arm was lost' using errcode='CLR10';
  end if;
  -- POSITIONAL, not a window guess: the witness mint line must sit BETWEEN the bank_statement
  -- test that opens the arm and the `-- (adjudication #11)` comment that opens the very next
  -- (skipped_kind) arm. That brackets it INSIDE the classification arm rather than merely
  -- somewhere in the body -- the property "the lane did not move" actually depends on.
  if position($m$v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';$m$ in v_src)
       <= position($m$elsif d.document_kind='bank_statement' then$m$ in v_src)
     or position($m$v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';$m$ in v_src)
       >= position('-- (adjudication #11)' in v_src) then
    raise exception 'F-A2 WINDOW B S1 postcheck: the witness mint line is not bracketed inside the bank_statement classification arm' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $m$v_lane:='statement_facts';$m$, ''))) / length($m$v_lane:='statement_facts';$m$);
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B S1 postcheck: lane statement_facts is assigned % times (expected exactly 1) -- the lane must stay exactly where 0098''s LANE DECISION put it', v_n using errcode='CLR10';
  end if;

  -- ---- EDIT 2's own evidence: the purpose moved, the vocabulary did not. -----------------
  if position($m$and a.purpose='statement_extraction'$m$ in v_src) <> 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: a typed-consent lookup still reads purpose=statement_extraction -- the re-key did not land' using errcode='CLR10';
  end if;
  -- EXACTLY TWO witness_extraction lookups: this arm's (re-keyed) and the llm_witness branch's
  -- (untouched). A third would mean the splice hit something it was not aimed at.
  v_n := (length(v_src) - length(replace(v_src, $m$            and a.purpose='witness_extraction'$m$, ''))) / length($m$            and a.purpose='witness_extraction'$m$);
  if v_n <> 2 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the witness_extraction activation lookup appears % times (expected exactly 2 -- the re-keyed statement arm and the untouched llm_witness arm)', v_n
      using errcode='CLR10';
  end if;
  -- THE REFUSAL CODES ARE THIS ARM'S OWN AND ARE UNCHANGED (0098:161-165). Counted, not
  -- glanced at: exactly TWO consent_inactive assignments survive (the zero-filings arm and the
  -- lookup arm), and each is checked by a block that DISTINGUISHES it from the llm_witness
  -- branch's byte-identical twin -- the twins differ only in the code they assign.
  v_n := (length(v_src) - length(replace(v_src, $m$v_gate:='consent_inactive';$m$, ''))) / length($m$v_gate:='consent_inactive';$m$);
  if v_n <> 2 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the statement arm assigns consent_inactive % times (expected exactly 2 -- the zero-filings arm and the lookup arm)', v_n using errcode='CLR10';
  end if;
  if position($m$    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='consent_inactive';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the statement arm''s zero-filings consent_inactive verdict was lost' using errcode='CLR10';
  end if;
  if position($m$            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the re-keyed statement lookup does not settle on this arm''s OWN consent_inactive verdict' using errcode='CLR10';
  end if;
  if position($m$v_gate:='statement_multi_client';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the statement arm''s statement_multi_client verdict was lost' using errcode='CLR10';
  end if;
  if position($m$perform clara._append_event(d.firm_id,'document.statement_facts_failed',$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the statement arm''s document.statement_facts_failed emit was lost' using errcode='CLR10';
  end if;
  -- The llm_witness branch is a DIFFERENT arm and must be byte-untouched, codes included.
  if position($m$elsif v_lane='llm_witness' then$m$ in v_src) = 0
     or position($m$v_gate:='witness_multi_client';$m$ in v_src) = 0
     or position($m$v_gate:='witness_consent_inactive';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the llm_witness typed-consent branch or one of its refusal codes was lost' using errcode='CLR10';
  end if;

  -- ---- EVERY ARM THIS FILE DOES NOT NAME, re-asserted rather than trusted. ---------------
  if position($m$v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the invoice-kind arm''s :v2 witness engine literal moved -- the F-A2 openers'' output must survive verbatim' using errcode='CLR10';
  end if;
  if position($m$d.document_kind in ('invoice','credit_note','debit_note','receipt')$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the invoice-kind condition set moved' using errcode='CLR10';
  end if;
  if position($m$v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the csv/ofx statement_parse arm moved -- it must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$v_lane:='classify'; v_engine:='clara-classify-llm:v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the classify arm moved' using errcode='CLR10';
  end if;
  if position($m$v_lane:='local_facts'; v_engine:='clara-myinvois:v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the xml/local_facts arm moved' using errcode='CLR10';
  end if;
  -- The skipped_kind receipt still stamps the retiring Azure INVOICE constant. Asserted so the
  -- "the Azure statement literal is gone" check above is proven narrow: this file removed the
  -- bank-statement literal, not every azure-di string in the body.
  if position($m$'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the skipped_kind receipt''s engine constant moved -- this file must touch only the bank_statement arm''s literal' using errcode='CLR10';
  end if;
  if position($m$when v_lane='llm_witness'
                       then 'llm_text_facts'$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the already_completed map no longer resolves llm_witness -> llm_text_facts' using errcode='CLR10';
  end if;
  if position($m$v_engine_kind := case when v_lane in ('statement_facts','statement_parse')$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the already_completed map''s statement arm moved -- both statement lanes must still settle a statement_facts extraction' using errcode='CLR10';
  end if;
  if position($m$if v_task is null and v_lane='llm_witness' then$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the M-4 EITHER-REGIME short-circuit was lost' using errcode='CLR10';
  end if;
  -- The page budget: statement_facts must STILL reserve (0098's "NO LAPSE HERE"), and
  -- llm_witness must still not join the list (meter-never-cap, D6).
  if position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the page-budget reserving lane list moved -- statement_facts must keep its reservation (0098:114-118)' using errcode='CLR10';
  end if;
  if position('llm_witness' in
      substring(v_src from position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src) for 200)) <> 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: llm_witness leaked into the page-budget reserving list -- meter-never-cap (D6) violated' using errcode='CLR10';
  end if;
  if position($m$if v_lane in ('statement_facts','statement_parse') then$m$ in v_src) = 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: the statement-lane consent-gate branch condition moved' using errcode='CLR10';
  end if;

  -- ---- Posture: ACL, definer, search_path, ownership. Re-measured, never assumed. --------
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure and a.grantee<>'clara_fn_owner'::regrole;
  if v_n <> 0 then
    raise exception 'F-A2 WINDOW B S1 postcheck: _enqueue_invoice_facts_core gained a grant to a role other than clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A2 WINDOW B S1 postcheck: _enqueue_invoice_facts_core is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_enqueue_invoice_facts_core';
  if v_n <> 1 then
    raise exception 'F-A2 WINDOW B S1 postcheck: _enqueue_invoice_facts_core resolves to % bodies -- the recut created an overload instead of replacing', v_n using errcode='CLR10';
  end if;

  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  raise notice 'F-A2 WINDOW B S1: clara._enqueue_invoice_facts_core recut -- the bank_statement arm now mints lane statement_facts (UNMOVED) with engine llm-openai:gpt-5.6-terra:stmt-witness-v1, and the statement typed-consent lookup is keyed on witness_extraction (2 such lookups now live: this arm and the untouched llm_witness one). This arm''s refusal vocabulary (statement_multi_client / consent_inactive) and its document.statement_facts_failed emit are verified unmoved; the invoice arm''s :v2 literal, the csv/ofx, classify and xml arms, the skipped_kind receipt''s own azure-di constant, the already_completed map + EITHER-REGIME fallback, the llm_witness consent branch and the page-budget reserving list are all verified byte-unmoved; ACL/definer/ownership unmoved. This body''s prosrc sha256 is now %', v_sha;
end
$act_post$;

-- =====================================================================================
-- TAIL CENSUS -- the evidence a reviewer reads.
-- =====================================================================================
do $act_tail$
declare v_src text; v_n int; v_queued int; v_azure int; v_uncovered int; r record;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if position('llm-openai:gpt-5.6-terra:stmt-witness-v1' in v_src) = 0
     or position('azure-di:prebuilt-bankStatement.us:2024-11-30' in v_src) <> 0 then
    raise exception 'F-A2 WINDOW B tail: the router re-key is not live' using errcode='CLR10';
  end if;

  -- THE PERSIST HALF IS REACHABLE AND STILL GRANTED. The re-key only decides which engine
  -- STAMPS the task; the settle path is 0098's and must still be callable by the runtime.
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.persist_statement_facts_v2(uuid,jsonb)'::regprocedure
        and a.grantee='clara_runtime'::regrole and a.privilege_type='EXECUTE') then
    raise exception 'F-A2 WINDOW B tail: persist_statement_facts_v2 is not EXECUTE-granted to clara_runtime -- the re-keyed lane would mint tasks the runtime cannot settle' using errcode='CLR10';
  end if;

  -- THE PRE-WINDOW BACKLOG, COUNTED rather than assumed (activation spec SS3 / SS9 item 2).
  -- These are the tasks that will meet the repointed image still stamped with the retiring
  -- Azure identity; the workflow's pre-egress provenance guard WAITS on them rather than
  -- egressing under a false receipt, and those waits occupy the shared ocr concurrency window.
  -- Reported, never acted on: a bounded wait is a delayed statement, never a wrong one.
  select count(*)::int into v_queued from clara.document_processing_tasks
   where lane='statement_facts' and status='queued';
  select count(*)::int into v_azure from clara.document_processing_tasks
   where lane='statement_facts' and status='queued' and engine_id like 'azure-%';

  -- THE COVERAGE READ, AND WHY IT IS A SET DIFFERENCE RATHER THAN A COUNT.
  -- The question this apply must answer is not "does ANYONE hold witness_extraction" -- a
  -- global count says YES the moment one client does, and stays silent about every OTHER
  -- client who holds a live statement_extraction activation and NO witness one. Those are
  -- exactly the clients this re-key takes BOTH statement lanes away from: after the flip
  -- their enqueues settle terminal `consent_inactive`. A read that cannot say NO has a
  -- meaningless YES, so the coverage question is asked PER CLIENT and answered by the rows
  -- it returns: the uncovered set is `live statement_extraction` MINUS `live
  -- witness_extraction`, and complete coverage is ZERO ROWS.
  -- NOT A HARD FAILURE, deliberately: this is a DATA state, not a schema state. The ceremony
  -- adjudicates it (grant+activate the witness purpose for the named clients, or accept that
  -- their statement lanes pause) -- this file's job is to make it impossible to miss.
  v_uncovered := 0;
  for r in
    select a.firm_id, a.client_id
      from clara.client_egress_purpose_activations a
      join clara.client_egress_purpose_consents c
        on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
       and c.purpose=a.purpose
     where a.purpose='statement_extraction'
       and a.deactivated_at is null and c.revoked_at is null
       and not exists (
         select 1 from clara.client_egress_purpose_activations w
           join clara.client_egress_purpose_consents wc
             on wc.id=w.consent_id and wc.firm_id=w.firm_id and wc.client_id=w.client_id
            and wc.purpose=w.purpose
          where w.firm_id=a.firm_id and w.client_id=a.client_id
            and w.purpose='witness_extraction'
            and w.deactivated_at is null and wc.revoked_at is null)
     order by a.firm_id, a.client_id
  loop
    v_uncovered := v_uncovered + 1;
    raise notice 'F-A2 WINDOW B COVERAGE GAP: firm % client % holds a LIVE statement_extraction activation and NO live witness_extraction one -- after this re-key BOTH statement lanes (statement_facts pdf/image AND statement_parse csv/ofx) refuse consent_inactive for this client until witness_extraction is granted AND activated for them. Ceremony must adjudicate before the window closes.',
      r.firm_id, r.client_id;
  end loop;

  select count(*)::int into v_n from clara.client_egress_purpose_activations a
   where a.purpose='witness_extraction' and a.deactivated_at is null;

  if v_uncovered > 0 then
    raise notice 'F-A2 WINDOW B tail: ** COVERAGE INCOMPLETE ** -- % client(s) named above hold a live statement_extraction activation with NO live witness_extraction one and LOSE BOTH statement lanes at this flip. This apply does NOT fail on it (a data state the ceremony adjudicates, not a schema state), but it must be resolved or accepted DELIBERATELY before the window closes.',
      v_uncovered;
  else
    raise notice 'F-A2 WINDOW B tail: coverage COMPLETE -- the per-client set difference (live statement_extraction MINUS live witness_extraction) returned ZERO rows, so no client loses a statement lane at this flip. This is a read that can say NO: it names every uncovered client individually and is silent only when there is genuinely nothing to name.';
  end if;

  raise notice 'F-A2 WINDOW B tail: OK -- the bank_statement arm mints the witness engine identity on the UNMOVED statement_facts lane and its typed-consent lookup reads witness_extraction; the persist half (persist_statement_facts_v2) is live and still EXECUTE-granted to clara_runtime. QUEUED statement_facts backlog at apply: % task(s), of which % still carry an azure-%% stamp -- those WAIT at the repointed image''s pre-egress provenance guard rather than egressing, sharing the ocr concurrency window until they clear (registered cost, not a correctness hazard). Consent COVERAGE: % client(s) uncovered (per-client set difference; zero = complete), against % live (never-deactivated) witness_extraction activation row(s) on file -- no new consent surface was created by this file. The engine literal''s runtime twin cannot be read from SQL: battery cell f-a2.activation-engine-literal reads both sides independently. No table in workflow/graphile_worker/spike touched. CEREMONY: the runtime machine stays STOPPED across BOTH this apply AND the registry-repoint deploy that follows -- a witness-stamped task claimed by the OLD image has no DB-side guard.',
    v_queued, v_azure, v_uncovered, v_n;
end
$act_tail$;
