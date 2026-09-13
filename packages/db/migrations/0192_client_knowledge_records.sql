-- 0192_client_knowledge_records — #644 (parent spec #612; wayfinder resolution #603; journeys
-- A5 / A6 / C13 / B6): ONE GOVERNED KNOWLEDGE RECORD FOR TYPED ASSERTIONS, EXTRACTED FACTS,
-- PREFERENCES AND POLICIES, WITH SOURCE, TRUST, APPLICABILITY AND AN ATTRIBUTABLE REVISION.
-- =====================================================================================
-- Spec of record: #644 — "明确提供的资料进入同一 Knowledge，保留是谁提供、来源、有效条件及版本；
-- 推测不变成已确认事实". Wayfinder #603 resolved the product contract: explicit information saves
-- with correction/withdrawal, extracted facts keep their sources, model inference stays
-- distinguishable, preferences are client-scoped by default and a firm default needs explicit
-- scope plus the matching authority. ARCHITECTURE §7 recorded that facts / wiki / coding-pattern
-- pack / UI 尚未统一. This file builds the RECORD half of that unification and nothing else.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.knowledge_keys` (a code-populated catalog that
-- types every key and carries its floor-bearing flags) and `clara.knowledge_records` (a stable
-- `record_id` with monotone revisions, scope, applicability, effective dates, SOURCE LINKS onto
-- the existing extraction relations, a derived trust level, and supersede-never-update history),
-- plus the doors that write them, the reads C13 renders, the runtime knowledge pack and the
-- onboarding-answer promotion that finally carries A5/A6 interview answers into the same record.
--
-- =====================================================================================
-- SIX DECISIONS THIS FILE IMPLEMENTS, EACH ONE LOAD-BEARING.
--
-- 1 · LEGACY IS READ, NEVER REWRITTEN. `clara.client_facts` (0055:386-424) and its door
--     `clara.record_client_fact` (0055:499-669) are BYTE-UNTOUCHED. No dual write exists; no
--     backfill copies a legacy row into the new table. BOTH READS -- `clara.list_client_knowledge`
--     for C13 and `clara.get_knowledge_pack` for a run -- UNION the legacy live facts in as
--     `source_kind='legacy_client_fact'` through ONE expression (`clara._knowledge_legacy_rows`,
--     §D.8), and a legacy fact is NEVER SHADOWED: it rides in beside any knowledge record of
--     the same key, carrying `authoritative=true`. The pack carrying them is the second cut: the
--     first shipped the union to C13 only, so the register showed the legacy `trade_nature`
--     beside the newer record while a Work reading the pack saw only the record -- and would have
--     coded on it while clara._close_gate_closing_stock went on gating on the legacy value. One
--     register, one pack, one answer. That is not caution, it is the literal state of
--     the estate -- every one of the five carried keys is still READ from clara.client_facts by
--     code this file does not touch: entity_type and msic through 0055's own S6 splice into
--     clara.get_context_pack (0055:765), trade_nature by clara._close_gate_closing_stock
--     (0056:1283), customer_identity_policy by clara._tf_counterparty_name_only_guard (0062:226)
--     and banking_arrangement by the bank-registry ledger (0121:4797). With no dual write, a
--     shadow would have this register (and the knowledge pack) report the NEW value while the
--     books went on being prepared from the OLD one, and nothing on screen would say so. The five
--     legacy catalog keys are carried into `knowledge_keys` BY VALUE (a SELECT from
--     clara.client_fact_keys, never a re-typed literal) so the vocabulary cannot drift.
--
-- 2 · EXTRACTED FACTS ARE LINKED, NOT COPIED (agreed with #624). A record sourced from a
--     document extraction pins `source_document_id`/`source_extraction_id`/`source_region_id`/
--     `source_field_path` onto clara.documents / clara.document_extractions /
--     clara.document_regions (0007:183-215) through COMPOSITE, firm-congruent foreign keys. No
--     extraction payload is duplicated here, so withdrawing a source stays one fact with one
--     owner.
--
-- 3 · TRUST IS DERIVED, NEVER SUPPLIED. The doors take a SOURCE KIND and compute the trust level
--     from it; no caller can label an inference `asserted`. The table restates the same map as a
--     CHECK (an inline CASE — no user function, so a pg_restore that has not yet created this
--     schema's functions still rebuilds the constraint), and `clara._tf_knowledge_authority` adds
--     a further belt: a key the catalog marks `authority_bearing`, and every `policy` key,
--     refuses anything but `asserted`. Reads carry the trust level so the surface can label it.
--     HOW MANY BELTS, EXACTLY, because the difference is worth stating rather than rounding up: a
--     `policy` row has THREE (ck_knowledge_records_policy_trust, the catalog trigger, the door),
--     and an authority-bearing row of any OTHER kind has TWO (the trigger and the door). A table
--     CHECK cannot reach `knowledge_keys.authority_bearing` — a CHECK sees only its own row — so
--     the third belt for those keys is structurally unavailable, not omitted.
--     The three belts exist because #644 AC3 is a SECURITY claim: an imported bundle's own
--     "verified" annotation, or a model's own confidence, must never become policy, tool
--     registration or posting authority. TOOL REGISTRATION COMES FROM THE SERVER-OWNED REGISTRY
--     ALONE; the values, bases and source text reaching this table are SUPPLIED DATA, never
--     instructions, and nothing here reads them as such.
--
-- 4 · CLIENT SCOPE IS THE DEFAULT AND FIRM SCOPE IS AN EXPLICIT ACT (#603 Q22). A record is
--     client-scoped unless the caller names `p_scope_kind => 'firm'`, which additionally demands
--     admin+. On read, a client row SHADOWS the firm row of the same key AND THE SAME
--     APPLICABILITY — per-applicability, never per-key, because `uq_knowledge_live` already treats
--     two live rows of one key as independent facts whenever their `applies_when_digest` differs.
--     So an established client exception survives a later firm default, and a client row scoped to
--     one narrow condition does not erase an unconditional firm default that applies elsewhere.
--     A legacy `client_facts` row is outside this rule altogether: decision 1 never shadows one.
--
-- 5 · A CORRECTION IS A REVISION, NOT AN EDIT. `capture_knowledge` mints revision 1 of a new
--     record; `correct_knowledge` and `withdraw_knowledge` append revisions 2..n and stamp the
--     predecessor. `clara._tf_knowledge_records_supersede_only` (cloned from 0055:428-455) admits
--     exactly one update — the supersession stamp — and delete/truncate are refused outright.
--
-- 6 · EVERY RUNTIME SURFACE NAMES THE TENANT IT MEANS, and the naming is checked BEFORE anything
--     else is looked up. `clara.capture_knowledge_for` verifies the named human's live active
--     membership; `clara.promote_plan_answers_to_knowledge` requires `p_firm` of its machine lane
--     and fetches the plan INSIDE that firm; `clara.get_knowledge_pack` requires `p_firm` of its
--     machine lane and looks the client up INSIDE it, with the human lane taking the session firm
--     and treating a supplied `p_firm` as a belt. Deriving the tenant from the object id is not a
--     tenancy check, it is the absence of one -- a wrong or model-influenced client id would
--     otherwise put another firm's knowledge into a model's context.
--     ORDER IS PART OF THE RULE. Both doors settle the lane and the floor BEFORE they look the
--     object up: a plan fetched first let a below-floor caller tell a real foreign plan id (CLR04,
--     the floor) from a random one (CLR11, not found) -- an existence oracle for a guessed id, and
--     a row lock on another firm's plan on the way to refusing it. 0021's rule is that absent and
--     foreign answer alike; it applies to the caller who was never admitted to ask, too.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · `clara.get_context_pack` is NOT spliced. The knowledge pack is a NEW function
--     (`clara.get_knowledge_pack`) precisely so #658's retrieval work can supersede it without
--     surgery on a spliced body.
--   · `policy` is DESCRIPTIVE in this slice. Nothing in the posting lane reads these rows; a
--     policy record documents a decision, it does not change how an entry is coded or posted.
--   · counterparty identity / aliases (0176, #647), wiki projections (#663), retrieval (#658)
--     and `set_turnover_classification` (C79.3) are untouched.
--   · no consumer is built for the events this file registers. FOUR DEFERRALS, confirmed in
--     review and named here so nothing reads as silently missing:
--       (1) AC4's WORK-REASSESSMENT consumer for `knowledge.corrected`/`knowledge.withdrawn`. It
--           needs #631's knowledge_version trace and #658/#663's retrieval/projection model before
--           it can decide WHICH work is affected; a consumer that woke everything would be worse
--           than none. Both events stay `context_update` until then.
--       (2) A MATERIAL CONFLICT gets the C13 conflict face (both live rows, no winner picked) and
--           nothing more. ASKING the shared Work question is the runtime lane's obligation
--           (chatTurn_v19 / claraWork_v3), because the question belongs to an execution that needs
--           the answer -- this register has no execution to attach one to.
--       (3) FIRM-SCOPE A6 PROMOTION has its door (`p_promote_firm_scope => true`, admin+, human
--           lane only) and NO caller: the firm-setup route is #648's.
--       (4) "RESUME SETUP FROM ACTUAL MISSING APPLICABLE FACTS" reads this data; the asking
--           surface over it is #648/#649's.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: this file reasons about a chain that already carries the 0055
-- legacy trio and the 0007 extraction relations, and about a schema where no knowledge relation
-- exists yet.
-- =====================================================================================
do $prestate$
declare v_n int;
begin
  if to_regclass('clara.knowledge_keys') is not null
     or to_regclass('clara.knowledge_records') is not null then
    raise exception '#644 prestate: a knowledge relation already exists -- 0192 is append-only and is not re-runnable'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.client_facts') is null or to_regclass('clara.client_fact_keys') is null then
    raise exception '#644 prestate: the 0055 legacy trio is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.client_fact_keys;
  if v_n <> 5 then
    raise exception '#644 prestate: clara.client_fact_keys holds % key(s), expected the 5 legacy keys', v_n
      using errcode='CLR10';
  end if;
  if to_regclass('clara.document_extractions') is null or to_regclass('clara.document_regions') is null
     or to_regclass('clara.accounting_work') is null then
    raise exception '#644 prestate: an expected source relation (extractions/regions/accounting_work) is absent'
      using errcode='CLR10';
  end if;
  raise notice '#644 prestate: clean -- no knowledge relation exists, the 5 legacy fact keys are present, and every source relation this file links to resolves.';
end
$prestate$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE CATALOG. CODE-POPULATED, exactly like clara.client_fact_keys (0055:346-368): a
-- knowledge key is product vocabulary, and vocabulary changes ride migrations with review.
-- No runtime writer exists or is granted.
-- =====================================================================================
create table clara.knowledge_keys (
  knowledge_key     text        primary key check (btrim(knowledge_key) <> ''),
  -- THE FOUR KINDS #603 keeps distinct. `assertion` is what an identified person supplied;
  -- `extracted_fact` is a source/version/field basis; `preference` is a durable instruction;
  -- `policy` is a decision about how the books are prepared.
  kind              text        not null check (kind in ('assertion','extracted_fact','preference','policy')),
  value_shape       text        not null check (value_shape in ('string','number','boolean','object')),
  validated_against text        not null check (btrim(validated_against) <> ''),
  allowed_values    jsonb       check (allowed_values is null or jsonb_typeof(allowed_values) = 'array'),
  description       text        not null check (btrim(description) <> ''),
  scope_default     text        not null default 'client' check (scope_default in ('client','firm')),
  -- AUTHORITY-BEARING: a key whose value governs how the books are presented, or who may be
  -- treated as what. Such a key admits `asserted` trust ONLY (§B's trigger), so neither a model
  -- inference nor an imported bundle can ever fill it.
  authority_bearing boolean     not null default false,
  -- THE KEY'S OWN CAPTURE FLOOR, as DATA. A key carried over from clara.client_fact_keys must not
  -- become CHEAPER to write than the legacy door that still governs the same subject:
  -- clara.record_client_fact is admin+ for all five (0055:510), and lifting
  -- customer_identity_policy off 'name_only' is an OWNER act (0063:156-166). clara._knowledge_floor
  -- takes the HIGHER of this and the floor the scope/kind imply, so a new key can raise its own
  -- floor without the function learning a second rule.
  min_role          text        not null default 'bookkeeper'
                      check (min_role in ('bookkeeper','admin','owner')),
  created_at        timestamptz not null default now(),
  -- A policy key is authority-bearing BY DEFINITION; the catalog may not disagree with itself.
  constraint ck_knowledge_keys_policy_authority check (kind <> 'policy' or authority_bearing)
);

create trigger t_knowledge_keys_append_only before update or delete on clara.knowledge_keys
  for each row execute function clara._tf_append_only();
create trigger t_knowledge_keys_no_truncate before truncate on clara.knowledge_keys
  for each statement execute function clara._tf_no_truncate();

alter table clara.knowledge_keys enable row level security;
alter table clara.knowledge_keys force row level security;
create policy p_knowledge_keys_owner on clara.knowledge_keys
  for all to clara_fn_owner using (true) with check (true);
-- A GLOBAL catalog (no firm dimension -- product vocabulary, not tenant data), so the read
-- policy is unconditional for every lane that renders or reasons over a knowledge row.
create policy p_knowledge_keys_read on clara.knowledge_keys
  for select to clara_authenticated, clara_agent_ro, clara_runtime using (true);
grant select on clara.knowledge_keys to clara_authenticated, clara_agent_ro, clara_runtime;

-- A.1 — THE FIVE LEGACY KEYS, CARRIED BY VALUE. clara.record_client_fact requires a JSON STRING
-- for every key it admits (0055:583-586), so `value_shape` is 'string' for all five; the
-- validation label and its allowed values are the legacy catalog's OWN columns, read here rather
-- than re-typed, so this file cannot invent a vocabulary the legacy door does not enforce.
-- `customer_identity_policy` is the one legacy key that DECIDES something (0062/0063: lifting it
-- carries an owner floor), so it is authority-bearing; the other four are descriptive assertions.
insert into clara.knowledge_keys
    (knowledge_key, kind, value_shape, validated_against, allowed_values, description,
     scope_default, authority_bearing, min_role)
select k.fact_key, 'assertion', 'string', k.validated_against, k.allowed_values,
       'Carried from clara.client_fact_keys (0055/0056/0062/0121) at 0192. ' || k.description,
       'client', k.fact_key = 'customer_identity_policy',
       -- THE LEGACY FLOOR, carried with the key. admin+ for all five (clara.record_client_fact's
       -- own floor, 0055:510); OWNER for customer_identity_policy, because 0063:156-166 makes
       -- lifting it off 'name_only' an owner act and a knowledge row that said 'unrestricted' at
       -- an admin's word would be a cheaper route to the same claim.
       case k.fact_key when 'customer_identity_policy' then 'owner' else 'admin' end
  from clara.client_fact_keys k;

-- A.2 — THE FIRST REAL A5/A6 KEYS. Every one of these is produced TODAY by the committed
-- interview plan (packages/runtime/workflows/interview.v2.questions.ts + .segments.ts, read at
-- 0192 authoring time); none is invented for this migration, and §A.3's map is what carries them.
insert into clara.knowledge_keys
    (knowledge_key, kind, value_shape, validated_against, allowed_values, description,
     scope_default, authority_bearing) values
  ('turnover_band', 'assertion', 'string', 'enum:TURNOVER_BANDS_V1',
   '["<RM1M","RM1M-5M","RM5M-25M","RM25M-100M","RM100M+"]'::jsonb,
   'The annual turnover BAND, as the interview records it. A frozen copy of the interview''s own '
   || 'TURNOVER_BANDS (packages/runtime/workflows/interview.v1.core.ts:213). A band is not a '
   || 'measured turnover figure and no statutory threshold is decided from it here.', 'client', false),
  ('financial_year_end_month', 'assertion', 'number', 'range:month_1_12', null,
   'The financial year-end MONTH as a whole number 1-12 (the interview''s validateFye shape, '
   || 'packages/runtime/workflows/interview.v1.core.ts:177-182). The fiscal-year records '
   || 'themselves live in the close model; this is the stated intent, not a period.', 'client', false),
  ('default_currency', 'assertion', 'string', 'enum:CURRENCIES_V1',
   '["MYR","USD","SGD","EUR","GBP","OTHER"]'::jsonb,
   'The default presentation currency the interview recorded (CURRENCIES, '
   || 'packages/runtime/workflows/interview.v1.questions.ts:39). Ledger currency itself is a '
   || 'books fact; this is the stated default.', 'client', false),
  ('sst_regime', 'assertion', 'string', 'enum:SST_REGIMES_V1',
   '["not_registered","sales_tax","service_tax","both"]'::jsonb,
   'The SST registration status the interview recorded (SST_REGIMES, '
   || 'packages/runtime/workflows/interview.v1.questions.ts:43). The registration NUMBER is '
   || 'identity data and is deliberately not carried here (#647 owns identity).', 'client', false),
  ('mpers_eligibility', 'assertion', 'object', 'shape_only', null,
   'The CA 2016 s.244 private-entity screen''s determination, verbatim as the interview folds it '
   || '({determination, test, parent_test?}; interview.v2.segments.ts eligibilitySegment). '
   || 'SHAPE-ONLY: nothing in this database re-tests the determination.', 'client', false),
  ('reporting_framework', 'policy', 'object', 'shape_only', null,
   'The reporting framework the accounts are prepared on, verbatim as the interview folds it '
   || '({framework_code, framework_label, ...}; interview.v2.segments.ts frameworkSegment). A '
   || 'POLICY key: authority-bearing, so only an asserted source may fill it, and DESCRIPTIVE in '
   || 'this slice -- no posting or presentation code reads this row.', 'client', true),
  ('accounting_basis', 'policy', 'object', 'shape_only', null,
   'The basis the accounts are prepared on, verbatim as the interview folds it '
   || '({accounting_basis, accounting_basis_label, observed_basis?, ...}; '
   || 'interview.v2.segments.ts accountingBasisSegment). A POLICY key: authority-bearing, and '
   || 'DESCRIPTIVE in this slice.', 'client', true),
  ('coa_seed_decision', 'preference', 'object', 'shape_only', null,
   'The chart-of-accounts seed decision the interview recorded ({seed: lhdn_mpers_standard | '
   || 'manual}; interview.v2.questions.ts coa_seed). A durable PREFERENCE about how this client''s '
   || 'chart is maintained; the chart itself is owned by the CoA template lane.', 'client', false);

-- =====================================================================================
-- §A.3 — THE A5/A6 PROMOTION MAP. onboarding_plan_items.item_key is a DB CONTRACT (the v2
-- questions file says so of its own opening keys), so the mapping from a committed plan answer
-- to a knowledge key is DATA, in a table the owner can read and ratify, not a literal buried in
-- a function body. Code-populated and append-only, exactly like the catalogs above.
--
-- WHAT IS DELIBERATELY ABSENT, and why (each of these item keys exists in the live interview):
--   legal_name · ssm · tin · sst_no · statutory · banks · address · mia · bookkeeper_email
--     -- identity and registration data. #647 owns identity; routing it through this table would
--        create a second identity writer before that ticket's model exists.
--   first_year_zero_opening · carry_down_deferred · coa_chart_apply · fa_depreciation_method ·
--   fa_nonstraightline_todo · sample_invoices · first_client_onboarding
--     -- workflow todos and one-shot execution decisions, not durable knowledge. Two of them
--        (first_year_zero_opening / carry_down_deferred) are read BY NAME inside
--        clara.commit_client_onboarding and belong to that gate, not to this register.
-- =====================================================================================
create table clara.knowledge_plan_item_map (
  item_key      text        primary key check (btrim(item_key) <> ''),
  knowledge_key text        not null references clara.knowledge_keys(knowledge_key),
  note          text        not null check (btrim(note) <> ''),
  created_at    timestamptz not null default now()
);

create trigger t_knowledge_plan_item_map_append_only before update or delete
  on clara.knowledge_plan_item_map for each row execute function clara._tf_append_only();
create trigger t_knowledge_plan_item_map_no_truncate before truncate
  on clara.knowledge_plan_item_map for each statement execute function clara._tf_no_truncate();

alter table clara.knowledge_plan_item_map enable row level security;
alter table clara.knowledge_plan_item_map force row level security;
create policy p_knowledge_plan_item_map_owner on clara.knowledge_plan_item_map
  for all to clara_fn_owner using (true) with check (true);
create policy p_knowledge_plan_item_map_read on clara.knowledge_plan_item_map
  for select to clara_authenticated, clara_agent_ro, clara_runtime using (true);
grant select on clara.knowledge_plan_item_map to clara_authenticated, clara_agent_ro, clara_runtime;

insert into clara.knowledge_plan_item_map (item_key, knowledge_key, note) values
  ('entity_type',       'entity_type',              'client + firm interviews; JSON string, enum ENTITY_TYPES_V2'),
  ('msic',              'msic',                     'client interview; JSON string, five digits, format-only'),
  ('turnover',          'turnover_band',            'client + firm interviews; JSON string, enum TURNOVER_BANDS_V1'),
  ('fye',               'financial_year_end_month', 'client + firm interviews; JSON number 1-12 (validateFye returns a number)'),
  ('currency',          'default_currency',         'client + firm interviews; JSON string, enum CURRENCIES_V1'),
  ('sst_regime',        'sst_regime',               'client interview; JSON string, enum SST_REGIMES_V1'),
  ('mpers_eligibility', 'mpers_eligibility',        'client + firm interviews, Sdn Bhd only; JSON object {determination,test}'),
  ('framework',         'reporting_framework',      'client + firm interviews; JSON object -- POLICY, authority-bearing'),
  ('accounting_basis',  'accounting_basis',         'client + firm interviews; JSON object -- POLICY, authority-bearing'),
  ('coa_seed_decision', 'coa_seed_decision',        'client interview (toItems of the coa_seed segment); JSON object {seed}');

reset role;

-- =====================================================================================
-- §B — THE RECORD. One row per REVISION; `record_id` is the stable identity a C13 URL, a
-- correction and a withdrawal all address, and `revision_n` is monotone within it.
-- =====================================================================================
set role clara_fn_owner;

-- B.0 — THE PER-FIRM WATERMARK. `knowledge_version` is the number #631's trace records and a
-- resumed run re-checks. It is allocated from a per-firm monotone counter (the clara.firm_event_seq
-- idiom, 0005:482-484) rather than derived from a MAX over the rows, for one measured reason: a
-- pack mixes CLIENT rows with FIRM-default rows, so a counter that only moved on the client's own
-- rows would let a firm default change under a run whose version never moved. One counter per
-- firm, stamped onto every revision, and the pack answers with the greatest stamp it actually
-- used -- so "per-client max revision" is literally the max of the versions that client's
-- applicable knowledge carries.
create table clara.knowledge_versions (
  firm_id   uuid   primary key references clara.firms(id),
  version_n bigint not null default 0 check (version_n >= 0)
);
alter table clara.knowledge_versions enable row level security;
alter table clara.knowledge_versions force row level security;
create policy p_knowledge_versions_owner on clara.knowledge_versions
  for all to clara_fn_owner using (true) with check (true);
-- NO application grant at all: the counter is an implementation detail of the doors, and the
-- version a reader needs is stamped on the rows it can already see.

create function clara._next_knowledge_version(p_firm uuid) returns bigint
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n bigint;
begin
  insert into clara.knowledge_versions(firm_id, version_n) values (p_firm, 1)
    on conflict (firm_id) do update set version_n = clara.knowledge_versions.version_n + 1
    returning version_n into v_n;
  return v_n;
end $$;
revoke all on function clara._next_knowledge_version(uuid) from public;

-- B.1 — THE APPLICABILITY DIGEST. ONE expression, in ONE function, STAMPED by a trigger.
--
-- WHY NOT A GENERATED COLUMN, measured twice on PG17:
--   · `convert_to` is STABLE, so the estate's usual `sha256(convert_to(text,'UTF8'))` shape is
--     REFUSED outright by a generation expression ("generation expression is not immutable").
--   · the immutable-looking alternative `jsonb_pretty(x)::bytea` COMPILES and then raises 22P02
--     ("invalid input syntax for type bytea") on any jsonb value containing a quote, a newline or
--     a tab — bytea's own input escape grammar, not JSON's. `applies_when` is caller-supplied and
--     reaches this table from a model through `capture_knowledge_for`, so that is a whole class of
--     condition this table simply could not store, surfacing to the runtime as a non-CLR failure
--     and therefore (lib/knowledge.mjs) as a deterministically retrying `unavailable`.
--   · md5(jsonb_pretty(x)) would be immutable and safe, and is REJECTED for a different reason: a
--     128-bit digest is exactly where a caller who controls `applies_when` could alias two
--     DIFFERENT conditions into one live slot, and that slot is a tenancy-adjacent uniqueness key.
-- So the digest is sha256 over UTF-8 bytes, computed HERE, and stamped onto a plain column by
-- `clara._tf_knowledge_authority` (the table's one BEFORE INSERT trigger) — which has no
-- immutability requirement at all. A restore COPYs the stored value; nothing recomputes it.
-- jsonb_pretty prints a jsonb object with its keys already normalised, so {"a":1,"b":2} and
-- {"b":2,"a":1} digest the same. §I's tail asserts the trigger and this function agree.
create function clara._knowledge_applies_when_digest(p jsonb) returns text
  language sql stable parallel safe as
  $$ select encode(sha256(convert_to(jsonb_pretty(coalesce(p, '{}'::jsonb)), 'UTF8')), 'hex') $$;
revoke all on function clara._knowledge_applies_when_digest(jsonb) from public;

-- B.2 — TRUST IS A FUNCTION OF THE SOURCE. This is the doors' copy; the table's CHECK restates
-- the same map inline (see the column list) so a restored database enforces it with no function
-- in sight, and §I's tail asserts the two never disagree.
create function clara._knowledge_trust_of(p_source_kind text) returns text
  language sql immutable parallel safe as $$
  select case p_source_kind
    when 'user_statement'      then 'asserted'
    when 'interview'           then 'asserted'
    when 'registry_lookup'     then 'asserted'
    when 'document_extraction' then 'extracted'
    when 'imported_bundle'     then 'imported_unverified'
    when 'model_inference'     then 'inferred'
  end $$;
revoke all on function clara._knowledge_trust_of(text) from public;

create table clara.knowledge_records (
  id                   uuid        primary key default gen_random_uuid(),
  -- THE STABLE IDENTITY. Revision 1 sets record_id = id; every later revision carries the same
  -- record_id, so a C13 URL, a correction and a withdrawal all address one thing.
  record_id            uuid        not null,
  revision_n           int         not null check (revision_n >= 1),
  firm_id              uuid        not null references clara.firms(id),
  scope_kind           text        not null check (scope_kind in ('client','firm')),
  client_id            uuid,
  knowledge_key        text        not null references clara.knowledge_keys(knowledge_key),
  kind                 text        not null check (kind in ('assertion','extracted_fact','preference','policy')),
  value                jsonb       not null,
  -- APPLICABILITY. Equality conditions only in this slice (the doors refuse a nested value), so
  -- two rows of one key differ by a comparable digest and the partial unique below can tell a
  -- genuine second applicability apart from a duplicate.
  applies_when         jsonb       not null default '{}'::jsonb check (jsonb_typeof(applies_when) = 'object'),
  -- STAMPED, not generated (see §B.1's own note for the two measured reasons). Unconditional:
  -- a caller-supplied value is overwritten by the trigger, the clara.wakes_outbox idiom.
  applies_when_digest  text        not null check (applies_when_digest ~ '^[0-9a-f]{64}$'),
  effective_from       date,
  effective_to         date,
  source_kind          text        not null check (source_kind in
                         ('user_statement','interview','document_extraction','registry_lookup',
                          'imported_bundle','model_inference')),
  trust                text        not null check (trust in ('asserted','extracted','imported_unverified','inferred')),
  -- THE FOUR SOURCE PINS (decision 2). Composite and firm-congruent, the 0055:418 idiom: the
  -- (row, firm) pair is one fact, so a source from another tenant cannot be pinned at all.
  source_document_id   uuid,
  source_extraction_id uuid,
  source_region_id     uuid,
  source_field_path    text        check (source_field_path is null or btrim(source_field_path) <> ''),
  source_work_id       uuid,
  -- WHO / BASIS / WHEN, the ADR-062 trio 0055 already rules: a record without its basis is
  -- refused, never defaulted.
  basis                text        not null check (btrim(basis) <> ''),
  asserted_by          uuid        not null references clara.users(id),
  recorded_via         text        not null check (recorded_via in ('human_ui','clara_runtime')),
  recorded_at          timestamptz not null default now(),
  knowledge_version    bigint      not null check (knowledge_version > 0),
  revision_kind        text        not null check (revision_kind in ('capture','correction','withdrawal')),
  revision_reason      text,
  supersedes_id        uuid        references clara.knowledge_records(id),
  -- The FK is DEFERRABLE so a door can stamp the predecessor with the successor's id and insert
  -- the successor in the same transaction (0055:409-411's own reason).
  superseded_by        uuid        references clara.knowledge_records(id) deferrable initially deferred,
  superseded_at        timestamptz,
  state                text        not null check (state in ('live','superseded','withdrawn')),

  -- Scope is structural (0017:1021's idiom), and the tenant pair is a composite FK (0055:418).
  constraint ck_knowledge_records_scope check ((scope_kind = 'client') = (client_id is not null)),
  constraint fk_knowledge_records_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint uq_knowledge_records_revision unique (record_id, revision_n),
  constraint uq_knowledge_records_id_firm unique (id, firm_id),

  -- TRUST IS A FUNCTION OF THE SOURCE, restated without a user function so a restore enforces it.
  constraint ck_knowledge_records_trust check (
    trust = case source_kind
      when 'user_statement'      then 'asserted'
      when 'interview'           then 'asserted'
      when 'registry_lookup'     then 'asserted'
      when 'document_extraction' then 'extracted'
      when 'imported_bundle'     then 'imported_unverified'
      when 'model_inference'     then 'inferred'
    end),
  -- A POLICY IS ASSERTED OR IT IS NOT A POLICY (#644 AC3). With the map above this means a
  -- policy can only ever come from a user statement, an interview or a registry lookup.
  constraint ck_knowledge_records_policy_trust check (kind <> 'policy' or trust = 'asserted'),

  -- The extraction pins ride a document_extraction source and nothing else, and each deeper pin
  -- needs the one above it. Two-way, the 0055:415-417 reading: a stray extraction id on a user
  -- statement would be provenance theatre.
  constraint ck_knowledge_records_extraction_pins check (
    (source_kind = 'document_extraction')
    or (source_extraction_id is null and source_region_id is null and source_field_path is null)),
  constraint ck_knowledge_records_extraction_required check (
    source_kind <> 'document_extraction'
    or (source_document_id is not null and source_extraction_id is not null)),
  constraint ck_knowledge_records_region_needs_extraction check (
    source_region_id is null or source_extraction_id is not null),
  constraint ck_knowledge_records_field_needs_extraction check (
    source_field_path is null or source_extraction_id is not null),

  constraint ck_knowledge_records_effective_order check (
    effective_from is null or effective_to is null or effective_to >= effective_from),

  -- REVISION ALGEBRA. Revision 1 is the capture and has no predecessor; every later revision
  -- names one. A correction and a withdrawal both owe a reason; a capture does not.
  constraint ck_knowledge_records_first_revision check ((revision_n = 1) = (supersedes_id is null)),
  constraint ck_knowledge_records_capture_first check (revision_kind <> 'capture' or revision_n = 1),
  constraint ck_knowledge_records_reason check (
    revision_kind = 'capture' or nullif(btrim(revision_reason), '') is not null),
  -- The stamp is one act: both columns or neither (0055:412-414).
  constraint ck_knowledge_records_supersession_paired check (
    (superseded_by is null) = (superseded_at is null)),
  -- STATE IS DERIVED FROM THE TWO FACTS THAT DECIDE IT. A withdrawal is TERMINAL: it is the last
  -- revision of its record and carries no successor, which is why `withdrawn` sits on the
  -- unstamped side of this check beside `live`.
  constraint ck_knowledge_records_state check ((superseded_at is null) = (state in ('live','withdrawn'))),
  constraint ck_knowledge_records_withdrawal check ((revision_kind = 'withdrawal') = (state = 'withdrawn'))
);

-- The source pins, as composite firm-congruent FKs (added after the table so the column list
-- above stays readable; identical force to an inline constraint).
alter table clara.knowledge_records add constraint fk_knowledge_records_source_document
  foreign key (source_document_id, firm_id) references clara.documents (id, firm_id);
alter table clara.knowledge_records add constraint fk_knowledge_records_source_extraction
  foreign key (source_extraction_id, firm_id) references clara.document_extractions (id, firm_id);
alter table clara.knowledge_records add constraint fk_knowledge_records_source_region
  foreign key (source_region_id, firm_id) references clara.document_regions (id, firm_id);
-- The Work pin is a SIMPLE foreign key, and that is measured rather than lazy: 0178 gave
-- clara.accounting_work the composite uq_accounting_work_id_firm_client (id, firm_id, client_id)
-- and no (id, firm_id) unique, so a composite FK here would have to ALTER another ticket's table.
-- The doors check the Work's own firm instead (CLR11), so congruence is enforced, just not by a
-- constraint this file could add without widening its blast radius.
alter table clara.knowledge_records add constraint fk_knowledge_records_source_work
  foreign key (source_work_id) references clara.accounting_work (id);
-- The predecessor a revision names is a revision OF THE SAME TENANT.
alter table clara.knowledge_records add constraint fk_knowledge_records_supersedes_firm
  foreign key (supersedes_id, firm_id) references clara.knowledge_records (id, firm_id);

-- ONE LIVE ROW PER (scope, subject, key, applicability). Two live rows of one key are therefore
-- only possible with DIFFERENT applicability -- which is exactly the contradiction C13 must show
-- rather than silently pick between.
create unique index uq_knowledge_live on clara.knowledge_records
  (scope_kind, coalesce(client_id, firm_id), knowledge_key, applies_when_digest)
  where state = 'live';
create index ix_knowledge_records_scope on clara.knowledge_records
  (firm_id, scope_kind, client_id, knowledge_key, recorded_at desc);
create index ix_knowledge_records_record on clara.knowledge_records (record_id, revision_n);

-- B.3 — SUPERSEDE-ONLY. Cloned from clara._tf_client_facts_supersede_only (0055:428-455): the ONE
-- lawful update is the supersession stamp, and a row already stamped is immutable outright.
create function clara._tf_knowledge_records_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded knowledge revision is immutable'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_immutable"}';
  end if;
  if old.state = 'withdrawn' then
    raise exception 'a withdrawn knowledge revision is terminal and immutable'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null or new.state is distinct from 'superseded'
     or new.id                   is distinct from old.id
     or new.record_id            is distinct from old.record_id
     or new.revision_n           is distinct from old.revision_n
     or new.firm_id              is distinct from old.firm_id
     or new.scope_kind           is distinct from old.scope_kind
     or new.client_id            is distinct from old.client_id
     or new.knowledge_key        is distinct from old.knowledge_key
     or new.kind                 is distinct from old.kind
     or new.value                is distinct from old.value
     or new.applies_when         is distinct from old.applies_when
     or new.applies_when_digest  is distinct from old.applies_when_digest
     or new.effective_from       is distinct from old.effective_from
     or new.effective_to         is distinct from old.effective_to
     or new.source_kind          is distinct from old.source_kind
     or new.trust                is distinct from old.trust
     or new.source_document_id   is distinct from old.source_document_id
     or new.source_extraction_id is distinct from old.source_extraction_id
     or new.source_region_id     is distinct from old.source_region_id
     or new.source_field_path    is distinct from old.source_field_path
     or new.source_work_id       is distinct from old.source_work_id
     or new.basis                is distinct from old.basis
     or new.asserted_by          is distinct from old.asserted_by
     or new.recorded_via         is distinct from old.recorded_via
     or new.recorded_at          is distinct from old.recorded_at
     or new.knowledge_version    is distinct from old.knowledge_version
     or new.revision_kind        is distinct from old.revision_kind
     or new.revision_reason      is distinct from old.revision_reason
     or new.supersedes_id        is distinct from old.supersedes_id then
    raise exception 'clara.knowledge_records admits exactly one update: the supersession stamp (superseded_by, superseded_at and state together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_knowledge_records_supersede_only() from public;

-- B.4 — THE AUTHORITY BELT (decision 3, third enforcement). The CHECKs above cannot read the
-- CATALOG, so the catalog's own `authority_bearing` flag is enforced here.
create function clara._tf_knowledge_authority() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare k record;
begin
  -- THE APPLICABILITY STAMP, first, because the partial unique index reads it. Unconditional, so
  -- no caller can supply a digest that disagrees with the conditions beside it (§B.1 records why
  -- this is a trigger rather than a generated column).
  new.applies_when_digest := clara._knowledge_applies_when_digest(new.applies_when);
  select * into k from clara.knowledge_keys where knowledge_key = new.knowledge_key;
  if not found then
    raise exception 'unknown knowledge key %', new.knowledge_key
      using errcode = 'CLR10', detail = '{"reason":"knowledge_key_unknown"}';
  end if;
  if new.kind is distinct from k.kind then
    raise exception 'knowledge key % is a %, not a %', new.knowledge_key, k.kind, new.kind
      using errcode = 'CLR10', detail = '{"reason":"knowledge_kind_mismatch"}';
  end if;
  if k.authority_bearing and new.trust <> 'asserted' then
    raise exception 'knowledge key % is authority-bearing and admits only an asserted source; % is %',
      new.knowledge_key, new.source_kind, new.trust
      using errcode = 'CLR10', detail = '{"reason":"knowledge_trust_insufficient"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_knowledge_authority() from public;

create trigger t_knowledge_records_authority before insert on clara.knowledge_records
  for each row execute function clara._tf_knowledge_authority();
create trigger t_knowledge_records_supersede_only before update on clara.knowledge_records
  for each row execute function clara._tf_knowledge_records_supersede_only();
create trigger t_knowledge_records_no_delete before delete on clara.knowledge_records
  for each row execute function clara._tf_append_only();
create trigger t_knowledge_records_no_truncate before truncate on clara.knowledge_records
  for each statement execute function clara._tf_no_truncate();

alter table clara.knowledge_records enable row level security;
alter table clara.knowledge_records force row level security;
create policy p_knowledge_records_owner on clara.knowledge_records
  for all to clara_fn_owner using (true) with check (true);
create policy p_knowledge_records_human on clara.knowledge_records
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_knowledge_records_agent on clara.knowledge_records
  for select to clara_agent_ro using (firm_id = clara.wake_firm());
create policy p_knowledge_records_runtime on clara.knowledge_records
  for select to clara_runtime using (true);
-- SELECT AND ONLY SELECT. No role but the definer owner writes a knowledge row; every write in
-- this file goes through a door.
grant select on clara.knowledge_records to clara_authenticated, clara_agent_ro, clara_runtime;

-- =====================================================================================
-- §C — EVENT TAXONOMY, one additive triple against the active version (the 0024 §B / 0055 S4.0
-- idiom). Registered BEFORE any door exists, because the events spine validates every
-- domain_events.event_type against clara.event_types and a door that emits an unregistered type
-- fails on its FIRST successful call.
--
-- THE DECISIONS, AND A DELIBERATE DEVIATION FROM THE BRIEF. #644's brief asks for a "wake" on
-- corrected/withdrawn. clara.trigger_taxonomy admits five values and none of them is "wake"
-- (0005:106-107); the three WAKE-BOUND ones (internal_task / notification / background_review,
-- packages/runtime/lib/relay.mjs:49) each mint a wake_intents row that the drain turns into a
-- HELD clara.agent_tasks row -- a task nothing in this slice would ever execute. So a correction
-- and a withdrawal are registered `context_update`: the router advances its checkpoint and mints
-- no intent, which is the honest posture for a revision whose consumers (#658 retrieval, #663
-- projections) are not built yet, and the upgrade to a wake-bound decision is one additive
-- taxonomy row in the migration that builds the consumer.
-- `knowledge.captured` is `ignore`, verbatim 0055's posture for the same act.
--
-- client_scoped = true on all three: a client-scope revision carries its client_id, and
-- clara._tf_validate_domain_event only FORBIDS a client_id on a non-client-scoped type
-- (0005:175-177), so a firm-scope revision passes with client_id null under the same row.
-- =====================================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('knowledge.captured', true, 'A knowledge record was captured through a governed door', 'ignore',
    'capture act; readers take the knowledge pack lazily at judgement time -- no router wake (the 0055 client.fact_recorded posture)'),
  ('knowledge.corrected', true, 'A knowledge record was corrected into a new revision', 'context_update',
    'a correction changes what a later read must see; no consumer is built in 0192, so this advances the checkpoint and mints no intent'),
  ('knowledge.withdrawn', true, 'A knowledge record was withdrawn', 'context_update',
    'a withdrawal changes what a later read must see; no consumer is built in 0192, so this advances the checkpoint and mints no intent')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

reset role;

-- =====================================================================================
-- §D — THE PRIVATE CLOSURE. Validation, the one writer, and the two cores every door shares.
-- None of these is granted to any application role.
-- =====================================================================================
set role clara_fn_owner;

-- D.1 — THE CATALOG RULE, fail-closed exactly like 0055:582-612: a key whose validation label
-- this function cannot implement is REFUSED, never accepted unvalidated.
create function clara._knowledge_assert_value(p_knowledge_key text, p_value jsonb) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare k record; v_txt text; v_num numeric;
begin
  select * into k from clara.knowledge_keys where knowledge_key = p_knowledge_key;
  if not found then
    raise exception 'unknown knowledge key %', p_knowledge_key
      using errcode = 'CLR10', detail = '{"reason":"knowledge_key_unknown"}';
  end if;
  if p_value is null or jsonb_typeof(p_value) is distinct from k.value_shape then
    raise exception 'knowledge key % carries a JSON % value, not %', p_knowledge_key, k.value_shape,
      coalesce(jsonb_typeof(p_value), 'null')
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
        'knowledge_key', p_knowledge_key)::text;
  end if;
  if k.validated_against like 'enum:%' then
    v_txt := p_value #>> '{}';
    if k.allowed_values is null or not (k.allowed_values ? v_txt) then
      raise exception 'knowledge key % admits only its catalog values, and % is not one of them',
        p_knowledge_key, v_txt
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
          'knowledge_key', p_knowledge_key)::text;
    end if;
  elsif k.validated_against = 'format_only' then
    -- The ONE key this label may ride is 0055's msic, and the rule is 0055's: five digits, no
    -- registry to check membership against. Keyed on the name for the same reason 0055 gives --
    -- a rule DSL for one customer is machinery -- and everything else falls to the ELSE below.
    if p_knowledge_key <> 'msic' then
      raise exception 'knowledge key % carries format_only, a label this door implements for msic alone', p_knowledge_key
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
          'knowledge_key', p_knowledge_key)::text;
    end if;
    v_txt := p_value #>> '{}';
    if v_txt !~ '^[0-9]{5}$' then
      raise exception 'an MSIC code is exactly five digits, and % is not', v_txt
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
          'knowledge_key', p_knowledge_key)::text;
    end if;
  elsif k.validated_against = 'range:month_1_12' then
    v_num := (p_value #>> '{}')::numeric;
    if v_num is null or v_num <> trunc(v_num) or v_num < 1 or v_num > 12 then
      raise exception 'knowledge key % is a whole month 1-12, and % is not', p_knowledge_key, p_value::text
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
          'knowledge_key', p_knowledge_key)::text;
    end if;
  elsif k.validated_against = 'shape_only' then
    -- HONEST BY LABEL, the msic posture generalised: the SHAPE is checked above and nothing
    -- re-derives the inner content. The catalog description says so in the product's own words,
    -- so no surface can read this row as "verified".
    null;
  else
    raise exception 'knowledge key % carries a validation label (%) this door does not implement -- refusing to record an unvalidated value',
      p_knowledge_key, k.validated_against
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
        'knowledge_key', p_knowledge_key)::text;
  end if;
end $$;
revoke all on function clara._knowledge_assert_value(text, jsonb) from public;

-- D.2 — APPLICABILITY. Equality conditions only in this slice: an object whose values are all
-- scalars. A nested object or array is refused rather than digested into something no reader
-- could compare.
create function clara._knowledge_assert_applies_when(p jsonb) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'applies_when is a JSON object of equality conditions'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_applies_when_invalid"}';
  end if;
  for e in select key, value from jsonb_each(p) loop
    if btrim(e.key) = '' or jsonb_typeof(e.value) not in ('string','number','boolean') then
      raise exception 'applies_when admits equality conditions only: % is not a scalar condition', e.key
        using errcode = 'CLR10', detail = '{"reason":"knowledge_applies_when_invalid"}';
    end if;
  end loop;
end $$;
revoke all on function clara._knowledge_assert_applies_when(jsonb) from public;

-- D.3 — THE SOURCE BAG. `p_source` is a closed object; an unknown key is refused so a typo can
-- never become a silently-unpinned source. Every pin is checked to be IN THIS FIRM with one
-- refusal for absent and foreign alike (the 0021 rule -- no existence oracle).
create function clara._knowledge_source_pins(
    p_firm uuid, p_source_kind text, p_source jsonb,
    out o_document uuid, out o_extraction uuid, out o_region uuid, out o_field text, out o_work uuid)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare k text;
begin
  if p_source is null or jsonb_typeof(p_source) <> 'object' then
    raise exception 'source is a JSON object' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_source_invalid"}';
  end if;
  for k in select key from jsonb_each(p_source) loop
    if k not in ('document_id','extraction_id','region_id','field_path','work_id') then
      raise exception 'source carries an unknown key %', k using errcode = 'CLR10',
        detail = '{"reason":"knowledge_source_invalid"}';
    end if;
  end loop;
  o_document   := nullif(p_source ->> 'document_id', '')::uuid;
  o_extraction := nullif(p_source ->> 'extraction_id', '')::uuid;
  o_region     := nullif(p_source ->> 'region_id', '')::uuid;
  o_field      := nullif(btrim(coalesce(p_source ->> 'field_path', '')), '');
  o_work       := nullif(p_source ->> 'work_id', '')::uuid;

  if p_source_kind = 'document_extraction' then
    if o_document is null or o_extraction is null then
      raise exception 'an extracted fact names its document AND its extraction'
        using errcode = 'CLR10', detail = '{"reason":"knowledge_source_incomplete"}';
    end if;
  elsif o_extraction is not null or o_region is not null or o_field is not null then
    raise exception 'extraction/region/field_path ride only a document_extraction source'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_source_unexpected"}';
  end if;

  if o_document is not null and not exists (
      select 1 from clara.documents d where d.id = o_document and d.firm_id = p_firm) then
    raise exception 'source document is not in your firm' using errcode = 'CLR11';
  end if;
  if o_extraction is not null and not exists (
      select 1 from clara.document_extractions x
       where x.id = o_extraction and x.firm_id = p_firm and x.document_id = o_document) then
    raise exception 'source extraction is not in your firm, or does not belong to the named document'
      using errcode = 'CLR11';
  end if;
  if o_region is not null and not exists (
      select 1 from clara.document_regions g
       where g.id = o_region and g.firm_id = p_firm and g.extraction_id = o_extraction) then
    raise exception 'source region is not in your firm, or does not belong to the named extraction'
      using errcode = 'CLR11';
  end if;
  -- The Work pin has no composite FK (see §B); this is where its firm congruence is decided.
  if o_work is not null and not exists (
      select 1 from clara.accounting_work w where w.id = o_work and w.firm_id = p_firm) then
    raise exception 'source work is not in your firm' using errcode = 'CLR11';
  end if;
end $$;
revoke all on function clara._knowledge_source_pins(uuid, text, jsonb) from public;

-- D.4 — THE ONE WRITER. Every door reaches the table through here: allocate the firm's next
-- knowledge_version, stamp the predecessor (deferred FK, the 0055:615-627 shape), insert the new
-- revision, audit and emit.
create function clara._knowledge_insert_revision(
    p_firm uuid, p_prior_id uuid, p_record_id uuid, p_revision_n int,
    p_scope_kind text, p_client uuid, p_knowledge_key text, p_kind text, p_value jsonb,
    p_applies_when jsonb, p_effective_from date, p_effective_to date,
    p_source_kind text, p_source_document uuid, p_source_extraction uuid, p_source_region uuid,
    p_source_field text, p_source_work uuid, p_basis text, p_asserted_by uuid,
    p_recorded_via text, p_revision_kind text, p_revision_reason text, p_state text,
    p_fn text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_new uuid; v_version bigint; v_event text; v_digest text; v_constraint text;
begin
  v_new := gen_random_uuid();
  v_version := clara._next_knowledge_version(p_firm);
  if p_prior_id is not null then
    update clara.knowledge_records
       set superseded_by = v_new, superseded_at = now(), state = 'superseded'
     where id = p_prior_id;
  end if;
  -- THE RACE ANSWERS BY NAME. Two writers capturing the same (scope, subject, key, applicability)
  -- both find NO live predecessor to lock, so the loser meets uq_knowledge_live here rather than in
  -- the core's own lookup. That is the SAME product fact as arriving second ("this client already
  -- holds a live row of that key"), so it gets the same typed refusal instead of a bare 23505 no
  -- caller maps; a revision race on one record gets its own reason.
  begin
    insert into clara.knowledge_records(
        id, record_id, revision_n, firm_id, scope_kind, client_id, knowledge_key, kind, value,
        applies_when, effective_from, effective_to, source_kind, trust,
        source_document_id, source_extraction_id, source_region_id, source_field_path, source_work_id,
        basis, asserted_by, recorded_via, knowledge_version, revision_kind, revision_reason,
        supersedes_id, state)
      values (
        v_new, coalesce(p_record_id, v_new), p_revision_n, p_firm, p_scope_kind, p_client,
        p_knowledge_key, p_kind, p_value, coalesce(p_applies_when, '{}'::jsonb),
        p_effective_from, p_effective_to, p_source_kind, clara._knowledge_trust_of(p_source_kind),
        p_source_document, p_source_extraction, p_source_region, p_source_field, p_source_work,
        p_basis, p_asserted_by, p_recorded_via, v_version, p_revision_kind,
        nullif(btrim(coalesce(p_revision_reason, '')), ''), p_prior_id, p_state)
      returning applies_when_digest into v_digest;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'uq_knowledge_live' then
      raise exception 'this client already holds a live % record for that applicability -- another writer got there first; correct it instead of capturing a second one',
        p_knowledge_key
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_already_live',
          'record_id', coalesce(p_record_id, v_new))::text;
    elsif v_constraint = 'uq_knowledge_records_revision' then
      raise exception 'another revision of that knowledge record landed first -- re-read it and revise again'
        using errcode = 'CLR06', detail = '{"reason":"knowledge_revision_raced"}';
    end if;
    raise;
  end;

  v_event := case p_revision_kind when 'capture' then 'knowledge.captured'
                                  when 'correction' then 'knowledge.corrected'
                                  else 'knowledge.withdrawn' end;
  -- args stay REDACTED (ids and keys, never the value or the basis text -- the ROW is the record
  -- of record; 0002's audit_log doctrine, 0055's own wording).
  perform clara._audit(p_firm, p_asserted_by, null, null, p_fn, null,
    jsonb_build_object('record_id', coalesce(p_record_id, v_new), 'revision_id', v_new,
      'revision_n', p_revision_n, 'knowledge_key', p_knowledge_key, 'scope_kind', p_scope_kind,
      'client', p_client, 'revision_kind', p_revision_kind, 'superseded_id', p_prior_id,
      'recorded_via', p_recorded_via, 'knowledge_version', v_version::text));
  -- THE EVENT CARRIES ITS DOCUMENT IN THE PAYLOAD AND NEVER IN THE COLUMN. 0055's third catch:
  -- clara._tf_validate_domain_event refuses an event carrying both a client_id and a document_id
  -- unless an active filing binds them, and a knowledge source may legitimately be an unfiled
  -- firm document. The ROW pins the exact source; the event is a notification.
  perform clara._append_event(p_firm, v_event, p_client, p_asserted_by, null, null, null, null, null,
    jsonb_build_object('record_id', coalesce(p_record_id, v_new), 'revision_id', v_new,
      'revision_n', p_revision_n, 'knowledge_key', p_knowledge_key, 'kind', p_kind,
      'scope_kind', p_scope_kind, 'trust', clara._knowledge_trust_of(p_source_kind),
      'source_kind', p_source_kind, 'source_document_id', p_source_document,
      'knowledge_version', v_version::text));

  return jsonb_build_object(
    'record_id', coalesce(p_record_id, v_new), 'revision_id', v_new, 'revision_n', p_revision_n,
    'knowledge_key', p_knowledge_key, 'kind', p_kind, 'scope_kind', p_scope_kind,
    'client_id', p_client, 'value', p_value, 'applies_when', coalesce(p_applies_when, '{}'::jsonb),
    'applies_when_digest', v_digest, 'trust', clara._knowledge_trust_of(p_source_kind),
    'source_kind', p_source_kind, 'revision_kind', p_revision_kind, 'state', p_state,
    'asserted_by', p_asserted_by, 'recorded_via', p_recorded_via, 'recorded_at', now(),
    'knowledge_version', v_version::text, 'superseded_id', p_prior_id);
end $$;
revoke all on function clara._knowledge_insert_revision(uuid, uuid, uuid, int, text, uuid, text,
  text, jsonb, jsonb, date, date, text, uuid, uuid, uuid, text, uuid, text, uuid, text, text,
  text, text, text) from public;

-- D.5 — THE CAPTURE CORE. Shared by the human door, the runtime door and the promotion door;
-- the floor is NOT here (a floor lives on the public verb, 0055's doctrine).
--   p_on_conflict = 'refuse'  -- a live row of the same (scope, key, applicability) is a CLR10
--                                naming the record, so the caller corrects it deliberately.
--                 = 'skip'    -- return it untouched (the promotion door's idempotency).
--                 = 'correct' -- append a correction (the chat lane's "actually, it is X").
create function clara._knowledge_capture_core(
    p_firm uuid, p_scope_kind text, p_client uuid, p_knowledge_key text, p_value jsonb,
    p_applies_when jsonb, p_effective_from date, p_effective_to date,
    p_source_kind text, p_basis text, p_source jsonb,
    p_asserted_by uuid, p_recorded_via text, p_on_conflict text,
    p_revision_reason text, p_fn text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  k record; prior record; v_digest text; s record;
begin
  if p_scope_kind not in ('client','firm') then
    raise exception 'scope_kind is client or firm' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_scope_invalid"}';
  end if;
  if (p_scope_kind = 'client') <> (p_client is not null) then
    raise exception 'a client-scoped record names its client, and a firm-scoped one names none'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_scope_invalid"}';
  end if;
  if p_client is not null and not exists (
      select 1 from clara.clients c where c.id = p_client and c.firm_id = p_firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a knowledge record requires its basis -- who said so, on what evidence'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_basis_missing"}';
  end if;
  if clara._knowledge_trust_of(p_source_kind) is null then
    raise exception 'source_kind must be one of user_statement / interview / document_extraction / registry_lookup / imported_bundle / model_inference'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_source_kind_invalid"}';
  end if;
  if p_effective_from is not null and p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'the effective window ends before it starts' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_effective_window_invalid"}';
  end if;
  perform clara._knowledge_assert_applies_when(coalesce(p_applies_when, '{}'::jsonb));
  perform clara._knowledge_assert_value(p_knowledge_key, p_value);
  select * into k from clara.knowledge_keys where knowledge_key = p_knowledge_key;
  -- THE TRUST WALL, stated in the door's own voice so the refusal names the product rule rather
  -- than a constraint. The trigger and the CHECKs repeat it; this is where the caller hears it.
  if (k.kind = 'policy' or k.authority_bearing) and clara._knowledge_trust_of(p_source_kind) <> 'asserted' then
    raise exception 'knowledge key % is %; a % source is % and cannot become one',
      p_knowledge_key, case when k.kind = 'policy' then 'a policy' else 'authority-bearing' end,
      p_source_kind, clara._knowledge_trust_of(p_source_kind)
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_trust_insufficient',
        'knowledge_key', p_knowledge_key)::text;
  end if;
  s := clara._knowledge_source_pins(p_firm, p_source_kind, coalesce(p_source, '{}'::jsonb));

  v_digest := clara._knowledge_applies_when_digest(coalesce(p_applies_when, '{}'::jsonb));
  -- SUPERSESSION, NEVER UPDATE (0055's matrix F4 applied to a revision chain). Lock the live
  -- predecessor; two writers racing the same subject serialize here, and the second meets
  -- uq_knowledge_live -- a loud unique violation, never a silent double-live state.
  select * into prior from clara.knowledge_records r
   where r.state = 'live' and r.knowledge_key = p_knowledge_key
     and r.applies_when_digest = v_digest
     and ((p_scope_kind = 'client' and r.scope_kind = 'client' and r.client_id = p_client)
       or (p_scope_kind = 'firm'   and r.scope_kind = 'firm'   and r.firm_id = p_firm))
   for update;

  if found then
    if p_on_conflict = 'skip' then
      return jsonb_build_object('status', 'skipped', 'record_id', prior.record_id,
        'revision_id', prior.id, 'revision_n', prior.revision_n,
        'knowledge_key', p_knowledge_key, 'knowledge_version', prior.knowledge_version::text);
    elsif p_on_conflict = 'correct' then
      if nullif(btrim(coalesce(p_revision_reason, '')), '') is null then
        raise exception 'correcting a live knowledge record requires a reason'
          using errcode = 'CLR10', detail = '{"reason":"knowledge_reason_required"}';
      end if;
      return jsonb_build_object('status', 'corrected') || clara._knowledge_insert_revision(
        p_firm, prior.id, prior.record_id, prior.revision_n + 1, p_scope_kind, p_client,
        p_knowledge_key, k.kind, p_value, coalesce(p_applies_when, '{}'::jsonb),
        p_effective_from, p_effective_to, p_source_kind,
        s.o_document, s.o_extraction, s.o_region, s.o_field, s.o_work,
        p_basis, p_asserted_by, p_recorded_via, 'correction', p_revision_reason, 'live', p_fn);
    else
      raise exception 'this client already holds a live % record for that applicability -- correct it instead of capturing a second one',
        p_knowledge_key
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_already_live',
          'record_id', prior.record_id)::text;
    end if;
  end if;

  return jsonb_build_object('status', 'captured') || clara._knowledge_insert_revision(
    p_firm, null, null, 1, p_scope_kind, p_client, p_knowledge_key, k.kind, p_value,
    coalesce(p_applies_when, '{}'::jsonb), p_effective_from, p_effective_to, p_source_kind,
    s.o_document, s.o_extraction, s.o_region, s.o_field, s.o_work,
    p_basis, p_asserted_by, p_recorded_via, 'capture', null, 'live', p_fn);
end $$;
revoke all on function clara._knowledge_capture_core(uuid, text, uuid, text, jsonb, jsonb, date,
  date, text, text, jsonb, uuid, text, text, text, text) from public;

-- D.6 — THE FLOOR THE CATALOG DECIDES. bookkeeper+ for an assertion / extracted fact /
-- preference; admin+ for a policy or any authority-bearing key. A FIRM-scope act is admin+ no
-- matter what the key says (#603 Q22: a firm default needs the corresponding authority).
create function clara._knowledge_floor(p_knowledge_key text, p_scope_kind text) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  -- THE HIGHER OF TWO FLOORS, never the cheaper one: what the SCOPE/KIND imply, and what the KEY
  -- itself carries (knowledge_keys.min_role — the legacy door's own floor for a carried key).
  select case when clara.role_rank(k.min_role) >= clara.role_rank(implied.floor)
              then k.min_role else implied.floor end
    from clara.knowledge_keys k
    cross join lateral (select case
              when p_scope_kind = 'firm' then 'admin'
              when k.kind = 'policy' or k.authority_bearing then 'admin'
              else 'bookkeeper' end as floor) implied
   where k.knowledge_key = p_knowledge_key;
$$;
revoke all on function clara._knowledge_floor(text, text) from public;

-- D.7 — THE ROW SHAPE every read emits. One place, so the list, the detail, the history and the
-- runtime pack cannot drift into four dialects of the same record.
create function clara._knowledge_row_json(r clara.knowledge_records) returns jsonb
  language sql stable as $$
  select jsonb_build_object(
    'record_id', r.record_id, 'revision_id', r.id, 'revision_n', r.revision_n,
    'scope_kind', r.scope_kind, 'client_id', r.client_id, 'knowledge_key', r.knowledge_key,
    'kind', r.kind, 'value', r.value, 'applies_when', r.applies_when,
    'applies_when_digest', r.applies_when_digest,
    'effective_from', r.effective_from, 'effective_to', r.effective_to,
    'source_kind', r.source_kind, 'trust', r.trust,
    'source', jsonb_build_object('document_id', r.source_document_id,
      'extraction_id', r.source_extraction_id, 'region_id', r.source_region_id,
      'field_path', r.source_field_path, 'work_id', r.source_work_id),
    'basis', r.basis, 'asserted_by', r.asserted_by, 'recorded_via', r.recorded_via,
    'recorded_at', r.recorded_at, 'knowledge_version', r.knowledge_version::text,
    'revision_kind', r.revision_kind, 'revision_reason', r.revision_reason,
    'supersedes_id', r.supersedes_id, 'superseded_by', r.superseded_by,
    'superseded_at', r.superseded_at, 'state', r.state,
    -- TWO DIFFERENT QUESTIONS, and conflating them was the defect. `editable` means "this is a
    -- governed knowledge record with its own detail route and doors", which is true of every row
    -- here and false only for a UNIONed legacy client_fact; `correctable` means "a correction or
    -- a withdrawal would be admitted", which is true only of the CURRENT LIVE revision — a
    -- superseded one is immutable and a withdrawal is terminal (both refuse at the door).
    'editable', true, 'correctable', r.state = 'live');
$$;
revoke all on function clara._knowledge_row_json(clara.knowledge_records) from public;

-- D.8 — THE LEGACY UNION, in ONE expression. clara.client_facts is byte-untouched by this file
-- and is still what the ESTATE reads for all five carried keys (header decision 1 names the four
-- readers), so BOTH the C13 register and the runtime knowledge pack must carry those rows,
-- read-only and flagged as the ones in force. Two hand-written copies of that object would drift
-- the first time either read gained a field -- and the drift that actually happened was worse
-- than a field: the pack simply did not have them at all, so C13 and a Work looking at the same
-- client disagreed about which value governs. One function, called by both reads.
--
-- IT NEVER CONSULTS clara.knowledge_records, and that absence is the no-shadow rule made
-- structural: there is nothing here that COULD hide a legacy fact behind a knowledge record of
-- the same key. `knowledge_version` is null because a legacy fact has no knowledge revision to
-- stamp, so unioning these rows cannot move either read's watermark.
create function clara._knowledge_legacy_rows(p_firm uuid, p_client uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(jsonb_agg(j order by fact_key), '[]'::jsonb)
    from (
      select jsonb_build_object(
          'record_id', cf.id, 'revision_id', cf.id, 'revision_n', 1,
          'scope_kind', 'client', 'client_id', cf.client_id, 'knowledge_key', cf.fact_key,
          'kind', 'assertion', 'value', cf.fact_value, 'applies_when', '{}'::jsonb,
          'applies_when_digest', null, 'effective_from', null, 'effective_to', null,
          'source_kind', 'legacy_client_fact', 'trust', 'asserted',
          'source', jsonb_build_object('document_id', cf.source_document_id, 'extraction_id', null,
            'region_id', null, 'field_path', null, 'work_id', null),
          'basis', cf.basis, 'asserted_by', cf.recorded_by, 'recorded_via', 'human_ui',
          'recorded_at', cf.recorded_at, 'knowledge_version', null,
          'revision_kind', 'capture', 'revision_reason', null, 'supersedes_id', null,
          'superseded_by', null, 'superseded_at', null, 'state', 'live', 'editable', false,
          'asserted_by_name', u.display_name, 'basis_kind', cf.basis_kind,
          'key_description', kk.description,
          -- THE LEGACY ROW IS THE ONE IN FORCE, unconditionally, and both surfaces say so. This
          -- file adds a register BESIDE clara.client_facts and does not dual-write, so for every
          -- one of the five carried keys the value the ESTATE acts on is still the legacy one.
          'authoritative', true) as j,
          cf.fact_key as fact_key
        from clara.client_facts cf
        left join clara.users u on u.id = cf.recorded_by
        left join clara.knowledge_keys kk on kk.knowledge_key = cf.fact_key
       where cf.client_id = p_client and cf.firm_id = p_firm and cf.superseded_at is null
    ) l;
$$;
revoke all on function clara._knowledge_legacy_rows(uuid, uuid) from public;

reset role;

-- =====================================================================================
-- §E — THE WRITE DOORS.
-- =====================================================================================
set role clara_fn_owner;

-- E.0 — the live revision a correction or a withdrawal addresses. ONE refusal for absent and
-- foreign alike (the 0021 rule -- no existence oracle).
create function clara._knowledge_live_revision(p_firm uuid, p_record uuid)
  returns clara.knowledge_records
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r clara.knowledge_records;
begin
  select * into r from clara.knowledge_records k
   where k.record_id = p_record and k.firm_id = p_firm and k.superseded_at is null
   for update;
  if not found then
    raise exception 'knowledge record not found in your firm' using errcode = 'CLR11';
  end if;
  if r.state = 'withdrawn' then
    raise exception 'that knowledge record was withdrawn on %; capture a new one rather than revising a withdrawal',
      r.recorded_at
      using errcode = 'CLR10', detail = '{"reason":"knowledge_withdrawn"}';
  end if;
  return r;
end $$;
revoke all on function clara._knowledge_live_revision(uuid, uuid) from public;

-- E.1 — clara.capture_knowledge — THE HUMAN LANE.
create function clara.capture_knowledge(
    p_knowledge_key text, p_value jsonb, p_basis text, p_op_key text,
    p_scope_kind text default 'client', p_client uuid default null,
    p_source_kind text default 'user_statement', p_applies_when jsonb default '{}'::jsonb,
    p_effective_from date default null, p_effective_to date default null,
    p_source jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; v_dedupe jsonb; v_floor text;
begin
  -- THE ADMISSION FLOOR IS THE LOWEST WRITE FLOOR; the KEY's own floor is re-checked below, once
  -- the catalog has been read. Two steps rather than one because the floor is catalog data.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- RESERVE-BEFORE-MUTABLE-VALIDATION (0055:519-529's placement): after identity/authz, before
  -- anything that reads mutable world state. A retry of a SUCCEEDED call replays its receipt.
  v_dedupe := clara._reserve_op(c.firm, 'capture_knowledge', p_op_key,
    clara._hash(jsonb_build_object('key', p_knowledge_key, 'value', p_value, 'basis', p_basis,
      'scope', p_scope_kind, 'client', p_client, 'source_kind', p_source_kind,
      'applies_when', p_applies_when, 'from', p_effective_from, 'to', p_effective_to,
      'source', p_source)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_floor := clara._knowledge_floor(p_knowledge_key, p_scope_kind);
  if v_floor is null then
    raise exception 'unknown knowledge key %', p_knowledge_key
      using errcode = 'CLR10', detail = '{"reason":"knowledge_key_unknown"}';
  end if;
  perform clara._human_ctx(clara.role_rank(v_floor));
  return clara._finish_op(c.firm, 'capture_knowledge', p_op_key,
    clara._knowledge_capture_core(c.firm, p_scope_kind, p_client, p_knowledge_key, p_value,
      p_applies_when, p_effective_from, p_effective_to, p_source_kind, p_basis, p_source,
      c.actor, 'human_ui', 'refuse', null, 'capture_knowledge'));
end $door$;
revoke all on function clara.capture_knowledge(text, jsonb, text, text, text, uuid, text, jsonb,
  date, date, jsonb) from public;

-- E.2 — clara.capture_knowledge_for — THE RUNTIME LANE. It NEVER impersonates: the caller names
-- the human whose statement this is, and this door verifies that person's LIVE ACTIVE membership
-- and rank itself (the clara.update_onboarding_plan precedent, 0017:2661-2666).
--
-- CLIENT SCOPE ONLY, deliberately. A firm-wide default is an explicit admin act (#603 Q22) and
-- there is no admin sitting in a chat turn; the human door is the only route to firm scope.
--
-- p_correction_reason is what makes the chat capture step trivial: with no live row it is
-- ignored and this is a capture; with one it is the reason the correction records. Absent, a
-- live row is a CLR10 `knowledge_already_live` carrying the record_id, never a silent overwrite.
create function clara.capture_knowledge_for(
    p_asserted_by uuid, p_client uuid, p_knowledge_key text, p_value jsonb, p_basis text,
    p_op_key text, p_source_kind text default 'user_statement',
    p_applies_when jsonb default '{}'::jsonb, p_effective_from date default null,
    p_effective_to date default null, p_source jsonb default '{}'::jsonb,
    p_correction_reason text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare v_firm uuid; v_dedupe jsonb; v_floor text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_client is null then
    raise exception 'the runtime knowledge lane is client-scoped; a firm default is an explicit admin act'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_scope_invalid"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(v_firm, 'capture_knowledge_for', p_op_key,
    clara._hash(jsonb_build_object('by', p_asserted_by, 'client', p_client, 'key', p_knowledge_key,
      'value', p_value, 'basis', p_basis, 'source_kind', p_source_kind,
      'applies_when', p_applies_when, 'from', p_effective_from, 'to', p_effective_to,
      'source', p_source, 'reason', p_correction_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_floor := clara._knowledge_floor(p_knowledge_key, 'client');
  if v_floor is null then
    raise exception 'unknown knowledge key %', p_knowledge_key
      using errcode = 'CLR10', detail = '{"reason":"knowledge_key_unknown"}';
  end if;
  if not exists (select 1 from clara.firm_memberships m
      where m.firm_id = v_firm and m.user_id = p_asserted_by and m.status = 'active'
        and clara.role_rank(m.role) >= clara.role_rank(v_floor)) then
    raise exception 'the named person is not an active % (or better) of this firm', v_floor
      using errcode = 'CLR04', detail = '{"reason":"asserted_by_rank_insufficient"}';
  end if;
  return clara._finish_op(v_firm, 'capture_knowledge_for', p_op_key,
    clara._knowledge_capture_core(v_firm, 'client', p_client, p_knowledge_key, p_value,
      p_applies_when, p_effective_from, p_effective_to, p_source_kind, p_basis, p_source,
      p_asserted_by, 'clara_runtime',
      case when nullif(btrim(coalesce(p_correction_reason, '')), '') is null then 'refuse' else 'correct' end,
      p_correction_reason, 'capture_knowledge_for'));
end $door$;
revoke all on function clara.capture_knowledge_for(uuid, uuid, text, jsonb, text, text, text,
  jsonb, date, date, jsonb, text) from public;

-- E.3 — clara.correct_knowledge. A correction changes the VALUE (and, if the caller says so, the
-- basis and the source) of an existing record; its APPLICABILITY and effective window travel
-- unchanged, because changing what a record applies to makes it a different record -- withdraw
-- and capture, so the history says what actually happened.
create function clara.correct_knowledge(
    p_record uuid, p_value jsonb, p_reason text, p_op_key text,
    p_basis text default null, p_source_kind text default null,
    p_source jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; r clara.knowledge_records; v_dedupe jsonb; v_floor text;
        v_source_kind text; v_basis text; k record;
        v_doc uuid; v_ext uuid; v_reg uuid; v_field text; v_work uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a correction records why -- an attributable revision without its reason is an edit'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'correct_knowledge', p_op_key,
    clara._hash(jsonb_build_object('record', p_record, 'value', p_value, 'reason', p_reason,
      'basis', p_basis, 'source_kind', p_source_kind, 'source', p_source)));
  if v_dedupe is not null then return v_dedupe; end if;
  r := clara._knowledge_live_revision(c.firm, p_record);
  v_floor := clara._knowledge_floor(r.knowledge_key, r.scope_kind);
  perform clara._human_ctx(clara.role_rank(v_floor));
  v_source_kind := coalesce(nullif(btrim(coalesce(p_source_kind, '')), ''), r.source_kind);
  v_basis := coalesce(nullif(btrim(coalesce(p_basis, '')), ''), r.basis);
  if clara._knowledge_trust_of(v_source_kind) is null then
    raise exception 'source_kind must be one of user_statement / interview / document_extraction / registry_lookup / imported_bundle / model_inference'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_source_kind_invalid"}';
  end if;
  perform clara._knowledge_assert_value(r.knowledge_key, p_value);
  select * into k from clara.knowledge_keys where knowledge_key = r.knowledge_key;
  if (k.kind = 'policy' or k.authority_bearing) and clara._knowledge_trust_of(v_source_kind) <> 'asserted' then
    raise exception 'knowledge key % is %; a % source is % and cannot become one',
      r.knowledge_key, case when k.kind = 'policy' then 'a policy' else 'authority-bearing' end,
      v_source_kind, clara._knowledge_trust_of(v_source_kind)
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_trust_insufficient',
        'knowledge_key', r.knowledge_key)::text;
  end if;
  -- A correction that names no new source inherits the prior revision's pins verbatim.
  if p_source is null and nullif(btrim(coalesce(p_source_kind, '')), '') is null then
    v_doc := r.source_document_id; v_ext := r.source_extraction_id; v_reg := r.source_region_id;
    v_field := r.source_field_path; v_work := r.source_work_id;
  else
    select o_document, o_extraction, o_region, o_field, o_work
      into v_doc, v_ext, v_reg, v_field, v_work
      from clara._knowledge_source_pins(c.firm, v_source_kind, coalesce(p_source, '{}'::jsonb));
  end if;
  return clara._finish_op(c.firm, 'correct_knowledge', p_op_key,
    jsonb_build_object('status', 'corrected') || clara._knowledge_insert_revision(
      c.firm, r.id, r.record_id, r.revision_n + 1, r.scope_kind, r.client_id, r.knowledge_key,
      r.kind, p_value, r.applies_when, r.effective_from, r.effective_to, v_source_kind,
      v_doc, v_ext, v_reg, v_field, v_work, v_basis, c.actor, 'human_ui', 'correction', p_reason,
      'live', 'correct_knowledge'));
end $door$;
revoke all on function clara.correct_knowledge(uuid, jsonb, text, text, text, text, jsonb) from public;

-- E.4 — clara.withdraw_knowledge. TERMINAL: the withdrawal revision carries the value it retires
-- verbatim (so the history can still say what was withdrawn), records why, and admits no
-- successor. Re-asserting the same key afterwards is a NEW record with its own history.
create function clara.withdraw_knowledge(p_record uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; r clara.knowledge_records; v_dedupe jsonb; v_floor text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a withdrawal records why' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'withdraw_knowledge', p_op_key,
    clara._hash(jsonb_build_object('record', p_record, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  r := clara._knowledge_live_revision(c.firm, p_record);
  v_floor := clara._knowledge_floor(r.knowledge_key, r.scope_kind);
  perform clara._human_ctx(clara.role_rank(v_floor));
  return clara._finish_op(c.firm, 'withdraw_knowledge', p_op_key,
    jsonb_build_object('status', 'withdrawn') || clara._knowledge_insert_revision(
      c.firm, r.id, r.record_id, r.revision_n + 1, r.scope_kind, r.client_id, r.knowledge_key,
      r.kind, r.value, r.applies_when, r.effective_from, r.effective_to, r.source_kind,
      r.source_document_id, r.source_extraction_id, r.source_region_id, r.source_field_path,
      r.source_work_id, r.basis, c.actor, 'human_ui', 'withdrawal', p_reason, 'withdrawn',
      'withdraw_knowledge'));
end $door$;
revoke all on function clara.withdraw_knowledge(uuid, text, text) from public;

-- =====================================================================================
-- §F — THE READS.
-- =====================================================================================

-- F.1 — clara.list_client_knowledge — THE C13 REGISTER. Three sources, one shape:
--   · this client's own CURRENT revisions (live, and withdrawn ones so a withdrawal is visible
--     as a withdrawal rather than as an absence);
--   · the FIRM defaults this client does not override -- a live client row of the same key AND
--     THE SAME APPLICABILITY shadows one (#603 Q22: a firm default preserves established client
--     exceptions, and an exception is per-condition, so a narrow client row leaves an
--     unconditional firm default standing);
--   · the LEGACY clara.client_facts live rows, as `source_kind='legacy_client_fact'`,
--     `editable=false` and `authoritative=true` -- NEVER shadowed, because for all five carried
--     keys the legacy table is still what the estate reads (decision 1 names each reader).
create function clara.list_client_knowledge(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; v_rows jsonb; v_version bigint;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- ONE PASS OVER THE TABLE, with the shadow expressed as a NOT EXISTS rather than a CTE whose
  -- anonymous row type clara._knowledge_row_json could not take: `r` here is the TABLE alias, so
  -- the composite the shaper receives is clara.knowledge_records itself.
  -- THE WATERMARK IS COMPUTED OVER EVERY REVISION IN SCOPE, not over the rows this read
  -- happens to emit: a withdrawal appends a revision and removes a live row, so a max over the
  -- emitted set alone would move the number BACKWARDS and a resume check would read "nothing
  -- changed" across the one event most likely to invalidate the work. get_knowledge_pack uses the
  -- identical expression, so the two reads can never disagree about what they read.
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = c.firm and (r.scope_kind = 'firm' or r.client_id = p_client);
  select coalesce(jsonb_agg(j order by knowledge_key, recorded_at desc), '[]'::jsonb)
    into v_rows
    from (
      select clara._knowledge_row_json(r)
          || jsonb_build_object('asserted_by_name', u.display_name,
               'key_description', kk.description, 'value_shape', kk.value_shape,
               'validated_against', kk.validated_against,
               'authority_bearing', kk.authority_bearing) as j,
             r.knowledge_key as knowledge_key, r.recorded_at as recorded_at
        from clara.knowledge_records r
        left join clara.users u on u.id = r.asserted_by
        left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
       where r.firm_id = c.firm and r.superseded_at is null
         and ((r.scope_kind = 'client' and r.client_id = p_client)
           or (r.scope_kind = 'firm' and r.state = 'live'
               -- THE SHADOW IS PER-APPLICABILITY, NOT PER-KEY, and the digest conjunct is the whole
               -- point of it. uq_knowledge_live already treats two live rows of one key as
               -- INDEPENDENT facts whenever their applicability differs, so a client row scoped to
               -- one narrow condition must hide the firm row that carries THAT condition and
               -- nothing else. Matching on the key alone let a {"segment":"digital"} client row
               -- erase an UNCONDITIONAL firm default from the client's whole register -- a default
               -- that applies precisely where the narrow row does not (#603 Q22: a firm default
               -- preserves client EXCEPTIONS, and an exception is per-condition).
               and not exists (select 1 from clara.knowledge_records o
                                where o.firm_id = c.firm and o.scope_kind = 'client'
                                  and o.client_id = p_client and o.state = 'live'
                                  and o.knowledge_key = r.knowledge_key
                                  and o.applies_when_digest = r.applies_when_digest)))
    ) k;
  -- THE LEGACY UNION, second and separate, through the ONE expression the runtime knowledge
  -- pack also uses (§D.8). `clara.client_facts` is byte-untouched by this file; it is READ here
  -- so C13 shows one register, and NEVER shadowed -- decision 1 names the four places the estate
  -- still reads that table for these five keys. The helper cannot shadow one even by accident:
  -- it never consults clara.knowledge_records.
  v_rows := v_rows || clara._knowledge_legacy_rows(c.firm, p_client);
  return jsonb_build_object('client_id', p_client, 'knowledge_version', coalesce(v_version, 0)::text,
    'records', v_rows);
end $read$;
revoke all on function clara.list_client_knowledge(uuid) from public;

-- F.2 — clara.get_knowledge_record — the C13 DETAIL's current revision plus its catalog row.
create function clara.get_knowledge_record(p_record uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; r clara.knowledge_records; k record; v_name text; v_n int; v_client text;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into r from clara.knowledge_records x
   where x.record_id = p_record and x.firm_id = c.firm and x.superseded_at is null;
  if not found then
    raise exception 'knowledge record not found in your firm' using errcode = 'CLR11';
  end if;
  select * into k from clara.knowledge_keys where knowledge_key = r.knowledge_key;
  select display_name into v_name from clara.users where id = r.asserted_by;
  select count(*)::int into v_n from clara.knowledge_records x where x.record_id = p_record;
  select cl.name into v_client from clara.clients cl where cl.id = r.client_id;
  return jsonb_build_object(
    'record', clara._knowledge_row_json(r) || jsonb_build_object('asserted_by_name', v_name,
      'client_name', v_client),
    'key', jsonb_build_object('knowledge_key', k.knowledge_key, 'kind', k.kind,
      'value_shape', k.value_shape, 'validated_against', k.validated_against,
      'allowed_values', k.allowed_values, 'description', k.description,
      'authority_bearing', k.authority_bearing),
    'revision_count', v_n);
end $read$;
revoke all on function clara.get_knowledge_record(uuid) from public;

-- F.3 — clara.get_knowledge_history — every revision, oldest first, each naming its own actor.
create function clara.get_knowledge_history(p_record uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; v jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.knowledge_records x
                  where x.record_id = p_record and x.firm_id = c.firm) then
    raise exception 'knowledge record not found in your firm' using errcode = 'CLR11';
  end if;
  select coalesce(jsonb_agg(clara._knowledge_row_json(r)
             || jsonb_build_object('asserted_by_name', u.display_name)
             order by r.revision_n), '[]'::jsonb)
    into v
    from clara.knowledge_records r
    left join clara.users u on u.id = r.asserted_by
   where r.record_id = p_record and r.firm_id = c.firm;
  return jsonb_build_object('record_id', p_record, 'revisions', v);
end $read$;
revoke all on function clara.get_knowledge_history(uuid) from public;

-- F.4 — clara.get_knowledge_pack — THE RUNTIME READ. A NEW function, deliberately (see the
-- header): #658's progressive retrieval can supersede it without touching a spliced body.
--
-- IT NAMES THE TENANT IT READS. The first cut took `p_client` alone, looked the firm UP from the
-- client and verified nothing -- so the only thing deciding whose knowledge reached a model's
-- context was a client id, and a wrong or model-influenced one put another firm's records in
-- front of the model. That is the same hole the promotion door closed, on the read side, and it
-- is closed the same way: the MACHINE lane must NAME the firm (`p_firm`, REQUIRED) and a firm
-- that does not own the client answers the no-existence-oracle refusal, absent and foreign alike
-- (0021's rule). The HUMAN lane takes its firm from the session (clara.jwt_firm, through
-- clara._human_ctx at the viewer floor -- the same floor clara.list_client_knowledge uses) and
-- treats a supplied `p_firm` as a belt that must agree. Anything that is neither lane is CLR03,
-- the authority class, rather than a fall-through to the cheaper arm.
--
-- THE HUMAN ARM HOLDS NO GRANT TODAY and that is deliberate, not an oversight: §H keeps this door
-- clara_runtime-ONLY (a C13 surface reads clara.list_client_knowledge). The arm exists so that a
-- later grant is a grant and not a second tenancy decision, and it is measured through the body.
--
-- IT CARRIES THE LEGACY FACTS THAT STILL GOVERN. clara.list_client_knowledge unions
-- clara.client_facts in read-only and flags each row `authoritative` because those are the rows
-- the estate actually reads (header decision 1 names the four readers). The pack did not, so the
-- two reads disagreed about the same client: C13 showed the legacy trade_nature beside the newer
-- knowledge record, while a Work reading the pack saw only the knowledge record and would have
-- coded on it while clara._close_gate_closing_stock (0056:1283) went on gating on the legacy
-- value. One register, one pack, one answer -- and ONE expression, clara._knowledge_legacy_rows,
-- so the two can never drift apart again.
--
-- HONEST ABOUT ITS OWN LIMITS. `p_purpose` is RECORDED and echoed; it does not yet filter, and
-- this comment is the product saying so rather than a surface implying a relevance model that
-- does not exist. `knowledge_version` is the watermark over every knowledge REVISION in scope --
-- the number a resumed run re-checks -- and the legacy union does not move it, because a legacy
-- client_fact has no knowledge revision to stamp (its own row carries knowledge_version null,
-- exactly as it does in the register).
create function clara.get_knowledge_pack(p_client uuid, p_purpose text, p_firm uuid default null)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; v_firm uuid; v_actor uuid; v_rows jsonb; v_version bigint;
begin
  if nullif(btrim(coalesce(p_purpose, '')), '') is null then
    raise exception 'a knowledge pack is read for a stated purpose' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_purpose_required"}';
  end if;
  -- THE LANE IS PICKED FROM THE CALLER, exactly as clara.promote_plan_answers_to_knowledge picks
  -- it, and for the same measured reason: clara.jwt_sub() answers NULL for absent, unparseable
  -- and non-uuid claims (0002:339-352), so "no claim" can never be read as "therefore the
  -- runtime". `current_setting('role')` is the SET ROLE a pooled session actually took and
  -- `clara_runtime_login` is the login packages/runtime/lib/pools.mjs checks out as; pg_has_role
  -- is not used because the rig connects as postgres, a member of every role.
  v_actor := clara.jwt_sub();
  if v_actor is not null then
    c := clara._human_ctx(clara.role_rank('viewer'));
    if p_firm is not null and p_firm <> c.firm then
      raise exception 'client not found' using errcode = 'CLR11';
    end if;
    v_firm := c.firm;
  elsif coalesce(current_setting('role', true), 'none') = 'clara_runtime'
        or session_user in ('clara_runtime', 'clara_runtime_login') then
    if p_firm is null then
      raise exception 'the runtime knowledge pack names the firm it is reading'
        using errcode = 'CLR10', detail = '{"reason":"pack_firm_required"}';
    end if;
    v_firm := p_firm;
  else
    raise exception 'reading a knowledge pack needs an identified human or the runtime'
      using errcode = 'CLR03', detail = '{"reason":"no_pack_context"}';
  end if;
  -- ONE refusal for absent and foreign alike: the client is looked up INSIDE the bound firm, so
  -- "not this firm's" and "does not exist" are the same answer by construction.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = v_firm) then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  -- The SAME watermark expression clara.list_client_knowledge uses — see its own note for why it
  -- spans every revision in scope rather than the emitted rows.
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = v_firm and (r.scope_kind = 'firm' or r.client_id = p_client);
  select coalesce(jsonb_agg(j order by knowledge_key), '[]'::jsonb)
    into v_rows
    from (
      select clara._knowledge_row_json(r) as j,
             r.knowledge_key as knowledge_key
        from clara.knowledge_records r
       where r.firm_id = v_firm and r.state = 'live'
         and ((r.scope_kind = 'client' and r.client_id = p_client)
           or (r.scope_kind = 'firm'
               -- Per-applicability, for the reason clara.list_client_knowledge states at its own
               -- shadow: a run that lost an unconditional firm default to a narrow client
               -- exception would reason without a fact that applies.
               and not exists (select 1 from clara.knowledge_records o
                                where o.firm_id = v_firm and o.scope_kind = 'client'
                                  and o.client_id = p_client and o.state = 'live'
                                  and o.knowledge_key = r.knowledge_key
                                  and o.applies_when_digest = r.applies_when_digest)))
    ) p;
  -- THE LEGACY UNION, second and separate, through the one expression the register also uses.
  v_rows := v_rows || clara._knowledge_legacy_rows(v_firm, p_client);
  return jsonb_build_object('status', 'ok', 'client_id', p_client, 'firm_id', v_firm,
    'purpose', p_purpose, 'knowledge_version', coalesce(v_version, 0)::text, 'records', v_rows);
end $read$;
revoke all on function clara.get_knowledge_pack(uuid, text, uuid) from public;

-- =====================================================================================
-- §G — clara.promote_plan_answers_to_knowledge — WHAT A5/A6 HAVE ALWAYS OWED.
--
-- CB-AE2E-030's finding, restated: clara.commit_client_onboarding (0017:2751-2842) writes
-- NOTHING into any fact register -- a committed interview answer is a rendered card and a plan
-- item, never saved Knowledge. This door is the missing half. It is idempotent three ways: the
-- op receipt replays an exact retry, a live record of the same key is SKIPPED rather than
-- duplicated, and the whole act is safe to call after every commit.
--
-- THE TWO LANES, AND WHAT EACH MUST NAME. The HUMAN lane is an identified admin of the plan's
-- own firm (the firm comes from the session). The MACHINE lane carries no claims at all, so it
-- must NAME the firm it is promoting into (`p_firm`) and this door verifies that name against the
-- plan; without it, a plan id alone decided which tenant the promotion wrote into, which is the
-- absence of a tenancy check rather than a lenient one. Anything that is neither lane is CLR03.
-- AND THE LANE IS SETTLED BEFORE THE PLAN IS READ: the plan is then fetched INSIDE the firm the
-- caller has proved, so a below-floor caller cannot tell a real foreign plan id from an absent
-- one, and no foreign row is locked on the way to a refusal.
--
-- ATTRIBUTION IS THE ANSWERER'S, AUTHORITY IS THE PROMOTER'S. `asserted_by` is the person who
-- answered the question (onboarding_plan_items.answered_by); the promoting actor is an admin (or
-- clara_runtime, reached only by the server). For a POLICY or authority-bearing key the answerer
-- must ALSO hold admin+ today -- otherwise the item is WITHHELD, by name, in the receipt, rather
-- than quietly recorded as a policy nobody with the authority ever stated.
--
-- AND THE ANSWERER'S RANK IS FLOORED ONLY THERE, which is the intended rule and not an oversight:
-- clara.update_onboarding_plan already required bookkeeper+ of whoever answered (0017:2661-2666),
-- the human promoting is admin+, and a DESCRIPTIVE assertion (entity_type, msic, a turnover band)
-- carries no authority of its own — so the promoter's authority is what admits it and the
-- answerer's name is what attributes it. Flooring every key at its own capture floor instead would
-- withhold the ordinary interview answers a bookkeeper is expected to give, which is the interview
-- this door exists to carry.
--
-- AN ITEM THE CATALOG CANNOT VALIDATE IS WITHHELD, NOT FATAL. A plan answered under the v1
-- interview carries a plain string where v2 folds an object (`framework`), so a whole promotion
-- must not abort on one legacy shape: the refusal is caught per item and named in the receipt.
-- =====================================================================================
create function clara.promote_plan_answers_to_knowledge(
    p_plan uuid, p_op_key text, p_promote_firm_scope boolean default false,
    p_firm uuid default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare
  p record; c record; it record; v_dedupe jsonb; v_actor uuid; v_via text; v_auditor uuid;
  v_firm uuid;
  v_promoted jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_one jsonb; v_scope text; v_client uuid; v_version bigint; v_reason text; v_detail text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- THE LANE, ITS FLOOR AND ITS TENANT ARE DECIDED BEFORE ANY PLAN IS LOOKED UP, and the ORDER
  -- is the fix. The first cut fetched the plan (`select … for update`) first and discriminated
  -- afterwards, so a caller who could never promote anything still learned something from the
  -- refusal it got: firm B's BOOKKEEPER naming firm A's REAL plan id got CLR04 (the admin floor),
  -- while the same caller naming a random uuid got CLR11 (not found). That is an existence oracle
  -- for a guessed id -- and on the way to refusing it also took a ROW LOCK on another firm's plan.
  -- 0021's rule (absent and foreign answer alike) applies one level up: a refusal must not depend
  -- on whether the object exists when the caller was never admitted to ask about it.
  --
  -- THE TWO LANES, AND THE MACHINE LANE NEEDS A ROLE WITNESS — not merely an absent claim.
  --
  -- THE HOLE THIS CLOSES, verbatim: this door is granted to clara_authenticated, the plan is
  -- fetched by id inside a clara_fn_owner definer, and the first cut read
  -- `clara.jwt_sub() is null` as "therefore the runtime". clara.jwt_sub() returns NULL for absent
  -- claims, unparseable claims and a non-uuid `sub` (0002:339-352), so ANY session on
  -- clara_authenticated whose claims were missing or malformed fell into the machine arm — which
  -- had no firm check at all — and could promote ANY firm's committed plan. 0042 closed exactly
  -- this class (0042:396-418) and its fix is the shape used here: discriminate the caller by the
  -- ROLE, the way clara._assert_due_read_ctx does (0042:437-455).
  --
  -- WHY NOT pg_has_role: 0042's own note records the measurement. The rig connects as postgres, a
  -- member of every role, so pg_has_role would classify every human cell as the machine lane and
  -- make this fix vacuously green. `current_setting('role')` is the SET ROLE the pooled session
  -- actually took; `session_user = 'clara_runtime_login'` is the third arm because
  -- packages/runtime/lib/pools.mjs issues its SET ROLE at checkout and that login exists for no
  -- other purpose.
  --
  -- NEITHER LANE IS OPEN BY DEFAULT: a caller that is neither an identified human nor the runtime
  -- is refused CLR03, the authority class, rather than falling through to the cheaper arm.
  v_actor := clara.jwt_sub();
  if v_actor is not null then
    -- The session's own firm decides, and a SUPPLIED p_firm is a belt that must agree with it.
    c := clara._human_ctx(clara.role_rank('admin'));
    if p_firm is not null and p_firm <> c.firm then
      raise exception 'onboarding plan not found' using errcode = 'CLR11';
    end if;
    v_firm := c.firm; v_via := 'human_ui'; v_auditor := c.actor;
  elsif coalesce(current_setting('role', true), 'none') = 'clara_runtime'
        or session_user in ('clara_runtime', 'clara_runtime_login') then
    -- AND THE MACHINE LANE NAMES THE TENANT IT MEANS -- the SECOND half of B1, and a different
    -- hole from the first. Once inside this arm, the only thing deciding which firm a promotion
    -- wrote into was the plan id, fetched by id alone inside a clara_fn_owner definer that sees
    -- every firm's plans. A mis-addressed (or chosen) id therefore promoted into whichever firm
    -- owned it, with nothing in the call stating which firm the caller meant and nothing to
    -- refuse when the two differed. "Derive it from the plan" is not a tenancy check; it is the
    -- absence of one.
    --
    -- clara.capture_knowledge_for is the shape this follows: the runtime lane NAMES its subject
    -- and the door verifies it. So p_firm is REQUIRED here, and a p_firm that is not the plan's
    -- own firm answers the no-existence-oracle refusal (absent and foreign alike, 0021's rule) --
    -- which now falls out of the lookup itself rather than out of a comparison after it.
    --
    -- IT IS DELIBERATELY NOT IN THE OP HASH below: p_firm ASSERTS something about the plan rather
    -- than choosing what the op does, and no effect happens outside that firm, so a replay that
    -- spells it differently still means the same act.
    if p_firm is null then
      raise exception 'the runtime promotion lane names the firm it is promoting into'
        using errcode = 'CLR10', detail = '{"reason":"promotion_firm_required"}';
    end if;
    v_firm := p_firm; v_via := 'clara_runtime';
  else
    raise exception 'promoting onboarding answers needs an identified admin or the runtime'
      using errcode = 'CLR03', detail = '{"reason":"no_promotion_context"}';
  end if;
  -- AND ONLY NOW THE PLAN, fetched INSIDE the tenant the caller has already proved. A plan id
  -- from anywhere else is simply absent here, so "foreign" and "does not exist" are one answer
  -- by construction rather than by a comparison someone could later drop.
  select * into p from clara.onboarding_plans op
   where op.id = p_plan and op.firm_id = v_firm
   for update;
  if not found then
    raise exception 'onboarding plan not found' using errcode = 'CLR11';
  end if;
  if v_via = 'clara_runtime' then v_auditor := p.committed_by; end if;
  v_dedupe := clara._reserve_op(p.firm_id, 'promote_plan_answers_to_knowledge', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'firm_scope', coalesce(p_promote_firm_scope, false))));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'committed' then
    raise exception 'only a committed onboarding plan promotes its answers'
      using errcode = 'CLR10', detail = '{"reason":"plan_not_committed"}';
  end if;
  -- AN UNATTRIBUTABLE PROMOTION IS NOT A PROMOTION. Only the machine lane can reach this with a
  -- null auditor (the human lane audits as its own caller), and an audit row with no actor is
  -- exactly the record ADR-062 exists to prevent.
  if v_auditor is null then
    raise exception 'this committed onboarding plan names no committer; there is nobody to audit the promotion to'
      using errcode = 'CLR10', detail = '{"reason":"plan_committer_unknown"}';
  end if;
  v_scope := p.scope_kind; v_client := p.client_id;
  if v_scope = 'firm' then
    -- EXPLICIT PARAMETER + admin+ (#603 Q22). The runtime lane has no admin actor and is refused.
    if not coalesce(p_promote_firm_scope, false) then
      raise exception 'promoting a firm plan writes FIRM-WIDE defaults; say so explicitly'
        using errcode = 'CLR10', detail = '{"reason":"firm_scope_not_requested"}';
    end if;
    if v_actor is null then
      raise exception 'a firm-wide default is an explicit admin act; the runtime lane cannot make one'
        using errcode = 'CLR04', detail = '{"reason":"firm_scope_requires_admin"}';
    end if;
  elsif coalesce(p_promote_firm_scope, false) then
    raise exception 'a client plan does not promote firm-wide' using errcode = 'CLR10',
      detail = '{"reason":"firm_scope_not_applicable"}';
  end if;

  for it in
    select i.item_key, i.answer, i.answered_by, i.answered_at,
           m.knowledge_key, k.kind, k.authority_bearing
      from clara.onboarding_plan_items i
      join clara.knowledge_plan_item_map m on m.item_key = i.item_key
      join clara.knowledge_keys k on k.knowledge_key = m.knowledge_key
     where i.plan_id = p_plan and i.state in ('answered','resolved')
       and i.answer is not null and i.answered_by is not null
     order by i.item_key
  loop
    if not exists (select 1 from clara.firm_memberships m
        where m.firm_id = p.firm_id and m.user_id = it.answered_by and m.status = 'active') then
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'answerer_not_active'));
      continue;
    end if;
    if (it.kind = 'policy' or it.authority_bearing)
       and not exists (select 1 from clara.firm_memberships m
             where m.firm_id = p.firm_id and m.user_id = it.answered_by and m.status = 'active'
               and clara.role_rank(m.role) >= clara.role_rank('admin')) then
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'answerer_rank_insufficient'));
      continue;
    end if;
    begin
      v_one := clara._knowledge_capture_core(
        p.firm_id, v_scope, v_client, it.knowledge_key, it.answer, '{}'::jsonb, null, null,
        'interview',
        format('Committed onboarding plan %s, interview item %s, answered %s',
               p_plan, it.item_key, it.answered_at),
        '{}'::jsonb, it.answered_by, v_via, 'skip', null, 'promote_plan_answers_to_knowledge');
    exception when sqlstate 'CLR10' or sqlstate 'CLR11' then
      get stacked diagnostics v_reason = returned_sqlstate, v_detail = pg_exception_detail;
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'refused',
        'sqlstate', v_reason, 'detail', v_detail));
      continue;
    end;
    if v_one ->> 'status' = 'skipped' then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'record_id', v_one -> 'record_id'));
    else
      v_promoted := v_promoted || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'record_id', v_one -> 'record_id',
        'revision_id', v_one -> 'revision_id', 'asserted_by', to_jsonb(it.answered_by)));
    end if;
  end loop;

  select version_n into v_version from clara.knowledge_versions where firm_id = p.firm_id;
  perform clara._audit(p.firm_id, v_auditor, null, null, 'promote_plan_answers_to_knowledge', null,
    jsonb_build_object('plan', p_plan, 'scope_kind', v_scope, 'client', v_client,
      'promoted', jsonb_array_length(v_promoted), 'skipped', jsonb_array_length(v_skipped),
      'withheld', jsonb_array_length(v_withheld), 'op_key', p_op_key));
  return clara._finish_op(p.firm_id, 'promote_plan_answers_to_knowledge', p_op_key,
    jsonb_build_object('plan_id', p_plan, 'scope_kind', v_scope, 'client_id', v_client,
      'promoted', v_promoted, 'skipped', v_skipped, 'withheld', v_withheld,
      'knowledge_version', coalesce(v_version, 0)::text));
end $door$;
revoke all on function clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid) from public;

-- =====================================================================================
-- §H — GRANTS. The human lane writes and reads; the runtime lane reads the pack, captures for a
-- named human and promotes a committed plan's answers; the agent role reads the TABLES it is
-- already trusted to read and holds EXECUTE on nothing here (a _human_ctx-gated read granted to a
-- role that carries no JWT is a DARK grant -- 0057's ruling).
-- =====================================================================================
grant execute on function
  clara.capture_knowledge(text, jsonb, text, text, text, uuid, text, jsonb, date, date, jsonb),
  clara.correct_knowledge(uuid, jsonb, text, text, text, text, jsonb),
  clara.withdraw_knowledge(uuid, text, text),
  clara.list_client_knowledge(uuid),
  clara.get_knowledge_record(uuid),
  clara.get_knowledge_history(uuid)
to clara_authenticated;

grant execute on function
  clara.capture_knowledge_for(uuid, uuid, text, jsonb, text, text, text, jsonb, date, date, jsonb, text),
  clara.get_knowledge_pack(uuid, text, uuid)
to clara_runtime;

-- The promotion door is the ONE name both lanes hold: the browser calls it right after the
-- onboarding commit it just made, and the server calls it for a run that committed a plan.
grant execute on function clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid)
  to clara_authenticated, clara_runtime;

reset role;

-- =====================================================================================
-- §I — THE FAIL-CLOSED TAIL. Every claim this file's header makes, measured from the catalog.
-- =====================================================================================
do $w644_tail$
declare v_n int; v_s text; v_t text; k text;
begin
  -- 1 · the relations, forced RLS, and the exact policy census.
  foreach k in array array['knowledge_keys','knowledge_records','knowledge_plan_item_map','knowledge_versions'] loop
    select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = k and c.relrowsecurity and c.relforcerowsecurity;
    if v_n <> 1 then
      raise exception '#644 tail: clara.% is not under FORCED row level security', k using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='clara' and c.relname=k and c.relowner = 'clara_fn_owner'::regrole;
    if v_n <> 1 then
      raise exception '#644 tail: clara.% is not owned by clara_fn_owner', k using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_policies
   where schemaname='clara' and tablename='knowledge_versions';
  if v_n <> 1 then
    raise exception '#644 tail: clara.knowledge_versions carries % policies, expected exactly the owner arm', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname='clara' and tablename='knowledge_records';
  if v_n <> 4 then
    raise exception '#644 tail: clara.knowledge_records carries % policies, expected owner + human + agent + runtime', v_n
      using errcode='CLR10';
  end if;

  -- 2 · NOBODY WRITES A KNOWLEDGE ROW BUT A DOOR. No application role holds any DML privilege on
  -- any of the four relations, and the version counter carries no grant at all.
  select count(*)::int into v_n
    from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
                      'clara_wake_interactive','clara_wake_proactive']) role,
         unnest(array['clara.knowledge_keys','clara.knowledge_records',
                      'clara.knowledge_plan_item_map','clara.knowledge_versions']) rel,
         unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) priv
   where has_table_privilege(role, rel::regclass, priv);
  if v_n <> 0 then
    raise exception '#644 tail: % DML privilege(s) exist on the knowledge relations -- every write goes through a door', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) role
   where has_table_privilege(role, 'clara.knowledge_versions'::regclass, 'SELECT');
  if v_n <> 0 then
    raise exception '#644 tail: the knowledge version counter is readable by an application role'
      using errcode='CLR10';
  end if;

  -- 3 · the catalog: five legacy keys carried BY VALUE, eight new ones, and the ten-row map.
  select count(*)::int into v_n from clara.knowledge_keys k join clara.client_fact_keys f
    on f.fact_key = k.knowledge_key
   where k.kind='assertion' and k.value_shape='string'
     and k.validated_against = f.validated_against
     and k.allowed_values is not distinct from f.allowed_values;
  if v_n <> 5 then
    raise exception '#644 tail: % of the 5 legacy fact keys carried with their own validation vocabulary', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 13 then
    raise exception '#644 tail: clara.knowledge_keys holds % key(s), expected 5 legacy + 8 new', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys where kind='policy';
  if v_n <> 2 then
    raise exception '#644 tail: % policy key(s), expected reporting_framework + accounting_basis', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys where kind='policy' and not authority_bearing;
  if v_n <> 0 then
    raise exception '#644 tail: a policy key is not authority-bearing' using errcode='CLR10';
  end if;
  -- THE CARRIED KEYS KEEP THEIR LEGACY FLOORS (B2a). clara.record_client_fact is admin+ for all
  -- five and customer_identity_policy is an OWNER act off 'name_only' (0063), so a knowledge
  -- capture of the same subject must not be cheaper.
  select count(*)::int into v_n from clara.knowledge_keys k join clara.client_fact_keys f
    on f.fact_key = k.knowledge_key
   where clara.role_rank(k.min_role) >= clara.role_rank('admin');
  if v_n <> 5 then
    raise exception '#644 tail: only % of the 5 carried keys carry an admin-or-higher min_role', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys
   where knowledge_key='customer_identity_policy' and min_role='owner';
  if v_n <> 1 then
    raise exception '#644 tail: customer_identity_policy does not carry the owner floor 0063 gives it'
      using errcode='CLR10';
  end if;
  if clara._knowledge_floor('entity_type','client') <> 'admin'
     or clara._knowledge_floor('customer_identity_policy','client') <> 'owner'
     or clara._knowledge_floor('coa_seed_decision','client') <> 'bookkeeper'
     or clara._knowledge_floor('coa_seed_decision','firm') <> 'admin'
     or clara._knowledge_floor('reporting_framework','client') <> 'admin' then
    raise exception '#644 tail: clara._knowledge_floor does not take the HIGHER of the key floor and the scope/kind floor'
      using errcode='CLR10';
  end if;

  select count(*)::int into v_n from clara.knowledge_plan_item_map;
  if v_n <> 10 then
    raise exception '#644 tail: the A5/A6 promotion map holds % row(s), expected 10', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_plan_item_map m
   where not exists (select 1 from clara.knowledge_keys k where k.knowledge_key = m.knowledge_key);
  if v_n <> 0 then
    raise exception '#644 tail: % map row(s) name a knowledge key that does not exist', v_n using errcode='CLR10';
  end if;
  -- NO OWNER-FLOORED KEY IS PROMOTABLE. The promotion door does NOT re-floor each key against
  -- knowledge_keys.min_role, and that is defensible only while the map carries nothing above the
  -- authority the promotion itself already demands: the human lane is admin+ of the plan's own
  -- firm, and the machine lane's authority comes from clara.commit_client_onboarding, itself
  -- admin+ (0017:2760). An OWNER key (today: customer_identity_policy, 0063) would break that
  -- reasoning, so mapping one must fail the migration rather than quietly become a cheaper route.
  select count(*)::int into v_n from clara.knowledge_plan_item_map m
    join clara.knowledge_keys k on k.knowledge_key = m.knowledge_key
   where clara.role_rank(k.min_role) > clara.role_rank('admin');
  if v_n <> 0 then
    raise exception '#644 tail: % promotion map row(s) name a key whose own floor is above admin -- the promotion door does not re-floor per key', v_n
      using errcode='CLR10';
  end if;

  -- 4 · THE TRUST MAP IS ONE MAP, stated twice. The CHECK (inline CASE, so a restore enforces it
  -- with no function present) and clara._knowledge_trust_of must agree on all six source kinds.
  select count(*)::int into v_n from unnest(array['user_statement','interview','registry_lookup',
      'document_extraction','imported_bundle','model_inference']) sk
   where clara._knowledge_trust_of(sk) is null;
  if v_n <> 0 then
    raise exception '#644 tail: clara._knowledge_trust_of answers NULL for % of the six source kinds', v_n
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_s from pg_constraint
   where conrelid='clara.knowledge_records'::regclass and conname='ck_knowledge_records_trust';
  foreach k in array array['user_statement','interview','registry_lookup','document_extraction',
                           'imported_bundle','model_inference'] loop
    if position(k in v_s) = 0 or position(clara._knowledge_trust_of(k) in v_s) = 0 then
      raise exception '#644 tail: ck_knowledge_records_trust does not name % -> %', k, clara._knowledge_trust_of(k)
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE DIGEST IS ONE EXPRESSION, in ONE function, STAMPED by the trigger (§B.1). The column
  --     is deliberately NOT generated: measured on PG17, sha256(convert_to(...)) is refused by a
  --     generation expression and the immutable-looking jsonb_pretty(x)::bytea raises 22P02 on any
  --     quoted value. So the assertions are: the column is a plain NOT NULL 64-hex text, no
  --     generation expression survives on it, the trigger body calls the helper, and the helper
  --     itself is both key-order-insensitive AND able to digest a value containing a quote, a
  --     backslash and a newline -- the exact class the old expression could not store.
  select count(*)::int into v_n from pg_attribute a
   where a.attrelid='clara.knowledge_records'::regclass and a.attname='applies_when_digest'
     and a.attnotnull and a.attgenerated = '';
  if v_n <> 1 then
    raise exception '#644 tail: applies_when_digest is not a plain NOT NULL column' using errcode='CLR10';
  end if;
  select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
   where n2.nspname='clara' and p2.proname='_tf_knowledge_authority';
  if v_s is null or position('_knowledge_applies_when_digest' in v_s)=0 then
    raise exception '#644 tail: the BEFORE INSERT trigger does not stamp the digest through clara._knowledge_applies_when_digest'
      using errcode='CLR10';
  end if;
  if clara._knowledge_applies_when_digest(jsonb_build_object('note', 'a "quoted" \ and a' || chr(10) || 'newline'))
     !~ '^[0-9a-f]{64}$' then
    raise exception '#644 tail: the applies_when digest cannot digest a quoted/escaped value'
      using errcode='CLR10';
  end if;
  if clara._knowledge_applies_when_digest('{"b":2,"a":1}'::jsonb)
     is distinct from clara._knowledge_applies_when_digest('{"a":1,"b":2}'::jsonb) then
    raise exception '#644 tail: the applies_when digest is key-order sensitive' using errcode='CLR10';
  end if;

  -- 6 · the live-uniqueness index and the supersession belts.
  select count(*)::int into v_n from pg_indexes
   where schemaname='clara' and indexname='uq_knowledge_live'
     and indexdef like '%WHERE (state = ''live''::text)%';
  if v_n <> 1 then
    raise exception '#644 tail: uq_knowledge_live is absent or is not partial on state=live' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.knowledge_records'::regclass and not tgisinternal
     and tgname in ('t_knowledge_records_authority','t_knowledge_records_supersede_only',
                    't_knowledge_records_no_delete','t_knowledge_records_no_truncate');
  if v_n <> 4 then
    raise exception '#644 tail: clara.knowledge_records carries % of its 4 belts', v_n using errcode='CLR10';
  end if;

  -- 7 · the four source pins are REAL, firm-congruent foreign keys onto the existing relations.
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.knowledge_records'::regclass and contype='f'
     and conname in ('fk_knowledge_records_source_document','fk_knowledge_records_source_extraction',
                     'fk_knowledge_records_source_region','fk_knowledge_records_source_work',
                     'fk_knowledge_records_client','fk_knowledge_records_supersedes_firm');
  if v_n <> 6 then
    raise exception '#644 tail: % of the 6 structural foreign keys are installed', v_n using errcode='CLR10';
  end if;

  -- 8 · LEGACY IS UNTOUCHED. The 0055 door still resolves at its exact signature, the legacy
  -- table gained no trigger of this file's, and nothing here wrote a client_facts row.
  if to_regprocedure('clara.record_client_fact(uuid,text,jsonb,text,text,uuid,text)') is null then
    raise exception '#644 tail: clara.record_client_fact no longer resolves at its 0055 signature'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.client_facts'::regclass and not tgisinternal and tgname like '%knowledge%';
  if v_n <> 0 then
    raise exception '#644 tail: this file put % trigger(s) on clara.client_facts', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_records;
  if v_n <> 0 then
    raise exception '#644 tail: this file seeded % knowledge record(s); it seeds NONE', v_n using errcode='CLR10';
  end if;

  -- 9 · the three event types, registered AND routed at the active taxonomy version.
  select count(*)::int into v_n from clara.event_types
   where name in ('knowledge.captured','knowledge.corrected','knowledge.withdrawn') and client_scoped;
  if v_n <> 3 then
    raise exception '#644 tail: % of the 3 knowledge event types are registered client-scoped', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t cross join clara.taxonomy_active a
   where t.version = a.version
     and ((t.event_type='knowledge.captured'  and t.decision='ignore')
       or (t.event_type='knowledge.corrected' and t.decision='context_update')
       or (t.event_type='knowledge.withdrawn' and t.decision='context_update'));
  if v_n <> 3 then
    raise exception '#644 tail: % of the 3 knowledge events are routed at the active taxonomy version with their intended decision', v_n
      using errcode='CLR10';
  end if;

  -- 10 · DEFINER HYGIENE + THE EXACT EXECUTE MATRIX, door by door.
  for v_s, v_t in
    select p.proname, pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname in ('capture_knowledge','capture_knowledge_for',
       'correct_knowledge','withdraw_knowledge','list_client_knowledge','get_knowledge_record',
       'get_knowledge_history','get_knowledge_pack','promote_plan_answers_to_knowledge')
  loop
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_s and pg_get_function_identity_arguments(p.oid)=v_t
       and p.prosecdef and p.proowner='clara_fn_owner'::regrole
       and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
       and exists (select 1 from unnest(p.proconfig) c where c='plan_cache_mode=force_custom_plan')
       and not (p.proacl is null
                or exists (select 1 from aclexplode(p.proacl) a
                            where a.grantee=0 and a.privilege_type='EXECUTE'));
    if v_n <> 1 then
      raise exception '#644 tail: clara.%(%) is not a PUBLIC-revoked, fn_owner-owned SECURITY DEFINER with search_path and plan_cache_mode pinned', v_s, v_t
        using errcode='CLR10';
    end if;
  end loop;

  select count(*)::int into v_n
    from unnest(array[
      'clara.capture_knowledge(text, jsonb, text, text, text, uuid, text, jsonb, date, date, jsonb)',
      'clara.correct_knowledge(uuid, jsonb, text, text, text, text, jsonb)',
      'clara.withdraw_knowledge(uuid, text, text)',
      'clara.list_client_knowledge(uuid)',
      'clara.get_knowledge_record(uuid)',
      'clara.get_knowledge_history(uuid)']) sig
   where has_function_privilege('clara_authenticated', sig::regprocedure, 'EXECUTE')
     and not has_function_privilege('clara_runtime', sig::regprocedure, 'EXECUTE')
     and not has_function_privilege('clara_agent_ro', sig::regprocedure, 'EXECUTE');
  if v_n <> 6 then
    raise exception '#644 tail: only % of the 6 human doors are clara_authenticated-ONLY', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from unnest(array[
      'clara.capture_knowledge_for(uuid, uuid, text, jsonb, text, text, text, jsonb, date, date, jsonb, text)',
      'clara.get_knowledge_pack(uuid, text, uuid)']) sig
   where has_function_privilege('clara_runtime', sig::regprocedure, 'EXECUTE')
     and not has_function_privilege('clara_authenticated', sig::regprocedure, 'EXECUTE')
     and not has_function_privilege('clara_agent_ro', sig::regprocedure, 'EXECUTE');
  if v_n <> 2 then
    raise exception '#644 tail: only % of the 2 runtime doors are clara_runtime-ONLY', v_n using errcode='CLR10';
  end if;
  if not (has_function_privilege('clara_authenticated',
            'clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid)'::regprocedure, 'EXECUTE')
      and has_function_privilege('clara_runtime',
            'clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('clara_agent_ro',
            'clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid)'::regprocedure, 'EXECUTE')) then
    raise exception '#644 tail: the promotion door is not exactly the two-lane grant it claims to be'
      using errcode='CLR10';
  end if;
  -- THE WAKE ROLES GAIN ZERO. Which knowledge a client's books rest on is a judgement, and a
  -- wake credential carries no JWT to make one with (0055's ACL doctrine, 0057's B6 ruling).
  select count(*)::int into v_n
    from unnest(array['clara_wake_interactive','clara_wake_proactive']) role,
         (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='clara' and (p.proname like '%knowledge%')) f
   where has_function_privilege(role, f.oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception '#644 tail: a wake role holds EXECUTE on % knowledge function(s)', v_n using errcode='CLR10';
  end if;

  -- THE PROMOTION DOOR DISCRIMINATES BY ROLE, not by a null claim (B1). Asserted from the BODY
  -- because the hole was a missing conjunct, and a body that lost it again would pass every
  -- happy-path cell: the machine arm must name the runtime role witness and refuse CLR03.
  select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
   where n2.nspname='clara' and p2.proname='promote_plan_answers_to_knowledge';
  if position('current_setting(''role''' in v_s) = 0
     or position('clara_runtime_login' in v_s) = 0
     or position('CLR03' in v_s) = 0 then
    raise exception '#644 tail: clara.promote_plan_answers_to_knowledge does not gate its machine lane on the runtime role witness'
      using errcode='CLR10';
  end if;
  -- …AND IT NAMES THE TENANT IT WRITES INTO. The second half of B1: the machine arm must demand
  -- an explicit p_firm, and the plan must be fetched INSIDE the firm the caller has proved rather
  -- than by id alone. Asserted from the BODY for the same reason as the arm above -- a lost
  -- conjunct passes every happy-path cell.
  if position('promotion_firm_required' in v_s) = 0
     or position('op.firm_id = v_firm' in v_s) = 0 then
    raise exception '#644 tail: the machine promotion lane does not require and verify an explicit firm binding'
      using errcode='CLR10';
  end if;
  -- …AND THE FLOOR IS APPLIED BEFORE THE PLAN IS EVER LOOKED UP (SHOULD-1: no existence oracle
  -- below the floor). Ordering, not presence, was the defect: a plan fetched first let a
  -- below-floor caller tell a real foreign plan id (CLR04, the floor) from a random one (CLR11,
  -- not found), and took a row lock on another firm's plan on the way. Measured as a POSITION
  -- comparison because that is exactly what the property is.
  if position('_human_ctx' in v_s) = 0
     or position('from clara.onboarding_plans op' in v_s) = 0
     or position('_human_ctx' in v_s) > position('from clara.onboarding_plans op' in v_s) then
    raise exception '#644 tail: clara.promote_plan_answers_to_knowledge looks the plan up BEFORE it applies the admin floor -- a below-floor caller can tell a real foreign plan from an absent one'
      using errcode='CLR10';
  end if;
  -- THE RUNTIME PACK NAMES ITS TENANT TOO (SHOULD-2). Same three properties, same reason: the
  -- machine lane must require p_firm, the human lane must take the session firm, and neither
  -- lane open by default.
  select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
   where n2.nspname='clara' and p2.proname='get_knowledge_pack';
  if position('pack_firm_required' in v_s) = 0
     or position('current_setting(''role''' in v_s) = 0
     or position('clara_runtime_login' in v_s) = 0
     or position('_human_ctx' in v_s) = 0
     or position('no_pack_context' in v_s) = 0
     or position('cl.firm_id = v_firm' in v_s) = 0 then
    raise exception '#644 tail: clara.get_knowledge_pack does not bind the tenant it reads -- a client id alone decides whose knowledge reaches the model'
      using errcode='CLR10';
  end if;

  -- THE HUMAN READ POLICY IS THE TENANT PREDICATE, not a bare true. Read from pg_policies so the
  -- claim is about what the CATALOG holds rather than about what this file's text says.
  select qual into v_s from pg_policies
   where schemaname='clara' and tablename='knowledge_records' and policyname='p_knowledge_records_human';
  if v_s is null or position('jwt_firm' in v_s) = 0 then
    raise exception '#644 tail: p_knowledge_records_human is not firm_id = clara.jwt_firm() (got %)', v_s
      using errcode='CLR10';
  end if;
  select qual into v_s from pg_policies
   where schemaname='clara' and tablename='knowledge_records' and policyname='p_knowledge_records_agent';
  if v_s is null or position('wake_firm' in v_s) = 0 then
    raise exception '#644 tail: p_knowledge_records_agent is not firm_id = clara.wake_firm() (got %)', v_s
      using errcode='CLR10';
  end if;

  -- THE LEGACY UNION IS UNSHADOWED AND SAYS WHICH ROW GOVERNS (B2). clara.client_facts is what
  -- the estate still reads for all five carried keys, so the register may not hide a legacy row
  -- behind a knowledge record of the same key.
  select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
   where n2.nspname='clara' and p2.proname='_knowledge_legacy_rows';
  if v_s is null or position('''authoritative'', true' in v_s) = 0
     or position('''source_kind'', ''legacy_client_fact''' in v_s) = 0
     or position('''editable'', false' in v_s) = 0 then
    raise exception '#644 tail: the legacy union does not flag its rows as the read-only ones in force'
      using errcode='CLR10';
  end if;
  -- THE NO-SHADOW RULE IS STRUCTURAL, not a conjunct someone can drop: the legacy expression
  -- never consults clara.knowledge_records, so there is nothing in it that COULD hide a legacy
  -- fact behind a knowledge record of the same key.
  if position('knowledge_records' in v_s) <> 0 then
    raise exception '#644 tail: the legacy union reads clara.knowledge_records -- it could shadow a client_fact'
      using errcode='CLR10';
  end if;
  -- …AND BOTH READS TAKE IT FROM THAT ONE PLACE. The pack omitting the legacy rows is precisely
  -- how C13 and a Work came to disagree about which value governs the same client.
  foreach k in array array['list_client_knowledge','get_knowledge_pack'] loop
    select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
     where n2.nspname='clara' and p2.proname=k;
    if position('_knowledge_legacy_rows' in v_s) = 0 then
      raise exception '#644 tail: clara.% does not carry the legacy client_facts that still govern', k
        using errcode='CLR10';
    end if;
  end loop;
  -- …while the FIRM shadow survives in BOTH reads, and is per-applicability in both (the
  -- shadow-by-applicability finding: matching on the key alone let a narrow client row erase an
  -- unconditional firm default).
  foreach k in array array['list_client_knowledge','get_knowledge_pack'] loop
    select prosrc into v_s from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
     where n2.nspname='clara' and p2.proname=k;
    if position('o.applies_when_digest = r.applies_when_digest' in v_s) = 0 then
      raise exception '#644 tail: clara.% shadows the firm default by KEY alone, not by key AND applicability', k
        using errcode='CLR10';
    end if;
  end loop;


  raise notice '#644 tail: OK -- clara.knowledge_keys (13 keys: the 5 legacy fact keys carried BY VALUE from clara.client_fact_keys with their own validation vocabulary, plus the 8 the A5/A6 interview actually produces, of which 2 are authority-bearing policies and 1 a preference), clara.knowledge_plan_item_map (10 item_key -> knowledge_key rows, every one of them an item key the live interview emits today), clara.knowledge_records and clara.knowledge_versions all exist under FORCED row level security owned by clara_fn_owner, with ZERO insert/update/delete/truncate privilege for any application role and no grant of any kind on the version counter; the record carries a stable record_id with monotone revisions, a structural (scope_kind=client)=(client_id is not null) scope, a composite (client, firm) tenant FK, four firm-congruent SOURCE pins onto documents/document_extractions/document_regions plus a Work pin, a sha256(convert_to(jsonb_pretty(applies_when))) applicability digest STAMPED by the BEFORE INSERT trigger through clara._knowledge_applies_when_digest (not a generated column -- the estate digest is refused by a generation expression and the immutable-looking bytea cast raises 22P02 on a quoted value), key-order-insensitive and able to digest a quoted/escaped condition, a partial uq_knowledge_live over (scope, subject, key, applicability) whose race answers knowledge_already_live by name rather than a bare 23505, the four immutability belts and a trust level that is a FUNCTION of the source kind -- stated inline in ck_knowledge_records_trust so a restore enforces it with no function in sight, and agreeing with clara._knowledge_trust_of on all six source kinds -- with policy keys admitting `asserted` alone at THREE belts (the inline CHECK, the catalog trigger, the door) and authority-bearing keys of any other kind at TWO (a table CHECK cannot read the catalog); the five carried legacy keys keeping their own doors'' floors (admin+, and OWNER for customer_identity_policy) and NO legacy client_fact being shadowed at all -- each rides BOTH the register and the runtime pack, through the one clara._knowledge_legacy_rows expression, beside any knowledge row of the same key with authoritative=true, because clara.client_facts is still the table the estate READS for every one of the five (get_context_pack 0055:765, the close gate 0056:1283, the name-only guard 0062:226, the bank-registry ledger 0121:4797) and this file does not dual-write; both reads taking their knowledge_version watermark over EVERY revision in scope (so a withdrawal cannot move it backwards) and emitting it as TEXT (a bigint through a JSON number is a lossy claim); clara.capture_knowledge / correct_knowledge / withdraw_knowledge / list_client_knowledge / get_knowledge_record / get_knowledge_history are clara_authenticated-ONLY, clara.capture_knowledge_for / get_knowledge_pack are clara_runtime-ONLY (and the pack, like the promotion door, NAMES the firm it reads through a required p_firm, looks the client up inside it and refuses CLR03 to a session that is neither an identified human nor the runtime role), clara.promote_plan_answers_to_knowledge is the ONE two-lane name and picks its lane from the CALLER (an identified admin of the plan''s own firm, or the clara_runtime role witness -- which must additionally NAME the firm it promotes into through p_firm and is refused CLR11 when that is not the plan''s own firm; anything else is CLR03, so a claims-less clara_authenticated session can neither reach the machine arm nor, having reached it, choose the tenant it writes into), with BOTH doors settling the lane and its floor BEFORE the object is looked up so that a below-floor caller cannot tell a real foreign id from an absent one, every one of the nine a PUBLIC-revoked fn_owner-owned SECURITY DEFINER with search_path and plan_cache_mode=force_custom_plan pinned, and NO wake or agent role holds EXECUTE on anything here; the three events are registered client-scoped and routed at the active taxonomy version (captured=ignore, corrected/withdrawn=context_update -- deliberately NOT one of the three wake-bound decisions, because each of those mints a held agent task that nothing in this slice would execute); and clara.record_client_fact still resolves at its exact 0055 signature with clara.client_facts carrying no trigger of this file and this file seeding ZERO knowledge records.';
end
$w644_tail$;
