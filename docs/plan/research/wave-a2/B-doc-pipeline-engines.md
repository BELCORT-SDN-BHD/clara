# Lane B — Document pipeline, extraction engines, and where a MyInvois XML upload enters

Grounding brief for the Wave A2 design (sales-invoice/AR + MyInvois XML file-upload as a
`structured_parse` engine). FACTS ONLY, as-built at HEAD (`03b854e`), migrations 0001–0014,
runtime Fly v19. File:line references are to the current tree. `UNVERIFIED` marks anything I did
not confirm in code.

---

## 0. The deliverable — concrete insertion options (details in §5)

A MyInvois UBL XML is admitted at intake TODAY but routed to `lane='none'` **store-only** — it is
stored as canonical evidence and never parsed (`laneSnapshot`, `packages/runtime/lib/intake.mjs:157`).
No code reads/writes the `e_invoice_xml` `document_kind` (it is a declared-but-unused taxonomy slot).
There are three structurally distinct ways to turn an uploaded XML into invoice facts:

- **Option A — new local `structured_parse` branch (generic regions).** Route XML → `structured_parse`
  lane (change `laneSnapshot`), add an `xml`/UBL branch to the **not-frozen** worker
  `packages/runtime/lib/structured-worker.mjs`. Flows through the **frozen** `documentIngest` body
  unchanged, persists generic `document_regions` under `engine_kind='structured_parse'`.
  Touches: `intake.mjs` (mutable), `structured-worker.mjs` (mutable), no DB migration, no new frozen
  workflow. **But** this yields generic text/cell regions, NOT the semantic `invoice.*` facts the
  coding lane corroborates against — the AR coding lane would have to read UBL fields itself.
- **Option B — new local no-egress `invoice_facts` engine snapshot.** Parse the UBL XML in-process and
  write an `engine_kind='invoice_facts'` extraction via `persist_invoice_facts`, i.e. a local
  alternative to the Azure `prebuilt-invoice` adapter. This is the semantically-rich path (populates
  `invoice.total`, `invoice.vendor_name`, `invoice.vendor_registration`, `invoice.invoice_id`, …).
  Touches: a DB CoR on `_enqueue_invoice_facts_core` + `persist_invoice_facts` (both hard-code the
  Azure `engine_id` string and `lane='invoice_facts'`), the claim gate, and a new not-frozen mapper
  (mirror of `invoiceFacts.v1.azure.mjs`). Constrained by the empty-polygon corroboration rule (§6).
- **Option C — new dedicated engine kind / lane (`einvoice_xml`).** A first-class local structured
  engine for e-invoices, distinct from both `ocr` and `invoice_facts`, with its own persist writer and
  its own coding-lane reader. Widens the `engine_kind`/`lane` CHECKs (DB migration), likely a new
  frozen `einvoiceIngest_vN` workflow. Cleanest semantics; most surface area.

The single sharpest constraint across all three: **the egress/dispatch claim gate treats
`structured_parse` as egress-eligible** and holds it under the kill-switch even though it runs locally
(§3, `claim_document_processing_task`, `0011:2333`). A purely-local XML parse would be `held_egress`
on the live box unless the gate is amended or the XML rides `lane='none'`. See §6 for the full
invariant set and §Open-questions.

---

## 1. document_kind taxonomy, filings, and the intake transport

### 1.1 `document_kind` taxonomy (nullable `text` CHECK on `clara.documents`)
Declared in `0007_document_pipeline.sql:33-37`; the check was dropped-and-rebuilt in
`0014_consent_evidence_documents.sql:64-69` to add `consent_evidence`. Full current set:

`invoice, receipt, credit_note, debit_note, bank_statement, payment_voucher, claim_form,
payroll_summary, tax_correspondence, ssm_company_doc, agreement_contract, e_invoice_xml,
management_account, opening_balance_doc, knowledge_artifact, handwritten_note, consent_evidence,
other` — or `NULL`.

- `document_kind` is **NULL at ingest** (`finalize_document_intake` does not set it, `0007:2010-2013`).
- It is stamped **later** by the engine: `persist_invoice_facts` sets `document_kind='invoice'`
  (`0013_vendor_registration_facts.sql:147`); `grant_client_egress` stamps `consent_evidence`
  (`0014:107-109`, refusing a doc already classified as something else).
- **`e_invoice_xml` is DECLARED BUT UNUSED** — grep finds no code that sets or reads it. It is a
  reserved slot, exactly the natural target for a MyInvois upload.
- PRD LAW (`docs/prd/PRD.md:93,165,183`): inbound **UBL-XML parse = MyInvois "Track C", scoped
  "contract + schema-readiness only"** so far; outbound issuance is out of scope. Wave A2 promotes
  Track C from contract-stage to real — flag against PRD scope with the owner.

### 1.2 Filings + filing-bound provenance chain
- `clara.document_filings` (`0007:63-98`): immutable active filing per (document, client) with a
  `resolution_id` that must be a `human|rule` client_resolution at confidence ≥0.95 (enforced by
  `_tf_stamp_document_pipeline`, `0007:425-431`, error `CLR01`). `basis in
  ('legacy-0007','human','rule','correction','seed-0007')`.
- **Filing-bound provenance is a structural invariant.** `_tf_validate_domain_event` (`0007:867-904`)
  requires that any event carrying a typed `document_id` and a `client_id` have that document in the
  client's **filing history** (`0007:889-896`). Journal entries bind `filing_id` + `document_id` as a
  matched pair (`ck_je_document_filing_pair`, `0007:857-859`).
- **This is the exact trap 0014 solved for consent docs**: `file_document` intrinsically enqueues an
  invoice-facts task (→ egress), so a legal consent PDF filed the normal way would be egressed. 0014's
  fix routes consent evidence out of the bookkeeping pipeline (payload event, structural facts
  exemption) rather than weakening the invariant (`0014:1-44`). A MyInvois XML that must NOT egress can
  reuse this pattern — but note an XML parsed **locally** needs no such exemption because nothing
  leaves the box (§3.4).

### 1.3 Intake transport (the upload API in the runtime)
Routes (`packages/runtime/src/intakeRoutes.ts`), all under `/api/intake`, CORS-allowlisted
(`intakeRoutes.ts:45-63`), Origin must be an exact member of `CLARA_INTAKE_CORS_ORIGINS`:

- `POST /api/intake/documents` (`intakeRoutes.ts:69`) → `beginDocumentIntake` → SQL
  `clara.create_document_intake(...)`. Returns `{intake_id, upload_token, expires_at}`.
- `PUT /api/intake/documents/:id/bytes` (`:86`) → `uploadDocumentBytes`. Requires
  `content-type: application/octet-stream` (`:96`), `Authorization: Bearer <upload_token>`.
- `POST /api/intake/documents/:id/finalize` (`:109`) → `finalizeDocumentIntake`, whose
  `enqueue` starts the **`documentIngest`** workflow (`intakeRoutes.ts:125`).

Capability model (`lib/intake.mjs`):
- `upload_token` = 32 random bytes base64url (`intake.mjs:175`); only its **sha256 `token_hash`** is
  persisted (`document_intakes.token_hash`, `0007:119-121`). 15-minute TTL
  (`CAPABILITY_TTL_MS`, `intake.mjs:24`; `expires_at`, `0007:122`). Timing-safe compare (`:69-74`).
- `origin` ∈ `{'chat','documents_tab'}` (`0007:107`; validated `intake.mjs:98`). `chat` requires a
  `chat_session_id`; `documents_tab` forbids it (`ck_document_intakes_origin`, `0007:131-133`).
- `declared_bytes`: `>0 and <=20971520` (20 MiB) at the DB (`0007:108`) and in the runtime
  (`MAX_BYTES`, `intake.mjs:23`, `validateBegin` `:95`).
- MIME allowlist (`MIME_ALIASES`, `intake.mjs:41-54`): pdf, png, jpeg, webp, tiff, heic,
  **`application/xml` + `text/xml`→`application/xml`**, csv, tsv, xlsx, docx. **XML is admitted.**
- Intake state machine (`document_intakes.status`, `0007:109-111`): `uploading→received→verifying→
  verified→finalized` (+ `duplicate→adopted`, `failed`); transitions enforced by
  `_tf_document_intake_update` (`0007:558-596`).

### 1.4 Scanner law (fail-closed) + XML detection (`packages/runtime/lib/scan.mjs`)
- `detectDocument` (`scan.mjs:190-207`) sniffs by magic bytes; the **XML branch** requires
  `ext==='xml'` AND content starting with `<` (`:202-205`), runs `validatePlainXml`, returns
  `{format:'xml', mime:'application/xml', pages:0}` (note **pages:0**).
- **XXE defense**: `validatePlainXml`/`assertNoEntities` (`scan.mjs:35-55`) rejects any
  `<!DOCTYPE` or `<!ENTITY` (`quarantined`), and requires strict UTF-8. **A real MyInvois UBL may
  carry an XML declaration and namespaces but must have NO DOCTYPE/ENTITY** — verify sample files pass
  this gate (they should; UBL doesn't use DTDs).
- **Fail-closed malware scan** (`scanFile`, `scan.mjs:281-356`): clamd INSTREAM over one persistent
  socket + a scan-wide deadline; any fault → `scanner_unavailable` **503, nothing stored unscanned**
  (`scannerUnavailable`, `:273`). Managed-clamd bounces are self-healing, not runtime-fatal
  (`startManagedScanner`, `:376`; PIN-AB-2).
- OOXML zip-bomb / macro / ZIP64 / encryption caps in `readZipEntries` (`scan.mjs:68-135`) — relevant
  only if a MyInvois file ever arrives zipped; a bare `.xml` uses `validatePlainXml`, not the zip path.

---

## 2. Extraction engines as-built

### 2.1 Every `engine_kind` / `lane` value ever declared (schema CHECKs + code)
Two separate columns evolve in lockstep:

- `document_processing_tasks.lane` (the queued task): `0007:155` = `('ocr','structured_parse','none')`;
  **widened** by `0009_coding_floor.sql:774` to `('ocr','structured_parse','none','invoice_facts')`.
- `document_extractions.engine_kind` (the persisted result): `0007:188` =
  `('ocr','structured_parse')`; **dropped+rebuilt** by `0009:791-794`
  (`ck_document_extractions_engine_kind_0009`) to `('ocr','structured_parse','invoice_facts')`.
- No migration adds any value beyond these three. There is **no** `xml`/`einvoice` engine_kind or lane
  today — Option C would add one here (DB migration).

### 2.2 How `ocr` and `structured_parse` are represented today
Lane is chosen at finalize by `laneSnapshot(format)` (`packages/runtime/lib/intake.mjs:153-159`):
- `xlsx|docx|csv|tsv` → **`structured_parse`**, engine `clara-structured:v1`
  (`STRUCTURED_ENGINE_SNAPSHOT`, `intake.mjs:29-33`).
- **`xml` → `none`**, engine `clara-store-only:v1` (`STORE_ONLY_ENGINE_SNAPSHOT`, `:35-39`) — store
  only, never parsed.
- everything else (pdf, images) → **`ocr`**, engine `azure-di:prebuilt-layout:2024-11-30`
  (`AZURE_ENGINE_SNAPSHOT`, `lib/egress.mjs:171-175`).

`finalize_document_intake` (`0007:1977-2081`) takes `p_engine_id/p_engine_config/p_version_n/p_lane`
from the runtime and inserts the **first** processing task (`0007:2025-2028`) with `status='queued'`;
document created with `extraction_status='pending'`.

### 2.3 `documentIngest_v1` flow (FROZEN)
Entry `documentIngest.v1.ts` → `documentIngest.impl.ts` (claims) → `documentIngest.behavior.mjs`
(the closure). Behavior (`packages/runtime/workflows/documentIngest.behavior.mjs:30-81`):
- `lane==='none'` → `clara.complete_stored_document_task` (`0007:2212`), remove task meta, done. **No
  extraction row, no egress.** (This is where an uploaded XML lands today.)
- else download canonical bytes to a temp file, then:
  - `lane==='ocr'` → `services.analyzeDocument` (Azure layout, **egress**),
  - else (`structured_parse`) → `services.parseStructured` (**local worker thread**),
  - then `clara.persist_document_extraction(...)` writes the extraction + regions.
- The claim happens in `documentIngest.impl.ts:48-54`: reads
  `CLARA_DOC_EGRESS_APPROVED==='1'` and passes it as `p_egress_approved` to
  `claim_document_processing_task`.

### 2.4 The worker-thread structured parse — what is reusable for a UBL XML
`packages/runtime/lib/structured.mjs` runs a single-concurrency, memory-capped Node
`worker_threads` worker (`structured.mjs:5-28`). The worker
`packages/runtime/lib/structured-worker.mjs` currently branches on `format`:
- `xlsx` → `parseXlsx` (`structured-worker.mjs:71-92`, unzips OOXML, regex-scrapes cells →
  `locator_kind:'sheet_cell_range'` regions),
- `docx` → `parseDocx` (`:94-107`, → `paragraph_run` regions),
- else → `parseCsv` (`:37-53`, → `row_col` regions).
- It already contains an `xmlDecode` helper (`:8-15`) and regex-based XML element scraping (used for
  the OOXML sheets), plus `MAX_ITEMS=50000` / `MAX_TEXT=4MiB` caps (`:5-6`).
- **There is NO raw-XML/`format==='xml'` branch** — an uploaded `.xml` never reaches this worker
  because `laneSnapshot` routes it to `lane='none'`. Adding a UBL branch here (Option A) is a small,
  not-frozen change; its output shape is a `{pageCount, envelope, regions[]}` where each region is
  `{locator_kind, locator, field_path, text_content, engine_confidence, monetary_raw, monetary_cents}`
  — the same shape `persist_document_extraction` consumes.
- **Reusability caveat**: the worker emits generic `structured_parse` regions (cells/rows/paras), not
  the semantic `invoice.*` `field_path` vocabulary. To feed `invoice_facts` corroboration you need the
  Option-B/C mapper, not this generic worker.

### 2.5 The `invoice_facts` second pass (the semantic engine, currently Azure-only)
`invoiceFacts.v1` is a **second, additive** engine pass over an already-filed bill (frozen bodies:
`invoiceFacts.v1.ts` / `.impl.ts` / `.behavior.mjs`). It is RECEIPT-DRIVEN (no spool sidecar) — doc
metadata comes flat off the claim receipt (`invoiceFacts.v1.behavior.mjs:8-14, 82-95`).
- Its adapter `services.analyzeInvoice` → `invoiceFacts.v1.azure.mjs` calls Azure DI
  **`prebuilt-invoice`** (`analyzeInvoiceReal`, `invoiceFacts.v1.azure.mjs:74-136`, **egress**), then
  `normalizeAzureInvoice` (`:305-385`) maps DI fields → the pinned `field_path` vocabulary and calls
  `clara.persist_invoice_facts(...)`.
- `persist_invoice_facts` (live version `0013:47-210`) whitelists exactly:
  `invoice.total, invoice.amount_due, invoice.currency, invoice.vendor_name,
  invoice.vendor_registration, invoice.invoice_id, invoice.invoice_date, invoice.deposit`
  (`0013:112-114`). Each field row **must carry `page` + `polygon`** (`0013:104-105`) and writes a
  `page_polygon` region (`0013:130-137`). It **hard-codes** the extraction `engine_id`
  `'azure-di:prebuilt-invoice:2024-11-30'` (`0013:96`) — it does NOT read `t.engine_id` for the
  written row. `_enqueue_invoice_facts_core` likewise hard-codes that engine_id string
  (`0014:213,220`).

---

## 3. `_enqueue_invoice_facts_core` gating, the egress claim gate, and where egress physically happens

### 3.1 `_enqueue_invoice_facts_core` (live version `0014:175-239`)
- **0014 structural exemption (checked FIRST, before mime):** `document_kind='consent_evidence'` →
  returns `skipped_consent_evidence`, never enqueues (`0014:185-187`). This is the "never egress the
  signed consent letter" guarantee.
- Then a mime gate: only `application/pdf` or `image/*` proceed; anything else →
  `skipped_type` (`0014:188-191`). **An XML (mime `application/xml`) already returns `skipped_type`
  here** — so today an XML can never even become an `invoice_facts` task.
- Enqueues `lane='invoice_facts'`, `engine_id='azure-di:prebuilt-invoice:2024-11-30'`, `status='queued'`,
  with attempt-cap (3) and a reserve-processing-call budget check.

### 3.2 The WA-D1 consent gate + the egress claim gate — `claim_document_processing_task` (`0011:2315-2399`)
This is the real dispatch gate (called by both frozen impls before any vendor call). Key logic:
- **Kill-switch (all three lanes):** `if t.lane in ('ocr','structured_parse','invoice_facts') and not
  p_egress_approved → v_hold_reason:='kill_switch'` (`0011:2333-2335`).
- **Consent (invoice_facts only):** every **active filing client** of the document must hold a live
  `client_egress_consents` row; else `no_consent` / `partial_consent` (`0011:2336-2347`). Zero filings
  ⇒ `no_consent`.
- If any hold reason: task → `held_egress`, run/started cleared; for `ocr` also
  `documents.extraction_status='held_egress'` (`0011:2349-2361`). Returns
  `{status:'held_egress', payload:{clr:'CLR28', reason}}`.
- Otherwise task → `running` and the claim receipt carries `storage_path/sha256/mime_type/byte_size`
  (`0011:2391-2398`) for the workflow to download + send to the vendor.

### 3.3 The kill-switch mechanism
`CLARA_DOC_EGRESS_APPROVED` (env). Default/Fly value **`0`** (`packages/runtime/fly.toml:26`;
`packages/runtime/README.md:71,114`). Read in `documentIngest.impl.ts:48` and
`invoiceFacts.v1.impl.ts:63`; the reconciler re-drives held tasks only when it is `1`
(`lib/reconciler-documents.mjs:180,194`). Live posture: **egress kill-switch = 1** currently per the
harness state, but the default is `0`.

### 3.4 EXACTLY where egress happens (what leaves the box, to whom)
Two, and only two, code paths POST document bytes off-box, both to **Azure Document Intelligence**
(endpoint `AZURE_DI_ENDPOINT`, region southeast-asia):
1. `analyzeLayoutReal` (`packages/runtime/lib/egress.mjs:46-105`) — `POST …/documentModels/
   prebuilt-layout:analyze`, body = `createReadStream(filePath)` (`egress.mjs:62-65`). The **OCR**
   lane. Raw canonical bytes leave the box.
2. `analyzeInvoiceReal` (`invoiceFacts.v1.azure.mjs:74-136`) — `POST …/documentModels/
   prebuilt-invoice:analyze?...&features=keyValuePairs`, body = `createReadStream(filePath)`
   (`:90,97`). The **invoice_facts** lane. Raw bytes leave the box.

**`structured_parse` NEVER egresses** — `parseStructured` runs a local `worker_threads` worker
(`lib/structured.mjs`, `lib/structured-worker.mjs`). **`lane='none'` does nothing at all.** So:
> **An uploaded MyInvois XML parsed locally in-process needs ZERO egress — no bytes would leave the
> box.** But the claim gate at 3.2 **assumes** every `structured_parse` task is egress-eligible and
> holds it under the kill-switch anyway. The gate is conservative/over-broad for local parsing: it does
> NOT model a "local, no-egress extraction engine." A local XML engine either (a) rides `lane='none'`
> (bypasses the gate entirely, but then produces no extraction), or (b) needs the gate amended (CoR on
> `claim_document_processing_task`, which is NOT frozen) to recognize a no-egress local lane and skip
> the kill-switch/consent holds for it.

### 3.5 The empty-polygon corroboration wall (matters for XML)
`_invoice_fact_state` (live `0009:139-202`) computes `corroborated` (Tier-A). It requires
`v_locator='page_polygon'` AND a **non-empty polygon array** (`v_poly_ok`, `0009:185-188`): a total
with an empty polygon **can never reach Tier A** (comment `0009:183-184`; the Azure mapper deliberately
emits empty polygons rather than fabricating geometry, `invoiceFacts.v1.azure.mjs:138-148`). **A UBL
XML has no page geometry at all.** So an XML-derived `invoice.total` written as `invoice_facts` with an
empty polygon would be stored but **never corroborate** the amount under the current rule — a design
decision point (relax the rule for a structured-source engine, or accept no auto-corroboration, or
carry a synthetic non-geometric locator kind — see `document_regions.locator_kind` options at
`0007:207-208`: `page_polygon|sheet_cell_range|row_col|paragraph_run`).

---

## 4. Frozen vs mutable

Authoritative freeze manifest: `frozen-workflows.json` (enforced by
`scripts/check-frozen-workflows.mjs`; regenerate only via `pnpm freeze:update`). Workflow bodies are
immutable once deployed — behavioural change = new `_vN` export + repoint `workflows/registry.ts`
(ARCHITECTURE Appendix A).

**FROZEN (in the manifest):**
- `documentIngest.v1.ts`, `documentIngest.impl.ts`, `documentIngest.behavior.mjs`
- `invoiceFacts.v1.ts`, `invoiceFacts.v1.impl.ts`, `invoiceFacts.v1.behavior.mjs`
- `steps.ts`, `chatTurn.v1/v2/v3.*`, `autoDraft.v1.*`, `closeExample.v1.ts`

**NOT frozen (mutable infrastructure — absent from the manifest):**
- `invoiceFacts.v1.azure.mjs` — the Azure invoice **mapper/adapter**; header explicitly "NOT part of
  the frozen closure … so vendor tuning is not a workflow-version change (AB-16)"
  (`invoiceFacts.v1.azure.mjs:1-6`). Its `NORMALIZATION_VERSION` history is visible in-file:
  **v2 (Wave A) → v3 (Wave A.1, `VendorTaxId`→`invoice.vendor_registration`) → v4 (Wave A.1,
  `features=keyValuePairs` enabled)** = `"clara-invoice-norm:v4"` (`:21-35`).
- `invoiceFacts.v1.services.mjs` (service bundle), `lib/egress.mjs` (Azure layout adapter),
  `lib/intake.mjs` (incl. `laneSnapshot` routing), `lib/scan.mjs` (`detectDocument`),
  `lib/structured.mjs` + `lib/structured-worker.mjs` (the local parsers),
  `lib/reconciler-documents.mjs`.
- **All DB functions** are CoR-governed (same-arity `create or replace`, ACLs preserved), NOT
  workflow-frozen — e.g. `_enqueue_invoice_facts_core`, `persist_invoice_facts`,
  `claim_document_processing_task` have each been CoR'd across 0009→0014.

Implication: the two easiest levers for MyInvois are (1) `laneSnapshot`/`structured-worker.mjs`
(mutable) and (2) DB CoRs on the enqueue/claim/persist functions. Touching a **frozen** body
(`documentIngest.behavior.mjs` lane dispatch, or `invoiceFacts.v1.*`) requires a new `_vN`.

---

## 5. Insertion options for "MyInvois XML upload → structured_parse → invoice_facts"

| | Option A: generic `structured_parse` | Option B: local `invoice_facts` snapshot | Option C: new `einvoice_xml` engine kind/lane |
|---|---|---|---|
| **New `document_kind`?** | reuse `e_invoice_xml` (currently unused) — set it somewhere (mapper or a new writer) | reuse `e_invoice_xml`; `persist_invoice_facts` currently forces `document_kind='invoice'` (`0013:147`) — CoR needed to not clobber | new writer sets `e_invoice_xml` cleanly |
| **Same storage bucket?** | yes (canonical `firms/<firm>/docs/<sha>.xml`, already the path) | yes | yes |
| **Lane routing** | `laneSnapshot`: `xml → structured_parse` (mutable) | needs an `invoice_facts` task on the XML — but `_enqueue_invoice_facts_core` returns `skipped_type` for non-pdf/image (`0014:188-191`); CoR needed | new lane value (DB CHECK migration) + `laneSnapshot` |
| **Frozen workflow change?** | none (frozen `documentIngest` handles `structured_parse` already) | `invoiceFacts.v1.*` is Azure-shaped + receipt-driven; a local XML path likely needs a new `_vN` OR a new not-frozen adapter selected by engine_id | new frozen `einvoiceIngest_vN` |
| **New engine snapshot / mapper (not frozen)** | add `xml` branch to `structured-worker.mjs` | new not-frozen UBL→`invoice.*` mapper (mirror `invoiceFacts.v1.azure.mjs`, no network) | new not-frozen UBL mapper |
| **DB migration?** | none | CoR `_enqueue_invoice_facts_core` (drop mime gate for XML / add an xml lane), `persist_invoice_facts` (parameterize engine_id, allow non-`page_polygon` locator, don't force kind='invoice') | new migration: widen `lane`+`engine_kind` CHECKs, new persist writer, new `_*_fact_state` reader |
| **Egress** | **held by kill-switch** unless claim gate amended (§3.4) | same kill-switch problem + consent gate designed for cross-border Azure — semantically wrong for a local parse | can define the lane as no-egress in an amended claim gate |
| **Feeds AR/coding corroboration?** | No (generic regions) | Yes, but blocked by empty-polygon Tier-A wall (§3.5) unless relaxed | Yes, with a purpose-built reader |

**Cross-cutting facts that push toward B/C over A**: the AR/sales coding lane will want the semantic
`invoice.total`/`invoice.currency`/counterparty-registration facts (the same vocabulary
`persist_invoice_facts` already owns and `_invoice_fact_state` already reads). A UBL XML *contains
these as first-class structured elements* (e.g. `cbc:PayableAmount`, `cbc:DocumentCurrencyCode`,
`cac:AccountingSupplierParty` TIN/BRN), so a local mapper can populate them deterministically and with
higher trust than OCR — but only if the persist/corroboration path is taught that a structured-source
fact without a polygon is still trustworthy (§3.5).

---

## 6. Invariants that constrain the choice (LAW — never silently violated)

1. **The DB owns every number; the agent only orchestrates.** Facts persist through named audited
   writers (`persist_invoice_facts` / `persist_document_extraction`); a UBL mapper may parse and
   *shape* fields but the DB normalizes cents (`_normalize_invoice_cents`) and decides corroboration.
   No amount computed in JS.
2. **Provenance binding is structural** (`source_doc_sha256` + `document_id` + filing history validated
   in-txn — `_tf_validate_domain_event`, `0007:867-904`). Any XML-derived facts/events must respect
   the filing-history rule or route through the payload like 0014's consent events.
3. **Egress authority** (per-wake/kill-switch + per-client consent, `claim_document_processing_task`).
   The gate currently equates `structured_parse` with egress — the single biggest as-built friction
   for a local XML engine. Amending it (CoR, non-frozen) to model a no-egress lane is the clean fix but
   is security-critical (cross-model review before merge).
4. **Workflow bodies immutable** (Appendix A). Prefer mutable levers (`laneSnapshot`,
   `structured-worker.mjs`, DB CoRs); a new frozen body must be `einvoiceIngest_v1` + `registry.ts`
   repoint + `pnpm freeze:update`.
5. **Empty-polygon ⇒ never Tier-A** (`_invoice_fact_state`, `0009:185-188`). A structured (geometry-
   less) source needs an explicit corroboration policy decision.
6. **Consent-evidence / facts-exemption precedent** (0014): the pattern for "a document class that must
   not egress" already exists — reuse it if any XML sub-case must stay on-box, but note local parsing
   makes the egress question moot for the bytes themselves.
7. **`e_invoice_xml` `document_kind` reserved** — use it rather than minting a new kind (needs a CHECK
   migration only if a *new* kind is wanted).
8. **AR posting law is adjacent, not in this lane**: PRD/ARCH §3.5 require a sales invoice to compose
   the GL leg + AR open item + counterparty + event in ONE audited txn (`code_and_open_ar(...)`,
   `docs/architecture/ARCHITECTURE.md:85`). `UNVERIFIED` whether `code_and_open_ar`/`record_ar_invoice`
   exist in migrations yet — that belongs to the AR-posting lane's brief; this brief stops at
   "facts extracted from the XML."

---

## Open questions for design

1. **Lane identity for a local XML parse.** Ride existing `lane='none'` (no extraction, needs a
   separate reader), reuse `structured_parse` (must fix the kill-switch gate that holds it as if it
   egressed), or add a first-class no-egress `einvoice_xml` lane/`engine_kind` (DB CHECK migration)?
   The claim-gate amendment is security-critical — is the owner OK CoR-ing `claim_document_processing_task`?
2. **Corroboration of geometry-less facts.** Should a MyInvois total (no polygon) be Tier-A eligible?
   Options: relax `_invoice_fact_state`'s `v_poly_ok` for a structured-source `engine_id`; add a
   `locator_kind` (e.g. `xml_xpath`) and teach the reader; or accept "facts stored, not auto-
   corroborated." This is the sharpest accounting-correctness decision.
3. **AP vs AR direction.** `invoice_facts` + `_invoice_fact_state` + `persist_invoice_facts`'s
   `amount_exception` rotation are built for **supplier_bill (AP)** and force `document_kind='invoice'`
   / `coding_kind='supplier_bill'` (`0013:147,160`). A MyInvois **sales** invoice (firm's own AR) needs
   a different coding kind and posting path — is the XML engine AP-inbound, AR-outbound, or both, and
   does the semantic-facts writer need an AR variant?
4. **PRD Track-C scope.** PRD LAW currently scopes inbound UBL-XML parse as "contract + schema-
   readiness only" (`PRD.md:93,183`). Wave A2 makes it real — confirm the owner is intentionally
   promoting Track C, and whether the standing-rules/auto-POST piece rides on it.
5. **UBL flavor + validation.** MyInvois documents come as UBL 2.1 Invoice XML (and JSON). Which does
   Wave A2 accept — XML only, or JSON too (JSON would need a new detect/scan branch;
   `detectDocument` has no JSON path today)? Does `assertNoEntities`/`validatePlainXml`
   (`scan.mjs:35-55`) pass real MyInvois samples (no DOCTYPE/ENTITY, strict UTF-8)? Is signature/
   validation-status verification in scope, or is the uploaded file taken at face value?
6. **`pages:0` for XML.** `detectDocument` returns `pages:0` for XML (`scan.mjs:204`); the ingest
   budget uses `greatest(page_count,1)` (`0014:229`). Confirm page-metering intent for a page-less
   structured document.
7. **Standing rules / bounded auto-POST.** Not covered by this lane — where does the auto-POST
   authority (allowlist, per-rule caps) bind relative to the existing `autoDraft_v1` + approval floor?
   Flag for the standing-rules lane; note it must not bypass the DB-owns-numbers / write-authorization
   invariants.
