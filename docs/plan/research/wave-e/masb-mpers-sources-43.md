# Task #43 · MASB/MPERS wording legwork — sources, illustrative-FS file list, wording candidates

> **Scope note, read first.** "#43" is not a GitHub issue in this repo — a repo-wide check found
> **zero open GitHub issues** (one closed issue, #152, unrelated; issue-number 43 itself resolves to
> **PR #43**, an unrelated docs-harness-sync PR). "#43" is the internal task tag used in
> `docs/PROJECTLOG.md` PART 2, `docs/plan/wave-e-acceptance-matrix.md` (§D5, §D7) and
> `docs/plan/wave-e-design-reporting.md` §3.3/§6 for the MASB golden-wording pull. This file is that
> task's deliverable; there is no GitHub issue to file or close against it.
>
> **Consumer vocabulary (read from `wave-e-design-reporting.md`/`-part2.md` before using this file):**
> the wording lands in **layer 2, `clara.statutory_wording`** — a flat fact table, PK
> `(profile_key, wording_key, locale, applies_to_periods_beginning_from/_to)`, with a CHECK that
> forbids `verification_state='verified'` without `source_manifest`, `source_sha256`, `verified_by`,
> `verified_at` (reporting-part2 §6). It is **BORN TWO-VERSIONED**: one act inserts both the MPERS
> (2016) and MPERS (2025) row sets, gated on this task clearing. The matrix's own abbreviations:
> **SoFP** / **SoCI** / **SOCE** / cash-flow statement / notes (matrix §D7).

## 0. How to read this — the owner-sitting checklist (15 items, ≤30 min)

Everything below is marked **QUOTED** (verbatim, source+location given), **CANDIDATE** (real source,
high confidence, but not MPERS's own literal text or not independently re-verified this pass), or
**UNVERIFIED** (a gap this session's tools could not close). Nothing is invented. Work top to bottom:

1. Confirm `masb.org.my/pages.php?id=614` (MPERS 2016) and `id=615` (MPERS 2025) still resolve as
   described in §1 — pages fetched and read 2026-08-11.
2. **Open the primary MPERS 2016 PDF yourself** (§1's link) and check §3.1's quoted paragraphs
   (3.17/3.18/3.19/3.21/3.22) read identically. This session's tools could not extract text from any
   `masb.org.my` PDF directly (§5 log) — every MPERS-2016/2025 wording candidate below is sourced from
   the **IFRS for SMEs (2015 edition)** parent standard and two Malaysian preparers' illustrative packs,
   never from MASB's own PDF bytes.
3. **Resolve a real numbering conflict found this pass**: the IFRS for SMEs (2015) Module 5 training
   PDF labels the single-/two-statement choice "5.3"/"5.4"; KPMG's *Wonderful SME Sdn Bhd* MPERS-2016
   illustrative pack cites the same rule as **"5.2"**, and cites the by-nature/by-function expense
   choice as **"5.11"** (§3.2, §5). One of these numbers is the training module's own pedagogical
   re-numbering, not the Standard's. Only the primary PDF settles which.
4. Confirm the **MPERS (2025) illustrative-FS file** — `MPERS_2025_BC_IE.pdf` ("Basis for Conclusions
   and Illustrative Financial Statements"), named on MASB's own `id=615` page — actually contains
   illustrative statements (not just Board deliberations); this session could not fetch its bytes (§5).
5. Decide the sourcing policy the wording table's `source_manifest`/`verification_state='verified'`
   requires: is the **IFRS for SMEs 2015 module text** (official, but the parent standard, not MPERS)
   an acceptable `verified` source with a documented MPERS-alignment note, or must every row trace to
   the MPERS PDF byte-for-byte? This is a policy call layer-2's CHECK constraint does not make for you.
6. Note: **MASB does not appear to publish its own illustrative FS for the 2016 vintage** — only the
   2025 vintage has an MASB-authored illustrative-FS file (item 4). For 2016, the closest
   quasi-primary source is MIA's (the professional body's) *Illustrative MPERS Financial Statements,
   with Commentaries and Guidance Notes* (Tan Liong Tong) — a **paid** e-book/print product (§2).
7. Decide whether a **paid MIA product** or **Big-4/mid-tier illustrative packs** (KPMG, Mazars, NK
   Associates — all third-party, not MASB-authored) are acceptable evidentiary basis for `CANDIDATE`
   rows, given none is MASB's own text.
8. Eyeball §4's five δ-classification-seed flags against the actual account-set design when it ships
   (this is **structure**, not wording — §3.3 of the reporting design rules classification seeds in;
   flag only, per the round-1 decision ledger item 3).
9. §4 flag 1 — confirm the **quick-ratio** account-set excludes prepayments/other non-trade current
   assets, not just inventory.
10. §4 flag 2 — confirm **gearing** binds to interest-bearing borrowings specifically, not the whole
    MPERS 4.2(m) "financial liabilities" line (which can include non-debt items).
11. §4 flag 3 — confirm **stock turnover**'s cost-of-sales account-set is independent of the entity's
    by-nature/by-function SoCI presentation choice (a "by nature" filer has no face-of-statement
    "cost of sales" line at all).
12. §4 flag 4 — confirm **debtor/creditor days** account-sets are TRADE-ONLY subsets of the combined
    "trade and other receivables/payables" statutory line (4.2(b)/(l)), not aliases of the statutory
    presentation-map's account-set.
13. §4 flag 5 — confirm the **current/non-current** account-set is COA-level static tagging (the
    practical approach) rather than MPERS's own dynamic operating-cycle test (4.4–4.8) — and that this
    simplification is stated somewhere, not silently assumed.
14. Sign off §3's QUOTED/high-confidence CANDIDATE rows as ready to seed `statutory_wording`; every
    row marked UNVERIFIED stays blocked until re-sourced.
15. If accepted, hand the ruling back for the wording-table seeding act (out of this task's scope —
    this file is evidence, not the migration).

## 1. MASB entry points (primary — masb.org.my)

| Page | URL | What it offers | Fetched |
|---|---|---|---|
| Standards hub | `https://www.masb.org.my/pages.php?id=20` | "MASB Approved Accounting Standards for Private Entities" — links to both MPERS vintages + IFRS for SMEs (2015/2025 editions, via ifrs.org) | 2026-08-11 |
| MPERS (2016) | `https://www.masb.org.my/pages.php?id=614` | The 2016 standard (issued 14 Feb 2014, applicable from 1 Jan 2016), the Oct 2023 Pillar Two amendment, a BM glossary, and the alternate MFRS 139 recognition/measurement option | 2026-08-11 |
| MPERS (2025) | `https://www.masb.org.my/pages.php?id=615` | The revised standard (issued 10 Oct 2025, applicable from periods beginning 1 Jan 2027, early application permitted) + a "Basis for Conclusions and Illustrative Financial Statements" companion PDF | 2026-08-11 |
| Press release | `https://www.masb.org.my/press_list.php?id=490` | MASB's own announcement of the 2025 revision: "updates to nearly all sections," full alignment with **IFRS for SMEs third edition** (Feb 2025), Section 34 property-development guidance removed (revenue now aligned to IFRS 15/MPERS Section 23) | 2026-08-11 |
| Purchase/order form | `https://www.masb.org.my/publicationorder_mfrs.php` (referenced from `id=20`) | Hard-copy order path — **not needed**: both vintages have free direct PDF links from their own pages | linked, not fetched |

**No login/paywall found on any MASB page itself** — every MASB-hosted PDF link *appears* to be a
direct, unauthenticated download (per the rendered page content). **However — access caveat, read
before trusting the hrefs below:** this session's fetch tool could not independently download or
read any `masb.org.my`-hosted PDF (every attempt returned empty content, distinct from a login wall or
a 403 — see §5). The hrefs are as reported by the page-rendering step, not independently confirmed by
a successful byte fetch. **Owner: click these yourself before relying on them** (checklist item 2).

**MPERS (2016) direct file hrefs, as rendered from `id=614` (UNVERIFIED by direct fetch):**
`pdf/MPERSDec2016_website.pdf` (main standard) · `pdf_file/2023Oct16_Amd to MPERS.pdf` (Pillar Two
amendment, effective 16 Oct 2023) · `pdf/MPERSGlossaryinBahasaMalaysia.pdf` (BM glossary) ·
`pdf_file/MFRS 139 042015.pdf` (the optional MFRS 139 financial-instruments carve-out).

**MPERS (2025) direct file hrefs, as rendered from `id=615` (UNVERIFIED by direct fetch):**
`pdf.php?pdf=MPERS%202025.pdf&file_path=pdf_file` (main standard, free) ·
`pdf_file/MPERS_2025_BC_IE.pdf` ("Basis for Conclusions and Illustrative Financial Statements").

## 2. The MPERS illustrative-FS file list

| # | Title | Vintage | Publisher | Format/access | Notes |
|---|---|---|---|---|---|
| 1 | *Basis for Conclusions and Illustrative Financial Statements* | **MPERS (2025)** | **MASB** (primary) | PDF, `pdf_file/MPERS_2025_BC_IE.pdf` off `id=615` | The only MASB-authored illustrative FS found. **UNVERIFIED**: could not fetch its bytes this session (checklist item 4) |
| 2 | *Illustrative MPERS Financial Statements, with Commentaries and Guidance Notes* (2nd ed.), by Tan Liong Tong | MPERS (2016), 2nd ed. published 2018 | **MIA** (quasi-primary — the professional body, not MASB) | **Paid** — print/e-book via MIA e-library/apps; an order-form PDF exists (`mia.org.my/wp-content/uploads/2022/05/MPERS_Order_Form.pdf`); a possible free mirror at a Malaysian government audit-academy portal (`akademi.audit.gov.my`) returned an access-rejected error this session | No MASB-authored 2016 illustrative FS was found (checklist item 6) |
| 3 | *Wonderful SME Sdn. Bhd. and its subsidiaries: Illustrative Financial Statements 2016* | MPERS (2016) | KPMG (Malaysia) | Free PDF, `assets.kpmg.com/content/dam/kpmg/my/pdf/Wonderful-SME-Sdn-Bhd-Illustrative-Financial-Statements-2016.pdf` | **Fetched and text-extracted this session.** Third-party, not MASB — but its note-reference column cites MPERS's own paragraph numbers directly (useful numbering cross-check, §3.2) |
| 4 | *Mazars SME Sdn Bhd* model financial statements (MPERS) | MPERS (2016) | Forvis Mazars (Malaysia) | Landing page `forvismazars.com/my/en/insights/our-publications/financial-reporting/mazars-model-financial-statements-mpers-2016`; PDF not directly resolved this session | Third-party; not fetched (time-boxed) |
| 5 | *MPERS Illustrative Financial Statements* (FY2023 fact pattern) | MPERS (2016, as amended) | NK Associates (Malaysia) | Free PDF, `nk.com.my/cdn/pdf/MPERS_Illustrative_Financial_Statements.pdf` | **Fetched and text-extracted this session.** Third-party; useful as a more recent, freely-downloadable sample corroborating statement titles (§3.1) |
| — | *MPERS Std 2016 (Final, 23 Feb 2016)* — possible full-text mirror | MPERS (2016) | Hosted by Universiti Putra Malaysia's internal reference portal (`reg.upm.edu.my`) | Attempted fetch this session: connection refused | Unofficial mirror, unverified; not usable evidence |

**Not found:** any MASB-authored illustrative-FS document for the 2016 vintage; any Deloitte/EY/BDO/
Crowe Malaysia-specific MPERS illustrative pack (search returned only Mazars, KPMG, NK Associates, and
generic Crowe/KPMG *international* IFRS pages, not MPERS-specific).

## 3. Wording-candidate package

All text in this section is the **IFRS for SMEs Standard (2015 edition, per the IFRS Foundation's own
training-module version stamps 2018-04 through 2018-09)** — the parent standard MPERS (2016, 2nd
edition) is based on, "with modifications... to Section 34" per MASB's own `id=20` page. **None of this
is independently confirmed as MPERS's own literal text** (checklist item 2) — mark every row CANDIDATE
unless stated otherwise. Source: `ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-0{3,4,5,6,7,8}.pdf`,
fetched and text-extracted this session (§5).

### 3.1 Statement titles and the complete-set list — CANDIDATE (§3.17, IFRS for SMEs 2015)

> "A complete set of financial statements of an entity shall include all of the following: (a) a
> statement of financial position as at the reporting date; (b) either (i) a single statement of
> comprehensive income... or (ii) a separate income statement and a separate statement of
> comprehensive income...; (c) a statement of changes in equity for the reporting period; (d) a
> statement of cash flows for the reporting period; and (e) notes, comprising a summary of significant
> accounting policies and other explanatory information."
> — Module 3, ¶3.17 (module text, not independently confirmed against the MPERS PDF)

**Statement-title candidates, corroborated across three independent sources** (module text, KPMG's
2016 WSME pack, NK Associates' FY2023 pack — all three use identical titles, giving this HIGH
confidence even absent a direct MPERS PDF read): **Statement of Financial Position** ·
**Statement of Comprehensive Income** (or, if the two-statement option is taken, a separate
**Income Statement** + **Statement of Comprehensive Income**) · **Statement of Changes in Equity** ·
**Statement of Cash Flows** · **Notes to the Financial Statements**.

**§3.22 (title flexibility) — CANDIDATE:** "An entity may use titles for the financial statements
other than those used in this Standard as long as they are not misleading." This is the license the
firm-house-style layer (layer 3, reporting-part2 §6) presumably relies on — flagged as relevant to
that layer, not redesigning it.

### 3.2 The single-statement vs two-statement option — CANDIDATE, numbering UNVERIFIED

Two rules govern this (module text, ¶3.18–3.19 and ¶5.3–5.4/¶5.2 — **see checklist item 3, the
numbering conflict**):

> "If the only changes to equity during the periods for which financial statements are presented arise
> from profit or loss, payment of dividends, corrections of prior period errors, and changes in
> accounting policy, the entity may present a single statement of income and retained earnings in
> place of the statement of comprehensive income and statement of changes in equity."
> — Module 3, ¶3.18; independently corroborated verbatim by KPMG's WSME 2016 note-reference table
> under **its own citation "3.18"** — this one number IS corroborated across both sources.

> "If an entity has no items of other comprehensive income in any of the periods for which financial
> statements are presented, it may present only an income statement or it may present a statement of
> comprehensive income in which the `bottom line' is labelled `profit or loss'."
> — Module 3, ¶3.19; KPMG's WSME cites the same text under **"3.19"** — also corroborated.

> "An entity presents its total comprehensive income for a period either: (a) in a single statement of
> comprehensive income... or (b) in two statements — an income statement and a statement of
> comprehensive income..."
> — Module 5 calls this **¶5.3/5.4**; KPMG's WSME cites the identical rule as **¶5.2**. UNVERIFIED
> which number the MPERS Standard itself carries.

**Statement of Income and Retained Earnings — the combined-statement option (Section 6) — CANDIDATE:**

> "The statement of income and retained earnings presents an entity's profit or loss and changes in
> retained earnings for a reporting period... in place of a statement of comprehensive income and a
> statement of changes in equity if the only changes to its equity... arise from profit or loss,
> payment of dividends, corrections of prior period errors, and changes in accounting policy."
> — Module 6, ¶6.4. Minimum additional content (¶6.5): retained earnings at period start · dividends
> declared/paid or payable · restatements for prior-period-error corrections · restatements for
> accounting-policy changes · retained earnings at period end.

### 3.3 Required minimum line items, by statement — CANDIDATE

**SoFP (¶4.2)** — 18 line items, QUOTED from Module 4: cash and cash equivalents · trade and other
receivables · financial assets (excl. the below) · inventories · property, plant and equipment ·
investment property at cost less depreciation/impairment · investment property at fair value through
P&L · intangible assets · biological assets at cost less depreciation/impairment · biological assets
at fair value through P&L · investments in associates · investments in jointly controlled entities ·
trade and other payables · financial liabilities (excl. trade payables and provisions) · current-tax
liabilities and assets · deferred-tax liabilities and assets (**always non-current**) · provisions ·
non-controlling interest (within equity) · equity attributable to owners of the parent.

**Current/non-current test (¶4.4–4.8), CANDIDATE, paraphrased (not quoted at length — see the primary
PDF for the exact conditions):** an asset is current if realized/held for sale/consumed in the normal
operating cycle, held primarily for trading, expected to be realized within 12 months, or is
unrestricted cash; all other assets are non-current. Liabilities mirror this test. **This is a
judgement TEST applied per item, not a static list** — relevant to §4 flag 5 below.

**SoCI (¶5.5)** — QUOTED, minimum line items: revenue · finance costs · share of profit/loss of
equity-method associates/joint ventures · tax expense · a single discontinued-operations total ·
profit or loss · each item of other comprehensive income by nature (grouped by
reclassifiable/non-reclassifiable) · share of OCI of equity-method investees · total comprehensive
income. **Expense analysis by nature or function is an explicit choice** (¶5.11 per KPMG's WSME
citation — module text does not use this number; relevant to §4 flag 3).

**SOCE (¶6.3)** — QUOTED, minimum content: total comprehensive income for the period, split
owners/non-controlling interest · retrospective-adjustment effects per component of equity · a
beginning-to-end reconciliation per component, separately showing profit/loss, OCI, and
owner transactions (share issues, treasury shares, dividends/distributions, ownership-interest
changes not resulting in loss of control).

**Statement of Cash Flows (¶7.3–7.4)** — QUOTED: "An entity shall present a statement of cash flows
that presents cash flows for a reporting period classified by operating activities, investing
activities and financing activities." Operating activities are defined as "the principal
revenue-producing activities of the entity."

**Notes (¶8.2–8.4)** — QUOTED, standard order: (a) a statement of compliance with the Standard;
(b) a summary of significant accounting policies; (c) supporting information for FS line items, in
statement/line-item sequence; (d) any other disclosures. Accounting-policy disclosure (¶8.5) covers:
the measurement basis/bases used, and other policies relevant to understanding the statements.

## 4. δ classification-seed cross-check — flags only, no redesign

Against `wave-e-design-reporting.md` §3.3's seeded ratio list (current ratio · quick ratio · gross
margin % · net margin % · revenue growth % · debtor days · creditor days · stock turnover · gearing ·
expense-to-revenue ratios) and §2.2's account-set model (a selector resolving to a frozen account-id
list per version):

1. **Quick ratio** — MPERS's ¶4.2 SoFP line items separate "inventories" (d) from "trade and other
   receivables" (b), but list no explicit "prepayments" line. Conventional quick-ratio practice
   excludes prepayments alongside inventory from "quick assets." **Flag:** confirm the seed's quick
   assets account-set excludes prepayments/other non-trade current assets, not inventory alone.
2. **Gearing** — ¶4.2(m) "financial liabilities" is one line but can bundle interest-bearing
   borrowings with non-debt financial liabilities (e.g. derivatives). **Flag:** confirm the gearing
   account-set binds specifically to borrowings, not the whole ¶4.2(m) line, or gearing overstates.
3. **Stock turnover** — needs a cost-of-sales figure, but ¶5.11 (KPMG's WSME numbering) makes the
   by-nature/by-function expense analysis an **explicit choice**; a by-nature filer has no
   face-of-statement "cost of sales" line at all. **Flag:** confirm stock turnover's cost-of-sales
   account-set is defined at the GL/account-code level, independent of the entity's chosen SoCI
   presentation format — otherwise the ratio is uncomputable for by-nature filers.
4. **Debtor days / creditor days** — ¶4.2(b)/(l) are *combined* "trade **and other**
   receivables/payables" lines. A debtor-days ratio should be trade-only. **Flag:** confirm the δ
   seed's `trade_debtors`/`trade_creditors` account-sets are TRADE-ONLY subsets, not aliases of the
   statutory presentation-map's account-set for the combined SoFP line — aliasing would silently pull
   in non-trade receivables/payables (staff advances, deposits, tax recoverables) into a ratio that
   should exclude them. This is the same wrong-answer-that-looks-right class E-R4 was ratified against.
5. **Current ratio / current-asset classification generally** — ¶4.4–4.8's test is a **judgement test
   per item** (operating cycle, held-for-trading, 12-month horizon, restriction status), not a static
   list. If the δ account-set model resolves current/non-current via a static, frozen selector (as
   §2.2/§2.4 describes for the whole account-set mechanism), that is a **simplification** — pushing the
   judgement call to chart-of-accounts design time (each GL account pre-tagged current/non-current by
   the accountant) rather than a per-transaction dynamic test. **Flag:** confirm this simplification is
   explicit somewhere (design doc or seed comment), not silently assumed — it is very likely the right
   practical call, but the design's own E-R4/Law-2 discipline elsewhere insists assumptions are named.

None of these require redesigning the seed; they are cross-checks against the official line-item list
for the owner to confirm or wave off in the 30-minute sitting.

## 5. Source log

| # | URL | Fetched | What it returned |
|---|---|---|---|
| 1 | `masb.org.my/pages.php?id=20` | 2026-08-11 | Standards hub — rendered HTML, read successfully |
| 2 | `masb.org.my/pages.php?id=614` | 2026-08-11 | MPERS (2016) page — rendered HTML, read successfully; PDF hrefs extracted from the HTML but not independently fetched |
| 3 | `masb.org.my/pages.php?id=615` | 2026-08-11 | MPERS (2025) page — rendered HTML, read successfully; same href caveat |
| 4 | `masb.org.my/press_list.php?id=490` | 2026-08-11 | Press release text — rendered HTML, read successfully |
| 5 | `masb.org.my/pdf/MPERSDec2016_website.pdf` | 2026-08-11 | **Empty response** — not a login wall, not a 403; the fetch tool returned no content and saved no bytes. Distinct failure mode from items 6–10 below |
| 6 | `masb.org.my/pdf_file/MPERS_2025_BC_IE.pdf` | 2026-08-11 | Empty response, same failure mode as #5 |
| 7 | `masb.org.my/pdf.php?pdf=MPERS%202025.pdf&file_path=pdf_file` | 2026-08-11 | Empty response, same failure mode |
| 8 | `www.pwc.com/my/en/assets/publications/alert124-mpers.pdf` | 2026-08-11 | HTTP 403 Forbidden (a different, more diagnostic failure than #5–7) |
| 9 | `akademi.audit.gov.my/en/component/abook/book/2-buku/2-illustrative-mpers-financial-statements-with-commentaries` | 2026-08-11 | Server-side rejection ("URL was rejected") — no document reachable |
| 10 | `reg.upm.edu.my/.../MPERS%20Std%202016_Final_23Feb2016.pdf` | 2026-08-11 | Connection refused |
| 11 | `ifrs.org/.../smes/module-03.pdf` through `module-08.pdf` (six files) | 2026-08-11 | **Downloaded successfully** (binary PDF, saved to a local scratch path); text extracted locally with `pdftotext -layout` (mingw64/poppler) and read directly — this is how every §3 quote was obtained |
| 12 | `assets.kpmg.com/content/dam/kpmg/my/pdf/Wonderful-SME-Sdn-Bhd-Illustrative-Financial-Statements-2016.pdf` | 2026-08-11 | Downloaded successfully; text extracted locally; confirms statement titles and gives MPERS-numbered paragraph citations (§3.2) |
| 13 | `nk.com.my/cdn/pdf/MPERS_Illustrative_Financial_Statements.pdf` | 2026-08-11 | Downloaded successfully; text extracted locally; confirms statement titles (§3.1) |
| 14 | `mia.org.my/wp-content/uploads/2022/07/MIA_MPERS_FAQs.pdf` | 2026-08-11 | HTTP 403 Forbidden |
| 15 | WebSearch queries (MASB/MPERS entry points, illustrative-FS lists, Big-4/mid-tier packs, paragraph-number cross-checks) | 2026-08-11 | Multiple queries — see inline citations above; used to locate items 1–14 and to identify candidate publishers not otherwise found |

**Access-limitation summary for the owner:** every `masb.org.my`-hosted PDF (items 5–7) failed to
return content to this session's tools, with a failure signature distinct from an explicit
login/paywall (no 401/403, just empty). This could be a bot-defense measure, a User-Agent block, or a
transcription error in the href extracted from the HTML page. **It is not evidence the documents don't
exist or aren't free** — items 2–3's page text explicitly describes them as free downloads. The
IFRS-for-SMEs and third-party-preparer PDFs (items 11–13) fetched cleanly by contrast, which is why
this package's wording candidates come from those, not from MASB's own bytes.
