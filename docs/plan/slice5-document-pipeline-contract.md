# Slice 5 design contract — the document pipeline core (v1.0 — design stage)

**Status:** DESIGN — pre-review. This contract was grilled with the owner on 2026-07-18
(ten rulings S5-R1…R10) plus three explicitly **owner-delegated** decisions (S5-D1…D3:
transport, attribution, correction flow) resolved by industry research + a Codex
(gpt-5.6-sol, xhigh) debate per the owner's instruction ("find the best, collab with
Codex, auto-choose"). Evidence archived under `docs/plan/research/slice5/`.
Ladder: design review (dual-lane) → delta re-review → build (contract-blind rig lane)
→ as-built review; §12 will carry as-built amendments.

Slice frame (REBUILD-PLAN): upload (picker/drag/paste) → OCR with bounding-region
capture → persist-after-OCR always (unassigned lane) → assign/reassign → attachment
lifecycle chip; storage doctrine + registry; retention anchored at period-end+filing.
Slice 6 (Gate-3 demo) consumes this pipeline directly.

---

## 0. Ratified owner semantics (grilled 2026-07-18)

- **S5-R1 — OCR egress: two-tier gate.** Build + ship the pipeline NOW against
  synthetic/firm-own data. Before any REAL client document flows to the OCR vendor:
  executed vendor DPA + an engagement-letter processor-disclosure clause + a documented
  PDPA cross-border basis (documented once for the whole Singapore data plane).
  Enforced fail-closed by a deploy flag (§4.6). "No vendor training on firm data"
  is a hard vendor-selection criterion regardless.
- **S5-R2 — OCR engine pin.** Azure Document Intelligence **prebuilt-layout v4.0**,
  Southeast Asia region, **Standard (S0)** tier; pinned in the deploy doc with recorded
  service limits (max size/pages/TPS). The engine id is **snapshotted per task** at
  admission (S4-D3 pattern). Adapter is PORT with two mandated fixes: the 429 branch
  must respect the poll deadline (E-8) and `boundingRegions` are captured + persisted
  (J-18). Law stays vendor-agnostic; the pin lives in the deploy doc.
- **S5-R3 — Chat attachments ship in Slice 5.** Slice-4 ruling 1 narrows of record:
  chat may never write **books**; **evidence ingestion is allowed**. One pipeline,
  two doors (Documents tab + chat composer). `chatTurn` stays **v1** (§4.5).
- **S5-R4 — Storage is content-addressed.** Bytes live once at
  `firms/{firm_id}/docs/{sha256}.{ext}`, write-once, never moved, never deleted.
  Assignment/reassignment is a pure audited registry change. **E-3's "bytes actually
  relocate" is superseded of record** — the stranded-document defect is cured by the
  registry. Delete-never holds absolutely (no carve-outs).
- **S5-R5 — Multi-client filing ships now.** ONE physical document row per
  (firm, sha256) + a **filings** relation (a document may be filed to several sibling
  clients — shared supplier statement is first-class). Provenance validates against
  **active filings**, not a document-level client column. Unassigned = zero active
  filings. Fixes E-13 structurally.
- **S5-R6 — Lane visibility.** A document is a firm-visible business record the moment
  it persists (clarify-style precedent: explicit framing copy). The lane shows the
  **uploader**, never the chat session (ruling-9 masking discipline).
- **S5-R7 — Document metering is a separate budget.** Per-firm docs/day + pages/day +
  OCR concurrency, operator-set defaults + per-firm override, fail-closed atomic
  admission with an honest CLR rejection naming the limit + UTC reset (mirrors the
  Slice-4 chat metering ruling). OCR **never** occupies a chat compute slot.
- **S5-R8 — Admission (broader start).** MIME allowlist: PDF, PNG/JPEG/WebP/TIFF/HEIC,
  XML, **plus XLSX/CSV/DOCX** (structured-parse lane §4.4 — these do NOT go to OCR).
  Chat: 5 files × 20MB per turn (ported caps). Documents tab: bulk batches queued with
  per-file retry; **100-file batch design target measured** in Phase-5 load
  verification. Paste = clipboard files/images only; pasted TEXT does not become a
  document in v1. Limits operator-set like S5-R7.
- **S5-R9 — Retention: §7a lands complete.** Anchor columns + a conservative interim
  clock now: filed docs derive retain-until from client FY-end + statutory filing
  offset + 7 years (ITA s.82/82A, CA2016 s.245); unassigned docs carry a far-future
  floor until filed; close recomputes later (floor-never-shorten, trigger-enforced).
  **Audited `legal_hold` place/release writers ship now** (admin+ floor, reason
  required). No purge machinery exists; nothing is ever auto-deleted in v1.
- **S5-R10 — MyInvois UBL XML: store-only carve-out.** XML persists + enters the lane
  like any document, skips OCR, flagged "e-invoice — stored, not parsed".
  Deterministic UBL parsing arrives with the coding slice.

### Owner-delegated decisions (research + Codex debate; evidence in research/slice5/)

- **S5-D1 — Transport: runtime-owned store-and-forward.** Browser streams bytes to an
  authenticated intake endpoint ON the Fly runtime (never through the Vercel proxy —
  4.5MB function body cap; never direct-to-storage — Supabase cannot enforce a
  checksum at upload and the canonical content-addressed key needs the VERIFIED sha,
  known only at EOF). Runtime spools locally → computes sha256 → uploads once to the
  canonical key (`upsert=false`) → **downloads back and re-hashes** — the sha↔bytes
  bond (Codex HIGH-12) is sealed by the runtime, never by a client claim. The browser
  never holds a storage credential; agent-plane custody end-to-end (owner's
  agent-owns-documents preference, structural reading: the agent's SERVICE owns
  custody; no LLM in the ingest critical path — E-1/E-2 law). Resumable TUS upload is
  a staged enhancement behind the same intake abstraction (v1 = streaming POST +
  per-file retry; 20MB full-file retry is acceptable).
- **S5-D2 — Attribution: deterministic two-lane; no model, no autonomous run.**
  After OCR/parse, an idempotent **relay consumer** (not a wake, no LLM) runs:
  *Lane 1 (authorizing):* a unique, role-aware HARD identifier hit (client TIN/SSM,
  bank-statement account number) against the firm's `client_identifiers` registry →
  a **pipeline-only** DB writer recomputes the predicate server-side and records a
  `method='rule'` resolution (caller supplies only the document — never a client or a
  confidence). *Lane 2 (advisory):* unique exact registered-name/alias hits become
  **candidates** in dedicated proposal tables — grouping input only; confirming one
  creates a `human` resolution. Conflicts (two clients named, ambiguous role,
  non-unique alias) → **abstain** with a recorded reason. Assignment itself stays a
  human act in Slice 5 (even lane-1 matches are confirmed, not auto-filed). ALL
  model-based suggestion machinery waits behind the Phase-5 eval gate (E-9/GAP3-6).
  Confidence displays as shaped bands ("Verified identifier" / "Name match — review"),
  never percentages.
- **S5-D3 — Correction: refuse-until-reversed invariant + guided correction case.**
  The DB primitive `retire_document_filing` REFUSES while live posted entries (or live
  drafts) of that client cite the document, returning structured blockers. The refusal
  opens a guided flow: read-only **preview** (DB-computed blast radius) → **propose**
  (immutable hash-bound plan, changes no books; always high-stakes) → **approve** by a
  distinct eligible checker (or solo-attest) → ONE bounded transaction: per-entry
  linked reversal mirrors (whole-consequence, F3 law), drafts **withdrawn** with
  reason (never deleted), A's filing **retired** (filings are historical — never
  deleted), B's filing ensured idempotently (requires a human/rule resolution — adding
  a filing is NOT unconditionally allowed), a re-code task row opened, one aggregate
  correction event + ordinary child events. Stale plans (books moved since proposal)
  reject and force re-review. Posting takes a shared lock on the active filing;
  retirement takes the conflicting lock. "One reviewed correction event, many
  separately traceable reversals." **Clara's role ladder:** detect/explain/preview
  (read-only) in Slice 5; a propose-writer for the agent lane is Slice 6; approve is
  human-only forever (no EXECUTE grant for the agent role — structural).

---

## 1. Scope

**In:** migration `0007_document_pipeline.sql`; intake transport + spool + verify;
Azure DI adapter + frozen `documentIngest_v1` workflow; structured-parse lane
(XLSX/CSV/DOCX); extraction + region persistence (ONE producer-emitted envelope —
I-12); filings model + provenance re-shape; deterministic matcher + proposal tables +
`client_identifiers` registry; lane/triage + upload surfaces (plumbing-level, not the
Phase-4 design build); assignment/un-filing writers + correction-case machinery;
attachment lifecycle chip; document metering; retention columns + interim clock +
legal_hold writers; document event types + taxonomy v2 + `activate_taxonomy_version`;
freeze-manifest addition; storage-doctrine enforcement + object↔row reconciler sweep.

**Out (recorded, not built):** the doc_review region-overlay UI (Phase-4 Wave A —
Slice 5 persists what it will consume); model attribution (eval gate); coding/drafting
from documents (Slice 6); UBL parsing (S5-R10); TUS resumable (staged); multi-document
PDF splitting; purge/disposal machinery; agent propose-correction writer (Slice 6);
document-kind auto-classification; export_artifacts retention inheritance (no exports
exist yet — follow-up).

**Gates:** nothing Slice 5 ships deploys before the ruling-7 sequence completes
(T2-48h park → approved spike-schema drop → world-on). Real client bytes to the OCR
vendor wait for the S5-R1 checklist (deploy flag, §4.6). Build/test on local
throwaways only; the shared project's spike schemas are untouchable until the ceremony.

---

## 2. Decision record (what the research + debates established)

- **No file-transport channel exists** in the runtime today (verified: `express.json`
  1MB is the only ingress; no multipart handling; no storage credential in env).
- **Supabase Storage** cannot enforce a client-declared sha256 at upload (unlike S3
  checksum headers); `upsert=false` is first-writer-wins, not WORM; `move` requires
  update authority and is destructive → readback verification is mandatory and
  content-addressed-never-move is the only doctrine-compatible layout (S5-R4/D1).
- **Vercel Functions cap request bodies at 4.5MB** → bytes must reach the Fly runtime
  directly (CORS), never via the dashboard proxy.
- **Incumbent consensus** (Dext/Hubdoc/AutoEntry/QBO/Xero/Ramp): suggestions always
  run post-OCR; auto-ACTION is gated by deterministic human-authored rules; nobody
  shows raw confidence numbers; deterministic rules outrank ML; abstention is
  structural (stays in the review lane with a reason) → S5-D2.
- **Correction precedents:** Xero find-and-recode (advisor-gated compound tool with a
  full per-transaction audit history), Sage atomic reverse+repost, QBO privileged
  compound undo with consequence disclosure, Dext stepwise republish → the S5-D3
  hybrid (structural refusal + hash-bound reviewed batch).
- **Step-retry law (Slice-4, proven):** a step that throws after an external call
  re-invokes it — OCR persistence must be idempotent by (document, engine, version);
  duplicate vendor spend is bounded-accepted like model spend.

---

## 3. Migration `0007_document_pipeline.sql` (design)

House rules: 0001–0006 untouched; new migration only; rig-validated on throwaways;
every writer SECURITY DEFINER with role floors, `op_key` idempotency via
`op_receipts`, audit_log rows, and same-txn domain events where the mutation is a
DOMAIN fact (ruling 11: documents/filings/extractions/corrections are domain facts;
intakes/metering are runtime-control and emit nothing).

### 3.0 `documents` evolution
- `client_id` is **migrated into `document_filings`** (existing non-null values seed
  active filings + backfilled `human` resolutions attributed to the original
  uploader), then **dropped**. `_tf_documents_immutable` reworked: `id`, `firm_id`,
  `sha256` stay frozen; the DELETE block stays. `ix_documents_client_recent` replaced
  by filing-based indexes; the **context-pack query is updated in the same migration**
  (docs-per-client now joins active filings; extraction blobs are NEVER serialized
  into packs — metadata only).
- New columns: `bytes_verified_at` (null = claim-only legacy row), `ocr_status`
  (`pending`|`running`|`done`|`failed`|`skipped_structured`|`stored_unparsed`|
  `held_egress` — CHECK allowlist; derived by writers, never caller-supplied — E-5),
  `page_count`, `document_kind` (nullable; §9 taxonomy; metadata not a gate),
  `financial_date` (nullable), `retain_until` (floor-never-shorten trigger),
  `retention_basis` (text tag), `legal_hold` boolean + `legal_hold_reason`.
  `status` keeps its existing CHECK (`ingested`) untouched for compat; lifecycle
  truth lives in the new columns. Lane membership is **derived**: unassigned ⇔ zero
  active filings (E-5: every document is in exactly one lane by construction).
- `storage_path` becomes governed: format CHECK (`firms/{firm_id}/docs/{sha256}.{ext}`,
  server-derived only — E-4 grammar validated at creation), set exclusively by the
  runtime finalizer writer.

### 3.1 `document_filings` (historical, never deleted)
`id, firm_id, document_id, client_id, filed_at, filed_by, resolution_id (FK — the
human/rule resolution authorizing this filing), retired_at, retired_by,
retirement_reason, correction_id (nullable FK), revision_token`. Partial UNIQUE
`(document_id, client_id) WHERE retired_at IS NULL`. FORCE RLS, firm-scoped; zero
direct DML for app roles. Writers: `file_document` (human lane; creating a filing
records/uses a resolution ABOUT this document — filing by an uploader IS a human
attribution act), `retire_document_filing` (S5-D3 primitive with structured
blockers + draft block + lock discipline). Events: `document.filed`,
`document.filing_retired` (same-txn).
- **Provenance re-shape:** `assert_provenance` + the belt trigger validate
  (document_id, sha256, client) against an **active filing** for that client.
  An unassigned document (zero active filings) remains uncitable — unchanged law.
- **Wake-lane change (design decision DD-1):** `wake_ingest_document` is REMOVED from
  the interactive wake allowlist (function retained for history). Post-0007, every new
  document enters through the verified intake finalizer — closing HIGH-12 completely
  (no more caller-claimed SHAs). The agent "receiving" a chat file = the transport
  ingesting it; Clara never carried the bytes.

### 3.2 `document_intakes` (runtime-control; no events)
`id, firm_id, uploaded_by, origin ('chat'|'documents_tab'), chat_session_id`
(nullable; **masked** from all firm-visible surfaces per S5-R6 — same masking
discipline as agent_tasks), `original_filename, declared_mime, declared_bytes,
status ('uploading'|'received'|'verifying'|'verified'|'duplicate'|'failed'|'adopted'),
sha256 (server-computed), storage_key, document_id, failure_code (CHECK allowlist:
'too_large'|'bad_type'|'limit'|'checksum_mismatch'|'storage_error'|'expired'|
'internal'), op_key, created_at, updated_at`. The reconciler sweeps stale intakes
(spool TTL) to `failed/expired`. The runtime **finalizer writer**
(`finalize_document_intake`, runtime-login-only EXECUTE) creates the document row +
optional filing + `document.ingested` event in one txn, idempotent by op_key; on
(firm, sha256) conflict it **adopts** the existing document (maps the intake to it,
surfaces "already uploaded on …" — never a second row, never a second event).

### 3.3 `document_extractions` + `document_regions`
- `document_extractions`: `id, document_id, engine_id (snapshotted string, e.g.
  'azure-di/prebuilt-layout@2024-11-30'), engine_kind ('ocr'|'structured_parse'),
  version_n, superseded_by (nullable — re-OCR is supersede-with-lineage, E-6; an
  extraction cited by anything is never edited in place), status, page_count,
  envelope JSONB (ONE canonical producer-emitted shape — I-12), extracted_at`.
  UNIQUE (document_id, engine_id, version_n) — the OCR step's idempotency key.
- `document_regions`: `id, extraction_id, page_n, field_path, polygon JSONB,
  text_content, engine_confidence numeric` — engine confidence is DATA, never
  authority. Regions persist NOW (they cannot be backfilled without re-OCR); the
  Wave-A doc_review overlay + invariant-2b citation binding consume them later.
- Extracted monetary amounts are stored as raw strings + deterministically normalized
  bigint cents where parseable — claims about the document, never book figures.

### 3.4 Attribution (S5-D2)
- `client_identifiers`: `firm_id, client_id, kind ('tin'|'ssm'|'bank_account'),
  value_normalized`; UNIQUE (firm_id, kind, value_normalized) — uniqueness is the
  precondition for an authorizing match; maintained by an audited human writer.
- `attribution_attempts`: `document_id, matcher_version, input_fingerprint, status
  ('rule_matched'|'candidates'|'abstain'), abstain_reason, ran_at` (idempotent per
  (document, matcher_version, input_fingerprint)).
- `attribution_candidates`: `attempt_id, client_id, rank, rule_kind
  ('name_exact'|'alias_exact'), region_refs, disposition
  ('open'|'confirmed'|'dismissed'), disposed_by/at`.
- `record_rule_resolution(p_document)` — **pipeline-only** (runtime-login EXECUTE
  only): recomputes the lane-1 predicate server-side (unique hard-identifier hit,
  role-aware, zero conflicting identifiers) and inserts a `method='rule'`,
  confidence-qualifying resolution about the document. Callers never supply client or
  confidence. `client_resolutions` stays exclusively gate-authorizing (never a
  suggestion store).

### 3.5 Correction case (S5-D3)
`filing_corrections` (`document_id, from_client, to_client, reason, maker, checker,
status ('proposed'|'approved'|'completed'|'rejected'|'stale'), plan_hash,
books_version, timestamps`) + `filing_correction_items` (`correction_id, entry_id,
entry_state_hash, action ('reverse'|'already_reversed'|'withdraw_draft'),
reversal_id, outcome`). Functions: `preview_wrong_client_correction` (read-only,
DB-computed blast radius incl. tax/closed-period/subledger impact),
`propose_wrong_client_correction` (persists the exact set + hash; no book effect),
`approve_wrong_client_correction(correction_id, plan_hash, attestation, op_key)` —
distinct-checker or solo-attest, deterministic lock order, stale-plan reject,
per-entry reversal mirrors with whole-consequence (F3), draft withdrawal, filing
retire/ensure, re-code task row, aggregate `document.correction_applied` event +
child events, all-or-nothing. Always high-stakes regardless of amount.

### 3.6 Document metering (S5-R7; runtime-control)
`firm_document_limits` (docs/day, pages/day, ocr_concurrency; operator defaults +
per-firm override) + `begin_document_ingest` / `settle_document_ocr` (atomic
admission under a namespaced advisory lock; CLR-style rejection naming the limit and
the 00:00 UTC reset; settle records actual page_count). Fail-closed.

### 3.7 Events + taxonomy v2
New `event_types` (append-only catalog): `document.filed`,
`document.filing_retired`, `document.ocr_completed`, `document.ocr_failed`,
`document.correction_applied`. **Taxonomy v2** covers the FULL catalog (existing
mappings carried forward): `document.ingested` stays `background_review`;
`document.ocr_completed`/`ocr_failed` route **`ignore`** — the deterministic matcher
is a Slice-3 **relay/projection consumer**, not wake machinery (DD-2: no held agent
task per document; ruling-2 posture unchanged). `activate_taxonomy_version(v)` ships
as the audited operator fn (closes the PART-2 gap; coverage-checked, repoint-only).

### 3.8 Storage doctrine enforcement
Private bucket; the runtime's storage principal is a **dedicated scoped credential**
(insert + select on this bucket only; no update, no delete; never `service_role`).
No principal anywhere holds storage delete/update. Key grammar enforced at creation
(§3.0). A leader-guarded reconciler sweep inventories objects↔rows both directions:
object-without-row → verify + adopt or alert; row-without-verified-object →
high-severity incident, never delete (Codex failure table is the test matrix).

---

## 4. Runtime design

### 4.1 Intake transport (S5-D1)
Routes on the Fly runtime (CORS-allowlisted to the dashboard origin; bytes never
transit the Vercel proxy): `POST /api/documents/intakes` (authz via lib/authz →
admission S5-R7/R8 → intake row + intake token), `PUT /api/documents/intakes/:id/body`
(single streaming octet-stream write: backpressure, hard size cap, magic-byte sniff
vs declared MIME, incremental sha256 into an encrypted spool dir on a Fly volume —
spool is transport state, disposable, quota'd, TTL-cleaned; never authoritative
custody), finalize (verify caps → canonical upload `upsert=false` → readback re-hash
→ `finalize_document_intake` → start `documentIngest_v1` by reference), `GET
/api/documents/intakes/:id` (chip status). Global ingress concurrency 2 (initial;
operator-tunable), browser concurrency 2; per Codex: no whole-file buffering
anywhere, ever. A `202` is never rendered as success — the chip mirrors durable
status only (honest-state law). Failure windows + recovery follow the S5-D1 failure
table verbatim (archived evidence).

### 4.2 `documentIngest_v1` (new frozen workflow class)
Registered via `workflows/registry.ts` + `pnpm freeze:update`. Bytes and credentials
NEVER transit step IO — steps receive `{document_id, sha256, storage_key}`; the OCR
step mints its storage read credential inside the step, downloads the object, calls
Azure DI (poll loop with a hard total deadline that survives the 429 branch — E-8),
normalizes ONE envelope + regions, persists via an audited fn idempotent on
(document, engine, version), emits `document.ocr_completed` same-txn, settles
metering with page_count. Model-free by construction. `chatTurn` remains v1 — no
edit to any frozen closure (DD-3).

### 4.3 Structured-parse lane (S5-R8)
XLSX/CSV/DOCX skip OCR: a deterministic in-runtime parser (bounded concurrency 1;
CPU-heavy work kept off the hot path — event-loop stall hazard is a recorded Slice-4
residual) extracts tabular/text facts into the same extraction store
(`engine_kind='structured_parse'`, its own snapshotted engine id). Macro-bearing
files: values only, macros never executed; encrypted/password files → `ocr_status
'failed'` with an honest failure code. XML (S5-R10): persists, `stored_unparsed`.

### 4.4 Deterministic matcher (relay consumer; S5-D2)
An idempotent Slice-3 relay consumer of `document.ocr_completed`/parse events:
derives firm from the document row, queries ONLY the firm-scoped
`client_identifiers` + alias registry (no client wiki, no books context — the
cross-tenant boundary: nothing client-scoped loads before assignment), writes lane-1
rule resolutions via `record_rule_resolution` and lane-2 candidates, or abstains
with reason. Suggestions surface as grouped triage (shaped bands, evidence chips
clickable to the OCR region, conflicts + unmatched in "Needs assignment"); every
filing is a human confirm in Slice 5.

### 4.5 Chat integration (S5-R3, no chatTurn_v2)
The composer uploads through the same intake route (`origin='chat'`); on adoption the
client appends a `{type:'attachment', document_id, intake_id}` user part to the turn
(parts[] is DB-legal today; per-type schemas remain deferred to the Phase-4 catalog
— AB12). The frozen chatTurn_v1 treats it as inert data; Clara sees document
METADATA through her existing read tools/context packs. The chip renders from the
part + polls intake/task status; it re-derives authoritative status on hydrate
(D-4/D-5 law), de-dupes by content hash (D-10), and never shows success before the
DB row exists. Dashboard: a plumbing-level `/documents` page (lane list FIFO +
zero-client escape hatch — GAP5-7, upload queue with per-file retry, triage verbs,
correction wizard entry); new JSON routes ride the Next proxy; bytes go direct.

### 4.6 Egress gate flag (S5-R1)
`CLARA_DOC_EGRESS_APPROVED` (default `0`): when off, the OCR step refuses before any
vendor call — the document persists normally with `ocr_status='held_egress'`
(visible, honest, retryable once the owner flips the flag after the checklist).
Local/dev throwaway rigs are unaffected. Structured-parse and store-only lanes never
egress and run regardless.

### 4.7 Retention + legal hold (S5-R9)
Interim clock computed at filing (client FY-end + statutory filing offset + 7y;
recompute hook reserved for close), far-future floor while unassigned;
floor-never-shorten trigger. `place_legal_hold`/`release_legal_hold`: admin+ floor,
reason required, audit_log rows (no domain event — holds affect disposal only).

### 4.8 Env contract additions
`AZURE_DI_ENDPOINT`, `AZURE_DI_KEY` (service layer only — never model- or
DB-visible), `CLARA_DOC_EGRESS_APPROVED`, `CLARA_STORAGE_URL` + scoped storage
credential, spool dir + quota vars. Short DB transactions ride the existing runtime
pool (no third pool; no connection held across upload/scan/vendor calls) — the
17-session budget stands.

---

## 5. Deploy

Gated behind the ruling-7 ceremony. Additions: a Fly volume for the spool
(snapshots disabled, quota, TTL) — the machine stays ONE non-HA; CORS origin env;
the §4.8 secrets (names only); PostgREST must expose `clara` (existing checklist
item — the human lane now exercises filings/corrections via PostgREST). Deploy doc
records the Azure DI pin: tier, region, max file size/pages/TPS as facts.

## 6. Tests / verification

Contract-blind rig lane (never reads 0007) + state-transition acceptance: an
observable UI + DB assertion per lifecycle transition (uploading→…→filed, every
failure code, correction preview→approve). Crash-window drills per the S5-D1 failure
table (kill between spool/upload/readback/finalize/OCR; verify adopt/expire paths).
Idempotency storms (same op_key, same sha racing intakes, OCR step re-drive).
Cross-firm isolation additions (filings, candidates, corrections, identifiers).
Provenance re-shape proofs: unassigned uncitable; retired-filing uncitable for new
entries; correction lock discipline under concurrent posting (pg_blocking_pids
proof, per the Slice-3 rig lesson). Metering fail-closed + honest rejection copy.
Load ceilings MEASURED and recorded: 100-file batch, 20MB files, dup storms, OCR
429 throttling simulation, SSE liveness under ingest load (chat must stay live).
Freeze-lint: documentIngest_v1 frozen + registered; taxonomy v2 full-coverage test.

## 7. What does NOT change

Migrations 0001–0006; `chatTurn.v1` and its closure; the chat book-write floor; the
four structural invariants' mechanics (they gain the filing-based provenance shape,
never weaken); sessions private-by-default + masking; trace vendor path ABSENT; the
spike schemas + parked run (until the ceremony); `main` PR-only; secrets discipline.

## 8. Edge-case ledger (PM-rigor — each gets a decided behavior + a test)

Two intakes race with identical bytes (second adopts, one event total) · upload at
the docs/day boundary (fail-closed, honest copy) · password-protected/corrupt/
zero-byte/oversize files (persist? no — intake fails pre-finalize with honest code;
the file is not evidence until verified) · OCR fails after N retries (`ocr_failed` +
retry verb; document persists and is filable — OCR is a claim, the document is
truth) · HEIC/TIFF pages that Azure rejects (recorded limit; failure code) ·
multi-document scan in one PDF (no splitting v1 — recorded; kind 'other' + note) ·
unassigned aging (no SLA v1; FIFO + visibility only) · uploader leaves the firm
(uploaded_by survives; authz is live-membership) · client with no FY-end data
(retention far-future + surfaced gap) · browser abandons mid-stream (TTL expiry
sweep) · storage object exists without a row (verify-then-adopt, never trust
Already-Exists) · row without object (incident, never delete) · Azure regional
outage (bounded retries → `held`-style failure, batch continues) · XLSX with
macros/formulas (values only) · duplicate sha across two clients' intents (adopt +
candidate tension surfaced — never silent reuse of the first filing) · correcting A
on a doc also filed to B (B untouched; "swap" is the wrong abstraction) · partially
reversed citation sets (operate only on unreversed; stale-plan reject) · pending
reversal drafts (adopt only on exact hash match, else supersede explicitly) ·
solo-firm attest on corrections · closed-period blockers exposed in preview ·
concurrent posting vs retirement (lock discipline) · intake during drain/SIGTERM
(stop intake first; spool survives restart) · chat attachment to a session later
shared (part carries document_id only; document was firm-visible from persist).

## 9. Document-kind taxonomy (proposal — owner red-line)

`invoice, receipt, credit_note, debit_note, bank_statement, payment_voucher,
claim_form, payroll_summary, tax_correspondence, ssm_company_doc,
agreement_contract, e_invoice_xml, management_account, opening_balance_doc,
knowledge_artifact, handwritten_note, other` — nullable at ingest; classification is
metadata (informs review routing + future eval classes), never a gate, in v1.

## 10. Finding-integration map

| Finding | Where fixed |
|---|---|
| E-1/E-2 persist-not-structural | §4.1 transport-owned deterministic persist |
| E-3 immovable objects | superseded by S5-R4 content-addressing (owner-ratified) |
| E-4 key grammar unvalidated | §3.0 grammar CHECK at creation |
| E-5 invisible document state | §3.0 derived lane (zero-active-filings) |
| E-6 write-once OCR cache | §3.3 supersede-with-lineage re-OCR |
| E-8 unbounded 429 poll | §4.2 hard total deadline |
| E-9 fabricated confidence | S5-D2 two-lane; bands not numbers; eval gate |
| E-10 no bulk queue | §4.5 queued batches + per-file retry |
| E-11 silent attachment drop | §4.1 explicit accept-or-reject per intake |
| E-12 fire-and-forget follow-through | §3.7 outbox events + relay consumer |
| E-13 shared docs unrepresentable | S5-R5 multi-client filings |
| HIGH-12 unverified SHA | S5-D1 readback verify + DD-1 wake-ingest retirement |
| MEDIUM-18 deterministic legs | §3.3 persisted extraction facts |
| GAP3-4/3-5 retention/holds | S5-R9 §4.7 |
| GAP5-7 lane semantics | §4.5 FIFO + escape hatch |
| I-12 dual OCR envelope | §3.3 ONE producer-emitted shape |
| J-18 discarded regions | §3.3 regions persisted at ingest |
| D-5/D-10 chip honesty/dedup | §4.5 |

## 11. Follow-ups (recorded, not built)

Wave-A doc_review overlay + citation binding · model attribution behind the eval
gate (schema is ready: attempts/candidates carry matcher_version) · UBL parsing ·
TUS resumable · PDF splitting · export_artifacts retention inheritance · agent
propose-correction writer (Slice 6) · close-driven retention recompute (needs the
periods/close model) · document-kind auto-classification · per-part-type schemas
(Phase-4 catalog).

## 12. As-built amendments

*(Reserved — filled by the ladder's output.)*
