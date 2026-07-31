# Clara — Rebuild Plan (Phases 3–5)

*Vertical-slice sequencing, risks, and the Phase-5 verification plan. Companion to `docs/prd/PRD.md` + `docs/architecture/ARCHITECTURE.md` + `docs/design/DIRECTION.md`. Status: Gate-2 ratified 2026-07-17 (see `docs/PROJECTLOG.md`).*

**Method:** every slice is vertical (DB → runtime → UI → test), lands behind green CI on the **new** schema + runtime (never the old build's misleading-green defect, GAP1-5), keeps the app runnable, and commits incrementally. PORT assets are ported deliberately with their tests; REBUILD assets are rewritten to the named standard; DROP stays behind (salvage manifest = the authority).

---

## Phase 3 — Foundations (ends at GATE 3: the thin slice demo)

**Slice 0 — the spike (hard precondition, 1–2 weeks).** The WDK×Supabase production spike from the runtime recommendation: session-mode LISTEN/NOTIFY under `@workflow/world-postgres`; redeploy-under-parked-hook; redeploy-mid-run; parked-interruption resume after 48h; idempotent re-drive. **Acceptance: all five pass, or the seam flips to LangGraph JS and the same acceptance re-runs.** Nothing else in Phase 3 starts on the runtime until Slice 0 passes.

**Slice 1 — repo + project + CI + ops floor.** Fresh repo (seeded from `clara-rebuild/`); fresh Supabase project + local CLI dev; versioned migrations from day one; seed scripts (synthetic data only); CI that **applies every migration + runs the isolation rig + typechecks + tests the runtime** on every PR. The cross-firm isolation suite is PORT'd and green before any books table carries data. **The ops floor lands here too (fixes GAP1-6/1-7):** the backup/restore/DR contract for the 7-year source of truth (documented + a restore actually exercised against a synthetic backup), readiness probes (not liveness-only), SLOs, and alerting.

**Slice 2 — the governed DB core.** Foundation schema (firms/users/RBAC + live authority revocation), forced RLS, EXECUTE-only grants, the **structural read-only agent role**, the four structural invariants as DB objects (`assert_client_resolved`, provenance CHECK, wake allowlists, role floors + revision-token approve), maker/checker columns + high-stakes gate, the balance trigger (PORT), money-as-cents. Rig tests for every guard **including the negative paths** (a SELECT-wrapped writer must FAIL; a provenance mismatch must RAISE).

**Slice 3 — the event spine.** `domain_events` + transactional outbox + relay + idempotent consumers; the context-pack read fn with the books-version token; the trigger-taxonomy table. Replay test: kill the relay mid-stream, restart, no event lost, no duplicate effect.

**Slice 4 — the durable runtime skeleton.** WDK world wiring under `clara_runtime`; `agent_tasks`/`agent_interruptions`/`wakes_outbox` projections; a minimal chat loop with typed `parts[]` persistence, tool chips, SSE that survives detach (runs execute regardless); clarify as a hook-parked interruption; per-firm metering/concurrency caps; DB-backed run history; tracing wired (vendor export **disabled until the C6 checklist is satisfied**).

**Slice 5 — document pipeline core.** Upload (picker/drag/paste) → OCR (**with bounding-region capture**) → **persist-after-OCR always** (unassigned lane) → assign/reassign (row + citations + storage move together) → the attachment lifecycle chip. Storage doctrine + registry + retention anchored at period-end+filing.

**Slice 6 — the thin end-to-end slice (GATE 3 demo).** Upload → OCR → persist-unassigned → assign to client → domain event published → context pack retrievable (fresh, token-checked) → one simple agent workflow (code one document into a balanced draft with provenance bound, `je_review` card, human approve with revision token) → full audit trail (events, receipts, tool history, maker/checker). **Kill the server mid-workflow and resume as part of the demo.**

## Phase 4 — Product build (ends at GATE 4: the built product mapped against the PRD)

Ordered by dependency + risk; each wave keeps the app runnable.

> **STATUS (2026-07-23):** Wave **A** is FULLY LIVE (ADR-022/023/024). **Wave A2**
> — the sales-invoice/AR side + MyInvois UBL local-parse + SST 3-leg + CN/DN +
> **purchase-only** bounded auto-posting (the "standing rules" from Wave A's scope)
> — was **deliberately inserted before Wave B** and is FULLY LIVE with the §9 eval
> CLOSED (ADR-025/026/027, migration `0015`; Gate A exact RM 1,973,332.91, Gate B
> exact). The **R2 off-site backup is DONE + restore-proven** (PRs #49/#50, image
> now on pinned rclone 1.74.4 per PRs #58/#61 with a zero-501 supervised live run;
> evidence: `docs/ops/DR.md` §9). **Wave A2.1** — the eval finding ledger + the
> ADR-026 deferrals (the SST registration-threshold compliance watch,
> sales-direction autopost lift, purchase SST visibility split, doc-type
> classifier gate) — is **CLOSED** (ADR-030, owner ruling **WA21-R13**; contract
> `docs/plan/wave-a2.1-contract.md` v1.0, ADR-028; PRs #51–#61). **The 0016 deploy
> ceremony EXECUTED 2026-07-23** (owner-`!`-gated): it took live Supabase to **16
> migrations (0001→0016)**, Fly `clara-runtime` **v24** (image `a21-v24`) running
> `chatTurn_v6` + `autoDraft_v2` + the three new consumers (`sst_watch`,
> `facts_gate`, `classify`) — **8 consumer loops** total; the in-migration audited
> repairs ran (one customer/AR `vendor_account` rule declined); the six mis-stamped
> docs re-classified via `classify_document`'s no-task path (verdicts `other`); a
> fresh bank statement classified `bank_statement@0.99` through the full
> intake→classify pipeline. Freeze manifest 53 entries; registry `chatTurn` v6 /
> `autoDraft` v2 (v1–v5 / v1 retained frozen). **The §9 live eval closed Gates
> W/C/D on live books:** **W** — the RPR (ROME PROPERTIES) turnover watch surfaced
> UNPROMPTED with the full v6 framing (effective 2025-04-01 → OVERDUE, earliest
> crossing 2025-06-01, application due 2025-07-31, included RM 1,310,276.40, mixed
> 0; audited ack + re-arm ladder armed); **C** — the fresh bank statement classified
> `bank_statement@0.99` end-to-end; **D** — the mis-stamped docs re-classified to
> `other`. **Gates S/P are FOLLOW-ON eval items, deferred to real documents** (never
> synthetic): **S** needs ≥3 post-0016 credit sightings + a real MyInvois XML, **P**
> needs a real SST-stated bill — both ride the next real document cycle.
> **Wave B is DEPLOYED (2026-07-24, ADR-036):** the ratified contract v1.0
> (ADR-032, WB-R1..R18) shipped in full — migration **0017** (ADR-033, blind
> lanes + a six-round cross-model ratchet), the **v25 runtime lanes** (ADR-034:
> chatTurn_v7/autoDraft_v3 on the purpose+GUC-gated pack v4, the durable
> interview family, the cold-start-gated wiki_projection consumer, the lint
> belt), and the **dashboard surfaces + document parse lanes** (ADR-035, settled
> by a research sweep + a Codex Socratic debate; the freeze-lint deploy-lock).
> The **WB-R18 ceremony EXECUTED 2026-07-24** (owner-confirmed): **live =
> Supabase 17 migrations · Fly `clara-runtime:wave-b-v25`** (ten loops,
> WIKI_PROJECTION acquired, /ready 200); wiki backfill 30/30; every post-verify
> probe green (pack dark/lit, replay byte-identical, sightings unchanged, F10
> serializable via PostgREST); the freeze manifest fully deploy-locked. Evidence:
> `docs/plan/research/wave-b/` + `docs/ops/wave-b-ceremony-runbook.md`.
> **Since deploy:** **0018** landed same-day (ADR-038, Gate-K domain) and **0019**
> (the wiki authority boundary) on 2026-07-25 via the first **runtime-image-first**
> ceremony (ADR-039) — **live is now Supabase 19 migrations · `clara-runtime`
> release v26**. **Gates O + K CLOSED on real documents** (2026-07-24, Rome
> Secretary end to end; kill-mid-interview proven in production).
> **Gate W2's dependency audit CLOSED live** 2026-07-25 — WB-R21's interim
> allowance expired when 0019 removed the `_assert_filing_wiki_unreferenced` veto;
> artifact `packages/db/deploy/wave-b-w2-authority-boundary-audit.sql`.
> **Gate S DEFERRED on hard evidence** (no MyInvois artifact exists in the corpus).
>
> **0020 (typed consent) DEPLOYED 2026-07-25 and DARK** (ADR-041) — runtime-image-first
> with a re-quiesce before the preflight; 11/11 post-verify; 30/30 source pages canonical
> with zero filename fragments left in wiki bytes; the first post-deploy lint pass
> superseded all 30 stale `orphan_page` findings. **Live = 20 migrations · runtime v27.**
>
> **0021 (the human counterparty lane) MERGED 2026-07-26, ceremony NOT YET RUN**
> (ADR-042, PR #94). Found by the Bee Creative gate, not by review: an opening
> carry-down seeds payables as `ap_open_item`, which requires a `counterparty_id`,
> while a counterparty could only be born inside `approve_entry` — so at takeover,
> before any entry exists, an opening trade creditor was unseedable. The only prior
> Gate-K run was a company with no payables, so the path had never executed in
> production. Purely additive, so **no quiescence and no runtime redeploy**
> (`docs/ops/wave-b-0021-ceremony-runbook.md`).
>
> **Remaining of Wave B.** Both owner rulings are IN (WB-R28/R29). **Building:**
> the **0021 ceremony**, which is the only thing between here and Gate K on Bee
> Creative. **Operating:** **W2's remaining three claims**, which need a real wake
> credential and a real draft — journey work, not a probe; **Gate F** on Rome Public
> Advisory, **blocked on owner account provisioning** (WB-R30), not on engineering;
> the **Bee Creative** run for **P / L / R2 / K**.
>
> **Two findings logged against later waves, not fixed here.** The
> **`opening_tb.line` producer** does not exist — the opening parser reads a
> `document_regions.field_path` nothing in the pipeline emits, so the
> **document-tied** carry-down has never worked on any client (both real seeds are
> `keyed`). And the interview's SSM validator + `framework` question both assume a
> **company**, so a sole proprietorship cannot answer either honestly; all three
> interview files are freeze-locked, so the fix is an **`interview_v2`** ceremony.
> Waves **C–G** below are unchanged.
>
> **STATUS (2026-07-27): WAVE B IS CLOSED ON INTENT (ADR-046).** Closed on real evidence:
> O ××2 · K(keyed) ××2 · B-12 · W2 (1)+(2)-structural · R2 (1)+(2) · **F** (ADR-045 — firm
> `39008536` ROME PUBLIC ADVISORY born via the durable 11-Q). Deferred with cause: S / L /
> K-document-tied → **Phase 5 (synthetic by design)**; R2 (3) / W2 journeys / the first
> production autopost → the operating runway (real future documents). **The sole engineering
> between here and Wave C is the extraction slice** — `docs/plan/extraction-slice-contract.md`
> (DRAFT v0.1, awaiting the owner's grilling): re-extract verb + governed high-stakes verb +
> the sum-of-stated-components sales tie (0022) → deterministic totals reader → explicit
> `anchor_missing` guard → **two-reader corroboration LAST and ALONE**. Rationale + refusal
> record: ADR-044/045/046, `docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md`,
> `…/vision-alignment-audit-2026-07-27.md`.
>
> **STATUS (2026-07-30): WAVE C IS OPEN under a ratified contract (ADR-051).**
> `docs/plan/wave-c-contract.md` is the mechanism of record — owner rulings **WC-R1..R12**
> (the C-a/C-b/C-c split · match groups with a cents-invariant exclusivity · the tie-out as a
> close-wave-ready receipt · both ingest paths · multi-currency re-ruled OUT · exact-zero
> tie-out · the balance-chain-as-second-reader corroboration strengthening · shared-but-visible
> attempt budget · the retained `coding_kind` axis with `customer_receipt`/`supplier_payment` ·
> no employee counterparty · Rome-then-BELCORT acceptance · structured sales autopost out of
> the wave), the verified ground truth, and the open items. **C0 is CLOSED**: migration 0036
> live 2026-07-30 (35 migrations · runtime v38 · postverify 6/6) — the #52 nonzero-tax belt,
> the #51 losing-dispatch no-ops, the #53 budget visibility, the sales mis-route gate, and
> MSIC→context pack, built through a four-lane review ladder (3-lens Claude adversarial +
> independent Codex; four BLOCKERs caught, each invisible to the lane before it). **C-a is
> CLOSED AND LIVE (ADR-052, 2026-07-30: migration 0037 · 36 total · runtime stays v38 — the
> AR/AP open-item subledger + balanced-pair allocation, all four approve paths hooked, the F3
> debt PAID on the live book; design of record `docs/plan/wave-c-a-subledger-design.md` v2,
> rulings WCA-R1..R9; a FOUR-round two-model review ladder closed 10+ blocker-class findings,
> the last set red-proofed). C-b followed the same arc and closed 2026-07-31 — see the
> STATUS block below.**
> The extraction-slice / settlement history above stands as written (ADR-047..050 closed it all).
>
> **STATUS (2026-07-31): C-b IS CLOSED AND ACCEPTED (ADR-053).** Migration **0038** (PR #153:
> `bank_accounts` + `coa_accounts.is_bank_account` · provenance-bound `bank_statements`/
> `bank_statement_lines` with the balance-chain identity · `statementFacts_v1` (new frozen class)
> · both ingest lanes per WC-R4, corroborated per WC-R7 · `bank_matches` groups with the WC-R2
> cents invariant + `bank_match_audit` (PORT) · `match_bank_line`/`unmatch_bank_line` with the
> four parity RAISEs · the `/bank` two-pane workbench) shipped through the full ladder (design
> v2.2, WCB-R1..R6, two delta rounds). **Acceptance per WC-R11 ran both halves:** Rome-sandbox
> labelled synthetic, then ALL NINE real ROME PROPERTIES months 202504→202512 through the OCR
> lane — the running-balance chain tied to the sen across the year, December closing the account
> to zero; 13 settlements through the production verbs; 27/36 open items closed; **41 honestly-
> unmatched lines (−RM653,894.70) = C-c's working set.** The acceptance drove seven fix classes
> (PRs #154–#164, migration **0039**: null-defers-to-chain in the persist core; the real-Maybank
> grammar; kind-honest supersede reads; reader-2 per-account schema + line completion; refusal
> observability). **Live pin: 38 migrations (`0039`) · runtime v50 · four firms · `/ready` green.**
> **NEXT: C-c (tie-out · aging · learn loop), design-first** — the tie-out receipt per WC-R3,
> period-chained `bank_reconciliations` (GAP1-3), aging 30/60/90 + statements, the advisory
> learn loop (`matched_via_rule_id`/`origin` already on `bank_matches`). Owed at the WAVE C
> close: the PRD §4 five-no-home amendment (contract §7-B) + the §7-A bundle disposition.

**Wave A — the daily loop.** Coding with **intrinsic side-effects** (`code_and_open_ar/ap` composites; counterparty entity + aliases PORT'd in), the review queue (List model), `doc_review` side-by-side evidence surface, the confidence ladder lanes (DB-gated), auto-draft sweep with human acknowledgement floors, KB Layer-2 (typed rules, user-gated; open-question objects), diffs (legs + doc↔entry).
**Wave B — knowledge + onboarding.** The client wiki (ingest/query/lint; injected context packs; lint schedule), firm/client onboarding interviews as durable runs, ongoing-client carry-down (one-shot, idempotent, TB tie-out — the FA-register **schema** lands in Phase-3 Slice 2 so the carry-down can seed asset rows + depreciation baseline here; the FA **workflows** wire up in Wave D), bulk rule/knowledge seeding from prior GL (redesigned per the Karpathy direction, not the stale notes).
> **STATUS (2026-07-29): THE PRE-WAVE-C PROGRAM IS COMPLETE — WAVE C IS NEXT (fresh session).**
> The extraction slice CLOSED (ADR-047/048) → the settlement program EXECUTED (ADR-049) → **the
> first production autopost DONE** (ADR-050: entry `f65eba11`, RM350, 38s PDF→posted unattended)
> → the closing batch LANDED 2026-07-29 (PRs #143/#144: migration 0035 drafting-trio + chatTurn
> v8; one quiesced ceremony). **Live pin: 34 migrations (`0035`) · runtime v38 · four firms ·
> `/ready` green.** Owed to Wave C: the reconciler double-dispatch cosmetics + the sweep budget
> contention; the nonzero-tax DB belt stays TRIGGER-BOUND (PROJECTLOG PART 2). Undecided for the
> Wave-C grilling: structured-sales autopost as a tail slice (PRD §4.95).

**Wave C — money movement.** Bank statement ingest, parity-checked matching + exclusivity, reconciliation tie-out, receipt/payment allocation (intrinsic), aging + statements, the self-reconcile learn loop (advisory, human-gated).
**Wave D — assets + adjustments.** FA register from coding (intrinsic), depreciation runs (scheduled + close-gated), disposal, recurring/reversing adjustments, periodic closing-stock at close.
**Wave E — periods + statements.** Serialized year-end close with structural pre-close gates, segmented continuity reads, ordered reverse guards, carry-forward; the honest FS pack (SoFP/SoCI/SOCE/cash-flow/notes); the reporting engine (spec → DB reads → renderers → auditable artifacts).
**Wave F — tax.** The SST engine per the practice map (periods, payment basis, dual-registrant exports, SST-02, bad-debt relief); the payroll deadline calendar; **last: the draft tax computation** (add-backs, CA, chargeable income, forms — the slice allowed to slip to v1.1).
**Wave G — the OS surface.** Proactive inbox (allowlisted wakes), cross-scope needs-you, ⌘K Ask/Do/Go + ActionPanels, plan-as-document for close/onboarding, exports UI, generative-UI completion + parity CI gates, the design floors.

### The `coding_kind` roadmap — where each classified document lands

> **Added 2026-07-29** (Wave-C grilling). The classifier recognises **17 `document_kind` values**
> (`0007_document_pipeline.sql:33-37`) while the books can code **3 `coding_kind` values**
> (`0015_ar_myinvois_rules.sql:217-219`). Until now **no artifact stated where the other 14 land** —
> a search of PRD, this plan, ARCHITECTURE and all three project logs returned zero hits. That
> absence is what produced the receipt-routing seam: ADR-ruled receipt auto-routing (0025) sends
> every receipt into the paid OCR lane, and those receipts are now read and then strand, because a
> counter purchase has no payable credit and so cannot be a `supplier_bill`. **This table closes
> that gap.** Rulings marked **[R]** are ratified in `docs/plan/wave-c-contract.md`; **[P]** are
> proposed and await the owner.

**The law this table encodes:** `coding_kind` means *"which control account this entry touches, and
in which direction"* — **not** "what kind of document this is". A document kind earns a typed coding
lane **only** when a wrong posting would silently corrupt a subledger. Everything else rides the
generic lane (`coding_kind` NULL), which carries every LAW invariant — client attribution,
provenance binding, balance, maker/checker, reverse-not-delete — but breeds no rule sightings and
is permanently ineligible for autopost. **A new `coding_kind` is always a migration, never an agent
decision.**

| `document_kind` | Destination | Wave |
|---|---|---|
| `invoice` | `supplier_bill` · `sales_invoice` | **LIVE** |
| `e_invoice_xml` | `sales_invoice` via the structured (XML-only) lane | **LIVE** |
| `credit_note` | `sales_credit_note` LIVE; purchase side → `supplier_credit_note`, added additively **[P]** | LIVE / post-C-a |
| `debit_note` | rides `sales_invoice` deliberately — identical subledger effect **[R]** | **LIVE** |
| `payment_voucher` | `supplier_payment` (settlement kind) **[R]** | **C-a** |
| `bank_statement` | **Not a coding kind.** Becomes statement lines that MATCH entries; settlement is carried by `customer_receipt`/`supplier_payment` **[R]** | **C-b** |
| `receipt` | `cash_purchase` — zero control legs, creates no AP. **Blocked**: "paid at the counter?" is not extractable today (no payment-method field; `invoice.amount_due` is a consistency test). Interim: generic lane **[R]** | post-C-a |
| `claim_form` | **Generic lane, permanently** — a non-`payable`-class "due to employee/director" liability by account convention (WC-R10). The real want is tier-2 rule breeding, not a typed kind **[P]** | — |
| `payroll_summary` | **Generic lane, permanently** for the journal; the statutory deadline calendar is Wave F (PRD §4.16 — no payroll engine) **[P]** | F (calendar only) |
| `handwritten_note` · `other` | Generic lane **[P]** | — |
| `management_account` | **Never a coding kind** — carry-down + TB tie-out input | B |
| `opening_balance_doc` | **Never a coding kind** — carry-forward | B |
| `ssm_company_doc` | **Never a coding kind** — onboarding/identity | B |
| `agreement_contract` · `knowledge_artifact` | **Never a coding kind** — client wiki | B |
| `tax_correspondence` | **Never a coding kind** — wiki + tax lane | B / F |

**The honest gap this table exposes is not tier 3, it is tier 2.** The agent may already (1)
transcribe any document into the generic lane interactively, and (2) propose a rule after ≥3
human-approved sightings for a human to sign — but **(2) exists only for supplier bills and sales
invoices**, because sightings breed only on control-account entries. Generic-lane entries breed
nothing, so the long tail gets no compounding autonomy. **Extending sighting breeding to
generic-lane shapes is the highest-value autonomy work after Wave C** — not widening this table.

**Doctrine/skills:** regenerated fresh against the real tool registry per wave (registry-generated catalog + drift lint), never copied wholesale from `belcort/` (the domain gold — SST ladder, carry-down interview, CN/DN polarity — is extracted deliberately, per the salvage manifest).

## Risks (top 8)

| # | Risk | Mitigation |
|---|---|---|
| 1 | WDK in-flight-run replay across deploys (verified doc-silent) | Slice-0 spike ACs; pinned versions; name-versioned workflows; drain-active-runs deploy policy; LangGraph fallback behind the seam |
| 2 | Intrinsic side-effects widen the audited-fn surface (composite writers) | One composite fn per workflow class, rig-tested with negative paths; the F3 failure criterion as a per-wave regression suite |
| 3 | Scope creep in the compliance-correct core | The practice map's Part-5 scope ledger is the authority; tax-comp is pre-authorized to slip |
| 4 | The wiki becomes an unbounded token/complexity sink | Lint caps page count/size per client; context packs inject pages by relevance budget; wiki is advisory-only so degradation is graceful |
| 5 | C6 checklist slips (DPA/disclosure/PDPA) while tracing ships | Vendor trace export is **feature-flagged off** until the checklist is evidenced; DB run history carries debugging meanwhile. **Ownership: the DPA execution, the firm-facing disclosure text, and the PDPA cross-border check are OWNER/legal work items (Tao), tracked from Gate-2 approval — engineering's only task is keeping the flag off until all three are evidenced** |
| 6 | Design ambition (parts[], cards, evidence viewer) outruns the build | The design-critical path (DIRECTION.md §4) is ordered; the fail-closed catalog means unbuilt cards degrade to nothing, never to broken UI |
| 7 | Old-build habits re-imported via ported code | Every PORT lands with its tests + a re-review against the findings that touched it; DROP list enforced in review |
| 8 | Single-maintainer bus factor on a bigger stack | Boring choices everywhere else (Next.js, Postgres, shadcn); the runtime is the one novel bet, seam-isolated |

## Phase 5 — Verification plan (the hero prompt's criteria, made falsifiable)

Run in local/dev with synthetic data only. Every scenario records: **what was read, changed, synced, skipped, or blocked.**

1. **End-to-end use cases** (each with evidence): document ingestion + classification; bank statement ingestion → coding → reconciliation → exception handling; SOFP/balance-sheet preparation + review; AR/AP sync, matching, aging, list updates; payment coding to AP/AR; customer/vendor ledger updates; year-end depreciation calculation + posting; fixed-asset disposal treatment; report generation with provenance, scope, audit trail.
2. **Acceptance criteria** (Workstream G): schema/context retrieval before workflows; relevance determination; scoping by client/entity/period/permission with zero cross-client mixing; COA validation; lock-date/closed-period/approval checks before posting; outcome sync-back; read/changed/synced/skipped/blocked records; resumability under interruption.
3. **The F3 failure criterion applied to every accounting workflow:** skill loaded → context retrieved → correct tool → GL posted → subledger/register/reporting/KB side-effects completed or explicitly surfaced. **Any workflow that leaves required state stale fails.**
4. **Load & limits (first-party QA of our own product, new build only):** batch sizes to design targets, large files, mixed types, duplicate handling, partial failures, retries, queue behavior, OCR throughput, unassigned persistence — **measured ceilings recorded in the docs, not guessed.**
5. **Resumability:** kill and restart the server mid-workflow (mid-close, mid-onboarding, mid-bulk); resume-or-reconcile with **no double-posting and no lost context**; parked clarifications resume after ≥48h.
6. **The AI-quality eval harness (GAP3-6, now a real gate):** attribution precision + abstention, coding accuracy by document class, must-ask recall, auto-post precision — falsifiable thresholds set at Gate 3, measured before cutover readiness.
7. **Structural-guard negative tests:** SELECT-wrapped writer fails; provenance mismatch RAISES; wake allowlist blocks; maker=checker blocked on high-stakes; revision-token mismatch rejects; stale context-pack token rejects; double carry-down seed RAISES; cross-FY reverse-out-of-order RAISES; **bank matching (GAP1-1/1-2): a wrong-account/wrong-period/amount-beyond-tolerance match RAISES; a second match on an exclusively-matched entry is blocked; re-match without an explicit unmatch is blocked.**
8. **Data-egress verification:** with vendor tracing flagged on, verify the DPA/disclosure evidence exists; with it off, prove zero trace egress.
9. **Final report:** pass/fail per scenario, measured limits, known gaps, the supersession manifest, and the old-project decommission checklist (decommission executes only after owner sign-off).

**Methodology carried from the owner's harness notes (Gate-1 E2):** user-journey simulation against the production-mode build (not dev-only), state-transition acceptance criteria with an observable UI + DB assertion per transition, verification-before-completion as a hard per-slice gate, and a cross-feature happy-path regression suite run on every evaluation.
