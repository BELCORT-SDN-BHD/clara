-- =====================================================================
-- Migration 0032 (the admission retry door, ledger #45 / GitHub #43) --
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0032:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f autodraft-retry-door-0032-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean
-- run ends with one notice per probe and nothing else.
--
-- WHAT 0032 CLAIMS, restated as structural/catalog probes:
--   1. The mandatory 0031 prior migration and 0032 itself are recorded.
--   2. The post-lock registry check classifies on the task's OWN status
--      (agent_tasks.status via the LEFT JOIN), not autodraft_attempts.state
--      alone -- live/completed/failed-cancelled-expired/parked are four
--      mutually exclusive branches in the documented order, and the post-lock
--      re-read genuinely exists as a SECOND, distinct occurrence (not the
--      pre-lock fast-path's text matched twice).
--   3. The parked (2+ failure) governance gate precedes the new terminal
--      branches and is untouched -- it still refuses unconditionally.
--   4. The terminal-retry branch reconciles any outstanding reservation
--      DURABLY on the clara.autodraft_attempts row itself (not merely on
--      firm_usage_daily) and clears the stale settled receipt BEFORE falling
--      through -- no return statement in its own body, so control genuinely
--      reaches the existing lane/budget/task-mint pipeline below.
--   5. The final settlement distinguishes 're_admitted' from 'admitted' --
--      the caller can never be told a stale replay when a fresh task was
--      actually dispatched, or vice versa; the op-key reservation call
--      appears exactly ONCE (counted, not merely found) in the post-lock
--      section.
--   6. The live-status branch stays EXACTLY queued/running/cancel_requested, unchanged
--      from 0031 -- a build-time draft widened it to include held/awaiting_input, but
--      clara._tf_agent_task_update's own transition matrix for kind='autodraft' proves
--      those two statuses are structurally unreachable for this task kind, so the
--      widening was reverted rather than ship dead code with a false rationale.
--   7. reserved_tokens=0,state='idle' (the terminal branch's reconciliation shape)
--      is compatible with the LIVE ck_autodraft_attempts_reservation CHECK constraint.
--
-- O-ROUND CONFIRMATION (Codex, read-only adversarial pass). The as-first-built
-- terminal branch refunded firm_usage_daily but never persisted the clear onto
-- autodraft_attempts.reserved_tokens itself -- a retry that refunded, then hit the lane
-- or budget check and returned early, left the row still reading the OLD
-- reserved_tokens, so the NEXT call re-entered the terminal branch and refunded the
-- SAME amount again, unboundedly. Probe (4) below was ALSO widened in the same pass to
-- require the durable per-row UPDATE, not just the firm_usage_daily arithmetic --
-- before this fix, probe (4) would have passed against the buggy body, because it only
-- ever checked the shared-counter subtraction, never the attempt row's own persisted
-- state. Probe (5)'s reservation-call check was also strengthened from an existence
-- check to a genuine occurrence COUNT (position() alone cannot distinguish "exactly
-- once" from "at least once").
--
-- COMMENT-STRIPPING DISCIPLINE. Every body assertion strips BOTH `--` line
-- comments and `/* ... */` block comments before normalizing whitespace. A
-- deleted guard pasted back as a comment therefore cannot satisfy a probe.
--
-- THE HONEST FRAMING. This file is BELT, not exhaustive proof of the
-- reconciliation arithmetic or the end-to-end retry dispatch. Those are
-- behavioral rig responsibilities (packages/db/tests/x32-autodraft-retry-
-- door.test.mjs). These probes re-check committed catalog structure and
-- executable source shape from outside the migration transaction, on top of
-- 0032's own in-transaction tail assertions.

do $verify$
declare
  v_n int;
  v_admit_src text;
  v_norm text;
  v_reread_marker text := 'select aa.*,t.status as task_status into a from clara.autodraft_attempts aa';
  v_pos_first int;
  v_pos_second_rel int;
  v_pos_lock int;
  v_post_lock text;
  v_pos_live int;
  v_pos_parked int;
  v_pos_completed int;
  v_pos_terminal int;
  v_pos_lane_check int;
  v_pos_opkey_cond int;
  v_pos_opkey_call int;
  v_terminal_slice text;
begin
  -- (1) mandatory prior-migration chain and this migration's ledger row.
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0031_autopost_lane_unify';
  if v_n<>1 then
    raise exception '0032 postverify: migration 0031_autopost_lane_unify is not recorded';
  end if;
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0032_autodraft_retry_door';
  if v_n<>1 then
    raise exception '0032 postverify: migration 0032_autodraft_retry_door is not recorded';
  end if;
  raise notice '0032 postverify OK (1/7): prior-migration chain intact through 0032';

  select pg_get_functiondef(
    'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_admit_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_admit_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  -- Anchor the post-lock registry recheck. The live/parked branch TEXT is IDENTICAL
  -- between the pre-lock fast-path and the post-lock authoritative check (0032 left the
  -- pre-lock path untouched by design), so position() against the WHOLE body would find
  -- the pre-lock occurrence first and silently under-prove the intended order. The
  -- anchor itself must be real code, not a comment -- v_norm has already stripped every
  -- `--` line comment, so a comment-only landmark can never be found here (a mistake an
  -- earlier draft of this file made and this note exists to keep from repeating).
  --
  -- O-round confirmation (Codex): the FIRST version of this anchor used
  -- 'select df.* into f from clara.document_filings df ...', a real single-occurrence
  -- landmark, but never proved that the registry re-read ITSELF genuinely appears a
  -- SECOND time after it -- a regression that deleted the post-lock re-read entirely
  -- (leaving only the pre-lock fast-path) would still have satisfied every downstream
  -- probe, because they only ever search "everything after the filing-lock anchor",
  -- not "the SECOND registry re-read specifically". Anchoring on the SECOND occurrence
  -- of the re-read statement itself closes that gap: if it is ever removed or merged
  -- back into one, this probe fails loudly instead of silently under-proving.
  v_pos_first:=position(v_reread_marker in v_norm);
  if v_pos_first=0 then
    raise exception '0032 postverify: cannot locate the registry re-read statement at all';
  end if;
  v_pos_second_rel:=position(v_reread_marker in substring(v_norm from v_pos_first+1));
  if v_pos_second_rel=0 then
    raise exception '0032 postverify: the registry re-read does not appear a SECOND (post-lock) time -- has it been removed or merged with the pre-lock fast-path?';
  end if;
  v_pos_lock:=v_pos_first+v_pos_second_rel;
  v_post_lock:=substring(v_norm from v_pos_lock);

  -- (2) the post-lock registry check's four branches appear in the documented order:
  -- live (unchanged from 0031) -> parked -> completed -> failed/cancelled/expired.
  v_pos_live:=position(
    'a.task_status in ( ''queued'',''running'',''cancel_requested'' )'
    in v_post_lock);
  if v_pos_live=0 then
    -- whitespace-normalization can leave the list unspaced depending on source layout
    v_pos_live:=position(
      'a.task_status in (''queued'',''running'',''cancel_requested'')'
      in v_post_lock);
  end if;
  v_pos_parked:=position('elsif found and a.state=''parked'' then' in v_post_lock);
  v_pos_completed:=position('elsif found and a.task_status=''completed'' then' in v_post_lock);
  v_pos_terminal:=position(
    'elsif found and a.task_status in (''failed'',''cancelled'',''expired'') then' in v_post_lock);
  if v_pos_live=0 or v_pos_parked=0 or v_pos_completed=0 or v_pos_terminal=0
     or v_pos_live>=v_pos_parked or v_pos_parked>=v_pos_completed
     or v_pos_completed>=v_pos_terminal then
    raise exception
      '0032 postverify: registry branch order is wrong (live=%, parked=%, completed=%, terminal=%)',
      v_pos_live,v_pos_parked,v_pos_completed,v_pos_terminal;
  end if;
  -- v_pos_live was only found because the exact, unwidened list
  -- ('queued','running','cancel_requested') is immediately followed by the closing
  -- paren in the source -- a widened list (...,'held','awaiting_input') would not have
  -- matched this literal at all, so finding it already proves the branch was not
  -- widened. held/awaiting_input were considered during 0032's build and dropped once
  -- clara._tf_agent_task_update's own transition matrix proved them structurally
  -- unreachable for kind='autodraft'; reintroducing them would be shipping dead code
  -- with a false rationale again.
  raise notice '0032 postverify OK (2/7): registry branches classify on task status in order live -> parked -> completed -> terminal, the live-status list is unwidened, and the post-lock re-read is a genuine SECOND occurrence';

  -- (3) the parked branch (2+ failure governance) is untouched: it still returns
  -- refused_attempts unconditionally, with no new condition added to it.
  if position(
       'elsif found and a.state=''parked'' then if p_run_id is not null then insert into clara.sweep_run_items'
       in v_post_lock)=0
     or position('return jsonb_build_object(''outcome'',''refused_attempts''' in v_post_lock)=0 then
    raise exception '0032 postverify: the parked governance branch drifted from its unconditional refusal';
  end if;
  raise notice '0032 postverify OK (3/7): the parked (2+ failure) governance gate is untouched and still refuses unconditionally';

  -- (4) the terminal-retry branch: reconciles any outstanding reservation DURABLY on the
  -- attempt row itself (not merely on firm_usage_daily -- Codex's High/blocking finding:
  -- a refund that only touched the shared daily counter was not idempotent across an
  -- early lane/budget return, and could re-refund the same amount on every subsequent
  -- refused retry), clears the stale receipt, and has NO return statement in its own
  -- body (falls through). The branch's own body ends at the elsif-chain's single
  -- closing 'end if;', immediately followed by the lane check's first real statement --
  -- THAT is the correct slice boundary. The far later 'if v_op_key is null then' is on
  -- the other side of the entire lane-check and budget-check blocks (each of which has
  -- its OWN 'return' statements) -- slicing to there instead would silently swallow
  -- both blocks and make the "no early return" assertion below meaningless.
  v_pos_lane_check:=position(
    'select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);'
    in v_post_lock);
  if v_pos_lane_check=0 or v_pos_terminal>=v_pos_lane_check then
    raise exception '0032 postverify: cannot locate the lane-check anchor immediately after the terminal branch';
  end if;
  v_terminal_slice:=substring(v_post_lock from v_pos_terminal for v_pos_lane_check-v_pos_terminal);
  if position('v_is_retry:=true;' in v_terminal_slice)=0
     or position('tokens_used=greatest(0,tokens_used-a.reserved_tokens)' in v_terminal_slice)=0
     or position('update clara.autodraft_attempts set reserved_tokens=0,state=''idle''' in v_terminal_slice)=0
     or position('delete from clara.op_receipts where firm_id=a.firm_id and fn=''admit_autodraft_task''' in v_terminal_slice)=0
     or position(' return ' in v_terminal_slice)<>0 then
    raise exception '0032 postverify: the terminal-retry branch does not durably reconcile+clear+fall-through correctly';
  end if;
  v_pos_opkey_cond:=position('if v_op_key is null then' in v_post_lock);
  if v_pos_opkey_cond=0 or v_pos_lane_check>=v_pos_opkey_cond then
    raise exception '0032 postverify: cannot locate the conditional op-key assignment after the lane/budget checks';
  end if;
  raise notice '0032 postverify OK (4/7): the terminal-retry branch durably reconciles the reservation on the attempt row itself, clears the stale receipt, and falls through with no early return';

  -- (5) the op-key reservation call itself exists EXACTLY once (counted, not merely
  -- found -- position() alone cannot distinguish "at least once" from "exactly once"),
  -- and the final settlement distinguishes re_admitted from admitted.
  v_pos_opkey_call:=position(
    'clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,' in v_post_lock);
  if v_pos_opkey_call=0 or v_pos_opkey_cond>=v_pos_opkey_call then
    raise exception '0032 postverify: the conditional op-key assignment must precede the actual reservation call';
  end if;
  if (length(v_post_lock)-length(replace(v_post_lock,
        'clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,','')))
      / length('clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,') <> 1 then
    raise exception '0032 postverify: clara._reserve_op(...,''admit_autodraft_task'',...) must be called EXACTLY once in the post-lock section';
  end if;
  if position('case when v_is_retry then ''re_admitted'' else ''admitted'' end' in v_post_lock)=0 then
    raise exception '0032 postverify: the final settlement does not distinguish re_admitted from admitted';
  end if;
  raise notice '0032 postverify OK (5/7): the op-key reservation is conditional-then-called EXACTLY once, and the final settlement is honest about a retry vs a first admission';

  -- (6) the completed branch returns an honest, distinct refusal -- never silently
  -- re-admitting and never replaying a stale receipt.
  if position('return jsonb_build_object(''outcome'',''already_done''' in v_post_lock)=0 then
    raise exception '0032 postverify: the completed-task branch does not return an honest already_done refusal';
  end if;
  raise notice '0032 postverify OK (6/7): a completed task refuses honestly with a distinct outcome, never a silent re-admit';

  -- (7) reserved_tokens=0,state='idle' (the terminal branch's reconciliation shape from
  -- probe 4) is compatible with the LIVE ck_autodraft_attempts_reservation CHECK
  -- constraint -- a defensive cross-check that the fix satisfies the actual deployed
  -- constraint, not just this file's assumption about its shape.
  if not exists (
    select 1 from pg_constraint
    where conrelid='clara.autodraft_attempts'::regclass
      and conname='ck_autodraft_attempts_reservation'
      and pg_get_constraintdef(oid) like '%state = ''active''%reserved_tokens > 0%'
  ) then
    raise exception '0032 postverify: ck_autodraft_attempts_reservation no longer has the expected shape -- the reserved_tokens=0,state=''idle'' reconciliation may violate it';
  end if;
  raise notice '0032 postverify OK (7/7): reserved_tokens=0,state=''idle'' is confirmed compatible with the live ck_autodraft_attempts_reservation constraint';

  raise notice '0032 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED — behavioral retry-dispatch and reservation-reconciliation correctness remain the rig suite''s job';
end
$verify$;
