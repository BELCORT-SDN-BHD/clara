## Verdict: amend

Keep **refuse-until-reversed as the database invariant**, but reject the fully manual unwind as the primary user flow.

Ship a hybrid:

1. A naked attempt to retire A’s filing refuses while any live posted A entry cites it.
2. The refusal opens a guided, immutable correction plan.
3. A checker approves the exact plan once.
4. One bounded transaction creates the individual reversals, retires A’s filing, ensures B’s filing, withdraws affected drafts, and opens B’s recode task.

In short: **one reviewed correction event, many separately traceable reversals**.

This preserves your safety principle while adopting the best part of alternative 2. I would not ship an opaque `correct_wrong_client(A, B)` button that discovers its own blast radius at execution time.

## The alternatives

| Alternative | Best argument | Verdict |
|---|---|---|
| 1. Refuse, then manually unwind | Smallest trusted write surface; every reversal is explicit; impossible to erase provenance prematurely. | Correct as the low-level guard, inadequate as the month-end workflow. |
| 2. One atomic correction | Eliminates omissions and half-completed corrections; one reason and approval tell a much clearer audit story. | Strongest alternative, but only after an immutable preview and checker approval. |
| 3. Cascade drafts, refuse posted | Drafts are non-authoritative, so removing them reduces clerical work. | Reject silent discard. Guided bulk **withdrawal with reason** is acceptable; deletion is not. |
| 4. Correction case: preview → approve → atomic execute | Combines structural refusal, batch ergonomics, exact approval, and a parent audit narrative. | Recommended. |

## Strongest counter-argument to your position

Your proposal minimizes machinery but transfers complexity to the accountant.

For a statement supporting 70 entries, it creates roughly 73 opportunities to stop halfway, miss an entry, use inconsistent reasons, or forget the B recode. The final unfile guard prevents one invalid state, but it does not ensure that the entire correction is completed correctly.

Bulk correction is not inherently less auditable. An opaque bulk verb is less defensible; an enumerated, hash-bound batch can be **more** defensible because the auditor sees:

- one correction case and shared explanation;
- the exact 70 originals approved for correction;
- 70 independently linked reversal journals;
- maker and checker;
- before/after filings;
- completion status and exceptions.

Xero’s bulk recoding history follows this model: it records the affected transaction count, date range, approver, per-transaction outcome, and an audit report. Xero also reverses the original journal behind the scenes when a transaction is updated or reversed. [Xero recoding history](https://central.xero.com/s/article/View-transaction-information-and-recoding-history), [Xero journal report](https://central.xero.com/s/article/Journal-report).

## What incumbents actually suggest

There is no exact incumbent analogue for Clara’s cross-client, content-addressed filing model, so this is an inference from adjacent correction flows:

- QuickBooks unmatch disconnects the wrong relationship and returns the source transaction to Pending. For reconciled transactions it warns of wider impact and directs users toward accountant involvement. Its full-reconciliation undo is a privileged compound action with consequence disclosure and explicit acknowledgement—not purely manual unwinding. [QuickBooks unmatch](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-registers/unmatch-downloaded-bank-transactions-move-another/L71oaBb86_US_en_US), [undo entire reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/balance-sheet/undo-entire-reconciliation-quickbooks-online/L8t48Iv10_US_en_US).

- Xero unreconcile preserves both the account transaction and statement line and removes only their connection. Remove-and-redo is stronger: it removes the generated transaction while leaving the evidence available for correct reconciliation. Closed periods block that operation. [Xero unreconcile](https://central.xero.com/s/article/Unreconcile-an-account-transaction), [Xero automatic reconciliation corrections](https://central.xero.com/s/article/How-to-use-automatic-bank-reconciliation).

- Dext’s republish flow is deliberately stepwise across system boundaries: correct/delete the previously published ledger transaction first, then clear Dext’s publishing marker and republish. Dext retains item-level submission, publishing, approval, and archive history. [Dext republish](https://help.dext.com/en/articles/416728-how-to-republish-an-item), [Dext item audit trail](https://help.dext.com/en/articles/105676-how-to-use-the-item-details-page-in-dext).

The lesson is not “incumbents always force manual unwind.” It is: **preserve evidence, expose consequences, restrict authority, and group bulk corrections without concealing their child effects.**

## Recommended database shape

### 1. Retire filings; never delete them

`document_filings` should be historical:

```text
id
firm_id
document_id
client_id
filed_at / filed_by
retired_at / retired_by
retirement_reason
correction_id
revision_token
```

Use a partial unique index for one active filing per `(document_id, client_id)`. “Unfile” means setting `retired_at`, not deleting the row. That preserves the fact that A’s original entry passed provenance when posted.

Slice 5 must replace the current exact `documents.client_id` provenance check with filing validation. The present schema freezes document attribution [0003_books_core.sql](C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0003_books_core.sql:64), while current provenance requires the document’s client to equal the entry’s client [0004_governed_fns.sql](C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0004_governed_fns.sql:104).

### 2. Preserve the primitive refusal

`retire_document_filing(filing_id, reason, expected_revision, op_key)` must lock the filing and refuse when this set is non-empty:

```sql
status = 'approved'
and reversal_of is null
and reversed_by is null
and client_id = filing.client_id
and document_id = filing.document_id
```

That predicate matters because Clara keeps reversed originals `approved`; reversal state is `reversed_by IS NOT NULL` [0003_books_core.sql](C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0003_books_core.sql:98).

Return structured blockers: entry reference, posting date, period state, risk flags, and pending reversal status. For a huge set, return the count plus a cursor/read-function link rather than stuffing everything into an exception.

Live drafts should also block the naked primitive. They would otherwise become stranded or later fail provenance.

### 3. Add an immutable correction plan

Minimal tables:

```text
filing_corrections
  document, from_client, to_client, reason
  maker, checker, status
  plan_hash, books_version
  created_at, approved_at, completed_at

filing_correction_items
  correction_id, entry_id
  entry_state_hash
  action: reverse | already_reversed | withdraw_draft
  reversal_id, outcome
```

`preview_wrong_client_correction(...)` is read-only and DB-computes the blast radius.

`propose_wrong_client_correction(...)` persists the exact set and its hash but changes no books. Treat every cross-client correction as high-stakes, regardless of amount.

`approve_wrong_client_correction(correction_id, plan_hash, attestation, op_key)` is the single final writer. It must:

1. Require a different eligible checker, or Clara’s existing solo-firm attestation.
2. Lock the source filing and affected entries in deterministic order.
3. Reject if the active citation set or books version differs from the approved plan.
4. Create one reversal mirror per unreversed original, with the shared reason plus `correction_id`.
5. Reverse every required subledger, reconciliation, tax, and register consequence—not merely GL lines, per Clara’s whole-job rule [PRD](C:/Users/zhant/Desktop/clara-rebuild/docs/prd/PRD.md:117).
6. Stamp each child reversal with the plan maker and approving checker.
7. Withdraw, rather than delete, A’s live drafts.
8. Ensure B’s active filing idempotently.
9. Retire only A’s filing.
10. Insert B’s recode task and append one aggregate correction event plus the ordinary child reversal events.

Everything commits or nothing does. The recode task should be a DB row; delivery can use Clara’s outbox. No external OCR or notification call belongs inside the transaction.

Because this is one shared Postgres, a saga adds little value. AWS notes that sagas introduce debugging and compensation complexity; compensation is appropriate when a single atomic transaction is unavailable. [AWS saga guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/saga-pattern.html). For exceptionally large sets, use resumable reversal batches while keeping A filed, then perform a small atomic finalizer.

## UX skeleton

1. User selects **Remove from client A**.
2. Clara responds: “Cannot remove: 37 active posted entries and 4 drafts rely on this filing.”
3. Primary action: **Review wrong-client correction**.
4. Dedicated review page shows:

   - A → B;
   - exact entries, dates and periods;
   - totals calculated by the DB;
   - tax/closed-period/subledger impacts;
   - 4 drafts that will be withdrawn;
   - whether B is already filed;
   - resulting B recode task;
   - required checker.

5. Maker enters one required reason and submits.
6. Checker sees the same hash-bound plan and selects **Reverse 37 entries and move filing**.
7. Completion receipt links the parent correction, every reversal, retired A filing, active B filing, and recode task.

A wizard is preferable to a confirmation dialog because this is a complex multi-step decision. GitHub’s design guidance similarly reserves dialogs for bounded decisions and recommends dedicated flows for complex or multi-step consequences, with explicit blast-radius language. [GitHub Primer confirmation guidance](https://primer.style/product/components/confirmation-dialog/guidelines/).

## Edge cases

- **Partially reversed set:** display already-reversed originals separately; operate only on `reversed_by IS NULL`. Any state change after proposal makes the plan stale and requires re-review—never silently skip it.

- **Pending reversal drafts:** either adopt one only if its exact hash matches the plan, or explicitly supersede it. Never create invisible duplicate reversal attempts.

- **Maker-checker:** the correction is always high-stakes. One checker approval may cover the exact batch, but each generated reversal still records maker/checker separately. This is compatible with bulk approval; it is not a waiver.

- **Draft entries:** no cascade deletion. The guided correction may bulk-withdraw them with the correction reason. Re-coding for B starts from fresh B attribution and B’s COA.

- **A and B already filed; only A is wrong:** `ensure B` is a no-op. Retire only A and touch only A’s entries. “Swap” is the wrong abstraction in a multi-client model.

- **Adding B:** it should not be blocked merely because A has citations, but “always allowed” is too broad. B must be an active same-firm client and have a human/rule-backed resolution. An agent must not freely add arbitrary same-firm filings.

- **Closed periods or filed returns:** preview must expose them. If policy requires reopening, amended tax work, or a later-period correction date, execution remains blocked until that authority exists.

- **Concurrent posting:** posting/approval must acquire a shared lock on the active filing; retirement takes the conflicting lock. Otherwise a new A posting can slip in between the blocker query and retirement.

The final principle is: **the guard protects accounting truth; the correction case protects humans from the guard becoming clerical punishment.**