# Decision brief — AP-accrual vs mirror-the-human (direct-to-bank) for the Rome Properties FY2025 beta replay

**Frame.** The human accountant booked every supplier bill straight to bank at payment date (no AP
subledger; Trade Creditors appears in the GL export only as a period-end reconciliation *plug*, never
posted from a bill). Clara's ratified design books bills as **Dr expense / Cr Accounts Payable** with a
vendor subledger — which requires adding a postable **AP control account** + a **rounding account** to the
migrated chart, labelled "Clara augmentations". Question: sign off on strict accrual-to-AP, or mirror the
human's direct-to-bank for the beta? Short answer: **post accrual-to-AP (it is the standards-correct,
product-standard behaviour), but score the eval on the expense leg with an explicit period-boundary
carve-out.** The two are not in tension — posting policy and eval-scoring policy are separable.

---

## Q1 — Malaysian statutory reality (MPERS): is accrual required? Is direct-to-bank bookkeeping OK?

- **The statutory statements MUST be accrual.** MPERS para **2.36**: an entity shall prepare its financial
  statements, *except for cash-flow information*, using the **accrual basis** of accounting. A Sdn Bhd
  (private, no public accountability, non-financial) reports under MPERS and directors must present accounts
  giving a **true and fair view** under the Companies Act 2016. So the *output* is accrual, non-negotiable.
- **But the day-to-day bookkeeping method is not mandated.** The near-universal SME practice is to record on
  a **cash / direct-to-bank basis during the period and convert to accrual at period-end** via adjusting
  entries (accruals, prepayments, creditors, debtors). This is a recognised, legitimate workflow — the
  shortcut is fine *provided* period-end adjustments bring the accounts to accrual.
- **Key convergence fact for a closed year.** For any bill *received and paid within FY2025*, direct-to-bank
  and accrual-to-AP give the **identical expense account, amount, and period**, and identical year-end
  balance sheet (AP nets to zero once paid). They diverge **only** for bills that straddle the year-end
  (incurred FY2025, paid FY2026, or vice-versa) — and there **accrual is the correct answer**.
- **The plug is the tell.** That the human had to carry Trade Creditors as a *plug* is itself evidence that
  pure direct-to-bank did **not** fully represent the year — the accountant hand-approximated creditors to
  force the statutory accounts to accrual. Clara's real AP subledger does *properly and auditably* what the
  plug did by hand. That is a genuine quality upgrade, not a deviation from the client's intent.

## Q2 — What do the mainstream products enforce?

- **Both paths are first-class and sanctioned in every product.** The determinant is *whether a payable
  interval exists*:
  - **Xero** — a **Bill** (received on credit terms) always posts **Dr expense / Cr Accounts Payable**
    (a locked system control account); payment is a separate event knocking off the bill. **Spend Money**
    and bulk **Cash Coding** book **Dr expense / Cr bank** directly, for already-paid items and non-invoice
    outflows (bank charges, tax, salaries). Xero's own guidance: use **Bills** for supplier invoices on
    credit / AP tracking; use **Spend Money** for immediate cash payments.
  - **QuickBooks Online** — "Enter Bill" → AP; "Expense/Cheque" → direct to bank. QBO auto-creates the AP
    control account the first time a bill is entered.
  - **MYOB** — "Enter Purchase" as a Bill → Trade Creditors; "Spend Money" → direct.
  - **AutoCount / SQL Account (the Malaysian incumbents)** — **Purchase Invoice** debits expense/inventory
    and credits the supplier under **Trade Creditors** (creditor control); **Cash Purchase** / **A/P Payment
    + payment voucher** handle on-the-spot or settlement. Same fork.
- **Recommended practice:** supplier *invoices* (credit terms) → Bill → AP; *paid receipts* / petty-cash /
  no-credit-interval spend → direct-spend path. No mainstream tool forces *everything* through AP, and none
  treats direct-spend as "wrong" for paid items.

## Q3 — Chart-of-accounts practice: is a required system AP + rounding account standard?

- **Yes, and it is universal.** Every product ships **mandatory, non-deletable system control accounts**:
  - Xero **locks** system accounts — **Accounts Payable, Accounts Receivable, Rounding** carry a padlock,
    cannot be deleted/archived (only edited), and always balance to the sum of approved bills/invoices.
  - QBO auto-provisions AP/AR on first use; **Rounding** accounts are auto-created by most ERPs and
    **cannot be deleted** (rounding is an unavoidable by-product of tax/multi-line arithmetic).
  - AutoCount/SQL require a creditor/debtor control account to operate the AP/AR modules at all.
- **Migration norm:** when a migrated chart lacks a needed control/suspense/rounding account, the standard
  practice is to **add it as a labelled system account** (conversion-suspense to hold unknowns, control
  accounts to run the subledgers) and map every legacy code to its new equivalent. Adding "Clara
  augmentations" — clearly flagged, ideally not user-postable — is exactly how migrations introduce system
  accounts. It respects the migrated chart (originals preserved + mapped) while making the ledger operable.

## Q4 — Is the replay-comparison methodology sound (comparing on the expense leg)?

- **Coding to AP-then-payment is the more correct representation** of an incurred-then-settled purchase, and
  is what the statutory accrual output requires. So Clara being accrual is the right target, not a handicap.
- **Comparing on the expense leg is a sound eval design** — arguably the *right* one — because it isolates
  the judgment you actually want to grade (which expense account, what amount, which period) from the
  *representation* choice (AP-and-payment vs direct-spend), which is mechanical and nets out. The cash leg is
  not graded against the human's posting pattern; it ties out to the **bank statement** (the real ground
  truth) via reconciliation.
- **One required carve-out.** For bills that **straddle the year-end**, accrual (Clara) records the expense
  in the *incurred* period while the human recorded it in the *paid* period — a legitimate period
  difference. A naive expense-leg diff would flag these as "mismatches" when **Clara is the more correct
  one**. The eval must classify these as *expected divergence / Clara-more-correct*, quantify them, and
  surface the (small) set to the owner — not count them as errors. Miss this and you penalise Clara for
  being right.

---

## Steelman A — strict accrual-to-AP (the ratified design)

1. **Standards-correct & product-standard.** MPERS 2.36 output is accrual; every mainstream tool posts a
   supplier bill to AP. If Clara is the go-forward source of truth (not a one-off replay), this is simply
   how a bill is booked.
2. **Real control upgrade.** A vendor subledger gives creditor aging, who-owes-what, duplicate-payment
   prevention, and an audit trail — none of which direct-to-bank provides. It replaces the human's *plug*
   with an **auditable posted figure**.
3. **Correct at the boundary.** Straddle bills (received Dec, paid Jan) land in the right year — the whole
   point of accrual, and the exact thing the human's shortcut misstates.
4. **The chart augmentation is standard, not a liberty.** Locked/labelled AP + Rounding mirrors Xero/QBO/
   AutoCount exactly.

## Steelman B — mirror the human (direct-to-bank) for the beta

1. **Tighter replay diff.** The beta validates against a known-good human ledger; a structurally different
   posting pattern (AP movements + payment knock-offs) adds legs that complicate a line-by-line comparison.
2. **Direct-spend is fully sanctioned**, not "wrong" — for genuinely pay-on-receipt spend it is the
   *recommended* path. If the client truly operates cash-in-hand, mirroring is faithful to their process.
3. **No chart surprise.** Leaves the migrated chart untouched — least surprising for the owner's review.
4. **Simplest reconciliation** for same-day-pay lines: expense leg *and* bank leg align 1:1 with the human.

---

## Recommendation (with conditions)

**Post accrual-to-AP (Steelman A) as the standard; do NOT force the eval onto posting-mechanism parity.**
Accrual-to-AP is the accounting-correct, standards-mandated, product-standard behaviour and delivers the
creditors subledger the plug only faked. Precedence rule (accounting-correctness > backend > design) points
the same way. Conditions:

1. **Score on the expense leg** (account + amount + period), *not* on AP/payment mechanism. Tie the cash leg
   to the **bank statement** via reconciliation, not to the human's posting pattern.
2. **Carve out period-boundary accruals.** Bills incurred FY2025 / paid FY2026 (and vice-versa) legitimately
   differ from the human's payment-date posting → classify as **expected / Clara-more-correct**, quantify,
   and show the owner the set. Do not count as errors.
3. **AP control + Rounding as clearly-flagged system accounts** (non-user-postable / locked, à la Xero).
   Verify they **net to zero at 31 Dec 2025** in the replay (all FY2025 bills paid → AP closes to nil), so
   Clara's balance sheet matches the human's (no residual creditors) except where a real unpaid-at-year-end
   creditor should exist — in which case Clara replaces the plug with a posted figure (surface this).
4. **Document the augmentation** in the migration record (why the chart gained accounts the client never
   had); keep the original chart mapping intact and visible to owner/auditor.
5. **Allow a sanctioned direct-spend path** for genuinely pay-on-the-spot classes (petty cash, cash
   purchases) — don't route spend through AP where no credit interval exists. Determinant = *is there a
   payable interval?* (invoice-then-pay → AP; pay-on-the-spot → direct), mirroring Bill-vs-Spend-Money.

**Net:** accrual-to-AP is right; the only real risk is an eval that mistakes correct accrual timing for
error. Fix that with the expense-leg + boundary-carve-out design above, and both objectives (statutory
correctness *and* a clean, fair replay comparison) are satisfied without conflict.

---

## Sources

- MPERS accrual basis (para 2.36) & concepts — [PwC MPERS alert](https://www.pwc.com/my/en/assets/publications/alert124-mpers.pdf), [MASB ED80 MPERS full](https://mail.masb.org.my/pdf_file/MASB%20ED80-MPERS-Full%20version.pdf), [MIA MPERS FAQs](https://mia.org.my/wp-content/uploads/2022/07/MIA_MPERS_FAQs.pdf), [MASB private-entity standards](https://www.masb.org.my/pages.php?id=20)
- Companies Act 2016 / true-and-fair / MPERS for Sdn Bhd — [ASEAN Briefing: audit & tax compliance](https://www.aseanbriefing.com/doing-business-guide/malaysia/taxation-and-accounting/audit-tax-compliance-malaysia), [ASEAN Briefing: accounting standards](https://www.aseanbriefing.com/doing-business-guide/malaysia/taxation-and-accounting/accounting-standards-malaysia)
- Cash-basis bookkeeping → period-end accrual conversion — [Double Entry Bookkeeping: cash to accrual](https://www.double-entry-bookkeeping.com/bookkeeping-basics/cash-to-accrual-conversion/), [Bench: convert cash to accrual](https://www.bench.co/blog/accounting/converting-cash-basis-to-accrual), [NetSuite: cash vs accrual](https://www.netsuite.com/portal/resource/articles/financial-management/cash-basis-accrual-basis.shtml)
- Xero Bill vs Spend Money / Cash Coding — [Joanna Bookkeeping](https://joannabookkeeping.co.uk/should-i-use-the-spend-money-or-bill-feature-in-xero/), [Bean Ninjas: cash coding vs bills](https://beanninjas.com/blog/xero-accounting-cash-coding-versus-bills-which-is-better/), [Virtual Heights: spend money vs bills](https://vhaccounting.ca/2022/11/30/understanding-the-difference-between-spend-money-and-bills-in-xero/)
- Xero locked/system accounts (AP/AR/Rounding cannot be deleted) — [Xero Central: locked & system accounts](https://central.xero.com/s/article/Locked-and-system-accounts-in-your-chart-of-accounts-GL)
- Rounding is an auto-created, non-deletable system account — [Aptora: rounding account](https://www.aptora.com/help/aptora-360/roundingaccount)
- AutoCount purchase-invoice → creditor control vs cash purchase / A/P payment — [AutoCount purchase invoice help](https://www.autocountsoft.com/products/ac_accounting/helpfile/purchase_invoice.htm), [AutoCount A/P payment help](https://www.autocountsoft.com/products/ac_accounting/helpfile/a_p_payment.htm), [CY-GRP creditor maintenance](https://www.cy-grp.com/autocount-v2-0/chapter-6-creditor-maintenance/)
- Migration: system/suspense accounts, conversion balances, chart mapping — [Xero: enter conversion balances](https://central.xero.com/s/article/Enter-conversion-balances), [AccountsPortal: convert from another system](https://www.accountsportal.com/docs/convert-from-another-accounting-system/215547183), [Receipt-Bot migration checklist](https://www.receipt-bot.com/blog/switching-accounting-software-a-practical-migration-checklist-for-accounting-firms)
