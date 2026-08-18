-- 0092_f_a1_predicate.sql — F-A1 PR-1, part 1 of 3: THE SUCCESSOR PREDICATE.
-- =====================================================================================
-- MIGRATION NUMBER IS CLAIMED AT MERGE TIME (hard constraint 10; .claude/rules/db-migrations.md);
-- nothing keys on it — the battery gates on the STABLE SUFFIX `_f_a1_predicate`. SPLIT INTO
-- THREE FILES (the split predates the adjudicated review fold below, which took this file past
-- the harness's 500-line advisory — the same call 0090 made at 1803 lines, and for the same
-- reason: self-contained prestate/tail evidence outranks fragmentation, and re-splitting a file
-- whose freeze hash and prestate chain are already authored would buy nothing), applied in
-- ALPHABETICAL order (identity_helper ->
-- predicate -> predicate_part2), each SELF-CONTAINED (own quiesce guard, prestate and tail; no
-- temp table crosses files, because a deploy-onto-existing run may apply only one): part 0 adds
-- the identity verdict leaf, part 1 (this file) adds clara.evaluate_witness_fact_state_v1 and
-- freezes the closure while changing NO live body, part 2 ships the TWO dispatch recuts + the
-- caller census and is where the hot path moves. Design of record: f-a1-witness-pair-design.md
-- §3.1/§3.3/§3.4 + f-a1-annexes.md Annex A (estate), Annex B (B1·B2·B3·M6·M12·M15), Annex C.
-- NOT SHIPPED HERE: no lane/engine_kind/prefix CHECK widening (PR-1's WALLS lane), no
-- persist_witness_facts (writer lane), no 0017 trigger fix (precondition lane), no router or
-- re-extraction door change, no grant change, no new field_path. Inert on a database where no
-- witness row can exist, which is why it lands before or after its sibling lanes.
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation
-- SEARCH PATH PINNED FOR THE WHOLE FILE, and load-bearing rather than cosmetic: the tail
-- compares a prestate function census against a post-DDL one, and identity-argument rendering of
-- a clara COMPOSITE argument type is qualified-or-bare depending on the session path. §B must
-- flip to a catalog-only path for the freeze hashes (0059's reason) and flip back, so an
-- unpinned path made two untouched functions look like a deletion plus a creation. FOUND BY THE
-- RIG, not by reading. The census keys on oid as well — belt and buckle.
set local search_path = clara, pg_temp;

-- §0 QUIESCE GUARD (0023:77-98 verbatim in argument and threshold). Part 1 only ADDS, so its own
-- D1 exposure is nil — but the two files are ONE ceremony and a half-applied pair is worse than
-- an unapplied one, so both refuse under a live runtime and the window opens once. FAIL CLOSED
-- on absence: 0006 creates the table and always precedes this file, so absence is catalog drift,
-- and drift is exactly when a runtime is most likely alive and unobservable.
do $fa1_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A1 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A1 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — part 2 of this pair replaces two live hot-path bodies and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa1_quiesce$;

-- §0.1 PRESTATE — measure every claim this file makes about what it is editing.
create temp table _fa1p1_pre_fn(oid oid primary key, sha text);
do $fa1_pre$
declare v_src text; v_n int;
begin
  -- (0.1) The declared frozen-closure leaves exist AT THE SIGNATURES THIS FILE FREEZES. Freezing
  -- one that does not resolve makes verify_evaluator_freeze() raise at the NEXT migration.
  begin
    perform 'clara._fact_hash(uuid,uuid,text,text,bigint)'::regprocedure;
    perform 'clara._normalize_invoice_cents(text)'::regprocedure;
    perform 'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)'::regprocedure;
  exception when others then
    raise exception 'F-A1 prestate: a declared frozen-closure leaf is absent (clara._fact_hash / clara._normalize_invoice_cents / clara.evaluate_witness_identity_v1 — apply 0091_f_a1_identity_helper.sql FIRST)' using errcode='CLR10';
  end;
  -- (0.2) NOT ALREADY APPLIED — a second apply fails loudly, never silently re-registers.
  if to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is not null then
    raise exception 'F-A1 prestate: clara.evaluate_witness_fact_state_v1 already exists — already applied' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_versions where evaluator_name='evaluate_witness_fact_state';
  if v_n <> 0 then
    raise exception 'F-A1 prestate: clara.evaluator_versions already carries % witness row(s)', v_n using errcode='CLR10';
  end if;
  -- (0.3) THE FREEZE'S NAMED RESIDUAL (design §3.3): clara._write_entry_evidence INLINES the
  -- identical fact digest (0009:456-459) rather than calling clara._fact_hash, and the two must
  -- stay byte-agreed or the verified tier silently evaporates. The battery proves they agree.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure;
  if position('encode(sha256(convert_to(jsonb_build_object(' in v_src) = 0
     or position('''monetary_cents'', x.monetary_cents)::text, ''UTF8'')), ''hex'')' in v_src) = 0 then
    raise exception 'F-A1 prestate: clara._write_entry_evidence no longer carries the INLINE fact digest this freeze pairs with — re-derive the closure before freezing clara._fact_hash' using errcode='CLR10';
  end if;
  -- (0.4) A whole-schema body snapshot, so the tail can prove this file changed NOTHING live.
  insert into _fa1p1_pre_fn(oid, sha)
  select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null;
  select count(*)::int into v_n from _fa1p1_pre_fn;
  raise notice 'F-A1 part1 prestate: clean — closure leaves present, evaluator absent, % clara bodies snapshotted', v_n;
end
$fa1_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.evaluate_witness_fact_state_v1: THE SUCCESSOR PREDICATE
-- =====================================================================================
-- WHAT IT DECIDES: whether a WITNESS PAIR — one text-channel read and one vision-channel read
-- of the SAME document at the SAME task generation — corroborates the invoice total to the sen.
-- Same kind of answer 0023's OCR branch gives, from a different pair of readers, carrying every
-- one of 0023's belts forward. Design §3.3 is the conjunct census; each conjunct cites its line.
--
-- WHY THE NAME MATTERS: check-frozen-evaluators.mjs:62 discovers ONLY `clara.evaluate_*`; any
-- other name would be catalog-frozen (DB registry) but SOURCE-unfrozen (manifest) — the exact
-- half-freeze that lint's own note warns about. `_v1` is the versioning door the signature-pinned
-- verifier requires: a behavioural change ships as `_v2` with its own row, never as a CoR.
--
-- WHERE EACH SIDE'S NUMBERS COME FROM — the asymmetry is deliberate and is PR-0 B2's ruling.
-- TEXT side: clara.document_regions on the TEXT extraction, SERVER-VERIFIED at write time
-- (design §3.4 cite-and-verify: the witness cites a region idx; the server resolves idx->uuid
-- against the PINNED ocr extraction and checks the quoted rendering is a substring of that
-- region's text AND parses to the claimed cents). VISION side: the vision row's ENVELOPE — that
-- channel never sees regions so it cannot cite, and contributes a VALUE only (design §3.1: the
-- vision row is region-less by construction, which is also what keeps bound-extraction
-- consumers pointed at one row). Its cents are NOT taken from the model: this body re-derives
-- them from the witness's quoted rendering with clara._normalize_invoice_cents, the same
-- deterministic normalizer the write boundary uses, so no model-asserted numeral enters the
-- comparison (PRD §6). That is 0023:194-200's posture INHERITED, not claimed stronger.
--
-- NO CONFIDENCE TERM EXISTS ANYWHERE IN THIS BODY, stated so a later reader cannot reintroduce
-- one: ADR-047 Q1 dropped vendor confidence from gating entirely (it passed 0 of 29 real
-- documents at 0.95 while the polygon and MYR walls passed 29/29). §C asserts its absence.
--
-- THE THREE FIELD CLASSES, and why the belts are not uniform (adjudicated review B1). The
-- ELEVEN belt fields are all REQUIRED-ANSWER, but they are not all AMOUNTS:
--   · the NINE monetary members carry the full weight — one verified region, real page_polygon
--     geometry (C2), and sen-exact cross-channel agreement on cents the DB re-derives itself;
--   · `invoice.currency` is a TOKEN. Its citation is OPTIONAL (a real Malaysian invoice prints
--     "RM 103.75" and never a standalone MYR string to cite), it carries NO geometry conjunct,
--     and its rule is the ported confirm-or-refuse law: BOTH channels must independently reduce
--     to RM/MYR, an explicit foreign token on either sets explicit_non_myr, everything else is
--     simply not corroborated;
--   · `invoice.type_code` is a TOKEN too — optional citation, no geometry, value read from the
--     ANSWER, still '01'-or-refuse with cross-channel equality (M12).
-- Demanding C2 geometry of the two token fields was the review's B1 finding: it would have
-- refused every honest invoice that does not print a currency word, which is most of them.
--
-- THE REQUIRED-ANSWER RULE (design §3.3, PR-0 B1) — why absence-permissive belts do not go
-- vacuous here. 0023's belts are written against a producer that emits what it FOUND, so
-- `amount_due absent-or-equal` is safe: absence means the mapper looked and found nothing. Under
-- a supplier that CHOOSES what to emit, absence stops meaning that — a witness that simply omits
-- `amount_due` would take the absence arm of every belt for free. So every belt field is REQUIRED
-- in both witness schemas, answered with a value or an explicit `not_printed` token; a MISSING
-- answer is a refused read (the row still persists whole per C4 — the writer never refuses a read
-- for being wrong — but silence is NOT corroboration), and `not_printed` takes the belt's absence
-- arm. Silence is a refusal, never a pass (law 27(2)). AND THE TWO
-- STATEMENTS OF ONE WITNESS MUST AGREE: the text witness says each thing twice, once as an
-- envelope answer and once as a cited region the server verified, so `value` must mean EXACTLY
-- ONE verified region and `not_printed` NO region at all. A witness whose envelope contradicts
-- its own citations has not read the document, whichever half happens to be right.
create function clara.evaluate_witness_fact_state_v1(p_document uuid, p_text_x uuid, p_vision_x uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $wit$
declare
  v_text_id uuid; v_vision_id uuid; v_tvn int; v_vvn int; v_refusal text;
  v_teid text; v_veid text; v_tenv jsonb; v_venv jsonb;
  v_tans jsonb; v_vans jsonb; v_reg jsonb; v_ineligible text; v_contest boolean := false;
  -- THE BELT ROSTER — every field whose answer is REQUIRED in BOTH schemas (B1). The nine
  -- monetary members are also the ones C2 anchors to a region with real geometry.
  v_belt text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit','invoice.currency','invoice.type_code'];
  v_money text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit'];
  v_f text; v_ta jsonb; v_va jsonb; v_ts text; v_vs text; v_n int;
  v_answers_ok boolean := true; v_agree_ok boolean := true; v_c2_ok boolean := true;
  v_tval bigint; v_vval bigint; v_ttxt text; v_vtxt text;
  -- MYR EVIDENCE, one verdict per channel (review B1): 'myr' | 'foreign' | 'none'.
  v_tmyr text := 'none'; v_vmyr text := 'none';
  -- M3, the reference-value contract: the emitted invoice_id / invoice_date per channel.
  v_tref text; v_vref text;
  -- the belts themselves, named as 0023 names them so the two predicates read alike
  v_total_count int; v_total_region uuid; v_total bigint; v_locator text;
  v_locator_json jsonb; v_poly_ok boolean; v_hash text; v_currency text; v_vcurrency text;
  v_due bigint; v_deposit bigint; v_due_c int; v_deposit_c int;
  v_net bigint; v_tax bigint; v_net_c int; v_tax_c int; v_rounding bigint; v_round_c int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
  v_type text; v_type_c int; v_invoice_id text; v_invoice_date text;
  v_customer text; v_customer_reg text; v_ok boolean; v_out jsonb;
  v_ident jsonb; v_vreg_verdict text; v_creg_verdict text; v_flag_contest boolean := false;
begin
  -- 1. PAIR RESOLUTION (design §3.1, M15). THE PAIR KEY, WRITTEN OUT:
  -- (document_id, engine_id, version_n) resolving TWO rows distinguished by engine_kind, both
  -- carrying ONE SHARED engine_id. This deliberately INVERTS the statement pair's discriminator
  -- (0038:1769-1780: one kind, two engine_ids, same-engine_id refused) — here the KIND
  -- discriminates and engine_id carries the shared model identity, so that refusal is NOT
  -- mirrored: under two kinds it could never fire, and a probe that cannot say NO has a
  -- meaningless YES. A CROSS-GENERATION PAIR REFUSES: pairing a v2 text read with a v1 vision
  -- read would be "agreement" between two readings of two different moments.
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
  -- NEITHER row is required to be un-superseded, deliberately: the 0017 trigger is kind-blind
  -- today and a one-transaction pair supersedes itself by uuid coin flip (design §3.9 — PR-1's
  -- trigger lane owns that, not this file). A superseded_by filter here would make this
  -- predicate's answer depend on a defect it does not own, and the live `_invoice_fact_state_at`
  -- carries no such filter either. THE REFUSAL ENVELOPE IS NOT '{}': the live resolver's
  -- empty-object return is the central hazard design §3.3 exists to close (every consumer's
  -- `corroborated` check passes silently on it), so an unresolvable pair returns a REAL
  -- envelope whose `corroborated` is FALSE.
  if v_refusal is not null then
    return jsonb_build_object(
      'extraction_id', v_text_id, 'version_n', v_tvn, 'total_region_id', null,
      'total_cents', null, 'total_fact_hash', null, 'currency', null,
      'invoice_id', null, 'invoice_date', null,
      'corroboration_ineligible', nullif(btrim(v_tenv->>'corroboration_ineligible'),''),
      'corroborated', false, 'explicit_non_myr', false,
      'regime', 'witness', 'vision_extraction_id', v_vision_id, 'pair_refusal', v_refusal);
  end if;
  -- The ineligibility envelope gate (0023:309) read across BOTH rows: either witness may
  -- declare its own read corroboration-ineligible, and either declaration is decisive.
  v_ineligible := coalesce(nullif(btrim(v_tenv->>'corroboration_ineligible'),''),
                           nullif(btrim(v_venv->>'corroboration_ineligible'),''));
  v_contest := coalesce((v_tenv->'witness'->>'contest')::boolean, false)
            or coalesce((v_venv->'witness'->>'contest')::boolean, false);

  -- 2. THE TEXT ROW'S SERVER-VERIFIED REGIONS. One aggregate per field_path carrying the
  -- cardinality COUNT beside every value — 0023's RESIDUAL-4 discipline: a conflicting DUPLICATE
  -- must REJECT corroboration, never be min()-selected away.
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
  -- 0023:238-239's W3 guard, NULL-safe via `case` rather than `and`: jsonb_array_length RAISES
  -- on a non-array instead of returning null.
  v_poly_ok := case when jsonb_typeof(v_locator_json->'polygon') = 'array'
                    then jsonb_array_length(v_locator_json->'polygon') > 0 else false end;
  -- v_currency / v_vcurrency are NOT read here: their evidence is the ANSWERED rendering on each
  -- channel (the citation is optional for a token field — review B1), computed after the roster
  -- loop below where both answer maps are in hand.
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
  if v_total_region is not null then  -- 0023:232-235, verbatim
    select clara._fact_hash(r.extraction_id, r.id, r.field_path, r.text_content,
      r.monetary_cents) into v_hash from clara.document_regions r where r.id = v_total_region;
  end if;

  -- 3. REQUIRED ANSWERS · C2 ANCHORING · PER-FIELD SEN-EXACT AGREEMENT.
  v_tans := v_tenv->'witness'->'answers'; v_vans := v_venv->'witness'->'answers';
  if jsonb_typeof(v_tans) <> 'object' or jsonb_typeof(v_vans) <> 'object' then
    v_answers_ok := false; v_agree_ok := false;   -- no roster at all is the completest silence
  else
    foreach v_f in array v_belt loop
      v_ta := v_tans->v_f; v_va := v_vans->v_f;
      if jsonb_typeof(v_ta) <> 'object' or jsonb_typeof(v_va) <> 'object' then
        v_answers_ok := false; continue;              -- MISSING answer -> refused read (B1)
      end if;
      v_ts := v_ta->>'state'; v_vs := v_va->>'state';
      if v_ts is null or v_vs is null
         or v_ts not in ('value','not_printed') or v_vs not in ('value','not_printed') then
        v_answers_ok := false; continue;
      end if;
      v_n := coalesce((v_reg->v_f->>'n')::int, 0);
      -- ENVELOPE ANSWER vs THE SERVER-VERIFIED CITATIONS: they must not contradict — and the
      -- cardinality rule is FIELD-CLASS SCOPED (review B1). For the NINE MONETARY members a
      -- `value` answer must name EXACTLY ONE verified region: that pairing IS C2. For
      -- `invoice.currency` / `invoice.type_code` the citation is OPTIONAL — §3.4 numbers
      -- AMOUNTS, and a real Malaysian invoice prints "RM 103.75" with no MYR token anywhere to
      -- cite — so `value` admits zero-or-one region and only a conflicting DUPLICATE refuses.
      -- `not_printed` still admits NO region on ANY field: a witness whose envelope denies a fact
      -- its own citation asserts has not read the document, whichever half happens to be right.
      if v_ts = 'not_printed' and v_n <> 0 then v_answers_ok := false; continue; end if;
      if v_ts = 'value' and (case when v_f = any(v_money) then v_n <> 1 else v_n > 1 end) then
        v_answers_ok := false; continue;
      end if;
      -- C2 (design §1, §3.4): every witnessed AMOUNT binds server-side to a layout region with
      -- real geometry — the NINE monetary members, as the design's own "every witnessed AMOUNT"
      -- and this body's roster comment (:136-137) both say. A missing/failed citation persists
      -- the fact geometry-less (the permissive-writer/strict-reader split) and this is the strict
      -- half. currency/type_code carry NO geometry conjunct: they are TOKENS, not amounts, and a
      -- geometry demand on them refuses the honest invoice that never prints the token at all.
      if v_ts = 'value' and v_f = any(v_money)
         and (coalesce(v_reg->v_f->>'locator_kind','') <> 'page_polygon'
              or case when jsonb_typeof(v_reg->v_f->'locator'->'polygon') = 'array'
                      then jsonb_array_length(v_reg->v_f->'locator'->'polygon') = 0
                      else true end) then
        v_c2_ok := false;
      end if;
      -- AGREEMENT, PER FIELD, TO THE SEN. Absence agrees only with absence: a field one witness
      -- read and the other did not is a disagreement, not half a corroboration.
      if v_ts <> v_vs then v_agree_ok := false; continue; end if;
      if v_ts = 'not_printed' then continue; end if;
      if v_f = any(v_money) then
        v_tval := (v_reg->v_f->>'cents')::bigint;
        -- M6, THE MAGNITUDE PRE-GUARD. clara._normalize_invoice_cents multiplies by 100 and casts
        -- to bigint, so a rendering with more than 13 digits before the decimal RAISES 22003 —
        -- and a raise out of a STABLE read predicate is not a refusal, it is a read nobody can
        -- make: every consumer's `_invoice_fact_state` call would explode on one absurd witness
        -- string. A present-but-unreadable amount must fall to NOT CORROBORATED instead. The leaf
        -- is a FROZEN closure member and cannot be repaired in place, so the guard lives at the
        -- caller — here and in the writer's own verifier (0095), the two call sites that can be
        -- handed an unbounded model rendering.
        if length(regexp_replace(split_part(regexp_replace(
             upper(btrim(coalesce(v_va->>'raw',''))), '(MYR|RM)|[,[:space:]]', '', 'g'),
             '.', 1), '[^0-9]', '', 'g')) > 13 then
          v_vval := null;
        else
          v_vval := clara._normalize_invoice_cents(v_va->>'raw');
        end if;
        if v_tval is null or v_vval is null or v_tval <> v_vval then v_agree_ok := false; end if;
      elsif v_f = 'invoice.type_code' then
        -- M12, on the ANSWERS rather than the region, because the citation is optional here:
        -- cross-channel equality when both answer (both `value` by the state check above).
        v_ttxt := nullif(btrim(coalesce(v_ta->>'raw','')),'');
        v_vtxt := nullif(btrim(coalesce(v_va->>'raw','')),'');
        if v_ttxt is null or v_vtxt is null or v_ttxt <> v_vtxt then v_agree_ok := false; end if;
      end if;
      -- invoice.currency deliberately has NO per-field equality conjunct: its rule is the
      -- two-channel MYR confirm-or-refuse below, which is STRICTLY STRONGER (two channels
      -- agreeing on 'USD' must not corroborate), so an equality term here would be dead weight
      -- that reads like a second, weaker wall.
    end loop;
  end if;

  -- THE MYR EVIDENCE RULE (design §3.3; invoice-currency-reader.mjs:280-306's confirm-or-refuse
  -- law, PORTED). Read off each channel's ANSWERED RENDERING — the citation is optional for this
  -- field — and three-valued, per channel:
  --   uppercase ALPHABETIC reduction of the raw in ('RM','MYR')  -> 'myr'      MYR-confirmed
  --   a recognisably FOREIGN token (ISO code or currency symbol) -> 'foreign'  explicit_non_myr
  --   anything else, `not_printed`, or absent                    -> 'none'     never corroborates
  -- BOTH channels must independently reach 'myr'. THE ASYMMETRY: absence or disagreement is NOT
  -- corroboration and is never manufactured into one — 0023:306's behaviour preserved, and
  -- behaviourally OPPOSITE to the STATEMENT posture's absence->MYR (WC-R5); design §3.7 records
  -- that the divergence must not be silently unified. The foreign test reads the RAW rather than
  -- the alphabetic reduction because '$', '€' and '£' carry no letters at all; MYR/RM are settled
  -- FIRST, so a Malaysian rendering can never fall through into it.
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

  -- M12's VALUE, sourced from the TEXT channel's ANSWER for the same reason (optional citation);
  -- the region's text_content is the identical string whenever one exists, because the writer
  -- writes text_content = answers[f].raw — so this widens the SOURCE, never the value.
  v_type := coalesce(
    case when v_tans->'invoice.type_code'->>'state' = 'value'
         then nullif(btrim(coalesce(v_tans->'invoice.type_code'->>'raw','')),'') end,
    v_reg->'invoice.type_code'->>'text');

  -- M3, THE REFERENCE-VALUE CONTRACT. `invoice.invoice_id` / `invoice.invoice_date` may be
  -- answered OPTIONALLY by EITHER channel, carrying a normalized `value` beside the document's
  -- own `raw` rendering. WHY IT EXISTS: the duplicate-bill wall (0015:1402) and the duplicate-
  -- sales wall (0015:1425-1429) compare `_invoice_fact_state(...)->>'invoice_id'` /
  -- `'invoice_date'` by EXACT EQUALITY ACROSS REGIMES — a legacy Azure read emits the typed,
  -- normalized value ("INV-001", "2026-01-15") while a witness's citable rendering must be a
  -- SUBSTRING of the OCR region it cites ("Invoice No.: INV-001", "15/01/2026"). Without the
  -- value slot the same bill read twice under two regimes would never collide and the wall would
  -- go SILENTLY PERMISSIVE. ABSENCE-PERMISSIVE AND NEVER AMOUNT-BLOCKING: a cross-channel
  -- disagreement DROPS the key (0023:357-364's conditional-append shape) rather than refusing the
  -- total — these are reference strings, not the numeral corroboration is about.
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

  -- 4. THE VERDICT — 0023's OCR belt set IN FULL plus M12's type_code. Nothing from 0023's OCR
  -- branch is dropped; two things are ADDED: the type_code requirement (M12), and the
  -- answer/agreement machinery above, which replaces the `typed_collapsed` outcome evidence
  -- 0023 reads from a mapper this regime does not have.
  v_ok := v_answers_ok and v_agree_ok and v_c2_ok
    and v_total_count = 1 and v_total is not null and v_total > 0        -- 0023:304
    and v_locator = 'page_polygon' and v_poly_ok                          -- 0023:305 (W3)
    -- MYR ASYMMETRY, BOTH CHANNELS — the three-valued evidence rule computed above. 'none' and
    -- 'foreign' both refuse; only two independent 'myr' confirmations corroborate.
    and v_tmyr = 'myr' and v_vmyr = 'myr'
    and (v_due_c = 0 or (v_due is not null and v_due = v_total))          -- 0023:307
    and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))    -- 0023:308
    and v_ineligible is null                                              -- 0023:309, both rows
    -- net AND tax STATED and SINGLE (0023:310-311). THE NIL-TAX LAW (0023:299-303): a document
    -- that does not state its tax has proven nothing about its tax, and unattended posting
    -- authority is not the place to infer a zero. `not_printed` is an ANSWER, not a zero — it
    -- takes the absence arm, and for tax the absence arm is refusal.
    and v_net is not null and v_net_c = 1 and v_tax is not null and v_tax_c = 1
    and v_net >= 0 and v_tax >= 0                                         -- 0023:315-321
    -- CN/DN ARE CORROBORATION-INELIGIBLE (M12) — the structured branch's 0023:243-245 posture
    -- inherited: only an EXPLICIT type 01 corroborates the invoice-total equation and a missing
    -- type never defaults to 01. A witness reliably reports type_code where Azure rarely did,
    -- which is what closes the old OCR branch's silent gap.
    and v_type = '01' and v_type_c <= 1
    and v_round_c <= 1 and (v_round_c = 0 or v_rounding is not null)      -- 0023:325-328
    and v_sc_c <= 1 and (v_sc_c = 0 or v_sc is not null)
    and v_disc_c <= 1 and (v_disc_c = 0 or v_disc is not null)
    and v_dlv_c <= 1 and (v_dlv_c = 0 or v_dlv is not null)
    -- THE SIGN BELT (0023:329-333): the identity SUBTRACTS the discount, so a negative one turns
    -- that subtraction into an addition and forges a larger gross that ties exactly.
    and coalesce(v_sc, 0) >= 0 and coalesce(v_disc, 0) >= 0 and coalesce(v_dlv, 0) >= 0
    -- ROUNDING IS BOUNDED (0023:334-341, carrying an EXECUTED forge counterexample: subtotal
    -- 200, zero tax, a parsed `Rounding -100.00` and a stated total of 100 certifies
    -- 200 - 100 = 100). 99 sen is what the word can mean.
    and coalesce(abs(v_rounding), 0) <= 99
    and (v_net + coalesce(v_sc, 0) + coalesce(v_dlv, 0) + v_tax + coalesce(v_rounding, 0)
         - coalesce(v_disc, 0)) = v_total;                                -- 0023:345-346
  -- COALESCED TO FALSE, not as decoration (0023:208-214's argument, verbatim in force): a
  -- three-valued corroboration flag is a trap for any consumer that tests `is not false` rather
  -- than `= true`. Absence of evidence is FALSE here, explicitly.
  v_ok := coalesce(v_ok, false);

  -- 5. IDENTITY — delegated whole to the frozen closure leaf clara.evaluate_witness_identity_v1 (its own
  -- file, its own header, closure ordinal 3): the geometric block-attribution test over the
  -- PINNED OCR polygons, plus the SELF-REFERENTIAL WITHDRAWAL and contest-withdraws. It returns
  -- VERDICTS ONLY. `corroborated` above carries NO identity term (design §3.3, N5) — it stays an
  -- AMOUNT verdict, today's posture unchanged — and these verdicts surface as witness-regime-only
  -- conditional keys, never as new keys on a legacy output.
  v_ident := clara.evaluate_witness_identity_v1(p_document, v_text_id, v_contest);
  v_vreg_verdict := v_ident->>'vendor_registration_verdict';
  v_creg_verdict := v_ident->>'customer_registration_verdict';
  v_flag_contest := coalesce((v_ident->>'identity_contest')::boolean, false);

  -- 6. THE OUTPUT ENVELOPE — BYTE-COMPATIBLE WITH THE FULL LIVE KEY SET (0023:348-364), not a
  -- subset, and that means the same EMISSION RULES rather than always-emit-all-17: the six
  -- conditional keys (four sales/SST + customer_name/customer_registration — N4) stay appended
  -- only-when-non-null, which is 0023:357-364's own exact-diff reason.
  v_out := jsonb_build_object(
    'extraction_id', v_text_id, 'version_n', v_tvn,
    'total_region_id', v_total_region, 'total_cents', v_total,
    'total_fact_hash', v_hash, 'currency', nullif(v_currency,''),
    'invoice_id', v_invoice_id, 'invoice_date', v_invoice_date,
    'corroboration_ineligible', v_ineligible, 'corroborated', v_ok,
    -- EXPLICIT foreign currency on EITHER channel trips this (design §3.3: "explicit foreign ->
    -- explicit_non_myr -> CLR21 currency_unsupported"). 0023:355 reads one channel because it
    -- has one; the extra disjunct only ever ADDS refusals. It reads the THREE-VALUED verdict, so
    -- 'none' (absence, or a rendering that names no currency at all) is not a foreign reading —
    -- 0023:355's literal `<> 'MYR'` would have called a bare "RM" foreign, which it is not.
    'explicit_non_myr', v_tmyr = 'foreign' or v_vmyr = 'foreign');
  if v_net is not null then v_out := v_out || jsonb_build_object('total_excl_tax_cents',v_net); end if;
  if v_tax is not null then v_out := v_out || jsonb_build_object('tax_total_cents',v_tax); end if;
  if v_rounding is not null then v_out := v_out || jsonb_build_object('rounding_cents',v_rounding); end if;
  if v_type is not null then v_out := v_out || jsonb_build_object('type_code',v_type); end if;
  if v_customer is not null then v_out := v_out || jsonb_build_object('customer_name',v_customer); end if;
  if v_customer_reg is not null then v_out := v_out || jsonb_build_object('customer_registration',v_customer_reg); end if;
  -- WITNESS-REGIME-ONLY KEYS (N5). These can never appear on a legacy output — part 2 leaves the
  -- legacy branches byte-untouched and they cannot emit them — so no consumer of the legacy
  -- envelope can be surprised by a key it has never seen.
  v_out := v_out || jsonb_build_object('regime','witness','vision_extraction_id',v_vision_id);
  if v_vreg_verdict is not null then v_out := v_out || jsonb_build_object('vendor_registration_verdict',v_vreg_verdict); end if;
  if v_creg_verdict is not null then v_out := v_out || jsonb_build_object('customer_registration_verdict',v_creg_verdict); end if;
  if v_flag_contest then v_out := v_out || jsonb_build_object('identity_contest',true); end if;
  return v_out;
end $wit$;
revoke all on function clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid) from public;

reset role;

-- §B — FREEZE REGISTRATION (design §3.3 "Freeze discipline"). THE CLOSURE IS DECLARED MINIMAL
-- AND EXPLICIT — the entrypoint plus every leaf it actually CALLS: clara._fact_hash (the
-- `total_fact_hash` the verified tier re-derives), clara._normalize_invoice_cents (the
-- deterministic normalizer that turns the VISION channel's quoted rendering into cents), and
-- clara.evaluate_witness_identity_v1 (the identity verdict leaf; the design's three-member list predates
-- the file-size split that gave the geometry its own body, and a called leaf outside the closure
-- would be the half-freeze this whole discipline exists to prevent). clara._is_explicit_non_myr
-- is NOT in the closure because this body does not call it: the currency test is 0023:149-151's
-- alphabetic normalization, inherited so `currency` and `explicit_non_myr` stay byte-compatible
-- with the legacy envelope. THE COST, STATED: the two shared leaves are already de-facto
-- immutable (every stored fact_hash depends on them) and this freeze makes that structural —
-- they can never be CoR'd again; a change is a `_v2` re-mint with a new registry row. A
-- CATALOG-ONLY search_path makes pg_get_functiondef's qualification stable for BOTH registration
-- and verification (0059:243-245's recorded reason, verbatim); registration under any other
-- search_path stores a hash verify_evaluator_freeze() cannot reproduce.
set local search_path=pg_catalog,pg_temp;
do $fa1_freeze$
declare e uuid; h bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')),'hex'),
           '' order by o),'UTF8')) into h
    from (values (0,'clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'),
                 (1,'clara._fact_hash(uuid,uuid,text,text,bigint)'),
                 (2,'clara._normalize_invoice_cents(text)'),
                 (3,'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)')) m(o,s);
  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values('evaluate_witness_fact_state', 1,
      'clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)', h,
      '0092_f_a1_predicate', false) returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')), null::uuid
      from (values (0,'clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'),
                   (1,'clara._fact_hash(uuid,uuid,text,text,bigint)'),
                   (2,'clara._normalize_invoice_cents(text)'),
                   (3,'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)')) m(o,s);
end
$fa1_freeze$;
set local search_path=clara,pg_temp;

-- §C — TAIL CENSUS.
do $fa1_tail$
declare v_n int; v_changed text; v_new text; v_src text;
begin
  -- (C1) THIS FILE CHANGED NO LIVE BODY AND ADDED EXACTLY ONE — derived from the whole-schema
  -- prosrc snapshot taken before any DDL, not from a list somebody maintained.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_changed
    from pg_proc p join _fa1p1_pre_fn pre on pre.oid = p.oid
   where pre.sha <> encode(sha256(convert_to(p.prosrc,'UTF8')),'hex');
  if v_changed is not null then
    raise exception 'F-A1 part1 tail: it changed live bodies [%] — part 1 must only ADD', v_changed using errcode='CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_new
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null
     and not exists (select 1 from _fa1p1_pre_fn pre where pre.oid = p.oid);
  if coalesce(v_new,'') <> 'evaluate_witness_fact_state_v1(uuid,uuid,uuid)' then
    raise exception 'F-A1 part1 tail: the set of NEW clara functions is [%] — expected exactly [evaluate_witness_fact_state_v1(uuid,uuid,uuid)]', coalesce(v_new,'(none)') using errcode='CLR10';
  end if;
  -- (C2) NO CONFIDENCE TERM in the EXECUTABLE text, asserted on the COMMITTED body. Comments are
  -- stripped first: a body may legitimately DOCUMENT the term's absence, and a guard that reads
  -- the commentary reads a projection of the code rather than the code (review law 3).
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure;
  if v_src ~* 'engine_confidence|\mv_conf\M' then
    raise exception 'F-A1 part1 tail: the witness predicate reads engine_confidence — ADR-047 Q1 dropped confidence from gating ENTIRELY' using errcode='CLR10';
  end if;
  -- (C3) POSTURE — the T18 hygiene the rig sweeps for, so the migration notices first.
  if not exists (select 1 from pg_proc p
                  where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                    and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A1 part1 tail: the predicate is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f
             cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
              where f.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'F-A1 part1 tail: PUBLIC executes the witness predicate' using errcode='CLR10';
  end if;
  -- (C4) THE FREEZE REPRODUCES — run HERE rather than left to the runner's between-migrations
  -- hook, so a broken closure names THIS file rather than the next one.
  perform clara.verify_evaluator_freeze();
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions v on v.id = m.evaluator_version_id
   where v.evaluator_name = 'evaluate_witness_fact_state';
  if v_n <> 4 then
    raise exception 'F-A1 part1 tail: witness closure has % members, expected 4', v_n using errcode='CLR10';
  end if;
  -- (C5) EVERY clara FUNCTION THE PREDICATE CALLS IS IN THE CLOSURE. A called leaf outside it is
  -- the half-freeze the whole discipline exists to prevent, and a hand-maintained member list is
  -- exactly the thing that drifts — so the check reads the committed body.
  foreach v_src in array array['_fact_hash','_normalize_invoice_cents','evaluate_witness_identity_v1'] loop
    if position('clara.'||v_src||'(' in
        (select p.prosrc from pg_proc p where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure)) = 0 then
      raise exception 'F-A1 part1 tail: the predicate does not call clara.% — the frozen closure claims a member the body does not use', v_src using errcode='CLR10';
    end if;
  end loop;
  -- And the converse: the body calls NO clara function outside the closure. `document_regions`
  -- and friends are relations, not functions, so the only names this can find are calls. THE
  -- CAPTURE COVERS BOTH STEMS (M7): the identity leaf is now `clara.evaluate_witness_identity_v1`,
  -- so a probe that only matched `clara\._…` would have stopped SEEING it — and a converse check
  -- that cannot see a member is a check whose YES means nothing. The ordering is pinned to the
  -- "C" collation rather than the database default, because the two stems sort differently under
  -- a locale collation and this string is compared literally.
  select string_agg(x.n, ', ' order by x.n collate "C") into v_src
    from (select distinct m[1] as n from regexp_matches(
            (select p.prosrc from pg_proc p where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure),
            'clara\.((?:_|evaluate_)[a-z0-9_]+)\s*\(', 'g') as m) x;
  if coalesce(v_src,'') <> '_fact_hash, _normalize_invoice_cents, evaluate_witness_identity_v1' then
    raise exception 'F-A1 part1 tail: the predicate calls clara functions [%] — the frozen closure covers exactly [_fact_hash, _normalize_invoice_cents, evaluate_witness_identity_v1]; a called leaf outside the closure is the half-freeze this discipline exists to prevent', coalesce(v_src,'(none)')
      using errcode='CLR10';
  end if;
  raise notice 'F-A1 part1 tail: OK — 1 evaluator added, 0 live bodies changed; 4-member closure frozen, closed (calls = members) and verify_evaluator_freeze() green; definer posture pinned, PUBLIC has no EXECUTE, no confidence term';
end
$fa1_tail$;
