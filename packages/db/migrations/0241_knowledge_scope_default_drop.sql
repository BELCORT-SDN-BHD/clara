-- 0241_knowledge_scope_default_drop — #913 (rider; wave 2 lane 02): DROP THE DEAD
-- `clara.knowledge_keys.scope_default` COLUMN.
-- =====================================================================================
-- Spec of record: issue #913's Agent Brief (triage comment, 2026-09-17), itself #654's own final
-- report naming the column "provably dead" (three writes, `0192:167/208/224` -- the column
-- definition and its two seeding INSERT column lists -- and zero reads anywhere in `packages/`
-- or `apps/`, confirmed again by a whole-repo grep on this branch immediately before authoring
-- this file). #654's own orchestrator ruling (D8,
-- `docs/plan/active/refresh-wave-2026-09-15/brief-654.md`) REFUSED making it load-bearing
-- precisely because `clara.knowledge_keys` is append-only on UPDATE (0192:185-186): its
-- already-seeded rows -- every one of them `scope_default = 'client'` -- can never be
-- re-defaulted, so a column that cannot decide anything would still read as though it might.
-- 0220 built the real wall instead (`clara.knowledge_key_firm_eligibility`, a NEW fail-closed
-- relation seeded with the three keys D8 named); 0230's own header already commits this ticket
-- to owning the drop, and warns its own readers off the column by name. Nothing since has made
-- it live: 0240 (#898, this same lane, applied ahead of this file) reads `scope_default` only to
-- COPY it, by value, from `financial_year_end_month`'s existing row into a new one -- carrying
-- the dead value forward, never a new read of it as a decision.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. `alter table clara.knowledge_keys drop column if exists
-- scope_default` -- Postgres's own DROP COLUMN already takes the column's DEFAULT and its CHECK
-- down with it (both are properties of the column, not separate objects to drop by name): one
-- migration, one statement, zero data loss to any OTHER column, zero rows added or removed.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH. `clara.knowledge_key_firm_eligibility` and its two
-- guard triggers (0220) -- the ticket's own "out of scope" names them, along with the seeded keys
-- and the plan-item map. `ck_knowledge_keys_policy_authority`, the OTHER table-level CHECK on
-- this same table (`kind <> 'policy' or authority_bearing`) -- it does not mention
-- `scope_default` and the tail below proves it survives by name. No function is recut: a
-- repo-wide grep (repeated at prestate) finds the identifier in exactly the three places the
-- ticket's own triage measured, none of them a function body -- there is nothing to splice, and
-- so there is no `prosrc` sha256 to pin (the house shape's pin is the column's own measured
-- definition instead, below).
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: the catalogue must exist, and `scope_default` -- if still present
-- -- must carry exactly the definition this file was authored against (type, nullability,
-- default, its own CHECK, and every seeded value being `'client'`, so the drop loses no signal
-- beyond the dead default). If the column is ALREADY absent this is a #957 redo of this unedited
-- file (or a second apply attempt) and the prestate accepts that as the other half of the only
-- two legitimate states -- `drop column if exists` is itself the redo-safety the README asks for
-- (packages/db/README.md, "Redo (#957)": "write the redo target so re-running it ... is safe"),
-- so there is no separate "already-spliced" marker to check the way 0240's function recut needed
-- one. Either way the row count is pinned at 14 (0192's 13 plus 0240's `financial_year_end_day`,
-- the newest key on this lane's chain) so the tail can prove the drop moved no row.
-- =====================================================================================
do $prestate$
declare
  v_col_present boolean;
  v_data_type text; v_is_nullable text; v_default text; v_check_def text;
  v_n int; v_scope_vals text[];
begin
  if to_regclass('clara.knowledge_keys') is null then
    raise exception '#913 prestate: clara.knowledge_keys is absent' using errcode = 'CLR10';
  end if;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'knowledge_keys' and column_name = 'scope_default'
  ) into v_col_present;

  if v_col_present then
    select data_type, is_nullable, column_default
      into v_data_type, v_is_nullable, v_default
      from information_schema.columns
     where table_schema = 'clara' and table_name = 'knowledge_keys' and column_name = 'scope_default';
    if (v_data_type, v_is_nullable, v_default) is distinct from ('text', 'NO', '''client''::text') then
      raise exception '#913 prestate: scope_default no longer carries the shape this file was authored against (data_type=%, is_nullable=%, column_default=%) -- re-author against the live column', v_data_type, v_is_nullable, v_default
        using errcode = 'CLR10';
    end if;

    select pg_get_constraintdef(oid) into v_check_def
      from pg_constraint
     where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_scope_default_check';
    if v_check_def is distinct from $chk$CHECK ((scope_default = ANY (ARRAY['client'::text, 'firm'::text])))$chk$ then
      raise exception '#913 prestate: knowledge_keys_scope_default_check carries an unexpected definition (%) -- re-author against the live constraint', v_check_def
        using errcode = 'CLR10';
    end if;

    select array_agg(distinct scope_default order by scope_default) into v_scope_vals from clara.knowledge_keys;
    if v_scope_vals is distinct from array['client'] then
      raise exception '#913 prestate: scope_default carries value(s) % beyond the single ''client'' every seeded row was measured at -- the drop would lose a signal, not just a dead default', v_scope_vals
        using errcode = 'CLR10';
    end if;
  end if;

  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 14 then
    raise exception '#913 prestate: clara.knowledge_keys holds % key(s), not the 14 this file was authored against (0192''s 13 plus 0240''s financial_year_end_day)', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#913 prestate: clean -- clara.knowledge_keys holds 14 keys; scope_default is either the pristine text-not-null-default-''client'' column with its own CHECK and every row still ''client'', or already dropped (redo).';
end
$prestate$;

-- =====================================================================================
-- §A — THE DROP. Table-owner DDL, exactly like 0192's own `create table` for this relation.
-- =====================================================================================
set role clara_fn_owner;

-- `if exists`, not a bare `drop column`: makes the statement its own redo guard (a first apply
-- drops a real column; re-running this unedited file against a database that already carries the
-- new effect is a silent no-op, never an error) -- README's own advice for a #957 redo target.
-- Postgres drops the column's DEFAULT and its CHECK (`knowledge_keys_scope_default_check`) with
-- it; neither is a separate object this file must name to remove.
alter table clara.knowledge_keys drop column if exists scope_default;

reset role;

-- =====================================================================================
-- §Z — TAIL. Proves the column and its CHECK are gone, that the ONE OTHER table-level CHECK on
-- this table survives by name, that the catalogue's rows and their kind census are byte-for-byte
-- what they were before the drop, that the floor function 0192's own tail already pinned answers
-- the same five probes unchanged, and that the firm-eligibility census 0898's tail last moved to
-- 10 is untouched by a column that wall never read.
-- =====================================================================================
do $tail$
declare
  v_n int; v_col_present boolean; v_chk_present boolean; v_kinds jsonb; v_refused int;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'knowledge_keys' and column_name = 'scope_default'
  ) into v_col_present;
  if v_col_present then
    raise exception '#913 tail: scope_default is still present on clara.knowledge_keys' using errcode = 'CLR10';
  end if;

  select exists (
    select 1 from pg_constraint
     where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_scope_default_check'
  ) into v_chk_present;
  if v_chk_present then
    raise exception '#913 tail: knowledge_keys_scope_default_check survived the column drop' using errcode = 'CLR10';
  end if;

  -- THE OTHER TABLE-LEVEL CHECK IS UNTOUCHED, BY NAME -- proof this file dropped exactly the one
  -- column the ticket named and nothing else.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_policy_authority'
  ) then
    raise exception '#913 tail: ck_knowledge_keys_policy_authority (unrelated to scope_default) is gone' using errcode = 'CLR10';
  end if;

  -- AC1's SECOND HALF, PROVED ON THIS DATABASE RATHER THAN ASSUMED: every row 0192's two seeding
  -- inserts and 0240's own insert put there is still exactly there, at the same count, with the
  -- same kind distribution -- a column drop moves no other column's data.
  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 14 then
    raise exception '#913 tail: clara.knowledge_keys holds % key(s) after the drop, not the 14 present before it', v_n
      using errcode = 'CLR10';
  end if;
  select jsonb_object_agg(kind, n) into v_kinds
    from (select kind, count(*)::int n from clara.knowledge_keys group by kind) s;
  if v_kinds is distinct from '{"assertion": 11, "policy": 2, "preference": 1}'::jsonb then
    raise exception '#913 tail: the kind census moved to % -- a column drop must not change the catalogue''s rows', v_kinds
      using errcode = 'CLR10';
  end if;

  -- AC3, PROVED THROUGH THE REAL FLOOR FUNCTION, NOT RE-READ FROM THE CATALOGUE: every capture
  -- door's own `select * into k from clara.knowledge_keys ...` idiom (0192:578,672,937,1244,1388;
  -- 0220:719; 0230:468) never named `scope_default`, so none of them can have broken, and the
  -- five probes 0192's OWN tail already proved (`#644 tail: clara._knowledge_floor does not take
  -- the HIGHER of the key floor and the scope/kind floor`) still answer the same.
  if clara._knowledge_floor('entity_type', 'client') <> 'admin'
     or clara._knowledge_floor('customer_identity_policy', 'client') <> 'owner'
     or clara._knowledge_floor('coa_seed_decision', 'client') <> 'bookkeeper'
     or clara._knowledge_floor('coa_seed_decision', 'firm') <> 'admin'
     or clara._knowledge_floor('reporting_framework', 'client') <> 'admin' then
    raise exception '#913 tail: clara._knowledge_floor answers differently after the drop -- it must read nothing this file touched'
      using errcode = 'CLR10';
  end if;

  -- AC2, RE-MEASURED LIVE (never assumed): the firm-eligibility census 0220 built and #898's own
  -- tail last moved to 10 is untouched by a column this wall never read.
  select count(*)::int into v_refused
    from clara.knowledge_keys k
   where not exists (select 1 from clara.knowledge_key_firm_eligibility e where e.knowledge_key = k.knowledge_key)
     and k.kind not in ('preference', 'policy');
  if v_refused <> 10 then
    raise exception '#913 tail: % key(s) are refused at firm scope, not the 10 the live 14-key catalogue implies', v_refused
      using errcode = 'CLR10';
  end if;

  raise notice '#913 tail: OK -- clara.knowledge_keys.scope_default and its own CHECK are gone, ck_knowledge_keys_policy_authority (unrelated) survives, the catalogue still holds 14 keys at the same kind census, clara._knowledge_floor answers the five 0192-pinned probes unchanged, and the firm-scope-refused census is still 10.';
end
$tail$;
