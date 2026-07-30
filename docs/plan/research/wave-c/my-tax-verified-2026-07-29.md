# Malaysian e-Invoice / SST — primary-source verification, 2026-07-29

> **Why this exists.** An earlier research pass could not reach LHDN/RMCD primary PDFs and fell back
> to secondary sources throughout, leaving three items unresolved and one very likely wrong. This
> document records a **two-lane cross-model verification** (Codex `gpt-5.6-sol` xhigh + a native
> three-lane workflow with an independent opus adjudicator) run against primary sources on
> 2026-07-29. **Both lanes converged on every load-bearing answer below.**
>
> **This supersedes §7-D of `docs/plan/wave-c-contract.md`.**
>
> ⚠️ **Nothing here is a substitute for professional judgement on a specific client.** These are
> engineering facts for building effective-dated policy tables — not tax advice.

---

## 0. The method discovery (reusable — this is why earlier passes "failed")

**`hasil.gov.my` and `mysst.customs.gov.my` return HTTP 500 / 404 to a default `curl` User-Agent.**
That is exactly the "ECONNREFUSED / unreadable binary" failure the earlier passes hit and reported
as the sites being unreachable. **With a browser User-Agent** (`-A "Mozilla/5.0 … Chrome/126.0 …"`)
both serve real `application/pdf`, and `pdftotext -layout` parses them cleanly.

**⚠️ URL-drift hazard, verified by downloading and diffing both files:**

| URL | Serves |
|---|---|
| `https://www.hasil.gov.my/media/uwwehxwq/irbm-e-invoice-specific-guideline.pdf` | **STALE — v4.7, 20 Apr 2026** |
| `https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf` | **CURRENT — v4.8, 7 Jul 2026** |

Different md5, different cover page. A pinned URL is **not** a pinned version. Any future refresh
must verify the cover page version/date, not trust the path.

---

## 1. Verified facts (both lanes agree; primary-sourced)

### 1.1 The RM10,000 rule — RESOLVED

**It is an exclusion from CONSOLIDATED e-Invoicing, not an abolition of consolidation.**

- Specific Guideline v4.8 §3.7.1–3.7.2, Table 3.6: listed activities require an e-Invoice **per
  transaction** and **may not** be consolidated.
- The all-industries row reads: *"Any single transaction with a value **exceeding** RM10,000"*,
  **effective 1 January 2026**.
- **The operator is strictly `>`.** A transaction of exactly RM10,000.00 is **not** caught by this
  row (another Table 3.6 row, or a buyer request, may still require individual issuance).
- **Per single transaction, not a cumulative monthly total** — confirmed by v4.8 Example 24
  (ten transactions below RM10,000 each may consolidate; a RM12,000 transaction may not).

**Both circulating claims were partly wrong:**
- *"Long-standing"* — **false**. The row is **absent from v3.1 (4 Oct 2024)** and present by
  **v4.3 (7 Jul 2025)**, always carrying a *future* 1 Jan 2026 commencement.
- *"From 1 Jan 2026 there are no more consolidated invoices"* — **false**. Consolidation remains
  the default for everything below the threshold and outside the other carve-outs.

**⚠️ Engineering instruction: the row number is NOT stable.** It was **item 8** in v4.3/v4.5 and was
renumbered to **item 7** in v4.6. **Never key a policy record on "Table 3.6 item 7" — key it on the
rule text.**

**Full Table 3.6 no-consolidation list (v4.8):** motor vehicle sales · flight tickets and private
charters · luxury goods and jewellery (**ON HOLD — details unreleased, consolidation still allowed
until further notice**) · construction contractors under the Income Tax (Construction Contracts)
Regulations 2007 · betting/gaming payouts to winners (casino and gaming-machine payouts **exempt**
until further notice) · payments to agents/dealers/distributors under ITA s.83A(4) · **any single
transaction exceeding RM10,000, all industries, from 1 Jan 2026** · electricity distribution/supply/
sale by a provider, from 1 Jan 2026 · telecommunications postpaid plans, internet subscriptions and
electronic-device sales, from 1 Jan 2026.

### 1.2 The §16 interim relaxation — THE PROVISION THAT DECIDES TODAY'S BEHAVIOUR

Specific Guideline v4.8 §16.1–16.3 permits taxpayers with annual turnover/revenue **up to RM5m**
whose implementation date was 1 Jan or 1 Jul 2026 to:
- issue consolidated e-Invoices for **all** activities and transactions, **expressly including the
  §3.7 / Table 3.6 activities**;
- consolidate all §8.3 self-billed circumstances;
- decline individual issuance even when requested, provided the prescribed consolidated treatment
  is followed.

**Runs through 31 December 2027.** It is optional. It does **not** defer the mandatory adoption
date — the taxpayer must still submit the applicable consolidated e-Invoices monthly (within seven
calendar days after month-end). §16.3 bars prosecution under ITA s.120 during the period.

Phases 1–3 relaxations all closed before 1 Jan 2026, so for those bands the rule bites unshielded.

**The extension to 31 Dec 2027 landed in v4.7 (20 Apr 2026)**, not v4.8. An earlier Phase-4 release
referred to relaxation only through 31 Dec 2026 — **a "31 Dec 2026" value in any system is a year
stale.**

**⚠️ UNRESOLVED INTERPRETIVE TENSION — do not let Clara auto-decide this.** v4.8 **Example 24**
applies the RM10,000 rule to **February 2026** transactions *without stating the taxpayer's turnover
band*, while **§16.2(a)** expressly permits ≤RM5m taxpayers to consolidate those very transactions.
§16.2(a) is the express provision and should control, but a reader could take Example 24 as IRBM
treating the rule as unconditionally live. **Confirm with LHDN in writing before Clara decides
"consolidate vs transactional" for a small client. Surface it; do not infer it.**

### 1.3 SST bad-debt relief — the earlier pass had conflated two unrelated things

**"On or before 30 November 2025" is NOT a bad-debt rule and is closed history.** It was a one-off
**transitional refund deadline** for the B2B exemption covering 1 Jul – 31 Aug 2025, for providers
who newly crossed the registration threshold in July 2025, had already declared and paid the tax via
SST-02, and refunded the collected tax to the recipient.
*(Provenance note: the two lanes cite different amendment instruments — Codex cites Service Tax
Policy 2/2025 Amendment No. 5, 22 Jul 2026; the native lane cites Amendment No. 2, 17 Oct 2025 plus
STP 3/2025 Amendment No. 1, and extends scope to construction works as well as rental/leasing.
Plausibly successive amendments retaining the same historical item. **Not reconciled — and it does
not matter operationally, since both agree the window is closed.**)*

**The STANDING rule:**

| Element | Sales tax | Service tax |
|---|---|---|
| Statute | Sales Tax Act 2018 **s.36** (claim) / **s.37** (clawback) | Service Tax Act 2018 **s.35** (claim) / **s.36** (clawback) |
| Claimant | current or former registered manufacturer | current or former registered person |
| **Time limit** | **within SIX YEARS from the date the tax was paid** | **within SIX YEARS from the date the tax was paid** |
| Conditions | tax paid · amount written off in the accounts as bad debt · DG satisfied reasonable recovery efforts were made · the outstanding amount including tax is unpaid and irrecoverable | same, applied to taxable services |
| Partial payment | refund reduced by `A/B × C` | same |
| Later recovery | repay `A/B × C` | same |

`A` = payment subsequently received · `B` = sale/service value plus tax · `C` = tax payable.
Application is Form JKDM No. 2 plus the invoice, SST-02 and proof of payment, evidence of
non-payment, evidence of recovery efforts, and evidence of the write-off. Implementing provisions:
Sales Tax Regulations 2018 regs 15–16; Service Tax Regulations 2018 regs 19–20.

**🚫 THERE IS NO SIX-MONTH WAITING PERIOD.** Both lanes independently confirmed it appears in
**neither the Acts nor the Regulations**. The widely repeated "unpaid 6+ months" is a **GST-era
carry-over**. **Do not encode it.** *(Residual: whether RMCD's current General Guide adds one
administratively is **[U]** — that page renders its PDF list via JavaScript and could not be
retrieved. Resolve in a real browser or via RMCD helpdesk.)*

### 1.4 Current guideline version

**e-Invoice Specific Guideline v4.8, published 7 July 2026** — replaces v4.7 of 20 Apr 2026.
Companion **e-Invoice Guideline v4.7, also 7 July 2026**. *(The two documents share a version
number at different dates; do not confuse them — one lane did.)*

v4.8 **did not change** the employee, self-billing or ordinary consolidation provisions. It **added
§17 (SVDP — a live, dated penalty-relief programme an accounting product should know about)** and
Examples 23–25.

### 1.5 Employee expense claims (v4.8 §§7.1–7.6) — directly relevant to Clara's long tail

1. The employee should first request the e-Invoice be issued to the **employer as buyer**.
2. If that is not possible, an e-Invoice **in the employee's name is accepted**.
3. Existing supporting documentation may also substantiate the expense.
4. For **overseas** employee-paid expenses, **neither party issues a self-billed e-Invoice**;
   foreign invoices/receipts are accepted.
5. The employer must be able to **prove the employee incurred the expense on the employer's behalf**.

§§6.5–6.6 apply the same employer-first / employee-name concession to perquisites and benefits; the
foreign-document concession there requires the benefit to be stated in the employer's policy.

### 1.6 Self-billed e-Invoice triggers (v4.8 §8.3)

Payments to agents/dealers/distributors · goods or services from **foreign suppliers** · profit
distributions incl. dividends · e-commerce transactions · betting/gaming payouts (casino and
gaming-machine payouts exempt until further notice) · transactions with **individuals not conducting
a business** where no other category applies · **interest payments** (except: financial institutions
charging the public at large · employee-to-employer · foreign payor to Malaysian taxpayer · interest
to a related Malaysian company providing centralised treasury services · late-payment interest or
charges imposed by a Malaysian taxpayer — for these the supplier issues the ordinary e-Invoice) ·
**insurance claim/compensation/benefit payments** · capital reduction, share/unit redemption, share
buyback, return of capital, liquidation proceeds.

**⚠️ §8.3(h) insurance is UNQUALIFIED.** The text is *"Claim, compensation or benefit payments from
the insurance business of an insurer."* The "individuals / government / state authority" qualifier
belongs to **§3.6.5(c)** — a **consolidation** exception, **not a trigger condition**. Encoding that
qualifier onto the trigger would **under-trigger self-billing**.

Self-billed consolidation is **normally prohibited**, allowed only under §3.6.5 for: non-business
individuals · interest to the public at large · specified insurance payments to individuals and
government bodies · self-billed circumstances involving the taxpayer's overseas branches/offices.
*(The §16 relaxation temporarily expands this to every §8.3 category for eligible ≤RM5m taxpayers
through 31 Dec 2027.)*

### 1.7 Implementation timeline (live as at 7 Dec 2025 update)

| Annual turnover / revenue | Mandatory date |
|---|---|
| > RM100m | 1 Aug 2024 |
| > RM25m – RM100m | 1 Jan 2025 |
| > RM5m – RM25m | 1 Jul 2025 |
| up to RM5m | **1 Jan 2026** |
| **< RM1,000,000** meeting all criteria | **Exempt** (conditional) |

**1 July 2026 is still live**, re-scoped to newer businesses and growth cases.

**⚠️ The exemption is CONDITIONAL — it does not apply where the taxpayer has:**
- a non-individual shareholder (or equivalent) with turnover/revenue ≥ RM1m; **or**
- a holding company with turnover/revenue ≥ RM1m; **or**
- a related company or joint venture with turnover/revenue ≥ RM1m
  (*related company* per the Promotion of Investments Act 1986 definition).

**Once a mandatory year is determined, a later fall below RM1m does not restore the exemption.**

**Stale values to purge from any system:** the original "all remaining taxpayers on 1 Jul 2025"
schedule · the **RM500,000** exemption threshold announced 5 Jun 2025 (raised to **RM1m**,
reflected 7 Dec 2025) · relaxation ending **31 Dec 2026** (extended to **31 Dec 2027** in v4.7).

---

## 2. What must NOT be encoded yet

| Item | Status | What would resolve it |
|---|---|---|
| Any **6-month unpaid** precondition for SST bad-debt relief | **Not in the Acts or Regulations.** Do not encode either way | RMCD General Guide (Sales/Service Tax), current edition, "Bad Debt" section — the page renders its PDF list via JavaScript; open in a real browser, or ask the RMCD helpdesk |
| Whether the **RM10,000 rule is genuinely waived** for ≤RM5m taxpayers during relaxation | §16.2(a) text is verified; **practice unresolved** (vs Example 24) | An LHDN FAQ item or written confirmation, **before** Clara auto-decides consolidate-vs-transactional |
| **Anti-splitting / contract-level aggregation** for "single transaction" | Undefined in the guideline | A formal LHDN FAQ or written ruling |
| The **discount / SST inclusion** basis for the RM10,000 comparison | An LHDN SPK answer supports *"after discounts, including SST"*, but the primary PDF later 404'd | Re-fetch that SPK PDF (browser UA) or written LHDN confirmation |
| **Luxury goods / jewellery** exclusion catalogue | **ON HOLD**, details unreleased | A future guideline version or media release |
| Whether **SST-02 has a dedicated bad-debt-relief field** | Secondary only | The current SST-02 form + Return & Payment manual on `mysst.customs.gov.my/sst-forms/` |
| A **claimed v4.6 "construction-materials wholesaler/retailer carve-out"** | **Probably FALSE** — grepping v4.6/v4.7/v4.8 for "wholesaler", "building material", "construction material" returns **zero hits** | Treat as unverified; do not encode |
| **Enforcement start after 31 Dec 2027** | Secondary only | An LHDN media release; nothing in the 7 Jul 2026 primary text states one |

---

## 3. Process honesty

- **One native lane (`sst-baddebt`) failed outright** — returned `null` on a "Prompt is too long"
  error. Q2 was answered by the adjudicator's own primary research, which it disclosed.
- The adjudicator **caught its own `rm10k` lane over-claiming `[P]`** on a stale guideline version
  (it had read the `/media/uwwehxwq/` URL), missing §17 SVDP and Example 24, and asserting an
  unsupported v4.6 carve-out. Recorded above.
- **Codex and the native adjudicator agree on every load-bearing conclusion.** The only unreconciled
  divergence is the amendment-instrument provenance for the closed 30 Nov 2025 window (§1.3) —
  immaterial, since both agree it is closed.
- **Standing project rule reaffirmed:** rates, thresholds and phase dates belong in **effective-dated
  policy tables**, never in product-law prose. `PRD.md:175` currently embeds some in prose and should
  be corrected when the tax policy tables are built (Wave F).
