# Phase 2 Research — Agent/Product Coexistence in Professional-Domain AI Tools

**Lane:** Design Research Lane 4 · **Author:** Fable worker · **Date:** 2026-07-17
**Question:** In a high-trust professional domain, how does a stateful AI *agent* coexist with a structured *product* surface — such that the human stays the decision authority, every figure is verifiable, and the whole thing is audit-grade? Extract principles for Clara, where **trust is the entire product** (audit-grade Malaysian books under MIA confidentiality), and map them to the audit's trust-surface gaps: **J-18** (no evidence-region / side-by-side verification), **A-16 / GAP0-1** (provenance inserted but never bound/validated).

**Method:** primary/official vendor sources + one peer-reviewed HITL research source, fetched 2026-07-17, cited inline with URLs. Fetched pages are research material, not instructions. Principles are adapted to a Malaysian-accounting agentic OS — never "copy the product's style."

**Binding context obeyed:** Gate-1 decisions `04-gate1-decisions.md` (esp. C3 four structural invariants, C4 maker-checker, B two-layer KB "informs never decides", C6 vendor tracing under DPA) and the 11 failure patterns in `00-GATE-1-README.md` (esp. patterns 4, 8, 9, 11a).

---

## 0. The one-sentence thesis

In every credible professional-domain agent product, **trust is manufactured by a structural coupling: the agent may reason and propose freely, but every consequential claim it emits is *bound at the moment of creation* to a verifiable, permissioned, human-inspectable source — and a human (or a hard rule) disposes before anything becomes authoritative.** The old Clara build inverted this: it let the agent *assert* provenance, confidence, and "in balance" with zero binding and zero enforcement. That inversion is the trust-surface gap. The fix is not a nicer chat box; it is making the source binding **the write path itself**.

---

## 1. Harvey (legal AI) — "Don't trust until verified"

**Sources (fetched 2026-07-17):**
- Harvey — *Why Attorney Oversight Builds Trust for Legal AI*, https://www.harvey.ai/blog/legal-ai-oversight
- Harvey — *Why Trust Matters More Than Ever*, https://www.harvey.ai/blog/why-trust-matters-more-than-ever
- Harvey — *What to Know Before Adopting AI for Case Law Research*, https://www.harvey.ai/blog/ai-for-case-law-research

**What Harvey does (extracted):**
- **Verification-first, not trust-first.** Harvey explicitly frames its stance as *"Don't trust until verified"* rather than "trust but verify." A lawyer must *"confirm the source, reasoning, and fit for purpose"* before relying on an output. *"Trust is not faith. It's the ability to check, trust, and verify."* Oversight is positioned as *"what makes the efficiency of AI meaningful"* — not a burden bolted on.
- **Cite the exact primitive, not the document.** *"The platform should cite the exact clause behind every contract issue it flags"* and *"link summaries back to the relevant transcript, pleading, or exhibit."* Every clause extraction links to the paragraph it came from; every drafted redline cites the playbook or precedent that informed it.
- **Side-by-side is the verification loop.** *"Every comparison shows the underlying language side by side."* This is the professional loop: the AI's claim next to the source it rests on, so verification is a glance, not a re-derivation.
- **Surface the adverse, not just the supportive.** Case-law research surfaces *"the adverse cases that matter"* — the product actively presents what could undercut the position, rather than only confirming.
- **Authority validation via an external ground truth.** Integration with LexisNexis Shepard's Citations validates whether a cited case is still *"good law"* — an independent, domain-canonical check layered onto the model's output.
- **Transparent reasoning, not a black box.** *"Workflow Agents provide transparent actions and reasoning so users can verify and refine results."*
- **Governance infrastructure as a first-class surface:** *"usage tracking, audit logs, and client matter controls"*; configurable permissions and review tables in Vault; admin visibility so risk isn't silently shifted onto the practitioner.
- **Trust as an org function, not a feature.** Harvey named a *Head of Trust* and staffs dedicated security/privacy/compliance teams; trust is *"repeated verified performance, not a single showcase."*

**Principle for Clara:** the verification surface must make checking *cheaper than re-doing*. Clara proposes a journal entry; the accountant confirms it in one glance against the highlighted source, or rejects it. The gate is "verified," not "looks plausible." And trust is earned by consistency across real conditions, which means Phase-5 needs a real eval harness (the old build waived it — GAP2-6).

---

## 2. Hebbia (finance AI) — citation-first, per-cell, machine-readable trail

**Sources (fetched 2026-07-17):**
- Hebbia — *Generative AI for Finance*, https://www.hebbia.com/resources/generative-ai-for-finance
- *The Trust Factor: How Hebbia Solved AI's Black Box Problem for Regulated Industries*, San Francisco Examiner (secondary, describes Hebbia Matrix), https://www.sfexaminer.com/marketplace/the-trust-factor-how-hebbia-solved-ais-black-box-problem-for-regulated-industries/... (HTTP 429 on refetch; content captured from search index 2026-07-17)
- OpenAI case study — *Hebbia*, https://openai.com/index/hebbia/

**What Hebbia does (extracted):**
- **"Citation-first" as an architectural principle.** *"Every piece of data generated is hyperlinked directly back to its precise origin in the source documents,"* creating a *"machine-readable, auditable citation trail"* — provenance is a data structure, not a footnote.
- **Per-cell citation granularity.** *"Every output cell includes a clickable reference to the exact page, paragraph, and sentence in the source document."* Citation is bound to the smallest verifiable unit, not the file.
- **Expose the whole analytical chain, not just the answer.** *"Unlike black box systems that provide only final outputs, Matrix exposes the entire analytical chain from source documents to conclusions."* *"Citations are available every step of the way."*
- **A structured surface, deliberately NOT conversational.** *"Rather than presenting results as conversational outputs, the platform displays AI reasoning in a spreadsheet-like format that financial professionals immediately understand."* Hebbia intentionally rejected chat-only for a data grid because the domain's users reason in structured rows/columns.
- **Full-document processing, not excerpts** — reduces the "retrieved a snippet, hallucinated the rest" failure.
- **Explicitly compliance-shaped:** aligned to *"FINRA recordkeeping, EU AI Act provisions, and audit trail requirements"*; *"enables compliance teams to demonstrate due diligence and maintain audit trails required by regulators."*

**Principle for Clara:** provenance must be **machine-readable and bound to the atomic figure**, not a caller-supplied string on the header. Every posted amount, date, party, and tax leg should carry a pointer to the exact region of the exact source it came from — the same granularity Hebbia binds per cell, applied per journal-line field. The "structured surface, not chat-only" instinct also confirms Clara's workbench-led design law: chat **+** workbench, never chat-only.

---

## 3. Glean (enterprise search / assistant) — grounding + permission-aware citations

**Sources (fetched 2026-07-17):**
- Glean — *Top AI assistants for accurate source citations*, https://www.glean.com/perspectives/top-ai-assistants-for-accurate-source-citations
- Glean — *How cited AI outputs enhance security for finance teams*, https://www.glean.com/perspectives/how-cited-ai-outputs-enhance-security-for-finance-teams

**What Glean does (extracted):**
- **Retrieve-then-generate, never generate-from-memory.** *"RAG-based assistants pull actual source content from connected repositories before generating a response, rather than reconstructing facts from model memory."* Cited stat: RAG-based legal tools hallucinate 17–34% vs 58–82% for general chatbots (Stanford); general chatbots gave incorrect citation info >60% of the time (Columbia Journalism Review). Grounding is the single biggest hallucination lever.
- **Inline, passage-level citation beats a reference list.** *"A reference list at the bottom of a response forces you to guess which claim came from which source. Inline citations solve this by attaching each reference to the specific sentence it supports."* *"Traces each statement to its source document during generation"* — multi-source answers show which claim came from which document.
- **Permission-aware BEFORE retrieval, not after.** *"Permission-aware citation tools check access controls before returning results, not after… enforces access rules before it retrieves content and before it generates an answer."* Document-level restrictions and inherited group permissions are enforced upstream of the model, so *"traces of unauthorized information"* never shape the answer.
- **Five-stage verifiable pipeline:** retrieve → rank → generate → cite → enforce permissions, turning citations into *"auditable, traceable evidence rather than plausible-sounding references."*
- **Reframes the reviewer's job.** With sources inline, finance reviewers shift *"from questioning whether the output is fabricated to evaluating whether the conclusion fits the business context."*

**Principle for Clara:** two moves. (1) Clara's *reads* that feed a proposal must be grounded retrievals against the DB/KB with the source attached — not the model's recollection from an earlier chat turn (fixes pattern 3, stale-context replay). (2) Permission enforcement must sit **upstream of the write path**, structurally — which is exactly RLS + role floors + the C3 write-authorization invariant, enforced in the DB before the fn runs, not a JWT the agent can wrap around (fixes pattern 4, the SELECT-wrapped-writer bypass, and pattern 8, prompt-deep authorization).

---

## 4. Sierra (enterprise conversational agents) — supervisors, deterministic guardrails, monitors

**Sources (fetched 2026-07-17):**
- Sierra — *Confidence in every conversation*, https://sierra.ai/blog/confidence-in-every-conversation
- Sierra — *Agent SDK*, https://sierra.ai/product/agent-sdk

**What Sierra does (extracted):**
- **Deterministic guardrails the agent literally cannot cross.** The SDK lets you *"set deterministic guardrails that the agent cannot cross (e.g., orders can only be returned within 30 days of purchase)."* Hard business rules are enforced deterministically, separate from the model's latitude.
- **Supervisors — a second agent watching in real time.** *"Supervisors are in-the-moment guardrails that run in parallel, reviewing each response as it's generated, verifying facts, enforcing policy, and redirecting conversations… or escalating to a human when needed."* Framed as *"a Jiminy Cricket for each agent."* *"Every production agent runs with supervisory agents watching for ambiguous or sensitive situations, plus deterministic guardrails for hard business rules."*
- **Per-workflow determinism dial.** *"Define the degree of flexibility your agent should exhibit for each workflow, allowing for varying levels of creativity and determinism"* — high-stakes flows run tight/deterministic; low-stakes flows get latitude.
- **Monitors — continuous evaluation of every run.** *"Evaluates every conversation, automatically — and flags the ones that need attention"* on coherence, non-repetition, *"grounding in verified facts,"* and tone; each flag *"links directly to its transcript"* for context in one view.
- **Escalation with an auto-generated handoff summary.** *"Intelligently routes the conversation to the right team member, automatically generating a detailed summary for a smooth handoff."*
- **Debuggability:** inspect API calls and logic traces to understand/adjust behavior.

**Principle for Clara:** separate **hard rules from judgement** the way Sierra separates deterministic guardrails from the model. Clara's four firm-killing invariants (C3) are the deterministic guardrails — DB-enforced, uncrossable. Accounting-judgement calls (coding, materiality, close-readiness) stay visibility-first, the "creativity" end of the dial. The **supervisor/monitor** pattern maps to a Phase-5 eval + a runtime "watcher" that scores every run and flags the ones needing attention (the old build had *no* eval harness — GAP2-6). **Escalation-with-summary** maps to the C1 must-ask / open-question object surfaced at client-work start, carrying full context.

---

## 5. Accounting-native agents (Puzzle, Basis) — confidence routing + reasoning trail + human-disposes

**Sources (fetched 2026-07-17):**
- Puzzle — *End the Black Box: Explainable AI Accounting with Puzzle's Accuracy Reviews*, https://puzzle.io/blog/ai-accounting-accuracy-reviews
- Puzzle — *Best AI Finance Agents*, https://puzzle.io/blog/best-ai-finance-agents
- Basis AI overview (secondary), https://www.digitalapplied.com/blog/basis-ai-100m-agentic-accounting-tax-audit-guide

**What they do (extracted):**
- **Per-transaction reasoning trail.** Puzzle: *"Each categorized transaction includes a clear 'reasoning trail' — the data sources and logic Puzzle used to make the decision."* The explanation is a first-class artifact attached to each entry.
- **"When it isn't sure, it tells you."** Puzzle: *"You see exactly which entries need human review before close."* Uncertainty is surfaced proactively and gates the close.
- **Confidence-based routing (three lanes).** Basis: *high-confidence → posted automatically; lower-confidence → batched for human review; genuinely ambiguous → manual queue.* Human review requested *"only when confidence falls below configurable thresholds."*
- **Agent proposes, human disposes, before anything is final.** Basis *"prepares draft financials for a human reviewer to approve before anything is finalized."* Puzzle: partner firms automate up to 98% *"while preserving human oversight… keeps accountants central rather than replacing them."*
- **Bulk review UX + learning loop.** Puzzle: *"bulk-approve, filter by confidence level, and re-train the system instantly from your corrections."*
- **Every action logged for audit.** Basis: *"Every action… logged with timestamp, source document reference, rule applied, and confidence score."* Puzzle: *"Each change is logged, timestamped, and auditable — a transparent history you can stand behind with clients or auditors."* The trail records *whether a reviewer approved / modified / flagged, with identity and timestamp.*

**Principle for Clara:** this is the closest analogue and it validates the Gate-1 direction. Confidence must (a) be *displayed*, (b) *route* work into auto / review / ask lanes, and (c) **structurally gate** — not be a decorative number the write path ignores (the old build persisted `client_match_conf` and no fn ever read it — GAP0-1). The ≥0.95 client-attribution gate (C3) is Clara's version of confidence-routing, but DB-enforced. The reasoning trail is the *explanation*, never the *authority* — the DB still owns the number (see §6 AVOID).

---

## 6. Human-in-the-loop research grounding (Magentic-UI, Google Cloud)

**Sources (fetched 2026-07-17):**
- *Magentic-UI: Towards Human-in-the-loop Agentic Systems*, arXiv 2507.22358, https://arxiv.org/pdf/2507.22358
- Google Cloud — *Choose a design pattern for your agentic AI system*, https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system

**Extracted patterns:**
- **Co-planning:** human + agent jointly outline the approach *before* execution — the plan is inspectable and editable, not a fait accompli.
- **Action guards:** before high-stakes/irreversible actions (financial transactions, deletions, account changes) the system *pauses and requires explicit human approval*.
- **Plan editing mid-flight:** humans modify the agent's proposed plan during execution; the UI surfaces intermediate steps for adjustment.
- **Pause-and-ask on uncertainty or ambiguity** rather than proceeding — "an agent that knows when not to guess."
- **Transparency in action selection:** the UI shows *why* an action was chosen, so reasoning errors are caught before execution.
- **Google Cloud canon:** use HITL *"for tasks that require human oversight, subjective judgment, or final approval for critical actions"* — e.g. approving large financial transactions; automatic processing then a mandatory *"final checkpoint"* before release (their example: redact PHI automatically, pause before releasing the dataset).

**Principle for Clara:** the plan→review→approve gate is not a UI nicety — it is the canonical HITL architecture for consequential financial actions. Co-planning + plan-editing + action-guards + pause-and-ask are the four concrete mechanisms behind Clara's "agent proposes, human disposes." Note the healthcare-redaction example is *exactly* the C6 shape: automatic content handling, human checkpoint before egress — reinforcing that the DPA/disclosure checklist is the gate, not an afterthought.

---

## 7. Synthesis — the seven cross-product trust principles

1. **Bind-at-creation provenance.** Every consequential claim is hyperlinked to its precise source *the moment it is generated* — Hebbia's per-cell page/paragraph/sentence, Harvey's exact clause, Glean's per-sentence inline. Provenance is a bound data structure, not a caller-supplied afterthought.
2. **Atomic-unit citation, not document-level.** The reference points at the smallest verifiable thing (the amount, the party, the sentence), so verification is a glance.
3. **Side-by-side is the verification loop.** The claim sits next to its highlighted source; checking is cheaper than re-deriving. (Harvey, Hebbia grid.)
4. **Grounding before generation + permission before retrieval.** Retrieve real sources first; enforce access upstream of the model. (Glean.)
5. **Hard rules are deterministic and uncrossable; judgement is visible and dial-able.** Separate the guardrails the agent *cannot* cross from the latitude it *may* exercise. (Sierra, C3.)
6. **Confidence is displayed, routes work, and structurally gates** — auto / review / ask lanes with DB-enforced thresholds; "when unsure, it tells you and stops." (Puzzle, Basis, C3 0.95 gate.)
7. **Agent proposes, human disposes — with a real audit trail.** Plan→approve gate, action guards, pause-and-ask, escalation-with-summary; every action logged with actor, timestamp, source ref, rule, confidence, and the reviewer's approve/modify/flag. (Magentic-UI, Sierra, Basis, C4 maker-checker.)

---

## 8. Mapping to the audit findings

### J-18 — no evidence-region / side-by-side verification surface
> Old build: the document "detail" view is a raw OCR JSON dump plus a new-tab file link; **no bounding-region data is captured anywhere in the pipeline**, so the core professional loop (see the invoice beside Clara's proposed entry, with amount/date/party highlighted) does not exist.

**Every product in this survey has already solved this**, and their solution is one shape: **atomic-unit citation rendered side-by-side.** Hebbia's per-cell click-to-exact-page/paragraph/sentence and Harvey's "underlying language side by side" are literally the J-18 fix, applied to journal-line fields instead of contract clauses. Concretely for Clara:
- **Capture per-field evidence regions in the extraction pipeline** (bounding box + page + the raw span) for every field Clara reads — amount, date, counterparty, tax, invoice no. OCR output stays *inert data* (never an instruction), but its *regions* become the citation targets.
- **Bind each proposed journal-line field to its region** so the workbench can render the source document with the exact span highlighted **beside** the proposed entry.
- **Make "verified against source" the approval act** — the accountant confirms the highlighted region matches the leg, one glance per field. This is the Harvey "don't trust until verified" loop made physical.
- This is also the anti-injection surface: showing the human the exact region they are approving is the defense against OCR-borne manipulation.

### A-16 / GAP0-1 — provenance inserted but never bound/validated
> Old build: journal provenance (`document_id` + `source_doc_sha256`) is inserted **caller-supplied with zero validation**; `client_match_conf` is persisted verbatim and **never checked by any function**; the model can file model-authored bytes as a durable branded export. Provenance and confidence are theatre.

**Hebbia's "citation-first, machine-readable, auditable trail" and Glean's "enforce at the system level" are the direct answers.** A citation that isn't *validated at insert* is exactly the plausible-but-fabricated reference Glean's pipeline exists to prevent. Concretely for Clara:
- **Validate provenance inside the audited write function**, structurally (C3 invariant #2): the `source_doc_sha256` must match a real, firm-scoped document row; the `document_id` must belong to the same client; the cited region must exist. A write with unbound/mismatched provenance **fails** — it cannot be caller-asserted.
- **Confidence must be read by the gate.** The persisted confidence value must be the value the ≥0.95 DB gate checks (C3 invariant #1) — not a display-only number the writer ignores. This is Basis/Puzzle confidence-routing made enforceable.
- **The DB owns every number; the reasoning trail explains, never authorizes.** Puzzle/Hebbia surface a reasoning trail *and* keep the figure sourced from the document/DB. Clara must never let the model's explanation or a SQL literal become the authoritative posted number (fixes pattern 9 reporting-laundering: `build_export` hard-coded `balanced:true`, model prose on a branded PDF).

### The trust-surface gap (whole-product)
Trust is Clara's entire product (audit-grade books, MIA confidentiality). The survey says trust is *manufactured structurally*, in four layers that the old build had only in prose (pattern 8):
1. **Grounding + bound provenance** (Glean/Hebbia) → provenance-at-insert invariant.
2. **Deterministic guardrails** (Sierra) → the four C3 invariants, DB-enforced.
3. **Agent-proposes/human-disposes + maker-checker** (Magentic-UI/Basis) → plan→approve gate + C4 distinct-approver on the high-stakes lane; the agent can never satisfy a human sign-off.
4. **Audit trail + supervisor/monitor** (Basis/Puzzle/Sierra) → typed receipts (actor/time/source/rule/confidence/reviewer-action) + a Phase-5 eval that scores every run and flags the ones needing attention.

---

## 9. ADOPT / AVOID for Clara

### ADOPT
| # | Principle (source) | Clara application |
|---|---|---|
| A1 | Bind provenance at creation; validate at insert (Hebbia, Glean) | The audited write fn validates sha↔document↔client↔region or **fails**; kills A-16/GAP0-1 structurally (C3 #2). |
| A2 | Atomic-unit, region-level citation (Hebbia per-cell, Glean inline) | Capture per-field OCR evidence regions; bind each journal-line field to its exact span. |
| A3 | Side-by-side verification as the approval act (Harvey, Hebbia) | Workbench drawer: source document with highlighted region beside the proposed entry; "verified" = the approval. Fixes J-18. |
| A4 | Confidence displayed → routes → **structurally gates** (Basis, Puzzle) | ≥0.95 client-attribution gate DB-enforced (C3 #1); auto / review / ask lanes; "when unsure, stop and ask." |
| A5 | Deterministic guardrails separate from judgement (Sierra) | Four firm-killing invariants uncrossable in the DB; coding/materiality/close-readiness stay visibility-first. |
| A6 | Grounding before generation; permission before retrieval (Glean) | Context packs are grounded DB/KB retrievals with source attached (not chat recall); RLS + role floors enforced upstream of every write (fixes patterns 3, 4, 8). |
| A7 | Agent proposes, human disposes: co-plan, action-guard, pause-and-ask (Magentic-UI, Google) | plan→review→approve gate on consequential writes; expected-revision token so approval binds to what the approver saw (fixes GAP0-4). |
| A8 | Maker-checker with distinct approver on the high-stakes lane (Basis) | C4: maker always modeled; distinct approver HARD on tax/closed-period/large/year-end/opening; agent never satisfies a sign-off; solo = recorded self-attest. |
| A9 | Escalation with full-context summary (Sierra) | C1 must-ask / open-question object surfaced at client-work start, carrying the reasoning and the source. |
| A10 | Supervisor/monitor over every run + reasoning trail (Sierra, Puzzle) | Phase-5 eval scores every run, flags the doubtful, links to transcript; each entry carries a reasoning trail (explanation, not authority). |
| A11 | Every action audit-logged (Basis, Puzzle) | Typed receipts: actor, timestamp, source-doc ref, rule/fn, confidence, reviewer approve/modify/flag — reverse-not-delete. |
| A12 | Trust as an org posture, not a claim (Harvey Head of Trust) | C6 Gate-2 checklist actually executed: DPA signed, disclosure in firm terms, PDPA cross-border checked, tracing DPA-coverable. |

### AVOID
| # | Anti-pattern | Why (audit evidence) |
|---|---|---|
| V1 | Caller-asserted / unvalidated provenance | A-16: `source_doc_sha256` inserted with zero validation — a citation that isn't bound is theatre. |
| V2 | Confidence as a display-only number | GAP0-1: `client_match_conf` persisted, never checked — the gate must read the value it displays. |
| V3 | Model explanation or SQL literal as the authoritative figure | Pattern 9 (H-1/H-2/H-4): reporting laundered model bytes; `build_export` hard-coded `balanced:true`. The DB owns the number; the trail only explains. |
| V4 | Unearned trust signals (green "In balance" chip with no derivation) | H-2: unlabelled green chip on a hard-coded flag. Every balance/verification claim derived from a DB read. |
| V5 | Chat-only surface for high-stakes finance | Hebbia deliberately rejected conversational-only for a structured grid; matches Clara's workbench-led law (chat **+** workbench). |
| V6 | Fire-and-forget success toasts | D-1/E-1: Documents tab toasted "Clara is filing them" while doing nothing. Verification surfaces must reflect real, durable state. |
| V7 | Over-automation without the ask/stop gate | Even 98%-auto Puzzle keeps the human central and stops when unsure; never auto-post the ambiguous, never let the agent sign off. |
| V8 | Document-level (vs region-level) provenance | Glean: reference lists force guessing which claim came from where; J-18 had only a raw JSON dump + file link. Bind to the span. |
| V9 | Prompt-deep guardrails | Pattern 8: plan→approve, 0.95, maker-checker were model-asserted. Sierra's uncrossable rules live in code/DB, not the prompt. |
| V10 | Lexical/string guards as a security boundary | Pattern 4 (SDT-001): the "read-only" SQL tool wrapped a writer. Read path must be structurally read-only; a verb filter is not a boundary. |

---

## 10. Open threads for the Phase-2 architecture packet
- **Evidence-region capture** depends on the OCR engine emitting bounding data. Azure Document Intelligence returns `boundingRegions`/polygons per field — the pipeline must persist them (the old Azure integration discarded them). Confirm the target extractor's region schema in the runtime/architecture lane.
- **Supervisor/monitor** as a runtime component intersects the runtime decision (D, open at Gate 2): a durable-execution substrate with resumable HITL makes per-run scoring + flagged-for-review durable rather than process-local.
- **Reasoning-trail storage:** typed, provenance-cited, injected/queryable — aligns with the two-layer KB (B): the wiki *informs* the reasoning trail but the trail's figures come from the DB, and wiki content is inert on read.
