# Sole-proprietor FS convention — evidence package ("#44 sole-prop", E-R14)

**Status: EVIDENCE ONLY. No verdict is decided here.** Per the wave-e contract (E-R14,
ADR-065): *"the golden-source step includes a positive primary check (LHDN / MIA / ROBA
materials) before the convention label is finalized. Interim: practitioner convention (P&L +
SoFP + capital-account movement), honestly labelled convention-based, never MPERS-claimed."*
This document is that positive check. The owner rules the verdict; this sweep only gathers
and weighs what public primary sources say.

**A numbering note first, for the record:** the task that produced this file was framed as
"GitHub issue #44." Repo `BELCORT-SDN-BHD/clara` issue/PR #44 is in fact an unrelated, already-
merged PR (`fix(db): admit receivable account_class in onboard-rpr CSV validation`) — nothing
to do with sole proprietors. "#44 sole-prop" is `docs/PROJECTLOG.md`'s informal shorthand for
this research lane (paired with "#43 MASB"), not a real GitHub issue number — the repo has
exactly one open GitHub issue (#152), also unrelated. This sweep proceeds on the wave-e
contract's own E-R14 text (`docs/plan/wave-e-contract.md`), which is unambiguous and predates
the numbering question.

**Context (not re-litigated here, cited from the harness):** BEE CREATIVE SOLUTION is a real
BELCORT client, a Malaysian sole proprietorship (going concern). A sole proprietor is not an
employee; the proprietor's account is EQUITY (capital/drawings), never a staff advance or
counterparty — that lesson is already structural in the product (`entity_type` surfacing,
wave-e-contract.md L250-251). What remains open is the *presentation convention* for BEE's
financial statements.

---

## §0 — The question, and what the owner must confirm

The question: what is the official/professional convention for labelling and presenting a
Malaysian sole proprietor's financial statements — statement titles, the equity section
(capital account / current account / drawings), whether MPERS applies at all, and what LHDN
expects for Form B business-income accounts?

Checklist for the owner (≤10 items — nothing below is decided; each needs a ruling):

1. **Accept Candidate A** (§1): MPERS does not bind BEE because BEE is not a "private
   entity" as MASB itself defines that term (incorporation-gated) — or does the owner want a
   MASB/MIA source that names sole proprietorships explicitly before accepting this?
2. **Accept Candidate B** (§1): no statutory FS filing/audit regime applies to BEE at all
   (ROBA is a registration-only regime; Form B is a tax return, not an FS filing) — same
   question on evidence strength.
3. **Statement titles** for BEE's FS: plain-English ("Income Statement", "Statement of
   Affairs"/"Balance Sheet") vs MPERS-style ("Statement of Profit or Loss", "Statement of
   Financial Position") — §3 recommends plain-English to avoid an implied MPERS claim.
4. **Equity structure**: two-account (Capital + Drawings, since BEE has one owner and no
   partner needing a running current account) vs three-account (Capital + Current +
   Drawings, the partnership-style convention found in the evidence) — §3 recommends two.
5. **The disclaimer line** — does the owner want the candidate wording in §3 verbatim, or
   different wording, printed on every BEE FS set?
6. **LHDN Public Ruling 5/2000** ("Keeping Sufficient Records — Individuals & Partnerships")
   and **Public Ruling 7/2021** ("Determination of the Existence of a Partnership") are the
   two primary LHDN rulings most likely to bear on this — this sweep could NOT reach
   `hasil.gov.my`'s PDF servers (connection refused on every attempt, from this environment;
   likely a network/geo restriction, not a content problem). The owner (Malaysia-based) should
   pull these directly before the label finalizes; see §4 for exact URLs.
7. **MIA gap**: this sweep found no MIA technical release or FAQ specifically addressing
   unincorporated-business/sole-proprietorship FS presentation (searched; nothing surfaced).
   MIA's member-only Technical Library may hold something this sweep cannot reach. Is the
   absence acceptable, or should the owner check MIA's member portal directly?
8. **The 7-year record-retention figure** for sole-prop records is secondary-sourced only
   (tax-advisory sites, not the LHDN ruling itself) — confirm before it enters client-facing
   text.
9. **Sign-off**: which candidate (or blend) becomes the CONFIRMED wording in the design doc,
   discharging E-R14's interim-label status.

---

## §1 — Verdict candidates

### Candidate A — MPERS does not bind BEE (unincorporated ≠ "private entity")

MASB's own scope-defining term for MPERS applicability is "private entity," and MASB defines
that term as **incorporation-gated**:

> "a private company as defined in section 2 of the Companies Act 2016 that – is not itself
> required to prepare or lodge any financial statements under any law administered by the
> Securities Commission Malaysia or Bank Negara Malaysia; and is not a subsidiary or associate
> of, or jointly controlled by, an entity which is required to prepare or lodge any financial
> statements under any law administered by the Securities Commission Malaysia or Bank Negara
> Malaysia." — MASB, "Approved Accounting Standards for Private Entities" (masb.org.my)

BEE is a sole proprietorship registered under the Registration of Businesses Act 1956 (ROBA)
— it is not "a private company as defined in section 2 of the Companies Act 2016." By the
plain terms of MASB's own definition, BEE is outside the class of entity to which MPERS's
applicability provision speaks.

**Corroboration from the other direction:** ROBA 1956 itself draws the same line. Section
4(a) of the Act (the section titled "Application") states the Act "shall not apply to — (a)
any business which is exclusively owned and carried on by any company registered under the
Companies Act 1965." Read together with MASB's incorporation-gated definition, the two Acts
are mutually exclusive: a business is either (i) a company incorporated under the Companies
Act — MPERS-eligible, ROBA-exempt — or (ii) a ROBA-registered unincorporated business like
BEE — ROBA-governed, and, on MASB's own terms, outside "private entity."

**Weakness:** no primary source found says "MPERS does not apply to sole proprietorships" in
those literal words. This is a reasoned inference from two definitions that fit together, not
a directly quoted verdict naming sole proprietorships as an example. It is a strong inference
(the definitions are unambiguous and mutually exclusive on incorporation), but the owner's
own item #1 above should register that gap.

### Candidate B — No statutory FS filing/audit regime applies to BEE at all

ROBA 1956 was read in full (all 23 substantive sections, Act 197, current consolidated
text from ssm.com.my). **No section requires a registered business to prepare, lodge, or file
financial statements or accounts with the Registrar.** The Act's machinery is entirely about
registering/renewing/amending/terminating the business's *name and particulars* (ss.4–8,
5A–5E) — nothing about accounts. Section 9's "Inspection" power lets the Registrar or an
inspector enter premises to check the registration itself is being complied with, not to
review financial records.

Independent secondary corroboration (tax-advisory / company-secretarial sites, not LHDN/SSM
themselves): ClearTax, PaulHypePage, and KCGroup each independently state sole proprietorships
file no separate financial statements or undergo any statutory audit; the owner instead
declares business income annually via Form B (personal income tax return).

**Weakness, flagged per this project's own evidence law:** the primary-source part of this
finding is an absence claim — "the Act has no such clause" after a completeness read of a
short, section-numbered statute. A full read of all 23 sections is materially stronger than a
typical "I searched and found nothing," but it is still an absence, and per the project's
standing rule ("absence is not evidence... every absence... falls through to the fail-closed
branch") the owner should treat Candidate B as SUPPORTED rather than PROVEN by the primary
text alone. The three independent secondary sources reporting the identical conclusion narrow
that gap but do not close it.

### Candidate C — The wave-e contract's own interim label, positively checked (not contradicted)

E-R14 already states the interim position: *"practitioner convention (P&L + SoFP + capital-
account movement), honestly labelled convention-based, never MPERS-claimed."* This sweep's
job was not to invent a new verdict but to run the positive primary check E-R14 itself calls
for. Nothing found here contradicts that interim wording — Candidates A and B above are
supportive: no statutory or standard-setter authority compels or forbids a particular
presentation for BEE, which is exactly the space "honestly labelled convention-based" is
built for.

**Weakness:** "practitioner convention" is not itself a single canonical document. The
sweep found real-world convention evidence pointing to more than one workable structure — see
§3 for the fork between a two-account and three-account equity presentation, and the
recommendation.

---

## §2 — Evidence per source

### MASB (masb.org.my)

- **`pages.php?id=20`** ("MASB Approved Accounting Standards for Private Entities"), fetched
  2026-08-11. Verbatim quote of the "private entity" definition — see Candidate A above.
  States MPERS applies to "private entities" "for annual periods beginning on or after 1
  January 2016," definition anchored to Companies Act 2016 s.2 "private company."
  **PRIMARY, directly quoted.**
- **`press_list.php?id=276`** ("MASB revises Private Entity definition," 28 Feb 2017), fetched
  2026-08-11. Confirms the definition was revised on the Companies Act 2016 / Interest Schemes
  Act 2016 commencement (31 Jan 2017); the full verbatim revision text lives in a linked PDF
  (`ENG_28Feb_Clean.pdf`) not directly fetched in this sweep. **PRIMARY, page confirmed, linked
  PDF UNVERIFIED (not opened).**
- MASB's illustrative FS (`MPERS_2025_BC_IE.pdf`) is already logged in the wave-e contract
  itself (L293-295) as encoding-failed on automated extraction — not re-attempted here; that
  door is explicitly a human-pull item per the contract, unrelated to the sole-prop question.

### SSM / Registration of Businesses Act 1956 (ssm.com.my)

- **`bm/acts/a0197pdf.pdf`** (Act 197, consolidated text), fetched and read in full 2026-08-11.
  **PRIMARY, directly quoted / completeness-read.**
  - s.2 ("Interpretation"): `"business" includes every form of trade, commerce,
    craftsmanship, calling, profession, or other activity carried on for the purposes of
    gain, but does not include any office or employment or any charitable undertaking..."`
  - s.4(a) ("Application"): the Act does not apply to "any business which is exclusively
    owned and carried on by any company registered under the Companies Act 1965."
  - ss.5–22A: registration, renewal, amendment, termination, inspection, offences, electronic
    filing — **no clause anywhere requires financial-statement or accounts lodgment.**
- Secondary corroboration (not LHDN/SSM primary, but independent of each other and of the
  primary read above): ClearTax (`cleartax.com/my/en/sole-proprietorship-malaysia`),
  PaulHypePage (`paulhypepage.my/sole-proprietorship-in-malaysia`), KCGroup
  (`kcgroup.biz/sole-proprietor-malaysia-2026`) — all state no audit/FS filing is required for
  a ROBA-registered sole proprietorship. **SECONDARY, search-summarized, not independently
  verbatim-fetched.**

### LHDN / HASiL (hasil.gov.my)

- **Public Ruling 5/2000** ("Keeping Sufficient Records — Individuals & Partnerships"),
  `phl.hasil.gov.my/pdf/pdfam/PR5_2000.pdf` — **UNVERIFIED, INACCESSIBLE.** Every fetch
  attempt (direct, and via a `lampiran1.hasil.gov.my` mirror) returned `ECONNREFUSED` from
  this environment. Title and existence confirmed via search-engine indexing only. This is
  the single most relevant primary document for the record-keeping half of the question and
  was not read. **Owner action item (checklist #6).**
- **Public Ruling 7/2021** ("Determination of the Existence of a Partnership"),
  `phl.hasil.gov.my/pdf/pdfam/PR_07_2021.pdf` — same host, not attempted after the repeated
  connection failures on the same domain; logged here as a second owner-side pull target.
  **UNVERIFIED, NOT ATTEMPTED.**
- Form B guidance (`003a.pdf`, "INDIVIDUAL BUSINESS INCOME") — same host, **UNVERIFIED,
  INACCESSIBLE** (ECONNREFUSED).
- Secondary sources on Form B mechanics (ClearTax, ajobthing, CukaiMax): sole proprietors file
  Form B annually declaring business income; a set of accounts (income statement + balance
  sheet) is prepared to compute taxable profit; 7-year record retention is commonly cited.
  **SECONDARY, search-summarized only — the 7-year figure in particular has no primary
  citation in this sweep** (checklist #8).

### MIA (mia.org.my)

- Confirmed (via MASB/derived pages, cross-referenced against MIA's public role description):
  MIA's institutional role is MFRS/MPERS adoption support, exposure-draft review, and
  technical comment to MASB — MIA does not itself set MPERS's scope (MASB does).
  **SECONDARY/institutional description, not a primary ruling.**
- `mia.org.my/wp-content/uploads/2022/07/MIA_MPERS_FAQs.pdf` — attempted, returned HTTP 403
  (blocked). **UNVERIFIED, INACCESSIBLE.**
- Targeted search for MIA guidance on unincorporated-business / sole-proprietorship FS
  presentation returned nothing on-point — **GAP, not a finding.** MIA's By-Laws
  (`mia.org.my/wp-content/uploads/2024/04/MIA-By-Laws-2024-UPDATED.pdf`) govern member conduct
  in public practice generally, not FS presentation content, and were not read in full (out of
  scope for this specific question).

### BNM (bnm.gov.my) — adjacent regulator evidence, not an accounting standard

- **"Financial Information Statement for Sole Proprietor/Partnership"** (Appendix 3 of a BNM
  lending-documentation form), fetched and read in full 2026-08-11. **PRIMARY (a real
  regulator's own template), directly read — but not an accounting standard**, so it is
  persuasive-only evidence of real-world convention, not authority on the question itself.
  - Titles used: **"INCOME STATEMENT"** and **"BALANCE SHEET"** (plain-English, not MPERS's
    "Statement of Profit or Loss" / "Statement of Financial Position").
  - The equity/net-worth side is a single **"Net Worth"** line (Total Assets − Total
    Liabilities) — the form does **not** break equity into Capital / Current / Drawings; it
    is a lending-disclosure form, not a full FS.
  - Notably mixes personal and business items ("Personal Property," "Personal Residence" as
    line items) — reflecting that for a sole proprietor, business and personal net worth are
    not legally separated (unlimited liability), which is itself relevant context for BEE's
    equity-section design even though this form's exact structure is not being proposed as
    the FS convention.

### Practitioner convention (secondary, general — not Malaysia-specific)

- ACCA Global technical articles on partnership accounting (search-summarized; the direct
  fetch of `accaglobal.com/.../partnership-accounts.html` 404'd, so this is **SECONDARY,
  search-summary only, not independently verbatim-confirmed**): the standard convention keeps
  a **fixed Capital Account** (initial + additional capital introduced) separate from a
  **Current Account** (accumulated share of profit, less drawings) for each partner, with a
  **Drawings Account** clearing into the Current Account at year end. This three-account
  structure is built for *multiple* partners needing separately tracked running balances; for
  a sole proprietor (one owner, BEE's case) practitioner material generally collapses this to
  two accounts: **Capital** (or "Capital + accumulated profit") and **Drawings**, since there
  is no second partner's balance to keep distinct.
- General secondary confirmation of the two-account convention for a single-owner entity
  (learnaccounting.wordpress.com, abilitybusiness.com — both **SECONDARY**, not
  professional-body primary sources): "<Owner's name>, Capital" and "<Owner's name>, Drawings"
  as the naming convention; drawings are not tax-deductible in Malaysia (matches the LHDN
  Form B secondary sources above on non-deductibility of personal drawings).

---

## §3 — What this means for BEE's convention label

Not a ruling — candidates for the owner to choose among, built from §1/§2:

**Statement titles.** Recommend plain-English titles ("Income Statement," "Statement of
Affairs" or "Balance Sheet") rather than MPERS's defined titles ("Statement of Profit or
Loss," "Statement of Financial Position"). Rationale: MPERS's titles are specific to the
standard's own defined terms (MPERS §3.17 in the standard proper, not independently verified
in this sweep); reusing them on a non-MPERS-compliant statement risks the exact trap E-R14
already names ("never MPERS-claimed"). The BNM sole-prop form's own title choice ("Income
Statement" / "Balance Sheet") is real-world corroboration that plain titles are normal
practice for this entity type, even though that form is not itself an accounting standard.

**Equity section structure.** Recommend the two-account form (Capital + Drawings) over the
three-account partnership convention (Capital + Current + Drawings), because BEE has exactly
one owner — the Current Account's purpose (tracking a *second* party's running balance
separately from fixed capital) doesn't exist for a sole proprietor. Candidate presentation:

```
TAN [OWNER NAME], CAPITAL ACCOUNT
  Balance at 1 January 20XX                    XX,XXX
  Add: Net profit for the year                  X,XXX
  Add: Additional capital introduced               XXX
  Less: Drawings                               (X,XXX)
  Balance at 31 December 20XX                   XX,XXX
```

This directly satisfies E-R14's "capital-account movement" phrase with a two-line-item,
not three-account, structure.

**Candidate labels for the equity section itself** (as asked in the brief): "Capital
Account," "Drawings," and a "Capital Account Movement" or "Statement of Changes in Owner's
Equity"-style roll-forward — all three terms have primary or near-primary grounding above
(ROBA's own vocabulary doesn't use them, since ROBA is silent on accounts entirely, but MASB's
"private entity" gate excludes MPERS's competing "Statement of Changes in Equity" title from
being reused, and general/secondary practitioner convention supports "Capital Account" /
"Drawings" as the standard sole-proprietor terms).

**The disclaimer line** (candidate wording, not final): *"These financial statements have
been prepared in accordance with the normal conventions of accounting practice applicable to
a sole proprietorship registered under the Registration of Businesses Act 1956. They are not
prepared in accordance with, and are not represented as complying with, the Malaysian Private
Entities Reporting Standard (MPERS) or any other MASB-approved accounting standard, which
applies only to a private entity as defined under the Companies Act 2016."* Grounded directly
in Candidate A's MASB quote and ROBA s.4(a); the owner should still have this reviewed before
it goes on any real client-facing document (checklist #5).

---

## §4 — Source log

| Source | URL | Type | Access | Date |
|---|---|---|---|---|
| MASB private entity definition | masb.org.my/pages.php?id=20 | Primary | Fetched, quoted verbatim | 2026-08-11 |
| MASB press release (definition revision) | masb.org.my/press_list.php?id=276 | Primary | Fetched; linked PDF not opened | 2026-08-11 |
| ROBA 1956 (Act 197) full text | ssm.com.my/bm/acts/a0197pdf.pdf | Primary | Fetched + read in full (23 sections) | 2026-08-11 |
| LHDN PR 5/2000 (record-keeping) | phl.hasil.gov.my/pdf/pdfam/PR5_2000.pdf | Primary | **INACCESSIBLE** (ECONNREFUSED ×2 hosts) | attempted 2026-08-11 |
| LHDN PR 7/2021 (partnership existence) | phl.hasil.gov.my/pdf/pdfam/PR_07_2021.pdf | Primary | **NOT ATTEMPTED** (same host failing) | — |
| LHDN Form B business-income guide | phl.hasil.gov.my/pdf/pdfam/003a.pdf | Primary | **INACCESSIBLE** (ECONNREFUSED) | attempted 2026-08-11 |
| MIA MPERS FAQ PDF | mia.org.my/wp-content/uploads/2022/07/MIA_MPERS_FAQs.pdf | Primary | **INACCESSIBLE** (HTTP 403) | attempted 2026-08-11 |
| BNM Sole Prop/Partnership financial info form | bnm.gov.my (Appendix 3 PDF, full path in §2) | Primary (regulator form, not a standard) | Fetched + read in full | 2026-08-11 |
| ClearTax sole-prop guide | cleartax.com/my/en/sole-proprietorship-malaysia | Secondary | Search-summarized | 2026-08-11 |
| ClearTax Form B guide | cleartax.com/my/en/form-b-malaysia | Secondary | Search-summarized | 2026-08-11 |
| PaulHypePage sole-prop guide | paulhypepage.my/sole-proprietorship-in-malaysia | Secondary | Search-summarized | 2026-08-11 |
| KCGroup sole-prop guide | kcgroup.biz/sole-proprietor-malaysia-2026 | Secondary | Search-summarized | 2026-08-11 |
| ajobthing Form B guide | ajobthing.com/resources/blog/form-b-tax-filing-malaysia-deadlines-submission-guide | Secondary | Search-summarized | 2026-08-11 |
| CukaiMax Form B guide | cukaimax.com/en/form-b | Secondary | Search-summarized | 2026-08-11 |
| L&Co Chartered Accountants (MPERS scope) | landco.my/which-accounting-standard-i-should-use | Secondary (Malaysian practitioner firm) | Fetched — confirms sole props out of scope of its own decision tree, no convention given | 2026-08-11 |
| ACCA Global — partnership accounts | accaglobal.com/.../partnership-accounts.html | Secondary (professional body, not Malaysia-specific) | Search-summarized only; direct fetch 404'd | 2026-08-11 |
| Acclime Malaysia — accounting introduction | malaysia.acclime.com/guides/accounting-introduction | Secondary | Search-summarized | 2026-08-11 |
| learnaccounting.wordpress.com — capital/drawings naming | learnaccounting.wordpress.com/... | Secondary, general (not Malaysia-specific) | Search-summarized | 2026-08-11 |
| abilitybusiness.com — equity section for sole prop | abilitybusiness.com/... | Secondary, general (not Malaysia-specific) | Search-summarized | 2026-08-11 |
| GitHub `BELCORT-SDN-BHD/clara` issue/PR #44 | github.com/BELCORT-SDN-BHD/clara/pull/44 | Primary (repo record) | Fetched — confirmed UNRELATED to this question | 2026-08-11 |
| `docs/plan/wave-e-contract.md` (E-R14) | in-repo | Primary (project record) | Read in full | 2026-08-11 |
| `docs/PROJECTLOG.md` (the "#44 sole-prop" shorthand) | in-repo | Primary (project record) | Read (grep) | 2026-08-11 |

**Everything not marked "Primary … quoted verbatim" or "Primary … read in full" above should
be treated as UNVERIFIED for any claim that ends up in a client-facing document.** The two
strongest legs of this package — MASB's own "private entity" definition, and a full read of
ROBA 1956 — are both primary and directly quoted/read; everything downstream of them
(statement titles, equity structure, the disclaimer wording) is candidate design, not settled
fact.
