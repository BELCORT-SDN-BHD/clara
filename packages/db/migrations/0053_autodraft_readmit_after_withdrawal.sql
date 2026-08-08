-- 0053_autodraft_readmit_after_withdrawal.sql -- §7-A FINDING F8 (ledger task #33): the
-- unattended lane cannot honor the remedy CLR23 itself prints.
--
-- GOVERNING LAW: docs/plan/wave-e-contract.md E-R1 (ADR-065) -- the Wave E build opens with
-- the F6-F9 fix batch, all four judgement-adjacent, all four under CLAUDE.md review law 1
-- (a PR that changes JUDGEMENT LOGIC gets an independent review pass before merge).
-- ACCEPTANCE EVIDENCE OF RECORD: docs/plan/wave-7a-acceptance-h1.md:746-759 and its 19-row
-- approval table at :793-831 -- ROME SECRETARY's real §7-A campaign, 2026-08-07.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). 0053 is
-- the WORKING number; the frontier probe below pins 0050_egress_release_skip_consent as the
-- applied predecessor. The number also appears inside the two installed comment markers, so
-- a renumber must carry them (RENUMBER.md's own procedure).
--
-- =====================================================================================
-- WHAT WENT WRONG, IN ONE PARAGRAPH
-- =====================================================================================
-- clara._approve_entry_core refuses a draft whose stored match_fingerprint no longer equals
-- a fresh clara._resolve_counterparty call, with CLR23 and this remedy, verbatim:
-- "counterparty match landscape changed; withdraw the draft and re-draft; the new draft will
-- resolve against the current counterparty landscape". A human obeys it: withdraw_draft
-- (0009:1882) flips the entry to 'withdrawn' -- and that is ALL it does; it never reads or
-- writes clara.autodraft_attempts or clara.agent_tasks. So when the human then asks the
-- UNATTENDED lane to re-draft (request_autodraft -> admit_autodraft_task), admission's
-- post-lock registry short-circuit finds that filing's row still joined to a task_status of
-- 'completed' and returns {"outcome":"already_done"} -- unconditionally, permanently, with no
-- branch anywhere reading what became of the entry that task produced. Measured live, not
-- theorised: 8 of the 9 real CLR23 redraft rows in the H1 campaign hit exactly this wall and
-- had to route around admission entirely, through the CHAT door (wake_draft_entry) or the
-- HAND door (clara.draft_entry). Only row 19 exercised the existing supersede branch, and
-- only because its registry row happened to read 'failed'. The refusal message points at a
-- door the product then refuses to open.
--
-- =====================================================================================
-- RECONCILING 0034's DELIBERATE EXCLUSION -- CITED, NOT SILENTLY OVERRIDDEN
-- =====================================================================================
-- 'completed' was left out of the supersede branch ON PURPOSE. 0034's own words, still
-- standing verbatim in the live body and quoted here so this file cannot be read as
-- forgetting them: "the work already exists -- an honest refusal, never a silent re-admit
-- and never a replayed stale receipt that would misreport what happened (the #43 sin)".
-- THAT REASONING IS CORRECT AND IS NOT WEAKENED HERE. It rests on a premise -- "the work
-- already exists" -- and a WITHDRAWAL is precisely the event that makes the premise FALSE.
-- After clara.withdraw_draft, the filing has no standing draft, no approved entry, nothing
-- bookable: the work does NOT exist. Re-admitting is then the HONEST outcome and refusing is
-- the misreport, exactly inverting 0034's own test.
--
-- THE ASYMMETRY THAT MAKES THIS A BUG RATHER THAN A POLICY. The entry-level constraint that
-- actually embodies "one standing draft per filing" -- uq_journal_entries_one_open_draft_
-- filing (live shape 0017:798-801) -- SELF-HEALS on withdrawal: the partial index stops
-- matching a 'withdrawn' row, so clara._draft_entry_core would accept a fresh draft for that
-- filing the moment the old one is withdrawn. The registry gate sitting ABOVE it never healed.
-- The two layers disagreed, and only the upper one was reachable from the unattended lane.
--
-- WHAT STAYS 'already_done' -- FOUR CASES, EACH DELIBERATE:
--   * the entry is STILL A DRAFT           -- the work genuinely exists and is standing.
--   * the entry is APPROVED, NOT REVERSED  -- the work exists and is in the books.
--   * the entry was APPROVED then REVERSED -- REVERSAL IS NOT WITHDRAWAL, and the difference
--       is not cosmetic. A reversal means the work HAPPENED and was formally undone in the
--       books, leaving two posted entries and an audit trail; deciding to re-draft after that
--       is a human accounting judgement about a booked event, not an unattended retry of an
--       attempt that produced nothing. It keeps refusing, and the human keeps the chat and
--       hand-draft lanes. Recorded here as a deliberate boundary so a later reader does not
--       "fix" it as an oversight.
--   * NO ENTRY AT ALL for the filing       -- absence is not evidence (CLAUDE.md law 2). A
--       registry row whose task completed but whose filing carries no journal_entries row at
--       all is a shape this file cannot explain; it falls through to the refusal, never to
--       the re-admit.
--
-- =====================================================================================
-- HOW "THE ENTRY WAS WITHDRAWN" IS PROVEN -- LAW 2, IN BOTH DIRECTIONS
-- =====================================================================================
-- clara.autodraft_attempts has NO entry_id column (0011:699-726, widened only by 0046:531-533
-- with direction/backfill_batch_id), so the registry cannot point at the entry directly. The
-- only sound join is filing_id equality against clara.journal_entries -- and it IS sound, for
-- a measured reason rather than a hopeful one: uq_journal_entries_one_open_draft_filing plus
-- clara._draft_entry_core's own double_coded guard (0009:1244-1250, "active filing is already
-- coded", checked as status='approved' and reversed_by is null) together bound a filing to at
-- most ONE live entry at a time. Both are asserted POSITIVELY in the prestate below; if either
-- is gone, this migration refuses rather than re-deriving the argument silently.
--
-- THE BRANCH ASKS THREE QUESTIONS, NOT ONE, and each is a POSITIVE read:
--   (1) EXISTS a 'withdrawn' entry for this filing        -- the positive evidence itself.
--   (2) NOT EXISTS a 'draft' entry for this filing        -- no standing draft.
--   (3) NOT EXISTS an 'approved' entry with reversed_by null -- nothing live in the books,
--       mirroring the double_coded predicate EXACTLY so admission and the draft writer agree
--       by construction rather than by parallel maintenance.
-- (1) alone would not be enough: a filing could carry a withdrawn entry from an earlier cycle
-- AND a live one from a later one. All three must hold.
--
-- THE SCOPING DIRECTIONS ARE CHOSEN SO EVERY ERROR IS A REFUSAL. The POSITIVE read (1) is
-- additionally scoped by firm_id -- a stricter predicate, so a mis-scope makes it fail to
-- fire (refuse). The two NEGATIVE reads (2) and (3) are deliberately NOT firm-scoped -- a
-- broader predicate, so a mis-scope makes them find MORE reasons to refuse, never fewer.
-- (2) is also deliberately blind to is_opening_balance, which the unique index exempts: this
-- predicate is strictly stricter than the index, again in the refusing direction.
--
-- THE BRANCH KEYS ON THE FILING'S STATE, NOT ON A LINK FROM THIS TASK TO THAT ENTRY -- and
-- that is a real, deliberate widening beyond the narrow F8 story, named here rather than
-- left for a reviewer to find. The registry has no entry_id, so no such link exists to read.
-- The consequence: a filing whose autodraft attempt completed WITHOUT drafting (settled
-- 'skipped_lane') and whose separately-authored draft was later withdrawn also re-admits.
-- That is safe and, on inspection, right: the filing genuinely has no live entry, a human
-- withdrawal is the same explicit "redo this" signal in either case, and the lane check
-- immediately below still decides whether the filing is codeable at all. What the branch
-- must never do is re-admit a filing that IS coded, and predicates (2) and (3) are what
-- prevent that -- reduction-tested, see the CELLS note below.
--
-- LOCKS: THE BRANCH ADDS NONE. Its three reads are plain SELECTs (ACCESS SHARE on
-- clara.journal_entries only -- no FOR UPDATE, no row locks), so they cannot participate in
-- a lock cycle. Its refund block is byte-identical to the retry path 0046's canonical
-- lock-order comment already enumerates ("RETRY WITH REFUND": advisory 202991617, then
-- firm_usage_daily, then autodraft_attempts by filing_id, then the filing-keyed op_receipts
-- row), so that enumeration stays accurate with this branch as a second entrance to the same
-- path. Stated explicitly because 0046 paid for that invariant with two live deadlocks.
--
-- =====================================================================================
-- THE NEW OUTCOME TOKEN, AND WHY IT IS A NEW ONE
-- =====================================================================================
-- A re-admission after a withdrawal returns outcome 're_admitted_after_withdrawal', NOT the
-- existing 're_admitted'. Reusing 're_admitted' would tell every caller that a FAILED/
-- CANCELLED/EXPIRED task was retried, which is a different fact about a different event --
-- precisely the "replayed stale receipt that would misreport what happened" 0034 named as
-- the #43 sin. The token is new, distinct, and named for what actually happened.
-- CONSUMER, UPDATED IN LOCKSTEP (this migration is not complete without it):
-- packages/runtime/lib/autodraft.mjs's admissionNeedsStart() previously returned true only
-- for 'admitted' and 're_admitted'; a re-admitted task is a REAL queued clara.agent_tasks row
-- and must be enqueued or it would be minted and never run. It now admits the third token,
-- with the cell in packages/runtime/tests/wave-a-autodraft-consumer.test.mjs updated to pin
-- all three. The tree was swept for any OTHER consumer branching on an admission outcome
-- string (packages/runtime, apps/dashboard): admissionNeedsStart is the only one.
-- NO CHECK CONSTRAINT IS WIDENED, and that was measured rather than assumed:
-- clara.sweep_run_items.outcome is a CHECK-constrained enum, but this branch WRITES NO ITEM
-- -- it falls through to the same mint pipeline the supersede branch falls through to, and
-- that pipeline writes no item either (clara.settle_autodraft_task writes it later). The
-- token lives only in the op_receipt/return jsonb, which is unconstrained.
--
-- THE AUDIT ROW IS DELIBERATELY UNCHANGED. clara._audit's admission payload has never
-- distinguished 'admitted' from 're_admitted' either; leaving it alone keeps this splice
-- minimal on judgement-critical code and keeps the new token consistent with the existing
-- one rather than inventing a new asymmetry. The durable, caller-read receipt (_finish_op's
-- op_receipts row) carries the honest token, and that is the receipt the door's contract is
-- written against.
--
-- =====================================================================================
-- TOKEN ACCOUNTING: WHY THE REFUND BLOCK IS SAFE ON A **COMPLETED** TASK
-- =====================================================================================
-- The branch mirrors the supersede branch's mechanics exactly, refund included, and the
-- refund cannot double-credit a firm for work that was really done. Measured against
-- clara.settle_autodraft_task's own body (0036:953-978, plus 0047's third arm): on ANY
-- settlement that lands agent_tasks.status='completed', firm_usage_daily is moved to
-- (tokens_used + v_actual - a.reserved_tokens) -- the reservation is REPLACED by the actual
-- spend -- and the registry row is set to reserved_tokens=0, state='idle'. So on the normal
-- completed path a.reserved_tokens is already 0 and the refund block is an idempotent no-op,
-- exactly as it is for the already-refunded settle-failure path 0034 wrote it for. A NONZERO
-- reserved_tokens on a completed task therefore means a reservation that was genuinely never
-- reconciled, and releasing it before minting a fresh one is the correct act, not a credit
-- for work performed. The durable per-row UPDATE (reserved_tokens=0, state='idle') is kept
-- for 0034's own O-round reason: without it, a re-admit that is then refused by the lane or
-- budget check further down would leave the row re-enterable and re-refundable forever.
--
-- =====================================================================================
-- FIX (b): THE CLR23 MESSAGE NOW NAMES THE REAL DOORS
-- =====================================================================================
-- The remedy text is reworded to name the doors that actually exist, and stays short. The
-- errcode stays CLR23 and nothing else about the refusal changes. With fix (a) shipped the
-- autodraft door genuinely re-opens for a withdrawn filing, so the message can name it
-- truthfully -- and it still names the chat and hand-draft lanes, because those remain the
-- doors for the cases fix (a) deliberately does NOT re-admit (a reversed entry, above).
-- packages/db/tests/x35-drafting-trio.test.mjs:112-116 asserts this message by EXACT equality
-- and is updated in the same change. apps/dashboard was swept for an echo of the DB text:
-- there is none (its only CLR23 copy, partCatalog.ts:90, is a different refusal entirely --
-- "a payable line needs a resolved vendor" -- and is left alone).
--
-- =====================================================================================
-- PATCHED, NEVER REBUILT -- 0046's law (S7.1), 0048's restatement, and 0040's for the second
-- function.
-- =====================================================================================
-- clara.admit_autodraft_task's live body is 0011 -> 0031 -> 0034 -> 0036 §D (the last full
-- CREATE) -> 0046 S7.1 (a DYNAMIC splice: the tri-state direction contract, the registry
-- insert widening, the audit widening) -> 0048 S1 (a DYNAMIC splice: the concurrency cap
-- excludes the caller's own open run). A from-file CREATE OR REPLACE here would silently
-- revert BOTH dynamic splices -- both migrations' own headers state exactly this as the
-- reason they patch rather than re-type. clara._approve_entry_core is the most-spliced
-- function in the system (0015 -> 0016 -> 0017 dynamic -> 0029 -> 0035 -> 0037 §H.1 -> 0040
-- §S5 dynamic), with the same consequence. Both are therefore harvested from the LIVE catalog
-- with pg_get_functiondef, patched with count-guarded replace(), executed, and then proven in
-- the tail: each anchor landed exactly once, and every prior migration's markers survive at
-- the counts the prestate measured.
--
-- NO APPLY-TIME CENSUS, SO NO clara.migration_receipts ROW. 0049 opened that durable channel
-- because it re-measured live filings at apply time and a NOTICE is discarded by the
-- production runner. This file measures nothing about live data -- it is a pure control-flow
-- and message change -- so it writes no receipt, and says so rather than leaving the absence
-- to be read as an oversight.
--
-- D1 WRITE-QUIESCE (packages/db/README.md:99-118). clara.admit_autodraft_task is the live
-- admission path both the per-document dispatcher and the estate-wide sweep call on every
-- pass, and clara._approve_entry_core is the approval core behind both clara.approve_entry
-- and clara.execute_rule_post. This migration replaces both bodies, so the repo-mandated D1
-- obligation applies once it ships to a live runtime: quiesce new writes reaching them (stop
-- new sweep/one-click dispatch and new approvals, let in-flight ones drain), apply, resume.
-- The admission change is strictly WIDENING (every input the old body refused for a reason
-- other than completed-and-withdrawn still refuses identically) and the approval change is a
-- message string, so an interleaved apply cannot corrupt anything -- but the quiesce remains
-- the recorded procedure and this file does not license skipping it. THIS PR DOES NOT DEPLOY
-- OR APPLY ANYTHING LIVE; the ceremony is a separate, later, separately-reviewed step.
--
-- CELLS (packages/db/tests/x34-autodraft-retry-door.test.mjs, the admission state machine's
-- own battery -- all six pre-existing cells stay green UNMODIFIED):
--   x34.g  THE FIX, on the real product path: admit -> real wake draft -> settle 'drafted'
--          -> (STANDING DRAFT: still already_done, receipt byte-untouched -- the F8 wall
--          reproduced as this cell's own prestate) -> clara.withdraw_draft -> re-admit as
--          're_admitted_after_withdrawal' with a genuinely NEW queued agent_task, the
--          registry repointed, the deterministic op-key carrying exactly ONE receipt with
--          the honest token -> the new task drafts and settles clean end to end.
--   x34.h  completed + APPROVED-and-unreversed -> still already_done.
--   x34.i  completed + approved-THEN-REVERSED -> still already_done. The deliberate
--          boundary above, pinned so it is not "fixed" later as an oversight.
--   x34.j  the THIRD predicate is load-bearing. A filing carrying BOTH a withdrawn row and
--          a later approved-and-unreversed one refuses. REDUCTION-TESTED on a copy of the
--          rig with that one conjunct stripped, and the result is recorded honestly rather
--          than assumed: the branch then fires, the lane check downstream still stops the
--          draft (an independent backstop), but the refusal is MISNAMED 'lane_changed' and
--          the branch's side effects have already DELETED the filing's settled admission
--          receipt (measured 1 -> 0). Both are asserted.
--   x34.c  UNMODIFIED, and it is the fourth contrast: it settles 'skipped_lane' with no
--          entry, so its filing carries NO journal_entries row at all -- the "absence is not
--          evidence" case, which must keep refusing.
--   packages/db/tests/x35-drafting-trio.test.mjs -- x35.a's exact-equality message assertion,
--     updated to the new remedy text.
--   packages/runtime/tests/wave-a-autodraft-consumer.test.mjs -- admissionNeedsStart pins all
--     three enqueueing tokens, still refuses every no-op/refusal outcome (including
--     'already_done'), and adds near-miss spellings so no loose substring test can pass.
--
-- STATEMENT TIMEOUT (ADR-059 ceremony law). Set inside the migration connection because role-
-- and database-level settings are invisible through Supavisor's pool. This file's arms are
-- TWO-BODY scoped, not a pg_proc-wide lex pass, so the setting is precautionary rather than
-- load-bearing -- stated plainly so nobody reads a heavy pass into it.
set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim the header makes about what is being edited, and every
-- invariant the new branch's soundness argument rests on, is MEASURED here before a single
-- object changes. Stashed into temp tables so the tail compares against what THIS run saw,
-- not against a fresh assumption (0047/0048's idiom).
-- =====================================================================================
create temp table _x53_pre(
  sig     text primary key,
  secdef  boolean not null,
  config  text    not null,
  acl     text    not null,
  owner   text    not null
) on commit drop;

do $prestate$
declare
  v_n int; v_def text; v_count int;
  v_secdef boolean; v_config text; v_acl text; v_owner text;
  v_first int; v_second int; v_lock int;
  r record;
begin
  -- (0.1) FRONTIER.
  select count(*) into v_n from clara.schema_migrations
    where version = '0050_egress_release_skip_consent';
  if v_n <> 1 then
    raise exception '0053 prestate: 0050_egress_release_skip_consent is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- -------------------------------------------------------------------------------------
  -- (0.2) THE INVARIANTS THE RE-ADMIT BRANCH'S SOUNDNESS ARGUMENT RESTS ON.
  --
  -- The branch reads clara.journal_entries BY FILING_ID and treats what it finds as a fact
  -- about "the entry this task produced". That is only sound because a filing can carry at
  -- most one LIVE entry at a time, and that bound is held by two separate mechanisms. Both
  -- are read POSITIVELY here. If either is gone, the argument in this file's header is stale
  -- and the migration refuses rather than shipping a guard whose premise it cannot see.
  -- -------------------------------------------------------------------------------------

  -- (0.2a) THE PARTIAL UNIQUE INDEX -- one open draft per filing. Pinned as the DEPARSED
  -- definition (0047 prestate 0.3's idiom) so a shape change fails loudly here rather than
  -- quietly weakening the claim. This is the index that SELF-HEALS on withdrawal, which is
  -- the whole asymmetry this migration closes.
  select count(*) into v_n from pg_indexes
    where schemaname = 'clara' and indexname = 'uq_journal_entries_one_open_draft_filing'
      and indexdef = 'CREATE UNIQUE INDEX uq_journal_entries_one_open_draft_filing ON clara.journal_entries USING btree (filing_id) WHERE ((status = ''draft''::text) AND (filing_id IS NOT NULL) AND (NOT is_opening_balance))';
  if v_n <> 1 then
    raise exception '0053 prestate: uq_journal_entries_one_open_draft_filing is not the pinned 0017:798-801 shape this fix reasons about (found: %) -- re-derive the at-most-one-live-entry-per-filing argument in this file''s header before adding a filing-scoped judgement',
      (select coalesce(indexdef,'<absent>') from pg_indexes
        where schemaname='clara' and indexname='uq_journal_entries_one_open_draft_filing')
      using errcode = 'CLR10';
  end if;

  -- (0.2b) THE DOUBLE_CODED GUARD -- one approved-and-unreversed entry per filing. The new
  -- branch's third predicate MIRRORS this one exactly; reading it here proves the mirror has
  -- an original, rather than trusting a line number in a comment.
  select prosrc into v_def from pg_proc
    where pronamespace = 'clara'::regnamespace and proname = '_draft_entry_core'
    order by oid limit 1;
  if v_def is null
     or position('where filing_id=v_filing and status=''approved'' and reversed_by is null' in v_def) = 0 then
    raise exception '0053 prestate: clara._draft_entry_core no longer carries the double_coded predicate (filing_id + approved + reversed_by is null) the re-admit branch mirrors -- the two layers would stop agreeing by construction'
      using errcode = 'CLR10';
  end if;

  -- (0.2c) THE STATUS DOMAIN IS EXACTLY THE THREE VALUES THE BRANCH ENUMERATES. The whole
  -- four-cases argument (draft / approved-unreversed / approved-then-reversed / withdrawn)
  -- rests on knowing every exit a draft has. A FOURTH status appearing later would silently
  -- widen the gap without a word of this file changing, so this refuses instead. Same arm,
  -- same reason, same pinned text as 0047 prestate (0.3) -- which earned its cost there.
  select count(*) into v_n from pg_constraint
    where conrelid = 'clara.journal_entries'::regclass and contype = 'c'
      and conname = 'ck_journal_entries_status'
      and pg_get_constraintdef(oid) =
          'CHECK ((status = ANY (ARRAY[''draft''::text, ''approved''::text, ''withdrawn''::text])))';
  if v_n <> 1 then
    raise exception '0053 prestate: clara.journal_entries.status is not the pinned draft/approved/withdrawn domain this fix reasons about (found %) -- re-derive the four-cases argument before widening admission',
      (select coalesce(pg_get_constraintdef(oid),'<no ck_journal_entries_status>') from pg_constraint
        where conrelid='clara.journal_entries'::regclass and conname='ck_journal_entries_status')
      using errcode = 'CLR10';
  end if;

  -- (0.2d) clara.withdraw_draft REALLY IS REGISTRY-BLIND. The defect's premise, read rather
  -- than assumed: if some later migration taught withdraw_draft to touch the registry itself,
  -- this fix would be the WRONG shape (two writers for one fact) and must be re-derived.
  select prosrc into v_def from pg_proc
    where pronamespace = 'clara'::regnamespace and proname = 'withdraw_draft'
    order by oid limit 1;
  if v_def is null then
    raise exception '0053 prestate: clara.withdraw_draft is gone' using errcode = 'CLR10';
  end if;
  if position('autodraft_attempts' in v_def) <> 0 or position('agent_tasks' in v_def) <> 0 then
    raise exception '0053 prestate: clara.withdraw_draft now touches the autodraft registry itself -- F8''s premise (a withdrawal is structurally invisible to admission) no longer holds; re-derive this fix'
      using errcode = 'CLR10';
  end if;
  if position('status=''withdrawn''' in v_def) = 0 then
    raise exception '0053 prestate: clara.withdraw_draft no longer sets status=''withdrawn'' -- the positive evidence this fix reads would never appear'
      using errcode = 'CLR10';
  end if;

  -- -------------------------------------------------------------------------------------
  -- (0.3) clara.admit_autodraft_task -- ONE overload, at the pinned 5-arity signature.
  -- -------------------------------------------------------------------------------------
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'admit_autodraft_task';
  if v_n <> 1 then
    raise exception '0053 prestate: expected exactly ONE clara.admit_autodraft_task overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;

  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  -- (0.3a) IDEMPOTENCY. A re-apply is LOUD, never a double splice.
  if position('re_admitted_after_withdrawal' in v_def) <> 0 then
    raise exception '0053 prestate: admit_autodraft_task already carries the re-admit-after-withdrawal branch -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (0.3b) THE PRIOR-SPLICE MARKER CENSUS, at exact counts. 0046 S7.1's tri-state direction
  -- contract and 0048 S1's own-run exclusion are DYNAMIC splices that a from-file rebuild
  -- silently reverts; measuring them here and again in the tail is what makes their survival
  -- structural rather than a promise. 0034's own branches are measured too, because this
  -- migration inserts INTO that chain and must not disturb the arms above or below it.
  for r in select * from (values
      ('clara._autodraft_direction_tri(',                                        1),
      ('clara._sales_lane_active(',                                              1),
      ('and id<>p_run_id)>=v_cap then',                                          1),
      -- 2, not 1: 0048's own installed comment quotes this guard verbatim beside the
      -- executable copy, which is exactly why the census counts rather than probes.
      ('or (p_origin=''sweep'' and p_run_id is null)',                           2),
      ('if found and a.state=''active'' and a.task_status in',                   2),
      ('elsif found and a.state=''parked'' then',                                2),
      ('elsif found and a.task_status=''completed'' then',                       1),
      ('return jsonb_build_object(''outcome'',''already_done'',''task_id'',a.task_id);', 1),
      ('elsif found and a.task_status in (''failed'',''cancelled'',''expired'') then',   1),
      ('  v_is_retry boolean:=false;',                                           1),
      ('case when v_is_retry then ''re_admitted'' else ''admitted'' end',        1)
    ) as t(marker, want)
  loop
    v_count := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_count <> r.want then
      raise exception '0053 prestate: the live admit_autodraft_task body carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this migration against the live catalog', r.marker, v_count, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.3c) THE NEW BRANCH MUST LAND IN THE AUTHORITATIVE (POST-LOCK) REGISTRY BLOCK, NOT IN
  -- THE PRE-LOCK FAST PATH. Proven by ORDER, anchored on the SECOND occurrence of the
  -- registry re-read -- 0034's own tail idiom, adopted here for its own reason: a check that
  -- compares a pre-lock occurrence against a post-lock position is vacuously true. Measured
  -- now so the tail can re-measure the same three landmarks after the splice.
  v_first  := position('select aa.*,t.status as task_status into a from clara.autodraft_attempts aa' in v_def);
  v_lock   := position('select df.* into f from clara.document_filings df where df.id=p_filing' in v_def);
  v_second := v_first + position('select aa.*,t.status as task_status into a from clara.autodraft_attempts aa'
                in substr(v_def, v_first + 1));
  if v_first = 0 or v_lock = 0 or v_second = v_first then
    raise exception '0053 prestate: the registry re-read / filing-lock landmarks are not both present twice/once in the live body'
      using errcode = 'CLR10';
  end if;
  if not (v_first < v_lock and v_lock < v_second) then
    raise exception '0053 prestate: the pre-lock fast path, the filing lock and the post-lock registry re-read are not in the expected order (%, %, %)', v_first, v_lock, v_second
      using errcode = 'CLR10';
  end if;
  if not (v_second < position('elsif found and a.task_status=''completed'' then' in v_def)) then
    raise exception '0053 prestate: the completed branch does not sit AFTER the post-lock registry re-read -- this is not the body this migration was authored against'
      using errcode = 'CLR10';
  end if;

  -- (0.3d) PRIVILEGE SHAPE, STASHED for the tail's byte-identical proof.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>'),
      proowner::regrole::text
    into v_secdef, v_config, v_acl, v_owner
    from pg_proc where oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if not v_secdef then
    raise exception '0053 prestate: clara.admit_autodraft_task is not SECURITY DEFINER -- refusing to re-ship a body whose privilege shape this file does not recognise'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0053 prestate: clara.admit_autodraft_task carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x53_pre(sig, secdef, config, acl, owner)
    values ('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)', v_secdef, v_config, v_acl, v_owner);

  -- -------------------------------------------------------------------------------------
  -- (0.4) clara._approve_entry_core -- ONE overload, the CLR23 remedy present exactly once.
  -- -------------------------------------------------------------------------------------
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_approve_entry_core';
  if v_n <> 1 then
    raise exception '0053 prestate: expected exactly ONE clara._approve_entry_core overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;

  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_def;

  -- (0.4a) IDEMPOTENCY.
  if position('re-admits through the autodraft door' in v_def) <> 0 then
    raise exception '0053 prestate: _approve_entry_core already carries the reworded CLR23 remedy -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (0.4b) THE ANCHOR, and 0040 §S5's own marker census re-asserted verbatim. 0040 measured
  -- every one of these on a database migrated from zero and pinned them precisely so a body
  -- that lost a prior splice refuses BEFORE anything is added to it. The same list is the
  -- right list here, for the same reason, and it is re-read in the tail.
  for r in select * from (values
      ('counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape', 1),
      ('opening_entry_k_family_only',                                  1),
      ('[R1-F1] K-family-only lifecycle boundary',                     1),
      ('receipt_preheld',                                              1),
      ('bound_extraction',                                             1),
      ('unpinned_rule_post',                                           1),
      ('settlement_not_autopostable',                                  1),
      ('clara._subledger_on_approve(',                                 1),
      ('no_counterparty_sighting',                                     1),
      ('H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',       1),
      ('bank_rule_suggested',                                          2),
      ('insert into clara.rule_sightings',                             2),
      ('uq_rule_sightings_mapping',                                    2),
      -- The CLR23 raises are counted, not merely probed: the anchor below replaces a MESSAGE
      -- and must leave every refusal's classification exactly where it was.
      ('using errcode=''CLR23''',                                      3)
    ) as t(marker, want)
  loop
    v_count := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_count <> r.want then
      raise exception '0053 prestate: the live _approve_entry_core body carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this migration against the live catalog', r.marker, v_count, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.4c) PRIVILEGE SHAPE, STASHED.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>'),
      proowner::regrole::text
    into v_secdef, v_config, v_acl, v_owner
    from pg_proc where oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if not v_secdef then
    raise exception '0053 prestate: clara._approve_entry_core is not SECURITY DEFINER'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0053 prestate: clara._approve_entry_core carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x53_pre(sig, secdef, config, acl, owner)
    values ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)', v_secdef, v_config, v_acl, v_owner);

  raise notice '0053 prestate: clean (frontier 0050; one-live-entry-per-filing invariants present; ternary status domain; withdraw_draft registry-blind; one admit_autodraft_task overload with the 0034/0046/0048 markers intact; one _approve_entry_core overload with 0040''s 12-marker census intact)';
end
$prestate$;

-- =====================================================================================
-- SECTION 1 -- SPLICE A: clara.admit_autodraft_task gains the re-admit-after-withdrawal arm.
-- Harvested from the live catalog, patched, never re-typed.
-- =====================================================================================
set role clara_fn_owner;
do $splice_a$
declare
  v_def text; v_next text; v_anchor text; v_repl text; v_count int;
begin
  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  -- ---------------------------------------------------------------------------- (1.1)
  -- THE DECLARE. A second flag, distinct from v_is_retry, so the outcome expression can
  -- name which KIND of re-admission happened. v_is_retry is left in place and is also set
  -- by the new branch (a withdrawal re-admit IS a retry -- of a different event), so any
  -- future reader of v_is_retry keeps a true answer; the outcome case tests the more
  -- specific flag FIRST.
  v_anchor := '  v_is_retry boolean:=false;';
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0053 S1.1: the declare anchor occurs % times (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '  v_is_retry boolean:=false;' || chr(10)
    || '  v_withdrawn_readmit boolean:=false;');

  -- ---------------------------------------------------------------------------- (1.2)
  -- THE BRANCH. Inserted immediately BEFORE 0034's completed arm, which is re-emitted
  -- byte-identically as the tail of the replacement -- so an ordinary completed attempt
  -- still refuses exactly as it did, and only the strictly narrower shape below diverts.
  v_anchor := '  elsif found and a.task_status=''completed'' then';
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0053 S1.2: the completed-branch anchor occurs % times (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_repl :=
       '  -- [0053 / F8] RE-ADMIT A COMPLETED ATTEMPT WHOSE ENTRY WAS WITHDRAWN.' || chr(10)
    || '  -- CLR23 tells a human to "withdraw the draft and re-draft". clara.withdraw_draft' || chr(10)
    || '  -- (0009:1882) touches ONLY clara.journal_entries -- never this registry -- so before' || chr(10)
    || '  -- this branch the unattended door answered already_done forever and the remedy the' || chr(10)
    || '  -- product prints could not be taken through the product (8 of 9 real H1 redrafts hit' || chr(10)
    || '  -- exactly this wall: wave-7a-acceptance-h1.md:746-759).' || chr(10)
    || '  --' || chr(10)
    || '  -- 0034''S EXCLUSION IS HONORED, NOT OVERRIDDEN. Its reason -- "the work already' || chr(10)
    || '  -- exists" -- is a PREMISE, and a withdrawal is exactly the event that falsifies it.' || chr(10)
    || '  -- With no standing draft and nothing live in the books, re-admitting is the honest' || chr(10)
    || '  -- outcome and refusing is the misreport. Everything else about a completed attempt' || chr(10)
    || '  -- still falls to the arm below, unchanged: a standing draft, an approved-and-live' || chr(10)
    || '  -- entry, an approved-then-REVERSED entry (a reversal means the work HAPPENED and was' || chr(10)
    || '  -- formally undone in the books -- re-drafting after that is a human accounting' || chr(10)
    || '  -- judgement, not an unattended retry), and a filing with NO entry at all (absence is' || chr(10)
    || '  -- not evidence).' || chr(10)
    || '  --' || chr(10)
    || '  -- WHY A FILING-SCOPED READ OF journal_entries IS SOUND EVIDENCE HERE. This registry' || chr(10)
    || '  -- has no entry_id column, so the entry cannot be reached by pointer. It can be' || chr(10)
    || '  -- reached by filing_id because a filing carries at most ONE live entry at a time --' || chr(10)
    || '  -- uq_journal_entries_one_open_draft_filing (0017:798-801) for the draft, and' || chr(10)
    || '  -- clara._draft_entry_core''s double_coded guard (0009:1244-1250) for the approved' || chr(10)
    || '  -- one. Both are asserted positively by 0053''s prestate; the third test below is that' || chr(10)
    || '  -- guard''s predicate mirrored EXACTLY, so admission and the draft writer agree by' || chr(10)
    || '  -- construction rather than by parallel maintenance.' || chr(10)
    || '  --' || chr(10)
    || '  -- EVERY ERROR DIRECTION IS A REFUSAL. The POSITIVE evidence read is firm-scoped (a' || chr(10)
    || '  -- stricter predicate: a mis-scope means it does not fire). The two NEGATIVE reads are' || chr(10)
    || '  -- deliberately NOT firm-scoped and deliberately blind to is_opening_balance (broader' || chr(10)
    || '  -- predicates: a mis-scope means MORE reasons to refuse, never fewer).' || chr(10)
    || '  --' || chr(10)
    || '  -- IT KEYS ON THE FILING''S STATE, NOT ON A LINK FROM THIS TASK TO THAT ENTRY (there is' || chr(10)
    || '  -- no entry_id to read). So a filing whose attempt completed WITHOUT drafting, and whose' || chr(10)
    || '  -- separately-authored draft was later withdrawn, also re-admits -- deliberate: the' || chr(10)
    || '  -- filing has no live entry, a withdrawal is the same explicit "redo this" signal, and' || chr(10)
    || '  -- the lane check below still decides whether it is codeable at all.' || chr(10)
    || '  --' || chr(10)
    || '  -- LOCKS: THIS BRANCH ADDS NONE. The three reads are plain SELECTs (ACCESS SHARE only,' || chr(10)
    || '  -- no FOR UPDATE), so they cannot join a lock cycle; the refund block below is the same' || chr(10)
    || '  -- sequence 0046''s canonical lock-order comment already enumerates as "RETRY WITH' || chr(10)
    || '  -- REFUND", so that enumeration stays accurate with this as a second entrance to it.' || chr(10)
    || '  --' || chr(10)
    || '  -- THE OUTCOME IS ITS OWN TOKEN: re_admitted_after_withdrawal, never the plain' || chr(10)
    || '  -- ''re_admitted'', which means a FAILED/CANCELLED/EXPIRED retry -- a different fact' || chr(10)
    || '  -- about a different event. Telling a caller the wrong story about which event' || chr(10)
    || '  -- happened is 0034''s #43 sin in a new spelling.' || chr(10)
    || '  elsif found and a.task_status=''completed''' || chr(10)
    || '     and exists(select 1 from clara.journal_entries je' || chr(10)
    || '                  where je.filing_id=a.filing_id and je.firm_id=a.firm_id' || chr(10)
    || '                    and je.status=''withdrawn'')' || chr(10)
    || '     and not exists(select 1 from clara.journal_entries je' || chr(10)
    || '                  where je.filing_id=a.filing_id and je.status=''draft'')' || chr(10)
    || '     and not exists(select 1 from clara.journal_entries je' || chr(10)
    || '                  where je.filing_id=a.filing_id and je.status=''approved''' || chr(10)
    || '                    and je.reversed_by is null) then' || chr(10)
    || '    -- The mechanics below are 0034''s supersede branch VERBATIM, and deliberately so:' || chr(10)
    || '    -- reconcile any still-outstanding reservation, durably clear it on the row itself' || chr(10)
    || '    -- (0034''s O-round fix -- without this, a re-admit later refused by the lane or' || chr(10)
    || '    -- budget check leaves the row re-enterable and re-refundable forever), clear the' || chr(10)
    || '    -- stale settled receipt under the SAME deterministic op-key, and fall through --' || chr(10)
    || '    -- no RETURN -- to the direction gate, lane check, budget checks and mint pipeline' || chr(10)
    || '    -- below, which are what actually dispatch the fresh attempt.' || chr(10)
    || '    --' || chr(10)
    || '    -- THE REFUND CANNOT DOUBLE-CREDIT WORK THAT WAS REALLY DONE. Any settlement that' || chr(10)
    || '    -- lands agent_tasks.status=''completed'' already moved firm_usage_daily to' || chr(10)
    || '    -- (used + actual - reserved) and set this row to reserved_tokens=0, state=''idle''' || chr(10)
    || '    -- (clara.settle_autodraft_task, 0036:953-978; 0047''s superseded_by_human arm takes' || chr(10)
    || '    -- the same else-branch). So on the normal path the block below is an idempotent' || chr(10)
    || '    -- no-op, and a NONZERO reserved_tokens here means a reservation that was genuinely' || chr(10)
    || '    -- never reconciled -- releasing it before minting a fresh one is correct.' || chr(10)
    || '    v_is_retry:=true; v_withdrawn_readmit:=true;' || chr(10)
    || '    v_op_key:=''autodraft:''||p_filing||'':''||p_origin;' || chr(10)
    || '    if a.reserved_tokens>0 then' || chr(10)
    || '      perform pg_advisory_xact_lock(202991617,hashtext(a.firm_id::text));' || chr(10)
    || '      insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)' || chr(10)
    || '        values(a.firm_id,a.usage_date,0) on conflict(firm_id,usage_date) do nothing;' || chr(10)
    || '      update clara.firm_usage_daily set tokens_used=greatest(0,tokens_used-a.reserved_tokens)' || chr(10)
    || '        where firm_id=a.firm_id and usage_date=a.usage_date;' || chr(10)
    || '    end if;' || chr(10)
    || '    update clara.autodraft_attempts set reserved_tokens=0,state=''idle'',updated_at=now()' || chr(10)
    || '      where filing_id=p_filing;' || chr(10)
    || '    delete from clara.op_receipts where firm_id=a.firm_id and fn=''admit_autodraft_task''' || chr(10)
    || '      and op_key=v_op_key;' || chr(10)
    || '  elsif found and a.task_status=''completed'' then';
  v_count := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0053 S1.2: the completed-branch anchor occurs % times in the in-progress body (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_next, v_anchor, v_repl);

  -- ---------------------------------------------------------------------------- (1.3)
  -- THE OUTCOME TOKEN. A THIRD, distinct token -- never 're_admitted', which means a
  -- FAILED/CANCELLED/EXPIRED retry and would misreport this event (0034's #43 sin). The
  -- more specific flag is tested first; the existing two arms are untouched.
  v_anchor := 'case when v_is_retry then ''re_admitted'' else ''admitted'' end';
  v_count := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0053 S1.3: the outcome-case anchor occurs % times (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    'case when v_withdrawn_readmit then ''re_admitted_after_withdrawal''' || chr(10)
    || '                    when v_is_retry then ''re_admitted'' else ''admitted'' end');

  execute v_next;
  raise notice '0053 S1: admit_autodraft_task recut -- a completed attempt whose entry was WITHDRAWN (and whose filing carries no live entry) re-admits as re_admitted_after_withdrawal';
end
$splice_a$;
reset role;

-- =====================================================================================
-- SECTION 2 -- SPLICE B: clara._approve_entry_core's CLR23 remedy names the real doors.
-- Same technique, same reason (this is the most-spliced function in the system).
-- =====================================================================================
set role clara_fn_owner;
do $splice_b$
declare
  v_def text; v_anchor text; v_count int;
begin
  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_def;

  -- The anchor is the MESSAGE LITERAL itself, which makes the splice independent of the
  -- surrounding indentation and of the `using errcode='CLR23'` line that follows it -- that
  -- line is untouched, so the code stays CLR23 by construction rather than by re-typing it.
  v_anchor := '''counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape''';
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0053 S2: the CLR23 remedy literal occurs % times (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_anchor,
    '''counterparty match landscape changed; withdraw the draft and re-draft (the withdrawn filing re-admits through the autodraft door, or use the chat or hand-draft lanes); the new draft will resolve against the current counterparty landscape''');

  execute v_def;
  raise notice '0053 S2: _approve_entry_core recut -- the CLR23 remedy now names the autodraft, chat and hand-draft doors';
end
$splice_b$;
reset role;

-- The grants on BOTH functions are UNTOUCHED and deliberately not re-issued: CREATE OR
-- REPLACE preserves a function's existing ACL by PostgreSQL's own rule. Section 3 PROVES
-- that rather than trusting the rule, by comparing proacl before and after.

-- =====================================================================================
-- SECTION 3 -- TAIL. Proves both splices landed, landed EXACTLY ONCE, and disturbed nothing
-- else: every prior migration's markers survive at the counts the prestate measured, the new
-- arm sits in the AUTHORITATIVE post-lock block and strictly BEFORE 0034's completed arm,
-- and SECURITY DEFINER / search_path / ACL / owner are byte-identical on both functions.
-- =====================================================================================
do $tail$
declare
  v_def text; v_n int; v_count int; r record; v_pre record;
  v_secdef boolean; v_config text; v_acl text; v_owner text;
  v_first int; v_second int; v_lock int; v_new int; v_old int; v_sup int;
begin
  -- ------------------------------------------------------------------- (3.1) ADMISSION
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'admit_autodraft_task';
  if v_n <> 1 then
    raise exception '0053 tail: expected exactly ONE clara.admit_autodraft_task overload after the splice, found %', v_n;
  end if;
  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  -- (3.1a) THE NEW SURFACE LANDED, EXACTLY ONCE EACH. 're_admitted_after_withdrawal' is
  -- expected TWICE and both occurrences are named: once in the installed comment that says
  -- what the branch is, once in the live outcome expression that returns it.
  for r in select * from (values
      ('  v_withdrawn_readmit boolean:=false;',                                   1),
      ('[0053 / F8] RE-ADMIT A COMPLETED ATTEMPT WHOSE ENTRY WAS WITHDRAWN.',      1),
      ('re_admitted_after_withdrawal',                                            2),
      ('case when v_withdrawn_readmit then ''re_admitted_after_withdrawal''',      1),
      ('v_is_retry:=true; v_withdrawn_readmit:=true;',                             1),
      ('and je.status=''withdrawn'')',                                             1),
      ('where je.filing_id=a.filing_id and je.status=''draft'')',                   1),
      ('and je.reversed_by is null) then',                                          1)
    ) as t(marker, want)
  loop
    v_count := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_count <> r.want then
      raise exception '0053 tail: the post-splice admit_autodraft_task carries the NEW marker "%" % time(s), expected %', r.marker, v_count, r.want;
    end if;
  end loop;

  -- The OLD outcome expression must be GONE -- proof the replace took effect rather than the
  -- postcheck passing on an untouched body.
  if position('case when v_is_retry then ''re_admitted'' else ''admitted'' end' in v_def) <> 0 then
    raise exception '0053 tail: the pre-patch outcome expression is still present -- the S1.3 replace did not land';
  end if;

  -- (3.1b) EVERY PRIOR MARKER SURVIVES AT ITS PRESTATE COUNT. This is the anti-revert half:
  -- it proves the recut carried 0046 S7.1's tri-state direction contract and 0048 S1's own-run
  -- exclusion through unchanged, and that 0034's four registry arms are all still there --
  -- including the already_done return this migration must NOT have altered.
  for r in select * from (values
      ('clara._autodraft_direction_tri(',                                        1),
      ('clara._sales_lane_active(',                                              1),
      ('and id<>p_run_id)>=v_cap then',                                          1),
      ('or (p_origin=''sweep'' and p_run_id is null)',                           2),
      ('if found and a.state=''active'' and a.task_status in',                   2),
      ('elsif found and a.state=''parked'' then',                                2),
      ('elsif found and a.task_status=''completed'' then',                       1),
      ('return jsonb_build_object(''outcome'',''already_done'',''task_id'',a.task_id);', 1),
      ('elsif found and a.task_status in (''failed'',''cancelled'',''expired'') then',   1),
      ('  v_is_retry boolean:=false;',                                           1)
    ) as t(marker, want)
  loop
    v_count := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_count <> r.want then
      raise exception '0053 tail: the recut admit_autodraft_task lost or duplicated the pre-existing marker "%" (% time(s), expected %) -- a prior splice was reverted', r.marker, v_count, r.want;
    end if;
  end loop;

  -- (3.1c) PLACEMENT, BY ORDER, ANCHORED ON THE SECOND (POST-LOCK) REGISTRY RE-READ. The new
  -- arm must sit inside the AUTHORITATIVE block -- after the filing lock and the re-read --
  -- and strictly BEFORE 0034's completed arm (an elsif chain is ordered, so the narrower test
  -- must be reached first) and before the failed/cancelled/expired supersede arm.
  v_first  := position('select aa.*,t.status as task_status into a from clara.autodraft_attempts aa' in v_def);
  v_lock   := position('select df.* into f from clara.document_filings df where df.id=p_filing' in v_def);
  v_second := v_first + position('select aa.*,t.status as task_status into a from clara.autodraft_attempts aa'
                in substr(v_def, v_first + 1));
  v_new    := position('[0053 / F8] RE-ADMIT A COMPLETED ATTEMPT WHOSE ENTRY WAS WITHDRAWN.' in v_def);
  v_old    := position('elsif found and a.task_status=''completed'' then' in v_def);
  v_sup    := position('elsif found and a.task_status in (''failed'',''cancelled'',''expired'') then' in v_def);
  if v_first = 0 or v_lock = 0 or v_second = v_first or v_new = 0 or v_old = 0 or v_sup = 0 then
    raise exception '0053 tail: a placement landmark is missing from the post-splice body (first=%, lock=%, second=%, new=%, old=%, sup=%)',
      v_first, v_lock, v_second, v_new, v_old, v_sup;
  end if;
  if not (v_first < v_lock and v_lock < v_second and v_second < v_new
          and v_new < v_old and v_old < v_sup) then
    raise exception '0053 tail: the new re-admit arm is not in the required order (pre-lock re-read % < filing lock % < post-lock re-read % < new arm % < 0034 completed arm % < supersede arm %)',
      v_first, v_lock, v_second, v_new, v_old, v_sup;
  end if;

  -- (3.1d) PRIVILEGE SHAPE BYTE-IDENTICAL TO PRESTATE.
  select * into v_pre from _x53_pre where sig = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)';
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>'),
      proowner::regrole::text
    into v_secdef, v_config, v_acl, v_owner
    from pg_proc where oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0053 tail: admit_autodraft_task SECURITY DEFINER changed (was %, now %)', v_pre.secdef, v_secdef;
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0053 tail: admit_autodraft_task proconfig changed (was %, now %)', v_pre.config, v_config;
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0053 tail: admit_autodraft_task proacl changed (was %, now %)', v_pre.acl, v_acl;
  end if;
  if v_owner is distinct from v_pre.owner then
    raise exception '0053 tail: admit_autodraft_task owner changed (was %, now %)', v_pre.owner, v_owner;
  end if;

  -- ------------------------------------------------------------------- (3.2) APPROVAL
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_approve_entry_core';
  if v_n <> 1 then
    raise exception '0053 tail: expected exactly ONE clara._approve_entry_core overload after the splice, found %', v_n;
  end if;
  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_def;

  -- The NEW remedy is present exactly once, the OLD one is gone, and the refusal is still
  -- raised as CLR23 -- the errcode line was never inside the anchor, but a body that somehow
  -- lost it would be a silent reclassification, so it is read positively rather than assumed.
  v_count := (length(v_def) - length(replace(v_def,
      'counterparty match landscape changed; withdraw the draft and re-draft (the withdrawn filing re-admits through the autodraft door, or use the chat or hand-draft lanes); the new draft will resolve against the current counterparty landscape', '')))
    / length('counterparty match landscape changed; withdraw the draft and re-draft (the withdrawn filing re-admits through the autodraft door, or use the chat or hand-draft lanes); the new draft will resolve against the current counterparty landscape');
  if v_count <> 1 then
    raise exception '0053 tail: the reworded CLR23 remedy occurs % time(s) in _approve_entry_core (expected 1)', v_count;
  end if;
  if position('counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve' in v_def) <> 0 then
    raise exception '0053 tail: the pre-patch CLR23 remedy is still present -- the S2 replace did not land';
  end if;
  if position('using errcode=''CLR23''' in v_def) = 0 then
    raise exception '0053 tail: _approve_entry_core no longer raises CLR23 -- the refusal was silently reclassified';
  end if;

  -- 0040 §S5's full marker census, re-read. Same list, same counts, same reason.
  for r in select * from (values
      ('opening_entry_k_family_only',                                  1),
      ('[R1-F1] K-family-only lifecycle boundary',                     1),
      ('receipt_preheld',                                              1),
      ('bound_extraction',                                             1),
      ('unpinned_rule_post',                                           1),
      ('settlement_not_autopostable',                                  1),
      ('clara._subledger_on_approve(',                                 1),
      ('no_counterparty_sighting',                                     1),
      ('H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',       1),
      ('bank_rule_suggested',                                          2),
      ('insert into clara.rule_sightings',                             2),
      ('uq_rule_sightings_mapping',                                    2),
      -- The CLR23 raises are counted, not merely probed: the anchor below replaces a MESSAGE
      -- and must leave every refusal's classification exactly where it was.
      ('using errcode=''CLR23''',                                      3)
    ) as t(marker, want)
  loop
    v_count := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_count <> r.want then
      raise exception '0053 tail: the recut _approve_entry_core lost or duplicated the pre-existing marker "%" (% time(s), expected %) -- a prior splice was reverted', r.marker, v_count, r.want;
    end if;
  end loop;

  select * into v_pre from _x53_pre where sig = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)';
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>'),
      proowner::regrole::text
    into v_secdef, v_config, v_acl, v_owner
    from pg_proc where oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0053 tail: _approve_entry_core SECURITY DEFINER changed (was %, now %)', v_pre.secdef, v_secdef;
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0053 tail: _approve_entry_core proconfig changed (was %, now %)', v_pre.config, v_config;
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0053 tail: _approve_entry_core proacl changed (was %, now %)', v_pre.acl, v_acl;
  end if;
  if v_owner is distinct from v_pre.owner then
    raise exception '0053 tail: _approve_entry_core owner changed (was %, now %)', v_pre.owner, v_owner;
  end if;

  -- (3.3) NOTHING ELSE WAS TOUCHED. clara.settle_autodraft_task is explicitly OUT of scope
  -- (autoDraft.v6's frozen classifySettleReceipt validates its return against a CLOSED shape
  -- set), and clara.withdraw_draft stays registry-blind by design -- the fix is entirely in
  -- the admission door's own control flow. Read positively rather than assumed.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'settle_autodraft_task';
  if v_n <> 2 then
    raise exception '0053 tail: expected the two settle_autodraft_task overloads to be untouched, found %', v_n;
  end if;
  select prosrc into v_def from pg_proc
    where pronamespace = 'clara'::regnamespace and proname = 'withdraw_draft' order by oid limit 1;
  if position('autodraft_attempts' in v_def) <> 0 then
    raise exception '0053 tail: clara.withdraw_draft was given autodraft-registry awareness by this migration -- it must not have been';
  end if;

  raise notice '0053 tail: clean -- the re-admit arm is present exactly once inside the authoritative post-lock block and strictly before 0034''s completed arm; the already_done return, the parked gate, the supersede arm, 0046 S7.1 and 0048 S1 all survive; the CLR23 remedy is reworded exactly once and still raises CLR23; 0040''s 12-marker census intact; SECURITY DEFINER + search_path + ACL + owner byte-identical on both functions';
end
$tail$;
