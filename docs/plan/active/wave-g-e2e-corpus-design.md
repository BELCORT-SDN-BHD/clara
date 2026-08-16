# Wave G — the factory-reset E2E corpus: a design for the owner's sitting

> **A DESIGN FOR A SITTING, NOT A DECREE.** Every client identity, every golden figure and
> every custody decision on this page belongs to the owner's desk; those are marked **OD-n**.
> Everything the build proposes is marked **P-n** and carries one recommendation. **No number
> on this page is invented** — the only figures quoted are ones already recorded in this repo,
> each with its cite. The acceptance bar for each client comes from the owner, never from here
> (`docs/product/PRD.md` §6.1: the DB owns every authoritative number; no model-generated
> numeral enters a durable artifact unless a versioned deterministic evaluator reproduces it
> from DB-owned inputs).
>
> Authored 2026-08-16 against `origin/main` @ `081cfdc` (83 migrations live, frontier `0088`).

## 1. Purpose, and the ruling this implements

`docs/plan/active/roadmap.md` has carried one line for Wave G's close-out since 2026-08-11:
*"the factory reset + full E2E rebuild from raw documents — the definitive stuck-bytes
discharge."* On **2026-08-16** the owner ruled two things that turn that line into a program:

1. **The BEE FY2025 close defers wholesale to this reset** (`PROGRESS.md` → Next item 2). The
   live-fire sitting refused to seal a knowingly-false loss on a real client under hard
   constraint 1; the owner's desk management accounts are the rebuild's acceptance bar —
   **FY2025 SALES RM 68,640.00 · net PROFIT RM 47,245.65 · capital B/F (65,747.97)**. The book
   must tie to those before its close seals.
2. **The reset+E2E is WHOLE-PRODUCT, and BEE alone is too thin.** BEE carries no TB/GL
   handover of the kind that exercises the brown-field path end to end. The corpus therefore
   grows by **3–4 additional real clients at ROME PROPERTIES rigor**, each with a full
   TB/GL/BS/P&L handover as its golden standard, **two consecutive FY closes each**, split
   between green-field and brown-field onboarding.

This document designs that corpus. It **extends** E-R9's acceptance-corpus map
(`docs/plan/active/wave-e-contract.md` §E-R9) rather than replacing it — that table is a
closed-wave record, cite-only. BEE's E-R9 row ("first REAL close") is unchanged in substance
and simply now runs *inside* the reset. RPR's historical MPERS pack and RS's snapshot witness
stay exactly where E-R9 put them.

**Why two consecutive FYs per client is the load-bearing choice.** One close proves a close.
Two consecutive closes are the only shape that exercises the four things Wave E built and has
never run: B3's reopen segregation (`0085`/`0086`), cross-year carry-down (FA continuity and
the retained-earnings roll), the `0057` period-snapshot sequence across a year boundary, and
a per-FY statutory pack whose FY2 comparatives come from FY1's sealed receipt.

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

> **OD-1 (OWNER DECISION) — which real clients fill the slots.** The identities, and the
> confirmation that each holds two consecutive FYs of *complete* papers. **Reading the build
> takes unless told otherwise:** new real clients are inducted under **BELCORT**, because
> putting real books in ROME PUBLIC ADVISORY would repurpose the synthetic sandbox and break
> constraint 13. Confirm.

| Slot | Entity | Onboarding path | FY pair | Primary diversity axis | Volume shape |
|---|---|---|---|---|---|
| **BEE** (inducted) | sole prop | **brown-field** — an opening seed already exists (ADR-043) | FY2025 + FY2026 | negative-equity sole prop; the recorded golden bar | low doc count, high per-doc stakes |
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
> with assets at opening.* Requiring CLIENT-BANK-1's opening TB to carry a depreciable
> register discharges that debt inside an existing slot instead of adding a client.
> **Recommendation: adopt.** If no candidate has both, split it: assets go to CLIENT-SST-1.

> **P-2 (PROPOSAL) — four additional clients, not three.** Three covers the three named axes
> with zero redundancy: one client that turns out to have incomplete papers collapses an axis
> mid-run. **Recommendation: induct four, run three to completion first, hold CLIENT-SP-2 as
> the relief slot** — it is also the only slot that exercises mid-year commencement.

> **OD-2 (OWNER DECISION) — a goods trader, yes or no.** A goods-trading slot would discharge
> two named debts at once (WD-R11's real closing-stock acceptance, and Gate P's first native
> SST-stated supplier bill). It carries a **hard build dependency**: the `closing_stock`
> producer verb does not exist (`PROGRESS.md` → Backlog, PR #228 residual 5), and drawer 2's
> `closing_stock_present` gate applies to `goods_trading` clients. **Recommendation: not in
> the first pass** — build the verb in Wave F's fix queue, add the slot after.

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

> **OD-4 (OWNER DECISION) — document custody and PDPA for real client papers.** Item 6 puts
> real client documents through OCR, storage and the agent's context. Three sub-questions,
> each already half-answered elsewhere: (a) the **C6 checklist** (DPA · firm-facing disclosure
> text · PDPA cross-border basis) is OPEN and owner/legal-owned — vendor trace export stays
> flagged OFF under PRD §6.16 until it is evidenced, so tracing must remain off for the whole
> corpus run; (b) whether the corpus documents are the client's originals or owner-authorized
> copies, and where they are retained after the run; (c) whether any slot's papers carry
> personal data (payroll almost certainly does — CLIENT-PAY-1's payslips) needing a narrower
> handling rule. **Recommendation: run with tracing OFF (no change needed — it already is),
> and treat CLIENT-PAY-1's payroll papers as the tightest-custody slot.**

> **Constraint 12 rides along, unchanged:** ROME SECRETARY's customers stay **NAME-ONLY**. The
> wall is structural (`0062`) and lifting it is an OWNER act through the audited door
> (`0063`). No corpus slot's onboarding may enrich an RS customer, and a new client's
> counterparty that happens to share a name with an RS customer is a different row.

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
 4  CODE FY1       agent drafts (chat + autoDraft); human approves. Standing rules earn
                   autopost after the third approval. Bank: match -> reconcile -> except.
                   Payroll documents become JVs through the document flow, not an engine.
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

**The reopen drill (step 10), on one client:** reopen FY1 after FY2 is open. Prove the
`ends_on`-dated formal prior-period adjustment (ADR-068 ruling 1, live since the B3 ceremony
— `docs/plan/completed/b3-reopen-ceremony-asrun.md`), the segregation determination on the
receipt, the re-close, and — the part only a two-FY corpus can prove — that **FY2's opening is
re-derived from the corrected FY1 receipt and not double-counted**.

> **OD-5 (OWNER DECISION) — which client carries the reopen drill, and a hazard that must be
> settled with it.** B3's wall requires **reopener ≠ closer where ≥2 principals are eligible**;
> where only one is eligible it takes a recorded-attestation path. ADR-043 records that
> **BELCORT has exactly one eligible approver** (that is why the first BEE approval was refused
> `CLR05 · SELF_ATTESTATION` and released only by a typed attestation). **If that is still
> true at the sitting, the drill exercises the sole-attested arm and leaves `distinct_checker`
> — the primary arm — unexercised.** **Recommendation: provision a second eligible principal
> before the drill**, so both arms fire; otherwise record explicitly that the primary arm ships
> unexercised on real books.

> **OD-6 (OWNER DECISION) — the reset's blast radius.** What survives the factory reset:
> ROME SECRETARY's book (TB pinned at **3,396,500 = 3,396,500**, re-read at every ceremony) ·
> ROME PROPERTIES' 29 approved entries · BEE's existing keyed opening seed · the sandbox firm ·
> the fixtures. ADR-060's data authority is DATA-scoped and expires at beta (hard constraint
> 14), so this is squarely the owner's call, not the build's. **One consequence worth pricing:**
> the opening-seed registry is one-shot per client (`uq_opening_seed_registry_once`) and both
> real clients' slots are spent — a reset frees them, which is the **only** way the
> document-tied carry-down (the K-doc door) can ever be proven on a real client. **This whole
> survivor list is conditional on OD-10, immediately below** — it describes what a reset
> spares only if the sitting rules the corpus runs on the live project at all.

> **OD-10 (OWNER DECISION) — does the corpus run on the live project post-reset, or on a
> separate project?** This is genuinely two-sided, not a formality. **For the live project:**
> the reset *is* the discharge Wave G exists to prove — running the corpus in the same project
> the frozen bytes currently occupy is the only way a reset actually retires them, and
> `docs/ops/DR.md`'s backup/restore discipline already covers the downside; OD-6's survivor
> list is the concrete shape of what that costs. **For a separate project:** it is the safer
> sandbox — nothing about ROME SECRETARY's pinned TB, ROME PROPERTIES' 29 approved entries or
> BEE's keyed opening seed is put at risk by a corpus run gone wrong — but it discharges
> nothing: the stuck-bytes claim stays exactly as untested as it is today, and the corpus
> proves the product without ever proving the reset. The live-project path also has no undo
> once run: OD-6's survivor list executes against real books, and a mistake there is not a
> sandbox mistake. **Recommendation: live project** — discharging the stuck-bytes claim is the
> point of Wave G, not a side effect — **but the sitting should rule this with the
> irreversibility priced in, not assumed away.**

## 6. What each slot uniquely proves

The rule this table enforces: **no mechanism ships on the strength of a slot that could not
have failed it.**

| Mechanism (and where it lives) | Slot that proves it | The proof |
|---|---|---|
| **B3 reopen segregation** (`0085`/`0086`) | the OD-5 designate | both arms fire, or the unexercised arm is named |
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

> **OD-7 (OWNER DECISION) — does the `closing_transfer`/SST fix gate the SST slot?** The
> registered latent (`PROGRESS.md` → Backlog, task #17): `finalize_close`'s closing entry is
> born `is_year_end` with `closing_transfer=false`, and approved-row immutability means it can
> never be marked afterwards — so `0016`'s SST turnover exclusion is dead for close-model
> clients and post-close rolling-12 turnover reads wrong. Blast radius is advisory-only (a
> wrong warning, never a wrong book). **Recommendation: land the fix before CLIENT-SST-1's
> FY1 close.** Running the SST slot on the known-broken predicate would produce a corpus
> result nobody can interpret.

> **OD-9 (OWNER DECISION) — which locale(s) each corpus pack issues in.** `mpers_company`
> revision 1 ships **en** and **zh** at full 5/5 wording coverage (the #43 ceremony); **ms**
> sits at **4/5** — one clause short, gated closed by design. A corpus that only ever issues
> **en** proves nothing about the claim gate's fail-closed path; issuing **ms** once, knowing
> it must refuse, is the cheapest negative control in the whole run (§7.4). **Recommendation:
> en for every pack; zh on at least one slot; ms attempted exactly once, on a slot the owner
> names, and it must REFUSE — a PASS there is the finding, not the wording.**

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

> **P-3 (PROPOSAL) — a registry-vs-ledger cross-check, registered not built here.** A client
> whose trial balance carries a bank-class GL account with a non-zero balance and **zero rows
> in `clara.bank_accounts`** should read `unknown`, not `tie`. That is one predicate, in
> drawer 1, fail-closed in the direction the drawer already fails. **Recommendation: register
> it as a Wave-F fix-queue candidate on its own full ladder** (it is judgement logic — house
> review law 1 applies). It is **not** in scope for this docs-only pass, and the corpus does
> not depend on it: CLIENT-BANK-1 exercises the gate with real accounts either way.

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
| EC-10 | **Foreign-currency document** | out of scope (§2). The failure mode to avoid is a *silently mis-booked* MYR figure | if one appears in a real corpus, it must be **refused or parked**, never coded. Record which happens |
| EC-11 | **Duplicate re-upload** | a benign re-upload once surfaced as a fatal `storage_error` (HTTP 400 wrapping 409) — fixed, `docs/ops/incident-2026-07-26-intake-storage.md` | re-upload one document deliberately per slot; it is free |
| EC-12 | **Maker = checker on a one-approver firm** | `CLR05 · SELF_ATTESTATION` gates approvals, and B3's segregation gates reopens | see OD-5. Provisioning a second principal changes behaviour in *both* places — plan it once, for both |
| EC-13 | **A bank GL balance with no registered bank account** | §7.3 | CLIENT-BANK-1 registers accounts properly; the gap itself is P-3, registered not built |

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

> **OD-11 (OWNER DECISION) — sequencing against Wave F.** This corpus's own run script (§5,
> step 1: "firm setup -> client onboarding interview") presumes a **real signed-in session** —
> signin, firm setup, the surfaces a firm actually operates through — not the hand-minted JWTs
> every live-fire sitting has authenticated with so far. Running the corpus ahead of that floor
> would still prove the DB and the workflow layer, but not the *product*: the thing the owner
> and staff will actually use never gets exercised, and a defect in the UX floor itself could
> not surface. **Recommendation: sequence the corpus's first run after the Wave-G UX floor**
> (real session auth, signin, firm-setup) **lands, so the run is whole-product — not a
> machinery-only run wearing a product's name.**

## 10. Owner decision points, collected

| | Decision | Build's recommendation |
|---|---|---|
| **OD-1** | Which real clients fill the slots; confirm they induct under BELCORT | BELCORT (RPA is the synthetic sandbox — constraint 13) |
| **OD-2** | A goods-trading slot? | Not in the first pass; the `closing_stock` producer verb does not exist |
| **OD-3** | The acceptance-bar figures, per client per FY | Owner's desk only. BEE's are on record; the rest arrive with the handover |
| **OD-4** | Document custody / PDPA for real client papers | Tracing stays OFF (C6 open); payroll papers get the tightest handling |
| **OD-5** | Which client carries the reopen drill — and whether a second eligible principal is provisioned | Provision the second principal, so B3's primary arm fires |
| **OD-6** | The factory reset's blast radius: what survives | Owner's call (ADR-060 is DATA-scoped, constraint 14). Note the freed opening-seed slots |
| **OD-7** | Does the `closing_transfer`/SST fix gate CLIENT-SST-1? | Yes — land task #17 before that slot's FY1 close |
| **OD-8** | Does any candidate have an FYE change in the FY pair? (EC-3) | If yes, keep it — it is free coverage. If no, record it unexercised |
| **OD-9** | Statutory-pack locale per client | **en** for every pack; **zh** on at least one; **ms** attempted exactly once as the negative control |
| **OD-10** | Does the corpus run on the live project post-reset, or on a separate project? | Live project — the reset *is* the discharge, and DR/backup discipline already covers it. Confirm |
| **OD-11** | Sequencing against Wave F | The corpus needs the Wave-G UX floor (real session auth, signin, firm-setup) to be a *whole-product* run rather than a hand-minted-JWT run |

## 11. Open questions

1. **BEE's opening TB — which record is current?** `PROGRESS.md` describes BEE as holding *"an
   empty opening TB"* at the live-fire sitting, while ADR-043 records a **finalized** keyed
   opening seed (`1e60960e`) tying at RM 210,000.00 with capital (65,747.97) — the same figure
   the owner's FY2025 golden bar gives as capital B/F. These may both be true of different
   dates, or one may be stale. **The build cannot adjudicate this; the owner can.** It matters
   because it decides whether BEE's Wave-G run is brown-field from an existing seed or from a
   fresh one after the reset.
2. **Is BELCORT still a one-eligible-approver firm?** ADR-043's reading is 2026-07-26. Re-read
   at the sitting — OD-5 and EC-12 both turn on it.
3. **How many FYs of raw documents actually exist per candidate?** Two consecutive closes need
   two consecutive *complete* corpora. A slot with FY1 papers and a thin FY2 proves less than a
   slot with two thin-but-complete years.
4. **Does any slot need the K-doc door / `opening_tb.line` producer** (Phase-5, review-gated,
   ADR-043's explicit "what Gate K does NOT close")? Only if a brown-field slot's opening is to
   be **document-tied** rather than keyed. Worth deciding early — it is a build dependency.
5. **Where does the eval harness sit relative to this run?** The vision audit's recommendation
   three (`docs/plan/research/wave-f/vision-alignment-audit.md`) argues a minimal three-number
   harness should precede the big autonomy questions. This corpus is the richest labelled
   material the product will ever have had; running it *without* instrumenting it would waste
   that. **Not a proposal here — a sequencing question for the owner.**

---

**Status:** DESIGN, awaiting the sitting. Nothing here is ratified. When the owner rules, the
rulings land in an ADR and this file becomes the corpus's contract of record.
