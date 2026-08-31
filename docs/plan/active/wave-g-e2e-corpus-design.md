# Wave G — the factory-reset E2E corpus: the design, and the sitting's rulings

> **THE SITTING HAPPENED — 2026-08-20, ADR-0072 ⑤. This file is the corpus's CONTRACT OF
> RECORD** for what was ruled: the **two-tier reshape** (§3.0), **all eleven OD points** (§10),
> and **§5's step-4 amendment**. It was authored 2026-08-16 as a design *for* that sitting, and
> its unruled analysis still reads as a design — where the two differ, **§3.0 and §10 govern**,
> and superseded prose is marked in place rather than deleted so the reasoning survives.
>
> **No number on this page is invented.** Figures are either recorded in this repo with a cite,
> or transcribed from the printed face of an owner-supplied document (those live in the
> companion, `wave-g-corpus-oracle-assessment.md`). **The acceptance bar for each client comes
> from the owner, never from here** (`docs/product/PRD.md` §6.1: the DB owns every authoritative
> number; no model-generated numeral enters a durable artifact unless a versioned deterministic
> evaluator reproduces it from DB-owned inputs).

## 1. Purpose, and the ruling this implements

`docs/plan/active/roadmap.md` has carried one line for Wave G's close-out since 2026-08-11:
*"the factory reset + full E2E rebuild from raw documents — the definitive stuck-bytes
discharge."* On **2026-08-16** the owner ruled two things that turn that line into a program:

1. **The BEE FY2025 close defers wholesale to this reset** (`PROGRESS.md` → Next item 2). The
   live-fire sitting refused to seal a knowingly-false loss on a real client under hard
   constraint 1; the owner's desk management accounts are the rebuild's acceptance bar —
   **FY2025 SALES RM 68,640.00 · net PROFIT RM 47,245.65 · capital B/F (65,747.97)**. The book
   must tie to those before its close seals.
2. **The reset+E2E is WHOLE-PRODUCT, and BEE alone is too thin.** The corpus therefore grows by
   additional real clients at ROME PROPERTIES rigor, split between green-field and brown-field
   onboarding. *(Superseded in shape by §3.0: the "3–4 additional clients, each with a full
   TB/GL/BS/P&L handover and **two consecutive FY closes**" formulation did not survive contact
   with the papers — two consecutive complete FYs exist for exactly one client. The **intent**
   — whole-product, more than BEE, at RPR rigor — stands and is what the two tiers deliver.)*

This document designs that corpus. It **extends** E-R9's acceptance-corpus map
(`docs/plan/active/wave-e-contract.md` §E-R9) rather than replacing it — that table is a
closed-wave record, cite-only. BEE's E-R9 row ("first REAL close") is unchanged in substance
and simply now runs *inside* the reset. RPR's historical MPERS pack and RS's snapshot witness
stay exactly where E-R9 put them.

**Why two consecutive FYs matter.** One close proves a close. Two consecutive closes are the
only shape that exercises four things Wave E built and has never run: B3's reopen segregation
(`0085`/`0086`), cross-year carry-down (FA continuity + the retained-earnings roll), the `0057`
snapshot sequence across a year boundary, and a pack whose FY2 comparatives come from FY1's
sealed receipt. **BEE carries all four** — it is the only slot that can (§3.0).

## 2. Product-scope honesty — say this first at the sitting

Before slot names are chosen, the sitting should agree out loud on what Clara fits **today**,
because the corpus must not be built out of clients the product cannot honestly serve:

| | Today's fit | Roadmap |
|---|---|---|
| Entity | **Sole proprietorship · Sdn Bhd** | LLP (profiles are data, not code — but unproven) |
| Framework | **MPERS, SME scale** | MFRS |
| Currency | **MYR only** | FX-lite is a Wave-F planning decision (`docs/plan/active/roadmap.md` §Wave F) |
| Tax | SST **watch** (advisory screening only) | the SST engine + tax computation are Wave F |
| Payroll | **a document flow** — payslip/statutory summary → JV | a payroll *engine* is a separate future module, not Wave G |

A client that needs MFRS, a second currency, or an LLP profile is **not** a corpus candidate.
That is the honest boundary, and stating it is cheaper than discovering it at close.

## 3. Corpus composition — the slot matrix

**Slot names are placeholders.** No real client is named here except the three already in the
repo (hard constraint 13's four-firms law: BELCORT is the real firm — ROME PROPERTIES · ROME
SECRETARY · BEE CREATIVE SOLUTION; ROME PUBLIC ADVISORY is the synthetic sandbox; Alara and
Borneo are slice-era RLS fixtures; none is ever repurposed).

> **OD-1 — RULED 2026-08-20 (ADR-0072 ⑤), and the whole section is RESHAPED with it.**
> See **§3.0 below**: the corpus is **two tiers**, the oracle tier is **BEE + ROME SECRETARY +
> ROME PROPERTIES**, and the two-consecutive-FYs requirement **does not survive contact with
> the papers**. The slot table below is kept as the design's original diversity reasoning —
> **it is superseded on identities and FY pairs, and stands on axes and volume shapes.**
> All inductions are under **BELCORT**, as the build's reading took.

## 3.0 THE TWO-TIER RESHAPE (ruled 2026-08-20, ADR-0072 ⑤)

**The single-tier premise failed on the evidence, and the sitting ruled the shape rather than
the wish.** A read-only assessment of the owner's three designated folders found that **two
consecutive FYs of complete papers exist for exactly ONE client**, and that the other two are
**terminal-period books for companies in strike-off** — their own general ledgers carry the
strike-off fees, and both companies' bank accounts are deliberately run down to `0.00`. Neither
can ever supply a second consecutive FY. Requiring one would be requiring a period that will
not exist.

| Tier | What it is | Who is in it | What it must satisfy |
|---|---|---|---|
| **ORACLE** | the acceptance bar — books that must tie, to the sen, against the owner's own documents | **BEE** (two FYs) · **ROME SECRETARY** (one terminal period) · **ROME PROPERTIES** (one terminal period) | §4's seven-item package, per client per period. Gaps are named in §3.1, marked **资料缺失** and never awaited per 裁-63; the run proceeds as-is. |
| **REALITY** | **open intake** — real papers that exercise the product without carrying an acceptance figure | open; the owner adds slots as papers arrive | nothing. A slot may prove a MECHANISM without being an oracle |

**Why the second tier exists at all, said plainly:** without it, a rich fixture gets
manufactured into a thin oracle to satisfy a table, and the acceptance number stops meaning
anything. Naming the two roles separately is what stops that.

**Consequences of the reshape, each ruled:**

- **RS and RPR are SINGLE-FY, P&L-anchored oracles.** Their balance sheets are degenerate by
  construction (both print only share capital and this-year loss, no assets and no liabilities,
  because the companies are being wound down), so the P&L and the GL carry the tie-out and the
  SOFP does not.
- **A NEW TEST CLASS enters the corpus: the strike-off / terminal period** (§8, EC-14). It is
  not a defect in the papers — it is a *different* test point from an ongoing close, and the
  product will meet it again.
- **RPR is an EXCELLENT payroll and volume fixture and a POOR acceptance oracle**, and the two
  judgements are recorded separately rather than averaged.

| Slot | Entity | Onboarding path | FY pair | Primary diversity axis | Volume shape |
|---|---|---|---|---|---|
| **BEE** (inducted) | sole prop | **brown-field** — an opening seed exists (ADR-043, live-confirmed 2026-08-20) | **FY2024 + FY2025** *(CORRECTED 2026-08-20: the papers' own faces read "year ended 31 December 2024" and "…2025". The earlier FY2025+FY2026 pairing named a year with no papers.)* | negative-equity sole prop; the recorded golden bar | low doc count, high per-doc stakes |
| **CLIENT-SST-1** | Sdn Bhd | **brown-field** — opening TB + GL handover | two consecutive, both beginning < 2027-01-01 | **SST-registered** (service tax) | medium |
| **CLIENT-PAY-1** | Sdn Bhd | **green-field** — interview → books | two consecutive | **payroll-heavy** (document→JV flow) | medium-high, monthly cadence |
| **CLIENT-BANK-1** | Sdn Bhd or sole prop | **brown-field** — opening TB **carrying fixed assets** | two consecutive | **bank volume** (reconciliation) | **high** statement-line count |
| **CLIENT-SP-2** *(the fourth, optional)* | sole prop | **green-field**, ideally a **mid-year** commencement | two consecutive | second sole-prop shape; mid-year onboarding | low |

**Diversity coverage check** (the owner's requirements, mapped):

- SST-registered ⇒ CLIENT-SST-1 · payroll-heavy ⇒ CLIENT-PAY-1 · bank volume ⇒ CLIENT-BANK-1
- entity mix ⇒ 2–3 sole props (BEE, CLIENT-SP-2, possibly CLIENT-BANK-1) + 2–3 Sdn Bhd
- green-field ⇒ CLIENT-PAY-1, CLIENT-SP-2 · brown-field ⇒ BEE, CLIENT-SST-1, CLIENT-BANK-1
- **MPERS revision:** every FY pair sits on **revision 1**. Revision 2 opens for periods
  beginning **2027-01-01** and is its **own** test point (§8, EC-9) — never folded into a
  client's acceptance run.

> **P-1 (PROPOSAL) — put the fixed assets on the bank-volume slot, not a fifth client.**
> `PROGRESS.md` carries a standing deferral: *FA carry-down's first real firing needs a client
> with assets at opening.* Requiring that slot's opening TB to carry a depreciable register
> discharges the debt inside an existing slot. **Recommendation: adopt.** *(BEE also satisfies
> it — its FY2025 `OFFICE EQUIPMENT 5,092.70` would carry down into a later year.)*

> **P-2 (PROPOSAL) — carry redundancy, not exactly-enough.** A slot that turns out to have
> incomplete papers collapses an axis mid-run. **Recommendation: hold a relief slot.** *(The
> risk this priced is exactly what materialised — see §3.0; the reality tier is the answer.)*

> **OD-2 — DEFAULTED 2026-08-20 to the recommendation** (ADR-0072 ⑤; the owner may re-open).
> A goods-trading slot would discharge two named debts at once (WD-R11's real closing-stock
> acceptance, and Gate P's first native SST-stated supplier bill), but it carries a **hard build
> dependency**: the `closing_stock` producer verb does not exist, and drawer 2's
> `closing_stock_present` gate applies to `goods_trading` clients. **NOT in the first pass** —
> build the verb in a fix queue, add the slot after.

## 4. The golden-standard package — what the owner hands over

"ROME PROPERTIES rigor" has a concrete meaning in this repo: at B-12, RPR was reconciled
account-by-account against a **certified trial balance** and the **client's own GL**, to the
sen, with each remaining difference named as a specific missing document
(`docs/plan/research/wave-b/live-gate-b12-rpr-2026-07-26.md`). That is the bar.

**Per client, per FY, the owner's desk supplies:**

| # | Artifact | Why the run cannot proceed without it |
|---|---|---|
| 1 | **Trial balance**, per account, to the sen, at FY end | the tie-out oracle; also the brown-field opening seed's target |
| 2 | **General ledger**, per account, every posting with its date | the only way to reconcile *by account across all dates* (§8, EC-1) |
| 3 | **Statement of financial position** | the FS-layer oracle for the statutory pack |
| 4 | **Statement of comprehensive income (P&L)** | ditto; carries the profit figure the close's RE roll must reproduce |
| 5 | **The desk source of record** — which system produced 1–4, who certified them, and when | evidence law 3: spelling is not identity. A figure without a named producer is not a golden standard |
| 6 | **The raw document corpus** for the FY — every bill, invoice, receipt, bank statement, payroll summary, journal voucher | the E2E rebuild is *from raw documents*; a gap here becomes an unexplainable tie-out difference |
| 7 | **Opening TB** (brown-field slots only), at FY1 start | `create_opening_seed` → `draft_opening_item` → `approve_opening_seed`, tie asserted by `_assert_opening_tie` |

> **OD-3 (OWNER DECISION) — the acceptance-bar figures, per client per FY.** These are the
> numbers the book must tie to before its close seals. **Only BEE's are recorded today**
> (FY2025 sales RM 68,640.00 / profit RM 47,245.65 / capital B/F (65,747.97) — `PROGRESS.md`).
> Every other slot's bar arrives with items 1–4 above. The build never proposes one.
> **STILL OPEN after the 2026-08-20 sitting**, for every slot but BEE.

### 4.1 The oracle verdicts, the gaps, and the fixture sets — **`wave-g-corpus-oracle-assessment.md`**

**A read-only assessment of the owner's three designated folders (2026-08-20) is the companion
file of record**, split out under the 500-line limit. It holds the per-client verdicts against
this section's seven-item package, **the named gaps recorded as 资料缺失 and never awaited per
裁-63**, the corpus exclusions and fixture sets, the classes that will exercise OCR hardest,
and the personal-data inventory behind OD-4. Every figure in it was transcribed from a printed
face; none was computed or inferred.

**The four things this section needs a reader to carry away without opening it:**

- **The verdicts.** BEE **ACCEPTABLE-WITH-GAPS** and the strongest of the three · ROME SECRETARY
  **ACCEPTABLE-WITH-GAPS, one period only** · ROME PROPERTIES **INSUFFICIENT as an oracle**,
  though the best payroll and volume fixture in the corpus.
- **The recorded gaps.** BEE has **no GL and no TB for either FY**; RPR is missing **Feb and
  Mar 2025** bank statements and has **no accounts at a period end**; **neither RS nor RPR names
  a producer or certifier**. **TRUED 2026-08-31 by 裁-31/裁-63:** these gaps are CLOSED as
  acceptance blockers — marked **资料缺失**, never awaited; MBB-1 is CLOSED. The desktop-corpus run
  proceeds as-is and records the conductor/agent's measured RPR-series choice. See
  `docs/ops/wave-g-setup-checklist.md`.
- **BEE's bar is CONFIRMED against the client's own papers**, and its bank statements tie to
  both balance sheets **to the sen** across the FY boundary — the strongest independent
  corroboration anywhere in the three folders.
- **RS and RPR are genuinely GREENFIELD** — every GL account opens at a printed `0.00`, so no
  opening seed is required and item 7 does not apply to them.
<a id="rpa-collision"></a>

> **The RPA NAME COLLISION — raised, and DISSOLVED by ADR-0072 ⑤.** `ROME PUBLIC ADVISORY
> SDN BHD` is a **real entity in these papers**: it certifies BEE's FY2024 accounts and is a
> supplier in both other clients' books (16 accounting-fee invoices across RS and RPR). In the
> repo, hard constraint 13 designates ROME PUBLIC ADVISORY as the **synthetic sandbox tenant**.
> The names are identical — a "spelling is not identity" trap sitting directly on a hard
> constraint. **It dissolves rather than needing a rule to police it:** ADR-0072 ⑤ ruled the
> factory reset a whole clean database with **the sandbox firm NOT re-created**, so after the
> reset the name in this product refers to the real entity and nothing else. Constraint 13's
> four-firms law is unchanged; its sandbox row is emptied, never repurposed.

> **OD-4 — RULED 2026-08-20 (ADR-0072 ⑤): FULL PERMISSION**, with two carve-outs that are part
> of the ruling rather than conditions on it — **the IC copy is EXCLUDED from ingestion
> entirely** (a pure identity document with no accounting content: excluding it costs nothing
> and removes the single highest-sensitivity item), and **the payroll tree is the
> tightest-custody slot**. (a) The **C6 checklist** (DPA · firm-facing disclosure text · PDPA
> cross-border basis) stays OPEN and owner/legal-owned, so **vendor tracing stays OFF for the
> whole run** under PRD §6.16 — no change needed, it already is. (c) The personal-data reality
> is **broader than the one IC image the design anticipated**: identity fields sit in the
> machine-readable text layer of ~32 documents. The inventory, by class and location only, is in
> `wave-g-corpus-oracle-assessment.md` §5.

> **The name-only wall rides along, unchanged:** ROME SECRETARY's customers stay **NAME-ONLY**. The wall is
> structural (`0062`) and lifting it is an OWNER act through the audited door (`0063`). No corpus slot's
> onboarding may enrich an RS customer, and a new client's counterparty that happens to share a name with an RS
> customer is a different row. **[ADR-0075 2026-08-23]** Was "Constraint 12 rides along, unchanged" — constraint 12 is RETIRED as a *named* constraint; the GENERIC wall and both migrations are untouched, so every sentence above still binds.

## 5. The E2E run script, per client

Run identically for every slot; the only branch is step 2. Each step records **what was read,
changed, synced, skipped or blocked** (the Phase-5 discipline, `docs/plan/active/roadmap.md`).

```
 0  RESET          factory reset; confirm the slot's blast radius (OD-6) before the first write
 1  INDUCT         firm setup -> client onboarding interview -> chart of accounts
 2a GREEN-FIELD    no opening seed. FY1 starts from the entity's own commencement.
 2b BROWN-FIELD    create_opening_seed -> draft_opening_item (xN) -> approve_opening_seed
                   _assert_opening_tie must TIE to the owner's opening TB, to the sen
 3  INGEST FY1     upload every FY1 document -> classify (>=0.8 writes kind, else a human
                   question) -> FILE to the client -> extract. Bank statements load here.
 4  CODE FY1       the agent READS, DECIDES and POSTS on her own judgement (F-A2); what
                   cannot lawfully post lands as a draft or a typed open question, and a
                   human approves those. NO standing rules, no third-approval ramp.
                   Bank: match -> reconcile -> except. Payroll documents become JVs
                   through the document flow, not an engine.
 5  SNAPSHOTS      mint_month_snapshot for each completed month, in order; watch the
                   staleness label move when a later post lands in a snapshotted month
 6  CLOSE FY1      open_fiscal_year -> begin_close -> get_close_plan (3 drawers)
                   drawer 1 must be CLEARED, never overridden (no attestation path exists)
                   drawer 2 exceptions attested one by one, each with its reason
                   finalize_close -> the receipt (the pin FY2 will read)
 7  PACK FY1       report spec -> deterministic evaluator -> claim gate -> render -> SEAL
                   verify byte-reproduction of the sealed artifact
 8  CARRY-DOWN     FY2 opening derives from FY1's receipt: the FA continuity roll (closing
                   NBV -> opening) and the RE roll. Never re-derived from the ledger.
 9  FY2            repeat 3 -> 7 for FY2. FY2's pack carries FY1 comparatives from the seal.
10  REOPEN DRILL   ONE designated client only (OD-5). See below.
11  TIE-OUT        by account, ACROSS ALL DATES, against the owner's TB/GL/BS/P&L per FY
```

> **STEP-4 AMENDMENT (2026-08-20, ADR-0072; the G1 alignment ADR-0071 flagged).** Step 4 used
> to read *"Standing rules earn autopost after the third approval."* **That wording is dead.**
> Digest law 71 makes the agent's own judgement the unattended posting authority, and law 73
> retires the rules machine's execution tier — so there is no rule to earn anything, and the
> third-approval ramp is exactly the "ramp" ADR-0071/G1.3 refused. The corpus run must exercise
> **F-A2's agent judgement**, gated by the witness pair and the rung ladder, not a rules engine
> that will not exist by the time this script runs. The amendment matters more than a wording
> nit: this is the script the corpus is actually executed from, so a stale line here would have
> been executed rather than merely read.

**The reopen drill (step 10), on one client:** reopen FY1 after FY2 is open. Prove the
`ends_on`-dated formal prior-period adjustment (ADR-068 ruling 1, live since the B3 ceremony
— `docs/plan/completed/b3-reopen-ceremony-asrun.md`), the segregation determination on the
receipt, the re-close, and — the part only a two-FY corpus can prove — that **FY2's opening is
re-derived from the corrected FY1 receipt and not double-counted**.

> **OD-5 — RULED 2026-08-20 (ADR-0072 ⑤): NO second principal is provisioned.** B3's wall
> requires **reopener ≠ closer where ≥2 principals are eligible**; with one eligible approver it
> takes the recorded-attestation path (which is why BELCORT's first BEE approval was refused
> `CLR05 · SELF_ATTESTATION` and released only by a typed attestation). *The build recommended
> provisioning a second principal so both arms fire; **DECLINED**.* **The solo-attestation arm
> IS the product path** for a one-approver firm, so exercising it on real books is the honest
> test rather than a workaround. **The cost is accepted and recorded, never hidden: B3's
> `distinct_checker` primary arm stays rig-proven only and ships UNEXERCISED on real books**,
> named by that word in the acceptance record under §7.4's own rule. WB-R22's scoped
> review-attestation capability is now the only route by which it ever gets exercised.

> **OD-6 — the reset's blast radius.
> RULED TOGETHER WITH OD-10, 2026-08-20 (ADR-0072 ⑤): a WHOLE CLEAN PRODUCT DATABASE, ON THE
> LIVE PROJECT.** The reset is **not** a scoped deletion with a survivor list — it is a **"new
> unboxed product"**. **Nothing on the old survivor list is preserved:** not ROME SECRETARY's
> book, not ROME PROPERTIES' approved entries, not BEE's existing keyed opening seed, **and not
> the synthetic sandbox firm or the slice-era fixtures, which are NOT re-created after the
> reset.** The one carve-out is hard constraint 15's: **the spike schemas survive the reset
> until their own DROP** (ADR-0072 ①.4, after a cold archive is taken first).
>
> **Why the live project, with the cost stated rather than assumed away:** the reset *is* the
> discharge Wave G exists to prove — running the corpus anywhere else proves the product while
> never proving the reset, leaving the stuck-bytes claim exactly as untested as today. **There
> is no undo.** The ruling was taken with that priced in; `docs/ops/DR.md`'s backup discipline
> is the standing mitigation and a full backup precedes the reset.
>
> **Two consequences worth carrying.** The opening-seed registry is one-shot per client
> (`uq_opening_seed_registry_once`) and both real clients' slots are spent — **a reset frees
> them**, the only way a document-tied carry-down could ever be proven on a real client. And
> **the RPA name collision dissolves** (§4.1's note): with the sandbox firm not re-created, the
> name returns to the real entity it denotes in the client papers.

## 6. What each slot uniquely proves

The rule this table enforces: **no mechanism ships on the strength of a slot that could not
have failed it.**

| Mechanism (and where it lives) | Slot that proves it | The proof |
|---|---|---|
| **B3 reopen segregation** (`0085`/`0086`) | the OD-5 designate | **the sole-attested arm fires; `distinct_checker` is NAMED unexercised** (OD-5 ruled no second principal) |
| **Greenfield induction from documented zero** *(2026-08-20)* | **ROME SECRETARY** | 13/13 GL accounts open at a printed `0.00`; a real first period with a GL-verified document set |
| **The strike-off / terminal period** (EC-14) *(2026-08-20)* | **RS + RPR** | a nil balance sheet recorded as measured-and-nil, never as unmeasured; the tie-out anchors on the P&L and GL |
| **FA carry-down / continuity roll** (WD-R14's standing deferral) | CLIENT-BANK-1 (per P-1) | assets exist at FY1 opening; closing NBV rolls to FY2 opening; a reducing-balance asset among them |
| **RE roll + the close's P&L transfer** | every slot | FY2 opening equity reproduces FY1's profit figure from the owner's P&L |
| **`0057` period-snapshot sequence** | CLIENT-PAY-1 (monthly cadence) | 24 months minted in order across an FY boundary; staleness fires on a late post |
| **Statutory packs, per FY** | CLIENT-SST-1 + BEE | **en** and **zh** are issuable (mpers_company rev 1, 5/5 each — the #43 ceremony); **ms is gated at 4/5** and MUST be attempted once as a deliberate negative control (§7.4) |
| **SST turnover / registration watch** | CLIENT-SST-1 | requires the `closing_transfer` fix — see OD-7 |
| **Payroll as a document flow** | CLIENT-PAY-1 | payslip / statutory summary → filed → coded → JV, with no engine in the path |
| **Bank reconciliation at volume** | CLIENT-BANK-1 | statements for every month, matched; exceptions raised and resolved; the drawer-1 identity actually evaluated |
| **Brown-field opening seed + tie** | BEE, CLIENT-SST-1, CLIENT-BANK-1 | `_assert_opening_tie` ties to the owner's opening TB |
| **Green-field interview → books** | CLIENT-PAY-1, CLIENT-SP-2 | a book that never had an opening seed closes correctly |
| **The render/seal round-trip + the DR re-render drill** | the first slot to reach step 7 | closes the boundary `docs/ops/DR-render.md` keeps explicit: no sealed artifact exists yet, so the drill has never run |

> **OD-7 — DISCHARGED 2026-08-20 by ADR-0072 ④.** The registered latent (task #17):
> `finalize_close`'s closing entry is born `is_year_end` with `closing_transfer=false`, and
> approved-row immutability means it can never be marked afterwards — so `0016`'s SST turnover
> exclusion is dead for close-model clients. Blast radius is advisory-only (a missing warning,
> never a wrong book). **R1 is now ruled — a closing transfer is not turnover — so Fix A is
> queued in Track B and task #17 is unblocked.** The gate the question asked about no longer has
> a pending half. Running an SST slot on the known-broken predicate would still produce a corpus
> result nobody can interpret, so the fix lands before any such slot's FY1 close.

> **OD-9 — DEFAULTED 2026-08-20 to the recommendation below** (ADR-0072 ⑤; the owner may
> re-open). `mpers_company` revision 1 ships **en** and **zh** at full 5/5 wording coverage (the
> #43 ceremony); **ms** sits at **4/5** — one clause short, gated closed by design. A corpus that
> only ever issues **en** proves nothing about the claim gate's fail-closed path, so: **en for
> every pack; zh on at least one slot; ms attempted exactly once, on a slot the owner names, and
> it MUST REFUSE — a PASS there is the finding, not the wording.** The cheapest deliberate
> negative control in the whole run (§7.4).

## 7. The vacuous-green lesson, applied

### 7.1 The class

**A gate that passes with nothing in scope is not evidence.** It is the absence of a question.
This is house evidence law 2 (*absence is not evidence*) wearing a green tick, and it is the
single most expensive failure shape this corpus exists to close: the whole point of a
real-books E2E is that the gates get **asked** something.

### 7.2 The two BEE instances, mechanism verified

Both were seen at the 2026-08-16 live-fire sitting. The counts are the sitting's; the
mechanism below is verified here, at file and line, on `main`'s own bytes.

**(a) The uncoded-documents gate read green with 21/21 filings holding a NULL
`financial_date`.** `clara._close_gate_uncoded` scopes by
`d.financial_date between v_fy.starts_on and v_fy.ends_on`
(`packages/db/migrations/0056_wave_e_close_model.sql:1397`). A NULL never satisfies `between`,
so an unextracted filing is not merely unjudged — it is **invisible to the gate**. The date
scope is correct and deliberate (a next-FY document must not block this year's close; the
build says so at `:1387-1390`). The blind spot is the *undated* document, and the file's own
neighbouring comment already names why this class is permanent: *"the date scope makes the
miss permanent, no later close ever asks about this document again"* (`:1404-1405`).

**(b) The bank gates read green with 0 registered bank accounts, against an opening TB
carrying RM 39,252.03 of bank.** Two separate gates, both vacuous for the same reason:

- Drawer 2's `_close_gate_bank_items` enumerates statement gaps only *"for an account that has
  statements at all"* — `select distinct s.bank_account_id from clara.bank_statements`
  (`:1360-1361`). No statements ⇒ no accounts ⇒ no gaps ⇒ `pass`.
- Drawer 1's `clara.bank_recon_close_state` initialises `v_state := 'tie'` (`:962`) and
  enumerates from the account **registry** (`from clara.bank_accounts ba where ba.client_id =
  p_client …`, `:989-993`). With zero rows the loop body never executes and the function
  returns `tie` — a **drawer-1 PASS with no attestation path needed, because nothing was
  measured.**

The RM 39,252.03 is not a guess: it is BEE's own opening trial balance, account `310-B01 bank
— main operating`, recorded at ADR-043 when Gate K closed.

### 7.3 A third instance, found while writing this — and why it is instructive

Drawer 1's bank enumeration was **already hardened once against exactly this class**. Its
comment at `:969-972` reads: *"Enumerate from the ACCOUNT REGISTRY, never from statements … an
active account with NO statements loaded is a question this gate must ASK — from statements
alone it is never enumerated and the gate answers 'tie' without ever being asked (the ADR-066
lesson)."* The fix was right. **It closed the class one level down and left it open one level
up:** an empty *registry* is still an unasked question, and there is no zero-census branch
between `:962` and the return at `:1025-1027`.

> **P-3 (PROPOSAL) — a registry-vs-ledger cross-check. ADOPTED into the F-T4 fix queue.** A
> client whose trial balance carries a bank-class GL account with a non-zero balance and **zero
> rows in `clara.bank_accounts`** should read `unknown`, not `tie`. One predicate, in drawer 1,
> fail-closed in the direction the drawer already fails — **judgement logic, so it takes its own
> full ladder** (review law 1). The corpus does not depend on it either way.

### 7.4 The rule this corpus adopts

**Every gate must be EXERCISED by at least one corpus slot, in both polarities** — once RED on
a real condition, then cleared; and once GREEN where the green means something. A gate that
only ever reads green across the whole corpus is reported as **UNEXERCISED**, by name, in the
acceptance record — never counted as passed.

Concretely, the corpus owes at least one genuine RED for each of: `unapproved_drafts_in_period`
· `uncoded_documents` (with a **dated** document, and separately with an **undated** one, to
show the two behave differently) · `open_bank_recon_items` · `depreciation_through_fy_end` ·
the drawer-1 AR and AP control ties · the drawer-1 bank identity · the continuity math · the
claim gate (the **ms** pack at 4/5 must be attempted once and must REFUSE — that is the
statutory-wording fail-closed path proving itself, and it is the cheapest deliberate negative
control in the whole run).

## 8. The edge-case lens

A dedicated enumeration, per the PM-rigor law. Each row names what breaks if it is not planned
for; none of them is hypothetical enough to leave to discovery.

| # | Edge case | Why it bites | Handling in the corpus |
|---|---|---|---|
| EC-1 | **Period-bounded tie-out** | B-12: a tie-out filtered to the certified TB's period silently dropped an entry both systems held six days apart, and read a difference as an absence | tie out **by account across all dates**; report date differences as their own finding. Non-negotiable, step 11 |
| EC-2 | **Mid-year onboarding** | an entity that commenced mid-FY has a short first period and no full-year comparative | CLIENT-SP-2 carries it deliberately; RPR is the precedent (first period 10/2–8/12/2025, no comparative) |
| EC-3 | **FY boundary change** | an FYE change makes a short or long period; the snapshot sequence, the pack's period header and the continuity pin all key off `starts_on`/`ends_on` | **OD-8**: does any candidate have one? If yes it is a *feature* of the corpus; if no, record it as unexercised |
| EC-4 | **Dormant period** | a client with no activity in a month, or a whole FY: zero documents, zero postings. Every gate reads green — legitimately | at least one dormant month in one slot, with the green recorded as *knowingly vacuous* under §7.4 rather than as evidence |
| EC-5 | **Negative-equity sole prop** | drawings exceeding profit push a **debit-balance** capital account through the single `retained_earnings` slot | already covered by BEE (ADR-043: drawings 163,495.02 vs profit 53,517.57), and its FY2025 capital B/F is negative |
| EC-6 | **Undated / unextracted document** | §7.2(a): invisible to the uncoded gate, permanently | one undated filing planted in one slot; the close must not silently pass it |
| EC-7 | **Back-dated document arriving after close** | the closed-period wall refuses the write (`CLR19`); the only lawful route is the formal reopen | pair it with the OD-5 reopen drill — one real late document is the cleanest trigger |
| EC-8 | **Cross-FY reversal ordering** | reversing an FY1 entry while FY2 is open must obey the reverse/re-open ordering guard | rides the reopen drill |
| EC-9 | **The MPERS rev-2 2027 boundary** | wording revision 2 is seeded for periods beginning 2027-01-01 (**en** ready; **ms/zh** at 0/5 today) | **its own test point, in the sandbox, not on a real client.** A revision-boundary FY must never be part of an acceptance run whose bar is a real desk figure |
| EC-10 | **Foreign-currency document** | out of scope (§2). The failure mode to avoid is a *silently mis-booked* MYR figure | **NO LONGER HYPOTHETICAL: ~32 USD-denominated BEE purchase invoices exist**, excluded from acceptance and retained as the FX-lite fixture set (assessment §3). Feed them deliberately: each must be **refused or parked**, never coded. Record which happens |
| EC-11 | **Duplicate re-upload** | a benign re-upload once surfaced as a fatal `storage_error` (HTTP 400 wrapping 409) — fixed, `docs/ops/incident-2026-07-26-intake-storage.md` | re-upload one document deliberately per slot; it is free |
| EC-12 | **Maker = checker on a one-approver firm** | `CLR05 · SELF_ATTESTATION` gates approvals, and B3's segregation gates reopens | **RULED by OD-5: no second principal.** The sole-attested arm fires on real books and the distinct-checker arm is recorded UNEXERCISED — the honest outcome, not a workaround |
| EC-13 | **A bank GL balance with no registered bank account** | §7.3 | CLIENT-BANK-1 registers accounts properly; the gap itself is P-3, registered not built |
| **EC-14** | **The STRIKE-OFF / terminal period** *(NEW 2026-08-20 — two of the three oracle clients are one)* | a company being struck off has **no year end and no going concern**: the books stop mid-period, the balance sheet legitimately holds no assets and no liabilities, and the bank accounts are deliberately run to `0.00`. Every close gate, every continuity pin and every comparative assumes an ongoing entity that will have a NEXT period | **a first-class test point, not a defect in the papers.** RS and RPR carry it. The pack and the tie-out anchor on the **P&L and the GL**, never the degenerate SOFP; a nil balance sheet must be **recorded as measured-and-nil**, never as unmeasured — the vacuous-green rule (§7.4) applies to it directly |

## 9. Non-goals

Named so they cannot creep in at the sitting:

- **MFRS** — MPERS only. **Multi-currency** — MYR only; FX-lite is a Wave-F ruling.
  **LLP** — sole prop and Sdn Bhd only.
- **A payroll engine.** Payroll enters as documents and leaves as JVs. Engine-ization
  (EPF/SOCSO/EIS/PCB computation, the deadline calendar) is a separate future module.
- **The tax engine** (SST periods, SST-02, capital allowances, the draft computation) — Wave F.
- **Goods trading / closing stock** — excluded in the first pass pending the producer verb
  (OD-2).
- **Fixing the gates this corpus exercises.** Where the run exposes a defect, it is registered
  with its evidence and takes its own ladder. This document changes no code and no gate.
- **Inventing any golden figure.** Every acceptance bar arrives from the owner's desk.

> **OD-11 — RULED 2026-08-20 (ADR-0072 ⑤): THE WAVE-G UX FLOOR COMES FIRST.** Real session
> auth, signin and firm setup — **the frontend build** — land **before** the corpus's first run.
> This corpus's own run script (§5 step 1, "firm setup -> client onboarding interview") presumes
> a real signed-in session, not the hand-minted JWTs every live-fire sitting has authenticated
> with so far. A run ahead of that floor would still prove the DB and the workflow layer, **but
> not the product** — the thing the owner and staff will actually use never gets exercised, and
> a defect in the UX floor itself could not surface. **The corpus run is a whole-product run or
> it is not the run.**

## 10. Owner decision points — THE RULINGS (2026-08-20, ADR-0072 ⑤)

**The sitting happened. All eleven are decided.** Where a ruling reverses the build's
recommendation, both are shown — a declined recommendation is recorded, never dropped.

| | Decision | **RULED** |
|---|---|---|
| **OD-1** | Which real clients fill the slots | **The corpus is TWO TIERS** (§3.0). Oracle = **BEE (two FYs) + ROME SECRETARY + ROME PROPERTIES (single terminal periods)**; the **reality tier is open-intake**. All under BELCORT. *The two-consecutive-FYs-per-slot requirement does not survive the papers.* |
| **OD-2** | A goods-trading slot? | **DEFAULTED to the recommendation** — not in the first pass. Owner may re-open. |
| **OD-3** | The acceptance-bar figures, per client per FY | **STILL OWED for every slot but BEE.** BEE's are now *confirmed against the client's own papers*, not merely recorded. The build never proposes one. |
| **OD-4** | Document custody / PDPA | **FULL PERMISSION**, with two carve-outs that are part of the ruling: the **IC copy is EXCLUDED from ingestion**, and the **payroll tree is the tightest-custody slot**. Tracing stays OFF for the whole run (C6 open). |
| **OD-5** | The reopen drill, and a second eligible principal | **NO second principal.** *The build recommended provisioning one; DECLINED.* The **solo-attestation arm is the product path**, so exercising it on real books is the honest test — and B3's **`distinct_checker` primary arm ships UNEXERCISED on real books**, rig-proven only, **named as such** in the acceptance record under §7.4. |
| **OD-6** | The factory reset's blast radius | **A WHOLE CLEAN PRODUCT DATABASE — a "new unboxed product".** No survivor list: not RS's book, not RPR's approved entries, not BEE's keyed seed, **and not the sandbox firm or the slice-era fixtures, which are NOT re-created**. One carve-out: **the spike schemas survive until their own DROP** (ADR-0072 ①.4, after a cold archive). |
| **OD-7** | Does the `closing_transfer` fix gate the SST slot? | **DISCHARGED by ADR-0072 ④** — R1 is ruled, Fix A is queued in Track B, task #17 is unblocked. |
| **OD-8** | An FYE change in any FY pair? (EC-3) | **DEFAULTED** — keep it as free coverage if a candidate has one; record it unexercised if none does. Owner may re-open. |
| **OD-9** | Statutory-pack locale per client | **DEFAULTED** — **en** every pack · **zh** on at least one slot · **ms** attempted exactly once and it **must REFUSE**. A PASS there is the finding, not the wording. Owner may re-open. |
| **OD-10** | Live project, or a separate one? | **THE LIVE PROJECT**, ruled together with OD-6. The reset *is* the discharge Wave G exists to prove; the irreversibility was priced, not assumed away. |
| **OD-11** | Sequencing against Wave F | **THE WAVE-G UX FLOOR COMES FIRST.** Real session auth, signin and firm setup — the frontend build — **precede the corpus run**. A run ahead of that floor proves the DB and the workflow layer while never exercising the product, and a defect in the floor itself could not surface. |

## 11. Open questions — where they stand after the sitting

1. ~~**BEE's opening TB — which record is current?**~~ **ANSWERED 2026-08-20 by a live read**
   (read-only, rolled back): **ADR-043 is current.** Seed `1e60960e` is `finalized` and keyed,
   and the book holds four approved opening entries dated 2024-12-31 totalling
   **RM 210,000.00 = RM 210,000.00**, with capital dr **RM 65,747.97**. The "empty" reading came
   from an earlier seed `ec53ab9d`, which is **cancelled**. **BEE's run is brown-field from the
   existing seed.** One stored-number oddity is recorded unadjudicated in `PROGRESS.md`.
2. ~~**Is BELCORT still a one-eligible-approver firm?**~~ **MOOT as a blocker** — OD-5 ruled that
   no second principal is provisioned either way, so the drill exercises the sole-attested arm
   and the primary arm is recorded unexercised. EC-12 follows the same ruling.
3. ~~**How many FYs of raw documents exist per candidate?**~~ **MEASURED** — two consecutive FYs
   for exactly one client (BEE, FY2024+FY2025); RS and RPR are terminal single periods and can
   never have a second. That measurement is what produced §3.0's reshape.
4. **Does any slot need the K-doc door / `opening_tb.line` producer?** **STILL OPEN, but no
   longer urgent:** RS and RPR are greenfield (no seed at all) and BEE's seed is already keyed,
   so nothing in the ruled oracle tier requires a *document-tied* opening. It becomes live again
   only if a reality-tier slot wants one.
5. ~~**Where does the eval harness sit relative to this run?**~~ **DISSOLVED** — ADR-0071/G7
   DECLINED the eval harness. **This corpus's owner-supplied golden-bar tie-out IS quality's
   checkpoint**, and there is no instrument to sequence against it.

---

**Status: RULED, 2026-08-20 — this file is now the corpus's CONTRACT OF RECORD** for everything
ADR-0072 ⑤ decided (§3.0, §10's eleven rows, §5's step-4 amendment). **TRUED 2026-08-31 by
裁-31/裁-63:** OD-3 remains open; corpus gaps are 资料缺失, never awaited, and the conductor/agent
records the measured RPR-series choice in the as-run. The desktop-corpus run proceeds as-is.
