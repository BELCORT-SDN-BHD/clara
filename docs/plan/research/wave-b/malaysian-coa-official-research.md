# Malaysian CoA — official-source research (2026-07-24)

> Three web-enabled research lanes (opus xhigh) against MASB/MPERS, SSM/MBRS and LHDN/RMCD.
> Facts below were fetched from official pages, not recalled. Anything unverified is listed
> under UNVERIFIED and must not be encoded as fact.

## MASB / MPERS

### Authority

**What MPERS legally IS.** MPERS is a MASB Approved Accounting Standard issued under subsection 7(1) of the Financial Reporting Act 1997 (Act 558) and regulation 3 of the Financial Reporting (Publication of Approved Accounting Standards) Regulations 1999. It is given legal force over company accounts by Companies Act 2016 s.244(1)-(2): the approved accounting standards "shall apply to the financial statements of a company", and directors "shall ensure that the financial statements... are made out in accordance with the applicable approved accounting standards" — subject only to the s.244(3) true-and-fair override.

**What it MANDATES.** Only (a) minimum *line items* that must appear on the face of the primary statements (MPERS 4.2, 5.5, 5.6, 5.7); (b) a current/non-current split unless a liquidity presentation is more relevant (4.4-4.8); (c) certain sub-classifications shown either on the face or in the notes (4.11-4.14); (d) an expense analysis by nature OR by function, entity's choice (5.11); (e) a ban on "extraordinary items" (5.10). Plus, under CA 2016 s.249(4), the Registrar may require additional note disclosures (directors' remuneration, directors' retirement benefits, compensation for loss of office, loans/quasi-loans to directors, auditors' remuneration) "notwithstanding any relevant provisions of the applicable approved accounting standards".

**What it explicitly does NOT mandate.** MPERS 4.9 is decisive and is verbatim: "This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation..." and 4.9(b) expressly permits that "the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions". The string "chart of accounts" appears **zero times** in the full MPERS text (13,346 lines extracted) and **zero times** in the Companies Act 2016 (24,759 lines extracted). CA 2016 s.245 ("Accounts to be kept") is purely outcome-based — records must "sufficiently explain the transactions and financial position of the company" — it prescribes no account structure, coding, or numbering. CA 2016 carries no prescribed accounts-format schedule (its Ninth Schedule is "Powers of Judicial Manager", not a contents-of-accounts schedule as under the repealed CA 1965).

**Practical design consequence for a Sdn Bhd default CoA.** The chart of accounts is a free design choice. The binding constraint is *mappability*: every account must roll up cleanly to (i) the MPERS 4.2 / 5.5 face line items, (ii) the 4.11-4.12 sub-classification and share-capital disclosures, and (iii) — the real-world tightest constraint — the SSM Taxonomy (SSMxT) FS-MPERS entry point, since XBRL lodgement via MBRS 2.0 is now mandatory. Design the CoA to a *target mapping*, not to a legal template, because no legal template exists.

### Verified facts

- NO mandatory chart of accounts exists. The phrase 'chart of accounts' appears zero times in the full MPERS text and zero times in the Companies Act 2016 (Act 777, updated text to 1.8.2022) — both extracted in full and grep-verified. Neither prescribes account codes, numbering, or an account structure.
- MPERS 4.9 verbatim: 'This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation in the statement of financial position.' This paragraph is UNCHANGED in the IFRS for SMEs third edition markup, so it carries into MPERS (2025).
- MPERS 4.9(b) verbatim permits renaming and resequencing: 'the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions, to provide information that is relevant to an understanding of the entity's financial position.'
- CA 2016 s.244(1)-(2) verbatim: 'The approved accounting standards shall apply to the financial statements of a company...' and directors 'shall ensure that the financial statements of the company... are made out in accordance with the applicable approved accounting standards'. s.244(3) provides a true-and-fair override where compliance would not give a true and fair view.
- CA 2016 s.245(1) verbatim is outcome-based, not structural: directors shall 'cause to be kept the accounting and other records to sufficiently explain the transactions and financial position of the company and enable true and fair profit and loss accounts and balance sheets... to be prepared'. s.245(2): entries must be made within SIXTY DAYS of completion of the transaction. s.245(3): records retained SEVEN YEARS.
- CA 2016's Ninth Schedule is 'POWERS OF JUDICIAL MANAGER' [subsection 414(4)] — it is NOT a prescribed contents-of-accounts schedule. CA 2016 contains no prescribed financial-statement format schedule.
- VERSION STATUS — MPERS (2025) has been issued and supersedes MPERS (2016). Official MASB gazette notice dated 10 October 2025, signed Tan Sri Mohd Nasir Ahmad, Chairman: 'An entity shall apply MPERS (2025) for annual periods beginning on or after 1 January 2027. Earlier application is permitted.' Same notice: 'MPERS (2016) shall hereby be withdrawn for application for financial statements with annual periods beginning on or after 1 January 2027.'
- Therefore AS AT JULY 2026 the standard in force is MPERS (2016) (the February 2016 issue incorporating the 2015 Amendments, effective 1 January 2017). MPERS (2025) is issued but not yet mandatory; early adoption is permitted. A Sdn Bhd with a 31 Dec year end applies MPERS (2016) for FY2026 and MPERS (2025) from FY2027.
- MPERS (2025) IS the Malaysian adoption of the IFRS for SMEs third edition. MASB press release: the revised MPERS is 'based on the third edition of the IFRS for SMEs Accounting Standard issued by the IASB' and is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The IASB issued the third edition in February 2025.
- MPERS REMAINS the framework for private entities; the MFRS/MPERS split is intact. The 10 October 2025 MASB notice is structured under two separate headings: 'MASB APPROVED ACCOUNTING STANDARD FOR ENTITIES OTHER THAN PRIVATE ENTITIES — Malaysian Financial Reporting Standard (MFRS)' and 'MASB APPROVED ACCOUNTING STANDARD FOR PRIVATE ENTITIES — Malaysian Private Entities Reporting Standard (2025)'.
- MPERS is an OPTION, not a compulsion. MPERS 1.1 verbatim: 'Private entities (as defined in paragraph 1.2) have the option to apply in its entirety either: (a) the Malaysian Private Entities Reporting Standard (MPERS or this Standard); or (b) the Malaysian Financial Reporting Standards (MFRSs).' A Sdn Bhd may elect full MFRS instead.
- Private entity definition (MPERS 1.2 as amended by the Addendum, applied for annual periods ending on or after 31 January 2017): 'A private entity is a private company as defined in section 2 of the Companies Act 2016 that: (a) is not itself required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia; and (b) is not a subsidiary or associate of, or jointly controlled by, an entity which is required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia.' Plus a carve-out: a private company that is, or is a subsidiary/associate of, or jointly controlled by, a management company as defined in section 2 of the Interest Schemes Act 2016 is NOT a private entity.
- SECTION 4/5 ARE SUBSTANTIVELY UNCHANGED between MPERS (2016) and the third edition on which MPERS (2025) is based. Verified line-by-line against the IFRS Foundation's official 'Third Edition | With changes since the second edition marked up' PDF. The 4.2 list of items (a)-(r) is identical in composition; the 5.5 list (a)-(i) is identical in composition. This means a chart of accounts built to MPERS (2016) Section 4/5 will NOT need restructuring for MPERS (2025).
- The only Section 4 changes in the third edition: 4.2(e) adds '(including bearer plants in the scope of Section 17 Property, Plant and Equipment)'; 4.2(h) and 4.2(i) add 'in the scope of Section 34 Specialised Activities' to biological assets; 4.3 adds an explicit disaggregation instruction — 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals...'; and the 4.2 chapeau drops the words 'As a minimum,'.
- The only Section 5 changes in the third edition: 5.5(c) renames Section 15 from 'Investments in Joint Ventures' to 'Investments in Joint Arrangements'; 5.5(h) reads 'accounted for using the equity method' (was 'by the equity method'); 5.8 says errors/policy changes are adjusted in the period they are 'identified' (was 'arise'). Paragraph 5.11 on expense analysis by nature vs function is COMPLETELY UNCHANGED.
- EXPENSE ANALYSIS IS A FREE CHOICE (MPERS 5.11, unchanged in the third edition): 'An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.' MPERS imposes NO requirement to disclose the by-nature breakdown when the by-function method is used (this is a real divergence from MFRS 101/IAS 1, which requires that additional disclosure).
- The ONLY hard constraint under the by-function method (MPERS 5.11(b)): 'At a minimum, an entity discloses its cost of sales under this method separately from other expenses.'
- COMPANIES ACT 2016 — PAR VALUE ABOLISHED. s.74 verbatim: 'All shares issued before or upon the commencement of this Act shall have no par or nominal value.' Consequence for a CoA: there is no 'par value' or 'nominal value' equity account; share capital is a single undivided amount.
- COMMENCEMENT DATE CONFIRMED from the Act's own text: '[31 January 2017, P.U. (B) 50/2017; Division 8 of Part III—1 March 2018, P.U. (B) 106/2018; Section 241—15 March 2019, P.U. (B) 318/2019]'. Section 74 is not carved out, so it commenced 31 January 2017.
- SHARE PREMIUM ACCOUNT ABOLISHED — s.618(2) verbatim: 'Upon the commencement of section 74, any amount standing to the credit of a company's share premium account and capital redemption reserve shall become part of the company's share capital.' This was automatic and by operation of law on 31 January 2017 — no entry, election, or resolution was required.
- TRANSITIONAL WINDOW IS EXPIRED. s.618(3) and s.618(4) each allowed use of the share premium credit / capital redemption reserve credit only 'within twenty-four months upon the commencement of section 74'. Commencement was 31 January 2017, so the window closed on 30 January 2019 — more than seven years ago. For any Sdn Bhd being onboarded in 2026 the transition is fully historical: a live 'Share Premium' or 'Capital Redemption Reserve' account should NOT exist and, if found in a client's legacy ledger, is a migration defect to be swept into Share Capital.
- SSM Practice Note 1/2017 (issued 8 February 2017 by the Registrar of Companies under s.20C of the Companies Commission of Malaysia Act 2001) confirms the policy intent verbatim: 'The Companies Act 2016 abolishes the concept of nominal value in shares. Effectively, this policy will also render the share premium account and capital redemption reserves of a company to be no longer relevant. Instead the amount standing in the share premium account and the capital redemption reserves will be recognized as part of the company's share capital.'
- PN 1/2017 para 9(b) confirms the deadline was absolute: 'the right to use the credit standing in the share premium account must be exercised within 24 months after the commencement of the Companies Act 2016 irrespective of whether the decision to pay up any unissued shares as fully paid bonus shares is made before or after the commencement of the Companies Act 2016.'
- SHARE CAPITAL IS NOW LOCKED. s.618(2) share capital 'cannot be reduced without leave of Court' — i.e. reductions require the s.116 solvency-statement route or a court order. A CoA should treat Share Capital as a controlled/restricted account, not a freely-postable one.
- MPERS 4.12(a)(iii) still requires disclosure of 'par value per share or that the shares have no par value' — under CA 2016 a Malaysian Sdn Bhd discloses the latter. So the disclosure hook survives even though the account does not.
- THE REAL DE-FACTO LINE-ITEM CONSTRAINT IS SSM's MBRS XBRL TAXONOMY, not MPERS. Financial statements must be lodged with SSM in XBRL, tagged to the SSM Taxonomy (SSMxT). Per SSM's own MBRS 2.0 overview: the scopes are based on '1) Companies Act 2016; 2) Companies Act 1965; 3) Applicable approved accounting standards' with 'Private companies using the Malaysian Private Entities Reporting Standards in Malaysia (MPERS)'. The relevant entry points are 'FS – MPERS' (entry point 7) and 'KFI–MPERS' (entry point 18).
- MBRS 2.0 mandatory rollout was in three phases: Phase 1 from 1 December 2024 (unaudited FS and annual returns under CA 2016, plus EPC), Phase 2 from 1 March 2025 (audited FS under CA 1965 and previously-exempt financial institutions), Phase 3 from 1 June 2025 (audited FS of all companies under CA 2016). As at July 2026 all phases are live, so XBRL lodgement is fully mandatory for a Sdn Bhd.
- SSMxT is built on the IFRS Taxonomy 2022 as its base, and 'Given that MFRS and MPERS are largely based on IFRS, SSMxT has adopted the IFRS elements as the basis of its core elements', supplemented by SSM-created extensions 'necessary to support the Malaysian jurisdictional requirements'. Practical implication: the CoA should map to IFRS-taxonomy-shaped concepts, which aligns naturally with MPERS 4.2 / 5.5.
- SSMxT 2022 added a new statement to the MPERS entry points: 'New statement added in MPERS FS & KFI for "Statement of Retained earnings"' — consistent with MPERS Section 6, which permits a combined Statement of Income and Retained Earnings in place of separate SOCI and SOCE when the only equity movements are profit or loss, dividends, error corrections and policy changes.

### Line items / taxonomy / categories

- === MPERS SECTION 4, PARA 4.2 — STATEMENT OF FINANCIAL POSITION, MINIMUM FACE LINE ITEMS (verbatim, MPERS 2016 in force) ===
- 4.2 As a minimum, the statement of financial position shall include line items that present the following amounts:
- (a) cash and cash equivalents;
- (b) trade and other receivables;
- (c) financial assets (excluding amounts shown under (a), (b), (j) and (k));
- (d) inventories;
- (e) property, plant and equipment;
- (ea) investment property carried at cost less accumulated depreciation and impairment;
- (f) investment property carried at fair value through profit or loss;
- (g) intangible assets;
- (h) biological assets carried at cost less accumulated depreciation and impairment;
- (i) biological assets carried at fair value through profit or loss;
- (j) investments in associates;
- (k) investments in jointly controlled entities;
- (l) trade and other payables;
- (m) financial liabilities (excluding amounts shown under (l) and (p));
- (n) liabilities and assets for current tax;
- (o) deferred tax liabilities and deferred tax assets (these shall always be classified as non-current);
- (p) provisions;
- (q) non-controlling interest, presented within equity separately from the equity attributable to the owners of the parent; and
- (r) equity attributable to the owners of the parent.
- === MPERS (2025) / IFRS for SMEs 3rd ed VARIANTS OF 4.2 (effective 1 Jan 2027) ===
- 4.2 chapeau becomes: 'The statement of financial position shall include line items that present the following amounts:' (the words 'As a minimum,' are removed)
- (e) property, plant and equipment (including bearer plants in the scope of Section 17 Property, Plant and Equipment);
- (h) biological assets in the scope of Section 34 Specialised Activities carried at cost less accumulated depreciation and impairment;
- (i) biological assets in the scope of Section 34 carried at fair value through profit or loss;
- 4.3 becomes: 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals in the statement of financial position when such presentation is relevant to an understanding of the entity's financial position.'
- === MPERS 4.11 — SUB-CLASSIFICATIONS, FACE OR NOTES (verbatim) — THE PRACTICAL CoA DRIVER ===
- 4.11 An entity shall disclose, either in the statement of financial position or in the notes, the following subclassifications of the line items presented:
- (a) property, plant and equipment in classifications appropriate to the entity;
- (b) trade and other receivables showing separately amounts due from related parties, amounts due from other parties and receivables arising from accrued income not yet billed;
- (c) inventories, showing separately amounts of inventories: (i) held for sale in the ordinary course of business; (ii) in the process of production for such sale; and (iii) in the form of materials or supplies to be consumed in the production process or in the rendering of services.
- (d) trade and other payables, showing separately amounts payable to trade suppliers, payable to related parties, deferred income and accruals;
- (e) provisions for employee benefits and other provisions; and
- (f) classes of equity, such as paid-in capital, share premium, retained earnings and items of income and expense that, as required by this Standard, are recognised in other comprehensive income and presented separately in equity.
- === MPERS 4.12 — SHARE CAPITAL DISCLOSURES (verbatim) ===
- 4.12 An entity with share capital shall disclose the following, either in the statement of financial position or in the notes: (a) for each class of share capital: (i) the number of shares authorised. (ii) the number of shares issued and fully paid, and issued but not fully paid. (iii) par value per share or that the shares have no par value. (iv) a reconciliation of the number of shares outstanding at the beginning and at the end of the period. This reconciliation need not be presented for prior periods. (v) the rights, preferences and restrictions attaching to that class including restrictions on the distribution of dividends and the repayment of capital. (vi) shares in the entity held by the entity or by its subsidiaries or associates. (vii) shares reserved for issue under options and contracts for the sale of shares, including the terms and amounts. (b) a description of each reserve within equity.
- === MPERS 4.4-4.8 — CURRENT/NON-CURRENT (verbatim, unchanged in 3rd ed) ===
- 4.4 An entity shall present current and non-current assets, and current and non-current liabilities, as separate classifications in its statement of financial position in accordance with paragraphs 4.5-4.8, except when a presentation based on liquidity provides information that is reliable and more relevant. When that exception applies, all assets and liabilities shall be presented in order of approximate liquidity (ascending or descending).
- 4.5 An entity shall classify an asset as current when: (a) it expects to realise the asset, or intends to sell or consume it, in the entity's normal operating cycle; (b) it holds the asset primarily for the purpose of trading; (c) it expects to realise the asset within twelve months after the reporting date; or (d) the asset is cash or a cash equivalent, unless it is restricted from being exchanged or used to settle a liability for at least twelve months after the reporting date.
- 4.6 An entity shall classify all other assets as non-current. When the entity's normal operating cycle is not clearly identifiable, its duration is assumed to be twelve months.
- 4.7 An entity shall classify a liability as current when: (a) it expects to settle the liability in the entity's normal operating cycle; (b) it holds the liability primarily for the purpose of trading; (c) the liability is due to be settled within twelve months after the reporting date; or (d) the entity does not have an unconditional right to defer settlement of the liability for at least twelve months after reporting date.
- 4.8 An entity shall classify all other liabilities as non-current.
- === MPERS SECTION 5, PARA 5.5 — STATEMENT OF COMPREHENSIVE INCOME, MINIMUM FACE LINE ITEMS (verbatim) ===
- 5.5 As a minimum, an entity shall include, in the statement of comprehensive income, line items that present the following amounts for the period:
- (a) revenue.
- (b) finance costs.
- (c) share of the profit or loss of investments in associates (see Section 14 Investments in Associates) and jointly controlled entities (see Section 15 Investments in Joint Ventures) accounted for using the equity method.
- (d) tax expense excluding tax allocated to items (e), (g) and (h) (see paragraph 29.35).
- (e) a single amount comprising the total of: (i) the post-tax profit or loss of a discontinued operation; and (ii) the post-tax gain or loss attributable to an impairment, or reversal of an impairment, of the assets in the discontinued operation (see Section 27 Impairment of Assets), both at the time and subsequent to being classified as a discontinued operation and to the disposal of the net assets constituting the discontinued operation.
- (f) profit or loss (if an entity has no items of other comprehensive income, this line need not be presented).
- (g) each item of other comprehensive income (see paragraph 5.4(b)) classified by nature (excluding amounts in (h)). Such items shall be grouped into those that, in accordance with this Standard: (i) will not be reclassified subsequently to profit or loss—ie those in paragraph 5.4(b)(i)-(ii) and (iv); and (ii) will be reclassified subsequently to profit or loss when specific conditions are met—ie those in paragraph 5.4(b)(iii).
- (h) share of the other comprehensive income of associates and jointly controlled entities accounted for by the equity method.
- (i) total comprehensive income (if an entity has no items of other comprehensive income, it may use another term for this line such as profit or loss).
- === MPERS 5.6 — ALLOCATIONS (verbatim; only relevant where consolidated) ===
- 5.6 An entity shall disclose separately the following items in the statement of comprehensive income as allocations for the period: (a) profit or loss for the period attributable to (i) non-controlling interest; and (ii) owners of the parent. (b) total comprehensive income for the period attributable to (i) non-controlling interest; and (ii) owners of the parent.
- === MPERS 5.2 and 5.7 — ONE-STATEMENT vs TWO-STATEMENT CHOICE (verbatim) ===
- 5.2 An entity shall present its total comprehensive income for a period either: (a) in a single statement of comprehensive income, in which case the statement of comprehensive income presents all items of income and expense recognised in the period; or (b) in two statements—an income statement and a statement of comprehensive income—in which case the income statement presents all items of income and expense recognised in the period except those that are recognised in total comprehensive income outside of profit or loss as permitted or required by this Standard.
- 5.7 Under the two-statement approach, the income statement shall display, as a minimum, line items that present the amounts in paragraph 5.5(a)-5.5(f) for the period, with profit or loss as the last line. The statement of comprehensive income shall begin with profit or loss as its first line and shall display, as a minimum, line items that present the amounts in paragraph 5.5(g)-5.5(i) and paragraph 5.6 for the period.
- === MPERS 5.4(b) — THE ONLY FOUR ITEMS OF OTHER COMPREHENSIVE INCOME (verbatim) — a closed list, so OCI accounts in a CoA are bounded ===
- (i) some gains and losses arising on translating the financial statements of a foreign operation (see Section 30 Foreign Currency Translation); (ii) some actuarial gains and losses (see Section 28 Employee Benefits); (iii) some changes in fair values of hedging instruments (see Section 12 Other Financial Instrument Issues); and (iv) changes in the revaluation surplus for property, plant and equipment measured in accordance with the revaluation model (see Section 17 Property, Plant and Equipment).
- === MPERS 5.11 — ANALYSIS OF EXPENSES: BY NATURE vs BY FUNCTION (verbatim, unchanged in 3rd ed) ===
- 5.11 An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.
- Analysis by nature of expense — (a) Under this method of classification, expenses are aggregated in the statement of comprehensive income according to their nature (for example, depreciation, purchases of materials, transport costs, employee benefits and advertising costs) and are not reallocated among various functions within the entity.
- Analysis by function of expense — (b) Under this method of classification, expenses are aggregated according to their function as part of cost of sales or, for example, the costs of distribution or administrative activities. At a minimum, an entity discloses its cost of sales under this method separately from other expenses.
- === MPERS 5.9 and 5.10 (verbatim) ===
- 5.9 An entity shall present additional line items, headings and subtotals in the statement of comprehensive income (and in the income statement, if presented), when such presentation is relevant to an understanding of the entity's financial performance.
- 5.10 An entity shall not present or describe any items of income and expense as 'extraordinary items' in the statement of comprehensive income (or in the income statement, if presented) or in the notes.
- === CA 2016 s.249(4) — REGISTRAR-MANDATED NOTE DISCLOSURES (verbatim) — these need dedicated CoA accounts or tags ===
- (a) the directors' remuneration; (b) the directors' retirement benefits; (c) compensation to directors for loss of office; (d) loans, quasi-loans and other dealings in favour of directors; (e) the total of the amount paid to or receivable by the auditors as remuneration for their services as auditors, inclusive of all fees, percentages or other payments or consideration given by or from the company or by or from any subsidiary of the company.
- === EQUITY SECTION FOR A POST-2017 Sdn Bhd (derived from CA 2016 s.74/s.618 + MPERS 4.11(f)) ===
- Share Capital — single undivided amount, no par value, absorbed any pre-2017 share premium and capital redemption reserve by operation of law on 31 January 2017; cannot be reduced without leave of Court or the s.116 solvency route
- Retained Earnings / Accumulated Losses
- Revaluation Surplus (only if the PPE revaluation model under Section 17 is elected)
- Foreign Currency Translation Reserve (only if there is a foreign operation under Section 30)
- Hedging Reserve (only if hedge accounting under Section 12 is applied)
- Non-controlling Interests (consolidated accounts only)
- DO NOT CREATE: 'Share Premium' — abolished 31 January 2017, transitional use window expired 30 January 2019
- DO NOT CREATE: 'Capital Redemption Reserve' — abolished 31 January 2017, same expired window
- DO NOT CREATE: 'Authorised Share Capital' — the concept of authorised capital is abolished under CA 2016

### UNVERIFIED — do not encode

- I could NOT read the MPERS (2025) standard text itself. masb.org.my gates every standard PDF behind a click-through/session check (pdf.php redirects to access.php; direct pdf_file paths return an HTML meta-refresh), and MPERS (2025) printed copies are stated to be 'available for sale'. My Section 4/5 statements about MPERS (2025) are therefore an INFERENCE from the IFRS Foundation's official third-edition markup PDF, resting on MASB's own published statement that the revised MPERS is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The inference is strong but is not a direct reading of MPERS (2025). Buy/obtain MPERS (2025) before treating its Section 4/5 wording as final.
- The verbatim MPERS (2016) Section 4/5 text I quoted was extracted from a mirrored copy of the MASB-branded PDF (title page: 'Malaysian Private Entities Reporting Standard (MPERS)', '© Malaysian Accounting Standards Board (February 2016)', 'This document incorporates 2015 Amendments... effective 1 January 2017'), not from masb.org.my directly, because of the gate above. INTEGRITY CHECK PERFORMED: I compared it clause-by-clause against the IFRS Foundation's official third-edition markup PDF, which reproduces the second-edition text with deletions struck through — the second-edition baseline matches the mirror exactly, including the unusual '(ea)' sub-item. I am confident the text is authentic, but it is worth one confirmation against a purchased/official MASB copy before it is hard-coded as LAW in the product.
- The exact strike-through/underline direction in the 4.2 chapeau ('As a minimum, the The statement of financial position shall include...') was inferred from context, because pdftotext discards the markup formatting. My reading is that 'As a minimum, the' is DELETED and 'The' is INSERTED — which is corroborated by the new disaggregation instruction added to 4.3. But I cannot rule out the opposite direction from the text extraction alone. Note this change is presentational only; it does not alter the (a)-(r) list.
- Whether SSM has updated or will update the SSMxT / MBRS taxonomy for MPERS (2025) ahead of the 1 January 2027 effective date. The taxonomy documents I read are the SSMxT 2022 generation (built on IFRS Taxonomy 2022 and the then-current MPERS). If the product's chart of accounts is designed to map to MBRS, that mapping will likely need a refresh when SSM issues an MPERS-(2025)-aligned taxonomy. I found no announcement either way.
- The precise SSMxT element counts. The consultation document's summary table extracted in a garbled layout; my reading is that the FS-MPERS taxonomy has roughly 1,543 elements (about 564 drawn from the IFRS for SMEs 2022 taxonomy plus about 979 SSM extensions) versus roughly 2,047 for FS-MFRS. Treat these as order-of-magnitude only — the column alignment was ambiguous.
- I did not obtain the actual SSMxT FS-MPERS element list (the concrete tag names for each statement-of-financial-position and income-statement concept). It is embedded in SSM's mTool preparation software rather than published as a plain list on the website. This is the single highest-value remaining artefact for building a mappable default chart of accounts — recommend extracting it from mTool 2.1 directly.
- Several corroborating secondary sources returned HTTP 403 to automated fetching and could not be read: the PwC Malaysia MPERS alert (alert124-mpers.pdf), the MIA Accountants Today article on the third edition (at-mia.my), the Crowe Malaysia MBRS 2.0 insight, and the MIA MPERS FAQs PDF (mia.org.my). None of my verified facts depend on them — every load-bearing fact above came from MASB, SSM, the Companies Act text, or the IFRS Foundation.
- I did not investigate LHDN/tax-side line-item requirements (Form C categories, the tax computation's disallowable-expense breakdown) or MyInvois e-Invoice classification codes. These are separate regimes from MPERS and may impose their own de-facto account granularity on a Malaysian SME chart of accounts — they were outside this task's scope but are worth a follow-up before finalising the CoA.
- MPERS Section 6's combined 'Statement of Income and Retained Earnings' option: I verified from the MASB comparative article and Section 6's scope paragraph that the option exists when the only equity movements are profit or loss, dividends, error corrections and accounting-policy changes, and I verified SSMxT 2022 added a 'Statement of Retained earnings' to the MPERS entry points. I did NOT read Section 6's full conditions verbatim, so treat the precise eligibility conditions as unconfirmed.

### Sources

- https://www.masb.org.my/pages.php?id=20
- https://www.masb.org.my/pages.php?id=615
- https://www.masb.org.my/press_list.php?id=489
- https://www.masb.org.my/press_list.php?id=490
- https://www.masb.org.my/pdf_file/2025Oct10_Notice%20ENG_CLEAN.pdf
- https://www.masb.org.my/pdf/MPERS%20article_A%20Comparative%20Analysis%20of%20PERS%20MPERS%20and%20MFRS%20Frameworks_old.pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf
- https://www.ssm.com.my/Pages/Legal_Framework/PDF%20Tab%202/pn1-2017_r1.pdf
- https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
- https://ssm.com.my/Pages/Services/Other-Services/MBRS-document/Consultation-2022-SSM-Taxonomy-Templates-Stakeholders.pdf
- https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2025/ifrs-for-smes-standard-markup.pdf
- https://www.bdo.my/en-gb/insights/featured-insights/malaysian-business-reporting-system-(mbrs)-2-0
- https://c0aa0d68-de31-44c8-bb40-ac5f2e0a9fe4.filesusr.com/ugd/a87018_5b13be37ec354e388901ef7342d8f641.pdf?index=true

## SSM / MBRS (XBRL filing)

### Authority

**What MBRS legally mandates**

MBRS is the XBRL lodgement channel of Suruhanjaya Syarikat Malaysia (SSM / Companies Commission of Malaysia). Its legal hook is the Companies Act 2016 (CA 2016) lodgement duties, not a separate accounting law:

- CA 2016 s.259(1)(a) (verified verbatim from the Act on ssm.com.my): "A company shall lodge with the Registrar for each financial year the financial statements and reports required under this Act — (a) in the case of a private company, within thirty days from the financial statements and reports are circulated to its members under section 258". MBRS is the *format and channel* for discharging that duty.
- CA 2016 s.260(1)-(2): an **exempt private company MAY lodge a certificate of EPC status in lieu of s.259(1)(a)** — signed by a director, auditor and secretary — instead of lodging financial statements at all.
- Mandatory XBRL: SSM's live MBRS page (fetched 2026-07-24) carries the announcement "PELAKSANAAN SERAH SIMPAN MANDATORI BERPERINGKAT MELALUI SISTEM MBRS 2.0" (phased mandatory lodgement via MBRS 2.0), dated 27/11/2024, followed by FAQ announcements dated 1/3/2025 ("MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025") and 20/5/2025 ("IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025"). As of today (July 2026) all three phases are past, so full-set FS in XBRL via MBRS 2.0 is the live mandatory route.
- Applicability (SSM FAQ §1.5, verbatim): "Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS)." Under MBRS 2.0, companies regulated by Bank Negara Malaysia and FS prepared under CA 1965 — previously exempted — are **now** required to submit via MBRS.
- The taxonomy is binding as a *reporting vocabulary*: "Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document" — the preparer must instead use text-block tagging for extra detail.
- The Business Rules workbook (SSM-published, `Business_Rule_MBRS_v2_SSMxT_2022.xlsx`) is enforced in mTool as hard validations with severity Error/Warning. Failing an Error rule blocks generation of the XBRL instance.

**What MBRS does NOT mandate — this is the key negative finding**

- **SSM does NOT publish or prescribe a chart of accounts.** Searched the entire official document set — SSMxT_2022 Architecture Document (111 pp), MBRS FAQ v2.4 (54 pp), mTool 2.2 FS-CA2016 User Manual (105 pp), the SSM MBRS 2.0 overview deck, the live MBRS page, and all 1,633 filenames in the SSMxT_2022v1.0 taxonomy package — for "chart of accounts", "carta akaun", "ledger", "general ledger", "account code", "kod akaun": **zero hits**. There is no CoA artefact of any kind.
- What SSM prescribes is a **presentation/reporting taxonomy**: "SSM XBRL Taxonomy (SSMxT) is a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool (mTool)." The architecture document also states plainly: "The taxonomy is not intended to be an exhaustive representation of the requirements under the accounting standards and legislation."
- The bridge from a firm's own ledger to SSM's elements is explicitly the preparer's mapping job, not a prescribed structure. SSM FAQ §1.7 "Mapping Principles" (verbatim): "In preparing the XBRL file for financial statements, preparers will need to do mapping by the matching information within the financial statements (e.g. the amount of fixed assets) to a relevant concept within the Taxonomy (e.g. Property, Plant and Equipment)."
- Practical consequence for a ledger design: SSMxT constrains **what must be reportable at FS-presentation level**, and the Business Rules define a hard minimum set of elements that MUST carry a value. A firm is free to design any CoA it likes, provided the ledger can roll up to those elements. That is a constraint on the *aggregation targets*, not on account codes.
- MBRS also does not mandate the accounting standard — that is MASB's MFRS/MPERS. SSM only routes the filing to the matching entry point (FS-MFRS vs FS-MPERS).
- Audit exemption is a separate SSM instrument (Practice Directive 10/2024), not an MBRS rule. It changes whether the FS are audited, not the XBRL breakdown required.

### Verified facts

- MBRS = Malaysian Business Reporting System, SSM's submission platform based on XBRL. It accepts: Annual Return (AR); Financial Statements and Key Financial Indicators (FS/KFI); Exemption Applications (EA) related to FS/KFI and AR; Annual Return per Companies Act 1965 (AR1965); and Financial Statements per Companies Act 1965. (SSM FAQ v2.4 §1.1, and the live SSM MBRS page.)
- MBRS has exactly three components: (a) SSM Taxonomy (SSMxT) — 'a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool'; (b) MBRS Preparation Tool (mTool) — an Excel-based, form/template-driven preparer app with inbuilt SSMxT browser and data validation; (c) MBRS Portal (mPortal) — the submission platform. (SSM FAQ v2.4 §1.2.)
- CURRENT RELEASE as of the live SSM MBRS page fetched 2026-07-24: MBRS 2.0. Preparation tool = mTool 2.2 (32-bit and 64-bit installers, plus a 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook). Latest taxonomy published = SSM Taxonomy (SSMxT) 2022, file SSMxT_2022v1.0.zip; SSMxT 2017 v1.0 and SSMxT 2014 (ssmt_20131231) are also listed as legacy. Supporting artefacts published: SSMxT Architecture 2022 (PDF) and 'SSM Business Rule MBRS 2.0 SSMxT 2022' (Excel).
- The taxonomy release date embedded throughout SSMxT_2022v1.0 is 2022-12-31; namespaces are under http://xbrl.ssm.com.my/taxonomy/2022-12-31/.
- SSMxT_2022v1.0 is based on the IFRS Accounting Taxonomy 2022 issued by the IFRS Foundation; it adopts 6,458 IFRS elements as its core, plus Malaysian jurisdictional extensions. MPERS filings sit on the IFRS for SMEs 2022 base (prefix `ifrs-smes`) plus SSM's own `ssmt-mpers` extensions.
- Mandatory implementation timeline as published in the Announcements table on the live SSM MBRS page: 27/11/2024 — notice of phased mandatory lodgement via MBRS 2.0; 1/3/2025 — FAQ 'MBRS 2.0 MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025'; 20/5/2025 — FAQ 'IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025'. No announcement newer than 20/5/2025 appears on the page as of 2026-07-24.
- Who is in scope (SSM FAQ §1.5, verbatim): 'Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS).' MBRS 2.0 additionally brought in companies regulated by Bank Negara Malaysia and FS prepared under CA 1965, both previously exempted from MBRS.
- SSMxT scope split (Architecture §1.4): 1) MFRS Taxonomy — for public/private companies and their subsidiaries, associates or JCEs required to prepare/lodge FS using MFRS; 2) MPERS Taxonomy — for financial statements of PRIVATE companies required to prepare or lodge FS using MPERS; 3) Exemption Application Taxonomy; 4) Annual Return Taxonomy.
- MFRS and MPERS each split into TWO access points: (a) Financial Statements (FS) — 'a taxonomy containing all statements for reporting under respective accounting standards'; (b) Key Financial Indicators (KFI) — 'a taxonomy listing basic financial concepts available for financial reporting IF THE FILER OPTS NOT TO FILE FULL FS FILING IN XBRL'. KFI is only permitted once SSM approves an EA2 application (exemption from filing FS in full XBRL format, CA 2016 s.604(2)).
- Applicable statements for a FULL financial statements filing (Architecture Table 1 and FAQ §1.6, minimum requirement list): Statement of Financial Position (Current/Non-current OR Order of liquidity presentation); Statement of Profit or Loss (Function of expenses OR Nature of expenses); Statement of Cash Flows (Direct OR Indirect); Statement of Changes in Equity; Statement of Retained Earnings; Notes to accounts. Non-financial under CA 2016: Director's report; Statement of directors; Directors' business review; Auditors report to members. Plus 'Involvement in Stock Exchange' for Bursa-listed companies.
- Reporting-concept counts (Architecture Table 3): FS under CA 2016 / MPERS = 1,211 concepts from IFRS for SMEs 2022 + 1,164 SSM concepts = 2,375 total. FS under CA 2016 / MFRS = 5,247 IFRS + 950 SSM = 6,197. Reports under FS (CA 2016) = 158. Document & Entity information CA 2016 = 39.
- COMPANY EXTENSIONS ARE PROHIBITED (Architecture §1.8, verbatim): 'Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document, instead, the preparer needs to provide the necessary level of detail by text-block tagging the information using appropriate [text block] concepts.'
- ELR sort-code scheme for the Financial Statements taxonomy (Architecture §4.2.4.6): 01xxxx = Filing information; 02xxxx = Scope of filing; 1xxxxx = Companies Act 2016 disclosures; 2xxxxx = Statement of financial position; 3xxxxx = Statement of profit or loss; 4xxxxx = Statement of comprehensive income; 5xxxxx = Statement of cash flows; 6xxxxx = Statement of Changes in Equity / Statement of Retained Earnings; 7xxxxx = List of notes and other disclosures. [990000] = Axis - Defaults.
- The FS-MPERS entry point is ssmt-fs-mpers_2022-12-31_entry_point.xsd at http://xbrl.ssm.com.my/taxonomy/2022-12-31/rep/ssm/ca-2016/fs/mpers/. Its rol_ schema declares exactly these financial-statement ELRs (read directly from the downloaded taxonomy): [020000] Scope of filing; [120000] Disclosure - Directors report; [120100] Disclosure - Statement by directors; [120200] Disclosure - Director business review; [130000] Disclosure - Auditors report to members; [200100] Statement of financial position; [200100a] ...details; [200200] Sub-classification of assets, liabilities and equity; [210000] Statement of financial position, by current/non-current method; [210100] Sub-classification ... by current/non-current method; [220000] Statement of financial position, by order of liquidity method; [220100] Sub-classification ... by order of liquidity method; [300100] Statement of income and expenditure, Profit (loss); [300100a] ...Gross profit; [300100b] ...Operating profit; [300100c] ...Profit (loss) attributable to; [300200] Analysis of Income and Expense; [300200a] ...Employee benefit expense; [300200b] ...Other expenses by function; [300200c] ...Other expenses by nature; [310000] Statement of profit or loss, by function of expense; [310100] Analysis of profit or loss, by function of expense; [320000] Statement of profit or loss, by nature of expense; [320100] Analysis of profit or loss, by nature of expense; [400100]/[400100a] Statement of Comprehensive Income; [410000] SCI - Net of tax; [420000] SCI - Before tax; [500100] Statement of cash flows; [510000] direct method; [520000] indirect method; [610000] Statement of Changes in Equity; [620000] Statement of Retained Earnings; [710000] Notes - Corporate information; [720000] Notes - Summary of significant accounting policies; [730000] Notes - List of notes; [740000] Notes - Issued capital; [750000] Notes - Related party transactions; [990000] Axis - Defaults.
- Note that FS-MPERS has only FIVE note ELRs ([710000] Corporate information, [720000] Summary of significant accounting policies, [730000] List of notes, [740000] Issued capital, [750000] Related party transactions). All other note detail is carried by text-block concepts, not by structured elements.
- Which presentation variant renders is driven by four 'Scope of filing' switches that act as table-layout filters (Architecture §2.10.7.1): ssmt_MethodUsedForPreparingStatementOfFinancialPosition, ssmt_MethodUsedForPreparingStatementOfProfitOrLoss, ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome, ssmt_MethodUsedForPreparingStatementOfCashFlows. There is also ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity.
- Every FS statement is dimensioned by ifrs-smes_ConsolidatedAndSeparateFinancialStatementsAxis with members ifrs-smes_ConsolidatedMember (label 'Group [member]') and ifrs-smes_SeparateMember (label 'Company [member]').
- MINIMUM BREAKDOWN — hard validation, FS-MPERS Statement of Financial Position. Business rule IDs SOFP-Mandatory-fs-mpers-01 / 01A / 01B / 01C (scenario: Current-Noncurrent, Consolidated/Separate, current/previous year) and -02/02A/02B/02C (scenario: Order of liquidity). Severity = Error. Message: 'Property, plant and equipment, Investment properties, Intangible assets, Investments in associates, Investments in joint ventures, Inventories, Trade and other non-current receivables, Trade and other current receivables, Total assets, Issued capital, Total equity, Retained earnings, Reserves, Total equity attributable to owners, Employee benefits, Provisions, Trade and other non-current payables, Trade and other current payables, Total current liabilities, Total liabilities, Total equity and liabilities, Loans and borrowings, Employee benefits, Provisions, Investments in subsidiaries, Other non-current assets, Other current assets, Equity - other components, Cash and cash equivalents, Loans and borrowings -> MUST be reported'.
- MINIMUM BREAKDOWN — hard validation, FS-MPERS Statement of Profit or Loss. Business rule IDs SOPL-Mandatory-fs-mpers-01/01A/01B/01C (Function of expense) and -02/02A/02B/02C (Nature of expense), current and previous year, Consolidated and Separate. Severity = Error. Message: 'Revenue, Cost of sales, Other income, Other expenses, Finance income, Finance costs, Profit (loss) before tax, Profit (loss) from continuing operations net, Profit (loss) -> MUST be reported'.
- Additional FS-MPERS P&L rules: SOPL-Mandatory-fs-mpers-03 — if 'Disclosure of financial statements audit status' is 'audited' then "Total auditor's remuneration" MUST be reported. SOPL-Mandatory-fs-mpers-04 — if the filer selects 'Group' then profit and comprehensive income attributable to owners of parent AND to non-controlling interests MUST be reported.
- Balance-check rule: Mandatory-fs-mpers-109, severity Error — 'Assets should be equal to Equity and Liabilities'.
- Rule volume per statement for FS-MPERS (counted from the SSM Business Rules workbook, sheet 'FS-MPERS - CA2016', 176 rules total): Filing Information 32, Scope of filing 27, Directors report 20, Statement by directors 18, Issued capital 13, Statement of Changes in Equity 12, Statement of profit or loss 10, Auditors report to members 9, Statement of financial position 9, Statement of cash flows 9, Related party transactions 5, Statement of Retained Earnings 5, Corporate information 4, Director business review 2, Summary of significant accounting policies 1.
- Mandatory scope-of-filing facts for FS-MPERS (Error severity): Date of financial statements approved by Board of Directors; Date of circulation of FS and reports to members; Date of Statutory Declaration; MSIC Code; Description of business. Mandatory filing-information facts include: New company registration number; Name of company; Origin of company; Status of company; Type of company; current financial year start and end dates; Disclosure of FS audit status; Status of carrying on business during the financial year; Basis of accounting standards applied; Type of submission; Nature of financial statements; Level of rounding used; Description of presentation currency; Name and version of software used to generate the XBRL file; Taxonomy version; Application of submission.
- Audit-exemption interaction, encoded as a business rule (Mandatory-dei-fs-mpers-22/23): if Status of company = 'Private company' and audit status = 'Unaudited', then 'Description of audit exemption category' MUST be reported, and must be one of 'Zero-revenue company', 'Threshold-Qualified company', or 'Dormant company'.
- FS ENTRY POINTS under CA 2016 (SSM FAQ §1.3 and MBRS Summary Sheet): FS-MFRS, FS-MPERS, FS-CLBG (Company Limited by Guarantee), FS-FC (Foreign Company, only after EA3 approval), FS-EPC (Exempt Private Companies), FS-BNM (BNM-regulated). CA 1965 adds FS-BNM-1965, FS-CLBS-1965, FS-CLBG-1965, FS-EPC-1965, FS-FC-1965. KFI entry points: KFI-MFRS, KFI-MPERS, KFI-CLBG, KFI-FC — all gated on EA2 approval.
- EXEMPT PRIVATE COMPANIES — this is the real 'small private company' answer. CA 2016 s.260(1) (verbatim from the Act PDF hosted on ssm.com.my): 'An exempt private company may lodge with the Registrar for each financial year a certificate relating to its status as an exempt private company in lieu of the requirements in paragraph 259(1)(a) within thirty days from the circulation of the financial statements and reports are circulated under section 258.' s.260(2): the certificate is signed by a director, auditor and secretary confirming (a) the company is and has at all relevant times been an exempt private company; (b) duly audited FS and reports have been circulated to members; (c) as at the FS date the company appeared able to meet its liabilities as they fall due.
- Confirmed structurally in the taxonomy: the FS-EPC entry point (ssmt-fs-epc_2022-12-31) contains NO financial statements at all. Its only ELRs are [020000] Scope of filing, [110000] Disclosure - Auditors statement, [120000] Disclosure - Certificate of Exempt Private Company, [990000] Axis - Defaults. There is no Statement of Financial Position, no Statement of Profit or Loss, no cash flows, no equity statement in FS-EPC.
- KFI-MPERS (the reduced filing available only after EA2 approval) has these ELRs: [020000] Scope of filing, [110000] Directors Report, [110100] Statement by directors, [110200] Director business review, [120000] Auditors report to members, [210000] SOFP by current/non-current, [220000] SOFP by order of liquidity, [310000] Statement of Profit or Loss, [410000] Statement of Cash Flows, [420000] Statement of Changes in Equity, [430000] Statement of Retained Earnings, [510000] Notes, [990000] Axis - Defaults.
- Audit exemption for private companies (separate instrument, verified from the PD PDF on ssm.com.my): Practice Directive No. 10/2024 dated 16 December 2024, issued under s.20C CCM Act 2001 and s.267(2) CA 2016. A private company qualifies if it meets at least TWO of: (a) annual revenue in the current FY and the immediate past two FYs does not exceed RM3,000,000; (b) total assets in the current SOFP and the immediate past two FYs do not exceed RM3,000,000; (c) employees at end of the current FY and the immediate past two FYs do not exceed 30. Thresholds are phased over three years: Phase 1 (FY commencing 1 Jan 2025 to 31 Dec 2025; submission year from 1 Jan 2026) = RM1,000,000 turnover / RM1,000,000 assets / 10 employees. Phase 2 (FY commencing on or after 1 Jan 2026 to 31 Dec 2026; submission year from 1 Jan 2027) = RM2,000,000 / RM2,000,000 / 20 employees. Phase 3 (FY commencing on or after 1 Jan 2027; submission year from 1 Jan 2028) = RM3,000,000 / RM3,000,000 / 30 employees.
- MBRS was in live production use for MPERS filings during 2025: SSM's own Annual Dialogue 2025 issues paper records stakeholder complaints about system slowness 'especially in filing MBRS FS-MPERS, FS MFRS' during the Extension-of-Time peak period, and confirms auto-registration was introduced for Penyata Tahunan (AR) and Penyata Kewangan (FS) via MBRS.
- Element-naming law in SSMxT (Architecture §4.2.5): element id = 'prefix_ElementName' (e.g. ssmt-mpers_BuildingOnFreeholdLand); names follow Label Camel Case Concatenation; abstract organising concepts end in 'Abstract' or 'LineItems'; text blocks end in 'Explanatory'; dimensions end in 'Axis'; hypercubes end in 'Table'; domain members end in 'Member'.
- iXBRL is supported: 'Inline XBRL (iXBRL) can be used to provide filings based on the SSM Taxonomy files' — and iXBRL reduces the need for company extensions because untagged human-readable content can ride along in the instance.
- mTool is Windows/Excel only — no macOS, no OpenOffice. Supported Microsoft Office versions: 2010, 2013, 2016, 2019, 2021 and 365. This matters for any automation design.
- Lodger/Maker split under MBRS 2.0: a Lodger (Company Secretary, Company Agent, Liquidator, Official Receiver, Other Role) must hold an ACTIVE Practising Certificate under s.241 CA 2016 and must purchase a PKI Digital Certificate via Pos Digicert; a Maker (the corresponding assistant role) prepares and uploads the XBRL file but cannot lodge.

### Line items / taxonomy / categories

- === FS-MPERS [210000] STATEMENT OF FINANCIAL POSITION, BY CURRENT/NON-CURRENT METHOD — full presentation tree, read directly from pre_ssmt-fs-mpers_2022-12-31_role-210000.xml ===
- ssmt_StatementOfFinancialPositionLineItems | Statement of financial position [line items]
- NON-CURRENT ASSETS (ifrs-smes_NoncurrentAssetsAbstract):
- ifrs-smes_PropertyPlantAndEquipment | Total property, plant and equipment
- ifrs-smes_InvestmentProperty | Investment properties
- ssmt-mpers_NoncurrentBiologicalAssets | Biological assets
- ifrs-smes_IntangibleAssetsAndGoodwill | Intangible assets
- ssmt-mpers_InvestmentInSubisidiaries | Investments in subsidiaries
- ifrs-smes_InvestmentsInAssociates | Total investments in associates
- ifrs-smes_InvestmentsInJointVentures | Total of investments in joint ventures
- ssmt-mpers_NoncurrentInvestmentsOtherThanInvestmentsAccountedForUsingEquityMethod | Other investments
- ifrs-smes_NoncurrentReceivables | Total trade and other non-current receivables
- ifrs-smes_DeferredTaxAssets | Deferred tax assets
- ssmt-mpers_OtherNoncurrentAssets | Other non-current assets
- ifrs-smes_NoncurrentAssets | Total non-current assets
- CURRENT ASSETS (ifrs-smes_CurrentAssetsAbstract):
- ifrs-smes_InventoriesTotal | Total inventories
- ssmt-mpers_CurrentBiologicalAssets | Biological assets
- ssmt-mpers_CurrentInvestments | Other investments
- ifrs-smes_TradeAndOtherCurrentReceivables | Total trade and other current receivables
- ifrs-smes_CurrentTaxAssetsCurrent | Current tax assets
- ssmt-mpers_CurrentDerivativeFinancialAssets | Derivative financial assets
- ssmt_CashAndBankBalances | Cash and cash equivalents
- ssmt-mpers_OtherCurrentAssets | Other current assets
- ifrs-smes_CurrentAssets | Total current assets
- ifrs-smes_Assets | Total assets
- EQUITY (ifrs-smes_EquityAbstract):
- ifrs-smes_IssuedCapital | Total issued capital
- ifrs-smes_RetainedEarnings | Retained earnings
- ifrs-smes_TreasuryShares | Treasury shares
- ifrs-smes_OtherReserves | Reserves
- ifrs-smes_EquityAttributableToOwnersOfParent | Total equity attributable to owners
- ssmt-mpers_OtherComponentsOfEquity | Equity - other components
- ifrs-smes_NoncontrollingInterests | Non-controlling interests
- ifrs-smes_Equity | Total equity
- NON-CURRENT LIABILITIES (ifrs-smes_NoncurrentLiabilitiesAbstract):
- ssmt-mpers_NoncurrentBorrowings | Loans and borrowings
- ifrs-smes_NoncurrentProvisionsForEmployeeBenefits | Employee benefits
- ifrs-smes_NoncurrentProvisions | Provisions
- ifrs-smes_DeferredTaxLiabilities | Deferred tax liabilities
- ifrs-smes_NoncurrentPayables | Total trade and other non-current payables
- ssmt-mpers_OtherNoncurrentLiabilities | Other non-current liabilities
- ifrs-smes_NoncurrentLiabilities | Total non-current liabilities
- CURRENT LIABILITIES (ifrs-smes_CurrentLiabilitiesAbstract):
- ifrs-smes_ShorttermBorrowings | Loans and borrowings
- ifrs-smes_CurrentProvisionsForEmployeeBenefits | Employee benefits
- ifrs-smes_CurrentProvisions | Provisions
- ifrs-smes_TradeAndOtherCurrentPayables | Total trade and other current payables
- ifrs-smes_CurrentTaxLiabilitiesCurrent | Current tax liabilities
- ssmt-mpers_CurrentDerivativeFinancialLiabilities | Derivative financial liabilities
- ssmt-mpers_OtherCurrentLiabilities | Other current liabilities
- ifrs-smes_CurrentLiabilities | Total current liabilities
- ifrs-smes_Liabilities | Total liabilities
- ifrs-smes_EquityAndLiabilities | Total equity and liabilities
- === FS-MPERS [310000] STATEMENT OF PROFIT OR LOSS, BY FUNCTION OF EXPENSE — full tree ===
- ssmt-mpers_StatementOfProfitOrLossLineItems | Statement of profit or loss [line items]
- CONTINUING OPERATIONS (ssmt-mpers_ContinuingOperationsAbstract):
- ifrs-smes_Revenue | Total revenue
- ifrs-smes_CostOfSales | Total cost of sales
- ifrs-smes_GrossProfit | Gross profit
- ifrs-smes_OtherIncome | Total other income
- ssmt-mpers_SellingAndDistributionExpenses | Selling and distribution expenses
- ifrs-smes_AdministrativeExpense | Administrative expenses
- ifrs-smes_ResearchAndDevelopmentExpense | Research and development expense
- ifrs-smes_OtherExpenseByFunction | Other expenses
- ssmt-mpers_ProfitLossFromOperatingActivities | Profit (loss) from operating activities
- ifrs-smes_FinanceIncome | Total finance income
- ifrs-smes_FinanceCosts | Finance costs
- ifrs-smes_ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod | Share of profit (loss) of associates and joint ventures accounted for using equity method
- ifrs-smes_ProfitLossBeforeTax | Profit (loss) before tax, from continuing operations
- ifrs-smes_IncomeTaxExpenseContinuingOperations | Tax expense
- ssmt-mpers_ContributionOfZakat | Contribution to zakat
- ifrs-smes_ProfitLossFromContinuingOperations | Profit (loss) from continuing operations, net
- DISCONTINUED OPERATIONS: ifrs-smes_ProfitLossFromDiscontinuedOperations | Profit (loss) before tax, from discontinued operation
- ifrs-smes_ProfitLoss | Total Profit (Loss)
- ATTRIBUTION: ifrs-smes_ProfitLossAttributableToOwnersOfParent | ssmt-mpers_ProfitLossAttributableToOtherComponentsOfEquity | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
- === FS-MPERS [320000] STATEMENT OF PROFIT OR LOSS, BY NATURE OF EXPENSE — differences from the function view ===
- ifrs-smes_Revenue | Total revenue
- ifrs-smes_OtherIncome | Total other income
- ifrs-smes_ChangesInInventoriesOfFinishedGoodsAndWorkInProgress | Decrease (increase) in inventories of finished goods and work in progress
- ifrs-smes_RawMaterialsAndConsumablesUsed | Raw materials and consumables used
- ssmt-mpers_EmployeeBenefitsExpenseByNature | Employee benefits expense
- ifrs-smes_DepreciationAndAmortisationExpense | Depreciation and amortisation expense
- ifrs-smes_OtherExpenseByNature | Total other expenses
- (then identical tail: operating profit, finance income/costs, share of associates/JV, PBT, tax, zakat, PAT, discontinued, attribution)
- === FS-MPERS [210100] SUB-CLASSIFICATION OF ASSETS, LIABILITIES AND EQUITY — the granular tier that a ledger must be able to feed (representative sample; ~280 rows in full) ===
- PPE: ssmt-mpers_FreeholdLand | ssmt-mpers_LongtermLeaseholdLand | ssmt-mpers_ShorttermLeaseholdLand | ifrs-smes_Land (Total land)
- PPE: ssmt-mpers_BuildingOnFreeholdLand | ssmt-mpers_BuildingOnLongtermLeaseholdLand | ssmt-mpers_BuildingOnShorttermLeaseholdLand | ssmt-mpers_LeasedProperties | ifrs-smes_Buildings (Total buildings)
- PPE: ifrs-smes_Machinery | ifrs-smes_Vehicles | ssmt-mpers_OfficeEquipmentFixtureAndFittings | ssmt-mpers_PlantAndEquipment | ifrs-smes_ConstructionInProgress (Construction in progress/Asset work-in progress) | ifrs-smes_OtherPropertyPlantAndEquipment
- Investment property: ssmt-mpers_InvestmentPropertyFreeholdLandAndBuilding | ssmt-mpers_InvestmentPropertyLongtermLeaseholdLand | ssmt-mpers_InvestmentPropertyShorttermLeaseholdLand | ssmt-mpers_InvestmentPropertyBuildingUnderConstruction | ssmt-mpers_OtherInvestmentProperty
- Intangibles: ifrs-smes_CopyrightsPatentsAndOtherIndustrialPropertyRightsServiceAndOperatingRights | ifrs-smes_OtherIntangibleAssets | ifrs-smes_Goodwill
- Investments in subsidiaries/associates/JVs each split into: UnquotedSharesNetOfImpairmentLosses | QuotedSharesInMalaysia | QuotedSharesOutsideMalaysia | ShareOfPostAcquisitionProfitsAndReserves (associates & JVs) | OtherInvestments
- Inventories: ssmt-mpers_RawMaterials | ifrs-smes_WorkInProgress | ssmt-mpers_FinishedGoods | ssmt-mpers_SpareParts | ssmt-mpers_OtherInventories
- Trade receivables (current and non-current) split by counterparty: DueFromContractCustomers | DueFromHoldingCompany | DueFromSubsidiaries | DueFromAssociates | DueFromJointVentures | DueFromRelatedParties | Other...TradeReceivables
- Other receivables split into: due-from-related-parties block (holding company, subsidiaries, associates, joint ventures, other related parties) and a non-trade block (PrepaymentAndAccruedIncome, LeaseAndHirePurchaseReceivables, Miscellaneous)
- === KFI-MPERS [210000] — the reduced SOFP available only after EA2 approval (totals only, no asset-class detail) ===
- ifrs-smes_NoncurrentAssets | ifrs-smes_CurrentAssets | ifrs-smes_Assets | ifrs-smes_IssuedCapital | ssmt-mpers_RetainedEarnings | ifrs-smes_OtherReserves | ifrs-smes_EquityAttributableToOwnersOfParent | ssmt-mpers_OtherComponentsOfEquity | ifrs-smes_NoncontrollingInterests | ifrs-smes_Equity | ifrs-smes_NoncurrentLiabilities | ifrs-smes_CurrentLiabilities | ifrs-smes_Liabilities | ifrs-smes_EquityAndLiabilities
- === KFI-MPERS [310000] — the reduced P&L ===
- ifrs-smes_Revenue | ssmt-mpers_Expenditure (Expenditure) | ifrs-smes_ProfitLossBeforeTax | ifrs-smes_ProfitLoss | ifrs-smes_RevenueFromDividends (Dividend income) | ifrs-smes_ProfitLossAttributableToOwnersOfParent | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
- === FS-EPC [120000] CERTIFICATE OF EXEMPT PRIVATE COMPANY — the entire financial content an EPC lodges (no statements at all) ===
- ssmt_DisclosureOfStatusAsAnExemptPrivateCompanyExplanatory | Disclosure of the status as an exempt private company [text block]
- ssmt_DisclosureOnWhetherCompanyIsAndHasAtAllRelevantTimeBeenExemptedPrivateCompany
- ssmt_DisclosureOnWhetherDulyAuditedFinancialStatementsReportsRequiredUnderCompaniesAct2016HasBeenCirculatedToItsMembers
- ssmt_DisclosureOnWhetherAsAtDateToWhichFinancialStatementHasBeenMadeUpAndCompanyAppearedToHaveBeenAbleToMeetItsLiabilitiesAsAndWhenLiabilitiesFallDue
- ssmt_DisclosureOnWhetherAnyDirectorProvidedGuaranteeToGiveFinancialSupportIfTheCompanyInsolvent | ssmt_DisclosureOnTypeOfGuaranteeProvidedByDirector
- ssmt_NameOfDirectorWhoSignedCertificateOfExemptPrivateCompany (+ type and number of identification)
- ssmt_NameOfCompanySecretaryWhoSignedCertificateOfExemptPrivateCompany (+ identification, + ssmt_CompanySecretaryPractisingCertificateNumber)
- ssmt_NameOfTheAuditorWhoSignedCertificateOfExemptPrivateCompany | ssmt_LicenseNumberOfAuditor | ssmt_DateOfExemptPrivateCompanyCertificate
- === FS-MPERS [020000] SCOPE OF FILING — the switches that determine which statement layout is required ===
- ssmt_MethodUsedForPreparingStatementOfFinancialPosition (Current/Non-current vs Order of liquidity)
- ssmt_MethodUsedForPreparingStatementOfProfitOrLoss (Function of expense vs Nature of expense)
- ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome (Net of tax vs Before tax)
- ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity
- ssmt_MethodUsedForPreparingStatementOfCashFlows (Direct vs Indirect)
- ssmt_DateOfFinancialStatementsApprovedByBoardOfDirectors | ssmt_DateOfCirculationOfFinancialStatementsAndReportsToMembers | ssmt_DateOfStatutoryDeclaration | ssmt_MSICCode | ssmt_DescriptionOfBusiness

### UNVERIFIED — do not encode

- EXACT CONTENT OF EACH MANDATORY PHASE. The live SSM page gives only the announcement titles and dates (27/11/2024 phased-mandatory notice; Phase 2 from 1 March 2025; Phase 3 from 1 June 2025). The per-phase scope — which company/document categories fall in Phase 1 vs 2 vs 3 — lives in SSM's FAQ SharePoint list at /Pages/FAQ/FAQ-MBRS.aspx, whose REST API returned HTTP 401 (access denied) and whose page body renders client-side. The Bahasa notice PDF (NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf) downloaded successfully but is an IMAGE-ONLY scan with no extractable text layer. Secondary/advisory-firm sources (Crowe, BDO, KPMG, BoardRoom) describe Phase 1 = 1 Dec 2024 unaudited FS under CA 2016, Phase 2 = 1 Mar 2025 audited FS under CA 1965, Phase 3 = 1 Jun 2025 audited FS under CA 2016 — I could NOT confirm this split from an SSM page and am not asserting it as verified.
- WHETHER SSMxT_2022v1.0 IS STILL THE OPERATIVE TAXONOMY IN JULY 2026. The live ssm.com.my MBRS page today lists SSMxT 2022 v1.0 as the newest published taxonomy and mTool 2.2 as the current tool, with no announcement newer than 20/5/2025. But mbrs.ssm.com.my returned empty content to the fetcher, so I could not cross-check the portal-side version banner. If SSM has shipped a taxonomy patch or a 2025/2026 refresh only inside mTool 2.2 (rather than as a new published .zip), I would not have seen it. Verify against a live mTool 2.2 install before treating element names as frozen.
- WHETHER THE PUBLISHED BUSINESS RULES WORKBOOK MATCHES WHAT mTool 2.2 ACTUALLY ENFORCES. Business_Rule_MBRS_v2_SSMxT_2022.xlsx is SSM-published and currently linked from the MBRS page, but it is titled for SSMxT 2022 and carries no internal version/date stamp that I located. mTool moved 2.1 -> 2.2 and SSM publishes a separate 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook that I did not open. Rule IDs and mandatory-element lists should be re-confirmed against the tool.
- MFRS-SIDE DETAIL. I dumped the MPERS entry point exhaustively because that is the private-entity case you asked about. I did NOT dump FS-MFRS (6,197 concepts), FS-CLBG, FS-BNM, or FS-FC presentation trees, nor their mandatory-element business rules. Do not assume the MPERS minimum list transfers.
- THE CRITERIA SSM APPLIES WHEN GRANTING EA2. KFI (the reduced filing) is only permitted 'once granted approval for the Application for exemption from filing financial statements in full XBRL format (EA2)'. What SSM actually requires to approve an EA2 is not stated in the FAQ, architecture document, or FS user manual I read. Treat KFI as a discretionary concession, not an elective.
- LATE-LODGEMENT FEE WAIVER STATUS. The SSM FAQ page carries categories 'MBRS 2.0 - Additional Period of Waiver for Late Lodgement Fee of Audited Financial Statements and Reports via MBRS 2.0', 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Disruption Period', and 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Peak Period'. Their contents were not readable (401 on the list API). A secondary source claimed the waiver was extended to 30 November 2025 — unverified, and in any case likely expired by July 2026.
- WHETHER A NEWER PRACTICE DIRECTIVE HAS SUPERSEDED PD 10/2024 ON AUDIT EXEMPTION. I verified PD 10/2024 (16 Dec 2024) directly from the PDF on ssm.com.my's Audit Exemption page, and its three-year phase table. I did not exhaustively check the SSM practice-directive index for a 2025/2026 amendment. Note the same page also links a document named 'PART Q (19.5.2026).pdf' which I did not open — it may contain a 2026 update relevant to accounts/audit.
- EXACT SEMANTICS OF SOME DUPLICATED NAMES IN THE MANDATORY-ELEMENT LISTS. The SOFP mandatory rule text lists 'Employee benefits', 'Provisions' and 'Loans and borrowings' TWICE each — almost certainly once for the non-current tier and once for the current tier, matching the presentation tree. The rule message string itself does not disambiguate, so this is my inference from the tree, not a verified statement by SSM.
- CA 2016 SECTION NUMBERING FOR THE EPC CERTIFICATE. Verified: the certificate power is s.260 (heading 'Duty to lodge certificate relating to exempt private company'), operating 'in lieu of the requirements in paragraph 259(1)(a)'. Some secondary sources cite '259(4)' for this — that appears to be wrong; s.259(4) is the definitional subsection about consolidated statements. I read this from the Act PDF hosted on ssm.com.my (Act 777, 15 Sep 2016 print). I did NOT check whether the Companies (Amendment) Act 2024 altered ss.259-260; SSM's site lists that amendment act separately.
- DEFINITION OF 'EXEMPT PRIVATE COMPANY' AND WHETHER AN EPC CAN ALSO CLAIM AUDIT EXEMPTION. The s.2 definition of 'exempt private company' and any interaction between the EPC certificate route and PD 10/2024 audit exemption were not read. A secondary source stated an EPC cannot elect audit exemption if it lodges an EPC certificate (because s.260(2)(b) requires 'duly audited financial statements ... circulated to its members') — the statutory text I read is consistent with that reading, but I did not find an SSM statement confirming it.
- TOTAL SIZE OF THE MPERS SUB-CLASSIFICATION TIER. I extracted ~280 tree rows for [210100] and sampled them; I did not enumerate every leaf. Anyone building a mapping table should regenerate the full tree from the taxonomy package rather than relying on the sample here.
- WHETHER THE 'NO CHART OF ACCOUNTS' FINDING HOLDS BEYOND THE DOCUMENTS I SEARCHED. The zero-hit search covered the SSMxT 2022 Architecture Document, MBRS FAQ v2.4, the mTool 2.2 FS-CA2016 User Manual, SSM's MBRS 2.0 overview deck, the live MBRS page, and all 1,633 taxonomy filenames. It did not cover SSM training-partner course materials, the mPortal user manual, or the mTool binary itself. The finding is strong but is an absence-of-evidence result over that document set.

### Sources

- https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/SSMxT2022_Architecture_Document.pdf
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/FAQs_Malaysian_Business_Reporting_System_MBRS.pdf
- https://ssm4u.com.my/files/MBRS/SSMxT_2022v1.zip
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/Business_Rule_MBRS_v2_SSMxT_2022.xlsx
- https://www.ssm.com.my/bm/Pages/Register_Business_Company_LLP/Company/document/MBRS_v2_Summary_Sheet.pdf
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/User_manual_mTool_v2_FS2016.pdf
- https://www.ssm.com.my/Pages/FAQ/FAQ-MBRS.aspx
- https://www.ssm.com.my/bm/Pages/Services/Other-Services/xbrl%20document/NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/ISU-ISU_DIALOG_TAHUNAN_SSM_2025_ALL_WEBSITE.pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Audit-Exemption.aspx
- https://www.ssm.com.my/Pages/Legal_Framework/Document/NEW%20PD%2010-2024%20-%20Qualifying%20Criteria%20for%20Audit%20Exemption%20for%20Certain%20Categories%20of%20Private%20Companies%20(Portal).pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Companies%20-Act%20-1965-(Repealed)/aktabi_20160915_companiesact2016act777_0.pdf
- https://mbrs.ssm.com.my/

## LHDN / RMCD (tax, SST, e-invoice)

### Authority

WHAT THESE SOURCES MANDATE:

(1) LHDN / Income Tax Act 1967 — Form C is a legally required return under s.77A ITA 1967, filed within 7 months of financial year-end, e-filing mandatory. The binding constraint on ledger structure is the **"FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)" appendix (working sheet HK-FIC, Item G17 attachment)** to Form C: a fixed 59-numbered-item taxonomy covering Statement of Profit or Loss (items 1–31) and Statement of Financial Position (items 32–59). A company MUST be able to populate every one of those 59 boxes from its ledger. This is a *reporting/mapping* mandate, not a mandate that the general ledger literally use these account names — but a default CoA that cannot roll up cleanly into these 59 items will force manual rework every year. Separately, s.39(1) ITA 1967 makes specific expense classes non-deductible, so the ledger must SEGREGATE them (they cannot be buried in "Other expenditure" item 28) to support the tax computation and the s.1.3 documentation/onus-of-proof requirement.

(2) RMCD / MySST — Sales Tax Act 2018 and Service Tax Act 2018 mandate registration at prescribed thresholds and charging at prescribed rates. Critically for the CoA: Malaysian SST is a **single-stage tax** with **NO input-tax-credit mechanism** (unlike the repealed GST). This means a registered person needs an **output-tax liability account only**; sales/service tax borne on purchases is NOT recoverable and must be **capitalised into the cost of the expense/asset**, not parked in a recoverable-input-tax asset account. Sales tax and service tax are also accounted on DIFFERENT bases (sales tax = accrual/on sale; service tax = payment basis), so they cannot share one control account. There is no mandate on account naming.

(3) LHDN e-Invoice / MyInvois — mandates issuance of structured XML/JSON e-Invoices per a phased timeline, with a per-line-item "Classification" field (3-digit code from IRBM's catalogue) plus supplier MSIC code and SST registration number. It mandates a **document-level classification taxonomy**, NOT a chart of accounts. It does not prescribe ledger accounts — but a practical CoA benefits from being mappable to the IRBM classification catalogue, and the e-Invoice FAQ explicitly says tax deductions may still be claimed on existing documentation "until such time the legislation has been amended."

(4) Payroll statutes — EPF (Act 452), SOCSO/PERKESO (Act 4), EIS (Act 800), HRD Corp levy (PSMB Act 2001), and MTD/PCB (ITA 1967) are each imposed by a SEPARATE statute, remitted to a DIFFERENT authority (KWSP, PERKESO, PERKESO, HRD Corp, LHDN), on different computation bases and different forms. Each therefore REQUIRES its own distinct liability/payable account — they cannot be pooled into one "statutory payables" account without losing the ability to reconcile and remit. Note also ITA s.34(4): employer contributions to an approved scheme are non-deductible to the extent they exceed 19% of the employee's remuneration, which requires employer-contribution expense to be tracked separately from gross wages.

WHAT THEY DO NOT MANDATE: no source prescribes account codes, account numbering, a specific CoA structure, or an accounting standard (MFRS/MPERS presentation comes from MASB and the Companies Act 2016, not from LHDN/RMCD). Form C is a mapping target, not a ledger schema.

### Verified facts

- FORM C: The current published company return is 'Form C 2025' (CP5 - Pin. 2025), 'SAMPLE COMPANY RETURN FORM FOR YEAR OF ASSESSMENT 2025', downloaded live from https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf (31 pages). Accompanying 'Company Return Form Guidebook 2025 Self Assessment System' at https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf (220 pages).
- FORM C structure verified verbatim: PART A (Statutory Income, Total Income and Chargeable Income, items A1-A20); PART B (Tax Payable/Repayable, B1-B13); PART C (Capital Allowances and Charges under Schedule 3, Reinvestment Allowance under Schedule 7A, Investment Allowance for Service Sector under Schedule 7B); PART D (Incentive Claim); PART F (Tax Remission Claim); PART G (Particulars incl. item G17 Financial particulars of company); PART H (Other Particulars); PART J; PART K (Tax Agent).
- FORM C Part A confirms the income-source taxonomy a company must report: A1 'Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia'; A2 same from outside Malaysia received in Malaysia; A6 'Aggregate of other statutory income from sources in Malaysia ... - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)'; A7 same from outside Malaysia incl. capital gains. So the ledger must distinguish business income from dividends / interest / discounts / rents / royalties / premiums separately.
- FORM C Part A tax-computation adjustment lines verified: A4 'LESS: Business losses brought forward (Restricted to A3)'; A10 'Current year business losses'; A11 'Prospecting expenditure under schedule 4/pre-operational business expenditure under schedule 4B/permitted expenses under section 60F or 60H'; A12 'Approved donations/gifts/contributions'; A13 'Zakat perniagaan (Restricted to 2.5% of A9)'; A15 'Claim for loss under Group Relief provision'; A17 'TAXABLE PIONEER INCOME'.
- FORM C Part B confirms the corporate tax rate bands in use for YA2025 as apportionment rows: 15, 17 and 24 (percent). Also B5 'Section 6D rebate (Up to RM20,000, restricted to B3)'.
- FORM C GUIDEBOOK 2025 paragraph 1.2.3 'Non-allowable Expenses' lists verbatim by legal provision: 33(2) Interest not deductible against business income; 34(4) Contribution to an approved scheme in excess of 19% of the employee's remuneration; 39(1)(a) Any form of private or domestic expenses; 39(1)(b) disbursements/expenses not wholly and exclusively laid out for producing gross income; 39(1)(c) capital withdrawn; 39(1)(d) Payment to any unapproved provident fund; 39(1)(e) qualifying mining/agriculture-forest/prospecting expenditure; 39(1)(f) Interest or royalty paid to non-residents without complying with section 109; 39(1)(g) payment for licence/permit to extract timber other than to a State Government; 39(1)(i) Contract payment made without complying with section 107A; 39(1)(j) Payment made to non-residents without complying with section 109B; 39(1)(k) Payment exceeding RM100,000 for rental of non-commercial motor vehicle; 39(1)(l) Entertainment; 39(1)(m) Expenditure incurred on leave passage for employee within or outside Malaysia; 39(1)(q) Payment made to non-residents without complying with section 109A; 39(1)(r) Payment made by a resident person to a Labuan company; 39(1)(s) Payments in cash to agents/dealers/distributors without complying with section 107D.
- FORM C GUIDEBOOK 2025 examples under 39(1)(b) verbatim: 'Expenses incurred in the printing and distribution of annual reports and costs of holding annual general meetings and extraordinary meetings'; 'Stock exchange listing expenses'; 'Pre-commencement or cessation of business expenses'; 'Legal expenses in connection with the acquisition of assets or private matters'; 'Donations'; 'Fines for violation of law including fines and expenses relating to income tax appeals'; 'Gifts (except for own employees)'; 'Club membership (entrance) fees and private club membership subscriptions'; 'Payment for loan and agency agreements'; 'Purchase of assets and similar expenses'.
- FORM C GUIDEBOOK 2025 additional non-allowable items listed without a section number, verbatim: 'All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts'; 'Expenditure relating to changes in the authorised capital and paid-up capital'; 'Professional fees related to the acquisition of fixed assets or investments'; 'Renovations and improvements to buildings'. This CONFIRMS that general provisions are non-deductible while SPECIFIC provisions for doubtful debts are deductible — so the ledger must split general vs specific provision.
- FORM C GUIDEBOOK 2025 confirms depreciation is replaced by capital allowances: Part C of Form C claims 'CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3'; the guidebook's adjustment worksheet gives 'Non-allowable expenses/charges - according to subsection 39(1) and other sections' with worked example 'Entertainment RM10,000 / Income tax penalty RM1,000'. Accounting depreciation is added back and Schedule 3 capital allowances claimed instead.
- FORM C GUIDEBOOK 2025 section 1.3 mandates documentation retention: 'Documents, records and other written evidence must be properly kept as the onus-of-proof is on the individual who makes the claim/adjustment. Any claim/adjustment not supported by sufficient documentation shall be disallowed in the event of a tax audit and penalty may be imposed.' Required support includes 'An analysis of income and expenditure', 'Subsidiary accounts', 'Receipts/Invoices'.
- FORM C also requires separately disclosed data for: contract/subcontract payments, commissions and rents to residents; contract payments to non-residents (s.107A); management fees to residents; professional/technical/management fees and rents to non-residents (s.4A income); expenses charged or allocated by parent company to subsidiary or headquarters to branch in Malaysia; overseas trips; transfer pricing; leasing. Each implies a separately identifiable ledger account.
- SST — GST REPEALED: The RMCD General Guide on Sales Tax (Panduan Umum Cukai Jualan, Ver 4) confirms the GST (CBP) transition: the final GST-03 return for the last taxable period was due within 120 days of 1 September 2018, and 'Apa-apa tuntutan cukai input di bawah Akta CBP 2014 yang dimansuhkan yang belum dituntut sebelum 1 September 2018 boleh dituntut dalam penyata GST-03 dan tuntutan itu adalah dianggap sebagai tuntutan akhir bagi semua cukai input' (any input tax claim under the repealed GST Act 2014 not yet claimed before 1 Sept 2018 may be claimed in the GST-03 return and that claim is deemed the FINAL claim for all input tax). No input-tax-credit mechanism exists under SST.
- SST — SINGLE STAGE: mysst.customs.gov.my/understanding-sst/ defines Sales Tax verbatim as 'A single stage tax levied on imported and locally manufactured goods, either at the time of importation or at the time the goods are sold or otherwise disposed of by the manufacturer' and Service Tax as 'a tax charged and levied on taxable services provided by any taxable person in Malaysia in the course and furtherance of business.'
- SST — TAXABLE PERIOD: 'The standard taxable period for SST (both Sales and Service Tax) is bimonthly (once every two months).' (mysst.customs.gov.my/understanding-sst/)
- SST — ACCOUNTING BASIS DIFFERS BY TAX (mysst.customs.gov.my/accounting-sst/): Sales Tax is accounted on an ACCRUAL basis — 'at the time when the goods are sold, disposed or first used'. Service Tax is accounted on a PAYMENT basis — 'at the time when the payments is received', or on 'the day following period of twelve month when any whole or part of the payment is not received from the date of the invoice for the taxable service provided' (i.e. the 12-month deemed-collection rule).
- SALES TAX REGISTRATION THRESHOLD (mysst.customs.gov.my/registering-business/): 'SALES VALUE OF TAXABLE GOODS has exceeded RM500,000 for 12 months period' and 'Manufacturers who carry out sub-contract work on taxable goods where the VALUE of work performed exceeds RM500,000 for 12 months period.' Turnover determined by Historical Method (that month + 11 preceding) or Future Method (that month + 11 succeeding).
- SALES TAX RATES from 1 July 2025 (mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/): 'The new sales tax rate change takes effect on 1 July 2025.' Structure verbatim: 'i. the rate of 5% and specific rates can be referred to under the Sales Tax (Rate of Tax) Order 2025. ii. the exempted goods can be referred to under the Sales Tax (Goods Exempted from Tax) Order 2025. If the goods are not listed in either of the above orders, the tax rate on the goods is subject to 10%.' So: exempt / 5% (or specific) / 10% default.
- SERVICE TAX RATE (mysst.customs.gov.my/registering-business/, Service Tax tab): 'Rate of tax is amended to :- 6% (1 Sept 2018 - 29 Feb 2024); 8% (Start 1 Mac 2024) except F&B, Parking, Logistic & Telecommunications - 6%'. This CONFIRMS the 6%->8% change effective 1 March 2024 with a 6% carve-out for F&B, parking, logistics and telecommunications. Credit/charge cards: 'A specific rate of tax of RM 25 is imposed upon issuance of principal or supplementary card and every subsequent year or part thereof.'
- SERVICE TAX GROUP THRESHOLDS pre-expansion (mysst.customs.gov.my/registering-business/): Group A RM 500,000.00; Group B (F&B) RM 1,500,000.00; Group C RM 500,000.00; Group D RM 500,000.00; Group E RM 500,000.00; Group F RM 500,000.00; Group G RM 500,000.00; Group H 'No Threshold'; Group I RM 500,000.00; Group J RM 500,000.00 (with one 'No Threshold' sub-item).
- SERVICE TAX EXPANSION EFFECTIVE 1 JULY 2025 (mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/) — verified per-category rate and threshold: RENTAL OR LEASING: 'The effective date for the implementation of service tax on rental or leasing services is 1 July 2025', 'The threshold value for rental or leasing services is RM500,000.00', 'The tax rate for rental or leasing services is 8%'. Residential property rental is NOT subject to service tax (worked example: warehouse rental RM20,000 x 8% = RM1,600, residential RM1,500 not taxed).
- SERVICE TAX EXPANSION — CONSTRUCTION: 'Construction work services are subject to a 6% service tax rate', threshold 'RM1,500,000', under 'Group L, First Schedule, Service Tax Regulations 2018 - Construction Work Services'. Worked example: contract value RM6,000,000, 'The service tax imposed is RM360,000 (RM6,000,000 x 6%)'. EPCC projects are included.
- SERVICE TAX EXPANSION — HEALTHCARE: 'Private healthcare services, practice of traditional and complementary medicine private services and private allied health related services will be subject to service tax at a rate of 6%', threshold 'RM1,500,000.00 in 12 months period'; TCM falls under 'Item 15, Group I'. Effective date 1 July 2025.
- SERVICE TAX EXPANSION — EDUCATION: 'Education services are subject to a service tax rate of 6%', effective 1 July 2025, applying to 'private educational institution registered under the Education Act 1996 excluding special schools and language centres' that 'charge fees exceeding RM60,000 per student for each academic year' (covers private kindergartens, academic and religious primary/secondary schools, international schools, expatriate schools and Chinese private secondary schools).
- SERVICE TAX EXPANSION — FINANCIAL SERVICES: 'Any financial service provider whose taxable services exceed the RM500,000 threshold must register under the Service Tax Act 2018'. Group H group-relief provisions apply intra-group.
- SERVICE TAX EXPANSION — BEAUTY: the live official FAQ states 'The service tax rate imposed on beauty treatment services provided to citizens and non-citizens is a flat rate of 8%' and 'The registration requirement for beauty treatment services is when the total value of taxable services has reach RM500,000 in 12 months period.'
- MOF PRESS RELEASE (mof.gov.my, 'Targeted Revision Of Sales Tax Rate And Expansion Of Service Tax Scope Effective 1 July 2025') confirms at policy level: 'Sales Tax rate remains unchanged for essential goods consumed by the public; Sales Tax at rates of 5% or 10% will apply to discretionary and non-essential goods', and the service tax scope expands to 'leasing or rental, construction, financial services, private healthcare, education, and beauty services.'
- MySST publishes Service Tax Policy Nos. 1/2026, 2/2026, 3/2026 and 4/2026 (list at mysst.customs.gov.my/service-tax-policy/), plus Sales Tax Policy documents — confirming ongoing 2026 policy amendments to the SST regime. Site 'Last Updated: 19/07/2026'.
- E-INVOICE MANDATE TIMELINE — verified verbatim from the official 'IMPLEMENTATION OF E-INVOICE IN MALAYSIA FREQUENTLY ASKED QUESTIONS (FAQs) (UPDATED ON 5 MAY 2026)' at https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf — table 'Targeted Taxpayers / Implementation Date': annual turnover or revenue more than RM100 million -> 1 August 2024; more than RM25 million and up to RM100 million -> 1 January 2025; more than RM5 million and up to RM25 million -> 1 July 2025; up to RM5 million -> 1 January 2026.
- E-INVOICE — thresholds are measured 'according to annual turnover or revenue thresholds as stated in the statement of comprehensive income in the Financial Year 2022 Audited Financial Statements.' Enforcement/penalty for the >RM100 million cohort only began 1 October 2024 per Income Tax (Issuance of Electronic Invoice) Rules 2024 [P.U. (A) 265] gazetted 30 September 2024.
- E-INVOICE — MSME EXEMPTION AND THE 1 JULY 2026 CONCESSIONARY DATE: 'the Government of Malaysia has exempted taxpayers with annual turnover or revenue below RM1 million from the issuance of e-Invoice' (including self-billed e-Invoice). The exemption does NOT apply where: '(a) taxpayer with non-individual shareholder(s) (or equivalent) with annual turnover or revenue of at least RM1 million; or (b) taxpayer is a subsidiary of a holding company with annual turnover or revenue of at least RM1 million; or (c) taxpayer has related company / joint venture with annual turnover or revenue of at least RM1 million.' Taxpayers reaching RM1 million in YA2023/2024/2025 must implement from 1 July 2026 (the 'concessionary e-Invoice implementation date'). From YA2026 onwards the rule is '1 January in the second year following the YA in which the total annual turnover or revenue reaches RM1 million.'
- E-INVOICE — FORMAT AND MODEL: 'The e-Invoice must be generated in the form of XML or JSON file format' (not PDF/JPG). Two transmission mechanisms: MyInvois Portal and API. 'The e-Invoice model in Malaysia adopts the Continuous Transaction Control (CTC) Model'. Consolidated e-Invoice must be issued 'within seven (7) calendar days after the month end'. Self-billed e-Invoice for importation of goods due 'latest by the end of the second month following the month' of importation.
- E-INVOICE — CLASSIFICATION REQUIREMENT (from IRBM e-Invoice Specific Guideline VERSION 4.8, https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf): data field no. 9 is 'Classification' = 'Classification of product or services', with the instruction to input 'a 3-digit integer (e.g., "000" to "999"), in accordance with the catalogue set by IRBM'. Related fields include no. 6 'Supplier's SST Registration Number' and no. 7 "Supplier's Malaysia Standard Industrial Classification (MSIC code)". So classification is at LINE-ITEM level, using IRBM's own catalogue, and is independent of the general ledger account.
- E-INVOICE — the IRBM classification catalogue (https://sdk.myinvois.hasil.gov.my/codes/classification-codes/) contains 45 codes numbered 001 to 045, ranging from '001 Breastfeeding equipment' to '045 Self-billed - Non-monetary payment to agents, dealers or distributors'. This is a transaction-type/product catalogue, NOT an accounting chart of accounts.
- E-INVOICE — no industry is exempt: 'Currently, there are no industries that are exempted from the e-Invoice implementation.' And deductions are unaffected for now: 'Yes, taxpayers can continue to claim tax deductions or personal tax relief using existing documentation until such time the legislation has been amended.'
- PAYROLL — SOCSO/PERKESO wage ceiling: 'Effective 1 October 2024, PERKESO will enforce a new wage ceiling for contributions from RM5,000 to RM6,000 per month' (perkeso.gov.my rate-of-contribution and kadar-caruman pages).
- PAYROLL — SOCSO contribution is a BRACKET TABLE, not a flat percentage. Verified from the official PERKESO PDF 'EMPLOYEES' SOCIAL SECURITY ACT 1969 (ACT 4): NEW CONTRIBUTION RATE INCLUDING THE NON-EMPLOYMENT INJURY SECURITY SCHEME (SKBBK)' (https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf, 8 pages, 65 wage brackets). Columns are FIRST CATEGORY (Employment Injury Scheme, Invalidity Scheme and Non-Employment Injury Scheme) with EMPLOYER SHARE and EMPLOYEE SHARE split into INVALIDITY and NON-EMPLOYMENT INJURY sub-columns; and SECOND CATEGORY (Employment Injury Scheme and Non-Employment Injury Scheme). Top bracket 65 'Where wages exceed RM6,000': First Category employer RM104.15, employee invalidity RM29.75 + non-employment injury RM44.65, total RM178.55; Second Category employer RM74.40, employee RM44.65, total RM119.05.
- PAYROLL — a NEW third SOCSO component now exists: the Non-Employment Injury Security Scheme / Skim Kemalangan Bukan Bencana Kerja (SKBBK), branded LINDUNG 24 JAM, appearing as its own column in PERKESO's official current contribution table. It is an EMPLOYEE-borne component distinct from the Employment Injury and Invalidity schemes, requiring its own payroll line and payable tracking.
- PAYROLL — PERKESO administers separately-legislated schemes: Employees' Social Security Act 1969 (Act 4) for Employment Injury + Invalidity + SKBBK, and the Employment Insurance System Act 2017 (Act 800) for EIS. PERKESO publishes two distinct rate documents, 'Contribution Rate of Act 4' and 'Contribution Rate of Act 800', confirming SOCSO and EIS are computed and remitted as separate items.
- PAYROLL — HRD CORP LEVY (official HRD Corp support centre, https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy): governed by 'Section 2, 14, and 15 of the PSMB Act 2001'. Formula verbatim: 'LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1%'. Standard rate 1% of monthly wages; reduced rate '0.5% of the monthly wages' for employers below the mandatory employee threshold. Levy base INCLUDES basic salary and fixed allowance, leave pay and wage arrears; EXCLUDES bonuses, gratuity, travel allowances, apprenticeship payments, overtime and shift differentials. Payment due 'within 15 days of the following month'; later payments are classified as arrears.
- PAYROLL — MTD/PCB: LHDN operates 'Monthly Tax Deduction (MTD)' / 'Potongan Cukai Bulanan (PCB)' with an official 'SPECIFICATION FOR MONTHLY TAX DEDUCTION (MTD)' computerised-calculation specification published annually on hasil.gov.my, plus the e-CP39 / e-PCB / e-Data PCB submission channels and Form CP39. MTD is an employee-borne income tax withholding remitted by the employer to LHDN — structurally different from EPF/SOCSO/EIS/HRD (which involve employer cost), so it must sit in its own payable account.
- PAYROLL — LHDN link back to the ledger: ITA s.34(4) makes 'Contribution to an approved scheme in excess of 19% of the employee's remuneration' non-allowable, and s.39(1)(d) disallows 'Payment to any unapproved provident fund'. This confirms employer EPF contributions must be tracked as a distinct expense line measurable against employee remuneration.

### Line items / taxonomy / categories

- === LHDN FORM C — 'FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)' (working sheet HK-FIC, Item G17 attachment). THIS IS THE AUTHORITATIVE 59-ITEM PRESENTATION TAXONOMY A MALAYSIAN SDN BHD LEDGER MUST ROLL UP INTO ===
- 1 Business code
- 2 Type of business activity
- --- STATEMENT OF PROFIT OR LOSS ---
- 3 Sales / turnover
- LESS:
- 4 Opening inventory
- 5 Cost of purchases
- 6 Cost of production
- 7 Closing inventory
- 8 Cost of sales (4 + 5 + 6 - 7)
- 9 GROSS PROFIT/LOSS (3 - 8)
- 10 Foreign currency exchange gain
- 11 Other business income
- 12 Other income
- 13 Non-taxable profits
- EXPENDITURE:
- 14 Interest
- 15 Professional, technical, management and legal fees
- 16 Technical fee payments to non-resident receipients
- 17 Contract payments
- 18 Directors' fee
- 19 Salaries and wages
- 20 Cost of Employee Share Options
- 21 Royalties
- 22 Rental/lease
- 23 Maintenance and repairs
- 24 Research and development
- 25 Promotion and advertisement
- 26 Travelling and accommodation
- 27 Foreign currency exchange loss
- 28 Other expenditure
- 29 TOTAL EXPENDITURE (14 to 28)
- 30 NET PROFIT/LOSS
- 31 Non-allowable expenses
- --- STATEMENT OF FINANCIAL POSITION / NON-CURRENT ASSETS ---
- 32 Motor vehicles
- 33 Plant and equipment
- 34 Land and buildings
- 35 Other non-current assets
- 36 TOTAL NON-CURRENT ASSETS (32 to 35)
- 37 Total cost of non-current assets acquired in the basis period
- 38 Investments
- --- CURRENT ASSETS ---
- 39 Trade debtors
- 40 Other debtors
- 41 Inventory
- 42 Loans to directors
- 43 Cash in hand and cash at bank
- 44 Other current assets
- 45 TOTAL CURRENT ASSETS (39 to 44)
- 46 TOTAL ASSETS (36 + 38 + 45)
- --- LIABILITIES AND OWNERS' EQUITY / CURRENT LIABILITIES ---
- 47 Loans and bank overdrafts
- 48 Trade creditors
- 49 Other creditors
- 50 Loans from directors
- 51 Other current liabilities
- 52 TOTAL CURRENT LIABILITIES (47 to 51)
- 53 Non-current liabilities
- 54 TOTAL LIABILITIES (52 + 53)
- --- SHAREHOLDERS' EQUITY ---
- 55 Issued and fully paid-up capital
- 56 Profit and loss appropriation account
- 57 Reserve account
- 58 TOTAL EQUITY (55 + 56 + 57)
- 59 TOTAL LIABILITIES AND EQUITY (54 + 58)
- === FORM C PART A — INCOME SOURCES AND TAX-COMPUTATION ADJUSTMENTS (ledger must segregate these) ===
- A1 Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia
- A2 Aggregate statutory income from sources of business(es) and partnership(s) outside Malaysia received in Malaysia
- A4 LESS: Business losses brought forward (Restricted to A3)
- A6 Aggregate of other statutory income from sources in Malaysia - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)
- A7 Aggregate of other statutory income from sources outside Malaysia received in Malaysia - Dividends, interest, discounts, rents, royalties, premiums, capital gains and other income
- A10 LESS: Current year business losses (Restricted to A9)
- A11 Prospecting expenditure under schedule 4 / pre-operational business expenditure under schedule 4B / permitted expenses under section 60F or 60H
- A12 Approved donations/gifts/contributions
- A13 Zakat perniagaan (Restricted to 2.5% of A9)
- A15 LESS: Claim for loss under Group Relief provision
- A17 TAXABLE PIONEER INCOME
- PART C: CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3, REINVESTMENT ALLOWANCE UNDER SCHEDULE 7A AND INVESTMENT ALLOWANCE FOR SERVICE SECTOR UNDER SCHEDULE 7B
- C1b Total accelerated capital allowance (if relevant)
- C2 Claim for industrial building allowance under subparagraph 42(1) Schedule 3
- === NON-DEDUCTIBLE / ADD-BACK CATEGORIES (Form C Guidebook 2025, para 1.2.3) — each needs its own ledger account so it is not buried in item 28 'Other expenditure' ===
- Entertainment [ITA 39(1)(l)]
- Donations [39(1)(b) example] — note approved donations are claimed separately at Form C item A12, so approved vs non-approved donations need separate accounts
- Gifts (except for own employees) [39(1)(b) example]
- Fines for violation of law including fines and expenses relating to income tax appeals [39(1)(b) example]
- Depreciation — added back; relief given instead as Schedule 3 capital allowances (Form C Part C)
- All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts
- Specific provision for doubtful debts — DEDUCTIBLE (must be split from general provision)
- Any form of private or domestic expenses [39(1)(a)]
- Leave passage for employee within or outside Malaysia [39(1)(m)]
- Payment exceeding RM100,000 for rental of non-commercial motor vehicle [39(1)(k)]
- Interest not deductible against business income [33(2)]
- Contribution to an approved scheme in excess of 19% of the employee's remuneration [34(4)]
- Payment to any unapproved provident fund [39(1)(d)]
- Withholding-tax-failure disallowances: interest/royalty to non-residents without s.109 [39(1)(f)]; contract payment without s.107A [39(1)(i)]; payment to non-residents without s.109B [39(1)(j)]; without s.109A [39(1)(q)]; cash payments to resident agents/dealers/distributors without s.107D [39(1)(s)]
- Payment made by a resident person to a Labuan company [39(1)(r)]
- Annual report printing/distribution and AGM/EGM costs [39(1)(b) example]
- Stock exchange listing expenses [39(1)(b) example]
- Pre-commencement or cessation of business expenses [39(1)(b) example]
- Legal expenses in connection with the acquisition of assets or private matters [39(1)(b) example]
- Club membership (entrance) fees and private club membership subscriptions [39(1)(b) example]
- Expenditure relating to changes in the authorised capital and paid-up capital
- Professional fees related to the acquisition of fixed assets or investments
- Renovations and improvements to buildings (capital, not repairs — must be split from item 23 'Maintenance and repairs')
- Capital withdrawn or sum employed as capital [39(1)(c)]
- === SST LEDGER ACCOUNTS REQUIRED (SST is single-stage, NO input tax credit) ===
- Sales Tax Payable (output) — accrual basis, recognised when goods are sold, disposed or first used; rates exempt / 5% (or specific) / 10% default under the Sales Tax (Rate of Tax) Order 2025 and Sales Tax (Goods Exempted from Tax) Order 2025
- Service Tax Payable (output) — PAYMENT basis, recognised when payment is received, with a 12-month deemed-collection trigger from invoice date; needs rate segregation 8% vs 6%
- Service Tax Payable — 6% subset (F&B, parking, logistics, telecommunications; plus post-1-July-2025 construction, private healthcare/TCM/allied health, and education)
- Service Tax Payable — 8% subset (general taxable services; plus rental or leasing, and beauty treatment)
- Service Tax Payable — credit/charge cards at the specific rate of RM25 per principal/supplementary card per year
- Imported Taxable Services — service tax self-accounted by the recipient (MySST maintains a separate 'Non-Registrant: Imported Service' registration channel)
- NO 'Input Tax Recoverable' / 'SST Receivable' account — sales tax and service tax borne on purchases are NOT creditable and must be capitalised into the cost of the expense or asset
- Sales Tax Exemption tracking (Schedule A / B / C exemption certificates; registered manufacturers may buy raw materials, components, packing and packaging materials, manufacturing aids and cleanroom equipment exempt under the Sales Tax (Persons Exempted from Payment of Tax) Order 2018)
- === STATUTORY PAYROLL PAYABLES — each a SEPARATE payable (different statute, authority, form and basis) ===
- EPF / KWSP Payable (Employees Provident Fund Act 1991) — split employer contribution (expense) vs employee contribution (deduction from wages); s.34(4) ITA caps deductibility at 19% of remuneration
- SOCSO / PERKESO Payable — Employees' Social Security Act 1969 (Act 4); bracket table not a flat %; wage ceiling RM6,000/month from 1 October 2024; First Category (Employment Injury + Invalidity + SKBBK) vs Second Category (Employment Injury + SKBBK)
- SOCSO — Non-Employment Injury Security Scheme (SKBBK / Skim Kemalangan Bukan Bencana Kerja, 'LINDUNG 24 JAM') — new employee-borne component with its own column in PERKESO's official contribution table
- EIS / SIP Payable (Employment Insurance System Act 2017, Act 800) — administered by PERKESO but a separate Act and a separate published rate document from Act 4
- HRD Corp Levy Payable (PSMB Act 2001, ss. 2, 14, 15) — LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1% (or 0.5% reduced rate); employer-only cost; due within 15 days of the following month
- MTD / PCB Payable (Potongan Cukai Bulanan, ITA 1967) — employee income tax withheld and remitted to LHDN via e-PCB / e-Data PCB / e-CP39, Form CP39; employee-borne, not an employer cost
- Zakat perniagaan payable (if applicable) — claimed at Form C item A13, restricted to 2.5% of aggregate income
- === E-INVOICE / MyInvois FIELDS THAT TOUCH THE LEDGER (classification is line-item level, not account level) ===
- Classification — 3-digit integer '000' to '999' from the IRBM catalogue (45 codes currently, 001 'Breastfeeding equipment' to 045 'Self-billed - Non-monetary payment to agents, dealers or distributors')
- Supplier's SST Registration Number
- Supplier's Malaysia Standard Industrial Classification (MSIC code)
- Description of Product / Services

### UNVERIFIED — do not encode

- EPF (KWSP) CONTRIBUTION PERCENTAGES — NOT VERIFIED. kwsp.gov.my returned HTTP 403 Forbidden to every attempt (the mandatory-contribution page, the EPF Act 1991 Third Schedule page, and the Third Schedule PDF), both via WebFetch and via curl with full browser headers. The commonly cited figures (employer 13% for wages up to RM5,000 and 12% above RM5,000; employee 11%; reduced rates for age 60+; 2% employer / 2% employee for foreign workers from October 2025) appear only in third-party blogs and MUST NOT be treated as verified. Retrieve the EPF Act 1991 Third Schedule directly before encoding any EPF rate.
- SOCSO FLAT PERCENTAGES (1.75% employer / 0.5% employee) — NOT VERIFIED as stated percentages. The official PERKESO document is a 65-bracket RM table, not a percentage schedule. Deriving 1.75%/0.5% from the top bracket is approximate (employer RM104.15 / RM6,000 = 1.736%). Any implementation should use the official bracket table, not a percentage.
- EIS (Act 800) RATES — NOT VERIFIED. The official PERKESO PDF '151124-Rate Contribution ACT 800.pdf' was retrieved but contained no extractable text layer (0 characters — likely a scanned image). The commonly cited 0.2% employer / 0.2% employee split on a RM6,000 ceiling comes only from blogs.
- SKBBK EFFECTIVE DATE — NOT VERIFIED from an official page. The scheme's existence and rate columns ARE confirmed from PERKESO's own PDF, but the widely reported commencement of 1 June 2026, the reported 0.75% employee contribution rate, and the reported voluntary-for-Malaysians / mandatory-for-foreign-workers split all come from third-party payroll vendors. The linked official FAQ (050626-FAQSkimLINDUNG24Jam.pdf) sits behind an internal IP address (172.25.36.31) and is not publicly reachable.
- RENTAL / LEASING SERVICE TAX RATE REDUCTION 8% -> 6% FROM 1 JANUARY 2026 — NOT VERIFIED, AND THE OFFICIAL PAGE CONTRADICTS IT. The live MySST expansion FAQ (fetched today, site last updated 19/07/2026) still states 'The tax rate for rental or leasing services is 8%.' A reported reduction to 6% effective 1 January 2026, implemented as a service tax EXEMPTION pending gazetting of subsidiary legislation, appears only in a KPMG Malaysia commentary on 'Amendment to Service Tax Policy 2/2025'. Service Tax Policy Nos. 1/2026-4/2026 exist on the MySST site but their PDF contents were not retrieved. VERIFY before encoding a rental service tax rate.
- WHETHER BEAUTY / PERSONAL-CARE SERVICES WERE DROPPED FROM THE 1 JULY 2025 EXPANSION — CONFLICTING. The live official MySST FAQ still describes beauty treatment services as taxable at a flat 8% with a RM500,000 threshold, but secondary sources report beauty services were withdrawn after public feedback. Not resolved from an official page.
- ENTERTAINMENT 50% DEDUCTION PROVISO — NOT VERIFIED. The Form C Guidebook 2025 confirms entertainment is non-allowable under ITA 39(1)(l) and uses it as an add-back example, but the guidebook does not state the well-known proviso allowing 50% (or 100% for certain categories such as staff entertainment and promotional gifts). Confirm against LHDN Public Ruling on entertainment expense before building a 50%/100% split into the CoA.
- FORM C FOR YA2026 — NOT AVAILABLE. Only the YA2025 form (CP5 - Pin. 2025) and its guidebook are published on hasil.gov.my. The 59-item financial particulars taxonomy is stable across YA2022-YA2025 (sample forms exist for each), but the YA2026 form may differ.
- WHETHER THE E-INVOICE 'Classification' FIELD IS STRICTLY MANDATORY ON EVERY LINE — PARTIALLY VERIFIED. The Specific Guideline v4.8 shows it as data field no. 9 with explicit input instructions, and the SDK says 'taxpayers should be using the code values', but neither page carried an explicit mandatory/optional flag. Confirm against the MyInvois SDK validation rules / UBL schema.
- MTD/PCB REMITTANCE DUE DATE (15th of the following month) — WEAKLY VERIFIED. Confirmed only via search-engine summaries of hasil.gov.my pages; the LHDN MTD payment page (https://www.hasil.gov.my/en/employers/mtd-payment/) returned 404 on direct fetch because the site was recently restructured, and the MTD specification PDF URL also 404'd. The MTD/PCB scheme itself, the e-CP39/e-PCB channels and Form CP39 are confirmed to exist.
- HRD CORP EMPLOYEE-COUNT THRESHOLDS (10+ employees mandatory at 1%; 5-9 employees optional at 0.5%) — PARTIALLY VERIFIED. The official HRD Corp support centre confirms the 1% and 0.5% rates and the PSMB Act 2001 basis, but the specific employee-count cut-offs and the sector coverage under the First Schedule of the PSMB Act were paraphrased from search results rather than read from the official page text.
- SST 'NO INPUT TAX CREDIT' — INFERRED FROM STRONG OFFICIAL EVIDENCE, NOT FROM A SINGLE EXPLICIT SENTENCE. Confirmed officially that sales tax is a 'single stage tax', that GST input tax claims ended with a final GST-03 return in 2018, and that no input-credit mechanism appears anywhere in the SST registration/accounting pages. No official page was found that states in one sentence 'input tax is not claimable under SST'. The conclusion is sound but rests on composition of these facts.
- MySST GENERAL GUIDES ARE PARTLY STALE: the current 'General guideline for Sales Tax' PDF hosted on the live site is 'Panduan Umum Cukai Jualan - Ver 4, Sehingga 15 Januari 2019' (Malay only, dated 2019) and therefore predates both the March 2024 service tax rate change and the July 2025 expansion. Rate/threshold facts above were taken from the live HTML pages and 2025 FAQs, not from this guide.
- CORPORATE TAX RATES: Form C Part B shows apportionment rows at 15, 17 and 24 percent, but the form does not state the chargeable-income bands or the eligibility conditions (e.g. SME paid-up capital and gross income tests) that determine which rate applies. Confirm the bands from the ITA / LHDN rate page before use.

### Sources

- https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf
- https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf
- https://www.hasil.gov.my/en/muat-turun-borang/muat-turun-borang-syarikat/
- https://www.hasil.gov.my/en/muat-turun-borang/
- https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf
- https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf
- https://sdk.myinvois.hasil.gov.my/codes/classification-codes/
- https://mysst.customs.gov.my/registering-business/
- https://mysst.customs.gov.my/understanding-sst/
- https://mysst.customs.gov.my/accounting-sst/
- https://mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/
- https://mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/
- https://mysst.customs.gov.my/service-tax-policy/
- https://mysst.customs.gov.my/about-exemption/
- https://mysst.customs.gov.my/general-guide/
- https://mysst.customs.gov.my/wp-content/uploads/2025/03/Panduan-Umum_Cukai-Jualan_18012019-v4-2.pdf
- https://www.mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025
- https://www.perkeso.gov.my/en/our-services/employer-employee/kadar-caruman.html
- https://www.perkeso.gov.my/en/rate-of-contribution.html
- https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf
- https://www.perkeso.gov.my/images/dokumen/151124-Rate%20Contribution%20ACT%20800.pdf
- https://www.perkeso.gov.my/en/our-services/protection/employment-insurance.html
- https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy

