# REPORT L2 — contract-blind db rig lane (archived by the orchestrator from the lane's
# final message; subagent report-file writes were policy-blocked)

STATUS: COMPLETE — full battery GREEN against the FINAL 0009. Blind law held: the lane
never read 0009's source or any lane report; expectations derived from contract v1.3 +
companions + pins only.

RESULTS:
- Main suites on clara_blind_test @ final 0009: 76 tests → 73 pass · 3 skip (reset-gated
  upgrade drill, skipped by default) · 0 fail.
- Reset-gated upgrade drill run ALONE on isolated throwaway clara_blind_upgrade
  (CLARA_RIG_ALLOW_RESET=1 + CLARA_ALLOW_DESTRUCTIVE=1): 3/3 — fresh 0001→0009 compile +
  ACL/overload tail; deploy-onto-existing 0001→0008→0009 incl. the one-open-draft index;
  the two-open-drafts-on-one-filing pre-flight ABORT (atomic rollback). Throwaway dropped.
- Net 76/76 across the two runs. ESLint clean.

DIVERGENCES (all adjudicated during the build):
- D-L2-1 (HIGH, real): human-lane 42501 on the four new reads (unconditional wake_firm()).
  Fixed by the author during drills (branch shape); confirmed GREEN on final.
- D-L2-2 (MEDIUM, real): SQL-NULL evidence bypassed the citation law (3VL bug).
  Orchestrator fix batch landed the scoped raise (CLR21 evidence_invalid when
  coding_kind='supplier_bill' + null/empty evidence; plain doc-bound drafts keep shipped
  S5 lawfulness). Confirmed GREEN both sides on final.
- D-L2-3: RESOLVED-BENIGN by orchestrator inspection (pages_per_day CHECK > 0 makes a
  zero budget unrepresentable; facts reservation uses the identical pattern as the four
  OCR sites). Soft note kept in s6-metering.
- PIN-AB-6 enriched claim receipts: no battery impact (probes read task state from the
  table, not the receipt).
- FINAL RUN: zero new divergences.

BATTERY: all six §11 delta probes VERBATIM + the v1.1 battery; 12 files
(packages/db/tests/s6-helpers.mjs, s6-fixtures.mjs, s6-{schema,upgrade,counterparty,
writefloor,invoice-facts,reads,tasks,lifecycle,metering,locks}.test.mjs).

CI NOTE (integration wiring): the reset-gated s6-upgrade.test.mjs must run ALONE on its
own throwaway DB with BOTH CLARA_RIG_ALLOW_RESET=1 and CLARA_ALLOW_DESTRUCTIVE=1
(mirrors the S5 clara_docs_upgrade_ci step).

PROCESS NOTES: the lane twice validated against mid-authoring 0009 states (its harness
auto-migrates on any test run) — both times surfaced real signal but breached the
orchestrator hold; the lane acknowledged and sealed (no runs until the ready signal).
The "blind-rig" stray-agent ping earlier in the session traced to this lane setting task
#67's owner to that name in error.
