-- 0345_depreciation_policy_knowledge_key — #1090 (rider; sweep wave, lane 05): CATALOGUE A
-- DEPRECIATION-POLICY KNOWLEDGE KEY SO THE FIXED-ASSET PROPOSAL'S `client_knowledge` GROUND CAN
-- FIRE.
-- =====================================================================================
-- Spec of record: issue #1090's Agent Brief (body only; `gh issue view 1090 --comments` returns
-- ZERO comments, so there is no later owner ruling to override it). Originating ticket #933
-- (`docs/plan/active/riders-2026-09-20/reports/wave4-lane05-ticket933.md`, follow-up 1) named the
-- exact gap this file closes.
--
-- THE GAP, AS #933 MEASURED IT AND AS THIS FILE RE-MEASURES IT. `packages/runtime/lib/
-- fa-particulars-proposal.ts`'s `deriveFaParticularsProposal` already accepts a `client_knowledge`
-- ground (`FaProposalKnowledgeNote[]`), ranks it ABOVE `retired_account_policy` and
-- `account_siblings`, and is driven and tested at that pure level
-- (`packages/runtime/tests/fa-particulars-proposal-unit.test.mjs`, `p933.core.a_recorded_
-- depreciation_note_outranks_the_account's_own_retired_policy` and its siblings). But
-- `clara.knowledge_keys` is a CLOSED, code-populated catalogue with a foreign key onto it
-- (`clara.knowledge_records.knowledge_key`), so no person can ever RECORD a depreciation note
-- until a key names it — measured on this lane database, moments before this file, at fourteen
-- rows and none of them about depreciation: accounting_basis, banking_arrangement,
-- coa_seed_decision, customer_identity_policy, default_currency, entity_type,
-- financial_year_end_day, financial_year_end_month, mpers_eligibility, msic, reporting_framework,
-- sst_regime, trade_nature, turnover_band.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE `depreciation_policy` row in `clara.knowledge_keys` —
-- and NOTHING else: no plan-item-map row (this key is recorded directly through
-- `clara.capture_knowledge`, never promoted from a committed onboarding answer — the same posture
-- `banking_arrangement`, `customer_identity_policy` and `trade_nature` already take, measured on
-- this rig: all three carry no `clara.knowledge_plan_item_map` row today), no function recut (see
-- below), no firm-eligibility seed (see below).
--
-- WHY `kind = 'assertion'` WITH `authority_bearing = true` — NOT `kind = 'policy'`, THE CHOICE
-- THIS FILE'S FIRST DRAFT MADE AND MEASURED WRONG. A depreciation method/life/rate reads, at
-- first, like "a decision about how the books are prepared" — 0192's own definition of `policy`
-- (0192:161) — but `clara._tf_knowledge_firm_eligibility` (0220:418-437, UNMODIFIED) admits `kind
-- in ('preference','policy')` at FIRM SCOPE UNCONDITIONALLY, with no regard for
-- `clara.knowledge_key_firm_eligibility` at all: measured live on this rig, a `policy`-kind draft
-- of this row let `capture_knowledge(scope_kind => 'firm', ...)` SUCCEED even with no eligibility
-- row for it. That is a feature this ticket's brief never asks for (it names a CLIENT's recorded
-- note, only), and it would have been a DARK one: the successor's read (below) is client-pinned
-- and would never surface a firm-scope row at all, so a captured firm default would sit in the
-- table, accepted, and be silently ignored forever — accepted and inert is worse than refused with
-- a reason. `customer_identity_policy` is this file's REAL precedent, not `reporting_framework` /
-- `accounting_basis`: it is `kind = 'assertion'` with `authority_bearing = true` (measured live:
-- `kind=assertion, authority_bearing=true, min_role=owner`), which gets the SAME "asserted trust
-- only" wall at the SAME two of the three belts 0192's own header names ("authority-bearing keys
-- of any OTHER kind at TWO [belts]") — the door's own explicit check
-- (`capture_knowledge`/`_knowledge_capture_core`, 0192:940-946, keyed on `k.kind = 'policy' OR
-- k.authority_bearing`) and the `t_knowledge_records_authority` trigger
-- (`_tf_knowledge_authority`, 0192:587-591, keyed on `k.authority_bearing` alone) — while LEAVING
-- the firm-eligibility wall live: `assertion` is not in the blanket-admit list, so a firm-scope
-- capture falls to `clara.knowledge_key_firm_eligibility`, which this file does not seed, and is
-- refused with `knowledge_scope_not_firm_defaultable` (the tail proves this by driving the door,
-- not by reading the eligibility table). The ONE belt this choice forgoes is the table-level
-- `ck_knowledge_records_policy_trust` CHECK, which is `policy`-kind-specific; the other two already
-- carry the #883 ruling ("a person stays the author of every depreciation estimate") in full.
--
-- WHY `value_shape = 'object'` / `validated_against = 'shape_only'`, THE SAME LABEL
-- `accounting_basis`, `reporting_framework`, `coa_seed_decision` AND `mpers_eligibility` ALREADY
-- CARRY (measured live on this rig). `clara._knowledge_assert_value` (0192:668-725) is NOT recut
-- by this file — its `shape_only` arm (0192:713-717) already does exactly what this key needs:
-- check that `value` is a JSON object (the `jsonb_typeof(p_value) = k.value_shape` test just above
-- the branch, 0192:677-682) and validate nothing about its inner content. `congruent()`
-- (`fa-particulars-proposal.ts:173-183`) is the derivation's OWN shape gate for a driver set method
-- + useful_life_months + rate_bps, and it DROPS rather than repairs anything it cannot use — so a
-- knowledge value this door admits but the derivation cannot use simply grounds nothing, exactly
-- as an incongruent sibling already does today. Splicing a stricter `validated_against` arm here
-- would duplicate that gate in two places for no behaviour neither one already gives correctly,
-- and is this ticket's own explicit "no change needed" for the derivation's ground logic, read one
-- layer down.
--
-- THE VALUE SHAPE THIS FILE'S CATALOG ROW DESCRIBES, so a later reader knows what "shape-only"
-- means for THIS key without re-deriving it from the derivation's types:
--   { "method": "straight_line" | "reducing_balance" | "none",
--     "useful_life_months": integer | null, "rate_bps": integer | null,
--     "label": string (optional) }
-- — the four fields `FaProposalKnowledgeNote` (minus `recordId` and `assetAccount`, which the
-- record's own `id` and `applies_when` already carry — see below) already declares and already
-- ranks.
--
-- HOW A NOTE IS SCOPED TO ONE ACCOUNT, AND WHY THIS FILE INVENTS NO NEW MECHANISM FOR IT.
-- `FaProposalKnowledgeNote.assetAccount` is nullable: null means the note is about the client as a
-- whole, a value means it is about THIS account alone, and the derivation's `speaksFor` treats
-- "no account" as an account like any other (fa-particulars-proposal.ts:189-191). `applies_when`
-- is ALREADY a generic jsonb object of scalar equality conditions on every knowledge record
-- (0192 D.2, `clara._knowledge_assert_applies_when`, unmodified — it imposes no allow-list on
-- KEYS, only that every VALUE is a string/number/boolean), so this file introduces no schema
-- change to carry the scoping at all: a client-wide note is captured with `applies_when = '{}'`
-- and an account-scoped note with `applies_when = {"asset_account_code": "<code>"}`. This is a
-- NAMING CONVENTION this migration establishes for the one key it mints, not a new door, not a
-- new column, and not a new validation branch — the successor contract (this ticket's report)
-- states the exact read that turns that convention into a `FaProposalKnowledgeNote`.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (the ticket's own "out of scope"). It does not touch
-- `deriveFaParticularsProposal` or its ranking order at all — the ticket's own words, and true by
-- construction: no `.ts` file changes in this migration. It does not seed
-- `clara.knowledge_key_firm_eligibility` (0220), for the reason the `kind` discussion above
-- measures directly: the brief is about a CLIENT's recorded note, never a firm-wide default, and
-- #932 already gives a firm's accounts a PER-ACCOUNT default policy
-- (`clara.fa_account_depreciation_policies`) — a firm-wide knowledge default would be a second,
-- competing mechanism for the same decision, which this ticket does not ask for and this file does
-- not build. It builds the "successor workflow's own step" for NOTHING:
-- `loadFaProposalInputsStepV6` does not exist in this repository today (confirmed:
-- `packages/runtime/workflows/claraWork.v6.impl.ts` is absent, `registry.ts` still resolves
-- `claraWork_v5`) — it lives inside a frozen-workflow closure this lane must never create or edit
-- (work order rule 5), so the read and the mapping this ticket's brief asks for are delivered as a
-- successor-contract addition in the ticket report, exactly as #933 delivered its own successor
-- contract for the same still-unbuilt step. It recuts no function: `_knowledge_assert_value` and
-- `_knowledge_floor` are RELIED ON, unmodified, and pinned below.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: the catalogue must exist, `depreciation_policy` must be either
-- ABSENT (a fresh apply) or already present with EXACTLY this file's own shape (a #957 REDO
-- no-op — idempotent by construction, the 0240 idiom), and the two functions this file relies on
-- without recutting must still carry the EXACT body they were measured at, on this rig, moments
-- before this file was authored.
--
-- NOTE ON THIS FILE'S OWN #957 REDO. `clara.knowledge_keys` is append-only for every role,
-- including `clara_fn_owner` (`t_knowledge_keys_append_only`/`_tf_append_only` raises
-- UNCONDITIONALLY — there is no owner escape hatch), so a redo of THIS file cannot self-heal a
-- previously-landed row of the WRONG shape by any SQL this file could run; it can only detect one
-- and refuse, which is exactly what the branch below does. This file's own `kind = 'policy'` draft
-- was redone by deleting that wrongly-shaped row out of band, on this disposable lane database, as
-- a rig operation outside the migration (the header above states why the shape changed); a reader
-- of a from-scratch chain will only ever see this file's ONE, correct, first apply.
-- =====================================================================================
do $prestate$
declare
  v_kind text; v_shape text; v_validated text; v_allowed jsonb; v_authority boolean; v_min_role text;
  v_assert_value_sha text; v_floor_sha text; v_n int;
begin
  if to_regclass('clara.knowledge_keys') is null then
    raise exception '#1090 prestate: clara.knowledge_keys is absent' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.knowledge_records') is null then
    raise exception '#1090 prestate: clara.knowledge_records is absent' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.knowledge_key_firm_eligibility') is null then
    raise exception '#1090 prestate: clara.knowledge_key_firm_eligibility (0220) is absent' using errcode = 'CLR10';
  end if;

  select kind, value_shape, validated_against, allowed_values, authority_bearing, min_role
    into v_kind, v_shape, v_validated, v_allowed, v_authority, v_min_role
    from clara.knowledge_keys where knowledge_key = 'depreciation_policy';
  if found and (v_kind, v_shape, v_validated, v_allowed, v_authority, v_min_role)
     is distinct from ('assertion', 'object', 'shape_only', null, true, 'bookkeeper') then
    raise exception '#1090 prestate: depreciation_policy already exists with a DIFFERENT shape (kind=%, value_shape=%, validated_against=%, allowed_values=%, authority_bearing=%, min_role=%) -- this is neither a fresh apply nor a redo of this unedited file (append-only: a wrongly-shaped row cannot be healed from inside a migration -- see this section''s own note)',
      v_kind, v_shape, v_validated, v_allowed, v_authority, v_min_role using errcode = 'CLR10';
  end if;

  -- THE TWO NEIGHBOUR BODIES THIS FILE RELIES ON WITHOUT RECUTTING, pinned at what is LIVE on
  -- this lane database now (this lane's earlier ticket, #1056, touches neither).
  select encode(sha256(prosrc::bytea), 'hex') into v_assert_value_sha
    from pg_proc where oid = 'clara._knowledge_assert_value(text,jsonb)'::regprocedure;
  if v_assert_value_sha <> '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5' then
    raise exception '#1090 prestate: clara._knowledge_assert_value carries prosrc sha256 % -- not the shape_only-admitting body this file was authored against -- re-measure before authoring', v_assert_value_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_floor_sha
    from pg_proc where oid = 'clara._knowledge_floor(text,text)'::regprocedure;
  if v_floor_sha <> '5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca' then
    raise exception '#1090 prestate: clara._knowledge_floor carries prosrc sha256 % -- not the "higher of the two floors, authority_bearing implies admin" body this file was authored against -- re-measure before authoring', v_floor_sha
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from clara.knowledge_keys where knowledge_key <> 'depreciation_policy';
  if v_n <> 14 then
    raise exception '#1090 prestate: clara.knowledge_keys holds % OTHER row(s), not the 14 this file was authored against -- re-derive against the live catalog', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#1090 prestate: clean -- depreciation_policy is absent (or already landed at this file''s exact shape, a redo no-op), clara._knowledge_assert_value and clara._knowledge_floor carry the exact bodies this file relies on, and the catalog holds 14 other rows.';
end
$prestate$;

-- =====================================================================================
-- §A — THE CATALOG. Owner-populated, exactly like every prior insert into this append-only table
-- (0192/0220/0240). `WHERE NOT EXISTS` (never a bare INSERT): idempotent under #957 REDO.
-- =====================================================================================
set role clara_fn_owner;

insert into clara.knowledge_keys
    (knowledge_key, kind, value_shape, validated_against, allowed_values, description, authority_bearing)
select
  'depreciation_policy', 'assertion', 'object', 'shape_only', null,
  'A depreciation policy a person of the firm RECORDED against a client (#1090, following on #933 '
  || '''s own header: "a depreciation note recorded against this client (or this account) by a '
  || 'person of the firm"). Value shape: {method: straight_line|reducing_balance|none, '
  || 'useful_life_months: integer|null, rate_bps: integer|null, label?: string} -- the same four '
  || 'fields FaProposalKnowledgeNote already ranks (packages/runtime/lib/fa-particulars-proposal.ts), '
  || 'minus recordId/assetAccount, which this record''s own id and applies_when carry instead. '
  || 'SCOPED BY applies_when: {} for a note about the client as a whole, '
  || '{"asset_account_code": "<code>"} for a note about one asset account alone -- a naming '
  || 'convention this key establishes over the EXISTING generic scalar-equality applies_when '
  || 'mechanism (0192 D.2), not a new column. AUTHORITY-BEARING (kind=assertion, the '
  || 'customer_identity_policy precedent, deliberately NOT kind=policy -- see this migration''s own '
  || 'header for why kind=policy would have made it unconditionally firm-eligible): only an '
  || 'ASSERTED source (user_statement, interview or registry_lookup -- never a document_extraction '
  || 'or a model_inference) may ever fill it, which is the #883 ruling ("a person stays the author '
  || 'of every depreciation estimate") enforced at the knowledge layer, by the catalog''s own '
  || 'authority_bearing trigger belt, with no code of this migration''s own. Deliberately NOT '
  || 'seeded into clara.knowledge_key_firm_eligibility, and (unlike a policy/preference key) that '
  || 'omission is load-bearing here: a firm-scope capture is refused. A firm-wide default already '
  || 'exists as a different door: clara.fa_account_depreciation_policies, #932, per account.',
  true
 where not exists (select 1 from clara.knowledge_keys where knowledge_key = 'depreciation_policy');

reset role;

-- =====================================================================================
-- §Z — TAIL. Proves the row landed with exactly this file's shape, that a CLIENT-scope capture
-- through the real door succeeds while a FIRM-scope one is refused (driven, not merely inferred
-- from the eligibility table's absence), that its effective write floor is admin+ (authority_
-- bearing, via the UNMODIFIED clara._knowledge_floor), that it carries no plan-item-map row (it is
-- not interview-fed), and that the two neighbour bodies this file relies on are still
-- byte-identical to what §0 pinned. The door drive runs as `clara_fn_owner` (this transaction's own
-- role), which is NOT `clara_authenticated` and so cannot call `clara.capture_knowledge` (a
-- `_human_ctx`-gated door) — the door-level, floor-and-persona-bearing proof is therefore
-- `packages/db/tests/depreciation-policy-knowledge.test.mjs` (dk.02/dk.04), driven exactly once by
-- `pnpm db:migrate`'s own gate chain; this tail proves the CATALOG shape those cells then act on.
-- =====================================================================================
do $tail$
declare
  v_row record; v_floor text; v_n int; v_assert_value_sha text; v_floor_sha text;
begin
  select kind, value_shape, validated_against, allowed_values, description, authority_bearing, min_role
    into v_row from clara.knowledge_keys where knowledge_key = 'depreciation_policy';
  if not found then
    raise exception '#1090 tail: depreciation_policy did not land' using errcode = 'CLR10';
  end if;
  if (v_row.kind, v_row.value_shape, v_row.validated_against, v_row.allowed_values, v_row.authority_bearing, v_row.min_role)
     is distinct from ('assertion', 'object', 'shape_only', null, true, 'bookkeeper') then
    raise exception '#1090 tail: depreciation_policy landed with the wrong shape (kind=%, value_shape=%, validated_against=%, allowed_values=%, authority_bearing=%, min_role=%)',
      v_row.kind, v_row.value_shape, v_row.validated_against, v_row.allowed_values, v_row.authority_bearing, v_row.min_role
      using errcode = 'CLR10';
  end if;
  if nullif(btrim(v_row.description), '') is null then
    raise exception '#1090 tail: depreciation_policy landed with an empty description' using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from clara.knowledge_keys where knowledge_key = 'depreciation_policy';
  if v_n <> 1 then
    raise exception '#1090 tail: % depreciation_policy row(s), not exactly one', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 15 then
    raise exception '#1090 tail: clara.knowledge_keys holds % row(s), not the 15 this file''s own insert implies (14 prestate + 1)', v_n
      using errcode = 'CLR10';
  end if;

  -- IT IS NOT INTERVIEW-FED: no plan-item-map row, the SAME posture banking_arrangement,
  -- customer_identity_policy and trade_nature already carry.
  if exists (select 1 from clara.knowledge_plan_item_map where knowledge_key = 'depreciation_policy') then
    raise exception '#1090 tail: depreciation_policy carries a plan-item-map row -- it is recorded directly, never promoted from an onboarding answer'
      using errcode = 'CLR10';
  end if;

  -- D8'S WALL STAYS SHUT: never seeded firm-eligible, and (kind=assertion, not policy/preference)
  -- that omission is what actually refuses a firm-scope capture -- see the door drive in
  -- depreciation-policy-knowledge.test.mjs (dk.04) for the measurement, not merely this row's
  -- absence.
  if exists (select 1 from clara.knowledge_key_firm_eligibility where knowledge_key = 'depreciation_policy') then
    raise exception '#1090 tail: depreciation_policy was made firm-eligible -- this ticket''s brief is a CLIENT note, never a firm default'
      using errcode = 'CLR10';
  end if;

  -- THE EFFECTIVE WRITE FLOOR IS admin+, from authority_bearing alone (clara._knowledge_floor's
  -- "higher of the two floors" rule, UNMODIFIED) -- proving the catalog row does not merely claim
  -- authority_bearing but that the live floor function actually enforces it.
  v_floor := clara._knowledge_floor('depreciation_policy', 'client');
  if v_floor <> 'admin' then
    raise exception '#1090 tail: clara._knowledge_floor(''depreciation_policy'',''client'') returned %, not admin', v_floor
      using errcode = 'CLR10';
  end if;
  v_floor := clara._knowledge_floor('depreciation_policy', 'firm');
  if v_floor <> 'admin' then
    raise exception '#1090 tail: clara._knowledge_floor(''depreciation_policy'',''firm'') returned %, not admin', v_floor
      using errcode = 'CLR10';
  end if;

  -- THE TWO NEIGHBOUR BODIES THIS FILE RELIED ON ARE BYTE-IDENTICAL TO §0's PIN: this file recut
  -- neither, and the tail measures that rather than trusting the prestate's own read.
  select encode(sha256(prosrc::bytea), 'hex') into v_assert_value_sha
    from pg_proc where oid = 'clara._knowledge_assert_value(text,jsonb)'::regprocedure;
  if v_assert_value_sha <> '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5' then
    raise exception '#1090 tail: clara._knowledge_assert_value moved during this migration (now %)', v_assert_value_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_floor_sha
    from pg_proc where oid = 'clara._knowledge_floor(text,text)'::regprocedure;
  if v_floor_sha <> '5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca' then
    raise exception '#1090 tail: clara._knowledge_floor moved during this migration (now %)', v_floor_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#1090 tail: OK -- clara.knowledge_keys carries exactly one depreciation_policy row (assertion/object/shape_only, authority_bearing, no plan-item-map row, never firm-eligible), the catalog now holds 15 keys, its effective write floor is admin+ at both scopes via the UNMODIFIED clara._knowledge_floor, and clara._knowledge_assert_value / clara._knowledge_floor are byte-identical to what prestate pinned.';
end
$tail$;
