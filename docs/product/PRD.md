# Clara — Product Requirements (Rebuild PRD v1)

*Supersedes the frozen `initial acc software skillmd/PRD.md` in full. This is the product law for the greenfield rebuild. It keeps the North Star, sharpens scope to professional Malaysian accounting practice, and binds the Gate-1 owner decisions (`docs/audit/04-gate1-decisions.md`). The invariants in §6 are LAW — they bind every feature, agent skill, and UI decision. The technical realisation is `docs/ARCHITECTURE.md`; the design realisation is `docs/design/`; the plan index is `docs/plan/index.md`, with each wave's contracts and design docs under `docs/plan/active/` while it builds and post-close records under `docs/plan/completed/` *(status lives in the index — a closed wave's docs keep their minted `docs/plan/active/` paths for citation stability, per the index's path-stability convention, 2026-08-18)*; live state and the build queue are `PROGRESS.md`. Acceptance standards for all of it are `docs/product/EVALUATION_RUBRIC.md`.*

**Status:** Gate-2 ratified 2026-07-17 (the decision record is `docs/adr/`). **Date:** 2026-07-17.

---

## 0. What Clara is (North Star)

Clara is an **AI-native Agentic Accounting Operating System** for Malaysian accounting firms. She runs the full accounting lifecycle — client onboarding, day-to-day bookkeeping, ongoing close, tax, reporting, and period-to-period continuity — under professional human control. *(Precision added by ADR-0071, 2026-08-18: routine bookkeeping — coding, posting, bank matching, adjustments, preparation — is autonomous on the agent's own judgement; professional human control CONCENTRATES at the statutory boundary — the close's finalize/attest/reopen keys, reconciliation exceptions, opening-seed approval, statutory wording, `canonical` definitions, capability grants, and e-filing.)*

Clara is **not traditional accounting software with a chat panel bolted on.** She is a **stateful conversational super-UI over the entire product**: every accounting action, whether human-led or agent-led, flows through **one governed, auditable state layer**. The agent is the brain that orchestrates; the shared RLS-isolated Postgres is the single source of truth and the only mutator of numbers. The dashboard is the human's window onto that work — and the agent's body language.

**Core promise:** cut the bookkeeper's manual accounting labour by 99%+ while keeping **zero unattributable journal entries** and **books that tie out**, audit-grade by construction, so a Malaysian accountant trusts Clara enough to act on her nudges — and the product feels premium enough to pay for.

**Jurisdiction:** Malaysian practice — MFRS/MPERS, SST (output-tax only), MSIC business classification, LHDN capital allowances, statutory payroll (EPF/SOCSO/EIS/PCB). Every tax, COA, and reporting requirement sits inside that professional framework.

---

## 1. Problem

- Small Malaysian firms drown in **messy, multilingual, multi-format source documents** (tax invoices, receipts, bank statements, claim forms, payroll summaries, handwritten notes). A bookkeeper manually classifies each, attributes it to the right client, and codes it into that client's COA — slow, error-prone, and the single most firm-killing mistake is **posting to the wrong client or leaving an entry unattributable**.
- The work is **audit-grade**: treat every client's books as if a Malaysian Institute of Accountants (MIA) audit could happen tomorrow — because it can. Every entry must trace to a source document.
- **Coding is not the whole job.** A sales invoice coded to Trade Debtors that does not also create the AR open item leaves aging, statements, allocation, and the control tie-out silently wrong. The profession's real unit of work is *the complete accounting consequence*, not the GL line. (The prior build failed exactly here — the entire subledger side-effect chain was dead code; see `docs/audit/00-GATE-1-README.md` pattern 1.)
- The compliance surface is heavily **Malaysia-specific**: SSM/MIA registration, MyInvois/LHDN e-Invoice + TIN, MSIC codes, the SST regime (output-only, no input credit), MPERS vs MFRS, FYE-driven periods, statutory payroll.
- Existing tools (Xero / SQL Account / AutoCount) are general ERPs — the firm still does all the human coding, triage, and continuity labour. **Clara targets that labour directly with a per-firm agent. It is not another ERP to post into.**

---

## 2. Users / personas + RBAC + segregation of duties

| Persona | Description |
|---|---|
| **Firm owner** (Tao archetype) | Malaysian accounting-firm owner; domain expert in accounting, newer to databases. Sets policy/autonomy, owns drift decisions, runs deploys. Teach DB concepts plainly; be unvarnished; use official LHDN/RMCD/MIA sources, not memory. |
| **Bookkeeper / firm staff** | Day-to-day operator: reviews and approves journals, codes/triages documents, curates the client knowledge base, converses with Clara. They are in a task; the tool must disappear into it. |
| **The AI agent (Clara)** | A second "user" — the UI is her body language. She has her own confidentiality + autonomy contract; she drafts, completes side-effects, and escalates; **she never silently acts on high-stakes items, and she can never satisfy a human sign-off.** |
| **Clients** (the end businesses) | **NOT users — they do not log in.** Their documents flow in via dashboard upload + chat attachment. |

**RBAC ladder — `viewer < bookkeeper < admin < owner`** (rank-cumulative; DB-enforced):
- **viewer** — read-only + export.
- **bookkeeper** — day-to-day bookkeeping + the write-capable agent chat (upload, chat, propose/approve journals, propose KB, view activity).
- **admin** — firm administration (approve KB, invite/manage members, firm settings, create clients).
- **owner** — irreversible/ownership (transfer, firm delete).

One-firm-per-user; the last active owner cannot be removed.

**Segregation of duties (Gate-1 C4) — a first-class model, not prose:**
- Every entry records its **maker** (the human or agent that drafted/last-edited it) and its **checker** (the approver), as distinct modelled identities.
- On the **high-stakes lane** (tax-affecting, closed-period, large-amount, year-end close, opening balances) the checker **must be a different human** from the last human editor — a hard DB gate where the firm has ≥2 eligible staff.
- Routine entries keep the efficient one-person flow.
- ~~The agent can never satisfy any human sign-off — every agent-drafted entry requires a bookkeeper+ human approval; standing-rule posts execute under the signing admin's authority (`checker_actor = rule.signed_by`, ADR-025) through the unchanged predicate wall. The invariant is *no unbounded / agent-initiated auto-approve*; Clara is never the approving identity on her own postings.~~ **SUPERSEDED by ADR-0071 (2026-08-18):** the agent's own judgement is the unattended posting authority under the witness-pair regime (digest laws 71-72); her posts record her identity + model/version on the receipt. "The agent can never satisfy a human sign-off" survives only for the enumerated human acts (close keys ②③, `except_bank_line`, opening-seed approval, statutory wording, `canonical`, capability grants, e-filing). The HUMAN lane's maker/checker above is unchanged.
- **Solo firms** (one eligible human) record an explicit self-approval attestation instead of being hard-blocked.
- **Authority is live, not stale-token** — a removed or demoted member loses read+write immediately (session/authority revocation), closing the prior build's stale-JWT hole (GAP1-4).

---

## 3. Value proposition + brand

- **A bookkeeper that never sleeps, never loses an entry, and never leaves the books half-done** — 99%+ less manual labour, zero unattributable entries, and *complete* accounting consequences (subledgers, registers, reconciliation, reporting, knowledge) on every workflow.
- **Firm-scoped agent + DB-enforced tenant isolation** — forced RLS per firm, EXECUTE-only writes through audited functions, firm-scoped credentials, proven by the cross-firm isolation rig. Each firm's books are private (PDPA / MIA confidentiality).
- **Trust-first autonomy on structural walls** — Clara reads, decides, posts and completes side-effects on her own judgement (ADR-0071); what she cannot lawfully decide falls closed to a typed open question, and the statutory boundary stays human (§0 note). The four firm-killing invariants are **structural DB guarantees**, not prompt requests (Gate-1 C3) — the walls are what make the autonomy safe to grant.
- **Learns each client over time** — a per-client **knowledge wiki** (Karpathy two-layer, §6a) that compounds from every document, correction, and reconciliation, so coding gets more autonomous without losing auditability.
- **Audit-grade by construction** — DB-owned numbers, append-only history, reverse-not-delete, every entry traces to a `source_doc_sha256` that is **validated at insert**, full maker/checker attribution.
- **Brand: calm, premium, alive. Trust first, delight second** — a serious financial instrument with a quiet presence; everything defers to the work.

---

## 4. In-scope capabilities (v1 — the compliance-correct core, Gate-1 C5)

1. **Self-serve firm signup** → a firm workspace in the shared RLS project, behind a fail-closed admission gate.
2. **Agent-led onboarding** — firm setup and client onboarding as intelligent, iterative, clarify-driven interviews (validate/normalise inputs, infer parameters, continue end-to-end, never store flawed data). **Ongoing-client carry-down** ties the new books out to the client's management accounts at takeover: opening GL balances, AR/AP open items, fixed-asset register + depreciation baseline — through the carry-forward function, with a **TB tie-out assertion**, and **idempotent** (a re-run can never double the opening position — fixes B-1).
3. **Live agent chat** — firm-altitude + per-client context, rendering Clara's clarify / plan / choice / analysis / document / tool-result / approval cards as a real generative-UI card system (fixes D-2..D-7).
4. **Document pipeline** — upload (file picker + drag-drop + paste), OCR, **persist-after-OCR always** (unassigned lane included; uploaded once, referenceable forever), client matching, an evidence-region viewer for side-by-side verification (fixes D-1/E-1/E-2/J-18), and a **classify-first doc-type classifier** that gates the fact-extraction engines — every document's type is resolved before its facts are read, with **unforgeable human-recorded precedence** over the model's verdict (Wave A2.1, ADR-028/029/030).
5. **Journals workbench** — review queue; plan/approve/edit/reject/reassign; balance + tax-leg visibility; bulk approve; maker/checker; status spine.
6. **Coding with complete side-effects** — every coded document/transaction completes its downstream accounting consequence **in the same audited transaction**: AR/AP open items, bank allocation, fixed-asset register, reconciliation state, KB/wiki update — or explicitly surfaces the exception. (The F3 failure criterion is a shipping gate.)
7. **AR/AP open-item subledgers** — per-invoice/bill open items, settlement matching, real aging (30/60/90), customer/supplier statements, bad-debt provisioning; control tie-outs that stay honest across periods.
8. **Bank reconciliation** — statement-line ingest + **agentic matching and adjustments on the agent's own judgement** (ADR-0071/G3) over unchanged **structural match-parity checks** (right account/period/amount to the sen, entry exclusivity — fixes GAP1-1/1-2) + tie-out that gates year-end close; `except_bank_line` — the exclusion act — stays a human owner-floor verb, agent-proposable only.
9. **Fixed-asset register** — acquisition (created from coding), depreciation (DB-computed, DB-posted, actually run and gated), disposal (register + accum-dep + gain/loss), capital-allowance metadata.
10. **Adjustments** — recurring/reversing journals (auto-reverse accruals, amortise prepayments).
11. **Tax — SST done right** — registration/taxable-period model (incl. DG variations), service-tax **payment basis** on real AR anchors + s.11(2) 12-month rule, sales-tax accrual basis, dual-registrant separation that **survives export**, output-only (no input credit), maintained rate/sector schedule, SST-02 return, bad-debt relief. Two amendments ride with it (Wave A2.1, ADR-028/029/030). The **structural SST registration compliance watch** warns the firm before a client crosses the registration threshold: DB-computed per service group on the statutory month-end rolling test, with earliest-crossing detection, surfaced through the review queue and the context pack — and **advisory by construction, it never blocks a workflow and never posts a figure**. The **purchase-side SST visibility split** records stated input SST as a tied `sst_purchase_cost` expense leg, never a recoverable input-tax asset (Malaysian SST has no input credit, WA21-R1).
12. **Tax — draft computation** (last v1 slice; may slip to v1.1) — add-back engine, capital-allowance schedule, chargeable income, Form C/P/B + CP204 estimate. Clara prepares; the human reviews and e-files. **Clara never submits to LHDN.**
13. **Year-end close + carry-forward** — P&L→retained-earnings, opening-balance carry-forward, subledger/FA continuity, **segmentation-correct continuity reads** (fixes F12-1), serialized close (fixes GAP2-1), ordered reverse/re-open guards (fixes GAP5-3).
14. **Financial statements — honest** — SoFP + SoCI **+ SOCE + cash-flow + basic notes**, or the pack does not claim MPERS compliance (fixes GAP2-5). Every figure from DB read functions/snapshots — never model-computed.
15. **Reporting & exports** — standard exports (TB, journals, GL, MA/FS, AR/AP aging, SST-02) **and** flexible ad-hoc reports, all schema-driven with authoritative DB numbers; every export persisted as an auditable artifact with parameters, data version, permissions, reproducibility (fixes H-1/H-2/H-4).
16. **Statutory payroll touchpoints** — code PCB/EPF/SOCSO/EIS + a built deadline calendar (no payroll engine).
17. **Inventory** — periodic closing-stock adjustment at close with a completeness check (no perpetual inventory).
18. **Proactive exception inbox** — event-driven wakes → a cross-client "Needs you" inbox + per-client notices; **speak-never-act, structurally enforced** (allowlist per wake kind — fixes I-2/Ggr-7).
19. **Activity feed / audit trail** — append-only history + receipts; actor + maker/checker attribution; reverse-not-delete with required reason; close lifecycle writes receipts (fixes GAP5-2).
20. **The per-client knowledge wiki** (§6a) — Clara's compounding client memory, informing every decision.
21. Members/RBAC, ⌘K command palette, settings, export/job-lane/session overlays.

### §4.94 — MyInvois scope

Track B (hybrid SST output-tax posting) is in-scope; Track C (inbound UBL-XML parse) is BUILT + LIVE as a local no-egress structured engine (Wave A2, ADR-025/026/027); **API pull + outbound issuance remain future scope**.

### §4.95 — ~~Human-signed bounded auto-posting~~ (SUPERSEDED by ADR-0071)

*(Historical: Wave A2.1's standing-rule auto-post lane — signing-admin authority, the
purchase→sales lift, the nine-control OCR-sales envelope, WA21-R1/R2's stated-SST
human-lane restriction. Superseded 2026-08-18: the rules machine's execution tier
retires with ADR-0071/G1.4; unattended posting is the agent's own judgement under
digest laws 71-72, uniformly across directions and document classes. The text is kept
for provenance; nothing here binds the build.)*

### §4.96 — Named future behaviours, each with its wave (the Wave-C-close §7-B amendment, ADR-054)

Five real behaviours previously had no home in any artifact. Each is now named with the wave that owns it:

- **Staff advances → Wave D** — a non-`payable`-class advance/repayment mechanic on the WC-R10 convention, the shape the C-c ROME PUBLIC advance already exercises.
- **Staff allowances → Wave F** — payroll-calendar adjacent; coded, never computed.
- **Self-billed e-Invoice obligation detection → Wave F** — the verified primary-source trigger rules wait in `docs/plan/research/wave-c/my-tax-verified-2026-07-29.md` §1.6.
- **Withholding tax as a mechanic → Wave F** — the COA template's `430-WHT` payable is the prepared landing.
- **Foreign currency → its own wave after G** — WC-R5's fail-closed re-deferral stands until then.

Naming is scoping, not build: each row is re-openable at its wave's grilling.

---

## 5. Core user journeys

1. **Firm onboarding** — first contact → clarify interview → a `firms` row + owner membership in the shared project.
2. **Client onboarding (new or ongoing)** — identity interview → seed COA + child tables → for an ongoing client, carry down opening balances/subledgers/FA register through the idempotent carry-forward function with a TB tie-out → KB wiki seeded from prior data → dry-run review → commit.
3. **Chat-driven bookkeeping with complete side-effects** — document arrives → Clara identifies client (≥0.95 DB-gated or clarify-picker) → OCR → context pack retrieved (client profile, FY/period, wiki, COA policy, open items, history) → coa-coding → GL + all downstream side-effects in one audited transaction → auto-draft (tightest lane) or Plan card → approve → receipt in the activity feed.
4. **Workbench triage** — journals / KB / documents / subledgers / registers as tabs of one client workspace with a docked agent rail; unbalanced = first-class error; posted correction = reverse-not-delete.
5. **Reconciliation** — statement ingest → parity-checked matching → exceptions surfaced → tie-out → gates close.
6. **Proactive → exception inbox** — an event fires a wake → Clara assesses → records exactly one notice → the firm-altitude inbox bridges into the exact client row. Never acts.
7. **Close & continuity** — pre-close gates (no uncoded docs / no open recon / tie-outs clean) → serialized close → carry-forward → next period opens; every continuity read stays segmentation-correct.
8. **Report/export** — NL request → structured report spec → DB read functions produce numbers → renderers (CSV/PDF/XLSX/UI artifact) → durable auditable artifact → signed-URL card.

### 5a. The OS surface (the agentic super-UI contract)

§0 promises a **stateful conversational super-UI over the entire product**, not accounting software with a chat panel bolted on. This section states what that obliges the surface to deliver, written as promises to the accountant who uses it. The design realisation — layout, motion, tokens, the card catalog, and the build-time gates that enforce them — is `docs/design/` (`PRODUCT_DESIGN.md` today; the full set populates at Wave G, which owns closing this surface).

**The acceptance test that governs every surface** (adopted, `docs/design/PRODUCT_DESIGN.md` §1): *remove the chat rail — the workbench must still show what Clara did, why, with what evidence, and offer every Clara action as an object-level verb.* A surface that only works when you talk to it has failed.

- **One workspace, two panes.** The accountant works in a client workspace — journals, documents, subledgers, registers, knowledge — with Clara docked alongside as a rail, never a modal. The rail is where she speaks; the workbench is where the work lives. Neither is a view of the other.
- **Clara answers in objects, not walls of text.** Every reply is a typed card — clarify, plan, choice, analysis, document, tool result, approval — that is inspectable, actionable, and re-derives its authoritative status whenever it is re-opened, so a card read tomorrow tells the truth as of tomorrow rather than as of when it was written.
- **Every card is honest about state.** Nothing renders as done before its outcome is confirmed, a terminal card is inert, and a card whose action has since been reversed says so.
- **One proactive inbox across every client.** Exceptions surface in a firm-altitude "Needs you" list spanning the whole book of clients, and each entry bridges into the exact client row that needs the decision. Clara never acts from it (§6.11).
- **Plans are documents, not chat scrollback.** A close or an onboarding is a plan the accountant can read end to end, watch progress against, and compare intended-vs-actual afterwards.
- **Every object offers its verbs.** Anything Clara can do to a thing, the accountant can do to that thing directly from it — no hunting for the phrasing that triggers the right skill.
- **One way in, from anywhere.** A single command surface (⌘K) covers Ask, Do and Go; dispatching work from it hands off to the workbench's own approve gate instead of starting a conversation.
- **The URL is the truth.** What is on screen is addressable, shareable and restorable; the accountant never loses their place to a refresh.
- **Density without illegibility.** The surface is built for a professional working at speed all day — and compact mode still meets the accessibility floor, with confidence always shown as shape and label, never hue alone or a bare number.
- **Recovery is a surface, not an apology.** Interruption, failure and resumption are first-class states with a way forward, because §6.13 makes every mutation durable and resumable.

**Completeness is the gate, not the intention.** The card vocabulary must be *complete* — every card the product can emit has exactly one authoritative emit path, and renders identically live and re-hydrated — and that completeness is proven at build time, not by review. The promises above are what "Wave G closed" has to mean.

---

## 6. Product invariants — LAW

These bind every feature and every agent skill. Violating one is a defect regardless of look or convenience.

1. **The DB owns every AUTHORITATIVE number; the agent only orchestrates.** The firm's RLS-isolated books are the single source of truth and the only mutator. **The LLM may propose or independently check a calculation, but no model-generated numeral enters a durable report unless a versioned deterministic evaluator reproduces it from DB-owned inputs** *(wording amended by ADR-065/E-R4, 2026-08-08, on a three-lane evidence dossier — `docs/plan/research/wave-e/q4-computed-figures-evidence-2026-08-08.md`; supersedes the blunter "never computes a figure" phrasing without weakening it: proposing and checking are now named as lawful, the authoritative path is unchanged)*. Operationally the agent calls deterministic Postgres functions that assert balance and RAISE otherwise; this holds through the reporting/export/analysis boundary (no model-authored number reaches a rendered artifact — fixes H-1/H-2/H-4; narration and charts take figures by placeholder substitution from the evaluated artifact, never model-retyped). A model numeral is never an evaluator input — "reproduces" means the evaluator ORIGINATES the value from source facts and approved versioned constants; on any divergence the stricter render boundary (§4 item 14, §8's exclusion table, ARCHITECTURE §6) governs.
2. **The four firm-killing invariants are STRUCTURAL** (Gate-1 C3), not prompt requests: **(a) Client attribution** — no client-scoped write proceeds without a persisted, server-verified client resolution. It may be a human click, an exact identifier match, **or the agent's own judgement under the structural walls of ADR-0074/TA-P7 — a printed identifier naming a different client REFUSES, more than one candidate must be clarified, a re-attribution raises a named misrouted-egress event, an unresolvable document falls to a firm-scoped question, and when she is unsure she asks.** Cross-tenant posting remains impossible, not merely discouraged. *(AMENDED by ADR-0074/TA-P7, ratified 2026-08-22; digest law 79. **AS-BUILT CAVEAT:** the live `assert_client_resolved` body still enforces `method in ('human','rule')` and `confidence >= 0.95` — `0018_gate_k_domain.sql:57,62` — until F-A7a recuts it. **Was:** ~~"(a) client attribution — no write proceeds without a DB-enforced ≥0.95 client resolution; cross-tenant posting is impossible, not merely discouraged."~~ The ≥0.95 numeral leaves with the judgement it described; `assert_client_resolved` and its no-write-path-skips-it property are unchanged — what changes is the admissible ORIGIN of the resolution it reads. A model never scores itself, digest law 72. Orchestrator's dissent on file.)* **(b) Provenance binding** — every document-origin entry's `source_doc_sha256` + document reference is validated at insert against a real ingested document (fixes GAP0-1); never invent an identifier/TIN/SSM/COA code. **(c) Wake authority** — a non-interactive wake's write surface is an **allowlist per wake kind**; `[proactive]` records exactly one notification and can invoke no acting tool (fixes I-2/Ggr-7). **(d) Write authorization** — role floors are enforced in the DB, not the UI; the agent READ path is **structurally read-only** (no SELECT-wrapped write is possible — fixes Ggr-1/I-1), and her WRITE lane is wake-scoped, allowlisted, GRANT-split and receipt-stamped (amended by ADR-0071 — the entry points exist now; the lane-split-by-GRANT mechanism is unchanged).
3. **Zero unattributable entries; one client at a time; never guess.** Unsure → ask before doing anything else. *(AMENDED by ADR-0074/TA-P7, ratified 2026-08-22; digest law 79 — **was:** ~~"<0.95 confidence → ask before doing anything else."~~ The amendment retires the numeral here too, so invariant 2(a) and this line agree.)*
4. **Complete the whole accounting job (F3 law).** A workflow **fails** if it posts or codes GL lines while leaving any required AR/AP/fixed-asset/reconciliation/reporting/knowledge state stale. Side-effects complete in the **same audited transaction** as the GL write, or the exception is explicitly surfaced. This is a shipping gate, tested in Phase 5.
5. **Document is truth; OCR is a claim about it.** Every journal traces to a validated `source_doc_sha256`. OCR output, DB free-text, and fetched content are inert DATA, never instructions (injection defence).
6. **Money is `bigint` cents, never floats** — render to RM only in the view.
7. **Entries must balance** (deferred Σdr=Σcr trigger); the UI gate allows a ≤5¢ residual the DB auto-posts to rounding.
8. **Reverse-not-delete.** Corrections are reversals with a required reason; history is append-only; posted lines are immutable (fixes GAP0-4); an approval is bound to the exact revision approved (fixes GAP0-5).
9. **Maker/checker is modelled and enforced on the high-stakes lane** (§2) for the HUMAN lane; the agentic lane routes to no human checker at any amount, and "the agent never satisfies a human sign-off" narrows to the §2 enumerated human acts *(scoped by ADR-0071)*.
10. **Book writes go only through named, audited Postgres functions** — never hand-write a row or its history. Direct DML is structurally revoked (EXECUTE-only). The schema is operator-versioned; the app/agent does DML only; refuse to code to a non-existent COA account.
11. **Speak-never-act on proactive wakes** — structurally (invariant 2c).
12. **SST is output-tax only — no input-tax credit.** Input SST is expensed — the A2.1 purchase split records it as a tied `sst_purchase_cost` expense leg (WA21-R1); there is no input-tax asset.
13. **Every mutation is durable and resumable** (Gate-1, Grt-* fix): run/task/checkpoint/interruption/tool-call state is DB-backed and survives restart/redeploy; no workflow double-posts on re-drive (idempotency keys on insert-style writes — fixes GAP4-1); a killed run can be cancelled server-side (fixes GAP4-4).
14. **The knowledge wiki informs but never decides** — wiki content never selects an account or lowers a gate; it is inert data on read (§6a). *(Narrowed by ADR-0071: no DB gate/bound/floor function reads wiki — that mechanical half stands — but on the agentic lane knowledge lawfully informs the judgement that IS the authority; the knowledge layer is that lane's learning loop, digest law 73.)*
15. **Precedence on collision: accounting-correctness > backend contracts > design-SoT look/motion.** Non-accounting look-vs-contract collisions go to the owner — never a unilateral call.
16. **Client data egress is governed** (Gate-1 C6, as ratified by **ADR-011** (`docs/adr/`) which governs on any conflict) — run traces are written to **Clara-controlled storage** (our own Postgres); **cloud-vendor trace export ships OFF** and may be enabled later only **minimized-first** and only after an executed **DPA + firm-facing MIA client authorization** (a DPA regulates the processor but does not by itself confer the authority to disclose client information outside the firm) + a documented PDPA cross-border basis + short retention + tested deletion; no vendor training on firm data.

**Split-trust corollary:** the browser holds only its session JWT; forced RLS + EXECUTE-only grants are the isolation boundary. Reads go via RLS-scoped selects/read fns; writes go only via audited SECURITY-DEFINER functions; service credentials live only in the agent service.

### 6a. The per-client knowledge wiki (Gate-1 B — Karpathy two-layer)

The prior build's memory-note layer was write-only dead weight (C-1). The rebuild replaces it with a **two-layer** knowledge system:

- **Layer 1 — the wiki (knowledge/context).** A per-client, Clara-maintained set of interlinked markdown pages (client profile, counterparties, treatments, recurring patterns, open questions, period context) built over **immutable raw sources** (documents, prior GL, statements). Three operations: **ingest** (a new source updates the relevant pages + cross-references + activity log), **query** (retrieve relevant pages, synthesise with citations, optionally file the analysis back), **lint** (scheduled health-check for contradictions, stale claims, orphaned pages, gaps — surfaced to the owner). The wiki is versioned, provenance-cited, and **injected into every context pack** so Clara genuinely knows the client. Wiki content is **inert data on read** (injection defence).
- **Layer 2 — the typed authority.** A thin typed layer holds the posting gates: user-gated account-mapping rules, the DB-enforced ≥0.95 client gate, and first-class **open-question (must-ask) objects** with resolution state that block workflows until answered. Memory-note needs map here: observation/profile → typed client-profile facts with provenance; must_ask → open-question objects; rule_hint → low-evidence rule proposals.

**The wiki informs; the typed layer decides.** The wiki never selects an account, lowers a gate, or authorises a write.

---

## 7. The event-driven accounting state layer (the North-Star spine)

The prior build had no event layer, no context pack, and no stale-context detection (A-1..A-7). The rebuild's spine makes four promises; **`docs/ARCHITECTURE.md` owns how each is realised** — the event catalog, the durable log and its outbox, the context-pack contract, the version token, and the trigger taxonomy all live there, not here.

- **Nothing that happens is lost.** Every accounting action publishes an auditable domain event, and everything that must move with it — records, the client wiki, the document/OCR index, retrieval signals, reconciliation status, Clara's visible context — moves in the same transaction rather than by model mediation (fixes A-2/A-3).
- **Clara never decides uninformed.** Before any accounting decision she retrieves a fresh context pack: who the client is, where they sit in their financial year, their tax and COA position, and what has already happened to their books.
- **Clara never acts on stale data** (fixes A-7). Context is version-stamped, and every recommendation, trigger, sync, approval, reversal and posting stays traceable through the audit spine.
- **What may wake her is governed, not ad hoc** (A-2). Which events may proactively trigger Clara — and which must never — is a defined taxonomy keyed on accounting risk, materiality, workflow state, period status and context freshness, not a per-feature judgement call.

---

## 8. Non-goals / constraints (explicit)

| Not doing | Instead |
|---|---|
| Clients logging in | One auth surface (staff); client docs flow via upload + chat attachment. |
| Automated import/post into external ERP | File export only (CSV/PDF/XLSX) — never an ERP import/post. |
| Editing the DB schema from the app | Schema is operator-versioned; the app/agent does DML only. |
| An autonomy-dial settings page | Autonomy lives in the Agentic Charter (ADR-0071) + the structural invariants; there is no dial — the posture is uniform and permanent. |
| Billing/subscriptions (deferred pre-launch) | Interim guardrail = email-verify + fail-closed admission gate + per-firm usage METERING (visible monthly spend, never a cap that pauses automation — narrowed by ADR-0071/G8; engine-protective concurrency floors stay). |
| Held WebSocket chat | SSE only. |
| Outbound MyInvois issuance | Track C is inbound-only — the local no-egress UBL parse is live (ADR-025/026/027); API pull + issuance stay future scope. |
| Multi-entity / group consolidation | Single-entity books per client. |
| Perpetual inventory | Periodic closing-stock only. |
| A payroll engine | Code PCB/EPF/SOCSO/EIS + calendar the deadlines. |
| Acting as the external auditor | Prepare audit-ready books + lead schedules — not the audit. |
| Model-computed numbers in any artifact | Every figure from DB functions (invariant 1). |
| A full draft tax computation as a hard v1 gate | It is the last v1 slice; may slip to v1.1 (Gate-1 C5). |

**Durable Malaysian-tax context:** GST repealed 2018 → **SST** (service 6%/8% — 8% general from 2024-03-01, 6% retained for specified sectors; sales 5%/10%; output-only, no input credit). MyInvois e-invoice exemption **RM1M** (6 Dec 2025); the RM500k–1M band was **cancelled — never re-add it**. Framework: MPERS (mandates no specific COA). Standard COA seed is LHDN-sourced and re-verified against official sources during Phase 3.

---

## 9. Open product questions (for later gates)

*Resolved questions are annotated in place and kept for provenance — this list is never pruned.*

1. **Runtime choice — RESOLVED (ADR-008).** The AI SDK 7 model layer + Workflow DevKit durable substrate (`@workflow/world-postgres`), self-hosted on our own Postgres, behind a swap-seam (named fallback: LangGraph JS + PostgresSaver). See `docs/ARCHITECTURE.md` §4.0 + `docs/phase2-research/runtime-recommendation.md`. Kept here for provenance; no longer open.
2. **C6 compliance execution** — the DPA, firm-facing disclosure, and PDPA cross-border transfer check are Gate-2 checklist items that must be satisfied before any firm data flows to a vendor trace platform. **STATUS: OPEN, and structurally held shut** — cloud-vendor trace export still ships OFF under §6.16, so no firm data has reached a vendor trace platform; the checklist must be satisfied before that can change.
3. **Billing model + scale guardrails** — the pre-public-launch gate; per-firm token/usage cap design. **STATUS: OPEN** — §8's interim guardrail (email-verify + fail-closed admission + per-firm metering/budgets/concurrency) is what stands until it is answered.
4. **Tax-computation v1 vs v1.1** — the draft computation is the last slice; the slip decision is data-driven during Phase 4. **STATUS: OPEN** — the decision now belongs to Wave F planning, which owns tax.
5. **MyInvois depth** — Track B built; Track C inbound UBL parse LIVE as a local no-egress engine (Wave A2, ADR-025/026/027); API pull + outbound issuance deferred. **STATUS: PART-RESOLVED** — the inbound half is settled and live (§4.94); only API pull + outbound issuance stay open, and §8 holds outbound issuance as a non-goal meanwhile.
