FINDINGS

C-1 — FOLDED — Companion §1 now requires dependency-safe DROP/CREATE for every arity change, one intended overload, PUBLIC-zero-EXECUTE and lane re-grants, required-before-optional parameters, and hashes covering `p_account_class`/`p_proposed_counterparty`.
C-2 — FOLDED — Companion §3 restores the 0007 filing-first → entry → reversal-original order and keeps line-stamp token rotation transactional; the separate facts-writer serialization gap is NEW-1.
C-3 — PARTIAL — The deferred approved-transition trigger and mirror counterparty copy-down are real fixes, but the bill-shape clause is gated by `documents.document_kind='invoice'`, which the absent-facts Tier-B path need not have, so zero-payable Tier-B bills remain vacuously approvable (NEW-2).
C-4 — FOLDED — `revise_entry` now stamps `last_human_editor` in the token-rotating statement and the draft→draft immutability allow-set admits exactly that rebind.
C-5 — PARTIAL — Registration-dominant uniques/conflict handling are improved, but approve compares only the match outcome class rather than the full fingerprint and “re-hydration” cannot update a stale fingerprint, while the co-normative contract still states unconditional name reuse (NEW-3/NEW-7).
C-6 — FOLDED — Counterparties gain the tenant anchor and journal lines a composite firm/client FK, while unsupported merge state is removed until a governed state machine exists.
C-7 — FOLDED — Invoice facts now get an engine/version-pinned extraction row, physical locators, an extended `engine_kind` CHECK, extraction-owned regions, and explicit completed-snapshot reads.
C-8 — PARTIAL — Token rotation plus approve-time evidence re-read is specified, but no common serialization point or deterministic filing/entry lock order is given for `persist_invoice_facts`, so the concurrent close is not yet proved (NEW-1).
C-9 — FOLDED — Same-transaction `entry_evidence`, region↔extraction↔document validation, fact/tier binding, the post-rounding AP/expense/gross equation, due/deposit guards, and the single non-MYR refusal outcome realize the direction.
C-10 — PARTIAL — Failure/refund, attempt cap, status separation, and a second charge are stated, but the claimed fresh reservation is not representable in the listed schema and its settled-plus-reserved daily arithmetic is undefined (NEW-4).
C-11 — PARTIAL — Client-pinned reads, removal of the bare agent entry read, requested-client filing projection, aggregate budget, and OBO-author minting are present, but the below-bookkeeper mint/refusal boundary and oracle-safe result shape are not (NEW-5).
C-12 — PARTIAL — Companion §10 supplies the task-scoped key and recovery concept, but the contract retains the old document/turn key and no writer signature/constraint makes the `coding_attempts` insert atomic with the wake draft (NEW-6/NEW-7).
C-13 — FOLDED — `invoiceFacts_v1` is explicitly a new registered frozen workflow and every enqueue resolves through the registry; `documentIngest_v1` remains byte-identical.
C-14 — PARTIAL — Client/document/result integrity, correction uniqueness, the reachable v1 matrix, insertion point, event tail, notification, and receipt are largely specified, but the filing FK is described only as scalar and the co-normative contract still retains `in_progress`.
C-15 — PARTIAL — Companion §2/§7 correctly key draft uniqueness and uncodedness to active filings (document-keyed evidence can lawfully be shared because rows are entry-scoped), but the contract still mandates document-keyed anti-joins/double-coding and no composite evidence↔entry↔filing congruence is declared (NEW-7).
C-16 — FOLDED — The bounded widened CHECK accepts the reviewed RPR display codes and preserves text identity; existing PK/FK/index, context-pack JSON, lexical filters, and frozen workflow hashes contain no numeric-only consumer assumption, with deploy/FK/context-pack rigs retained as VERIFY-ON-RIG.
C-17 — FOLDED — The operator now discovers/reuses firm/client, does not assume `create_firm` receipt idempotency, verifies receipts/manifests, makes no FY-retention claim, and gates labeled AP/rounding augmentations on owner sign-off.
C-18 — FOLDED — NOLOGIN-first creation, exact membership, production DSN assertion, pool budget/health/teardown, `created_by` plumbing, txn-local secret, COMMIT, and precise connection/cleanup destruction are all stated.
C-19 — FOLDED — Companion §10 defines one `toTypedParts_v2` promotion, ordinary result plus one entry-keyed top-level card, replay de-duplication/recovery, terminal-message-only live policy, and the card/clarify/refusal cap invariant; NEW-6 remains the prerequisite atomicity defect, not a second promotion rule.
C-20 — PARTIAL — The design calls for the per-layer SQLSTATE→CLR→tool→card table and separates 42501/runtime refusals, but §12 still maps only “non-MYR Tier-A” although §4 refuses explicit non-MYR at either tier, and the promised table is not actually enumerated.

## NEW-1 — HIGH — facts completion has no lock-order/linearization contract

- **Section:** companion §3 and §5; contract §4.
- **Evidence:** `approve_entry` is now filing→entry, while `persist_invoice_facts` is only said to update every open document-citing entry to rotate its token; the design never says whether it locks active filings first, in what order it locks multiple entries for a shared document, or whether approve's evidence re-read locks the facts epoch. An implementation can wait on an approve-held entry after doing the facts work, let approve observe the prior committed facts and commit, then commit the contradicting facts after the row is no longer open and therefore never rotate it; adding a locking facts re-read ad hoc can instead create a new cycle. The §11 race remains VERIFY-ON-RIG, but the lock protocol must exist before that probe is implementable.
- **Fix direction:** give facts completion and approval one explicit serialization point: `persist_invoice_facts` locks affected ACTIVE filings in UUID order before their entries, then writes facts/rotates drafts; approve retains filing→entry and re-reads the completed facts epoch under that serialization. State the shared-document order and prove both winners plus correction interaction with lock snapshots and a hard deadlock timeout.

## NEW-2 — HIGH — the structural supplier-bill marker disappears exactly on Tier B

- **Section:** companion §2 supplier-bill floor; contract §4 Tier B.
- **Evidence:** the at-least-one-payable-credit clause applies only to an entry with a `document_kind='invoice'` evidence binding, but the contract says the invoice-facts normalizer is what stamps `documents.document_kind='invoice'`; Tier B is expressly the path where those facts are absent/pending/missed. Such a draft can therefore contain zero payable lines, satisfy the universal payable-counterparty check vacuously, and approve despite S6-R7.
- **Fix direction:** persist an immutable supplier-bill/coding-kind marker on the draft independently of invoice-facts completion (derived by the governed supplier-bill tool/writer, not the model), and have the deferred trigger require at least one payable credit for that marker at every approved transition; keep `document_kind` as evidence metadata, not the enforcement switch.

## NEW-3 — HIGH — fingerprint congruence is incomplete and mismatch refusal has no convergent next act

- **Section:** companion §2 identity law and §3 step 5; contract S6-R8/§6.
- **Evidence:** the stored fingerprint includes `counterparty_id`, normalized identity, and decision, but approval refuses only when the **outcome class** changes; existing-A→existing-B can therefore pass silently. Conversely, new→existing refuses forever because card re-hydration is read-only and nothing updates the stored fingerprint/token. A proposal without registration also searches only registration-null name rows, so an exact-name registered vendor is ignored and a duplicate unidentified vendor can be born.
- **Fix direction:** compare the complete canonical fingerprint, define registered-name hits without a supplied registration as a unique candidate or ambiguity refusal, and add a governed match-refresh/revise operation that persists the new fingerprint and rotates the revision token before the human's next approval; no read-only re-fetch may be claimed to rebind reviewed identity.

## NEW-4 — HIGH — the fresh invoice-facts reservation has no lawful carrier or cap equation

- **Section:** companion §1 object overview and §5 metering.
- **Evidence:** no reservation table is new or altered, while the live `document_ingest_reservations` carrier requires a unique non-null `intake_id`, hard-codes `docs_reserved=1`, and binds one task (`0007_document_pipeline.sql:373-399`). Reusing it for a second pass cannot create the promised fresh page-only reservation without colliding with the settled intake or double-counting the daily document cap. The design also does not state the AB-6/CLR18 admission equation `settled_pages` for settled rows plus `pages_reserved` for unsettled rows under the existing firm advisory lock, nor whether a limit refusal aborts human filing.
- **Fix direction:** either generalize the carrier explicitly or add a processing-call reservation keyed uniquely to the invoice-facts task with `docs_reserved=0`; reserve under the existing per-firm advisory lock using settled+reserved arithmetic, settle/refund exactly once, map every limit path to CLR18, and make filing succeed with an honest Tier-B/held-or-failed facts state if enrichment budget is unavailable. Keep all arithmetic VERIFY-ON-RIG.

## NEW-5 — HIGH — OBO authorization failure is not contained as a typed, oracle-safe tool result

- **Section:** companion §7 first bullet and §10.1; contract §3/§12.
- **Evidence:** v1.2 says only that a below-floor author gets an “honest refusal”; it does not say whether credential mint happens lazily inside `list_unassigned_documents` or at segment setup, what CLR/runtime code is caught, or what result reaches the model/card. The live mint routine rejects a below-bookkeeper OBO with CLR10 before any RLS read, so an uncaught setup-time mint would fail the segment rather than return the promised refusal.
- **Fix direction:** mint OBO lazily inside the unassigned tool boundary (or pre-authorize with the same live membership predicate), translate below-floor/demoted/removed outcomes to one typed refusal independent of document existence/count, expose no raw SQL message, and rig viewer/bookkeeper/demotion/null-client cases for identical no-oracle shape.

## NEW-6 — HIGH — `coding_attempts` is asserted atomic without a mutation path or structural dedup key

- **Section:** companion §1 signature law and §10.2; contract §3 write tool.
- **Evidence:** §10.2 says the attempt is written atomically with the draft, but the only newly enumerated `_draft_entry_core`/`wake_draft_entry` hashed input is the counterparty (plus evidence elsewhere); no `task_id`, attempt payload, or attempt-writer argument/grant is specified. The wake role intentionally gains no new writer, and the sketched `coding_attempts(task_id, document_id, entry_id, ...)` has no declared PK/unique/FK—so runtime cannot insert it after `wake_draft_entry` while preserving atomicity, and WDK recovery/part de-duplication has no structural one-attempt proof.
- **Fix direction:** add task/filing/attempt data to the recreated wake/core signature and request hash, have the core insert the canonical attempt/card payload in the draft transaction, and declare tenant-composite FKs plus a unique authoritative `(task_id, filing_id)` (and unique `entry_id`) key. Probe commit→ACK loss, divergent replay, terminal-message loss, and same document under two client filings.

## NEW-7 — HIGH — the two co-normative v1.2 bodies still prescribe incompatible implementations

- **Section:** contract §3, §5, §7, §12 versus companion §2, §4, §7, §10.
- **Evidence:** the contract still requires `code-doc:<document_id>:<turn_key>` (line 146), unconditional normalized-name reuse (line 226), an `open→in_progress` task matrix (line 258), and `list_uncoded_documents`/document anti-join (lines 242, 265), while the companion requires a task-scoped key, registration-dominant resolution, no `in_progress`, and `list_uncoded_filings`. Both documents declare the same normativity; the delta log is not an executable supersession rule.
- **Fix direction:** update the contract body to the companion's final names/keys/matrices and remove every stale clause, or mark each old clause explicitly superseded at its point of use; add a simple cross-document terminology/contract consistency check before build lanes consume the design.

## NEW-8 — MEDIUM — three required §11 probes are present only in weakened shorthand

- **Section:** companion §11 lines 275-281.
- **Evidence:** all six probe numbers appear, but probe 2 drops the required hard deadlock timeout; probe 4 drops the explicit mismatching-late-facts case; probe 5 drops the FK/index insertion condition and the assertions that 0007 lock order and the event tail remain intact. Those qualifiers were load-bearing parts of the original delta-stage probes, not optional examples.
- **Fix direction:** restore the six probes verbatim (additive cases may remain), including the hard timeout, mismatching facts, exact FK/index DDL, preserved lock order, and event-tail assertions; retain `VERIFY-ON-RIG` on probes 1-5 and the taxonomy additive-insert probe.
