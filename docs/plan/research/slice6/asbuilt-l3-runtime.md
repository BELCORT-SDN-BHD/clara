# REPORT L3 — runtime lane (archived by the orchestrator from the lane's message;
# report-file writes were policy-blocked for subagents)

STATUS: BUILT + GREEN on all lane gates. Orchestrator independently re-ran: freeze-lint OK
(17 frozen files, append-only-vs-main, v1 BYTE-untouched, registry monotonicity chatTurn
v1→v2 + new invoiceFacts), runtime s6 suites green with lane env (write-floor 4/4 vs
clara_rt_test; note: s6 suites REQUIRE PG* env — a no-env run fails at file level, not
skip; standardize env at integration).

GATES: typecheck clean · lint clean · nitro build OK (WDK lists chatTurn_v1/v2,
documentIngest_v1, invoiceFacts_v1) · freeze-lint OK · s6 tests 25/25 (lane run).

BUILT:
- chatTurn_v2 frozen closure (6 files, split for the 500-line cap): attachment
  perception, firm-scoped read tools, draft_journal_entry write wrapper (server-side
  sha256/resolution/books_version; op_key code-doc:<task>:<doc>; coding_kind marker;
  14-arg wake_draft_entry; p_coding), OBO-lazy reads (NEW-5), C-12 recovery, C-19 part
  promotion + terminal invariant.
- Write floor in pools.mjs: clara_wake_write_login pool + withWriteWakeScoped +
  mintWakeCredentialObo + fail-closed boot assert (CLARA_WRITE_DATABASE_URL).
- invoiceFacts_v1 (Azure prebuilt-invoice, 429-surviving deadline).
- PIN-AB-2 scanner degrade: clamd non-fatal + bounded-backoff restart + honest 503
  fail-closed intake admissions.
- L4's wiring order landed: lane-aware enqueue invoice_facts → invoiceFacts_v1 in
  startWorld.ts.

CROSS-LANE FINDINGS:
1. (L1 observation, mid-draft) applying the then-current 0009 draft to clara_rt_test
   failed: "active taxonomy coverage is not whole (missing 4)" — 4 new event types
   lacked trigger_taxonomy coverage rows at that moment. Codex's own drills adjudicate
   on the final file; integration verifies regardless.
2. TOP BLOCKER — invoice-facts task DISCOVERY: DB-created invoice_facts tasks (enqueued
   at filing time in-writer) have no runtime sidecar; the reconciler needs either
   clara_runtime SELECT on document_processing_tasks + documents (NOT in companion §9)
   or a claim/list receipt carrying storage_path/sha256/mime. Orchestrator ruling
   pending on L1's final file (candidate PIN-AB-6).

INTEGRATION CLOSE-OUT (final 0009 on clara_rt_test): FULL runtime suite 149/149, 0
skipped (orchestrator-verified by independent re-run) — includes every legacy suite,
L4's matcher/identity suites, and the four L3 s6 suites; the two mid-draft
correction-adjudication failures gone; PIN-AB-6 receipt fields align with
interpretClaimReceipt/docFromReceipt; the draft wrapper's zod schema (evidence min 1)
means the D-L2-2 raise is never hit spuriously. Lane CLOSED pending the as-built dual
review + GATE-3.

OPEN SHAPE QUESTIONS (reconciled at integration vs actual 0009): get_document_extract
facts shape; p_proposed_counterparty jsonb shape; get_coding_attempt return shape;
whether OBO minting narrows advisory reads to bookkeeper+ (behavior surfaced to the
as-built review); CLARA_WRITE_DATABASE_URL deploy ordering (secret before image —
deploy-runsheet item).
