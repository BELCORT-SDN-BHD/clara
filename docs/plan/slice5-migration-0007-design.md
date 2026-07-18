# Slice 5 — migration `0007_document_pipeline.sql` design (companion to the contract)

**This file IS §3 of `slice5-document-pipeline-contract.md` (v1.2)** — split out
only for the 500-line file cap. Same status, same review ladder, same
normativity. Section numbers are shared with the contract (§3.x cites resolve
here; everything else resolves there).

House rules: 0001–0006 untouched; rig-validated on throwaways; every writer
SECURITY DEFINER with role floors, firm-scoped `op_key`/`op_receipts` idempotency,
audit_log rows, and same-txn domain events for DOMAIN facts (documents, filings,
extractions, corrections). Runtime-control tables (intakes, processing tasks,
reservations, metering) emit NO domain events. **Every new table: immutable
stamped `firm_id`, FORCE RLS, the three-policy pattern, zero direct DML for app
roles, composite same-firm FK constraints to parents.** Grant matrix: §3.10.

### 3.0 `documents` evolution + the client_id drop blast radius (enumerated, ordered)
`client_id` migrates into `document_filings`, then drops. 0007 must, in order:
1. Create filings; backfill one ACTIVE filing per existing non-null client_id with
   `basis='legacy-0007'` and **`resolution_id` NULL** — the backfill **creates NO
   resolutions** (a claim-only wake ingest must never become posting authority).
   Legacy rows keep their storage_path preserved as-is (any grammar).
2. **Backfill `journal_entries.filing_id`** (the migration-apply blocker fix):
   lock `journal_entries` writes; add the column NULLABLE; UPDATE every
   document-citing entry to the unique legacy filing for
   (entry.document_id → entry.client_id) — the migration **ABORTS if any cited
   entry lacks exactly one match** (zero-ambiguity proof); the backfill runs
   with `_tf_entry_immutable` DISABLED in-txn (ALTER TABLE … DISABLE TRIGGER,
   re-enabled before commit — approved entries reject all other updates); THEN
   add the paired CHECK `(document_id is null)=(filing_id is null)` as
   `NOT VALID` and `VALIDATE` it.
3. `CREATE OR REPLACE _tf_validate_domain_event`: document↔client congruence via
   a **filings lookup (any status** — historical events reference retired
   filings); entry/resolution branches unchanged.
4. Replace the documents stamp path: a documents-specific stamp trigger deriving
   `firm_id` from the writer-passed value (no client_id read).
5. Rework `_tf_documents_immutable`: `id`, `firm_id`, `sha256` frozen; DELETE
   blocked; the client_id freeze drops with the column.
6. Retire BOTH legacy ingest writers (**DD-1 extended**): `ingest_document` AND
   `wake_ingest_document` bodies → deterministic CLR error; EXECUTE revoked;
   allowlist row deleted; `_ingest_document_core` dropped. The intake finalizer
   (§3.2) is the SOLE document creator.
7. Replace the context-pack documents section (docs-per-client via ACTIVE
   filings; extraction blobs NEVER serialized — metadata only) **and add the
   `withdrawn` exclusion to `recent_entries`** (it has no status filter today).
8. Replace indexes (`ix_documents_client_recent` → filing-based); update seeds +
   rig fixtures per §3.11's fixture provision.
9. Execute the taxonomy-v2 cutover per the §3.11 protocol (quiesce-aware).

New columns: `bytes_verified_at` (NULL = legacy claim-only), `page_count`,
`extraction_status` (`pending`|`running`|`done`|`failed`|`skipped_structured_done`
|`stored_unparsed`|`held_egress` — CHECK; derived by writers only — E-5),
`document_kind`, `financial_date`, `retention_state` (`unanchored`|`anchored`),
`retain_until` (**persists across unanchor** — see §4.7: NULL only before the
FIRST anchor; `retention_state`, not NULL, governs; the floor-never-shorten
trigger therefore holds monotonic across unanchor→re-anchor cycles),
`retention_basis`, `legal_hold` + `legal_hold_reason`. Existing `status` CHECK
untouched. Lane membership derived: unassigned ⇔ zero active filings.
`storage_path` grammar CHECK for post-0007 inserts (legacy preserved).

**Citability law:** new drafts/approvals citing a document require an ACTIVE
filing AND `bytes_verified_at IS NOT NULL`. Legacy claim-only documents stay
visible/filable but uncitable until upgraded (below); existing posted entries
are untouched history.

**Legacy claim-only UPGRADE branch (distinct from adoption):** an intake whose
verified sha matches a legacy claim-only row (bytes_verified_at NULL) upgrades
it: canonical object sealed (upload + readback as normal), `bytes_verified_at`
+ governed `storage_path` stamped on the EXISTING row (a dedicated
runtime-only writer; the immutability rework permits exactly this transition
once), its FIRST processing task created, reservation charged as a fresh
ingest, filings preserved. No second document row, no new `document.ingested`
(identity unchanged — staleness arrives via the extraction event under §3.7
relevance). Exactly-once via (firm, sha256) uniqueness + the task UNIQUE.

### 3.1 `document_filings` + filing-bound provenance
Columns: `id, firm_id, document_id, client_id, filed_at, filed_by,
resolution_id (nullable — NULL only for basis='legacy-0007'), basis,
retired_at, retired_by, retirement_reason, correction_id, revision_token`;
partial UNIQUE `(document_id, client_id) WHERE retired_at IS NULL`; composite
same-firm FKs. Writers: `file_document` (human lane; records/uses a resolution
ABOUT the document — an uploader's explicit client choice IS a human
attribution act), `retire_document_filing(filing_id, reason, expected_revision,
op_key)` (S5-D3 primitive: CAS + structured blockers + draft block). Events:
`document.filed`, `document.filing_retired` (same-txn), each stamped with
`filing_id` in the payload.
**Two-layer provenance:**
1. **Admission (non-deferred, in the WRITERS — specified):** `_draft_entry_core`
   (the single body behind BOTH `draft_entry` and `wake_draft_entry` — both
   lanes inherit) derives `filing_id` SERVER-SIDE from the unique ACTIVE
   (document_id, p_client) filing — never caller-supplied; absence or
   ambiguity → CLR02 — checks the citability law, and stamps the column.
   `approve_entry` RE-AFFIRMS filing-active + citability at approval time.
2. **Belt (`_tf_check_provenance`, stays DEFERRABLE):** validates CONGRUENCE
   against the BOUND filing row — (document_id, sha256, client_id) match —
   regardless of retired state. The correction txn commits (activity was an
   admission-time property); reversal mirrors carry no document_id and never
   fire it (verified as-built).

### 3.2 `document_intakes` (runtime-control; no events) — state machine v1.2
Columns: `id, firm_id, uploaded_by, origin ('chat'|'documents_tab'),
chat_session_id (masked from all firm surfaces), original_filename,
declared_mime, declared_bytes, status, sha256 (server-computed), storage_key,
document_id, failure_code (CHECK: 'too_large'|'bad_type'|'limit'|
'checksum_mismatch'|'storage_error'|'expired'|'malware_detected'|'quarantined'|
'internal'), op_key, token_hash, expires_at, upload_lease_owner,
lease_expires_at, created_at, updated_at`.
**Statuses:** `uploading → received → verifying → {verified | duplicate |
failed}`; `verified → finalized` (fresh document created); `duplicate →
adopted` (mapped to the existing document, or the legacy UPGRADE branch);
any NON-terminal → `failed`. **Terminal states (`finalized`,`adopted`,`failed`)
are IMMUTABLE** — DB transition triggers enforce exactly this edge set.
Identity fields immutable after insert; `op_key` fixed at creation (retry
replays the receipt via CAS finalization); one upload lease (concurrent PUT
excluded; expiry reclaims). **Token semantics (split):** the hashed intake
token authorizes PUT-body + finalize ONLY (upload capability, TTL); status
GET requires the authenticated session + firm/uploader ownership — no token —
so chip polling is unconstrained and the token is genuinely single-purpose.
Authz per route as v1.1 (bookkeeper+, ownership, chat-origin session
predicate, non-oracular 404s). `finalize_document_intake` (runtime-only)
creates document + processing task + `document.ingested` in ONE txn; duplicate
→ adopt/upgrade with ONE charge + task + event lineage. Filing at finalize
only on explicit human client selection. Masking: zero base grant + definer
view WITHOUT `chat_session_id`.

### 3.3 `document_extractions` + `document_regions`
Extractions: `id, firm_id, document_id, engine_id (snapshot string), engine_kind
('ocr'|'structured_parse'), version_n, superseded_by (supersede-with-lineage,
E-6 — an extraction cited by anything is never edited in place), status,
page_count, envelope JSONB (ONE canonical producer-emitted shape — I-12),
extracted_at`; UNIQUE (document_id, engine_id, version_n). Regions:
`id, firm_id, extraction_id, locator_kind ('page_polygon'|'sheet_cell_range'|
'row_col'|'paragraph_run'), locator JSONB (kind-validated), field_path,
text_content, engine_confidence numeric` — engine confidence is DATA, never
authority; regions persist NOW (cannot be backfilled without re-OCR). Monetary
facts: raw string + deterministic bigint cents where parseable — claims, never
book figures. Events (vendor-neutral, both lanes):
`document.extraction_completed` / `document.extraction_failed`.

### 3.4 Attribution (S5-D2)
- `client_identifiers` (`firm_id, client_id, kind ('tin'|'ssm'|'bank_account'),
  value_normalized`) — **non-unique index, no uniqueness constraint**: a
  duplicate identifier across sibling clients must be REPRESENTABLE and cause
  lane-1 abstention with the conflict recorded. Audited human writer.
- `client_aliases` (`firm_id, client_id, alias_normalized, added_by/at,
  retired_at`) — the lane-2 registry (as-built clients carry only `name`);
  audited human writer; feeds candidates only, never authorizes.
- `attribution_attempts` idempotent per (document_id, matcher_version,
  input_fingerprint) — the matcher's replay key; `attribution_candidates`
  (`attempt_id, client_id, rank, rule_kind ('name_exact'|'alias_exact'),
  disposition ('open'|'confirmed'|'dismissed'), disposed_by/at`) + audited
  `confirm_attribution_candidate` / `dismiss_attribution_candidate` writers
  (confirm = human resolution + optional `file_document` in one txn).
- `record_rule_resolution(p_document, p_op_key)` — runtime-login-only EXECUTE
  (a deliberately widened runtime write surface — recorded); recomputes the
  lane-1 predicate server-side; confidence hardcoded ≥0.95 in-fn; unsuperseded
  rule-resolution per (document, client) deduped by partial unique index.
  Matcher SQL **hard-scopes firm_id in every query** (`clara_runtime` RLS is
  `using(true)` — RLS is NOT the tenant boundary on this lane).
v1.2 additions:
- **Candidate evidence is normalized:** `attribution_candidate_regions
  (candidate_id, region_id → document_regions, composite same-firm FK)` —
  no free-form JSON refs.
- **Registry changes are audit-only BY DECISION:** identifier/alias writers
  record audit_log rows and emit NO domain event (firm configuration, not a
  books fact; they alter future matching only). Recorded as a decision, not an
  omission.

### 3.5 Correction case + `withdrawn` — the status matrix
`filing_corrections` (`firm_id, document_id, from_client, to_client, reason,
maker, checker, status ('proposed'|'approved'|'completed'|'rejected'|'stale'),
plan_hash (binds the enumerated item set + books_version), books_version,
timestamps`) + `filing_correction_items` (`correction_id, entry_id,
entry_state_hash, action ('reverse'|'already_reversed'|'withdraw_draft'),
reversal_id, outcome`); stamped firm_id, FORCE RLS, composite FKs. Writers:
`preview_wrong_client_correction` (read-only blast radius),
`propose_wrong_client_correction` (persists plan + hash; no book effect;
always high-stakes), `approve_wrong_client_correction(correction_id,
plan_hash, attestation, op_key)` — distinct-checker or solo-attest;
per-entry reversal mirrors with whole-consequence (F3); aggregate
`document.correction_applied` + child events; all-or-nothing.
The **exhaustive `withdrawn` matrix:** book-effect reads EXCLUDE it (trial_balance — already approved-only;
close gates; subledgers; freshness; context-pack `recent_entries` — §3.0.7);
history/audit surfaces INCLUDE it (entry detail, correction receipts,
audit_log); **`_tf_lines_immutable` extends to freeze lines for status IN
('approved','withdrawn')** — withdrawn evidence is structurally frozen;
approval_history is approved-only and unaffected. Transition: draft→withdrawn
ONLY, actor/reason/time recorded. Closed-period HARD-BLOCK at approve;
stale-plan reject; adopted pending-reversal drafts on exact hash else explicit
supersede; global lock order as v1.1 (firm scope → filings id ASC → originals
id ASC → mirrors → unique slots; posting SHARED-locks the active filing).

### 3.6 Document metering — durable reservations
`firm_document_limits` as v1.1. **`document_ingest_reservations`** (the durable
carrier): `id, firm_id, intake_id, state ('reserved'|'resized'|'settled'|
'refunded'), docs_reserved (1), pages_reserved, lease_expires_at, task_id,
timestamps` — every transition under the namespaced advisory lock.
**Timing (fixed):** pre-spool reserve uses a conservative cap derived from
DECLARED size (deterministic table: bytes→page ceiling; images=1) — the real
PDF page count is unknowable before bytes; post-scan the reservation RESIZES
to the trusted preflight count; settle at extraction completion (actual
pages); refund on failed/expired intakes; adoption/upgrade transfers the
charge (ONE charge per physical ingest). Expired leases reclaimed by the
reconciler. Near-limit consequence recorded in contract §8: a duplicate
consumes a reservation until adoption refunds it.

### 3.7 Events + taxonomy v2 + filing-based freshness relevance
Event types + v2 routing as v1.1 (`document.ingested → ignore`; filed/retired/
correction_applied → context_update; extraction_* → ignore for the router;
full-coverage validated; activation migration-executed; operator fn exempted
of record — global-receipts follow-up scheduled in contract §11).
**[DELTA-OWNER-3 as ratified, mechanism generalized]:** `assert_books_current`
is replaced with **filing-based relevance for document-bearing events**: a
null-client event that carries a `document_id` is relevant to client X iff an
ACTIVE filing (document→X) exists — so an unassigned document's ingest AND
extraction events stale nobody, a filed document's events stale exactly its
filed clients, and `document.correction_applied` (aggregate) is EXEMPT (its
child events — entry.reversed→A, document.filed→B — carry the staleness).
Non-document null-client events keep firm-level staleness (the ADR-016
asymmetry narrows exactly this far).

### 3.8 Storage credential contract + doctrine enforcement
The runtime's storage principal is a **custom Postgres role** with Storage RLS
policies granting exactly bucket-scoped INSERT + SELECT on `firms/*/docs/*`
(no UPDATE, no DELETE), reached via a dedicated signed JWT assuming that role —
never `service_role`, never the anon/publishable key. Specified: JWT issuance +
rotation procedure, expiry behavior (fail-closed with an honest intake
failure), and a rig matrix proving the role cannot update/delete/read outside
the bucket. "Delete-never" is scoped to routine application principals;
platform break-glass is acknowledged + alarmed via the inventory sweep. Key
grammar enforced at creation (§3.0). The leader-guarded reconciler inventories
objects↔rows both directions (verify-then-adopt / incident, never delete).

### 3.9 `document_processing_tasks` — durable, BOUND, holdable
As v1.1 plus: **`workflow_run_id`** (CAS-bound when the workflow claims the
task — the Slice-4 self-bind pattern; proves boundness), status set gains
**`held_egress`** (`queued → held_egress` when the §4.6 flag is off;
`held_egress → queued` on flag-flip sweep or the retry verb), legal
transitions enumerated (`queued→running→{done|failed}`, `queued↔held_egress`,
terminal immutable). Reconciler: re-enqueues queued-UNBOUND tasks (crash
between finalize and workflow start), requeues stranded `running` tasks whose
run is engine-lost (checked against the engine run tables — Slice-4 pattern),
sweeps `held_egress` on flag flip. UNIQUE (document, engine, version) holds
one vendor call per content per engine version.

### 3.10 RLS / grant matrix (normative)
As v1.1, plus rows: `document_ingest_reservations` — no base grant, runtime
writers only; `attribution_candidate_regions` — SELECT firm policy (humans),
none (agent v1), runtime writers; `client_aliases` — as client_identifiers.
All writers SECURITY DEFINER with role floors; approve/correction writers have
NO grant to the agent role or runtime login.

### 3.11 0007 cutover protocol + fixture provision (NEW)
**Cutover (the D1 write-quiesce rule binds — a live runtime exists):**
1. Quiesce: stop intake + chat admission (drain mode), let the relay reach
   head and the drain leader finish consuming wake intents, STOP the runtime
   (no router batch may span the repoint — batches pin the taxonomy at batch
   start).
2. Apply 0007 (throwaway-validated first, as always).
3. **Residual-work sweep (in-migration):** cancel historical
   `background_review` wake intents for document events + their held
   task/outbox rows with an audited reason ('taxonomy-v2-cutover') — v1
   artifacts must not survive into v2 semantics.
4. Deploy the new runtime; verify /ready (router + matcher consumers), then
   re-open admission.
**Fixture provision (seeds + rigs lose the SQL ingest path):**
(a) `_seed_verified_document(...)` — SECURITY DEFINER owned by clara_fn_owner,
EXECUTE granted to NO app role (migration/seed/rig context only): mints a
verified document + optional filing without transport. (b) A runtime
test-adapter intake fixture exercising the REAL hash→canonical→readback→
finalize→task path with synthetic bytes (the §6 rig's transport-true lane).
(c) A legacy-upgrade fixture (claim-only row → verified via the upgrade
branch). Direct `bytes_verified_at` seeding outside (a) is forbidden — it
would bypass the citability proof.
