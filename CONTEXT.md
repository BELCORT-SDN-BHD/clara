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

**Work batch**:
A group of accounting work tracked together. An item waiting for information holds its dependants, while independent items may continue and retain their own outcomes.
_Avoid_: A single all-or-nothing accounting transaction.

**Needs you**:
The view of work awaiting information or a decision from a person. Answering there continues the same work and question seen elsewhere.
_Avoid_: A separate execution queue; every technical failure as a question for the user.

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
_Avoid_: An unqualified bag of chat messages; a synonym for authority to post.

**Firm knowledge default**:
An explicitly firm-scoped instruction or preference that applies across authorised clients while preserving their established exceptions.
_Avoid_: Automatically sharing one client's private facts or practices with every other client.

**Accounting experience**:
A source-linked lesson from completed work or a correction, including the outcome and conditions in which it is useful. Clara can consult it when deciding how to handle later work.
_Avoid_: A confirmed policy merely because an action succeeded or was repeated; authority for a future posting plan.

**Posted journal entry**:
The recorded debit and credit effects of an accounting event on the general ledger. Related assets, outstanding items, allocations, schedules and period decisions carry additional business meaning.
_Avoid_: Every change to product or accounting state.

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

**Accounting plan**:
An authorised instruction for accounting actions across future periods, including its calculation basis, timing and effective scope. A plan is distinct from the entries resulting from its execution.
_Avoid_: A posted journal entry; an inferred obligation created merely by observing repetition.

**Control account**:
A general-ledger account whose balance must reconcile with its identified detailed accounting records.
_Avoid_: An unrestricted shortcut for changing the total without its supporting detail.
