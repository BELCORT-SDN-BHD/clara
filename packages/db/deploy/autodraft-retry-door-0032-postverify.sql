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
--      mutually exclusive branches in the documented order.
--   3. The parked (2+ failure) governance gate precedes the new terminal
--      branches and is untouched -- it still refuses unconditionally.
--   4. The terminal-retry branch reconciles any outstanding reservation and
--      clears the stale settled receipt BEFORE falling through -- no return
--      statement in its own body, so control genuinely reaches the existing
--      lane/budget/task-mint pipeline below.
--   5. The final settlement distinguishes 're_admitted' from 'admitted' --
--      the caller can never be told a stale replay when a fresh task was
--      actually dispatched, or vice versa.
--   6. The live-status branch stays EXACTLY queued/running/cancel_requested, unchanged
--      from 0031 -- a build-time draft widened it to include held/awaiting_input, but
--      clara._tf_agent_task_update's own transition matrix for kind='autodraft' proves
--      those two statuses are structurally unreachable for this task kind, so the
--      widening was reverted rather than ship dead code with a false rationale.
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
  raise notice '0032 postverify OK (1/6): prior-migration chain intact through 0032';

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
  -- 'select df.* into f from clara.document_filings df ...' runs exactly once, strictly
  -- between the pre-lock fast-path and the post-lock recheck.
  v_pos_lock:=position(
    'select df.* into f from clara.document_filings df where df.id=p_filing'
    in v_norm);
  if v_pos_lock=0 then
    raise exception '0032 postverify: cannot locate the filing-lock anchor to isolate the post-lock registry check';
  end if;
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
  raise notice '0032 postverify OK (2/6): registry branches classify on task status in order live -> parked -> completed -> terminal, and the live-status list is unwidened';

  -- (3) the parked branch (2+ failure governance) is untouched: it still returns
  -- refused_attempts unconditionally, with no new condition added to it.
  if position(
       'elsif found and a.state=''parked'' then if p_run_id is not null then insert into clara.sweep_run_items'
       in v_post_lock)=0
     or position('return jsonb_build_object(''outcome'',''refused_attempts''' in v_post_lock)=0 then
    raise exception '0032 postverify: the parked governance branch drifted from its unconditional refusal';
  end if;
  raise notice '0032 postverify OK (3/6): the parked (2+ failure) governance gate is untouched and still refuses unconditionally';

  -- (4) the terminal-retry branch: reconciles any outstanding reservation, clears the
  -- stale receipt, and has NO return statement in its own body (falls through). The
  -- branch's own body ends at the elsif-chain's single closing 'end if;', immediately
  -- followed by the lane check's first real statement -- THAT is the correct slice
  -- boundary. The far later 'if v_op_key is null then' is on the other side of the
  -- entire lane-check and budget-check blocks (each of which has its OWN 'return'
  -- statements) -- slicing to there instead would silently swallow both blocks and
  -- make the "no early return" assertion below meaningless.
  v_pos_lane_check:=position(
    'select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);'
    in v_post_lock);
  if v_pos_lane_check=0 or v_pos_terminal>=v_pos_lane_check then
    raise exception '0032 postverify: cannot locate the lane-check anchor immediately after the terminal branch';
  end if;
  v_terminal_slice:=substring(v_post_lock from v_pos_terminal for v_pos_lane_check-v_pos_terminal);
  if position('v_is_retry:=true;' in v_terminal_slice)=0
     or position('tokens_used=greatest(0,tokens_used-a.reserved_tokens)' in v_terminal_slice)=0
     or position('delete from clara.op_receipts where firm_id=a.firm_id and fn=''admit_autodraft_task''' in v_terminal_slice)=0
     or position(' return ' in v_terminal_slice)<>0 then
    raise exception '0032 postverify: the terminal-retry branch does not reconcile+clear+fall-through correctly';
  end if;
  v_pos_opkey_cond:=position('if v_op_key is null then' in v_post_lock);
  if v_pos_opkey_cond=0 or v_pos_lane_check>=v_pos_opkey_cond then
    raise exception '0032 postverify: cannot locate the conditional op-key assignment after the lane/budget checks';
  end if;
  raise notice '0032 postverify OK (4/6): the terminal-retry branch reconciles the reservation, clears the stale receipt, and falls through with no early return';

  -- (5) the op-key reservation call itself still exists exactly once, and the final
  -- settlement distinguishes re_admitted from admitted.
  v_pos_opkey_call:=position(
    'clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,' in v_post_lock);
  if v_pos_opkey_call=0 or v_pos_opkey_cond>=v_pos_opkey_call then
    raise exception '0032 postverify: the conditional op-key assignment must precede the actual reservation call';
  end if;
  if position('case when v_is_retry then ''re_admitted'' else ''admitted'' end' in v_post_lock)=0 then
    raise exception '0032 postverify: the final settlement does not distinguish re_admitted from admitted';
  end if;
  raise notice '0032 postverify OK (5/6): the op-key reservation is conditional-then-called once, and the final settlement is honest about a retry vs a first admission';

  -- (6) the completed branch returns an honest, distinct refusal -- never silently
  -- re-admitting and never replaying a stale receipt.
  if position('return jsonb_build_object(''outcome'',''already_done''' in v_post_lock)=0 then
    raise exception '0032 postverify: the completed-task branch does not return an honest already_done refusal';
  end if;
  raise notice '0032 postverify OK (6/6): a completed task refuses honestly with a distinct outcome, never a silent re-admit';

  raise notice '0032 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED — behavioral retry-dispatch and reservation-reconciliation correctness remain the rig suite''s job';
end
$verify$;
