-- 0255_onboarding_plan_firm_uniqueness.sql -- #894: HARDEN uq_onboarding_plans_one_open_firm's
-- PREDICATE so "a firm holds exactly one firm-scope onboarding plan for life" is a database
-- FACT, never merely the sole writer's discipline.
--
-- =====================================================================================
-- THE GAP THIS FILE CLOSES -- MEASURED, NOT ASSUMED
-- =====================================================================================
-- `uq_onboarding_plans_one_open_firm` (0218 §B) is a partial UNIQUE index on
-- `clara.onboarding_plans(firm_id)` predicated on `state = 'open' and scope_kind = 'firm'`. It
-- refuses a SECOND OPEN firm-scope plan for the same firm, but a firm-scope plan that has moved
-- to `committed` or `cancelled` no longer matches the predicate and a THIRD firm-scope plan --
-- open, committed or cancelled -- collides with nothing.
--
-- `clara.claim_paid_firm`'s replay arm (0186:1555-1557, unchanged verbatim since) reads:
--   select p.id into v_plan from clara.onboarding_plans p
--    where p.firm_id = v_req.firm_id and p.scope_kind = 'firm';
-- with NO `state` filter and no `limit`. If a firm ever held two firm-scope plans in ANY state,
-- this bare `select ... into` would silently take one of them -- PostgreSQL's documented
-- behaviour for a multi-row `select ... into` is to keep the LAST row fetched, an ordering this
-- query does not even attempt to control. Today that silent ambiguity cannot arise only because
-- `clara._create_firm_core` (0145:463-493) is the sole writer, is called at most once per firm
-- (it INSERTs a brand-new `clara.firms` row in the same statement), and nothing in the estate
-- closes a firm-scope plan (0218's own header, restated at #894's Agent Brief "out of scope").
-- That is a fact about today's callers, not a fact the database enforces -- exactly the gap
-- #648's own review comment on this issue named: "0218 §0.6 already proved no live firm
-- violates the wider predicate."
--
-- =====================================================================================
-- WHAT THIS FILE SHIPS
-- =====================================================================================
-- `uq_onboarding_plans_one_open_firm` is DROPPED and replaced with `uq_onboarding_plans_one_firm`
-- -- a partial UNIQUE index on the SAME column, `(firm_id)`, predicated on `scope_kind = 'firm'`
-- ALONE. A second firm-scope plan for the same firm, in ANY state (open, committed OR
-- cancelled), is now a loud `23505 unique_violation` naming this index -- structural, not a
-- writer's convention.
--
-- RENAMED, DELIBERATELY, NOT KEPT. The old name's `_one_open_` segment named a predicate keyed
-- on `state = 'open'`; keeping that name while dropping the state term entirely would leave the
-- object asserting -- by name alone -- a narrower invariant than the one it now enforces. Every
-- live reference to the old name is updated in this same commit: `packages/db/tests/
-- firm-setup.test.mjs` (the 0218 cohort probe and cell `p648.plans.one_open`, both now reading
-- the new name and predicate) and `packages/db/README.md` / `packages/db/tests/README.md`
-- (prose). This file's own tail re-reads the committed definition off `pg_index` rather than
-- trusting this sentence.
--
-- WHAT THIS FILE DOES NOT DO, each with its authority (Agent Brief "Key interfaces" / "Out of
-- scope"):
--   * it does NOT recut `clara.claim_paid_firm`. There is no `create or replace` in this file.
--     The claim door's replay arm goes from "correct because nothing today writes a second
--     plan" to "correct because the database refuses a second plan to exist" WITHOUT ONE BYTE
--     OF ITS OWN BODY CHANGING -- pinned pre- and post-image by `sha256(prosrc)` below, the
--     0230/0231/0232 idiom for a read-only dependency this file does not touch.
--   * it does NOT touch `uq_onboarding_plans_one_open` (0017), the CLIENT-scope sibling index on
--     `(firm_id, client_id)`. Re-read byte-for-byte at the tail, the same 0218 §J check restated.
--   * it does NOT change how a firm-scope plan is created or closed. `clara._create_firm_core`
--     stays the sole INSERT writer -- 0218 §0.6's own prosrc-scan wall is re-measured here rather
--     than assumed still true two migrations later.
--   * it mints no knowledge key, no event type and no new relation. One index, dropped and
--     replaced; nothing else in the catalog moves.
--
-- Spec of record: issue #894 (filed from WAVE-DIGEST.md §3 row 26, itself #648); the AI triage
-- comment dated 2026-09-17 (`65fde7f3`) and the Agent Brief it carries. Domain words:
-- CONTEXT.md -- "Onboarding plan", "Firm setup".
-- =====================================================================================

do $i894_pre$
declare
  v_n int;
  v_txt text;
  v_sha text;
  -- THE ONE PRE-IMAGE PIN. MEASURED, NEVER TRANSCRIBED (WORK-ORDER rule 8): sha256 of the LIVE
  -- `prosrc` read off `pg_proc` for `clara.claim_paid_firm(uuid,text)` on the lane database at
  -- frontier 0234, PostgreSQL 17.11. This file recuts nothing of it; the pin is what makes "not
  -- recut" a checked fact rather than a claim, and what forces a later worker who DOES recut it
  -- to come back and re-derive this file's tail.
  v_pin_claim constant text :=
    '7ac34d66a04f47e9e6647a78ca41763ec8f87595449ac80d14f9b454aa5029d7';
  -- THE OLD INDEX'S EXACT COMMITTED DEFINITION, measured the same way, on the same database, the
  -- same moment. §0.3 below refuses to proceed unless the LIVE object still reads identically --
  -- a ticket ahead of this one in the lane could in principle have already touched it.
  v_pin_old_def constant text :=
    'CREATE UNIQUE INDEX uq_onboarding_plans_one_open_firm ON clara.onboarding_plans USING btree (firm_id) WHERE ((state = ''open''::text) AND (scope_kind = ''firm''::text))';
begin
  -- 0.1 · THE RELATION AND THE THREE COLUMNS BOTH THE OLD AND THE NEW INDEX KEY ON.
  if to_regclass('clara.onboarding_plans') is null then
    raise exception '#894 prestate: clara.onboarding_plans is absent' using errcode='CLR10';
  end if;
  select string_agg(n, ', ') into v_txt from unnest(array['firm_id','scope_kind','state']) as t(n)
   where not exists (select 1 from information_schema.columns
                       where table_schema='clara' and table_name='onboarding_plans'
                         and column_name=t.n);
  if v_txt is not null then
    raise exception '#894 prestate: clara.onboarding_plans is missing column(s): %', v_txt
      using errcode='CLR10';
  end if;

  -- 0.2 · THE OBJECT THIS FILE REPLACES EXISTS, AND THE NAME IT REPLACES IT WITH IS FREE.
  if to_regclass('clara.uq_onboarding_plans_one_open_firm') is null then
    raise exception '#894 prestate: clara.uq_onboarding_plans_one_open_firm is absent -- nothing to harden'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.uq_onboarding_plans_one_firm') is not null then
    raise exception '#894 prestate: clara.uq_onboarding_plans_one_firm already exists -- this file installs it'
      using errcode='CLR10';
  end if;

  -- 0.3 · THE OLD INDEX'S LIVE DEFINITION IS EXACTLY THE ONE THIS FILE'S HEADER DESCRIBES.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_open_firm'::regclass;
  if v_txt is distinct from v_pin_old_def then
    raise exception '#894 prestate: uq_onboarding_plans_one_open_firm has DRIFTED from its pinned pre-image -- got {%}', v_txt
      using errcode='CLR10';
  end if;

  -- 0.4 · THE CLIENT-SCOPE SIBLING (0017) IS LIVE AND KEYED AS EXPECTED. This file does not
  -- touch it; §J re-reads the same fact at the tail.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_open'::regclass;
  if v_txt is null or position('(firm_id, client_id)' in v_txt) = 0 then
    raise exception '#894 prestate: uq_onboarding_plans_one_open is absent or no longer keyed on (firm_id, client_id) -- got {%}', v_txt
      using errcode='CLR10';
  end if;

  -- 0.5 · EXACTLY ONE WRITER OF A FIRM-SCOPE PLAN ROW, STILL. The 0218 §0.6(c) wall,
  -- re-measured: a second live writer would mean the "one call per firm" residual this file's
  -- header rests on no longer holds, and the widened index's own correctness argument with it.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and position('insert into clara.onboarding_plans(' in p.prosrc) > 0
     and position('''firm''' in p.prosrc) > 0;
  if v_n <> 1 then
    raise exception '#894 prestate: % function bodies insert a firm-scope onboarding plan (expected exactly 1: clara._create_firm_core)', v_n
      using errcode='CLR10';
  end if;

  -- 0.6 · THE CLAIM DOOR'S PRE-IMAGE PIN. Read-only dependency; this file recuts nothing of it.
  if to_regprocedure('clara.claim_paid_firm(uuid,text)') is null then
    raise exception '#894 prestate: clara.claim_paid_firm(uuid,text) is absent' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.claim_paid_firm(uuid,text)'::regprocedure;
  if v_sha <> v_pin_claim then
    raise exception '#894 prestate: clara.claim_paid_firm has DRIFTED from its pinned body (sha %) -- this file''s "the replay arm becomes structurally single-row without being recut" claim is a property of THAT body; re-derive it before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.7 · THE ACCEPTANCE CRITERION ITSELF: no firm already holds more than one firm-scope plan
  -- in ANY STATE -- not merely more than one OPEN one, which is all 0218 §0.6 proved. A loud
  -- failure here is the correct outcome: it would mean the widened predicate cannot be installed
  -- without first resolving a real duplicate by hand, and this file must not paper over that.
  select count(*)::int into v_n from (
    select 1 from clara.onboarding_plans
     where scope_kind='firm'
     group by firm_id having count(*) > 1) d;
  if v_n <> 0 then
    raise exception '#894 prestate: % firm(s) already hold more than one firm-scope onboarding plan in some combination of states -- uq_onboarding_plans_one_firm cannot be created until that is resolved by hand', v_n
      using errcode='CLR10';
  end if;

  raise notice '#894 prestate: clean -- clara.onboarding_plans carries firm_id/scope_kind/state; uq_onboarding_plans_one_open_firm is live at its pinned pre-image and uq_onboarding_plans_one_firm is not yet taken; uq_onboarding_plans_one_open (0017) is untouched at (firm_id, client_id); exactly one function body (clara._create_firm_core) inserts a firm-scope plan; clara.claim_paid_firm is at its pinned pre-image; and no firm holds more than one firm-scope plan in any state.';
end
$i894_pre$;

-- =====================================================================================
-- THE CHANGE. Drop the OPEN-only partial unique index and replace it with one keyed on
-- scope_kind ALONE -- the residual §0.7 above just proved holds for every live firm today, and
-- the one the estate's only writer (clara._create_firm_core, re-proven at §0.5) can never
-- violate: it always inserts a brand-new firm_id.
-- =====================================================================================
drop index clara.uq_onboarding_plans_one_open_firm;

create unique index uq_onboarding_plans_one_firm
  on clara.onboarding_plans (firm_id)
  where scope_kind = 'firm';

-- =====================================================================================
-- TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing here trusts this
-- file's own text: every claim is measured off pg_catalog.
-- =====================================================================================
do $i894_tail$
declare
  v_n int;
  v_txt text;
  v_sha text;
  v_pin_claim constant text :=
    '7ac34d66a04f47e9e6647a78ca41763ec8f87595449ac80d14f9b454aa5029d7';
begin
  -- 1 · THE OLD NAME IS GONE.
  if to_regclass('clara.uq_onboarding_plans_one_open_firm') is not null then
    raise exception '#894 tail: uq_onboarding_plans_one_open_firm still exists -- the rename did not take'
      using errcode='CLR10';
  end if;

  -- 2 · THE NEW INDEX, READ OFF pg_index RATHER THAN FROM THIS FILE'S OWN DDL TEXT: UNIQUE, on
  -- (firm_id) alone, predicated on scope_kind='firm' alone -- and carrying NO `state` term
  -- anywhere in its predicate, which is the whole of what "any state" means structurally.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_firm'::regclass;
  if v_txt is null or position('UNIQUE' in v_txt) = 0
     or position('(firm_id)' in v_txt) = 0
     or v_txt is distinct from
        'CREATE UNIQUE INDEX uq_onboarding_plans_one_firm ON clara.onboarding_plans USING btree (firm_id) WHERE (scope_kind = ''firm''::text)'
  then
    raise exception '#894 tail: uq_onboarding_plans_one_firm is not the expected partial UNIQUE index; got {%}', v_txt
      using errcode='CLR10';
  end if;
  if position('state' in v_txt) <> 0 then
    raise exception '#894 tail: uq_onboarding_plans_one_firm still names `state` in its predicate -- the widening did not take'
      using errcode='CLR10';
  end if;

  -- 3 · …and the 0017 CLIENT-scope index it complements is untouched, byte for byte.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_open'::regclass;
  if v_txt is null or position('(firm_id, client_id)' in v_txt) = 0 then
    raise exception '#894 tail: uq_onboarding_plans_one_open moved -- this file does not touch the client plan index'
      using errcode='CLR10';
  end if;

  -- 4 · clara.onboarding_plans GAINED NO COLUMN. This file replaces one index and nothing else
  -- on a relation it did not create.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='onboarding_plans';
  if v_n <> 21 then
    raise exception '#894 tail: clara.onboarding_plans has % columns, expected 21 -- this file must not have widened the table', v_n
      using errcode='CLR10';
  end if;

  -- 5 · clara.claim_paid_firm IS UNTOUCHED, BYTE FOR BYTE.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.claim_paid_firm(uuid,text)'::regprocedure;
  if v_sha <> v_pin_claim then
    raise exception '#894 tail: clara.claim_paid_firm''s body moved (sha %) -- this file must not have recut it', v_sha
      using errcode='CLR10';
  end if;

  -- 6 · EXACTLY ONE WRITER OF A FIRM-SCOPE PLAN ROW, STILL -- unchanged by this file, which adds
  -- no writer and touches no function.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and position('insert into clara.onboarding_plans(' in p.prosrc) > 0
     and position('''firm''' in p.prosrc) > 0;
  if v_n <> 1 then
    raise exception '#894 tail: % function bodies insert a firm-scope onboarding plan (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#894 tail: OK -- uq_onboarding_plans_one_open_firm is gone; uq_onboarding_plans_one_firm is a partial UNIQUE index on clara.onboarding_plans(firm_id) where scope_kind=''firm'' alone, with no state term in its predicate, so a second firm-scope plan for the same firm is refused by the database in ANY state (open, committed or cancelled) and not merely a second OPEN one; uq_onboarding_plans_one_open (0017) is untouched at (firm_id, client_id); clara.onboarding_plans still has exactly its 21 columns; clara.claim_paid_firm is byte-identical to its pinned pre-image, so its replay arm''s bare select ... into (0186:1555-1557) is now structurally single-row without one byte of its own body changing; and clara._create_firm_core is still the one and only writer of a firm-scope plan row.';
end
$i894_tail$;
