# Gate P is UNBLOCKED · Gate R2 is BLOCKED on a missing producer (2026-07-26, session 3)

Pinned: **21 migrations (`0021_counterparty_human_lane`) · runtime v27.**

Three findings, each established empirically. Two of them **correct earlier records in this
repo**, and both corrections are of the same shape: *a conclusion of absence drawn from an
instrument that could not see the thing.*

---

## 1. GATE P — UNBLOCKED. Real RM-denominated Malaysian SST invoices DO exist.

### The correction first

`gate-p-and-l-evidence-2026-07-26.md` states:

> 712 documents; the only SST-stated ones anywhere are the eight USD invoices.

**That claim is wrong, and the method that produced it was flawed.** The sweep used
`pdftotext`, which returns nothing for a page image. Measured:

| corpus | PDFs | PDFs with NO text layer | images | **invisible to `pdftotext`** |
|---|---|---|---|---|
| Bee Creative | 218 | 13 | 70 | **83** |
| Rome Properties | 109 | 9 | 0 | **9** |

**92 files were never actually searched.** "712 documents scanned" described the
text-bearing subset only. This is the same failure shape as concluding absence from a
truncated grep — already recorded twice in memory as a repeat offence — wearing a new
instrument.

### What the blind spot was hiding

`Bee Creative - CLAIM YA 2025.pdf` (7,030,666 bytes, 51 pages, zero text layer) was driven
through **live intake** and OCR'd by Azure DI: document `0a06d553`, extraction done,
**5,470 regions**. It is a bundle of ~50 supplier receipts supporting a YA2025 expense claim.

- **Zero** mentions of OpenAI or ChatGPT — the claim schedule does *not* cover the USD
  subscriptions, so the multi-currency problem is untouched by it.
- **17 pages carry a real SST computation** (a rate line, not merely a registration number),
  every one at **6%** — correct for F&B, which the March-2024 rise to 8% excluded.
- Malaysian SST registration numbers throughout (`W10-…`, `B16-…`).

### The vehicle: page 17, read off the face of the document

| field | value |
|---|---|
| supplier | **ED CAPITAL MANAGEMENT GROUP (M) SDN. BHD.** (1475415-P), t/a LAI LOU MEI |
| SST registration | **W10-2408-32000157** — a *local* registered person, not a foreign FRP |
| invoice / date | 001/07525 · 16/05/2025 |
| currency | **RM** (and `CHANGE MYR`) |
| SubTotal | **94.30** |
| Service Charge@4% | **3.77** |
| **Service Tax@6%** | **5.66** |
| Rounding Adj | **0.02** |
| **Net Total** | **103.75** |
| Tax Summary | Taxable **94.30** → Tax **5.66** |

This is precisely what Gate P was defined to need (PROJECTLOG:397): *"the next real
SST-stated supplier bill via the chat 3-leg split (TB tie to the sen)."* A local Sdn Bhd,
RM-denominated, with the tax portion stated **separately on the document**. Nothing is
derived — the agent computes no figure.

### The purchase-side 3-leg exists and is live

An important intermediate finding, because it reads like a contradiction at first. 0015:828-842
**refuses** an `sst_output` leg on a purchase:

> `sst_output` is SALES-side ONLY … Malaysian purchase SST is expensed INTO cost
> (expense = gross); output tax is a SALES liability, never a purchase leg.

That is correct — Malaysian SST has no input-tax credit, so purchase SST is part of cost.
The purchase-side split then arrived in **0016 (Wave A2.1, WA21-R1)** as a **visibility**
split: `coa_accounts.special_acc_type += 'sst_purchase_cost'` — *"an expense-typed
SST-portion-of-cost marker, never a recoverable asset"*, one per client.

So the 3-leg posting is expressible, and the rate is a parameter, not a constant
(`sst_rate_bp`, basis points — 6% = 600).

### Bee Creative's chart already holds every account required

| account | | |
|---|---|---|
| `900-SST` | SST on purchases (expensed) | `special_acc_type = sst_purchase_cost` |
| `999-R00` | Rounding | `special_acc_type = rounding` |
| `900-E03/E04/E05` | Entertainment, split by s.39(1)(l) / s.33(1) | expense |
| `320-C01` | Cash on hand / petty cash | asset |

The expected entry, every figure printed on the source:

```
Dr  900-E0x  entertainment            98.07   (SubTotal 94.30 + Service Charge 3.77)
Dr  900-SST  SST on purchases          5.66
Dr  999-R00  rounding                  0.02
Cr  320-C01  cash on hand                    103.75
```

**Which entertainment account applies (staff vs client vs non-business) is a professional
judgment and is deliberately NOT the agent's to make** — the chat lane should ask. That the
chart draws the s.39(1)(l) distinction at all is the product working as intended.

### …and then the journey found the REAL blocker, which is neither SST evidence nor currency

Driven live, the gate refused for a reason nobody had predicted. The chain, each link measured:

1. The bundle filed to Bee Creative and classified — **`other`, confidence 0.22,
   `low_confidence: true`.** Correct: 51 pages of mixed receipts are not one kind. The DB held
   the kind NULL for a human, exactly as designed.
2. Page 17 was extracted as its own document (`2684d237`) and classified **`receipt` at 0.97**
   — also correct (cash 104.00, change 0.25). But `receipt` is **not** routed to `invoice_facts`
   (only `invoice`/`credit_note`/`debit_note` are), so it yields no tax fact. *I did not
   overrule a correct 0.97 classification to force the gate through.*
3. A proper supplier invoice was then found **already in Clara**: `509e788d` —
   **BRIGHTPATH CONSULTANCY SDN. BHD.** (202401047756), billed to **ROME PROPERTIES**, invoice
   `BINV202510-018`, 14/10/2025, terms 30 days, **Service Tax (8%)**, total **RM435,560.00**,
   kind `invoice`, filed, `invoice_facts` done. Everything the gate asks for.
4. **And its facts carry no tax total.** The extraction holds `invoice.total`, `currency`,
   `invoice_id`, `invoice_date`, `vendor_name` — and nothing else.

0016:3924-3931 requires the `sst_purchase_cost` leg to tie **exactly** to
`_invoice_fact_state(...)->>'tax_total_cents'`, which is populated **only** from a
`document_regions` row at `field_path = 'invoice.tax_total'`. Census of every `invoice.*`
field_path ever written on live, across all 29 `invoice_facts` extractions:

| field_path | extractions |
|---|---|
| `invoice.total` · `invoice_id` · `invoice_date` · `currency` · `vendor_name` | **29** each |
| `invoice.customer_name` | **6** |
| **`invoice.total_excl_tax`** | **0** |
| **`invoice.tax_total`** | **0** |

`customer_name` is a **v5-mapper-only** field, so the v5 Azure mapper *is* live in production and
`TotalTax → invoice.tax_total` *is* in its FIELD_MAP (`invoiceFacts.v1.azure.mjs:188`). The
mapper is right. **Azure DI's prebuilt-invoice has simply never returned `SubTotal` or
`TotalTax` for any document in this corpus — 0 of 29 — including invoices that plainly print a
Service Tax line.**

### GATE P's true blocker, stated exactly

> The purchase-side SST leg can only tie to `invoice.tax_total`. On live that field has **two
> possible producers**: Azure's `TotalTax` (which has never fired, 0/29) and the **MyInvois UBL
> XML** lane (`myinvois.mjs:177`). **No MyInvois XML artifact exists anywhere in either
> corpus** — which is precisely why **Gate S was deferred**.

**Gates P and S are therefore coupled**: P's 3-leg needs the tax fact that only S's XML lane
reliably produces. This supersedes the multi-currency diagnosis above — that was true of the
OpenAI invoices, but it was never the binding constraint, because a perfectly good RM 8%-SST
supplier invoice was already sitting in the database and still cannot post its SST leg.

**This is not closeable today without new code.** There is no human-keyed path to a tax fact:
`_invoice_fact_state` reads extraction regions only.

---

## 2. GATE R2 — I WAS WRONG TWICE. Corrected below, and now FIXED.

> ### ⚠️ RETRACTION — the two claims this section originally made were both false
>
> **Claim 1: "`seeding-parse.mjs` reads `prior_gl.line` and has NO fallback."** False.
> `seeding-parse.mjs:317-337` — which I did not read — carries a deliberate second source:
> `// Source (a): extraction facts; (b): xlsx bytes decided BY BYTES (F-M13)`. A prior GL
> supplied as an **XLSX** has always parsed. I read the region query and its SQL, saw the
> hard-coded `field_path`, and concluded "no fallback" **without reading the caller** — the
> exact absence-from-a-partial-read error recorded twice already in this repo, committed a
> third time, in a receipt.
>
> **Claim 2: "a `prior_gl.line` producer is the fix."** Also false, and worse — it would have
> **regressed a working path.** Line 321 `if (regions.length > 0)` short-circuits the bytes
> path, and F-H5 strict parsing means one imperfect region 422s the whole prepare with the
> working parser never reached. An adversarial review pass caught this; I did not.
>
> **Claim 3 (below): "one component serves all three consumers."** Also false. Gate P is
> structurally unreachable from `structured_parse`: `_invoice_fact_state` reads regions only
> from an `invoice_facts` extraction (0016:2141-2146), which only `persist_invoice_facts`
> writes, and `persist_document_extraction` can only ever stamp `ocr` or `structured_parse`.
>
> **What was actually missing** was narrower than any of that: the lane accepted a spreadsheet
> and nothing else, so a client who only ever has a **printed** ledger was locked out.

### The real gap, and the fix that shipped

RPR — like most small Malaysian clients — hands over a **PDF** printed from its accounting
package. The lane had no path for that. It does now: **source (c)**,
`packages/runtime/lib/prior-gl-cells.mjs`.

A subagent reported that a PDF ledger cannot work because "the per-line Dr/Cr signal is
unrecoverable." **That was also wrong, twice over.** It was measured with `pdftotext`, which
flattens a page into reading order and destroys column identity — but Clara does not use
`pdftotext`. Azure returned **1,907 `tables.N.cells.M` regions, every one with a
`page_polygon`**, and the amount columns fall into three clean x-bands (5.7–5.9, 6.6–6.8,
7.3–7.4 = Debit, Credit, Balance). Column identity was never lost.

And the deeper point: **R2 never needed the side at all.** `entriesToProposals` consumes only
`counterparty`, `accountCode`, `date` and a cite. Amount and DR/CR are not part of a seeding
proposal, so the reader extracts identity and classification evidence and **never reads a
figure** — the cardinal invariant holds by construction, not by discipline. A unit test pins
it: no ledger amount may appear anywhere in a serialized proposal.

**Measured against RPR's real General Ledger** (`d7bc9c02`, born-digital, 7 pages, filed,
`management_account` at 0.98): **125 entries · 22 accounts · 34 counterparties · 81
`vendor_account_rule` + 34 `wiki_fact` proposals.** The strongest, in occurrence order:

| occurrences | account | counterparty |
|---|---|---|
| 9 | `900-A01` accounting fee | **ROME PUBLIC ADVISORY SDN BHD** |
| 5 / 3 | `310-000` / `610-000` | PKL GROUP SDN BHD |
| 4 | `310-000` | **DARE TO DREAM REAL ESTATE SDN BHD** (the Wave-A2 rename-alias case) |
| 3 | `900-O01` office & warehouse rental | **INF ASSET HOLDINGS** — B-12's rental-gap counterparty |
| 3 | `500-000` revenue | DARE TO DREAM REAL ESTATE SDN BHD |

**24 dated rows were unattributed** — every one a payroll accrual or statutory contribution
(`BEING TAKE IN ACCRUAL SALARY…`, `STATUTORY FOR JULY 2025`) whose Description-1 cell Azure
merged into the reference cell. All 24 were inspected: **not one carried a counterparty**,
because internal journals genuinely have none. They are counted and returned as
`unattributed_row_count`, never silently dropped.

**No narrative filtering**, deliberately: `RPRJV-202502/001` is a journal voucher that *does*
name a real party, so any "journals have no counterparty" rule would silently delete a genuine
vendor. Over-proposing is corrected by an admin declining a tick — the control WB-R2 specifies;
under-proposing is invisible loss.

**Cost: zero migrations, zero frozen files, no ceremony.** Source (c) is tried before the byte
path and cannot disturb it — a spreadsheet's regions are `sheets.*`, never `tables.*`, and any
PDF not positively identified as a ledger returns `null` and falls through unchanged.

### The original (incorrect) analysis, kept for the record

`packages/runtime/lib/seeding-parse.mjs:233-241` reads one thing:

```sql
and dr.field_path = 'prior_gl.line'
```

Nothing in the pipeline emits it. Settled empirically on live rather than by grep — every
region shape ever produced, with no `limit` to hide behind:

| region shape | regions | extractions |
|---|---|---|
| `pages.N.lines.M` | 7,191 | 34 |
| `tables.N.cells.M` | 4,944 | 34 |
| `invoice.*` (facts) | 151 | 29 |
| **`prior_gl.line`** | **0** | **0** |
| **`opening_tb.line`** | **0** | **0** |

12,286 regions, three shapes, and **both typed accounting field paths are absent**. This is
the *same* missing component as the `opening_tb.line` producer already logged against Gate K's
document-tied carry-down: **two consumers, zero producers, one component.** Building it once
serves both.

### What already exists (the build is smaller than it looks)

- `engine_kind='structured_parse'` is a valid, **never-used** slot (0 rows on live) — the
  natural home.
- `packages/runtime/lib/structured-worker.mjs` already persists `structured_parse` extractions
  with regions, for CSV/TSV/XLSX/DOCX/XML. It does not handle PDF.
- `create_seeding_batch` (0017:4320) accepts `document_kind in ('prior_gl','management_account')`
  — and **`management_account` is already in the classifier vocabulary**, so the classification
  half needs nothing. (`prior_gl` is *not* in `CLASSIFY_KINDS`; it does not need to be.)
- The DB write-gate on `structured_parse` field_paths (0015:2984-2990) refuses
  `%tin%`/`%ssm%`/`%brn%`/**`%account%`**. `prior_gl.line` matches none of them and passes —
  but note this **forbids** a design that emits e.g. `prior_gl.account_code`. One region per
  whole raw GL line is the shape the contract already assumes.

### What is genuinely missing

1. A deterministic GL parser emitting one `prior_gl.line` region per ledger line.
2. **A verb to enqueue a `structured_parse` task against an already-ingested document.** No
   generic re-extract enqueue exists — the only enqueue family is invoice-facts. **This makes
   R2 a migration (0022) + a runtime redeploy, not a ceremony.**

### The source is real and in excellent shape

`RPR - General Ledger YA2025.pdf` (311,454 bytes, 7 pages) is **born-digital** — 22,657 chars
of text layer, cleanly structured:

```
Code : 310-000 CASH AT BANK
Balance B/F 0.00
D & DREAM PROPERTIES SDN BHD
10/6/2025 207,974.15
Payment For Account
RPROR-202506/001
207,974.15
```

Account headers, dated lines, `RPRJV-*`/`RPROR-*`/`RPRPV-*` references, and counterparty names
— including **`D & DREAM PROPERTIES` / `DARE TO DREAM REAL ESTATE`**, the rename-alias case
from Wave A2's eval. Exactly the counterparty↔account frequency evidence the tick-list ceremony
mints `vendor_account` signatures from.

**Aside worth noting:** this GL contains the `RPRPV-*` payment-voucher references whose
*documents* are absent from the corpus — i.e. the source that would fill B-12's four remaining
gaps as GL lines, though not as documents.

---

## 3. The `document_kind` "open bug" is NOT a bug

Recorded as *"extraction completes but `document_kind` stays pending and no classify event
fires (doc `0cb7c1f1`)."* Traced and closed.

`clara._enqueue_invoice_facts_core` is the only classify enqueuer, and its callers are
**`file_document`** (0009:2343), `confirm_attribution_candidate` (0009:2397) and
`approve_wrong_client_correction` (0009:2532) — **never extraction completion**. Classification
is gated on **client attribution**, by design.

Doc `0cb7c1f1` was ingested and OCR'd (72 regions) but never **filed** to a client, so no
classify task was ever created. Verified non-vacuously on live:

| filed to a client? | has `document_kind`? | documents |
|---|---|---|
| no | no | **1** — `0cb7c1f1`, the only one |
| no | yes | 1 |
| **yes** | **yes** | **32** |

Every filed document has a kind. `intake.ts` says so in its own status copy: *"finalize lands
the document UNASSIGNED"*, and `finalized` renders as **"Stored — not yet filed."** The system
was telling the truth; I read a designed state as a defect.

---

## Consequence for the wave

| gate | before this session | after |
|---|---|---|
| **P** | BLOCKED — multi-currency, "zero RM SST documents exist" | **BLOCKED on a missing tax-fact producer.** The evidence objection is dead (real RM 8%-SST supplier invoices are already in the DB); the binding constraint is that `invoice.tax_total` has never been produced, 0/29 |
| **R2** | "feasible, not started" | **BLOCKED on a build** — migration 0022 + a GL parser |
| classify | open, undiagnosed | **not a bug** |

## The pattern — and the caveat that "one component" was too neat

Three consumers read a typed field path nothing produces:

| consumer | reads | status after this session |
|---|---|---|
| `seeding-parse.mjs` (Gate R2) | `prior_gl.line` | **SOLVED** — but not by producing that field path. Source (c) reads the table cells directly, in-memory |
| `opening-parse.mjs` (Gate K, document-tied) | `opening_tb.line` | still open; the same table-cell technique applies |
| `_invoice_fact_state` → SST leg (Gate P) | `invoice.tax_total` | **NOT reachable this way.** It must be a region on an `invoice_facts` extraction, which only `persist_invoice_facts` writes — so Gate P needs an `invoiceFacts` **v2** (v1 is frozen) |

The tempting synthesis — *one semantic mapper serves all three* — was **wrong**, and it is worth
recording why, because it was seductive: two of the three consumers sit behind the same
extraction boundary and the third does not. `persist_document_extraction` can only ever stamp
`ocr` or `structured_parse`; no region it writes can ever feed the invoice-facts tier.

What *does* generalize is the **technique**, not the component: OCR layout regions already carry
the information, and their **polygon geometry preserves column identity** that reading-order
text destroys. That insight closed R2 today and should close K next. Gate P is a different
build behind a frozen boundary.

The honest lesson is smaller and more useful than "three gates, one component": **read the
caller before declaring a consumer orphaned**, and **measure with the instrument the system
actually uses** — `pdftotext` said the columns were gone; Azure had them all along.

Gate R2 moved *away* from closure and Gate P's stated cause changed entirely. Both moves came
from measuring instead of inferring — and in P's case, from distrusting an earlier "exhaustive"
claim of my own, twice: once for the `pdftotext` blindness, and again when the sharper
"multi-currency" diagnosis also turned out not to be the binding constraint.
