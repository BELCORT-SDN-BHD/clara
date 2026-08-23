-- UNNUMBERED_f_a6_freeform_read.sql — F-A6 PR-1: THE AUDITED FREEFORM READ (DB).
-- =====================================================================================
-- Number claimed at MERGE time (standing law; never named here). Design of record:
-- docs/plan/active/freeform-read-design.md **v2** §3 + Annexes A-E
-- (docs/plan/active/freeform-read-annexes-1-mechanics.md) and the battery/registers in
-- docs/plan/active/freeform-read-annexes-2-record.md. Gate record:
-- docs/plan/active/freeform-read-gate-record.md. Build sequence: design §7 item 2.
--
-- ORDERING OBLIGATION, BINDING AND MECHANICAL. This file applies ONLY after F-A2 PR-1's
-- three parts (UNNUMBERED_f_a2_posting_core / _posting_grants / _posted_chain), because the
-- `interactive_client` wake kind is F-A6's HARD DEPENDENCY (design §8): without it there is no
-- client-pinned interactive credential and the client-scoped arm has no carrier. The prestate
-- probes BOTH `wake_credentials` CHECKs by their live text and REFUSES rather than proceeding
-- on a wrong premise.
--
-- =====================================================================================
-- §0  QUIESCE INVENTORY — **EMPTY, AND THAT IS THE POINT** (design §6, D-11).
-- =====================================================================================
-- NO live function body is CoR'd by this file. Not one. `mint_wake_credential`, `wake_context`,
-- `assert_wake_allowed`, `_agent_read_admitted`, `wake_firm` and `shares_my_firm_wake` are READ,
-- never rewritten — TA-P1 C's rider ("new authority ships as wake SIBLING verbs, never a rewrite
-- of a live human body") satisfied literally. Therefore **NO D1 write-quiesce window is
-- required.** What this file does cost is 35 brief ACCESS EXCLUSIVE locks (`CREATE POLICY`, one
-- per enumerated relation, several of them hot) plus one on `clara.freeform_read_log` for the
-- ALTER: apply from merged `main` in a low-traffic window under an explicit `lock_timeout` with
-- bounded retry, so a blocked statement fails fast rather than queueing behind — and ahead of —
-- the posting lane (Annex E.1, P-15).
--
-- ONE existing GRANT and ONE existing POLICY are REMOVED (design §3.2, D-6):
--   revoke insert on clara.freeform_read_log from clara_runtime   (0002_foundation.sql:542)
--   drop policy p_freeform_read_log_runtime                        (0002_foundation.sql:525-526)
-- Neither is used by any code path: the repo search finds `freeform_read_log` only in the three
-- GOVERNED_TABLES rosters (rig-meta.mjs:936, rig-runtime-helpers.mjs:81, rig-docs-helpers.mjs:166)
-- and nowhere in packages/runtime or apps/ (P-14; the estate suite is the instrument, not the grep).
-- After this file the receipt has EXACTLY TWO writer bodies and no third — `_freeform_arm` (the
-- one INSERT) and `_freeform_settle` (the one permitted UPDATE), both owned by clara_fn_owner,
-- and NO role other than clara_fn_owner holds INSERT or UPDATE on the table.
--
-- =====================================================================================
-- §0.1  WHAT THE RIG REPLAY MEASURED, AND THE FOUR PLACES THIS FILE DEVIATES FROM THE
--       DESIGN OF RECORD BECAUSE THE MEASUREMENT SAID SO.
-- =====================================================================================
-- Every one of these was measured on a throwaway postgres:17.11 at this file's own frontier.
-- The design's method binds here: "an unsettleable claim is a PREDICTION the rig replay must
-- confirm", and "where a measurement disagrees, the measurement wins" (Annex D.2, P-18).
--
-- (1) **THE PLAN CENSUS NEEDS `verbose true`.** Design §3.3 / D-24 / Annex D.1-B2 specify
--     `explain (format json)`. MEASURED: without VERBOSE the plan carries NO "Schema" key —
--     the walk yields a bare `journal_entries`, so the census cannot tell `clara.journal_entries`
--     from a same-named relation in another schema, and its ONE non-vacuous job (refusing
--     `select prosrc from pg_proc`) collapses into a name match. With `verbose true` the walk
--     yields `clara.journal_entries` and `pg_catalog.pg_proc`. This file uses VERBOSE.
--
-- (2) **`(57014, read_timeout)` IS NOT REACHABLE AS A TIER-C PAIR — P-12 IS FALSE.**
--     MEASURED: with `statement_timeout` armed BEFORE the top-level statement, the 57014 raised
--     inside `FETCH` is NOT trapped by a plpgsql `exception when others` block — it propagates
--     out of the function and aborts the transaction (PostgreSQL does not let a plpgsql handler
--     trap query cancellation). P-12 said in terms: "If either is false, `read_timeout` moves
--     from Tier B to Tier D and the receipt for a timed-out read is lost — a material change to
--     the audit claim, not a detail." So: this file ships NO 57014 handler, because a handler
--     that cannot fire is a false audit claim in code. The receipted deadline is the plpgsql
--     clock check in the fetch loop (design §3.2 already rules it the deadline of record), which
--     commits a receipt naming `read_timeout`; a statement_timeout kill is TIER D, and the
--     runtime's task record is its honest home (design §3.5 Tier D).
--
-- (3) **F.3(b)'s EXPECTED TOKEN IS WRONG, MEASURED.** Annex F.3(b) expects `statement_shape`
--     from "two plain statements separated by `;`". MEASURED: inside the derived-table wrapper
--     that payload is `select to_jsonb(t) from (select 1; select 2) t`, which is a SYNTAX ERROR
--     — `42601`, i.e. `malformed_statement`. `42P11` is produced only by a payload that CLOSES
--     the wrapper's own paren first (F.3(a) and F.3(h), both measured at 42P11). The wall holds
--     in every case; the TOKEN table is what moves, exactly as P-18 provides for.
--
-- (4) **`arm_txid` IS A NEW COLUMN THE ANNEX DOES NOT LIST, AND IT CLOSES A HOLE THE DESIGN
--     DOES NOT SEE.** The obvious implementation of "the transaction holds an armed receipt"
--     is a txn-local GUC set by `_freeform_arm`. It is UNSAFE HERE: the payload runs as the SAME
--     role and may call `set_config` (design §3.2 concedes the family), so a payload could issue
--     `set_config('clara.freeform_scope_client', <sibling client>, true)` and widen its own
--     compiled pin — law 28's question (ii), answered YES. This file therefore keys the arm
--     state on `pg_current_xact_id()`, stored on the receipt row itself. The payload holds no
--     INSERT or UPDATE grant on that table and cannot change the transaction id, so the arm
--     state is unforgeable by construction rather than by a grant. MEASURED: the xid is stable
--     across a plpgsql subtransaction and survives a caught exception, and
--     `pg_current_xact_id_if_assigned()` is NULL before any write (so an un-armed transaction
--     reads FALSE, fail-closed).
--
-- Two further findings are recorded in the PR and the lane report rather than resolved here:
-- `CLR10 cross_client_unavailable` (see §6.3's own note) and `documents` (§8's S-1d note).
--
-- =====================================================================================
-- §0.1b  THREE V2-READINESS ADOPTIONS, taken in PR-1 because they are cheap here and
--        expensive after merge. The v1 design is TRUED in the same PR.
-- =====================================================================================
-- (5) **`documents` IS SCOPED THROUGH THE LIVE FILING, NOT THROUGH A COLUMN.** Annex A.1 puts
--     `documents` on arm S-1 ("firm + client"), and the survey's §3.5 table repeats it. Measured,
--     `clara.documents` HAS NO `client_id` COLUMN AT ALL — the client attribution lives in
--     `clara.document_filings`, and a filing CORRECTION (A -> B) retires one filing row and
--     writes another. So the S-1 form does not compile; the firm-only form leaks every sibling
--     client's document metadata under a pin; and any column-borne form would keep client A
--     reading the document after the correction while B could not see its own. The pin is
--     therefore compiled through the LIVE filing (`retired_at is null`) — the cut F-A6 v2
--     already designed for `document_extractions`/`document_regions`, one hop rather than two.
-- (6) **THE SCOPE COMPILER RETURNS `uuid[]`, NOT A SCALAR** (`_freeform_scope_clients()`), and
--     `client_scope` is a `uuid[]` column. v1 populates NULL (HOME) or a ONE-element array (the
--     pin), and every policy conjunct is already written `= any(...)`. Without this, v2's
--     cross-client sibling costs 35 `CREATE POLICY` re-cuts — 35 more ACCESS EXCLUSIVE locks on
--     hot tables — plus a receipt-column widening, to change a set from size one to size two.
--     The compiled pin still comes from the CREDENTIAL and never from a tool argument, which is
--     the whole of TA-P9 A(1); the shape of the answer is not the source of it.
-- (7) **THE ADMISSION LADDER LIVES IN AN UNGRANTED CORE** (`clara._freeform_core`), which takes
--     NO scope argument and NO verb argument. GB-2's defect was the ARGUMENT, not the sharing:
--     v1's core took `p_scope text`, so a granted core let the model pick its own scope. This
--     core picks nothing — it resolves the credential, validates the shape, binds the turn and
--     runs the congruence pair, and returns facts. It is granted to NOBODY (the 0077/0078
--     idiom): `_freeform_arm` is a DEFINER owned by clara_fn_owner and needs no grant to call
--     it, so **the enumerated EXECUTE list stays SEVEN** (Annex A.2 unmoved). v2's cross-client
--     arm calls the same core instead of forcing a REPLACEMENT of `_freeform_arm`'s live body,
--     which — `_freeform_arm` being a writer — would be a D1 write-quiesce candidate.
--
-- =====================================================================================
-- §0.2  THE SEAM, AND WHY EVERYTHING IS IN ONE FILE.
-- =====================================================================================
-- 0077/0078's seam ("ungranted machinery here, granted surface + its census there") does NOT
-- apply: the whole point of §3.1 is that the SQL executes as the CALLER, so the verb is SECURITY
-- INVOKER and its two DEFINER callees MUST be EXECUTE-granted to the same role (design §3.2,
-- D-20 — the grant is forced by the INVOKER chain, and the forgery is closed structurally
-- instead). There is no ungranted core to separate. The atomicity that matters here is
-- role + grant + policy + verb + allowlist in ONE transaction: any split ships a window in
-- which a role holds SELECT on 35 relations with no receipt gate compiled into their policies.
-- =====================================================================================

-- =====================================================================================
-- §1  PRESTATE — fail-closed on every premise this file rides on.
-- =====================================================================================
do $fa6_pre$
declare
  n text;
  v_kind_def text;
  v_client_def text;
  v_rows bigint;
  v_missing text[] := '{}';
  v_t text;
begin
  -- (a) F-A2 PR-1's wake limb must be live, BY THE CHECKS' OWN TEXT (never by a name grep).
  select pg_get_constraintdef(c.oid) into v_kind_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_kind_0011';
  select pg_get_constraintdef(c.oid) into v_client_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_client_0011';
  if v_kind_def is null or v_client_def is null then
    raise exception 'F-A6 PR-1 prestate: a wake_credentials CHECK is ABSENT (kind=%, client=%) — the estate is not at the frontier this file rides',
      coalesce(v_kind_def,'<null>'), coalesce(v_client_def,'<null>') using errcode = 'CLR10';
  end if;
  if position('interactive_client' in v_kind_def) = 0
     or position('interactive_client' in v_client_def) = 0 then
    raise exception 'F-A6 PR-1 prestate: the wake_credentials CHECK pair does not admit interactive_client — apply F-A2 PR-1 (UNNUMBERED_f_a2_posting_core.sql) first. kind=% client=%',
      v_kind_def, v_client_def using errcode = 'CLR10';
  end if;
  -- The pairing is the carrier: interactive_client MUST imply a non-null client_id, or the
  -- compiled pin can be NULL and `scope_unpinned` stops being unreachable (design §3.5, D-23).
  if position('(wake_kind = ''interactive_client''::text) AND (client_id IS NOT NULL)' in v_client_def) = 0 then
    raise exception 'F-A6 PR-1 prestate: interactive_client is not pinned to a non-null client_id by ck_wake_credentials_client_0011 — the D-23 declared-unreachable assert would become reachable. def=%',
      v_client_def using errcode = 'CLR10';
  end if;

  -- (b) The helper spine this file grants and calls must exist at the exact signatures.
  foreach n in array array[
    'clara.wake_context()', 'clara.wake_firm()', 'clara.assert_wake_allowed(text,text)',
    'clara.shares_my_firm_wake(uuid)', 'clara.agent_user_id()', 'clara.actor_role_rank()',
    'clara.role_rank(text)', 'clara.jwt_firm()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'F-A6 PR-1 prestate: helper absent at its pinned signature: %', n using errcode = 'CLR10';
    end if;
  end loop;

  -- (c) PARTIAL BIRTH — nothing this file creates may already exist.
  foreach n in array array[
    'clara.wake_freeform_read(text,text,uuid,text,int)',
    'clara._freeform_core(text,text,uuid,text)',
    'clara._freeform_arm(text,text,uuid,text)',
    'clara._freeform_settle(text,int,bigint,text[],int,jsonb)',
    'clara._freeform_scope_clients()', 'clara._freeform_admitted()'
  ] loop
    if to_regprocedure(n) is not null then
      raise exception 'F-A6 PR-1 partial birth: % already exists', n using errcode = 'CLR10';
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname in ('clara_freeform_ro','clara_freeform_login')) then
    raise exception 'F-A6 PR-1 partial birth: a clara_freeform_* role already exists' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name = 'wake_freeform_read') then
    raise exception 'F-A6 PR-1 partial birth: a wake_freeform_read allowlist row already exists' using errcode = 'CLR10';
  end if;

  -- (d) P-1: the receipt table must be EMPTY. Four columns go NOT NULL and eight more arrive
  --     NOT NULL; on a non-empty table that is not a widening, it is a data migration nobody
  --     designed. Refuse rather than invent a backfill.
  select count(*) into v_rows from clara.freeform_read_log;
  if v_rows <> 0 then
    raise exception 'F-A6 PR-1 prestate: clara.freeform_read_log holds % row(s); the ALTER assumes zero (P-1). A backfill is a ruling, not a migration.', v_rows using errcode = 'CLR10';
  end if;
  -- and the 0002 grant/policy this file removes must actually be THERE (a revoke of nothing is
  -- not evidence of anything — the converse wall must be provably removed, not presumed absent).
  if not exists (select 1 from information_schema.role_table_grants
                  where table_schema='clara' and table_name='freeform_read_log'
                    and grantee='clara_runtime' and privilege_type='INSERT') then
    raise exception 'F-A6 PR-1 prestate: clara_runtime does NOT hold INSERT on clara.freeform_read_log — 0002:542 is not where this file expects it' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_policy where polrelid='clara.freeform_read_log'::regclass
                   and polname='p_freeform_read_log_runtime') then
    raise exception 'F-A6 PR-1 prestate: policy p_freeform_read_log_runtime is absent — 0002:525-526 is not where this file expects it' using errcode = 'CLR10';
  end if;

  -- (e) THE ENUMERATED SURFACE MUST EXIST, ALL 35, BY NAME. A missing relation would silently
  --     shrink the readable list and the audit line would print a number nobody chose.
  foreach v_t in array array[
    'journal_entries','journal_lines','coa_accounts','journal_entry_revisions',
    'documents','document_filings','entry_evidence','counterparties','counterparty_aliases',
    'open_items','open_item_allocations',
    'bank_accounts','bank_statements','bank_statement_lines','bank_matches',
    'bank_match_line_members','bank_match_entry_members','bank_reconciliations','bank_line_exceptions',
    'fixed_assets','fa_depreciation','staff_advances','staff_advance_applications',
    'fiscal_years','close_runs','period_snapshots','reporting_periods','compliance_watches',
    'open_questions','coding_tasks','notifications',
    'clients','users','firms','sst_threshold_schedule'
  ] loop
    if to_regclass('clara.' || quote_ident(v_t)) is null then v_missing := v_missing || v_t; end if;
  end loop;
  if array_length(v_missing,1) is not null then
    raise exception 'F-A6 PR-1 prestate: enumerated relation(s) absent: %', array_to_string(v_missing,', ') using errcode = 'CLR10';
  end if;

  raise notice 'F-A6 PR-1 prestate: clean -- both wake_credentials CHECKs admit interactive_client and pin it to a non-null client, all 8 helper signatures resolve, no F-A6 object or role exists yet, clara.freeform_read_log is EMPTY (P-1 confirmed) with 0002:542''s runtime INSERT grant and p_freeform_read_log_runtime BOTH present to be removed, and all 35 enumerated relations exist.';
end
$fa6_pre$;

-- =====================================================================================
-- §2  THE PRINCIPALS (design §3.1, D-1) — cluster DDL as the DEPLOY role, BEFORE SET ROLE
--     (S4-C13: clara_fn_owner is NOCREATEROLE). The 0006:59-79 idiom, verbatim in shape.
-- =====================================================================================
-- clara_freeform_ro     NOLOGIN group. SELECT on the ENUMERATED relations (§7) and nothing else;
--                       EXECUTE on exactly SEVEN functions; ZERO DML anywhere.
-- clara_freeform_login  LOGIN shell, member of clara_freeform_ro ALONE (inherit false, set true)
--                       — the FOURTH login. Created NOLOGIN; the operator enables LOGIN + a
--                       password OUT OF BAND and supplies CLARA_FREEFORM_DATABASE_URL.
do $fa6_roles$
declare r text;
begin
  foreach r in array array['clara_freeform_ro', 'clara_freeform_login'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);   -- safe defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB NOLOGIN
    end if;
    execute format('alter role %I nologin nocreaterole inherit', r);
  end loop;
end
$fa6_roles$;

-- EXACTLY ONE group, WITH SET TRUE (the pool authenticates AS the login then SET ROLEs) and
-- INHERIT FALSE (the bare login carries NO privilege until it explicitly switches).
grant clara_freeform_ro to clara_freeform_login with inherit false, set true;

-- Deploy-role impersonation for the isolation rig (0006:83-90's guarded idiom).
do $fa6_imp$
begin
  execute format('grant clara_freeform_login to %I with inherit false, set true', current_user);
  execute format('grant clara_freeform_ro    to %I with inherit false, set true', current_user);
exception when insufficient_privilege then
  raise notice 'F-A6 PR-1: skipping freeform login impersonation grants (deploy role lacks ADMIN; not load-bearing)';
end
$fa6_imp$;

-- The read role must see the schema at all. NOTE, deliberately: it does NOT get
-- `default_transaction_read_only` (the belt clara_agent_ro carries). Survey F7 is exactly why
-- this login exists — the receipt must be WRITTEN in the same transaction as the read, and the
-- read pool's session-level read-only transactions make that impossible. The write it can
-- perform is not a table grant; it is two DEFINER functions and nothing else.
grant usage on schema clara to clara_freeform_ro;

set role clara_fn_owner;

-- =====================================================================================
-- §3  THE RECEIPT (design §3.6, D-17; Annex C) — ONE row, TWO phases.
-- =====================================================================================
alter table clara.freeform_read_log
  alter column firm_id       set not null,
  alter column credential_id set not null,
  alter column query_text    set not null,
  alter column purpose       set not null;

alter table clara.freeform_read_log
  add constraint ck_freeform_query_text check (btrim(query_text) <> '' and length(query_text) <= 20000),
  add constraint ck_freeform_purpose    check (btrim(purpose)    <> '' and length(purpose)    <= 500);

-- ARM-phase columns (written by _freeform_arm, never nullable except where law 68 forces it).
-- `verb` and `scope` are CLOSED enumerations that v2 EXTENDS — the D34 extend-never-weaken
-- precedent — never re-cuts. `cross_client` is NOT in v1's enumeration on purpose.
alter table clara.freeform_read_log
  add column verb          text  not null check (verb in ('wake_freeform_read')),
  add column scope         text  not null check (scope in ('client','firm')),
  -- uuid[], not uuid (§0.1b(6)): v1 writes NULL or a ONE-element array, v2's cross-client arm
  -- writes the set it actually read across. A scalar here would make v2 widen the column as well
  -- as the enumeration, and would leave the cross-client receipt unable to NAME its own scope.
  add column client_scope  uuid[],
  add column acting_actor  uuid  not null references clara.users(id),
  add column on_behalf_of  uuid  references clara.users(id),
  add column via_wake_kind text  not null check (via_wake_kind in ('interactive','interactive_client')),
  add column task_id       uuid  not null,
  add column op_key        text  not null,
  -- §0.1(4): the arm state, unforgeable. NOT a GUC — a payload may call set_config, and a
  -- GUC-borne compiled pin is a scope escape.
  add column arm_txid      xid8  not null,
  -- The model-name CHECK is written with TWO apostrophes. F-A2's R-3 lost this exact wall to a
  -- four-apostrophe typo, `coalesce(x,'''')`, which made the conjunct read "the model name,
  -- defaulted to the two-character string '', is not empty" and always pass.
  add column model_snapshot jsonb check (model_snapshot is null
        or (jsonb_typeof(model_snapshot) = 'object'
            and btrim(coalesce(model_snapshot->>'provider','')) <> ''
            and btrim(coalesce(model_snapshot->>'model','')) <> ''
            and btrim(coalesce(model_snapshot->>'version','')) <> '')),
  -- SETTLE-phase columns (NULL while armed; written by the ONE permitted UPDATE).
  add column settled_at     timestamptz,
  add column outcome        text check (outcome in ('ok','refused','error')),
  add column refusal_reason text,
  add column rung_vector    jsonb check (rung_vector is null or jsonb_typeof(rung_vector) = 'object'),
  add column relations_read text[],
  add column row_count      int    check (row_count   is null or row_count   >= 0),
  add column byte_count     bigint check (byte_count  is null or byte_count  >= 0),
  add column duration_ms    int    check (duration_ms is null or duration_ms >= 0);

alter table clara.freeform_read_log
  -- v1's enumeration: 'client' carries EXACTLY ONE id, 'firm' carries none, and neither may be
  -- inferred from the other's absence. v2 EXTENDS the disjunction with a 'cross_client' arm
  -- (cardinality >= 1); it never re-cuts these two.
  add constraint ck_freeform_scope_client check (
        (scope =  'client' and client_scope is not null and cardinality(client_scope) = 1
         and array_position(client_scope, null) is null)
     or (scope <> 'client' and client_scope is null)),
  -- Phase-aware: every settle column moves together, and a refusal must NAME its reason.
  add constraint ck_freeform_settled check (
        (settled_at is null and outcome is null and rung_vector is null
         and refusal_reason is null and row_count is null and byte_count is null
         and relations_read is null and duration_ms is null)
     or (settled_at is not null and outcome is not null and rung_vector is not null
         and ((outcome =  'ok' and refusal_reason is null)
           or (outcome <> 'ok' and nullif(btrim(refusal_reason),'') is not null))));

create index ix_freeform_read_log_firm_at   on clara.freeform_read_log (firm_id, at desc);
-- GIN, not the annex's `(client_scope, at desc)` btree: the column is an ARRAY (§0.1b(6)) and the
-- human read surface asks "which reads touched THIS client", i.e. a containment test. A btree on
-- a uuid[] would index whole-array equality and answer that question with a sequential scan.
create index ix_freeform_read_log_client on clara.freeform_read_log using gin (client_scope);
-- ONE UNSETTLED receipt per transaction, as an INDEX and not only as a body check: the
-- one-arm/one-settle property that R-L16 requires is thereby structural as well as procedural.
create unique index ux_freeform_read_log_arm_txid on clara.freeform_read_log (arm_txid) where settled_at is null;

-- -------------------------------------------------------------------------------------
-- §3.1  The settle-once trigger — PURPOSE-BUILT, not the generic clara._tf_append_only
--       (0003:428-435), whose CLR08 raise is unconditional and would refuse the ONE
--       transition this table exists to permit.
-- -------------------------------------------------------------------------------------
create function clara._tf_freeform_settle_once() returns trigger
language plpgsql security definer set search_path = clara, pg_temp as $fa6_once$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'clara.freeform_read_log is settle-once: TRUNCATE refused' using errcode = 'CLR08';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'clara.freeform_read_log is settle-once: DELETE of receipt % refused', old.id using errcode = 'CLR08';
  end if;
  -- UPDATE: the ONE permitted transition is unsettled -> settled, arm-phase columns unmoved.
  if old.settled_at is not null then
    raise exception 'freeform receipt % is already settled: a second settle is refused', old.id using errcode = 'CLR08';
  end if;
  if new.settled_at is null then
    raise exception 'freeform receipt %: the only permitted UPDATE is the settle, and it must set settled_at', old.id using errcode = 'CLR08';
  end if;
  if new.id            is distinct from old.id
  or new.firm_id       is distinct from old.firm_id
  or new.credential_id is distinct from old.credential_id
  or new.query_text    is distinct from old.query_text
  or new.purpose       is distinct from old.purpose
  or new.at            is distinct from old.at
  or new.verb          is distinct from old.verb
  or new.scope         is distinct from old.scope
  or new.client_scope  is distinct from old.client_scope
  or new.acting_actor  is distinct from old.acting_actor
  or new.on_behalf_of  is distinct from old.on_behalf_of
  or new.via_wake_kind is distinct from old.via_wake_kind
  or new.task_id       is distinct from old.task_id
  or new.op_key        is distinct from old.op_key
  or new.arm_txid      is distinct from old.arm_txid
  or new.model_snapshot is distinct from old.model_snapshot then
    raise exception 'freeform receipt %: the settle UPDATE may not change an arm-phase column', old.id using errcode = 'CLR08';
  end if;
  return new;
end
$fa6_once$;

create trigger t_freeform_settle_once
  before update or delete on clara.freeform_read_log
  for each row execute function clara._tf_freeform_settle_once();
create trigger t_freeform_no_truncate
  before truncate on clara.freeform_read_log
  for each statement execute function clara._tf_freeform_settle_once();

-- -------------------------------------------------------------------------------------
-- §3.2  The must-settle trigger — DEFERRABLE INITIALLY DEFERRED, so "no receipt, no read"
--       gains its twin: **no read COMMITS without a SETTLED receipt** (P-17, R-L16's third
--       required cell). It re-reads the row by id rather than trusting NEW, so the arm's
--       row image can never be mistaken for the committed one.
-- -------------------------------------------------------------------------------------
create function clara._tf_freeform_must_settle() returns trigger
language plpgsql security definer set search_path = clara, pg_temp as $fa6_settle$
begin
  if exists (select 1 from clara.freeform_read_log r where r.id = new.id and r.settled_at is null) then
    raise exception 'freeform receipt % was armed and never settled: no read commits behind an unfinished receipt', new.id using errcode = 'CLR10';
  end if;
  return null;
end
$fa6_settle$;

create constraint trigger t_freeform_must_settle
  after insert on clara.freeform_read_log
  deferrable initially deferred
  for each row execute function clara._tf_freeform_must_settle();

-- -------------------------------------------------------------------------------------
-- §3.3  The converse wall (design §3.2, D-6) and the human door (D-26, gate material GM-5).
-- -------------------------------------------------------------------------------------
drop policy p_freeform_read_log_runtime on clara.freeform_read_log;
revoke insert on clara.freeform_read_log from clara_runtime;

-- audit_log's precedent is copied in FULL: a policy AND a table GRANT (0002:519-521 + 0002:536).
-- Postgres checks table privilege BEFORE RLS, so the policy alone is dead code no battery cell
-- routed through a definer could ever see. ARM-0 first: coalesce(rank, -1).
create policy p_freeform_read_log_human on clara.freeform_read_log for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper'));
grant select on clara.freeform_read_log to clara_authenticated;

-- =====================================================================================
-- §4  THE COMPILED SCOPE (design §3.4, D-4/D-5) — two STABLE definers, no arguments, so each
--     is a per-statement constant expression rather than a per-row call (P-10).
-- =====================================================================================
-- Both read the ARMED RECEIPT ROW, keyed on this transaction's id. That is the whole of
-- §0.1(4): there is no GUC for a payload to overwrite, and no argument through which a payload
-- can name another read. `pg_current_xact_id_if_assigned()` is NULL in a transaction that has
-- written nothing, so an un-armed transaction reads FALSE and NULL — fail-closed, both.
create function clara._freeform_admitted() returns boolean
language sql stable security definer set search_path = clara, pg_temp as $fa6_adm$
  select exists (
    select 1 from clara.freeform_read_log r
     where r.arm_txid = pg_current_xact_id_if_assigned()
       and r.settled_at is null);
$fa6_adm$;

-- Returns the compiled pin SET: NULL for HOME (firm-wide, no pin at all — never an empty array,
-- which would read as "pinned to nothing" and match no row), and a ONE-element array for a
-- client-bound session. v2's cross-client sibling returns a larger set and NOT ONE POLICY MOVES
-- (§0.1b(6)). The set comes from the CREDENTIAL, compiled at arm time onto the receipt — never
-- from a tool argument, which is the whole of TA-P9 A(1).
create function clara._freeform_scope_clients() returns uuid[]
language sql stable security definer set search_path = clara, pg_temp as $fa6_scope$
  select r.client_scope from clara.freeform_read_log r
   where r.arm_txid = pg_current_xact_id_if_assigned()
     and r.settled_at is null;
$fa6_scope$;

-- =====================================================================================
-- §5  THE ADMISSION LADDER — an UNGRANTED core (§0.1b(7)), and the granted ARM that inserts.
-- =====================================================================================
-- A Tier-A failure RAISES and therefore ABORTS: no receipt row exists for a read that never
-- got authority, and the runtime's task record is its honest home (design §3.5 Tier D).
--
-- `_freeform_core` TAKES NO SCOPE ARGUMENT AND NO VERB ARGUMENT, and that is the whole of the
-- GB-2 fold: v1's core took `p_scope text` while being (in one of three contradictory places)
-- granted, so the model could have picked its own scope. This core PICKS NOTHING — it resolves
-- the credential, validates the shape, binds the turn and runs the congruence pair, then RETURNS
-- what it found. It is granted to NOBODY (the 0077/0078 ungranted-machinery idiom), so the
-- enumerated EXECUTE list stays SEVEN; `_freeform_arm` runs as clara_fn_owner and needs no
-- grant to call it. v2's cross-client arm calls this same core rather than forcing a REPLACEMENT
-- of `_freeform_arm`'s live body — a writer body, therefore a D1 write-quiesce candidate.
create function clara._freeform_core(p_sql text, p_purpose text, p_task uuid, p_op_key text)
returns table (credential_id uuid, wake_kind text, firm_id uuid, on_behalf_of uuid, client_id uuid)
language plpgsql security definer set search_path = clara, pg_temp as $fa6_core$
declare
  w                record;
  v_task_status    text;
  v_task_session   uuid;
  v_session_client uuid;
begin
  -- A1 — authority. No credential at all. Re-resolved here rather than passed in: a core that
  -- trusts its caller's account of who is calling is not a wall, it is a parameter.
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  if w.wake_kind not in ('interactive','interactive_client') then
    raise exception 'wake kind % may not free-read', w.wake_kind using errcode = 'CLR03';
  end if;

  -- A3 — shape.
  if p_sql is null or btrim(p_sql) = '' then
    raise exception 'freeform read: p_sql is blank' using errcode = 'CLR10';
  end if;
  if length(p_sql) > 20000 then
    raise exception 'freeform read: p_sql is % characters, over the 20000 ceiling', length(p_sql) using errcode = 'CLR10';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'freeform read: p_purpose is blank' using errcode = 'CLR10';
  end if;
  if length(p_purpose) > 500 then
    raise exception 'freeform read: p_purpose is % characters, over the 500 ceiling', length(p_purpose) using errcode = 'CLR10';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'freeform read: p_op_key is blank' using errcode = 'CLR10';
  end if;

  -- A4 — TA-P4's MECHANICAL BINDING: the purpose is bound to a real turn, and the model's
  -- sentence is an annotation beside it. A task of another firm and a task that does not exist
  -- are the SAME refusal (CLR11) — this door is not an existence oracle.
  if p_task is null then
    raise exception 'freeform read: p_task is required — the receipt binds the read to the triggering turn' using errcode = 'CLR10';
  end if;
  select t.status, t.session_id into v_task_status, v_task_session
    from clara.agent_tasks t where t.id = p_task and t.firm_id = w.firm_id;
  if not found then
    raise exception 'task not found in your firm' using errcode = 'CLR11';
  end if;
  if v_task_status in ('completed','failed','cancelled','expired') then
    raise exception 'freeform read: task % is % — not a live task', p_task, v_task_status using errcode = 'CLR10';
  end if;

  -- A5 — THE SCOPE ASSERT (D-23), declared unreachable and asserted anyway. F-A2's D34 makes
  -- `interactive_client` imply a non-null client and a CHECK binds every writer, so no row that
  -- fires this can be created today; the prestate re-proves that CHECK by its live text, which
  -- is what keeps this assert honest instead of decorative.
  if w.wake_kind = 'interactive_client' and w.client_id is null then
    raise exception 'freeform read: an interactive_client credential compiled a NULL pin' using errcode = 'CLR10';
  end if;

  -- A6 — THE PIN/TURN CONGRUENCE PAIR. See the note in §6.3: this is the ONE structural,
  -- non-lexical signal of a cross-client reach that v1's argument list leaves reachable.
  select s.client_id into v_session_client from clara.chat_sessions s where s.id = v_task_session;
  if w.client_id is not null and v_session_client is distinct from w.client_id then
    raise exception 'freeform read: cross_client_unavailable — this session is bound to one client and the read reaches past it. The cross-client comparison is a NAMED action that ships as its own verb (wake_freeform_read_cross_client) in F-A6 v2; it is deferred, not forbidden.'
      using errcode = 'CLR10';
  end if;
  if w.client_id is null and v_session_client is not null then
    raise exception 'freeform read: session_pin_missing — a client-bound session presented an unpinned credential, which would read firm-wide under a client pin''s cover'
      using errcode = 'CLR03';
  end if;

  return query select w.credential_id, w.wake_kind, w.firm_id, w.on_behalf_of, w.client_id;
end
$fa6_core$;

-- -------------------------------------------------------------------------------------
-- §5.1  THE ARM — the ONE INSERT, and the only object in this file that writes the receipt.
-- -------------------------------------------------------------------------------------
create function clara._freeform_arm(p_sql text, p_purpose text, p_task uuid, p_op_key text)
returns bigint
language plpgsql security definer set search_path = clara, pg_temp as $fa6_arm$
declare
  k      record;
  w      record;
  v_txid xid8;
  v_id   bigint;
begin
  -- A1/A2 — the credential and THE ALLOWLIST, called UNCONDITIONALLY and BEFORE the shape
  -- checks (D-9). `_agent_read_admitted`'s interactive/proactive BYPASS (0011:3931-3932) is
  -- deliberately NOT reused: that bypass is why the allowlist cannot reach today's typed reads,
  -- and the new verb does not inherit it. This is what keeps `autodraft` and `proactive` out
  -- (TA-P9 A(3)). The order is load-bearing for the ORACLE too: a caller whose kind holds no row
  -- must be refused before it learns anything about its own SQL.
  select * into k from clara.wake_context();
  if k.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(k.wake_kind, 'wake_freeform_read');

  -- A3..A6 — the shared, scope-free, verb-free ladder.
  select * into w from clara._freeform_core(p_sql, p_purpose, p_task, p_op_key);

  -- A7 — ONE ARM PER TRANSACTION (CLR10 double_arm). Keyed on the transaction id, so there is
  -- no state a payload can clear. `pg_current_xact_id()` ASSIGNS, which is what lets the partial
  -- unique index hold the same property structurally as well as procedurally.
  v_txid := pg_current_xact_id();
  if exists (select 1 from clara.freeform_read_log r where r.arm_txid = v_txid) then
    raise exception 'freeform read: double_arm — this transaction has already armed a read' using errcode = 'CLR10';
  end if;

  insert into clara.freeform_read_log
    (firm_id, credential_id, query_text, purpose, verb, scope, client_scope,
     acting_actor, on_behalf_of, via_wake_kind, task_id, op_key, arm_txid)
  values
    (w.firm_id, w.credential_id, p_sql, p_purpose, 'wake_freeform_read',
     case when w.client_id is null then 'firm' else 'client' end,
     case when w.client_id is null then null else array[w.client_id] end,
     clara.agent_user_id(), w.on_behalf_of, w.wake_kind, p_task, p_op_key, v_txid)
  returning id into v_id;

  return v_id;
end
$fa6_arm$;

-- =====================================================================================
-- §6  THE SETTLE (design §3.2) — SECURITY DEFINER, the ONE permitted UPDATE, NO read id.
-- =====================================================================================
-- It settles the row THIS transaction armed, read from the transaction id. There is no
-- argument through which a payload can name another read, and a second call raises — so a
-- forged receipt can only exist in a transaction that aborts (D-20; law 28 question (vii)).
create function clara._freeform_settle(p_outcome text, p_rows int, p_bytes bigint,
                                       p_relations text[], p_ms int, p_rung jsonb)
returns void
language plpgsql security definer set search_path = clara, pg_temp as $fa6_set$
declare
  v_txid   xid8;
  v_id     bigint;
  v_done   timestamptz;
  v_reason text;
begin
  if p_outcome is null or p_outcome not in ('ok','refused','error') then
    raise exception 'freeform settle: outcome % is not one of ok/refused/error', coalesce(p_outcome,'<null>') using errcode = 'CLR10';
  end if;
  if p_rung is null or jsonb_typeof(p_rung) <> 'object' then
    raise exception 'freeform settle: the rung vector is required and must be an object' using errcode = 'CLR10';
  end if;
  v_txid := pg_current_xact_id_if_assigned();
  if v_txid is null then
    raise exception 'freeform settle: this transaction has armed nothing' using errcode = 'CLR10';
  end if;
  select r.id, r.settled_at into v_id, v_done
    from clara.freeform_read_log r where r.arm_txid = v_txid;
  if not found then
    raise exception 'freeform settle: this transaction has armed nothing' using errcode = 'CLR10';
  end if;
  if v_done is not null then
    raise exception 'freeform settle: double_settle — receipt % is already settled', v_id using errcode = 'CLR10';
  end if;
  -- The refusal token travels in the vector under the reserved key `reason` (the signature is
  -- fixed by the design and carries no reason argument). A refusal with no named reason is
  -- REFUSED rather than settled: ck_freeform_settled would catch it, and catching it here names
  -- the defect instead of surfacing a bare 23514.
  v_reason := nullif(btrim(coalesce(p_rung->>'reason','')), '');
  if p_outcome <> 'ok' and v_reason is null then
    raise exception 'freeform settle: outcome % carries no reason token in the rung vector', p_outcome using errcode = 'CLR10';
  end if;
  if p_outcome = 'ok' and v_reason is not null then
    raise exception 'freeform settle: outcome ok carries a reason token (%)', v_reason using errcode = 'CLR10';
  end if;

  update clara.freeform_read_log r
     set settled_at     = now(),
         outcome        = p_outcome,
         refusal_reason = v_reason,
         rung_vector    = p_rung,
         relations_read = p_relations,
         row_count      = p_rows,
         byte_count     = p_bytes,
         duration_ms    = p_ms
   where r.id = v_id;
end
$fa6_set$;

-- =====================================================================================
-- §6.1  THE VERB (design §3.2/§3.3, D-18/D-19) — ONE verb, ONE body, SECURITY INVOKER.
-- =====================================================================================
-- SECURITY INVOKER is the whole mechanism: the composed SQL runs with the CALLER's privileges,
-- so the wall is the GRANT and the POLICY and not a string check — ARCHITECTURE.md:87-90's claim
-- made true for the first time. `SET search_path` is pinned even though T18 only requires it of
-- definers: an invoker body running dynamic SQL would otherwise resolve the payload's unqualified
-- names against whatever search_path the session was left holding.
--
-- NO `SET statement_timeout` clause, and that is deliberate: MEASURED (§0.1(2)), a GUC changed
-- after a top-level statement has started does not re-arm that statement's timer, so such a
-- clause would be decoration. The deadline of record is the clock check in the fetch loop.
create function clara.wake_freeform_read(p_sql text, p_purpose text, p_task uuid,
                                         p_op_key text, p_row_cap int)
returns jsonb
language plpgsql security invoker set search_path = clara, pg_temp as $fa6_verb$
declare
  -- Engineering values, not law (D-14 / OQ-C: build with a number, measure, tune once).
  c_row_cap_max  constant int     := 5000;
  c_byte_cap     constant bigint  := 1048576;      -- 1 MiB
  c_deadline_ms  constant int     := 5000;
  c_plan_ceiling constant numeric := 5000000;
  v_read_id  bigint;
  v_cap      int;
  v_composed text;
  v_cur      refcursor;
  v_t0       timestamptz;
  v_row      jsonb;
  v_rows     jsonb := '[]'::jsonb;
  v_n        int    := 0;
  v_bytes    bigint := 0;
  v_plan     json;
  v_rels     text[];            -- NULL until a plan exists (law 68: NULL, not empty)
  v_bad      text[];
  v_cost     numeric;
  v_ms       int;
  v_msg      text;
  v_reason   text;
  -- The three-valued vector. `not_evaluable` is the DEFAULT, so a rung that was never reached
  -- can never read as a pass (law 68).
  b_shape    text := 'not_evaluable';
  b_rel      text := 'not_evaluable';
  b_cost     text := 'not_evaluable';
  b_rowcap   text := 'not_evaluable';
  b_bytecap  text := 'not_evaluable';
begin
  v_t0 := clock_timestamp();

  -- ---- TIER A, in the DEFINER arm. A raise here aborts and leaves NO receipt. -------------
  v_read_id := clara._freeform_arm(p_sql, p_purpose, p_task, p_op_key);

  if p_row_cap is not null and p_row_cap < 1 then
    raise exception 'freeform read: p_row_cap % is below 1', p_row_cap using errcode = 'CLR10';
  end if;
  v_cap := least(coalesce(p_row_cap, c_row_cap_max), c_row_cap_max);

  -- The single composed text. ONE variable reaches both the receipt and the executor, which is
  -- the whole of R-3's text identity: `_freeform_arm` recorded p_sql, and p_sql is what is
  -- wrapped here. There is no second string.
  v_composed := format('select to_jsonb(t) from (%s) t', p_sql);

  -- ---- 1. THE SINGLE-STATEMENT WALL — the cursor OPENS FIRST (D-18, folding GB-3). ---------
  -- v1 ran the plan census through a plain plpgsql EXECUTE *before* this, and SPI_execute runs a
  -- multi-statement string IN FULL — so the design's own injection payloads would have executed
  -- their stacked statements at a step with no single-statement guarantee. Inverted:
  -- OPEN ... FOR EXECUTE refuses a multi-query plan at PREPARE, before any part of the string
  -- runs (MEASURED: 42P11, and the stacked INSERT left no trace), and opening a portal produces
  -- no rows and runs no volatile function — those happen at FETCH, after the census.
  begin
    open v_cur for execute v_composed;
    b_shape := 'pass';
  exception
    -- TIER C, on (sqlstate, reason) PAIRS ONLY, no wildcards and no sqlstate-only members
    -- (F-A2's D6: a wildcard classifier once swallowed the one wall that mattered).
    when sqlstate '42P11' then
      -- "cannot open multi-query plan as cursor" — the pair v1 was missing, without which the
      -- single most audit-worthy event (an attempted injection) left NO receipt at all.
      b_shape := 'fail'; v_reason := 'statement_shape';
    when sqlstate '42601' then
      -- The derived-table trap's own output: `set role` / `reset role` / a bare `insert` /
      -- a `--` comment eating the wrapper's suffix are SYNTAX errors, never statement_shape.
      -- B1 stays not_evaluable: a parse failure does not answer "is it one statement".
      v_reason := 'malformed_statement';
    when sqlstate '42P01' then
      v_reason := 'unknown_relation';
    when sqlstate '0A000' then
      v_reason := 'feature_not_permitted';
    when sqlstate '42501' then
      -- Postgres gives no structured object kind for a privilege error, so the two pairs are
      -- separated on its own message. NAMED RESIDUAL: this reads a projection, not the thing
      -- (law 3) — and it is safe here because BOTH tokens return the SAME string to the model
      -- (oracle discipline, Annex D.2), so a misclassification can only mislabel the receipt,
      -- never leak whether a relation or a function was the wall.
      get stacked diagnostics v_msg = message_text;
      v_reason := case when position(' for function ' in v_msg) > 0 then 'function_denied'
                       else 'relation_denied' end;
  end;

  if v_reason is null then
    -- ---- 2. THE PLAN CENSUS, on text Postgres has CERTIFIED as one statement (D-24). -------
    -- A CATALOG wall, and the design says so: for anything ungranted the GRANT fires one wall
    -- earlier (MEASURED: both EXPLAIN and the cursor OPEN raise 42501 for an ungranted relation),
    -- so `relation_not_enumerated` is reachable only for PUBLIC-readable catalog relations —
    -- `pg_proc.prosrc`, which carries every wall's own source, `pg_class`, and anything
    -- information_schema expands into. That class alone justifies the second parse: nothing else
    -- in this design refuses `select prosrc from pg_proc`.
    -- VERBOSE is REQUIRED (§0.1(1)): without it the plan carries no "Schema" key.
    begin
      execute 'explain (format json, verbose true) ' || v_composed into v_plan;
    exception
      when sqlstate '42501' then
        get stacked diagnostics v_msg = message_text;
        v_reason := case when position(' for function ' in v_msg) > 0 then 'function_denied'
                         else 'relation_denied' end;
      when sqlstate '42P01' then v_reason := 'unknown_relation';
      when sqlstate '0A000' then v_reason := 'feature_not_permitted';
    end;
  end if;

  if v_reason is null then
    select coalesce(array_agg(distinct coalesce(x->>'Schema','?') || '.' || (x->>'Relation Name')), '{}')
      into v_rels
      from jsonb_path_query(to_jsonb(v_plan), '$.**') as x
     where jsonb_typeof(x) = 'object' and (x->>'Relation Name') is not null;

    -- THE ENUMERATION IS THE GRANT ITSELF, read from the catalog — never a second hand-kept
    -- list that could drift from §7. A relation is enumerated iff it is in schema `clara` AND
    -- clara_freeform_ro holds SELECT on it. pg_catalog and information_schema's expansions fail
    -- the schema conjunct; an un-granted clara relation never reaches here at all.
    select coalesce(array_agg(r), '{}') into v_bad
      from unnest(v_rels) r
     where split_part(r, '.', 1) <> 'clara'
        or to_regclass(r) is null
        or not has_table_privilege('clara_freeform_ro', to_regclass(r), 'SELECT');

    if array_length(v_bad, 1) is not null then
      b_rel := 'fail'; v_reason := 'relation_not_enumerated';
    else
      b_rel := 'pass';
      v_cost := (to_jsonb(v_plan) -> 0 -> 'Plan' ->> 'Total Cost')::numeric;
      if v_cost is null then
        b_cost := 'not_evaluable';          -- an absent input is never a pass (law 68)
      elsif v_cost > c_plan_ceiling then
        b_cost := 'fail'; v_reason := 'plan_cost_ceiling';
      else
        b_cost := 'pass';
      end if;
    end if;
  end if;

  -- ---- 3. FETCH, DON'T SLURP. The caps and the DEADLINE are measured as they accumulate. ----
  if v_reason is null then
    b_rowcap  := 'pass';
    b_bytecap := 'pass';
    begin
      loop
        fetch v_cur into v_row;
        exit when not found;
        v_n     := v_n + 1;
        v_bytes := v_bytes + octet_length(v_row::text);
        if v_n > v_cap then
          b_rowcap := 'fail'; v_reason := 'result_row_cap'; exit;
        end if;
        if v_bytes > c_byte_cap then
          b_bytecap := 'fail'; v_reason := 'result_byte_cap'; exit;
        end if;
        -- The deadline is a plpgsql CLOCK CHECK, not a payload-settable GUC: a non-local
        -- set_config('statement_timeout', …) from inside the payload cannot move this, and
        -- MEASURED (§0.1(2)) a GUC-borne timeout could not have produced a receipt anyway.
        if extract(epoch from (clock_timestamp() - v_t0)) * 1000 > c_deadline_ms then
          v_reason := 'read_timeout'; exit;
        end if;
        v_rows := v_rows || jsonb_build_array(v_row);
      end loop;
    exception
      when sqlstate '42501' then
        get stacked diagnostics v_msg = message_text;
        v_reason := case when position(' for function ' in v_msg) > 0 then 'function_denied'
                         else 'relation_denied' end;
      when sqlstate '0A000' then v_reason := 'feature_not_permitted';
    end;
  end if;

  begin close v_cur; exception when others then null; end;

  v_ms := greatest(0, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  perform clara._freeform_settle(
    case when v_reason is null then 'ok' else 'refused' end,
    v_n, v_bytes, v_rels, v_ms,
    jsonb_build_object(
      'statement_shape',          b_shape,
      'relation_not_enumerated',  b_rel,
      'plan_cost_ceiling',        b_cost,
      'result_row_cap',           b_rowcap,
      'result_byte_cap',          b_bytecap,
      'reason',                   v_reason));

  -- TA-P10 C′, flattened and not nested (the F-A2 D24 lesson). The label is TOLD to the model;
  -- what ENFORCES it is that this role holds no grant that could write anything (D-27).
  return jsonb_build_object(
    'ok',             v_reason is null,
    'read_id',        v_read_id,
    'authority',      'narrative',
    'claim_eligible', false,
    'outcome',        case when v_reason is null then 'ok' else 'refused' end,
    'refusal_reason', v_reason,
    'rung_vector',    jsonb_build_object(
        'statement_shape', b_shape, 'relation_not_enumerated', b_rel,
        'plan_cost_ceiling', b_cost, 'result_row_cap', b_rowcap,
        'result_byte_cap', b_bytecap),
    'relations_read', to_jsonb(v_rels),
    'row_count',      v_n,
    'byte_count',     v_bytes,
    'duration_ms',    v_ms,
    'rows',           case when v_reason is null then v_rows else '[]'::jsonb end);
end
$fa6_verb$;

-- =====================================================================================
-- §6.3  THE TWO REFUSALS THIS FILE HAD TO DECIDE, RECORDED HERE RATHER THAN SMOOTHED OVER.
-- =====================================================================================
-- (a) `cross_client_unavailable`. The design keeps it a REACHABLE Tier-A raise (§3.5, Annex D.3,
--     forced by F.1 and F.5) while D-19 removes the only argument that could have carried the
--     intent (`p_scope`, gone with the shared core). There is no other lexical-filter-free
--     signal in the verb's five arguments. MEASURED, this file found one: the read is bound to a
--     turn (TA-P4), the turn has a session, and `clara.chat_sessions.client_id` is the session's
--     client. A client-pinned credential presented against a turn whose session is bound
--     elsewhere IS the cross-client reach, structurally and without reading one character of the
--     SQL. §5's A6 raises it there, and the message NAMES the deferred v2 action rather than
--     implying the read is forbidden (D-22's honest half).
-- (b) `session_pin_missing` is a TOKEN THIS FILE ADDS, and the reason is that D-23's premise is
--     FALSE. D-23 says the "client-bound session that fell back to plain `interactive`" failure
--     is "invisible to the DB by construction" and walls it in the runtime mint census. It is
--     not invisible: the same `p_task` -> `agent_tasks.session_id` -> `chat_sessions.client_id`
--     path sees it exactly. The runtime census (F.4) stays — belts, not substitutes — and the
--     DB now refuses it too. This is an ADDITION to the vocabulary, never a weakening.
--     MEASURED CAVEAT, stated because it decides the shape: `clara.begin_chat_turn` does NOT set
--     `agent_tasks.client_id` (it is NULL on every chat turn), so the congruence pair is keyed
--     on the SESSION's client and never on the task's.
-- =====================================================================================

-- =====================================================================================
-- §7  THE ENUMERATED SURFACE (Annex A) — 35 relations, SEVEN functions, and nothing else.
-- =====================================================================================
grant select on
  clara.journal_entries, clara.journal_lines, clara.coa_accounts, clara.journal_entry_revisions,
  clara.documents, clara.document_filings,
  clara.entry_evidence, clara.counterparties, clara.counterparty_aliases,
  clara.open_items, clara.open_item_allocations,
  clara.bank_accounts, clara.bank_statements, clara.bank_statement_lines, clara.bank_matches,
  clara.bank_match_line_members, clara.bank_match_entry_members, clara.bank_reconciliations,
  clara.bank_line_exceptions,
  clara.fixed_assets, clara.fa_depreciation, clara.staff_advances, clara.staff_advance_applications,
  clara.fiscal_years, clara.close_runs, clara.period_snapshots, clara.reporting_periods,
  clara.compliance_watches,
  clara.open_questions, clara.coding_tasks, clara.notifications,
  clara.clients, clara.users, clara.firms, clara.sst_threshold_schedule
  to clara_freeform_ro;

-- The SEVEN. `wake_client()` is NOT among them: nothing in the invoker layer and no policy arm
-- below calls it, the pin being compiled by `_freeform_scope_clients()` and the credential read
-- by a DEFINER that needs no grant (D-21). `assert_wake_allowed` is likewise absent — it is
-- called from inside `_freeform_arm`, which runs as clara_fn_owner.
revoke execute on function
  clara.wake_freeform_read(text,text,uuid,text,int),
  clara._freeform_core(text,text,uuid,text),
  clara._freeform_arm(text,text,uuid,text),
  clara._freeform_settle(text,int,bigint,text[],int,jsonb),
  clara._freeform_scope_clients(), clara._freeform_admitted(),
  clara._tf_freeform_settle_once(), clara._tf_freeform_must_settle()
  from public;

-- `_freeform_core` is DELIBERATELY ABSENT from this grant: it is the ungranted machinery
-- (§0.1b(7)). Its ONLY caller is `_freeform_arm`, a DEFINER owned by clara_fn_owner.
grant execute on function
  clara.wake_freeform_read(text,text,uuid,text,int),
  clara._freeform_arm(text,text,uuid,text),
  clara._freeform_settle(text,int,bigint,text[],int,jsonb),
  clara._freeform_scope_clients(), clara._freeform_admitted(),
  clara.wake_firm(), clara.shares_my_firm_wake(uuid)
  to clara_freeform_ro;

-- =====================================================================================
-- §8  THE POLICIES (design §3.4, Annex B) — one per enumerated relation, ROLE-PINNED, so
--     every one of them is purely ADDITIVE to the existing estate (P-6, both directions).
-- =====================================================================================
-- `_freeform_admitted()` is a conjunct in EVERY arm, and that is what makes "no receipt, no
-- read" STRUCTURAL rather than procedural: un-armed, every enumerated relation returns ZERO
-- ROWS — whatever statement is issued, through the verb or not. It is stronger than the DEFINER
-- wrapper TA-P4's parenthetical named, and the wrapper is still there: it is `_freeform_arm`,
-- and it is the thing that cannot be skipped.
do $fa6_pol$
declare t text;
begin
  -- S-1 · firm + client (30 relations).
  foreach t in array array[
    'journal_entries','journal_lines','coa_accounts','journal_entry_revisions',
    'document_filings','entry_evidence','counterparties','counterparty_aliases',
    'open_items','open_item_allocations',
    'bank_accounts','bank_statements','bank_statement_lines','bank_matches',
    'bank_match_line_members','bank_match_entry_members','bank_reconciliations','bank_line_exceptions',
    'fixed_assets','fa_depreciation','staff_advances','staff_advance_applications',
    'fiscal_years','close_runs','period_snapshots','reporting_periods','compliance_watches',
    'open_questions','coding_tasks','notifications'
  ] loop
    -- The pin conjunct is written `(pins is null or client_id = any (pins))` and NEVER
    -- `coalesce(pin, client_id)`: the coalesce form reads as "compare the row to itself" the
    -- moment the pin is NULL, which is a wall that always passes. NULL means firm-wide; an
    -- EMPTY array would mean "pinned to nothing" and match no row, which is why the compiler
    -- returns NULL for HOME and never `'{}'`.
    -- `notifications.client_id` is NULLABLE: under a pin such a row is invisible (NULL = any(…)
    -- is not true), which is the fail-closed direction and is stated rather than discovered.
    execute format(
      'create policy p_%s_freeform on clara.%I for select to clara_freeform_ro
         using (firm_id = clara.wake_firm()
                and (clara._freeform_scope_clients() is null
                     or client_id = any (clara._freeform_scope_clients()))
                and clara._freeform_admitted())', t, t);
  end loop;
end
$fa6_pol$;

-- S-1c · `clients` is its own arm and the reason is a SILENT-BUG CLASS: it has no `client_id`
-- column, so the pin must compare `id`. Written as S-1 it would be a migration error; "fixed" by
-- dropping the conjunct it would return EVERY client of the firm from inside a client-pinned
-- session, which is the leak the pin exists to prevent.
create policy p_clients_freeform on clara.clients for select to clara_freeform_ro
  using (firm_id = clara.wake_firm()
         and (clara._freeform_scope_clients() is null
              or id = any (clara._freeform_scope_clients()))
         and clara._freeform_admitted());

-- S-1d · `documents` — A DESIGN CORRECTION, MEASURED (§0.1b(5)). Annex A.1 puts `documents` in
-- the S-1 band and the survey's §3.5 table lists it under "firm + client". Both are FALSE at the
-- bytes: `clara.documents` has `firm_id` and NO `client_id` at all — the client attribution
-- lives in `clara.document_filings`. Written as S-1 this policy would not compile; written
-- firm-only it would expose every sibling client's document metadata from inside a client-pinned
-- session, the exact failure D-28/OQ-E names for `document_extractions`/`document_regions`.
--
-- THE JOIN READS THE **LIVE** FILING (`retired_at is null`), and that conjunct is the whole
-- correctness of the arm. A filing correction (client A -> client B) RETIRES A's row and writes
-- B's; without the conjunct A would keep reading the document forever while B, the client it
-- actually belongs to, would be reading it too. With it, attribution follows the correction.
-- Under HOME (pin NULL) this is identical to S-1; under a pin it is strictly narrower; and an
-- UNFILED document — no filing row, therefore no client attribution — is invisible, which is
-- the fail-closed reading rather than an oversight.
create policy p_documents_freeform on clara.documents for select to clara_freeform_ro
  using (firm_id = clara.wake_firm()
         and (clara._freeform_scope_clients() is null
              or exists (select 1 from clara.document_filings f
                          where f.document_id = documents.id
                            and f.retired_at is null
                            and f.client_id = any (clara._freeform_scope_clients())))
         and clara._freeform_admitted());

-- S-3 · global reference. `sst_threshold_schedule` has no firm column at all, so the firm
-- disjunct is OMITTED rather than written against a column that does not exist.
create policy p_sst_threshold_schedule_freeform on clara.sst_threshold_schedule for select to clara_freeform_ro
  using (clara._freeform_admitted());

-- S-4 · identity. `users` uses the 0002:499-500 idiom, resolved against the caller's OWN firm
-- internally — which is why `shares_my_firm_wake` is one of the SEVEN (D-16: "who asked this?"
-- is a question the free read is expected to answer, and a name join is cheaper than a typed
-- reader per question).
create policy p_users_freeform on clara.users for select to clara_freeform_ro
  using (clara.shares_my_firm_wake(id) and clara._freeform_admitted());
create policy p_firms_freeform on clara.firms for select to clara_freeform_ro
  using (id = clara.wake_firm() and clara._freeform_admitted());

-- =====================================================================================
-- §9  THE ALLOWLIST — EXACTLY TWO ROWS (design §3.8). Unattended lanes get NO row, which is
--     what refuses them (TA-P9 A(3)); v2 EXTENDS this roster with its sibling's row rather
--     than re-cutting it.
-- =====================================================================================
insert into clara.wake_fn_allowlist (wake_kind, function_name) values
  ('interactive',        'wake_freeform_read'),
  ('interactive_client', 'wake_freeform_read');

-- =====================================================================================
-- §10  THE TAIL — a self-proof that RAISES on failure, and the LAW-34 AUDIT LINE printed by
--      the thing that installed the surface (Annex E.1: printed by the migration, not retyped
--      by a document; PR-4 publishes this text verbatim).
-- =====================================================================================
do $fa6_tail$
declare
  v_rels      text[];
  v_fns       text[];
  v_agent     text[];
  v_only_ff   text[];
  v_only_ag   text[];
  v_pol       text[];
  v_n         int;
  v_extra     text[];
  v_line      text;
begin
  -- (1) THE RELATION SET, DERIVED FROM THE CATALOG.
  select coalesce(array_agg(distinct c.relname order by c.relname), '{}') into v_rels
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'clara' and c.relkind in ('r','p','v','m')
     and has_table_privilege('clara_freeform_ro', c.oid, 'SELECT');
  if array_length(v_rels,1) is distinct from 35 then
    raise exception 'F-A6 PR-1 tail: clara_freeform_ro holds SELECT on % relation(s), expected 35: %',
      coalesce(array_length(v_rels,1),0), array_to_string(v_rels,', ') using errcode = 'CLR10';
  end if;
  -- The audit spine, the authority spine, the wiki cohort and the runtime's own state are OUT,
  -- and this cell says so by asking rather than by asserting the count alone.
  select coalesce(array_agg(x order by x), '{}') into v_extra from unnest(v_rels) x
   where x in ('audit_log','op_receipts','freeform_read_log','wake_credentials','wake_fn_allowlist',
               'firm_admissions','firm_memberships','chat_sessions','chat_messages','agent_tasks',
               'task_usage','trace_spans','domain_events','document_extractions','document_regions',
               'llm_usage_events','firm_usage_daily')
      or x like 'wiki%';
  if array_length(v_extra,1) is not null then
    raise exception 'F-A6 PR-1 tail: the enumerated surface reaches an EXCLUDED relation: %',
      array_to_string(v_extra,', ') using errcode = 'CLR10';
  end if;

  -- (2) THE FUNCTION SET, DERIVED THE SAME WAY — every function in clara, probed.
  select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
    into v_fns
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara' and has_function_privilege('clara_freeform_ro', p.oid, 'EXECUTE');
  if array_length(v_fns,1) is distinct from 7 then
    raise exception 'F-A6 PR-1 tail: clara_freeform_ro holds EXECUTE on % function(s), expected 7: %',
      coalesce(array_length(v_fns,1),0), array_to_string(v_fns,E'\n  ') using errcode = 'CLR10';
  end if;
  -- PUBLIC holds nothing on anything this file created (a new function is PUBLIC-executable by
  -- default; the revoke in §7 is what makes the count above true for every OTHER role too).
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where ns.nspname='clara' and a.grantee = 0 and a.privilege_type='EXECUTE'
                and p.proname in ('wake_freeform_read','_freeform_core','_freeform_arm','_freeform_settle',
                                  '_freeform_scope_clients','_freeform_admitted',
                                  '_tf_freeform_settle_once','_tf_freeform_must_settle')) then
    raise exception 'F-A6 PR-1 tail: PUBLIC holds EXECUTE on an F-A6 function' using errcode = 'CLR10';
  end if;
  -- Exactly one overload each — a stray second overload is how a "recreate" leaves an old body
  -- callable.
  -- The ungranted core is proved UNGRANTED here, in both directions: it must exist, and NO role
  -- may hold EXECUTE on it. A core that quietly acquired a grant is v1's GB-2 defect returning.
  if to_regprocedure('clara._freeform_core(text,text,uuid,text)') is null then
    raise exception 'F-A6 PR-1 tail: clara._freeform_core is absent' using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(g.rolname order by g.rolname), '{}') into v_extra
    from pg_roles g
   where g.rolname <> 'clara_fn_owner'
     and (g.rolname like 'clara\_%' or g.rolname = current_user)
     and has_function_privilege(g.oid, 'clara._freeform_core(text,text,uuid,text)'::regprocedure, 'EXECUTE');
  if array_length(v_extra,1) is not null then
    raise exception 'F-A6 PR-1 tail: clara._freeform_core is EXECUTE-reachable by %; it is the ungranted machinery and its only caller is _freeform_arm',
      array_to_string(v_extra,', ') using errcode = 'CLR10';
  end if;

  for v_line in select unnest(array['wake_freeform_read','_freeform_core','_freeform_arm','_freeform_settle',
                                    '_freeform_scope_clients','_freeform_admitted']) loop
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname='clara' and p.proname = v_line;
    if v_n <> 1 then
      raise exception 'F-A6 PR-1 tail: clara.% has % overloads, expected 1', v_line, v_n using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE POLICIES — one per enumerated relation, all role-pinned to clara_freeform_ro, and
  --     EVERY one of them carrying the `_freeform_admitted()` conjunct. A policy that lost it
  --     would read without a receipt, which is the one thing this design may not permit.
  select coalesce(array_agg(distinct cl.relname order by cl.relname), '{}') into v_pol
    from pg_policy pol join pg_class cl on cl.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname='clara' and pol.polname like 'p\_%\_freeform'
     and pol.polroles = array[(select oid from pg_roles where rolname='clara_freeform_ro')]::oid[];
  if v_pol is distinct from v_rels then
    raise exception 'F-A6 PR-1 tail: the freeform POLICY set and the freeform GRANT set differ. policies=% grants=%',
      array_to_string(v_pol,', '), array_to_string(v_rels,', ') using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(cl.relname order by cl.relname), '{}') into v_extra
    from pg_policy pol join pg_class cl on cl.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname='clara' and pol.polname like 'p\_%\_freeform'
     and position('_freeform_admitted()' in pg_get_expr(pol.polqual, pol.polrelid)) = 0;
  if array_length(v_extra,1) is not null then
    raise exception 'F-A6 PR-1 tail: freeform policy on % carries NO _freeform_admitted() conjunct',
      array_to_string(v_extra,', ') using errcode = 'CLR10';
  end if;
  -- Every SELECT policy must be `for select` and permissive-to-this-role only.
  if exists (select 1 from pg_policy pol join pg_class cl on cl.oid = pol.polrelid
              join pg_namespace ns on ns.oid = cl.relnamespace
              where ns.nspname='clara' and pol.polname like 'p\_%\_freeform'
                and (pol.polcmd <> 'r' or pol.polwithcheck is not null)) then
    raise exception 'F-A6 PR-1 tail: a freeform policy is not a pure SELECT policy' using errcode='CLR10';
  end if;

  -- (4) THE RECEIPT'S WRITER SURFACE — exactly two bodies, no third, and no app role holds
  --     INSERT or UPDATE. This is the converse wall TA-P4 needs and does not name.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='clara' and table_name='freeform_read_log'
                and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
                and grantee <> 'clara_fn_owner') then
    raise exception 'F-A6 PR-1 tail: a role other than clara_fn_owner holds write privilege on clara.freeform_read_log' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_policy where polrelid='clara.freeform_read_log'::regclass
               and polname='p_freeform_read_log_runtime') then
    raise exception 'F-A6 PR-1 tail: p_freeform_read_log_runtime survived the drop' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.role_table_grants
                  where table_schema='clara' and table_name='freeform_read_log'
                    and grantee='clara_authenticated' and privilege_type='SELECT') then
    raise exception 'F-A6 PR-1 tail: the human GRANT SELECT is missing — the bookkeeper+ policy would be dead code behind a 42501 (GM-5)' using errcode='CLR10';
  end if;
  if (select count(*) from clara.freeform_read_log) <> 0 then
    raise exception 'F-A6 PR-1 tail: the migration wrote a freeform receipt' using errcode='CLR10';
  end if;
  -- The three triggers exist, and the must-settle one is genuinely DEFERRED (a constraint
  -- trigger created NOT DEFERRABLE would fire at statement end and refuse every arm).
  if not exists (select 1 from pg_trigger where tgrelid='clara.freeform_read_log'::regclass
                   and tgname='t_freeform_must_settle' and tgdeferrable and tginitdeferred) then
    raise exception 'F-A6 PR-1 tail: t_freeform_must_settle is absent or not INITIALLY DEFERRED' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='clara.freeform_read_log'::regclass and tgname='t_freeform_settle_once')
     or not exists (select 1 from pg_trigger where tgrelid='clara.freeform_read_log'::regclass and tgname='t_freeform_no_truncate') then
    raise exception 'F-A6 PR-1 tail: a settle-once trigger is absent' using errcode='CLR10';
  end if;

  -- (5) THE ALLOWLIST, IN BOTH DIRECTIONS — RELATIVELY, never as an absolute roster count.
  select count(*)::int into v_n from clara.wake_fn_allowlist where function_name='wake_freeform_read';
  if v_n <> 2 then
    raise exception 'F-A6 PR-1 tail: wake_freeform_read holds % allowlist row(s), expected exactly 2', v_n using errcode='CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name='wake_freeform_read'
               and wake_kind not in ('interactive','interactive_client')) then
    raise exception 'F-A6 PR-1 tail: wake_freeform_read is allowlisted for a kind outside {interactive, interactive_client}' using errcode='CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where wake_kind in ('autodraft','proactive')
               and function_name='wake_freeform_read') then
    raise exception 'F-A6 PR-1 tail: an unattended lane was allowlisted for the free read' using errcode='CLR10';
  end if;
  -- F-A2's own row is untouched: this file EXTENDS interactive_client's roster, never re-cuts it.
  if not exists (select 1 from clara.wake_fn_allowlist
                  where wake_kind='interactive_client' and function_name='wake_open_question') then
    raise exception 'F-A6 PR-1 tail: F-A2''s interactive_client|wake_open_question row is GONE — this file must extend, never re-cut' using errcode='CLR10';
  end if;

  -- (6) THE NEW ROLES HOLD NO DML ANYWHERE, and the login shell is not a login yet.
  if exists (select 1 from information_schema.role_table_grants
              where grantee in ('clara_freeform_ro','clara_freeform_login')
                and privilege_type <> 'SELECT') then
    raise exception 'F-A6 PR-1 tail: a clara_freeform_* role holds a non-SELECT table privilege' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_roles where rolname in ('clara_freeform_ro','clara_freeform_login')
               and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole)) then
    raise exception 'F-A6 PR-1 tail: a clara_freeform_* role carries LOGIN/SUPERUSER/BYPASSRLS/CREATEROLE' using errcode='CLR10';
  end if;

  -- (7) THE DIFFERENCE AGAINST clara_agent_ro's ACCUMULATED SELECT SET (P-3) — the whole reason
  --     TA-P9 A(2) ruled a NEW role instead of reusing the old one.
  select coalesce(array_agg(distinct c.relname order by c.relname), '{}') into v_agent
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname='clara' and c.relkind in ('r','p','v','m')
     and has_table_privilege('clara_agent_ro', c.oid, 'SELECT');
  select coalesce(array_agg(x order by x),'{}') into v_only_ff from unnest(v_rels) x where x <> all (v_agent);
  select coalesce(array_agg(x order by x),'{}') into v_only_ag from unnest(v_agent) x where x <> all (v_rels);

  raise notice E'F-A6 PR-1 AUDIT LINE (law 34 — printed by the migration that installed it).\n'
    '  ENUMERATED RELATIONS (%): %\n'
    '  ENUMERATED FUNCTIONS (%): %\n'
    '  ALLOWLIST ROWS for wake_freeform_read (2): interactive | interactive_client\n'
    '  clara_agent_ro holds SELECT on % relation(s). Readable by the FREE READ and not by the '
    'accumulated agent surface (%): %. Readable by the accumulated agent surface and NOT by the '
    'free read (%): %.',
    array_length(v_rels,1), array_to_string(v_rels, ', '),
    array_length(v_fns,1),  array_to_string(v_fns, ', '),
    coalesce(array_length(v_agent,1),0),
    coalesce(array_length(v_only_ff,1),0), array_to_string(v_only_ff, ', '),
    coalesce(array_length(v_only_ag,1),0), array_to_string(v_only_ag, ', ');

  raise notice 'F-A6 PR-1 tail: OK -- two new roles (clara_freeform_ro group + the fourth login clara_freeform_login, member of it ALONE, NOLOGIN until the operator ceremony); the admission ladder sits in the UNGRANTED clara._freeform_core, which takes no scope and no verb argument and is EXECUTE-reachable by no role at all; the compiled pin is a uuid[] set (NULL = firm-wide, one element = the credential''s client), so F-A6 v2 widens a set instead of re-cutting 35 policies; SELECT on exactly 35 enumerated relations and EXECUTE on exactly 7 functions, both DERIVED from the catalog and both excluding the audit spine, the authority spine, the wiki cohort, the runtime state and the OCR/structured-parse tables; 35 role-pinned SELECT policies, one per relation, EVERY one carrying the _freeform_admitted() conjunct, so an un-armed transaction reads ZERO ROWS from all 35; clara.freeform_read_log ALTERed in place over ZERO rows with the settle-once + no-truncate + DEFERRED must-settle triggers, the bookkeeper+ human policy AND its table GRANT, and 0002:542''s runtime INSERT grant plus p_freeform_read_log_runtime BOTH REMOVED -- the receipt now has exactly two writer bodies and no third; exactly two allowlist rows, both interactive-family, F-A2''s own interactive_client row untouched; PUBLIC holds zero EXECUTE and every new function carries exactly one overload. No live body was CoR''d, so no D1 write-quiesce was required. No table in workflow/graphile_worker/spike touched.';
end
$fa6_tail$;
