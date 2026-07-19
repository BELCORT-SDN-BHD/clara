# D-1 Decision Brief — Second (semantic) vendor-extraction pass for the document-coding flow

**Question.** In the document-coding flow, should Clara add a SECOND extraction pass using a
semantic invoice model (Azure Document Intelligence `prebuilt-invoice`) to persist machine-verified
structured facts (total, date, vendor, currency, with confidence + region), **or** rely on the LLM
reading raw OCR/layout text (region citations + mandatory human approval) alone?

**One-line answer.** Conditional **YES — add the semantic pass**, but frame its value as a
*deterministic, re-checkable cross-check* (machine-total vs. proposed amount, and total vs. line-sum)
that defends against documented automation-complacency — not as a replacement for the LLM read.
Trust it only for the reliable fields; architect around Malaysia's MyInvois structured-data trajectory.

---

## 1. What leading products actually do

The near-universal industry pattern is a **dedicated structured-extraction engine + confidence scores +
validation rules + threshold-gated human review** — *not* raw OCR text handed to a general LLM.

- **Dext / Hubdoc / AutoEntry** — all use purpose-built OCR/template+ML extraction engines, not a
  general LLM over OCR text. Field-level accuracy (whole field exactly right): Dext ~82–95% (markets
  "99.9%"), AutoEntry ~73–93%, Hubdoc ~65–90%; Hubdoc/Dext are template-dependent and degrade on new
  vendors/scans. [zerentry][kynledger]
- **Ramp Bill Pay "Smart OCR"** — specialized OCR + ML + NLP; identifies vendor, references that
  vendor's history, extracts total/currency/dates/line-items as *structured fields*; claims ~99%
  field capture and learns from corrections. Coding (GL/department) is a *separate* agent step, after
  structured capture. [ramp-ocr][ramp-ai]
- **Xero (Hubdoc) / QuickBooks / Bill.com** — AI/ML document capture into structured bill/line-item
  fields, then cross-referenced against bank records / contact & ledger lists before a record is
  created; user double-checks captured fields. [xero]
- **Azure / AWS Textract / Google Document AI / Rossum / Docsumo** — all sell *semantic* invoice
  models that return typed fields (`InvoiceTotal`, `InvoiceDate`, `VendorName`, currency, tax, line
  items) with **per-field confidence** and bounding boxes. [aimultiple][ms-invoice]

**Published verification practices (consistent across vendors):**
- **Tiered confidence gates**: >95% auto-accept, 80–95% quick human check, <80% manual queue; totals
  often held to 0.95+ and line-item fields to 0.98+. [invoicedataextraction][docupipe]
- **Total = Σ line items** cross-check with ±0.01 rounding tolerance; mismatch → flag for review. [e42][logic]
- **Currency-consistency** checks; 3-way match (PO/receipt/invoice) in AP tools.
- STP realistically leaves **5–15% of clean-vendor invoices** needing human review. [invoicedataextraction]

## 2. The determinism argument (this is the crux for "the DB owns every number")

- A machine-extracted total is **deterministic, storable, re-checkable, confidence-scored, and
  region-anchored** (bounding box). It can be re-run and reconciled. An LLM read of OCR text is a
  *generative* act: benchmarks note LLMs can "extract data correctly from one invoice but fail on the
  next, nearly identical one," and can "hallucinate… inventing figures or transposing numbers."
  [invoicedataextraction-llm][unstract]
- **Human review is a weak backstop against a silent misread.** Automation-bias research: in a
  controlled study injecting biased algorithmic advice, **~60% of participants never noticed** the
  bias; the failure mode is the *omission error* — humans don't detect problems the system didn't
  flag. Accountability and lower cognitive load reduce (not eliminate) the effect. [frontiers][techtarget]
- Therefore an LLM-misread amount that reaches a human as a clean, confident number is exactly the
  case most likely to be rubber-stamped. A **second, independent deterministic total that must agree**
  converts a silent omission error into a *visible, must-resolve exception* — which is the safety
  layer the owner already values (edge-case visibility over hard constraints). The machine number's
  job is not to be the answer; it is to **disagree loudly** when the LLM/human is wrong.
- This aligns with Clara's cardinal invariant ("the agent never *computes* a figure"): the number is
  extracted by a deterministic service and stored with provenance, not produced by the model.

## 3. Cost / latency reality

- **Azure DI pricing is identical for both models: ~$10 / 1,000 pages = $0.01/page** for `prebuilt-invoice`
  AND for `prebuilt-layout` (both sit in the "prebuilt/layout" tier); Read is cheaper. There is **no
  price penalty** for choosing the invoice model over layout. [azure-pricing][ms-qa][parsli]
- Marginal cost of the second pass is therefore trivial: if Clara already runs a layout/OCR pass for
  region-cited text, adding the invoice pass is **+$0.01/page** ($10 per 1,000 bills). Note the invoice
  model *also* returns `readResults` (OCR text), so one option is to run the invoice model as the
  *primary* pass and reuse its OCR for the LLM — avoiding a separate layout call entirely.
- Latency: DI extraction is seconds (Ramp cites ~30–60s end-to-end for OCR). Async, off the chat
  critical path — not user-perceptible in a review-gated flow.
- Products generally run **one semantic model** as the capture step (not raw-OCR + separate LLM);
  Clara's proposal to *keep* the LLM read and *add* the semantic model is the more conservative,
  cross-checking posture — cheap insurance rather than duplication.

## 4. Failure modes of semantic invoice models (where NOT to trust them)

- **Reliable**: total/amount-due, invoice date, vendor name, subtotal — 95%+ out-of-the-box on clean
  docs; benchmarks note tools were "successful in finding total amounts." [aimultiple][ms-invoice]
- **Weak**: **line items** ("issues extracting pricing details"), multi-line tables, low-quality
  scans — accuracy drops sharply. Do NOT auto-trust machine line items. [aimultiple]
- **Malaysia specifics**: DI invoice model covers 27 languages; the recently added-currency list
  (BAM/BGN/ILS/THB/VND…) **did not include MYR**, and **SST is not a first-class field** (only a
  generic `TaxDetails`). So for RM/SST, treat the machine's *numeric total* as a valid cross-check but
  keep **currency label and SST breakdown as LLM/human-confirmed**. [ms-invoice][ms-currency]
- **MyInvois trajectory (decisive local context).** Malaysia's mandatory e-invoicing (Phases 1–4,
  Aug 2024 → Jan 2026; RM1m threshold; relaxation to **31 Dec 2027**) means a growing share of
  documents arrive as **validated, digitally-signed structured e-invoices with up to 55 fields**
  (TIN, SST reg, classification codes, line items) — the structured data already exists
  authoritatively and needs **no extraction at all**. The semantic-extraction problem is really the
  **shrinking-but-real tail**: receipts, petty cash, foreign bills, and sub-threshold suppliers during
  the long relaxation window. [cleartax][malaysia4u]

---

## Option A — add the semantic invoice pass (steelman)

- Persists deterministic, confidence-scored, region-anchored total/date/vendor/currency → a stored
  fact the DB owns and can re-check, matching Clara's cardinal invariant.
- Enables a hard reconciliation gate (machine-total vs. LLM/human-proposed amount; total vs. Σ lines)
  that catches the exact silent-misread failure mode human review demonstrably misses (~60% miss rate).
- Near-zero cost ($0.01/page), off critical path, and it's what every serious AP product does.
- Downside: added component/coupling to a vendor model; must resist over-trusting its line items and
  its weak MYR/SST handling; some documents (MyInvois) make it redundant.

## Option B — LLM-on-OCR + region citations + human approval only (steelman)

- Simpler pipeline, one vendor dependency, flexible across any document shape; region citations give
  the human a fast verification anchor; the LLM handles Malaysian layout/SST reasoning the semantic
  model lacks.
- Downside: the persisted number is a *generative* read; the only defense against a transposed/
  hallucinated digit is a human who — per automation-bias evidence — often won't catch it. No
  independent deterministic signal; nothing to reconcile against. Weakest exactly where money is.

---

## Recommendation (conditional YES) + conditions

1. **Add the `prebuilt-invoice` pass**, but persist its output as **machine-verified facts used for
   cross-check**, not as the sole source. Approval is **gated on agreement** between the machine total
   and the amount being posted, plus **total = Σ line items** (±0.01). Disagreement → visible exception,
   never a silent pass.
2. **Trust the machine only for total, invoice date, vendor, subtotal.** Route **line items and SST
   breakdown** to LLM + human; do not auto-post machine line items.
3. **Handle MYR/SST explicitly**: cross-check the numeric total, but keep currency label + SST as
   LLM/human-confirmed until DI first-class MYR/SST support is verified against real Malaysian samples.
4. **Design for MyInvois first**: when a document is a validated MyInvois e-invoice, ingest its
   structured 55 fields as authoritative and **skip extraction**. The DI second-pass is the fallback
   for the non-MyInvois tail (receipts, foreign, sub-threshold through the Dec-2027 relaxation).
5. **Persist provenance** (per-field confidence + bounding box) with every machine fact so it's
   re-checkable and region-linkable — the "DB owns the number" alignment.
6. Cheapest build: run the invoice model as the primary DI call and reuse its `readResults` OCR for
   the LLM's region-cited read, avoiding a separate layout pass; escalate low-confidence fields.

**Net:** the second pass is cheap insurance whose real product is a *deterministic disagreement
signal*. Given "the DB owns every number" and the evidence that human review alone under-catches
misread amounts, adding it is the accounting-correctness-favoring choice — provided it is scoped to
the fields it is actually good at and subordinated to the MyInvois structured-data path.

---

### Sources
- OCR-accuracy comparison (Dext/Hubdoc/AutoEntry): zerentry.com/blog/ocr-accuracy-comparison-2026 ; kynledger.com/tools/dext-vs-hubdoc-vs-autoentry-2026
- Ramp Smart OCR: support.ramp.com/ramp-bill-pay-ocr ; ramp.com/blog/accounts-payable/ai-invoice-processing
- Xero smart document capture: xero.com/us/accounting-software/capture-data-with-hubdoc
- LLM vs OCR benchmark (Claude Sonnet 3.5 vs Azure/Textract/Google/Rossum/Docsumo; totals ok, line items weak): aimultiple.com/invoice-ocr
- LLM misread/hallucination + validation practice: invoicedataextraction.com/blog/invoice-extraction-using-llm ; unstract.com/blog/ai-invoice-processing-and-data-extraction
- Validation (total=Σlines ±0.01, confidence tiers, 5–15% review): invoicedataextraction.com/blog/validate-extracted-invoice-data-api-workflow ; e42.ai/blog/data-validation-technique-in-accounts-payable-process-automation ; docupipe.ai/blog/invoice-data-extraction
- Automation bias (~60% miss injected bias; omission/commission errors): frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1416504/full ; techtarget.com/searchitoperations/definition/What-is-automation-bias
- Azure DI pricing ($10/1,000 pages, prebuilt = layout): azure.microsoft.com/en-us/pricing/details/document-intelligence ; learn.microsoft.com/en-us/answers/questions/5592258 ; parsli.co/compare/azure-document-intelligence
- Azure DI invoice model (fields, confidence, 27 langs, currency list w/o MYR): learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/invoice
- MyInvois timeline/55 fields/relaxation to Dec 2027: cleartax.com/my/en/e-invoicing-malaysia ; malaysia4u.com/einvoicing-guide
