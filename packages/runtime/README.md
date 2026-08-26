# @clara/runtime — the durable chat runtime (Slice 4)

The long-lived Node service that hosts Clara. **Slice 4 lands the durable chat
runtime** on top of the Slice-0 substrate: the read-only chat advisor
(`chatTurn_v1`), leased clarify, the outbox drain, the settle-reconciler, and a
crash-only supervisor. Authority: `docs/plan/completed/slice4-durable-runtime-contract.md`
v2.1; `docs/ARCHITECTURE.md` §4 + Appendix A; migration
`packages/db/migrations/0006_runtime_core.sql`.

## What is wired now

- **Durable substrate**: the Workflow DevKit Postgres world (`workflow` +
  `@workflow/world-postgres`, `ai@7.0.77`), built by Nitro with the
  `workflow/nitro` compiler module (Appendix A).
- **The chat loop** (`workflows/chatTurn.v11.ts` + its FROZEN closure
  `chatTurn.v11.impl.ts` / `chatTurn.v11.prompt.ts` / `chatTurn.v11.tools.ts`;
  the v1→v11 history follows Appendix A — v1–v10 stay frozen + reachable for
  parked runs): a coding-capable advisor with the `draft_journal_entry` write
  tool plus the four Wave-E authoring tools (metric preview/draft, report-spec
  draft, report preview — the last a named structural refusal until the OBO
  evaluator lane), streaming the model to the run's writable, reading the
  client context pack with a per-attempt wake credential (minted INSIDE the
  step, never crossing a step boundary), and parking on a hook when it needs a
  firm-visible clarify.
- **Two-login pools** (`lib/pools.mjs`): a `clara_runtime` pool + a read-only
  `clara_agent_ro` pool, txn-local GUCs, ROLLBACK-before-release,
  discard-on-any-connection-error (the P4 discipline).
- **Trusted-ingress authz** (`lib/authz.mjs`): pinned JWT + live-membership
  principal + own-OR-firm-shared session predicate (indistinguishable 404).
- **Control listener** (`lib/control.mjs`): leased clarify delivery + cancel
  settlement. **Leader loop** (`lib/leader.mjs`): routing + drain (`lib/drain.mjs`)
  + reconcile (`lib/reconciler.mjs`; the daily `clara.reconcile_autopost_rules()`
  sweep RETIRED with F-A2 PR-3, along with the rest of the rules-execution tier).
  **Consumer lanes**, each on its OWN dedicated connection + advisory lock:
  matcher (`lib/matcher.mjs`),
  autodraft (`lib/autodraft.mjs`), local_facts (`lib/local-facts.mjs`),
  sst_watch (`lib/sst-watch.mjs`), facts_gate
  (`lib/facts-gate.mjs`), classify (`lib/classify.mjs`) — plus the managed clamd
  scanner (`lib/scan.mjs`, no DB session). (The rule_post consumer, `lib/rule-post.mjs`,
  retired with F-A2 PR-3.) **Supervisor** (`scripts/serve.mjs`):
  one crash-only process group.
- **HTTP** (`src/index.ts`): chat sessions/messages/turns, an SSE stream that
  survives detach, and `/health` + `/ready` (fail-vs-warn matrix, §4.7).
- **Workflow-versioning**: `registry.ts` names the newest version enqueue sites
  target; the CI freeze-lint golden-hashes every frozen body + its import
  closure. Prompt + tools live INSIDE the frozen closure by design (§4.9).
- **Gate G1's universal wake-execution engine** (`lib/wake-engine.mjs` + `lib/reconciler-wake.mjs`,
  migration `0133`): registry-driven off `clara.wake_engine_sources`, consuming the existing
  wake allowlist unchanged; the sources table ships EMPTY pending F-A3 (`bank_agent`) and F-A4
  (`close_prep`) each inserting-and-flipping their own row.

## The world is OFF by default

`plugins/startWorld.ts` starts the embedded queue worker **only** when
`CLARA_START_WORLD=1`. Default OFF so booting the skeleton for a health/ready
check never attaches a worker to the durable engine — important while the shared
project may hold parked runs from the Slice-0 spike.

## Slice-5 document intake

The runtime owns the complete evidence-byte path: authenticated begin-intake,
backpressured byte streaming to the encrypted volume spool, magic/type/archive
checks, local ClamAV scanning, server SHA-256, immutable private Storage upload,
Storage download + re-hash, and the migration-0007 finalizer. The browser receives
only a short-lived upload capability; it never receives a Storage credential.

| Route | Authority | Body/result |
|---|---|---|
| `POST /api/intake/documents` | authenticated JWT + live membership | JSON begin; returns `intake_id`, `upload_token`, `expires_at` |
| `PUT /api/intake/documents/:id/bytes` | Bearer upload capability | raw `application/octet-stream`; streamed, global/principal concurrency 2 |
| `POST /api/intake/documents/:id/finalize` | Bearer upload capability | scan/store/readback/finalize; returns the committed receipt |

There is deliberately no runtime status route. Human status reads use migration
0007's masked PostgREST views and the authenticated JWT lane. CORS is confined to
`/api/intake/*` and accepts only exact origins from the allowlist below.

### Document environment contract

| Variable | Required behavior |
|---|---|
| `CLARA_INTAKE_CORS_ORIGINS` | Comma-separated exact browser origins; no wildcard and no effect outside `/api/intake/*`. |
| `CLARA_SPOOL_DIR` | Encrypted-volume spool path; Fly uses `/data/spool`. |
| `CLARA_SPOOL_QUOTA_MB` | Hard local spool admission quota; Fly default is `512`. |
| `CLARA_SPOOL_TTL_MIN` | Residue TTL; minimum effective value is 15 minutes so a live capability is never reaped (Fly default `60`). |
| `CLARA_CLAMD_SOCKET` | clamd Unix socket or `host:port`; required outside `RELAY_TEST_MODE=1`. |
| `CLARA_CLAMD_MANAGED` | `1` starts/supervises the image-local clamd and refreshes signatures. |
| `CLARA_FRESHCLAM_INTERVAL_MS` | Optional refresh interval; floor one hour, default six hours. |
| `CLARA_DOC_EGRESS_APPROVED` | OCR pre-dispatch gate; default/Fly value `0`. Set `1` only after the firm-wide egress evidence bundle is approved. |
| `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY` | Azure Document Intelligence service-layer credentials for `prebuilt-layout`, API `2024-11-30`; never workflow step IO. |
| `CLARA_STORAGE_URL` | Full private-bucket object base, for example the Storage REST `/storage/v1/object/<bucket>` base. |
| `CLARA_STORAGE_ROLE` | Exact dedicated custom role expected in the Storage JWT (`clara_storage_docs` at the ceremony); required outside tests. |
| `CLARA_STORAGE_ROLE_JWT` | Rotated, unexpired dedicated custom-role JWT with object `INSERT` + `SELECT` only. `anon`, `authenticated`, and `service_role` are rejected; no `UPDATE`/`DELETE`. |

`RELAY_TEST_MODE=1` is the only adapter gate: tests inject/localize scanner,
Storage, and Azure behavior. The real production adapters have no dev bypass.

The connection ceiling is **≈25 sessions** (one fewer since F-A2 PR-3 retired the
rule_post consumer lane; integrator must confirm Supavisor headroom before
deploy): runtime pool 5 + read
pool 5 + WDK engine 5 + control/router LISTEN 2 + the six consumer-lane leader
sessions (matcher, autodraft, local_facts, sst_watch, facts_gate,
classify) 6 + the write pool 2. Document
intake and extraction reuse short checkouts from the existing runtime pool; no DB
connection is held while streaming, scanning, uploading, downloading, or calling
Azure.

## Slice-6 coding floor (`chatTurn_v2` + the write floor + invoice facts)

`chatTurn_v2` (Slice 6) added the narrow WRITE capability. **TRUED 2026-08-26: the registry
(`registry.ts:54,88`) pins `chatTurn: chatTurn_v14` and `autoDraft: autoDraft_v9`** — repo
frontier is 131 migration files, live through `0136_fix_freeform_basis_types`. **The SERVING
Fly bundle, measured 2026-08-26 in-VM, still carries `chatTurn_v13` + `autoDraft_v9`** —
`chatTurn_v14` is registered but not yet deployed (`PROGRESS.md`'s pre-flight note). v1–v13
stay frozen + reachable for parked runs; v7 = Wave B's
`'wiki_coding'` pack purpose + the txn-local `clara.pack_consumer` GUC + the
citation-visible wiki framing; v8 = the Wave-C closing batch; v9 = the §7-A
PR-RUNTIME cut; **v10 = F9's cite-by-index cut** — evidence elements carry
`region_idx` and the SERVER resolves them to `region_id`, so a model-transcribed UUID can
no longer exist (`autoDraft_v7` is the same cut on the unattended side; both closures are
`deployed`-locked in `frozen-workflows.json`). registry.ts's inline comments carry the
per-version details. The model can **draft**
ONE journal entry per turn — a supplier bill, a sales invoice / sales credit note, or
a generic voucher-style `journal_entry` — always for a human to approve; it never
approves or posts (agent-never-signs, ADR-015). New in v2:
in-turn attachment perception (`read_document`), firm-scoped read tools
(`list_unassigned_documents`), the `draft_journal_entry` write tool, and the
`je_review` / `refusal` typed parts. Every read/write is wake-scoped **OBO the turn's
initiator** (`created_by`) so the coding capability rides that member's live
bookkeeper+ authority, never a firm-wide grant.

**The write floor** is a THIRD login + small write pool wired to the EXISTING
`wake_draft_entry` writer (no new grants, no new wake fn):

| Variable | Required behavior |
|---|---|
| `CLARA_WRITE_DATABASE_URL` | The `clara_wake_write_login` DSN (member of `clara_wake_interactive` alone). REQUIRED in production (fail-closed boot assert). **Deploy order:** 0009 creates the login NOLOGIN; the operator ceremony gives it LOGIN+password and sets this secret — it must be present before the Slice-6 image boots or the world fails closed. |
| `CLARA_WRITE_POOL_MAX` | Write-pool size (default 2). |
| (invoice-facts attempt cap) | Owned by the **database** — hard-coded to 3 in `0009`'s enqueue/claim path. There is **no** runtime env var (an env override would be a no-op); Tier B is the honest permanent fallback once the cap is reached. |
| `CLARA_CLAMD_MIN_BACKOFF_MS` / `CLARA_CLAMD_MAX_BACKOFF_MS` | clamd self-heal backoff (PIN-AB-2): a clamd exit is non-fatal; intake fails closed honestly (`503 scanner_unavailable`) while it restarts. |
| `CLARA_CLAMD_HEALTHY_RUN_MS` | A clamd run lasting at least this long (default `60000`) is treated as healthy and resets the restart backoff. |
| `CLARA_CLAMD_SCAN_DEADLINE_MS` | Scan-wide deadline (default `120000`): a connected-but-silent (wedged) scanner fails closed (`503 scanner_unavailable`) rather than hanging (W6). |
| `CLARA_WITNESS_MODEL_ID` / `CLARA_STATEMENT_WITNESS_MODEL_ID` | The model each witness pair calls — invoice and statement respectively (both default `gpt-5.6-terra`; kept SEPARATE so the two pairs can be corpus-tuned independently, unlike the shared timeout below). **CHANGING EITHER MOVES THE ENGINE ID, AND THE ENGINE ID IS PAIRED WITH A DB LITERAL.** The snapshot is `llm-openai:{model}:{version}`, and the router stamps a hardcoded twin onto `document_processing_tasks.engine_id` (`llm-openai:gpt-5.6-terra:v2` for `llm_witness`, `llm-openai:gpt-5.6-terra:stmt-witness-v1` for `statement_facts`). The workflows compare the task's stamp against the image's snapshot **before any egress** and **WAIT** on a mismatch — correctly, since egressing would mint a provenance receipt naming a model nobody called. So setting one of these WITHOUT a matching migration does not mis-stamp, it **STALLS the lane** (and the statement lane's waits sit in the shared `ocr_concurrency` window). Treat a model change as a DB+runtime pair, never an env tweak. |
| `CLARA_WITNESS_MODEL_TIMEOUT_MS` | **F-A2 ③, ONE KNOB FOR BOTH WITNESS LANES** — how long ONE witness model call may hang before it is aborted and the task settles terminally (default `180000`, the bound the F-A1 corpus run's 69 real calls cleared with room). Invoice pair: `witnessFacts.v1.services.mjs` → `clara.fail_witness_facts`. Statement pair (F-A2 Window B): `statementFacts.v2.services.mjs` → `clara.fail_statement_facts`. Both live in NON-frozen services modules by AB-16, so the bound moves without a workflow version. Deprecated but still accepted, one per lane so an already-configured machine never silently reverts: `CLARA_WITNESS_LLM_TIMEOUT_MS` (the PR-2 name) and `CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS` (the PR-4 name). A deprecated alias binds only when the ratified name is unset, and says so once per process. |
| `CLARA_LLM_WITNESS_CONCURRENCY_HINT` / `CLARA_OCR_CONCURRENCY_HINT` | **F-A2 ④** — what the reconciler BELIEVES the per-firm lane windows are, so it mints at most (free slots) runs per sweep instead of one per queued task (defaults `2`/`2`, mirroring the DB's own `coalesce(...,2)`). A pacing HINT, never the authority: `claim_document_processing_task`'s CLR18 gate still decides every claim, so a wrong hint only paces faster or slower. Raise it only where the firm's real `llm_witness_concurrency` / `ocr_concurrency` was raised. |

`withWriteWakeScoped(secret, fn)` = `BEGIN` → txn-local `set_config('clara.wake_secret',…,true)`
→ (checkout already did `SET ROLE clara_wake_interactive`, NOT read-only) → write →
`COMMIT`; P4 destroy-on-connection-error. The secret is minted per attempt and never
crosses a WDK step boundary.

**Egress flip:** flip `CLARA_DOC_EGRESS_APPROVED=1` as a SECRET OVERRIDE (fly.toml
`[env]` stays `0`), recorded against S6-R1 + the signed RPR consent note. On flip the
reconciler bulk-releases `held_egress → queued` (the first vendor egress); verify the
release count matches the held population and only RPR/synthetic docs exist.

`invoiceFacts_v1` is a NEW frozen workflow class (beside a byte-untouched
`documentIngest_v1`) that runs Azure DI **prebuilt-invoice**
(`azure-di:prebuilt-invoice:2024-11-30`) over a filed supplier bill and persists
semantic facts (`invoice.total`, `invoice.currency`, …) so a coding turn can
corroborate the amount (Tier A). It never touches `documents.extraction_status`.

## Commands

```sh
pnpm --filter @clara/runtime typecheck   # tsc --noEmit
pnpm --filter @clara/runtime build       # nitro build (compiles the WDK directives)
pnpm --filter @clara/runtime start       # boot the built server (reads .env if present)
```

For a health/ready check, boot with DB env set and `CLARA_START_WORLD` unset:

```sh
export PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=postgres PGPORT=5432
pnpm --filter @clara/runtime build && pnpm --filter @clara/runtime start
# GET http://localhost:3200/health  -> { ok: true }
# GET http://localhost:3200/ready   -> { ready: true, checks: { db: { ok: true }}}
```

## Versioning discipline (do not skip)

Per Appendix A, a deployed workflow body is immutable once any run can be in
flight. Never edit a `// @frozen` file — add `chatTurn.v7.ts` and repoint
`registry.ts`. Renaming/deleting an export with in-flight runs is forbidden
(the workflow name derives from path+export; a rename strands parked runs).

## Fly deploy runbook (contract §5 — gated by ruling 7)

Artifacts: `fly.toml` + `Dockerfile` (in this package). The deploy is a
single always-on, **non-HA** machine (contract §4.1) — the durable engine is
single-leader, so this app must never scale > 1.

### Prerequisites (do NOT start the world before these)

1. **Ruling 7 gate, corrected scope (owner-ratified 2026-07-18 after the
   wait-validation debate):** what waits for the `T2-48h` park sign-off +
   the owner-approved spike-schema drop is ONLY (a) starting a world against
   the shared engine schemas and (b) dropping those schemas. Everything
   non-colliding may (and did) proceed early: applying `clara` migrations,
   Fly app + secrets, and a QUARANTINED world-off smoke deploy
   (`CLARA_START_WORLD=0`, health/operator access only — a world-off boot
   may still open an eager engine LISTEN, which reads but never replays).
   The world-on cutover strictly waits for the gate.
2. A production Postgres reachable via a **SESSION-mode pooler** (port 5432 — the
   world needs `LISTEN/NOTIFY`, which transaction mode on 6543 drops).
3. `fly apps create <name>` and set `app = "<name>"` in `fly.toml`.
4. Create the single `clara_spool` volume in `sin`, keep platform encryption on,
   disable snapshots, and verify it mounts at `/data`. It is disposable resumability
   state, not authoritative custody; never attach it to a second machine.

### One-time engine bootstrap (S4-V3)

Before the FIRST world start, the WDK engine schemas (`workflow` +
`graphile_worker`) must exist in the production DB. Run ONCE from a local clone
(the same `bootstrap` bin the Slice-0 spike used as `setup:engine`), pointed at
the prod pooler — it is idempotent:

```sh
WORKFLOW_POSTGRES_URL="<prod session-pooler DSN>" \
  pnpm --filter @clara/runtime exec bootstrap
```

### Operator DB step (out-of-band)

Migration `0006` creates `clara_runtime_login` + `clara_agent_read_login`
**NOLOGIN, no password**. Enable LOGIN + set a password for each out-of-band,
then hand those two credentials to the runtime as the DSN secrets below.

### Secrets (`fly secrets set` — NAMES only; never commit values)

- `OPENAI_API_KEY`
- `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUD`, and ONE of
  `SUPABASE_JWT_JWKS_URL` (asymmetric) or `SUPABASE_JWT_SECRET` (HS256)
- `WORKFLOW_POSTGRES_URL` (the world's DB — session pooler)
- `CLARA_RUNTIME_DATABASE_URL` (the `clara_runtime_login` DSN)
- `CLARA_READ_DATABASE_URL` (the `clara_agent_read_login` DSN)
- `CLARA_INTAKE_CORS_ORIGINS`
- `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`
- `CLARA_STORAGE_URL`, `CLARA_STORAGE_ROLE`, `CLARA_STORAGE_ROLE_JWT`

`CLARA_START_WORLD=1` and `PORT` live in `fly.toml [env]`, not secrets. The
world runs ONLY in the deployed app.

### Deploy

From the **repo root** (so the Docker build context is the pnpm workspace root):

```sh
fly deploy --config packages/runtime/fly.toml
```

(Recommended: add a repo-root `.dockerignore` excluding `.git`, `node_modules`,
`**/.output`, `**/.env` to speed the context upload — it does not affect
correctness, since the Dockerfile copies source selectively.)

### After a HARD restart (kill / OOM / crash / forced machine replacement)

The dead VM leaves its `clara_runtime_login` sessions `idle` in the session pooler and they
starve the replacement's connects — clear them with the mandatory step in
**`docs/ops/runtime-hard-restart.md`** §1 before treating the restart as finished.

### Rollback preflight (§4.9 — BLIND REVERT FORBIDDEN)

Before any `fly releases`/rollback, confirm the target image **exports every
workflow name+version that has non-terminal runs**:

```sql
select name, count(*) from workflow.workflow_runs
 where status not in ('completed','failed','cancelled') group by name;
```

If the target image lacks a workflow that still has parked/running runs, a revert
would strand them — quiesce/drain those runs first, or do not roll back to it.

### First-deploy verification checklist

1. `GET /health` → 200; `GET /ready` → 200 with `checks.world.ok` +
   `checks.control.ok` + `checks.taxonomy.ok` all true.
2. One seeded-firm chat turn: `POST /api/chat/:sessionId/turns` (valid JWT) →
   202 `{task_id}`; the task reaches `completed` with an assistant message
   (typed parts) and non-zero recorded usage.
3. SSE detach/reattach: open `GET /api/tasks/:id/stream`, disconnect mid-stream,
   reattach → full replay from index 0 + a terminal `done` event.
4. Clarify on live: a turn that calls `clarify` parks (`awaiting_input`); answer
   it from the dashboard (`answer_interruption`) → the run resumes and settles.
