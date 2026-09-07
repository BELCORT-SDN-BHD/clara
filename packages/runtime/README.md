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

`GET /health` is dependency-free liveness. `GET /ready` fails on database/runtime-lane failure,
dead required engine/control heartbeats, or taxonomy halt. Other lane failures, intake/storage
failures and queue lag currently warn. Pending/skipped lane probes are distinct from failures.
The per-lane results appear under `checks.pools`; background relay-pool errors are counted.

TLS is determined by each DSN. The image contains `/app/ops/tls/pooler-ca.crt`;
`lib/tls-ca.mjs` rejects malformed/expired/mismatched configured pins, but currently only warns
about absent pins or non-verifying modes. To activate verified TLS, deploy the image containing
the CA first, validate the server chain, then update the applicable DSNs with
`sslmode=verify-full&sslrootcert=/app/ops/tls/pooler-ca.crt` and re-probe every lane.
Shipping the certificate does not establish that live secrets use it.
[node-postgres SSL configuration](https://node-postgres.com/features/ssl)

Authenticated `GET /api/build-info` reports baked build identity, workflow names and the DB
migration frontier. Use this together with the actual Fly image and Worker version to establish
what is serving; local registry values alone cannot do that.

## Deployment and rollback

The current Fly configuration is one always-on machine with a disposable intake spool.
Additional machines/HA require a deliberate deployment design and connection-budget review.

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
Its synthetic mode tests scoring, not model accuracy. The classify-before-OCR race, in-image
harness dependencies, and field re-verification remain open; a prompt comparison does not close
an ingestion-ordering defect.
