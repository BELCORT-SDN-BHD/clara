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

This is a general rule, not per-file guidance: none of the five standalone e2es
(`tests/interview-e2e.mjs`, `tests/version-cutover-e2e.mjs`, `tests/work-journal-e2e.mjs`,
`tests/work-question-e2e.mjs`, `tests/work-cancel-e2e.mjs`) may share a host with another suite
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
[clara-runtime] serving git_sha=<sha> frontier=<version>(<count>) bodies=<n> pins chatTurn=chatTurn_v19 claraWork=claraWork_v3 …
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

`tests/two-build-cutover-e2e.mjs` is the executable proof of the whole shape — it builds a
predecessor image, admits Work to it, stops it, releases this tree's build, admits Work to the
successor, and resumes the first Work on its ORIGINAL body inside the second image, with two
distinct bundle digests and one receipt each. It is wired into the per-PR `db-live-gates` job.

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
migration `0200` ships identity PROVENANCE only: every identity door is granted to
`clara_authenticated` and to no machine role, so no workflow class can call one and no successor was
cut for it. The module exists so the contract was reviewed rather than improvised, and it is covered
standalone by `tests/counterparty-identity-unit.test.mjs`.

Read its foot before wiring it. The rule it records is the one
`lib/periodic-adjustment-basis.ts` learned the hard way: **a module is non-frozen only until a
successor imports it, and then it is hash-locked forever** — `periodic-adjustment-basis.ts` carries
`deployed: true` in `frozen-workflows.json` by closure alone, because `chatTurn_v19` imports it.
`lib/counterparty-identity.ts` is outside every closure today (`node
scripts/check-frozen-workflows.mjs` from the repository root is the check), and the day a successor
imports it that stops being true.

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
  more legible half of a validation the database owns. Every check mirrors one 0041/0201 enforces.

Nothing frozen imports this module today, so it is not in `frozen-workflows.json`. The moment
`claraWork.v4.tools.ts` imports it, `scripts/check-frozen-workflows.mjs`'s IMPORT-ESCAPE hash-locks
it with the closure — the intended trajectory, and why its schema is written to be final.

`tests/fixed-asset-acquisition-e2e.mjs` is the standalone World leg (see **Standalone e2es**):
an acquisition into an enrolled fixed-asset cost account commits through `/api/work/journal` with
its register row in the SAME transaction, a replayed intentKey births no twin, a crash between the
database commit and the workflow checkpoint leaves the register row standing and the respawned
engine returns the SAME asset id, and the runtime particulars door refuses a demoted initiator by
name while writing no journal when it succeeds. It skips cleanly below migration 0201.

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
