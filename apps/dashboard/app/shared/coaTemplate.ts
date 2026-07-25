// The default Chart of Accounts template for a Malaysian accounting firm's clients — a
// private company (Sdn Bhd) by default, with an alternative equity shape for a sole
// proprietorship (see the ENTITY-SHAPE NOTE below).
//
// PROVENANCE — read docs/plan/research/wave-b/malaysian-coa-official-research.md (the
// official-source findings) and coa-review-adjudications.md (what two adversarial review
// rounds found, and what was decided) before changing anything here. Four lanes fed this
// file: web research against MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources; a
// cross-model (gpt-5.6-sol) domain review; an adversarial completeness review of the built
// template; and a second-pass verification of the revision. All reached the same starting
// conclusion:
//
//   MALAYSIA HAS NO STATUTORY CHART OF ACCOUNTS. The phrase "chart of accounts" appears
//   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both extracted in full
//   and grep-verified). MPERS 4.9 is explicit: "This Standard does not prescribe the
//   sequence or format in which items are to be presented", and 4.9(b) permits renaming
//   and resequencing. CA 2016 s.245 is outcome-based — records must "sufficiently explain
//   the transactions and financial position of the company".
//
// So this template is NOT an official list. It is a defensible default whose only binding
// constraint is MAPPABILITY: every account rolls up to one of the MPERS_ROLLUPS values
// below, each of which corresponds to an MPERS 4.2 / 5.5 face line, an MBRS (SSMxT)
// taxonomy concept, or an explicitly-flagged must-clear working account. It is a starting
// point a professional edits per client — not a rule.
//
// TWO STANDING RULES, both learned the hard way in review, both test-pinned:
//
//   1. AN ACCOUNT NAME MUST NEVER ASSERT A TAX CONCLUSION. Deductibility turns on facts
//      the ledger does not hold (purpose, payer, contract, residence, evidence). Accounts
//      are named for the FACTS that drive the treatment — "Entertainment — clients,
//      suppliers and non-logo gifts", not "Entertainment — 50% restricted" — and where
//      the treatment is genuinely open the name carries "(tax review)".
//   2. NO TAX RATES, THRESHOLDS, PERCENTAGES, MONETARY LIMITS OR EFFECTIVE DATES, in a
//      name or a note. Those are effective-dated compliance facts that move (service tax
//      6%->8% in Mar 2024; scope expanded Jul 2025; Service Tax Policies 1-4/2026 live)
//      and belong in the tax engine. THREE THINGS ARE EXEMPT, because they are stable and
//      identify a rule rather than quantify one: statutory SECTION and instrument
//      citations (s.39(1)(l), P.U.(A) 475/2003, PR 4/2015, Act 800); the MPERS 4.5/4.7
//      twelve-month current/non-current classification criterion; and MyInvois or MBRS
//      classification codes, which are transaction metadata.
//
// FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. MPERS (2025) —
// Malaysia's adoption of IFRS for SMEs 3rd edition — was gazetted 10 October 2025 and
// applies to annual periods beginning on or after 1 January 2027 (early adoption
// permitted). Sections 4 and 5 PRESENTATION is substantively unchanged, so the statement
// structure this template maps to survives the transition. Section 23 does NOT: the third
// edition replaces the current contract-accounting model (amounts due from/to customers)
// with a five-step performance-obligation model, so the construction module and the
// unbilled-income accounts will need revisiting before a client's first period beginning
// on or after 1 January 2027.
//
// ENTITY-SHAPE NOTE: the chart is per-client data and clara.coa_accounts is entity-agnostic,
// so the template carries a SECOND equity shape rather than forcing every client into a
// company. MPERS reaches only a "private entity", which MASB defines as "a private company
// as defined in section 2 of the Companies Act 2016" that neither prepares nor lodges
// financial statements under a Securities Commission or Bank Negara law and is not a
// subsidiary, associate or jointly controlled by an entity that does. A sole proprietorship
// registered under the Registration of Businesses Act 1956 is not a company, so MPERS does
// not reach it — and no other financial-reporting framework is imposed on it either: that
// Act is "An Act to provide for the registration of businesses", and its arrangement of
// sections runs registration, renewal, termination, appeal, offences and rule-making, with
// NO accounts, financial-statement or audit provision anywhere in it. What does bind is
// ITA s.82, on which LHDN's Public Ruling "Keeping Sufficient Records (Individuals &
// Partnerships)" requires books "sufficient to explain the transactions and to enable a true
// and fair profit and loss account and a balance sheet to be prepared", and separately names
// records of private money brought into the business, of personal drawings, and of capital
// and current accounts. So TWO blocks are entity-shaped, and both are declared mutually
// exclusive with `sole-proprietor`: the `equity` block (clara.coa_accounts permits exactly
// one retained-earnings marker per client, and both shapes need it) and `company-officers`
// (dividends and directors presuppose shareholders and a board — see that block's blurb for
// why a note could not have carried this). Everything else is common to both shapes, and the
// roll-up strings there name ordinary statement lines an unincorporated balance sheet carries
// too. See limitation 5.

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
  /**
   * The statement line this account rolls into — one of MPERS_ROLLUPS, never free text.
   * For the P&L this names the BY-FUNCTION face line (the presentation Malaysian SME
   * statutory accounts normally file), except where an account feeds a required
   * by-nature disclosure (employee benefits, research and development), which is tagged
   * as such. See limitation 4: one static string cannot serve both presentations.
   */
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
  /**
   * Blocks that CANNOT be seeded alongside this one. Declared on BOTH sides and test-pinned
   * symmetric. TWO reasons are admissible, both structural rather than stylistic:
   *
   *   (a) A DB constraint refuses MID-APPLY. clara.uq_coa_special is UNIQUE per
   *       (client_id, special_acc_type), so two blocks each carrying a retained-earnings
   *       marker are mutually exclusive by construction, not by preference. Note what that
   *       failure actually looks like: the apply loop catches per-account errors and
   *       CONTINUES, so it is not a truncated run — it is one error row among ~200, and a
   *       chart that looks complete while the wrong account holds accumulated equity.
   *   (b) The accounts presuppose a legal form the other block's entity does not have —
   *       dividends and directors against a sole proprietorship. Selection is per BLOCK,
   *       so an instruction to deselect individual accounts would name an operation the
   *       workbench cannot perform; only a block can carry the entity choice.
   *
   * toggleBlockKey() drops the conflicting selection so the operator sees a checkbox change
   * instead of either outcome. Two STANDARD blocks may never conflict — the default
   * selection would then be invalid on its face.
   */
  conflictsWith?: readonly string[];
  blurb: string;
  accounts: CoaTemplateAccount[];
};

/**
 * The closed set of statement roll-ups. Every account's `mpers` must be one of these, so
 * that adding an account forces a deliberate mapping decision instead of a new free-text
 * string that nothing consumes. Test-pinned.
 */
export const MPERS_ROLLUPS = [
  // --- statement of financial position: assets
  "Property, plant and equipment",
  "Investment property",
  "Intangible assets",
  "Investments in subsidiaries",
  "Investments in associates",
  "Deferred tax assets",
  "Other non-current assets",
  "Trade and other receivables — related party (non-current)",
  "Inventories",
  "Trade and other receivables",
  "Trade and other receivables — related party",
  "Amounts due from contract customers",
  "Cash and cash equivalents",
  "Other current assets",
  "Current tax assets",
  // --- statement of financial position: liabilities
  "Trade and other payables",
  "Trade and other payables — related party",
  "Trade and other payables — related party (non-current)",
  "Amounts due to contract customers",
  "Current tax liabilities",
  "Deferred tax liabilities",
  "Loans and borrowings — current",
  "Loans and borrowings — non-current",
  "Employee benefit obligations — current",
  "Employee benefit obligations — non-current",
  "Provisions — current",
  "Provisions — non-current",
  "Other liabilities — current",
  "Other liabilities — non-current",
  // --- statement of financial position: equity
  "Equity — share capital",
  "Equity — other reserves",
  "Equity — retained earnings",
  "Equity — retained earnings movement",
  // The unincorporated equity shape. MPERS reaches only a private COMPANY (Companies Act
  // 2016 s.2), so a sole proprietorship's equity section has no MPERS face line at all —
  // these two name the line its balance sheet actually carries and say so in their own
  // text, rather than borrowing a company roll-up that would misdescribe the entity. See
  // the ENTITY-SHAPE NOTE and limitation 5.
  "Equity — proprietor's capital (no MPERS roll-up)",
  "Equity — proprietor's capital movement (no MPERS roll-up)",
  "Equity — must clear to nil (no statutory roll-up)",
  // --- income statement
  "Revenue",
  "Revenue — net",
  "Other income",
  "Finance income",
  "Cost of sales",
  "Selling and distribution expenses",
  "Administrative expenses",
  "Administrative expenses — must be reallocated",
  "Other operating expenses",
  "Employee benefits",
  "Research and development expenses",
  "Finance costs",
  "Tax expense",
  "Contribution to zakat",
] as const;

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
    title: "Equity — company (Sdn Bhd)",
    tier: "standard",
    conflictsWith: ["sole-proprietor"],
    blurb:
      "The COMPANY equity shape, and the default. No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances). Dividends are distributions of equity, never a P&L expense. An unincorporated client takes the sole-proprietorship equity block INSTEAD — selecting that one deselects this one, because clara.coa_accounts permits exactly one retained-earnings marker per client and both shapes need it. Opening balance equity is not here: it is machinery every client keeps, so it lives in the System block.",
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
    ],
  },
  {
    key: "company-officers",
    title: "Directors and distributions — company only",
    tier: "standard",
    conflictsWith: ["sole-proprietor"],
    blurb:
      "Every account here presupposes a SEPARATE LEGAL PERSON with shareholders and a board: a distribution payable to members, remuneration of office-holders, and balances with directors as counterparties in their own right. A sole proprietorship has none of those — the proprietor cannot be his own director or his own debtor, and money he puts in or takes out is capital (100-CAP / 160-DRW), not a related-party balance. They are a block rather than a note because selection is per BLOCK: an instruction to deselect eight individual accounts names an operation the workbench cannot perform, so the entity choice has to carry them. Selecting the sole-proprietorship equity shape drops this block automatically. Pairs with the company equity block: 410-DIV is the payable side of 160-DIV.",
    accounts: [
      {
        code: "250-DIR",
        name: "Amount owing from director — non-current",
        type: "asset",
        mpers: "Trade and other receivables — related party (non-current)",
        note: "Directional. Never net against 472-DIR without a legally enforceable right of set-off. MPERS 4.5 classifies by expected recovery against the twelve-month criterion, not by counterparty.",
      },
      {
        code: "350-D01",
        name: "Amount owing from director — current",
        type: "asset",
        mpers: "Trade and other receivables — related party",
        note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off. MPERS Section 33 related-party disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
      },
      {
        code: "410-DIV",
        name: "Dividends payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Recognised only once the distribution is validly authorised and no longer at the company's discretion (CA 2016 ss.131-132). Pairs with 160-DIV in the company equity block.",
      },
      { code: "420-D01", name: "Amount owing to director — current", type: "liability", mpers: "Trade and other payables — related party" },
      { code: "472-DIR", name: "Amount owing to director — non-current", type: "liability", mpers: "Trade and other payables — related party (non-current)" },
      { code: "900-D01", name: "Directors' fees", type: "expense", mpers: "Administrative expenses", note: "Form C analyses fees separately from salaries. Approval follows CA 2016 s.230 — for a private company generally board approval subject to the constitution, then notification to members. CA 2016 s.249(4) disclosure." },
      { code: "900-D04", name: "Directors' salaries and bonuses", type: "expense", mpers: "Employee benefits", note: "EPF/SOCSO/PCB consequences turn on whether the director is engaged under a CONTRACT OF SERVICE — not on the ledger label. Do not treat the fee/salary split as deciding statutory liability." },
      { code: "900-D05", name: "Directors' benefits and other remuneration", type: "expense", mpers: "Employee benefits", note: "Benefits-in-kind need their own analysis for payroll and BIK reporting. CA 2016 s.249(4) disclosure." },
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
      "MPERS 4.5 classifies by EXPECTED RECOVERY against the twelve-month criterion, not by counterparty. A tenancy deposit recoverable in three years is not a current asset, and a related-party balance's maturity cannot be inferred from the fact that it is related-party.",
    accounts: [
      {
        code: "250-DEP",
        name: "Refundable deposits — non-current",
        type: "asset",
        mpers: "Other non-current assets",
        note: "Tenancy, utility and security deposits not expected to be recovered within the MPERS 4.5 twelve-month window. Current ones stay in 340-D01.",
      },
      {
        code: "250-PDG",
        name: "Pledged or restricted deposits — non-current",
        type: "asset",
        mpers: "Other non-current assets",
        note: "A deposit pledged against a facility is not freely available cash and must not be presented as a cash equivalent.",
      },
      { code: "250-REL", name: "Amount owing from related company — non-current", type: "asset", mpers: "Trade and other receivables — related party (non-current)" },
      {
        code: "260-DTA",
        name: "Deferred tax asset",
        type: "asset",
        mpers: "Deferred tax assets",
        note: "Recognition is assessed under MPERS Section 29, which carries its own exceptions and — for an asset — a recoverability constraint. A temporary difference does not by itself produce a recognised balance. Sits with 450-DTL and 810-T02 in the standard set because deferred tax is an accounting conclusion, not an optional bookkeeping preference.",
      },
    ],
  },
  {
    key: "current-assets",
    title: "Current assets",
    tier: "standard",
    blurb:
      "Trade receivables carries the receivable control marker. Related-company balances are separate, directional and never netted — MPERS Section 33 related-party disclosure. Balances with DIRECTORS sit in the company-officers block instead, because they presuppose an office a sole proprietorship does not have.",
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
        name: "Allowance for impairment — individually assessed",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Debt-by-debt, evidence-based. Kept apart from 300-901 because LHDN PR 4/2019 treats an evidenced specific allowance differently from a collective one.",
      },
      {
        code: "300-901",
        name: "Allowance for impairment — collective",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Portfolio or percentage-based. A general allowance is typically adjusted in the tax computation when created and reverses on write-off or release — a timing question, not automatically a permanent one. Never merge it into 300-900.",
      },
      { code: "310-B01", name: "Bank — main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 …" },
      {
        code: "310-FD1",
        name: "Short-term deposits — cash equivalents",
        type: "asset",
        mpers: "Cash and cash equivalents",
        note: "Only placements that are short-term, highly liquid, readily convertible to a known amount of cash and subject to insignificant risk of change in value. Anything else belongs in 340-FD1.",
      },
      { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
      {
        code: "340-FD1",
        name: "Deposits and placements — not cash equivalents",
        type: "asset",
        mpers: "Other current assets",
        note: "Current placements that fail the cash-equivalent test. Keeping them out of 310-FD1 keeps the cash-flow statement's cash line honest.",
      },
      { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-D01", name: "Deposits paid — current", type: "asset", mpers: "Trade and other receivables", note: "Expected to be recovered within the MPERS 4.5 twelve-month window; longer-dated ones belong in 250-DEP." },
      { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
      {
        code: "340-UNB",
        name: "Unbilled income accrued",
        type: "asset",
        mpers: "Trade and other receivables",
        note: "Revenue earned and reliably measurable but not yet invoiced, under the ordinary MPERS Section 23 revenue model. A long-term construction contract is NOT accounted for here — it uses the gross amount due from customers (370-CON, construction module).",
      },
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
      "Every statutory payroll deduction is its own payable — EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable. Current/non-current follows the MPERS 4.7-4.8 twelve-month criterion, never the counterparty's identity.",
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
      { code: "420-R01", name: "Amount owing to related company — current", type: "liability", mpers: "Trade and other payables — related party" },
      {
        code: "430-WHT",
        name: "Withholding tax payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Tax the company withholds from a payee and owes to LHDN — commonly s.107A contract payments and s.4A technical/management fees, but also interest, royalties, s.109 and public-entertainer withholdings, each with its own remittance form and deadline. Keep the remittance class identifiable per transaction. Opposite in direction to 360-WHT.",
      },
      {
        code: "440-001",
        name: "Current income tax payable",
        type: "liability",
        mpers: "Current tax liabilities",
        note: "Deliberately NOT called a 'provision for taxation' — it is a current tax liability, not an MPERS Section 21 provision.",
      },
      { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities", note: "Recognition assessed under MPERS Section 29 — see 260-DTA. Liabilities and assets have different recognition requirements and explicit exceptions." },
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
      { code: "460-L01", name: "Borrowings — current", type: "liability", mpers: "Loans and borrowings — current" },
      {
        code: "460-OD1",
        name: "Bank overdraft",
        type: "liability",
        mpers: "Loans and borrowings — current",
        note: "Separate from term borrowings. It forms part of cash and cash equivalents for cash-flow presentation only where it is repayable on demand and integral to cash management.",
      },
      { code: "461-L01", name: "Borrowings — non-current", type: "liability", mpers: "Loans and borrowings — non-current" },
      { code: "472-REL", name: "Amount owing to related company — non-current", type: "liability", mpers: "Trade and other payables — related party (non-current)" },
      {
        code: "490-D01",
        name: "Refundable customer deposits — current",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Returnable security or tenancy deposits held. Not contract consideration — see 490-R01.",
      },
      {
        code: "490-R01",
        name: "Contract liabilities and deferred income — current",
        type: "liability",
        mpers: "Other liabilities — current",
        note: "Consideration received or receivable for performance not yet delivered, expected to be settled within the MPERS 4.7 twelve-month window.",
      },
      { code: "491-D01", name: "Refundable customer deposits — non-current", type: "liability", mpers: "Other liabilities — non-current", note: "The maturity sibling of 490-D01. Presentation follows expected settlement, not the deposit's label." },
      { code: "491-R01", name: "Contract liabilities and deferred income — non-current", type: "liability", mpers: "Other liabilities — non-current", note: "The maturity sibling of 490-R01." },
    ],
  },
  {
    key: "income",
    title: "Income",
    tier: "standard",
    blurb:
      "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly, and the streams Form C analyses separately each have their own line. 500-000 and 530-000 are RESIDUALS, not headers — re-applying the template to an existing client will rename them accordingly.",
    accounts: [
      {
        code: "500-000",
        name: "Revenue — unanalysed",
        type: "income",
        mpers: "Revenue",
        note: "The residual for revenue not yet coded to a stream. The schema has no non-posting header flag (limitation 3), so this is named for what it is: a balance sitting here alongside populated children means revenue is still uncoded, not that there are two revenue streams.",
      },
      { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
      { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
      { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue — net" },
      { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue — net" },
      { code: "530-000", name: "Other income — unanalysed", type: "income", mpers: "Other income", note: "Same rule as 500-000: the residual, not a header." },
      { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
      { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income", note: "Pairs with 900-DSP. The accounting gain is not the tax outcome: balancing charges, RPGT or capital-gains treatment are each computed from the asset and the transaction, not from this balance." },
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
      "POSTING POLICY, pick one per client and hold to it. PERPETUAL: post the charged-out cost to 610-100 and leave 610-PUR and 620-ADJ nil. PERIODIC: post goods bought to 610-PUR and the opening/closing stock movement to 620-ADJ, and leave 610-100 nil. Mixing the two double-counts cost of sales, and nothing in the schema prevents it.",
    accounts: [
      { code: "610-100", name: "Cost of sales (perpetual)", type: "expense", mpers: "Cost of sales", note: "The charged-out cost of goods or services sold, recognised as each sale is recognised." },
      { code: "610-PUR", name: "Purchases (periodic)", type: "expense", mpers: "Cost of sales", note: "Goods bought for resale or conversion. Separated from 610-100 because Form C treats purchases and cost of sales as different fields — and because posting to both is the classic double-count." },
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
      { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense", note: "Pairs with 260-DTA and 450-DTL. Recognition is assessed under MPERS Section 29 with its own exceptions — not an automatic consequence of every temporary difference." },
    ],
  },
  {
    key: "operating-expenses",
    title: "Operating expenses",
    tier: "standard",
    blurb:
      "Split to serve the LHDN tax computation: entertainment is separated by the FACTS that drive its treatment, and depreciation, donations, statutory fines and unrealised FX are isolated because each is an add-back or a restricted deduction. No account name states a deduction outcome.",
    accounts: [
      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
      { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
      { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
      { code: "900-A04", name: "Tax return preparation and filing fee", type: "expense", mpers: "Administrative expenses", note: "Routine compliance filing, kept apart from advisory and contentious work (900-A05) because the specific-deduction rules for tax fees do not reach every kind of tax service." },
      { code: "900-A05", name: "Tax advisory, objection and appeal fees (tax review)", type: "expense", mpers: "Administrative expenses", note: "Advice, restructuring, objections, investigations and appeals. Treatment turns on purpose and on whether the expenditure is capital or revenue in character." },
      { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
      { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses", note: "A write-off of a specific debt judged irrecoverable, supported by evidence of recovery efforts (LHDN PR 4/2019)." },
      { code: "900-B03", name: "Impairment loss — individually assessed", type: "expense", mpers: "Other operating expenses", note: "Movement on 300-900." },
      { code: "900-B04", name: "Impairment loss — collective", type: "expense", mpers: "Other operating expenses", note: "Movement on 300-901. Adjusted in the tax computation when created and reversing on write-off or release — never merged with 900-B03." },
      { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
      { code: "900-CMP", name: "Contractual compensation and damages (tax review)", type: "expense", mpers: "Other operating expenses", note: "Commercial compensation, liquidated damages and settlements — NOT statutory penalties (900-FIN). Treatment depends on whether the payment arises in the ordinary course of the trade." },
      { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Replaced by capital allowances in the tax computation. Under a by-function presentation, depreciation of production or delivery assets is allocated to cost of sales or distribution rather than administration — see limitation 4." },
      { code: "900-DON", name: "Donations with current approval evidence (tax review)", type: "expense", mpers: "Other operating expenses", note: "Post here only where a receipt from an institution, organisation or fund with current approved status is held. Approved status is verifiable on the LHDN register and is a fact about the recipient, not a claim this account makes." },
      { code: "900-DN2", name: "Donations, sponsorships and contributions — no approval evidence", type: "expense", mpers: "Other operating expenses", note: "Everything without an approved-status receipt, plus sponsorships, which follow their own rules. Kept apart so 900-DON stays a clean, evidenced figure." },
      { code: "900-DSP", name: "Loss on disposal of assets", type: "expense", mpers: "Other operating expenses", note: "Pairs with 530-G01." },
      { code: "900-E01", name: "EPF — employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts the deduction for approved-scheme contributions above a statutory proportion of remuneration, so the figure must be separately measurable." },
      { code: "900-E02", name: "SOCSO — employer contribution", type: "expense", mpers: "Employee benefits", note: "Act 4. Separately legislated, computed and reconciled from EIS." },
      { code: "900-E07", name: "EIS — employer contribution", type: "expense", mpers: "Employee benefits", note: "Act 800 — a different scheme from Act 4, mirroring the separate liability accounts." },
      {
        code: "900-E03",
        name: "Entertainment — staff, logo gifts and promotional (s.39(1)(l) provisos)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "The fact patterns the s.39(1)(l) provisos address, per LHDN PR 4/2015 Table 1: entertainment for employees, gifts bearing the business logo, sales-incentive trips, promotional launches to customers. The classification still rests on the recipient, purpose and evidence.",
      },
      {
        code: "900-E04",
        name: "Entertainment — clients, suppliers and non-logo gifts (s.39(1)(l))",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Client hospitality, festive hampers and gifts without a business logo. PR 4/2015 excludes entertainment to SUPPLIERS from the 'related wholly to sales' proviso, so supplier entertainment belongs here and not in 900-E03.",
      },
      {
        code: "900-E05",
        name: "Entertainment — AGM, related-company staff and non-business (s.33(1))",
        type: "expense",
        mpers: "Administrative expenses",
        note: "The PR 4/2015 Table 1 patterns that fail the s.33(1) wholly-and-exclusively test: the company's own AGM, wedding gifts, entertainment for employees of RELATED companies, closed-transaction prospects, cash contributions to a customer's event.",
      },
      {
        code: "900-E06",
        name: "Leave passage",
        type: "expense",
        mpers: "Administrative expenses",
        note: "ITA s.39(1)(m) addresses employee leave passage, with the s.39(1)(l)(viii) exception for a yearly local event including the employee's immediate family. Keep it alone so the tax computation can see it.",
      },
      { code: "900-EQR", name: "Equipment and machinery rental", type: "expense", mpers: "Administrative expenses", note: "An operating lease under MPERS 20.15. Kept apart from motor-vehicle rental because the restrictions differ." },
      { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
      { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "Adjusted in the tax computation; the revenue/capital character of the underlying transaction still governs (LHDN PR 12/2019)." },
      { code: "900-FIN", name: "Statutory fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Penalties imposed by an authority for a contravention — generally caught by s.33(1)/s.39. Commercial damages and settlements belong in 900-CMP, and late-payment interest on a facility is a finance cost." },
      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
      { code: "900-I01", name: "Insurance and takaful", type: "expense", mpers: "Administrative expenses", note: "Conventional and takaful cover share one account — the label does not change the treatment. Key-person cover does not: see 900-KMI." },
      {
        code: "900-I02",
        name: "Company formation costs (tax review)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "The six heads named in the Income Tax (Deduction For Incorporation Expenses) Rules 2003 [P.U.(A) 475/2003, amended 472/2005]: M&A/prospectus preparation and printing, company registration and statutory documents, preliminary contracts, debenture/share certificate printing, company seal, underwriting commission. NOT labelled 'qualifying': those Rules key on an authorised-capital test, and the Companies Act 2016 abolished authorised capital — the mismatch is unresolved for any company whose constitution has no authorised-capital concept, so deductibility is a tax-computation judgement, never a ledger conclusion. Costs directly attributable to issuing equity reduce equity instead of being expensed.",
      },
      {
        code: "900-I03",
        name: "Other pre-commencement costs (tax review)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Everything else in a formation bundle — secretarial fees, service tax, travelling, sundries. LHDN PR 11/2013 Example 5 disallowed exactly these inside a claimed incorporation cost, and states a mixed bundle cannot be adjudicated: the split is mandatory. Pre-commencement expenditure is generally not deductible (PR 11/2013 para 6.1).",
      },
      { code: "900-IMP", name: "Impairment loss / reversal — non-financial assets", type: "expense", mpers: "Other operating expenses", note: "MPERS Section 27 impairment of PPE, intangibles, inventories held at cost and cost-model investment property. Reversals are posted here too, so the movement is readable in one place. Separate from receivable impairment (900-B03/900-B04)." },
      { code: "900-KMI", name: "Key-person insurance / takaful (tax review)", type: "expense", mpers: "Administrative expenses", note: "Treatment turns on the policyholder, the insured, the beneficiary, the business-loss purpose and any investment or surrender element — facts the ledger does not hold (LHDN PR 2/2003)." },
      { code: "900-L01", name: "Legal and professional fees — trading matters", type: "expense", mpers: "Administrative expenses", note: "Debt recovery, employment, ordinary supply and customer contracts, licence and tenancy renewals." },
      {
        code: "900-L02",
        name: "Transaction and deal costs — pending allocation (tax review)",
        type: "expense",
        mpers: "Administrative expenses — must be reallocated",
        note: "A CLEARING line, like 190-OBE. Legal, valuation, agency and advisory costs on a property purchase, a financing, a share issue or an acquisition land here and must be reallocated before the statements are finalised: to the asset under MPERS 17.10, to the financial liability's measurement under Section 11, or against equity under Section 22. A residual balance here at year end is a finding, not an administrative expense.",
      },
      { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M02", name: "Management fees — resident", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees paid to residents to be separately disclosed." },
      { code: "900-M04", name: "Technical and management fees — non-resident", type: "expense", mpers: "Administrative expenses", note: "ITA s.4A fees. Withholding under s.109B and the payer's remittance obligation attach here — see 430-WHT." },
      { code: "900-MVR", name: "Motor vehicle rental", type: "expense", mpers: "Administrative expenses", note: "An operating lease; the s.39 restriction on passenger-vehicle leasing is applied in the tax computation from the vehicle's own facts." },
      { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental of premises may fall within the service-tax scope depending on the exact service, the exclusions and exemptions that apply and the landlord's registration status — check the current RMCD position rather than assuming either way." },
      { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
      { code: "900-PRE", name: "Pre-opening and pre-operating costs (tax review)", type: "expense", mpers: "Administrative expenses", note: "Start-up, establishment, pre-opening and pre-operating expenditure of a NEW activity or facility of an existing company. MPERS Section 18 expenses it — it is not an intangible asset — but deductibility is not automatic where it precedes the production of gross income. Distinct from 900-I02/900-I03, which concern the company's own formation." },
      { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs versus capital improvement is a tax-computation distinction; capitalised work belongs in 200-R01." },
      { code: "900-RND", name: "Research and development", type: "expense", mpers: "Research and development expenses", note: "MPERS Section 18 expenses internally incurred expenditure on BOTH research and development as it is incurred, unless it forms part of another recognised asset — the full-IFRS development-capitalisation test does not apply. Any enhanced or double deduction requires its own approval evidence and schedule, never inferred from this balance." },
      { code: "900-RYL", name: "Royalties and licence fees", type: "expense", mpers: "Administrative expenses", note: "Withholding may apply where the recipient is non-resident — see 430-WHT." },
      { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
      { code: "900-S03", name: "Software subscriptions and SaaS", type: "expense", mpers: "Administrative expenses", note: "Recurring subscription only. Separately acquired or controlled software belongs in the intangibles module (220-SW1), and implementation or configuration costs need their own facts-based analysis." },
      { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
      {
        code: "900-SST",
        name: "SST on purchases (expensed)",
        type: "expense",
        special: "sst_purchase_cost",
        mpers: "Administrative expenses — must be reallocated",
        note: "Malaysian SST is not a credit-offset VAT, so SST charged by a supplier is generally a cost — but not universally: a registered manufacturer may access the sales-tax deduction facility. Use this account ONLY for SST attributable to operating expenses; SST attributable to inventory or PPE forms part of that asset's cost and cannot be routed here (limitation 2). Because it collects SST across every function, the balance must be reallocated to the function of the underlying cost before a by-function statement is filed.",
      },
      { code: "900-STP", name: "Stamp duty and registration costs (tax review)", type: "expense", mpers: "Administrative expenses", note: "Use only where the duty does not attach to an identifiable asset, lease, financing, share issue or acquisition — duty on those follows the underlying instrument and belongs with it (900-L02 while pending)." },
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
    blurb:
      "Machine-owned, entity-agnostic and never deselected: both accounts exist because a DB mechanism resolves them by MARKER, not because any standard presents them. A recurring or material rounding balance means a coding or calculation defect, not a real expense. Opening balance equity sits here rather than in an equity block because the opening-balance carry-down needs it for EVERY client whatever its entity shape — a company-shaped equity block was the wrong place to keep a machine account, and a sole proprietor who swapped that block out lost the one line Gate K refuses without.",
    accounts: [
      {
        code: "190-OBE",
        name: "Opening balance equity (system clearing)",
        type: "equity",
        special: "opening_balance_equity",
        mpers: "Equity — must clear to nil (no statutory roll-up)",
        note: "A conversion account, not permanent equity, and not a statutory presentation concept. Must net to nil and be cleared before statutory statements are finalised. The opening-balance carry-down resolves it — and the accumulated-equity marker beside it — by special_acc_type and refuses outright if either is missing, so this account ships with every entity shape.",
      },
      { code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" },
    ],
  },
  {
    key: "sole-proprietor",
    title: "Sole proprietorship equity (optional)",
    tier: "optional",
    conflictsWith: ["equity", "company-officers"],
    blurb:
      "The UNINCORPORATED equity shape — for a business registered under the Registration of Businesses Act 1956, certified by its proprietor rather than by directors, and filing Form B rather than Form C. Selecting it DESELECTS BOTH company-shaped blocks, so no deselection is left for the operator to remember: the company equity block goes (share capital, reserves, retained earnings and the dividend-clearing line have no counterpart in a business with no shareholders, and both shapes need the single retained-earnings marker clara.coa_accounts allows per client), and the company-officers block goes with it (dividends payable, directors' fees, salaries and benefits, and the four director related-party balances — there are no directors, and money the proprietor puts in or takes out is capital, not a balance with a separate legal person). KEEP the System block exactly as it is: opening balance equity and rounding are DB machinery, and the opening-balance carry-down refuses without both the OBE and the accumulated-equity markers. KEEP the payroll accounts if the business has STAFF — but not for the proprietor himself: he cannot be his own employee, so his EPF self-employed voluntary contributions and his contributions under the Self-Employment Social Security Act 2017 (Act 789) are contributions by a self-employed person, never employer contributions on a contract of service, and they do not belong in 900-E01/900-E02/900-E07.",
    accounts: [
      {
        code: "100-CAP",
        name: "Capital account — contributed by the proprietor",
        type: "equity",
        mpers: "Equity — proprietor's capital (no MPERS roll-up)",
        note: "Money and assets the proprietor puts INTO the business, held as a STANDING BALANCE — it is not closed off or cleared at year end, and it is not the mirror of a company's dividend-clearing account. It is the Form B financial particulars' own separate *Capital account* line, which is read straight off this balance. Kept apart from 150-CAP because a contribution is not a profit: netting the two before the Form B analysis is prepared destroys exactly the split LHDN asks for. LHDN's records ruling for individuals and partnerships (ITA s.82) requires a record of private money brought into the business, with the evidence retained.",
      },
      {
        code: "150-CAP",
        name: "Proprietor's capital account — accumulated",
        type: "equity",
        special: "retained_earnings",
        mpers: "Equity — proprietor's capital (no MPERS roll-up)",
        note: "The proprietor's ACCUMULATED equity position — the balance brought forward plus the period's profit or loss, against which 160-DRW's drawings are set — which is how Malaysian sole-proprietor accounts are normally presented, and the account the opening-balance carry-down targets. Named 'accumulated' to keep it distinct from 100-CAP, which holds what the proprietor contributed; the two are the contributed and accumulated sides of one capital position, not two competing capital accounts. NAMING TENSION, stated rather than hidden: special_acc_type='retained_earnings' is a DB MECHANISM, not a claim about this account's title. clara.coa_accounts admits exactly one accumulated-equity marker per client and the carry-down resolves that marker rather than a code; for an unincorporated business the accumulated-equity position IS the capital account. Do not import the marker's wording into the name — retained earnings is a company concept and this entity has no shareholders. The Form B financial particulars' analysis is served by the THREE accounts together and NOT by splitting this one: 100-CAP is the Capital account line, while this account and 160-DRW carry the current-account movement — balance brought forward, the year's result, drawings. A strict capital/current PAIR here was considered and refused, because a split the client's own books do not hold would let the opening plug land in the wrong half and the schema has no non-posting header to stop it (limitation 3).",
      },
      {
        code: "160-DRW",
        name: "Drawings",
        type: "equity",
        mpers: "Equity — proprietor's capital movement (no MPERS roll-up)",
        note: "Cash, goods and personal expenditure taken OUT of the business by the proprietor: a reduction of his capital, NEITHER a salary NOR a deductible expense. A sole proprietorship is not a separate legal person, so the proprietor cannot employ himself and nothing here belongs in 900-S01; ITA s.39(1)(a) denies a deduction for domestic or private expenses and s.39(1)(b) for any disbursement not wholly and exclusively laid out to produce the gross income. Kept apart from 150-CAP so the capital roll-forward stays readable, exactly as 160-DIV is kept apart from 150-000. LHDN's records ruling for individuals and partnerships requires money taken out of the business for personal or family use to be recorded, and the Form B financial particulars ask for drawings as their own line. The proprietor's own EPF self-employed voluntary contributions and Self-Employment Social Security Act 2017 (Act 789) contributions are his as a self-employed individual; where the business account pays them they are his personal expenditure, and whether he obtains relief for them is a question for his individual tax computation, never a conclusion this ledger states.",
      },
    ],
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
      { code: "470-H01", name: "Hire purchase liability — current", type: "liability", mpers: "Loans and borrowings — current", note: "The current/non-current split comes from MPERS 4.4 and 4.7(c), not Section 20." },
      { code: "471-H01", name: "Hire purchase liability — non-current", type: "liability", mpers: "Loans and borrowings — non-current", note: "MPERS 4.8: all other liabilities as non-current." },
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
      "MPERS Section 18. Separately acquired software and licences meeting the recognition criteria are assets, not subscriptions — but internally generated goodwill, start-up costs, training, research AND development are expensed as incurred. The amortisation charge lives here too, so it is never seeded without the assets it belongs to.",
    accounts: [
      { code: "220-SW1", name: "Acquired software and licences — cost", type: "asset", mpers: "Intangible assets" },
      { code: "221-SW1", name: "Accumulated amortisation — acquired software and licences", type: "asset", mpers: "Intangible assets" },
      { code: "220-IPR", name: "Other intangible assets — cost", type: "asset", mpers: "Intangible assets", note: "Trademarks, patents and similar separately acquired rights." },
      { code: "221-IPR", name: "Accumulated amortisation — other intangible assets", type: "asset", mpers: "Intangible assets" },
      { code: "900-AMO", name: "Amortisation of intangible assets", type: "expense", mpers: "Administrative expenses", note: "Like depreciation, replaced by capital allowances where the asset qualifies, and reallocated by function where the intangible serves production or distribution (limitation 4)." },
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
      { code: "620-IMP", name: "Inventory write-down and reversal", type: "expense", mpers: "Cost of sales", note: "The P&L movement on 330-900. MPERS 13.19 requires a reversal when the circumstances that caused the write-down no longer exist, so the account carries both directions." },
      { code: "620-ADJ", name: "Inventory movement and stock adjustments (periodic)", type: "expense", mpers: "Cost of sales", note: "The opening/closing stock movement that converts 610-PUR into cost of sales for a periodic-inventory client. Leave nil under a perpetual system." },
    ],
  },
  {
    key: "investments",
    title: "Investments and investment property (optional)",
    tier: "optional",
    blurb:
      "MPERS Section 16 requires investment property whose fair value is measurable reliably WITHOUT undue cost or effort to be carried at fair value through profit or loss; only where that test fails is the Section 17 cost model used. Use EITHER 230-FV1 with 530-IPG/900-IPL, OR 230-001 with 231-001 — never both for the same property.",
    accounts: [
      { code: "230-FV1", name: "Investment property — fair value", type: "asset", mpers: "Investment property", note: "The carrying amount under the MPERS 16.7 fair-value model. No depreciation is recognised against it." },
      { code: "230-001", name: "Investment property — cost", type: "asset", mpers: "Investment property", note: "COST MODEL ONLY, where fair value cannot be measured reliably without undue cost or effort." },
      { code: "231-001", name: "Accumulated depreciation — investment property", type: "asset", mpers: "Investment property", note: "COST MODEL ONLY. Under fair value through P&L there is no depreciation and this account must stay nil." },
      { code: "530-IPG", name: "Investment property — fair value gain", type: "income", mpers: "Other income", note: "MPERS 16.7 fair-value model. Not a realised gain, and not by itself a taxable amount." },
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
      "Seed ONLY for a client registered under the Sales Tax Act 2018 or the Service Tax Act 2018. Registration status, not activity, gates these. SST borne on purchases is a cost to registered and unregistered clients alike, so 900-SST stays in the standard set — and imported taxable services have their own module, because that obligation does not require registration.",
    accounts: [
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is generally accounted on a PAYMENT basis, subject to the deemed-payment and other timing rules. Carries the sst_output automation marker — see limitation 1.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable — registered manufacturer",
        type: "liability",
        mpers: "Trade and other payables",
        note: "The output tax of a registered manufacturer on its taxable sales, accounted on an ACCRUAL basis — a different regime from service tax. Sales tax on IMPORTS is levied and collected at importation and is not an output-tax liability of the importer; it is a cost of the imported goods. Seeded without the automation marker because the schema permits only one sst_output account per client.",
      },
    ],
  },
  {
    key: "imported-services",
    title: "Imported taxable services (optional)",
    tier: "optional",
    blurb:
      "A SEPARATE gate from ordinary SST registration: a business recipient of an imported taxable service may have to self-account for service tax even when it is not a registered service-tax person, filing on the non-registered return. Seed on the strength of the client's imported-service exposure, not its registration status.",
    accounts: [
      {
        code: "430-ITS",
        name: "Service tax payable — imported taxable services",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Self-accounting by the RECIPIENT — a different workflow, a different return and a different due-date discipline from ordinary output service tax. Keep the supplier invoice and the service classification with the entry.",
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
      { code: "900-W01", name: "Staff welfare — non-entertainment", type: "expense", mpers: "Employee benefits", note: "Keeps ordinary welfare out of the entertainment accounts, where the s.39(1)(l) rules would otherwise reach it. Staff meals, gifts and events that ARE entertainment belong in 900-E03." },
      { code: "900-W02", name: "Employee medical and dental benefits", type: "expense", mpers: "Employee benefits", note: "Needed for payroll/BIK analysis and for evidence. Carries no automatic conclusion." },
      { code: "900-W03", name: "Employee training and development", type: "expense", mpers: "Employee benefits", note: "Ordinary training is an expense. Any approved-programme or double-deduction claim needs its own approval evidence and schedule." },
      { code: "530-HRD", name: "HRD Corp grants and reimbursements", type: "income", mpers: "Other income", note: "A reimbursement of training cost, not revenue. Kept separate so claims reconcile to 900-W03 and to the levy in 900-H01." },
    ],
  },
  {
    key: "construction",
    title: "Construction and long-term contracts (optional)",
    tier: "optional",
    blurb:
      "MPERS Section 23 contract accounting as currently in force: the gross amount due from and to customers, built from contract costs incurred plus recognised profits less recognised losses and progress billings — presented gross, never offset contract by contract. Retention sums have their own recognition rules for tax (LHDN PR 5/2025). The MPERS (2025) third edition replaces this model for periods beginning on or after 1 January 2027.",
    accounts: [
      { code: "370-CON", name: "Gross amount due from customers on contracts", type: "asset", mpers: "Amounts due from contract customers" },
      { code: "370-RET", name: "Retention sums receivable", type: "asset", mpers: "Trade and other receivables", note: "Certified but withheld pending defects liability. Entitlement, not invoice date, drives recognition." },
      { code: "492-CON", name: "Gross amount due to customers on contracts", type: "liability", mpers: "Amounts due to contract customers" },
      { code: "492-RET", name: "Retention sums payable", type: "liability", mpers: "Trade and other payables", note: "Retained from a subcontractor. Never netted against 370-RET." },
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
      { code: "340-FWB", name: "Refundable security bond — foreign workers — current", type: "asset", mpers: "Trade and other receivables", note: "Where repatriation and recovery are expected within the MPERS 4.5 twelve-month window." },
      { code: "250-FWB", name: "Refundable security bond — foreign workers — non-current", type: "asset", mpers: "Other non-current assets", note: "Recoverable on repatriation — an asset until forfeited. Reclassify to 340-FWB when recovery moves inside the twelve-month window." },
    ],
  },
  {
    key: "zakat",
    title: "Zakat (optional)",
    tier: "optional",
    blurb:
      "For a company paying business zakat. A company's business zakat is dealt with as a deduction against aggregate income — it is not the individual-style rebate against tax payable, and it appears distinctly in the MBRS taxonomy. Eligibility, quantum and the receiving authority are all evidence questions.",
    accounts: [
      { code: "810-Z01", name: "Business zakat", type: "expense", mpers: "Contribution to zakat" },
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
 * Every block that cannot be seeded alongside `key`. Read in BOTH directions — a block's
 * own `conflictsWith` and any block naming it — so a one-sided declaration still refuses
 * rather than silently letting a uq_coa_special violation through. (Declarations are
 * test-pinned symmetric anyway; this is belt and braces on the safety-critical side.)
 */
export function conflictingBlockKeys(key: string): string[] {
  const declared = COA_TEMPLATE.find((b) => b.key === key)?.conflictsWith ?? [];
  const naming = COA_TEMPLATE.filter((b) => (b.conflictsWith ?? []).includes(key)).map((b) => b.key);
  return [...new Set([...declared, ...naming])].filter((k) => k !== key);
}

/**
 * KNOWN LIMITATIONS surfaced while building this template — recorded, not worked around.
 * All six are Wave-C/D candidates, not blockers:
 *
 * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
 *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
 *    thresholds, rates and — critically — different accounting bases (sales tax accrual,
 *    service tax payment), and imported taxable services is a third workflow on a third
 *    return. A dual registrant needs separately tagged control accounts, or every journal
 *    leg must carry an effective-dated sales/service treatment dimension. This template
 *    puts the marker on service tax (much the commoner case for SME service providers)
 *    and seeds the others as plain liabilities.
 *
 * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
 *    is correct for the operating-expense automation path, but SST attributable to
 *    inventory or PPE should be capitalised into the asset's cost and cannot be.
 *
 * 3. coa_accounts has no non-posting / header flag. Nothing in the DB prevents a journal
 *    from hitting both a summary account and its analysed children, or from hitting both
 *    610-100 and 610-PUR. Handled here by naming — "Revenue — unanalysed", "Cost of sales
 *    (perpetual)", "Purchases (periodic)" — and by the posting policy stated in each
 *    block's blurb, so a wrong balance reads as a finding rather than a presentation
 *    choice. A real guard needs either a posting flag or an application-level rule.
 *
 * 4. One static `mpers` string cannot serve both permitted P&L presentations. MPERS 5.11
 *    allows an analysis of expenses by NATURE or by FUNCTION, and SSM ships separate MBRS
 *    templates for each. The strings here name the by-function face line, with the
 *    by-nature tags (Employee benefits, Research and development) that a by-function
 *    presentation must still disclose. Accounts that legitimately move between functions
 *    — depreciation, amortisation, and the SST-on-purchases collector — carry that in
 *    their note, and the two known collectors are mapped to
 *    "Administrative expenses — must be reallocated". A per-client reporting-profile
 *    dimension is the real fix.
 *
 * 5. The field is called `mpers`, and the template now carries an entity shape MPERS does
 *    not reach. MPERS applies to a "private entity" — a private COMPANY under Companies
 *    Act 2016 s.2 — so for a sole proprietorship the string names the line its balance
 *    sheet carries, not a face line any standard mandates. Only the equity section
 *    actually diverges, and the two roll-ups added for it say "(no MPERS roll-up)" in
 *    their own text; everything below the equity line reads correctly for either shape.
 *    The real fix is a per-client reporting-FRAMEWORK dimension, which is the same
 *    data-model change limitation 4 already asks for, not a second one.
 *
 * 6. Mutual exclusion is declared on the block (`conflictsWith`) and enforced in two places
 *    in this app, neither of them the DB. toggleBlockKey() keeps the IN-SESSION selection
 *    consistent; specialMarkerConflicts() is a pre-apply read of the client's existing
 *    accounts that refuses BEFORE the first write when a different code already holds a
 *    marker the selection wants (the already-seeded client that switches entity shape).
 *    Still uncovered: a caller that bypasses both and posts a hand-assembled list straight
 *    at upsert_account. That meets the DB's uq_coa_special unique violation MID-APPLY, and
 *    three things about that failure need stating exactly, because two of them were
 *    overstated in this list until round 4:
 *      - It does NOT abort the run into a half-seeded chart. The apply loop catches
 *        per-account errors and continues, so every other account lands. The danger is the
 *        opposite of a truncated run: a chart that reads as complete while the accumulated-
 *        equity marker sits on an account named for the wrong entity shape, which is
 *        precisely what the opening-balance carry-down resolves by marker.
 *      - Retrying does NOT fix it. The exception aborts the whole upsert_account
 *        transaction, rolling back _reserve_op's reservation with it, so the deterministic
 *        coaSeedOpKey has nothing to replay: every retry re-runs the insert and re-raises
 *        the same violation for as long as the marker sits elsewhere. The marker must be
 *        cleared first — re-upsert THAT code with a null special_acc_type, which the
 *        on-conflict update writes through.
 *      - The refusal names the wrong account class. upsert_account maps EVERY
 *        unique_violation to "a rounding account already exists for this client" (0009), so
 *        a retained-earnings collision is reported as a rounding one. 0009 is deployed and
 *        is not editable here; recorded for a future migration in
 *        docs/plan/research/wave-b/coa-review-adjudications.md.
 *    The real guard is a DB-side seed verb taking the whole selection in one transaction.
 *
 * DELIBERATE OMISSION: no share-based-payment module (MPERS Section 26). Employee share
 * schemes are rare in the SME population this template serves, and the equity-reserve and
 * expense pair is better added per client than pre-seeded.
 */
