-- 0003_books_core — Slice-2 governed DB core, part 2 of 3: the books tables
-- (clients, chart of accounts, documents, resolutions, journal entries + lines,
-- the FA register schema, notifications) and EVERY structural trigger that makes
-- the invariants law in the DB rather than in model discipline. The audited
-- writers that are the ONLY sanctioned way to mutate these tables are 0004.
--
-- Authority: docs/architecture/ARCHITECTURE.md §0/§3 (four structural
-- invariants), docs/prd/PRD.md §2/§6, Slice-2 design v1 §3 as amended by v2 §E.
--
-- KEY v2 CORRECTIONS BAKED IN HERE:
--  * status enum is ('draft','approved') ONLY — the v1 'drafting' skip-lane is
--    removed (v2 §E/F13); the balance trigger therefore applies to EVERY entry.
--  * line immutability fires on INSERT too (v2 §E/F12): a balanced pair appended
--    into an already-approved entry is rejected. The immutability rules key on
--    the parent entry's status + OLD/NEW column deltas ONLY — NOT on a
--    caller-settable via_fn marker (v2 dropped via_fn-as-authorization).
--  * BEFORE TRUNCATE statement triggers make audit_log / journal_entries /
--    journal_lines append-only against everyone but a DB superuser (documented
--    honesty boundary — see 0002 header / README).
--  * revision_token rotates whenever a draft's lines change (v2 §E/F15).
--  * reversal linkage on the original is set only when the mirror is APPROVED,
--    and the one-reversal backstop is `unique(reversal_of) where status='approved'`
--    (v2 §E/F14).
--
-- Every firm-scoped table carries firm_id, STAMPED by a BEFORE trigger from the
-- parent row or the session — never trusted from the caller. Money is bigint cents.

set role clara_fn_owner;

-- =====================================================================
-- 1. BOOKS TABLES
-- =====================================================================

create table clara.clients (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid        not null references clara.firms(id),
  name       text        not null,
  status     text        not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);
create unique index uq_clients_firm_name on clara.clients (firm_id, lower(name));

-- Client-scoped chart of accounts. The composite (client_id, account_code) PK is
-- the FK target for journal_lines (line integrity). special_acc_type replaces the
-- old build's seed-coupled `980-100` rounding literal (audit N6): a client's
-- rounding account is discovered by special_acc_type='rounding', unique per client.
create table clara.coa_accounts (
  client_id        uuid        not null references clara.clients(id),
  firm_id          uuid        not null,
  account_code     text        not null check (account_code ~ '^[0-9]{4,8}$'),
  name             text        not null,
  account_type     text        not null check (account_type in ('asset','liability','equity','income','expense')),
  special_acc_type text        check (special_acc_type in ('rounding')),
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  primary key (client_id, account_code)
);
create unique index uq_coa_special on clara.coa_accounts (client_id, special_acc_type)
  where (special_acc_type is not null);

-- Documents. client_id nullable (the unassigned lane arrives Slice 5). sha256 +
-- firm_id + client_id are frozen after ingest by an immutability trigger (v2 §E:
-- reassignment is a future audited move). Unique (firm_id, sha256).
create table clara.documents (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid        not null,
  client_id         uuid        references clara.clients(id),
  sha256            text        not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_filename text,
  mime_type         text,
  byte_size         bigint,
  storage_path      text,
  status            text        not null default 'ingested' check (status in ('ingested')),
  uploaded_by       uuid        references clara.users(id),
  created_at        timestamptz not null default now(),
  unique (firm_id, sha256)
);

-- Client-attribution resolutions (invariant 1). method is STAMPED FROM THE LANE
-- by the writer (v2 §D): a human confirmation is 'human'; an agent proposal is
-- 'agent'. assert_client_resolved (0004) only accepts method IN ('human','rule')
-- at confidence >= 0.95 — an agent proposal never self-authorizes a posting.
create table clara.client_resolutions (
  id            uuid          primary key default gen_random_uuid(),
  firm_id       uuid          not null,
  client_id     uuid          not null references clara.clients(id),
  subject_kind  text          not null check (subject_kind in ('document','chat_task','manual')),
  subject_id    uuid,
  confidence    numeric(4,3)  not null check (confidence >= 0 and confidence <= 1),
  method        text          not null check (method in ('human','rule','agent')),
  evidence      jsonb         not null default '{}',
  superseded_at timestamptz,
  resolved_by   uuid          references clara.users(id),
  created_at    timestamptz   not null default now()
);

-- Journal entries. A reversed original KEEPS status 'approved' (it is still in the
-- books); reversal state is reversed_by IS NOT NULL. ck_je_basis makes every
-- journal carry a basis: a bound document, OR a non-empty memo (invariant 2/ v2
-- §E memo-required). ck_je_doc_pair keeps the (document_id, sha256) pair coherent.
create table clara.journal_entries (
  id                        uuid        primary key default gen_random_uuid(),
  firm_id                   uuid        not null,
  client_id                 uuid        not null references clara.clients(id),
  status                    text        not null check (status in ('draft','approved')),
  posting_date              date        not null,
  memo                      text,
  origin                    text        not null check (origin in ('manual','document','agent','reversal')),
  document_id               uuid        references clara.documents(id),
  source_doc_sha256         text        check (source_doc_sha256 ~ '^[0-9a-f]{64}$'),
  resolution_id             uuid        references clara.client_resolutions(id),
  is_opening_balance        boolean     not null default false,
  is_year_end               boolean     not null default false,
  tax_affecting             boolean     not null default false,
  maker_actor               uuid        not null references clara.users(id),
  last_human_editor         uuid        references clara.users(id),
  checker_actor             uuid        references clara.users(id),
  self_approval_attestation text,
  revision_token            uuid        not null default gen_random_uuid(),
  approved_at               timestamptz,
  reversal_of               uuid        references clara.journal_entries(id),
  reversed_by               uuid        references clara.journal_entries(id),
  reversal_reason           text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint ck_je_doc_pair check ((document_id is null) = (source_doc_sha256 is null)),
  constraint ck_je_basis    check (document_id is not null or (memo is not null and btrim(memo) <> ''))
);
-- One APPROVED reversal per original (v2 §E/F14: an abandoned draft mirror does
-- NOT block a later reversal; only an approved one does). PORT of uq_je_one_reverse.
create unique index uq_je_one_approved_reversal on clara.journal_entries (reversal_of)
  where (status = 'approved' and reversal_of is not null);

-- Journal lines. (client_id, account_code) FK into the chart. Exactly one of
-- debit/credit is > 0 (ck_jl_one_side rejects zero-amount and both-sides). client
-- + firm are stamped from the parent entry (PORT of set_jl_client_firm).
create table clara.journal_lines (
  id           uuid   primary key default gen_random_uuid(),
  entry_id     uuid   not null references clara.journal_entries(id) on delete cascade,
  line_no      int    not null,
  client_id    uuid   not null,
  firm_id      uuid   not null,
  account_code text   not null,
  debit_cents  bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  description  text,
  constraint ck_jl_one_side check ((debit_cents > 0) <> (credit_cents > 0)),
  constraint fk_jl_account foreign key (client_id, account_code)
    references clara.coa_accounts (client_id, account_code),
  unique (entry_id, line_no)
);

-- FA register — SCHEMA ONLY (Wave B/D wire the workflows). Includes the FA
-- carry-down baseline fields (v2 §H item 4) so Wave B has them.
create table clara.fixed_assets (
  id                             uuid        primary key default gen_random_uuid(),
  firm_id                        uuid        not null,
  client_id                      uuid        not null references clara.clients(id),
  description                    text        not null,
  acquired_date                  date,
  cost_cents                     bigint      check (cost_cents > 0),
  residual_cents                 bigint      default 0 check (residual_cents >= 0),
  useful_life_months             int         check (useful_life_months > 0),
  depreciation_method            text        not null default 'straight_line' check (depreciation_method in ('straight_line')),
  asset_account_code             text,
  accum_depr_account_code        text,
  depr_expense_account_code      text,
  acquisition_entry_id           uuid        references clara.journal_entries(id),
  disposed_at                    date,
  accumulated_depreciation_cents bigint      not null default 0 check (accumulated_depreciation_cents >= 0),
  depreciation_start_date        date,
  baseline_as_of                 date,
  status                         text        not null default 'active' check (status in ('active','disposed')),
  created_at                     timestamptz not null default now(),
  constraint ck_fa_residual check (residual_cents is null or cost_cents is null or residual_cents <= cost_cents),
  constraint fk_fa_asset_acc foreign key (client_id, asset_account_code)
    references clara.coa_accounts (client_id, account_code),
  constraint fk_fa_accum_acc foreign key (client_id, accum_depr_account_code)
    references clara.coa_accounts (client_id, account_code),
  constraint fk_fa_depr_acc foreign key (client_id, depr_expense_account_code)
    references clara.coa_accounts (client_id, account_code)
);

create table clara.notifications (
  id         uuid        primary key default gen_random_uuid(),
  firm_id    uuid        not null,
  client_id  uuid        references clara.clients(id),
  kind       text        not null,
  payload    jsonb       not null default '{}',
  created_by uuid        references clara.users(id),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 2. TRIGGER FUNCTIONS. All SECURITY DEFINER owned by clara_fn_owner with a
--    pinned search_path (rig T18) so they read/stamp under the owner's using(true)
--    policy regardless of the invoking role — including a deferred check that
--    fires at COMMIT in a raw-DML/superuser session.
-- =====================================================================

-- firm_id stamping (PORT of the app.set_firm_id family). Derive from the parent so
-- a line can NEVER be attributed to a different firm than its entry (invariant 1).
create function clara._tf_stamp_from_client() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  select firm_id into new.firm_id from clara.clients where id = new.client_id;
  if new.firm_id is null then
    raise exception 'unknown client %', new.client_id using errcode = 'CLR10';
  end if;
  return new;
end $$;

create function clara._tf_stamp_line_from_entry() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  select client_id, firm_id into new.client_id, new.firm_id
    from clara.journal_entries where id = new.entry_id;
  if new.firm_id is null then
    raise exception 'unknown entry %', new.entry_id using errcode = 'CLR10';
  end if;
  return new;
end $$;

-- documents / notifications: firm from the client when present, else the session
-- (a trusted definer writer resolved the session firm before inserting).
create function clara._tf_stamp_from_client_or_session() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.client_id is not null then
    select firm_id into new.firm_id from clara.clients where id = new.client_id;
    if new.firm_id is null then
      raise exception 'unknown client %', new.client_id using errcode = 'CLR10';
    end if;
  else
    -- Parentless: writer passes validated c.firm; session is a fallback only (§0 hardening).
    new.firm_id := coalesce(new.firm_id, clara.actor_firm_id());
    if new.firm_id is null then
      raise exception 'no firm context' using errcode = 'CLR04';
    end if;
  end if;
  return new;
end $$;

-- clients: firm from the writer's validated value (coalesce), session as fallback.
create function clara._tf_stamp_client_firm() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  new.firm_id := coalesce(new.firm_id, clara.actor_firm_id());
  if new.firm_id is null then
    raise exception 'no firm context' using errcode = 'CLR04';
  end if;
  return new;
end $$;

-- Balance: Σdebit = Σcredit AND total > 0 for EVERY entry (v2 §E: no skip lane).
-- Callable directly by the writer (synchronous CLR07 to the caller) AND wrapped by
-- the deferred constraint trigger (commit-time backstop for the raw path).
create function clara._assert_balanced(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dr bigint; v_cr bigint;
begin
  -- Skip a deleted entry (its lines cascade); entries are never deleted anyway.
  if not exists (select 1 from clara.journal_entries where id = p_entry) then return; end if;
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0)
    into v_dr, v_cr from clara.journal_lines where entry_id = p_entry;
  if v_dr <> v_cr or v_dr = 0 then
    raise exception 'entry % is unbalanced (debit=% credit=%)', p_entry, v_dr, v_cr
      using errcode = 'CLR07';
  end if;
end $$;

create function clara._tf_check_balance() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_table_name = 'journal_entries' then
    perform clara._assert_balanced(new.id);
  else -- journal_lines: a moved line must leave BOTH touched entries balanced.
    if tg_op in ('INSERT','UPDATE') then perform clara._assert_balanced(new.entry_id); end if;
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.entry_id is distinct from old.entry_id) then
      perform clara._assert_balanced(old.entry_id);
    end if;
  end if;
  return null;
end $$;

-- Provenance belt (invariant 2b). On an entry that names a document, the document
-- must exist with EXACTLY that sha256, same firm, AND documents.client_id =
-- entry.client_id (v2 §E/F16 exact-client). Deferred so it also catches a raw
-- superuser INSERT with a mismatched pair.
create function clara._tf_check_provenance() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.document_id is not null then
    if not exists (
      select 1 from clara.documents d
      where d.id = new.document_id and d.sha256 = new.source_doc_sha256
        and d.firm_id = new.firm_id and d.client_id = new.client_id
    ) then
      raise exception 'provenance mismatch for entry %', new.id using errcode = 'CLR02';
    end if;
  end if;
  return null;
end $$;

-- Line immutability (invariant, v2 §E/F12 + HIGH 3). Once the parent entry is
-- approved, its lines are frozen — INSERT, UPDATE, DELETE all raise CLR08. On an
-- UPDATE we check BOTH the OLD and the NEW parent: a reparenting UPDATE that moves
-- a line OUT OF an approved entry (or INTO one) is rejected even though the row's
-- new entry_id points at a draft — otherwise an approved entry could silently lose
-- a line while both touched entries stayed balanced.
create function clara._tf_lines_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_status text;
begin
  if tg_op in ('UPDATE','DELETE') and old.entry_id is not null then
    select status into v_status from clara.journal_entries where id = old.entry_id;
    if v_status = 'approved' then
      raise exception 'lines of an approved entry are immutable' using errcode = 'CLR08';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.entry_id is not null then
    select status into v_status from clara.journal_entries where id = new.entry_id;
    if v_status = 'approved' then
      raise exception 'lines of an approved entry are immutable' using errcode = 'CLR08';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Rotate a DRAFT entry's revision_token whenever its lines change (v2 §E/F15) so a
-- previously-read token fails a later approve with CLR06. A line MOVE touches two
-- parents, so BOTH draft parents rotate (HIGH 3: else the source draft's stale
-- revision stayed usable after it lost a line). No-op for approved parents.
create function clara._tf_rotate_token() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.entry_id is not null then
    update clara.journal_entries set revision_token = gen_random_uuid(), updated_at = now()
     where id = new.entry_id and status = 'draft';
  end if;
  if tg_op in ('UPDATE','DELETE') and old.entry_id is not null
     and old.entry_id is distinct from new.entry_id then
    update clara.journal_entries set revision_token = gen_random_uuid(), updated_at = now()
     where id = old.entry_id and status = 'draft';
  end if;
  return null;
end $$;

-- Entry immutability + allowed lifecycle transitions (v2 §E/F12). The ONLY legal
-- UPDATEs are (a) draft->approved setting checker_actor/approved_at[/attestation];
-- (b) on an approved row, setting reversed_by + reversal_reason exactly once;
-- (c) revision_token/updated_at bumps while draft. Every OTHER column (including
-- any future one) must be byte-identical — enforced by diffing the row's jsonb
-- with the per-transition allow-set removed. Any other delta, and any DELETE,
-- raises CLR08.
create function clara._tf_entry_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_allowed text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'journal entries are never deleted (reverse, not delete)' using errcode = 'CLR08';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    v_allowed := array['revision_token','updated_at'];
  elsif old.status = 'draft' and new.status = 'approved' then
    if old.checker_actor is not null or new.checker_actor is null or new.approved_at is null then
      raise exception 'illegal approval transition' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','checker_actor','approved_at','self_approval_attestation','updated_at'];
  elsif old.status = 'approved' and new.status = 'approved' then
    -- Reversal linkage is an EXACT one-time pair transition (v2 §E/F14, MEDIUM 17):
    -- OLD.(reversed_by, reversal_reason) BOTH null -> NEW.reversed_by non-null AND
    -- NEW.reversal_reason non-blank. Setting only one of the pair (a raw UPDATE that
    -- fills reversal_reason but leaves reversed_by null, or vice-versa) is rejected.
    if old.reversed_by is not null or old.reversal_reason is not null then
      raise exception 'entry already reversed' using errcode = 'CLR08';
    end if;
    if new.reversed_by is null or new.reversal_reason is null
       or btrim(coalesce(new.reversal_reason, '')) = '' then
      raise exception 'approved entries are immutable except a complete reversal-linkage pair' using errcode = 'CLR08';
    end if;
    v_allowed := array['reversed_by','reversal_reason','updated_at'];
  else
    raise exception 'illegal status transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'illegal change to entry (status % -> %)', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- documents: sha256/id/firm_id/client_id frozen after ingest (v2 §E). Other
-- columns free; DELETE blocked.
create function clara._tf_documents_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'documents are not deleted in Slice 2' using errcode = 'CLR08';
  end if;
  if new.id is distinct from old.id
     or new.sha256 is distinct from old.sha256
     or new.firm_id is distinct from old.firm_id
     or new.client_id is distinct from old.client_id then
    raise exception 'document identity/attribution is immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- guard_last_owner (PORT): the last ACTIVE NON-AGENT owner of a firm cannot be
-- demoted/removed/deleted (CLR09). Counting only non-agent owners (HIGH 11) means a
-- firm can never be left with the global agent identity as its sole "owner" — there
-- must always be a human capable of signing/administering it.
create function clara._tf_guard_last_owner() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    if (select count(*) from clara.firm_memberships m
        join clara.users u on u.id = m.user_id
        where m.firm_id = old.firm_id and m.role = 'owner' and m.status = 'active'
          and m.id <> old.id and u.is_agent = false) = 0 then
      raise exception 'cannot demote/remove the last active owner' using errcode = 'CLR09';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Append-only enforcement for the audit log (UPDATE/DELETE) — v2 §G.
create function clara._tf_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'CLR08';
end $$;

-- TRUNCATE guard (statement-level) — blocks truncate for everyone but a superuser
-- who drops the trigger (documented honesty boundary).
create function clara._tf_no_truncate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception '% cannot be truncated', tg_table_name using errcode = 'CLR08';
end $$;

-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

-- firm stamping (BEFORE INSERT).
create trigger t_clients_stamp before insert on clara.clients
  for each row execute function clara._tf_stamp_client_firm();
create trigger t_coa_stamp before insert on clara.coa_accounts
  for each row execute function clara._tf_stamp_from_client();
create trigger t_resolution_stamp before insert on clara.client_resolutions
  for each row execute function clara._tf_stamp_from_client();
create trigger t_fa_stamp before insert on clara.fixed_assets
  for each row execute function clara._tf_stamp_from_client();
create trigger t_je_stamp before insert on clara.journal_entries
  for each row execute function clara._tf_stamp_from_client();
create trigger t_jl_stamp before insert on clara.journal_lines
  for each row execute function clara._tf_stamp_line_from_entry();
create trigger t_documents_stamp before insert on clara.documents
  for each row execute function clara._tf_stamp_from_client_or_session();
create trigger t_notifications_stamp before insert on clara.notifications
  for each row execute function clara._tf_stamp_from_client_or_session();

-- immutability + lifecycle.
create trigger t_je_immutable before update or delete on clara.journal_entries
  for each row execute function clara._tf_entry_immutable();
create trigger t_jl_immutable before insert or update or delete on clara.journal_lines
  for each row execute function clara._tf_lines_immutable();
create trigger t_jl_rotate_token after insert or update or delete on clara.journal_lines
  for each row execute function clara._tf_rotate_token();
create trigger t_documents_immutable before update or delete on clara.documents
  for each row execute function clara._tf_documents_immutable();
create trigger t_membership_guard_owner before update or delete on clara.firm_memberships
  for each row execute function clara._tf_guard_last_owner();

-- balance (DEFERRABLE INITIALLY DEFERRED constraint triggers on both tables).
create constraint trigger t_je_balance after insert or update on clara.journal_entries
  deferrable initially deferred for each row execute function clara._tf_check_balance();
create constraint trigger t_jl_balance after insert or update or delete on clara.journal_lines
  deferrable initially deferred for each row execute function clara._tf_check_balance();

-- provenance (DEFERRABLE constraint trigger).
create constraint trigger t_je_provenance after insert or update on clara.journal_entries
  deferrable initially deferred for each row execute function clara._tf_check_provenance();

-- append-only + truncate guards.
create trigger t_audit_append_only before update or delete on clara.audit_log
  for each row execute function clara._tf_append_only();
create trigger t_audit_no_truncate before truncate on clara.audit_log
  for each statement execute function clara._tf_no_truncate();
create trigger t_je_no_truncate before truncate on clara.journal_entries
  for each statement execute function clara._tf_no_truncate();
create trigger t_jl_no_truncate before truncate on clara.journal_lines
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================
-- 4. RLS — forced everywhere; owner policies CONSTANT true; app READ policies
--    role-pinned to a single identity source (branch pinning by role). App roles
--    hold ZERO DML grants; the human FOR ALL + WITH CHECK is a belt only.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'clients','coa_accounts','documents','client_resolutions',
    'journal_entries','journal_lines','fixed_assets','notifications'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
    execute format('create policy p_%s_human on clara.%I for all to clara_authenticated using (firm_id = clara.jwt_firm()) with check (firm_id = clara.jwt_firm())', t, t);
    execute format('create policy p_%s_agent on clara.%I for select to clara_agent_ro using (firm_id = clara.wake_firm())', t, t);
  end loop;
end $$;

-- =====================================================================
-- 5. TABLE-LEVEL SELECT GRANTS (RLS still scopes every read). Zero write grants.
-- =====================================================================
grant select on
  clara.clients, clara.coa_accounts, clara.documents, clara.client_resolutions,
  clara.journal_entries, clara.journal_lines, clara.fixed_assets, clara.notifications
  to clara_authenticated, clara_agent_ro;

reset role;
