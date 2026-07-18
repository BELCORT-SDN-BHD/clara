# Slice-5 as-built review — native lane, sub-report: SPEC-COMPLETENESS (§6/§8 audit)

Evidence read: all 15 `rig-docs-*` DB suites + helpers/meta/race, all `intake-*`/
`matcher-*`/`ingest-workflow-db` runtime suites, `relay-taxonomy`,
`rig-events-freshness`, ci.yml. **Top-line:** coverage broad and mostly non-vacuous
(correction, filings-provenance, attribution/matcher, upgrade-drill, AV-scan,
reconciler-CAS, grant-matrix suites are strong); 8 gaps found (G1 Medium, rest Low) +
2 §8 edges without isolated assertions. Orchestrator disposition in brackets.

## Gaps

- **G1 (Medium)** `intake-e2e.mjs` orphaned (standalone `.mjs`, no CI wiring) — the only
  full transport e2e and the §6 "SSE liveness under parse load" + "load ceilings" gates
  never run automatically. [FIX ROUND: env gate parameterized + a CI step with its own
  `clara_intake_ci` DB.]
- **G2 (Low-Med)** DELTA-OWNER-3 freshness proven structurally, never behaviorally — no
  `assert_books_current` call in any docs/matcher test. [FIX ROUND: behavioral test
  added (no-stale unassigned / CLR12 filed / sibling clean).]
- **G3 (Low)** stale-plan tested only via wrong plan_hash; the books_version-drift branch
  undriven. [FIX ROUND: drift test added.]
- **G4 (Low)** metering "adopted duplicate ONE charge" test vacuous (`live.length>=1`);
  the invariant IS covered in intake-db + rig-docs-intakes. [FIX ROUND: de-vacuated via
  the real adoption path + reservation-state assertions.]
- **G5 (Low)** withdrawn exclusion asserted only as line-freeze; TB/context-pack absence
  not observed. [FIX ROUND: pack recent_entries + trial_balance assertions added.]
- **G6 (Low)** ambiguous-citation ABORT staging has a soft-skip escape (raw insert vs the
  pre-0007 belt → noteLane + return). Demonstrably executes in real runs (4/4 incl.
  ABORT). [Recorded; REPORT-51 ambiguity 8; no change.]
- **G7 (Low)** cross-firm behavioral isolation probed on 5 of ~9 human-readable new
  tables (the rest FORCE-RLS-swept only). [FIX ROUND: probe loop extended.]
- **G8 (Low)** "MAX across active filings' clocks" hollow as-built — no FY model, all
  clients yield the same date. [Legitimate AB-4 residual; revisit with the FY/close
  model.]
- **§8-a** "doc filed to A+B, only A wrong → B untouched" — no isolated assertion.
  [FIX ROUND: test added.]
- **§8-b** "partially reversed set → already_reversed, no double-reversal" — preview
  action undriven. [FIX ROUND: test added.]
- Closed-period HARD-BLOCK: vacuous-by-design, correctly flagged in-test as the AB-4
  residual. [No change.]

## Coverage verdicts (abridged)

COVERED: belt-vs-correction commit proof · enqueue-crash drill · reservation storm ·
refund idempotency · retention anchor/floor/unanchor cycle · AV fixtures (storage
untouched) · intake token/lease/CAS/terminal-immutability/duplicate→adopted ·
lock-order deadlock probe · matcher idempotency + dead-letter + consumer-specific
redrive · grant matrix (§3.10, hard/observations) · taxonomy v2 full-coverage ·
freeze-lint (7 files, 3 modules) · filing_id backfill drill (clean; CI-wired) ·
legacy-upgrade fixture · cutover residual sweep · resize/refund races ·
run-binding CAS + stranded requeue + held_egress release · §3.11 fixture provision ·
429 deadline. PARTIAL→fix round: freshness behavioral (G2) · withdrawn read-predicates
(G5) · isolation breadth (G7) · SSE-liveness/load-ceilings CI wiring (G1) · near-limit
duplicate (G4). RESIDUAL (AB-4): closed-period block · max-across-filings distinctness.
