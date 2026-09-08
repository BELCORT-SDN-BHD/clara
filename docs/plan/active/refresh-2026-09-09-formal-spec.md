## Problem Statement

Accountants cannot reliably understand or complete one accounting job across Clara's chat, documents, journals, registers, bank reconciliation and close screens. Uploads can enter different processing paths, questions and results are fragmented, and UI status can imply success before the complete accounting outcome exists. Clearing a conversation, correcting evidence or returning after a failure has no coherent end-to-end experience.

The accounting substrate already contains valuable ledger, subledger, identity, permission and receipt primitives. Its current interfaces, agent loops and approval ceremonies do not consistently implement the accepted autonomous product. Knowledge capture and retrieval are split, and the frontend obscures both business meaning and actionable next steps.

This refresh must deliver the full agreed product scope: one autonomous Clara, durable Accounting Work, complete accounting operations, governed Client Knowledge, and a detailed rebuild of every in-scope user journey. The selected Home and Work prototypes demonstrate a direction; they are not the release scope.

## Solution

Clara is agentic by default for every firm and user. An authorised instruction, attributed upload, direct Accounting action or explicitly authorised schedule starts the same client-scoped capabilities. With sufficient facts and current authority, Clara completes the intended business operation and its required related effects. Missing facts, material conflicts and necessary human decisions produce the minimum persistent, actionable questions or related Questionnaire needed on the affected Work. Recoverable technical faults are handled by bounded retries; unresolved faults remain visible as failures with recovery paths.

Accounting Work owns the purpose, client, basis, progress, questions and outcomes independently of chat. Work uses a filterable list and detail view with in-place answers. Home, Needs you, object details and chat show the same records. Documents explain evidence; Accounting exposes journals and business objects; Knowledge holds sourced facts and experience; Reports holds attributable outputs; Settings manages the appropriate personal/firm responsibilities.

Posted journal entries are the monetary truth of the general ledger. Assets, open items, allocations, plans, sources and periods retain their own necessary business state. Manual and agent actions use the same complete accounting operations. A coherent versioned Clara harness combines AI SDK ToolLoopAgent with durable Workflow execution and the existing database authority/receipt boundary.

## User Stories

1. As a firm applicant, I want to sign up with clear validation and applicable legal acceptance, so that I can establish an accountable firm workspace.
2. As an applicant, I want email confirmation, confirmation-code entry, resend, expiry and recovery to lead somewhere useful, so that admission does not end in a dead screen.
3. As an applicant, I want interrupted checkout, delayed payment events and an already claimed registration to recover consistently, so that retries do not create duplicate firms or subscriptions.
4. As a returning member, I want login, password recovery and safe return navigation, so that I can resume the work I intended.
5. As a firm owner, I want invitations, acceptance, expiry, resend, revocation and member removal with wrong-email recovery and last-owner protection, so that access stays understandable.
6. As a member, I want available actions to reflect my current role and client access, so that the interface never implies authority I do not have.
7. As a member, I want role removal or a client switch to remove stale data immediately, so that another client's information cannot remain visible.
8. As a bookkeeper, I want new and ongoing-client onboarding to resume from saved facts, so that I do not repeat an interview after reconnecting.
9. As a bookkeeper, I want onboarding facts to reach the canonical client records and Knowledge, so that later executions actually use my answers.
10. As a bookkeeper onboarding an ongoing client, I want opening GL, AR/AP and assets to reconcile to an attributable opening basis, so that subsequent accounting starts from complete books.
11. As a member, I want firm and client switching, breadcrumbs and deep links to preserve explicit scope, so that I always know whose books I am using.
12. As a firm member, I want a portfolio home showing authorised clients, workload, exceptions and recent activity, so that I can prioritise without combining client ledgers.
13. As an accountant, I want client Home to show Needs you, active and recently completed Work alongside financial context, so that I can decide what needs attention.
14. As an accountant, I want four compact financial summaries and three useful charts with exact dates, values and drill-downs, so that the dashboard helps me assess the books.
15. As an accountant, I want book cash distinguished from bank statement balances, so that differing statement dates do not masquerade as current cash.
16. As an accountant, I want receivable/payable outstanding and overdue amounts with coverage warnings, so that missing due dates do not produce false reassurance.
17. As an accountant, I want income, expenses and profit measured on the same basis and comparison window, so that the numbers agree with the ledger.
18. As a member, I want unavailable, partial, stale and zero data distinguished, so that dashboard polish does not hide missing evidence.
19. As a member, I want to open, save and resume filtered Work views with stable URLs and pagination from every attention indicator, so that a count leads directly to actionable work.
20. As a member, I want Work detail to show purpose, client, sources, results, progress and outstanding dependencies, so that I understand what Clara is doing.
21. As a member, I want to answer a Work question with appropriate fields, text or attachments in place, so that I can unblock accounting without navigating through a separate questionnaire system.
22. As a member, I want chat, Needs you and object detail to show that same accepted answer, so that I only answer once.
23. As a member, I want duplicate, concurrent and stale answers handled explicitly, so that one person's answer cannot silently replace another's.
24. As a member, I want unanswered or technically expired questions to remain recoverable, so that time passing neither guesses an answer nor cancels my work.
25. As a member, I want 95 independent complete files to proceed while five insufficient files wait, so that one gap does not hold an entire batch.
26. As a member, I want to cancel remaining work while retaining completed accounting results, so that stopping a batch has predictable consequences.
27. As a member, I want to see stopping while an already admitted atomic operation settles, so that cancellation never conceals a committed result.
28. As a member, I want retry/recovery to reuse completed receipts, so that reconnection or a runtime restart never duplicates accounting.
29. As an authorised colleague, I want to take responsibility where an invalidated personal delegation stops work, so that staff changes do not erase unfinished jobs.
30. As a member, I want Activity to show attributable changes and recovery linked to Work and objects, so that I can inspect what actually happened.
31. As a member, I want to ask Clara to perform supported accounting with or without an attachment, so that a clear instruction with sufficient facts is actionable.
32. As a firm member, I want to direct work across authorised clients while each execution has an explicit client, so that portfolio commands remain isolated and auditable.
33. As a member, I want Clara to clarify ambiguous client attribution before execution, so that similarity of names does not select the wrong books.
34. As a member, I want streamed explanations, typed tool results and source links, so that I can follow progress while final claims remain tied to real outcomes.
35. As a member, I want structured clarification cards to preserve entered values and show validation, submission and settled states, so that agent interaction feels native and usable.
36. As a member, I want to stop visible generation separately from cancelling Accounting Work, so that a chat control does not unexpectedly stop bookkeeping.
37. As a member, I want new, switch, archive and restore conversation controls, so that I can manage context without losing work or confirmed Knowledge.
38. As a member, I want actual deletion of ordinary conversation text with a clear explanation of retained work basis, so that deletion means more than hiding a transcript.
39. As a member, I want reconnection, late attachment and long-history scrolling to preserve my place and current results, so that I can continue after interruption.
40. As a member, I want the rail, full-screen chat and narrow-screen sheet to expose the same durable interaction state, so that changing layout does not lose a draft or question.
41. As an accountant, I want an attributed upload to begin processing automatically, so that I do not have to request autodraft or enable autopost first.
42. As an accountant, I want batch upload progress, duplicates, limits, failures and unassigned files to be visible and recoverable, so that I know which evidence was received.
43. As an accountant, I want classification to wait for successful extraction or supported structured parsing, so that an empty OCR result cannot determine document kind.
44. As an accountant, I want extraction, business facts, accounting execution and final outcome shown separately, so that OCR success is not mistaken for posted books.
45. As an accountant, I want each document kind with a supported typed-facts schema to show those facts next to the source, so that I can verify meaningful fields instead of reading raw JSON.
46. As an accountant, I want a field to lead to its source region/version, so that I can inspect the basis of an amount or identity.
47. As an accountant, I want to correct type, facts or client attribution through contextual controls, so that uncommon maintenance does not clutter the primary document view.
48. As an accountant, I want a source correction to explain affected Work, Knowledge and posted results, so that changing evidence cannot silently rewrite history.
49. As an accountant, I want draft/proposed accounting to remain inspectable when useful without becoming a mandatory approval stop, so that transparency does not defeat autonomy.
50. As an accountant, I want invoices and bills to create the appropriate journals and receivable/payable detail, so that the ledger and open items agree.
51. As an accountant, I want supported staff expense claims to retain claimant, evidence, expense and employee/payable consequences, so that the whole claim is accounted for.
52. As an accountant, I want a manual journal/voucher composer with necessary business fields and exact debit/credit validation, so that direct entries preserve relevant subledgers.
53. As an authorised accountant, I want normal manual posting to complete without a default extra checker or attestation ceremony, so that user and agent execution have consistent authority.
54. As an accountant, I want journal search, filters, source/result links and correction history, so that I can inspect a posting from its economic purpose.
55. As an accountant, I want corrections to settle affected allocations, balances, assets and plans as well as journals, so that a reversal does not leave incomplete business state.
56. As an accountant, I want Clara to correct her own evidenced open-period errors within current authority and notify me, so that routine repair is autonomous and attributable.
57. As an accountant, I want late evidence affecting locked periods to produce a reopen/later-adjustment decision, so that prior close cannot be changed implicitly.
58. As an accountant, I want bank accounts and live statements to expose account, period, balances, coverage and provenance, so that reconciliation starts from understandable evidence.
59. As an accountant, I want proposed matching beside statement facts and outstanding items, so that amount, identity and remaining balance can be evaluated together.
60. As an accountant, I want an already recorded payment to be allocated without another cash entry, so that importing or rematching evidence cannot double-book it.
61. As an accountant, I want only genuinely unrecorded fees, interest or payments booked, so that a bank operation adds the missing economic effect.
62. As an accountant, I want unexplained receipts and ambiguous allocations to remain pending with a question, so that Clara neither guesses clearance nor defaults to suspense.
63. As an accountant, I want partial, split, credit, refund and non-bank settlement cases to preserve eligible outstanding balances and lineage, so that settlement is not limited to statement imports.
64. As an accountant, I want reconciliation to show its balance bridge, difference, coverage and decisions before completion, so that completion means the account actually reconciles.
65. As an accountant, I want authorised reconciliation completion and attributable exclusions to use the same operation contract, so that autonomous completion cannot invent unexplained exclusions.
66. As an accountant, I want observed direct debits to be booked or allocated automatically, so that recurring bank evidence is treated consistently with other movements.
67. As an accountant, I want an accounting schedule clearly distinguished from a bank payment or mandate, so that future journal entries do not imply future money movement.
68. As an accountant, I want AR/AP lists, aging, statements and counterparty drill-downs to reconcile to control accounts, so that I can explain each outstanding amount.
69. As an accountant, I want acquisition accounting and linked asset registration to complete when sufficient, so that missing depreciation policy holds only its dependent setup.
70. As an accountant, I want asset particulars, depreciation method/life, effective changes, disposals and history available from Accounting or Clara, so that asset accounting remains connected to the books.
71. As an accountant, I want depreciation, accrual, prepayment/amortisation and recurring/reversing plans to expose their basis, timing, authority and resulting entries, so that configuration and execution are distinguishable.
72. As an authorised accountant, I want an explicit instruction or existing authority rule to establish a future-entry plan without a second first-run approval, so that requested automation runs.
73. As an accountant, I want next-occurrence previews, edit/pause/resume/end, run history and scoped catch-up, so that recurring accounting is understandable and does not duplicate a period.
74. As an accountant, I want to search active/inactive historical accounts and validate permitted account/control-account changes, impact and detailed records without inventing journals, so that configuration preserves bookkeeping integrity.
75. As an accountant, I want close started from chat, Work, Accounting or an authorised due schedule, so that closing is one business workflow.
76. As an accountant, I want close to check versioned expected evidence, accounts and period coverage including missing uploads, so that “all received files processed” is not mistaken for completeness.
77. As an accountant, I want hard accounting identities, required readiness and advisory information distinguished, so that unmeasured checks cannot appear passed.
78. As an authorised accountant, I want to accept an individual close evidence exception with a reason and retained scope, so that an informed human decision remains visible without waiving hard identities.
79. As an accountant, I want Clara to finish and lock only after actual readiness and current authority pass, so that due time triggers preparation rather than unconditional close.
80. As an accountant, I want governed reopening, continuity and attributable carry-forward results, so that repeated close/reopen actions do not duplicate or erase accounting history.
81. As an accountant, I want reports selected by business purpose and parameters with queued, failed and ready states, so that Reports is a usable output surface.
82. As an accountant, I want trial balance, journals, GL, management accounts, aging and supported statement packs to be reproducible and downloadable, so that outputs can be reviewed and shared.
83. As an accountant, I want issued reports to retain their original contents and basis while affected reports become stale/superseded, so that corrections do not silently replace issued evidence.
84. As a member, I want explicit client facts and durable preferences saved automatically with my identity and source, so that Clara learns without pretending my statement was independently verified.
85. As a member, I want extracted facts, hypotheses, policies and experience visibly distinguished, so that I understand the basis of Clara's judgement.
86. As a member, I want client preferences to stay client-scoped unless I explicitly establish a permitted firm default, so that private knowledge does not spread.
87. As a member, I want firm defaults to preserve client exceptions and surface material conflicts, so that general preferences do not overwrite specific policy.
88. As a member, I want sourced experience from completed work and corrections available as advice, so that Clara improves without converting repetition into policy or authority.
89. As a member, I want Clara to maintain sufficiently evidenced identities and aliases without prerequisite manual binding, so that the agent can process documents naturally.
90. As a member, I want identity rename/merge history, distinct AR/AP roles and correction paths for ambiguous legacy lineage, so that old accounting references remain meaningful.
91. As a member, I want progressive Knowledge search and source inspection relevant to the client, period and purpose, so that execution uses appropriate current context.
92. As a member, I want explicit correction/withdrawal to revise Knowledge and affected experience, so that stale claims are not repeatedly reused.
93. As a member, I want pending Work to reassess relevant changes and posted errors to use accounting correction, so that Knowledge edits cannot rewrite the ledger.
94. As a member, I want Knowledge lag, contradiction and read failures to be visible and recoverable, so that a failed lookup is not silently treated as no knowledge.
95. As a member, I want readable source-linked wiki/OKF views, so that Knowledge is inspectable without becoming a second independent write authority.
96. As a member, I want imported “verified” labels and instructions treated as supplied data, so that a file cannot impersonate human verification or grant tool permissions.
97. As a member, I want account, interface and notification preferences separated from firm settings and accounting policy, so that each setting has a clear scope.
98. As a firm owner, I want membership, legal acceptance, subscription, capacity, usage and invoice information in coherent Settings, so that incomplete commercial features are not presented as live.
99. As a support operator, I want authorised registration/payment support and estate controls without access to firms' books, so that support remains a separate capability.
100. As an accountant, I want inactive beta Tax and unsupported operations labelled honestly, so that I do not mistake a discoverable destination for a filing capability.
101. As a member, I want old links and moved actions to lead to the correct scoped destination or an explicit retired state while preserving receipts and in-flight legacy visibility, so that navigation changes do not destroy access to history.
102. As a keyboard user, I want visible focus, predictable tab order, accessible menus/dialogs and focus restoration, so that every main workflow can be completed without a pointer.
103. As a member using a narrow viewport or 200% zoom, I want readable amounts, usable forms and intentional table scrolling, so that accounting remains usable outside a wide desktop.
104. As a member sensitive to motion, I want reduced motion and stable accounting values, so that animation never prevents reading or action.
105. As a member, I want empty, loading, submitting, partial, stale, denied, failed and completed states designed in every journey, so that no detail is left as a generic spinner or dead control.
106. As a member, I want alerts, toasts and inline errors to have distinct roles and persistent outcomes, so that a transient notification is not the only record of work.
107. As a maintainer, I want every retained historical audit obligation attached to explicit acceptance or a documented disposition, so that a redesign cannot silently drop known issues.
108. As a maintainer, I want runtime migration and rollback to preserve nonterminal work, so that deploying the new agent does not strand old runs.
109. As a maintainer, I want local tests, deployed identity and hosted journeys reported separately, so that research or a green build is not mistaken for product delivery.
110. As a maintainer, I want PRD, Architecture, domain language and implementation tickets updated with the corresponding changes, so that future sessions can work from an accurate source of truth.
111. As a firm owner, I want resumable firm setup based on actual missing canonical facts with optional education kept optional, so that onboarding progress measures real prerequisites without a blanket approval ritual.

## Implementation Decisions

### 1. One business contract, separate durable records

Retain one client-attributed Accounting Work identity with purpose, initiator/current authority basis, source references, child/dependency state, question versions, results, receipts and timestamps. Firm intake may hold a request awaiting attribution or group several client Works; it must not invent a client or use a combined ledger.

Keep Work, conversation, operation, workflow run, question and business-object identities distinct. Multiple runs or conversations may address the same Work. A technical hook's expiry does not terminate the business job. Work counts and success come from canonical state, not tool-call counts or overlapping queue rows.

Admission must durably accept an idempotent request before reporting it accepted, and recover engine enqueue/binding after a crash. Existing task/turn admission and least-privileged database operations are prior art; evolve them behind the shared boundary rather than introduce another authorisation system.

### 2. Complete accounting operations and current authority

Typed operations own their exact monetary and required related state. Invoice/bill/claim recognition, acquisition, allocation, correction, plan execution and period completion have distinct business contracts. An operation may create a JE, several linked effects, or no monetary effect. Required GL/subledger invariants commit atomically; independent Work steps may commit separately with explicit dependencies.

Preserve exact minor-unit arithmetic, balancing, scope, current membership/authority, period constraints, relevant source/version checks, eligible outstanding amounts and idempotency. A valid schema does not prove a correct economic interpretation. Compare existing evaluators/classifiers against the independent guarantee they provide; retire duplicate reasoning or ceremony only with source tracing and representative regression cases. Do not restore retired vendor coding-rule signatures or assume the current posting admission vector is merely redundant model evaluation.

Remove the default second-person/extra attestation branch for ordinary authorised manual posting. Direct user-facts input must preserve actor, instruction and factual basis without fabricated document IDs or claims of independent verification. Agent writes use attributable agent/delegation context, never human impersonation.

For every operation, the receipt identifies committed business outcomes and related objects. Allocate a stable logical operation identity server-side under firm/client/Work/intent. Bind attempted payload digests, revisions and execution manifests separately. Replans/retries/recovery retain logical identity; a changed payload cannot mint another effect after one committed. Replay returns the authorised original result or a conflict; correction is an explicitly linked new operation.

### 3. Accounting capability completion

Before exposing each rebuilt action, trace its current callable operation and latest schema/grants. Build missing required capabilities; legacy absence does not reduce accepted scope to a placeholder. The capability inventory must name required facts, allowed actors, related records, refusal/recovery and dataset coverage for invoices/bills, employee expense claims, journals/vouchers, opening GL/AR/AP/assets, bank and non-bank settlements, asset lifecycle, depreciation, accruals, prepayments/amortisation, recurring/reversing adjustments, account/control-account changes and close.

For staff claims, retain claimant identity, claim/source reference, date, itemised expense/amount/currency, relevant supplied tax facts, and employee payable/advance/settlement linkage as applicable. Do not invent missing required fields or silently expand into payroll-document ingestion. Accrual/amortisation plans require their amount basis, account/business purpose, effective periods, supported calculation method, authorisation and occurrence history.

The source correction/operation matrix must distinguish newly recognised movement, existing payment allocation, credit/refund/unallocation and error correction. Preserve outstanding/control-account tie-outs. Acquired-but-depreciation-incomplete is a valid partial result. Policy/estimate changes have effective scope and preserve history. New plan creation and historical catch-up need explicit scope or existing authority, while an already authorised first occurrence has no extra default approval.

Observed direct debits use bookkeeping/settlement from chat, files/Bank and Accounting. Repetition alone does not create a plan. Actual bank payment initiation and mandate management are outside this refresh.

### 4. Durable agent architecture and bounded repair

Use the selected first successor: Node 22, Workflow 4.8.4, Postgres World 4.3.4 and AI SDK 7.0.77 ToolLoopAgent. Preserve frozen old workflow bindings and add a new immutable successor. This is an implementation target, not a statement that production uses it.

The runtime explicitly loads a versioned bundle of instructions, accounting skills, server-owned tool schemas/implementations, context construction and bounded execution policy. Record the bundle digest, skill/tool versions, model and Work/run association. Repository coding-agent AGENTS/skills are not automatically product-agent context. Tools are exposed by actual capability/scope; source text cannot register tools or widen permissions.

ToolLoopAgent owns model/tool/repair plumbing; Workflow owns checkpoints, hook parking, retries and persisted streams; Clara's database owns authority, question admission, cancellation ordering and committed accounting truth. Reacquire non-serializable clients/providers server-side. Record relevant authority, Knowledge and books versions, but reread current trusted state before writes and after waiting.

Classify errors into actionable invalid input, changed state, safely rebasable conflict, transient infrastructure, actual authority/period/policy refusal, cancellation and internal invariant failure. Schema/selection errors may be corrected within budget; infrastructure uses bounded backoff; forbidden actions cannot be retried with mutated parameters until admitted. Required Knowledge-read failure cannot degrade silently to an empty pack.

Set finite, recorded segment/model/tool/replan and retry budgets. Use the bounded prototype to establish initial defaults, then measure replay cost, latency and representative completion before release; no unbounded loop or numeric throughput promise is accepted by this spec. Budget exhaustion becomes recoverable visible work, never false completion.

WorkflowAgent v1 is compatible with Workflow 4 and has finer checkpoints, but its exact older AI dependency and stream-retry maintenance are the recorded tradeoff. Workflow 5 has a coherent candidate set. Neither alternative is adopted by this spec; changing the selected route needs an explicit architectural amendment and equivalent acceptance.

### 5. Questions, delivery, cancellation and conversation lifecycle

Evolve the existing database first-answer gate with question/basis version comparison. Accept one current authorised answer; deduplicate resubmission, reject conflicting reused keys and display current state for losing/stale answers. An answer is information or a scoped human decision, not a permission grant.

Deliver only the accepted persistent payload. Keep at-least-once delivery separate from answer admission; bind delivery settlement to its claimant and valid lease/token, renew or bound leases as necessary, and reconcile actual hook/run state after crashes. HookNotFound alone does not prove that the correct payload was delivered.

A shared database ordering boundary decides admission versus cancellation/current-authority changes. After cancellation wins, admit no new business action. Previously admitted atomic work settles, completed receipts remain, and UI shows stopping until the final boundary is known. Revocation after commit cannot erase the effect or permit replay under lost read access.

New chat resets conversation context. Archive/restore affects history visibility. True ordinary-text deletion propagates through live stores, searchable projections and resumed context; retain only necessary readable declarations/instructions, accepted answers, authority, source references and receipts. Do not rename the entire transcript “work basis.” Keep Knowledge withdrawal, source lifecycle, work cancellation and accounting correction separate. Define and disclose applicable retained audit/backup material without claiming inaccessible old copies have been erased; ordinary text must not reappear through an index, restored chat or run replay.

Stream partial explanation while rendering final accounting claims from receipts/current object state. Reconnect reconciles durable stream/attempt identity and persisted parts; abandon or replace incomplete segment prose without duplicate messages/results. Use one transcript announcement boundary, avoiding nested duplicate live announcements. Preserve the user's earlier reading position and offer a keyboard-accessible jump to latest. Stopping chat generation is distinct from cancelling Work. Layout remounts must not own the only copy of drafts, accepted questions or history state.

### 6. Unified Client Knowledge

Use one governed knowledge service/surface over typed canonical fact/identity/source/version records, reusing existing stable IDs and lineage. Rebuildable wiki/OKF views, search and indexes are projections. External bundles enter as evidence through the same capture/revision path; metadata claiming verification does not establish authenticated verification.

Capture explicit assertions with actor/scope/provenance; extracted facts with source version and field basis; policies/preferences with conditions/effective dates; hypotheses and experience as advisory. Save explicit durable information automatically. Explicit scoped correction needs no redundant confirmation; unresolved material contradiction preserves evidence and produces a shared question.

Retain client scope by default, explicit permitted firm promotion, client exceptions and separate AR/AP roles. Remove the manual binding prerequisite while preserving identity evidence and historical references. Rename preserves identity; a supported merge resolves current canonical identity while retaining original references. Do not promise universal unmerge where legacy lineage is missing.

Retrieve core facts and relevant concepts progressively by client, period and purpose, with tools to inspect exact sources and accounting objects. Record the versions actually used. Relevant changes cause re-evaluation; unrelated KB revisions do not stop all work. Historical explanations can recover the original basis.

Durable deduplicated events from capture, source change, completed work and correction update affected concepts, citations, experience and indexes. Contradiction/lint checks need real source/claim metadata. Support lag, failure, rebuild and independent supporting sources. Projection failure does not roll back a valid accounting receipt. Withdrawal revises dependent knowledge and pending Work; posted errors follow the accounting correction contract.

Use maintained OKF v0.2 semantics as a readable interchange/projection format and Karpathy's source/wiki/ingest-query-lint pattern as maintenance guidance. Neither grants permissions or requires Google Knowledge Catalog as a separate product.

### 7. Documents, Bank, plans, close and reports

Documents retain original/versioned sources and expose supported typed schemas: invoice/bill parties, dates, references, currency, lines and totals; bank account, statement period, opening/closing balances and transactions; staff-claim particulars; and asset/adjustment evidence as applicable. Successful source extraction precedes classification dependent on its text. Keep extraction, facts validation, Work and posting statuses distinct. Retry, duplicate, refile, supersede, source unavailable and corrected-source states remain explicit.

The capability registry reports custody, byte extraction, typed-facts and business-operation support separately. Admitted or codeable input is not automatically understood or postable. A missing executor for an accepted operation is required implementation work; until delivered and verified with coupled records, the source remains honestly viewable, unsupported or pending rather than falsely successful.

Bank shows account/period, live statement facts, book candidates, allocations, arithmetic bridge and remaining differences. Do not count superseded statements as live evidence, sum differing statement dates as cash, or mark unexplained movements reconciled. Exclusions are explicit attributable decisions under actual authority. Unknown identity/allocation remains pending rather than default suspense.

Matching an already booked movement uses an existing-booking path with no new cash entry; resolve-and-book is reserved for a genuinely new booking leg. Where an existing booking and governing open exception coexist, implement and prove the required resolve-then-match sequence. Keep the line pending while that sequence is unavailable; never use new-booking merely to link an existing JE.

Plans are first-class configuration with revisions, precise timezone/effective dates, frequency, next occurrence, pause/resume/end and immutable deduplicated runs. Supported plan kinds and scheduling rules must be enumerated in implementation acceptance. A due event initiates authorised Work; it is not a completed posting.

Close uses client-specific versioned expected sources/accounts/coverage and applicable requirements, including evidence not uploaded yet. Separate hard identities, human-acceptible missing-evidence readiness and advisory information. Deferred checks remain pending until measured. A permitted human may accept an individual evidence exception with reason and period/requirement identity; Clara cannot self-waive or extend it to future periods. Hard accounting identities cannot be waived. Finalisation locks only after readiness/current authority and retains continuity, exceptions and report links. Reopening or later-period treatment of late evidence requires the accepted user decision.

Reports expose purpose, parameters, immutable basis/version, preparation/render status, attributable result and permissioned download. Deliver trial balance, journals, GL, management accounts, aging and supported formal packs; a pack claims a reporting framework only when required statements/notes/wording are supported. Preserve issued bytes/basis; mark affected reports stale/superseded and generate authorised replacements. Internal seeding, render queues, raw role/table names and wiki maintenance are not normal report navigation.

### 8. Frontend structure and every-detail acceptance

Use the selected A Home visual direction with restrained glass treatment and B Work list/detail interactions, preserving semantic design tokens, professional density and exact readable financial values. Firm scope, client scope and operator scope remain explicit. Sidebar owns primary navigation and grouped Accounting destinations; Breadcrumb explains location/scope. Tabs organise genuinely related content within a page, with predictable activation and focus; Navigation Menu is not a substitute for the workspace sidebar.

Cover all 34 journey groups across admission/authentication, people/access, client onboarding/opening, scope/home, Work/Needs you/Activity, native chat/history, Documents, journals, Bank, AR/AP, Assets, Plans, Accounts, Close, Reports, Knowledge, personal/firm/commercial settings, operator support, inactive Tax and legacy navigation. Each implementation ticket carries its concrete normal and failure/recovery states; shared primitives alone do not satisfy a journey.

Use the full shadcn/Base UI catalog disposition as a selection policy, not an instruction to install every component. Use official CLI/registry sources with explicit package provenance; distinguish core components, AI helpers and external registries. Map native Message/Message Scroller, Attachment, Questionnaire-style structured forms, typed tools, source/Marker affordances, shimmer and overflow helpers to real interaction needs. Do not claim installing a “message” component or enabling SDK streaming implements durable chat.

Use Sheet for mobile navigation, filters and bounded supporting context; Drawer only for a short touch-first picker where swipe dismissal is safe. Full Work/source/accounting details have stable routes. Dialog/Alert Dialog handles actual decisions or destructive actions; Dropdown Menu holds secondary actions. Context Menu may duplicate a visible command path where an expert need is established, never become the only entry; Menubar is omitted unless a real accepted persistent desktop command suite warrants it. Preserve titles, focus trap/return, keyboard triggers and dirty-form recovery. Use Field and typed controls for data entry; Input OTP only when the actual provider code shape fits, with paste and usable fallback; Empty for meaningful absence; Skeleton/Spinner for actual waits; Progress only against a defensible denominator; Badge/Alert for readable state. Toast confirms briefly; Work/object/inline state persists the result. Carousel is not the primary accounting work queue.

Define loading, empty, partial, stale, invalid, saving, success, denied, failed, cancelled and recovery states where applicable. Use exact labelled money/date input, visible field errors, correct disabled reasons and reversible drafts. Keep implementation jargon out of normal user flows. Preserve desktop/narrow layout, browser back, deep links, screen-reader names, focus, 200% zoom and reduced motion. Charts require accessible values/table fallback; no rolling amounts or auto-advancing accounting rows.

Onboarding, consent/admission, members and Settings remain real product journeys. Reuse current provider/role boundaries; complete the engineering integration for versioned legal acceptance and recovery while keeping final legal text/provider configuration as explicit external inputs. Do not invent pricing or expose unfinished billing/filing as working. Operator support remains separate from firm/client accounting access.

### 9. Dashboard definitions

Client Work attention covers all accounting periods, independent of the financial selector. Count distinct Work IDs. Needs you means a current human question blocks that Work; active means at least one runnable/executing/technically retrying child; these facets may overlap and must not be added together. Recently completed means successful completion in the seven MYT calendar dates ending today.

Four summaries are book cash/bank, receivables, payables and period profit; AR/AP include outstanding/overdue context. Three charts are six-point book cash, six-calendar-month income versus expenses, and receivables/payables grouped by due date. Charts drill into the underlying accounting population; constrained space may use the corresponding readable fallback. Include compact, measured reconciliation/close readiness and its remaining questions; show X/Y only when the applicable check set is known, with accepted evidence exceptions separate from passed checks.

Money defaults to current calendar month-to-date using Asia/Kuala_Lumpur business date and exact as-of. A completed historical month uses its whole interval. Future months cannot appear as actual results. Current MTD compares with the corresponding elapsed prior-month interval capped at prior month-end; historical month compares to the prior full month. Percentage delta uses (current minus comparison) divided by the absolute comparison value; zero denominator yields no percentage, and a profit/loss sign change prioritises the amount and transition. Balance cards compare the selected as-of against the preceding month-end. The income/expense chart uses the six calendar months ending in the selected month, with a current partial month explicitly labelled through its actual as-of.

Book cash is cumulative approved debit-minus-credit over a governed, versioned cash/bank account set, including relevant inactive accounts and petty cash. Opening is already in cumulative balances; do not add it twice or reset cash at FY boundaries. Six points are five preceding month-ends plus current as-of, or six month-ends ending in the selected historical month. Pre-coverage values are unavailable.

AR/AP uses signed outstanding items and effective allocations as of the date, retaining negative credits and separate AR/AP roles. Due-date buckets are not-yet-due (including today), overdue 1–30, 31–60, 61–90, over 90 days, and undated. Each distinct nonzero outstanding open item belongs to one bucket; allocations do not add item counts, and signed bucket amounts reconcile to the cards. Item-age aging cannot be labelled overdue. Undated amounts/counts disclose incomplete coverage, not silently current. Income is all income credit-minus-debit; expense is all expense debit-minus-credit, in the identical interval. Profit is income minus expense. Include correction/reversal effects and exclude closing-transfer lines; do not clamp negative corrections.

Read each internally consistent metric pack under one consistent database view and actual caller permissions. Return value/status, unit/currency, period/as-of, computed-at, definition version, source watermark and coverage. Restricted/error/unknown/partial is never fabricated zero. A database visibility snapshot alone is not a replayable historical dataset. Align authorised Viewer reads deliberately without widening access through aggregation. Firm home aggregates workload, not client monetary balances.

Read on entry, client/period change, relevant committed-event invalidation and return to a visible window; while visible, compensate for missed events at intervals no longer than 30 seconds. After 60 seconds without a successful read, display update delay and the last-success time. A transient failure may retain a clearly dated value with retry; initial failure never invents zero. Client/access change immediately clears unauthorised values. Work and financial packs have separate watermarks. These are release acceptance targets, not an already measured hosted SLA.

### 10. Migration, historical obligations and source-of-truth ownership

Use additive evolution, migration/backfill, dual-read verification where needed, and explicit retirement criteria. Preserve legacy Work/task associations, accounting/identity/source history, nonterminal workflow bodies and old-link destinations. No deletion of a binding table or old agent body before reference/caller/queue/run obligations are resolved. Cutover admits new Work to the successor while old runs resume their original body. Rollback must retain all nonterminal versions or drain them first.

Carry all 216 historical IDs and 161 recovered nested obligations into the published acceptance appendices and subsequent ticket mapping. Initial register classes are 97 redesign, 17 replaced remedies, 15 source-supported gaps, four source observations, 65 verification/discovery and 18 external inputs. These are dispositions, not counts of fixes or new tickets. Preserve explicit duplicate relationships; related grant/revoke or add/retire cases retain separate acceptance. Each retained obligation receives a ticket/test/evidence owner or an explicit current-scope disposition. Silence cannot dispose of a row.

Retain the classify-after-extraction implementation issue and its independent local candidate without claiming deployment. Preserve current-source corrections such as existing same-client identity constraints and stream reauthorisation. Do not resurrect withdrawn-map decisions, opt-in autopost, mandatory binding rituals or obsolete audit remedies.

PRD owns accepted product intent; Architecture owns current implemented boundaries and changes alongside implementation; domain terminology stays in CONTEXT. The formal GitHub spec owns build acceptance, implementation issues own dependency/status/verification, and research snapshots retain evidence limits. SOT integration is part of each relevant change, not a final cleanup after all tickets.

## Testing Decisions

The primary acceptance seam is **an authorised user input → durable Accounting Work → complete, attributable business result**, through the same production-facing commands/reads used by chat, upload, direct Accounting and schedules. Test externally visible behaviour and coupled state, not private helpers or an implementation-shaped collection of mocks.

The owner explicitly confirmed this seam and the real database/Workflow, all-34-journey, keyboard/narrow/recovery, Knowledge and financial-result coverage on 2026-09-09 during /to-spec.

Concurrency, restart, authority-change and cancellation ordering run against real Postgres migrations and a real persistent Workflow Postgres World, with deterministic barriers around admission, lock acquisition, commit and engine checkpoint. Reducer/helper or synthetic in-memory tests cannot satisfy that seam. Assistive-technology listening must verify announcement ownership, rather than inferring it solely from DOM roles.

Reuse current database business-operation/receipt and role-test rigs, runtime admission/answer-delivery/control and version-cutover rigs, and route-level component/Playwright journeys. Add lower seams only to force a fault or concurrency ordering that cannot reliably be observed at the higher seam. Scripted models verify orchestration deterministically; representative real-model evaluation separately verifies document interpretation, source grounding, tool selection and bounded correction. A green mock does not establish accounting judgement.

| Acceptance group | Required evidence |
|---|---|
| Core end-to-end journey | Signup/admission → client/onboarding/opening → upload/direct instruction → clarification if required → complete books → reconcile → close → reproducible report and audit trail, through usable UI. |
| Entry-point parity | Same economic intent through chat with/without documents, upload, direct UI and authorised schedule yields equivalent required business state, retaining the actual actor/delegation and source basis. No extra default approval or human impersonation; an agent cannot accept a human-only close evidence exception. Repeated admission creates no duplicate Work/effect. |
| Atomic accounting | Real migrations and least-privileged roles; exact money, balance, client/firm isolation, period and source checks; GL/open-item/allocation/asset/plan invariants commit together or fail together. |
| Logical-operation replay | Same server-assigned intent/key and payload returns one receipt; changed payload, relevant revision or manifest after commit resolves the authorised receipt or conflict without another effect. No-effect replans use versioned attempts under that intent. Correction has a linked new identity. Include successor/cutover replay. |
| Representative business cases | Invoice/bill/claim, opening balances, booked payment rematch without duplicate cash, partial/non-bank/credit/refund settlement, allocated-payment correction, acquired asset with missing depreciation, plan first/catch-up/repeated occurrence, control-account impact and report staleness. |
| Plan authority | Repeated bank debits, Knowledge preferences or old chat history do not independently create a plan. A sufficiently scoped instruction/existing authority does; a due event creates Work and rechecks current client/role/period. Pause/end/revocation blocks subsequent occurrence admission; admitted atomic work uses the same settlement boundary. |
| Work questions and batches | First current valid answer, same-key replay, conflicting key, concurrent answers across surfaces, changed basis, expiry and new evidence; 95/5 partial batch with no unrelated starvation and correct overlapping facets. |
| Authority/cancel ordering | Real business-door barriers before lock, after admission/before commit, after commit/before checkpoint; both orderings of revocation/period lock/cancel. Assert persisted and visible stopping while admitted atomic work settles, then cancelled only after the final boundary. Completed child/results/receipts remain linked, no later child/action is admitted, and revoke-after-commit neither exposes the receipt nor erases the effect. |
| Durable execution/delivery | Kill the serving process after effect commit before engine checkpoint, resume same persistent world, retain one effect/receipt; two slow delivery workers, lease expiry, crashes before/after hook resume and ownership-checked settlement. |
| Answer-to-resume chain | Answer A commits and B loses; worker 1 leases A, resumes and crashes before settlement; after lease expiry worker 2 reconciles the actual hook/run and conditionally settles with its claimant/token. The accepted A and its basis version advance Work once; a stale/losing payload or HookNotFound alone cannot count as delivery success. |
| Chat/deletion/reconnect | New/archive/restore/delete ordinary text while Work and minimal readable basis continue; index/context propagation; partial-stream replacement, late SSE and long history; generation stop distinct from Work cancel; layout remount preserves state. |
| Knowledge | Source-backed capture, client/firm isolation, advisory learning without policy/permission escalation, identity rename/merge lineage, conflicting/independent sources, relevant vs unrelated revision, withdrawal, required-read failure, projection lag/rebuild and untrusted imported claims. |
| Knowledge/deletion chain | A sourced chat assertion receives a content/source version used by Work; ordinary-text deletion retains only readable minimal basis. Correction/withdrawal creates an attributable revision, reassesses pending Work and removes/downgrades affected experience/index material while preserving historical explanation. Posted accounting changes only through an explicit correction operation. |
| Close | Due trigger with sufficient/missing expected evidence, unknown versus measured readiness, explicit human evidence exception with reason, hard-check refusal, repeat finalisation, lock/reopen/later adjustment and continuity/report versioning. |
| Financial outputs | Deterministic TB/journal/GL/AR-AP/aging/management fixtures prove posted-source snapshot, currency/period/supported basis and cross-report tie-outs. Assert immutable issued bytes, stale/superseded replacement, renderer failure/retry, access and permissioned download. Reject/label unsupported basis options instead of inferring a cash/accrual toggle. |
| Dashboard | Golden exact-cent fixtures across FY/opening/reversal/closing-transfer boundaries; overdue vs aging and missing due dates; partial months and zero denominator; pinned cash-set/coverage, read consistency, role restrictions and watermark refresh. |
| Full frontend | All 34 journeys with meaningful empty/loading/partial/stale/error/denied/success/recovery states; wide/narrow, keyboard/focus/return, screen-reader names, 200% zoom, reduced motion, exact values, deep links and browser back. |
| Runtime rollout | Node22 in root/runtime Linux image/Fly/CI; real Postgres World restart/multi-host smoke; build A old runs → build B old+successor, old parked run resumes with its original body and instruction/skill/tool-registry manifest digest, compatible tool/schema implementation and dependency resolution under additive migrations. New admissions bind the successor; rollback preserves these nonterminal bundles or follows verified drain. |
| Hosted release | Record source and migration frontier, web/runtime/renderer versions, authorised hosted representative journeys and provider dependencies. Local compile/prototype/database results stay separately labelled. |

The local evidence already supports bounded visual interactions, Node22 build/typecheck, synthetic ToolLoop/PG commit-before-checkpoint recovery, transaction ordering and a separate native-v1 comparator. It does **not** establish current-Clara role/operation integration, real-model quality, complete accessibility, Linux/hosted migration, two-build cutover or all product journeys. These remain implementation acceptance.

## Out of Scope

- Actual bank payment initiation and bank mandate creation/cancellation; accounting for observed movements and authorised recurring journal plans remains included.
- Group consolidation, external-ERP posting, independent client-business login, full payroll processing and perpetual inventory.
- New foreign-currency conversion/mixed-currency support, MyInvois API pull/outbound issuance, first-class payroll-document ingestion, staff-allowance specialisation, self-billed detection, withholding mechanics and a statutory deadline calendar. Preserve explicit future dispositions; generic date/schedule controls and periodic stock/payroll-obligation bookkeeping remain within the existing product boundary.
- Activating inactive beta Tax, autonomous statutory filing, inventing legal text or purchasing provider/commercial services. Existing tax reads and preparation foundations remain discoverable and correctly labelled; future effective-dated tax/filing expansion needs its own scope and official-source validation.
- Adopting a different managed-agent platform, Google Knowledge Catalog or a separate external knowledge-bundle management product in this first successor.
- Blindly installing all components, cloning a reference product wholesale, or treating speculative features and unsupported controls as delivered scope.

## Further Notes

This is the formal synthesis of [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597), following its [completed Wayfinder decision phase](https://github.com/BELCORT-SDN-BHD/clara/issues/597#issuecomment-5588904978). Accepted decisions govern over earlier provisional comments and the withdrawn prior map.

Controlling decisions: [Accounting Work](https://github.com/BELCORT-SDN-BHD/clara/issues/601#issuecomment-5581778992), [complete accounting operations](https://github.com/BELCORT-SDN-BHD/clara/issues/602#issuecomment-5582778719), [Client Knowledge](https://github.com/BELCORT-SDN-BHD/clara/issues/603#issuecomment-5583365852), [navigation/components](https://github.com/BELCORT-SDN-BHD/clara/issues/604#issuecomment-5583995499), [dashboard definitions](https://github.com/BELCORT-SDN-BHD/clara/issues/608#issuecomment-5585923205), [full frontend flows](https://github.com/BELCORT-SDN-BHD/clara/issues/610#issuecomment-5587196374), [A Home + B Work](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017), [runtime route](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302), and [direct-debit scope](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144).

Claude's prior reports, Karpathy/maintained OKF research, Mobbin references for Linear/v0/Vercel/Copilot and accounting products, Efferd Dashboard 2, shadcn/Base UI and restrained motion studies are incorporated with their corrections and limits. Static reference frames establish composition; synthetic prototypes establish only the behaviour actually exercised. Neither proves production accounting or accessibility.

The historical acceptance appendices preserve the audit inputs for fresh-session ticket decomposition. They are required traceability, not instructions to rebuild superseded fixes or treat every item as a confirmed current defect. [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605) stays open until the concrete issue mapping is published. Reuse [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606) for its existing bounded slice.

Published acceptance appendices (read with this body before ticket decomposition):

- [A.1 — Historical audit disposition register](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589270292)
- [A.2 — Historical audit disposition register](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589270908)
- [B — Recovered nested audit obligations](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589271633)
- [C — All 34 frontend journey recipes and shared interaction acceptance](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589272141)
- [D — Component catalog dispositions and native AI interaction research](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589272729)
- [E — 34 journeys mapped to formal user stories](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589273361)

Next, run /to-tickets against the full spec and appendices: narrow demoable vertical slices, explicit native GitHub dependencies, accepted scope and complete failure/recovery/migration checks. Each implementation begins from its self-contained issue. The ready-for-agent label means ready for that agent workflow; it is not a deployment or completion claim.
