# Slice 5 document pipeline — Codex AS-BUILT review

Review date: 2026-07-19 (Asia/Kuala_Lumpur)  
Review target: `slice5-document-pipeline` at `9e95ef2c7e11a5400966b62f34f054a1d85800e1`  
Comparison base: `main` at `954ff3b4d369de1adeb8b72921ace115736abceb`  
Scope: committed `git diff main...HEAD` (83 files, +12,317/-146)  
Contract of record: `slice5-document-pipeline-contract.md` v1.2, companion migration design, and §13 AB-1..8

## Result

I found **13 unrecorded contract divergences: 6 HIGH, 7 MEDIUM, 0 CRITICAL**.

The strongest positive result is that the database security skeleton is materially sound: all 14 new tables are FORCE-RLS, app roles have no direct DML on them, cross-firm masked-view probes returned zero, the raw-login-only attribution writer is correctly isolated, no document wake is allowlisted, and the egress-denied claim remains unbound in `held_egress`.

The release-blocking risks are above that skeleton: intake authorization and revocation, a freeze-lint escape around the document workflow's actual behavioral body, non-replayable committed receipts, an unimplemented DB-first intake/reservation sweeper, missing executable Storage role/RLS doctrine, and correction completion without the required re-code work row.

## Findings

### F-01 — HIGH — Intake admits viewers and continues after uploader membership is revoked

**Location:** `packages/runtime/lib/authz.mjs:146-163`; `packages/runtime/src/intakeRoutes.ts:75-78`; `packages/db/migrations/0007_document_pipeline.sql:1757-1762,1784-1797`

**Contract:** companion §3.2 (`bookkeeper+`, ownership, chat-session predicate) at lines 115-122; contract §8 at lines 382-385 (`uploader leaves firm mid-intake → lease expires, intake fails honestly`).

`authenticate` resolves and returns the firm role, but the intake route never applies a role floor. `create_document_intake` checks only for an active membership. After creation, the upload capability writers check token, state, and TTL but never recheck live membership.

**Live reproduction (rollback-only, scratch DB):** a temporary `viewer` was admitted and received a real reservation.

```text
UPDATE 1
 bob_effective_role
--------------------
 viewer

 viewer_admission
-----------------------------------------------------------------
 {"status":"uploading",
  "intake_id":"2203d79f-8660-49dd-b462-84d1b80ce520",
  "reservation_id":"b5965b63-0c5e-4f92-8a7f-97e9b5d04832", ...}
ROLLBACK
```

A second rollback-only probe began an intake as an active bookkeeper, removed the membership, and then successfully claimed an upload lease using only the capability hash:

```text
 membership_after_begin
------------------------
 removed

 post_revocation_claim
--------------------------------------------------------------------------------
 {"intake_id":"17b9a0f1-468c-483e-b6e2-129e224f38c1",
  "lease_owner":"revoked-uploader-lease"}
ROLLBACK
```

**Impact:** a viewer can consume intake quota/spool/storage and create firm evidence despite the bookkeeper floor. A removed user holding the bearer capability can continue the intake within its TTL instead of reaching the contract's honest expiry path.

### F-02 — HIGH — `documentIngest_v1` freeze closure excludes its behavioral implementation

**Location:** `packages/runtime/workflows/documentIngest.impl.ts:29-33,61-63`; `packages/runtime/plugins/startWorld.ts:47`; `packages/runtime/lib/intake.mjs:446-506`; `frozen-workflows.json:20-26`

**Contract:** contract §4.2 (frozen `documentIngest_v1`) and §6 lines 330-358 (freeze-lint, crash drills, task CAS); workflow immutability law in the contract appendix/CLAUDE working law.

The frozen step calls `globalThis.__claraDocumentServices.process(taskId)`. That injected function resolves to `processDocumentTask` in non-frozen `lib/intake.mjs`, which contains the actual lane branch, canonical download, vendor/parser invocation, persistence arguments, failure mapping, and spool cleanup. It is not a first-party import in the frozen closure and is absent from the manifest.

**Reproduction:** the checked files hash correctly while the behavioral implementation is outside the manifest.

```text
documentIngest.v1.ts   computed=5f9022...aa05 manifest=5f9022...aa05
documentIngest.impl.ts computed=8a9d99...57a33 manifest=8a9d99...57a33
intake_in_manifest=False
```

Thus a change to `processDocumentTask` can change an in-flight `documentIngest_v1` step without changing either frozen hash and without freeze-lint detecting it. This is broader than infrastructure tuning: lines 446-499 are the workflow's core behavioral path.

### F-03 — HIGH — Committed intake/extraction receipts cannot be replayed after response loss

**Location:** `packages/db/migrations/0007_document_pipeline.sql:1896-1905,2050-2053,2067-2074,2113-2117`; `packages/runtime/lib/intake.mjs:336-348,446-489`

**Contract:** companion house rule §3 lines 8-14 (op-receipt idempotency); §3.2 lines 115-116 (`retry replays the receipt via CAS finalization`); contract §4.2 lines 229-237 and §6 lines 330-339 (`fixed op_key CAS finalize`, task run-binding/idempotency).

The writers validate the pre-transition state before `_reserve_op`. After a successful commit, the state is terminal, so the same operation key never reaches its stored receipt. This affects `finalize_document_intake`, `persist_document_extraction`, `complete_stored_document_task`, and `requeue_stranded_document_task`. The HTTP finalizer also generates a new random finalize op key on each call instead of persisting one at intake creation.

**Live reproduction:** first calls committed and stored receipts; same-key retries failed before reading them.

```text
first finalize:
{"status":"finalized","task_id":"89e74050-7697-4b1c-86d2-e5e1b147b6ff",
 "intake_id":"b4207b55-6d60-4366-bb3b-7fed5362d55f",
 "document_id":"e910d7ea-7924-40c8-888c-48873271b580"}

same op_key probe-finalize-fixed:
ERROR: CLR16: intake finalize capability/state is invalid

first extraction persist:
{"status":"done","task_id":"89e74050-7697-4b1c-86d2-e5e1b147b6ff",
 "extraction_id":"83a6e138-6ce1-4f58-8eef-c8ee2fa326e9"}

same op_key probe-persist-fixed:
ERROR: CLR16: processing task is not running

stored op_receipts still present:
finalize_document_intake    | probe-finalize-fixed | {status: finalized, ...}
persist_document_extraction | probe-persist-fixed  | {status: done, ...}
```

**Impact:** a post-commit connection loss is reported as failure even though the document/task is complete. A retried WDK persist step can remain failed/nonterminal at the engine layer while the DB task is already `done`; an HTTP finalize retry cannot return the original adoption/finalization receipt.

### F-04 — HIGH — AB-1 grants intake/reservation reads, but no DB-first expiry/reclamation path consumes them

**Location:** `packages/db/migrations/0008_runtime_read_surface.sql:12-24,47-57`; `packages/runtime/lib/intake.mjs:154-192,401-431`; `packages/runtime/lib/reconciler.mjs:289-318,444-460`

**Contract:** companion §3.6 lines 195-210 (`expired leases reclaimed by reconciler`); §3.9 lines 239-254; contract §8 lines 382-385; AB-1 lines 465-470.

`create_document_intake` commits before `writeIntakeMeta`. A hard process death between those statements leaves a DB intake and reservation with no sidecar. `recoverPendingDocumentIntakes` enumerates only filesystem sidecars. The only DB-first document query in the reconciler enumerates processing tasks, not intakes or reservations. This contradicts 0008's own claim that runtime read visibility closes the intake/reservation crash window.

**Live probe:** I created a DB-only expired intake/reservation in the scratch database (permitted probe write). The row is a state the current sweeper never queries.

```text
id                                   | status    | intake_expired | state    | reservation_lease_expired
1b9c19dd-5ab1-4bb3-8aa0-cab3fb775e0a | uploading | t              | reserved | t
```

**Static reachability evidence:** production runtime references `document_intakes` for writes/status tests, but the reconciliation sweep's DB snapshot selects only `document_processing_tasks`; intake recovery starts with `listIntakeMetas()`.

**Impact:** a killed begin request or missing/corrupt sidecar can leave `uploading` rows and daily-document reservations charged indefinitely. The finalizer→workflow task crash window is recovered DB-first; the earlier begin→sidecar window is not.

### F-05 — HIGH — Storage role/RLS doctrine is asserted, not delivered; JWT config accepts any nonstandard custom role

**Location:** `packages/runtime/lib/storage.mjs:32-52`; `packages/runtime/README.md:74`; `packages/runtime/tests/intake-unit.test.mjs:93-113`

**Contract:** companion §3.8 lines 227-237: exact custom role, bucket-scoped `INSERT` + `SELECT`, no `UPDATE`/`DELETE`, signed-JWT issuance/rotation/expiry procedure, and a privilege rig matrix.

The repository contains no executable role creation, `storage.objects` policy, bucket/path policy, issuance/rotation procedure, or Storage privilege rig. The one unit test rejects `service_role`, using an unsigned fake JWT. `realConfig` base64-decodes claims without verification and accepts every role string except `anon`, `authenticated`, and `service_role`; it does not require the designated Storage role, issuer, or audience.

**Repository probe:** excluding historical audit/research prose:

```text
QUERY=create role.*storage        -> no matches
QUERY=storage\.objects            -> no matches
QUERY=create policy.*storage      -> no matches
QUERY=CLARA_STORAGE_ROLE_JWT      -> README, storage.mjs, one service_role test only
```

I could not live-probe Supabase Storage because the permitted local PostgreSQL instances do not carry a `storage` schema and no Storage endpoint/credential was provided. Supabase would still validate a JWT signature remotely; the defect here is that Clara's configuration check does not establish that a valid signed token assumes the intended least-privilege role, and the policies proving that role's scope are absent from the build.

### F-06 — HIGH — Wrong-client correction completes without the required re-code task row

**Location:** `packages/db/migrations/0007_document_pipeline.sql:2390-2500`

**Contract:** S5-D3 at contract lines 123-135, specifically the bounded approval transaction's required `a re-code task row`.

The approval transaction reverses/withdraws source entries, moves the filing, records audit/events, and marks the correction complete. It never inserts re-code work. `filing_correction_items` records the source-side action/outcome; it is not a destination coding task and has no coding state/claim lifecycle.

**Live catalog evidence:** no re-code carrier exists.

```text
tables matching %code% or %task%:
agent_tasks, agent_tasks_visible, document_processing_tasks,
document_processing_tasks_visible, task_checkpoints, task_usage

agent_tasks.kind CHECK:
kind IN ('chat_turn','wake')
```

I did not manufacture a full completed correction through ungoverned DML solely to demonstrate an absent insert; the function body and live catalog are the evidence.

**Impact:** the correction can truthfully report `completed` while no durable work exists to re-code the document for the destination client, leaving the accounting repair incomplete.

### F-07 — MEDIUM — AB-3 destination attribution is not required before proposal

**Location:** `packages/db/migrations/0007_document_pipeline.sql:2332-2388,2433-2437`

**Contract:** AB-3 at contract lines 474-478: the authoritative destination document resolution `must exist BEFORE propose` because its event stales the plan.

Preview/propose validates only that the destination client is active and same-firm. Resolution validation occurs for the first time at approval.

**Live reproduction (rollback-only, authenticated bookkeeper):** the destination had zero qualifying resolutions, but proposal succeeded.

```text
destination_resolution_before
-----------------------------
0

proposal
{"status":"proposed","books_version":42,
 "plan_hash":"5e5d1d02e9e78673f6dd4ff5474f676b70e2f7cbd10241f7775c8cbbe5eb6e12",
 "correction_id":"399ca38e-e0a9-471e-b5ff-8119bc4811da"}
```

Adding the resolution afterward moves the books/event version, so the proposal is unusable by design. The governed writer should reject it before persisting the plan.

### F-08 — MEDIUM — Chat turn admission persists foreign and nonexistent attachment references

**Location:** `packages/runtime/src/chatRoutes.ts:112-129`; `packages/db/migrations/0006_runtime_core.sql:494-507`

**Contract:** contract §4.5 lines 264-273 (submit only after adoption and include authoritative `{document_id,intake_id}`); §7 lines 362-365 (client attribution/provenance invariants remain); companion §3 house rules on same-firm bindings.

The route accepts any array and forwards it verbatim. The existing message trigger checks only that each element is an object with a string `type`; Slice 5 adds no attachment-specific max-five, adoption, existence, uploader/session, or same-firm validation.

**Live reproduction (rollback-only):** a firm-A turn was queued while referencing a firm-B document and an all-zero nonexistent intake.

```text
foreign document:
8c4073a4-970a-440a-98e2-fb502f9b76ee|firm=c60f3203-5070-40e7-860f-9df43188caac

admission:
{"status":"queued","task_id":"18a2dc60-11e3-427c-b488-c050d88ca05f","replayed":false}

persisted message firm:
7b2d996d-9657-461d-bf3f-1cef9cf24714

persisted part:
{"type":"attachment",
 "intake_id":"00000000-0000-0000-0000-000000000000",
 "document_id":"8c4073a4-970a-440a-98e2-fb502f9b76ee"}
```

No immediate cross-tenant read was proven because `chatTurn_v1` does not perceive attachments. The durable message is nevertheless poisoned with a cross-tenant reference and becomes a dangerous boundary when the planned attachment-aware workflow arrives.

### F-09 — MEDIUM — Matcher conflicts are recorded with outcome `candidate`, not `abstained`

**Location:** `packages/runtime/lib/matcher.mjs:69-108`; `packages/db/migrations/0007_document_pipeline.sql:2160-2164`

**Contract:** S5-D2 at contract lines 108-120 and companion §3.4 lines 142-165: conflicts abstain while retaining represented candidates/evidence.

The matcher correctly returns all conflicting candidates and a conflict reason. The writer derives outcome solely from whether the candidate array is nonempty, ignoring `p_conflict_reason`.

**Live reproduction (rollback-only):** two same-firm candidates plus a conflict reason produced:

```text
id                                   | outcome   | conflict_reason     | candidate_count
357d7ec1-f004-4fe7-991c-3d61660d2752 | candidate | probe-conflict-tie | 2
```

This makes the recorded state disagree with the explicit conflict semantics even though the supporting candidates remain representable.

### F-10 — MEDIUM — Admission/page-limit failures use Slice-4 `CLR14`, becoming HTTP 500 instead of honest limit responses

**Location:** `packages/db/migrations/0007_document_pipeline.sql:1600-1604,1628`; `packages/runtime/lib/intake.mjs:515-522`

**Contract:** AB-6 at contract lines 486-489 assigns `CLR18` to reservations/limits/concurrency; §8 lines 389-392 requires honest per-file rejection near daily limits.

Initial docs/day and pages/day refusal, plus reservation resize overflow, raise `CLR14`. `mapIntakeError` recognizes only `CLR18` as HTTP 429; `CLR14` falls through to HTTP 500/internal.

**Live reproduction:** with the firm limit set to one document in a rollback-only transaction and one existing settled reservation:

```text
ERROR: CLR14: document daily limit reached (docs)
CONTEXT: _reserve_document_ingest(...) line 13 at RAISE
```

The HTTP mapper's observable result for this error is `{status:500, code:"internal"}` rather than the contract's honest limit response.

### F-11 — MEDIUM — A member can continue a shared chat but cannot attach to it

**Location:** `packages/runtime/src/intakeRoutes.ts:75-78`; `packages/db/migrations/0007_document_pipeline.sql:431-439,1757-1762`

**Contract:** companion §3.2 lines 121-122 (`chat-origin session predicate`); contract §4.5 lines 264-273; §7's unchanged shared-session semantics and §8 lines 382-385.

The runtime's session predicate correctly authorizes same-firm shared sessions, but both the intake writer and insert trigger additionally require `chat_sessions.created_by = uploaded_by`. That silently replaces “own or shared” with creator-only for attachments.

**Live reproduction (rollback-only):** Alice shared a session; Bob could read it; Bob's chat-origin intake was rejected.

```text
share_receipt:
{"session_id":"4da1d15e-5ea5-40c0-9a24-1404b73ceb5d","visibility":"firm"}

bob_can_read_shared_session = 1

ERROR: CLR11: uploader not authorized for intake
CONTEXT: create_document_intake(...) line 10 at RAISE
ROLLBACK
```

### F-12 — MEDIUM — PDF “verification” accepts header-only/corrupt files as canonical evidence

**Location:** `packages/runtime/lib/scan.mjs:189-217`; canonicalization call path `packages/runtime/lib/intake.mjs:261-274`

**Contract:** contract §8 lines 370-372 (`password/corrupt/oversize → intake FAILS pre-finalize; not evidence until verified`).

PDF admission checks only the five-byte `%PDF-` prefix. `countPdfPages` searches raw text for `/Encrypt` and `/Type /Page`, then returns at least one page. It performs no parse, xref/trailer/startxref/EOF validation, or renderer open. Therefore `%PDF-1.7\njunk` is classified as a one-page PDF, can pass ClamAV, and is uploaded/readback-verified before Azure later rejects it.

This is a static finding. I did not create a throwaway filesystem fixture because the review authorization permits only the report and DB probe writes, and Node could not execute in this sandbox. The source path is deterministic and no corrupt-PDF pre-finalize test exists.

**Impact:** corrupt bytes become a durable `document`/canonical evidence object, contrary to the pre-finalize boundary; the later extraction failure does not undo that fact.

### F-13 — MEDIUM — Correction approval neither adopts nor supersedes pending reversal drafts

**Location:** `packages/db/migrations/0007_document_pipeline.sql:2439-2455`

**Contract:** companion §3.5 lines 190-193 and contract §8 lines 378-382: pending reversal drafts adopt on exact hash, otherwise are explicitly superseded.

For every `action='reverse'`, approval unconditionally inserts a new draft mirror, copies lines, and immediately approves it. It never queries pending rows with `reversal_of = original`, compares a hash, adopts one, or marks a mismatch superseded/withdrawn. The unique index covers only approved reversals, so an existing pending draft can remain alongside the newly approved mirror.

This is source-backed but not live-probed. I did not fabricate a pending accounting reversal via ungoverned DML; there is no relevant lookup or mutation anywhere in the approval function.

**Impact:** correction violates the explicit crash/manual-work edge case, leaves an orphaned pending reversal in history, and can discard already-reviewed draft work instead of adopting it.

## Verified controls and non-findings

These targeted checks passed on `127.0.0.1:5544` only:

- All 14 new tables report `relrowsecurity=true` and `relforcerowsecurity=true`. App-role direct DML (`clara_authenticated`, `clara_agent`, `clara_runtime`) was absent on all 14.
- Function execution posture matched the intended lanes:
  - `record_rule_resolution`: `clara_runtime_login=true`; authenticated/agent/runtime group=false.
  - `finalize_document_intake` and `persist_document_extraction`: runtime group=true; raw login/authenticated=false.
  - `approve_wrong_client_correction`: authenticated=true; runtime/raw login=false.
- Cross-firm masked-view probe as firm-B Dave returned `visible_intakes=0`, `visible_tasks=0` while firm A actually had one of each.
- No document/filing function appears in `wake_fn_allowlist`.
- Egress-denied claim behaved correctly:

```text
receipt = {"status":"held_egress","workflow_run_id":null,...}
row     = status held_egress, workflow_run_id NULL, started_at NULL, attempt_count 0
```

- Canonical storage keys and spool filenames reject slash traversal through fixed grammar / UUID-shaped IDs. I found no spool path traversal route.
- Intake CORS performs exact origin membership and emits no allow-origin header for an unlisted origin; the upload/finalize bearer errors are non-oracular.
- Manual LF-normalized hash verification matched both `documentIngest` manifest entries. The finding is closure coverage, not an incorrect current hash.
- `git diff --check main...HEAD` was clean. A diff secret-pattern scan found only documented/test placeholder Storage role names, no credential material.
- AB-8 engine PUBLIC-EXECUTE posture could not be exercised because both permitted baseline DBs contain no engine schema functions:

```text
clara_test|engine_schema_functions=0
clara_blind_test|engine_schema_functions=0
```

This is a verification limitation, not a finding against the branch.

## Test and environment record

- Read `CLAUDE.md`, the complete v1.2 contract including §13 AB-1..8, and the complete companion design before reviewing code.
- Applied migrations `0001` through `0008` and seeds manually, in per-file transactions, to scratch database `clara_codex_s5_20260719_probe` on `127.0.0.1:5544`. No other database host was contacted.
- Used rollback-only transactions for authorization, correction-proposal, matcher, attachment, quota, shared-session, and egress probes. The DB-only expiry probe was intentionally committed in the scratch database so its orphan state remains inspectable.
- The repository's Node/pnpm tests, typecheck, lint, build, and official freeze-lint could not run: `pnpm` was not on PATH; Corepack failed to create its cache under the sandboxed profile; direct cached pnpm/Node failed with `EPERM: operation not permitted, lstat 'C:\Users\zhant'`. I did not copy the repository or write a workaround because the review permits no non-report filesystem writes.
- The worktree was clean at review start. Unrelated uncommitted changes appeared concurrently later; all source citations and conclusions above are pinned to committed `HEAD`, not those worktree edits. I made no source change, commit, or push.

