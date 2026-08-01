# Staff-advance mechanic — cross-model research record (2026-08-01)

> Lane 1 of 2: Codex gpt-5.6-sol xhigh, direct exec, read-only repo access. Commissioned during the
> Wave D grilling (owner: "research the best practices... you can collab with codex") before ruling
> WD-R10. Lane 2 (web census: ERPNext/Odoo/Xero/QB docs, Malaysian EA 1955 statutory specifics,
> AI-native product census) is appended below when it lands.
> Outcome: the owner ratified the B-lite register (WD-R10) on this record.

---

## Lane 1 — Codex opinion (verbatim final answer)

# Recommendation

Choose **B: a deliberately narrow staff-advance register over the GL**.

It is the minimum structure that lets Clara’s database—not the agent—answer “who owes what, from which advance, since when?” It preserves WC‑R10, leaves `open_items` untouched, creates a clean future payroll-deduction seam, and avoids turning staff advances into trade credit.

I would scope B to **company-to-staff advances recorded as non-control assets**. Ordinary employee-paid claims that create a “due to employee” liability remain in the generic GL lane; where a claim clears an advance, only the applied portion enters the advance register. Any excess becomes the separate non-`payable` liability required by WC‑R10.

## 1. What mature ERPs actually do

There is not one universal model. The products divide into two families:

1. Products with a first-class advance feature use an identifiable advance object and explicit applications.
2. Simpler systems use expense/payroll workflows plus a balance-sheet or suspense account, accepting that the GL gives only an aggregate balance.

### ERPNext: the clearest B precedent

ERPNext has a first-class `Employee Advance` record containing employee, date, purpose, requested amount, advance account, paid amount, claimed amount, returned amount, pending amount, and derived status. Creating the request does not itself post the GL; submitted Payment Entries or Journal Entries reference the advance. Expense Claims then carry child rows linking a particular advance and payment reference to an allocated amount. Multiple payments and partial claims/returns are supported. [ERPNext Employee Advance documentation](https://docs.frappe.io/hr/employee-advance), [Employee Advance schema](https://github.com/frappe/hrms/blob/develop/hrms/hr/doctype/employee_advance/employee_advance.json), [Expense Claim Advance child schema](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/expense_claim_advance/expense_claim_advance.json).

Structurally:

```text
advance request/header
    → one or more actual disbursement references
    → expense-claim allocations and cash/payroll returns
    → paid − claimed − returned = outstanding
```

That is strongly B-shaped. Clara should not copy two ERPNext choices:

- ERPNext supports `Employee` as an accounting party; WC‑R10 forbids that in Clara.
- ERPNext caches several totals/status fields. Clara should derive authoritative outstanding and status from immutable origin/application rows.

### Odoo: expense objects and payroll recovery, not a universal advance subledger

Odoo core has first-class employee expense rows with employee, evidence, approval state, accounting move, payment state, and an `amount_residual` derived from the accounting move. Employee-paid expenses are reimbursed directly or through payroll; company-paid expenses follow a different path. [Odoo reimbursement documentation](https://www.odoo.com/documentation/19.0/applications/finance/expenses/reimburse.html), [current `hr.expense` model](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/models/hr_expense.py).

Its documented salary-advance implementations are localization/payroll-specific: an off-cycle payslip issues the advance and later payslips carry “Advance Recovery,” including partial recovery over several pay cycles. [Odoo Saudi payroll advances](https://www.odoo.com/documentation/19.0/applications/hr/payroll/payroll_localizations/saudi_arabia.html).

The relevant lesson is not Odoo’s exact party/accounting design. It is that advances live beside **expense/payroll state**, and recovery is attached to subsequent payroll records. Odoo does not introduce a generic third customer/vendor open-item domain for them.

### SAP Business One: often reuses AP, which Clara must not copy

The official SAP Business One evidence is localization-specific. For Mexican employee expense reimbursement, SAP B1 uses A/P invoices and A/P credit memos against a vendor whose business-partner type is Employee; expense types determine the GL expense account. [SAP B1 employee expense reimbursement](https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/9fe0c511ef504219a99f01c19be1b80c.html), [SAP B1 expense types](https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/cc9c9e41105545b6adcc39b9bbea72b6.html).

That employee-as-vendor technique is exactly what WC‑R10 rules out. Its narrower structural lesson remains useful: SAP B1 reuses an existing accounting mechanism rather than inventing a third staff-specific trade subledger.

For comparison, SAP Business ByDesign’s explicit travel-advance flow uses an advance clearing balance-sheet account with open-item management, then clears the advance through the subsequent expense report. If actual expenses are less than the advance, the difference becomes an employee receivable. [SAP ByDesign travel advances](https://help.sap.com/docs/SAP_BUSINESS_BYDESIGN/2754875d2d2a403f95e58a41a9c7d6de/2cf06f51722d1014a9c195a69ec9a361.html). This is closer to a register/open-item layer over a non-trade GL account than to trade AP/AR.

### Xero and QuickBooks: usually A-like

Xero’s first-class surface is employee expense claims. Approval creates a bill, partial payments remain outstanding, and payroll reimbursement is bridged through a suspense account and reimbursement pay item. [Xero expense claim payments](https://central.xero.com/0/article/Record-expense-claim-payment), [Xero payroll reimbursement](https://central.xero.com/s/article/Pay-an-employee-s-expense-claim-using-payroll).

I did not find a general first-class employee cash-advance register in the current official Xero documentation. That is an honest documentation finding, not proof that no localization or add-on provides one. In ordinary practice, the gap is handled through a dedicated balance-sheet account and payroll or bank entries.

QuickBooks’ official flow similarly uses a check or payroll addition tied to a tracking account, followed by a payroll deduction for repayment; a limit can stop deductions after the configured total. It does not create an advance/application ledger. [QuickBooks employee advances](https://quickbooks.intuit.com/learn-support/en-us/help-article/payroll-additions-deductions/create-employee-advance/L6KVkqAmE_US_en_US).

### The actual convergence

Where an ERP promises authoritative advance-level tracking, the useful common shape is:

```text
advance origin
    → actual disbursement
    → explicit applications:
         expense substantiation
         cash/bank return
         payroll deduction
         reversal/correction
    → derived outstanding and status
```

They conspicuously do **not** build a new trade-credit universe containing invoice/bill polarity, customer/supplier statements, credit notes, payment terms, dunning, and a third AR/AP aging domain. Either they reuse AP—impermissible for Clara—or they put a much smaller register/clearing mechanism beside the GL.

## 2. Why B is the right v1 depth

### A cannot answer the required question authoritatively

With a dedicated per-person account, A can answer:

> What is this person’s aggregate GL balance?

It cannot generally answer:

> Which advance remains outstanding, by how much, and since when?

Suppose one account contains:

- Advance 1: RM1,000 on 1 January
- Advance 2: RM600 on 1 March
- Repayment: RM800 on 15 March

The GL balance is authoritatively RM800. Whether that is:

- RM200 of Advance 1 plus RM600 of Advance 2;
- RM800 of Advance 1;
- or some explicitly agreed allocation

is not present in the books. FIFO is an accounting policy or operational judgement, not a fact the agent may silently invent.

Clara’s PRD requires every figure to come from the DB and requires downstream accounting consequences to complete transactionally ([PRD invariants](/C:/Users/zhant/Desktop/clara-rebuild/docs/prd/PRD.md:123)). Therefore an agent-generated FIFO answer would violate the architecture even if its arithmetic were correct.

### B records the judgement instead of asking the agent to reconstruct it

The application row is not mainly extra bookkeeping. It is the durable record of the judgement:

> This RM300 payroll deduction applies to this particular advance.

Once that fact exists, the DB can derive outstanding and age deterministically. The agent merely calls a read function and presents the result.

Low volume strengthens B: explicit allocation is cheap when there are few cases, while the audit benefit is unchanged.

### Wave F gets a clean seam

A future payroll deduction can post its ordinary approved payroll journal and, in the same audited transaction, insert an application referencing:

- the particular advance;
- the payroll journal line;
- the effective payroll date;
- the applied cents;
- the actor and source payroll record.

Wave F does not need to widen AR/AP or build an employee lending engine. It only needs to become another lawful application producer.

This remains compatible with the PRD’s “payroll touchpoints, not a payroll engine” constraint.

### Retrofitting B after A is deceptively expensive

Adding empty tables later is easy. Recovering history is not.

Once A has accumulated overlapping advances and partial repayments, a B migration must choose historical allocations. Unless every memo and document proves the relationship, the migration has only three bad choices:

- silently impose FIFO;
- create one synthetic “opening advance” that loses the original age;
- or require a human reconstruction exercise.

That is an irreversible loss of semantic provenance. B captures the relationship when it is knowable.

Conversely, an empty B table is operationally cheap. Its real cost is the invariant and test surface, not storage. That cost can be kept bounded by making the register opt-in only for designated staff-advance accounts and executing a synthetic plus real acceptance case before Wave D closes.

## 3. The B implementation boundary I would ratify

Keep it materially smaller than `open_items`.

### Data

`staff_advances`, one immutable row per **posted disbursement**, not per unposted request:

- `firm_id`, `client_id`
- dedicated `advance_account_code`
- `issue_journal_line_id`—prefer the exact GL leg over only `entry_id`
- `issue_date`
- positive `amount_cents`
- purpose/reference
- actor and audit provenance

Until a future staff master exists, the dedicated per-person account can be the stable v1 subject identity. Do not create an employee counterparty. A future payroll wave can add an explicit mapping from payroll subject to account/register subject.

`staff_advance_applications`, append-only:

- `advance_id`
- exact journal-line or entry reference
- `effective_date`
- `application_kind`: claim, bank return, payroll deduction, correction
- signed or direction-constrained `amount_cents`
- reversal lineage
- actor, reason, provenance

Authoritative values remain derived:

```text
outstanding(as_of)
  = issued through as_of
  − net applications effective through as_of
```

No mutable `outstanding_cents` or hand-maintained status.

### Invariants

- Every enrolled advance account must be dedicated to the register. Do not enroll a mixed director-current or related-party account.
- The issue row must equal an approved debit to that account.
- Applications must equal approved credits reducing the same account.
- Sum of register outstanding must equal the approved GL debit balance **per account and as of date**.
- A managed account cannot receive an approved GL movement without the corresponding register effect in the same transaction. A nightly discrepancy report alone is below Clara’s F3 bar.
- Applications cannot predate the advance or over-apply it.
- Writers lock affected advances to prevent concurrent over-application.
- Corrections append reversals; they never edit or delete applications.
- Allocation is explicit. Do not auto-FIFO unless the owner later ratifies FIFO as policy.
- The AF‑2 resolve-and-book composite should create or apply the register effect alongside its non-P&L journal leg and bank match. That is the natural owner of the already proven two-entry/one-group idiom ([AF‑2](/C:/Users/zhant/Desktop/clara-rebuild/docs/plan/wave-c-c-tieout-design-part2.md:223)).

A claim exceeding the available advance should split:

```text
Dr expense                         full approved claim
Cr staff-advance asset             amount applied to advance
Cr due-to-employee liability       excess owed to employee
```

Only the second leg receives an advance application. The excess remains outside AP aging under WC‑R10.

### Reads

Two DB-owned reads are enough for v1:

- `staff_advance_summary(client, as_of)` → person/account, each advance, original amount, outstanding, issue date, days outstanding.
- `staff_advance_statement(account/person, from, to)` → origins, applications, running balance, linked entries.

This is B—not a miniature copy of the AR/AP engine. Clara’s existing subledger is much heavier: it requires a vendor/customer counterparty, binary domain checks, signed kind law, balanced allocation pairs, approval decomposition, reversal belts, aging and statements ([open-item schema](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0037_wave_c_a_subledger.sql:726), [allocation schema](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0037_wave_c_a_subledger.sql:783), [aging readers](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0040_wave_c_c_tieout.sql:3932)). The fixed-asset register is the much closer house precedent ([register schema](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0003_books_core.sql:153), [baseline assertion](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0017_wave_b.sql:3700)).

## 4. Concrete failure modes

### A — convention and tooling only

- **Per-advance ambiguity:** overlapping advances plus a partial repayment cannot be allocated without an invented FIFO/LIFO rule.
- **False age:** the DB can show account transaction dates, but not the authoritative age of each remaining advance.
- **Payroll over-recovery:** a payroll deduction can reduce the person’s aggregate account but cannot prove which advance limit it is satisfying.
- **Historical retrofit loss:** later B adoption requires inferred allocations or synthetic opening rows.
- **COA identity problems:** duplicate or renamed per-person accounts can split one person’s history; account naming is not a staff master.
- **No semantic completeness gate:** a journal can hit the account without recording purpose, repayment kind, or advance linkage.
- **Chart explosion workaround:** avoiding ambiguity by creating one GL account per advance makes the COA itself a badly structured register.

A is acceptable only if Clara deliberately promises aggregate GL balances and nothing more.

### B — register over GL

- **Register/GL drift:** generic journals can bypass the register unless managed accounts are protected by an approval-time belt and same-transaction writers.
- **Temporal drift:** using `created_at` instead of posting/effective date gives wrong historical outstanding, repeating the class of error exposed by AF‑1.
- **Wrong allocation judgement:** automatic FIFO or memo matching can attach a repayment to the wrong advance. Require an explicit proposed-and-confirmed allocation.
- **Concurrent over-application:** two payroll/bank operations can both observe the same outstanding. Lock and recheck inside the writer.
- **Mutable-history corruption:** stored outstanding/status fields can diverge from application history. Derive them; reverse rather than update.
- **Mixed-account contamination:** if the account also carries director balances or unrelated loans, the tie-out becomes meaningless.
- **Identity duplication:** free-text staff names can create two subjects for one person. Use the dedicated account as the v1 stable key, then add an explicit staff-master mapping later.
- **Scope creep into claims/payroll:** B can accidentally become an expense-approval or installment-scheduling engine. Keep those workflows outside it.
- **Unexercised invariant:** an empty production table can rot unnoticed. The migration needs end-to-end synthetic acceptance and at least one real, consented staff case before calling the mechanic operational.

These are real costs, but bounded and testable.

### C — full subledger

- **The binary wall is structural, not cosmetic:** `domain` is checked as `('ar','ap')` in both tables, carried through composite foreign keys, classification, allocation, reversals, and readers ([domain and party constraints](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0037_wave_c_a_subledger.sql:726)).
- **No lawful party key:** `open_items.counterparty_id` is non-null and points to vendor/customer counterparties. A staff domain would require a forbidden employee counterparty or a polymorphic/nullable party redesign.
- **No lawful control class:** the existing decomposition and tie-out are based on payable/receivable control accounts; staff accounts are deliberately non-control.
- **Trade semantics leak:** invoice, bill, credit note, terms, supplier/customer statements, and trade aging become meaningless or misleading for staff.
- **Rule-pool contamination risk:** any shortcut through vendor identity reintroduces the exact failure WC‑R10 prevents.
- **Parallel-subledger duplication:** building a separate full engine avoids the schema wall but duplicates allocation, reversal, as-of, statement, and reconciliation machinery for very low volume.
- **Large regression radius:** widening `open_items` would touch Wave C’s hardest-won money invariants for no corresponding v1 benefit.
- **Payroll still gains little:** payroll needs an explicit application target, not trade-credit machinery.

C should remain rejected unless Clara someday undertakes a named, general non-trade open-item architecture project. It is not a Wave D staff-advance feature.

## Deciding evidence

Given the stated requirement to answer “who owes what since when,” I do not consider A versus B especially close: **B is the minimum truthful implementation**.

If the product requirement itself is still negotiable, inspect real client data for:

- employees with more than one advance before the first is cleared;
- advances settled across multiple claims, payroll runs, or bank transfers;
- one repayment intended to cover multiple advances;
- repayments without an unambiguous advance reference;
- claims exceeding the remaining advance;
- backdated claims or deductions;
- existing per-person accounts containing non-advance movements;
- stable employee identifiers in payroll files;
- reversals, write-offs, or employment termination with a balance outstanding.

If every sampled client shows at most one open advance per person, always settled one-to-one with explicit references, and Clara only needs aggregate balances, A is defensible. The first genuine overlapping or partially applied case is decisive evidence for B—and after that case has been booked under A, faithful retrofitting is already harder.

**Final ruling: B-lite—an append-only, per-disbursement staff-advance register with explicit GL-linked applications, DB-derived outstanding/age, managed-account protection, and an as-of GL tie-out. Leave AR/AP binary and leave employee counterparties nonexistent.**
