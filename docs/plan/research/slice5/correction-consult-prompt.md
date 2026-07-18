# Debate: wrong-client correction flow (un-filing a cited document) for Clara Slice 5

You are consulted as an independent senior architect for a DEBATE. Challenge my position, argue each alternative properly, give a decisive verdict. Repo readable read-only (docs/prd/PRD.md invariants; packages/db/migrations/0003_books_core.sql + 0004_governed_fns.sql for reverse-not-delete + provenance mechanics).

## Setting (rulings already made — fixed)
Clara: multi-tenant AI accounting OS, Malaysian firms. Documents are content-addressed (bytes never move), with a NEW multi-client filing model just ratified: one physical document row per (firm, sha256), plus filing rows linking the document to one or more clients. Provenance is structural: a posted journal entry cites (document_id, sha256) and is validated in-txn against the document's filing for that client. Reverse-not-delete: posted entries are never deleted, only reversed with a required reason. Maker-checker hard-gates high-stakes lanes. Everything audit-visible.

## The question
A document was filed to client A and entries were POSTED against it. The firm discovers it actually belongs to client B (wrong-client filing — the firm-killing mistake class). What is the correction flow when someone tries to REMOVE A's filing while A still has non-reversed posted entries citing the document?

## My provisional position (attack it)
Refuse-until-reversed: removing A's filing REFUSES while any non-reversed entry of A's cites the document, and the refusal names the citing entries. The accountant reverses them (each with reason), then un-files A, files B, re-codes. Adding B's filing is always allowed — only removal is guarded. No compound machinery.

## Alternatives
1. Refuse-until-reversed (mine).
2. Guided atomic correction: ONE audited SECURITY DEFINER function that (a) reverses all of A's citing entries with one shared reason, (b) swaps the filing A→B, (c) opens a re-code task for B — one transaction, one approval (maker-checker where high-stakes). Fewer steps at month-end; but one verb performs bulk reversals.
3. Drafts cascade, posted refuse: un-filing auto-discards DRAFT entries citing the doc; posted entries refuse as in 1.
4. Anything better you know from industry practice.

## Evidence to weigh
- What QuickBooks Online / Xero actually do for unmatch / undo-reconciliation / remove-and-redo; Dext unpublish; how they preserve audit trails on corrections; whether any incumbent does compound atomic corrections vs forcing stepwise manual unwind.
- Agentic-SaaS destructive-action patterns: blast-radius disclosure before compound actions, saga/compensation patterns, guided wizards vs atomic verbs.
- Trust + audit optics for a professional accountant and an external auditor: is a one-click compound reversal MORE defensible (single documented correction event) or LESS (concentrated consequence)?
- Month-end ergonomics: a mis-filed supplier statement may have MANY citing entries.

## Deliverable
Verdict (uphold / amend / replace my position), the strongest counter-argument, the concrete recommended flow (DB writer shape + UX skeleton), and edge cases (partially reversed sets, maker-checker interaction, drafts, doc filed to A and B where only A is wrong).
