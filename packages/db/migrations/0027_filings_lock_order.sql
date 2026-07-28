-- 0027_filings_lock_order.sql — one consistent documents-before-document_filings lock
-- order across every writer AND every reader that locks both. Closes task #29 (ledger),
-- the pre-existing deadlock the 0025 Q-round reproduced (1/16 concurrent runs → a real
-- 40P01), plus a second cycle and a fourth acquirer the Codex O-round found on review
-- (all folded in here, in ONE migration, per the P-round instruction — not piecemeal).
--
-- THE DEFECT. clara.file_document locks the parent `documents` row FOR UPDATE FIRST,
-- then inserts into `document_filings`. Three other writers do the opposite: they touch
-- `document_filings` FIRST and only reach `documents` LAST, via
-- clara._recompute_document_retention's UPDATE — confirm_attribution_candidate (inserts
-- the filing, then recomputes retention), approve_wrong_client_correction (locks every
-- document_filings row for the document, retires one, inserts another, then recomputes
-- retention), and retire_document_filing (locks the specific filing row by id, then
-- recomputes retention). Two concurrent transactions taking `documents` and
-- `document_filings` in opposite orders on the SAME document is a textbook lock-order
-- inversion: txn A holds `documents` and waits on a `document_filings` unique-index entry
-- (uq_document_filing_active) txn B is mid-inserting; txn B holds that provisional insert
-- and waits on `documents` inside _recompute_document_retention, which txn A already
-- holds. Postgres detects the cycle and kills one side with 40P01 — the reproduced 1/16
-- flake.
--
-- CoR DISCIPLINE. Every body below was pulled via pg_get_functiondef against the live
-- 26-migration database (0001-0026 applied via PR #130), not hand-copied from any
-- migration file's static text. The full writer set was enumerated from the live catalog
-- (pg_proc + pg_get_functiondef ~* 'document_filings'), not assumed to be the two named in
-- the ledger entry — six functions actually write document_filings:
--   documents-first already (UNCHANGED, the canonical/reference order):
--     clara.file_document              — documents FOR UPDATE, then the filings insert
--     clara.finalize_document_intake   — documents locked (existing doc) or freshly
--                                         created (new doc, no contention possible) before
--                                         any filings work
--     clara._seed_verified_document    — documents insert-or-update first (fixture/seed
--                                         path only, not live production traffic)
--   filings-first (WRONG order, fixed below):
--     clara.confirm_attribution_candidate — §A
--     clara.approve_wrong_client_correction — §B (shares the write shape per the ledger
--                                         entry; the CoR sweep confirms it independently)
--     clara.retire_document_filing     — §C (found by the CoR sweep — NOT named in the
--                                         ledger entry; a genuine third member of the wrong-
--                                         order cohort, same hazard class)
-- Three of six move; three already match file_document's order and are untouched by this
-- migration. No other document_filings writer exists in the live catalog (verified by
-- classifying all 39 functions whose body references document_filings into
-- insert/update/delete on the table — only these six ever mutate it).
--
-- THE FIX, uniformly: lock `documents` FOR UPDATE as the FIRST document-touching
-- operation in each of the three writers, before any `document_filings` read/lock/insert/
-- update — matching file_document's existing, unchanged order. retire_document_filing
-- does not know its document_id until it reads the filing row, so it takes an unlocked
-- peek (document_id is immutable on a filing row for its whole lifetime — every writer
-- above only ever INSERTs new rows or UPDATEs retired_at/revision_token/etc., never
-- document_id — so a peek-then-lock-then-refetch is race-free) to learn document_id before
-- taking the `documents` lock, then re-acquires the filing row FOR UPDATE exactly as
-- before.
--
-- WHY THIS DOES NOT NEED TO ANSWER TO THE VENDOR-BINDING TOTAL ORDER. Part 1 §4 of the
-- ratified autopost-vendor-binding design (branch feat/autopost-vendor-binding-design,
-- v4.1) states the total lock order as op-receipt -> coding_rules -> document_filings ->
-- journal_entries -> vendor_identity_bindings, and its own §A.7 explicitly calls out this
-- exact defect: "the pre-existing file_document / confirm_attribution_candidate hazard
-- (task #29) is a filing-vs-filing issue predating this design and untouched by it." The
-- documents table is not a participant in that order at all — every acquirer in the design
-- table (persist_invoice_facts, _approve_entry_core, execute_rule_post, revise_entry)
-- starts at document_filings or later. This migration operates entirely upstream of that
-- order (client attribution / filing, before any coding_rules or journal_entries work
-- begins) and does not insert a new stage into it.
--
-- THE 0020 PIN (§6 of docs/plan/wave-b-migration-0020-design.md, verified against the
-- ACTUAL BYTE_IDENTICAL map in packages/db/tests/wave-b/wb-0020-legacy.test.mjs — not
-- trusted from the design doc's prose alone; 0027 Q-round finding 3 caught this section
-- once contradicting itself against §D/the tail below). The legacy byte-identity closed
-- set is exactly FIVE functions: grant_client_egress, revoke_client_egress,
-- claim_document_processing_task, _enqueue_invoice_facts_core, record_wiki_source_ingest —
-- the egress-consent domain, not the document-filing domain. `resolve_document_client` and
-- `resolve_and_ingest_wiki_source` are NOT members of this set (they sit in a SEPARATE
-- closed set instead — the ACL grant list, EXECUTE-to-clara_runtime-ONLY, design doc
-- line 1487 — which is about WHO may call them, not about their body text). None of the
-- FOUR functions this migration edits (§A/§B/§C plus §D's resolve_and_ingest_wiki_source)
-- are byte-identity pinned members; §D's edit needs no restore()/amendment to that map.
-- _enqueue_invoice_facts_core (a real §6.1 pinned member) IS called by four of the six
-- writers, but always AFTER the filing/document work in the same transaction, and this
-- migration does not touch its body — re-locking `documents` inside it, when the calling
-- writer has already locked the same row moments earlier in the same transaction, is a
-- re-entrant no-op, not a new acquisition. The pin is untouched; nothing to amend.
--
-- CROSS-FUNCTION SAFETY CHECK. Before adding a `documents` FOR UPDATE lock ahead of the
-- existing first lock in each of the three writers, the live catalog was swept for every
-- function that locks `clara.clients` FOR UPDATE and every function that locks
-- `clara.documents` FOR UPDATE: no live function takes BOTH locks today, so there is no
-- pre-existing clients-vs-documents order this migration could invert. Only
-- approve_wrong_client_correction and retire_document_filing lock both (documents, new;
-- clients, pre-existing) after this migration, and in both, `documents` now comes first —
-- consistent with each other, and with nothing else in the system to conflict against.
--
-- error codes: none new. every added statement is a lock acquisition, not a validation —
-- it changes ORDER, never outcome, on any path that does not race.
--
-- THE P-ROUND (Codex O-round, 7816f93, REFUSED — six findings, all fixed here).
--   P1 (real cycle) — clara.resolve_and_ingest_wiki_source (0020) took document_filings
--     FOR SHARE before documents FOR UPDATE, the opposite of the new law: §D swaps it.
--     0020's own design doc already named this cycle as residual R-1 ("bounded and
--     self-healing"); this closes it structurally instead.
--   P2 (real cycle) — confirm_attribution_candidate's documents lock (§A) sat AFTER the
--     client_resolutions insert, which takes `clients` FOR KEY SHARE via its FK — a second
--     genuine inversion against anything holding documents and wanting clients FOR UPDATE
--     (approve_wrong_client_correction, retire_document_filing). Hoisted to precede it.
--   P3 — the tail's own probe for retire_document_filing (§C) checked documents-before-
--     filing-row but never peek-before-documents; a body that moved the peek later (or
--     dropped it) would still pass. Now asserts strict peek < lock < filing-row order.
--   P4 — the §6-pin ACL probe read a NULL proacl (Postgres's own PUBLIC-EXECUTE-by-default
--     for an unrevoked function) as "owner-only", since aclexplode(NULL) yields no rows.
--     Now fails explicitly on proacl IS NULL.
--   P5/P6 — postverify-only findings (the writer sweep's comment-stripping/signature-
--     allowlist gap, and the soak's untyped loser); fixed in
--     packages/db/deploy/filings-lock-order-0027-postverify.sql and
--     packages/db/tests/x27-filings-lock-order.test.mjs respectively, not here.

-- =====================================================================
-- §A — clara.confirm_attribution_candidate: lock `documents` before the filings touch.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara.confirm_attribution_candidate(p_candidate uuid, p_op_key text, p_file_document boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  c record; v_dedupe jsonb; x record; v_res uuid; v_filing uuid;
  v_filed boolean:=false; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'confirm_attribution_candidate',p_op_key,
    clara._hash(jsonb_build_object('candidate',p_candidate,'file',p_file_document)));
  if v_dedupe is not null then return v_dedupe; end if;
  select ac.*,aa.document_id into x from clara.attribution_candidates ac
    join clara.attribution_attempts aa on aa.id=ac.attempt_id
    where ac.id=p_candidate for update;
  if not found or x.firm_id<>c.firm then raise exception 'candidate not in your firm' using errcode='CLR11'; end if;
  if x.disposition<>'open' then raise exception 'candidate is already disposed' using errcode='CLR20'; end if;
  -- 0027 P-round (Codex O-round finding 2): the `documents` lock must precede EVERY
  -- conflicting client acquisition, not just the document_filings insert below — the
  -- client_resolutions insert immediately after this comment enforces
  -- client_id REFERENCES clients(id), which takes `clients` FOR KEY SHARE. A concurrent
  -- retirement/correction that already holds `documents` and then wants `clients` FOR
  -- UPDATE, racing this function holding `clients` KEY SHARE and wanting `documents`, is a
  -- second genuine cycle — so the lock is hoisted here, unconditionally (even when
  -- p_file_document is false and this call will never touch document_filings at all;
  -- locking a row this txn does not strictly need is the safe direction, never the
  -- unsafe one). Matches file_document's order for every downstream touch, not only the
  -- filings insert.
  perform 1 from clara.documents where id=x.document_id for update;
  insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,
      confidence,method,evidence,resolved_by)
    values(c.firm,x.client_id,'document',x.document_id,1.0,'human',
      jsonb_build_object('candidate_id',p_candidate),c.actor) returning id into v_res;
  update clara.attribution_candidates set disposition='confirmed',disposed_by=c.actor,
    disposed_at=now() where id=p_candidate;
  if p_file_document then
    select id into v_filing from clara.document_filings
      where document_id=x.document_id and client_id=x.client_id and retired_at is null;
    if v_filing is null then
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
          resolution_id,basis)
        values(c.firm,x.document_id,x.client_id,c.actor,v_res,'human')
        returning id into v_filing;
      perform clara._recompute_document_retention(x.document_id);
      v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
      v_filed:=true;
    end if;
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'confirm_attribution_candidate',null,
    jsonb_build_object('candidate',p_candidate,'document',x.document_id,
      'client',x.client_id,'resolution',v_res,'filing',v_filing,
      'facts_task',v_facts->>'task_id','op_key',p_op_key));
  perform clara._append_event(c.firm,'client.resolved',x.client_id,c.actor,null,null,
    null,case when v_filed then x.document_id else null end,v_res,'{}'::jsonb);
  if v_filed then
    perform clara._append_event(c.firm,'document.filed',x.client_id,c.actor,null,null,
      null,x.document_id,v_res,jsonb_build_object('filing_id',v_filing));
    if v_facts->>'status'='failed' then
      perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
        null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
          'reason',v_facts->>'reason'));
    end if;
  end if;
  return clara._finish_op(c.firm,'confirm_attribution_candidate',p_op_key,
    jsonb_build_object('candidate_id',p_candidate,'resolution_id',v_res,
      'filing_id',v_filing));
end $function$;

-- =====================================================================
-- §B — clara.approve_wrong_client_correction: same fix, same reason (shares the write
-- shape per the ledger entry — confirmed independently by the CoR sweep).
-- =====================================================================
CREATE OR REPLACE FUNCTION clara.approve_wrong_client_correction(p_correction uuid, p_plan_hash text, p_attestation text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  c record; v_dedupe jsonb; x record; it record; o record; pending record;
  v_current bigint; v_mirror uuid; v_to_filing uuid; v_from_filing uuid;
  v_resolution uuid; v_solo text; v_adopted boolean;
  v_recode_notification uuid; v_coding_task uuid; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into x from clara.filing_corrections where id=p_correction;
  if not found or x.firm_id<>c.firm then raise exception 'correction not in your firm' using errcode='CLR11'; end if;
  -- [R1-F1] A filing correction may not capture any K-family entry.
  if exists(select 1 from clara.filing_correction_items i
      join clara.journal_entries je on je.id=i.entry_id
      where i.correction_id=p_correction and je.is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('correction',p_correction,'plan_hash',p_plan_hash,
      'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005002,hashtext(c.firm::text));
  select * into x from clara.filing_corrections where id=p_correction for update;
  if x.status<>'proposed' or x.plan_hash<>p_plan_hash then raise exception 'correction plan/state mismatch' using errcode='CLR12'; end if;
  if c.actor=x.maker then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'correction requires a distinct checker' using errcode='CLR19';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo correction approval requires attestation' using errcode='CLR19';
    else v_solo:=p_attestation; end if;
  end if;
  select coalesce(max(seq),0) into v_current from clara.domain_events where firm_id=c.firm;
  if v_current<>x.books_version then raise exception 'correction plan is stale (books version moved)' using errcode='CLR19'; end if;

  -- 0027 (task #29): lock the parent document BEFORE any document_filings touch — same
  -- fix as confirm_attribution_candidate. Previously this function's first
  -- document_filings acquisition preceded `documents` (only reached later, via
  -- _recompute_document_retention), the same inversion against file_document.
  perform 1 from clara.documents where id=x.document_id for update;
  perform 1 from clara.document_filings f where f.document_id=x.document_id and f.firm_id=c.firm
    order by f.id for update;
  select id into v_from_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.from_client and retired_at is null;
  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  -- [WB-R21/0019 §1] The wiki VETO is gone. A correction move still retires the
  -- SOURCE filing, so the SOURCE client's row lock — the serializer against wiki
  -- publication — stays, at exactly the position the veto call held.
  perform 1 from clara.clients cl
    where cl.id=x.from_client and cl.firm_id=c.firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id
    where i.correction_id=x.id order by je.id for update of je;
  if exists(select 1 from clara.filing_correction_items i
      where i.correction_id=x.id and i.entry_state_hash<>clara._entry_state_hash(i.entry_id)) then
    raise exception 'correction item state changed' using errcode='CLR19';
  end if;
  if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
      and clara._correction_period_state(i.entry_id)<>'no_period_model') then
    raise exception 'correction touches a closed period' using errcode='CLR19';
  end if;
  select id into v_resolution from clara.client_resolutions
    where firm_id=c.firm and client_id=x.to_client and subject_kind='document'
      and subject_id=x.document_id and method in ('human','rule') and confidence>=0.95
      and superseded_at is null order by created_at desc limit 1;
  if v_resolution is null then raise exception 'destination client attribution is not authoritative' using errcode='CLR01'; end if;

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    select * into o from clara.journal_entries where id=it.entry_id;
    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;
      for pending in select * from clara.journal_entries
          where reversal_of=o.id and status='draft' order by id for update loop
        if v_mirror is null
           and clara._entry_state_hash(pending.id)=clara._expected_reversal_state_hash(pending.id,o.id) then
          v_mirror:=pending.id; v_adopted:=true;
        else
          update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
            withdrawn_at=now(),withdrawal_reason='superseded-by-correction',
            proposed_counterparty=null,match_fingerprint=null,updated_at=now()
            where id=pending.id;
        end if;
      end loop;
      if v_mirror is null then
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',current_date,'Correction reversal: '||x.reason,
            'reversal',o.resolution_id,o.is_opening_balance,o.is_year_end,o.tax_affecting,
            c.actor,c.actor,o.id,x.reason) returning id into v_mirror;
        insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
            credit_cents,description,counterparty_id)
          select v_mirror,line_no,account_code,credit_cents,debit_cents,
            description,counterparty_id
          from clara.journal_lines where entry_id=o.id order by line_no;
      end if;
      perform clara._assert_balanced(v_mirror);
      perform clara._assert_supplier_bill_shape(v_mirror);
      update clara.journal_entries set status='approved',checker_actor=c.actor,
        approved_at=now(),self_approval_attestation=v_solo,updated_at=now()
        where id=v_mirror;
      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      update clara.filing_correction_items set reversal_id=v_mirror,outcome='reversed',
        adopted_reversal=v_adopted where id=it.id;
    elsif it.action='withdraw_draft' then
      update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
        withdrawn_at=now(),withdrawal_reason=x.reason,proposed_counterparty=null,
        match_fingerprint=null,updated_at=now() where id=o.id;
      update clara.filing_correction_items set outcome='withdrawn' where id=it.id;
    else
      update clara.filing_correction_items set outcome='already_reversed' where id=it.id;
    end if;
  end loop;

  update clara.document_filings set retired_at=now(),retired_by=c.actor,
    retirement_reason=x.reason,correction_id=x.id where id=v_from_filing;
  select id into v_to_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.to_client and retired_at is null;
  if v_to_filing is null then
    insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
        resolution_id,basis,correction_id)
      values(c.firm,x.document_id,x.to_client,c.actor,v_resolution,'correction',x.id)
      returning id into v_to_filing;
  end if;
  perform clara._recompute_document_retention(x.document_id);
  v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
  insert into clara.coding_tasks(firm_id,client_id,document_id,filing_id,origin,
      correction_id,opened_by)
    values(c.firm,x.to_client,x.document_id,v_to_filing,'correction',x.id,c.actor)
    returning id into v_coding_task;
  insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
    values(c.firm,x.to_client,'document_recode_required',jsonb_build_object(
      'correction_id',x.id,'document_id',x.document_id,'to_client',x.to_client,
      'coding_task_id',v_coding_task,'work_kind','recode_document','status','pending',
      'carrier','slice6-coding-floor'),c.actor) returning id into v_recode_notification;
  update clara.filing_corrections set status='completed',checker=c.actor,
    attestation=v_solo,approved_at=now(),completed_at=now() where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'approve_wrong_client_correction',null,
    jsonb_build_object('correction',x.id,'document',x.document_id,
      'from_filing',v_from_filing,'to_filing',v_to_filing,
      'coding_task',v_coding_task,'plan_hash',p_plan_hash,'op_key',p_op_key));

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    if it.outcome='reversed' then
      if not it.adopted_reversal then
        perform clara._append_event(c.firm,'entry.drafted',x.from_client,c.actor,null,null,
          it.reversal_id,null,null,'{}'::jsonb);
      end if;
      perform clara._append_event(c.firm,'entry.approved',x.from_client,c.actor,null,null,
        it.reversal_id,null,null,'{}'::jsonb);
      perform clara._append_event(c.firm,'entry.reversed',x.from_client,c.actor,null,null,
        it.entry_id,null,null,'{}'::jsonb);
    end if;
  end loop;
  perform clara._append_event(c.firm,'document.filing_retired',x.from_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('filing_id',v_from_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.filed',x.to_client,c.actor,null,null,
    null,x.document_id,v_resolution,jsonb_build_object('filing_id',v_to_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.correction_applied',null,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('correction_id',x.id));
  perform clara._append_event(c.firm,'coding_task.opened',x.to_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('coding_task_id',v_coding_task,
      'filing_id',v_to_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'notification.recorded',x.to_client,c.actor,null,null,
    null,null,null,jsonb_build_object('notification_id',v_recode_notification,
      'correction_id',x.id,'coding_task_id',v_coding_task));
  if v_facts->>'status'='failed' then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'approve_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',x.id,'status','completed',
      'from_filing_id',v_from_filing,'to_filing_id',v_to_filing,
      'coding_task_id',v_coding_task));
end $function$;

-- =====================================================================
-- §C — clara.retire_document_filing: found by the CoR sweep, not named in the ledger
-- entry. Same wrong order (filing row locked before `documents`, via
-- _recompute_document_retention at the end). document_id is not known until the filing
-- row is read, so this uses an unlocked peek first (safe: document_id is immutable on a
-- filing row for its whole lifetime; nothing in the live catalog ever updates it), then
-- locks `documents`, then re-acquires the filing row FOR UPDATE exactly as before.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara.retire_document_filing(p_filing_id uuid, p_reason text, p_expected_revision uuid, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare c record; v_dedupe jsonb; f record; v_blockers jsonb; v_peek_doc uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'retirement reason is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_document_filing', p_op_key,
    clara._hash(jsonb_build_object('filing',p_filing_id,'reason',p_reason,'revision',p_expected_revision)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- 0027 (task #29): an unlocked peek at document_id, so `documents` can be locked
  -- BEFORE the filing row — matching file_document's order. A miss here (no such
  -- filing) just falls through to the FOR UPDATE below, which raises the normal
  -- not-found path unchanged.
  select document_id into v_peek_doc from clara.document_filings where id = p_filing_id;
  if v_peek_doc is not null then
    perform 1 from clara.documents where id = v_peek_doc for update;
  end if;
  select * into f from clara.document_filings where id = p_filing_id for update;
  if not found or f.firm_id <> c.firm then raise exception 'filing not in your firm' using errcode = 'CLR11'; end if;
  if f.retired_at is not null then raise exception 'filing is already retired' using errcode = 'CLR17'; end if;
  if f.revision_token <> p_expected_revision then raise exception 'stale filing revision' using errcode = 'CLR17'; end if;
  -- [WB-R21/0019 §1] The wiki VETO is gone. The non-wiki client-row SERIALIZER
  -- stays, at exactly the position the veto call held, so filing retirement and wiki
  -- publication still serialize on the same client row (0017:2049-2053).
  perform 1 from clara.clients cl
    where cl.id=f.client_id and cl.firm_id=f.firm_id for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,'posting_date',je.posting_date,
      'status',je.status,'period_state',clara._correction_period_state(je.id))
      order by je.posting_date, je.id), '[]'::jsonb) into v_blockers
    from clara.journal_entries je where je.filing_id = f.id
      and ((je.status = 'draft') or (je.status = 'approved' and je.reversed_by is null));
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;
  update clara.document_filings set retired_at = now(), retired_by = c.actor,
    retirement_reason = p_reason where id = f.id;
  perform clara._recompute_document_retention(f.document_id);
  perform clara._audit(c.firm,c.actor,null,null,'retire_document_filing',null,
    jsonb_build_object('filing',f.id,'document',f.document_id,'client',f.client_id,'op_key',p_op_key));
  perform clara._append_event(c.firm,'document.filing_retired',f.client_id,c.actor,null,null,
    null,f.document_id,f.resolution_id,jsonb_build_object('filing_id',f.id));
  return clara._finish_op(c.firm,'retire_document_filing',p_op_key,
    jsonb_build_object('filing_id',f.id,'status','retired','blockers','[]'::jsonb));
end $function$;

-- =====================================================================
-- §D — clara.resolve_and_ingest_wiki_source (0020): found in the P-round (Codex O-round
-- finding 1), not the original CoR sweep — it is a READER, not a document_filings WRITER
-- (it locks document_filings FOR SHARE, never inserts/updates/deletes it), so §5's
-- writer-only sweep correctly never flagged it; it still acquires the SAME two locks
-- (documents, document_filings) every writer above does, in the OLD order — document_filings
-- FOR SHARE first, documents FOR UPDATE second. That is now the ONLY acquirer of these two
-- locks still in the wrong order, and it is live production code: the runtime calls it on
-- every document.classified/document.filed event. Swapped to match.
--
-- 0020's own design doc (docs/plan/wave-b-migration-0020-design.md §11, residual R-1) ALREADY
-- named this exact cycle — "Deadlock (40P01) between resolve_and_ingest_wiki_source and a
-- concurrent authority function... Bounded and self-healing... Not fixed in 0020" — against
-- the THEN-inconsistent writer set (some writers documents-first, some filings-first, so a
-- genuine cycle was only sometimes reachable depending which authority function raced it).
-- This fix does not just re-bound the residual, it CLOSES it: once every acquirer of
-- (documents, document_filings) takes them in the same order, the cycle is structurally
-- impossible, not merely rare-and-recoverable. packages/db/tests/wave-b/wb-0020-resolver.test.mjs
-- carries two two-session races that already exercise this pair (raceIngestThenFileB,
-- raceIngestThenRetire) — updated across the P-round and Q-round to match: their `blocked`
-- detection now names the lock this fix actually changed (documents, not document_filings,
-- for the retire pairing), and their outcome assertions are SERIALIZATION-ONLY (a hard
-- success requirement), not the old "either serializes cleanly OR aborts 40P01" — accepting
-- 40P01 there would mask this fix's own regression instead of catching it. The R-1 test's
-- retirement-aborted branch, which represented an outcome this fix makes unreachable, was
-- removed rather than left as unreachable dead code.
--
-- NOT a 0020 §6 byte-identity closed-set member (verified against packages/db/tests/wave-b/
-- wb-0020-legacy.test.mjs's BYTE_IDENTICAL map: grant_client_egress, revoke_client_egress,
-- claim_document_processing_task, _enqueue_invoice_facts_core, record_wiki_source_ingest —
-- five functions, not resolve_and_ingest_wiki_source). No restore()/A12 pin amendment is
-- needed; there is no exact-hash pin on this function to amend.
CREATE OR REPLACE FUNCTION clara.resolve_and_ingest_wiki_source(p_firm uuid, p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_clients uuid[]; v_client uuid; v_result jsonb;
begin
  if p_firm is null or p_document is null then
    return jsonb_build_object('status','skipped_unresolved_client');
  end if;
  -- (1) the phantom guard on the parent row — moved first (0027).
  perform 1 from clara.documents d
    where d.id=p_document and d.firm_id=p_firm for update;
  -- (2) filing topology, FOR SHARE, in the authority functions' own id order.
  perform 1 from clara.document_filings f
    where f.document_id=p_document and f.firm_id=p_firm order by f.id for share;
  -- (3) the AUTHORITATIVE re-read, under both locks, through the shared predicate.
  v_clients:=clara._active_filing_clients(p_firm,p_document);
  if cardinality(v_clients)=0 then
    return jsonb_build_object('status','skipped_unresolved_client');
  elsif cardinality(v_clients)>1 then
    return jsonb_build_object('status','skipped_ambiguous_client');
  end if;
  v_client:=v_clients[1];
  -- §5.4: the re-drive fires only for CLASSIFIED documents. A newly filed document that was
  -- never classified must not be ingested. This gate sits on the unique branch, because §5.3
  -- states the zero / many outcomes as direct outcomes of the authoritative re-read.
  if not exists(select 1 from clara.domain_events e
      where e.firm_id=p_firm and e.event_type='document.classified'
        and e.document_id=p_document) then
    return jsonb_build_object('status','skipped_unclassified');
  end if;
  -- The op key is derived INSIDE this function, in the BYTE-IDENTICAL shape the consumer
  -- already uses for entry.approved, so the two paths share ONE op receipt per
  -- (client, document) and can never double-publish. The audited writer owns the write.
  v_result:=clara.record_wiki_source_ingest(v_client,p_document,null,
    'wikiingest:'||v_client::text||':'||p_document::text);
  return v_result||jsonb_build_object('status','projected');
end $function$;

-- =====================================================================
-- TAIL — in-transaction self-verification. Every raise is a real assertion failure, not
-- a soft warning; a clean run ends with one notice and nothing else.
-- =====================================================================
do $tail$
declare
  v_prior_count int;
  v_src_a text; v_src_b text; v_src_c text; v_src_d text;
  v_norm_a text; v_norm_b text; v_norm_c text; v_norm_d text;
  v_pos_client int; v_pos_lock int; v_pos_touch int; v_pos_peek int;
begin
  -- (1) mandatory prior-migration check — 0026 must already be applied.
  select count(*) into v_prior_count from clara.schema_migrations where version = '0026_lane_widen';
  if v_prior_count <> 1 then
    raise exception '0027 tail: migration 0026 is not recorded as applied — apply in order';
  end if;

  -- (2) each of the four edited functions exists with exactly one overload and the
  -- new/reordered `documents` lock appears in comment-stripped, whitespace-normalized
  -- source strictly BEFORE the function's own conflicting client/filings acquisitions —
  -- the same discipline 0022 established (delete-a-guard-paste-as-comment defeats a raw
  -- text match; strip comments first).
  select pg_get_functiondef(oid) into v_src_a from pg_proc
    where proname = 'confirm_attribution_candidate' and pronamespace = 'clara'::regnamespace;
  select pg_get_functiondef(oid) into v_src_b from pg_proc
    where proname = 'approve_wrong_client_correction' and pronamespace = 'clara'::regnamespace;
  select pg_get_functiondef(oid) into v_src_c from pg_proc
    where proname = 'retire_document_filing' and pronamespace = 'clara'::regnamespace;
  select pg_get_functiondef(oid) into v_src_d from pg_proc
    where proname = 'resolve_and_ingest_wiki_source' and pronamespace = 'clara'::regnamespace;
  if v_src_a is null or v_src_b is null or v_src_c is null or v_src_d is null then
    raise exception '0027 tail: one of the four edited functions is missing after CREATE OR REPLACE';
  end if;

  v_norm_a := regexp_replace(regexp_replace(v_src_a, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_norm_b := regexp_replace(regexp_replace(v_src_b, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_norm_c := regexp_replace(regexp_replace(v_src_c, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_norm_d := regexp_replace(regexp_replace(v_src_d, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');

  -- 0027 P-round (finding 2): the documents lock must precede the client_resolutions
  -- insert (which takes `clients` FOR KEY SHARE via its FK) too, not only the filings
  -- insert — both position checks are now asserted.
  v_pos_lock := position('from clara.documents where id=x.document_id for update' in lower(v_norm_a));
  v_pos_client := position('insert into clara.client_resolutions' in lower(v_norm_a));
  v_pos_touch := position('insert into clara.document_filings' in lower(v_norm_a));
  if v_pos_lock = 0 or v_pos_client = 0 or v_pos_touch = 0
     or v_pos_lock >= v_pos_client or v_pos_lock >= v_pos_touch then
    raise exception '0027 tail: confirm_attribution_candidate does not lock documents strictly before BOTH the client_resolutions insert and the filings insert (lock=%, client=%, filings=%)', v_pos_lock, v_pos_client, v_pos_touch;
  end if;

  v_pos_lock := position('from clara.documents where id=x.document_id for update' in lower(v_norm_b));
  v_pos_touch := position('from clara.document_filings f where f.document_id=x.document_id' in lower(v_norm_b));
  if v_pos_lock = 0 or v_pos_touch = 0 or v_pos_lock >= v_pos_touch then
    raise exception '0027 tail: approve_wrong_client_correction does not lock documents strictly before the document_filings row lock';
  end if;

  -- 0027 P-round (finding 3): assert the PEEK itself precedes the documents lock, not
  -- only that the documents lock precedes the filing-row lock — a body with the peek
  -- moved to AFTER the documents lock (or dropped) would satisfy the old two-term check.
  v_pos_peek := position('select document_id into v_peek_doc from clara.document_filings' in lower(v_norm_c));
  v_pos_lock := position('from clara.documents where id = v_peek_doc for update' in lower(v_norm_c));
  v_pos_touch := position('select * into f from clara.document_filings where id = p_filing_id for update' in lower(v_norm_c));
  if v_pos_peek = 0 or v_pos_lock = 0 or v_pos_touch = 0
     or v_pos_peek >= v_pos_lock or v_pos_lock >= v_pos_touch then
    raise exception '0027 tail: retire_document_filing''s peek/lock/filing-row-lock are not in strict order (peek=%, lock=%, filing=%)', v_pos_peek, v_pos_lock, v_pos_touch;
  end if;

  -- 0027 P-round (finding 1): resolve_and_ingest_wiki_source (§D) now locks documents
  -- BEFORE document_filings — the swap from 0020's original order.
  v_pos_lock := position('from clara.documents d' in lower(v_norm_d));
  v_pos_touch := position('from clara.document_filings f' in lower(v_norm_d));
  if v_pos_lock = 0 or v_pos_touch = 0 or v_pos_lock >= v_pos_touch then
    raise exception '0027 tail: resolve_and_ingest_wiki_source does not lock documents strictly before document_filings';
  end if;

  -- (3) file_document, finalize_document_intake and _seed_verified_document are
  -- UNTOUCHED by this migration (not reinstalled) — assert their signatures still exist
  -- (a sweep-scope check, not a body check: CREATE OR REPLACE was never issued for them
  -- here, so their prosrc cannot have moved by this migration's own hand).
  if not exists (select 1 from pg_proc where proname = 'file_document' and pronamespace = 'clara'::regnamespace)
     or not exists (select 1 from pg_proc where proname = 'finalize_document_intake' and pronamespace = 'clara'::regnamespace)
     or not exists (select 1 from pg_proc where proname = '_seed_verified_document' and pronamespace = 'clara'::regnamespace)
  then
    raise exception '0027 tail: an unedited reference-order writer went missing';
  end if;

  -- (4) the 0020 §6 closed-set members this migration's callees touch
  -- (_enqueue_invoice_facts_core) must remain untouched — this migration issues no
  -- CREATE OR REPLACE for it; assert it still exists and is still owner-only. 0027
  -- P-round (finding 4): a NULL proacl (Postgres's own default privileges — implicit
  -- PUBLIC EXECUTE on a function unless explicitly REVOKEd) must FAIL this probe, not
  -- pass it — aclexplode(NULL) returns zero rows, so the old exists(...) form read a
  -- publicly-executable core as "owner-only".
  if exists (select 1 from pg_proc p where p.proname = '_enqueue_invoice_facts_core' and p.pronamespace = 'clara'::regnamespace
              and (p.proacl is null or exists (
                select 1 from lateral aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE'
                    and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')))) then
    raise exception '0027 tail: _enqueue_invoice_facts_core (0020 §6 pinned) gained a direct/PUBLIC EXECUTE grant (or lost its ACL) — this migration must not touch it';
  end if;

  raise notice '0027: documents-before-document_filings lock order now consistent across all six live writers PLUS the resolve_and_ingest_wiki_source reader (file_document / finalize_document_intake / _seed_verified_document unchanged as the reference order; confirm_attribution_candidate / approve_wrong_client_correction / retire_document_filing / resolve_and_ingest_wiki_source fixed) — task #29 closed';
end
$tail$;
