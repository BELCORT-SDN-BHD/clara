// The default Chart of Accounts template for a Malaysian private company (Sdn Bhd).
//
// PROVENANCE — read docs/plan/research/wave-b/malaysian-coa-official-research.md before
// changing anything here. Three lanes fed this file: web research against MASB/MPERS,
// SSM/MBRS and LHDN/RMCD official sources; a cross-model (gpt-5.6-sol) domain review; and
// a second adversarial completeness review of the built template
// (docs/plan/research/wave-b/coa-codex-completeness-review.md). All reached the same
// starting conclusion:
//
//   MALAYSIA HAS NO STATUTORY CHART OF ACCOUNTS. The phrase "chart of accounts" appears
//   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both extracted in full
//   and grep-verified). MPERS 4.9 is explicit: "This Standard does not prescribe the
//   sequence or format in which items are to be presented", and 4.9(b) permits renaming
//   and resequencing. CA 2016 s.245 is outcome-based — records must "sufficiently explain
//   the transactions and financial position of the company".
//
// So this template is NOT an official list. It is a defensible default whose only binding
// constraint is MAPPABILITY: every account rolls up cleanly to (a) the MPERS 4.2 / 5.5
// face line items, (b) the SSM MBRS (SSMxT) taxonomy actually filed, and (c) the LHDN
// Form C analysis and tax-computation add-backs. It is a starting point a professional
// edits per client — not a rule.
//
// TWO STANDING RULES, both learned the hard way in review:
//
//   1. AN ACCOUNT NAME MUST NEVER ASSERT A TAX CONCLUSION. Deductibility turns on facts
//      the ledger does not hold (purpose, payer, contract, residence, evidence). Accounts
//      whose treatment is fact-dependent are named neutrally and suffixed "(tax review)".
//   2. NO RATES, THRESHOLDS, PERCENTAGES OR EFFECTIVE DATES. Those are effective-dated
//      compliance facts that move (service tax 6%->8% in Mar 2024; scope expanded Jul 2025;
//      Service Tax Policies 1-4/2026 live) and belong in the tax engine, never in an
//      account name or note. Statutory SECTION references are fine — they identify the
//      rule, not its quantum. MyInvois classification codes are transaction metadata.
//
// FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. MPERS (2025) —
// Malaysia's adoption of IFRS for SMEs 3rd edition — was gazetted 10 October 2025 and
// applies to annual periods beginning on or after 1 January 2027 (early adoption
// permitted). Sections 4 and 5 are substantively unchanged between them, so this template
// is unaffected by that transition.

export type CoaTemplateAccount = {
  code: string;
  name: string;
  /** matches clara.coa_accounts.account_type */
  type: "asset" | "liability" | "equity" | "income" | "expense";
  /** control-account marker; only 'payable' | 'receivable' are permitted by the DB */
  accountClass?: "payable" | "receivable";
  /** DB CHECK: opening_balance_equity/retained_earnings require equity; sst_purchase_cost requires expense */
  special?:
    | "rounding"
    | "sst_output"
    | "sst_purchase_cost"
    | "opening_balance_equity"
    | "retained_earnings";
  /** which MPERS 4.2 / 5.5 face line item this rolls into — the mapping that makes the chart defensible */
  mpers: string;
  /** why this account exists as a separate line (tax analysis, statutory disclosure, MPERS split) */
  note?: string;
};

export type CoaTemplateBlock = {
  key: string;
  title: string;
  /**
   * standard = the practice's default set, pre-selected for a typical trading or service
   *   Sdn Bhd. It is deliberately NOT a claim that every company needs every account —
   *   a dormant or single-director entity will legitimately never use the payroll or
   *   borrowings lines, and an unused nil account is harmless. Prune per client.
   * optional = activity-, registration- or regime-gated. Never seeded unless chosen.
   */
  tier: "standard" | "optional";
  blurb: string;
  accounts: CoaTemplateAccount[];
};

/**
 * Code scheme (extends the convention already in use by the firm: 100-000 share capital,
 * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 cost of sales,
 * 900-xxx mnemonic operating expenses, 999-R00 rounding). Numeric order identifies the
 * block; it does not dictate statement order — the MPERS mapping does that.
 *
 *   100-199 equity        200-299 non-current assets   300-399 current assets
 *   400-499 liabilities   500-599 income               600-699 cost of sales
 *   800-899 finance + tax expense                      900-989 operating expenses
 *   990-999 system
 *
 * DB constraint: account_code must match ^[0-9]{4,8}$ or ^[0-9]{3}-[0-9A-Z]{2,4}$.
 */
export const COA_TEMPLATE: CoaTemplateBlock[] = [
  {
    key: "equity",
    title: "Equity",
    tier: "standard",
    blurb:
      "No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances). Dividends are distributions of equity, never a P&L expense.",
    accounts: [
      { code: "100-000", name: "Share capital", type: "equity", mpers: "Equity — share capital" },
      { code: "120-000", name: "Other reserves", type: "equity", mpers: "Equity — other reserves" },
      {
        code: "150-000",
        name: "Retained earnings",
        type: "equity",
        special: "retained_earnings",
        mpers: "Equity — retained earnings",
      },
      {
        code: "160-DIV",
        name: "Dividends declared (distribution clearing)",
        type: "equity",
        mpers: "Equity — retained earnings movement",
        note: "A distribution, not an expense. Kept apart from 150-000 so the retained-earnings roll-forward is readable. CA 2016 ss.131-132 allow a distribution only out of profits available and only if the solvency test is satisfied.",
      },
      {
        code: "190-OBE",
        name: "Opening balance equity (system clearing)",
        type: "equity",
        special: "opening_balance_equity",
        mpers: "Equity — temporary conversion account",
        note: "A conversion account, not permanent equity. Must net to nil and be cleared before statutory statements are finalised.",
      },
    ],
  },
  {
    key: "ppe",
    title: "Property, plant and equipment",
    tier: "standard",
    blurb:
      "Cost and accumulated depreciation held separately, as MPERS Section 17 disclosure requires. The four classes here suit a service or office business; add the extended PPE module for land, buildings, plant and office equipment.",
    accounts: [
      { code: "200-M01", name: "Motor vehicles — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-F01", name: "Furniture and fittings — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-C01", name: "Computer equipment — cost", type: "asset", mpers: "Property, plant and equipment" },
      {
        code: "200-R01",
        name: "Renovation and leasehold improvements — cost",
        type: "asset",
        mpers: "Property, plant and equipment",
        note: "Only expenditure meeting the MPERS 17.4 recognition criteria is capitalised here. Routine repairs and making-good belong in 900-R01, and the capital/revenue split is a tax-computation question in its own right.",
      },
      { code: "210-M01", name: "Accumulated depreciation — motor vehicles", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-F01", name: "Accumulated depreciation — furniture and fittings", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-C01", name: "Accumulated depreciation — computer equipment", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-R01", name: "Accumulated depreciation — renovation and leasehold improvements", type: "asset", mpers: "Property, plant and equipment" },
    ],
  },
  {
    key: "non-current-assets",
    title: "Other non-current assets",
    tier: "standard",
    blurb:
      "MPERS 4.5 classifies by EXPECTED RECOVERY, not by counterparty. A rental or utility deposit recoverable in three years is not a current asset, and a related-party balance's maturity cannot be inferred from the fact that it is related-party.",
    accounts: [
      {
        code: "250-DEP",
        name: "Refundable deposits — non-current",
        type: "asset",
        mpers: "Other non-current assets",
        note: "Tenancy, utility and security deposits recoverable beyond twelve months. Current ones stay in 340-D01.",
      },
      {
        code: "250-PDG",
        name: "Pledged or restricted deposits — non-current",
        type: "asset",
        mpers: "Other non-current assets",
        note: "A deposit pledged against a facility is not freely available cash and must not be presented as a cash equivalent.",
      },
      {
        code: "250-DIR",
        name: "Amount owing from director — non-current",
        type: "asset",
        mpers: "Trade and other receivables — related party (non-current)",
        note: "Directional. Never net against 472-DIR without a legally enforceable right of set-off.",
      },
      { code: "250-REL", name: "Amount owing from related company — non-current", type: "asset", mpers: "Trade and other receivables — related party (non-current)" },
      {
        code: "260-DTA",
        name: "Deferred tax asset",
        type: "asset",
        mpers: "Deferred tax assets",
        note: "MPERS Section 29 recognition is an accounting conclusion, not an optional bookkeeping preference — so this sits with 450-DTL and 810-T02 in the standard set, not in a module.",
      },
    ],
  },
  {
    key: "current-assets",
    title: "Current assets",
    tier: "standard",
    blurb:
      "Trade receivables carries the receivable control marker. Director and related-party balances are separate, directional and never netted — MPERS Section 33 related-party disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
    accounts: [
      {
        code: "300-000",
        name: "Trade receivables — control",
        type: "asset",
        accountClass: "receivable",
        mpers: "Trade and other receivables",
      },
      {
        code: "300-900",
        name: "Allowance for impairment — specific (individually assessed)",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Debt-by-debt, evidence-based. Kept apart from 300-901 because the tax computation treats a specific allowance differently from a collective one (LHDN PR 4/2019).",
      },
      {
        code: "300-901",
        name: "Allowance for impairment — collective (general)",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Portfolio/percentage-based. A permanent add-back candidate — never merge it into 300-900.",
      },
      { code: "310-B01", name: "Bank — main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 …" },
      {
        code: "310-FD1",
        name: "Short-term deposits and placements",
        type: "asset",
        mpers: "Cash and cash equivalents / other current assets",
        note: "A placement is a cash equivalent only if it is short-term, highly liquid and subject to insignificant risk of change in value. One that is not stays out of the cash-flow cash line.",
      },
      { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
      { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-D01", name: "Deposits paid — current", type: "asset", mpers: "Trade and other receivables", note: "Recoverable within twelve months; longer-dated ones belong in 250-DEP." },
      { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
      {
        code: "340-UNB",
        name: "Unbilled receivables / accrued income",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Revenue earned but not yet invoiced. For a Section 23 contract, distinguish this from a contract asset conditioned on further performance (370-CON, construction module).",
      },
      { code: "350-D01", name: "Amount owing from director — current", type: "asset", mpers: "Trade and other receivables — related party", note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off." },
      { code: "350-R01", name: "Amount owing from related company — current", type: "asset", mpers: "Trade and other receivables — related party" },
      {
        code: "360-T01",
        name: "Tax instalments paid (CP204)",
        type: "asset",
        mpers: "Current tax assets",
        note: "Instalments actually remitted, kept apart from an assessed overpayment so the CP204 schedule reconciles on its own.",
      },
      { code: "360-T02", name: "Current tax recoverable / overpayment", type: "asset", mpers: "Current tax assets", note: "An assessed refund due, not an instalment." },
      {
        code: "360-WHT",
        name: "Withholding tax receivable / tax credits",
        type: "asset",
        mpers: "Current tax assets",
        note: "Tax withheld from the company's own income, foreign or domestic. Must not be mixed with instalments or with 430-WHT (tax the company withholds from others and owes over).",
      },
    ],
  },
  {
    key: "liabilities",
    title: "Liabilities",
    tier: "standard",
    blurb:
      "Every statutory payroll deduction is its own payable — EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable. Current/non-current follows MPERS 4.7-4.8, never the counterparty's identity.",
    accounts: [
      { code: "400-000", name: "Trade payables — control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
      { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables", note: "Goods or services received and reliably measurable but not yet invoiced. NOT an MPERS Section 21 provision — see 453-PR1." },
      { code: "410-002", name: "Salaries and wages payable", type: "liability", mpers: "Trade and other payables" },
      { code: "410-003", name: "EPF payable", type: "liability", mpers: "Trade and other payables", note: "Employees Provident Fund Act 1991." },
      { code: "410-004", name: "SOCSO payable", type: "liability", mpers: "Trade and other payables", note: "Employees' Social Security Act 1969 (Act 4)." },
      {
        code: "410-005",
        name: "SKBBK payable (LINDUNG 24 JAM)",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Non-Employment Injury Security Scheme — a distinct employee-borne PERKESO component with its own column in the official contribution table.",
      },
      { code: "410-006", name: "EIS payable", type: "liability", mpers: "Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) — separate from Act 4." },
      { code: "410-007", name: "PCB / MTD payable", type: "liability", mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form CP39)." },
      { code: "410-008", name: "HRD Corp levy payable", type: "liability", mpers: "Trade and other payables", note: "PSMB Act 2001 — applies only to employers within scope or registered voluntarily." },
      {
        code: "410-CC1",
        name: "Corporate credit card payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "An independently reconciled control balance in its own right; it should not disappear inside trade payables.",
      },
      {
        code: "410-DIV",
        name: "Dividends payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Recognised only once the distribution is validly authorised and no longer at the company's discretion (CA 2016 ss.131-132). Pairs with 160-DIV.",
      },
      { code: "420-D01", name: "Amount owing to director — current", type: "liability", mpers: "Trade and other payables — related party" },
      { code: "420-R01", name: "Amount owing to related company — current", type: "liability", mpers: "Trade and other payables — related party" },
      {
        code: "430-WHT",
        name: "Withholding tax payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Tax the company withholds from a payee and owes to LHDN — commonly s.107A contract payments and s.4A technical/management/rental-of-movable-property fees, but also interest, royalties, s.109 and public-entertainer withholdings, each with its own remittance form and deadline. Keep the remittance class identifiable per transaction. Opposite in direction to 360-WHT.",
      },
      {
        code: "440-001",
        name: "Current income tax payable",
        type: "liability",
        mpers: "Current tax liabilities",
        note: "Deliberately NOT called a 'provision for taxation' — it is a current tax liability, not an MPERS Section 21 provision.",
      },
      { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities", note: "See 260-DTA — MPERS Section 29 recognition is mandatory where temporary differences exist." },
      {
        code: "451-EB1",
        name: "Employee benefit obligations — current",
        type: "liability",
        mpers: "Employee benefit obligations — current",
        note: "Accrued leave, bonuses, gratuities and similar short-term benefits (MPERS Section 28). Payroll remittance payables do not cover these.",
      },
      { code: "452-EB1", name: "Employee benefit obligations — non-current", type: "liability", mpers: "Employee benefit obligations — non-current" },
      {
        code: "453-PR1",
        name: "Provisions — current",
        type: "liability",
        mpers: "Provisions — current",
        note: "MPERS Section 21: a PRESENT obligation from a past event, probable outflow, reliable estimate. Never a general reserve, and never a substitute for an accrual (410-001).",
      },
      { code: "454-PR1", name: "Provisions — non-current", type: "liability", mpers: "Provisions — non-current" },
      { code: "460-L01", name: "Borrowings — current", type: "liability", mpers: "Financial liabilities — current" },
      {
        code: "460-OD1",
        name: "Bank overdraft",
        type: "liability",
        mpers: "Financial liabilities — current",
        note: "Separate from term borrowings. It forms part of cash and cash equivalents for cash-flow presentation only where it is repayable on demand and integral to cash management.",
      },
      { code: "461-L01", name: "Borrowings — non-current", type: "liability", mpers: "Financial liabilities — non-current" },
      { code: "472-DIR", name: "Amount owing to director — non-current", type: "liability", mpers: "Trade and other payables — related party (non-current)" },
      { code: "472-REL", name: "Amount owing to related company — non-current", type: "liability", mpers: "Trade and other payables — related party (non-current)" },
      {
        code: "490-D01",
        name: "Refundable customer deposits",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Returnable security or tenancy deposits held. Not contract consideration — see 490-R01.",
      },
      {
        code: "490-R01",
        name: "Contract liabilities and deferred income",
        type: "liability",
        mpers: "Other liabilities",
        note: "Consideration received (or receivable) for performance not yet delivered. Add a non-current sibling where the performance date is beyond twelve months.",
      },
    ],
  },
  {
    key: "income",
    title: "Income",
    tier: "standard",
    blurb:
      "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly, and the streams Form C analyses separately each have their own line.",
    accounts: [
      {
        code: "500-000",
        name: "Revenue",
        type: "income",
        mpers: "Revenue",
        note: "The general revenue line. Where a client's revenue is analysed into 500-S01/500-G01, post to those and leave this nil — the schema has no non-posting header flag (limitation 3 below), so a balance here alongside analysed children means revenue is still uncoded, not that there are two revenue streams.",
      },
      { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
      { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
      { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue — net" },
      { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue — net" },
      { code: "530-000", name: "Other income", type: "income", mpers: "Other income", note: "Same rule as 500-000: the unanalysed residual, not a header." },
      { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
      { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income", note: "Pairs with 900-DSP. An accounting gain, not a taxable amount — balancing charges/allowances are computed separately." },
      { code: "530-DIV", name: "Dividend income", type: "income", mpers: "Other income", note: "Form C analyses this stream separately. Source and residence are transaction metadata, not separate accounts." },
      { code: "530-ROY", name: "Royalty and licence income", type: "income", mpers: "Other income", note: "Form C analyses this separately; withholding may already have been suffered — see 360-WHT." },
      { code: "530-GRT", name: "Government grants and subsidies", type: "income", mpers: "Other income", note: "MPERS Section 24 recognition depends on whether performance conditions are imposed. Keep the grant letter with the entry." },
      { code: "530-FX1", name: "Realised foreign exchange gain", type: "income", mpers: "Other income", note: "Realised and unrealised are kept apart, but that split alone does not decide tax: the revenue-versus-capital nexus of the underlying transaction does." },
      { code: "530-FX2", name: "Unrealised foreign exchange gain", type: "income", mpers: "Other income" },
      { code: "540-I01", name: "Interest income", type: "income", mpers: "Finance income" },
    ],
  },
  {
    key: "cost-of-sales",
    title: "Cost of sales",
    tier: "standard",
    blurb:
      "Form C requires contract and subcontract payments to be separately disclosed, and purchases must stay reconstructable apart from cost of sales for any client carrying stock.",
    accounts: [
      { code: "610-100", name: "Cost of sales", type: "expense", mpers: "Cost of sales", note: "The charged-out cost of goods or services sold. For a periodic-inventory client this is derived from opening stock + purchases − closing stock via 620-ADJ (inventory module)." },
      { code: "610-PUR", name: "Purchases", type: "expense", mpers: "Cost of sales", note: "Goods bought for resale or conversion. Separated from 610-100 because Form C treats purchases and cost of sales as different fields." },
      { code: "610-S01", name: "Subcontractor and contract payments", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments, and s.107A withholding may apply to a non-resident contractor." },
      { code: "610-S02", name: "Other direct service costs", type: "expense", mpers: "Cost of sales", note: "Direct costs of delivering a service that are not subcontract payments — kept apart so 610-S01 stays a clean withholding/Form C figure." },
      { code: "610-F01", name: "Freight and carriage inward", type: "expense", mpers: "Cost of sales" },
      { code: "610-RET", name: "Purchase returns (contra)", type: "expense", mpers: "Cost of sales" },
      { code: "610-DIS", name: "Purchase discounts (contra)", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "finance-tax",
    title: "Finance costs and tax",
    tier: "standard",
    blurb: "MPERS 5.5 requires finance costs and tax expense as separate face lines.",
    accounts: [
      { code: "800-I01", name: "Interest expense — borrowings", type: "expense", mpers: "Finance costs", note: "Interest restriction under ITA s.140C and the s.33(1)(a) business-purpose test are computed from the loan facts, not from this balance." },
      { code: "810-T01", name: "Current income tax expense", type: "expense", mpers: "Tax expense" },
      { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense", note: "Pairs with 260-DTA and 450-DTL — all three are standard, because MPERS Section 29 recognition is mandatory where temporary differences exist." },
    ],
  },
  {
    key: "operating-expenses",
    title: "Operating expenses",
    tier: "standard",
    blurb:
      "Split to serve the LHDN tax computation: entertainment is separated by its statutory treatment, and depreciation, donations, statutory fines and unrealised FX are isolated because each is an add-back or a restricted deduction. Where a treatment depends on facts the ledger does not hold, the account is named neutrally and marked (tax review).",
    accounts: [
      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
      { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
      { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
      { code: "900-A04", name: "Tax return preparation and filing fee", type: "expense", mpers: "Administrative expenses", note: "Routine compliance filing, kept apart from advisory and contentious work (900-A05) because the specific-deduction rules for tax fees do not reach every kind of tax service." },
      { code: "900-A05", name: "Tax advisory, objection and appeal fees (tax review)", type: "expense", mpers: "Administrative expenses", note: "Advice, restructuring, objections, investigations and appeals. Deductibility turns on purpose and on whether the expenditure is capital or revenue in character." },
      { code: "900-AMO", name: "Amortisation of intangible assets", type: "expense", mpers: "Administrative expenses", note: "Seeded here (not only in the intangibles module) so an entity that amortises anything has a home for it. Like depreciation, it is replaced by capital allowances where the asset qualifies." },
      { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
      { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses", note: "A write-off of a specific debt judged irrecoverable, supported by evidence of recovery efforts (LHDN PR 4/2019)." },
      { code: "900-B03", name: "Impairment loss — specific (individually assessed)", type: "expense", mpers: "Other operating expenses", note: "Movement on 300-900." },
      { code: "900-B04", name: "Impairment loss — collective (general)", type: "expense", mpers: "Other operating expenses", note: "Movement on 300-901. A permanent add-back candidate — never merged with 900-B03." },
      { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
      { code: "900-CMP", name: "Contractual compensation and damages (tax review)", type: "expense", mpers: "Other operating expenses", note: "Commercial compensation, liquidated damages and settlements — NOT statutory penalties (900-FIN). Deductibility depends on whether the payment arises in the ordinary course of the trade." },
      { code: "900-D01", name: "Directors' fees", type: "expense", mpers: "Administrative expenses", note: "Form C analyses fees separately from salaries. Approval follows CA 2016 s.230 — for a private company generally board approval subject to the constitution, then notification to members. CA 2016 s.249(4) disclosure." },
      { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Replaced by capital allowances in the tax computation. Where the entity presents expenses by function, depreciation of production or delivery assets is allocated to cost of sales or distribution rather than administration." },
      { code: "900-D04", name: "Directors' salaries and bonuses", type: "expense", mpers: "Employee benefits", note: "EPF/SOCSO/PCB consequences turn on whether the director is engaged under a CONTRACT OF SERVICE — not on the ledger label. Do not treat the fee/salary split as deciding statutory liability." },
      { code: "900-D05", name: "Directors' benefits and other remuneration", type: "expense", mpers: "Employee benefits", note: "Benefits-in-kind need their own analysis for payroll and BIK reporting. CA 2016 s.249(4) disclosure." },
      { code: "900-DON", name: "Donations — approved institution or authority", type: "expense", mpers: "Other operating expenses", note: "Only where an approval-status receipt exists. The claim is still made in the tax computation, not asserted here." },
      { code: "900-DN2", name: "Donations, sponsorships and contributions — other", type: "expense", mpers: "Other operating expenses", note: "Everything without approved-institution evidence, plus sponsorships whose treatment follows their own rules. Kept apart so 900-DON stays a clean claim figure." },
      { code: "900-DSP", name: "Loss on disposal of assets", type: "expense", mpers: "Other operating expenses", note: "Pairs with 530-G01." },
      { code: "900-E01", name: "EPF — employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts the deduction for approved-scheme contributions above a statutory proportion of remuneration, so the figure must be separately measurable." },
      { code: "900-E02", name: "SOCSO — employer contribution", type: "expense", mpers: "Employee benefits", note: "Act 4. Separately legislated, computed and reconciled from EIS." },
      { code: "900-E07", name: "EIS — employer contribution", type: "expense", mpers: "Employee benefits", note: "Act 800 — a different scheme from Act 4, mirroring the separate liability accounts." },
      {
        code: "900-E03",
        name: "Entertainment — deductible in full (s.39(1)(l) provisos)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "The proviso categories in LHDN PR 4/2015 Table 1: staff entertainment, gifts bearing the business logo, sales-incentive trips, promotional launches to customers.",
      },
      {
        code: "900-E04",
        name: "Entertainment — restricted (s.39(1)(l))",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Partially disallowed by ITA s.39(1)(l): gifts without a logo, festive hampers, and — note — entertainment to SUPPLIERS, which PR 4/2015 excludes from the 'related wholly to sales' proviso.",
      },
      {
        code: "900-E05",
        name: "Entertainment — non-deductible",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Fails s.33(1) entirely per PR 4/2015 Table 1: own AGM, wedding gifts, entertainment to employees of RELATED companies, closed-transaction prospects, cash contributions to a customer's event.",
      },
      {
        code: "900-E06",
        name: "Leave passage",
        type: "expense",
        mpers: "Administrative expenses",
        note: "ITA s.39(1)(m) disallows employee leave passage except the s.39(1)(l)(viii) yearly local event with the employee's immediate family. A permanent add-back candidate — keep it alone.",
      },
      { code: "900-EQR", name: "Equipment and machinery rental", type: "expense", mpers: "Administrative expenses", note: "An operating lease under MPERS 20.15. Kept apart from motor-vehicle rental because the restrictions differ." },
      { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
      { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "A tax-computation adjustment; the revenue/capital character of the underlying transaction still governs (LHDN PR 12/2019)." },
      { code: "900-FIN", name: "Statutory fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Penalties imposed by an authority for a contravention — a permanent add-back candidate. Commercial damages and settlements belong in 900-CMP, and late-payment interest on a facility is a finance cost." },
      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
      { code: "900-I01", name: "Insurance and takaful", type: "expense", mpers: "Administrative expenses", note: "Conventional and takaful cover share one account — the label does not change the treatment. Key-person cover does not: see 900-KMI." },
      {
        code: "900-I02",
        name: "Company formation costs (tax review)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "The six heads named in the Income Tax (Deduction For Incorporation Expenses) Rules 2003 [P.U.(A) 475/2003, amended 472/2005]: M&A/prospectus preparation and printing, company registration and statutory documents, preliminary contracts, debenture/share certificate printing, company seal, underwriting commission. NOT labelled 'qualifying': those Rules key on an authorised-capital ceiling, and Companies Act 2016 ABOLISHED authorised capital — the mismatch is unresolved for a company incorporated after 2016, so deductibility is a tax-computation judgement, never a ledger conclusion. Costs directly attributable to issuing equity reduce equity instead of being expensed.",
      },
      {
        code: "900-I03",
        name: "Other pre-commencement costs (tax review)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Everything else in a formation bundle — secretarial fees, service tax, travelling, sundries. LHDN PR 11/2013 Example 5 disallowed exactly these inside a claimed incorporation cost, and states a mixed bundle cannot be adjudicated: the split is mandatory. Pre-commencement expenditure is generally not deductible (PR 11/2013 para 6.1).",
      },
      { code: "900-KMI", name: "Key-person insurance / takaful (tax review)", type: "expense", mpers: "Administrative expenses", note: "Treatment turns on the policyholder, the insured, the beneficiary, the business-loss purpose and any investment or surrender element — facts the ledger does not hold (LHDN PR 2/2003)." },
      { code: "900-L01", name: "Legal and professional fees — revenue", type: "expense", mpers: "Administrative expenses", note: "Routine trading matters: debt recovery, employment, ordinary contracts, renewals." },
      { code: "900-L02", name: "Legal and transaction costs — capital (tax review)", type: "expense", mpers: "Administrative expenses", note: "Property, financing, share-capital and acquisition work. Legal fees follow the purpose of the underlying transaction, so these must not sit inside routine administration." },
      { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M02", name: "Management fees — resident", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees paid to residents to be separately disclosed." },
      { code: "900-M04", name: "Technical and management fees — non-resident", type: "expense", mpers: "Administrative expenses", note: "ITA s.4A fees. Withholding under s.109B and the payer's remittance obligation attach here — see 430-WHT." },
      { code: "900-MVR", name: "Motor vehicle rental", type: "expense", mpers: "Administrative expenses", note: "An operating lease; the s.39 restriction on passenger-vehicle leasing is applied in the tax computation from the vehicle's facts." },
      { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental of premises falls inside the expanded service-tax scope — check the landlord's registration status and the current RMCD scope before assuming no tax." },
      { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
      { code: "900-PRE", name: "Pre-opening and pre-operating costs (tax review)", type: "expense", mpers: "Administrative expenses", note: "Start-up, establishment, pre-opening and pre-operating expenditure of a NEW activity or facility of an existing company. MPERS Section 18 expenses it — it is not an intangible asset — but deductibility is not automatic where it precedes the production of gross income. Distinct from 900-I02/900-I03, which concern the company's own formation." },
      { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs versus capital improvement is a tax-computation distinction; capitalised work belongs in 200-R01." },
      { code: "900-RND", name: "Research and development", type: "expense", mpers: "Other operating expenses", note: "MPERS Section 18 expenses research; development is capitalised only where the recognition criteria are met. Any enhanced or double deduction requires its own approval evidence and schedule — never inferred from this balance." },
      { code: "900-RYL", name: "Royalties and licence fees", type: "expense", mpers: "Administrative expenses", note: "Withholding may apply where the recipient is non-resident — see 430-WHT." },
      { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
      { code: "900-S03", name: "Software subscriptions and SaaS", type: "expense", mpers: "Administrative expenses", note: "Recurring subscription only. Separately acquired or controlled software belongs in the intangibles module (220-SW1), and implementation or configuration costs need their own facts-based analysis." },
      { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
      {
        code: "900-SST",
        name: "SST on purchases (expensed)",
        type: "expense",
        special: "sst_purchase_cost",
        mpers: "Administrative expenses",
        note: "Malaysian SST is not a credit-offset VAT, so SST charged by a supplier is generally a cost — but not universally: a registered manufacturer may access the sales-tax deduction facility. Use this account ONLY for SST attributable to operating expenses; SST attributable to inventory or PPE forms part of that asset's cost and must not be routed here (see limitation 2 below).",
      },
      { code: "900-STP", name: "Stamp duty and registration costs (tax review)", type: "expense", mpers: "Administrative expenses", note: "Revenue-natured duty only. Stamp duty on PPE, leases, financing, share issues or acquisitions follows the underlying transaction and must not be dumped here." },
      { code: "900-T01", name: "Telephone and internet", type: "expense", mpers: "Administrative expenses" },
      { code: "900-T02", name: "Travel and accommodation — local", type: "expense", mpers: "Administrative expenses" },
      { code: "900-TOV", name: "Travel and accommodation — overseas", type: "expense", mpers: "Administrative expenses", note: "Form C requires overseas travel to be separately disclosed — split at the account, not by hoping a trip code was entered." },
      { code: "900-T03", name: "Toll and parking", type: "expense", mpers: "Administrative expenses", note: "Do NOT combine with fines — the treatment differs." },
      { code: "900-U01", name: "Utilities", type: "expense", mpers: "Administrative expenses" },
    ],
  },
  {
    key: "system",
    title: "System",
    tier: "standard",
    blurb: "Machine-owned. A recurring or material rounding balance means a coding or calculation defect, not a real expense.",
    accounts: [{ code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" }],
  },
  {
    key: "hire-purchase",
    title: "Hire purchase / finance lease (optional)",
    tier: "optional",
    blurb:
      "Near-universal for Malaysian SME motor vehicles. MPERS retains the finance/operating lease distinction (20.4) — it is NOT IFRS 16 — and 20.13(a) requires the net carrying amount by class, so HP assets stay separate from owned ones. NO interest-in-suspense account is seeded: MPERS 20.9 measures the liability NET, so a gross-instalment presentation is a legacy workflow that needs its own per-client account and a reconciliation to the net obligation.",
    accounts: [
      { code: "200-H01", name: "Motor vehicles under hire purchase — cost", type: "asset", mpers: "Property, plant and equipment", note: "Separate class from owned vehicles: MPERS 20.13(a) requires the net carrying amount for each class held under finance lease." },
      { code: "210-H01", name: "Accumulated depreciation — motor vehicles under hire purchase", type: "asset", mpers: "Property, plant and equipment", note: "MPERS 20.12 may impose a different useful life — the shorter of the lease term and the asset's useful life." },
      { code: "470-H01", name: "Hire purchase liability — current", type: "liability", mpers: "Financial liabilities — current", note: "The current/non-current split comes from MPERS 4.4 and 4.7(c), not Section 20." },
      { code: "471-H01", name: "Hire purchase liability — non-current", type: "liability", mpers: "Financial liabilities — non-current", note: "MPERS 4.8: all other liabilities as non-current." },
      { code: "800-H01", name: "Hire purchase finance charges", type: "expense", mpers: "Finance costs", note: "MPERS 20.11 apportions each instalment between the finance charge and the reduction of the liability. Capital allowances are claimed on the qualifying capital portion actually paid, from the HP agreement — never from this carrying amount." },
    ],
  },
  {
    key: "ppe-extended",
    title: "Extended PPE classes (optional)",
    tier: "optional",
    blurb:
      "For entities beyond a service office. Land is not depreciated; buildings, plant and office equipment carry different useful lives and different capital-allowance classifications, so each needs its own cost and accumulated-depreciation pair.",
    accounts: [
      { code: "200-L01", name: "Freehold land — cost", type: "asset", mpers: "Property, plant and equipment", note: "Not depreciated (MPERS 17.16) — deliberately has no accumulated-depreciation sibling. Leasehold land IS amortised over the lease term and needs its own pair." },
      { code: "200-B01", name: "Buildings — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-B01", name: "Accumulated depreciation — buildings", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-P01", name: "Plant and machinery — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-P01", name: "Accumulated depreciation — plant and machinery", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-O01", name: "Office equipment — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-O01", name: "Accumulated depreciation — office equipment", type: "asset", mpers: "Property, plant and equipment" },
    ],
  },
  {
    key: "intangibles",
    title: "Intangible assets (optional)",
    tier: "optional",
    blurb:
      "MPERS Section 18. Separately acquired software and licences meeting the recognition criteria are assets, not subscriptions — but internally generated goodwill, start-up costs, training and research are never capitalised.",
    accounts: [
      { code: "220-SW1", name: "Acquired software and licences — cost", type: "asset", mpers: "Intangible assets" },
      { code: "221-SW1", name: "Accumulated amortisation — acquired software and licences", type: "asset", mpers: "Intangible assets" },
      { code: "220-IPR", name: "Other intangible assets — cost", type: "asset", mpers: "Intangible assets", note: "Trademarks, patents and similar separately acquired rights." },
      { code: "221-IPR", name: "Accumulated amortisation — other intangible assets", type: "asset", mpers: "Intangible assets" },
    ],
  },
  {
    key: "inventory",
    title: "Inventories (optional)",
    tier: "optional",
    blurb: "Seed only for entities that hold stock. MPERS Section 13 measures inventories at the lower of cost and estimated selling price less costs to complete and sell.",
    accounts: [
      { code: "330-T01", name: "Trading inventory", type: "asset", mpers: "Inventories" },
      { code: "330-R01", name: "Raw materials", type: "asset", mpers: "Inventories" },
      { code: "330-W01", name: "Work in progress", type: "asset", mpers: "Inventories" },
      { code: "330-F01", name: "Finished goods", type: "asset", mpers: "Inventories" },
      { code: "330-900", name: "Allowance for inventory obsolescence", type: "asset", mpers: "Inventories" },
      { code: "620-ADJ", name: "Inventory movement and stock adjustments", type: "expense", mpers: "Cost of sales", note: "The opening/closing stock movement that converts purchases into cost of sales for a periodic-inventory client." },
    ],
  },
  {
    key: "investments",
    title: "Investments and investment property (optional)",
    tier: "optional",
    blurb:
      "MPERS Section 16 requires investment property whose fair value is measurable reliably WITHOUT undue cost or effort to be carried at fair value through profit or loss. The cost-model accounts below apply only where that test fails — in which case 231-001 is used and the fair-value accounts stay nil, and vice versa.",
    accounts: [
      { code: "230-001", name: "Investment property — cost", type: "asset", mpers: "Investment property" },
      { code: "231-001", name: "Accumulated depreciation — investment property", type: "asset", mpers: "Investment property", note: "COST MODEL ONLY. Under fair value through P&L there is no depreciation and this account must stay nil." },
      { code: "530-IPG", name: "Investment property — fair value gain", type: "income", mpers: "Other income", note: "MPERS 16.7 fair-value model. Not a realised gain and not, by itself, a taxable amount." },
      { code: "900-IPL", name: "Investment property — fair value loss", type: "expense", mpers: "Other operating expenses" },
      { code: "240-S01", name: "Investment in subsidiaries", type: "asset", mpers: "Investments in subsidiaries" },
      { code: "240-A01", name: "Investment in associates", type: "asset", mpers: "Investments in associates" },
    ],
  },
  {
    key: "sst-registered",
    title: "SST — registered person (optional)",
    tier: "optional",
    blurb:
      "Seed ONLY for a client registered under the Sales Tax Act 2018 or the Service Tax Act 2018. Registration status, not activity, gates these. SST borne on purchases is a cost to registered and unregistered clients alike, so 900-SST stays in the standard set.",
    accounts: [
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker — see limitation 1 below.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Sales tax is a single-stage tax on manufacturers and importers, accounted on an ACCRUAL basis — a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
      },
      {
        code: "430-ITS",
        name: "Service tax payable — imported taxable services",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Self-accounting by the RECIPIENT of an imported taxable service — a different workflow and a different return line from ordinary output service tax.",
      },
    ],
  },
  {
    key: "employee-benefits",
    title: "Employee welfare, medical and training (optional)",
    tier: "optional",
    blurb:
      "Seed for an employer with meaningful staff costs beyond payroll. Each line is separated for an evidence reason, not a tax conclusion — the treatment of welfare, medical and training spend turns on nature, recipients and business purpose.",
    accounts: [
      { code: "900-W01", name: "Staff welfare — non-entertainment", type: "expense", mpers: "Employee benefits", note: "Keeps ordinary welfare out of the entertainment accounts, where the s.39(1)(l) rules would otherwise contaminate it. Meals, gifts and events for staff that ARE entertainment belong in 900-E03." },
      { code: "900-W02", name: "Employee medical and dental benefits", type: "expense", mpers: "Employee benefits", note: "Needed for payroll/BIK analysis and for evidence. Carries no automatic deductible/non-deductible conclusion." },
      { code: "900-W03", name: "Employee training and development", type: "expense", mpers: "Employee benefits", note: "Ordinary training is an expense. Any approved-programme or double-deduction claim needs its own approval evidence and schedule." },
      { code: "530-HRD", name: "HRD Corp grants and reimbursements", type: "income", mpers: "Other income", note: "A reimbursement of training cost, not revenue. Kept separate so claims reconcile to 900-W03 and to the levy in 900-H01." },
    ],
  },
  {
    key: "construction",
    title: "Construction and long-term contracts (optional)",
    tier: "optional",
    blurb:
      "MPERS Section 23 contract accounting. Amounts due from and to customers are presented gross — never offset contract by contract — and retention sums have their own recognition rules for tax (LHDN PR 5/2025).",
    accounts: [
      { code: "370-CON", name: "Amount due from customers on contracts (contract asset)", type: "asset", mpers: "Amounts due from contract customers" },
      { code: "370-RET", name: "Retention sums receivable", type: "asset", mpers: "Trade and other receivables", note: "Certified but withheld pending defects liability. Entitlement, not invoice date, drives recognition." },
      { code: "492-RET", name: "Retention sums payable", type: "liability", mpers: "Trade and other payables", note: "Retained from a subcontractor. Never netted against 370-RET." },
      { code: "492-CON", name: "Amount due to customers on contracts (contract liability)", type: "liability", mpers: "Amounts due to contract customers" },
    ],
  },
  {
    key: "foreign-workers",
    title: "Foreign workers (optional)",
    tier: "optional",
    blurb:
      "Levies and pass costs are expenses when incurred; a refundable security bond is an ASSET, not an expense. Conflating the two is the common error.",
    accounts: [
      { code: "900-FWL", name: "Foreign worker levy and pass costs (tax review)", type: "expense", mpers: "Employee benefits", note: "Levy, permit, pass and agent charges. Who is legally liable to pay, and whether any component is a penalty, changes the treatment." },
      { code: "410-FWL", name: "Foreign worker levy and pass payable", type: "liability", mpers: "Trade and other payables" },
      { code: "250-FWB", name: "Refundable security bond — foreign workers", type: "asset", mpers: "Other non-current assets", note: "Recoverable on repatriation — an asset until forfeited. Reclassify to current when recovery is expected within twelve months." },
    ],
  },
  {
    key: "zakat",
    title: "Zakat (optional)",
    tier: "optional",
    blurb:
      "For a company paying business zakat. A company's business zakat is dealt with as a deduction against aggregate income — it is not the individual-style rebate against tax payable, and it appears distinctly in the MBRS taxonomy. Eligibility, quantum and the receiving authority are all evidence questions.",
    accounts: [
      { code: "810-Z01", name: "Business zakat", type: "expense", mpers: "Zakat" },
      { code: "440-ZKT", name: "Zakat payable", type: "liability", mpers: "Trade and other payables", note: "Where zakat has been accrued but not paid. Never netted into current income tax payable." },
    ],
  },
];

export const STANDARD_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "standard");
export const OPTIONAL_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "optional");

export function templateAccounts(blockKeys: string[]): CoaTemplateAccount[] {
  return COA_TEMPLATE.filter((b) => blockKeys.includes(b.key)).flatMap((b) => b.accounts);
}

/**
 * KNOWN SCHEMA LIMITATIONS surfaced while building this template — recorded, not worked
 * around. All three are Wave-C/D candidates, not blockers:
 *
 * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
 *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
 *    thresholds, rates and — critically — different accounting bases (sales tax accrual,
 *    service tax payment), and imported taxable services is a third workflow. A dual
 *    registrant needs separately tagged control accounts, or every journal leg must carry
 *    an effective-dated sales/service treatment dimension. This template puts the marker
 *    on service tax (much the commoner case for SME service providers) and seeds the
 *    others as plain liabilities.
 *
 * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
 *    is correct for the operating-expense automation path, but SST attributable to
 *    inventory or PPE should be capitalised into the asset's cost and cannot be.
 *
 * 3. coa_accounts has no non-posting / header flag. Nothing in the DB prevents a journal
 *    from hitting both a summary account and its analysed children, which is real
 *    reporting leakage. Handled here by naming: 500-000 and 530-000 are documented as the
 *    unanalysed residual rather than as parents, so a balance sitting in them alongside
 *    populated children reads as uncoded income — a finding, not a presentation choice.
 */
