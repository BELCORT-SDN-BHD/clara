-- 0235_opening_binding_claim — #1014 (the defect #854 measured and filed): THE OPENING APPROVAL
-- CAN NO LONGER WIN A DOCUMENT ANOTHER SESSION ALREADY BOUND.
-- =====================================================================================
-- Spec of record: issue #1014 (Agent Brief, 2026-09-20). Parent files: 0197 (#718, the one
-- document lock both lanes take), 0213 (#821, the opening arm of the coding wall) and 0171 (the
-- SERIALIZABLE proconfig pin on the two opening approvers). It closes the ONE measured gap below
-- and nothing else.
--
-- WHAT WAS MEASURED, AND IS WRONG.
--
--   Driven as two real concurrent sessions over ONE document, the evidence wall holds in one
--   arrival order and not in the other (#854, riders wave 1, `wave1-lane04-final.md`):
--
--   * OPENING APPROVAL FIRST, EVIDENCE ATTACHMENT SECOND — holds. The attaching session runs
--     READ COMMITTED, so once it is granted the document lock its NEXT statement takes a fresh
--     snapshot, sees the approved opening items, and is refused CLR13 source_already_posted.
--   * EVIDENCE ATTACHMENT FIRST, OPENING APPROVAL SECOND — BOTH COMMIT. `attach_entry_evidence`
--     takes `clara.documents … for update` first (through `clara._lock_document_binding`) and
--     inserts its link. `approve_opening_seed` runs SERIALIZABLE (0171), blocks on that row lock
--     — proven, `wait_event_type = 'Lock'` — and, once granted the SAME row, evaluates the
--     opening arm of `clara._tf_source_binding_wall` against its OWN pre-attachment snapshot,
--     which cannot see the link. The document ends up as an ordinary entry's evidence AND as an
--     approved opening's tie document: exactly what the wall exists to forbid.
--
--   THE ROOT CAUSE, MEASURED ON THIS RIG RATHER THAN REASONED FROM DOCS. A lock that is only
--   TAKEN AND RELEASED forces nothing on a waiter under a snapshot isolation level.
--   `clara._lock_document_binding` locks `clara.documents` and never writes it, so the blocked
--   SERIALIZABLE transaction resumes on its original snapshot with no error. Re-measured here
--   before this file was written, on three throwaway relations, PostgreSQL 17:
--     · holder LOCKS the row only, waiter SERIALIZABLE  -> waiter proceeds (the defect);
--     · holder UPDATES a row the waiter can see         -> waiter 40001 could not serialize
--                                                          access due to concurrent update;
--     · holder INSERTS a row the waiter's snapshot cannot see, waiter upserts the same key with
--       ON CONFLICT DO UPDATE                           -> waiter 40001, same message.
--   (PostgreSQL 17 docs, "Transaction Isolation" §13.2.2/§13.2.3 and "Serialization Failure
--   Handling" §13.5, give the general rule — 40001 is the level's own way of saying "you cannot
--   have this". The three outcomes above are this rig's own measurement, not a quotation.)
--
--   A SERIALIZABLE TRANSACTION CANNOT *READ* WHAT COMMITTED AFTER ITS SNAPSHOT — that is the
--   isolation level, not a defect. So "re-read the evidence links under the lock" (the repair
--   shape #854's report guessed at) is not reachable. What IS reachable is a CONFLICT: an
--   index-arbitrated write both lanes perform on the same key, which Postgres resolves without
--   consulting anyone's snapshot.
--
-- =====================================================================================
-- THE ANSWER: THE LOCK BECOMES A CLAIM, IN THE ONE PLACE 0197 PUT THE ONE SPELLING.
--
--   `clara._lock_document_binding` is already the single object both lanes take, first, before
--   either probe (0197 §B, 0213 §B, and both files' tails assert the ordering positionally).
--   This file leaves that `for update` exactly where it is and appends ONE statement to the same
--   body: an upsert of the document's row in the new `clara.document_binding_claims`.
--
--   WHY AN UPSERT, AND NOT AN INSERT, AND NOT `DO NOTHING`. The claim must conflict in EVERY
--   shape the race can take: the key may be absent at both sessions' snapshots (both insert —
--   the second one's conflicting tuple is invisible to it), or present and committed long ago
--   (both update — the second one waits on a row the first actually changed). `ON CONFLICT DO
--   UPDATE` is the one form that takes a real row lock and writes a real new row version in both
--   shapes; `DO NOTHING` against a VISIBLE row takes no lock at all and would leave the race open
--   from a document's second binding onwards.
--
--   THE CLAIM TABLE CARRIES NO MEANING AND ANSWERS NO QUESTION. It is a serialization token, one
--   row per document, written only by this helper and read by nobody: no door, no read, no policy
--   for any application role. The WALLS still decide — 0182's `clara._document_posting_entry` for
--   a coded entry, 0213's live-`entry_evidence_links` probe for an opening item, both untouched
--   by this file. What changes is only that a SERIALIZABLE session which blocked on a document
--   another session was binding now LOSES instead of committing on a stale snapshot.
--
--   THE LOSER GETS THE WALL'S OWN REFUSAL, NEVER A RAW 40001. The upsert is wrapped in the one
--   handler this file adds: `serialization_failure` becomes CLR13 with reason
--   `source_already_posted`, the document and `conflict = true` — 0182's shape, the same token
--   0197's and 0213's walls already raise, so no classifier and no wire token grows. The handler
--   wraps THE UPSERT ALONE and not the `for update` above it, because a serialization failure on
--   `clara.documents` would mean the DOCUMENT ROW changed (the legacy bytes/storage upgrade is
--   its only writer), which is a different fact and must not be re-spelled as a binding conflict.
--
--   `detail.entry_id` IS NULL ON THIS ARM, AND THAT IS A LIMIT, NOT AN OVERSIGHT. Every other arm
--   names the entry standing on the document because it can SEE it. The losing session here
--   cannot: the winner committed after its snapshot, and no read inside a SERIALIZABLE
--   transaction can reach it. The key is present and null rather than absent, so the detail's KEY
--   SET is unchanged and `obw.same_spelling`'s comparison still holds. A caller that wants the
--   name re-reads the document's links in a fresh transaction (#1014's report carries that as a
--   successor contract).
--
--   THE CLAIM SERIALIZES ON THE DOCUMENT, NOT ON THE CONFLICT — AND THAT OVER-REFUSES, ON PURPOSE.
--   A SERIALIZABLE session that blocked on ANY other transaction binding the same document is
--   refused, including one that left no live evidence link behind. MEASURED on this rig (both sides
--   driving `clara._lock_document_binding` directly, so the claim is the only thing in play): the
--   waiter blocks on a Lock and is refused CLR13 `source_already_posted`; the same call unraced
--   succeeds. The one case this is stricter than the sequential path is a plain CODED approval
--   carrying the tie document racing the opening approval — 0213's opening arm probes live links
--   ALONE, so sequentially both stand. Narrowing it is not available: the losing session cannot read
--   WHAT the winner claimed (that is the same snapshot limit this file exists to work around), so a
--   claim key carrying the conflict class would have to be read to be useful. The outcome is
--   conservative, typed and retryable — the retry sees the committed world and decides correctly —
--   and #1014's report carries it as a named follow-up rather than leaving it to be discovered.
--
--   NO NEW LOCK PAIR, NO NEW RUNG IN THE ESTATE'S LADDER. The claim is taken AFTER the document
--   row and only ever for the SAME document, so a transaction that binds documents A then B takes
--   A.doc, A.claim, B.doc, B.claim — the relative order of the two documents is the one
--   `clara.documents` already imposed, and two transactions that inverted it would already have
--   deadlocked on `clara.documents` before this file. The wave ladder `accounting_plans ->
--   accounting_work -> agent_tasks -> agent_interruptions` (ARCHITECTURE §6) is untouched: no body
--   in it takes this claim, and this claim takes nothing in it.
--
-- WHAT THIS FILE DOES NOT DO.
--   * It does not recut `clara._tf_source_binding_wall` (0213's body), `clara._tf_evidence_link_
--     binding_wall` (0197's), `clara._document_posting_entry` (0182's) or
--     `clara._approve_opening_entry` (0017/0037's). All four are re-pinned by sha in §A and §D.
--   * It does not touch either opening door. `clara.approve_opening_seed` and
--     `clara.approve_opening_correction` keep their bodies, owners, ACLs, pinned search_paths and
--     the 0171 SERIALIZABLE proconfig — §D re-reads all five facts for both (#1014 AC5).
--   * It changes NOTHING for a caller that is not racing: a session that takes a document no other
--     session is binding upserts one row and proceeds exactly as before.
--   * It does not change what either wall FORBIDS, does not touch isolation anywhere, and edits no
--     applied migration.
--
-- CONSUMER ORDER. None owed and no writer-quiescence window. The only body replaced is a definer
-- helper reachable from nothing but the estate's two binding-wall triggers; a transaction that
-- began under the old body simply does not take the claim, which is today's behaviour. Rollback is
-- a successor migration restoring 0197's two-line body (the table may stay: nothing reads it).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. The world this file reasons about, measured rather than remembered.
--
-- REDO-TOLERANT BY CONSTRUCTION (#957, packages/db/README.md "Redo"). The one pin that names a
-- body this file REPLACES admits two lawful states: the 0197 body (a first apply) and this file's
-- own (a redo of an unmerged edit). The notice says which one the database was in. Every OTHER pin
-- is absolute, because this file must not run against a drifted estate either way.
-- =====================================================================================
do $w1014_pre$
declare v_sha text; v_src text; v_n int; v_def text; v_sig text; v_state text;
begin
  -- 1 · THE HELPER THIS FILE REPLACES. 0197 §B's body, or this file's own after a redo.
  if to_regprocedure('clara._lock_document_binding(uuid)') is null then
    raise exception '#1014 prestate: clara._lock_document_binding is absent -- 0197 must apply first'
      using errcode='CLR10';
  end if;
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara._lock_document_binding(uuid)'::regprocedure;
  if v_sha = '5aeaf6fa369348ff32d30e85c99dde724f29bf378841a684f12fed7465909aff' then
    v_state := 'first apply (the 0197 lock-only body)';
  elsif to_regclass('clara.document_binding_claims') is not null
        and position('document_binding_claims' in v_src) > 0 then
    v_state := 'redo (#1014''s own body is already live)';
  else
    raise exception '#1014 prestate: clara._lock_document_binding is neither its 0197 body nor #1014''s own (sha %) -- a third party recut it; re-derive the claim against the live body', v_sha
      using errcode='CLR10';
  end if;

  -- 2 · THE FOUR BODIES THIS FILE LEAVES ALONE, at the shas it reasons against. A drifted one may
  -- carry an arm that changes which side of the race is even reachable.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if v_sha is distinct from 'f87510af34baf827b684cdb6402f6d0c483dc7a4f22521a260615823e4ce6eb6' then
    raise exception '#1014 prestate: clara._tf_source_binding_wall has DRIFTED from its 0213 body (sha %) -- this file does not replace it and must not leave a wall it cannot account for', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_evidence_link_binding_wall()'::regprocedure;
  if v_sha is distinct from '9ad9cfacc6af237e1e420694ec8bbc27fecf4ad1076ad1a9f7fc9a895f0a8093' then
    raise exception '#1014 prestate: clara._tf_evidence_link_binding_wall has DRIFTED from its 0197 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha is distinct from '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#1014 prestate: clara._document_posting_entry has DRIFTED from its pinned 0182 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if v_sha is distinct from '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7' then
    raise exception '#1014 prestate: clara._approve_opening_entry has DRIFTED (sha %) -- the lane this race runs through', v_sha
      using errcode='CLR10';
  end if;

  -- 3 · THE TWO OPENING DOORS, at their bodies AND their 0171 isolation pin. The pin is the reason
  -- the defect exists at all: without it the approver would be READ COMMITTED and would re-read
  -- fresh once unblocked, exactly as the attaching side already does.
  foreach v_sig in array array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                               'clara.approve_opening_correction(uuid,jsonb,text,text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1014 prestate: % does not resolve', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_sig::regprocedure
       and p.proconfig::text like '%default_transaction_isolation=serializable%';
    if v_n <> 1 then
      raise exception '#1014 prestate: % has lost 0171''s SERIALIZABLE proconfig pin -- this file''s whole subject is what that pin implies', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132' then
    raise exception '#1014 prestate: clara.approve_opening_seed has DRIFTED (sha %) -- this file must not change a human-facing opening door and cannot prove it did not against a body it does not know', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4' then
    raise exception '#1014 prestate: clara.approve_opening_correction has DRIFTED (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- 4 · 0213 IS APPLIED: both coding-wall triggers admit opening rows, so the opening arm the
  -- claim protects is reachable at all.
  foreach v_sig in array array['t_source_binding_wall_ins','t_source_binding_wall_upd'] loop
    select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
     where t.tgrelid='clara.journal_entries'::regclass and not t.tgisinternal and t.tgname=v_sig;
    if v_def is null then
      raise exception '#1014 prestate: % is absent -- 0197/0213 must apply first', v_sig using errcode='CLR10';
    end if;
    if position('is_opening_balance' in v_def) > 0 then
      raise exception '#1014 prestate: % still carries 0197''s opening carve-out in its WHEN clause -- 0213 has not applied and there is no opening arm to protect', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE PERMISSIVE OWNER POLICY ON clara.documents, which is what lets the definer's
  -- `for update` lock anything at all under FORCE RLS (0197 §B's own premise). The claim table
  -- below needs its own twin for exactly the same reason, and §D re-reads that one.
  if not exists (select 1 from pg_policy where polrelid='clara.documents'::regclass
                   and polname='p_documents_owner') then
    raise exception '#1014 prestate: clara.documents no longer carries p_documents_owner -- clara._lock_document_binding would lock NOTHING under FORCE RLS'
      using errcode='CLR10';
  end if;

  raise notice '#1014 prestate: clean -- state: %. The four bodies this file leaves alone are at their pinned shas, BOTH opening doors are unmoved and still carry 0171''s SERIALIZABLE proconfig, both coding-wall triggers admit opening rows (0213 applied), and clara.documents still carries the permissive owner policy the definer lock depends on.', v_state;
end
$w1014_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE CLAIM. One row per document, no meaning, no reader.
--
-- `if not exists` is the redo rule (#957): re-running this file over its own old effects must be
-- safe, and the rows already in the table are exactly as meaningless as new ones.
--
-- NO FOREIGN KEY TO clara.documents, deliberately. 0197 §B's contract is that "a document that
-- does not exist locks nothing and RAISES NOTHING" — an FK here would turn that into a
-- foreign_key_violation and change the helper's tolerance, and its FOR KEY SHARE would add a
-- second acquisition on a row the caller already holds FOR UPDATE. The claim is a token; the FKs
-- on each lane's own write are what say the document is real.
-- =====================================================================================
create table if not exists clara.document_binding_claims (
  document_id uuid        primary key,
  claim_seq   bigint      not null default 1,
  claimed_at  timestamptz not null default now()
);
comment on table clara.document_binding_claims is
  '#1014: the SERIALIZATION TOKEN for "one document, one posted entry" -- one row per document, '
  'upserted by clara._lock_document_binding after it takes clara.documents FOR UPDATE, read by '
  'nothing. A row lock that is only taken and released forces no re-evaluation on a waiter under a '
  'snapshot isolation level, so the opening approvers (SERIALIZABLE since 0171) could block on a '
  'document another session was binding and still commit on their pre-block snapshot. The upsert '
  'makes that a real write conflict Postgres resolves without consulting either snapshot. It '
  'answers no question and carries no domain meaning: both walls still decide from their own '
  'probes.';

alter table clara.document_binding_claims enable row level security;
alter table clara.document_binding_claims force row level security;
-- The definer that writes it is clara_fn_owner, and clara_fn_owner is NOT BYPASSRLS (0002) --
-- under FORCE RLS without this policy every claim would be refused. No other role gets a policy or
-- a grant: nothing outside this helper has business reading a serialization token.
drop policy if exists p_document_binding_claims_owner on clara.document_binding_claims;
create policy p_document_binding_claims_owner on clara.document_binding_claims
  for all to clara_fn_owner using (true) with check (true);
revoke all on table clara.document_binding_claims from public;

drop trigger if exists t_document_binding_claims_no_truncate on clara.document_binding_claims;
create trigger t_document_binding_claims_no_truncate before truncate on clara.document_binding_claims
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §C  THE HELPER, RECUT: the same lock, then the claim.
--
-- `create or replace` preserves the owner, the SECURITY DEFINER flag, the pinned search_path and
-- the ACL 0197 §E revoked -- §D re-reads all four rather than trusting that.
--
-- THE `for update` IS UNMOVED AND STILL FIRST, so the contention point both race cells measure
-- (`wait_event_type = 'Lock'` on `clara.documents`) is the one they measured before. The claim
-- follows it, for the SAME document, so no new lock pair enters the estate.
-- =====================================================================================
create or replace function clara._lock_document_binding(p_document uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  -- 0197's contract, unchanged: a document that does not exist locks nothing and raises nothing.
  if p_document is null then
    return;
  end if;
  perform 1 from clara.documents d where d.id = p_document for update;
  begin
    insert into clara.document_binding_claims as c (document_id) values (p_document)
      on conflict (document_id) do update
        set claim_seq = c.claim_seq + 1, claimed_at = now();
  exception when serialization_failure then
    -- #1014 · THE ONE THING A SNAPSHOT-ISOLATED CALLER CAN LEARN about a binding that was taken
    -- while it waited. 0182's token, 0197's and 0213's spelling; `entry_id` is null because the
    -- winner committed after this transaction's snapshot and no read here can reach it.
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', p_document, 'entry_id', null, 'conflict', true)::text;
  end;
end $$;
comment on function clara._lock_document_binding(uuid) is
  '#718 + #1014: the ONE binding both the document-coding lane and the accounting-work evidence '
  'lane take before asking clara._document_posting_entry. FOR UPDATE on clara.documents (the row '
  'both lanes contend for), then an upsert of that document''s row in '
  'clara.document_binding_claims -- because a lock that is only taken and released forces no '
  're-evaluation on a SERIALIZABLE waiter, which is how an opening approval could block on a '
  'concurrent evidence attachment and still commit (#854). The upsert''s serialization failure is '
  're-raised as the walls'' own CLR13 source_already_posted, never a raw 40001. Granted to nobody: '
  'it is reachable only from the two binding-wall triggers.';

reset role;

-- =====================================================================================
-- §D  TAIL CENSUS. Everything above, re-read from the catalog.
-- =====================================================================================
do $w1014_tail$
declare v_src text; v_n int; v_sig text; v_sha text; v_role text;
begin
  -- 1 · THE CLAIM RELATION: owned, forced, policied for the owner ALONE, and reachable by no
  -- application role. A token every lane could read would be a new, meaningless oracle.
  if to_regclass('clara.document_binding_claims') is null then
    raise exception '#1014 tail: clara.document_binding_claims is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_roles r on r.oid=c.relowner
   where c.oid='clara.document_binding_claims'::regclass and r.rolname='clara_fn_owner'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#1014 tail: clara.document_binding_claims is not a clara_fn_owner table with RLS ENABLED and FORCED'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid='clara.document_binding_claims'::regclass;
  if v_n <> 1 then
    raise exception '#1014 tail: clara.document_binding_claims carries % policies, not 1', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy p join pg_roles r on r.oid = any(p.polroles)
   where p.polrelid='clara.document_binding_claims'::regclass
     and p.polname='p_document_binding_claims_owner' and r.rolname='clara_fn_owner';
  if v_n <> 1 then
    raise exception '#1014 tail: the claim relation''s only policy is not p_document_binding_claims_owner for clara_fn_owner'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['public','clara_authenticated','clara_runtime','clara_agent_ro'] loop
    if to_regrole(v_role) is not null and (
         has_table_privilege(v_role, 'clara.document_binding_claims', 'select')
      or has_table_privilege(v_role, 'clara.document_binding_claims', 'insert')
      or has_table_privilege(v_role, 'clara.document_binding_claims', 'update')
      or has_table_privilege(v_role, 'clara.document_binding_claims', 'delete')) then
      raise exception '#1014 tail: % holds a grant on clara.document_binding_claims -- the token is the helper''s alone', v_role
        using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid='clara.document_binding_claims'::regclass
                   and not tgisinternal and (tgtype & 32) <> 0) then
    raise exception '#1014 tail: clara.document_binding_claims carries no TRUNCATE guard' using errcode='CLR10';
  end if;

  -- 2 · THE RECUT HELPER: still a trigger-only definer, still locking BEFORE it claims, and still
  -- raising the estate's own token rather than a raw serialization failure.
  select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara._lock_document_binding(uuid)'::regprocedure
     and r.rolname = 'clara_fn_owner' and p.prosecdef
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#1014 tail: clara._lock_document_binding is not a clara_fn_owner SECURITY DEFINER with a pinned search_path'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['public','clara_authenticated','clara_runtime','clara_agent_ro'] loop
    if to_regrole(v_role) is not null
       and has_function_privilege(v_role, 'clara._lock_document_binding(uuid)'::regprocedure, 'execute') then
      raise exception '#1014 tail: % is EXECUTE-reachable on clara._lock_document_binding -- it is trigger-only', v_role
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._lock_document_binding(uuid)'::regprocedure;
  if position('for update' in v_src) = 0 or position('clara.documents' in v_src) = 0 then
    raise exception '#1014 tail: clara._lock_document_binding is no longer a FOR UPDATE on clara.documents -- 0197''s own tail assertion, restated'
      using errcode='CLR10';
  end if;
  if position('document_binding_claims' in v_src) = 0 or position('on conflict' in v_src) = 0 then
    raise exception '#1014 tail: clara._lock_document_binding does not upsert the binding claim -- the lock alone is the defect'
      using errcode='CLR10';
  end if;
  if position('for update' in v_src) > position('document_binding_claims' in v_src) then
    raise exception '#1014 tail: the helper claims BEFORE it locks -- the document row must stay the first contention point'
      using errcode='CLR10';
  end if;
  if position('on conflict do nothing' in v_src) > 0 then
    raise exception '#1014 tail: the claim uses ON CONFLICT DO NOTHING, which takes no row lock against a VISIBLE conflicting row and leaves the race open from a document''s second binding onwards'
      using errcode='CLR10';
  end if;
  if position('serialization_failure' in v_src) = 0 or position('source_already_posted' in v_src) = 0
     or position('CLR13' in v_src) = 0 then
    raise exception '#1014 tail: the helper does not map a serialization failure onto the walls'' own CLR13 source_already_posted -- a raw 40001 would reach a person'
      using errcode='CLR10';
  end if;
  if position('source_conflict' in v_src) > 0 then
    raise exception '#1014 tail: the helper mints a second spelling for a refusal 0182 already names'
      using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', ''))) / length('raise exception');
  if v_n <> 1 then
    raise exception '#1014 tail: the helper carries % raises, not 1', v_n using errcode='CLR10';
  end if;

  -- 3 · THE FOUR BODIES THIS FILE LEFT ALONE, unmoved by it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if v_sha is distinct from 'f87510af34baf827b684cdb6402f6d0c483dc7a4f22521a260615823e4ce6eb6' then
    raise exception '#1014 tail: clara._tf_source_binding_wall moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_evidence_link_binding_wall()'::regprocedure;
  if v_sha is distinct from '9ad9cfacc6af237e1e420694ec8bbc27fecf4ad1076ad1a9f7fc9a895f0a8093' then
    raise exception '#1014 tail: clara._tf_evidence_link_binding_wall moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha is distinct from '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#1014 tail: clara._document_posting_entry moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if v_sha is distinct from '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7' then
    raise exception '#1014 tail: clara._approve_opening_entry moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- 4 · THE HUMAN-FACING OPENING DOORS: body, owner, definer flag, pinned search_path, the 0171
  -- isolation pin, and WHO may EXECUTE them -- all of it, for both (#1014 AC5).
  foreach v_sig in array array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                               'clara.approve_opening_correction(uuid,jsonb,text,text)'] loop
    select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid = p.proowner
     where p.oid = v_sig::regprocedure and r.rolname = 'clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp']
       and p.proconfig::text like '%default_transaction_isolation=serializable%';
    if v_n <> 1 then
      raise exception '#1014 tail: % lost its owner, its SECURITY DEFINER flag, its pinned search_path or 0171''s SERIALIZABLE pin', v_sig
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception '#1014 tail: clara_authenticated lost EXECUTE on % -- this file must not narrow a human door', v_sig
        using errcode='CLR10';
    end if;
    foreach v_role in array array['public','clara_runtime','clara_agent_ro'] loop
      if to_regrole(v_role) is not null
         and has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception '#1014 tail: % gained EXECUTE on % -- this file must not widen a human door either', v_role, v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132' then
    raise exception '#1014 tail: clara.approve_opening_seed moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4' then
    raise exception '#1014 tail: clara.approve_opening_correction moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- 5 · WHO CAN REACH THE NEW REFUSAL AT ALL. The claim's serialization failure is only possible
  -- for a caller running under a snapshot isolation level, and in this estate exactly two bodies
  -- pin one: the two opening approvers (0171). If a THIRD ever appears -- in particular an
  -- evidence-lane door, whose wall raises `source_conflict` on the work_commit path rather than
  -- `source_already_posted` -- this arm's single spelling stops being the right one, and this
  -- assertion is where that is discovered.
  select count(*)::int into v_n from pg_proc p
   where p.proconfig::text like '%default_transaction_isolation=serializable%';
  if v_n <> 2 then
    raise exception '#1014 tail: % bodies pin a transaction isolation level, not 2 -- re-derive the claim refusal''s spelling for the new one', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.proconfig::text like '%default_transaction_isolation=serializable%'
     and p.oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                   'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure);
  if v_n <> 2 then
    raise exception '#1014 tail: the two isolation-pinned bodies are not the two opening approvers'
      using errcode='CLR10';
  end if;

  -- 6 · THE THREE BINDING WALLS, untouched by this file.
  select count(*)::int into v_n from pg_trigger t
   where not t.tgisinternal and t.tgname in ('t_source_binding_wall_ins','t_source_binding_wall_upd',
     't_entry_evidence_links_binding_wall') and (t.tgtype & 2) <> 0 and (t.tgtype & 1) <> 0;
  if v_n <> 3 then
    raise exception '#1014 tail: the three binding walls are not all BEFORE ROW triggers (% of 3)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#1014 tail: OK -- clara._lock_document_binding still takes clara.documents FOR UPDATE FIRST and now upserts clara.document_binding_claims for the same document, so a SERIALIZABLE session that blocked on a binding another session was taking loses on a real write conflict instead of committing on its pre-block snapshot; the upsert''s serialization failure is re-raised as the walls'' own CLR13 source_already_posted (document named, entry_id null -- the winner committed after this transaction''s snapshot), never a raw 40001, and the handler wraps the upsert ALONE so a change to the document ROW keeps its own spelling. The claim relation is a clara_fn_owner table with RLS enabled and FORCED, one policy (the owner''s), a TRUNCATE guard, and no grant for PUBLIC or any application role: it answers no question and no door reads it. Both walls decide exactly as before -- clara._tf_source_binding_wall, clara._tf_evidence_link_binding_wall, clara._document_posting_entry and clara._approve_opening_entry are all re-read at their pinned shas, unmoved -- and both human-facing opening doors keep their bodies, owners, SECURITY DEFINER flags, pinned search_paths, 0171 SERIALIZABLE pins and their EXECUTE audience (clara_authenticated, and nobody else). Exactly two bodies in the database pin an isolation level and both are those doors, so the single refusal spelling this arm raises is the right one for every caller that can reach it.';
end
$w1014_tail$;
