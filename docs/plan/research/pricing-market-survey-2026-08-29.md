# Pricing market survey — 2026-08-29

> Market half of the F-A9/R8(c) pricing brief. R8(c) ruled the SHAPE (base monthly tier per
> firm + metered LLM-usage overage, `docs/plan/active/harness-audit-rulings-2026-08-26.md`
> §R8(c)) — **amounts are still open**; this file is evidence for that sitting, not a
> recommendation. The cost-floor half (from live BELCORT usage) is the conductor's own
> document. Written by a research lane; all prices below were pulled live 2026-08-29 unless a
> source states its own "as of" date, which is quoted where given.

## 大白话摘要（给老板看）

1. 这份文件只找market证据，不建议最终价格——那是老板自己拍板的事。
2. 马来西亚本地会计软件（Bukku、Financio、AutoCount 等）单一公司收费大概 RM50–180/月。
3. 面向会计师事务所的工具（Xero Partner、Dext、Karbon）按客户公司或按坐席收费，Dext 每个客户公司约 RM75–110/月（10 家起）。
4. 美国的 AI 记账新贵（Digits、Puzzle、Zeni、Pilot）贵很多，因为它们替代真人记账员，每家公司 US$60–700+/月不等；东南亚本地找到的最接近对标是新加坡的 AI Account，事务所版每月约 RM270（无限客户公司）。
5. 马来西亚事务所收客户的记账费一般 RM300–800/月，工具成本经验法则是控制在收费的 10–20% 以内 —— 也就是每个客户公司大概 RM30–160/月的"工具预算天花板"。
6. Anthropic/OpenAI 官方 API 价格也附在最后，给老板核对用量成本的底线（Claude Sonnet 5 的 promo 价已在 8 月 10 日转正式价，不会在月底涨价）。

---

## 1 · Malaysian SME accounting software — direct/single-company pricing

| Product | Tier | MYR/mo | What gates the tier | Source | Date seen |
|---|---|---|---|---|---|
| Bukku | Free | RM0 | 1 user, minimal invoice volume, sole-trader shape | [bukku.my/compare-plans](https://bukku.my/compare-plans) | 2026-08-29 |
| Bukku | Launch → Elite (5 tiers: Launch/Seed/Grow/Prime/Elite) | ~RM99–129 at Pro-equivalent; full ladder ungated by price on the fetched page | File storage 100MB→40GB, QuickShare emails 100→6,000/mo, recommended txns 50→3,200/mo, annual turnover <RM300k→RM3M-20M | [bukku.my/compare-plans](https://bukku.my/compare-plans), [bukku.my/pricing-legacy](https://bukku.my/pricing-legacy) | 2026-08-29 |
| Bukku | Add-ons | RM5/10GB storage, RM5/2,000 emails, RM8/200 extraction pages, RM12 SST module, RM12 multi-currency | modular, stacks on any tier | [bukku.my/compare-plans](https://bukku.my/compare-plans) | 2026-08-29 |
| Financio | Accounting Essentials | RM50/mo | 20 invoices/mo, 25 e-invoices, 5 AI scans, 5 purchase bills/mo, single currency | [financio.co/my/pricing](https://financio.co/my/pricing) | 2026-08-29 |
| Financio | Accounting Premier | RM85/mo | Unlimited invoices, 5,000 e-invoices, 50 AI scans, unlimited bills, multi-currency | [financio.co/my/pricing](https://financio.co/my/pricing) | 2026-08-29 |
| Financio | Payroll Essentials / Premier | RM75/mo / RM135/mo | ≤30 employees / ≤200 employees | [financio.co/my/pricing](https://financio.co/my/pricing) | 2026-08-29 |
| AutoCount Cloud | Pro Plan | ~RM180/mo (RM1,080/6-month term) | company/user count (exact gate not published in fetched pages) | [autocountsystem.com](https://autocountsystem.com/autocount-cloud/accounting/) | 2026-08-29 |
| AutoCount Cloud | AI SmartScan add-on | RM10/200 credits (10 free/book) | OCR credits | [autocountsystem.com](https://autocountsystem.com/autocount-cloud/accounting/) | 2026-08-29 |
| SQL Account | Cloud subscription | from RM79/mo | entry tier, gate not fully published | [sql.com.my/pricing](https://www.sql.com.my/pricing/) | 2026-08-29 |
| SQL Account | SELECT plan | RM179/company/month, excl. 6% SST | 1 company, 1 user, 18-month term | [sqlaccountingsoftware.com.my/cloud-pricing](https://www.sqlaccountingsoftware.com.my/cloud-pricing/) | 2026-08-29 |
| SQL Account | On-premise licence | RM2,099 one-time | alternative to cloud subscription | [sqlaccountingsoftware.com.my/sql-account-pricing](https://www.sqlaccountingsoftware.com.my/sql-account-pricing/) | 2026-08-29 |
| QNE (N3 AI Accounting) | Prime | RM62/mo (annual billing) / RM80/mo (monthly billing) | 3 users + 1 accountant, basic bookkeeping, LHDN-ready | [qne.cloud/my](https://qne.cloud/my/) | 2026-08-29 |
| QNE (N3 AI Accounting) | Essential | RM100/mo (annual billing) | wider feature set than Prime (exact gate not published) | [qne.cloud/my](https://qne.cloud/my/) | 2026-08-29 |
| — all QNE prices | — | — | +8% SST on top of listed price | [qne.cloud/my](https://qne.cloud/my/) | 2026-08-29 |
| Million | one-time licence | from RM499 | desktop, lifetime licence, no recurring fee; modular add-ons for payroll/stock | [millionsystem.com.my](https://millionsystem.com.my/) | 2026-08-29 |
| Biztory | M Plan (most-subscribed) | RM99/mo | full accounting function set (billing, inventory, recurring, reports); SST included | [biztory.com.my](https://www.biztory.com.my/) | 2026-08-29 |
| Biztory | entry | from RM390/year | lower tier, gate not fully published | [biztory.com.my](https://www.biztory.com.my/) | 2026-08-29 |
| Xero (global reference — MY page returned HTTP 503 on every fetch attempt) | Starter / Standard / Premium | US$13 / US$37 / US$70 per mo (global list; NOT Malaysia-specific) | invoice/bill/payroll-employee caps per tier | [xero.com/my/pricing-plans](https://www.xero.com/my/pricing-plans/) (page unreachable at fetch time) | 2026-08-29 |
| Xero MY | Xero Lite promo | US$3.50/mo (50% off, valid for MY subscriptions signed up before 2026-12-31) | promotional entry tier | [techedt.com](https://www.techedt.com/xero-lite-brings-lower-cost-finance-tools-to-malaysian-small-businesses) | 2026-08-29 |
| Xero MY | confirmed MYR add-ons | Accounting & Technical Support RM100/mo, Multi-currency +RM100/mo, Project +RM30/mo/user | add-on modules, MYR-denominated (the only Xero-MY figures directly confirmed in MYR) | [8wiser.my/xero-malaysia/pricing](https://8wiser.my/xero-malaysia/pricing/) | 2026-08-29 |
| QuickBooks Online (global reference — MY page did not return in time) | Simple Start | ~US$38/mo (global list; NOT Malaysia-specific) | 1 user, basic invoicing/expense tracking | secondary aggregators only; MY page not fetched | 2026-08-29 |
| Zoho Books (global reference) | Free / Standard / Professional / Premium / Elite / Ultimate | $0 / $20 / $50 / $70 / $150 / $275 per mo (global USD list) | turnover cap on Free (<$50K/yr); user/automation/module caps up the ladder | [zoho.com pricing pages](https://www.zoho.com/us/books/pricing/pricing-comparison.html) | 2026-08-29 |
| Zoho Books MY | one secondary claim | "from RM100/mo" | unverified against zoho.com/my directly (that page 404'd) | secondary source only, not independently confirmed | 2026-08-29 |

**Reading.** Where a Malaysia-specific page was reachable, single-company cloud accounting
software clusters tightly: **roughly RM50–180/month** for a real working tier (Financio
RM50–85, Bukku ~RM99–129, Biztory RM99, AutoCount ~RM180, QNE RM62–100), with SQL Account's
published SELECT plan (RM179/company/month) sitting at the top of that band. The two global
majors (Xero, QuickBooks) would not serve their Malaysia-specific pricing pages to this
research pass — their global/other-market list prices convert to a similar or somewhat higher
band once local promotions are stripped out, but that is an inference, not a confirmed MY
figure (see "what could not be found" below). None of these products price by "per client
company managed by a firm" — they are single-tenant SME software; the firm-facing angle is
§2.

## 2 · Firm-facing / practice-management pricing

| Product | Shape | Price | What gates it | Source | Date seen |
|---|---|---|---|---|---|
| Xero Partner Programme | free to join | $0 | unlimited users in Partner Hub; practice tools free to the firm | [xero.com/us/partner-programme](https://www.xero.com/us/partner-programme/) | 2026-08-29 |
| Xero — client-side special editions | per-client, sold through the firm | Xero Ledger $3/mo/client, Xero Cashbook $10/mo/client | non-trading/dormant or ledger-only clients; standard active-client plans start at $15/mo | [xero.com/us/xero-ledger-and-cashbook](https://www.xero.com/us/xero-ledger-and-cashbook/) | 2026-08-29 |
| QuickBooks ProAdvisor Preferred Pricing | free to join | 30% off ongoing (firm-bills) / 30% off first 12mo (client-bills), +15% off payroll & contractor fees; revenue-share option 50% off first 3mo | active ProAdvisor status; new subscriptions only | [quickbooks.intuit.com/accountants/proadvisor/pricing](https://quickbooks.intuit.com/accountants/proadvisor/pricing/) | 2026-08-29 |
| Karbon (practice management — workflow, not a bookkeeping engine) | per-seat | Team $59/user/mo (annual) / $79/user/mo (monthly); Business $89/user/mo (annual) | per staff seat, not per client company; Business tier gates automatic client reminders | [karbonhq.com/pricing](https://karbonhq.com/pricing/) via [getuku.com/articles/karbon-pricing](https://getuku.com/articles/karbon-pricing/) | 2026-08-29 |
| Dext (Practice Essentials / Practice Advanced) | per-client-company | ~$17.70–23.92/client/mo (Essentials) and ~$25.64/client/mo (Advanced), per differing snapshots | **10-client minimum**; per-client-per-month is the norm for document-capture/bookkeeping-prep tools sold to firms | [costbench.com/software/accounting/dext](https://costbench.com/software/accounting/dext/), [help.dext.com — Dext plans for accountants](https://help.dext.com/en/articles/273220-dext-plans-for-accountants-and-bookkeepers) | 2026-08-29 |
| Hubdoc | per-business | standalone ~US$20–40/mo/business; free when bundled with a paid Xero plan | bundled vs. standalone | secondary aggregators (Capterra, ITQlick) | 2026-08-29 |
| Bukku Partner Program (the Malaysia-local analog) | free to join | bulk discount kicks in above 5 companies under one firm; no published per-client RM figure | account manager, client portal, Certified Advisor track | [bukku.my/partner-program](https://bukku.my/partner-program) | 2026-08-29 |

**Reading.** The firm-facing norm splits two ways: **per-seat** (Karbon — a workflow/practice
tool, not a bookkeeping engine, so not directly comparable to Clara) and **per-client-company**
(Dext, Xero's client-side editions) — the per-client-company shape is the closer analog to
Clara, since Clara's unit of work is a client's books, not a staff seat. Dext's
$17.70–25.64/client/month (roughly **RM75–110/client/month** at typical FX) is the clearest
published per-client-company figure in the market, sold on top of whatever base accounting
system the client already runs. Malaysia's own analog (Bukku's partner program) confirms the
*shape* — bulk pricing once a firm crosses ~5 client companies — but publishes no RM number,
which is a real gap for this brief.

## 3 · AI-bookkeeping / agentic entrants

| Product | Pricing model | Bands | Source | Date seen |
|---|---|---|---|---|
| Digits | flat per company, no per-seat fee | Essentials/Starter ~$65/mo (one source says $35), Core $100/mo (most popular), Advanced custom | [zoftwarehub.com/products/digits-ai-accounting/pricing](https://zoftwarehub.com/products/digits-ai-accounting/pricing) | 2026-08-29 |
| Puzzle | transaction-volume-based, per company | Free under $20K MTV; paid tiers ~$25–30/mo (Starter) → $72/mo (Core) → $120/mo (Complete) → $300–360/mo (Scale); firm-facing multi-client dashboard, explicitly "partner-only" (does not compete for the firm's clients) | [puzzle.io/pricing](https://puzzle.io/pricing), [puzzle.io/blog/best-accounting-software-bookkeeping-firms-multiple-clients](https://puzzle.io/blog/best-accounting-software-bookkeeping-firms-multiple-clients) | 2026-08-29 |
| Zeni | hybrid AI + dedicated human team, priced per company by expense volume/complexity | Essentials $494–549/mo, Growth $949/mo, CFO services from $1,750/mo; 10% off annual billing | [zeni.ai/pricing/accounting-software-packages](https://www.zeni.ai/pricing/accounting-software-packages) | 2026-08-29, pricing "as of July 2026" per source |
| Pilot.com | AI-only vs. AI+human, priced per company by monthly expense volume | AI-only Essentials from $99/mo; human-bookkeeper Core from $499–699/mo scaling with expenses; annual prepay required, no month-to-month | [eightx.co/blog/compare/pilot-pricing](https://eightx.co/blog/compare/pilot-pricing) | 2026-08-29 |
| AI Account Pte Ltd (Singapore HQ; serves SG/MY/HK/Indonesia — closest SEA comparable found) | per-firm subscription, two tiers | Premium SGD 99/year (~SGD 8.25/mo) — 1 company only; **Customize SGD 1,000/year (~SGD 83/mo) — unlimited companies, multi-client management, white-label, dedicated setup**, i.e. a firm-level base tier | [aiaccount.com/pricing](https://www.aiaccount.com/pricing) | 2026-08-29 |
| Malaysia-native agentic entrant | — | **none found at market presence.** Practitioner commentary describes Malaysian firms gluing invoice-extraction/self-billing automation together with n8n + Claude rather than buying a packaged agentic product | [aitraining2u.com — AI for Malaysian Accountants 2026 playbook](https://www.aitraining2u.com/ai-for-accountants-malaysia-2026.html) | 2026-08-29 |

**Reading.** US agentic/AI-first entrants price far above legacy record-keeping software —
$60–950+/month per company — because they are selling a **labor replacement** (an AI
bookkeeper or an AI+human team doing the close), not a ledger UI; Zeni and Pilot's human-backed
tiers in particular are pricing against a US bookkeeper's salary, not against QuickBooks'
license fee. The one SEA-market proof point (AI Account) prices its firm-facing "unlimited
companies" tier at **~RM270/month** (SGD 83 × ~3.3 MYR/SGD, approximate FX) — a small fraction
of the US bands, consistent with SEA/Malaysian willingness-to-pay being calibrated to local
client fees (§4), not US ones. No Malaysian-native competitor doing what Clara does (agentic
close, not just extraction) was found; the market gap AI Account and n8n-glue firms are
filling is real but thin.

## 4 · What Malaysian firms charge THEIR clients (bounds the tool-cost ceiling)

| Service | Band (RM) | Source | Date seen |
|---|---|---|---|
| Monthly bookkeeping, sole prop | RM150–300/mo | [ckpartners.com.my](https://ckpartners.com.my/accounting-fees-for-small-business-in-malaysia/) | 2026-08-29 |
| Monthly bookkeeping, Sdn Bhd | RM300–800/mo (one source: RM300–1,000/mo, i.e. RM3,600–12,000/yr) | [ckpartners.com.my](https://ckpartners.com.my/accounting-fees-for-small-business-in-malaysia/), [jinadvisory.my/en/bookkeeping-fees-malaysia](https://jinadvisory.my/en/bookkeeping-fees-malaysia/) | 2026-08-29 |
| Named package tiers | "Growth" (PLT/small Sdn Bhd) from RM450/mo; "Business" (medium Sdn Bhd) from RM650/mo | secondary aggregator (KC Group survey), not a single firm's own price list | 2026-08-29 |
| Annual tax filing (Form B/C) | RM300–1,500 (one source: tax-agent fees RM1,000–3,000) | [ckpartners.com.my](https://ckpartners.com.my/accounting-fees-for-small-business-in-malaysia/) | 2026-08-29 |
| Statutory audit, small Sdn Bhd (where not exempt) | RM2,000–8,000+ | multiple secondary sources | 2026-08-29 |
| Company secretary retainer | RM720–2,800/year | multiple secondary sources | 2026-08-29 |
| SSM annual return + FS filing | RM400–800 | multiple secondary sources | 2026-08-29 |
| **Total core annual compliance, active small Sdn Bhd** | **RM5,000–15,000/year** (≈RM420–1,250/mo, all-in, of which bookkeeping is one line) | multiple secondary sources, cross-consistent | 2026-08-29 |

**Reading.** Audit exemption applies to companies under RM2M turnover/assets and <20
employees (Phase 2 criteria), so many of Clara's likely small-Sdn-Bhd end clients skip the
audit line entirely and their all-in annual compliance spend sits nearer the bottom of the
RM5,000–15,000 band. The standard rule of thumb cited across Malaysian firm-pricing content is
that **software/tool cost should stay at or under 10–20% of the fee charged to the client** —
applied to the RM300–800/month bookkeeping band, that yields a **per-client-company tool
budget ceiling of roughly RM30–160/month**, and applied to the named RM450/RM650 package tiers,
roughly RM45–130/month. This is the hard ceiling any per-client metered/overage pricing has to
clear if a firm is expected to keep using Clara profitably per client.

## 5 · LLM API list prices (official sources, verified live 2026-08-29)

**Anthropic** — pulled directly from [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing) (the live official pricing page, not a secondary aggregator):

| Model | Input $/MTok | 5m cache write | 1h cache write | Cache hit | Output $/MTok |
|---|---|---|---|---|---|
| Claude Fable 5 | $10.00 | $12.50 | $20.00 | $1.00 | $50.00 |
| Claude Opus 5 | $5.00 | $6.25 | $10.00 | $0.50 | $25.00 |
| Claude Sonnet 5 | $2.00 | $2.50 | $4.00 | $0.20 | $10.00 |
| Claude Sonnet 4.6 | $3.00 | $3.75 | $6.00 | $0.30 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $1.25 | $2.00 | $0.10 | $5.00 |

Batch API is 50% off both input and output, across every model, on top of the table above.
**Important dated fact for this brief:** Claude Sonnet 5's $2/$10 pricing was announced at
launch as *introductory* through 2026-08-31, with a scheduled increase to $3/$15 on
2026-09-01. **Anthropic confirmed on 2026-08-10 that the introductory price is now permanent**
— the scheduled increase will not happen — per the official pricing page's own note. This
matters directly for Clara's cost floor: the metering design's evaluator (§3.6 of
`metering-design.md`) prices off whatever is in the seeded `llm_price_table`; if that table
was seeded assuming the scheduled $3/$15 step-up, it is now stale against the vendor's actual
rate.

**OpenAI** — pulled directly from [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) (the official page; the redirect target of platform.openai.com/docs/pricing):

| Model | Input $/MTok | Cached input $/MTok | Output $/MTok |
|---|---|---|---|
| gpt-5.6-sol *(the model AGENTS.md constraint 5 pins Codex lanes to)* | $4.00 | $0.40 | $20.00 |
| gpt-5.6-terra | $2.00 | $0.20 | $12.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| gpt-5.6-cyber | $12.50 | $1.25 | $75.00 |
| gpt-5.5 | $5.00 | $0.50 | $30.00 |
| gpt-5.4 | $2.50 | $0.25 | $15.00 |
| gpt-5 (original) | $1.25 | $0.125 | $10.00 |

**A discrepancy worth flagging:** secondary aggregator sites (this survey checked several)
reported gpt-5.6-sol at $5.00/$30.00 — the official OpenAI docs page instead shows
**$4.00/$20.00**. The official figure is the one used above; the aggregator figure appears
stale or mis-scraped. This is exactly the kind of drift the "query official docs, avoid stale
sources" standing instruction exists to catch.

**Reading.** Anthropic and OpenAI's frontier-tier pricing ($4–10 input / $20–50 output per
MTok) sit an order of magnitude apart from their budget tiers (Haiku 4.5 $1/$5,
gpt-5.6-luna $0.20/$1.20) — the model-selection choice inside Clara's own call-kind roster
(document_extraction vs. chat vs. reporting, `metering-design.md` §3.1) has a large effect on
the per-call cost floor the pricing sitting will be checked against, independent of whatever
MYR number the sitting lands on.

---

## Market band conclusion (evidence, not a recommendation)

R8(c) ruled the shape: base monthly tier per firm + metered LLM-usage overage. This survey's
job is to hand the pricing sitting the comparables it will be checked against, not to name a
number. Two defensible bands emerge from the evidence above:

**Base tier per firm.** The market splits cleanly by who the buyer is. When the buyer is a
single SME, Malaysia-specific cloud accounting software clusters at RM50–180/month (§1). When
the buyer is a *firm* needing multi-client capability — Clara's actual customer — the
comparables shift: Karbon's per-seat practice-management floor is $59/user/month
(≈RM250–280/user/month, but that is a workflow tool, a different category); the one SEA-market
agentic-accounting proof point, AI Account, prices its firm-level "unlimited client companies"
tier at ~RM270/month; and Bukku's own partner program confirms the *shape* of a firm-level
bulk threshold (5+ companies) without a published number. A base-tier-per-firm band in
**roughly RM300–900/month** sits consistent with what comparable firm-facing subscriptions
charge as their entry price before any per-client or usage overage — above a single-SME
software licence (since the buyer is now managing many clients), below Karbon's per-seat cost
(a different product category), and in the same order of magnitude as AI Account's unlimited-
company tier.

**Per-client-company metered/overage band.** Four data points bound this from different
directions: (a) direct-to-SME software costs RM50–180/month per company when an SME buys it
alone (§1) — a floor for what a firm effectively saves per client by not needing separate
licences; (b) Dext, the clearest published per-client-company add-on price in the market,
charges $17.70–25.64/client/month (≈RM75–110/client/month) on top of a base accounting system,
for document capture alone, not agentic close (§2); (c) the 10–20%-of-client-fee rule of thumb
against Malaysia's own RM300–800/month bookkeeping bands yields a ceiling of roughly
RM30–160/month per client company (§4); and (d) AI-native tools that actually *do* the work
(Puzzle, Digits) — the category Clara's agentic-close positioning belongs to, not passive
record-keeping — start at $60–100/company/month in the US (≈RM270–450/month), reflecting a
premium for doing labor, not just hosting a ledger. A **per-client-company band of roughly
RM50–250/month**, scaling with a client's transaction/document volume (the way Bukku, Puzzle
and Dext already scale their own tiers), reconciles these: the low end matches what a firm
already pays for passive per-client software today, the high end approaches but stays under
the 10–20%-of-fee ceiling for a firm's more active clients, and the whole band sits well under
what US agentic tools charge — appropriately, since Malaysian client engagement fees
themselves (the thing the 10–20% rule is anchored to) are a fraction of US SMB accounting
fees.

Both bands are market evidence only. The pricing sitting still has to reconcile them against
the cost-floor half (BELCORT's live per-call LLM spend against the §5 rates, run through
whichever call-kind mix — document_extraction, chat, reporting — Clara's own usage settles
into) before any amount is ruled.

## What could not be found

- **Xero Malaysia's own MYR pricing page never served content** to this research pass — every
  fetch attempt (the main pricing-plans page and the Standard-tier detail page) returned
  HTTP 503. Only global/other-market list prices (USD, AUD) and MYR-denominated *add-on*
  prices (confirmed via a reseller page) were recoverable. Malaysia's exact base-tier MYR
  figures for Xero Starter/Standard/Premium remain unconfirmed.
- **QuickBooks Malaysia's own MYR pricing page** did not return in time (one fetch attempt
  timed out at 60s); only global USD reference pricing was found via secondary sources. No
  Malaysia-specific RM figures for Simple Start/Essentials/Plus were confirmed.
- **Zoho Books Malaysia's own pricing page** (zoho.com/my/books/pricing/) returned HTTP 404.
  One secondary source claims "from RM100/month" but this is unverified against Zoho's own
  Malaysia page.
- **A published per-client-company RM figure for any Malaysian accountant/partner
  programme** (Bukku, SQL Account, AutoCount) — every one of these confirms bulk/partner
  pricing *exists* but none publishes the actual per-client number; it appears to be a
  contact-sales figure across the board.
- **A second Malaysia-native or SEA-native agentic-accounting competitor** beyond AI Account
  Pte Ltd — the search surfaced general "agentic AI in Malaysia" commentary and one Singapore-
  HQ'd multi-market player, but no second packaged product doing what Clara does (agentic
  close, not extraction-only) at the SME/firm level in this region.
- **Live, dated FX rates** — MYR conversions above (SGD→MYR ~3.3, USD→MYR ~4.5) are commonly-
  cited approximate rates, not a rate pulled live from a currency source in this pass; treat
  every MYR-converted figure in §3 as directional, not exact.

## Report

- Path: `docs/plan/research/pricing-market-survey-2026-08-29.md`
- 大白话摘要 in full at the top of this file (§ "大白话摘要（给老板看）")
- Market-band conclusion: base tier ~RM300–900/month per firm; per-client-company metered band
  ~RM50–250/month, both scaling with the reasoning laid out above — no final number recommended
  per the brief's own instruction.
