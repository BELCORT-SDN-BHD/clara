# Clara

Clara is the shared accounting workspace in which firm staff and an accounting agent work on each client's books.

## Language

**Clara autonomy**:
Clara's normal way of working: execute accounting when the information and authority are sufficient, and ask when missing or conflicting facts or a necessary decision prevent progress.
_Avoid_: An optional automation mode; a synonym for unrestricted user permissions.

**Accounting basis**:
The recorded facts, instructions and sources supporting an accounting action. It may include explicit user-provided facts as well as documents, with their origin kept clear.
_Avoid_: A mandatory file attachment; a claim that every user statement is independently verified.

**Accounting work**:
A client-attributed job with an intended accounting outcome, its evidence, progress and outstanding decisions. Its identity continues when a conversation is reset or replaced.
_Avoid_: Chat session, chat message, journal entry as synonyms for the whole job.

**Work cancellation**:
Stopping the remaining work while retaining outcomes already completed. Reversing or correcting a posted outcome is a separate accounting action.
_Avoid_: Rollback, reversal as synonyms for cancellation.

<!-- #721 -->
**Restated work / supersedes**:
A reply that changes the admitted basis does not edit that work; it becomes a new work carrying the revised instruction, while the original is cancelled with the outcome *superseded*. The two are linked in both directions: the new work *supersedes* the old, the old is *superseded by* the new.
_Avoid_: Edit, amend, correction as synonyms — a correction acts on a posted outcome, a restatement replaces an instruction that never posted.
<!-- #721 -->

**Accounting plan**:
An explicitly authorised schedule for future accounting. It records what it posts, the schedule it
follows, the calendar days that schedule produces in a named timezone, the window its authority
covers, and the instruction that authorised it — a row this database holds, not a remembered
sentence. It can be revised (a new version, the predecessor kept), paused (future due events stop;
work already admitted is untouched) and ended (terminal).
_Avoid_: A recurring adjustment template as a synonym; a preference, a calculation policy or a
repeated bank debit as a source of authority; an instruction to move money — a plan creates journal
Work and never initiates a bank payment or a mandate.

**Plan occurrence**:
One due event of one plan. It is the identity of that event: one plan and one due date have exactly
one occurrence, whatever happened to it. An admitted occurrence names the Accounting work it
created — and every attempt it ever admitted, so a cancelled one stays reachable from the plan; a
refused one records the refusal and creates nothing, and re-attempting it is an explicit catch-up
rather than the next scan's business. A REVERSING occurrence also names the journal entry it undoes:
it is admissible only once its own period's accrual has POSTED a still-live entry, never merely
because that accrual was admitted.
_Avoid_: The journal entry as a synonym; a second scan's answer as a second occurrence; treating a
missed period as something the schedule will pick up on its own; treating an admitted accrual as a
posted one.

**Plan catch-up**:
Admitting due events that already passed, over a window a person names. Oldest first, bounded per
request, and never reaching back past the date the plan's authority starts.
_Avoid_: An automatic backfill; a future schedule read as authority over history.

**Ordering boundary**:
The `clara.accounting_work` row lock. Admitting an accounting operation and cancelling that Work serialise on it: exactly one side wins; the loser creates no effect and returns a typed refusal.
_Avoid_: An AbortSignal or in-process flag as a substitute; a guarantee that holds only when nothing races.

**Stopping**:
A Work that has been asked to cancel while an already admitted operation may still be settling. Not terminal; the terminal is written only once the boundary is known.
_Avoid_: Cancelled; a synonym for the run's own status.

**Superseded outcome**:
The outcome the run itself requested (failed/refused/expired), preserved under `accounting_work.error.superseded` after the cancel translation.
_Avoid_: A second error a person must resolve; proof the run's own report was wrong.

**Initiated by / Responsible**:
Two facts a Work's `initiator` column used to conflate. `initiated_by` is who asked (immutable). `initiator` is the human whose live authority the Work executes under, moved only by take-over.
_Avoid_: Treating either as a synonym for the other; assuming `initiated_by` can change.

**Take over**:
An active colleague assumes responsibility for a terminal Work whose responsible human lost authority: a new run, the same logical identity, `initiated_by` unchanged.
_Avoid_: A way to seize a Work whose responsible human is still authorised; a second way to create a run.

**Stale settle**:
A settle replayed for a run that is no longer its Work's current run (a Retry or take-over has since opened another). It writes nothing and answers `stale_task`; only the current run's settle may move the Work.
_Avoid_: Treating any terminal task as authority over the Work; a duplicate settle as an error.

**Lost sight of a reply**:
The bounded state a Clara tab enters when its run poll has missed three consecutive reads of the turn's row: the Stop control and the turn clock are withdrawn and the tab says so, while the task id, the live buffer and a parked question are kept; one successful read clears it.
_Avoid_: "The turn ended" (absence of a row is not evidence of that); a silent control that stays offered forever.

**Stop reply ≠ Cancel Work**:
Stop reply aborts the SSE read and cancels the chat-turn task; Cancel Work cancels the persistent Work. Different `clara.agent_tasks` rows with no cascade between them; closing the rail does neither.
_Avoid_: Assuming either one implies the other; a chat-lane action as a substitute for the Work-level cancel door.

**Work batch**:
A group of accounting work tracked together. An item waiting for information holds its dependants, while independent items may continue and retain their own outcomes.
_Avoid_: A single all-or-nothing accounting transaction.

**Needs you**:
The view of work awaiting information or a decision from a person. Answering there continues the same work and question seen elsewhere.
_Avoid_: A separate execution queue; every technical failure as a question for the user.

**Saved view**:
A named set of list filters a person keeps, stored against that person rather than the firm. It is a filter on one destination — the same URL, narrowed — never a second destination and never a position in a result set.
_Avoid_: A separate route or tab; a remembered page of results; a shared firm-level configuration.

**Activity**:
An attributable history of work and accounting changes, linked to their outcomes and basis.
_Avoid_: A substitute for outstanding questions or the current state of work.

**Clara conversation**:
An exchange with Clara that can initiate or discuss accounting work. Starting a new conversation does not cancel that work or erase the client's confirmed knowledge.
_Avoid_: Accounting work, client knowledge as synonyms for the conversation.

**Conversation deletion**:
Removal of ordinary conversation text while retaining necessary work evidence and accounting decision records. It does not cancel work, reverse postings or withdraw confirmed client knowledge.
_Avoid_: Hiding or archiving an intact conversation as a synonym for deletion.

**Firm workspace**:
The accounting firm's portfolio context, where staff can ask about and direct work across authorised clients. Each accounting execution still belongs to an explicitly identified client.
_Avoid_: A combined client ledger.

**Client workspace**:
The context for one client business's books, evidence, accounting work and knowledge inside a firm.
_Avoid_: Client login, firm workspace.

**Confirmed client knowledge**:
Durable information already accepted about a client, retained across conversations. A new chat does not withdraw or amend that information.
_Avoid_: Chat history.

**Client knowledge**:
The client's facts, identities, aliases, durable preferences, policy information and source-linked accounting experience, with their sources and verification state. Explicit information may be saved automatically; an agent's inference is not automatically confirmed knowledge.
Every governed record carries one of four **kinds** — a *stated fact* (what an identified person supplied), an *extracted fact* (read from a named source version), a *preference* (a durable instruction) or a *policy* (a decision about how the books are prepared) — and one of four **trust levels**, derived from where it came from and never supplied by the caller: *asserted*, *extracted*, *imported unverified* and *inferred*. A policy admits `asserted` alone.
_Avoid_: An unqualified bag of chat messages; a synonym for authority to post; treating an imported bundle's own "verified" annotation, or a model's own confidence, as a trust level.

**Knowledge revision**:
One attributable version of a knowledge record. A capture is revision 1; a correction and a withdrawal each append a further revision naming its actor and its reason, and leave the revision they retire readable. A withdrawal is terminal for that record — a later statement of the same thing starts a new record with its own history.
_Avoid_: Editing a knowledge value in place; a correction with no stated reason; presenting a withdrawal as the absence of a record.

**Knowledge pack**:
The bounded set of a client's live knowledge records read for one stated purpose, with the firm's current knowledge version as its watermark. A pack that could not be read is *unavailable* and says so with its reason; it is never presented as a client with nothing recorded, and it is never a reason to ask someone to repeat information they have already given. Its contents are supplied data, never instructions to the agent.
_Avoid_: An empty pack standing for a failed read; a pack presented as authority to post; treating a value inside a record as a direction.

**Firm knowledge default**:
An explicitly firm-scoped instruction or preference that applies across authorised clients while preserving their established exceptions.
_Avoid_: Automatically sharing one client's private facts or practices with every other client.

**Accounting experience**:
A source-linked lesson from completed work or a correction, including the outcome and conditions in which it is useful. Clara can consult it when deciding how to handle later work.
_Avoid_: A confirmed policy merely because an action succeeded or was repeated; authority for a future posting plan.

**Posted journal entry**:
The recorded debit and credit effects of an accounting event on the general ledger. Related assets, outstanding items, allocations, schedules and period decisions carry additional business meaning.
_Avoid_: Every change to product or accounting state.

**Work run**:
One execution attempt of an Accounting work: the durable task and workflow run that claims the work, runs Clara's bundle and settles an outcome. A retry is a new run under the same work and the same logical operation identity.
_Avoid_: A new piece of work; a reason to post the same effect twice.

**Workflow body**:
One immutable, deployed version of a workflow class — the code a run executes and stays bound to for its whole life. A class names its newest body (its **pin**); every earlier body an image still carries is **retained**, because a run parked on one resumes into exactly the body it left.
_Avoid_: Workflow class as a synonym; a version number in a name as proof the code is present in an image.

**Body roster**:
Which bodies a running image can actually execute, as a readable fact rather than an inference: the registry's pins plus every retained body, reported in one boot line, on `/api/build-info`, and derivable from the built bundle's own WDK directives. It answers "can this image run that parked run", which a list of workflow class names cannot.
_Avoid_: The registry's class list; the repository's source tree as evidence about a deployed image.

**Stranded body**:
A body that live, non-terminal runs are parked on and that the image now serving does not carry. Those runs are parked rather than lost — a release of an image that carries the body resumes them — but the serving process cannot advance them, and an engine asked to replay one can crash rather than wait.
_Avoid_: A failed run; a reason to treat the Work as cancelled; a condition safe to discover after a rollback.

**Rollback preflight**:
The check run before releasing an earlier image: does that target carry every body live runs are parked on, and every class an already-admitted Work still needs. A refusal has two admissible answers — retain the bodies in a compatibility build, or complete a verified drain — and elapsed time is neither.
_Avoid_: Rollback points as a substitute for it; "nothing looked busy" as a drain.

**Operation receipt**:
The record that one logical operation identity committed its business effect: which run and bundle produced it, which human authority it acted for, and which objects it created. At most one committed receipt exists per logical operation identity; a replay returns it and a changed payload under that identity is refused.
_Avoid_: A chat message claiming completion; a task status; a second effect.

**Work question**:
One persistent question a running Accounting work is parked on: the missing fact or decision, why it is needed, one to six typed fields, the supporting source, and the version of the basis it was asked against. It has a stable identity and a monotone version on its Work (a re-asked question is a new version); every surface renders the same record; the database accepts exactly one current authorised answer, replays a repeated one, and shows a later or conflicting answer the authoritative result.
_Avoid_: A chat message; an approval gate; a separate question per surface; a way to change what the Work already recorded.

**Chat clarification**:
One question Clara asks inside a conversation while a turn is still running, answered in that same conversation. It lives only on the run's live stream — settling the turn cancels it in the same statement sequence that writes the assistant message — so it is answerable during the turn or, after a reload, from the row the run is parked on; its 14-day deadline is enforced by the runtime's expiry sweep, which moves a past-due clarification to expired so the parked turn settles and the conversation is usable again (#720 Half 1); what remains open is that an unreachable chat resume is still recorded as delivered (#764).
_Avoid_: A Work question as a synonym; an approval gate; a chat message that merely mentions a question.

**Delivery state**:
The runtime's record of whether a settled Work question reached the parked run: pending, leased by one worker, delivered, or resting as unreachable when the engine's hook is gone. It is stamped with its own instant so a grace can be measured, and it never reopens a question or replaces its status.
_Avoid_: A second question status; proof that the Work advanced.

**Evidence link**:
The append-only record that one client document is the source behind one posted journal entry: which Work and operation identity bound it, who bound it, when, and whether it was bound as the entry was recorded or attached afterwards. A document backs at most one live posted entry; a reversal releases the link so the corrected entry may cite the same document. Evidence is optional — an entry recorded without a document is a complete accounting fact.
_Avoid_: A column rewritten on the posted entry; a claim that the document was independently verified; "unsourced" as a synonym for "wrong".

**Spoken-for document**:
A document that already backs a live posted entry of any client of the firm — through a live Evidence link or an approved, not-reversed document-coding binding. A picker disables such a document and names its claimant; the posting door's own refusal is the actual law and is unchanged by this advisory.
_Avoid_: A hard block; proof the document cannot be used at all; a synonym for "already filed".

**Claimant client**:
The client whose posted entry currently holds a spoken-for document — firm-wide, not necessarily the client being asked about.
_Avoid_: The asking client; the document's filing client when that differs from who holds the posting.

**Legal document**:
One versioned text Clara asks a person to accept — the Terms of Service or the Data Processing Agreement — with a kind, an integer version, a status (draft, published, superseded) and the exact bytes' hash. Only a published version can be accepted; a draft is shown as not final.
_Avoid_: A placeholder as a signable agreement; one "current agreement" that stands for both kinds.

**Legal acceptance**:
The append-only record that one person accepted one published legal document at one exact version and hash, with its instant and the operation key that made it idempotent. Both kinds must be accepted at their current versions before checkout opens; the intent pins the versions it was opened against.
_Avoid_: A checkbox state kept in the browser; acceptance of one kind counting for the other.

**Checkout intent**:
One applicant's one attempt to pay for one registration: opened, then bound to one live Stripe Checkout Session, then processing (the bank has not answered yet), paid, consumed by the firm claim, or ended as expired, failed or cancelled. One registration has at most one live session at a time; every move is written by one database trigger, and a settled payment is the authority over any earlier terminal state.
_Avoid_: A browser redirect as proof of payment; a Stripe event as a substitute for the intent's own state; cancelling as a refund.

**Admission capacity**:
The estate-wide limit on how many non-operator firms may exist, set by the operator firm's owner. The firm claim checks it last, under one lock, so two claims into the last slot yield one firm; the loser keeps its payment unconsumed and can claim once room is made.
_Avoid_: A per-firm seat count; a check done only when the checkout opens.

**Document custody**:
The state in which a document's original bytes are durably held and verified: the content-addressed object has been written once and read back with a matching hash, recorded on the document as its storage path and verification time. A firm member may already see a document — it is filed, listed, coded — while custody is still pending; that gap is named (`custody_pending`) and answered with a wait-or-re-upload fix, never folded into "not found".
_Avoid_: "the document exists" as a synonym for "the bytes can be served"; treating a pending object as a permission refusal.

**Source read**:
A human previewing or downloading a document's own stored bytes, as distinct from the typed facts, regions or extracted text derived from it. Every source read is receipted — who, which document, under which client scope, to preview or to download — and is scoped by live firm membership and the document's active filing, never by a separate per-user document permission list.
_Avoid_: Conflating a source read with reading the extracted facts or overlay drawn on top of it; treating preview and download as the same audited purpose.

**Activity event**:
One observable, attributable change in the firm's books or work — a domain event, an agent receipt or a committed operation receipt — with its actor and delegation, client, time, status and links to its Work, object, source and replacement outcome.
_Avoid_: An internal task name or private model reasoning; a pending question (Work owns those); a substitute for the object's own current state.

**Kept sweep receipt**:
A `sweep.run_completed` event whose run drafted or posted at least one item, and so remains in the Activity feed as an attributed agent act. A run that changed nothing is excluded rather than shown as unattributed noise.
_Avoid_: Every sweep run; a refusal or a skip counted as "effect".

**Document capability**:
What Clara can actually do with an admitted upload, stated per (file format × document type) on four independent levels: custody (the bytes are sealed and retrievable), byte extraction (a reader turned them into stored, inspectable content), typed facts (a lane can persist typed values with their source regions) and business operation (the pair can drive an accounting operation). Each level is `supported`, `stored_only`, `unsupported` or `planned`, and a level is published with the reason for it.
_Avoid_: "Supported" as one word about a file type; a promise inferred from a filename or an extension; permission — an egress consent gate remains the authority over whether a read may happen at all.

**Typed fact**:
A value Clara read out of a document and persisted with its exact source: the document's own version, the page/region it was read from, the field path naming it, and the engine and model version that produced it. A typed fact is a reading of a source, never a confirmed fact about the client. Client Knowledge LINKS to a typed fact — by extraction, region and field path — and never copies it: a document fact becomes a client fact only through Knowledge's own confirmation, with its own actor, scope and status.
_Avoid_: Client Knowledge; a duplicated copy of an extraction value living in Knowledge; a value shown without its source version and region; a fact that failed or skipped its arithmetic check presented as validated.

**Field path**:
The canonical name of one value inside an extraction — dot-separated segments under a registered namespace, such as `invoice.total`, `myinvois.supplier_tin` or `pages.1.lines.0`. It is validated at the one write boundary that owns it, so a region can always be traced back to what it claims to be.
_Avoid_: A free-text label; a display name; a path invented by a surface rather than written by a producer.

**Arithmetic validation**:
A named check run over persisted typed facts — the invoice totals identity, a statement's balance chain, its printed totals — recorded with its outcome and its terms. `unmeasured` means the terms the check needs were never persisted, and is deliberately not a pass.
_Avoid_: Treating an unmeasured or not-applicable check as a pass; treating a failed check as a reason to hide the facts, which stay readable and block only dependent work.

**Accounting operation**:
A business action, such as recording an acquisition or settling an invoice, with its required journal effects and related accounting records. Its meaning is the same whether initiated by a person or Clara.
_Avoid_: An arbitrary collection of journal lines as a complete description of every action.

**Accounting impact scope**:
The related accounting records, periods and report outcomes affected by an operation or correction. It includes necessary downstream consequences of completing the intended work.
_Avoid_: Additional authority to act; only the directly edited journal entry.

**Close evidence exception**:
A missing-evidence readiness requirement that an authorised person explicitly accepts for a specified close, with a reason that remains visible in the result.
_Avoid_: A passed evidence check; permission to waive an accounting identity; a standing waiver for future periods.

**Open item**:
A specific receivable or payable whose outstanding amount is tracked against its settlements and corrections.
_Avoid_: The entire balance of an account as a substitute for identifying what remains due.

**Settlement allocation**:
The relationship applying a recorded receipt, payment or credit to a specific open item. It identifies what was settled and by how much.
_Avoid_: A new cash movement merely because an existing movement is matched.

**Observed bank debit**:
A debit that has already occurred in a bank account and is supplied as an accounting fact. Clara may book an unrecorded movement or allocate an already recorded payment without duplicating it.
_Avoid_: An instruction to initiate a payment; authority for a future bank mandate or recurring accounting plan.

**Control account**:
A general-ledger account whose balance must reconcile with its identified detailed accounting records.
_Avoid_: An unrestricted shortcut for changing the total without its supporting detail.

**Operator support case**:
One thing on the estate's admission surface that needs BELCORT's operator firm: an undecided firm registration with no payment against it, a registration payment that has not opened a firm, or a payment-provider event the estate could not act on. Each case names its affected entity and its current state.
_Avoid_: Any view of another firm's books; a support ticket; a paid registration presented as awaiting an operator's approval.

**Support receipt**:
Who decided an operator support case, when, and the reason they gave — the registration's own decision or the provider problem's resolution stamp, read back through the same queue that offered the act.
_Avoid_: The audit trail as a whole; a client-visible notification; proof that money moved.

**Provider problem**:
A recorded payment-provider event the estate's applier could not act on — an unsettled payment, absent metadata, an unknown or mismatched checkout intent, a duplicate payment, or a payment arriving after the checkout was already settled. It is a question for the operator, not a failure of the applicant.
_Avoid_: A failed payment; a reason to re-charge; an error the applicant must resolve.
**Periodic adjustment**:
One completed accounting act that records a movement a period's own facts establish rather than a transaction: a periodic stock adjustment (from a supplied opening/closing count or an instructed movement) or a supplied payroll/statutory obligation. It carries typed particulars — the period, the method or obligation kind, the exact amount, the account each leg plays, where the figures came from and the instruction — and those particulars must agree with the posted entry's own lines.
_Avoid_: A balanced journal entry wearing a marker; an adjustment plan or its scheduled occurrences; a rate, threshold or employee calculation the product worked out.

**Supplied obligation particulars**:
The facts an accountant provides for a payroll or statutory obligation: what it is, for which period, how much, which expense and liability accounts it moves, any staff-advance or settlement account it touches, how much of it was settled through that settlement account when the accountant states a figure, and the source those figures came from. The product records them and checks the relationships between them — a stated settlement amount must be exactly what the posted payment leg carries; it derives none of them.
_Avoid_: A contribution rate or threshold; an employee-level calculation; a settlement allocation nobody stated.

**Capability registry**:
The server-owned catalogue of what a Clara run may exercise, and under what terms: each capability's purpose token, the class of data it moves, whether exercising it is an egress event at all, and the database surface it needs. A run's tool set is built from the hashed bundle's own roster and the registry names what those tools are FOR, so "which capability moved this client's data, under which purpose" is a lookup rather than a grep. It is documentation and a lookup; the database verbs are the only gate.
_Avoid_: A permission; anything a prompt, a file, a wiki page or an imported record can add to; a list of tool names.

**Purpose authorisation**:
A single-use, time-bounded permission to send one client's data outside the estate for ONE named purpose, prepared as an intent and CONSUMED immediately before the act it authorises. Preparing is planning; only the consume is the dispatch, and a withdrawal committed between the two wins. For accounting Work the authority is DERIVED — the firm's current accepted Terms and DPA plus an active client — rather than switched on per client, and the accounting write re-verifies it independently of the human's own role and period checks. Authority must be live at the moment the books move: a withdrawal that lands AFTER the dispatch was consumed still refuses the write. An owner's withdrawal is reversible through its own restore door, which re-derives the basis rather than accepting evidence.
_Avoid_: A standing grant; a per-client "AI on" switch; a quota; a check performed only at planning time; a withdrawal with no way back.

**Execution trace**:
The durable record of what one Work run actually did: one row per step (dispatch, model call, tool call, settle) naming the versioned bundle, the capability, the purpose and the authorisation it spent, the input's digest, the revisions it observed, the timing and the outcome or typed refusal. It carries no prompt, no transcript and no client figures: the relation has no free payload column, every remaining field is bounded and format-checked so none of them can become one, and the writer redacts what it sends. It is read through one firm-scoped, bookkeeper-floored door — no application role can read the relation itself — and there is no export route.
_Avoid_: A log; a span with an attribute bag; anything that stores what was sent; a free-text field on the row; evidence that an effect happened (a receipt is that).
