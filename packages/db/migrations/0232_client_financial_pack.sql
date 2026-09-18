-- 0232_client_financial_pack — #660 (refresh spec #612, journey B2): THE CLIENT HOME'S MONEY.
-- Book cash and period profit, each with six points of history, as ONE client-scoped read over
-- the approved ledger — and the GOVERNED, VERSIONED CASH ACCOUNT SET that makes "which accounts
-- are cash?" a human's answer rather than the code's guess.
-- =====================================================================================
-- Spec of record: issue #660 — "展示准确的账面现金、期间利润与两条财务趋势". Domain words:
-- CONTEXT.md — "Cash account set", "Book cash", "Period profit", "Source watermark",
-- "Definition version".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. TWO relations (`clara.cash_account_set_versions`,
-- `clara.cash_account_set_members`) with one integrity trigger function serving two triggers,
-- and THREE doors: `clara.publish_client_cash_account_set` (the human authoring door, admin
-- floor, SECURITY DEFINER, op-key idempotent), `clara.propose_client_cash_accounts` (a STABLE
-- INVOKER read that names the structurally derivable candidates and nothing else) and
-- `clara.get_client_financial_pack` (the STABLE INVOKER read the client home draws). One event
-- pair. Grants to `clara_authenticated` and to nobody else.
--
-- THIS FILE RECUTS NOTHING. Five live bodies are read-only dependencies and are pinned by
-- sha256(prosrc) in the prestate and re-asserted byte-identical in the tail, so "additive" is a
-- CHECKED FACT rather than a claim.
--
-- =====================================================================================
-- WHY A NEW RELATION FAMILY RATHER THAN RIDING 0058'S ACCOUNT SETS.
--
-- The estate already has a governed, versioned, frozen account-set model
-- (`clara.account_sets` / `account_set_versions` / `account_set_version_members`, 0058:104-121)
-- and a writer for it, `clara.create_account_set_v1` (0058:363). It cannot express this
-- membership, and the reason is structural rather than stylistic.
--
-- That writer resolves membership through `clara._metric_selector_account_ids` (0058:344-358),
-- which filters `a.is_active` TWICE — once in the fail-closed explicit-element check, once in
-- the final aggregate — and REFUSES an explicitly named inactive account with CLR10
-- `selector_element_unresolved`. An inactive bank account that still carries a live balance is
-- exactly the population this ticket requires, so the one writer the estate has provably cannot
-- name it.
--
-- And relaxing that filter is not a local change. The freeze checks re-derive membership from
-- the stored shas (`clara.verify_account_set_version_freeze`, 0058:362) and
-- `0059_wave_e_delta_metrics_behavior.sql:251`'s evaluator-freeze tail never re-runs the
-- resolver, so widening `_metric_selector_account_ids` would change membership semantics for
-- EVERY account set in the estate SILENTLY. A new, separate family costs two tables; the
-- alternative costs a silent change to the delta-metric lane's meaning.
--
-- WHAT THE MEMBERSHIP IS INSTEAD. A row per account, carrying `member_reason` — one of
-- `bank_registry`, `declared_cash`, `declared_petty_cash`. There is NO `is_active` predicate
-- anywhere in this file, and that is the whole point. `member_reason` is also what makes "why is
-- this account cash?" answerable without a name heuristic: petty cash has NO structural marker
-- in this schema (`clara.coa_accounts` carries `account_type`, `special_acc_type`,
-- `account_class` — payable/receivable only — and `is_bank_account`, 0003:47-57 / 0038:252), and
-- `0121_f_a3_pr1b_agent_limb.sql:4749` is house law: "no name or code heuristic, ever —
-- structure and declared facts only". A human adds petty cash. `propose_client_cash_accounts`
-- never proposes it.
--
-- =====================================================================================
-- NO AGENT TWIN, AND THAT IS A DEPARTURE FROM A LIVE PRECEDENT — STATED, NOT HIDDEN.
--
-- `clara.create_account_set_v1` HAS an agent twin: `clara._agent_create_account_set_core`
-- (0113:145-165) behind `clara.wake_create_account_set` (0115:79-97), EXECUTE to
-- `clara_wake_interactive` (0116:94-112) and allowlisted at 0116:124.
-- `clara.publish_client_cash_account_set` gets NO `_for` twin, NO wake wrapper and NO allowlist
-- row, and NO door in this file reaches `clara_runtime`, `clara_agent_ro` or any `clara_wake_*`
-- role.
--
-- The precedent does not carry. That twin belongs to the METRIC lane, which
-- `0059_wave_e_delta_metrics_behavior.sql:251` deliberately walls off from `journal_entries`,
-- `journal_lines` and `clara.trial_balance_as_of` — a model proposing a metric selector is
-- proposing a definition over a fact table it cannot read. This door writes the membership that
-- the client home's BOOK CASH is summed over, directly against the approved ledger. And the one
-- member reason a model could not derive at all is the one that matters most here: petty cash
-- has no derivable structural basis whatsoever (0121:4749). A twin would therefore be a lane
-- that can only ever propose the half a human did not need help with.
--
-- =====================================================================================
-- ONE DEFINITION FOR BOOK CASH, AND THE COMPUTE SHAPE IS A MEASUREMENT.
--
-- `clara.trial_balance_as_of(p_client, p_as_of)` (0017:3572-3586) already IS the estate's one
-- definition: `sum(debit_cents) - sum(credit_cents)` over lines whose entry is `approved` and
-- whose `posting_date <= p_as_of`, cumulative from inception, with NO fiscal-year reset and NO
-- `is_opening_balance` special case (so an approved opening lands exactly once). This pack needs
-- SEVEN such evaluations per call (six cash points plus the composition as-of), and seven calls
-- was measured against one filtered pass on this rig on a 6,000-line corpus:
--
--     seven trial_balance_as_of calls  : 18.12 ms total, 2,008 shared buffer hits
--     one pass, six filter() aggregates:  2.04 ms,         176 shared buffer hits   (8.87x)
--
-- On the heaviest read on the client home, polled every 30 s while visible, 8.87x is material.
-- The cash arm is therefore ONE scan carrying six `filter (where je.posting_date <= point_k)`
-- aggregates — and because that is a SECOND spelling of a shared definition, this file's tail
-- asserts the arm from `prosrc`: `status = 'approved'` present, a `posting_date <=` bound
-- present, `is_opening_balance` ABSENT (no opening special case) and `fiscal_year` ABSENT (no FY
-- reset). The protection pattern is 0057:1878-1906's token-set assertion over
-- `trial_balance_as_of` itself. The behavioural half is `p660.pack.matches_trial_balance`, which
-- proves the pack's cash EQUALS the member sum of `clara.trial_balance_as_of` at the same as-of
-- — the cell that makes "one definition" checkable rather than claimed.
--
-- =====================================================================================
-- THE PROFIT EXCLUSION IS THE ESTATE'S EXISTING ONE, SPELLED VERBATIM.
--
-- `not (e.is_year_end and e.closing_transfer)` — the live SST evaluator's own predicate
-- (0016:602), whose design note (0016:45-49) states why the PAIR is required: a year-end revenue
-- CORRECTION carries `is_year_end` and must still count, and `is_year_end` alone is
-- caller-supplied from `p_flags` (0004:190, 0005:1039). The tail asserts that literal is present
-- in this body.
--
-- AND THE HISTORY THIS PREDICATE CANNOT SEE IS DISCLOSED, NOT REPAIRED. Entries finalised before
-- 0120 stayed `closing_transfer = false` "forever" (0120:518-521) and 0016:211-219's
-- `closing_transfer_review` notification was never discharged by any migration. This read
-- therefore carries a SEPARATE, PRECISE detector: an approved entry inside the period with
-- `closing_transfer = false` AND (`close_receipt_id is not null` — only `finalize_close` births
-- one, asserted structurally at 0056:3010-3024 — OR a `reversal_of` naming an entry that has
-- one, which is the reopen mirror, 0120:797-814) drives `coverage = 'partial'` with reason
-- `closing_transfer_unmarked_history`.
--
-- THE DETECTED ROWS ARE NOT ALSO EXCLUDED. A second, wider exclusion inside one read would make
-- two reads of one ledger disagree; the exclusion predicate stays the estate's one definition and
-- the read says what it cannot vouch for. The detector's OWN limit is named here rather than
-- implied: a close finalised before `close_receipt_id` existed (pre-0056) carries neither marker
-- and is undetectable, and this read cannot see it.
--
-- =====================================================================================
-- WHY SECURITY INVOKER ON BOTH READS, AND WHY THE FLOOR IS VIEWER.
--
-- Every relation both reads touch is already SELECT-granted to the whole `clara_authenticated`
-- role behind its own FORCED, firm-scoped RLS predicate: `journal_entries`, `journal_lines` and
-- `coa_accounts` at 0003:522-525, whose human policy (0003:514) filters by FIRM ONLY — there is
-- no role-rank distinction at either layer. A viewer can therefore already `SELECT` every row
-- these reads aggregate. Flooring the pack above viewer would not protect a single fact; it
-- would only take the client home's money band away from the people who read it most.
--
-- The two new relations are granted SELECT to `clara_authenticated` and ZERO INSERT/UPDATE/DELETE
-- to any non-owner role, which is what keeps the pack honestly INVOKER: the only way a row enters
-- them is the admin-floored DEFINER door.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO.
--
--   · Repairs NO historical `closing_transfer` row. The affected count is a release-time read.
--   · Mints NO `clara.account_sets` or `clara.metric_definitions` row.
--   · Adds NO receivable/payable key. Those tiles are #669's, over this same envelope.
--   · Builds NO trial-balance or general-ledger surface. `composition[].entries[]` addresses ONE
--     journal entry each; the account-filtered ledger is #670's.
--   · Widens NO `clara.accounting_work.purpose` value (0194:230, 0195:1711, census 0194:2180).
--   · Reconciles NOTHING against a sealed `clara.period_snapshots` artifact (#672 owns whether a
--     sealed report and this live pack must agree; they may legitimately diverge and this read
--     hides neither).
--   · Reads NO `clara.bank_statements` column. A statement closing balance is a THIRD PARTY's
--     claim about an account; book cash is this ledger's. They are different numbers with
--     different owners (#657/#675) and one never substitutes for or is summed into the other —
--     asserted from `prosrc` in the tail.
--
-- FRONTEND HOME (apps/web):
--   clara.get_client_financial_pack(...)    -> apps/web/lib/dashboard/financial-pack.ts
--   clara.propose_client_cash_accounts(...) -> apps/web/components/firm/client-home/
--   clara.publish_client_cash_account_set(...)  client-cash-set-dialog.tsx
-- =====================================================================================

do $p660_pre$
declare
  v_missing text;
  v_sha text;
  v_name text;
begin
  -- THE RELATION PRECONDITIONS. Each one is a shape this file's bodies read at, named
  -- individually so a failure says which migration has not applied rather than "something".
  if to_regclass('clara.coa_accounts') is null then
    raise exception 'client_financial_pack prestate: clara.coa_accounts is absent (0003 has not applied)'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'coa_accounts' and column_name = 'account_id'
  ) then
    raise exception 'client_financial_pack prestate: clara.coa_accounts has no account_id surrogate (0058 has not applied) -- set membership has nothing stable to reference'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.coa_accounts'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) like '%account_id%firm_id%client_id%'
  ) then
    raise exception 'client_financial_pack prestate: clara.coa_accounts has no (account_id, firm_id, client_id) unique -- the members FK cannot be written'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'coa_accounts' and column_name = 'is_bank_account'
  ) then
    raise exception 'client_financial_pack prestate: clara.coa_accounts.is_bank_account is absent (0038 has not applied) -- the proposal read has no structural candidate at all'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'journal_entries' and column_name = 'closing_transfer'
  ) then
    raise exception 'client_financial_pack prestate: clara.journal_entries.closing_transfer is absent (0016 has not applied) -- profit has no exclusion marker'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'journal_entries' and column_name = 'close_receipt_id'
  ) then
    raise exception 'client_financial_pack prestate: clara.journal_entries.close_receipt_id is absent (0056 has not applied) -- the unmarked-history detector has no precise probe'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.opening_seed_registry') is null then
    raise exception 'client_financial_pack prestate: clara.opening_seed_registry is absent (0017 has not applied) -- the coverage floor has no first source'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.event_types') is null or to_regclass('clara.trigger_taxonomy') is null then
    raise exception 'client_financial_pack prestate: the event taxonomy pair is absent'
      using errcode = 'CLR10';
  end if;

  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array['jwt_sub','jwt_firm','actor_role_rank','role_rank','_human_ctx',
                               '_reserve_op','_finish_op','_audit','_append_event','_hash',
                               'trial_balance_as_of']) as t(n)
     where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'clara' and p.proname = t.n)
  ) x;
  if v_missing is not null then
    raise exception 'client_financial_pack prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- THE OVERLOAD WALL. `get_client_*` is a crowded prefix in this schema and a second pg_proc
  -- row under one of these names would be a SECOND surface with a second argument list nothing
  -- in this file argues for. The check is per NAME, not per signature, so an overload at ANY
  -- signature is caught. (0103:1054-1070 is the idiom; its census covers only the eleven names
  -- 0103 installs, so this file writes its own.)
  foreach v_name in array array['publish_client_cash_account_set','propose_client_cash_accounts',
                                'get_client_financial_pack','_tf_cash_account_set_integrity'] loop
    if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                where ns.nspname = 'clara' and p.proname = v_name) then
      raise exception 'client_financial_pack prestate: clara.% already exists', v_name
        using errcode = 'CLR10';
    end if;
  end loop;
  if to_regclass('clara.cash_account_set_versions') is not null
     or to_regclass('clara.cash_account_set_members') is not null then
    raise exception 'client_financial_pack prestate: a cash_account_set relation already exists'
      using errcode = 'CLR10';
  end if;

  -- =========================================================================================
  -- THE FIVE PINS, AND THE ARGUMENTS THEY PROTECT.
  --
  -- MEASURED, NEVER TRANSCRIBED (WORK-ORDER rule 8; the 0214:202-224 paragraph this copies):
  -- every sha below is sha256 of the LIVE `prosrc` read off `pg_proc` on the migrated rig
  -- clara_660 at frontier 0224 (PostgreSQL 17.11), NOT copied from the creating file's text.
  -- Several live bodies in this estate are prosrc SPLICES rather than their creating file's
  -- text, so a transcribed pin does not match and this migration refuses to apply. That is the
  -- design: if a pin mismatches, STOP and re-derive the argument against the live body rather
  -- than re-pinning to whatever is live.
  --
  --   trial_balance_as_of          — the pack's cash arm is a SECOND spelling of this body's
  --                                  definition. If this moves, "one definition" is no longer
  --                                  true and p660.pack.matches_trial_balance's meaning changes.
  --   _metric_selector_account_ids — the "a new relation family" argument rests on this body
  --                                  filtering `is_active` twice and refusing an explicitly
  --                                  named inactive account. If it is ever relaxed, that
  --                                  argument has to be re-made rather than inherited.
  --   create_account_set_v1        — the writer this file deliberately does NOT ride, and the
  --                                  admin floor this file's publish door copies (0058:369).
  --   finalize_close               — the ONE writer that births `close_receipt_id`
  --                                  (0056:3010-3024), which is the unmarked-history detector's
  --                                  precise probe.
  --   reopen_fiscal_year           — the mirror that copies `closing_transfer` through but NOT
  --                                  `close_receipt_id` (0120:797-814), which is why the
  --                                  detector's second arm follows `reversal_of`.
  -- =========================================================================================
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.trial_balance_as_of(uuid,date)'::regprocedure;
  if v_sha <> '51f18cba8b3d1fb4e225b83773803ea340b7b492a7647d50304589a86922c63c' then
    raise exception 'client_financial_pack prestate: clara.trial_balance_as_of has DRIFTED from its pinned body (sha %) -- the pack''s single-pass cash arm is a second spelling of THAT definition; re-derive it against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._metric_selector_account_ids(uuid,jsonb)'::regprocedure;
  if v_sha <> 'c8f32cd986403f94c0943e147a1ffe207b7e770843b9b6fbb2b9765cec04b1e9' then
    raise exception 'client_financial_pack prestate: clara._metric_selector_account_ids has DRIFTED from its pinned body (sha %) -- the "the 0058 writer cannot express this membership" argument must be re-derived against the live body', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)'::regprocedure;
  if v_sha <> '25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495' then
    raise exception 'client_financial_pack prestate: clara.create_account_set_v1 has DRIFTED from its pinned body (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_sha <> '59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4' then
    raise exception 'client_financial_pack prestate: clara.finalize_close has DRIFTED from its pinned body (sha %) -- the unmarked-history detector''s "only finalize_close births close_receipt_id" probe must be re-derived', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha <> '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5' then
    raise exception 'client_financial_pack prestate: clara.reopen_fiscal_year has DRIFTED from its pinned body (sha %) -- the reopen-mirror arm of the detector must be re-derived', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#660 prestate: clean -- the 0003/0016/0017/0038/0056/0058 shapes are present, no cash-account-set relation or door exists at any signature, and all five read-only dependency bodies are at their pinned (measured) bodies.';
end $p660_pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- THE GOVERNED, VERSIONED CASH ACCOUNT SET. Shaped on 0058:104-121 — the estate's own
-- versioned-membership idiom — minus everything that made that family unable to express this
-- population, and with `member_reason` added so "why is this cash?" is answerable from data.
-- ==============================================================================================
create table clara.cash_account_set_versions (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null references clara.firms(id),
  client_id          uuid not null,
  revision           int not null check (revision > 0),
  state              text not null check (state in ('published','superseded')),
  effective_from     date not null,
  effective_to       date,
  member_count       int not null check (member_count >= 0),
  members_sha256     bytea not null check (octet_length(members_sha256) = 32),
  -- The DEFINITION VERSION this membership was authored under. Distinct from the 0058 delta
  -- lane's metric-definition version, of which this file mints none.
  definition_version text not null,
  created_by         uuid not null references clara.users(id),
  created_at         timestamptz not null default now(),
  created_xid        xid8 not null default pg_current_xact_id(),
  foreign key (client_id, firm_id) references clara.clients(id, firm_id),
  unique (id, firm_id, client_id),
  unique (client_id, revision),
  check ((state = 'published' and effective_to is null)
         or (state = 'superseded' and effective_to >= effective_from))
);
-- Exactly one open version per client, enforced by an index rather than by the trigger alone
-- (0058:116's `uq_account_set_versions_current` idiom).
create unique index uq_cash_account_set_versions_current
  on clara.cash_account_set_versions(client_id) where state = 'published';

create table clara.cash_account_set_members (
  cash_account_set_version_id uuid not null,
  firm_id                     uuid not null references clara.firms(id),
  client_id                   uuid not null,
  account_id                  uuid not null,
  ordinal                     int not null check (ordinal >= 0),
  -- THE WHOLE POINT OF THE COLUMN. `bank_registry` is derivable (clara.coa_accounts
  -- .is_bank_account, minted only by add_bank_account / remap_bank_account_coa — the two-writer
  -- census is stated as a measurement at 0121:4721-4722). The other two are NOT derivable from
  -- anything in this schema and are a human's declaration, which is exactly why they are stored
  -- as a reason rather than inferred from a name or a code (0121:4749).
  member_reason               text not null
    check (member_reason in ('bank_registry','declared_cash','declared_petty_cash')),
  primary key (cash_account_set_version_id, account_id),
  unique (cash_account_set_version_id, ordinal),
  foreign key (cash_account_set_version_id, firm_id, client_id)
    references clara.cash_account_set_versions(id, firm_id, client_id),
  -- NO is_active PREDICATE ANYWHERE, HERE OR IN ANY READ BELOW. An inactive bank account with a
  -- live balance is a member, and the whole reason this family exists rather than 0058's is that
  -- 0058's resolver refuses to say so (0058:344-358).
  foreign key (account_id, firm_id, client_id)
    references clara.coa_accounts(account_id, firm_id, client_id)
);
create index ix_cash_account_set_members_version
  on clara.cash_account_set_members(cash_account_set_version_id, ordinal);

comment on table clara.cash_account_set_versions is
  '#660. A client''s governed, versioned CASH ACCOUNT SET: which chart accounts count as book '
  'cash, from when, decided by a human through clara.publish_client_cash_account_set and by no '
  'other path. Exactly one published row per client (uq_cash_account_set_versions_current) and '
  'contiguous, non-overlapping windows (clara._tf_cash_account_set_integrity). Deliberately NOT '
  'clara.account_set_versions: that family resolves membership through '
  'clara._metric_selector_account_ids, which filters is_active twice and refuses an explicitly '
  'named inactive account (0058:344-358) -- exactly the population this set must contain.';
comment on table clara.cash_account_set_members is
  '#660. One row per account in a cash-account-set version, ordered by ordinal, each carrying the '
  'REASON it is cash: bank_registry (structural, clara.coa_accounts.is_bank_account), '
  'declared_cash or declared_petty_cash (a human''s declaration -- petty cash has NO structural '
  'marker in this schema and 0121:4749 forbids a name or code heuristic). No is_active predicate '
  'exists on this relation or on any read of it.';

-- ==============================================================================================
-- clara._tf_cash_account_set_integrity — 0058:362's pattern: ONE trigger function serving two
-- triggers, so the "sealed to the creating transaction" rule and the "exactly one contiguous
-- window" rule cannot drift apart.
-- ==============================================================================================
create function clara._tf_cash_account_set_integrity() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_version uuid;
  v         record;
  v_ids     uuid[];
  v_n       int;
  v_bad     int;
  v_sha     bytea;
begin
  if tg_relid = 'clara.cash_account_set_members'::regclass then
    -- (a) MEMBERS ARE SEALED TO THE CREATING TRANSACTION. A later INSERT would silently change
    -- the membership a published figure was computed over, with no new revision to point at.
    select * into v from clara.cash_account_set_versions where id = new.cash_account_set_version_id;
    if not found or v.created_xid <> pg_current_xact_id() then
      raise exception 'cash-account-set members are sealed after version creation'
        using errcode = 'CLR08',
        detail = '{"reason":"cash_set_members_sealed"}';
    end if;
    return new;
  end if;

  -- (b) THE VERSION ROW, checked after the whole transaction's members are in (this trigger is
  -- DEFERRABLE INITIALLY DEFERRED on the versions table).
  v_version := new.id;
  select * into strict v from clara.cash_account_set_versions where id = v_version;

  select coalesce(array_agg(m.account_id order by m.ordinal), '{}'::uuid[]),
         count(*)::int,
         count(*) filter (where m.ordinal <> m.ro - 1)::int
    into v_ids, v_n, v_bad
    from (select account_id, ordinal, row_number() over (order by ordinal) as ro
            from clara.cash_account_set_members
           where cash_account_set_version_id = v_version) m;

  v_sha := clara._hash(to_jsonb(v_ids));
  if v_bad <> 0 or v_n <> v.member_count or v_sha <> v.members_sha256 then
    raise exception 'cash-account-set frozen corpus does not reconstruct'
      using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'cash_set_integrity_mismatch',
                                  'version_id', v_version,
                                  'actual_count', v_n,
                                  'stored_count', v.member_count)::text;
  end if;

  -- EXACTLY ONE PUBLISHED ROW PER CLIENT, and contiguous non-overlapping windows with exactly
  -- one open right edge. Without this, "the version whose window contains the as-of" would be an
  -- ambiguous question and the six points of one trend could silently use two memberships.
  if (select count(*) from clara.cash_account_set_versions
       where client_id = v.client_id and state = 'published') <> 1
     or exists (select 1 from clara.cash_account_set_versions a
                  join clara.cash_account_set_versions b
                    on a.client_id = b.client_id and a.id < b.id
                 where a.client_id = v.client_id
                   and a.effective_from <= coalesce(b.effective_to, 'infinity'::date)
                   and b.effective_from <= coalesce(a.effective_to, 'infinity'::date))
     or exists (select 1 from (
                  select effective_from,
                         lag(effective_to) over (order by effective_from, revision) as prior_to,
                         row_number() over (order by effective_from, revision) as rn
                    from clara.cash_account_set_versions where client_id = v.client_id) q
                 where q.rn > 1 and (q.prior_to is null or q.effective_from <> q.prior_to + 1)) then
    raise exception 'cash-account-set effective versions are not exactly-one contiguous windows'
      using errcode = 'CLR11',
      detail = '{"reason":"effective_version_ambiguity"}';
  end if;
  return null;
end $$;
revoke all on function clara._tf_cash_account_set_integrity() from public;

create constraint trigger t_cash_account_set_version_integrity
  after insert or update on clara.cash_account_set_versions
  deferrable initially deferred for each row
  execute function clara._tf_cash_account_set_integrity();
create trigger t_cash_account_set_member_integrity
  before insert on clara.cash_account_set_members
  for each row execute function clara._tf_cash_account_set_integrity();

-- ==============================================================================================
-- clara.publish_client_cash_account_set — the ONE way a row enters either relation. SECURITY
-- DEFINER, admin floor (the floor clara.create_account_set_v1 uses, 0058:369), op-key idempotent.
--
-- p_members IS ONE jsonb ARRAY of {"account_id": uuid, "member_reason": text}, AND ITS ORDER IS
-- THE ORDINAL. Two parallel arrays would make a length mismatch a runtime class of bug; one array
-- makes it unrepresentable, and jsonb is 0058's own argument idiom.
-- ==============================================================================================
create function clara.publish_client_cash_account_set(
  p_client         uuid,
  p_members        jsonb,
  p_effective_from date,
  p_op_key         text
) returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp as $$
declare
  c         record;
  prior     jsonb;
  v_today   date;
  v_from    date;
  v_books   date;
  v_next    int;
  v_cur_id  uuid;
  v_cur_from date;
  v_version uuid;
  v_ids     uuid[];
  v_n       int;
  v_sha     bytea;
begin
  c := clara._human_ctx(clara.role_rank('admin'));

  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;
  perform 1 from clara.clients where id = p_client and firm_id = c.firm;
  if not found then
    raise exception 'client not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'client_not_in_firm')::text;
  end if;

  -- RESERVE BEFORE EFFECT, over a hash covering ALL THREE payload arguments. A replay under one
  -- op_key returns the same version and mints no second revision; the same key with a different
  -- payload is the house receipt-hash CLR10 (0004:46).
  prior := clara._reserve_op(c.firm, 'publish_client_cash_account_set', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'members', p_members,
                                   'effective_from', p_effective_from)));
  if prior is not null then return prior; end if;

  if jsonb_typeof(p_members) is distinct from 'array' then
    raise exception 'members must be a jsonb array of {account_id, member_reason}'
      using errcode = 'CLR10', detail = '{"reason":"members_malformed"}';
  end if;
  if jsonb_array_length(p_members) = 0 then
    raise exception 'a cash account set names at least one account'
      using errcode = 'CLR10', detail = '{"reason":"cash_set_empty"}';
  end if;
  if exists (select 1 from jsonb_array_elements(p_members) e
              where jsonb_typeof(e.value) <> 'object'
                 or e.value->>'account_id' is null
                 or e.value->>'member_reason' is null
                 or (e.value->>'account_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then
    raise exception 'every member is an object with an account_id uuid and a member_reason'
      using errcode = 'CLR10', detail = '{"reason":"members_malformed"}';
  end if;
  if exists (select 1 from jsonb_array_elements(p_members) e
              where (e.value->>'member_reason')
                not in ('bank_registry','declared_cash','declared_petty_cash')) then
    raise exception 'member_reason is one of bank_registry, declared_cash, declared_petty_cash'
      using errcode = 'CLR10', detail = '{"reason":"member_reason_invalid"}';
  end if;

  select array_agg((e.value->>'account_id')::uuid order by e.ord), count(*)::int
    into v_ids, v_n
    from jsonb_array_elements(p_members) with ordinality e(value, ord);
  if v_n <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'an account is named twice'
      using errcode = 'CLR10', detail = '{"reason":"duplicate_account"}';
  end if;
  -- NO is_active FILTER. An inactive account of this client is a legitimate member.
  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from clara.coa_accounts a
                                 where a.account_id = x and a.client_id = p_client
                                   and a.firm_id = c.firm)) then
    raise exception 'a named account does not belong to this client'
      using errcode = 'CLR10', detail = '{"reason":"account_not_of_client"}';
  end if;

  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  select v.id, v.effective_from into v_cur_id, v_cur_from
    from clara.cash_account_set_versions v
   where v.client_id = p_client and v.state = 'published';

  if v_cur_id is null then
    -- THE FIRST VERSION, AND THE TRAP THIS DOOR EXISTS TO PREVENT. A first version whose
    -- effective_from is later than the client's earliest approved posting_date makes EVERY
    -- historic month unreadable -- the six-point trend would resolve no version at those points
    -- and report cash_set_unpublished for books that plainly exist. A null therefore stamps the
    -- BOOKS' OWN START, and a stated date after it is refused by name rather than accepted and
    -- silently disclosed later.
    select least(
             (select min(s.as_of) from clara.opening_seed_registry s
               where s.client_id = p_client and s.state = 'finalized'),
             (select min(e.posting_date) from clara.journal_entries e
               where e.client_id = p_client and e.status = 'approved'))
      into v_books;
    v_from := coalesce(p_effective_from, v_books, v_today);
    if v_books is not null and v_from > v_books then
      raise exception 'the first cash-account-set version must cover the books it will be read over'
        using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'first_version_after_books_start',
                                    'books_start', v_books, 'requested', v_from)::text;
    end if;
    v_next := 1;
  else
    if p_effective_from is null then
      raise exception 'a later version states the date it takes effect'
        using errcode = 'CLR10', detail = '{"reason":"effective_from_required"}';
    end if;
    v_from := p_effective_from;
    if v_from <= v_cur_from then
      raise exception 'a new version takes effect strictly after the current one'
        using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'effective_from_not_after_current',
                                    'current_effective_from', v_cur_from)::text;
    end if;
    select coalesce(max(revision), 0) + 1 into v_next
      from clara.cash_account_set_versions where client_id = p_client;
    update clara.cash_account_set_versions
       set state = 'superseded', effective_to = v_from - 1
     where id = v_cur_id;
  end if;

  v_sha := clara._hash(to_jsonb(v_ids));
  insert into clara.cash_account_set_versions(
      firm_id, client_id, revision, state, effective_from, member_count, members_sha256,
      definition_version, created_by)
    values (c.firm, p_client, v_next, 'published', v_from, v_n, v_sha,
            'clara.cash-account-set/v1', c.actor)
    returning id into v_version;

  insert into clara.cash_account_set_members(
      cash_account_set_version_id, firm_id, client_id, account_id, ordinal, member_reason)
    select v_version, c.firm, p_client, (e.value->>'account_id')::uuid, (e.ord - 1)::int,
           e.value->>'member_reason'
      from jsonb_array_elements(p_members) with ordinality e(value, ord);

  perform clara._audit(c.firm, c.actor, null, null, 'publish_client_cash_account_set', null,
    jsonb_build_object('client', p_client, 'version', v_version, 'revision', v_next,
                       'member_count', v_n, 'effective_from', v_from));
  perform clara._append_event(c.firm, 'client.financial_cash_set_published', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('cash_account_set_version_id', v_version, 'revision', v_next,
                       'member_count', v_n, 'effective_from', v_from));

  return clara._finish_op(c.firm, 'publish_client_cash_account_set', p_op_key,
    jsonb_build_object('cash_account_set_version_id', v_version,
                       'revision', v_next,
                       'member_count', v_n,
                       'effective_from', v_from,
                       'definition_version', 'clara.cash-account-set/v1'));
end $$;

comment on function clara.publish_client_cash_account_set(uuid, jsonb, date, text) is
  '#660 B2. Publishes a client''s governed, versioned CASH ACCOUNT SET -- which chart accounts '
  'count as book cash, from when. SECURITY DEFINER, admin floor (clara._human_ctx('
  'clara.role_rank(''admin'')), the floor clara.create_account_set_v1 uses), op-key idempotent '
  'over all three payload arguments. p_members is ONE jsonb array of {account_id, member_reason} '
  'and ITS ORDER IS THE ORDINAL; member_reason is bank_registry | declared_cash | '
  'declared_petty_cash. NO is_active filter: an inactive account of this client is a legitimate '
  'member, which is exactly what clara.create_account_set_v1 provably cannot express '
  '(0058:344-358). A first version with a null p_effective_from is stamped at the books'' own '
  'start (earliest finalized opening seed, else earliest approved posting_date, else today MYT); '
  'a first version dated AFTER that start is refused first_version_after_books_start, because it '
  'would make every historic month unreadable. A later version supersedes the current one with '
  'effective_to = p_effective_from - 1. NO agent twin, no wake wrapper and no allowlist row -- a '
  'deliberate departure from clara.wake_create_account_set (0115:79-97), argued in 0232''s '
  'header. EXECUTE to clara_authenticated only.';

-- ==============================================================================================
-- clara.propose_client_cash_accounts — the read that says which accounts COULD be cash. STABLE
-- SECURITY INVOKER, viewer floor. It PROPOSES; it never publishes, and it NEVER proposes petty
-- cash under any account name or code (0121:4749 -- structure and declared facts only).
-- ==============================================================================================
create function clara.propose_client_cash_accounts(p_client uuid) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp as $$
declare
  c       record;
  v_today date;
  v_set   uuid;
  v_rows  jsonb;
begin
  -- THE INLINE FLOOR, restating 0214:262-274's three predicates at VIEWER rank: an INVOKER body
  -- cannot call clara._human_ctx (an internal helper with no application-role EXECUTE grant), so
  -- it asks the helpers that ARE granted.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('viewer') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;

  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  select v.id into v_set from clara.cash_account_set_versions v
   where v.client_id = p_client and v.state = 'published';

  -- ONLY THE STRUCTURALLY DERIVABLE CANDIDATE EXISTS: clara.coa_accounts.is_bank_account, minted
  -- by add_bank_account / remap_bank_account_coa alone (0121:4721-4722) and never cleared on
  -- deactivation. ACTIVE OR INACTIVE -- an account retired last year still holds the balance it
  -- held, and hiding it here is how a cash set silently loses a member.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.account_code), '[]'::jsonb) into v_rows
    from (
      select a.account_id    as account_id,
             a.account_code  as account_code,
             a.name          as name,
             a.is_active     as is_active,
             'bank_registry'::text as member_reason,
             coalesce((select sum(jl.debit_cents - jl.credit_cents)
                         from clara.journal_lines jl
                         join clara.journal_entries je on je.id = jl.entry_id
                        where jl.client_id = p_client
                          and jl.account_code = a.account_code
                          and je.status = 'approved'
                          and je.posting_date <= v_today), 0)::bigint as balance_cents,
             (v_set is not null and exists (
                select 1 from clara.cash_account_set_members m
                 where m.cash_account_set_version_id = v_set
                   and m.account_id = a.account_id))  as already_member
        from clara.coa_accounts a
       where a.client_id = p_client
         and a.is_bank_account
    ) x;

  return jsonb_build_object(
    'computed_at',          now(),
    'as_of',                v_today::text,
    'timezone',             'Asia/Kuala_Lumpur',
    'unit',                 'minor_units',
    'currency',             'MYR',
    'definition_version',   'clara.client-financial-pack/v1',
    'published_version_id', v_set,
    'candidates',           v_rows,
    -- STATED ON THE WIRE, so the face can say it rather than invent it: petty cash has no
    -- structural marker in this schema and is never proposed. A human adds it, with the
    -- declared_petty_cash reason.
    'never_proposed',        jsonb_build_array('declared_cash', 'declared_petty_cash'),
    'never_proposed_reason', 'no structural marker exists for declared cash or petty cash; a human declares it (0121:4749)');
end $$;

comment on function clara.propose_client_cash_accounts(uuid) is
  '#660 B2. The read that says which accounts COULD be cash: every clara.coa_accounts row of the '
  'client carrying is_bank_account -- ACTIVE OR INACTIVE -- with its cumulative approved balance '
  'at today''s Asia/Kuala_Lumpur date and whether it is already a member of the live published '
  'version. STABLE SECURITY INVOKER over relations already clara_authenticated-granted behind '
  'forced firm-scoped RLS, floored at VIEWER inline. It PROPOSES; it never writes. It NEVER '
  'proposes declared cash or petty cash under any account name or code: neither has a structural '
  'marker in this schema and 0121:4749 forbids a name or code heuristic -- a human declares them. '
  'EXECUTE to clara_authenticated only.';

-- ==============================================================================================
-- clara.get_client_financial_pack — the client home's money band. STABLE SECURITY INVOKER,
-- viewer floor, plan_cache_mode pinned (0214:238-240). ONE read; four faces of one envelope.
-- ==============================================================================================
create function clara.get_client_financial_pack(
  p_client uuid,
  p_as_of  date default null,
  p_month  date default null
) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  c              record;
  v_now          timestamptz := now();
  v_today        date;
  v_as_of        date;
  v_start        date;
  v_month_end    date;
  v_watermark    text;
  v_visible      boolean;
  v_floor        date;
  v_carry_down   boolean := false;

  v_points       date[];
  v_prev_end     date;
  v_c1 bigint; v_c2 bigint; v_c3 bigint; v_c4 bigint; v_c5 bigint; v_c6 bigint;
  v_cash_lines   int := 0;
  v_set_id       uuid;
  v_set_rev      int;
  v_set_from     date;
  v_set_count    int;
  v_cash_status  text;
  v_cash_cov     text;
  v_cash_reason  text;
  v_point_rows   jsonb := '[]'::jsonb;

  v_income       bigint;
  v_expense      bigint;
  v_income_p     bigint;
  v_expense_p    bigint;
  v_profit       bigint;
  v_profit_p     bigint;
  v_prev_start   date;
  v_prev_stop    date;
  v_unmarked     int := 0;
  v_pop          int := 0;
  v_pl_cov       text;
  v_pl_reason    text;
  v_pl_status    text;

  v_series       jsonb := '[]'::jsonb;
  v_series_start date;
  v_cash_comp    jsonb := '[]'::jsonb;
  v_profit_comp  jsonb := '[]'::jsonb;
begin
  -- THE INLINE FLOOR at VIEWER rank (0214:262-274's three predicates). See the header: every
  -- relation below is already table-SELECT-granted to the whole clara_authenticated role behind a
  -- FIRM-ONLY RLS predicate (0003:514, :522-525), so this read returns nothing a viewer could not
  -- already SELECT.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('viewer') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  -- A NULL CLIENT IS A CALLER DEFECT, NOT AN ANSWER (0214:276-281).
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;

  v_today := (v_now at time zone 'Asia/Kuala_Lumpur')::date;

  -- ==========================================================================================
  -- THE PERIOD. A future as-of is a CALLER DEFECT, never a silent clamp: "no future actuals" is
  -- a refusal, not a rounding. A month that is not a first day is the same.
  -- ==========================================================================================
  if p_month is not null then
    if p_month <> date_trunc('month', p_month)::date then
      raise exception 'a month is named by its first day' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'month_not_first_day', 'month', p_month)::text;
    end if;
    v_start     := p_month;
    v_month_end := (p_month + interval '1 month' - interval '1 day')::date;
    if p_as_of is null then
      v_as_of := least(v_month_end, v_today);
    else
      if p_as_of > v_today then
        raise exception 'an as-of in the future has no actuals' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_in_future', 'as_of', p_as_of,
                                      'today', v_today)::text;
      end if;
      if p_as_of < v_start or p_as_of > v_month_end then
        raise exception 'the as-of falls outside the named month' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_outside_month', 'as_of', p_as_of,
                                      'month', p_month)::text;
      end if;
      v_as_of := p_as_of;
    end if;
  else
    v_start     := date_trunc('month', v_today)::date;
    v_month_end := (v_start + interval '1 month' - interval '1 day')::date;
    if p_as_of is null then
      v_as_of := v_today;
    else
      if p_as_of > v_today then
        raise exception 'an as-of in the future has no actuals' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_in_future', 'as_of', p_as_of,
                                      'today', v_today)::text;
      end if;
      if p_as_of < v_start then
        raise exception 'the as-of falls outside the named month' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_outside_month', 'as_of', p_as_of,
                                      'month', v_start)::text;
      end if;
      v_as_of := p_as_of;
    end if;
  end if;

  -- SIX POINTS: five preceding month-ends plus the as-of. For a historic month the as-of IS that
  -- month's end, so the SAME expression yields six month-ends ending in the selected month.
  v_points := array[
    (date_trunc('month', v_as_of) - interval '4 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '3 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '2 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '1 month'  - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '1 day')::date,
    v_as_of];
  v_prev_end := v_points[5];

  -- ==========================================================================================
  -- NO ORACLE, IN EITHER DIRECTION. A client this caller cannot see under RLS and a uuid that
  -- names nothing at all answer IDENTICALLY. Anything else tells firm B that firm A holds a
  -- client with this id.
  -- ==========================================================================================
  select exists (select 1 from clara.clients cl where cl.id = p_client) into v_visible;

  -- THE COVERAGE FLOOR, one expression: the earliest FINALIZED opening seed, else the earliest
  -- approved posting_date, else no floor at all (an empty population).
  if v_visible then
    select min(s.as_of) into v_floor from clara.opening_seed_registry s
     where s.client_id = p_client and s.state = 'finalized';
    if v_floor is null then
      select min(e.posting_date) into v_floor from clara.journal_entries e
       where e.client_id = p_client and e.status = 'approved';
      -- A client activated on a DEFERRED carry-down (0017:2812-2821) knowingly has no captured
      -- opening. Say so rather than letting the earliest posted entry look like inception.
      --
      -- AND `first_year_zero_opening` OUTRANKS IT, which is the estate's OWN precedence rather
      -- than a new one: `components/registers/opening-position-gate.tsx:85, :95-97` returns the
      -- first-year-zero face BEFORE it ever looks at the deferred row, because a first-year zero
      -- opening has nothing to carry down -- the opening position is KNOWN, and known to be zero.
      -- A plan can legitimately carry both rows (the rig's own legacy-activation bridge answers
      -- `first_year_zero_opening` and resolves `carry_down_deferred` together,
      -- `tests/rig-fixtures.mjs:88-96`), so a detector that asked only about the carry-down row
      -- would report an absent opening for every client whose opening is fully known.
      select exists (
        select 1 from clara.onboarding_plans pl
          join clara.onboarding_plan_items it on it.plan_id = pl.id
         where pl.client_id = p_client and it.item_key = 'carry_down_deferred'
           and it.state in ('deferred','resolved'))
        and not exists (
        select 1 from clara.onboarding_plans pl
          join clara.onboarding_plan_items it on it.plan_id = pl.id
         where pl.client_id = p_client and it.item_key = 'first_year_zero_opening'
           and it.state in ('answered','resolved')) into v_carry_down;
    end if;
  end if;

  -- ==========================================================================================
  -- CASH. ONE cash-set version -- the one whose window contains the as-of -- applied to ALL SIX
  -- POINTS. A trend whose membership changes between points is not a trend.
  -- ==========================================================================================
  if not v_visible then
    v_cash_status := 'unknown'; v_cash_cov := 'unknown'; v_cash_reason := 'client_not_visible';
  else
    select v.id, v.revision, v.effective_from, v.member_count
      into v_set_id, v_set_rev, v_set_from, v_set_count
      from clara.cash_account_set_versions v
     where v.client_id = p_client
       and v.effective_from <= v_as_of
       and (v.effective_to is null or v.effective_to >= v_as_of);

    if v_set_id is null then
      -- NEVER 0. "We do not know which accounts are cash" and "cash is zero" are different
      -- answers, and printing the second for the first is the expensive way to be wrong here.
      v_cash_status := 'unknown'; v_cash_cov := 'unknown'; v_cash_reason := 'cash_set_unpublished';
    else
      -- THE SINGLE PASS. Six `filter (where je.posting_date <= point_k)` aggregates over ONE scan
      -- of the member accounts' lines. See the header for the measurement that chose this shape
      -- over seven clara.trial_balance_as_of calls, and the tail for the assertions that keep it
      -- the same definition: status = 'approved' present, a posting_date <= bound present, no
      -- is_opening_balance special case, no fiscal-year reset.
      select coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[1]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[2]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[3]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[4]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[5]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[6]), 0)::bigint,
             count(*)::int
        into v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_cash_lines
        from clara.cash_account_set_members m
        join clara.coa_accounts a
          on a.account_id = m.account_id and a.client_id = p_client
        join clara.journal_lines jl
          on jl.client_id = p_client and jl.account_code = a.account_code
        join clara.journal_entries je on je.id = jl.entry_id
       where m.cash_account_set_version_id = v_set_id
         and je.status = 'approved';

      v_cash_status := 'ok'; v_cash_cov := 'ok'; v_cash_reason := null;

      -- THE TWO COVERAGE FACTS, AND WHY THIS IS THE ORDER.
      --
      -- A point outside the resolved version's window is disclosed, not silently recomputed under
      -- a different membership -- but ONLY where there are books to be wrong about. A point before
      -- the coverage floor is outside EVERY version's window by construction (a first version is
      -- stamped at the books' own start), so checking the window first would make
      -- `cash_set_version_changed_in_series` the standing answer for every client whose books are
      -- younger than six months -- and it would be FALSE there, because in those series the set
      -- never changed at all. The window check therefore asks only about points that are IN
      -- COVERAGE; `pre_coverage` carries the rest. Both facts stay visible per point either way
      -- (`points[].reason`); this is which one the GROUP names when both are true of the series.
      if v_floor is not null
         and exists (select 1 from unnest(v_points) d where d >= v_floor and d < v_set_from) then
        v_cash_cov := 'partial'; v_cash_reason := 'cash_set_version_changed_in_series';
      elsif v_floor is not null and v_points[1] < v_floor then
        v_cash_cov := 'partial'; v_cash_reason := 'pre_coverage';
      end if;
      if v_carry_down then
        v_cash_cov := 'partial'; v_cash_reason := coalesce(v_cash_reason, 'opening_carry_down_deferred');
      end if;
      -- A COMPLETE READ OVER AN EMPTY POPULATION is ok + 0 + no_posted_entries -- the one case
      -- where a reason accompanies `ok`, so the face can say "no posted entries yet for this
      -- client" instead of printing RM 0.00 as if it were a fact about the money.
      if v_cash_lines = 0 and v_cash_cov = 'ok' then
        v_cash_reason := 'no_posted_entries';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
               'as_of',       p.d::text,
               'value_cents', case when v_floor is not null and p.d < v_floor then null
                                   else (array[v_c1, v_c2, v_c3, v_c4, v_c5, v_c6])[p.k] end,
               'available',   not (v_floor is not null and p.d < v_floor),
               'reason',      case when v_floor is not null and p.d < v_floor then 'pre_coverage'
                                   when p.d < v_set_from then 'cash_set_version_changed_in_series'
                                   else null end) order by p.k), '[]'::jsonb)
        into v_point_rows
        from unnest(v_points) with ordinality p(d, k);

      -- COMPOSITION. Per member account, the opening / movement / closing over the SELECTED
      -- PERIOD, and the movement's own entries -- CAPPED at 20 per account and 50 accounts per
      -- group. A cumulative opening is a number, not an enumerable population; the
      -- account-filtered ledger is #670's.
      select coalesce(jsonb_agg(to_jsonb(y) order by y.account_code), '[]'::jsonb) into v_cash_comp
        from (
          select a.account_id    as account_id,
                 a.account_code  as account_code,
                 a.name          as name,
                 m.member_reason as member_reason,
                 coalesce((select sum(jl.debit_cents - jl.credit_cents)
                             from clara.journal_lines jl
                             join clara.journal_entries je on je.id = jl.entry_id
                            where jl.client_id = p_client and jl.account_code = a.account_code
                              and je.status = 'approved' and je.posting_date < v_start), 0)::bigint
                   as opening_cents,
                 coalesce((select sum(jl.debit_cents - jl.credit_cents)
                             from clara.journal_lines jl
                             join clara.journal_entries je on je.id = jl.entry_id
                            where jl.client_id = p_client and jl.account_code = a.account_code
                              and je.status = 'approved'
                              and je.posting_date between v_start and v_as_of), 0)::bigint
                   as movement_cents,
                 coalesce((select sum(jl.debit_cents - jl.credit_cents)
                             from clara.journal_lines jl
                             join clara.journal_entries je on je.id = jl.entry_id
                            where jl.client_id = p_client and jl.account_code = a.account_code
                              and je.status = 'approved' and je.posting_date <= v_as_of), 0)::bigint
                   as closing_cents,
                 coalesce((select jsonb_agg(to_jsonb(r) order by r.ord)
                             from (select je.id as entry_id,
                                          je.posting_date::text as posting_date,
                                          je.memo as memo,
                                          sum(jl.debit_cents - jl.credit_cents)::bigint as amount_cents,
                                          row_number() over (
                                            order by abs(sum(jl.debit_cents - jl.credit_cents)) desc,
                                                     je.posting_date desc, je.id) as ord
                                     from clara.journal_lines jl
                                     join clara.journal_entries je on je.id = jl.entry_id
                                    where jl.client_id = p_client and jl.account_code = a.account_code
                                      and je.status = 'approved'
                                      and je.posting_date between v_start and v_as_of
                                    group by je.id, je.posting_date, je.memo
                                    order by abs(sum(jl.debit_cents - jl.credit_cents)) desc,
                                             je.posting_date desc, je.id
                                    limit 20) r), '[]'::jsonb) as entries,
                 (select count(distinct je.id)::int
                    from clara.journal_lines jl
                    join clara.journal_entries je on je.id = jl.entry_id
                   where jl.client_id = p_client and jl.account_code = a.account_code
                     and je.status = 'approved'
                     and je.posting_date between v_start and v_as_of) as entries_total,
                 (select count(distinct je.id)
                    from clara.journal_lines jl
                    join clara.journal_entries je on je.id = jl.entry_id
                   where jl.client_id = p_client and jl.account_code = a.account_code
                     and je.status = 'approved'
                     and je.posting_date between v_start and v_as_of) > 20 as entries_truncated
            from clara.cash_account_set_members m
            join clara.coa_accounts a on a.account_id = m.account_id and a.client_id = p_client
           where m.cash_account_set_version_id = v_set_id
           order by a.account_code
           limit 50) y;
    end if;
  end if;

  -- ==========================================================================================
  -- PROFIT. income = SUM(credit - debit) over account_type='income'; expense = SUM(debit -
  -- credit) over account_type='expense'; both over [period_start, as_of], approved, and
  -- EXCLUDING the estate's one closing-transfer predicate -- `not (je.is_year_end and
  -- je.closing_transfer)`, 0016:602 verbatim. Reversals and negative corrections are ordinary
  -- approved entries and move profit by their signed amount: there is no clamp anywhere in this
  -- body, which the tail asserts by the ABSENCE of any clamping function from the whole prosrc.
  -- ==========================================================================================
  if v_visible then
    v_prev_start := (date_trunc('month', v_start) - interval '1 month')::date;
    -- THE COMPARISON INTERVAL, CAPPED. An MTD run to the 31st compares against the prior month's
    -- LAST DAY when that month is shorter -- 2026-03-31 MTD compares 2026-02-01..2026-02-28,
    -- never a date that does not exist.
    v_prev_stop := least(
      (v_prev_start + ((v_as_of - v_start) * interval '1 day'))::date,
      (v_prev_start + interval '1 month' - interval '1 day')::date);

    select coalesce(sum(case when a.account_type = 'income'
                             then jl.credit_cents - jl.debit_cents else 0 end) filter (
                      where je.posting_date between v_start and v_as_of), 0)::bigint,
           coalesce(sum(case when a.account_type = 'expense'
                             then jl.debit_cents - jl.credit_cents else 0 end) filter (
                      where je.posting_date between v_start and v_as_of), 0)::bigint,
           coalesce(sum(case when a.account_type = 'income'
                             then jl.credit_cents - jl.debit_cents else 0 end) filter (
                      where je.posting_date between v_prev_start and v_prev_stop), 0)::bigint,
           coalesce(sum(case when a.account_type = 'expense'
                             then jl.debit_cents - jl.credit_cents else 0 end) filter (
                      where je.posting_date between v_prev_start and v_prev_stop), 0)::bigint,
           count(*) filter (where je.posting_date between v_start and v_as_of)::int
      into v_income, v_expense, v_income_p, v_expense_p, v_pop
      from clara.journal_lines jl
      join clara.journal_entries je on je.id = jl.entry_id
      join clara.coa_accounts a
        on a.client_id = jl.client_id and a.account_code = jl.account_code
     where jl.client_id = p_client
       and je.status = 'approved'
       and a.account_type in ('income','expense')
       and not (je.is_year_end and je.closing_transfer)
       and je.posting_date between v_prev_start and v_as_of;

    v_profit   := coalesce(v_income, 0) - coalesce(v_expense, 0);
    v_profit_p := coalesce(v_income_p, 0) - coalesce(v_expense_p, 0);

    -- THE UNMARKED-HISTORY DETECTOR, PRECISE AND SEPARATE FROM THE EXCLUSION. An approved entry
    -- inside the period with closing_transfer = false AND either its own close_receipt_id (only
    -- finalize_close births one, 0056:3010-3024) or a reversal_of naming an entry that has one
    -- (the reopen mirror, 0120:797-814). A plain is_year_end CORRECTION trips nothing -- that is
    -- the exact error 0016:45-49 names. THE DETECTED ROWS ARE NOT ALSO EXCLUDED: a second, wider
    -- exclusion inside one read would make two reads of one ledger disagree.
    select count(*)::int into v_unmarked from clara.journal_entries e
     where e.client_id = p_client
       and e.status = 'approved'
       and e.posting_date between v_start and v_as_of
       and e.closing_transfer = false
       and (e.close_receipt_id is not null
            or exists (select 1 from clara.journal_entries o
                        where o.id = e.reversal_of and o.close_receipt_id is not null));

    if v_unmarked > 0 then
      v_pl_cov := 'partial'; v_pl_reason := 'closing_transfer_unmarked_history';
    elsif v_pop = 0 then
      v_pl_cov := 'ok'; v_pl_reason := 'no_posted_entries';
    else
      v_pl_cov := 'ok'; v_pl_reason := null;
    end if;
    v_pl_status := 'ok';

    -- SERIES: six calendar months ending in the month of the as-of, each with its own income,
    -- expense and profit. The month containing the as-of is `partial` and carries its exact
    -- as-of, so a reader can never mistake a part-month for a whole one.
    v_series_start := (date_trunc('month', v_as_of) - interval '5 months')::date;
    select coalesce(jsonb_agg(jsonb_build_object(
             'month',         m.d::date::text,
             'income_cents',  s.inc,
             'expense_cents', s.exp,
             'profit_cents',  s.inc - s.exp,
             'partial',       m.d::date = date_trunc('month', v_as_of)::date
                              and v_as_of < (m.d + interval '1 month' - interval '1 day')::date,
             'as_of',         least((m.d + interval '1 month' - interval '1 day')::date, v_as_of)::text
           ) order by m.d), '[]'::jsonb)
      into v_series
      from generate_series(v_series_start::timestamp,
                           date_trunc('month', v_as_of)::timestamp,
                           interval '1 month') m(d)
      cross join lateral (
        select coalesce(sum(case when a.account_type = 'income'
                                 then jl.credit_cents - jl.debit_cents else 0 end), 0)::bigint as inc,
               coalesce(sum(case when a.account_type = 'expense'
                                 then jl.debit_cents - jl.credit_cents else 0 end), 0)::bigint as exp
          from clara.journal_lines jl
          join clara.journal_entries je on je.id = jl.entry_id
          join clara.coa_accounts a
            on a.client_id = jl.client_id and a.account_code = jl.account_code
         where jl.client_id = p_client
           and je.status = 'approved'
           and a.account_type in ('income','expense')
           and not (je.is_year_end and je.closing_transfer)
           and je.posting_date >= m.d::date
           and je.posting_date <= least((m.d + interval '1 month' - interval '1 day')::date, v_as_of)
      ) s;

    -- PROFIT COMPOSITION: per income/expense account over the selected period, with its capped
    -- movement entries. Each entry row is what the browser addresses as ?entry=<id>.
    select coalesce(jsonb_agg(to_jsonb(y) order by y.account_code), '[]'::jsonb) into v_profit_comp
      from (
        select a.account_id   as account_id,
               a.account_code as account_code,
               a.name         as name,
               a.account_type as account_type,
               0::bigint      as opening_cents,
               q.movement     as movement_cents,
               q.movement     as closing_cents,
               q.entries      as entries,
               q.n            as entries_total,
               q.n > 20       as entries_truncated
          from clara.coa_accounts a
          cross join lateral (
            select coalesce(sum(case when a.account_type = 'income'
                                     then jl.credit_cents - jl.debit_cents
                                     else jl.debit_cents - jl.credit_cents end), 0)::bigint as movement,
                   count(distinct je.id)::int as n,
                   coalesce((select jsonb_agg(to_jsonb(r) order by r.ord)
                               from (select je2.id as entry_id,
                                            je2.posting_date::text as posting_date,
                                            je2.memo as memo,
                                            sum(case when a.account_type = 'income'
                                                     then jl2.credit_cents - jl2.debit_cents
                                                     else jl2.debit_cents - jl2.credit_cents end)::bigint
                                              as amount_cents,
                                            row_number() over (
                                              order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                                       je2.posting_date desc, je2.id) as ord
                                       from clara.journal_lines jl2
                                       join clara.journal_entries je2 on je2.id = jl2.entry_id
                                      where jl2.client_id = p_client
                                        and jl2.account_code = a.account_code
                                        and je2.status = 'approved'
                                        and not (je2.is_year_end and je2.closing_transfer)
                                        and je2.posting_date between v_start and v_as_of
                                      group by je2.id, je2.posting_date, je2.memo
                                      order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                               je2.posting_date desc, je2.id
                                      limit 20) r), '[]'::jsonb) as entries
              from clara.journal_lines jl
              join clara.journal_entries je on je.id = jl.entry_id
             where jl.client_id = p_client and jl.account_code = a.account_code
               and je.status = 'approved'
               and not (je.is_year_end and je.closing_transfer)
               and je.posting_date between v_start and v_as_of
          ) q
         where a.client_id = p_client
           and a.account_type in ('income','expense')
           and q.n > 0
         order by a.account_code
         limit 50) y;
  else
    v_pl_status := 'unknown'; v_pl_cov := 'unknown'; v_pl_reason := 'client_not_visible';
  end if;

  -- THE SOURCE WATERMARK. A pg_snapshot in text form, taken in this read's own statement, so a
  -- consumer can ask pg_visible_in_snapshot(<a mutation's xid>, this) -- "had this read already
  -- seen you?". A timestamp cannot answer that (0057:390-396 is the shape, and its CHECK regex is
  -- asserted by a cell).
  select pg_current_snapshot()::text into v_watermark;

  return jsonb_build_object(
    'computed_at', v_now,
    'client_id',   p_client,
    'period',      jsonb_build_object(
                     'start',    v_start::text,
                     'end',      v_month_end::text,
                     'as_of',    v_as_of::text,
                     'month',    date_trunc('month', v_as_of)::date::text,
                     'is_mtd',   p_month is null,
                     'timezone', 'Asia/Kuala_Lumpur'),
    'coverage_floor', v_floor::text,

    -- FOUR FACES OF ONE ENVELOPE. Each figure group carries the same ten fields, so no number can
    -- ever reach a screen without its unit, its currency, its period, the instant it was
    -- computed, the definition it was computed under, the snapshot it saw and what it could not
    -- cover.
    'cash', jsonb_build_object(
      'value_cents',        case when v_cash_status = 'ok' then v_c6 else null end,
      'status',             v_cash_status,
      'unit',               'minor_units',
      'currency',           'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_cash_cov,
      'coverage_reason',    v_cash_reason,
      -- THE COMPARISON LIVES HERE, ONCE. The browser recomputes none of it, and #669's tiles
      -- inherit the same three rules rather than re-deriving them.
      'comparison',         case when v_cash_status = 'ok' then jsonb_build_object(
                              'value_cents', v_c5,
                              'delta_cents', v_c6 - v_c5,
                              'delta_pct',   case when v_c5 = 0 then null
                                             else round(((v_c6 - v_c5)::numeric / abs(v_c5)) * 100, 2) end,
                              'sign_change', v_c6 <> 0 and v_c5 <> 0 and sign(v_c6) <> sign(v_c5),
                              'period', jsonb_build_object('start', v_prev_end::text,
                                                           'end', v_prev_end::text)) else null end,
      'set',                case when v_set_id is null then null else jsonb_build_object(
                              'version_id',            v_set_id,
                              'revision',              v_set_rev,
                              'effective_from',        v_set_from::text,
                              'member_count',          v_set_count,
                              'applied_to_all_points', true) end,
      'points',             v_point_rows,
      'composition',        v_cash_comp),

    'profit', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_profit else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status = 'ok' then jsonb_build_object(
                              'value_cents', v_profit_p,
                              'delta_cents', v_profit - v_profit_p,
                              'delta_pct',   case when v_profit_p = 0 then null
                                             else round(((v_profit - v_profit_p)::numeric
                                                         / abs(v_profit_p)) * 100, 2) end,
                              'sign_change', v_profit <> 0 and v_profit_p <> 0
                                             and sign(v_profit) <> sign(v_profit_p),
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) else null end),

    'income', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_income else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status = 'ok' then jsonb_build_object(
                              'value_cents', v_income_p,
                              'delta_cents', v_income - v_income_p,
                              'delta_pct',   case when v_income_p = 0 then null
                                             else round(((v_income - v_income_p)::numeric
                                                         / abs(v_income_p)) * 100, 2) end,
                              'sign_change', v_income <> 0 and v_income_p <> 0
                                             and sign(v_income) <> sign(v_income_p),
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) else null end),

    'expense', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_expense else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status = 'ok' then jsonb_build_object(
                              'value_cents', v_expense_p,
                              'delta_cents', v_expense - v_expense_p,
                              'delta_pct',   case when v_expense_p = 0 then null
                                             else round(((v_expense - v_expense_p)::numeric
                                                         / abs(v_expense_p)) * 100, 2) end,
                              'sign_change', v_expense <> 0 and v_expense_p <> 0
                                             and sign(v_expense) <> sign(v_expense_p),
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) else null end),

    'series',             v_series,
    'profit_composition', v_profit_comp,
    'unmarked_closing_entries', v_unmarked,
    -- NOT A FIGURE GROUP, AND DELIBERATELY SO. Receivables and payables are #669's tiles over
    -- this same envelope; a bank STATEMENT balance is #657/#675's and is a third party's claim
    -- about an account rather than this ledger's. Neither is aggregated here, and the tail
    -- asserts that no statement relation is read at all.
    'excluded_by_design', jsonb_build_array('receivable','payable','statement_balance'));
end $$;

comment on function clara.get_client_financial_pack(uuid, date, date) is
  '#660 B2. The client home''s money band as ONE read: BOOK CASH (cumulative approved debit minus '
  'credit over a governed, versioned CASH ACCOUNT SET -- no fiscal-year reset, an approved '
  'opening counted exactly once) with six points, and PERIOD PROFIT / income / expense over the '
  'selected period excluding the estate''s one closing-transfer predicate, `not (is_year_end and '
  'closing_transfer)` (0016:602), with a six-calendar-month series. Every figure group carries '
  'the same ten-field envelope (value_cents, status, unit, currency, period{start,end,as_of,'
  'timezone}, computed_at, definition_version, source_watermark, coverage, coverage_reason) and '
  'its own comparison {value_cents, delta_cents, delta_pct, sign_change, period} -- delta_pct is '
  'NULL on a zero comparison and the browser recomputes none of it. status and coverage take only '
  'ok | partial | unknown: this door never says `denied` about itself (it raises CLR04) and never '
  'says `unavailable`. Default period is month-to-date in Asia/Kuala_Lumpur; p_month names a whole '
  'natural month by its FIRST DAY; an as-of in the future is refused as_of_in_future rather than '
  'clamped. No published cash set is status=unknown with a NULL value and reason '
  'cash_set_unpublished -- never 0. A complete read over an empty population is ok + 0 + '
  'no_posted_entries. An approved entry carrying close_receipt_id but closing_transfer=false (or '
  'reversing one that does) drives coverage=partial with closing_transfer_unmarked_history: the '
  'read DISCLOSES pre-0120 unmarked history and repairs none of it, and does not widen the '
  'exclusion either. A client this caller cannot see and an invented uuid answer IDENTICALLY. '
  'STABLE SECURITY INVOKER, floored at VIEWER inline because every relation it reads is already '
  'table-SELECT-granted to clara_authenticated behind firm-only RLS (0003:514, :522-525). EXECUTE '
  'to clara_authenticated only.';

-- ==============================================================================================
-- RLS AND GRANTS on the two new relations. The human policy is firm-scoped; there is NO agent
-- policy, because no model lane reaches this family at all. SELECT only to clara_authenticated
-- and ZERO INSERT/UPDATE/DELETE to any non-owner role -- which is what keeps the pack honestly
-- SECURITY INVOKER and makes the viewer-floor claim structural rather than rhetorical.
-- ==============================================================================================
do $$
declare t text;
begin
  foreach t in array array['cash_account_set_versions','cash_account_set_members'] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
    execute format('create policy p_%s_human on clara.%I for select to clara_authenticated using (firm_id = clara.jwt_firm())', t, t);
  end loop;
end $$;

grant select on clara.cash_account_set_versions, clara.cash_account_set_members
  to clara_authenticated;

-- ==============================================================================================
-- GRANTS ON THE THREE DOORS. clara_authenticated ONLY. See the header for why there is no agent
-- twin and no wake wrapper: clara_runtime, clara_agent_ro and every clara_wake_* role gain ZERO
-- on all three, asserted one by one by name in the tail.
-- ==============================================================================================
revoke all on function clara.publish_client_cash_account_set(uuid, jsonb, date, text) from public;
grant execute on function clara.publish_client_cash_account_set(uuid, jsonb, date, text)
  to clara_authenticated;
revoke all on function clara.propose_client_cash_accounts(uuid) from public;
grant execute on function clara.propose_client_cash_accounts(uuid) to clara_authenticated;
revoke all on function clara.get_client_financial_pack(uuid, date, date) from public;
grant execute on function clara.get_client_financial_pack(uuid, date, date) to clara_authenticated;

-- ==============================================================================================
-- THE EVENT PAIR (0219:276-291's idiom). 'ignore': publishing a cash account set is a HUMAN act
-- and nothing downstream is designed to wake on it. Nothing here manufactures a consumer.
-- ==============================================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('client.financial_cash_set_published', true,
   'A human published a new version of a client''s cash account set',
   'ignore',
   'human authoring act; clara.get_client_financial_pack reads the relation directly on its next read -- no router wake (0024 section B / 0055 section S4.0 ignore posture)')
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

-- ==============================================================================================
-- TAIL POSTCHECK. Every claim is re-READ from the catalog.
-- ==============================================================================================
do $p660_tail$
declare
  v_n int;
  v_bad text;
  v_src text;
  v_sig_publish constant text := 'clara.publish_client_cash_account_set(uuid,jsonb,date,text)';
  v_sig_propose constant text := 'clara.propose_client_cash_accounts(uuid)';
  v_sig_pack    constant text := 'clara.get_client_financial_pack(uuid,date,date)';
  v_acl constant text := 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner';
  v_name text;
  v_sig  text;
begin
  -- (1) THE THREE DOORS EXIST, EXACTLY ONCE EACH, AT EXACTLY THEIR SIGNATURES. The rendered
  -- argument list is the contract: a defaulted fourth parameter on the pack would be a new
  -- parameterisation smuggled in as a default, and this postcheck argues back.
  foreach v_sig in array array[v_sig_publish, v_sig_propose, v_sig_pack] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'client_financial_pack tail: % is absent', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  foreach v_name in array array['publish_client_cash_account_set','propose_client_cash_accounts',
                                'get_client_financial_pack','_tf_cash_account_set_integrity'] loop
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname = v_name;
    if v_n <> 1 then
      raise exception 'client_financial_pack tail: expected exactly one clara.%, found % -- this file is not purely additive', v_name, v_n
        using errcode = 'CLR10';
    end if;
  end loop;
  if pg_get_function_arguments(v_sig_publish::regprocedure)
       <> 'p_client uuid, p_members jsonb, p_effective_from date, p_op_key text' then
    raise exception 'client_financial_pack tail: publish signature is %',
      pg_get_function_arguments(v_sig_publish::regprocedure) using errcode = 'CLR10';
  end if;
  if pg_get_function_arguments(v_sig_propose::regprocedure) <> 'p_client uuid' then
    raise exception 'client_financial_pack tail: propose signature is %',
      pg_get_function_arguments(v_sig_propose::regprocedure) using errcode = 'CLR10';
  end if;
  if pg_get_function_arguments(v_sig_pack::regprocedure)
       <> 'p_client uuid, p_as_of date DEFAULT NULL::date, p_month date DEFAULT NULL::date' then
    raise exception 'client_financial_pack tail: pack signature is %',
      pg_get_function_arguments(v_sig_pack::regprocedure) using errcode = 'CLR10';
  end if;

  -- (2) POSTURE: owner, security mode, volatility, and the proconfig pins. Whitespace-insensitive,
  -- because PostgreSQL NORMALISES a GUC list when it stores it.
  select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.prosecdef is distinct from true then 'is not SECURITY DEFINER'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%' then 'search_path is not pinned'
              else null end
    into v_bad from pg_proc p where p.oid = v_sig_publish::regprocedure;
  if v_bad is not null then
    raise exception 'client_financial_pack tail: % %', v_sig_publish, v_bad using errcode = 'CLR10';
  end if;
  foreach v_sig in array array[v_sig_propose, v_sig_pack] loop
    select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                  then 'owned by ' || pg_get_userbyid(p.proowner)
                when p.prosecdef is distinct from false then 'is not SECURITY INVOKER'
                when p.provolatile <> 's' then 'is not STABLE'
                when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                       not like '%search_path=clara,pg_temp%' then 'search_path is not pinned'
                else null end
      into v_bad from pg_proc p where p.oid = v_sig::regprocedure;
    if v_bad is not null then
      raise exception 'client_financial_pack tail: % %', v_sig, v_bad using errcode = 'CLR10';
    end if;
  end loop;
  if replace(coalesce((select array_to_string(proconfig, ',') from pg_proc
                        where oid = v_sig_pack::regprocedure), ''), ' ', '')
       not like '%plan_cache_mode=force_custom_plan%' then
    raise exception 'client_financial_pack tail: the pack does not pin plan_cache_mode (0183)'
      using errcode = 'CLR10';
  end if;

  -- (3) THE ACL CENSUS, EACH DOOR NAMED IN ITS OWN ASSERTION. A two-door assertion would pass
  -- while the proposal read stood open, and the proposal read is the surface that says which
  -- accounts COULD be cash.
  foreach v_sig in array array[v_sig_publish, v_sig_propose, v_sig_pack] loop
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception 'client_financial_pack tail: PUBLIC still holds EXECUTE on %', v_sig
        using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'client_financial_pack tail: clara_authenticated cannot execute %', v_sig
        using errcode = 'CLR10';
    end if;
    select coalesce(array_to_string(p.proacl, ' | '), '(null)') into v_bad
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_bad is distinct from v_acl then
      raise exception 'client_financial_pack tail: the EXECUTE ACL on % is not exactly what this file granted: %', v_sig, v_bad
        using errcode = 'CLR10';
    end if;
    -- NO MODEL LANE REACHES ANY OF THE THREE. Asserted per role and per door, by name.
    for v_name in select rolname from pg_roles
                   where rolname in ('clara_runtime','clara_agent_ro')
                      or rolname like 'clara\_wake\_%' loop
      if has_function_privilege(v_name, v_sig::regprocedure, 'execute') then
        raise exception 'client_financial_pack tail: % holds EXECUTE on % -- this file grants no model lane anything', v_name, v_sig
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (4) THE TWO RELATIONS: FORCE RLS, exactly two policies each, SELECT and nothing else for
  -- clara_authenticated, and no privilege at all for any model-lane role.
  foreach v_name in array array['cash_account_set_versions','cash_account_set_members'] loop
    if not exists (select 1 from pg_class cl join pg_namespace ns on ns.oid = cl.relnamespace
                    where ns.nspname = 'clara' and cl.relname = v_name
                      and cl.relrowsecurity and cl.relforcerowsecurity) then
      raise exception 'client_financial_pack tail: clara.% does not FORCE row level security', v_name
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from pg_policies
     where schemaname = 'clara' and tablename = v_name;
    if v_n <> 2 then
      raise exception 'client_financial_pack tail: clara.% carries % policies, expected exactly two (owner + firm-scoped human)', v_name, v_n
        using errcode = 'CLR10';
    end if;
    select string_agg(format('%s:%s', t.grantee, t.privilege_type), ',' order by t.grantee, t.privilege_type)
      into v_bad from information_schema.role_table_grants t
     where t.table_schema = 'clara' and t.table_name = v_name
       and t.grantee <> 'clara_fn_owner'
       and not (t.grantee = 'clara_authenticated' and t.privilege_type = 'SELECT');
    if v_bad is not null then
      raise exception 'client_financial_pack tail: clara.% carries a privilege beyond clara_authenticated SELECT: %', v_name, v_bad
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) THE BODY'S OWN RULES, read back from prosrc. Each one defends a silent-wrongness trap a
  -- comment could not.
  --
  -- THE PROBES RUN OVER THE CODE, NOT THE COMMENTS. `prosrc` carries both, and an ABSENCE probe
  -- that a comment can trip is a probe that pushes the next author to stop explaining the rule in
  -- the body -- which is the opposite of what these assertions are for. Line comments are
  -- stripped first; the presence probes below are all code, so they are unaffected.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid = v_sig_pack::regprocedure;
  if position('not (je.is_year_end and je.closing_transfer)' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the estate''s one closing-transfer exclusion predicate (0016:602) is not present VERBATIM in the pack'
      using errcode = 'CLR10';
  end if;
  if position('Asia/Kuala_Lumpur' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the calendar day is not resolved against Asia/Kuala_Lumpur'
      using errcode = 'CLR10';
  end if;
  if position('greatest(' in v_src) <> 0 then
    raise exception 'client_financial_pack tail: greatest( appears in the pack -- a reversal or a negative correction must move a figure by its SIGNED amount, never be clamped'
      using errcode = 'CLR10';
  end if;
  if position('bank_statements' in v_src) <> 0 then
    raise exception 'client_financial_pack tail: the pack reads clara.bank_statements -- a statement closing balance never substitutes for or is summed into BOOK cash'
      using errcode = 'CLR10';
  end if;
  -- THE SINGLE-PASS CASH ARM IS A SECOND SPELLING OF clara.trial_balance_as_of's DEFINITION, so
  -- the four properties that make it the SAME definition are asserted from the body rather than
  -- trusted (0057:1878-1906 is the protection pattern).
  if position('je.status = ''approved''' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the cash arm does not restrict to approved entries'
      using errcode = 'CLR10';
  end if;
  if position('je.posting_date <= v_points[1]' in v_src) = 0
     or position('je.posting_date <= v_points[6]' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the cash arm is not a cumulative posting_date <= bound at each of its six points'
      using errcode = 'CLR10';
  end if;
  if position('is_opening_balance' in v_src) <> 0 then
    raise exception 'client_financial_pack tail: the pack special-cases is_opening_balance -- clara.trial_balance_as_of does not, so an approved opening would be counted twice or not at all'
      using errcode = 'CLR10';
  end if;
  if position('fiscal_year' in v_src) <> 0 then
    raise exception 'client_financial_pack tail: the pack mentions a fiscal year -- book cash is cumulative from inception with NO FY reset'
      using errcode = 'CLR10';
  end if;
  if position('''unavailable''' in v_src) <> 0 then
    raise exception 'client_financial_pack tail: the pack can say `unavailable` -- the status vocabulary is closed at ok | partial | unknown'
      using errcode = 'CLR10';
  end if;
  -- AND THE PROPOSAL READ NEVER PROPOSES PETTY CASH, asserted from ITS body: the only reason it
  -- can emit is bank_registry, and no name or code heuristic appears anywhere in it.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid = v_sig_propose::regprocedure;
  if position('''bank_registry''' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the proposal read does not emit the bank_registry reason'
      using errcode = 'CLR10';
  end if;
  if position('is_active' in v_src) <> 0
     and position('a.is_active     as is_active' in v_src) = 0 then
    raise exception 'client_financial_pack tail: the proposal read filters is_active -- an inactive bank account with a live balance must still be proposable'
      using errcode = 'CLR10';
  end if;

  -- (6) THE EVENT PAIR IS COUPLED. A type with no taxonomy row is a wake decision nobody made.
  select count(*)::int into v_n from clara.event_types
   where name = 'client.financial_cash_set_published';
  if v_n <> 1 then
    raise exception 'client_financial_pack tail: the event type was not registered exactly once'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy
   where event_type = 'client.financial_cash_set_published' and decision = 'ignore';
  if v_n <> 1 then
    raise exception 'client_financial_pack tail: the event type carries no single ignore taxonomy row'
      using errcode = 'CLR10';
  end if;

  -- (7) AND NOTHING WAS RECUT. The five read-only dependency bodies are byte-identical to the
  -- bodies this file pinned in its prestate. "This migration recut nothing shared" is a CHECKED
  -- FACT, not a claim.
  if encode(sha256(convert_to((select prosrc from pg_proc
      where oid = 'clara.trial_balance_as_of(uuid,date)'::regprocedure), 'UTF8')), 'hex')
     <> '51f18cba8b3d1fb4e225b83773803ea340b7b492a7647d50304589a86922c63c' then
    raise exception 'client_financial_pack tail: clara.trial_balance_as_of moved while this file was applying'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc
      where oid = 'clara._metric_selector_account_ids(uuid,jsonb)'::regprocedure), 'UTF8')), 'hex')
     <> 'c8f32cd986403f94c0943e147a1ffe207b7e770843b9b6fbb2b9765cec04b1e9' then
    raise exception 'client_financial_pack tail: clara._metric_selector_account_ids moved while this file was applying'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc
      where oid = 'clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)'::regprocedure), 'UTF8')), 'hex')
     <> '25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495' then
    raise exception 'client_financial_pack tail: clara.create_account_set_v1 moved while this file was applying'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc
      where oid = 'clara.finalize_close(uuid,text,text)'::regprocedure), 'UTF8')), 'hex')
     <> '59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4' then
    raise exception 'client_financial_pack tail: clara.finalize_close moved while this file was applying'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc
      where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure), 'UTF8')), 'hex')
     <> '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5' then
    raise exception 'client_financial_pack tail: clara.reopen_fiscal_year moved while this file was applying'
      using errcode = 'CLR10';
  end if;

  raise notice '#660 tail: OK -- three doors exist exactly once each at exactly their signatures, owned by clara_fn_owner; publish is SECURITY DEFINER, both reads are SECURITY INVOKER and STABLE, all three pin search_path and the pack pins plan_cache_mode. EXECUTE on all three reaches clara_fn_owner + clara_authenticated and NOBODY else -- PUBLIC revoked, the ACL asserted literally, and clara_runtime / clara_agent_ro / every clara_wake_* role asserted to hold nothing, door by door and role by role. Both new relations FORCE RLS with exactly two policies and carry SELECT to clara_authenticated and no other privilege to any role. The pack carries the estate''s one closing-transfer exclusion VERBATIM, resolves its calendar day against Asia/Kuala_Lumpur, restricts its cash arm to approved entries under a cumulative posting_date <= bound at every one of its six points, special-cases is_opening_balance NOWHERE, mentions no fiscal year, can never say `unavailable`, contains no greatest( clamp and reads clara.bank_statements NOWHERE. The event type is coupled to exactly one ignore taxonomy row. And nothing was recut: all five pinned dependency bodies are byte-identical to the bodies this file measured.';
end $p660_tail$;
