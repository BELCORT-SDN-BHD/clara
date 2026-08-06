# Clara — agent guide

Clara is an **AI-native Accounting OS for Malaysian accounting firms** (greenfield
rebuild). It runs the accounting lifecycle — onboarding → ongoing close → tax →
reporting — under professional human control, with a shared **RLS-isolated
Postgres as the single source of truth**. This is a fresh harness; the frozen
prior build and its `belcort/` doctrine are **not** carried over wholesale — the
domain gold is extracted deliberately per `docs/audit/02-salvage-manifest.md`.

## Where the truth lives (read the relevant row before acting)

| Need | Source of truth |
|---|---|
| Decisions (append-only ADRs) + open items | `docs/PROJECTLOG.md` — PART 1 holds **ADR-060 onward**, PART 2 is the live open register. Archived: **001–021**, **022–043**, **044–054**, **055–059** in `docs/PROJECTLOG-ARCHIVE-ADR-<range>.md` |
| Live CODE structure (functions, callers, routes) | **codebase-memory graph — query it, don't grep** (`get_architecture` / `search_graph` / `trace_path`; re-index after big changes) |
| What / why / scope · product invariants (LAW) | `docs/prd/PRD.md` |
| Target architecture (event spine, structural invariants, runtime, reporting) | `docs/architecture/ARCHITECTURE.md` |
| Phase 3–5 plan (vertical slices, gates, verification) | `docs/plan/REBUILD-PLAN.md` |
| Design direction (two-pane Agentic OS, typed parts[], card catalog) | `docs/design/DIRECTION.md` |
| Gate-1 audit (11 failure patterns, salvage manifest, rulings) | `docs/audit/` |
| Gate-2 blueprint packet (ratified stack) | `docs/00-GATE-2-README.md` |
| Runtime spike results + BINDING workflow-versioning policy | `docs/architecture/ARCHITECTURE.md` Appendix A · `spike/RESULTS.md` |
| DR / backup / readiness / SLO | `docs/ops/DR.md` |
| Data plane (migrations, seeds, DR, rig) | `packages/db/README.md` |
| Runtime skeleton (durable substrate, health/ready) | `packages/runtime/README.md` |

## Cardinal invariants (never violate — full set in `docs/prd/PRD.md`)

- **The DB owns every number; the agent only orchestrates.** Book writes go
  through named, audited Postgres functions — never hand-write a row when a
  function exists. The agent never *computes* a figure.
- **Four structural invariants** (ARCHITECTURE §0/§3.3), enforced in the DB, not
  by model discipline: client attribution (`assert_client_resolved` ≥0.95),
  provenance binding (`source_doc_sha256` + `document_id` validated in-txn), wake
  authority (per-wake allowlist), write authorization (structural read-only agent
  role — a `select approve_entry(...)` fails at the role level).
- **Precedence on collision:** accounting-correctness > backend contracts >
  design look/motion. On a design-vs-contract conflict, clarify with the owner
  (Tao, tools@belcort.com) — don't pick a side.

## Working protocol (always run the `orchestrator-fable` skill FIRST)

- ***MOST IMPORTANT***:
  - **Orchestrate via the `orchestrator-fable` skill.** The main model is the **orchestrator** (plan, delegate, synthesize, verify, own state); **workers** are the hands — Claude native subagent lanes, or Codex for heavy implementation/debugging/refactors — **every dispatch lane carries an explicit `model` override;** Delegate bounded work orders, inspect every worker result before accepting it, and run cross-model review before merging security-critical work. **Codex lane caveat (learned):** the `codex:codex-rescue` companion queue is unreliable (it has stalled for hours at "starting"); prefer a **direct `codex exec` via Bash** (background + a file-watcher on the output) or a **native subagent** — both have been reliable. 

- **Never Blindly dispatch the main model.** Every subagent/workflow/teammate dispatch carries an explicit `model`; ***omission silently inherits Fable, which is forbidden.*** Codex lanes stay `gpt-5.6-sol`.
- **Ground before building.** On a new or compacted session, before answering an architecture question or changing code: **query the codebase-memory graph first** for structure, and read the relevant harness row above. For substantial, opt-in-scale work a grounding fan-out (Workflow) can help — but a few targeted graph queries + reads usually suffice.
- **Query the graph, don't grep.** The codebase-memory graph is the first stop for "where / what / who-calls" questions (~100× cheaper than file-by-file reading). Use Grep/Read to drill into the specific file the graph points you at. Re-index after big code changes. *(stdio MCP, project-scoped in `.mcp.json`.)*
- **Keep the harness fresh — each artifact for its purpose (before compact / refresh).** Check all the harness status and related docs is sync and refreshed with newest project state like **prd, rebuildplan, projectlog.......etc** , housekeeping anything that is stale or wrong/outdated, its for avoid the project's state, plan, decision, log 's pollution. and also refresh/update the memory record. (btw tidy up the loooong project log. make sure no context pollute in there and make sure claudemd is clean.)Always remember to refresh codebase-mcp and Do a harness-refresh pass before compacting a long session.
- **Grill until crystal-clear.** For any non-trivial plan, bug fix, or feature, use the **`grilling` skill (`/grillme`)** to interview the owner — as many rounds as it takes until the plan is unambiguous and aligned. Resolve ambiguity before writing code.
- **Three review/evidence laws (minted 2026-08-06 — they cost real money to learn):**
  1. **A PR that changes JUDGEMENT LOGIC gets an independent review pass before
     merge.** The author's own read is not sufficient. (Judgement logic = code that
     decides *whether* something happened / is allowed / succeeded — a guard, a
     disambiguation, a refusal branch.)
  2. **Absence is not evidence, and a derived state is not evidence.** Only what a
     read actually SAW may count as positive evidence. Every absence and every
     derivation falls through to the fail-closed branch. *(The live exhibit: the
     interview 409 arm reads an absent/older/empty/cancelled park as "delivered".)*
  3. **Spelling is not identity.** A guard that reads a NAME reads a projection of
     the thing, not the thing — prove an identifier IS its import before trusting
     it. *(The live exhibit: the park-ordering AST guard matches any callee spelled
     `createHook`.)*
  - **RULED (ADR-061, 2026-08-06): review intensity stays UNIFORM — the full ladder
    for every substantive change; the risk-tiering proposal is declined. Law 1 stays
    the floor, not the ceiling.**
- **`main` is PR-only** — land via PR with green CI (never push `main`). Free-tier
  branch protection is not platform-enforced, so the git-base freeze-lint + CI are
  the real gate — treat them as binding.
- **Never commit a credential.** `.env` is gitignored; only `.env.example`
  (placeholders) is tracked. Connections come from the environment (libpq PG*
  vars or `DATABASE_URL`) — never a DSN in code or argv. The leak-scan gate
  (`scripts/check-leaks.mjs`) enforces this.
- **Workflow bodies are immutable once deployed** (ARCHITECTURE Appendix A): ship
  a behavioural change as a new `_vN` export and repoint `workflows/registry.ts`;
  never rename/delete an export with in-flight runs. The freeze-lint
  (`scripts/check-frozen-workflows.mjs`) enforces this — regenerate the manifest
  only via `pnpm freeze:update` when adding a brand-new frozen workflow.
- **DB changes are rig-validated, never hand-applied to a live project blindly.**
  Validate migrations on a throwaway Postgres (CI's `postgres:17` service, or a
  scratch schema) before anything live. Slice 1's pipeline is schema-scoped to
  `clara`; `db:reset` drops only that schema.
- **Keep the shared spike state safe.** The Slice-0 spike left `workflow` /
  `graphile_worker` / `spike` schemas on the project with a **live parked run**.
  Never start the WDK world against the shared project casually, and never drop
  those schemas.

## Boundaries

- ✅ **Always** run `pnpm typecheck` / `pnpm build` (and the DB smoke test where
  relevant) before declaring done; reverse-not-delete for posted entries; keep
  one audited function per mutation class; validate `db` changes on a throwaway.
- ⚠️ **Ask the owner first:** any design-vs-contract collision; deleting/
  overwriting files you didn't create; a genuinely destructive/irreversible op
  (a DROP on shared state, a project teardown). **EXCEPTION until beta —
  ADR-060 (the pre-beta data doctrine):** there are no real clients yet; every
  firm/client/accounting row in the LIVE CLARA project is partner-authorized
  test state, and the agent holds standing authority to delete, reverse, reseed
  and re-run it in service of wave validation (record each reset). The
  authority is **DATA-scoped only** — the product's security MECHANISMS (forced
  RLS, the four structural invariants, maker/checker, audited-function-only
  writes, wake allowlists) are the product under test and are NEVER weakened or
  bypassed for testing convenience; the engineering gates (PR-only, green CI,
  the review ladders, cross-model gates) and secrets discipline are unchanged.
  It does NOT reach the frozen prior build or the spike's parked run (below).
  **The doctrine EXPIRES AT BETA** — the resumption is itself a gate item.
  *Reading it against the ✅ row above: resetting/reseeding a client's books
  wholesale is the DATA authority and is allowed; hand-deleting a posted row
  **inside** the product's own flow is not — `reverse_entry` is one of the
  mechanisms under test, and ADR-060 §2 keeps every mechanism at full force.*
- 🚫 **Never:** compute a financial number in the agent/UI (the DB owns it);
  hand-write a books row when an audited fn exists; push to `main` directly;
  commit a secret; disturb the frozen prior project/repo or the spike's parked run.
- **All dispatch lanes get explicit model overrides, FORBID to use model `fable` as lane's model.**

## Dev toolchain (skills)

The engineering skill set (mattpocock/skills + repo-authored) is vendored under
`.claude/skills/` and **tracked in git** — available in every session. Key ones:
**`orchestrator-fable`** (the session workflow), **`grilling`** (`/grillme` —
interview the owner to kill ambiguity before building), **`handoff`** (a clean
continue-prompt for a fresh session), **`code-reviewbymatt`** (the review
standards/spec bar; the built-in `/code-review` remains the native review lane),
**`tdd`**, **`research`**, **`diagnosing-bugs`**, **`codebase-design`**, **`qa`**.
Per-repo skill config (issue-tracker → `BELCORT-SDN-BHD/clara`, triage labels,
the domain-doc map) lives in `docs/agents/`.

## Where we are

Current phase/slice **status lives in memory** (`project-clara-rebuild-state`,
read-first) **+ `docs/plan/REBUILD-PLAN.md`** — refreshed each slice so this file
stays stable. (`docs/PROJECTLOG.md` is **decisions-only**, not a status home.)

**Phase 4 — WAVE C CLOSED (ADR-051..054) · WAVE D COMPLETE (ADR-055..059) · POST-WAVE
CLEARED (ADR-060..062: the data doctrine · uniform review intensity · the pre-E clearing
day — real FA + real booking on BEE, three structural gaps registered, §7-A skeleton
ratified).** Closed: **A/A2/A2.1** LIVE (ADR-022..030) · **B** on intent (ADR-044..046) ·
the extraction slice (ADR-047/048) · the settlement program (ADR-049) · the first production
autopost (ADR-050) · **C0/C-a/C-b/C-c** (ADR-051..054 — thirteen reconciliation receipts at
exactly 0, nine real RPR months chained to the sen) · **D-a** FA register (0041) · **D-b**
adjustments + advances + AF-2 + producer as a four-slice split (0042/0043/0044/0045).

**LIVE POSTURE: 44 migrations (frontier `0045`) · Fly `clara-runtime` **v55** (2026-08-06
— the FIRST release actually carrying the adjustments belt: v54 was built 08-05 04:13Z,
BEFORE the belt's code merged at 15:52Z, so the belt was dark for ~35h while the record said
"armed"; the B2 witness caught it — PART 2 records the incident + the deploy law it minted)
— **THE ADJUSTMENTS BELT IS ARMED AND WITNESSED** (daily sweep; every occurrence DRAFTS,
attested approves; the producer verb `accept_bank_rule_suggestion` granted authenticated-ONLY) **· Supavisor 32/60
(runtime pool 11, its post-restart baseline; measured 2026-08-06) · FOUR firms** (BELCORT — real,
high-stakes RM100,000 ADR-044, **THREE clients: ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE
SOLUTION** `9e957c0f` — a sole prop onboarded 2026-08-06, the FIRST going-concern real client
(a sole proprietor is NOT an employee; his account is EQUITY) · ROME PUBLIC ADVISORY `39008536`
= the Gate-S synthetic sandbox, RM10k default — its only client is "Fictional Test Services";
do not confuse it with BELCORT's real ROME pair · Alara + Borneo = slice-era RLS fixtures,
never repurpose) **· dashboard Pages `app.clarabook.com` incl. /assets + /advances + /rules
adjustments** (needs `NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev`) **·
`clara-backup` daily.** The **ROME pair's** FA and staff-advance registers are honestly EMPTY
(ADR-056/058 — both are in strike-off, so neither could carry a live register); **BEE is the
going-concern client ADR-058 said those deferrals were waiting for** — it owns tasks #71/#72
(Gate P on its SST invoices + the WD-R14 real FA carry-down). The sandbox carries the
labelled-synthetic corpora — a live
depreciation authority, ONE synthetic staff advance (tie 0), and the D-b2 acceptance register
(templates A+B retired with reasons · **B2 LIVE from 2026-07-01** · the May occurrence+mirror
pair netting ZERO · one cancelled pair drill). **Witnesses:** the belt's first
autonomous DRAFT is RECORDED (B2's July: entry `d023b48c`, drafted by v55's boot sweep
2026-08-06 16:56Z, `adjustment_runs` untouched, August correctly held transient — NEVER
approve it) · BEE's first real depreciation draft `3c05ab82` (Feb-2025, 10,393¢, the 0041
ramp rule: first-ever run under an authority always drafts; owner approval unlocks the
remaining ten catch-up periods) · the first autonomous POST (≥2026-10-01) stands open.

**WAVE D records (never re-grill):** `docs/plan/wave-d-contract.md` (WD-R1..R15, ADR-055) ·
D-a: `wave-d-a-fa-design.md` v2.1 + `-part2.md` (ADR-056) · D-b AS-BUILT:
`wave-d-b-asbuilt.md` + `-part2.md` (ADR-058; the design docs are DESIGN-time, bannered) ·
D-b2's hold-ladder record: `~/.clara-tools/d-b-build-backup/recovered/split-build-record.md`
(ADR-059 — five fix waves W-R13..R15.1, three two-lens rounds ending CLEAN both lenses, the
owner-ruled NATIVE merge-gate substitute, the ceremony statement-timeout recipe, the
acceptance receipts). The hold-ladder's SETTLED residuals (probe C/A design residuals · the
raw-subject sentinel guard · the S5.8-b2 splice anchor · trade (f) — owner-reversible) are
never re-litigated. Archive branch `build/wave-d-b-0042`: **NEVER MERGE** (evidence only;
do-not-restore list in asbuilt-part2 §13). The Wave C records: `wave-c-contract.md`
(WC-R1..R12) · the C-a/C-b/C-c design docs + parts.

**Autopost law (ADR-049/050):** vendor-binding v4.1 BUILT AND LIVE; hand-drafts are never
autopost-eligible BY DESIGN; autopost-from-seeding stays REFUSED (WB-R2/ADR-046). The
OCR-sales envelope is BUILT; the missing piece is the unattended sales drafter, and the
floor accrues ONLY from chatTurn drafts tagged `sales_invoice` — contract §7-A. **Standing
law: migration numbers are claimed at MERGE time** (RENUMBER.md procedure). **Ceremony law
(ADR-059): live applies carrying whole-schema lex passes set session-level
`statement_timeout` inside the migration connection — role/db-level settings are invisible
through Supavisor's pool.** **Deploy law (2026-08-06, minted by the v54 belt gap): a deploy
ceremony closes only on a POSITIVE read that the running release carries the intended
commit — compare the release's build time against the merge it must contain, then read the
new code's own boot/log line; "the deploy command completed" is a derived state, not
evidence.** Malaysian tax facts live in effective-dated policy tables, never
in prose (`docs/plan/research/wave-c/my-tax-verified-2026-07-29.md`).

**Open build items (PROJECTLOG PART 2 is the live register):** **§7-A NEXT — skeleton
RATIFIED at v2** (`docs/plan/wave-7a-design-skeleton.md`, ADR-062; the build session grills
its §6 then builds five slices) · Gate P + Gate S both **operating runway** (first native-MYR
SST-stated bill / first real e-invoice XML) · the extraction-recovery door + FX-lite
prioritization (ADR-062 registrations) · Wave E (periods + statements; owns closing stock per
WD-R11, the segment-aware FA tie, the depreciation close gate, MPERS presentation wording,
**and the consolidated client-facts inputs: the F-1 allocation-date guard · entity_type
surfacing · the MSIC capture door**) · the `opening_tb.line` producer + K-doc door (Phase 5,
review-gated) · the fifth-lex measurement constraint (standing).

**Canary `daba7f2e` was due 2026-08-02 — NEVER answer it, even past due.**
