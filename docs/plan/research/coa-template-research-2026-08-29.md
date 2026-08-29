# 裁-21 chart-of-accounts template — RESEARCH DOSSIER (2026-08-29)

> **Owner ruling this dossier executes under** (`coa-template-gate-record.md` folded against
> `rulings-0829-sitting.md` 裁-21): *"你自己找到了 best practices 后不用我审, 直接用"* — the
> template is **research-derived and ships without owner review**. This dossier is the rigour
> that stands in for that review. It answers gate questions **Q1–Q2, Q7–Q8, Q10–Q12** with
> evidence; **Q3–Q6, Q9** are mechanism/wording questions already ruled and not re-litigated here.
> Companion file: `coa-template-2026-08-29.json` — the machine-readable draft.

## 大白话摘要（六行)

1. **马来西亚没有官方的标准会计科目表** — MPERS、LHDN、SSM 都不发一份"科目表"；MPERS 只规定资产
   负债表和损益表最少要列哪些项目，账户编号和名称要会计师自己定。这份研究就是在没有官方模板的情况
   下，找到马来西亚主流做法，自己拟一份。
2. **编号方式：选 4 位数分区块**（1000 资产 / 2000 负债 / 3000 权益 / 4000 收入 / 5000 销售成本 /
   6000 费用 / 9000 系统科目），**不是因为"公司一直这样做"，而是三家调查过的软件
   （Bukku、Sage UBS、NCL）加上 QuickBooks 的建议编号都用这个方式**；而市占率最高的三家桌面软件
   （AutoCount、SQL Account、QNE）用的"3位数-4位数"编号，结构上跟 ROME PROPERTIES 沿用的
   `300-000` 一模一样，东主明确说过这个不能用，所以已经排除了。
3. **LHDN 需要单独科目的税务调整项目找齐了**，每一项都附上具体的 Public Ruling 编号或所得税法条文
   （交际费 50% 限制、批准/未批准捐款、罚款、折旧 vs 资本免税额、假期旅费、私人开支、车辆开支、
   一般坏账准备金不可扣税、俱乐部会费不可扣税）——比原本设计文件建议的 8 项多了 2 项。
4. **法定代扣代缴科目命名**：采用主流软件常见的"XX Payable"格式（EPF Payable、SOCSO Payable、
   EIS Payable、PCB (MTD) Payable），HRDF 没有任何软件确认过默认科目名，属于证据最弱的一项，
   已在下面注明。
5. **股权科目按公司类型分三套**：私人有限公司（Sdn Bhd/Bhd）用股本+保留盈余；独资用资本户口+
   往来提款（没有"往来账户"，那是合伙企业才有的）；合伙企业用合伙人资本户口+往来账户+提款,
   三套都有专业资料佐证。
6. **草稿共 101 个科目**，落在主流软件默认科目表的常见区间（80–150个），没有画蛇添足。四项**找不到
   官方来源**的地方已经列在文末，其中最重要的是：SSM 的 MBRS 2.0 最新分类表（SSMxT）读不到完整
   内容，HRDF 默认科目名称、以及"未审批公积金供款"（s.39(1)(c)）没有专属 Public Ruling。

---

## 0 · Method and provenance

Four parallel research passes ran 2026-08-29 (WebSearch/WebFetch, no code changes), covering:
**(A)** the official standards frame — MPERS/MFRS/CA2016/sole-prop-partnership presentation;
**(B)** the LHDN add-back list with Public Ruling citations; **(C)** a nine-product Malaysian
accounting-software catalog survey; **(D)** MSIC 2008 Sections/Divisions and industry-family
grounding. Every claim below is traceable to one of those four passes; URLs and fetch dates are
carried through. Where a primary `hasil.gov.my`/`ssm.com.my`/`dosm.gov.my` document could not be
fetched directly (connection refused, 403, or unparseable PDF binary — a recurring environment
limitation, not a research shortcut), the fallback to a secondary source is stated explicitly next
to the claim, never silently.

**Which existing design text this dossier extends, not discovers.** `coa-template-annexes.md`
Annex A already established the source-ladder skeleton (no official CoA exists; MPERS ¶4.2/¶5.5
rank 1; SSMxT rank 2 but only a 2022 draft was reachable) on 2026-08-29 by an earlier lane the same
day. This dossier **re-verifies** that skeleton against fresh fetches (§1), and then goes beyond it
into the parts the design left as gate questions: numbering (§2), the LHDN add-back list (§3),
statutory-payable naming and the software catalog (§4), equity-by-entity-type (§5), and industry
families keyed to MSIC (§6).

---

## 1 · The standards frame, re-verified (Q1's ground, and the basis every family cites)

### 1.1 MPERS — no substantive change to the minimum-line-item lists in the 2025 edition

MASB issued **MPERS (2025)**, aligned to the IFRS for SMEs Accounting Standard *Third Edition*
(IASB, February 2025). Effective for annual periods beginning on or after **2027-01-01**, early
adoption permitted. — Source: [MASB — MPERS (2025)](https://www.masb.org.my/pages.php?id=615),
fetched 2026-08-29; [MASB press release](https://www.masb.org.my/press_list.php?id=490), fetched
2026-08-29.

**Load-bearing finding for this template:** IFRS.org's own official markup document, comparing the
2015-basis text to the Third Edition (Feb 2025) text word-for-word, shows **paragraph 4.2's
statement-of-financial-position minimum line items and paragraph 5.5's statement-of-comprehensive-
income minimum line items are UNCHANGED IN SUBSTANCE** — only cross-reference edits (e.g. "(e)…
including bearer plants in the scope of Section 17"). No line item was added or removed. — Source:
[IFRS for SMEs Accounting Standard Third Edition with markup](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2025/ifrs-for-smes-standard-markup.pdf),
fetched and PDF-extracted 2026-08-29, dated February 2025, © IFRS Foundation. **Consequence: the
prior lane's ¶4.2/¶5.5 spine stands unchanged through the 2025 transition — no rework needed.**

**No separate "MFRS for SMEs" exists in Malaysia.** MASB's own "Approved Accounting Standards for
Private Entities" page lists exactly two options — MFRS (full IFRS-equivalent) or MPERS — no third
SME-scoped MFRS variant. — Source:
[MASB — Approved Accounting Standards for Private Entities](https://www.masb.org.my/pages.php?id=20),
fetched 2026-08-29.

### 1.2 SSM MBRS 2.0 / SSMxT — still the 2022 taxonomy, now confirmed LIVE (not merely drafted)

**Refines, not contradicts, the earlier lane's finding.** SSM's own current MBRS 2.0 overview deck
(filename dated 2024, describing the actual September 2024 go-live — this is SSM's live-system
documentation, not a stale draft) confirms the deployed taxonomy is still **SSMxT_2022v1.0**, built
on IFRS Taxonomy 2022 + Companies Act 1965/2016 requirements, run through MBRS Preparation Tool
(mTool) v2.1 / MBRS Portal (mPortal) v2.0. — Source: SSM,
["AD 2024 – Overview of MBRS v2"](https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf),
fetched and PDF-extracted 2026-08-29.

- **FS-MPERS entry point (the one relevant to this template): 2,375 total reporting concepts**
  (1,211 IFRS-for-SME-2022-based + 1,164 SSMxT-specific). FS-MFRS carries 6,197. — Same source,
  "Table 3: Reporting concepts."
- **No SSMxT version newer than 2022 was found anywhere**, including in this 2024-dated go-live
  material — the taxonomy content itself has not been re-versioned even though the *platform*
  (MBRS 2.0) and its mandatory phase-in have moved forward. Phase-in is now **complete**:
  unaudited FS (CA 2016) from 1 Dec 2024, audited FS (CA 1965 legacy entities) from 1 Mar 2025,
  audited FS (all CA 2016 companies) from **1 Jun 2025** — matching the earlier lane's "mandatory
  from 2025-06-01" finding exactly.
- **Still not obtained: a plain-English GL/line-item breakdown of SSMxT's 2,375 FS-MPERS
  concepts.** The formal architecture-document PDFs (`SSMxT2022_Architecture_Document.pdf`, the
  overview deck above) resisted text extraction beyond the aggregate counts reported. **SSMxT
  remains a cross-check the design intended (`coa-template-design.md` D-13 item 2), not something
  this dossier could diff the family list against at the element level.** Named as a standing gap,
  not papered over — see §7.

### 1.3 Companies Act 2016 — presentation sections beyond ss.245/246, read from primary text

Read directly from the Attorney General's Chambers consolidated Act 777 text (reprint 1.8.2022,
still SSM's own currently linked version). — Source:
[Laws of Malaysia, Act 777](https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/1738979_BI/Act%20777-%20Final%20Draft%20(1.8.2022).pdf),
fetched and PDF-extracted 2026-08-29.

- **s.249(1):** FS must give a true and fair view **in accordance with approved accounting
  standards** (MFRS/MPERS) — this is the section that anchors "no prescribed line format, only a
  standards-conformant outcome," confirming the MPERS ¶4.2/¶5.5 spine is the right one to build a
  template against.
- **s.253 + Fifth Schedule:** the directors' report's mandatory contents (net profit/loss after
  tax, material reserve/provision transfers, share/debenture issues, director particulars) — not a
  chart of accounts, but the closest CA 2016 comes to prescribing *content*.
- **The "Ninth Schedule" (a name sometimes recalled from the old Companies Act 1965) is, under CA
  2016, "Powers of Judicial Manager" — unrelated to FS presentation.** CA 2016 carries **no**
  schedule prescribing FS line-item format. This closes an open question cleanly: there is no CA
  2016 instrument to check the template against beyond s.249(1)'s "approved accounting standards"
  pointer, which loops back to MPERS.

### 1.4 Sole proprietors and partnerships — genuinely no prescriptive standard, confirmed

MPERS's own scope is defined by reference to CA 2016's definition of a "private company"
(effective 2017-02-28) — sole proprietorships and partnerships, registered under the Registration
of Businesses Act 1956, are **not companies under CA 2016** and so **MPERS does not apply to them
by its own defined scope**; any MPERS-style presentation they use is professional convention, not
compulsion. — Source: [MASB — revised Private Entity definition](https://www.masb.org.my/press_list.php?id=276),
fetched 2026-08-29 (confirms the effective date and CA-2016-linked rationale; the exact
definitional wording is corroborated only via secondary sources — flagged in §7).

What actually governs their bookkeeping is **LHDN Public Ruling No. 5/2000 (Revised), "Keeping
Sufficient Records (Persons Other Than Companies)"** — records must "enable a true and fair profit
& loss account and balance sheet to be prepared," retained ≥7 years, with **no mandated
presentation standard or line-item format**. — Source:
[PR 5/2000 (Revised)](https://phl.hasil.gov.my/pdf/pdfam/PR5_2000_Rev.pdf) — **direct fetch was
refused (connection blocked) in this research pass; the claim rests on a search-indexed excerpt of
the PDF's content, not a direct primary read. Flagged in §7.**

**Plain conclusion, stated because it settles a design assumption:** there is no compulsory
accounting-presentation standard for a Malaysian sole proprietorship or partnership. A template
built to MPERS's minimum line items is a professional-convention choice for these entity types,
not a statutory one — and that is exactly the posture `coa-template-design.md` D-13 already takes
("the codes… are the FIRM's, authored as DATA").

---

## 2 · Numbering — Q2, ruled "neither legacy convention," research-earned choice

### 2.1 What the survey found, product by product

Nine Malaysian accounting products were surveyed (`coa-template-research` software pass, all fetch
dates 2026-08-29). Two convention families emerged, cleanly:

| Convention | Products (evidence quality) |
|---|---|
| **3-digit-main + dash + 3-4-digit sub-account** (`XXX-0000` / `XXX-000`) | **AutoCount** (confirmed via a real client-generated COA export PDF), **SQL Account** (confirmed via a COA PDF, e.g. `EPF-STAFF = 420-000`), **QNE** (confirmed via its own account-format screenshot, shown as the pre-change default) |
| **4-digit block + optional dash/slash sub-account suffix** (`1000` / `1000-00` / `1000/000`) | **Bukku** (confirmed via its own KB article — "5000 - Sales Income," "1000-00 - Petty Cash"), **Sage UBS** (confirmed — `1000/000 CAPITAL`, `2000/000 FIXED ASSETS`…), **NCL** (confirmed — `xxxx/xxx`, "all expenses accounts start with 9xxx/000") |
| **Neither / vendor-proprietary, MY firms override by hand** | **Xero** (its own generated export uses UK-derived ranges like 200-270/610-630/800-877; a Malaysian Xero-partner blog explicitly recommends MY practitioners replace it with a simpler 100-xxx/200-xxx/400-xxx scheme) |
| **No numbering by default (opt-in only)** | **QuickBooks Online** — Intuit's own docs confirm account numbers are **off by default** platform-wide; once enabled, Intuit's *own suggested ranges* follow the classic 1000s/2000s/3000s/4000s/5000s-6000s block convention |
| **Insufficient evidence to classify** | Financio, Million, Biztory (KB pages 403'd or non-existent; see §7) |

**The three highest-installed-base desktop incumbents (AutoCount, SQL Account, QNE) converge on
the 3-digit-dash form — but that form is structurally the SAME shape as ROME PROPERTIES' carried-
down `300-000` chart** (`coa-template-survey.md` §2.4: `300-000` TRADE DEBTORS, `400-000` TRADE
CREDITORS — a 3-digit prefix, a dash, a 3-4-digit suffix), which the owner's ruling explicitly
names as one of the two forms **not** to pick ("不要用旧的东西" — 裁-21 rulings, Q2). RPR's chart
was itself carried down from a predecessor accountant almost certainly running one of these three
incumbent packages — so choosing the 3-digit-dash convention here would, in substance, be
re-adopting the exact form the owner ruled out, even though it happens to be the majority
installed base.

### 2.2 The decision, and why it is research-earned rather than habit

**Chosen: 4-digit numeric codes, one block per `account_type`, no dash** —
`1xxx` asset · `2xxx` liability · `3xxx` equity · `4xxx` income · `5xxx` cost of sales
(numbering-only distinction; `account_type` stays `expense` — `coa_template_accounts`' CHECK caps
`account_type` at five values, so "cost of sales" is never its own type) · `6xxx` operating
expense · `9xxx` system roles.

This is **not** the estate seed's plain habit reused uncritically — it is independently earned on
four legs: **(1)** three of the eight software products with confirmed numbering evidence (Bukku —
the one genuinely cloud-native Malaysian SaaS in the survey and Clara's closest product analog,
Sage UBS, NCL) converge on this exact block shape; **(2)** QuickBooks' own suggested ranges, once a
user opts into numbering, follow the identical convention; **(3)** it is the textbook GAAP
convention taught and expected across every jurisdiction, which lowers onboarding friction for
staff trained outside Malaysia-specific packages; **(4)** it fits the *existing, already-shipped*
`ck_coa_account_code_0009` CHECK's first branch (`^[0-9]{4,8}$`) with no dash-parsing needed,
whereas the 3-digit-dash form is the CHECK's *second* branch — the one RPR already occupies and the
one the ruling forecloses.

**What is deliberately NOT adopted, and why, stated so a reviewer sees the road not taken:** the
3-digit-dash sub-account suffix mechanic (Bukku's `1000-00`, Sage UBS/NCL's `1000/000`) that lets a
vendor nest sub-accounts under a 4-digit parent. This template instead reaches sub-account
granularity by spacing plain codes within each block (e.g. `1000`/`1010`/`1020`/`1030` for cash
variants) — simpler, needs no second CHECK branch, and matches the design's own account-code CHECK
exactly with zero drift risk (Annex C cell 15's drift-guard has nothing to guard against a
numbering form the template never uses).

---

## 3 · LHDN add-back classes — Q8, "not fixed to the eight proposed"

Nine classes were researched with citations (each cross-checked against the ITA 1967 section and,
where one exists, the governing Public Ruling number + year — see the sibling research pass for the
full per-item source table). **Two classes beyond the design's original eight are added here**,
because the ruling explicitly opens the list to what the research finds, not what was pre-guessed:

| Class | ITA 1967 / PR | Rule (compressed) |
|---|---|---|
| `entertainment` | s.39(1)(l)/s.18; **PR 4/2015** (29 Jul 2015, current — cross-referenced as still operative by PR 5/2022) | 50% deductible by default; eight named exceptions are 100% deductible (staff entertainment, sales-related entertainment, promotional samples/gifts, public-facing cultural/sporting sponsorship, etc.) |
| `donations_approved` | **s.44(6)** | Gifts to Government/State/local authority: fully deductible, no cap. Gifts to a DGIR-approved institution: deductible up to **10% of aggregate income**. |
| `donations_unapproved` | s.44(6) (by omission) | Not within s.44(6) at all — non-deductible. |
| `fines_and_penalties` | s.39(1) general prohibition, read with s.33(1)'s "wholly and exclusively" test; case law (*Aspac Lubricants (M) Sdn Bhd v KPHDN*) | Fines, penalties, compounds and traffic summonses fail the income-production test — non-deductible. **No dedicated PR exists**; this is the one class resting on the bare section plus case law. |
| `depreciation_and_amortisation` | s.39(1)(k) disallows accounting depreciation; s.19 + Schedule 3 substitute capital allowances; **PR 12/2014** (qualifying plant/machinery, 31 Dec 2014) + **PR 6/2015** (QE computation, 27 Aug 2015) | Book depreciation is always added back; capital allowance is computed separately per Schedule 3. |
| `leave_passage` | s.13(1)(b) (employee-side BIK); **PR 1/2003** (5 Aug 2003) | The **fare** portion of a leave-passage benefit is non-deductible to the employer, local or overseas alike; any food/accommodation/incidental portion is instead treated (and restricted) as **entertainment**, not leave passage. Employee-side exemption: one overseas trip/year capped at RM3,000 (fares), plus up to three local trips/year, uncapped. |
| `private_and_proprietor_expenses` | **s.39(1)(a)** | Domestic/private expenditure — non-deductible regardless of how it is booked; the standard home for a sole proprietor's personal costs run through the business ledger. No dedicated PR (general-principle class). |
| `motor_vehicle_running_costs` | Schedule 3 Para 2/2A (QE cap for non-commercial vehicles, computed per **PR 6/2015**); running-cost apportionment under s.33(1)/s.39(1)(a) | Non-commercial-vehicle QE capped at **RM100,000** (new, cost ≤RM150,000) or **RM50,000** (otherwise); running costs for mixed-use vehicles are apportioned business:private, private share disallowed. |
| **`club_subscriptions_and_entrance_fees`** *(new — not in the design's original eight)* | **s.39(1)(m)** | Club entrance fees and subscription fees are **specifically** non-deductible — a standalone disallowance distinct from the entertainment 50% rule, so it should not be folded into `entertainment`. |
| **`doubtful_debts_and_provisions`** *(new — not in the design's original eight)* | **s.34(2)** (bad/doubtful debts); **PR 4/2019** (24 Sep 2019, replacing PR 1/2002); **s.39(1)(c)** (unapproved retirement/provident funds) | A **specific** provision (individually assessed, evidenced) is deductible; a **general** provision (e.g. a flat % of receivables, the MFRS 9 ECL-modelling norm) is **not** — the exact split a mixed "bad debts" account hides. Contributions to an **unapproved** pension/provident/widows-and-orphans fund are non-deductible under s.39(1)(c). |

**Why these two earn a place and were not simply left folded into existing families.** `s.39(1)(m)`
is a clean, standalone statutory disallowance with no percentage or apportionment logic — exactly
the shape D-14 says deserves "a clean account rather than an apportioned share of a mixed one." The
doubtful-debts split is the sharper case: MPERS/MFRS 9-style expected-credit-loss provisioning is
now standard financial-reporting practice, and a general provision computed that way is *routinely*
non-deductible — without a dedicated account the tax computation cannot tell a client's IFRS9-style
provision from a specific, evidenced write-off without re-reading every journal.

**Considered and deliberately NOT added as its own family:** medical/dental employee benefits
(**PR 11/2019**, **PR 5/2019**) — these are **exempt BIK**, i.e. cleanly deductible with *no*
add-back, so isolating them serves hygiene, not tax computation; left inside the core
`employment_costs` family. Pre-commencement expenses — a real principle (s.32/s.33(1), a business
must have "commenced" before its expenses are deductible) but **no dedicated PR was found** and it
is a *temporal* condition on the whole set of accounts, not a class of transaction a single GL
account can isolate — recorded here as considered, not built.

---

## 4 · Statutory-payable naming — Q11, "mainstream Malaysian naming, per the research"

Confirmed exact strings, by source:

| Software | Confirmed names |
|---|---|
| **Bukku** (KB article, direct quote) | "EPF Control," "SOCSO Control," "EIS Control," "**MTD** Control" (uses the LHDN technical term, not "PCB"), "Salary Control," "SST Payables," "SST Deferred" |
| **QNE** (payroll-export mapping screen, direct quote) | "EPF Payable," "SOCSO Payable," "EIS Payable," "Salary Control" |
| **AutoCount** (own advisory guidance, not a confirmed shipped default) | "EPF Payable (Employee)," "EPF Payable (Employer)," "SOCSO Payable (Employee)," "SOCSO Payable (Employer)," "Salary Payable (Net)" — recommends splitting employee/employer portions |
| **SQL Account** (COA export, terse internal codes) | `EPF-STAFF`, `SOCSO-STAFF` — not display-quality names |

**Decision: "[Item] Payable," not "[Item] Control."** Two of the three directly-confirmed sources
(QNE, AutoCount's guidance) use "Payable"; only Bukku uses "Control." "Payable" is also the plain-
English term the gate record's own fail-closed default already used, so this is convergence, not a
coin flip. **PCB vs MTD:** Bukku's use of the LHDN technical term ("MTD") is the more precise label,
but "PCB" (Potongan Cukai Bulanan) is what every Malaysian preparer actually says — the template
carries **"PCB (MTD) Payable"** so both readings land on the same account without renaming.

**Not split into employee/employer sub-accounts by default.** Only AutoCount's advisory blog
content — not a confirmed shipped default in any surveyed product — recommends the split; neither
of the two products whose *default* naming was directly confirmed (QNE, Bukku) splits it. Given the
"aim for the size mainstream software ships, not a maximal list" instruction, the template keeps
one payable account per statutory scheme; a firm that wants the employee/employer split can add it
through `add_coa_template_family` / `upsert_account` (both already-designed doors), unchanged by
this dossier.

**HRDF (HRD Corp levy) — the weakest-evidenced name in the set, admitted as such.** No surveyed
product confirmed a shipped default "HRDF Payable" line; it appears only inside payroll-module
compliance-calculation documentation, never as a named chart-of-accounts row. Included anyway
(`2140`/`6040`) because HRDF registration and levy payment is mainstream statutory practice for
Malaysian SMEs above the registration threshold and a firm needs somewhere to book it — but this is
the one statutory name in the template that rests on inference from payroll-compliance convention
rather than a confirmed shipped default, and is named as such in §7.

---

## 5 · Equity by entity type — Q10

**Sdn Bhd / Bhd.** CA 2016 **s.74 abolished par value** for all shares — issued before or after the
2017-01-31 commencement — so a modern Sdn Bhd's equity is simply **Share Capital** (no separate
"Share Premium" line for new issuances; any pre-existing share-premium balance was absorbed into
share capital at commencement, and the transitional-use window on that legacy balance, s.618(3),
closed around 2019-01-31 and is no longer operative). Confirmed via
[HHQ — Shares & Capital Maintenance](https://hhq.com.my/publications/shares-capital-maintenance/),
fetched 2026-08-29, corroborated by search-aggregated summaries of ss.74/618(3). Equity structure:
**Share Capital · Retained Earnings · Reserves (named as they arise) · Dividends Paid**, per
IFRS-for-SMEs Module 4 §4.11(f)/§4.12 disclosure norms (unchanged in the 2025 markup, §1.1).

**Sole proprietorship.** Standard convention: **Capital Account** (owner's net investment/retained
interest) and **Drawings** (personal withdrawals), netted against capital at period end — **no
separate "current account"**; that split belongs to partnerships only. — Source:
[ACCA Global — Accounting for partnerships (FA2)](https://www.accaglobal.com/us/en/student/exam-support-resources/foundation-level-study-resources/fa2/fa2-technical-articles/accounting-for-partnerships.html),
fetched 2026-08-29 (general professional-education material, not Malaysia-branded — flagged in §7).
**Constraint 13 relevance, named because it is the design's own worked example:** BEE CREATIVE
SOLUTION's sole proprietor is not an employee — his account is **equity**, exactly this family.

**Partnership.** Each partner holds a **Capital Account** (largely fixed — capital introduced) and a
separate, fluctuating **Current Account** (share of appropriated profit/loss, less drawings);
profit-sharing ratio is set by the partnership deed under the Partnership Act 1961 (not an
accounting standard). — Source: same ACCA article, corroborated by IFRS-for-SMEs Module 4 §4.13's
worked partnership-equity-note example, fetched 2026-08-29.

**Template shape (generic, not per-named-partner):** the template carries pooled "Partners' Capital
Account(s)," "Partners' Current Account(s)," "Partners' Drawings" rows; splitting per named partner
is an editing step at apply time, consistent with 裁-21 Q3's ruling that the proposal is editable
before apply and accounts can be added/removed after.

---

## 6 · Industry families and MSIC 2008 — Q7, Q12

**MSIC 2008 confirmed still live, Section A–U, 21 sections, directly from DOSM's own dictionary.**
— Source: [DOSM MSIC dictionary CSV](https://storage.dosm.gov.my/dictionaries/msic.csv), fetched
2026-08-29 ("last updated 31 Dec 2008"); [OpenDOSM MSIC catalogue](https://open.dosm.gov.my/data-catalogue/msic),
fetched 2026-08-29, same stamp. **Independently reconfirmed still the live key** for SSM
registration and LHDN's MyInvois e-Invoice system as of today — three independent secondary sources
converge (mishu.my, paydibs.com [2026-dated], msicdata.com's e-Invoice guide footer stamped
"MSIC 2008 v1.0"), though no single primary LHDN document was fetched stating this outright — see
§7.

**MSIC 2025 status, confirmed more precisely than the earlier lane's finding.** Launched
**2025-10-28** in Putrajaya (Bernama, [bernama.com/en/news.php?id=2484524](https://www.bernama.com/en/news.php?id=2484524),
fetched 2026-08-29), replacing MSIC 2008 v1.0 after 17 years, aligned to ISIC Rev.5, growing from
1,174 to 1,248 codes. DOSM's own Economic Census 2026 is the first survey to use it (resetting the
statistical base year to 2025); **aggregate published statistics on the new standard are staged from
2027**, matching the design's "routine use from 2027" framing. **No Section-level or any-level
MSIC 2008 ↔ 2025 crosswalk was found published** — a genuine, stated gap (§7), which is exactly why
the trim design's choice to key at Section/Division and stamp the edition (D-8, Q12) is the right
posture rather than a shortcut.

**Section/Division ranges for the sections relevant to this template** (DOSM primary Section list;
Divisions corroborated via a secondary breakdown, mishu.my, since the DOSM PDF itself resisted text
extraction — flagged §7): **A** Agriculture (Div 01-03) · **C** Manufacturing (Div 10-33) ·
**F** Construction (Div 41-43) · **G** Wholesale/Retail Trade (Div 45-47) · **I** Accommodation and
Food Service (Div 55-56) · **L** Real Estate (Div 68) · **M** Professional/Scientific/Technical
(Div 69-75) · **N** Administrative/Support Services (Div 77-82) · **P** Education (Div 85) ·
**Q** Human Health/Social Work (Div 86-88) · **S** Other Service Activities (Div 94-96).

**Industry family grounding, one line each:**

- **Construction** — genuinely MFRS-15-grounded: contract assets/liabilities replace the old
  "amount due from/to customers"; retention (5-10% of certified sum, standard Malaysian practice)
  is a receivable/payable, not part of contract-asset WIP. — MIA MFRS 15 FAQ; ACCA IFRS 15
  explainer; a 2026-dated Malaysian construction-law practitioner note on retention sums
  (satokogyo.com.my), fetched 2026-08-29.
- **Professional services** — WIP/unbilled receivables and disbursements-recoverable are genuinely
  distinct from a trading chart; Malaysia's e-Invoicing guidance explicitly separates disbursement
  (pass-through, excluded from revenue) from reimbursement treatment. — Cygnet e-Invoicing guide,
  fetched 2026-08-29.
- **F&B/hospitality** *(a family the design's Annex B did not yet carry — added here on evidence)*
  — service charge (~10%, distributed to staff, business income) is **not** SST (6%, a Customs
  pass-through liability) and Malaysian F&B accounting practice keeps them on separate accounts;
  this is stated as RMCD's own position on the MySST portal, though the specific "Guide on FnB" PDF
  could not be fetched directly in this pass (flagged §7) — corroborated via two independent
  industry blogs.
- **Property/rental** — quit rent (cukai tanah, State Land Office) and assessment (cukai
  pintu/taksiran, local council) are two genuinely distinct statutory charges, not the same line;
  strata sinking-fund/maintenance is billed separately by the JMB/MC. — nextsix.com, speedhome.com,
  fetched 2026-08-29 (practitioner/property-portal sources, not a primary LHDN/council document —
  flagged §7).

---

## 7 · What this dossier could not verify

1. **The full plain-English element list of SSMxT_2022's FS-MPERS taxonomy** (2,375 concepts) —
   only aggregate counts were obtained; the architecture-document PDFs resisted text extraction in
   this environment. SSMxT remains a cross-check the design deferred (D-13 item 2), not something
   this dossier could diff the family list against.
2. **Direct primary-source text of LHDN Public Ruling No. 5/2000 (Revised)** (sole-prop/partnership
   record-keeping) — network access to `phl.hasil.gov.my` was refused; the claim in §1.4 rests on a
   search-indexed excerpt, not a direct read.
3. **Whether LHDN's MyInvois technical guideline explicitly names "MSIC 2008 v1.0"** as its
   required edition — strong circumstantial confirmation (three independent secondary sources,
   msicdata.com's own footer stamp) but no single primary LHDN document was fetched stating it
   outright; both attempted primary-PDF fetches 404'd.
4. **A published DOSM MSIC 2008 ↔ MSIC 2025 crosswalk, at any level** — none found; this is a real
   absence, not a research shortcut, and is exactly why the template's `msic_edition` stamp matters.
5. **s.39(1)(m)'s (club subscriptions) primary PR text**, and **s.39(1) fines/penalties' primary PR
   text** — neither has a dedicated Public Ruling that could be located; both rest on the bare ITA
   section plus (for fines) case law, stated as such in §3's table rather than presented as PR-level
   authority.
6. **A Malaysia-specific (as opposed to ACCA-global professional-education) source** for the
   sole-proprietor "capital + drawings" / partnership "capital + current account" conventions — the
   accounting *mechanics* are undisputed and cross-confirmed via IFRS-for-SMEs Module 4's own
   worked examples, but no MIA-branded Malaysian practice note was found stating them as local
   convention specifically.
7. **HRDF (HRD Corp levy)'s standard chart-of-accounts name** — no surveyed software product
   confirmed a shipped default line; the template's `HRDF (HRD Corp) Levy Payable` naming is an
   inference from payroll-compliance practice, not a confirmed convention (§4).
8. **Equity conventions for `society` and `cooperative`** (two of the eight live `entity_type` enum
   values) — the equity-by-entity-type research covered only Sdn Bhd/Bhd, sole proprietorship and
   partnership, per the ruled scope of Q10; societies and cooperatives are structurally different
   (member's fund / cooperative shares, governed by the Societies Act 1966 / Co-operative Societies
   Act 1993 respectively, neither researched here) and are **not** covered by any of the three
   `equity_variants` in the companion JSON. A client recorded with `entity_type` = `society`,
   `cooperative`, or `other` gets only the `equity_common` core family (retained earnings) at
   apply time and needs a manual equity build — named here so it is a known gap, not a silent one.
9. **Full readable text of LHDN PR 7/2025** (the current edition of the individual-taxpayer gifts/
   contributions ruling chain) — the PDF fetched but returned unreadable compressed content; its
   scope (individual, not company) was inferred from the hasil.gov.my listing page and partial
   content of an earlier edition in the same chain, not from a direct read of 7/2025 itself.
10. **LHDN's position on deductibility of quit rent/assessment against rental income, versus
    non-deductibility of a strata sinking fund** — sourced only from property-portal
    practitioner blogs, not an LHDN primary ruling.

---

## 8 · What was matched from the existing design set

Per instruction, the account/family shape in `coa-template-2026-08-29.json` was checked against
`coa-template-annexes.md` Annex B (the design's own seed-family sketch) and Annex F (the DDL). The
JSON's `families[]` and `accounts[]` objects carry the **same column names** Annex F's
`coa_template_families`/`coa_template_accounts` tables use (`family_key`, `inclusion`, `basis`,
`msic_sections`, `msic_divisions`, `trade_natures`, `entity_types`, `account_code`, `name`,
`account_type`, `account_class`, `special_acc_type`, `sort_ordinal`) so the build lane can load the
JSON's rows with minimal reshaping, **in addition to** the flatter `tax_sensitive`/`add_back_class`/
`statutory`/`notes` fields the parent task's own schema asked for. Three families in the JSON are
**not** in Annex B's original sketch — `fnb_hospitality`, `club_subscriptions_and_entrance_fees`,
`doubtful_debts_and_provisions` — added on the evidence in §3 and §6, consistent with Q7/Q8's
ruling that the researched list is not fixed to what the design first proposed. All `account_code`
values satisfy the *existing, already-shipped* `ck_coa_account_code_0009` CHECK's first branch
(plain 4-digit numeric) — no DDL change is implied or required by this dossier.
