-- 0032_autodraft_retry_door.sql — the admission door cannot retry a terminal-failed
-- autodraft task (ledger #45, GitHub #43). Owner ruling, parallel to #44's model-step
-- diagnosis: request_autodraft on a filing whose task has terminally FAILED replays the
-- settled 'admitted' receipt as a silent no-op — same task_id returned, reserved_tokens
-- re-reported, nothing dispatched, attempt_count frozen. There was no documented door to
-- retry a failed autodraft.
--
-- THE MECHANISM, traced against the live 0031 catalog. clara.admit_autodraft_task's
-- registry short-circuit recognizes exactly two shapes: 'active' state with a LIVE task
-- status (queued/running/cancel_requested), and 'parked' state (2+ genuine failures,
-- deliberately blocked pending a human action). Neither shape covers the state a task
-- reaches after exactly ONE failure: clara.settle_autodraft_task's own failure branch
-- sets clara.autodraft_attempts.state='idle' (only 'parked' at attempt_count>=2) — 'idle'
-- matches NEITHER registry branch, so the check falls all the way through, past the lane
-- check, straight into the op-key reservation, where clara._reserve_op finds the SAME
-- deterministic (filing,origin) key's OLD settled 'admitted' receipt from the ORIGINAL
-- successful admission and replays it verbatim. A SECOND, independent gap: a task
-- cancelled via the generic clara.cancel_agent_task verb (shared across chat_turn/wake/
-- autodraft, with no autodraft-specific awareness at all) sets agent_tasks.status=
-- 'cancelled' directly WITHOUT ever touching clara.autodraft_attempts — so
-- a.state stays 'active' (stale) forever, and a.reserved_tokens is NEVER refunded,
-- unlike a genuine settle_autodraft_task failure. Both gaps share one root cause: the
-- registry check trusted clara.autodraft_attempts.state instead of reading
-- clara.agent_tasks.status (the task's own, authoritative record) directly.
--
-- THE FIX. The registry check now classifies on the task's OWN status, read via the
-- existing LEFT JOIN, in four buckets: LIVE (queued/running/cancel_requested, UNCHANGED
-- from 0031 — a build-time draft of this migration also widened the list to
-- held/awaiting_input on the theory that they were the same silent-fallthrough gap one
-- layer removed; clara._tf_agent_task_update's own transition matrix for
-- kind='autodraft' PROVES that theory wrong — queued only ever reaches
-- running/cancel_requested/cancelled, running only completed/failed/cancel_requested,
-- cancel_requested only completed/failed/cancelled, and _tf_agent_task_insert requires
-- status='queued' at creation — so an autodraft task can never legally be held or
-- awaiting_input, and the widening was reverted rather than ship dead code carrying a
-- false rationale) keeps today's replay semantics exactly ('noop_existing'); DONE
-- (completed) refuses honestly — the work already exists, never silently re-admitted,
-- never a stale replay ('already_done'); FAILED/CANCELLED/EXPIRED supersedes —
-- reconciles ANY still-outstanding reservation (a genuine settle_autodraft_task failure
-- already refunded it; a cancellation never did, so this is read from the CURRENT row
-- rather than assumed), clears the stale settled receipt under the SAME deterministic
-- op-key, and falls through — no early return — to the existing lane check, budget
-- checks, and task-mint pipeline UNCHANGED, which genuinely dispatches a fresh task
-- ('expired' is included for the same forward-compatible reason as CLR's shared
-- task-status vocabulary generally — the transition matrix does not currently route any
-- kind to it either, but unlike held/awaiting_input this branch's own comment makes no
-- claim that it is presently reachable). The final settlement distinguishes
-- 're_admitted' (a real retry dispatch) from 'admitted' (the first-ever dispatch) —
-- the caller is never told a stale replay happened when a brand-new task was actually
-- created, mirroring clara.request_reextraction's own 'admission'/'reused' honesty
-- discipline (the house pattern, task #26's filed-bootstrap door) rather than a bespoke
-- vocabulary. The 'parked' governance gate (2+ genuine failures) is completely
-- untouched — it is checked BEFORE the new terminal branches and still refuses
-- unconditionally, exactly as before 0032.
--
-- CoR DISCIPLINE. The body below was pulled via pg_get_functiondef against the live
-- 31-migration database (0001-0031, 0031 merged and deployed as PR #138), not
-- hand-copied from any migration file's static text.
--
-- D1 WRITE-QUIESCE. clara.admit_autodraft_task is the live admission path — the same
-- surface 0031 recut. Per the repo-mandated D1 write-quiesce
-- (packages/db/README.md:95-113), 0032's deploy requires its own quiesced window,
-- independent of 0031's, because this recut is deliberate and lands separately.
--
-- CELLS (packages/db/tests/x32-autodraft-retry-door.test.mjs): a terminal-failed task
-- (via clara.settle_autodraft_task's own failure path) admits a genuinely NEW task on
-- retry, dispatches for real, and attempt accounting (clara.autodraft_attempts.
-- attempt_count) continues correctly once that new task itself settles; a live task's
-- replay semantics are byte-identical to before 0032 (a fresh regression cell, not just
-- reliance on wave-a-admission.test.mjs); a completed task refuses honestly
-- ('already_done'), never silently re-admitting or replaying; the token-reservation
-- reconciliation is proven on BOTH paths — a genuine settle-failure (already refunded,
-- no double-refund) and a generic cancel_agent_task cancellation (never refunded until
-- 0032's own reconciliation, proven not to leak); a cancellation whose retry is then
-- REFUSED (lane or budget) does not re-refund on a subsequent call (x32.f).
--
-- O-ROUND CONFIRMATION (Codex, read-only adversarial pass, one High/blocking finding
-- fixed here; details in the fixed code's own comment at the terminal branch). The
-- as-first-built reconciliation only decremented clara.firm_usage_daily.tokens_used; it
-- never persisted the clear onto clara.autodraft_attempts.reserved_tokens itself, which
-- was reset ONLY by the success-path UPSERT at the very end of the function. If the
-- SAME retry call that ran the refund then hit the lane check or a budget refusal and
-- returned early — a live possibility, not a hypothetical — the row still read the OLD
-- reserved_tokens, so the NEXT call re-entered the terminal branch and refunded the
-- identical amount again, unboundedly, on every subsequent refused retry: a silent,
-- unbounded corruption of the firm's shared daily token counter that could erase OTHER
-- tasks' legitimate same-day usage (greatest(0,...) does not protect against this — it
-- only prevents going negative, not repeated subtraction). Fixed by persisting
-- reserved_tokens=0,state='idle' onto the clara.autodraft_attempts row directly inside
-- the terminal branch, unconditionally, before any code path that could return early —
-- durable because the UPDATE runs in the OUTER scope, strictly before the one inner
-- EXCEPTION-guarded sub-transaction this function has (added by the second O-round fix
-- below, wrapping the op-key reservation together with the mint pipeline it protects)
-- -- a rollback-to-savepoint inside that inner block can never touch a write made
-- before the block opened.
-- Also fixed in the same pass: this migration's own in-transaction tail check for
-- "parked precedes the terminal branches" was comparing the PRE-LOCK occurrence of the
-- parked-branch text against a post-lock-only position, which is vacuously true
-- regardless of the actual post-lock order (the identical bug this migration's own
-- postverify file had already caught and fixed in itself, but had not yet been
-- back-ported to the migration's own tail) — the tail now anchors every check to the
-- SECOND (post-lock) occurrence of the registry re-read statement, exactly as the
-- postverify file does.
--
-- O-ROUND CONFIRMATION, THIRD PASS (Codex, a further scoped read-only review that also
-- independently confirmed the unreachability finding above via official PostgreSQL
-- documentation on ON CONFLICT and row locking). Found that the second pass's own fix
-- did not match its stated boundary: clara._reserve_op's call sat OUTSIDE the new
-- inner block despite the intended "op-key reservation through final return" scope --
-- if the handler ever fires, the mint writes roll back but the PENDING op receipt
-- _reserve_op already inserted (result IS NULL) would survive, orphaned forever, with
-- every later call replaying it as {"pending":true} rather than ever retrying. Fixed
-- by opening the inner block immediately before _reserve_op instead of after it, so
-- its insert is guarded together with the mint pipeline. The tail's own block-boundary
-- check (and the postverify file's matching probe) was correspondingly fixed: it
-- previously required 'begin' to open AFTER the reservation call -- backwards -- and
-- did not rule out a decoy nested block elsewhere satisfying the position check alone;
-- both now require an exact textual adjacency plus an exactly-one-'begin' count. The
-- two-occurrence registry-re-read anchor was tightened to require the FIRST occurrence
-- be strictly before the filing lock too, not just the second one after it (two
-- post-lock reads would previously have passed). The dynamic constraint probe's test
-- tuple was corrected from ('idle',NULL,0,NULL) to a non-null task_id/usage_date,
-- matching what the real reconciliation UPDATE actually leaves in place (it never
-- touches those two columns). Stale "no internal sub-transaction boundary" phrasing
-- and mismatched tail-notice counters (1/5, 2/5 alongside later X/6 notices) were also
-- corrected for honesty.

set role clara_fn_owner;

-- =====================================================================
-- clara.admit_autodraft_task (0011, recut by 0031 for the lane-check reorder, now by
-- 0032 for the terminal-task retry door).
-- =====================================================================
CREATE OR REPLACE FUNCTION clara.admit_autodraft_task(p_filing uuid, p_origin text, p_run_id uuid, p_model text, p_reserve_tokens bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  a record; f record; r record; v_dedupe jsonb; v_lane record; v_task uuid;
  v_op_key text; v_limit bigint; v_used bigint; v_share numeric; v_cap int;
  v_today date:=(now() at time zone 'UTC')::date; v_constraint text;
  v_is_retry boolean:=false;
begin
  if p_filing is null then raise exception 'filing is required' using errcode='CLR10'; end if;

  -- Registry short-circuit is deliberately BEFORE op receipt lookup/creation.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    -- A run-bound noop MUST still write its item, or the run's expected_count is
    -- never reached and it stays open forever (accumulating against the
    -- concurrent-sweep cap — a firm-wide wedge). Mirrors the parked branch.
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  end if;

  if p_origin is null or p_origin not in ('sweep','one_click')
     or p_model is null or nullif(btrim(p_model),'') is null
     or p_reserve_tokens is null or p_reserve_tokens<1
     or (p_origin='sweep' and p_run_id is null)
     or (p_origin='one_click' and p_run_id is not null) then
    raise exception 'autodraft admission is malformed' using errcode='CLR10';
  end if;
  select df.* into f from clara.document_filings df where df.id=p_filing
    and df.retired_at is null for update;
  if not found then raise exception 'active filing not found' using errcode='CLR11'; end if;
  if p_run_id is not null and not exists(select 1 from clara.sweep_runs sr
      where sr.id=p_run_id and sr.firm_id=f.firm_id and sr.state='open') then
    raise exception 'open sweep run not found' using errcode='CLR11';
  end if;
  -- A waiter that lost the filing lock rechecks the registry before touching op receipts.
  -- 0032 (ledger #45/#43): this is now the ONLY authoritative registry decision -- the
  -- pre-lock fast-path above stays exactly as it was (an optimization that skips lock
  -- contention for the common live/parked cases; anything it does not recognize simply
  -- falls through to acquire the lock, same as before 0032). Reading a.task_status
  -- (agent_tasks.status via the LEFT JOIN) DIRECTLY, not a.state alone, matters: a task
  -- cancelled through the generic clara.cancel_agent_task verb (which has no autodraft
  -- awareness at all) leaves a.state='active' STALE forever -- the live-status branch
  -- below correctly excludes it anyway, because 'cancelled' is not in its status list,
  -- so it falls through to the new terminal branch regardless of what a.state says. The
  -- live-status list itself is UNCHANGED from 0031 (queued/running/cancel_requested) --
  -- clara._tf_agent_task_update's transition matrix for kind='autodraft' makes held and
  -- awaiting_input structurally unreachable for this task kind, so there is no adjacent
  -- gap to close there.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  elsif found and a.task_status='completed' then
    -- 0032: the work already exists -- an honest refusal, never a silent re-admit and
    -- never a replayed stale receipt that would misreport what happened (the #43 sin).
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','already_done','task_id',a.task_id);
  elsif found and a.task_status in ('failed','cancelled','expired') then
    -- 0032: SUPERSEDE. Before this migration, the registry check recognized only
    -- 'active'+live-status and 'parked' -- a task that failed once (settle_autodraft_task
    -- sets state='idle' after exactly one failure, only parking at two) matched NEITHER
    -- branch and fell all the way through to the op-key replay below, which found the
    -- OLD settled 'admitted' receipt and returned it verbatim: same task_id, same
    -- reserved_tokens, nothing actually dispatched, attempt_count frozen -- a report that
    -- lies about whether anything happened. Reconciled honestly rather than assumed: a
    -- task that failed through settle_autodraft_task's own failure branch already had
    -- its reservation refunded (reserved_tokens=0 on this row); a task cancelled through
    -- the generic cancel_agent_task verb was NEVER refunded (that verb has no autodraft
    -- awareness), so a.reserved_tokens can still be genuinely outstanding here -- refund
    -- whatever remains before minting the fresh reservation below, so a cancelled
    -- attempt can never leak firm_usage_daily budget forever. The stale settled receipt
    -- is cleared so the SAME deterministic op-key can be reserved again as a genuinely
    -- fresh admission; v_is_retry marks the eventual result 're_admitted', distinct from
    -- a replayed live 'admitted', so the caller is never told a retry replayed when a
    -- brand-new task was actually dispatched. No RETURN here -- control falls through to
    -- the lane check, the budget checks, and the existing task-mint pipeline below,
    -- unchanged, which is what actually dispatches the fresh attempt.
    --
    -- O-round confirmation finding (Codex, High/blocking): refunding firm_usage_daily
    -- alone is NOT idempotent, because autodraft_attempts.reserved_tokens itself was only
    -- ever cleared by the success-path UPSERT far below -- if THIS retry itself then hits
    -- the lane check or a budget refusal and returns early (a live possibility: the lane
    -- may have changed, or the firm's daily budget may be exhausted), the row still reads
    -- reserved_tokens=<the old amount>, so the NEXT call re-enters this same branch and
    -- refunds the identical amount a second time -- unboundedly, on every subsequent
    -- refused retry, silently corrupting the firm's shared daily counter (greatest(0,...)
    -- does not make this safe: it can erase OTHER tasks' legitimate same-day usage). The
    -- reconciliation must therefore be made DURABLE on the attempt row itself, right here,
    -- before any code path that could return early -- reserved_tokens=0 plus a non-active
    -- state (ck_autodraft_attempts_reservation requires state IN ('idle','parked') for a
    -- reserved_tokens=0 row). This UPDATE is unconditional (not gated behind reserved_
    -- tokens>0) so the already-refunded settle-failure path (state already 'idle',
    -- reserved_tokens already 0) sees an idempotent, harmless no-op write, while the
    -- never-refunded cancellation path gets its reservation genuinely closed out. Because
    -- this statement runs in the OUTER scope -- strictly before the one inner EXCEPTION-
    -- guarded sub-transaction this function has, which wraps only the mint pipeline
    -- further below -- it commits together with whichever return the function ultimately
    -- takes, and survives even if that inner block's handler later fires.
    v_is_retry:=true;
    v_op_key:='autodraft:'||p_filing||':'||p_origin;
    if a.reserved_tokens>0 then
      perform pg_advisory_xact_lock(202991617,hashtext(a.firm_id::text));
      insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
        values(a.firm_id,a.usage_date,0) on conflict(firm_id,usage_date) do nothing;
      update clara.firm_usage_daily set tokens_used=greatest(0,tokens_used-a.reserved_tokens)
        where firm_id=a.firm_id and usage_date=a.usage_date;
    end if;
    update clara.autodraft_attempts set reserved_tokens=0,state='idle',updated_at=now()
      where filing_id=p_filing;
    delete from clara.op_receipts where firm_id=a.firm_id and fn='admit_autodraft_task'
      and op_key=v_op_key;
  end if;

  -- 0031 §A (ledger #39, owner ruling): the lane check now runs BEFORE op-key
  -- reservation, and a NOT-READY outcome is never cached. Both admission and
  -- clara.coding_lane (the read verb) already called the identical
  -- clara._coding_lane_core -- there was never a second, forked lane
  -- computation -- but the OLD order reserved (and later settled) the SAME
  -- deterministic (filing,origin) op-key on every refusal, permanently freezing
  -- the first-ever outcome: a vendor binding going live, consent being granted,
  -- or any other later lane-state change was invisible forever, because every
  -- subsequent request_autodraft call for that filing replayed the cached
  -- refusal while clara.coding_lane (uncached) correctly reported the new
  -- state immediately -- reproduced directly (a planted stale receipt was
  -- replayed verbatim while a fresh clara.coding_lane call on the SAME filing,
  -- at the SAME instant, reported the correct answer). Only a genuine
  -- 'admitted' outcome creates a real resource (an agent_tasks row) that needs
  -- idempotent replay protection on retry; a refusal creates nothing, so it
  -- must be re-derived fresh on every call -- admission and the read verb now
  -- agree BY CONSTRUCTION, never by parallel maintenance or a stale cache.
  select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);
  if v_lane.lane<>'ready' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
          jsonb_build_object('clr','CLR29','reason','lane_changed','lane',v_lane.lane,
            'reasons',v_lane.reasons)) on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','lane_changed','lane',v_lane.lane,
      'reasons',v_lane.reasons);
  end if;

  -- 0031 O-round confirmation finding 2: the budget/concurrency-cap refusals below
  -- are EXACTLY the same class of transient, state-dependent fact as the lane check
  -- above (firm_usage_daily resets per usage_date; sweep_runs' open count changes
  -- as runs close) -- caching either of them under the same state-free (filing,
  -- origin) key would freeze a budget refusal past a daily reset or a cleared
  -- concurrency cap exactly as the lane bug did. Neither refusal branch below
  -- mutates firm_usage_daily/sweep_runs (only the eventual success path does), so
  -- re-deriving them fresh on every call has no double-charge side effect. Op-key
  -- reservation therefore moves to immediately before the one mutation that
  -- actually needs idempotent replay protection: task creation itself.
  perform pg_advisory_xact_lock(202991617,hashtext(f.firm_id::text));
  select coalesce(fl.daily_token_limit,1000000),fl.sweep_budget_share,
      fl.max_concurrent_sweeps into v_limit,v_share,v_cap
    from clara.firms z left join clara.firm_limits fl on fl.firm_id=z.id
    where z.id=f.firm_id;
  v_share:=coalesce(v_share,0.60); v_cap:=coalesce(v_cap,2);
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(f.firm_id,v_today,0) on conflict(firm_id,usage_date) do nothing;
  select tokens_used into v_used from clara.firm_usage_daily
    where firm_id=f.firm_id and usage_date=v_today for update;
  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open')>=v_cap then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget','gate','concurrency'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;
  if (p_origin='sweep' and v_used+p_reserve_tokens>(v_limit*v_share)::bigint)
     or (p_origin='one_click' and v_used+p_reserve_tokens>v_limit) then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;

  -- O-round confirmation finding #2 (Codex, second scoped pass, High/blocking): a
  -- plpgsql EXCEPTION clause implicitly opens a SAVEPOINT at the START of whatever
  -- block it is attached to -- when this exception clause lived on the function's
  -- OUTER (top-level) block, an unique_violation caught here would roll back to a
  -- savepoint established BEFORE the function body even began, undoing EVERY write
  -- made since, including the terminal branch's reconciliation UPDATE far above (the
  -- #1 fix). Any exception this handler catches -- for ANY reason, present or future
  -- -- would silently erase that reconciliation right before returning
  -- 'noop_existing', reopening the exact double-refund risk #1 closed: the NEXT call
  -- would find reserved_tokens still nonzero and re-refund. Nesting this
  -- EXCEPTION-guarded region in its OWN inner BEGIN...END, opened only HERE --
  -- immediately before the one mutation sequence it exists to protect -- means its
  -- implicit savepoint is established AFTER the terminal branch's reconciliation
  -- already ran in the OUTER, unguarded scope; a rollback-to-savepoint here can only
  -- ever undo what THIS inner block itself wrote, never anything from before it
  -- opened. No other exception handler exists anywhere else in this function.
  --
  -- Third O-round confirmation finding (Codex, third scoped pass, Medium): a build-
  -- time draft of THIS fix opened the inner block AFTER the op-key reservation call,
  -- leaving _reserve_op's own insert in the OUTER, unguarded scope -- if the inner
  -- block's handler ever fires, the mint writes roll back but the PENDING op receipt
  -- _reserve_op already inserted (result IS NULL) would survive, orphaned forever:
  -- every subsequent call would replay that pending receipt as {"pending":true}
  -- rather than ever retrying. The op-key is still reserved "immediately before the
  -- one mutation sequence that needs idempotent replay protection" -- that sequence
  -- now begins here, at the top of THIS block, not before it.
  begin
    if v_op_key is null then
      v_op_key:='autodraft:'||p_filing||':'||p_origin;
    end if;
    v_dedupe:=clara._reserve_op(f.firm_id,'admit_autodraft_task',v_op_key,
      clara._hash(jsonb_build_object('filing',p_filing,'origin',p_origin)));
    if v_dedupe is not null then return v_dedupe; end if;

    update clara.firm_usage_daily set tokens_used=tokens_used+p_reserve_tokens
      where firm_id=f.firm_id and usage_date=v_today;
    insert into clara.agent_tasks(firm_id,client_id,kind,status,model_snapshot)
      values(f.firm_id,f.client_id,'autodraft','queued',btrim(p_model)) returning id into v_task;
    insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,
        task_id,origin,run_id,state,reserved_tokens,usage_date,last_refusal)
      values(f.firm_id,f.client_id,f.document_id,p_filing,v_task,p_origin,p_run_id,
        'active',p_reserve_tokens,v_today,null)
      on conflict(filing_id) do update set task_id=excluded.task_id,origin=excluded.origin,
        run_id=excluded.run_id,state='active',reserved_tokens=excluded.reserved_tokens,
        usage_date=excluded.usage_date,last_refusal=null,updated_at=now();
    perform clara._audit(f.firm_id,null,null,null,'admit_autodraft_task',null,
      jsonb_build_object('task',v_task,'filing',p_filing,'origin',p_origin,
        'run',p_run_id,'reserved_tokens',p_reserve_tokens));
    return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
      jsonb_build_object('outcome',case when v_is_retry then 're_admitted' else 'admitted' end,
        'task_id',v_task,'reserved_tokens',p_reserve_tokens));
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_autodraft_attempts_filing' then
      select * into a from clara.autodraft_attempts where filing_id=p_filing;
      if p_run_id is not null then
        insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
            outcome)
          values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
          on conflict do nothing;
      end if;
      return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
    end if;
    raise;
  end;
end $function$;

reset role;

-- =====================================================================
-- TAIL — in-transaction self-verification. Every raise is a real assertion failure, not
-- a soft warning; a clean run ends with one notice and nothing else.
-- =====================================================================
do $tail$
declare
  v_prior_count int;
  v_admit_src text;
  v_reread_marker text := 'select aa.*,t.status as task_status into a from clara.autodraft_attempts aa';
  v_filing_lock_marker text := 'select df.* into f from clara.document_filings df where df.id=p_filing and df.retired_at is null for update;';
  v_pos_lock2 int; v_pos_first_read int; v_post_lock text;
  v_pos_filing_lock int; v_occurrence_count int; v_scan_from int; v_found int;
  v_pos_completed int; v_pos_terminal int; v_pos_lane_check int; v_pos_opkey int;
  v_terminal_slice text;
begin
  -- (1) mandatory prior-migration check — 0031 must already be applied.
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0031_autopost_lane_unify';
  if v_prior_count <> 1 then
    raise exception '0032 tail: migration 0031_autopost_lane_unify is not recorded as applied — apply in order';
  end if;

  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_admit_src;
  -- O-round confirmation finding (Codex, discovered the hard way): a bare string search
  -- against the RAW function definition can be tripped by this tail's OWN explanatory
  -- comments -- an earlier draft's prose ("...before any code path that could return
  -- early...") contained the literal substring ' return ' and made the "no early return"
  -- check below fail against a CORRECT body. Strip comments first, exactly as the
  -- external postverify file already does, so only executable code is ever searched.
  v_admit_src:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_admit_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  -- Isolate the POST-LOCK registry recheck. O-round confirmation finding (Codex): the
  -- live/parked branch TEXT is IDENTICAL between the pre-lock fast-path and the post-lock
  -- authoritative check, so an unanchored position() search finds the pre-lock occurrence
  -- first — comparing that against a post-lock-only position (like v_pos_completed) is
  -- ALWAYS true regardless of the actual post-lock order, making the assertion vacuous.
  -- The registry re-read statement itself (real code, not a comment) appears exactly
  -- twice — once pre-lock, once post-lock. Find the SECOND occurrence explicitly and
  -- slice from there, so every subsequent search is scoped to post-lock text only.
  --
  -- Second O-round confirmation finding (Codex, second scoped pass): merely taking
  -- "the second occurrence found" is not itself proof that occurrence is genuinely
  -- POST-lock -- a regression that added a SECOND read still inside the pre-lock
  -- fast-path (e.g. a defensive re-check before falling through to acquire the lock)
  -- would satisfy the old logic without ever reaching the real post-lock text. Two
  -- independent structural facts are now required: the chosen occurrence's position
  -- must be STRICTLY AFTER the filing's own `for update` lock statement (a genuinely
  -- unique, real-code anchor -- the lock cannot be acquired before it is requested),
  -- AND the marker must appear EXACTLY twice in the whole body, not merely "at least
  -- twice" (a third occurrence anywhere would mean this scan can no longer be trusted
  -- to have found the true post-lock recheck without also verifying total count).
  --
  -- Third O-round confirmation finding (Codex, third scoped pass, Low): checking only
  -- "the second occurrence is after the lock" does not rule out BOTH occurrences being
  -- after the lock (e.g. the pre-lock fast-path itself being moved or duplicated) --
  -- the advertised shape is specifically "one pre-lock, one post-lock", so the FIRST
  -- occurrence's position must also be captured and proven to be BEFORE the lock.
  v_pos_filing_lock:=position(v_filing_lock_marker in v_admit_src);
  if v_pos_filing_lock=0 then
    raise exception '0032 tail: cannot locate the filing FOR UPDATE lock statement';
  end if;
  v_occurrence_count:=0; v_scan_from:=1;
  loop
    v_found:=position(v_reread_marker in substring(v_admit_src from v_scan_from));
    exit when v_found=0;
    v_occurrence_count:=v_occurrence_count+1;
    if v_occurrence_count=1 then v_pos_first_read:=v_scan_from+v_found-1; end if;
    if v_occurrence_count=2 then v_pos_lock2:=v_scan_from+v_found-1; end if;
    v_scan_from:=v_scan_from+v_found-1+length(v_reread_marker);
  end loop;
  if v_occurrence_count<>2 then
    raise exception '0032 tail: the registry re-read must appear EXACTLY twice (pre-lock + post-lock) — found %', v_occurrence_count;
  end if;
  if not (v_pos_first_read < v_pos_filing_lock and v_pos_filing_lock < v_pos_lock2) then
    raise exception '0032 tail: the two registry re-reads must straddle the filing lock -- one strictly BEFORE, one strictly AFTER (first=%, lock=%, second=%)', v_pos_first_read, v_pos_filing_lock, v_pos_lock2;
  end if;
  v_post_lock:=substring(v_admit_src from v_pos_lock2);

  -- (2) the post-lock registry check's branch order: parked stays before the new
  -- terminal branches (the 2+-failure governance gate must never be bypassed by the
  -- retry door), 'completed' before 'failed/cancelled/expired', and the op-key
  -- reservation strictly after all of them — all positions relative to v_post_lock, so
  -- the pre-lock occurrences of the same branch text can never satisfy this check.
  v_pos_completed:=position(
    'elsif found and a.task_status=''completed'' then' in v_post_lock);
  v_pos_terminal:=position(
    'elsif found and a.task_status in (''failed'',''cancelled'',''expired'') then'
    in v_post_lock);
  v_pos_opkey:=position(
    'if v_op_key is null then' in v_post_lock);
  if v_pos_completed=0 or v_pos_terminal=0 or v_pos_opkey=0
     or v_pos_completed>=v_pos_terminal or v_pos_terminal>=v_pos_opkey then
    raise exception
      '0032 tail: registry branch order is wrong (completed=%, terminal=%, opkey=%)',
      v_pos_completed,v_pos_terminal,v_pos_opkey;
  end if;
  raise notice '0032 tail OK (1/6): post-lock registry branch order (completed -> terminal -> conditional op-key) is intact';

  -- (3) the parked branch must come BEFORE the new terminal branches, WITHIN the
  -- post-lock section specifically — the 2+-failure governance gate is checked first and
  -- takes precedence unconditionally.
  if position('elsif found and a.state=''parked'' then' in v_post_lock)=0
     or position('elsif found and a.state=''parked'' then' in v_post_lock)>=v_pos_completed then
    raise exception '0032 tail: the POST-LOCK parked governance branch must precede the new terminal branches';
  end if;
  raise notice '0032 tail OK (2/6): the parked (2+ failure) governance gate still takes precedence over the retry door, in the post-lock section itself';

  -- (4) the terminal-retry branch reconciles the reservation DURABLY on the attempt row
  -- itself (not just firm_usage_daily) and clears the stale receipt BEFORE falling
  -- through (no return statement in its own body). O-round confirmation finding (Codex,
  -- High/blocking): a refund that only touched firm_usage_daily was not idempotent across
  -- an early lane/budget return — the attempt row's own reserved_tokens/state must be
  -- durably cleared in this same branch, unconditionally, or a refused retry re-refunds
  -- the same amount on every subsequent call. The slice must end at the lane check's
  -- first real statement, NOT at the far-later conditional op-key assignment — the
  -- lane-check and budget-check blocks in between each have their OWN 'return'
  -- statements, and slicing all the way to v_pos_opkey would swallow them, making the
  -- "no early return" assertion below pass vacuously (the exact bug this migration's
  -- own postverify file already caught and fixed in itself; ported here too).
  v_pos_lane_check:=position(
    'select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);'
    in v_post_lock);
  if v_pos_lane_check=0 or v_pos_terminal>=v_pos_lane_check then
    raise exception '0032 tail: cannot locate the lane-check anchor immediately after the terminal branch';
  end if;
  v_terminal_slice:=substring(v_post_lock from v_pos_terminal for v_pos_lane_check-v_pos_terminal);
  if position('v_is_retry:=true;' in v_terminal_slice)=0
     or position('delete from clara.op_receipts where firm_id=a.firm_id and fn=''admit_autodraft_task''' in v_terminal_slice)=0
     or position('tokens_used=greatest(0,tokens_used-a.reserved_tokens)' in v_terminal_slice)=0
     or position('update clara.autodraft_attempts set reserved_tokens=0,state=''idle''' in v_terminal_slice)=0
     or position(' return ' in v_terminal_slice)<>0 then
    raise exception '0032 tail: the terminal-retry branch does not durably reconcile the reservation, clear the stale receipt, and fall through correctly';
  end if;
  raise notice '0032 tail OK (3/6): the terminal-retry branch durably reconciles the reservation on the attempt row itself, clears the stale receipt, and falls through with no early return';

  -- (5) the final settlement distinguishes re_admitted from admitted.
  if position('case when v_is_retry then ''re_admitted'' else ''admitted'' end' in v_post_lock)=0 then
    raise exception '0032 tail: the final settlement does not distinguish re_admitted from admitted';
  end if;
  raise notice '0032 tail OK (4/6): the final settlement honestly distinguishes a retry dispatch from a first-ever one';

  -- (6) O-round confirmation finding #2 (Codex, second scoped pass): the terminal
  -- branch's durable reconciliation (check 3 above) must be structurally OUTSIDE any
  -- EXCEPTION-guarded region -- a plpgsql EXCEPTION clause implicitly opens a SAVEPOINT
  -- at the start of ITS OWN block, and a caught exception rolls back to that savepoint,
  -- undoing every write made since, even ones from earlier in the SAME outer scope if
  -- the handler sits on that outer scope rather than a nested inner one. Prove the
  -- reconciliation UPDATE's position is BEFORE the inner block's own 'begin', and that
  -- the exception handler is attached to THAT inner block (a nested 'exception when
  -- unique_violation' immediately preceding the function's final 'end'), not the
  -- outer one -- exactly one such handler exists anywhere in the body.
  --
  -- Third O-round confirmation finding (Codex, third scoped pass, Medium): a build-time
  -- draft of THIS check required the inner 'begin' to open AFTER the op-key reservation
  -- call -- backwards from the fix's OWN corrected boundary (finding #2 of the third
  -- pass): _reserve_op's own insert must be INSIDE the guarded block too, or a caught
  -- exception leaves its pending receipt orphaned. The check now requires 'begin' to be
  -- immediately adjacent to the conditional op-key assignment that starts the guarded
  -- sequence (proving nothing slips in between), and additionally requires there be
  -- EXACTLY ONE bare 'begin' anywhere in the post-lock section -- since this migration
  -- applied cleanly (a syntax error would have failed CREATE FUNCTION outright), any
  -- 'begin' found must already be validly paired with its own 'end'; finding exactly
  -- one rules out a decoy nested block elsewhere satisfying the adjacency check alone.
  if (length(v_post_lock)-length(replace(v_post_lock,'exception when unique_violation','')))
     / length('exception when unique_violation') <> 1 then
    raise exception '0032 tail: exactly one ''exception when unique_violation'' handler must exist';
  end if;
  if position('exception when unique_violation'in v_post_lock)
     <= position('update clara.autodraft_attempts set reserved_tokens=0,state=''idle''' in v_post_lock) then
    raise exception '0032 tail: the exception handler must come AFTER the terminal branch''s durable reconciliation, not wrap it';
  end if;
  if (length(v_post_lock)-length(replace(v_post_lock,' begin ','')))
     / length(' begin ') <> 1 then
    raise exception '0032 tail: exactly one nested ''begin'' must exist in the post-lock section (a decoy block would defeat the adjacency check alone)';
  end if;
  if position('begin if v_op_key is null then' in v_post_lock)=0 then
    raise exception '0032 tail: the inner exception-guarded block must open IMMEDIATELY before the conditional op-key assignment, so _reserve_op''s own insert is guarded too';
  end if;
  raise notice '0032 tail OK (5/6): the reconciliation is structurally OUTSIDE the exception-guarded region -- exactly one handler exists, attached to a single inner block opened immediately before the op-key reservation, guarding it and the mint pipeline together';

  -- (6) is a SEPARATE do block below (no pg_get_functiondef call in it) -- it dynamically
  -- APPLIES the live ck_autodraft_attempts_reservation constraint to real test tuples via
  -- a throwaway temp table, rather than pattern-matching the constraint definition's text.
  -- O-round confirmation finding (Codex, second scoped pass): a substring match against
  -- pg_get_constraintdef's rendering only proves the definition CONTAINS certain
  -- fragments, never that the reserved_tokens=0,state='idle' tuple is actually ACCEPTED
  -- by the real, live expression -- a constraint reformatted or logically altered in a
  -- way that still happens to contain those fragments would pass a substring probe while
  -- genuinely rejecting the reconciliation shape at runtime.
end
$tail$;

do $tail_constraint$
declare
  v_condef text;
begin
  select pg_get_constraintdef(oid) into v_condef
    from pg_constraint
    where conrelid='clara.autodraft_attempts'::regclass
      and conname='ck_autodraft_attempts_reservation';
  if v_condef is null then
    raise exception '0032 tail: ck_autodraft_attempts_reservation is missing entirely';
  end if;
  create temp table _x0032_reservation_probe(
    state text, task_id uuid, reserved_tokens bigint, usage_date date
  ) on commit drop;
  -- pg_get_constraintdef already renders the leading CHECK(...) wrapper, so it is
  -- appended directly rather than after a second literal 'check' keyword.
  execute format('alter table _x0032_reservation_probe add constraint ck_probe %s', v_condef);

  -- THE FIX's exact shape (reserved_tokens=0, state='idle') must be ACCEPTED. O-round
  -- confirmation finding (Codex, third scoped pass, Low): the real reconciliation
  -- UPDATE never touches task_id or usage_date -- it leaves whatever the row already
  -- had (the OLD task's id, a real usage_date), never nulls them. Testing with nulls
  -- here would pass even against a future constraint that required task_id/usage_date
  -- to be NULL for state='idle', which would reject the real reconciled row -- test
  -- with a genuinely non-null task_id and usage_date, matching the actual tuple shape.
  insert into _x0032_reservation_probe(state,task_id,reserved_tokens,usage_date)
    values('idle',gen_random_uuid(),0,current_date);

  -- Self-check the probe is not vacuous: an INVALID tuple (an 'active' row claiming
  -- reserved_tokens=0, which the constraint's own 'active' branch requires to be > 0)
  -- must be REJECTED -- if it were accepted, this probe mechanism could never have
  -- caught a genuinely broken reconciliation shape either.
  begin
    insert into _x0032_reservation_probe(state,task_id,reserved_tokens,usage_date)
      values('active',gen_random_uuid(),0,current_date);
    raise exception '0032 tail: the live ck_autodraft_attempts_reservation constraint unexpectedly ACCEPTED an active+zero-reservation tuple — this probe would be vacuous';
  exception when check_violation then
    null; -- expected: the constraint correctly rejects the invalid tuple
  end;

  drop table _x0032_reservation_probe;
  raise notice '0032 tail OK (6/6 overall): reserved_tokens=0,state=''idle'' is genuinely ACCEPTED by the live ck_autodraft_attempts_reservation constraint (dynamically applied, not pattern-matched), and the probe itself correctly rejects an invalid tuple';
  raise notice '0032 tail: admit_autodraft_task now supersedes a terminal-failed/cancelled/expired task honestly (re_admitted, reservation DURABLY reconciled on the attempt row itself before any exception-guarded region, stale receipt cleared) while a completed task refuses honestly and a live task replays unchanged — the parked governance gate is untouched';
end
$tail_constraint$;
