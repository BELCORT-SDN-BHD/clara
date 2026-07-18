# Slice 4 design contract — the durable runtime skeleton (v2.1 — build authority)

Status: **v2.1 — the contract of record for the Slice-4 build.** v1 → dual
adversarial design review: NATIVE **SOUND-WITH-FIXES** (S4-N1–N15) + CODEX
xhigh **FLAWED** (S4-C1–C16) — all accepted → v2 → dual DELTA re-review:
native **CLEARED-WITH-NOTES** (S4-ND1–ND9) + Codex **STILL-FLAWED with
additive residuals** (S4-D1–D10) — ALL integrated here; no structural choice
reversed (the Slice-3 precedent). Probes S4-P1–P6 ALL PASS (§2). **§0.11
OWNER-RATIFIED 2026-07-18.** Authority above this doc: ARCHITECTURE §4 +
Appendix A, ADR-008/009/010/011/014/015/016, slice3 contract v2.2,
migrations 0001–0005. Tags S4-N*/C*/ND*/D*/P*/V* resolve here (§9 map).

## 0. Ratified owner semantics (grilled 2026-07-18)

1. **[RATIFIED] Chat floor = read-only advisor.** `get_context_pack` + typed
   reads only; NO write from chat (drafting = Slice 6). Wake/pack-token
   plumbing lands + is rig-tested.
2. **[RATIFIED] Wake consumption = project-only.** Draining an intent yields
   a firm-visible `agent_tasks` row (`held`) + `wakes_outbox` row; no
   autonomous LLM run in Slice 4.
3. **[RATIFIED] Chat model = OpenAI GPT** via AI SDK 7. Default
   `CLARA_CHAT_MODEL=gpt-5.6-terra`; key via env/Fly secret. The model id is
   DURABLY SNAPSHOTTED per task at admission (S4-D3) — an env change never
   retargets an admitted/parked run; a retired provider id fails visibly and
   the reconciler settles the task (S4-ND4).
4. **[RATIFIED] Metering = tokens/day + run cap, fail-closed.** 1,000,000
   tokens/day + max 3 concurrent COMPUTE runs per firm (`held` AND
   `awaiting_input` are zero-compute and consume NO slot — S4-C7/ND3; the
   engine worker's own concurrency bounds resume bursts). Limits reject NEW
   work visibly; in-flight finishes. Operator-set; per-firm override.
   Honesty: overshoot ≤ the sum of admitted in-flight runs' usage; the
   budget day is UTC (resets 08:00 MYT) — both surfaced in copy.
5. **[RATIFIED] Clarify authority = any write-capable member**; records
   `asked_of` + `answered_by`. Consequence (S4-D1, deliberate): a clarify's
   question/answer are FIRM-VISIBLE objects by this ruling — the tool
   schema, part rendering, and UI copy say so explicitly ("visible to your
   firm"), payloads stay typed/structure-first, and Clara's clarify prompt
   instructs firm-appropriate wording. This is the ruling-consistent
   resolution of private-session-derived content in clarifies.
6. **[RATIFIED] Clarify expiry = 14 days, visible** (`expired` settle).
   Engine hook lifetime ≥ deadline is S4-V2; fallback if bounded: the
   workflow re-arms a fresh hook per segment.
7. **[RATIFIED] Deploy sequencing = park → clean → deploy** (T2-48h resume
   ≥2026-07-19 15:15 +08 first; owner-approved spike-schema drop; then Fly).
   Build/test on local throwaways only.
8. **[RATIFIED] Trace retention = 90 days**, audited prune keyed on
   `started_at` (crashed spans prune too); structural history forever;
   vendor export OFF by ABSENCE. Access-control + prune are the privacy
   control; the redaction denylist is best-effort hygiene, not a guarantee
   (S4-ND8).
9. **[RATIFIED] Chat visibility = private-by-default + share-to-firm.**
   Shared sessions are firm-readable AND continuable; author-stamped.
   Firm-visible surfaces carry NO transcript content or private-session
   linkage (§3.2). The owner gets NO routine transcript access. Accepted
   consequences (recorded): a departed member's un-shared sessions are
   unreachable until the deferred compliance export; clarify content is
   firm-visible per ruling 5.
10. **[RATIFIED] Cancel authority = any write-capable member**; idempotent;
    cascades to pending interruptions + held outbox rows; EVERY terminal
    settlement path (incl. the reconciler's) closes pending interruptions
    atomically (S4-D6).
11. **[RATIFIED 2026-07-18 — ADR-016(3) scope clarification (S4-C15; Codex
    delta wording adopted):** a DOMAIN writer is one whose mutation is
    represented by a catalogued `event_types` fact and feeds projections,
    taxonomy, or context freshness — such writers (domain-admin included)
    keep ADR-016's same-transaction emission rule. Runtime-control
    mutations (sessions, messages, agent_tasks, interruptions, outbox
    delivery state, metering, traces) emit NO `domain_events`; human
    governance routines stay audited + idempotent via `audit_log` +
    `_reserve_op`. Supersedes ONLY the universal quantifier in ADR-016(3);
    lands as an append-only ADR on merge.]**

## 1. Scope

**In:** migration `0006_runtime_core.sql`; consumption lifecycle;
`agent_tasks` + masked view; `agent_interruptions` (leased delivery);
`wakes_outbox`; `chat_sessions`/`chat_messages` (typed parts[]); metering
(atomic admission/idempotent settle); trace store + audited prune; the chat
loop (`chatTurn_v1`, config-snapshot law); SSE survives detach (stream-close
law §4.2); clarify (linearized, leased); the drain (all wake-bound
decisions); the settle-reconciler; supervisor + health; two-login pool
contract + per-attempt credentials; freeze-lint hardening; minimal dashboard
page; Fly artifacts + rollback preflight (deploy gated by ruling 7).
**Out (recorded):** writes from chat; wake ignition; documents; approvals
UX; vendor export; compliance export; visibility toggle; un-share;
predicate taxonomy; opaque/HMAC tokens; `activate_taxonomy_version`;
firm-local budgets; billing-grade metering.

## 2. Empirical record (full reports archived with the probe scripts)

**Round 1 (PG 16.13 local, 37/37 PASS):** S4-P4 SET ROLE persists; txn-local
GUC clears on COMMIT+ROLLBACK; session-level GUC LEAKS across checkouts;
idle-in-txn kill surfaces as a generic connection error with NO SQLSTATE ⇒
discard-on-any-connection-error; `current_setting(…,true)` returns ''
OR NULL for unset. S4-P5 guarded one-statement UPDATE race-free; bare
count-then-insert OVER-ADMITS (4 of cap 3); advisory-lock + count + insert
in ONE txn adopted. S4-P6 SKIP-LOCKED drain: exact split, zero dupes/
re-picks; crash-mid-batch rolls back; ON CONFLICT absorbs replays; the
unique keys are the dedupe.
**Round 2 (WDK, workflow 4.6.0 / world-postgres 4.3.0 / ai 7.0.31 — PIN
THESE):** S4-P1 park = zero compute but engine status reads "running" ⇒
`awaiting_input` bookkeeping is the ONLY parked-visibility source; external
`resumeHook()` direct-to-PG works (world package must resolve from the
resumer's cwd); park survives SIGKILL+restart; **hook tokens are
engine-enforced SINGLE-SHOT** (2nd resume → HookNotFoundError; never reuse a
token string). S4-P2 runs complete with zero readers; late attach replays
FULL history free (persisted chunks) — **but the readable NEVER signals done
unless the writable is closed** ⇒ §4.2 stream-close law. S4-P3 a post-model
throw retries the WHOLE step incl. the model call (2 invocations proven) —
duplicate SPEND possible, bounded by retry policy, DB effects idempotent by
key; kill-after-boundary replays from memoization WITHOUT re-invoking
(count stayed 1); fullStream yields the complete typed part sequence.
ai@7 notes: MockLanguageModelV4 + simulateReadableStream from 'ai/test';
tools use inputSchema + stopWhen; finishReason {unified,raw}; nested usage.
**Verification items:** S4-V1 idempotent-enqueue key (else reconciler+run
listing is the dedupe) · S4-V2 hook lifetime ≥14d (else re-arm per segment)
· S4-V3 engine bootstrap procedure · S4-V4 helper signatures from catalog.

## 3. Migration `0006_runtime_core.sql`

House rules: cluster/role DDL FIRST as the deploy role (S4-C13 —
clara_fn_owner is NOCREATEROLE), then SET ROLE clara_fn_owner; FORCE RLS +
owner policy on every new table; pinned-search_path definer triggers; ends
with the PUBLIC-execute revoke + re-assert sweep; 0001–0005 untouched; no
writer-body replacement ⇒ no D1-quiesce. New codes **CLR13** (state
conflict) + **CLR14** (limit) — collision-free (verified both lanes).

### 3.0 Roles/logins/principal
- `clara_runtime_login` NOLOGIN, member of `clara_runtime` ONLY;
  `clara_agent_read_login` NOLOGIN, member of `clara_agent_ro` ONLY
  (S4-C3), never a wake role or clara_authenticated (rig-asserted).
  Operator enables LOGIN+passwords out-of-band.
- **`clara.resolve_chat_principal(p_sub uuid)`** (S4-ND2 — the v2 direct
  membership grant is DROPPED; grant-without-policy returns zero rows under
  FORCE RLS): SECURITY DEFINER, owned clara_fn_owner, EXECUTE to
  `clara_runtime` only — returns the sub's LIVE firm + role (the
  jwt_firm/wake_firm house pattern). The runtime's ONLY membership surface.

### 3.1 wake_intents — consumption lifecycle
Status check `('pending','consumed')` + `consumed_at`/`consumed_by`. The
Slice-3 freeze trigger is REPLACED by: BEFORE INSERT **forces
status='pending' and NULL consumption fields** (S4-D7 — the existing
runtime INSERT grant must not forge a consumed row; stamping law); BEFORE
UPDATE allows exactly `pending→consumed` (derives `consumed_at=now()`,
requires `consumed_by`); DELETE blocked; TRUNCATE guard stays; CHECK ties
status↔timestamps. Column-scoped UPDATE grant (`status`,`consumed_by`).

### 3.2 `clara.agent_tasks` + masked view
Columns: id, firm_id, client_id, kind `('chat_turn','wake')`,
origin_intent_id UNIQUE, session_id, workflow_run_id, **model_snapshot
text** (S4-D3 — the durable config snapshot, stamped at admission,
immutable), status `('queued','held','running','awaiting_input',
'cancel_requested','completed','failed','cancelled','expired')` (S4-D6 —
`cancel_requested` is IN the schema; non-terminal, engine-abort pending),
created_by, trace_id, **error_code** with a DB CHECK allowlist
(`('model_error','tool_error','timeout','engine_lost','limit','internal')`
— S4-C1: bounded classes, never free text), cancelled_by/at, timestamps.
- **Derivation triggers (C6-s3 law):** chat tasks derive firm/client FROM
  the session; wake tasks FROM intent→event; kind/parent/status
  consistency enforced (`held` only for wake; queue/run/await/
  cancel_requested only for chat_turn; caller values overwritten).
- **One live turn per session:** partial unique on (session_id) where
  kind='chat_turn' and status in ('queued','running','awaiting_input',
  'cancel_requested') — ingress maps the 23505 to CLR13/409 (S4-ND7).
- **Masked human surface (S4-C1/ND1):** humans have ZERO grant on the base
  table (rig-asserted). `clara.agent_tasks_visible` is a PLAIN definer
  view (NOT security_invoker), firm-pinned by `jwt_firm()` in its
  predicate, exposing id/kind/status/client_id/error_code/timestamps/
  cancelled_by-at, and session_id+created_by ONLY where the joined
  session has `visibility='firm' OR created_by = jwt_sub()`. trace_id
  never exposed. No-oracle proof in the rig.
- **`clara.cancel_agent_task(p_task, p_op_key)`** (human lane): live
  write-capable member; `_reserve_op`; one txn: lock task THEN
  interruptions (documented order); pending interruptions → 'cancelled';
  a held wake task's outbox row → 'cancelled'; engine-active task →
  `cancel_requested` (runtime aborts + settles); else terminal settle.
  audit_log id-shaped args only; NOTIFY empty payload.

### 3.3 `clara.agent_interruptions` — clarify (linearized + LEASED)
Columns as v2 + **lease/delivery state:** `claim_lease_until timestamptz`,
`claimed_by text`, `delivered_at timestamptz`.
- Every transition = conditional single-statement UPDATE … RETURNING;
  **the answer path compares the deadline with `clock_timestamp()` AFTER
  acquiring the row (S4-D5 — `now()` freezes at txn start; the
  wait-across-deadline schedule is a named test).**
- `answer_interruption(p_id, p_answer, p_op_key)` (human lane): live
  write-capable member; `_reserve_op`; `pending→answered` conditional;
  audit id-shaped; NOTIFY.
- **Leased delivery (S4-D2, replacing v2's one-shot claim):** the listener
  LEASES a deliverable row (`answered/expired/cancelled` AND
  `delivered_at IS NULL` AND (`claim_lease_until IS NULL OR <
  clock_timestamp()`)) via UPDATE … SET claimed_by, claim_lease_until =
  now()+60s RETURNING; calls `hook.resume`; marks `delivered_at` on
  success **OR on HookNotFoundError** (S4-P1d: the engine is single-shot —
  NotFound after a crashed prior attempt = already-delivered). A crashed
  lease expires and retries; delivery is exactly-once-or-provably-done.
  S4-P1d is an acceptance-gate test.
- Expiry sweeper uses the same conditional transition + lease pipe.
- EVERY terminal task settlement closes pending interruptions (S4-D6).

### 3.4 `clara.wakes_outbox`
As v2 (stamping from intent→event; condition = the intent's decision;
status `('held','cancelled')`, allowlist trigger).

### 3.5 chat_sessions / chat_messages
As v2: visibility law + no-oracle RLS; author trigger = live active member
of the SESSION'S firm; **`turn_key` NOT NULL for user messages** (S4-ND7);
unique (session_id, turn_key) where role='user'; unique (task_id) where
role='assistant' (upsert); seq = max+1 under the session lock (safe under
one-live-turn); parts immutable; runtime role-gate honesty note stands.

### 3.6 Metering
`firm_limits`, `firm_usage_daily`, `task_usage` as v2. 
**`begin_chat_turn(p_session, p_author, p_turn_key, p_user_parts,
p_model)`** (runtime-only), ONE txn: **two-arg advisory lock
`pg_advisory_xact_lock(CLASS_ADMIT, firm_hash)` (S4-ND6 — namespaced so
admission can never alias relay leadership)**; turn_key replay → original
task; budget via the guarded one-statement UPDATE; compute-cap count over
('queued','running','cancel_requested') chat tasks (zero-compute states
excluded — §0.4); inserts user message + task (with model_snapshot);
CLR14 w/ which-limit + UTC reset. 
**`settle_chat_turn(p_task, p_parts, p_tokens, p_outcome, p_error_code)`**
(runtime-only): assistant upsert by task; `task_usage` on-conflict-nothing
+ daily increment only when new; terminal replay = stored-outcome no-op;
closes pending interruptions when terminal (S4-D6).

### 3.7 Traces
As v2 with: **upsert key `(trace_id, span_id)`** and firm/task identity
derived from the task row (S4-D9 — a span-id collision can never cross
firms); `started_at`-keyed audited prune; bounded batches; runtime-only
grants (both human AND agent_ro denied — rig).

### 3.8 Health + heartbeats
`relay_health()` + `runtime_heartbeats` as v2.

### 3.9 Sweep + upgrade
As v2; the all-decisions upgrade/drain test SEEDS A SYNTHETIC TAXONOMY
VERSION mapping types to internal_task/notification (S4-ND9 — v1 maps
none; the stamping trigger rejects unmapped triples; without the seed the
test false-greens to background_review-only).

## 4. Runtime design

### 4.1 Processes, pools, credentials
- **Supervisor (`scripts/serve.mjs`):** one process group (HTTP, world
  when enabled, control listener, relay+drain+sweepers); **ANY required
  component's unexpected exit/rejection terminates the group (S4-D10)** —
  crash-only; Fly restarts. SIGTERM = stop intake → bounded drain → exit.
  One always-on machine, non-HA, explicit.
- Two pools/two logins as v2; P4 discipline (txn-local GUCs,
  rollback-before-release, discard-on-any-connection-error); two-arg
  advisory-lock namespacing everywhere (S4-ND6).
- **Connection budget (concrete — S4-C12):** engine pool 5 · runtime pool
  5 · read pool 5 · LISTEN 2 = 17 sessions default (env-tunable),
  documented against the Supavisor session-mode ceiling.
- **Per-attempt read credentials (S4-D8):** the wake credential (kind
  'interactive', session firm, no obo, TTL ≈5 min) is minted PER
  EXECUTION ATTEMPT of a read step — never per turn (a 14-day park
  outlives any credential). **LAW: plaintext secrets never transit WDK
  step inputs/returns or workflow state — step IO is durably persisted
  (P3); credentials are minted inside the step that uses them.** The
  pack's books_version stays in durable step state (forward plumbing).

### 4.2 The chat loop
As v2 (trusted-ingress boundary; central authorization module; pinned JWT
validation; principal via `resolve_chat_principal`; turn flow through
`begin_chat_turn`; idempotent enqueue keyed by task id (S4-V1) reading the
task's DURABLE model_snapshot (S4-D3) — the reconciler re-enqueues with
exactly the stored snapshot), plus:
- **Stream-close law (S4-P2):** `chatTurn_v1` CLOSES its stream writable
  at workflow end, AND the SSE endpoint terminates on task-terminal
  status regardless (belt) — an unclosed engine readable never signals
  done. SSE replays from the engine's persisted chunks (free full
  history) + persisted parts as authority on reattach.
- Parked visibility: `awaiting_input` bookkeeping is authoritative — the
  engine reports parked runs as "running" (S4-P1a).
- Governance acts never transit the runtime (dashboard → PostgREST as
  clara_authenticated; structural, rig-asserted).

### 4.3 Clarify
As v2 with the §3.3 leased delivery + clock_timestamp deadline;
firm-visibility of clarify content is explicit in the tool schema, the
part, and the UI copy (§0.5).

### 4.4 The drain
As v2 (one txn per batch; all three wake-bound decisions → uniform held
projection; unknown decision → dead-letter; post-ON-CONFLICT surviving-row
identity asserts).

### 4.5–4.7 Metering / sweepers+reconciler / health
As v2, with: the reconciler settles using stored snapshots and closes
pending interruptions on every terminal repair (S4-D6); **/ready FAILS
only on: DB unreachable · world dead (when enabled) · control listener
dead · taxonomy HALT; relay-leader death is handled by supervisor
fail-fast (S4-ND5 — a dead relay must not pull chat HTTP from the LB);
lag/dead-letters/backlog stay warnings.**

### 4.8 Minimal dashboard page
As v2 (+ reads agent_tasks_visible only; clarify box posts to PostgREST;
CLR14 copy shows the UTC reset; 409 copy for concurrent turns).

### 4.9 Versioning + freeze-lint (final shape after S4-ND4/D4)
`chatTurn_v1` frozen; registry monotonicity + AST-grade enqueue-site lint
(bypass fixture required). **Prompt text + the tool registry live INSIDE
the frozen body's import closure** — changing either IS a body change ⇒
`_vN` (freeze-lint enforced; append-only retention until zero non-terminal
runs — the same rule as bodies). **The MODEL ID is the one deliberate
run-scoped parameter** (ratified parameterization, ADR on merge): durably
snapshotted per task at admission (S4-D3), so in-flight semantics never
drift; a default change affects only new turns. Rollback preflight: the
target image must export every workflow name+version with non-terminal
runs — else quiesce/drain; blind revert forbidden.

### 4.10 Env contract
As v2 + concrete pool sizes (§4.1); pinned versions: `workflow@4.6.0`,
`@workflow/world-postgres@4.3.0`, `ai@7.0.31` (P2 env record).

## 5. Fly deploy (gated by ruling 7)
As v2 (bootstrap step S4-V3; always-on single machine; rollback preflight;
/ready fail-set wired to Fly checks).

## 6. Tests
As v2 (barrier discipline throughout), amended: the cap race counts only
compute states; `wait_across_deadline_answer_loses` (S4-D5); leased
delivery crash tests — `claim_crash_before_resume_retries_after_lease` +
`resume_crash_then_hooknotfound_marks_delivered` (S4-D2, acceptance-gate);
`insert_cannot_forge_consumed_intent` (S4-D7); `span_key_is_trace_scoped`
(S4-D9); `terminal_settle_closes_pending_interruptions` (S4-D6);
`credential_minted_per_attempt_not_in_step_state` (S4-D8 — greps durable
step IO for secret material); the synthetic-taxonomy seed for the
all-decisions drain test (S4-ND9); masked-view mode + zero-base-grant
asserts (S4-ND1); error_code CHECK allowlist negative test (S4-C1).

## 7. What does NOT change
As v2 (0001–0005; relay core; authorization law; taxonomy; spike schemas
until ruling-7 cleanup; existing freeze-lint guarantees).

## 8. Follow-ups (recorded, not built)
As v2, plus: same-ms double-resume race formally unexercised (engine
single-shot observed; leases + P1d gate cover it); a hook-token-string
reuse footgun is forbidden by convention (never re-create a hook with a
prior token string); Windows dev note — stop the worker before nitro
rebuild (.output locks). ADR on merge: ten rulings + §0.11 (ratified) +
trusted-ingress boundary + model-parameterization/config-snapshot law.

## 9. Finding-integration map
N1→§3.6 · N2→§3.5/3.6 · N3→§3.2/3.3 · N4→§4.4 · N5→§3.2 · N6→§4.6 ·
N7→§3.3 · N8/N9→§4.1 · N10→§4.2 · N11→§0.4 · N12→§4.1 · N13/N14→§6/§4.9 ·
N15→§3.5 ‖ C1→§3.2(+CHECK)/§4.2 · C2→§4.2/§3.0 · C3→§3.0/4.1 · C4→§3.2/
3.4/3.7 · C5→§3.6/4.2/4.6 · C6→§3.5/3.6 · C7→§3.6/§0.4 · C8→§3.2 ·
C9→§3.3 · C10→§4.6/S4-V2 · C11→§4.9 · C12→§4.1/4.7/§5 · C13→§3.0/3.1/4.4 ·
C14→§3.7 · C15→§0.11 · C16→§6 ‖ ND1→§3.2 · ND2→§3.0 · ND3→§0.4/§3.6 ·
ND4→§4.9 · ND5→§4.7 · ND6→§3.6/4.1 · ND7→§3.2/3.5 · ND8→§0.8 · ND9→§3.9 ‖
D1→§0.5 · D2→§3.3 · D3→§3.2/3.6/4.2 · D4→§4.9 · D5→§3.3 · D6→§3.2/3.3/
4.6 · D7→§3.1 · D8→§4.1 · D9→§3.7 · D10→§4.1.
