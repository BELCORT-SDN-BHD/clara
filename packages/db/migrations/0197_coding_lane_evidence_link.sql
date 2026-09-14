-- 0197_coding_lane_evidence_link — #718 (parent invariant: 0182 §A, "ONE DOCUMENT, ONE POSTED
-- ENTRY"): THE DOCUMENT-CODING LANE LOOKS BACK AT THE EVIDENCE LINKS, AND THE TWO LANES FINALLY
-- SERIALIZE ON THE SAME OBJECT.
-- =====================================================================================
-- Spec of record: issue #718 (Agent Brief, 2026-09-13), verified at 551eefae. ARCHITECTURE §4's
-- 0182 paragraph is the evidence-links law this file completes. Ticket #718. This file closes the
-- ONE measured gap below and nothing else.
--
-- WHAT WAS MEASURED ON THE 0194 FRONTIER, AND IS WRONG.
--
--   The one-document / one-posted-entry invariant is enforced from the WORK-EVIDENCE side only.
--   0182 refuses `source_already_posted` at admission (0182:710), `source_conflict`/
--   `already_posted` at commit (0182:937) and at the commit path's own index handler (0182:1014),
--   and `source_already_posted` at the late door (0182:1157, 1202) — and its one probe,
--   `clara._document_posting_entry` (0182:578), reads BOTH lanes: a LIVE `clara.entry_evidence_
--   links` row (rank 0) and the coding lane's `clara.journal_entries.document_id` on an approved,
--   not-reversed entry (rank 1).
--
--   THE CODING LANE DOES NOT LOOK BACK. `clara._draft_entry_core` (live body: 0016 §B7) asks ONE
--   question about a document before drafting — `filing_id = v_filing and status='approved' and
--   reversed_by is null`, raising CLR21 `double_coded` — and `clara.entry_evidence_links` appears
--   in NO migration before 0182 and in NEITHER of the two coding bodies at HEAD (re-measured in
--   §A below, not assumed). A document that already holds a LIVE evidence link can therefore be
--   drafted and approved through `draft_entry` -> `approve_entry`, and the estate ends with TWO
--   posted entries standing on ONE document — reachable only through the autodraft /
--   document-coding path, which is why every 0182 cell is green on an estate that has it.
--
-- =====================================================================================
-- THE CHOICE THIS FILE MAKES, AND WHY: A TRIGGER ON THE COLUMN TRANSITION, NOT AN ARM IN A BODY.
--
-- #718 offers two shapes — an arm inside `clara._draft_entry_core`'s approval branch, or a BEFORE
-- trigger on `clara.journal_entries`. Three measured facts decide it.
--
--   1. `clara._draft_entry_core` HAS NO APPROVAL BRANCH. It is the DRAFT writer; it returns
--      `'status','draft'` and never writes `status='approved'` (0016:3970-4250, re-read against
--      the live catalog). The approval this ticket is about happens in
--      `clara._approve_entry_core` (0016 §1220) — so "an arm in the draft core" would have to
--      become a recut of the APPROVE core instead, a 300-line live writer body, to place one
--      four-line check.
--
--   2. THE COLUMN IS THE ONLY PLACE ALL THE APPROVERS PASS THROUGH. This is 0182's own reasoning
--      for `t_entry_evidence_release`, quoted from that file's §A: "`set reversed_by =` has
--      sixteen call sites across the estate … A trigger on the column is the only place all
--      sixteen pass through, and it is why this file recuts none of them." `status='approved'`
--      has the same shape: `clara._approve_entry_core`, `clara.reverse_entry`'s straight-through
--      arm, `clara._agent_post_entry_core`, `clara._record_journal_entry_core`. An arm in one
--      body is a wall one lane can walk around; a trigger on the transition is a wall none can.
--      THIS FILE THEREFORE RECUTS NO FUNCTION BODY AT ALL — it adds three functions and three
--      triggers, and §F re-reads `clara._document_posting_entry` and `clara._draft_entry_core`
--      to prove neither moved.
--
--   3. …AND ONLY A TRIGGER PAIR GIVES THE TWO-SESSION RACE A REAL SERIALIZATION POINT. This is
--      the deciding fact, and it is the half a check-inside-the-writer cannot buy at any price.
--      See the next block.
--
-- =====================================================================================
-- THE RACE, AND THE ONE OBJECT BOTH LANES NOW TAKE.
--
-- The two lanes write DIFFERENT relations: the coding lane writes `clara.journal_entries`
-- (`document_id` + `status='approved'`), the evidence lane writes `clara.entry_evidence_links`.
-- `uq_entry_evidence_links_document` — 0182's structural half — spans the SECOND relation only,
-- so it cannot see the first at all. Two sessions, each past its own read, each writing its own
-- table, both commit. Two posted entries on one document, and no index anywhere was violated.
--
--   AN ASYMMETRIC LOCK DOES NOT CLOSE IT, and it is worth saying why, because the FK makes it
--   look as though it might. `fk_entry_evidence_links_document` (0182:320) takes `FOR KEY SHARE`
--   on `clara.documents` when a link is inserted, and `FOR UPDATE` conflicts with `FOR KEY
--   SHARE` — so a coding approval that took `FOR UPDATE` WOULD block a concurrent link insert.
--   But the FK's lock is taken by an AFTER-ROW referential trigger, i.e. AFTER the evidence
--   lane has already decided: unblocking it re-checks that the DOCUMENT ROW still exists, never
--   that the lane's own `_document_posting_entry` read still holds. The loser would commit its
--   link on top of a coded entry it read as absent.
--
--   SO BOTH LANES TAKE THE SAME LOCK, AND BOTH ASK AFTER TAKING IT. `clara._lock_document_
--   binding` (§B) is that one object — `select … from clara.documents where id = … for update` —
--   and the two walls (§C, §D) call it as their FIRST statement and `clara._document_posting_
--   entry` as their second. Whichever session arrives first holds the document row until it
--   commits; the second blocks there (`wait_event_type = 'Lock'`, asserted in the battery), and
--   its re-read — a new statement, therefore a new READ COMMITTED snapshot — sees the winner.
--   Exactly one posted entry, in either arrival order.
--
--   WHY `clara.documents` AND NOT AN ADVISORY LOCK. The document row is the thing both lanes are
--   contending FOR; it exists for every case this wall covers, it is already the parent both
--   relations reference, and a row lock leaves no hashed key space in which two different
--   documents could collide. The estate's own precedent is 0027's documents-before-filings lock
--   order, which this file does not disturb: neither wall takes a second row lock.
--
--   DEADLOCK, MEASURED RATHER THAN HOPED. The coding wall runs inside an UPDATE that already
--   holds the entry's own row lock, and then takes the document; the evidence wall takes the
--   document and then (through `fk_entry_evidence_links_entry`, AFTER the insert) KEY SHARE on
--   an entry row. Those are opposite orders — but never on the SAME entry: `clara.attach_entry_
--   evidence` refuses anything that is not already `approved` (0182:1099) and `clara._agent_
--   post_entry_core` attaches to the entry it just minted in its own transaction, while the
--   coding wall fires only on the draft -> approved transition. The two lock sets are disjoint by
--   construction. Were a future door to break that, 40P01 aborts one side — which still leaves
--   exactly one posted entry, the property this file is actually defending.
--
-- =====================================================================================
-- WHAT THE WALLS SAY, AND WHY THE WIRE VOCABULARY DOES NOT GROW.
--
--   THE CODING WALL (§C) raises `CLR13` with `detail.reason = 'source_already_posted'` and
--   `detail.entry_id` naming the conflicting entry — byte-for-byte the shape 0182's admission
--   arm (0182:713) and late door (0182:1160) already raise, because it IS the same refusal seen
--   from the other side. No new token is minted.
--
--   THE EVIDENCE WALL (§D) is the serialization PARTNER, and it speaks in the voice of the door
--   that reached it: `attached_via = 'work_commit'` raises `(CLR13, source_conflict,
--   already_posted)` — the exact pair `clara._agent_post_entry_core`'s own `unique_violation`
--   handler raises (0182:1012-1018) — and `attached_via = 'late_attachment'` raises `(CLR13,
--   source_already_posted)`, the exact pair `clara.attach_entry_evidence`'s handler raises
--   (0182:1199-1206). One document, one refusal, and every existing classifier
--   (`claraWork.v2.errors.ts`'s `["CLR13","source_conflict","refusal"]`, and its documented
--   `state_changed` default for an unrecognised CLR13) keeps the answer it already had.
--
--   NEITHER WALL RE-ASKS THE QUESTION ITSELF. Both call `clara._document_posting_entry` and
--   nothing else; neither names `clara.entry_evidence_links` in its own body. §F probes that
--   negatively, because a second copy of the ranking is exactly how the two lanes drift apart
--   again.
--
--   BOTH WALLS SKIP THE ROW THAT IS ASKING. `v_posted <> new.id` (coding) and `v_posted <>
--   new.entry_id` (evidence) are not defensive noise: the evidence wall is a BEFORE INSERT
--   precisely so the probe cannot see the row being written (rank 0 would mask rank 1 through
--   `order by rank limit 1`), and the guard makes `clara.attach_entry_evidence`'s REPLAY arm —
--   same entry, same document, a lost response repeated — fall through to
--   `uq_entry_evidence_links_entry` and its existing handler, untouched.
--
-- =====================================================================================
-- THREE THINGS THIS FILE DELIBERATELY DOES NOT DO.
--
--   * IT DOES NOT REFUSE AT DRAFT. The coding lane may still DRAFT a coded entry on a document
--     that holds a live link; it may not APPROVE one. That is #718's own wording ("the coding
--     lane's APPROVAL path"), and it is the honest placement: a draft is a proposal a human is
--     about to look at, the conflicting link can be released by a reversal before they approve,
--     and `clara._draft_entry_core`'s existing CLR21 `double_coded` arm keeps covering the case
--     the coding lane can already see.
--
--   * IT DOES NOT TOUCH REVERSAL-RELEASE SEMANTICS (#718 out of scope). `t_entry_evidence_
--     release` still releases the link when the entry is reversed, and `clara._document_posting_
--     entry` still ignores released links and reversed entries — so a corrected JV may cite the
--     same invoice, which the battery cells.
--
--   * IT ADDS NO NEW REFUSAL TO THE REVERSAL PATH. `clara.reverse_entry`'s mirror is inserted
--     with NO `document_id` (0009:1718-1721) and the coding wall's WHEN clause additionally
--     requires `new.reversal_of is null`, so the straight-through reversal of a coded entry is
--     structurally outside this wall.
--
--   * IT DOES NOT TOUCH THE OPENING-BALANCE LANE, and that carve-out is MEASURED rather than
--     assumed. Wave-B's opening seed binds MANY opening items to ONE tie document by design: a
--     single opening-balance document backs the GL-balance item, the fixed-asset acquisition
--     entry and every other item of the same seed, and `clara._approve_opening_entry` (0037:2410)
--     approves each of them in turn against that one `document_id`. Measured on a from-scratch
--     rig, those entries are `origin='manual'`, `is_opening_balance = true`, and a first cut of
--     this file WITHOUT the carve-out refused the second item of the seed
--     (`packages/db/tests/x42-s5-residuals.test.mjs` cell x42.s5.2c, CLR13 raised from inside
--     `_approve_opening_entry`'s own status flip). "One document, one posted entry" was never a
--     claim about that lane — an opening TIE document is a tie-out, not a source an entry is
--     coded FROM — so the CODING wall's two WHEN clauses carry `new.is_opening_balance = false`,
--     and the discriminator is the column the opening lane's own approver already requires to be
--     true. What #718 asked for is the DOCUMENT-CODING lane, and that is exactly what is walled.
--     Extending the invariant over the opening lane would be a different ticket with a different
--     answer, and is not silently started here.
--
--     THE EVIDENCE WALL CARRIES NO SUCH CARVE-OUT, deliberately. It refuses whatever
--     `clara._document_posting_entry` already answers, and 0182's three doors refuse an opening
--     tie document TODAY through that same probe (their own pre-checks call it). Teaching the
--     link wall to ignore opening entries would not preserve behaviour — it would WEAKEN 0182,
--     which is not this file's to do.
--
-- CONSUMER ORDER. This file owes NO consumer-first obligation and NO writer-quiescence window
-- for function-body replacement: it replaces no body. Its three triggers arm at COMMIT; a call
-- already executing finishes without them, and the only thing that becomes illegal after the
-- migration is the double posting #718 is about. Its rollback is a successor migration dropping
-- the three triggers.
--
-- TRIGGER NAMES, AND WHY TWO OF THEM ARE NOT `t_je_*`. PostgreSQL fires same-timing row triggers
-- in NAME order, and `clara.journal_entries` already carries two BEFORE ROW walls: `t_je_
-- immutable` and `t_period_wall`. `t_source_binding_wall_{ins,upd}` sorts AFTER both, so every
-- refusal those two already own keeps its exact spelling — a closed-period approval is still a
-- period refusal, not a CLR13. The `t_je_` prefix would have sorted this file's wall in FRONT of
-- them and silently re-spelled refusals nobody asked about.
-- =====================================================================================

-- =====================================================================================
-- §A  PRESTATE. What this file assumes about the world, measured rather than remembered.
-- =====================================================================================
do $w718_pre$
declare v_sha text; v_src text; v_n int;
begin
  -- 0182's lane, whole. A partial one would make the probe below answer for a shape that is not
  -- the shape the walls were derived against.
  if to_regclass('clara.entry_evidence_links') is null then
    raise exception '#718 prestate: clara.entry_evidence_links is absent -- 0182 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.uq_entry_evidence_links_document') is null then
    raise exception '#718 prestate: uq_entry_evidence_links_document is absent -- 0182''s structural half is the shape these walls partner'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._document_posting_entry(uuid,uuid)') is null then
    raise exception '#718 prestate: clara._document_posting_entry is absent -- the ONE probe both walls reuse'
      using errcode='CLR10';
  end if;

  -- THE PROBE IS PINNED, because both walls lean on its EXACT ranking: rank 0 = a LIVE link,
  -- rank 1 = an approved not-reversed coded entry, `order by rank limit 1`, firm-scoped through
  -- the client. A probe that had since been re-ranked would silently change which entry the
  -- refusals name and which row the BEFORE-INSERT placement protects against masking.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_sha <> '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#718 prestate: clara._document_posting_entry has DRIFTED from the pinned 0182 body (sha %) -- re-derive both walls against the live probe before applying', v_sha
      using errcode='CLR10';
  end if;

  -- THE DEFECT IS STILL THERE. Not a formality: if a later recut had already taught either
  -- coding body to read the links, these triggers would be a SECOND wall over one fact, and the
  -- refusal a caller saw would depend on which one happened to run first.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception '#718 prestate: clara._draft_entry_core is absent at its pinned 19-argument signature'
      using errcode='CLR10';
  end if;
  if position('entry_evidence_links' in v_src) > 0 then
    raise exception '#718 prestate: clara._draft_entry_core already reads entry_evidence_links -- the coding lane gained a lookback elsewhere; do not arm a second one'
      using errcode='CLR10';
  end if;
  if position('double_coded' in v_src) = 0 then
    raise exception '#718 prestate: clara._draft_entry_core lost its CLR21 double_coded arm -- the filing-scoped half this file does NOT replace'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception '#718 prestate: clara._approve_entry_core is absent at its pinned 5-argument signature'
      using errcode='CLR10';
  end if;
  if position('entry_evidence_links' in v_src) > 0 then
    raise exception '#718 prestate: clara._approve_entry_core already reads entry_evidence_links -- the approval path gained a lookback elsewhere; do not arm a second one'
      using errcode='CLR10';
  end if;

  -- Nothing of this file exists yet, under any of its four names.
  if to_regprocedure('clara._lock_document_binding(uuid)') is not null
     or to_regprocedure('clara._tf_source_binding_wall()') is not null
     or to_regprocedure('clara._tf_evidence_link_binding_wall()') is not null then
    raise exception '#718 prestate: a #718 wall function already exists' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgname in ('t_source_binding_wall_ins','t_source_binding_wall_upd',
                    't_entry_evidence_links_binding_wall')
     and not tgisinternal;
  if v_n <> 0 then
    raise exception '#718 prestate: a #718 trigger already exists (% of 3)', v_n using errcode='CLR10';
  end if;

  -- THE OPENING-LANE CARVE-OUT'S OWN PREMISE. `clara._approve_opening_entry` is the approver
  -- that binds many opening items to one tie document, and `is_opening_balance` is the marker it
  -- requires. If either is gone, the WHEN clauses below are excluding a lane that no longer
  -- exists — which is a silently narrower wall, not a safer one.
  if to_regprocedure('clara._approve_opening_entry(uuid,uuid,uuid,text,integer)') is null then
    raise exception '#718 prestate: clara._approve_opening_entry is absent -- the opening lane the coding wall carves out no longer exists; re-derive the WHEN clauses'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if position('is_opening_balance' in v_src) = 0 then
    raise exception '#718 prestate: clara._approve_opening_entry no longer keys on is_opening_balance -- that column is the discriminator the carve-out rests on'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='journal_entries' and column_name='is_opening_balance'
     and is_nullable='NO';
  if v_n <> 1 then
    raise exception '#718 prestate: clara.journal_entries.is_opening_balance is absent or nullable -- a NULL there would make the coding wall''s WHEN clause skip the row silently'
      using errcode='CLR10';
  end if;

  -- The two BEFORE ROW walls whose precedence the trigger NAMES are chosen to preserve. If they
  -- are not there, the naming rationale in this file's header is about a world that moved.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and (tgtype & 2) <> 0 and (tgtype & 1) <> 0
     and tgname in ('t_je_immutable','t_period_wall');
  if v_n <> 2 then
    raise exception '#718 prestate: clara.journal_entries does not carry BOTH BEFORE ROW walls t_je_immutable and t_period_wall (% of 2)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#718 prestate: clean -- 0182''s links table, its document-scoped unique index and its pinned _document_posting_entry probe are all present; NEITHER coding body reads entry_evidence_links (the defect this file closes is still open) and the draft core still carries its own CLR21 double_coded arm; none of this file''s three functions or three triggers exists; clara._approve_opening_entry still keys on the NOT NULL is_opening_balance marker the coding wall carves out on; and journal_entries carries both BEFORE ROW walls whose precedence the trigger names preserve.';
end
$w718_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE ONE OBJECT BOTH LANES TAKE.
--
-- A function rather than two inline `select … for update`s, for the reason the header states and
-- §F probes: "both lanes take the SAME lock" is a claim about ONE spelling, and two copies of a
-- lock statement is exactly the shape that drifts into two different locks. It is `for update`
-- (not `for share`, not `for no key update`) because `for update` is the only mode that conflicts
-- with EVERY other row-lock mode, including the `for key share` that `fk_entry_evidence_links_
-- document` takes behind the evidence lane's own insert.
--
-- A DOCUMENT THAT DOES NOT EXIST LOCKS NOTHING AND RAISES NOTHING. That is not a hole: the probe
-- that follows would answer NULL for it anyway, and the FK on each lane's own write is what says
-- the document is real.
-- =====================================================================================
create function clara._lock_document_binding(p_document uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.documents d where d.id = p_document for update;
end $$;
comment on function clara._lock_document_binding(uuid) is
  '#718: the ONE row lock the document-coding lane and the accounting-work evidence lane both '
  'take before asking clara._document_posting_entry. FOR UPDATE on clara.documents, which is the '
  'row both lanes are contending for; it is what turns two read-then-write sequences into a '
  'serialized pair. Granted to nobody: it is reachable only from this file''s two triggers.';

-- =====================================================================================
-- §C  THE CODING LANE'S WALL — `clara.journal_entries`, on the transition into `approved`.
--
-- The refusal is 0182's `source_already_posted`, named and shaped identically, because it is the
-- same refusal: this document already backs a posted entry, here is which one, open impact /
-- correction rather than mint a second effect.
-- =====================================================================================
create function clara._tf_source_binding_wall() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_posted uuid;
begin
  -- ORDER IS THE WHOLE MECHANISM: take the document, THEN ask. Reversed, this body is the bug it
  -- exists to close. §F probes the order positionally.
  perform clara._lock_document_binding(new.document_id);
  v_posted := clara._document_posting_entry(new.client_id, new.document_id);
  -- `new.id` is excluded rather than assumed away. A BEFORE trigger's own row is not yet written,
  -- so the probe cannot rank it — but an entry that somehow already stands as its own binding
  -- must not be refused for conflicting with itself.
  if v_posted is not null and v_posted <> new.id then
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', new.document_id, 'entry_id', v_posted, 'conflict', true)::text;
  end if;
  return new;
end $$;
comment on function clara._tf_source_binding_wall() is
  '#718: the document-coding lane''s half of "one document, one posted entry". Fires on the '
  'transition into status=approved for a non-reversal entry carrying a document_id, takes '
  'clara._lock_document_binding and then asks clara._document_posting_entry (0182''s ONE probe, '
  'reused rather than restated), and refuses CLR13 source_already_posted naming the conflicting '
  'entry -- the same pair clara.admit_journal_work and clara.attach_entry_evidence raise.';

-- TWO TRIGGERS, ONE BODY: a WHEN clause on a BEFORE INSERT may not reference OLD, so the INSERT
-- and UPDATE conditions cannot be one trigger. The UPDATE arm covers BOTH transitions #718 names
-- — status becoming approved, and document_id becoming non-null on an entry that already is.
-- (`t_je_immutable` sorts BEFORE this wall and owns the second case on an approved row, so its
-- CLR08 keeps its spelling; this arm is what covers a DRAFT whose document arrives late.)
--
-- `new.is_opening_balance = false` is the OPENING-LANE CARVE-OUT (see the header): wave-B's
-- opening seed binds many items to one tie document on purpose, and this wall is the
-- DOCUMENT-CODING lane's. The predicate names the column `clara._approve_opening_entry` itself
-- requires to be true, so the two lanes are separated by the lane's own marker rather than by a
-- guess about origins.
create trigger t_source_binding_wall_ins before insert on clara.journal_entries
  for each row when (new.document_id is not null and new.status = 'approved'
                     and new.reversal_of is null and new.is_opening_balance = false)
  execute function clara._tf_source_binding_wall();
create trigger t_source_binding_wall_upd before update on clara.journal_entries
  for each row when (new.document_id is not null and new.status = 'approved'
                     and new.reversal_of is null and new.is_opening_balance = false
                     and (old.status is distinct from 'approved'
                          or old.document_id is distinct from new.document_id))
  execute function clara._tf_source_binding_wall();

-- =====================================================================================
-- §D  THE EVIDENCE LANE'S WALL — `clara.entry_evidence_links`, BEFORE INSERT.
--
-- This is the SERIALIZATION PARTNER, not a second opinion. 0182's three doors already ask
-- `clara._document_posting_entry` before they write; what they could not do is hold anything
-- while they asked. This wall makes their ask and their write one serialized act against the
-- coding lane, and says nothing they do not already say.
--
-- BEFORE, NOT AFTER, and the reason is `order by rank limit 1`: after the insert the row being
-- written IS a live link (rank 0) for its own document, and rank 0 masks the rank-1 coded entry
-- this wall exists to find. Before the insert the probe sees only the world that was already
-- there.
--
-- IT NEVER PREEMPTS THE INDEX'S OWN CASES. `uq_entry_evidence_links_entry` (a second link on one
-- entry) and the REPLAY (same entry, same document) are both left to 0182's handlers: the first
-- because this wall asks about the DOCUMENT and finds it free, the second because of the
-- `new.entry_id` guard.
-- =====================================================================================
create function clara._tf_evidence_link_binding_wall() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_posted uuid;
begin
  perform clara._lock_document_binding(new.document_id);
  v_posted := clara._document_posting_entry(new.client_id, new.document_id);
  if v_posted is not null and v_posted <> new.entry_id then
    -- ONE REFUSAL, IN THE VOICE OF THE DOOR THAT REACHED IT. Both spellings are already this
    -- lane's own (0182:1014 and 0182:1202); minting a third for a conflict detected one
    -- statement earlier would make a run classify its own refusal as unmapped.
    if new.attached_via = 'work_commit' then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', new.document_id, 'entry_id', v_posted,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
    raise exception 'that document already backs a posted journal entry'
      using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
        'document_id', new.document_id, 'entry_id', v_posted, 'conflict', true)::text;
  end if;
  return new;
end $$;
comment on function clara._tf_evidence_link_binding_wall() is
  '#718: the accounting-work evidence lane''s half of the SAME serialization. Takes '
  'clara._lock_document_binding before asking clara._document_posting_entry, so 0182''s three '
  'doors ask and write as one serialized act against a concurrent coding-lane approval. Refuses '
  'CLR13 source_conflict/already_posted on the work_commit path and CLR13 source_already_posted '
  'on the late-attachment path -- the exact pairs those two doors'' own unique_violation handlers '
  'raise. It preempts none of the index''s own cases.';

create trigger t_entry_evidence_links_binding_wall before insert on clara.entry_evidence_links
  for each row execute function clara._tf_evidence_link_binding_wall();

reset role;

-- =====================================================================================
-- §E  LOCKDOWN. PostgreSQL grants EXECUTE to PUBLIC on every new function; ALTER DEFAULT
-- PRIVILEGES is a confirmed no-op for that hardwired default (rig-isolation T17b). All three
-- bodies are reachable ONLY from this file's own triggers, so the revoke is the whole ACL.
-- =====================================================================================
revoke all on function clara._lock_document_binding(uuid) from public;
revoke all on function clara._tf_source_binding_wall() from public;
revoke all on function clara._tf_evidence_link_binding_wall() from public;

-- =====================================================================================
-- §F  TAIL CENSUS. Everything above, re-read from the catalog.
-- =====================================================================================
do $w718_tail$
declare v_src text; v_n int; v_sig text; v_when text;
begin
  -- 1 · THE THREE FUNCTIONS: owner, SECURITY DEFINER, pinned search_path, PUBLIC revoked, and
  -- EXECUTE-reachable by no application role at all.
  foreach v_sig in array array['clara._lock_document_binding(uuid)',
      'clara._tf_source_binding_wall()', 'clara._tf_evidence_link_binding_wall()'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#718 tail: % was not created', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
      join pg_roles r on r.oid = p.proowner
     where p.oid = v_sig::regprocedure
       and r.rolname = 'clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#718 tail: % is not a clara_fn_owner SECURITY DEFINER with a pinned search_path', v_sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception '#718 tail: PUBLIC still holds EXECUTE on %', v_sig using errcode='CLR10';
    end if;
    foreach v_when in array array['clara_authenticated','clara_runtime','clara_agent_ro'] loop
      if to_regrole(v_when) is not null
         and has_function_privilege(v_when, v_sig::regprocedure, 'execute') then
        raise exception '#718 tail: % is EXECUTE-reachable by % -- these bodies are trigger-only', v_sig, v_when
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- 2 · THE THREE TRIGGERS: on the right relations, BEFORE ROW, on the right events.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and tgname='t_source_binding_wall_ins' and (tgtype & 2)<>0 and (tgtype & 1)<>0
     and (tgtype & 4)<>0 and (tgtype & 16)=0;
  if v_n <> 1 then
    raise exception '#718 tail: t_source_binding_wall_ins is not a BEFORE INSERT ROW trigger on clara.journal_entries'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal
     and tgname='t_source_binding_wall_upd' and (tgtype & 2)<>0 and (tgtype & 1)<>0
     and (tgtype & 16)<>0 and (tgtype & 4)=0;
  if v_n <> 1 then
    raise exception '#718 tail: t_source_binding_wall_upd is not a BEFORE UPDATE ROW trigger on clara.journal_entries'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.entry_evidence_links'::regclass and not tgisinternal
     and tgname='t_entry_evidence_links_binding_wall'
     and (tgtype & 2)<>0 and (tgtype & 1)<>0 and (tgtype & 4)<>0;
  if v_n <> 1 then
    raise exception '#718 tail: t_entry_evidence_links_binding_wall is not a BEFORE INSERT ROW trigger on clara.entry_evidence_links'
      using errcode='CLR10';
  end if;

  -- 3 · THE WHEN CLAUSES, by their literal text. The coding wall's whole scope lives here: an
  -- approved, non-reversal, document-carrying row, on the transition INTO that state.
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and tgname='t_source_binding_wall_ins';
  foreach v_sig in array array['new.document_id IS NOT NULL', 'new.status = ''approved''',
      'new.reversal_of IS NULL', 'new.is_opening_balance = false'] loop
    if position(v_sig in v_when) = 0 then
      raise exception '#718 tail: t_source_binding_wall_ins lost its WHEN predicate %', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and tgname='t_source_binding_wall_upd';
  foreach v_sig in array array['new.document_id IS NOT NULL', 'new.status = ''approved''',
      'new.reversal_of IS NULL', 'new.is_opening_balance = false',
      'old.status IS DISTINCT FROM ''approved''',
      'old.document_id IS DISTINCT FROM new.document_id'] loop
    if position(v_sig in v_when) = 0 then
      raise exception '#718 tail: t_source_binding_wall_upd lost its WHEN predicate %', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE TRIGGER NAMES SORT AFTER BOTH EXISTING BEFORE ROW WALLS, which is what keeps a
  -- closed-period refusal a period refusal. Asserted as a comparison, not as a claim in prose.
  if not ('t_source_binding_wall_ins' > 't_period_wall'
          and 't_source_binding_wall_upd' > 't_je_immutable'
          and 't_source_binding_wall_upd' > 't_period_wall') then
    raise exception '#718 tail: the wall trigger names no longer sort after t_je_immutable / t_period_wall'
      using errcode='CLR10';
  end if;

  -- 5 · BOTH WALLS TAKE THE LOCK BEFORE THEY ASK, and neither restates the probe. Positional,
  -- because the ORDER is the mechanism and a second copy of the ranking is how the lanes drift.
  foreach v_sig in array array['clara._tf_source_binding_wall()',
      'clara._tf_evidence_link_binding_wall()'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('clara._lock_document_binding' in v_src) = 0 then
      raise exception '#718 tail: % does not take clara._lock_document_binding at all', v_sig
        using errcode='CLR10';
    end if;
    if position('clara._document_posting_entry' in v_src) = 0 then
      raise exception '#718 tail: % does not reuse clara._document_posting_entry', v_sig
        using errcode='CLR10';
    end if;
    if position('clara._lock_document_binding' in v_src)
       > position('clara._document_posting_entry' in v_src) then
      raise exception '#718 tail: % asks BEFORE it locks -- that is the read-then-write race this file exists to close', v_sig
        using errcode='CLR10';
    end if;
    if position('entry_evidence_links' in v_src) > 0 then
      raise exception '#718 tail: % restates the evidence-link lookup instead of reusing clara._document_posting_entry', v_sig
        using errcode='CLR10';
    end if;
    if position('CLR13' in v_src) = 0 then
      raise exception '#718 tail: % does not refuse CLR13', v_sig using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._lock_document_binding(uuid)'::regprocedure;
  if position('for update' in v_src) = 0 or position('clara.documents' in v_src) = 0 then
    raise exception '#718 tail: clara._lock_document_binding is not a FOR UPDATE on clara.documents'
      using errcode='CLR10';
  end if;

  -- 6 · THE TWO SPELLINGS, EACH IN THE RIGHT WALL. The coding wall speaks 0182's admission/late
  -- token only; the evidence wall carries BOTH and branches on the door that reached it.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_source_binding_wall()'::regprocedure;
  if position('source_already_posted' in v_src) = 0 then
    raise exception '#718 tail: the coding wall does not raise source_already_posted' using errcode='CLR10';
  end if;
  if position('source_conflict' in v_src) > 0 then
    raise exception '#718 tail: the coding wall mints a second spelling (source_conflict) for the refusal 0182 already names'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_evidence_link_binding_wall()'::regprocedure;
  foreach v_sig in array array['source_conflict', 'already_posted', 'source_already_posted',
      'work_commit'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#718 tail: the evidence wall lost its % arm', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 6b · THE EVIDENCE WALL CARRIES NO OPENING CARVE-OUT. Negative, and it matters: a carve-out
  -- there would not preserve behaviour, it would WEAKEN 0182, whose three doors already refuse a
  -- tie document through the same probe.
  select pg_get_triggerdef(oid) into v_when from pg_trigger
   where tgrelid='clara.entry_evidence_links'::regclass and tgname='t_entry_evidence_links_binding_wall';
  if position('is_opening_balance' in v_when) > 0 or position('WHEN' in v_when) > 0 then
    raise exception '#718 tail: the evidence wall gained a WHEN clause -- it must fire on EVERY link insert, or 0182''s own invariant is narrowed by this file'
      using errcode='CLR10';
  end if;

  -- 7 · NOTHING ELSE MOVED. This file replaces no body, and says so by re-reading the two it was
  -- derived from -- the probe at its pinned sha, and the draft core still without a lookback of
  -- its own (its CLR21 double_coded arm intact).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src from pg_proc p
   where p.oid='clara._document_posting_entry(uuid,uuid)'::regprocedure;
  if v_src <> '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0' then
    raise exception '#718 tail: clara._document_posting_entry moved during this migration (sha %)', v_src
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  if position('entry_evidence_links' in v_src) > 0 or position('double_coded' in v_src) = 0 then
    raise exception '#718 tail: clara._draft_entry_core was recut by this file -- it must not be'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='clara' and p.proname in ('_lock_document_binding','_tf_source_binding_wall',
     '_tf_evidence_link_binding_wall');
  if v_n <> 3 then
    raise exception '#718 tail: this file created % functions, not 3', v_n using errcode='CLR10';
  end if;

  raise notice '#718 tail: OK -- the document-coding lane now looks back at the evidence links. clara._tf_source_binding_wall fires BEFORE ROW on clara.journal_entries for the transition into approved (INSERT arm and UPDATE arm, both scoped to a non-reversal, NON-OPENING row carrying a document_id -- wave-B''s opening seed binds many items to one tie document by design and is carved out by is_opening_balance, the marker clara._approve_opening_entry itself requires -- the UPDATE arm covering status becoming approved AND document_id becoming non-null), takes clara._lock_document_binding and then asks 0182''s own clara._document_posting_entry, and refuses CLR13 source_already_posted naming the conflicting entry -- byte-identical in shape to clara.admit_journal_work''s and clara.attach_entry_evidence''s arms, with no second spelling minted. clara._tf_evidence_link_binding_wall fires BEFORE INSERT on clara.entry_evidence_links, takes the SAME lock before the SAME probe, and raises (CLR13, source_conflict, already_posted) for a work_commit row and (CLR13, source_already_posted) for a late_attachment one -- the exact pairs those two doors'' own unique_violation handlers raise -- so the two lanes'' read-then-write sequences are now one serialized pair on clara.documents rather than two independent ones on two different relations, and the two-session race resolves to exactly ONE posted entry in either arrival order. Both walls REUSE the probe and neither names clara.entry_evidence_links itself; both skip the row that is asking, so attach_entry_evidence''s replay arm and uq_entry_evidence_links_entry keep their existing handlers. The wall trigger names sort AFTER t_je_immutable and t_period_wall, so every refusal those two already own keeps its spelling. All three functions are clara_fn_owner-owned SECURITY DEFINERs with pinned search_paths, PUBLIC-revoked and EXECUTE-reachable by NO application role. This file replaces no function body: clara._document_posting_entry is re-read at its pinned 0182 sha and clara._draft_entry_core still carries its own CLR21 double_coded arm and still no evidence-link lookback of its own.';
end
$w718_tail$;
