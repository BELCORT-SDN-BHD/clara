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
- **The chat loop** (versioned `workflows/chatTurn.vN.ts` files, each with its
  FROZEN closure `chatTurn.vN.impl.ts` / `.prompt.ts` / `.tools.ts`; the registry
  in `workflows/registry.ts` pins **`chatTurn_v17`** since #485 (`60ffbfb0`, 2026-09-02
  18:18 +0800; `registry.ts:616` records v16→v17). **The registry pin is not the serving
  bundle**: the SERVING Fly bundle is still machine version 70 (deployed 2026-08-31), carrying
  v16, until the next deploy; earlier versions stay frozen +
  reachable for parked runs per Appendix A): a coding-capable advisor with the `draft_journal_entry` write
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
  + reconcile (`lib/reconciler.mjs`; the DB function `clara.reconcile_autopost_rules()`
  and the rest of the rules-execution tier RETIRED with F-A2 PR-3 at `0118` — the
  reconciler's belt caller was RETIRED WITH IT, closing the gap a first pass at PR-3
  left open (the caller kept firing the dropped call every poll, invisible in
  `beltErrors`, until this fix; `docs/plan/active/f-a2-annexes-1-estate.md` §B.1 names
  the artifact's disposition as "RETIRE — drop the verb", both DB and caller halves).
  **Merged, NOT SERVING until the next runtime deploy** (the SERVING Fly bundle is
  machine version 70 today; this fix rides `v72`, not the already-queued `v71` — same
  "the registry pin is not the serving bundle" law as the chatTurn version above).
  **Consumer lanes**, each on its OWN dedicated connection + advisory lock:
  matcher (`lib/matcher.mjs`),
  autodraft (`lib/autodraft.mjs`), local_facts (`lib/local-facts.mjs`),
  sst_watch (`lib/sst-watch.mjs`), facts_gate
  (`lib/facts-gate.mjs`), classify (`lib/classify.mjs`) — plus the managed clamd
  scanner (`lib/scan.mjs`, no DB session). (The rule_post consumer, `lib/rule-post.mjs`,
  retired with F-A2 PR-3.) **Supervisor** (`scripts/serve.mjs`):
  one crash-only process group.
- **HTTP** (`src/index.ts`): chat sessions/messages/turns, an SSE stream that
  survives detach, and `/health` + `/ready` (fail-vs-warn matrix, §4.7). Ten more routes are
  mounted unconditionally alongside these — **20 at `08de89f6` (2026-09-03); count
  `src/index.ts` + its sub-routers, not this line, since a merge can add one (#512's
  `reportRoutes.ts` just did)**: `GET /workflows`, the five `/api/interview/*` verbs
  (firm/start, client/start, answer, cancel, state), `POST /api/opening/parse-targets`,
  `POST /api/seeding/prepare`, and the two authenticated bytes-**EGRESS** doors,
  `GET /api/documents/:id/bytes` and `GET /api/artifacts/:id/bytes` — both now documented
  in their own "The two human BYTE-READ routes" table below (#512 closed the gap this line
  used to flag: they were missing from the Slice-5 write-up, which documents only the
  inbound (upload) half of "the complete evidence-byte
  path").
- **Workflow-versioning**: `registry.ts` names the newest version enqueue sites
  target; the CI freeze-lint golden-hashes every frozen body + its import
  closure. Prompt + tools live INSIDE the frozen closure by design (§4.9).
- **Gate G1's universal wake-execution engine** (`lib/wake-engine.mjs` + `lib/reconciler-wake.mjs`,
  migration `0133`): registry-driven off `clara.wake_engine_sources`, consuming the existing
  wake allowlist unchanged. **TRUED 2026-08-30 (裁-44 / FIND-5): the sources table does NOT ship
  empty** — `0133` §G (`:788-792`) seeds BOTH rows, `bank_agent` and `close_prep`, each
  `enabled=false`; cell `G1B-C2` asserts exactly that. What F-A3/F-A4 owe is the due-predicate and
  the emitter, not the registry row, and the FLIP is the owner's own act through
  `clara.set_wake_source_enabled` at the rollout ceremony.
- **Gate G1's two wake BODIES** (`workflows/bankAgent.v1*.ts`, `workflows/closePrep.v1*.ts`): the
  frozen closures the engine dispatches for those two rows — `bankAgent_v1` matches and proposes on
  one bank account; `closePrep_v1` prepares a year-end close and leaves a proposal a human settles.
  Neither can settle, finalize, attest or reopen: those four doors are `clara_authenticated`-only
  and the containment is the database's, not the tool sets'. Both sources stay disabled until the
  ceremony, and **neither source has a producer yet** — the clock half is F-A3's and F-A4's own.

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

### The two human BYTE-READ routes

Separate from intake, and the only two places raw bytes leave the runtime to a person. Both take a
human session JWT, resolve the live principal, call a definer read granted to `clara_runtime` and to
nothing else, and stream from Storage with the runtime's own custody credential. **No signed URL is
ever minted and the browser never holds a Storage credential** (裁-96②).

| Route | Definer read | Disposition |
|---|---|---|
| `GET /api/documents/:id/bytes` | `clara.get_document_for_human_read` | `inline` — the doc_review split-view displays it |
| `GET /api/artifacts/:id/bytes` | `clara.get_artifact_for_human_read` | `attachment` — a report artifact or sandbox export is SAVED |

The artifact route serves BOTH artifact families through ONE database gate
(`clara._artifact_download_core`) and re-verifies the object's content address en route, so a
substituted object is a 502 rather than a file the browser saves. Its refusals are not collapsed to
one status the way the document route's are: `CLR11` is a 404 whose body is byte-identical for a
malformed id, an unknown id and a foreign-firm id; `CLR04` is 403 and `CLR10` is 409, both carrying
the database's own typed reason for the surface to render verbatim.

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

The connection ceiling is **≈27 sessions** (F-A2 PR-3 retired the rule_post consumer
lane; **F-A6 PR-2 adds the freeform pool, +2**; integrator must confirm Supavisor
headroom before deploy — the ceiling itself is still unmeasured, F-A6 R-4 / P-8;
**pool census UNVERIFIED since the F-A4/FS-4 trains landed (noted 2026-09-02) — re-count
against the live pool constructors before trusting ≈27**): runtime pool 5 + read
pool 5 + WDK engine 5 + control/router LISTEN 2 + the six consumer-lane leader
sessions (matcher, autodraft, local_facts, sst_watch, facts_gate,
classify) 6 + the write pool 2 + **the freeform pool 2**
(`CLARA_FREEFORM_POOL_MAX`, default 2) + **FS-4 C-5's two checkout-gate pools, +4**:
the Stripe webhook pool 2 (`CLARA_STRIPE_WEBHOOK_POOL_MAX`, default 2,
`clara_stripe_webhook_login`) and the pre-session auth-wall pool 2
(`CLARA_AUTH_WALL_POOL_MAX`, default 2, `clara_auth_wall_login`) — so the arithmetic
above now reads **≈31**, and it is still the UNMEASURED ceiling the paragraph opens
with. **Both C-5 pools are LAZY** (their logins ship NOLOGIN and gain a DSN at a
ceremony that follows the migration), so they hold zero sessions until that ceremony —
the same carve-out the bank pool has, counted here rather than omitted because they
WILL be live at the Wave-G reset. The Gate-G1 bank pool's 2 sit outside this
count until its own ceremony gives `clara_wake_bank_login` a password. Document
intake and extraction reuse short checkouts from the existing runtime pool; no DB
connection is held while streaming, scanning, uploading, downloading, or calling
Azure.

## Slice-6 coding floor (`chatTurn_v2` + the write floor + invoice facts)

`chatTurn_v2` (Slice 6) added the narrow WRITE capability. **TRUED 2026-09-03: the
registry pins `chatTurn: chatTurn_v17`** (#485, `60ffbfb0`, 2026-09-02 18:18 +0800;
`registry.ts:616` records v16→v17 — superseding the prior "TRUED 2026-09-02" v16 stamp,
which was itself written hours before this repoint) — repo frontier is **158 migration files
through `0163`, measured at `265a8ee7` (#493 merged; count `packages/db/migrations/`, not this
line — the numbering has gaps and this number moves every merge)**, live DB applied through
`0153`. **The
SERVING Fly bundle is machine version 70, deployed 2026-08-31 08:21Z, carrying
`chatTurn_v16` — bundle-proven by grep on the served container** (`PROGRESS.md`'s deploy
record). *(The 2026-08-29 truing this replaces read v15 pinned / v13 serving / frontier 0147 —
three pins stale at once; version claims here rot fast, so trust the registry + the served
bundle over this snapshot.)* The freeform ceremony above remains a hard precondition of any
redeploy. **v15 = F-A6's audited
freeform read** — one read-only SELECT the model composes and the database runs as
`clara_freeform_ro`, on the fifth login and its own pool. v1–v14
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
| `CLARA_FREEFORM_DATABASE_URL` | **F-A6 PR-2.** The `clara_freeform_login` DSN (member of `clara_freeform_ro` alone). REQUIRED in production — **fail-closed boot assert**, and `scripts/serve.mjs:22` *and* `scripts/worker.mjs:17` BOTH call it before importing the built server, so a pre-ceremony deploy takes the **server AND the worker** down, not merely the freeform read. `CLARA_START_WORLD=0` does not exempt you. **Deploy order:** `0131` creates the login NOLOGIN; the operator ceremony gives it LOGIN+password and sets this secret — it must be present before the `chatTurn_v15` image boots. |
| `CLARA_FREEFORM_POOL_MAX` | Freeform-pool size (default 2). Read when the pool is CREATED. |
| `CLARA_STATEMENT_TIMEOUT_MS` | Estate-wide per-session `statement_timeout` (default `30000`). **FS-4 C-5 widened its blast radius:** the two checkout-gate pools read it too (`lib/checkout-pools.mjs:52`), so this knob now bounds the Stripe webhook and the pre-session auth wall as well as the lanes it already governed. A change here touches the MONEY lane — a value below a webhook's own round trip makes the door refuse under load, and the refusal is Stripe-visible. |
| `CLARA_IDLE_IN_TXN_TIMEOUT_MS` | Estate-wide `idle_in_transaction_session_timeout` (default `15000`), read by the same two checkout-gate pools (`lib/checkout-pools.mjs:53`). Same note: it now binds the money lane. |
| `CLARA_CONNECT_TIMEOUT_MS` | Estate-wide connection-acquisition bound (default `5000`), read by the same two checkout-gate pools (`lib/checkout-pools.mjs:54`). Both C-5 pools are LAZY, so this is first felt at the ceremony that gives their logins a DSN, not at boot. |
| `CLARA_FREEFORM_STATEMENT_TIMEOUT_MS` | The H-4 backstop: a session `statement_timeout` the POOL sets before calling `wake_freeform_read`, because PostgreSQL arms the statement timer once and a `SET LOCAL` inside the verb cannot bound a single stalled FETCH. Default `15000`. **CLAMPED, not trusted:** anything that is not a whole number of milliseconds strictly greater than the verb's own 5000 ms in-loop deadline falls back to the default with a warning naming the variable and the value — `0` means UNLIMITED in PostgreSQL and would delete the wall, and anything at or below 5000 would fire before the in-loop deadline and destroy the receipt that deadline exists to commit. **There is no upper limit**: raise it freely if you mean to. |
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

### The test suite needs a version-matched `pg_dump`/`psql` on PATH

Two files (`tests/relay-taxonomy.test.mjs`, `tests/fs7-v17-chatturn-db.test.mjs`) give
themselves a private database by cloning the ambient one (`pg_dump | psql`, via
`packages/db/tests/migrate-harness.mjs`'s `cloneAmbientDatabase()`) instead of replaying
migrations — see that helper's own header for why. The `pg_dump` binary MUST match the
server's major version (Postgres 17), the same convention `packages/db/scripts/backup.mjs`
documents: on a machine whose PATH `pg_dump`/`psql` are older, point `PG_DUMP`/`PSQL` at a
matching binary (e.g. `PG_DUMP=/path/to/pg17/bin/pg_dump`). CI's `db-estate` job installs
one via `./.github/actions/pg17-client`; without a match, both files fail to LOAD.

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

### F-A6: the freeform login ceremony **PRECEDES the chatTurn_v15 image** (do not reorder)

`scripts/serve.mjs` calls `assertProductionPoolConfig()` at line 22 — **before** it imports the
built Nitro server (line 76) — and `scripts/worker.mjs` does the same at line 17. That assert is
**fail-closed on `CLARA_FREEFORM_DATABASE_URL`**
(`lib/pools.mjs` → `lib/freeform-read.mjs`), matching the Slice-6 write floor's posture and F-A6
design Annex E.1 ("a world that boots without the DSN must refuse to start, so the ceremony
precedes the image") — and deliberately **not** Gate G1's lazy bank-pool posture, whose ceremony
was itself gated on that PR merging.

The consequence is blunt and is the reason this section exists: an image shipped before the
ceremony **does not boot at all** — not "the freeform read is unavailable". HTTP, intake, the
world and every consumer lane are down with it, **and so is the standalone worker**
(`scripts/worker.mjs` asserts too), and `CLARA_START_WORLD=0` does **not** exempt you: the
assert runs before Nitro either way, so even a skeleton health/ready boot fails.

**Run in this order:**

1. Confirm `0131` (F-A6 PR-1) is applied — it is, as of the 2026-08-26 W4 ceremony. **This PR
   ships no migration of its own**; the whole DB half is already live.
2. `alter role clara_freeform_login login password '…';` out of band — env-to-env, never printed,
   never in argv.
3. `fly secrets set CLARA_FREEFORM_DATABASE_URL=…` (the fifth DSN; see the Secrets list below).
4. **Then** deploy the `chatTurn_v15` image.

Two optional knobs, both documented in the Slice-6 environment table below:
`CLARA_FREEFORM_POOL_MAX` (default 2) and `CLARA_FREEFORM_STATEMENT_TIMEOUT_MS` (default
`15000`), the H-4 backstop — **clamped, never refused**: a value that is not a whole number of
milliseconds strictly above the verb's own 5000 ms in-loop deadline falls back to the default
with a warning naming the variable and the value. **There is no upper limit.**

**Session budget after F-A6:** +2 for the freeform pool — see the connection-ceiling paragraph
above, which is the single count and now reads **≈27**. Confirm Supavisor headroom before
deploy; the ceiling itself is still unmeasured (F-A6 R-4 / P-8).

**Registry frontier at this image:** `registry.ts` pins `chatTurn: chatTurn_v15` and
`autoDraft: autoDraft_v9`. `chatTurn_v1..v14` stay exported and frozen for parked runs — which
is also the asymmetry the rollback preflight below turns on: rolling *forward* strands nothing,
rolling *back* past this image strands any run parked on `chatTurn_v15`.

### Secrets (`fly secrets set` — NAMES only; never commit values)

- `OPENAI_API_KEY`
- `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUD`, and ONE of
  `SUPABASE_JWT_JWKS_URL` (asymmetric) or `SUPABASE_JWT_SECRET` (HS256)
- `WORKFLOW_POSTGRES_URL` (the world's DB — session pooler)
- `CLARA_RUNTIME_DATABASE_URL` (the `clara_runtime_login` DSN)
- `CLARA_READ_DATABASE_URL` (the `clara_agent_read_login` DSN)
- `CLARA_FREEFORM_DATABASE_URL` (the `clara_freeform_login` DSN — **fail-closed at boot**; see
  the freeform ceremony section above, and set it BEFORE the chatTurn_v15 image ships)
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

CI proves reader ⊇ emittable at this commit — the deploy-ordering hold (deployed web ≥ runtime) is
OPS.x. The CI gate runs after the workflow-bundle gate and fails closed when `apps/web`'s
`ClaraPart` reader lacks a kind the runtime closure can construct. It is not a claim about the
version of the web app already deployed.

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
