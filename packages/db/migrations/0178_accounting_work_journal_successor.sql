-- #623 — THE FIRST PERSISTENT CLARA SUCCESSOR: a documentless journal entry.
-- =====================================================================================
-- Spec of record: issue #612 (Implementation Decisions §1, §2, §4, §5), ticket #623, journeys
-- B3 / B6 / C3. Domain words: CONTEXT.md — "Accounting work", "Accounting basis", "Accounting
-- operation", "Posted journal entry".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A durable, client-scoped unit of ACCOUNTING WORK with a
-- server-assigned LOGICAL OPERATION IDENTITY, one `agent_tasks` run per attempt, and one wake
-- verb that turns that identity into exactly one approved journal entry plus exactly one
-- operation receipt — or into a typed refusal that writes nothing at all.
--
-- =====================================================================================
-- DEPLOY ORDER. THIS MIGRATION CARRIES NO CONSUMER-FIRST OBLIGATION, and the reason is
-- structural rather than a judgement call: every object here is NEW. `accounting_work` and
-- `operation_receipts` did not exist; `agent_tasks.kind = 'accounting_work'` is a value no live
-- writer can produce until `clara.admit_journal_work` (created here) is called; the four runtime
-- verbs and the one wake verb have no callers on any deployed runtime. NO EXISTING LANE READS OR
-- WRITES THE NEW KIND, so no consumer can checkpoint a new-kind task as irrelevant and strand it,
-- which is the failure mode 0177's consumer-first rule exists for.
--
-- The ONE live body this file replaces is `clara._tf_assert_agent_post_receipt` (0106 §B), and it
-- is replaced with a STRICT WIDENING: every entry the old body admitted, the new body admits; the
-- only added behaviour is that an operation-shaped receipt now counts as the entry's one receipt.
-- No agent post that was legal before this migration becomes illegal after it, so the replacement
-- may be applied in either order relative to any consumer. It still rides the repository's writer
-- quiescence window for function-body replacement, because a call already executing finishes on
-- its previous body.
--
-- ROLLBACK is a NEW append-only migration that restores the prior wall body and drops nothing:
-- an applied migration is never edited or deleted (packages/db/README.md).
--
-- =====================================================================================
-- WHICH ESTATE CORES ARE REUSED, AND THE ONE THIS FILE DELIBERATELY DOES NOT USE.
--
-- REUSED, by call, never re-implemented:
--   clara._reserve_op / clara._finish_op   the estate's reserve-before-effect idempotency
--   clara._hash                            the estate's canonical jsonb digest primitive
--   clara._validate_entry_lines            line normalisation + account existence/active
--   clara._assert_balanced                 Σdebit = Σcredit and total > 0
--   clara.role_rank / clara.firm_memberships   the live membership + bookkeeper floor
--   clara.wake_context / clara.assert_wake_allowed / clara.agent_user_id / clara._wake_task_id
--   clara._audit                           the audit trail
--   clara._tf_append_only / clara._tf_no_truncate   the receipt table's immutability belts
--   EVERY DEFERRED BELT ON journal_entries / journal_lines, unchanged and unconsulted: the
--     effect below is an ORDINARY draft -> approved transition on the ordinary tables, so
--     `t_period_wall` (CLR19 write_into_closed_period), `t_je_balance`, `t_je_immutable`,
--     `t_je_subledger_belt`, the FA and advance belts and `t_je_agent_post_receipt` all bind
--     exactly as they bind for every other writer. THAT is why the transition is written as
--     draft-then-approve rather than as a single approved INSERT: `t_je_agent_post_receipt` is
--     an AFTER UPDATE trigger, so an approved INSERT would slip past the one wall that makes the
--     receipt structural. The trigger's own event set is NOT widened to INSERT — that would put
--     every other lane's approved INSERT under a wall written for a different receipt shape.
--
-- NOT USED, and the ground for each (this is the "if you must bypass a core, explain why"):
--   clara._draft_entry_core — it demands `clara.assert_client_resolved(client, resolution, null)`,
--     i.e. a `client_resolutions` row at confidence >= 0.95, AND (on the agent lane) a
--     `books_version` token via `clara.assert_books_current`. A documentless basis a human typed
--     has NO subject to resolve and #623's wake signature carries no books token; minting a
--     resolution for it would be FABRICATING an attribution fact about nothing, which is the
--     exact class of act this ticket forbids. Its genuinely reusable halves —
--     `_validate_entry_lines` and `_assert_balanced` — are called directly instead.
--   clara._approve_entry_core / clara._agent_post_entry_core — these are the DOCUMENT lane's
--     approve and its ladder. `_agent_post_entry_core` writes `clara.entry_post_receipts`, whose
--     `gate_verdicts` CHECK requires a non-blank `extraction_id`: a documentless entry has no
--     extraction, and inventing one would be a fabricated document reference. Its thirteen Tier-B
--     rungs are likewise about a bound document (corroboration, anchors, direction). The ONE rung
--     that does bind here — B14, `generic_control_leg` — is an INLINE query in that body with no
--     extractable predicate function, so its predicate is restated by value in
--     `_record_journal_entry_core` under the SAME reason token, and this comment is the record of
--     that duplication.
--
-- THE READ MODEL IS THE ESTATE'S, NOT A NEW ONE. `clara.journal_entries`' human read policy is
-- `firm_id = clara.jwt_firm()` with NO per-client clause, and this estate carries no
-- client-access table at all — client access IS firm membership. Both new tables therefore use
-- that exact predicate. A narrower one would make a Work invisible to a member who can already
-- read the journal entry it produced; a wider one would be a new hole.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES. The runtime classifier keys on the PAIR;
-- an errcode alone cannot tell a stale-authority refusal from a malformed request.
--
-- clara.admit_journal_work
--   CLR10 invalid_intent_key        blank/whitespace intent key (raised BEFORE any reservation)
--   CLR11 client_not_found          unknown client, or the author holds no membership in its firm
--   CLR04 actor_not_active          a membership row exists but is not active
--   CLR04 insufficient_role         live role below bookkeeper
--   CLR10 client_inactive           client.status <> 'active'
--   CLR10 invalid_basis_origin      origin outside {user_direct, clara_interpreted}
--   CLR10 invalid_source_refs       source refs is not a JSON array
--   CLR10 invalid_request           + class 'model'; a blank model snapshot. Refused HERE because
--                                   the agent_tasks INSERT guard's own refusal is untyped
--   CLR10 invalid_basis             + field + constraint (see _assert_journal_basis below)
--   CLR10 intent_payload_conflict   same (firm, CLIENT, intent_key), different basis digest.
--                                   The identity is client-scoped: the same key against a
--                                   DIFFERENT client of the same firm is a DIFFERENT intent and
--                                   admits its own Work
--
-- clara.retry_accounting_work
--   CLR10 invalid_op_key            blank/whitespace op key (BEFORE any reservation)
--   CLR11 work_not_found            unknown Work, or the author holds no membership in its firm
--   CLR04 actor_not_active / insufficient_role
--   CLR10 client_inactive
--   CLR13 operation_in_flight       the op key is reserved by an uncommitted sibling
--   CLR13 not_retryable             + status; Work is not refused/failed/expired, or its current
--                                   run is still live
--
-- clara.claim_work_run
--   CLR10 invalid_run_id            blank workflow run id
--   CLR10 invalid_bundle            bundle is not an object, or names no digest
--   CLR11 task_not_found
--   CLR10 wrong_task_kind           the task is not an accounting_work run
--
-- clara.settle_work_run
--   CLR10 invalid_outcome           outcome outside the five
--   CLR10 invalid_error_code        error code outside agent_tasks' own CHECK set
--   CLR11 task_not_found
--   CLR10 wrong_task_kind
--   (no errcode) receipt override   a settle of cancelled/failed/expired/refused over a Work that
--                                   already holds a COMMITTED operation receipt does not RAISE --
--                                   it succeeds as `completed`, with the receipt's effects as the
--                                   result and the error cleared. The answer carries
--                                   `requested_outcome` and `overridden_by_receipt` so the caller
--                                   can see it was overridden, and the audit row carries both
--
-- clara.wake_record_journal_entry (the granted wrapper — RAISES ONLY, carries no DML)
--   CLR03 no_wake_credential        no live credential in the session GUC
--   CLR03 wrong_wake_kind           + wake_kind; the kind is not interactive_client
--   CLR03 (untyped, clara.assert_wake_allowed's own) the kind holds no allowlist row — kept as
--                                   the belt BEHIND the typed check above, never as the first answer
--   CLR03 wake_obo_unbound          the credential names no human
--   CLR11 credential_client_pin     the credential is pinned to another client (or to none)
--   CLR10 invalid_op_key            blank logical operation id
--   CLR10 invalid_request           + class in {rationale, run_id, bundle_digest}
--   CLR11 client_not_found          the client is not in the credential's firm
--
-- clara._record_journal_entry_core (ungranted; reached only through the wrapper)
--   CLR11 work_not_found            no such Work in this firm+client, or not a journal_entry
--   CLR10 logical_op_mismatch       the Work's identity is not the one presented
--   CLR04 obo_not_active            the human is no longer an active member  (LIVE, at commit)
--   CLR04 insufficient_role         the human is no longer bookkeeper+       (LIVE, at commit)
--   CLR04 obo_not_initiator         the credential names a DIFFERENT human than the one who
--                                   admitted this Work -- authority alone is not enough, the
--                                   receipt must attribute the posting to the human who asked
--   CLR10 client_inactive
--   CLR10 invalid_basis             + field + constraint (belt behind admission)
--   CLR10 operation_payload_conflict + logical_op_id  -- CHECKED BEFORE basis_mismatch, on purpose:
--                                   see the ordering note at step 5 of the core
--   CLR13 operation_in_flight       the identity is reserved by an uncommitted sibling
--   CLR10 basis_mismatch            the echoed basis is not the ADMITTED basis
--   CLR10 unknown_account           + field + account_code (absent OR inactive)
--   CLR10 generic_control_leg       + account_code (B14's rule, restated by value)
--   CLR03 wake_task_unbound         no run to attribute the receipt to
--   ...plus every wall the ordinary tables already own, unchanged and NOT re-implemented:
--   CLR19 write_into_closed_period  (clara._tf_period_wall)
--   CLR07 (clara._assert_balanced)  CLR08 (clara._tf_entry_immutable, the receipt wall)
--
-- clara._assert_journal_basis / clara._journal_cents
--   CLR10 invalid_basis, with `field` naming the offending path (1-BASED, matching SQL's own
--   `with ordinality`: `basis`, `posting_date`, `memo`, `currency`, `lines`, `lines[N]`,
--   `lines[N].account_code`, `lines[N].debit_cents`, `lines[N].credit_cents`,
--   `lines[N].description`) and `constraint` naming what was violated
--   (`object`, `present`, `iso_date`, `nonempty`, `myr`, `array`, `at_least_two`,
--   `exactly_one_side`, `integer_cents`, `nonnegative_integer_cents`, `balanced`,
--   `nonzero_total`, `max_length`).
--   THE 1-BASED INDEX IS DELIBERATE AND STAYS. SQL's `with ordinality` counts from one, and the
--   field path is generated FROM that ordinal, so it is the database's own count rather than a
--   translation of it. Zero-based consumers (the runtime classifier's field echo and the web
--   composer's focus-the-first-invalid-control) subtract one at THEIR edge; the DB never
--   pretends to a convention it does not use internally.
--
-- clara._tf_accounting_work_immutable
--   CLR08 accounting_work_immutable  + column
--
-- ONE HOUSE IDIOM IS DELIBERATELY NOT USED. Every key gate here reads `x is null or x ~ '^\s*$'`
-- rather than the estate's usual `nullif(btrim(x),'') is null`. MEASURED, not stylistic:
-- PostgreSQL's one-argument btrim strips SPACES ONLY, so `btrim(E'\t\n')` is `E'\t\n'` and a
-- tab-or-newline key satisfies the house idiom. C82.1 asks for empty AND whitespace keys to be
-- refused before any reservation; this is the predicate that actually does that, and the two
-- table CHECKs carry the same form so no future writer can plant one either.
-- =====================================================================================
-- THE BASIS DIGEST'S CANONICALISATION, stated once so the runtime never has to compute one.
-- `clara._journal_basis_canonical` projects the basis onto EXACTLY the fields that make it the
-- same accounting act: posting_date as written, memo trimmed, currency upper-trimmed, and the
-- lines IN ORDER (line order is the entry's own line_no, so it is significant), each reduced to
-- {account_code trimmed, debit_cents, credit_cents, description trimmed-or-null}. Cents are read
-- back through `clara._journal_cents` — THE SAME PARSER the shape assertion used, never a second
-- cast written beside it — so 120000, 120000.0 and 1.2e5 are one digest and 1200.5 never reaches
-- the digest at all
-- (the shape assertion refuses it first — the canonicaliser is only ever called on a validated
-- basis). The digest is `encode(clara._hash(<that jsonb>), 'hex')`, and jsonb's own ::text
-- rendering is canonical for a given value, so key order in what the caller sent is irrelevant.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w623_pre$
declare v_def text; v_sha text; n text;
begin
  -- 0.1 · the prerequisites this file calls, in exact regprocedure form.
  foreach n in array array[
    'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
    'clara._hash(jsonb)', 'clara._validate_entry_lines(uuid,jsonb)',
    'clara._assert_balanced(uuid)', 'clara.role_rank(text)', 'clara.agent_user_id()',
    'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara._wake_task_id()',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara.jwt_firm()',
    'clara._tf_append_only()', 'clara._tf_no_truncate()',
    'clara._tf_assert_agent_post_receipt()',
    'clara._tf_agent_task_insert()', 'clara._tf_agent_task_update()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#623 prestate: prerequisite absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the kind CHECK is present and NOT already widened.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid='clara.agent_tasks'::regclass and c.conname='ck_agent_tasks_kind_0011';
  if v_def is null then
    raise exception '#623 prestate: ck_agent_tasks_kind_0011 is missing' using errcode='CLR10';
  end if;
  if position('accounting_work' in v_def) > 0 then
    raise exception '#623 prestate: ck_agent_tasks_kind_0011 is already widened (got: %)', v_def using errcode='CLR10';
  end if;
  -- …and it still carries every value the estate depends on, so the recreate below cannot
  -- silently DROP one. Measured, never assumed from the file that last wrote it.
  if position('chat_turn' in v_def)=0 or position('wake' in v_def)=0
     or position('autodraft' in v_def)=0 or position('close_prep' in v_def)=0 then
    raise exception '#623 prestate: ck_agent_tasks_kind_0011 lacks an expected value (got: %)', v_def using errcode='CLR10';
  end if;

  -- 0.3 · the pinned chat wake kind exists on the credential CHECK, or the allowlist row below
  -- names a kind no credential can ever carry.
  if position('interactive_client' in (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_kind_0011')) = 0 then
    raise exception '#623 prestate: the wake-credential kind CHECK does not carry interactive_client' using errcode='CLR10';
  end if;

  -- 0.4 · PARTIAL BIRTH — nothing this file creates may already exist.
  if to_regclass('clara.accounting_work') is not null then
    raise exception '#623 partial birth: clara.accounting_work already exists' using errcode='CLR10';
  end if;
  if to_regclass('clara.operation_receipts') is not null then
    raise exception '#623 partial birth: clara.operation_receipts already exists' using errcode='CLR10';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='agent_tasks' and column_name='work_id') then
    raise exception '#623 partial birth: clara.agent_tasks.work_id already exists' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
      and p.proname in ('admit_journal_work','retry_accounting_work','claim_work_run',
        'settle_work_run','wake_record_journal_entry','_record_journal_entry_core',
        '_assert_journal_basis','_journal_basis_canonical','_journal_basis_digest','_journal_cents',
        '_work_committed_receipt',
        '_tf_accounting_work_immutable','_tf_accounting_work_status_mirror')) then
    raise exception '#623 partial birth: one or more new function names already resolve' using errcode='CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name='wake_record_journal_entry') then
    raise exception '#623 partial birth: a wake_record_journal_entry allowlist row already exists' using errcode='CLR10';
  end if;

  -- 0.5 · THE ONE LIVE BODY THIS FILE REPLACES, pinned by prosrc sha-256 at frontier 0177. A
  -- drifted wall is REFUSED rather than silently overwritten: the widening below is derived
  -- against this exact text, and a different text may carry an arm this file would delete.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
    where p.oid='clara._tf_assert_agent_post_receipt()'::regprocedure;
  if v_sha <> '53a3ab20ac120c6d7d2f9a5a0a80f27754397e145009687abb8e677ae32b08f5' then
    raise exception '#623 prestate: clara._tf_assert_agent_post_receipt has DRIFTED from the pinned 0177 body (sha %) -- re-derive the widening against the live body before applying', v_sha using errcode='CLR10';
  end if;
  if (select p.proowner from pg_proc p where p.oid='clara._tf_assert_agent_post_receipt()'::regprocedure)
      <> 'clara_fn_owner'::regrole then
    raise exception '#623 prestate: the receipt wall is not owned by clara_fn_owner' using errcode='CLR10';
  end if;

  raise notice '#623 prestate: clean -- no accounting-work surface exists, the kind CHECK carries its four values, and the receipt wall is at its pinned 0177 body.';
end
$w623_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.accounting_work — the DURABLE UNIT OF WORK (CONTEXT.md "Accounting work").
--
-- `logical_op_id` is SERVER-ASSIGNED and UNIQUE across the estate: `work:<id>:journal_entry:1`.
-- C33.8 asks for one stable operation-key schema with a PARSER-FREE round trip, and this is it —
-- every consumer compares the WHOLE STRING it was handed; nothing splits it on ':'. The trailing
-- `1` is the operation ORDINAL within the Work, so a later purpose that performs two operations
-- extends the schema without changing the shape of this one.
--
-- The immutable set is frozen by trigger rather than by hoping no writer touches it, and it is
-- WIDER than the contract's list by one column: `initiator_role`. That column is an AUTHORITY
-- SNAPSHOT taken at admission and shown for display; commit rereads the LIVE membership. A
-- snapshot that could be rewritten later would be a record of nothing.
-- =====================================================================================
create table clara.accounting_work (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  client_id       uuid        not null,
  purpose         text        not null check (purpose in ('journal_entry')),
  status          text        not null check (status in ('queued','running','awaiting_input',
                                'stopping','completed','refused','failed','cancelled','expired')),
  initiator       uuid        not null references clara.users(id),
  initiator_role  text        not null check (btrim(initiator_role) <> ''),
  -- `!~ '^\s*$'`, NOT the estate's usual `btrim(...) <> ''`. MEASURED, not stylistic: PostgreSQL's
  -- one-argument btrim strips SPACES ONLY, so `btrim(E'\t\n') = E'\t\n'` and a tab-or-newline key
  -- would have satisfied the house idiom. C82.1 says "reject empty/whitespace keys"; this is the
  -- predicate that actually does that, and it is used at every key gate in this file.
  intent_key      text        not null check (intent_key !~ '^\s*$'),
  logical_op_id   text        not null check (logical_op_id !~ '^\s*$'),
  basis           jsonb       not null check (jsonb_typeof(basis) = 'object'),
  basis_digest    text        not null check (basis_digest ~ '^[0-9a-f]{64}$'),
  basis_origin    text        not null check (basis_origin in ('user_direct','clara_interpreted')),
  source_refs     jsonb       not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  current_task_id uuid        references clara.agent_tasks(id),
  bundle          jsonb       check (bundle is null or jsonb_typeof(bundle) = 'object'),
  result          jsonb       check (result is null or jsonb_typeof(result) = 'object'),
  error           jsonb       check (error  is null or jsonb_typeof(error)  = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fk_accounting_work_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint uq_accounting_work_logical_op unique (logical_op_id),
  -- THE INTENT KEY IS SCOPED TO THE CLIENT, NOT MERELY TO THE FIRM. Reviewed finding: the
  -- composer mints ONE draft uuid per draft and the chat lane derives its key from
  -- `stableOpKey(taskId, "start_journal_work", input)`; neither is guaranteed distinct ACROSS
  -- clients, and a firm-scoped key made the second client's intent VANISH -- admission returned
  -- the FIRST client's Work with `replayed:true`, so the second bookkeeper watched a Work
  -- against somebody else's books and their own entry was never admitted at all. Idempotency
  -- must be scoped to the thing the operation acts on, and the client is that thing.
  constraint uq_accounting_work_intent unique (firm_id, client_id, intent_key),
  constraint uq_accounting_work_id_firm_client unique (id, firm_id, client_id)
);
comment on table clara.accounting_work is
  '#623: one durable, client-scoped unit of accounting work per admitted intent. Written ONLY by '
  'clara.admit_journal_work / retry_accounting_work / claim_work_run / settle_work_run and by '
  'clara._record_journal_entry_core; no application role holds DML. The identity columns are '
  'frozen after admission by t_accounting_work_immutable.';

alter table clara.accounting_work enable row level security;
alter table clara.accounting_work force row level security;
create policy p_accounting_work_owner on clara.accounting_work
  for all to clara_fn_owner using (true) with check (true);
create policy p_accounting_work_read on clara.accounting_work
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.accounting_work to clara_authenticated;
-- THE RUN MUST BE ABLE TO READ THE WORK IT WAS HANDED. `claraWork_v1`'s `loadWorkStep` joins
-- `clara.agent_tasks` to this table, and `GET /api/work/:workId` selects it directly; both run
-- inside the runtime pool, which SET ROLEs `clara_runtime`. Without this pair the very first Work
-- run dies with "permission denied for table accounting_work" after its WDK retries, and the read
-- route 500s -- measured on a database built purely from migrations. This mirrors the estate's own
-- `p_agent_tasks_runtime` (0006_runtime_core.sql), which is the task half of the same row, EXCEPT
-- that it is SELECT-ONLY: every write to accounting_work stays inside the SECURITY DEFINER verbs
-- (`admit_journal_work` / `retry_accounting_work` / `claim_work_run` / `settle_work_run` and
-- `_record_journal_entry_core`), so the runtime can observe the Work but never move it. The
-- companion `clara.operation_receipts` gets NOTHING: the runtime never reads it -- the receipt is
-- returned to the run by the wake verb, and the web reads the row under `clara_authenticated`.
create policy p_accounting_work_runtime on clara.accounting_work
  for select to clara_runtime using (true);
grant select on clara.accounting_work to clara_runtime;

create index ix_accounting_work_client on clara.accounting_work(client_id, created_at desc);
create index ix_accounting_work_task on clara.accounting_work(current_task_id);

create function clara._tf_accounting_work_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_frozen text[] := array['id','firm_id','client_id','purpose','initiator','initiator_role',
                           'intent_key','logical_op_id','basis','basis_digest','basis_origin',
                           'created_at'];
  c text;
begin
  if tg_op = 'DELETE' then
    raise exception 'accounting work is never deleted (settle it, do not erase it)'
      using errcode='CLR08', detail='{"reason":"accounting_work_immutable","column":"*"}';
  end if;
  foreach c in array v_frozen loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'accounting work column % is immutable after admission', c
        using errcode='CLR08',
          detail=jsonb_build_object('reason','accounting_work_immutable','column',c)::text;
    end if;
  end loop;
  new.updated_at := now();
  return new;
end $$;
revoke all on function clara._tf_accounting_work_immutable() from public;
create trigger t_accounting_work_immutable before update or delete on clara.accounting_work
  for each row execute function clara._tf_accounting_work_immutable();
create trigger t_accounting_work_no_truncate before truncate on clara.accounting_work
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §B  clara.operation_receipts — ONE COMMITTED EFFECT PER LOGICAL IDENTITY (C54.1).
--
-- The partial unique index is the structural half of the idempotency claim: `_reserve_op` makes a
-- REPLAY return the stored receipt, and this index makes a second committed row for the same
-- identity impossible even if a future writer forgets to reserve. Two independent mechanisms,
-- because "the writer always reserves" is a property of code and this is a property of the data.
--
-- `on_behalf_of` is NOT NULL here (unlike clara.entry_post_receipts, where the clocked lanes
-- legitimately have no directing human): every accounting operation in this lane is performed
-- under a named human's live authority, so a NULL would be a receipt that cannot say whose
-- authority was used.
-- =====================================================================================
create table clara.operation_receipts (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null,
  work_id        uuid        not null,
  purpose        text        not null check (purpose in ('journal_entry')),
  logical_op_id  text        not null check (logical_op_id !~ '^\s*$'),
  payload_digest text        not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  acting_actor   uuid        not null references clara.users(id),
  on_behalf_of   uuid        not null references clara.users(id),
  via_wake_kind  text        not null check (btrim(via_wake_kind) <> ''),
  bundle_digest  text        not null check (btrim(bundle_digest) <> ''),
  run_id         text        not null check (btrim(run_id) <> ''),
  task_id        uuid        not null references clara.agent_tasks(id),
  outcome        text        not null check (outcome in ('committed','refused')),
  effects        jsonb       not null default '{}'::jsonb check (jsonb_typeof(effects) = 'object'),
  refusal        jsonb       check (refusal is null or jsonb_typeof(refusal) = 'object'),
  created_at     timestamptz not null default now(),
  constraint fk_operation_receipts_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_operation_receipts_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  -- A committed receipt NAMES ITS EFFECT and carries no refusal; a refused one is the mirror.
  -- Without this a `committed` row with an empty `effects` would satisfy the widened post-receipt
  -- wall while pointing at nothing.
  constraint ck_operation_receipts_outcome_shape check (
    (outcome = 'committed'
      and nullif(btrim(coalesce(effects->>'entry_id','')),'') is not null
      and refusal is null)
    or (outcome = 'refused' and refusal is not null))
);
comment on table clara.operation_receipts is
  '#623: the authoritative receipt for one accounting operation. Written ONLY by '
  'clara._record_journal_entry_core, inside the posting transaction; no role holds DML and the '
  'append-only + no-truncate belts refuse every later edit. uq_operation_receipts_committed is '
  'the structural half of "one committed effect per logical operation identity".';

create unique index uq_operation_receipts_committed
  on clara.operation_receipts(firm_id, logical_op_id) where (outcome = 'committed');
create index ix_operation_receipts_client on clara.operation_receipts(client_id, created_at desc);
create index ix_operation_receipts_work on clara.operation_receipts(work_id);
-- The widened receipt wall joins on this expression; without the index it is a seq scan on every
-- agent approve in the estate, including the document lane's.
create index ix_operation_receipts_entry on clara.operation_receipts((effects->>'entry_id'))
  where (outcome = 'committed');

alter table clara.operation_receipts enable row level security;
alter table clara.operation_receipts force row level security;
create policy p_operation_receipts_owner on clara.operation_receipts
  for all to clara_fn_owner using (true) with check (true);
create policy p_operation_receipts_read on clara.operation_receipts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.operation_receipts to clara_authenticated;

create trigger t_operation_receipts_append_only before update or delete on clara.operation_receipts
  for each row execute function clara._tf_append_only();
create trigger t_operation_receipts_no_truncate before truncate on clara.operation_receipts
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------
-- THE ONE QUESTION EVERY LIFECYCLE WRITER ASKS OF THIS TABLE: did this Work already record a
-- committed effect? Asked in exactly one place so the two askers (clara.settle_work_run and the
-- agent_tasks status mirror) can never disagree, and shaped as the Work's OWN `result` object so
-- an answer can be written straight onto the row.
--
-- WHY IT EXISTS AT ALL. Reviewed finding: `settle_work_run` translated the RUN's opinion of what
-- happened onto the WORK without ever asking the books. A run that had already committed
-- `wake_record_journal_entry` -- an approved journal entry, a committed receipt, real money in a
-- real client's ledger -- and was then cancelled or reaped settled the Work `cancelled`/`failed`
-- with "Nothing was posted" in its `error`, and the run's own later `completed` settle came back
-- `{"replayed":true}` because the task was terminal by then. The entry was posted, the receipt
-- named it, and the operator's screen said the opposite. The committed receipt is the only
-- witness with standing here: a run's intention cannot un-post an entry, so the receipt WINS and
-- the requested outcome is overridden (and recorded as overridden -- see settle_work_run).
-- `order by created_at` is belt: uq_operation_receipts_committed already admits at most one
-- committed row per (firm, logical identity), and a Work carries exactly one identity.
-- -------------------------------------------------------------------------------------
create function clara._work_committed_receipt(p_work uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object('entry_id', o.effects->>'entry_id', 'receipt_id', o.id,
                            'posted_at', o.created_at)
    from clara.operation_receipts o
   where o.work_id = p_work and o.outcome = 'committed'
   order by o.created_at limit 1;
$$;
revoke all on function clara._work_committed_receipt(uuid) from public;

-- =====================================================================================
-- §C  clara.agent_tasks — the new kind, its Work pointer, and the STATUS MIRROR.
--
-- The mirror exists so `clara.open_interruption` and `clara.cancel_agent_task` — the estate's own
-- parking and cancel doors — keep the Work honest WITHOUT BEING EDITED. It mirrors the two
-- NON-TERMINAL transitions outright: terminal state is `clara.settle_work_run`'s to write,
-- because the Work's terminal vocabulary is richer than the task's (a `refused` Work settles a
-- task `failed`, and a mirror could not tell the two apart). Its ONE terminal arm is the
-- receipt-aware one: a task terminalised by a door that knows nothing about #623, over a Work
-- that already recorded a committed effect, settles the Work `completed` rather than leaving an
-- entry posted under a Work that never reached a terminal state at all.
-- =====================================================================================
alter table clara.agent_tasks drop constraint ck_agent_tasks_kind_0011;
alter table clara.agent_tasks add constraint ck_agent_tasks_kind_0011
  check (kind = any (array['chat_turn', 'wake', 'autodraft', 'close_prep', 'accounting_work']));

alter table clara.agent_tasks add column work_id uuid references clara.accounting_work(id);
-- BIDIRECTIONAL, so neither half can drift: an accounting_work run always names its Work, and no
-- other kind ever carries one.
alter table clara.agent_tasks add constraint ck_agent_tasks_work_id_kind
  check ((work_id is not null) = (kind = 'accounting_work'));
create index ix_agent_tasks_work on clara.agent_tasks(work_id) where (work_id is not null);

-- -------------------------------------------------------------------------------------
-- THE TWO LIVE agent_tasks GUARD BODIES, WIDENED BY ANCHORED SPLICE.
--
-- `ck_agent_tasks_kind_0011` is not the only gate on `kind`: `clara._tf_agent_task_insert` is a
-- CLOSED if/elsif chain whose `else` raises `unknown task kind %`, and
-- `clara._tf_agent_task_update` is a CLOSED per-kind transition matrix whose `else` is `false`.
-- A kind added to the CHECK alone is admitted by the catalog and refused by the trigger — which
-- is exactly what the first run of this file's own cells measured. Four sites extend together
-- (the CHECK, the insert arm, the update matrix, the mirror); this is sites two and three.
--
-- SPLICED, NOT RETYPED. The bodies are read back through `pg_get_functiondef`, exactly ONE
-- counted anchor is replaced in each, and the result is executed — so every other kind's arm is
-- carried BYTE-FOR-BYTE and cannot be silently reworded. Each anchor's occurrence count is
-- asserted to be exactly one before the replacement, and the prestate sha of each body is pinned
-- so a drifted guard is refused rather than overwritten.
--
-- THE UPDATE MATRIX ALSO GAINS ONE IMMUTABILITY TERM: `work_id`. It is purely additive — the
-- column is born in this same migration, so no existing row can carry a non-null value, and no
-- previously legal update becomes illegal.
-- -------------------------------------------------------------------------------------
do $w623_task_guards$
declare v_src text; v_def text; v_anchor text; v_replacement text; v_sha text;
begin
  -- INSERT guard.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara._tf_agent_task_insert()'::regprocedure;
  if v_sha <> 'd3332e49c64b665f37fe13ba477d0e524fb06ed26a1953dee74ad47b8fbb4b4c' then
    raise exception '#623: clara._tf_agent_task_insert has DRIFTED from the pinned 0177 body (sha %) -- re-derive the arm against the live body', v_sha using errcode='CLR10';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid='clara._tf_agent_task_insert()'::regprocedure;
  v_anchor := $anchor$  else
    raise exception 'unknown task kind %',new.kind using errcode='CLR10';
  end if;$anchor$;
  if (length(v_def)-length(replace(v_def,v_anchor,''))) / length(v_anchor) <> 1 then
    raise exception '#623: the insert guard''s closing arm is not a unique anchor' using errcode='CLR10';
  end if;
  v_replacement := $repl$  elsif new.kind='accounting_work' then
    -- #623: the autodraft/close_prep shape (prevalidated firm+client, no session, no intent,
    -- born queued, a model snapshot on the row) PLUS the Work binding, which is what makes the
    -- run attributable: the task must name a Work of the SAME firm and client. Admission writes
    -- the Work first in the same transaction, so this read always sees it.
    v_firm:=new.firm_id; v_client:=new.client_id;
    if v_firm is null or v_client is null or new.session_id is not null
       or new.origin_intent_id is not null or new.status<>'queued'
       or nullif(btrim(new.model_snapshot),'') is null
       or new.work_id is null
       or not exists(select 1 from clara.accounting_work w where w.id=new.work_id
            and w.firm_id=v_firm and w.client_id=v_client)
       or not exists(select 1 from clara.clients c where c.id=v_client
          and c.firm_id=v_firm and c.status='active') then
      raise exception 'accounting_work task requires prevalidated firm/client, no session/intent, queued status, a model snapshot and a firm/client-congruent work id'
        using errcode='CLR10';
    end if;
  else
    raise exception 'unknown task kind %',new.kind using errcode='CLR10';
  end if;$repl$;
  execute replace(v_def, v_anchor, v_replacement);

  -- UPDATE guard, two anchors.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara._tf_agent_task_update()'::regprocedure;
  if v_sha <> 'f44a2f17f4186d3a0dc95f33ac2a52516c017d6b071459f90f102a3097b302ab' then
    raise exception '#623: clara._tf_agent_task_update has DRIFTED from the pinned 0177 body (sha %) -- re-derive the arm against the live body', v_sha using errcode='CLR10';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid='clara._tf_agent_task_update()'::regprocedure;

  v_anchor := $anchor$     or new.created_at<>old.created_at then$anchor$;
  if (length(v_def)-length(replace(v_def,v_anchor,''))) / length(v_anchor) <> 1 then
    raise exception '#623: the update guard''s identity anchor is not unique' using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_anchor,
    $repl$     or new.work_id is distinct from old.work_id
     or new.created_at<>old.created_at then$repl$);

  v_anchor := $anchor$      else false end;
    if not v_ok then$anchor$;
  if (length(v_def)-length(replace(v_def,v_anchor,''))) / length(v_anchor) <> 1 then
    raise exception '#623: the update guard''s matrix anchor is not unique' using errcode='CLR10';
  end if;
  v_replacement := $repl$      -- #623: the accounting-work lifecycle. Every terminal the Work's own vocabulary can
      -- settle to must be reachable, because clara.settle_work_run translates FIVE Work outcomes
      -- onto FOUR task statuses (a `refused` Work settles its run `failed`) and the reconciler
      -- may cancel a run that never claimed.
      when old.kind='accounting_work' then case old.status
        -- `queued -> completed` is admitted for ONE measured reason: nothing in the estate makes
        -- a CLAIM a precondition of posting (clara._record_journal_entry_core attributes its
        -- receipt to the Work's current task when the credential binds none), so a run can hold
        -- a committed operation receipt while its task is still queued -- and
        -- clara.settle_work_run's receipt override then has to be able to say `completed` on it.
        -- Without this the override raised CLR13 out of this guard and the Work stayed stranded.
        when 'queued' then new.status in ('running','cancel_requested','completed','cancelled','failed','expired')
        when 'running' then new.status in ('awaiting_input','cancel_requested','completed','failed','cancelled','expired')
        when 'awaiting_input' then new.status in ('running','cancel_requested','completed','failed','cancelled','expired')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled','expired')
        else false end
      else false end;
    if not v_ok then$repl$;
  execute replace(v_def, v_anchor, v_replacement);
end
$w623_task_guards$;

create function clara._tf_accounting_work_status_mirror() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_receipt jsonb;
begin
  if new.work_id is null then return null; end if;
  if new.status in ('running', 'awaiting_input') then
    update clara.accounting_work w
       set status = new.status
     where w.id = new.work_id
       and w.status is distinct from new.status
       -- A Work that already settled is never re-opened by a late task transition.
       and w.status not in ('completed','refused','failed','cancelled','expired');
    return null;
  end if;
  -- THE TERMINAL ARM IS RECEIPT-AWARE, AND IT IS THE ONLY TERMINAL STATE THIS MIRROR WRITES.
  -- A terminal task status is normally clara.settle_work_run's to translate, because the Work's
  -- vocabulary is richer than the task's -- and that is still true for every Work that posted
  -- nothing. But `clara.cancel_agent_task` (0006/0133, and deliberately NOT edited by this file)
  -- terminalises a QUEUED accounting_work task itself, with no settle in sight: it writes
  -- `status='cancelled'` and returns. Reviewed finding: nothing in the estate requires a run to
  -- have CLAIMED before it posts -- `_record_journal_entry_core` attributes the receipt to
  -- `w.current_task_id` when the credential binds no task -- so a Work could hold an approved
  -- entry and a committed receipt while its task was still `queued`, and one human cancel then
  -- stranded it at `queued` FOREVER with money in the ledger and no terminal state on the row.
  -- This arm answers that without touching the estate's cancel door: a committed receipt makes
  -- the Work `completed`, whatever the task's terminal status says, and never the reverse -- a
  -- terminal task with NO receipt still falls through to settle_work_run untouched.
  if new.status not in ('completed','failed','cancelled','expired') then return null; end if;
  v_receipt := clara._work_committed_receipt(new.work_id);
  if v_receipt is null then return null; end if;
  update clara.accounting_work w
     set status = 'completed', error = null,
         result = coalesce(w.result, '{}'::jsonb) || v_receipt
   where w.id = new.work_id and w.status is distinct from 'completed';
  return null;
end $$;
revoke all on function clara._tf_accounting_work_status_mirror() from public;
create trigger t_agent_tasks_work_status_mirror after update of status on clara.agent_tasks
  for each row when (old.status is distinct from new.status and new.kind = 'accounting_work')
  execute function clara._tf_accounting_work_status_mirror();

-- =====================================================================================
-- §D  THE BASIS PREDICATES. Ungranted; shared by admission and by commit so the two can never
-- disagree about what a well-formed accounting basis is.
-- =====================================================================================

-- Exactly-one-integer-minor-unit, per side, with the offending PATH in the detail. A missing or
-- JSON-null side reads as zero; anything that is not a JSON number is refused rather than coerced
-- (a string "120000" would otherwise cast cleanly and defeat the whole point of exact cents).
create function clara._journal_cents(p_line jsonb, p_key text, p_idx int) returns bigint
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_val numeric;
begin
  if p_line -> p_key is null or jsonb_typeof(p_line -> p_key) = 'null' then return 0; end if;
  if jsonb_typeof(p_line -> p_key) <> 'number' then
    raise exception 'line % %: minor units must be an integer JSON number', p_idx, p_key
      using errcode='CLR10', detail=jsonb_build_object('reason','invalid_basis',
        'field', 'lines[' || p_idx || '].' || p_key, 'constraint','integer_cents')::text;
  end if;
  v_val := (p_line ->> p_key)::numeric;
  if v_val <> trunc(v_val) or v_val < 0 or v_val > 9223372036854775807::numeric then
    raise exception 'line % %: minor units must be a non-negative whole number', p_idx, p_key
      using errcode='CLR10', detail=jsonb_build_object('reason','invalid_basis',
        'field', 'lines[' || p_idx || '].' || p_key, 'constraint','nonnegative_integer_cents')::text;
  end if;
  return v_val::bigint;
end $$;
revoke all on function clara._journal_cents(jsonb,text,int) from public;

create function clara._assert_journal_basis(p_basis jsonb) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record; v_d bigint; v_c bigint; v_dr bigint := 0; v_cr bigint := 0; v_n int;
begin
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'an accounting basis is a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"basis","constraint":"object"}';
  end if;
  if nullif(btrim(coalesce(p_basis->>'posting_date','')),'') is null then
    raise exception 'a journal entry needs a posting date' using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"posting_date","constraint":"present"}';
  end if;
  begin
    perform (p_basis->>'posting_date')::date;
  exception when others then
    raise exception 'the posting date % is not a calendar date', p_basis->>'posting_date'
      using errcode='CLR10',
        detail='{"reason":"invalid_basis","field":"posting_date","constraint":"iso_date"}';
  end;
  if nullif(btrim(coalesce(p_basis->>'memo','')),'') is null then
    -- A documentless entry's memo IS its basis (clara.journal_entries' own ck_je_basis says so).
    raise exception 'a documentless journal entry requires a memo -- it is the entry''s basis'
      using errcode='CLR10',
        detail='{"reason":"invalid_basis","field":"memo","constraint":"nonempty"}';
  end if;
  -- THE CAPS ARE THE FROZEN TOOL SCHEMA'S, RESTATED HERE SO ADMISSION REFUSES WHAT THE RUN
  -- COULD NEVER POST. Reviewed finding: `claraWork.v1.tools.ts` spells the echoed basis
  -- `memo: z.string().trim().min(1).max(4000)` and `description: z.string().max(2000)`, and that
  -- schema is @frozen. An over-long memo therefore ADMITTED (the Work exists, a run is queued)
  -- and then died inside the segment when the model echoed the basis back, settling the Work
  -- `failed` for a reason the composer could have shown the typist at submit time. The trimmed
  -- length is what the memo cap measures because the tool schema trims BEFORE it caps; the
  -- description cap measures the RAW string because that schema does not trim.
  if char_length(btrim(p_basis->>'memo')) > 4000 then
    raise exception 'the memo is % characters; the postable maximum is 4000',
      char_length(btrim(p_basis->>'memo'))
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_basis','field','memo',
          'constraint','max_length','max',4000,
          'length', char_length(btrim(p_basis->>'memo')))::text;
  end if;
  if upper(btrim(coalesce(p_basis->>'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"currency","constraint":"myr"}';
  end if;
  if jsonb_typeof(p_basis->'lines') <> 'array' then
    raise exception 'the basis lines must be a JSON array' using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"lines","constraint":"array"}';
  end if;
  v_n := jsonb_array_length(p_basis->'lines');
  if v_n < 2 then
    raise exception 'an entry needs at least two lines (got %)', v_n using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"lines","constraint":"at_least_two"}';
  end if;
  for e in select x.elem, x.idx from jsonb_array_elements(p_basis->'lines')
      with ordinality as x(elem, idx) loop
    if jsonb_typeof(e.elem) <> 'object' then
      raise exception 'line % is not a JSON object', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_basis',
          'field','lines[' || e.idx || ']','constraint','object')::text;
    end if;
    if nullif(btrim(coalesce(e.elem->>'account_code','')),'') is null then
      raise exception 'line % names no account', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_basis',
          'field','lines[' || e.idx || '].account_code','constraint','nonempty')::text;
    end if;
    -- The line narration's own cap, from the same frozen schema (see the memo cap above).
    if char_length(coalesce(e.elem->>'description','')) > 2000 then
      raise exception 'line % carries a % character narration; the postable maximum is 2000',
        e.idx, char_length(e.elem->>'description')
        using errcode='CLR10', detail=jsonb_build_object('reason','invalid_basis',
          'field','lines[' || e.idx || '].description','constraint','max_length','max',2000,
          'length', char_length(e.elem->>'description'))::text;
    end if;
    v_d := clara._journal_cents(e.elem, 'debit_cents', e.idx::int);
    v_c := clara._journal_cents(e.elem, 'credit_cents', e.idx::int);
    if (v_d > 0) = (v_c > 0) then
      raise exception 'line % must carry exactly one positive debit or credit', e.idx
        using errcode='CLR10', detail=jsonb_build_object('reason','invalid_basis',
          'field','lines[' || e.idx || ']','constraint','exactly_one_side')::text;
    end if;
    v_dr := v_dr + v_d;
    v_cr := v_cr + v_c;
  end loop;
  -- EXACT, with no rounding tolerance. `clara._validate_entry_lines` forgives 1-5 cents by
  -- minting a rounding line; an agent posting a basis a human typed may not silently invent a
  -- leg, so this refuses the residual outright and the estate's writer never sees one.
  if v_dr <> v_cr then
    raise exception 'the basis is unbalanced by % minor unit(s)', abs(v_dr - v_cr)
      using errcode='CLR10', detail=jsonb_build_object('reason','invalid_basis',
        'field','lines','constraint','balanced','debit_cents',v_dr,'credit_cents',v_cr)::text;
  end if;
  if v_dr = 0 then
    raise exception 'the basis moves no money' using errcode='CLR10',
      detail='{"reason":"invalid_basis","field":"lines","constraint":"nonzero_total"}';
  end if;
end $$;
revoke all on function clara._assert_journal_basis(jsonb) from public;

-- ONLY EVER CALLED ON A VALIDATED BASIS. Both call sites run clara._assert_journal_basis first,
-- and the cents are read back through THE SAME PARSER that validated them —
-- `clara._journal_cents`, not a second `::bigint` cast written beside it. MEASURED, not
-- stylistic: a bare `(elem->>'debit_cents')::bigint` disagreed with the validator on a JSON
-- number written with a zero fraction. `120000.0` is a whole number, so the validator's
-- `v_val <> trunc(v_val)` arm admitted it; jsonb preserves the numeric's scale, so `->>` handed
-- the cast the TEXT `120000.0`, and `::bigint` raised a bare 22P02 with no CLR code and no typed
-- detail — an unclassifiable error out of the one path this file promises is fully typed. One
-- parser means the invariant this comment states is structural rather than coincidental, and the
-- digest is byte-identical for every basis that was already valid (both forms hashed to
-- 7ba6adf2…30e7d on the rig for the canonical Dr 6100 / Cr 1150 basis).
create function clara._journal_basis_canonical(p_basis jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'posting_date', p_basis->>'posting_date',
    'memo',         btrim(coalesce(p_basis->>'memo','')),
    'currency',     upper(btrim(coalesce(p_basis->>'currency',''))),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code',  btrim(coalesce(x.elem->>'account_code','')),
               'debit_cents',   clara._journal_cents(x.elem, 'debit_cents',  x.idx::int),
               'credit_cents',  clara._journal_cents(x.elem, 'credit_cents', x.idx::int),
               'description',   nullif(btrim(coalesce(x.elem->>'description','')),''))
             order by x.idx)
        from jsonb_array_elements(
               case when jsonb_typeof(p_basis->'lines')='array' then p_basis->'lines'
                    else '[]'::jsonb end) with ordinality as x(elem, idx)), '[]'::jsonb));
$$;
revoke all on function clara._journal_basis_canonical(jsonb) from public;

create function clara._journal_basis_digest(p_basis jsonb) returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select encode(clara._hash(clara._journal_basis_canonical(p_basis)), 'hex');
$$;
revoke all on function clara._journal_basis_digest(jsonb) from public;

-- =====================================================================================
-- §E  THE RUNTIME LANE. Granted to clara_runtime exactly as clara.begin_chat_turn is (0006:1176).
-- =====================================================================================

create function clara.admit_journal_work(p_client uuid, p_author uuid, p_intent_key text,
    p_basis jsonb, p_basis_origin text, p_source_refs jsonb, p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_digest text; v_work uuid; v_task uuid; v_logical text; x record;
begin
  -- C82.1, FIRST: an empty or whitespace key is refused BEFORE anything durable is reached, so a
  -- blank key can never own a reservation, a Work row or a run.
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'an accounting-work intent requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;

  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    -- NO EXISTENCE ORACLE: an author with no membership in this firm at all gets the same answer
    -- as for a uuid that names nothing, so the pair can never be used to enumerate other firms'
    -- clients. A DEACTIVATED member of THIS firm gets the precise answer below instead: they
    -- already knew the client exists, so nothing leaks and the reason is actionable.
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'recording a journal entry requires a bookkeeper or above' using errcode='CLR04',
      detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_basis_origin is null or p_basis_origin not in ('user_direct','clara_interpreted') then
    raise exception 'unknown accounting-basis origin %', p_basis_origin using errcode='CLR10',
      detail='{"reason":"invalid_basis_origin"}';
  end if;
  if p_source_refs is null or jsonb_typeof(p_source_refs) <> 'array' then
    raise exception 'source refs must be a JSON array (empty means documentless)'
      using errcode='CLR10', detail='{"reason":"invalid_source_refs"}';
  end if;
  -- The run records WHICH MODEL served it (C88.8's half that lives on the task). The agent_tasks
  -- INSERT guard refuses a blank snapshot with an UNTYPED CLR10, so it is refused here first,
  -- with a reason the runtime classifier can act on.
  if p_model is null or p_model ~ '^\s*$' then
    raise exception 'an accounting-work run must name the model serving it' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model","constraint":"nonempty"}';
  end if;

  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  -- Idempotent on (firm, CLIENT, intent_key). The unique constraint is what makes this safe
  -- under a genuine race; this read is the fast path and the source of the typed conflict. The
  -- client conjunct is not decoration: without it the same key used against two clients of one
  -- firm returned the FIRST client's Work as a replay and silently dropped the second intent.
  select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status into x
    from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if found then
    if x.basis_digest is distinct from v_digest then
      raise exception 'this intent key already carries a different journal basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','intent_payload_conflict','work_id',x.id)::text;
    end if;
    return jsonb_build_object('work_id', x.id, 'task_id', x.current_task_id,
      'logical_op_id', x.logical_op_id, 'status', x.status, 'replayed', true);
  end if;

  -- The id is minted HERE rather than by the column default, because the logical operation
  -- identity is derived FROM it and must land in the same INSERT (a NOT NULL column cannot wait
  -- for a follow-up UPDATE, and a placeholder would be a moment where the identity was a lie).
  v_work := gen_random_uuid();
  v_logical := 'work:' || v_work::text || ':journal_entry:1';
  begin
    insert into clara.accounting_work(id, firm_id, client_id, purpose, status, initiator,
        initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin, source_refs)
      values (v_work, v_firm, p_client, 'journal_entry', 'queued', p_author, v_role, p_intent_key,
        v_logical, p_basis, v_digest, p_basis_origin, p_source_refs);
  exception when unique_violation then
    -- A concurrent admission won the key. Re-read and answer as a replay if it is the SAME basis,
    -- and as the typed conflict otherwise -- never as a raw 23505 the runtime cannot classify.
    select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status into x
      from clara.accounting_work w
     where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
    if not found or x.basis_digest is distinct from v_digest then
      raise exception 'this intent key already carries a different journal basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','intent_payload_conflict','work_id',x.id)::text;
    end if;
    return jsonb_build_object('work_id', x.id, 'task_id', x.current_task_id,
      'logical_op_id', x.logical_op_id, 'status', x.status, 'replayed', true);
  end;

  insert into clara.agent_tasks(kind, firm_id, client_id, status, created_by, model_snapshot, work_id)
    values ('accounting_work', v_firm, p_client, 'queued', p_author, p_model, v_work)
    returning id into v_task;
  update clara.accounting_work set current_task_id = v_task where id = v_work;

  perform clara._audit(v_firm, p_author, null, null, 'admit_journal_work', null,
    jsonb_build_object('client', p_client, 'work', v_work, 'task', v_task,
      'logical_op_id', v_logical, 'intent_key', p_intent_key, 'basis_origin', p_basis_origin));

  return jsonb_build_object('work_id', v_work, 'task_id', v_task, 'logical_op_id', v_logical,
    'status', 'queued', 'replayed', false);
end $$;
revoke all on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) to clara_runtime;

-- -------------------------------------------------------------------------------------
-- retry — a NEW RUN for the SAME Work, under the SAME logical identity (C-62).
--
-- `error` and `result` are CLEARED on retry deliberately: they describe the Work's CURRENT state,
-- which a queued retry no longer has. The previous attempt's outcome survives on its own
-- `agent_tasks` row (status + error_code) and in the audit log, so nothing is lost -- but a
-- `queued` Work still showing the last refusal would tell the operator something false.
-- -------------------------------------------------------------------------------------
create function clara.retry_accounting_work(p_work uuid, p_author uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_dedupe jsonb; v_task uuid; v_live text; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a retry requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into w from clara.accounting_work aw where aw.id = p_work;
  if not found then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = w.firm_id
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'retrying accounting work requires a bookkeeper or above' using errcode='CLR04',
      detail='{"reason":"insufficient_role"}';
  end if;
  select c.status into v_client_status from clara.clients c where c.id = w.client_id;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  v_dedupe := clara._reserve_op(w.firm_id, 'retry_accounting_work', p_op_key,
    clara._hash(jsonb_build_object('work', p_work, 'author', p_author)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this retry key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  if w.status not in ('refused','failed','expired') then
    raise exception 'accounting work in state % is not retryable', w.status using errcode='CLR13',
      detail=jsonb_build_object('reason','not_retryable','status',w.status)::text;
  end if;
  select t.status into v_live from clara.agent_tasks t where t.id = w.current_task_id;
  if v_live is not null and v_live not in ('completed','failed','cancelled','expired') then
    raise exception 'the current run of this work is still % -- settle it first', v_live
      using errcode='CLR13',
        detail=jsonb_build_object('reason','not_retryable','status',w.status,'task_status',v_live)::text;
  end if;

  insert into clara.agent_tasks(kind, firm_id, client_id, status, created_by, model_snapshot, work_id)
    values ('accounting_work', w.firm_id, w.client_id, 'queued', p_author,
      (select t.model_snapshot from clara.agent_tasks t where t.id = w.current_task_id), w.id)
    returning id into v_task;
  update clara.accounting_work
     set status = 'queued', current_task_id = v_task, error = null, result = null
   where id = w.id;

  perform clara._audit(w.firm_id, p_author, null, null, 'retry_accounting_work', null,
    jsonb_build_object('work', w.id, 'task', v_task, 'logical_op_id', w.logical_op_id,
      'op_key', p_op_key, 'from_status', w.status));

  v_result := jsonb_build_object('work_id', w.id, 'task_id', v_task,
    'logical_op_id', w.logical_op_id, 'status', 'queued', 'replayed', false);
  return clara._finish_op(w.firm_id, 'retry_accounting_work', p_op_key, v_result);
end $$;
revoke all on function clara.retry_accounting_work(uuid,uuid,text) from public;
grant execute on function clara.retry_accounting_work(uuid,uuid,text) to clara_runtime;

-- -------------------------------------------------------------------------------------
-- claim — the compare-and-set that binds ONE engine run to ONE task.
-- -------------------------------------------------------------------------------------
create function clara.claim_work_run(p_task uuid, p_workflow_run_id text, p_bundle jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_upd int; v_claimed boolean; v_status text;
begin
  if p_workflow_run_id is null or p_workflow_run_id ~ '^\s*$' then
    raise exception 'a run claim requires its workflow run id' using errcode='CLR10',
      detail='{"reason":"invalid_run_id","constraint":"nonempty"}';
  end if;
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or nullif(btrim(coalesce(p_bundle->>'digest','')),'') is null
     or nullif(btrim(coalesce(p_bundle->>'id','')),'') is null then
    -- C88.8: a run that cannot state WHICH bundle is serving it may not claim work at all.
    raise exception 'a run claim must name its serving bundle (id + digest)' using errcode='CLR10',
      detail='{"reason":"invalid_bundle","constraint":"id+digest"}';
  end if;
  select * into t from clara.agent_tasks at where at.id = p_task;
  if not found then
    raise exception 'task not found' using errcode='CLR11', detail='{"reason":"task_not_found"}';
  end if;
  if t.kind <> 'accounting_work' then
    raise exception 'claim_work_run is for accounting-work runs only (got kind %)', t.kind
      using errcode='CLR10', detail=jsonb_build_object('reason','wrong_task_kind','kind',t.kind)::text;
  end if;

  update clara.agent_tasks
     set status = 'running', workflow_run_id = p_workflow_run_id, updated_at = now()
   where id = p_task and status = 'queued' and workflow_run_id is null;
  get diagnostics v_upd = row_count;
  if v_upd = 1 then
    v_claimed := true;
  else
    -- A RECLAIM by the SAME run is admitted: a crashed step re-executes and must find its own
    -- binding, not a refusal. A DIFFERENT run is refused, and the original binding is preserved
    -- (C-35: the correct old-run identity survives).
    v_claimed := (t.workflow_run_id = p_workflow_run_id
                  and t.status in ('running','awaiting_input'));
  end if;

  select at.status into v_status from clara.agent_tasks at where at.id = p_task;
  if v_claimed then
    update clara.accounting_work
       set status = case when status in ('queued','running') then 'running' else status end,
           bundle = p_bundle
     where id = t.work_id;
  end if;
  return jsonb_build_object('claimed', v_claimed, 'task_id', p_task, 'work_id', t.work_id,
    'status', v_status, 'run_bound', v_claimed);
end $$;
revoke all on function clara.claim_work_run(uuid,text,jsonb) from public;
grant execute on function clara.claim_work_run(uuid,text,jsonb) to clara_runtime;

-- -------------------------------------------------------------------------------------
-- settle — the terminal write, and the ONE place the Work's richer vocabulary is translated.
--
-- `agent_tasks.status` HAS NO `refused` VALUE, and widening it would change how every existing
-- consumer of the task queue reads every other kind. So a REFUSED Work settles its run `failed`
-- with error_code 'tool_error' (the estate's own code for "a tool said no") and records the TYPED
-- refusal on clara.accounting_work.error, which is where the web reads it. The Work's status is
-- the authority on what happened; the task's status is the authority on whether compute is done.
--
-- THE RECEIPT OVERRIDES THE REQUESTED OUTCOME (reviewed finding). Everything above is about
-- translating what the RUN believes; none of it asked the books. Measured on a live database:
-- a run commits `wake_record_journal_entry` -- approved entry, committed receipt, real money in
-- a real client's ledger -- and before its settle a bookkeeper calls `clara.cancel_agent_task`
-- on the task; the control path then settles `cancelled`, this verb wrote "Nothing was posted"
-- into `accounting_work.error`, and the run's own later `completed` settle came back
-- `{"replayed":true}` because the task was terminal by then. The books said posted, the Work
-- said cancelled, and nothing ever reconciled them.
--
-- A run's intention cannot un-post an entry. So when this Work already carries a COMMITTED
-- operation receipt, the outcome is FORCED to `completed` with the receipt's own effects as the
-- result and the error cleared, whatever the caller asked for -- and the overridden request is
-- recorded, in the returned object AND in the audit trail, because silently answering something
-- other than what was asked is how the estate loses a fact. The run's later `completed` settle
-- then replays, which is exactly what it should do. Nothing here invents an effect: the override
-- fires only on a receipt that the posting transaction itself wrote.
-- -------------------------------------------------------------------------------------
create function clara.settle_work_run(p_task uuid, p_outcome text, p_error_code text,
    p_error jsonb, p_result jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_task_status text; v_err text; v_work_status text;
  v_receipt jsonb; v_outcome text; v_overridden text;
begin
  if p_outcome is null or p_outcome not in ('completed','refused','failed','cancelled','expired') then
    raise exception 'unknown settle outcome %', p_outcome using errcode='CLR10',
      detail='{"reason":"invalid_outcome"}';
  end if;
  if p_error_code is not null
     and p_error_code not in ('model_error','tool_error','timeout','engine_lost','limit','internal') then
    raise exception 'unknown task error code %', p_error_code using errcode='CLR10',
      detail='{"reason":"invalid_error_code"}';
  end if;
  if p_error is not null and jsonb_typeof(p_error) <> 'object' then
    raise exception 'the settle error must be a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_outcome","constraint":"error_object"}';
  end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then
    raise exception 'the settle result must be a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_outcome","constraint":"result_object"}';
  end if;
  select * into t from clara.agent_tasks at where at.id = p_task;
  if not found then
    raise exception 'task not found' using errcode='CLR11', detail='{"reason":"task_not_found"}';
  end if;
  if t.kind <> 'accounting_work' then
    raise exception 'settle_work_run is for accounting-work runs only (got kind %)', t.kind
      using errcode='CLR10', detail=jsonb_build_object('reason','wrong_task_kind','kind',t.kind)::text;
  end if;

  if t.status in ('completed','failed','cancelled','expired') then
    return jsonb_build_object('work_id', t.work_id, 'task_id', p_task,
      'task_status', t.status,
      'status', (select w.status from clara.accounting_work w where w.id = t.work_id),
      'requested_outcome', p_outcome, 'overridden_by_receipt', false,
      'replayed', true);
  end if;

  -- THE BOOKS, BEFORE THE TRANSLATION. Asked once, of the one witness with standing.
  v_receipt := clara._work_committed_receipt(t.work_id);
  if v_receipt is not null and p_outcome <> 'completed' then
    v_overridden := p_outcome;
    v_outcome := 'completed';
  else
    v_outcome := p_outcome;
  end if;

  v_task_status := case v_outcome
    when 'completed' then 'completed'
    when 'refused'   then 'failed'
    when 'failed'    then 'failed'
    when 'cancelled' then 'cancelled'
    else 'expired' end;
  v_err := case v_outcome
    when 'refused' then coalesce(p_error_code, 'tool_error')
    when 'failed'  then coalesce(p_error_code, 'internal')
    when 'completed' then null   -- a completed run carries no task error, forced or not
    else p_error_code end;
  v_work_status := v_outcome;

  update clara.agent_tasks set status = v_task_status, error_code = v_err, updated_at = now()
   where id = p_task;
  update clara.accounting_work
     set status = v_work_status,
         error  = case when v_outcome = 'completed' then null else p_error end,
         -- On an override the receipt's own effects ARE the result: the caller's result (if any)
         -- describes an outcome that did not happen, so it is not merged over the books.
         result = case when v_overridden is not null
                         then coalesce(result, '{}'::jsonb) || v_receipt
                       when p_result is null then result
                       else coalesce(result, '{}'::jsonb) || p_result end
   where id = t.work_id;

  perform clara._audit(t.firm_id, clara.agent_user_id(), t.created_by, null,
    'settle_work_run', null,
    jsonb_build_object('work', t.work_id, 'task', p_task, 'outcome', v_work_status,
      'error_code', v_err, 'requested_outcome', p_outcome,
      'overridden_by_receipt', (v_overridden is not null))
    || case when v_overridden is not null
              then jsonb_build_object('overridden_outcome', v_overridden, 'receipt', v_receipt)
            else '{}'::jsonb end);

  return jsonb_build_object('work_id', t.work_id, 'task_id', p_task,
    'task_status', v_task_status, 'status', v_work_status,
    'requested_outcome', p_outcome, 'overridden_by_receipt', (v_overridden is not null),
    'replayed', false);
end $$;
revoke all on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) from public;
grant execute on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) to clara_runtime;

-- =====================================================================================
-- §F  THE WAKE LANE. One ungranted core, one granted wrapper that RAISES ONLY and carries no DML
-- (the 0004:617 / 0078:96 / 0107 shape, verbatim in posture).
-- =====================================================================================
create function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose = 'journal_entry';
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN INITIATOR, not merely SOME live bookkeeper of the firm.
  -- Reviewed finding: the two arms above ask whether `p_obo` still holds authority, and the
  -- wrapper asks whether the credential is pinned to this client -- neither asks whether this is
  -- the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's
  -- `on_behalf_of` -- the estate's record of WHOSE AUTHORITY was rechecked, and the name a
  -- reviewer reads off the posted entry -- would attribute the posting to a human who never
  -- authorised it. The Work names its initiator at admission and that column is immutable, so
  -- the binding is exact and cheap. This is an authority check, not an input check: CLR04.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences (that is what makes "the runtime never
  -- computes a digest" true), so if the WRITE read the raw echo instead, a padded account code
  -- would satisfy the digest and then land in clara.journal_lines with its padding — a stored
  -- line disagreeing with the identity that authorised it. Measured on the rig: an untrimmed
  -- code reached clara._validate_entry_lines and was refused as a non-existent account, one
  -- layer too late and under the wrong name.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable:
  -- a FIRST call echoing the wrong basis reserves, then fails the comparison below and rolls
  -- its own reservation back.
  -- `clara._reserve_op`'s own conflict raise carries no detail, and a classifier keyed on
  -- (errcode, reason) cannot act on a bare message -- so the conflict is
  -- detected here first, and the reservation call is wrapped so a genuine RACE answers the same
  -- way rather than escaping as an unclassifiable CLR10.
  v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed. clara._validate_entry_lines re-checks this below; this arm exists to give the
  -- runtime classifier a reason token and the composer a field.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence. (The estate's own deferred
  -- t_je_subledger_belt would abort this transaction at COMMIT anyway -- with `subledger_entry_
  -- untied`, a diagnosis about the wrong thing. This arm refuses early, under the right name.)
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id, because a caller-supplied one is the model asserting its own
  -- provenance (the clara.agent_act_receipts rule, 0138 §C).
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. NO document, NO filing, NO source_doc_sha256 -- there is nothing to
  -- reference and nothing is invented.
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id())
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    values (p_firm, p_client, p_work, 'journal_entry', p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', jsonb_build_object('entry_id', v_entry, 'revision_token', v_token))
    returning id into v_receipt;

  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now())
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale));

  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'replayed', false);
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

create function clara.wake_record_journal_entry(p_client uuid, p_work uuid, p_logical_op_id text,
    p_basis jsonb, p_bundle_digest text, p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode='CLR03',
      detail='{"reason":"no_wake_credential"}';
  end if;
  -- THE TYPED CHECK FIRST, THE ESTATE'S BELT SECOND. clara.assert_wake_allowed raises an untyped
  -- CLR03, which a pair-keyed classifier cannot act on -- so the kind is named here, and the
  -- allowlist assertion below stays as the belt that would still refuse a kind someone granted
  -- EXECUTE to by mistake.
  if w.wake_kind is distinct from 'interactive_client' then
    raise exception 'recording a journal entry requires the client-pinned chat wake kind (got %)', w.wake_kind
      using errcode='CLR03',
        detail=jsonb_build_object('reason','wrong_wake_kind','wake_kind',w.wake_kind)::text;
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_record_journal_entry');
  if w.on_behalf_of is null then
    raise exception 'this operation is performed under a named human''s authority; the credential names none'
      using errcode='CLR03', detail='{"reason":"wake_obo_unbound"}';
  end if;
  -- THE PIN IS THE AUTHORITY. Unlike the 0107 doors, an UNPINNED credential is refused here too:
  -- `interactive_client` is client-pinned by construction (0133's own mint arm), so a NULL pin on
  -- this kind is a state that should not exist, and admitting it would be exactly the
  -- cross-client hole H1 closed one door earlier.
  if w.client_id is null or p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',
      detail='{"reason":"credential_client_pin"}';
  end if;
  if p_logical_op_id is null or p_logical_op_id ~ '^\s*$' then
    raise exception 'an accounting operation requires its logical identity' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an agent posting must state its rationale' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_run_id,'')),'') is null then
    raise exception 'an agent posting must name the run that made it' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"run_id","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_bundle_digest,'')),'') is null then
    raise exception 'an agent posting must name the bundle serving it' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"bundle_digest","constraint":"nonempty"}';
  end if;
  perform 1 from clara.clients c where c.id = p_client and c.firm_id = w.firm_id;
  if not found then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  return clara._record_journal_entry_core(w.firm_id, w.on_behalf_of, w.wake_kind, p_client,
    p_work, p_logical_op_id, p_basis, p_bundle_digest, p_run_id, p_rationale);
end $$;
revoke all on function clara.wake_record_journal_entry(uuid,uuid,text,jsonb,text,text,text) from public;
grant execute on function clara.wake_record_journal_entry(uuid,uuid,text,jsonb,text,text,text)
  to clara_wake_interactive;

insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive_client', 'wake_record_journal_entry')
on conflict do nothing;

-- =====================================================================================
-- §G  THE AGENT-POST RECEIPT WALL, WIDENED — a STRICT widening, nothing else moved.
--
-- 0106 §B demands exactly one `clara.entry_post_receipts` row for every approved transition whose
-- checker is the agent identity. That receipt is DOCUMENT-SHAPED: its `gate_verdicts` CHECK
-- requires a non-blank `extraction_id`, which a documentless journal entry cannot have and must
-- never fabricate. Without this widening the wall would abort every #623 post at COMMIT — with a
-- CLR08 about a missing receipt, while the operation's real receipt sat one table away.
--
-- WHAT MOVES: exactly one conjunct. The count is now taken across BOTH receipt tables, and the
-- rule is unchanged in force — NEVER ZERO, NEVER TWO. Every entry the old body admitted, the new
-- body admits; every entry it refused, the new body refuses, unless an operation receipt now
-- accounts for it.
--
-- WHAT DOES NOT MOVE: ARM 0 stays FIRST and still refuses an unresolvable checker rather than
-- assuming a human (law 68); the live arm is still keyed on `clara.users.is_agent` ALONE, with no
-- exemption of any kind; and the trigger's own event set is UNTOUCHED (AFTER UPDATE only) — a
-- wall written for this receipt shape must not start firing on every other lane's approved
-- INSERT. The rule-id exemption E.3 never authorised is still absent, and this file's tail
-- re-asserts that in both directions.
-- =====================================================================================
create or replace function clara._tf_assert_agent_post_receipt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_is_agent boolean; v_n int; v_doc int; v_op int;
begin
  -- ARM 0.
  if new.checker_actor is null then
    raise exception 'an approved entry has no checker actor; the agent-post receipt wall cannot resolve the approving identity'
      using errcode='CLR08', detail='{"reason":"agent_post_receipt_arm0_null_checker"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = new.checker_actor;
  if not found or v_is_agent is null then
    raise exception 'the approving identity % is unresolvable; the agent-post receipt wall refuses rather than assuming a human', new.checker_actor
      using errcode='CLR08', detail='{"reason":"agent_post_receipt_arm0_unresolvable_checker"}';
  end if;
  -- A human approval writes no receipt. THAT IS THE WHOLE CONDITION (Annex E.3).
  if not v_is_agent then
    return null;
  end if;
  -- THE TWO RECEIPT SHAPES, COUNTED TOGETHER. The document lane writes a post receipt keyed on
  -- the entry; the #623 accounting-operation lane writes an operation receipt naming the entry in
  -- its effects. An agent-approved entry owes EXACTLY ONE, in EITHER table -- never zero, and
  -- never one of each, which would be two writers claiming the same post.
  select count(*)::int into v_doc from clara.entry_post_receipts r where r.entry_id = new.id;
  select count(*)::int into v_op from clara.operation_receipts o
    where o.effects->>'entry_id' = new.id::text and o.outcome = 'committed';
  v_n := v_doc + v_op;
  if v_n <> 1 then
    raise exception 'an unattended agent post carries exactly one post receipt; entry % carries % (% document-shaped, % operation-shaped)',
      new.id, v_n, v_doc, v_op
      using errcode='CLR08', detail=jsonb_build_object('reason','agent_post_receipt_missing',
        'entry_id', new.id, 'receipts', v_n,
        'entry_post_receipts', v_doc, 'operation_receipts', v_op)::text;
  end if;
  return null;
end $$;

reset role;

-- =====================================================================================
-- §H  TAIL CENSUS. Re-read the committed catalog and say what it found.
-- =====================================================================================
do $w623_tail$
declare
  v_n int; v_def text; v_src text; v_grantees text[]; v_bad text; v_role text; v_tbl text;
  v_priv text; v_dml int;
begin
  -- (H.1) Both tables: forced RLS, the policy set each is supposed to carry, no app-role DML, and
  -- an ACL read back grantee-by-grantee. accounting_work is READ by the runtime as well as by the
  -- human role -- claraWork_v1's loadWorkStep joins it and GET /api/work/:workId selects it, both
  -- inside the runtime pool -- so it carries a THIRD policy and a second SELECT grantee.
  -- operation_receipts has no runtime read site and stays on the owner+read pair.
  foreach v_tbl in array array['accounting_work','operation_receipts'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_tbl and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '#623 tail: clara.% lacks forced RLS', v_tbl using errcode='CLR10';
    end if;
    v_n := (select count(*) from pg_policy where polrelid = ('clara.'||v_tbl)::regclass);
    if v_n <> (case when v_tbl = 'accounting_work' then 3 else 2 end) then
      raise exception '#623 tail: clara.% carries % policies, not the reviewed set', v_tbl, v_n using errcode='CLR10';
    end if;
    -- NO app role holds DML on EITHER table. The verbs are the only door, and the runtime arm
    -- below widens the READ surface only.
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive','clara_freeform_ro'] loop
      foreach v_priv in array array['insert','update','delete','truncate'] loop
        if has_table_privilege(v_role, 'clara.'||v_tbl, v_priv) then
          raise exception '#623 tail: % holds % on clara.% -- the verbs are the only door', v_role, v_priv, v_tbl using errcode='CLR10';
        end if;
      end loop;
    end loop;
    if not has_table_privilege('clara_authenticated', 'clara.'||v_tbl, 'select') then
      raise exception '#623 tail: clara_authenticated cannot SELECT clara.%', v_tbl using errcode='CLR10';
    end if;
    -- WHO HOLDS WHAT, read from the table's OWN acl rather than through has_table_privilege():
    -- that function follows grants-of-role and would call an inherited privilege the table's own.
    -- PUBLIC first, because a PUBLIC grant explodes to grantee 0 and joins no role.
    if exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
        where c.oid = ('clara.'||v_tbl)::regclass and a.grantee = 0) then
      raise exception '#623 tail: clara.% carries a PUBLIC grant', v_tbl using errcode='CLR10';
    end if;
    select coalesce(array_agg(r.rolname||':'||lower(a.privilege_type)
                              order by r.rolname, a.privilege_type), '{}'::text[])
      into v_grantees
      from pg_class c cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
     where c.oid = ('clara.'||v_tbl)::regclass and a.grantee <> c.relowner;
    if v_grantees <> (case when v_tbl = 'accounting_work'
          then array['clara_authenticated:select','clara_runtime:select']
          else array['clara_authenticated:select'] end) then
      raise exception '#623 tail: clara.% grants %, not the reviewed SELECT-only set', v_tbl, v_grantees using errcode='CLR10';
    end if;
  end loop;
  -- (H.1b) The runtime read arm, stated positively and negatively. The run must be able to LOAD
  -- the Work it was handed; it must not be able to move it, and it gains nothing on the receipt
  -- table, whose only reader is the human role.
  if not has_table_privilege('clara_runtime', 'clara.accounting_work', 'select') then
    raise exception '#623 tail: clara_runtime cannot SELECT clara.accounting_work -- claraWork_v1 cannot load its own Work' using errcode='CLR10';
  end if;
  if has_table_privilege('clara_runtime', 'clara.operation_receipts', 'select') then
    raise exception '#623 tail: clara_runtime holds SELECT on clara.operation_receipts -- the runtime has no read site there' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_policy p where p.polrelid = 'clara.accounting_work'::regclass
      and p.polname = 'p_accounting_work_runtime' and p.polcmd = 'r'
      and p.polwithcheck is null
      and p.polroles = array['clara_runtime'::regrole::oid]) then
    raise exception '#623 tail: p_accounting_work_runtime is not a SELECT-only, clara_runtime-only arm' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid = 'clara.operation_receipts'::regclass
      and 'clara_runtime'::regrole::oid = any(p.polroles)) then
    raise exception '#623 tail: a clara_runtime policy reaches clara.operation_receipts' using errcode='CLR10';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid='clara.operation_receipts'::regclass
        and not t.tgisinternal) <> 2 then
    raise exception '#623 tail: operation_receipts does not carry both immutability belts' using errcode='CLR10';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid='clara.accounting_work'::regclass
        and not t.tgisinternal) <> 2 then
    raise exception '#623 tail: accounting_work does not carry both guard triggers' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
      where c.relname='uq_operation_receipts_committed' and i.indisunique and i.indisvalid
        and i.indpred is not null) then
    raise exception '#623 tail: the one-committed-effect-per-identity partial unique index is absent or not valid' using errcode='CLR10';
  end if;

  -- (H.2) The kind CHECK gained one value and LOST NONE.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid='clara.agent_tasks'::regclass and c.conname='ck_agent_tasks_kind_0011';
  foreach v_bad in array array['chat_turn','wake','autodraft','close_prep','accounting_work'] loop
    if position(v_bad in v_def) = 0 then
      raise exception '#623 tail: ck_agent_tasks_kind_0011 lost or never gained %: %', v_bad, v_def using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid='clara.agent_tasks'::regclass
      and c.conname='ck_agent_tasks_work_id_kind') then
    raise exception '#623 tail: the work_id/kind congruence CHECK is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid='clara.agent_tasks'::regclass
      and t.tgname='t_agent_tasks_work_status_mirror') then
    raise exception '#623 tail: the status-mirror trigger is absent' using errcode='CLR10';
  end if;
  -- The other two sites that gate `kind`, re-read from the catalog: a kind on the CHECK alone is
  -- admitted by the catalog and refused by the triggers.
  foreach v_bad in array array['_tf_agent_task_insert','_tf_agent_task_update'] loop
    select p.prosrc into v_src from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=v_bad;
    if position('accounting_work' in v_src) = 0 then
      raise exception '#623 tail: clara.% still refuses the accounting_work kind', v_bad using errcode='CLR10';
    end if;
    foreach v_role in array array['chat_turn','wake','autodraft','close_prep'] loop
      if position(v_role in v_src) = 0 then
        raise exception '#623 tail: clara.% lost its % arm across the splice', v_bad, v_role using errcode='CLR10';
      end if;
    end loop;
  end loop;
  select p.prosrc into v_src from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_tf_agent_task_update';
  if position('new.work_id is distinct from old.work_id' in v_src) = 0 then
    raise exception '#623 tail: agent_tasks.work_id is not in the update guard''s immutable set' using errcode='CLR10';
  end if;

  -- (H.3) The receipt wall: widened, arms intact, event set UNMOVED.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._tf_assert_agent_post_receipt()'::regprocedure;
  if position('checked_via_rule_id' in v_src) <> 0 then
    raise exception '#623 tail: the receipt wall regained a rule-id exemption -- E.3 authorises none' using errcode='CLR10';
  end if;
  if position('if not v_is_agent then' in v_src) = 0 then
    raise exception '#623 tail: the receipt wall''s live arm is no longer keyed on is_agent alone' using errcode='CLR10';
  end if;
  if position('clara.operation_receipts' in v_src) = 0
     or position('clara.entry_post_receipts' in v_src) = 0 then
    raise exception '#623 tail: the receipt wall does not count BOTH receipt shapes' using errcode='CLR10';
  end if;
  if position('new.checker_actor is null' in v_src)
       > position('is_agent into v_is_agent' in v_src) then
    raise exception '#623 tail: ARM 0 is no longer first in the receipt wall' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_agent_post_receipt'
     and t.tgdeferrable and t.tginitdeferred and (t.tgtype & 4) = 0 and (t.tgtype & 16) = 16;
  if v_n <> 1 then
    raise exception '#623 tail: t_je_agent_post_receipt is no longer a deferred UPDATE-only constraint trigger' using errcode='CLR10';
  end if;

  -- (H.4) The grant matrix, read from the catalog rather than asserted from the file.
  foreach v_bad in array array['admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
      'retry_accounting_work(uuid,uuid,text)', 'claim_work_run(uuid,text,jsonb)',
      'settle_work_run(uuid,text,text,jsonb,jsonb)'] loop
    select coalesce(array_agg(g order by g),'{}') into v_grantees from (
      select distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
        from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
       where f.oid = ('clara.'||v_bad)::regprocedure
         and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q;
    if v_grantees is distinct from array['clara_runtime'] then
      raise exception '#623 tail: clara.% EXECUTE grantees are %, expected exactly {clara_runtime}', v_bad, v_grantees using errcode='CLR10';
    end if;
  end loop;
  select coalesce(array_agg(g order by g),'{}') into v_grantees from (
    select distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
      from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
     where f.oid='clara.wake_record_journal_entry(uuid,uuid,text,jsonb,text,text,text)'::regprocedure
       and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q;
  if v_grantees is distinct from array['clara_wake_interactive'] then
    raise exception '#623 tail: the wake verb''s EXECUTE grantees are %, expected exactly {clara_wake_interactive}', v_grantees using errcode='CLR10';
  end if;
  foreach v_bad in array array['_record_journal_entry_core','_assert_journal_basis',
      '_journal_basis_canonical','_journal_basis_digest','_journal_cents',
      '_work_committed_receipt',
      '_tf_accounting_work_immutable','_tf_accounting_work_status_mirror'] loop
    if exists (select 1 from pg_proc f
        cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
       where f.pronamespace='clara'::regnamespace and f.proname=v_bad
         and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) then
      raise exception '#623 tail: clara.% is reachable by an application role -- the wrapper is meant to be the only door', v_bad using errcode='CLR10';
    end if;
  end loop;

  -- (H.5) Every new function is SECURITY DEFINER with a pinned search_path and owned by
  -- clara_fn_owner (T18's rule, asserted here rather than discovered by the rig).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('admit_journal_work','retry_accounting_work','claim_work_run',
       'settle_work_run','wake_record_journal_entry','_record_journal_entry_core',
       '_assert_journal_basis','_journal_basis_canonical','_journal_basis_digest','_journal_cents',
       '_work_committed_receipt',
       '_tf_accounting_work_immutable','_tf_accounting_work_status_mirror')
     and (not p.prosecdef or p.proowner <> 'clara_fn_owner'::regrole
          or p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));
  if v_n <> 0 then
    raise exception '#623 tail: % new function(s) are not definer/owned/search_path-pinned', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('admit_journal_work','retry_accounting_work','claim_work_run',
       'settle_work_run','wake_record_journal_entry','_record_journal_entry_core');
  if v_n <> 6 then
    raise exception '#623 tail: expected exactly 6 verb bodies, found %', v_n using errcode='CLR10';
  end if;

  -- (H.6) The allowlist gained exactly ONE row, on exactly the pinned chat kind.
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where function_name='wake_record_journal_entry';
  if v_n <> 1 then
    raise exception '#623 tail: wake_record_journal_entry holds % allowlist row(s), expected exactly 1', v_n using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.wake_fn_allowlist
      where function_name='wake_record_journal_entry' and wake_kind='interactive_client') then
    raise exception '#623 tail: the one allowlist row is not on interactive_client' using errcode='CLR10';
  end if;

  -- (H.7) The lane ships EMPTY. A migration that arrived carrying rows would mean it had been
  -- applied before, or that something outside the verbs can write.
  if (select count(*) from clara.accounting_work) <> 0
     or (select count(*) from clara.operation_receipts) <> 0 then
    raise exception '#623 tail: the accounting-work lane did not ship empty' using errcode='CLR10';
  end if;

  -- (H.8) THE BASELINE THIS FILE MUST NOT MOVE, re-measured: how many APP-EXECUTABLE functions
  -- carry DML text against clara.journal_entries. The wake wrapper must NOT be one of them --
  -- the DML lives in the ungranted core, which is the whole shape of the 0107 door.
  select count(*) into v_dml from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and f.proname in ('wake_record_journal_entry','admit_journal_work','retry_accounting_work',
       'claim_work_run','settle_work_run')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.journal_entries\M';
  if v_dml <> 0 then
    raise exception '#623 tail: % granted #623 verb(s) carry DML against clara.journal_entries', v_dml using errcode='CLR10';
  end if;

  -- (H.9) THE FOUR REVIEWED FINDINGS, each re-read from the COMMITTED catalog rather than
  -- trusted from the text above. A postcheck that only restated the file would be a comment.
  --
  -- (H.9a) F3 — the intent key's identity is CLIENT-scoped, read off the constraint's own
  -- column list in its own key order. A firm-scoped key made the same key on a second client of
  -- the same firm return the FIRST client's Work as a replay, dropping the second intent.
  select coalesce(array_agg(a.attname order by k.ord), '{}'::text[]) into v_grantees
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'clara.accounting_work'::regclass
     and c.conname = 'uq_accounting_work_intent';
  if v_grantees <> array['firm_id','client_id','intent_key'] then
    raise exception '#623 tail: uq_accounting_work_intent covers %, not (firm_id, client_id, intent_key)', v_grantees using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'w.client_id = p_client', ''))) / length('w.client_id = p_client') <> 2 then
    raise exception '#623 tail: admission does not scope BOTH intent-key lookups (fast path and unique_violation arm) to the client' using errcode='CLR10';
  end if;

  -- (H.9b) F1 — the receipt override. BOTH askers consult the one predicate, and the settle
  -- verb names the override in what it returns rather than answering something other than what
  -- it was asked without saying so.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.settle_work_run(uuid,text,text,jsonb,jsonb)'::regprocedure;
  if position('clara._work_committed_receipt' in v_src) = 0
     or position('overridden_by_receipt' in v_src) = 0 then
    raise exception '#623 tail: settle_work_run does not consult the committed receipt before translating an outcome -- a cancelled run could still write "nothing was posted" over a posted entry' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._tf_accounting_work_status_mirror()'::regprocedure;
  if position('clara._work_committed_receipt' in v_src) = 0 then
    raise exception '#623 tail: the status mirror carries no receipt-aware terminal arm -- clara.cancel_agent_task would strand a posted Work' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_agent_task_update()'::regprocedure;
  if position($arm$'cancel_requested','completed','cancelled','failed','expired'$arm$ in v_src) = 0 then
    raise exception '#623 tail: the accounting_work queued arm cannot reach completed -- the receipt override would raise CLR13 out of the task guard' using errcode='CLR10';
  end if;

  -- (H.9c) F2 — the credential's human IS the Work's initiator, not merely some live bookkeeper.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('obo_not_initiator' in v_src) = 0
     or position('p_obo is distinct from w.initiator' in v_src) = 0 then
    raise exception '#623 tail: the commit core does not bind the credential''s human to the Work''s own initiator -- the receipt could attribute a posting to a human who never asked for it' using errcode='CLR10';
  end if;

  -- (H.9d) F4 — the frozen tool schema's caps are restated at admission, so nothing is admitted
  -- that the run could never post.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._assert_journal_basis(jsonb)'::regprocedure;
  foreach v_bad in array array['max_length', '> 4000', '> 2000', '].description'] loop
    if position(v_bad in v_src) = 0 then
      raise exception '#623 tail: the basis assertion carries no % arm -- an unpostable basis would still admit', v_bad using errcode='CLR10';
    end if;
  end loop;

  raise notice '#623 tail: OK -- clara.accounting_work and clara.operation_receipts created (forced RLS, ZERO DML to any app role, both immutability belts, and the one-committed-effect-per-logical-identity partial unique index). The READ surface is asserted from the ACL itself, grantee by grantee: accounting_work grants SELECT and only SELECT to exactly clara_authenticated and clara_runtime -- the run has to be able to load the Work it was handed -- behind an owner arm, a human arm and a SELECT-only clara_runtime arm; operation_receipts grants SELECT to clara_authenticated alone behind the owner+read pair, and no clara_runtime grant or policy reaches it. agent_tasks.kind gained accounting_work and LOST NOTHING; work_id is bidirectionally CHECK-bound to that kind and the status mirror carries running/awaiting_input plus ONE receipt-aware terminal arm. Four runtime verbs reach clara_runtime and nobody else; one wake verb reaches clara_wake_interactive and nobody else, behind exactly ONE interactive_client allowlist row, with its DML in an UNGRANTED core. The agent-post receipt wall now counts BOTH receipt shapes with ARM 0 still first, the is_agent-only live arm intact, no rule-id exemption, and its AFTER UPDATE event set unmoved. The lane ships empty. THE FOUR REVIEWED FINDINGS are re-read from the catalog too: the intent key is unique on (firm_id, client_id, intent_key) and BOTH admission lookups carry the client conjunct, so one key against two clients of a firm is two Works; clara.settle_work_run and the agent_tasks status mirror BOTH consult clara._work_committed_receipt before writing a terminal state, so a cancelled, failed or expired settle over a Work that already holds a committed operation receipt lands as completed with the receipt as its result (and says so, in the answer and in the audit row) instead of writing "nothing was posted" over a posted entry; the accounting_work queued arm can reach completed so that override is not refused by the task guard; clara._record_journal_entry_core binds the credential''s on_behalf_of to the Work''s OWN initiator (CLR04 obo_not_initiator), so a credential minted OBO another live bookkeeper cannot commit somebody else''s Work; and clara._assert_journal_basis restates the frozen tool schema''s memo (4000) and line-description (2000) caps, so nothing is admitted that the run could never post.';
end
$w623_tail$;
