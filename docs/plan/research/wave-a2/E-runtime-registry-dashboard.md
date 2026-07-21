# Lane E brief — runtime registry/mappers + dashboard surfaces (Wave A2 grounding)

FACTS ONLY. Verified against HEAD (`main`, migrations 0001–0014). Line refs are 1-indexed.
"UNVERIFIED" marks anything I did not confirm in source.

Wave A2 scope (from the task): add the **sales-invoice/AR side + MyInvois XML file-upload
as a `structured_parse` engine + standing rules (bounded auto-POST)**. This brief maps
what already exists that A2 must reuse or extend, and the exact insertion points.

---

## 1. Workflow registry — exact exports, versions, freeze law, consumers

**`packages/runtime/workflows/registry.ts`** (the single newest-version map):
```
workflows = {
  closeExample:   closeExampleV1        (closeExample.v1.ts)
  chatTurn:       chatTurn_v3           (chatTurn.v3.ts)      // v1→v2→v3 repoints, see below
  documentIngest: documentIngest_v1     (documentIngest.v1.ts)
  invoiceFacts:   invoiceFacts_v1       (invoiceFacts.v1.ts)
  autoDraft:      autoDraft_v1          (autoDraft.v1.ts)
}
```
- registry.ts:32-33 also **re-exports `chatTurn_v1` + `chatTurn_v2`** (frozen bodies kept
  reachable so parked runs of old versions are never stranded — policy (c)). `workflows.chatTurn`
  points at v3 (registry.ts:19). Names confirmed exactly as the task listed; **`autoDraft_v1`**
  input is `{ taskId }` (camel), while `documentIngest_v1`/`invoiceFacts_v1` take `{ task_id }` (snake).

**Enqueue sites (all resolve through the `workflows` object — freeze-lint provenance law):**
| Workflow | Started at | Trigger |
|---|---|---|
| `documentIngest` | `intakeRoutes.ts:125` (finalize), `startWorld.ts:110,122` (leader reconcile + intake recovery) | every intake finalize; lane routed later |
| `chatTurn` | `chatRoutes.ts:146`, `startWorld.ts:109` | chat turn admit |
| `invoiceFacts` | `startWorld.ts:115` | **lane-aware reconciler**: an `invoice_facts` document task routes here; every other lane routes to `documentIngest` (startWorld.ts:111-115) |
| `autoDraft` | `startWorld.ts:118` (reconcile) + `startWorld.ts:144` (dedicated **autodraft consumer loop**, `startAutodraftLoop`) | sweep admission: resolves invoice_facts events→filings, admits sweep tasks (startWorld.ts:139-148) |

**Freeze-lint law** (`scripts/check-frozen-workflows.mjs`, enforces ARCHITECTURE Appendix A):
- Every file containing the `"use workflow"` directive prologue MUST carry a `@frozen` marker AND be
  registered in `frozen-workflows.json` (check-frozen-workflows.mjs:327-344). Freezing is mandatory, not opt-in (H2).
- A frozen file's sha256 (LF-normalized) is immutable **append-only vs `origin/main`** — a changed
  hash, a moved/renamed/removed entry is a hard REJECT (:401-416). This is THE real gate (branch
  protection is free-tier-unenforced).
- The **transitive relative-import closure** of each frozen workflow is also frozen (:266-283). So a
  frozen workflow's imported `.impl`/`.behavior.mjs`/`.prompt`/`.tools` are hash-locked too.
- **IMPORT-ESCAPE** (:379-399): a frozen file may only reach first-party code via **relative** imports;
  a workspace-package/path-alias specifier is rejected (its body would escape the closure).
- **Registry monotonicity** (:436-444): a class may only keep or INCREASE its version; removing/downgrading
  a class is REJECT.
- **Enqueue-site provenance** (:446-458): every WDK `start()` in `packages/runtime` (tests + registry
  excluded) must be handed a workflow ref imported from the registry.
- `pnpm freeze:update` = `node scripts/check-frozen-workflows.mjs --update` — re-baselines the manifest
  (frozen files + their import closure). **REFUSED under CI** (:298-306); only for ADDING a brand-new
  frozen workflow locally. You can never mutate/remove an existing entry via `--update`.

**A2 implication:** a MyInvois-XML behavioural change to an *existing* frozen body is forbidden — it must
ship as a **new frozen `_vN` workflow** OR live in **non-frozen injected infrastructure** (the lib/services
lane — see §3). The mappers (`invoiceFacts.v1.azure.mjs`, `lib/structured*.mjs`, `lib/intake.mjs`) are
**NOT frozen** — they are injected via `globalThis`, so vendor/parser tuning is not a version bump (the
AB-16 precedent, invoiceFacts.v1.azure.mjs:1-6).

---

## 2. Azure invoice mapper v4 (`invoiceFacts.v1.azure.mjs`) — vocabulary + what SALES invoices drop

**Engine snapshot** (pinned, exported at :15-19):
`AZURE_INVOICE_ENGINE_SNAPSHOT = { engineId: "azure-di:prebuilt-invoice:2024-11-30",
engineConfig: {provider, model:"prebuilt-invoice", api_version:"2024-11-30", region:"southeast-asia"}, versionN:1 }`.
`NORMALIZATION_VERSION = "clara-invoice-norm:v4"` (:35) — hashed with the raw payload for model-drift honesty.

**Azure adapter** (`analyzeInvoiceReal`, :74-136):
- Endpoint from `AZURE_DI_ENDPOINT` + `AZURE_DI_KEY` env; URL `…/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30&features=keyValuePairs` (:90). **keyValuePairs ENABLED** (v4, free add-on).
- One absolute `totalDeadlineMs=120_000` deadline covers submission + every 429 wait + polling; a
  `Retry-After` can never extend past it (:78, :101-105, :111-128). 429-surviving discipline.
- Errors map to `DocumentEngineError` codes `timeout|engine_error|bad_type` (:106-107, :129-132).

**Normalization pipeline** (`normalizeAzureInvoice`, :305-385) → `persist_invoice_facts` field rows
`[{field_path, value_raw, page, polygon, confidence}]`:
- `FIELD_MAP` (:171-177): `InvoiceTotal→invoice.total`, `AmountDue→invoice.amount_due`,
  `InvoiceId→invoice.invoice_id`, `InvoiceDate→invoice.invoice_date`, `VendorName→invoice.vendor_name`.
- `invoice.currency` from `InvoiceTotal.valueCurrency.currencyCode` (:325-330).
- `invoice.deposit` from `Deposit|Deposits|DepositAmount` (:181, :331-338) — blocks Tier-A corroboration.
- **`invoice.vendor_registration`** from typed `VendorTaxId` (:347-354), gated by `looksLikeRegistration`
  (:231-238: 3–40 chars, ≥3 alnum, not a currency/ISO-date). Non-monetary → never corroborates; feeds
  registration-dominant vendor resolution (AB-16 / 0013).
- **invoice_id recovery** (:356-373, WA §11): only when the typed `InvoiceId` is absent/empty — `recoverInvoiceId`
  tries `recoverFromKeyValuePairs` (:249-264) then `recoverFromContent` label-scan (:269-288). Label vocab
  `INVOICE_ID_LABEL` (:208-209: invoice/bill/invois anchors, EXCLUDES po/ref/account). `looksLikeInvoiceNumber` (:214-222).
- Geometry: `firstRegion` (:143-148) emits an **empty polygon** when Azure returns no boundingRegion — the honest
  "no physical region" marker (the DB refuses to promote a geometry-less total to Tier A).
- Envelope: `corroboration_ineligible = multi_document | credit_note` (:375-378, via `isCreditNote` :155-167).
- `analyzeInvoice` test hook: `RELAY_TEST_MODE=1` uses `globalThis.__claraAzureInvoiceForTest` (:388-395).

**What a SALES invoice through Azure prebuilt-invoice yields — and what the mapper DROPS:**
prebuilt-invoice returns buyer-side fields `CustomerName`, `CustomerId`, `CustomerTaxId`,
`CustomerAddress`, `BillingAddress`, `ShippingAddress`, plus `Items[]`, `SubTotal`, `TotalTax`,
`DueDate`, `PurchaseOrder`, `PaymentTerm` (Azure DI prebuilt-invoice schema — general knowledge; the
exact per-field recall on MY layouts is UNVERIFIED here). **The current `FIELD_MAP` (:171-177) maps NONE
of the customer-side or line-item fields** — `CustomerName/CustomerTaxId/…` and `Items[]` are silently
dropped. For AR/sales, the mapper (or a sales-specific mapper) must add customer identity + (if needed)
line items. The `persist_invoice_facts` whitelist would also have to gain those field_paths (see §3).
The vendor-vs-customer polarity is **not represented** anywhere in the facts vocabulary today.

---

## 3. Where a MyInvois-XML mapper slots — the structured_parse precedent

**KEY FINDING: a `structured_parse` engine lane already exists and is NOT frozen.** MyInvois XML slots as
a new format branch in that lane, OR as a new injected engine — no new frozen workflow is strictly required
for the parse itself.

**Lane routing lives in `lib/intake.mjs:153-159` (`laneSnapshot(format)`) — the exact insertion point:**
```
xlsx|docx|csv|tsv → lane "structured_parse", STRUCTURED_ENGINE_SNAPSHOT (clara-structured:v1)
xml               → lane "none",             STORE_ONLY_ENGINE_SNAPSHOT  (clara-store-only:v1)   ← TODAY: XML is STORE-ONLY
else              → lane "ocr",              AZURE_ENGINE_SNAPSHOT
```
So **today a `.xml` upload is stored and never parsed** (lane "none"). Wave A2 flips XML from store-only to a
parsed lane. `xml` MIME is already on the intake allowlist (`MIME_ALIASES`, intake.mjs:48-49:
`application/xml`, `text/xml→application/xml`). `detectDocument` (`lib/scan.mjs`) sets `format`; UNVERIFIED
exactly how it labels xml (grep `format==="xml"` in scan.mjs before wiring).

**The structured_parse engine** (`lib/structured.mjs` + `lib/structured-worker.mjs`, both NON-frozen,
injected via `makeDocumentServices().parseStructured`, intake.mjs:481-493 → consumed at
documentIngest.behavior.mjs:46-48):
- Runs in a **memory-capped `worker_thread`, global concurrency 1** (structured.mjs:5-28).
- `structured-worker.mjs:111` dispatches by `format`: `xlsx | docx | else→csv`. **A MyInvois XML branch is a
  new arm here** (e.g. `format === "myinvois_xml"` / `"ubl"`).
- Each parser returns `{ pageCount, envelope:{ schema_version, engine:{id, kind:"structured_parse", version_n},
  … }, regions:[{locator_kind, locator, field_path, text_content, engine_confidence, monetary_raw,
  monetary_cents}] }` (structured-worker.mjs:52,88,91,106). Regions are persisted via
  `clara.persist_document_extraction(...)` (documentIngest.behavior.mjs:49-62).
- **Note:** the structured path writes `engine_kind='structured_parse'` regions with **`monetary_cents:null`**
  everywhere — it does NOT corroborate amounts. MyInvois totals are authoritative XML numbers, so A2 must
  decide whether the XML lane emits monetary_cents (and whether that constitutes Tier-A corroboration).

**Engine-snapshot convention (S6-D1 "second engine" precedent):** three snapshots already coexist as frozen
`Object.freeze` constants: `STRUCTURED_ENGINE_SNAPSHOT`/`STORE_ONLY_ENGINE_SNAPSHOT` (intake.mjs:29-39),
`AZURE_ENGINE_SNAPSHOT` (from `lib/egress.mjs`, the OCR lane), and `AZURE_INVOICE_ENGINE_SNAPSHOT`
(invoiceFacts.v1.azure.mjs:15-19, the SECOND engine over the same bytes). A MyInvois engine adds a **fourth**
snapshot `{ engineId:"clara-myinvois:v1"|"ubl-2.1:…", engineConfig:{…}, versionN:1 }` following this shape.

**The HARD pre-MyInvois AB-3 engine_kind gate (the standing gate CLAUDE.md flags):**
- `document_extractions.engine_kind` CHECK was **widened to `('ocr','structured_parse','invoice_facts')`** at
  `0009_coding_floor.sql:791-794` (`ck_document_extractions_engine_kind_0009`). Original was `('ocr','structured_parse')` (0007:188).
- `0011_daily_loop.sql:4185-4189` asserts `clara.record_rule_resolution(uuid,text)` source **still contains
  the literal predicate `engine_kind in ('ocr','structured_parse')`** — an AB-3 adjacency guard: standing-rule
  identifier matching (tin/ssm/account CTE) reads ONLY ocr/structured_parse regions, NEVER `invoice_facts`
  regions (so `invoice.vendor_registration` etc. can't collide with the matcher, 0013:34-39). **A MyInvois
  engine_kind that carries identifiers WILL trip this gate** — adding a new engine_kind that the matcher should
  or shouldn't see requires a deliberate migration + updating this pinned predicate/assertion. This is a
  design decision A2 must resolve before touching engine_kind.

**The invoice.* facts writer is invoice_facts-lane-only:** `clara.persist_invoice_facts` requires
`t.lane='invoice_facts'` (0013:59) and whitelists exactly `invoice.total|amount_due|currency|vendor_name|
vendor_registration|invoice_id|invoice_date|deposit` (0013:112-114). `_coding_lane_core` reads facts from the
**latest done `engine_kind='invoice_facts'` extraction** (0013:253,262). So there are **two routes** for MyInvois
AR facts, a real design fork:
  (a) route XML through a new `invoice_facts`-style task/engine that emits invoice.* rows (reuses the coding
      lane) — but the vocabulary has no customer/AR fields and no vendor/customer polarity today; or
  (b) route XML through `structured_parse` regions and build a separate AR coding path off them.

---

## 4. Dashboard surfaces — reusable as-is vs extend

**Static-export constraint (Cloudflare Pages):** `next.config.mjs:9-27` — `STATIC_EXPORT=1 → output:"export"`
(`out/`), **no server code**. `/api/*` is proxied by a CF Pages Function (`functions/api/[[path]].js`), not
Next rewrites. Two data lanes, never mixed (`shared/wire.ts`): AGENT lane = Clara runtime HTTP (Bearer session
JWT / intake token); HUMAN lane = **Supabase PostgREST** (`rpc()`/`pgrestSelect()`, wire.ts:81-104) reading
governed fns as `clara_authenticated`. **AR governance writes (auto-POST, standing-rule sign/decline) must be
governed PostgREST fns called via `rpc()` — no new server route is available.** Env: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLARA_RUNTIME_URL`.

**The ClaraPart union + card catalog (`app/shared/parts.ts` + `app/chat/partCatalog.ts`):**
- `parts.ts:76-91` — canonical 14-member union (9 pre-Wave-A + 5 Wave-A: `doc_review`, `diff`, `sweep_receipt`,
  `kb_rule_proposal`, `open_question`). `app/chat/api.ts` re-exports from here (api.ts is not frozen; the runtime's
  own `ClaraPart` unions live in FROZEN `chatTurn*.prompt.ts` and converge via fixture tests, parts.ts:1-12).
- **Adding an AR part type is a two-file change with compile-time guards:** add the member to the union
  (parts.ts) AND a `PART_CATALOG` entry with fixtures (partCatalog.ts:25-116) AND a render branch in
  `TranscriptParts` (parts.tsx:162-241). The `AllCovered`/`NoExtra` type asserts (partCatalog.ts:128-133) fail
  `tsc` if a wire type is uncategorized; the parity test fails if a catalog entry has no render branch. All
  Wave-A cards are **identifier-only** and hydrate authoritative state on mount via a pinned read fn
  (parts.ts:49-52) — the pattern an AR sales-invoice-draft card must follow.

**`/queue` (batch approve) — reusable AS-IS for AR drafts, with caveats:**
- `queue/page.tsx` renders `list_review_queue` (one cross-client queue, sections `needs_review`/`needs_you`),
  counts tiles, always-on filter, client scope, keyset cursor in URL, virtualization, 5 screen states, split-view
  detail → `doc_review`, and routine-only batch approve.
- `QueueRow` shape (`shared/reviewTypes.ts:32-53`): `row_kind: "draft"|"uncoded_filing"|"open_question"|"coding_task"`,
  `lane: "ready"|"needs_review"|"needs_you"|null`, `counterparty_id`, `high_stakes`, `auto`, `rule_backed`,
  `amount_cents`, etc. **This is a producer-side (DB `list_review_queue`) contract** — an AR draft would surface
  here if the DB emits it. The mapper `toQueueRow` (:70-94) is defensive (unknown row_kind → "draft").
- **Batch approve** (`queue/model.ts:101-107` `isSelectable`): only `row_kind==="draft" && !high_stakes && entry_id`.
  `BatchApprove.tsx` calls `approve_routine_entry` (DB re-refuses high-stakes CLR05 — UI is defense-in-depth).
  **A2 "bounded auto-POST" is the DB half; the UI batch-approve already models "routine, not high-stakes".** If AR
  auto-POST introduces a new posting act, the DB approve fn + selectability predicate may need extending.
- `filterRows`/`rowMatches` (:57-77) already searches `counterparty_id` — no customer-column code change needed for
  filtering, but there is **no dedicated customer/vendor column** in the row view (grouping is client→counterparty
  by envelope order; polarity is not shown). A "customer" affordance would be a `QueueRowView` extension.

**`doc_review` evidence surface (reusable for AR document review):**
- `DocReviewCard.tsx` (split view) + `DocViewer.tsx` + `PdfPageCanvas.tsx` + `RegionOverlay` + `DerivationTable`.
- `pickDocView` (`DocViewer.tsx:28-32`, pure/tested): `image/* → image`; `pdf + hasOverlay + !pdfFailed → pdf-canvas`;
  else → inert `<object>` + `#page=N`. **XML has no visual form** — a MyInvois XML doc would fall to the `<object>`
  branch (raw XML render) or need a new "structured document" view (render the parsed fields, no bytes canvas).
- `PdfPageCanvas.tsx` lazy-loads `pdfjs-dist` via dynamic `import()` (:28), worker as a **same-origin static asset**
  (`new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`, :30 — CSP-safe, no CDN). Renders one cited page
  at scale 2; on ANY failure calls `onFail` → DocViewer degrades to `<object>` (honest degradation).
- Overlays: `regionGeometry.ts:parsePagePolygon` accepts only `locator_kind==="page_polygon"` with normalized-0..1
  points (or normalizable via width/height); anything else → null → page-jump only (:36-54). This is what the Azure
  mapper's `page_polygon` regions (persist_invoice_facts, 0013:130-137) feed. **MyInvois XML has no page geometry**
  → derivation fields would be `no_region:true` (the honest WA-L7 marker, DocReviewCard.tsx:39-42, reviewTypes.ts:185).
- Derivation (`get_doc_entry_diff` → `DocEntryDiff`, reviewTypes.ts:173-209): DB-computed doc↔entry deltas; **UI never
  sums** (DocReviewCard.tsx:98). Reusable for AR as-is if the DB emits AR diff rows.

---

## Open questions for design

1. **XML lane flip (intake.mjs:153-159):** does MyInvois `.xml` route to a NEW `myinvois`/`ubl` lane+engine, or reuse
   the existing `structured_parse` lane with a new format branch? Store-only (lane "none") is today's behaviour.
2. **engine_kind gate (0011:4185-4189 / 0013:34-39):** what `engine_kind` do MyInvois regions carry? A new kind requires
   a migration widening the CHECK AND a decision on whether the AB-3 matcher predicate `engine_kind in
   ('ocr','structured_parse')` should include it (it carries identifiers — TIN/SSM). This pinned assertion is a hard gate.
3. **AR facts vocabulary:** `persist_invoice_facts` whitelist (0013:112-114) has no customer/AR fields and no
   vendor/customer polarity. Does AR reuse `invoice_facts` (add customer.* / polarity to the whitelist + coding lane),
   or a separate AR facts writer + separate coding path? MyInvois numbers are authoritative — is that Tier-A corroboration?
4. **Sales fields the Azure mapper drops (FIELD_MAP :171-177):** if a scanned (non-XML) sales invoice ever needs
   coding, `CustomerName/CustomerTaxId/Items[]` are unmapped. In scope for A2, or XML-only for AR?
5. **New frozen workflow vs injected engine:** the parse can be non-frozen (lib/structured), but does AR need a new
   frozen workflow (an `arDraft_vN` / `salesCoding_vN`) analogous to `autoDraft_v1`, and a new sweep/consumer loop
   (startWorld.ts:143-148 pattern)? "Bounded auto-POST" implies a governed posting fn + possibly a new sweep.
6. **Auto-POST vs auto-DRAFT:** today `autoDraft_v1` only DRAFTS (never posts); batch approve is human. A2's bounded
   auto-POST is a genuinely new authority — which structural invariant (wake authority / write authorization) gates it,
   and does the UI queue's `isSelectable`/`approve_routine_entry` model extend or does a new posting path appear?
7. **XML in `doc_review`:** XML has no page geometry → `pickDocView` falls to `<object>`, overlays degrade to page-jump.
   Does AR need a new "structured document" viewer (render parsed MyInvois fields), or is raw-XML `<object>` acceptable?
8. **New ClaraPart card:** an AR sales-invoice-draft card is a union+catalog+render-branch change (parts.ts / partCatalog.ts
   / parts.tsx) plus a pinned hydrate read fn — or does AR reuse `je_review`/`doc_review` unchanged?
