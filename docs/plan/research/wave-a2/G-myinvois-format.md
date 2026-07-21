# Lane G — MyInvois e-invoice format (grounding brief for Wave A2)

Scope: what a MyInvois validated e-invoice / structured file **is**, so Wave A2 can
add (a) a `structured_parse` engine that ingests a MyInvois XML/JSON file-upload and
(b) an AR (sales-invoice) facts vocabulary. FACTS ONLY. Official sources
(`sdk.myinvois.hasil.gov.my`, `hasil.gov.my`) accessed **2026-07-21**. Where a claim
is not directly confirmed in a source I read, it is marked **UNVERIFIED**.

---

## 0. Clara side — the as-built facts vocabulary this maps into (verified in repo)

The AP facts whitelist (the ONLY `field_path` values `persist_invoice_facts` accepts)
is enumerated in three places, all identical:

- `packages/db/migrations/0013_vendor_registration_facts.sql:112-114`
- `packages/db/migrations/0011_daily_loop.sql:199-200`
- `packages/db/migrations/0009_coding_floor.sql:2069-2070`

Whitelist (8 keys): `invoice.total`, `invoice.amount_due`, `invoice.currency`,
`invoice.vendor_name`, `invoice.vendor_registration`, `invoice.invoice_id`,
`invoice.invoice_date`, `invoice.deposit`.

- **Monetary keys** (`invoice.total`, `invoice.amount_due`, `invoice.deposit`) are the
  only ones normalized to cents by `clara._normalize_invoice_cents(...)` inside
  `persist_invoice_facts` (0013 SQL:128-136). The DB owns the cents conversion — the
  parser emits `value_raw` RAW (see `invoiceFacts.v1.azure.mjs:317`, `:169-177`).
  **Cardinal invariant: the agent/parser never computes a number.**
- Each fact row = `{field_path, value_raw, page, polygon, confidence}` (mapper
  `normalizeAzureInvoice`, `invoiceFacts.v1.azure.mjs:305-385`; persisted into
  `clara.document_regions`, 0013 SQL:130-137). `page`/`polygon` are **mandatory** and
  validated (0013 SQL:104-106) — a structured XML has no polygon, so Wave A2 must
  decide what geometry a non-visual source carries (empty `[]` is the honest marker,
  the same convention the mapper already uses for missing regions, `azure.mjs:143-148`).
- `invoice.vendor_registration` is **non-monetary identity** added in Wave A.1 for
  registration-dominant vendor resolution (0013 SQL:109-115, `azure.mjs:340-354`). It
  maps cleanly onto MyInvois supplier TIN/BRN.

**Engine model (verified):** `document_extractions.engine_kind` is a CHECK constrained
to `('ocr','structured_parse','invoice_facts')` (slice5 `engine_kind ('ocr'|
'structured_parse')`, extended to `'invoice_facts'` in slice6 — `slice6-migration-
0009-design.md:19`, `slice5-migration-0007-design.md:129-130`). A `structured_parse`
lane **already exists** in the pipeline design (`slice5-document-pipeline-
contract.md:235`: "lane structured_parse → §4.3 parser in a worker thread → same
persist path"). **AB-3** is a hard pre-MyInvois gate: the matcher read is pinned to
`engine_kind in ('ocr','structured_parse')` (`slice6-as-built-amendments.md:32`,
`wave-a-migration-0011-design.md:14`) — the first statement block of migration 0011
(`wave-a-as-built-amendments.md:254`). A MyInvois parse therefore slots in as a
`structured_parse` (or a new `invoice_facts`-class) engine on the **existing** persist
path — no new number-owning code.

---

## 1. Formats a receiver/taxpayer can obtain

- **UBL 2.1**, in **both XML and JSON** (the supplier's system transforms into either;
  Submit Documents API accepts both). [SDK Invoice v1.1]
- **Versions:** `1.0` and `1.1` (both live). **Only difference: v1.1 has digital-
  signature validation ENABLED; v1.0 does not.** v1.0 is slated for deprecation in
  favour of v1.1. A newer **v1.2 (SVDP)** also exists. [SDK Invoice v1.1 / SDK-1.0-Release]
- **Version is on the wire:** `cbc:InvoiceTypeCode/@listVersionID` (e.g. `"1.1"`).
- **Digital signature (v1.1):** enveloped **XAdES** signature. Lives in
  `UBLExtensions/UBLExtension/ExtensionContent/UBLDocumentSignatures/
  SignatureInformation` plus a `cac:Signature` reference block. Signing uses
  **xml-c14n11 canonicalization + SHA-256**; the signing cert must be valid at
  submission time. [SDK Signature / Signature-Creation]

### The validated-document envelope (what wraps the taxpayer's XML/JSON)

From **Get Document Details** [SDK einvoicingapi/08]. Metadata fields:
`uuid`, `submissionUid`, `longId`, `internalId`, `typeName` (e.g. `"invoice"`),
`typeVersionName` (e.g. `"1.0"`), `issuerTin`, `issuerName`, `receiverId` (opt),
`receiverName` (opt), `dateTimeIssued`, `dateTimeReceived`, `dateTimeValidated`,
`status` ∈ {`Submitted`,`Valid`,`Invalid`,`Cancelled`}, `documentStatusReason`,
`cancelDateTime`, `rejectRequestDateTime`, `createdByUserId`, plus summary money
(`totalExcludingTax`, `totalDiscount`, `totalNetAmount`, `totalPayableAmount`, MYR).
`validationResults = { status, validationSteps:[{ name, status, error? }] }`.

- **QR / visual representation:** the validation link is
  `{envbaseurl}/{uuid}/share/{longId}`; the QR on the visual-representation PDF encodes
  that link. `longId` is the anonymous-lookup token (valid documents only). [SDK 08 / 11]
- **Authority validation status (`Valid`) is only knowable via the longId link or the
  API — it is NOT inside the taxpayer's XML/JSON body.**

---

## 2. Mandatory + common fields (UBL v1.1) — [SDK Invoice v1.1, accessed 2026-07-21]

Header: `InvoiceTypeCode` (+`@listVersionID`), `cbc:ID` (invoice number, ≤50),
`IssueDate`+`IssueTime` (**UTC**), `cac:Signature`, `DocumentCurrencyCode`,
`TaxCurrencyCode` (opt), `TaxExchangeRate/CalculationRate` (**conditional — required if
non-MYR**), optional `InvoicePeriod` (billing frequency/start/end).

**Supplier** (`cac:AccountingSupplierParty/cac:Party`): `RegistrationName`;
`PartyIdentification/ID[@schemeID='TIN']` (14 chars); `[@schemeID='BRN'|'NRIC'|
'PASSPORT'|'ARMY']`; `[@schemeID='SST']` (conditional, ≤35); `[@schemeID='TTX']`
(tourism tax, conditional); `IndustryClassificationCode` = **MSIC** 5-digit
(+`@name`=activity); `Contact/Telephone` (E.164, mandatory); `Contact/ElectronicMail`
(opt); `PostalAddress` (AddressLine 0 mandatory, 1-2 opt; PostalZone opt; CityName
mandatory; `CountrySubentityCode`=state; `Country/IdentificationCode` ISO-3166-1).

**Buyer** (`cac:AccountingCustomerParty/cac:Party`): same shape — `RegistrationName`,
TIN, BRN/NRIC/Passport, SST (conditional; `"NA"` if none), Telephone (`"NA"` for
consolidated), address. Optional **Delivery/DeliveryParty** shipping recipient.

**Line items** (`cac:InvoiceLine`, repeatable, mandatory):
`Item/CommodityClassification/ItemClassificationCode[@listID='CLASS']` (3-digit
classification, repeatable); `Item/Description`; `Price/PriceAmount` (unit price);
per-line `TaxTotal/TaxSubtotal/TaxCategory/ID` (**tax type code**),
`TaxSubtotal/Percent` (rate %) OR `PerUnitAmount`+`BaseUnitMeasure` (fixed-rate),
`TaxTotal/TaxAmount` (line tax), `TaxCategory/TaxExemptionReason` +
`TaxSubtotal/TaxableAmount` (**conditional — if exemption**),
`ItemPriceExtension/Amount` (line subtotal excl tax), `LineExtensionAmount` (line total
excl tax after discount), `InvoicedQuantity`(+`@unitCode` UN/ECE Rec20),
`AllowanceCharge` (discount/charge, `ChargeIndicator` false/true, MultiplierFactor or
Amount), optional `ItemClassificationCode[@listID='PTC']` (HS tariff),
`OriginCountry`.

**Invoice totals** (`cac:LegalMonetaryTotal`): `LineExtensionAmount` (total net),
`AllowanceTotalAmount` (total discount), `ChargeTotalAmount` (total charges),
`TaxExclusiveAmount` (**mandatory**, excl tax), `TaxInclusiveAmount` (**mandatory**,
incl tax), `PayableAmount` (**mandatory**, after rounding − prepayment),
`PayableRoundingAmount` (rounding, opt), `PrepaidAmount` (opt, at total level).

**Tax summary** (`cac:TaxTotal`): `TaxAmount` (**mandatory**, total tax);
per-type `TaxSubtotal{TaxableAmount, TaxAmount, TaxCategory/ID, TaxExemptionReason?}`.

**Payment / prepayment:** `PaymentMeans/PaymentMeansCode`,
`PayeeFinancialAccount/ID`, `PaymentTerms/Note`;
`PrepaidPayment/{PaidAmount, PaidDate, PaidTime, ID}`;
`BillingReference/AdditionalDocumentReference/ID` (**used by credit/debit notes to cite
the original invoice**). Plus customs (K1/K2/Incoterms/FTA) blocks — out of AR scope.

### Code tables (verbatim, accessed 2026-07-21)

**e-Invoice types** [SDK codes/e-invoice-types]: `01` Invoice · `02` Credit Note ·
`03` Debit Note · `04` Refund Note · `11` Self-billed Invoice · `12` Self-billed Credit
Note · `13` Self-billed Debit Note · `14` Self-billed Refund Note.

**Tax types** [SDK codes/tax-types]: `01` Sales Tax · `02` Service Tax · `03` Tourism
Tax · `04` High-Value Goods Tax · `05` Sales Tax on Low Value Goods · `06` Not
Applicable · **`E` Tax exemption (where applicable)**.

**Classification codes** [SDK codes/classification-codes]: 3-digit product/service
category list; note **`004` = Consolidated e-Invoice** (used on consolidated line
items). Full list is a downloadable JSON on the SDK — enumerate at build time, don't
hardcode.

---

## 3. How a RECEIVER gets the XML/JSON without API integration

- **Notification-based, not push-of-file:** on IRBM validation, **both supplier and
  buyer are notified**; the buyer reviews for accuracy and may **reject within 72 hours**
  of validation via the MyInvois Portal. [IRBM e-Invoice Guideline v4.6+]
- **Portal (no ERP integration) supports:** create/submit, validation, notification,
  **sharing of e-Invoice / visual representation**, reject/cancel, storage, reporting.
  A buyer logged into the MyInvois Portal can view invoices where they are the receiver
  and obtain the **visual-representation PDF (with QR)**. **UNVERIFIED** whether the
  Portal offers the buyer a one-click **raw XML/JSON** download for a *supplier-issued*
  invoice — the SDK confirms the structured file is retrievable via the **Get Document**
  API (base64 of the original submission), and the shared/visual PDF via the portal;
  confirm the portal's raw-file download path against the MyInvois Portal User Guide
  before committing the "upload the XML" UX. → **Open question.**
- **Practical Wave A2 input path:** the taxpayer (Clara's client, as *supplier*) owns
  their own outbound XML/JSON from their issuing tool; and as *buyer* they hold at least
  the visual PDF + validation link. So the realistic file-upload input is **(a)** the
  client's own issued XML/JSON (AR side) and **(b)** a counterparty's shared XML/JSON
  when available, else the PDF (AP side falls back to the existing Azure OCR lane).
- **Consolidated e-invoice implication (material):** for B2C where the buyer doesn't
  request an e-invoice, the supplier issues a monthly **consolidated** e-invoice with
  buyer = **General Public**, buyer TIN = **`EI00000000010`**, buyer details `"NA"`, and
  line classification **`004`**. [IRBM Specific Guideline v4.8 / MyInvois Portal FAQ]
  → a consolidated e-invoice is **not a per-buyer claimable document**; a specific buyer
  will not find "their" validated e-invoice. Parser must detect the General TIN /
  `004` and treat it as non-attributable to a specific customer (AR: it's the client's
  own aggregate; AP: it is NOT a substantiating bill for the buyer).

---

## 4. Validation depth an OFFLINE parser can honestly do

| Check | Offline feasible? | Notes |
|---|---|---|
| Schema / structure (UBL 2.1 element presence, cardinality, code-list membership) | **Yes** | Validate against the type codes / tax types / classification lists; reject unknown `InvoiceTypeCode`. |
| Arithmetic tie | **Yes, and should be enforced** | Σ line `LineExtensionAmount` → `TaxExclusiveAmount`; `TaxExclusiveAmount` + `TaxTotal/TaxAmount` → `TaxInclusiveAmount`; `TaxInclusiveAmount` + `PayableRoundingAmount` − prepaid = `PayableAmount`. This is Clara's corroboration analogue — but **the DB owns the number**: emit RAW facts and let a DB tie-check corroborate (mirror the AP `_invoice_fact_state` corroboration in 0011). |
| Digital signature (cryptographic) | **Technically yes** (XAdES/SHA-256/c14n11 is standard) **but** needs the signing cert + LHDN trust anchor; **low priority** | Verifying the signature proves the bytes are intact/signed, NOT that IRBM validated it. |
| Document is genuinely **Valid** at IRBM (status/authority) | **No — needs API/portal** | `status=Valid`, `dateTimeValidated`, `uuid`/`longId` authenticity are envelope/API facts, absent from the body. **Out of scope this wave — note it.** |
| UUID ↔ portal verification (longId link resolves) | **No — needs network** | Out of scope this wave. |

**Honest posture for Wave A2:** an offline parse can assert *structure + arithmetic +
(optionally) signature-structure-present*; it must NOT claim IRBM-validated. If the
uploaded file is a *validated* export that carries the envelope metadata (uuid/longId/
dateTimeValidated), record those as **provenance facts** but flag them **unverified-
authority** until an API/portal check exists.

---

## 5. SST representation (feeds the open SST-split decision)

- Tax is **per-line and per-type**, repeatable. A line can carry Sales Tax (`01`) and/or
  Service Tax (`02`); a header `TaxTotal` rolls them up per `TaxCategory/ID`.
- **Exemption:** `TaxCategory/ID = 'E'` with a mandatory `TaxExemptionReason` and the
  exempted (taxable) amount recorded, tax amount `0`. **Not-applicable** = `06`.
- **Design consequence:** MyInvois already splits net / tax / gross explicitly
  (`TaxExclusiveAmount` / `TaxTotal` / `TaxInclusiveAmount`) and per tax type. Clara's AP
  facts today carry only `invoice.total` (gross) — no tax split. AR from MyInvois **can
  and should** carry the split as first-class facts (new `invoice.tax_*` keys below),
  because the source hands it structured. This is the evidence the SST-split decision
  needs: the split is free from the file, so the only question is whether the *ledger*
  posts an SST-payable line (a COA/booking decision), not whether the fact is available.

---

## 6. Proposed mapping — MyInvois field → Clara `invoice.*` facts

**EXISTING keys** (reuse; whitelist already accepts them):

| MyInvois (UBL path) | Clara `field_path` | Notes |
|---|---|---|
| `cbc:ID` | `invoice.invoice_id` | invoice number (≤50). |
| `cbc:IssueDate` | `invoice.invoice_date` | UTC → normalize to date (DB parses `^\d{4}-\d{2}-\d{2}$`, 0013 SQL:138). |
| `DocumentCurrencyCode` | `invoice.currency` | MYR-only ledger; non-MYR lets the coding tool refuse (mirror `azure.mjs:323-330`). |
| `LegalMonetaryTotal/TaxInclusiveAmount` | `invoice.total` | gross. **Monetary → cents in DB.** |
| `LegalMonetaryTotal/PayableAmount` | `invoice.amount_due` | after rounding − prepaid. **Monetary.** |
| `PrepaidPayment/PaidAmount` (or `PrepaidAmount`) | `invoice.deposit` | **Monetary**; non-zero blocks Tier-A corroboration (existing AP rule). |
| Supplier `RegistrationName` | `invoice.vendor_name` | **AP direction only** (supplier = vendor). See direction note. |
| Supplier `PartyIdentification/ID[TIN or BRN]` | `invoice.vendor_registration` | non-monetary identity; DB normalizer strips separators. |

**NEW keys AR needs** (require a whitelist extension in a new migration + a mapper
version bump; each must be classified monetary vs non-monetary, matching the
`persist_invoice_facts` cents rule):

| MyInvois (UBL path) | Proposed `field_path` | Class | Why new |
|---|---|---|---|
| Buyer `RegistrationName` | `invoice.customer_name` | identity | AR: the counterparty is the *customer*, not a vendor. |
| Buyer `PartyIdentification/ID[TIN]` | `invoice.customer_tin` | identity | customer resolution / MyInvois attribution. |
| Buyer `PartyIdentification/ID[BRN\|NRIC]` | `invoice.customer_registration` | identity | mirror of vendor_registration on the buy side. |
| `cbc:InvoiceTypeCode` | `invoice.type_code` | code | `01/02/03/04/11-14` — **drives credit/debit/self-billed handling**; distinguishes what today the mapper only *infers* via `isCreditNote` (`azure.mjs:155-167`). |
| `LegalMonetaryTotal/TaxExclusiveAmount` | `invoice.total_excl_tax` | monetary | the net; enables the arithmetic tie + SST split. |
| `TaxTotal/TaxAmount` | `invoice.tax_total` | monetary | total tax. |
| `TaxSubtotal/TaxCategory/ID` (per type) | `invoice.tax_line.type` | code | `01/02/…/E`. Repeatable → needs a line/array shape (see gotcha). |
| `TaxSubtotal/Percent` | `invoice.tax_line.rate` | numeric | rate %. |
| `TaxSubtotal/TaxableAmount` | `invoice.tax_line.taxable` | monetary | base per type. |
| `TaxSubtotal/TaxAmount` | `invoice.tax_line.amount` | monetary | tax per type. |
| `TaxCategory/TaxExemptionReason` | `invoice.tax_line.exempt_reason` | text | when `ID='E'`. |
| Envelope `uuid` / `longId` / `dateTimeValidated` / `status` | `invoice.myinvois_uuid` / `.myinvois_longid` / `.validated_at` / `.myinvois_status` | provenance | only when an upload carries the validated envelope; flag authority-unverified (§4). |
| `IssueTime` | `invoice.issue_time` | time | UTC time-of-day (AP has date only). |

> **Direction is the crux:** for AR the **supplier IS Clara's client** (the seller); the
> vendor/customer roles flip vs AP. Do **not** overload `invoice.vendor_*` for the AR
> customer — add `invoice.customer_*`. A single mapper that reads "supplier" always into
> `vendor_name` would mislabel every AR document. Recommend the parse carry an explicit
> `invoice.direction` (or the engine kind) so the coding lane knows whether the *buyer*
> or *supplier* party is the counterparty. → **Open question.**

> **Tax lines are repeatable** but the current facts row model is flat
> (`{field_path,value_raw,page,polygon,confidence}` → one `document_regions` row).
> Either (a) index the path (`invoice.tax_line[0].type`) or (b) persist tax lines to a
> child table. This is a schema-shape decision, not a whitelist tweak. → **Open question.**

---

## 7. Parser gotchas

1. **MyInvois JSON is NOT plain JSON** — it is the UBL→JSON binding: element text is
   wrapped as an array of objects, e.g. `"ID":[{"_":"INV123"}]`, and attributes become
   sibling keys (`"InvoiceTypeCode":[{"_":"01","listVersionID":"1.1"}]`). Amounts appear
   as `[{"_":"100.00","currencyID":"MYR"}]`. **Do not assume `obj.ID === "INV123"`.**
   **UNVERIFIED against a specific sample file** — confirm shape against
   `sdk.myinvois.hasil.gov.my/files/sdksamples/1.1-Invoice-MultiLineItem-Sample.txt`
   before writing extractors. (XML with `cac:`/`cbc:` namespace prefixes is the safer
   canonical form to parse.)
2. **Namespaces mandatory** in XML (`cbc:` = CommonBasicComponents, `cac:` =
   CommonAggregateComponents, plus `ext:` UBLExtensions). Use a namespace-aware parser.
3. **`currencyID` per amount** — every monetary element carries its own `@currencyID`.
   Reject/flag a doc whose amounts mix currencies or aren't MYR (ledger is MYR-only).
4. **UTC times** — `IssueDate`/`IssueTime` are UTC; convert to MYT (UTC+8) if a local
   `financial_date` is derived, or the date can slip a day near midnight.
5. **Signature block bloats the file** and must be stripped before any content hash you
   compute (the XAdES flow itself removes `UBLExtensions`+`Signature` before c14n).
6. **Credit/Debit notes (`02`/`03`, and self-billed `12`/`13`) reference the original**
   via `BillingReference` and lawfully do not increase AP payable — Clara already refuses
   to corroborate a credit note (`azure.mjs:155-167`, envelope
   `corroboration_ineligible='credit_note'`). For AR/MyInvois use the **explicit
   `InvoiceTypeCode`** instead of inference.
7. **Self-billed (`11-14`)**: the BUYER issued the doc on the supplier's behalf — party
   roles and who-is-the-counterparty differ from a standard invoice; handle before
   vendor/customer resolution.
8. **Consolidated detection** (§3): General TIN `EI00000000010` / classification `004` /
   buyer `"General Public"` → treat as non-attributable; never resolve to a specific
   counterparty.
9. **Rounding line** `PayableRoundingAmount` can be negative; include it in the tie or
   the arithmetic check fails on rounded totals.
10. **`page`/`polygon` are mandatory in `persist_invoice_facts`** (0013 SQL:104-106) but
    a structured XML has no geometry. Emit `page:1, polygon:[]` (the existing
    empty-polygon honest-marker convention, `azure.mjs:143-148`) — but verify the DB
    accepts an empty polygon for a `structured_parse` source and that Tier-A logic
    treats an XML-sourced total correctly (the AP rule refuses to corroborate an
    empty-polygon total — see `azure.mjs:138-142`; a *structured* source may warrant a
    different corroboration rule since the number is authoritative, not OCR-guessed).
11. **Value fidelity:** emit `value_raw` byte-for-byte (mapper convention); let the DB do
    cents. Never pre-round or reformat amounts in the parser.

---

## Open questions for design

1. **Raw-file availability for a *received* (supplier-issued) invoice:** does the
   MyInvois Portal let a buyer download the raw XML/JSON without API integration, or only
   the visual PDF + validation link? (Determines whether AP can ever ingest structured
   MyInvois, or only AR from the client's own issued files.) — **UNVERIFIED**, confirm
   against the MyInvois Portal User Guide.
2. **Direction / roles:** add an explicit `invoice.direction` fact (or distinct engine
   kinds) so the flipped supplier/customer roles between AR and AP are unambiguous? How
   does the coding lane pick the counterparty party from a MyInvois doc?
3. **Tax-line shape:** flat indexed field_paths vs a child table for repeatable
   `TaxSubtotal` lines — and does Clara's ledger post an explicit SST-payable/receivable
   line (the SST-split decision), or keep gross-only and store the split as facts?
4. **Corroboration semantics for a structured source:** a MyInvois total is authoritative
   (not an OCR guess) and has no polygon. Should a `structured_parse`/MyInvois total
   reach Tier-A/auto-POST directly (bounded standing rule) when arithmetic ties and the
   customer resolves — bypassing the polygon-corroboration rule the Azure lane needs?
5. **Egress class of the new engine:** a MyInvois XML parse is deterministic and fully
   offline (no cross-border OCR egress, no per-page billing) — should it be a
   facts-class **egress-exempt** engine under `engine_kind='structured_parse'` (distinct
   from the billable Azure OCR path), and does that clear the AB-3 pre-MyInvois gate?
6. **Authority-verification deferral:** confirm it is acceptable this wave to accept an
   uploaded MyInvois file on structure+arithmetic alone, recording envelope status as
   *unverified-authority* until a future API/portal check — and what UI/flag makes that
   honest to the user.
7. **New-whitelist migration + mapper version:** the AR keys (§6) need a new migration
   extending the `persist_invoice_facts` whitelist (as 0013 did for
   `vendor_registration`) and a bumped `NORMALIZATION_VERSION`/engine snapshot. Which
   keys are in-scope for the first AR slice vs deferred?

---

## Sources (accessed 2026-07-21)

- SDK — Invoice v1.1: https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
- SDK — Invoice v1.0: https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-0/
- SDK — e-Invoice Types: https://sdk.myinvois.hasil.gov.my/codes/e-invoice-types/
- SDK — Tax Types: https://sdk.myinvois.hasil.gov.my/codes/tax-types/
- SDK — Classification Codes: https://sdk.myinvois.hasil.gov.my/codes/classification-codes/
- SDK — Get Document Details: https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/
- SDK — Get Document: https://sdk.myinvois.hasil.gov.my/einvoicingapi/07-get-document/
- SDK — Taxpayer's QR Code: https://sdk.myinvois.hasil.gov.my/einvoicingapi/11-qr-code/
- SDK — Signature / Signature Creation: https://sdk.myinvois.hasil.gov.my/signature/ ·
  https://sdk.myinvois.hasil.gov.my/signature-creation/
- SDK — Submit Documents: https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents/
- SDK — Consolidated sample XML: https://sdk.myinvois.hasil.gov.my/files/sdksamples/1.1-Invoice-Consolidated-Sample.xml
- IRBM e-Invoice Guideline (v4.6/4.7): https://www.hasil.gov.my/media/fzagbaj2/irbm-e-invoice-guideline.pdf ·
  https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf
- IRBM e-Invoice Specific Guideline (v4.8): https://www.hasil.gov.my/media/uwwehxwq/irbm-e-invoice-specific-guideline.pdf
- MyInvois Portal FAQs: https://www.hasil.gov.my/media/ccwb1hnj/myinvois-portal-faqs.pdf
- MyInvois Portal User Guide: https://myinvois.hasil.gov.my/content

*Note: several MyInvois SDK/portal pages are JS-rendered; field lists above were
extracted via WebFetch's markdown conversion. The full canonical field/cardinality/
code-list truth is the downloadable JSON/XSD sample set on the SDK — enumerate those at
build time rather than trusting this brief's transcription for wire-level exactness.*
