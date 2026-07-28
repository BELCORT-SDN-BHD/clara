# The currency defect — design (DRAFT, 2026-07-28)

**Status: DESIGN ONLY.** No product code, no migration. Ledger task #24. Branch
`feat/currency-defect-design`. Every number below was measured read-only against live on
2026-07-28 via `C:\Users\zhant\.clara-tools\live_ro_u.py`; the query for each claim is quoted
so it can be re-run.

**Authority it must respect:** the corroboration law (0023) is LAW — corroborated = per-field
`typed_collapsed` agreement for net AND tax + component identity + the MYR wall, confidence
GONE. This design does **not** touch it. `docs/plan/extraction-slice-contract.md` §2 X2/X5 and
ADR-047 Q1 supply the reconciliation discipline reused here.

**Continued in [`currency-defect-design-part2.md`](./currency-defect-design-part2.md)** (§8-§12):
the **reader vs governed-override decision**, the corrected Lucy-family scope, the live
`draft_entry` → CLR21 receipt, and the only safe override shape if the owner overrules.

## 0. The recommendation, in one paragraph

Add a **document-scope deterministic currency reader** to `packages/runtime/lib`, feed it
through the *existing* X2 merge reconciliation, and bump `NORMALIZATION_VERSION` to
`clara-invoice-norm:v9`. **No migration, no corroboration change, no DB change of any kind.**
The reader emits nothing on its own authority: it agrees with Azure's typed `currencyCode` (the
typed row stands, now with an agreement stamp), disagrees (both rows withdrawn, exactly as X2
already withdraws a disagreeing net or tax), or abstains (the typed row stands unopposed, v5
semantics). Withdrawal is the whole fix: with no `invoice.currency` region, `explicit_non_myr`
evaluates false and the terminal CLR21 `currency_unsupported` refusal that today makes 7 real
documents permanently un-codeable does not fire — while `corroborated` also stays false, so
nothing gains posting authority it had not earned. Measured cost: **7 re-extractions**, each on
a document holding 2 of its 3 attempts. Measured benefit: **7 documents returned to the human
coding lane, 0 documents added to the corroboration set** — and that second number is the honest
one: this defect is not what blocks Gate P.

## 1. The measured defect

### 1.1 What Azure does

`packages/runtime/workflows/invoiceFacts.v1.azure.mjs:370-377` emits the currency fact from
`fields.InvoiceTotal.valueCurrency.currencyCode`, with `region = firstRegion(total)`. Two things
are wrong there, and only the first is the reported defect.

**(a) The value is a guess presented as a reading.** Across the 46 documents holding a current
`invoice.currency` fact: **MYR 38 · USD 6 · EUR 1 · SGD 1** (the last being the Gate-S synthetic
XML — genuinely SGD, §6.5). The 7 OCR mis-typings, named:

| document | typed | file |
|---|---|---|
| `882fc179` / `39d786a0` / `4406fd56` | USD | `FEB` / `JAN` / `MAR 2025-Invoice.pdf` |
| `75b54473` / `434a6cf1` / `93fb8243` | USD | `Lucy Artistry Lab_RM1130_Apr 24` / `_RM1550_Jan 24` / `_RM3090_Jan 24.pdf` |
| `f3245804` | EUR | `MEDICAL - RM526.00 - 20042024.pdf` |

**(b) The provenance is borrowed.** `firstRegion(total)` gives the currency fact **the total's
polygon**. Measured on every document that has both facts:

> `with p as (select e.document_id, max(case when r.field_path='invoice.currency' then r.locator::text end) as ccy_loc, max(case when r.field_path='invoice.total' then r.locator::text end) as tot_loc ...) select ccy, count(*), count(*) filter (where ccy_loc is not distinct from tot_loc) ...`
>
> → **MYR 38/38, USD 6/6, EUR 1/1, SGD 1/1 — 46 of 46 identical.**

So the row asserts "the box at this polygon says USD" about a box that contains `1,700.00`. The
structural invariant that a fact is bound to the page evidence supporting it is satisfied only
formally here: the polygon is real, but it is not evidence *for this field*. That is worth
recording even though (a) is the blocking defect.

### 1.2 Why it is terminal

`0009_coding_floor.sql:1326-1341` (and the identical block at `:1797-1810` for revise, carried
forward through `0016:4109`) raises on both `_evidence_cites_non_myr(p_evidence)` and the fact
state's `explicit_non_myr`:

```sql
raise exception 'explicit non-MYR currency is unsupported'
  using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
```

There is **no override**. This is not a corroboration failure dropping a document to the human
lane — it is a CLR21 terminal refusal on `draft_entry` *and* `revise_entry`, so a bookkeeper
looking at a Malaysian invoice cannot code it at all. That is the precise sense in which the
defect "terminally blocks coding", and it is the thing worth fixing.

### 1.3 The page tells the truth, unanimously

Every one of the 7 mis-typed documents carries affirmative MYR evidence in its own OCR text —
and **none carries any foreign-currency token at all**:

| document | page evidence (OCR region, verbatim) |
|---|---|
| `39d786a0`, `434a6cf1`, `4406fd56`, `882fc179` | `pages.1.lines.24` → `Price is in MYR currency.` |
| `75b54473` / `93fb8243` | `pages.1.lines.26` / `.28` → `Price is in MYR currency.` |
| `f3245804` | `pages.1.lines.32` → `RM`; `.51` → `Unit Price (RM)`; `.52` → `Total (RM)` (repeated p2) |

Six of the seven literally print the sentence **"Price is in MYR currency."** and Azure typed
them USD.

Widening the vocabulary past `RM`/`MYR` matters, and the EZSEC family is why: its invoices carry
no `RM` token anywhere, declaring currency in words instead — `pages.1.lines.52` → **`RINGGIT
MALAYSIA : ONE THOUSAND AND SEVEN HUNDRED ONLY`**. With `RINGGIT` in the vocabulary the
corpus-wide picture closes completely:

> 58 OCR documents · 41 carry `RM`/`MYR` · 33 carry `RINGGIT` · **49 carry either** · 9 carry
> neither — **and all 9 have no `invoice_facts` extraction at all** (management accounts,
> consent evidence, claim forms).

**Cross-tabulated against what Azure typed, on the documents that have facts:**

| typed | page says MYR | page has a foreign token | docs |
|---|---|---|---|
| MYR | yes | no | 32 |
| USD | **yes** | **no** | 6 |
| EUR | **yes** | **no** | 1 |
| MYR | yes | yes | 1 (`94a0fd0d` — a **false positive**, §6.4) |

**40 of 40 documents holding invoice facts carry affirmative page MYR evidence. Zero
exceptions.** The truth is on the page, page-anchored, with polygons (`locator_kind =
page_polygon`, 8 vertices, verified on the `Total (RM)` and `Price is in MYR currency.` rows).

## 2. Q1 — where the truth about currency lives

Five candidate sources exist, and they are not of equal standing.

**The raw OCR text is the only page-anchored, per-document, deterministic source, and it is
sufficient on the whole measured corpus.** The `ocr` lane persists every line as its own
`document_regions` row (`pages.N.lines.M`) with `locator_kind='page_polygon'` and a real
8-vertex polygon — 17,198 such rows across 59 extractions. The Azure *prebuilt-invoice*
`analyzeResult` carries the same `pages[].lines[]` structure that X2's totals reader already
consumes (verified at step zero, `docs/plan/research/extraction-slice/step-zero-capture-2026-07-27.md`),
so a currency reader needs **no new Azure call and no new payload**: it reads the array X2 is
already holding. The evidence vocabulary it must cover is wider than "RM", measured: the ISO
code (`MYR`), the symbol (`RM`, including the column-header form `Total (RM)`), a declaration
sentence (`Price is in MYR currency.`), and the amount-in-words declaration (`RINGGIT
MALAYSIA : …`) which is the *only* evidence the entire EZSEC family carries. All four are
page-anchored: each is a specific OCR line with its own polygon, citable as provenance.

**The MyInvois structured lane always carries an authoritative `currencyCode`** and is out of
scope — different normalization (`clara-myinvois-norm:v1`), different engine, and its one
non-MYR document is *correctly* SGD. It must be left byte-identical (§6.5).

**SST registration marks are real but indirect.** 12 documents carry an `SST`/`GST` token, and
a Malaysian SST registration evidences a Malaysian *tax regime* — not the currency this
particular invoice is denominated in. A Malaysian SST-registered vendor can and does invoice in
USD. Recommend: excluded from the accept vocabulary.

**The firm/client jurisdiction is an assumption, not evidence.** "Default to MYR" would be right
on ~100% of today's corpus and is exactly the kind of rule that is invisible when it is wrong:
not page-anchored, not citable in an evidence row, no provenance for the figure's unit.
Recommend: **not used as a reading**; §3 shows it is also unnecessary.

**The filename is not evidence.** Three affected files literally contain `RM1130`, `RM1550`,
`RM526.00`. Tempting and wrong — user-supplied, unversioned, outside the provenance chain.
Recommend: never read. (Stated because it will occur to the next reader as it did to this one.)

**Refusal case for Q1:** a document whose pages carry no currency vocabulary at all. Measured:
9 such documents exist, all outside the facts lane. For one that entered the lane, the reader
abstains and the typed field stands unopposed — the pre-fix behaviour, unchanged.

## 3. Q2 — the fix shape

**Recommendation: distrust Azure's `currencyCode` as *evidence*, but keep it as one of two
readers — and let the existing merge law arbitrate.** This is neither "a label-anchored reader
that overrides Azure" nor "a jurisdiction default"; it is the X5 discipline applied to a field
that never got it.

The machinery already contains the honest answer, and this is the key observation of the whole
design. `0009:229-240`, `_is_explicit_non_myr`, is deliberately *conservative*:

```sql
when (select q from n) = '' then false
when (select q from n) in ('RM','MYR','RMMYR','MYRRM') then false
```

Blank is **not** an assertion of foreignness — the comment says it outright: *"Conservative --
true ONLY for an EXPLICIT non-MYR token; bare RM/MYR/blank never trips it."* That is precisely
the distinction the defect destroys. A bare-numeral Malaysian invoice states no currency on its
face; the honest fact is **absence**, and the DB already knows what to do with absence. The
mapper instead manufactures a *false assertion* — `USD` — out of a vendor's guess, and a false
assertion is the one input this machinery was never built to survive. The fix is not to teach
the DB a new rule; it is to stop laundering an inference into a page-anchored fact.

**The shape, concretely.** A new `packages/runtime/lib/invoice-currency-reader.mjs` produces a
**document-scope** verdict from `pages[].lines[]`:

- `myr` — at least one MYR token from the accept vocabulary, and **no** foreign-currency token
  anywhere on the document;
- `foreign` — a foreign token and no MYR token;
- `ambiguous` — **both** present (§5.2 — this is the case that already exists in the live
  corpus);
- `absent` — neither.

Only `myr` is a *reading*. `ambiguous`, `absent` and `foreign` are non-readings that emit
nothing, because a deterministic reader that cannot name the currency has not earned the right
to contradict anyone. The verdict then goes through the **existing** four-outcome merge
(`packages/runtime/lib/invoice-totals-merge.mjs:16-25`), unchanged in law:

| typed `invoice.currency` | reader | outcome |
|---|---|---|
| absent | `myr` | emit the reader's row |
| present & blank | `myr` | reader fills the hole |
| `MYR` | `myr` | **agree** → keep the typed row, stamp `typed_collapsed` |
| `USD`/`EUR`/… | `myr` | **disagree** → emit NEITHER |
| anything | `ambiguous`/`absent`/`foreign` | reader abstains → typed row stands (v5 semantics) |

**Why currency is document-scope and not label-anchored like X2.** X2 pairs a label to an amount
with a three-term geometric test because an amount is meaningless without knowing *which* label
owns it. Currency is not that kind of fact — it qualifies the whole document, and the measured
evidence proves it: on the EZSEC invoice the declaration `RINGGIT MALAYSIA : …` sits at line 52
while the gross it qualifies sits at line 64, twelve lines and well over an inch away. Any
geometric pairing tight enough to be meaningful would refuse the entire EZSEC family — the
corroboration-capable family. Document scope is therefore correct — **but document scope is
exactly why presence alone is insufficient** (§6.1), which is what makes the `ambiguous` rule
load-bearing rather than defensive.

**Alternative A — a jurisdiction default (client-scoped MYR, `explicit_non_myr` as the override
wall).** Rejected. Cheapest, works on today's corpus, but produces a fact with no provenance:
nothing on the page supports it, nothing can be cited, and the first genuinely foreign document
Azure *also* mis-types arrives with two silent errors agreeing. It inverts the burden of proof —
a document is MYR until something proves otherwise, the posture that lets a wrong currency post
rather than refuse. Reconsider only if real Malaysian documents appear with *no* currency
vocabulary; measured today that set is empty (0 of 40).

**Alternative B — treat the typed `currencyCode` as advisory and never emit it.** Rejected, and
the reason is measured. Drop the typed field and `openai-0008.pdf` — a genuine USD invoice —
loses the only correct currency reading anyone has of it, because its page carries `(RM6.61)`
and *would* satisfy a naive MYR reader. Azure is right 33 of 40 and is the only reader that
catches the genuinely foreign document; removing it trades 7 false refusals for an unknown
number of false *acceptances*.

**Alternative C — reader wins outright on disagreement (emit MYR).** Rejected on discipline, and
free to reject: it makes the reader an adjudicator, which ADR-047 Q1 removed deliberately
("reader disagreement is a refusal, never a tie to adjudicate"). Measured, it buys nothing — the
7 documents it would rescue have no net/tax agreement and cannot corroborate either way (§7.1).

**Refusal cases for Q2:** the reader must abstain, never guess, when (i) both MYR and foreign
tokens appear; (ii) no vocabulary appears; (iii) the payload is multi-document (X2 already
disables itself here, `reason:"multi_document"` — the currency reader must inherit that switch
verbatim); (iv) a page declares pixels with no width, where X2's frame is unknowable — though
note this reader needs no geometry to *decide*, only to *cite*, so it can still read where X2
cannot. That asymmetry should be deliberate and documented, not accidental.

## 4. Q3 — where the fix lands

**Recommendation: reader-only. `packages/runtime/lib` + a `NORMALIZATION_VERSION` bump to
`clara-invoice-norm:v9`. No migration.** The DB is already correct; it is being lied to.

Trace what the existing predicates do once a disagreeing currency row is withdrawn
(`0023_extraction_slice_x5.sql:167-169`, carried from 0009) — with no `invoice.currency` region
`min(text_content)` is NULL, `coalesce(…,'')` makes `v_currency = ''`, and therefore:

- `v_ok` requires `v_currency = 'MYR'` → **`corroborated` stays false.** No document gains
  posting authority. The X5 law is untouched and unweakened — the fix can only ever *remove*
  documents from the corroborated set, never add one.
- `explicit_non_myr` is `nullif(v_currency,'') is not null and …` → `nullif('','')` is NULL →
  **false.** The terminal CLR21 does not fire and the document lands in the human coding lane.
- `_evidence_cites_non_myr` cannot fire: no `invoice.currency` region remains to cite.

That is the entire fix, achieved by *deleting a false row*, not by adding a rule.

**Why no DB change, as a falsifiable claim:** the only DB-side change worth wanting is to
require *agreement* on currency before corroborating (treat a typed `MYR` no second reader
confirmed as insufficient). Measured, that would today alter **zero** outcomes — all 8
corroboration-capable documents carry `RINGGIT MALAYSIA` and collapse to agreement anyway. A
migration that changes nothing observable, in the one predicate the contract says must ship
**alone** with its own adversarial review, is not worth its risk now. It becomes worth doing the
first time a document arrives with facts and no page currency vocabulary — empty today (0 of
40), monitored by CG8, recorded as owner question O3. **The X5 discipline is respected by not
invoking it:** this design proposes no corroboration change, so there is nothing to isolate.

**Version bump.** `NORMALIZATION_VERSION` is currently `clara-invoice-norm:v8`
(`invoiceFacts.v1.azure.mjs:80`). The same document now yields a *different* fact set (a
currency row may be absent where it was present), which is exactly the v6→v7→v8 precedent
recorded in that file's own comment, so **v9** is required — not optional. It also feeds
`rawSha256`, keeping v8 and v9 extractions distinguishable and making a re-extraction a genuine
new fact set rather than a silent supersede.

## 5. Q4 — the re-extraction economics

### 5.1 The budget law, quoted from live

`clara.claim_document_processing_task`, live body:

```sql
if t.lane='invoice_facts' then
  select coalesce(sum(attempt_count),0)::int into v_attempts
    from clara.document_processing_tasks where document_id=t.document_id and lane='invoice_facts';
  if v_attempts>=3 then
    update ... set status='failed',error_code='attempt_cap' ...
```

Three `invoice_facts` renders per document, summed over *all* versions, enforced at claim time.
`clara.request_reextraction(p_document uuid, p_reason text, p_op_key text)` exists live
(bookkeeper floor, ADR-047 Q2) and is the ordinary door.

### 5.2 What each affected family can afford — measured, not assumed

> `select left(document_id::text,8), lane, count(*), sum(attempt_count), max(version_n), string_agg(distinct status,',') from clara.document_processing_tasks where document_id in (…) group by 1,2`

| family | docs | attempts used | **remaining** | reachable? |
|---|---|---|---|---|
| USD mis-typed (`Lucy Artistry Lab` ×3, `JAN`/`FEB`/`MAR 2025-Invoice` ×3) | 6 | 1 of 3 each | **2 each** | **yes** |
| EUR mis-typed (`MEDICAL - RM526.00`) | 1 | 1 of 3 | **2** | **yes** |
| SGD (`myinvois-sample-sg0006.xml`) | 1 | — XML lane | n/a | **must not be touched** (§5.5) |
| `509e788d` (Gate-P vehicle) | 1 | **3 of 3**, v4 `failed/attempt_cap` | **0** | permanently unreachable — **and unaffected** (typed MYR) |
| `2684d237` (`bee-lailoumei-p17.pdf`) | 1 | `failed/skipped_kind`, **attempt_count 0** | **3, intact** | **yes** — see §7.2 |

**Total spend to fix the defect corpus-wide: 7 re-extractions, each leaving 1 attempt in
reserve.** No document is pushed to its cap by this fix.

**What is permanently lost: nothing, measured.** `509e788d` is the only document at cap and it
is typed `MYR` — the currency defect never touched it, so this design's exposure to the cap is
zero. That will not stay true forever: any *future* fix needing a re-read of `509e788d` is
impossible through the ordinary door, and the bootstrap door (0026, for filed-never-extracted
documents) does not help a document already extracted three times. Recorded, not solved.

**The 33 correctly-typed MYR documents need no re-extraction** — identical behaviour before and
after (typed `MYR`, reader agrees, row kept); re-reading them would spend 33 attempts to change
nothing. They pick the reader up naturally whenever re-extracted for another reason.

### 5.3 Ordering

Re-extract only after v9 is deployed, and one document first — recommend `f3245804`, the EUR
document: it is the single-document family and its evidence shape (`Total (RM)` column headers)
is the *weaker* of the two. Verify the currency row is absent and every other field unchanged,
then the 6 USD documents. That sequencing spends 1 attempt to de-risk 6.

## 6. Q5 — adversarial: how this fix could mis-state currency

### 6.1 A genuinely foreign invoice that also prints RM — **this is live, not hypothetical**

`0cb7c1f1` / `openai-0008.pdf` is in the corpus today:

| region | text |
|---|---|
| `pages.1.lines.21` | `$21.60 USD due November 30, 2025` |
| `pages.1.lines.44` | `$21.60 USD` |
| `pages.1.lines.40` | **`(RM6.61)`** |
| `tables.2.cells.5` | **`$1.60 (RM6.61)`** |

A genuine USD invoice printing an MYR convenience conversion in parentheses. **A naive
"page contains RM ⇒ MYR" reader mis-states this document**, and it would do so while looking
like a clean deterministic read. This single document is the reason the `ambiguous` rule in §3
is the core of the design rather than a defensive afterthought.

**The wall:** both an MYR token and a foreign token are present → verdict `ambiguous` → the
reader emits nothing → Azure's typed `USD` stands unopposed → the existing `explicit_non_myr`
CLR21 refuses it, correctly. The document goes to a human, which is the right destination for
an invoice denominated in USD with an MYR conversion printed on it. **Residual: none for this
shape.** (Note the document currently has only `ocr:done`, no `document_kind`, and no facts
extraction — it has not entered the facts lane. It should be used as a pinned fixture.)

### 6.2 A Singapore invoice with bare numerals

Prints `S$`/`SGD` → verdict `foreign`, abstain → typed SGD stands → refused (**wall: the foreign
vocabulary**). Prints no currency vocabulary → `absent`, abstain → typed SGD stands → refused
(**wall: abstention is not a reading**). Prints `RM` *and* `S$` → `ambiguous` → refused (**wall:
§6.1**).

**The residual:** a Singapore invoice printing an `RM` conversion, *no* `S$`/`SGD` token
anywhere, **and** typed `MYR` by Azure. Both readers then agree on MYR and it is treated as
Malaysian. There is **no wall** — it requires the vendor's model and the document's face to be
wrong in the same direction, and no evidence available to a deterministic reader distinguishes
it. This is the honest residual of the whole design. Mitigating context, not a wall: such a
document still clears counterparty resolution and human approval before any posting.

### 6.3 A USD invoice from a Malaysian vendor

Covered by §6.1 when the document prints its USD; the SST-registration signal is *excluded* from
the accept vocabulary precisely so "the vendor is Malaysian" can never imply "the invoice is in
ringgit" (§2). **Residual:** a Malaysian vendor invoicing in USD printing neither symbol nor
code, with Azure typing MYR — same shape as §6.2's residual, same absence of a wall.

### 6.4 Vocabulary false positives — measured

`94a0fd0d` (`BUSYSTREET - Cost of Good Sold Invoice`) matched a foreign-currency probe on:

> `pages.1.lines.51` → `- Risk Management/Internal Audit`

`AUD` inside **"Audit"** (a second hit came from the same phrase in `tables.2.cells.23`). This
was a real false positive in this design's own measurement pass, and it names a load-bearing
rule: **the foreign vocabulary must be ASCII-word-boundary-exact**, in the spirit of X2's
`IDENTIFIER_WORDS` guard (`invoice-totals-reader.mjs:169`), which exists for exactly this class
of error. Today the damage is bounded — a false `ambiguous` makes the reader abstain, the typed
`MYR` stands, nothing changes — but it becomes a live regression the moment currency agreement
is required for corroboration (O3). Pin `94a0fd0d` as a fixture.

Symmetrically the *accept* vocabulary must not be loose: `RM` is a common abbreviation (room,
remark) and must require a boundary and preferably an adjacent amount or a recognised phrase.
X2's asymmetry applies here **inverted**: for X2 refusal triggers normalize wide and accept
triggers stay strict; here the *foreign* vocabulary is the refusal trigger (widen it) and the
*MYR* vocabulary is the accept trigger (keep it strict). Backwards is how a "Ruang RM" free-text
line becomes a currency reading.

### 6.5 The XML lane

`001f62fa` / `myinvois-sample-sg0006.xml` is typed SGD and is **correct** — a Gate-S synthetic
deliberately exercising the non-MYR path, on a different normalization (`clara-myinvois-norm:v1`)
and engine. The reader is scoped to the Azure OCR mapper only. **Claim to prove, not assume: the
XML tier stays byte-identical** (the XG4 precedent).

## 7. Q6 — Gate-P impact, and two premise corrections

### 7.1 The fix unblocks human coding, and adds nothing to the corroboration set

The finding most likely to change what gets scheduled, so it is stated bluntly.

> `select ccy, count(*), count(*) filter (where net.outcome='typed_collapsed' and tax.outcome='typed_collapsed') …`

| typed currency | docs | **net+tax two-reader agreement** |
|---|---|---|
| MYR | 38 | **8** (the EZSEC family) |
| USD | 6 | **0** |
| EUR | 1 | **0** |

**All 7 mis-typed documents produce no `total_excl_tax` and no `tax_total` reading at all** —
their `totals_reader` field outcomes are empty. Fixing their currency therefore moves them from
*"terminally refused"* to *"a human can code them"*, and moves **zero** documents into the
corroborated / auto-postable set. Both halves of that sentence matter: the first is a real
unblock of real client work; the second means **this defect is not what stands between the
project and Gate P**, and scheduling it as the Gate-P unblocker would be a misallocation.

### 7.2 Premise correction — the "12 Bee SST receipt vehicles"

The work order states that 12 Bee-bundle SST receipt vehicles became reachable when 0025 opened
the receipt kind-gate and that coding dies on the currency mistyping. Measured, that is not the
live situation:

- **Exactly one** `receipt`-kind document exists in the entire corpus: `2684d237` /
  `bee-lailoumei-p17.pdf` (the LAI LOU MEI vehicle from XG2). The other 12 are not ingested.
- Its `invoice_facts` task is `failed` with `error_code='skipped_kind'` and **`attempt_count`
  0** — the pre-0025 kind-gate skip.
- 0025 **is** deployed: the live `_enqueue_invoice_facts_core` body reads
  `elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then v_lane:='invoice_facts'`,
  and the skip row is documented as never consuming attempts.

So the receipt lane is blocked by a stale `skipped_kind` task that simply needs re-enqueueing —
**not by the currency defect**, which has never touched this document because it has no
extraction at all. That is a separate, cheaper action with a full 3-attempt budget, and it does
not depend on this design.

### 7.3 What remains for the 3-leg SST close

> `select count(*), count(*) filter (where monetary_cents>0) from … where field_path='invoice.tax_total'`
> → 15 documents carry a tax fact; **6 carry a non-zero one.**

All six non-zero-SST documents are **synthetic MyInvois XML samples**
(`myinvois-sample{,-0002,-0003,-0004,-cn0005,-sg0006}.xml`, 6000 cents each). **Not one real
OCR document in the corpus charges SST** — every EZSEC bill prints `SST Amt @ 6%: 0.00`
(measured verbatim at `616388d4` `pages.1.lines.59-60`).

Gate P therefore remains exactly where XG1's amendment left it: waiting on **the first
genuinely SST-charging real supplier bill** to arrive on the operating runway. After the
currency fix lands, the remaining requirements for the 3-leg close are unchanged — a real bill
with a non-zero stated SST, whose net and tax both reach `typed_collapsed` agreement, whose
component identity ties exactly, and whose `sst_purchase_cost` leg ties to the sen.

### 7.4 The GitHub issue

`gh issue view 24 --repo BELCORT-SDN-BHD/clara` returns *"docs: GATE 3 CLOSED — eval evidence +
beta amendments AB-18..21"* (2026-07-19) — unrelated. "#24" is the **local ledger task**, not a
GitHub issue; no prior measurements exist there. All measurements in this document are
first-capture.

## 8. Falsifiable gates

| gate | claim |
|---|---|
| **CG1** | On a rig fixture built from `39d786a0`'s real OCR lines, the reader returns `myr`; merged against a typed `USD`, **both rows are withdrawn** and the emitted field list contains no `invoice.currency`. |
| **CG2** | On a fixture built from `616388d4` (EZSEC, `RINGGIT MALAYSIA`, no `RM` token), the reader returns `myr`, agrees with typed `MYR`, the typed row is **kept**, and `typed_collapsed` is stamped. The 8-document corroboration-capable set is unchanged. |
| **CG3** | On a fixture built from `0cb7c1f1` (`$21.60 USD` + `(RM6.61)`), the verdict is **`ambiguous`**, the reader emits nothing, and the typed `USD` survives to a CLR21 refusal. |
| **CG4** | On `94a0fd0d`'s `Internal Audit` line the foreign vocabulary does **not** match (word-boundary discipline). |
| **CG5** | Live, after v9: re-extract `f3245804` first, then the 6 USD documents. Each yields a v9 extraction whose `invoice.currency` is **absent** and whose every other field is byte-identical to its v7 row. `sum(attempt_count)` reaches 2 of 3 on each — never 3. |
| **CG6** | Zero regression: all 46 pre-existing extractions byte-stable until deliberately re-extracted; the XML tier (`clara-myinvois-norm:v1`, incl. the SGD sample) byte-identical; the 8-document corroborated set unchanged before and after. |
| **CG7** | Live, before and after: `draft_entry` on one re-extracted document no longer raises CLR21 `currency_unsupported` — measured, not inferred. |
| **CG8** | Standing check (not a one-time gate): count documents holding invoice facts whose pages carry **no** MYR vocabulary. Today **0 of 40**. The first non-zero reading is the trigger to revisit O3. |

## 9. Open questions for the owner

**O1 — Should the withdrawal be silent, or a visible review signal?** Recommended as designed:
silent withdrawal, with the disagreement recorded in the envelope's reader receipt
(`typed_disagreement`, plus the citing OCR region for the MYR evidence); the document then
appears in the human lane as an ordinary un-corroborated document. Surfacing "this document's
currency could not be agreed" explicitly is more honest to the bookkeeper but adds a lane.
**Scope impact: low** — it affects whether a human is *told* why the document needs attention.

**O2 — Should `invoice.currency` carry its own evidence polygon?** Today it borrows the total's
box on 46/46 documents (§1.1b). Under this design, on agreement the *typed* row is kept and the
borrowed polygon persists; the reader's true evidence line (e.g. `pages.1.lines.52` → `RINGGIT
MALAYSIA : …`) is recorded only in the envelope receipt. Fixing it properly means overriding the
typed row's geometry on agreement, which breaks the merge's "keep the typed row" symmetry and
changes what a cited currency evidence row *means*. **Scope impact: medium** (region semantics —
the contract's instinct would give it its own block). Recommend deferring, recording the receipt
now so nothing is lost.

**O3 — Should corroboration eventually require currency *agreement*, not just a typed `MYR`?**
Measured, zero outcomes change today (§4), which is why it is not in this design. It becomes
real the first time a document arrives with facts and no page currency vocabulary — CG8 is the
trip-wire. If ruled in it is a corroboration change and ships **alone**, its own micro-migration
with its own adversarial review. **Scope impact: high (a migration).**

**O4 — Re-extraction authority for the 7 documents.** `request_reextraction` is bookkeeper-floor,
human-invoked only (ADR-047 Q4). Seven invocations are needed: one batched ceremony with a single
receipt, or one at a time behind CG5's sequencing? **Scope impact: none on design.**

**O5 — The `bee-lailoumei-p17.pdf` re-enqueue (§7.2)** is separate, cheaper, full-budget, and
independent of this design. Recommend scheduling it on its own — bundling would make this fix
look like the Gate-P unblocker, which §7.1 measured it is not.
