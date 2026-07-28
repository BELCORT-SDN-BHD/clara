-- =====================================================================
-- Migration 0024 (the classify lane's missing DB terminal-fail path, PLUS the
-- 5th-round claim-owner hardening, Q1) — POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database immediately
-- after applying 0024 (0024 and 0025 apply TOGETHER, in one ceremony — see probe 1):
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f fail-classify-0024-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean run ends with
-- one notice per probe and nothing else.
--
-- WHAT 0024 CLAIMS, restated as probes:
--   1. 0024 is applied and 0023 is still in the history (0025, its combined-ceremony sibling,
--      is an EXPECTED head too — see probe 1's own note).
--   2. fail_classify exists at its exact 3-arg signature, is the DB's first classify-lane
--      terminal-fail writer, and is reachable by clara_runtime alone.
--   3. document.classify_failed is registered and lives in the ACTIVE taxonomy version.
--   4. persist_document_extraction's classify-lane refusal (0016) is untouched — fail_classify
--      is a NEW, separate terminal writer, never a widening of the generic one.
--   5. classify_document exists as EXACTLY ONE overload, at 8 args, with NO default on
--      p_task/p_run/p_claim_secret (a short call must fail to RESOLVE, 42883 — never
--      silently degrade to an earlier, unprotected shape), and is reachable by clara_runtime
--      alone.
--   6. classify_document's task-bound settle requires ALL THREE of task-identity match,
--      workflow_run_id match, AND sha256(p_claim_secret) = the stored digest (Q1) — never
--      run-token identity alone. The no-task ceremony (WA21-R11) refuses whenever ANY
--      classify-task history exists for the document, not merely "no task running" (P1).
--      The op-key request hash is SHAPE-CONDITIONAL: a null-task call hashes with the exact
--      pre-0024 4-key shape; a task-bound call's hash gains task+run (P3) — so a historical
--      op_key still replays byte-identically.
--   7. claim_document_processing_task mints a random claim-secret CAPABILITY on every fresh
--      claim, stores ONLY its sha256 digest (new column, claim_secret_digest — the preimage
--      is NEVER persisted anywhere readable), and returns the preimage EXACTLY ONCE in its
--      own jsonb — the fresh-claim branch, never replay or held_egress.
--   8. The apply added DOORS, not data (the xmin idiom) — no task enqueued, no extraction
--      written, no entry posted, no rule-post run produced.
--
-- WHY THE PROBES MATCH COMMENT-STRIPPED TEXT. 0022 demonstrated the attack rather than
-- arguing it: delete a guard, paste its text back as a `--` comment, and every raw-prosrc
-- probe still passes. Everything syntactic below therefore runs against prosrc with BOTH
-- comment forms removed and whitespace normalised, the same discipline 0024's own
-- in-transaction tail already carries — this file re-proves it from OUTSIDE that
-- transaction, against the COMMITTED catalog (the 0019/0020/0021/0022/0023 precedent: an
-- operator's "it went fine" can only be checked against the database, never against the
-- migration's own belief about itself).
--
-- AND THE HONEST FRAMING, carried from 0022/0023: these are BELT. The primary instrument is
-- BEHAVIOURAL — x-fail-classify.test.mjs drives real claimed tasks, real two-session lock-order
-- schedules, and the Q1 attack cells (a genuine second clara_runtime session reading the table)
-- through the real functions. These probes exist so a DEPLOY onto a drifted catalog is caught,
-- not to replace the cells.

-- ---------------------------------------------------------------------
-- 1. The migration is at 0024, and 0023 is still there. Strict-head, but 0024 and 0025 are
--    a COMBINED ceremony — both migrations apply in ONE batch, so by the time an operator
--    runs THIS file 0025 is the EXPECTED head, not a hypothetical "later" database. Unlike
--    0022/0023 (deployed as two separate ceremonies, so 0022's postverify ran while 0022
--    genuinely WAS head), 0024/0025 never has that intermediate state to observe — so both
--    are accepted here WITHOUT the generic escape. Anything past 0025 still needs it, same
--    as every other file:
--        set clara.postverify_allow_later = 'on';
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0024_fail_classify') then
    raise exception 'POST-VERIFY 1: 0024_fail_classify is NOT applied (head is %)', v;
  end if;
  if v not in ('0024_fail_classify', '0025_receipt_routing') and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — neither 0024 nor its combined-ceremony sibling 0025 is the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0023_extraction_slice_x5') then
    raise exception 'POST-VERIFY 1: 0023 is missing from the history';
  end if;
  if v_later then
    raise notice 'OK 1  0024 applied, 0023 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at % (0024 or its combined-ceremony sibling 0025), 0023 intact', v;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. fail_classify exists at its exact signature, carries the whole definer posture, and
--    EXECUTE is held by clara_runtime alone — WHITELIST over proacl (a blacklist cannot see
--    a role invented after this file was written), plus the effective-privilege sweep (group
--    membership can grant reachability with no ACL entry at all) and the wake-allowlist
--    check (this verb is driven by the classify consumer loop, never a wake).
-- ---------------------------------------------------------------------
do $$
declare
  v_sig constant text := 'clara.fail_classify(uuid,text,text)';
  v_oid oid; v_cfg text; v_owner text; v_acl aclitem[]; v_bad text; v_have text; v_role text;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception 'POST-VERIFY 2: % is absent at its exact signature', v_sig;
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'POST-VERIFY 2: % is not SECURITY DEFINER', v_sig;
  end if;
  select coalesce(array_to_string(proconfig, ','), ''), pg_get_userbyid(proowner)
    into v_cfg, v_owner from pg_proc where oid = v_oid;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception 'POST-VERIFY 2: % has no pinned search_path (%)', v_sig, v_cfg;
  end if;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'POST-VERIFY 2: % is owned by % — a definer lends its OWNER''s authority', v_sig, v_owner;
  end if;

  select proacl into v_acl from pg_proc where oid = v_oid;
  if v_acl is null then
    raise exception 'POST-VERIFY 2: % has a NULL acl — default function privileges are EXECUTE TO PUBLIC', v_sig;
  end if;
  select string_agg(distinct case when a.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(a.grantee) end, ', ') into v_bad
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'));
  if v_bad is not null then
    raise exception 'POST-VERIFY 2: % has unexpected EXECUTE grantee(s): % — only clara_fn_owner + clara_runtime may hold it', v_sig, v_bad;
  end if;
  select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_have
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'clara_runtime';
  if v_have is null then
    raise exception 'POST-VERIFY 2: clara_runtime does NOT hold EXECUTE on % — the grant is vacuous', v_sig;
  end if;
  foreach v_role in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive',
      'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
    if to_regrole(v_role) is null then continue; end if;
    if has_function_privilege(v_role, v_sig, 'execute') then
      raise exception 'POST-VERIFY 2: % holds EFFECTIVE EXECUTE on % — this verb is clara_runtime-only', v_role, v_sig;
    end if;
  end loop;
  if exists (select 1 from clara.wake_fn_allowlist where function_name = 'fail_classify') then
    raise exception 'POST-VERIFY 2: fail_classify leaked into the wake allowlist — it is driven by the classify consumer loop, never a wake';
  end if;
  raise notice 'OK 2  fail_classify: exact signature, SECURITY DEFINER, search_path pinned, owned by clara_fn_owner, EXECUTE clara_runtime-only (whitelist + effective sweep), wake allowlist clean';
end $$;

-- ---------------------------------------------------------------------
-- 3. document.classify_failed is registered AND in the ACTIVE taxonomy version — an honest
--    terminal fact, no router wake (mirrors document.invoice_facts_failed, 0009).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from clara.event_types where name = 'document.classify_failed')
     or not exists (select 1 from clara.trigger_taxonomy t join clara.taxonomy_active a
        on a.version = t.version and a.singleton where t.event_type = 'document.classify_failed') then
    raise exception 'POST-VERIFY 3: document.classify_failed taxonomy pair assertion failed';
  end if;
  raise notice 'OK 3  document.classify_failed registered and active in the taxonomy';
end $$;

-- ---------------------------------------------------------------------
-- 4. persist_document_extraction's classify-lane refusal (0016) is UNTOUCHED — fail_classify
--    is a NEW, separate terminal writer for the lane, never a widening of the generic one.
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null or position('classify tasks are settled by classify_document' in v_src) = 0 then
    raise exception 'POST-VERIFY 4: persist_document_extraction lost its classify-lane refusal';
  end if;
  raise notice 'OK 4  persist_document_extraction''s classify-lane refusal is byte-identical to 0016';
end $$;

-- ---------------------------------------------------------------------
-- 5. classify_document exists as EXACTLY ONE overload, at 8 args, carries the whole definer
--    posture, and NO parameter defaults — a call short of 8 args must fail to RESOLVE
--    (42883) rather than silently taking an earlier, unprotected shape (the P1/Q1 arity
--    discipline). EXECUTE is clara_runtime-only, same whitelist + effective-sweep proof.
-- ---------------------------------------------------------------------
do $$
declare
  v_sig constant text := 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)';
  v_oid oid; v_cfg text; v_owner text; v_acl aclitem[]; v_bad text; v_have text; v_role text;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname = 'classify_document') <> 1 then
    raise exception 'POST-VERIFY 5: clara.classify_document has more than one overload — an earlier 5/6/7-arg signature survived alongside the current 8-arg one';
  end if;
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception 'POST-VERIFY 5: % is absent at its exact signature', v_sig;
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'POST-VERIFY 5: % is not SECURITY DEFINER', v_sig;
  end if;
  select coalesce(array_to_string(proconfig, ','), ''), pg_get_userbyid(proowner)
    into v_cfg, v_owner from pg_proc where oid = v_oid;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception 'POST-VERIFY 5: % has no pinned search_path (%)', v_sig, v_cfg;
  end if;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'POST-VERIFY 5: % is owned by % — a definer lends its OWNER''s authority', v_sig, v_owner;
  end if;
  if (select pronargdefaults from pg_proc where oid = v_oid) <> 0 then
    raise exception 'POST-VERIFY 5: % still has default argument(s) — a short call must fail to resolve, not silently degrade', v_sig;
  end if;

  select proacl into v_acl from pg_proc where oid = v_oid;
  if v_acl is null then
    raise exception 'POST-VERIFY 5: % has a NULL acl — default function privileges are EXECUTE TO PUBLIC', v_sig;
  end if;
  select string_agg(distinct case when a.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(a.grantee) end, ', ') into v_bad
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'));
  if v_bad is not null then
    raise exception 'POST-VERIFY 5: % has unexpected EXECUTE grantee(s): % — only clara_fn_owner + clara_runtime may hold it', v_sig, v_bad;
  end if;
  select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_have
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'clara_runtime';
  if v_have is null then
    raise exception 'POST-VERIFY 5: clara_runtime does NOT hold EXECUTE on % — the grant is vacuous', v_sig;
  end if;
  foreach v_role in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive',
      'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
    if to_regrole(v_role) is null then continue; end if;
    if has_function_privilege(v_role, v_sig, 'execute') then
      raise exception 'POST-VERIFY 5: % holds EFFECTIVE EXECUTE on % — this verb is clara_runtime-only', v_role, v_sig;
    end if;
  end loop;
  raise notice 'OK 5  classify_document: exactly ONE overload, 8 args, NO default arguments, SECURITY DEFINER, search_path pinned, owned by clara_fn_owner, EXECUTE clara_runtime-only';
end $$;

-- ---------------------------------------------------------------------
-- 6. classify_document's body: the task-bound settle requires task-identity + run-token +
--    claim-secret digest (Q1) fused as ONE conjunction, never run-token alone; the no-task
--    ceremony refuses whenever ANY classify-task history exists (P1); the op-key hash is
--    shape-conditional on p_task, BOTH branches present (P3). BOTH comment forms stripped —
--    the 0022 lesson: a deleted guard pasted back as a comment must not pass.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 6: classify_document is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  -- P2 + Q1: the settle conjunction, fused whole — task-bound status, run-token match, AND
  -- the digest check, all in the SAME if-condition that gates the running->done update.
  if position('t.status=''running''andt.workflow_run_id=p_runandt.claim_secret_digest=sha256(convert_to(coalesce(p_claim_secret,''''),''UTF8''))thenupdateclara.document_processing_taskssetstatus=''done''' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: classify_document''s task-bound settle no longer requires task-identity + run-token + claim-secret digest as ONE conjunction (Q1) — a run token alone (readable off the table by any clara_runtime session) could settle another session''s claim';
  end if;
  -- P1: the no-task ceremony's REAL precondition — ANY classify-task history, not merely a
  -- currently-running one.
  if position('ifexists(select1fromclara.document_processing_taskswheredocument_id=p_documentandlane=''classify'')then' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: classify_document''s no-task ceremony path lost the task-history existence guard (P1)';
  end if;
  -- P3: the op-key hash's BOTH branches, fused as the whole case-when expression — the
  -- null-task path hashes with the exact pre-0024 4-key shape; the task-bound path gains
  -- task+run. Either branch missing breaks a real op_key's replay.
  if position('casewhenp_taskisnullthenclara._hash(jsonb_build_object(''document'',p_document,''kind'',p_kind,''confidence'',p_confidence,''engine'',p_engine_id))elseclara._hash(jsonb_build_object(''document'',p_document,''kind'',p_kind,''confidence'',p_confidence,''engine'',p_engine_id,''task'',p_task,''run'',p_run))end)' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: classify_document''s op-key hash is no longer shape-conditional on p_task (P3) — a pre-0024 op_key would fail to replay byte-identically';
  end if;
  raise notice 'OK 6  classify_document: task+run+claim-secret settle conjunction, the any-history ceremony guard, and both op-key hash-shape branches all present in executable text';
end $$;

-- ---------------------------------------------------------------------
-- 7. claim_document_processing_task: the digest column exists; the secret is minted and
--    its digest stored in the SAME statement as the fresh queued->running transition; the
--    quoted 'claim_secret' jsonb key — the preimage itself — appears EXACTLY ONCE (never
--    on replay or held_egress, where re-issuing it would let a table-reader fish it back
--    out, reopening Q1 one branch over). ACL unchanged (create-or-replace preserves it;
--    asserted explicitly rather than assumed).
-- ---------------------------------------------------------------------
do $$
declare
  v_sig constant text := 'clara.claim_document_processing_task(uuid,text,boolean)';
  v_src text; v_code text; v_acl aclitem[]; v_bad text; v_have text;
begin
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'document_processing_tasks'
        and column_name = 'claim_secret_digest' and data_type = 'bytea') then
    raise exception 'POST-VERIFY 7: clara.document_processing_tasks.claim_secret_digest is missing or the wrong type';
  end if;
  select prosrc into v_src from pg_proc where oid = to_regprocedure(v_sig);
  if v_src is null then
    raise exception 'POST-VERIFY 7: claim_document_processing_task is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('v_secret:=gen_random_uuid()::text' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: claim_document_processing_task lost the secret-minting line';
  end if;
  if position('updateclara.document_processing_taskssetstatus=''running'',workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,claim_secret_digest=sha256(convert_to(v_secret,''UTF8''))whereid=p_task' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: claim_document_processing_task no longer mints+stores the claim-secret digest on the fresh claim transition';
  end if;
  if (select count(*) from regexp_matches(v_code, '''claim_secret''', 'g')) <> 1 then
    raise exception 'POST-VERIFY 7: claim_document_processing_task''s quoted ''claim_secret'' jsonb key appears % times, not exactly once — the preimage must be returned ONLY on a fresh claim, never on replay',
      (select count(*) from regexp_matches(v_code, '''claim_secret''', 'g'));
  end if;
  select proacl into v_acl from pg_proc where oid = to_regprocedure(v_sig);
  if v_acl is null then
    raise exception 'POST-VERIFY 7: % has a NULL acl — default function privileges are EXECUTE TO PUBLIC', v_sig;
  end if;
  select string_agg(distinct case when a.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(a.grantee) end, ', ') into v_bad
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'));
  if v_bad is not null then
    raise exception 'POST-VERIFY 7: % has unexpected EXECUTE grantee(s): %', v_sig, v_bad;
  end if;
  select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_have
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'clara_runtime';
  if v_have is null then
    raise exception 'POST-VERIFY 7: clara_runtime does NOT hold EXECUTE on %', v_sig;
  end if;
  raise notice 'OK 7  claim_secret_digest column present; the secret is minted + its digest stored on the fresh-claim transition; the preimage returns EXACTLY ONCE (never on replay); ACL unchanged';
end $$;

-- ---------------------------------------------------------------------
-- 8. THE INERTNESS RECEIPT — 0024 added DOORS, not data (the 0021/0022/0023 xmin idiom:
--    migrate.mjs applies + records in ONE transaction, so the schema_migrations row's xmin
--    IS the apply's txn id). Adding a terminal-fail path, a capability column, and a CoR
--    must not itself have enqueued, extracted, posted, or run anything.
-- ---------------------------------------------------------------------
do $$
declare v_xid text; v_n bigint;
begin
  select xmin::text into v_xid from clara.schema_migrations
   where version = '0024_fail_classify';
  if v_xid is null then
    raise exception 'POST-VERIFY 8: no schema_migrations row for 0024 (probe 1 should have caught this)';
  end if;
  select count(*) into v_n from clara.document_processing_tasks where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 8: the 0024 apply transaction touched % processing task(s) — it must open a door, not walk through it', v_n;
  end if;
  select count(*) into v_n from clara.document_extractions where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 8: the 0024 apply transaction touched % extraction(s)', v_n;
  end if;
  select count(*) into v_n from clara.journal_entries where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 8: the 0024 apply transaction touched % journal entr(ies)', v_n;
  end if;
  select count(*) into v_n from clara.rule_post_runs where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 8: the 0024 apply transaction produced % rule-post run(s)', v_n;
  end if;
  raise notice 'OK 8  the 0024 apply transaction (xid %) enqueued nothing, extracted nothing, posted nothing, ran nothing', v_xid;
end $$;
