# Clara Phase 1 — Open Decisions for the Owner (Gate 1)

*The hero prompt says all questions land at gates, not scattered mid-run. These are the decisions I need from you to shape Phase 2. Each has evidence, a recommendation, and a default — you can accept all recommendations in one go, or override individually. Nothing is built or destroyed until you rule.*

Legend: **[DECIDE]** = I need your ruling to proceed correctly · **[CONFIRM]** = I've made a reversible call; veto if wrong · **[GATE-2]** = flagged now, formally decided at Gate 2.

---

## Part A — Workstream C decisions (the hero prompt asks for these explicitly at Gate 1)

### C1 · Memory notes — **[DECIDE]** · Recommendation: **MERGE-INTO-KB (retire the as-built layer)**

**Evidence.** The write half works and is well-isolated (`27-fns-memory.sql` + the `kb.ts` tool + dual-seed, with isolation test 7 and dual-seed test 11 passing). But **the read half was never built** — no skill, no wake hint, no context builder, no read function, and no dashboard surface consumes a note. The only consumption path is one optional sentence in `AGENTS.md:74` asking the model to run a `query_books` SELECT, and ADR-033's promised Storage-rendered markdown memory index has no implementation. The learn-wake lanes that should *generate* notes are policy-blocked from writing them. It is the weakest-audited writer in the schema (no `via_fn`, unconstrained free-text actor, empty note accepted). Measurable contribution to Clara's intelligence today: ≈ zero. *(C-1, C-3, C-4, C-5; salvage: DROP `client_memory_notes` + `record_memory_note`.)*

**Recommendation.** Retire the table/fn as-is; carry the three real underlying needs into the rebuild's knowledge layer as *typed, lifecycle-managed* objects: `observation`/`profile` → typed client-profile facts with provenance in the KB (structurally injected into context packs); `must_ask` → a first-class open-question/interruption object with resolution state the workflow engine surfaces at client-work start; `rule_hint` → a low-evidence KB-proposal state. Do not port an append-only free-text pile with no consumer and the weakest audit discipline — it is pure injection-surface liability.

**If you disagree:** the alternative is *keep* (build the missing read half onto the existing table). I advise against it — you'd be hardening a design whose every consumer still has to be built anyway.

### C2 · Contacts / counterparties — **[DECIDE]** · Recommendation: **SPLIT — carry-forward the name-intelligence, redesign the data layer**

**Evidence.** *Genuinely used and in sync:* `client_counterparty_aliases` + `app.normalize_counterparty` + `resolve_counterparty` (audited bookkeeper+ write, read structurally inside evidence/rule/subledger/recon-hint writers, isolation-tested) and `client_recon_hints` (full human-gated learn loop). This is proven, tested design worth keeping conceptually. *Mostly dead weight:* the AR/AP open-item layer that actually **carries** counterparty balances — its seven writer fns are sound but have **zero callers after onboarding** (absent from the tool registry, every skill, and the dashboard), so aging, statements, allocations, tie-outs, and the contacts fold-in all freeze at the opening seed. There is no counterparty **entity** at all — identity is free-text snapshot strings merged display-side, so an alias repoint splits history and can strand settlements, and coding-time rule lookup doesn't even use the alias map. *(C-6, C-7, C-9, C-10; and this is the same dead chain as F3-1/2/3.)* **Verification correction (C-8):** the SST return is *not* starved by this — an unanchored tagged service-tax leg silently falls back to the cash-direct bucket and is declared in full at posting-date, so the real defect is a **silent statutory-basis substitution** (accrual where the law requires payment basis; s.11(2), bad-debt relief, and advance handling all structurally inoperative), which `backend.md:81` misrepresents as a built payment basis.

**Recommendation.** (1) Create a first-class per-client counterparty **record** (id-keyed, typed, alias children) FK'd from rules, evidence, hints, and subledger items; (2) make subledger maintenance **intrinsic** to the coding/receipt executions (or DB-derived from control-account legs) so it cannot silently diverge; (3) keep the tie-out honesty pattern but let it travel with exported artifacts, and gate SST service-basis computation on proven feedstock completeness.

---

## Part B — KB engine intent — **[DECIDE]** (needs your input + possibly your source files)

The audit found the as-built KB keeps a strong *governance* spine (per-client rules, user-gated promotion, alias collapse, decay/override-watch, full audit — all verified) but the *learning engine* is thinner than the repo's own docs claim, and — separately — thinner than two design notes on your Desktop describe:

- The **candidate rule tier** is unreachable — no writer mints one — yet the ladder, the coding skill, `AGENTS.md`, the KB-workbench spec, and a dashboard count all still describe it as live. *(C-11)*
- The proposals table structurally forbids every proposal type except `rule_promotion`; the pipeline is purely reactive. *(C-12)*
- Human-pinned 1.000 rules decay and auto-retire identically to evidence-derived ones, while doctrine still offers "lock" verbs. *(C-13)*
- Your design notes describe capabilities with **no v2 counterpart at all**: a per-client **materials registry** (Circle-1: register/hash/retrieve accounting manuals, vendor contracts, bookkeeper notes), **bulk rule seeding from a prior-period GL import** (Path B — "hundreds of rules in seconds", the fastest cold-start cure), and a **weekly curator + derived client views** (Tier-2). *(GAP2-2, GAP2-3, GAP2-4)*

**What I need from you:** which of these are rebuild requirements vs. deliberately-dropped? **Important caveat:** the two design-note files (`KB ITERATION SYSTEM.md`, `PER CLIENT KB MECHANISM.md`) live on your Desktop but are **not in the repo**, so I've treated their contents as *signals*, not as verified owner-intent. If you want them to bind the rebuild's KB design, drop them into the new repo and I'll fold them into the Phase-2 PRD as first-class requirements. Otherwise I'll present these as capability gaps for you to accept/defer item by item.

---

## Part C — Product & philosophy decisions the audit forces

### C3 · The autonomy philosophy, re-examined against the failure modes — **[DECIDE]** (the big one)

Your standing stance (ADR-027/034, and your PM-rigor memory) is **agent flexibility + edge-case visibility over hard DB constraints.** The audit respects that — but it also found that many *firm-killing* gates are currently **prompt-only**, and we now have the receipts on what that costs: the ≥0.95 client-identity gate is model-self-reported and never enforced (A-16); the six auto-post conditions are prompt-only (A-5); journal provenance is inserted unvalidated (GAP0-1); the `[documents]` wake can reach `approve`/`reverse`/`close` on a blocklist (I-2, Ggr-7); there's no maker-checker (GAP3-7). **The question:** for the rebuild, where is the line between "surface it and let the human decide" (your preference, right for coding taste) and "the DB refuses it structurally" (right for the firm-killing axis — cross-client posting, unattributable entries, unsupervised wake writes, unauthorized closes)? **My recommendation:** keep visibility-first for *accounting-judgement* calls, but make the *four firm-killing invariants* — client attribution, provenance binding, wake speak-never-act, and write authorization — **structural DB guarantees**, not prose. This isn't a reversal of your philosophy; it's drawing the constraint boundary where the audit proved the prose leaks.

### C4 · Maker-checker / segregation of duties — **[DECIDE]**
There is **no maker-checker anywhere**: the same bookkeeper who drafts or edits an entry approves it; "high-stakes" has the same one-person floor as routine; the drafter's identity isn't even modeled; the auto-lane sweep sign-off can be done by a viewer — or by the agent on its own postings. *(GAP3-7.)* For a small Malaysian firm this may be acceptable by design, or it may be exactly the audit-defensibility you want. **You're the accountant — is real maker-checker a v1 requirement, or explicitly out of scope for firms this size?**

### C5 · Tax & compliance depth for v1 — **[DECIDE]**
ADR-044 promised a full draft tax computation + SST-02 + AR/AP subledger. The audit found tax is **partial**: SST service-tax payment-basis silently degrades to accrual with no AR anchors (F3-8/C-8), no taxable-period model exists (GAP3-1), the FS pack is SoCI+SoFP only but stamps "MPERS/MFRS-compliant" with no SOCE/cash-flow/notes (GAP2-5), and payroll/inventory are scaffolding (GAP2-6/7). **How much of this is v1 vs. deferred?** I'll turn your answer into the Phase-2 scope boundary and the coverage map.

### C6 · OpenAI tracing data-egress — **[DECIDE]** (PDPA / MIA confidentiality)
Right now every firm's chat, OCR text, and tool args/results export by default to `api.openai.com` (tracing on, sensitive data included, no opt-out in code). *(GAP1-8.)* For a product whose whole promise is firm-private books, this is a compliance decision, not a config detail. **Options:** (a) self-host tracing / disable platform export in the rebuild (my recommendation); (b) accept it under a data-processing agreement + disclosure. Your call, and it interacts with the runtime choice below.

---

## Part D — Runtime direction — **[GATE-2]** (flagged now, decided at Gate 2)

The preliminary runtime research (`evidence/runtime-research.md`, npm-verified 2026-07-17) scored the OpenAI Agents SDK (incumbent), Claude Agent SDK, Vercel AI SDK + Workflow DevKit, Mastra, and LangGraph JS against your G2–G10 requirements. The decisive rows — **durable session state, resumable HITL interruptions, and durable-workflow checkpointing** (your #1 pain, patterns 2 above) — separate them sharply: the incumbent's durability is in-memory-only (the exact thing that breaks today), while durable-workflow substrates (Vercel Workflow DevKit, LangGraph's checkpointer) and model-agnostic cores score highest; the Claude Agent SDK is model-locked, which fails the swap-provider requirement as stated. **No decision is requested now** — this lands with the full architecture at Gate 2. I flag it so you know the incumbent is *not* the presumptive answer.

---

## Part E — Confirmations (reversible calls I've made — veto if wrong)

- **[CONFIRM] Rebuild workspace location.** I put the fresh workspace + this audit packet at `C:\Users\zhant\Desktop\clara-rebuild\` (git-initialized). It can seed the Phase-3 fresh repo, or I can relocate/rename it. The frozen `initial acc software skillmd` repo and the `belcort-shared` Supabase project remain **untouched** — as the hero prompt requires, they stay the audit's evidence until Phase-5 sign-off.
- **[CONFIRM] Signal files treated as input, not gospel.** Your Desktop notes (`harness bugs.txt`, the harness improvement report, the two KB design notes) were verified against code where they overlap this product. The two harness files target the *separate belcort dev-toolchain plugin / an earlier prototype*, not this codebase — their methodology lessons (user-journey simulation gates, verification-before-completion, state-transition acceptance criteria) feed the **Phase-5 verification design**, not the Phase-1 findings. Flag if you intended them as findings against this build.
- **[CONFIRM] Live-DB claims marked unverified.** I did not connect to the live Supabase or restart/inspect Fly beyond what a worker could read read-only. A handful of runtime facts (live env vars, SDK trace behavior, deployed image) are cited as **unverified** in the findings. If you want a live read-only sweep before Gate 2, authenticate the Supabase MCP (`/mcp`) and I'll run one.

---

### The one-line ask

**Rule on C1, C2, and Parts B/C (C3–C6); confirm or override Part E. Part D waits for Gate 2. Then I proceed to Phase 2: refreshed PRD + target architecture + design direction + rebuild plan.**
