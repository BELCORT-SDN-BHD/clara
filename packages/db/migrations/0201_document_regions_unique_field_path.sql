-- 0201_document_regions_unique_field_path — #778: ONE REGION PER (extraction_id, field_path).
-- =====================================================================================
-- Spec of record: issue #778 (body + the Agent Brief comment of 2026-09-14). Measured in
-- docs/plan/active/refresh-wave-2026-09-14/reports/624-review-closure.md NOTE 2 ("Two `<c r=\"A1\">`
-- in one sheet still emit `sheets.0.A1` twice — no unique index on `(extraction_id, field_path)`")
-- and reports/624-fixround.md O1. Domain words: CONTEXT.md — "Field path".
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. clara.document_regions gains a UNIQUE key at
-- (extraction_id, field_path), and the two writers that can actually reach that key resolve a
-- same-key conflict deterministically — the second write is ABSORBED, never a silent second row
-- and never an uncaught unique violation escaping to the caller.
--
-- WHAT WAS WRONG. 0007_document_pipeline.sql:221 created `ix_document_regions_extraction` over
-- exactly that pair and created it NON-unique; no later migration added a key there. Three live
-- writers insert into the table and none of them deduplicated:
--
--   * clara.persist_document_extraction (body last cut in 0123, spliced by 0191) loops over the
--     region array it is handed and does a plain insert per element. Two `<c>` elements in one
--     XLSX sheet that both declare `r="A1"` both resolve to `sheets.0.A1` — a path
--     clara._assert_field_path explicitly admits, and which packages/runtime/lib/structured-
--     worker.mjs's sheetCellRegion builds as `sheets.${sheetIndex}.${cell.ref}` — so each passed
--     grammar validation independently and landed as its own row silently claiming one cell.
--   * clara.persist_invoice_facts (0026 body; no later recut — the pre-image sha is pinned in the
--     prestate below) loops over `p_fields` with no dedup, while its own conflict guard
--     deliberately TOLERATES repeats: it forfeits the extraction when a field appears twice with
--     DIFFERING values and lets identical duplicates collapse. A payload carrying the same
--     `invoice.total` twice was accepted and wrote two rows at one key.
--   * clara.persist_witness_facts (0095) is duplicate-free BY CONSTRUCTION — its belt loop is
--     `foreach v_f in array v_belt loop` over an array of distinct field names and its optional
--     loop selects `distinct on (c.field_path)` — so it needs NO change. §S4 below asserts both
--     lines off the installed body rather than trusting this paragraph.
--
-- THE MERGE ARM CANNOT BE AN UPDATE, and that is a property of the table rather than a choice.
-- clara.document_regions is append-only: `t_document_regions_append_only` fires BEFORE UPDATE OR
-- DELETE and clara._tf_append_only raises CLR08 unconditionally, so `on conflict ... do update`
-- would be refused by the table's own belt. Merge here means ABSORBING the second write
-- (`on conflict ... do nothing`), keeping the FIRST row's evidence. Recutting the append-only
-- trigger to make an UPDATE-style merge possible is explicitly out of this ticket's scope.
--
-- THE ABSORB MUST NOT SILENCE A REFUSAL, which is the one place this file does more than add
-- `on conflict`. persist_invoice_facts' post-loop conflict guard detects a disagreeing duplicate
-- by counting DISTINCT values among the rows already stored at one field_path. Once the key
-- absorbs the second row that guard can never see two rows again, so the disagreement would have
-- gone SILENT — the opposite of what #778 asks for. The splice in §S3 therefore re-raises exactly
-- that refusal, with the same message and the same errcode, at the point of the absorb, using the
-- same monetary/text predicates the post-loop guard uses. Identical repeats still collapse.
--
-- THE PRESTATE REFUSES RATHER THAN FOLDS. The table is APPEND-ONLY, so folding a pre-existing
-- duplicate means DELETING evidence, and this file will not do that silently on a deployed
-- estate. If any duplicate sits at the key the cutover is REFUSED with the count named. The
-- one-off fold a release session may choose to run is in §R, not in the body.
--
-- NULLS ARE DELIBERATELY NOT CONSTRAINED. clara.document_regions.field_path is nullable by design
-- (0191 §S5: "a region without a named field is legitimate evidence"), and NULLs are DISTINCT in a
-- btree unique index, so a plain unique index leaves null-path regions free to repeat. The key
-- narrows NAMED fields only, which is exactly the claim #778 makes.
--
-- RISK, STATED. §S2 and §S3 replace the LIVE bodies of two functions on the ingest path. Both use
-- the 0177/0191 ceremony on this same function family: a pre-image sha256 pin, a single-anchor
-- splice of pg_get_functiondef's own rendering (so header, SECURITY DEFINER and search_path are
-- carried verbatim), an owner/ACL post-check and a POST-IMAGE sha pin. APPLY DURING THE
-- REPOSITORY'S REQUIRED WRITER-QUIESCENCE WINDOW for function-body replacement: a persist running
-- THROUGH the swap runs on whichever body it started with. clara.control_witnesses is empty, so no
-- reviewed `prosrc_sha` row is owed. ROLLBACK is a NEW append-only migration restoring the prior
-- bodies and dropping the key; an applied migration is never edited (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE CHANGES AT RUNTIME:
--
--   clara.persist_document_extraction  — NONE. A duplicate region is absorbed; every existing
--                                        refusal (CLR10 grammar / attribution allowlist, CLR31
--                                        opening-fact arms, CLR16, CLR35) is untouched.
--   clara.persist_invoice_facts        — NONE NEW. CLR10 'invoice-facts payload carries
--                                        conflicting duplicate facts for a single field' is now
--                                        ALSO raised from inside the region loop, which is where
--                                        the absorb would otherwise have hidden it. Same message,
--                                        same errcode, same forfeiture.
--   clara.persist_witness_facts        — untouched.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE — every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $dru_pre$
declare
  v_src text;
  v_dupe_keys bigint;
  v_dupe_rows bigint;
  v_sample text[];
begin
  -- (a) IDEMPOTENCY. This file is not a re-apply.
  if exists (
    select 1 from pg_index ix
     where ix.indrelid = 'clara.document_regions'::regclass
       and ix.indisunique
       and pg_get_indexdef(ix.indexrelid) like '%(extraction_id, field_path)%'
  ) then
    raise exception 'dru prestate: a UNIQUE index at (extraction_id, field_path) already exists -- this file has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (b) THE 0007 STRUCTURE THIS FILE BUILDS ON. The plain index this key sits beside, the
  -- append-only belt that forbids the UPDATE arm, and 0191's deferred region-side fact belt: all
  -- three must survive this file, so all three are measured BEFORE it.
  if to_regclass('clara.ix_document_regions_extraction') is null then
    raise exception 'dru prestate: 0007''s ix_document_regions_extraction is absent -- the estate this file was written against has moved'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='clara.document_regions'::regclass and tgname='t_document_regions_append_only') then
    raise exception 'dru prestate: t_document_regions_append_only is absent -- the append-only property this file''s merge arm depends on is not in force'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='clara.document_regions'::regclass and tgname='t_document_regions_fact_validate') then
    raise exception 'dru prestate: 0191''s t_document_regions_fact_validate is absent -- this file must not be applied below the 0191 frontier'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._assert_field_path(text)') is null then
    raise exception 'dru prestate: clara._assert_field_path is absent -- this file must not be applied below the 0191 frontier'
      using errcode = 'CLR10';
  end if;

  -- (c) THE TWO BODIES THIS FILE RECUTS are the ones it was written against. The
  -- persist_document_extraction pin is 0191's OWN POST-IMAGE sha (0191:660), which is the whole
  -- reason that file pinned it: the NEXT recut gets to pin a pre-image somebody measured.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'dru prestate: clara.persist_document_extraction is absent' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      '0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905' then
    raise exception 'dru prestate: persist_document_extraction body is at sha % -- this file expects 0191''s post-image body and WILL NOT splice a body nobody measured',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     <> 'clara_fn_owner'::regrole then
    raise exception 'dru prestate: persist_document_extraction has an unexpected owner' using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'dru prestate: clara.persist_invoice_facts is absent' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      '996eb9d628cbf2143e9a66ee72d78c46bd3af69ba7c519ce68a9cff258cc3814' then
    raise exception 'dru prestate: persist_invoice_facts body is at sha % -- this file expects the 0026 body (no later recut was found when it was written)',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
     <> 'clara_fn_owner'::regrole then
    raise exception 'dru prestate: persist_invoice_facts has an unexpected owner' using errcode = 'CLR10';
  end if;

  -- (d) THE CUTOVER SAFETY CHECK, and it is the load-bearing one. A duplicate ALREADY stored at
  -- the key cannot be folded by this file: clara.document_regions is APPEND-ONLY, so folding is
  -- DELETING EVIDENCE, and doing that inside a migration would destroy an auditable row on an
  -- operator's behalf without the operator ever seeing it. REFUSE, name the count, and leave the
  -- fold to a release session running §R deliberately.
  select count(*), coalesce(sum(n), 0) into v_dupe_keys, v_dupe_rows
    from (select r.extraction_id, r.field_path, count(*) as n
            from clara.document_regions r
           where r.field_path is not null
           group by 1, 2
          having count(*) > 1) s;

  if coalesce(v_dupe_keys, 0) > 0 then
    select coalesce(array_agg(t order by t), array[]::text[]) into v_sample
      from (select (r.extraction_id::text || ' ' || r.field_path) as t
              from clara.document_regions r
             where r.field_path is not null
             group by r.extraction_id, r.field_path
            having count(*) > 1
             limit 10) q;
    raise exception 'dru prestate: % (extraction_id, field_path) key(s) already carry more than one region, across % row(s) -- the cutover is REFUSED. clara.document_regions is APPEND-ONLY, so this file will not fold them for you: run the census and the one-off fold in this file''s release note (§R) in a release session, record what was removed, then re-apply. First ten keys: %',
      v_dupe_keys, v_dupe_rows, v_sample using errcode = 'CLR10';
  end if;

  raise notice 'dru prestate: clean -- 0007''s index, the append-only belt and 0191''s fact belt are all in force, both writer bodies are at their pinned pre-images, and no (extraction_id, field_path) key carries more than one region.';
end $dru_pre$;

-- =====================================================================================
-- S1 — THE KEY. One region per named field per extraction.
--
-- A UNIQUE INDEX rather than a table CONSTRAINT, deliberately: it is the object `on conflict
-- (extraction_id, field_path)` infers directly, it can be dropped and rebuilt by a successor
-- migration without touching the table's constraint list, and it leaves 0007's
-- `ix_document_regions_extraction` in place unchanged (that index is what the extraction scans
-- read through, and this file adds a key rather than recutting 0007's access path).
-- =====================================================================================
set role clara_fn_owner;

create unique index uq_document_regions_extraction_field_path
  on clara.document_regions (extraction_id, field_path);

comment on index clara.uq_document_regions_extraction_field_path is
  'ONE region per (extraction_id, field_path) (#778). Two source cells resolving to one field path -- two `<c r="A1">` in one XLSX sheet, or an invoice-facts payload naming one field twice -- must never leave two rows silently claiming it. NULL field_path is deliberately NOT constrained: nulls are distinct in a btree unique index, and a region without a named field is legitimate evidence (0191 S5). Every writer that can reach this key resolves the conflict with `on conflict ... do nothing`; the table is append-only, so absorbing the second write is the only merge it can express.';

reset role;

-- =====================================================================================
-- S2 — THE RECUT, one. clara.persist_document_extraction absorbs a same-key region.
--
-- The 0191 ceremony exactly, on the same function: read the live definition through
-- pg_get_functiondef so the header, SECURITY DEFINER and search_path are carried verbatim;
-- replace exactly ONE anchor, counted first; then post-check owner, ACL, DEFINER posture,
-- search_path, the whole-body sha and every pre-existing limb.
--
-- ONE CLAUSE IS ADDED, to the region loop's own insert. It is NOT a validation and it does not
-- move any existing gate: `clara._assert_field_path` still runs first (a malformed path is
-- refused before anything else is spent on it), the structured_parse attribution allowlist still
-- runs after it, and the opening-fact derivation is untouched. The absorb happens last, at the
-- insert, where the key lives.
-- =====================================================================================
do $dru_splice_pde$
declare
  v_def text;
  v_anchor text;
  v_replacement text;
  v_owner oid;
  v_acl aclitem[];
begin
  select p.proowner, p.proacl into v_owner, v_acl from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  v_anchor := $anchor$          v_opening_account,v_opening_amount,v_opening_side);
$anchor$;
  v_replacement := $replacement$          v_opening_account,v_opening_amount,v_opening_side)
        on conflict (extraction_id,field_path) do nothing;
$replacement$;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'dru splice: the region-insert anchor is not unique in persist_document_extraction'
      using errcode = 'CLR10';
  end if;

  v_def := replace(v_def, v_anchor, v_replacement);
  execute v_def;

  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     <> v_owner then
    raise exception 'dru splice poststate: persist_document_extraction owner moved' using errcode = 'CLR10';
  end if;
  if (select p.proacl from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     is distinct from v_acl then
    raise exception 'dru splice poststate: persist_document_extraction ACL moved' using errcode = 'CLR10';
  end if;
end $dru_splice_pde$;

do $dru_splice_pde_post$
declare
  v_src text;
  v_secdef boolean;
  v_config text;
begin
  select p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_src, v_secdef, v_config
    from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  -- THE POST-IMAGE SHA, PINNED, for the same reason 0191 pinned its own: the substring probes
  -- below say the splice did the right things, and only a whole-body hash says it did NOTHING
  -- ELSE. Measured on a PG17 rig whose pre-image was 0191's pinned post-image body.
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      'e528497e04e30d0a98f8a19e31102b2782ba642fb61b2efcb05a80151032f834' then
    raise exception 'dru splice poststate: persist_document_extraction body sha256 is % -- the splice produced a body nobody measured; do not trust the substring probes below it',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if position('on conflict (extraction_id,field_path) do nothing' in v_src) = 0 then
    raise exception 'dru splice poststate: the region-key conflict arm is absent' using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'on conflict (extraction_id,field_path) do nothing', '')))
       / length('on conflict (extraction_id,field_path) do nothing') <> 1 then
    raise exception 'dru splice poststate: the conflict arm was inserted more than once' using errcode = 'CLR10';
  end if;
  -- 0191's own limb census, re-run. A splice that quietly dropped one of these would be a
  -- security regression wearing a merge arm's clothes.
  if position($needle$perform clara._assert_field_path(elem->>'field_path');$needle$ in v_src) = 0
     or position('classify tasks are settled by classify_document' in v_src) = 0
     or position('persist_document_extraction only settles ocr/structured_parse tasks' in v_src) = 0
     or position('store-only tasks do not create extractions' in v_src) = 0
     or position('attribution_field_not_allowed' in v_src) = 0
     or position('firm_narrow_output_forbidden' in v_src) = 0
     or position($needle$v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;$needle$ in v_src) = 0
     or position('document.extraction_completed' in v_src) = 0
     or position('opening_extraction_fact_unverifiable' in v_src) = 0 then
    raise exception 'dru splice poststate: an existing gate or limb moved' using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'v_ekind:=', ''))) / length('v_ekind:=') <> 1 then
    raise exception 'dru splice poststate: v_ekind is no longer assigned exactly once' using errcode = 'CLR10';
  end if;
  -- The one UPDATE this body must never gain: an `on conflict ... do update` against
  -- document_regions would be refused by the table's own append-only belt at runtime.
  if position('do update' in v_src) > 0 then
    raise exception 'dru splice poststate: persist_document_extraction gained a DO UPDATE arm -- document_regions is append-only'
      using errcode = 'CLR10';
  end if;
  if v_secdef is not true or position('search_path=' in v_config) = 0 then
    raise exception 'dru splice poststate: SECURITY DEFINER or search_path did not carry over (config: %)', v_config
      using errcode = 'CLR10';
  end if;
end $dru_splice_pde_post$;

-- =====================================================================================
-- S3 — THE RECUT, two. clara.persist_invoice_facts absorbs an IDENTICAL repeat and still
-- forfeits a DISAGREEING one.
--
-- WHY THIS SPLICE IS LONGER THAN `on conflict`. The post-loop guard this writer already carries
-- (0026's own, widened by 0022/0052) detects a conflicting duplicate by counting DISTINCT values
-- among the rows STORED at one field_path:
--
--     having count(distinct coalesce(r.monetary_cents::text, chr(1))) > 1     -- the monetary set
--     having count(distinct coalesce(nullif(btrim(r.text_content),''), chr(1))) > 1  -- the text set
--
-- Once the key absorbs the second row there is only ever ONE row at a field_path, so that guard
-- can no longer fire and a payload stating two different totals would be accepted with the second
-- silently dropped. The clause below therefore compares the ABSORBED element against the row that
-- stood, with the SAME two predicates and the SAME sets, and raises the SAME refusal. Identical
-- repeats still collapse — which is the behaviour #778 requires this writer to keep.
--
-- `v_region` is assigned by the insert's RETURNING and read nowhere else in the body; with
-- `do nothing` it is NULL exactly when the element was absorbed, which is what the arm keys on.
-- =====================================================================================
do $dru_splice_pif$
declare
  v_def text;
  v_anchor text;
  v_replacement text;
  v_owner oid;
  v_acl aclitem[];
begin
  select p.proowner, p.proacl into v_owner, v_acl from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;

  v_anchor := $anchor$             then v_raw end,v_cents)
      returning id into v_region;
$anchor$;
  v_replacement := $replacement$             then v_raw end,v_cents)
      on conflict (extraction_id,field_path) do nothing
      returning id into v_region;
    if v_region is null then
      -- #778: the (extraction_id,field_path) key ABSORBED this element. An identical repeat
      -- collapses -- the behaviour this writer has always had -- but a DISAGREEING repeat must
      -- still forfeit the extraction, and the post-loop guard below can no longer see a second
      -- row to compare. Same sets, same predicates, same message, same errcode.
      if (v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
            'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
            'invoice.service_charge','invoice.discount','invoice.delivery')
          and (select coalesce(r.monetary_cents::text,chr(1)) from clara.document_regions r
                where r.extraction_id=v_ext and r.field_path=v_path)
              is distinct from coalesce(v_cents::text,chr(1)))
         or (v_path in ('invoice.type_code','invoice.currency','invoice.vendor_name',
            'invoice.vendor_registration','invoice.customer_name','invoice.customer_registration',
            'invoice.customer_taxid','invoice.contact_person','invoice.invoice_id',
            'invoice.invoice_date','invoice.tax_breakdown','invoice.myinvois_uuid',
            'invoice.myinvois_longid')
          and (select coalesce(nullif(btrim(r.text_content),''),chr(1)) from clara.document_regions r
                where r.extraction_id=v_ext and r.field_path=v_path)
              is distinct from coalesce(nullif(btrim(v_raw),''),chr(1))) then
        raise exception 'invoice-facts payload carries conflicting duplicate facts for a single field'
          using errcode='CLR10';
      end if;
    end if;
$replacement$;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'dru splice: the region-insert anchor is not unique in persist_invoice_facts'
      using errcode = 'CLR10';
  end if;

  v_def := replace(v_def, v_anchor, v_replacement);
  execute v_def;

  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
     <> v_owner then
    raise exception 'dru splice poststate: persist_invoice_facts owner moved' using errcode = 'CLR10';
  end if;
  if (select p.proacl from pg_proc p
       where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
     is distinct from v_acl then
    raise exception 'dru splice poststate: persist_invoice_facts ACL moved' using errcode = 'CLR10';
  end if;
end $dru_splice_pif$;

do $dru_splice_pif_post$
declare
  v_src text;
  v_secdef boolean;
  v_config text;
begin
  select p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_src, v_secdef, v_config
    from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;

  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      'f7c3e0303b53caa4a5e3c6b2071c57dd19323c0311cd481416e3e534caf8f05e' then
    raise exception 'dru splice poststate: persist_invoice_facts body sha256 is % -- the splice produced a body nobody measured',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'on conflict (extraction_id,field_path) do nothing', '')))
       / length('on conflict (extraction_id,field_path) do nothing') <> 1 then
    raise exception 'dru splice poststate: the region-key conflict arm is absent or duplicated in persist_invoice_facts'
      using errcode = 'CLR10';
  end if;
  -- The refusal this file had to keep alive, counted: the post-loop guard's copy AND the
  -- in-loop copy the absorb made necessary.
  if (length(v_src) - length(replace(v_src, 'conflicting duplicate facts for a single field', '')))
       / length('conflicting duplicate facts for a single field') <> 2 then
    raise exception 'dru splice poststate: the conflicting-duplicate refusal is no longer raised exactly twice (post-loop guard + the in-loop arm)'
      using errcode = 'CLR10';
  end if;
  -- The CLOSED allowlist and the rest of this writer's limbs, re-read from the installed body.
  if position('unsupported invoice field_path' in v_src) = 0
     or position('invoice-facts task is not running' in v_src) = 0
     or position('invoice-facts payload is malformed' in v_src) = 0
     or position($needle$on conflict (document_id,engine_id,version_n,engine_kind) do nothing$needle$ in v_src) = 0
     or position('clara._normalize_invoice_cents' in v_src) = 0 then
    raise exception 'dru splice poststate: an existing gate or limb moved in persist_invoice_facts' using errcode = 'CLR10';
  end if;
  -- 0191's ruling, still true: the two CLOSED allowlists never gained the grammar validator.
  if position('_assert_field_path' in v_src) > 0 then
    raise exception 'dru splice poststate: persist_invoice_facts gained clara._assert_field_path -- the closed allowlists stay closed (0191 S5)'
      using errcode = 'CLR10';
  end if;
  if position('do update' in v_src) > 0 then
    raise exception 'dru splice poststate: persist_invoice_facts gained a DO UPDATE arm -- document_regions is append-only'
      using errcode = 'CLR10';
  end if;
  if v_secdef is not true or position('search_path=' in v_config) = 0 then
    raise exception 'dru splice poststate: SECURITY DEFINER or search_path did not carry over (config: %)', v_config
      using errcode = 'CLR10';
  end if;
end $dru_splice_pif_post$;

-- =====================================================================================
-- S4 — THE WRITER THAT NEEDED NOTHING, confirmed by READING it rather than by assertion.
--
-- clara.persist_witness_facts writes regions on both of its arms, so the new key binds it too. It
-- needs no conflict arm because it cannot produce a duplicate: the belt arm iterates an ARRAY of
-- distinct field names, and the optional arm selects `distinct on (c.field_path)` over the
-- citation payload. Both lines are read off the installed body here, so a future change that
-- removed either one fails THIS file's successor rather than corrupting an ingest.
-- =====================================================================================
do $dru_witness$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_witness_facts(uuid,jsonb,jsonb,integer)'::regprocedure;
  if v_src is null then
    raise exception 'dru: clara.persist_witness_facts is absent' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      'e3264e052061ce41846fd882bdb1fe38fdfca56af50d46a0ae80b1c68da75539' then
    raise exception 'dru: persist_witness_facts is at sha % -- this file confirms the 0095 body is duplicate-free at source; a moved body must be re-read before that confirmation can stand',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if position('foreach v_f in array v_belt loop' in v_src) = 0 then
    raise exception 'dru: persist_witness_facts'' belt loop no longer walks an array of distinct field names -- it can now produce a duplicate at the new key'
      using errcode = 'CLR10';
  end if;
  if position('select distinct on (c.field_path)' in v_src) = 0 then
    raise exception 'dru: persist_witness_facts'' optional loop no longer selects distinct on (c.field_path) -- it can now produce a duplicate at the new key'
      using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'insert into clara.document_regions', '')))
       / length('insert into clara.document_regions') <> 2 then
    raise exception 'dru: persist_witness_facts no longer has exactly two region inserts -- re-derive the duplicate-free claim before trusting it'
      using errcode = 'CLR10';
  end if;
  raise notice 'dru: clara.persist_witness_facts is UNCHANGED and confirmed duplicate-free at source (belt array + distinct on (c.field_path), two region inserts).';
end $dru_witness$;

-- =====================================================================================
-- §R RELEASE NOTE (for the release session, not executed here).
--
-- IF THE PRESTATE REFUSES, this is the census that says what it found and the one-off fold that a
-- release session may choose to run deliberately. It is HERE and not in the body because
-- clara.document_regions is APPEND-ONLY: removing a row is removing evidence, and a migration must
-- not do that on an operator's behalf.
--
-- 1 · CENSUS the duplicates, with enough context to decide what is safe to drop:
--
--     select r.extraction_id, r.field_path, count(*) as rows,
--            min(r.created_at) as first_seen, max(r.created_at) as last_seen,
--            count(distinct coalesce(r.text_content, chr(1))) as distinct_texts,
--            count(distinct coalesce(r.monetary_cents::text, chr(1))) as distinct_cents,
--            min(e.engine_id) as engine, min(e.engine_kind) as engine_kind
--       from clara.document_regions r
--       join clara.document_extractions e on e.id = r.extraction_id
--      where r.field_path is not null
--      group by r.extraction_id, r.field_path
--     having count(*) > 1
--      order by rows desc, first_seen;
--
--    A key whose `distinct_texts` and `distinct_cents` are both 1 is a true duplicate: the extra
--    rows state exactly what the first one states. A key where either is >1 is NOT a duplicate at
--    all — it is two different readings claiming one field, which is a data question for the
--    owning lane and must NOT be folded by rote.
--
-- 2 · THE FOLD, keeping the EARLIEST row at each key (its id is what any citation, entry_evidence
--    or knowledge_records row points at). The append-only belt refuses DELETE, so the fold runs as
--    the table owner with the trigger explicitly disabled FOR THIS TRANSACTION ONLY, and the
--    enable is not optional — run the whole block, never the delete alone:
--
--     begin;
--       set local role clara_fn_owner;
--       alter table clara.document_regions disable trigger t_document_regions_append_only;
--       with keep as (
--         select distinct on (extraction_id, field_path) id
--           from clara.document_regions
--          where field_path is not null
--          order by extraction_id, field_path, created_at, id)
--       delete from clara.document_regions r
--        where r.field_path is not null
--          and r.id not in (select id from keep)
--          and exists (select 1 from clara.document_regions d
--                       where d.extraction_id = r.extraction_id and d.field_path = r.field_path
--                         and d.id <> r.id)
--       returning r.id, r.extraction_id, r.field_path, r.text_content, r.monetary_cents;
--       alter table clara.document_regions enable trigger t_document_regions_append_only;
--     commit;
--
--    RECORD THE RETURNING OUTPUT as release evidence: those rows no longer exist anywhere. A
--    delete that hits a row referenced by clara.entry_evidence, clara.attribution_candidate_regions,
--    clara.document_service_periods or clara.knowledge_records will be refused by the foreign key
--    — that refusal is the right answer, and means the surviving row must be chosen by REFERENCE
--    rather than by created_at for that key.
--
-- 3 · RE-RUN the prestate's own predicate before re-applying, and expect zero:
--
--     select count(*) from (
--       select 1 from clara.document_regions where field_path is not null
--        group by extraction_id, field_path having count(*) > 1) s;
-- =====================================================================================

-- =====================================================================================
-- §T TAIL CENSUS — re-read the live catalog and say what is actually there.
-- =====================================================================================
do $dru_tail$
declare
  v_uniq int;
  v_plain int;
  v_trg int;
  v_writers int;
begin
  select count(*)::int into v_uniq from pg_index ix
   where ix.indrelid = 'clara.document_regions'::regclass
     and ix.indisunique
     and pg_get_indexdef(ix.indexrelid) like '%(extraction_id, field_path)%';
  if v_uniq <> 1 then
    raise exception 'dru tail: expected exactly ONE unique index at (extraction_id, field_path), found %', v_uniq
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_plain from pg_class c
   where c.oid = 'clara.ix_document_regions_extraction'::regclass;
  if v_plain <> 1 then
    raise exception 'dru tail: 0007''s ix_document_regions_extraction did not survive' using errcode = 'CLR10';
  end if;
  if (select ix.indisunique from pg_index ix
       where ix.indexrelid = 'clara.ix_document_regions_extraction'::regclass) is not false then
    raise exception 'dru tail: ix_document_regions_extraction was made unique -- this file adds a key beside it, it does not recut 0007''s access path'
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_trg from pg_trigger
   where tgrelid = 'clara.document_regions'::regclass
     and tgname in ('t_document_regions_append_only','t_document_regions_fact_validate')
     and tgenabled <> 'D';
  if v_trg <> 2 then
    raise exception 'dru tail: the append-only belt and 0191''s fact belt must BOTH still be enabled (found % of 2)', v_trg
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_writers from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('persist_document_extraction','persist_invoice_facts')
     and position('on conflict (extraction_id,field_path) do nothing' in p.prosrc) > 0;
  if v_writers <> 2 then
    raise exception 'dru tail: expected BOTH reachable region writers to carry the conflict arm, found %', v_writers
      using errcode = 'CLR10';
  end if;

  raise notice 'dru tail: OK -- clara.document_regions now carries uq_document_regions_extraction_field_path (UNIQUE, extraction_id + field_path, NULL paths deliberately unconstrained) beside 0007''s unchanged non-unique ix_document_regions_extraction; the append-only belt and 0191''s deferred fact belt are both still enabled; clara.persist_document_extraction and clara.persist_invoice_facts each absorb a same-key region with `on conflict ... do nothing` (never DO UPDATE, which the append-only belt would refuse) with owner/ACL/SECURITY DEFINER/search_path and every pre-existing gate carried verbatim and both post-image bodies pinned by sha; persist_invoice_facts additionally re-raises its conflicting-duplicate forfeiture from inside the loop, so an absorb can never silence it; clara.persist_witness_facts is untouched and confirmed duplicate-free at source. No table in workflow/graphile_worker/spike touched.';
end $dru_tail$;
