# @clara/runtime

Clara's long-running Node service: durable workflows, document intake, agent execution, and HTTP/SSE.
The product and authority boundaries live in [ARCHITECTURE](../../docs/ARCHITECTURE.md).

## Current structure

| Path | Responsibility |
|---|---|
| `src/index.ts` and route modules | Chat, interviews, intake, document/artifact bytes, checkout/auth wall, health and build identity |
| `workflows/registry.ts` | Current workflow targets and retained historical exports |
| `workflows/` | Frozen workflow bodies, prompts and tool definitions |
| `plugins/startWorld.ts` | Starts the engine, injects services, supervises consumers |
| `lib/` | Pool/auth boundaries, queue consumers, storage, extraction adapters and recovery |
| `scripts/serve.mjs` | Production supervisor and graceful shutdown |
| `scripts/worker.mjs` | Alternate built-server entry point |

The registry selects the current chat, autodraft, statement/witness facts, document ingest,
firm interview, client onboarding, and bank/close wake workflows. Read it for the exact versions
and retained exports; repository state alone is not evidence of a deployed image.

### The three pins the wave 2026-09-15 cut moved

`chatTurn → chatTurn_v20`, `claraWork → claraWork_v4`, `clientOnboarding → clientOnboarding_v5`.
Every superseded body stays exported and in `workflowBodies` — the boot census refuses to start the
world database-wide if a body a parked run needs is missing, and that is policy (c) enforced rather
than promised. What each new body carries, and nothing more:

* **`chatTurn_v20`** — exactly two tools over v19's map: `start_staff_expense_claim_work` (#638) and
  `start_accrual_work` (#652). NO new wire kind and NO widened `WORK_ACCEPTED_PURPOSES`: both admit
  `journal_entry`-purpose Work (0221's amendment for the claim; 0193's `_plan_admit_occurrence` for
  the accrual occurrence), so `apps/web`'s reader is unmoved. Deploy 0221 and 0222 first.
* **`claraWork_v4`** — a knowledge-context read before the segment loop through the non-frozen
  `lib/knowledge-conflicts.mjs`, whose `knowledge_version` rides into every `model_call` execution
  trace as an observed revision (#654); two EXECUTE-LESS question tools, `answer_accrual_term`
  (#652) and `ask_knowledge_conflict` (#654), which park through the same
  `clara.open_work_question` machinery `ask_question` already uses and can write nothing; and
  #639's dependent fixed-asset particulars question, opened by the WORKFLOW after a commit whose
  entry birthed a register row with no method or in-service date and applied through
  `clara.complete_fixed_asset_particulars_for`, which writes no journal. The roster goes from three
  names to five and the bundle id moves to `clara-work-tools/v4`. Deploy 0192 and 0216 first.
* **`clientOnboarding_v5`** (+ `interview.v4.questions.ts`, `interview.v4.known.ts`) — `sst_no`
  gated behind `sst_regime !== 'not_registered'` (#649 H-52), a `fye_day` segment immediately after
  `fye` (#649 D7; `required_for_commit` stays FALSE), and a known-facts pre-read of
  `clara.get_knowledge_pack` so a registered fact the segment's own validator accepts makes the
  question absent — and one it REFUSES makes the question a confirm with the record shown. No
  migration and no route change.

TWO CONTRACTS THE CUT COULD NOT DELIVER, and both are grant walls rather than omissions: #653's
`start_prepayment_schedule_work` / `read_prepayment_source` (every prepayment door and read is
`clara_authenticated`-only, 0223 §D.1) and #647's `record_counterparty_alias` (no
`clara.add_counterparty_alias_for` exists). Their modules are deliberately still outside every
frozen closure.

The agent can draft and post within the database's current wake authority, perform audited freeform
reads, and prepare bank/close/report work. SQL enforces the admitted operations and their accounting
conditions. The approved simplification of human attestations/maker-checker remains implementation
work; removing old documentation does not remove those SQL checks.

Document intake streams to a local spool, checks file type and malware, stores immutable private
objects, reads them back by hash, and commits custody. A custody failure before the canonical write
— a transient Storage fault included — creates no `clara.documents` row, leaves a terminal typed
intake failure, and deletes the spooled bytes: re-upload is the recovery, and
`tests/intake-db.test.mjs` pins that. OCR supplies layout/text; the active invoice and statement
fact lanes use text/image witness pairs. CSV/OFX and structured-format paths have different
processing routes. Earlier workflow versions remain available for compatibility.

Reading those bytes back is `GET /api/documents/:id/bytes` (`src/documentRoutes.ts`), the only
source-bytes path. It validates the session JWT before any database round trip, then runs one
`clara_runtime` transaction that resolves the live principal and calls
`clara.get_document_for_human_read_v2`, which decides firm membership and client scope and writes
the egress audit line. `?client=<uuid>` carries the reader's current client scope;
`?disposition=attachment` makes the response a download and is audited as purpose `download`
rather than `preview`. Bytes are fetched to a per-request temp file and hash-verified against the
row's own `sha256` before anything is streamed, so a substituted object never reaches the reader;
the temp file is removed on every path. Refusals are typed: one byte-identical 404 for absent,
foreign-firm and out-of-client-scope, 403 `no_membership`, 409 `custody_pending`, 400
`invalid_input`, 502 `checksum_mismatch`, and 502/503 `storage_error` with a `reason` of
`object_missing`, `credential_refused`, `unavailable` or `unconfigured`. Success carries
`ETag` (the content address), `Content-Length`, `Cache-Control: private, no-store` and
`X-Content-Type-Options: nosniff`. No SQL text and no vendor response body reach the client.

### The prepayment-amortisation lane (#653) — one non-frozen module and two owed successors

`lib/prepayment-schedule-basis.ts` is NOT imported by any workflow body and must not be until the
wave's successor ceremony: it is the `lib/periodic-adjustment-basis.ts` pattern BEFORE that file
became frozen by import, and that file's own header records what import cost it. The checker's
specifier scan matches `import("…")` too, so a dynamic import freezes it just as a static one does.

It carries the `.strict()` tool schema, a refusal MIRROR (never a rule of its own), the door
payload builder in the database's own parameter names, and the refusal→message map. The schema is
deliberately narrow and each absence is a rule: no amount, no period count, no term, no cadence and
no authority id — all of them are derived by the frozen `clara.prepayment_schedule_v1` or are
human-only by law (`clara.record_document_service_period` has no wake wrapper and never will).

TWO SUCCESSOR CONTRACTS ARE WRITTEN IN THAT FILE'S FOOTER AND NEITHER IS CUT:

* **`chatTurn_v20` — `start_prepayment_schedule_work`.** Four lines: the tool, the local refusal,
  a `stableOpKey`, one `clara.create_prepayment_schedule` call with `{kind:"chat_task", id:
  ctx.taskId}` as the authority, and a `prepayment_schedule_configured` part. It mints no
  `accounting_work.purpose` and no claraWork bundle — an amortisation occurrence is an ordinary
  `journal_entry` Work the existing frozen body runs byte for byte.
* **`claraWork_v4` — the TERM PARK.** #653's AC5 and historical row C55.13 are NOT CLAIMED by this
  slice, and this is why: `clara.open_work_question` is `clara_runtime`-only, hook-token-gated and
  requires a `running` task, so no human door can park a Work; and the frozen prompt forbids the run
  from citing a source document at all. The contract names the roster change, the prompt change, the
  `open_work_question` call with 0180's closed field kinds, and the rule that the ANSWER is applied
  through the human door rather than by the run — a model-read service period may never become a
  durable accounting fact.

`tests/prepayment-occurrence-e2e.mjs` is a standalone e2e beside `plan-occurrence-e2e.mjs`. It adds
one fact that lane cannot show: a per-period amount survives the frozen `.strict()` tool schema,
the run's faithful echo and the digest comparison, so the final period's entry charges the residual
rather than the revision's stored constant. Its model is SCRIPTED, so it is local, supplementary
evidence per #653's AC8 — not a provider run and not hosted evidence.

The bank-agent and close-prep wake engine/bodies exist. Their cadence sources ship disabled and
their producer/activation work remains open. Reporting uses a separate
[render service](../reporting-render/README.md). Tax computation and SST return issuance are
incomplete; reference tables and the SST compliance watch do not constitute an issuing tax engine.

## Local commands

From the repository root:

```sh
pnpm --filter @clara/runtime typecheck
pnpm --filter @clara/runtime build
pnpm --filter @clara/runtime start
pnpm --filter @clara/runtime test
```

Nitro's build compiles the Workflow DevKit directives. After a workflow change, verify the expected
export and behavior are present in the built bundle. Source typechecking alone does not prove that.

The world starts only with `CLARA_START_WORLD=1`. Leave it unset for local health checks against
a configured disposable database. Production pool assertions still apply when the world is off.
`RELAY_TEST_MODE=1` permits injected test adapters and local base-role connections; it belongs
only on test rigs. Database-dependent tests need the disposable estate and PostgreSQL 17
`pg_dump`/`psql`; see [database tests](../db/tests/README.md).

### Standalone e2es

Several runtime e2es are **not** collected by `node --test` and are invoked by path. They need a
built server (`pnpm --filter @clara/runtime build`), a migrated + seeded database whose name the
files hard-gate to `clara_rt_test` or `clara_wave_b_ci`, a `WORKFLOW_POSTGRES_URL` pointing at
that same database, and the WDK world bootstrap
(`pnpm --filter @clara/runtime exec bootstrap`). CI runs them in the `db-live-gates` job; read
[`db-live-gates/action.yml`](../../.github/actions/db-live-gates/action.yml) for the exact
sequence.

`tests/staff-expense-claim-e2e.mjs` (#638) is one of them. It SKIPS CLEANLY — exit 0, with the
reason printed — when migration 0221 is absent (`clara.staff_expense_claims`,
`clara.staff_expense_claim_status` and `clara.admit_staff_expense_claim_work` are probed before
anything is spawned), so the runtime half is safe to merge before the database half lands. It
drives `POST /api/work/staff-expense-claim` end to end: a claim row durable at ADMISSION, a run
served by the UNCHANGED frozen claraWork bundle the image pins (written at `clara-work/v3`;
`clara-work/v4` since the wave 2026-09-15 cut repointed the class, and the file reads the digest off
the boot banner rather than pinning a version) with the purpose vocabulary unwidened, a
`posted` status-ledger row written by the operation receipt's own trigger, a lost acknowledgement
that replays onto the same claim, a changed claim under one intent key that is a typed 409, a
replay under REVOKED membership that is refused rather than replayed, per-item continuation, the
optional attachment, and a SIGKILL between the database commit and the workflow checkpoint on the
advance arm — where the allocation is minted by a deferred constraint trigger at commit, so only a
real World can show the four writes are one transaction.

This is a general rule, not per-file guidance: none of the standalone e2es
(`tests/interview-e2e.mjs`, `tests/version-cutover-e2e.mjs`, `tests/work-journal-e2e.mjs`,
`tests/work-question-e2e.mjs`, `tests/work-cancel-e2e.mjs`,
`tests/periodic-adjustment-e2e.mjs`, `tests/staff-expense-claim-e2e.mjs`) may share a host with another suite
WHILE it is actually running. `db-live-gates` runs each battery alone — one at a time on the same
rig, never concurrently with anything else that could touch the same rows or steal the same lease
clock. Running one locally while another suite hammers the same database at the same time is the
one setup CI does not reproduce and these e2es do not defend against.

`tests/version-cutover-e2e.mjs` is the one exception to needing a *clean* rig, not to the rule
above: its rollback preflight — per-name and inventory-shaped alike — is scoped to the
`workflow.workflow_runs` rows the e2e itself stages, so a rig pre-seeded with parked non-terminal
runs left by an earlier, already-finished suite is tolerated BY DESIGN (#708). That tolerance is
proven inside the e2e itself, not merely asserted: before its rollback-preflight legs, the file
plants its own batch of foreign-scope non-terminal rows directly in SQL, asserts the old
(unscoped) shape would have counted them, and asserts its scoped helpers reach the same verdicts
regardless — then deletes the rows it planted. Only the runs it staged are ever in the
preflight's universe; the runbook's own preflight stays global, and the README's "Deployment and
rollback" section below is the contract that describes it.

`tests/accrual-e2e.mjs` (#652) extends the plan-occurrence leg to the accrual lane and runs
immediately after it on the same rig. It proves the four things only a real world can show about an
evidenced accrual: configuring one through `clara.create_accrual_adjustment` writes the plan, its
revision, the accrual record, the current period's occurrence and the admitted Work in ONE commit
with no engine running and NOTHING posted (a configuration receipt in `clara.op_receipts` is not an
executed occurrence in `clara.operation_receipts`); a crash between the posting commit and its
checkpoint replays onto the same logical identity and still leaves exactly ONE row in
`clara.accrual_adjustments`; the reversal waits for the accrual's committed entry, names it and
posts; and a cancel followed by the human's explicitly scoped `clara.request_plan_catch_up`
produces a re-attempt under the SAME occurrence identity with one accrual record throughout. It
SKIPS CLEANLY (exit 0, printed reason) when migration 0222 is absent, so it is safe to merge before
the DB half lands, and `CLARA_SKIP_ACCRUAL_E2E=1` opts out. Its non-frozen basis module,
[`lib/accrual-basis.ts`](lib/accrual-basis.ts), is unit-tested separately by
`tests/accrual-basis-unit.test.mjs` and carries the `chatTurn` successor's wiring stanza in its own
footer — **no frozen file may import it before that cut**.

`tests/work-question-e2e.mjs` derives each leg's settle budget rather than pinning a constant
(#745): **budget = (control lease + one control poll interval) × the number of leases the leg must
wait out + a stated slack.** The battery gives every engine it spawns — faulted ones included — the
short `CLARA_CTL_LEASE_SECONDS=2` lease, so the wait is two seconds rather than `control.mjs`'s
60-second default, and the slack is headroom for the resume itself rather than for lease-waiting.
The engines' `[control]` lines are kept in the captured output, so a failing leg names the arm that
ran; expect the lease-timing legs (3 and 5) to be the first to overrun if this battery ends up
sharing a host with another suite despite the rule above.

## Connection and service configuration

Credentials arrive through environment/secrets. Never put their values in source, logs or argv.
The engine reads `WORKFLOW_POSTGRES_URL`; entry scripts map `DATABASE_URL` to it when needed.
Use session pooling for the durable engine and dedicated LISTEN/advisory-lock consumers.

| Lane | DSN variable | Boot behavior |
|---|---|---|
| Runtime | `CLARA_RUNTIME_DATABASE_URL` | Required |
| Read | `CLARA_READ_DATABASE_URL` | Required |
| Interactive writes | `CLARA_WRITE_DATABASE_URL` | Required |
| Freeform read | `CLARA_FREEFORM_DATABASE_URL` | Required |
| Bank wake | `CLARA_BANK_DATABASE_URL` | Lazy; fails on use without configuration |
| Stripe webhook | `CLARA_STRIPE_WEBHOOK_DATABASE_URL` | Lazy |
| Pre-session auth wall | `CLARA_AUTH_WALL_DATABASE_URL` | Lazy |

The corresponding login roles, SET ROLE targets and probe roster are defined in
`lib/pools.mjs`, `lib/freeform-read.mjs`, `lib/checkout-pools.mjs` and `lib/lane-probe.mjs`.
Provision LOGIN/passwords before enabling the relevant lane. Pool maxima are configurable; measure
actual connection headroom before increasing them, including engine, consumer and probe sessions.

Other configuration groups:

- Models/auth: `OPENAI_API_KEY`; `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUD`, and either
  `SUPABASE_JWT_JWKS_URL` or `SUPABASE_JWT_SECRET`.
- Intake: `CLARA_INTAKE_CORS_ORIGINS` (exact origins), `CLARA_SPOOL_DIR`,
  `CLARA_SPOOL_QUOTA_MB`, `CLARA_SPOOL_TTL_MIN`, `CLARA_CLAMD_SOCKET`,
  `CLARA_CLAMD_MANAGED`. The Fly volume mounts at `/data`.
- Storage: `CLARA_STORAGE_URL`, `CLARA_STORAGE_ROLE`, `CLARA_STORAGE_ROLE_JWT`.
  Runtime custody requires the dedicated insert/read role; browser requests receive neither
  this credential nor a signed Storage URL. `realConfig()` refuses `anon`, `authenticated`
  and `service_role` as the designated role, requires the JWT's own `role` claim to equal it,
  and requires more than 30 seconds of validity left; each of those refusals is a 503 with
  `reason: "unconfigured"` and makes no request. Read failures are classified from the response —
  including the status Supabase wraps inside the body — into `object_missing`,
  `credential_refused` or `unavailable`, so a caller can tell "re-upload" from "rotate the
  credential" from "retry". The bucket's RLS policies scope by bucket and key shape only, so this
  credential can read any firm's conforming object: cross-firm denial for source bytes rests on
  `clara.get_document_for_human_read_v2` and the route above, not on Storage.
- OCR: `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`, and the `CLARA_DOC_EGRESS_APPROVED` switch.
  Typed consent/activation checks remain part of current SQL; the switch alone is not consent.
- Checkout: `STRIPE_WEBHOOK_SECRET`, `CLARA_STRIPE_LIVEMODE`, and the lane-specific environment
  consumed by `src/stripeRoutes.ts` and `src/authWallRoutes.ts`.

Witness model changes are paired DB/runtime changes: task engine stamps must match the service
snapshot. Changing `CLARA_WITNESS_MODEL_ID` or `CLARA_STATEMENT_WITNESS_MODEL_ID` alone can leave
tasks waiting before egress. The classifier's engine id is also DB-pinned.

## Health, TLS and serving identity

`GET /health` is dependency-free liveness. `GET /ready` fails (503) on database/runtime-lane
failure, dead required engine/control heartbeats, or taxonomy halt. Everything else — other lane
failures, intake/storage failures, queue lag, pool errors, leader reconnects and TLS posture —
warns. That split is unchanged.

Read the body as three answers, never two. A check is measured-and-healthy, measured-and-failing,
or **not measured**; an absent optional dependency is a fourth answer and never the second.

| Field | Says |
|---|---|
| `checks.pools` | Per-lane probe. `{pending:true}` before the first background cycle, `stalled` when the probe loop itself has wedged, `skipped/dsn_not_configured` for an unconfigured lazy lane, else `ok` + `latency_ms` or `ok:false` + a sanitized code. |
| `checks.pool_errors` | Per-lane background pool-error counters (`errors`, `last_error_at`, `last_error_code`). A lane MISSING from this map is a lazy pool this process never opened — not a lane with zero errors. |
| `checks.relay_pool` | The relay pool's own counters (same shape), kept separate so one error never warns twice. |
| `checks.storage` | `{pending:true}` (never measured — carries no `ok`), `{skipped:true, reason:"storage_not_configured"}`, or a measured `ok`/`ok:false` with a classified `reason`. |
| `checks.leader` | `{started, held, since, reconnects, last_error_code, halted}`. `started:false` means no leader runs in this process. `held:false` while started is a reconnect (warn). A recorded `halted` sets `ok:false`. |
| `checks.tls` | The boot assert's reading: `measured:false` when it has not run here, else `pinned`/`unpinned`/`weak_mode` as **variable names** plus a `validated` count. Never a DSN, never a certificate path. |
| Consumer checks | `lag`, `pendingDeadLetters` (unchanged), plus `deadLetters:{pending,exhausted}` and `firmsUncheckpointed` for relay consumers, and `stranded`/`maxAttemptCount`/`strandedMs` for the task lanes. A consumer whose health query threw appears as `{ok:false, unavailable:true, error:<code>}` — never as a missing key. |

`exhausted` counts pending dead letters at or past that consumer's own max attempts: retrying has
stopped and only a redrive clears them. `firmsUncheckpointed` counts firms with events and no
checkpoint row — not-yet-measured, which `lag` cannot express because it reads a missing
checkpoint as sequence zero. `stranded` counts rows wedged in `running` past the lane's own
requeue threshold, which the queued backlog cannot see at all.

Nothing in the payload carries a DSN, a certificate path or raw database text; failures are
reported as sanitized identifier-shaped codes and the full error goes to the server log.

TLS is determined by each DSN. The image contains `/app/ops/tls/pooler-ca.crt`;
`lib/tls-ca.mjs` rejects malformed/expired/mismatched configured pins, but currently only warns
about absent pins or non-verifying modes. To activate verified TLS on a lane that is not yet
pinned, deploy the image containing the CA first, validate the server chain, then update the
applicable DSNs with `sslmode=verify-full&sslrootcert=/app/ops/tls/pooler-ca.crt` and re-probe
every lane.
Shipping the certificate does not establish that live secrets use it. `checks.tls` reports what
the running process actually booted with, by variable name; `measured:false` means the boot
assert has not run there and is not evidence of a clean posture. Read `checks.tls.pinned` on the
deployed host rather than the image: on 2026-09-09 all seven lane DSNs of `clara-runtime` were
switched to verify-full through this ceremony and `/ready` reported them pinned with the shipped
CA validated (#617).
[node-postgres SSL configuration](https://node-postgres.com/features/ssl)

### Recovery checklist

Run these against the machine that is serving. `$BASE` is the runtime's origin (locally
`http://127.0.0.1:3200`; on Fly, run the `curl` inside `fly ssh console -C`). Every step is a
command; none of them is a description of one.

1. **Read the whole verdict, then the warnings.** A 200 with warnings is degraded-but-serving;
   only the fail set above returns 503.

   ```sh
   curl -fsS "$BASE/ready" | jq '{ready, warnings}'
   curl -fsS "$BASE/ready" | jq '.checks | {pools, pool_errors, relay_pool, storage, leader, tls}'
   ```

2. **Separate not-measured from failing before doing anything.** If `checks.pools.pending` is
   true, or `checks.storage.pending` is true, or `checks.tls.measured` is false, you have no
   reading yet — poll again rather than acting on absence.

   ```sh
   sleep 30 && curl -fsS "$BASE/ready" | jq '.checks.pools, .checks.storage, .checks.tls'
   ```

3. **Name the failing lane.** `skipped` lanes are unconfigured by design (bank, the two checkout
   lanes); a lane with `ok:false` carries a sanitized code, and its login/DSN variable is in the
   lane table above under "Connection and service configuration".

   ```sh
   curl -fsS "$BASE/ready" | jq '.checks.pools | arrays | map(select(.ok == false))'
   curl -fsS "$BASE/ready" | jq '.checks.pool_errors | with_entries(select(.value.errors > 0))'
   ```

4. **Name the stalled consumer and the work behind it.** `exhausted` and `stranded` are the two
   categories that do not clear on their own.

   ```sh
   curl -fsS "$BASE/ready" | jq '.checks | with_entries(select((.value | objects | .deadLetters.exhausted // 0) > 0))'
   curl -fsS "$BASE/ready" | jq '.checks | with_entries(select((.value | objects | .stranded // 0) > 0))'
   ```

5. **List the exhausted dead letters for that consumer** (read-only; the runtime DSN, psql):

   ```sh
   psql "$CLARA_RUNTIME_DATABASE_URL" -c \
     "select event_id, event_type, attempt_count, reason
        from clara.relay_dead_letters
       where consumer = 'facts_gate' and status = 'pending'
       order by attempt_count desc limit 20;"
   ```

6. **Redrive each one** with the registered helper (idempotent; refuses when there is no dead
   letter for that consumer/event):

   ```sh
   cd packages/runtime
   node scripts/relay.mjs redrive <eventId> --consumer facts_gate
   ```

   Registered consumers are `router`, `matcher`, `sst_watch`, `facts_gate` and
   `wiki_projection`. The autodraft and wake-engine ledgers have **no** CLI redrive today: their
   `exhausted` counts are diagnostic, and clearing them is a database-side operation, not a
   documented one-liner. Do not infer a verb this repository does not ship.

7. **Confirm recovery, and confirm it moved.** A single reading proves nothing; the lane must be
   `ok:true` and the category count must have fallen.

   ```sh
   curl -fsS "$BASE/ready" | jq '{ready, warnings}'
   curl -fsS "$BASE/ready" | jq '.checks.pools | arrays | map(select(.ok == false)) | length'
   ```

A stranded task lane recovers when its own worker requeues the row past
`CLARA_CLASSIFY_STRANDED_MS` / `CLARA_LOCAL_FACTS_STRANDED_MS`; if `stranded` does not fall
across two polls, the consumer loop itself is not running. A leader showing `held:false` with a
rising `reconnects` is reconnecting on its own; a recorded `halted` means the process is exiting
non-zero and supervision restarts it — check `checks.taxonomy` before assuming otherwise.

Authenticated `GET /api/build-info` reports baked build identity, workflow names and the DB
migration frontier. Use this together with the actual Fly image and Worker version to establish
what is serving; local registry values alone cannot do that.

It also reports `bodies` and `pins` (#637). `workflows` names the registry's CLASSES, which is not
a question a cutover or a rollback asks; `bodies` is every workflow body this image can RUN (the
pins plus every retained superseded export) and `pins` maps each class to the body it dispatches
to. The same four facts appear in one boot line, so a log and an HTTP read can be compared without
trusting either alone:

```
[clara-runtime] serving git_sha=<sha> frontier=<version>(<count>) bodies=<n> pins chatTurn=chatTurn_v20 claraWork=claraWork_v4 clientOnboarding=clientOnboarding_v5 …
```

`git_sha=<unset>` and `frontier=<unavailable: reason>` are the honest readings when the build arg
was not baked or the frontier read could not answer — never a fabricated value.

`checks.bodies` on `/ready` is the LIVE half: how many non-terminal workflow runs are parked on
bodies THIS image does not carry, and which bodies those are. Read it as three answers, like every
other check here — `measured:false` with no error means the boot census has not run in this process,
`measured:false` with an `error` means the read failed (never a clean zero), and a measured census
is silent when nothing is stranded.

### The boot census REFUSES to start the world when a body is stranded

The census runs **before** `getWorld().start()`, and a non-zero count stops the world:

```
[clara-runtime] stranded bodies n=3 names=claraWork_v2 — REFUSING TO START THE DURABLE WORLD …
```

This overturns the warning-only reading that shipped first, and a measurement is why. An engine that
boots against a non-terminal run whose body this image does not export re-enqueues it, the replay
raises `ReplayDivergenceError`, and the crash-only supervisor exits 1 — under Fly that is a restart
loop, not a park. A warning printed by a process about to die in a loop is not a reading anyone gets
to act on.

What a refusal does and does not do:

- **HTTP stays up.** `/health`, `/ready` and `/api/build-info` remain readable, which is the whole
  point: an operator must be able to see WHY. No lane runs — no leader, no control listener, no
  reconciler — and nothing is lost, because the runs are parked.
- **`/ready` is 503**, with `checks.bodies.world_start_refused: true` and the bodies NAMED. It is a
  hard conjunct rather than an inference from a missing heartbeat: the heartbeat row is shared estate
  state, and a beat from the process that stopped seconds ago stays fresh for a whole staleness
  window — exactly the window in which a refused process would otherwise report itself ready.
- **`CLARA_ALLOW_STRANDED_BODIES=1` overrides it**, restoring the old warning-only posture visibly:
  the world starts, `/ready` warns and stays ready, and the process MAY then crash on replay. That is
  an operator decision, and the log line says so.
- A census that could not be TAKEN is not a refusal. The read fails open: the world starts and
  `/ready` reports it as unmeasured with a sanitized code.

The fix for a refusal is the same as for a refused preflight: release an image that carries those
bodies (a compatibility build), or drain them. `node packages/runtime/scripts/rollback-preflight.mjs`
answers the same question before you deploy, which is the cheaper place to learn it.

**Blast radius (owner-confirmed 2026-09-15, #793).** The refusal is database-WIDE, not process- or
lane-scoped: any non-terminal run of an unexported body — left by another lane, an interrupted
test, or a killed rig fixture — refuses every later runtime process that starts against that same
database, until the body is retired or `CLARA_ALLOW_STRANDED_BODIES=1` is set. In CI, every leg
sharing one database is one interrupted leg away from poisoning the rest of that job — measured,
not predicted: `db-live-gates` ran its Wave-B e2es against `clara_wave_b_ci`, they all passed, and a
parked `claraWork_v2` run one of them left behind then refused the two-build drill outright (run
34793833626). The two legs that cannot tolerate another's parked run — the two-build drill and this
guard's own cells — therefore run on `clara_rt_test`, a template copy of `clara_wave_b_ci` cut
before any e2e touches it, and the drill retires everything it parks so the guard inherits a clean
estate. This is the accepted ruling working as designed, not a bug; the owner confirmed the database-wide
scope as the standing tradeoff on 2026-09-15 (#793). Narrowing it per lane is #792's park-and-warn
shape, not a change to this guard.

<!-- #792 -->
### Why the boot census is the ONLY guard: the kernel has no per-run park (#792)

**Pins this was measured against** (`packages/runtime/package.json` + `pnpm-lock.yaml`): `workflow`
4.8.4 (bringing `@workflow/core` 4.8.4), `@workflow/world-postgres` 4.3.4, `@workflow/world` 4.4.0,
`@workflow/errors` 4.2.1. No vendor file is patched and no pin is bumped.

**There is no per-run park/hold primitive, and that is structural rather than an omission.**
`WorkflowRunStatusSchema` (`@workflow/world/dist/runs.d.ts`) is exactly
`pending | running | completed | failed | cancelled` — there is no held state to move a run into.
The `Storage` interface (`@workflow/world/dist/interfaces.d.ts`) exposes `runs` as `get`/`list`
only, so a caller cannot write a run row at all; `events.create` is the entire per-run mutation
surface, and every event it accepts either advances the run or terminates it. The only run-scoped
verbs the `workflow` package re-exports are `Run#cancel()` and `Run#wakeUp()`
(`@workflow/core/dist/runtime/run.d.ts`). Cancelling is not parking, and there is nothing else.

**What the pinned core does with a `ReplayDivergenceError` it can see.** `@workflow/core`
`dist/runtime.js:580-607` catches it inside the invocation, queues up to
`REPLAY_DIVERGENCE_MAX_RETRIES` (3, `dist/runtime/constants.js:62`) recovery replays for that one
run, then converts it to a `CorruptedEventLogError` and fails **that run** through a `run_failed`
event. The process is never at risk on that path — the vendor's own comment on the adjacent retry
arm says redelivery avoids "killing the process via run_failed".

**And a post-boot divergence CAN still end the process — by the OTHER fatal path.** Measured on a
local rig on 2026-09-15, not inferred: a `chatTurn_v19` turn was parked under the full image, that
image was stopped, and the chatTurn scratch image (which does not export `chatTurn_v19`) was booted
with `CLARA_ALLOW_STRANDED_BODIES=1`. The sequence was:

1. the boot census saw the stranded body and the override let the world start
   (`stranded bodies n=1 names=chatTurn_v19 — OVERRIDDEN by CLARA_ALLOW_STRANDED_BODIES=1`);
2. `durable world started pid=…` — so `getWorld().start()` RETURNED, as it always does.
   world-postgres's `start()` migrates the graphile schema and calls `reenqueueActiveRuns`
   (`@workflow/world-postgres/dist/index.js:45-47`); the replay itself happens later, inside a
   graphile-worker task. **`plugins/startWorld.ts`'s world-start `catch` is therefore not reachable
   by a replay error at all** — it can only see a failure of `start()` itself;
3. the replay raised `WorkflowNotRegisteredError`, the core caught it, classified it `RUNTIME_ERROR`
   and failed the run — the run row went to `failed` and the chat task settled `internal`;
4. **and then, on a timer, an unhandled `ReplayDivergenceError`.** `EventsConsumer`'s deferred
   unconsumed-event check (`@workflow/core/dist/events-consumer.js`: `handleUnconsumed` →
   `setTimeout` → `onUnconsumedEvent`) fires AFTER the invocation has already rejected, and rejects
   `workflowDiscontinuation` (`dist/workflow.js:100`) — a promise nothing is racing any more. It
   surfaces as a process-level unhandled rejection from `Timeout._onTimeout`, and
   `scripts/serve.mjs`'s crash-only `unhandledRejection` handler exits 1.

So the attribution above was right and the ticket's implied mechanism was not: **the fatal path is
`serve.mjs`'s crash-only handler, never the world-start catch.** Note what the measurement also
shows about the blast radius: the run was already `failed` before the process died, so the restart
after it inherits a clean census. A true loop needs a stranded run the engine cannot drive terminal
first — which is why "MAY crash on replay" is the honest wording on the override, and why the
census refuses by default rather than warning.

**Why a park-and-warn could not be built here.** The throw has no Clara call frame to be caught in:
it arrives at `process.on("unhandledRejection")`, outside every `try` in this repo and outside the
vendor's own invocation. `ReplayDivergenceError.is()` is a name-based duck check
(`@workflow/errors/dist/index.js:267`) and would be reachable without a new dependency pin — but
there is nowhere to apply it that would park anything: the error carries only `eventId`, never a
`runId`, and by the time it fires the core has already driven the run to `failed`. De-fataling it in
`serve.mjs` would weaken the crash-only posture at the PROCESS level while parking no run. The
missing primitive is upstream — a per-run hold state on the World contract, or a divergence hook
carrying the `runId` — and filing that request is the owner's call, not this repo's.

**Vocabulary.** A "parked" run in this repo's glossary is one waiting on its body or its hook —
normal, expected, and what the two-build drill measures. #792's "park-and-warn" would have been a
different thing: an operator-triage hold. Nothing in the pinned kernel can express it.

**So the guard stays where it is.** The boot-time stranded-body census (`censusStrandedBodies()` in
`plugins/startWorld.ts`, `strandedBodyCensusOnWorld` in `lib/rollback-preflight.mjs`) and the
rollback preflight remain the whole defence, and `tests/body-census-guard-db.test.mjs` remains their
proof.
<!-- /#792 -->

## Deployment and rollback

The image builds and runs on Node 22 (`node:22-bookworm-slim`, both stages), the same line as
`.nvmrc`, the root `engines` range and CI. Node 20 is end-of-life; an image built from an older
base is not a supported rollback target for the Node line itself, only for the code it carries.

The current Fly configuration is one always-on machine with a disposable intake spool.
Additional machines/HA require a deliberate deployment design and connection-budget review.

This order is not universal: read the migration's own header before sequencing it. A migration
whose new behavior depends on a consumer already understanding an event inverts steps 1 and 3.
[`0177_classify_after_extraction.sql`](../db/migrations/0177_classify_after_extraction.sql) states
that dependency: release the non-frozen `facts_gate` consumer image first, quiesce writers, then
apply the migration, so an event emitted during rollout cannot be checkpointed as irrelevant and
leave the document waiting forever. Its rollback mirrors the same dependency: a new append-only
recovery migration restores the prior body while that consumer stays live, and only then does the
consumer roll back. #606 shipped in that consumer-first order.

`GET /api/documents/:id/bytes` takes the ORDINARY order and depends on it: it calls
`clara.get_document_for_human_read_v2`, which
[`0190_document_byte_door_v2.sql`](../db/migrations/0190_document_byte_door_v2.sql) adds, so that
migration must be applied before this image is released. The migration replaces no live body and
adds nothing any deployed image calls, so it is safe to apply ahead of the release and needs no
writer quiescence of its own. Rolling the image back is safe with 0190 still applied: the previous
image calls `clara.get_document_for_human_read` (v1), which 0190 leaves byte-identical and still
granted to `clara_runtime` — and which `lib/seeding-parse.mjs` still calls today, so v1 is not
retired by this change.

1. Apply required database changes with the [database deployment contract](../db/README.md).
   For a fresh engine only, run the installed `bootstrap` CLI against the intended session
   connection. Do not bootstrap over restored engine state without checking its journal.
2. Configure required login DSNs, model/auth/storage secrets, and the encrypted spool volume.
3. From the repository root, build and push the runtime image, record its immutable identity,
   then release that same image after verification:

```sh
fly deploy --config packages/runtime/fly.toml --build-only --push
fly deploy --config packages/runtime/fly.toml --image <verified-image-reference>
```

4. Check health/readiness, all configured pool probes, build identity, a chat turn, SSE
   detach/reattach, and interview clarification resume. Verify that the deployed web reader
   supports the runtime's emitted parts; same-commit CI parity does not prove rollout order.

The supervisor stops new requests, drains HTTP, then stops its components. After a hard restart,
inspect lingering sessions from the old machine if the replacement cannot connect; terminate
only positively identified stale runtime sessions after confirming the old process is gone.

Frozen workflows and their relative-import closures are hash-checked. Behavioral changes need a
successor version and registry repoint. Retain old exports while non-terminal runs reference them.

<!-- #815 -->
Which modules a given frozen entry locks is no longer prose you have to trust: run `node
scripts/check-frozen-workflows.mjs --print-closure` to see, per `@frozen` entry file, the modules
its own transitive relative-import closure hash-locks (static **and** dynamic imports). Read it
before editing anything under `packages/runtime/lib/` — `lib/work-trace.mjs` is reached from
`claraWork.v3.impl.ts` only through `await import(...)`, and `lib/capability-registry.mjs` only
transitively through `lib/work-trace.mjs`, so neither looks frozen from the file itself.

**Owner ruling (2026-09-15).** A redaction hardening to `lib/work-trace.mjs` goes through a **v4
closure** — a new `claraWork_v4` and its own new frozen files — never an in-place edit to the
frozen file. The same rule holds for every other module the closure report attributes to a frozen
entry. The ruling is recorded here; no hardening is implemented by it.
<!-- /#815 -->

<!-- #810 -->
A RETIRED body does not vanish from the ledger: its manifest entry moves to the top-level `retired`
record in `frozen-workflows.json` (path → the entry's last frozen `sha256` + the ruling that
authorised it), which is the only absence `MISSING` and `REMOVED-VS-BASE` accept — and a retired
path still present in the tree is its own finding, `RETIRED-PRESENT`. The first such retirement is
`chatTurn_v1`'s three-file closure (#810, owner ruling 2026-09-15; beta only, runs parked on the
body cancelled in the hosted cleanup first).
<!-- /#810 -->

### The rollback preflight is a command, and it is a required step

Run it **before** `fly deploy --image <previous>`, never after:

```sh
# Strongest form: scan the TARGET image's own built bundle for the WDK body directives it registers.
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <path-to-target>/.output/server/index.mjs

# Or take the target's own answer about itself, through a scoped session.
curl -fsS -H "authorization: Bearer $JWT" "$BASE/api/build-info" \
  | node packages/runtime/scripts/rollback-preflight.mjs --target-build-info -

# Narrow it (a shared rig, a single lane) — explicit, and the output says it was narrowed.
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <path> --scope-name claraWork
```

Exit **0** allowed, **1** REFUSED with the offending body names, **2** could not answer. Two and
one are deliberately distinct: a deploy script that treats "I refuse" and "I could not look" the
same will eventually ship on the second one. The database target comes from the environment only
(`DATABASE_URL` / `WORKFLOW_POSTGRES_URL`, else libpq `PG*`), and a split between two present
sources fails closed.

It counts **three** things, because it is three questions. The third is the DATABASE's own vote,
and it is the one no census can see: from `0195_work_egress_purpose_and_execution_trace` on, a
target that does not carry `claraWork_v3` is REFUSED with reason `frontier_requires_body`,
however clean the estate is — 0195's posting core requires a consumed `accounting_work` egress
authorisation, no other body can obtain one, and 0195 grandfathers pre-v3 bundles past that wall,
so a pre-v3 image would run the whole Work lane with the wall in force and nothing subject to it.
The rule table lives in `lib/rollback-preflight.mjs` (`FRONTIER_BODY_RULES`), it is global — no
`--scope` clears it — and it is not drainable: ship a target that carries the named body.

The other two are the censuses. Non-terminal `workflow.workflow_runs`,
grouped by name with the parked body derived from the row itself; **and** live tasks bound to NO
run, across both tables that carry that shape. The second is invisible to a run census by
construction — a task exists from the moment its admission commits and the run only exists once a
worker claims it — so a run census alone reports a clean estate while admitted work waits for a body
the target does not carry.

That second census covers **every** kind whose task can become a run, not only `accounting_work`:

| Row | Class it needs | How that class is decided |
|---|---|---|
| `clara.agent_tasks` `chat_turn` / `autodraft` / `accounting_work` | `chatTurn` / `autoDraft` / `claraWork` | statically, from the registry-resolved enqueue deps in `plugins/startWorld.ts` |
| `clara.agent_tasks` `wake` / `close_prep` | whatever `clara.wake_engine_sources.workflow_export` says | READ from the database per row, the way `lib/wake-engine.mjs` dispatches it (by the originating event's type for `wake`, by `task_kind` for the `direct_queue` carrier) |
| `clara.document_processing_tasks` (7 lanes) | `documentIngest` / `invoiceFacts` / `statementFacts` / `witnessFacts` | the same allowlist `reconciler-documents.mjs` enqueues by |
| `clara.document_processing_tasks` `classify` / `local_facts` | none | they ride a consumer loop; named explicitly so they are not mistaken for unknown lanes |

`held` counts as live: a wake task is BORN held and only becomes `running` when the engine claims it,
so a `queued/running` census would miss every wake task waiting for its source. `cancel_requested`
does not: the reconciler settles an unbound one without starting any body. The kind, lane and status
vocabularies are checked against the relations' own CHECK constraints by
`tests/rollback-preflight.test.mjs`, so a migration that adds one reds a test instead of quietly
falling outside a census that advertises itself as complete.

**A kind or lane this command cannot place fails CLOSED** — it counts as stranding. The case you
will actually meet is a `held` wake task whose source row was deleted: it is already unrunnable (the
reconciler logs it and waits), and the answer is to settle it or re-register its source, not to roll
back past it. `--scope` narrows the REPORT; it never narrows the exit code.

**A refusal has exactly two admissible answers, and elapsed time is neither.**

1. **Retain every non-terminal bundle.** Ship a compatibility build that still exports the bodies
   live runs are parked on while new admission points at the previous version. The preflight then
   allows because the target genuinely carries them.
2. **Verified drain.** Let the parked runs settle and re-run the preflight until it allows. A
   verdict from ten minutes ago is not a drain; the census tracks live state, which is why it is
   cheap to re-run.

**A rollback to an image missing a parked body is worse than "the lane parks."** Measured while
building the two-build drill (#637): an engine that boots against a non-terminal run whose body it
does not export raised `ReplayDivergenceError` on the re-enqueue, and the crash-only supervisor
exited 1 — a crash loop under Fly, not a quiet park. That is why the preflight is a gate and not a
note. Rollback POINTS are an input to this decision, not a substitute for it: knowing which image
you would go back to tells you which bundle to scan, nothing more.
<!-- #792 -->
That exit was re-measured end to end on 2026-09-15 and the mechanism is now written down rather
than inferred — including which of the two fatal paths carries it, and why the kernel at these pins
cannot park the run instead. See *Why the boot census is the ONLY guard* above (#792).
<!-- /#792 -->

`tests/two-build-cutover-e2e.mjs` is the executable proof of the whole shape — it builds a
predecessor image, admits Work to it, stops it, releases this tree's build, admits Work to the
successor, and resumes the first Work on its ORIGINAL body inside the second image, with two
distinct bundle digests and one receipt each. It is wired into the per-PR `db-live-gates` job.
<!-- #794 -->
**Since #794 it has a SECOND leg, on the lane that has no Work row.** The same file builds a second
scratch image with `className: "chatTurn"` and its own scratch-image `name`, derives
`chatTurn_v18 -> chatTurn_v19` from `registry.ts` exactly as it derives the claraWork pair (no
version literal appears in the leg, so a later v19 -> v20 repoint needs no edit), starts a chat turn
on the predecessor image and parks it on a CHAT CLARIFICATION through `clara.open_interruption` —
not `clara.admit_journal_work`, and not a typed Work question, because chatTurn has no
`clara.accounting_work` row to resume through. The predecessor image is then stopped, this tree's
build serves, and the clarification is answered through `clara.answer_interruption`: the SUCCESSOR
image's own class-agnostic delivery lane (`deliverInterruptions`, `lib/control.mjs`) resumes a hook
the PREDECESSOR opened. Because chatTurn mints no bundle, the "stayed bound to the body it started
under" proof is the run's own body identifier (`bodyIdentifierOf` over
`workflow.workflow_runs.name`) plus the successor's `/api/build-info` roster showing the RETAINED
predecessor, rather than a receipt's bundle digest. Both legs share one set of doors — bundle gate,
inventory gate, stop-A-before-B, lengthened reconcile grace, per-image boot lines, cleanup on every
exit path — and the leg has its own skip probe over `clara.open_interruption` /
`clara.answer_interruption`. Local evidence 2026-09-15: both legs green in one run; hosted evidence
pending.
<!-- /#794 -->

### #623 — the accounting-Work lane (`claraWork_v1`, `chatTurn_v18`)

This image adds one workflow CLASS (`claraWork`) and repoints `chatTurn:` to v18. Both halves call
database verbs that arrive with migration **0178**, so the order is owed in one direction and is
not optional: **apply 0178 before releasing this image.** Against a pre-0178 database the failure
is contained rather than corrupting — the chat tool returns a typed refusal and a Work run settles
`failed` with a named invariant, posting nothing — but Clara refuses the thing it just offered to
do. The reverse order is free: 0178 against a pre-#623 image adds tables and verbs nothing calls.

Rollback is NOT symmetric here, and the runbook should say so plainly. A rollback to a
`claraWork`-less image leaves already-admitted `clara.accounting_work` rows with queued
`accounting_work` tasks that no export can run. Nothing is LOST — those Works resume when a
`claraWork`-carrying image returns — but "the lane parks" was too kind about the process: if any of
those Works has reached a RUN, the rolled-back image's engine crashes on the replay, which is why
#637 made the boot census a refusal and the preflight a gate. Inventory them before you roll back
(`scripts/rollback-preflight.mjs` does both censuses), and expect `clara.agent_tasks` rows of kind
`accounting_work` in `queued`/`running` alongside the runs.

Build identity gained a `bundles` field: `GET /api/build-info` serves `{id, digest, instructions,
skills, tools, budgets}` for `clara-work/v1`, and the process logs the same digest once at world
start (`[clara-runtime] bundle clara-work/v1 digest=<sha256>`). Those two and the `bundle.digest`
column on every `clara.accounting_work` row are the three places the serving bundle can be read;
a deploy check should see the same hex in all three.

The frozen manifest ceremony for that change has since RUN: all 264 manifest entries carry
`deployed: true` (verified against `frozen-workflows.json` at the #637 commit). The ceremony
itself is unchanged and still owed by every NEW closure: run
`node scripts/check-frozen-workflows.mjs --lock-deployed` and commit the manifest **after** the
image is live — locking before deploy would freeze a body that no parked run can yet exist for.

#637 adds no frozen closure and no migration. What it adds is the preflight above, the provenance
boot line, `bodies`/`pins` on `/api/build-info`, the boot-time stranded-body census that REFUSES to
start the world (with `CLARA_ALLOW_STRANDED_BODIES=1` as the operator override) and reports itself at
`checks.bodies`, and the two-build drill. The HOSTED half — two releases and one deliberate rollback on Fly — is a production
ceremony the owner schedules; docs/PROGRESS.md carries the exact step order. Hosted evidence for
#637 is pending.

[Fly build and deploy behavior](https://www.fly.io/docs/blueprints/working-with-docker/)

### #647 — `lib/counterparty-identity.ts`, a contract carrier that ships no tool

`packages/runtime/lib/counterparty-identity.ts` is the zod input schema, door-argument builder and
refusal map for a `record_counterparty_alias` chat tool that **does not exist in this image**. The
owner ruling this wave (`docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md`, D11) is that
migration `0215` ships identity PROVENANCE only: every identity door is granted to
`clara_authenticated` and to no machine role, so no workflow class can call one and no successor was
cut for it. The module exists so the contract was reviewed rather than improvised, and it is covered
standalone by `tests/counterparty-identity-unit.test.mjs`.

Read its foot before wiring it. The rule it records is the one
`lib/periodic-adjustment-basis.ts` learned the hard way: **a module is non-frozen only until a
successor imports it, and then it is hash-locked forever** — `periodic-adjustment-basis.ts` carries
`deployed: true` in `frozen-workflows.json` by closure alone, because `chatTurn_v19` imports it.
`lib/counterparty-identity.ts` is outside every closure today (`node
scripts/check-frozen-workflows.mjs` from the repository root is the check), and the day a successor
imports it that stops being true. The wave 2026-09-15 cut is the worked example in both directions:
it imported `lib/staff-expense-claim-basis.ts`, `lib/accrual-basis.ts`,
`lib/fixed-asset-acquisition.ts` and the new `lib/knowledge-conflicts.mjs` — all four are now
manifest entries, hash-locked against `origin/main` by closure alone, and the deploy ceremony
(`--lock-deployed`, never `--update`) is what later stamps them `deployed: true` — and deliberately
did NOT import `lib/prepayment-schedule-basis.ts` or `lib/counterparty-identity.ts`, because neither
of their doors is reachable from a machine role — freezing a module before its door exists would make
it correctable only by superseding it.

One thing that wiring will need and that this repository does not have: `clara.add_counterparty_alias`
is `_human_ctx`-fronted and refuses `origin='agent_proposed'` outright, so an agent lane needs a new
OBO sibling door in the `clara.capture_knowledge_for` shape (actor-explicit, `clara_runtime`-granted,
verifying the named human's live membership itself) before the tool can be registered. No
`clara.wake_fn_allowlist` row is owed or wanted: that allowlist is keyed by BARE NAME, so a row for
this name would widen wake reach over the human door as well.

### #639 — the dependent depreciation-particulars question (`lib/fixed-asset-acquisition.ts`)

An acquisition posts the instant its facts suffice; the depreciation particulars may be missing,
and then ONE dependent, versioned question parks the same Work until a human answers it. Opening
that question from a run is a FROZEN act (`claraWork.v3.tools.ts`'s `ask_question` carries no
`execute` — the workflow body opens it), so the tool itself ships in the wave's single shared
`claraWork_v4` cut. Everything that tool needs which is NOT the frozen body lives in
`lib/fixed-asset-acquisition.ts`, tested on its own by `tests/fixed-asset-acquisition-unit.test.mjs`:

* `FA_PARTICULARS_FIELDS` — the `p_fields` array `clara.open_work_question` validates and every
  answering surface renders. Only `method` and `start_date` are required: an in-service date is
  required for EVERY method including `none`, and the drivers only for the method that uses them.
* `faParticularsAnswerSchema` — the CLOSED key set `clara._fa_validate_particulars` admits,
  `.strict()`, so a key the database would refuse cannot travel.
* `particularsFromAnswer` — the `p_particulars` jsonb in the database's own spelling.
* `refusalFieldForAxis` / `localParticularsRefusal` — the CLR37 axis → CONTROL map and the earlier,
  more legible half of a validation the database owns. Every check mirrors one 0041/0216 enforces.

Nothing frozen imports this module today, so it is not in `frozen-workflows.json`. The moment
`claraWork.v4.tools.ts` imports it, `scripts/check-frozen-workflows.mjs`'s IMPORT-ESCAPE hash-locks
it with the closure — the intended trajectory, and why its schema is written to be final.

`tests/fixed-asset-acquisition-e2e.mjs` is the standalone World leg (see **Standalone e2es**):
an acquisition into an enrolled fixed-asset cost account commits through `/api/work/journal` with
its register row in the SAME transaction, a replayed intentKey births no twin, a crash between the
database commit and the workflow checkpoint leaves the register row standing and the respawned
engine returns the SAME asset id, and the runtime particulars door refuses a demoted initiator by
name while writing no journal when it succeeds. It skips cleanly below migration 0216.

## Evaluation

[Classifier fixtures](tests/fixtures/classify/README.md) explain the recall harness.
Its synthetic mode tests scoring, not model accuracy. In-image harness dependencies and field
re-verification remain open; a prompt comparison does not close an ingestion-ordering defect.
The classify-before-OCR race itself is closed (#606): migration
`0177_classify_after_extraction.sql` makes a NULL-kind document's facts enqueue return
`awaiting_extraction` until a `done` OCR/structured-parse extraction exists, and the `facts_gate`
consumer re-enters that enqueue on `document.extraction_completed` as well as
`document.classified`.

### `tests/intake-admission-e2e.mjs` (#633)

The real-Postgres-World proof that a file reaches the WORK ADMISSION DOOR with no human
pressing anything. It starts where `intake-e2e.mjs` stops: that one owns the transport
(CORS, the streaming PUT, the token lock, the upload capability never crossing workflow
step IO); this one owns the chain AFTER the bytes are read.

Seven legs. **Leg 1** has three arms and ZERO `clara.request_autodraft` anywhere in the
automatic lane — asserted from the source of `intake.mjs`, `intake-lanes.mjs`,
`intake-recovery.mjs`, `autodraft.mjs`, `facts-gate.mjs` and `intakeRoutes.ts`, with a
control proving the door exists (it is #614's RECOVERY act, not a gate):

* **(a) the control.** An UNFILED upload's classify task settles `failed` with the
  estate's own `firm_narrow_consent_inactive` (0123's pre-attribution branch) and invents
  no kind. Before fix round 1 this was the ONLY thing that ever happened on this fixture,
  while leg 1's poll predicate (`row !== null`) passed on it anyway.
* **(b) the consented chain.** With the client's `document_processing` consent granted
  through the real governed verbs and the document filed the way the browser's queue files
  it, the chain runs ingest → extraction `done` → classify `done` → `document_kind` set
  → `document.classified`, with no human act in it.
* **(c) the admission door.** A real MyInvois UBL invoice runs upload → `structured_parse`
  → `local_facts` `done` → `document.invoice_facts_completed` → the autodraft consumer
  calling `clara.admit_autodraft_task` for that document's live filing, inside a sweep run
  it opened itself (origin `sweep`; the door's own CLR10 makes a run-bound `one_click`
  impossible). The door's verdict is read back and printed VERBATIM.

**Residual, named.** Arm (c) proves the door is REACHED, not that a coding task is
admitted: `_coding_lane_core` refuses this fixture's document (`tier_a_fails`,
`direction_unresolved`, `vendor_unresolved`, `no_consent` — measured on clara_633) and
routes it to `needs_you`. A Tier-A-complete document needs counterparty resolution, a
resolved direction and coding consent — the autodraft lane's own fixture, not this one's.

Legs 2–7: (2) a failed extraction yields `awaiting_extraction` and never a kind (0177's
router); (3) duplicate bytes adopt onto the EXISTING document while the same name with
different bytes stays distinct (identity is the sha256, `0003:76`); (4) a mixed five-file
batch at the client's own CONCURRENCY of 2 settles each file independently, plus a burst
beyond the runtime's upload ceiling refused 429 PER ITEM; (5) a replayed finalize leaves
exactly one document and one ingest task; (6) H-53 — a `consent_evidence` born on this
route keeps custody and never enters the coding lane; (7) C-37 — a real OFX (lane `none`,
store-only at intake for `intake-lanes.mjs:45-51`'s reason, not for the retired "no OFX
reader" one) and a REAL XLSX (built in the file as a stored-entry ZIP with a genuine
central directory — fix round 1: the previous `PK\x03\x04` stub was quarantined on every
run while the leg printed "admitted"), with the levels `clara.document_capabilities`
actually publishes.

Standalone, like `intake-e2e.mjs` — not collected by `node --test`. Wired in
`.github/actions/db-live-gates/action.yml` as its own step, reusing the same throwaway
database and bootstrapped world the Slice-5 step just built.

NAMED RESIDUAL: leg 5 proves the LOST-FINALIZE-RESPONSE convergence, not a SIGKILL
between finalize and checkpoint. This file boots the runtime in-process (as
`intake-e2e.mjs` does) so it can inject the OCR fixture; a true SIGKILL variant needs the
spawned-engine shape `interview-kill-resume-e2e.mjs` uses.
<!-- #811 -->
## Requirements carried by the next frozen `claraWork` version (was `claraWork_v4`; it took neither)

`packages/runtime/lib/work-trace.mjs` is inside `claraWork_v3`'s frozen closure and hash-locked in
`frozen-workflows.json`; a comment edit breaks that lock exactly as a code edit does. The owner's
standing ruling (docs/ARCHITECTURE.md §5.E, #815) is that any hardening of that module ships with
the next frozen version rather than in place. This list is where such a requirement is recorded
until that version is cut.

- **#811 — bound an `observed_revisions` numeric value at the writer.** `traceRevisionOf` returns
  any finite JS number, so `observedRevisions({books_version: 5141882293107742})` conforms an
  account-run-shaped number rather than dropping it. Migration
  `0210_work_trace_shape_bounds.sql` closes this AT THE DOOR
  (`clara._work_trace_revisions_ok`: `abs(v) < 1e12 and scale(v) <= 6`, a CLR10 `invalid_trace`
  naming `p_observed_revisions`). `claraWork_v4` should mirror that bound in `traceRevisionOf`, so
  the ordinary path DROPS the value instead of meeting the wall — the same asymmetry every other
  conformer already has.
- **#811 — apply the `run` grammar at the writer.** `traceRunOf` exists and is exported, but
  `recordTrace` sends `runId` UNCONFORMED (deliberately: a mangled run id would break the
  `(work_id, run_id, seq)` replay identity), and a door refusal is swallowed by the frozen
  closure's `traceSafely` / `traceSafelyInTransaction` wrappers. 0210 gives the `run` kind a
  long-digit clause (13+ consecutive digits, unless the id is exactly `wrun_` plus a 26-character
  Crockford base32 ULID — the shape `@workflow/core` 4.8.4 mints at
  `dist/runtime/start.js:121`). `claraWork_v4` should either conform the run id it sends or
  surface the refusal, because today a run bound that is too tight loses trace rows silently
  rather than raising. Whichever it does, the writer's clause must stay NO TIGHTER than the door's.

Until a version takes them, the honest sentence about both fields is: the DOOR bounds them in
shape; the WRITER does not, and the door is the wall. **`claraWork_v4` was cut in the wave
2026-09-15 integration and took NEITHER requirement** — it only feeds `knowledge_version` into
the existing `observed` object (`claraWork.v4.impl.ts`). Both rows above therefore carry
forward to the next frozen `claraWork` version, unchanged.
<!-- #811 -->

## #655 — the trade-invoice lane, and the `chatTurn_v21` contract it hands over

`POST /api/work/trade-invoice` (`src/workRoutes.ts`) is the **FOURTH** sibling of
`/api/work/journal`, `/api/work/periodic-adjustment` and `/api/work/staff-expense-claim`, never a
widened version of any of them. It takes **two** payloads where #638's claim door takes one
(`invoice` and `basis`), because a trade invoice's journal is not derivable from its particulars:
which expense account a bill debits is a coding judgement, not an arithmetic one. Both the human
form and, later, the v21 chat tool post through it, which is what makes ONE `clara_runtime` door
the whole lane's admission. Its 202 carries `invoice_id`, the RESOLVED `counterparty_id` and the
**derived** `due_date` / `due_date_source` — four facts the browser could not have computed.

`lib/trade-invoice-basis.ts` is a **NEW non-frozen module**, and it is non-frozen only until
`chatTurn_v21` imports it: `scripts/check-frozen-workflows.mjs` freezes the transitive relative-
import closure of every frozen workflow, so at the cut every byte of it is hash-locked — exactly
what happened to `lib/periodic-adjustment-basis.ts` at v19 and `lib/staff-expense-claim-basis.ts`
at v20. **Which is why every durable rule lives in migration 0225 and none lives here.** The module
carries the `.strict()` schema, the two builders, the local refusal mapper (the door's own fifteen
tokens, as messages) and a DISPLAY helper that names the domain and the item kind without naming a
chart account — it has no chart. It carries **no object spread anywhere**, because
`scripts/check-parts-parity.mjs` refuses one ("unclassifiable object spread") in any module it
walks, and this module enters that walk at the cut; measured — the guard refused an earlier draft.

**The successor contract this lane hands over** is written in full at the foot of that module: the
tool name, the `.strict()` input schema, the door call with its argument order FIXED, the
deterministic op key, the fifteen-token refusal map, the existing `work_accepted` part with **no**
`WORK_ACCEPTED_PURPOSES` widening (a trade invoice is a `journal_entry`-purpose Work, exactly as
#638's claim is), and the prompt stanza's "I've queued it" posture. Nothing is added to
`claraWork_v4`: an ambiguous counterparty is refused AT ADMISSION precisely so no new mid-run
question shape is needed, and a fact discovered mid-run goes through that body's existing
`ASK_QUESTION_TOOL`.

`tests/trade-invoice-e2e.mjs` is the World leg, and it is the ONLY place the thing this ticket is
really about can be shown: the signed AR/AP open item is minted by a DEFERRED constraint trigger AT
COMMIT, so the entry, the receipt, the `trade_invoices` row and the item are one transaction — and
all four survive an `exit_after_commit` crash and a respawn as ONE of each. It also proves the
due-date basis end to end: the browser sent `absent`, the door answered `counterparty_terms` and
stamped `posting_date + payment_terms_days` on the item. It SKIPS CLEANLY when 0225 is absent.
