## S6-D1 — invoice-facts pass

**POSITION: AMEND.** Adopt `invoiceFacts_v1` for Slice 6, but amend P1 in four exact
ways: make dual-pass a Slice-6 compatibility decision rather than a permanent primary
architecture; call the output *machine-extracted/corroborated*, not
*machine-verified*; turn total disagreement into a blocked-until-resolved exception
rather than an irrevocable CLR21 dead end; and make a MyInvois adapter the next
production prerequisite rather than an indefinite “later slice.”

### Where P1 is right

- Keeping `prebuilt-layout` primary in S6 is the low-risk choice. The frozen
  `documentIngest_v1` body and the matcher's existing layout-region contract are real
  compatibility constraints for this slice.
- A separately persisted invoice total, confidence, physical polygon, engine/version,
  raw value, normalized cents, and fact hash are useful corroborating evidence. An
  exact-cents comparison against the proposed debit and payable totals catches a class
  of silent model/human errors that citations alone do not.
- Currency, SST and line items must remain source-confirmed by the LLM and human in
  S6. Azure's invoice output may inform them, but it is not the authority for those
  fields.

### Exact amendments

1. **Time-box the two-pass architecture.** “Same price” does not mean free: two calls
   consume twice the page calls, add queue/concurrency pressure, and add another
   failure and egress surface. S6 should run layout on intake and invoice-facts only
   after a human files a PDF/image as a supplier bill, as the contract already says;
   it should also record a post-beta decision gate for an invoice-primary
   `documentIngest_v2` or class-routed primary. The S5 freeze forbids editing the
   deployed v1 closure, not creating v2 and repointing the registry later; any switch
   must first prove parity on page/text/polygon/table output, matcher candidates and
   rule outcomes, non-invoice behavior, latency, metering, and the full Malaysian
   golden corpus. Azure documents that the invoice model emits recognized text,
   tables/bounding boxes, and invoice fields, but that does **not** prove behavioral
   equivalence to Clara's normalized layout regions or matcher
   ([Microsoft invoice model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/invoice?view=doc-intel-4.0.0),
   [Microsoft layout model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0)).

2. **Narrow Tier A and stop overstating the evidence.** A total becomes
   `corroborated` only when the selected field is `InvoiceTotal` (not `AmountDue`),
   deterministic cents normalization succeeds, a physical region exists, field
   confidence meets a versioned threshold (initially 0.95, then calibrated on a
   Malaysian holdout set), the source is confirmed as MYR, and there is no conflicting
   deposit/amount-due/document-type signal. `InvoiceDate`, invoice number and vendor
   name may be persisted as header candidates, but invoice date is not automatically
   the recognition date and vendor name never overrides registration/TIN-dominant
   counterparty resolution. Azure line items must not participate in the Tier-A gate;
   the DB comparison is exactly `supported_gross_cents == total_debits_cents ==
   payable_credits_cents` after cents normalization, and the ≤5¢ rounding writer must
   never be used to cure a source-total disagreement.

3. **Hard-block ordinary approval, not all human resolution.** On a high-confidence
   machine/proposed mismatch, persist a conflicted draft and render both values,
   confidence and regions; set `amount_exception.status='open'` and disable the normal
   Approve action. A human-lane `revise_entry`/`resolve_amount_exception` act may choose
   the machine amount or override it as `machine_misread`, but the override must carry
   a reason code, exact source quote/region, actor/time, and new revision token; it sets
   the existing high-stakes flag so the distinct-checker/solo-attestation law applies.
   `_assert_supplier_bill_shape` then compares against the resolved supported gross,
   while `approve_entry` refuses any still-open exception and still performs the
   filing-lock, fact-hash and late-facts CLR25 checks. CLR21 needs a structured reason
   discriminant so `amount_conflict` renders this flow, while `currency_unsupported`,
   malformed evidence, and double-coding remain terminal refusals; partial payment is
   not an amount override because the bill is still booked gross to AP, and deposits,
   credit notes, or unsupported total-vs-due semantics remain park/refuse cases.

4. **Advance MyInvois from “standing rule” to sequenced work.** Deferral is defensible
   for the bounded FY2025 RPR replay because the manifest contains PDFs, not supplied
   UBL artifacts; it is not defensible as the production sequence for a Malaysian firm
   in July 2026. Established taxpayers down to the RM1m exemption boundary are already
   in the mandate schedule, although the Phase-4 interim relaxation runs through
   31 December 2027 and permits consolidated treatment, so Clara must support both a
   substantial PDF tail and a growing structured stream
   ([LHDN timeline](https://www.hasil.gov.my/en/e-invoice/implementation-of-e-invoicing-in-malaysia/e-invoice-implementation-timeline),
   [LHDN FAQ, Part 4](https://www.hasil.gov.my/media/0xqitc2t/lhdnm-e-invoice-general-faqs.pdf)).
   Make the MyInvois JSON/XML/validation-link adapter a named next-slice gate before
   general production supplier-bill rollout: only a payload/API record whose status is
   currently `Valid` and whose receiver identifies the Clara client skips DI; persist
   the raw payload hash, UUID/longId, schema/type version, issuer/receiver IDs,
   validation time/status and retrieval evidence, and recheck status at approval.
   “Digitally signed” cannot be the test because MyInvois supports versions with
   signature validation disabled, and a valid document can later be cancelled or
   superseded by credit/debit/refund documents
   ([MyInvois document types](https://sdk.myinvois.hasil.gov.my/types/),
   [Get Document Details](https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/));
   MyInvois is authoritative for submitted facts and validation status, not for expense
   account, business purpose, recognition period, or approval.

### Strongest argument against P1

The real cost is not the extra cent per page; it is a new frozen workflow, task lane,
reservation carrier, egress/cap changes, extraction type, lock protocol, revision
rotation, two new refusal modes, and a large race-test surface for 17 clean documents
that already require human approval. The invoice model itself returns OCR/layout-like
content, so a new invoice-primary v2 could plausibly provide the same facts with one
vendor call, while a simpler S6 could retain honest Tier B plus mandatory source
confirmation. Moreover, layout+invoice are not truly independent measurements: they
share the same pixels and vendor stack, and a confidence score is neither calibration
nor proof, so calling agreement “machine verification” risks creating the automation
bias the second pass is meant to reduce. I still adopt it for S6 because changing the
primary and matcher simultaneously is the riskier GATE-3 move, but P1 is over-engineered
if dual-pass silently becomes permanent.

### Important omissions from both D1 briefs

- **Multi-document bundles:** the INF seven-page debit-note bundle contains the payable
  top-level document plus backup invoices. Tier A must require an unambiguous selected
  top-level payable document; it must never take the first or largest total returned by
  a multi-document result.
- **Duplicate-bill control:** one-open-draft-per-filing prevents recoding the same
  filing, not a second upload of the same invoice. Before approval, warn/block an exact
  `(client, resolved vendor, invoice number)` duplicate and surface same-vendor/date/
  total near-duplicates with a governed override.
- **Model drift and reproducibility:** an Azure API-version pin is not proof that hosted
  model weights never change. Persist the full raw response hash and normalized-policy
  version, and treat reprocessing as a new extraction version rather than overwriting
  facts.
- **Document text is untrusted input:** invoice text shown to the LLM must remain quoted
  data, never instructions, including in multi-page attachments.

### Final recommended S6-D1 formulation (5 sentences)

For S6, retain frozen `documentIngest_v1`/`prebuilt-layout` as the primary and add
`invoiceFacts_v1` only for human-filed supplier-bill PDFs/images; this is a slice-scoped
compatibility choice, with a measured invoice-primary `documentIngest_v2` decision gate
after the beta. An `InvoiceTotal` is Tier-A corroborated only when its versioned
confidence threshold, physical region, MYR confirmation, cents normalization and
single-top-level-document guards all pass; persist raw/normalized values, confidence,
polygon, engine/version and fact hash, while date/number/vendor remain candidates and
currency/SST/line items remain human-confirmed. A machine/proposed mismatch creates an
open amount-exception draft that blocks ordinary approval, but a bookkeeper may resolve
it through an exact-revision, region-cited, reason-coded human override that is audited
and high-stakes checked; unsupported deposit/credit-note/partial-payment semantics do
not use that override. Late facts still rotate the revision token and `approve_entry`
rechecks the filing lock, selected fact hash, resolved supported gross and exception
state in-transaction. A currently `Valid`, client-matched MyInvois JSON/XML/API record
is the preferred factual source and skips DI, with payload/status provenance persisted
and status rechecked at approval; ship that adapter in the next slice before broad
production rollout, while keeping DI for consolidated, exempt, foreign and legacy PDFs.

## S6-D2 — accrual-to-AP and chart augmentation

**POSITION: AMEND.** Keep accrual-to-AP for the positively identified supplier-bill
class, but delete the proposed “AP nets to zero at FYE” S6 assertion, tighten the eval's
cut-off adjudication, and make the AP/rounding additions client-approved system roles
rather than Clara-owned chart policy. The S6 control check is AP-control-to-open-bills,
not AP-to-zero, because payments and opening balances are explicitly out of scope.

### Where P2 is right

- For a supplier bill that creates an interval before settlement, Dr the supported
  expense/asset and Cr AP with a vendor is the right durable product representation.
  Scoring the debit judgment separately from the mechanical AP/payment representation
  is a fair replay method.
- There is no Malaysian statutory objection to an AP control or rounding account merely
  because accounting software introduced it. The risk is unauthorised or opaque chart
  mutation, not the existence of a normal liability/control account; Malaysian audit
  reporting focuses on true-and-fair statements and properly kept accounting records
  ([MIA AAPG 2](https://mia.org.my/wp-content/uploads/2022/06/MIA_Audit_and_Assurance_Practice_Guide_AAPG_2.pdf)).
- A direct-spend path belongs in the bank slice, but the current slice must refuse/park
  genuine cash purchases rather than force them through the supplier-bill shape while
  that path is absent.

### Exact amendments

1. **Remove AP-zero from S6.** Slice 6 creates bills but has no payment/allocation flow,
   so its correct end-state is `400-000 control balance == sum of the vendor-tagged AP
   credits/open approved bills included in the replay`, not zero. A zero check would
   require synthetic settlement entries, contradict the named bank/payment deferral,
   and also fail whenever a genuine 31 December creditor exists. After the bank slice,
   the invariant becomes `AP control == sum of open vendor items`; it equals zero only
   if bank evidence proves every item was settled by FYE.

2. **Do not pre-award “Clara-more-correct” on date alone.** The eval should score each
   debit leg's account, integer cents, and recognition date, but a boundary difference
   is expected/correct only when invoice/service/delivery and payment evidence supports
   the incurred period. Invoice date is not always the recognition date: prepayments,
   deposits, assets, inventory, services spanning periods and later credit/debit notes
   can make a simplistic accrual rule wrong. Report boundary cases by count and MYR,
   cite the evidence, and require owner adjudication; unresolved cases are exceptions,
   not errors and not automatically Clara wins.

3. **Make system-role governance explicit.** If `400-000 TRADE CREDITORS` already exists
   in the imported GL/chart, reuse and designate that row rather than create a duplicate;
   otherwise add it only after the recorded owner sign-off already contemplated by the
   onboarding script. Persist `origin/system_role`, creation receipt, mapping rationale,
   actor/time and lock reason as metadata; preserve the client-facing account name and
   code, prohibit deletion or retagging after use, and allow normal payable postings only
   through governed bill/payment writers with a counterparty. Apply the same provenance
   and lock treatment to the rounding account, retain the existing ≤5¢ DB rule, and
   report its cumulative balance/uses separately so many small residuals cannot hide.

4. **Scope the product claim.** MPERS accrual reporting does not itself mandate a
   particular AP account or daily AP workflow; AP is Clara's control design. In S6,
   `coding_kind='supplier_bill'` should be set only after human filing/classification,
   and the gross-expense/AP shape is an RPR-corpus rule, not a universal rule for every
   supplier-originated document. Paid receipts/cash purchases park for the bank slice;
   credit notes, deposits, capital/prepayment/inventory treatment and payment allocation
   require their own supported shapes rather than being squeezed through “always gross
   to expense.”

### Strongest argument against P2

For a 17-file beta whose comparison ledger booked direct to bank, AP adds a counterparty
domain, chart mutation, payable constraints, vendor-resolution races, correction and
reversal propagation, and an unmatched liability balance without testing payment or
aging—the capabilities that justify an AP subledger. MPERS requires accrual financial
statements, not that day-to-day entries use a system AP control, so mirroring direct
spend for same-day-paid items and making only evidence-supported year-end accruals would
be lawful and much easier to compare. The phrase “document content is truth” is also too
strong: a supplier document proves what was claimed, not that the purchase was authorised,
non-duplicate, business-related, incurred in that period, or still unpaid. I retain AP
because it is the correct go-forward product spine, but it must not be sold as a
statutory necessity or validated with an impossible zero balance.

### Important omissions from both AP briefs

- Counterparty-tagged journal lines are not yet a complete open-item subledger: invoice
  number, due date, payment allocation, partial settlement, credit-note application and
  aging are deferred. S6 may prove control-account congruence, but must not claim full AP
  aging or settlement integrity.
- The RPR manifest includes a supplier debit note and multi-invoice backup pages. The
  document-type/polarity and top-level-obligation rules need an explicit fixture even
  though this debit note lawfully increases AP.
- “No opening balances” means the replay is not a complete FY2025 balance-sheet or
  statutory close. Its AP result is a slice-eval control, not an assertion about RPR's
  true year-end creditors.
- The contract and companion headers still say v1.2 while the delta log says eight
  findings were folded “as v1.3”; normalize both headers/statuses when S6-D1/D2 are
  ratified so the decision record has one unambiguous normative version.

### Final recommended S6-D2 formulation (5 sentences)

For S6, a human-filed supplier bill or supplier debit note that creates a payable posts
its supported debit leg(s) and an equal credit to payable-class `400-000 TRADE
CREDITORS`, with the resolved vendor on every payable line; genuine paid receipts/cash
purchases are refused or parked until the sanctioned bank-slice direct-spend path.
Reuse `400-000` if it already exists, otherwise add it with the rounding account through
audited onboarding after owner sign-off, storing system-role/origin metadata and locking
deletion/retagging while restricting ordinary control-account postings to governed
writers. The replay scores debit account, exact cents and evidence-supported recognition
date; every boundary divergence is listed by count and MYR and is labelled
“Clara-more-correct” only after source-backed owner adjudication. Because S6 has no
payment allocation, its AP gate is `400-000 GL balance == sum of vendor-tagged open
approved bill credits`, never zero; after the bank slice the same control must equal the
open-item subledger and reaches zero only when settlement evidence proves no FYE
creditor remains. The rounding account retains the existing ≤5¢ DB auto-append rule
with per-use provenance and a separately reported cumulative balance, and no S6 replay
result is represented as a complete statutory close because opening balances and bank
settlements are absent.
