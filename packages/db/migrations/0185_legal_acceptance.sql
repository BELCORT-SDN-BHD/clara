-- 0185_legal_acceptance — #621 (parent spec #612, Implementation Decisions §8; journeys A1/A2):
-- VERSIONED LEGAL CONTENT AND ACCEPTANCE, FOR **BOTH** KINDS, WITH THE PLACEHOLDER TEXT
-- STRUCTURALLY UNSIGNABLE.
-- =====================================================================================
-- Spec of record: issue #612 §8 — "complete the engineering integration for versioned legal
-- acceptance and recovery while keeping final legal text/provider configuration as explicit
-- external inputs". Ticket #621. ARCHITECTURE §10 (anchor `admission-and-operator-support`):
-- 「准入使用版本化法律内容／签署、rate events、checkout intents 和 Stripe 验签 webhook」and, in the
-- same paragraph, 「已有 DPA 签署不能证明…完整法律接受…已完成」. This file closes exactly that gap and
-- nothing else: it ships the MECHANISM for configurable versioned content, and it deliberately
-- ships NO legal text. The owner's approved wording stays an external release input.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.dpa_documents`/`clara.dpa_signatures` — one kind,
-- one text spelling of a version, and a placeholder body that the estate happily let a registrant
-- SIGN — are generalised into `clara.legal_documents`/`clara.legal_acceptances`, which carry a
-- KIND (`terms` | `dpa`), a publication STATUS (`draft` | `published` | `superseded`) and an
-- integer version per kind, so that only PUBLISHED bytes can be accepted, Terms and the DPA are
-- two distinct records that must BOTH be accepted, and every acceptance points at the exact bytes
-- through a composite foreign key.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE: THE ESTATE COULD SIGN A PLACEHOLDER.
--
-- `0158_checkout_gate_c1_dpa.sql:265-272` seeds ONE DPA document whose body reads, verbatim:
--   "This is Clara's beta data-processing agreement, pending review by the owner's lawyer before
--    launch."
-- `clara.sign_dpa` (0163:340-387) accepts any document with `effective_to is null`, and that row
-- is the only one, so on every database built from this chain — hosted included — a registrant
-- could execute a legal acceptance against text that says of itself that it is not final. #621's
-- acceptance criteria name this directly: "Unpublished/placeholder legal text is not signed or
-- presented as final."
--
-- SO THE BACKFILL IS NOT A COSMETIC MAPPING, IT IS THE FIX. Its rule, stated once here and
-- implemented in §C:
--   · the 0158 placeholder — IDENTIFIED BY ITS EXACT body_sha256, recomputed in this file from
--     the exact body text 0158 inserts, never a hard-coded digest literal — becomes
--     `status='draft'`. A draft is presentable ("here is the text, it is not final") and is
--     structurally UNACCEPTABLE: `clara.accept_legal_document` refuses `not_published`.
--   · ANY OTHER `dpa_documents` row is real, reviewed text somebody published deliberately: the
--     one with `effective_to is null` carries over as `published`, the rest as `superseded`.
--     A hosted database that has already replaced the placeholder therefore keeps a working,
--     accepted DPA across this migration and nobody mid-flow is stranded.
--   · every `dpa_signatures` row carries over as a `dpa` acceptance, KEEPING ITS OWN id (see §C
--     for why that identity is load-bearing), so no registrant is asked to accept twice.
-- After this file there is NO published `terms` document and — on a chain that never replaced the
-- placeholder — NO published `dpa` document either. THAT IS THE INTENDED STATE: `/signup` cannot
-- complete until the owner publishes real wording through `clara.publish_legal_document`. A seed
-- of legal text would reach hosted, so this file seeds NONE (#621 acceptance: "owner-approved
-- legal wording remains an explicit external release input, not an invented implementation fact").
--
-- HOW THE RELEASE SESSION PUBLISHES v1. Two paths, both supported deliberately:
--   1. the door: an OWNER of the operator firm calls
--      `clara.publish_legal_document('terms', <title>, <body>, <source_path>, <effective_from>,
--      <op_key>)`, once per kind. This is the configurable-content half #612 §8 asks for, and it
--      is the path the operator surface will use.
--   2. a follow-up MIGRATION that inserts the reviewed bytes directly as
--      `status='published'`, under `set role clara_fn_owner`, the way 0158 seeded its placeholder.
--      The insert must supply `body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex')` — the
--      CHECK recomputes it, so a mismatch cannot land — and must supersede the current published
--      row of that kind in the same statement pair. Use this path when the reviewed text must be
--      part of a deploy artifact rather than an operator action.
-- Neither path is a seed: `packages/db/seeds/` gains nothing here.
--
-- =====================================================================================
-- WHY AN INTEGER VERSION, AND WHAT THAT COSTS `checkout_intents`.
--
-- `dpa_documents.version` is TEXT ('clara-beta-2026-08-a'). A text version cannot answer "is this
-- the next one" without a naming convention nobody enforces, and #621 needs
-- `publish_legal_document` to ALLOCATE the next version rather than trust a caller's spelling. So
-- `legal_documents.version` is an INTEGER, unique per kind, allocated `max(version)+1`.
--
-- That forces `clara.checkout_intents.dpa_version` (TEXT, FK to `dpa_documents.version`) to become
-- an integer, which Postgres cannot do in place: `ALTER ... TYPE ... USING` forbids a subquery and
-- the mapping is a JOIN. §D therefore adds the integer column, maps it through
-- `legal_documents.legacy_version`, drops the text column and renames — inside this one
-- transaction, so no session ever observes the intermediate shape. The COLUMN ORDER moves
-- (`dpa_version` lands after `opened_at`); `checkout-gate-c1.test.mjs` c1.1's census is updated in
-- the same change, and no live body reads that column except the two this file recuts (measured:
-- `grep -rn dpa_version packages/db/migrations apps/web packages/runtime` — 0160 and 0164 select
-- other columns of the same table, nothing else names it).
--
-- `legacy_version` is the ONE column here that is not in #621's contract, and it is load-bearing
-- three times: it carries the 0158 spelling so the deprecated wrappers can keep answering in the
-- words the deployed web sends and renders, it is the join key of the `checkout_intents` mapping
-- above, and it is NULL for everything published after this file, which is exactly how a reader
-- tells a carried-over row from a native one.
--
-- =====================================================================================
-- THE DEPRECATED WRAPPERS EXIST FOR ONE DEPLOY WINDOW, AND THEY ARE NOT A SECOND LAW.
--
-- `clara.sign_dpa`, `clara.get_current_dpa_document` (0163) and `clara.get_own_dpa_signature`
-- (0174) keep their EXACT signatures, return types and grants and become thin delegations onto the
-- `dpa` kind, so the hosted web at the previous SHA keeps working between this migration and its
-- own deploy. Two consequences are deliberate and must be read before the next web change:
--   · their REFUSAL SURFACE moves to the new roster. `sign_dpa` against the placeholder now raises
--     CLR09 `not_published` where it used to succeed; against an unknown spelling, CLR10
--     `unknown_version`; against stale bytes, CLR10 `hash_mismatch`.
--   · `get_current_dpa_document` returns the PUBLISHED row or NO ROW. It deliberately does not
--     fall back to a draft the way `get_current_legal_documents` does: the old door's consumers
--     render whatever it returns as the agreement to sign, and handing them a draft would be the
--     exact failure this file exists to remove.
-- They are marked deprecated in their own `comment on function`. Removing them is a later file's
-- work, after the web stops calling them.
--
-- =====================================================================================
-- IDEMPOTENCY: `_reserve_op` WHERE THERE IS A FIRM, THE ROW WHERE THERE IS NOT.
--
-- `clara._reserve_op` (0004:46) is keyed `(firm_id, fn, op_key)` and `clara.op_receipts.firm_id`
-- is NOT NULL. An applicant accepting Terms has no firm yet — the same structural fact
-- `clara.firm_registration_requests` documents at 0145:315-320 ("op_key IS STORED on the row …
-- because this door structurally cannot") and 0163 §4 states again ("Pre-firm idempotency is
-- structural"). So:
--   · `clara.accept_legal_document` (pre-firm) stores its `op_key` ON the acceptance row, under
--     `unique (user_id, op_key)`, and replays from it. The SAME key with a different (kind,
--     version) is CLR10 `op_key_conflict` — the estate's own token, with the estate's own meaning.
--   · `clara.publish_legal_document` (the operator's owner, who HAS a firm) uses
--     `_reserve_op`/`_finish_op` exactly as `approve_firm_registration` does.
-- Both doors are additionally idempotent on their natural key — `(user, kind, version)` and the
-- published body digest — so a lost response replays rather than writing twice, whichever path a
-- retry takes.
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =====================================================================================
-- §0  PRESTATE. Refuse a partial cohort, pin every object this file extends, and prove the
--     placeholder this file demotes is the row 0158 actually seeded.
-- =====================================================================================
do $w621_pre$
declare
  v_n int; v_names text; v_sha bytea;
begin
  if to_regclass('clara.users') is null
     or to_regclass('clara.dpa_documents') is null
     or to_regclass('clara.dpa_signatures') is null
     or to_regclass('clara.checkout_intents') is null
     or to_regclass('clara.firm_registration_payments') is null then
    raise exception '#621 prestate: the 0158/0163 checkout cohort is absent -- those files must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.sign_dpa(text,bytea,text)') is null
     or to_regprocedure('clara.get_current_dpa_document()') is null
     or to_regprocedure('clara.get_own_dpa_signature()') is null
     or to_regprocedure('clara.open_checkout_intent(uuid,bytea,text)') is null
     or to_regprocedure('clara.claim_paid_firm(uuid,text)') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._hash(jsonb)') is null
     or to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '#621 prestate: a required 0004/0163/0174 door or guard is absent' using errcode='CLR10';
  end if;

  select coalesce(string_agg(x,',' order by x),'(none)') into v_names
    from unnest(array['legal_documents','legal_acceptances']) x
   where to_regclass('clara.'||x) is not null;
  if v_names <> '(none)' then
    raise exception '#621 prestate: the cohort must be wholly absent; found %', v_names using errcode='CLR10';
  end if;
  select coalesce(string_agg(p.proname,',' order by p.proname),'(none)') into v_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('accept_legal_document','publish_legal_document','get_current_legal_documents');
  if v_names <> '(none)' then
    raise exception '#621 prestate: a legal-acceptance door already exists; found %', v_names using errcode='CLR10';
  end if;

  -- THE PLACEHOLDER, PROVEN PRESENT AND PROVEN SINGULAR, by its bytes rather than its spelling.
  -- If a later chain ever re-words the seed, this raises instead of silently carrying the new text
  -- over as `published` -- which is the one mistake this file must never make.
  v_sha := sha256(convert_to(
    'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
    'UTF8'));
  select count(*)::int into v_n from clara.dpa_documents d where d.body_sha256 = v_sha;
  if v_n <> 1 then
    raise exception '#621 prestate: expected exactly ONE 0158 placeholder DPA row by body digest, found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.dpa_documents d where d.effective_to is null;
  if v_n > 1 then
    raise exception '#621 prestate: % current DPA documents -- 0158''s one-current index is broken', v_n
      using errcode='CLR10';
  end if;

  -- The column this file RETYPES, read live: its absence or a prior retype means somebody already
  -- did half of §D.
  select atttypid::regtype::text into v_names from pg_attribute
   where attrelid='clara.checkout_intents'::regclass and attname='dpa_version' and not attisdropped;
  if v_names is distinct from 'text' then
    raise exception '#621 prestate: checkout_intents.dpa_version is %, expected text', coalesce(v_names,'(absent)')
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid='clara.checkout_intents'::regclass and attname='terms_version' and not attisdropped) then
    raise exception '#621 prestate: checkout_intents.terms_version already exists' using errcode='CLR10';
  end if;

  -- Every dpa_signatures row must be mappable, or §C's backfill would silently drop consent
  -- evidence. Asserted BEFORE anything is written.
  select count(*)::int into v_n from clara.dpa_signatures s
   where not exists (select 1 from clara.dpa_documents d where d.version=s.dpa_version);
  if v_n <> 0 then
    raise exception '#621 prestate: % dpa signature(s) name no document -- the backfill would drop them', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.checkout_intents i
   where not exists (select 1 from clara.dpa_documents d where d.version=i.dpa_version);
  if v_n <> 0 then
    raise exception '#621 prestate: % checkout intent(s) pin an unknown dpa version', v_n using errcode='CLR10';
  end if;

  raise notice '#621 prestate: clean -- no legal_documents/legal_acceptances relation and no acceptance door exists, the 0158 placeholder is present exactly once BY ITS BODY DIGEST, checkout_intents.dpa_version is still text with no terms_version beside it, and every existing DPA signature and checkout intent maps onto a document row.';
end
$w621_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.legal_documents — ONE relation for every kind of legal text Clara asks a person to
--     accept. Generalises 0158's dpa_documents; that table's laws are kept, not loosened.
--
--     · the body is STORED and its digest is RECOMPUTED BY A CHECK (0158's exact expression,
--       rendered hex instead of bytea so a caller can send the digest it hashed in JSON);
--     · at most ONE `published` row per kind, by partial unique index;
--     · the row is IMMUTABLE apart from its two legal status transitions (§A2);
--     · no application role holds any grant — every reach is through a definer door.
-- =====================================================================================
create table clara.legal_documents (
  kind           text        not null check (kind in ('terms','dpa')),
  version        integer     not null check (version >= 1),
  status         text        not null check (status in ('draft','published','superseded')),
  title          text        not null check (btrim(title) <> ''),
  body           text        not null check (btrim(body) <> ''),
  body_sha256    text        not null,
  source_path    text        not null check (btrim(source_path) <> ''),
  effective_from timestamptz not null,
  published_at   timestamptz,
  published_by   uuid        references clara.users(id),
  legacy_version text        check (legacy_version is null or btrim(legacy_version) <> ''),
  created_at     timestamptz not null default now(),
  constraint pk_legal_documents primary key (kind,version),
  -- The composite an acceptance points at: a version AND the exact bytes of that version.
  constraint uq_legal_documents_kind_version_sha unique (kind,version,body_sha256),
  -- 0158's `ck_dpa_documents_body_sha`, hex-rendered: the DATABASE derives the digest from the
  -- body, so no writer -- door, migration or superuser -- can record a digest of other bytes.
  constraint ck_legal_documents_body_sha
    check (body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex')),
  -- A draft has never been published; anything else has a publication instant.
  constraint ck_legal_documents_published_stamp
    check ((status = 'draft') = (published_at is null))
);
-- ONE current published text per kind. This is the whole of "which Terms are in force".
create unique index uq_legal_documents_published on clara.legal_documents(kind)
  where status = 'published';
-- The carried-over 0158 spelling resolves to one row per kind (the deprecated wrappers' lookup).
create unique index uq_legal_documents_legacy_version on clara.legal_documents(kind,legacy_version)
  where legacy_version is not null;

alter table clara.legal_documents enable row level security;
alter table clara.legal_documents force row level security;
create policy p_legal_documents_owner on clara.legal_documents for all to clara_fn_owner
  using (true) with check (true);

-- §A2  THE ONLY TWO LEGAL MOVES. 0158's `_tf_dpa_documents_supersede_only` admitted exactly one
-- transition (stamp effective_to); this admits exactly two, and nothing else about the row may
-- move with them. Changed WORDING is a new version -- never an edit, not even of a draft: a draft
-- a person has already been SHOWN is evidence of what they were shown.
create function clara._tf_legal_documents_transition() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if row(new.kind,new.version,new.title,new.body,new.body_sha256,new.source_path,
         new.effective_from,new.legacy_version,new.created_at)
     is distinct from
     row(old.kind,old.version,old.title,old.body,old.body_sha256,old.source_path,
         old.effective_from,old.legacy_version,old.created_at) then
    raise exception 'a legal document''s text and identity are immutable; publish changed wording as a new version'
      using errcode='CLR08', detail='{"reason":"legal_document_immutable"}';
  end if;
  if old.status = 'draft' and new.status = 'published' then
    if new.published_at is null then
      raise exception 'publishing a legal document must stamp published_at'
        using errcode='CLR10', detail='{"reason":"legal_document_immutable"}';
    end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'superseded' then
    if row(new.published_at,new.published_by) is distinct from row(old.published_at,old.published_by) then
      raise exception 'superseding a legal document may not rewrite its publication record'
        using errcode='CLR08', detail='{"reason":"legal_document_immutable"}';
    end if;
    return new;
  end if;
  raise exception 'legal document status may move only draft->published or published->superseded (got %->%)',
    old.status, new.status
    using errcode='CLR10', detail=jsonb_build_object(
      'reason','legal_document_transition','from',old.status,'to',new.status)::text;
end $$;
revoke all on function clara._tf_legal_documents_transition() from public;

create trigger t_legal_documents_transition before update on clara.legal_documents
  for each row execute function clara._tf_legal_documents_transition();
create trigger t_legal_documents_append_only before delete on clara.legal_documents
  for each row execute function clara._tf_append_only();
create trigger t_legal_documents_no_truncate before truncate on clara.legal_documents
  for each statement execute function clara._tf_no_truncate();

comment on table clara.legal_documents is
  '#621: every version of every legal text Clara asks a person to accept (kind = terms | dpa). '
  'One published row per kind; body_sha256 is DB-recomputed from the body; the row is immutable '
  'apart from draft->published and published->superseded. legacy_version carries the 0158 '
  'dpa_documents spelling for rows migrated by 0185 and is NULL for everything published since.';

-- =====================================================================================
-- §B  clara.legal_acceptances — the evidence. Generalises 0158's dpa_signatures and keeps its
--     two structural laws: the composite FK binds the exact BYTES (not merely a version), and the
--     row is append-only with ONE row per (user, kind, version).
--
--     `op_key` lives here rather than in op_receipts because the accepting actor has no firm --
--     see the header's idempotency note and 0145:315-320's identical finding.
-- =====================================================================================
create table clara.legal_acceptances (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references clara.users(id),
  kind        text        not null check (kind in ('terms','dpa')),
  version     integer     not null,
  body_sha256 text        not null,
  accepted_at timestamptz not null default now(),
  op_key      text        not null check (btrim(op_key) <> ''),
  constraint uq_legal_acceptances_user_kind_version unique (user_id,kind,version),
  constraint uq_legal_acceptances_user_op_key unique (user_id,op_key),
  constraint fk_legal_acceptances_document foreign key (kind,version,body_sha256)
    references clara.legal_documents(kind,version,body_sha256)
);
create index ix_legal_acceptances_user_kind on clara.legal_acceptances(user_id,kind,version desc);

alter table clara.legal_acceptances enable row level security;
alter table clara.legal_acceptances force row level security;
create policy p_legal_acceptances_owner on clara.legal_acceptances for all to clara_fn_owner
  using (true) with check (true);

create trigger t_legal_acceptances_append_only before update or delete on clara.legal_acceptances
  for each row execute function clara._tf_append_only();
create trigger t_legal_acceptances_no_truncate before truncate on clara.legal_acceptances
  for each statement execute function clara._tf_no_truncate();

comment on table clara.legal_acceptances is
  '#621: one person''s acceptance of one exact legal text. Append-only, one row per '
  '(user, kind, version), composite-FK bound to the document BYTES, and carrying its own op_key '
  '(the accepting actor has no firm, so op_receipts cannot scope it).';

-- =====================================================================================
-- §C  THE BACKFILL, AND THE DEMOTION OF THE OLD PAIR TO READ-ONLY HISTORY.
--
-- The rule is the header's, implemented once: the placeholder BY ITS DIGEST becomes a draft;
-- every other document keeps the publication state 0158's `effective_to` already recorded.
--
-- TWO IDENTITIES ARE DELIBERATELY PRESERVED, and each is load-bearing:
--   · `legal_documents.legacy_version` keeps the text spelling, so the deprecated wrappers answer
--     in the words the deployed web sends, and §D can map the intents.
--   · `legal_acceptances.id` IS the old `dpa_signatures.id`. `firm_registration_payments`
--     .consumed_dpa_signature (0163:230) is an FK onto that id under an all-or-none CHECK, and
--     §D repoints it at the new relation; reusing the id is what lets every already-consumed
--     payment row stay valid instead of needing a second mapping column.
-- =====================================================================================
insert into clara.legal_documents(
  kind,version,status,title,body,body_sha256,source_path,effective_from,published_at,
  legacy_version,created_at)
select 'dpa',
       row_number() over (order by d.effective_from, d.version),
       case when d.body_sha256 = sha256(convert_to(
              'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
              'UTF8')) then 'draft'
            when d.effective_to is null then 'published'
            else 'superseded' end,
       'Data processing agreement (' || d.version || ')',
       d.body,
       encode(d.body_sha256,'hex'),
       d.source_path,
       d.effective_from,
       case when d.body_sha256 = sha256(convert_to(
              'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
              'UTF8')) then null else d.effective_from end,
       d.version,
       d.created_at
  from clara.dpa_documents d;

insert into clara.legal_acceptances(id,user_id,kind,version,body_sha256,accepted_at,op_key)
select s.id, s.user_id, 'dpa', l.version, encode(s.body_sha256,'hex'), s.signed_at,
       'backfill-0185:' || s.id::text
  from clara.dpa_signatures s
  join clara.legal_documents l on l.kind='dpa' and l.legacy_version = s.dpa_version;

-- THE OLD PAIR IS HISTORY NOW. It is not dropped -- an append-only consent record is not a thing
-- this estate deletes -- and it is not written again either: `sign_dpa` delegates from §F, and no
-- other body in the schema writes them (the tail census proves that by reading every prosrc).
revoke insert, update, delete, truncate on clara.dpa_documents, clara.dpa_signatures from public;
comment on table clara.dpa_documents is
  '#621 (0185): READ-ONLY HISTORY. Superseded by clara.legal_documents (kind=''dpa''); every row '
  'was carried over with its spelling in legal_documents.legacy_version. No door writes this '
  'table after 0185.';
comment on table clara.dpa_signatures is
  '#621 (0185): READ-ONLY HISTORY. Superseded by clara.legal_acceptances (kind=''dpa''); every row '
  'was carried over KEEPING ITS id, which firm_registration_payments.consumed_dpa_signature still '
  'references. No door writes this table after 0185.';

-- =====================================================================================
-- §D  clara.checkout_intents PINS BOTH KINDS.
--
-- `terms_version` is NULLABLE ON PURPOSE and is the one concession to already-running applicants:
-- an intent opened before this file has no terms pin, and `claim_paid_firm` treats NULL as "this
-- flow never had a terms gate" rather than as "terms unaccepted". A hosted applicant who paid on
-- Tuesday must be able to claim their firm on Thursday. Every intent opened AFTER this file is
-- pinned by `open_checkout_intent`, which refuses to open at all without both acceptances, so the
-- NULL arm closes by itself as the pre-0185 intents are consumed.
--
-- The two `*_kind` columns are GENERATED constants, which is what lets the pins be real FOREIGN
-- KEYS onto (kind, version) rather than a trigger's opinion: a generated column cannot be written
-- wrongly by anybody, and `terms_kind` beside a NULL `terms_version` leaves the FK unenforced by
-- MATCH SIMPLE, which is exactly the legacy-intent arm above.
-- =====================================================================================
alter table clara.checkout_intents add column terms_version integer;
alter table clara.checkout_intents add column dpa_version_0185 integer;
-- MEASURED, not theoretical: 0158's `t_checkout_intents_session_stamp` is a BEFORE UPDATE trigger
-- that refuses EVERY update except the first NULL -> value stamp of `session_id`, so the mapping
-- UPDATE below raises "checkout_intents permits only the first session_id stamp" on any database
-- that holds even one intent -- and it holds hardest for an ALREADY-STAMPED row, i.e. exactly the
-- paid, mid-flow applicants this file must not strand. (Reproduced on a rig carrying 2 stamped
-- intents; a zero-row database never fires it, which is how a first cut can look green and still
-- be undeployable.) The trigger is therefore disabled for the width of this one migration-owned
-- backfill and re-enabled immediately; §H asserts it is ENABLED again before this file is done.
alter table clara.checkout_intents disable trigger t_checkout_intents_session_stamp;
update clara.checkout_intents i
   set dpa_version_0185 = l.version
  from clara.legal_documents l
 where l.kind='dpa' and l.legacy_version = i.dpa_version;
alter table clara.checkout_intents enable trigger t_checkout_intents_session_stamp;
do $w621_map$
declare v_n int;
begin
  select count(*)::int into v_n from clara.checkout_intents where dpa_version_0185 is null;
  if v_n <> 0 then
    raise exception '#621 §D: % checkout intent(s) did not map onto a legal document', v_n using errcode='CLR10';
  end if;
end
$w621_map$;
alter table clara.checkout_intents drop column dpa_version;
alter table clara.checkout_intents rename column dpa_version_0185 to dpa_version;
alter table clara.checkout_intents alter column dpa_version set not null;
alter table clara.checkout_intents
  add column dpa_kind   text generated always as ('dpa') stored,
  add column terms_kind text generated always as ('terms') stored;
alter table clara.checkout_intents
  add constraint fk_checkout_intents_dpa_document
    foreign key (dpa_kind,dpa_version) references clara.legal_documents(kind,version),
  add constraint fk_checkout_intents_terms_document
    foreign key (terms_kind,terms_version) references clara.legal_documents(kind,version);

-- 0158's session-stamp trigger froze the row by listing its columns, so the two new pins would be
-- rewritable during the one permitted UPDATE. Recut with both of them in the frozen tuple; every
-- other word is 0158:230-243's.
create or replace function clara._tf_checkout_intents_session_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if old.session_id is not null
     or new.session_id is null
     or btrim(new.session_id)=''
     or row(new.id,new.registration_id,new.applicant,new.price_local_key,new.dpa_version,
            new.terms_version,new.opened_at)
        is distinct from
        row(old.id,old.registration_id,old.applicant,old.price_local_key,old.dpa_version,
            old.terms_version,old.opened_at) then
    raise exception 'checkout_intents permits only the first session_id stamp'
      using errcode='CLR10';
  end if;
  return new;
end $$;

-- The consumed-acceptance FK follows the evidence to its new home. Every existing value still
-- resolves because §C reused the signature ids.
alter table clara.firm_registration_payments
  drop constraint firm_registration_payments_consumed_dpa_signature_fkey,
  add constraint fk_frp_consumed_legal_acceptance
    foreign key (consumed_dpa_signature) references clara.legal_acceptances(id);
comment on column clara.firm_registration_payments.consumed_dpa_signature is
  '#621 (0185): the clara.legal_acceptances row (kind=''dpa'') this claim consumed. The column name '
  'is 0163''s; its referent moved with the evidence, and pre-0185 values still resolve because the '
  'backfill kept each signature''s id.';

-- =====================================================================================
-- §E  THE THREE DOORS.
--
-- THE REFUSAL ROSTER, stated once so the web can be written against it (every one carries
-- `detail.reason`, the post-0178 house convention):
--
--   clara.accept_legal_document(p_kind,p_version,p_body_sha256,p_op_key) -> jsonb
--     CLR04 no_actor | unknown_actor | agent_actor
--     CLR10 invalid_op_key | invalid_kind | op_key_conflict | hash_mismatch
--     CLR09 not_published | stale_version
--     ok    {status: accepted|already_accepted, kind, version, body_sha256, accepted_at,
--            acceptance_id}
--
--   clara.publish_legal_document(p_kind,p_title,p_body,p_source_path,p_effective_from,p_op_key)
--     CLR04 (bare, from clara._human_ctx: no actor / no membership / insufficient role)
--     CLR04 not_operator_firm
--     CLR10 invalid_op_key | invalid_kind | empty_body | op_key_conflict
--     CLR13 operation_in_flight
--     CLR09 identical_body
--     ok    {status: published, kind, version, body_sha256, published_at, superseded_version}
--
--   clara.get_current_legal_documents() -> setof
--     CLR04 no_actor
--
-- `not_published` versus `stale_version`, decided in one place because the two overlap: if the
-- kind has NO published row the answer is `not_published` whatever version was asked for (there is
-- nothing acceptable, and saying "stale" would imply there is). If it HAS one and the caller named
-- another version, the answer is `stale_version` and carries the current version, because that
-- caller is holding a page that has moved and the surface must re-fetch rather than retry.
-- =====================================================================================

-- Frontend home: apps/web/lib/registration (the /signup legal step and the account's legal page).
-- A function door rather than a `_visible` view for the same reason 0163 gave: the current legal
-- text is a global row with no tenant predicate, and the caller-scoped half (`accepted_at`,
-- `accepted_version`) is derived from jwt_sub(), not from a row filter.
--
-- IT REFUSES WITHOUT AN ACTOR rather than answering with two NULL columns, the wall
-- clara.get_own_dpa_signature (0174) established: "not accepted" and "nobody asked" must not be
-- the same answer. A pre-authentication reader of the bare TEXT uses the deprecated
-- get_current_dpa_document (or, after the web deploy, a read the web owns).
--
-- THE DRAFT FALLBACK IS THE POINT. A kind with no published row returns its newest DRAFT with
-- `status='draft'`, so the surface can render the text and say -- truthfully -- that it is not
-- final, instead of rendering an empty page or, worse, presenting a placeholder as the agreement.
-- Accepting that row is refused by the acceptance door, so "presentable" and "acceptable" are two
-- different facts here and the UI cannot confuse them.
create function clara.get_current_legal_documents()
returns table(kind text, version integer, status text, title text, body text, body_sha256 text,
              effective_from timestamptz, published_at timestamptz,
              accepted_at timestamptz, accepted_version integer)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04', detail='{"reason":"no_actor"}';
  end if;
  return query
  with current_docs as (
    select distinct on (d.kind)
           d.kind, d.version, d.status, d.title, d.body, d.body_sha256, d.effective_from, d.published_at
      from clara.legal_documents d
     where d.status in ('published','draft')
     order by d.kind, (d.status = 'published') desc, d.version desc
  )
  select c.kind, c.version, c.status, c.title, c.body, c.body_sha256, c.effective_from, c.published_at,
         a.accepted_at,
         (select max(x.version) from clara.legal_acceptances x
           where x.user_id = v_actor and x.kind = c.kind)
    from current_docs c
    left join clara.legal_acceptances a
      on a.user_id = v_actor and a.kind = c.kind and a.version = c.version
   order by c.kind;
end $$;
revoke all on function clara.get_current_legal_documents() from public;
grant execute on function clara.get_current_legal_documents() to clara_authenticated;
comment on function clara.get_current_legal_documents() is
  '#621: the current legal text of EVERY kind for the calling person -- the published row if there '
  'is one, else the newest draft (status says which), with the caller''s own acceptance of that '
  'exact version and their latest accepted version of that kind. Refuses CLR04 no_actor.';

-- THE ACCEPTANCE DOOR. Idempotent twice over: by `op_key` (a lost response replays, and the same
-- key against a different document is a typed conflict rather than a second acceptance) and by
-- (user, kind, version) (a second tab, or a retry that reached the database the first time, replays
-- the ORIGINAL accepted_at -- the instant a person actually accepted is not something a retry may
-- move).
create function clara.accept_legal_document(
  p_kind text, p_version integer, p_body_sha256 text, p_op_key text
) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_doc clara.legal_documents%rowtype;
  v_prior clara.legal_acceptances%rowtype;
  v_id uuid;
  v_at timestamptz;
  v_sha text;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04', detail='{"reason":"no_actor"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04', detail='{"reason":"unknown_actor"}';
  end if;
  -- A legal acceptance is a HUMAN act. 0163 wrote this wall for the DPA; it is not weakened here.
  if v_is_agent then
    raise exception 'the agent identity cannot accept a legal document'
      using errcode='CLR04', detail='{"reason":"agent_actor"}';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_kind is null or p_kind not in ('terms','dpa') then
    raise exception 'unknown legal document kind' using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_kind','kind',p_kind)::text;
  end if;
  v_sha := lower(btrim(coalesce(p_body_sha256,'')));

  -- REPLAY FIRST, and from the op_key, so a retry answers the same way even after the document it
  -- accepted has since been superseded.
  select * into v_prior from clara.legal_acceptances a
   where a.user_id = v_actor and a.op_key = p_op_key;
  if found then
    if v_prior.kind is distinct from p_kind or v_prior.version is distinct from p_version then
      raise exception 'this op key was already used for a different legal document'
        using errcode='CLR10', detail=jsonb_build_object(
          'reason','op_key_conflict','kind',v_prior.kind,'version',v_prior.version)::text;
    end if;
    return jsonb_build_object(
      'status','already_accepted','kind',v_prior.kind,'version',v_prior.version,
      'body_sha256',v_prior.body_sha256,'accepted_at',v_prior.accepted_at,'acceptance_id',v_prior.id);
  end if;

  select * into v_doc from clara.legal_documents d where d.kind = p_kind and d.status = 'published';
  if not found then
    raise exception 'no % document is published', p_kind using errcode='CLR09',
      detail=jsonb_build_object('reason','not_published','kind',p_kind,'version',p_version)::text;
  end if;
  if v_doc.version is distinct from p_version then
    raise exception 'that % version is no longer the published one', p_kind using errcode='CLR09',
      detail=jsonb_build_object('reason','stale_version','kind',p_kind,
        'version',p_version,'current_version',v_doc.version)::text;
  end if;
  if v_sha is distinct from v_doc.body_sha256 then
    raise exception 'the accepted text does not match the published document'
      using errcode='CLR10', detail=jsonb_build_object('reason','hash_mismatch','kind',p_kind,
        'version',v_doc.version)::text;
  end if;

  begin
    insert into clara.legal_acceptances(user_id,kind,version,body_sha256,op_key)
    values (v_actor,v_doc.kind,v_doc.version,v_doc.body_sha256,p_op_key)
    on conflict (user_id,kind,version) do nothing
    returning id,accepted_at into v_id,v_at;
  exception when unique_violation then
    -- `uq_legal_acceptances_user_op_key` raced a CONCURRENT sibling holding the same key -- the
    -- (user, kind, version) collision is the arbiter above and never reaches here, so the racer
    -- was accepting a DIFFERENT document under one key. Fall through to the replay read, which
    -- re-decides on committed state rather than guessing.
    v_id := null;
  end;
  if v_id is not null then
    return jsonb_build_object(
      'status','accepted','kind',v_doc.kind,'version',v_doc.version,
      'body_sha256',v_doc.body_sha256,'accepted_at',v_at,'acceptance_id',v_id);
  end if;
  select * into v_prior from clara.legal_acceptances a
   where a.user_id = v_actor and a.kind = v_doc.kind and a.version = v_doc.version;
  if not found then
    -- The racer won the key with another document. Answering `already_accepted` out of an empty
    -- record would hand a legal surface a receipt made of NULLs; this door says what happened.
    raise exception 'this op key was already used for a different legal document'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end if;
  return jsonb_build_object(
    'status','already_accepted','kind',v_prior.kind,'version',v_prior.version,
    'body_sha256',v_prior.body_sha256,'accepted_at',v_prior.accepted_at,'acceptance_id',v_prior.id);
end $$;
revoke all on function clara.accept_legal_document(text,integer,text,text) from public;
grant execute on function clara.accept_legal_document(text,integer,text,text) to clara_authenticated;
comment on function clara.accept_legal_document(text,integer,text,text) is
  '#621: record one person''s acceptance of one PUBLISHED legal document, bound to its exact bytes. '
  'Human actors only. Idempotent by op_key and by (user, kind, version); a replay returns the '
  'ORIGINAL accepted_at. Refusals carry detail.reason: invalid_op_key | invalid_kind | '
  'op_key_conflict | hash_mismatch (CLR10), not_published | stale_version (CLR09), '
  'no_actor | unknown_actor | agent_actor (CLR04).';

-- THE PUBLISH DOOR — the "configurable versioned content" half of #612 §8. Authority is the same
-- predicate `clara.approve_firm_registration` uses (0145:782): `clara._human_ctx(role_rank('owner'))`
-- for the rank, then `exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and
-- f.is_operator)` for the operator firm -- re-derived at call time, never cached, and deliberately
-- the same literal fragment so a census can compare like with like.
--
-- IT ALLOCATES THE VERSION. A caller supplies wording, not a number; `max(version)+1` per kind is
-- the database's, under an advisory lock on the kind so two concurrent publishes cannot both
-- compute the same next number and then race the partial unique index into a bare 23505.
create function clara.publish_legal_document(
  p_kind text, p_title text, p_body text, p_source_path text,
  p_effective_from timestamptz, p_op_key text
) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record;
  v_dedupe jsonb;
  v_current clara.legal_documents%rowtype;
  v_sha text;
  v_version integer;
  v_at timestamptz;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_kind is null or p_kind not in ('terms','dpa') then
    raise exception 'unknown legal document kind' using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_kind','kind',p_kind)::text;
  end if;
  if nullif(btrim(coalesce(p_body,'')),'') is null
     or nullif(btrim(coalesce(p_title,'')),'') is null
     or nullif(btrim(coalesce(p_source_path,'')),'') is null then
    raise exception 'a legal document needs a title, a body and a source path'
      using errcode='CLR10', detail='{"reason":"empty_body"}';
  end if;
  v_sha := encode(sha256(convert_to(p_body,'UTF8')),'hex');

  begin
    v_dedupe := clara._reserve_op(c.firm, 'publish_legal_document', p_op_key,
      clara._hash(jsonb_build_object('kind',p_kind,'sha',v_sha,'actor',c.actor)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args" (0004:57), re-raised WITH a
    -- detail so every refusal this door emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different publication'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this publication is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                                  -- the ORIGINAL receipt, byte-identical
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.legal-publish:' || p_kind, 0));
  select * into v_current from clara.legal_documents d
   where d.kind = p_kind and d.status = 'published' for update;
  if found and v_current.body_sha256 = v_sha then
    raise exception 'that text is already the published % document', p_kind using errcode='CLR09',
      detail=jsonb_build_object('reason','identical_body','kind',p_kind,
        'version',v_current.version)::text;
  end if;
  if found then
    update clara.legal_documents set status='superseded'
     where kind = v_current.kind and version = v_current.version;
  end if;
  select coalesce(max(d.version),0) + 1 into v_version
    from clara.legal_documents d where d.kind = p_kind;
  v_at := now();
  insert into clara.legal_documents(
    kind,version,status,title,body,body_sha256,source_path,effective_from,published_at,published_by)
  values (p_kind,v_version,'published',btrim(p_title),p_body,v_sha,btrim(p_source_path),
          coalesce(p_effective_from, v_at), v_at, c.actor);

  perform clara._audit(c.firm, c.actor, null, null, 'publish_legal_document', null,
    jsonb_build_object('kind',p_kind,'version',v_version,'body_sha256',v_sha));
  return clara._finish_op(c.firm, 'publish_legal_document', p_op_key, jsonb_build_object(
    'status','published','kind',p_kind,'version',v_version,'body_sha256',v_sha,
    'published_at',v_at,'superseded_version',
    case when v_current.version is null then null else to_jsonb(v_current.version) end));
end $$;
revoke all on function clara.publish_legal_document(text,text,text,text,timestamptz,text) from public;
grant execute on function clara.publish_legal_document(text,text,text,text,timestamptz,text)
  to clara_authenticated;
comment on function clara.publish_legal_document(text,text,text,text,timestamptz,text) is
  '#621: publish reviewed legal wording as the next version of its kind and supersede the current '
  'one. Owner of the OPERATOR firm only (the approve_firm_registration predicate, re-derived at '
  'call time). op_receipts-idempotent. Refusals carry detail.reason: invalid_op_key | invalid_kind '
  '| empty_body | op_key_conflict (CLR10), identical_body (CLR09), operation_in_flight (CLR13), '
  'not_operator_firm (CLR04).';

-- =====================================================================================
-- §F  THE DEPRECATED DPA WRAPPERS. Same signatures, same return types, same grants, delegating
--     onto kind='dpa'. They exist so the hosted web at the previous SHA keeps working across the
--     deploy window, and for no other reason. See the header for the two behaviour changes a
--     reader must know about before the next web change.
-- =====================================================================================
create or replace function clara.get_current_dpa_document()
returns table(version text,body text,body_sha256 bytea,published_at timestamptz)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
begin
  -- PUBLISHED ONLY -- deliberately no draft fallback. This door's callers render what it returns
  -- as the agreement to sign.
  return query
  select coalesce(d.legacy_version, d.version::text),
         d.body,
         decode(d.body_sha256,'hex'),
         coalesce(d.published_at, d.effective_from)
    from clara.legal_documents d
   where d.kind='dpa' and d.status='published';
end $$;
comment on function clara.get_current_dpa_document() is
  '#621 (0185) DEPRECATED: delegates to clara.legal_documents (kind=''dpa'', status=''published''). '
  'Returns NO ROW when no DPA is published -- it never falls back to a draft. Use '
  'clara.get_current_legal_documents().';

create or replace function clara.sign_dpa(p_version text,p_body_sha256 bytea,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_doc clara.legal_documents%rowtype;
  v_result jsonb;
begin
  select * into v_doc from clara.legal_documents d
   where d.kind='dpa' and coalesce(d.legacy_version, d.version::text) = p_version;
  if not found then
    raise exception 'unknown dpa version' using errcode='CLR10',
      detail=jsonb_build_object('reason','unknown_version','kind','dpa','version',p_version)::text;
  end if;
  v_result := clara.accept_legal_document(
    'dpa', v_doc.version, encode(coalesce(p_body_sha256,''::bytea),'hex'), p_op_key);
  -- 0163's WIRE SHAPE, preserved exactly: {signature_id, signed_at} and, on a replay, `replay`.
  return jsonb_build_object(
    'signature_id', v_result->'acceptance_id', 'signed_at', v_result->'accepted_at')
    || case when v_result->>'status' = 'already_accepted'
            then jsonb_build_object('replay', true) else '{}'::jsonb end;
end $$;
comment on function clara.sign_dpa(text,bytea,text) is
  '#621 (0185) DEPRECATED: delegates to clara.accept_legal_document(''dpa'',...). Its refusal '
  'surface is now that door''s -- notably CLR09 not_published against a DRAFT (the 0158 placeholder '
  'is one) and CLR10 unknown_version against an unrecognised spelling. Use accept_legal_document.';

create or replace function clara.get_own_dpa_signature()
returns table(dpa_version text, signed_at timestamptz, is_current boolean)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  -- The composite join is 0174's, on the NEW pair: an acceptance of superseded bytes reads
  -- is_current=false rather than as an acceptance of the live agreement.
  return query
  select coalesce(d.legacy_version, d.version::text), a.accepted_at, (d.status='published')
    from clara.legal_acceptances a
    join clara.legal_documents d
      on d.kind=a.kind and d.version=a.version and d.body_sha256=a.body_sha256
   where a.user_id=v_actor and a.kind='dpa'
   order by a.accepted_at desc, d.version desc;
end $$;
comment on function clara.get_own_dpa_signature() is
  '#621 (0185) DEPRECATED: the caller''s own DPA acceptances, read from clara.legal_acceptances. '
  'is_current means "these bytes are the PUBLISHED agreement". Use '
  'clara.get_current_legal_documents() for the per-kind current state.';

-- =====================================================================================
-- §G  THE TWO MONEY-SURFACE RECUTS. Full bodies, derived from 0163:391-502 and 0163:561-674; every
--     other arm and comment is 0163's, word for word. What changes in each is ONE wall:
--
--       open_checkout_intent  the single "the data processing agreement is not signed" arm becomes
--                             a BOTH-KINDS arm that names WHICH kinds are missing, and the intent
--                             now pins terms_version beside dpa_version.
--       claim_paid_firm       the pinned-version check covers the intent's terms_version too --
--                             UNLESS it is NULL, which is a pre-0185 intent (see §D).
--
--     `detail.missing` is an ARRAY because a fresh applicant is missing both, and a surface that
--     can only say "something is missing" sends them to the wrong step half the time.
-- =====================================================================================

-- `p_origin_digest` is sha256(pepper || proxy-observed client IP), never the browser `Origin`
-- header (裁-107 M1; checkout-gate design part 1 §4).
create or replace function clara.open_checkout_intent(
  p_registration uuid,p_origin_digest bytea,p_op_key text
) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_req clara.firm_registration_requests%rowtype;
  v_dpa_version integer;
  v_terms_version integer;
  v_missing jsonb;
  v_price_local_key text;
  v_stripe_price_id text;
  v_intent uuid;
  v_already_paid boolean;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- The registration-row lock makes an absent-intent lookup below race-safe: two concurrent
  -- retries for one applicant cannot both observe no unstamped intent and insert independently.
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration for update;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  if v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  -- #621: BOTH KINDS, each PUBLISHED and each accepted at THAT EXACT VERSION AND THOSE EXACT
  -- BYTES. A kind with nothing published is missing for the same reason an unaccepted one is:
  -- there is no legal acceptance behind this checkout either way. Replaces 0163's single
  -- "the data processing agreement is not signed" arm, whose sentence is kept in detail.message
  -- so a caller that matched on it still has it.
  select coalesce(jsonb_agg(k.kind order by k.kind),'[]'::jsonb) into v_missing
    from (select unnest(array['dpa','terms']) as kind) k
   where not exists (
     select 1 from clara.legal_documents d
      join clara.legal_acceptances a
        on a.user_id=v_actor and a.kind=d.kind and a.version=d.version and a.body_sha256=d.body_sha256
      where d.kind=k.kind and d.status='published');
  if jsonb_array_length(v_missing)>0 then
    raise exception 'the required legal agreements are not accepted' using errcode='CLR09',
      detail=jsonb_build_object('reason','legal_not_accepted','missing',v_missing,
        'message','the data processing agreement is not signed')::text;
  end if;
  select d.version into v_dpa_version
    from clara.legal_documents d where d.kind='dpa' and d.status='published';
  select d.version into v_terms_version
    from clara.legal_documents d where d.kind='terms' and d.status='published';
  if p_origin_digest is null or octet_length(p_origin_digest)<>32 then
    raise exception 'an origin digest is required' using errcode='CLR10';
  end if;
  -- The rolling-window read and evidence append are one linearized act per digest. A hash
  -- collision only over-serializes unrelated origins; it can never weaken the wall.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'clara.checkout-origin:'||pg_catalog.encode(p_origin_digest,'hex'),0));
  if exists (
    select 1 from clara.registration_rate_events e
     where e.origin_digest=p_origin_digest
       and e.observed_at>=now()-interval '24 hours'
       and e.applicant<>v_actor
  ) then
    raise exception 'too many firm registrations from this location today' using errcode='CLR09';
  end if;
  -- X10 needs a real, honest read of firm_registration_payments. This opening door and the
  -- operator's unconsumed-payment read door below are both named in the five-body census; hiding
  -- a real dependency from a catalog census on a money surface is the wrong kind of clever.
  select exists (
    select 1 from clara.firm_registration_payments p
     where p.registration_id=p_registration and p.consumed_at is null
  ) into v_already_paid;
  if v_already_paid then
    raise exception 'this registration is already paid' using errcode='CLR09';
  end if;

  select b.local_key into v_price_local_key
    from clara.billing_plans b where b.is_current;
  if not found then
    raise exception 'no current billing plan is configured' using errcode='CLR10';
  end if;
  select m.stripe_id into v_stripe_price_id
    from clara.stripe_object_map m
   where m.object_kind='price' and m.local_key=v_price_local_key;
  if not found then
    raise exception 'no stripe price is mapped for this plan' using errcode='CLR10';
  end if;

  -- Money-surface rule: reuse only an unstamped intent whose plan is still the current plan.
  -- A stale-plan intent stays unstamped and untouched while this call takes the fresh-intent path.
  -- `p_op_key` is validated above but deliberately not reserved: the durable retry identity is
  -- the applicant's one locked, unstamped CURRENT-plan intent. A session stamp consumes it.
  select i.id into v_intent
    from clara.checkout_intents i
   where i.registration_id=p_registration and i.applicant=v_actor and i.session_id is null
     and i.price_local_key=v_price_local_key
   order by i.opened_at,i.id
   limit 1
   for update;
  if found then
    return jsonb_build_object(
      'intent_id',v_intent,'price_local_key',v_price_local_key,'stripe_price_id',v_stripe_price_id);
  end if;

  insert into clara.registration_rate_events(applicant,origin_digest)
  values (v_actor,p_origin_digest);
  insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,terms_version)
  values (p_registration,v_actor,v_price_local_key,v_dpa_version,v_terms_version)
  returning id into v_intent;
  return jsonb_build_object(
    'intent_id',v_intent,'price_local_key',v_price_local_key,'stripe_price_id',v_stripe_price_id);
end $$;

-- The unlocked probe gives settled later retries a receipt. The locked re-read deliberately has
-- no replay carve-out: a concurrent loser wakes onto W7 and raises CLR09 (W-K).
create or replace function clara.claim_paid_firm(p_registration uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_email text;
  v_req clara.firm_registration_requests%rowtype;
  v_plan uuid;
  v_payment uuid;
  v_payment_session text;
  v_dpa_version integer;
  v_terms_version integer;
  v_missing jsonb;
  v_signature uuid;
  v_result jsonb;
  v_firm uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  v_email:=clara._jwt_email();
  if v_email is null or v_email is distinct from (
    select lower(u.email) from clara.users u where u.id=v_actor
  ) then
    raise exception 'a verified email claim is required' using errcode='CLR04';
  end if;

  if v_req.firm_id is not null then
    select p.id into v_plan from clara.onboarding_plans p
     where p.firm_id=v_req.firm_id and p.scope_kind='firm';
    if not found then
      raise exception 'the registration firm has no onboarding plan' using errcode='CLR10';
    end if;
    return jsonb_build_object(
      'firm_id',v_req.firm_id,'plan_id',v_plan,'registration_id',p_registration,'replay',true);
  end if;

  select r.* into v_req
    from clara.firm_registration_requests r
   where r.id=p_registration
   for update;
  -- NIT7 (opus review on #493): without this, a vanished row leaves v_req an all-NULL record
  -- (plpgsql's documented INTO behavior on zero rows) and the wall below reads
  -- `NULL is not null or NULL<>'open'` = `false or NULL` = NULL -- three-valued logic reads a
  -- bare NULL condition as FALSE in an IF, so the wall silently does not fire and execution falls
  -- through into the folded door's write path on a phantom row. Fail closed, explicitly, on the
  -- highest-stakes read in this file.
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.firm_id is not null or v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  select p.id,p.stripe_session_id into v_payment,v_payment_session
    from clara.firm_registration_payments p
   where p.registration_id=p_registration and p.consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;
  select i.dpa_version,i.terms_version into v_dpa_version,v_terms_version
    from clara.checkout_intents i where i.session_id=v_payment_session;
  if not found then
    raise exception 'the data processing agreement is not signed' using errcode='CLR09',
      detail='{"reason":"legal_not_accepted","missing":["dpa","terms"],"cause":"intent_not_found"}';
  end if;
  -- #621: the acceptance must exist at the version the INTENT pinned, for every kind the intent
  -- pinned. `terms_version` NULL is a pre-0185 intent (§D) and passes the terms half: an applicant
  -- who paid before this file existed must still be able to claim their firm.
  v_missing:='[]'::jsonb;
  if not exists (
    select 1 from clara.legal_acceptances a
     where a.user_id=v_actor and a.kind='dpa' and a.version=v_dpa_version
  ) then
    v_missing:=v_missing||'["dpa"]'::jsonb;
  end if;
  if v_terms_version is not null and not exists (
    select 1 from clara.legal_acceptances a
     where a.user_id=v_actor and a.kind='terms' and a.version=v_terms_version
  ) then
    v_missing:=v_missing||'["terms"]'::jsonb;
  end if;
  if jsonb_array_length(v_missing)>0 then
    raise exception 'the required legal agreements are not accepted' using errcode='CLR09',
      detail=jsonb_build_object('reason','legal_not_accepted','missing',v_missing,
        'message','the data processing agreement is not signed')::text;
  end if;
  select a.id into v_signature
    from clara.legal_acceptances a
   where a.user_id=v_actor and a.kind='dpa' and a.version=v_dpa_version;

  v_result:=clara._create_firm_core(v_actor,v_req.firm_name);
  v_firm:=(v_result->>'firm_id')::uuid;
  update clara.firm_registration_requests
     set status='approved',decided_at=now(),firm_id=v_firm
   where id=p_registration;
  update clara.firm_registration_payments
     set consumed_at=now(),consumed_firm_id=v_firm,consumed_dpa_signature=v_signature
   where id=v_payment and consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;

  perform clara._audit(
    v_firm,v_actor,null,null,'claim_paid_firm',null,
    jsonb_build_object('registration_id',p_registration,'plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm.created',null,v_actor,null,null,null,null,null,
    jsonb_build_object('plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm_registration.paid',null,v_actor,null,null,null,null,null,
    jsonb_build_object('registration_id',p_registration,'payment_id',v_payment));
  return jsonb_build_object(
    'firm_id',v_result->>'firm_id','plan_id',v_result->>'plan_id','registration_id',p_registration);
end $$;

reset role;

-- =====================================================================================
-- §H  TAIL CENSUS. Every claim re-READ from the live catalog, and every prosrc probe reads the
--     body with its `--` comment tails removed by the literal-aware scanner 0184 §J established --
--     plpgsql keeps a function's own comments in prosrc, so a census that greps the raw text can
--     be satisfied by a SENTENCE ABOUT the code instead of the code. `clara._record_journal_entry_core`
--     is in the strip's input for ONE reason: it is the estate's known line carrying `--` INSIDE a
--     string literal, and it is this census's control that the scanner did not cut there.
-- =====================================================================================
do $w621_tail$
declare
  v_src text; v_n int; v_sig text; v_line text;
  v_bodies jsonb := '{}'::jsonb;
  v_body text; v_out text; v_par int; v_kept text; v_rest text; v_head text; v_p int;
  v_placeholder text;
begin
  foreach v_sig in array array[
      'clara.accept_legal_document(text,integer,text,text)',
      'clara.publish_legal_document(text,text,text,text,timestamptz,text)',
      'clara.get_current_legal_documents()',
      'clara.sign_dpa(text,bytea,text)',
      'clara.get_current_dpa_document()',
      'clara.get_own_dpa_signature()',
      'clara.open_checkout_intent(uuid,bytea,text)',
      'clara.claim_paid_firm(uuid,text)',
      'clara._tf_checkout_intents_session_stamp()',
      'clara._tf_legal_documents_transition()',
      'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)']
  loop
    select p.prosrc into v_body from pg_proc p where p.oid = v_sig::regprocedure;
    v_out := ''; v_par := 0;
    for v_line in select l from regexp_split_to_table(v_body, chr(10)) with ordinality t(l, n) order by n
    loop
      v_kept := ''; v_rest := v_line;
      loop
        v_p := position('--' in v_rest);
        if v_p = 0 then
          v_kept := v_kept || v_rest;
          v_par := (v_par + length(v_rest) - length(replace(v_rest, '''', ''))) % 2;
          exit;
        end if;
        v_head := substr(v_rest, 1, v_p - 1);
        v_par := (v_par + length(v_head) - length(replace(v_head, '''', ''))) % 2;
        if v_par = 0 then
          v_kept := v_kept || v_head;
          exit;
        end if;
        v_kept := v_kept || v_head || '--';
        v_rest := substr(v_rest, v_p + 2);
      end loop;
      v_out := v_out || v_kept || chr(10);
    end loop;
    v_bodies := v_bodies || jsonb_build_object(v_sig, v_out);
  end loop;

  -- VACUITY CONTROL, both sides.
  v_src := v_bodies ->> 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)';
  if position('''client is not active -- no posting'' using errcode=''CLR10''' in v_src) = 0 then
    raise exception '#621 tail: the comment strip is not literal-aware -- it cut inside a string literal, so every probe below is unsound'
      using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara.accept_legal_document(text,integer,text,text)';
  if position('REPLAY FIRST, and from the op_key' in v_src) > 0 then
    raise exception '#621 tail: the comment strip left prose in the body -- every probe below could be satisfied by a sentence about the code'
      using errcode='CLR10';
  end if;
  if position('raise exception ''no % document is published''' in v_src) = 0 then
    raise exception '#621 tail: the comment strip mutilated a probed statement' using errcode='CLR10';
  end if;

  -- 1 · THE TWO RELATIONS, with 0158's confinement: forced RLS, one owner policy, ZERO grants to
  --     any application role. Every reach is a definer door.
  foreach v_sig in array array['legal_documents','legal_acceptances'] loop
    select count(*)::int into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_sig and c.relkind='r'
       and c.relrowsecurity and c.relforcerowsecurity
       and pg_get_userbyid(c.relowner)='clara_fn_owner'
       and (select count(*) from pg_policy p where p.polrelid=c.oid)=1;
    if v_n <> 1 then
      raise exception '#621 tail: clara.% is absent or not owner-confined with forced RLS and one policy', v_sig
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from information_schema.role_table_grants g
     where g.table_schema='clara' and g.table_name=v_sig and g.grantee<>'clara_fn_owner';
    if v_n <> 0 then
      raise exception '#621 tail: clara.% carries % application-role table grant(s)', v_sig, v_n
        using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE CONSTRAINTS THAT ARE THE LAW, by name and by definition.
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.legal_documents'::regclass
     and conname in ('pk_legal_documents','uq_legal_documents_kind_version_sha',
                     'ck_legal_documents_body_sha','ck_legal_documents_published_stamp');
  if v_n <> 4 then
    raise exception '#621 tail: legal_documents carries % of its 4 named key/check constraints', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_indexes
   where schemaname='clara' and indexname='uq_legal_documents_published'
     and indexdef like '%UNIQUE%' and indexdef like '%status = ''published''%';
  if v_n <> 1 then
    raise exception '#621 tail: the one-published-per-kind partial unique index is absent'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.legal_acceptances'::regclass
     and conname in ('uq_legal_acceptances_user_kind_version','uq_legal_acceptances_user_op_key',
                     'fk_legal_acceptances_document');
  if v_n <> 3 then
    raise exception '#621 tail: legal_acceptances carries % of its 3 named constraints', v_n
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_src from pg_constraint
   where conrelid='clara.legal_acceptances'::regclass and conname='fk_legal_acceptances_document';
  if position('(kind, version, body_sha256) REFERENCES clara.legal_documents(kind, version, body_sha256)' in v_src)=0 then
    raise exception '#621 tail: an acceptance is not bound to the document BYTES (%)', v_src
      using errcode='CLR10';
  end if;
  -- Append-only, on both relations, plus the transition trigger.
  select count(*)::int into v_n from pg_trigger
   where tgrelid in ('clara.legal_documents'::regclass,'clara.legal_acceptances'::regclass)
     and not tgisinternal;
  if v_n <> 5 then
    raise exception '#621 tail: the cohort carries % non-internal triggers, expected 5 (documents: transition + no-delete + no-truncate; acceptances: append-only + no-truncate)', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE DOORS: present, PUBLIC-revoked, clara_authenticated-granted, and reachable by NO
  --     other application role -- an agent or wake lane must not be able to accept law.
  foreach v_sig in array array[
      'clara.accept_legal_document(text,integer,text,text)',
      'clara.publish_legal_document(text,text,text,text,timestamptz,text)',
      'clara.get_current_legal_documents()',
      'clara.sign_dpa(text,bytea,text)',
      'clara.get_current_dpa_document()',
      'clara.get_own_dpa_signature()',
      'clara.open_checkout_intent(uuid,bytea,text)',
      'clara.claim_paid_firm(uuid,text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#621 tail: % did not land', v_sig using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('public', v_sig, 'execute') then
      raise exception '#621 tail: % is PUBLIC-executable', v_sig using errcode='CLR10';
    end if;
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '#621 tail: clara_authenticated cannot execute %', v_sig using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_wake_interactive', v_sig, 'execute') then
      raise exception '#621 tail: % is reachable by a role that must not hold it', v_sig
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid=v_sig::regprocedure and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#621 tail: % is not clara_fn_owner-owned with a pinned search_path', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- The two write doors are SECURITY DEFINER; the reads are too (they cross the owner-only RLS).
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara.accept_legal_document(text,integer,text,text)'::regprocedure,
                   'clara.publish_legal_document(text,text,text,text,timestamptz,text)'::regprocedure,
                   'clara.get_current_legal_documents()'::regprocedure)
     and p.prosecdef;
  if v_n <> 3 then
    raise exception '#621 tail: a new door is not SECURITY DEFINER (% of 3)', v_n using errcode='CLR10';
  end if;

  -- 4 · THE ACCEPTANCE DOOR'S OWN ROSTER, read from the stripped body.
  v_src := v_bodies ->> 'clara.accept_legal_document(text,integer,text,text)';
  foreach v_sig in array array['no_actor','unknown_actor','agent_actor','invalid_op_key',
      'invalid_kind','op_key_conflict','hash_mismatch','not_published','stale_version',
      'already_accepted'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#621 tail: accept_legal_document raises no %', v_sig using errcode='CLR10';
    end if;
  end loop;
  v_src := v_bodies ->> 'clara.publish_legal_document(text,text,text,text,timestamptz,text)';
  foreach v_sig in array array['not_operator_firm','identical_body','empty_body','op_key_conflict',
      'operation_in_flight','clara._reserve_op','clara._finish_op'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#621 tail: publish_legal_document carries no %', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- …and its authority is the approve_firm_registration predicate, BYTE-FOR-BYTE.
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
     or position('from clara.firms f where f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0 then
    raise exception '#621 tail: the publish door does not carry the operator-owner predicate verbatim'
      using errcode='CLR10';
  end if;

  -- 5 · THE WRAPPERS DELEGATE, and none of them reaches the old relations any more.
  v_src := v_bodies ->> 'clara.sign_dpa(text,bytea,text)';
  if position('clara.accept_legal_document(' in v_src) = 0
     or position('clara.legal_documents' in v_src) = 0 then
    raise exception '#621 tail: sign_dpa does not delegate to the new door' using errcode='CLR10';
  end if;
  if position('signature_id' in v_src) = 0 or position('signed_at' in v_src) = 0 then
    raise exception '#621 tail: sign_dpa lost 0163''s wire shape' using errcode='CLR10';
  end if;
  if position('clara.dpa_signatures' in v_src) > 0 or position('clara.dpa_documents' in v_src) > 0 then
    raise exception '#621 tail: sign_dpa still reaches the retired relations' using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara.get_current_dpa_document()';
  if position('clara.legal_documents' in v_src) = 0 or position('status=''published''' in v_src) = 0
     or position('clara.dpa_documents' in v_src) > 0 then
    raise exception '#621 tail: get_current_dpa_document does not read the published legal document'
      using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara.get_own_dpa_signature()';
  if position('clara.legal_acceptances' in v_src) = 0 or position('clara.dpa_signatures' in v_src) > 0 then
    raise exception '#621 tail: get_own_dpa_signature still reads the retired evidence table'
      using errcode='CLR10';
  end if;

  -- 6 · THE TWO MONEY-SURFACE RECUTS: the new arm landed AND no 0163 arm was dropped.
  v_src := v_bodies ->> 'clara.open_checkout_intent(uuid,bytea,text)';
  if position('legal_not_accepted' in v_src) = 0 or position('''missing''' in v_src) = 0
     or position('terms_version' in v_src) = 0 then
    raise exception '#621 tail: open_checkout_intent carries no both-kinds legal arm' using errcode='CLR10';
  end if;
  if position('clara.legal_acceptances' in v_src) = 0 or position('clara.dpa_signatures' in v_src) > 0 then
    raise exception '#621 tail: open_checkout_intent still reads the retired evidence table'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['too many firm registrations from this location today',
      'this registration is already paid','no current billing plan is configured',
      'no stripe price is mapped for this plan','an origin digest is required',
      'not your registration request','registration_rate_events','for update'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#621 tail: the open_checkout_intent recut dropped a 0163 arm (%)', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  v_src := v_bodies ->> 'clara.claim_paid_firm(uuid,text)';
  if position('legal_not_accepted' in v_src) = 0
     or position('v_terms_version is not null' in v_src) = 0 then
    raise exception '#621 tail: claim_paid_firm carries no pinned-terms arm with its legacy-NULL carve-out'
      using errcode='CLR10';
  end if;
  if position('clara.legal_acceptances' in v_src) = 0 or position('clara.dpa_signatures' in v_src) > 0 then
    raise exception '#621 tail: claim_paid_firm still reads the retired evidence table' using errcode='CLR10';
  end if;
  foreach v_sig in array array['a verified email claim is required',
      'no completed payment for this registration','clara._create_firm_core',
      'firm_registration.paid','consumed_dpa_signature','for update'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#621 tail: the claim_paid_firm recut dropped a 0163 arm (%)', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  v_src := v_bodies ->> 'clara._tf_checkout_intents_session_stamp()';
  if position('new.terms_version' in v_src) = 0 or position('old.terms_version' in v_src) = 0 then
    raise exception '#621 tail: the session-stamp trigger does not freeze the terms pin' using errcode='CLR10';
  end if;
  -- …AND IT IS ARMED AGAIN. §D disables it for the width of the mapping UPDATE; a file that left
  -- it disabled would hand the estate a silently rewritable money-surface row.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.checkout_intents'::regclass
     and tgname='t_checkout_intents_session_stamp' and tgenabled='O';
  if v_n <> 1 then
    raise exception '#621 tail: t_checkout_intents_session_stamp is not enabled after the backfill'
      using errcode='CLR10';
  end if;

  -- 7 · NOTHING IN THE WHOLE SCHEMA WRITES THE RETIRED RELATIONS, and they carry no writer grant.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and (position('insert into clara.dpa_signatures' in lower(p.prosrc))>0
       or position('update clara.dpa_signatures'      in lower(p.prosrc))>0
       or position('delete from clara.dpa_signatures' in lower(p.prosrc))>0
       or position('insert into clara.dpa_documents'  in lower(p.prosrc))>0
       or position('update clara.dpa_documents'       in lower(p.prosrc))>0
       or position('delete from clara.dpa_documents'  in lower(p.prosrc))>0);
  if v_n <> 0 then
    raise exception '#621 tail: % clara function(s) still WRITE the retired DPA relations', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants g
   where g.table_schema='clara' and g.table_name in ('dpa_documents','dpa_signatures')
     and g.grantee<>'clara_fn_owner'
     and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES');
  if v_n <> 0 then
    raise exception '#621 tail: the retired DPA relations carry % writer grant(s)', v_n using errcode='CLR10';
  end if;

  -- 8 · THE BACKFILL, ROW FOR ROW, AND THE PLACEHOLDER'S DEMOTION.
  v_placeholder := encode(sha256(convert_to(
    'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
    'UTF8')),'hex');
  select count(*)::int into v_n from clara.dpa_documents d
   where not exists (select 1 from clara.legal_documents l
                      where l.kind='dpa' and l.legacy_version=d.version
                        and l.body_sha256=encode(d.body_sha256,'hex'));
  if v_n <> 0 then
    raise exception '#621 tail: % DPA document(s) did not carry over BY THEIR BYTES', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.dpa_signatures s
   where not exists (select 1 from clara.legal_acceptances a
                      where a.id=s.id and a.kind='dpa' and a.user_id=s.user_id
                        and a.body_sha256=encode(s.body_sha256,'hex')
                        and a.accepted_at=s.signed_at);
  if v_n <> 0 then
    raise exception '#621 tail: % DPA signature(s) did not carry over with their id, bytes and instant', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.legal_documents l
   where l.body_sha256=v_placeholder and l.status<>'draft';
  if v_n <> 0 then
    raise exception '#621 tail: the 0158 placeholder is not a DRAFT -- it could be accepted as final'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.legal_documents l
   where l.body_sha256=v_placeholder and l.status='draft';
  if v_n <> 1 then
    raise exception '#621 tail: the 0158 placeholder is not present exactly once as a draft (found %)', v_n
      using errcode='CLR10';
  end if;
  -- NO LEGAL TEXT IS SEEDED BY THIS FILE. `terms` is empty, and the only `dpa` rows are 0158's.
  select count(*)::int into v_n from clara.legal_documents l where l.kind='terms';
  if v_n <> 0 then
    raise exception '#621 tail: % terms document(s) exist -- this file seeds NO legal text', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.legal_documents;
  if v_n <> (select count(*)::int from clara.dpa_documents) then
    raise exception '#621 tail: legal_documents holds % row(s) against % carried DPA document(s)',
      v_n, (select count(*) from clara.dpa_documents) using errcode='CLR10';
  end if;

  -- 9 · BOTH PINS ON THE INTENT, each a REAL foreign key onto (kind, version).
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='checkout_intents'
     and column_name='dpa_version' and data_type='integer' and is_nullable='NO';
  if v_n <> 1 then
    raise exception '#621 tail: checkout_intents.dpa_version is not a NOT NULL integer' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='checkout_intents'
     and column_name='terms_version' and data_type='integer' and is_nullable='YES';
  if v_n <> 1 then
    raise exception '#621 tail: checkout_intents.terms_version is not a nullable integer' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.checkout_intents'::regclass
     and conname in ('fk_checkout_intents_dpa_document','fk_checkout_intents_terms_document')
     and confrelid='clara.legal_documents'::regclass;
  if v_n <> 2 then
    raise exception '#621 tail: the intent carries % of its 2 legal-document FKs', v_n using errcode='CLR10';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid='clara.checkout_intents'::regclass
                and confrelid='clara.dpa_documents'::regclass) then
    raise exception '#621 tail: the intent still references the retired dpa_documents' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.firm_registration_payments'::regclass
     and conname='fk_frp_consumed_legal_acceptance'
     and confrelid='clara.legal_acceptances'::regclass;
  if v_n <> 1 then
    raise exception '#621 tail: consumed_dpa_signature was not repointed at clara.legal_acceptances'
      using errcode='CLR10';
  end if;

  raise notice '#621 tail: OK -- clara.legal_documents and clara.legal_acceptances exist under forced RLS with ONE clara_fn_owner policy and ZERO application-role grants, the one-published-per-kind partial unique index, a DB-recomputed body digest, the draft->published->superseded transition trigger and an acceptance bound to the document BYTES by composite FK; clara.accept_legal_document, clara.publish_legal_document and clara.get_current_legal_documents are SECURITY DEFINER, clara_fn_owner-owned, search_path-pinned, PUBLIC-revoked and clara_authenticated-ONLY (no agent, runtime or wake role reaches them), and each raises its whole typed roster; the publish door carries the approve_firm_registration operator-owner predicate verbatim and reserves through op_receipts; clara.sign_dpa, clara.get_current_dpa_document and clara.get_own_dpa_signature keep their signatures and grants and delegate onto kind=dpa without touching the retired relations; clara.open_checkout_intent and clara.claim_paid_firm refuse legal_not_accepted naming the missing kinds, pin and re-check BOTH versions (terms NULL on a pre-0185 intent passing deliberately), and keep every 0163 arm; every 0158 document and signature carried over by its BYTES -- the signature keeping its own id, which firm_registration_payments.consumed_dpa_signature now references in clara.legal_acceptances -- the 0158 placeholder is a DRAFT and therefore unacceptable, and this file seeds NO legal text of either kind.';
end
$w621_tail$;
