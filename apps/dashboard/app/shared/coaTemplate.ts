// The default Chart of Accounts template for a Malaysian private company (Sdn Bhd).
//
// PROVENANCE — read docs/plan/research/wave-b/malaysian-coa-official-research.md before
// changing anything here. Two independent lanes fed this file: web research against
// MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources, and a cross-model (gpt-5.6-sol)
// domain review. Both reached the same conclusion:
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
// DELIBERATELY ABSENT: rates, thresholds, percentages, effective dates. SST rates, tax
// bands, EPF/SOCSO/EIS/HRD rates and MyInvois deadlines are effective-dated compliance
// facts that change (service tax moved 6%->8% on 1 Mar 2024; scope expanded 1 Jul 2025;
// Service Tax Policies 1-4/2026 are live). They must never be encoded in an account name
// or in this file. MyInvois classification codes are transaction metadata, not accounts.
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
  /** core = every Sdn Bhd needs it; optional = offer, do not seed by default */
  tier: "core" | "optional";
  blurb: string;
  accounts: CoaTemplateAccount[];
};

/**
 * Code scheme (extends the convention already in use by the firm: 100-000 share capital,
 * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 COGS, 900-xxx
 * mnemonic operating expenses, 999-R00 rounding). Numeric order identifies the block; it
 * does not dictate statement order — the MPERS mapping does that.
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
    tier: "core",
    blurb:
      "No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances).",
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
    tier: "core",
    blurb: "Cost and accumulated depreciation held separately, as MPERS Section 17 disclosure requires.",
    accounts: [
      { code: "200-M01", name: "Motor vehicles — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-F01", name: "Furniture and fittings — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-C01", name: "Computer equipment — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-R01", name: "Renovation — cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-M01", name: "Accumulated depreciation — motor vehicles", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-F01", name: "Accumulated depreciation — furniture and fittings", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-C01", name: "Accumulated depreciation — computer equipment", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-R01", name: "Accumulated depreciation — renovation", type: "asset", mpers: "Property, plant and equipment" },
    ],
  },
  {
    key: "current-assets",
    title: "Current assets",
    tier: "core",
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
      { code: "300-900", name: "Allowance for impairment — trade receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "310-B01", name: "Bank — main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 …" },
      { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
      { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-D01", name: "Deposits paid", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "350-D01", name: "Amount owing from director", type: "asset", mpers: "Trade and other receivables — related party", note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off." },
      { code: "350-R01", name: "Amount owing from related company", type: "asset", mpers: "Trade and other receivables — related party" },
      { code: "360-T01", name: "Tax instalments paid / current tax receivable", type: "asset", mpers: "Current tax assets" },
    ],
  },
  {
    key: "liabilities",
    title: "Liabilities",
    tier: "core",
    blurb:
      "Every statutory payroll deduction is its own payable — EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable.",
    accounts: [
      { code: "400-000", name: "Trade payables — control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
      { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables" },
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
      { code: "420-D01", name: "Amount owing to director", type: "liability", mpers: "Trade and other payables — related party" },
      { code: "420-R01", name: "Amount owing to related company", type: "liability", mpers: "Trade and other payables — related party" },
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker — see the SST limitation note below.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Sales tax is a single-stage tax on manufacturers/importers, accounted on an ACCRUAL basis — a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
      },
      { code: "430-WHT", name: "Withholding tax payable", type: "liability", mpers: "Trade and other payables", note: "Payments to non-residents — ITA s.107A contract payments, s.4A technical/management fees." },
      { code: "440-001", name: "Current tax payable (provision for taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision — it belongs in current tax liabilities." },
      { code: "460-L01", name: "Borrowings — current", type: "liability", mpers: "Financial liabilities — current" },
      { code: "461-L01", name: "Borrowings — non-current", type: "liability", mpers: "Financial liabilities — non-current" },
      { code: "490-D01", name: "Customer deposits", type: "liability", mpers: "Trade and other payables" },
      { code: "490-R01", name: "Deferred income / contract liabilities", type: "liability", mpers: "Other liabilities" },
    ],
  },
  {
    key: "income",
    title: "Income",
    tier: "core",
    blurb: "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly.",
    accounts: [
      { code: "500-000", name: "Revenue", type: "income", mpers: "Revenue" },
      { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
      { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
      { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue — net" },
      { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue — net" },
      { code: "530-000", name: "Other income", type: "income", mpers: "Other income" },
      { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
      { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income" },
      { code: "530-FX1", name: "Realised foreign exchange gain", type: "income", mpers: "Other income", note: "Realised and unrealised kept apart — unrealised amounts are a tax-computation adjustment." },
      { code: "530-FX2", name: "Unrealised foreign exchange gain", type: "income", mpers: "Other income" },
      { code: "540-I01", name: "Interest income", type: "income", mpers: "Finance income" },
    ],
  },
  {
    key: "cost-of-sales",
    title: "Cost of sales",
    tier: "core",
    blurb: "Form C requires contract and subcontract payments to be separately disclosed.",
    accounts: [
      { code: "610-100", name: "Cost of goods sold / purchases", type: "expense", mpers: "Cost of sales" },
      { code: "610-S01", name: "Subcontractor and direct service costs", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." },
      { code: "610-F01", name: "Freight and carriage inward", type: "expense", mpers: "Cost of sales" },
      { code: "610-RET", name: "Purchase returns (contra)", type: "expense", mpers: "Cost of sales" },
      { code: "610-DIS", name: "Purchase discounts (contra)", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "finance-tax",
    title: "Finance costs and tax",
    tier: "core",
    blurb: "MPERS 5.5 requires finance costs and tax expense as separate face lines.",
    accounts: [
      { code: "800-I01", name: "Interest expense — borrowings", type: "expense", mpers: "Finance costs" },
      { code: "810-T01", name: "Current income tax expense", type: "expense", mpers: "Tax expense" },
      { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense" },
    ],
  },
  {
    key: "operating-expenses",
    title: "Operating expenses",
    tier: "core",
    blurb:
      "Split to serve the LHDN tax computation: entertainment is separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an add-back or restricted deduction.",
    accounts: [
      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
      { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
      { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
      { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
      { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses" },
      { code: "900-B03", name: "Impairment loss — trade receivables", type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation distinction." },
      { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
      { code: "900-D01", name: "Directors' fees and remuneration", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4) disclosure." },
      { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
      { code: "900-DON", name: "Donations", type: "expense", mpers: "Other operating expenses", note: "Deductibility depends on approved-institution status." },
      { code: "900-E01", name: "EPF — employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of remuneration, so this must be separately measurable." },
      { code: "900-E02", name: "SOCSO and EIS — employer contribution", type: "expense", mpers: "Employee benefits" },
      { code: "900-E03", name: "Entertainment — staff", type: "expense", mpers: "Administrative expenses", note: "Kept apart from client entertainment: the deduction restriction differs." },
      { code: "900-E04", name: "Entertainment — client / business", type: "expense", mpers: "Administrative expenses", note: "Restricted deduction." },
      { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
      { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "Tax-computation adjustment." },
      { code: "900-FIN", name: "Fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Non-deductible." },
      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
      { code: "900-I01", name: "Insurance", type: "expense", mpers: "Administrative expenses" },
      { code: "900-L01", name: "Legal and professional fees", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M02", name: "Management fees", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be separately disclosed." },
      { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 — check the supplier's registration status." },
      { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
      { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs vs capital improvement is a tax-computation distinction." },
      { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
      { code: "900-S03", name: "Software and subscriptions", type: "expense", mpers: "Administrative expenses" },
      { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
      {
        code: "900-SST",
        name: "SST on purchases (expensed)",
        type: "expense",
        special: "sst_purchase_cost",
        mpers: "Administrative expenses",
        note: "Malaysian SST is NOT a credit-offset VAT — it is a cost. Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT be routed here.",
      },
      { code: "900-T01", name: "Telephone and internet", type: "expense", mpers: "Administrative expenses" },
      { code: "900-T02", name: "Travel and accommodation", type: "expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep local and overseas distinguishable." },
      { code: "900-T03", name: "Toll and parking", type: "expense", mpers: "Administrative expenses", note: "Do NOT combine with fines — the tax treatment differs." },
      { code: "900-U01", name: "Utilities", type: "expense", mpers: "Administrative expenses" },
    ],
  },
  {
    key: "system",
    title: "System",
    tier: "core",
    blurb: "Machine-owned. A recurring or material rounding balance means a coding or calculation defect, not a real expense.",
    accounts: [{ code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" }],
  },
  {
    key: "inventory",
    title: "Inventories (optional)",
    tier: "optional",
    blurb: "Seed only for entities that hold stock.",
    accounts: [
      { code: "330-T01", name: "Trading inventory", type: "asset", mpers: "Inventories" },
      { code: "330-R01", name: "Raw materials", type: "asset", mpers: "Inventories" },
      { code: "330-W01", name: "Work in progress", type: "asset", mpers: "Inventories" },
      { code: "330-F01", name: "Finished goods", type: "asset", mpers: "Inventories" },
      { code: "330-900", name: "Allowance for inventory obsolescence", type: "asset", mpers: "Inventories" },
      { code: "620-ADJ", name: "Inventory movement and stock adjustments", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "investments",
    title: "Investments and deferred tax (optional)",
    tier: "optional",
    blurb: "Seed only where the entity holds investments or recognises deferred tax.",
    accounts: [
      { code: "230-001", name: "Investment property — cost", type: "asset", mpers: "Investment property" },
      { code: "231-001", name: "Accumulated depreciation — investment property", type: "asset", mpers: "Investment property" },
      { code: "240-S01", name: "Investment in subsidiaries", type: "asset", mpers: "Investments in subsidiaries" },
      { code: "240-A01", name: "Investment in associates", type: "asset", mpers: "Investments in associates" },
      { code: "260-DTA", name: "Deferred tax asset", type: "asset", mpers: "Deferred tax assets" },
      { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities" },
    ],
  },
];

export const CORE_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "core");
export const OPTIONAL_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "optional");

export function templateAccounts(blockKeys: string[]): CoaTemplateAccount[] {
  return COA_TEMPLATE.filter((b) => blockKeys.includes(b.key)).flatMap((b) => b.accounts);
}

/**
 * KNOWN SCHEMA LIMITATIONS surfaced while building this template — recorded, not worked
 * around. Both are Wave-C/D candidates, not blockers:
 *
 * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
 *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
 *    thresholds, rates and — critically — different accounting bases (sales tax accrual,
 *    service tax payment). A dual registrant needs two separately tagged control accounts,
 *    or every journal leg must carry an effective-dated sales/service treatment dimension.
 *    This template puts the marker on service tax (much the commoner case for SME service
 *    providers) and seeds sales tax as a plain liability.
 *
 * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
 *    is correct for the operating-expense automation path, but SST attributable to
 *    inventory or PPE should be capitalised into the asset's cost and cannot be.
 */
