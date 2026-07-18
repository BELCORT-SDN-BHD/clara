# Slice-5 as-built review — native lane, sub-report: DASHBOARD WIRE-TRUTH

Reviewed all 14 dashboard target files + cross-checked against as-built 0007/0008 with
live probes on `clara_blind_test` (127.0.0.1:5544). One substantive finding; the wire is
otherwise faithful.

## Finding

**MED-1 — Honest-copy contradiction: intake chips label unassigned documents "Filed".**
`apps/dashboard/app/shared/intake.ts` `intakeStatusCopy` returned `finalized→"Filed"` /
`adopted→"Filed (adopted existing document)"`. The intake transport NEVER files to a
client: `packages/runtime/lib/intake.mjs` calls `finalize_document_intake` with
`p_client=null, p_resolution=null` → the document lands UNASSIGNED (zero active filings);
filing happens only later via the human writers. Concrete contradiction: the upload queue
showed "Filed" while the same document sat in the documents page "Unassigned lane"; the
chat chip printed "Filed" beside "Clara will see this document once it is filed."
Clause: §4.5 honest copy + [DELTA-OWNER-2] + the honest-state law.
**RESOLVED by the orchestrator in the fix round:** `verified→"Verified — storing…"`,
`finalized→"Stored — not yet filed"`, `adopted→"Stored — matched an existing document"`;
"Filed" reserved for an actual active filing.

## Verified CORRECT

1. All 10 governed writers the UI calls exist with EXACT signatures + human EXECUTE
   (live-probed); `recordDocumentResolution` → `record_client_resolution` (0004) matches
   its 7-arg signature — the suspected candidate-bug is a non-bug.
2. No ungranted base-table read: PostgREST SELECTs hit human-granted tables
   (`documents` — client_id correctly gone — `document_filings`, `clients`,
   `attribution_attempts`, `attribution_candidates`) or the masked views;
   `clara_authenticated` has NO SELECT on the intake/task/reservation base tables
   (live-probed).
3. Masking intact: both views expose exactly the consumed columns; never
   `chat_session_id`, `token_hash`, `storage_key`, `workflow_run_id`, `engine_config`.
4. Intake wire matches the routes: begin JSON keys align with `validateBegin`;
   `{intake_id, upload_token, expires_at}` 201; PUT octet-stream + Bearer upload token
   204; finalize Bearer token + `{}` 202. Token split correct (§3.2): PUT+finalize on the
   upload token; status polling on the JWT lane via masked views, no token.
5. Enum truth: `IntakeStatus`/`IntakeFailureCode`/`ProcessingStatus`/`ProcessingErrorCode`
   match the DB CHECK sets exactly.
6. §4.5 submit gate holds: `send()` returns on `!att.ready`; button disabled likewise;
   `att.ready` only when every attachment reached `finalized|adopted` with a document_id;
   the `{type:'attachment',document_id,intake_id}` part rides `postTurn` at
   `begin_chat_turn` — append-only respected.
7. Honest non-perception copy present in the composer tray AND the persisted chip.
8. Correction wizard order matches AB-3: preview → destination resolution → propose →
   approve (the resolution's `client.resolved` event cannot stale the plan); DB refusals
   surfaced verbatim with pgCode.
9. No fake affordances: confidence as shaped bands (never %); `held_egress` → "awaiting
   egress approval"; e-invoice → "stored, not parsed"; the unassigned lane is a real
   zero-active-filing anti-join with a working zero-client escape hatch; missing env →
   honest "cannot confirm" states, no false success.
10. Proxy correct: begin-intake same-origin via the `/api/intake` rewrite; bytes/finalize
    direct-to-Fly when `NEXT_PUBLIC_CLARA_RUNTIME_URL` is set.

Dependency noted (out of lane): 0006's `parts[]` CHECK accepting `{type:'attachment'}` —
contract §2 as-built-verified (any object with a string `type` passes).
