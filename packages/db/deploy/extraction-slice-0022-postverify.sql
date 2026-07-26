-- =====================================================================
-- Migration 0022 (the extraction slice, block X1) — POST-DEPLOY VERIFY PROBES.
-- READ-ONLY.  Run as the OWNER/ceremony role.
--
-- WHY THIS FILE EXISTS. 0022 carries an in-transaction tail, and the tail proves
-- THE APPLY — inside the migration's own transaction, against the state that
-- transaction is building. This file re-reads the load-bearing claims from
-- OUTSIDE the committed catalog, which is the only place an operator's "it went
-- fine" can be checked against the database (the 0019/0020/0021 precedent).
--
-- The claims 0022 stakes, restated as probes:
--   * two new HUMAN-ONLY verbs (the whole cost bound on request_reextraction is
--     that no machine lane can execute it — ADR-047 Q4 declined a numeric cap);
--   * the X4 dark guard is ARMED in execute_rule_post (the OCR-sales anchor lane
--     stays structurally shut until X5 removes it deliberately);
--   * the corrected component tie is present where it belongs and ABSENT where it
--     must not be — the corroboration surface (_invoice_fact_state_at) and the
--     supplier floor are UNTOUCHED (they are X5's, alone / out of scope forever);
--   * 0022 added a DOOR, not data: its apply transaction wrote no task, no
--     extraction, and re-priced no firm.
--
-- USAGE (live env, DSN from the environment — NEVER in argv):
--     psql -v ON_ERROR_STOP=1 -f packages/db/deploy/extraction-slice-0022-postverify.sql
--
-- It raises on the FIRST failed invariant and prints a green line per section
-- otherwise. It writes NOTHING — safe inside `begin read only`.
--
-- NO psql meta-commands anywhere in this file: the rig runs it VERBATIM through
-- node-postgres, which cannot parse them. Section banners are RAISE NOTICE.
-- =====================================================================
do $$ begin raise notice '=== 0022 post-verify - READ-ONLY ==='; end $$;

-- ---------------------------------------------------------------------
-- 1. The migration is at 0022, and 0021 is still there. Strict-head by default;
--    a caller who KNOWS it is looking at a later database says so out loud with
--        set clara.postverify_allow_later = 'on';
--    (the 0021 idiom — no ceremony sets it, no operator types it by accident).
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0022_extraction_slice_x1') then
    raise exception 'POST-VERIFY 1: 0022_extraction_slice_x1 is NOT applied (head is %)', v;
  end if;
  if v <> '0022_extraction_slice_x1' and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0022 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0021_counterparty_human_lane') then
    raise exception 'POST-VERIFY 1: 0021 is missing from the history';
  end if;
  if v_later then
    raise notice 'OK 1  0022 applied, 0021 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at 0022_extraction_slice_x1, 0021 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Both verbs exist at their EXACT signatures, are SECURITY DEFINER, pin
--    search_path, and are OWNED BY clara_fn_owner (a definer lends its OWNER's
--    authority — the 0021 lesson, asserted here for the third time on purpose).
-- ---------------------------------------------------------------------
do $$
declare v_sig text; v_oid oid; v_cfg text; v_owner text;
begin
  foreach v_sig in array array[
      'clara.request_reextraction(uuid,text,text)',
      'clara.set_firm_high_stakes_threshold(bigint,text)'] loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception 'POST-VERIFY 2: % is absent at its exact signature', v_sig;
    end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'POST-VERIFY 2: % is not SECURITY DEFINER', v_sig;
    end if;
    select coalesce(array_to_string(proconfig, ','), ''), pg_get_userbyid(proowner)
      into v_cfg, v_owner from pg_proc where oid = v_oid;
    -- Stored as `search_path=clara, pg_temp` — WITH A SPACE (the 0021 matcher lesson).
    if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
      raise exception 'POST-VERIFY 2: % has no pinned search_path (%)', v_sig, v_cfg;
    end if;
    if v_owner <> 'clara_fn_owner' then
      raise exception 'POST-VERIFY 2: % is owned by % — a definer lends its OWNER''s authority', v_sig, v_owner;
    end if;
  end loop;
  raise notice 'OK 2  both 0022 verbs: SECURITY DEFINER, search_path pinned, owned by clara_fn_owner';
end $$;

-- ---------------------------------------------------------------------
-- 3. EXECUTE is held by clara_authenticated and by NOBODY else — no PUBLIC, no
--    runtime, no agent, no wake role — and neither verb is in any wake allowlist.
--    THIS PROBE IS THE COST BOUND: ADR-047 Q4 ruled "no cap, audit only" on
--    re-extraction precisely because no machine lane can ever reach the verb to
--    loop it. Read from pg_proc.proacl via aclexplode (information_schema fails
--    open here — the 0021 lesson); a NULL acl means EXECUTE TO PUBLIC = FAILURE.
-- ---------------------------------------------------------------------
do $$
declare v_sig text; v_acl aclitem[]; v_bad text; v_have text; v_role text;
begin
  foreach v_sig in array array[
      'clara.request_reextraction(uuid,text,text)',
      'clara.set_firm_high_stakes_threshold(bigint,text)'] loop
    select proacl into v_acl from pg_proc where oid = to_regprocedure(v_sig);
    if v_acl is null then
      raise exception 'POST-VERIFY 3: % has a NULL acl — default function privileges are EXECUTE TO PUBLIC', v_sig;
    end if;
    -- WHITELIST, not blacklist. The earlier form listed PUBLIC plus four GROUP roles, so a
    -- direct grant to clara_runtime_login / clara_agent_read_login / clara_wake_write_login
    -- — or to any role invented after this file was written — sailed through while the
    -- notice below still announced "clara_authenticated only". On a live deploy that is a
    -- probe that certifies the opposite of what it prints. Close the set: only the definer's
    -- owner and clara_authenticated may hold EXECUTE, and anything else is NAMED.
    select string_agg(distinct case when a.grantee = 0 then 'PUBLIC'
                                    else pg_get_userbyid(a.grantee) end, ', ') into v_bad
      from aclexplode(v_acl) a
     where a.privilege_type = 'EXECUTE'
       and (a.grantee = 0
            or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'));
    if v_bad is not null then
      raise exception 'POST-VERIFY 3: % has unexpected EXECUTE grantee(s): % — only clara_fn_owner + clara_authenticated may hold it', v_sig, v_bad;
    end if;
    select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_have
      from aclexplode(v_acl) a
     where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'clara_authenticated';
    if v_have is null then
      raise exception 'POST-VERIFY 3: clara_authenticated does NOT hold EXECUTE on % — the human lane cannot call its own verb', v_sig;
    end if;
    -- EFFECTIVE privilege, separately: a role can reach a function through GROUP MEMBERSHIP
    -- without appearing in its ACL at all, so an ACL sweep alone cannot answer "can the
    -- runtime call this". Absent roles are SKIPPED via to_regrole (the probe-9 idiom — the
    -- login shells are not on every database), but a role that EXISTS and holds the
    -- privilege fails. Skipping is for absence only; never fail open.
    foreach v_role in array array['clara_runtime', 'clara_agent_ro',
        'clara_wake_interactive', 'clara_wake_proactive',
        'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
      if to_regrole(v_role) is null then continue; end if;
      if has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'POST-VERIFY 3: % holds EFFECTIVE EXECUTE on % — a machine lane can reach a human-only verb', v_role, v_sig;
      end if;
    end loop;
  end loop;
  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('request_reextraction','set_firm_high_stakes_threshold')) then
    raise exception 'POST-VERIFY 3: a 0022 verb leaked into the wake allowlist';
  end if;
  raise notice 'OK 3  EXECUTE: clara_authenticated ONLY (whitelist over proacl) + zero EFFECTIVE privilege for every machine role/login shell present; wake allowlist clean';
end $$;

-- ---------------------------------------------------------------------
-- 4. THE X4 DARK GUARD IS ARMED and the executor's gate vocabulary is intact.
--    Between 0022 and X5 the OCR-sales anchor block must be IMPOSSIBLE to pass;
--    the guard's marker comment rides pg_proc.prosrc, so its absence here means
--    someone removed it OUTSIDE the ratified X5 micro-migration. The corrected
--    component identity must also already be present (it opens CORRECT at X5).
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.execute_rule_post(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 4: execute_rule_post is GONE';
  end if;
  -- Assert the FUNCTIONAL SHAPE, not the marker comment. `position('X4 DARK GUARD')` alone
  -- passes an edit that flipped `if true` to `if false` and left the comment above it —
  -- i.e. it would certify, on a live deploy, a posting lane that had been silently opened.
  -- The literal below is the executable disjunct together with its marker, two spaces
  -- exactly as written in 0022, so the comment can never vouch for the code.
  if position('if true  -- X4 DARK GUARD' in v_src) = 0 then
    raise exception 'POST-VERIFY 4: the X4 dark guard DISJUNCT is not in execute_rule_post — the OCR-sales anchor lane may be OPEN without X5''s review (a surviving marker comment is not the guard)';
  end if;
  if position('invoice.service_charge' in v_src) = 0
     or position('invoice.discount' in v_src) = 0
     or position('invoice.delivery' in v_src) = 0 then
    raise exception 'POST-VERIFY 4: the corrected component identity is missing from the anchor block';
  end if;
  -- The sign belt inside the anchor block: a NEGATIVE discount turns the identity's
  -- subtraction into an addition and forges a larger gross that ties. It must be present
  -- BEFORE X5 removes the dark guard, or the lane opens onto a forgeable identity.
  if position('coalesce(v_sc,0)<0' in v_src) = 0 then
    raise exception 'POST-VERIFY 4: the anchor block lost its negative-component belt — X5 would open the lane onto a forgeable identity';
  end if;
  if position('anchor_missing' in v_src)=0 or position('not_corroborated' in v_src)=0
     or position('cn_not_autopostable' in v_src)=0
     or position('purchase_sst_not_autopostable' in v_src)=0
     or position('polarity_unverified' in v_src)=0 or position('floor_lost' in v_src)=0
     or position('customer_unresolved' in v_src)=0 then
    raise exception 'POST-VERIFY 4: execute_rule_post lost a named gate from the 0016 ladder';
  end if;
  raise notice 'OK 4  X4 dark guard ARMED; corrected identity staged; full gate vocabulary present';
end $$;

-- ---------------------------------------------------------------------
-- 5. THE UNTOUCHED SURFACES ARE UNTOUCHED. Corroboration is X5's alone: the
--    fact-state helper must still carry the structured identity AND the 0.95
--    confidence term; the supplier floor must still carry its exact sst tie and
--    its escape hatch. A 0022 that had quietly widened either would pass every
--    verb probe above and still be the FATAL-2 regression.
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  if v_src is null or position('v_net + v_tax + coalesce(v_rounding, 0)' in v_src)=0
     or position('coalesce(v_conf, 0) >= 0.95' in v_src)=0 then
    raise exception 'POST-VERIFY 5: _invoice_fact_state_at was disturbed — corroboration changes belong to X5 ALONE';
  end if;
  if position('invoice.service_charge' in v_src) > 0 then
    raise exception 'POST-VERIFY 5: components leaked into the corroboration surface';
  end if;
  select prosrc into v_src from pg_proc
   where oid = 'clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  if v_src is null or position('sst_purchase_cost' in v_src)=0
     or position('amount_override' in v_src)=0 then
    raise exception 'POST-VERIFY 5: the supplier-bill floor was disturbed';
  end if;
  raise notice 'OK 5  corroboration surface + supplier floor byte-stable (X5''s territory untouched)';
end $$;

-- ---------------------------------------------------------------------
-- 6. THE WRITE BOUNDARY GUARDS THE COMPONENTS EVERYWHERE. Three new field_paths
--    must appear in ALL SIX of persist_invoice_facts' enumerations (allowlist,
--    normalize-to-cents, monetary_raw, duplicate-forfeit, present-but-unparseable,
--    NON-NEGATIVE) — one missing set is either the silent-zero defect or, for the
--    last one, the forged-identity defect: `_normalize_invoice_cents` accepts
--    '-5.00' and '(5.00)', and the identity SUBTRACTS the discount, so a negative
--    discount ties a gross the document does not state. The floor is the EXACT
--    live count (6), not a margin: at >=4 two enumerations could vanish unseen.
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 6: persist_invoice_facts is GONE';
  end if;
  if (length(v_src) - length(replace(v_src, 'invoice.service_charge', ''))) / length('invoice.service_charge') < 6
     or (length(v_src) - length(replace(v_src, 'invoice.discount', ''))) / length('invoice.discount') < 6
     or (length(v_src) - length(replace(v_src, 'invoice.delivery', ''))) / length('invoice.delivery') < 6 then
    raise exception 'POST-VERIFY 6: a component field_path is missing from one of the SIX write-boundary enumerations (silent-zero or forged-identity defect)';
  end if;
  if position('must not be negative' in v_src) = 0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts lost the non-negative component guard — a negative discount can forge the sales identity';
  end if;
  -- The guard's LOAD-BEARING EXPRESSION, as one whitespace-normalised literal. An occurrence
  -- count and a refusal-string grep can both be satisfied by text sitting in a COMMENT while
  -- the executable enumeration is gone; this cannot.
  if position('r.field_pathin(''invoice.service_charge'',''invoice.discount'',''invoice.delivery'')andr.monetary_cents<0'
       in regexp_replace(v_src, '\s+', '', 'g')) = 0 then
    raise exception 'POST-VERIFY 6: the non-negative guard EXPRESSION is gone from persist_invoice_facts (a comment is not a control)';
  end if;
  if position('chr(1)' in v_src)=0 or position('monetary value is malformed' in v_src)=0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts lost a retained 0015/0016 refusal';
  end if;
  raise notice 'OK 6  all three components guarded in all six write-boundary enumerations (incl. non-negative)';
end $$;

-- ---------------------------------------------------------------------
-- 7. THE INERTNESS RECEIPT — 0022 added DOORS, not data (the 0021 xmin idiom:
--    migrate.mjs applies + records in ONE transaction, so the schema_migrations
--    row's xmin IS the apply's txn id). The apply must have enqueued no task,
--    minted no extraction, and re-priced no firm. FROZEN xmin = the probe can no
--    longer answer and must say so, never report green vacuously.
-- ---------------------------------------------------------------------
do $$
declare v_xid xid; v_n bigint;
begin
  select xmin into v_xid from clara.schema_migrations
   where version = '0022_extraction_slice_x1';
  if v_xid is null then
    raise exception 'POST-VERIFY 7: no schema_migrations row for 0022 (probe 1 should have caught this)';
  end if;
  if v_xid::text::bigint < 3 then
    raise exception 'POST-VERIFY 7: the 0022 schema_migrations row is FROZEN (xmin=%) — this probe cannot distinguish the migration''s writes and must not report green', v_xid;
  end if;
  select count(*) into v_n from clara.document_processing_tasks where xmin = v_xid;
  if v_n <> 0 then
    raise exception 'POST-VERIFY 7: the 0022 apply transaction enqueued % processing task(s) — a door, not a data migration', v_n;
  end if;
  select count(*) into v_n from clara.document_extractions where xmin = v_xid;
  if v_n <> 0 then
    raise exception 'POST-VERIFY 7: the 0022 apply transaction wrote % extraction row(s)', v_n;
  end if;
  select count(*) into v_n from clara.firms where xmin = v_xid;
  if v_n <> 0 then
    raise exception 'POST-VERIFY 7: the 0022 apply transaction touched % firm row(s) — no threshold moves at deploy', v_n;
  end if;
  raise notice 'OK 7  the 0022 apply transaction (xid %) enqueued nothing, extracted nothing, re-priced nothing', v_xid;
end $$;

do $$ begin raise notice '=== 0022 post-verify COMPLETE - 7/7 ==='; end $$;
