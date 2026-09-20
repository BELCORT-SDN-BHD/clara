-- 0254_intake_refusal_record — #965 (riders wave 2, lane 05; document intake): A FILE REFUSED AT
-- INTAKE CREATION BY THE FIRM'S DAILY CEILING LEAVES A DURABLE, COMMITTED RECORD INSTEAD OF
-- VANISHING WITH THE ROLLED-BACK TRANSACTION.
-- =====================================================================================
-- Spec of record: issue #965. Raised by #636 as a named follow-up
-- (docs/plan/active/refresh-wave-2026-09-18/reports/636-final.md, follow-up #2). Owner's ruling
-- (2026-09-20, on the issue): "Confirmed Option B: a file refused at intake creation by the daily
-- ceiling gets a durable, committed record instead of disappearing with the rolled-back
-- transaction. … because the intake relation already carries the 'failed' status and the 'limit'
-- failure reason this refusal belongs at. It is dev work, not a small fix: the creation door's
-- contract changes shape and every caller changes with it."
-- Domain words: CONTEXT.md — "Refused intake record" (added by this file).
--
-- THE GAP THIS FILE CLOSES, MEASURED ON THIS LANE'S OWN RIG BEFORE ANY CHANGE.
-- `clara.create_document_intake` (0007:1825-1857) inserts the intake row and THEN calls
-- `clara._reserve_document_ingest` in the SAME transaction. When the reservation refuses with
-- CLR18 ('document daily limit reached (docs)' / '(pages)', 0007:1646/1649, their window moved to
-- Asia/Kuala_Lumpur by #964's 0252), the raise rolls that transaction back and takes the freshly
-- inserted `clara.document_intakes` row with it. The uploader sees a one-time 429 and nothing
-- survives it, so nobody can confirm later which files were turned away. Measured red for exactly
-- this reason by `p965.refusal.docs_ceiling_commits_a_record` before this file existed: the
-- second call on a firm whose `docs_per_day` is 1 RAISED `CLR18 document daily limit reached
-- (docs)` instead of returning.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. The one call to `clara._reserve_document_ingest` is
-- wrapped in a plpgsql block with an `exception when sqlstate 'CLR18'` arm; when that arm fires,
-- the intake row THAT WAS ALREADY INSERTED (outside the block, so the subtransaction rollback
-- cannot reach it) is moved to the lane's existing `failed` status with its existing `limit`
-- failure reason, and the door RETURNS a refusal outcome through the same `clara._finish_op`
-- receipt every other answer goes through. No exception leaves the door for a ceiling refusal any
-- more.
--
-- WHY THE INSERT SURVIVES, PRECISELY. A plpgsql `begin … exception … end` block opens an implicit
-- subtransaction around THE STATEMENTS INSIDE IT and nothing else. The `insert into
-- clara.document_intakes` sits BEFORE the block and is therefore not in that subtransaction; when
-- the arm fires, only the refused reservation attempt is undone. That is the whole mechanism —
-- there is no second connection, no autonomous transaction and no deferred write.
--
-- WHY THE UPDATE IS LEGAL, AND WHY IT IS AN UPDATE RATHER THAN A BORN-FAILED INSERT.
--   * `clara._tf_document_intake_update` (0007) admits `uploading -> failed` as its first legal
--     transition, and `ck_document_intakes_failure` requires exactly what this write supplies
--     (status 'failed' WITH a non-null failure_code). `limit` is already in
--     `document_intakes_failure_code_check`'s nine-value list. NO new vocabulary.
--   * Inserting the row born-failed would mean moving the reservation call BEFORE the insert,
--     which would change the ACCEPTED file's own statement order — the acceptance criterion
--     "the accepted-file path gains no new commit ordering, latency or failure mode" forbids
--     exactly that. The accepted path here executes the identical statements in the identical
--     order; its only difference is the implicit savepoint the exception block takes, which adds
--     no commit, no statement and no new refusal.
--
-- WHY NO NEW COLUMN, NO NEW TABLE AND NO NEW GRANTED NAME.
--   * The firm, the attempted file (`original_filename`, `declared_mime`, `declared_bytes`) and
--     the moment (`created_at`) are already columns of `clara.document_intakes`; the refusal only
--     has to stop deleting them.
--   * The returned outcome is stored durably by `clara._finish_op` in `clara.op_receipts`
--     (0004), keyed by (firm, fn, op_key) — so a replay of the same key answers the same refusal
--     instead of deciding twice, exactly as an accepted intake does.
--   * No function is added, removed or regranted: this file's only DDL is one `create or replace
--     function` on an EXISTING signature plus its comment. §T re-reads the ACL byte-identical to
--     what §0 measured. This migration therefore needs NO rig-meta cohort.
--
-- WHAT IT DOES NOT DO.
--   * NO change to the ceiling values, to the reservation check, or to its time window:
--     `clara._reserve_document_ingest`, `clara._resize_document_reservation`,
--     `clara._settle_document_reservation` and `clara.firm_document_limits` are not named by any
--     DDL in this file, and §T re-reads the reserve body to prove #964's own MYT window clause is
--     still exactly where 0252 left it.
--   * NO reconstruction of refusals from before this record existed.
--   * NO firm-facing UI to browse refused files.
--   * NO change to `clara.get_intake_batch`: its `waiting` facet ALREADY counts a member whose
--     intake carries `failure_code='limit'` and its `failed` facet ALREADY excludes one (0229's
--     D4 ruling, "a quota block is WAITING, not dead"). §T proves both predicates are still there,
--     unmoved, rather than editing them.
--
-- REDO-SAFETY (#957). The one statement below is `create or replace function` — naturally
-- idempotent DDL. The splice is ALSO idempotent against its OWN prior effect: if the live body
-- already carries the target, it is skipped with a NOTICE rather than re-applied, so
-- `CLARA_MIGRATION_REDO=0254_intake_refusal_record` re-runs cleanly whether or not a prior
-- attempt already landed.
-- =====================================================================================

do $w965_pre$
declare v_sig text := 'clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)';
        v_pre constant text := '09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d';
        v_src text;
begin
  if to_regprocedure(v_sig) is null then
    raise exception '#965 prestate: % is absent -- its owning migration (0007) must apply first', v_sig
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if v_src not like '%v_refused%'
     and encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
    raise exception '#965 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
      using errcode='CLR10';
  end if;
  raise notice '#965 prestate: clean -- clara.create_document_intake resolves and carries either the pinned 0007 pre-image or this file''s own already-landed target.';
end
$w965_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.create_document_intake — TWO anchors in the one body: the declare line gains the
--     refusal flag, and the single reservation call gains its exception arm and the committed
--     refusal that follows it. Both anchors are non-overlapping, each proven to occur exactly
--     once before the splice, and the reverse substitution below proves nothing else in the
--     ~2.0KB body moved.
-- =====================================================================================
do $w965_create$
declare
  v_sig text := 'clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)';
  v_pre constant text := '09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int; v_probe text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)`: scripts/wiki-lint-checks.mjs's CoR-patch
  -- target attribution resolves `pg_get_functiondef`'s argument only through a direct signature
  -- literal or a variable whose LATEST assignment is one (0252's own comment, restated).
  v_oid := 'clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$declare v_firm uuid; v_dedupe jsonb; v_id uuid; v_res uuid; v_pages int;$t1$;
  v_r1 := $r1$declare v_firm uuid; v_dedupe jsonb; v_id uuid; v_res uuid; v_pages int;
        -- #965: the ceiling refusal's own state. `v_refused` is the ONLY new control flow in this
        -- body; every other declaration is 0007's.
        v_refused boolean := false; v_ceiling text; v_reason text; v_at timestamptz;$r1$;

  v_t2 := $t2$  v_res := clara._reserve_document_ingest(v_firm,v_id,v_pages,p_expires_at);$t2$;
  v_r2 := $r2$  -- #965: A CEILING REFUSAL IS A COMMITTED RECORD, NOT A ROLLBACK. The block below
  -- opens an implicit SUBTRANSACTION around this one call and nothing else; the intake row was
  -- inserted ABOVE it, so the arm's rollback cannot reach it. Only CLR18 is caught -- every other
  -- failure of the reservation (and every failure anywhere else in this body) still leaves the
  -- door as an exception, exactly as 0007 shipped it.
  begin
    v_res := clara._reserve_document_ingest(v_firm,v_id,v_pages,p_expires_at);
  exception when sqlstate 'CLR18' then
    -- THE DATABASE'S OWN SENTENCE, VERBATIM. 0229's capacity wait already carries exactly this
    -- text into the batch card as the operator remedy; paraphrasing it here would put two
    -- spellings of one fact into the estate. WHICH ceiling is read off that same sentence -- the
    -- reserve helper raises two fixed messages, '(docs)' and '(pages)', and this file must not
    -- edit the helper to add a structured detail (the reservation check is #965's own
    -- out-of-scope line). The tail re-reads the helper to prove both sentences are still there.
    get stacked diagnostics v_reason = message_text;
    v_ceiling := case when position('(pages)' in v_reason) > 0 then 'pages' else 'documents' end;
    v_refused := true;
  end;
  if v_refused then
    v_at := now();
    -- The lane's EXISTING vocabulary: `uploading -> failed` is _tf_document_intake_update's first
    -- legal transition and `limit` is already in the failure_code check's list. No new status, no
    -- new reason, no new column.
    update clara.document_intakes set status='failed', failure_code='limit' where id=v_id;
    -- A refusal is as auditable as the admission it replaced: the SAME append-only call the
    -- accepted path makes, under the same fn, naming the intake it committed and the ceiling
    -- that refused it. `outcome` stays 'ok' because the DOOR answered; `args.refused` is what
    -- says the answer was a refusal.
    perform clara._audit(v_firm,p_uploaded_by,null,null,'create_document_intake',null,
      jsonb_build_object('intake',v_id,'refused',true,'ceiling',v_ceiling,'reason',v_reason,
        'origin',p_origin,'op_key',p_op_key));
    return clara._finish_op(v_firm,'create_document_intake',p_op_key,
      jsonb_build_object('intake_id',v_id,'reservation_id',null,'status','failed',
                         'failure_code','limit','refused',true,'ceiling',v_ceiling,
                         'firm_id',v_firm,'filename',p_filename,'refused_at',v_at,
                         'reason',v_reason));
  end if;$r2$;

  if v_src like ('%' || v_r2 || '%') then
    raise notice '#965 create: already at the committed-refusal target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#965 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;

    foreach v_probe in array array[v_t1, v_t2] loop
      v_occ := (length(v_src) - length(replace(v_src, v_probe, ''))) / length(v_probe);
      if v_occ <> 1 then
        raise exception '#965 create: an anchor occurs % time(s) in %, expected exactly 1 -- re-derive before patching', v_occ, v_sig
          using errcode='CLR10';
      end if;
    end loop;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#965 create: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(replace(v_src, v_t1, v_r1), v_t2, v_r2);
    execute v_head || 'AS $w965cre$' || v_new || '$w965cre$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if v_src not like ('%' || v_r1 || '%') or v_src not like ('%' || v_r2 || '%') then
      raise exception '#965 create: % did not land the committed refusal after the splice', v_sig using errcode='CLR10';
    end if;
    v_back := replace(replace(v_src, v_r1, v_t1), v_r2, v_t2);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#965 create: the splice on % changed MORE than its two anchors -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#965 create: clara.create_document_intake now COMMITS a refused intake at failed/limit and RETURNS a refusal outcome instead of raising CLR18; every other byte is the pinned 0007 body.';
  end if;
end
$w965_create$;

comment on function clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text) is
  '#965: open a document intake. Admits the file and returns {intake_id, reservation_id, status: '
  '''uploading'', expires_at} exactly as 0007 shipped it. When the firm''s daily document/page '
  'ceiling refuses the reservation, the intake row is NOT rolled back: it is committed at '
  'status=''failed'' / failure_code=''limit'' and the door RETURNS a refusal outcome carrying '
  'refused=true, ceiling (''documents''/''pages''), firm_id, filename, refused_at and the '
  'database''s own refusal sentence -- never a CLR18 exception. The refusal is audited through '
  'the same append-only clara._audit call the admission uses. Every other refusal '
  '(authorisation, op-key reuse) still raises.';

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim this file made about what moved, and what did not, re-read from the
-- committed catalog.
-- =====================================================================================
do $w965_tail$
declare v_src text; v_acl text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)'::regprocedure;

  -- (T1) THE REFUSAL ARM IS PRESENT, scoped to CLR18 alone, and commits at the existing lane
  -- vocabulary.
  if v_src not like '%exception when sqlstate ''CLR18'' then%'
     or v_src not like '%update clara.document_intakes set status=''failed'', failure_code=''limit'' where id=v_id;%'
     or v_src not like '%''refused'',true%' then
    raise exception '#965 tail: clara.create_document_intake does not carry the committed refusal'
      using errcode='CLR10';
  end if;

  -- (T1b) THE RECORD IDENTIFIES ITSELF. Which ceiling, whose firm, which file, which moment, and
  -- the database's own sentence -- all five in the ONE returned outcome, and the refusal is
  -- audited through the SAME append-only call the admission uses.
  if v_src not like '%get stacked diagnostics v_reason = message_text;%'
     or v_src not like '%position(''(pages)'' in v_reason)%'
     or v_src not like '%''firm_id'',v_firm,''filename'',p_filename,''refused_at'',v_at%' then
    raise exception '#965 tail: the refusal outcome does not name its ceiling, firm, file and moment'
      using errcode='CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'clara._audit(', ''))) / length('clara._audit(') <> 2 then
    raise exception '#965 tail: expected exactly two clara._audit calls (the admission and the refusal), found a different count'
      using errcode='CLR10';
  end if;

  -- (T2) EXACTLY ONE reservation call remains, and it is INSIDE the guarded block. The splice
  -- wrapped the call; it never duplicated it, and it never left a second unguarded one behind.
  if (length(v_src) - length(replace(v_src, '_reserve_document_ingest', ''))) / length('_reserve_document_ingest') <> 1 then
    raise exception '#965 tail: expected exactly one call to clara._reserve_document_ingest, found a different count'
      using errcode='CLR10';
  end if;

  -- (T3) NO ACL MOVED.
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner}' then
    raise exception '#965 tail: clara.create_document_intake''s ACL moved to %', v_acl using errcode='CLR10';
  end if;

  -- (T4) THE CEILING CHECK ITSELF IS UNTOUCHED -- this ticket's own out-of-scope line. The reserve
  -- helper still carries BOTH CLR18 raises and the Asia/Kuala_Lumpur window #964's 0252 put there.
  if not exists (select 1 from pg_proc p
                  where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure
                    and p.prosrc like '%document daily limit reached (docs)%'
                    and p.prosrc like '%document daily limit reached (pages)%'
                    and p.prosrc like '%date_trunc(''day'', now() at time zone ''Asia/Kuala_Lumpur'')%') then
    raise exception '#965 tail: clara._reserve_document_ingest moved -- this file must not touch the reservation check or its window'
      using errcode='CLR10';
  end if;

  -- (T5) THE BATCH READ IS UNTOUCHED, and already classifies a `limit` member as WAITING rather
  -- than FAILED (0229's D4). This file relies on that instead of editing it.
  if not exists (select 1 from pg_proc p
                  where p.oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure
                    and p.prosrc like '%or (dv.failure_code = ''limit'') )%'
                    and p.prosrc like '%dv.failure_code is not null and dv.failure_code <> ''limit''%') then
    raise exception '#965 tail: clara.get_intake_batch''s limit-is-waiting classification moved -- this file must not touch the read envelope'
      using errcode='CLR10';
  end if;

  raise notice '#965 tail: OK -- clara.create_document_intake commits a refused intake at failed/limit and returns a refusal outcome, exactly one reservation call remains and it is guarded, its ACL is exactly what the prestate measured, and neither the reservation check nor the batch read moved.';
end
$w965_tail$;
