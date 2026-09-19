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

### The two pins the wave 2026-09-18 cut moved

`chatTurn → chatTurn_v21`, `claraWork → claraWork_v5`. Every superseded body stays exported and in
`workflowBodies` — the boot census refuses to start the world database-wide if a body a parked run
needs is missing, and that is policy (c) enforced rather than promised. What each new body carries,
and nothing more:

* **`chatTurn_v21`** — exactly two tools over v20's map plus ONE step.
  `start_trade_invoice_work` (#655) admits a sales invoice or a supplier bill through
  `clara.admit_trade_invoice_work` (nine arguments, an eighteen-token refusal map, a deterministic
  op key); it ADMITS and posts nothing. `run_depreciation_period_for_client` (#651) clears a
  client's DUE periods through `clara.run_depreciation_period_for(uuid,date,text,uuid)` — a NEW
  verb name, because `rig-meta.mjs:691-693` is an executable census that fails the moment
  `run_depreciation_manual` reaches a machine role. And `loadClientBasisStepV21` (#658) repoints
  the chat knowledge preload from `clara.get_knowledge_pack`'s recency dump to the bounded
  `clara.retrieve_knowledge`, surfacing a read failure as a typed status instead of the null that
  reads as "this client has nothing recorded". NO new wire kind and NO widened
  `WORK_ACCEPTED_PURPOSES` — a trade invoice is a `journal_entry` Work and the depreciation run
  mints no card at all, which is also why it is deliberately OUT of `hasCodingIntent_v21`.
  `clara.get_context_pack` is not recut and not repointed. Deploy 0225, 0227 and 0230 first.
* **`claraWork_v5`** — the same repointed read on the Work lane, plus the RECORD of it:
  `clara.record_work_knowledge_read` writes the read-set row that makes "what did Clara actually
  see?" answerable. A read that does not succeed is now TERMINAL (`knowledge_read_failed`,
  recoverable, nothing posted) — the one place v5 is stricter than v4, ratified by DECISIONS
  §6.2.0 R-D, and all-or-nothing because the door decides all three tiers in one statement and
  catches nothing. Two new READS, `read_knowledge_source` and `read_knowledge_history`, neither of
  which writes a row or mints a part kind. A resumed run asks `clara.work_knowledge_drift_for`
  once; a `relevant:true` drift spends ONE EXISTING `budget.replans` and `relevant:null` is
  surfaced rather than coerced. The roster goes from five names to seven and the bundle id moves to
  `clara-work-tools/v5` — whose digest now covers **each tool's JSON Schema and its declared
  dependencies** (ARCHITECTURE:435-445, below). Riders: #847's writer-side trace bounds through the
  new sibling `lib/work-trace-bounds.mjs`, and #882(a)'s one-row CLR40 reclassification. Deploy
  0230 first — without it EVERY Work stops, which is the correct failure for a deploy-order
  mistake.

TWO CONTRACTS THIS CUT DID NOT DELIVER, both by ruling rather than by wall: #656's
`read_opening_source` belongs to a FUTURE `chatTurn_vN` (its own stanza says so, and it appears in
no row of DECISIONS §1.2), and #636's `open_intake_batch` stays contract-only (D5). #653's and
#647's remain where the 2026-09-15 note left them.

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

### The chat turn's 202 and what the live stream carries (#642)

`POST /api/chat/:sessionId/turns` answers **`202 {task_id, replayed}`**. `replayed` is read straight
off `clara.begin_chat_turn`'s receipt — `true` from the door's `turn_key` replay branch
(`0006_runtime_core.sql:954-960`), `false` from the fresh admission at `:999` — and it is the only
thing on the wire that distinguishes "we already have this turn" from "we just admitted this turn".
It is additive: a client that ignores it is unaffected. A receipt that does not carry the field at
all is reported as a fresh admission (fail-closed towards drawing the turn, never towards swallowing
it). The route is otherwise unchanged and **#642 ships no migration**: the idempotency arm is already
in 0006 and every defect that ticket closed is above the database.

**The model's whole `fullStream` reaches the browser verbatim**, so a question about live tool state
is a WEB question, not a version cut. `consumeChatTurnModelResult` writes every part of the AI SDK
stream to the run's writable (`workflows/chatTurn.v10.impl.ts:216-221`, called at
`chatTurn.v20.impl.ts:148-157`) and `src/streamRoute.ts:139` relays each one as `event: chunk` with
no filter. Measured on this repo's own `ai@7.0.77` + the `MockLanguageModelV4` script the World legs
use, the part names a turn actually emits are `start`, `start-step`, `text-start`, `text-delta`,
`text-end`, `tool-input-start`, `tool-input-delta`, `tool-input-end`, `tool-call`, `tool-result`,
`tool-error`, `finish-step`, `finish` — and the identifier field is **`id` on the three
`tool-input-*` parts but `toolCallId` on `tool-call`/`tool-result`/`tool-error`**, which is the one
fact a reader who took the vocabulary from the SDK docs would get wrong. There is **no admission
event on the stream**: nothing in that vocabulary says "queued", so a live *queued* chip cannot be
built without a new frozen `chatTurn` cut.

**A revocation has two doors, and they say the same thing.** `src/streamRoute.ts` re-authorises on
every poll and sends `event: revoked {taskId, reason}` when that throws (`:152-157`) — but it can
only write that frame once the SSE headers are out, and its ATTACH-time authorisation answers
before them (`:31-44`, an `AuthError`'s own status with `{error: code}`). Every revocation
discovered when a read is opened — the reattach after a `detached`, a rail reopen, a scope switch
back, any remount into a membership that is already gone — therefore arrives as **403 or 404**,
never as an event. The browser treats exactly those two statuses as the same fact and synthesises
the same `revoked` event (`apps/web/lib/clara/stream.ts`), because reading them as a transport
failure produced eight rounds of "Reconnecting…" at a person whose access had been removed. A 401
is about the caller's TOKEN rather than a membership and stays a transport failure; the web proxy's
own unreachable and redirect arms answer 502, which is what "the lane is down" looks like.

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

TWO SUCCESSOR CONTRACTS ARE WRITTEN IN THAT FILE'S FOOTER AND NEITHER IS CUT. They were owed on
`chatTurn_v20` / `claraWork_v4` when this section was written; **`chatTurn_v21` and `claraWork_v5`
have since been cut and took neither**, for the same measured reason rather than by oversight —
every prepayment door and read is granted to `clara_authenticated` alone (0223 §D.1), so the tool
could only ever return a grant refusal, and a workflow cut does not write migrations. The version
names below are therefore the contracts' ORIGINAL addressees, kept as written; the live reading is
"the next `chatTurn_vN` / `claraWork_vN` cut AFTER the grant exists".

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

### The depreciation lane (#651) — one non-frozen module, one owed successor, and a belt that needed NO change

`lib/depreciation-run.ts` is NOT imported by any workflow body and must not be until the wave's
successor ceremony. It is the `lib/fixed-asset-acquisition.ts` trajectory exactly: written to be
final, because `scripts/check-frozen-workflows.mjs`' IMPORT-ESCAPE hash-locks it with the closure
the instant `chatTurn_v21` imports it.

It carries the `.strict()` zod input that deliberately holds NO period — `clara._fa_run_period_core`
refuses any caller-named window that is not the cadence's, so the period is the database's — the
door's four arguments in the database's own order, and a CLR → sentence map keyed on
`(code, reason, axis)` rather than on the code alone, because 0227 adds a NEW axis
(`period_closed`) to a reason 0041 already used for two others (`not_ended`,
`not_cadence_aligned`). An unmapped code degrades to the door's verbatim message; it is never
swallowed and never guessed.

**The floor sentence is part of the contract, not decoration.** The door carries no floor bypass, so
Clara cannot reach a period earlier than the authority window, and the map says so and points the
person at the human catch-up door `clara.run_depreciation_manual`.

ONE SUCCESSOR CONTRACT IS WRITTEN IN THAT FILE'S FOOTER AND IT IS NOT CUT: **`chatTurn_v21` —
`run_depreciation_period_for_client`**. A NEW door name is mandatory rather than stylistic:
`packages/db/tests/rig-meta.mjs:691-693` is an executable census that fails the moment
`run_depreciation_manual` reaches a machine role, because that would hand the maker-checker ladder a
bypass. The contract reuses the existing receipt part shape and mints no
`accounting_work.purpose` — depreciation posts through `journal_entries` directly and never reaches
the Work lane.

**`reconciler-fa.mjs` needed NO change, and that is the finding.** The authority floor and the
closed-period skip are both DB-side, which is that module's own law (`reconciler-fa.mjs:15-20`): the
belt asks `depreciation_run_due` and runs what it is told. `tests/reconcile-fa-unit.test.mjs`'
`p651.belt.unchanged` pins the absence — the belt makes no run call on a not-due answer, runs
exactly the period the oracle named when it skipped a closed one, and NO client-side mirror
appeared (the module names neither `authority_from` nor `fiscal_years` nor `skipped_closed`).

**Depreciation invokes NO Workflow, and that is a finding rather than an omission.** There is no
standalone World leg for this lane and none is owed: `reconciler-fa.mjs:59-61` says in its own words
that it is "a plain polled belt … it neither listens on a channel nor starts a workflow run". The
durability evidence in its place is `tests/reconcile-fa.test.mjs` — one real-database end-to-end
under the `clara_runtime` group role — which 0227 touched only to sign its authority through the
new four-argument door.

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
[clara-runtime] serving git_sha=<sha> frontier=<version>(<count>) bodies=<n> pins chatTurn=chatTurn_v21 claraWork=claraWork_v5 clientOnboarding=clientOnboarding_v5 …
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
### #658 — three NEW modules, **now frozen**, that the `claraWork_v5` cut imports

When this section was written all three sat OUTSIDE every frozen closure (the union was 296
modules with nine `lib/` members, and none of these three among them). **The wave 2026-09-18 cut
imported them and they are frozen now**: the union is 312, and `--compare-base origin/main` reports
296 entries unchanged plus 16 additions — the eleven closure files and these three plus
`lib/trade-invoice-basis.ts` and `lib/depreciation-run.ts`, every one of them entering BY CLOSURE
rather than by a marker somebody added. That is exactly the trajectory `lib/knowledge.mjs` took
when `chatTurn_v19` imported it and `lib/knowledge-conflicts.mjs` when `claraWork_v4` did. A
behavioural change to any of them is now a `claraWork_v6`, so DURABLE RULES LIVE IN MIGRATION 0230,
never in these files. None of the
three carries a module-level `node:` import, which is `lib/knowledge.mjs:44-64`'s measured
constraint: the Workflow DevKit compiles a frozen closure into a VM script where `require` is
undefined, and the failure is a RUN-TIME one no build gate sees.

- **`lib/knowledge-retrieval.mjs`** — `retrieveKnowledge` (never null, never throws),
  `renderRetrievedKnowledge` (three statuses, and `partial` reads as neither neighbour),
  `recordWorkKnowledgeRead` and `readKnowledgeDrift`. It DELEGATES the envelope discipline to
  `lib/knowledge.mjs` rather than restating it, for `knowledge-conflicts.mjs:19-24`'s reason: a
  second copy is how two lanes come to disagree about what an unreadable pack means.
- **`lib/capability-registry-v2.mjs`** at `clara-capability-registry/v2` — v1's five entries
  carried by REFERENCE plus `accounting_work.retrieve_knowledge` and
  `accounting_work.inspect_knowledge_source`, both `modelBound: true`. A SIBLING, never an edit
  to the hash-locked v1 (`capability-registry.mjs:29-34`'s own rule; `layout-sandbox.mjs` is the
  estate's precedent for a sibling).
- **`lib/work-trace-bounds.mjs`** — #847's owed writer half; see the section below.

**The status mapping, exported ONCE as `faceStatusOf`.** The runtime keeps its own frozen two
words; every human face and the `clara.work_knowledge_reads.status` column use the estate's
four. No face and no column ever says `unavailable` — 0230's CHECK refuses it by name.

| runtime envelope | face word |
|---|---|
| `{status:'ok'}` | `ok` |
| `{status:'ok', truncated:true}` | `partial` |
| `{status:'unavailable', reason:'refused'}` | `denied` |
| `{status:'unavailable', reason:'read_failed' \| 'malformed' \| 'no_client' \| 'no_purpose'}` | `unknown` |

**Five reasons, not six — and D16's required read needs no sixth.** `clara.retrieve_knowledge`
decides all three tiers in ONE statement and catches nothing, so it either answers with every tier
or raises: "the core could not be read" is the same event as "the read failed", and both arrive as
an `unavailable` answer whose face word is `unknown` or `denied`. D16's terminal at the v5 cut
therefore fires on ANY unavailable answer; there is no per-tier readability signal to key on, and a
caller must not be written as though there were. Asserted on both sides:
`p658.retrieve.envelope_is_atomic` reads the catalogued door body, and `kr.07` reads this module's
source. A later door revision that wants to distinguish a core-only failure adds the field in
migration 0230, where durable rules live, and changes those two cells to say so.

**A replay is named.** `recordWorkKnowledgeRead` returns `replayed` and `payload_match` beside the
raw receipt. The relation is append-only and keyed by `(work_id, run_id, seq)`, so a re-execution
whose outcome genuinely differed (first attempt `ok`, second `denied` because a record was
withdrawn mid-flight) cannot overwrite the row — it is reported instead of being answered with a
silent `ok`. The writer still never fails a run: a diagnostic write that could settle a Work would
be worse than the divergence it reports.

Batteries: `tests/knowledge-retrieval.test.mjs` (19 cells) and `tests/work-trace-bounds.test.mjs`
(9 cells). Standalone leg: `tests/work-knowledge-e2e.mjs` — it SIGKILLs a child between the
read-set write and its acknowledgement and proves the replay lands on the SAME
`(work_id, run_id, seq)` row. It bootstraps NO Workflow World, so it leaves
`packages/db/tests/rig-isolation.test.mjs` T10b green (#866).
## Requirements carried by the next frozen `claraWork` version — **ALL THREE TAKEN BY `claraWork_v5`**

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

**`claraWork_v4` was cut in the wave 2026-09-15 integration and took NEITHER requirement** — it
only fed `knowledge_version` into the existing `observed` object (`claraWork.v4.impl.ts`).
**`claraWork_v5` was cut in the wave 2026-09-18 integration and took BOTH**, so the sentence above
has been spent: from v5 the honest one is *the door bounds these two fields in shape, and so does
the writer.* `claraWork.v5.impl.ts` runs every NUMERIC observed revision through
`boundedRevisionNumber` before `traceSafely` (a refused number drops its KEY, which is
`observedRevisions`' own existing contract) and every `runId` through `boundedRunId` (a refused id
skips the WHOLE row, because the door would refuse it anyway and a skipped write cannot poison the
settle's open transaction). Both clauses are mirrors of 0210's and stay **no tighter** than it;
`lib/work-trace.mjs` was not opened.

**BOTH ROWS ARE NOW OWED ON `claraWork_v5`, AND THEIR CODE EXISTS (#658, filed as #847).**
`packages/runtime/lib/work-trace-bounds.mjs` is a NEW, non-frozen SIBLING module that mirrors
0210's two door-side clauses on the writer side — `boundedRevisionNumber` (`abs(v) < 1e12` and
at most six decimal places) and `boundedRunId` (the `wrun_` + 26-character Crockford ULID arm,
or no 13-digit run). `lib/work-trace.mjs` is NOT opened: #658 cuts no frozen body, so the module
sits outside every closure until the v5 cut imports it, and the stanza that tells the integrator
exactly where to call it is written in `reports/658-final.md`. Its own battery
(`tests/work-trace-bounds.test.mjs`) asserts the admitted side BY VALUE against the shapes
0210's tail exercised, because the writer's clause must stay **no tighter than the door's** — a
writer stricter than the door loses rows the database would have accepted, and `traceSafely`
swallows the loss. From v5 the honest sentence becomes: *the door bounds these two fields in
shape, and from v5 so does the writer.*

**#791 carried forward to v5, and v5 TOOK IT.** ARCHITECTURE:435-445 has been binding since v4
and v4 shipped `tools: {id, names}` — a digest that could not see a tool whose SCHEMA changed while
its name did not, which is exactly how `ask_question`'s v1→v2 change escaped with nothing but a
hand-bumped id. `claraWork.v5.bundle.ts` hashes `tools: {id, names, schemas, dependencies}`:
`schemas` is each tool's input JSON Schema, derived with zod 4's own `z.toJSONSchema` from the very
object the builder hands to `tool({inputSchema})` (`target: "draft-07"` and `io: "input"` both
PINNED rather than defaulted, so a library default moving cannot move a digest that is supposed to
change only when a CONTRACT changes); `dependencies` is each tool's declared doors. A cell in
`tests/clara-work-v5.test.mjs` tightens one bound on one schema, leaves the roster and the tools id
untouched, and proves the digest moves — and that the v4-shaped projection of the same change is
byte-identical, which is the measurement of what was missed rather than an assertion about it.
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
carries the `.strict()` schema, the two builders, the local refusal mapper (the door's own
**eighteen** tokens, as messages — fourteen from DECISIONS.md:50 plus `invalid_kind`, and, after
the fix round's F2, `invalid_particulars`, `invalid_currency` and `invalid_tax_facts`, because one
reason must name one thing or a person is shown a sentence about the wrong field) and a DISPLAY helper that names the domain and the item kind without naming a
chart account — it has no chart. It carries **no object spread anywhere**, because
`scripts/check-parts-parity.mjs` refuses one ("unclassifiable object spread") in any module it
walks, and this module enters that walk at the cut; measured — the guard refused an earlier draft.

**The successor contract this lane hands over** is written in full at the foot of that module: the
tool name, the `.strict()` input schema, the door call with its argument order FIXED, the
deterministic op key, the eighteen-token refusal map, the existing `work_accepted` part with **no**
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
stamped `document_date + payment_terms_days` on the item (DECISIONS §6.2.0 R-A — agreed terms run
from the document, so a bill dated 2026-03-04 and posted 2026-03-31 under 30-day terms is due
2026-04-03, not 2026-04-30). It SKIPS CLEANLY when 0225 is absent.
## #656 — the `opening_tb.line` producer gets its caller

`lib/opening-tb-cells.mjs` has read a printed trial balance into canonical `opening_tb.line`
regions since Wave B, and NOTHING called it: every import was a test. The consumer half
(`lib/opening-parse.mjs` → `clara.record_opening_targets_parsed`, route `src/openingRoutes.ts:32`)
has been live and unreachable for just as long. #656 joins them.

**`lib/opening-tb-produce.mjs` is the whole new surface**, and it is an adapter plus a containment
shell: it takes the `tables.N.cells.M` region payloads `normalizeAzureLayout` has just built, hands
them to `cellsToOpeningTb` unchanged, and returns `{status, reason, regions, refusals, totals}`. It
adds no grammar of its own, and that is a rule rather than a style — **any future Clara opening tool
that imports it FREEZES it**, because the freeze lint locks a workflow's whole transitive
relative-import closure (`lib/periodic-adjustment-basis.ts` is the estate's proof that the trap has
sprung once). Durable rules therefore live in `0017`/`0228` and in `opening-tb-cells.mjs`'s four
refusal laws, never here.

**The integration point is IN LINE, at the OCR pass** (`lib/egress.mjs`'s `normalizeAzureLayout`),
through one appended statement: no new processing lane, no new `engine_kind`, no CHECK widening, no
facts-router splice. The wiring is kind-blind by construction and that is ACCEPTED, for two measured
reasons: the reader must POSITIVELY identify a balancing trial balance and returns `null`
otherwise, and an `opening_tb.line` region is INERT until an opening seed ties that document — at
which moment `clara.create_opening_seed` re-checks the document's kind (CLR02 for anything but
`opening_balance_doc` / `management_account`). The worst case of a false positive is a few extra
evidence rows on a document nobody ever ties, never a number that reaches an accounting effect.

**What a BAD region costs, priced honestly (fix-round, review finding A6).** The sentence above is
about a region the database ACCEPTS. One it does not accept is dearer: `_derive_opening_region_fact`
RAISES CLR31 over an `opening_tb.line` whose `monetary_cents` disagrees with the text it re-derives
(0017:1488-1499), from inside `persist_document_extraction`'s region loop (0017:1587) — so the raise
aborts the WHOLE persist and the document loses the entire extraction it earned, its invoice or
payslip regions included. Before this wiring that abort was structurally unreachable; it is
reachable now on every azure-di layout pass. `disagreeingOpeningRegion` therefore re-checks the
database's own invariant before emission and drops the WHOLE set if any element fails it — the
all-or-nothing law one layer lower. The cost is pinned by
`tests/wave-b-opening-parse.test.mjs`'s A6 cell, which persists a contradicting region through the
REAL writer and measures that the whole extraction is lost.

**The refusal travels; it is not thrown away (fix-round, review finding A1).** The producer is
all-or-nothing, so a trial balance it REFUSES — it does not balance, one row is OCR-mangled —
emits zero regions. Keeping only `.regions` at the OCR pass made that byte-identical to a document
that is not a trial balance at all: both reached `parseOpeningTargets` as zero rows, and the route
answered its keyed-fallback signal `no_opening_tb_lines`, which the face renders as an INFORMATION
banner offering to key the balances — over a document whose own figures the machine had just found
inconsistent. `normalizeAzureLayout` now writes `{status, reason, refusals}` under the envelope key
`opening_tb_refusal` (the estate's `corroboration_ineligible` idiom, 0009:148 — no new field_path,
no CHECK widening, no migration), and `readOpeningRefusal` reads it back off the newest done
extraction when zero lines came home, answering 422 with the reader's reason VERBATIM plus
`source_refusal: true` and the failing row keys. `not_a_trial_balance` and a clean read carry no
such key, so the keyed fallback stays exactly what it was. `producer_error` is deliberately NOT
carried: it is an internal fault, not a verdict about the document.

**It never throws.** This runs inside an OCR normalisation that has already succeeded; a producer
fault must not destroy an extraction the document legitimately earned. Every path is contained and
reports itself as `producer_error` with a named reason. Fail-quiet HERE is fail-closed DOWNSTREAM,
because emitting nothing is exactly what the lane did before the module existed.

**Two refusals this slice makes reachable for the first time**, both classified in
`lib/opening-parse.mjs` rather than left to surface as a 500:

- SQLSTATE 23503 on `fk_opening_tb_targets_account` — a printed account this client's chart has not
  got. It carries no CLR code and no `detail.reason`, so it fell through to `throw` and the route
  answered 500. `mapOpeningFkError` makes it a 422 in the `unparseable` family, NAMING the account
  when Postgres' own structured DETAIL states one and it passes the chart's account-code grammar.
  The runtime cannot pre-flight this: `clara_runtime` holds no SELECT on `clara.coa_accounts`.
- CLR10 `op_key reused with different args` — the parse's op key is stable per (seed, document) so a
  retry cannot double a basis, while the payload it hashes is keyed by region id. Re-reading the
  tie document therefore makes a second parse a replay CONFLICT, which the generic arm reported as
  `malformed_lines`. It is now a typed 409 `source_reread_since_parse`. **Named residual**: the
  answer is honest but still a dead end; re-parsing a re-read document needs either an op key
  carrying the extraction or a door that re-points existing targets.

`tests/opening-ledger-source-e2e.mjs` is the standalone leg that runs the whole chain on real
Postgres. It bootstraps **no Workflow World**, measured rather than skipped: no workflow touches the
opening lane, so AC7's database-boundary clause applies.
## The intake batch lane (#636)

`lib/intake-batches.mjs` is a NEW, NON-FROZEN module carrying every line of batch logic:
`openBatch`, `attachIntake`, `beginIntakeInBatch`, `setMemberDependency`, `recordCapacityWait`,
`cancelBatch`, `resumeCancel`, `sweepBatchCancellations`. Every one returns a typed
`{status:'ok'|'refused'|'unavailable', …}` — never null, never a raw throw — because a timeout and
a refusal are different facts and a retry loop that conflates them turns a permanent no into an
infinite one.

**WHY IT IS NOT IN `lib/intake.mjs`.** That file is ONE manifest line from freezing: five real
reverse importers already point at it (`invoiceFacts.v1.services.mjs:9`,
`statementFacts.v1.services.mjs:19`, `statementFacts.v2.services.mjs:31`,
`witnessFacts.v1.services.mjs:27`, `witnessFacts.v2.services.mjs:38`), none of which is in
`frozen-workflows.json` today. MEASURED on the rig with
`node scripts/check-frozen-workflows.mjs --print-closure`: 288 @frozen entry files lock 296
modules, and `lib/intake.mjs`, `src/intakeRoutes.ts`, `lib/reconciler.mjs` and `lib/spool.mjs` are
all OUTSIDE it. Nothing frozen imports `lib/intake-batches.mjs`; it may IMPORT `lib/spool.mjs`,
because an import edge pointing INTO a closure does not pull the importer in.

**WHY THERE IS NO `documentIngest_v3`.** The batch id never enters the workflow's step IO. A begun
intake and its membership commit together in an EXPLICIT transaction opened by
`beginIntakeInBatch` (`withRuntime` is autocommit — `checkout()` in `lib/pools.mjs` issues no
BEGIN), and the membership is read back from the database by the read door. Changing the step IO
would be a new frozen body for a fact the database already holds.

**THE FAN-OUT, and why the parent stores its decision.** `POST /api/intake/batches/:id/cancel`
makes ONE governed decision and then issues one `clara.cancel_accounting_work` per live child, ONE
CALL PER TRANSACTION — that is the acceptance criterion, not an optimisation: a child that already
posted answers `already_completed` and keeps its receipt (0199:230-272), and one transaction around
all of them would make the first refusal roll the others back. Each child's key is DERIVED
(`<cancel_op_key>:<work_id>`) and the author is the STORED `cancel_requested_by`. MEASURED on the
rig: `clara._work_door_ctx` hashes `{work, author}` (0184:262-264), so a resumed fan-out carrying
the reconciler's own identity would raise CLR10 `op_key_conflict` on every child. CLR13
`operation_in_flight` is not a failure — the child is left for the next sweep.

**The belt.** `lib/reconciler-batches.mjs` is one contained belt in `runReconcilerSweep`, after the
accounting-work belt and before the trace prune. It feature-detects
`clara.sweep_intake_batch_cancellations(integer)` per cycle, so an image older than 0229 boots
dormant and lights on the next leader cycle with no restart. The worklist is a DOOR rather than a
query because `clara_runtime` holds no SELECT and no policy on `clara.operation_receipts`
(0178:1619-1630 asserts both) and none on the batch parent.

**The capacity wait.** MEASURED (0229's header, M2): a post-custody capacity refusal comes out of
`clara._resize_document_reservation` as SQLSTATE `CLR18`, and `lib/intake.mjs:155-159` maps eight
LITERAL codes with everything else to `internal` — so the intake lands at `failure_code='internal'`
and 0229's trigger arm never fires in production. `recordCapacityWait` is therefore the production
path to `awaiting_capacity`: CLR18 only, actor from the upload sidecar's `uploadedBy` (the finalize
route carries a capability token and no principal), and its own refusal swallowed into a log line
so the route's honest 429 never becomes a 500.

**The World leg.** `tests/intake-batch-e2e.mjs` is standalone (not collected by `node --test`) and
needs the world bootstrapped first (`pnpm --filter @clara/runtime exec bootstrap`). Its N is
MEASURED, not quoted: 100 ≤1MB PDFs is exactly what a fresh firm admits in one UTC day. It records,
rather than hides, children lost to a Windows-only EPERM race between the reconciler's sidecar
reads and `writeIntakeMeta`'s `rename` (the #693 family).

**THE BELT'S COUNTERS DISTINGUISH A REFUSAL FROM A DEAD END.** `reconciler-batches.mjs` returns
`batchCancelFailed` for refusals and `batchCancelBlocked` for a parent whose EVERY child refused
CLR04 — which means its stored canceller has lost authority and no future sweep will change that,
because the fan-out cannot substitute an identity (`clara._work_door_ctx` hashes `{work, author}`).
The blocked parent is logged by name and `clara.get_intake_batch` reports the same condition to the
human as `cancel_blocked`.

## #981 — one structured-detail carrier on a durable-Work refusal, instead of a fold per refusal

`src/workRoutes.ts` turns one raised database error into one HTTP answer (`workErrorResponse`). It
used to take the door's typed `detail` jsonb APART — a shared fold that overwrote `reason` with
`detail.constraint` for three field-scoped reasons, and, inside the trade-invoice route's own
catch, a second differently-shaped fold that lifted `detail.candidates` onto a body of its own.
Every refusal that carried structured detail therefore needed a new fold here AND a new arm on
`apps/web/lib/work/api.ts`; until both landed, the detail did not exist as far as a browser was
concerned. The rationale in the code cited `apps/web/lib/wire.ts` "discarding every detail key but
`reason`" — true when written, false since #629 added `parseRefusalDetail`, and never applicable
to THESE bodies anyway, because the durable-Work client parses this JSON itself and never goes
through wire.ts.

**The door's typed detail now rides back whole, under `detail`, on every 400 and 409 this file
builds.** `refusalDetail()` parses it once; `reasonOf` and `detailField` are views on that one
object. The top-level keys are PROMOTIONS of what a caller keys on (`reason` focuses a control,
`work_id` renders a link, `status` renders the state that made an act illegal) and every one of
them is byte-for-byte what it was — `tests/work-routes-unit.test.mjs`'s `LEGACY_BODIES` is the
twelve-row proof, driven in both directions.

**What survives of the folds, and why.** The three constraint reasons (`invalid_basis`,
`invalid_source_ref`, `invalid_claim`, now the named set `CONSTRAINT_FOLD_REASONS`) still answer
the database's `constraint` token as the wire `reason`, because this route refuses the cheap cases
ITSELF with a bare token and the two halves must not speak two vocabularies for one refusal. The
raw token is on the carrier as well. It folds by NAME, never "whenever a constraint exists":
`invalid_adjustment`, `stale_basis` and `adjustment_lines_mismatch` carry one too and have always
ridden back under their own names. The trade-invoice fold is gone entirely; what is left of it is
`TRADE_INVOICE_FIELD_DEFAULTS`, one row of DATA saying which control to focus when the door raises
`party_ambiguous` with no `field` at all.

**403 and 404 carry no carrier.** A 404 here answers both "no such Work" and "a Work that is not
this firm's", and that identity is the point — no existence oracle across firms. A typed reason on
it would loosen an access answer.

## #980 — the shared World harness's third script, and the trade-invoice lane's park and cancel

`tests/work-journal-serve.mjs` is the child bootstrap nine standalone World e2es spawn. It offered
two scripted-model conversation shapes, `post` and `narrate`, so no lane spawning it could reach
the ONE place a run blocks on a human. It now offers a third, `ask_question` (#980): read the
chart, ask ONE typed clarifying question and stop, and record the admitted basis only once the
answer comes back as a `tool-result` for `ask_question`. The branch is the shape
`tests/work-question-serve.mjs` already drove for the journal lane, lifted into the shared file;
`post` and `narrate` return before it and no existing caller sets the new value, which
`tests/work-journal-e2e.mjs` — the estate's only `narrate` driver — confirms on the rig rather than
by reading.

**The park IS the window, which is why one script serves both new legs.** While a run is parked
the Work is live, the run holds the task and NOTHING has been admitted. `tests/work-cancel-serve.mjs`
manufactures the same window with a gate file and a bound; the estate's own park holds it open
until a human acts.

**`tests/trade-invoice-e2e.mjs` gains legs 6 and 7.** Leg 6 drives a REPLAY into the parked
window: the run asks, the Work reads `awaiting_input`, the SAME intent key is re-POSTed (one Work,
one task, one invoice, ONE question — it does not re-ask, and it does not un-park), a human answers
through `clara.answer_work_question`, and the whole thing converges on one entry, one receipt, one
open item, with a further replay AFTER the answer still resolving to the same Work. Leg 7 spawns
`tests/work-cancel-serve.mjs` UNCHANGED — borrowing that file's hold rather than copying it into the
shared harness — holds the model before `record_journal_entry`, cancels there, and pins the whole
absence of effect: `stopping` over the real route, `cancelled` as the terminal, zero entries, zero
receipts, zero open items, and an invoice ledger that never reaches `posted`. The invoice ROW
survives, because it was born inside the admission transaction and a cancel is not a retraction.

**Both e2es' local gates now admit `clara_l<NN>`**, the per-lane database shape of the riders wave,
beside `clara_rt_test` / `clara_wave_b_ci` / `clara_<ticket>`. Still loopback-only, still a parsed
DSN equality check against the PG env, still fail-closed.
