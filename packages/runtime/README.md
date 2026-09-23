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
  ctx.taskId}` as the authority, and a `prepayment_schedule_configured` part. Since **#977
  (migration 0250)** that authority carries a REQUIREMENT rather than a convention: the door
  (through `clara.create_accounting_plan`, which it passes the reference to) resolves a `chat_task`
  reference only when the named `clara.agent_tasks` row is of kind `chat_turn` AND carries an
  author, and refuses anything else with `authority_ref_not_human_instruction` (CLR10), distinct
  from `authority_ref_unresolved`. A chat-lane `ctx.taskId` IS such a row — `clara.begin_chat_turn`
  stamps `created_by` from an author it has already checked is a live active member (`0006:988`) —
  so the contract stands as written; a successor that called this door from a WAKE or autodraft run
  would be refused, and that is the ruling, not a defect. It mints no
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

**#975 (migration 0279) gave that belt a FOURTH outcome: `parked`.** Where a period's charge would
fold a closing or closed fiscal year's months into the open period, the database stops the run
before its first write and asks the accountant whether the omission is immaterial (folded into this
period) or material (restated in that year) — IAS 8, and a judgement no machine lane may make. The
human door raises the question; every machine verb, including the one this belt calls, answers
`parked` with a stated reason and posts nothing. `reconciler-fa.mjs` therefore counts `faParked` on
its own axis — never a post, never a noop, never a failure — names the reason in the sweep log and
in the `parked=` summary field, and BREAKS the per-client chase, because `depreciation_run_due`
keeps answering `due:true` for that period until a person records a choice through
`clara.record_fa_arrears_resolution`. `tests/reconcile-fa-unit.test.mjs` drives both halves (the
counter and the single run call; the reason in the log). The module still mirrors nothing DB-side:
it neither computes the arrears nor names a fiscal year.

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

### The Wave D-b adjustment-occurrence sweep — retired (#928)

The leader's daily sweep for the 0045 recurring/reversing-adjustment template lane is retired:
`#788`'s owner ruling retires the 0045 lane fully, `#927` closed its human-facing write doors
first, and `#928` stops the runtime's daily trigger and deletes `lib/reconciler-adjustments.mjs`
whole — accounting plans' own occurrence scan (migration 0193, `lib/plan-occurrences.mjs`) is the
separate, newer system and is untouched.

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

This is a general rule, not per-file guidance, and it deliberately NAMES NO FILE (#919 — the list
here previously said "five" while enumerating seven, itself already stale against the actual set):
none of the standalone e2es this package ships that
[`db-live-gates/action.yml`](../../.github/actions/db-live-gates/action.yml) wires by path may
share a host with another suite WHILE it is actually running — grep that action for
`world-gate.mjs` (or `.output/server` for the three intake legs it drives directly) for the
CURRENT, authoritative set and its order, rather than trust a count restated here to stay in sync.
`db-live-gates` runs each battery alone — one at a time on the same rig, never concurrently with
anything else that could touch the same rows or steal the same lease clock. Running one locally
while another suite hammers the same database at the same time is the one setup CI does not
reproduce and these e2es do not defend against.

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
  `CLARA_SPOOL_QUOTA_MB`, `CLARA_SPOOL_TTL_MIN` (its reaper owns EVERY `intake-*.(bin|json)` in
  `CLARA_SPOOL_DIR` since #966, not only uuid-named ones — point `CLARA_SPOOL_DIR` at a directory
  nothing else writes), `CLARA_CLAMD_SOCKET`,
  `CLARA_CLAMD_MANAGED`, `CLARA_INTAKE_SIDECAR_QUIET_MS` (default 5000) and
  `CLARA_SPOOL_RENAME_RETRY_MS` (default 250). The Fly volume mounts at `/data`.
  The last two are the two halves of the #966 intake/sweep race; raise
  `CLARA_SPOOL_RENAME_RETRY_MS` on a host whose AV scanner or indexer holds spool files open for
  longer than a reader does (the failure it buys time for is a live intake failed with an untyped
  `internal`). Both are explained under "#966 — the intake recovery belt can no longer fail a live
  intake".
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
retired by this change. (Since ticket 1012 nothing in the running process calls
`lib/seeding-parse.mjs`'s write path at all — see "The prior-GL seeding lane is retired" below —
but the module and its `get_document_for_human_read` v1 read are still there, so this rollback
statement holds unchanged.)

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

<!-- #849 -->
The question an author actually asks is the INVERSE of the full report above — "which entries lock
*this* module" — and until #849 that meant grepping the whole report by hand. Give
`--print-closure` a module path and it filters straight to the answer:

```sh
node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/lib/work-trace.mjs
# freeze-lint closure report — module "packages/runtime/lib/work-trace.mjs" is locked by 6 of
# 299 @frozen entry file(s):
#   packages/runtime/workflows/claraWork.v3.impl.ts
#   ...
```

An unreached module lists nothing (and says so) rather than silently printing the full report.
<!-- /#849 -->

<!-- #810 -->
A RETIRED body does not vanish from the ledger: its manifest entry moves to the top-level `retired`
record in `frozen-workflows.json` (path → the entry's last frozen `sha256` + the ruling that
authorised it), which is the only absence `MISSING` and `REMOVED-VS-BASE` accept — and a retired
path still present in the tree is its own finding, `RETIRED-PRESENT`. The first such retirement is
`chatTurn_v1`'s three-file closure (#810, owner ruling 2026-09-15; beta only, runs parked on the
body cancelled in the hosted cleanup first).

**#849** gave that move a command instead of a hand edit of `frozen-workflows.json`:

```sh
node scripts/check-frozen-workflows.mjs --retire packages/runtime/workflows/chatTurn.v1.ts \
  --ruling "#810 owner ruling 2026-09-15"
```

It refuses — writing nothing — unless the path currently has a manifest entry and its file is
already gone from the tree (retiring a file still in the tree would silently un-freeze it), and it
requires `--ruling`, since the ruling is the retired record's whole authority for leaving the
ledger. Like `--update` and `--lock-deployed`, it is a deliberate local act and is refused under CI.
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
and it is the one no census can see. The rule table lives in `lib/rollback-preflight.mjs`
(`FRONTIER_RULES`), it is global — no `--scope` clears it, because it counts no rows — and it is
not drainable. It holds two kinds of rule.

**(a) A body the applied schema requires.** From `0195_work_egress_purpose_and_execution_trace` on,
a target that does not carry `claraWork_v3` is REFUSED with reason `frontier_requires_body`,
however clean the estate is — 0195's posting core requires a consumed `accounting_work` egress
authorisation, no other body can obtain one, and 0195 grandfathers pre-v3 bundles past that wall,
so a pre-v3 image would run the whole Work lane with the wall in force and nothing subject to it.
The answer is a target that carries the named body.

**(b) A door contract the applied schema changed (#1035).** A migration can change what a door
RETURNS, and then an older image runs every parked body perfectly and misreads the answer. Two
have shipped, and the preflight said `ALLOWED` for both at a hosted window before this rule
existed:

| from | the door | what the old image does instead |
|---|---|---|
| `0254_intake_refusal_record` | `clara.create_document_intake` commits a ceiling-refused intake and returns `refused: true` instead of raising CLR18 | reads an `intake_id` off the refusal, mints an upload capability, answers **201** to the uploader, and re-drives the intake on every recovery sweep |
| `0279_fa_closed_year_arrears` | `clara.run_depreciation_period` answers `status: 'parked'` instead of posting when a closed year's arrears need a materiality judgement | counts the park as a **post** and, since the due probe still answers `due: true`, chases the same period to the per-client cap |

The target proves it understands a contract by **declaring** it. `lib/runtime-contracts.mjs` is the
image's own roster: one `clara.contract` marker per contract, carried as a literal in the built
bundle, and served as ids on `/api/build-info`'s `contracts`. The preflight scans the target
artifact for the markers (`--target-bundle`) or reads the ids off the target's own build-info
(`--target-build-info`), so the decision is a **measurement of the image** and never a list of
image tags somebody keeps by hand. An image that declares nothing — every image built before this
mechanism — reads as "does not understand", which is the whole point: that is exactly the image a
rollback is pointed at. Refusal reason: `frontier_requires_contract`.

A contract refusal has **neither** of the two answers a census refusal has: retaining a body
teaches the target nothing about what the door now returns, and there is no queue to drain. Ship a
target that declares the contract, or roll the schema back first — which is its own ceremony.

Adding a rule is one row in `FRONTIER_RULES`, and adding a marker is one entry in
`RUNTIME_CONTRACTS` naming the module and the line of it that only exists when the behaviour does.
`tests/runtime-contracts.test.mjs` reads both, so a marker whose behaviour was deleted reds a cell
instead of lying to a preflight, and `tests/rollback-preflight.test.mjs` fails any rule that names
a migration the chain does not contain.

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

**#1015 — the document lane's own scoping rule, because it shares no key with the agent lane.**
`clara.document_processing_tasks` carries no `work_id`/`task_id` column, so a `censusUnboundTasks`
caller who scopes by `workIds`/`taskIds` alone has named nothing the document half could
legitimately filter by. `censusUnboundTasks` narrows that half to **NONE** in that case, not to
every live row — the earlier defect, caught by wave-1/wave-2 integration gates on a database
carrying leftover queued document work, was exactly the opposite: an absent filter is "no rows" in
this module's own reading, but it is "no filter" in SQL, and the difference used to leak every
firm's queued document work into a scope the caller never asked for. A caller that wants the
document lane's own full, unscoped picture regardless asks by **naming** the `documentTaskIds` key
at all — even as `null` — which is how `preflight()`'s GLOBAL census and `tests/queue-drain.mjs`'s
drain check still see everything (they scope by nothing at all, which is the same ask from the
other side).

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
<!-- #850 -->
**Since #850 the two legs' scratch builds OVERLAP instead of running back to back.** The
`clara.open_interruption` / `clara.answer_interruption` probe that decides whether the chatTurn leg
runs at all is now read at the TOP of the file, once, so the file knows before doing anything else
whether it will need a second scratch image. The chatTurn scratch build is then started (not
awaited) the moment the claraWork scratch build finishes — a DIFFERENT scratch directory
(`previous-chat`), a DIFFERENT class rewrite (`chatTurn`, never `claraWork`) — so its `nitro build`
child process runs in the BACKGROUND while the claraWork leg does its own work: spawn, admit, stop,
spawn again, resume, preflight, all HTTP/DB round trips rather than CPU work. The chatTurn leg later
`await`s that already-in-flight promise instead of starting a fresh build, so on any run where the
claraWork leg's own exercise takes longer than one scratch build, the file pays close to ONE scratch
build's wall clock for two, rather than two in sequence. Neither leg's proof moved: each image is
still staged, rewritten and built exactly as `buildPreviousVersionImage` always did it, and each is
still independently scanned against build B's roster for the "differs by exactly one body"
invariant before anything is spawned — verified by deliberately colliding the two builds' scratch
directory names (the plausible mistake this change invites) and watching the file fail loudly
(`ENOENT` on the claraWork build's own artifact, ripped out from under it mid-flight) before
reverting to the distinct names. Local evidence 2026-09-20 (Windows host, both legs green, same
assertions): sequential 36.6s–42.5s whole-file wall clock across two runs before this change,
32.3s–34.8s across two runs after, each scratch build 5–6s on this rig. The CI wall-clock figure
(this rig has no CI runner) is in `.github/actions/db-live-gates/action.yml`'s own comment beside
the step, marked unverified until the next CI run measures it.

**THE FAILURE MODE THIS FIX ALSO CLEANED UP (L06-850-B, fix round 1).** The background
`chatBuildPromise` used to be neither awaited nor guarded before the outer `finally`'s
`removeScratchTree()` — a failure early in the claraWork leg (before this file's own `await
chatBuildPromise`) could reach that `finally` while the background `nitro build` was still writing
into `.scratch/two-build/previous-chat`, and `rmSync`ing that directory out from under it threw
`EBUSY` on this rig, reproduced deterministically 3/3 times by an injected early failure. A throw
from a `finally` REPLACES whatever the `catch` above it already threw, so the drill's real error
(here, the injection itself) never appeared in the output at all — only the `EBUSY` stack. Fixed by
awaiting the background build (swallowing its own outcome — cleanup is not a second verdict on it)
immediately before `removeScratchTree()`, itself now wrapped so a cleanup failure can never mask a
result either. Re-run with the same injected failure: the real error surfaces cleanly and the
scratch tree is removed without error.

**A CONCURRENCY RISK NAMED, NOT SOLVED (L06-850-C, fix round 1).** Every number above came from a
24-core rig, where a background nitro build is nearly free. GitHub-hosted runners have 2-4 cores,
where that build competes with the claraWork leg's own two spawned images and its
`FETCH_TIMEOUT_MS = 15000` polls. Measured directly on this rig: the same overlapped build took 5.1s
idle and 36.9s (7x) with one concurrent `pnpm typecheck` running, and that run FAILED on a
`pollTask` timeout inside the claraWork leg — the CPU-bound work #850 moves INTO that leg's own
window. See `.github/actions/db-live-gates/action.yml`'s own comment for the full measurement and
why no guard is added here.
<!-- /#850 -->

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

Eight legs. **Leg 1** has three arms and ZERO `clara.request_autodraft` anywhere in the
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

**Residual, named — and #877's correction.** Arm (c) proves the door is REACHED on ITS
OWN document, not that a coding task is admitted THERE: that fixture's real MyInvois
invoice states no tax breakdown, so `_coding_lane_core` refuses it (`tier_a_fails`,
measured on clara_l07; the leg prints the door's exact reasons, never a fixed list) and
routes it to `needs_you`. #633 owns exactly that reach-and-skip claim. **Leg 8 (#877)**
closes the remaining gap in its own leg: a Tier-A-complete fixture — an explicit type 01,
a net/tax tie, a tax breakdown that sums (migration 0023 §A's structured arm) — plus a
name-only vendor counterparty already in the client's books (`clara.draft_entry` +
`clara.approve_entry`, mirroring `packages/db/tests/wave-a-fixtures.mjs`'s
`primeReadyFiling`, read for the preconditions and not duplicated), a resolved purchase
direction and a live LEGACY coding-lane consent (`clara.grant_client_egress` — distinct
from arm (b)'s TYPED `document_processing` purpose grant), driven through the SAME
automatic chain. `clara.admit_autodraft_task` answers `admitted` BY NAME — read off its
own durable idempotency receipt in `clara.op_receipts` (keyed
`autodraft:<filing>:sweep`), because `clara.sweep_run_items.outcome` is a DIFFERENT,
later fact written only once the minted task SETTLES and whose CHECK-constrained enum has
no `admitted` member — and the minted task reads back from `clara.agent_tasks` (via
`clara.autodraft_attempts`) tied to the document's own live filing.

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

<!-- #967 -->
**Drains its own queue before exiting.** Sharing one database and world across three CI legs
proves a real cross-leg chain (this leg starts where `intake-e2e.mjs` stops), but nothing used to
drain the Workflow queue between them: each leg's engine dies with its process, so anything it left
non-terminal sat inert until the NEXT leg's fresh engine booted its own consumers and found it —
measured at roughly 1.27 million log lines of leftover concurrency-limit/retry churn, dominated by
`lib/classify.mjs`'s own capped-task line, before a normal passing run's THIRD leg finished. Both
`intake-e2e.mjs` and this file now call `tests/queue-drain.mjs`'s `waitForQueueDrain` right before
their own `process.exit(0)` — the same two censuses `lib/rollback-preflight.mjs` already exposes
(`censusNonTerminalRuns`, `censusUnboundTasks`), plus a third the two of them deliberately exclude
(a run left QUEUED by an earlier leg that FAILS while THIS leg's own engine drives it — L06-967-B,
fix round 1: `tests/queue-drain.mjs`'s own header explains why that needs a baseline rather than a
blanket "any failed row" rule), bounded (30s default), never a fixed sleep, and each leg's own
assertions already poll everything they admit to a terminal status first, so a clean run drains in
well under a second. `tests/intake-batch-e2e.mjs` deliberately does NOT call it: it is the last leg
on this database in the CI job and its own §5 scope ends with live rows on purpose (a declared-fact
wait, a quota wait, an unassigned failed upload) that nothing downstream needs drained.

**RELEASE RISK, NAMED RATHER THAN DISCOVERED LATER (L06-967-C, fix round 1):** the drain converts
today's noisy-but-passing CI run into a RED one on exactly the input #967 was filed about. A capped
`classify` task some earlier run left `queued` forever (by design — `lib/classify.mjs`'s own
`MAX_ATTEMPTS` backstop) or a permanently-undispatchable `ocr`/`structured_parse`/`none` task with
no transport metadata in its sidecar (0051 §2's own guard, `lib/reconciler-documents.mjs:396-413`)
can never drain, so leg 1 or leg 2 now FAILS at the 30s deadline instead of leg 3 running noisily —
intended, and the first CI run of this fix may expose it for the first time. A local reproduction
against this rig's own reused `clara_intake_ci` hit exactly this: once such orphaned rows
accumulated from an earlier, out-of-order local run, `waitForQueueDrain` correctly refused to call
the queue drained and timed out (see the action.yml comment above this step).
<!-- /#967 -->

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

**#1007 — the probe sits beside the admission, over the admission's own translation.**
`POST /api/work/trade-invoice/duplicates` takes `{ clientId, kind, invoice }` — the SAME wire
`invoice` the admission takes — runs the SAME `toDbTradeInvoice`, and asks
`clara.probe_trade_invoice_duplicates_for` (the actor-explicit twin; a `clara_runtime` connection
carries no JWT claims, so `clara._human_ctx` cannot answer for one). It answers **200** with the
door's whole answer: nothing is admitted here. A refusal rides the admission's own responder, so
the browser reads one vocabulary either way, and the form treats any non-200 as "no warning".

The route exists because the browser used to call the door directly with the WIRE spelling
(`documentDate`, `totalCents`) while the door reads the database's (`document_date`,
`total_cents`), so the "same money on the same day" signal could never fire from the shipped form.
`apps/web` does not depend on this package, so one translation on the server is the alternative to
two hand-written ones. `tests/trade-invoice-e2e.mjs` leg 8 drives the browser's own wire body
through this route against a real database and sees that signal fire.

**#1007 — the door also carries the choice a warned person made.** `POST /api/work/trade-invoice`
takes one optional key, `acknowledgeDuplicates`: the ids of the earlier invoices the person was
SHOWN and recorded anyway. `toAcknowledgedInvoiceIds` is the shape guard (a list of ids,
de-duplicated because the same invoice named twice on one screen is ONE thing a person was shown)
and refuses in this lane's own namespace and the DATABASE's own vocabulary —
`invoice.acknowledge_duplicates`, `unknown_acknowledged_invoice` — which is also what keeps a
trade-invoice path out of the JOURNAL composer's refusal roster
(`apps/web/tests/journal-refusal-roster.test.ts` reads every bare `invalid("…")` literal in
`workRoutes.ts` as a path THAT composer must map to a control).

When the list is non-empty the handler calls `clara.record_trade_invoice_duplicate_ack` **before**
`clara.admit_trade_invoice_work`, on the same connection and under the same intent key.
`withRuntime` is autocommit, so the two are two transactions whichever way round they go; this
order makes the only possible inconsistency "a choice that led nowhere" — an acknowledgement whose
admission then refused, which no read surfaces, because `clara.get_trade_invoice_duplicate_ack`
reaches one through an ADMITTED Work. The other order would make it "a knowing second recording
that looks like an accident", which is the distinction #1007 exists to preserve. An absent, null
or empty list is the ordinary recording and writes nothing.

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
  `malformed_lines`. It is now a typed 409 `source_reread_since_parse`, and #986 (below) is the way
  forward from it.

`tests/opening-ledger-source-e2e.mjs` is the standalone leg that runs the whole chain on real
Postgres. It bootstraps **no Workflow World**, measured rather than skipped: no workflow touches the
opening lane, so AC7's database-boundary clause applies.

### The re-read remedy (#986)

`source_reread_since_parse` was honest and still a dead end: the basis's targets then cite an
extraction the document has superseded, so `clara.approve_opening_seed` refuses them too
(`extraction_not_accepted`), and the only escape was to cancel the basis and start another. And a
fresh op key is NOT the fix — it succeeds and leaves the old targets standing beside the new ones,
because a second reading mints new region ids and therefore new `line_key`s.

`refreshOpeningTargets` (same module) is the second door, reached at
`POST /api/opening/refresh-targets` with the same bookkeeper+ floor, the same single clara_runtime
transaction and the same F-H7 re-assertion. It shares the parse's WHOLE read half —
`readOpeningParseSubject`, extracted from `parseOpeningTargets` without changing one branch — and
calls `clara.refresh_opening_targets_from_reread` (migration 0286) under
`openingRefreshOpKey(seed, document, extraction)`: a retried refresh of the same reading replays,
a LATER reading is a new act. It answers 202 `{status:'refreshed', lines, retired}`, and 409
`{status:'refused', reason:'no_reread_to_refresh'}` on a basis nobody re-read, so it can never
become a second road past the pinned parse key.

**`openingOpKey` did not move**, and that is the point: `parseOpeningTargets` refuses a re-read
exactly as it did before, and `clara.record_opening_targets_parsed`'s body sha is pinned in 0286's
prestate AND tail.

**A receipt with no counts is not a successful refresh** (review round 1, ADV-08).
`clara._reserve_op` answers `{pending:true}` when the key is held with no stored result, and the
door returns that envelope verbatim on its dedupe branch. Reading the counts as
`targets_recorded ?? lines.length` painted that envelope as a 202 "N read, 0 retired" — an act
that did nothing, reported as news. `refreshOpeningTargets` now answers a typed 409
`{status:'refused', code:'CLR13', reason:'operation_in_flight'}` for a receipt carrying no
`targets_recorded`, and the counts it does report are the RECEIPT's own, never the payload's
length: how many lines the new reading carried and how many the reading it left behind had are
facts about the DOCUMENT, not about what this process happened to send. The state is hard to reach
(the door takes `opening_seed_registry FOR UPDATE` before its reservation, so two callers
serialize and the reservation and the receipt commit together), which is exactly why it must not
be papered over. A DB-side mirror of #936's own `pending` branch was considered and left out: no
cell could ever drive it through the door, so it would be untestable defensive code inside a
migration whose tail census cannot reach behaviour.
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

**The at-CREATION refusal — #965 (migration 0254).** A ceiling refusal at `create_document_intake`
is no longer an exception: the door COMMITS the refused intake at `failed`/`limit` and RETURNS
`refused: true` with its ceiling (`documents`/`pages`), firm, filename, moment and the database's
own sentence. `beginDocumentIntake` hands that outcome UP rather than throwing — it mints no upload
capability and writes NO sidecar, so `recoverPendingDocumentIntakes` never re-drives a refused
intake — and the ONE place it becomes the uploader's answer is `POST /api/intake/documents`, via
`intakeLimitRefusal()`, which `mapIntakeError` maps to exactly the `429 {error:"limit",
message:"intake limit reached"}` the raised CLR18 produced before (pinned by
`p965.runtime.uploader_answer_unchanged`). In a BATCH, `beginIntakeInBatch` must not roll back —
the record is the point — so `commitRefusedMember` attaches the refused intake, declares
`awaiting_capacity` through the governed `set_intake_batch_member_dependency` door with that same
verbatim reason, and COMMITS. Both door calls sit under SAVEPOINTs: they answer typed on a refusal,
but the failed statement has already aborted the transaction and `commit` on an aborted transaction
is a ROLLBACK, which would take the refusal record with it. A batch that closed between the upload
and the refusal therefore costs the membership (`member_id`/`dependency` come back null) and never
the record. `mapIntakeError`'s CLR18 arm is untouched — the post-custody resize refusal above still
raises and still maps there.

**The World leg.** `tests/intake-batch-e2e.mjs` is standalone (not collected by `node --test`) and
needs the world bootstrapped first (`pnpm --filter @clara/runtime exec bootstrap`). Its N is
MEASURED, not quoted: 100 ≤1MB PDFs is exactly what a fresh firm admits in one daily window — an
`Asia/Kuala_Lumpur` calendar day since #964's 0252, not the UTC day this line used to name. It records,
rather than hides, children lost to a Windows-only EPERM race between the reconciler's sidecar
reads and `writeIntakeMeta`'s `rename` (the #693 family). Runs THIRD on the same shared
`clara_intake_ci` database and world `intake-e2e.mjs` and `intake-admission-e2e.mjs` build (#967) —
it does NOT call `tests/queue-drain.mjs` itself (nothing in the CI job follows it on this database),
but it is the leg that inherits a clean queue from the two before it now draining their own before
they exit.

**THE BELT'S COUNTERS DISTINGUISH A REFUSAL FROM A DEAD END.** `reconciler-batches.mjs` returns
`batchCancelFailed` for refusals and `batchCancelBlocked` for a parent whose EVERY child refused
CLR04 — which means its stored canceller has lost authority and no future sweep will change that,
because the fan-out cannot substitute an identity (`clara._work_door_ctx` hashes `{work, author}`).
The blocked parent is logged by name and `clara.get_intake_batch` reports the same condition to the
human as `cancel_blocked`.

**#1027 — LEG 4 CONVERGES BEFORE IT JUDGES.** The cross-firm poison leg used to make two
single-shot observations (one sweep, one read, twice) of facts the World produces asynchronously,
and it discarded its own settle failures. Both observations reddened CI at random, on `main` and on
a feature branch (jobs 105954490814 and 106051996127). Both are now bounded polls in
`tests/queue-drain.mjs`'s shape — re-run the sweep, re-read the state — each with ITS OWN measured
deadline: `CLARA_P636_LEG4_P_DEADLINE_MS` 5 s for the refusal count (3.3x the worst lateness ever
measured, and deliberately under the ~8 s in which the World drives firm P's own children terminal,
past which no amount of waiting can help) and `CLARA_P636_LEG4_Q_DEADLINE_MS` 8 s for firm Q's
terminal state (2.9x its worst, larger because the engine rather than this fixture produces it);
poll 500 ms. Nothing is weakened: the refusal count is cumulative over the polled sweeps and must
still reach at least one, it must now ALSO be ATTRIBUTED to firm P (`batchCancelBlocked`, which the
belt raises only for a parent whose every child refused CLR04, plus `clara.get_intake_batch`'s own
per-parent `cancel_blocked` verdict observed inside the same loop), firm Q must still reach
`cancelled`, `batchCancelOk` is asserted on EVERY sweep rather than one, and a settle that cannot be
performed is retried inside the deadline and then named with its task id and last error instead of
being swallowed. A deadline prints both firms, both parents, both states, every child's Work status,
the refusal and blocked counts, both `cancel_blocked` verdicts and the last receipt, so a red is
diagnosable from the job log alone.

Measured on throwaway clones of a migrated database (WSL, Node 22): unperturbed, both polls converge
on the FIRST sweep in 8-40 ms, so the happy path costs nothing. Under
`CLARA_P636_LEG4_FAULT=slow_settle` (firm Q's children held running with every settle held back) the
leg's own settles never land and firm Q's parent still converges — 6 sweeps over 2774 ms, driven by
the World — where the single-shot read failed at once. Under `CLARA_P636_LEG4_FAULT=late_poison` (the
poisoned parent's decision lands 1.5 s late) the refusal is counted after 4 sweeps in 1554-1673 ms,
where the single-shot read failed at once; that run is also the standing proof that the per-parent
`cancel_blocked` verdict is not a constant, because the loop polls through three sweeps of `null`
before it flips. With the belt deliberately broken so a refusal is recorded as a success, the polled
block still reds — at its deadline, 11 sweeps in 5560 ms, with the census.

**What #1027 did NOT fix, and how to recognise it.** Firm P's children are ordinary admitted Work,
so the World can drive them terminal on its own within seconds; when it does, the parent has no live
children left and the belt settles it — correctly. A leg slow enough to see that reds on "firm P's is
honestly still stopping", or on the refusal deadline. THE CENSUS IS WHAT TELLS THAT APART FROM A REAL
BELT REGRESSION, and firm P's children reading `failed` is not by itself the discriminator: the same
census appears when the belt stops counting refusals at all. Read the counters instead.
`blocked >= 1` (and `cancel_blocked=canceller_not_active` at the moment of the red) means the belt
DID refuse firm P's children, so a terminal parent means the World terminalised them first: the
#1028 race, below. `refusals=0 blocked=0` means the belt is not counting firm P's refusals at
all: a regression, and exactly what this leg's vacuity control produces (measured: a `fanOutCancel`
that records a CLR04 refusal as a success reds the P loop at its deadline after 11 sweeps in 5560 ms
with `refusals=0 blocked=0`, throwaway clara_814).

**#1028 — THE THIRD RACE: THE ENGINE CAN FINISH FIRM P'S CHILDREN BEFORE THIS LEG EVER LOOKS.**
Firm P's two children are ordinary admitted Work; the World dispatches them the moment
`seedChildren` returns, well before `applyPoison` even runs, and the recovery belt settles a
running Work whose engine run it does not know (the same behaviour `postEntry`'s own comment
documents) within seconds. Once both are terminal the parent has no live child left and the belt
correctly settles it — `clara.sweep_intake_batch_cancellations` / `reconcileIntakeBatchCancellations`
did nothing wrong. The leg used to read that as `assert.equal(pFinal.state, "cancelling", …)`
unconditionally, so this read a genuine defect indistinguishable from a real one: a red that says
"declared done" whether the belt actually swallowed a refusal or the World simply won a race with
this leg's own final check. #1027 made the failure legible (both counters, both firms, the
`cancel_blocked` verdict) but deliberately did not fix it — out of that ticket's own scope.

**The fix does not depend on the engine being slower than the leg.** The disjointness check now
branches on whether a live child remains, never on timing: `cancelling` is read once as before (a
negative that converges is a negative that was never true, so it stays unpolled); any other state
is accepted ONLY IF `clara._intake_batch_live_children` returns nothing for that parent — in which
case the leg logs it as the correct outcome it is and moves on — and still throws, exactly as
before, if a live child remains while the parent reads terminal (the belt settling the estate
prematurely, the one genuine regression this leg exists to catch). The refusal-counting and
attribution assertions above (`pWatch.refusals >= 1`, `blocked >= 1`, `cancel_blocked=
canceller_not_active`) are untouched and still run before this check, so a belt that stops counting
refusals still reds there regardless of how firm P's children finish.

**THE LIVENESS PREDICATE IS THE ESTATE'S OWN, NOT A SECOND SPELLING OF IT** (review SPEC-1028-01).
The leg asks `clara._intake_batch_live_children($1)` — the function
`clara.sweep_intake_batch_cancellations` itself settles a parent by
(`packages/db/migrations/0229_intake_batches.sql`) — rather than re-deriving liveness from a Work-
status set. A status set is only HALF of that function: it also excludes a child that already
holds a committed `clara.operation_receipts` row, which is out of the belt's hands while its Work
status is still non-terminal. Re-spelling it here would have made a parent the belt settled
CORRECTLY read as "settled prematurely" — the exact opposite of what the leg says. Both the
`engine_wins` fault's own wait and the "honestly still stopping" branch read the same function, so
what the fault waits for and what the assertion checks cannot drift apart, and both branches now
PRINT the rows they read instead of asserting a live child remains without looking.

**`CLARA_P636_LEG4_FAULT=engine_wins`** is the new, third fault value (`late_poison` and
`slow_settle` are #1027's own two): it WAITS — a fixture action, never a belt one — for firm P's
parent to have no live child left, then sweeps the belt once more so the parent's own
settlement is visible before the disjointness check reads it. It manufactures deterministically what
a slow host produces by accident, so the fix is proved against the exact scenario rather than hoped
for. Measured on throwaway clones of a migrated database (WSL, Node 22, `/opt/node/bin/node`):
against the PRE-#1028 disjointness check (throwaway clara_704), `engine_wins` reds after firm P's
two children reached terminal in 6205 ms — `AssertionError: …and firm P's is honestly still
stopping… actual: 'cancelled', expected: 'cancelling'` — the exact defect this ticket exists to
close. Against the fixed check the same fault (throwaway clara_703) PASSES: children terminal after
5051 ms, and the same fault re-run against the estate-predicate check (throwaway clara_722 and
clara_725) passes too: `LEG4 firm P's parent reached 'cancelled' with NO live child left by the
estate's own reckoning (the #1028 race, not a belt defect) — refusals were still COUNTED (2) and
ATTRIBUTED (blocked=1, door read canceller_not_active during polling) before the engine got
there.`

The belt's own vacuity control (`fanOutCancel` rewritten so a CLR04 refusal records as a success, no
`engine_wins`, throwaway clara_705) still reds at the P-loop's own refusal deadline —
`refusals=0 blocked=0` after 9 sweeps in 5604 ms — because that assertion runs and fails BEFORE the
disjointness check is ever reached: the fix adds no new way for a genuine regression to slip
through. Five consecutive clean runs against fresh clones (clara_706…clara_710, no fault) all pass,
and the estate-predicate check repeats that on fresh clones clara_721 and clara_724, each logging
"firm P is honestly still stopping — 2 live child(ren) remain: […member_id/work_id…]" (the
ordinary, unpolled path is unchanged, and now prints what it read). Its own vacuity control:
forcing the else branch (`if (false)`) on a clean run, while both children are still live, reds
with "firm P's parent was declared done while it still had a LIVE child" and the two live rows
named (throwaway clara_723, exit 1) — restored byte for byte afterwards. `packages/runtime/lib/intake-batches.mjs`'s `fanOutCancel` was restored
byte-for-byte after the vacuity control (`git status`/`git diff` clean, verified).

## #1026 — the live gates' heap budget

**The defect.** Every `db-live-gates` step that boots a durable World ran its leg at the host's
default V8 ceiling (~4144 MB on the runner and on this rig), and nothing declared otherwise. A leg
that boots the bundle, the Workflow world, the leader, the engine and a hundred concurrent document
ingests in ONE process has no reason to collect its churn until that ceiling, so peak memory for a
single run of ONE leg varied between 2.0 GB and 4.4 GB on identical code, and twice the job simply
died: job 105215992382 (2026-09-17, Wave-B fault gates) and job 106048901216 (2026-09-20, the #636
intake batch leg), both `FATAL ERROR: Reached heap limit`, both exit 134.

**The budget, and where it lives.** `scripts/ci/world-gate.mjs` — ONE place,
`HEAP_BUDGET_MB = 2048`. Every leg in `.github/actions/db-live-gates/action.yml` is launched through
it (`node "$GITHUB_WORKSPACE/scripts/ci/world-gate.mjs" tests/<leg>.mjs`), so the budget reaches the
leg AND every process it spawns, through `NODE_OPTIONS` — appended to whatever the caller already
set, never replacing it. One step that has been measured to need a different ceiling states it with
`CLARA_GATE_HEAP_MB` on that step, with its measurement recorded beside it. A leg that dies by the
budget is attributable: the launcher prints the step (`CLARA_GATE_STEP`), the command, the pid and
the budget as a GitHub `::error::` annotation. An ordinary red (exit 1) is never blamed on memory —
`scripts/ci/world-gate.selftest.mjs` holds that as a cell, and runs in `pnpm lint`.

**The measurement method, and where the figures live now.** The table below was measured by hand on
a throwaway database cloned with `createdb -T` from a migrated template, one leg per run under
`/usr/bin/time -v` (peak RSS) with `--trace-gc` parsed for peak heap occupancy (WSL 2, Node
v22.23.2, 24 GB host shared with ten other workers). Reproduce with the same two figures on both
sides of any change to the budget.

That is a one-off, and a one-off only ever covers the legs somebody had time to run. So the
measurement is now CONTINUOUS: on Linux the launcher samples the child's own `/proc/<pid>/status`
VmHWM and prints one line per leg,

```
[world-gate] peak <step> | node <leg> | budget 2048 MB | peak RSS <N> MB (<p>% of budget) | exit 0
```

so every CI run of `db-live-gates` records all 24 legs by itself. Read them out of a job log with
`grep '\[world-gate\] peak'` (`gh api repos/<owner>/<repo>/actions/jobs/<id>/logs`). It is
best-effort by construction — off Linux the line says the figure is unavailable, a read that throws
is counted and ignored, and nothing about it can turn a green leg red.

| Leg | Budget | Peak RSS | Peak heap occupancy | Wall clock | Result |
|---|---|---|---|---|---|
| `intake-batch-e2e.mjs` | host default (4144) | 2.22-4.21 GiB over 17 runs | up to ~4.1 GB | 1:02-3:11 | passed here; aborted twice in CI |
| `intake-batch-e2e.mjs` | 2048, no in-process bound | 1.97 / 2.11 GiB | 1832 / 1969 MB | 0:56 / 1:14 | pass |
| `intake-batch-e2e.mjs` | 2048 + heap bound | **0.82 / 0.88 / 1.06 GiB** | 696 / 734 / 926 MB | 2:35 / 2:46 / 3:22 | **3 consecutive passes** |
| `intake-batch-e2e.mjs`, THROUGH the launcher | 2048 + heap bound | **0.79 / 0.91 / 0.93 GiB** | bound peak 657 / 717 / 795 MB | 2:00 / 2:17 / 2:51 | **3 consecutive passes, final code** |
| `intake-admission-e2e.mjs` | 2048 (through the launcher) | 1.15 GiB | — | 0:46 | pass |
| `accrual-e2e.mjs` | 2048 (through the launcher) | 0.43 GiB | — | 2:07 | pass |

**Why the budget alone is not the whole fix, and what the in-process bound costs.** V8 grows to
whatever ceiling it is given: at 2048 without an in-process bound, occupancy runs right up to the
ceiling before every collection (1832-1969 MB of 2048) and peak RSS lands at 98-105 % of the budget,
so no budget can ever be "25 % above the measured peak" while the peak is defined by the budget.
What the leg actually RETAINS is ~140-210 MB — the post-collection floor in its own GC trace,
consistent with `tests/heap-bound.mjs`'s independently measured 119 MB live set. So
`intake-batch-e2e.mjs` now also arms `startHeapBound()` (the helper `interview-e2e.mjs` has used
since the 2026-09-17 abort), which forces a full collection whenever the heap passes 512 MB.
**THE BOUND, NOT THE BUDGET, IS WHAT BUYS THE 25 % MARGIN**: it costs 8 to 30 forced collections per
run and takes peak RSS from 1.97-2.11 GiB to 0.79-1.06 GiB, about half the budget.

Its price, against the LIKE-FOR-LIKE baseline (the same rig, the same budget, the bound the only
difference): **2048 without the bound ran 0:56 and 1:14; 2048 with it ran 2:00 to 3:22** — the bound
roughly doubles this leg's wall clock here. (The step took 179 s on the runner itself in CI run
35508993162, against 107-172 s historically at the default ceiling, so the doubling is a property of
this loaded 24-core host, not of CI.) Two consequences worth keeping in mind:

- The leg's post-change peaks are a property of the bound's 512 MB forced-collection threshold
  (`tests/heap-bound.mjs`), not of the runtime. They are NOT comparable with any pre-change figure,
  and any future review of the budget must hold the bound constant.
- Whether the longer wall clock widens the window of LEG 4's third race (firm P's children being
  driven terminal by the World) is **not** established. What IS measured is that LEG 4's own polls
  are unaffected: with the bound armed, both converge on the first sweep in 8-40 ms across five
  consecutive runs, the same as without it. The window opens on elapsed time inside LEG 4, and LEG 4
  does not get slower; the rest of the leg does.

**The two historical aborts, re-checked.** Job 105215992382 died in `interview-e2e.mjs`, which
already arms `startHeapBound()` (added in response to that very abort) and now also runs under the
2048 MB budget — a process that holds a flat 119 MB live set cannot reach a 2 GB ceiling, so that
signature is closed on both axes. Job 106048901216 died in `intake-batch-e2e.mjs` at 4018 MB of a
4144 MB ceiling; the same leg on this rig now peaks at 1.06 GiB of a 2048 MB (2 GiB) ceiling across three
consecutive passes, with the retained set two orders of magnitude below the budget. Neither can be
re-run against the new budget on its own runner from here, so this is a re-check by measurement of
the same legs, not a replay of those two jobs.

**All 24 legs, on the runner.** CI run 35508993162 (job 106073526212, `db-live-gates`, 21m29s) is
green at this branch's head with every leg through the launcher at 2048 MB: the Slice-5 step 178 s,
the #633 step 13 s, the #636 step 179 s, the Wave-B step (20 legs) 668 s, no `::error::` annotation
and no `Reached heap limit` anywhere in the log. That establishes that every leg PASSES at the
budget; the per-leg peak line above is what will record what each of them actually used, from the
next run onwards.

**Not covered.** The `nitro build` children the #637 two-build drill spawns inherit the budget
through `NODE_OPTIONS`; a full runtime build was measured to succeed under it, with the control that
the same build at `--max-old-space-size=48` dies with exit status 134, so the flag is provably in
effect. The three `pnpm --filter @clara/runtime exec bootstrap` calls that PROVISION the World are
deliberately outside the budget (short-lived DDL, not a World-booting process, and neither historical
abort was in one) — the action's own comment says so. A leg that turns out to need more than the
budget says so attributably and raises it with `CLARA_GATE_HEAP_MB` plus its own figure.

## #852 — the chat-clarify belt inside the sweep receipt

**What moved.** `reconcileChatClarifies` used to run from `lib/leader.mjs`, in its own try/catch,
beside `runReconcilerSweep`. It is now the FIRST belt inside the sweep, registered exactly like
every sibling. `leader.mjs` reads its counters off the sweep result and no longer imports it.

**Why it was outside, and what the fix actually is.** The reason was IMPORT DIRECTION, not cadence:
`lib/reconciler-chat-clarify.mjs` read `isHookNotFound` and `resumePayloadFor` from
`lib/control.mjs`, and `control.mjs` imports `settleCancelledByKind` from `lib/reconciler.mjs` — so
registering the belt inside the sweep closed `reconciler → chat-clarify → control → reconciler`.
Both symbols now live in `lib/hook-resume.mjs`, a LEAF that imports nothing first-party; `control.mjs`
re-exports them by name so every existing import site keeps resolving. The edge is removed rather
than routed around.

**What the receipt now carries.** The five `chatClarifyResumed / Expired / Landed / ProbeFailed /
SettleFailed` counters ride `runReconcilerSweep`'s returned object, and a belt failure is named in
`beltErrors` as `"chat clarify reconcile"` (logged with the estate's `[reconcile] <belt> error:`
idiom) instead of being a log line only the leader could see. The estate law still holds: a FAILED
belt contributes no counters at all, so `"chatClarifyResumed" in swept` is positive evidence that
the belt was REACHED and did not throw — not that it did any work: the belt returns the same
zeroed counter bag, and issues no statement at all, when `resumeHook` is absent or the delivery
columns are not there yet.

**Order.** The belt runs first of the belts and immediately after the heartbeat — the heartbeat is
not a belt but the sweep's one deliberate fail-fast. Say the consequence out loud, because an
incident is the wrong time to rediscover it: a sweep that cannot record its own beat now skips
this belt too, where the leader's old standalone call ran regardless. That follows the heartbeat's
own argument (nothing that breaks a single-row upsert would spare a belt on the same connection),
and the next sweep is ~2 s away. The order is load-bearing: `reconcileTasks`'
section C would mirror engine truth onto the same parked chat turn as `cancelled`/`engine_lost`,
and only this belt writes the honest `expired` + `clarify_closed` terminal.

**Evidence.** `tests/chat-clarify-sweep-wiring.test.mjs` (eight cells: the leaf's empty import list,
the belt closure never reaching `reconciler.mjs`, the ONE pre-existing `reconciler ↔ reconciler-wake`
cycle pinned by name, the five counters, the contained failure, the statement order, the leader's
silence). `tests/control-chat-clarify.test.mjs`'s `chat.wiring` cell pins the registration.

## #966 — the intake recovery belt can no longer fail a live intake

**The defect, measured.** `recoverPendingDocumentIntakes` opened and parsed EVERY pending intake's
spool sidecar on every leader sweep, though it acts on at most ten. A live intake writes its own
sidecar atomically (temp file, then `rename()` into place) and on Windows a `rename()` over a
destination another handle holds open fails `EPERM` — so a sweep landing between two
`writeIntakeMeta` calls threw inside the intake, which was then failed with an untyped `internal`
(a 500 on the byte PUT). #636 measured one child in six at the default 2 s cadence.

**Both halves of the fix.**

- **The writer.** `lib/spool.mjs`'s `atomicJson` now renames through `renameIntoPlace`, which
  retries only `EPERM` / `EACCES` / `EBUSY` against a deadline (`CLARA_SPOOL_RENAME_RETRY_MS`,
  default 250 ms) and surfaces every other failure immediately. A reader's handle lives for
  microseconds, so the retry turns a hard failure into a sub-millisecond wait — the shape
  `graceful-fs` has shipped for a decade. A rename that still fails takes its temp file with it.
  The deadline is 250 ms rather than the 2000 ms of the first cut because a handle that is NEVER
  released (a stuck indexer or AV scan) costs the full deadline once per status transition per
  intake, on the intake path — measured at `EPERM after 2003 ms`. The answer is the same either
  way; only the stall differs.
- **The reader.** `listIntakeMetaEntries()` returns DIRECTORY METADATA — `{name, path, mtimeMs,
  read()}` — and opens nothing. `stat()` does not hold a handle a rename can block; `open()` does.
  The belt's recency guard (always there, always five seconds) now runs on `mtimeMs` BEFORE the
  open rather than on the sidecar's `updatedAt` field after it. The quiet skip happens BEFORE any
  budget is taken, so a spool full of live uploads cannot starve the belt of the crashed intake
  behind them. `listIntakeMetas` / `listTaskMetas` keep their exact old contract, expressed over
  the lazy shape so the two cannot drift. The knob is `CLARA_INTAKE_SIDECAR_QUIET_MS` (default
  5000).
- **The ten are ten sidecars that CARRY AN INTAKE** (fix round 1; wording corrected in fix round 2
  after review finding SPEC-3). The first cut took its ten off the raw listing, so a sidecar
  carrying no intake — the `{corrupt, file}` marker, a body with no `intakeId`, a file collected
  between the listing and the read — spent one of the ten, and ten such files ahead of a crashed
  intake blinded the belt silently. Before #966 that was impossible, because the filter ran before
  the slice. The belt now reads past those without spending a slot (`RECOVERY_BATCH`), under a
  separate, larger bound on opens (`RECOVERY_OPEN_BUDGET`, 3x), because an open is still the handle
  a live rename collides with. **It is not ten actions in the wider sense, deliberately:** a
  sidecar that carries a real intake in a status the belt cannot act on — `uploading`, `receiving`,
  a large body still streaming, whose last status write is older than the quiet window — spends a
  slot while nothing is done with it, exactly as it did before #966. Exempting those would let one
  sweep open up to thirty live sidecars instead of ten, tripling the belt's handle-taking on the
  very files this ticket exists to stop touching; and unlike `{corrupt}` junk, a live sidecar
  clears itself, because it carries a 15-minute capability and the expiry arm is an action the belt
  always takes. `tests/intake-sidecar-race.test.mjs`'s `p966.budget: a settled LIVE upload DOES
  spend one of the ten` pins both halves. Unreadable sidecars are reported once
  per sweep — `[reconcile] intake recovery skipped N unreadable sidecar(s) this sweep: …` — never
  once per file. The residual is stated rather than hidden: more than thirty settled-but-unusable
  sidecars ahead of a crashed one still delay it, and `sweepSpoolTtl` is what ends that — it now
  reaps any `intake-*.(bin|json)` past the TTL, not only uuid-named ones, which is the one shape
  no `removeIntakeSpool(id)` will ever be called for. (`atomicJson`'s `.tmp` files stay unmatched;
  the writer that made them removes them.)

**A consequence, stated.** An intake whose capability has already expired but whose sidecar was
written in the last five seconds is expired on the NEXT sweep rather than this one. That is the
guard doing its job: a sidecar written moments ago belongs to a request still in flight.

**Evidence.** `tests/intake-sidecar-race.test.mjs` — the host property measured both ways (a held
read handle IS `EPERM`; a `stat` is not), 500 writes against concurrent sweeps with zero failures
(428 of 500 failed before the fix), the quiet-window sidecar never opened (counted double), the
ten-action budget past twelve unusable sidecars, the thirty-open bound, the give-up deadline under
a permanently held handle, the TTL reap of an unreadable sidecar, the expiry arm, and the listing
contract. Every cell that touches the filesystem takes its own spool directory, so the suite's
result never depends on the order its cells ran in or on how long the box took between them. `tests/intake-db.test.mjs` carries the
end-to-end recovery cell (`p966 the belt still recovers a crashed mid-flight intake`) and the
abandoned-sidecar expiry cell, both of which now age their fixture's mtime rather than sweeping
against a file they wrote in the same millisecond.

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
`TRADE_INVOICE_FIELD_DEFAULTS`, rows of DATA saying which control to focus when the door raises a
party refusal with no `field` at all — `party_ambiguous`, and since #982 (migration 0274)
`party_identifier_conflict`, the refusal raised when a document's registration number and its TIN
name two different live parties. The second reason needed no code at all, only a second row, which
is the shape's whole claim.

**403 and 404 carry no carrier.** A 404 here answers both "no such Work" and "a Work that is not
this firm's", and that identity is the point — no existence oracle across firms. A typed reason on
it would loosen an access answer.

**The carrier is measured over the real wire in three World e2es, not one.** `workErrorResponse` is
driven as a pure function by `tests/work-routes-unit.test.mjs`; what an actual HTTP response
carries is pinned by `tests/work-journal-e2e.mjs`, `tests/periodic-adjustment-e2e.mjs` and
`tests/staff-expense-claim-e2e.mjs`, each of which reads the unfiled-document 400 off the socket,
destructures `detail` out, asserts the promoted half is exactly what it was before #981, and
asserts the door's own object beside it. All three carried the same pre-#981 literal
`assert.deepEqual(body, {error, field, reason})`, and `node:assert/strict` deepEqual is
deepStrictEqual — one additive key fails it. Any future change to the promoted half of a
durable-Work refusal has to move those three lines together.

## The prior-GL seeding lane is retired (ticket 1012, migration 0288)

`POST /api/seeding/prepare` and `src/seedingRoutes.ts` are **GONE**. Owner ruling 2026-09-20 (on
ticket 983): the prior-GL seeding lane gets no browser entrance, because the product direction is
the Client KB — nobody pre-registers by hand what Clara can learn from a source. Migration
[`0288_seeding_lane_retired.sql`](../db/migrations/0288_seeding_lane_retired.sql) recut
`clara.create_seeding_batch`, `clara.tick_seeding_proposal` and `clara.decline_seeding_proposal`
to one shared typed refusal — `CLR34`, `detail.reason = "seeding_lane_retired"`, one sentence —
raising ahead of any reservation, so a retired door writes nothing at all.

**Why the route is removed rather than left to relay.** A route in front of a door that refuses
every input is a decoy a future surface could be wired to: the same reason
[`0271`](../db/migrations/0271_retire_create_account_set_v1.sql) gave for dropping a body with no
callers. The DOORS keep their signatures and grants, because a caller must meet the retirement and
not `42501 insufficient_privilege`; the ROUTE has no such obligation, because no caller of it
survives.

**What stays, and why.**

| Surface | State |
|---|---|
| `lib/seeding-parse.mjs`'s READ half (grammar, xlsx reader, region/cell readers, `entriesToProposals`) | Untouched. It is the deterministic prior-GL reader the Client KB lane inherits (ticket 663). |
| `lib/seeding-parse.mjs`'s `prepareSeeding` | Kept, uncalled. It is the only place the three readers are composed end to end. Its last step now meets the retirement, and `mapSeedingDbError` maps that to **410 Gone** with `{status:"retired", reason:"seeding_lane_retired", message}` — never 409 or 422, which a caller would read as "retry" or "fix the source". |
| `lib/wiki-projection.mjs`'s `seeding.proposal_decided` lane | Untouched, and it must stay: a hosted firm's HISTORICAL ticked proposals still replay into deterministic wiki pages. It simply never receives a new event. Proven in `tests/wave-b-seeding-prepare.test.mjs`'s replay cell, which plants a ticked proposal and its decided event and drains the projection. |
| `clara.cancel_seeding_batch` / `clara.complete_seeding_batch` | Byte-unchanged. A batch left open at the moment of retirement must still be closeable by the firm that owns it. |

## #980 — the shared World harness's third script, and the trade-invoice lane's park and cancel

`tests/work-journal-serve.mjs` is the child bootstrap nine standalone World e2es spawn. It offered
two scripted-model conversation shapes, `post` and `narrate`, so no lane spawning it could reach
the ONE place a run blocks on a human. It now offers a third, `ask_question` (#980): read the
chart, ask ONE typed clarifying question and stop, and record the admitted basis only once the
answer comes back as a `tool-result` for `ask_question`. The branch is the shape
`tests/work-question-serve.mjs` already drove for the journal lane, lifted into the shared file;
`post` and `narrate` return before it and no existing caller sets the new value, which
`tests/work-journal-e2e.mjs` — the estate's only `narrate` driver — confirms on the rig rather than
by reading. The census behind "no existing caller" is one grep over `CLARA_WORK_TEST_SCRIPT`: all
NINE spawners of this bootstrap `delete base.CLARA_WORK_TEST_SCRIPT` when they build the child env,
so the `post` default applies; `accrual`, `plan-occurrence` and `prepayment-occurrence` re-set it to
`"post"` explicitly on their crash legs; `work-journal-e2e.mjs` sets `"narrate"` on one leg; and
only `trade-invoice-e2e.mjs:609` sets `"ask_question"`, with the scope var beside it. No other
value is set anywhere in the repo.

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

**The `ask_question` script is scoped to ONE client, and the scope is mandatory.** One supervisor
serves every queued accounting Work on the database — leftovers from earlier legs and from earlier
crashed runs included — so an ask arm that fired on whatever the process picked up parked FOREIGN
Work on a question nobody is holding, and `awaiting_input` is a state no leg polls out of: the next
leg times out after 90s instead of measuring anything, and the row stays pending on the rig for
good. `CLARA_WORK_ASK_ONLY_CLIENT` names the client whose Work may be asked; every other Work takes
the `post` branch exactly as the default script would have taken it, and a caller that forgets the
scope gets a loud child exit rather than a quiet park on a stranger's Work. Leg 6 admits a
BYSTANDER Work for a second client in the same window and asserts it was never asked and settled on
its own — the cell that says so. **This is a deviation from #980's own wording** and is recorded
as one (reviewed finding L10S-3): the ticket says the third shape is "selectable the same way" as
the other two, i.e. by `CLARA_WORK_TEST_SCRIPT` alone, and it takes two env vars instead. Deriving
the scope from whatever envelope the process picked up first would put the choice back in the
hands of queue order, which is the failure the gate exists to prevent; folding the two into one
selector value (`ask_question:<client id>`) is open to a later lane.

**Four World e2es' local gates now admit `clara_l<NN>`**, the per-lane database shape of the riders
wave, beside `clara_rt_test` / `clara_wave_b_ci` / `clara_<ticket>`: `trade-invoice-e2e.mjs`,
`work-journal-e2e.mjs`, `periodic-adjustment-e2e.mjs` and `staff-expense-claim-e2e.mjs`. Still
loopback-only, still a parsed DSN equality check against the PG env, still fail-closed. The
standing follow-up named here (one shared `tests/local-db-gate.mjs`) landed as #1018 — see that
section below.

**No World e2e removes its gate directory recursively.** `tests/trade-invoice-e2e.mjs`'s hold gate
cleans up its own two files and leaves `.trade-invoice-gates/` alone: the directory is shared with
every other gate on the rig, and `open()` — the one call that must never throw, because a held
child waits on that file forever — now re-creates its parent first. Both gate directories are
git-ignored, because a watchdog exit skips the `finally` that would have removed their files.

## #1018 — one shared local-database gate for every standalone World e2e driver

Every standalone runtime World e2e driver (the 23 `tests/*-e2e.mjs` files that spawn the shared
World test harness — `tests/shutdown-e2e.mjs` and `tests/world-e2e.mjs` never carried this gate,
so they are not part of the 23) used to hand-roll its own copy of the loopback-host +
allowed-database-name safety gate that runs before it does anything destructive: a `PGDATABASE`-
anchored regex, and for most drivers a second, independently hand-typed regex or URL-parsing block
re-encoding the same allowed names against `WORKFLOW_POSTGRES_URL`. Nothing stopped a driver's own
two copies from disagreeing (`work-journal-e2e.mjs` had exactly that drift, caught and fixed under
#980 before this ticket), and widening the gate for a new naming convention — the riders wave's
per-lane `clara_l<NN>`, admitted by only four of the twenty-three before #1018 — meant editing
every file by hand.

`tests/local-db-gate.mjs` now owns the checking logic only: `isLoopbackHost`, `allowedDbPattern`
(builds the anchored `PGDATABASE` regex and the matching `WORKFLOW_POSTGRES_URL` regex from ONE
alternation body, so the two can never independently drift again), `dsnAgreesWithEnv` (the
parsed-DSN equality style) and `assertLocalDbGate` (the combined guard every driver calls once,
with `checkDsnString` / `checkDsnParsed` flags because drivers disagreed on which DSN check(s) they
ran — `work-knowledge-e2e.mjs` ran neither, preserved as-is rather than widened into a new check by
this refactor). Each driver still supplies its OWN admitted database-name shapes via
`allowedDbPattern(...)`, composed from the named `DB_NAME_SHAPE` constants where a shape is shared
with another driver; no driver's admitted set changed as a side effect of the refactor.
`tests/local-db-gate-drivers-census.test.mjs` is AC3's own litmus test. It DERIVES the roster from
the directory listing — every `tests/*-e2e.mjs` that is not one of the two documented non-gate
files — and asserts the derived set equals the written one, so a driver added later reds the census
on its first day instead of being silently out of scope. For each file it reads the source text and
confirms it imports `./local-db-gate.mjs`, calls `assertLocalDbGate(...)`, and declares no local
`ALLOWED_DB`, no local `LOCAL_HOSTS`, and no anchored `/^clara_.../` database-name regex under
any other name either.

`tests/body-census-guard-db.test.mjs` is the twenty-fourth file that spawns a real World behind
this same gate (CI runs it as a World leg like the 23), and it is censused too — as a
`SKIP_GATED_WORLD_TESTS` entry rather than a driver, because a `node --test` file must DECLINE
rather than throw: a thrown gate fails the file instead of skipping it. It therefore composes
`isLoopbackHost`, `allowedDbPattern` and `dsnAgreesWithEnv` itself instead of calling
`assertLocalDbGate`, admitting exactly the two names it always admitted
(`clara_rt_test`, `clara_wave_b_ci`), and the census checks those calls instead. With both
rosters in place, no World-spawning file in this package carries a second, disagreeing copy of the
check.
