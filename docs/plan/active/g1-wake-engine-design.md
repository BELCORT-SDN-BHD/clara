# Gate G1 — the universal wake-execution engine: THE DESIGN

> Companion to `g1-wake-engine-survey.md` (facts, as-found, at 0127) and `g1-wake-engine-annexes.md`
> (exact DDL, function bodies, consumer pseudocode, battery cells in full). Builds **mechanism (b)**,
> ruled by the owner 2026-08-25 over the survey's §6 tension with close-key-1's own TA-P11 obligation
> — read that section before this one; it is the charter this design executes, not relitigates.
>
> **One line of scope.** The engine is a RUNTIME CONCEPT — one consumer loop, one registry, one
> settlement path — layered on TWO already-existing DB carrier shapes (`kind='wake'`'s held
> projection; `kind='close_prep'`'s already-full autodraft-shaped lifecycle). It mints no new
> `agent_tasks.kind`. It does not touch the producer half (routing, drain) or the generic
> reconciliation primitives (`terminalFor`, the `belt()` wrapper) — both already work and both are
> reused unmodified.

---

## 1 · The engine's shape

### 1.1 The clock half — who mints held-wake rows, per source

**Unchanged, and out of this gate's scope by design.** The producer chain — due-predicate belt →
domain event → router → `wake_intents` → drain.mjs → held `agent_tasks(kind='wake')` +
`wakes_outbox` — is generic estate infrastructure, proven and untouched since `0005`/`0006`
(survey §2, §4). **What this gate DOES own is the shape every future source's due-predicate must
follow**, so the clock half stays "rows-only" too, not just the consumer half:

- A new source ships its own `clara.<source>_run_due(p_client uuid) returns jsonb` — the
  `depreciation_run_due`/`adjustment_run_due` contract (survey §"the `*_run_due` contract"):
  admission-gate first, then `{"due":false,"reason":"<code>"}` or `{"due":true,...}`. This is
  DOMAIN LOGIC (what "due" means differs genuinely per source) and is never generic — every source
  pays for its own predicate regardless of mechanism (a) or (b).
- A new source ships its own event type (e.g. `bank.agent_due`, already named in
  `bank-agency-design.md:326`) and its own leader-guarded cadence gate — one more `*Due(lastRunMs,
  nowMs)` pure predicate beside the six in `leader.mjs:75-132`, and one more call inside
  `startLeaderLoop`'s cycle body appending the event via `clara._append_event` when due. This is a
  ~10-line addition per source, matching the SHAPE every one of the six existing belts already
  uses — not a new abstraction, and not something the engine can absorb into a registry row,
  because "what triggers a domain event" is the one place per-source logic is irreducible.
- **Once the domain event exists, everything downstream is already generic** (routing, drain,
  `wake_intents`, held `agent_tasks(kind='wake')`) — a new source adds ZERO code past its own event
  emission. This is where "rows-only, zero per-item surgery" actually bites: not at the clock, but
  at the consumer (§1.2) and the matrix (§1.3), which are paid ONCE, for every source, forever.

### 1.2 The consumer — a FOURTH registered spine consumer

**`packages/runtime/lib/wake-engine.mjs` (new file), mirroring `autodraft.mjs` line-for-line**
(survey §3): own consumer name `WAKE_ENGINE_CONSUMER = 'wake_engine'`, own advisory lock via
`acquireLeaderLock(client, WAKE_ENGINE_CONSUMER)`, own `(consumer, firm_id)` checkpoint in
`clara.relay_checkpoints` (zero schema change — a new `consumer` string is the entire registration
cost), own reconnect-backoff loop (`startWakeEngineLoop`, byte-identical shape to
`startAutodraftLoop`: `RECONNECT_BASE_MS=500`/`RECONNECT_MAX_MS=5000` doubling), own `/ready` WARN
health function (`wakeEngineHealth`, mirroring `autodraftHealth`'s lag/pending-dead-letters/
firms-tracked shape).

**Discovery closes over exactly TWO carrier shapes — a closed world of two, argued in survey §6,
never a third:**

1. **`wake_outbox` carrier** (bank_agent, filing, every future source): walk
   `agent_tasks(kind='wake', status='held') ⋈ wake_intents (on origin_intent_id) ⋈ domain_events
   (on event_id)` per firm, ordered by `wake_intents.event_seq` (the same seq space
   `domain_events.seq` already occupies — no new sequence, no new column), `FOR UPDATE SKIP LOCKED`
   on the batch, mirroring `drain.mjs`'s own defensive precedent (§1.2a below explains why SKIP
   LOCKED is still right under a single-leader consumer). The checkpoint cursor is
   `(WAKE_ENGINE_CONSUMER, firm_id) → last_seq`, read/written through `packages/runtime/lib/relay.mjs`'s existing
   `discoverWork`/`writeCheckpoint` UNCHANGED (survey §3).
2. **`direct_queue` carrier** (close_prep today; any future kind minted on the autodraft precedent):
   walk `agent_tasks(kind='close_prep', status='queued')` per firm, `FOR UPDATE SKIP LOCKED`,
   ordered by `created_at`. No `wake_intents` join — there is no domain event backing this shape.

For each held/queued row, the consumer reads `domain_events.event_type` (carrier 1) or the literal
`kind` (carrier 2) and looks it up in the **NEW registry table**, `clara.wake_engine_sources`
(annexes §A), which is the "rows-only" seam every future source registers through:

```
source_key    text primary key         -- 'bank_agent' | 'close_prep' | 'filing' | ...
carrier       text not null check (carrier in ('wake_outbox','direct_queue'))
event_type    text                     -- required iff carrier='wake_outbox'; must match domain_events.event_type
task_kind     text not null            -- 'wake' for wake_outbox sources; the direct kind otherwise
wake_kind     text not null            -- the wake_credentials.wake_kind this source mints
workflow_export text not null          -- e.g. 'bankAgent.v1'
login_pool    text not null            -- which pools.mjs login this source's workflow runs under
max_attempts  int not null default 5
enabled       boolean not null default false   -- the per-source kill switch, §5
...audit columns, annexes §A
```

**a) Why `FOR UPDATE SKIP LOCKED` under a single-leader consumer.** research-runtime's own rule,
folded from the estate's actual usage: SKIP LOCKED is for genuinely multi-worker queues (the render
job claim, `0081:127`, or drain.mjs's own batch claim, `drain.mjs:61`); a single-leader-per-consumer
advisory lock is for checkpoint cursors (router, matcher, autodraft). The wake engine IS
single-leader (one advisory lock, one process). But `drain.mjs` — itself running INSIDE the same
single-leader `leader.mjs` loop — STILL takes `FOR UPDATE SKIP LOCKED` on its own batch claim
(`drain.mjs:61`), as defense-in-depth against a leadership-transition double-pick (a stale/exiting
leader process that has not yet released its advisory lock while a new one acquires it — the window
Postgres advisory locks do not close instantaneously across a network partition or crash). The wake
engine mirrors THAT precedent exactly: the advisory lock is the primary exclusion; `SKIP LOCKED` on
the row claim is belt-and-braces, not the exclusion mechanism itself.

**b) Dispatch.** For an ENABLED source: transition the claimed row `held→running` (carrier 1) or
`queued→running` (carrier 2, unchanged — already legal), then `enqueue(workflow_export, taskId)` —
the identical dependency-injected `enqueue` shape `autodraft.mjs` already uses (`autodraft.mjs:297`,
`:311`), so the WDK engine takes over from there exactly as it does for every other kind. **The
consumer mints no credential at any point in this transaction, or ever** — `enqueue` receives exactly
those two plain identifiers, the named `workflow_export` and the claimed row's `taskId`, never a
secret. Plaintext wake credentials must never transit WDK step inputs, returns, or workflow state,
because step IO is durably persisted (`docs/plan/completed/slice4-durable-runtime-contract.md:270`'s
own LAW); a consumer-side mint would put the secret on exactly that path, on the way into `enqueue`.
The mint happens downstream instead, inside the dispatched workflow's own first `"use step"` attempt
(§2): the step itself calls `mint_wake_credential(wake_kind, firm, on_behalf_of=NULL, ttl=default
15min, client)` and consumes the returned secret only within that one step's local, non-persisted
execution — never an input to the step, never a value the step returns.

**c) A DISABLED source's held rows are left held, untouched, LOUDLY.** The consumer's health
function counts them (`heldForDisabledSource` in `wakeEngineHealth`'s payload) so a disabled source
never silently accumulates an invisible backlog — §6's battery cell drills this.

**d) The dispatched workflow's own FIRST durable step MUST CAS on its own task's status before
doing anything consequential** (round-4 opus/Codex review, #5/#8 — a NAMED obligation on
whichever PR builds the real bankAgent.v1/closePrep.v1 body, since no wake-kind workflow body
ships in THIS gate to enforce it in). The gap: a cancel can land between `enqueue()`'s own commit
and the dispatched run's first bind of `workflow_run_id` back onto the task row — while
`workflow_run_id` is still NULL, `reconciler.mjs`'s own cancel-branch (section B) cannot tell
"never started" from "started but has not bound back yet," and treats a null run id as trivially
confirmed-aborted, settling the task 'cancelled' immediately (M5's own fix closes only the
BOUND-run case). If the run genuinely IS live, it can keep acting — minting a credential, calling
a tool — under books that already say it stopped. Closing this needs no reconciler change and no
2PC: the workflow's own first `"use step"` attempt (the SAME step §2 already requires to mint the
wake credential) must re-read `agent_tasks.status` for its own `taskId` FIRST, and refuse to
proceed (a clean no-op exit, never an error) unless status is still `'running'` — off
`cancel_requested`/`cancelled`/`failed`, self-abort without minting anything or touching a tool.
This is the SAME "duplicate start self-aborts" idiom `reconciler-wake.mjs`'s own header comment
already invokes for crash-recovery re-enqueue (§4 below) — one guard closes BOTH #8's
duplicate-start (a re-enqueued run finding the task already bound/settled) and #5's
unknown-abort (a run finding its own task cancelled out from under it). Acceptance for the PR
that ships this: a cell proving a post-settle, unbound run's first step self-aborts at exactly
this check — `packages/runtime/lib/wake-engine.mjs`'s own module header carries this same
obligation, cited there as the reason a `workflow_run_id`-null cancel is a documented, understood
residual risk in G1 itself, not a silently-missed one.

### 1.3 The settlement path — the exact matrix delta

**`_tf_agent_task_update`'s `wake` arm, live tip `0120:1530`, today:**
```sql
when old.kind='wake' then old.status='held' and new.status='cancelled'
```
**Delta (D1-class recut, review law 1 — this is judgement logic: it decides which transitions are
legal):**
```sql
when old.kind='wake' then case old.status
  when 'held' then new.status in ('running','cancelled')
  when 'running' then new.status in ('completed','failed','cancel_requested')
  when 'cancel_requested' then new.status in ('completed','failed','cancelled')
  else false end
```
This is BYTE-IDENTICAL to the `autodraft`/`close_prep` arms' shape, substituting `held` for
`queued` as the birth state (wake tasks are still born held by drain.mjs — the insert arm does not
change, survey §4/§7 P-G1a). `held→cancelled` stays legal (an operator/human cancel of a
never-claimed wake, the ONLY transition that exists today, must keep working). The new legs:
`held→running` (the engine's claim), `running→{completed,failed,cancel_requested}` (the workflow's
own settlement, or an operator cancel mid-run), `cancel_requested→{completed,failed,cancelled}`
(mirroring `reconcileTasks` §C's own `running→cancel_requested→cancelled` repair-txn shape for the
generic `engine==='cancelled'` case, survey §3).

**`wakes_outbox`'s guard, `_tf_wakes_outbox_update` (`0006:571-584`), today admits only
`held→cancelled`.** Delta: one new leg, `held→settled` — a SINGLE coarse terminal value covering
BOTH `completed` and `failed` outcomes, because `wakes_outbox` is a notice projection, not a work
queue (survey §"wakes_outbox … full DDL"; research-bytes' grant read independently confirms it —
no role but `clara_runtime`/`clara_authenticated` can touch it, so it never needed
work-item-grained states). The settlement verb (below) writes BOTH tables' terminal state in ONE
transaction, so the two projections of the same fact can never diverge — curing the stranded-row
defect on BOTH projections research-bytes flagged, not only the one a workflow actually claims
against.

**The settlement verb, `clara._settle_wake_task(p_task uuid, p_outcome text, p_error_code text)`
returns void** (ungranted, called only by the reconciler belt below and by a workflow's own
terminal step, mirroring `settleTaskTerminal`'s existing shape): validates `p_outcome in
('completed','failed','cancelled')`, `UPDATE agent_tasks SET status=p_outcome, error_code=
p_error_code WHERE id=p_task AND kind='wake'` (the trigger enforces legality), then `UPDATE
wakes_outbox SET status='settled' WHERE intent_id=(SELECT origin_intent_id FROM agent_tasks WHERE
id=p_task) AND status='held'` — the second UPDATE is a no-op (not an error) if the outbox row is
already settled/cancelled, so a re-settle attempt (crash-recovery replay) is idempotent by
construction, never a raise.

**Reconciliation is a NEW, split-out belt from day one — `packages/runtime/lib/reconciler-wake.mjs`
(new file), `reconcileWakeEngineTasks`, mirroring `reconcileAutoDraftTasks`'s registration exactly**
(`belt("wake engine reconcile", () => reconcileWakeEngineTasks(client, deps))` added to
`runReconcilerSweep`'s belt list, `reconciler.mjs:625` area). It is generic over EVERY kind the
registry names (`kind = ANY(select task_kind from clara.wake_engine_sources)`), so `kind='wake'`
AND `kind='close_prep'` (and any future direct-queue kind) share ONE reconciler belt — never one
per source. It reuses `terminalFor` (`reconciler.mjs:53-69`) **unchanged** — the function is
already a pure `(taskStatus, engine) → {outcome, errorCode}|null` map with no `kind` parameter
(survey §7 P-G1c) — and calls `clara._settle_wake_task` (above) instead of `settleTaskTerminal`
directly, so the paired `wakes_outbox` write happens on every settlement path, including
crash-recovery. New file from the start, matching the estate's own module-size-budget precedent
(`reconciler-sst.mjs`/`-lint.mjs`/`-fa.mjs`/`-adjustments.mjs`/`-render.mjs` were all split out of
`reconciler.mjs` for the identical reason, `leader.mjs:25-29`'s comment).

## 2 · Credential flow

**Per-fire, short-TTL, never long-lived or cached — the estate's own existing pattern for every
kind except `proactive`** (the one one-shot kind, `consumed_at` set only there, per research-bytes'
confirmation). `mint_wake_credential(wake_kind, firm, on_behalf_of=NULL, ttl interval default
'00:15:00', client)` is called by the DISPATCHED WORKFLOW's own first `"use step"` attempt, never by
the consumer/engine (§1.2b) — plaintext wake credentials must never transit WDK step inputs, returns,
or workflow state, because step IO is durably persisted
(`docs/plan/completed/slice4-durable-runtime-contract.md:270`'s own LAW: credentials are minted
inside the step that uses them). One mint per execution attempt of that step, decoupled from the
claim transaction entirely — a retried attempt (crash recovery, a transient step failure) mints fresh
rather than trying to reuse a credential that may already have aged past its own TTL. This needs
**zero change to `mint_wake_credential`'s shape**: its per-kind
gating chain already has live arms for `bank_agent` (`0126:655-663`) and `filing` (`:664-670`); it
is MISSING an arm for `close_prep` only (survey §4's table — the gate arm falls through to the
`elsif p_client is not null` catch-all and refuses `'legacy wake kinds do not accept a client
binding'`). **This gate's migration adds exactly that one arm** — copy the `bank_agent` arm
verbatim, substituting the kind name (both require a firm-congruent active client, `on_behalf_of`
forbidden; the clocked lane has no directing human, law 68) — a pure extension, proven by the
existing tail-census pattern (`0126:2169-2180`'s own differential proof, mirrored).

**The allowlist enforcement seam is unchanged and needs no design at all** — `assert_wake_allowed`
(`0004:114-121`) is a plain `wake_fn_allowlist(wake_kind, function_name)` lookup, genuinely
rows-only since 0004 (survey §4, §7 P-G1d). A new source registers its verbs with INSERT statements
in its own migration, exactly as `bank_agent`'s 13 rows (`bank-agency-annexes-1-mechanics.md:22-59`)
and `filing`'s 6 rows (`0126:2074-2079`) already did.

**`close_prep`'s missing allowlist rows** (survey §4: zero rows for `wake_kind='close_prep'`
through 0127) are F-A4's own obligation, not this gate's — the engine only needs the ONE mint-gate
arm above to make `close_prep` credentials mintable at all; which verbs a `close_prep` credential
may call is close-key-1's own design's business (`close-key-1-design.md §3.1`'s thirteen wrappers),
unblocked the moment the mint gate exists.

## 3 · Failure isolation (the ruling's own named cost)

**Composed from three proven primitives (survey §5), never a new circuit-breaker abstraction:**

1. **Per-item dead-letter, two homes, one per carrier shape — a closed world of two, never
   per-item.** `wake_outbox`-carrier sources reuse `clara.relay_dead_letters`
   (`consumer='wake_engine', event_id, reason, attempt_count`) **unchanged** — every claimed row
   has a real `event_id` (via `wake_intents.event_id`), so the existing event-keyed table applies
   verbatim, `MAX_ATTEMPTS` default 5 (matching `autodraft.mjs`'s own constant), poison-skip
   advancing the checkpoint past the row exactly like `autodraft.mjs:326-330`. `direct_queue`-carrier
   sources (close_prep) have no domain event to key against, so they get ONE new, small,
   structurally-identical table, `clara.wake_engine_task_dead_letters(consumer, task_id, reason,
   attempt_count, status, resolved_at)` — same columns, same append-only `reason`, same
   `MAX_ATTEMPTS` poison-skip, keyed on `task_id` instead of `event_id` because that carrier has no
   event. Two homes total, forever — not one per source; a THIRD carrier shape would need its own,
   but none is proposed and TA-P11 argues against ever inventing one casually.
2. **The `belt()` catch-and-continue wrapper, one level up.** The consumer's per-batch claim loop
   wraps EACH claimed row's dispatch in its own try/catch (mirroring `processAutodraftFirm`'s
   per-event isolation, `autodraft.mjs:303-334`), so one poisoned row never aborts the rest of the
   batch. **One level up again**, the registered belt in `runReconcilerSweep` (§1.3) is ALREADY
   wrapped by `belt()` (`reconciler.mjs:551-564`) — a whole-belt throw costs this cycle's
   reconciliation and nothing else, named in `beltErrors[]`, never silent. **This is the ruling's
   named cost, priced exactly**: a single shared engine means a bug in the `filing` dispatch path
   COULD, absent this wrapper, starve `bank_agent`'s claim in the same batch — the wrapper is what
   makes that structurally unreachable, the same way it was retrofitted twice already for the
   chat_turn/autodraft cancel edges (survey §3, the two named zombies).
3. **A per-source kill switch — the FIRST of its kind in the estate** (survey §5: none exists
   today). `wake_engine_sources.enabled` (§1.2) is the door: a source with `enabled=false` is never
   claimed, its held/queued rows accumulate visibly (counted by `wakeEngineHealth`, never silently),
   and re-enabling it resumes exactly where the checkpoint/queue left off — no replay, no data loss,
   because nothing was ever claimed. This is deliberately an ENGINEERING/OPERATOR door, never a
   per-firm capability dial (TA-P1 C's "capabilities are default-on" stands untouched — this door
   does not gate whether a FIRM may use bank_agent; it gates whether the ENGINE currently attempts
   ANY firm's bank_agent work at all, an infrastructure fact, not a product capability). Its writer,
   `clara.set_wake_source_enabled(p_source_key text, p_on boolean, p_reason text, p_op_key text)`,
   mirrors `set_bank_agency_hold`'s exact shape (bookkeeper+ floor — actually **owner floor**, since
   this is an estate-wide switch, not a per-client one; annexes §A) — audited, idempotent, an UPSERT
   on the registry row's `enabled`/`disabled_reason`/`disabled_by`/`disabled_at` columns.
   **A source needing an external-API cooldown** (none of the four named sources do — bank_agent,
   close_prep and filing are all internal DB+LLM calls, not flaky third-party APIs like Fly's render
   dispatch) gets its own DB-owned `*_dispatch_begin`-style cooldown verb when and if it needs one
   (`render_dispatch_begin`'s exact precedent, survey §5) — never a generic breaker built ahead of
   the need.

**Observability — the estate's typed-counter shape, never a spend meter (law 76 corrected, survey
§5).** `wakeEngineHealth(client)` returns `{consumer:'wake_engine', lag, pendingDeadLetters,
firmsTracked, heldForDisabledSource, perSourceCounts: {source_key: {claimed, dispatched, failed,
deadLettered}}}` — the SAME shape `autodraftHealth` already returns, extended with the one thing no
existing consumer needs: a per-source breakdown, because "one engine, many sources" is exactly the
new fact this gate introduces. **Meter, never cap** — nothing in this design refuses a call for
cost reasons; `enabled=false` is an operator's engineering decision, never derived from spend.

## 4 · The migration shape and the runtime workflow shape

**§0 prestate — the superseded-body law, applied to the exact live tip.** The migration pins
`_tf_agent_task_update`'s LIVE prosrc sha256 before touching it — `0120:1503-1550`'s text is what
this design read; the migration re-reads `pg_proc` at apply time and aborts CLR10 if the sha has
drifted (the estate's own `f_a4_pr_1b`-style prestate block, `0120:137-149`, is the template to
copy verbatim, substituting `_tf_agent_task_update`'s current sha). The SAME applies to
`_tf_wakes_outbox_update` and `mint_wake_credential` — three live judgement-logic bodies pinned,
recut, and tail-proven, never assumed.

**Tail proofs, including the stranded-row cure.** The migration's own tail must positively read
(never derive) that:
- the `wake` arm's new legs are present (`position('running' in v_src)`-style differential, the
  `0120` tail's own idiom);
- `wakes_outbox`'s CHECK admits `'settled'`;
- **every EXISTING held row today is given a lawful disposition, not left orphaned by the new
  matrix.** A held wake row born before this migration has no `event_type` match in the (still
  empty, until §5's rollout) registry, so it is NOT auto-claimed by the newly-live consumer on its
  first cycle — it stays held, visible, until either (a) an operator explicitly cancels it (the
  pre-existing `held→cancelled` leg, unaffected) or (b) its source is registered and enabled, at
  which point the consumer claims it on its next cycle exactly like any other held row, oldest
  first by `event_seq`. **The cure is not "retroactively force a disposition" — it is "make the
  disposition finally reachable,"** and the tail proves the count of currently-held rows is
  unchanged by the migration itself (a pure DDL/trigger change, no `UPDATE agent_tasks` statement
  anywhere in this file).

**The runtime workflow shape — new frozen exports, registry repoints, never edits (constraint 9).**
`packages/runtime/lib/wake-engine.mjs` and `packages/runtime/lib/reconciler-wake.mjs` are new
FILES, not new workflow VERSIONS — the constraint-9 discipline binds `bankAgent.v1`, `closePrep.v1`,
`filingRuntime.v1` (whatever names their own items ship) as the frozen WDK exports the engine
dispatches to, each its own item's obligation, never this gate's. **The seam with `leader.mjs`**: `packages/runtime/plugins/startWorld.ts` — the confirmed bootstrap
site for both `startLeaderLoop` (`:148`) and `startAutodraftLoop` (`:207`) — gains one more call,
`startWakeEngineLoop(deps)`, alongside the other two, each independent (a wake-engine stall never
touches leader/autodraft leadership, matching autodraft's own stated independence,
`autodraft.mjs:464-465`). **Bundle-grep after
build** — the WDK-swallow lesson (AGENTS.md's working protocol) applies to every new frozen export
this gate's consumer dispatches to, owed by each source's own PR, not centrally.

## 5 · The rollout

**bank_agent goes first.** Its 13-verb surface is complete (survey §4 table; `wake-agency-
annexes-1-mechanics.md §A.1`), its credential kind and mint gate are already live, its allowlist is
fully populated, its hold table AND its per-call Tier-A gate are both live — the ONLY things
missing are (1) `bank_agent_run_due` (§1.1, F-A3's own obligation, unblocked by this gate) and (2)
a `clara.wake_engine_sources` row plus `enabled=true` (this gate's obligation, or F-A3's follow-up
PR, per §O.4's "whichever lands second re-reads the live text" sequencing idiom).
`clara_wake_bank_login`'s pool wiring (M4, `bank-agency-annexes-3-build.md:58`, explicitly "GATED
ON G1") is annexes §E's nine-step recipe, owned here.

**close_prep is registered but DEFAULT-DISABLED at ship.** Its DB shape is complete and correct
(survey §4); its runtime — `closePrep.v1`, `close_prep_due()`, `close_prep_holds` — is entirely
unbuilt. The registry row can exist (`carrier='direct_queue', enabled=false`) the moment this
gate's migration lands, so F-A4's own follow-up PR need only INSERT the missing pieces and flip
`enabled=true` — no engine-side surgery, exactly the "rows-only" promise the ruling names close_prep
under.

**filing and F-A5's sources register when their own runtime trains land** — PR-ρ (F-A7,
`filing-and-interview-design.md:446`, "the runtime train, rho, has not been authored") and
`reportPack.v1` (F-A5, `reporting-agency-design.md:367-368`, "F-A5 registers a consumer … PR-5 does
not land until it exists") are each their own item's obligation. **This gate's seam with PR-ρ,
answered (see §6 below for the argument): rho becomes a CONSUMER CONFIG of this engine — a registry
row plus its own workflow export — never its own separate spine consumer.** The filing DB shape
already rides `kind='wake'` (survey §4: no agent_tasks change in `0126` at all), so there is no
carrier-shape mismatch to resolve — filing is the FIRST source built entirely AFTER this gate's
ruling, and it is the cleanest possible proof the "rows-only" promise holds: PR-ρ's own migration
(if any DB work remains — likely none, since `0126` already shipped filing's credential/allowlist
side) need touch nothing this gate owns; its runtime PR need only add its `workflow_export` row and
enable it.

**Wave-G reset interaction.** Every registered source's due-predicate and hold state are ordinary
`clara` schema objects — subject to the SAME factory-reset/re-run as every other test-fixture
mechanism (constraint 13/14; ADR-0075). The registry table itself (`wake_engine_sources`) is
**estate configuration, not client data** — it is never reset by a Wave-G client-data wipe, the
same way `wake_fn_allowlist` and `GOVERNED_EGRESS_PURPOSES` are configuration, not data. A
Wave-G re-run exercises the SAME enabled sources against freshly-seeded test clients; nothing about
the reset requires re-registering a source that was already enabled.

## 6 · The battery

Full cells (both-polarity, contract-blind where applicable) are in `g1-wake-engine-annexes.md §D`.
Named here, the two drills the task explicitly asks for:

**The single-engine blast-radius drill.** Kill the wake-engine consumer process (or revoke its
advisory-lock connection). Expected: `wakeEngineHealth`'s `lag` climbs monotonically for EVERY
enabled source (visible, loud); `leader.mjs`'s own loop, `autodraft.mjs`'s own loop and every
OTHER consumer are UNAFFECTED (independent advisory locks, independent connections — the same
independence `autodraft.mjs:464-465` already states for itself); held wake rows accumulate,
`bank_agency_holds`/future per-client brakes remain fully readable and settable (they do not
depend on the engine being up); on restart, the checkpoint resumes exactly where it left off (no
double-dispatch — the checkpoint only advances past a row inside the SAME transaction as its claim,
mirroring `runEffectTxn`'s exact pattern). **RED-first cell**: an engine death that does NOT show
up in `/ready` as a WARN within one poll interval is a defect — `wakeEngineHealth` must be wired
into `/ready` the same way `autodraftHealth` is (health.mjs, cited but not re-read in this design —
annexes §D names the exact assertion).

**The per-source isolation drill.** Register a synthetic source whose workflow always throws.
Expected: its own items dead-letter and poison-skip at `MAX_ATTEMPTS` (5); its `perSourceCounts.
failed` climbs; bank_agent's and close_prep's items in the SAME batch/cycle are dispatched and
settle normally (the `belt()`/per-item try/catch isolation, §3); disabling the poisoned source
(`set_wake_source_enabled(false)`) stops its claims immediately and its already-dead-lettered rows
stay visible (`status='pending'` in the dead-letter table) for an operator to `redrive` later
(`packages/runtime/lib/relay.mjs:444`'s existing `redrive` primitive, reusable unchanged for carrier-1 sources; a
parallel one needed for carrier-2, annexes §D).

## 7 · Open questions for the owner

**None are raised by this design that standing law does not already resolve.** Every fork this
design faced had a governing precedent or an explicit ruling to resolve it (the matrix shape from
autodraft/close_prep; the consumer shape from autodraft; SKIP LOCKED vs advisory lock from the
estate's own dual usage; the receipt-table proliferation question is explicitly NOT this gate's to
settle — §8 of the annexes records it as a named, non-blocking observation for a future PM sweep,
not an open question this design needs answered to proceed). The one genuine judgement call this
design lane made without a standing ruling to cite — **close_prep grandfathered rather than
retrofitted (survey §6)** — is a design-lane recommendation with its reasoning shown in full, not
an escalation: constraint 9's spirit and the "never recut without cause" principle settle it, and
reversing it later (retrofitting close_prep onto `kind='wake'`) remains possible without any
data loss if the owner ever judges the convergence worth the D1 cost — nothing this design does
forecloses that option, it only declines to pay for it now.

---

## 8 · AS-BUILT: the walls PR-2a added (2026-08-30, ruled into this doc by the lead)

**Why this section exists.** Everything above is the design as it was ruled. The walls below are
NOT design changes — they are the DB half of residuals **#437 recorded rather than built** while
shipping `bankAgent_v1`/`closePrep_v1`, and they landed in G1 PR-2a's migration
(`UNNUMBERED_g1_pr_2a_db_pass.sql`, number claimed at merge). They are written here because a
design of record that stops at the ruling leaves the next reader believing the engine's DB surface
is what §1–§7 describes, and it no longer is.

**Nothing in §1–§7 is retracted.** Both sources are still `enabled=false`; the flip is still the
operator owner's own act at the G1 rollout ceremony (裁-40, amended to four acts by 裁-44).

### 8.1 The bank credential is bound to its task, and the binding is DERIVED

`mint_wake_credential`'s `bank_agent` arm now finds the client's one LIVE **bank-source** wake task
(`{held, running, cancel_requested}`) and records it on `wake_credentials.agent_task_id`. Zero
matches and several matches are SEPARATE refusals (`bank_agent_task_absent` /
`bank_agent_task_ambiguous`), because they mean different things to a triage.

`kind='wake'` is only the shared carrier projection; it is not bank identity. Both minters prove
the source chain `agent_tasks.origin_intent_id → wake_intents.event_id → domain_events.event_type`
against the `wake_engine_sources(source_key='bank_agent', event_type='bank.agent_due')` row, with
the event's firm/client congruent to the task. An unrelated same-kind wake is ignored by the plain
minter and refused as `wake_task_source_mismatch` by the exact door.

It is derived rather than passed, for `_close_wake_ctx`'s own stated reason: *a caller-supplied
task id is the caller asserting its own provenance*. **LIVE, not running** — FOLD-2 settled that a
cancelled pass may still READ, so a mint that refused off `running` would break the read path the
moment a cancel landed; the running requirement belongs one layer down, inside the write's own
transaction.

`mint_wake_credential_for_task` (0138's F14 sibling) gains `bank_agent` as the EXACT door and
resolves the expected `agent_tasks.kind` from `wake_engine_sources.task_kind` rather than a
literal — so `close_prep` rides its own kind and `bank_agent` rides `'wake'` with no further recut
when a third source registers. For `bank_agent`, it also reads the task's status: the three live
states may mint; `completed`, `failed`, and `cancelled` refuse without inserting a credential.
The direct-queue `close_prep` path keeps its prior semantics separately.

> **RESIDUAL, named rather than hidden.** The pack is per-ACCOUNT, so a client with two accounts
> can have two live wake tasks, and the plain mint then refuses BOTH — fail-closed and loud, never
> wrong, but it caps such a client at one concurrent run. The runtime follow-up that repoints
> `mintBankAgentCredential` at the task-bound minter removes it entirely.

### 8.2 The write TOCTOU, closed inside the writing transaction

FOLD-2 made every bank WRITE re-read `agent_tasks.status` on the runtime pool before minting. That
read is a different transaction on a different connection, taken before the mint — so a cancel
landing between it and the wrapper's own commit is invisible, and the write lands under books that
already say the run stopped. Only a check INSIDE the writing transaction, holding the row, closes
it.

`clara._bank_wake_task_gate(p_verb, p_account, p_requires_running, p_account_required)` is called
by **all fourteen** bank wake verbs. It takes `FOR UPDATE` on the task in the CALLER's transaction
and refuses with a rostered reason: `wake_task_unbound`, `wake_task_kind_mismatch`,
`wake_task_not_running` (writes only — the pack read passes `false`, per FOLD-2),
`wake_task_source_mismatch`, `wake_task_incongruent`, `wake_task_account_unbound`,
`wake_task_account_incongruent`, `wake_act_account_unresolved`, or
`wake_task_account_mismatch`.

Two structural facts about it that a later editor must not undo:

- **It stands aside for every credential that is not `bank_agent`.** THIRTEEN of the fourteen verbs
  are also `interactive_client` doors — the chat lane, where a human is in the room and there is no
  task, no pack and no account. A gate that fired there would break chatTurn.v14's whole bank tool
  set.
- **The call sits LAST, immediately before the core call.** An earlier draft put it right after
  `assert_wake_allowed` and it MASKED every refusal each wrapper already made: a credential pinned
  to client A calling with client B refused `CLR03 wake_act_account_unresolved` instead of
  `CLR11 credential_client_pin` — the right outcome for the wrong stated reason. The position is
  pinned structurally by cell G1PR2A-F7.

### 8.3 The account binding, and the producer contract it rests on

The pack is account-scoped, the producer's event carries `bank_account_id` (#437's first producer
contract, found by a RED), and nothing previously required the account a run ACTS on to be the
account it READ. `clara._wake_task_bank_account(task)` walks task → `wake_intents` →
`domain_events.payload->>'bank_account_id'` (regex-guarded, so an unparseable value refuses rather
than raising 22P02), proves the registered bank source and event/task firm/client congruence, then
joins the referenced **active `bank_accounts` row** on the same firm/client. A UUID spelling alone
is never identity: missing/malformed values are `wake_task_account_unbound`; syntactically valid
but nonexistent, inactive, or cross-client values are `wake_task_account_incongruent`.

The four formerly exempt verbs now derive or refuse too:

- `wake_add_bank_account` is unavailable to an account-specific bank run because the account does
  not exist yet;
- `wake_upsert_account` resolves `p_code` through the client's active
  `bank_accounts.coa_account_code`;
- `wake_book_staff_advance_application` resolves every bank-account COA referenced by `p_lines`
  and requires exactly one distinct account;
- `wake_propose_bank_identifier_promotion` resolves the admitted pack-read receipt for the
  `inputs_digest`, then compares that durable receipt's account subject to the task account.

Every wrapper therefore passes `p_account_required => true`: unavailable, absent, non-unique, or
cross-account derivations refuse before the core.

**`bank.agent_due` is registered in BOTH halves of the coupled pair** — `clara.event_types`
(`client_scoped = true`, without which the wake insert arm yields a clientless task the bank mint
refuses outright) and `clara.trigger_taxonomy` at the ACTIVE version with decision `internal_task`,
the estate's first row at that decision. `notification` would work mechanically and is wrong in
meaning: this is Clara's own clocked work, not a card a person answers.

### 8.4 The settlement CAS is a SIBLING, and that shape was forced by a gate

FOLD-21's residual — *"the monotonic DB-side version is G1 PR-2's"* — is
`clara._settle_wake_task_cas(p_task, p_outcome, p_error_code, p_expect_run, p_expect_status)`:
`FOR UPDATE` plus two conjuncts, so a settle from a run that no longer holds the task, or one that
raced a cancel, REFUSES with its own typed reason instead of overwriting.

NULL is a real expected run value: `v_run IS DISTINCT FROM p_expect_run` is evaluated on every
strict call, so a caller that observed an unbound task loses to a concurrent run bind. Status has
no wildcard at all; a NULL expectation refuses `wake_settle_status_required`.

It is a sibling and not a widened `_settle_wake_task` because the runtime's own standing
arity-AND-ORDER gate (`G1B-I3`) requires every call to pass EVERY declared argument. A DEFAULTed
parameter would have forced that gate to be relaxed to admit a short call — which is exactly the
residual this PR ships, so the gate would have stopped catching the follow-up's own mistake.
`_settle_wake_task(uuid,text,text)` keeps its signature and ACL while frozen v1 runs drain, but it
delegates only to the private, ungranted `_settle_wake_task_compat` body. That body intentionally
locks and derives the current expectations before calling the strict CAS — the legacy skip is
quarantined rather than smuggled into the five-argument door. Its catalog comment names the D1
cutover after which the three-argument door is revoked and the compatibility body removed. When
the runtime repoints, I3 requires all five strict arguments by name, in order.

The residual is explicit: during that drain window the exact three-argument door can let stale run
A settle a task after it has rebound to run B. Every successful compatibility settle is audited as
`settled_via='compat_3arg'`; once five-argument terminal/reconciler versions are deployed and that
counter stays at zero through the drain horizon, the forward D1 revokes the short door.

**What bites with no caller change at all is the `FOR UPDATE`**, and it is subtler than
serialisation: the row was already locked by the UPDATE at the end of the body. What the clause
buys is that the CAS conjuncts are evaluated against the COMMITTED row rather than a snapshot taken
before the racing transaction committed — so a raced expectation refuses BY NAME
(`wake_settle_status_mismatch`) instead of falling through to the transition trigger's generic
CLR13, in the field a dead-letter triage reads first.

### 8.5 What the DB now says, that the runtime cannot yet say

Five destinations exist that no production caller reaches, each a NAMED follow-up rather than an
oversight, and each blocked on the same thing: the caller is a FROZEN body (constraint 9).

| destination | who must repoint |
|---|---|
| task-exact bank credential mint | `mintBankAgentCredential` first, from the plain minter to `mint_wake_credential_for_task` |
| `agent_tasks.error_code = 'all_writes_refused'` | both lanes' classifiers, where FOLD-3 settles `internal` |
| `llm_usage_events.call_kind` ∈ {`bank_agent`, `close_prep`} (裁-49) | `BANK_AGENT_CALL_KIND` / `CLOSE_PREP_CALL_KIND` |
| `_settle_wake_task_cas`'s two expectations | new versions of both terminal steps + both reconciler belts; then the D1 cutover revokes the three-argument door |
| `close_runs.end_reason_code` → `clara.close_abandon_reasons` | `wake_abandon_close` / `abandon_close` + a closePrep `_v2` |

The last one ships as a CARRIER with no writer on **0120:254's own precedent** —
`wake_credentials.agent_task_id` shipped writerless and 0138 filled it eighteen migrations later.
Adding a parameter to a verb `closePrep.v1.tools.ts` calls by name would make closePrep_v1 refuse
every abandonment it attempted, which is strictly worse than the prose it writes now.

### 8.6 What §1.1's clock half turned out to need (measured, not assumed)

- **No cadence column.** §1.1's third bullet already says the cadence gate is a runtime pure
  predicate and "not something the engine can absorb into a registry row". Confirmed against the
  code: leader.mjs's six live `*Due(lastRunMs, nowMs)` predicates each read an env-var interval and
  no DB row. `wake_engine_sources` gained nothing.
- **No event type for `close_prep`.** It is `carrier='direct_queue'`, and
  `ck_wes_event_type_carrier` REQUIRES `event_type IS NULL` there. Its producer writes
  `agent_tasks(kind='close_prep', status='queued')` directly, and `close.preparation_started` is
  already registered if it wants to emit one.
- `wake_engine_sources.login_pool` for `close_prep` was trued `runtime` → `write` (裁-49): the row
  described a pool closePrep_v1 does not use.
