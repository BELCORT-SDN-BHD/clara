-- 0182_journal_work_evidence — #634 (refresh spec #612, journey C3): OPTIONAL AND LATE EVIDENCE
-- for the expert journal path, without ever rewriting a posted entry.
-- =====================================================================================
-- Spec of record: issue #612 (Implementation Decisions §1, §2, §4, §5), ticket #634, journey C3.
-- Domain words: CONTEXT.md — "Accounting work", "Accounting basis", "Operation receipt",
-- "Posted journal entry". Builds on 0178 (the accounting-work lane) and touches nothing 0179
-- created.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A journal Work may now name ONE client document as the
-- evidence behind its entry — at admission, at commit, or LATE against an already-posted entry —
-- and all three doors write the SAME append-only link relation under the SAME Work identity, so
-- one document can never back two posted entries and a retry can never post twice.
--
-- =====================================================================================
-- THE ONE MEASUREMENT THAT SHAPES EVERYTHING BELOW: A POSTED ENTRY IS IMMUTABLE, SO EVIDENCE
-- CANNOT LIVE ON IT.
--
-- The obvious design is `clara.journal_entries.document_id`. It is not available to this ticket,
-- and the reason is measured rather than stylistic:
--
--   1. `clara._tf_entry_immutable` (last cut at 0016_a21_compliance_watch.sql:4943) allows an
--      approved -> approved UPDATE to move EXACTLY three columns —
--      `array['reversed_by','reversal_reason','updated_at']` — and additionally REQUIRES
--      `new.reversed_by is not null`. A late attachment that set `document_id` on a posted entry
--      would raise CLR08 'illegal change to entry'. There is no lawful bump of
--      `revision_token` on an approved row either, for the same reason. LAW 6 (reverse, never
--      rewrite) is the whole point of that trigger, and this file does not widen it.
--   2. Even at INSERT time the column cannot be set alone. `ck_je_doc_pair` pins
--      `(document_id is null) = (source_doc_sha256 is null)` and `ck_je_document_filing_pair`
--      pins `(document_id is null) = (filing_id is null)` (measured on a live catalog at
--      frontier 0179). Setting the trio is the DOCUMENT CODING lane's own act:
--      `clara._draft_entry_core` reaches it through `clara._active_document_filing` and
--      `clara.assert_client_resolved`, and 0178's header already records why this lane must not
--      mint a client resolution it has no subject for. Setting the trio on the commit path only
--      would ALSO make one product concept live in two relations depending on which door
--      recorded it — and the late path could not join it.
--   3. The estate already has the right posture for this: `clara.entry_evidence`
--      (0009_coding_floor.sql:883) records evidence ABOUT an entry in an append-only table
--      BESIDE it, never inside it. That exact table is unusable here only because
--      `extraction_id` is NOT NULL — extraction and typed facts are #624's scope, and a manual
--      JV backed by a filed PDF has no extraction to cite and must not invent one.
--
-- So evidence is recorded in a NEW append-only relation, `clara.entry_evidence_links`, written by
-- BOTH entry points with the same shape. That symmetry is not a convenience: #634's acceptance
-- line says the source-backed, no-attachment and late-attachment entry points "share stable
-- intent/Work identity", and one relation with one uniqueness index is what makes that true of
-- the DATA rather than merely of the code.
--
-- THE SECOND MEASUREMENT: THE LATE ATTACHMENT WRITES NO `clara.operation_receipts` ROW.
-- That table (0178:411-441) is structurally an AGENT-RUN receipt: `task_id uuid NOT NULL
-- references clara.agent_tasks(id)`, `run_id text NOT NULL`, `bundle_digest text NOT NULL`,
-- `via_wake_kind text NOT NULL`. `clara.attach_entry_evidence` is a HUMAN door reached through
-- PostgREST — it has no task, no workflow run, no bundle and no wake kind, and inventing any of
-- the four would be fabricating provenance, which is the exact class of act 0178's header
-- forbids. The link row IS the act's durable record: it names the entry, the document, the Work,
-- the acting human, the instant and the logical operation id, it is append-only by trigger, and
-- the act's REPLAY guarantee rides `clara._reserve_op`/`clara._finish_op` on `p_op_key` exactly
-- as every other human door's does. A retry therefore reads the stored answer and cannot repeat.
-- (`clara._work_committed_receipt` also assumes at most one committed receipt per Work; a second
-- one would make its `order by created_at limit 1` a coin toss on a tie.)
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: A REVERSAL MUST RELEASE THE DOCUMENT, OR LAW 6 STRANDS IT FOREVER.
--
-- Reviewed finding, and it is an accounting invariant rather than a nicety. LAW 6 says a wrong
-- entry is REVERSED and a corrected one is posted in its place. Without the arm below, the
-- reversed entry's link keeps holding the document under
-- `uq_entry_evidence_links_document`: the corrected JV citing the SAME invoice is refused
-- `source_already_posted` at admission (naming the entry that is no longer in the books), the
-- late door refuses it too, and the firm's own invoice is unusable for ever. Measured against
-- the estate's other lane, which does NOT have the defect: the DOCUMENT-CODING arm of
-- `clara._document_posting_entry` already asks for an approved and NOT-REVERSED entry, because
-- a reversed coding is lawfully re-codable.
--
-- THE FIX DOES NOT TOUCH `clara.reverse_entry` (0009:1697), and that is deliberate: it is a live
-- writer with sixteen sibling reversal writers across the estate (`set reversed_by =` appears in
-- 0004, 0005, 0007, 0009, 0011, 0015, 0016, 0017, 0027, 0029, 0035, 0037 …), and an arm added to
-- one of them would be absent from the other fifteen. So the release rides a TRIGGER on the
-- column itself — `t_entry_evidence_release`, AFTER UPDATE OF `reversed_by` — which every one of
-- those writers passes through, including the `approve_entry` path that stamps `reversed_by` on
-- the original when a reversal DRAFT is later approved.
--
-- THE LINK ROW IS NOT DELETED AND NOT RE-POINTED. It is STAMPED `released_at`, so the chain
-- stays inspectable: `clara.list_entry_links` still reports the reversed entry's document, with
-- the instant it stopped being the live binding. The table's append-only trigger is widened to
-- admit EXACTLY that one column moving from null to non-null — the `clara._tf_entry_immutable`
-- allowset precedent, applied to this table with a one-column allowset of its own — and the
-- document uniqueness becomes PARTIAL on `released_at is null`. The ENTRY uniqueness stays
-- UNCONDITIONAL: an entry never gains a second source, released or not.
--
-- AND THE LATE DOOR REFUSES A REVERSED ENTRY (CLR13 `entry_reversed`). Without that arm the hole
-- reopens from the other side: a link born against an already-reversed entry would never be
-- released (the reversal UPDATE that fires the trigger has already happened) and would hold the
-- document for ever. Evidence attaches to a LIVE posted entry; the correction is where the source
-- belongs, and the refusal names the entry that replaced this one.
--
-- =====================================================================================
-- DEPLOY ORDER AND WRITE QUIESCENCE. This file RECUTS TWO LIVE WRITER BODIES —
-- `clara.admit_journal_work` and `clara._record_journal_entry_core` — with full-body
-- `create or replace` copies of their 0178 text plus the arms named below. A call already
-- executing finishes on its previous body, so the apply rides the repository's WRITER QUIESCENCE
-- WINDOW: the runtime is STOPPED for the hosted apply, exactly as 0178's own replacement of
-- `clara._tf_assert_agent_post_receipt` was. Both prior bodies are pinned by prosrc sha-256 at
-- frontier 0179 in §0 below, so a drifted body is REFUSED rather than silently overwritten.
--
-- CONSUMER-FIRST: none owed. Every new object is NEW; the two recuts are STRICT ADDITIONS on the
-- documentless path — a Work whose `source_refs` names no document reaches the same effects, in
-- the same order, and no deployed consumer sends a `document` source ref until the runtime route
-- that can produce one ships.
--
-- THREE PAYLOADS DO GAIN A KEY on that path, and saying "byte-for-byte" of them would be false
-- (reviewed finding; measured on the rig by `w634.commit.documentless`): `accounting_work.result`,
-- the `clara._audit` payload and `clara._finish_op`'s stored result each now carry
-- `document_id: null` for a documentless Work, because they build it from `v_source_document`
-- unconditionally. That is an ADDITIVE key with a null value in three JSONB records nobody keys
-- off, and it is stated rather than hidden. The ONE payload that IS byte-identical is the one a
-- wall reads: `clara.operation_receipts.effects` gains `document_id` only when there is a
-- document (`t_je_agent_post_receipt` and the outcome-shape CHECK read that column), and
-- `w634.commit.documentless` pins its absence.
--
-- The other behaviour that changes for an EXISTING Work is the replay comparison in
-- `admit_journal_work`: a replay whose source refs canonicalise differently is now a typed
-- `intent_payload_conflict` instead of a silent replay. Chat-lane refs canonicalise to
-- `{"kind":"chat_task"}` with their `task_id`/`session_id` DROPPED precisely so the frozen
-- `chatTurn.v18` lane's replays keep replaying (a re-run turn legitimately carries a different
-- task id, and that is not a different accounting intent).
--
-- ROLLBACK is a NEW append-only migration that restores the two prior bodies and drops nothing.
--
-- =====================================================================================
-- WHY THE INTENT DIGEST IS NOT RE-CUT. Measured: `clara._journal_basis_digest` (0178:822) hashes
-- `clara._journal_basis_canonical(p_basis)` and NOTHING ELSE — `source_refs` is not folded into
-- it. Changing that formula would silently invalidate every `accounting_work.basis_digest`
-- already stored (each computed under the old formula), turning every replay of an existing Work
-- into a false conflict. So the digest stays exactly as it is, and the evidence half of the
-- intent payload is compared DIRECTLY, canonical-form to canonical-form, on the replay path.
-- Two payload halves, two comparisons, one refusal token (`intent_payload_conflict`).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE ADDS.
--
-- clara.admit_journal_work        (in addition to 0178's roster, unchanged)
--   CLR10 invalid_source_ref      + field `source_refs[N]` (1-BASED, the estate's `with
--                                 ordinality` convention — see 0178's header) + constraint in
--                                 {object, kind, document_id, uuid, at_most_one_document,
--                                  not_filed}
--   CLR13 source_already_posted   + document_id + entry_id + conflict:true. An attachment
--                                 conflict opens impact/correction; it NEVER becomes a second
--                                 effect.
--   CLR10 intent_payload_conflict now ALSO raised when the basis matches but the canonical
--                                 source refs differ (work_id in detail, as before).
--
-- clara._record_journal_entry_core
--   CLR13 source_conflict         + document_id (+ entry_id when another entry now backs it)
--                                 + constraint in {not_filed, already_posted}. Raised AFTER the
--                                 idempotency reservation, so a REPLAY of an already-committed
--                                 identity still returns its receipt rather than a refusal.
--
-- clara.attach_entry_evidence
--   CLR10 invalid_op_key          blank/whitespace op key (BEFORE any reservation)
--   CLR11 entry_not_found         unknown entry, or an entry outside the caller's firm (no oracle)
--   CLR13 entry_not_approved      + status; evidence attaches to a POSTED entry only
--   CLR13 entry_reversed          + entry_id + reversed_by; evidence attaches to a LIVE posted
--                                 entry, and the refusal names the correction that replaced this
--                                 one (see THE THIRD MEASUREMENT above)
--   CLR06 stale_revision          + revision_token; the caller's view is not the current row
--   CLR10 invalid_source_ref      + constraint in {uuid, not_filed}; the document is not an
--                                 active, byte-verified filing of THIS entry's client
--   CLR13 evidence_already_attached + document_id (the one already attached; the SAME document
--                                 replays instead)
--   CLR13 source_already_posted   + document_id + entry_id + conflict:true
--   CLR04 (clara._human_ctx's own) no actor / no membership / below bookkeeper
--
-- clara.list_entry_links
--   CLR11 client_not_found        unknown client, or a client outside the caller's firm
--   CLR10 too_many_entries        + limit; the batch cap
--   CLR04 (clara._human_ctx's own)
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w634_pre$
declare v_sha text; n text;
begin
  -- 0.1 · the prerequisites this file calls, in exact regprocedure form.
  foreach n in array array[
    'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
    'clara._hash(jsonb)', 'clara._human_ctx(integer)', 'clara.role_rank(text)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara.jwt_firm()',
    'clara._assert_journal_basis(jsonb)', 'clara._journal_basis_canonical(jsonb)',
    'clara._journal_basis_digest(jsonb)', 'clara._validate_entry_lines(uuid,jsonb)',
    'clara._assert_balanced(uuid)', 'clara.agent_user_id()', 'clara._wake_task_id()',
    'clara._tf_append_only()', 'clara._tf_no_truncate()',
    'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
    'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#634 prestate: prerequisite absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the relations this file reads or references.
  foreach n in array array['clara.accounting_work', 'clara.operation_receipts',
    'clara.journal_entries', 'clara.documents', 'clara.document_filings', 'clara.users',
    'clara.firms', 'clara.clients'] loop
    if to_regclass(n) is null then
      raise exception '#634 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.3 · the two journal_entries CHECKs that make `document_id` unavailable to this lane are
  -- STILL THERE. If a later migration retires them, the argument in this file's header stops
  -- being true and the design must be re-derived rather than quietly inherited.
  if not exists (select 1 from pg_constraint c where c.conrelid='clara.journal_entries'::regclass
                   and c.conname='ck_je_doc_pair')
     or not exists (select 1 from pg_constraint c where c.conrelid='clara.journal_entries'::regclass
                   and c.conname='ck_je_document_filing_pair') then
    raise exception '#634 prestate: ck_je_doc_pair / ck_je_document_filing_pair are not both present -- re-derive this file''s evidence-relation argument against the live catalog'
      using errcode='CLR10';
  end if;
  -- …and the posted-history wall still refuses an approved -> approved column move outside the
  -- reversal pair. Measured on the body itself, because that is the sentence the header cites.
  select p.prosrc into n from pg_proc p where p.oid='clara._tf_entry_immutable()'::regprocedure;
  if position('array[''reversed_by'',''reversal_reason'',''updated_at'']' in n) = 0 then
    raise exception '#634 prestate: clara._tf_entry_immutable no longer carries the three-column approved->approved allowset this file reasons about'
      using errcode='CLR10';
  end if;

  -- 0.4 · PARTIAL BIRTH — nothing this file creates may already exist.
  if to_regclass('clara.entry_evidence_links') is not null then
    raise exception '#634 partial birth: clara.entry_evidence_links already exists' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
      and p.proname in ('attach_entry_evidence','list_entry_links','_journal_source_refs_canonical',
        '_assert_journal_source_refs','_journal_source_document','_document_posting_entry',
        '_journal_document_filed','_tf_entry_evidence_link_append_only',
        '_tf_entry_evidence_release')) then
    raise exception '#634 partial birth: one or more new function names already resolve' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_trigger t where t.tgname = 't_entry_evidence_release'
               and t.tgrelid = 'clara.journal_entries'::regclass and not t.tgisinternal) then
    raise exception '#634 partial birth: t_entry_evidence_release already sits on clara.journal_entries'
      using errcode='CLR10';
  end if;

  -- 0.5 · THE TWO LIVE BODIES THIS FILE REPLACES, pinned by prosrc sha-256 at frontier 0179.
  -- A drifted body is REFUSED rather than silently overwritten: the recuts below are FULL-BODY
  -- COPIES of these exact texts plus this file's arms, and a different text may carry an arm
  -- this file would delete.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
    where p.oid='clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha <> 'e4819c306385dbd9d9e3595fc1a9d3ddb01f02a2e0de33054dfe5649eba5aae2' then
    raise exception '#634 prestate: clara.admit_journal_work has DRIFTED from the pinned 0178 body (sha %) -- re-derive the recut against the live body before applying', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
    where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha <> '15e2cc6295b9f19b50ce91082e3011dadfe42843fe06d7c4d0ac3a7af6a73769' then
    raise exception '#634 prestate: clara._record_journal_entry_core has DRIFTED from the pinned 0178 body (sha %) -- re-derive the recut against the live body before applying', v_sha using errcode='CLR10';
  end if;

  raise notice '#634 prestate: clean -- no evidence-link surface exists, the posted-history wall and both journal_entries document CHECKs are at the shapes this file reasons about, and both recut bodies are at their pinned 0178 text.';
end
$w634_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.entry_evidence_links — THE ONE EVIDENCE RELATION FOR THIS LANE.
--
-- APPEND-ONLY by trigger: a link is never edited and never deleted, exactly like
-- `clara.operation_receipts`. Re-pointing a document after a reversal is #646's scope (source
-- correction) and is deliberately NOT reachable here.
--
-- `uq_entry_evidence_links_document` is the STRUCTURAL half of "one LIVE document binding backs
-- at most one posted entry": the two doors below refuse it by name first (CLR13
-- `source_already_posted`, so the human gets the conflicting entry id and a route to
-- impact/correction), and this index makes a second row impossible even under a genuine race and
-- even if a future writer forgets to ask. Two independent mechanisms, because "the writer always
-- checks" is a property of code and this is a property of the data — 0178 §B's own reasoning,
-- applied to the same shape of claim. It is PARTIAL on `released_at is null` (see THE THIRD
-- MEASUREMENT in this file's header): a reversed entry's binding is released, and the corrected
-- JV may cite the same invoice.
--
-- BOTH DOORS ALSO CATCH THE INDEX'S OWN `unique_violation` and re-raise the SAME typed refusal
-- they raise from their pre-checks. Reviewed finding: without it a genuine race — two sessions
-- past their pre-checks, the second blocked on the index — escaped as a raw 23505 with no
-- `detail.reason`, which every classifier above (the runtime's `WORK_MAPPED_CODES`, the web's
-- `parseReasonToken`) reads as an unclassified 500 rather than as the conflict it is. A refusal
-- must have ONE spelling however it was detected.
--
-- `work_id` is NULLABLE on purpose: a late attachment against an entry that did NOT come from an
-- accounting Work (a document-lane entry, a human manual entry from an older door) is a lawful
-- act, and a fabricated Work id would be worse than an honest NULL. `logical_op_id` is present
-- either way, and it is the WHOLE STRING every consumer compares — nothing splits it on ':'
-- (0178 §A's parser-free round trip, kept).
-- =====================================================================================
create table clara.entry_evidence_links (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null,
  entry_id       uuid        not null,
  document_id    uuid        not null,
  work_id        uuid,
  receipt_id     uuid        references clara.operation_receipts(id),
  logical_op_id  text        not null check (logical_op_id !~ '^\s*$'),
  attached_via   text        not null check (attached_via in ('work_commit','late_attachment')),
  attached_by    uuid        not null references clara.users(id),
  attached_at    timestamptz not null default now(),
  -- #634 (reviewed finding) · THE ONE COLUMN THAT EVER MOVES, and only ever from NULL to an
  -- instant, stamped by `t_entry_evidence_release` when the entry this link points at is
  -- REVERSED. It is not a deletion and not a re-pointing: the row keeps naming the document that
  -- backed the entry, and `clara.list_entry_links` keeps reporting it, so the correction chain
  -- stays inspectable. What it releases is the DOCUMENT'S availability — see THE THIRD
  -- MEASUREMENT in this file's header, and `uq_entry_evidence_links_document`'s predicate.
  released_at    timestamptz,
  constraint fk_entry_evidence_links_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_entry_evidence_links_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_entry_evidence_links_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint fk_entry_evidence_links_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- AT MOST ONE DOCUMENT PER ENTRY in this ticket (multi-document evidence is out of scope).
  constraint uq_entry_evidence_links_entry unique (entry_id),
  constraint uq_entry_evidence_links_logical_op unique (logical_op_id),
  -- A commit-path link is BORN INSIDE the posting transaction and names its receipt; a late one
  -- has no operation receipt to name (see the header's second measurement).
  constraint ck_entry_evidence_links_receipt check (
    (attached_via = 'work_commit' and receipt_id is not null and work_id is not null)
    or (attached_via = 'late_attachment' and receipt_id is null))
);
comment on table clara.entry_evidence_links is
  '#634: the ONE evidence relation for the accounting-work journal lane -- which client document '
  'backs which posted entry, written identically by the commit path and by the late door '
  '(clara.attach_entry_evidence). Append-only apart from released_at (null -> instant, stamped by '
  't_entry_evidence_release when the entry is reversed); posted entries are never rewritten '
  '(clara._tf_entry_immutable). uq_entry_evidence_links_document is the structural half of "one '
  'LIVE document binding backs at most one posted entry".';

create unique index uq_entry_evidence_links_document on clara.entry_evidence_links(document_id)
  where released_at is null;
create index ix_entry_evidence_links_client on clara.entry_evidence_links(client_id, attached_at desc);
create index ix_entry_evidence_links_work on clara.entry_evidence_links(work_id) where (work_id is not null);

alter table clara.entry_evidence_links enable row level security;
alter table clara.entry_evidence_links force row level security;
create policy p_entry_evidence_links_owner on clara.entry_evidence_links
  for all to clara_fn_owner using (true) with check (true);
-- The estate carries no client-access table: client access IS firm membership, and
-- clara.journal_entries' own human read policy is `firm_id = clara.jwt_firm()` with no per-client
-- clause. A narrower predicate here would hide a link from a member who can already read the
-- entry it points at; a wider one would be a new hole. 0178 §A's reasoning, unchanged.
create policy p_entry_evidence_links_read on clara.entry_evidence_links
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.entry_evidence_links to clara_authenticated;

-- THE APPEND-ONLY BELT, WITH A ONE-COLUMN ALLOWSET. The generic `clara._tf_append_only` (0003)
-- refuses every UPDATE, and this table needs exactly one: `released_at`, NULL -> an instant, and
-- nothing else on the row moving with it. That is the `clara._tf_entry_immutable` shape
-- (0016:4943) — an allowset plus `(to_jsonb(new) - allowed) is distinct from (to_jsonb(old) -
-- allowed)` — narrowed to one column and one direction, so a "release" can never be a re-point,
-- an un-release or a quiet edit of the document behind a posted entry. DELETE stays refused
-- outright: a link is the durable record of an act.
create function clara._tf_entry_evidence_link_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% is append-only', tg_table_name using errcode = 'CLR08';
  end if;
  if old.released_at is not null then
    raise exception '% is append-only (a released link is final)', tg_table_name
      using errcode = 'CLR08';
  end if;
  if new.released_at is null then
    raise exception '% is append-only (released_at is the only column that may move, and only to an instant)',
      tg_table_name using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - 'released_at') is distinct from (to_jsonb(old) - 'released_at') then
    raise exception '% is append-only (no column but released_at may move)', tg_table_name
      using errcode = 'CLR08';
  end if;
  return new;
end $$;
revoke all on function clara._tf_entry_evidence_link_append_only() from public;

create trigger t_entry_evidence_links_append_only before update or delete on clara.entry_evidence_links
  for each row execute function clara._tf_entry_evidence_link_append_only();
create trigger t_entry_evidence_links_no_truncate before truncate on clara.entry_evidence_links
  for each statement execute function clara._tf_no_truncate();

-- THE RELEASE ITSELF — on the COLUMN, not in a writer. `set reversed_by =` has sixteen call
-- sites across the estate (0004, 0005, 0007, 0009, 0011, 0015, 0016, 0017, 0027, 0029, 0035,
-- 0037 …): `clara.reverse_entry`'s own straight-through arm, and every `approve_entry`-class
-- path that stamps the ORIGINAL when a reversal DRAFT is later approved. A trigger on the column
-- is the only place all sixteen pass through, and it is why this file recuts none of them.
--
-- `now()` IS A BARE CLOCK READ and this function therefore joins the 0042 arm-(D) roster
-- (`packages/db/tests/x42-s5-helpers.mjs`, gated on this migration's stem). It stamps an INSTANT
-- and derives no DATE from it — the same lawful use every other `_tf_*` on that roster makes.
create function clara._tf_entry_evidence_release() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  update clara.entry_evidence_links set released_at = now()
   where entry_id = new.id and released_at is null;
  return null;
end $$;
revoke all on function clara._tf_entry_evidence_release() from public;

-- AFTER, and gated on the transition rather than on the column list alone: `update ... set
-- reversed_by = ...` names the column even when it writes the value it already had, and a link
-- must be released exactly once, at the moment the entry stops being the live one.
create trigger t_entry_evidence_release after update of reversed_by on clara.journal_entries
  for each row when (old.reversed_by is null and new.reversed_by is not null)
  execute function clara._tf_entry_evidence_release();

-- =====================================================================================
-- §B  THE SOURCE-REF PREDICATES. Ungranted; shared by admission, by commit and by the late door
-- so the three can never drift apart (0178 §D's rule for the basis, applied to the evidence).
-- =====================================================================================

-- Is this document an ACTIVE, byte-verified filing of this client, in this firm?
--
-- "Filed to the client" is the estate's own notion of a document belonging to a client:
-- `clara.documents` has no client column and no `retired_at` — the FILING carries both
-- (`clara.document_filings.client_id`, `.retired_at`), and `uq_document_filing_active` admits at
-- most one live filing per (document, client). `bytes_verified_at is not null` is the custody
-- floor `clara._active_document_filing` (0007:982) already applies before any evidence is
-- believed; an unverified upload is not evidence, and this lane must not be the one place that
-- forgets that.
create function clara._journal_document_filed(p_firm uuid, p_client uuid, p_document uuid)
  returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.document_filings f
      join clara.documents d on d.id = f.document_id and d.firm_id = f.firm_id
     where f.document_id = p_document and f.client_id = p_client and f.firm_id = p_firm
       and f.retired_at is null and d.bytes_verified_at is not null);
$$;
revoke all on function clara._journal_document_filed(uuid,uuid,uuid) from public;

-- The canonical form of a source-ref array: what makes two admissions the SAME evidence claim.
--
-- `chat_task` refs collapse to `{"kind":"chat_task"}` — their `task_id`/`session_id` are RUN
-- identifiers, and a re-run chat turn legitimately carries different ones while asking for the
-- very same accounting act. Folding them into the comparison would turn every honest replay from
-- the frozen chatTurn.v18 lane into a false `intent_payload_conflict`. A `document` ref collapses
-- to its uuid, lower-cased through the uuid type itself so text casing can never split one
-- document into two claims. Order is preserved because the refs are a list the caller wrote.
create function clara._journal_source_refs_canonical(p_source_refs jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select coalesce(jsonb_agg(
           case when x.elem->>'kind' = 'document'
                -- lower+trim rather than a ::uuid cast: this function also reads rows admitted
                -- BEFORE this migration, and a cast that raised would make an unrelated replay
                -- unanswerable. The element-level assertion above is what guarantees a NEW ref is
                -- a real uuid; this one only has to be total and stable.
                then jsonb_build_object('kind','document',
                       'document_id', lower(btrim(coalesce(x.elem->>'document_id',''))))
                else jsonb_build_object('kind', x.elem->>'kind') end
           order by x.idx), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_source_refs,'[]'::jsonb)) with ordinality as x(elem, idx);
$$;
revoke all on function clara._journal_source_refs_canonical(jsonb) from public;

-- THE ONE DOCUMENT a source-ref array names, or NULL. At most one is admitted (see the assertion
-- below), so this is total.
create function clara._journal_source_document(p_source_refs jsonb) returns uuid
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select (x.elem->>'document_id')::uuid
    from jsonb_array_elements(coalesce(p_source_refs,'[]'::jsonb)) as x(elem)
   where x.elem->>'kind' = 'document'
   limit 1;
$$;
revoke all on function clara._journal_source_document(jsonb) from public;

-- SHAPE + EXISTENCE, with the offending element named. `field` is 1-BASED because SQL's
-- `with ordinality` counts from one and the path is generated FROM that ordinal — 0178's header
-- states this law and says zero-based consumers subtract one at THEIR edge. The DB never pretends
-- to a convention it does not use internally.
--
-- TWO CLASSES OF CHECK, AND `p_check_filed` IS WHICH ONE (Codex review, confirmed). The SHAPE
-- half is a property of the PAYLOAD and never changes: an element that is not an object, an
-- unsupported kind, a missing or malformed document id, a second document. The FILING half is a
-- property of the WORLD and changes under the caller's feet: a filing can be retired between an
-- admission and the retry of that same admission. Running the second half before the replay
-- lookup made a LOST-RESPONSE RETRY answer `invalid_source_ref` for a Work that already existed
-- — and the composer's next move for a field refusal is to change the document, which under the
-- same intent key is a payload conflict, which rotates the key, which admits a SECOND Work for
-- figures already admitted. So admission calls this twice: shape before the replay branch,
-- filing after it.
create function clara._assert_journal_source_refs(p_firm uuid, p_client uuid, p_source_refs jsonb,
    p_check_filed boolean default true)
  returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare r record; v_docs int := 0; v_doc uuid;
begin
  if p_source_refs is null or jsonb_typeof(p_source_refs) <> 'array' then
    raise exception 'source refs must be a JSON array (empty means documentless)'
      using errcode='CLR10', detail='{"reason":"invalid_source_refs"}';
  end if;
  for r in select x.elem, x.idx::int as idx
             from jsonb_array_elements(p_source_refs) with ordinality as x(elem, idx) loop
    if jsonb_typeof(r.elem) <> 'object' then
      raise exception 'source ref % is not an object', r.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_source_ref',
          'field','source_refs[' || r.idx || ']', 'constraint','object')::text;
    end if;
    if coalesce(r.elem->>'kind','') not in ('chat_task','document') then
      raise exception 'source ref % names an unsupported kind', r.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_source_ref',
          'field','source_refs[' || r.idx || ']', 'constraint','kind')::text;
    end if;
    if r.elem->>'kind' = 'document' then
      v_docs := v_docs + 1;
      if v_docs > 1 then
        -- Multi-document evidence is out of scope for #634 (spec: one source per Work). Refused
        -- by name rather than silently taking the first, because silently taking the first would
        -- post an entry backed by evidence the human did not choose.
        raise exception 'a journal work carries at most one document source ref'
          using errcode='CLR10', detail=jsonb_build_object('reason','invalid_source_ref',
            'field','source_refs[' || r.idx || ']', 'constraint','at_most_one_document')::text;
      end if;
      if nullif(btrim(coalesce(r.elem->>'document_id','')),'') is null then
        raise exception 'source ref % names no document', r.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_source_ref',
            'field','source_refs[' || r.idx || ']', 'constraint','document_id')::text;
      end if;
      begin
        v_doc := (r.elem->>'document_id')::uuid;
      exception when others then
        raise exception 'source ref % does not name a document id', r.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_source_ref',
            'field','source_refs[' || r.idx || ']', 'constraint','uuid')::text;
      end;
      -- NO EXISTENCE ORACLE: a document of another firm, a document filed to another client and
      -- a uuid naming nothing all answer identically. The caller already knows which client they
      -- picked from, so nothing actionable is withheld and nothing enumerable is leaked.
      if p_check_filed and not clara._journal_document_filed(p_firm, p_client, v_doc) then
        raise exception 'source ref % is not an active verified document of this client', r.idx
          using errcode='CLR10', detail=jsonb_build_object('reason','invalid_source_ref',
            'field','source_refs[' || r.idx || ']', 'constraint','not_filed')::text;
      end if;
    end if;
  end loop;
end $$;
revoke all on function clara._assert_journal_source_refs(uuid,uuid,jsonb,boolean) from public;

-- WHICH POSTED ENTRY ALREADY STANDS ON THIS DOCUMENT, or NULL. Asked in exactly one place so the
-- three askers (admission, commit, the late door) can never disagree, and so the answer always
-- agrees with `uq_entry_evidence_links_document`.
--
-- TWO LANES, ONE QUESTION, AND BOTH IGNORE A REVERSAL. The DOCUMENT CODING lane binds a document
-- to an entry through `clara.journal_entries.document_id` (with its filing + sha trio), and a
-- reversed coding is lawfully re-codable, so that arm asks for an APPROVED, NOT-REVERSED entry.
-- This lane binds through `clara.entry_evidence_links`, and its RELEASED rows are exactly the
-- reversed ones (`t_entry_evidence_release` above) — so that arm asks for a LIVE link. The two
-- predicates now say the same thing about the same event, which is what makes the answer agree
-- with `uq_entry_evidence_links_document`'s own `where released_at is null`: the door's reckoning
-- and the index's can never disagree, in either direction.
--
-- THE SCOPE IS THE FIRM, NOT THE CLIENT, and that is the index's own scope (Codex review,
-- confirmed against the catalog). `uq_document_filing_active` is `(document_id, client_id) where
-- retired_at is null` (0007:93) — so ONE document may be actively filed to TWO clients of a firm,
-- and both may cite it. `uq_entry_evidence_links_document` has no client column, so it refuses the
-- second binding wherever it comes from; a client-scoped lookup would MISS the sibling's binding,
-- answer "free", and let the write reach the index as a raw 23505 that the handlers below cannot
-- translate. Asking the same question the index asks is what keeps the typed refusal total.
--
-- IT IS NOT AN ORACLE. `clara.documents` is firm-scoped and `clara.journal_entries`' own human
-- read policy is `firm_id = clara.jwt_firm()` with no per-client clause, so the entry this names
-- is one the caller may already read. The firm floor comes from the CLIENT the caller passed,
-- never from a caller-supplied firm id.
create function clara._document_posting_entry(p_client uuid, p_document uuid) returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $$
  select e.entry_id from (
    select l.entry_id, 0 as rank from clara.entry_evidence_links l
      join clara.clients c on c.id = p_client and c.firm_id = l.firm_id
      where l.document_id = p_document and l.released_at is null
    union all
    select j.id, 1 from clara.journal_entries j
      join clara.clients c2 on c2.id = p_client and c2.firm_id = j.firm_id
      where j.document_id = p_document
        and j.status = 'approved' and j.reversed_by is null
  ) e order by e.rank limit 1;
$$;
revoke all on function clara._document_posting_entry(uuid,uuid) from public;

-- =====================================================================================
-- §C  clara.admit_journal_work — RECUT. Full 0178 body; the additions are marked `#634`.
-- =====================================================================================
create or replace function clara.admit_journal_work(p_client uuid, p_author uuid, p_intent_key text,
    p_basis jsonb, p_basis_origin text, p_source_refs jsonb, p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_digest text; v_work uuid; v_task uuid; v_logical text; x record;
  v_source_document uuid; v_canon_refs jsonb; v_posted_entry uuid;   -- #634
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
  -- #634 · EVERY ELEMENT'S SHAPE, BY NAME. The array shape above is 0178's; this is the
  -- element-level assertion that makes an evidence claim mean something. It runs BEFORE the model
  -- gate and before any durable write, for the same reason the key gate does.
  --
  -- SHAPE ONLY, HERE. The FILING check is deferred past the replay branch below — a property of
  -- the payload may be asserted against a replay, a property of the WORLD may not (see
  -- `_assert_journal_source_refs`'s own header for the lost-response path that made this a
  -- second admission).
  perform clara._assert_journal_source_refs(v_firm, p_client, p_source_refs, false);
  v_source_document := clara._journal_source_document(p_source_refs);
  -- The run records WHICH MODEL served it (C88.8's half that lives on the task). The agent_tasks
  -- INSERT guard refuses a blank snapshot with an UNTYPED CLR10, so it is refused here first,
  -- with a reason the runtime classifier can act on.
  if p_model is null or p_model ~ '^\s*$' then
    raise exception 'an accounting-work run must name the model serving it' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model","constraint":"nonempty"}';
  end if;

  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_canon_refs := clara._journal_source_refs_canonical(p_source_refs);   -- #634

  -- Idempotent on (firm, CLIENT, intent_key). The unique constraint is what makes this safe
  -- under a genuine race; this read is the fast path and the source of the typed conflict. The
  -- client conjunct is not decoration: without it the same key used against two clients of one
  -- firm returned the FIRST client's Work as a replay and silently dropped the second intent.
  select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status, w.source_refs into x
    from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if found then
    -- #634 · TWO PAYLOAD HALVES, TWO COMPARISONS, ONE TOKEN. The basis digest is 0178's and its
    -- formula is deliberately unchanged (see this file's header); the evidence half is compared
    -- canonical-form to canonical-form, so re-submitting the same intent with a DIFFERENT
    -- document is a typed conflict rather than a replay that silently drops the new evidence.
    if x.basis_digest is distinct from v_digest
       or clara._journal_source_refs_canonical(x.source_refs) is distinct from v_canon_refs then
      raise exception 'this intent key already carries a different journal basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','intent_payload_conflict','work_id',x.id)::text;
    end if;
    return jsonb_build_object('work_id', x.id, 'task_id', x.current_task_id,
      'logical_op_id', x.logical_op_id, 'status', x.status, 'replayed', true);
  end if;

  -- #634 · THE WORLD'S HALF OF THE EVIDENCE CHECK, both arms, AFTER the replay branch.
  --
  -- IS THE DOCUMENT STILL AN ACTIVE VERIFIED FILING OF THIS CLIENT? Deferred to here from the
  -- shape assertion above (Codex review, confirmed): a lost-response retry under the SAME intent
  -- key must resolve to the Work it already admitted, and a filing retired in the meantime is a
  -- fact about the world rather than about the payload. Refusing it before the replay lookup sent
  -- the composer a field refusal for a Work that existed — and its next move, a different
  -- document under the same key, is a payload conflict, which rotates the key, which admits a
  -- SECOND Work for figures already admitted.
  -- The SAME assertion as above with its filing arm ON, so the refusal's `field` path and its
  -- `not_filed` constraint are generated in exactly one place rather than restated here.
  perform clara._assert_journal_source_refs(v_firm, p_client, p_source_refs, true);

  -- ONE DOCUMENT, ONE POSTED ENTRY. Asked AFTER the replay branch so a replay of an
  -- already-admitted Work still replays (its own commit owns the document), and BEFORE anything
  -- durable so a conflicting attachment never mints a Work or spends a run. An attachment
  -- conflict OPENS IMPACT/CORRECTION -- the refusal carries the entry that already stands on the
  -- document -- and never becomes a second effect.
  if v_source_document is not null then
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
          'document_id', v_source_document, 'entry_id', v_posted_entry, 'conflict', true)::text;
    end if;
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
    select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status, w.source_refs into x
      from clara.accounting_work w
     where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
    if not found or x.basis_digest is distinct from v_digest
       or clara._journal_source_refs_canonical(x.source_refs) is distinct from v_canon_refs then
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
      'logical_op_id', v_logical, 'intent_key', p_intent_key, 'basis_origin', p_basis_origin,
      'source_document', v_source_document));

  return jsonb_build_object('work_id', v_work, 'task_id', v_task, 'logical_op_id', v_logical,
    'status', 'queued', 'replayed', false);
end $$;
revoke all on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) to clara_runtime;

-- =====================================================================================
-- §D  clara._record_journal_entry_core — RECUT. Full 0178 body; additions marked `#634`.
-- =====================================================================================
create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
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

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo -- the run may not author
  -- evidence any more than it may author a basis) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here: an entry that is already posted
  -- must not be re-diagnosed as a source conflict just because its own link now holds the
  -- document. That ordering is the difference between an idempotent retry and a Work that
  -- reports a failure for work it already did.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
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
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document -- `ck_je_doc_pair` and `ck_je_document_filing_pair` make that column the DOCUMENT
  -- CODING lane's trio, and the late door could never write it at all (see this file's header).
  -- Nothing is referenced that is not real and nothing is invented.
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

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one,
  -- so a documentless receipt is byte-identical to the one 0178 wrote.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    values (p_firm, p_client, p_work, 'journal_entry', p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes -- that is what makes the two entry
  -- points one contract rather than two lookalikes.
  --
  -- THE INDEX'S OWN REFUSAL WEARS THE SAME NAME (reviewed finding). Step 7b above asked whether
  -- the document was free; a CONCURRENT sibling can post between that read and this write, and
  -- then `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped
  -- as a raw 23505 — no `detail.reason`, so `WORK_MAPPED_CODES` classified it as unmapped and the
  -- Work reported an internal error for what is an ordinary, expected conflict. The handler
  -- re-reads the committed winner and raises the SAME (CLR13, source_conflict, already_posted)
  -- pair 7b raises. A violation it cannot explain is RE-RAISED verbatim rather than renamed.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document));

  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false);
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

-- =====================================================================================
-- §E  clara.attach_entry_evidence — THE LATE DOOR. Human, bookkeeper+, op-key idempotent.
--
-- NO FINANCIAL EFFECT: not one column of the posted entry moves, no line is written, no amount
-- changes. This door records that a document the firm already holds is the source behind an entry
-- that is already in the books. That is exactly why it can exist at all beside LAW 6.
--
-- `p_expected_revision` is a STALENESS gate, not a version bump. The entry's `revision_token`
-- CANNOT be bumped here -- `clara._tf_entry_immutable`'s approved -> approved allowset is
-- `{reversed_by, reversal_reason, updated_at}` and it additionally requires `reversed_by` to be
-- set -- so this door reads the token and refuses CLR06 when the caller's view is not the current
-- row, exactly as `approve_entry` does, and then leaves the row alone. A UI that re-reads after
-- every action (hydrate-never-trust) gets the honest answer either way.
-- =====================================================================================
create function clara.attach_entry_evidence(p_entry uuid, p_document uuid,
    p_expected_revision uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; e record; l record;
  v_work uuid; v_logical text; v_link uuid; v_posted_entry uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));

  -- C82.1: an empty or whitespace key is refused BEFORE any reservation, and `~ '^\s*$'` rather
  -- than the house `btrim(...)=''` because one-argument btrim strips SPACES ONLY (0178's note).
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'attaching evidence requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- `clara._reserve_op`'s own payload-conflict raise carries NO detail, and a classifier keyed on
  -- (errcode, reason) cannot act on a bare message -- so the same op key presented with a
  -- different (entry, document, revision) triple answers under a typed reason instead.
  begin
    v_dedupe := clara._reserve_op(c.firm, 'attach_entry_evidence', p_op_key,
      clara._hash(jsonb_build_object('entry', p_entry, 'document', p_document,
        'expected_revision', p_expected_revision)));
  exception when sqlstate 'CLR10' then
    raise exception 'this attachment key already carries a different request' using errcode='CLR10',
      detail='{"reason":"operation_payload_conflict"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this attachment key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- THE ENTRY, inside the caller's firm. Cross-firm is NOT-FOUND, never a different error: this
  -- door must not become an existence oracle for another firm's ledger.
  select je.id, je.client_id, je.firm_id, je.status, je.revision_token, je.document_id,
         je.reversed_by
    into e from clara.journal_entries je where je.id = p_entry and je.firm_id = c.firm;
  if not found then
    raise exception 'journal entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"entry_not_found"}';
  end if;
  if e.status <> 'approved' then
    raise exception 'evidence attaches to a posted entry; this one is %', e.status
      using errcode='CLR13', detail=jsonb_build_object('reason','entry_not_approved',
        'status', e.status)::text;
  end if;
  -- #634 (reviewed finding) · A REVERSED ENTRY IS CLOSED HISTORY. Its status is still `approved`
  -- (LAW 6 reverses, it does not withdraw), so the arm above does not catch it — and a link born
  -- here would never be released, because the reversal UPDATE that fires
  -- `t_entry_evidence_release` has already happened. It would hold the document for ever, which
  -- is the exact stranding THE THIRD MEASUREMENT exists to prevent. The source belongs on the
  -- entry that REPLACED this one, and the refusal names it.
  if e.reversed_by is not null then
    raise exception 'this entry has been reversed; attach the source to the entry that replaced it'
      using errcode='CLR13', detail=jsonb_build_object('reason','entry_reversed',
        'entry_id', p_entry, 'reversed_by', e.reversed_by)::text;
  end if;
  if p_expected_revision is distinct from e.revision_token then
    raise exception 'this entry changed since you read it' using errcode='CLR06',
      detail=jsonb_build_object('reason','stale_revision',
        'revision_token', e.revision_token)::text;
  end if;

  -- THE DOCUMENT, in THIS ENTRY'S CLIENT. Same predicate and same refusal token the admission
  -- path uses, so one wire vocabulary covers both doors.
  if p_document is null then
    raise exception 'attaching evidence requires a document' using errcode='CLR10',
      detail='{"reason":"invalid_source_ref","constraint":"document_id"}';
  end if;
  if not clara._journal_document_filed(c.firm, e.client_id, p_document) then
    raise exception 'that document is not an active verified filing of this entry''s client'
      using errcode='CLR10', detail='{"reason":"invalid_source_ref","constraint":"not_filed"}';
  end if;

  -- ALREADY ATTACHED? The SAME document replays (a lost response must be safe to repeat under a
  -- fresh op key); a DIFFERENT one is a conflict that names the document already standing there,
  -- so the human is offered impact/correction rather than a silent overwrite of the record.
  select l2.id, l2.document_id, l2.work_id, l2.logical_op_id, l2.attached_via, l2.attached_at
    into l from clara.entry_evidence_links l2 where l2.entry_id = p_entry;
  if found then
    if l.document_id = p_document then
      return clara._finish_op(c.firm, 'attach_entry_evidence', p_op_key, jsonb_build_object(
        'attached', true, 'entry_id', p_entry, 'document_id', l.document_id,
        'link_id', l.id, 'work_id', l.work_id, 'logical_op_id', l.logical_op_id,
        'attached_via', l.attached_via, 'already_attached', true));
    end if;
    raise exception 'this entry already carries a different source document'
      using errcode='CLR13', detail=jsonb_build_object('reason','evidence_already_attached',
        'document_id', l.document_id, 'entry_id', p_entry, 'conflict', true)::text;
  end if;
  -- The DOCUMENT-CODING lane's own binding counts too: an entry that already carries
  -- `journal_entries.document_id` is document-sourced and needs nothing from this door.
  if e.document_id is not null then
    raise exception 'this entry already carries a different source document'
      using errcode='CLR13', detail=jsonb_build_object('reason','evidence_already_attached',
        'document_id', e.document_id, 'entry_id', p_entry, 'conflict', true)::text;
  end if;

  -- ONE DOCUMENT, ONE POSTED ENTRY -- the same invariant admission asks, asked here too, and
  -- backed by uq_entry_evidence_links_document under a race.
  v_posted_entry := clara._document_posting_entry(e.client_id, p_document);
  if v_posted_entry is not null then
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', p_document, 'entry_id', v_posted_entry, 'conflict', true)::text;
  end if;

  -- THE WORK THIS ENTRY CAME FROM, if any -- read off the operation receipt that named the entry,
  -- never taken from the caller. An entry with no Work behind it (a document-lane draft approved
  -- by a human, an older manual entry) attaches under an ENTRY-scoped identity instead of a
  -- fabricated Work id.
  select o.work_id into v_work from clara.operation_receipts o
   where o.effects->>'entry_id' = p_entry::text and o.outcome = 'committed'
   order by o.created_at limit 1;
  v_logical := case when v_work is null
                    then 'entry:' || p_entry::text || ':attach_evidence:1'
                    else 'work:' || v_work::text || ':attach_evidence:1' end;

  -- THE INDEX'S OWN REFUSAL WEARS THE SAME NAMES (reviewed finding), for the same reason the
  -- commit path's does: every check above ran against a snapshot, and a concurrent sibling can
  -- commit between them and this INSERT. The handler re-reads what actually stands there and
  -- answers with the SAME three arms the pre-checks use — including the REPLAY arm, because a
  -- race that lands the very document this caller asked for has produced the state they asked
  -- for, and calling that a conflict would be a lie about the outcome. An unexplained violation
  -- is re-raised verbatim.
  begin
    insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
        receipt_id, logical_op_id, attached_via, attached_by)
      values (c.firm, e.client_id, p_entry, p_document, v_work, null, v_logical,
        'late_attachment', c.actor)
      returning id into v_link;
  exception when unique_violation then
    select l2.id, l2.document_id, l2.work_id, l2.logical_op_id, l2.attached_via
      into l from clara.entry_evidence_links l2 where l2.entry_id = p_entry;
    if found and l.document_id = p_document then
      return clara._finish_op(c.firm, 'attach_entry_evidence', p_op_key, jsonb_build_object(
        'attached', true, 'entry_id', p_entry, 'document_id', l.document_id,
        'link_id', l.id, 'work_id', l.work_id, 'logical_op_id', l.logical_op_id,
        'attached_via', l.attached_via, 'already_attached', true));
    end if;
    if found then
      raise exception 'this entry already carries a different source document'
        using errcode='CLR13', detail=jsonb_build_object('reason','evidence_already_attached',
          'document_id', l.document_id, 'entry_id', p_entry, 'conflict', true)::text;
    end if;
    v_posted_entry := clara._document_posting_entry(e.client_id, p_document);
    if v_posted_entry is null then raise; end if;
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', p_document, 'entry_id', v_posted_entry, 'conflict', true)::text;
  end;

  perform clara._audit(c.firm, c.actor, null, null, 'attach_entry_evidence', p_entry,
    jsonb_build_object('client', e.client_id, 'entry', p_entry, 'document', p_document,
      'work', v_work, 'logical_op_id', v_logical, 'link', v_link, 'op_key', p_op_key));

  return clara._finish_op(c.firm, 'attach_entry_evidence', p_op_key, jsonb_build_object(
    'attached', true, 'entry_id', p_entry, 'document_id', p_document, 'link_id', v_link,
    'work_id', v_work, 'logical_op_id', v_logical, 'attached_via', 'late_attachment',
    'already_attached', false));
end $$;
revoke all on function clara.attach_entry_evidence(uuid,uuid,uuid,text) from public;
grant execute on function clara.attach_entry_evidence(uuid,uuid,uuid,text) to clara_authenticated;
comment on function clara.attach_entry_evidence(uuid,uuid,uuid,text) is
  '#634 C3 late attachment. Bookkeeper+, op-key idempotent, NO financial effect: it writes one '
  'clara.entry_evidence_links row and touches no column of the posted entry (LAW 6). CLR06 on a '
  'stale p_expected_revision; CLR13 evidence_already_attached / source_already_posted / '
  'entry_not_approved / entry_reversed; CLR11 entry_not_found (no cross-firm oracle).';

-- =====================================================================================
-- §F  clara.list_entry_links — THE JOURNAL SURFACE'S ONE READ.
--
-- A DOOR RATHER THAN A POSTGREST READ. Measured tradeoff: the surface needs FIVE relations joined
-- per row (journal_entries, entry_evidence_links, operation_receipts, accounting_work and the
-- reversal self-join). PostgREST would need an embedded resource chain across two of them that
-- carry no FK to journal_entries at all (`operation_receipts` reaches it only through
-- `effects->>'entry_id'`, a jsonb expression PostgREST cannot embed on), so the web would issue
-- three round trips and merge them client-side -- three chances to show a half-merged row, and
-- three RLS surfaces to keep in step. One STABLE definer read with an explicit firm+client floor
-- is smaller, and it is the shape 0174's web-read doors already established.
-- =====================================================================================
create function clara.list_entry_links(p_client uuid, p_entries uuid[]) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid; v_n int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  v_n := coalesce(array_length(p_entries, 1), 0);
  if v_n > 500 then
    raise exception 'too many entries in one links read (% > 500)', v_n using errcode='CLR10',
      detail=jsonb_build_object('reason','too_many_entries','limit',500)::text;
  end if;
  if v_n = 0 then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id',        je.id,
        'status',          je.status,
        'origin',          je.origin,
        'work_id',         coalesce(o.work_id, l.work_id),
        'receipt_id',      o.id,
        'logical_op_id',   coalesce(o.logical_op_id, l.logical_op_id),
        'purpose',         aw.purpose,
        'basis_origin',    aw.basis_origin,
        'initiator',       aw.initiator,
        'initiator_role',  aw.initiator_role,
        -- ONE FIELD FOR "the source document", whichever lane bound it, plus the lane itself so
        -- the surface can say HOW it was bound rather than guessing from a null.
        'document_id',     coalesce(l.document_id, je.document_id),
        'document_source', case when l.document_id is not null then l.attached_via
                                when je.document_id is not null then 'document_coding'
                                else null end,
        'attached_at',     l.attached_at,
        -- #634 (reviewed finding) · WHEN THE BINDING STOPPED BEING THE LIVE ONE, or null. A
        -- reversed entry keeps reporting the document it was backed by — the chain stays
        -- inspectable — and this instant is what says the document is now free for the
        -- correction. A surface that read `document_id` alone would otherwise present a released
        -- binding as the current fact.
        'released_at',     l.released_at,
        'reversal_of',     je.reversal_of,
        'reversed_by',     je.reversed_by,
        'reversal_reason', je.reversal_reason)
      order by je.id)
      from clara.journal_entries je
      left join clara.entry_evidence_links l on l.entry_id = je.id
      left join clara.operation_receipts o
        on o.effects->>'entry_id' = je.id::text and o.outcome = 'committed'
      left join clara.accounting_work aw on aw.id = coalesce(o.work_id, l.work_id)
     where je.client_id = p_client and je.firm_id = c.firm
       and je.id = any(p_entries)), '[]'::jsonb);
end $$;
revoke all on function clara.list_entry_links(uuid,uuid[]) from public;
grant execute on function clara.list_entry_links(uuid,uuid[]) to clara_authenticated;
comment on function clara.list_entry_links(uuid, uuid[]) is
  '#634 C3 journal surface. Per entry: Work, operation receipt, logical operation id, purpose, '
  'basis origin, initiator, source document (evidence link OR the document-coding column, with '
  'the lane named and released_at when a reversal freed the binding) and the correction chain. '
  'Bookkeeper+, firm+client floored, batch cap 500.';

reset role;

-- =====================================================================================
-- §G  TAIL CENSUS. Re-read the committed catalog and say what it found.
-- =====================================================================================
do $w634_tail$
declare v_n int; v_sig text;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara' and c.relname='entry_evidence_links'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#634 tail: clara.entry_evidence_links is missing or not FORCE ROW LEVEL SECURITY'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_policies
   where schemaname='clara' and tablename='entry_evidence_links';
  if v_n <> 2 then
    raise exception '#634 tail: expected exactly 2 policies on entry_evidence_links (owner + firm read), found %', v_n
      using errcode='CLR10';
  end if;

  -- NO DML TO ANY APPLICATION ROLE. Every write rides a definer function; a direct insert from
  -- clara_authenticated would bypass the whole uniqueness + authority argument above.
  -- (`clara_fn_owner` is the table's OWNER and therefore holds the implicit owner grants; the
  -- claim under test is that no APPLICATION role does.)
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='entry_evidence_links'
     and privilege_type in ('INSERT','UPDATE','DELETE')
     and grantee <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#634 tail: entry_evidence_links carries % DML grant(s); it must carry none', v_n
      using errcode='CLR10';
  end if;

  -- The append-only + no-truncate belts are on.
  select count(*) into v_n from pg_trigger t
   where t.tgrelid='clara.entry_evidence_links'::regclass and not t.tgisinternal;
  if v_n <> 2 then
    raise exception '#634 tail: entry_evidence_links carries % non-internal trigger(s), expected 2', v_n
      using errcode='CLR10';
  end if;

  -- THE RELEASE MECHANISM, all three halves of it (see THE THIRD MEASUREMENT in the header).
  -- (1) the document uniqueness is PARTIAL, so a released binding frees its document…
  select count(*) into v_n from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'uq_entry_evidence_links_document' and i.indisunique and i.indpred is not null;
  if v_n <> 1 then
    raise exception '#634 tail: uq_entry_evidence_links_document is not a PARTIAL unique index -- a reversed entry would strand its document for ever'
      using errcode='CLR10';
  end if;
  -- (2) …the trigger that stamps the release sits on the COLUMN every reversal writer moves…
  select count(*) into v_n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='clara.journal_entries'::regclass and not t.tgisinternal
     and t.tgname = 't_entry_evidence_release' and p.proname = '_tf_entry_evidence_release';
  if v_n <> 1 then
    raise exception '#634 tail: t_entry_evidence_release is not installed on clara.journal_entries'
      using errcode='CLR10';
  end if;
  -- (3) …and the append-only belt on the links table is the ONE-COLUMN allowset, not the generic
  -- refuse-everything body (which would make the release above impossible).
  select p.proname into v_sig from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='clara.entry_evidence_links'::regclass
     and t.tgname = 't_entry_evidence_links_append_only';
  if v_sig is distinct from '_tf_entry_evidence_link_append_only' then
    raise exception '#634 tail: the links append-only trigger runs % rather than the one-column allowset', coalesce(v_sig,'<none>')
      using errcode='CLR10';
  end if;
  -- …and the LATE door refuses a reversed entry by name, or the stranding reopens from its side.
  select p.prosrc into v_sig from pg_proc p
   where p.oid='clara.attach_entry_evidence(uuid,uuid,uuid,text)'::regprocedure;
  if position('entry_reversed' in v_sig) = 0 or position('unique_violation' in v_sig) = 0 then
    raise exception '#634 tail: clara.attach_entry_evidence lost its reversed-entry arm or its typed unique-violation handler'
      using errcode='CLR10';
  end if;

  -- PUBLIC holds EXECUTE on nothing this file created or recut. (0123:2323's finding: `set role
  -- clara_fn_owner` does NOT reliably inherit the default-privileges revoke.)
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema='clara' and grantee='PUBLIC'
     and routine_name in ('attach_entry_evidence','list_entry_links','admit_journal_work',
       '_record_journal_entry_core','_assert_journal_source_refs','_journal_source_refs_canonical',
       '_journal_source_document','_document_posting_entry','_journal_document_filed');
  if v_n <> 0 then
    raise exception '#634 tail: PUBLIC holds an EXECUTE grant on a #634 function' using errcode='CLR10';
  end if;

  -- The two granted doors reach exactly the one role each needs, and NO agent or wake role.
  foreach v_sig in array array['clara.attach_entry_evidence(uuid,uuid,uuid,text)',
                               'clara.list_entry_links(uuid,uuid[])'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '#634 tail: % is not executable by clara_authenticated', v_sig using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute') then
      raise exception '#634 tail: % is reachable by an agent/runtime role', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- …and the admission verb is still the RUNTIME's alone after the recut.
  if not pg_catalog.has_function_privilege('clara_runtime',
        'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'execute')
     or pg_catalog.has_function_privilege('clara_authenticated',
        'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'execute') then
    raise exception '#634 tail: the admission grant matrix moved under the recut' using errcode='CLR10';
  end if;

  -- The recut bodies carry their new arms AND the 0178 arms they must not have dropped.
  select p.prosrc into v_sig from pg_proc p
   where p.oid='clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)'::regprocedure;
  if position('_assert_journal_source_refs' in v_sig)=0
     or position('source_already_posted' in v_sig)=0
     or position('_journal_source_refs_canonical' in v_sig)=0 then
    raise exception '#634 tail: the admit recut lost one of its new arms' using errcode='CLR10';
  end if;
  if position('invalid_intent_key' in v_sig)=0 or position('intent_payload_conflict' in v_sig)=0
     or position('invalid_basis_origin' in v_sig)=0 or position('client_inactive' in v_sig)=0
     or position('insufficient_role' in v_sig)=0 or position('actor_not_active' in v_sig)=0 then
    raise exception '#634 tail: the admit recut dropped a 0178 arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_sig from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('source_conflict' in v_sig)=0 or position('entry_evidence_links' in v_sig)=0
     or position('unique_violation' in v_sig)=0 then
    raise exception '#634 tail: the commit recut lost one of its new arms' using errcode='CLR10';
  end if;
  if position('obo_not_initiator' in v_sig)=0 or position('generic_control_leg' in v_sig)=0
     or position('unknown_account' in v_sig)=0 or position('basis_mismatch' in v_sig)=0
     or position('operation_payload_conflict' in v_sig)=0
     or position('operation_in_flight' in v_sig)=0 or position('wake_task_unbound' in v_sig)=0 then
    raise exception '#634 tail: the commit recut dropped a 0178 arm' using errcode='CLR10';
  end if;
  -- …and the entry it writes still carries NO document_id (the coding lane's trio is untouched).
  if position('document_id, filing_id' in v_sig) > 0 then
    raise exception '#634 tail: the commit recut writes the document-coding trio; it must not'
      using errcode='CLR10';
  end if;

  raise notice '#634 tail: OK -- clara.entry_evidence_links is forced-RLS with exactly 2 policies, zero DML grants and both immutability belts (the append-only one carrying the released_at allowset); uq_entry_evidence_links_document is PARTIAL and t_entry_evidence_release sits on clara.journal_entries, so a reversal frees the document for the correction; clara.attach_entry_evidence and clara.list_entry_links are PUBLIC-revoked, clara_authenticated-granted and unreachable by any agent/runtime role; clara.admit_journal_work and clara._record_journal_entry_core carry their new evidence arms (typed unique-violation handlers included) with every 0178 arm intact and write no document_id onto a journal entry.';
end
$w634_tail$;
