# Clara — Product

Clara is an AI-native Accounting OS for Malaysian accounting firms. She handles client
onboarding, bookkeeping, reconciliation, close, tax preparation and reporting in a shared
workspace with the accountant. The ambition is to remove 99%+ of manual bookkeeping labour
while keeping every entry attributable and the books reconcilable. This is a product goal,
not a measured result.

This document owns product intent. [Architecture](ARCHITECTURE.md) describes the implementation.
Accepted product decisions belong here when settled, including before implementation. The
formal feature spec and its implementation tickets refine acceptance; they do not silently
replace this intent. [Work](WORK.md) links the active phase, decisions and evidence.

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
- **Work survives conversations.** Starting a new Clara conversation resets its conversational
  context while preserving ongoing accounting work, accounting records and confirmed client
  knowledge. Cancelling work and changing knowledge are separate actions. The refresh direction
  is a filterable work list with a detail view and questions answerable in place; the rail links
  to that same work. This shared interaction contract is not yet fully implemented.
  Cancellation stops remaining work and retains completed results; reversing completed postings
  requires a separate explicit correction or reversal operation.
  If an atomic operation admitted before cancellation is still settling, show stopping until
  it settles; only then report terminal cancellation, retaining every completed receipt.
  In a batch, independent items continue while affected items and their dependants wait. Aggregate
  progress distinguishes completed, waiting and failed items rather than treating the whole batch
  as either finished or stopped.
  Conversation management includes new, switch, archive/restore and actual deletion of ordinary
  conversation text. Necessary work evidence and accounting decision records survive deletion;
  hiding an intact transcript is not sufficient to fulfil the deletion action. Retained basis
  identifies the relevant instruction/facts, accepted answers, authority, source references and
  results, without retaining the entire conversation as a substitute. The deletion flow explains
  what remains and why; detailed storage propagation must be specified before implementation.
- **Direct control.** Object actions and the command palette complement natural language. A user
  should not need to guess a prompt to reach an available operation.
- **Work-first home and clear destinations.** The client home prioritises questions needing a
  person, work in progress and recent completed outcomes, with concise financial context. Work
  tracks execution and its questions; Accounting groups the underlying books and business
  objects; Reports presents outputs. These views link to the same records. A firm overview
  shows the authorised client portfolio, not an implicitly consolidated client ledger.
  The selected refresh direction combines A's client dashboard with B's Work list/detail.
  Financial context consists of book cash/bank, receivables, payables and period profit,
  supported by six-month income/expense and cash charts, due-date outstanding buckets, and
  measured reconciliation/close readiness. The financial selector defaults to calendar month
  to date in Malaysia; questions stay visible across periods. Exact definitions, comparison
  windows, coverage and refresh acceptance are in the [dashboard contract](plan/active/refresh-2026-09-08-product-spec.md#63-首页指标期间与数据新鲜度产品合同待实现).
  These are intended capabilities; synthetic prototype values do not establish existing reads.
  The frontend refresh covers every in-scope journey and object action, including onboarding,
  access management, accounting, Knowledge, reporting and settings. The detailed
  [frontend interaction contract](plan/active/refresh-2026-09-08-frontend-interaction-contract.md)
  maps all 34 journey groups to concrete steps, layouts, states and recovery requirements.
  Shared visual samples do
  not replace each journey's backend/state mapping and keyboard, narrow-screen and recovery
  acceptance. Existing entry points must be accounted for when moved or retired.
- **Professional density.** Calm typography, clear grouping and concise copy support all-day
  work. Keyboard access, visible focus, readable contrast, zoom and reduced motion are part of
  usability. Meaning must not depend on colour alone.
- **Honest feedback.** Completion follows the server's receipt. Refusals explain the user's next
  step without exposing internal migration names or build plans. An unavailable feature is labelled
  accurately; an implemented backend without a usable surface remains incomplete.

## Autonomy and professional control

Clara is agentic by default for every firm and user. She interprets evidence, classifies documents,
infers accounting treatment, calculates and executes accounting work, including posting, when
information and authority are sufficient. Ordinary work does not require enabling an automation
mode, selecting a full-auto preset or turning on individual abilities. She asks when necessary
information is missing or conflicting, or an unresolved decision prevents correct execution. Her
identity and model/version remain attributable; member permissions and accounting constraints
still apply to each action.

Autonomy covers the complete in-scope accounting outcome and its downstream effects. Clara
identifies affected entries, open items, allocations, assets, plans, periods and report freshness,
then completes the necessary related operations within current authority. A successful tool call
or a balanced JE alone does not establish that the business work is complete. Required coupled
accounting records commit together; independent steps can finish while affected dependencies wait.
Recoverable technical failures are retried without duplicating successful effects. Unresolved
technical failures remain visible as blocked or failed work, rather than becoming questions the
user cannot answer. Missing facts, conflicts and necessary decisions use the shared clarification
interaction; an answer cannot waive hard accounting constraints or grant absent permissions.

The refresh direction confirmed on 2026-09-08 is that an attributed document upload begins
processing automatically. When information is sufficient, Clara may post or match within the
client's authorised scope; missing information or a required decision interrupts that work.
Firm conversations may direct work across authorised clients. Every accounting execution records
one explicit client; ambiguous attribution requires clarification. Current runtime/tool
coverage does not yet implement this consistently across entry points.

An authorised user's direct instruction may initiate accounting with or without document
attachments. Sufficient facts supplied in the conversation can form its recorded basis; missing
attachments alone do not force a draft or an extra approval. Clara records the instruction,
relevant facts and actor without inventing a source document or treating a user statement as
independently verified evidence. Missing facts or conflicts require a targeted question.

The normal autonomous behaviour includes completing reconciliation and finalising a period close
when their readiness and authority conditions hold; there is no separate full-auto enablement
prerequisite. This is intended behaviour, not a claim that current actor checks permit it.
An unexplained bank receipt remains pending with a question; Clara neither guesses an allocation
nor automatically posts a suspense entry.

An explicitly authorised client month-end or year-end close schedule may start preparation when
due and complete/lock only when the required readiness and authority conditions hold. Missing
prerequisites produce questions. Staff may also initiate close through a conversation or Work.
The client has established expected evidence and close requirements, including applicable accounts
and coverage periods. Clara checks these requirements and asks about exceptions; she does not
require a repetitive human completeness confirmation for every period. A due date triggers work,
not proof of readiness. Default autonomy does not create an unrequested recurring schedule.

An authorised human may explicitly accept an individual missing-evidence readiness exception
with a recorded reason and visible close exception. Clara may then continue under the valid close
authority if all other conditions hold. She cannot accept such an exception on the human's behalf,
turn it into a standing waiver, or waive failed hard accounting identities. A check that is only
measurable at finalisation remains pending final validation until actually verified.

A late document affecting a locked period causes Clara to explain the impact and propose how
to handle the period. The user decides whether to reopen it or make an allowed later-period
adjustment; default autonomy does not by itself authorise that reopening.

Clara may correct her own erroneous postings in an open period
through a source-backed reversal and correction within the original authority, then notify the
user. A locked period, changed authority or uncertain treatment requires a question. Corrections
retain the original posted history.

Corrections also resolve affected allocations, outstanding balances and asset or plan records;
creating a mirror JE is not sufficient. A downstream locked-period effect or a new, unauthorised
plan requires the corresponding decision. Derived views expose their freshness. Previously issued
report artifacts retain their original contents and basis; affected outputs are visibly outdated
or superseded, with updated versions generated where supported and within the work's authority.

Sufficient evidence and an established policy may authorise creating the associated asset or
other business record. A new plan that will keep creating future entries, such as depreciation,
amortisation or recurring adjustments, needs an explicit user instruction or an existing
authorisation rule. A schedule records that authority; a conversation reset does not remove it.

When acquisition facts are sufficient but depreciation method or useful life is missing, Clara
records the acquisition and linked asset, then asks for the missing particulars. The acquisition
can be complete while depreciation setup remains pending; she does not invent a policy or mark
the whole dependent workflow complete. Sufficient explicit plan authority does not require an
additional first-occurrence approval merely to earn automatic execution. Historical catch-up
needs a clear authorised scope; a future plan alone does not authorise retrospective charges.

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

Human actions use role checks and automatic receipts. Authorised manual posting with sufficient
facts and valid accounting checks does not require a default second-person checker or an extra
attestation ceremony. Direct user confirmation supplies the current business intent; it is not an
additional approval stage. Human and agent entry points preserve the same business meaning and
required related effects. The current DB still contains separate checker and attestation gates;
removing the extra normal-posting ceremonies is an implementation requirement, not a claim that
the migration has occurred.
Explicit acceptance of a close evidence exception remains a separate recorded decision.
An agent does not impersonate a human for an explicitly human action, legal signature or filing
submission.

Accounting work belongs to its firm and client rather than its initiating conversation. An
expired question or a departed employee does not erase, finish or cancel that work. If its current
firm/client authority remains valid, work can continue; work relying on an invalidated personal
delegation waits until a currently authorised staff member takes responsibility. An answer alone
does not grant additional authority. An unanswered or expired question leaves affected work in
Needs you until the missing facts/decision are supplied or the work is explicitly cancelled.
On resumption, Clara rechecks current facts and authority; independently completed effects remain.

## Product scope

| Area | Intended complete behaviour |
|---|---|
| Firm admission | Confirm email, accept the applicable legal documents, pass admission/rate checks, complete checkout and claim one firm workspace. Staff invitations and recovery are usable without operator intervention. |
| Client onboarding | An iterative interview captures identity, reporting basis, financial year and accounting needs. Confirmed facts reach their canonical records. Ongoing clients bring opening GL, AR/AP and fixed assets with a trial-balance tie-out. |
| Documents | Upload or attach once; retain the source, resolve client and type, extract evidence and show field-level source regions. Unassigned, ambiguous, failed and refiled documents have a recovery path. |
| Bookkeeping | Coding and posting complete the GL and required AR/AP, bank, asset and audit effects. Review, edit, approve, reverse and bulk work share the same accounting state. |
| Receivables/payables | Invoice/bill open items, settlement allocations, aging, statements and control-account tie-outs remain consistent across periods. |
| Bank | Import statements, match or book movements (including observed direct debits), explain exceptions and prove reconciliation. Match an already recorded payment without duplicating its cash entry. Exclusion requires an explicit, attributable decision under the applicable authority; automatic completion does not authorise unexplained exclusions. |
| Assets and adjustments | Acquisitions, depreciation, disposal, recurring/reversing entries, prepayments and staff advances are traceable and tied to the books. |
| Close and continuity | Show readiness, complete preparation, close in order, carry forward once and support governed reopening. Missing evidence or coverage is distinguishable from a passed check. |
| Reporting | Trial balance, journals, GL, management accounts, aging and formal statement packs are reproducible, permissioned artifacts. A statement pack only claims a reporting framework when all required statements, notes and wording are supported. |
| Tax | Malaysia-specific SST registration/watch, taxable periods, treatments and returns, then draft tax computation and capital allowances. Preparation is in scope; a human reviews and files. Tax remains inactive in the beta. |
| Payroll and inventory | Code statutory payroll obligations and support periodic closing-stock adjustments. The statutory deadline calendar remains future scope, as specified below. Full payroll processing and perpetual inventory are outside scope. |
| Knowledge | A source-linked client wiki improves Clara's judgement over time. Structured facts, identifiers, questions and receipts carry durable decisions; narrative cannot grant permissions. |
| Activity and exceptions | Show attributable actions, failures and recovery across clients. Notification-only proactive wakes stay distinct from authorised background work. |
| Commercial operation | Firm subscriptions, seats, active-client capacity, a shared AI allowance, overage and invoicing. Beta checkout is present; paid pricing and usage billing remain unfinished. |

Chat, files/bank statements and direct Accounting actions share the same bookkeeping and settlement
operations for observed debits. Explicit instructions or existing authority rules can establish a
recurring accounting plan; observing repeated debits alone does not authorise one. Such a plan
schedules accounting entries, not bank payments. The UI and Work results must keep these meanings clear.

Client Knowledge is the unified product surface for client facts, identities, aliases and durable
preferences. Explicit user-provided information is saved automatically and can be corrected or
withdrawn. Extracted facts retain their sources; Clara's inferences stay unverified until supported,
and material contradictions produce a question. Each execution reads relevant current knowledge.
There is no prerequisite manual vendor/customer binding workflow. Clara maintains identities and
aliases from sufficient evidence through the same Knowledge surface, with visible correction and
history. Stable references distinguish similarly named parties and preserve prior accounting.
This does not make every chat message a durable fact, nor allow knowledge prose to grant authority.
An instruction given inside a client's context applies to that client by default. Promoting it
to a firm-wide default needs explicit scope and the required role; preserve established client
exceptions and clarify material conflicts. Firm defaults do not silently combine client-private
facts or override mandatory accounting and permission constraints.
Clara automatically accumulates traceable experience from completed work and corrections, with
the supporting sources, outcome and applicable conditions. Later work may consult that experience;
repetition, successful posting or an unchallenged model answer does not make it confirmed policy
or authorise future entries. Corrected or withdrawn premises propagate to dependent experience.
An explicit, sufficiently scoped correction revises the earlier assertion without a redundant
confirmation; unresolved conflicts still require clarification. Deleting ordinary chat text leaves
the minimal retained declaration or work basis supporting confirmed knowledge, not an intact
hidden transcript or an unreadable citation to a deleted message.
The canonical storage and projection migration are still an implementation design, not a claim
that the currently split knowledge paths have been unified.

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

Actual bank payment initiation and creation/cancellation of bank mandates are outside this refresh.
They remain a future payment capability; accounting autonomy and recurring-entry authority do not
grant permission to move money.

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
