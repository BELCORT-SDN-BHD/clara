-- 0057_wave_e_registry_snapshots.sql -- Wave E lane gamma: the period registry + month
-- snapshots + the staleness machinery (E-R3).
--
-- MIGRATION NUMBER claimed at MERGE (standing law). Authored as 0057 on the beta stack
-- (repo frontier 0056 at authoring); renumber mechanically if the merge order moves.
--
-- DESIGN HOME (ratified, PR #223): wave-e-design-skeleton-part3.md SS2.11 (period_snapshots +
-- snapshot_assessments + the staleness machinery) and SS2.12 (clara.reporting_periods).
-- Acceptance oracles: wave-e-acceptance-matrix.md Section E (cells E1, E1b, E2, E2b, E3, E4,
-- E5, E6, E7, E8, E9, E10, E11). The contract (wave-e-contract.md, ADR-065) wins on any
-- conflict. E-R7: one campaign; this lane build-feeds delta (the metric evaluator) and theta.
--
-- MONTHS NEVER LOCK. A month gets an ARTIFACT; the books stay OPEN. Nothing in this file
-- refuses a write, holds a durable lock, or changes any existing writer's body: the only
-- new refusals live inside this file's own new doors, and the only new triggers APPEND a row
-- to a new append-only ledger. That is the structural reading of E-R3 and matrix cell E1's
-- negative case ("a snapshot that locks the month is a FAIL of E-R3").
--
-- WHAT THIS FILE SHIPS, in section order:
--   S1  clara.reporting_periods -- the period registry (SS2.12 DDL verbatim): grain
--       month|fiscal_year, BOTH ENDS INCLUSIVE, ck_rp_month_bounds (a 'month' row IS a
--       calendar month), the TWO unique constraints (the second kills same-start overlapping
--       rows, which is what makes $P-1 unambiguous -- matrix E1b), composite tenant FKs, and
--       the fiscal-year CONGRUENCE trigger a CHECK cannot express. Immutable after mint.
--   S2  clara.period_snapshots -- the artifact. BYTES IMMUTABLE by trigger (payload,
--       dataset_sha256, the range, the watermark and the identity columns); no delete.
--       Range/tenant congruence with its period row is STRUCTURAL (a five-column composite
--       FK), not a trigger -- a snapshot labelled July can never be bound to June's row.
--   S3  clara.snapshot_assessments -- the append-only assessment ledger. DUPLICATE 'stale'
--       rows are EXPECTED BY DESIGN and there is deliberately NO unique index (SS2.11).
--   S4  the reads: _days_in_period_core/days_in_period (the ONE definition of period length)
--       and _snapshot_state_core/snapshot_state (latest-assessment, ordered by the identity
--       SEQUENCE -- "latest is a sequence, never a timestamp").
--   S5  clara._ensure_month_period -- the internal idempotent month-row primitive (delta's
--       future route AND mint_month_snapshot's own), plus the AFTER INSERT trigger on
--       clara.fiscal_years that mints the fiscal_year-grain row. The TRIGGER route is the
--       settled choice: open_fiscal_year's body is NOT patched, so this file carries no D1
--       write-quiesce exposure at all.
--   S6  clara._snapshot_dataset -- the ONE recipe (mint and verify share it, so they cannot
--       drift) -- and clara.mint_month_snapshot, the audited human door.
--   S7  clara.verify_snapshot -- the honest-boundary backstop (matrix E10). A POSITIVE read
--       that recomputes and REPORTS drift; its own comment AND its return payload carry the
--       list of what staleness triggers can NOT catch.
--   S8  the staleness machinery: _mark_snapshots_stale + _tf_snapshot_staleness, and the
--       AFTER row triggers on EXACTLY SIX tables -- journal_entries, open_item_allocations,
--       fixed_assets, bank_statements, bank_reconciliations, bank_line_exceptions.
--   S9  the event type (snapshot.minted) on BOTH registers -- the 0055 S7.5 lesson: an
--       unregistered type turns every successful door call into a CLR10 at the spine.
--   S10 the grant matrix: clara_authenticated gets the door + the three reads; the agent,
--       both wake roles and clara_runtime gain ZERO.
--   S11 tail: prestate-paired censuses (trigger coverage, the SS2.11 writer roster, the
--       FA-depreciation class proven COVERED rather than assumed), the three v1/v2-defect
--       rows proven from live bodies, privilege sweeps by has_function_privilege, forced RLS
--       on all three tables, and the STATED out-of-scope decision.
--
-- REFUSAL CODES: 0057 claims NO new CLR code. Every refusal reuses a standing owner --
-- CLR04 (role floor, via _human_ctx), CLR10 (malformed request / incongruent period),
-- CLR11 (not-found-in-your-firm, no existence oracle), CLR08 (immutability, via the
-- pre-existing _tf_append_only). A migration that needs no new code should claim none.
--
-- LOCKS: mint_month_snapshot takes 203005007-EXCLUSIVE (0056's close-serialize namespace)
-- and NOTHING ELSE, so it cannot be half of a cycle: 007 is the BOTTOM rung on every path
-- and a caller that takes only the bottom rung takes it last by definition. The lock is
-- what makes the watermark honest -- every writer-side trigger on the six covered tables
-- already takes 007-SHARED as its first act (0056 S4), so a mutation cannot commit inside
-- the window between the mint's read and the mint's watermark. It is held for the mint's own
-- transaction only; it locks no month and refuses no write.
--
-- D1 WRITE-QUIESCE: NOT REQUIRED. This file replaces NO existing function body and splices
-- nothing -- the S11 tail proves it by md5 pairs over the writers it could plausibly have
-- touched. It does CREATE triggers on clara.journal_entries (the hottest table), so the
-- deploy ceremony still wants a lock_timeout for the trigger DDL, exactly as 0056's did.
-- INERT ON ARRIVAL: zero period_snapshots rows exist at deploy, so the staleness trigger's
-- marking loop matches nothing and every covered writer is unchanged in observable
-- behaviour until the first human mint_month_snapshot.
--
-- CELLS: packages/db/tests/x57-*.test.mjs (matrix Section E). Contract-blind on this file:
-- the cells probe the LIVE catalog, never this .sql.
set local statement_timeout = '5min';

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file relies on is measured here, before anything
-- changes. A second run of this migration must ABORT at (0.2).
-- =====================================================================================
create temp table _x57_pre(
  k text primary key,
  v text not null
) on commit drop;

do $s0$
declare
  v_n int; v_t text;
begin
  -- (0.1) The change-of-record owners this file builds on must be applied, in order.
  foreach v_t in array array['0037_wave_c_a_subledger','0038_wave_c_b_bank',
      '0040_wave_c_c_tieout','0041_wave_d_a_fa_register','0055_client_facts_trio',
      '0056_wave_e_close_model'] loop
    select count(*) into v_n from clara.schema_migrations where version = v_t;
    if v_n <> 1 then
      raise exception '0057 S0.1: % is not recorded as applied -- apply in order', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) THE BIRTH SET MUST BE ABSENT. This is the re-apply refusal.
  foreach v_t in array array['reporting_periods','period_snapshots','snapshot_assessments'] loop
    if to_regclass('clara.' || v_t) is not null then
      raise exception '0057 S0.2: clara.% already exists -- refusing to re-birth', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.3) The SIX tables this file will carry a staleness trigger on all exist, and NONE
  -- of them already carries a trigger by that name (a name collision would silently
  -- replace nothing and leave the mover uncovered -- the exact defect class SS2.11 exists
  -- to catch).
  foreach v_t in array array['journal_entries','open_item_allocations','fixed_assets',
      'bank_statements','bank_reconciliations','bank_line_exceptions'] loop
    if to_regclass('clara.' || v_t) is null then
      raise exception '0057 S0.3: clara.% does not exist -- the staleness set cannot be built', v_t
        using errcode = 'CLR10';
    end if;
    select count(*) into v_n from pg_trigger g
      where g.tgrelid = ('clara.' || v_t)::regclass and g.tgname = 't_snapshot_staleness'
        and not g.tgisinternal;
    if v_n <> 0 then
      raise exception '0057 S0.3: clara.% already carries t_snapshot_staleness', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.4) The columns the staleness predicate reads as EFFECT DATES exist, at the names
  -- SS2.11 names them by. A renamed column would make the trigger read NULL and -- because
  -- NULL falls to the fail-safe branch -- mark EVERY snapshot stale forever, which is a
  -- silent, permanent degradation rather than a refusal. So it is measured here.
  for v_t in select unnest(array['journal_entries.posting_date','journal_entries.client_id',
      'open_item_allocations.effective_date','open_item_allocations.client_id',
      'fixed_assets.acquired_date','fixed_assets.depreciation_start_date',
      'fixed_assets.baseline_as_of','fixed_assets.client_id',
      'bank_statements.period_end','bank_statements.client_id',
      'bank_reconciliations.statement_id','bank_reconciliations.client_id',
      'bank_line_exceptions.statement_id','bank_line_exceptions.client_id']) loop
    select count(*) into v_n from information_schema.columns
      where table_schema = 'clara' and table_name = split_part(v_t, '.', 1)
        and column_name = split_part(v_t, '.', 2);
    if v_n <> 1 then
      raise exception '0057 S0.4: clara.% is missing -- the staleness effect-date read was authored against it', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.5) The OWNER RLS policy on every table the SECURITY DEFINER staleness path reads.
  -- clara_fn_owner is NOT BYPASSRLS and FORCE RLS applies to it (0002:10-12), so a missing
  -- owner policy makes a definer read return ZERO rows -- the A6e fail-open shape, here in
  -- its staleness dress: bank_statements without p_bank_statements_owner would make every
  -- bank effect date resolve NULL.
  foreach v_t in array array['bank_statements','clients','users'] loop
    select count(*) into v_n from pg_policies
      where schemaname = 'clara' and tablename = v_t and 'clara_fn_owner' = any(roles);
    if v_n < 1 then
      raise exception '0057 S0.5: clara.% carries no clara_fn_owner policy -- a definer read of it would see ZERO rows', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.6) The helpers this file leans on, at their pinned signatures. clara._hash is a REAL
  -- sha256 (0004:32-33, sha256(convert_to(...))) and this file positively asserts that
  -- rather than trusting the name -- beta's R1 MAJOR was an md5 wearing a sha256 label.
  if to_regprocedure('clara._hash(jsonb)') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)') is null
     or to_regprocedure('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)') is null
     or to_regprocedure('clara._book_today()') is null
     or to_regprocedure('clara._aging_core(uuid,uuid,text,date)') is null
     or to_regprocedure('clara.trial_balance_as_of(uuid,date)') is null
     or to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '0057 S0.6: a required helper is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;
  -- The hash instrument, proven by VALUE against an independently-computed sha256 -- not by
  -- reading the function's name, and not by reading its source text either.
  if encode(clara._hash('{"a":1}'::jsonb), 'hex')
     <> encode(sha256(convert_to('{"a": 1}', 'UTF8')), 'hex') then
    raise exception '0057 S0.6: clara._hash does not reproduce sha256 over the jsonb text -- dataset_sha256 would be a mislabelled digest'
      using errcode = 'CLR10';
  end if;
  if length(encode(clara._hash('{"a":1}'::jsonb), 'hex')) <> 64 then
    raise exception '0057 S0.6: clara._hash is not 256 bits wide' using errcode = 'CLR10';
  end if;

  -- (0.7) The composite-FK targets SS2.12 names must exist as UNIQUE constraints (the
  -- 0007:59 idiom): tenant congruence is structural on both edges or it is not structural.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.clients'::regclass and conname = 'uq_clients_id_firm')
     or not exists (select 1 from pg_constraint
                  where conrelid = 'clara.fiscal_years'::regclass and conname = 'uq_fy_id_firm') then
    raise exception '0057 S0.7: a composite-FK target (uq_clients_id_firm / uq_fy_id_firm) is missing'
      using errcode = 'CLR10';
  end if;

  -- (0.8) The bodies this file must leave ALONE. Stashed here and re-read at the tail: a
  -- prestate/tail pair proves the migration did not touch them; "we did not edit them"
  -- proves nothing (0056 S0.4's instrument, reused).
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.open_fiscal_year(uuid,text,date,date,text,text)'::regprocedure;
  insert into _x57_pre(k, v) values ('ofy_md5', v_t);
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  insert into _x57_pre(k, v) values ('fc_md5', v_t);
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.apply_open_items(uuid,jsonb,text,text)'::regprocedure;
  insert into _x57_pre(k, v) values ('aoi_md5', v_t);

  -- (0.10) THE BEGIN ATOMIC BIRTH SENTINEL -- the blind spot that would make S11.2d's
  -- census silently vacuous rather than merely narrow. A function written with a
  -- SQL-standard `BEGIN ATOMIC ... END` body stores its text in pg_proc.prosqlbody as a
  -- PARSED NODE TREE and leaves prosrc EMPTY. Every instrument in this file's tail reads
  -- prosrc, so such a function is invisible to ALL of them: it could insert into
  -- clara.journal_entries on every call and the inverse census would report a clean sweep.
  -- That is worse than a known gap, because the census would still be claiming completeness.
  --
  -- Measured 0 in clara today (the whole schema is plpgsql and quoted-body SQL). The
  -- sentinel is at BIRTH rather than in the tail because it is a property of the SCHEMA,
  -- not of this migration's work, and because failing here names the cause before any of
  -- 0057's own objects exist to confuse the diagnosis. When a future migration ships the
  -- first BEGIN ATOMIC body, this raises and that migration owes the tail a prosqlbody-aware
  -- detector -- the class fails CLOSED.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and coalesce(p.prosrc, '') = '' and p.prosqlbody is not null;
  if v_n <> 0 then
    raise exception '0057 S0.10: % clara function(s) carry a BEGIN ATOMIC (prosqlbody) body -- prosrc is empty for those, so every prosrc-based census in this file''s tail is BLIND to them. Teach the detectors pg_get_function_sqlbody() before this file may pass.', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.9) The watermark INSTRUMENT, proven by behaviour before anything depends on it.
  -- The staleness predicate's whole "already inside the snapshot" half is
  -- pg_visible_in_snapshot(pg_current_xact_id(), <stored pg_snapshot>). Two properties are
  -- load-bearing and both are asserted, not assumed:
  --   (a) this transaction's own xid is NOT visible in a snapshot taken by this
  --       transaction -- so a mutation that lands AFTER a mint reads as "outside the
  --       watermark" and marks stale (the E2/E2b arm), and
  --   (b) a snapshot taken NOW does see an already-committed xid -- so a mutation the mint
  --       genuinely read is not re-marked (the skip arm).
  -- (b) is measured against this transaction's snapshot xmin-1, which is by construction an
  -- xid whose transaction completed before this snapshot was taken.
  if pg_visible_in_snapshot(pg_current_xact_id(), pg_current_snapshot()) then
    raise exception '0057 S0.9: this backend reports its OWN xid as visible in its own snapshot -- the watermark predicate would never mark anything stale'
      using errcode = 'CLR10';
  end if;
  if not pg_visible_in_snapshot(
       (pg_snapshot_xmin(pg_current_snapshot())::text::bigint - 1)::text::xid8,
       pg_current_snapshot()) then
    raise exception '0057 S0.9: a pre-snapshot xid does not read as visible -- the watermark predicate would mark every snapshot stale forever'
      using errcode = 'CLR10';
  end if;
  -- The stored text must round-trip through the CHECK this file puts on the column.
  if pg_current_snapshot()::text !~ '^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$' then
    raise exception '0057 S0.9: pg_snapshot text (%) does not match the books_watermark CHECK -- a mint would fail at the constraint',
      pg_current_snapshot()::text using errcode = 'CLR10';
  end if;
end $s0$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.reporting_periods: the period registry (skeleton SS2.12; the E-b build
-- dependency; matrix E1/E1b).
--
-- WHY A REGISTRY AT ALL. fiscal_years is an FY and period_snapshots is an artifact;
-- neither is a month/quarter period WITH AN ID that a metric cell can bind to. delta
-- build-depends on this table through a JUNCTION (metric_cell_periods, delta's), not an
-- array -- a uuid[] column cannot carry a foreign key, so nothing would stop a cell citing
-- a period that does not exist.
-- =====================================================================================
create table clara.reporting_periods (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null,
  grain          text        not null check (grain in ('month','fiscal_year')),
  -- BOTH ENDS INCLUSIVE. Stated in the DDL because days_in_period and $P-1 are both wrong
  -- by one for the whole estate if a later reader assumes a half-open range.
  period_start   date        not null,
  period_end     date        not null,
  fiscal_year_id uuid,
  minted_by      uuid        not null references clara.users(id),
  minted_at      timestamptz not null default now(),
  -- Tenant congruence is STRUCTURAL, the 0007:59 composite-FK idiom, not a verb-only check.
  constraint fk_rp_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  -- An fy-grain row must BE a fiscal year OF THIS FIRM, by composite FK to 0056's
  -- uq_fy_id_firm. The remaining half -- that its RANGE equals the FY's -- is a trigger
  -- below, because a CHECK cannot read another table.
  constraint fk_rp_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years (id, firm_id),
  constraint ck_rp_fy_present check ((grain = 'fiscal_year') = (fiscal_year_id is not null)),
  constraint ck_rp_range check (period_end >= period_start),
  -- GRAIN CONGRUENCE: a 'month' row IS a calendar month, not an arbitrary range wearing the
  -- label. Without this a registry with loose bounds makes $P-1 and days_in_period
  -- semantically wrong while every row still looks valid (the round-2 finding).
  constraint ck_rp_month_bounds check (grain <> 'month' or (
       period_start = date_trunc('month', period_start)::date
   and period_end   = (date_trunc('month', period_start) + interval '1 month - 1 day')::date)),
  constraint uq_rp_client_grain_range unique (client_id, grain, period_start, period_end),
  -- THE SECOND UNIQUE IS NOT REDUNDANT. The range-unique alone permits two month rows with
  -- the same start and different ends, which makes $P-1 ambiguous a second way. This one
  -- plus ck_rp_month_bounds makes a client's month rows a PARTITION of the calendar by
  -- construction, with no btree_gist dependency (SS2.1's reasoning for avoiding the
  -- extension holds here too).
  constraint uq_rp_client_grain_start unique (client_id, grain, period_start),
  -- The five-column identity a period_snapshots row binds to (S2). Making range congruence
  -- a composite FK rather than a trigger is what stops a snapshot labelled July from ever
  -- citing June's period row -- structurally, with no judgement logic to review.
  constraint uq_rp_identity unique (id, firm_id, client_id, period_start, period_end)
);

create index ix_rp_client_grain_start on clara.reporting_periods (client_id, grain, period_start);

-- THE FISCAL-YEAR CONGRUENCE A CHECK CANNOT EXPRESS (SS2.12; judgement logic, so it carries
-- its own cell). An fy-grain row's (period_start, period_end) must EQUAL the referenced FY's
-- (starts_on, ends_on), and the row must name the FY's own client -- fk_rp_fy pins the firm
-- but a firm has many clients, so client congruence is this trigger's job too.
-- Fail-closed: a missing FY row raises here rather than deferring to the FK, because the FK
-- fires at statement end and this predicate wants to be the thing that speaks.
create function clara._tf_reporting_periods_fy_congruence() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  fy record;
begin
  if new.grain <> 'fiscal_year' then
    return new;
  end if;
  select f.starts_on, f.ends_on, f.client_id, f.firm_id into fy
    from clara.fiscal_years f where f.id = new.fiscal_year_id;
  if not found then
    raise exception 'the fiscal year this period names does not exist'
      using errcode = 'CLR10', detail = '{"reason":"fy_period_fy_missing"}';
  end if;
  if fy.client_id <> new.client_id or fy.firm_id <> new.firm_id then
    raise exception 'a fiscal-year period must belong to the same client as its fiscal year'
      using errcode = 'CLR10', detail = '{"reason":"fy_period_tenant_incongruent"}';
  end if;
  if fy.starts_on <> new.period_start or fy.ends_on <> new.period_end then
    raise exception 'a fiscal-year period must span exactly its fiscal year (% .. %), not % .. %',
      fy.starts_on, fy.ends_on, new.period_start, new.period_end
      using errcode = 'CLR10', detail = '{"reason":"fy_period_range_incongruent"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_reporting_periods_fy_congruence() from public;

create trigger t_rp_fy_congruence before insert on clara.reporting_periods
  for each row execute function clara._tf_reporting_periods_fy_congruence();

-- IMMUTABLE AFTER MINT, NO DELETE (SS2.12). A period is an identity other rows bind to; a
-- period whose bounds could move would silently re-date every metric cell and every
-- snapshot that ever cited it.
create trigger t_rp_append_only before update or delete on clara.reporting_periods
  for each row execute function clara._tf_append_only();
create trigger t_rp_no_truncate before truncate on clara.reporting_periods
  for each statement execute function clara._tf_no_truncate();

-- RLS: forced, with the OWNER policy pair -- not just the human half. clara_fn_owner is NOT
-- BYPASSRLS (0002:10-12), so a definer evaluator reading this table without p_rp_owner sees
-- ZERO periods and every metric resolves 'absent' (SS2.12, verbatim).
alter table clara.reporting_periods enable row level security;
alter table clara.reporting_periods force row level security;
create policy p_rp_owner on clara.reporting_periods
  for all to clara_fn_owner using (true) with check (true);
create policy p_rp_human on clara.reporting_periods
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.reporting_periods to clara_authenticated;

-- =====================================================================================
-- S2 -- clara.period_snapshots: the artifact (skeleton SS2.11; matrix E1/E3/E6).
-- =====================================================================================
create table clara.period_snapshots (
  id                  uuid        primary key default gen_random_uuid(),
  firm_id             uuid        not null references clara.firms(id),
  client_id           uuid        not null,
  reporting_period_id uuid        not null,
  period_start        date        not null,
  period_end          date        not null,
  kind                text        not null check (kind in ('management_accounts')),
  minted_by           uuid        not null references clara.users(id),
  minted_at           timestamptz not null default now(),
  -- THE WATERMARK. A pg_snapshot in text form, taken in the SAME STATEMENT that computed
  -- the payload, so it bounds exactly what the payload saw. The staleness predicate asks
  -- pg_visible_in_snapshot(<the mutation's xid>, this) -- "did the mint already see you?".
  -- A timestamp could not answer that question: two transactions with the same clock
  -- reading can be on either side of a snapshot.
  books_watermark     text        not null
                        check (books_watermark ~ '^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$'),
  -- A REAL sha256 over the payload's canonical text (clara._hash, proven by value in S0.6).
  -- Never an md5 alias: a 32-hex digest in a column named sha256 is a lie that survives
  -- every test that only checks the column is populated.
  dataset_sha256      text        not null check (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  payload             jsonb       not null check (jsonb_typeof(payload) = 'object'),
  constraint fk_ps_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  -- RANGE + TENANT CONGRUENCE, STRUCTURAL. The five-column composite FK makes "this
  -- snapshot's dates are its period's dates" true by construction. There is no trigger to
  -- review and no drift path.
  constraint fk_ps_period foreign key (reporting_period_id, firm_id, client_id,
                                       period_start, period_end)
    references clara.reporting_periods (id, firm_id, client_id, period_start, period_end),
  constraint uq_ps_id_firm unique (id, firm_id)
);

-- The staleness trigger's hot lookup: "every snapshot of this client whose period_end is at
-- or after the mutation's effect date". This index is what keeps an AFTER trigger on the
-- hottest table in the estate cheap.
create index ix_ps_client_period_end on clara.period_snapshots (client_id, period_end);
create index ix_ps_period on clara.period_snapshots (reporting_period_id);

-- BYTES IMMUTABLE (SS2.11; matrix E3 -- "change is free, silent change is impossible").
-- Staleness lives ONLY in a separate append-only assessment row; expressing it by mutating
-- the artifact is exactly the failure this trigger exists to make impossible.
-- The blocked set is wider than the design's three named columns and deliberately so: the
-- WATERMARK is what makes the digest meaningful, so a movable watermark would let a verify
-- comparison lie while every byte of the payload stayed put.
create function clara._tf_period_snapshots_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  -- id LEADS THE COMPARE SET. Without it this belt let an `update ... set id = <other>`
  -- through, and the only thing that would have refused is the neighbouring FK from
  -- snapshot_assessments -- i.e. a snapshot with no assessments yet, or one whose ledger
  -- moved with it, could be re-identified silently. Leaning on a neighbour's constraint to
  -- enforce THIS table's immutability is exactly the derived-state reasoning the standing
  -- law rejects: the belt must refuse on its own evidence, with its own CLR08.
  if new.id            is distinct from old.id
     or new.payload            is distinct from old.payload
     or new.dataset_sha256     is distinct from old.dataset_sha256
     or new.books_watermark     is distinct from old.books_watermark
     or new.period_start        is distinct from old.period_start
     or new.period_end          is distinct from old.period_end
     or new.reporting_period_id is distinct from old.reporting_period_id
     or new.client_id           is distinct from old.client_id
     or new.firm_id             is distinct from old.firm_id
     or new.kind                is distinct from old.kind
     or new.minted_by           is distinct from old.minted_by
     or new.minted_at           is distinct from old.minted_at then
    raise exception 'a period snapshot is immutable -- mint a new one; staleness is an assessment row, never an edit'
      using errcode = 'CLR08', detail = '{"reason":"snapshot_bytes_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_period_snapshots_immutable() from public;

create trigger t_ps_immutable before update on clara.period_snapshots
  for each row execute function clara._tf_period_snapshots_immutable();
create trigger t_ps_no_delete before delete on clara.period_snapshots
  for each row execute function clara._tf_append_only();
create trigger t_ps_no_truncate before truncate on clara.period_snapshots
  for each statement execute function clara._tf_no_truncate();

alter table clara.period_snapshots enable row level security;
alter table clara.period_snapshots force row level security;
create policy p_ps_owner on clara.period_snapshots
  for all to clara_fn_owner using (true) with check (true);
create policy p_ps_human on clara.period_snapshots
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.period_snapshots to clara_authenticated;

-- =====================================================================================
-- S3 -- clara.snapshot_assessments: the append-only assessment ledger (skeleton SS2.11).
-- =====================================================================================
create table clara.snapshot_assessments (
  id                    uuid        primary key default gen_random_uuid(),
  -- THE ORDERING COLUMN. Identity, not a timestamp: "latest is a SEQUENCE, never a
  -- timestamp" is a standing law here because now() is TRANSACTION START time, so two
  -- assessment rows can carry clock readings in the opposite order to their causality --
  -- and because two rows CAN share a timestamp, which leaves a latest-row read with a tie
  -- and therefore an arbitrary answer.
  seq                   bigint      generated always as identity,
  snapshot_id           uuid        not null,
  firm_id               uuid        not null references clara.firms(id),
  assessment            text        not null check (assessment in ('current','stale')),
  reason                text        not null check (btrim(reason) <> ''),
  -- Provenance, not a referential claim. caused_by_entry_id holds a JOURNAL ENTRY id and
  -- nothing else -- a column named entry_id that sometimes holds a bank statement id is the
  -- "spelling is not identity" defect written into a schema. The polymorphic pointer is
  -- caused_by_row_id, which names a row on caused_by_table and therefore carries no FK.
  caused_by_entry_id    uuid,
  caused_by_row_id      uuid,
  caused_by_table       text,
  caused_by_effect_date date,
  assessed_at           timestamptz not null default now(),
  assessed_by           uuid        references clara.users(id),
  constraint fk_sa_snapshot foreign key (snapshot_id, firm_id)
    references clara.period_snapshots (id, firm_id),
  constraint ck_sa_entry_is_entry check (
    caused_by_entry_id is null or caused_by_table = 'journal_entries')
);

-- The design's index (SS2.11) and the READER's index. snapshot_state orders by seq, so the
-- second one is the load-bearing one; the first is kept because a human scanning the ledger
-- reads it by time.
create index ix_sa_snapshot_assessed on clara.snapshot_assessments (snapshot_id, assessed_at desc);
create index ix_sa_snapshot_seq on clara.snapshot_assessments (snapshot_id, seq desc);

-- DUPLICATE 'stale' ROWS ARE EXPECTED, NOT A DEFECT, AND THERE IS DELIBERATELY NO UNIQUE
-- INDEX HERE (SS2.11, verbatim). Two concurrent mutations can each read "not yet stale" and
-- both insert. On an append-only table whose reader takes the LATEST row that is harmless.
-- A unique index added later to "fix" it would make those two writers contend on the same
-- key and deadlock -- turning a harmless duplicate into a refused posting. Matrix cell E7
-- goes further and grades a run that reports a duplicate as a FAILURE as itself a FAIL.
create trigger t_sa_append_only before update or delete on clara.snapshot_assessments
  for each row execute function clara._tf_append_only();
create trigger t_sa_no_truncate before truncate on clara.snapshot_assessments
  for each statement execute function clara._tf_no_truncate();

alter table clara.snapshot_assessments enable row level security;
alter table clara.snapshot_assessments force row level security;
create policy p_sa_owner on clara.snapshot_assessments
  for all to clara_fn_owner using (true) with check (true);
create policy p_sa_human on clara.snapshot_assessments
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.snapshot_assessments to clara_authenticated;

-- =====================================================================================
-- S4 -- THE READS. Each is a core/door pair: the CORE is the one definition and is
-- ungranted (so a definer evaluator on any lane may call it), the DOOR adds the human
-- context and the firm predicate. Building the pair now is what lets delta reach these
-- semantics without a second implementation of the same arithmetic.
-- =====================================================================================

-- days_in_period = period_end - period_start + 1, BOTH ENDS INCLUSIVE. THE ONE DEFINITION,
-- read from the period row -- no evaluator-local arithmetic anywhere (SS2.12).
create function clara._days_in_period_core(p_period uuid) returns int
  language sql stable security definer set search_path = clara, pg_temp as $$
  select (rp.period_end - rp.period_start + 1)::int
    from clara.reporting_periods rp where rp.id = p_period;
$$;
revoke all on function clara._days_in_period_core(uuid) from public;

create function clara.days_in_period(p_period uuid) returns int
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select rp.firm_id into v_firm from clara.reporting_periods rp where rp.id = p_period;
  -- NO EXISTENCE ORACLE: unknown and other-firm are the same refusal (CLR11's standing rule).
  if v_firm is null or v_firm <> c.firm then
    raise exception 'reporting period is not in your firm' using errcode = 'CLR11';
  end if;
  return clara._days_in_period_core(p_period);
end $$;
alter function clara.days_in_period(uuid) owner to clara_fn_owner;
revoke all on function clara.days_in_period(uuid) from public;

-- THE LATEST ASSESSMENT. Ordered by the identity SEQUENCE, which is a strict total order
-- with no ties -- assessed_at is display, not ordering. The two rows that could in principle
-- race ('current' from a mint, 'stale' from a mover) cannot: mint_month_snapshot holds
-- 203005007-EXCLUSIVE for the client and every covered writer's trigger takes 007-SHARED
-- first (0056 S4), so within one client the sequence order IS the causal order.
-- FAIL-SAFE ON ABSENCE: a snapshot with no assessment row at all reads 'unknown', never
-- 'current'. A snapshot is only 'current' because a read SAW a row saying so -- absence is
-- not evidence, and a derived "well, nothing marked it stale" is exactly the derivation the
-- standing law forbids.
create function clara._snapshot_state_core(p_snapshot uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce((
    select sa.assessment from clara.snapshot_assessments sa
      where sa.snapshot_id = p_snapshot
      order by sa.seq desc
      limit 1), 'unknown');
$$;
revoke all on function clara._snapshot_state_core(uuid) from public;

create function clara.snapshot_state(p_snapshot uuid) returns text
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select ps.firm_id into v_firm from clara.period_snapshots ps where ps.id = p_snapshot;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'snapshot is not in your firm' using errcode = 'CLR11';
  end if;
  return clara._snapshot_state_core(p_snapshot);
end $$;
alter function clara.snapshot_state(uuid) owner to clara_fn_owner;
revoke all on function clara.snapshot_state(uuid) from public;

-- =====================================================================================
-- S5 -- THE PERIOD PRODUCERS: the internal month primitive, and the fiscal_year-grain
-- mint as a TRIGGER (skeleton SS2.12: "rows are minted by the same audited door that mints
-- a snapshot, and by open_fiscal_year for the fiscal_year grain").
-- =====================================================================================

-- clara._ensure_month_period -- idempotently mint the CALENDAR MONTH row containing
-- p_month_start. Never partial, never straddling: the month is derived from the date by
-- date_trunc, so a caller cannot ask for "2026-07-05 .. 2026-08-04" and get a row that
-- looks like July. This is delta's future route (the evaluator "may mint a missing month
-- row on demand where the period is derivable and complete, recording itself as minted_by")
-- AND mint_month_snapshot's own -- one producer, so the two cannot disagree.
-- INTERNAL: revoked from public, granted to no role. It is reachable only from a definer
-- body, which is what keeps "a period id always has an author" true.
create function clara._ensure_month_period(p_client uuid, p_month_start date, p_minted_by uuid)
  returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_start date; v_end date; v_id uuid;
begin
  if p_client is null or p_month_start is null or p_minted_by is null then
    raise exception 'a client, a month and an author are required'
      using errcode = 'CLR10', detail = '{"reason":"month_period_args_missing"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  v_start := date_trunc('month', p_month_start)::date;
  v_end   := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  -- COMPLETENESS, ENFORCED BY THE PRODUCER ITSELF. SS2.12 permits an on-demand mint only
  -- where the period is "derivable and COMPLETE"; date_trunc already makes it whole rather
  -- than straddling, and this makes it PAST. Without it the header's claim -- one producer,
  -- so the two cannot disagree -- was false: the door refused an unfinished month while the
  -- primitive behind it would happily mint one, so delta's evaluator route could create a
  -- period the human door would never have created, and a $P-1 comparative could then bind
  -- a month that has not happened. The guard belongs HERE, on the shared producer; the
  -- door keeps its own (it refuses before reserving an op, which is the better error).
  if v_end > clara._book_today() then
    raise exception 'the month % .. % has not finished (books today is %) -- a period row is minted only once its month is complete',
      v_start, v_end, clara._book_today()
      using errcode = 'CLR10', detail = '{"reason":"period_not_complete"}';
  end if;
  -- Idempotent under concurrency: the arbiter is uq_rp_client_grain_start, the same
  -- constraint that makes a client's month rows a partition of the calendar.
  insert into clara.reporting_periods (firm_id, client_id, grain, period_start, period_end,
      fiscal_year_id, minted_by)
    values (v_firm, p_client, 'month', v_start, v_end, null, p_minted_by)
    on conflict (client_id, grain, period_start) do nothing
    returning id into v_id;
  if v_id is null then
    select rp.id into v_id from clara.reporting_periods rp
      where rp.client_id = p_client and rp.grain = 'month' and rp.period_start = v_start;
  end if;
  if v_id is null then
    raise exception 'could not resolve the month period for % .. %', v_start, v_end
      using errcode = 'CLR10', detail = '{"reason":"month_period_unresolved"}';
  end if;
  return v_id;
end $$;
revoke all on function clara._ensure_month_period(uuid, date, uuid) from public;

-- THE FISCAL_YEAR-GRAIN MINT, AS A TRIGGER -- and the reason it is a trigger rather than a
-- patch to open_fiscal_year's body: patching an audited writer's body is a D1
-- write-quiesce obligation on every live deploy (packages/db/README.md rule D1), and this
-- file has no other reason to take one. The trigger route buys the same guarantee -- every
-- FY gets its period row in the SAME transaction that opened the FY -- at zero D1 exposure.
-- minted_by is the FY's own opener column (clara.fiscal_years.opened_by), so the period's
-- author is the human who opened the year, not a synthetic actor.
create function clara._tf_fiscal_years_mint_period() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  insert into clara.reporting_periods (firm_id, client_id, grain, period_start, period_end,
      fiscal_year_id, minted_by)
    values (new.firm_id, new.client_id, 'fiscal_year', new.starts_on, new.ends_on,
      new.id, new.opened_by)
    on conflict do nothing;
  return new;
end $$;
revoke all on function clara._tf_fiscal_years_mint_period() from public;

create trigger t_fy_mint_reporting_period after insert on clara.fiscal_years
  for each row execute function clara._tf_fiscal_years_mint_period();

-- THE PRE-0057 FY BACKFILL. The trigger above fires on INSERT, so it is retroactive to
-- NOTHING: any fiscal year opened BEFORE this migration would carry no fy-grain period row,
-- forever, and there is no audited door that mints one (the door mints MONTHS). Such an FY
-- would silently resolve `absent` for every fy-grain metric bound to it -- the wrong-looking
-- answer arriving quietly, which is the class E-R4 exists to contain.
--
-- On the live estate this backfills ZERO rows today, because clara.fiscal_years is empty at
-- deploy (0056 shipped INERT ON ARRIVAL and no human has opened a year yet). It is written
-- anyway, because "zero rows today" is a property of this week, not of the migration: the
-- deploy-onto-existing class is real for every rig, every restored DR target, every scratch
-- database that opened a year against 0056 before 0057 landed. A backfill that costs nothing
-- when there is nothing to fix is the cheapest way to close a class permanently.
--
-- minted_by is the FY's own opener, exactly as the trigger does -- the period's author is
-- the human who opened the year, never a synthetic actor. Idempotent by the same conflict
-- arbiter, so a re-run (or a row the trigger already made in this same transaction) is a
-- no-op rather than a duplicate.
do $backfill$
declare v_n int;
begin
  with minted as (
    insert into clara.reporting_periods (firm_id, client_id, grain, period_start, period_end,
        fiscal_year_id, minted_by)
    select fy.firm_id, fy.client_id, 'fiscal_year', fy.starts_on, fy.ends_on, fy.id, fy.opened_by
      from clara.fiscal_years fy
     where not exists (select 1 from clara.reporting_periods rp
                        where rp.fiscal_year_id = fy.id)
    -- The arbiter is NAMED, not left to "any unique constraint": (client_id, grain,
    -- period_start) is the one that makes a client's periods of a grain unique by start,
    -- and naming it means a future constraint cannot silently become the thing that
    -- swallows a conflict this backfill should have raised on.
    on conflict (client_id, grain, period_start) do nothing
    returning 1)
  select count(*)::int into v_n from minted;
  raise notice '0057 S5 backfill: % pre-existing fiscal year(s) received their fy-grain reporting_periods row. (0 on a database whose fiscal_years is still empty -- the live estate today; non-zero on any database that opened a year against 0056 before 0057 landed. S11.9 asserts zero orphans remain either way.)', v_n;
end $backfill$;

-- =====================================================================================
-- S6 -- THE DATASET RECIPE + THE HUMAN DOOR (skeleton SS2.11; matrix E1/E4/E6).
-- =====================================================================================

-- clara._snapshot_dataset -- THE ONE RECIPE. mint_month_snapshot hashes it and
-- verify_snapshot recomputes it; they share this body, so the "recompute" a verify performs
-- is definitionally the same computation the mint performed and the two cannot drift apart
-- into two plausible numbers.
--
-- Every figure is DB-OWNED and read through the instrument PRODUCTION uses: the trial
-- balance through clara.trial_balance_as_of (which is approved-entries-only and
-- posting_date <= as_of, by its own body), the AR/AP positions through clara._aging_core --
-- the same function the aging surface reads. Re-summing open_items by hand here is how two
-- "correct" numbers disagree (0056 S5's stated rule, applied).
--
-- DETERMINISM is a requirement, not a nicety: dataset_sha256 is the identity of these bytes.
-- jsonb key order is canonical in Postgres and jsonb_agg carries an explicit ORDER BY, so
-- the same books produce the same text and therefore the same digest. Nothing volatile
-- (now(), an id, an actor) is inside the hashed object.
create function clara._snapshot_dataset(p_client uuid, p_period_start date, p_period_end date)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  return jsonb_build_object(
    'schema', 'management_accounts.v1',
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'trial_balance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code',  t.account_code,
               'name',          t.name,
               'debit_cents',   t.debit_cents,
               'credit_cents',  t.credit_cents)
             order by t.account_code)
        from clara.trial_balance_as_of(p_client, p_period_end) t), '[]'::jsonb),
    'ar_aging', clara._aging_core(v_firm, p_client, 'ar', p_period_end) -> 'totals',
    'ap_aging', clara._aging_core(v_firm, p_client, 'ap', p_period_end) -> 'totals');
end $$;
revoke all on function clara._snapshot_dataset(uuid, date, date) from public;

-- clara.mint_month_snapshot -- THE HUMAN DOOR. Reserve -> validate -> ensure the period row
-- -> take payload AND watermark IN ONE STATEMENT -> insert the artifact -> the opening
-- 'current' assessment -> audit + event -> finish.
--
-- THE BOOKS STAY OPEN (E-R3; matrix E1's negative case). This verb refuses no write, holds
-- no durable lock and writes nothing to any books table. Its one advisory lock is released
-- at commit; a post into the snapshotted month immediately afterwards must SUCCEED, and
-- merely marks the artifact stale.
--
-- ROLE FLOOR (builder choice): bookkeeper. Minting a management pack is ordinary close-prep
-- work of exactly the kind begin_close and propose_fiscal_year sit at, and the artifact is
-- an OBSERVATION -- it authorizes nothing, moves no money and cannot be un-minted, so an
-- admin floor would buy no safety and would put a routine monthly act behind a key.
create function clara.mint_month_snapshot(p_client uuid, p_month_start date, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_firm uuid; v_dedupe jsonb;
  v_start date; v_end date; v_period uuid; v_id uuid;
  v_dataset jsonb; v_sha text; v_watermark text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_month_start is null then
    raise exception 'a month is required'
      using errcode = 'CLR10', detail = '{"reason":"month_required"}';
  end if;
  -- The month is named by its FIRST DAY and nothing else. Accepting any date inside the
  -- month and silently truncating would let two callers "mint July" with two different
  -- op_key request hashes for the same act.
  if p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'a month is named by its first day (% is not one)', p_month_start
      using errcode = 'CLR10', detail = '{"reason":"month_start_not_first_of_month"}';
  end if;
  v_start := p_month_start;
  v_end   := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  -- A PERIOD THAT HAS NOT HAPPENED CANNOT BE SNAPSHOTTED. A pack labelled "July" minted
  -- mid-July presents a partial month under a whole month's name, and no staleness trigger
  -- can ever correct it, because the thing that makes it wrong is the passage of time
  -- rather than a mutation. That is the wrong-but-plausible-number class the E-R4 amendment
  -- was ratified to contain, so it is refused, and the refusal names the fix.
  if v_end > clara._book_today() then
    raise exception 'the month % .. % has not finished (books today is %) -- snapshot it once the period is complete',
      v_start, v_end, clara._book_today()
      using errcode = 'CLR10', detail = '{"reason":"period_not_complete"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'mint_month_snapshot', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'month_start', v_start)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THE LOCK-UPGRADE DEADLOCK, REFUSED BEFORE IT CAN FORM. Every covered writer's trigger
  -- takes 203005007 SHARED for its client and holds it to commit (0056 S4). If this
  -- transaction has ALREADY written that client's books, it is holding that shared lock --
  -- and the EXCLUSIVE request below is a LOCK UPGRADE. Two such transactions upgrading the
  -- same key deadlock each other: each waits for the other's share to drop, and neither can
  -- drop it before commit. Postgres would break the tie by killing one at random with a
  -- deadlock error, mid-ceremony, with no explanation a human could act on.
  --
  -- So the composition is refused here, positively and by reading THIS BACKEND'S OWN held
  -- locks -- not by hoping callers behave. The probe is the pg_locks row the lock actually
  -- produces (measured: locktype='advisory', classid=the namespace, objid=the hashed client
  -- as oid, objsubid=2 for a two-key lock, mode='ShareLock'), scoped to pg_backend_pid() so
  -- another session's legitimate concurrent write is never mistaken for our own.
  --
  -- UNREACHABLE TODAY, AND KEPT ANYWAY. PostgREST gives each RPC its own transaction, so no
  -- live caller can currently write books and mint in one transaction. This guard exists for
  -- the future in-DB caller -- a composite verb, a delta evaluator, a backfill script -- that
  -- would otherwise discover the class as an intermittent production deadlock rather than as
  -- a clear refusal naming the fix.
  if exists (
    select 1 from pg_locks l
     where l.locktype = 'advisory'
       and l.pid      = pg_backend_pid()
       and l.classid  = 203005007
       and l.objid    = hashtext(p_client::text)::oid
       and l.objsubid = 2
       and l.mode     = 'ShareLock'
       and l.granted) then
    raise exception 'mint must run in its own transaction -- a books write in this transaction already holds the client wall (203005007 shared), and minting would upgrade that lock'
      using errcode = 'CLR10', detail = '{"reason":"mint_lock_upgrade_refused"}';
  end if;

  -- THE ONLY LOCK, AND WHY. 203005007 is 0056's close-serialize namespace and the BOTTOM
  -- rung on every path; this verb takes it and nothing else, so it cannot form a cycle.
  -- EXCLUSIVE, because every covered writer's trigger takes it SHARED as its first act:
  -- that is what closes the window in which a mutation commits after the mint's read but
  -- before the mint's watermark, leaving an artifact that is wrong AND reads as current.
  -- Held for this transaction only -- it locks no month.
  perform pg_advisory_xact_lock(203005007, hashtext(p_client::text));

  v_period := clara._ensure_month_period(p_client, v_start, c.actor);

  -- ONE STATEMENT, therefore ONE SNAPSHOT (READ COMMITTED gives each statement its own).
  -- Taking the payload and the watermark together is what makes the watermark bound
  -- EXACTLY what the payload saw -- computed in two statements, a transaction committing
  -- between them would be inside one and outside the other, and the staleness predicate
  -- would then under-mark.
  select d, w into v_dataset, v_watermark
    from (select clara._snapshot_dataset(p_client, v_start, v_end) as d,
                 pg_current_snapshot()::text as w) s;
  v_sha := encode(clara._hash(v_dataset), 'hex');

  insert into clara.period_snapshots (firm_id, client_id, reporting_period_id, period_start,
      period_end, kind, minted_by, books_watermark, dataset_sha256, payload)
    values (c.firm, p_client, v_period, v_start, v_end, 'management_accounts', c.actor,
      v_watermark, v_sha, v_dataset)
    returning id into v_id;

  -- The opening assessment. A snapshot is 'current' because a read SAW this row -- never
  -- because nothing said otherwise (the standing absence-is-not-evidence law, which is why
  -- _snapshot_state_core answers 'unknown' rather than 'current' when the ledger is empty).
  insert into clara.snapshot_assessments (snapshot_id, firm_id, assessment, reason,
      caused_by_table, caused_by_effect_date, assessed_by)
    values (v_id, c.firm, 'current', 'minted', null, null, c.actor);

  perform clara._audit(c.firm, c.actor, null, null, 'mint_month_snapshot', null,
    jsonb_build_object('client', p_client, 'snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'dataset_sha256', v_sha,
      'books_watermark', v_watermark, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'snapshot.minted', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'kind', 'management_accounts'));

  return clara._finish_op(c.firm, 'mint_month_snapshot', p_op_key,
    jsonb_build_object('snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'kind', 'management_accounts',
      'dataset_sha256', v_sha, 'books_watermark', v_watermark, 'state', 'current'));
end $$;
alter function clara.mint_month_snapshot(uuid, date, text) owner to clara_fn_owner;
revoke all on function clara.mint_month_snapshot(uuid, date, text) from public;

-- =====================================================================================
-- S7 -- clara.verify_snapshot: THE HONEST-BOUNDARY BACKSTOP (skeleton SS2.11; matrix E10).
-- =====================================================================================

-- A POSITIVE READ THAT REPORTS DRIFT. It recomputes the dataset through the SAME recipe the
-- mint used and diffs the digest, naming which parts moved. It refuses nothing and changes
-- nothing.
--
-- THE HONEST BOUNDARY RUNS IN BOTH DIRECTIONS, AND BOTH ARE STATED. The first direction is
-- UNDER-coverage (below): changes that mint no assessment at all. The second is
-- OVER-coverage, and it is just as much a reader's trap: FOUR of the six covered tables --
-- fixed_assets, bank_statements, bank_reconciliations, bank_line_exceptions -- own nothing
-- that appears in a `management_accounts` dataset (which is a trial balance plus AR/AP aging
-- totals). A mutation there marks the artifact stale honestly, and a recompute then reports
-- drift=FALSE, every time. That pairing is not a defect and not a contradiction: the
-- staleness set is deliberately held EQUAL to the close wall's set (skeleton SS2.11 -- "a
-- table on one list but not the other is the shape of both defects"), which prices in the
-- snapshot kinds that will read those four -- an FA register pack, a bank-position pack --
-- rather than re-opening the trigger family when they arrive. Only journal_entries and
-- open_item_allocations can move THIS payload kind's dataset_sha256. verify_snapshot
-- returns the same split in its covered_tables field so a caller need not know this comment
-- exists.
--
-- THE UNDER-COVERAGE DIRECTION (matrix E10 requires this list to live in the function's OWN
-- comment). Two classes of change mint NO staleness assessment, because no trigger on the
-- six covered tables can see them:
--   (a) a fact none of those tables owns -- a counterparty rename, a chart-of-accounts
--       relabel, a client fact edited through 0055's door. The FIGURES may be unmoved and
--       the LABELS moved, or a reclassification may move both.
--   (b) anything a FUTURE writer adds. A table born after this migration carries no
--       trigger, and nothing in this file can know about it.
-- Both are caught only here, and only when someone RUNS it -- which is why it is a callable
-- function with its own acceptance cell rather than a paragraph. An unrun backstop is
-- indistinguishable from an absent one.
--
-- AND THE LIMIT OF THE BACKSTOP ITSELF, said plainly: Postgres cannot reconstruct the read
-- the mint performed, so this recomputes against the books AS THEY ARE NOW. The comparison
-- is live-now versus pinned-bytes -- reported as such in the payload's 'comparison' field --
-- and the pinned books_watermark is returned so a reader knows exactly which side is which.
-- 'drift' = true therefore means "the books no longer reproduce these bytes", not "the mint
-- was wrong".
create function clara.verify_snapshot(p_snapshot uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; ps record; v_now jsonb; v_sha text;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into ps from clara.period_snapshots s where s.id = p_snapshot;
  if not found or ps.firm_id <> c.firm then
    raise exception 'snapshot is not in your firm' using errcode = 'CLR11';
  end if;
  v_now := clara._snapshot_dataset(ps.client_id, ps.period_start, ps.period_end);
  v_sha := encode(clara._hash(v_now), 'hex');
  return jsonb_build_object(
    'snapshot_id',   p_snapshot,
    'client_id',     ps.client_id,
    'period_start',  ps.period_start,
    'period_end',    ps.period_end,
    'kind',          ps.kind,
    'state',         clara._snapshot_state_core(p_snapshot),
    'books_watermark', ps.books_watermark,
    'comparison',    'live_books_now_vs_pinned_bytes',
    'verified_at',   now(),
    'stored_dataset_sha256',     ps.dataset_sha256,
    'recomputed_dataset_sha256', v_sha,
    'drift',         (v_sha is distinct from ps.dataset_sha256),
    -- WHICH parts moved, not merely THAT something did.
    'drifted_keys',  coalesce((
      select jsonb_agg(k order by k) from (
        select jsonb_object_keys(ps.payload) as k
        union
        select jsonb_object_keys(v_now)) u
      where (ps.payload -> u.k) is distinct from (v_now -> u.k)), '[]'::jsonb),
    'cannot_detect_by_trigger', jsonb_build_array(
      'a fact none of the six covered tables owns (counterparty rename, chart relabel, client fact edit)',
      'any writer added after migration 0057, whose effect table carries no staleness trigger'),
    -- THE COVERED SET, LABELLED IN BOTH DIRECTIONS. Only two of the six can move THIS
    -- payload kind: journal_entries (the trial balance) and open_item_allocations (the AR/AP
    -- aging). A mark from the other four is real -- their table did move -- but for a
    -- management_accounts snapshot it will always come with drift=false on recompute,
    -- because nothing they own appears in this dataset. Saying so here stops a reader
    -- treating "stale but drift=false" as a contradiction or a bug; it is the designed
    -- outcome of holding the staleness set equal to the close wall's set ahead of the
    -- snapshot kinds (FA register, bank position) that WILL read those four.
    --
    -- THE SPLIT IS ADDITIVE, and covered_tables KEEPS ITS ARRAY SHAPE ON PURPOSE. Turning
    -- it into an object would have said the same thing while breaking every consumer that
    -- iterates it -- this function's return payload is a read surface, delta and zeta will
    -- consume it, and a field changing TYPE is the kind of break that is cheap to avoid and
    -- expensive to discover. The complete list stays where callers already look; the two
    -- explicitly-named siblings carry the direction.
    'covered_tables', jsonb_build_array('journal_entries', 'open_item_allocations',
      'fixed_assets', 'bank_statements', 'bank_reconciliations', 'bank_line_exceptions'),
    'covered_tables_moving_this_payload',
      jsonb_build_array('journal_entries', 'open_item_allocations'),
    'covered_tables_inert_for_this_payload',
      jsonb_build_array('fixed_assets', 'bank_statements', 'bank_reconciliations',
                        'bank_line_exceptions'));
end $$;
alter function clara.verify_snapshot(uuid) owner to clara_fn_owner;
revoke all on function clara.verify_snapshot(uuid) from public;

comment on function clara.verify_snapshot(uuid) is
  'Recomputes a period snapshot''s dataset through clara._snapshot_dataset (the same recipe '
  'the mint used) and reports drift against the pinned dataset_sha256. HONEST BOUNDARY -- the '
  'staleness triggers on the six covered tables cannot see: (a) a fact none of those tables '
  'owns (a counterparty rename, a chart-of-accounts relabel, a client fact edited through '
  '0055''s door); (b) anything a writer added after 0057 touches, since a table born later '
  'carries no trigger. Those classes are caught ONLY by running this function. Its own limit: '
  'Postgres cannot reconstruct the mint''s historical read, so this compares the books AS THEY '
  'ARE NOW against the pinned bytes -- drift=true means "the books no longer reproduce these '
  'bytes", not "the mint was wrong".';

-- =====================================================================================
-- S8 -- THE STALENESS MACHINERY (skeleton SS2.11; matrix E2, E2b, E7, E8, E9, E11).
--
-- IN THE SAME TRANSACTION, BY CONSTRUCTION. The mark is an AFTER ROW trigger inside the
-- mutating statement, so there is NO ASYNCHRONOUS WINDOW in which a stale artifact reads as
-- current -- Invariant-4 discipline satisfied structurally rather than by a sweep.
--
-- THE PREDICATE IS *INTERSECTS* + A WATERMARK, NOT DATE CONTAINMENT (E-R3, verbatim: "any
-- audited mutation whose effect intersects an already-snapshotted period"). A posting into
-- month M-1 moves month M's opening, YTD and comparative figures without its posting_date
-- ever falling inside M. So the test is: effect date <= period_end, AND the mutation is not
-- already inside the snapshot's books_watermark. A containment predicate would silently
-- narrow the ruled word (matrix E2b exists to catch exactly that).
-- =====================================================================================

-- The marking half, factored out so there is ONE definition of "which snapshots does this
-- mutation invalidate" for all six tables.
create function clara._mark_snapshots_stale(p_client uuid, p_effect date, p_table text,
    p_entry uuid, p_row uuid, p_actor uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if p_client is null then
    return;   -- nothing to attribute the mutation to; no snapshot can be resolved
  end if;
  insert into clara.snapshot_assessments (snapshot_id, firm_id, assessment, reason,
      caused_by_entry_id, caused_by_row_id, caused_by_table, caused_by_effect_date, assessed_by)
  select ps.id, ps.firm_id, 'stale', 'books_moved_after_mint',
         p_entry, p_row, p_table, p_effect, p_actor
    from clara.period_snapshots ps
   where ps.client_id = p_client
     -- INTERSECTS: the effect lands on or before the period's last day. A NULL effect date
     -- means "we could not date this mutation", which falls to '-infinity' and therefore
     -- marks EVERY snapshot -- an unknown effect is not an absent effect, and the fail-safe
     -- direction for staleness is to mark.
     and ps.period_end >= coalesce(p_effect, '-infinity'::date)
     -- ...AND THE MINT DID NOT ALREADY SEE IT. pg_visible_in_snapshot answers the only
     -- question that matters -- was this mutation's transaction already committed when the
     -- mint took its snapshot -- which no timestamp comparison can answer.
     and not pg_visible_in_snapshot(pg_current_xact_id(), ps.books_watermark::pg_snapshot)
     -- ...AND IT IS NOT ALREADY STALE. Read through the ONE latest-assessment definition,
     -- so this predicate and clara.snapshot_state can never disagree about what "stale"
     -- means. Two concurrent movers may both pass this test and both insert; that duplicate
     -- is EXPECTED (see the S3 comment) and is why no unique index guards it.
     and clara._snapshot_state_core(ps.id) is distinct from 'stale';
end $$;
revoke all on function clara._mark_snapshots_stale(uuid, date, text, uuid, uuid, uuid) from public;

-- ONE trigger function, six triggers. The only per-table difference is the EFFECT DATE, and
-- keeping the six resolutions side by side in one CASE is what lets a reviewer check them
-- against SS2.11's table in one read instead of six.
create function clara._tf_snapshot_staleness() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  -- OLD and NEW as jsonb, each assigned only where the trigger op actually provides it
  -- (referencing NEW in a DELETE, or OLD in an INSERT, is an error in plpgsql). Several
  -- arms below must compare the two images, not just read one of them.
  v_new    jsonb;
  v_old    jsonb;
  v_row    jsonb;
  v_client uuid;
  v_effect date;
  v_entry  uuid;
  v_actor  uuid;
  v_skip   boolean := false;   -- set by an arm that proves this mutation moves no read
  v_s_old  date;               -- FA: the OLD image's inclusion start
  v_s_new  date;               -- FA: the NEW image's inclusion start
  -- FA: the columns whose own boundaries are handled by their own candidates below, plus
  -- the pure bookkeeping stamp. Everything NOT listed here is a measurement or identity
  -- column whose change bites from the row's inclusion START.
  v_fa_bounds constant text[] :=
    array['effective_from','acquired_date','disposed_at','superseded_at','updated_at'];
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  v_row    := coalesce(v_new, v_old);
  v_client := nullif(v_row ->> 'client_id', '')::uuid;

  -- DISPATCH BY IDENTITY, NEVER BY SPELLING. Every arm below compares tg_relid -- the
  -- table's OID -- against a schema-qualified regclass literal. tg_table_name is only the
  -- UNQUALIFIED name, so a same-named table in another schema would dispatch down an arm
  -- authored for a different table and read an effect date out of a column that means
  -- something else entirely. The standing law is that a guard reading a NAME reads a
  -- projection of the thing; this reads the thing.
  --
  -- (And regclass::TEXT would not have fixed it either: this body pins search_path to
  -- clara, so 'clara.journal_entries'::regclass::text renders UNQUALIFIED as
  -- 'journal_entries' -- a text CASE would have been the same projection in a better
  -- disguise. Comparing OIDs has no rendering step to be fooled by.)
  --
  -- tg_table_name survives ONLY as the stored provenance LABEL below, where it is
  -- cosmetic: it names the row's table for a human reading the ledger and decides nothing.
  if tg_relid = 'clara.journal_entries'::regclass then
    -- Rows 1,2,3,4,5,6,7,8,9,10 of SS2.11's writer table all land here: every JE-bearing
    -- mover -- approve, reverse, the settlement composites, the composite bank paths,
    -- recurring adjustments and their auto-reversals, the depreciation belt, the closing
    -- stock adjustment, the wrong-client correction, the opening machinery, and
    -- finalize_close's closing entry. (The correction marks the FROM client only -- the
    -- adjudicated contract. An earlier draft of this comment claimed "both clients mark";
    -- that was ruled wrong and is corrected here rather than left to mislead the next
    -- reader into expecting a TO-client assessment that never arrives.)
    --
    -- MARK IFF THE MUTATION CAN CHANGE WHAT AN APPROVED-FILTERED AS-OF READ RETURNS.
    -- Without this predicate a DRAFT insert or a draft revision marked every covering
    -- artifact stale, which is a FALSE SIGNAL: clara.trial_balance_as_of sums lines
    -- `filter (where je.status='approved')`, so a draft is on no presented figure and its
    -- birth moves nothing. A staleness model that cries on drafts trains its reader to
    -- ignore it.
    --
    -- DERIVED FROM THE LIVE STATUS MACHINE, not assumed. The domain is
    -- {draft, approved, withdrawn} (the journal_entries status CHECK), and
    -- clara._tf_entry_immutable is the only gate on transitions. Read this pass, its
    -- allow-set is:
    --   * DELETE                -- refused outright ("reverse, not delete"), so the DELETE
    --                              arm below is UNREACHABLE for this table today; it is
    --                              written anyway, fail-safe, so that a future relaxation
    --                              of that belt cannot silently escape.
    --   * draft   -> draft      -- metadata only (revision_token, updated_at,
    --                              proposed_counterparty, match_fingerprint,
    --                              last_human_editor, flags, closing_transfer, coding_kind,
    --                              vendor_binding_id). posting_date is in NO allow-set, so
    --                              a date can never move under an existing entry.
    --   * draft   -> approved   -- THE FLIP. This is where an entry becomes presented, and
    --                              it is the arm finalize_close's born-draft closing entry
    --                              travels: it is inserted as a draft (no mark, correctly)
    --                              and marks here, at the census-visible flip.
    --   * draft   -> withdrawn  -- a draft leaves without ever having been presented.
    --   * approved-> approved   -- the reversal-linkage stamp ONLY (reversed_by,
    --                              reversal_reason, updated_at).
    --   * anything else         -- refused.
    -- So: INSERT marks iff it is born approved (several machine paths do insert approved
    -- directly); UPDATE marks iff EITHER image is approved; DELETE marks iff the old image
    -- was approved.
    --
    -- THE approved->approved ARM IS DELIBERATELY CONSERVATIVE. A reversal-linkage stamp
    -- provably moves no trial-balance figure today -- the mirror entry is a separate row
    -- that marks on its own approval. It is kept inside the mark set because the fail-safe
    -- direction for staleness is to mark, and because a later widening of that allow-set
    -- would otherwise escape unnoticed. Over-marking a reversed entry is cheap; missing one
    -- is a wrong pack.
    if tg_op = 'INSERT' then
      v_skip := coalesce(v_new ->> 'status', '') <> 'approved';
    elsif tg_op = 'UPDATE' then
      v_skip := coalesce(v_old ->> 'status', '') <> 'approved'
            and coalesce(v_new ->> 'status', '') <> 'approved';
    else
      v_skip := coalesce(v_old ->> 'status', '') <> 'approved';
    end if;
    v_effect := nullif(v_row ->> 'posting_date', '')::date;
    v_entry  := nullif(v_row ->> 'id', '')::uuid;

  elsif tg_relid = 'clara.open_item_allocations'::regclass then
    -- Row 11, THE v1 DEFECT. apply_open_items and unallocate_group insert ONLY here -- no
    -- journal entry and no open_items row at all -- and they move every AR/AP aging figure
    -- a management pack presents, because _subledger_outstanding_asof sums allocation rows
    -- with effective_date <= as_of. A trigger on open_items could never fire for them.
    --
    -- HONEST BOUNDARY, MEASURED THIS ROUND -- THIS ARM RARELY FIRES, AND THAT IS CORRECT.
    -- SS2.11 pins the allocation effect date to effective_date, and the producer law stamps
    -- it with the ACT date (clara._book_today(), 0040:864-877) -- never the date of the
    -- items being applied. So an allocation made today against a February invoice carries
    -- effective_date = today, and the INTERSECTS test (effect <= period_end) is FALSE for
    -- every already-closed month. Combined with the door's completeness guard, which
    -- refuses to snapshot a month that has not finished, the practical consequence is that
    -- an allocation marks a month snapshot only in the narrow case where the act date falls
    -- on or before a snapshotted period_end.
    --
    -- THAT IS THE ACCOUNTING-CORRECT OUTCOME, not a gap, and it was verified rather than
    -- argued: after applying a credit note to a February invoice, the February artifact
    -- reads `current` AND clara.verify_snapshot recomputes the SAME dataset_sha256
    -- (drift=false). The pack presents AR aging AS OF 28 Feb; _subledger_outstanding_asof
    -- excludes an allocation dated after that; so no figure the pack presented moved, and
    -- marking it stale would be a FALSE staleness signal about a still-correct artifact.
    -- Dating the effect from the ITEM instead would manufacture exactly that false signal
    -- and would contradict SS2.11's stated rule -- so the rule stands, and the limit is
    -- written down here instead of being rediscovered as a defect.
    v_effect := nullif(v_row ->> 'effective_date', '')::date;

  elsif tg_relid = 'clara.fixed_assets'::regclass then
    -- Row 12. THE EFFECT DATE IS THE EARLIEST AS-OF AT WHICH THIS MUTATION CHANGES AN FA
    -- READ -- derived from clara._fa_included_at, which IS the register's own inclusion
    -- predicate (read this pass):
    --     coalesce(effective_from, acquired_date) <= as_of
    --     and (disposed_at   is null or disposed_at   > as_of)
    --     and (superseded_at is null or superseded_at > as_of)
    --     and (status <> 'unwound' or <the unwind reversal's posting_date> > as_of)
    -- so a row is visible from its START = coalesce(effective_from, acquired_date) until
    -- whichever boundary stamp closes it.
    --
    -- THE DEFECT THIS REPLACES: dating from least(acquired_date, depreciation_start_date,
    -- baseline_as_of) ignored effective_from and the boundary stamps entirely, so
    -- revise_fixed_asset_particulars -- which mints a SUCCESSOR effective (say) 1 June and
    -- stamps superseded_at on its predecessor -- staled every artifact back to ACQUISITION,
    -- years of packs that the prospective revision does not touch. Retroactive over-marking
    -- is not a safe default; it is the same false signal as the draft one, wearing a
    -- fail-safe costume.
    --
    -- INSERT / DELETE: the row's own START. For a revision successor that IS its
    -- effective_from, which is exactly the "prospective" answer.
    -- UPDATE: the earliest of the candidates that actually MOVED --
    --   * a boundary stamp (disposed_at / superseded_at) taking least(old,new), because the
    --     change bites from the earlier of the two images;
    --   * the START itself, if it moved;
    --   * any OTHER read-relevant column (cost, life, rate, method, accounts, status, the
    --     lineage links, depreciation_start_date, baseline_as_of, ...), which changes the
    --     measured amount from the row's START forward. That set is computed as "everything
    --     except the boundary columns and updated_at" via a jsonb difference rather than a
    --     hand-listed column roster -- a hand-listed one rots the first time 0041's
    --     successor adds a column, and rots SILENTLY.
    -- An UPDATE that moved nothing read-relevant (an updated_at touch alone) marks nothing.
    v_s_old := coalesce(nullif(v_old ->> 'effective_from', '')::date,
                        nullif(v_old ->> 'acquired_date',  '')::date);
    v_s_new := coalesce(nullif(v_new ->> 'effective_from', '')::date,
                        nullif(v_new ->> 'acquired_date',  '')::date);
    if tg_op = 'INSERT' then
      v_effect := v_s_new;
    elsif tg_op = 'DELETE' then
      v_effect := v_s_old;
    else
      v_effect := least(
        case when (v_new - v_fa_bounds) is distinct from (v_old - v_fa_bounds)
             then least(v_s_old, v_s_new) end,
        case when v_s_old is distinct from v_s_new
             then least(v_s_old, v_s_new) end,
        case when (v_old ->> 'disposed_at') is distinct from (v_new ->> 'disposed_at')
             then least(nullif(v_old ->> 'disposed_at', '')::date,
                        nullif(v_new ->> 'disposed_at', '')::date) end,
        case when (v_old ->> 'superseded_at') is distinct from (v_new ->> 'superseded_at')
             then least(nullif(v_old ->> 'superseded_at', '')::date,
                        nullif(v_new ->> 'superseded_at', '')::date) end);
      -- Nothing read-relevant moved at all ⇒ nothing to mark. Note this is NOT the same as
      -- "v_effect is null": a boundary that moved to/from NULL is a real change whose
      -- candidate can still be NULL, and that case must fall through to the fail-safe
      -- mark-everything branch rather than be skipped.
      if (v_new - v_fa_bounds) is not distinct from (v_old - v_fa_bounds)
         and v_s_old is not distinct from v_s_new
         and (v_old ->> 'disposed_at')   is not distinct from (v_new ->> 'disposed_at')
         and (v_old ->> 'superseded_at') is not distinct from (v_new ->> 'superseded_at') then
        v_skip := true;
      end if;
    end if;

  elsif tg_relid = 'clara.bank_statements'::regclass then
    -- Row 13, THE v2 DEFECT. void_bank_statement's effect is `update clara.bank_statements
    -- set status='void'` -- it never touches bank_reconciliations, which the round-1 design
    -- credited. The effect date is the statement's OWN period_end: the period whose
    -- presented bank position the void moves.
    v_effect := nullif(v_row ->> 'period_end', '')::date;

  elsif tg_relid in ('clara.bank_reconciliations'::regclass,
                     'clara.bank_line_exceptions'::regclass) then
    -- Rows 14 and 15. Neither the reconciliation verbs nor the exception doors take a date
    -- argument; their act clocks are now(). The EFFECT date is the governing statement's
    -- period_end, reached through the row's statement_id. A statement that cannot be read
    -- leaves v_effect NULL, which marks everything -- the fail-safe direction.
    select bs.period_end into v_effect
      from clara.bank_statements bs
     where bs.id = nullif(v_row ->> 'statement_id', '')::uuid;

  else
    -- A seventh table would arrive here silently. Refusing is the fail-closed reading:
    -- an unrecognised table means the effect date is undefined, and an undefined effect
    -- date on a mover we did not design for is a finding, not a default. Reported by
    -- IDENTITY (the qualified regclass), so the message names which table actually fired.
    raise exception 'clara._tf_snapshot_staleness fired on an unregistered table (%)',
      tg_relid::regclass::text
      using errcode = 'CLR10', detail = '{"reason":"staleness_table_unregistered"}';
  end if;

  -- AN ARM PROVED THIS MUTATION MOVES NO READ. Marking anyway would be a false signal, and
  -- a staleness label nobody can trust is worth less than none. The skip is only ever set
  -- by an arm that DERIVED it from the reading function's own predicate -- never as a
  -- default, and never on an unrecognised shape (that path raises above).
  if v_skip then
    return coalesce(new, old);
  end if;

  -- The acting human, when there is one. Resolved THROUGH clara.users so a machine lane
  -- (no JWT) or a claim naming an unknown subject stores NULL rather than breaking the FK
  -- and, with it, the posting that fired this trigger.
  select u.id into v_actor from clara.users u where u.id = clara.jwt_sub();

  perform clara._mark_snapshots_stale(v_client, v_effect, tg_table_name, v_entry,
    nullif(v_row ->> 'id', '')::uuid, v_actor);
  return coalesce(new, old);
end $$;
revoke all on function clara._tf_snapshot_staleness() from public;

-- EXACTLY SIX TABLES. This list and 0056 S4's wall/serialize list are deliberately related
-- but NOT identical: the wall covers ten tables because it also serializes the CLOSE GATE
-- inputs (bank_accounts, client_facts, document_filings), which decide whether a close may
-- proceed but appear on no presented P&L or balance sheet figure. See the S11 tail for that
-- decision stated in full.
create trigger t_snapshot_staleness after insert or update or delete on clara.journal_entries
  for each row execute function clara._tf_snapshot_staleness();
create trigger t_snapshot_staleness after insert or update or delete on clara.open_item_allocations
  for each row execute function clara._tf_snapshot_staleness();
create trigger t_snapshot_staleness after insert or update or delete on clara.fixed_assets
  for each row execute function clara._tf_snapshot_staleness();
create trigger t_snapshot_staleness after insert or update or delete on clara.bank_statements
  for each row execute function clara._tf_snapshot_staleness();
create trigger t_snapshot_staleness after insert or update or delete on clara.bank_reconciliations
  for each row execute function clara._tf_snapshot_staleness();
create trigger t_snapshot_staleness after insert or update or delete on clara.bank_line_exceptions
  for each row execute function clara._tf_snapshot_staleness();

-- THE TRUNCATE HOLE ON clara.fixed_assets, CLOSED. TRUNCATE fires NO row triggers, so it
-- empties a table without a single staleness assessment being written -- every snapshot of
-- every client keeps reading `current` while the register behind it is gone. Five of the six
-- covered tables already carry a BEFORE TRUNCATE guard from their own migrations
-- (journal_entries, open_item_allocations, bank_statements, bank_reconciliations,
-- bank_line_exceptions); fixed_assets was measured this round as the ONE that does not, so
-- it gets the house guard here. This is not a staleness trigger -- there is no useful
-- effect date for "all rows" -- it is the refusal that makes the hole unreachable, which is
-- the same trade every other covered table already made.
create trigger t_fixed_assets_no_truncate before truncate on clara.fixed_assets
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- S9 -- THE EVENT TYPE, ON BOTH REGISTERS. The 0055 S7.5 lesson, made structural: an
-- unregistered event type turns every successful door call into a CLR10 at the spine.
-- =====================================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('snapshot.minted', true, 'A month management-accounts snapshot was minted', 'ignore',
   'human artifact act; staleness is an assessment row and the router has no work to do')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- =====================================================================================
-- S10 -- THE GRANT MATRIX (skeleton SS2.10's shape, with the agent row EMPTY).
--
-- clara_authenticated : mint_month_snapshot + the three reads.
-- clara_agent_ro      : NOTHING -- see the note below.
-- both wake roles     : nothing.
-- clara_runtime       : nothing. Month snapshots are human-initiated in E; scheduling is
--                       Wave G, and a grant added "for later" is a grant nobody reviewed
--                       for its actual use (SS2.10's own words).
-- everyone else       : nothing -- the standing schema-scoped revoke-from-public posture.
--
-- =====================================================================================
-- RECORDED DEVIATION FROM RATIFIED DESIGN -- THE AGENT ROW IS EMPTY, ON BOTH ITS HALVES.
-- This is a DESIGN DEPARTURE from two ratified sentences, not an oversight, and it rides
-- the PR body as well as this comment. Ruled by the orchestrator at the round-1 review.
--
-- (i) THE FUNCTION HALF -- SS2.10's grant table names snapshot_state for clara_agent_ro.
-- The AS-BUILT precedent runs the other way and it is the more recent, reviewed decision:
-- lane beta's B6 ruling REVOKED the agent grants on all three close reads, and the live
-- catalog agrees -- verify_close, get_close_readiness and list_fiscal_years each read
-- has_function_privilege('clara_agent_ro', ..) = false, and each calls clara._human_ctx.
-- That is the reasoning: a _human_ctx-gated read granted to a role that carries no JWT is a
-- DARK grant -- it looks like access and refuses at runtime with CLR04. Granting it here
-- would widen the privilege surface by exactly nothing usable.
--
-- (ii) THE TABLE half -- SS2.12's closing clause reads "reads are granted to
-- clara_authenticated and clara_agent_ro" for clara.reporting_periods. There is no
-- p_rp_agent policy and no agent SELECT grant here either, for the same posture reason
-- rather than a second independent one: the campaign's as-built agent-read surface is
-- FUNCTION-MEDIATED end to end. Beta's B6 revoked the close-read grants, and beta's R2 ACL
-- sweep revoked five surviving agent table SELECTs wave-wide; 0037 states the same posture
-- in its own words ("there is deliberately NO clara_agent_ro policy") for the subledger.
-- A lone agent table SELECT on the period registry would cut directly against that, and it
-- would buy nothing today: the agent's period reads arrive with delta's wake-pack surface,
-- which is a function, so the grant would be dead weight that a reviewer must re-justify at
-- every later sweep.
--
-- BOTH HALVES ARE CHEAPLY REVERSIBLE, AND THE OPTIONS ARE NAMED SO THE OWNER CAN RULE
-- WITHOUT RE-DERIVING THEM: for the function half, either one `grant execute` (dark,
-- matching SS2.10's letter) or the dual-lane wake-secret idiom clara.get_context_pack
-- already uses (live, and the honest build); for the table half, a p_rp_agent policy plus a
-- SELECT grant. All are additive; none is blocked by anything in this file.
-- =====================================================================================
-- =====================================================================================
grant execute on function clara.mint_month_snapshot(uuid, date, text) to clara_authenticated;
grant execute on function clara.snapshot_state(uuid)   to clara_authenticated;
grant execute on function clara.verify_snapshot(uuid)  to clara_authenticated;
grant execute on function clara.days_in_period(uuid)   to clara_authenticated;

reset role;

-- =====================================================================================
-- S11 -- TAIL. Everything this file claims, measured from the LIVE CATALOG in the same
-- transaction that made it true.
-- =====================================================================================

-- SS2.11's WRITER ROSTER, AS DATA AND IN ONE PLACE. It lands in a temp table rather than
-- inline in the DO block because TWO tail arms consume it -- 11.2 (existence + trigger
-- coverage) and 11.2b (the effect-table reachability proof) -- and a roster written twice
-- is two rosters that can disagree, which is the defect class this whole census exists to
-- catch. Every entry is a REGPROCEDURE IDENTITY, never a bare name: settle_from_bank_line
-- and match_bank_line are each OVERLOADED in the live catalog, and a name-LIKE roster would
-- conflate two functions with different argument lists and different bodies.
-- The key is (sig, tbl), NOT sig alone: one door can legitimately write MORE THAN ONE of
-- the six covered tables, and each such claim is its own row that 11.2b must prove
-- separately. clara.unmatch_bank_match is the live example -- it writes both
-- bank_line_exceptions and journal_entries -- and a sig-only key silently made the roster
-- unable to express that.
create temp table _x57_roster(sig text not null, tbl text not null, row_ref text not null,
  primary key (sig, tbl)) on commit drop;
insert into _x57_roster(sig, tbl, row_ref) values
  -- rows 1,2 -- the JE lifecycle
  ('clara.approve_entry(uuid,uuid,text,text)',                   'journal_entries', 'r1'),
  ('clara.reverse_entry(uuid,text,text)',                        'journal_entries', 'r2'),
  -- row 3 -- the settlement composites (they write BOTH; the allocation half is below)
  ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)', 'journal_entries', 'r3'),
  ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)', 'journal_entries', 'r3'),
  -- row 4 -- THE COMPOSITE BANK PATHS. Named by SS2.11 as "the cores called at 0044:1927,
  -- :1946" and therefore missing from the round-1 census, which enumerated only the doors it
  -- had signatures for. These are the public doors above those cores; both overloads of each
  -- overloaded name are listed, because an overload is a different function.
  ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)',                          'journal_entries', 'r4'),
  ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)',                     'journal_entries', 'r4'),
  ('clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)', 'journal_entries', 'r4'),
  ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)',      'journal_entries', 'r4'),
  ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)', 'journal_entries', 'r4'),
  -- row 5 -- recurring adjustments + auto-reversals
  ('clara.run_adjustment_occurrence(uuid,uuid,date,date,text)',   'journal_entries', 'r5'),
  ('clara.run_adjustment_manual(uuid,uuid,date,date,text)',       'journal_entries', 'r5'),
  ('clara.reverse_adjustment_pair(uuid,uuid,text,text)',          'journal_entries', 'r5'),
  -- row 6 -- the depreciation belt
  ('clara.run_depreciation_period(uuid,date,date,text)',          'journal_entries', 'r6'),
  ('clara.run_depreciation_manual(uuid,date,date,text)',          'journal_entries', 'r6'),
  -- row 7 -- THE CLOSING-STOCK ADJUSTMENT IS DELIBERATELY ABSENT; 11.2c measures the absence.
  -- row 8 -- the wrong-client correction (marks the FROM client; see the arm's own comment)
  ('clara.approve_wrong_client_correction(uuid,text,text,text)',  'journal_entries', 'r8'),
  -- row 9 -- the opening machinery
  ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',  'journal_entries', 'r9'),
  ('clara.supersede_opening_item(uuid,jsonb,text)',               'journal_entries', 'r9'),
  -- row 10 -- the close's own closing entry
  ('clara.finalize_close(uuid,text,text)',                        'journal_entries', 'r10'),
  -- row 11 -- the allocation movers (zero GL)
  ('clara.apply_open_items(uuid,jsonb,text,text)',                'open_item_allocations', 'r11'),
  ('clara.unallocate_group(uuid,uuid,text,text)',                 'open_item_allocations', 'r11'),
  -- row 12 -- FA particulars / enrolment
  ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)','fixed_assets', 'r12'),
  ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)', 'fixed_assets', 'r12'),
  -- row 13 -- the statement void
  ('clara.void_bank_statement(uuid,uuid,text,text)',              'bank_statements', 'r13'),
  -- row 14 -- the reconciliation pair
  ('clara.complete_bank_reconciliation(uuid,uuid[],text)',        'bank_reconciliations', 'r14'),
  ('clara.void_bank_reconciliation(uuid,text,text)',              'bank_reconciliations', 'r14'),
  -- row 15 -- the exception doors
  ('clara.except_bank_line(uuid,text,text,uuid,text)',            'bank_line_exceptions', 'r15'),
  ('clara.resolve_bank_line_exception(uuid,text,text,uuid,text)', 'bank_line_exceptions', 'r15'),
  -- ---------------------------------------------------------------------------------
  -- FOUND BY THE INVERSE CENSUS (11.2d), NOT BY SS2.11. Every row below writes one of the
  -- six covered tables and appears in NO row of the design's writer table -- the design
  -- enumerated the movers its authors had in mind, which is exactly the failure mode
  -- enumeration has in this repo. They were all already COVERED (the trigger sits on the
  -- table, not on the caller); what was missing was the claim, and therefore the check.
  -- The census below now derives this set from the catalog, so the next omission fails the
  -- migration instead of waiting for a reviewer to notice it.
  ('clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)',                        'journal_entries',      'inv'),
  ('clara.approve_opening_correction(uuid,jsonb,text,text)',                        'fixed_assets',         'inv'),
  ('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)','journal_entries',     'inv'),
  ('clara.cancel_pair_reversal(uuid,uuid,text,text)',                               'journal_entries',      'inv'),
  ('clara.complete_pending_match(uuid,uuid,text)',                                  'bank_line_exceptions', 'inv'),
  ('clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)','journal_entries',    'inv'),
  ('clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)',               'journal_entries',      'inv'),
  -- the statement-facts door reaches clara.bank_statements through _persist_statement_core
  ('clara.persist_statement_facts(uuid,jsonb)',                                     'bank_statements',      'inv'),
  ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',              'journal_entries',      'inv'),
  -- unmatch_bank_match writes BOTH, so it earns two rows: one claim per effect table
  ('clara.unmatch_bank_match(uuid,uuid,text,text)',                                 'bank_line_exceptions', 'inv'),
  ('clara.unmatch_bank_match(uuid,uuid,text,text)',                                 'journal_entries',      'inv'),
  ('clara.withdraw_draft(uuid,text,uuid,text)',                                     'journal_entries',      'inv');

do $s11$
declare
  r record; v_n int; v_t text; v_def text;
begin
  -- (11.1) THE STALENESS TRIGGER SET IS EXACTLY SIX TABLES -- asserted in BOTH directions.
  -- The forward half (each named table carries it) catches an uncovered mover; the reverse
  -- half (no OTHER table carries it) catches a trigger attached somewhere nobody designed
  -- for, which would fire the CASE's fail-closed else arm on a live write.
  for r in select * from (values
      ('journal_entries'), ('open_item_allocations'), ('fixed_assets'),
      ('bank_statements'), ('bank_reconciliations'), ('bank_line_exceptions')) t(tbl) loop
    select count(*) into v_n from pg_trigger g
      where g.tgrelid = ('clara.' || r.tbl)::regclass and g.tgname = 't_snapshot_staleness'
        and not g.tgisinternal;
    if v_n <> 1 then
      raise exception '0057 S11.1: clara.% does not carry t_snapshot_staleness -- a named mover is uncovered', r.tbl
        using errcode = 'CLR10';
    end if;
  end loop;
  select count(*) into v_n from pg_trigger g
    where g.tgname = 't_snapshot_staleness' and not g.tgisinternal;
  if v_n <> 6 then
    raise exception '0057 S11.1: t_snapshot_staleness exists on % relation(s), expected exactly 6', v_n
      using errcode = 'CLR10';
  end if;
  -- ...and it is the SAME function on all six, so "covered" cannot mean six different
  -- predicates wearing one name (spelling is not identity, applied to a trigger name).
  select count(distinct g.tgfoid) into v_n from pg_trigger g
    where g.tgname = 't_snapshot_staleness' and not g.tgisinternal;
  if v_n <> 1 then
    raise exception '0057 S11.1: the six t_snapshot_staleness triggers bind % distinct functions', v_n
      using errcode = 'CLR10';
  end if;
  -- ...and every covered table refuses TRUNCATE. Row triggers do not fire on TRUNCATE, so a
  -- covered table without this guard can be emptied with no assessment written and every
  -- artifact still reading `current`. Asserted across all six (tgtype bit 32 = TRUNCATE) so
  -- the set cannot drift back open the way fixed_assets had.
  for r in select * from (values
      ('journal_entries'), ('open_item_allocations'), ('fixed_assets'),
      ('bank_statements'), ('bank_reconciliations'), ('bank_line_exceptions')) t(tbl) loop
    if not exists (select 1 from pg_trigger g
                    where g.tgrelid = ('clara.' || r.tbl)::regclass
                      and not g.tgisinternal and (g.tgtype & 32) <> 0) then
      raise exception '0057 S11.1: clara.% carries NO before-truncate guard -- TRUNCATE fires no row triggers, so it would empty a covered table leaving every snapshot reading current', r.tbl
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.2) THE SS2.11 WRITER CENSUS. For every named mover: the function still EXISTS at
  -- the signature this file was authored against, and the table its effect lands on carries
  -- the staleness trigger. An enumeration is not the enforcement -- the trigger is -- but an
  -- UNCHECKED enumeration is worse than a checked one (SS2.11's own words), and a signature
  -- that moved is a real finding rather than a surprise to discover in the field.
  for r in select * from _x57_roster order by sig loop
    if to_regprocedure(r.sig) is null then
      raise exception '0057 S11.2: the SS2.11 mover % is absent at that signature -- the census was authored against it', r.sig
        using errcode = 'CLR10';
    end if;
    select count(*) into v_n from pg_trigger g
      where g.tgrelid = ('clara.' || r.tbl)::regclass and g.tgname = 't_snapshot_staleness'
        and not g.tgisinternal;
    if v_n <> 1 then
      raise exception '0057 S11.2: mover % lands on clara.%, which carries NO staleness trigger', r.sig, r.tbl
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.2b) THE EFFECT-TABLE PROOF -- the half that makes 11.2 more than a tautology.
  -- 11.2 alone proves a function EXISTS and that some table carries a trigger; it never
  -- proves the mover reaches the table the roster CLAIMS for it. A roster row could name
  -- the wrong effect table -- which is precisely how SS2.11's rows 11 and 13 were wrong
  -- twice -- and 11.2 would still pass.
  --
  -- So: for every roster row, walk the clara call graph from the mover and require that
  -- SOME body reachable within three hops performs a WRITE STATEMENT against the claimed
  -- table -- `insert into|update|delete from clara.<table>`, over the 0056-normalised body
  -- (comments stripped, whitespace collapsed). Most non-JE movers prove at depth 0 (their
  -- own body writes the table). Most JE movers prove at depth 1 (approve_entry ->
  -- _approve_entry_core, run_depreciation_* -> _fa_run_period_core, allocate_* ->
  -- _allocate_*_core, the adjustment verbs -> their run/reverse cores), and
  -- settle_from_bank_line proves at depth 2 (-> _settle_from_bank_line_core -> the allocate
  -- cores / _bank_match_adjustment_entry). Measured on the 0057 rig: all 27 rows resolve at
  -- depth <= 2, so a cap of 3 has real slack without turning the walk loose.
  --
  -- THE WRITE SHAPE IS LOAD-BEARING, AND THE WEAKER VERSION OF THIS CHECK WAS VACUOUS.
  -- The first cut of this arm asked only whether a reachable body MENTIONED the table.
  -- Measured against deliberately FALSE claims, it passed all of them: within three hops
  -- nearly every clara verb reaches some body that mentions clara.journal_entries (a shared
  -- helper, an audit path, a read), so "apply_open_items writes journal_entries" -- the
  -- exact v1 defect -- came back PROVEN. A check that cannot fail proves nothing and is
  -- worse than none, because it looks like evidence. The write-shaped predicate was
  -- re-measured against the same false claims and correctly refuses both of them
  -- (apply_open_items -> journal_entries, and void_bank_statement -> bank_reconciliations,
  -- the v2 defect restaged), while still proving all 27 true rows.
  --
  -- THE EDGE RELATION IS COMMENT-STRIPPED, AND THE POLARITY IS WHY. An edge is "the
  -- callee's qualified name appears in the caller's body", which is a TEXT relation. In
  -- THIS arm a spurious edge makes a claim EASIER to prove, so an un-stripped body would
  -- let a mere COMMENT mentioning a core stand in for actually calling it -- prose proving
  -- a code path, which is the precise thing this arm exists to stop doing. Stripping
  -- comments first (the house `/*...*/` + `--` idiom this file already uses for its write
  -- detector) removes that. What remains -- a name inside a STRING LITERAL -- still
  -- over-approximates, and that residual is stated rather than chased: it can only make a
  -- true path easier to find, never manufacture a failure, and 11.2d's opposite polarity
  -- is where over-approximation would actually hurt.
  -- The tightening on ARRIVING is unchanged: a write, not a mention. UNION (not UNION ALL)
  -- dedupes, which is also what keeps a cyclic call graph terminating.
  for r in
    with recursive reach(sig, oid, depth) as (
      select ro.sig, ro.sig::regprocedure::oid, 0 from _x57_roster ro
      union
      select h.sig, c.oid, h.depth + 1
        from reach h
        join pg_proc p on p.oid = h.oid
        join pg_proc c on c.pronamespace = 'clara'::regnamespace
         and position('clara.' || c.proname || '(' in
               regexp_replace(regexp_replace(coalesce(p.prosrc, ''),
                 '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g')) > 0
       where h.depth < 3)
    select ro.sig, ro.tbl, ro.row_ref
      from _x57_roster ro
     where not exists (
       select 1 from reach h join pg_proc x on x.oid = h.oid
        where h.sig = ro.sig
          and lower(regexp_replace(regexp_replace(regexp_replace(
                coalesce(x.prosrc, ''),
                '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
              ~ ('(insert into|update|delete from) clara\.' || ro.tbl || '\M'))
     order by ro.sig
  loop
    raise exception '0057 S11.2b: SS2.11 % claims clara.% as %''s effect table, but no body within 3 call hops of it WRITES that table -- the coverage claim is prose, not a path', r.row_ref, r.tbl, r.sig
      using errcode = 'CLR10';
  end loop;

  -- (11.2d) THE INVERSE CENSUS -- the arm that kills UNDER-CLAIMING as a CLASS.
  -- 11.2 and 11.2b both start from the ROSTER and check it forward, so neither can ever see
  -- a mover the roster never named. That is not hypothetical: this arm found ELEVEN writers
  -- of the six covered tables that SS2.11's table does not mention at all -- among them
  -- complete_pending_match and unmatch_bank_match (bank_line_exceptions) and
  -- _persist_statement_core (bank_statements). Adding those three by hand would have been
  -- whack-a-mole against an enumeration that was already proven incomplete; deriving the
  -- obligation from the catalog is what makes the next omission a failed migration instead
  -- of a reviewer's lucky catch.
  --
  -- THE RULE, STATED AS WHAT THE INSTRUMENT ACTUALLY SEES: every clara function whose body
  -- contains a SCHEMA-QUALIFIED STATIC DML STATEMENT (`insert into|update|delete from
  -- clara.<table>`, over the comment-stripped, whitespace-collapsed body) against one of the
  -- six covered tables must be, or be REACHABLE FROM, at least one roster entry.
  -- Reachability (not roster membership) is the right test because the doors are what
  -- SS2.11 enumerates while the writes usually happen one or two layers down in a _core --
  -- persist_statement_facts is the door, _persist_statement_core does the insert, and
  -- requiring the roster to list cores would make it a second copy of the call graph.
  --
  -- THE CLAIM IS DELIBERATELY NARROWER THAN "EVERY WRITER", because the detector is a
  -- SCANNER, not a parser. The confirming round enumerated NINE write shapes it cannot see:
  -- a bare unqualified table name (search_path resolves it), `clara . tbl` with whitespace
  -- around the dot, quoted identifiers ("clara"."journal_entries"), UPDATE/DELETE ONLY,
  -- MERGE, COPY ... FROM, a write through an updatable VIEW, dynamic DML built with
  -- format() and run by EXECUTE, and a SQL-standard BEGIN ATOMIC body (whose text lives in
  -- prosqlbody, not prosrc, so prosrc is empty and every regex over it matches nothing).
  -- Claiming completeness over all writers while measuring only one shape would be the
  -- census telling a bigger story than its instrument supports -- the same defect as the
  -- vacuous first cut of 11.2b, in the opposite direction.
  --
  -- SO THE UNSEEN SHAPES GET FAIL-CLOSED SENTINELS INSTEAD OF A REGEX ARMS RACE (below,
  -- and in S0.10 for the birth-time ones). Each sentinel asserts the shape does not exist
  -- in clara today; the day a migration introduces one, the sentinel RAISES and that
  -- migration owes this detector an extension. The class fails closed rather than silently
  -- narrowing, which is the only honest outcome available without writing a SQL parser.
  --
  -- TRIGGER FUNCTIONS ARE EXCLUDED BY IDENTITY (prorettype = trigger), not by name -- a
  -- `_tf_%` name filter would be spelling again. The exclusion is principled: a trigger
  -- function is not a door anyone calls, it fires inside another writer's statement, and
  -- its own write to a covered table re-enters this very staleness trigger. The live
  -- example is clara._tf_rotate_token, which updates journal_entries.
  --
  -- THIS ARM HAS TEETH, AND THE PROOF WAS HAND-RUN -- it is NOT a standing guard, so it is
  -- recorded here rather than implied. Run against this catalog with the roster EMPTIED
  -- entirely, the same query reports 41 (function, table) pairs across 39 distinct
  -- functions -- i.e. the full population of statically-detectable writers of the six
  -- covered tables, every one of which the live roster must therefore account for. (Gutted
  -- to a SINGLE seed entry instead of none, it reports 37 across 35; the count is an
  -- artifact of how far the roster is cut, which is why the setup is stated alongside the
  -- number rather than the number alone.) The check that matters is that BOTH figures are
  -- non-zero: an arm that reports nothing when its roster is destroyed is proving nothing,
  -- which is how the first cut of 11.2b passed while being vacuous.
  -- THE EDGES ARE COMMENT-STRIPPED HERE FOR THE OPPOSITE REASON, AND IT MATTERS MORE.
  -- In 11.2b a spurious edge makes a claim easier to prove; HERE a spurious edge makes a
  -- writer look COVERED and drops it off the escapee list. Measured by the confirming
  -- round: a single comment line naming a writer was enough to exempt it. That is the
  -- polarity inversion -- an un-stripped edge relation turns a comment into an exemption
  -- from the very census that exists to find un-enumerated writers, so a future author
  -- could silence this arm by writing prose. Stripping first closes it.
  -- The residual (a name inside a STRING LITERAL) is stated and NOT chased: it is the one
  -- remaining way to look reachable without being called, it exists nowhere in the tree
  -- today, and resolving it properly means parsing SQL rather than scanning it.
  for r in
    with recursive reach(oid, depth) as (
      select ro.sig::regprocedure::oid, 0 from _x57_roster ro
      union
      select c.oid, h.depth + 1
        from reach h
        join pg_proc p on p.oid = h.oid
        join pg_proc c on c.pronamespace = 'clara'::regnamespace
         and position('clara.' || c.proname || '(' in
               regexp_replace(regexp_replace(coalesce(p.prosrc, ''),
                 '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g')) > 0
       where h.depth < 3)
    select p.oid::regprocedure::text as sig, t.tbl
      from pg_proc p
      cross join (values ('journal_entries'), ('open_item_allocations'), ('fixed_assets'),
                         ('bank_statements'), ('bank_reconciliations'),
                         ('bank_line_exceptions')) t(tbl)
     where p.pronamespace = 'clara'::regnamespace
       and p.prorettype <> 'trigger'::regtype
       and lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(p.prosrc, ''),
             '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
           ~ ('(insert into|update|delete from) clara\.' || t.tbl || '\M')
       and not exists (select 1 from reach h where h.oid = p.oid)
     order by 1, 2
  loop
    raise exception '0057 S11.2d: clara function % WRITES clara.% but is reachable from no roster entry -- a mover the census cannot see. Add its public door to the S11 roster (or, if it is genuinely unreachable from any door, say why here).', r.sig, r.tbl
      using errcode = 'CLR10';
  end loop;

  -- SENTINEL 1 -- DYNAMIC DML, ANYWHERE IN clara. NOT "writes a covered table AND contains
  -- EXECUTE": that conjunction DEFEATED ITSELF, and the confirming round caught it. A body
  -- whose write is ONLY dynamic fails the static write-detector, so the first conjunct is
  -- false, so the guard never reaches it -- the guard could only ever fire on a function
  -- that ALSO wrote statically, which is exactly the case that needs no guard. The
  -- conjunct is dropped: ZERO clara non-trigger functions may contain a bare EXECUTE token
  -- at all. Measured 0 today, so the stricter form costs nothing now and is load-bearing
  -- the moment anyone adds dynamic SQL to this schema.
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
    into v_t
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.prorettype <> 'trigger'::regtype
     and lower(regexp_replace(regexp_replace(
           coalesce(p.prosrc, ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g')) ~ '\mexecute\M';
  if v_t <> '' then
    raise exception '0057 S11.2d: {%} contain a bare EXECUTE token -- the inverse census reads STATIC statement text and cannot see dynamic DML, so it can no longer prove completeness over the six covered tables. Extend the detector (or enumerate the dynamic writes by hand) before this file may pass.', v_t
      using errcode = 'CLR10';
  end if;

  -- SENTINEL 2 -- MERGE and COPY targeting a covered table. Both write rows and neither
  -- matches the `insert into|update|delete from` detector. Measured absent today.
  select coalesce(string_agg(distinct p.oid::regprocedure::text, ', '), '') into v_t
    from pg_proc p
    cross join (values ('journal_entries'), ('open_item_allocations'), ('fixed_assets'),
                       ('bank_statements'), ('bank_reconciliations'),
                       ('bank_line_exceptions')) t(tbl)
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(
           coalesce(p.prosrc, ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'))
         ~ ('\m(merge|copy)\M[^;]{0,200}clara\.' || t.tbl || '\M');
  if v_t <> '' then
    raise exception '0057 S11.2d: {%} reach a covered table through MERGE or COPY, which the insert/update/delete detector cannot see -- extend it before this file may pass', v_t
      using errcode = 'CLR10';
  end if;

  -- (11.2c) ROW 7 IS ABSENT, AND THE ABSENCE IS MEASURED RATHER THAN ASSUMED. SS2.11's row
  -- 7 is "the closing-stock adjustment (WD-R11)", and it is the one roster row with no
  -- entry above, because NO closing-stock PRODUCER exists in the catalog yet: the only
  -- function carrying the name is clara._close_gate_closing_stock, which is 0056's drawer-2
  -- GATE evaluator -- it decides whether a goods-trader may close, and books nothing.
  -- The debt is already recorded (docs/plan/REBUILD-PLAN.md: "the closing_stock producer
  -- verb ships before any real goods-trader close", PR #228 residual 5); the trigger route
  -- needs no change when it lands, because it will book a journal entry like every other
  -- WD-R11 adjustment and the JE trigger already covers that. What this assertion buys is
  -- the NOTICE: the day a second closing-stock function appears, this raises and tells its
  -- author to enroll it in the roster rather than leaving row 7 silently unrepresented.
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), '')
    into v_t
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname like '%closing_stock%';
  if v_t <> 'clara._close_gate_closing_stock(uuid,uuid)' then
    raise exception '0057 S11.2c: the closing-stock surface is now {%} -- SS2.11 row 7 has a producer (or lost its gate). Enroll the producer in the S11 roster and re-derive row 7''s disposition; it is the ONE named mover this census deliberately carries no entry for.', v_t
      using errcode = 'CLR10';
  end if;

  -- (11.3) THE THREE ROWS THE DESIGN GOT WRONG BEFORE, PROVEN FROM LIVE BODIES rather than
  -- credited from prose. v1 pointed the allocation movers at an open_items trigger that
  -- could never fire for them; v2 credited a bank_reconciliations trigger to a verb that
  -- never writes that table. Both were "honest boundaries" resting on an UNREAD body. These
  -- assertions read the body.
  for r in select * from (values
      ('clara.apply_open_items(uuid,jsonb,text,text)',         'open_item_allocations'),
      ('clara.unallocate_group(uuid,uuid,text,text)',          'open_item_allocations'),
      ('clara.void_bank_statement(uuid,uuid,text,text)',       'bank_statements'),
      ('clara.except_bank_line(uuid,text,text,uuid,text)',     'bank_line_exceptions'),
      ('clara.resolve_bank_line_exception(uuid,text,text,uuid,text)', 'bank_line_exceptions')
    ) t(sig, tbl) loop
    -- prosrc-only, the 0056 S0.7 / S11.3 house instrument. Two properties make it the right
    -- one here: a `create or replace` splice rewrites prosrc, so this IS the live body (not
    -- a from-file guess); and an empty prosrc -- a C or SQL-language body -- makes the
    -- position() test below RAISE rather than pass, so the boundary fails CLOSED.
    -- It also keeps the catalog body-PRINTING builtin out of this block entirely, which
    -- matters: the binding-post-control and wiki-dynamic-sql gates both read that builtin
    -- paired with the token `execute` as a chain-of-responsibility PATCH SITE, and demand a
    -- statically attributable target. A roster loop cannot give one. The honest fix is to
    -- stop being a patch site -- this block patches nothing -- rather than to widen a
    -- security gate or claim an allowlist entry. (Which is also why that builtin's name is
    -- not spelled out anywhere in this file, comments included: both scanners match on the
    -- token, and a comment that trips a fail-closed gate is a comment that costs a merge.)
    select coalesce(p.prosrc, '') into v_def
      from pg_proc p where p.oid = r.sig::regprocedure;
    if position('clara.' || r.tbl in v_def) = 0 then
      raise exception '0057 S11.3: % does not reference clara.% in its live body -- the coverage claim rests on prose, which is how rows 11 and 13 were wrong twice', r.sig, r.tbl
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ...and the specific negative that killed v2's row 13: the statement void does NOT write
  -- bank_reconciliations, so crediting that trigger would have covered nothing.
  select coalesce(p.prosrc, '') into v_def
    from pg_proc p where p.oid = 'clara.void_bank_statement(uuid,uuid,text,text)'::regprocedure;
  if v_def ~* 'update\s+clara\.bank_reconciliations' then
    raise exception '0057 S11.3: void_bank_statement now DOES update bank_reconciliations -- the effect-date resolution must be re-derived'
      using errcode = 'CLR10';
  end if;

  -- (11.4) THE FA-DEPRECIATION CLASS, PROVEN COVERED RATHER THAN ASSUMED (SS2.11 names this
  -- as exactly the shape of answer the census exists to produce). Those three tables carry
  -- NO staleness trigger and need none, because the depreciation belt always books a
  -- journal entry -- so the JE trigger marks every run. A named mover whose effect table is
  -- covered by a DIFFERENT trigger passes; one covered by none RAISEs.
  foreach v_t in array array['fa_depreciation','fa_depreciation_authorities','fa_depreciation_runs'] loop
    if to_regclass('clara.' || v_t) is null then
      raise exception '0057 S11.4: clara.% is gone -- the FA-depreciation disposition was authored against it', v_t
        using errcode = 'CLR10';
    end if;
    select count(*) into v_n from pg_trigger g
      where g.tgrelid = ('clara.' || v_t)::regclass and g.tgname = 't_snapshot_staleness'
        and not g.tgisinternal;
    if v_n <> 0 then
      raise exception '0057 S11.4: clara.% unexpectedly carries a staleness trigger -- the disposition says it is covered via the JE trigger', v_t
        using errcode = 'CLR10';
    end if;
  end loop;
  select count(*) into v_n from pg_trigger g
    where g.tgrelid = 'clara.journal_entries'::regclass and g.tgname = 't_snapshot_staleness'
      and not g.tgisinternal;
  if v_n <> 1 then
    raise exception '0057 S11.4: the FA-depreciation class is credited to the JE trigger, which is not present'
      using errcode = 'CLR10';
  end if;

  -- (11.4b) THE journal_lines DISPOSITION, ASSERTED RATHER THAN NARRATED. S11.10 states
  -- that journal_lines needs no staleness trigger, and that claim rests on TWO live
  -- mechanisms rather than on judgement. Both are measured here, because a disposition
  -- whose justification is only prose becomes a stale excuse the moment either moves --
  -- and the failure would be silent: line writes would start moving presented figures with
  -- nothing marking the artifact.
  --   (i) clara._tf_lines_immutable still guards journal_lines and still refuses writes
  --       against an approved/withdrawn entry, so a line can only move while its entry is
  --       a draft; and
  --  (ii) clara.trial_balance_as_of still filters to approved entries, so a draft is on no
  --       presented figure in the first place.
  -- Together: no line write can move a presented number without a journal_entries write,
  -- which the JE trigger marks.
  select count(*) into v_n from pg_trigger g
    join pg_proc p on p.oid = g.tgfoid
   where g.tgrelid = 'clara.journal_lines'::regclass and not g.tgisinternal
     and p.proname = '_tf_lines_immutable';
  if v_n <> 1 then
    raise exception '0057 S11.4b: clara.journal_lines no longer carries the _tf_lines_immutable belt -- S11.10''s journal_lines disposition rested on it; re-derive whether that table now needs a staleness trigger'
      using errcode = 'CLR10';
  end if;
  select coalesce(p.prosrc, '') into v_def from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_tf_lines_immutable';
  if v_def !~ 'approved' or v_def !~ 'withdrawn' then
    raise exception '0057 S11.4b: _tf_lines_immutable no longer refuses on approved/withdrawn -- a line write can now move an approved entry, so journal_lines needs its own staleness trigger'
      using errcode = 'CLR10';
  end if;
  select coalesce(p.prosrc, '') into v_def from pg_proc p
   where p.oid = 'clara.trial_balance_as_of(uuid,date)'::regprocedure;
  if v_def !~ 'status\s*=\s*''approved''' then
    raise exception '0057 S11.4b: trial_balance_as_of no longer filters to approved entries -- drafts would reach a presented figure, and the journal_lines disposition no longer holds'
      using errcode = 'CLR10';
  end if;

  -- (11.4c) THE JE STATUS PREDICATE'S DEPENDENCIES, ASSERTED RATHER THAN NARRATED -- the
  -- same standard 11.4b applies to the journal_lines disposition, now applied to the
  -- staleness arm that decides whether a JE mutation marks at all. That predicate rests on
  -- two live facts, and if either moves the arm starts MISSING presented movements silently.
  --
  -- (i) 'approved' IS THE SOLE PRESENTED STATUS -- by EXACT TOKEN EQUALITY over every status
  -- literal trial_balance_as_of compares, not by "the body mentions approved". A presence
  -- regex would still pass if someone widened the filter to
  -- `status='approved' or status='posted'`, and the staleness arm would then ignore every
  -- 'posted' entry while the trial balance presented it. So the DISTINCT SET of literals is
  -- compared to exactly {approved}.
  select coalesce(string_agg(distinct m[1], ',' order by m[1]), '(none)') into v_t
    from pg_proc p,
         lateral regexp_matches(
           lower(regexp_replace(regexp_replace(regexp_replace(coalesce(p.prosrc, ''),
             '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')),
           'status\s*=\s*''([a-z_]+)''', 'g') m
   where p.oid = 'clara.trial_balance_as_of(uuid,date)'::regprocedure;
  if v_t <> 'approved' then
    raise exception '0057 S11.4c: trial_balance_as_of compares status literal(s) {%}, not exactly {approved} -- the JE staleness arm marks only on approved, so any other presented status would move a figure with nothing marking it', v_t
      using errcode = 'CLR10';
  end if;

  -- (ii) THE TRANSITION ALLOW-SET IS THE ONE THIS ARM WAS DERIVED AGAINST. Pinned two ways,
  -- because each alone is weak: an md5 alone says "something moved" without saying whether
  -- it mattered, and a token probe alone cannot notice a re-ordering that changes meaning.
  --   * STRUCTURAL: 'posting_date' must appear NOWHERE in clara._tf_entry_immutable. That is
  --     what makes "an approved entry's effect date cannot move under us" true -- if the
  --     column is absent from the body entirely, it is in no allow-set, so no transition
  --     can carry it. (Measured: absent.)
  --   * MATERIAL: the four transition arms this file enumerated must still be the ones the
  --     body implements -- probed by their own refusal literals rather than by md5, so a
  --     comment edit does not cry wolf while a REMOVED arm does raise.
  -- The re-derive path, stated so a future author is not left guessing: if this fires, read
  -- the body's allow-sets again and re-derive the INSERT/UPDATE/DELETE predicate in the
  -- clara.journal_entries arm of clara._tf_snapshot_staleness -- do not simply widen it.
  select coalesce(p.prosrc, '') into v_def from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_tf_entry_immutable';
  if v_def = '' then
    raise exception '0057 S11.4c: clara._tf_entry_immutable is absent -- the JE staleness predicate was derived from its allow-set'
      using errcode = 'CLR10';
  end if;
  if position('posting_date' in v_def) <> 0 then
    raise exception '0057 S11.4c: _tf_entry_immutable now references posting_date -- an approved entry''s effect date may have become mutable, which the staleness arm assumes it is not; re-derive the predicate'
      using errcode = 'CLR10';
  end if;
  if position('journal entries are never deleted' in v_def) = 0
     or position('illegal approval transition' in v_def) = 0
     or position('withdrawal requires actor, time, and reason' in v_def) = 0
     or position('approved entries permit only a complete reversal-linkage pair' in v_def) = 0
     or position('illegal status transition' in v_def) = 0 then
    raise exception '0057 S11.4c: _tf_entry_immutable no longer carries all five transition arms this file derived its JE predicate from -- re-read the allow-sets and re-derive'
      using errcode = 'CLR10';
  end if;

  -- (iii) THE FA SKIP'S DEPENDENCY. The fixed_assets arm dates inclusion from
  -- coalesce(effective_from, acquired_date) and lets an UPDATE that moved nothing
  -- read-relevant skip. That is only sound while neither column is post-approval mutable --
  -- otherwise a silent edit to either could move an asset's inclusion start with no
  -- candidate detecting it. clara._tf_fixed_assets_immutable_0017 is the belt that decides,
  -- and its post-approval mutable set is {status, disposed_at, disposal_entry_id,
  -- superseded_by_asset_id, superseded_at, updated_at} plus the particulars columns while
  -- particulars are incomplete. Measured: NEITHER column appears anywhere in that body.
  select coalesce(p.prosrc, '') into v_def from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_tf_fixed_assets_immutable_0017';
  if v_def = '' then
    raise exception '0057 S11.4c: clara._tf_fixed_assets_immutable_0017 is absent -- the FA effect-date skip rests on its transition table'
      using errcode = 'CLR10';
  end if;
  if position('acquired_date' in v_def) <> 0 or position('effective_from' in v_def) <> 0 then
    raise exception '0057 S11.4c: the 0017 FA belt now names acquired_date or effective_from -- an asset''s inclusion START may have become mutable, and the fixed_assets staleness arm''s skip is no longer sound; re-derive it'
      using errcode = 'CLR10';
  end if;

  -- (11.5) THE PRIVILEGE SWEEP, BY STATE AND NEVER BY GRANT TEXT. A diff of grant statements
  -- reads a projection of the privilege state, not the state.
  for r in select * from (values
      ('clara.mint_month_snapshot(uuid,date,text)'),
      ('clara.snapshot_state(uuid)'),
      ('clara.verify_snapshot(uuid)'),
      ('clara.days_in_period(uuid)')) t(sig) loop
    if has_function_privilege('clara_agent_ro', r.sig, 'execute')
       or has_function_privilege('clara_runtime', r.sig, 'execute')
       or has_function_privilege('clara_wake_interactive', r.sig, 'execute')
       or has_function_privilege('clara_wake_proactive', r.sig, 'execute') then
      raise exception '0057 S11.5: a non-human role holds EXECUTE on % -- the write-authorization invariant is breached', r.sig
        using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', r.sig, 'execute') then
      raise exception '0057 S11.5: clara_authenticated cannot execute % -- the door is dark', r.sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- The INTERNALS stay unreachable from every app role (0004:748-750's stated rule). A
  -- reachable _ensure_month_period would let a caller mint period rows outside the audited
  -- door; a reachable _mark_snapshots_stale would let one forge staleness.
  for r in select * from (values
      ('clara._ensure_month_period(uuid,date,uuid)'),
      ('clara._snapshot_dataset(uuid,date,date)'),
      ('clara._snapshot_state_core(uuid)'),
      ('clara._days_in_period_core(uuid)'),
      ('clara._mark_snapshots_stale(uuid,date,text,uuid,uuid,uuid)')) t(sig) loop
    foreach v_t in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive','public'] loop
      if has_function_privilege(v_t, r.sig, 'execute') then
        raise exception '0057 S11.5: % can execute the internal % -- it must be reachable only from a definer body', v_t, r.sig
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  -- No app role may write the three new tables directly: every write goes through the door.
  for r in select * from (values
      ('reporting_periods'), ('period_snapshots'), ('snapshot_assessments')) t(tbl) loop
    foreach v_t in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if has_table_privilege(v_t, 'clara.' || r.tbl, 'insert')
         or has_table_privilege(v_t, 'clara.' || r.tbl, 'update')
         or has_table_privilege(v_t, 'clara.' || r.tbl, 'delete') then
        raise exception '0057 S11.5: % holds a DML privilege on clara.% -- writes go through the door only', v_t, r.tbl
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (11.6) FORCED RLS ON ALL THREE NEW TABLES, with the OWNER policy present on each --
  -- the load-bearing half. Without it a SECURITY DEFINER evaluator sees ZERO rows and every
  -- metric silently resolves 'absent' (the A6e failure shape, in this lane's dress).
  for r in select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
            where c.oid in ('clara.reporting_periods'::regclass,
                            'clara.period_snapshots'::regclass,
                            'clara.snapshot_assessments'::regclass) loop
    if not r.relrowsecurity or not r.relforcerowsecurity then
      raise exception '0057 S11.6: clara.% is not under FORCED row level security', r.relname
        using errcode = 'CLR10';
    end if;
    select count(*) into v_n from pg_policies
      where schemaname = 'clara' and tablename = r.relname and 'clara_fn_owner' = any(roles);
    if v_n <> 1 then
      raise exception '0057 S11.6: clara.% carries % clara_fn_owner policy/policies, expected exactly 1', r.relname, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.7) THE BODIES THIS FILE DID NOT TOUCH, proven by the S0 md5 pairs. In particular
  -- open_fiscal_year is UNCHANGED: the fiscal_year-grain period is minted by a trigger
  -- precisely so that no audited writer body moves and this file carries no D1 obligation.
  for r in select * from (values
      ('ofy_md5', 'clara.open_fiscal_year(uuid,text,date,date,text,text)'),
      ('fc_md5',  'clara.finalize_close(uuid,text,text)'),
      ('aoi_md5', 'clara.apply_open_items(uuid,jsonb,text,text)')) t(k, sig) loop
    select md5(p.prosrc) into v_t from pg_proc p where p.oid = r.sig::regprocedure;
    if v_t <> (select v from _x57_pre where k = r.k) then
      raise exception '0057 S11.7: % MOVED during this migration -- it must not', r.sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.8) The event type is on BOTH registers (the 0055 S7.5 lesson).
  select count(*) into v_n from clara.event_types where name = 'snapshot.minted';
  if v_n <> 1 then
    raise exception '0057 S11.8: snapshot.minted is not registered in clara.event_types'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
   where tt.event_type = 'snapshot.minted' and tt.decision = 'ignore';
  if v_n <> 1 then
    raise exception '0057 S11.8: snapshot.minted carries no ''ignore'' decision on the ACTIVE taxonomy version'
      using errcode = 'CLR10';
  end if;
  -- ...and the door stays OFF the wake register (the 0024:656-658 precedent, belt): no wake
  -- kind may ever mint an artifact a human will sign off on.
  select count(*) into v_n from clara.wake_fn_allowlist where function_name = 'mint_month_snapshot';
  if v_n <> 0 then
    raise exception '0057 S11.8: mint_month_snapshot appears in wake_fn_allowlist -- a wake lane must never mint a snapshot'
      using errcode = 'CLR10';
  end if;

  -- (11.9) The registry is INERT ON ARRIVAL and the artifact tables are empty, so every
  -- covered writer's observable behaviour is unchanged until the first human mint.
  select (select count(*) from clara.period_snapshots)
       + (select count(*) from clara.snapshot_assessments) into v_n;
  if v_n <> 0 then
    raise exception '0057 S11.9: the artifact tables are not empty at birth (% row(s))', v_n
      using errcode = 'CLR10';
  end if;
  -- ZERO FY ORPHANS AT CLOSE -- an ASSERTION now, not a notice. The mint trigger fires on
  -- INSERT only, so it is retroactive to nothing; S5's backfill is what covers the fiscal
  -- years that already existed when this migration arrived. Between the two, EVERY fiscal
  -- year must carry its fy-grain period row by the end of this transaction, on a fresh
  -- database and on a deploy-onto-existing alike. An orphan here would resolve `absent` for
  -- every fy-grain metric bound to it -- silently -- so it is a refusal, not a warning.
  -- (The earlier version of this arm merely NOTICED the orphans it found, which is the
  -- shape of a problem being reported to nobody: migrations are applied by a runner whose
  -- notices scroll past.)
  select count(*) into v_n from clara.fiscal_years fy
    where not exists (select 1 from clara.reporting_periods rp
                       where rp.fiscal_year_id = fy.id);
  if v_n <> 0 then
    raise exception '0057 S11.9: % fiscal year(s) carry NO fiscal_year-grain period row after the S5 backfill -- every FY must have one or its metrics resolve absent', v_n
      using errcode = 'CLR10';
  end if;
  -- THE DOUBLE-MINT ARM IS DELIBERATELY NOT WRITTEN, and this comment is why. The obvious
  -- companion assertion -- "no FY carries more than one fy-grain period row" -- is
  -- STRUCTURALLY UNREACHABLE: uq_rp_client_grain_start would already have raised 23505 at
  -- INSERT time, inside the trigger or the backfill, long before this tail could observe a
  -- duplicate. An assertion that cannot fail is not evidence; it is decoration that reads
  -- like evidence, which is the specific failure this file has now corrected twice. The
  -- constraint IS the guarantee here, and 11.6 already asserts the constraint's table is
  -- under forced RLS with its owner policy. Nothing further to check.

  -- (11.10) THE STATED OUT-OF-SCOPE DECISION. The honest-boundary convention requires
  -- saying what was left out and why, not silence -- an omission nobody wrote down is
  -- rediscovered later as a hole.
  raise notice '0057 S11.10 OUT OF SCOPE, STATED -- the SIX staleness tables vs 0056''s TEN wall tables, every difference accounted for: (a) clara.client_facts, clara.document_filings and clara.bank_accounts carry 0056''s close-serialize trigger but deliberately carry NO staleness trigger -- they feed close GATES (is a close permitted?), not the presented P&L or balance-sheet figures a management pack shows, so a mutation there does not move a number the snapshot presented. If a later pack ever PRESENTS a fact from one of them, that table joins the six and this decision is the thing to revisit. (b) clara.journal_lines is the fourth wall table with no staleness trigger, and it is SAFE for a structural reason rather than a judgement: clara._tf_lines_immutable refuses every line write against an entry that is approved or withdrawn, so a line can only move while its entry is a DRAFT -- and a draft is on no trial balance (clara.trial_balance_as_of filters status=''approved''). A line write therefore cannot move a presented figure without an accompanying clara.journal_entries write, which the JE trigger already marks. Putting a second trigger on the hottest child table to re-mark what its parent already marked would double the write cost of every posting and change no outcome. (c) The delta junction clara.metric_cell_periods is delta''s to build; (d) clara.get_close_plan is theta''s. Neither is missing here -- both are out of this lane.';

  raise notice '0057 OK: reporting_periods (month|fy, both ends inclusive, two uniques, fy-congruence trigger) + period_snapshots (bytes immutable, real sha256, structural range congruence) + snapshot_assessments (append-only, no unique index BY DESIGN) + mint_month_snapshot (bookkeeper floor, 007-EXCLUSIVE, books stay OPEN) + snapshot_state/verify_snapshot/days_in_period + the SIX-table staleness set (INTERSECTS + watermark, same transaction) + the fy-grain mint trigger (no D1 exposure) -- INERT ON ARRIVAL.';
end $s11$;
