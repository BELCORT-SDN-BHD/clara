-- UNNUMBERED_f_a1_writer_rotation.sql -- Wave-F Track A, F-A1, WRITER-PARITY FIX for
-- clara.persist_witness_facts (PR-1's writer, migration 0095). Number claimed at MERGE time
-- (standing law); THIS FILE MUST APPLY BEFORE UNNUMBERED_f_a1_cutover.sql (both files'
-- headers cross-reference this ordering) -- the cutover is what makes the witness lane the
-- ONLY invoice-shaped re-extraction settlement path, and this fix closes a real
-- accounting-correctness hole in that path before the cutover makes it reachable by anything
-- other than PR-1's own inert/synthetic battery.
--
-- THE FINDING (discovered live, on this build's own rig, while validating the PR-3 cutover;
-- escalated to the orchestrator; RULED in-charter for this PR). A SIDE-EFFECT CENSUS,
-- comparing clara.persist_invoice_facts' live body (0026:662-977, its 0026 lane-widen recut --
-- N-9, cross-model review: 0009 created the function, but 0026_lane_widen.sql is the
-- migration that most recently CREATE OR REPLACEd it, so 0026 is the correct citation for
-- every live-body line number in this header -- the settlement writer
-- every legacy extraction has gone through since Slice 6) against clara.persist_witness_facts'
-- (0095), everything that runs AFTER the extraction/region rows are committed and BEFORE the
-- receipt returns:
--
--   1. `_settle_processing_call` (invoice_facts lane only) -- ABSENT in persist_witness_facts,
--      and CORRECTLY so: llm_witness never reserves a page budget in the first place
--      (meter-never-cap, design D6/SS3.6) -- there is nothing to settle. Named, not fixed.
--   2. `document_processing_tasks.status='done'` -- PRESENT in both (0095 SS12), though not
--      byte-identical: the legacy statement (0026:906-907) also stamps
--      `vendor_op_ref=p_raw_sha256`, the Azure-lane raw-bytes-hash receipt (N-11, cross-model
--      review). Correctly ABSENT from persist_witness_facts: the witness call carries no
--      `p_raw_sha256` input at all (its signature is `p_task,p_text,p_vision,p_pages_used`),
--      so there is no value to stamp there -- a justified absence, not a dropped field.
--   3. `documents.document_kind=coalesce(document_kind,...)` -- ABSENT in persist_witness_facts.
--      Provably a NO-OP for the witness path: the router (_enqueue_invoice_facts_core) requires
--      document_kind to already be non-null before it ever mints an llm_witness task at all (a
--      null-kind pdf routes to 'classify' first) -- so by the time this writer runs, the
--      coalesce would always resolve to the existing value. Named, not fixed.
--   4. `documents.financial_date=coalesce(v_date,financial_date)` (parsed from a stated
--      invoice_date; 0026:778-780 parses v_date inline in the field loop, 0026:915 applies it)
--      -- ABSENT in persist_witness_facts. RULED MUST-FIX (orchestrator, on review of this
--      census): the VACUOUS-GREEN-GATE class -- PROGRESS' own record of the uncoded-close
--      gate's BETWEEN test names a NULL financial_date as never satisfied, and 0056:1397's own
--      comment states the miss is PERMANENT, not merely late. A witness-settled invoice with
--      no financial_date is invisible to the close gates forever, not just incomplete today.
--      FIXED here (section 1 below), same coalesce/new-wins discipline as the legacy arm --
--      HARDENED further by M-5 (cross-model review): sourced from the cross-channel-agreed
--      _invoice_fact_state read first, falling back to the raw text answer only when that
--      state carries none (see section 1's own comment for the full reasoning).
--   5. THE FACTS_ROTATED BLOCK (0026:918-969) -- rotates the revision_token of every OPEN
--      draft entry bound to this document's live filings, stamps a supplier_bill
--      amount_exception when the machine total disagrees with the drafted lines, and writes a
--      named `journal_entry_revisions` row (reason='facts_rotated') so a reviewer can see WHY
--      their token went stale. ABSENT in persist_witness_facts -- a REAL, LIVE
--      accounting-correctness hazard, verified empirically on this build's own rig: seeded a
--      document, drafted an entry against it (token X), re-extracted it (now the ONLY invoice
--      re-extraction path once the cutover lands) and settled a CHANGED total through
--      persist_witness_facts -- the draft's revision_token never moved, and approve_entry
--      called with the STALE token X succeeded outright, posting the entry with no refusal and
--      no visible signal that the figures underneath the approver had changed. This is THIS
--      FILE's fix (section 1 below) -- B1 (cross-model review): the port was INCOMPLETE
--      without the SERIALIZATION CONTRACT the legacy body carries alongside it (0026:690-696):
--      filings locked, then entries, then the task itself, BEFORE this block ever reads or
--      writes them. Without that lock order here too, this call risks a genuine deadlock
--      against persist_invoice_facts / _approve_entry_core, which already lock the same rows
--      in that order. Also fixed in section 1 below.
--   6. `_audit('persist_invoice_facts'|'persist_witness_facts', ...)` -- PRESENT in both (0095
--      SS12), under the writer's own name.
--   7. `_append_event('document.invoice_facts_completed', ...)` -- ABSENT in
--      persist_witness_facts. `packages/runtime/lib/autodraft.mjs`'s AUTODRAFT_EVENT_TYPES
--      subscribes DIRECTLY to this event name to admit sweep tasks and wake the autoDraft
--      workflow -- so a witness settle today wakes NOTHING downstream. RULED MUST-FIX
--      (orchestrator): reuse the LEGACY event name deliberately -- invoice facts genuinely
--      ARE completed, the regime is an implementation detail, and the name is what the ONE
--      live subscriber already listens for. FIXED here (section 1 below), payload mirroring
--      persist_invoice_facts' ID-only shape exactly. N-12 (cross-model review, re-verified
--      against the ACTUAL merged bytes -- PR-3a is ALREADY LIVE on this branch, not still
--      pending): the consumer-side widening this emit needs is already in place --
--      packages/runtime/workflows/autoDraft.v8.tools.ts's `readInvoiceFactState` filters to
--      BOTH regimes' kinds (`invoice_facts` AND `llm_text_facts`) and its cross-regime winner
--      picks by `extracted_at` alone, witness winning ties (§3.3) -- so this emit does not
--      merely avoid a crash on a witness document's wake, it drives a REAL draft off the
--      witness pair, exactly as it always has for a legacy invoice_facts completion.
--
-- WHY THIS IS SAFE TO PORT VERBATIM: the rotation block reads clara._invoice_fact_state(),
-- the CROSS-REGIME DISPATCHER PR-1 already shipped (0092/0093) -- by the time this block runs
-- (after the task row reads 'done'), that dispatcher resolves THIS witness pair via its
-- extracted_at precedence (design SS3.3), exactly as it already does for every cell in
-- f-a1-dispatch.test.mjs. No new read surface, no new predicate -- only the WRITE side (the
-- rotation) was missing.
--
-- SPLICE DISCIPLINE (0040 S4.11a / 0090 S10's, verbatim in shape): read the LIVE body via
-- pg_get_functiondef, assert each target substring occurs EXACTLY ONCE, replace() only there,
-- execute the result. Four edits: (0) the B1 serialization contract (cross-model review) --
-- filings/entries locked, in that order, immediately before step 7's task re-lock, matching
-- persist_invoice_facts' own lock order exactly; (1) eight new local variables join the
-- declare block (v_entry/v_ekind/v_eflags/v_p_payable/v_p_expense/v_token/v_newstate/v_date --
-- persist_invoice_facts' own names, verbatim); (2) the rotation block itself, inserted between
-- the task-status update and the audit call -- AFTER both idempotent-replay early-returns
-- (steps 2 and 7 of the live body), so a replay never re-rotates -- with v_newstate now
-- computed FIRST (M-5, cross-model review) so financial_date sources the SAME
-- cross-channel-agreed state the rotation loop acts on; (3) the completion event, inserted
-- between the audit call and the return.
--
-- NO D1 WRITE-QUIESCE: persist_witness_facts is reached only through claim_document_processing_task
-- (itself reached only by a queued llm_witness task), and no llm_witness task can exist before
-- this frontier -- the router that mints one ships in UNNUMBERED_f_a1_cutover.sql, AFTER this
-- file. This body is therefore live-inert exactly as 0090's own inert branches were: correct by
-- construction, unreachable until the file that makes it reachable applies.
set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
do $pre$
declare v_src text; v_sha text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0095_f_a1_writer') then
    raise exception 'f_a1_writer_rotation prestate: 0095_f_a1_writer is not applied -- frontier mismatch' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure;
  if v_src is null then raise exception 'f_a1_writer_rotation prestate: clara.persist_witness_facts is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e21a4faac327be5eed9971e8d3809e0cc47c9cf9d066192e62bb92f587027487' then
    raise exception 'f_a1_writer_rotation prestate: clara.persist_witness_facts prosrc sha256 mismatch (got %, expected e21a4faac327be5eed9971e8d3809e0cc47c9cf9d066192e62bb92f587027487) -- this is not the 0095 body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('facts_rotated' in v_src) <> 0 then
    raise exception 'f_a1_writer_rotation prestate: persist_witness_facts ALREADY carries facts_rotated -- already applied' using errcode='CLR10';
  end if;
  -- This file must NOT be applied after the cutover already minted live witness work -- if a
  -- queued/running/done llm_witness task already exists, the router in
  -- UNNUMBERED_f_a1_cutover.sql landed first, which is the wrong order (this file's own header).
  if exists (select 1 from clara.document_processing_tasks where lane='llm_witness') then
    raise exception 'f_a1_writer_rotation prestate: an llm_witness task ALREADY exists -- this file must apply BEFORE UNNUMBERED_f_a1_cutover.sql, not after' using errcode='CLR10';
  end if;
  raise notice 'f_a1_writer_rotation prestate: clean -- persist_witness_facts is the exact 0095 body, facts_rotated absent, no llm_witness task exists yet (correct pre-cutover ordering)';
end
$pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- clara.persist_witness_facts gains the facts_rotated side effect.
-- =====================================================================================
do $writer$
declare
  v_sig text := 'clara.persist_witness_facts(uuid,jsonb,jsonb,int)';
  v_def text; v_frm0 text; v_to0 text; v_frm1 text; v_to1 text; v_frm2 text; v_to2 text; v_frm3 text; v_to3 text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'f_a1_writer_rotation S1 prestate: clara.persist_witness_facts is GONE' using errcode='CLR10';
  end if;

  -- Edit 0 (B1, cross-model review): the SERIALIZATION CONTRACT the facts_rotated block below
  -- depends on. The rotation loop reads and updates clara.journal_entries (joined through
  -- clara.document_filings) for this document; without locking those rows FIRST, in the SAME
  -- order persist_invoice_facts already locks them (0026:690-696: filings, then entries, then
  -- the task itself), a concurrent approve_entry-style caller that locks the identical rows in
  -- that order could deadlock against this call -- a lock-order inversion, not merely a race.
  -- Spliced immediately before step 7's task re-lock (the "LOCK + RE-CHECK" double-checked-
  -- locking line already live in 0095), so the filings/entries locks land BEFORE it, exactly
  -- as they do in persist_invoice_facts.
  v_frm0 := $f0$  select * into t from clara.document_processing_tasks where id = p_task for update;$f0$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm0, ''))) / length(v_frm0);
  if v_cnt <> 1 then
    raise exception 'f_a1_writer_rotation S1 prestate: the task re-lock line appears % times (expected exactly 1) -- the live body drifted from the 0095 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to0 := $t0$  -- F-A1 PR-3 WRITER-PARITY FIX (B1, cross-model review): filings -> entries ->
  -- task, the EXACT lock order persist_invoice_facts already uses (0026:690-696) -- any other
  -- order risks deadlock against persist_invoice_facts / _approve_entry_core. Locked here,
  -- ahead of the task lock below, because the facts_rotated block further down reads and
  -- updates these SAME rows and must never be the caller that inverts the global order.
  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null
    order by f.id for update;
  perform 1 from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id for update of e;
  select * into t from clara.document_processing_tasks where id = p_task for update;$t0$;
  v_def := replace(v_def, v_frm0, v_to0);

  -- Edit 1: eight new local variables (persist_invoice_facts' own names, verbatim).
  v_frm1 := $f1$  v_verified boolean; v_cents bigint; v_locator2 jsonb; v_readable boolean;
begin$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm1, ''))) / length(v_frm1);
  if v_cnt <> 1 then
    raise exception 'f_a1_writer_rotation S1 prestate: the declare-block tail appears % times (expected exactly 1) -- the live body drifted from the 0095 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to1 := $t1$  v_verified boolean; v_cents bigint; v_locator2 jsonb; v_readable boolean;
  -- F-A1 PR-3 WRITER-PARITY FIX: the facts_rotated side effect persist_invoice_facts owns
  -- (0026:918-969), ported verbatim -- see this migration's own header for the full
  -- side-effect census. Same variable names persist_invoice_facts itself uses.
  v_entry uuid; v_ekind text; v_eflags jsonb; v_p_payable bigint; v_p_expense bigint;
  v_token uuid; v_newstate jsonb; v_date date;
begin$t1$;
  v_def := replace(v_def, v_frm1, v_to1);

  -- Edit 2: the rotation block, inserted AFTER the task-status update (so the fresh
  -- _invoice_fact_state read reflects the now-'done' task, exactly as persist_invoice_facts'
  -- own ordering does) and BEFORE the audit call -- and therefore after BOTH idempotent-replay
  -- early-returns (steps 2 and 7 of the live body), so a replay never re-rotates.
  v_frm2 := $f2$  update clara.document_processing_tasks set status='done', finished_at=now() where id=p_task;

  perform clara._audit(t.firm_id,null,null,null,'persist_witness_facts',null,$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm2, ''))) / length(v_frm2);
  if v_cnt <> 1 then
    raise exception 'f_a1_writer_rotation S1 prestate: the task-status-update/audit-call boundary appears % times (expected exactly 1) -- the live body drifted from the 0095 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to2 := $t2$  update clara.document_processing_tasks set status='done', finished_at=now() where id=p_task;

  -- F-A1 PR-3 WRITER-PARITY FIX (this migration's header carries the full census). Ported
  -- verbatim in shape from persist_invoice_facts (0026:918-969): every OPEN draft bound to
  -- this document's live filings gets its revision_token rotated, a supplier_bill
  -- amount_exception stamped when the machine total disagrees with the drafted lines, and a
  -- named journal_entry_revisions row (reason='facts_rotated') so a reviewer can see WHY. Reads
  -- clara._invoice_fact_state -- the CROSS-REGIME dispatcher PR-1 already shipped -- which
  -- resolves THIS witness pair via extracted_at precedence (design SS3.3) the instant the task
  -- row above reads 'done'. M-5 (cross-model review): computed ONCE here, BEFORE
  -- financial_date, so the backfill below reads the SAME cross-channel-agreed state the
  -- rotation loop acts on rather than a second, independent read. Runs ONCE per real settle;
  -- both replay branches above have already returned by this point, so a replay never
  -- re-computes or re-rotates.
  v_newstate:=clara._invoice_fact_state(t.document_id);

  -- F-A1 PR-3 WRITER-PARITY FIX #2: the financial_date backfill persist_invoice_facts owns
  -- (0026:778-780 parses v_date, 0026:915 applies it) -- the registered VACUOUS-GREEN-GATE
  -- class: the uncoded-close gate's
  -- BETWEEN is never satisfied by a NULL financial_date, and that miss is PERMANENT, not
  -- merely late. Same coalesce/new-wins discipline, verbatim: a stated, ISO-parseable
  -- invoice_date OVERWRITES; anything else (not_printed, unparseable, or this settle simply
  -- not answering it) leaves the column exactly as it was. M-5 (cross-model review): sourced
  -- from v_newstate's OWN invoice_date FIRST -- the cite-and-verify region
  -- _invoice_fact_state_at actually persisted (geometry-backed, cross-channel-agreed, SS3.3)
  -- -- falling back to the raw text envelope answer only when the state carries NONE (an
  -- uncited date the witness still stated). `value` preferred over `raw` on the fallback per
  -- M3's reference-value contract, since a normalized value IS the answer when present.
  v_raw := nullif(btrim(v_newstate->>'invoice_date'),'');
  if v_raw is null then
    v_ans := v_text_env->'witness'->'answers'->'invoice.invoice_date';
    if v_ans->>'state' = 'value' then
      v_raw := coalesce(v_ans->>'value', v_ans->>'raw');
    end if;
  end if;
  if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
    begin v_date := v_raw::date; exception when others then v_date := null; end;
  end if;
  update clara.documents set financial_date = coalesce(v_date, financial_date) where id = t.document_id;

  for v_entry in
    select e.id from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id
  loop
    select coding_kind,coalesce(flags,'{}'::jsonb) into v_ekind,v_eflags
      from clara.journal_entries where id=v_entry;
    v_eflags:=v_eflags - 'amount_exception' - 'amount_override';
    if v_ekind='supplier_bill'
       and coalesce((v_newstate->>'corroborated')::boolean,false) then
      select coalesce(sum(l.credit_cents),0) into v_p_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_p_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_p_payable<>(v_newstate->>'total_cents')::bigint
         or v_p_expense<>(v_newstate->>'total_cents')::bigint then
        v_eflags:=v_eflags||jsonb_build_object('amount_exception',jsonb_build_object(
          'machine_total_cents',(v_newstate->>'total_cents')::bigint,
          'proposed_cents',v_p_payable,
          'fact_hash',v_newstate->>'total_fact_hash','at',now()));
      end if;
    end if;
    update clara.journal_entries set revision_token=gen_random_uuid(),
      flags=v_eflags,updated_at=now()
      where id=v_entry and status='draft' returning revision_token into v_token;

    insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
        revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
      select j.firm_id,j.client_id,j.id,
        coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
          where r.entry_id=j.id),0),v_token,'facts',null,'facts_rotated',
        to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
        coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
          'account_code',l.account_code,'debit_cents',l.debit_cents,
          'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
            else 'credit' end,'counterparty_id',l.counterparty_id,
          'description',l.description) order by l.line_no)
          from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
        (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
          order by rd.created_at desc,rd.id desc limit 1),
        coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
          'region_id',ev.region_id,'fact_hash',ev.fact_hash,
          'provenance_tier',ev.provenance_tier) order by ev.id)
          from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
      from clara.journal_entries j where j.id=v_entry;
  end loop;

  perform clara._audit(t.firm_id,null,null,null,'persist_witness_facts',null,$t2$;
  v_def := replace(v_def, v_frm2, v_to2);

  -- Edit 3: the completion event, inserted AFTER the audit call and BEFORE the return.
  v_frm3 := $f3$    jsonb_build_object('task',p_task,'document',t.document_id,
      'text_extraction',v_text_id,'vision_extraction',v_vision_id,'version',t.version_n));

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,$f3$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm3, ''))) / length(v_frm3);
  if v_cnt <> 1 then
    raise exception 'f_a1_writer_rotation S1 prestate: the audit-call-tail/return boundary appears % times (expected exactly 1) -- the live body drifted from the 0095 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to3 := $t3$    jsonb_build_object('task',p_task,'document',t.document_id,
      'text_extraction',v_text_id,'vision_extraction',v_vision_id,'version',t.version_n));

  -- F-A1 PR-3 WRITER-PARITY FIX #3 (RULED): emits document.invoice_facts_completed -- THE
  -- LEGACY NAME, reused deliberately. packages/runtime/lib/autodraft.mjs's
  -- AUTODRAFT_EVENT_TYPES subscribes to it directly as the drafting pipeline's wake signal;
  -- without this emit no witness-completed document ever wakes autoDraft, and drafting dies
  -- silently for every document the cutover now routes here. The regime is an implementation
  -- detail -- invoice facts genuinely ARE completed, so the name stays truthful; PR-3a widens
  -- the CONSUMER side (autoDraft_v8's engine_kind read), not this emit. Payload mirrors
  -- persist_invoice_facts' ID-only shape exactly (0026:973-975), with extraction_id naming
  -- the CANONICAL text row (design SS3.1/SS3.3), never the vision row. Placed after the audit
  -- call and before both idempotent-replay early-returns have long since exited, so a replay
  -- appends no event, exactly as it triggers no second audit row.
  --
  -- N-12 (cross-model review): PR-3a (autoDraft_v8 / chatTurn_v12) is ALREADY LIVE on this
  -- branch (main carries it), so the consumer-side evidence is no longer "safe to ship ahead
  -- of" a still-pending PR -- re-verified against the ACTUAL merged bytes:
  -- packages/runtime/workflows/autoDraft.v8.tools.ts's `readInvoiceFactState` filters to BOTH
  -- regimes' kinds (`invoice_facts` AND `llm_text_facts`, its own header's item 2) and its
  -- cross-regime winner picks by `extracted_at` alone, witness winning ties (§3.3) -- so this
  -- emit does not merely avoid a crash on a witness document's wake, it drives a REAL draft
  -- off the witness pair, exactly as it always has for a legacy invoice_facts completion.
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_text_id,'version_n',t.version_n));

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,$t3$;
  v_def := replace(v_def, v_frm3, v_to3);

  execute v_def;
end
$writer$;

reset role;

do $writer_post$
declare v_src text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure;
  if position('facts_rotated' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: facts_rotated did not land' using errcode='CLR10';
  end if;
  if position('v_newstate:=clara._invoice_fact_state(t.document_id);' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the fresh cross-regime read is missing' using errcode='CLR10';
  end if;
  if position('amount_exception' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the amount_exception stamp is missing' using errcode='CLR10';
  end if;
  if position('revision_token=gen_random_uuid()' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the revision_token rotation is missing' using errcode='CLR10';
  end if;
  if position('journal_entry_revisions' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the journal_entry_revisions write is missing' using errcode='CLR10';
  end if;
  if position('financial_date = coalesce(v_date, financial_date)' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the financial_date backfill is missing' using errcode='CLR10';
  end if;
  if position('document.invoice_facts_completed' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the completion event emit is missing' using errcode='CLR10';
  end if;
  if position('''extraction_id'',v_text_id' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the completion event payload does not name the CANONICAL text extraction' using errcode='CLR10';
  end if;
  -- B1 (cross-model review): the filings/entries locks must land BEFORE the task re-lock
  -- (step 7's double-checked-locking line) -- exactly the persist_invoice_facts order
  -- (filings -> entries -> task) the rotation block below depends on for deadlock safety.
  if position('order by f.id for update;' in v_src)
     >= position('order by e.id for update of e;' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: the filings lock does not precede the entries lock' using errcode='CLR10';
  end if;
  if position('order by e.id for update of e;' in v_src)
     >= position('select * into t from clara.document_processing_tasks where id = p_task for update;' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: the entries lock does not precede the task re-lock' using errcode='CLR10';
  end if;
  -- Placement: task-status-update -> v_newstate (M-5: computed once) -> financial_date
  -- (M-5: sourced from v_newstate) -> rotation loop -> audit -> event -> return.
  if position('status=''done'', finished_at=now() where id=p_task;' in v_src)
     >= position('v_newstate:=clara._invoice_fact_state' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: v_newstate is not computed right after the task-status update' using errcode='CLR10';
  end if;
  if position('v_newstate:=clara._invoice_fact_state' in v_src)
     >= position('financial_date = coalesce(v_date, financial_date)' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: M-5 regressed -- financial_date must be sourced AFTER v_newstate is computed' using errcode='CLR10';
  end if;
  if position('nullif(btrim(v_newstate->>''invoice_date''),'''')' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: M-5 regressed -- financial_date no longer sources v_newstate''s own invoice_date first' using errcode='CLR10';
  end if;
  if position('financial_date = coalesce(v_date, financial_date)' in v_src)
     >= position('perform clara._audit(t.firm_id,null,null,null,''persist_witness_facts''' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: rotation does not precede the audit call' using errcode='CLR10';
  end if;
  if position('perform clara._audit(t.firm_id,null,null,null,''persist_witness_facts''' in v_src)
     >= position('document.invoice_facts_completed' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: the completion event does not follow the audit call' using errcode='CLR10';
  end if;
  -- NOTE: 'return jsonb_build_object(''task_id'',p_task,''document_id'',t.document_id,' is NOT
  -- a unique anchor -- both idempotent-replay early-returns (steps 2 and 7) open with the
  -- IDENTICAL prefix. The FINAL return is distinguished by 'replayed',false (the replays both
  -- say 'replayed',true), so that is the anchor used here.
  if position('document.invoice_facts_completed' in v_src)
     >= position('''status'',''done'',''replayed'',false);' in v_src) then
    raise exception 'f_a1_writer_rotation S1 postcheck: the completion event does not precede the FINAL return' using errcode='CLR10';
  end if;
  -- Every prior step must survive verbatim -- spot-check the pair insert and belt loop markers.
  if position('THE ATOMIC PAIR INSERT' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the pair-insert section moved or was lost' using errcode='CLR10';
  end if;
  if position('THE ELEVEN BELT FIELDS' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the belt-fields section moved or was lost' using errcode='CLR10';
  end if;
  if position('THE SEVEN OPTIONAL REFERENCE FIELDS' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the optional-reference-fields section moved or was lost' using errcode='CLR10';
  end if;
  if position('USAGE METERING' in v_src) = 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: the usage-metering section moved or was lost' using errcode='CLR10';
  end if;
  -- ACL/ownership unmoved (CREATE OR REPLACE preserves them; re-measured, not assumed).
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure
      and a.grantee <> 'clara_fn_owner'::regrole and a.grantee <> 'clara_runtime'::regrole;
  if v_n <> 0 then
    raise exception 'f_a1_writer_rotation S1 postcheck: persist_witness_facts gained a grant to a role other than clara_fn_owner/clara_runtime' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_writer_rotation S1 postcheck: persist_witness_facts is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  raise notice 'f_a1_writer_rotation S1: persist_witness_facts recut -- (0) B1: filings/entries locked, in that order, BEFORE the task re-lock -- the SAME order persist_invoice_facts already uses, closing the deadlock-order-inversion risk the rotation block below otherwise opens; (1) v_newstate computed once right after the task-status update; financial_date backfills from v_newstate''s OWN cross-channel-agreed invoice_date first (M-5), falling back to the stated text answer only when the state carries none, coalesce/new-wins; (2) a settled pair now rotates every open draft bound to this document (revision_token + amount_exception + a named facts_rotated journal_entry_revisions row), reading that SAME v_newstate; (3) emits document.invoice_facts_completed (the legacy name, reused) with the ID-only payload shape, waking autoDraft''s subscriber. Order verified: task-status update -> v_newstate -> financial_date -> rotation -> audit -> event -> return; none of the three fire on a replay (all sit after both early-return branches). Every prior section (pair insert, belt loop, optional references, usage metering) verified present; ACL/ownership unmoved.';
end
$writer_post$;

-- =====================================================================================
-- TAIL CENSUS.
-- =====================================================================================
do $tail$
begin
  declare v_wsrc text;
  begin
  select p.prosrc into v_wsrc from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure;
  if position('facts_rotated' in v_wsrc) = 0 then
    raise exception 'f_a1_writer_rotation tail: facts_rotated is not live' using errcode='CLR10';
  end if;
  if position('order by e.id for update of e;' in v_wsrc) = 0 then
    raise exception 'f_a1_writer_rotation tail: the B1 filings/entries lock ordering is not live' using errcode='CLR10';
  end if;
  if position('financial_date = coalesce(v_date, financial_date)' in v_wsrc) = 0 then
    raise exception 'f_a1_writer_rotation tail: the financial_date backfill is not live' using errcode='CLR10';
  end if;
  if position('document.invoice_facts_completed' in v_wsrc) = 0 then
    raise exception 'f_a1_writer_rotation tail: the completion event emit is not live' using errcode='CLR10';
  end if;
  end;
  if exists (select 1 from clara.document_processing_tasks where lane='llm_witness') then
    raise exception 'f_a1_writer_rotation tail: an llm_witness task exists post-apply -- this file must be the LAST word before any witness work is minted; something applied out of order' using errcode='CLR10';
  end if;
  raise notice 'f_a1_writer_rotation tail: OK -- persist_witness_facts carries all FOUR writer-parity fixes (B1 filings->entries->task lock ordering, financial_date backfill sourced from the cross-channel-agreed state per M-5, facts_rotated draft rotation, document.invoice_facts_completed emission); live-inert (no llm_witness task exists yet, and none can until UNNUMBERED_f_a1_cutover.sql applies after this file). Census closed 7/7: items 1/3 (page-budget settle, document_kind coalesce) remain named-and-justified absences (provable no-ops for this lane), items 2/6 were already present, items 4/5/7 are fixed here (4/5 hardened by the B1/M-5 review pass). No table in workflow/graphile_worker/spike touched.';
end
$tail$;
