# DOCTRINE + PRODUCT-DOC MAP — frozen repo `C:\Users\zhant\Desktop\initial acc software skillmd`

> Audit evidence map, produced 2026-07-17. **Repo treated as READ-ONLY evidence** (no repo files touched).
> NOTE FOR THE ORCHESTRATOR: the work order referenced `undefined/audit-brief.md` and repo root `"undefined"` —
> a variable-substitution failure in the calling script. No `audit-brief.md` exists anywhere on this machine, so the
> brief's severity rubric / output contract could not be read; this map follows the explicit instructions embedded in
> the work order itself. The work order said "10 skills"; the repo contains **11** `belcort/*/SKILL.md` files (bank-recon,
> client-onboarding, coa-coding, doc-ingest, export, firm-bootstrap, kb-evolve, period-entries, review-queue, rule-edit,
> year-end-close) — all 11 are mapped. All line numbers below are 1-based file lines in the frozen working tree
> (branch `master`, HEAD ac0a684f per session snapshot).

Corpus read in full: `belcort/AGENTS.md` (95), `belcort/SOUL.md` (38), 11 SKILL.md files, 6 `belcort/_shared/*` files,
3 skill `references/*` files, `PRD.md` (142), `docs/architecture/backend.md` (135), `docs/design/HANDBOOK.md` (78) +
ch.01–06, `docs/PROJECTLOG.md` (132), `docs/reference/confidence-ladder.md` (160), `deploy/RUNTIME.md` (143),
`deploy/CUTOVER.md` (80), `CLAUDE.md` (76), `docs/agents/{domain,issue-tracker,triage-labels}.md`,
`docs/track-c-myinvois-inbound-contract.md` (118), `docs/coa-reconciliation-findings.md` (first 80 lines).

---

## PART 1 — PER-DOC MAP (purpose · load-bearing rules · claims about the system)

### 1.1 `CLAUDE.md` (repo root, 76 lines) — the agent operating guide
- **Purpose:** the in-repo harness index: architecture summary, source-of-truth table, invariants, working protocol, boundaries.
- **Load-bearing lines:**
  - L7: "BELCORT is **one plane**, live in production" — the single-plane thesis.
  - L10: "curated DB-function tools only, a DB-backed session store, SSE streaming, and **durable wakes** on a firm-scoped credential. Live on **Fly** (`belcort-agent`)".
  - L13: "All three planes (Supabase / Fly / Vercel) are in sync."
  - L37: "The DB owns every number; the agent only orchestrates… never hand-write a row when a fn exists. The agent never *computes* a figure."
  - L38: "Precedence on collision: accounting-correctness > backend contracts > design look/motion."
  - L48: "**`master` is PR-only.** `master` is push-protected". *(NB: the post-freeze Desktop-level guide verified 2026-07-16 that branch protection is plan-gated and NOT platform-enforced — the frozen claim "push-protected" is aspirational.)*
  - L54: self-deploy authority (Fly/Vercel/Supabase MCP) granted 2026-07-07; "rig-validate a `db/v2` change BEFORE applying it live".
  - L56: Never-list: no computed financials, no hand-written book rows, no direct master push, no legacy-stack deploys, never re-add RM500k–1M MyInvois band (ADR-013).
  - L64: "Entries must balance (deferred Σdr=Σcr trigger); the UI gate allows a ≤5¢ residual the DB auto-posts to `980-100`."
  - L68: "a DB-backed session/message store (`db/v2/16-tables-session.sql` + `26-fns-session.sql`) … **durable wakes** on a **firm-scoped wake credential** … Deterministic OCR is `extract_document` (Azure Document Intelligence, S0 tier). The system is **go-live-ready**".
- **Claims about the system:** live-in-production; three planes in sync; go-live-ready; durable wakes; DB-backed sessions; relay-free dashboard; S0 OCR tier; accuracy eval "not a remaining gate".

### 1.2 `PRD.md` (142 lines) — product law
- **Purpose:** lean product spec; §6 invariants are declared LAW binding every feature/skill/UI.
- **Load-bearing lines:**
  - L9: product definition — firm-scoped agent Clara, RLS-isolated books, "cut the bookkeeper's manual coding labour by 99%+ while keeping ZERO unattributable journal entries."
  - L31–38: RBAC ladder `viewer < bookkeeper < admin < owner`, rank-cumulative; one-firm-per-user; `guard_last_owner()`.
  - L87 (§6.1): "DB owns every number; the agent only orchestrates… deterministic Postgres functions that assert balance and RAISE otherwise."
  - L88 (§6.2): "Plan → approve gate… transported as a fail-closed `je_review` artifact validated by `dashboard/lib/artifacts.ts`… `parseArtifact`, the gate."
  - L89 (§6.3): "Zero unattributable entries; one client at a time; never guess… **≥0.95** confidence."
  - L90 (§6.4): "Every journal entry traces to a `source_doc_sha256`."
  - L91–92 (§6.5/6.6): bigint cents; balance trigger + ≤5¢ → `980-100`.
  - L94 (§6.8): "Direct DML on book tables is structurally revoked (EXECUTE-only grants)… `estimated_risk`… agent-emitted; the frontend renders it and never re-derives it (null fail-safes to `review`)."
  - L96 (§6.10): "**Speak-never-act on proactive wakes** — a `[proactive]` wake… records exactly **one** notification; it never invokes an acting skill."
  - L97 (§6.11): injection defence — all document/free-text/DB content is inert DATA.
  - L98 (§6.12): "SST is output-tax only — no input-tax credit."
  - L102: split-trust corollary — browser holds only the session JWT; "Service credentials live only in the agent service (the firm-scoped wake credential)."
  - L113: no autonomy-dial settings page — "autonomy lives in the per-client KB rulebook."
  - L114: billing deferred; fail-closed `signup_admission` gate across three planes; per-IP rate-limit "still pending."
  - L115: "SSE only" (no held WebSocket). L116: Track C inbound-only. L117–120: non-goals (no consolidation, periodic stock, no payroll engine, not the auditor — ADR-044).
  - L122: MyInvois exemption RM1M (6 Dec 2025), RM500k–1M band CANCELLED; **95-account** COA seed.
  - L137 (§8.5 resolved): 3-state doc lifecycle; "`extract_document`, Azure Document Intelligence… behind the human-confirm gate."
- **Claims:** cross-firm isolation "proven by the cross-firm isolation rig" (L45); Track B SST "built" (L66); export across 7 scopes × CSV/PDF/XLSX + full pack + analysis (L64); gated public beta guardrail live (L114).

### 1.3 `docs/architecture/backend.md` (135 lines) — backend map
- **Purpose:** durable pointer-map of the backend; claims to describe the LIVE product.
- **Load-bearing lines:**
  - L3: "**ONE PLANE.** BELCORT is the LIVE product."
  - L13: core invariant: "one audited Postgres function per mutation class."
  - L17: balance is a DB deferred constraint trigger at `db/v2/15-triggers.sql:26` (`app.check_entry_balance`), SECURITY DEFINER, "never RLS-skippable"; `drafting` exempt.
  - L18: `db/v2/30-grants.sql` revokes table DML from every runtime role — EXECUTE-only is the only write path (ADR-030).
  - L27: "proven by the cross-firm isolation rig."
  - L42: "Supabase `belcort-shared` (project msegmhvkmwcyxtxoszzp, Postgres 17) … **57 tables**."
  - L45: JWT firm claims minted by `belcort_access_token_hook` at every token issuance.
  - L63: `approve_entry` owns `ROUNDING_TOLERANCE_CENTS = 5`, auto-posts residual to `980-100`.
  - §2A (L69–82): binding SST law — output-only; `tax_rates` effective-dated authority (ADR-046); hybrid ladder (doc-states-SST verbatim → compute+`needs_review` → no leg); `not_registered` never auto-legs; SST-02 sales=accrual / service=payment basis.
  - L87: agent = OpenAI Agents SDK behind swap-seam; "a DB-backed session/message store, SSE streaming, and durable out-of-band wakes"; "rides a real `firm_role` JWT — never `service_role`."
  - L89: model can call "ONE tool per audited fn + a SELECT-only read surface, and **no shell / psql / file / web tools**"; `extract_document` = Azure Document Intelligence; `build_export` renders all 7 scopes in CSV/PDF/XLSX; "every figure is computed by the DB and only formatted here."
  - L91: cross-turn memory via `sessions.loadHistory` → `buildRunInput`.
  - L92: wake kinds `proactive/documents/workbench/kb`; wake credential = "runtime-minted short-TTL HS256 firm-scoped credential (role authenticated, top-level firm_id, aud=belcort-wake)"; **"Every wake is speak-never-act."** ← (contradicts §7 of AGENTS.md; see Part 4 N2.)
  - L94: self-reconcile learning loop — `bank_match_audit` + `client_recon_hints`, "never auto-confirmed, never auto-matches."
  - L104: "**In sync:** all three planes… The system is go-live-ready; a formal accuracy eval is a future quality follow-up… not a remaining gate."
  - L110: legacy v1 plane decommissioned; only book schema is `db/v2/`.
- **Claims:** go-live-ready; durable wakes; 57 tables; isolation proven; balance structurally enforced; SST single-authority.

### 1.4 `docs/PROJECTLOG.md` (132 lines) — ADR log
- **Purpose:** append-only decision record + open items; pruned 2026-07-09 to in-force decisions.
- **Load-bearing lines:**
  - L10 (START HERE): "BELCORT is **LIVE and go-live-ready** — ONE plane… all three in sync… A formal accuracy eval is a deferred future quality project… **not** a remaining gate."
  - ADR-001 (L16): DB owns every number. ADR-003 (L21): bigint cents; operator-versioned schema.
  - ADR-011 (L26): agent owns documents end-to-end; transport stays dumb.
  - ADR-012 (L31): GST dead; SST no input credit; MyInvois numeric tax codes.
  - ADR-013 (L36): RM500k–1M band cancelled — never re-add.
  - ADR-014 (L41): COA seed 117→95; fact-check TODO: "re-verify the seed against official LHDN / RMCD sources in a future audit session" (L44).
  - ADR-017 (L47): Track C contract; "the UBL parse itself is unbuilt" (L51).
  - ADR-027 (L63): year-end g3/g4 = skill-enforced VISIBILITY, not a DB hard-block (owner PM-rigor stance).
  - ADR-029 (L68): one shared project; isolation is RLS + JWT claim; "Cross-firm isolation is a TESTED INVARIANT… that gates go-live."
  - ADR-030 (L73): curated fn tools + EXECUTE-only role; storage CREED; reads stay freeform.
  - ADR-031 (L78): SDK-agnostic runtime behind swap-seam; "the session store is DB-backed"; "the 4 wakes are durable + symmetric"; resolved: OpenAI Agents SDK chosen.
  - ADR-032 (L84): **ONE chat session per (firm,user)** shared across pages "(was per-client threads)"; active-scope write-gate hard-gates every write artifact.
  - ADR-033 (L89): KB rulebook stays sole posting authority; advisory `client_memory_notes`; "override-watch + decay… auto-retire at 3."
  - ADR-034 (L94): auto_draft lane keeps a periodic human review sweep.
  - ADR-041 (L99): Clara persona; wakes strict propose/warn-only for [kb]/[workbench]; lane precedence `needs_decision > needs_review > auto_draft`; ladder consolidated not invented.
  - ADR-044 (L106): full MY accounting-practice platform scope (tax comp, AR/AP subledger, FA register, adjustments).
  - ADR-046 (L114): date-aware `compute_sst_leg` + `tax_rates` single authority; pre-SST date RAISES `no_sst_rate_for_date`.
  - PART 2 open items (L126–132): billing (owner-only); per-IP signup rate-limit; **`je_review` card authorship emit-seam** ("the Clara-emit path never populates it, so the badge won't render live") ← contradicts ch.04's "as built, gap closed" (Part 4 N9); Track-C parse unbuilt; per-account Overview figures; accuracy eval deferred.
- **Claims:** LIVE + go-live-ready; every ADR above is a testable design-intent claim.

### 1.5 `docs/reference/confidence-ladder.md` (160 lines) — post-vs-escalate canon (ADR-041)
- **Purpose:** the single source for unsupervised-post vs escalate; consolidates rungs living in coa-coding, db/v2, PRD.
- **Load-bearing lines:**
  - L12: "Gate 0 fails closed to a clarify card; Gate 1 fails closed to `needs_review`."
  - L21–30: the ladder reads ONLY deterministic persisted inputs (`client_match_conf` numeric(4,3), rule status/confidence, collisions, `must_ask_flags`, tax leg, balance residual, closed period, doc confidences, amount bands).
  - L36–39: Gate 0 — `<0.95` → stop, hold `unassigned_pending`, top-3 picker, "draft **nothing**."
  - L56–66: auto lane six-AND conditions (confirmed rule · ≥0.95 · balanced · empty flags · no tax leg · open period); "Anything not provably all-six → NOT auto. `null` estimated_risk fail-safes to review."
  - L93–104: KB rung — `candidate → confirmed → retired`; confirmed pinned `greatest(confidence,0.95)`; `draft_entry` RAISES unless citing a confirmed rule of this client; evidence≥3 auto-files user-gated proposal; **decay:** `app.decay_rule_on_override` auto-retires at override_count 3; `reverse_entry` = non-penalizing flag.
  - L122–127: ≤5¢ residual → `980-100` (`ROUNDING_TOLERANCE_CENTS=5`); any SST output leg → never auto.
  - L129–137: owner-tunable constants table (0.95 / ≥3 / ≥3 / ≤5¢ / RM10k / RM50k).
  - L141–144: DB-enforced verdict — `finalize_coding` RAISES `auto_draft_requires_risk_auto` / `risk_auto_requires_auto_draft`; "the ladder's verdict cannot be faked at write time."
  - L149–152: oversight — `auto_draft_review_batch` + `acknowledge_auto_draft_sweep` watermark (ADR-034).
- **Claims:** ladder is deterministic + DB-enforced; decay fn exists; sweep fns exist. All directly testable against `db/v2/*.sql`.

### 1.6 `deploy/RUNTIME.md` (143 lines) — env/secret manifest + live runtime facts
- **Purpose:** the deploy SoT for the Fly agent + Vercel dashboard + Supabase auth config.
- **Load-bearing lines:**
  - L30: `SUPABASE_ANON_KEY` is the request-path key; "**Never the service-role key here.**"
  - L31: `WEBHOOK_SECRET` — per-firm derived bearer `HMAC-SHA256(WEBHOOK_SECRET, "belcort-hooks:<firm_id>")`; "One leaked firm row burns one firm's lane, not the fleet."
  - L33: `SUPABASE_JWT_SECRET` dual-duty (HS256 caller verify + wake-credential mint); "**Omitting it disables ALL condition-wake dispatch**."
  - L35: `SUPABASE_SERVICE_ROLE_KEY` — one capability: direct `storage.upload` on `firm-docs` for `upload_document`; "that single closure + the key guard ARE the containment."
  - L36–37: Azure Document Intelligence endpoint/key optional; absent ⇒ "`extract_document` reports it honestly"; v4.0 REST `prebuilt-layout` api 2024-11-30.
  - L43: "the Azure Document Intelligence resource is on the **S0 (Standard)** tier."
  - L34: `AGENT_MODEL` default "the runtime's provisional `gpt-5.5`".
  - L49: signing-key prerequisite — HS256-XOR-JWKS; ES256-default new projects 401 every login unless the legacy HS256 secret is rotated to Current; "The JWKS-only alternative… disables wakes."
  - L60–63: `fly deploy --ha=false` — "this runtime is ONE always-on machine (**in-memory run state**)" ← as-built durability evidence.
  - L70: "/health green proves the process is up, NOT that the Supabase bind is right."
  - L76: condition wakes dispatch a REAL agent run, classified: `document_triaged`→[documents] **MAY-act** · `workbench_committed`/`bank_line_matched`→[workbench] learn-only · `kb_proposal_open`→[kb] surface-only · else [proactive] speak-never-act; governed "15 s per-(firm,condition,client) batch window · ≤6 new wake windows per firm-minute · ≤30 records a batch."
  - L80: "a wake bearer authorizes agent RUNS, not just SSE nudges."
  - L94–96: pg_net facts — "~1–2 s timeout, **no automatic retries**, at-most-once (unlogged queue — lost on a DB crash)… treats every wake as a **hint** … a missed wake is an eventual-consistency delay, never data loss." ← direct internal evidence against "durable wakes" (Part 4 N1).
  - L105–110: dashboard env — `NEXT_PUBLIC_AGENT_URL` REQUIRED (chat/onboarding throw without it); `NEXT_PUBLIC_*` inlined at build time.
  - L118–139: GoTrue auth config is Dashboard-only (not MCP); email templates must carry `token_hash`; 3-gate signup alignment; access-token hook = "the single most-missable step" (CUTOVER A5).
- **Claims:** wake governance numbers; one-machine in-memory run state; per-firm HMAC lanes; S0 tier; auth-hook dependency.

### 1.7 `deploy/CUTOVER.md` (80 lines) — ordered go-live runbook
- **Purpose:** phase-ordered stand-up: A shared DB → B agent → B′ dashboard → C firm bootstrap → C′ wakes → D smoke.
- **Load-bearing lines:**
  - L33–38: `apply.sh --gate` must end "ISOLATION SUITE PASS"; the gate is **ONE-SHOT** (re-runs collide on fixed-email fixtures; scoped delete fails on `guard_last_owner` + composite FK).
  - L40–42: Storage setup is two-part on real Supabase — `storage.objects` policies must run in the Dashboard SQL Editor (pooler role isn't owner).
  - L44: A5 access-token hook before any login — "the single most-missable step."
  - L72: wake wiring = one `belcort_webhook_config` row per firm; "Unprovisioned firms silently no-op."
  - L76: Phase-D smoke = login → ingest → code → gated approve → export → "[proactive] wake fires"; two-firm live isolation check.
- **Claims:** the runbook exists and the fixture-collision + storage-owner gotchas are real (testable against `db/v2/apply.sh`/tests).

### 1.8 `docs/design/HANDBOOK.md` (78) + ch.01–06 — design SoT
- **Purpose:** normative (RFC-2119) frontend law: pillars, floors, tokens, motion, IA, agentic UX, per-surface specs, stack pins.
- **Load-bearing lines (HANDBOOK):**
  - L3–11: v1 RATIFIED at flagship slice 2b (2026-07-03); a11y floor carried restated-binding; glass floor superseded by stricter opaque-first.
  - L15–21 (2026-07-08 refresh): "auto-post = rule-backed per-client (RULE badge, **0.97 default tunable**; AUTO always drafts)" ← conflicts with the 0.95 canon (Part 4 N8); reduced-motion ~120ms fade permitted; Tier-1.5 `doc_review` pilot approved; "**remaining before real books: Azure OCR F0→S0**; the accuracy eval is now a deferred future-quality follow-up, not a go-live gate." ← conflicts with CLAUDE.md/RUNTIME "S0 is set" (Part 4 N7).
  - L34–45: governing law — grid is truth/chat is intent; DB owns every number/UI renders; calm instrument; "Clara surfaces, humans decide… every write rides a plan→approve gate; reads are never gated"; trust from receipts.
  - L77: precedence + drift protocol (owner: Tao, tools@belcort.com).
- **ch.01 Foundations:** WCAG 2.2 AA floors (contrast 4.5:1/3:1; four adaptive blocks; focus/keyboard/streaming-live-region rules L37–56); perf floor 60fps @10k rows on 4× throttle, transform/opacity-only, zero `backdrop-filter` on product surfaces (L60–70); OKLCH 3-tier tokens; `--agent` violet reserved to Clara with a grep-gate allowlist (L117–121); money `--money-negative` muted rose, positive = `--fg` never green (L126).
- **ch.02 Interaction:** motion registers (instrument ≤320ms; ceremony GSAP-only with numeric effect budget); reduced-motion MUST; grid keyboard model + the binding **suppression rule** ("Typing 'a' in a reason field MUST never approve", L84–88); five mandatory screen states (L107–116); feedback ladder (toast never for errors/agent findings, L119–128); fail-loud reads ("`client_not_found` → the error state, not zero rows", L117).
- **ch.03 Architecture:** three altitudes; **no firm-settings route** (autonomy-dial doctrine, L16–17); real-URL deep-link contract (L36–48); Clara's 3 seats + rail ≤⅓ viewport; context contract — active-scope write-gate survives (L75–79); "Clara never drives a write surface" (L84); desktop-only gate <1024px (L97–107).
- **ch.04 Agentic:** Clara identity/7-state FSM; permanent AI attribution — "durable `coding_source` (RULE / AUTO / MATCHED)… derived SERVER-side… never the mutable status" claimed **as built** (L20–25); chat mechanics (streamdown, stick-to-bottom, pin-to-top, drop recovery); **static gen-UI catalog** — "Clara never draws UI… `parseArtifact` remains the single fail-closed text-to-hydration gate" (L90–93); catalog table 8 live + 6 planned (L97–114); plan→approve tiers (L129–137) — reads never gated, draft-only notify-after, posting writes gated, destructive = typed-reason modal; Esc = dismiss-without-decision ≠ Reject; Inbox lanes + projection-of-state rule (L163–166); evidence bands never numerals (L186–188); escalation target 5–15% (L198).
- **ch.05 Surfaces:** per-surface specs with extensive **"As built"** annotations (slices 2b–10) — Command Center, calendar (`complianceCalendar()` client-side date derivation sanctioned L30–33), firm Documents triage, activity (reverse binds to fn-provided `reversible` flag L72–74), members on v2 `24b-fns-members.sql` (L81–90), journals workbench (write-actions migrated relay→direct RPC; `assert_can_review`+`audit_actor` re-homed L136–140), GL/TB/FS (verbatim DB figures; span-close split), period close **agent-only by owner decision** (L227–229), SST-02 (present-never-hidden; BELCORT never submits to LHDN L292–293), tax comp (no per-item persisted tick — owner-decided divergence L314–316), documents/files/COA/contacts/KB, ceremonies (Birth ritual retired → `BirthReveal` beat; `/setup` route retired with a dangling nudge link flagged L444–446), exports+jobs (job controls "relay-bound until the v2 job runner lands" L456–459 ← relay is decommissioned: dead dependency, Part 4 N10).
- **ch.06 Implementation:** stack pins (Next 15/React 19.2/Tailwind 4.3/AI SDK 6 + custom transport/TanStack/GSAP); token bridge retired at 10·D; keep/port/rebuild/retire inventory; migration strategy ("2088 existing tests are ported", L72); build order slices 1–10 all marked ✅ through slice 9 with slice-10 sweep items; validation gates incl. 250KB gz route budget "CI assertion = a recorded open item" (L152–154).
- **Claims:** ratified + shipped-live design; durable authorship as-built; all slices ✅; relay fully dead for client-workspace writes; ceremony wire on v2 agent.

### 1.9 `docs/agents/*.md`
- `domain.md` (27): read-order for engineering skills; "If a doc doesn't exist, proceed silently" (L15); use glossary vocabulary; flag ADR conflicts then append a new ADR.
- `issue-tracker.md` (34): GitHub Issues in **`mosaladtaooo/belcort-accounting-agent`** via `gh`; external PRs are NOT a triage surface (L18).
- `triage-labels.md` (15): 1:1 mapping of the five canonical triage labels.

### 1.10 `docs/track-c-myinvois-inbound-contract.md` (118) — Track C SoT
- **Purpose:** build contract for inbound UBL parse. Header L3–5: "DEPLOYED LIVE on the v1 plane 2026-06-29… that plane was DECOMMISSIONED… carries into the v2 Track-C build (**unbuilt** — this contract is its SoT)."
- Load-bearing: minimal surface (same `tax_invoice` schema); hardened parser mandate (no DTD/XXE/network, bounded expansion, never render XML as HTML, L44–46); don't-trust-totals (5-sen reconcile else `needs_review`); decimal→cents half-up; self-billed 11–14 → review; `documents.irbm_uid` partial-unique "BUILT (isolation TEST 12)" (L73–74); CN/DN reversal path moved into skills 2026-06-29 (L96–106) — "ratified at the v2 Track-C build gate"; deploy runbook DEAD (v1).

### 1.11 `docs/coa-reconciliation-findings.md` — COA provenance
- Purpose: audit record for the 117→95 seed change. Verified regime facts table (GST repeal Act 805 1 Sep 2018; service tax 8% general from 1 Mar 2024, 6% retained sectors; NO input-tax credit — "There must be NO 'input tax recoverable' asset"; GST letter codes retired for MyInvois numeric codes; MPERS mandates no COA). Tier-1 fixes: `906-000` OI→EP; installment receivable mistyped `BA`. Hardcoded codes that MUST be preserved: `980-100`, `100-900`, `150-000`, plus coding defaults `300-000/400-000/500-000/907-000/200-400/150-500/440-000/925-000` (L70–73).

### 1.12 `belcort/AGENTS.md` (95 lines) — the doctrine canon (loaded verbatim by `agent/src/doctrine/loader.ts`)
- **Purpose:** Clara's project rules — 20 numbered mandates. THE behavioral law of the runtime.
- **Load-bearing mandates (quotes):**
  - L3–5: "`belcort/` tree is the **v2 doctrine canon** AND is loaded verbatim by `agent/src/doctrine/loader.ts`."
  - §1 L25–27: firm = row; JWT `firm_id`; firm-existence probe "runs ONCE per conversation, on the FIRST turn only"; L28: EXCEPTION — wake notes skip the probe.
  - §1 L29: "**Every book write is a named, audited Postgres function exposed to me as a curated tool** (§15)… For reads I use… the freeform **`query_books`** tool — a single read-only, RLS-scoped `SELECT`." (`query_books` freeform-SELECT surface = the SDT-001/SEC-001 mutation-bypass concern in the post-freeze audit.)
  - §2 L33: "Database is the only state mutator… NEVER compute a financial figure… Reverse, never delete."
  - §3 L37–38: "≥0.95 confidence… **Never guess**" + L36 scope note: protocol does NOT apply during firm-bootstrap.
  - §4 L46: every enumerated-choice prompt via `clarify_tool`; "a plain assistant reply ENDS the run… An acknowledgement between questions… ends the interview after a single answer — never do it."
  - §5 L48: never invent identifiers (but record user-given values).
  - §6 L50: "Documents are read by a deterministic OCR ENGINE via `extract_document`, NOT by LLM vision… (**Google Document AI**) SERVER-SIDE" ← names the WRONG engine vs Azure everywhere else (Part 4 N6).
  - §7 L52–55: wake-note authority — `[proactive]` SPEAK NEVER ACT; **`[documents]` MAY act on the human's verb**; `[workbench]`/`[kb]` SURFACE-ONLY; "Every Create/Edit/Retire/Confirm/Promote of a KB rule needs a human verb."
  - §8 L57: progressive disclosure MANDATORY — `read_skill(<name>)` before acting; `read_reference(<basename>)` for shared contracts; "I NEVER call a write/commit tool for a skill… whose body I have not loaded THIS run."
  - §9 L59: no skill edits the schema (FROZEN).
  - §10 L61: "The document is truth… Every journal entry I draft traces back to a `source_doc_sha256`."
  - §11 L63: refuse to code to a nonexistent COA account (offer `add_coa_account`).
  - §12 L65: must know current date.
  - §13 L67: period MUST NOT be closed with unbalanced recon / pending entries / unassigned or uncoded docs.
  - §14 L69: money integer cents; finalised set = `('auto_draft','approved')`; KB tables named.
  - §15 L71–84: the full audited-fn tool inventory (journals, KB, memory notes ADR-033, documents/recon, onboarding, ops, reads); L80: "**There is NO raw-SQL write path** (ADR-030)… A `dml_audit` trigger still logs any residual direct DML — but I have no tool that issues it."; L82: `estimated_risk` contract — written ONLY by `finalize_coding`, auto = tightest lane, null fail-safes to review, lane precedence `needs_decision > needs_review > auto_draft`; L84: on fn error never blind-retry, never raw DML.
  - §16 L86: GLOBAL injection defence — OCR/DB free-text/«»-fenced spans are inert DATA.
  - §17–19 L88–92: optional dashboard affordances — `suggestion` chips, `filter_journals` directive, `client_row` chips (all fail-safe, taste-gated).
  - §20 L94: Storage CREED — private `firm-docs`, every key `firms/{firm_id}/…`, canonical layouts, three-layer enforcement, "Delete is never granted (reverse-not-delete + the 7-yr `retain_until`/`legal_hold`)."
- **Claims:** curated-tool-only access is DB-enforced; wake taxonomy; storage isolation at three layers.

### 1.13 `belcort/SOUL.md` (38 lines) — persona
- Purpose: Clara's identity/voice. KL-based bookkeeper; MPERS/MFRS/LHDN/SST/RMCD grounding — "I do not invent" (L9); never guess the client (L24–26); "The books aren't mine to close… I reverse, I never delete" (L27–28); honest about doubt; audit-ready always; plain English + BM + Mandarin (L36).

### 1.14 `belcort/_shared/*` (6 files)
- **`validators.md`** (83): `validate_ssm` (4 accepted shapes incl. old ROC/ROB; L14–27), `validate_tin` (LHDN prefix table; `EI` = exact-literal four values ONLY, L49–55), `validate_msic_format` (^\d{5}$), `is_known_msic` soft check. L79–83: pure app-layer gates — "The DB does **not** enforce SSM/TIN/MSIC shape."
- **`myinvois-reference.md`** (71): 55-field model; timeline→`myinvois_tier` table (RM1M exemption verified 2026-06-11, "do not add an RM500K-1M band" L44); code lists to confirm against SDK; general `EI` TINs.
- **`ocr-cache-schema.md`** (64): SINGLE SOURCE for `documents.ocr_cache` keys. L15–24 "**Produced reality** (2026-06-08, verified on firm 21)": live agent writes a FLATTER record (`{text, fields, confidence, extracted_at, extraction_method}`) than the canonical `belcort_ocr_cache.v1` nested envelope — "the nested envelope below… is the target/aspirational shape, not yet produced… consumers MUST read defensively" (coalesce adapter). L36: engine enum "pymupdf | marker-pdf" — a stale v1 engine vocabulary (Part 4 N6). Rules: full `raw_text` mandatory; integer cents; never fabricate.
- **`suggestion-chips.md`** (40): emit contract for the `suggestion` fenced block; prefill-only, fail-closed gate, 1–6 chips, never mid-clarify.
- **`filter-directive.md`** (34): `filter_journals` transport directive; ≤1/turn; fail-closed on missing numeric clientId; read-only focus.
- **`client-row.md`** (29): `client_row` chip; clientId+clientSlug both REQUIRED; snapshot semantics; fail-closed.

---

## PART 2 — PER-SKILL MAP (workflow · tools · gates · ambiguities)

### 2.1 `firm-bootstrap` (308 lines)
- **Workflow:** first-turn firm-existence probe (ONE `query_books`: `select firm_id from firm_users where status='active'`, L96–101) → Step 1 begin-confirm → Step 2 the 11-Q interview (each question a `clarify_tool` with `[[step:N/11:FIELD]]` marker; validators per `_shared/validators.md`; synonym normalisation table L160–174) → Step 2.5 `[[dryrun]]` clarify with the fenced JSON payload = the exact `create_firm` payload → Step 3 `create_firm(<jsonb>)` (derives `myinvois_tier`; raises `user_already_in_firm`, `invalid_field`) → Step 4 summary card + handoff to client-onboarding.
- **Tools:** `query_books`, `clarify_tool`, `create_firm`. No schema apply; no psql/MCP/service-role (DB-ACCESS CANON L66–81).
- **Gates/mandates:** every question AND the dry-run via `clarify_tool` — a plain reply ENDS the run ("the ONE failure that kills setup", L32–39); TURN DISCIPLINE (no re-probe/re-greet, DB touched exactly twice L48–64); validators MANDATORY, never silently coerce; TIN required unless turnover `<RM1M`; pre-commit re-check of 0 rows (L230–233).
- **Ambiguities:** L107–109 "Human prerequisite: **Hermes is installed**, the `belcort` profile exists… See `DEPLOY.md`" — Hermes is the decommissioned v1 runtime and **`DEPLOY.md` does not exist in the repo** (verified). L293 "persist partial answers to **Hermes session memory**" — stale v1 mechanism. Front-matter `metadata.hermes` tags on every skill. Step 2.5's fenced-JSON marker rules say the `/setup` stage keys on `[[dryrun]]` — but ch.05 §4 says "there is **no `/setup` route**" (retired; the interview lives in `/welcome`): stale route names inside the skill (`web /setup stage`, L25).

### 2.2 `client-onboarding` (391 lines)
- **Workflow:** Phase A 13-Q identity interview (all clarify; `[[step:N/13:FIELD]]`; validators; TIN deferred-return rule Q4/Q13, L113) → optional grouped directors/domains/aliases clarify → Phase B `[[dryrun]]` confirm → `onboard_client(<jsonb>)` (derives slug + tier; seeds COA via `seed_client_coa` — "95 accounts… the live count is returned as `coa_count` — use that, never a hardcoded number" L139–141; child tables) → Q12 management-accounts upload rides the clarify RESPONSE (`answerWithDocs`), held until after commit → `upload_document` + `ingest_document(kind='management_account')` + `set_document_storage_path` → `extract_document` OCR → `[[carrydown]]` dry-run → `seed_opening_carry_forward` (per-item AR/AP/FA + gl_lines; OBE `100-950` plugs to nil, asserts tie) → Phase D sample invoices → `record_kb_evidence` (advisory only) → Phase D-seed `seed_client_knowledge` (ONLY human-ticked mappings become confirmed rules @1.000) → Phase E summary.
- **Gates:** validation failures LOOP inside clarify — "NEVER explain a rejected value… in a plain reply" (L84–91, the observed SSM-reject hard-exit bug); equity carry-down rule — carry the CLOSING NET, never movements; negative closing capital = DEBIT `150-000` (L260–294, BEE worked example); `seed_opening_carry_forward` subsumes `record_opening_balances`; first close RAISES `opening_balances_required` unless opening journal exists or `p_first_year_zero_opening=>true` (L299–302).
- **Tools:** `clarify_tool`, `onboard_client`, `seed_client_coa` (indirect), `upload_document`, `ingest_document`, `set_document_storage_path`, `extract_document`, `record_kb_evidence`, `seed_client_knowledge`, `seed_opening_carry_forward`, `query_books`.
- **Ambiguities:** description says "across 4 phases" then lists three (L3); phases run A, B, (Q12 section), D, D-seed, E — **there is no Phase C** and the Q12 carry-down section floats between B and D; sample-invoice ask appears BOTH at end of Phase A (`[[step:14/14:sample_invoices]]` L156–169 — a 14th step in a 13-Q interview) AND as Phase D "After the MA, ask via clarify" (L330) — duplicate/conflicting placement; DB-ACCESS CANON L60 names "the Q12 `record_opening_balances`" while L296–299 forbids `record_opening_balances` for carry-down (superseded-in-place text).

### 2.3 `doc-ingest` (286 lines)
- **Workflow (ordered, L56–61):** `upload_document` (bytes → canonical firm-scoped key + sha256) → dedup on sha256 → `extract_document` OCR (inert data) → structure into `belcort_ocr_cache.v1` + `extracted_fields` → `ingest_document` (`ingested` if client assigned, else `unassigned_pending`) → Step 2 client identification (≥0.95 or picker; issuer-matches-client = sales invoice default-codes, sample only on explicit intent, L91–99) → Step 6 MANDATORY hand-off to coa-coding for assigned docs ("stopping at 'ingested'… is the silent bug", L246–250) — but ONLY for in-session ingest; dashboard-inbox docs follow the review-queue `[documents]` handler (SP-6.4, L252–256).
- **UBL branch (Step 3, L116–183):** "**⚠ NOT WIRED IN THIS RUNTIME**… Clara cannot structurally parse a UBL XML e-invoice today. On a detected UBL file, DO NOT attempt to parse it" — store + index with `ocr.engine='ubl-xml-unparsed'`, route `needs_review`; everything below is the Track-C target mapping "reference only; do not execute it now."
- **Gates:** hash over BYTES never filename; never draft journals for `unassigned_pending`; never guess client; `assign_document`/`reassign_document`/`mark_document_sample` audited fns; storage keys Track-0c canonical.
- **Ambiguities:** "When this fires" still says "forwards a PDF… to **Telegram**/web" (L50) — Telegram inflow is a PRD §8.6 DEFERRED non-feature; the target-mapping block embeds actionable-looking instructions under a do-not-execute banner (prompt-hazard for a weaker model); Step ordering jumps 1→2→2A→3→4→5→6 with the "ordered flow" list duplicating Steps 1–4.

### 2.4 `coa-coding` (356 lines)
- **Workflow:** Step 1 load ClientContext → Step 2 load extract → Step 3 match `client_kb_rules` (+ per-rule `custom_instruction` = hint, "NEVER overrides a control", L67–78) → Step 4 must-ask flags (8 predicates; decision-class vs materiality-class, L112–120) → Step 5 `draft_entry` + code lines + the SST HYBRID ladder (doc-states verbatim / compute via `compute_sst_leg` + `needs_review` / no leg; mixed-treatment split; `not_registered` mismatch; CN/DN polarity both received and client-issued, L174–262; 5-sen cash rounding → `980-100`) → `finalize_coding(entry, client, status, review_reason, estimated_risk)` (the ONLY `estimated_risk` writer; precedence high-stakes/auto/review, L149–172) → Step 6 `record_kb_evidence` for auto_draft entries only (P&L-leg pair) → Step 7 cards (`clarify_tool` shapes; on dashboard emit the `je_review` fenced block with exact JSON contract + fail-closed field rules, L314–345).
- **Gates:** `review_reason` fixed formats per class (L131–137); never write the why into `description` (kb-evolve reads it as the pattern); Dr = SUM of credits, never independently computed (L187–189, 211–213); composite FK enforces §11; auto lane = the six-AND conjunction.
- **Ambiguities:** L40 "(**Python stays fine for OCR / `code_execution`**.)" — flatly contradicts the NO-code_execution canon stated in this same skill's sibling files and doc-ingest/export/firm-bootstrap (stale v1 line inside the DB-access canon paragraph); header references PR #37/#35 and "ROLLOUT Slice 14" — build-narrative constants a fresh model can't resolve; Step numbering says cards rendered via clarify EXCEPT the dashboard je_review path ("NOT a §4 clarify prompt — the agent never waits on it", L28–31) — a subtle two-surface split easy to get wrong.

### 2.5 `review-queue` (531 lines) — the largest skill; three roles in one
- **Interactive queue:** Step 0 unassigned-inbox card FIRST → Step 1 pull ALL clients' `needs_review`/`needs_decision` from ANY period grouped by client FY → Step 3 render batch/singleton/decision cards → Step 4 input (tap / `a e r x` / numbered) → Step 5 verbs: Approve=`approve_entry`; Reject=`reject_entry` (reason picker; records NO KB evidence); Edit=`edit_entry` full-replacement envelope ("a partial line array silently drops the missing lines", L152–156) then `approve_entry`; Decision = recode flagged lines + approve; Reassign = `reassign_entry` + `reassign_document` + re-run coa-coding. "MANDATORY — fire `kb-evolve` after a successful approve/edit… no-learning regression" (L161–163).
- **`[documents]` wake handler (L226–353):** wake note = machine-built key=value lines; verify provenance by reading the `document_audit` row back; per-verb: `assign` = relocate storage bytes when a byte source exists, else **THE WAKE CARVE-OUT** — a wake run has NO turn attachments and no byte-download tool, so the move DEFERS honestly + one `record_proactive_notification`; "Reconcile, do NOT code… never auto-code on assign" (L290–293); `reassign` = 4-step ordered byte move (record key only AFTER bytes land, L302–316); `code` = the ONLY auto-coding verb (reconcile location → verify object exists → run coa-coding → `status='coded'`); `sample` = KB evidence only, "Never draft a transaction entry for a sample" (L340–349).
- **`[proactive]` wake handler (L355–531):** read rows back (never trust the note); classify condition (stuck / new_data / coalesce counts / stale = finish silently; `new_document` with client=null → silent, the inbox is the surface); Step P3 four read-only "looks wrong" heuristics (duplicate via the SP-6.4 coalesce adapter; ≥5× median outlier with <5-samples skip; confirmed-rule contradiction; wrong-period) ; Step P4 dedup-check then ONE `record_proactive_notification` (envelope with `action` object, `source_ref` object `{table, record_id}`, declared `evidence` band + `intent` class, dedup_key conventions, cap/digest behavior L512–523); "**Speak, never act**… Your ONLY write is `record_proactive_notification`" (L525–531).
- **Gates:** second-order injection doctrine spelled twice (L249–257, 376–388); zero-row read-back → do nothing mutating.
- **Ambiguities:** there is **no Step 2** (numbering 0,1,3,4,5); the header block still teaches Telegram `inline_keyboard` + `messaging.send_message` mechanics (L18–47) that the v2 runtime does not have (AGENTS.md §4 says the tool doesn't exist — plain prose is its equivalent); "Plan refs: R.6, R.6.2…" (L16) point at a plan document not in the repo; the description block (L3) is itself a mini-spec (duplicated law risks drift against the body).

### 2.6 `kb-evolve` (397 lines)
- **Workflow — three doors:** (1) in-session after review-queue approve/edit → derive `pattern` = counterparty name from `journal_entries.description` (PR #13 rule, L52–63), `record_kb_evidence(client, pattern, account, 1)`; reject records NOTHING; (2) `[workbench]` wakes — `workbench_committed` (learn from committed approve/edit; W1 read-back → W2 evidence (P&L leg only; known tolerated double-count documented L180–183) → W3 surface-only conflict notice → W4 no extra output) and `bank_line_matched` (self-reconcile learn: BM2 counterparty→account evidence + BM2b `record_recon_hint` narration→counterparty heuristic — "two different stores, one match event, no double-learn" L284–290; skip pure settlements/multi-P&L splits L267–269); (3) `[kb]` notes — the ONE durable `[kb]` wake is `kb_proposal_open` (surface a notification; governance verbs promote/reject/create/edit/retire "have NO durable wake source in v2 — they reach you in-session only" L346–348).
- **Chat-mediated self-reconcile (L306–325):** when the human decides the pairing in chat, the agent executes `match_bank_line` (stamped actor='agent', wake stays silent) and must record the learn inline itself; "Never self-teach a pairing I chose."
- **Gates:** promotions user-gated (never auto-promote; `promote_proposal` atomic fn with `client_kb_audit`); never UPSERT `client_kb_rules`; provenance verification before learning; injection doctrine.
- **Ambiguities:** Step numbering is 1 → 3a (no Step 2 — the promotion-mandate block sits where Step 2 would be); kb promotion card promises "raises future-match confidence to 0.95" while confidence-ladder says `greatest(confidence, 0.95)` (no downgrade of 1.000) — consistent but loosely worded; the description (L3) again encodes law that must match the body.

### 2.7 `bank-recon` (134 lines)
- **Workflow:** Step 1 locate statement + `client_bank_accounts` mapping (ask if no `coa_account_code`) → Step 2 `open_reconciliation` (both NOT-NULL FKs mandatory, L70–76) → Step 3 auto-match: `suggest_recon_counterparty` FIRST (advisory-only ranking), then amount+date(±days)+counterparty match, tie via `match_bank_line`; ambiguous → clarify → Step 4 bank-only lines → coa-coding `draft_entry`/`finalize_coding`, then `match_bank_line(p_is_coded=>true)` → Step 5 outstanding items (read-only; "Do not compute the difference here") → Step 6 `close_reconciliation` — "The DB owns the entire tie-out — the agent NEVER computes a figure" (L112–113); formula + worked example L118–129.
- **Gates:** client ID ≥0.95 via account_no; `[proactive]` wake = speak-never-act, never run this procedure from a wake (L50–59); chat-match teaching note (L96–99).
- **Ambiguities:** the Step 4 text is interrupted mid-sentence by the teaching note (L95–100) — "Hand it to coa-coding… then tie the line with **Teaching from a chat match:**…" reads as a paste error; the `match_bank_line` call signature appears as both 4-arg positional (Step 3) and the 6-arg actor-stamped form named in backend.md — the skill never shows the actor arg.

### 2.8 `rule-edit` (127 lines)
- **Workflow:** user-proactive rule mutations from NL commands (`always code X to Y`, `lock`, `retire`, `show rules`); resolve `<rule_id>` via `query_books` (0 rows → `create_kb_rule`; 1 → use it; 2+ → clarify picker); new pin `create_kb_rule` (confirmed + audit; `rule_exists`/`unknown_account`); lock/revive `confirm_kb_rule` (greatest(.,0.95)); retire `retire_kb_rule`; list = pure read.
- **Gates:** every write via SP-6.2 audited fns w/ `client_kb_audit`; missing account → `add_coa_account` first (§11); confirmations are plain text, no Undo button (PR #35 correction, L45–49); existing entries NOT auto-recoded (L119–121); append-only audit; no `kb_proposals` emission.
- **Ambiguities:** step numbering starts at "Step 3" (no Steps 1–2 — the client-picker step is referenced but never specified); "When this fires" says "Bookkeeper **Telegram** phrases" (L53).

### 2.9 `period-entries` (93 lines)
- **Workflow:** resolve client + period from `fye_month` helpers → read finalised entries ONLY (`status IN ('auto_draft','approved')`) + a same-set SUM control total via `query_books` (explicitly NOT `client_trial_balance` — different artifact/status scope, L60–63) → render plain view → export hands off to `skill:export` ("the ONE governed path… never hand-write a CSV or a documents row here — that bypasses the export audit", L79–88).
- **Gates:** one-client-at-a-time; always state the finalised split ("97 approved, 45 auto_draft — auto-coded at ≥0.95, never human-reviewed", L75).
- **Ambiguities:** none material; Step 3 says "Plain `send_message`" (the nonexistent v2 tool naming again).

### 2.10 `export` (218 lines)
- **Workflow:** Step 1 client inference ≥0.95 else picker → Step 2 scope/period/format resolution (7 scopes + `full`; formats csv/pdf/xlsx; dashboard Reports-picker templated grammar resolved deterministically, L51–59) → Step 3 MANDATORY client-confirm clarify for whole-ledger exports → Step 4 ONE `build_export` call (server-side read→format→record→upload; DB RAISEs relayed verbatim; internal 23505 version-retry) → Step 5 `build_analysis_report` for bespoke asks (1–16 sections, one read-only SELECT each via `agent_select` "single-statement, EXECUTE-only, 5s"; stamped "Analytical view — not an audited financial statement" + provenance page, L133–162) → Step 7 prose first then the `export_result` fenced block (artifactId-only handle; `balanced` is "your agent-reported claim… not DB-verified", L186–188); honest-empty rule (L191–194); synchronous, NO job lane (D7).
- **Gates:** DB-ACCESS canon; never type a Storage path; errors verbatim + STOP.
- **Ambiguities:** Steps jump 5 → 7 (no Step 6, yet L207 references "the documented `23505` version-retry **in Step 6**" — the referenced step doesn't exist); the bundled reference `journals-csv-execution-pattern.md` L30–31 says "**Not yet wired:** the `full` bundle and the ad-hoc VISUAL analysis report" while this skill (and RUNTIME.md L45) say both ARE wired — stale reference kept as a "pointer" that now contradicts its skill (Part 4 N11).

### 2.11 `year-end-close` (185 lines)
- **Workflow:** Step 0 pre-close gate — pending entries, unassigned/uncoded docs, unbalanced recons, TX-vs-`410-081` provision check (two sanctioned paths; `tax_provision_not_applicable` for tax-transparent entities), `adjustments_status` (non-blocking, ADR-027), partnership per-partner close (`client_partners`, `unmapped_drawings_account`), RE-account existence; **the enforcement split** (owner-ratified 2026-06-30): DB hard-blocks g1/g2-class items, g3 (docs) + g4 (recon) are SKILL-enforced surface-and-acknowledge — "Never close past g3/g4 silently… do NOT add a DB guard for these" (L72–79) → Step 1 FYE period math; refuse pre-period-end close → Step 2 `record_year_end_close` (7-arg as-built signature quoted L100–103; 20+ enumerated RAISEs L118–123; close-in-order on `prior_fy_not_closed`) → Step 3 MA pack = ONE `build_export(scope='management_accounts')` → Step 4 sign-aware close card (`export_result`, artifactId-only; net profit/loss sign rule; `unswept_auto_posts` surfaced when >0, non-blocking L167–173) → post-close: hard lock; adjust via `reverse_year_end_close` → correct → re-close; `reverse_entry` REFUSES close journals (`cannot_reverse_close_entry`).
- **Ambiguities:** L151–153 note: "The `full` multi-file bundle is **still unwired** — don't fabricate one" — contradicts export/SKILL.md where `full` is a wired combined-PDF scope (Part 4 N11); front-matter description is one line and understates the skill (it is the TRUE close, not just MA generation).

---

## PART 3 — CLAIMS REGISTER (strong as-built claims; each row = a testable assertion)

| # | Claim | Where stated (file:line) | How an auditor can test |
|---|---|---|---|
| C1 | System is **LIVE, go-live-ready**; three planes in sync | CLAUDE.md:7,13,68 · backend.md:3,104 · PROJECTLOG.md:10 | Compare against live Fly/Vercel/Supabase state + the 2026-07-15 full-product audit; check for gates the docs themselves defer (billing, rate-limit, accuracy eval) |
| C2 | **Durable wakes** — "durable out-of-band wakes", "the 4 wakes are durable + symmetric" | CLAUDE.md:10,68 · backend.md:87,92 · ADR-031 (PROJECTLOG:79–82) · review-queue:3,54 · kb-evolve:21–33 | RUNTIME.md:94–96 itself concedes pg_net is at-most-once, no retries, unlogged queue; verify `agent/src/http/wakes.ts` has no durable ingress queue |
| C3 | **DB-backed session/message store** (`db/v2/16-tables-session.sql` + `26-fns-session.sql`); chat cross-turn via `sessions.loadHistory` | CLAUDE.md:68 · backend.md:87,91 · ADR-031/032 | Confirm tables/fns exist + are written by `agent/src/…`; distinguish transcript persistence from durable RUN state (RUNTIME.md:60–63 says "ONE always-on machine (in-memory run state)") |
| C4 | Agent has **curated DB-fn tools only; no shell/psql/file/web**; EXECUTE-only role; "There is NO raw-SQL write path" | AGENTS.md:29,80 · backend.md:18,89 · ADR-030 | Enumerate `agent/src/tools/registry/*`; test whether `query_books`/`agent_select` (freeform SELECT) can invoke a SECURITY DEFINER fn inside a SELECT (the known SDT-001/SEC-001 bypass class) |
| C5 | Balance is a **deferred constraint trigger** at `db/v2/15-triggers.sql:26`, SECURITY DEFINER, never RLS-skippable; `drafting` exempt | backend.md:17 · PRD:92 | Read the trigger; rig-test an unbalanced non-drafting commit |
| C6 | Cross-firm isolation **proven by the isolation rig**; "a firm-A JWT reaches zero firm-B rows through every table + fn" | backend.md:27,51 · PRD:45 · ADR-029:69 · CUTOVER:33–35 | Run `db/v2/apply.sh --gate` on the rig; check the suite covers every table/fn (incl. newer 24b members, 25b opening) |
| C7 | **57 tables** in the shared schema | backend.md:42,51,101 | Count `db/v2` CREATE TABLEs / live catalog |
| C8 | `finalize_coding` DB-binds lane↔risk (`auto_draft_requires_risk_auto` / `risk_auto_requires_auto_draft`) — "cannot be faked at write time" | confidence-ladder:141–144 | Read `db/v2/20-fns-journal.sql`; rig-test the two RAISE paths |
| C9 | `draft_entry` RAISES unless `kb_rule_id` is a confirmed rule of this client | confidence-ladder:98–99 | Read/rig-test `draft_entry` |
| C10 | Evidence ≥3 auto-files a user-gated `kb_proposals` row, idempotent via partial-unique index; never auto-promotes | kb-evolve:70–74,174–179 · AGENTS.md:55 · ladder:100–101 | Read `db/v2/21-fns-kb.sql`; rig-test repeat calls |
| C11 | Rule **decay**: `app.decay_rule_on_override` bumps on human reject/edit-away, auto-retires at 3 | ladder:102–104,135 · ADR-033:92 | Verify the fn/trigger exists in `db/v2/21-fns-kb.sql` and fires only on human verbs |
| C12 | Auto-draft oversight: `auto_draft_review_batch` + `acknowledge_auto_draft_sweep` watermark | ladder:149–152 · ADR-034 · AGENTS.md:77–78 | Verify fns exist; close return carries `unswept_auto_posts` (year-end-close:110–115) |
| C13 | `approve_entry` owns `ROUNDING_TOLERANCE_CENTS=5`; sub-tolerance residual auto-posts to `980-100` | backend.md:63 · ladder:122–124 · PRD:92 | Read/rig-test `approve_entry` |
| C14 | SST single rate authority: effective-dated `tax_rates`; `compute_sst_leg(p_posting_date)` date-aware; pre-SST date RAISES `no_sst_rate_for_date` | ADR-046 (PROJECTLOG:114–118) · backend.md:71 | Read `db/v2/18-tables-reference.sql`/`23e`; rig-test dates around 2024-03-01 |
| C15 | SST-02 return: sales accrual basis, service payment basis (s.11(2) 12-month rule), one live DRAFT per client+period | backend.md:81 | Read `19e`/`23e-fns-sst.sql`; rig-test |
| C16 | `record_year_end_close` is 7-arg; hard-RAISES the enumerated set; g3/g4 deliberately NOT DB-enforced | year-end-close:100–123,72–79 · ADR-027 | Read `db/v2` close fn; confirm no g3/g4 guard exists (this is claimed intentional) |
| C17 | `reverse_entry` REFUSES closing/opening journals (`cannot_reverse_close_entry`) | year-end-close:180–183 | Read/rig-test |
| C18 | `seed_opening_carry_forward` posts per-item opening journals, plugs OBE `100-950` to nil, asserts tie, seeds FA depreciation baseline; supersedes `record_opening_balances` | client-onboarding:232–258,296–302 | Read `db/v2/25b-fns-opening.sql`; run `bee_carry_down_close_test.sql` |
| C19 | OCR = deterministic `extract_document` via **Azure Document Intelligence** (S0 tier, v4.0 prebuilt-layout); never LLM vision; absent config reported honestly | CLAUDE.md:68 · backend.md:89 · RUNTIME.md:36–37,43 · PRD:137 | Read `agent/src/ocr/azureDocai.ts`; contrast AGENTS.md:50 ("Google Document AI") + ocr-cache-schema:36 ("pymupdf/marker-pdf") — see N6 |
| C20 | `upload_document` byte channel: service-role key confined to a `storeBytes` closure, storage-only, firm-prefix-guarded, never model-visible | RUNTIME.md:35 · AGENTS.md §20 | Read `agent/src/main.ts` composition root + the tool layer guard |
| C21 | Storage isolation enforced at THREE layers (writer fn, table CHECK, Storage RLS path policy); write-once (no update/delete policies); 7-yr `retain_until`/`legal_hold` | AGENTS.md:94 · CUTOVER:40–42 | Read `db/v2/storage-setup.sql` |
| C22 | Wake credential: runtime-minted short-TTL HS256, role `authenticated`, top-level `firm_id`, `aud=belcort-wake` "so it can never pose as a caller" | backend.md:92 · RUNTIME.md:33,76 | Read `agent/src/runtime/wakeCredential.ts`; check the caller verifier actually rejects `aud=belcort-wake` |
| C23 | Wake governance: 15s per-(firm,condition,client) batch window; ≤6 new windows/firm-minute; ≤30 records/batch; per-firm HMAC-derived bearer; invalid payloads 202-ignored | RUNTIME.md:76,31,96 | Read `agent/src/http/wakes.ts` |
| C24 | `[documents]` wake MAY act on the human verb; `[workbench]`/`[kb]` surface-only; `[proactive]` speak-never-act with exactly ONE notification | AGENTS.md:52–55 · review-queue:226–353 · RUNTIME.md:76 | Read `CONDITION_WAKE_KIND` + the handlers; note backend.md:92 contradicts (N2) |
| C25 | Self-reconcile loop: `trg_pn_bank_match` fires `bank_line_matched` only for human actors + `action='matched'`; `client_recon_hints` never auto-confirmed; `suggest_recon_counterparty` advisory-only | backend.md:94 · RUNTIME.md:78 · kb-evolve:206–304 | Read `db/v2/25-fns-ops.sql` trigger + `22-fns-documents` recon-hint fns |
| C26 | `firm_activity_feed` carries six source arms (6th = `bank_match_audit`) | backend.md:61 · RUNTIME.md:78 | Read the feed fn/view |
| C27 | `build_export`: all 7 scopes × CSV/PDF/XLSX + `full` combined PDF + `build_analysis_report`; every figure DB-computed, formatter-only in agent | export skill:75–162 · backend.md:89 · RUNTIME.md:45 · PRD:64 | Read `agent/src/tools/exportTool.ts`/`exportFormat.ts`; note the two in-repo "full is unwired" contradictions (N11) |
| C28 | `agent_select` (analysis lane): single-statement, EXECUTE-only, 5s-capped, RLS-scoped read | export skill:147–148 | Read the fn; probe the SELECT-wrapped-DEFINER bypass here too |
| C29 | Dashboard is fully **relay-free**; reads RLS-direct + audited write RPCs on the session JWT | CLAUDE.md:11 · backend.md:102 · ch06:139–141 | Grep dashboard for relay endpoints; ch05 §5 jobs lane still says controls are "relay-bound until the v2 job runner lands" (N10) |
| C30 | RBAC floors re-homed into DB fns: `assert_can_review` (bookkeeper+) on journal/doc fns; `assert_can_manage_kb` (admin+) on 6 rulebook fns; `audit_actor` everywhere | ch05:136–140,395–401 · ch06:96–109 | Read `db/v2/2x-fns-*.sql` guard calls |
| C31 | Members plane on v2: `24b-fns-members.sql` (8 fns), `guard_last_owner` re-homed, `firms.slug` generated, isolation TEST 21 | ch05:81–90 | Read the file + tests |
| C32 | Signup admission fail-CLOSED: `signup_admission` singleton + `assert_signup_admitted()` inside `create_firm` AFTER one-firm-per-user; invitees never gated; three aligned gates | backend.md:57,103 · RUNTIME.md:131–139 · PRD:114 | Read `28b-fns-signup-admission.sql`; rig-test |
| C33 | Access-token hook `belcort_access_token_hook` injects `firm_id`/`firm_role` at issuance; fails OPEN (login works, books fail-loud empty) | backend.md:45 · RUNTIME.md:128 | Read `00-foundation.sql` |
| C34 | `documents.irbm_uid` + `(firm_id, irbm_uid)` partial-unique de-dup index BUILT (isolation TEST 12); UBL parse UNBUILT | track-c:73–74 · backend.md:135 · PROJECTLOG:51,129 · doc-ingest:117–126 | Read `10-tables-core.sql` + test 12; confirm no parse code exists |
| C35 | Durable authorship: `coding_source` (RULE/AUTO/MATCHED) derived server-side by read fns from durable fields; badge survives approval | ch04:20–25 | Read `28-fns-reads.sql`; reconcile with PROJECTLOG open item "the Clara-emit path never populates it" (N9) |
| C36 | COA seed = 95 accounts, SST-payable split 460/461 output-only, EIS 435/909-000A, 906 retyped EP | PRD:122 · ADR-014 · client-onboarding:139–141 | Count in `24-fns-onboard.sql`; NB presentation-mapping.md:59–63 still instructs flagging 906 as seeded-`OI` (stale — N12) |
| C37 | `edit_entry` is a full-replacement envelope; COALESCEs description/posting_date on lines-only amend | review-queue:151–156 · backend.md:55 | Read `20-fns-journal.sql` |
| C38 | `reject_entry` unmatches any bank reconciliation the entry sat in | review-queue:193–196 | Read the fn |
| C39 | `record_proactive_notification`: agent-only writer; open-(client,dedup_key) dedup; per-firm daily cap folds to digest; validates `evidence`/`intent` enums; raises `invalid_input` on null client | review-queue:475–523 | Read `25-fns-ops.sql` |
| C40 | One chat session per (firm,user), archive-on-refresh, active-scope write-gate hard-gates writes | ADR-032:84–88 · ch03:75–79 · ch04:77–84 | Read session fns + dashboard scope-gate; reconcile with PRD:57 "firm-altitude + per-client threads" and ch03 "one thread per scope" (N13) |
| C41 | `master` is push-protected | CLAUDE.md:48 | GitHub API: verified false on 2026-07-16 (plan-gated) — working agreement only |
| C42 | 2088 existing tests ported; tsc+vitest+build green every merge; route JS ≤250KB gz (CI assertion still an open item) | ch06:71–72,150–154 | Run the suites; check CI config |
| C43 | Compliance calendar dates derived client-side by a pure tested model (sanctioned: dates-not-money) | ch05:30–47 | Read `dashboard/lib/complianceCalendar.ts` + tests |
| C44 | Ceremonies on the v2 agent wire; Birth ritual retired; `/setup` retired (with a flagged dangling nudge link in `firms/[slug]/page.tsx`) | ch05:435–446 | Grep the dashboard; note firm-bootstrap SKILL still speaks of the `/setup` stage (N5) |
| C45 | OCR-cache producer drift: live agent writes flat `{text, fields, …}`; canonical nested envelope "not yet produced"; consumers coalesce | ocr-cache-schema:15–24 · doc-ingest:199–206 · extracted-fields-schemas:6–11 | Inspect live `documents.ocr_cache` rows / agent writer code |
| C46 | Wake note fields (`records`, `records_omitted`, `count`) and per-lane note grammar | review-queue:233–246,362–374 · kb-evolve:122–135,219–231 | Diff against the actual emitter in `db/v2` triggers + `agent/src/http/wakes.ts` |
| C47 | Model default `gpt-5.5` (`AGENT_MODEL` override) | RUNTIME.md:32,34 | Read `agent/src` runtime config |
| C48 | `firm-docs` bucket private; signed URLs minted on click server-side; artifactId is the only handle in cards | export:181–188 · AGENTS.md §20 | Read the file route + storage-setup.sql |

---

## PART 4 — NOTES: CONTRADICTIONS & DRIFT (with citations)

- **N1 — "Durable wakes" vs at-most-once delivery.** CLAUDE.md:10/68, backend.md:87, ADR-031 ("the 4 wakes are durable + symmetric"), review-queue:3/54/228 and kb-evolve:21–31 all say wakes are *durable*; deploy/RUNTIME.md:94–96 states the transport is pg_net — "~1–2 s timeout, no automatic retries, at-most-once (unlogged queue — lost on a DB crash)… every wake [is] a hint." The docs redefine "durable" as "the DB state + notifications table are the safety net," but the word as used in the doctrine (a wake that reliably arrives) is not what the deploy doc describes. Auditors should treat "durable wakes" as UNPROVEN/misleading terminology.
- **N2 — "Every wake is speak-never-act" vs the `[documents]` MAY-act lane.** backend.md:92 — "Every wake is **speak-never-act**" — directly contradicts AGENTS.md §7 L54 ("`[documents]` — MAY act on the human's verb"), review-queue's `[documents]` handler (its `code` verb runs coa-coding and posts drafts, L323–338), and RUNTIME.md:76 ("`document_triaged`→[documents] MAY-act"). PRD §6.10 is scoped only to `[proactive]` wakes so it is consistent; backend.md's blanket sentence is wrong-or-stale within its own repo.
- **N3 — In-memory run state vs the durability story.** RUNTIME.md:60–63 pins the runtime to "ONE always-on machine (**in-memory run state**)" and every `fly secrets set` restarts it (L71). Nothing in the frozen docs reconciles this with the go-live-ready claim (C1) — a restart mid-run loses active runs/clarify state by the deploy doc's own admission.
- **N4 — "go-live-ready" (frozen repo) vs the post-freeze audit posture.** PROJECTLOG:10, CLAUDE.md:68, backend.md:104 assert go-live-ready with zero remaining gates except deferred quality items. The (out-of-repo) 2026-07-15 audit and the Desktop-level rebuild guide explicitly forbid calling this plane go-live-ready and enumerate SDT-001/SEC-001 (SELECT-wrapped DEFINER mutation bypass), process-local run state, and lossy wake ingress. Inside the frozen repo, no doc acknowledges these — the repo is internally consistent but externally falsified.
- **N5 — Hermes/v1 residue inside the "v2 doctrine canon".** firm-bootstrap:107–109 ("Hermes is installed… See `DEPLOY.md`" — `DEPLOY.md` does not exist, verified), firm-bootstrap:293 ("Hermes session memory"), every SKILL front-matter `metadata.hermes`, review-queue:18–47 (Telegram `inline_keyboard` + `messaging.send_message` mechanics), rule-edit:53 ("Telegram phrases"), doc-ingest:50 (Telegram inflow), coa-coding:40 ("Python stays fine for OCR / `code_execution`") vs the repeated "NO code_execution/Python in v2" in doc-ingest:39, firm-bootstrap:79, export:96, year-end-close:27, bank-recon:41, period-entries:39–40. The doctrine is loaded verbatim into the live agent (AGENTS.md:3–5), so these stale instructions are live prompt content.
- **N6 — Three different OCR-engine identities.** AGENTS.md §6 L50: "(Google Document AI)". backend.md:89 / CLAUDE.md:68 / RUNTIME.md:36–43 / PRD:137: Azure Document Intelligence. `_shared/ocr-cache-schema.md`:36: engine enum "pymupdf | marker-pdf". doc-ingest front-matter: "deterministic Document-AI OCR". Only one can be as-built; the doctrine file the agent actually loads names the wrong vendor.
- **N7 — OCR tier drift.** HANDBOOK.md:21: "remaining before real books: **Azure OCR F0→S0**" (i.e., still F0) vs CLAUDE.md:68 + RUNTIME.md:43: "S0 (Standard) tier" is set. Time-skew inside two SoT docs that both claim currency.
- **N8 — Auto-post threshold 0.95 vs 0.97.** The entire canon (PRD:89, confidence-ladder:129–137, coa-coding, AGENTS.md §3) fixes 0.95; HANDBOOK.md:18 (2026-07-08 owner-ratified refresh) says "auto-post = rule-backed per-client (RULE badge, **0.97 default tunable**; AUTO always drafts)". If "AUTO always drafts" means the auto lane no longer POSTS unsupervised, that reverses ADR-034 and the ladder's `auto_draft` semantics — nothing else in the repo reflects either change. Unreconciled owner decision vs canonical ladder.
- **N9 — Durable-authorship "closed" vs "emit-seam never populates it".** ch04:20–25 declares the durable `coding_source` badge as-built across grid, drawer, AND the chat `je_review` card; PROJECTLOG PART 2 (L128) says "the Clara-emit path never populates it, so the badge won't render live until the emit-seam ships." At most one is fully true for the chat card.
- **N10 — Jobs lane depends on the decommissioned relay.** ch05 §5 (L456–459): job pause/resume/cancel "controls stay relay-bound until the v2 job runner lands" — but the relay is decommissioned everywhere else (backend.md §5). As written, those controls have no living backend; the staleness rule ("state unknown — runner offline") is the only honest path.
- **N11 — `full` pack + analysis report: wired or not?** export/SKILL.md:114–117 + RUNTIME.md:45 + PRD:64: wired (single combined PDF; `build_analysis_report` live). export/references/journals-csv-execution-pattern.md:30–31: "**Not yet wired:** the `full` bundle and the ad-hoc VISUAL analysis report — say so honestly." year-end-close:152–153: "The `full` multi-file bundle is still unwired — don't fabricate one." Two of the three loadable skill texts tell the agent the feature doesn't exist.
- **N12 — `906-000` acc_type: fixed in seed vs still-flagged in the mapping reference.** ADR-014/PRD:122/backend.md:65 say 906 was re-typed OI→EP in the 95-account seed; export/references/presentation-mapping.md:59–63 still instructs "`906-000 … is seeded `acc_type='OI'`… FLAG it to the user." Stale for post-fix clients (would generate false flags), though arguably correct for any legacy data.
- **N13 — Thread model: one session vs per-client threads.** ADR-032 (PROJECTLOG:84–88): "ONE chat session per (firm, user) shared across all pages (was per-client threads)." PRD:57 (§4.3): "firm-altitude + per-client threads." HANDBOOK:68/ch03 §4/ch04 §2: "One thread per scope" (firm scope + client scope routes). The design docs describe per-scope threads; ADR-032 describes their collapse. Which is as-built must be checked in the session store/dashboard.
- **N14 — `messaging.send_message` doesn't exist, yet skills instruct using it.** AGENTS.md §4 L46: "there is no `messaging.send_message` tool — plain prose IS its equivalent." review-queue:20–24,42–44, clarify-tool-card-patterns.md:9–11, period-entries:66, rule-edit's confirmation guidance all still direct the agent to "plain `send_message`". Interpretable (plain prose), but a literal tool-call attempt would fail; a doctrine-consistency hazard.
- **N15 — Step-numbering gaps in loaded procedure text.** review-queue has no Step 2; export has no Step 6 but cites "the documented 23505 version-retry in Step 6" (L207); kb-evolve jumps Step 1 → 3a; rule-edit starts at Step 3; client-onboarding has no Phase C and both a 13-Q table and a `[[step:14/14]]` marker. For a verbatim-loaded doctrine these are live ambiguities, not typos.
- **N16 — `master` "push-protected"** (CLAUDE.md:48) — verified false 2026-07-16 (private free-plan repo, `protected:false`); a working agreement presented as a platform guarantee.
- **N17 — PRD §4.2 vs firm-bootstrap Q-count phrasing.** PRD:56 calls the interviews "firm setup (11-Q) and client onboarding (13-Q)"; the client interview actually spans 13 Q + 1 grouped optional + a `[[step:14/14:sample_invoices]]` attach step + Q12's separate carry-down gate — the "13-Q" framing under-describes the committed flow (minor, but the web stage parses the markers).
- **N18 — Wake-note self-sufficiency vs read-back mandates.** AGENTS.md §1 L28 says wake notes "carry everything needed"; every wake handler then mandates ignoring the note's content and re-deriving everything from the DB (review-queue:267–271, kb-evolve:155–160). Consistent in spirit (the note carries IDs), but the doctrine sentence overstates it.
- **N19 — coa-coding tool naming vs AGENTS.md §15 inventory.** coa-coding references `auto_draft_review_batch`, `resolve_counterparty` etc. consistently, but also `add_bank_account` (ch05 §2.4 / RUNTIME.md tool-schema note) which is ABSENT from AGENTS.md §15's "audited functions" inventory — the doctrine's canonical tool list has drifted behind the built tool set (also missing: `dispose_fixed_asset`, `record_fixed_asset`, `run_depreciation`, `run_recurring_journals`, `run_amortisation`, `set_client_partners`, `adjustments_status`, `seed_opening_carry_forward`, `seed_client_knowledge`, `build_export`, `build_analysis_report`, `upload_document`, `extract_document`, `set_coa_account_active`, `set_coa_account_type`, `get_sst_return`, `compute_sst_return`, `compute_tax_draft` — some are named elsewhere in AGENTS.md prose or skills, but §15 claims to be the list).
- **N20 — Frozen-repo CLAUDE.md vs Desktop CLAUDE.md (context note only).** The Desktop-level guide (outside this repo) describes the same codebase as "audit-limited", not go-live-ready, with ADR-122 rebuild ratified. Auditors reading only the frozen repo would get the opposite picture on every C1–C3 claim. Not an in-repo contradiction, but the single most important framing fact for this audit.

*End of map.*
