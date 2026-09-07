# Clara — Product

Clara is an AI-native Accounting OS for Malaysian accounting firms. She handles client
onboarding, bookkeeping, reconciliation, close, tax preparation and reporting in a shared
workspace with the accountant. The ambition is to remove 99%+ of manual bookkeeping labour
while keeping every entry attributable and the books reconcilable. This is a product goal,
not a measured result.

This document owns product intent. [Architecture](ARCHITECTURE.md) describes the implementation.

## Who it serves

The customer is a Malaysian accounting firm managing multiple client businesses. Firm staff use
Clara; their client businesses supply documents and do not have a login. Each client's books,
financial year, evidence and knowledge remain distinct inside the firm's private workspace.

The core problem is the complete accounting job: messy documents must become the correct client's
books, with matching subledgers, registers, reconciliation and reports. A correct journal with a
missing receivable or an unexplained balance is unfinished work.

## The experience

Clara is a working participant, with the workbench as the visible record of her work. The
accountant can inspect a source, answer a question, correct an entry or act on an object directly.
Removing the chat rail must still leave the work, its evidence and the available actions usable.

- **One workspace, two complementary surfaces.** Client work lives in journals, documents, bank,
  registers, knowledge, close and reports; Clara stays alongside in a docked rail. Firm-level
  navigation and the Needs-you inbox cover the whole portfolio.
- **Objects over chat transcripts.** Replies can contain typed questions, plans, documents,
  analyses and action cards. Reopening a card reads current authoritative state. A confirmed,
  reversed, failed or interrupted action looks different and has an honest next step.
- **Plans persist.** Onboarding and close have inspectable progress, outstanding decisions and
  recoverable interruptions. Refreshing or switching client must preserve the user's place.
- **Direct control.** Object actions and the command palette complement natural language. A user
  should not need to guess a prompt to reach an available operation.
- **Professional density.** Calm typography, clear grouping and concise copy support all-day
  work. Keyboard access, visible focus, readable contrast, zoom and reduced motion are part of
  usability. Meaning must not depend on colour alone.
- **Honest feedback.** Completion follows the server's receipt. Refusals explain the user's next
  step without exposing internal migration names or build plans. An unavailable feature is labelled
  accurately; an implemented backend without a usable surface remains incomplete.

## Autonomy and professional control

Clara may interpret evidence, classify documents, infer accounting treatment, calculate, propose
work and post within her authorised scope. Her own judgement can authorise routine bookkeeping;
she is not limited to drafting for a human. Her identity and model/version remain attributable.

Persisted accounting accepts more than a valid data shape: it checks tenant and client scope,
authority, evidence, balanced entries, period state and complete accounting consequences.
Formal report figures are reproducible from recorded inputs through versioned deterministic
evaluation. Exploration may use model calculations, with analysis clearly separated from a
formal report. The precise implemented boundary is in Architecture.

The intended human capability ladder is:

| Role | Product responsibility |
|---|---|
| Viewer | Read and export authorised information. |
| Bookkeeper | Upload, draft, match, answer Clara, approve and post any amount, including own drafts. |
| Admin | Bookkeeping plus client/firm configuration, opening approval and close operations. |
| Owner | Ownership, member administration, legal signatures and operator actions where separately eligible. |

Human actions use role checks and automatic receipts. Separate checker and attestation ceremonies
are being removed by an approved change; the current DB still contains some of those gates. This
gap must be closed in code, rather than described as already removed. An agent does not impersonate
a human for an explicitly human action, legal signature or filing submission.

## Product scope

| Area | Intended complete behaviour |
|---|---|
| Firm admission | Confirm email, accept the applicable legal documents, pass admission/rate checks, complete checkout and claim one firm workspace. Staff invitations and recovery are usable without operator intervention. |
| Client onboarding | An iterative interview captures identity, reporting basis, financial year and accounting needs. Confirmed facts reach their canonical records. Ongoing clients bring opening GL, AR/AP and fixed assets with a trial-balance tie-out. |
| Documents | Upload or attach once; retain the source, resolve client and type, extract evidence and show field-level source regions. Unassigned, ambiguous, failed and refiled documents have a recovery path. |
| Bookkeeping | Coding and posting complete the GL and required AR/AP, bank, asset and audit effects. Review, edit, approve, reverse and bulk work share the same accounting state. |
| Receivables/payables | Invoice/bill open items, settlement allocations, aging, statements and control-account tie-outs remain consistent across periods. |
| Bank | Import statements, match or book movements, explain exceptions and prove reconciliation. The accountant retains the explicit exclusion decision. |
| Assets and adjustments | Acquisitions, depreciation, disposal, recurring/reversing entries, prepayments and staff advances are traceable and tied to the books. |
| Close and continuity | Show readiness, complete preparation, close in order, carry forward once and support governed reopening. Missing evidence or coverage is distinguishable from a passed check. |
| Reporting | Trial balance, journals, GL, management accounts, aging and formal statement packs are reproducible, permissioned artifacts. A statement pack only claims a reporting framework when all required statements, notes and wording are supported. |
| Tax | Malaysia-specific SST registration/watch, taxable periods, treatments and returns, then draft tax computation and capital allowances. Preparation is in scope; a human reviews and files. Tax remains inactive in the beta. |
| Payroll and inventory | Code statutory payroll obligations and provide a deadline calendar; support periodic closing-stock adjustments. Full payroll processing and perpetual inventory are outside scope. |
| Knowledge | A source-linked client wiki improves Clara's judgement over time. Structured facts, identifiers, questions and receipts carry durable decisions; narrative cannot grant permissions. |
| Activity and exceptions | Show attributable actions, failures and recovery across clients. Notification-only proactive wakes stay distinct from authorised background work. |
| Commercial operation | Firm subscriptions, seats, active-client capacity, a shared AI allowance, overage and invoicing. Beta checkout is present; paid pricing and usage billing remain unfinished. |

## Trust requirements

1. **Private firms, explicit clients.** Cross-firm access is refused. Client attribution is recorded
   and validated; conflicting identifiers or unresolved ambiguity require clarification. Never
   fabricate a registration number, TIN, account code or source identifier. Name-only records stay
   name-only until evidence supports an update.
2. **Evidence and accountability.** A document-backed entry validates its source reference and hash.
   Every accounting change records who acted and what changed. Corrections preserve posted history
   through reversals or supersession and bind approval to the revision reviewed.
3. **Correct complete books.** Monetary amounts use exact minor units. Entries balance, period
   boundaries hold, and subledger consequences accompany the posting. Derived views can catch up
   through the event system; their freshness must be visible.
4. **Resumable work.** Interruptions and retries preserve progress without duplicate postings.
   Repeated delivery, a disconnected browser or a restarted runtime must not create a second effect.
5. **Controlled disclosure.** Client information is disclosed only for authorised purposes. The
   approved direction is one firm declaration at the DPA stage supplying onboarding consent
   evidence, with purpose activation and dispatch checks retained. This integration is unfinished.
   Vendor trace export remains off pending its separate disclosure and privacy review.
6. **Untrusted content stays data.** Source documents, OCR, wiki pages and web content inform the
   agent; they cannot change her permissions or become system instructions.

The operator is a separate support capability, not a rank above another firm's owner. It covers
registration/payment support and estate wake-source controls; it does not open other firms' books.

## Boundaries and later scope

Single-entity books per client are the present scope. Group consolidation, external-ERP posting,
client logins, a payroll engine and perpetual inventory are not planned as part of the current
core. App and agent operations use the deployed schema; schema evolution belongs to engineering.

Inbound MyInvois XML parsing exists. API pull, outbound issuance, foreign currency and first-class
payroll-document ingestion remain future decisions. Supplier credit notes and cash-purchase
specialisation remain explicit gaps rather than silently assumed coding lanes. Staff allowances,
self-billed obligation detection, withholding-tax mechanics and the statutory calendar stay on the
future-product list in Work.

Tax schedules, thresholds, forms and legal text are effective-dated inputs, verified against
official sources when that feature is implemented or activated. This PRD does not cache tax rates
or substitute for a professional legal/accounting review.

## Acceptance

A complete release lets a firm go from signup to an active client, process representative invoices
and bank statements, correct and reconcile the books, close a period and obtain a reproducible
management report through the product. The same journey must expose its audit trail and recover
from refusals without an engineer writing database rows.

Verification must include cross-firm isolation, live role changes, retry/restart behaviour,
source attribution, accounting tie-outs and accessible browser flows. Fixture/unit success,
deployed bytes and an observed user journey are different kinds of evidence. The current beta's
limitations and the next release's unfinished acceptance work are recorded in [Work](WORK.md).
