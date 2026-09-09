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
objects, reads them back by hash, and commits custody. OCR supplies layout/text; the active invoice
and statement fact lanes use text/image witness pairs. CSV/OFX and structured-format paths have
different processing routes. Earlier workflow versions remain available for compatibility.

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
  this credential nor a signed Storage URL.
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
Before rollback, inventory non-terminal `workflow.workflow_runs` and verify the target image
contains every referenced workflow name/version. A rollback to an image missing a parked version
strands that run.

[Fly build and deploy behavior](https://www.fly.io/docs/blueprints/working-with-docker/)

## Evaluation

[Classifier fixtures](tests/fixtures/classify/README.md) explain the recall harness.
Its synthetic mode tests scoring, not model accuracy. In-image harness dependencies and field
re-verification remain open; a prompt comparison does not close an ingestion-ordering defect.
The classify-before-OCR race itself is closed (#606): migration
`0177_classify_after_extraction.sql` makes a NULL-kind document's facts enqueue return
`awaiting_extraction` until a `done` OCR/structured-parse extraction exists, and the `facts_gate`
consumer re-enters that enqueue on `document.extraction_completed` as well as
`document.classified`.
