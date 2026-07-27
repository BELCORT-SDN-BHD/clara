-- 0023_extraction_slice_x5.sql — X5: CORROBORATION BY AGREEMENT.
-- =====================================================================
--
-- THIS IS THE POSTING-AUTHORITY CHANGE, and it ships ALONE. Contract §2 X5 (v1.0 LAW,
-- ADR-047): "ships alone because it is the one change that opens posting authority; its own
-- adversarial review". Nothing else rides this migration — no verb, no grant, no errcode, no
-- taxonomy widening. If a future reader finds anything here that is not corroboration, it
-- was smuggled.
--
-- WHAT CHANGES, both halves and nothing else:
--
--   §A  `_invoice_fact_state_at` — the OCR/azure Tier-A branch. Azure's self-reported
--       confidence term is REMOVED and replaced by ARITHMETIC AGREEMENT over the stated
--       components. The STRUCTURED (`clara-%`) branch is byte-untouched; so is every other
--       wall on the OCR branch. Confidence appears NOWHERE in the new predicate — ADR-047 Q1
--       dropped it from gating entirely, and it survives only as payload metadata.
--
--   §B  `execute_rule_post` — 0022's X4 dark disjunct is DELETED. That disjunct existed for
--       exactly this moment: X2 taught the mapper to emit net and tax, which would otherwise
--       have switched a LIVE posting barrier off as a side effect, and 0022 refused to let
--       that happen implicitly. Removing it here is the deliberate, reviewed, measured act
--       it was reserved for. Every other condition in the anchor block is byte-identical.
--
-- WHY "AGREEMENT" IS THE HONEST WORD FOR THIS. The contract's phrase is "two independent
-- readers agree to the sen". That is not implemented as a similarity score between two
-- strings — it is structural, and it is already half-built:
--   * the mapper reconciles its deterministic layout reader against Azure's typed fields
--     BEFORE persisting (X2's totals reconciliation, X6's identity reconciliation). A
--     disagreement persists NOTHING. So a fact that reaches `document_regions` is one that
--     no reader contradicted.
--   * `persist_invoice_facts` forfeits the WHOLE extraction on conflicting duplicates for a
--     single field_path (0016, widened by 0022). So the surviving fact set is
--     single-valued-per-field across independent producers.
--   * §A's identity then asks whether those INDEPENDENTLY read fields — net, tax, service
--     charge, discount, delivery, rounding, gross — describe one coherent document. Figures
--     read separately from different regions of a page that sum exactly to the sen did not
--     agree by accident.
-- The vendor's opinion of its own OCR never enters that chain.
--
-- WHAT THIS DOES NOT DO, stated because the omissions are deliberate:
--   * NO rounding change. The owner ruled today that rounding stays as-built: the reader
--     emits it only with an affirmatively captured sign, and X5 does not revisit that.
--   * NO change to the structured/XML branch, which already corroborates structurally.
--   * NO change to `_assert_supplier_bill_shape_at` — the supplier floor's exact
--     `sst_purchase_cost = tax_total` tie is untouched.
--   * NO grant change, NO new errcode, NO new field_path, NO widening of the closed
--     component taxonomy 0022 fixed.
--   * NO relaxation of any surviving wall. On a document that does not state a full
--     breakdown, the new predicate is strictly NARROWER than the one it replaces: it now
--     requires net AND tax to be present where before it required neither.
--
-- THE EXPECTED BLAST RADIUS, measured before writing this (corpus-yield-2026-07-27.md):
-- across 21 re-extracted real documents the corpus produced `total_excl_tax` x3 and
-- `tax_total` x1. Almost nothing flips, and that is the correct outcome — most legacy
-- supplier bills print a single total, state no arithmetic, and therefore prove nothing that
-- an identity could check. Refusal-to-human stays the default; corroboration becomes
-- possible only where the document does the work.

-- §0 — THE QUIESCE GUARD. Runs FIRST, before any DDL in this file.
-- =====================================================================
--
-- WHY IT IS HERE AGAIN. This migration replaces `execute_rule_post` by change-of-record for
-- the second time in the slice, and the D1 rule has not changed: a call already inside the
-- OLD body finishes on the OLD body. The tail at the bottom of this file cannot see such a
-- call and the CoR cannot reach it. What closes the window is that no executor call is
-- running when the CoR commits — and at 0023 the stakes are higher than at 0022, because the
-- body being installed is the one that can POST. A ceremony step that lives only in prose is
-- one somebody eventually skips at 2am, so the migration refuses instead.
--
-- The threshold and the safety argument are 0022's, unchanged and re-verified: the control
-- component beats every `CLARA_CTL_POLL_MS` (default 2000ms) and the runtime calls a beat
-- stale at `CLARA_HEARTBEAT_STALE_MS` (default 30000ms), so 90 seconds is 45x the write
-- cadence and 3x the runtime's own staleness bound. A fresh beat means the runtime is UP.
-- On a fresh database, on the reset-gated rig drills, and in CI the table is empty at this
-- point in the chain, so the guard cannot fire there; the one path it fires on is a live
-- project with the runtime running, which is the path it exists for.
do $quiesce$
declare v_component text; v_beat timestamptz;
begin
  -- FAIL CLOSED on absence, for 0022's reason: 0006 creates `runtime_heartbeats` and always
  -- precedes this file in the same ordered chain, so its absence is not a state the migration
  -- system can produce — it is catalog drift. Drift is precisely when the runtime may still
  -- be alive and unobservable: the control loop's heartbeat write would fail and be swallowed
  -- as a transient cycle error while the INDEPENDENT rule-post loop keeps calling the old
  -- body. Absent table = the guard is most needed and least able to see. Refuse.
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception '0023 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live';
  end if;
  select h.component, h.beat_at into v_component, v_beat
    from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds'
   order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception '0023 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this migration replaces execute_rule_post AND opens the anchor lane, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for heartbeat staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$quiesce$;

-- =====================================================================
-- §A — corroboration by agreement (`_invoice_fact_state_at`)
-- =====================================================================
--
-- CHANGE OF RECORD of the whole function. Everything outside the OCR branch is carried
-- forward verbatim from 0016 — the structured branch, the fact reads, the envelope assembly,
-- the conditional sales/SST appends — so a diff against 0016 shows exactly two regions: the
-- three component reads, and the OCR predicate.

create or replace function clara._invoice_fact_state_at(p_document uuid, p_extraction uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ext uuid; v_version int; v_total_count int; v_total_region uuid;
  -- 0023 (X5): `v_conf` is GONE, not merely unused. ADR-047 Q1 dropped vendor confidence
  -- from gating entirely, and a variable still being SELECTed into is an invitation for
  -- some later predicate to reach for it. Deleting the declaration and its read makes the
  -- claim checkable by the tail rather than merely true today.
  v_total bigint; v_locator text; v_currency text;
  v_due bigint; v_deposit bigint; v_hash text; v_ok boolean;
  v_locator_json jsonb; v_poly_ok boolean; v_ineligible text;
  v_invoice_id text; v_invoice_date text;
  v_engine text; v_net bigint; v_tax bigint; v_type text;
  v_customer text; v_customer_reg text; v_out jsonb;
  v_rounding bigint; v_breakdown text; v_bd bigint;
  v_net_c int; v_tax_c int; v_type_c int; v_bd_c int; v_round_c int;
  v_due_c int; v_deposit_c int;
  -- 0023 (X5): the three STATED COMPONENTS of the corrected identity. Read on this
  -- surface for the first time — 0022 deliberately kept them out of it because
  -- corroboration was X5's alone, and this is X5.
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
begin
  select e2.id, e2.version_n, nullif(btrim(e2.envelope->>'corroboration_ineligible'),''), e2.engine_id
    into v_ext, v_version, v_ineligible, v_engine
  from clara.document_extractions e2
  where e2.id = p_extraction and e2.document_id = p_document
    and e2.engine_kind = 'invoice_facts' and e2.status = 'done';
  if v_ext is null then return '{}'::jsonb; end if;

  select count(*)::int into v_total_count
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total';
  select id, monetary_cents, locator_kind, locator
    into v_total_region, v_total, v_locator, v_locator_json
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total'
  order by id limit 1;
  select upper(regexp_replace(coalesce(min(text_content),''), '[^A-Za-z]', '', 'g'))
    into v_currency from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.currency';
  -- FIX-5 v4 defense-in-depth: capture the region COUNT alongside due/deposit so a PRESENT
  -- region whose cents normalized to NULL (a malformed 'N/A' — the write boundary now refuses
  -- it, this is the read guard) can NEVER be min()-selected into "no due" / a defaulted-zero
  -- deposit and thereby corroborate. An ABSENT field (count 0) stays legitimately optional.
  select count(*)::int, min(monetary_cents) into v_due_c, v_due from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.amount_due';
  select count(*)::int, min(monetary_cents) into v_deposit_c, v_deposit from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.deposit';
  select nullif(btrim(min(text_content)),'') into v_invoice_id from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_id';
  select nullif(btrim(min(text_content)),'') into v_invoice_date from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_date';
  -- S6: additive sales / SST fact fields (all null for AP purchase docs). RESIDUAL-4:
  -- capture the region COUNT alongside each value so the structured corroboration can
  -- REJECT a conflicting duplicate instead of min()-selecting one away.
  select count(*)::int, min(monetary_cents) into v_net_c, v_net from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.total_excl_tax';
  select count(*)::int, min(monetary_cents) into v_tax_c, v_tax from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.tax_total';
  select count(*)::int, min(monetary_cents) into v_round_c, v_rounding from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.rounding';
  select count(*)::int, nullif(btrim(min(text_content)),'') into v_bd_c, v_breakdown from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.tax_breakdown';
  select count(*)::int, nullif(btrim(min(text_content)),'') into v_type_c, v_type from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.type_code';
  -- 0023 (X5): the stated components, carrying the SAME cardinality guard every other
  -- corroboration fact carries (RESIDUAL-4) — a conflicting duplicate must REJECT
  -- corroboration, never be min()-selected away.
  select count(*)::int, min(monetary_cents) into v_sc_c, v_sc from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.service_charge';
  select count(*)::int, min(monetary_cents) into v_disc_c, v_disc from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.discount';
  select count(*)::int, min(monetary_cents) into v_dlv_c, v_dlv from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.delivery';
  select nullif(btrim(min(text_content)),'') into v_customer from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.customer_name';
  select nullif(btrim(min(text_content)),'') into v_customer_reg from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.customer_registration';

  if v_total_region is not null then
    select clara._fact_hash(r.extraction_id, r.id, r.field_path, r.text_content,
      r.monetary_cents) into v_hash from clara.document_regions r where r.id = v_total_region;
  end if;
  -- W3: a total with no physical geometry (empty polygon array) can never reach
  -- Tier A. Persistence still stores such rows; they simply never corroborate.
  v_poly_ok := jsonb_typeof(v_locator_json->'polygon') = 'array'
    and jsonb_array_length(v_locator_json->'polygon') > 0;
  if v_engine like 'clara-%' then
    -- STRUCTURED Tier-A (§3.5, adversarial #4): a schema-parsed source corroborates
    -- WITHOUT geometry ONLY on COMPLETE stated facts + a tight arithmetic tie. Only
    -- the invoice type (EXPLICIT 01) corroborates the invoice-total equation; a
    -- missing type never defaults to 01; CN/DN (02/03) + self-billed carry their own
    -- ties in the shape floor but are corroboration-INELIGIBLE for the total here.
    -- Required: explicit type 01, gross, net AND tax (explicit zero tax counts);
    -- net + tax + rounding = gross; and (when present) the per-type breakdown SUMS to
    -- tax_total (a mis-summed / unparseable breakdown yields the -1 sentinel ⇒ fails).
    v_bd := clara._tax_breakdown_cents(v_breakdown);
    -- RESIDUAL-4: (a) SINGLE cardinality on EVERY corroboration fact (type, gross, net,
    -- tax, breakdown, rounding) — a conflicting DUPLICATE region REJECTS corroboration
    -- rather than being min()-selected away (mirrors the single-gross v_total_count=1
    -- check); (b) a positive-tax document MUST carry a breakdown that sums to tax_total
    -- (the earlier `v_bd is null or ...` accepted a positive-tax doc with NO breakdown).
    v_ok := v_total_count = 1 and v_total is not null and v_total > 0
      and v_currency = 'MYR'
      and (v_due_c = 0 or (v_due is not null and v_due = v_total))
      and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))
      and v_ineligible is null
      and v_type = '01' and v_type_c = 1
      and v_net is not null and v_net_c = 1
      and v_tax is not null and v_tax_c = 1
      and v_round_c <= 1 and v_bd_c <= 1
      -- RESIDUAL v3 (item 4): a PRESENT rounding region whose value normalized to NULL is
      -- malformed — it must NOT be silently treated as zero. Fail corroboration (the write
      -- boundary in persist_invoice_facts already refuses it outright; this is the read guard).
      and (v_round_c = 0 or v_rounding is not null)
      and (v_net + v_tax + coalesce(v_rounding, 0)) = v_total
      and (v_bd is not null or v_tax = 0)     -- breakdown REQUIRED when tax_total > 0
      and (v_bd is null or v_bd = v_tax);     -- when present it must sum to tax_total
  else
    -- OCR/azure Tier-A, X5 (0023): CORROBORATION BY AGREEMENT.
    --
    -- WHAT LEFT. The 0.95 self-reported-confidence term — Azure's own opinion of its OCR — is
    -- GONE, and ADR-047 Q1 is why: a vendor's score is not a second reader, it is the same
    -- reader asserting that it feels sure. It passed 0 of 29 real documents (max 0.837)
    -- while the polygon and MYR walls passed 29/29, so it was not even measuring the thing
    -- its name claimed. It survives in the payload as diagnostic metadata and appears
    -- NOWHERE in this predicate.
    --
    -- WHAT ARRIVED. Two independent readings must AGREE ARITHMETICALLY. The agreement is
    -- structural rather than a similarity score, and it rests on three facts that are
    -- already true elsewhere:
    --   * the mapper reconciles its layout reader against Azure's typed fields BEFORE
    --     persisting (X2/X6) — a disagreement persists NOTHING, so any fact that survives
    --     to this table is one no reader contradicted;
    --   * `persist_invoice_facts` forfeits the WHOLE extraction on conflicting duplicates,
    --     so every field read here is single-valued — and the cardinality guards below
    --     re-prove that at READ time anyway, because a read guard that leans on a write
    --     guard is one migration away from being wrong;
    --   * therefore the identity tests whether INDEPENDENT fields — net, tax, the stated
    --     components, the gross — describe the same document. Figures read separately that
    --     sum exactly to the sen did not agree by luck.
    -- Every other wall stays exactly as it was: single gross, positive, page_polygon with a
    -- non-empty polygon, MYR, amount_due absent-or-equal, deposit absent-or-zero, and the
    -- ineligibility envelope. On any document that does not state a full breakdown this
    -- predicate is strictly NARROWER than the one it replaces.
    --
    -- WHY A NIL-TAX BILL NEVER CORROBORATES, deliberately: `v_tax is not null` requires the
    -- document to STATE its tax. The Gate-P vehicle prints a dash there (the amount is nil
    -- and OCR captured nothing at all), so it stays false — and that is correct. A document
    -- that does not state a tax has proven nothing about its tax, and unattended posting
    -- authority is not the place to infer a zero.
    v_ok := v_total_count = 1 and v_total is not null and v_total > 0
      and v_locator = 'page_polygon' and v_poly_ok
      and v_currency = 'MYR'
      and (v_due_c = 0 or (v_due is not null and v_due = v_total))
      and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))
      and v_ineligible is null
      and v_net is not null and v_net_c = 1
      and v_tax is not null and v_tax_c = 1
      -- A PRESENT-but-unreadable component must never arrive as a silent zero, and a
      -- duplicate must never be min()-selected away. Read guards mirroring the write
      -- boundary, for the reason given above.
      and v_round_c <= 1 and (v_round_c = 0 or v_rounding is not null)
      and v_sc_c <= 1 and (v_sc_c = 0 or v_sc is not null)
      and v_disc_c <= 1 and (v_disc_c = 0 or v_disc is not null)
      and v_dlv_c <= 1 and (v_dlv_c = 0 or v_dlv is not null)
      -- THE SIGN BELT, mirroring 0022's write boundary and its anchor-lane twin. The identity
      -- SUBTRACTS the discount, so a negative one turns that subtraction into an addition and
      -- forges a larger gross that ties exactly. Refusing here means the identity cannot be
      -- satisfied by a component that arrived along some other path.
      and coalesce(v_sc, 0) >= 0 and coalesce(v_disc, 0) >= 0 and coalesce(v_dlv, 0) >= 0
      -- THE CORRECTED IDENTITY (X3's closed taxonomy, 0022): absent components coalesce to
      -- zero because they were not printed; the discount subtracts; the sum must equal the
      -- stated total EXACTLY.
      and (v_net + coalesce(v_sc, 0) + coalesce(v_dlv, 0) + v_tax + coalesce(v_rounding, 0)
           - coalesce(v_disc, 0)) = v_total;
  end if;
  v_out := jsonb_build_object(
    'extraction_id', v_ext, 'version_n', v_version,
    'total_region_id', v_total_region, 'total_cents', v_total,
    'total_fact_hash', v_hash, 'currency', nullif(v_currency,''),
    'invoice_id', v_invoice_id, 'invoice_date', v_invoice_date,
    'corroboration_ineligible', v_ineligible,
    'corroborated', v_ok,
    'explicit_non_myr', nullif(v_currency,'') is not null and v_currency <> 'MYR'
  );
  -- Append the sales/SST fields ONLY when present, so an AP purchase bill's output
  -- is byte-identical to as-built (review M3, rig exact-diff on the RPR corpus).
  if v_net is not null then v_out := v_out || jsonb_build_object('total_excl_tax_cents',v_net); end if;
  if v_tax is not null then v_out := v_out || jsonb_build_object('tax_total_cents',v_tax); end if;
  if v_rounding is not null then v_out := v_out || jsonb_build_object('rounding_cents',v_rounding); end if;
  if v_type is not null then v_out := v_out || jsonb_build_object('type_code',v_type); end if;
  if v_customer is not null then v_out := v_out || jsonb_build_object('customer_name',v_customer); end if;
  if v_customer_reg is not null then v_out := v_out || jsonb_build_object('customer_registration',v_customer_reg); end if;
  return v_out;
end $$;
revoke all on function clara._invoice_fact_state_at(uuid,uuid) from public;

-- =====================================================================
-- §B — the anchor lane opens (`execute_rule_post`)
-- =====================================================================
--
-- CHANGE OF RECORD of the whole executor, carried forward verbatim from 0022 with ONE
-- deletion: the unconditional leading disjunct in the (c) anchor block. Every other
-- condition, every skip reason, every ordering is byte-identical — which matters, because
-- the two controls that block SHADOWED while the disjunct was armed become reachable again
-- and must be exactly the controls 0016 wrote.

create or replace function clara.execute_rule_post(p_entry uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
  v_net bigint; v_round bigint; v_inv_id text; v_inv_date text;
  v_kind_doc text; v_fx uuid; v_sup_reg text; v_sup_name text;
  v_cust_reg text; v_cust_taxid text; v_cust_name text; v_client_name text;
  v_hard_ok boolean; v_name_ok boolean; v_buyer_hit boolean;
  v_due_c int; v_due_amt bigint; v_skips int; v_suspended boolean:=false;
  v_doc_lane text; v_doc_class text; v_verdict jsonb; v_lane_n int;
  v_cust_name_raw text; v_cust_reg_raw text; v_buyer_fp jsonb; v_buyer_id uuid;
  v_fseen int; v_fdocs int; v_fspan int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into e from clara.journal_entries where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;

  if e.status<>'draft' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_a_draft');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
  end if;
  if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_eligible_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_eligible_shape');
  end if;

  -- ADV-R2 (R1#1): ONE BOUND EXTRACTION per document per post, resolved BEFORE
  -- the direction step (direction itself consumes the doc's facts). A document
  -- with done facts in BOTH lanes (a historical OCR pass beside a later XML
  -- parse) is inherently ambiguous evidence — a named visible skip, never a
  -- coin-flip between potentially disagreeing extractions. With exactly one
  -- done lane the extraction is bound ONCE (v_fx) and every consumer — the
  -- direction, the class check, the fact state, and every envelope field —
  -- reads that SAME single-lane extraction.
  select count(distinct t.lane)::int into v_lane_n
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done';
  if v_lane_n>1 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'evidence_lane_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','evidence_lane_ambiguous');
  end if;
  select t.lane,x.id into v_doc_lane,v_fx
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done'
    order by t.version_n desc,t.id desc limit 1;
  -- ADV-R4#1: ZERO done lanes = facts-absent — a named skip BEFORE direction.
  -- The post path NEVER proceeds unpinned: a later/concurrent extraction commit
  -- could otherwise be picked up mid-post by the live selectors.
  if v_fx is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'facts_missing');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','facts_missing');
  end if;

  -- direction (client-aware, pinned to the ONE bound extraction — ADV-R3#1) —
  -- an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction_at(e.document_id,e.client_id,v_fx);
  exception when sqlstate 'CLR30' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'direction_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','direction_unresolved');
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_ambiguous');
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_unresolved');
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- match + LOCK the live autopost rule (count-and-post atomic per rule).
  select * into r from clara.coding_rules
    where client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live'
    for update;
  if not found then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'no_live_rule');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_live_rule');
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'high_stakes');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','high_stakes');
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','cn_not_autopostable');
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'purchase_sst_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','purchase_sst_not_autopostable');
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2). 0016: an
  --       sst_purchase_cost leg is never sanctioned either — the named skip above fires
  --       first on a purchase; on a sales draft it lands here as an outside leg.
  -- (v_fx/v_doc_lane were bound ONCE at the top of the fn — ADV-R2 R1#1.)
  v_state := case when v_fx is null then '{}'::jsonb
    else clara._invoice_fact_state_at(e.document_id,v_fx) end;
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'control_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','control_shape');
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'account_mismatch');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','account_mismatch');
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'over_cap');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','over_cap');
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'window_exhausted');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','window_exhausted');
  end if;
  if r.expires_at<=now() then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'expired');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','expired');
  end if;
  if e.revision_token is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'no_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_revision');
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'not_corroborated');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_corroborated');
  end if;

  -- ADV-1: the DOCUMENT's ACTUAL evidence class, derived from its latest done
  -- facts task lane (the local no-egress MyInvois parse = 'structured'; the
  -- Azure OCR lane = 'ocr_sales') — NEVER from the rule label alone. A signed
  -- class that does not match the document's real extraction source is a named
  -- visible skip: an OCR document can never ride a 'structured' rule around
  -- the envelope, and an XML document never consumes an OCR authority.
  if v_direction='sales' then
    -- ADV-R2 (R1#1): the class derives from the ONE BOUND lane resolved above
    -- (v_doc_lane rides the same single resolution as v_fx and v_state).
    v_doc_class:=case v_doc_lane when 'local_facts' then 'structured'
                                 when 'invoice_facts' then 'ocr_sales' end;
    if v_doc_class is null or v_doc_class is distinct from r.evidence_class then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','evidence_class_mismatch','document_class',v_doc_class,
        'rule_class',r.evidence_class);
    end if;
  end if;

  -- 0016 §3.3: the OCR compensating-control envelope, RE-DERIVED at post time
  -- (control 8 — no trust in signing-time state).
  if v_direction='sales' and r.evidence_class='ocr_sales' then
    -- (a) positive polarity evidence (ADV-3: a done classifier row is not by
    -- itself positive evidence — the WINNING verdict must POSITIVELY say
    -- 'invoice'): the human correction outranks classifier verdicts; among
    -- classifier rows the newest version wins; the verdict must be
    -- high-confidence (>=0.8, never low_confidence) or human, and must agree
    -- with the CURRENT document_kind.
    select d2.document_kind into v_kind_doc from clara.documents d2 where d2.id=e.document_id;
    select x.envelope into v_verdict from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='doc_classify'
        and x.status='done'
      order by case when x.envelope->>'source'='human' then 0 else 1 end,
        x.version_n desc limit 1;
    if v_kind_doc is distinct from 'invoice'
       or v_verdict is null
       or (v_verdict->>'verdict_kind') is distinct from 'invoice'
       or coalesce((v_verdict->>'low_confidence')::boolean,false)
       or not ((v_verdict->>'source')='human'
               or coalesce((v_verdict->>'confidence')::numeric,0)>=0.8) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','polarity_unverified','rule_suspended',v_suspended);
    end if;
    -- (b) hard direction evidence — every field reads the ONE BOUND extraction
    -- (v_fx, resolved once above; ADV-R2 R1#1).
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_name';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_taxid from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_taxid';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=e.client_id;
    v_hard_ok:=v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg);
    v_name_ok:=v_sup_name is not null and (v_sup_name=v_client_name
      or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
          and al.retired_at is null and al.alias_normalized=v_sup_name));
    v_buyer_hit:=
      (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_reg))
      or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_taxid))
      or (v_cust_name is not null and (v_cust_name=v_client_name
        or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
            and al.retired_at is null and al.alias_normalized=v_cust_name)));
    if not (v_hard_ok and v_name_ok) or v_buyer_hit then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'direction_unproven');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','direction_unproven','rule_suspended',v_suspended);
    end if;
    -- (b2) ADV-4: stated-buyer <-> signed-counterparty CONGRUENCE. Control (b)
    -- proves only that the buyer is NOT the client; the invoice's stated buyer
    -- must ALSO resolve (kind-scoped, no birth ever) to the SAME canonical
    -- customer the signed rule names — an invoice billing Buyer B can never be
    -- posted through Customer A's authority. Absence, ambiguity, birth, or a
    -- registration contradiction is a named visible skip.
    select nullif(btrim(min(dr.text_content)),'') into v_cust_name_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select nullif(btrim(min(dr.text_content)),'') into v_cust_reg_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    v_buyer_id:=null;
    if v_cust_name_raw is not null then
      begin
        v_buyer_fp:=clara._resolve_counterparty(e.client_id,jsonb_strip_nulls(
          jsonb_build_object('kind','customer','new',jsonb_build_object(
            'name',v_cust_name_raw,'registration_no',v_cust_reg_raw))));
        if v_buyer_fp is not null and v_buyer_fp->>'decision'<>'birth'
           and (v_buyer_fp->>'counterparty_id') is not null then
          v_buyer_id:=clara._canonical_counterparty(e.client_id,
            (v_buyer_fp->>'counterparty_id')::uuid);
        end if;
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' then
        v_buyer_id:=null; -- ambiguity/contradiction => mismatch below
      end;
    end if;
    if v_buyer_id is null
       or v_buyer_id is distinct from clara._canonical_counterparty(e.client_id,r.counterparty_id) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','buyer_mismatch');
    end if;
    -- (c) full multi-anchor corroboration.
    v_net:=nullif(v_state->>'total_excl_tax_cents','')::bigint;
    v_round:=nullif(v_state->>'rounding_cents','')::bigint;
    v_inv_id:=nullif(v_state->>'invoice_id','');
    v_inv_date:=nullif(v_state->>'invoice_date','');
    select count(*)::int,min(dr.monetary_cents) into v_due_c,v_due_amt
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.amount_due';
    -- 0022 (X3): the stated components of the corrected identity, read off the SAME bound
    -- extraction as every other anchor field.
    select count(*)::int,min(dr.monetary_cents) into v_sc_c,v_sc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.service_charge';
    select count(*)::int,min(dr.monetary_cents) into v_disc_c,v_disc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.discount';
    select count(*)::int,min(dr.monetary_cents) into v_dlv_c,v_dlv
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.delivery';
    -- 0023 (X5): THE DARK DISJUNCT IS GONE. It was an unconditional leading term that held
    -- this whole block true, keeping the OCR-sales anchor lane structurally shut while X2
    -- taught the mapper to emit net and tax. Deleting it is the deliberate act 0022's §D
    -- reserved for this migration and no other. NOTE THE WORDING: the marker string 0022 used
    -- must not appear anywhere in this body — nor the disjunct's own text — because the test
    -- harness detects the guard by grepping prosrc for the marker, and 0022's tail matches the
    -- disjunct over comment-stripped source. A comment SAYING the guard is gone would report
    -- it ARMED while the lane ran open, which is the worst of both. Every condition below is
    -- byte-identical to 0022's,
    -- and the two controls the block SHADOWED while it was armed — `customer_unresolved` at
    -- (d) and `floor_lost` at (e2) — become reachable again for the first time.
    if v_gross is null or v_inv_id is null or v_inv_date is null
       or v_net is null or v_tax is null
       or (v_sc_c>0 and v_sc is null) or (v_disc_c>0 and v_disc is null)
       or (v_dlv_c>0 and v_dlv is null)
       -- The sign belt, mirroring the shape floor (adversarial round 1 — FATAL): a
       -- NEGATIVE discount turns the identity's subtraction into an addition and forges
       -- a larger gross that ties. The write boundary refuses one; this makes the anchor
       -- lane refuse one too, so removing the dark guard at X5 cannot open on a forged
       -- identity even if a component arrived by some other path.
       or coalesce(v_sc,0)<0 or coalesce(v_disc,0)<0 or coalesce(v_dlv,0)<0
       or (v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)
           -coalesce(v_disc,0))<>v_gross
       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'anchor_missing');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','anchor_missing');
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','customer_unresolved');
    end if;
    -- (e2) ADV-5: the sighting FLOOR re-derived atomically at post time, under
    -- the client serialization lock (the same advisory lock the approve core
    -- takes — reentrant in this transaction, so a concurrent reversal cannot
    -- slip between the floor check and the post). Evidence reversed since
    -- signing strips the live authority: a named visible skip.
    perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan
      from clara._ocr_sales_floor(e.client_id,
        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'floor_lost');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','floor_lost');
    end if;
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id,
        'bound_extraction',v_fx),
      p_entry,e.revision_token,null,p_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'not_a_draft');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','type_polarity_mismatch');
    when sqlstate 'CLR06' then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'stale_revision');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','stale_revision');
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total,
        'evidence_class',r.evidence_class))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  return jsonb_build_object('entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
end $$;

alter function clara.execute_rule_post(uuid,text) owner to clara_fn_owner;

-- ---------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
--
-- THE HONEST FRAMING, carried from 0022: these are BELT. The primary instruments are
-- BEHAVIOURAL — the rig's exact-diff drives real extraction shapes through the real fact
-- state and proves which flip, and x1-anchor drives the real executor. These probes exist so
-- that an APPLY onto a drifted catalog refuses, not to stand in for the cells.
-- ---------------------------------------------------------------------------
do $tail$
declare v_src text; v_code text; v_acl text;
begin
  -- (1) §A — the confidence term is GONE from the executable text, and the identity is there.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  if v_src is null then
    raise exception '0023 tail: _invoice_fact_state_at is GONE';
  end if;
  -- COMMENT-STRIPPED, for 0022's demonstrated reason: a probe that cannot tell code from a
  -- comment about code proves nothing. The header above DISCUSSES the removed confidence
  -- term by name, so a raw-prosrc probe for its absence would fail on this very file.
  v_code := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('v_conf' in v_code) > 0 then
    raise exception '0023 tail: a confidence term survives in the EXECUTABLE text of _invoice_fact_state_at — ADR-047 Q1 dropped vendor confidence from gating ENTIRELY';
  end if;
  -- The corrected identity, fused so it cannot be satisfied by a fragment.
  if position('v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_rounding,0)-coalesce(v_disc,0))=v_total'
       in v_code) = 0 then
    raise exception '0023 tail: the corrected component identity is absent from the OCR corroboration branch';
  end if;
  -- The sign belt, without which a negative discount forges a larger gross that ties.
  if position('coalesce(v_sc,0)>=0andcoalesce(v_disc,0)>=0andcoalesce(v_dlv,0)>=0' in v_code) = 0 then
    raise exception '0023 tail: the component sign belt is absent from the corroboration branch';
  end if;
  -- Presence + cardinality on the two fields the identity cannot be evaluated without.
  if position('v_netisnotnullandv_net_c=1' in v_code) = 0
     or position('v_taxisnotnullandv_tax_c=1' in v_code) = 0 then
    raise exception '0023 tail: net/tax presence-with-cardinality is missing from the corroboration branch';
  end if;
  -- The surviving walls. Removing any of these would be a widening this migration did not
  -- ask for, and the whole claim is that X5 NARROWS the OCR branch.
  if position('v_locator=''page_polygon''andv_poly_ok' in v_code) = 0
     or position('v_currency=''MYR''' in v_code) = 0
     or position('v_ineligibleisnull' in v_code) = 0
     or position('v_total_count=1andv_totalisnotnullandv_total>0' in v_code) = 0 then
    raise exception '0023 tail: an OCR Tier-A wall that predates X5 has been lost';
  end if;
  -- THE STRUCTURED BRANCH IS UNTOUCHED. Its identity is a DIFFERENT equation (net + tax +
  -- rounding = gross, with the type-01 and breakdown terms); if it drifted, X5 has reached
  -- past its own scope.
  if position('v_type=''01''andv_type_c=1' in v_code) = 0
     or position('(v_net+v_tax+coalesce(v_rounding,0))=v_total' in v_code) = 0
     or position('v_bdisnotnullorv_tax=0' in v_code) = 0 then
    raise exception '0023 tail: the STRUCTURED corroboration branch was disturbed — X5 changes the OCR branch alone';
  end if;

  -- (2) §B — the dark disjunct is GONE, and the full 0016 gate vocabulary survives.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception '0023 tail: execute_rule_post is GONE';
  end if;
  v_code := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  -- The exact fused sequence 0022's tail REQUIRED must now be absent. Matched over
  -- comment-stripped text for the same reason it was matched that way when it was required.
  if position('iftrueorv_grossisnullorv_inv_idisnullorv_inv_dateisnull' in v_code) > 0 then
    raise exception '0023 tail: the X4 dark disjunct is STILL in execute_rule_post — X5 exists to remove it';
  end if;
  -- And the condition it guarded must still be there, minus that one term. This is the
  -- difference between "the guard was removed" and "the anchor block was removed".
  if position('ifv_grossisnullorv_inv_idisnullorv_inv_dateisnull' in v_code) = 0 then
    raise exception '0023 tail: the anchor block''s own conditions are gone — X5 removes a disjunct, not the block';
  end if;
  -- The identity and the sign belt inside the anchor lane, unchanged from 0022.
  if position('v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)-coalesce(v_disc,0))<>v_gross'
       in v_code) = 0 then
    raise exception '0023 tail: the anchor lane lost 0022''s corrected identity';
  end if;
  -- THE SHADOWED CONTROLS. While the disjunct was armed, (d) customer_unresolved and (e2)
  -- floor_lost were present but unreachable through the executor. They are now reachable and
  -- must still be exactly what 0016 wrote — the whole point of removing the guard is that
  -- these walls resurface, not that they vanish with it.
  if position('customer_unresolved' in v_src) = 0 or position('floor_lost' in v_src) = 0 then
    raise exception '0023 tail: a control that was SHADOWED by the dark disjunct did not resurface with it';
  end if;
  -- The D-P6 sentinel vocabulary, re-asserted because this migration rewrites the whole body.
  if position('anchor_missing' in v_src)=0 or position('not_corroborated' in v_src)=0
     or position('cn_not_autopostable' in v_src)=0
     or position('purchase_sst_not_autopostable' in v_src)=0
     or position('polarity_unverified' in v_src)=0 or position('direction_unproven' in v_src)=0
     or position('buyer_mismatch' in v_src)=0
     or position('evidence_class_mismatch' in v_src)=0
     or position('suspended_pending_resignature' in v_src)=0
     or position('v_outside_legs' in v_src)=0
     or position('pg_exception_detail' in lower(v_src))=0 then
    raise exception '0023 tail: execute_rule_post lost a named skip / retained 0016 gate';
  end if;

  -- (3) THE EXECUTOR'S CALLER SET, PINNED — 0022's assertion, re-run because the §0 ceremony
  -- rests on it and this file replaces the executor again. Both directions: a WIDENED set
  -- silently invalidates the quiesce argument, an EMPTIED one means the product is dark and
  -- the pin is vacuous.
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
    raise exception '0023 tail: execute_rule_post has unexpected EXECUTE grantee(s): % — the quiesce ceremony assumes clara-runtime is its ONLY caller',
      v_acl;
  end if;
  if not exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                  where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure
                    and a.privilege_type = 'EXECUTE'
                    and pg_get_userbyid(a.grantee) = 'clara_runtime_login') then
    raise exception '0023 tail: execute_rule_post has LOST its only sanctioned caller (clara_runtime_login)';
  end if;

  -- (4) THE SUPPLIER FLOOR AND THE COMPONENT WRITE BOUNDARY ARE UNTOUCHED. X5 is a
  -- corroboration change; if either of these moved, something rode along.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  if v_src is null or position('sst_purchase_cost' in v_src) = 0
     or position('amount_override' in v_src) = 0 then
    raise exception '0023 tail: the supplier-bill floor was disturbed';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('r.field_pathin(''invoice.service_charge'',''invoice.discount'',''invoice.delivery'')andr.monetary_cents<0'
       in v_code) = 0 then
    raise exception '0023 tail: persist_invoice_facts lost its non-negative component guard';
  end if;

  -- (5) NO NEW CAPABILITY. X5 opens a lane; it must not hand anyone a new key to it.
  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('execute_rule_post', '_invoice_fact_state_at')) then
    raise exception '0023 tail: a corroboration/posting function leaked into the wake allowlist';
  end if;
end
$tail$;
