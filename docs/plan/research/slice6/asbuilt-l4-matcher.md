# REPORT L4 — matcher/counterparty-adjacent lane (archived by the orchestrator from
# the lane's messages; subagent report-file writes were policy-blocked)

STATUS: COMPLETE — 62/62 on the affected suites at lane close; the deferred
0009-gated identity suites re-ran 11/11 on the final migration (orchestrator-verified).

FIXES (lane files: lib/matcher.mjs, lib/reconciler.mjs, new lib/reconciler-documents.mjs):
- C-7 runtime reader pin: matcher readMatchInputs now filters
  `engine_kind in ('ocr','structured_parse')` — the second (invoice_facts)
  extraction row can no longer feed a supplier vendor_name into client matching.
- Reconciler lane-aware re-enqueue: the as-built path sent ALL lanes through
  documentIngest; now invoice_facts routes to invoiceFacts_v1 (via the
  enqueueInvoiceFacts dependency wired in startWorld.ts by the runtime lane,
  registry-resolved for the freeze-lint provenance law). To stay under the 500-line
  hook cap, reconciler.mjs split a sibling `reconciler-documents.mjs`, re-exported so
  import sites are unchanged.
- Matcher event-filter regression test: the seven new S6 events flow through the
  consumer offset machinery without matcher mis-claims.

READER AUDIT (C-7 sweep of every document_extractions/document_regions reader):
- Runtime: matcher readMatchInputs — FIXED (above). Other runtime consumers keyed to
  explicit extraction ids — SAFE.
- DB: `record_rule_resolution` (0007:2308-2317) unpinned across engine_kind —
  REPORTED, deferred as amendment AB-3 (benign on the pinned facts vocabulary;
  MUST-FIX before MyInvois). All 0009 reads select explicit (engine_kind, version).
- Dashboard: no implicit-latest extraction readers found.

TESTS (15): s6-matcher-readers (2), s6-matcher-events (2), s6-matcher-reconcile
(4, pure-mock), s6-identity-law (7: birth, registration-reuse,
registration-conflict CLR23, registered-name ambiguity CLR23, unregistered
name-reuse, fingerprint congruence + revise round-trip, two-session birth race).

PROCESS NOTES: the lane never wrote to 0009 (confirmed precisely: session-side
execution of an in-memory copy only); its interface need (enqueueInvoiceFacts)
was relayed and landed via the runtime lane.
