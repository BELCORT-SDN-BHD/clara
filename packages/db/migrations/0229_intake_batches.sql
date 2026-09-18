-- 0229_intake_batches — #636 (refresh wave 2026-09-18; journeys C1 source intake → B3 Work
-- list/detail): THE DURABLE INTAKE BATCH — a firm-scoped parent over client-attributed child
-- Work, so 95 files can finish while 5 wait, and cancel-remaining keeps every committed receipt.
-- =====================================================================================
-- Spec of record: issue #636 — "让资料充分的批次项目继续，缺资料的独立等待". Domain words:
-- CONTEXT.md — "Intake batch", "Batch member", "Member dependency", "Intake receipt",
-- "Accounting work", "Operation receipt". Builds on 0007 (the document intake pipeline and its
-- capacity ladder), 0178 (the accounting-work lane and its tenant-carrying composite identity),
-- 0182 (the at-most-one-document evidence rule), 0184/0199 (the cancel door and its five arms),
-- 0214 (the derived, never-stored read envelope) and 0221 (the relation-family shape).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. Three NEW relations (`clara.intake_batches`, its member
-- child and that child's append-only event ledger), two NEW lane-agnostic stamp triggers, two
-- ungranted helpers, FIVE `clara_runtime`-only write/sweep doors and ONE `clara_authenticated`
-- read — so a batch of uploaded sources becomes one durable, readable parent WITHOUT one byte of
-- the intake pipeline, the capacity ladder, the accounting-work lane or the cancel door moving.
--
-- =====================================================================================
-- THE TWO PRECEDENTS, BY PATH:LINE, SO THE NEXT BATCH-SHAPED TICKET DOES NOT LAND A THIRD SHAPE.
--
--   * COPIED — `clara.seeding_batches` (0017_wave_b.sql:1252, children `seeding_proposals`
--     :1285-1305). Its facets are DERIVED AT READ TIME by live `count(*)` sub-selects
--     (0017:4602-4610) and its cancel fans out per child (`cancel_seeding_batch`, 0017:4647).
--     Nothing about a child's progress is stored on the parent, so nothing can go stale.
--   * REJECTED — `clara.sales_backfill_batches` (0046_wave_7a_sales_lane.sql:496-516). Its
--     `admitted_count` is a STORED counter an admission verb increments (0046:2287), and it is
--     client-scoped with one open batch per (firm, client) (:499, :515-516). A stored counter and
--     a client-scoped parent are both wrong here: the five that WAIT are precisely the ones with
--     no client yet, and a counter drifts from the children the moment one is cancelled.
--
-- SO: NO `client_id` ON THE PARENT, NO STORED COUNTS ANYWHERE, AND EVERY NUMBER DERIVED BY
-- `clara.get_intake_batch` AT READ TIME.
--
-- =====================================================================================
-- THIS FILE RECUTS NOTHING, AND §H PROVES IT BY RE-READING TWELVE LIVE BODIES.
--
-- The prestate below pins twelve `pg_proc.prosrc` sha256 values MEASURED on a migrated rig
-- (clara_636, PG 17.11, chain 0001->0224, 2026-09-18) — never transcribed from file text, because
-- FOUR of the twelve are splices whose file text and live text differ:
--   `finalize_document_intake` 0007 -> 0015:3431 -> 0026:234 -> 0051 §5 (a DYNAMIC splice) -> 0125:730;
--   `_tf_accounting_work_immutable` 0178:370 -> 0184:446 -> 0194:260 -> live 0200:251;
--   `cancel_accounting_work` 0184:1216 -> live 0199:201;
--   `list_accounting_work` 0189:301 -> live 0203:214.
-- 0125:134 says exactly this about this family. §H re-asserts all twelve AFTER this file runs;
-- that pair is the machine-checkable proof that 0229 is purely additive.
--
-- =====================================================================================
-- THE THREE MEASUREMENTS THAT SHAPED THIS FILE (run on clara_636 before a line of it was written).
--
-- (M1) THE CAPACITY WALL IS FLUSH, AND IT IS A DOCS WALL FOR THE HEADLINE CASE.
--      Driving `clara.create_document_intake` at the shipped defaults (docs_per_day 100 /
--      pages_per_day 1000, 0007:366-367) admitted EXACTLY 100 <=1MB PDFs (10 pages each,
--      `_declared_page_ceiling` 0007:1626) and refused the 101st with CLR18
--      'document daily limit reached (docs)' and NO detail.reason — docs=100, pages=1000, both
--      ceilings flush. 100 image/* members (1 page each, 0007:1625) refused the 101st on DOCS
--      (pages 100 of 1000). 20 <=5MB PDFs (50 pages each) refused the 21st on PAGES.
--      This is C83.X2's re-derivation: the number 100 is DISCARDED and re-earned, split by kind.
--
-- (M2) A POST-CUSTODY CAPACITY REFUSAL DOES NOT REACH `failure_code='limit'`.
--      `clara._resize_document_reservation` (0007:1656, called by `verify_document_intake`) raises
--      CLR18 'document daily page limit reached'. A pg error carries `err.code = 'CLR18'` (the
--      SQLSTATE), and `packages/runtime/lib/intake.mjs:155-159` maps only eight LITERAL codes
--      (too_large, bad_type, limit, checksum_mismatch, storage_error, expired, malware_detected,
--      quarantined) and EVERYTHING ELSE to `internal`. So the intake this file would key on lands
--      at `failure_code='internal'`, and arm (b) of §C's intake-stamp trigger NEVER FIRES in
--      production today. The production path to `awaiting_capacity` is therefore the explicit door
--      `clara.set_intake_batch_member_dependency`, called from the runtime's finalize catch arm.
--      The trigger arm stays as the durable belt for the day the DB does raise `limit`.
--
-- (M3) THE DAILY WINDOW IS A UTC DAY, WHICH IS 08:00 Asia/Kuala_Lumpur.
--      `date_trunc('day', now() at time zone 'utc')` (0007:1644) resolved to 2026-09-18T00:00:00Z,
--      whose local wall clock is 2026-09-18 08:00:00 MYT. Two reservations straddling 00:00 UTC
--      fall in DIFFERENT windows; two straddling 00:00 MYT fall in the SAME one. This file CHANGES
--      NOTHING about that (the three reservation bodies are untouched and pinned below) — it
--      REPORTS it, in `get_intake_batch`'s `capacity` block, so the surface can say 08:00 instead
--      of "midnight". Moving the window to MYT is #635's ticket, not this one's.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * NO new `clara.accounting_work` column, NO fourth `purpose`, NO new `source_refs` kind.
--     0221's header already measured why a fourth purpose cannot post; a batch needs none of it.
--   * NO recut of `clara.list_accounting_work` (#905 owns that body) — the Work-list projection is
--     frozen for this wave. Work detail gets ONE reverse row, derived by the web from this read.
--   * NO `clara.event_types` / `clara.trigger_taxonomy` row and NO `clara._append_event` call. The
--     house rule is to register an event type in the SAME migration that first EMITS it
--     (0199:179-182, with its executable pair at 0199:188-194); this slice emits none, and its
--     history lives in its own append-only `clara.intake_batch_member_events` ledger. Registering
--     a type with no producer is inventing one. #664 may register when it emits.
--   * NO change to `clara.firm_document_limits` or any default (#635's surface, 0196:38-42), and
--     NO edit to the three reservation bodies (0007:1632/1656/1694, never recut since 0007).
--   * NO minting of `clara.accounting_work`. #636 is a GROUPER, never a producer: #655 and the
--     autodraft lane own document -> Work admission, and §D's trigger JOINS whatever Work names
--     the document rather than creating one.
--
-- BLAST RADIUS OF §D's WORK-SIDE TRIGGER, STATED RATHER THAN LEFT TO A READER. It fires on EVERY
-- `clara.accounting_work` INSERT in the estate, including #655's new trade-invoice lane. It is
-- ADDITIVE (a new trigger, not a recut: `_tf_accounting_work_immutable` is pinned unchanged and no
-- column is added), and it is NOT on `clara.journal_entries`, so it cannot interact with #655's
-- new deferred entry trigger. Its FIRST statement is a cheap negative through a partial index that
-- is empty on a firm with no open batch.
--
-- #664 COORDINATION (its AC1 is a "grouping identity" and its AC4 "group cancellation"; both
-- tickets cite user story 25). Three mitigations are built in so #664 needs NO migration of its
-- own: the relation is FIRM-scoped, the child's `client_id` is NULLABLE from day one, and the
-- parent's `origin` CHECK already admits 'chat'. #664 becomes a second PRODUCER of this same
-- parent; it must not land a second batch table or a second cancel ceremony.
-- =====================================================================================

do $w636_pre$
declare v_def text; v_sha text; v_live text; v_n int;
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception '#636 prestate: clara.accounting_work is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.document_intakes') is null or to_regclass('clara.document_filings') is null then
    raise exception '#636 prestate: the 0007 document pipeline is absent' using errcode='CLR10';
  end if;
  foreach v_def in array array['clara.intake_batches','clara.intake_batch_members',
                               'clara.intake_batch_member_events'] loop
    if to_regclass(v_def) is not null then
      raise exception '#636 prestate: % already exists', v_def using errcode='CLR10';
    end if;
  end loop;
  if to_regprocedure('clara.get_intake_batch(uuid,integer)') is not null
     or to_regprocedure('clara.open_intake_batch(uuid,text,text,uuid,text)') is not null then
    raise exception '#636 prestate: an intake-batch surface already exists' using errcode='CLR10';
  end if;

  -- The tenant-carrying composite target the member child cites (0178:337) and the intake's own
  -- (0007:127). Without either, the FKs below would silently degrade to single-column citations.
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_work'::regclass
                    and conname='uq_accounting_work_id_firm_client') then
    raise exception '#636 prestate: uq_accounting_work_id_firm_client is absent -- the member child cannot cite a Work tenant-carryingly'
      using errcode='CLR10';
  end if;

  -- THE TWELVE NON-REGRESSION PINS. This file recuts NONE of them; nothing below is derived from
  -- their text. They exist so that applying 0229 on a chain where one has DRIFTED fails LOUDLY
  -- here, instead of §H's re-assertion passing against a body this file never measured.
  -- MEASURED 2026-09-18 on clara_636 (chain 0001->0224, PG 17.11) off pg_proc.prosrc, never
  -- transcribed from file text -- four of the twelve are splices (see this file's header).
  for v_def, v_sha in
    select * from (values
      ('clara._tf_accounting_work_immutable()',
       'a1c4e0fc07dfe535433ee3061c54192ffeba640eae1375d8a2f529b3d1ff518e'),
      ('clara._assert_journal_source_refs(uuid,uuid,jsonb,boolean)',
       'f028c8ea70f7bcfde3cdd8ebaae045964ca763746010011a50d4c489bff232d2'),
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara.cancel_accounting_work(uuid,uuid,text)',
       '27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b'),
      ('clara._work_door_ctx(uuid,uuid,text,text,text,text)',
       'bd7bc3934fa919b2167b49f84b40f5205bcfcfc5207aaa31b94ce1c186ac2c7c'),
      ('clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)',
       '09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d'),
      ('clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)',
       '8f9e0b1944c8910bcdef049d250ca834b74a4aa33084b38d97acc868b4a697d7'),
      ('clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)',
       '074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734'),
      ('clara._resize_document_reservation(uuid,uuid,integer)',
       '41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf'),
      ('clara._settle_document_reservation(uuid,uuid,integer)',
       'b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6'),
      ('clara._declared_page_ceiling(bigint,text)',
       '82bc5e67afd4ea074665a320f357092fb0e93af9221f10b489a50cec3e4b4ca6'),
      ('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,integer)',
       '61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#636 prestate: % is absent', v_def using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_live
      from pg_proc p where p.oid = v_def::regprocedure;
    if v_live <> v_sha then
      raise exception '#636 prestate: % has DRIFTED from its pinned body (live sha %) -- #636 recuts none of the twelve, so a drift here means a sibling recut landed and the tail''s non-regression assertion would prove nothing',
        v_def, v_live using errcode='CLR10';
    end if;
  end loop;

  -- The capacity ladder and the daily-window expression this file REPORTS but never changes
  -- (M1/M3). Asked before, so "the ladder was already different" can never be mistaken for
  -- "0229 changed it".
  if clara._declared_page_ceiling(1048576, 'application/pdf') <> 10
     or clara._declared_page_ceiling(1048576, 'image/png') <> 1
     or clara._declared_page_ceiling(5242880, 'application/pdf') <> 50 then
    raise exception '#636 prestate: the 0007 page ladder is not the measured 1/10/50 rungs'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure
     and p.prosrc like '%date_trunc(''day'', now() at time zone ''utc'')%';
  if v_n <> 1 then
    raise exception '#636 prestate: the reservation window is no longer a UTC day -- get_intake_batch''s capacity block would report a stale reset moment'
      using errcode='CLR10';
  end if;

  -- The measured ground for the SIXTH granted name (§F): the runtime pool can read neither the
  -- committed receipts that decide which children are still live nor the parent that carries
  -- `cancelling`. 0178's own tail (0178:1619-1630) refuses that migration if clara_runtime ever
  -- holds SELECT or a policy on clara.operation_receipts; re-asked here as THIS file's premise.
  if has_table_privilege('clara_runtime', 'clara.operation_receipts', 'SELECT') then
    raise exception '#636 prestate: clara_runtime can now read clara.operation_receipts -- the sweep verb''s whole reason to exist has gone; re-derive the sweep before applying'
      using errcode='CLR10';
  end if;

  raise notice '#636 prestate: clean -- no intake-batch surface exists, the twelve non-regression bodies are at their measured shas, the 0007 ladder is 1/10/50 on a UTC day, and clara_runtime still cannot read clara.operation_receipts.';
end
$w636_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE DURABLE PARENT.
--
-- FIRM-SCOPED AND CLIENT-LESS BY DESIGN. CONTEXT.md's "Intake receipt" already rules that an
-- intake "carries no client, because attribution is a separate act on the document"; the five
-- members that WAIT in this ticket's headline are exactly the unattributed ones. A client-scoped
-- parent (0046:499's shape) could not hold them.
--
-- THE STATE SET IS THREE, NOT FOUR. An open batch is never "settled": nothing in this slice closes
-- one and a new member may always join it. "Everything here is done" is DERIVED by the read from
-- the facets. Inventing a close ceremony would be a second, competing truth.
--
-- THE THREE CANCEL COLUMNS ARE LOAD-BEARING, NOT BOOKKEEPING. `clara._work_door_ctx` reserves
-- `cancel_accounting_work` under `_hash(jsonb_build_object('work', p_work, 'author', p_author))`
-- (0184:262-264). MEASURED on clara_636: `cancel_accounting_work(w, alice, 'k')` then
-- `cancel_accounting_work(w, bob, 'k')` raises CLR10 `op_key_conflict`. So a fan-out resumed after
-- a process death MUST re-issue with the STORED actor and the STORED key, never the sweep's own
-- identity — otherwise every child refuses.
-- =====================================================================================
create table clara.intake_batches (
  id                  uuid        primary key default gen_random_uuid(),
  firm_id             uuid        not null references clara.firms(id),
  opened_by           uuid        not null references clara.users(id),
  origin              text        not null
                        check (origin in ('documents_tab','chat','firm_documents')),
  label               text        not null
                        check (label !~ '^\s*$' and length(label) <= 120),
  state               text        not null default 'open'
                        check (state in ('open','cancelling','cancelled')),
  op_key              text        not null check (btrim(op_key) <> ''),
  cancel_requested_by uuid        references clara.users(id),
  cancel_op_key       text,
  cancel_requested_at timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, firm_id),
  unique (firm_id, op_key),
  constraint ck_intake_batches_cancel_triple check (
    (cancel_requested_at is null) = (cancel_requested_by is null)
    and (cancel_requested_at is null) = (cancel_op_key is null)),
  constraint ck_intake_batches_cancelled_at check (
    (state = 'cancelled') = (cancelled_at is not null))
);
comment on table clara.intake_batches is
  '#636: a firm-scoped, durable grouping of admitted sources opened by one person in one act. '
  'NO client_id (the members that wait are the unattributed ones), NO stored counts (0214''s rule; '
  '0046:2287 is the counter-example this file rejects by name), and three states only. The cancel '
  'triple is stored because a resumed fan-out must re-issue with the SAME author and key -- a '
  'different author under the same key is CLR10 op_key_conflict at 0184:262-270 (measured).';

-- The sweep's worklist, oldest-first, and nothing else reads this index.
create index ix_intake_batches_cancelling
  on clara.intake_batches(cancel_requested_at) where (state = 'cancelling');
create index ix_intake_batches_firm_open
  on clara.intake_batches(firm_id, created_at desc) where (state = 'open');

alter table clara.intake_batches enable row level security;
alter table clara.intake_batches force row level security;
create policy p_intake_batches_owner on clara.intake_batches
  for all to clara_fn_owner using (true) with check (true);
create policy p_intake_batches_read on clara.intake_batches
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.intake_batches to clara_authenticated;
-- clara_runtime gets NOTHING on the PARENT: its worklist arrives through
-- clara.sweep_intake_batch_cancellations (§F), a SECURITY DEFINER door, not through a table read.

-- =====================================================================================
-- §B  THE MEMBER CHILD — AND IT IS THE "CHILD" OF EVERY ACCEPTANCE CRITERION (F6, DECISIONS §6).
--
-- A member carries up to THREE identities, IN ORDER: its intake ALWAYS, its document once the
-- bytes are in custody, its Work once some lane admits one. A Work needs a non-NULL ACTIVE client
-- and a bookkeeper+ author (0194:1086-1113), so an unattributed file can never BE a child Work —
-- it is a member with two of the three. The three populations are reported separately by §G.
--
-- `unique (intake_id)` IS AC1's "admit each adopted source ONCE", structurally: a second attach is
-- ABSORBED, never a second row, and an attach to a DIFFERENT parent is refused by name.
-- =====================================================================================
create table clara.intake_batch_members (
  id                uuid        primary key default gen_random_uuid(),
  batch_id          uuid        not null,
  firm_id           uuid        not null references clara.firms(id),
  intake_id         uuid        not null unique,
  document_id       uuid,
  client_id         uuid,
  work_id           uuid,
  dependency        text        check (dependency in
                      ('awaiting_fact','awaiting_attribution','awaiting_capacity')),
  dependency_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, firm_id),
  constraint fk_intake_batch_members_batch foreign key (batch_id, firm_id)
    references clara.intake_batches(id, firm_id),
  constraint fk_intake_batch_members_intake foreign key (intake_id, firm_id)
    references clara.document_intakes(id, firm_id),
  constraint fk_intake_batch_members_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_intake_batch_members_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint ck_intake_batch_members_dependency_reason check (
    dependency is not null or dependency_reason is null)
);
comment on table clara.intake_batch_members is
  '#636: one admitted source''s membership row. Up to three identities IN ORDER (intake always, '
  'document once in custody, Work once admitted) and at most one declared dependency. '
  'unique(intake_id) is AC1''s once-only admission, structurally. client_id is NULLABLE from day '
  'one so #664''s chat producer needs no migration.';

-- THE CHEAP NEGATIVE the Work-side trigger reads (§D). Empty on a firm with no open batch, which
-- is what makes a trigger on EVERY accounting_work INSERT affordable.
create index ix_intake_batch_members_open
  on clara.intake_batch_members(document_id) where (work_id is null);
create index ix_intake_batch_members_batch
  on clara.intake_batch_members(batch_id, created_at, id);
create index ix_intake_batch_members_work
  on clara.intake_batch_members(work_id) where (work_id is not null);

alter table clara.intake_batch_members enable row level security;
alter table clara.intake_batch_members force row level security;
create policy p_intake_batch_members_owner on clara.intake_batch_members
  for all to clara_fn_owner using (true) with check (true);
create policy p_intake_batch_members_read on clara.intake_batch_members
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
-- THE DIVERGENCE FROM 0221, SAID OUT LOUD. 0221:463 gives clara_runtime nothing, because there the
-- run is told its effect by the wake verb. Here the runtime's reconciler belt must be able to see
-- which members a cancelling parent still holds WITHOUT a round trip through a definer door for
-- every row, so the two CHILDREN carry a SELECT-only runtime policy on 0178:352-365's stated
-- ground ("the run must be able to read the Work it was handed"). The PARENT still carries none.
create policy p_intake_batch_members_runtime on clara.intake_batch_members
  for select to clara_runtime using (true);
grant select on clara.intake_batch_members to clara_authenticated;
grant select on clara.intake_batch_members to clara_runtime;

-- =====================================================================================
-- §C-0  THE APPEND-ONLY MEMBER EVENT LEDGER (the 0221:530-569 shape).
--
-- WHY THIS AND NOT `clara.domain_events`. The coverage law requires the active taxonomy to route
-- every catalog row, and the house rule is to register an event type in the SAME migration that
-- first emits it (0199:179-182, executable pair 0199:188-194). This slice emits no domain event,
-- so registering a type here would be inventing a producer. The batch's history lives here.
-- =====================================================================================
create table clara.intake_batch_member_events (
  id          uuid        primary key default gen_random_uuid(),
  member_id   uuid        not null,
  batch_id    uuid        not null,
  firm_id     uuid        not null references clara.firms(id),
  event       text        not null check (event in
                ('attached','document_stamped','work_stamped','dependency_set',
                 'dependency_cleared','cancel_requested')),
  detail      jsonb       not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  actor_id    uuid        references clara.users(id),
  recorded_at timestamptz not null default now(),
  constraint fk_intake_batch_member_events_member foreign key (member_id, firm_id)
    references clara.intake_batch_members(id, firm_id),
  constraint fk_intake_batch_member_events_batch foreign key (batch_id, firm_id)
    references clara.intake_batches(id, firm_id),
  -- `now()` is the TRANSACTION timestamp, so this unique makes a same-transaction replay of one
  -- stamp idempotent by construction; every writer below pairs it with `on conflict do nothing`.
  unique (member_id, event, recorded_at)
);
comment on table clara.intake_batch_member_events is
  '#636: the append-only history of one batch member. NOT a domain-event stream: this slice '
  'registers no clara.event_types row because it emits none (0199:179-182''s same-migration rule).';
create index ix_intake_batch_member_events_member
  on clara.intake_batch_member_events(member_id, recorded_at desc);
create index ix_intake_batch_member_events_batch
  on clara.intake_batch_member_events(batch_id, recorded_at desc);

alter table clara.intake_batch_member_events enable row level security;
alter table clara.intake_batch_member_events force row level security;
create policy p_intake_batch_member_events_owner on clara.intake_batch_member_events
  for all to clara_fn_owner using (true) with check (true);
create policy p_intake_batch_member_events_read on clara.intake_batch_member_events
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_intake_batch_member_events_runtime on clara.intake_batch_member_events
  for select to clara_runtime using (true);
grant select on clara.intake_batch_member_events to clara_authenticated;
grant select on clara.intake_batch_member_events to clara_runtime;

create trigger t_intake_batch_member_events_append_only
  before update or delete on clara.intake_batch_member_events
  for each row execute function clara._tf_append_only();
create trigger t_intake_batch_member_events_no_truncate
  before truncate on clara.intake_batch_member_events
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §C  TRIGGER 1 — THE INTAKE STAMP. AFTER UPDATE on clara.document_intakes.
--
-- TWO JOBS, BOTH IDEMPOTENT, BOTH KEYED BY `intake_id` (already unique on the member):
--   (a) CUSTODY: on the `document_id` NULL -> non-NULL transition (0007:114, FK :129-130, CHECK
--       :137-139), stamp the member's `document_id`. It lands HERE rather than at admission
--       because `failed` and `unassigned` intakes are precisely the members that never become a
--       Work, and they still need their document identity.
--   (b) CAPACITY: on the transition to status='failed' with failure_code='limit' (0007:115-117),
--       declare `awaiting_capacity`. THIS IS D4's FIRST-CLASS WAITING STATE — a quota block is a
--       WAIT, never a failure.
--
-- ARM (b) IS A BELT, NOT THE PRODUCTION PATH — see measurement (M2) in this file's header. On the
-- rig a post-custody CLR18 reaches `clara.fail_document_intake` as `internal`, not `limit`, so in
-- production the declaration arrives through `clara.set_intake_batch_member_dependency` (§E),
-- called by `recordCapacityWait` in packages/runtime/lib/intake-batches.mjs from the finalize
-- route's catch arm. Arm (b) stays for the day the DB itself raises `limit`.
-- =====================================================================================
create function clara._tf_intake_batch_member_intake_stamp() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare m record;
begin
  -- THE CHEAP NEGATIVE FIRST, through unique(intake_id): an intake in no batch leaves here at once.
  select b.id as member_id, b.batch_id, b.firm_id, b.document_id, b.dependency
    into m
    from clara.intake_batch_members b
   where b.intake_id = new.id;
  if not found then return null; end if;

  -- (a) CUSTODY.
  if new.document_id is not null and old.document_id is distinct from new.document_id
     and m.document_id is null then
    update clara.intake_batch_members
       set document_id = new.document_id, updated_at = now()
     where intake_id = new.id and document_id is null;
    if found then
      insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail)
        values (m.member_id, m.batch_id, m.firm_id, 'document_stamped',
                jsonb_build_object('document_id', new.document_id, 'intake_status', new.status))
        on conflict (member_id, event, recorded_at) do nothing;
    end if;
  end if;

  -- (b) CAPACITY -- the belt (M2).
  if new.status = 'failed' and new.failure_code = 'limit'
     and old.failure_code is distinct from new.failure_code and m.dependency is null then
    update clara.intake_batch_members
       set dependency = 'awaiting_capacity', dependency_reason = new.failure_code,
           updated_at = now()
     where intake_id = new.id and dependency is null;
    if found then
      insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail)
        values (m.member_id, m.batch_id, m.firm_id, 'dependency_set',
                jsonb_build_object('dependency', 'awaiting_capacity', 'reason', new.failure_code,
                                   'source', 'intake_failure_code'))
        on conflict (member_id, event, recorded_at) do nothing;
    end if;
  end if;
  return null;
end $$;
revoke all on function clara._tf_intake_batch_member_intake_stamp() from public;
create trigger t_document_intakes_batch_member_stamp
  after update on clara.document_intakes
  for each row
  when (old.document_id is distinct from new.document_id
        or old.failure_code is distinct from new.failure_code)
  execute function clara._tf_intake_batch_member_intake_stamp();

-- =====================================================================================
-- §D  TRIGGER 2 — THE LANE-AGNOSTIC WORK STAMP. ONE AFTER INSERT on clara.accounting_work.
--
-- THE PATTERN THE ESTATE RATIFIED FOR EXACTLY THIS PROBLEM (refresh-wave-2026-09-15 DECISIONS §1.4;
-- the working example is 0221:1471-1568). It names no verb, no purpose and no lane: #655's
-- trade-invoice admission, the autodraft lane and any future producer stamp this table without
-- knowing it exists. That is what "#636 joins whatever Work names the document" requires.
--
-- AT MOST ONE DOCUMENT IS POSSIBLE (0182:520-527), which is what makes a lane-agnostic join
-- well-defined rather than ambiguous. The FIRST statement is the cheap negative: a Work whose
-- source_refs name no document returns before touching this file's tables at all.
-- =====================================================================================
create function clara._tf_intake_batch_member_work_stamp() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_doc uuid; m record;
begin
  -- CHEAP NEGATIVE 1: no document source ref at all. jsonb_array_elements over a small array.
  select nullif(btrim(coalesce(e->>'document_id','')),'')::uuid into v_doc
    from jsonb_array_elements(coalesce(new.source_refs, '[]'::jsonb)) as e
   where e->>'kind' = 'document'
   limit 1;
  if v_doc is null then return null; end if;

  -- CHEAP NEGATIVE 2: ix_intake_batch_members_open is EMPTY on a firm with no open batch.
  select b.id as member_id, b.batch_id, b.firm_id into m
    from clara.intake_batch_members b
   where b.document_id = v_doc and b.work_id is null and b.firm_id = new.firm_id
   limit 1;
  if not found then return null; end if;

  update clara.intake_batch_members
     set work_id = new.id, client_id = new.client_id, updated_at = now()
   where id = m.member_id and work_id is null;
  if found then
    insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail)
      values (m.member_id, m.batch_id, m.firm_id, 'work_stamped',
              jsonb_build_object('work_id', new.id, 'client_id', new.client_id,
                                 'document_id', v_doc, 'purpose', new.purpose))
      on conflict (member_id, event, recorded_at) do nothing;
  end if;
  return null;
end $$;
revoke all on function clara._tf_intake_batch_member_work_stamp() from public;
create trigger t_accounting_work_batch_member_stamp
  after insert on clara.accounting_work
  for each row execute function clara._tf_intake_batch_member_work_stamp();

-- =====================================================================================
-- §E  THE UNGRANTED HELPERS. Shared by every door so the doors can never disagree about who may
-- act, or about which children are still live.
-- =====================================================================================

-- THE INLINE LIVE-AUTHORITY RECHECK, in `clara.create_document_intake`'s own shape
-- (0007:1825-1841): the actor is EXPLICIT, the membership is re-read LIVE, and there is NO
-- existence oracle -- a non-member and an absent batch answer identically (0184:245's rule).
-- `clara._human_ctx` is unreachable from here by construction: it reads jwt_sub()/jwt_firm()
-- (0004:299-309) and the runtime pool carries no JWT.
create function clara._intake_batch_actor_ctx(p_actor uuid, p_batch uuid default null)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_role text; v_status text; v_state text;
begin
  select m.firm_id, m.role, m.status into v_firm, v_role, v_status
    from clara.firm_memberships m
   where m.user_id = p_actor
   order by (m.status = 'active') desc, m.created_at desc
   limit 1;
  if v_role is null then
    raise exception 'intake batch not found in your firm' using errcode='CLR11',
      detail='{"reason":"batch_actor_not_authorised"}';
  end if;
  if v_status <> 'active' then
    raise exception 'the actor is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'an intake batch requires a bookkeeper or above' using errcode='CLR04',
      detail='{"reason":"insufficient_role"}';
  end if;
  if p_batch is not null then
    select b.state into v_state from clara.intake_batches b
     where b.id = p_batch and b.firm_id = v_firm;
    if v_state is null then
      raise exception 'intake batch not found in your firm' using errcode='CLR11',
        detail='{"reason":"batch_not_found"}';
    end if;
  end if;
  return jsonb_build_object('firm', v_firm, 'role', v_role, 'state', v_state);
end $$;
revoke all on function clara._intake_batch_actor_ctx(uuid, uuid) from public;

-- THE LIVE CHILDREN of a parent: members holding a Work that is neither TERMINAL nor already
-- carrying a COMMITTED operation receipt. Completion is a committed receipt, never
-- `status='completed'` -- 0214:40-57's rule, applied a second time.
create function clara._intake_batch_live_children(p_batch uuid)
  returns table (member_id uuid, work_id uuid)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select m.id, m.work_id
    from clara.intake_batch_members m
    join clara.accounting_work w on w.id = m.work_id
   where m.batch_id = p_batch
     and m.work_id is not null
     and w.status not in ('completed','refused','failed','cancelled','expired')
     and not exists (select 1 from clara.operation_receipts o
                      where o.work_id = m.work_id and o.outcome = 'committed')
   order by m.created_at, m.id;
$$;
revoke all on function clara._intake_batch_live_children(uuid) from public;

-- =====================================================================================
-- §F  THE FIVE RUNTIME DOORS. All `clara_runtime` ONLY, actor-explicit, SECURITY DEFINER,
-- `set search_path = clara, pg_temp`, `_reserve_op`/`_finish_op` + `_audit`, and NO `_human_ctx`
-- twin. Every refusal carries (errcode, detail.reason) -- the 0180 law.
--
-- WHY THERE IS NO `clara_authenticated` TWIN. The precedent is `clara.create_document_intake`,
-- granted to clara_runtime ALONE (0007:2780-2799): the browser reaches these through the runtime
-- route, which decodes the JWT in Node and passes the actor on as an argument
-- (packages/runtime/src/intakeRoutes.ts:1-15, :91-96). A SECURITY INVOKER twin could not call
-- `_human_ctx` either, and a second definer twin would be a second authority surface.
-- =====================================================================================

create function clara.open_intake_batch(
  p_actor  uuid,
  p_origin text,
  p_label  text,
  p_session uuid,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_firm uuid; v_dedupe jsonb; v_id uuid; v_label text; v_at timestamptz;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'an intake batch requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  v_label := btrim(coalesce(p_label, ''));
  if v_label = '' or length(v_label) > 120 then
    raise exception 'an intake batch needs a label of 1-120 characters' using errcode='CLR10',
      detail='{"reason":"invalid_label","field":"label"}';
  end if;
  if p_origin is null or p_origin not in ('documents_tab','chat','firm_documents') then
    raise exception 'an intake batch origin must be documents_tab, chat or firm_documents'
      using errcode='CLR10', detail='{"reason":"invalid_origin","field":"origin"}';
  end if;
  -- The `ck_document_intakes_origin` idiom (0007:131-133), restated for the parent: a chat batch
  -- names its session and no other origin may.
  if (p_origin = 'chat') <> (p_session is not null) then
    raise exception 'a session id belongs to a chat batch and to no other origin'
      using errcode='CLR10', detail='{"reason":"invalid_session","field":"session_id"}';
  end if;

  v_ctx := clara._intake_batch_actor_ctx(p_actor);
  v_firm := (v_ctx->>'firm')::uuid;

  v_dedupe := clara._reserve_op(v_firm, 'open_intake_batch', p_op_key,
    clara._hash(jsonb_build_object('actor', p_actor, 'origin', p_origin, 'label', v_label,
                                   'session', p_session)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this intake batch key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || jsonb_build_object('replayed', true);
  end if;

  insert into clara.intake_batches(firm_id, opened_by, origin, label, op_key)
    values (v_firm, p_actor, p_origin, v_label, p_op_key)
    returning id, created_at into v_id, v_at;

  perform clara._audit(v_firm, p_actor, null, null, 'open_intake_batch', null,
    jsonb_build_object('batch', v_id, 'origin', p_origin, 'op_key', p_op_key));

  -- NOTE: this door raises NO CLR18. Opening a batch reserves nothing; capacity arrives per member
  -- at `clara.create_document_intake` (0007:1637) and is reported by `clara.get_intake_batch`.
  return clara._finish_op(v_firm, 'open_intake_batch', p_op_key,
    jsonb_build_object('batch_id', v_id, 'label', v_label, 'origin', p_origin,
                       'state', 'open', 'opened_at', v_at))
         || jsonb_build_object('replayed', false);
end $$;
revoke all on function clara.open_intake_batch(uuid,text,text,uuid,text) from public;
grant execute on function clara.open_intake_batch(uuid,text,text,uuid,text) to clara_runtime;
comment on function clara.open_intake_batch(uuid,text,text,uuid,text) is
  '#636: open a durable intake batch. clara_runtime only, actor explicit, bookkeeper+ live '
  'recheck, no existence oracle. Raises no CLR18 -- opening reserves no capacity.';

create function clara.attach_intake_to_batch(
  p_actor  uuid,
  p_batch  uuid,
  p_intake uuid,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_firm uuid; v_state text; v_dedupe jsonb; v_member uuid;
        v_other uuid; v_attached boolean := true;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'an attach requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  v_ctx  := clara._intake_batch_actor_ctx(p_actor, p_batch);
  v_firm := (v_ctx->>'firm')::uuid;
  v_state := v_ctx->>'state';

  -- NO ORACLE: another firm's intake and a uuid naming nothing answer identically.
  if not exists (select 1 from clara.document_intakes i
                  where i.id = p_intake and i.firm_id = v_firm) then
    raise exception 'intake not found in your firm' using errcode='CLR11',
      detail='{"reason":"intake_not_found"}';
  end if;
  if v_state <> 'open' then
    raise exception 'this intake batch is no longer open' using errcode='CLR13',
      detail=jsonb_build_object('reason','batch_not_open','state',v_state)::text;
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'attach_intake_to_batch', p_op_key,
    clara._hash(jsonb_build_object('batch', p_batch, 'intake', p_intake, 'actor', p_actor)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this attach key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || jsonb_build_object('replayed', true);
  end if;

  insert into clara.intake_batch_members(batch_id, firm_id, intake_id)
    values (p_batch, v_firm, p_intake)
    on conflict (intake_id) do nothing
    returning id into v_member;
  if v_member is null then
    v_attached := false;
    select m.id, m.batch_id into v_member, v_other
      from clara.intake_batch_members m where m.intake_id = p_intake;
    if v_other is distinct from p_batch then
      raise exception 'this intake already belongs to another intake batch' using errcode='CLR13',
        detail=jsonb_build_object('reason','intake_already_in_batch','batch_id',v_other)::text;
    end if;
  else
    insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail,
                                                 actor_id)
      values (v_member, p_batch, v_firm, 'attached',
              jsonb_build_object('intake_id', p_intake), p_actor)
      on conflict (member_id, event, recorded_at) do nothing;
    perform clara._audit(v_firm, p_actor, null, null, 'attach_intake_to_batch', null,
      jsonb_build_object('batch', p_batch, 'intake', p_intake, 'member', v_member,
                         'op_key', p_op_key));
  end if;

  return clara._finish_op(v_firm, 'attach_intake_to_batch', p_op_key,
    jsonb_build_object('member_id', v_member, 'batch_id', p_batch, 'intake_id', p_intake,
                       'attached', v_attached))
         || jsonb_build_object('replayed', false);
end $$;
revoke all on function clara.attach_intake_to_batch(uuid,uuid,uuid,text) from public;
grant execute on function clara.attach_intake_to_batch(uuid,uuid,uuid,text) to clara_runtime;
comment on function clara.attach_intake_to_batch(uuid,uuid,uuid,text) is
  '#636: attach ONE admitted intake to an open batch. A second attach to the SAME batch is '
  'absorbed (attached:false); an attach to a DIFFERENT batch is CLR13 intake_already_in_batch '
  'naming the holder. clara_runtime only.';

create function clara.set_intake_batch_member_dependency(
  p_actor      uuid,
  p_intake     uuid,
  p_dependency text,
  p_reason     text,
  p_op_key     text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_firm uuid; v_dedupe jsonb; m record; v_event text;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a dependency declaration requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- A NULL p_dependency CLEARS. Anything else outside the three is a caller defect, by name.
  if p_dependency is not null
     and p_dependency not in ('awaiting_fact','awaiting_attribution','awaiting_capacity') then
    raise exception 'a member dependency is awaiting_fact, awaiting_attribution or awaiting_capacity'
      using errcode='CLR10', detail='{"reason":"invalid_dependency","field":"dependency"}';
  end if;
  v_ctx  := clara._intake_batch_actor_ctx(p_actor);
  v_firm := (v_ctx->>'firm')::uuid;

  select b.id as member_id, b.batch_id into m
    from clara.intake_batch_members b
   where b.intake_id = p_intake and b.firm_id = v_firm;
  if not found then
    raise exception 'batch member not found in your firm' using errcode='CLR11',
      detail='{"reason":"member_not_found"}';
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'set_intake_batch_member_dependency', p_op_key,
    clara._hash(jsonb_build_object('member', m.member_id, 'dependency', p_dependency,
                                   'actor', p_actor)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this dependency key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || jsonb_build_object('replayed', true);
  end if;

  update clara.intake_batch_members
     set dependency = p_dependency,
         dependency_reason = case when p_dependency is null then null else p_reason end,
         updated_at = now()
   where id = m.member_id;

  v_event := case when p_dependency is null then 'dependency_cleared' else 'dependency_set' end;
  -- The reason travels VERBATIM: it is the database's own CLR18 sentence when the capacity door
  -- calls this, and an operator remedy a human can act on is not something to paraphrase.
  insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail, actor_id)
    values (m.member_id, m.batch_id, v_firm, v_event,
            jsonb_build_object('dependency', p_dependency, 'reason', p_reason), p_actor)
    on conflict (member_id, event, recorded_at) do nothing;

  perform clara._audit(v_firm, p_actor, null, null, 'set_intake_batch_member_dependency', null,
    jsonb_build_object('member', m.member_id, 'dependency', p_dependency, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'set_intake_batch_member_dependency', p_op_key,
    jsonb_build_object('member_id', m.member_id, 'batch_id', m.batch_id,
                       'dependency', p_dependency, 'reason', p_reason))
         || jsonb_build_object('replayed', false);
end $$;
revoke all on function clara.set_intake_batch_member_dependency(uuid,uuid,text,text,text) from public;
grant execute on function clara.set_intake_batch_member_dependency(uuid,uuid,text,text,text)
  to clara_runtime;
comment on function clara.set_intake_batch_member_dependency(uuid,uuid,text,text,text) is
  '#636: declare (or clear, with a NULL dependency) why one batch member is waiting. This is the '
  'PRODUCTION path to awaiting_capacity -- measurement M2 in 0229''s header says why the trigger '
  'belt cannot be it. clara_runtime only.';

create function clara.cancel_intake_batch(
  p_actor  uuid,
  p_batch  uuid,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_firm uuid; b record; v_dedupe jsonb; v_children jsonb := '[]'::jsonb;
        v_state text; v_n int; r record;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a cancellation requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  v_ctx  := clara._intake_batch_actor_ctx(p_actor, p_batch);
  v_firm := (v_ctx->>'firm')::uuid;

  -- THE ROW LOCK FIRST: two decisions on one parent serialise here rather than both re-keying the
  -- children. The lock order is unchanged (this file touches no accounting_plans/agent_tasks row).
  select * into b from clara.intake_batches where id = p_batch and firm_id = v_firm for update;

  if b.state <> 'open' and b.cancel_op_key is distinct from p_op_key then
    raise exception 'this intake batch is already stopping under another decision'
      using errcode='CLR13',
      detail=jsonb_build_object('reason','batch_already_cancelling','state',b.state,
                                'cancel_op_key',b.cancel_op_key)::text;
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'cancel_intake_batch', p_op_key,
    clara._hash(jsonb_build_object('batch', p_batch, 'actor', p_actor)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this cancellation key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    -- A REPLAY RETURNS THE IDENTICAL CHILD LIST, which is what makes the resume deterministic:
    -- the fan-out derives each child's op key from this very answer.
    return v_dedupe || jsonb_build_object('replayed', true);
  end if;

  if b.state = 'open' then
    update clara.intake_batches
       set state = 'cancelling', cancel_requested_by = p_actor, cancel_op_key = p_op_key,
           cancel_requested_at = now(), updated_at = now()
     where id = p_batch and state = 'open';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('member_id', c.member_id, 'work_id', c.work_id)),
                  '[]'::jsonb)
    into v_children
    from clara._intake_batch_live_children(p_batch) c;
  v_n := jsonb_array_length(v_children);

  for r in select c.member_id, c.work_id from clara._intake_batch_live_children(p_batch) c loop
    insert into clara.intake_batch_member_events(member_id, batch_id, firm_id, event, detail,
                                                 actor_id)
      values (r.member_id, p_batch, v_firm, 'cancel_requested',
              jsonb_build_object('work_id', r.work_id, 'cancel_op_key', p_op_key), p_actor)
      on conflict (member_id, event, recorded_at) do nothing;
  end loop;

  -- CANCELLING A BATCH THAT ALREADY FINISHED IS TERMINAL AT ONCE. `appendix-C-journeys.md:82`'s
  -- "do not show terminal cancellation early" still holds, because terminal is written ONLY when
  -- nothing is live. Everything else waits for the sweep.
  if v_n = 0 then
    update clara.intake_batches
       set state = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = p_batch and state in ('open','cancelling');
    v_state := 'cancelled';
  else
    v_state := 'cancelling';
  end if;

  perform clara._audit(v_firm, p_actor, null, null, 'cancel_intake_batch', null,
    jsonb_build_object('batch', p_batch, 'live_children', v_n, 'op_key', p_op_key));

  -- IT IS NOT ONE TRANSACTION AND MUST NOT BE. The caller invokes `clara.cancel_accounting_work`
  -- once per child, one call per transaction, so a child that already posted answers
  -- `already_completed` and KEEPS its receipt (0199:230-272) and a child already settling answers
  -- `already_stopping` (0199:295-304) -- appendix C's "let independent children continue", and the
  -- shape 0017:4604-4617 already uses.
  return clara._finish_op(v_firm, 'cancel_intake_batch', p_op_key,
    jsonb_build_object('batch_id', p_batch, 'state', v_state, 'cancel_op_key', p_op_key,
                       'cancel_requested_by', p_actor, 'children', v_children))
         || jsonb_build_object('replayed', false);
end $$;
revoke all on function clara.cancel_intake_batch(uuid,uuid,text) from public;
grant execute on function clara.cancel_intake_batch(uuid,uuid,text) to clara_runtime;
comment on function clara.cancel_intake_batch(uuid,uuid,text) is
  '#636: decide to stop an intake batch. Flips open -> cancelling (or straight to cancelled when '
  'no child is live), stores the actor and key the fan-out must re-issue with, and returns the '
  'live child list -- the caller fans clara.cancel_accounting_work out one call per transaction.';

-- =====================================================================================
-- THE SIXTH GRANTED NAME. Approved by the orchestrator (DECISIONS §6.1, 2026-09-19 03:20).
--
-- WHY IT EXISTS, MEASURED RATHER THAN ARGUED: `clara.operation_receipts` carries no clara_runtime
-- grant and no clara_runtime policy -- 0178's own executable tail asserts BOTH (0178:1619-1630),
-- and this file's prestate re-asks it -- and the runtime holds SELECT on the two CHILD tables
-- only, never on the parent. So the pool can read neither the committed receipts that decide which
-- children are still live nor the parent row that carries `cancelling`. A clara_runtime-only
-- SECURITY DEFINER worklist verb on the `clara.release_held_document_tasks(int)` /
-- `clara.wake_due_plan_occurrences(int)` precedent (bounded, oldest-first, NO op key -- it is a
-- sweep, not a decision), which also performs the terminal flip, is the only shape left.
-- =====================================================================================
create function clara.sweep_intake_batch_cancellations(p_limit int default 20)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_batches jsonb := '[]'::jsonb; v_settled jsonb := '[]'::jsonb; b record; v_live jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'a sweep limit is 1..100' using errcode='CLR10',
      detail='{"reason":"invalid_limit","field":"p_limit"}';
  end if;
  for b in select ib.id, ib.firm_id, ib.cancel_requested_by, ib.cancel_op_key
             from clara.intake_batches ib
            where ib.state = 'cancelling'
            order by ib.cancel_requested_at, ib.id
            limit p_limit
  loop
    select coalesce(jsonb_agg(jsonb_build_object('member_id', c.member_id, 'work_id', c.work_id)),
                    '[]'::jsonb)
      into v_live
      from clara._intake_batch_live_children(b.id) c;
    if jsonb_array_length(v_live) = 0 then
      -- IDEMPOTENT AND CONVERGENT: the guard is the state, so two sweeps racing settle once.
      update clara.intake_batches
         set state = 'cancelled', cancelled_at = now(), updated_at = now()
       where id = b.id and state = 'cancelling';
      if found then v_settled := v_settled || to_jsonb(b.id); end if;
    else
      v_batches := v_batches || jsonb_build_array(jsonb_build_object(
        'batch_id', b.id, 'firm_id', b.firm_id,
        'cancel_requested_by', b.cancel_requested_by, 'cancel_op_key', b.cancel_op_key,
        'live', v_live));
    end if;
  end loop;
  return jsonb_build_object('batches', v_batches, 'settled', v_settled);
end $$;
revoke all on function clara.sweep_intake_batch_cancellations(int) from public;
grant execute on function clara.sweep_intake_batch_cancellations(int) to clara_runtime;
comment on function clara.sweep_intake_batch_cancellations(int) is
  '#636: the resumable fan-out''s worklist. Returns every `cancelling` parent with its live '
  'children AND THE STORED actor/key the fan-out must re-issue with (a different author under the '
  'same key is CLR10 op_key_conflict, 0184:262-270), and settles the parents with none. '
  'clara_runtime only; no op key -- it is a sweep, not a decision.';

-- =====================================================================================
-- §G  THE READ. `clara_authenticated` ONLY, SECURITY INVOKER, in 0214's envelope shape.
--
-- WHY NOT ALSO clara_runtime: the sweep verb gives the run its worklist, and 0214's own argument
-- is that an attention board is a HUMAN read. Granting it to the pool would be a second, unfloored
-- way to read a firm's board.
--
-- IT READS THE VIEWS, NEVER THE BASE TABLES. `clara.document_intakes` and
-- `clara.document_processing_tasks` carry NO clara_authenticated grant (measured); their
-- `_visible` views do (0007:2233-2240, :2747) and are `security_barrier` since 0144:315.
--
-- NO TOTAL, NO PERCENTAGE, NO PAGE LENGTH, ANYWHERE. The facets OVERLAP by construction (a member
-- can be admitted AND waiting) and are never summed -- CONTEXT.md:136-138. The tail proves the
-- absence by probing this body's own prosrc.
-- =====================================================================================
create function clara.get_intake_batch(p_batch uuid, p_preview int default 10)
  returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  c record; b record;
  v_preview int; v_now timestamptz := now();
  v_admitted_ids uuid[]; v_admitted_count int; v_admitted_rows jsonb := '[]'::jsonb;
  v_admitted_state text; v_admitted_reason text;
  v_settled_count int; v_settled_rows jsonb := '[]'::jsonb;
  v_uncounted int; v_settled_state text; v_settled_reason text;
  v_waiting_count int; v_waiting_rows jsonb := '[]'::jsonb;
  v_failed_count int;  v_failed_rows jsonb := '[]'::jsonb;
  v_unassigned_count int; v_unassigned_rows jsonb := '[]'::jsonb;
  v_by_question int; v_by_fact int; v_by_attr int; v_by_cap int;
  v_by_unfiled int; v_by_cap_failure int;
begin
  -- THE INLINE FLOOR, restating 0189:344-347's three predicates verbatim, for 0214:262-274's
  -- structural reason: an INVOKER body cannot call clara._human_ctx.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then raise exception 'no authenticated actor' using errcode='CLR04'; end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode='CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode='CLR04';
  end if;
  if p_batch is null then
    raise exception 'a batch is required' using errcode='CLR10',
      detail='{"reason":"invalid_batch"}';
  end if;

  -- CLAMPED 1..25, and the ceiling is the point (0214:283-286): the retry label below hands these
  -- ids to `clara._work_run_attempts`, which refuses more than 101 (0189:262-274).
  v_preview := least(greatest(coalesce(p_preview, 10), 1), 25);

  -- RLS does the firm filtering; a batch of another firm reads as zero rows, exactly as an
  -- invented uuid does. NO ORACLE.
  select ib.id, ib.label, ib.origin, ib.state, ib.opened_by, ib.created_at, ib.cancel_requested_at
    into b
    from clara.intake_batches ib where ib.id = p_batch;
  if not found then
    raise exception 'intake batch not found in your firm' using errcode='CLR11',
      detail='{"reason":"batch_not_found"}';
  end if;

  -- ------------------------------------------------------------------------------------------
  -- FACET admitted -- DISTINCT Work ids, never member rows. Two members naming one document
  -- would still be two members and one Work.
  -- ------------------------------------------------------------------------------------------
  select count(distinct m.work_id)::int into v_admitted_count
    from clara.intake_batch_members m
   where m.batch_id = p_batch and m.work_id is not null;

  select coalesce(array_agg(t.work_id order by t.created_at desc, t.work_id desc), '{}'::uuid[])
    into v_admitted_ids
    from (select distinct on (m.work_id) m.work_id, m.created_at
            from clara.intake_batch_members m
           where m.batch_id = p_batch and m.work_id is not null
           order by m.work_id, m.created_at desc) t;
  if coalesce(array_length(v_admitted_ids, 1), 0) > v_preview then
    v_admitted_ids := v_admitted_ids[1:v_preview];
  end if;

  if coalesce(array_length(v_admitted_ids, 1), 0) > 0 then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.work_id desc), '[]'::jsonb)
      into v_admitted_rows
      from (
        select m.id                          as member_id,
               m.work_id                     as work_id,
               m.client_id                   as client_id,
               m.document_id                 as document_id,
               w.status                      as work_status,
               w.purpose                     as purpose,
               nullif(w.basis->>'memo','')   as memo,
               coalesce(a.attempts, 0)       as attempts,
               a.current_run_status          as current_run_status,
               coalesce(a.attempts, 0) > 1   as retrying,
               m.created_at                  as created_at
          from clara.intake_batch_members m
          join clara.accounting_work w on w.id = m.work_id
          -- 0189's granted SECURITY DEFINER helper, asked ONLY about the preview ids. This is the
          -- whole reason there is no population-wide retry number.
          left join clara._work_run_attempts(v_admitted_ids) a on a.work_id = m.work_id
         where m.batch_id = p_batch and m.work_id = any(v_admitted_ids)
      ) x;
  end if;
  if v_admitted_count > coalesce(jsonb_array_length(v_admitted_rows), 0) then
    v_admitted_state  := 'partial';
    v_admitted_reason := 'retry_label_preview_only';
  else
    v_admitted_state  := 'ok';
    v_admitted_reason := null;
  end if;

  -- ------------------------------------------------------------------------------------------
  -- FACET settled -- a COMMITTED operation receipt, never `status='completed'` (0214:40-51). A
  -- completion this database holds no receipt for is NAMED, never counted and never excluded.
  -- ------------------------------------------------------------------------------------------
  select count(distinct m.work_id)::int into v_settled_count
    from clara.intake_batch_members m
   where m.batch_id = p_batch and m.work_id is not null
     and exists (select 1 from clara.operation_receipts o
                  where o.work_id = m.work_id and o.outcome = 'committed');

  select count(distinct m.work_id)::int into v_uncounted
    from clara.intake_batch_members m
    join clara.accounting_work w on w.id = m.work_id
   where m.batch_id = p_batch and w.status = 'completed'
     and not exists (select 1 from clara.operation_receipts o
                      where o.work_id = m.work_id and o.outcome = 'committed');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.committed_at desc, x.work_id desc), '[]'::jsonb)
    into v_settled_rows
    from (
      select distinct on (m.work_id)
             m.id as member_id, m.work_id as work_id, m.client_id as client_id,
             o.id as receipt_id, nullif(o.effects->>'entry_id','') as entry_id,
             o.created_at as committed_at
        from clara.intake_batch_members m
        join clara.operation_receipts o
          on o.work_id = m.work_id and o.outcome = 'committed'
       where m.batch_id = p_batch
       order by m.work_id, o.created_at desc
       limit v_preview
    ) x;
  if v_uncounted > 0 then
    v_settled_state  := 'partial';
    v_settled_reason := 'completions_without_receipt';
  elsif v_settled_count > coalesce(jsonb_array_length(v_settled_rows), 0) then
    v_settled_state  := 'partial';
    v_settled_reason := 'preview_only';
  else
    v_settled_state  := 'ok';
    v_settled_reason := null;
  end if;

  -- ------------------------------------------------------------------------------------------
  -- FACET waiting -- the UNION of four independent signals, each also reported on its own in
  -- `waiting_basis`, because the batch's waiting number legitimately differs from the review
  -- queue's (the queue never sees a dependency) and 0214's 裁-190 lesson is that a page showing two
  -- numbers over one relation must be able to explain why.
  -- ------------------------------------------------------------------------------------------
  select count(*)::int into v_waiting_count
    from clara.intake_batch_members m
    left join clara.document_intakes_visible dv on dv.id = m.intake_id
   where m.batch_id = p_batch
     and ( m.dependency is not null
        or exists (select 1 from clara.agent_interruptions ai
                    where ai.work_id = m.work_id and ai.status = 'pending')
        or (m.document_id is not null
            and not exists (select 1 from clara.document_filings f
                             where f.document_id = m.document_id and f.retired_at is null))
        or (dv.failure_code = 'limit') );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.member_id desc), '[]'::jsonb)
    into v_waiting_rows
    from (
      select m.id as member_id, m.intake_id as intake_id, m.document_id as document_id,
             m.work_id as work_id, m.client_id as client_id,
             m.dependency as dependency, m.dependency_reason as dependency_reason,
             dv.original_filename as filename, dv.status as intake_status,
             dv.failure_code as intake_failure_code,
             exists (select 1 from clara.agent_interruptions ai
                      where ai.work_id = m.work_id and ai.status = 'pending') as has_open_question,
             m.created_at as created_at
        from clara.intake_batch_members m
        left join clara.document_intakes_visible dv on dv.id = m.intake_id
       where m.batch_id = p_batch
         and ( m.dependency is not null
            or exists (select 1 from clara.agent_interruptions ai
                        where ai.work_id = m.work_id and ai.status = 'pending')
            or (m.document_id is not null
                and not exists (select 1 from clara.document_filings f
                                 where f.document_id = m.document_id and f.retired_at is null))
            or (dv.failure_code = 'limit') )
       order by m.created_at desc, m.id desc
       limit v_preview
    ) x;

  select count(*)::int into v_by_question
    from clara.intake_batch_members m
   where m.batch_id = p_batch
     and exists (select 1 from clara.agent_interruptions ai
                  where ai.work_id = m.work_id and ai.status = 'pending');
  select count(*) filter (where m.dependency = 'awaiting_fact')::int,
         count(*) filter (where m.dependency = 'awaiting_attribution')::int,
         count(*) filter (where m.dependency = 'awaiting_capacity')::int
    into v_by_fact, v_by_attr, v_by_cap
    from clara.intake_batch_members m where m.batch_id = p_batch;
  select count(*)::int into v_by_unfiled
    from clara.intake_batch_members m
   where m.batch_id = p_batch and m.document_id is not null
     and not exists (select 1 from clara.document_filings f
                      where f.document_id = m.document_id and f.retired_at is null);
  select count(*)::int into v_by_cap_failure
    from clara.intake_batch_members m
    join clara.document_intakes_visible dv on dv.id = m.intake_id
   where m.batch_id = p_batch and dv.failure_code = 'limit';

  -- ------------------------------------------------------------------------------------------
  -- FACET failed -- EXCLUDING `limit`. A quota block is WAITING, not dead (D4). A processing task
  -- that carries an error_code counts too: the bytes are in custody and the extraction refused.
  -- ------------------------------------------------------------------------------------------
  select count(*)::int into v_failed_count
    from clara.intake_batch_members m
    left join clara.document_intakes_visible dv on dv.id = m.intake_id
   where m.batch_id = p_batch
     and ( (dv.failure_code is not null and dv.failure_code <> 'limit')
        or exists (select 1 from clara.document_processing_tasks_visible tv
                    where tv.document_id = m.document_id and tv.error_code is not null) );
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.member_id desc), '[]'::jsonb)
    into v_failed_rows
    from (
      select m.id as member_id, m.intake_id as intake_id, m.document_id as document_id,
             m.work_id as work_id, dv.original_filename as filename,
             dv.status as intake_status, dv.failure_code as intake_failure_code,
             (select tv.error_code from clara.document_processing_tasks_visible tv
               where tv.document_id = m.document_id and tv.error_code is not null
               order by tv.updated_at desc limit 1) as task_error_code,
             m.created_at as created_at
        from clara.intake_batch_members m
        left join clara.document_intakes_visible dv on dv.id = m.intake_id
       where m.batch_id = p_batch
         and ( (dv.failure_code is not null and dv.failure_code <> 'limit')
            or exists (select 1 from clara.document_processing_tasks_visible tv
                        where tv.document_id = m.document_id and tv.error_code is not null) )
       order by m.created_at desc, m.id desc
       limit v_preview
    ) x;

  -- ------------------------------------------------------------------------------------------
  -- FACET unassigned -- in custody, no LIVE filing (0007:63, live filing = retired_at is null).
  -- ------------------------------------------------------------------------------------------
  select count(*)::int into v_unassigned_count
    from clara.intake_batch_members m
   where m.batch_id = p_batch and m.document_id is not null
     and not exists (select 1 from clara.document_filings f
                      where f.document_id = m.document_id and f.retired_at is null);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.member_id desc), '[]'::jsonb)
    into v_unassigned_rows
    from (
      select m.id as member_id, m.intake_id as intake_id, m.document_id as document_id,
             dv.original_filename as filename, dv.status as intake_status, m.created_at as created_at
        from clara.intake_batch_members m
        left join clara.document_intakes_visible dv on dv.id = m.intake_id
       where m.batch_id = p_batch and m.document_id is not null
         and not exists (select 1 from clara.document_filings f
                          where f.document_id = m.document_id and f.retired_at is null)
       order by m.created_at desc, m.id desc
       limit v_preview
    ) x;

  -- ------------------------------------------------------------------------------------------
  -- THE ENVELOPE. `status` is the answer state a reader sees; `coverage` is this door's own
  -- statement about the completeness of that facet's population. The five facets OVERLAP and are
  -- never summed. `capacity` reports the SHIPPED window rather than the one the house rule wants:
  -- measurement M3 says the reset lands at 08:00 Asia/Kuala_Lumpur, and the surface says 08:00.
  -- ------------------------------------------------------------------------------------------
  return jsonb_build_object(
    'computed_at',   v_now,
    'preview_limit', v_preview,
    'batch', jsonb_build_object(
      'id', b.id, 'label', b.label, 'origin', b.origin, 'state', b.state,
      'opened_by', b.opened_by, 'opened_at', b.created_at,
      'cancel_requested_at', b.cancel_requested_at),
    'facets', jsonb_build_object(
      'admitted', jsonb_build_object(
        'status', v_admitted_state, 'count', v_admitted_count,
        'coverage', v_admitted_state, 'coverage_reason', v_admitted_reason,
        'rows', v_admitted_rows),
      'settled', jsonb_build_object(
        'status', v_settled_state, 'count', v_settled_count,
        'coverage', v_settled_state, 'coverage_reason', v_settled_reason,
        'uncounted_completions', v_uncounted, 'rows', v_settled_rows),
      'waiting', jsonb_build_object(
        'status', case when v_waiting_count > coalesce(jsonb_array_length(v_waiting_rows),0)
                       then 'partial' else 'ok' end,
        'count', v_waiting_count,
        'coverage', case when v_waiting_count > coalesce(jsonb_array_length(v_waiting_rows),0)
                         then 'partial' else 'ok' end,
        'coverage_reason', case when v_waiting_count > coalesce(jsonb_array_length(v_waiting_rows),0)
                                then 'preview_only' else null end,
        'rows', v_waiting_rows),
      'failed', jsonb_build_object(
        'status', case when v_failed_count > coalesce(jsonb_array_length(v_failed_rows),0)
                       then 'partial' else 'ok' end,
        'count', v_failed_count,
        'coverage', case when v_failed_count > coalesce(jsonb_array_length(v_failed_rows),0)
                         then 'partial' else 'ok' end,
        'coverage_reason', case when v_failed_count > coalesce(jsonb_array_length(v_failed_rows),0)
                                then 'preview_only' else null end,
        'rows', v_failed_rows),
      'unassigned', jsonb_build_object(
        'status', case when v_unassigned_count > coalesce(jsonb_array_length(v_unassigned_rows),0)
                       then 'partial' else 'ok' end,
        'count', v_unassigned_count,
        'coverage', case when v_unassigned_count > coalesce(jsonb_array_length(v_unassigned_rows),0)
                         then 'partial' else 'ok' end,
        'coverage_reason', case when v_unassigned_count > coalesce(jsonb_array_length(v_unassigned_rows),0)
                                then 'preview_only' else null end,
        'rows', v_unassigned_rows)),
    'waiting_basis', jsonb_build_object(
      'by_question', v_by_question,
      'by_dependency', jsonb_build_object('awaiting_fact', v_by_fact,
                                          'awaiting_attribution', v_by_attr,
                                          'awaiting_capacity', v_by_cap),
      'by_unfiled', v_by_unfiled,
      'by_capacity_failure', v_by_cap_failure),
    'capacity', jsonb_build_object(
      'window', 'utc_day', 'resets_at_local', '08:00', 'timezone', 'Asia/Kuala_Lumpur'));
end $$;
revoke all on function clara.get_intake_batch(uuid,int) from public;
grant execute on function clara.get_intake_batch(uuid,int) to clara_authenticated;
comment on function clara.get_intake_batch(uuid,int) is
  '#636: the durable batch board. FIVE overlapping facets over DISTINCT ids, each with its own '
  'coverage word, plus waiting_basis (why the batch''s waiting number differs from the review '
  'queue''s) and the SHIPPED capacity window (a UTC day = 08:00 Asia/Kuala_Lumpur). No total, no '
  'percentage, no page length. clara_authenticated only, bookkeeper+.';

reset role;

-- =====================================================================================
-- §H  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog — and, first,
-- every claim it made about what it did NOT touch.
-- =====================================================================================
do $w636_tail$
declare v_def text; v_sha text; v_live text; v_n int; v_src text; v_role text;
begin
  -- (T1) EXACTLY ONE pg_proc ROW PER INSTALLED NAME. This file writes its own census because
  -- 0103:1055-1070's exactly-one-overload law does not reach new names.
  foreach v_def in array array['open_intake_batch','attach_intake_to_batch',
                               'set_intake_batch_member_dependency','cancel_intake_batch',
                               'sweep_intake_batch_cancellations','get_intake_batch'] loop
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = v_def;
    if v_n <> 1 then
      raise exception '#636 tail T1: clara.% has % pg_proc rows -- a defaulted overload is never how a new intake verb ships (0051:1031-1038''s law, applied to this file''s own six)', v_def, v_n;
    end if;
  end loop;

  -- (T2) OWNER, VOLATILITY CLASS, search_path AND ACL, for each of the six.
  for v_def, v_role in
    select * from (values
      ('clara.open_intake_batch(uuid,text,text,uuid,text)', 'runtime'),
      ('clara.attach_intake_to_batch(uuid,uuid,uuid,text)', 'runtime'),
      ('clara.set_intake_batch_member_dependency(uuid,uuid,text,text,text)', 'runtime'),
      ('clara.cancel_intake_batch(uuid,uuid,text)', 'runtime'),
      ('clara.sweep_intake_batch_cancellations(integer)', 'runtime'),
      ('clara.get_intake_batch(uuid,integer)', 'human')
    ) as t(sig, who)
  loop
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_def::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '#636 tail T2: % is not owned by clara_fn_owner', v_def;
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = v_def::regprocedure
                      and 'search_path=clara, pg_temp' = any(p.proconfig)) then
      raise exception '#636 tail T2: % does not pin search_path=clara, pg_temp', v_def;
    end if;
    if v_role = 'runtime' then
      if not (select prosecdef from pg_proc where oid = v_def::regprocedure) then
        raise exception '#636 tail T2: % is not SECURITY DEFINER', v_def;
      end if;
      if not has_function_privilege('clara_runtime', v_def, 'EXECUTE') then
        raise exception '#636 tail T2: clara_runtime cannot execute %', v_def;
      end if;
      if has_function_privilege('clara_authenticated', v_def, 'EXECUTE')
         or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
        raise exception '#636 tail T2: % is granted beyond clara_runtime -- the human form goes through the runtime route', v_def;
      end if;
    else
      if (select prosecdef from pg_proc where oid = v_def::regprocedure) then
        raise exception '#636 tail T2: % must be SECURITY INVOKER -- the read is the signed-in human''s', v_def;
      end if;
      if not has_function_privilege('clara_authenticated', v_def, 'EXECUTE') then
        raise exception '#636 tail T2: clara_authenticated cannot execute %', v_def;
      end if;
      if has_function_privilege('clara_runtime', v_def, 'EXECUTE')
         or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
        raise exception '#636 tail T2: % reaches clara_runtime -- the pool gets its worklist from the sweep verb, not from the board', v_def;
      end if;
    end if;
  end loop;
  -- The four internals are granted to nobody.
  foreach v_def in array array['clara._intake_batch_actor_ctx(uuid,uuid)',
                               'clara._intake_batch_live_children(uuid)',
                               'clara._tf_intake_batch_member_intake_stamp()',
                               'clara._tf_intake_batch_member_work_stamp()'] loop
    if has_function_privilege('clara_authenticated', v_def, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_def, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
      raise exception '#636 tail T2: the internal % is granted to an application role', v_def;
    end if;
  end loop;

  -- (T3) THE THREE RELATIONS: forced RLS, the exact policy roster, and ZERO DML to every
  -- application role. Written per table because the read is SECURITY INVOKER: a parent-only policy
  -- would leave both children readable firm-wide.
  foreach v_def in array array['intake_batches','intake_batch_members',
                               'intake_batch_member_events'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname='clara' and c.relname = v_def
                      and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '#636 tail T3: clara.% is not RLS-forced', v_def;
    end if;
    select count(*)::int into v_n from (
      select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                          'clara_wake_interactive','clara_wake_proactive']) as r) g
     where has_table_privilege(g.r, 'clara.'||v_def, 'INSERT')
        or has_table_privilege(g.r, 'clara.'||v_def, 'UPDATE')
        or has_table_privilege(g.r, 'clara.'||v_def, 'DELETE');
    if v_n <> 0 then
      raise exception '#636 tail T3: % application role(s) hold DML on clara.%', v_n, v_def;
    end if;
    if not has_table_privilege('clara_authenticated', 'clara.'||v_def, 'SELECT') then
      raise exception '#636 tail T3: clara_authenticated cannot read clara.%', v_def;
    end if;
    if not exists (select 1 from pg_policies where schemaname='clara' and tablename=v_def
                    and policyname = 'p_'||v_def||'_owner') then
      raise exception '#636 tail T3: clara.% has no owner policy', v_def;
    end if;
  end loop;
  -- The runtime SELECT reaches the two CHILDREN and NOT the parent.
  if has_table_privilege('clara_runtime', 'clara.intake_batches', 'SELECT') then
    raise exception '#636 tail T3: clara_runtime can read the PARENT -- its worklist is clara.sweep_intake_batch_cancellations, by design';
  end if;
  foreach v_def in array array['intake_batch_members','intake_batch_member_events'] loop
    if not has_table_privilege('clara_runtime', 'clara.'||v_def, 'SELECT') then
      raise exception '#636 tail T3: clara_runtime cannot read clara.% -- the reconciler belt needs it', v_def;
    end if;
    if not exists (select 1 from pg_policies where schemaname='clara' and tablename=v_def
                    and policyname = 'p_'||v_def||'_runtime') then
      raise exception '#636 tail T3: clara.% has no runtime SELECT policy -- the grant alone reads nothing under FORCE RLS', v_def;
    end if;
  end loop;
  -- Every citation carries the tenant. A future single-column FK -- the shape that would let a
  -- member cite another firm's Work or intake -- cannot be added without this failing.
  for v_def, v_src in
    select * from (values
      ('fk_intake_batch_members_batch',
       'FOREIGN KEY (batch_id, firm_id) REFERENCES clara.intake_batches(id, firm_id)'),
      ('fk_intake_batch_members_intake',
       'FOREIGN KEY (intake_id, firm_id) REFERENCES clara.document_intakes(id, firm_id)'),
      ('fk_intake_batch_members_document',
       'FOREIGN KEY (document_id, firm_id) REFERENCES clara.documents(id, firm_id)'),
      ('fk_intake_batch_members_work',
       'FOREIGN KEY (work_id, firm_id, client_id) REFERENCES clara.accounting_work(id, firm_id, client_id)')
    ) as t(name, def)
  loop
    if (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='clara.intake_batch_members'::regclass and conname=v_def) is distinct from v_src then
      raise exception '#636 tail T3: % is not the tenant-carrying composite reference this file declared (got %)',
        v_def, (select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid='clara.intake_batch_members'::regclass and conname=v_def);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='clara.intake_batch_members'::regclass
                   and contype='u' and pg_get_constraintdef(oid) = 'UNIQUE (intake_id)') then
    raise exception '#636 tail T3: unique(intake_id) is absent -- AC1''s once-only admission is structural or it is nothing';
  end if;

  -- (T4) THE APPEND-ONLY PAIR on the events child.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.intake_batch_member_events'::regclass and not tgisinternal
     and tgname in ('t_intake_batch_member_events_append_only',
                    't_intake_batch_member_events_no_truncate');
  if v_n <> 2 then
    raise exception '#636 tail T4: the member-event ledger is missing its append-only/no-truncate pair (% of 2)', v_n;
  end if;

  -- (T5) THE TWELVE NON-REGRESSION PINS, RE-READ FROM THE COMMITTED CATALOG. This is the file's
  -- own proof that it recuts nothing. Four of the twelve are splices, so these shas were measured,
  -- never transcribed.
  for v_def, v_sha in
    select * from (values
      ('clara._tf_accounting_work_immutable()',
       'a1c4e0fc07dfe535433ee3061c54192ffeba640eae1375d8a2f529b3d1ff518e'),
      ('clara._assert_journal_source_refs(uuid,uuid,jsonb,boolean)',
       'f028c8ea70f7bcfde3cdd8ebaae045964ca763746010011a50d4c489bff232d2'),
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara.cancel_accounting_work(uuid,uuid,text)',
       '27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b'),
      ('clara._work_door_ctx(uuid,uuid,text,text,text,text)',
       'bd7bc3934fa919b2167b49f84b40f5205bcfcfc5207aaa31b94ce1c186ac2c7c'),
      ('clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)',
       '09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d'),
      ('clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)',
       '8f9e0b1944c8910bcdef049d250ca834b74a4aa33084b38d97acc868b4a697d7'),
      ('clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)',
       '074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734'),
      ('clara._resize_document_reservation(uuid,uuid,integer)',
       '41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf'),
      ('clara._settle_document_reservation(uuid,uuid,integer)',
       'b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6'),
      ('clara._declared_page_ceiling(bigint,text)',
       '82bc5e67afd4ea074665a320f357092fb0e93af9221f10b489a50cec3e4b4ca6'),
      ('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,integer)',
       '61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_live
      from pg_proc p where p.oid = v_def::regprocedure;
    if v_live is distinct from v_sha then
      raise exception '#636 tail T5: % MOVED while 0229 ran (live sha %) -- 0229 recuts nothing', v_def, v_live;
    end if;
  end loop;

  -- (T6) BOTH NEW TRIGGERS, by exact name, table and event; and the frozen-identity array of
  -- `_tf_accounting_work_immutable` (0200:255-257) is unchanged.
  if not exists (select 1 from pg_trigger
                  where tgrelid='clara.document_intakes'::regclass
                    and tgname='t_document_intakes_batch_member_stamp' and not tgisinternal) then
    raise exception '#636 tail T6: t_document_intakes_batch_member_stamp is absent';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='clara.accounting_work'::regclass
                    and tgname='t_accounting_work_batch_member_stamp' and not tgisinternal) then
    raise exception '#636 tail T6: t_accounting_work_batch_member_stamp is absent';
  end if;
  select pg_get_triggerdef(oid) into v_src from pg_trigger
   where tgrelid='clara.accounting_work'::regclass and tgname='t_accounting_work_batch_member_stamp';
  if position('AFTER INSERT' in upper(v_src)) = 0 then
    raise exception '#636 tail T6: the Work stamp is not AFTER INSERT (def is %) -- an UPDATE arm would fight _tf_accounting_work_immutable', v_src;
  end if;
  select prosrc into v_src from pg_proc
   where oid = 'clara._tf_accounting_work_immutable()'::regprocedure;
  if position('supersedes' in v_src) = 0 or position('superseded_by' in v_src) = 0 then
    raise exception '#636 tail T6: _tf_accounting_work_immutable no longer names the 0200 supersede columns -- its frozen array moved';
  end if;

  -- (T7) BOTH PURPOSE CHECK TEXTS ARE UNMOVED. #636 widens no vocabulary and mints no Work.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    if pg_get_constraintdef((select oid from pg_constraint
          where conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                                 else 'clara.operation_receipts'::regclass end)
            and conname = v_def))
       <> 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
      raise exception '#636 tail T7: % MOVED -- #636 is a grouper, never a producer', v_def;
    end if;
  end loop;

  -- (T8) THE READ CANNOT GROW A DENOMINATOR BY ACCIDENT. Probed on its own prosrc, so a future
  -- hand that adds one has to delete this assertion on purpose.
  select prosrc into v_src from pg_proc where oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure;
  if strpos(v_src, '''total''') <> 0 or strpos(v_src, '''percent''') <> 0
     or strpos(v_src, '''percentage''') <> 0 or strpos(v_src, '''page_count''') <> 0 then
    raise exception '#636 tail T8: clara.get_intake_batch names a total/percentage key -- AC3 forbids a fabricated denominator and the door supplies none';
  end if;

  -- (T9) THE CAPACITY SURFACE THIS FILE DID NOT TOUCH. #635 owns the limits editor and the MYT
  -- move; 0229 reports the shipped window and changes nothing about it.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure
     and p.prosrc like '%date_trunc(''day'', now() at time zone ''utc'')%';
  if v_n <> 1 then
    raise exception '#636 tail T9: the reservation window moved while 0229 ran';
  end if;

  raise notice '#636 tail OK (1/6): the six installed names each have exactly one pg_proc row';
  raise notice '#636 tail OK (2/6): five doors are clara_runtime-only SECURITY DEFINER, get_intake_batch is clara_authenticated-only SECURITY INVOKER, and all four internals are ungranted';
  raise notice '#636 tail OK (3/6): the three relations are RLS-forced with zero application-role DML, clara_runtime SELECT reaches the two CHILDREN only, and every member citation is tenant-carrying';
  raise notice '#636 tail OK (4/6): the member-event ledger carries its append-only/no-truncate pair';
  raise notice '#636 tail OK (5/6): the twelve non-regression bodies are byte-identical -- 0229 recuts nothing';
  raise notice '#636 tail OK (6/6): both purpose CHECKs are unmoved, get_intake_batch names no denominator, and the 0007 reservation window is untouched';
end
$w636_tail$;
