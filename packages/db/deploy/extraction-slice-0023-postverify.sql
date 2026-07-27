-- =====================================================================
-- Migration 0023 (the extraction slice, block X5) — POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database immediately
-- after applying 0023:
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f extraction-slice-0023-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean run ends with
-- one notice per probe and nothing else.
--
-- WHAT 0023 CLAIMS, restated as probes:
--   1. 0023 is applied and 0022 is still in the history.
--   2. Vendor confidence is GONE from the corroboration surface — not unused, GONE — and the
--      arithmetic-agreement terms are there in its place.
--   3. The STRUCTURED branch and every surviving OCR wall are untouched. X5 narrows the OCR
--      branch; it does not widen anything.
--   4. The dark disjunct is out of the executor, the anchor block it guarded is intact, and
--      the two controls it SHADOWED are reachable again.
--   5. Nothing else moved: the supplier floor, the component write boundary, the executor's
--      caller set, the wake allowlist.
--   6. The apply added DOORS, not data (the xmin idiom).
--
-- WHY THE PROBES MATCH COMMENT-STRIPPED TEXT. 0022 demonstrated the attack rather than
-- arguing it: delete a guard, paste its text back as a `--` comment, and every raw-prosrc
-- probe still passes. Everything syntactic below therefore runs against prosrc with comments
-- removed and whitespace normalised. It matters more here than anywhere: this file's own
-- subject matter is a term whose ABSENCE is the claim, and 0023's header discusses that term
-- by name.
--
-- AND THE HONEST FRAMING, carried from 0022: these are BELT. The primary instrument is
-- BEHAVIOURAL — x5-corroboration.test.mjs drives real extraction shapes through the real
-- fact-state function and proves exactly which flip, and x1-anchor drives the real executor.
-- These probes exist so a DEPLOY onto a drifted catalog is caught, not to replace the cells.

-- ---------------------------------------------------------------------
-- 1. The migration is at 0023, and 0022 is still there. Strict-head by default;
--    a caller who KNOWS it is looking at a later database says so out loud with
--        set clara.postverify_allow_later = 'on';
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0023_extraction_slice_x5') then
    raise exception 'POST-VERIFY 1: 0023_extraction_slice_x5 is NOT applied (head is %)', v;
  end if;
  if v <> '0023_extraction_slice_x5' and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0023 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0022_extraction_slice_x1') then
    raise exception 'POST-VERIFY 1: 0022 is missing from the history — X5 rests on X1''s taxonomy and guards';
  end if;
  if v_later then
    raise notice 'OK 1  0023 applied, 0022 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at 0023_extraction_slice_x5, 0022 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. CONFIDENCE IS GONE, AGREEMENT IS THERE. ADR-047 Q1 dropped the vendor's
--    self-reported score from gating ENTIRELY. The probe is for the IDENTIFIER,
--    not for the comparison: 0023 deletes the variable and its read as well as
--    the term, precisely so that this probe can be absolute. A surviving
--    `v_conf` would mean some predicate can still reach for it.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 2: _invoice_fact_state_at is GONE';
  end if;
  -- BOTH COMMENT FORMS, and the order matters. Stripping only `--` left `/* ... */` intact,
  -- which is a complete bypass: `and true /* v_net + ... = v_total */` keeps every positional
  -- literal visible to the probe while the identity no longer executes, so a body that
  -- corroborates anything at all still certifies green. Block comments go first (a `--`
  -- inside one must not truncate it), then line comments, then whitespace.
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('v_conf' in v_code) > 0 then
    raise exception 'POST-VERIFY 2: a confidence identifier survives in the EXECUTABLE text of _invoice_fact_state_at — ADR-047 Q1 dropped vendor confidence from gating ENTIRELY';
  end if;
  if position('0.95' in v_code) > 0 then
    raise exception 'POST-VERIFY 2: the 0.95 threshold literal is back in the corroboration surface';
  end if;
  -- The corrected identity, fused so no fragment can stand in for it.
  if position('v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_rounding,0)-coalesce(v_disc,0))=v_total'
       in v_code) = 0 then
    raise exception 'POST-VERIFY 2: the corrected component identity is absent from the OCR corroboration branch';
  end if;
  -- Presence WITH cardinality on the two fields the identity cannot be evaluated without.
  -- Presence alone would let a conflicting duplicate be min()-selected into agreement.
  if position('v_netisnotnullandv_net_c=1' in v_code) = 0
     or position('v_taxisnotnullandv_tax_c=1' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: net/tax presence-with-cardinality is missing — a duplicate could be selected into agreement';
  end if;
  -- The sign belt. Without it a negative discount turns the identity's subtraction into an
  -- addition and forges a larger gross that ties exactly.
  if position('coalesce(v_sc,0)>=0andcoalesce(v_disc,0)>=0andcoalesce(v_dlv,0)>=0' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: the component sign belt is absent — the identity is forgeable by a negative component';
  end if;
  -- The component cardinality/parse guards, so a present-but-unreadable component can never
  -- arrive as a silent zero and satisfy the identity.
  if position('v_sc_c<=1and(v_sc_c=0orv_scisnotnull)' in v_code) = 0
     or position('v_disc_c<=1and(v_disc_c=0orv_discisnotnull)' in v_code) = 0
     or position('v_dlv_c<=1and(v_dlv_c=0orv_dlvisnotnull)' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: a component cardinality/parse guard is missing — a silent zero could satisfy the identity';
  end if;
  raise notice 'OK 2  vendor confidence GONE (identifier + literal); arithmetic agreement, cardinality and the sign belt all present';
end $$;

-- ---------------------------------------------------------------------
-- 3. X5 NARROWED THE OCR BRANCH AND TOUCHED NOTHING ELSE. Every wall that
--    predates X5 must still be standing, and the STRUCTURED branch — which
--    already corroborated structurally and was never X5's business — must carry
--    its own, DIFFERENT identity untouched.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  -- BOTH COMMENT FORMS, and the order matters. Stripping only `--` left `/* ... */` intact,
  -- which is a complete bypass: `and true /* v_net + ... = v_total */` keeps every positional
  -- literal visible to the probe while the identity no longer executes, so a body that
  -- corroborates anything at all still certifies green. Block comments go first (a `--`
  -- inside one must not truncate it), then line comments, then whitespace.
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('v_locator=''page_polygon''andv_poly_ok' in v_code) = 0
     or position('v_currency=''MYR''' in v_code) = 0
     or position('v_ineligibleisnull' in v_code) = 0
     or position('v_total_count=1andv_totalisnotnullandv_total>0' in v_code) = 0
     or position('(v_due_c=0or(v_dueisnotnullandv_due=v_total))' in v_code) = 0
     or position('(v_deposit_c=0or(v_depositisnotnullandv_deposit=0))' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: an OCR Tier-A wall that predates X5 has been lost — X5 NARROWS this branch, it does not relax it';
  end if;
  if position('v_type=''01''andv_type_c=1' in v_code) = 0
     or position('(v_net+v_tax+coalesce(v_rounding,0))=v_total' in v_code) = 0
     or position('v_bdisnotnullorv_tax=0' in v_code) = 0
     or position('v_bdisnullorv_bd=v_tax' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: the STRUCTURED corroboration branch was disturbed — X5 changes the OCR branch ALONE';
  end if;
  raise notice 'OK 3  every pre-X5 OCR wall standing; structured branch byte-stable';
end $$;

-- ---------------------------------------------------------------------
-- 4. THE ANCHOR LANE IS OPEN, THE BLOCK IS INTACT, THE SHADOWED CONTROLS ARE BACK.
--    While the dark disjunct was armed, (d) `customer_unresolved` and (e2)
--    `floor_lost` were present in the body but UNREACHABLE through the executor,
--    because the anchor block returned first for every OCR-sales entry. Removing
--    the disjunct is only correct if those two walls resurface — if they had been
--    deleted along with it, X5 would have opened a lane and removed its controls
--    in one move.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.execute_rule_post(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 4: execute_rule_post is GONE';
  end if;
  -- BOTH COMMENT FORMS, and the order matters. Stripping only `--` left `/* ... */` intact,
  -- which is a complete bypass: `and true /* v_net + ... = v_total */` keeps every positional
  -- literal visible to the probe while the identity no longer executes, so a body that
  -- corroborates anything at all still certifies green. Block comments go first (a `--`
  -- inside one must not truncate it), then line comments, then whitespace.
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('iftrueorv_grossisnullorv_inv_idisnullorv_inv_dateisnull' in v_code) > 0 then
    raise exception 'POST-VERIFY 4: the X4 dark disjunct is STILL in execute_rule_post — 0023 exists to remove it and the deploy did not take';
  end if;
  if position('ifv_grossisnullorv_inv_idisnullorv_inv_dateisnull' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: the anchor block''s own conditions are GONE — X5 removes a disjunct, not the block';
  end if;
  if position('v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)-coalesce(v_disc,0))<>v_gross'
       in v_code) = 0 then
    raise exception 'POST-VERIFY 4: the anchor lane lost 0022''s corrected identity';
  end if;
  if position('coalesce(v_sc,0)<0' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: the anchor lane lost its negative-component belt — the lane is open onto a forgeable identity';
  end if;
  -- THE SHADOWED CONTROLS, and their ORDER. `customer_unresolved` and `floor_lost` must not
  -- merely exist, they must sit AFTER the anchor block — that ordering is what made them
  -- shadowed, and it is what makes them reachable now.
  if position('customer_unresolved' in v_code) = 0 or position('floor_lost' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: a control that the dark disjunct SHADOWED did not resurface with it';
  end if;
  if position('customer_unresolved' in v_code) < position('anchor_missing' in v_code) then
    raise exception 'POST-VERIFY 4: customer_unresolved no longer follows the anchor block — the ladder order changed under X5';
  end if;
  -- The D-P6 sentinel vocabulary, re-asserted because 0023 rewrites the whole body.
  -- OVER EXECUTABLE TEXT. A sentinel parked in a comment is not a gate: deleting the real
  -- `buyer_mismatch` branch and leaving the word in a block comment satisfied a v_src probe.
  if position('anchor_missing' in v_code)=0 or position('not_corroborated' in v_code)=0
     or position('cn_not_autopostable' in v_code)=0
     or position('purchase_sst_not_autopostable' in v_code)=0
     or position('polarity_unverified' in v_code)=0 or position('direction_unproven' in v_code)=0
     or position('buyer_mismatch' in v_code)=0
     or position('evidence_class_mismatch' in v_code)=0
     or position('suspended_pending_resignature' in v_code)=0
     or position('v_outside_legs' in v_code)=0 then
    raise exception 'POST-VERIFY 4: execute_rule_post lost a named skip / retained 0016 gate';
  end if;
  raise notice 'OK 4  dark disjunct GONE; anchor block + identity + sign belt intact; shadowed controls reachable in order';
end $$;

-- ---------------------------------------------------------------------
-- 5. NOTHING ELSE MOVED. X5 ships alone: no grant, no verb, no widened
--    taxonomy, no key to the lane it just opened.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text; v_acl text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 5: the supplier-bill floor is GONE';
  end if;
  -- THE COMPARISON, not the vocabulary: `sst_purchase_cost` surviving as an identifier proves
  -- nothing about whether the tie still holds, and X5 is what makes tax_total authority-bearing.
  -- BOTH COMMENT FORMS, and the order matters. Stripping only `--` left `/* ... */` intact,
  -- which is a complete bypass: `and true /* v_net + ... = v_total */` keeps every positional
  -- literal visible to the probe while the identity no longer executes, so a body that
  -- corroborates anything at all still certifies green. Block comments go first (a `--`
  -- inside one must not truncate it), then line comments, then whitespace.
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('v_sstp_debit<>v_tax' in v_code) = 0 or position('amount_override' in v_code) = 0 then
    raise exception 'POST-VERIFY 5: the supplier floor''s SST tie or its override hatch is gone from EXECUTABLE text';
  end if;
  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  -- BOTH COMMENT FORMS, and the order matters. Stripping only `--` left `/* ... */` intact,
  -- which is a complete bypass: `and true /* v_net + ... = v_total */` keeps every positional
  -- literal visible to the probe while the identity no longer executes, so a body that
  -- corroborates anything at all still certifies green. Block comments go first (a `--`
  -- inside one must not truncate it), then line comments, then whitespace.
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('r.field_pathin(''invoice.service_charge'',''invoice.discount'',''invoice.delivery'')andr.monetary_cents<0'
       in v_code) = 0 then
    raise exception 'POST-VERIFY 5: persist_invoice_facts lost its non-negative component guard — the write boundary is what makes the identity unforgeable';
  end if;
  -- The executor's caller set, both directions. The §0 quiesce ceremony rests on
  -- clara-runtime being the only caller; a WIDENED set invalidates that argument and an
  -- EMPTIED one means the product is dark and this pin is vacuous.
  select coalesce(string_agg(g, ', ' order by g), '') into v_acl
    from (select case when a.grantee = 0 then 'PUBLIC'
                      else pg_get_userbyid(a.grantee) end as g
            from pg_proc p, lateral aclexplode(p.proacl) a
           where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure
             and a.privilege_type = 'EXECUTE'
             and (a.grantee = 0
                  or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime_login'))
         ) s;
  if v_acl <> '' then
    raise exception 'POST-VERIFY 5: execute_rule_post has unexpected EXECUTE grantee(s): %', v_acl;
  end if;
  if not exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                  where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure
                    and a.privilege_type = 'EXECUTE'
                    and pg_get_userbyid(a.grantee) = 'clara_runtime_login') then
    raise exception 'POST-VERIFY 5: execute_rule_post has LOST its only sanctioned caller (clara_runtime_login)';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('execute_rule_post', '_invoice_fact_state_at')) then
    raise exception 'POST-VERIFY 5: a corroboration/posting function leaked into the wake allowlist';
  end if;
  raise notice 'OK 5  supplier floor + component write boundary untouched; caller set exact; no new key to the lane';
end $$;

-- ---------------------------------------------------------------------
-- 6. THE INERTNESS RECEIPT — 0023 added DOORS, not data (the 0021/0022 xmin
--    idiom: migrate.mjs applies + records in ONE transaction, so the
--    schema_migrations row's xmin IS the apply's txn id). Opening a posting lane
--    must not itself have posted, corroborated, or re-extracted anything.
-- ---------------------------------------------------------------------
do $$
declare v_xid text; v_n bigint;
begin
  select xmin::text into v_xid from clara.schema_migrations
   where version = '0023_extraction_slice_x5';
  if v_xid is null then
    raise exception 'POST-VERIFY 6: no schema_migrations row for 0023 (probe 1 should have caught this)';
  end if;
  select count(*) into v_n from clara.journal_entries where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 6: the 0023 apply transaction touched % journal entr(ies) — it must open a door, not walk through it', v_n;
  end if;
  select count(*) into v_n from clara.document_extractions where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 6: the 0023 apply transaction touched % extraction(s)', v_n;
  end if;
  select count(*) into v_n from clara.document_processing_tasks where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 6: the 0023 apply transaction enqueued % task(s)', v_n;
  end if;
  select count(*) into v_n from clara.rule_post_runs where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 6: the 0023 apply transaction produced % rule-post run(s)', v_n;
  end if;
  raise notice 'OK 6  the 0023 apply transaction (xid %) posted nothing, extracted nothing, enqueued nothing', v_xid;
end $$;
