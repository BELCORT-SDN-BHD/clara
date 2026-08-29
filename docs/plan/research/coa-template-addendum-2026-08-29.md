# 裁-21 chart-of-accounts template — RESEARCH ADDENDUM (2026-08-29)

> Companion to `coa-template-research-2026-08-29.md` and `coa-template-2026-08-29.json` (the
> original 100-account draft). Written in response to the independent PR-a review's finding that
> the draft is missing several MPERS 4.2 face-of-statement items its own D-13 claims as its spine,
> plus a request to resolve `society`/`cooperative` equity (provisional in the original draft) and
> to re-examine whether the ten "(Tax-Split)" families from Q8 should be `core` rather than
> `opt_in`. New file: `coa-template-addendum-2026-08-29.json` — additive, merges by `family_key`
> (upsert) and appends new `account_code` rows.

## 大白话摘要（六行）

1. 审查是对的：原来 100 个科目确实漏了 MPERS 4.2 里明文要求的几项——物业厂房设备（除了车辆之外的
   土地楼房/机器设备/家具办公设备/电脑/装修）、无形资产、银行贷款/租购/融资租赁负债、所得税应付/
   递延税项、董事往来户口/关联公司往来。这次补了 40 个科目，都还是按原来"4位数分区块"的编号方式，
   没有另开新规则。
2. **有三项审查说漏了，其实原稿已经有**：按金(1120)、预付款(1130)、应计费用(2020) 都已存在，
   基本存货(1200) 也已存在——这次没有重复添加，只在文中注明更正审查的说法。
3. 物业厂房设备为什么要按类别分开：不只是会计准则（MPERS §17.31 规定要按"每一类"披露原值和累计
   折旧），更实际的原因是**不同类别的资本免税额税率不一样**（税率数字只写在这份 .md，不进 JSON）。
4. **东主 Q8 的意思重新看了一遍**：原本十个"税务专属科目"家族全部设成 `opt_in`（选择性），
   但 Q8 的原意是"专属科目让报税自动读到"——所以其中 6 个（交际费、批准/未批准捐款、罚款、折旧、
   坏账准备）改成 `core`（每个客户默认都有，不需要选）；剩下 4 个（假期旅费、私人开支、车辆使用费、
   俱乐部会费）确实因人而异，维持 `opt_in`，每项都写了一行理由。
5. 社团（society）权益用"累积基金"（Accumulated Fund/Dana Terkumpul），这是马来西亚全国会计课程和
   社团注册局表格通用的做法；合作社（cooperative）权益用"股本"+"法定储备金"——储备金比例写在法律
   第57(1)条，但这条法律原文没有直接读到，是搜索结果三方比对出来的，**建议正式引用前再核实一次**。
6. 找不到的地方：合作社教育/发展基金的具体百分比（法律授权部长自行决定，没有固定比例）；
   SKM 官方的 GP23 财务申报指南没读到（很可能是最权威的合作社科目表来源，建议以后再补）；
   Sage UBS / NCL 的实际科目表内容没确认到。

---

## 0 · Scope and method

Two parallel research passes ran 2026-08-29, covering (A) the genuinely-missing MPERS 4.2 items
plus the software/statutory evidence behind each addition, and (B) `society`/`cooperative` equity
conventions. All citations below carry URL + fetch date; where a primary-source PDF resisted text
extraction in this environment (a recurring limitation, not a shortcut), the fallback to a
search-indexed excerpt or secondary source is stated explicitly.

**Before adding anything, the addendum checked the original chart against the review's list.**
Three items the review named turn out to **already exist** in `coa-template-2026-08-29.json`:
`1120 Deposits Paid`, `1130 Prepayments`, `2020 Accruals` — all present since the original draft.
Basic inventory (`1200 Inventory / Stock`, plus `1210`-`1230` for manufacturing) is also already
present. **None of these are re-added; this correction is recorded so the review's list is trued,
not silently ignored.** Everything below is a genuine gap.

---

## 1 · The genuinely-missing MPERS 4.2 items

### 1.1 · Property, plant and equipment, by class — MPERS 4.2(e)

The verbatim text of MPERS/IFRS-for-SMEs paragraph 4.2 (extracted directly from the MASB-published
MPERS Feb 2016 standard, word-for-word identical to IFRS for SMEs §4.2) confirms the letter:
**"(e) property, plant and equipment."** The original chart carried only `Motor Vehicles at Cost`
(1400) + its own accumulated depreciation (1410) under the `motor_vehicles` family — no other PPE
class existed at all. — Source: MASB, MPERS (Feb 2016) §4.2, fetched and extracted 2026-08-29.

**Why by class, not one line.** MPERS §4.11(a) requires "subclassifications of the line items
presented... in classifications appropriate to the entity" for PPE, and §17.31(d) requires, **for
each class**, the gross carrying amount and accumulated depreciation at the beginning and end of
the period. A single "Property, Plant and Equipment" account cannot satisfy a by-class disclosure
duty. — Source: same MASB text, §§4.11(a), 17.31, fetched 2026-08-29.

**Confirmed as live Malaysian SME practice, not just a standards technicality.** A real AutoCount-
generated chart of accounts (a genuine client's exported COA, not marketing material) shows exactly
this class split, each paired with its own accumulated-depreciation account: **Furnitures &
Fittings**, **Office Equipment**, **Motor Vehicles**, **ICT & Computer** — each with a matching
`ACCUM. DEPRN. -` sibling account. — Source:
[AutoCount client COA export](https://mnet2u.com/data/cms/files/Chart%20of%20Account.pdf), fetched
2026-08-29. Bukku's Fixed Assets module documentation shows the same per-category cost/accumulated-
depreciation pairing (e.g. "Computer Equipments – Cost" / "Computer Equipments – Accum. Dep.").

**Why the accounts also earn their keep on the tax side (not carried into the JSON as numbers —
this is the reasoning, not a stored figure).** Malaysian capital allowance rates differ genuinely
by asset class under ITA 1967 Schedule 3 — per the PwC *Malaysian Tax Booklet 2024/2025*
(`pwc.com/my`, fetched 2026-08-29, p.27): general plant and machinery carries a 20% initial / 14%
annual allowance; furniture and fixtures and office equipment carry 20% initial / 10% annual; ICT
equipment carries an accelerated rate (20% initial / 20% annual as the standing rate from YA2024,
with a temporary 40% annual-allowance enhancement tied to full e-Invoicing adoption for
YA2024–2025 — the two figures are genuinely different things and this addendum flags the
discrepancy across secondary sources rather than picking one silently, see §5). **A chart that
merges these classes into one account forces a manual split at every capital-allowance computation,
which is exactly the class of cost D-14 already argues against for the tax-split families.**

**Renovation is a real PPE class on the balance sheet even though it mostly gets no capital
allowance.** Structural renovation items (partitions, flooring, walls) do not qualify as "plant"
under Schedule 3; only genuinely severable fixtures within a renovation (air-conditioning units,
electrical systems, signboards) do. The general special renovation tax deduction
(P.U.(A) 381/2020, capped at RM300,000) **expired 2022-12-31** and was not renewed for ordinary
SMEs — Budget 2026 introduced only a narrow RM500,000 version for MOTAC-registered tourism
operators (2025-10-11 to 2027-12-31), irrelevant to a general template. — Sources:
[ktp.com.my](https://ktp.com.my/blog/why-renovation-cannot-claim-capital-allowance/4may2026),
[EY Malaysia FAQ alert](https://ey.com/en_my/technical/tax-alerts/updated-faqs-costs-of-renovation-and-refurbishment-of-business-premises),
both fetched 2026-08-29. The account still belongs on the chart as a balance-sheet PPE class; its
tax non-eligibility is a computation-layer fact, not a chart-of-accounts one.

**Accounts added — family `property_plant_equipment_general`, `core`** (near-universal: even a
purely services SME has office equipment/computers, unlike land/buildings ownership which most
SMEs don't have — see 1.2): `1500`/`1510` Plant and Machinery + its accumulated depreciation,
`1520`/`1530` Furniture and Fittings + accum. depn., `1540`/`1550` Office Equipment + accum. depn.,
`1560`/`1570` Computer and ICT Equipment + accum. depn., `1580`/`1590` Renovation and Leasehold
Improvements + accum. depn. — 10 accounts.

### 1.2 · Owner-occupied land and buildings — MPERS 4.2(e), split from the by-class core set

Most Malaysian SMEs rent their premises (the core `premises_and_admin` family already carries
`6100 Rental of Premises`) — owning the land/building the business operates from is a genuine
minority case, so this is kept **opt_in** rather than folded into the near-universal PPE-by-class
family above. Freehold land is not depreciated under standard practice (indefinite useful life), so
no accumulated-depreciation account is needed for it.

**Accounts added — family `land_and_buildings`, `opt_in`**: `1600` Freehold Land, `1610`
Buildings, `1620` Accumulated Depreciation - Buildings — 3 accounts.

### 1.3 · Intangible assets — MPERS 4.2(g)

Confirmed: MPERS 4.2(g) "intangible assets." A minority case for an SME (software purchased/
capitalised, or goodwill from an acquisition) — kept `opt_in`.

**Accounts added — family `intangible_assets`, `opt_in`**: `1700` Computer Software, `1710`
Accumulated Amortisation - Computer Software, `1720` Goodwill — 3 accounts.

### 1.4 · Borrowings, hire purchase and finance lease obligations — MPERS 4.2(m)

MPERS 4.2(m): "financial liabilities (excluding amounts shown under (l) and (p))" — this is where
bank borrowings, hire-purchase creditors and finance lease obligations live; the original chart had
**none of these at all**, only trade/other payables and statutory payables.

**Hire purchase is a genuinely distinct liability class in Malaysian SME practice, not a bank loan
by another name.** A Hire Purchase Creditor account (purchase price + total HP interest) is paired
with a Hire Purchase Interest Suspense contra-account (the unaccrued interest, released to the P&L
as it accrues) — confirmed via Bukku's own worked Malaysian motor-vehicle HP example
([intercom.help/bukku](https://intercom.help/bukku/en/articles/5898662-recording-a-hire-purchase-transaction),
fetched 2026-08-29), a Million System worked example naming "Hire Purchase – [Financier]" as
distinct from "Amount Owing to Director"
([millionsystem.com.my](https://millionsystem.com.my/how-to-record-hire-purchase-motor-vehicle/),
fetched 2026-08-29), and general accounting-education sources (OpenTuition, Solarsys) describing the
same interest-in-suspense mechanic — **no Malaysia-specific MIA practice-note citation was found
for this convention specifically; it rests on textbook/software convergence, not a single MIA
pronouncement — flagged in §5.**

**MPERS keeps the OLD finance-lease/operating-lease split — it does NOT use MFRS 16's language.**
Confirmed directly from the MASB text: §20.4 classifies a lease as finance or operating by whether
substantially all risks/rewards transfer; §20.9/§20.11 call the finance-lease balance "the
outstanding liability," never "lease liability." **Conclusion: the account is named "Finance Lease
Obligation," scoped only to arrangements that pass the §20.4 finance-lease test — not a blanket
MFRS-16-style on-balance-sheet line for every rental arrangement.** — Source: MASB MPERS text
§§20.4, 20.9, 20.11, fetched 2026-08-29; corroborated by
[ktp.com.my](https://ktp.com.my/blog/accounting-for-lease-mpers-section-20), fetched 2026-08-29.

A Bank Overdraft line is added alongside the term loan split — an extremely common Malaysian SME
short-term facility, distinct in nature (repayable on demand) from a term loan.

**Accounts added — family `borrowings_and_lease_liabilities`, `core`** (bank facilities and hire
purchase are mainstream Malaysian SME financing, not an edge case — the SQL-Account-format evidence
below shows the identical HP creditor/interest-suspense pairing independently of AutoCount's
director-loan evidence, corroborating this is cross-vendor convention): `2400` Bank Overdraft,
`2410`/`2420` Bank Term Loan - Current/Non-Current Portion, `2430` Hire Purchase Creditor, `2440`
Hire Purchase Interest Suspense, `2450` Finance Lease Obligation — 6 accounts.

### 1.5 · Current tax payable, deferred tax, tax recoverable — MPERS 4.2(n)/(o)

Confirmed directly from the MASB text as unconditional recognition requirements, not disclosure-
only: **§29.4** "An entity shall recognise a current tax liability for tax payable..."; **§29.14**
"A deferred tax liability shall be recognised for all taxable temporary differences..." A search for
a citable Malaysian-practice note on SMEs commonly skipping deferred tax on materiality grounds
found nothing definitive — **not claimed here; both accounts are added as genuine MPERS-required
lines.**

**Accounts added — family `tax_liabilities`, `core`** (every profitable entity — and every entity
type this template serves other than a pure pass-through sole proprietorship — genuinely needs a
place to book current tax; the accounts cost nothing when unused): `1140` Tax Recoverable, `1150`
Deferred Tax Asset, `2500` Current Tax Payable, `2510` Deferred Tax Liability — 4 accounts.

### 1.6 · Provisions — MPERS 4.2(p)

Confirmed as a real MPERS-required line (§4.2(p)), but MPERS §21's own recognition test scopes it
to when a present obligation genuinely exists — not every entity has one. No surveyed vendor's
default chart of accounts ships a generic "Provisions" account either. **Judgement call, stated
plainly: one generic account satisfies the letter of 4.2(p) at negligible cost, kept `opt_in`
rather than treated as a priority gap** — this is explicitly a lower-confidence, lower-priority
addition compared to 1.1–1.5, §21's own "undue cost or effort" relief for smaller entities noted
for context (ACCA Global summary, MIA's MPERS FAQ PDF, both fetched 2026-08-29).

**Account added — family `provisions`, `opt_in`**: `2600` Provisions — 1 account.

### 1.7 · Director's current account and amounts due to/from related companies — MPERS §33

Not literally a 4.2 face item, but a real, common Malaysian Sdn Bhd gap the review correctly flagged
under the same review pass. MPERS §33.2(a)(i) names a director as a related party (key management
personnel); §33.9(b) requires disclosure of outstanding related-party balances; §33.12(g) names
loans/finance transfers explicitly as a disclosable transaction class. — Source: MASB MPERS text
§§33.2(a)(i), 33.9(b), 33.12(g), fetched 2026-08-29.

**This is routine, not edge-case, Malaysian Sdn Bhd bookkeeping.** The same real AutoCount client
export cited in §1.1 books `AMOUNT OWING TO DIRECTOR - MR LOW MUN YAO` as its own named GL account.
A Malaysian practitioner guide on director-advance tax risk confirms this is one of the first
ledgers LHDN reviews in an audit. — Sources:
[AutoCount client COA export](https://mnet2u.com/data/cms/files/Chart%20of%20Account.pdf);
[SSAM Group](https://ssam-group.com/blog/advance-to-director-malaysia-tax-risks/), both fetched
2026-08-29.

**Scoped to company entity types only.** Both "director" (a company-law concept) and "related
company" (a group-structure concept) are overwhelmingly company-structure phenomena in Malaysian
SME practice; a sole proprietorship or simple partnership rarely has a formal related-company
arrangement — if it did, incorporation would usually have followed. Kept `opt_in`, keyed to
`entity_types: [sdn_bhd, bhd]`.

**Accounts added — family `director_and_related_party_balances`, `opt_in`, `entity_types:
[sdn_bhd, bhd]`**: `1160` Amount Due from Director(s), `1170` Amount Due from Related Companies,
`2160` Amount Due to Director(s), `2170` Amount Due to Related Companies — 4 accounts.

### 1.8 · Dividends payable — distinct from Dividends Paid

MPERS itself contemplates this distinction: §6.5(b) requires disclosure of "dividends declared and
paid **or payable** during the period." The existing `3800 Dividends Paid` (equity_company family)
is the equity-side distribution account; a declared-but-unpaid dividend is a separate current
liability between declaration and settlement (Dr Retained Earnings / Cr Dividends Payable at
declaration; Dr Dividends Payable / Cr Cash at payment) — a universal accounting mechanic, confirmed
generically (AccountingTools, universalcpareview.com) though **no Malaysia-specific GL-treatment
citation was found beyond the Companies Act 2016 solvency/legal mechanics of declaring a dividend**
(flagged §5).

**Account added — to the EXISTING `equity_company` family** (`opt_in`, `entity_types: [sdn_bhd,
bhd]`, unchanged from the original), not a new family: `2180` Dividends Payable (liability) — 1
account.

---

## 2 · Q8 revisited — which of the ten tax-split families should be `core`

The original draft made all ten "(Tax-Split)" families `opt_in` with empty trim keys. On review,
this undercuts the owner's own Q8 ruling — *"tax-sensitive expenses in their own accounts... so the
tax computation picks them up automatically"* — because an `opt_in` family is, by the design's own
mechanics (`coa-template-design.md` §D-8), trimmed OUT of a proposal unless a bookkeeper explicitly
adds it. If entertainment or fines routinely get trimmed away by default, the tax computation is
back to hunting through a generic expense account for them — precisely the outcome Q8 was ruled to
prevent. The account carries no balance until used, so making one `core` costs nothing when a
client never touches it.

**Test applied per family: is this a risk class ANY Malaysian business can hit, regardless of
industry or entity type — or is it conditional on a specific, less-common business fact?**

| Family | Reclassify to | One-line reasoning |
|---|---|---|
| `entertainment` | **core** | Any client-facing business incurs entertainment costs (meals, gifts) at some point — the 50%/100% split applies near-universally. |
| `donations_approved` | **core** | Corporate giving (zakat-adjacent, CSR, community sponsorship) is common enough across Malaysian SMEs, and the account costs nothing unused. |
| `donations_unapproved` | **core** | Paired with the above — a firm cannot know in advance which bucket a donation lands in without both accounts present. |
| `fines_and_penalties` | **core** | Near-universal — a traffic summons alone makes this likely for any business with a vehicle or a premises. |
| `depreciation_and_amortisation` | **core** | Universal — this addendum alone adds a full PPE-by-class section (§1.1); every business with any capitalised asset needs this account. |
| `doubtful_debts_and_provisions` | **core** | `trade_receivables` (the account this pairs against) is itself a `core` family — nearly every business extends some credit and eventually risks a bad debt. |
| `leave_passage` | opt_in (unchanged) | Conditional on a specific, formal employer benefit policy — a minority of Malaysian SMEs (more common in larger/MNC-adjacent employers) grant this at all. |
| `private_and_proprietor_expenses` | opt_in, **re-keyed to `entity_types: [sole_prop, partnership]`** | Genuinely entity-type-conditional — the account exists to catch a sole proprietor's or partner's personal expenses run through the business; a Sdn Bhd's equivalent case (a director's personal spending) is caught instead by the new `director_and_related_party_balances` family (§1.7). |
| `motor_running_costs` | opt_in (unchanged) | Conditional on the client actually holding motor vehicles — paired with the already-`opt_in` `motor_vehicles` family; a client without that family has nothing for this account to isolate. |
| `club_subscriptions_and_entrance_fees` | opt_in (unchanged) | Genuinely discretionary — only businesses paying for staff/director club memberships as a benefit incur this at all. |

**Net effect: 6 of 10 tax-split families move to `core`; 1 gains a real entity-type trim key instead
of an empty one; 3 stay `opt_in` with empty keys** because no structured signal in `client_facts`
(today's catalog: `entity_type`, `trade_nature`, `msic`, `banking_arrangement`,
`customer_identity_policy`) predicts whether a given client grants leave passage, pays club fees, or
holds vehicles beyond what `motor_vehicles`' own opt-in status already gates — leaving them
genuinely proposal-worthy defaults a bookkeeper toggles on manually, consistent with Q3's ruling
that the trim is editable before apply.

---

## 3 · Society and co-operative equity — Q10's provisional gap, resolved with a caveat

### 3.1 · Society (Societies Act 1966)

**"Accumulated Fund" is the standard Malaysian equity-line label**, not "General Fund" or "Members'
Fund." Confirmed via convergence across three independent, Malaysia-specific sources: Malaysia's
own national Form 5 (SPM) Principles of Accounts curriculum states directly, *"Lebihan aset daripada
liabiliti dikenal sebagai Dana Terkumpul atau Kumpulan Wang Terkumpul"* (the excess of assets over
liabilities is known as the Accumulated Fund) —
[prisiperakaunan.blogspot.com](https://prisiperakaunan.blogspot.com/p/prinsip-perakaunan.html),
fetched 2026-08-29; a second independent teaching source uses "Dana Terkumpul" as the balance-sheet
equity line with its own dedicated computation format —
[tiniemunir.blogspot.com](https://tiniemunir.blogspot.com/2011/11/format-pengiraan-akaun-kelab-dan.html),
fetched 2026-08-29; a real audited society's FY2022 statement of financial position shows "Dana
Terkumpul Awal" → surplus → "Dana Terkumpul" as the closing equity figure (search-indexed, fetched
2026-08-29). **No Malaysia-specific source used "General Fund"** (that term surfaced only in
non-Malaysian curriculum material). **Caveat: no single MIA or ROS-issued accounting-format
circular was found pinning this down at regulator level** — the convention rests on the national
curriculum plus real-world practice, not one authoritative pronouncement (§5).

**Subscriptions and entrance fees are their own income lines, distinct from programme revenue** —
confirmed by the same curriculum sources; entrance/registration fees specifically may be treated as
either capital income (credited straight to the Accumulated Fund) or revenue income (through the
income-and-expenditure account) as a firm-level policy choice — noted as ambiguous by design, not
resolved further here.

**The equity_common family's label mismatch, named rather than hidden.** `3900 Retained Earnings`
is `core` and applies unconditionally per the original design (a core family cannot carry entity-
type trim keys — `ck_coa_family_core_unkeyed`). For a society, "Retained Earnings" is not the
correct term at all (a non-profit does not retain distributable earnings) — the correct concept is
the Accumulated Fund added here. **This is a genuine, unresolved naming collision left for the build
lane, not papered over**: a society applying the standard template gets both `3900 Retained
Earnings` (wrongly labelled for its entity type but structurally present) and `3040 Accumulated
Fund` (correctly labelled, from the new opt_in `equity_society` family). The mechanism question —
rename/retire 3900 for a society at apply time, or leave both and let a human tidy it — is a build-
lane design decision, not resolved by this research pass. Recorded in the JSON's `known_gaps`.

**Accounts added — family `equity_society`, `opt_in`, `entity_types: [society]`**: `3040`
Accumulated Fund (equity), `4500` Subscriptions / Membership Fees (income), `4510` Entrance /
Registration Fees (income) — 3 accounts.

### 3.2 · Co-operative (Co-operative Societies Act 1993, Act 502)

**Share capital terminology: "Share Capital" is the Act's own term.** Section 2's interpretation
clause defines "Share" ("Syer") as *"a share in the share capital of a co-operative society
contributed by a member in respect of his membership"* — the statute itself uses "share capital,"
not a distinct term like "Members' Shares." — Source: search-indexed excerpt of Act 502 s.2, fetched
2026-08-29 (primary PDF at skm.gov.my resisted text extraction — see §5).

**Statutory Reserve Fund — Section 57(1), a graduated rate, NOT a flat percentage.** Every
registered co-operative must, before declaring any dividend, transfer to a Statutory Reserve Fund:
**not less than 25%** of audited net profit while the Fund's balance is below 50% of the
co-operative's shares and subscription, tapering to **not less than 15%** once the Fund reaches
50%–100% of that base; the Fund's balance must never fall below **15% of total shares and fees**.
This graduated 25%/15% structure was corroborated across four independent search results (English
and Bahasa Malaysia) with matching subparagraph numbering, plus one legal-database mirror citing
"Section 57(1)(b)" directly — but **the primary Act 502 PDF (skm.gov.my) could not be text-extracted
in this environment, so this is the single number in this addendum I would most want a human (or a
tool with real PDF OCR) to re-verify against the gazetted text before it is cited anywhere formal**
(§5). Per the task's own instruction, this percentage is **not** carried into the JSON — only the
account's existence and its statutory basis are.

**Co-operative Education Trust Fund and Development Trust Fund — Section 57(2), rate NOT fixed in
the Act.** Every registered co-operative must also pay a sum, out of audited net profit, to the
Co-operative Development Trust Fund and Co-operative Education Trust Fund — but the Act delegates
the rate to Ministerial determination rather than fixing it in the statute itself, so **no current
percentage is stated or implied by this addendum.**

**Dividend vs. bonus terminology.** "Dividen" is the standard term for the annual statutory
profit distribution to members (calculated on shares held, approved at AGM); "Bonus" denotes a
separate, discretionary, often festive cash payment (e.g. a Hari Raya bonus) distinct from the
formal dividend — real examples from Malaysian co-operative AGM announcements confirm both terms
are in simultaneous, distinct use. — Search-indexed synthesis, fetched 2026-08-29.

**Accounts added — family `equity_cooperative`, `opt_in`, `entity_types: [cooperative]`**: `3060`
Share Capital (Members' Shares) (equity), `3110` Statutory Reserve Fund (equity), `2700`
Co-operative Education Trust Fund Payable (liability), `2710` Co-operative Development Trust Fund
Payable (liability), `2720` Dividend Payable to Members (liability) — 5 accounts. `3900 Retained
Earnings` (core) is left as-is for a co-operative — the label is imperfect but directionally
correct (a co-operative does have profit-driven, distributable-adjacent operations, unlike a
society), a materially smaller mismatch than the society case in §3.1.

---

## 4 · Numbering — no new scheme

All 40 addendum accounts stay inside the numbering scheme `coa-template-2026-08-29.json` already
established (plain 4-digit codes, one block per `account_type`; see the original dossier §2 for the
full rationale). No new numbering decision was needed — codes were chosen from the unused gaps
within each block (e.g. `1140`-`1180` for the tax/related-party asset accounts, `1500`-`1720` for
the new PPE/intangible block, `2400`-`2720` for the new liability accounts), spaced by 10 for future
insertion, consistent with the original chart's own spacing convention.

---

## 5 · Could not verify

1. **The exact wording of Section 57(1), Co-operative Societies Act 1993 (Act 502)** — direct
   PDF text extraction failed for every primary-source mirror attempted (skm.gov.my, natlex.ilo.org,
   faolex.fao.org, commonlii.org, world.moleg.go.kr). The graduated 25%/15% figure rests on
   convergent search-engine snippets, not a direct primary read — the number this addendum would
   most want independently re-verified before formal use.
2. **SKM's own GP23 guideline** ("Garis Panduan Pelaporan Penyata Kewangan Koperasi") — almost
   certainly the single best authoritative source for a Malaysian co-operative's required
   chart-of-accounts equity structure; its PDF (`koptg.com.my/koptg/garispanduan/GP23.pdf`) also
   resisted text extraction. Recommended as the first thing to read directly if this template is
   revisited for co-operative clients specifically.
3. **The current Co-operative Education/Development Trust Fund contribution percentage** —
   delegated to Ministerial determination by s.57(2) itself; no current gazetted rate found.
4. **A single MIA (Malaysian Institute of Accountants) or ROS-issued circular** naming "Accumulated
   Fund" as the required society balance-sheet terminology at regulator level — the convention is
   well corroborated by national curriculum and real audited-account practice, not by one
   authoritative pronouncement.
5. **A Malaysia-specific MIA practice-note citation for hire-purchase interest-in-suspense
   treatment** — only general accounting-education sources (OpenTuition, Solarsys) and Malaysian
   software-vendor documentation (Bukku, Million System) were found; textbook/software convergence
   is solid, a single formal Malaysian citation is not.
6. **Whether the ICT-equipment capital-allowance rate is 20% or 40% annual allowance for YA2026
   specifically** — resolved against the primary PwC *Malaysian Tax Booklet 2024/2025* table (20%
   standing rate, 40% a time-boxed e-Invoicing-linked enhancement for YA2024-2025 only), but two
   secondary sources (hasilnet.org.my, cleartax.com/my) transpose the figures — flagged as a live
   discrepancy, not silently resolved. This number does not appear in the JSON regardless.
7. **Sage UBS's and NCL's actual chart-of-accounts contents** for the PPE-by-class and
   borrowings/HP evidence in §1.1/§1.4 — Sage UBS's sample report renders its COA section as an
   embedded image, not extractable text, in this environment; NCL's public docs describe only
   numbering conventions, not an actual account list. The "SQL Migration Chart of Account" document
   used as corroborating (not sole) evidence for the HP-creditor/interest-suspense pairing is a
   user-uploaded Slideshare document whose vendor-official status could not be independently
   confirmed.
8. **Whether Malaysian SME preparers commonly skip deferred tax recognition on materiality
   grounds** — no citable practice-note found; both `1150 Deferred Tax Asset` and `2510 Deferred
   Tax Liability` are added as genuine MPERS §29-required lines regardless, per §1.5.
9. **Whether the "Central Co-operative Fund" (Kumpulan Wang Pusat Koperasi)** referenced in some
   search results is still statutorily active post-2021 Act amendments — found but not confirmed;
   not added to the template on that basis.
10. **A Malaysia-specific GL-treatment citation for "Dividends Payable"** (§1.8) beyond the
    universal accounting mechanic and MPERS §6.5(b)'s own disclosure text — the sources found on
    Sdn Bhd dividend declaration cover only the Companies Act 2016 legal/solvency mechanics, not
    the ledger treatment specifically.

---

## 6 · What this addendum merges, and how

`coa-template-addendum-2026-08-29.json` carries the same top-level shape as the original file
(`edition`, `families[]`, `accounts[]`, `equity_variants`, `known_gaps`). The build lane merges it
onto the original by: **upserting `families[]` by `family_key`** (8 brand-new family rows, plus 7
existing family_keys repeated with only `inclusion`/`entity_types` changed — see §2 — every other
field on those 7 rows is unchanged from the original, so the upsert is idempotent), **appending
`accounts[]`** (40 new `account_code` rows, none colliding with the original 100 — verified
programmatically), and **merging `equity_variants`** by adding the `society` and `cooperative` keys
(the original file has no such keys to collide with). `known_gaps` is additive, appended to the
original array.
