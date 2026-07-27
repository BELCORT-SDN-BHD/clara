# Framework-question design memo — Malaysian practice (Codex research, 2026-07-27)

> Commissioned for interview_v2 F2 (owner ruling: flexible, best-practice-driven).
> Producer: Codex gpt-5.6-sol xhigh, knowledge-only, statute-anchored; adjudicated by the
> orchestrator (two-axis design adopted; hard blocks limited to the two statutory
> impossibilities with the observed-state escape; framework_version a separate field).

1. The framework landscape by ENTITY TYPE under Malaysian law and practice: Sdn Bhd / Bhd (CA 2016 — MPERS vs MFRS eligibility rules, when MFRS is mandatory); sole proprietorships and conventional partnerships (no CA 2016 audit/framework mandate — what do firms actually keep: management accounts on an income-tax basis per ITA 1967 record-keeping, cash basis, MPERS-aligned?); LLPs (LLP Act 2012 — practice); any other common shapes (societies, co-ops — note only if commonly serviced).
2. What leading Malaysian SME-focused firms actually RECORD at client onboarding for "framework/basis of preparation" — the practical taxonomy (e.g. MFRS / MPERS / tax-basis management accounts / cash basis / other-with-note), and which combinations are real vs theoretical.
3. A recommended OPTION SET for the interview question: entity-type-conditional defaults, the full selectable list, whether "other + free text" is advisable, and the validation rule (e.g. an Sdn Bhd answering "cash basis" — hard refuse, warn, or accept with note?).
4. Cite the authoritative anchors (CA 2016 s.244/s.245, MASB pronouncements on MPERS scope, LLP Act, ITA record-keeping) — statute/standard names and sections, no fabricated citations; mark anything uncertain as uncertain.

OUTPUT: a compact design memo (under 900 words) I can hand to an implementer as the F2 option-set spec.

2026-07-27T07:38:30.541635Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/zoom/streamable\"" })
2026-07-27T07:38:33.702489Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/whiteboard/streamable\"" })
2026-07-27T07:38:35.417150Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/docs/streamable\"" })
warning: Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
codex
I’ll verify the current Malaysian statutory and MASB anchors, then turn the legal landscape into a compact, implementable conditional taxonomy. I’ll separate what is mandated from common firm practice and flag thinly evidenced practice claims.
web search: 
web search: site:masb.org.my MPERS private entities scope Malaysian Private Entities Reporting Standard public accountability ...
web search: 
web search: MASB MPERS definition private entity subsidiary public accountability Malaysia MFRS mandatory official ...
web search: 
web search: '244. (1)'
web search: 
web search: 
web search: 
web search: 
web search: 
web search: 
2026-07-27T07:39:26.132018Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: '69. (1)'
2026-07-27T07:39:32.884050Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
codex
The statutory split is clear: companies must use an applicable MASB-approved framework, while LLP law requires true-and-fair accounts and records but does not itself name MPERS/MFRS or require audit. I’m now checking the less codified part—how firms label bases for LLPs and unincorporated businesses—so the option labels don’t accidentally imply MPERS applies where it may not.
web search: 
web search: Malaysia LLP accounting framework MPERS MFRS basis of preparation accounting firm ...
2026-07-27T07:39:45.593949Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "LLP" "MPERS" Malaysia accounts ...
2026-07-27T07:40:06.674255Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "complete accounting records" "limited liability partnership" ...
2026-07-27T07:40:13.156992Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 
2026-07-27T07:40:21.056442Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 
2026-07-27T07:40:26.449853Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "PR5_2000_Rev.pdf" ...
2026-07-27T07:40:32.669863Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: '4.2'
2026-07-27T07:40:38.343942Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: Malaysia accounting firm client onboarding checklist accounting framework MPERS MFRS management accounts ...
2026-07-27T07:40:49.044792Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 'financial reporting framework'
2026-07-27T07:40:55.442858Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: ISRS 4410 acceptable financial reporting framework cash basis tax basis compilation engagement ...
2026-07-27T07:41:01.949394Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: Malaysia Societies Act 1966 annual accounts audit section 14 official ...
2026-07-27T07:41:13.524544Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "Societies Act 1966" "statement of receipts and payments" Malaysia ...
web search: 
web search: site:masb.org.my MPERS 2025 effective 1 January 2027 Malaysia October 2025 ...
web search: 
web search: site:parlimen.gov.my "MASB Approved Accounting Standards for Entities Other than Private Entities" MFRS 2024 ...
web search: 
web search: "MPERS is not applicable" LLP Malaysia ...
web search: 
web search: site:ssm.com.my "Similar to a conventional partnership" "approved accounting standards" LLP ...
2026-07-27T07:42:26.959120Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ssm.com.my Registration of Businesses Act 1956 pdf accounting records financial statements ...
2026-07-27T07:42:34.870332Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my Income Tax Act 1967 section 82 2026 sufficient records seven years ...
2026-07-27T07:43:27.690248Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
codex
## F2 design memo — Malaysian reporting framework onboarding

**Decision:** Do not present MPERS, MFRS and cash basis as equivalent choices. MPERS/MFRS are reporting frameworks; cash/accrual describes recognition or bookkeeping. Ask entity type first, then store separate `framework` and `accounting_basis` fields.

### 1. Entity landscape

| Entity | Legal/practical position |
|---|---|
| **Sdn Bhd** | Companies Act 2016 s.244 requires applicable MASB-approved standards; s.245 requires audit-capable records, entries within 60 days and seven-year retention. A qualifying “private entity” may use **MPERS in its entirety or elect MFRS in its entirety**. It must be a private company that is neither required to report under SC/BNM-administered law nor a subsidiary, associate or jointly controlled entity of one; Interest Schemes Act management companies and specified related entities are excluded. **There is no size test.** Audit exemption does not alter the framework. [CA 2016 ss.244–245](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf), [MIA MPERS scope FAQ](https://mia.org.my/storage/2022/04/MIA_MPERS_FAQs.pdf) |
| **Bhd/public company** | It is not a private entity; **MFRS is mandatory**, whether listed or unlisted. MFRS is also mandatory for a Sdn Bhd failing the private-entity tests above. An eligible Sdn Bhd may nevertheless elect MFRS voluntarily, often for group reporting, financing or IPO readiness. [MIA AAPG 1](https://mia.org.my/wp-content/uploads/2024/03/1.-AAPG-1-Revised-February-2024.pdf) |
| **Sole proprietor / conventional partnership** | ROBA 1956 is a registration regime and prescribes no statutory reporting framework or audit. ITA 1967 s.82 instead requires sufficient business records, generally retained seven years. LHDN PR 5/2000 permits a simplified cashbook for its defined “small business,” but still requires records capable of supporting a true-and-fair P&L and balance sheet, including year-end stock/WIP. Therefore, the ruling is **not blanket authority for cash-basis financial statements**. Firms commonly produce annual accrual/full-set management accounts used as the starting point for tax computation; micro clients may initially keep cashbook records. [LHDN PR 5/2000 (Revised)](https://phl.hasil.gov.my/pdf/pdfam/PR5_2000_Rev.pdf), [current LHDN tax-audit framework](https://www.hasil.gov.my/media/wgpombsp/20250315_tax-audit-framework-on-income-tax-and-employer.pdf) |
| **LLP/PLT** | LLP Act 2012 s.69 requires records supporting true-and-fair P&L and balance sheets, with seven-year retention; audit is unnecessary unless the LLP agreement requires it. SSM expressly says **no approved accounting standard is imposed**. LHDN PR 8/2022 expects P&L, balance sheet and notes in normal accounting format, or detailed alternative records. Practice is therefore usually accrual special-purpose management/tax accounts; MPERS/MFRS may be used only as a voluntary or contractual benchmark. [LLPA s.69](https://www.ssm.com.my/Pages/Legal_Framework/Document/LLPA%202012_Act%20743_as%20at%201%20March%202017.pdf), [SSM LLP FAQ](https://ssm.com.my/bm/Pages/Publication/Booklet/document/LLP_bkengLS_update.PDF), [LHDN PR 8/2022](https://www.hasil.gov.my/media/3wzlz0nl/pr_8_2022.pdf) |
| **Societies/co-operatives** | Route to a specialist/regulator option. Societies commonly require audited receipts-and-payments and balance-sheet reporting under ROS rules/constitution. Co-operatives follow SKM’s GP23, which maps to MFRS/MPERS-derived requirements. [SKM GP23](https://www.skm.gov.my/images/01-utama/perundangan/garis-panduan/gp23-panduan-penyata-kewangan-koperasi-2023.pdf) |

MPERS (2025) becomes mandatory for periods beginning on or after 1 January 2027, with early adoption permitted; store framework version separately. [MASB announcement](https://www.publicnow.com/view/948296ADCAAFFBEAC11C5EA583F0748B9D872B28)

### 2. Practical firm taxonomy

Public onboarding forms of leading SME firms are generally not published, so this is a market-practice synthesis, not a validated firm survey. Public offerings consistently distinguish statutory MPERS/MFRS work from full-set/management accounts and tax computation. ISRS 4410 best practice requires firms to identify intended users, purpose and applicable basis.

Record:

- purpose: statutory/SSM, tax/LHDN, management, lender/tender, or group reporting;
- framework, accounting basis and framework version;
- prior framework/change date;
- audit status and any regulator/contractual requirement.

Real combinations are MPERS–accrual, MFRS–accrual, and special-purpose management/tax accounts–accrual or simplified cashbook. “Sdn Bhd–cash basis statutory accounts” is not valid.

### 3. Implementable option set

`framework_code`:

1. `MPERS`
2. `MFRS`
3. `SPECIAL_PURPOSE_TAX_MANAGEMENT`
4. `MPERS_ALIGNED_SPECIAL_PURPOSE` — expressly not an MPERS-compliance assertion
5. `REGULATOR_CONTRACTUAL`
6. `OTHER` — mandatory free text and authority/source
7. `UNDETERMINED` — review required

`accounting_basis`:

- `ACCRUAL`
- `CASH_RECEIPTS_PAYMENTS`
- `MODIFIED_CASH`
- `OTHER` with note

Defaults:

- eligible Sdn Bhd → MPERS + accrual;
- Bhd/ineligible Sdn Bhd → MFRS + accrual;
- sole proprietor/partnership → special-purpose tax/management; suggest accrual unless simplified-cashbook eligibility is confirmed;
- LLP → special-purpose tax/management + accrual;
- society/co-op → regulator/contractual.

### 4. Validation

- **Bhd or ineligible Sdn Bhd + MPERS:** hard block.
- **Any company + cash/modified cash as target statutory basis:** hard block completion. If this describes current defective records, retain it as observed state, require explanation, remediation and practitioner approval.
- **LLP + cash basis:** high-severity warning and review.
- **Non-company + MPERS:** warn and normally relabel “MPERS-aligned special purpose.”
- Version tax thresholds as dated rules; do not embed them in the enum.
tokens used
237,703
## F2 design memo — Malaysian reporting framework onboarding

**Decision:** Do not present MPERS, MFRS and cash basis as equivalent choices. MPERS/MFRS are reporting frameworks; cash/accrual describes recognition or bookkeeping. Ask entity type first, then store separate `framework` and `accounting_basis` fields.

### 1. Entity landscape

| Entity | Legal/practical position |
|---|---|
| **Sdn Bhd** | Companies Act 2016 s.244 requires applicable MASB-approved standards; s.245 requires audit-capable records, entries within 60 days and seven-year retention. A qualifying “private entity” may use **MPERS in its entirety or elect MFRS in its entirety**. It must be a private company that is neither required to report under SC/BNM-administered law nor a subsidiary, associate or jointly controlled entity of one; Interest Schemes Act management companies and specified related entities are excluded. **There is no size test.** Audit exemption does not alter the framework. [CA 2016 ss.244–245](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf), [MIA MPERS scope FAQ](https://mia.org.my/storage/2022/04/MIA_MPERS_FAQs.pdf) |
| **Bhd/public company** | It is not a private entity; **MFRS is mandatory**, whether listed or unlisted. MFRS is also mandatory for a Sdn Bhd failing the private-entity tests above. An eligible Sdn Bhd may nevertheless elect MFRS voluntarily, often for group reporting, financing or IPO readiness. [MIA AAPG 1](https://mia.org.my/wp-content/uploads/2024/03/1.-AAPG-1-Revised-February-2024.pdf) |
| **Sole proprietor / conventional partnership** | ROBA 1956 is a registration regime and prescribes no statutory reporting framework or audit. ITA 1967 s.82 instead requires sufficient business records, generally retained seven years. LHDN PR 5/2000 permits a simplified cashbook for its defined “small business,” but still requires records capable of supporting a true-and-fair P&L and balance sheet, including year-end stock/WIP. Therefore, the ruling is **not blanket authority for cash-basis financial statements**. Firms commonly produce annual accrual/full-set management accounts used as the starting point for tax computation; micro clients may initially keep cashbook records. [LHDN PR 5/2000 (Revised)](https://phl.hasil.gov.my/pdf/pdfam/PR5_2000_Rev.pdf), [current LHDN tax-audit framework](https://www.hasil.gov.my/media/wgpombsp/20250315_tax-audit-framework-on-income-tax-and-employer.pdf) |
| **LLP/PLT** | LLP Act 2012 s.69 requires records supporting true-and-fair P&L and balance sheets, with seven-year retention; audit is unnecessary unless the LLP agreement requires it. SSM expressly says **no approved accounting standard is imposed**. LHDN PR 8/2022 expects P&L, balance sheet and notes in normal accounting format, or detailed alternative records. Practice is therefore usually accrual special-purpose management/tax accounts; MPERS/MFRS may be used only as a voluntary or contractual benchmark. [LLPA s.69](https://www.ssm.com.my/Pages/Legal_Framework/Document/LLPA%202012_Act%20743_as%20at%201%20March%202017.pdf), [SSM LLP FAQ](https://ssm.com.my/bm/Pages/Publication/Booklet/document/LLP_bkengLS_update.PDF), [LHDN PR 8/2022](https://www.hasil.gov.my/media/3wzlz0nl/pr_8_2022.pdf) |
| **Societies/co-operatives** | Route to a specialist/regulator option. Societies commonly require audited receipts-and-payments and balance-sheet reporting under ROS rules/constitution. Co-operatives follow SKM’s GP23, which maps to MFRS/MPERS-derived requirements. [SKM GP23](https://www.skm.gov.my/images/01-utama/perundangan/garis-panduan/gp23-panduan-penyata-kewangan-koperasi-2023.pdf) |

MPERS (2025) becomes mandatory for periods beginning on or after 1 January 2027, with early adoption permitted; store framework version separately. [MASB announcement](https://www.publicnow.com/view/948296ADCAAFFBEAC11C5EA583F0748B9D872B28)

### 2. Practical firm taxonomy

Public onboarding forms of leading SME firms are generally not published, so this is a market-practice synthesis, not a validated firm survey. Public offerings consistently distinguish statutory MPERS/MFRS work from full-set/management accounts and tax computation. ISRS 4410 best practice requires firms to identify intended users, purpose and applicable basis.

Record:

- purpose: statutory/SSM, tax/LHDN, management, lender/tender, or group reporting;
- framework, accounting basis and framework version;
- prior framework/change date;
- audit status and any regulator/contractual requirement.

Real combinations are MPERS–accrual, MFRS–accrual, and special-purpose management/tax accounts–accrual or simplified cashbook. “Sdn Bhd–cash basis statutory accounts” is not valid.

### 3. Implementable option set

`framework_code`:

1. `MPERS`
2. `MFRS`
3. `SPECIAL_PURPOSE_TAX_MANAGEMENT`
4. `MPERS_ALIGNED_SPECIAL_PURPOSE` — expressly not an MPERS-compliance assertion
5. `REGULATOR_CONTRACTUAL`
6. `OTHER` — mandatory free text and authority/source
7. `UNDETERMINED` — review required

`accounting_basis`:

- `ACCRUAL`
- `CASH_RECEIPTS_PAYMENTS`
- `MODIFIED_CASH`
- `OTHER` with note
