# Gate G1 — the universal wake-execution engine: ANNEXES

> Companion to `g1-wake-engine-design.md`. **A** the registry table + writer · **B** the exact
> trigger/CHECK deltas · **C** the consumer's shape (pseudocode against the real primitives) · **D**
> the battery in full · **E** the `clara_wake_bank_login` pool-wiring recipe (owns
> `bank-agency-annexes-3-build.md:58`'s M4 seam) · **F** the receipt-table observation (non-blocking).

---

## Annex A · `clara.wake_engine_sources` and its writer

```sql
-- The per-source registry (design §1.2). Estate CONFIGURATION, not client data — never touched
-- by a Wave-G client-data reset (design §5).
create table clara.wake_engine_sources (
  source_key      text primary key,
  carrier         text not null check (carrier in ('wake_outbox','direct_queue')),
  event_type      text,             -- required iff carrier='wake_outbox'
  task_kind       text not null,    -- 'wake' for wake_outbox sources; the direct kind otherwise
  wake_kind       text not null,    -- must be a live ck_wake_credentials_kind_0011 member
  workflow_export text not null,    -- e.g. 'bankAgent.v1' — informational; enforced only by the
                                     -- consumer's own registry lookup at dispatch, never a DB FK
                                     -- (the WDK registry lives in TypeScript, not the catalog)
  login_pool      text not null,
  max_attempts    int not null default 5 check (max_attempts > 0),
  enabled         boolean not null default false,
  disabled_reason text,
  enabled_by      uuid references clara.users(id),
  enabled_at      timestamptz,
  disabled_by     uuid references clara.users(id),
  disabled_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint ck_wes_event_type_carrier check (
    (carrier = 'wake_outbox' and event_type is not null)
    or (carrier = 'direct_queue' and event_type is null)),
  constraint ck_wes_enabled_audit check (
    (enabled = true and enabled_by is not null and enabled_at is not null)
    or (enabled = false))
);
alter table clara.wake_engine_sources enable row level security;
alter table clara.wake_engine_sources force row level security;
-- Owner-floor writer only; every role reads (this is estate configuration, not a secret).
create policy p_wes_owner on clara.wake_engine_sources
  for all to clara_fn_owner using (true) with check (true);
create policy p_wes_read on clara.wake_engine_sources
  for select to clara_authenticated using (true);
grant select on clara.wake_engine_sources to clara_authenticated, clara_runtime;
comment on table clara.wake_engine_sources is
  'Gate G1: the wake-execution engine''s per-source registry. Estate configuration (owner-floor
   write, every human read); never DML''d by a Wave-G client-data reset. carrier=wake_outbox rows
   ride kind=''wake'' (the held projection); carrier=direct_queue rows ride their own already-live
   agent_tasks.kind (today, only close_prep). A row with enabled=false is registered but never
   claimed — its held/queued rows accumulate visibly, counted by wakeEngineHealth, never silently.';

-- The writer — owner floor (an estate-wide switch, not a per-client one; mirrors
-- set_bank_agency_hold's shape at the next floor up, 0121:4484-4520).
create or replace function clara.set_wake_source_enabled(p_source_key text, p_on boolean,
    p_reason text, p_op_key text) returns jsonb
 language plpgsql security definer set search_path to 'clara', 'pg_temp'
as $function$
declare c record; v_dedupe jsonb; v_reason text;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists(select 1 from clara.wake_engine_sources where source_key = p_source_key) then
    raise exception 'unknown wake-engine source %', p_source_key using errcode='CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required' using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_wake_source_enabled', p_op_key,
    clara._hash(jsonb_build_object('source', p_source_key, 'on', p_on, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  update clara.wake_engine_sources set
      enabled = coalesce(p_on,false),
      enabled_by = case when coalesce(p_on,false) then c.actor else enabled_by end,
      enabled_at = case when coalesce(p_on,false) then now() else enabled_at end,
      disabled_by = case when not coalesce(p_on,false) then c.actor else disabled_by end,
      disabled_at = case when not coalesce(p_on,false) then now() else disabled_at end,
      disabled_reason = case when not coalesce(p_on,false) then v_reason else disabled_reason end
    where source_key = p_source_key;

  perform clara._audit(c.firm, c.actor, null, null, 'set_wake_source_enabled', null,
    jsonb_build_object('source', p_source_key, 'on', coalesce(p_on,false), 'reason', v_reason));
  return clara._finish_op(c.firm, 'set_wake_source_enabled', p_op_key,
    jsonb_build_object('source_key', p_source_key, 'on', coalesce(p_on,false)));
end $function$;
revoke all on function clara.set_wake_source_enabled(text,boolean,text,text) from public;
grant execute on function clara.set_wake_source_enabled(text,boolean,text,text) to clara_authenticated;
```

**Note on floor.** `owner` rather than `bookkeeper` (bank_agency_holds' floor) because this switch
is estate-wide (every firm's bank_agent work, not one client's) — the same reasoning that makes
`GOVERNED_EGRESS_PURPOSES` and the taxonomy tables owner/operator-scoped rather than
bookkeeper-writable. If a future item argues a narrower floor is right for a specific source, that
is a per-source escalation, not a reason to widen this table's own floor.

## Annex B · The exact trigger/CHECK deltas

**`_tf_agent_task_update`, full replacement body** (only the `wake` `when` arm changes; every other
arm is copied byte-identical from the live `0120:1503-1550` text, proven by the migration's own
tail differential — annexes never restate what a tail assertion already proves mechanically):

```sql
create or replace function clara._tf_agent_task_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'agent_tasks are not deleted' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id
     or new.client_id is distinct from old.client_id or new.kind<>old.kind
     or new.origin_intent_id is distinct from old.origin_intent_id
     or new.session_id is distinct from old.session_id
     or new.turn_key is distinct from old.turn_key
     or new.created_by is distinct from old.created_by
     or new.model_snapshot is distinct from old.model_snapshot
     or new.created_at<>old.created_at then
    raise exception 'agent_task identity/config is immutable' using errcode='CLR08';
  end if;
  if new.status<>old.status then
    v_ok:=case
      when old.kind='chat_turn' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('awaiting_input','cancel_requested','completed','failed')
        when 'awaiting_input' then new.status in ('running','cancel_requested','expired','cancelled')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      -- GATE G1 DELTA (design §1.3): the held-only rule that made a wake task unexecutable is
      -- widened to the SAME shape autodraft/close_prep already use, substituting 'held' for
      -- 'queued' as the birth state (drain.mjs still births every wake task 'held' — the insert
      -- arm is UNCHANGED). held->cancelled stays legal (an operator cancel of a never-claimed
      -- wake). New: held->running (the engine's claim), running->{completed,failed,
      -- cancel_requested} (the workflow's own settlement or an operator cancel mid-run),
      -- cancel_requested->{completed,failed,cancelled} (mirrors reconcileTasks §C's own
      -- running->cancel_requested->cancelled repair-txn shape for a cancelled engine run).
      when old.kind='wake' then case old.status
        when 'held' then new.status in ('running','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='autodraft' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='close_prep' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      else false end;
    if not v_ok then
      raise exception 'illegal agent_task transition % -> % (kind %)',old.status,new.status,old.kind
        using errcode='CLR13';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $function$;
```

**`_tf_wakes_outbox_update`, full replacement body** (delta: one new leg, `held→settled`):

```sql
create or replace function clara._tf_wakes_outbox_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wakes_outbox rows are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['status']) is distinct from (to_jsonb(old) - array['status']) then
    raise exception 'only status may change on a wakes_outbox row' using errcode = 'CLR08';
  end if;
  -- GATE G1 DELTA: held->settled joins held->cancelled as the two lawful exits from 'held'.
  -- 'settled' covers BOTH a completed and a failed wake task -- wakes_outbox is a coarse
  -- firm-visible notice projection (design §1.3), not a work-item-grained state machine, so it
  -- never needed running/completed/failed granularity of its own.
  if new.status <> old.status
     and not (old.status = 'held' and new.status in ('cancelled','settled')) then
    raise exception 'illegal wakes_outbox transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

alter table clara.wakes_outbox drop constraint wakes_outbox_status_check;  -- exact live name TBD at rig replay; the tail census reads pg_constraint and re-derives the name if this literal drifts
alter table clara.wakes_outbox add constraint wakes_outbox_status_check
  check (status in ('held','cancelled','settled'));
```

**The settlement verb:**

```sql
create or replace function clara._settle_wake_task(p_task uuid, p_outcome text, p_error_code text)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_intent uuid;
begin
  if p_outcome not in ('completed','failed','cancelled') then
    raise exception 'unknown wake settlement outcome %', p_outcome using errcode='CLR10';
  end if;
  update clara.agent_tasks set status = p_outcome, error_code = p_error_code
    where id = p_task and kind = 'wake'
    returning origin_intent_id into v_intent;
  if v_intent is null then
    raise exception 'no wake task % to settle', p_task using errcode='CLR10';
  end if;
  -- Idempotent by construction: a re-settle attempt (crash-recovery replay) finds the outbox
  -- row already 'settled'/'cancelled' and this UPDATE affects zero rows -- never a raise.
  update clara.wakes_outbox set status = 'settled' where intent_id = v_intent and status = 'held';
end $$;
revoke all on function clara._settle_wake_task(uuid,text,text) from public;
```

**`mint_wake_credential`'s new `close_prep` arm** (the one gate arm missing, survey §4):

```sql
  elsif p_wake_kind='close_prep' then
    -- Gate G1 §2: the clocked lane's own shape, byte-identical to bank_agent's (0126:655-663) --
    -- a firm-congruent active client is required and on_behalf_of is FORBIDDEN (no directing
    -- human on the clocked lane; the NULL is structural, never inferred, law 68).
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'close_prep wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
```
Inserted as a new `elsif` arm in `mint_wake_credential`'s per-kind chain, immediately after the
`bank_agent` arm (`0126:655-663`) and before the `elsif p_wake_kind='filing'` arm (`:664`) — the
early kind-membership gate (`0126:624`) already admits `'close_prep'`, so no change is needed there.

## Annex C · The consumer's shape

```
WAKE_ENGINE_CONSUMER = 'wake_engine'

startWakeEngineLoop(deps):
  # byte-identical shape to startAutodraftLoop (autodraft.mjs:468-526) — see design §1.2.
  loop with reconnect backoff (500ms..5000ms doubling):
    connect(); setRuntimeRole(); acquireLeaderLock(WAKE_ENGINE_CONSUMER); listen('clara_events')
    inner loop:
      runWakeEngineCycle(client, deps)
      waitForNudge(...) unless capped

runWakeEngineCycle(client, deps):
  sources = SELECT * FROM wake_engine_sources WHERE enabled   # re-read every cycle, never cached
  work = discoverWork(client, {consumer: WAKE_ENGINE_CONSUMER})   # relay.mjs, UNCHANGED
  for each firm in work (round-robin, fairness mirrors autodraft's runAutodraftCycle):
    processFirm(client, firm, sources, deps)

processFirm(client, firm, sources, deps):
  # -- carrier 1: wake_outbox sources --
  rows = SELECT at.id, at.origin_intent_id, de.event_type, wi.event_seq
           FROM agent_tasks at
           JOIN wake_intents wi ON wi.id = at.origin_intent_id
           JOIN domain_events de ON de.id = wi.event_id
          WHERE at.kind='wake' AND at.status='held' AND de.firm_id=$firm
            AND wi.event_seq > $checkpoint
          ORDER BY wi.event_seq LIMIT batchSize
          FOR UPDATE SKIP LOCKED   # belt-and-braces, mirroring drain.mjs:61 — see design §1.2a
  for row in rows:
    source = sources[row.event_type]   # keyed by event_type for carrier=wake_outbox
    if source is None: continue        # unregistered event_type -- checkpoint-only advance, no dead-letter (nothing is wrong; the source simply has not shipped its registry row yet)
    try:
      begin txn
        credential = mint_wake_credential(source.wake_kind, firm, null, '15 min', row.client_id)
        UPDATE agent_tasks SET status='running' WHERE id=row.id   # legal per Annex B's delta
        writeCheckpoint(consumer=WAKE_ENGINE_CONSUMER, firm, seq=row.event_seq)
      commit
      enqueue(source.workflow_export, row.id, credential)   # same DI shape as autodraft.mjs's enqueue(taskId)
    except err:
      rollback
      attempts = recordDeadLetter(relay_dead_letters, consumer=WAKE_ENGINE_CONSUMER, event_id=<via wi.event_id>, reason=err)
      if attempts >= source.max_attempts:
        checkpointOnly(seq=row.event_seq)   # advance past the poison, mirrors autodraft.mjs:326-330
      else:
        break firm's loop this cycle (retry next cycle, mirrors autodraft.mjs:332-333)

  # -- carrier 2: direct_queue sources (today: close_prep only) --
  for source in sources where carrier='direct_queue':
    rows = SELECT id FROM agent_tasks WHERE kind=source.task_kind AND status='queued'
             AND firm_id=$firm ORDER BY created_at LIMIT batchSize FOR UPDATE SKIP LOCKED
    for row in rows:
      try:
        begin txn
          credential = mint_wake_credential(source.wake_kind, firm, null, '15 min', row.client_id)
          UPDATE agent_tasks SET status='running' WHERE id=row.id   # already-legal autodraft-shaped transition, unchanged
        commit
        enqueue(source.workflow_export, row.id, credential)
      except err:
        rollback
        attempts = recordTaskDeadLetter(wake_engine_task_dead_letters, consumer=WAKE_ENGINE_CONSUMER, task_id=row.id, reason=err)
        if attempts >= source.max_attempts:
          UPDATE agent_tasks SET status='failed', error_code='internal' WHERE id=row.id  # poison-skip's terminal, mirrors autodraft's dead-letter-and-skip but settles the TASK since there is no checkpoint to advance past for a direct-queue row
        # else: leave 'queued' -- picked up again next cycle, natural retry

wakeEngineHealth(client):
  # mirrors autodraftHealth (autodraft.mjs:437-460) shape, extended with a per-source breakdown.
  return {
    consumer: 'wake_engine',
    lag: <sum over enabled wake_outbox sources of (latest event_seq - checkpoint), per firm>,
    pendingDeadLetters: <relay_dead_letters WHERE consumer='wake_engine' AND status='pending'>
                         + <wake_engine_task_dead_letters WHERE consumer='wake_engine' AND status='pending'>,
    firmsTracked: <relay_checkpoints WHERE consumer='wake_engine'>,
    heldForDisabledSource: <count of held/queued rows whose event_type/kind has no ENABLED registry row>,
    perSourceCounts: { <source_key>: {claimed, dispatched, failed, deadLettered} per cycle, process-local counters, reset on restart -- observability, not correctness state, exactly the deferredWithdrawalState precedent (autodraft.mjs:198-226) }
  }
```

**Why the two carriers are ONE function (`processFirm`), not two consumers.** Splitting them into
separate spine consumers would mean two advisory locks, two checkpoints tables' worth of rows, two
`/ready` signals for what the owner ruled to be ONE engine. Keeping them as two sections of one
function, sharing one lock and one health surface, is what makes "kill the engine → all sources
stall together, loudly" (design §6) a true statement rather than a half-true one.

## Annex D · The battery (both-polarity)

| # | cell | setup | expected (GREEN) | inverted twin (the RED-first cell) |
|---|---|---|---|---|
| D1 | held→running is the ONLY new legal claim leg | a fresh held wake row, no prior claim | `UPDATE ... SET status='running'` succeeds | `UPDATE ... SET status='completed'` directly from `held` (skipping `running`) raises CLR13 — the matrix never allows a direct held→completed jump |
| D2 | running→cancel_requested→cancelled is reachable | a running wake task, operator cancel | both transitions succeed in sequence | `running→cancelled` directly (skipping `cancel_requested`) raises CLR13 |
| D3 | `wakes_outbox` stays synchronized | settle a wake task `completed` | the paired `wakes_outbox` row reads `'settled'` in the SAME transaction | settling twice (replay) is a no-op, never a raise (idempotent re-settle) |
| D4 | a disabled source's held rows are never claimed | register `bank_agent` with `enabled=false`, seed a held `bank.agent_due` row | the row stays `held` across N engine cycles, counted in `heldForDisabledSource` | enabling the source claims it on the VERY NEXT cycle — no restart required (the registry is re-read every cycle, never cached, per Annex C) |
| D5 | **single-engine blast-radius drill** (design §6) | kill the wake-engine process mid-cycle | `wakeEngineHealth.lag` climbs for every enabled source; `leader.mjs`'s own loop and `autodraft.mjs`'s own loop are unaffected (independent advisory locks); on restart the checkpoint resumes with no double-dispatch | **RED-first**: an engine death that does not surface in `/ready` as a WARN within one poll interval is a defect — assert `wakeEngineHealth` is wired into the SAME `/ready` aggregation `autodraftHealth` already is |
| D6 | **per-source isolation drill** (design §6) | a synthetic source whose workflow always throws, registered alongside bank_agent and close_prep in the same batch | the synthetic source's items dead-letter and poison-skip at `max_attempts`; bank_agent's and close_prep's items in the SAME cycle dispatch and settle normally | **RED-first**: without the per-item try/catch (Annex C's `processFirm` inner loop), a poisoned synthetic-source row's exception propagating UNCAUGHT would abort the whole `runWakeEngineCycle` and starve bank_agent/close_prep too — assert this cannot happen by fault-injecting the throw and confirming the OTHER sources' counters still advance |
| D7 | reconciler crash-recovery is generic across kinds | a wake task stuck `running` with a `workflow_run_id` whose WDK engine run is independently `completed` | `reconcileWakeEngineTasks` settles it via unmodified `terminalFor` + `_settle_wake_task`, exactly as `reconcileAutoDraftTasks` does for `kind='autodraft'` | a `close_prep` task in the identical stuck state settles through the SAME belt, same cycle — never a second, close_prep-specific reconciler |
| D8 | the two dead-letter homes stay each in their own lane | a poisoned `wake_outbox`-carrier row and a poisoned `direct_queue`-carrier row in the same cycle | the first lands in `relay_dead_letters`, the second in `wake_engine_task_dead_letters`, both keyed `consumer='wake_engine'` | a `direct_queue` row is NEVER written to `relay_dead_letters` (it has no `event_id` to key on — the FK would refuse it) — assert the attempt structurally cannot target the wrong table |
| D9 | pre-existing held rows are not retroactively touched | seed a held wake row BEFORE this migration applies (rig replay: apply through 0-1, seed, then apply this gate's file) | the row's count and status are UNCHANGED immediately after the migration — it becomes claimable only once its source is registered+enabled | the SAME row, once its source registers, is claimed on the engine's next cycle exactly like a freshly-minted one — no special "backfill" code path exists or is needed |
| D10 | the reconciler herd interaction (mirroring bank-agency Annex C) | a clocked bank_agent run and a chat-turn-triggered bank verb call land on the same client concurrently | both QUEUE on the client's advisory rung (`203005004`, the delegate's own order) rather than racing or deadlocking — two lane slots, not a race | **contract-blind cell**: this is inherited from the delegate's own lock order (bank-agency Annex C), not new to this design — the wake engine adds no lock of its own, exactly as the agent core it dispatches to already does not |

## Annex E · `clara_wake_bank_login` — the nine-step pool-wiring recipe

Owns `bank-agency-annexes-3-build.md:58`'s M4 seam, explicitly "GATED ON G1." Mirrors
`pools.mjs`'s existing three-login shape (`clara_runtime_login` / `clara_agent_read_login` /
`clara_wake_write_login`), current line anchors per research-runtime's direct read:

1. Pool-size const, mirroring `WRITE_POOL_MAX` (`pools.mjs:54`): `export const BANK_POOL_MAX =
   Number(process.env.CLARA_BANK_POOL_MAX || 2);`
2. `LOGIN_NAMES` (`pools.mjs:58`) gains `bank: "clara_wake_bank_login"`.
3. `dsnVarFor()` (`pools.mjs:77-81`) gains `if (which === "bank") return
   "CLARA_BANK_DATABASE_URL";`.
4. `poolMaxFor()` (`pools.mjs:83-87`) gains `if (which === "bank") return BANK_POOL_MAX;`.
5. `assertProductionPoolConfig()`'s fail-closed array (`pools.mjs:101`) gains `"bank"` —
   **REQUIRED**, not optional: omitting it would let the wake engine boot in production without a
   dedicated bank login and silently misroute onto a shared identity.
6. A lazy singleton pool getter, mirroring `getWritePool()` (`pools.mjs:171-177`).
7. A scoped-transaction helper, mirroring `withWriteWakeScoped` (`pools.mjs:411-438`) — the
   engine's `mint_wake_credential`+claim transaction runs under `clara_wake_bank`'s own connection
   for a `bank_agent`-sourced dispatch, never the shared runtime pool (least-privilege: the
   engine's OWN claim/checkpoint bookkeeping runs as `clara_runtime`; the actual bank-scoped work
   the dispatched workflow does runs as `clara_wake_bank`, via this pool).
8. DB side: `clara_wake_bank_login` created `NOLOGIN` in this gate's own migration (or F-A3's
   follow-up, whichever lands the row); granted `LOGIN` + password + the DSN secret at the operator
   ceremony — must be present before the image boots or the world fails closed, matching step 5's
   guard.
9. Fly secret staged via `fly secrets deploy` (never a plain restart — the standing ceremony
   lesson), new env var `CLARA_BANK_DATABASE_URL` following the `CLARA_WRITE_DATABASE_URL` naming
   precedent, verified with a PROCESS read (`printenv` in the VM) after deploy, never `fly secrets
   list`.

**Confirmed (research-runtime, direct grep): `clara_wake_bank_login` appears nowhere in
`pools.mjs` today** — every one of the nine steps above is new work, owned here.

## Annex F · The receipt-table observation (non-blocking, named honestly)

**Not this gate's to resolve, recorded so it is not silently missed.** F-A4's `close-key-1-design.md
§3.8` built `clara.agent_act_receipts` as a DELIBERATELY GENERIC judgement-receipt carrier "so
F-A5/F-A6/F-A8 adopt it rather than each minting their own." F-A3's own `bank_agent_receipts`
(`0121`, shipped one migration AFTER `agent_act_receipts` existed) did NOT adopt it — it has a
genuinely different key shape (`outcome`-scoped uniqueness over `(act_kind, subject_id)`, a
`retry_after` parking column bank-agency's own clock reads directly) that `agent_act_receipts`'
shape does not carry. **This is a DOMAIN-RECEIPT question, orthogonal to this gate's ENGINE-LEDGER
question.** The wake engine's own settlement bookkeeping (`agent_tasks.status`,
`wakes_outbox.status`, the two dead-letter tables) is a separate, smaller fact than "what did the
agent judge and why" — the engine only needs to know a task REACHED a terminal state, never what
the DOMAIN receipt says about it. This design does not require `bank_agent_receipts` and
`agent_act_receipts` to converge, and does not recommend forcing it — that is a PM-level
observation for a future debt sweep, not a G1 blocker.
