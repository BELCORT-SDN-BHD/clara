# Clara — forward roadmap, risks, and the Phase-5 verification plan

*Carried verbatim-in-substance from the former REBUILD-PLAN at its deletion (the
2026-08-12 harness refactor, ADR-0069). The dated STATUS chronology lives in
`docs/plan/completed/rebuild-plan-history.md`; live state is `PROGRESS.md`; the `coding_kind`
roadmap table moved into `docs/ARCHITECTURE.md`.*

## Wave F — tax

The SST engine per the practice map (periods, payment basis, dual-registrant exports, SST-02,
bad-debt relief); the payroll deadline calendar; **last: the draft tax computation**
(add-backs, CA, chargeable income, forms — the slice allowed to slip to v1.1). *Inherited by
ADR-0065:* the **settlement-corroboration door BUILD** (E-R13 — executes the registered 7A-R3
narrowing + defines the alternate corroboration predicate) · the **claims accounting class**
(employee paid-on-behalf, E-R10) · **third-reader planning** (#25) · the **FX-lite decision**
(passed through the E grill unruled — must be ruled at F planning).

## Wave G — the OS surface

Proactive inbox (allowlisted wakes), cross-scope needs-you, ⌘K Ask/Do/Go + ActionPanels,
plan-as-document for close/onboarding, exports UI, generative-UI completion + parity CI gates,
the design floors (`docs/design/` populates here). *Inherited by ADR-0065:* the **UX-debt
backlog** (E-R10: userflow/signin/signup/firm-setup · raw-document click-through · real
session auth replacing the hand-mint JWT) · the **claims submission/approval surface**.
*Close-out (owner-ruled 2026-08-11, ADR-0068-adjacent):* the **factory reset + full E2E
rebuild from raw documents** — the definitive stuck-bytes discharge; beta's "real data
untouchable" resumption rides the same gate.

## Risks (top 8)

| # | Risk | Mitigation |
|---|---|---|
| 1 | WDK in-flight-run replay across deploys (verified doc-silent) | Slice-0 spike ACs; pinned versions; name-versioned workflows; drain-active-runs deploy policy; LangGraph fallback behind the seam |
| 2 | Intrinsic side-effects widen the audited-fn surface (composite writers) | One composite fn per workflow class, rig-tested with negative paths; the F3 failure criterion as a per-wave regression suite |
| 3 | Scope creep in the compliance-correct core | The practice map's Part-5 scope ledger is the authority; tax-comp is pre-authorized to slip |
| 4 | The wiki becomes an unbounded token/complexity sink | Lint caps page count/size per client; context packs inject pages by relevance budget; wiki is advisory-only so degradation is graceful |
| 5 | C6 checklist slips (DPA/disclosure/PDPA) while tracing ships | Vendor trace export is **feature-flagged off** until the checklist is evidenced; DB run history carries debugging meanwhile. **Ownership: the DPA execution, the firm-facing disclosure text, and the PDPA cross-border check are OWNER/legal work items (Tao), tracked from Gate-2 approval — engineering's only task is keeping the flag off until all three are evidenced** |
| 6 | Design ambition (parts[], cards, evidence viewer) outruns the build | The design-critical path (`docs/design/PRODUCT_DESIGN.md`, formerly DIRECTION.md) is ordered; the fail-closed catalog means unbuilt cards degrade to nothing, never to broken UI |
| 7 | Old-build habits re-imported via ported code | Every PORT lands with its tests + a re-review against the findings that touched it; DROP list enforced in review |
| 8 | Single-maintainer bus factor on a bigger stack | Boring choices everywhere else (Next.js, Postgres, shadcn); the runtime is the one novel bet, seam-isolated |

## Phase 5 — the verification plan (the hero prompt's criteria, made falsifiable)

Run against synthetic / labelled-synthetic data — local/dev, **or the live sandbox firm**
under ADR-0048's pulled-forward methodology and **ADR-0060's pre-beta data doctrine** (every
firm's data in the live project is partner-authorized test state until beta; mechanisms,
process and secrets stay unrelaxed). Every scenario records: **what was read, changed,
synced, skipped, or blocked.**

1. **End-to-end use cases** (each with evidence): document ingestion + classification; bank
   statement ingestion → coding → reconciliation → exception handling; SOFP/balance-sheet
   preparation + review; AR/AP sync, matching, aging, list updates; payment coding to AP/AR;
   customer/vendor ledger updates; year-end depreciation calculation + posting; fixed-asset
   disposal treatment; report generation with provenance, scope, audit trail.
2. **Acceptance criteria** (Workstream G): schema/context retrieval before workflows;
   relevance determination; scoping by client/entity/period/permission with zero cross-client
   mixing; COA validation; lock-date/closed-period/approval checks before posting; outcome
   sync-back; read/changed/synced/skipped/blocked records; resumability under interruption.
3. **The F3 failure criterion applied to every accounting workflow:** skill loaded → context
   retrieved → correct tool → GL posted → subledger/register/reporting/KB side-effects
   completed or explicitly surfaced. **Any workflow that leaves required state stale fails.**
4. **Load & limits (first-party QA, new build only):** batch sizes to design targets, large
   files, mixed types, duplicate handling, partial failures, retries, queue behavior, OCR
   throughput, unassigned persistence — **measured ceilings recorded in the docs, not guessed.**
5. **Resumability:** kill and restart the server mid-workflow (mid-close, mid-onboarding,
   mid-bulk); resume-or-reconcile with **no double-posting and no lost context**; parked
   clarifications resume after ≥48h.
6. **The AI-quality eval harness (GAP3-6, a real gate):** attribution precision + abstention,
   coding accuracy by document class, must-ask recall, auto-post precision — falsifiable
   thresholds set at Gate 3, measured before cutover readiness.
7. **Structural-guard negative tests:** SELECT-wrapped writer fails; provenance mismatch
   RAISES; wake allowlist blocks; maker=checker blocked on high-stakes; revision-token
   mismatch rejects; stale context-pack token rejects; double carry-down seed RAISES; cross-FY
   reverse-out-of-order RAISES; **bank matching (GAP1-1/1-2): a wrong-account/wrong-period/
   amount-beyond-tolerance match RAISES; a second match on an exclusively-matched entry is
   blocked; re-match without an explicit unmatch is blocked.**
8. **Data-egress verification:** with vendor tracing flagged on, verify the DPA/disclosure
   evidence exists; with it off, prove zero trace egress.
