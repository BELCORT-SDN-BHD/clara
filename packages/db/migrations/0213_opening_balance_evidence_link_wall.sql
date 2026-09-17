-- 0213_opening_balance_evidence_link_wall — #821 (residual of #718's measured carve-out): THE
-- OPENING-BALANCE LANE LOOKS BACK AT THE EVIDENCE LINKS TOO, AND ONLY AT THEM.
-- =====================================================================================
-- Spec of record: issue #821 (Agent Brief, 2026-09-14). Parent invariant: 0182 §A, "ONE
-- DOCUMENT, ONE POSTED ENTRY"; parent file: 0197 (#718), whose two walls this file extends by
-- exactly one arm. It closes the ONE measured gap below and nothing else.
--
-- WHAT WAS MEASURED ON THE 0198 FRONTIER, AND IS WRONG.
--
--   0197 walled the DOCUMENT-CODING lane against a live evidence link and carved the opening
--   lane OUT of it, in the trigger WHEN clauses (`new.is_opening_balance = false`), because
--   wave-B's opening seed binds MANY opening items to ONE tie document by design
--   (`clara._approve_opening_entry`, 0017:3784 / 0037:2410) and a wall without the carve-out
--   refused the second item of every seed. The evidence wall carries no carve-out, so the
--   work/evidence lane is already refused on a document an approved opening item stands on.
--
--   THE REVERSE DIRECTION IS OPEN. Bind a document through the evidence lane (a live
--   `clara.entry_evidence_links` row, `released_at is null`), then run an opening seed whose tie
--   document is that same document: `clara._approve_opening_entry` approves, and
--   `clara._document_posting_entry` then ranks TWO live postings on ONE document — the link at
--   rank 0 and the opening entry at rank 1. MEASURED, not assumed: on this rig's own 0198
--   frontier, `packages/db/tests/opening-balance-evidence-link.test.mjs` cell
--   `obw.evidence_first` fails with "expected SQLSTATE CLR13 but the call SUCCEEDED".
--
-- =====================================================================================
-- THE ANSWER IS NARROWER THAN THE CODING LANE'S, AND THAT IS THE WHOLE DESIGN.
--
--   "One tie document, many opening items" stays legal. The ONLY conflict for an opening
--   approval is a LIVE EVIDENCE LINK on that document. So the opening arm may NOT reuse
--   `clara._document_posting_entry`: its rank-1 arm returns any approved, not-reversed entry
--   carrying the document — on a tie document that is a SIBLING OPENING ITEM — and reusing the
--   combined ranking would refuse the second item of every seed, which is precisely the
--   behaviour #821 is required to preserve (`wb-k-approval`'s batch cell, `x42.s5.2c`). The arm
--   therefore asks the rank-0 QUESTION ALONE, in rank 0's own spelling: a live link for this
--   document, firm-scoped through the client exactly as 0182:581-583 scopes it.
--
--   THE CARVE-OUT MOVES FROM THE TRIGGER TO THE BODY. An arm alone would be dead code: today's
--   WHEN clauses stop an opening row at the trigger. So the two `clara.journal_entries` triggers
--   are recreated WITHOUT `new.is_opening_balance = false` and the body branches on that same
--   column — the marker `clara._approve_opening_entry` itself requires to be true. The two lanes
--   are still separated by the lane's own marker; the separation is just one statement later,
--   where it can say something narrower than "skip".
--
--   THE TRIGGER NAMES ARE UNCHANGED (`t_source_binding_wall_ins` / `_upd`), so they still sort
--   after `t_je_immutable` and `t_period_wall` and every refusal those two own keeps its own
--   spelling. No new function, no new trigger, no new refusal: the opening arm raises the SAME
--   `CLR13` / `source_already_posted` / `document_id` / `entry_id` / `conflict` shape 0182's
--   admission arm, 0182's late door and 0197's coding wall already raise, so no classifier and
--   no wire token grows.
--
--   LOCK-THEN-ASK IS UNCHANGED AND STILL FIRST. `clara._lock_document_binding(new.document_id)`
--   remains the body's first statement, BEFORE either probe, because the order is the
--   serialization mechanism (0197 §B/§C) and §C below asserts it positionally for BOTH arms.
--   The opening approver reaches the wall holding the entry's own row lock (0037:2414 `select
--   ... for update`) and then takes the document — the same lock ORDER the coding lane's
--   approval already takes, so this file adds no new lock pair to the estate. `approve_opening_
--   seed` and `approve_opening_correction` both run pinned SERIALIZABLE (0171), and the refusal
--   surfaces through them in a single session with no concurrent driver.
--
-- WHAT THIS FILE DOES NOT DO.
--   * It does not recut `clara._document_posting_entry` (#821 out of scope; 0182/0197 sha-pin it
--     and both walls lean on its exact ranking) — §A and §C re-pin it instead.
--   * It does not recut `clara._approve_opening_entry`, `clara.approve_opening_seed` or
--     `clara.approve_opening_correction`. The guard belongs on the column transition, which is
--     where every approver passes — 0197's own reasoning, unchanged.
--   * It does not touch `clara._lock_document_binding` or `clara._tf_evidence_link_binding_wall`:
--     they are re-pinned at their live 0197 shas in §A and §C rather than replaced. The evidence
--     wall keeps its NO-carve-out stance, because a carve-out there would weaken 0182 rather than
--     preserve it.
--   * It does not change how a NON-opening approval is judged. The `else` arm below is 0197's
--     body verbatim.
--   * It does not refuse an opening approval merely because a SIBLING opening item stands on the
--     same tie document, and it says nothing about the draft transition of either lane.
--
-- CONSUMER ORDER. None owed and no writer-quiescence window: the only body replaced is a trigger
-- body reachable from nothing but its own two triggers, and the only thing that becomes illegal
-- after this migration is the double posting #821 is about. Rollback is a successor migration
-- restoring 0197's body and WHEN clauses.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. 0197's world, measured rather than remembered.
-- =====================================================================================
do $w821_pre$
declare v_sha text; v_src text; v_n int; v_def text; v_sig text;
begin
  -- 0182's lane and its ONE probe, at the sha BOTH walls were derived against. A re-ranked
  -- probe would change which entry the non-opening arm names and what rank 0 even means -- and
  -- rank 0's question is the one the new opening arm restates in its own scope.
  if to_regclass('clara.entry_evidence_links') is null then
    raise exception '#821 prestate: clara.entry_evidence_links is absent -- 0182 must apply first'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='entry_evidence_links'
     and column_name in ('document_id','firm_id','entry_id','released_at');
  if v_n <> 4 then
    raise exception '#821 prestate: clara.entry_evidence_links does not carry the four columns the opening arm probes on (% of 4)', v_n
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha is distinct from '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#821 prestate: clara._document_posting_entry has DRIFTED from the pinned 0182 body (sha %) -- re-derive both arms against the live probe before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0197's THREE FUNCTIONS, at the bodies this file reasons about. Two are re-pinned because
  -- this file leaves them alone; the third is the one it replaces, and a drifted body may carry
  -- an arm this replacement would delete.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._lock_document_binding(uuid)'::regprocedure;
  if v_sha is distinct from '5aeaf6fa369348ff32d30e85c99dde724f29bf378841a684f12fed7465909aff' then
    raise exception '#821 prestate: clara._lock_document_binding has DRIFTED from its 0197 body (sha %) -- this file does not replace it and must not leave a lock it cannot account for', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_evidence_link_binding_wall()'::regprocedure;
  if v_sha is distinct from '9ad9cfacc6af237e1e420694ec8bbc27fecf4ad1076ad1a9f7fc9a895f0a8093' then
    raise exception '#821 prestate: clara._tf_evidence_link_binding_wall has DRIFTED from its 0197 body (sha %) -- the partner wall this file deliberately leaves untouched', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if v_sha is distinct from 'd90c0b358e963aef9c0ca48d33daad76be43a5d795e27be0699439c6f881116b' then
    raise exception '#821 prestate: clara._tf_source_binding_wall is not at its 0197 body (sha %) -- either #821 has already been applied or a later file recut it; re-derive the opening arm against the live body', v_sha
      using errcode='CLR10';
  end if;

  -- THE DEFECT IS STILL THERE: both triggers still stop opening rows at the WHEN clause, and the
  -- body therefore knows nothing about the column.
  foreach v_sig in array array['t_source_binding_wall_ins','t_source_binding_wall_upd'] loop
    select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
     where t.tgrelid='clara.journal_entries'::regclass and not t.tgisinternal and t.tgname=v_sig;
    if v_def is null then
      raise exception '#821 prestate: % is absent -- 0197 must apply first', v_sig using errcode='CLR10';
    end if;
    if position('new.is_opening_balance = false' in v_def) = 0 then
      raise exception '#821 prestate: % no longer carries 0197''s opening carve-out -- the gap this file closes is not the gap that is open', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if position('is_opening_balance' in v_src) > 0 then
    raise exception '#821 prestate: clara._tf_source_binding_wall already branches on is_opening_balance -- the opening arm exists elsewhere; do not arm a second one'
      using errcode='CLR10';
  end if;

  -- THE LANE BEING GUARDED, and the marker the branch rests on.
  if to_regprocedure('clara._approve_opening_entry(uuid,uuid,uuid,text,integer)') is null then
    raise exception '#821 prestate: clara._approve_opening_entry is absent -- the opening lane this file walls no longer exists'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if position('is_opening_balance' in v_src) = 0 or position('status=''approved''' in v_src) = 0 then
    raise exception '#821 prestate: clara._approve_opening_entry no longer keys on is_opening_balance at the status flip -- that transition is the place this wall sits'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='journal_entries' and column_name='is_opening_balance'
     and is_nullable='NO';
  if v_n <> 1 then
    raise exception '#821 prestate: clara.journal_entries.is_opening_balance is absent or nullable -- a NULL there would send an opening row down the CODING arm'
      using errcode='CLR10';
  end if;

  -- The two BEFORE ROW walls whose precedence the unchanged trigger names preserve.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and (tgtype & 2) <> 0 and (tgtype & 1) <> 0
     and tgname in ('t_je_immutable','t_period_wall');
  if v_n <> 2 then
    raise exception '#821 prestate: clara.journal_entries does not carry BOTH BEFORE ROW walls t_je_immutable and t_period_wall (% of 2)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#821 prestate: clean -- 0182''s links table and its pinned _document_posting_entry probe are present, all three 0197 bodies are at their as-built shas, BOTH coding-wall triggers still carry the opening carve-out in their WHEN clauses (so the gap is still open and the body knows nothing of the column), clara._approve_opening_entry still flips is_opening_balance rows to approved, and both precedence-owning BEFORE ROW walls are in place.';
end
$w821_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE CODING WALL, RECUT WITH AN OPENING ARM.
--
-- `create or replace` preserves the owner, the SECURITY DEFINER flag, the pinned search_path and
-- the ACL 0197 §E revoked -- §C re-reads all four rather than trusting that.
--
-- The `else` arm is 0197's body verbatim. The opening arm asks rank 0's question alone, in rank
-- 0's own spelling (0182:581-583): a link for THIS document that is still live, firm-scoped
-- through the client. It is written out here rather than delegated because
-- `clara._document_posting_entry` answers a DIFFERENT, wider question, and a helper that
-- answered only half of it would be a second name for one lane's ranking -- the drift 0197's own
-- census was written to prevent. `limit 1` is not a choice between rows:
-- `uq_entry_evidence_links_document` is unique on `(document_id) where released_at is null`, so
-- at most one live link can exist for a document.
-- =====================================================================================
create or replace function clara._tf_source_binding_wall() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_posted uuid;
begin
  -- ORDER IS THE WHOLE MECHANISM: take the document, THEN ask. Reversed, this body is the bug it
  -- exists to close. §C probes the order positionally, for BOTH arms.
  perform clara._lock_document_binding(new.document_id);
  if new.is_opening_balance then
    -- #821 · THE OPENING ARM. One tie document, MANY opening items stays legal, so a sibling
    -- opening item is never the conflict here -- only a LIVE evidence link is.
    select l.entry_id into v_posted
      from clara.entry_evidence_links l
      join clara.clients c on c.id = new.client_id and c.firm_id = l.firm_id
     where l.document_id = new.document_id and l.released_at is null
     limit 1;
  else
    v_posted := clara._document_posting_entry(new.client_id, new.document_id);
  end if;
  -- `new.id` is excluded rather than assumed away. A BEFORE trigger's own row is not yet written,
  -- so the probe cannot rank it -- but an entry that somehow already stands as its own binding
  -- must not be refused for conflicting with itself.
  if v_posted is not null and v_posted <> new.id then
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', new.document_id, 'entry_id', v_posted, 'conflict', true)::text;
  end if;
  return new;
end $$;
comment on function clara._tf_source_binding_wall() is
  '#718 + #821: BOTH document lanes'' half of "one document, one posted entry", on the transition '
  'into status=approved for a non-reversal entry carrying a document_id. Takes '
  'clara._lock_document_binding FIRST, then asks -- clara._document_posting_entry (0182''s ONE '
  'probe) for a CODED entry, and, for an is_opening_balance entry, a LIVE clara.entry_evidence_'
  'links row for that client''s firm and document ALONE, because wave-B binds many opening items '
  'to one tie document by design and a sibling opening item is not a conflict. Either way it '
  'refuses CLR13 source_already_posted naming the conflicting entry -- the same pair '
  'clara.admit_journal_work and clara.attach_entry_evidence raise.';

-- =====================================================================================
-- §C(i)  THE TWO TRIGGERS, RECREATED WITHOUT THE CARVE-OUT.
--
-- Same names (so the precedence of `t_je_immutable` / `t_period_wall` is untouched), same events,
-- same remaining predicates; only `new.is_opening_balance = false` is dropped, because the body
-- now discriminates on that column instead of the trigger excluding on it. A WHEN clause on a
-- BEFORE INSERT may not reference OLD, which is why this is still two triggers and one body.
-- =====================================================================================
drop trigger t_source_binding_wall_ins on clara.journal_entries;
drop trigger t_source_binding_wall_upd on clara.journal_entries;
create trigger t_source_binding_wall_ins before insert on clara.journal_entries
  for each row when (new.document_id is not null and new.status = 'approved'
                     and new.reversal_of is null)
  execute function clara._tf_source_binding_wall();
create trigger t_source_binding_wall_upd before update on clara.journal_entries
  for each row when (new.document_id is not null and new.status = 'approved'
                     and new.reversal_of is null
                     and (old.status is distinct from 'approved'
                          or old.document_id is distinct from new.document_id))
  execute function clara._tf_source_binding_wall();

reset role;

-- =====================================================================================
-- §C  TAIL CENSUS. Everything above, re-read from the catalog.
-- =====================================================================================
do $w821_tail$
declare v_src text; v_n int; v_sig text; v_when text; v_sha text;
begin
  -- 1 · THE THREE FUNCTIONS, still exactly three, still trigger-only. `create or replace` keeps
  -- the ACL, and "keeps" is a claim, so it is measured.
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='clara' and p.proname in ('_lock_document_binding','_tf_source_binding_wall',
     '_tf_evidence_link_binding_wall');
  if v_n <> 3 then
    raise exception '#821 tail: the 0197 cohort is % functions, not 3 -- this file mints none and drops none', v_n
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara._lock_document_binding(uuid)',
      'clara._tf_source_binding_wall()', 'clara._tf_evidence_link_binding_wall()'] loop
    select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid = p.proowner
     where p.oid = v_sig::regprocedure
       and r.rolname = 'clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#821 tail: % is not a clara_fn_owner SECURITY DEFINER with a pinned search_path', v_sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception '#821 tail: PUBLIC holds EXECUTE on % -- the replace re-opened the ACL', v_sig
        using errcode='CLR10';
    end if;
    foreach v_when in array array['clara_authenticated','clara_runtime','clara_agent_ro'] loop
      if to_regrole(v_when) is not null
         and has_function_privilege(v_when, v_sig::regprocedure, 'execute') then
        raise exception '#821 tail: % is EXECUTE-reachable by % -- these bodies are trigger-only', v_sig, v_when
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- 2 · THE TWO BODIES THIS FILE LEFT ALONE, at their 0197 shas.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._lock_document_binding(uuid)'::regprocedure;
  if v_sha is distinct from '5aeaf6fa369348ff32d30e85c99dde724f29bf378841a684f12fed7465909aff' then
    raise exception '#821 tail: clara._lock_document_binding moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_evidence_link_binding_wall()'::regprocedure;
  if v_sha is distinct from '9ad9cfacc6af237e1e420694ec8bbc27fecf4ad1076ad1a9f7fc9a895f0a8093' then
    raise exception '#821 tail: clara._tf_evidence_link_binding_wall moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  -- …and 0182's probe, which this file re-pins rather than recuts.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha is distinct from '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#821 tail: clara._document_posting_entry moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- 3 · THE RECUT BODY: both arms, the branch, and the ORDER.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if position('new.is_opening_balance' in v_src) = 0 then
    raise exception '#821 tail: the coding wall does not branch on is_opening_balance -- the carve-out left the trigger without arriving in the body'
      using errcode='CLR10';
  end if;
  if position('clara._document_posting_entry' in v_src) = 0 then
    raise exception '#821 tail: the NON-opening arm no longer reuses clara._document_posting_entry'
      using errcode='CLR10';
  end if;
  if position('entry_evidence_links' in v_src) = 0 or position('released_at is null' in v_src) = 0 then
    raise exception '#821 tail: the opening arm does not probe a LIVE clara.entry_evidence_links row'
      using errcode='CLR10';
  end if;
  if position('clara._lock_document_binding' in v_src) = 0 then
    raise exception '#821 tail: the wall no longer takes clara._lock_document_binding at all'
      using errcode='CLR10';
  end if;
  if position('clara._lock_document_binding' in v_src) > position('clara._document_posting_entry' in v_src)
     or position('clara._lock_document_binding' in v_src) > position('entry_evidence_links' in v_src) then
    raise exception '#821 tail: the wall asks BEFORE it locks on at least one arm -- that is the read-then-write race 0197 exists to close'
      using errcode='CLR10';
  end if;
  -- ONE REFUSAL, ONE SPELLING: still 0182's token, still exactly one raise, still no second
  -- vocabulary for a conflict the estate already names.
  if position('source_already_posted' in v_src) = 0 then
    raise exception '#821 tail: the wall does not raise source_already_posted' using errcode='CLR10';
  end if;
  if position('source_conflict' in v_src) > 0 then
    raise exception '#821 tail: the wall mints a second spelling (source_conflict) for a refusal 0182 already names'
      using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', ''))) / length('raise exception');
  if v_n <> 1 then
    raise exception '#821 tail: the wall carries % raises, not 1 -- both arms refuse through the SAME statement', v_n
      using errcode='CLR10';
  end if;

  -- 4 · THE TWO TRIGGERS: same names, same timing, same events, and the carve-out GONE from both
  -- WHEN clauses while every other predicate stays.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and tgname='t_source_binding_wall_ins' and (tgtype & 2)<>0 and (tgtype & 1)<>0
     and (tgtype & 4)<>0 and (tgtype & 16)=0;
  if v_n <> 1 then
    raise exception '#821 tail: t_source_binding_wall_ins is not a BEFORE INSERT ROW trigger on clara.journal_entries'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and tgname='t_source_binding_wall_upd' and (tgtype & 2)<>0 and (tgtype & 1)<>0
     and (tgtype & 16)<>0 and (tgtype & 4)=0;
  if v_n <> 1 then
    raise exception '#821 tail: t_source_binding_wall_upd is not a BEFORE UPDATE ROW trigger on clara.journal_entries'
      using errcode='CLR10';
  end if;
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and tgname='t_source_binding_wall_ins';
  foreach v_sig in array array['new.document_id IS NOT NULL', 'new.status = ''approved''',
      'new.reversal_of IS NULL'] loop
    if position(v_sig in v_when) = 0 then
      raise exception '#821 tail: t_source_binding_wall_ins lost its WHEN predicate %', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('is_opening_balance' in v_when) > 0 then
    raise exception '#821 tail: t_source_binding_wall_ins still excludes opening rows at the trigger -- the body''s new arm would be dead code'
      using errcode='CLR10';
  end if;
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and tgname='t_source_binding_wall_upd';
  foreach v_sig in array array['new.document_id IS NOT NULL', 'new.status = ''approved''',
      'new.reversal_of IS NULL', 'old.status IS DISTINCT FROM ''approved''',
      'old.document_id IS DISTINCT FROM new.document_id'] loop
    if position(v_sig in v_when) = 0 then
      raise exception '#821 tail: t_source_binding_wall_upd lost its WHEN predicate %', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('is_opening_balance' in v_when) > 0 then
    raise exception '#821 tail: t_source_binding_wall_upd still excludes opening rows at the trigger'
      using errcode='CLR10';
  end if;

  -- 4b · THE EVIDENCE WALL IS UNTOUCHED, WHEN clause and all: it fires on EVERY link insert, and
  -- a carve-out there would weaken 0182 rather than preserve it.
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.entry_evidence_links'::regclass and tgname='t_entry_evidence_links_binding_wall';
  if v_when is null or position('WHEN' in v_when) > 0 or position('is_opening_balance' in v_when) > 0 then
    raise exception '#821 tail: the evidence wall is missing or gained a WHEN clause' using errcode='CLR10';
  end if;

  -- 5 · THE NAMES STILL SORT AFTER BOTH EXISTING BEFORE ROW WALLS, which is what keeps a
  -- closed-period refusal a period refusal rather than a re-spelled CLR13.
  if not ('t_source_binding_wall_ins' > 't_je_immutable'
          and 't_source_binding_wall_ins' > 't_period_wall'
          and 't_source_binding_wall_upd' > 't_je_immutable'
          and 't_source_binding_wall_upd' > 't_period_wall') then
    raise exception '#821 tail: the wall trigger names no longer sort after t_je_immutable / t_period_wall'
      using errcode='CLR10';
  end if;

  -- 6 · THE OPENING APPROVER IS UNRECUT, at the body this file guards from the outside.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if v_sha is distinct from '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7' then
    raise exception '#821 tail: clara._approve_opening_entry moved during this migration (sha %) -- the guard belongs on the column transition, not in the approver', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#821 tail: OK -- the opening-balance lane now looks back at the evidence links, and only at them. clara._tf_source_binding_wall still takes clara._lock_document_binding FIRST and then branches: a NON-opening row asks 0182''s clara._document_posting_entry exactly as 0197 wrote it, an is_opening_balance row asks for a LIVE clara.entry_evidence_links row for that client''s firm and document ALONE -- so one tie document with many sibling opening items stays legal while a document already bound by the work/evidence lane is refused. Both arms refuse through ONE raise: CLR13 with reason source_already_posted, the document, the conflicting entry and conflict=true, byte-identical to clara.admit_journal_work''s and clara.attach_entry_evidence''s arms; no new token, no new error code. Both journal_entries triggers were recreated under their EXISTING names without the is_opening_balance carve-out (so the body''s branch is reachable and the precedence of t_je_immutable / t_period_wall is untouched), the evidence wall keeps its WHEN-less every-insert firing, and this file minted no function and no trigger: the 0197 cohort is still exactly three trigger-only clara_fn_owner SECURITY DEFINERs with pinned search_paths and no EXECUTE for PUBLIC or any application role. clara._lock_document_binding, clara._tf_evidence_link_binding_wall, clara._document_posting_entry and clara._approve_opening_entry are all re-read at their pinned shas: unmoved.';
end
$w821_tail$;
