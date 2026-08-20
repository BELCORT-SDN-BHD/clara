# Clara — forward roadmap, risks, and the Phase-5 verification plan

*Carried verbatim-in-substance from the former REBUILD-PLAN at its deletion (the
2026-08-12 harness refactor, ADR-0069). The dated STATUS chronology lives in
`docs/plan/completed/rebuild-plan-history.md`; live state is `PROGRESS.md`; the `coding_kind`
roadmap table moved into `docs/ARCHITECTURE.md`.*

## Wave F — two parallel tracks (re-scoped by ADR-0071, 2026-08-18; contract of record: `docs/plan/active/wave-f-contract.md`)

**Track A — the agentic core** (the Charter's build half): F-A1 the LLM witness-pair
extraction (retires the Azure semantic readers + the deterministic reader family; OCR
demoted to coordinates+text, vendor-swappable) · F-A2 the agentic posting lane (unattended
judgement-posts across every document class; the rules machine's execution tier retires;
KB/history becomes the learning fuel) · F-A3 bank agency (agentic match/adjust; the red pen
stays human) · F-A4 close key ① (begin/abandon + the preparation surface) · F-A5 reporting
agency (the analysis sandbox, definition self-approval, the OBO evaluator lane, chart-kind
renderers) · F-A6 the audited freeform read · F-A7 the filing verb + the interview model layer
(F-A7a/F-A7b) · F-A8 the internet lane
(official feeds → effective-dated tables; the open web read tool) · F-A9 metering ·
F-A10 **the retirement completion condition — two architectures never enter Wave G**.

**Track B — tax** (unchanged in content): the SST engine per the practice map (periods,
payment basis, dual-registrant exports, SST-02, bad-debt relief); the payroll deadline
calendar; **last: the draft tax computation** (add-backs, CA, chargeable income, forms —
the slice allowed to slip to v1.1). The P-TAX split governs: statutory arithmetic in
effective-dated tables + deterministic evaluators; tax judgement and paperwork are the
agent's, prepared for human review and human e-filing.

*Dispositions of the old inherited items:* the **settlement-corroboration door** (E-R13) is
ABSORBED into F-A3's agentic matching (noted, not silently dropped) · the **claims
accounting class** (E-R10) rides Track B's fix queue — the generic lane now posts
unattended, so the class needs only its account-convention design · **third-reader
planning (#25)** is SUPERSEDED by the witness pair (ADR-0071/G1.1) · the **FX-lite
decision** stays a sitting item; its principle is pre-seeded (ADR-0071/P-FX) and law 18
(MYR-only) stands · the fix queue: task #17 `closing_transfer` (after the sitting's R1) ·
P-3 bank zero-census · N1 draft-time SST-shape check · N5 `fix`-field backfill.

## Wave G — the OS surface

Proactive inbox (allowlisted wakes), cross-scope needs-you, ⌘K Ask/Do/Go + ActionPanels,
plan-as-document for close/onboarding, exports UI, generative-UI completion + parity CI gates,
the design floors (`docs/design/` populates here). *Inherited by ADR-0065:* the **UX-debt
backlog** (E-R10: userflow/signin/signup/firm-setup · raw-document click-through · real
session auth replacing the hand-mint JWT) · the **claims submission/approval surface**.
*Close-out (owner-ruled 2026-08-11, ADR-0068-adjacent):* the **factory reset + full E2E
rebuild from raw documents** — the definitive stuck-bytes discharge; beta's "real data
untouchable" resumption rides the same gate. *(ADR-0071 consequence: the corpus E2E tests
the NEW architecture only — Wave F's F-A10 retirement condition guarantees no second
architecture survives into it; the corpus doc's step-4 "standing rules earn autopost"
wording takes its G1-alignment amendment at the corpus sitting.)*

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
6. ~~**The AI-quality eval harness (GAP3-6, a real gate)**~~ — **DECLINED, ADR-0071/G7.**
   Corrected here 2026-08-20: this item read "a real gate… falsifiable thresholds set at Gate 3,
   measured before cutover readiness", which contradicted a standing ruling in a harness-menu
   file. **Quality's only checkpoint is the Wave-G corpus's owner-supplied golden-bar tie-out**
   (`docs/plan/active/wave-g-e2e-corpus-design.md`). The consequence G7 states in its own words
   is recorded rather than hidden: the monthly harness-ablation backlog item stays blocked on a
   benchmark that now will not exist.
7. **Structural-guard negative tests:** SELECT-wrapped writer fails; provenance mismatch
   RAISES; wake allowlist blocks; maker=checker blocked on high-stakes; revision-token
   mismatch rejects; stale context-pack token rejects; double carry-down seed RAISES; cross-FY
   reverse-out-of-order RAISES; **bank matching (GAP1-1/1-2): a wrong-account/wrong-period/
   amount-beyond-tolerance match RAISES; a second match on an exclusively-matched entry is
   blocked; re-match without an explicit unmatch is blocked.**
8. **Data-egress verification:** with vendor tracing flagged on, verify the DPA/disclosure
   evidence exists; with it off, prove zero trace egress.
