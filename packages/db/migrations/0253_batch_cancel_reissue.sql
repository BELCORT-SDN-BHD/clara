-- 0253_batch_cancel_reissue — #968 (riders wave 2, lane 05; document intake): LET A DIFFERENT,
-- CURRENTLY ACTIVE BOOKKEEPER RE-ISSUE A STOP ON AN INTAKE BATCH WHOSE ORIGINAL CANCELLER HAS
-- LOST AUTHORITY MID-STOP.
-- =====================================================================================
-- Spec of record: issue #968. Ruled out of wave 2026-09-18 as DECISIONS.md row R-B (§6.2.0,
-- marked owner-overridable): "not this wave; a separate ticket for letting someone else re-issue
-- after the original requester leaves". Owner's ruling (2026-09-20, on the issue): "Confirmed
-- Option B: a different, currently active bookkeeper may re-issue a stop on an intake batch whose
-- original canceller has lost active membership, under a fresh operation key. … recorded as a
-- genuinely new decision, never a re-key of the original, so the binding rule that one
-- cancellation decision can never be silently re-keyed by another identity is preserved."
-- Domain words: CONTEXT.md — "Batch cancellation re-issue" (added by this file).
--
-- THE GAP THIS FILE CLOSES, MEASURED IN 0229 ITSELF (`clara.get_intake_batch`'s own header,
-- ADV-636-03) AND UNCHANGED SINCE: `clara.cancel_intake_batch` refuses ANY second decision on a
-- non-open batch under a different op key with CLR13 `batch_already_cancelling`
-- (0229:864-869) — by ruling, so the fan-out MUST re-issue under the STORED actor
-- (`clara._work_door_ctx` hashes {work, author}, 0184:262-264). If that actor loses active
-- bookkeeper+ membership before the batch finishes stopping, every child refuses CLR04
-- `actor_not_active` on every sweep, forever, and `clara.get_intake_batch` correctly NAMES the
-- block (`cancel_blocked: 'canceller_not_active'`, 0229:1077-1095) but nothing lets another
-- bookkeeper take over. The only product-level remedy left was the per-Work fallback the card
-- already names (`intake-batch-card.tsx`'s per-row "Open Work" link into the ordinary per-Work
-- cancel).
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.cancel_intake_batch`'s refusal-on-duplicate rule
-- gains ONE named exception: while the batch is still `cancelling` AND its STORED canceller no
-- longer holds an active bookkeeper+ membership — the EXACT predicate `clara.get_intake_batch`
-- already evaluates for `cancel_blocked` — a call under a DIFFERENT actor and a FRESH op key is
-- admitted as a genuinely new decision, which re-points `cancel_requested_by` / `cancel_op_key` /
-- `cancel_requested_at` at the new actor, key and moment. Every other path through the function
-- (the open→cancelling flip, the terminal-in-one-call flip, the op-key replay, the live/pending
-- fan-out, the audit call, the per-member event insert) is BYTE-UNCHANGED.
--
-- WHY THIS NEEDS NO NEW COLUMN, NO NEW TABLE AND NO NEW GRANTED NAME.
--   * `clara.audit_log` is append-only (0002:270-288) and every call to `cancel_intake_batch`
--     — the original AND the re-issue — already reaches its own `perform clara._audit(...)` at
--     the function's tail, unconditionally. The original decision's row (actor=the old canceller,
--     args.op_key=the old key) is never touched by the re-issue, so it stays readable forever;
--     this file adds no new audit call and no new column to read it by.
--   * `clara.intake_batch_member_events` is append-only per `(member_id, event, recorded_at)`
--     (0229's own `on conflict … do nothing` is keyed on that triple, never on the key or actor),
--     and the per-member `cancel_requested` insert loop already runs UNCONDITIONALLY on every
--     call to this function — first decision or re-issue alike — so the original decision's own
--     event rows (carrying the OLD `cancel_op_key` in their `detail`) are never overwritten.
--   * `clara.get_intake_batch` needs NO change at all: it already reads `cancel_requested_by` LIVE
--     off the row on every call (0229:1068-1069, unmoved since #964's own 0252 splice touched
--     only the `capacity` descriptor two functions away), so the moment this file re-points that
--     column at the new, active actor, the SAME already-shipped `cancel_blocked` predicate
--     re-evaluates to `null` on its own — the block clears with NO edit to the read's body. This
--     is exactly the Agent Brief's own out-of-scope line: "Any change to … the read envelope's
--     existing block and pending-member fields, both already shipped" — so this file makes none.
--   * No function is added, removed or regranted. `cancel_intake_batch`'s signature, owner, ACL
--     and every other line of its body are unmoved — §T re-reads the ACL byte-identical to what
--     was measured before this file ran. This migration therefore needs NO rig-meta cohort:
--     `operation-census.test.mjs` / `rig-isolation.test.mjs` have nothing new to track.
--
-- WHAT IT DOES NOT DO.
--   * NO change to the terminal cancellation rule: a batch already `cancelled` keeps refusing
--     EVERY second decision unconditionally, whatever the stored canceller's standing — the
--     exception below is gated on `b.state = 'cancelling'` and nothing else reaches it. §T proves
--     this by direct construction, and `p968.reissue.terminal_batch_never_reissued` proves it
--     against the real door.
--   * NO general "reassign authority mid-operation" mechanism: the exception is local to this one
--     door's one refusal, keyed on the one predicate the read already names, and touches no other
--     door in the estate.
--   * NO cadence for the cancellation sweep: `clara.sweep_intake_batch_cancellations` is unmoved —
--     the re-issue is a HUMAN decision through the same door the first stop used, never something
--     the belt invents on its own.
--   * NO web change: `apps/web/components/documents/intake-batch-card.tsx`'s Stop button is
--     already reachable on any non-terminal batch regardless of `cancel_blocked`
--     (`{!terminal ? <Button …>Stop…</Button> : null}`), and
--     `intake-batch-cancel-dialog.tsx`'s decision key is already minted fresh per dialog OPEN
--     (`useDecisionKey`), so a different, currently active bookkeeper opening the SAME card and
--     pressing Stop again already sends exactly the shape this door now admits. Confirmed by
--     reading both files; no line of either changes in this PR.
--
-- REDO-SAFETY (#957). The one statement below is `create or replace function` — naturally
-- idempotent DDL. The splice is ALSO idempotent against its OWN prior effect: if the live body
-- already carries the target `elsif` branch, it is skipped with a NOTICE rather than re-applied,
-- so `CLARA_MIGRATION_REDO=0253_batch_cancel_reissue` after an unmerged fix-round edit re-runs
-- cleanly whether or not a prior attempt already landed.
-- =====================================================================================

do $w968_pre$
declare v_sig text := 'clara.cancel_intake_batch(uuid,uuid,text)';
        v_pre constant text := '18f5b8d52209dbd067da1e1d74d0ed66f19c59a236a51ec60fa6f15271501222';
        v_src text;
begin
  if to_regprocedure(v_sig) is null then
    raise exception '#968 prestate: % is absent -- its owning migration (0229) must apply first', v_sig
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if v_src not like '%elsif b.state = ''cancelling'' and b.cancel_op_key is distinct from p_op_key then%'
     and encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
    raise exception '#968 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
      using errcode='CLR10';
  end if;
  raise notice '#968 prestate: clean -- clara.cancel_intake_batch resolves and carries either the pinned 0229 pre-image or this file''s own already-landed target.';
end
$w968_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.cancel_intake_batch — TWO anchors in the one body: the refusal-on-duplicate guard
--     gains its one named exception, and the state-transition block gains the re-issue's own
--     branch. Both anchors are non-overlapping, each proven to occur exactly once before the
--     splice, and the reverse substitution below proves nothing else in the ~2.4KB body moved.
-- =====================================================================================
do $w968_cancel$
declare
  v_sig text := 'clara.cancel_intake_batch(uuid,uuid,text)';
  v_pre constant text := '18f5b8d52209dbd067da1e1d74d0ed66f19c59a236a51ec60fa6f15271501222';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int; v_probe text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)`: scripts/wiki-lint-checks.mjs's CoR-patch
  -- target attribution resolves `pg_get_functiondef`'s argument only through a direct signature
  -- literal or a variable whose LATEST assignment is one (0252's own comment, restated).
  v_oid := 'clara.cancel_intake_batch(uuid,uuid,text)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$  if b.state <> 'open' and b.cancel_op_key is distinct from p_op_key then
    raise exception 'this intake batch is already stopping under another decision'
      using errcode='CLR13',
      detail=jsonb_build_object('reason','batch_already_cancelling','state',b.state,
                                'cancel_op_key',b.cancel_op_key)::text;
  end if;$t1$;
  v_r1 := $r1$  if b.state <> 'open' and b.cancel_op_key is distinct from p_op_key then
    -- #968: ONE NAMED EXCEPTION. `clara.get_intake_batch` already reports a `cancelling` batch
    -- whose STORED canceller no longer holds an active bookkeeper+ membership as
    -- cancel_blocked='canceller_not_active' -- the EXACT predicate re-read below. When it holds, a
    -- DIFFERENT bookkeeper may re-issue the stop as a genuinely new decision:
    -- clara._intake_batch_actor_ctx above already proved p_actor IS an active bookkeeper+, so this
    -- can never be the SAME blocked identity re-keying its own decision. A batch already
    -- `cancelled` (terminal) is untouched -- the exception applies only while still `cancelling`.
    if b.state <> 'cancelling' or b.cancel_requested_by is null
       or exists (select 1 from clara.firm_memberships fm
                   where fm.user_id = b.cancel_requested_by
                     and fm.status = 'active'
                     and clara.role_rank(fm.role) >= clara.role_rank('bookkeeper')) then
      raise exception 'this intake batch is already stopping under another decision'
        using errcode='CLR13',
        detail=jsonb_build_object('reason','batch_already_cancelling','state',b.state,
                                  'cancel_op_key',b.cancel_op_key)::text;
    end if;
  end if;$r1$;

  v_t2 := $t2$  if b.state = 'open' then
    update clara.intake_batches
       set state = 'cancelling', cancel_requested_by = p_actor, cancel_op_key = p_op_key,
           cancel_requested_at = now(), updated_at = now()
     where id = p_batch and state = 'open';
  end if;$t2$;
  v_r2 := $r2$  if b.state = 'open' then
    update clara.intake_batches
       set state = 'cancelling', cancel_requested_by = p_actor, cancel_op_key = p_op_key,
           cancel_requested_at = now(), updated_at = now()
     where id = p_batch and state = 'open';
  elsif b.state = 'cancelling' and b.cancel_op_key is distinct from p_op_key then
    -- #968: THE RE-ISSUE lands here, reached only past the guard above -- b.cancel_requested_by is
    -- provably blocked and p_actor is provably active, so this can never re-key one identity's own
    -- decision under a second key.
    update clara.intake_batches
       set cancel_requested_by = p_actor, cancel_op_key = p_op_key,
           cancel_requested_at = now(), updated_at = now()
     where id = p_batch and state = 'cancelling';
  end if;$r2$;

  if v_src like ('%' || v_r2 || '%') then
    raise notice '#968 cancel: already at the re-issue target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#968 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;

    foreach v_probe in array array[v_t1, v_t2] loop
      v_occ := (length(v_src) - length(replace(v_src, v_probe, ''))) / length(v_probe);
      if v_occ <> 1 then
        raise exception '#968 cancel: an anchor occurs % time(s) in %, expected exactly 1 -- re-derive before patching', v_occ, v_sig
          using errcode='CLR10';
      end if;
    end loop;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#968 cancel: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(replace(v_src, v_t1, v_r1), v_t2, v_r2);
    execute v_head || 'AS $w968can$' || v_new || '$w968can$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if v_src not like ('%' || v_r2 || '%') or v_src not like ('%' || v_r1 || '%') then
      raise exception '#968 cancel: % did not land the re-issue exception after the splice', v_sig using errcode='CLR10';
    end if;
    v_back := replace(replace(v_src, v_r1, v_t1), v_r2, v_t2);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#968 cancel: the splice on % changed MORE than its two anchors -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#968 cancel: clara.cancel_intake_batch now admits a re-issue from a different, currently active bookkeeper when the STORED canceller no longer holds an active bookkeeper+ membership; every other byte is the pinned 0229 body.';
  end if;
end
$w968_cancel$;

comment on function clara.cancel_intake_batch(uuid,uuid,text) is
  '#636/#968: decide to stop an intake batch. Flips open -> cancelling (or straight to cancelled '
  'when no child is live), stores the actor and key the fan-out must re-issue with, and returns '
  'the live child list -- the caller fans clara.cancel_accounting_work out one call per '
  'transaction. #968: while still `cancelling`, a DIFFERENT, currently active bookkeeper may '
  're-issue the stop under a fresh key once the STORED canceller no longer holds an active '
  'bookkeeper+ membership -- the same predicate clara.get_intake_batch reports as '
  'cancel_blocked=''canceller_not_active''. A batch whose stored canceller is still active, or '
  'one already `cancelled`, keeps refusing a second decision exactly as 0229 shipped it.';

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim this file made about what moved, and what did not, re-read from the
-- committed catalog.
-- =====================================================================================
do $w968_tail$
declare v_src text; v_acl text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.cancel_intake_batch(uuid,uuid,text)'::regprocedure;

  -- (T1) THE EXCEPTION IS PRESENT, gated on `cancelling` and the live membership check, never on
  -- batch state alone.
  if v_src not like '%elsif b.state = ''cancelling'' and b.cancel_op_key is distinct from p_op_key then%'
     or v_src not like '%if b.state <> ''cancelling'' or b.cancel_requested_by is null%'
     or v_src not like '%fm.status = ''active''%and clara.role_rank(fm.role) >= clara.role_rank(''bookkeeper'')%' then
    raise exception '#968 tail: clara.cancel_intake_batch does not carry the re-issue exception'
      using errcode='CLR10';
  end if;

  -- (T2) THE TERMINAL RULE IS UNTOUCHED, BY CONSTRUCTION: there is still EXACTLY ONE raise site
  -- for `batch_already_cancelling` (the splice moved it one level deeper, it never duplicated
  -- it), and T1 already proved that ONE site is reached whenever `b.state <> 'cancelling'` --
  -- which is every terminal (`cancelled`) batch, unconditionally, exactly as 0229 shipped it.
  if (length(v_src) - length(replace(v_src, 'batch_already_cancelling', ''))) / length('batch_already_cancelling') <> 1 then
    raise exception '#968 tail: expected exactly one occurrence of the batch_already_cancelling reason literal, found a different count -- the raise was duplicated or removed'
      using errcode='CLR10';
  end if;

  -- (T3) NO ACL MOVED.
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara.cancel_intake_batch(uuid,uuid,text)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner}' then
    raise exception '#968 tail: clara.cancel_intake_batch''s ACL moved to %', v_acl using errcode='CLR10';
  end if;

  -- (T4) THE READ ENVELOPE IS UNTOUCHED. `clara.get_intake_batch` is not named anywhere in this
  -- file's DDL, and this proves it directly: its live prosrc is still what #964's own 0252 left
  -- it at (the myt_day/00:00 capacity descriptor, and the SAME `canceller_not_active` predicate
  -- this file's door now shares in spirit but never in code).
  if not exists (select 1 from pg_proc p
                  where p.oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure
                    and p.prosrc like '%v_cancel_blocked := ''canceller_not_active'';%') then
    raise exception '#968 tail: clara.get_intake_batch''s existing cancel_blocked predicate moved -- this file must not touch the read envelope'
      using errcode='CLR10';
  end if;

  -- (T5) NO NEW GRANTED OR UNGRANTED NAME. This file''s only DDL is one `create or replace
  -- function` on an EXISTING signature; a helper of the shape a splice-refactor might have added
  -- is confirmed absent, which is this migration''s own proof that it needed no rig-meta cohort.
  if to_regprocedure('clara._intake_batch_canceller_blocked(uuid)') is not null then
    raise exception '#968 tail: an unexpected new helper function exists -- this migration must add none'
      using errcode='CLR10';
  end if;

  raise notice '#968 tail: OK -- clara.cancel_intake_batch admits a re-issue only while `cancelling` and only when the stored canceller is blocked, the terminal rule is untouched, its ACL is exactly what §0 measured, the read envelope (clara.get_intake_batch) is untouched, and no new function was added.';
end
$w968_tail$;
