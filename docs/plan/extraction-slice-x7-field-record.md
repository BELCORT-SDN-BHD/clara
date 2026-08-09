# X7 — THE FIELD RECORD: what the live documents taught, after the contract was written

*Split out of `extraction-slice-contract.md` (the repo's 500-line limit) on the seam that was
always there: that file is the CONTRACT — what X7 promises and why — while everything below is
what happened when the promise met the two real KONG CHENG invoices. The contract's X7 block
links here; the rulings themselves stay there.*

---

### X7 — THE A1 FIELD TEST: F7 REOPENED, AND WHAT IT COST *(2026-08-09)*

**v10 shipped and did not work.** Both KONG CHENG documents re-extracted cleanly (version_n 2,
supersede + repoint correct) and `invoice.contact_person = "Lim Xiao Shan"` was emitted correctly
— but `invoice.customer_name` came back **byte-identical to v1**, still the person. The live
receipts named the mechanism in counters: `split_line_scanned: 0` with **every refusal head at
zero**. The reader had not refused the company; **it had never generated it as a candidate.**

| what was believed | what the capture measured |
|---|---|
| the fix would fire once the walls admitted the buyer | **the buyer was never enumerated** — party generation hung off a bill-to LABEL, and these invoices **print none** |
| the walls "would admit line 7 instantly" | the `closer_to_vendor` wall **REFUSED it**: Azure typed `VendorName` onto the top-left **LOGO** (`M\nROME\nSECRETARY`), which sits **0.334in** above the buyer while the buyer's own typed anchor is **0.736in** below |
| proximity could be repaired into a discriminator | **it cannot.** The battery's own wrong-party cell is the SAME SHAPE (0.91 / 0.95) and the candidate that must be ADMITTED is the more vendor-ward of the two — no threshold separates them in the right direction |

**The two repairs.** (1) **Generation** reaches a geometry-anchored population on label-less pages
(`invoice-anchor-sweep.mjs`), behind the unchanged wall set — measured on the real capture,
**exactly one** line within the gate clears the entity-suffix wall on each document, so
uniqueness-or-nothing holds with room. (2) **The vendor term became IDENTITY, not proximity:**
`in_vendor_block` (the candidate intersects the typed VendorName region) and `is_vendor_name` (its
party key equals the typed VendorName's). Both **refuse only** — review law 3 says a name is a
projection, so it may never admit — and a false match costs an abstain.

**Ruling 2 — the twice-emission was itself a defect.** v10 shipped the same human twice: honestly
as `contact_person`, and again as a confident `customer_name`. When the reader positively read the
typed value AS its own accepted contact and no party is reachable, the typed row is now
**withdrawn** (`typed_withdrawn_attn`) and the lane holds on `customer_name_missing` — the FINCARE
shape, where a human already looks.

**What the corpus paid.** Twelve battery cells changed expectation; **none** was a weakening. Ten
asserted the person *standing* as `customer_name` — precisely the twice-emission — and now assert
its withdrawal, a strictly stronger claim. One is the wrong-party cell above, rewritten around
identity, with a new assertion that the sweep never runs on a labelled page. One now reads the
real buyer where it used to read the person. **The A1 gate** (`x7-real-capture.test.mjs`) is the
crown cell and asserts `customer_name = "KONG CHENG RESTAURANTS SDN BHD"` through the full
`normalizeAzureInvoice` on both real documents.

**The standing lesson, for the batch ADR.** Ninety-six synthetic cells were green while the
product was broken on the only two documents it existed to fix, because **the corpus was authored
by the same reasoning that authored the reader** — it could only confirm that reasoning. Six review
rounds hardened the WALLS; none of them asked whether GENERATION could reach the document. *A wall
that never refused anything is not a wall that held — it is a wall that was never asked.*

### X7 — PR #220 REVIEW: TWO WRONG-PARTY PATHS, CLOSED *(Codex C1/C2, both CONFIRMED)*

Broadening generation exposed **two walls that were narrower than the class they named**. Both
were reproduced before anything was changed; both repairs are **refuse-only**, so an over-refusal
abstains visibly on a counted head instead of manufacturing a party.

**C1 — SELLER CAPTIONS pass the name gate.** `Seller ACME SDN BHD`, `Vendor ACME SDN BHD`,
`Sold By ACME SDN BHD`, `Supplier …`, `Issued By …` all emitted as `customer_name` with
`attn_overridden`. **Wider than the finding stated:** the review attributed it to the anchor
sweep; re-measured, the same forms leaked through the **same-line and split-value LABEL seams**
too, so the gap **predates the sweep** — which merely opened a third door onto it. The five
captions therefore join `NON_ADDRESSEE_MARKERS` (**eleven → sixteen**), the one gate both
polarities share, closing all three surfaces at once. The three noun captions are `^`-anchored so
`PREFERRED VENDOR SOLUTIONS SDN BHD` keeps its candidacy; the two by-phrases are not, matching the
`\bmanaged by\b` entries beside them. **`From …` was ALREADY closed** by `STOPWORD_OPENERS` — the
one form of the six that held — and a cell now pins that mechanism so a stopword edit cannot
silently reopen it.

**C2 — exact vendor-name equality misses the shape Azure actually produces.** Typed
`VendorName="A\nACME"` with a nearby `ACME SDN BHD` emitted **the seller** as the customer.
**Say it plainly: the real fixture was safe only by luck** — ROME SECRETARY's full seller line
happens to sit 2.205in from the customer anchor, outside the 1.0in radius. A slightly taller
header would have emitted the seller. The **SUBSET-NO-REMAINDER** rule makes that accident a
design: refuse when every distinguishing token of the candidate (suffix stripped) already appears
in the typed vendor's.

| calibration point | tokens | result |
|---|---|---|
| partial logo | candidate `{acme}` ⊆ vendor `{a, acme}` | **REFUSE** — the `a` is a logo fragment, not a distinction |
| franchise / branch | candidate `{rome, secretary, penang}` ⊄ vendor `{rome, secretary}` | **ADMIT** — `penang` says it is a different legal person |
| real-capture mirror | candidate `{rome, secretary}` ⊆ vendor `{m, rome, secretary}` | **REFUSE** — the radius's accidental protection, now designed |
| the real buyer | candidate `{kong, cheng, restaurants}` ⊄ vendor `{m, rome, secretary}` | **ADMIT** — the crown cell is untouched |

Stated "either direction with no remainder", the rule **collapses to one direction**: vendor ⊆
candidate with no remainder means the sets are equal, which candidate ⊆ vendor already covers.
Remainder on the **vendor** side is OCR noise; remainder on the **candidate** side is a
distinction. **NAMED RESIDUAL, eyes-open:** a buyer whose name is a strict subset of the seller's
(`ACME SDN BHD` billed by `ACME HOLDINGS SDN BHD`) is refused and the lane HOLDS — an
over-refusal, pinned as its own cell, visible on `is_vendor_name`.

**Codex's clean list was re-verified after both widenings and is intact:** the label gate
(`anchor_sweep_ran=0` on a labelled page), shared-name admissibility (group / branch / trading /
franchise all still ADMIT), the walls on known classes, `typed_withdrawn_attn` in both directions,
and the twelve changed-expectation cells unweakened. The declared residual-5 forms remain **open
as declared** — the repair closed a class, it did not quietly close the acknowledged one.

### X7 — THE COMPARISON-FOLD ROUND *(Codex re-verify on `2eac8d1`; N1 HIGH, N2, N3)*

The re-verify confirmed both original findings closed — with a **historical replay** that
independently proved the C1 scope correction: `origin/main` leaked **10** caption/label
combinations, `HEAD^` leaked **15** across three surfaces, `HEAD` leaked **0/15**. It also
measured the real seller lines at **2.204937in / 2.204714in** from the customer anchor, confirming
their prior safety came only from the 1.0in radius.

**N1 (HIGH) — token segmentation defeated subset identity.** Typed `A\nC\nM\nE` or `A.C.M.E.`
against a candidate `ACME SDN BHD` emitted **the seller** as the customer on all three surfaces
with `is_vendor_name=0`, as did line-split CJK `鑫\n旺` vs `鑫旺 SDN BHD`. The comparison held
`{a,c,m,e}` against `{acme}` and saw two companies.

The repair is **fragment joining in the comparison fold** — a maximal run of **two or more**
single-glyph tokens becomes one token. **The run-of-two bound is load-bearing:** join a run of ONE
forward and both live calibration points invert (`A\nACME` → `{a,acme}` and `M\nROME\nSECRETARY` →
`{m,rome,secretary}` are precisely the subsets the rule must keep). Both directions are covered —
OCR splits a page line as readily as Azure splits the typed field.

**Why the existing P.L.T. run-join regex was not simply reused, measured rather than assumed:** it
is built on `\b`, and JavaScript's `\b` is defined by ASCII `\w`. It folds `a c m e` → `acme`
correctly and leaves `鑫 旺` **unjoined** — which is exactly how the CJK seller walked through. The
replacement counts codepoints over a token run, where Unicode cannot silently opt out.

**N2 — the two undeclared safe-holds, now declared.** Vendor identity refuses `A/B TRADING` vs
`A-B TRADING`, and `ACME SDN BHD` vs `ACME BERHAD`. That is **coarser than the party-identity
contract on purpose**, and the reason is that the two folds fail in opposite directions:

| fold | decides | a false MERGE is | so it must be |
|---|---|---|---|
| `partyKey` (admission / contest) | do two readings CONTEST? | **wrong-silent** — a lawful contest suppressed | **FINE**: `A/B` ≠ `A-B`, `SDN BHD` ≠ `BERHAD` |
| `identityComparisonTokens` (refusal) | is this candidate the SELLER? | a **visible HOLD** on `is_vendor_name` | **COARSE**: every spelling of the seller must land together |

*Admission narrows; comparison merges.* The three named safe-holds — **(a)** strict subset
(`ACME SDN BHD` billed by `ACME HOLDINGS SDN BHD`), **(b)** punctuation class, **(c)** legal suffix
— are all over-refusals that hold visibly. The alternative to (b) and (c) is a fold fine enough to
let the seller's other lawful spelling be read as the buyer, and **a wrong counterparty on real
books outranks a hold, every time.** A cell asserts the divergence **both ways**, because the claim
is the divergence itself: proving one half would prove nothing about the law.

**N3** — the sweep header named only `in_vendor_block` as its live refusal; `is_vendor_name` fires
there too. Corrected.
