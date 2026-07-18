# Slice 5 — migration `0007_document_pipeline.sql` design (companion to the contract)

**This file IS §3 of `slice5-document-pipeline-contract.md` (v1.1)** — split out
only for the 500-line file cap. Same status, same review ladder, same
normativity. Section numbers are shared with the contract (§3.x cites resolve
here; everything else resolves there).

House rules: 0001–0006 untouched; rig-validated on throwaways; every writer
SECURITY DEFINER with role floors, firm-scoped `op_key`/`op_receipts` idempotency,
audit_log rows, and same-txn domain events for DOMAIN facts (documents, filings,
extractions, corrections). Runtime-control tables (intakes, processing tasks,
metering) emit NO domain events. **Every new table: immutable stamped `firm_id`,
FORCE RLS, the three-policy pattern (owner true / humans firm-scoped / agent_ro
firm-scoped where granted), zero direct DML for app roles, composite same-firm FK
constraints to parents.** The full grant + policy matrix is §3.10.

### 3.0 `documents` evolution + the client_id drop blast radius (enumerated)
`client_id` migrates into `document_filings`, then drops. 0007 must, in order:
1. Create filings; backfill one ACTIVE filing per existing non-null client_id with
   `basis='legacy-0007'` and **`resolution_id` NULL** — the backfill **creates NO
   resolutions** (a claim-only wake ingest must never become posting authority).
   Legacy rows keep their storage_path preserved as-is (any grammar).
2. `CREATE OR REPLACE _tf_validate_domain_event`: document↔client congruence
   validated via a **filings lookup (any status** — historical events reference
   retired filings); entry/resolution branches unchanged.
3. Replace the documents stamp path: a documents-specific stamp trigger deriving
   `firm_id` from the writer-passed value (no client_id read).
4. Rework `_tf_documents_immutable`: `id`, `firm_id`, `sha256` frozen; DELETE
   blocked; drop the client_id freeze with the column.
5. Retire BOTH legacy ingest writers (**DD-1 extended**): `ingest_document` AND
   `wake_ingest_document` bodies replaced with a deterministic CLR error
   ("superseded by verified intake"); EXECUTE revoked from `clara_authenticated`;
   the wake allowlist row deleted; `_ingest_document_core` dropped. The intake
   finalizer (§3.2) is the SOLE document creator.
6. Replace the context-pack documents section: docs-per-client via ACTIVE filings;
   extraction blobs NEVER serialized into packs (metadata only).
7. Replace indexes (`ix_documents_client_recent` → filing-based) and update seeds
   + any rig fixtures that reference documents.client_id.

New columns: `bytes_verified_at` (NULL = legacy claim-only), `page_count`,
`extraction_status` (`pending`|`running`|`done`|`failed`|`skipped_structured_done`
|`stored_unparsed`|`held_egress` — CHECK; derived by writers only — E-5),
`document_kind` (nullable; contract §9), `financial_date`, `retention_state`
(`unanchored`|`anchored`), `retain_until` (NULL iff unanchored;
floor-never-shorten trigger on anchored values), `retention_basis`, `legal_hold`
+ `legal_hold_reason`. Existing `status` CHECK stays untouched. Lane membership
is derived: unassigned ⇔ zero active filings. `storage_path` gains the grammar
CHECK for NEW rows (legacy paths preserved; enforcement via insert-path trigger).

**Citability law:** new drafts/approvals citing a document require an ACTIVE
filing AND `bytes_verified_at IS NOT NULL` — legacy claim-only documents remain
visible/filable but uncitable until re-uploaded through the verified intake
(their filing history survives; existing posted entries are untouched history).

### 3.1 `document_filings` (historical, never deleted) + filing-bound provenance
Columns: `id, firm_id, document_id, client_id, filed_at, filed_by, resolution_id
(nullable — NULL only for basis='legacy-0007'), basis, retired_at, retired_by,
retirement_reason, correction_id, revision_token`; partial UNIQUE
`(document_id, client_id) WHERE retired_at IS NULL`; composite same-firm FKs.
Writers: `file_document` (human lane; records/uses a resolution ABOUT the
document — an uploader's explicit client choice IS a human attribution act),
`retire_document_filing(filing_id, reason, expected_revision, op_key)` (S5-D3
primitive: CAS + structured blockers + draft block). Events: `document.filed`,
`document.filing_retired` (same-txn), each stamped with `filing_id` in payload.

**Provenance re-shape (belt redesign — the deferred-trigger fix):**
`journal_entries` gains `filing_id` (nullable; REQUIRED when document_id is
present — paired CHECK like ck_je_doc_pair). Two layers:
1. **Admission (non-deferred, inside draft/approve writers):** the bound filing
   must be ACTIVE at write time, belong to the entry's client, and the document
   must satisfy the citability law (§3.0).
2. **Belt (`_tf_check_provenance`, stays DEFERRABLE):** validates CONGRUENCE
   against the bound filing row — (document_id, sha256, client_id) match the
   filing — **regardless of the filing's retired state**. The correction
   transaction therefore commits: originals' reversal stamps re-fire the belt,
   which validates congruence against their (now retired) filing and passes;
   activity was enforced at admission time. Reversal mirrors carry no
   document_id and never fire it (verified as-built).

### 3.2 `document_intakes` (runtime-control; no events) — hardened state machine
Columns: v1.0 set + `token_hash` (single-use bearer token, hashed, TTL),
`expires_at`, `upload_lease_owner`/`lease_expires_at`, `failure_code` allowlist
+ `'malware_detected'|'quarantined'`. **Structural contract:** DB transition
triggers enforce the legal edge set
(`uploading→received→verifying→{verified,duplicate,failed}`, `verified→adopted`,
any→`failed`); identity fields (firm, uploader, origin, declared_*) immutable
after insert; `op_key` fixed at creation (a retry NEVER mints a new op_key —
CAS finalization replays the receipt); one upload lease at a time (concurrent
PUT excluded; lease expiry reclaims). **Authz:** every route requires
bookkeeper+ live membership; PUT/finalize/GET additionally require intake
ownership (same firm + same uploader) + the intake token; `origin='chat'`
requires an accessible session (authz session predicate); unknown/foreign
intake ids are indistinguishable 404s (non-oracular).

`finalize_document_intake` (runtime-login-only EXECUTE) creates the document
row + the processing task (§3.9) + `document.ingested` in ONE txn, idempotent
by op_key; on (firm, sha256) conflict it **adopts** (maps the intake, shares
the existing charge/task, surfaces "already uploaded on …" — never a second
row, event, or vendor call). Filing at finalize happens ONLY when the upload
carried an explicit human client selection (Documents tab inside a client
workspace) — recorded as a human resolution + filing in the same txn;
chat/global uploads always land unassigned. Masking: humans have ZERO
base-table grant; a definer view exposes intake rows firm-scoped WITHOUT
`chat_session_id` (ruling-9 mechanism).

### 3.3 `document_extractions` + `document_regions`
Extractions: `id, firm_id, document_id, engine_id (snapshot string), engine_kind
('ocr'|'structured_parse'), version_n, superseded_by (supersede-with-lineage,
E-6 — an extraction cited by anything is never edited in place), status,
page_count, envelope JSONB (ONE canonical producer-emitted shape — I-12),
extracted_at`; UNIQUE (document_id, engine_id, version_n). Regions:
`id, firm_id, extraction_id, locator_kind
('page_polygon'|'sheet_cell_range'|'row_col'|'paragraph_run'), locator JSONB
(kind-validated), field_path, text_content, engine_confidence numeric` —
engine confidence is DATA, never authority. Regions persist NOW (cannot be
backfilled without re-OCR). Monetary facts: raw string + deterministic bigint
cents where parseable — claims, never book figures. Events (vendor-neutral,
both lanes): **`document.extraction_completed` / `document.extraction_failed`**.

### 3.4 Attribution (S5-D2)
- `client_identifiers` (`firm_id, client_id, kind ('tin'|'ssm'|'bank_account'),
  value_normalized`) — **non-unique index, no uniqueness constraint**: a
  duplicate identifier across sibling clients must be REPRESENTABLE and cause
  lane-1 abstention with the conflict recorded, never hidden by a constraint.
  Audited human writer maintains it.
- `client_aliases` (`firm_id, client_id, alias_normalized, added_by/at,
  retired_at`) — the lane-2 registry (the as-built clients table has only
  `name`); audited human writer; feeds candidates only, never authorizes.
- `attribution_attempts` idempotent per (document_id, matcher_version,
  input_fingerprint) — the matcher's replay key; `attribution_candidates` +
  audited `confirm_attribution_candidate` / `dismiss_attribution_candidate`
  writers (confirm = human resolution + optional `file_document` in one txn).
- `record_rule_resolution(p_document, p_op_key)` — runtime-login-only EXECUTE
  (a deliberately widened runtime write surface — recorded); recomputes the
  lane-1 predicate server-side; confidence hardcoded ≥0.95 in-fn; unsuperseded
  rule-resolution per (document, client) deduped by partial unique index.
  Matcher SQL **hard-scopes firm_id in every query** (`clara_runtime` RLS is
  `using(true)` — RLS is NOT the tenant boundary on this lane).

### 3.5 Correction case (S5-D3) + the `withdrawn` status + lock order
`filing_corrections` (`firm_id, document_id, from_client, to_client, reason,
maker, checker, status ('proposed'|'approved'|'completed'|'rejected'|'stale'),
plan_hash (binds the enumerated item set + books_version), books_version,
timestamps`) + `filing_correction_items` (`correction_id, entry_id,
entry_state_hash, action ('reverse'|'already_reversed'|'withdraw_draft'),
reversal_id, outcome`); stamped firm_id, FORCE RLS, composite FKs.
**`journal_entries.status` CHECK gains `'withdrawn'`** (legal transition:
draft→withdrawn ONLY, via the correction writer or an explicit audited withdraw
writer; actor/reason/time recorded; immutability trigger reworked; every
existing status predicate — uncoded-docs close gate, TB, listings — explicitly
excludes withdrawn). Writers: `preview_wrong_client_correction` (read-only),
`propose_wrong_client_correction` (persists plan + hash; no book effect;
always high-stakes), `approve_wrong_client_correction(correction_id, plan_hash,
attestation, op_key)` — distinct-checker or solo-attest; stale-plan reject;
closed-period HARD-BLOCK (v1); adopted pending-reversal drafts only on exact
hash match, else explicit supersede; per-entry reversal mirrors with
whole-consequence (F3); aggregate `document.correction_applied` + child events;
all-or-nothing. **Global lock order (published, binding on all writers):** firm
advisory scope → `document_filings` rows by id ASC → original `journal_entries`
by id ASC → reversal mirrors (0005's original-before-mirror order preserved) →
unique-slot inserts last. Posting/approval takes a SHARED lock on the entry's
active filing; retirement/correction takes the conflicting lock.

### 3.6 Document metering (S5-R7) — reservation semantics
`firm_document_limits` (docs/day, pages/day, ocr_concurrency; operator defaults
+ per-firm override). Admission is a **reservation**:
`reserve_document_ingest(firm, op_key)` runs pre-spool (docs/day + concurrency
lease + a conservative page reservation: deterministic preflight page count for
PDF, 1 for images, byte-derived cap otherwise) under the namespaced advisory
lock, CLR rejection naming limit + UTC reset. Terminal paths settle-or-refund
idempotently: `settle_document_extraction` (actual pages), refund on
failed/expired/duplicate-adopted intakes (adoption shares the original charge).
Concurrency leases carry expiry; the reconciler reclaims leaked leases.

### 3.7 Events + taxonomy v2
New `event_types`: `document.filed`, `document.filing_retired`,
`document.extraction_completed`, `document.extraction_failed`,
`document.correction_applied`. **Taxonomy v2 full routing:**
`document.ingested → ignore` (the lane is DERIVED; no held task per document),
`document.filed → context_update`, `document.filing_retired → context_update`,
`document.extraction_completed → ignore` (router; the matcher consumer reads it
directly — contract §4.4), `document.extraction_failed → ignore` (surfaced via
lane/chip), `document.correction_applied → context_update` (two-sided staleness
rides the child events: entry.reversed→A, document.filed→B). All pre-existing
mappings carried forward. **Activation is migration-executed:** taxonomy v2 is
inserted + coverage-validated + repointed INSIDE 0007 (the guarded singleton
pattern the rig proves). `activate_taxonomy_version(v)` ships as an operator fn
for later versions, explicitly **exempted of record** from firm-scoped
op_receipts/audit (a global catalog operation; the 0002 stores require non-null
firm_id — its audit surface is the migration/operator context).

**[DELTA-OWNER-3] Freshness amendment (ADR-016 note at merge):**
`assert_books_current` is replaced so a null-client `document.ingested` no
longer stales every client (with the filings model an unassigned document is in
NO client pack — the staleness point moves to `document.filed`). All OTHER
null-client events keep firm-level staleness (the ADR-016 asymmetry narrows,
not disappears).

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

### 3.9 `document_processing_tasks` (runtime-control) — durable extraction
Created IN the finalizer transaction (the Slice-4 durable-enqueue pattern):
`id, firm_id, document_id, engine_id, engine_config (snapshot), version_n,
lane ('ocr'|'structured_parse'|'none'), status
('queued'|'running'|'done'|'failed'), vendor_op_ref, attempt_count, error_code
(CHECK allowlist), timestamps`; UNIQUE (document_id, engine_id, version_n).
The workflow receives ONLY `{task_id}`; it self-claims (queued→running CAS),
persists vendor operation state for crash-resume, and the reconciler
re-enqueues unbound queued tasks (a crash between finalize-commit and
workflow-start is recovered; two same-SHA intakes share one task via adoption —
one vendor call). The engine snapshot lives here (S5-R2's per-task snapshot law
has a real carrier).

### 3.10 RLS / grant matrix (normative)
| Table | humans (`clara_authenticated`) | `clara_agent_ro` | `clara_runtime` |
|---|---|---|---|
| document_filings | SELECT via firm policy | SELECT via wake_firm policy (packs/tools) | writers only |
| document_extractions / _regions | SELECT firm policy | SELECT wake_firm policy | writers only |
| attribution_attempts / _candidates | SELECT firm policy | none (v1) | writers only |
| client_identifiers / client_aliases | SELECT firm policy; audited writers | none | SELECT (matcher; SQL hard-scopes firm) |
| filing_corrections / _items | SELECT firm policy; preview/propose/approve writers | none | none |
| document_intakes | NO base grant; masked definer view | none | full via writers |
| document_processing_tasks | NO base grant; masked status view (chip) | none | full via writers |
| firm_document_limits | SELECT firm policy | none | reserve/settle writers |

All writers SECURITY DEFINER with explicit role-floor checks; approve/correction
writers have NO grant to the agent role or runtime login (human-only).
