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
work already admitted is untouched) and ended (terminal). Three KINDS exist: a *recurring journal*,
a *reversing journal* (an accrual and its reversal, two legs per period), and an *amortisation
schedule* (a Prepayment schedule's configured plan, whose every period posts its own amount).
Depreciation and close schedules are not plan kinds and are refused by name.
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
An AMORTISATION occurrence posts the amount ITS OWN period was allocated — not the plan's stored
basis amount, which is only the first period's — and a due date the allocation does not cover is a
typed refusal rather than a fall-back to that constant.
_Avoid_: The journal entry as a synonym; a second scan's answer as a second occurrence; treating a
missed period as something the schedule will pick up on its own; treating an admitted accrual as a
posted one; treating an amortisation period's amount as the same as every other period's.

**Prepayment schedule**:
The derived amortisation of ONE posted prepayment: the recognition entry that put it on the books,
the prepaid account read off that entry's own single debited asset leg — and judged ELIGIBLE by the
same rule every other lane uses, so a receivable control, a bank account or a reserved role is
refused rather than amortised — the Service period its document states, the expense account a
person judged with the grounds they stated, and the exact allocation across whole calendar months
with the remainder wholly in the final period. It is DERIVED, not typed: the amount, the period
count, the per-period figures, the cadence and the authority window all come from the frozen
evaluator's reading of rows this database already holds, and the only things a person supplies are
which prepayment, under WHOSE INSTRUCTION, which expense account, why, and what the schedule is
for. It configures an Accounting plan of kind `amortisation_schedule`; the belt
admits each period.
_Avoid_: A recurring adjustment template as a synonym; an editable table of period amounts; a
schedule that pays anything — the money left the bank before the schedule existed; "configured" as
a synonym for "posted", which is a different fact and a different count.

**Service period**:
The span of time an accrued or prepaid cost belongs to, stated by an identified person — for a
prepayment, the stretch of calendar the payment buys, as stated on the DOCUMENT that evidences it and
recorded with the grounds the person gave. Where it was anchored to a filed document it is bound to
that document's own term record rather than restated, and a disagreement between the two is refused
rather than resolved. At document grain it is supersede-never-mutate — one live period per document
— and it is human-stated by law: no agent path to it exists, because a period a model read off a
document is a model-generated value and never enters the durable record. A schedule derived from it
keeps naming the exact row it rode, so a later correction supersedes that row without silently moving
an allocation that has already begun posting.
_Avoid_: The posting date; the authority window; an effective date range on a plan; a fiscal period;
an extracted or inferred period; a term the product derived from an invoice's own dates, a filename,
a date range it saw, or a conversation it summarised; treating a corrected term as something a
revision re-derives — a re-derived allocation is a new schedule.

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

**Work attention facet**:
A count of DISTINCT Accounting work ids satisfying one attention predicate for one client — what
is waiting on a person, what is queued or running, what a committed operation receipt dates inside
the last seven `Asia/Kuala_Lumpur` calendar dates. Facets overlap and are never summed; no
financial period narrows one; an unread facet is *unknown*, not zero.
_Avoid_: A total; a page length; a synonym for a review-queue row count.

**Work pack**:
The one client-scoped read carrying the active and recent-success facets, each with its coverage,
plus the instant the read itself happened. The needs-you number is not in it: the pack names the
review-queue count that owns it.
_Avoid_: Calling its read instant a watermark; treating it as the needs-you source.

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

**Client onboarding plan**:
The record of what a firm must establish about one new client before its books open: the questions asked, the answers given, who gave each one and when, and a permanent revision trail in which an amended answer supersedes its predecessor rather than replacing it. Exactly one plan can be open per client; committing it activates the client, and cancelling it archives the client instead. A committed plan's answers are carried into Client knowledge and onto the client's own canonical record by separate, named acts — the commit itself writes neither.
_Avoid_: An approval ritual standing between a client and ordinary bookkeeping; a checklist a person can edit in place; treating the interview conversation as the plan.

**Client identity candidate**:
An existing client or live counterparty of the same firm that a proposed client name (or a supplied registration identifier) already matches, shown with the reason it matched so a person can decide whether this is the same business. The estate's own ambiguity rule is arity: **two or more** candidates is a refusal, one is a candidate to look at and acknowledge, none proceeds silently.
_Avoid_: Presenting an exact-name check as duplicate detection — a same-name clash is one match among several kinds, and a single same-family party has never been "ambiguous" in this estate; treating a candidate list as proof that a second record is wrong, or its absence as proof that it is right.

**Opening position**:
What a client's books start from: either a first year of trading, where there is nothing to carry down and no opening balances are owed, or a prior period's closing position that must be brought in and tied out before the books can be relied on. The second is owed work whether or not anyone has started it.
_Avoid_: Treating a deferred carry-down as "no opening needed"; treating an empty opening register as evidence of a first year; a blanket onboarding sign-off standing in for either.

**Invitation**:
A single-use, time-limited admission into a firm that already exists, bound to one email address
and to one role. Its secret is handed to the issuer exactly once and never stored, so an
invitation cannot be re-sent: a fresh one is made by revoking the old one and inviting again, and
the old link dies at that moment. Until it is accepted it is a DELIVERY state, not a membership —
it grants nothing and appears in its own list.
_Avoid_: Resending the same invitation; a pending invitation shown as a member; self-serve
creation of a new firm as a synonym for joining one; a per-firm seat count as a reason to refuse
one (see **Admission capacity**).

**Membership / Roster**:
The firm's live list of who holds access and at what role, read at two different floors: the
roster from bookkeeper upward, and the invitations from admin upward. It is the authority a
surface re-reads after every act, never the view a completed act reported about itself.
_Avoid_: A cached list a client painted optimistically; a removed membership treated as
re-activatable — there is no re-activation, only a fresh invitation.

**Role ladder and rank wall**:
Four ordered roles — viewer, bookkeeper, admin, owner — and the five walls the member doors apply
in order: an admin-or-above floor; a ceiling refusing a role above the actor's own; a target wall
refusing an act on anyone ranked strictly above them; a refusal to act on themselves; and the
last-owner trigger that refuses the demotion or removal leaving a firm with none. A caller's rank
is re-read inside the door, after its lock, rather than trusted from the request.
_Avoid_: A client-side rank check as the wall; treating a control the interface shapes away as a
permission; assuming a rank observed at page load is still the caller's.

**Access history**:
Granting, changing and withdrawing access are receipted, append-only facts: each writes an audit
row and a domain event in the same transaction as the change itself, and a withdrawal wins over
any operation that commits after it. What is *not* yet true is that a person can READ that history
as access history — the activity feed's kind ladder files these events under `documents` and its
filter vocabulary offers no value that reaches them.
_Avoid_: Reading the current roster as the history of how it got that way; treating the events'
existence as evidence that a product surface can find them.

**Confirmed client knowledge**:
Durable information already accepted about a client, retained across conversations. A new chat does not withdraw or amend that information.
_Avoid_: Chat history.

**Client knowledge**:
The client's facts, identities, aliases, durable preferences, policy information and source-linked accounting experience, with their sources and verification state. Explicit information may be saved automatically; an agent's inference is not automatically confirmed knowledge.
Every governed record carries one of four **kinds** — a *stated fact* (what an identified person supplied), an *extracted fact* (read from a named source version), a *preference* (a durable instruction) or a *policy* (a decision about how the books are prepared) — and one of four **trust levels**, derived from where it came from and never supplied by the caller: *asserted*, *extracted*, *imported unverified* and *inferred*. A policy admits `asserted` alone.
A counterparty's identity is *shown* in the client's knowledge area but is not a governed knowledge record: it is kept in the counterparty relations, with its own provenance, correction history and merge lineage (see **Counterparty identity** below), so there is one identity writer and not two.
_Avoid_: An unqualified bag of chat messages; a synonym for authority to post; treating an imported bundle's own "verified" annotation, or a model's own confidence, as a trust level; calling a counterparty identity a knowledge record because it is rendered beside them.

**Knowledge revision**:
One attributable version of a knowledge record. A capture is revision 1; a correction and a withdrawal each append a further revision naming its actor and its reason, and leave the revision they retire readable. A withdrawal is terminal for that record — a later statement of the same thing starts a new record with its own history.
_Avoid_: Editing a knowledge value in place; a correction with no stated reason; presenting a withdrawal as the absence of a record.

**Knowledge pack**:
The bounded set of a client's live knowledge records read for one stated purpose, with the firm's current knowledge version as its watermark. A pack that could not be read is *unavailable* and says so with its reason; it is never presented as a client with nothing recorded, and it is never a reason to ask someone to repeat information they have already given. Its contents are supplied data, never instructions to the agent.
_Avoid_: An empty pack standing for a failed read; a pack presented as authority to post; treating a value inside a record as a direction.

**Firm knowledge default**:
An explicitly firm-scoped instruction or preference that applies across authorised clients while preserving their established exceptions. It is a rule about how the firm works across its clients, which is what distinguishes it from a **Firm profile fact** — a statement about the firm's own circumstances, which applies to nobody but the firm.
_Avoid_: Automatically sharing one client's private facts or practices with every other client.

**Counterparty identity**:
Who one supplier or customer of a client *is*, as a durable record: a stable tenant-scoped id that survives every rename and merge, the current name, the registration number and TIN, every alias, and the correction history behind all of it. A vendor and a customer are separate identities even under one name, and two clients of one firm may carry the same registration number or TIN without being linked.
_Avoid_: The displayed name as the identity; a binding ceremony as a prerequisite for working with a party; linking two clients' parties because an identifier matches.

**Counterparty alias**:
Another name the same party is known by — a former name, a trade name, a name a person stated or a name read off a named document. Each alias records the lane that wrote it (a person in the app, Clara, client setup, or an unrecorded legacy lane), the stated basis and, where one exists, the source document and extraction it was read from. Retiring an alias stops it matching new activity and keeps it readable as history.
_Avoid_: Labelling a machine-written alias as a person's; a source claimed with no document behind it; deleting an alias to correct it.

**Identity correction**:
One attributable, append-only entry in a counterparty's identity history: a rename, an alias added or retired, an identifier change, or a merge. Each names its actor, its lane, its basis and the before and after values, and none is ever edited or removed. Correcting identifiers replaces them and keeps the previous pair in this history rather than only in an operator audit trail.
_Avoid_: Overwriting an identifier in place; a correction with no stated basis; treating the absence of a history entry as proof nothing changed.

**Merge lineage**:
The record of what a supported merge actually did — which party absorbed which, by whom, when, and on what reason — kept so that booked rows stay attributable to the party they named while current reads resolve to the surviving one. There is no un-merge anywhere in Clara; a merge recorded before lineage was kept cannot even be *described*, and the surface says which of the two a given merge is.
_Avoid_: Promising a reversal; presenting a pre-lineage merge as correctable; rewriting historical references to the surviving party.

**Firm setup**:
The resumable list of facts a firm must state about itself, derived from the real required items on the firm's own setup record. Progress is the count of those required items that are settled; an item already answered is never asked again, an optional item may be set aside with a stated reason, and the rest of the workspace stays usable throughout.
_Avoid_: A progress bar with no required items behind it; an onboarding approval ritual; treating optional education as a prerequisite.

**Firm profile fact**:
A firm-scope knowledge record about the accounting firm's own circumstances, carrying its source, its actor and its revision history like any other knowledge record. Distinct from a client fact, which belongs to one client, and from a **Firm knowledge default**, which is a cross-client instruction rather than a statement about the firm. The firm's registration identity — its registered name, registration number, tax identifier, registered address and professional-body number — is recorded on the firm's setup record with its author rather than as a knowledge record.
_Avoid_: Recording a firm fact as a client fact; reading a firm profile fact as authority to post.

**Knowledge promotion**:
The explicit, authorised act of making one client's recorded practice apply firm-wide: who promoted it, on the authority that act required, for what reason they wrote at the time, to what applicability and from when. Only a key the firm may hold on its own behalf can be promoted, and the rule cites no evidence belonging to a single client.
_Avoid_: Copying the client record's own basis across as the firm's reason; promoting a fact about one business; a rule that reaches other clients without a named person having said it should.

**Client knowledge exception**:
An established client-scope record that keeps governing that client after a firm default is recorded for the same key and the same applicable conditions. It is a decided outcome, not an unresolved contradiction, and the client's own register says which of the two applies and why.
_Avoid_: Presenting an exception as a conflict; treating a narrower client condition as overriding a firm rule that covers different conditions.

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
One question Clara asks inside a conversation while a turn is still running, answered in that same conversation. It lives only on the run's live stream — settling the turn cancels it in the same statement sequence that writes the assistant message — so it is answerable during the turn or, after a reload, from the row the run is parked on; its 14-day deadline is enforced by the runtime's expiry sweep, which moves a past-due clarification to expired so the parked turn settles and the conversation is usable again (#720 Half 1); <!-- #764 -->a clarification whose resume hook cannot be reached is no longer recorded as delivered — it rests at `hook_missing` with a timestamp, and the chat-clarify reconciler re-probes it after a grace: a hook that has become reachable resumes the turn, and a hook the engine can no longer account for settles the turn `expired` with a clarification-closed part, releasing the session's live-turn slot (#764).<!-- /#764 -->
_Avoid_: A Work question as a synonym; an approval gate; a chat message that merely mentions a question.

**Delivery state**:
The runtime's record of whether a settled Work question reached the parked run: pending, leased by one worker, delivered, or resting as unreachable when the engine's hook is gone. It is stamped with its own instant so a grace can be measured, and it never reopens a question or replaces its status.
_Avoid_: A second question status; proof that the Work advanced.

**Evidence link**:
The append-only record that one client document is the source behind one posted journal entry: which Work and operation identity bound it, who bound it, when, and whether it was bound as the entry was recorded or attached afterwards. A document backs at most one live posted entry; a reversal releases the link so the corrected entry may cite the same document. Evidence is optional — an entry recorded without a document is a complete accounting fact.
_Avoid_: A column rewritten on the posted entry; a claim that the document was independently verified; "unsourced" as a synonym for "wrong".

**Document filing**:
One live placement of a document into one client's books, with the attribution act that authorised it. A document may be filed to more than one client of the firm at once, and a filing is *retired* rather than deleted — a retired filing stays readable, names its reason and, when a wrong-client correction retired it, the correction that did so.
_Avoid_: The document itself; "unfiled" as a synonym for "not yet read"; deleting a filing.

**Source revision**:
One attributable change a person makes to what a document *says* — a typed fact value or the document kind — recorded with the actor, the reason, and the source version they were reading. The reading it replaces is never edited: a revision appends a new version of the document's facts and the previous one stays readable alongside it. A revision written against a reading that has since moved is refused and the attempted value is handed back, never silently applied.
_Avoid_: Editing a fact in place; re-running the machine reader as a synonym for correcting a value; a revision with no stated reason.

**Wrong-client correction**:
The guided move of a document from the client it was filed to onto the right one: preview the impact, propose a plan bound to the books as they stand, have a second eligible person approve it, then reverse each affected entry, retire the original filing and create the new one. It is a different record from a source revision, and the two are read together as one history rather than merged into one relation.
_Avoid_: Editing the filing; a correction that rewrites a posted entry; presenting the moved document as never having been here.

**Correction Work**:
The accounting work that carries an accepted source revision through to posted results — reversing or replacing what the books already recorded. It does not exist yet: today an accepted source revision is recorded and its accounting impact is shown as pending, separately and by name.
_Avoid_: Presenting a recorded source revision as a corrected set of books; fabricating a completed correction; an in-place rewrite of a posted entry.

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
It is a limit on FIRMS, and the invitation path into a firm that already exists never reaches it:
there is no per-firm seat count in this estate, and seats are explicitly deferred product scope
(`docs/PRD.md:126` — accepted direction, delivery date undecided). An invitation is therefore
refused for a role, an address or a rank, never for capacity.
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

**Staff expense claim**:
One completed act recording who spent what, on which itemised basis, when it was incurred and when it posts, and which of reimbursement / advance application / already settled it is. The claimant is a STAFF-ADVANCE ENROLMENT HANDLE, not a person record: a claim names the account the firm keeps for that person, and a claim for somebody new enrols one inside the same transaction. Supplied tax facts are carried verbatim and validated against nothing. Its Work's purpose is the plain `journal_entry` every manual posting carries; what makes it a claim is the claim object, not a purpose value.
_Avoid_: A balanced journal entry with a memo; a payroll run; an employee master record.

**Employee payable**:
A non-control liability owed to a named claimant, tracked in the staff-expense-claim register and never in AR/AP aging. It is a liability leg on an ordinary payable account (the starter chart's `2010 Other Payables`, whose `account_class` is null) plus the claim that explains it — because an open item is structurally a counterparty's claim, an employee may not be a counterparty, and a control-account leg is refused outright.
_Avoid_: An AP open item; a counterparty.

**Advance application**:
The discharge of a recorded staff advance by a stated allocation: WHICH advance, for how much, effective on the day the money actually moved. The register never infers it — a credit on an enrolled advance account that does not say which advance it discharges is refused by name.
_Avoid_: A silent FIFO; a GL credit with no named advance.

**Claimant handle**:
The staff-advance enrolment a claim is recorded against — an account dedicated to one person, carrying the name the register shows and the professional's own written attestation. It is what lets two claims by one person be read together. NAMED LIMIT: it is a label on an ACCOUNT, not a person record, and the estate holds no staff master; two people who have never been given a dedicated account cannot be told apart by it.
_Avoid_: An employee record; a user; a counterparty; a free-text name typed on each claim.

**Accrual adjustment**:
A cost a period has incurred but nobody has invoiced yet, recorded with the particulars that make it
checkable: the amount, the expense account it charges and the non-control liability account it
accrues into, the SERVICE PERIOD it belongs to, the rule that selects each period's amount, the
window its authority covers, and the instruction that authorised it. Its authority window runs
INSIDE the service period it names — it starts no earlier and ends no later, and it always ends — so
every entry it posts falls within the term it claims to accrue for, and its schedule must reach at
least one accrual date inside that window: a term too short for its own day rule is refused at the
day rule rather than recorded as a schedule that can never post. It rides the accrual-and-
reversal schedule rather than standing alone, so accepting one records the schedule, its first due
event and the accounting work for it — and posts nothing.
_Avoid_: A balanced journal entry wearing a marker; a periodic stock adjustment or a supplied
payroll obligation (those record a movement the period's own facts establish, have no schedule and
no future occurrence); a provision or an estimate the product worked out.

**Accrual reversal**:
The second leg of one accrual's schedule: the same entry with both sides exchanged, due on the first
day of the period after the one it accrued for, and NAMING the journal entry it undoes. It is
admissible only once its own period's accrual has POSTED an entry that is still live — never merely
because that accrual was admitted — and a reversal the lane reached before then is recorded as
refused, with which of the three ways the accrual failed to stand behind it.
_Avoid_: A correction; a cancellation; a separately authorised entry; treating an admitted accrual
as a posted one.

**Calculation method**:
The rule that says WHICH stated amount each of a schedule's periods uses. It selects among amounts a
person supplied; it computes none, which is why it is a closed set of named rules rather than a
versioned formula. Today the set holds exactly the rule the schedule performs — the amount stated on
the record, accrued in every period of the window — because a recorded selection nobody performs is
a promise the ledger does not keep.
_Avoid_: A rate, a proration or an allocation the product performs; a formula; a rule offered on a
form that no lane applies; anything a caller can extend without a new named rule.

**Supplied obligation particulars**:
The facts an accountant provides for a payroll or statutory obligation: what it is, for which period, how much, which expense and liability accounts it moves, any staff-advance or settlement account it touches, how much of it was settled through that settlement account when the accountant states a figure, and the source those figures came from. The product records them and checks the relationships between them — a stated settlement amount must be exactly what the posted payment leg carries; it derives none of them.
_Avoid_: A contribution rate or threshold; an employee-level calculation; a settlement allocation nobody stated.

**Fixed asset acquisition**:
The moment a client takes an asset onto its books: one approved journal entry whose debit lands on
an enrolled fixed-asset cost account, and — in the SAME transaction, on whichever lane posted it —
one register row naming that entry, that cost line, the date, the exact cost and the source
document the entry cited. It is COMPLETE when those facts are recorded; the depreciation
particulars are a separate, later fact and their absence takes nothing away from it.
_Avoid_: A journal entry alone as a synonym; a second step a person can forget; treating an
acquisition as unfinished because its depreciation is not yet configured; an acquisition on
supplier credit (that reaches the register through document intake and coding, never a general
journal).

**Pending particulars**:
A register row whose acquisition is recorded and whose depreciation configuration is not. It is a
live, usable asset with a stated cost and a named source; what is outstanding is only the
configuration the depreciation run depends on, and the run skips such a row BY NAME and charges
every other asset as usual.
_Avoid_: An incomplete or draft asset; a failed acquisition; a reason to hold the journal entry; a
row the depreciation run treats as an error.

**Depreciation particulars**:
The depreciation configuration of one asset: the method, the in-service date it starts from, the
useful life and — for reducing balance — the annual rate, plus any residual value and the asset's
own description. An in-service date is required for every method, including an asset that is
stated as not depreciated. Supplying them completes a REGISTER fact and never writes a second
journal entry.
_Avoid_: A depreciation authority (that is the firm's permission to run it); a schedule (that is
what these produce); a policy the product infers from the evidence; a second accounting entry.

**Dependent particulars question**:
The ONE versioned question a Work opens after it has already posted an acquisition, asking for the
depreciation particulars it could not know. It parks that Work and nothing else: the acquisition is
committed and stays committed whatever the Work's status becomes. Answering it from any entrance —
the register, the asset's own page or Needs you — continues the same Work and the same question.
_Avoid_: A question that blocks the acquisition; a second question per Work; a reason to re-post;
a clarification a new conversation can restart.

**Capability registry**:
The server-owned catalogue of what a Clara run may exercise, and under what terms: each capability's purpose token, the class of data it moves, whether exercising it is an egress event at all, and the database surface it needs. A run's tool set is built from the hashed bundle's own roster and the registry names what those tools are FOR, so "which capability moved this client's data, under which purpose" is a lookup rather than a grep. It is documentation and a lookup; the database verbs are the only gate.
_Avoid_: A permission; anything a prompt, a file, a wiki page or an imported record can add to; a list of tool names.

**Purpose authorisation**:
A single-use, time-bounded permission to send one client's data outside the estate for ONE named purpose, prepared as an intent and CONSUMED immediately before the act it authorises. Preparing is planning; only the consume is the dispatch, and a withdrawal committed between the two wins. For accounting Work the authority is DERIVED — the firm's current accepted Terms and DPA plus an active client — rather than switched on per client, and the accounting write re-verifies it independently of the human's own role and period checks. Authority must be live at the moment the books move: a withdrawal that lands AFTER the dispatch was consumed still refuses the write. An owner's withdrawal is reversible through its own restore door, which re-derives the basis rather than accepting evidence.
_Avoid_: A standing grant; a per-client "AI on" switch; a quota; a check performed only at planning time; a withdrawal with no way back.

**Execution trace**:
The durable record of what one Work run actually did: one row per step (dispatch, model call, tool call, settle) naming the versioned bundle, the capability, the purpose and the authorisation it spent, the input's digest, the revisions it observed, the timing and the outcome or typed refusal. It carries no prompt, no transcript and no client figures: the relation has no free payload column, every remaining field is bounded and format-checked so none of them can become one, and the writer redacts what it sends. It is read through one firm-scoped, bookkeeper-floored door — no application role can read the relation itself — and there is no export route.
_Avoid_: A log; a span with an attribute bag; anything that stores what was sent; a free-text field on the row; evidence that an effect happened (a receipt is that).

**Intake receipt**:
The durable per-upload record a file's arrival leaves behind, in its own right and independent of the browser session that made it: who uploaded it, from which entrance (documents tab or chat), the declared name, type and size, the status it has reached and — once custody happens — the document it became. It is recoverable at mount, so closing the tab mid-batch loses the QUEUE and not the answer; and it carries no client, because attribution is a separate act on the document rather than a property of the upload.
_Avoid_: Treating `finalizeIntake`'s own advisory return as the receipt (only a subsequent read is DB-confirmed); the upload queue's in-memory row; a record that implies the file was filed to anyone.

**Unassigned source**:
An adopted document with no live filing: the firm holds it and its bytes are sealed and readable, but no client's shelf has claimed it. It is firm-visible, awaits exactly ONE attribution act, and leaves the population the moment that act lands. A document that is unassigned is not a document that failed — it is a document nobody has answered a question about yet.
_Avoid_: An unprocessed or failed upload; a document whose filing was retired (that one has a history); a per-person inbox — the population is the firm's, not the uploader's.

<!-- #642 -->
**Turn key**:
The caller's **content-addressed** identity for one message intent: a stable address over the conversation, the altitude, WHERE IN THE CONVERSATION the instruction was given, the message text and the set of documents attached to it. A retry of the SAME intent reuses it and the estate returns the turn it already admitted — a refused or lost send adds nothing to the transcript, so the retry stands in the same place; a CHANGED intent — including a changed attachment set, and including the same sentence given again after a turn has settled — derives a new one and is admitted as the new turn it is. It is what makes a lost acknowledgement safe in both directions: the same instruction is never accepted twice, and a corrected or repeated instruction is never swallowed by the first.
_Avoid_: Treating a fresh uuid per press as idempotency; a session-scoped or handed-out key (either can silently resend, or silently DROP, a changed attachment); an address made of content alone (a repeated "yes" is a new instruction, not a retry).

**Conversation scope**:
The firm or client a conversation's executions belong to, named beside the composer so the person can see whose books an instruction will move before they send it. It is read-only here — switching scope is the shell's act — and it is never guessed: an identity that has not been positively read renders a neutral placeholder rather than the client whose name was on screen a moment ago.
_Avoid_: Inferring it from the URL alone; a second scope switcher; a stale name carried across a switch.

**Tool outcome**:
What the transcript records about ONE step Clara took: *preparing*, *running*, *done*, *failed*, or *refused* — the tool ran and declined in its own typed vocabulary, which is not the same as failing. The states are read from what the run actually reported, live while the turn is still going and from the settled transcript afterwards; a step with no reported outcome says so rather than being assigned one.
_Avoid_: Reading a tool-call count, prose or a shimmer as accounting completion; a *queued* state (nothing on the stream reports admission); presenting *preparing* as *queued*.
