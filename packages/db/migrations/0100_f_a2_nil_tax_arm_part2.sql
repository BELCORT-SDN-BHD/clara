-- 0100_f_a2_nil_tax_arm_part2.sql — Wave-F Track A, F-A2 opener ①, PART 2 of 2:
-- clara.evaluate_witness_fact_state_v2 (THE THREE-LOCKS NIL-TAX ARM) + THE RESOLVER REPOINT.
-- =====================================================================================
-- MIGRATION NUMBER CLAIMED AT MERGE TIME (hard constraint 10) — authored as
-- UNNUMBERED_f_a2_nil_tax_arm_part2.sql and numbered in the commit that lands it. Nothing keys
-- on the number: the battery gates on catalog facts and on the STABLE SUFFIX
-- `_f_a2_nil_tax_arm_part2`. APPLY AFTER
-- 0099_f_a2_nil_tax_arm.sql (alphabetical order = apply order); the two are ONE ceremony
-- and each is self-contained, so a deploy-onto-existing run that applies only one still fails
-- LOUD rather than half-silently. Like its part 1 this file sits past the harness's 500-line
-- advisory, the same call 0092 made at 644 lines: a migration's prestate, its body, its freeze
-- registration and its tail census are one piece of evidence.
--
-- OWNER RULING OF RECORD (docs/plan/completed/f-a1-corpus-measurement.md:64-68, ratified
-- 2026-08-20): a document that prints NO TAX corroborates as tax = 0 ONLY when
--   (page coverage complete) AND (both channels answer `not_printed`) AND (no SST registration
--   number printed on the document),
-- and the receipt is stamped "document tax-silent, presumed non-registrant". DESIGN OF RECORD:
-- the F-A2 opener ① spec §4 (the conjunct delta), §5 (the stamp), §6 (the emission policy),
-- §7 (versioning/freeze/repoint), §8 (the battery).
--
-- WHY THIS IS A NEW BODY AND NOT A CHANGE OF RECORD. clara.evaluate_witness_fact_state_v1 is
-- frozen with a FOUR-member closure (0092:543-566) and its body can never be recut — that is
-- the freeze's stated price (0092:534-538). v2 is therefore a NEW function beside it; v1 stays
-- in the catalog, stays registered, stays deployed, and becomes unreachable. The naming is
-- load-bearing rather than cosmetic: scripts/check-frozen-evaluators.mjs discovers only
-- `clara.evaluate_*` and requires a clara.evaluator_versions insert IN THE SAME FILE, so a v2
-- without its own registration row in its own file is a hard CI reject.
--
-- WHAT MOVES, STATED NARROWLY. Everything up to and including the answers/agreement loop, the
-- MYR evidence rule and the M3 reference-value contract is CARRIED THROUGH UNCHANGED from
-- 0092:255-437. The delta is: three lock computations plus a derivation, the cardinality terms
-- of the nil-tax conjunct, the arithmetic identity reading the effective values, and ONE
-- conditional key pair on the output envelope. Every other conjunct at 0092:443-475 is carried.
--
-- WHAT DOES NOT MOVE, AND IT IS DELIBERATE (spec §6). `total_excl_tax_cents` and
-- `tax_total_cents` keep 0092:508-509's emission rule BYTE-IDENTICAL: they are emitted only
-- when the WITNESSED value is non-null, never when the arm DERIVED one. Two live consumers
-- re-derive corroboration independently of the `corroborated` flag off exactly those keys, and
-- one of them — the ocr_sales unattended-post anchor at 0023:820-837 — is the only place in the
-- estate that posts with no human in the loop. It stays shut. A consumer that WANTS the
-- presumption reads the new `tax_basis` key and opts in explicitly.
--
-- D1 WRITE-QUIESCE OBLIGATION: §C replaces clara._invoice_fact_state_at, the hot-path resolver
-- every invoice document reaches (0093:34-37). PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with.
set local statement_timeout = '10min';
-- SEARCH PATH PINNED FOR THE WHOLE FILE (0092:21-26's recorded reason); §B must flip to a
-- catalog-only path for the freeze hashes and flip back.
set local search_path = clara, pg_temp;

do $fa2_quiesce2$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A2 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file replaces clara._invoice_fact_state_at, a live hot-path body, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa2_quiesce2$;

-- =====================================================================================
-- §0 PRESTATE.
-- =====================================================================================
create temp table _fa2p2_pre(k text primary key, v text);
create temp table _fa2p2_pre_fn(oid oid primary key, sha text);
do $fa2_pre2$
declare v_src text; v_n int;
begin
  -- (0.1) THE DECLARED FROZEN-CLOSURE LEAVES EXIST AT THE SIGNATURES THIS FILE FREEZES.
  -- Freezing one that does not resolve makes verify_evaluator_freeze() raise at the NEXT
  -- migration.
  begin
    perform 'clara._fact_hash(uuid,uuid,text,text,bigint)'::regprocedure;
    perform 'clara._normalize_invoice_cents(text)'::regprocedure;
    perform 'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)'::regprocedure;
    perform 'clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure;
  exception when others then
    raise exception 'F-A2 part2 prestate: a declared frozen-closure leaf or the v1 predicate is absent — apply 0091/0092 FIRST' using errcode='CLR10';
  end;
  perform clara.verify_evaluator_freeze();

  -- (0.2) NOT ALREADY APPLIED.
  if to_regprocedure('clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)') is not null then
    raise exception 'F-A2 part2 prestate: clara.evaluate_witness_fact_state_v2 already exists — already applied' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_versions where evaluator_name='evaluate_witness_fact_state';
  if v_n <> 1 then
    raise exception 'F-A2 part2 prestate: clara.evaluator_versions carries % witness row(s), expected exactly 1 (v1)', v_n using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.evaluator_versions
                  where evaluator_name='evaluate_witness_fact_state' and version=1
                    and entrypoint_signature='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') then
    raise exception 'F-A2 part2 prestate: the v1 registry row is not the 0092 row this file appends beside' using errcode='CLR10';
  end if;
  -- v1's DEPLOY FLAG IS CAPTURED, NEVER ASSERTED TO A CONSTANT. On the live project it is true
  -- (the PR-1 ceremony flipped it); on a scratch rig replay it is false, because the flip is a
  -- ceremony act and no ceremony ran. Either is correct — what this file must prove is that it
  -- did not MOVE, and a hard-coded expectation would have failed on the rig for the right
  -- reason and passed on live for the wrong one.
  insert into _fa2p2_pre(k,v)
    select 'v1_deployed', deployed::text from clara.evaluator_versions
     where evaluator_name='evaluate_witness_fact_state' and version=1;

  -- (0.3) THE FREEZE'S NAMED RESIDUAL (0092:72-79, carried): clara._write_entry_evidence INLINES
  -- the identical fact digest rather than calling the frozen leaf, and the two must stay
  -- byte-agreed or the verified tier silently evaporates. v2 re-freezes the same leaf, so v2
  -- inherits the same obligation and re-checks it here rather than assuming 0092 still holds.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure;
  if position('encode(sha256(convert_to(jsonb_build_object(' in v_src) = 0
     or position('''monetary_cents'', x.monetary_cents)::text, ''UTF8'')), ''hex'')' in v_src) = 0 then
    raise exception 'F-A2 part2 prestate: clara._write_entry_evidence no longer carries the INLINE fact digest this freeze pairs with' using errcode='CLR10';
  end if;

  -- (0.4) THE V1 BODY IS THE 0092 BODY, PINNED BY PROSRC SHA-256. The battery proves v1 stays
  -- byte-identical AFTER this file; pinning it BEFORE is what makes that a diff rather than an
  -- assertion about the present.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src from pg_proc p
   where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure;
  if v_src <> '75c4ca06d012d1b315db9452e522b0bc9cdd4eed68038bd305ca84dba8cb9911' then
    raise exception 'F-A2 part2 prestate: clara.evaluate_witness_fact_state_v1 prosrc sha256 mismatch (got %, expected 75c4ca06d012d1b315db9452e522b0bc9cdd4eed68038bd305ca84dba8cb9911) — the FROZEN v1 body is not the 0092 body', v_src
      using errcode='CLR10';
  end if;
  insert into _fa2p2_pre(k,v) values ('v1_sha', v_src);

  -- (0.5) THE REPOINT TARGET IS THE 0093 §A POST-STATE BODY, and its anchor is UNIQUE.
  -- `replace()` is global: an anchor occurring twice would be spliced twice, and one occurring
  -- zero times would splice nothing while the file reported success. Counted, never assumed.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  if v_src is null then
    raise exception 'F-A2 part2 prestate: clara._invoice_fact_state_at is GONE' using errcode='CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> 'cf1e8290246db3fbe6698ff50d191d4783c7809e1a7c4d60d2370aa627e8a66c' then
    raise exception 'F-A2 part2 prestate: clara._invoice_fact_state_at prosrc sha256 mismatch (got %, expected cf1e8290246db3fbe6698ff50d191d4783c7809e1a7c4d60d2370aa627e8a66c) — this is not the 0093 §A post-state body this file was authored against', encode(sha256(convert_to(v_src,'UTF8')),'hex')
      using errcode='CLR10';
  end if;
  if position('evaluate_witness_fact_state_v2' in v_src) <> 0 then
    raise exception 'F-A2 part2 prestate: clara._invoice_fact_state_at ALREADY dispatches to v2 — already applied' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $a$    return clara.evaluate_witness_fact_state_v1(p_document, v_wtext, v_wvision);$a$, '')))
         / length($a$    return clara.evaluate_witness_fact_state_v1(p_document, v_wtext, v_wvision);$a$);
  if v_n <> 1 then
    raise exception 'F-A2 part2 prestate: the repoint anchor occurs % times in clara._invoice_fact_state_at (expected 1)', v_n using errcode='CLR10';
  end if;
  -- The WHOLE pre-recut tail from the first legacy statement onward; §D proves it survives
  -- VERBATIM, which covers the structured `clara-%` branch, the OCR belt set, the envelope
  -- assembly and every conditional append at once (0093:128-130's idiom).
  insert into _fa2p2_pre(k,v) values
    ('at_sha', encode(sha256(convert_to(v_src,'UTF8')),'hex')),
    ('at_tail', substr(v_src, position('select e2.id, e2.version_n,' in v_src)));

  -- (0.6) A whole-schema body snapshot, so the tail can prove v1 did not move and NAME every
  -- body that did.
  insert into _fa2p2_pre_fn(oid, sha)
  select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null;
  select count(*)::int into v_n from _fa2p2_pre_fn;
  raise notice 'F-A2 part2 prestate: clean — the four closure members present, v1 at its 0092 sha, v2 absent, one witness registry row, the repoint anchor unique, % clara bodies snapshotted', v_n;
end
$fa2_pre2$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.evaluate_witness_fact_state_v2: THE SUCCESSOR PREDICATE.
-- =====================================================================================
-- Everything 0092:94-148 says about WHAT THIS DECIDES, the source asymmetry between the two
-- channels, the deliberate absence of any confidence term, the three field classes and the
-- required-answer rule is carried forward unchanged and is not restated here — read 0092's §A
-- header for the parts this file does not move. What follows documents ONLY the delta.
create function clara.evaluate_witness_fact_state_v2(p_document uuid, p_text_x uuid, p_vision_x uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $wit2$
declare
  v_text_id uuid; v_vision_id uuid; v_tvn int; v_vvn int; v_refusal text;
  v_teid text; v_veid text; v_tenv jsonb; v_venv jsonb;
  v_tans jsonb; v_vans jsonb; v_reg jsonb; v_ineligible text; v_contest boolean := false;
  v_belt text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit','invoice.currency','invoice.type_code'];
  v_money text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit'];
  v_f text; v_ta jsonb; v_va jsonb; v_ts text; v_vs text; v_n int;
  v_answers_ok boolean := true; v_agree_ok boolean := true; v_c2_ok boolean := true;
  v_tval bigint; v_vval bigint; v_ttxt text; v_vtxt text;
  v_tmyr text := 'none'; v_vmyr text := 'none';
  v_tref text; v_vref text;
  v_total_count int; v_total_region uuid; v_total bigint; v_locator text;
  v_locator_json jsonb; v_poly_ok boolean; v_hash text; v_currency text; v_vcurrency text;
  v_due bigint; v_deposit bigint; v_due_c int; v_deposit_c int;
  v_net bigint; v_tax bigint; v_net_c int; v_tax_c int; v_rounding bigint; v_round_c int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
  v_type text; v_type_c int; v_invoice_id text; v_invoice_date text;
  v_customer text; v_customer_reg text; v_ok boolean; v_out jsonb;
  v_ident jsonb; v_vreg_verdict text; v_creg_verdict text; v_flag_contest boolean := false;
  -- F-A2 THE THREE-LOCKS NIL-TAX ARM. All-or-nothing: the arm is the CONJUNCTION.
  v_nil_tax_arm boolean := false;
  v_lock_pages boolean := false;      -- L1 · page coverage complete
  v_lock_silent boolean := false;     -- L2 · both channels answer not_printed for tax
  v_lock_no_sst boolean := false;     -- L3 · no SST registration number printed, either party
  v_net_eff bigint; v_tax_eff bigint; -- the values the verdict actually uses
  v_cov_t jsonb; v_cov_v jsonb;       -- the two channels' coverage receipts
begin
  -- 1. PAIR RESOLUTION (design §3.1, M15) — 0092:181-253 carried verbatim in behaviour.
  select e.version_n, e.engine_id, e.envelope into v_tvn, v_teid, v_tenv
    from clara.document_extractions e where e.id = p_text_x and e.document_id = p_document
     and e.engine_kind = 'llm_text_facts' and e.status = 'done';
  if found then v_text_id := p_text_x; else v_refusal := 'witness_text_row_unresolved'; end if;
  if v_refusal is null then
    select e.version_n, e.engine_id, e.envelope into v_vvn, v_veid, v_venv
      from clara.document_extractions e where e.id = p_vision_x and e.document_id = p_document
       and e.engine_kind = 'llm_vision_facts' and e.status = 'done';
    if found then v_vision_id := p_vision_x; else v_refusal := 'witness_vision_row_unresolved'; end if;
  end if;
  if v_refusal is null and (v_veid is distinct from v_teid or v_vvn is distinct from v_tvn) then
    v_refusal := 'witness_pair_cross_generation';
  end if;
  if v_refusal is not null then
    return jsonb_build_object(
      'extraction_id', v_text_id, 'version_n', v_tvn, 'total_region_id', null,
      'total_cents', null, 'total_fact_hash', null, 'currency', null,
      'invoice_id', null, 'invoice_date', null,
      'corroboration_ineligible', nullif(btrim(v_tenv->>'corroboration_ineligible'),''),
      'corroborated', false, 'explicit_non_myr', false,
      'regime', 'witness', 'vision_extraction_id', v_vision_id, 'pair_refusal', v_refusal);
  end if;
  v_ineligible := coalesce(nullif(btrim(v_tenv->>'corroboration_ineligible'),''),
                           nullif(btrim(v_venv->>'corroboration_ineligible'),''));
  -- THE CONTEST MARKER, READ RAISE-PROOF AND FAIL-CLOSED (0092:223-253's argument, carried):
  -- a hard cast raises 22P02 on a string like "unknown", out of a STABLE predicate ~27 live
  -- call sites reach. Absent and json-null coalesce onto one arm deliberately; any other type
  -- is TRUE, which can only ever ADD an identity withdrawal and never admit one.
  v_contest := (case coalesce(jsonb_typeof(v_tenv->'witness'->'contest'), 'null')
                  when 'boolean' then coalesce((v_tenv->'witness'->>'contest')::boolean, false)
                  when 'null' then false
                  else true end)
            or (case coalesce(jsonb_typeof(v_venv->'witness'->'contest'), 'null')
                  when 'boolean' then coalesce((v_venv->'witness'->>'contest')::boolean, false)
                  when 'null' then false
                  else true end);

  -- 2. THE TEXT ROW'S SERVER-VERIFIED REGIONS (0092:255-301, carried).
  select coalesce(jsonb_object_agg(f.fp, f.agg), '{}'::jsonb) into v_reg
    from (select r.field_path as fp,
                 jsonb_build_object('n', count(*)::int, 'cents', min(r.monetary_cents),
                   'text', nullif(btrim(min(r.text_content)),''), 'raw_text', min(r.text_content),
                   'region_id', (array_agg(r.id order by r.id))[1],
                   'locator_kind', (array_agg(r.locator_kind order by r.id))[1],
                   'locator', (array_agg(r.locator order by r.id))[1]) as agg
            from clara.document_regions r
           where r.extraction_id = v_text_id and r.field_path is not null
           group by r.field_path) f;
  v_total_count := coalesce((v_reg->'invoice.total'->>'n')::int, 0);
  v_total := (v_reg->'invoice.total'->>'cents')::bigint;
  v_total_region := (v_reg->'invoice.total'->>'region_id')::uuid;
  v_locator := v_reg->'invoice.total'->>'locator_kind'; v_locator_json := v_reg->'invoice.total'->'locator';
  v_poly_ok := case when jsonb_typeof(v_locator_json->'polygon') = 'array'
                    then jsonb_array_length(v_locator_json->'polygon') > 0 else false end;
  v_due_c := coalesce((v_reg->'invoice.amount_due'->>'n')::int, 0);
  v_due := (v_reg->'invoice.amount_due'->>'cents')::bigint;
  v_deposit_c := coalesce((v_reg->'invoice.deposit'->>'n')::int, 0);
  v_deposit := (v_reg->'invoice.deposit'->>'cents')::bigint;
  v_net_c := coalesce((v_reg->'invoice.total_excl_tax'->>'n')::int, 0);
  v_net := (v_reg->'invoice.total_excl_tax'->>'cents')::bigint;
  v_tax_c := coalesce((v_reg->'invoice.tax_total'->>'n')::int, 0);
  v_tax := (v_reg->'invoice.tax_total'->>'cents')::bigint;
  v_round_c := coalesce((v_reg->'invoice.rounding'->>'n')::int, 0);
  v_rounding := (v_reg->'invoice.rounding'->>'cents')::bigint;
  v_sc_c := coalesce((v_reg->'invoice.service_charge'->>'n')::int, 0);
  v_sc := (v_reg->'invoice.service_charge'->>'cents')::bigint;
  v_disc_c := coalesce((v_reg->'invoice.discount'->>'n')::int, 0);
  v_disc := (v_reg->'invoice.discount'->>'cents')::bigint;
  v_dlv_c := coalesce((v_reg->'invoice.delivery'->>'n')::int, 0);
  v_dlv := (v_reg->'invoice.delivery'->>'cents')::bigint;
  v_type_c := coalesce((v_reg->'invoice.type_code'->>'n')::int, 0);
  v_invoice_id := v_reg->'invoice.invoice_id'->>'text'; v_invoice_date := v_reg->'invoice.invoice_date'->>'text';
  v_customer := v_reg->'invoice.customer_name'->>'text'; v_customer_reg := v_reg->'invoice.customer_registration'->>'text';
  if v_total_region is not null then
    select clara._fact_hash(r.extraction_id, r.id, r.field_path, r.text_content,
      r.monetary_cents) into v_hash from clara.document_regions r where r.id = v_total_region;
  end if;

  -- 3. REQUIRED ANSWERS · C2 ANCHORING · PER-FIELD SEN-EXACT AGREEMENT (0092:303-378, carried).
  v_tans := v_tenv->'witness'->'answers'; v_vans := v_venv->'witness'->'answers';
  if jsonb_typeof(v_tans) <> 'object' or jsonb_typeof(v_vans) <> 'object' then
    v_answers_ok := false; v_agree_ok := false;
  else
    foreach v_f in array v_belt loop
      v_ta := v_tans->v_f; v_va := v_vans->v_f;
      if jsonb_typeof(v_ta) <> 'object' or jsonb_typeof(v_va) <> 'object' then
        v_answers_ok := false; continue;
      end if;
      v_ts := v_ta->>'state'; v_vs := v_va->>'state';
      if v_ts is null or v_vs is null
         or v_ts not in ('value','not_printed') or v_vs not in ('value','not_printed') then
        v_answers_ok := false; continue;
      end if;
      v_n := coalesce((v_reg->v_f->>'n')::int, 0);
      if v_ts = 'not_printed' and v_n <> 0 then v_answers_ok := false; continue; end if;
      if v_ts = 'value' and (case when v_f = any(v_money) then v_n <> 1 else v_n > 1 end) then
        v_answers_ok := false; continue;
      end if;
      if v_ts = 'value' and v_f = any(v_money)
         and (coalesce(v_reg->v_f->>'locator_kind','') <> 'page_polygon'
              or case when jsonb_typeof(v_reg->v_f->'locator'->'polygon') = 'array'
                      then jsonb_array_length(v_reg->v_f->'locator'->'polygon') = 0
                      else true end) then
        v_c2_ok := false;
      end if;
      if v_ts <> v_vs then v_agree_ok := false; continue; end if;
      if v_ts = 'not_printed' then continue; end if;
      if v_f = any(v_money) then
        v_tval := (v_reg->v_f->>'cents')::bigint;
        -- M6, THE MAGNITUDE PRE-GUARD (0092:350-364, carried): the frozen normalizer multiplies
        -- by 100 and casts to bigint, so a rendering with more than 13 digits before the decimal
        -- raises 22003 — and a raise out of a STABLE read predicate is not a refusal, it is a
        -- read nobody can make. A present-but-unreadable amount falls to NOT CORROBORATED.
        if length(regexp_replace(split_part(regexp_replace(
             upper(btrim(coalesce(v_va->>'raw',''))), '(MYR|RM)|[,[:space:]]', '', 'g'),
             '.', 1), '[^0-9]', '', 'g')) > 13 then
          v_vval := null;
        else
          v_vval := clara._normalize_invoice_cents(v_va->>'raw');
        end if;
        if v_tval is null or v_vval is null or v_tval <> v_vval then v_agree_ok := false; end if;
      elsif v_f = 'invoice.type_code' then
        v_ttxt := nullif(btrim(coalesce(v_ta->>'raw','')),'');
        v_vtxt := nullif(btrim(coalesce(v_va->>'raw','')),'');
        if v_ttxt is null or v_vtxt is null or v_ttxt <> v_vtxt then v_agree_ok := false; end if;
      end if;
    end loop;
  end if;

  -- THE MYR EVIDENCE RULE (0092:380-405, carried verbatim).
  v_ttxt := coalesce(case when v_tans->'invoice.currency'->>'state' = 'value'
                          then v_tans->'invoice.currency'->>'raw' end, '');
  v_vtxt := coalesce(case when v_vans->'invoice.currency'->>'state' = 'value'
                          then v_vans->'invoice.currency'->>'raw' end, '');
  v_currency := upper(regexp_replace(v_ttxt, '[^A-Za-z]', '', 'g'));
  v_vcurrency := upper(regexp_replace(v_vtxt, '[^A-Za-z]', '', 'g'));
  v_tmyr := case when v_currency in ('RM','MYR') then 'myr'
    when upper(regexp_replace(v_ttxt,'[[:space:]]','','g')) ~ '(^|[^A-Z])(USD|SGD|EUR|GBP|JPY|CNY|RMB|AUD|NZD|CAD|CHF|HKD|IDR|THB|PHP|VND|INR|KRW|TWD|BND|AED|SAR|MMK|LAK|KHR)([^A-Z]|$)'
      or v_ttxt ~ '[$€£¥₩฿₱₫₹]' then 'foreign'
    else 'none' end;
  v_vmyr := case when v_vcurrency in ('RM','MYR') then 'myr'
    when upper(regexp_replace(v_vtxt,'[[:space:]]','','g')) ~ '(^|[^A-Z])(USD|SGD|EUR|GBP|JPY|CNY|RMB|AUD|NZD|CAD|CHF|HKD|IDR|THB|PHP|VND|INR|KRW|TWD|BND|AED|SAR|MMK|LAK|KHR)([^A-Z]|$)'
      or v_vtxt ~ '[$€£¥₩฿₱₫₹]' then 'foreign'
    else 'none' end;

  v_type := coalesce(
    case when v_tans->'invoice.type_code'->>'state' = 'value'
         then nullif(btrim(coalesce(v_tans->'invoice.type_code'->>'raw','')),'') end,
    v_reg->'invoice.type_code'->>'text');

  -- M3, THE REFERENCE-VALUE CONTRACT (0092:415-437, carried verbatim).
  v_tref := case when v_tans->'invoice.invoice_id'->>'state' = 'value' then nullif(btrim(
    coalesce(v_tans->'invoice.invoice_id'->>'value', v_tans->'invoice.invoice_id'->>'raw','')),'') end;
  v_vref := case when v_vans->'invoice.invoice_id'->>'state' = 'value' then nullif(btrim(
    coalesce(v_vans->'invoice.invoice_id'->>'value', v_vans->'invoice.invoice_id'->>'raw','')),'') end;
  v_invoice_id := case when v_tref is not null and v_vref is not null and v_tref <> v_vref
                       then null else coalesce(v_tref, v_vref, v_invoice_id) end;
  v_tref := case when v_tans->'invoice.invoice_date'->>'state' = 'value' then nullif(btrim(
    coalesce(v_tans->'invoice.invoice_date'->>'value', v_tans->'invoice.invoice_date'->>'raw','')),'') end;
  v_vref := case when v_vans->'invoice.invoice_date'->>'state' = 'value' then nullif(btrim(
    coalesce(v_vans->'invoice.invoice_date'->>'value', v_vans->'invoice.invoice_date'->>'raw','')),'') end;
  v_invoice_date := case when v_tref is not null and v_vref is not null and v_tref <> v_vref
                         then null else coalesce(v_tref, v_vref, v_invoice_date) end;

  -- =====================================================================================
  -- 3.5 THE THREE-LOCKS NIL-TAX ARM (F-A2 opener ①; owner ruling 2026-08-20, corpus report
  -- f-a1-corpus-measurement.md:64-68). A document that PRINTS NO TAX and is proven silent under
  -- all three locks is presumed a NON-REGISTRANT's document, and its tax is DERIVED as zero BY
  -- THIS EVALUATOR from DB-owned inputs — never asserted by a model (PRD §6). The prompt still
  -- forbids the model to infer a zero; the presumption is the DB's, made once, versioned, and
  -- stamped on the envelope.
  --
  -- EVERY LOCK IS READ POSITIVELY AND FAILS CLOSED. Absence of evidence for a lock is the lock
  -- FAILING, never the lock passing. Each lock is COALESCED TO FALSE rather than left
  -- three-valued, and the reason is a PROPERTY, not a bug fix. Three-valued locks would make
  -- v_nil_tax_arm itself three-valued, and a NULL conjunction takes NEITHER branch of the
  -- derivation below — so the effective values would stay unset. That state is in fact
  -- UNREACHABLE for any document v1 corroborates: v1 corroboration requires v_tax_c = 1, and
  -- L2's `v_tax_c = 0` conjunct is then FALSE rather than NULL, which forces the whole
  -- conjunction FALSE and the `if not` branch to fire. Stated because a reader should not have
  -- to re-derive it, and because that derivation is exactly what the coalesce buys freedom from:
  -- with it, "the arm did not fire => the effective values ARE the witnessed values" is an
  -- UNCONDITIONAL property of this code, readable without a case analysis over which conjunct
  -- went NULL — and it stays true under any later edit to a lock. Absence of evidence is FALSE
  -- here, explicitly, exactly as 0023:208-214 argues for the flag itself.
  --
  -- EVERY READ IS RAISE-PROOF BY CONSTRUCTION, not by conjunct ORDER. SQL does not promise that
  -- AND short-circuits, so a `jsonb_typeof(...) = 'number'` guard sitting to the left of a cast
  -- cannot be relied on to fence it. Types are tested with jsonb_typeof, booleans are compared
  -- as jsonb VALUES, and the two counts are tested as bounded DIGIT STRINGS and compared to each
  -- other as jsonb — so no branch of this block can raise 22P02 or 22003 out of a STABLE
  -- predicate that 28 live call sites reach (the count §D7's census PRINTS at this frontier;
  -- 0093:345-384 recorded 27, and 0096 added persist_witness_facts as a caller after it).
  v_cov_t := v_tenv->'witness'->'coverage';
  v_cov_v := v_venv->'witness'->'coverage';

  -- L1 · PAGE COVERAGE COMPLETE. Read off the witnessFacts.v2 coverage receipt on BOTH channels.
  -- A v1-era row carries no receipt, so jsonb_typeof is SQL NULL and the lock fails — the
  -- correct answer for a read that never measured its own coverage. The vision channel's
  -- completeness is STRUCTURAL: the writer refuses any persist whose vision input pin is not the
  -- document's own sha256 (0095:405-407), so that row's mere existence is the receipt; the
  -- stored sha is read back so the receipt is SEEN rather than inferred (review law 2).
  -- The count bound (nine digits, no leading zero) is far past any real document's region count
  -- and is what makes the comparison castless.
  v_lock_pages := coalesce(
        jsonb_typeof(v_cov_t) = 'object' and jsonb_typeof(v_cov_v) = 'object'
    and coalesce(jsonb_typeof(v_cov_t->'truncated'),'null') = 'boolean'
    and coalesce(jsonb_typeof(v_cov_v->'truncated'),'null') = 'boolean'
    and v_cov_t->'truncated' = 'false'::jsonb
    and v_cov_v->'truncated' = 'false'::jsonb
    and jsonb_typeof(v_cov_t->'regions_total') = 'number'
    and jsonb_typeof(v_cov_t->'regions_shown') = 'number'
    and coalesce(v_cov_t->>'regions_total','') ~ '^[1-9][0-9]{0,8}$'
    and v_cov_t->'regions_shown' = v_cov_t->'regions_total'
    and lower(coalesce(v_cov_v->>'input_sha256','')) ~ '^[0-9a-f]{64}$', false);

  -- L2 · BOTH CHANNELS ANSWER not_printed FOR TAX. The only lock v1-era rows already carry.
  -- `not_printed` is required to cite NO region (the roster loop above), so this and v_tax_c = 0
  -- are two readings of one fact — both are asserted, because a disagreement between them would
  -- mean the write boundary let a contradiction through and the arm must not fire.
  v_lock_silent := coalesce(
        v_tans->'invoice.tax_total'->>'state' = 'not_printed'
    and v_vans->'invoice.tax_total'->>'state' = 'not_printed'
    and v_tax_c = 0 and v_tax is null, false);

  -- L3 · NO SST REGISTRATION NUMBER PRINTED ANYWHERE, EITHER PARTY. Requires witnessFacts.v2's
  -- asked-and-answered presence field. THE ABSENCE OF A vendor_registration CITATION IS NOT THIS
  -- FACT: that path is citation-only (the model is never asked), and an SSM/BRN company number
  -- is not an SST registration number — spelling is not identity (review law 3). The
  -- party-blind question is deliberate: attributing a printed number to the vendor block is the
  -- geometric block-attribution test, whose anchor DESIGNATION is witness-supplied and which the
  -- design itself names as this regime's softest term; a LOCK must not inherit it.
  -- THE DOWNGRADE TERM IS NOT DECORATION (spec §2.5.3): the runtime's answer normalizer emits a
  -- byte-identical `not_printed` for an honest silence AND for a claim the model could not
  -- quote, and for a REFERENCE ANSWER field nothing downstream tells them apart. The receipt
  -- does. Read POSITIVELY — the list must be an array this read actually SAW; absent or
  -- non-array fails the lock, which is the correct answer for a row whose receipt we cannot
  -- read (a v1-era row, always).
  v_lock_no_sst := coalesce(
        v_tans->'invoice.sst_registration'->>'state' = 'not_printed'
    and v_vans->'invoice.sst_registration'->>'state' = 'not_printed'
    and jsonb_typeof(v_cov_t->'downgraded_fields') = 'array'
    and jsonb_typeof(v_cov_v->'downgraded_fields') = 'array'
    and not (v_cov_t->'downgraded_fields' @> '["invoice.sst_registration"]'::jsonb)
    and not (v_cov_v->'downgraded_fields' @> '["invoice.sst_registration"]'::jsonb), false);

  v_nil_tax_arm := v_lock_pages and v_lock_silent and v_lock_no_sst;

  -- THE DERIVED VALUES. Only reachable when all three locks hold; otherwise the witnessed values
  -- stand exactly as v1 read them.
  if v_nil_tax_arm then
    v_tax_eff := 0;
    -- NET. Two sub-cases, and the second is the corpus-dominant one:
    --   (a) the document PRINTS a net line -> use it; the six-term identity below is then a REAL
    --       arithmetic check of net + components = total against printed figures.
    --   (b) the document prints ONE gross line (the corpus report's "non-SST issuers print one
    --       gross line") -> net is derived as the total. Admitted ONLY when the document prints
    --       NO other component either: with service_charge / discount / delivery / rounding all
    --       not_printed on BOTH channels and citing no region, net := total is an identity, not
    --       a guess. If ANY component IS printed while net is not, the arm REFUSES — deriving
    --       net around printed components would be the evaluator inventing document structure,
    --       which is the one thing this arm must not do to buy a corroboration.
    if v_net is not null and v_net_c = 1 then
      v_net_eff := v_net;
    elsif coalesce(v_tans->'invoice.total_excl_tax'->>'state','') = 'not_printed'
      and coalesce(v_vans->'invoice.total_excl_tax'->>'state','') = 'not_printed'
      and v_net_c = 0
      and v_round_c = 0 and v_sc_c = 0 and v_disc_c = 0 and v_dlv_c = 0
      and coalesce(v_tans->'invoice.rounding'->>'state','')       = 'not_printed'
      and coalesce(v_tans->'invoice.service_charge'->>'state','') = 'not_printed'
      and coalesce(v_tans->'invoice.discount'->>'state','')       = 'not_printed'
      and coalesce(v_tans->'invoice.delivery'->>'state','')       = 'not_printed'
      and coalesce(v_vans->'invoice.rounding'->>'state','')       = 'not_printed'
      and coalesce(v_vans->'invoice.service_charge'->>'state','') = 'not_printed'
      and coalesce(v_vans->'invoice.discount'->>'state','')       = 'not_printed'
      and coalesce(v_vans->'invoice.delivery'->>'state','')       = 'not_printed'
    then
      v_net_eff := v_total;                 -- the single-gross-line shape, and only that shape
    else
      v_nil_tax_arm := false;               -- unreachable-by-derivation -> the arm withdraws
      v_tax_eff := null;
    end if;
  end if;
  if not v_nil_tax_arm then
    v_net_eff := v_net; v_tax_eff := v_tax;
  end if;

  -- 4. THE VERDICT — 0023's OCR belt set IN FULL plus M12's type_code, carried from
  -- 0092:439-479. EXACTLY TWO TERMS MOVE, and both are named below; every other conjunct is
  -- byte-carried.
  v_ok := v_answers_ok and v_agree_ok and v_c2_ok
    and v_total_count = 1 and v_total is not null and v_total > 0        -- 0023:304
    and v_locator = 'page_polygon' and v_poly_ok                          -- 0023:305 (W3)
    and v_tmyr = 'myr' and v_vmyr = 'myr'
    and (v_due_c = 0 or (v_due is not null and v_due = v_total))          -- 0023:307
    and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))    -- 0023:308
    and v_ineligible is null                                              -- 0023:309, both rows
    -- THE NIL-TAX LAW, NOW WITH ONE NARROW ARM. Unchanged whenever the arm does not fire: net
    -- AND tax STATED and SINGLE, an unstated tax NEVER infers zero (0023:299-303). Under the arm
    -- the values are DERIVED above and the cardinality demand is satisfied by the derivation
    -- rather than by a region. THE CARDINALITY TERMS ARE THE ONLY THING THAT RELAXES.
    and v_net_eff is not null and (v_nil_tax_arm or v_net_c = 1)
    and v_tax_eff is not null and (v_nil_tax_arm or v_tax_c = 1)
    and v_net_eff >= 0 and v_tax_eff >= 0                                 -- 0023:315-321
    and v_type = '01' and v_type_c <= 1                                   -- M12
    and v_round_c <= 1 and (v_round_c = 0 or v_rounding is not null)      -- 0023:325-328
    and v_sc_c <= 1 and (v_sc_c = 0 or v_sc is not null)
    and v_disc_c <= 1 and (v_disc_c = 0 or v_disc is not null)
    and v_dlv_c <= 1 and (v_dlv_c = 0 or v_dlv is not null)
    and coalesce(v_sc, 0) >= 0 and coalesce(v_disc, 0) >= 0 and coalesce(v_dlv, 0) >= 0
    and coalesce(abs(v_rounding), 0) <= 99
    -- THE SIX-TERM IDENTITY, now over the EFFECTIVE values. STATED HONESTLY because a reviewer
    -- must not have to derive it: in sub-case (b) this is satisfied BY CONSTRUCTION
    -- (v_total + 0 + 0 = v_total) and proves nothing. ALL the safety in that sub-case comes from
    -- the three locks, the no-other-component requirement, and every UNCHANGED belt above. In
    -- sub-case (a) and whenever the arm does not fire it remains a real arithmetic check.
    and (v_net_eff + coalesce(v_sc, 0) + coalesce(v_dlv, 0) + v_tax_eff + coalesce(v_rounding, 0)
         - coalesce(v_disc, 0)) = v_total;                                -- 0023:345-346
  v_ok := coalesce(v_ok, false);

  -- 5. IDENTITY — delegated whole to the frozen closure leaf clara.evaluate_witness_identity_v1,
  -- closure ordinal 3. It returns VERDICTS ONLY, and `corroborated` above carries NO identity
  -- term (design §3.3, N5).
  v_ident := clara.evaluate_witness_identity_v1(p_document, v_text_id, v_contest);
  v_vreg_verdict := v_ident->>'vendor_registration_verdict';
  v_creg_verdict := v_ident->>'customer_registration_verdict';
  v_flag_contest := coalesce((v_ident->>'identity_contest')::boolean, false);

  -- 6. THE OUTPUT ENVELOPE (0092:492-521, carried) — the same conditional-append EMISSION RULES,
  -- byte-identical. THE TWO AMOUNT KEYS BELOW READ THE WITNESSED VALUES, NEVER THE EFFECTIVE
  -- ONES, and that is the F-A2 emission policy rather than an oversight: under the arm the
  -- derived pair stays ABSENT, which keeps the ocr_sales unattended-post anchor (0023:820-837)
  -- shut and leaves the supplier-bill tax-leg belt (0036:815-828) on its no-raise arm. A
  -- consumer that wants the presumption reads `tax_basis` and opts in.
  v_out := jsonb_build_object(
    'extraction_id', v_text_id, 'version_n', v_tvn,
    'total_region_id', v_total_region, 'total_cents', v_total,
    'total_fact_hash', v_hash, 'currency', nullif(v_currency,''),
    'invoice_id', v_invoice_id, 'invoice_date', v_invoice_date,
    'corroboration_ineligible', v_ineligible, 'corroborated', v_ok,
    'explicit_non_myr', v_tmyr = 'foreign' or v_vmyr = 'foreign');
  if v_net is not null then v_out := v_out || jsonb_build_object('total_excl_tax_cents',v_net); end if;
  if v_tax is not null then v_out := v_out || jsonb_build_object('tax_total_cents',v_tax); end if;
  if v_rounding is not null then v_out := v_out || jsonb_build_object('rounding_cents',v_rounding); end if;
  if v_type is not null then v_out := v_out || jsonb_build_object('type_code',v_type); end if;
  if v_customer is not null then v_out := v_out || jsonb_build_object('customer_name',v_customer); end if;
  if v_customer_reg is not null then v_out := v_out || jsonb_build_object('customer_registration',v_customer_reg); end if;
  v_out := v_out || jsonb_build_object('regime','witness','vision_extraction_id',v_vision_id);
  if v_vreg_verdict is not null then v_out := v_out || jsonb_build_object('vendor_registration_verdict',v_vreg_verdict); end if;
  if v_creg_verdict is not null then v_out := v_out || jsonb_build_object('customer_registration_verdict',v_creg_verdict); end if;
  if v_flag_contest then v_out := v_out || jsonb_build_object('identity_contest',true); end if;
  -- THE RECEIPT STAMP (spec §5; the ruling's own words), in the witness-regime-only
  -- conditional-key idiom a legacy output can never carry. `tax_basis` is the machine-readable
  -- token every future consumer branches on; `tax_basis_note` carries the owner's ruled
  -- sentence, stored once rather than re-composed at three surfaces. The envelope is the only
  -- artifact this predicate can stamp — it is STABLE and cannot write anywhere else — and
  -- putting the stamp here does NOT put it in front of a human: that surface is a separate,
  -- reviewed change to the lane and draft bodies.
  --
  -- THE VERDICT TERM IS DELIBERATE AND IS NARROWER THAN THE SPEC'S SKETCH (§5 conditions the
  -- append on the arm alone). The arm firing and the document corroborating are DIFFERENT
  -- facts: the three locks can all hold on a document that another, unchanged belt then refuses
  -- — the executed rounding forge is exactly that shape, and the battery carries it. Stamping
  -- `presumed_non_registrant` on a REFUSED envelope would hand every future consumer a token
  -- that reads as a finding while the verdict beside it says the read is not usable, and a
  -- consumer that branched on the token without re-reading `corroborated` would act on a
  -- refusal. The stamp therefore means what it says: THIS corroboration rests on a presumption.
  -- Narrowing an append is fail-closed in the only direction that matters — a consumer can
  -- never see a presumption that did not carry a verdict. Found by the battery, not by reading.
  if v_nil_tax_arm and v_ok then
    v_out := v_out || jsonb_build_object(
      'tax_basis', 'presumed_non_registrant',
      'tax_basis_note', 'document tax-silent, presumed non-registrant');
  end if;
  return v_out;
end $wit2$;
revoke all on function clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid) from public;

reset role;

-- =====================================================================================
-- §B — FREEZE REGISTRATION. The closure is the SAME four members with the v2 entrypoint at
-- ordinal 0: the entrypoint, the fact digest, the deterministic cents normalizer and the
-- identity verdict leaf. A CATALOG-ONLY search_path makes pg_get_functiondef's qualification
-- stable for BOTH registration and verification (0059:243-245's recorded reason, verbatim);
-- registration under any other search_path stores a hash verify_evaluator_freeze() cannot
-- reproduce. THE ROW IS BORN UNDEPLOYED — clara._tf_evaluator_deploy_once raises CLR08
-- otherwise (0060:96) and admits exactly one undeployed->deployed transition with no other
-- column movable (0060:99-100). The deployed=true flip is a CEREMONY act, never a migration act.
-- =====================================================================================
set local search_path=pg_catalog,pg_temp;
do $fa2_freeze$
declare e uuid; h bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')),'hex'),
           '' order by o),'UTF8')) into h
    from (values (0,'clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'),
                 (1,'clara._fact_hash(uuid,uuid,text,text,bigint)'),
                 (2,'clara._normalize_invoice_cents(text)'),
                 (3,'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)')) m(o,s);
  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    -- migration_version carries the FILE'S OWN NAME, re-pointed in the commit that claimed the
    -- number, exactly as 0092 did (authored as UNNUMBERED_f_a1_predicate.sql, landed as
    -- '0092_f_a1_predicate'). Nothing keys on this value — it is provenance for a human reading
    -- the registry — but leaving it saying UNNUMBERED would point a future reader at a file that
    -- no longer exists.
    values('evaluate_witness_fact_state', 2,
      'clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)', h,
      '0100_f_a2_nil_tax_arm_part2', false) returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')), null::uuid
      from (values (0,'clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'),
                   (1,'clara._fact_hash(uuid,uuid,text,text,bigint)'),
                   (2,'clara._normalize_invoice_cents(text)'),
                   (3,'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)')) m(o,s);
end
$fa2_freeze$;
set local search_path=clara,pg_temp;

-- =====================================================================================
-- §C — THE RESOLVER REPOINT. ONE LINE, ONE BODY (0093:214). clara._invoice_fact_state is NOT
-- touched: it delegates to the 2-arg overload and inherits the repoint. That is the whole point
-- of the F-A1 dispatch design — the measured 11 bodies / 27 call sites are spared, and a missed
-- caller cannot fail silently because there are no callers to miss. Splice discipline as ever:
-- read the LIVE body, assert the anchor is unique (done in §0.5), replace only there, execute.
-- =====================================================================================
set role clara_fn_owner;

do $fa2_repoint$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara._invoice_fact_state_at(uuid,uuid)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'F-A2 §C: clara._invoice_fact_state_at is GONE' using errcode='CLR10';
  end if;
  v_next := replace(v_def,
$old$    return clara.evaluate_witness_fact_state_v1(p_document, v_wtext, v_wvision);$old$,
$new$    return clara.evaluate_witness_fact_state_v2(p_document, v_wtext, v_wvision);$new$);
  if v_next = v_def then
    raise exception 'F-A2 §C: the resolver repoint splice matched nothing' using errcode='CLR10';
  end if;
  execute v_next;
end
$fa2_repoint$;

reset role;

-- =====================================================================================
-- §D — TAIL CENSUS. The evidence a reviewer reads.
-- =====================================================================================
do $fa2_tail2$
declare v_src text; v_pre text; v_n int; v_changed text; v_new text;
        v_callers text; v_c int; v_sites int;
begin
  -- (D1) EXACTLY ONE BODY MOVED AND EXACTLY ONE WAS ADDED, derived from the whole-schema prosrc
  -- snapshot taken before any DDL. THE FIRST HALF IS ALSO THE FREEZE PROOF: v1 is in that
  -- snapshot, so "the changed set is exactly the resolver" is the measured statement that the
  -- frozen v1 body did not move.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_changed
    from pg_proc p join _fa2p2_pre_fn pre on pre.oid = p.oid
   where pre.sha <> encode(sha256(convert_to(p.prosrc,'UTF8')),'hex');
  if coalesce(v_changed,'') <> '_invoice_fact_state_at(uuid,uuid)' then
    raise exception 'F-A2 part2 tail: the set of CHANGED clara bodies is [%] — expected exactly [_invoice_fact_state_at(uuid,uuid)]', coalesce(v_changed,'(none)')
      using errcode='CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_new
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null
     and not exists (select 1 from _fa2p2_pre_fn pre where pre.oid = p.oid);
  if coalesce(v_new,'') <> 'evaluate_witness_fact_state_v2(uuid,uuid,uuid)' then
    raise exception 'F-A2 part2 tail: the set of NEW clara functions is [%] — expected exactly [evaluate_witness_fact_state_v2(uuid,uuid,uuid)]', coalesce(v_new,'(none)')
      using errcode='CLR10';
  end if;
  -- ...and v1 named explicitly, because a census that only says "nothing else changed" reads as
  -- a claim about a set while the freeze is a claim about ONE body.
  select v into v_pre from _fa2p2_pre where k='v1_sha';
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src from pg_proc p
   where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure;
  if v_src is distinct from v_pre then
    raise exception 'F-A2 part2 tail: the FROZEN v1 body moved (% -> %)', v_pre, coalesce(v_src,'(gone)') using errcode='CLR10';
  end if;
  select v into v_pre from _fa2p2_pre where k='v1_deployed';
  select deployed::text into v_src from clara.evaluator_versions
   where evaluator_name='evaluate_witness_fact_state' and version=1;
  if v_src is distinct from v_pre then
    raise exception 'F-A2 part2 tail: the v1 registry row''s deploy flag MOVED (% -> %) — v1 stays registered exactly as it was; it merely becomes unreachable', v_pre, coalesce(v_src,'(gone)') using errcode='CLR10';
  end if;

  -- (D2) NO CONFIDENCE TERM in v2's EXECUTABLE text (ADR-047 Q1). Comments are stripped first:
  -- a body may legitimately DOCUMENT the term's absence, and a guard that reads the commentary
  -- reads a projection of the code rather than the code (review law 3).
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'::regprocedure;
  if v_src ~* 'engine_confidence|\mv_conf\M' then
    raise exception 'F-A2 part2 tail: the v2 predicate reads engine_confidence — ADR-047 Q1 dropped confidence from gating ENTIRELY' using errcode='CLR10';
  end if;

  -- (D3) POSTURE — the T18 hygiene the rig sweeps for, so the migration notices first.
  if not exists (select 1 from pg_proc p
                  where p.oid='clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                    and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A2 part2 tail: the v2 predicate is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f
             cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
              where f.oid='clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'::regprocedure
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'F-A2 part2 tail: PUBLIC executes the v2 predicate' using errcode='CLR10';
  end if;

  -- (D4) THE FREEZE REPRODUCES, and the witness closure now carries TWO versions / EIGHT member
  -- rows. Run HERE rather than left to the runner's between-migrations hook, so a broken closure
  -- names THIS file rather than the next one.
  perform clara.verify_evaluator_freeze();
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions v on v.id = m.evaluator_version_id
   where v.evaluator_name = 'evaluate_witness_fact_state';
  if v_n <> 8 then
    raise exception 'F-A2 part2 tail: the witness closure family has % member rows, expected 8 (two versions x four members)', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_versions
   where evaluator_name='evaluate_witness_fact_state' and version=2 and not deployed;
  if v_n <> 1 then
    raise exception 'F-A2 part2 tail: the v2 registry row is missing or was born DEPLOYED — the deploy flip is a ceremony act, never a migration act' using errcode='CLR10';
  end if;

  -- (D5) EVERY clara FUNCTION v2 CALLS IS IN THE CLOSURE, and the converse: it calls NOTHING
  -- outside it. A hand-maintained member list is exactly the thing that drifts, so the check
  -- reads the COMMITTED body. THE CAPTURE COVERS BOTH STEMS (M7) — the identity leaf's name
  -- begins `evaluate_`, so a probe matching only the underscore stem would stop SEEING it, and a
  -- converse check that cannot see a member is a check whose YES means nothing. The ordering is
  -- pinned to the "C" collation because the two stems sort differently under a locale collation
  -- and this string is compared literally.
  foreach v_src in array array['_fact_hash','_normalize_invoice_cents','evaluate_witness_identity_v1'] loop
    if position('clara.'||v_src||'(' in
        (select p.prosrc from pg_proc p where p.oid='clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'::regprocedure)) = 0 then
      raise exception 'F-A2 part2 tail: the v2 predicate does not call clara.% — the frozen closure claims a member the body does not use', v_src using errcode='CLR10';
    end if;
  end loop;
  select string_agg(x.n, ', ' order by x.n collate "C") into v_src
    from (select distinct m[1] as n from regexp_matches(
            (select p.prosrc from pg_proc p where p.oid='clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)'::regprocedure),
            'clara\.((?:_|evaluate_)[a-z0-9_]+)\s*\(', 'g') as m) x;
  if coalesce(v_src,'') <> '_fact_hash, _normalize_invoice_cents, evaluate_witness_identity_v1' then
    raise exception 'F-A2 part2 tail: the v2 predicate calls clara functions [%] — the frozen closure covers exactly [_fact_hash, _normalize_invoice_cents, evaluate_witness_identity_v1]; a called leaf outside the closure is the half-freeze this discipline exists to prevent, and a prose mention in call form inside a comment reads as a call', coalesce(v_src,'(none)')
      using errcode='CLR10';
  end if;

  -- (D6) THE REPOINT LANDED AND EVERYTHING AROUND IT SURVIVED BYTE-FOR-BYTE. Not "the branch is
  -- still mentioned": the ENTIRE pre-recut tail of the resolver, from its first legacy statement
  -- to its last, must appear VERBATIM in the new body — which covers the structured `clara-%`
  -- branch, the OCR belt set, the envelope assembly and every conditional append at once.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  select v into v_pre from _fa2p2_pre where k='at_tail';
  if position(v_pre in v_src) = 0 then
    raise exception 'F-A2 part2 tail: the pre-recut tail of clara._invoice_fact_state_at is NOT present verbatim — the structured branch and/or the OCR belt set moved' using errcode='CLR10';
  end if;
  if position('evaluate_witness_fact_state_v2' in v_src) = 0 then
    raise exception 'F-A2 part2 tail: clara._invoice_fact_state_at does not dispatch to v2' using errcode='CLR10';
  end if;
  if position('evaluate_witness_fact_state_v1' in v_src) <> 0 then
    raise exception 'F-A2 part2 tail: clara._invoice_fact_state_at STILL names v1 — the repoint left the old dispatch reachable' using errcode='CLR10';
  end if;
  foreach v_pre in array array[
      $k1$  if v_wk in ('llm_text_facts','llm_vision_facts') then$k1$,
      $k2$       and e4.engine_kind = 'llm_text_facts' and e4.status = 'done';$k2$,
      $k3$       and e4.engine_kind = 'llm_vision_facts' and e4.status = 'done';$k3$] loop
    if position(v_pre in v_src) = 0 then
      raise exception 'F-A2 part2 tail: the F-A1 pair-resolution block lost [%] — the repoint must move ONE line and nothing else', v_pre using errcode='CLR10';
    end if;
  end loop;
  if regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g') ~* 'engine_confidence|\mv_conf\M' then
    raise exception 'F-A2 part2 tail: a confidence term reappeared in the EXECUTABLE text of clara._invoice_fact_state_at' using errcode='CLR10';
  end if;

  -- (D7) THE CALLER CENSUS, CARRIED FORWARD (0093:345-384). The population the dispatch spares,
  -- read from the LIVE catalog and NAMED, because "~30 call sites" is a claim and a count is
  -- evidence. COMMENTS ARE STRIPPED FIRST — a body that merely NAMES the resolver in prose is
  -- not a caller. THE FLOOR IS THE NAMED ROSTER, not a number: a count alone passes a
  -- substitution, and five arbitrary bodies clearing a floor of five says nothing about whether
  -- the ones the dispatch EXISTS FOR are among them.
  select count(*)::int, string_agg(x.proname, ', ' order by x.proname collate "C"),
         sum(x.sites)::int
    into v_c, v_callers, v_sites
    from (select p.proname,
                 (length(s.src) - length(replace(s.src, 'clara._invoice_fact_state', '')))
                   / length('clara._invoice_fact_state') as sites
            from pg_proc p
            cross join lateral (select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') as src) s
           where p.pronamespace='clara'::regnamespace and p.prosrc is not null
             and p.proname not in ('_invoice_fact_state','_invoice_fact_state_at')
             and position('clara._invoice_fact_state' in s.src) > 0) x;
  raise notice 'F-A2 caller census: % clara bodies / % call sites reach the resolver and were NOT changed: %', v_c, v_sites, coalesce(v_callers,'(none)');
  if coalesce(v_c,0) < 7 or coalesce(v_sites,0) < v_c then
    raise exception 'F-A2 part2 tail: caller census reads % bodies / % sites — the instrument is not measuring what it claims', coalesce(v_c,0), coalesce(v_sites,0) using errcode='CLR10';
  end if;
  foreach v_src in array array['_write_entry_evidence','execute_rule_post',
      '_assert_supplier_bill_shape_at','_assert_sales_invoice_shape_at',
      '_coding_lane_core','_draft_entry_core','_approve_entry_core'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
                     and p.proname = v_src
                     and regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') like '%clara._invoice_fact_state%') then
      raise exception 'F-A2 part2 tail: clara.% no longer reaches the resolver in its EXECUTABLE text — a behaviour-bearing consumer would NOT inherit this repoint', v_src using errcode='CLR10';
    end if;
  end loop;

  raise notice 'F-A2 part2 tail: OK — 1 evaluator added and exactly 1 live body recut; the FROZEN v1 body is byte-unmoved and its registry row''s deploy flag is exactly where this file found it; the v2 closure is registered UNDEPLOYED with 4 members (8 across the family), closed (calls = members) and verify_evaluator_freeze() green; definer posture pinned, PUBLIC has no EXECUTE, no confidence term; the resolver now names v2 and no longer names v1, its 0023 tail and the F-A1 pair-resolution block survive verbatim; % caller bodies / % call sites spared and all SEVEN behaviour-bearing consumers named individually.', v_c, v_sites;
end
$fa2_tail2$;
