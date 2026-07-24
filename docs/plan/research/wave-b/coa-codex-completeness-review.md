Reading additional input from stdin...
2026-07-24T09:43:53.956974Z ERROR codex_models_manager::cache: failed to load models cache: missing field `supports_reasoning_summaries` at line 88 column 5
OpenAI Codex v0.144.1
--------
workdir: C:\Users\zhant\Desktop\clara-rebuild
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019f9382-8d18-78c1-8573-7756249dc68c
--------
user
Adversarial completeness review of a default Chart of Accounts template for MALAYSIAN private companies (Sdn Bhd) reporting under MPERS. The template is the file apps/dashboard/app/shared/coaTemplate.ts in this repo — READ IT FIRST (106 accounts, 10 blocks, 8 core + 2 optional; each account carries an MPERS roll-up and a note). Also read docs/plan/research/wave-b/malaysian-coa-official-research.md for the verified official-source findings that fed it.

CONTEXT: this template is applied to every newly onboarded client of a real Malaysian accounting practice. It must be professionally defensible. It deliberately encodes NO rates, thresholds or effective dates. Malaysia has no statutory chart of accounts (verified: 'chart of accounts' appears zero times in MPERS and zero times in Companies Act 2016), so the template's legitimacy rests on mapping cleanly to MPERS 4.2/5.5 face line items, the SSM MBRS taxonomy, and LHDN Form C analysis.

YOUR TASK — find what is WRONG or MISSING for a typical Malaysian SME practice. Be specific and concrete. In particular, assess these candidate gaps I already suspect, and find others I have not thought of:
1. PRELIMINARY / PRE-OPERATING / INCORPORATION EXPENSES — a real client's own ledger (a 2025-incorporated Sdn Bhd) carries 'INCORPORATION FEE'; the template has no such account. What is the correct treatment under MPERS (expense vs capitalise) and the correct tax treatment (deductibility under ITA s.33/s.39, and any specific relief for incorporation expenses), and should it be a distinct account?
2. HIRE PURCHASE — near-universal for Malaysian SME motor vehicles. The template has borrowings current/non-current but no HP creditor and no HP interest expense. Under MPERS Section 20, what accounts are needed, and does the tax treatment (interest deductibility, capital allowances on the asset) require separate lines?
3. DIRECTORS' FEES vs DIRECTORS' SALARY/REMUNERATION — the template combines them in one account (900-D01). In Malaysia these differ in EPF liability, in approval requirements under the Companies Act 2016, and in disclosure. Should they be split?
4. TAX AGENT FEE vs ACCOUNTING FEE vs AUDIT FEE — deductibility of tax filing/agent fees is subject to specific rules. Separate accounts?
5. STAFF WELFARE / MEDICAL / TRAINING — any deduction restrictions or reporting reasons requiring separate lines?
6. ZAKAT — for Muslim-owned companies there is a tax rebate mechanism. Should the template carry a zakat account, core or optional?
7. Anything else materially missing for a Malaysian SME: e.g. lease/rental deposits, retention sums (construction), stamp duty, EPF/SOCSO on directors, foreign worker levy, insurance vs Takaful, bank facilities, dividends and s.108/single-tier considerations.

ALSO: challenge anything present in the template that you think is WRONG, mis-classified, or tax-risky. Note that the template intentionally omits rates and dates — do not ask for those.

Output: (A) a table of accounts to ADD (code following the existing scheme, name, type, block, and WHY — cite the rule or practice reason); (B) accounts to CHANGE/SPLIT with reasons; (C) anything you would REMOVE; (D) what you would refuse to assert without an official source check. Read-only; edit nothing.
2026-07-24T09:44:21.439972Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/docs/streamable\"" })
2026-07-24T09:44:24.074458Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/zoom/streamable\"" })
2026-07-24T09:44:26.786570Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.zoom.us/.well-known/oauth-protected-resource/mcp/whiteboard/streamable\"" })
warning: Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
codex
I’m treating this as a read-only, adversarial accounting/tax review. I’ll first map the template and its cited research, then verify every treatment that could change deductibility, statutory approval, recognition, or disclosure against current official Malaysian sources.
  → Read repository instructions, COA template, and official-source research memo
  • Map existing accounts and candidate gaps to MPERS/MBRS/Form C requirements
  • Verify Malaysian accounting, tax, payroll, and Companies Act treatments with official sources
  • Produce adversarial add/change/remove/uncertainty findings with citations
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$files = @('"'CLAUDE.md','apps/dashboard/app/shared/coaTemplate.ts','docs/plan/research/wave-b/malaysian-coa-official-research.md'); foreach ("'$f in $files) { Write-Output "FILE: $f"; Get-Content -LiteralPath $f -Raw }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 822ms:
FILE: CLAUDE.md
# Clara â€” agent guide

Clara is an **AI-native Accounting OS for Malaysian accounting firms** (greenfield
rebuild). It runs the accounting lifecycle â€” onboarding â†’ ongoing close â†’ tax â†’
reporting â€” under professional human control, with a shared **RLS-isolated
Postgres as the single source of truth**. This is a fresh harness; the frozen
prior build and its `belcort/` doctrine are **not** carried over wholesale â€” the
domain gold is extracted deliberately per `docs/audit/02-salvage-manifest.md`.

## Where the truth lives (read the relevant row before acting)

| Need | Source of truth |
|---|---|
| Decisions (append-only ADRs) + open items | `docs/PROJECTLOG.md` (START HERE block) |
| Live CODE structure (functions, callers, routes) | **codebase-memory graph â€” query it, don't grep** (`get_architecture` / `search_graph` / `trace_path`; re-index after big changes) |
| What / why / scope Â· product invariants (LAW) | `docs/prd/PRD.md` |
| Target architecture (event spine, structural invariants, runtime, reporting) | `docs/architecture/ARCHITECTURE.md` |
| Phase 3â€“5 plan (vertical slices, gates, verification) | `docs/plan/REBUILD-PLAN.md` |
| Design direction (two-pane Agentic OS, typed parts[], card catalog) | `docs/design/DIRECTION.md` |
| Gate-1 audit (11 failure patterns, salvage manifest, rulings) | `docs/audit/` |
| Gate-2 blueprint packet (ratified stack) | `docs/00-GATE-2-README.md` |
| Runtime spike results + BINDING workflow-versioning policy | `docs/architecture/ARCHITECTURE.md` Appendix A Â· `spike/RESULTS.md` |
| DR / backup / readiness / SLO | `docs/ops/DR.md` |
| Data plane (migrations, seeds, DR, rig) | `packages/db/README.md` |
| Runtime skeleton (durable substrate, health/ready) | `packages/runtime/README.md` |

## Cardinal invariants (never violate â€” full set in `docs/prd/PRD.md`)

- **The DB owns every number; the agent only orchestrates.** Book writes go
  through named, audited Postgres functions â€” never hand-write a row when a
  function exists. The agent never *computes* a figure.
- **Four structural invariants** (ARCHITECTURE Â§0/Â§3.3), enforced in the DB, not
  by model discipline: client attribution (`assert_client_resolved` â‰¥0.95),
  provenance binding (`source_doc_sha256` + `document_id` validated in-txn), wake
  authority (per-wake allowlist), write authorization (structural read-only agent
  role â€” a `select approve_entry(...)` fails at the role level).
- **Precedence on collision:** accounting-correctness > backend contracts >
  design look/motion. On a design-vs-contract conflict, clarify with the owner
  (Tao, tools@belcort.com) â€” don't pick a side.

## Working protocol

- **Orchestrate via the `orchestrator-fable` skill.** The main model is the **orchestrator** (plan, delegate, synthesize, verify, own state); **workers** are the hands â€” Claude native subagent lanes, or Codex for heavy implementation/debugging/refactors â€” **every dispatch lane carries an explicit `model` override;** Delegate bounded work orders, inspect every worker result before accepting it, and run cross-model review before merging security-critical work. **Codex lane caveat (learned):** the `codex:codex-rescue` companion queue is unreliable (it has stalled for hours at "starting"); prefer a **direct `codex exec` via Bash** (background + a file-watcher on the output) or a **native subagent** â€” both have been reliable. 
- **Never Blindly dispatch the main model.** Every subagent/workflow/teammate dispatch carries an explicit `model`; ***omission silently inherits Fable, which is forbidden.*** Codex lanes stay `gpt-5.6-sol`.
- **Ground before building.** On a new or compacted session, before answering an architecture question or changing code: **query the codebase-memory graph first** for structure, and read the relevant harness row above. For substantial, opt-in-scale work a grounding fan-out (Workflow) can help â€” but a few targeted graph queries + reads usually suffice.
- **Query the graph, don't grep.** The codebase-memory graph is the first stop for "where / what / who-calls" questions (~100Ã— cheaper than file-by-file reading). Use Grep/Read to drill into the specific file the graph points you at. Re-index after big code changes. *(stdio MCP, project-scoped in `.mcp.json`.)*
- **Keep the harness fresh â€” each artifact for its purpose (before compact / refresh).** Check all the harness status and related docs is sync and refreshed with newest project state like **prd, rebuildplan, projectlog.......etc** , housekeeping anything that is stale or wrong/outdated, its for avoid the project's state, plan, decision, log 's pollution. and also refresh/update the memory record. (btw tidy up the loooong project log. make sure no context pollute in there.)Do a harness-refresh pass before compacting a long session.
- **Grill until crystal-clear.** For any non-trivial plan, bug fix, or feature, use the **`grilling` skill (`/grillme`)** to interview the owner â€” as many rounds as it takes until the plan is unambiguous and aligned. Resolve ambiguity before writing code.
- **`main` is PR-only** â€” land via PR with green CI (never push `main`). Free-tier
  branch protection is not platform-enforced, so the git-base freeze-lint + CI are
  the real gate â€” treat them as binding.
- **Never commit a credential.** `.env` is gitignored; only `.env.example`
  (placeholders) is tracked. Connections come from the environment (libpq PG*
  vars or `DATABASE_URL`) â€” never a DSN in code or argv. The leak-scan gate
  (`scripts/check-leaks.mjs`) enforces this.
- **Workflow bodies are immutable once deployed** (ARCHITECTURE Appendix A): ship
  a behavioural change as a new `_vN` export and repoint `workflows/registry.ts`;
  never rename/delete an export with in-flight runs. The freeze-lint
  (`scripts/check-frozen-workflows.mjs`) enforces this â€” regenerate the manifest
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

- âœ… **Always** run `pnpm typecheck` / `pnpm build` (and the DB smoke test where
  relevant) before declaring done; reverse-not-delete for posted entries; keep
  one audited function per mutation class; validate `db` changes on a throwaway.
- âš ï¸ **Ask the owner first:** any design-vs-contract collision; deleting/
  overwriting files you didn't create; a genuinely destructive/irreversible op
  (a DROP on shared state, a data delete, a project teardown).
- ðŸš« **Never:** compute a financial number in the agent/UI (the DB owns it);
  hand-write a books row when an audited fn exists; push to `main` directly;
  commit a secret; disturb the frozen prior project/repo or the spike's parked run.
- **All dispatch lanes get explicit model overrides, FORBID to use model `fable` as lane's model.**

## Dev toolchain (skills)

The engineering skill set (mattpocock/skills + repo-authored) is vendored under
`.claude/skills/` and **tracked in git** â€” available in every session. Key ones:
**`orchestrator-fable`** (the session workflow), **`grilling`** (`/grillme` â€”
interview the owner to kill ambiguity before building), **`handoff`** (a clean
continue-prompt for a fresh session), **`code-reviewbymatt`** (the review
standards/spec bar; the built-in `/code-review` remains the native review lane),
**`tdd`**, **`research`**, **`diagnosing-bugs`**, **`codebase-design`**, **`qa`**.
Per-repo skill config (issue-tracker â†’ `BELCORT-SDN-BHD/clara`, triage labels,
the domain-doc map) lives in `docs/agents/`.

## Where we are

Current phase/slice **status lives in memory** (`project-clara-rebuild-state`,
read-first) **+ `docs/plan/REBUILD-PLAN.md`** â€” refreshed each slice so this file
stays stable. (`docs/PROJECTLOG.md` is **decisions-only**, not a status home.)

**Phase 4, mid-WAVE B (knowledge + onboarding).** The waves so far, one line each:
**Wave A** (daily AP loop) FULLY LIVE â€” ADR-022/023/024; GATE 3 closed beta-real
(17/17 replay, AP gate exact RM 1,350,938.21, kill-mid-workflow exactly-once).
**Wave A2** (sales/AR + MyInvois local parse + SST 3-leg + CN/DN + purchase-only
bounded auto-posting) FULLY LIVE, Â§9 eval CLOSED â€” ADR-025/026/027 (Gate A exact
RM 1,973,332.91; Gate B exact). **Wave A2.1** (SST registration watch + sales
autopost lift + classifier gate) CLOSED â€” ADR-028/029/030, ruling WA21-R13; the RPR
watch surfaced OVERDUE **unprompted** in production, RM 1,310,276.40 to the sen;
Gates S/P deferred to REAL documents (PART 2). **Wave B**: the design contract
`docs/plan/wave-b-contract.md` v1.0 is LAW (ADR-032, rulings WB-R1..R18) and the
**DB heart â€” migration 0017 â€” is MERGED UNDEPLOYED** (ADR-033, PR #67): built by
blind lanes (a 179-cell contract-blind battery, SQL-unread) and a SIX-round
cross-model adversarial ratchet to RESOLVED; evidence in
`docs/plan/research/wave-b/`. **Live posture: Supabase 16 migrations Â· Fly
`clara-runtime:wave-b-v25` (chatTurn_v7/autoDraft_v3, ten loops) Â· dashboard Pages
`app.clarabook.com` auto-deploys from `main` Â· `clara-backup` daily (rclone
1.74.4, zero-501-proven).** The **v25 runtime lanes are BUILT merged undeployed**
(ADR-034: chatTurn_v7, wiki-aware autoDraft_v3, firmInterview_v1/
clientOnboarding_v1 on durable WDK-hook parks, the wiki-projection + lint
consumers; runtime suite 482/482; adjudications in
`docs/plan/research/wave-b/v25-runtime-lanes-memo.md` â€” model synthesis ships
fail-closed DARK pending the runtime consent-read ruling, PART 2). The dashboard
surfaces + runtime lanes are BUILT (ADR-035, PR #71) and **the WB-R18 CEREMONY
IS EXECUTED (ADR-036, 2026-07-24): LIVE = Supabase 17 migrations Â· Fly
`clara-runtime` wave-b-v25 (ten loops, WIKI_PROJECTION acquired, /ready 200) Â·
wiki backfill 30/30 Â· every post-verify probe green (pack dark/lit, replay
byte-identical, sightings unchanged, F10 serializable via PostgREST) Â· the
freeze deploy-lock committed (18 v25 entries immutable).** **What remains of
Wave B is ONLY the live gates O/K/W2/L/R2/F on REAL documents** (WB-R16: a real
second client + RPR''s management accounts for the B-12 lane; Gate K is
parse-feasible document-primary â€” the live OCR must emit `opening_tb.line`
regions, else the attributed keyed fallback). **Canary `daba7f2e` stays ARMED, due
2026-08-02 â€” NEVER answer it.**

FILE: apps/dashboard/app/shared/coaTemplate.ts
// The default Chart of Accounts template for a Malaysian private company (Sdn Bhd).
//
// PROVENANCE â€” read docs/plan/research/wave-b/malaysian-coa-official-research.md before
// changing anything here. Two independent lanes fed this file: web research against
// MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources, and a cross-model (gpt-5.6-sol)
// domain review. Both reached the same conclusion:
//
//   MALAYSIA HAS NO STATUTORY CHART OF ACCOUNTS. The phrase "chart of accounts" appears
//   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both extracted in full
//   and grep-verified). MPERS 4.9 is explicit: "This Standard does not prescribe the
//   sequence or format in which items are to be presented", and 4.9(b) permits renaming
//   and resequencing. CA 2016 s.245 is outcome-based â€” records must "sufficiently explain
//   the transactions and financial position of the company".
//
// So this template is NOT an official list. It is a defensible default whose only binding
// constraint is MAPPABILITY: every account rolls up cleanly to (a) the MPERS 4.2 / 5.5
// face line items, (b) the SSM MBRS (SSMxT) taxonomy actually filed, and (c) the LHDN
// Form C analysis and tax-computation add-backs. It is a starting point a professional
// edits per client â€” not a rule.
//
// DELIBERATELY ABSENT: rates, thresholds, percentages, effective dates. SST rates, tax
// bands, EPF/SOCSO/EIS/HRD rates and MyInvois deadlines are effective-dated compliance
// facts that change (service tax moved 6%->8% on 1 Mar 2024; scope expanded 1 Jul 2025;
// Service Tax Policies 1-4/2026 are live). They must never be encoded in an account name
// or in this file. MyInvois classification codes are transaction metadata, not accounts.
//
// FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. MPERS (2025) â€”
// Malaysia's adoption of IFRS for SMEs 3rd edition â€” was gazetted 10 October 2025 and
// applies to annual periods beginning on or after 1 January 2027 (early adoption
// permitted). Sections 4 and 5 are substantively unchanged between them, so this template
// is unaffected by that transition.

export type CoaTemplateAccount = {
  code: string;
  name: string;
  /** matches clara.coa_accounts.account_type */
  type: "asset" | "liability" | "equity" | "income" | "expense";
  /** control-account marker; only 'payable' | 'receivable' are permitted by the DB */
  accountClass?: "payable" | "receivable";
  /** DB CHECK: opening_balance_equity/retained_earnings require equity; sst_purchase_cost requires expense */
  special?:
    | "rounding"
    | "sst_output"
    | "sst_purchase_cost"
    | "opening_balance_equity"
    | "retained_earnings";
  /** which MPERS 4.2 / 5.5 face line item this rolls into â€” the mapping that makes the chart defensible */
  mpers: string;
  /** why this account exists as a separate line (tax analysis, statutory disclosure, MPERS split) */
  note?: string;
};

export type CoaTemplateBlock = {
  key: string;
  title: string;
  /** core = every Sdn Bhd needs it; optional = offer, do not seed by default */
  tier: "core" | "optional";
  blurb: string;
  accounts: CoaTemplateAccount[];
};

/**
 * Code scheme (extends the convention already in use by the firm: 100-000 share capital,
 * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 COGS, 900-xxx
 * mnemonic operating expenses, 999-R00 rounding). Numeric order identifies the block; it
 * does not dictate statement order â€” the MPERS mapping does that.
 *
 *   100-199 equity        200-299 non-current assets   300-399 current assets
 *   400-499 liabilities   500-599 income               600-699 cost of sales
 *   800-899 finance + tax expense                      900-989 operating expenses
 *   990-999 system
 *
 * DB constraint: account_code must match ^[0-9]{4,8}$ or ^[0-9]{3}-[0-9A-Z]{2,4}$.
 */
export const COA_TEMPLATE: CoaTemplateBlock[] = [
  {
    key: "equity",
    title: "Equity",
    tier: "core",
    blurb:
      "No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances).",
    accounts: [
      { code: "100-000", name: "Share capital", type: "equity", mpers: "Equity â€” share capital" },
      { code: "120-000", name: "Other reserves", type: "equity", mpers: "Equity â€” other reserves" },
      {
        code: "150-000",
        name: "Retained earnings",
        type: "equity",
        special: "retained_earnings",
        mpers: "Equity â€” retained earnings",
      },
      {
        code: "190-OBE",
        name: "Opening balance equity (system clearing)",
        type: "equity",
        special: "opening_balance_equity",
        mpers: "Equity â€” temporary conversion account",
        note: "A conversion account, not permanent equity. Must net to nil and be cleared before statutory statements are finalised.",
      },
    ],
  },
  {
    key: "ppe",
    title: "Property, plant and equipment",
    tier: "core",
    blurb: "Cost and accumulated depreciation held separately, as MPERS Section 17 disclosure requires.",
    accounts: [
      { code: "200-M01", name: "Motor vehicles â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-F01", name: "Furniture and fittings â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-C01", name: "Computer equipment â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-R01", name: "Renovation â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-M01", name: "Accumulated depreciation â€” motor vehicles", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-F01", name: "Accumulated depreciation â€” furniture and fittings", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-C01", name: "Accumulated depreciation â€” computer equipment", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-R01", name: "Accumulated depreciation â€” renovation", type: "asset", mpers: "Property, plant and equipment" },
    ],
  },
  {
    key: "current-assets",
    title: "Current assets",
    tier: "core",
    blurb:
      "Trade receivables carries the receivable control marker. Director and related-party balances are separate, directional and never netted â€” MPERS Section 33 related-party disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
    accounts: [
      {
        code: "300-000",
        name: "Trade receivables â€” control",
        type: "asset",
        accountClass: "receivable",
        mpers: "Trade and other receivables",
      },
      { code: "300-900", name: "Allowance for impairment â€” trade receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "310-B01", name: "Bank â€” main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 â€¦" },
      { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
      { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-D01", name: "Deposits paid", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "350-D01", name: "Amount owing from director", type: "asset", mpers: "Trade and other receivables â€” related party", note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off." },
      { code: "350-R01", name: "Amount owing from related company", type: "asset", mpers: "Trade and other receivables â€” related party" },
      { code: "360-T01", name: "Tax instalments paid / current tax receivable", type: "asset", mpers: "Current tax assets" },
    ],
  },
  {
    key: "liabilities",
    title: "Liabilities",
    tier: "core",
    blurb:
      "Every statutory payroll deduction is its own payable â€” EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable.",
    accounts: [
      { code: "400-000", name: "Trade payables â€” control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
      { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables" },
      { code: "410-002", name: "Salaries and wages payable", type: "liability", mpers: "Trade and other payables" },
      { code: "410-003", name: "EPF payable", type: "liability", mpers: "Trade and other payables", note: "Employees Provident Fund Act 1991." },
      { code: "410-004", name: "SOCSO payable", type: "liability", mpers: "Trade and other payables", note: "Employees' Social Security Act 1969 (Act 4)." },
      {
        code: "410-005",
        name: "SKBBK payable (LINDUNG 24 JAM)",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Non-Employment Injury Security Scheme â€” a distinct employee-borne PERKESO component with its own column in the official contribution table.",
      },
      { code: "410-006", name: "EIS payable", type: "liability", mpers: "Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) â€” separate from Act 4." },
      { code: "410-007", name: "PCB / MTD payable", type: "liability", mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form CP39)." },
      { code: "410-008", name: "HRD Corp levy payable", type: "liability", mpers: "Trade and other payables", note: "PSMB Act 2001 â€” applies only to employers within scope or registered voluntarily." },
      { code: "420-D01", name: "Amount owing to director", type: "liability", mpers: "Trade and other payables â€” related party" },
      { code: "420-R01", name: "Amount owing to related company", type: "liability", mpers: "Trade and other payables â€” related party" },
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker â€” see the SST limitation note below.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Sales tax is a single-stage tax on manufacturers/importers, accounted on an ACCRUAL basis â€” a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
      },
      { code: "430-WHT", name: "Withholding tax payable", type: "liability", mpers: "Trade and other payables", note: "Payments to non-residents â€” ITA s.107A contract payments, s.4A technical/management fees." },
      { code: "440-001", name: "Current tax payable (provision for taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision â€” it belongs in current tax liabilities." },
      { code: "460-L01", name: "Borrowings â€” current", type: "liability", mpers: "Financial liabilities â€” current" },
      { code: "461-L01", name: "Borrowings â€” non-current", type: "liability", mpers: "Financial liabilities â€” non-current" },
      { code: "490-D01", name: "Customer deposits", type: "liability", mpers: "Trade and other payables" },
      { code: "490-R01", name: "Deferred income / contract liabilities", type: "liability", mpers: "Other liabilities" },
    ],
  },
  {
    key: "income",
    title: "Income",
    tier: "core",
    blurb: "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly.",
    accounts: [
      { code: "500-000", name: "Revenue", type: "income", mpers: "Revenue" },
      { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
      { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
      { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue â€” net" },
      { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue â€” net" },
      { code: "530-000", name: "Other income", type: "income", mpers: "Other income" },
      { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
      { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income" },
      { code: "530-FX1", name: "Realised foreign exchange gain", type: "income", mpers: "Other income", note: "Realised and unrealised kept apart â€” unrealised amounts are a tax-computation adjustment." },
      { code: "530-FX2", name: "Unrealised foreign exchange gain", type: "income", mpers: "Other income" },
      { code: "540-I01", name: "Interest income", type: "income", mpers: "Finance income" },
    ],
  },
  {
    key: "cost-of-sales",
    title: "Cost of sales",
    tier: "core",
    blurb: "Form C requires contract and subcontract payments to be separately disclosed.",
    accounts: [
      { code: "610-100", name: "Cost of goods sold / purchases", type: "expense", mpers: "Cost of sales" },
      { code: "610-S01", name: "Subcontractor and direct service costs", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." },
      { code: "610-F01", name: "Freight and carriage inward", type: "expense", mpers: "Cost of sales" },
      { code: "610-RET", name: "Purchase returns (contra)", type: "expense", mpers: "Cost of sales" },
      { code: "610-DIS", name: "Purchase discounts (contra)", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "finance-tax",
    title: "Finance costs and tax",
    tier: "core",
    blurb: "MPERS 5.5 requires finance costs and tax expense as separate face lines.",
    accounts: [
      { code: "800-I01", name: "Interest expense â€” borrowings", type: "expense", mpers: "Finance costs" },
      { code: "810-T01", name: "Current income tax expense", type: "expense", mpers: "Tax expense" },
      { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense" },
    ],
  },
  {
    key: "operating-expenses",
    title: "Operating expenses",
    tier: "core",
    blurb:
      "Split to serve the LHDN tax computation: entertainment is separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an add-back or restricted deduction.",
    accounts: [
      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
      { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
      { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
      { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
      { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses" },
      { code: "900-B03", name: "Impairment loss â€” trade receivables", type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation distinction." },
      { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
      { code: "900-D01", name: "Directors' fees and remuneration", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4) disclosure." },
      { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
      { code: "900-DON", name: "Donations", type: "expense", mpers: "Other operating expenses", note: "Deductibility depends on approved-institution status." },
      { code: "900-E01", name: "EPF â€” employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of remuneration, so this must be separately measurable." },
      { code: "900-E02", name: "SOCSO and EIS â€” employer contribution", type: "expense", mpers: "Employee benefits" },
      { code: "900-E03", name: "Entertainment â€” staff", type: "expense", mpers: "Administrative expenses", note: "Kept apart from client entertainment: the deduction restriction differs." },
      { code: "900-E04", name: "Entertainment â€” client / business", type: "expense", mpers: "Administrative expenses", note: "Restricted deduction." },
      { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
      { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "Tax-computation adjustment." },
      { code: "900-FIN", name: "Fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Non-deductible." },
      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
      { code: "900-I01", name: "Insurance", type: "expense", mpers: "Administrative expenses" },
      { code: "900-L01", name: "Legal and professional fees", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M02", name: "Management fees", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be separately disclosed." },
      { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 â€” check the supplier's registration status." },
      { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
      { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs vs capital improvement is a tax-computation distinction." },
      { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
      { code: "900-S03", name: "Software and subscriptions", type: "expense", mpers: "Administrative expenses" },
      { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
      {
        code: "900-SST",
        name: "SST on purchases (expensed)",
        type: "expense",
        special: "sst_purchase_cost",
        mpers: "Administrative expenses",
        note: "Malaysian SST is NOT a credit-offset VAT â€” it is a cost. Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT be routed here.",
      },
      { code: "900-T01", name: "Telephone and internet", type: "expense", mpers: "Administrative expenses" },
      { code: "900-T02", name: "Travel and accommodation", type: "expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep local and overseas distinguishable." },
      { code: "900-T03", name: "Toll and parking", type: "expense", mpers: "Administrative expenses", note: "Do NOT combine with fines â€” the tax treatment differs." },
      { code: "900-U01", name: "Utilities", type: "expense", mpers: "Administrative expenses" },
    ],
  },
  {
    key: "system",
    title: "System",
    tier: "core",
    blurb: "Machine-owned. A recurring or material rounding balance means a coding or calculation defect, not a real expense.",
    accounts: [{ code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" }],
  },
  {
    key: "inventory",
    title: "Inventories (optional)",
    tier: "optional",
    blurb: "Seed only for entities that hold stock.",
    accounts: [
      { code: "330-T01", name: "Trading inventory", type: "asset", mpers: "Inventories" },
      { code: "330-R01", name: "Raw materials", type: "asset", mpers: "Inventories" },
      { code: "330-W01", name: "Work in progress", type: "asset", mpers: "Inventories" },
      { code: "330-F01", name: "Finished goods", type: "asset", mpers: "Inventories" },
      { code: "330-900", name: "Allowance for inventory obsolescence", type: "asset", mpers: "Inventories" },
      { code: "620-ADJ", name: "Inventory movement and stock adjustments", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "investments",
    title: "Investments and deferred tax (optional)",
    tier: "optional",
    blurb: "Seed only where the entity holds investments or recognises deferred tax.",
    accounts: [
      { code: "230-001", name: "Investment property â€” cost", type: "asset", mpers: "Investment property" },
      { code: "231-001", name: "Accumulated depreciation â€” investment property", type: "asset", mpers: "Investment property" },
      { code: "240-S01", name: "Investment in subsidiaries", type: "asset", mpers: "Investments in subsidiaries" },
      { code: "240-A01", name: "Investment in associates", type: "asset", mpers: "Investments in associates" },
      { code: "260-DTA", name: "Deferred tax asset", type: "asset", mpers: "Deferred tax assets" },
      { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities" },
    ],
  },
];

export const CORE_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "core");
export const OPTIONAL_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "optional");

export function templateAccounts(blockKeys: string[]): CoaTemplateAccount[] {
  return COA_TEMPLATE.filter((b) => blockKeys.includes(b.key)).flatMap((b) => b.accounts);
}

/**
 * KNOWN SCHEMA LIMITATIONS surfaced while building this template â€” recorded, not worked
 * around. Both are Wave-C/D candidates, not blockers:
 *
 * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
 *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
 *    thresholds, rates and â€” critically â€” different accounting bases (sales tax accrual,
 *    service tax payment). A dual registrant needs two separately tagged control accounts,
 *    or every journal leg must carry an effective-dated sales/service treatment dimension.
 *    This template puts the marker on service tax (much the commoner case for SME service
 *    providers) and seeds sales tax as a plain liability.
 *
 * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
 *    is correct for the operating-expense automation path, but SST attributable to
 *    inventory or PPE should be capitalised into the asset's cost and cannot be.
 */

FILE: docs/plan/research/wave-b/malaysian-coa-official-research.md
# Malaysian CoA â€” official-source research (2026-07-24)

> Three web-enabled research lanes (opus xhigh) against MASB/MPERS, SSM/MBRS and LHDN/RMCD.
> Facts below were fetched from official pages, not recalled. Anything unverified is listed
> under UNVERIFIED and must not be encoded as fact.

## MASB / MPERS

### Authority

**What MPERS legally IS.** MPERS is a MASB Approved Accounting Standard issued under subsection 7(1) of the Financial Reporting Act 1997 (Act 558) and regulation 3 of the Financial Reporting (Publication of Approved Accounting Standards) Regulations 1999. It is given legal force over company accounts by Companies Act 2016 s.244(1)-(2): the approved accounting standards "shall apply to the financial statements of a company", and directors "shall ensure that the financial statements... are made out in accordance with the applicable approved accounting standards" â€” subject only to the s.244(3) true-and-fair override.

**What it MANDATES.** Only (a) minimum *line items* that must appear on the face of the primary statements (MPERS 4.2, 5.5, 5.6, 5.7); (b) a current/non-current split unless a liquidity presentation is more relevant (4.4-4.8); (c) certain sub-classifications shown either on the face or in the notes (4.11-4.14); (d) an expense analysis by nature OR by function, entity's choice (5.11); (e) a ban on "extraordinary items" (5.10). Plus, under CA 2016 s.249(4), the Registrar may require additional note disclosures (directors' remuneration, directors' retirement benefits, compensation for loss of office, loans/quasi-loans to directors, auditors' remuneration) "notwithstanding any relevant provisions of the applicable approved accounting standards".

**What it explicitly does NOT mandate.** MPERS 4.9 is decisive and is verbatim: "This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation..." and 4.9(b) expressly permits that "the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions". The string "chart of accounts" appears **zero times** in the full MPERS text (13,346 lines extracted) and **zero times** in the Companies Act 2016 (24,759 lines extracted). CA 2016 s.245 ("Accounts to be kept") is purely outcome-based â€” records must "sufficiently explain the transactions and financial position of the company" â€” it prescribes no account structure, coding, or numbering. CA 2016 carries no prescribed accounts-format schedule (its Ninth Schedule is "Powers of Judicial Manager", not a contents-of-accounts schedule as under the repealed CA 1965).

**Practical design consequence for a Sdn Bhd default CoA.** The chart of accounts is a free design choice. The binding constraint is *mappability*: every account must roll up cleanly to (i) the MPERS 4.2 / 5.5 face line items, (ii) the 4.11-4.12 sub-classification and share-capital disclosures, and (iii) â€” the real-world tightest constraint â€” the SSM Taxonomy (SSMxT) FS-MPERS entry point, since XBRL lodgement via MBRS 2.0 is now mandatory. Design the CoA to a *target mapping*, not to a legal template, because no legal template exists.

### Verified facts

- NO mandatory chart of accounts exists. The phrase 'chart of accounts' appears zero times in the full MPERS text and zero times in the Companies Act 2016 (Act 777, updated text to 1.8.2022) â€” both extracted in full and grep-verified. Neither prescribes account codes, numbering, or an account structure.
- MPERS 4.9 verbatim: 'This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation in the statement of financial position.' This paragraph is UNCHANGED in the IFRS for SMEs third edition markup, so it carries into MPERS (2025).
- MPERS 4.9(b) verbatim permits renaming and resequencing: 'the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions, to provide information that is relevant to an understanding of the entity's financial position.'
- CA 2016 s.244(1)-(2) verbatim: 'The approved accounting standards shall apply to the financial statements of a company...' and directors 'shall ensure that the financial statements of the company... are made out in accordance with the applicable approved accounting standards'. s.244(3) provides a true-and-fair override where compliance would not give a true and fair view.
- CA 2016 s.245(1) verbatim is outcome-based, not structural: directors shall 'cause to be kept the accounting and other records to sufficiently explain the transactions and financial position of the company and enable true and fair profit and loss accounts and balance sheets... to be prepared'. s.245(2): entries must be made within SIXTY DAYS of completion of the transaction. s.245(3): records retained SEVEN YEARS.
- CA 2016's Ninth Schedule is 'POWERS OF JUDICIAL MANAGER' [subsection 414(4)] â€” it is NOT a prescribed contents-of-accounts schedule. CA 2016 contains no prescribed financial-statement format schedule.
- VERSION STATUS â€” MPERS (2025) has been issued and supersedes MPERS (2016). Official MASB gazette notice dated 10 October 2025, signed Tan Sri Mohd Nasir Ahmad, Chairman: 'An entity shall apply MPERS (2025) for annual periods beginning on or after 1 January 2027. Earlier application is permitted.' Same notice: 'MPERS (2016) shall hereby be withdrawn for application for financial statements with annual periods beginning on or after 1 January 2027.'
- Therefore AS AT JULY 2026 the standard in force is MPERS (2016) (the February 2016 issue incorporating the 2015 Amendments, effective 1 January 2017). MPERS (2025) is issued but not yet mandatory; early adoption is permitted. A Sdn Bhd with a 31 Dec year end applies MPERS (2016) for FY2026 and MPERS (2025) from FY2027.
- MPERS (2025) IS the Malaysian adoption of the IFRS for SMEs third edition. MASB press release: the revised MPERS is 'based on the third edition of the IFRS for SMEs Accounting Standard issued by the IASB' and is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The IASB issued the third edition in February 2025.
- MPERS REMAINS the framework for private entities; the MFRS/MPERS split is intact. The 10 October 2025 MASB notice is structured under two separate headings: 'MASB APPROVED ACCOUNTING STANDARD FOR ENTITIES OTHER THAN PRIVATE ENTITIES â€” Malaysian Financial Reporting Standard (MFRS)' and 'MASB APPROVED ACCOUNTING STANDARD FOR PRIVATE ENTITIES â€” Malaysian Private Entities Reporting Standard (2025)'.
- MPERS is an OPTION, not a compulsion. MPERS 1.1 verbatim: 'Private entities (as defined in paragraph 1.2) have the option to apply in its entirety either: (a) the Malaysian Private Entities Reporting Standard (MPERS or this Standard); or (b) the Malaysian Financial Reporting Standards (MFRSs).' A Sdn Bhd may elect full MFRS instead.
- Private entity definition (MPERS 1.2 as amended by the Addendum, applied for annual periods ending on or after 31 January 2017): 'A private entity is a private company as defined in section 2 of the Companies Act 2016 that: (a) is not itself required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia; and (b) is not a subsidiary or associate of, or jointly controlled by, an entity which is required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia.' Plus a carve-out: a private company that is, or is a subsidiary/associate of, or jointly controlled by, a management company as defined in section 2 of the Interest Schemes Act 2016 is NOT a private entity.
- SECTION 4/5 ARE SUBSTANTIVELY UNCHANGED between MPERS (2016) and the third edition on which MPERS (2025) is based. Verified line-by-line against the IFRS Foundation's official 'Third Edition | With changes since the second edition marked up' PDF. The 4.2 list of items (a)-(r) is identical in composition; the 5.5 list (a)-(i) is identical in composition. This means a chart of accounts built to MPERS (2016) Section 4/5 will NOT need restructuring for MPERS (2025).
- The only Section 4 changes in the third edition: 4.2(e) adds '(including bearer plants in the scope of Section 17 Property, Plant and Equipment)'; 4.2(h) and 4.2(i) add 'in the scope of Section 34 Specialised Activities' to biological assets; 4.3 adds an explicit disaggregation instruction â€” 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals...'; and the 4.2 chapeau drops the words 'As a minimum,'.
- The only Section 5 changes in the third edition: 5.5(c) renames Section 15 from 'Investments in Joint Ventures' to 'Investments in Joint Arrangements'; 5.5(h) reads 'accounted for using the equity method' (was 'by the equity method'); 5.8 says errors/policy changes are adjusted in the period they are 'identified' (was 'arise'). Paragraph 5.11 on expense analysis by nature vs function is COMPLETELY UNCHANGED.
- EXPENSE ANALYSIS IS A FREE CHOICE (MPERS 5.11, unchanged in the third edition): 'An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.' MPERS imposes NO requirement to disclose the by-nature breakdown when the by-function method is used (this is a real divergence from MFRS 101/IAS 1, which requires that additional disclosure).
- The ONLY hard constraint under the by-function method (MPERS 5.11(b)): 'At a minimum, an entity discloses its cost of sales under this method separately from other expenses.'
- COMPANIES ACT 2016 â€” PAR VALUE ABOLISHED. s.74 verbatim: 'All shares issued before or upon the commencement of this Act shall have no par or nominal value.' Consequence for a CoA: there is no 'par value' or 'nominal value' equity account; share capital is a single undivided amount.
- COMMENCEMENT DATE CONFIRMED from the Act's own text: '[31 January 2017, P.U. (B) 50/2017; Division 8 of Part IIIâ€”1 March 2018, P.U. (B) 106/2018; Section 241â€”15 March 2019, P.U. (B) 318/2019]'. Section 74 is not carved out, so it commenced 31 January 2017.
- SHARE PREMIUM ACCOUNT ABOLISHED â€” s.618(2) verbatim: 'Upon the commencement of section 74, any amount standing to the credit of a company's share premium account and capital redemption reserve shall become part of the company's share capital.' This was automatic and by operation of law on 31 January 2017 â€” no entry, election, or resolution was required.
- TRANSITIONAL WINDOW IS EXPIRED. s.618(3) and s.618(4) each allowed use of the share premium credit / capital redemption reserve credit only 'within twenty-four months upon the commencement of section 74'. Commencement was 31 January 2017, so the window closed on 30 January 2019 â€” more than seven years ago. For any Sdn Bhd being onboarded in 2026 the transition is fully historical: a live 'Share Premium' or 'Capital Redemption Reserve' account should NOT exist and, if found in a client's legacy ledger, is a migration defect to be swept into Share Capital.
- SSM Practice Note 1/2017 (issued 8 February 2017 by the Registrar of Companies under s.20C of the Companies Commission of Malaysia Act 2001) confirms the policy intent verbatim: 'The Companies Act 2016 abolishes the concept of nominal value in shares. Effectively, this policy will also render the share premium account and capital redemption reserves of a company to be no longer relevant. Instead the amount standing in the share premium account and the capital redemption reserves will be recognized as part of the company's share capital.'
- PN 1/2017 para 9(b) confirms the deadline was absolute: 'the right to use the credit standing in the share premium account must be exercised within 24 months after the commencement of the Companies Act 2016 irrespective of whether the decision to pay up any unissued shares as fully paid bonus shares is made before or after the commencement of the Companies Act 2016.'
- SHARE CAPITAL IS NOW LOCKED. s.618(2) share capital 'cannot be reduced without leave of Court' â€” i.e. reductions require the s.116 solvency-statement route or a court order. A CoA should treat Share Capital as a controlled/restricted account, not a freely-postable one.
- MPERS 4.12(a)(iii) still requires disclosure of 'par value per share or that the shares have no par value' â€” under CA 2016 a Malaysian Sdn Bhd discloses the latter. So the disclosure hook survives even though the account does not.
- THE REAL DE-FACTO LINE-ITEM CONSTRAINT IS SSM's MBRS XBRL TAXONOMY, not MPERS. Financial statements must be lodged with SSM in XBRL, tagged to the SSM Taxonomy (SSMxT). Per SSM's own MBRS 2.0 overview: the scopes are based on '1) Companies Act 2016; 2) Companies Act 1965; 3) Applicable approved accounting standards' with 'Private companies using the Malaysian Private Entities Reporting Standards in Malaysia (MPERS)'. The relevant entry points are 'FS â€“ MPERS' (entry point 7) and 'KFIâ€“MPERS' (entry point 18).
- MBRS 2.0 mandatory rollout was in three phases: Phase 1 from 1 December 2024 (unaudited FS and annual returns under CA 2016, plus EPC), Phase 2 from 1 March 2025 (audited FS under CA 1965 and previously-exempt financial institutions), Phase 3 from 1 June 2025 (audited FS of all companies under CA 2016). As at July 2026 all phases are live, so XBRL lodgement is fully mandatory for a Sdn Bhd.
- SSMxT is built on the IFRS Taxonomy 2022 as its base, and 'Given that MFRS and MPERS are largely based on IFRS, SSMxT has adopted the IFRS elements as the basis of its core elements', supplemented by SSM-created extensions 'necessary to support the Malaysian jurisdictional requirements'. Practical implication: the CoA should map to IFRS-taxonomy-shaped concepts, which aligns naturally with MPERS 4.2 / 5.5.
- SSMxT 2022 added a new statement to the MPERS entry points: 'New statement added in MPERS FS & KFI for "Statement of Retained earnings"' â€” consistent with MPERS Section 6, which permits a combined Statement of Income and Retained Earnings in place of separate SOCI and SOCE when the only equity movements are profit or loss, dividends, error corrections and policy changes.

### Line items / taxonomy / categories

- === MPERS SECTION 4, PARA 4.2 â€” STATEMENT OF FINANCIAL POSITION, MINIMUM FACE LINE ITEMS (verbatim, MPERS 2016 in force) ===
- 4.2 As a minimum, the statement of financial position shall include line items that present the following amounts:
- (a) cash and cash equivalents;
- (b) trade and other receivables;
- (c) financial assets (excluding amounts shown under (a), (b), (j) and (k));
- (d) inventories;
- (e) property, plant and equipment;
- (ea) investment property carried at cost less accumulated depreciation and impairment;
- (f) investment property carried at fair value through profit or loss;
- (g) intangible assets;
- (h) biological assets carried at cost less accumulated depreciation and impairment;
- (i) biological assets carried at fair value through profit or loss;
- (j) investments in associates;
- (k) investments in jointly controlled entities;
- (l) trade and other payables;
- (m) financial liabilities (excluding amounts shown under (l) and (p));
- (n) liabilities and assets for current tax;
- (o) deferred tax liabilities and deferred tax assets (these shall always be classified as non-current);
- (p) provisions;
- (q) non-controlling interest, presented within equity separately from the equity attributable to the owners of the parent; and
- (r) equity attributable to the owners of the parent.
- === MPERS (2025) / IFRS for SMEs 3rd ed VARIANTS OF 4.2 (effective 1 Jan 2027) ===
- 4.2 chapeau becomes: 'The statement of financial position shall include line items that present the following amounts:' (the words 'As a minimum,' are removed)
- (e) property, plant and equipment (including bearer plants in the scope of Section 17 Property, Plant and Equipment);
- (h) biological assets in the scope of Section 34 Specialised Activities carried at cost less accumulated depreciation and impairment;
- (i) biological assets in the scope of Section 34 carried at fair value through profit or loss;
- 4.3 becomes: 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals in the statement of financial position when such presentation is relevant to an understanding of the entity's financial position.'
- === MPERS 4.11 â€” SUB-CLASSIFICATIONS, FACE OR NOTES (verbatim) â€” THE PRACTICAL CoA DRIVER ===
- 4.11 An entity shall disclose, either in the statement of financial position or in the notes, the following subclassifications of the line items presented:
- (a) property, plant and equipment in classifications appropriate to the entity;
- (b) trade and other receivables showing separately amounts due from related parties, amounts due from other parties and receivables arising from accrued income not yet billed;
- (c) inventories, showing separately amounts of inventories: (i) held for sale in the ordinary course of business; (ii) in the process of production for such sale; and (iii) in the form of materials or supplies to be consumed in the production process or in the rendering of services.
- (d) trade and other payables, showing separately amounts payable to trade suppliers, payable to related parties, deferred income and accruals;
- (e) provisions for employee benefits and other provisions; and
- (f) classes of equity, such as paid-in capital, share premium, retained earnings and items of income and expense that, as required by this Standard, are recognised in other comprehensive income and presented separately in equity.
- === MPERS 4.12 â€” SHARE CAPITAL DISCLOSURES (verbatim) ===
- 4.12 An entity with share capital shall disclose the following, either in the statement of financial position or in the notes: (a) for each class of share capital: (i) the number of shares authorised. (ii) the number of shares issued and fully paid, and issued but not fully paid. (iii) par value per share or that the shares have no par value. (iv) a reconciliation of the number of shares outstanding at the beginning and at the end of the period. This reconciliation need not be presented for prior periods. (v) the rights, preferences and restrictions attaching to that class including restrictions on the distribution of dividends and the repayment of capital. (vi) shares in the entity held by the entity or by its subsidiaries or associates. (vii) shares reserved for issue under options and contracts for the sale of shares, including the terms and amounts. (b) a description of each reserve within equity.
- === MPERS 4.4-4.8 â€” CURRENT/NON-CURRENT (verbatim, unchanged in 3rd ed) ===
- 4.4 An entity shall present current and non-current assets, and current and non-current liabilities, as separate classifications in its statement of financial position in accordance with paragraphs 4.5-4.8, except when a presentation based on liquidity provides information that is reliable and more relevant. When that exception applies, all assets and liabilities shall be presented in order of approximate liquidity (ascending or descending).
- 4.5 An entity shall classify an asset as current when: (a) it expects to realise the asset, or intends to sell or consume it, in the entity's normal operating cycle; (b) it holds the asset primarily for the purpose of trading; (c) it expects to realise the asset within twelve months after the reporting date; or (d) the asset is cash or a cash equivalent, unless it is restricted from being exchanged or used to settle a liability for at least twelve months after the reporting date.
- 4.6 An entity shall classify all other assets as non-current. When the entity's normal operating cycle is not clearly identifiable, its duration is assumed to be twelve months.
- 4.7 An entity shall classify a liability as current when: (a) it expects to settle the liability in the entity's normal operating cycle; (b) it holds the liability primarily for the purpose of trading; (c) the liability is due to be settled within twelve months after the reporting date; or (d) the entity does not have an unconditional right to defer settlement of the liability for at least twelve months after reporting date.
- 4.8 An entity shall classify all other liabilities as non-current.
- === MPERS SECTION 5, PARA 5.5 â€” STATEMENT OF COMPREHENSIVE INCOME, MINIMUM FACE LINE ITEMS (verbatim) ===
- 5.5 As a minimum, an entity shall include, in the statement of comprehensive income, line items that present the following amounts for the period:
- (a) revenue.
- (b) finance costs.
- (c) share of the profit or loss of investments in associates (see Section 14 Investments in Associates) and jointly controlled entities (see Section 15 Investments in Joint Ventures) accounted for using the equity method.
- (d) tax expense excluding tax allocated to items (e), (g) and (h) (see paragraph 29.35).
- (e) a single amount comprising the total of: (i) the post-tax profit or loss of a discontinued operation; and (ii) the post-tax gain or loss attributable to an impairment, or reversal of an impairment, of the assets in the discontinued operation (see Section 27 Impairment of Assets), both at the time and subsequent to being classified as a discontinued operation and to the disposal of the net assets constituting the discontinued operation.
- (f) profit or loss (if an entity has no items of other comprehensive income, this line need not be presented).
- (g) each item of other comprehensive income (see paragraph 5.4(b)) classified by nature (excluding amounts in (h)). Such items shall be grouped into those that, in accordance with this Standard: (i) will not be reclassified subsequently to profit or lossâ€”ie those in paragraph 5.4(b)(i)-(ii) and (iv); and (ii) will be reclassified subsequently to profit or loss when specific conditions are metâ€”ie those in paragraph 5.4(b)(iii).
- (h) share of the other comprehensive income of associates and jointly controlled entities accounted for by the equity method.
- (i) total comprehensive income (if an entity has no items of other comprehensive income, it may use another term for this line such as profit or loss).
- === MPERS 5.6 â€” ALLOCATIONS (verbatim; only relevant where consolidated) ===
- 5.6 An entity shall disclose separately the following items in the statement of comprehensive income as allocations for the period: (a) profit or loss for the period attributable to (i) non-controlling interest; and (ii) owners of the parent. (b) total comprehensive income for the period attributable to (i) non-controlling interest; and (ii) owners of the parent.
- === MPERS 5.2 and 5.7 â€” ONE-STATEMENT vs TWO-STATEMENT CHOICE (verbatim) ===
- 5.2 An entity shall present its total comprehensive income for a period either: (a) in a single statement of comprehensive income, in which case the statement of comprehensive income presents all items of income and expense recognised in the period; or (b) in two statementsâ€”an income statement and a statement of comprehensive incomeâ€”in which case the income statement presents all items of income and expense recognised in the period except those that are recognised in total comprehensive income outside of profit or loss as permitted or required by this Standard.
- 5.7 Under the two-statement approach, the income statement shall display, as a minimum, line items that present the amounts in paragraph 5.5(a)-5.5(f) for the period, with profit or loss as the last line. The statement of comprehensive income shall begin with profit or loss as its first line and shall display, as a minimum, line items that present the amounts in paragraph 5.5(g)-5.5(i) and paragraph 5.6 for the period.
- === MPERS 5.4(b) â€” THE ONLY FOUR ITEMS OF OTHER COMPREHENSIVE INCOME (verbatim) â€” a closed list, so OCI accounts in a CoA are bounded ===
- (i) some gains and losses arising on translating the financial statements of a foreign operation (see Section 30 Foreign Currency Translation); (ii) some actuarial gains and losses (see Section 28 Employee Benefits); (iii) some changes in fair values of hedging instruments (see Section 12 Other Financial Instrument Issues); and (iv) changes in the revaluation surplus for property, plant and equipment measured in accordance with the revaluation model (see Section 17 Property, Plant and Equipment).
- === MPERS 5.11 â€” ANALYSIS OF EXPENSES: BY NATURE vs BY FUNCTION (verbatim, unchanged in 3rd ed) ===
- 5.11 An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.
- Analysis by nature of expense â€” (a) Under this method of classification, expenses are aggregated in the statement of comprehensive income according to their nature (for example, depreciation, purchases of materials, transport costs, employee benefits and advertising costs) and are not reallocated among various functions within the entity.
- Analysis by function of expense â€” (b) Under this method of classification, expenses are aggregated according to their function as part of cost of sales or, for example, the costs of distribution or administrative activities. At a minimum, an entity discloses its cost of sales under this method separately from other expenses.
- === MPERS 5.9 and 5.10 (verbatim) ===
- 5.9 An entity shall present additional line items, headings and subtotals in the statement of comprehensive income (and in the income statement, if presented), when such presentation is relevant to an understanding of the entity's financial performance.
- 5.10 An entity shall not present or describe any items of income and expense as 'extraordinary items' in the statement of comprehensive income (or in the income statement, if presented) or in the notes.
- === CA 2016 s.249(4) â€” REGISTRAR-MANDATED NOTE DISCLOSURES (verbatim) â€” these need dedicated CoA accounts or tags ===
- (a) the directors' remuneration; (b) the directors' retirement benefits; (c) compensation to directors for loss of office; (d) loans, quasi-loans and other dealings in favour of directors; (e) the total of the amount paid to or receivable by the auditors as remuneration for their services as auditors, inclusive of all fees, percentages or other payments or consideration given by or from the company or by or from any subsidiary of the company.
- === EQUITY SECTION FOR A POST-2017 Sdn Bhd (derived from CA 2016 s.74/s.618 + MPERS 4.11(f)) ===
- Share Capital â€” single undivided amount, no par value, absorbed any pre-2017 share premium and capital redemption reserve by operation of law on 31 January 2017; cannot be reduced without leave of Court or the s.116 solvency route
- Retained Earnings / Accumulated Losses
- Revaluation Surplus (only if the PPE revaluation model under Section 17 is elected)
- Foreign Currency Translation Reserve (only if there is a foreign operation under Section 30)
- Hedging Reserve (only if hedge accounting under Section 12 is applied)
- Non-controlling Interests (consolidated accounts only)
- DO NOT CREATE: 'Share Premium' â€” abolished 31 January 2017, transitional use window expired 30 January 2019
- DO NOT CREATE: 'Capital Redemption Reserve' â€” abolished 31 January 2017, same expired window
- DO NOT CREATE: 'Authorised Share Capital' â€” the concept of authorised capital is abolished under CA 2016

### UNVERIFIED â€” do not encode

- I could NOT read the MPERS (2025) standard text itself. masb.org.my gates every standard PDF behind a click-through/session check (pdf.php redirects to access.php; direct pdf_file paths return an HTML meta-refresh), and MPERS (2025) printed copies are stated to be 'available for sale'. My Section 4/5 statements about MPERS (2025) are therefore an INFERENCE from the IFRS Foundation's official third-edition markup PDF, resting on MASB's own published statement that the revised MPERS is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The inference is strong but is not a direct reading of MPERS (2025). Buy/obtain MPERS (2025) before treating its Section 4/5 wording as final.
- The verbatim MPERS (2016) Section 4/5 text I quoted was extracted from a mirrored copy of the MASB-branded PDF (title page: 'Malaysian Private Entities Reporting Standard (MPERS)', 'Â© Malaysian Accounting Standards Board (February 2016)', 'This document incorporates 2015 Amendments... effective 1 January 2017'), not from masb.org.my directly, because of the gate above. INTEGRITY CHECK PERFORMED: I compared it clause-by-clause against the IFRS Foundation's official third-edition markup PDF, which reproduces the second-edition text with deletions struck through â€” the second-edition baseline matches the mirror exactly, including the unusual '(ea)' sub-item. I am confident the text is authentic, but it is worth one confirmation against a purchased/official MASB copy before it is hard-coded as LAW in the product.
- The exact strike-through/underline direction in the 4.2 chapeau ('As a minimum, the The statement of financial position shall include...') was inferred from context, because pdftotext discards the markup formatting. My reading is that 'As a minimum, the' is DELETED and 'The' is INSERTED â€” which is corroborated by the new disaggregation instruction added to 4.3. But I cannot rule out the opposite direction from the text extraction alone. Note this change is presentational only; it does not alter the (a)-(r) list.
- Whether SSM has updated or will update the SSMxT / MBRS taxonomy for MPERS (2025) ahead of the 1 January 2027 effective date. The taxonomy documents I read are the SSMxT 2022 generation (built on IFRS Taxonomy 2022 and the then-current MPERS). If the product's chart of accounts is designed to map to MBRS, that mapping will likely need a refresh when SSM issues an MPERS-(2025)-aligned taxonomy. I found no announcement either way.
- The precise SSMxT element counts. The consultation document's summary table extracted in a garbled layout; my reading is that the FS-MPERS taxonomy has roughly 1,543 elements (about 564 drawn from the IFRS for SMEs 2022 taxonomy plus about 979 SSM extensions) versus roughly 2,047 for FS-MFRS. Treat these as order-of-magnitude only â€” the column alignment was ambiguous.
- I did not obtain the actual SSMxT FS-MPERS element list (the concrete tag names for each statement-of-financial-position and income-statement concept). It is embedded in SSM's mTool preparation software rather than published as a plain list on the website. This is the single highest-value remaining artefact for building a mappable default chart of accounts â€” recommend extracting it from mTool 2.1 directly.
- Several corroborating secondary sources returned HTTP 403 to automated fetching and could not be read: the PwC Malaysia MPERS alert (alert124-mpers.pdf), the MIA Accountants Today article on the third edition (at-mia.my), the Crowe Malaysia MBRS 2.0 insight, and the MIA MPERS FAQs PDF (mia.org.my). None of my verified facts depend on them â€” every load-bearing fact above came from MASB, SSM, the Companies Act text, or the IFRS Foundation.
- I did not investigate LHDN/tax-side line-item requirements (Form C categories, the tax computation's disallowable-expense breakdown) or MyInvois e-Invoice classification codes. These are separate regimes from MPERS and may impose their own de-facto account granularity on a Malaysian SME chart of accounts â€” they were outside this task's scope but are worth a follow-up before finalising the CoA.
- MPERS Section 6's combined 'Statement of Income and Retained Earnings' option: I verified from the MASB comparative article and Section 6's scope paragraph that the option exists when the only equity movements are profit or loss, dividends, error corrections and accounting-policy changes, and I verified SSMxT 2022 added a 'Statement of Retained earnings' to the MPERS entry points. I did NOT read Section 6's full conditions verbatim, so treat the precise eligibility conditions as unconfirmed.

### Sources

- https://www.masb.org.my/pages.php?id=20
- https://www.masb.org.my/pages.php?id=615
- https://www.masb.org.my/press_list.php?id=489
- https://www.masb.org.my/press_list.php?id=490
- https://www.masb.org.my/pdf_file/2025Oct10_Notice%20ENG_CLEAN.pdf
- https://www.masb.org.my/pdf/MPERS%20article_A%20Comparative%20Analysis%20of%20PERS%20MPERS%20and%20MFRS%20Frameworks_old.pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf
- https://www.ssm.com.my/Pages/Legal_Framework/PDF%20Tab%202/pn1-2017_r1.pdf
- https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
- https://ssm.com.my/Pages/Services/Other-Services/MBRS-document/Consultation-2022-SSM-Taxonomy-Templates-Stakeholders.pdf
- https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2025/ifrs-for-smes-standard-markup.pdf
- https://www.bdo.my/en-gb/insights/featured-insights/malaysian-business-reporting-system-(mbrs)-2-0
- https://c0aa0d68-de31-44c8-bb40-ac5f2e0a9fe4.filesusr.com/ugd/a87018_5b13be37ec354e388901ef7342d8f641.pdf?index=true

## SSM / MBRS (XBRL filing)

### Authority

**What MBRS legally mandates**

MBRS is the XBRL lodgement channel of Suruhanjaya Syarikat Malaysia (SSM / Companies Commission of Malaysia). Its legal hook is the Companies Act 2016 (CA 2016) lodgement duties, not a separate accounting law:

- CA 2016 s.259(1)(a) (verified verbatim from the Act on ssm.com.my): "A company shall lodge with the Registrar for each financial year the financial statements and reports required under this Act â€” (a) in the case of a private company, within thirty days from the financial statements and reports are circulated to its members under section 258". MBRS is the *format and channel* for discharging that duty.
- CA 2016 s.260(1)-(2): an **exempt private company MAY lodge a certificate of EPC status in lieu of s.259(1)(a)** â€” signed by a director, auditor and secretary â€” instead of lodging financial statements at all.
- Mandatory XBRL: SSM's live MBRS page (fetched 2026-07-24) carries the announcement "PELAKSANAAN SERAH SIMPAN MANDATORI BERPERINGKAT MELALUI SISTEM MBRS 2.0" (phased mandatory lodgement via MBRS 2.0), dated 27/11/2024, followed by FAQ announcements dated 1/3/2025 ("MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025") and 20/5/2025 ("IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025"). As of today (July 2026) all three phases are past, so full-set FS in XBRL via MBRS 2.0 is the live mandatory route.
- Applicability (SSM FAQ Â§1.5, verbatim): "Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS)." Under MBRS 2.0, companies regulated by Bank Negara Malaysia and FS prepared under CA 1965 â€” previously exempted â€” are **now** required to submit via MBRS.
- The taxonomy is binding as a *reporting vocabulary*: "Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document" â€” the preparer must instead use text-block tagging for extra detail.
- The Business Rules workbook (SSM-published, `Business_Rule_MBRS_v2_SSMxT_2022.xlsx`) is enforced in mTool as hard validations with severity Error/Warning. Failing an Error rule blocks generation of the XBRL instance.

**What MBRS does NOT mandate â€” this is the key negative finding**

- **SSM does NOT publish or prescribe a chart of accounts.** Searched the entire official document set â€” SSMxT_2022 Architecture Document (111 pp), MBRS FAQ v2.4 (54 pp), mTool 2.2 FS-CA2016 User Manual (105 pp), the SSM MBRS 2.0 overview deck, the live MBRS page, and all 1,633 filenames in the SSMxT_2022v1.0 taxonomy package â€” for "chart of accounts", "carta akaun", "ledger", "general ledger", "account code", "kod akaun": **zero hits**. There is no CoA artefact of any kind.
- What SSM prescribes is a **presentation/reporting taxonomy**: "SSM XBRL Taxonomy (SSMxT) is a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool (mTool)." The architecture document also states plainly: "The taxonomy is not intended to be an exhaustive representation of the requirements under the accounting standards and legislation."
- The bridge from a firm's own ledger to SSM's elements is explicitly the preparer's mapping job, not a prescribed structure. SSM FAQ Â§1.7 "Mapping Principles" (verbatim): "In preparing the XBRL file for financial statements, preparers will need to do mapping by the matching information within the financial statements (e.g. the amount of fixed assets) to a relevant concept within the Taxonomy (e.g. Property, Plant and Equipment)."
- Practical consequence for a ledger design: SSMxT constrains **what must be reportable at FS-presentation level**, and the Business Rules define a hard minimum set of elements that MUST carry a value. A firm is free to design any CoA it likes, provided the ledger can roll up to those elements. That is a constraint on the *aggregation targets*, not on account codes.
- MBRS also does not mandate the accounting standard â€” that is MASB's MFRS/MPERS. SSM only routes the filing to the matching entry point (FS-MFRS vs FS-MPERS).
- Audit exemption is a separate SSM instrument (Practice Directive 10/2024), not an MBRS rule. It changes whether the FS are audited, not the XBRL breakdown required.

### Verified facts

- MBRS = Malaysian Business Reporting System, SSM's submission platform based on XBRL. It accepts: Annual Return (AR); Financial Statements and Key Financial Indicators (FS/KFI); Exemption Applications (EA) related to FS/KFI and AR; Annual Return per Companies Act 1965 (AR1965); and Financial Statements per Companies Act 1965. (SSM FAQ v2.4 Â§1.1, and the live SSM MBRS page.)
- MBRS has exactly three components: (a) SSM Taxonomy (SSMxT) â€” 'a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool'; (b) MBRS Preparation Tool (mTool) â€” an Excel-based, form/template-driven preparer app with inbuilt SSMxT browser and data validation; (c) MBRS Portal (mPortal) â€” the submission platform. (SSM FAQ v2.4 Â§1.2.)
- CURRENT RELEASE as of the live SSM MBRS page fetched 2026-07-24: MBRS 2.0. Preparation tool = mTool 2.2 (32-bit and 64-bit installers, plus a 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook). Latest taxonomy published = SSM Taxonomy (SSMxT) 2022, file SSMxT_2022v1.0.zip; SSMxT 2017 v1.0 and SSMxT 2014 (ssmt_20131231) are also listed as legacy. Supporting artefacts published: SSMxT Architecture 2022 (PDF) and 'SSM Business Rule MBRS 2.0 SSMxT 2022' (Excel).
- The taxonomy release date embedded throughout SSMxT_2022v1.0 is 2022-12-31; namespaces are under http://xbrl.ssm.com.my/taxonomy/2022-12-31/.
- SSMxT_2022v1.0 is based on the IFRS Accounting Taxonomy 2022 issued by the IFRS Foundation; it adopts 6,458 IFRS elements as its core, plus Malaysian jurisdictional extensions. MPERS filings sit on the IFRS for SMEs 2022 base (prefix `ifrs-smes`) plus SSM's own `ssmt-mpers` extensions.
- Mandatory implementation timeline as published in the Announcements table on the live SSM MBRS page: 27/11/2024 â€” notice of phased mandatory lodgement via MBRS 2.0; 1/3/2025 â€” FAQ 'MBRS 2.0 MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025'; 20/5/2025 â€” FAQ 'IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025'. No announcement newer than 20/5/2025 appears on the page as of 2026-07-24.
- Who is in scope (SSM FAQ Â§1.5, verbatim): 'Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS).' MBRS 2.0 additionally brought in companies regulated by Bank Negara Malaysia and FS prepared under CA 1965, both previously exempted from MBRS.
- SSMxT scope split (Architecture Â§1.4): 1) MFRS Taxonomy â€” for public/private companies and their subsidiaries, associates or JCEs required to prepare/lodge FS using MFRS; 2) MPERS Taxonomy â€” for financial statements of PRIVATE companies required to prepare or lodge FS using MPERS; 3) Exemption Application Taxonomy; 4) Annual Return Taxonomy.
- MFRS and MPERS each split into TWO access points: (a) Financial Statements (FS) â€” 'a taxonomy containing all statements for reporting under respective accounting standards'; (b) Key Financial Indicators (KFI) â€” 'a taxonomy listing basic financial concepts available for financial reporting IF THE FILER OPTS NOT TO FILE FULL FS FILING IN XBRL'. KFI is only permitted once SSM approves an EA2 application (exemption from filing FS in full XBRL format, CA 2016 s.604(2)).
- Applicable statements for a FULL financial statements filing (Architecture Table 1 and FAQ Â§1.6, minimum requirement list): Statement of Financial Position (Current/Non-current OR Order of liquidity presentation); Statement of Profit or Loss (Function of expenses OR Nature of expenses); Statement of Cash Flows (Direct OR Indirect); Statement of Changes in Equity; Statement of Retained Earnings; Notes to accounts. Non-financial under CA 2016: Director's report; Statement of directors; Directors' business review; Auditors report to members. Plus 'Involvement in Stock Exchange' for Bursa-listed companies.
- Reporting-concept counts (Architecture Table 3): FS under CA 2016 / MPERS = 1,211 concepts from IFRS for SMEs 2022 + 1,164 SSM concepts = 2,375 total. FS under CA 2016 / MFRS = 5,247 IFRS + 950 SSM = 6,197. Reports under FS (CA 2016) = 158. Document & Entity information CA 2016 = 39.
- COMPANY EXTENSIONS ARE PROHIBITED (Architecture Â§1.8, verbatim): 'Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document, instead, the preparer needs to provide the necessary level of detail by text-block tagging the information using appropriate [text block] concepts.'
- ELR sort-code scheme for the Financial Statements taxonomy (Architecture Â§4.2.4.6): 01xxxx = Filing information; 02xxxx = Scope of filing; 1xxxxx = Companies Act 2016 disclosures; 2xxxxx = Statement of financial position; 3xxxxx = Statement of profit or loss; 4xxxxx = Statement of comprehensive income; 5xxxxx = Statement of cash flows; 6xxxxx = Statement of Changes in Equity / Statement of Retained Earnings; 7xxxxx = List of notes and other disclosures. [990000] = Axis - Defaults.
- The FS-MPERS entry point is ssmt-fs-mpers_2022-12-31_entry_point.xsd at http://xbrl.ssm.com.my/taxonomy/2022-12-31/rep/ssm/ca-2016/fs/mpers/. Its rol_ schema declares exactly these financial-statement ELRs (read directly from the downloaded taxonomy): [020000] Scope of filing; [120000] Disclosure - Directors report; [120100] Disclosure - Statement by directors; [120200] Disclosure - Director business review; [130000] Disclosure - Auditors report to members; [200100] Statement of financial position; [200100a] ...details; [200200] Sub-classification of assets, liabilities and equity; [210000] Statement of financial position, by current/non-current method; [210100] Sub-classification ... by current/non-current method; [220000] Statement of financial position, by order of liquidity method; [220100] Sub-classification ... by order of liquidity method; [300100] Statement of income and expenditure, Profit (loss); [300100a] ...Gross profit; [300100b] ...Operating profit; [300100c] ...Profit (loss) attributable to; [300200] Analysis of Income and Expense; [300200a] ...Employee benefit expense; [300200b] ...Other expenses by function; [300200c] ...Other expenses by nature; [310000] Statement of profit or loss, by function of expense; [310100] Analysis of profit or loss, by function of expense; [320000] Statement of profit or loss, by nature of expense; [320100] Analysis of profit or loss, by nature of expense; [400100]/[400100a] Statement of Comprehensive Income; [410000] SCI - Net of tax; [420000] SCI - Before tax; [500100] Statement of cash flows; [510000] direct method; [520000] indirect method; [610000] Statement of Changes in Equity; [620000] Statement of Retained Earnings; [710000] Notes - Corporate information; [720000] Notes - Summary of significant accounting policies; [730000] Notes - List of notes; [740000] Notes - Issued capital; [750000] Notes - Related party transactions; [990000] Axis - Defaults.
- Note that FS-MPERS has only FIVE note ELRs ([710000] Corporate information, [720000] Summary of significant accounting policies, [730000] List of notes, [740000] Issued capital, [750000] Related party transactions). All other note detail is carried by text-block concepts, not by structured elements.
- Which presentation variant renders is driven by four 'Scope of filing' switches that act as table-layout filters (Architecture Â§2.10.7.1): ssmt_MethodUsedForPreparingStatementOfFinancialPosition, ssmt_MethodUsedForPreparingStatementOfProfitOrLoss, ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome, ssmt_MethodUsedForPreparingStatementOfCashFlows. There is also ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity.
- Every FS statement is dimensioned by ifrs-smes_ConsolidatedAndSeparateFinancialStatementsAxis with members ifrs-smes_ConsolidatedMember (label 'Group [member]') and ifrs-smes_SeparateMember (label 'Company [member]').
- MINIMUM BREAKDOWN â€” hard validation, FS-MPERS Statement of Financial Position. Business rule IDs SOFP-Mandatory-fs-mpers-01 / 01A / 01B / 01C (scenario: Current-Noncurrent, Consolidated/Separate, current/previous year) and -02/02A/02B/02C (scenario: Order of liquidity). Severity = Error. Message: 'Property, plant and equipment, Investment properties, Intangible assets, Investments in associates, Investments in joint ventures, Inventories, Trade and other non-current receivables, Trade and other current receivables, Total assets, Issued capital, Total equity, Retained earnings, Reserves, Total equity attributable to owners, Employee benefits, Provisions, Trade and other non-current payables, Trade and other current payables, Total current liabilities, Total liabilities, Total equity and liabilities, Loans and borrowings, Employee benefits, Provisions, Investments in subsidiaries, Other non-current assets, Other current assets, Equity - other components, Cash and cash equivalents, Loans and borrowings -> MUST be reported'.
- MINIMUM BREAKDOWN â€” hard validation, FS-MPERS Statement of Profit or Loss. Business rule IDs SOPL-Mandatory-fs-mpers-01/01A/01B/01C (Function of expense) and -02/02A/02B/02C (Nature of expense), current and previous year, Consolidated and Separate. Severity = Error. Message: 'Revenue, Cost of sales, Other income, Other expenses, Finance income, Finance costs, Profit (loss) before tax, Profit (loss) from continuing operations net, Profit (loss) -> MUST be reported'.
- Additional FS-MPERS P&L rules: SOPL-Mandatory-fs-mpers-03 â€” if 'Disclosure of financial statements audit status' is 'audited' then "Total auditor's remuneration" MUST be reported. SOPL-Mandatory-fs-mpers-04 â€” if the filer selects 'Group' then profit and comprehensive income attributable to owners of parent AND to non-controlling interests MUST be reported.
- Balance-check rule: Mandatory-fs-mpers-109, severity Error â€” 'Assets should be equal to Equity and Liabilities'.
- Rule volume per statement for FS-MPERS (counted from the SSM Business Rules workbook, sheet 'FS-MPERS - CA2016', 176 rules total): Filing Information 32, Scope of filing 27, Directors report 20, Statement by directors 18, Issued capital 13, Statement of Changes in Equity 12, Statement of profit or loss 10, Auditors report to members 9, Statement of financial position 9, Statement of cash flows 9, Related party transactions 5, Statement of Retained Earnings 5, Corporate information 4, Director business review 2, Summary of significant accounting policies 1.
- Mandatory scope-of-filing facts for FS-MPERS (Error severity): Date of financial statements approved by Board of Directors; Date of circulation of FS and reports to members; Date of Statutory Declaration; MSIC Code; Description of business. Mandatory filing-information facts include: New company registration number; Name of company; Origin of company; Status of company; Type of company; current financial year start and end dates; Disclosure of FS audit status; Status of carrying on business during the financial year; Basis of accounting standards applied; Type of submission; Nature of financial statements; Level of rounding used; Description of presentation currency; Name and version of software used to generate the XBRL file; Taxonomy version; Application of submission.
- Audit-exemption interaction, encoded as a business rule (Mandatory-dei-fs-mpers-22/23): if Status of company = 'Private company' and audit status = 'Unaudited', then 'Description of audit exemption category' MUST be reported, and must be one of 'Zero-revenue company', 'Threshold-Qualified company', or 'Dormant company'.
- FS ENTRY POINTS under CA 2016 (SSM FAQ Â§1.3 and MBRS Summary Sheet): FS-MFRS, FS-MPERS, FS-CLBG (Company Limited by Guarantee), FS-FC (Foreign Company, only after EA3 approval), FS-EPC (Exempt Private Companies), FS-BNM (BNM-regulated). CA 1965 adds FS-BNM-1965, FS-CLBS-1965, FS-CLBG-1965, FS-EPC-1965, FS-FC-1965. KFI entry points: KFI-MFRS, KFI-MPERS, KFI-CLBG, KFI-FC â€” all gated on EA2 approval.
- EXEMPT PRIVATE COMPANIES â€” this is the real 'small private company' answer. CA 2016 s.260(1) (verbatim from the Act PDF hosted on ssm.com.my): 'An exempt private company may lodge with the Registrar for each financial year a certificate relating to its status as an exempt private company in lieu of the requirements in paragraph 259(1)(a) within thirty days from the circulation of the financial statements and reports are circulated under section 258.' s.260(2): the certificate is signed by a director, auditor and secretary confirming (a) the company is and has at all relevant times been an exempt private company; (b) duly audited FS and reports have been circulated to members; (c) as at the FS date the company appeared able to meet its liabilities as they fall due.
- Confirmed structurally in the taxonomy: the FS-EPC entry point (ssmt-fs-epc_2022-12-31) contains NO financial statements at all. Its only ELRs are [020000] Scope of filing, [110000] Disclosure - Auditors statement, [120000] Disclosure - Certificate of Exempt Private Company, [990000] Axis - Defaults. There is no Statement of Financial Position, no Statement of Profit or Loss, no cash flows, no equity statement in FS-EPC.
- KFI-MPERS (the reduced filing available only after EA2 approval) has these ELRs: [020000] Scope of filing, [110000] Directors Report, [110100] Statement by directors, [110200] Director business review, [120000] Auditors report to members, [210000] SOFP by current/non-current, [220000] SOFP by order of liquidity, [310000] Statement of Profit or Loss, [410000] Statement of Cash Flows, [420000] Statement of Changes in Equity, [430000] Statement of Retained Earnings, [510000] Notes, [990000] Axis - Defaults.
- Audit exemption for private companies (separate instrument, verified from the PD PDF on ssm.com.my): Practice Directive No. 10/2024 dated 16 December 2024, issued under s.20C CCM Act 2001 and s.267(2) CA 2016. A private company qualifies if it meets at least TWO of: (a) annual revenue in the current FY and the immediate past two FYs does not exceed RM3,000,000; (b) total assets in the current SOFP and the immediate past two FYs do not exceed RM3,000,000; (c) employees at end of the current FY and the immediate past two FYs do not exceed 30. Thresholds are phased over three years: Phase 1 (FY commencing 1 Jan 2025 to 31 Dec 2025; submission year from 1 Jan 2026) = RM1,000,000 turnover / RM1,000,000 assets / 10 employees. Phase 2 (FY commencing on or after 1 Jan 2026 to 31 Dec 2026; submission year from 1 Jan 2027) = RM2,000,000 / RM2,000,000 / 20 employees. Phase 3 (FY commencing on or after 1 Jan 2027; submission year from 1 Jan 2028) = RM3,000,000 / RM3,000,000 / 30 employees.
- MBRS was in live production use for MPERS filings during 2025: SSM's own Annual Dialogue 2025 issues paper records stakeholder complaints about system slowness 'especially in filing MBRS FS-MPERS, FS MFRS' during the Extension-of-Time peak period, and confirms auto-registration was introduced for Penyata Tahunan (AR) and Penyata Kewangan (FS) via MBRS.
- Element-naming law in SSMxT (Architecture Â§4.2.5): element id = 'prefix_ElementName' (e.g. ssmt-mpers_BuildingOnFreeholdLand); names follow Label Camel Case Concatenation; abstract organising concepts end in 'Abstract' or 'LineItems'; text blocks end in 'Explanatory'; dimensions end in 'Axis'; hypercubes end in 'Table'; domain members end in 'Member'.
- iXBRL is supported: 'Inline XBRL (iXBRL) can be used to provide filings based on the SSM Taxonomy files' â€” and iXBRL reduces the need for company extensions because untagged human-readable content can ride along in the instance.
- mTool is Windows/Excel only â€” no macOS, no OpenOffice. Supported Microsoft Office versions: 2010, 2013, 2016, 2019, 2021 and 365. This matters for any automation design.
- Lodger/Maker split under MBRS 2.0: a Lodger (Company Secretary, Company Agent, Liquidator, Official Receiver, Other Role) must hold an ACTIVE Practising Certificate under s.241 CA 2016 and must purchase a PKI Digital Certificate via Pos Digicert; a Maker (the corresponding assistant role) prepares and uploads the XBRL file but cannot lodge.

### Line items / taxonomy / categories

- === FS-MPERS [210000] STATEMENT OF FINANCIAL POSITION, BY CURRENT/NON-CURRENT METHOD â€” full presentation tree, read directly from pre_ssmt-fs-mpers_2022-12-31_role-210000.xml ===
- ssmt_StatementOfFinancialPositionLineItems | Statement of financial position [line items]
- NON-CURRENT ASSETS (ifrs-smes_NoncurrentAssetsAbstract):
- ifrs-smes_PropertyPlantAndEquipment | Total property, plant and equipment
- ifrs-smes_InvestmentProperty | Investment properties
- ssmt-mpers_NoncurrentBiologicalAssets | Biological assets
- ifrs-smes_IntangibleAssetsAndGoodwill | Intangible assets
- ssmt-mpers_InvestmentInSubisidiaries | Investments in subsidiaries
- ifrs-smes_InvestmentsInAssociates | Total investments in associates
- ifrs-smes_InvestmentsInJointVentures | Total of investments in joint ventures
- ssmt-mpers_NoncurrentInvestmentsOtherThanInvestmentsAccountedForUsingEquityMethod | Other investments
- ifrs-smes_NoncurrentReceivables | Total trade and other non-current receivables
- ifrs-smes_DeferredTaxAssets | Deferred tax assets
- ssmt-mpers_OtherNoncurrentAssets | Other non-current assets
- ifrs-smes_NoncurrentAssets | Total non-current assets
- CURRENT ASSETS (ifrs-smes_CurrentAssetsAbstract):
- ifrs-smes_InventoriesTotal | Total inventories
- ssmt-mpers_CurrentBiologicalAssets | Biological assets
- ssmt-mpers_CurrentInvestments | Other investments
- ifrs-smes_TradeAndOtherCurrentReceivables | Total trade and other current receivables
- ifrs-smes_CurrentTaxAssetsCurrent | Current tax assets
- ssmt-mpers_CurrentDerivativeFinancialAssets | Derivative financial assets
- ssmt_CashAndBankBalances | Cash and cash equivalents
- ssmt-mpers_OtherCurrentAssets | Other current assets
- ifrs-smes_CurrentAssets | Total current assets
- ifrs-smes_Assets | Total assets
- EQUITY (ifrs-smes_EquityAbstract):
- ifrs-smes_IssuedCapital | Total issued capital
- ifrs-smes_RetainedEarnings | Retained earnings
- ifrs-smes_TreasuryShares | Treasury shares
- ifrs-smes_OtherReserves | Reserves
- ifrs-smes_EquityAttributableToOwnersOfParent | Total equity attributable to owners
- ssmt-mpers_OtherComponentsOfEquity | Equity - other components
- ifrs-smes_NoncontrollingInterests | Non-controlling interests
- ifrs-smes_Equity | Total equity
- NON-CURRENT LIABILITIES (ifrs-smes_NoncurrentLiabilitiesAbstract):
- ssmt-mpers_NoncurrentBorrowings | Loans and borrowings
- ifrs-smes_NoncurrentProvisionsForEmployeeBenefits | Employee benefits
- ifrs-smes_NoncurrentProvisions | Provisions
- ifrs-smes_DeferredTaxLiabilities | Deferred tax liabilities
- ifrs-smes_NoncurrentPayables | Total trade and other non-current payables
- ssmt-mpers_OtherNoncurrentLiabilities | Other non-current liabilities
- ifrs-smes_NoncurrentLiabilities | Total non-current liabilities
- CURRENT LIABILITIES (ifrs-smes_CurrentLiabilitiesAbstract):
- ifrs-smes_ShorttermBorrowings | Loans and borrowings
- ifrs-smes_CurrentProvisionsForEmployeeBenefits | Employee benefits
- ifrs-smes_CurrentProvisions | Provisions
- ifrs-smes_TradeAndOtherCurrentPayables | Total trade and other current payables
- ifrs-smes_CurrentTaxLiabilitiesCurrent | Current tax liabilities
- ssmt-mpers_CurrentDerivativeFinancialLiabilities | Derivative financial liabilities
- ssmt-mpers_OtherCurrentLiabilities | Other current liabilities
- ifrs-smes_CurrentLiabilities | Total current liabilities
- ifrs-smes_Liabilities | Total liabilities
- ifrs-smes_EquityAndLiabilities | Total equity and liabilities
- === FS-MPERS [310000] STATEMENT OF PROFIT OR LOSS, BY FUNCTION OF EXPENSE â€” full tree ===
- ssmt-mpers_StatementOfProfitOrLossLineItems | Statement of profit or loss [line items]
- CONTINUING OPERATIONS (ssmt-mpers_ContinuingOperationsAbstract):
- ifrs-smes_Revenue | Total revenue
- ifrs-smes_CostOfSales | Total cost of sales
- ifrs-smes_GrossProfit | Gross profit
- ifrs-smes_OtherIncome | Total other income
- ssmt-mpers_SellingAndDistributionExpenses | Selling and distribution expenses
- ifrs-smes_AdministrativeExpense | Administrative expenses
- ifrs-smes_ResearchAndDevelopmentExpense | Research and development expense
- ifrs-smes_OtherExpenseByFunction | Other expenses
- ssmt-mpers_ProfitLossFromOperatingActivities | Profit (loss) from operating activities
- ifrs-smes_FinanceIncome | Total finance income
- ifrs-smes_FinanceCosts | Finance costs
- ifrs-smes_ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod | Share of profit (loss) of associates and joint ventures accounted for using equity method
- ifrs-smes_ProfitLossBeforeTax | Profit (loss) before tax, from continuing operations
- ifrs-smes_IncomeTaxExpenseContinuingOperations | Tax expense
- ssmt-mpers_ContributionOfZakat | Contribution to zakat
- ifrs-smes_ProfitLossFromContinuingOperations | Profit (loss) from continuing operations, net
- DISCONTINUED OPERATIONS: ifrs-smes_ProfitLossFromDiscontinuedOperations | Profit (loss) before tax, from discontinued operation
- ifrs-smes_ProfitLoss | Total Profit (Loss)
- ATTRIBUTION: ifrs-smes_ProfitLossAttributableToOwnersOfParent | ssmt-mpers_ProfitLossAttributableToOtherComponentsOfEquity | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
- === FS-MPERS [320000] STATEMENT OF PROFIT OR LOSS, BY NATURE OF EXPENSE â€” differences from the function view ===
- ifrs-smes_Revenue | Total revenue
- ifrs-smes_OtherIncome | Total other income
- ifrs-smes_ChangesInInventoriesOfFinishedGoodsAndWorkInProgress | Decrease (increase) in inventories of finished goods and work in progress
- ifrs-smes_RawMaterialsAndConsumablesUsed | Raw materials and consumables used
- ssmt-mpers_EmployeeBenefitsExpenseByNature | Employee benefits expense
- ifrs-smes_DepreciationAndAmortisationExpense | Depreciation and amortisation expense
- ifrs-smes_OtherExpenseByNature | Total other expenses
- (then identical tail: operating profit, finance income/costs, share of associates/JV, PBT, tax, zakat, PAT, discontinued, attribution)
- === FS-MPERS [210100] SUB-CLASSIFICATION OF ASSETS, LIABILITIES AND EQUITY â€” the granular tier that a ledger must be able to feed (representative sample; ~280 rows in full) ===
- PPE: ssmt-mpers_FreeholdLand | ssmt-mpers_LongtermLeaseholdLand | ssmt-mpers_ShorttermLeaseholdLand | ifrs-smes_Land (Total land)
- PPE: ssmt-mpers_BuildingOnFreeholdLand | ssmt-mpers_BuildingOnLongtermLeaseholdLand | ssmt-mpers_BuildingOnShorttermLeaseholdLand | ssmt-mpers_LeasedProperties | ifrs-smes_Buildings (Total buildings)
- PPE: ifrs-smes_Machinery | ifrs-smes_Vehicles | ssmt-mpers_OfficeEquipmentFixtureAndFittings | ssmt-mpers_PlantAndEquipment | ifrs-smes_ConstructionInProgress (Construction in progress/Asset work-in progress) | ifrs-smes_OtherPropertyPlantAndEquipment
- Investment property: ssmt-mpers_InvestmentPropertyFreeholdLandAndBuilding | ssmt-mpers_InvestmentPropertyLongtermLeaseholdLand | ssmt-mpers_InvestmentPropertyShorttermLeaseholdLand | ssmt-mpers_InvestmentPropertyBuildingUnderConstruction | ssmt-mpers_OtherInvestmentProperty
- Intangibles: ifrs-smes_CopyrightsPatentsAndOtherIndustrialPropertyRightsServiceAndOperatingRights | ifrs-smes_OtherIntangibleAssets | ifrs-smes_Goodwill
- Investments in subsidiaries/associates/JVs each split into: UnquotedSharesNetOfImpairmentLosses | QuotedSharesInMalaysia | QuotedSharesOutsideMalaysia | ShareOfPostAcquisitionProfitsAndReserves (associates & JVs) | OtherInvestments
- Inventories: ssmt-mpers_RawMaterials | ifrs-smes_WorkInProgress | ssmt-mpers_FinishedGoods | ssmt-mpers_SpareParts | ssmt-mpers_OtherInventories
- Trade receivables (current and non-current) split by counterparty: DueFromContractCustomers | DueFromHoldingCompany | DueFromSubsidiaries | DueFromAssociates | DueFromJointVentures | DueFromRelatedParties | Other...TradeReceivables
- Other receivables split into: due-from-related-parties block (holding company, subsidiaries, associates, joint ventures, other related parties) and a non-trade block (PrepaymentAndAccruedIncome, LeaseAndHirePurchaseReceivables, Miscellaneous)
- === KFI-MPERS [210000] â€” the reduced SOFP available only after EA2 approval (totals only, no asset-class detail) ===
- ifrs-smes_NoncurrentAssets | ifrs-smes_CurrentAssets | ifrs-smes_Assets | ifrs-smes_IssuedCapital | ssmt-mpers_RetainedEarnings | ifrs-smes_OtherReserves | ifrs-smes_EquityAttributableToOwnersOfParent | ssmt-mpers_OtherComponentsOfEquity | ifrs-smes_NoncontrollingInterests | ifrs-smes_Equity | ifrs-smes_NoncurrentLiabilities | ifrs-smes_CurrentLiabilities | ifrs-smes_Liabilities | ifrs-smes_EquityAndLiabilities
- === KFI-MPERS [310000] â€” the reduced P&L ===
- ifrs-smes_Revenue | ssmt-mpers_Expenditure (Expenditure) | ifrs-smes_ProfitLossBeforeTax | ifrs-smes_ProfitLoss | ifrs-smes_RevenueFromDividends (Dividend income) | ifrs-smes_ProfitLossAttributableToOwnersOfParent | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
- === FS-EPC [120000] CERTIFICATE OF EXEMPT PRIVATE COMPANY â€” the entire financial content an EPC lodges (no statements at all) ===
- ssmt_DisclosureOfStatusAsAnExemptPrivateCompanyExplanatory | Disclosure of the status as an exempt private company [text block]
- ssmt_DisclosureOnWhetherCompanyIsAndHasAtAllRelevantTimeBeenExemptedPrivateCompany
- ssmt_DisclosureOnWhetherDulyAuditedFinancialStatementsReportsRequiredUnderCompaniesAct2016HasBeenCirculatedToItsMembers
- ssmt_DisclosureOnWhetherAsAtDateToWhichFinancialStatementHasBeenMadeUpAndCompanyAppearedToHaveBeenAbleToMeetItsLiabilitiesAsAndWhenLiabilitiesFallDue
- ssmt_DisclosureOnWhetherAnyDirectorProvidedGuaranteeToGiveFinancialSupportIfTheCompanyInsolvent | ssmt_DisclosureOnTypeOfGuaranteeProvidedByDirector
- ssmt_NameOfDirectorWhoSignedCertificateOfExemptPrivateCompany (+ type and number of identification)
- ssmt_NameOfCompanySecretaryWhoSignedCertificateOfExemptPrivateCompany (+ identification, + ssmt_CompanySecretaryPractisingCertificateNumber)
- ssmt_NameOfTheAuditorWhoSignedCertificateOfExemptPrivateCompany | ssmt_LicenseNumberOfAuditor | ssmt_DateOfExemptPrivateCompanyCertificate
- === FS-MPERS [020000] SCOPE OF FILING â€” the switches that determine which statement layout is required ===
- ssmt_MethodUsedForPreparingStatementOfFinancialPosition (Current/Non-current vs Order of liquidity)
- ssmt_MethodUsedForPreparingStatementOfProfitOrLoss (Function of expense vs Nature of expense)
- ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome (Net of tax vs Before tax)
- ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity
- ssmt_MethodUsedForPreparingStatementOfCashFlows (Direct vs Indirect)
- ssmt_DateOfFinancialStatementsApprovedByBoardOfDirectors | ssmt_DateOfCirculationOfFinancialStatementsAndReportsToMembers | ssmt_DateOfStatutoryDeclaration | ssmt_MSICCode | ssmt_DescriptionOfBusiness

### UNVERIFIED â€” do not encode

- EXACT CONTENT OF EACH MANDATORY PHASE. The live SSM page gives only the announcement titles and dates (27/11/2024 phased-mandatory notice; Phase 2 from 1 March 2025; Phase 3 from 1 June 2025). The per-phase scope â€” which company/document categories fall in Phase 1 vs 2 vs 3 â€” lives in SSM's FAQ SharePoint list at /Pages/FAQ/FAQ-MBRS.aspx, whose REST API returned HTTP 401 (access denied) and whose page body renders client-side. The Bahasa notice PDF (NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf) downloaded successfully but is an IMAGE-ONLY scan with no extractable text layer. Secondary/advisory-firm sources (Crowe, BDO, KPMG, BoardRoom) describe Phase 1 = 1 Dec 2024 unaudited FS under CA 2016, Phase 2 = 1 Mar 2025 audited FS under CA 1965, Phase 3 = 1 Jun 2025 audited FS under CA 2016 â€” I could NOT confirm this split from an SSM page and am not asserting it as verified.
- WHETHER SSMxT_2022v1.0 IS STILL THE OPERATIVE TAXONOMY IN JULY 2026. The live ssm.com.my MBRS page today lists SSMxT 2022 v1.0 as the newest published taxonomy and mTool 2.2 as the current tool, with no announcement newer than 20/5/2025. But mbrs.ssm.com.my returned empty content to the fetcher, so I could not cross-check the portal-side version banner. If SSM has shipped a taxonomy patch or a 2025/2026 refresh only inside mTool 2.2 (rather than as a new published .zip), I would not have seen it. Verify against a live mTool 2.2 install before treating element names as frozen.
- WHETHER THE PUBLISHED BUSINESS RULES WORKBOOK MATCHES WHAT mTool 2.2 ACTUALLY ENFORCES. Business_Rule_MBRS_v2_SSMxT_2022.xlsx is SSM-published and currently linked from the MBRS page, but it is titled for SSMxT 2022 and carries no internal version/date stamp that I located. mTool moved 2.1 -> 2.2 and SSM publishes a separate 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook that I did not open. Rule IDs and mandatory-element lists should be re-confirmed against the tool.
- MFRS-SIDE DETAIL. I dumped the MPERS entry point exhaustively because that is the private-entity case you asked about. I did NOT dump FS-MFRS (6,197 concepts), FS-CLBG, FS-BNM, or FS-FC presentation trees, nor their mandatory-element business rules. Do not assume the MPERS minimum list transfers.
- THE CRITERIA SSM APPLIES WHEN GRANTING EA2. KFI (the reduced filing) is only permitted 'once granted approval for the Application for exemption from filing financial statements in full XBRL format (EA2)'. What SSM actually requires to approve an EA2 is not stated in the FAQ, architecture document, or FS user manual I read. Treat KFI as a discretionary concession, not an elective.
- LATE-LODGEMENT FEE WAIVER STATUS. The SSM FAQ page carries categories 'MBRS 2.0 - Additional Period of Waiver for Late Lodgement Fee of Audited Financial Statements and Reports via MBRS 2.0', 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Disruption Period', and 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Peak Period'. Their contents were not readable (401 on the list API). A secondary source claimed the waiver was extended to 30 November 2025 â€” unverified, and in any case likely expired by July 2026.
- WHETHER A NEWER PRACTICE DIRECTIVE HAS SUPERSEDED PD 10/2024 ON AUDIT EXEMPTION. I verified PD 10/2024 (16 Dec 2024) directly from the PDF on ssm.com.my's Audit Exemption page, and its three-year phase table. I did not exhaustively check the SSM practice-directive index for a 2025/2026 amendment. Note the same page also links a document named 'PART Q (19.5.2026).pdf' which I did not open â€” it may contain a 2026 update relevant to accounts/audit.
- EXACT SEMANTICS OF SOME DUPLICATED NAMES IN THE MANDATORY-ELEMENT LISTS. The SOFP mandatory rule text lists 'Employee benefits', 'Provisions' and 'Loans and borrowings' TWICE each â€” almost certainly once for the non-current tier and once for the current tier, matching the presentation tree. The rule message string itself does not disambiguate, so this is my inference from the tree, not a verified statement by SSM.
- CA 2016 SECTION NUMBERING FOR THE EPC CERTIFICATE. Verified: the certificate power is s.260 (heading 'Duty to lodge certificate relating to exempt private company'), operating 'in lieu of the requirements in paragraph 259(1)(a)'. Some secondary sources cite '259(4)' for this â€” that appears to be wrong; s.259(4) is the definitional subsection about consolidated statements. I read this from the Act PDF hosted on ssm.com.my (Act 777, 15 Sep 2016 print). I did NOT check whether the Companies (Amendment) Act 2024 altered ss.259-260; SSM's site lists that amendment act separately.
- DEFINITION OF 'EXEMPT PRIVATE COMPANY' AND WHETHER AN EPC CAN ALSO CLAIM AUDIT EXEMPTION. The s.2 definition of 'exempt private company' and any interaction between the EPC certificate route and PD 10/2024 audit exemption were not read. A secondary source stated an EPC cannot elect audit exemption if it lodges an EPC certificate (because s.260(2)(b) requires 'duly audited financial statements ... circulated to its members') â€” the statutory text I read is consistent with that reading, but I did not find an SSM statement confirming it.
- TOTAL SIZE OF THE MPERS SUB-CLASSIFICATION TIER. I extracted ~280 tree rows for [210100] and sampled them; I did not enumerate every leaf. Anyone building a mapping table should regenerate the full tree from the taxonomy package rather than relying on the sample here.
- WHETHER THE 'NO CHART OF ACCOUNTS' FINDING HOLDS BEYOND THE DOCUMENTS I SEARCHED. The zero-hit search covered the SSMxT 2022 Architecture Document, MBRS FAQ v2.4, the mTool 2.2 FS-CA2016 User Manual, SSM's MBRS 2.0 overview deck, the live MBRS page, and all 1,633 taxonomy filenames. It did not cover SSM training-partner course materials, the mPortal user manual, or the mTool binary itself. The finding is strong but is an absence-of-evidence result over that document set.

### Sources

- https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/SSMxT2022_Architecture_Document.pdf
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/FAQs_Malaysian_Business_Reporting_System_MBRS.pdf
- https://ssm4u.com.my/files/MBRS/SSMxT_2022v1.zip
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/Business_Rule_MBRS_v2_SSMxT_2022.xlsx
- https://www.ssm.com.my/bm/Pages/Register_Business_Company_LLP/Company/document/MBRS_v2_Summary_Sheet.pdf
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
- https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/User_manual_mTool_v2_FS2016.pdf
- https://www.ssm.com.my/Pages/FAQ/FAQ-MBRS.aspx
- https://www.ssm.com.my/bm/Pages/Services/Other-Services/xbrl%20document/NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf
- https://www.ssm.com.my/Pages/Publication/PDF%20Files/ISU-ISU_DIALOG_TAHUNAN_SSM_2025_ALL_WEBSITE.pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Audit-Exemption.aspx
- https://www.ssm.com.my/Pages/Legal_Framework/Document/NEW%20PD%2010-2024%20-%20Qualifying%20Criteria%20for%20Audit%20Exemption%20for%20Certain%20Categories%20of%20Private%20Companies%20(Portal).pdf
- https://www.ssm.com.my/Pages/Legal_Framework/Companies%20-Act%20-1965-(Repealed)/aktabi_20160915_companiesact2016act777_0.pdf
- https://mbrs.ssm.com.my/

## LHDN / RMCD (tax, SST, e-invoice)

### Authority

WHAT THESE SOURCES MANDATE:

(1) LHDN / Income Tax Act 1967 â€” Form C is a legally required return under s.77A ITA 1967, filed within 7 months of financial year-end, e-filing mandatory. The binding constraint on ledger structure is the **"FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)" appendix (working sheet HK-FIC, Item G17 attachment)** to Form C: a fixed 59-numbered-item taxonomy covering Statement of Profit or Loss (items 1â€“31) and Statement of Financial Position (items 32â€“59). A company MUST be able to populate every one of those 59 boxes from its ledger. This is a *reporting/mapping* mandate, not a mandate that the general ledger literally use these account names â€” but a default CoA that cannot roll up cleanly into these 59 items will force manual rework every year. Separately, s.39(1) ITA 1967 makes specific expense classes non-deductible, so the ledger must SEGREGATE them (they cannot be buried in "Other expenditure" item 28) to support the tax computation and the s.1.3 documentation/onus-of-proof requirement.

(2) RMCD / MySST â€” Sales Tax Act 2018 and Service Tax Act 2018 mandate registration at prescribed thresholds and charging at prescribed rates. Critically for the CoA: Malaysian SST is a **single-stage tax** with **NO input-tax-credit mechanism** (unlike the repealed GST). This means a registered person needs an **output-tax liability account only**; sales/service tax borne on purchases is NOT recoverable and must be **capitalised into the cost of the expense/asset**, not parked in a recoverable-input-tax asset account. Sales tax and service tax are also accounted on DIFFERENT bases (sales tax = accrual/on sale; service tax = payment basis), so they cannot share one control account. There is no mandate on account naming.

(3) LHDN e-Invoice / MyInvois â€” mandates issuance of structured XML/JSON e-Invoices per a phased timeline, with a per-line-item "Classification" field (3-digit code from IRBM's catalogue) plus supplier MSIC code and SST registration number. It mandates a **document-level classification taxonomy**, NOT a chart of accounts. It does not prescribe ledger accounts â€” but a practical CoA benefits from being mappable to the IRBM classification catalogue, and the e-Invoice FAQ explicitly says tax deductions may still be claimed on existing documentation "until such time the legislation has been amended."

(4) Payroll statutes â€” EPF (Act 452), SOCSO/PERKESO (Act 4), EIS (Act 800), HRD Corp levy (PSMB Act 2001), and MTD/PCB (ITA 1967) are each imposed by a SEPARATE statute, remitted to a DIFFERENT authority (KWSP, PERKESO, PERKESO, HRD Corp, LHDN), on different computation bases and different forms. Each therefore REQUIRES its own distinct liability/payable account â€” they cannot be pooled into one "statutory payables" account without losing the ability to reconcile and remit. Note also ITA s.34(4): employer contributions to an approved scheme are non-deductible to the extent they exceed 19% of the employee's remuneration, which requires employer-contribution expense to be tracked separately from gross wages.

WHAT THEY DO NOT MANDATE: no source prescribes account codes, account numbering, a specific CoA structure, or an accounting standard (MFRS/MPERS presentation comes from MASB and the Companies Act 2016, not from LHDN/RMCD). Form C is a mapping target, not a ledger schema.

### Verified facts

- FORM C: The current published company return is 'Form C 2025' (CP5 - Pin. 2025), 'SAMPLE COMPANY RETURN FORM FOR YEAR OF ASSESSMENT 2025', downloaded live from https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf (31 pages). Accompanying 'Company Return Form Guidebook 2025 Self Assessment System' at https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf (220 pages).
- FORM C structure verified verbatim: PART A (Statutory Income, Total Income and Chargeable Income, items A1-A20); PART B (Tax Payable/Repayable, B1-B13); PART C (Capital Allowances and Charges under Schedule 3, Reinvestment Allowance under Schedule 7A, Investment Allowance for Service Sector under Schedule 7B); PART D (Incentive Claim); PART F (Tax Remission Claim); PART G (Particulars incl. item G17 Financial particulars of company); PART H (Other Particulars); PART J; PART K (Tax Agent).
- FORM C Part A confirms the income-source taxonomy a company must report: A1 'Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia'; A2 same from outside Malaysia received in Malaysia; A6 'Aggregate of other statutory income from sources in Malaysia ... - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)'; A7 same from outside Malaysia incl. capital gains. So the ledger must distinguish business income from dividends / interest / discounts / rents / royalties / premiums separately.
- FORM C Part A tax-computation adjustment lines verified: A4 'LESS: Business losses brought forward (Restricted to A3)'; A10 'Current year business losses'; A11 'Prospecting expenditure under schedule 4/pre-operational business expenditure under schedule 4B/permitted expenses under section 60F or 60H'; A12 'Approved donations/gifts/contributions'; A13 'Zakat perniagaan (Restricted to 2.5% of A9)'; A15 'Claim for loss under Group Relief provision'; A17 'TAXABLE PIONEER INCOME'.
- FORM C Part B confirms the corporate tax rate bands in use for YA2025 as apportionment rows: 15, 17 and 24 (percent). Also B5 'Section 6D rebate (Up to RM20,000, restricted to B3)'.
- FORM C GUIDEBOOK 2025 paragraph 1.2.3 'Non-allowable Expenses' lists verbatim by legal provision: 33(2) Interest not deductible against business income; 34(4) Contribution to an approved scheme in excess of 19% of the employee's remuneration; 39(1)(a) Any form of private or domestic expenses; 39(1)(b) disbursements/expenses not wholly and exclusively laid out for producing gross income; 39(1)(c) capital withdrawn; 39(1)(d) Payment to any unapproved provident fund; 39(1)(e) qualifying mining/agriculture-forest/prospecting expenditure; 39(1)(f) Interest or royalty paid to non-residents without complying with section 109; 39(1)(g) payment for licence/permit to extract timber other than to a State Government; 39(1)(i) Contract payment made without complying with section 107A; 39(1)(j) Payment made to non-residents without complying with section 109B; 39(1)(k) Payment exceeding RM100,000 for rental of non-commercial motor vehicle; 39(1)(l) Entertainment; 39(1)(m) Expenditure incurred on leave passage for employee within or outside Malaysia; 39(1)(q) Payment made to non-residents without complying with section 109A; 39(1)(r) Payment made by a resident person to a Labuan company; 39(1)(s) Payments in cash to agents/dealers/distributors without complying with section 107D.
- FORM C GUIDEBOOK 2025 examples under 39(1)(b) verbatim: 'Expenses incurred in the printing and distribution of annual reports and costs of holding annual general meetings and extraordinary meetings'; 'Stock exchange listing expenses'; 'Pre-commencement or cessation of business expenses'; 'Legal expenses in connection with the acquisition of assets or private matters'; 'Donations'; 'Fines for violation of law including fines and expenses relating to income tax appeals'; 'Gifts (except for own employees)'; 'Club membership (entrance) fees and private club membership subscriptions'; 'Payment for loan and agency agreements'; 'Purchase of assets and similar expenses'.
- FORM C GUIDEBOOK 2025 additional non-allowable items listed without a section number, verbatim: 'All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts'; 'Expenditure relating to changes in the authorised capital and paid-up capital'; 'Professional fees related to the acquisition of fixed assets or investments'; 'Renovations and improvements to buildings'. This CONFIRMS that general provisions are non-deductible while SPECIFIC provisions for doubtful debts are deductible â€” so the ledger must split general vs specific provision.
- FORM C GUIDEBOOK 2025 confirms depreciation is replaced by capital allowances: Part C of Form C claims 'CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3'; the guidebook's adjustment worksheet gives 'Non-allowable expenses/charges - according to subsection 39(1) and other sections' with worked example 'Entertainment RM10,000 / Income tax penalty RM1,000'. Accounting depreciation is added back and Schedule 3 capital allowances claimed instead.
- FORM C GUIDEBOOK 2025 section 1.3 mandates documentation retention: 'Documents, records and other written evidence must be properly kept as the onus-of-proof is on the individual who makes the claim/adjustment. Any claim/adjustment not supported by sufficient documentation shall be disallowed in the event of a tax audit and penalty may be imposed.' Required support includes 'An analysis of income and expenditure', 'Subsidiary accounts', 'Receipts/Invoices'.
- FORM C also requires separately disclosed data for: contract/subcontract payments, commissions and rents to residents; contract payments to non-residents (s.107A); management fees to residents; professional/technical/management fees and rents to non-residents (s.4A income); expenses charged or allocated by parent company to subsidiary or headquarters to branch in Malaysia; overseas trips; transfer pricing; leasing. Each implies a separately identifiable ledger account.
- SST â€” GST REPEALED: The RMCD General Guide on Sales Tax (Panduan Umum Cukai Jualan, Ver 4) confirms the GST (CBP) transition: the final GST-03 return for the last taxable period was due within 120 days of 1 September 2018, and 'Apa-apa tuntutan cukai input di bawah Akta CBP 2014 yang dimansuhkan yang belum dituntut sebelum 1 September 2018 boleh dituntut dalam penyata GST-03 dan tuntutan itu adalah dianggap sebagai tuntutan akhir bagi semua cukai input' (any input tax claim under the repealed GST Act 2014 not yet claimed before 1 Sept 2018 may be claimed in the GST-03 return and that claim is deemed the FINAL claim for all input tax). No input-tax-credit mechanism exists under SST.
- SST â€” SINGLE STAGE: mysst.customs.gov.my/understanding-sst/ defines Sales Tax verbatim as 'A single stage tax levied on imported and locally manufactured goods, either at the time of importation or at the time the goods are sold or otherwise disposed of by the manufacturer' and Service Tax as 'a tax charged and levied on taxable services provided by any taxable person in Malaysia in the course and furtherance of business.'
- SST â€” TAXABLE PERIOD: 'The standard taxable period for SST (both Sales and Service Tax) is bimonthly (once every two months).' (mysst.customs.gov.my/understanding-sst/)
- SST â€” ACCOUNTING BASIS DIFFERS BY TAX (mysst.customs.gov.my/accounting-sst/): Sales Tax is accounted on an ACCRUAL basis â€” 'at the time when the goods are sold, disposed or first used'. Service Tax is accounted on a PAYMENT basis â€” 'at the time when the payments is received', or on 'the day following period of twelve month when any whole or part of the payment is not received from the date of the invoice for the taxable service provided' (i.e. the 12-month deemed-collection rule).
- SALES TAX REGISTRATION THRESHOLD (mysst.customs.gov.my/registering-business/): 'SALES VALUE OF TAXABLE GOODS has exceeded RM500,000 for 12 months period' and 'Manufacturers who carry out sub-contract work on taxable goods where the VALUE of work performed exceeds RM500,000 for 12 months period.' Turnover determined by Historical Method (that month + 11 preceding) or Future Method (that month + 11 succeeding).
- SALES TAX RATES from 1 July 2025 (mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/): 'The new sales tax rate change takes effect on 1 July 2025.' Structure verbatim: 'i. the rate of 5% and specific rates can be referred to under the Sales Tax (Rate of Tax) Order 2025. ii. the exempted goods can be referred to under the Sales Tax (Goods Exempted from Tax) Order 2025. If the goods are not listed in either of the above orders, the tax rate on the goods is subject to 10%.' So: exempt / 5% (or specific) / 10% default.
- SERVICE TAX RATE (mysst.customs.gov.my/registering-business/, Service Tax tab): 'Rate of tax is amended to :- 6% (1 Sept 2018 - 29 Feb 2024); 8% (Start 1 Mac 2024) except F&B, Parking, Logistic & Telecommunications - 6%'. This CONFIRMS the 6%->8% change effective 1 March 2024 with a 6% carve-out for F&B, parking, logistics and telecommunications. Credit/charge cards: 'A specific rate of tax of RM 25 is imposed upon issuance of principal or supplementary card and every subsequent year or part thereof.'
- SERVICE TAX GROUP THRESHOLDS pre-expansion (mysst.customs.gov.my/registering-business/): Group A RM 500,000.00; Group B (F&B) RM 1,500,000.00; Group C RM 500,000.00; Group D RM 500,000.00; Group E RM 500,000.00; Group F RM 500,000.00; Group G RM 500,000.00; Group H 'No Threshold'; Group I RM 500,000.00; Group J RM 500,000.00 (with one 'No Threshold' sub-item).
- SERVICE TAX EXPANSION EFFECTIVE 1 JULY 2025 (mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/) â€” verified per-category rate and threshold: RENTAL OR LEASING: 'The effective date for the implementation of service tax on rental or leasing services is 1 July 2025', 'The threshold value for rental or leasing services is RM500,000.00', 'The tax rate for rental or leasing services is 8%'. Residential property rental is NOT subject to service tax (worked example: warehouse rental RM20,000 x 8% = RM1,600, residential RM1,500 not taxed).
- SERVICE TAX EXPANSION â€” CONSTRUCTION: 'Construction work services are subject to a 6% service tax rate', threshold 'RM1,500,000', under 'Group L, First Schedule, Service Tax Regulations 2018 - Construction Work Services'. Worked example: contract value RM6,000,000, 'The service tax imposed is RM360,000 (RM6,000,000 x 6%)'. EPCC projects are included.
- SERVICE TAX EXPANSION â€” HEALTHCARE: 'Private healthcare services, practice of traditional and complementary medicine private services and private allied health related services will be subject to service tax at a rate of 6%', threshold 'RM1,500,000.00 in 12 months period'; TCM falls under 'Item 15, Group I'. Effective date 1 July 2025.
- SERVICE TAX EXPANSION â€” EDUCATION: 'Education services are subject to a service tax rate of 6%', effective 1 July 2025, applying to 'private educational institution registered under the Education Act 1996 excluding special schools and language centres' that 'charge fees exceeding RM60,000 per student for each academic year' (covers private kindergartens, academic and religious primary/secondary schools, international schools, expatriate schools and Chinese private secondary schools).
- SERVICE TAX EXPANSION â€” FINANCIAL SERVICES: 'Any financial service provider whose taxable services exceed the RM500,000 threshold must register under the Service Tax Act 2018'. Group H group-relief provisions apply intra-group.
- SERVICE TAX EXPANSION â€” BEAUTY: the live official FAQ states 'The service tax rate imposed on beauty treatment services provided to citizens and non-citizens is a flat rate of 8%' and 'The registration requirement for beauty treatment services is when the total value of taxable services has reach RM500,000 in 12 months period.'
- MOF PRESS RELEASE (mof.gov.my, 'Targeted Revision Of Sales Tax Rate And Expansion Of Service Tax Scope Effective 1 July 2025') confirms at policy level: 'Sales Tax rate remains unchanged for essential goods consumed by the public; Sales Tax at rates of 5% or 10% will apply to discretionary and non-essential goods', and the service tax scope expands to 'leasing or rental, construction, financial services, private healthcare, education, and beauty services.'
- MySST publishes Service Tax Policy Nos. 1/2026, 2/2026, 3/2026 and 4/2026 (list at mysst.customs.gov.my/service-tax-policy/), plus Sales Tax Policy documents â€” confirming ongoing 2026 policy amendments to the SST regime. Site 'Last Updated: 19/07/2026'.
- E-INVOICE MANDATE TIMELINE â€” verified verbatim from the official 'IMPLEMENTATION OF E-INVOICE IN MALAYSIA FREQUENTLY ASKED QUESTIONS (FAQs) (UPDATED ON 5 MAY 2026)' at https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf â€” table 'Targeted Taxpayers / Implementation Date': annual turnover or revenue more than RM100 million -> 1 August 2024; more than RM25 million and up to RM100 million -> 1 January 2025; more than RM5 million and up to RM25 million -> 1 July 2025; up to RM5 million -> 1 January 2026.
- E-INVOICE â€” thresholds are measured 'according to annual turnover or revenue thresholds as stated in the statement of comprehensive income in the Financial Year 2022 Audited Financial Statements.' Enforcement/penalty for the >RM100 million cohort only began 1 October 2024 per Income Tax (Issuance of Electronic Invoice) Rules 2024 [P.U. (A) 265] gazetted 30 September 2024.
- E-INVOICE â€” MSME EXEMPTION AND THE 1 JULY 2026 CONCESSIONARY DATE: 'the Government of Malaysia has exempted taxpayers with annual turnover or revenue below RM1 million from the issuance of e-Invoice' (including self-billed e-Invoice). The exemption does NOT apply where: '(a) taxpayer with non-individual shareholder(s) (or equivalent) with annual turnover or revenue of at least RM1 million; or (b) taxpayer is a subsidiary of a holding company with annual turnover or revenue of at least RM1 million; or (c) taxpayer has related company / joint venture with annual turnover or revenue of at least RM1 million.' Taxpayers reaching RM1 million in YA2023/2024/2025 must implement from 1 July 2026 (the 'concessionary e-Invoice implementation date'). From YA2026 onwards the rule is '1 January in the second year following the YA in which the total annual turnover or revenue reaches RM1 million.'
- E-INVOICE â€” FORMAT AND MODEL: 'The e-Invoice must be generated in the form of XML or JSON file format' (not PDF/JPG). Two transmission mechanisms: MyInvois Portal and API. 'The e-Invoice model in Malaysia adopts the Continuous Transaction Control (CTC) Model'. Consolidated e-Invoice must be issued 'within seven (7) calendar days after the month end'. Self-billed e-Invoice for importation of goods due 'latest by the end of the second month following the month' of importation.
- E-INVOICE â€” CLASSIFICATION REQUIREMENT (from IRBM e-Invoice Specific Guideline VERSION 4.8, https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf): data field no. 9 is 'Classification' = 'Classification of product or services', with the instruction to input 'a 3-digit integer (e.g., "000" to "999"), in accordance with the catalogue set by IRBM'. Related fields include no. 6 'Supplier's SST Registration Number' and no. 7 "Supplier's Malaysia Standard Industrial Classification (MSIC code)". So classification is at LINE-ITEM level, using IRBM's own catalogue, and is independent of the general ledger account.
- E-INVOICE â€” the IRBM classification catalogue (https://sdk.myinvois.hasil.gov.my/codes/classification-codes/) contains 45 codes numbered 001 to 045, ranging from '001 Breastfeeding equipment' to '045 Self-billed - Non-monetary payment to agents, dealers or distributors'. This is a transaction-type/product catalogue, NOT an accounting chart of accounts.
- E-INVOICE â€” no industry is exempt: 'Currently, there are no industries that are exempted from the e-Invoice implementation.' And deductions are unaffected for now: 'Yes, taxpayers can continue to claim tax deductions or personal tax relief using existing documentation until such time the legislation has been amended.'
- PAYROLL â€” SOCSO/PERKESO wage ceiling: 'Effective 1 October 2024, PERKESO will enforce a new wage ceiling for contributions from RM5,000 to RM6,000 per month' (perkeso.gov.my rate-of-contribution and kadar-caruman pages).
- PAYROLL â€” SOCSO contribution is a BRACKET TABLE, not a flat percentage. Verified from the official PERKESO PDF 'EMPLOYEES' SOCIAL SECURITY ACT 1969 (ACT 4): NEW CONTRIBUTION RATE INCLUDING THE NON-EMPLOYMENT INJURY SECURITY SCHEME (SKBBK)' (https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf, 8 pages, 65 wage brackets). Columns are FIRST CATEGORY (Employment Injury Scheme, Invalidity Scheme and Non-Employment Injury Scheme) with EMPLOYER SHARE and EMPLOYEE SHARE split into INVALIDITY and NON-EMPLOYMENT INJURY sub-columns; and SECOND CATEGORY (Employment Injury Scheme and Non-Employment Injury Scheme). Top bracket 65 'Where wages exceed RM6,000': First Category employer RM104.15, employee invalidity RM29.75 + non-employment injury RM44.65, total RM178.55; Second Category employer RM74.40, employee RM44.65, total RM119.05.
- PAYROLL â€” a NEW third SOCSO component now exists: the Non-Employment Injury Security Scheme / Skim Kemalangan Bukan Bencana Kerja (SKBBK), branded LINDUNG 24 JAM, appearing as its own column in PERKESO's official current contribution table. It is an EMPLOYEE-borne component distinct from the Employment Injury and Invalidity schemes, requiring its own payroll line and payable tracking.
- PAYROLL â€” PERKESO administers separately-legislated schemes: Employees' Social Security Act 1969 (Act 4) for Employment Injury + Invalidity + SKBBK, and the Employment Insurance System Act 2017 (Act 800) for EIS. PERKESO publishes two distinct rate documents, 'Contribution Rate of Act 4' and 'Contribution Rate of Act 800', confirming SOCSO and EIS are computed and remitted as separate items.
- PAYROLL â€” HRD CORP LEVY (official HRD Corp support centre, https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy): governed by 'Section 2, 14, and 15 of the PSMB Act 2001'. Formula verbatim: 'LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1%'. Standard rate 1% of monthly wages; reduced rate '0.5% of the monthly wages' for employers below the mandatory employee threshold. Levy base INCLUDES basic salary and fixed allowance, leave pay and wage arrears; EXCLUDES bonuses, gratuity, travel allowances, apprenticeship payments, overtime and shift differentials. Payment due 'within 15 days of the following month'; later payments are classified as arrears.
- PAYROLL â€” MTD/PCB: LHDN operates 'Monthly Tax Deduction (MTD)' / 'Potongan Cukai Bulanan (PCB)' with an official 'SPECIFICATION FOR MONTHLY TAX DEDUCTION (MTD)' computerised-calculation specification published annually on hasil.gov.my, plus the e-CP39 / e-PCB / e-Data PCB submission channels and Form CP39. MTD is an employee-borne income tax withholding remitted by the employer to LHDN â€” structurally different from EPF/SOCSO/EIS/HRD (which involve employer cost), so it must sit in its own payable account.
- PAYROLL â€” LHDN link back to the ledger: ITA s.34(4) makes 'Contribution to an approved scheme in excess of 19% of the employee's remuneration' non-allowable, and s.39(1)(d) disallows 'Payment to any unapproved provident fund'. This confirms employer EPF contributions must be tracked as a distinct expense line measurable against employee remuneration.

### Line items / taxonomy / categories

- === LHDN FORM C â€” 'FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)' (working sheet HK-FIC, Item G17 attachment). THIS IS THE AUTHORITATIVE 59-ITEM PRESENTATION TAXONOMY A MALAYSIAN SDN BHD LEDGER MUST ROLL UP INTO ===
- 1 Business code
- 2 Type of business activity
- --- STATEMENT OF PROFIT OR LOSS ---
- 3 Sales / turnover
- LESS:
- 4 Opening inventory
- 5 Cost of purchases
- 6 Cost of production
- 7 Closing inventory
- 8 Cost of sales (4 + 5 + 6 - 7)
- 9 GROSS PROFIT/LOSS (3 - 8)
- 10 Foreign currency exchange gain
- 11 Other business income
- 12 Other income
- 13 Non-taxable profits
- EXPENDITURE:
- 14 Interest
- 15 Professional, technical, management and legal fees
- 16 Technical fee payments to non-resident receipients
- 17 Contract payments
- 18 Directors' fee
- 19 Salaries and wages
- 20 Cost of Employee Share Options
- 21 Royalties
- 22 Rental/lease
- 23 Maintenance and repairs
- 24 Research and development
- 25 Promotion and advertisement
- 26 Travelling and accommodation
- 27 Foreign currency exchange loss
- 28 Other expenditure
- 29 TOTAL EXPENDITURE (14 to 28)
- 30 NET PROFIT/LOSS
- 31 Non-allowable expenses
- --- STATEMENT OF FINANCIAL POSITION / NON-CURRENT ASSETS ---
- 32 Motor vehicles
- 33 Plant and equipment
- 34 Land and buildings
- 35 Other non-current assets
- 36 TOTAL NON-CURRENT ASSETS (32 to 35)
- 37 Total cost of non-current assets acquired in the basis period
- 38 Investments
- --- CURRENT ASSETS ---
- 39 Trade debtors
- 40 Other debtors
- 41 Inventory
- 42 Loans to directors
- 43 Cash in hand and cash at bank
- 44 Other current assets
- 45 TOTAL CURRENT ASSETS (39 to 44)
- 46 TOTAL ASSETS (36 + 38 + 45)
- --- LIABILITIES AND OWNERS' EQUITY / CURRENT LIABILITIES ---
- 47 Loans and bank overdrafts
- 48 Trade creditors
- 49 Other creditors
- 50 Loans from directors
- 51 Other current liabilities
- 52 TOTAL CURRENT LIABILITIES (47 to 51)
- 53 Non-current liabilities
- 54 TOTAL LIABILITIES (52 + 53)
- --- SHAREHOLDERS' EQUITY ---
- 55 Issued and fully paid-up capital
- 56 Profit and loss appropriation account
- 57 Reserve account
- 58 TOTAL EQUITY (55 + 56 + 57)
- 59 TOTAL LIABILITIES AND EQUITY (54 + 58)
- === FORM C PART A â€” INCOME SOURCES AND TAX-COMPUTATION ADJUSTMENTS (ledger must segregate these) ===
- A1 Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia
- A2 Aggregate statutory income from sources of business(es) and partnership(s) outside Malaysia received in Malaysia
- A4 LESS: Business losses brought forward (Restricted to A3)
- A6 Aggregate of other statutory income from sources in Malaysia - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)
- A7 Aggregate of other statutory income from sources outside Malaysia received in Malaysia - Dividends, interest, discounts, rents, royalties, premiums, capital gains and other income
- A10 LESS: Current year business losses (Restricted to A9)
- A11 Prospecting expenditure under schedule 4 / pre-operational business expenditure under schedule 4B / permitted expenses under section 60F or 60H
- A12 Approved donations/gifts/contributions
- A13 Zakat perniagaan (Restricted to 2.5% of A9)
- A15 LESS: Claim for loss under Group Relief provision
- A17 TAXABLE PIONEER INCOME
- PART C: CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3, REINVESTMENT ALLOWANCE UNDER SCHEDULE 7A AND INVESTMENT ALLOWANCE FOR SERVICE SECTOR UNDER SCHEDULE 7B
- C1b Total accelerated capital allowance (if relevant)
- C2 Claim for industrial building allowance under subparagraph 42(1) Schedule 3
- === NON-DEDUCTIBLE / ADD-BACK CATEGORIES (Form C Guidebook 2025, para 1.2.3) â€” each needs its own ledger account so it is not buried in item 28 'Other expenditure' ===
- Entertainment [ITA 39(1)(l)]
- Donations [39(1)(b) example] â€” note approved donations are claimed separately at Form C item A12, so approved vs non-approved donations need separate accounts
- Gifts (except for own employees) [39(1)(b) example]
- Fines for violation of law including fines and expenses relating to income tax appeals [39(1)(b) example]
- Depreciation â€” added back; relief given instead as Schedule 3 capital allowances (Form C Part C)
- All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts
- Specific provision for doubtful debts â€” DEDUCTIBLE (must be split from general provision)
- Any form of private or domestic expenses [39(1)(a)]
- Leave passage for employee within or outside Malaysia [39(1)(m)]
- Payment exceeding RM100,000 for rental of non-commercial motor vehicle [39(1)(k)]
- Interest not deductible against business income [33(2)]
- Contribution to an approved scheme in excess of 19% of the employee's remuneration [34(4)]
- Payment to any unapproved provident fund [39(1)(d)]
- Withholding-tax-failure disallowances: interest/royalty to non-residents without s.109 [39(1)(f)]; contract payment without s.107A [39(1)(i)]; payment to non-residents without s.109B [39(1)(j)]; without s.109A [39(1)(q)]; cash payments to resident agents/dealers/distributors without s.107D [39(1)(s)]
- Payment made by a resident person to a Labuan company [39(1)(r)]
- Annual report printing/distribution and AGM/EGM costs [39(1)(b) example]
- Stock exchange listing expenses [39(1)(b) example]
- Pre-commencement or cessation of business expenses [39(1)(b) example]
- Legal expenses in connection with the acquisition of assets or private matters [39(1)(b) example]
- Club membership (entrance) fees and private club membership subscriptions [39(1)(b) example]
- Expenditure relating to changes in the authorised capital and paid-up capital
- Professional fees related to the acquisition of fixed assets or investments
- Renovations and improvements to buildings (capital, not repairs â€” must be split from item 23 'Maintenance and repairs')
- Capital withdrawn or sum employed as capital [39(1)(c)]
- === SST LEDGER ACCOUNTS REQUIRED (SST is single-stage, NO input tax credit) ===
- Sales Tax Payable (output) â€” accrual basis, recognised when goods are sold, disposed or first used; rates exempt / 5% (or specific) / 10% default under the Sales Tax (Rate of Tax) Order 2025 and Sales Tax (Goods Exempted from Tax) Order 2025
- Service Tax Payable (output) â€” PAYMENT basis, recognised when payment is received, with a 12-month deemed-collection trigger from invoice date; needs rate segregation 8% vs 6%
- Service Tax Payable â€” 6% subset (F&B, parking, logistics, telecommunications; plus post-1-July-2025 construction, private healthcare/TCM/allied health, and education)
- Service Tax Payable â€” 8% subset (general taxable services; plus rental or leasing, and beauty treatment)
- Service Tax Payable â€” credit/charge cards at the specific rate of RM25 per principal/supplementary card per year
- Imported Taxable Services â€” service tax self-accounted by the recipient (MySST maintains a separate 'Non-Registrant: Imported Service' registration channel)
- NO 'Input Tax Recoverable' / 'SST Receivable' account â€” sales tax and service tax borne on purchases are NOT creditable and must be capitalised into the cost of the expense or asset
- Sales Tax Exemption tracking (Schedule A / B / C exemption certificates; registered manufacturers may buy raw materials, components, packing and packaging materials, manufacturing aids and cleanroom equipment exempt under the Sales Tax (Persons Exempted from Payment of Tax) Order 2018)
- === STATUTORY PAYROLL PAYABLES â€” each a SEPARATE payable (different statute, authority, form and basis) ===
- EPF / KWSP Payable (Employees Provident Fund Act 1991) â€” split employer contribution (expense) vs employee contribution (deduction from wages); s.34(4) ITA caps deductibility at 19% of remuneration
- SOCSO / PERKESO Payable â€” Employees' Social Security Act 1969 (Act 4); bracket table not a flat %; wage ceiling RM6,000/month from 1 October 2024; First Category (Employment Injury + Invalidity + SKBBK) vs Second Category (Employment Injury + SKBBK)
- SOCSO â€” Non-Employment Injury Security Scheme (SKBBK / Skim Kemalangan Bukan Bencana Kerja, 'LINDUNG 24 JAM') â€” new employee-borne component with its own column in PERKESO's official contribution table
- EIS / SIP Payable (Employment Insurance System Act 2017, Act 800) â€” administered by PERKESO but a separate Act and a separate published rate document from Act 4
- HRD Corp Levy Payable (PSMB Act 2001, ss. 2, 14, 15) â€” LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1% (or 0.5% reduced rate); employer-only cost; due within 15 days of the following month
- MTD / PCB Payable (Potongan Cukai Bulanan, ITA 1967) â€” employee income tax withheld and remitted to LHDN via e-PCB / e-Data PCB / e-CP39, Form CP39; employee-borne, not an employer cost
- Zakat perniagaan payable (if applicable) â€” claimed at Form C item A13, restricted to 2.5% of aggregate income
- === E-INVOICE / MyInvois FIELDS THAT TOUCH THE LEDGER (classification is line-item level, not account level) ===
- Classification â€” 3-digit integer '000' to '999' from the IRBM catalogue (45 codes currently, 001 'Breastfeeding equipment' to 045 'Self-billed - Non-monetary payment to agents, dealers or distributors')
- Supplier's SST Registration Number
- Supplier's Malaysia Standard Industrial Classification (MSIC code)
- Description of Product / Services

### UNVERIFIED â€” do not encode

- EPF (KWSP) CONTRIBUTION PERCENTAGES â€” NOT VERIFIED. kwsp.gov.my returned HTTP 403 Forbidden to every attempt (the mandatory-contribution page, the EPF Act 1991 Third Schedule page, and the Third Schedule PDF), both via WebFetch and via curl with full browser headers. The commonly cited figures (employer 13% for wages up to RM5,000 and 12% above RM5,000; employee 11%; reduced rates for age 60+; 2% employer / 2% employee for foreign workers from October 2025) appear only in third-party blogs and MUST NOT be treated as verified. Retrieve the EPF Act 1991 Third Schedule directly before encoding any EPF rate.
- SOCSO FLAT PERCENTAGES (1.75% employer / 0.5% employee) â€” NOT VERIFIED as stated percentages. The official PERKESO document is a 65-bracket RM table, not a percentage schedule. Deriving 1.75%/0.5% from the top bracket is approximate (employer RM104.15 / RM6,000 = 1.736%). Any implementation should use the official bracket table, not a percentage.
- EIS (Act 800) RATES â€” NOT VERIFIED. The official PERKESO PDF '151124-Rate Contribution ACT 800.pdf' was retrieved but contained no extractable text layer (0 characters â€” likely a scanned image). The commonly cited 0.2% employer / 0.2% employee split on a RM6,000 ceiling comes only from blogs.
- SKBBK EFFECTIVE DATE â€” NOT VERIFIED from an official page. The scheme's existence and rate columns ARE confirmed from PERKESO's own PDF, but the widely reported commencement of 1 June 2026, the reported 0.75% employee contribution rate, and the reported voluntary-for-Malaysians / mandatory-for-foreign-workers split all come from third-party payroll vendors. The linked official FAQ (050626-FAQSkimLINDUNG24Jam.pdf) sits behind an internal IP address (172.25.36.31) and is not publicly reachable.
- RENTAL / LEASING SERVICE TAX RATE REDUCTION 8% -> 6% FROM 1 JANUARY 2026 â€” NOT VERIFIED, AND THE OFFICIAL PAGE CONTRADICTS IT. The live MySST expansion FAQ (fetched today, site last updated 19/07/2026) still states 'The tax rate for rental or leasing services is 8%.' A reported reduction to 6% effective 1 January 2026, implemented as a service tax EXEMPTION pending gazetting of subsidiary legislation, appears only in a KPMG Malaysia commentary on 'Amendment to Service Tax Policy 2/2025'. Service Tax Policy Nos. 1/2026-4/2026 exist on the MySST site but their PDF contents were not retrieved. VERIFY before encoding a rental service tax rate.
- WHETHER BEAUTY / PERSONAL-CARE SERVICES WERE DROPPED FROM THE 1 JULY 2025 EXPANSION â€” CONFLICTING. The live official MySST FAQ still describes beauty treatment services as taxable at a flat 8% with a RM500,000 threshold, but secondary sources report beauty services were withdrawn after public feedback. Not resolved from an official page.
- ENTERTAINMENT 50% DEDUCTION PROVISO â€” NOT VERIFIED. The Form C Guidebook 2025 confirms entertainment is non-allowable under ITA 39(1)(l) and uses it as an add-back example, but the guidebook does not state the well-known proviso allowing 50% (or 100% for certain categories such as staff entertainment and promotional gifts). Confirm against LHDN Public Ruling on entertainment expense before building a 50%/100% split into the CoA.
- FORM C FOR YA2026 â€” NOT AVAILABLE. Only the YA2025 form (CP5 - Pin. 2025) and its guidebook are published on hasil.gov.my. The 59-item financial particulars taxonomy is stable across YA2022-YA2025 (sample forms exist for each), but the YA2026 form may differ.
- WHETHER THE E-INVOICE 'Classification' FIELD IS STRICTLY MANDATORY ON EVERY LINE â€” PARTIALLY VERIFIED. The Specific Guideline v4.8 shows it as data field no. 9 with explicit input instructions, and the SDK says 'taxpayers should be using the code values', but neither page carried an explicit mandatory/optional flag. Confirm against the MyInvois SDK validation rules / UBL schema.
- MTD/PCB REMITTANCE DUE DATE (15th of the following month) â€” WEAKLY VERIFIED. Confirmed only via search-engine summaries of hasil.gov.my pages; the LHDN MTD payment page (https://www.hasil.gov.my/en/employers/mtd-payment/) returned 404 on direct fetch because the site was recently restructured, and the MTD specification PDF URL also 404'd. The MTD/PCB scheme itself, the e-CP39/e-PCB channels and Form CP39 are confirmed to exist.
- HRD CORP EMPLOYEE-COUNT THRESHOLDS (10+ employees mandatory at 1%; 5-9 employees optional at 0.5%) â€” PARTIALLY VERIFIED. The official HRD Corp support centre confirms the 1% and 0.5% rates and the PSMB Act 2001 basis, but the specific employee-count cut-offs and the sector coverage under the First Schedule of the PSMB Act were paraphrased from search results rather than read from the official page text.
- SST 'NO INPUT TAX CREDIT' â€” INFERRED FROM STRONG OFFICIAL EVIDENCE, NOT FROM A SINGLE EXPLICIT SENTENCE. Confirmed officially that sales tax is a 'single stage tax', that GST input tax claims ended with a final GST-03 return in 2018, and that no input-credit mechanism appears anywhere in the SST registration/accounting pages. No official page was found that states in one sentence 'input tax is not claimable under SST'. The conclusion is sound but rests on composition of these facts.
- MySST GENERAL GUIDES ARE PARTLY STALE: the current 'General guideline for Sales Tax' PDF hosted on the live site is 'Panduan Umum Cukai Jualan - Ver 4, Sehingga 15 Januari 2019' (Malay only, dated 2019) and therefore predates both the March 2024 service tax rate change and the July 2025 expansion. Rate/threshold facts above were taken from the live HTML pages and 2025 FAQs, not from this guide.
- CORPORATE TAX RATES: Form C Part B shows apportionment rows at 15, 17 and 24 percent, but the form does not state the chargeable-income bands or the eligibility conditions (e.g. SME paid-up capital and gross income tests) that determine which rate applies. Confirm the bands from the ITA / LHDN rate page before use.

### Sources

- https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf
- https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf
- https://www.hasil.gov.my/en/muat-turun-borang/muat-turun-borang-syarikat/
- https://www.hasil.gov.my/en/muat-turun-borang/
- https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf
- https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf
- https://sdk.myinvois.hasil.gov.my/codes/classification-codes/
- https://mysst.customs.gov.my/registering-business/
- https://mysst.customs.gov.my/understanding-sst/
- https://mysst.customs.gov.my/accounting-sst/
- https://mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/
- https://mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/
- https://mysst.customs.gov.my/service-tax-policy/
- https://mysst.customs.gov.my/about-exemption/
- https://mysst.customs.gov.my/general-guide/
- https://mysst.customs.gov.my/wp-content/uploads/2025/03/Panduan-Umum_Cukai-Jualan_18012019-v4-2.pdf
- https://www.mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025
- https://www.perkeso.gov.my/en/our-services/employer-employee/kadar-caruman.html
- https://www.perkeso.gov.my/en/rate-of-contribution.html
- https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf
- https://www.perkeso.gov.my/images/dokumen/151124-Rate%20Contribution%20ACT%20800.pdf
- https://www.perkeso.gov.my/en/our-services/protection/employment-insurance.html
- https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy



exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "(Get-Content -LiteralPath 'apps/dashboard/app/shared/coaTemplate.ts').Count" in C:\Users\zhant\Desktop\clara-rebuild
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "(Get-Content -LiteralPath 'docs/plan/research/wave-b/malaysian-coa-official-research.md').Count" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 797ms:
609

 succeeded in 966ms:
341

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -LiteralPath '"'apps/dashboard/app/shared/coaTemplate.ts' | ForEach-Object { "'$i++; '"'{0:D3}: {1}' -f "'$i, $_ }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 783ms:
001: // The default Chart of Accounts template for a Malaysian private company (Sdn Bhd).
002: //
003: // PROVENANCE â€” read docs/plan/research/wave-b/malaysian-coa-official-research.md before
004: // changing anything here. Two independent lanes fed this file: web research against
005: // MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources, and a cross-model (gpt-5.6-sol)
006: // domain review. Both reached the same conclusion:
007: //
008: //   MALAYSIA HAS NO STATUTORY CHART OF ACCOUNTS. The phrase "chart of accounts" appears
009: //   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both extracted in full
010: //   and grep-verified). MPERS 4.9 is explicit: "This Standard does not prescribe the
011: //   sequence or format in which items are to be presented", and 4.9(b) permits renaming
012: //   and resequencing. CA 2016 s.245 is outcome-based â€” records must "sufficiently explain
013: //   the transactions and financial position of the company".
014: //
015: // So this template is NOT an official list. It is a defensible default whose only binding
016: // constraint is MAPPABILITY: every account rolls up cleanly to (a) the MPERS 4.2 / 5.5
017: // face line items, (b) the SSM MBRS (SSMxT) taxonomy actually filed, and (c) the LHDN
018: // Form C analysis and tax-computation add-backs. It is a starting point a professional
019: // edits per client â€” not a rule.
020: //
021: // DELIBERATELY ABSENT: rates, thresholds, percentages, effective dates. SST rates, tax
022: // bands, EPF/SOCSO/EIS/HRD rates and MyInvois deadlines are effective-dated compliance
023: // facts that change (service tax moved 6%->8% on 1 Mar 2024; scope expanded 1 Jul 2025;
024: // Service Tax Policies 1-4/2026 are live). They must never be encoded in an account name
025: // or in this file. MyInvois classification codes are transaction metadata, not accounts.
026: //
027: // FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. MPERS (2025) â€”
028: // Malaysia's adoption of IFRS for SMEs 3rd edition â€” was gazetted 10 October 2025 and
029: // applies to annual periods beginning on or after 1 January 2027 (early adoption
030: // permitted). Sections 4 and 5 are substantively unchanged between them, so this template
031: // is unaffected by that transition.
032: 
033: export type CoaTemplateAccount = {
034:   code: string;
035:   name: string;
036:   /** matches clara.coa_accounts.account_type */
037:   type: "asset" | "liability" | "equity" | "income" | "expense";
038:   /** control-account marker; only 'payable' | 'receivable' are permitted by the DB */
039:   accountClass?: "payable" | "receivable";
040:   /** DB CHECK: opening_balance_equity/retained_earnings require equity; sst_purchase_cost requires expense */
041:   special?:
042:     | "rounding"
043:     | "sst_output"
044:     | "sst_purchase_cost"
045:     | "opening_balance_equity"
046:     | "retained_earnings";
047:   /** which MPERS 4.2 / 5.5 face line item this rolls into â€” the mapping that makes the chart defensible */
048:   mpers: string;
049:   /** why this account exists as a separate line (tax analysis, statutory disclosure, MPERS split) */
050:   note?: string;
051: };
052: 
053: export type CoaTemplateBlock = {
054:   key: string;
055:   title: string;
056:   /** core = every Sdn Bhd needs it; optional = offer, do not seed by default */
057:   tier: "core" | "optional";
058:   blurb: string;
059:   accounts: CoaTemplateAccount[];
060: };
061: 
062: /**
063:  * Code scheme (extends the convention already in use by the firm: 100-000 share capital,
064:  * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 COGS, 900-xxx
065:  * mnemonic operating expenses, 999-R00 rounding). Numeric order identifies the block; it
066:  * does not dictate statement order â€” the MPERS mapping does that.
067:  *
068:  *   100-199 equity        200-299 non-current assets   300-399 current assets
069:  *   400-499 liabilities   500-599 income               600-699 cost of sales
070:  *   800-899 finance + tax expense                      900-989 operating expenses
071:  *   990-999 system
072:  *
073:  * DB constraint: account_code must match ^[0-9]{4,8}$ or ^[0-9]{3}-[0-9A-Z]{2,4}$.
074:  */
075: export const COA_TEMPLATE: CoaTemplateBlock[] = [
076:   {
077:     key: "equity",
078:     title: "Equity",
079:     tier: "core",
080:     blurb:
081:       "No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances).",
082:     accounts: [
083:       { code: "100-000", name: "Share capital", type: "equity", mpers: "Equity â€” share capital" },
084:       { code: "120-000", name: "Other reserves", type: "equity", mpers: "Equity â€” other reserves" },
085:       {
086:         code: "150-000",
087:         name: "Retained earnings",
088:         type: "equity",
089:         special: "retained_earnings",
090:         mpers: "Equity â€” retained earnings",
091:       },
092:       {
093:         code: "190-OBE",
094:         name: "Opening balance equity (system clearing)",
095:         type: "equity",
096:         special: "opening_balance_equity",
097:         mpers: "Equity â€” temporary conversion account",
098:         note: "A conversion account, not permanent equity. Must net to nil and be cleared before statutory statements are finalised.",
099:       },
100:     ],
101:   },
102:   {
103:     key: "ppe",
104:     title: "Property, plant and equipment",
105:     tier: "core",
106:     blurb: "Cost and accumulated depreciation held separately, as MPERS Section 17 disclosure requires.",
107:     accounts: [
108:       { code: "200-M01", name: "Motor vehicles â€” cost", type: "asset", mpers: "Property, plant and equipment" },
109:       { code: "200-F01", name: "Furniture and fittings â€” cost", type: "asset", mpers: "Property, plant and equipment" },
110:       { code: "200-C01", name: "Computer equipment â€” cost", type: "asset", mpers: "Property, plant and equipment" },
111:       { code: "200-R01", name: "Renovation â€” cost", type: "asset", mpers: "Property, plant and equipment" },
112:       { code: "210-M01", name: "Accumulated depreciation â€” motor vehicles", type: "asset", mpers: "Property, plant and equipment" },
113:       { code: "210-F01", name: "Accumulated depreciation â€” furniture and fittings", type: "asset", mpers: "Property, plant and equipment" },
114:       { code: "210-C01", name: "Accumulated depreciation â€” computer equipment", type: "asset", mpers: "Property, plant and equipment" },
115:       { code: "210-R01", name: "Accumulated depreciation â€” renovation", type: "asset", mpers: "Property, plant and equipment" },
116:     ],
117:   },
118:   {
119:     key: "current-assets",
120:     title: "Current assets",
121:     tier: "core",
122:     blurb:
123:       "Trade receivables carries the receivable control marker. Director and related-party balances are separate, directional and never netted â€” MPERS Section 33 related-party disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
124:     accounts: [
125:       {
126:         code: "300-000",
127:         name: "Trade receivables â€” control",
128:         type: "asset",
129:         accountClass: "receivable",
130:         mpers: "Trade and other receivables",
131:       },
132:       { code: "300-900", name: "Allowance for impairment â€” trade receivables", type: "asset", mpers: "Trade and other receivables" },
133:       { code: "310-B01", name: "Bank â€” main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 â€¦" },
134:       { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
135:       { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
136:       { code: "340-D01", name: "Deposits paid", type: "asset", mpers: "Trade and other receivables" },
137:       { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
138:       { code: "350-D01", name: "Amount owing from director", type: "asset", mpers: "Trade and other receivables â€” related party", note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off." },
139:       { code: "350-R01", name: "Amount owing from related company", type: "asset", mpers: "Trade and other receivables â€” related party" },
140:       { code: "360-T01", name: "Tax instalments paid / current tax receivable", type: "asset", mpers: "Current tax assets" },
141:     ],
142:   },
143:   {
144:     key: "liabilities",
145:     title: "Liabilities",
146:     tier: "core",
147:     blurb:
148:       "Every statutory payroll deduction is its own payable â€” EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable.",
149:     accounts: [
150:       { code: "400-000", name: "Trade payables â€” control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
151:       { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables" },
152:       { code: "410-002", name: "Salaries and wages payable", type: "liability", mpers: "Trade and other payables" },
153:       { code: "410-003", name: "EPF payable", type: "liability", mpers: "Trade and other payables", note: "Employees Provident Fund Act 1991." },
154:       { code: "410-004", name: "SOCSO payable", type: "liability", mpers: "Trade and other payables", note: "Employees' Social Security Act 1969 (Act 4)." },
155:       {
156:         code: "410-005",
157:         name: "SKBBK payable (LINDUNG 24 JAM)",
158:         type: "liability",
159:         mpers: "Trade and other payables",
160:         note: "Non-Employment Injury Security Scheme â€” a distinct employee-borne PERKESO component with its own column in the official contribution table.",
161:       },
162:       { code: "410-006", name: "EIS payable", type: "liability", mpers: "Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) â€” separate from Act 4." },
163:       { code: "410-007", name: "PCB / MTD payable", type: "liability", mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form CP39)." },
164:       { code: "410-008", name: "HRD Corp levy payable", type: "liability", mpers: "Trade and other payables", note: "PSMB Act 2001 â€” applies only to employers within scope or registered voluntarily." },
165:       { code: "420-D01", name: "Amount owing to director", type: "liability", mpers: "Trade and other payables â€” related party" },
166:       { code: "420-R01", name: "Amount owing to related company", type: "liability", mpers: "Trade and other payables â€” related party" },
167:       {
168:         code: "430-SVT",
169:         name: "Service tax output payable",
170:         type: "liability",
171:         special: "sst_output",
172:         mpers: "Trade and other payables",
173:         note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker â€” see the SST limitation note below.",
174:       },
175:       {
176:         code: "430-SLT",
177:         name: "Sales tax output payable",
178:         type: "liability",
179:         mpers: "Trade and other payables",
180:         note: "Sales tax is a single-stage tax on manufacturers/importers, accounted on an ACCRUAL basis â€” a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
181:       },
182:       { code: "430-WHT", name: "Withholding tax payable", type: "liability", mpers: "Trade and other payables", note: "Payments to non-residents â€” ITA s.107A contract payments, s.4A technical/management fees." },
183:       { code: "440-001", name: "Current tax payable (provision for taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision â€” it belongs in current tax liabilities." },
184:       { code: "460-L01", name: "Borrowings â€” current", type: "liability", mpers: "Financial liabilities â€” current" },
185:       { code: "461-L01", name: "Borrowings â€” non-current", type: "liability", mpers: "Financial liabilities â€” non-current" },
186:       { code: "490-D01", name: "Customer deposits", type: "liability", mpers: "Trade and other payables" },
187:       { code: "490-R01", name: "Deferred income / contract liabilities", type: "liability", mpers: "Other liabilities" },
188:     ],
189:   },
190:   {
191:     key: "income",
192:     title: "Income",
193:     tier: "core",
194:     blurb: "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly.",
195:     accounts: [
196:       { code: "500-000", name: "Revenue", type: "income", mpers: "Revenue" },
197:       { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
198:       { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
199:       { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue â€” net" },
200:       { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue â€” net" },
201:       { code: "530-000", name: "Other income", type: "income", mpers: "Other income" },
202:       { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
203:       { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income" },
204:       { code: "530-FX1", name: "Realised foreign exchange gain", type: "income", mpers: "Other income", note: "Realised and unrealised kept apart â€” unrealised amounts are a tax-computation adjustment." },
205:       { code: "530-FX2", name: "Unrealised foreign exchange gain", type: "income", mpers: "Other income" },
206:       { code: "540-I01", name: "Interest income", type: "income", mpers: "Finance income" },
207:     ],
208:   },
209:   {
210:     key: "cost-of-sales",
211:     title: "Cost of sales",
212:     tier: "core",
213:     blurb: "Form C requires contract and subcontract payments to be separately disclosed.",
214:     accounts: [
215:       { code: "610-100", name: "Cost of goods sold / purchases", type: "expense", mpers: "Cost of sales" },
216:       { code: "610-S01", name: "Subcontractor and direct service costs", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." },
217:       { code: "610-F01", name: "Freight and carriage inward", type: "expense", mpers: "Cost of sales" },
218:       { code: "610-RET", name: "Purchase returns (contra)", type: "expense", mpers: "Cost of sales" },
219:       { code: "610-DIS", name: "Purchase discounts (contra)", type: "expense", mpers: "Cost of sales" },
220:     ],
221:   },
222:   {
223:     key: "finance-tax",
224:     title: "Finance costs and tax",
225:     tier: "core",
226:     blurb: "MPERS 5.5 requires finance costs and tax expense as separate face lines.",
227:     accounts: [
228:       { code: "800-I01", name: "Interest expense â€” borrowings", type: "expense", mpers: "Finance costs" },
229:       { code: "810-T01", name: "Current income tax expense", type: "expense", mpers: "Tax expense" },
230:       { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense" },
231:     ],
232:   },
233:   {
234:     key: "operating-expenses",
235:     title: "Operating expenses",
236:     tier: "core",
237:     blurb:
238:       "Split to serve the LHDN tax computation: entertainment is separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an add-back or restricted deduction.",
239:     accounts: [
240:       { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
241:       { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
242:       { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
243:       { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
244:       { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses" },
245:       { code: "900-B03", name: "Impairment loss â€” trade receivables", type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation distinction." },
246:       { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
247:       { code: "900-D01", name: "Directors' fees and remuneration", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4) disclosure." },
248:       { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
249:       { code: "900-DON", name: "Donations", type: "expense", mpers: "Other operating expenses", note: "Deductibility depends on approved-institution status." },
250:       { code: "900-E01", name: "EPF â€” employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of remuneration, so this must be separately measurable." },
251:       { code: "900-E02", name: "SOCSO and EIS â€” employer contribution", type: "expense", mpers: "Employee benefits" },
252:       { code: "900-E03", name: "Entertainment â€” staff", type: "expense", mpers: "Administrative expenses", note: "Kept apart from client entertainment: the deduction restriction differs." },
253:       { code: "900-E04", name: "Entertainment â€” client / business", type: "expense", mpers: "Administrative expenses", note: "Restricted deduction." },
254:       { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
255:       { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "Tax-computation adjustment." },
256:       { code: "900-FIN", name: "Fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Non-deductible." },
257:       { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
258:       { code: "900-I01", name: "Insurance", type: "expense", mpers: "Administrative expenses" },
259:       { code: "900-L01", name: "Legal and professional fees", type: "expense", mpers: "Administrative expenses" },
260:       { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
261:       { code: "900-M02", name: "Management fees", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be separately disclosed." },
262:       { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 â€” check the supplier's registration status." },
263:       { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
264:       { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs vs capital improvement is a tax-computation distinction." },
265:       { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
266:       { code: "900-S03", name: "Software and subscriptions", type: "expense", mpers: "Administrative expenses" },
267:       { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
268:       {
269:         code: "900-SST",
270:         name: "SST on purchases (expensed)",
271:         type: "expense",
272:         special: "sst_purchase_cost",
273:         mpers: "Administrative expenses",
274:         note: "Malaysian SST is NOT a credit-offset VAT â€” it is a cost. Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT be routed here.",
275:       },
276:       { code: "900-T01", name: "Telephone and internet", type: "expense", mpers: "Administrative expenses" },
277:       { code: "900-T02", name: "Travel and accommodation", type: "expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep local and overseas distinguishable." },
278:       { code: "900-T03", name: "Toll and parking", type: "expense", mpers: "Administrative expenses", note: "Do NOT combine with fines â€” the tax treatment differs." },
279:       { code: "900-U01", name: "Utilities", type: "expense", mpers: "Administrative expenses" },
280:     ],
281:   },
282:   {
283:     key: "system",
284:     title: "System",
285:     tier: "core",
286:     blurb: "Machine-owned. A recurring or material rounding balance means a coding or calculation defect, not a real expense.",
287:     accounts: [{ code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" }],
288:   },
289:   {
290:     key: "inventory",
291:     title: "Inventories (optional)",
292:     tier: "optional",
293:     blurb: "Seed only for entities that hold stock.",
294:     accounts: [
295:       { code: "330-T01", name: "Trading inventory", type: "asset", mpers: "Inventories" },
296:       { code: "330-R01", name: "Raw materials", type: "asset", mpers: "Inventories" },
297:       { code: "330-W01", name: "Work in progress", type: "asset", mpers: "Inventories" },
298:       { code: "330-F01", name: "Finished goods", type: "asset", mpers: "Inventories" },
299:       { code: "330-900", name: "Allowance for inventory obsolescence", type: "asset", mpers: "Inventories" },
300:       { code: "620-ADJ", name: "Inventory movement and stock adjustments", type: "expense", mpers: "Cost of sales" },
301:     ],
302:   },
303:   {
304:     key: "investments",
305:     title: "Investments and deferred tax (optional)",
306:     tier: "optional",
307:     blurb: "Seed only where the entity holds investments or recognises deferred tax.",
308:     accounts: [
309:       { code: "230-001", name: "Investment property â€” cost", type: "asset", mpers: "Investment property" },
310:       { code: "231-001", name: "Accumulated depreciation â€” investment property", type: "asset", mpers: "Investment property" },
311:       { code: "240-S01", name: "Investment in subsidiaries", type: "asset", mpers: "Investments in subsidiaries" },
312:       { code: "240-A01", name: "Investment in associates", type: "asset", mpers: "Investments in associates" },
313:       { code: "260-DTA", name: "Deferred tax asset", type: "asset", mpers: "Deferred tax assets" },
314:       { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities" },
315:     ],
316:   },
317: ];
318: 
319: export const CORE_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "core");
320: export const OPTIONAL_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "optional");
321: 
322: export function templateAccounts(blockKeys: string[]): CoaTemplateAccount[] {
323:   return COA_TEMPLATE.filter((b) => blockKeys.includes(b.key)).flatMap((b) => b.accounts);
324: }
325: 
326: /**
327:  * KNOWN SCHEMA LIMITATIONS surfaced while building this template â€” recorded, not worked
328:  * around. Both are Wave-C/D candidates, not blockers:
329:  *
330:  * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
331:  *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
332:  *    thresholds, rates and â€” critically â€” different accounting bases (sales tax accrual,
333:  *    service tax payment). A dual registrant needs two separately tagged control accounts,
334:  *    or every journal leg must carry an effective-dated sales/service treatment dimension.
335:  *    This template puts the marker on service tax (much the commoner case for SME service
336:  *    providers) and seeds sales tax as a plain liability.
337:  *
338:  * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
339:  *    is correct for the operating-expense automation path, but SST attributable to
340:  *    inventory or PPE should be capitalised into the asset's cost and cannot be.
341:  */

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$lines = Get-Content -LiteralPath '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; for ("'$i=0; $i -lt [Math]::Min(220,$lines.Count); $i++) { '"'{0:D3}: {1}' -f ("'$i+1), $lines[$i] }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 854ms:
001: # Malaysian CoA â€” official-source research (2026-07-24)
002: 
003: > Three web-enabled research lanes (opus xhigh) against MASB/MPERS, SSM/MBRS and LHDN/RMCD.
004: > Facts below were fetched from official pages, not recalled. Anything unverified is listed
005: > under UNVERIFIED and must not be encoded as fact.
006: 
007: ## MASB / MPERS
008: 
009: ### Authority
010: 
011: **What MPERS legally IS.** MPERS is a MASB Approved Accounting Standard issued under subsection 7(1) of the Financial Reporting Act 1997 (Act 558) and regulation 3 of the Financial Reporting (Publication of Approved Accounting Standards) Regulations 1999. It is given legal force over company accounts by Companies Act 2016 s.244(1)-(2): the approved accounting standards "shall apply to the financial statements of a company", and directors "shall ensure that the financial statements... are made out in accordance with the applicable approved accounting standards" â€” subject only to the s.244(3) true-and-fair override.
012: 
013: **What it MANDATES.** Only (a) minimum *line items* that must appear on the face of the primary statements (MPERS 4.2, 5.5, 5.6, 5.7); (b) a current/non-current split unless a liquidity presentation is more relevant (4.4-4.8); (c) certain sub-classifications shown either on the face or in the notes (4.11-4.14); (d) an expense analysis by nature OR by function, entity's choice (5.11); (e) a ban on "extraordinary items" (5.10). Plus, under CA 2016 s.249(4), the Registrar may require additional note disclosures (directors' remuneration, directors' retirement benefits, compensation for loss of office, loans/quasi-loans to directors, auditors' remuneration) "notwithstanding any relevant provisions of the applicable approved accounting standards".
014: 
015: **What it explicitly does NOT mandate.** MPERS 4.9 is decisive and is verbatim: "This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation..." and 4.9(b) expressly permits that "the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions". The string "chart of accounts" appears **zero times** in the full MPERS text (13,346 lines extracted) and **zero times** in the Companies Act 2016 (24,759 lines extracted). CA 2016 s.245 ("Accounts to be kept") is purely outcome-based â€” records must "sufficiently explain the transactions and financial position of the company" â€” it prescribes no account structure, coding, or numbering. CA 2016 carries no prescribed accounts-format schedule (its Ninth Schedule is "Powers of Judicial Manager", not a contents-of-accounts schedule as under the repealed CA 1965).
016: 
017: **Practical design consequence for a Sdn Bhd default CoA.** The chart of accounts is a free design choice. The binding constraint is *mappability*: every account must roll up cleanly to (i) the MPERS 4.2 / 5.5 face line items, (ii) the 4.11-4.12 sub-classification and share-capital disclosures, and (iii) â€” the real-world tightest constraint â€” the SSM Taxonomy (SSMxT) FS-MPERS entry point, since XBRL lodgement via MBRS 2.0 is now mandatory. Design the CoA to a *target mapping*, not to a legal template, because no legal template exists.
018: 
019: ### Verified facts
020: 
021: - NO mandatory chart of accounts exists. The phrase 'chart of accounts' appears zero times in the full MPERS text and zero times in the Companies Act 2016 (Act 777, updated text to 1.8.2022) â€” both extracted in full and grep-verified. Neither prescribes account codes, numbering, or an account structure.
022: - MPERS 4.9 verbatim: 'This Standard does not prescribe the sequence or format in which items are to be presented. Paragraph 4.2 simply provides a list of items that are sufficiently different in nature or function to warrant separate presentation in the statement of financial position.' This paragraph is UNCHANGED in the IFRS for SMEs third edition markup, so it carries into MPERS (2025).
023: - MPERS 4.9(b) verbatim permits renaming and resequencing: 'the descriptions used and the sequencing of items or aggregation of similar items may be amended according to the nature of the entity and its transactions, to provide information that is relevant to an understanding of the entity's financial position.'
024: - CA 2016 s.244(1)-(2) verbatim: 'The approved accounting standards shall apply to the financial statements of a company...' and directors 'shall ensure that the financial statements of the company... are made out in accordance with the applicable approved accounting standards'. s.244(3) provides a true-and-fair override where compliance would not give a true and fair view.
025: - CA 2016 s.245(1) verbatim is outcome-based, not structural: directors shall 'cause to be kept the accounting and other records to sufficiently explain the transactions and financial position of the company and enable true and fair profit and loss accounts and balance sheets... to be prepared'. s.245(2): entries must be made within SIXTY DAYS of completion of the transaction. s.245(3): records retained SEVEN YEARS.
026: - CA 2016's Ninth Schedule is 'POWERS OF JUDICIAL MANAGER' [subsection 414(4)] â€” it is NOT a prescribed contents-of-accounts schedule. CA 2016 contains no prescribed financial-statement format schedule.
027: - VERSION STATUS â€” MPERS (2025) has been issued and supersedes MPERS (2016). Official MASB gazette notice dated 10 October 2025, signed Tan Sri Mohd Nasir Ahmad, Chairman: 'An entity shall apply MPERS (2025) for annual periods beginning on or after 1 January 2027. Earlier application is permitted.' Same notice: 'MPERS (2016) shall hereby be withdrawn for application for financial statements with annual periods beginning on or after 1 January 2027.'
028: - Therefore AS AT JULY 2026 the standard in force is MPERS (2016) (the February 2016 issue incorporating the 2015 Amendments, effective 1 January 2017). MPERS (2025) is issued but not yet mandatory; early adoption is permitted. A Sdn Bhd with a 31 Dec year end applies MPERS (2016) for FY2026 and MPERS (2025) from FY2027.
029: - MPERS (2025) IS the Malaysian adoption of the IFRS for SMEs third edition. MASB press release: the revised MPERS is 'based on the third edition of the IFRS for SMEs Accounting Standard issued by the IASB' and is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The IASB issued the third edition in February 2025.
030: - MPERS REMAINS the framework for private entities; the MFRS/MPERS split is intact. The 10 October 2025 MASB notice is structured under two separate headings: 'MASB APPROVED ACCOUNTING STANDARD FOR ENTITIES OTHER THAN PRIVATE ENTITIES â€” Malaysian Financial Reporting Standard (MFRS)' and 'MASB APPROVED ACCOUNTING STANDARD FOR PRIVATE ENTITIES â€” Malaysian Private Entities Reporting Standard (2025)'.
031: - MPERS is an OPTION, not a compulsion. MPERS 1.1 verbatim: 'Private entities (as defined in paragraph 1.2) have the option to apply in its entirety either: (a) the Malaysian Private Entities Reporting Standard (MPERS or this Standard); or (b) the Malaysian Financial Reporting Standards (MFRSs).' A Sdn Bhd may elect full MFRS instead.
032: - Private entity definition (MPERS 1.2 as amended by the Addendum, applied for annual periods ending on or after 31 January 2017): 'A private entity is a private company as defined in section 2 of the Companies Act 2016 that: (a) is not itself required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia; and (b) is not a subsidiary or associate of, or jointly controlled by, an entity which is required to prepare or lodge any financial statements under any law administered by the Securities Commission or Bank Negara Malaysia.' Plus a carve-out: a private company that is, or is a subsidiary/associate of, or jointly controlled by, a management company as defined in section 2 of the Interest Schemes Act 2016 is NOT a private entity.
033: - SECTION 4/5 ARE SUBSTANTIVELY UNCHANGED between MPERS (2016) and the third edition on which MPERS (2025) is based. Verified line-by-line against the IFRS Foundation's official 'Third Edition | With changes since the second edition marked up' PDF. The 4.2 list of items (a)-(r) is identical in composition; the 5.5 list (a)-(i) is identical in composition. This means a chart of accounts built to MPERS (2016) Section 4/5 will NOT need restructuring for MPERS (2025).
034: - The only Section 4 changes in the third edition: 4.2(e) adds '(including bearer plants in the scope of Section 17 Property, Plant and Equipment)'; 4.2(h) and 4.2(i) add 'in the scope of Section 34 Specialised Activities' to biological assets; 4.3 adds an explicit disaggregation instruction â€” 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals...'; and the 4.2 chapeau drops the words 'As a minimum,'.
035: - The only Section 5 changes in the third edition: 5.5(c) renames Section 15 from 'Investments in Joint Ventures' to 'Investments in Joint Arrangements'; 5.5(h) reads 'accounted for using the equity method' (was 'by the equity method'); 5.8 says errors/policy changes are adjusted in the period they are 'identified' (was 'arise'). Paragraph 5.11 on expense analysis by nature vs function is COMPLETELY UNCHANGED.
036: - EXPENSE ANALYSIS IS A FREE CHOICE (MPERS 5.11, unchanged in the third edition): 'An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.' MPERS imposes NO requirement to disclose the by-nature breakdown when the by-function method is used (this is a real divergence from MFRS 101/IAS 1, which requires that additional disclosure).
037: - The ONLY hard constraint under the by-function method (MPERS 5.11(b)): 'At a minimum, an entity discloses its cost of sales under this method separately from other expenses.'
038: - COMPANIES ACT 2016 â€” PAR VALUE ABOLISHED. s.74 verbatim: 'All shares issued before or upon the commencement of this Act shall have no par or nominal value.' Consequence for a CoA: there is no 'par value' or 'nominal value' equity account; share capital is a single undivided amount.
039: - COMMENCEMENT DATE CONFIRMED from the Act's own text: '[31 January 2017, P.U. (B) 50/2017; Division 8 of Part IIIâ€”1 March 2018, P.U. (B) 106/2018; Section 241â€”15 March 2019, P.U. (B) 318/2019]'. Section 74 is not carved out, so it commenced 31 January 2017.
040: - SHARE PREMIUM ACCOUNT ABOLISHED â€” s.618(2) verbatim: 'Upon the commencement of section 74, any amount standing to the credit of a company's share premium account and capital redemption reserve shall become part of the company's share capital.' This was automatic and by operation of law on 31 January 2017 â€” no entry, election, or resolution was required.
041: - TRANSITIONAL WINDOW IS EXPIRED. s.618(3) and s.618(4) each allowed use of the share premium credit / capital redemption reserve credit only 'within twenty-four months upon the commencement of section 74'. Commencement was 31 January 2017, so the window closed on 30 January 2019 â€” more than seven years ago. For any Sdn Bhd being onboarded in 2026 the transition is fully historical: a live 'Share Premium' or 'Capital Redemption Reserve' account should NOT exist and, if found in a client's legacy ledger, is a migration defect to be swept into Share Capital.
042: - SSM Practice Note 1/2017 (issued 8 February 2017 by the Registrar of Companies under s.20C of the Companies Commission of Malaysia Act 2001) confirms the policy intent verbatim: 'The Companies Act 2016 abolishes the concept of nominal value in shares. Effectively, this policy will also render the share premium account and capital redemption reserves of a company to be no longer relevant. Instead the amount standing in the share premium account and the capital redemption reserves will be recognized as part of the company's share capital.'
043: - PN 1/2017 para 9(b) confirms the deadline was absolute: 'the right to use the credit standing in the share premium account must be exercised within 24 months after the commencement of the Companies Act 2016 irrespective of whether the decision to pay up any unissued shares as fully paid bonus shares is made before or after the commencement of the Companies Act 2016.'
044: - SHARE CAPITAL IS NOW LOCKED. s.618(2) share capital 'cannot be reduced without leave of Court' â€” i.e. reductions require the s.116 solvency-statement route or a court order. A CoA should treat Share Capital as a controlled/restricted account, not a freely-postable one.
045: - MPERS 4.12(a)(iii) still requires disclosure of 'par value per share or that the shares have no par value' â€” under CA 2016 a Malaysian Sdn Bhd discloses the latter. So the disclosure hook survives even though the account does not.
046: - THE REAL DE-FACTO LINE-ITEM CONSTRAINT IS SSM's MBRS XBRL TAXONOMY, not MPERS. Financial statements must be lodged with SSM in XBRL, tagged to the SSM Taxonomy (SSMxT). Per SSM's own MBRS 2.0 overview: the scopes are based on '1) Companies Act 2016; 2) Companies Act 1965; 3) Applicable approved accounting standards' with 'Private companies using the Malaysian Private Entities Reporting Standards in Malaysia (MPERS)'. The relevant entry points are 'FS â€“ MPERS' (entry point 7) and 'KFIâ€“MPERS' (entry point 18).
047: - MBRS 2.0 mandatory rollout was in three phases: Phase 1 from 1 December 2024 (unaudited FS and annual returns under CA 2016, plus EPC), Phase 2 from 1 March 2025 (audited FS under CA 1965 and previously-exempt financial institutions), Phase 3 from 1 June 2025 (audited FS of all companies under CA 2016). As at July 2026 all phases are live, so XBRL lodgement is fully mandatory for a Sdn Bhd.
048: - SSMxT is built on the IFRS Taxonomy 2022 as its base, and 'Given that MFRS and MPERS are largely based on IFRS, SSMxT has adopted the IFRS elements as the basis of its core elements', supplemented by SSM-created extensions 'necessary to support the Malaysian jurisdictional requirements'. Practical implication: the CoA should map to IFRS-taxonomy-shaped concepts, which aligns naturally with MPERS 4.2 / 5.5.
049: - SSMxT 2022 added a new statement to the MPERS entry points: 'New statement added in MPERS FS & KFI for "Statement of Retained earnings"' â€” consistent with MPERS Section 6, which permits a combined Statement of Income and Retained Earnings in place of separate SOCI and SOCE when the only equity movements are profit or loss, dividends, error corrections and policy changes.
050: 
051: ### Line items / taxonomy / categories
052: 
053: - === MPERS SECTION 4, PARA 4.2 â€” STATEMENT OF FINANCIAL POSITION, MINIMUM FACE LINE ITEMS (verbatim, MPERS 2016 in force) ===
054: - 4.2 As a minimum, the statement of financial position shall include line items that present the following amounts:
055: - (a) cash and cash equivalents;
056: - (b) trade and other receivables;
057: - (c) financial assets (excluding amounts shown under (a), (b), (j) and (k));
058: - (d) inventories;
059: - (e) property, plant and equipment;
060: - (ea) investment property carried at cost less accumulated depreciation and impairment;
061: - (f) investment property carried at fair value through profit or loss;
062: - (g) intangible assets;
063: - (h) biological assets carried at cost less accumulated depreciation and impairment;
064: - (i) biological assets carried at fair value through profit or loss;
065: - (j) investments in associates;
066: - (k) investments in jointly controlled entities;
067: - (l) trade and other payables;
068: - (m) financial liabilities (excluding amounts shown under (l) and (p));
069: - (n) liabilities and assets for current tax;
070: - (o) deferred tax liabilities and deferred tax assets (these shall always be classified as non-current);
071: - (p) provisions;
072: - (q) non-controlling interest, presented within equity separately from the equity attributable to the owners of the parent; and
073: - (r) equity attributable to the owners of the parent.
074: - === MPERS (2025) / IFRS for SMEs 3rd ed VARIANTS OF 4.2 (effective 1 Jan 2027) ===
075: - 4.2 chapeau becomes: 'The statement of financial position shall include line items that present the following amounts:' (the words 'As a minimum,' are removed)
076: - (e) property, plant and equipment (including bearer plants in the scope of Section 17 Property, Plant and Equipment);
077: - (h) biological assets in the scope of Section 34 Specialised Activities carried at cost less accumulated depreciation and impairment;
078: - (i) biological assets in the scope of Section 34 carried at fair value through profit or loss;
079: - 4.3 becomes: 'An entity shall present additional line items (including by disaggregating the line items listed in paragraph 4.2), headings and subtotals in the statement of financial position when such presentation is relevant to an understanding of the entity's financial position.'
080: - === MPERS 4.11 â€” SUB-CLASSIFICATIONS, FACE OR NOTES (verbatim) â€” THE PRACTICAL CoA DRIVER ===
081: - 4.11 An entity shall disclose, either in the statement of financial position or in the notes, the following subclassifications of the line items presented:
082: - (a) property, plant and equipment in classifications appropriate to the entity;
083: - (b) trade and other receivables showing separately amounts due from related parties, amounts due from other parties and receivables arising from accrued income not yet billed;
084: - (c) inventories, showing separately amounts of inventories: (i) held for sale in the ordinary course of business; (ii) in the process of production for such sale; and (iii) in the form of materials or supplies to be consumed in the production process or in the rendering of services.
085: - (d) trade and other payables, showing separately amounts payable to trade suppliers, payable to related parties, deferred income and accruals;
086: - (e) provisions for employee benefits and other provisions; and
087: - (f) classes of equity, such as paid-in capital, share premium, retained earnings and items of income and expense that, as required by this Standard, are recognised in other comprehensive income and presented separately in equity.
088: - === MPERS 4.12 â€” SHARE CAPITAL DISCLOSURES (verbatim) ===
089: - 4.12 An entity with share capital shall disclose the following, either in the statement of financial position or in the notes: (a) for each class of share capital: (i) the number of shares authorised. (ii) the number of shares issued and fully paid, and issued but not fully paid. (iii) par value per share or that the shares have no par value. (iv) a reconciliation of the number of shares outstanding at the beginning and at the end of the period. This reconciliation need not be presented for prior periods. (v) the rights, preferences and restrictions attaching to that class including restrictions on the distribution of dividends and the repayment of capital. (vi) shares in the entity held by the entity or by its subsidiaries or associates. (vii) shares reserved for issue under options and contracts for the sale of shares, including the terms and amounts. (b) a description of each reserve within equity.
090: - === MPERS 4.4-4.8 â€” CURRENT/NON-CURRENT (verbatim, unchanged in 3rd ed) ===
091: - 4.4 An entity shall present current and non-current assets, and current and non-current liabilities, as separate classifications in its statement of financial position in accordance with paragraphs 4.5-4.8, except when a presentation based on liquidity provides information that is reliable and more relevant. When that exception applies, all assets and liabilities shall be presented in order of approximate liquidity (ascending or descending).
092: - 4.5 An entity shall classify an asset as current when: (a) it expects to realise the asset, or intends to sell or consume it, in the entity's normal operating cycle; (b) it holds the asset primarily for the purpose of trading; (c) it expects to realise the asset within twelve months after the reporting date; or (d) the asset is cash or a cash equivalent, unless it is restricted from being exchanged or used to settle a liability for at least twelve months after the reporting date.
093: - 4.6 An entity shall classify all other assets as non-current. When the entity's normal operating cycle is not clearly identifiable, its duration is assumed to be twelve months.
094: - 4.7 An entity shall classify a liability as current when: (a) it expects to settle the liability in the entity's normal operating cycle; (b) it holds the liability primarily for the purpose of trading; (c) the liability is due to be settled within twelve months after the reporting date; or (d) the entity does not have an unconditional right to defer settlement of the liability for at least twelve months after reporting date.
095: - 4.8 An entity shall classify all other liabilities as non-current.
096: - === MPERS SECTION 5, PARA 5.5 â€” STATEMENT OF COMPREHENSIVE INCOME, MINIMUM FACE LINE ITEMS (verbatim) ===
097: - 5.5 As a minimum, an entity shall include, in the statement of comprehensive income, line items that present the following amounts for the period:
098: - (a) revenue.
099: - (b) finance costs.
100: - (c) share of the profit or loss of investments in associates (see Section 14 Investments in Associates) and jointly controlled entities (see Section 15 Investments in Joint Ventures) accounted for using the equity method.
101: - (d) tax expense excluding tax allocated to items (e), (g) and (h) (see paragraph 29.35).
102: - (e) a single amount comprising the total of: (i) the post-tax profit or loss of a discontinued operation; and (ii) the post-tax gain or loss attributable to an impairment, or reversal of an impairment, of the assets in the discontinued operation (see Section 27 Impairment of Assets), both at the time and subsequent to being classified as a discontinued operation and to the disposal of the net assets constituting the discontinued operation.
103: - (f) profit or loss (if an entity has no items of other comprehensive income, this line need not be presented).
104: - (g) each item of other comprehensive income (see paragraph 5.4(b)) classified by nature (excluding amounts in (h)). Such items shall be grouped into those that, in accordance with this Standard: (i) will not be reclassified subsequently to profit or lossâ€”ie those in paragraph 5.4(b)(i)-(ii) and (iv); and (ii) will be reclassified subsequently to profit or loss when specific conditions are metâ€”ie those in paragraph 5.4(b)(iii).
105: - (h) share of the other comprehensive income of associates and jointly controlled entities accounted for by the equity method.
106: - (i) total comprehensive income (if an entity has no items of other comprehensive income, it may use another term for this line such as profit or loss).
107: - === MPERS 5.6 â€” ALLOCATIONS (verbatim; only relevant where consolidated) ===
108: - 5.6 An entity shall disclose separately the following items in the statement of comprehensive income as allocations for the period: (a) profit or loss for the period attributable to (i) non-controlling interest; and (ii) owners of the parent. (b) total comprehensive income for the period attributable to (i) non-controlling interest; and (ii) owners of the parent.
109: - === MPERS 5.2 and 5.7 â€” ONE-STATEMENT vs TWO-STATEMENT CHOICE (verbatim) ===
110: - 5.2 An entity shall present its total comprehensive income for a period either: (a) in a single statement of comprehensive income, in which case the statement of comprehensive income presents all items of income and expense recognised in the period; or (b) in two statementsâ€”an income statement and a statement of comprehensive incomeâ€”in which case the income statement presents all items of income and expense recognised in the period except those that are recognised in total comprehensive income outside of profit or loss as permitted or required by this Standard.
111: - 5.7 Under the two-statement approach, the income statement shall display, as a minimum, line items that present the amounts in paragraph 5.5(a)-5.5(f) for the period, with profit or loss as the last line. The statement of comprehensive income shall begin with profit or loss as its first line and shall display, as a minimum, line items that present the amounts in paragraph 5.5(g)-5.5(i) and paragraph 5.6 for the period.
112: - === MPERS 5.4(b) â€” THE ONLY FOUR ITEMS OF OTHER COMPREHENSIVE INCOME (verbatim) â€” a closed list, so OCI accounts in a CoA are bounded ===
113: - (i) some gains and losses arising on translating the financial statements of a foreign operation (see Section 30 Foreign Currency Translation); (ii) some actuarial gains and losses (see Section 28 Employee Benefits); (iii) some changes in fair values of hedging instruments (see Section 12 Other Financial Instrument Issues); and (iv) changes in the revaluation surplus for property, plant and equipment measured in accordance with the revaluation model (see Section 17 Property, Plant and Equipment).
114: - === MPERS 5.11 â€” ANALYSIS OF EXPENSES: BY NATURE vs BY FUNCTION (verbatim, unchanged in 3rd ed) ===
115: - 5.11 An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.
116: - Analysis by nature of expense â€” (a) Under this method of classification, expenses are aggregated in the statement of comprehensive income according to their nature (for example, depreciation, purchases of materials, transport costs, employee benefits and advertising costs) and are not reallocated among various functions within the entity.
117: - Analysis by function of expense â€” (b) Under this method of classification, expenses are aggregated according to their function as part of cost of sales or, for example, the costs of distribution or administrative activities. At a minimum, an entity discloses its cost of sales under this method separately from other expenses.
118: - === MPERS 5.9 and 5.10 (verbatim) ===
119: - 5.9 An entity shall present additional line items, headings and subtotals in the statement of comprehensive income (and in the income statement, if presented), when such presentation is relevant to an understanding of the entity's financial performance.
120: - 5.10 An entity shall not present or describe any items of income and expense as 'extraordinary items' in the statement of comprehensive income (or in the income statement, if presented) or in the notes.
121: - === CA 2016 s.249(4) â€” REGISTRAR-MANDATED NOTE DISCLOSURES (verbatim) â€” these need dedicated CoA accounts or tags ===
122: - (a) the directors' remuneration; (b) the directors' retirement benefits; (c) compensation to directors for loss of office; (d) loans, quasi-loans and other dealings in favour of directors; (e) the total of the amount paid to or receivable by the auditors as remuneration for their services as auditors, inclusive of all fees, percentages or other payments or consideration given by or from the company or by or from any subsidiary of the company.
123: - === EQUITY SECTION FOR A POST-2017 Sdn Bhd (derived from CA 2016 s.74/s.618 + MPERS 4.11(f)) ===
124: - Share Capital â€” single undivided amount, no par value, absorbed any pre-2017 share premium and capital redemption reserve by operation of law on 31 January 2017; cannot be reduced without leave of Court or the s.116 solvency route
125: - Retained Earnings / Accumulated Losses
126: - Revaluation Surplus (only if the PPE revaluation model under Section 17 is elected)
127: - Foreign Currency Translation Reserve (only if there is a foreign operation under Section 30)
128: - Hedging Reserve (only if hedge accounting under Section 12 is applied)
129: - Non-controlling Interests (consolidated accounts only)
130: - DO NOT CREATE: 'Share Premium' â€” abolished 31 January 2017, transitional use window expired 30 January 2019
131: - DO NOT CREATE: 'Capital Redemption Reserve' â€” abolished 31 January 2017, same expired window
132: - DO NOT CREATE: 'Authorised Share Capital' â€” the concept of authorised capital is abolished under CA 2016
133: 
134: ### UNVERIFIED â€” do not encode
135: 
136: - I could NOT read the MPERS (2025) standard text itself. masb.org.my gates every standard PDF behind a click-through/session check (pdf.php redirects to access.php; direct pdf_file paths return an HTML meta-refresh), and MPERS (2025) printed copies are stated to be 'available for sale'. My Section 4/5 statements about MPERS (2025) are therefore an INFERENCE from the IFRS Foundation's official third-edition markup PDF, resting on MASB's own published statement that the revised MPERS is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The inference is strong but is not a direct reading of MPERS (2025). Buy/obtain MPERS (2025) before treating its Section 4/5 wording as final.
137: - The verbatim MPERS (2016) Section 4/5 text I quoted was extracted from a mirrored copy of the MASB-branded PDF (title page: 'Malaysian Private Entities Reporting Standard (MPERS)', 'Â© Malaysian Accounting Standards Board (February 2016)', 'This document incorporates 2015 Amendments... effective 1 January 2017'), not from masb.org.my directly, because of the gate above. INTEGRITY CHECK PERFORMED: I compared it clause-by-clause against the IFRS Foundation's official third-edition markup PDF, which reproduces the second-edition text with deletions struck through â€” the second-edition baseline matches the mirror exactly, including the unusual '(ea)' sub-item. I am confident the text is authentic, but it is worth one confirmation against a purchased/official MASB copy before it is hard-coded as LAW in the product.
138: - The exact strike-through/underline direction in the 4.2 chapeau ('As a minimum, the The statement of financial position shall include...') was inferred from context, because pdftotext discards the markup formatting. My reading is that 'As a minimum, the' is DELETED and 'The' is INSERTED â€” which is corroborated by the new disaggregation instruction added to 4.3. But I cannot rule out the opposite direction from the text extraction alone. Note this change is presentational only; it does not alter the (a)-(r) list.
139: - Whether SSM has updated or will update the SSMxT / MBRS taxonomy for MPERS (2025) ahead of the 1 January 2027 effective date. The taxonomy documents I read are the SSMxT 2022 generation (built on IFRS Taxonomy 2022 and the then-current MPERS). If the product's chart of accounts is designed to map to MBRS, that mapping will likely need a refresh when SSM issues an MPERS-(2025)-aligned taxonomy. I found no announcement either way.
140: - The precise SSMxT element counts. The consultation document's summary table extracted in a garbled layout; my reading is that the FS-MPERS taxonomy has roughly 1,543 elements (about 564 drawn from the IFRS for SMEs 2022 taxonomy plus about 979 SSM extensions) versus roughly 2,047 for FS-MFRS. Treat these as order-of-magnitude only â€” the column alignment was ambiguous.
141: - I did not obtain the actual SSMxT FS-MPERS element list (the concrete tag names for each statement-of-financial-position and income-statement concept). It is embedded in SSM's mTool preparation software rather than published as a plain list on the website. This is the single highest-value remaining artefact for building a mappable default chart of accounts â€” recommend extracting it from mTool 2.1 directly.
142: - Several corroborating secondary sources returned HTTP 403 to automated fetching and could not be read: the PwC Malaysia MPERS alert (alert124-mpers.pdf), the MIA Accountants Today article on the third edition (at-mia.my), the Crowe Malaysia MBRS 2.0 insight, and the MIA MPERS FAQs PDF (mia.org.my). None of my verified facts depend on them â€” every load-bearing fact above came from MASB, SSM, the Companies Act text, or the IFRS Foundation.
143: - I did not investigate LHDN/tax-side line-item requirements (Form C categories, the tax computation's disallowable-expense breakdown) or MyInvois e-Invoice classification codes. These are separate regimes from MPERS and may impose their own de-facto account granularity on a Malaysian SME chart of accounts â€” they were outside this task's scope but are worth a follow-up before finalising the CoA.
144: - MPERS Section 6's combined 'Statement of Income and Retained Earnings' option: I verified from the MASB comparative article and Section 6's scope paragraph that the option exists when the only equity movements are profit or loss, dividends, error corrections and accounting-policy changes, and I verified SSMxT 2022 added a 'Statement of Retained earnings' to the MPERS entry points. I did NOT read Section 6's full conditions verbatim, so treat the precise eligibility conditions as unconfirmed.
145: 
146: ### Sources
147: 
148: - https://www.masb.org.my/pages.php?id=20
149: - https://www.masb.org.my/pages.php?id=615
150: - https://www.masb.org.my/press_list.php?id=489
151: - https://www.masb.org.my/press_list.php?id=490
152: - https://www.masb.org.my/pdf_file/2025Oct10_Notice%20ENG_CLEAN.pdf
153: - https://www.masb.org.my/pdf/MPERS%20article_A%20Comparative%20Analysis%20of%20PERS%20MPERS%20and%20MFRS%20Frameworks_old.pdf
154: - https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf
155: - https://www.ssm.com.my/Pages/Legal_Framework/PDF%20Tab%202/pn1-2017_r1.pdf
156: - https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
157: - https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
158: - https://ssm.com.my/Pages/Services/Other-Services/MBRS-document/Consultation-2022-SSM-Taxonomy-Templates-Stakeholders.pdf
159: - https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2025/ifrs-for-smes-standard-markup.pdf
160: - https://www.bdo.my/en-gb/insights/featured-insights/malaysian-business-reporting-system-(mbrs)-2-0
161: - https://c0aa0d68-de31-44c8-bb40-ac5f2e0a9fe4.filesusr.com/ugd/a87018_5b13be37ec354e388901ef7342d8f641.pdf?index=true
162: 
163: ## SSM / MBRS (XBRL filing)
164: 
165: ### Authority
166: 
167: **What MBRS legally mandates**
168: 
169: MBRS is the XBRL lodgement channel of Suruhanjaya Syarikat Malaysia (SSM / Companies Commission of Malaysia). Its legal hook is the Companies Act 2016 (CA 2016) lodgement duties, not a separate accounting law:
170: 
171: - CA 2016 s.259(1)(a) (verified verbatim from the Act on ssm.com.my): "A company shall lodge with the Registrar for each financial year the financial statements and reports required under this Act â€” (a) in the case of a private company, within thirty days from the financial statements and reports are circulated to its members under section 258". MBRS is the *format and channel* for discharging that duty.
172: - CA 2016 s.260(1)-(2): an **exempt private company MAY lodge a certificate of EPC status in lieu of s.259(1)(a)** â€” signed by a director, auditor and secretary â€” instead of lodging financial statements at all.
173: - Mandatory XBRL: SSM's live MBRS page (fetched 2026-07-24) carries the announcement "PELAKSANAAN SERAH SIMPAN MANDATORI BERPERINGKAT MELALUI SISTEM MBRS 2.0" (phased mandatory lodgement via MBRS 2.0), dated 27/11/2024, followed by FAQ announcements dated 1/3/2025 ("MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025") and 20/5/2025 ("IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025"). As of today (July 2026) all three phases are past, so full-set FS in XBRL via MBRS 2.0 is the live mandatory route.
174: - Applicability (SSM FAQ Â§1.5, verbatim): "Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS)." Under MBRS 2.0, companies regulated by Bank Negara Malaysia and FS prepared under CA 1965 â€” previously exempted â€” are **now** required to submit via MBRS.
175: - The taxonomy is binding as a *reporting vocabulary*: "Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document" â€” the preparer must instead use text-block tagging for extra detail.
176: - The Business Rules workbook (SSM-published, `Business_Rule_MBRS_v2_SSMxT_2022.xlsx`) is enforced in mTool as hard validations with severity Error/Warning. Failing an Error rule blocks generation of the XBRL instance.
177: 
178: **What MBRS does NOT mandate â€” this is the key negative finding**
179: 
180: - **SSM does NOT publish or prescribe a chart of accounts.** Searched the entire official document set â€” SSMxT_2022 Architecture Document (111 pp), MBRS FAQ v2.4 (54 pp), mTool 2.2 FS-CA2016 User Manual (105 pp), the SSM MBRS 2.0 overview deck, the live MBRS page, and all 1,633 filenames in the SSMxT_2022v1.0 taxonomy package â€” for "chart of accounts", "carta akaun", "ledger", "general ledger", "account code", "kod akaun": **zero hits**. There is no CoA artefact of any kind.
181: - What SSM prescribes is a **presentation/reporting taxonomy**: "SSM XBRL Taxonomy (SSMxT) is a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool (mTool)." The architecture document also states plainly: "The taxonomy is not intended to be an exhaustive representation of the requirements under the accounting standards and legislation."
182: - The bridge from a firm's own ledger to SSM's elements is explicitly the preparer's mapping job, not a prescribed structure. SSM FAQ Â§1.7 "Mapping Principles" (verbatim): "In preparing the XBRL file for financial statements, preparers will need to do mapping by the matching information within the financial statements (e.g. the amount of fixed assets) to a relevant concept within the Taxonomy (e.g. Property, Plant and Equipment)."
183: - Practical consequence for a ledger design: SSMxT constrains **what must be reportable at FS-presentation level**, and the Business Rules define a hard minimum set of elements that MUST carry a value. A firm is free to design any CoA it likes, provided the ledger can roll up to those elements. That is a constraint on the *aggregation targets*, not on account codes.
184: - MBRS also does not mandate the accounting standard â€” that is MASB's MFRS/MPERS. SSM only routes the filing to the matching entry point (FS-MFRS vs FS-MPERS).
185: - Audit exemption is a separate SSM instrument (Practice Directive 10/2024), not an MBRS rule. It changes whether the FS are audited, not the XBRL breakdown required.
186: 
187: ### Verified facts
188: 
189: - MBRS = Malaysian Business Reporting System, SSM's submission platform based on XBRL. It accepts: Annual Return (AR); Financial Statements and Key Financial Indicators (FS/KFI); Exemption Applications (EA) related to FS/KFI and AR; Annual Return per Companies Act 1965 (AR1965); and Financial Statements per Companies Act 1965. (SSM FAQ v2.4 Â§1.1, and the live SSM MBRS page.)
190: - MBRS has exactly three components: (a) SSM Taxonomy (SSMxT) â€” 'a dictionary of financial and non-financial reporting element of FS/KFI, AR and EA embedded in MBRS Preparation Tool'; (b) MBRS Preparation Tool (mTool) â€” an Excel-based, form/template-driven preparer app with inbuilt SSMxT browser and data validation; (c) MBRS Portal (mPortal) â€” the submission platform. (SSM FAQ v2.4 Â§1.2.)
191: - CURRENT RELEASE as of the live SSM MBRS page fetched 2026-07-24: MBRS 2.0. Preparation tool = mTool 2.2 (32-bit and 64-bit installers, plus a 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook). Latest taxonomy published = SSM Taxonomy (SSMxT) 2022, file SSMxT_2022v1.0.zip; SSMxT 2017 v1.0 and SSMxT 2014 (ssmt_20131231) are also listed as legacy. Supporting artefacts published: SSMxT Architecture 2022 (PDF) and 'SSM Business Rule MBRS 2.0 SSMxT 2022' (Excel).
192: - The taxonomy release date embedded throughout SSMxT_2022v1.0 is 2022-12-31; namespaces are under http://xbrl.ssm.com.my/taxonomy/2022-12-31/.
193: - SSMxT_2022v1.0 is based on the IFRS Accounting Taxonomy 2022 issued by the IFRS Foundation; it adopts 6,458 IFRS elements as its core, plus Malaysian jurisdictional extensions. MPERS filings sit on the IFRS for SMEs 2022 base (prefix `ifrs-smes`) plus SSM's own `ssmt-mpers` extensions.
194: - Mandatory implementation timeline as published in the Announcements table on the live SSM MBRS page: 27/11/2024 â€” notice of phased mandatory lodgement via MBRS 2.0; 1/3/2025 â€” FAQ 'MBRS 2.0 MANDATORY IMPLEMENTATION SECOND PHASE STARTING 1 MARCH 2025'; 20/5/2025 â€” FAQ 'IMPLEMENTATION OF MANDATORY SUBMISSION VIA PHASE 3 OF MBRS 2.0 BEGINNING 1 JUNE 2025'. No announcement newer than 20/5/2025 appears on the page as of 2026-07-24.
195: - Who is in scope (SSM FAQ Â§1.5, verbatim): 'Applicable to all companies which follow Malaysian Financial Reporting Standards (MFRS) and Malaysian Private Financial Reporting Standards (MPERS).' MBRS 2.0 additionally brought in companies regulated by Bank Negara Malaysia and FS prepared under CA 1965, both previously exempted from MBRS.
196: - SSMxT scope split (Architecture Â§1.4): 1) MFRS Taxonomy â€” for public/private companies and their subsidiaries, associates or JCEs required to prepare/lodge FS using MFRS; 2) MPERS Taxonomy â€” for financial statements of PRIVATE companies required to prepare or lodge FS using MPERS; 3) Exemption Application Taxonomy; 4) Annual Return Taxonomy.
197: - MFRS and MPERS each split into TWO access points: (a) Financial Statements (FS) â€” 'a taxonomy containing all statements for reporting under respective accounting standards'; (b) Key Financial Indicators (KFI) â€” 'a taxonomy listing basic financial concepts available for financial reporting IF THE FILER OPTS NOT TO FILE FULL FS FILING IN XBRL'. KFI is only permitted once SSM approves an EA2 application (exemption from filing FS in full XBRL format, CA 2016 s.604(2)).
198: - Applicable statements for a FULL financial statements filing (Architecture Table 1 and FAQ Â§1.6, minimum requirement list): Statement of Financial Position (Current/Non-current OR Order of liquidity presentation); Statement of Profit or Loss (Function of expenses OR Nature of expenses); Statement of Cash Flows (Direct OR Indirect); Statement of Changes in Equity; Statement of Retained Earnings; Notes to accounts. Non-financial under CA 2016: Director's report; Statement of directors; Directors' business review; Auditors report to members. Plus 'Involvement in Stock Exchange' for Bursa-listed companies.
199: - Reporting-concept counts (Architecture Table 3): FS under CA 2016 / MPERS = 1,211 concepts from IFRS for SMEs 2022 + 1,164 SSM concepts = 2,375 total. FS under CA 2016 / MFRS = 5,247 IFRS + 950 SSM = 6,197. Reports under FS (CA 2016) = 158. Document & Entity information CA 2016 = 39.
200: - COMPANY EXTENSIONS ARE PROHIBITED (Architecture Â§1.8, verbatim): 'Company extensions to the SSMxT_2022v1.0 are not allowed. Therefore, entities must not extend the Taxonomy when creating an instance document, instead, the preparer needs to provide the necessary level of detail by text-block tagging the information using appropriate [text block] concepts.'
201: - ELR sort-code scheme for the Financial Statements taxonomy (Architecture Â§4.2.4.6): 01xxxx = Filing information; 02xxxx = Scope of filing; 1xxxxx = Companies Act 2016 disclosures; 2xxxxx = Statement of financial position; 3xxxxx = Statement of profit or loss; 4xxxxx = Statement of comprehensive income; 5xxxxx = Statement of cash flows; 6xxxxx = Statement of Changes in Equity / Statement of Retained Earnings; 7xxxxx = List of notes and other disclosures. [990000] = Axis - Defaults.
202: - The FS-MPERS entry point is ssmt-fs-mpers_2022-12-31_entry_point.xsd at http://xbrl.ssm.com.my/taxonomy/2022-12-31/rep/ssm/ca-2016/fs/mpers/. Its rol_ schema declares exactly these financial-statement ELRs (read directly from the downloaded taxonomy): [020000] Scope of filing; [120000] Disclosure - Directors report; [120100] Disclosure - Statement by directors; [120200] Disclosure - Director business review; [130000] Disclosure - Auditors report to members; [200100] Statement of financial position; [200100a] ...details; [200200] Sub-classification of assets, liabilities and equity; [210000] Statement of financial position, by current/non-current method; [210100] Sub-classification ... by current/non-current method; [220000] Statement of financial position, by order of liquidity method; [220100] Sub-classification ... by order of liquidity method; [300100] Statement of income and expenditure, Profit (loss); [300100a] ...Gross profit; [300100b] ...Operating profit; [300100c] ...Profit (loss) attributable to; [300200] Analysis of Income and Expense; [300200a] ...Employee benefit expense; [300200b] ...Other expenses by function; [300200c] ...Other expenses by nature; [310000] Statement of profit or loss, by function of expense; [310100] Analysis of profit or loss, by function of expense; [320000] Statement of profit or loss, by nature of expense; [320100] Analysis of profit or loss, by nature of expense; [400100]/[400100a] Statement of Comprehensive Income; [410000] SCI - Net of tax; [420000] SCI - Before tax; [500100] Statement of cash flows; [510000] direct method; [520000] indirect method; [610000] Statement of Changes in Equity; [620000] Statement of Retained Earnings; [710000] Notes - Corporate information; [720000] Notes - Summary of significant accounting policies; [730000] Notes - List of notes; [740000] Notes - Issued capital; [750000] Notes - Related party transactions; [990000] Axis - Defaults.
203: - Note that FS-MPERS has only FIVE note ELRs ([710000] Corporate information, [720000] Summary of significant accounting policies, [730000] List of notes, [740000] Issued capital, [750000] Related party transactions). All other note detail is carried by text-block concepts, not by structured elements.
204: - Which presentation variant renders is driven by four 'Scope of filing' switches that act as table-layout filters (Architecture Â§2.10.7.1): ssmt_MethodUsedForPreparingStatementOfFinancialPosition, ssmt_MethodUsedForPreparingStatementOfProfitOrLoss, ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome, ssmt_MethodUsedForPreparingStatementOfCashFlows. There is also ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity.
205: - Every FS statement is dimensioned by ifrs-smes_ConsolidatedAndSeparateFinancialStatementsAxis with members ifrs-smes_ConsolidatedMember (label 'Group [member]') and ifrs-smes_SeparateMember (label 'Company [member]').
206: - MINIMUM BREAKDOWN â€” hard validation, FS-MPERS Statement of Financial Position. Business rule IDs SOFP-Mandatory-fs-mpers-01 / 01A / 01B / 01C (scenario: Current-Noncurrent, Consolidated/Separate, current/previous year) and -02/02A/02B/02C (scenario: Order of liquidity). Severity = Error. Message: 'Property, plant and equipment, Investment properties, Intangible assets, Investments in associates, Investments in joint ventures, Inventories, Trade and other non-current receivables, Trade and other current receivables, Total assets, Issued capital, Total equity, Retained earnings, Reserves, Total equity attributable to owners, Employee benefits, Provisions, Trade and other non-current payables, Trade and other current payables, Total current liabilities, Total liabilities, Total equity and liabilities, Loans and borrowings, Employee benefits, Provisions, Investments in subsidiaries, Other non-current assets, Other current assets, Equity - other components, Cash and cash equivalents, Loans and borrowings -> MUST be reported'.
207: - MINIMUM BREAKDOWN â€” hard validation, FS-MPERS Statement of Profit or Loss. Business rule IDs SOPL-Mandatory-fs-mpers-01/01A/01B/01C (Function of expense) and -02/02A/02B/02C (Nature of expense), current and previous year, Consolidated and Separate. Severity = Error. Message: 'Revenue, Cost of sales, Other income, Other expenses, Finance income, Finance costs, Profit (loss) before tax, Profit (loss) from continuing operations net, Profit (loss) -> MUST be reported'.
208: - Additional FS-MPERS P&L rules: SOPL-Mandatory-fs-mpers-03 â€” if 'Disclosure of financial statements audit status' is 'audited' then "Total auditor's remuneration" MUST be reported. SOPL-Mandatory-fs-mpers-04 â€” if the filer selects 'Group' then profit and comprehensive income attributable to owners of parent AND to non-controlling interests MUST be reported.
209: - Balance-check rule: Mandatory-fs-mpers-109, severity Error â€” 'Assets should be equal to Equity and Liabilities'.
210: - Rule volume per statement for FS-MPERS (counted from the SSM Business Rules workbook, sheet 'FS-MPERS - CA2016', 176 rules total): Filing Information 32, Scope of filing 27, Directors report 20, Statement by directors 18, Issued capital 13, Statement of Changes in Equity 12, Statement of profit or loss 10, Auditors report to members 9, Statement of financial position 9, Statement of cash flows 9, Related party transactions 5, Statement of Retained Earnings 5, Corporate information 4, Director business review 2, Summary of significant accounting policies 1.
211: - Mandatory scope-of-filing facts for FS-MPERS (Error severity): Date of financial statements approved by Board of Directors; Date of circulation of FS and reports to members; Date of Statutory Declaration; MSIC Code; Description of business. Mandatory filing-information facts include: New company registration number; Name of company; Origin of company; Status of company; Type of company; current financial year start and end dates; Disclosure of FS audit status; Status of carrying on business during the financial year; Basis of accounting standards applied; Type of submission; Nature of financial statements; Level of rounding used; Description of presentation currency; Name and version of software used to generate the XBRL file; Taxonomy version; Application of submission.
212: - Audit-exemption interaction, encoded as a business rule (Mandatory-dei-fs-mpers-22/23): if Status of company = 'Private company' and audit status = 'Unaudited', then 'Description of audit exemption category' MUST be reported, and must be one of 'Zero-revenue company', 'Threshold-Qualified company', or 'Dormant company'.
213: - FS ENTRY POINTS under CA 2016 (SSM FAQ Â§1.3 and MBRS Summary Sheet): FS-MFRS, FS-MPERS, FS-CLBG (Company Limited by Guarantee), FS-FC (Foreign Company, only after EA3 approval), FS-EPC (Exempt Private Companies), FS-BNM (BNM-regulated). CA 1965 adds FS-BNM-1965, FS-CLBS-1965, FS-CLBG-1965, FS-EPC-1965, FS-FC-1965. KFI entry points: KFI-MFRS, KFI-MPERS, KFI-CLBG, KFI-FC â€” all gated on EA2 approval.
214: - EXEMPT PRIVATE COMPANIES â€” this is the real 'small private company' answer. CA 2016 s.260(1) (verbatim from the Act PDF hosted on ssm.com.my): 'An exempt private company may lodge with the Registrar for each financial year a certificate relating to its status as an exempt private company in lieu of the requirements in paragraph 259(1)(a) within thirty days from the circulation of the financial statements and reports are circulated under section 258.' s.260(2): the certificate is signed by a director, auditor and secretary confirming (a) the company is and has at all relevant times been an exempt private company; (b) duly audited FS and reports have been circulated to members; (c) as at the FS date the company appeared able to meet its liabilities as they fall due.
215: - Confirmed structurally in the taxonomy: the FS-EPC entry point (ssmt-fs-epc_2022-12-31) contains NO financial statements at all. Its only ELRs are [020000] Scope of filing, [110000] Disclosure - Auditors statement, [120000] Disclosure - Certificate of Exempt Private Company, [990000] Axis - Defaults. There is no Statement of Financial Position, no Statement of Profit or Loss, no cash flows, no equity statement in FS-EPC.
216: - KFI-MPERS (the reduced filing available only after EA2 approval) has these ELRs: [020000] Scope of filing, [110000] Directors Report, [110100] Statement by directors, [110200] Director business review, [120000] Auditors report to members, [210000] SOFP by current/non-current, [220000] SOFP by order of liquidity, [310000] Statement of Profit or Loss, [410000] Statement of Cash Flows, [420000] Statement of Changes in Equity, [430000] Statement of Retained Earnings, [510000] Notes, [990000] Axis - Defaults.
217: - Audit exemption for private companies (separate instrument, verified from the PD PDF on ssm.com.my): Practice Directive No. 10/2024 dated 16 December 2024, issued under s.20C CCM Act 2001 and s.267(2) CA 2016. A private company qualifies if it meets at least TWO of: (a) annual revenue in the current FY and the immediate past two FYs does not exceed RM3,000,000; (b) total assets in the current SOFP and the immediate past two FYs do not exceed RM3,000,000; (c) employees at end of the current FY and the immediate past two FYs do not exceed 30. Thresholds are phased over three years: Phase 1 (FY commencing 1 Jan 2025 to 31 Dec 2025; submission year from 1 Jan 2026) = RM1,000,000 turnover / RM1,000,000 assets / 10 employees. Phase 2 (FY commencing on or after 1 Jan 2026 to 31 Dec 2026; submission year from 1 Jan 2027) = RM2,000,000 / RM2,000,000 / 20 employees. Phase 3 (FY commencing on or after 1 Jan 2027; submission year from 1 Jan 2028) = RM3,000,000 / RM3,000,000 / 30 employees.
218: - MBRS was in live production use for MPERS filings during 2025: SSM's own Annual Dialogue 2025 issues paper records stakeholder complaints about system slowness 'especially in filing MBRS FS-MPERS, FS MFRS' during the Extension-of-Time peak period, and confirms auto-registration was introduced for Penyata Tahunan (AR) and Penyata Kewangan (FS) via MBRS.
219: - Element-naming law in SSMxT (Architecture Â§4.2.5): element id = 'prefix_ElementName' (e.g. ssmt-mpers_BuildingOnFreeholdLand); names follow Label Camel Case Concatenation; abstract organising concepts end in 'Abstract' or 'LineItems'; text blocks end in 'Explanatory'; dimensions end in 'Axis'; hypercubes end in 'Table'; domain members end in 'Member'.
220: - iXBRL is supported: 'Inline XBRL (iXBRL) can be used to provide filings based on the SSM Taxonomy files' â€” and iXBRL reduces the need for company extensions because untagged human-readable content can ride along in the instance.

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$lines = Get-Content -LiteralPath '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; for ("'$i=79; $i -lt [Math]::Min(170,$lines.Count); $i++) { '"'{0:D3}: {1}' -f ("'$i+1), $lines[$i] }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 643ms:
080: - === MPERS 4.11 â€” SUB-CLASSIFICATIONS, FACE OR NOTES (verbatim) â€” THE PRACTICAL CoA DRIVER ===
081: - 4.11 An entity shall disclose, either in the statement of financial position or in the notes, the following subclassifications of the line items presented:
082: - (a) property, plant and equipment in classifications appropriate to the entity;
083: - (b) trade and other receivables showing separately amounts due from related parties, amounts due from other parties and receivables arising from accrued income not yet billed;
084: - (c) inventories, showing separately amounts of inventories: (i) held for sale in the ordinary course of business; (ii) in the process of production for such sale; and (iii) in the form of materials or supplies to be consumed in the production process or in the rendering of services.
085: - (d) trade and other payables, showing separately amounts payable to trade suppliers, payable to related parties, deferred income and accruals;
086: - (e) provisions for employee benefits and other provisions; and
087: - (f) classes of equity, such as paid-in capital, share premium, retained earnings and items of income and expense that, as required by this Standard, are recognised in other comprehensive income and presented separately in equity.
088: - === MPERS 4.12 â€” SHARE CAPITAL DISCLOSURES (verbatim) ===
089: - 4.12 An entity with share capital shall disclose the following, either in the statement of financial position or in the notes: (a) for each class of share capital: (i) the number of shares authorised. (ii) the number of shares issued and fully paid, and issued but not fully paid. (iii) par value per share or that the shares have no par value. (iv) a reconciliation of the number of shares outstanding at the beginning and at the end of the period. This reconciliation need not be presented for prior periods. (v) the rights, preferences and restrictions attaching to that class including restrictions on the distribution of dividends and the repayment of capital. (vi) shares in the entity held by the entity or by its subsidiaries or associates. (vii) shares reserved for issue under options and contracts for the sale of shares, including the terms and amounts. (b) a description of each reserve within equity.
090: - === MPERS 4.4-4.8 â€” CURRENT/NON-CURRENT (verbatim, unchanged in 3rd ed) ===
091: - 4.4 An entity shall present current and non-current assets, and current and non-current liabilities, as separate classifications in its statement of financial position in accordance with paragraphs 4.5-4.8, except when a presentation based on liquidity provides information that is reliable and more relevant. When that exception applies, all assets and liabilities shall be presented in order of approximate liquidity (ascending or descending).
092: - 4.5 An entity shall classify an asset as current when: (a) it expects to realise the asset, or intends to sell or consume it, in the entity's normal operating cycle; (b) it holds the asset primarily for the purpose of trading; (c) it expects to realise the asset within twelve months after the reporting date; or (d) the asset is cash or a cash equivalent, unless it is restricted from being exchanged or used to settle a liability for at least twelve months after the reporting date.
093: - 4.6 An entity shall classify all other assets as non-current. When the entity's normal operating cycle is not clearly identifiable, its duration is assumed to be twelve months.
094: - 4.7 An entity shall classify a liability as current when: (a) it expects to settle the liability in the entity's normal operating cycle; (b) it holds the liability primarily for the purpose of trading; (c) the liability is due to be settled within twelve months after the reporting date; or (d) the entity does not have an unconditional right to defer settlement of the liability for at least twelve months after reporting date.
095: - 4.8 An entity shall classify all other liabilities as non-current.
096: - === MPERS SECTION 5, PARA 5.5 â€” STATEMENT OF COMPREHENSIVE INCOME, MINIMUM FACE LINE ITEMS (verbatim) ===
097: - 5.5 As a minimum, an entity shall include, in the statement of comprehensive income, line items that present the following amounts for the period:
098: - (a) revenue.
099: - (b) finance costs.
100: - (c) share of the profit or loss of investments in associates (see Section 14 Investments in Associates) and jointly controlled entities (see Section 15 Investments in Joint Ventures) accounted for using the equity method.
101: - (d) tax expense excluding tax allocated to items (e), (g) and (h) (see paragraph 29.35).
102: - (e) a single amount comprising the total of: (i) the post-tax profit or loss of a discontinued operation; and (ii) the post-tax gain or loss attributable to an impairment, or reversal of an impairment, of the assets in the discontinued operation (see Section 27 Impairment of Assets), both at the time and subsequent to being classified as a discontinued operation and to the disposal of the net assets constituting the discontinued operation.
103: - (f) profit or loss (if an entity has no items of other comprehensive income, this line need not be presented).
104: - (g) each item of other comprehensive income (see paragraph 5.4(b)) classified by nature (excluding amounts in (h)). Such items shall be grouped into those that, in accordance with this Standard: (i) will not be reclassified subsequently to profit or lossâ€”ie those in paragraph 5.4(b)(i)-(ii) and (iv); and (ii) will be reclassified subsequently to profit or loss when specific conditions are metâ€”ie those in paragraph 5.4(b)(iii).
105: - (h) share of the other comprehensive income of associates and jointly controlled entities accounted for by the equity method.
106: - (i) total comprehensive income (if an entity has no items of other comprehensive income, it may use another term for this line such as profit or loss).
107: - === MPERS 5.6 â€” ALLOCATIONS (verbatim; only relevant where consolidated) ===
108: - 5.6 An entity shall disclose separately the following items in the statement of comprehensive income as allocations for the period: (a) profit or loss for the period attributable to (i) non-controlling interest; and (ii) owners of the parent. (b) total comprehensive income for the period attributable to (i) non-controlling interest; and (ii) owners of the parent.
109: - === MPERS 5.2 and 5.7 â€” ONE-STATEMENT vs TWO-STATEMENT CHOICE (verbatim) ===
110: - 5.2 An entity shall present its total comprehensive income for a period either: (a) in a single statement of comprehensive income, in which case the statement of comprehensive income presents all items of income and expense recognised in the period; or (b) in two statementsâ€”an income statement and a statement of comprehensive incomeâ€”in which case the income statement presents all items of income and expense recognised in the period except those that are recognised in total comprehensive income outside of profit or loss as permitted or required by this Standard.
111: - 5.7 Under the two-statement approach, the income statement shall display, as a minimum, line items that present the amounts in paragraph 5.5(a)-5.5(f) for the period, with profit or loss as the last line. The statement of comprehensive income shall begin with profit or loss as its first line and shall display, as a minimum, line items that present the amounts in paragraph 5.5(g)-5.5(i) and paragraph 5.6 for the period.
112: - === MPERS 5.4(b) â€” THE ONLY FOUR ITEMS OF OTHER COMPREHENSIVE INCOME (verbatim) â€” a closed list, so OCI accounts in a CoA are bounded ===
113: - (i) some gains and losses arising on translating the financial statements of a foreign operation (see Section 30 Foreign Currency Translation); (ii) some actuarial gains and losses (see Section 28 Employee Benefits); (iii) some changes in fair values of hedging instruments (see Section 12 Other Financial Instrument Issues); and (iv) changes in the revaluation surplus for property, plant and equipment measured in accordance with the revaluation model (see Section 17 Property, Plant and Equipment).
114: - === MPERS 5.11 â€” ANALYSIS OF EXPENSES: BY NATURE vs BY FUNCTION (verbatim, unchanged in 3rd ed) ===
115: - 5.11 An entity shall present an analysis of expenses using a classification based on either the nature of expenses or the function of expenses within the entity, whichever provides information that is reliable and more relevant.
116: - Analysis by nature of expense â€” (a) Under this method of classification, expenses are aggregated in the statement of comprehensive income according to their nature (for example, depreciation, purchases of materials, transport costs, employee benefits and advertising costs) and are not reallocated among various functions within the entity.
117: - Analysis by function of expense â€” (b) Under this method of classification, expenses are aggregated according to their function as part of cost of sales or, for example, the costs of distribution or administrative activities. At a minimum, an entity discloses its cost of sales under this method separately from other expenses.
118: - === MPERS 5.9 and 5.10 (verbatim) ===
119: - 5.9 An entity shall present additional line items, headings and subtotals in the statement of comprehensive income (and in the income statement, if presented), when such presentation is relevant to an understanding of the entity's financial performance.
120: - 5.10 An entity shall not present or describe any items of income and expense as 'extraordinary items' in the statement of comprehensive income (or in the income statement, if presented) or in the notes.
121: - === CA 2016 s.249(4) â€” REGISTRAR-MANDATED NOTE DISCLOSURES (verbatim) â€” these need dedicated CoA accounts or tags ===
122: - (a) the directors' remuneration; (b) the directors' retirement benefits; (c) compensation to directors for loss of office; (d) loans, quasi-loans and other dealings in favour of directors; (e) the total of the amount paid to or receivable by the auditors as remuneration for their services as auditors, inclusive of all fees, percentages or other payments or consideration given by or from the company or by or from any subsidiary of the company.
123: - === EQUITY SECTION FOR A POST-2017 Sdn Bhd (derived from CA 2016 s.74/s.618 + MPERS 4.11(f)) ===
124: - Share Capital â€” single undivided amount, no par value, absorbed any pre-2017 share premium and capital redemption reserve by operation of law on 31 January 2017; cannot be reduced without leave of Court or the s.116 solvency route
125: - Retained Earnings / Accumulated Losses
126: - Revaluation Surplus (only if the PPE revaluation model under Section 17 is elected)
127: - Foreign Currency Translation Reserve (only if there is a foreign operation under Section 30)
128: - Hedging Reserve (only if hedge accounting under Section 12 is applied)
129: - Non-controlling Interests (consolidated accounts only)
130: - DO NOT CREATE: 'Share Premium' â€” abolished 31 January 2017, transitional use window expired 30 January 2019
131: - DO NOT CREATE: 'Capital Redemption Reserve' â€” abolished 31 January 2017, same expired window
132: - DO NOT CREATE: 'Authorised Share Capital' â€” the concept of authorised capital is abolished under CA 2016
133: 
134: ### UNVERIFIED â€” do not encode
135: 
136: - I could NOT read the MPERS (2025) standard text itself. masb.org.my gates every standard PDF behind a click-through/session check (pdf.php redirects to access.php; direct pdf_file paths return an HTML meta-refresh), and MPERS (2025) printed copies are stated to be 'available for sale'. My Section 4/5 statements about MPERS (2025) are therefore an INFERENCE from the IFRS Foundation's official third-edition markup PDF, resting on MASB's own published statement that the revised MPERS is 'fully aligned with the IFRS for SMEs Accounting Standard issued by the IASB, except for changes relating to scope applicability and nomenclature.' The inference is strong but is not a direct reading of MPERS (2025). Buy/obtain MPERS (2025) before treating its Section 4/5 wording as final.
137: - The verbatim MPERS (2016) Section 4/5 text I quoted was extracted from a mirrored copy of the MASB-branded PDF (title page: 'Malaysian Private Entities Reporting Standard (MPERS)', 'Â© Malaysian Accounting Standards Board (February 2016)', 'This document incorporates 2015 Amendments... effective 1 January 2017'), not from masb.org.my directly, because of the gate above. INTEGRITY CHECK PERFORMED: I compared it clause-by-clause against the IFRS Foundation's official third-edition markup PDF, which reproduces the second-edition text with deletions struck through â€” the second-edition baseline matches the mirror exactly, including the unusual '(ea)' sub-item. I am confident the text is authentic, but it is worth one confirmation against a purchased/official MASB copy before it is hard-coded as LAW in the product.
138: - The exact strike-through/underline direction in the 4.2 chapeau ('As a minimum, the The statement of financial position shall include...') was inferred from context, because pdftotext discards the markup formatting. My reading is that 'As a minimum, the' is DELETED and 'The' is INSERTED â€” which is corroborated by the new disaggregation instruction added to 4.3. But I cannot rule out the opposite direction from the text extraction alone. Note this change is presentational only; it does not alter the (a)-(r) list.
139: - Whether SSM has updated or will update the SSMxT / MBRS taxonomy for MPERS (2025) ahead of the 1 January 2027 effective date. The taxonomy documents I read are the SSMxT 2022 generation (built on IFRS Taxonomy 2022 and the then-current MPERS). If the product's chart of accounts is designed to map to MBRS, that mapping will likely need a refresh when SSM issues an MPERS-(2025)-aligned taxonomy. I found no announcement either way.
140: - The precise SSMxT element counts. The consultation document's summary table extracted in a garbled layout; my reading is that the FS-MPERS taxonomy has roughly 1,543 elements (about 564 drawn from the IFRS for SMEs 2022 taxonomy plus about 979 SSM extensions) versus roughly 2,047 for FS-MFRS. Treat these as order-of-magnitude only â€” the column alignment was ambiguous.
141: - I did not obtain the actual SSMxT FS-MPERS element list (the concrete tag names for each statement-of-financial-position and income-statement concept). It is embedded in SSM's mTool preparation software rather than published as a plain list on the website. This is the single highest-value remaining artefact for building a mappable default chart of accounts â€” recommend extracting it from mTool 2.1 directly.
142: - Several corroborating secondary sources returned HTTP 403 to automated fetching and could not be read: the PwC Malaysia MPERS alert (alert124-mpers.pdf), the MIA Accountants Today article on the third edition (at-mia.my), the Crowe Malaysia MBRS 2.0 insight, and the MIA MPERS FAQs PDF (mia.org.my). None of my verified facts depend on them â€” every load-bearing fact above came from MASB, SSM, the Companies Act text, or the IFRS Foundation.
143: - I did not investigate LHDN/tax-side line-item requirements (Form C categories, the tax computation's disallowable-expense breakdown) or MyInvois e-Invoice classification codes. These are separate regimes from MPERS and may impose their own de-facto account granularity on a Malaysian SME chart of accounts â€” they were outside this task's scope but are worth a follow-up before finalising the CoA.
144: - MPERS Section 6's combined 'Statement of Income and Retained Earnings' option: I verified from the MASB comparative article and Section 6's scope paragraph that the option exists when the only equity movements are profit or loss, dividends, error corrections and accounting-policy changes, and I verified SSMxT 2022 added a 'Statement of Retained earnings' to the MPERS entry points. I did NOT read Section 6's full conditions verbatim, so treat the precise eligibility conditions as unconfirmed.
145: 
146: ### Sources
147: 
148: - https://www.masb.org.my/pages.php?id=20
149: - https://www.masb.org.my/pages.php?id=615
150: - https://www.masb.org.my/press_list.php?id=489
151: - https://www.masb.org.my/press_list.php?id=490
152: - https://www.masb.org.my/pdf_file/2025Oct10_Notice%20ENG_CLEAN.pdf
153: - https://www.masb.org.my/pdf/MPERS%20article_A%20Comparative%20Analysis%20of%20PERS%20MPERS%20and%20MFRS%20Frameworks_old.pdf
154: - https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf
155: - https://www.ssm.com.my/Pages/Legal_Framework/PDF%20Tab%202/pn1-2017_r1.pdf
156: - https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
157: - https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
158: - https://ssm.com.my/Pages/Services/Other-Services/MBRS-document/Consultation-2022-SSM-Taxonomy-Templates-Stakeholders.pdf
159: - https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2025/ifrs-for-smes-standard-markup.pdf
160: - https://www.bdo.my/en-gb/insights/featured-insights/malaysian-business-reporting-system-(mbrs)-2-0
161: - https://c0aa0d68-de31-44c8-bb40-ac5f2e0a9fe4.filesusr.com/ugd/a87018_5b13be37ec354e388901ef7342d8f641.pdf?index=true
162: 
163: ## SSM / MBRS (XBRL filing)
164: 
165: ### Authority
166: 
167: **What MBRS legally mandates**
168: 
169: MBRS is the XBRL lodgement channel of Suruhanjaya Syarikat Malaysia (SSM / Companies Commission of Malaysia). Its legal hook is the Companies Act 2016 (CA 2016) lodgement duties, not a separate accounting law:
170: 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$lines = Get-Content -LiteralPath '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; for ("'$i=220; $i -lt [Math]::Min(380,$lines.Count); $i++) { '"'{0:D3}: {1}' -f ("'$i+1), $lines[$i] }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 801ms:
221: - mTool is Windows/Excel only â€” no macOS, no OpenOffice. Supported Microsoft Office versions: 2010, 2013, 2016, 2019, 2021 and 365. This matters for any automation design.
222: - Lodger/Maker split under MBRS 2.0: a Lodger (Company Secretary, Company Agent, Liquidator, Official Receiver, Other Role) must hold an ACTIVE Practising Certificate under s.241 CA 2016 and must purchase a PKI Digital Certificate via Pos Digicert; a Maker (the corresponding assistant role) prepares and uploads the XBRL file but cannot lodge.
223: 
224: ### Line items / taxonomy / categories
225: 
226: - === FS-MPERS [210000] STATEMENT OF FINANCIAL POSITION, BY CURRENT/NON-CURRENT METHOD â€” full presentation tree, read directly from pre_ssmt-fs-mpers_2022-12-31_role-210000.xml ===
227: - ssmt_StatementOfFinancialPositionLineItems | Statement of financial position [line items]
228: - NON-CURRENT ASSETS (ifrs-smes_NoncurrentAssetsAbstract):
229: - ifrs-smes_PropertyPlantAndEquipment | Total property, plant and equipment
230: - ifrs-smes_InvestmentProperty | Investment properties
231: - ssmt-mpers_NoncurrentBiologicalAssets | Biological assets
232: - ifrs-smes_IntangibleAssetsAndGoodwill | Intangible assets
233: - ssmt-mpers_InvestmentInSubisidiaries | Investments in subsidiaries
234: - ifrs-smes_InvestmentsInAssociates | Total investments in associates
235: - ifrs-smes_InvestmentsInJointVentures | Total of investments in joint ventures
236: - ssmt-mpers_NoncurrentInvestmentsOtherThanInvestmentsAccountedForUsingEquityMethod | Other investments
237: - ifrs-smes_NoncurrentReceivables | Total trade and other non-current receivables
238: - ifrs-smes_DeferredTaxAssets | Deferred tax assets
239: - ssmt-mpers_OtherNoncurrentAssets | Other non-current assets
240: - ifrs-smes_NoncurrentAssets | Total non-current assets
241: - CURRENT ASSETS (ifrs-smes_CurrentAssetsAbstract):
242: - ifrs-smes_InventoriesTotal | Total inventories
243: - ssmt-mpers_CurrentBiologicalAssets | Biological assets
244: - ssmt-mpers_CurrentInvestments | Other investments
245: - ifrs-smes_TradeAndOtherCurrentReceivables | Total trade and other current receivables
246: - ifrs-smes_CurrentTaxAssetsCurrent | Current tax assets
247: - ssmt-mpers_CurrentDerivativeFinancialAssets | Derivative financial assets
248: - ssmt_CashAndBankBalances | Cash and cash equivalents
249: - ssmt-mpers_OtherCurrentAssets | Other current assets
250: - ifrs-smes_CurrentAssets | Total current assets
251: - ifrs-smes_Assets | Total assets
252: - EQUITY (ifrs-smes_EquityAbstract):
253: - ifrs-smes_IssuedCapital | Total issued capital
254: - ifrs-smes_RetainedEarnings | Retained earnings
255: - ifrs-smes_TreasuryShares | Treasury shares
256: - ifrs-smes_OtherReserves | Reserves
257: - ifrs-smes_EquityAttributableToOwnersOfParent | Total equity attributable to owners
258: - ssmt-mpers_OtherComponentsOfEquity | Equity - other components
259: - ifrs-smes_NoncontrollingInterests | Non-controlling interests
260: - ifrs-smes_Equity | Total equity
261: - NON-CURRENT LIABILITIES (ifrs-smes_NoncurrentLiabilitiesAbstract):
262: - ssmt-mpers_NoncurrentBorrowings | Loans and borrowings
263: - ifrs-smes_NoncurrentProvisionsForEmployeeBenefits | Employee benefits
264: - ifrs-smes_NoncurrentProvisions | Provisions
265: - ifrs-smes_DeferredTaxLiabilities | Deferred tax liabilities
266: - ifrs-smes_NoncurrentPayables | Total trade and other non-current payables
267: - ssmt-mpers_OtherNoncurrentLiabilities | Other non-current liabilities
268: - ifrs-smes_NoncurrentLiabilities | Total non-current liabilities
269: - CURRENT LIABILITIES (ifrs-smes_CurrentLiabilitiesAbstract):
270: - ifrs-smes_ShorttermBorrowings | Loans and borrowings
271: - ifrs-smes_CurrentProvisionsForEmployeeBenefits | Employee benefits
272: - ifrs-smes_CurrentProvisions | Provisions
273: - ifrs-smes_TradeAndOtherCurrentPayables | Total trade and other current payables
274: - ifrs-smes_CurrentTaxLiabilitiesCurrent | Current tax liabilities
275: - ssmt-mpers_CurrentDerivativeFinancialLiabilities | Derivative financial liabilities
276: - ssmt-mpers_OtherCurrentLiabilities | Other current liabilities
277: - ifrs-smes_CurrentLiabilities | Total current liabilities
278: - ifrs-smes_Liabilities | Total liabilities
279: - ifrs-smes_EquityAndLiabilities | Total equity and liabilities
280: - === FS-MPERS [310000] STATEMENT OF PROFIT OR LOSS, BY FUNCTION OF EXPENSE â€” full tree ===
281: - ssmt-mpers_StatementOfProfitOrLossLineItems | Statement of profit or loss [line items]
282: - CONTINUING OPERATIONS (ssmt-mpers_ContinuingOperationsAbstract):
283: - ifrs-smes_Revenue | Total revenue
284: - ifrs-smes_CostOfSales | Total cost of sales
285: - ifrs-smes_GrossProfit | Gross profit
286: - ifrs-smes_OtherIncome | Total other income
287: - ssmt-mpers_SellingAndDistributionExpenses | Selling and distribution expenses
288: - ifrs-smes_AdministrativeExpense | Administrative expenses
289: - ifrs-smes_ResearchAndDevelopmentExpense | Research and development expense
290: - ifrs-smes_OtherExpenseByFunction | Other expenses
291: - ssmt-mpers_ProfitLossFromOperatingActivities | Profit (loss) from operating activities
292: - ifrs-smes_FinanceIncome | Total finance income
293: - ifrs-smes_FinanceCosts | Finance costs
294: - ifrs-smes_ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod | Share of profit (loss) of associates and joint ventures accounted for using equity method
295: - ifrs-smes_ProfitLossBeforeTax | Profit (loss) before tax, from continuing operations
296: - ifrs-smes_IncomeTaxExpenseContinuingOperations | Tax expense
297: - ssmt-mpers_ContributionOfZakat | Contribution to zakat
298: - ifrs-smes_ProfitLossFromContinuingOperations | Profit (loss) from continuing operations, net
299: - DISCONTINUED OPERATIONS: ifrs-smes_ProfitLossFromDiscontinuedOperations | Profit (loss) before tax, from discontinued operation
300: - ifrs-smes_ProfitLoss | Total Profit (Loss)
301: - ATTRIBUTION: ifrs-smes_ProfitLossAttributableToOwnersOfParent | ssmt-mpers_ProfitLossAttributableToOtherComponentsOfEquity | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
302: - === FS-MPERS [320000] STATEMENT OF PROFIT OR LOSS, BY NATURE OF EXPENSE â€” differences from the function view ===
303: - ifrs-smes_Revenue | Total revenue
304: - ifrs-smes_OtherIncome | Total other income
305: - ifrs-smes_ChangesInInventoriesOfFinishedGoodsAndWorkInProgress | Decrease (increase) in inventories of finished goods and work in progress
306: - ifrs-smes_RawMaterialsAndConsumablesUsed | Raw materials and consumables used
307: - ssmt-mpers_EmployeeBenefitsExpenseByNature | Employee benefits expense
308: - ifrs-smes_DepreciationAndAmortisationExpense | Depreciation and amortisation expense
309: - ifrs-smes_OtherExpenseByNature | Total other expenses
310: - (then identical tail: operating profit, finance income/costs, share of associates/JV, PBT, tax, zakat, PAT, discontinued, attribution)
311: - === FS-MPERS [210100] SUB-CLASSIFICATION OF ASSETS, LIABILITIES AND EQUITY â€” the granular tier that a ledger must be able to feed (representative sample; ~280 rows in full) ===
312: - PPE: ssmt-mpers_FreeholdLand | ssmt-mpers_LongtermLeaseholdLand | ssmt-mpers_ShorttermLeaseholdLand | ifrs-smes_Land (Total land)
313: - PPE: ssmt-mpers_BuildingOnFreeholdLand | ssmt-mpers_BuildingOnLongtermLeaseholdLand | ssmt-mpers_BuildingOnShorttermLeaseholdLand | ssmt-mpers_LeasedProperties | ifrs-smes_Buildings (Total buildings)
314: - PPE: ifrs-smes_Machinery | ifrs-smes_Vehicles | ssmt-mpers_OfficeEquipmentFixtureAndFittings | ssmt-mpers_PlantAndEquipment | ifrs-smes_ConstructionInProgress (Construction in progress/Asset work-in progress) | ifrs-smes_OtherPropertyPlantAndEquipment
315: - Investment property: ssmt-mpers_InvestmentPropertyFreeholdLandAndBuilding | ssmt-mpers_InvestmentPropertyLongtermLeaseholdLand | ssmt-mpers_InvestmentPropertyShorttermLeaseholdLand | ssmt-mpers_InvestmentPropertyBuildingUnderConstruction | ssmt-mpers_OtherInvestmentProperty
316: - Intangibles: ifrs-smes_CopyrightsPatentsAndOtherIndustrialPropertyRightsServiceAndOperatingRights | ifrs-smes_OtherIntangibleAssets | ifrs-smes_Goodwill
317: - Investments in subsidiaries/associates/JVs each split into: UnquotedSharesNetOfImpairmentLosses | QuotedSharesInMalaysia | QuotedSharesOutsideMalaysia | ShareOfPostAcquisitionProfitsAndReserves (associates & JVs) | OtherInvestments
318: - Inventories: ssmt-mpers_RawMaterials | ifrs-smes_WorkInProgress | ssmt-mpers_FinishedGoods | ssmt-mpers_SpareParts | ssmt-mpers_OtherInventories
319: - Trade receivables (current and non-current) split by counterparty: DueFromContractCustomers | DueFromHoldingCompany | DueFromSubsidiaries | DueFromAssociates | DueFromJointVentures | DueFromRelatedParties | Other...TradeReceivables
320: - Other receivables split into: due-from-related-parties block (holding company, subsidiaries, associates, joint ventures, other related parties) and a non-trade block (PrepaymentAndAccruedIncome, LeaseAndHirePurchaseReceivables, Miscellaneous)
321: - === KFI-MPERS [210000] â€” the reduced SOFP available only after EA2 approval (totals only, no asset-class detail) ===
322: - ifrs-smes_NoncurrentAssets | ifrs-smes_CurrentAssets | ifrs-smes_Assets | ifrs-smes_IssuedCapital | ssmt-mpers_RetainedEarnings | ifrs-smes_OtherReserves | ifrs-smes_EquityAttributableToOwnersOfParent | ssmt-mpers_OtherComponentsOfEquity | ifrs-smes_NoncontrollingInterests | ifrs-smes_Equity | ifrs-smes_NoncurrentLiabilities | ifrs-smes_CurrentLiabilities | ifrs-smes_Liabilities | ifrs-smes_EquityAndLiabilities
323: - === KFI-MPERS [310000] â€” the reduced P&L ===
324: - ifrs-smes_Revenue | ssmt-mpers_Expenditure (Expenditure) | ifrs-smes_ProfitLossBeforeTax | ifrs-smes_ProfitLoss | ifrs-smes_RevenueFromDividends (Dividend income) | ifrs-smes_ProfitLossAttributableToOwnersOfParent | ifrs-smes_ProfitLossAttributableToNoncontrollingInterests
325: - === FS-EPC [120000] CERTIFICATE OF EXEMPT PRIVATE COMPANY â€” the entire financial content an EPC lodges (no statements at all) ===
326: - ssmt_DisclosureOfStatusAsAnExemptPrivateCompanyExplanatory | Disclosure of the status as an exempt private company [text block]
327: - ssmt_DisclosureOnWhetherCompanyIsAndHasAtAllRelevantTimeBeenExemptedPrivateCompany
328: - ssmt_DisclosureOnWhetherDulyAuditedFinancialStatementsReportsRequiredUnderCompaniesAct2016HasBeenCirculatedToItsMembers
329: - ssmt_DisclosureOnWhetherAsAtDateToWhichFinancialStatementHasBeenMadeUpAndCompanyAppearedToHaveBeenAbleToMeetItsLiabilitiesAsAndWhenLiabilitiesFallDue
330: - ssmt_DisclosureOnWhetherAnyDirectorProvidedGuaranteeToGiveFinancialSupportIfTheCompanyInsolvent | ssmt_DisclosureOnTypeOfGuaranteeProvidedByDirector
331: - ssmt_NameOfDirectorWhoSignedCertificateOfExemptPrivateCompany (+ type and number of identification)
332: - ssmt_NameOfCompanySecretaryWhoSignedCertificateOfExemptPrivateCompany (+ identification, + ssmt_CompanySecretaryPractisingCertificateNumber)
333: - ssmt_NameOfTheAuditorWhoSignedCertificateOfExemptPrivateCompany | ssmt_LicenseNumberOfAuditor | ssmt_DateOfExemptPrivateCompanyCertificate
334: - === FS-MPERS [020000] SCOPE OF FILING â€” the switches that determine which statement layout is required ===
335: - ssmt_MethodUsedForPreparingStatementOfFinancialPosition (Current/Non-current vs Order of liquidity)
336: - ssmt_MethodUsedForPreparingStatementOfProfitOrLoss (Function of expense vs Nature of expense)
337: - ssmt_MethodUsedForPreparingStatementOfComprehensiveIncome (Net of tax vs Before tax)
338: - ssmt_MethodUsedForRepresentingChangesInAnEntitysEquity
339: - ssmt_MethodUsedForPreparingStatementOfCashFlows (Direct vs Indirect)
340: - ssmt_DateOfFinancialStatementsApprovedByBoardOfDirectors | ssmt_DateOfCirculationOfFinancialStatementsAndReportsToMembers | ssmt_DateOfStatutoryDeclaration | ssmt_MSICCode | ssmt_DescriptionOfBusiness
341: 
342: ### UNVERIFIED â€” do not encode
343: 
344: - EXACT CONTENT OF EACH MANDATORY PHASE. The live SSM page gives only the announcement titles and dates (27/11/2024 phased-mandatory notice; Phase 2 from 1 March 2025; Phase 3 from 1 June 2025). The per-phase scope â€” which company/document categories fall in Phase 1 vs 2 vs 3 â€” lives in SSM's FAQ SharePoint list at /Pages/FAQ/FAQ-MBRS.aspx, whose REST API returned HTTP 401 (access denied) and whose page body renders client-side. The Bahasa notice PDF (NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf) downloaded successfully but is an IMAGE-ONLY scan with no extractable text layer. Secondary/advisory-firm sources (Crowe, BDO, KPMG, BoardRoom) describe Phase 1 = 1 Dec 2024 unaudited FS under CA 2016, Phase 2 = 1 Mar 2025 audited FS under CA 1965, Phase 3 = 1 Jun 2025 audited FS under CA 2016 â€” I could NOT confirm this split from an SSM page and am not asserting it as verified.
345: - WHETHER SSMxT_2022v1.0 IS STILL THE OPERATIVE TAXONOMY IN JULY 2026. The live ssm.com.my MBRS page today lists SSMxT 2022 v1.0 as the newest published taxonomy and mTool 2.2 as the current tool, with no announcement newer than 20/5/2025. But mbrs.ssm.com.my returned empty content to the fetcher, so I could not cross-check the portal-side version banner. If SSM has shipped a taxonomy patch or a 2025/2026 refresh only inside mTool 2.2 (rather than as a new published .zip), I would not have seen it. Verify against a live mTool 2.2 install before treating element names as frozen.
346: - WHETHER THE PUBLISHED BUSINESS RULES WORKBOOK MATCHES WHAT mTool 2.2 ACTUALLY ENFORCES. Business_Rule_MBRS_v2_SSMxT_2022.xlsx is SSM-published and currently linked from the MBRS page, but it is titled for SSMxT 2022 and carries no internal version/date stamp that I located. mTool moved 2.1 -> 2.2 and SSM publishes a separate 'Differences between mTool 2.1 and mTool v2.2' release-notes workbook that I did not open. Rule IDs and mandatory-element lists should be re-confirmed against the tool.
347: - MFRS-SIDE DETAIL. I dumped the MPERS entry point exhaustively because that is the private-entity case you asked about. I did NOT dump FS-MFRS (6,197 concepts), FS-CLBG, FS-BNM, or FS-FC presentation trees, nor their mandatory-element business rules. Do not assume the MPERS minimum list transfers.
348: - THE CRITERIA SSM APPLIES WHEN GRANTING EA2. KFI (the reduced filing) is only permitted 'once granted approval for the Application for exemption from filing financial statements in full XBRL format (EA2)'. What SSM actually requires to approve an EA2 is not stated in the FAQ, architecture document, or FS user manual I read. Treat KFI as a discretionary concession, not an elective.
349: - LATE-LODGEMENT FEE WAIVER STATUS. The SSM FAQ page carries categories 'MBRS 2.0 - Additional Period of Waiver for Late Lodgement Fee of Audited Financial Statements and Reports via MBRS 2.0', 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Disruption Period', and 'Waiver Of Late Lodgement Fees During The MBRS 2.0 Peak Period'. Their contents were not readable (401 on the list API). A secondary source claimed the waiver was extended to 30 November 2025 â€” unverified, and in any case likely expired by July 2026.
350: - WHETHER A NEWER PRACTICE DIRECTIVE HAS SUPERSEDED PD 10/2024 ON AUDIT EXEMPTION. I verified PD 10/2024 (16 Dec 2024) directly from the PDF on ssm.com.my's Audit Exemption page, and its three-year phase table. I did not exhaustively check the SSM practice-directive index for a 2025/2026 amendment. Note the same page also links a document named 'PART Q (19.5.2026).pdf' which I did not open â€” it may contain a 2026 update relevant to accounts/audit.
351: - EXACT SEMANTICS OF SOME DUPLICATED NAMES IN THE MANDATORY-ELEMENT LISTS. The SOFP mandatory rule text lists 'Employee benefits', 'Provisions' and 'Loans and borrowings' TWICE each â€” almost certainly once for the non-current tier and once for the current tier, matching the presentation tree. The rule message string itself does not disambiguate, so this is my inference from the tree, not a verified statement by SSM.
352: - CA 2016 SECTION NUMBERING FOR THE EPC CERTIFICATE. Verified: the certificate power is s.260 (heading 'Duty to lodge certificate relating to exempt private company'), operating 'in lieu of the requirements in paragraph 259(1)(a)'. Some secondary sources cite '259(4)' for this â€” that appears to be wrong; s.259(4) is the definitional subsection about consolidated statements. I read this from the Act PDF hosted on ssm.com.my (Act 777, 15 Sep 2016 print). I did NOT check whether the Companies (Amendment) Act 2024 altered ss.259-260; SSM's site lists that amendment act separately.
353: - DEFINITION OF 'EXEMPT PRIVATE COMPANY' AND WHETHER AN EPC CAN ALSO CLAIM AUDIT EXEMPTION. The s.2 definition of 'exempt private company' and any interaction between the EPC certificate route and PD 10/2024 audit exemption were not read. A secondary source stated an EPC cannot elect audit exemption if it lodges an EPC certificate (because s.260(2)(b) requires 'duly audited financial statements ... circulated to its members') â€” the statutory text I read is consistent with that reading, but I did not find an SSM statement confirming it.
354: - TOTAL SIZE OF THE MPERS SUB-CLASSIFICATION TIER. I extracted ~280 tree rows for [210100] and sampled them; I did not enumerate every leaf. Anyone building a mapping table should regenerate the full tree from the taxonomy package rather than relying on the sample here.
355: - WHETHER THE 'NO CHART OF ACCOUNTS' FINDING HOLDS BEYOND THE DOCUMENTS I SEARCHED. The zero-hit search covered the SSMxT 2022 Architecture Document, MBRS FAQ v2.4, the mTool 2.2 FS-CA2016 User Manual, SSM's MBRS 2.0 overview deck, the live MBRS page, and all 1,633 taxonomy filenames. It did not cover SSM training-partner course materials, the mPortal user manual, or the mTool binary itself. The finding is strong but is an absence-of-evidence result over that document set.
356: 
357: ### Sources
358: 
359: - https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx
360: - https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/SSMxT2022_Architecture_Document.pdf
361: - https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/FAQs_Malaysian_Business_Reporting_System_MBRS.pdf
362: - https://ssm4u.com.my/files/MBRS/SSMxT_2022v1.zip
363: - https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/Business_Rule_MBRS_v2_SSMxT_2022.xlsx
364: - https://www.ssm.com.my/bm/Pages/Register_Business_Company_LLP/Company/document/MBRS_v2_Summary_Sheet.pdf
365: - https://www.ssm.com.my/Pages/Publication/PDF%20Files/AD%202024%20-%20Overview%20of%20MBRS%20v2.pdf
366: - https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/User_manual_mTool_v2_FS2016.pdf
367: - https://www.ssm.com.my/Pages/FAQ/FAQ-MBRS.aspx
368: - https://www.ssm.com.my/bm/Pages/Services/Other-Services/xbrl%20document/NOTIS-MBRS-2.0-PENGEMASKINIAN.pdf
369: - https://www.ssm.com.my/Pages/Publication/PDF%20Files/ISU-ISU_DIALOG_TAHUNAN_SSM_2025_ALL_WEBSITE.pdf
370: - https://www.ssm.com.my/Pages/Legal_Framework/Audit-Exemption.aspx
371: - https://www.ssm.com.my/Pages/Legal_Framework/Document/NEW%20PD%2010-2024%20-%20Qualifying%20Criteria%20for%20Audit%20Exemption%20for%20Certain%20Categories%20of%20Private%20Companies%20(Portal).pdf
372: - https://www.ssm.com.my/Pages/Legal_Framework/Companies%20-Act%20-1965-(Repealed)/aktabi_20160915_companiesact2016act777_0.pdf
373: - https://mbrs.ssm.com.my/
374: 
375: ## LHDN / RMCD (tax, SST, e-invoice)
376: 
377: ### Authority
378: 
379: WHAT THESE SOURCES MANDATE:
380: 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$lines = Get-Content -LiteralPath '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; for ("'$i=379; $i -lt [Math]::Min(510,$lines.Count); $i++) { '"'{0:D3}: {1}' -f ("'$i+1), $lines[$i] }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 750ms:
380: 
381: (1) LHDN / Income Tax Act 1967 â€” Form C is a legally required return under s.77A ITA 1967, filed within 7 months of financial year-end, e-filing mandatory. The binding constraint on ledger structure is the **"FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)" appendix (working sheet HK-FIC, Item G17 attachment)** to Form C: a fixed 59-numbered-item taxonomy covering Statement of Profit or Loss (items 1â€“31) and Statement of Financial Position (items 32â€“59). A company MUST be able to populate every one of those 59 boxes from its ledger. This is a *reporting/mapping* mandate, not a mandate that the general ledger literally use these account names â€” but a default CoA that cannot roll up cleanly into these 59 items will force manual rework every year. Separately, s.39(1) ITA 1967 makes specific expense classes non-deductible, so the ledger must SEGREGATE them (they cannot be buried in "Other expenditure" item 28) to support the tax computation and the s.1.3 documentation/onus-of-proof requirement.
382: 
383: (2) RMCD / MySST â€” Sales Tax Act 2018 and Service Tax Act 2018 mandate registration at prescribed thresholds and charging at prescribed rates. Critically for the CoA: Malaysian SST is a **single-stage tax** with **NO input-tax-credit mechanism** (unlike the repealed GST). This means a registered person needs an **output-tax liability account only**; sales/service tax borne on purchases is NOT recoverable and must be **capitalised into the cost of the expense/asset**, not parked in a recoverable-input-tax asset account. Sales tax and service tax are also accounted on DIFFERENT bases (sales tax = accrual/on sale; service tax = payment basis), so they cannot share one control account. There is no mandate on account naming.
384: 
385: (3) LHDN e-Invoice / MyInvois â€” mandates issuance of structured XML/JSON e-Invoices per a phased timeline, with a per-line-item "Classification" field (3-digit code from IRBM's catalogue) plus supplier MSIC code and SST registration number. It mandates a **document-level classification taxonomy**, NOT a chart of accounts. It does not prescribe ledger accounts â€” but a practical CoA benefits from being mappable to the IRBM classification catalogue, and the e-Invoice FAQ explicitly says tax deductions may still be claimed on existing documentation "until such time the legislation has been amended."
386: 
387: (4) Payroll statutes â€” EPF (Act 452), SOCSO/PERKESO (Act 4), EIS (Act 800), HRD Corp levy (PSMB Act 2001), and MTD/PCB (ITA 1967) are each imposed by a SEPARATE statute, remitted to a DIFFERENT authority (KWSP, PERKESO, PERKESO, HRD Corp, LHDN), on different computation bases and different forms. Each therefore REQUIRES its own distinct liability/payable account â€” they cannot be pooled into one "statutory payables" account without losing the ability to reconcile and remit. Note also ITA s.34(4): employer contributions to an approved scheme are non-deductible to the extent they exceed 19% of the employee's remuneration, which requires employer-contribution expense to be tracked separately from gross wages.
388: 
389: WHAT THEY DO NOT MANDATE: no source prescribes account codes, account numbering, a specific CoA structure, or an accounting standard (MFRS/MPERS presentation comes from MASB and the Companies Act 2016, not from LHDN/RMCD). Form C is a mapping target, not a ledger schema.
390: 
391: ### Verified facts
392: 
393: - FORM C: The current published company return is 'Form C 2025' (CP5 - Pin. 2025), 'SAMPLE COMPANY RETURN FORM FOR YEAR OF ASSESSMENT 2025', downloaded live from https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf (31 pages). Accompanying 'Company Return Form Guidebook 2025 Self Assessment System' at https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf (220 pages).
394: - FORM C structure verified verbatim: PART A (Statutory Income, Total Income and Chargeable Income, items A1-A20); PART B (Tax Payable/Repayable, B1-B13); PART C (Capital Allowances and Charges under Schedule 3, Reinvestment Allowance under Schedule 7A, Investment Allowance for Service Sector under Schedule 7B); PART D (Incentive Claim); PART F (Tax Remission Claim); PART G (Particulars incl. item G17 Financial particulars of company); PART H (Other Particulars); PART J; PART K (Tax Agent).
395: - FORM C Part A confirms the income-source taxonomy a company must report: A1 'Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia'; A2 same from outside Malaysia received in Malaysia; A6 'Aggregate of other statutory income from sources in Malaysia ... - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)'; A7 same from outside Malaysia incl. capital gains. So the ledger must distinguish business income from dividends / interest / discounts / rents / royalties / premiums separately.
396: - FORM C Part A tax-computation adjustment lines verified: A4 'LESS: Business losses brought forward (Restricted to A3)'; A10 'Current year business losses'; A11 'Prospecting expenditure under schedule 4/pre-operational business expenditure under schedule 4B/permitted expenses under section 60F or 60H'; A12 'Approved donations/gifts/contributions'; A13 'Zakat perniagaan (Restricted to 2.5% of A9)'; A15 'Claim for loss under Group Relief provision'; A17 'TAXABLE PIONEER INCOME'.
397: - FORM C Part B confirms the corporate tax rate bands in use for YA2025 as apportionment rows: 15, 17 and 24 (percent). Also B5 'Section 6D rebate (Up to RM20,000, restricted to B3)'.
398: - FORM C GUIDEBOOK 2025 paragraph 1.2.3 'Non-allowable Expenses' lists verbatim by legal provision: 33(2) Interest not deductible against business income; 34(4) Contribution to an approved scheme in excess of 19% of the employee's remuneration; 39(1)(a) Any form of private or domestic expenses; 39(1)(b) disbursements/expenses not wholly and exclusively laid out for producing gross income; 39(1)(c) capital withdrawn; 39(1)(d) Payment to any unapproved provident fund; 39(1)(e) qualifying mining/agriculture-forest/prospecting expenditure; 39(1)(f) Interest or royalty paid to non-residents without complying with section 109; 39(1)(g) payment for licence/permit to extract timber other than to a State Government; 39(1)(i) Contract payment made without complying with section 107A; 39(1)(j) Payment made to non-residents without complying with section 109B; 39(1)(k) Payment exceeding RM100,000 for rental of non-commercial motor vehicle; 39(1)(l) Entertainment; 39(1)(m) Expenditure incurred on leave passage for employee within or outside Malaysia; 39(1)(q) Payment made to non-residents without complying with section 109A; 39(1)(r) Payment made by a resident person to a Labuan company; 39(1)(s) Payments in cash to agents/dealers/distributors without complying with section 107D.
399: - FORM C GUIDEBOOK 2025 examples under 39(1)(b) verbatim: 'Expenses incurred in the printing and distribution of annual reports and costs of holding annual general meetings and extraordinary meetings'; 'Stock exchange listing expenses'; 'Pre-commencement or cessation of business expenses'; 'Legal expenses in connection with the acquisition of assets or private matters'; 'Donations'; 'Fines for violation of law including fines and expenses relating to income tax appeals'; 'Gifts (except for own employees)'; 'Club membership (entrance) fees and private club membership subscriptions'; 'Payment for loan and agency agreements'; 'Purchase of assets and similar expenses'.
400: - FORM C GUIDEBOOK 2025 additional non-allowable items listed without a section number, verbatim: 'All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts'; 'Expenditure relating to changes in the authorised capital and paid-up capital'; 'Professional fees related to the acquisition of fixed assets or investments'; 'Renovations and improvements to buildings'. This CONFIRMS that general provisions are non-deductible while SPECIFIC provisions for doubtful debts are deductible â€” so the ledger must split general vs specific provision.
401: - FORM C GUIDEBOOK 2025 confirms depreciation is replaced by capital allowances: Part C of Form C claims 'CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3'; the guidebook's adjustment worksheet gives 'Non-allowable expenses/charges - according to subsection 39(1) and other sections' with worked example 'Entertainment RM10,000 / Income tax penalty RM1,000'. Accounting depreciation is added back and Schedule 3 capital allowances claimed instead.
402: - FORM C GUIDEBOOK 2025 section 1.3 mandates documentation retention: 'Documents, records and other written evidence must be properly kept as the onus-of-proof is on the individual who makes the claim/adjustment. Any claim/adjustment not supported by sufficient documentation shall be disallowed in the event of a tax audit and penalty may be imposed.' Required support includes 'An analysis of income and expenditure', 'Subsidiary accounts', 'Receipts/Invoices'.
403: - FORM C also requires separately disclosed data for: contract/subcontract payments, commissions and rents to residents; contract payments to non-residents (s.107A); management fees to residents; professional/technical/management fees and rents to non-residents (s.4A income); expenses charged or allocated by parent company to subsidiary or headquarters to branch in Malaysia; overseas trips; transfer pricing; leasing. Each implies a separately identifiable ledger account.
404: - SST â€” GST REPEALED: The RMCD General Guide on Sales Tax (Panduan Umum Cukai Jualan, Ver 4) confirms the GST (CBP) transition: the final GST-03 return for the last taxable period was due within 120 days of 1 September 2018, and 'Apa-apa tuntutan cukai input di bawah Akta CBP 2014 yang dimansuhkan yang belum dituntut sebelum 1 September 2018 boleh dituntut dalam penyata GST-03 dan tuntutan itu adalah dianggap sebagai tuntutan akhir bagi semua cukai input' (any input tax claim under the repealed GST Act 2014 not yet claimed before 1 Sept 2018 may be claimed in the GST-03 return and that claim is deemed the FINAL claim for all input tax). No input-tax-credit mechanism exists under SST.
405: - SST â€” SINGLE STAGE: mysst.customs.gov.my/understanding-sst/ defines Sales Tax verbatim as 'A single stage tax levied on imported and locally manufactured goods, either at the time of importation or at the time the goods are sold or otherwise disposed of by the manufacturer' and Service Tax as 'a tax charged and levied on taxable services provided by any taxable person in Malaysia in the course and furtherance of business.'
406: - SST â€” TAXABLE PERIOD: 'The standard taxable period for SST (both Sales and Service Tax) is bimonthly (once every two months).' (mysst.customs.gov.my/understanding-sst/)
407: - SST â€” ACCOUNTING BASIS DIFFERS BY TAX (mysst.customs.gov.my/accounting-sst/): Sales Tax is accounted on an ACCRUAL basis â€” 'at the time when the goods are sold, disposed or first used'. Service Tax is accounted on a PAYMENT basis â€” 'at the time when the payments is received', or on 'the day following period of twelve month when any whole or part of the payment is not received from the date of the invoice for the taxable service provided' (i.e. the 12-month deemed-collection rule).
408: - SALES TAX REGISTRATION THRESHOLD (mysst.customs.gov.my/registering-business/): 'SALES VALUE OF TAXABLE GOODS has exceeded RM500,000 for 12 months period' and 'Manufacturers who carry out sub-contract work on taxable goods where the VALUE of work performed exceeds RM500,000 for 12 months period.' Turnover determined by Historical Method (that month + 11 preceding) or Future Method (that month + 11 succeeding).
409: - SALES TAX RATES from 1 July 2025 (mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/): 'The new sales tax rate change takes effect on 1 July 2025.' Structure verbatim: 'i. the rate of 5% and specific rates can be referred to under the Sales Tax (Rate of Tax) Order 2025. ii. the exempted goods can be referred to under the Sales Tax (Goods Exempted from Tax) Order 2025. If the goods are not listed in either of the above orders, the tax rate on the goods is subject to 10%.' So: exempt / 5% (or specific) / 10% default.
410: - SERVICE TAX RATE (mysst.customs.gov.my/registering-business/, Service Tax tab): 'Rate of tax is amended to :- 6% (1 Sept 2018 - 29 Feb 2024); 8% (Start 1 Mac 2024) except F&B, Parking, Logistic & Telecommunications - 6%'. This CONFIRMS the 6%->8% change effective 1 March 2024 with a 6% carve-out for F&B, parking, logistics and telecommunications. Credit/charge cards: 'A specific rate of tax of RM 25 is imposed upon issuance of principal or supplementary card and every subsequent year or part thereof.'
411: - SERVICE TAX GROUP THRESHOLDS pre-expansion (mysst.customs.gov.my/registering-business/): Group A RM 500,000.00; Group B (F&B) RM 1,500,000.00; Group C RM 500,000.00; Group D RM 500,000.00; Group E RM 500,000.00; Group F RM 500,000.00; Group G RM 500,000.00; Group H 'No Threshold'; Group I RM 500,000.00; Group J RM 500,000.00 (with one 'No Threshold' sub-item).
412: - SERVICE TAX EXPANSION EFFECTIVE 1 JULY 2025 (mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/) â€” verified per-category rate and threshold: RENTAL OR LEASING: 'The effective date for the implementation of service tax on rental or leasing services is 1 July 2025', 'The threshold value for rental or leasing services is RM500,000.00', 'The tax rate for rental or leasing services is 8%'. Residential property rental is NOT subject to service tax (worked example: warehouse rental RM20,000 x 8% = RM1,600, residential RM1,500 not taxed).
413: - SERVICE TAX EXPANSION â€” CONSTRUCTION: 'Construction work services are subject to a 6% service tax rate', threshold 'RM1,500,000', under 'Group L, First Schedule, Service Tax Regulations 2018 - Construction Work Services'. Worked example: contract value RM6,000,000, 'The service tax imposed is RM360,000 (RM6,000,000 x 6%)'. EPCC projects are included.
414: - SERVICE TAX EXPANSION â€” HEALTHCARE: 'Private healthcare services, practice of traditional and complementary medicine private services and private allied health related services will be subject to service tax at a rate of 6%', threshold 'RM1,500,000.00 in 12 months period'; TCM falls under 'Item 15, Group I'. Effective date 1 July 2025.
415: - SERVICE TAX EXPANSION â€” EDUCATION: 'Education services are subject to a service tax rate of 6%', effective 1 July 2025, applying to 'private educational institution registered under the Education Act 1996 excluding special schools and language centres' that 'charge fees exceeding RM60,000 per student for each academic year' (covers private kindergartens, academic and religious primary/secondary schools, international schools, expatriate schools and Chinese private secondary schools).
416: - SERVICE TAX EXPANSION â€” FINANCIAL SERVICES: 'Any financial service provider whose taxable services exceed the RM500,000 threshold must register under the Service Tax Act 2018'. Group H group-relief provisions apply intra-group.
417: - SERVICE TAX EXPANSION â€” BEAUTY: the live official FAQ states 'The service tax rate imposed on beauty treatment services provided to citizens and non-citizens is a flat rate of 8%' and 'The registration requirement for beauty treatment services is when the total value of taxable services has reach RM500,000 in 12 months period.'
418: - MOF PRESS RELEASE (mof.gov.my, 'Targeted Revision Of Sales Tax Rate And Expansion Of Service Tax Scope Effective 1 July 2025') confirms at policy level: 'Sales Tax rate remains unchanged for essential goods consumed by the public; Sales Tax at rates of 5% or 10% will apply to discretionary and non-essential goods', and the service tax scope expands to 'leasing or rental, construction, financial services, private healthcare, education, and beauty services.'
419: - MySST publishes Service Tax Policy Nos. 1/2026, 2/2026, 3/2026 and 4/2026 (list at mysst.customs.gov.my/service-tax-policy/), plus Sales Tax Policy documents â€” confirming ongoing 2026 policy amendments to the SST regime. Site 'Last Updated: 19/07/2026'.
420: - E-INVOICE MANDATE TIMELINE â€” verified verbatim from the official 'IMPLEMENTATION OF E-INVOICE IN MALAYSIA FREQUENTLY ASKED QUESTIONS (FAQs) (UPDATED ON 5 MAY 2026)' at https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf â€” table 'Targeted Taxpayers / Implementation Date': annual turnover or revenue more than RM100 million -> 1 August 2024; more than RM25 million and up to RM100 million -> 1 January 2025; more than RM5 million and up to RM25 million -> 1 July 2025; up to RM5 million -> 1 January 2026.
421: - E-INVOICE â€” thresholds are measured 'according to annual turnover or revenue thresholds as stated in the statement of comprehensive income in the Financial Year 2022 Audited Financial Statements.' Enforcement/penalty for the >RM100 million cohort only began 1 October 2024 per Income Tax (Issuance of Electronic Invoice) Rules 2024 [P.U. (A) 265] gazetted 30 September 2024.
422: - E-INVOICE â€” MSME EXEMPTION AND THE 1 JULY 2026 CONCESSIONARY DATE: 'the Government of Malaysia has exempted taxpayers with annual turnover or revenue below RM1 million from the issuance of e-Invoice' (including self-billed e-Invoice). The exemption does NOT apply where: '(a) taxpayer with non-individual shareholder(s) (or equivalent) with annual turnover or revenue of at least RM1 million; or (b) taxpayer is a subsidiary of a holding company with annual turnover or revenue of at least RM1 million; or (c) taxpayer has related company / joint venture with annual turnover or revenue of at least RM1 million.' Taxpayers reaching RM1 million in YA2023/2024/2025 must implement from 1 July 2026 (the 'concessionary e-Invoice implementation date'). From YA2026 onwards the rule is '1 January in the second year following the YA in which the total annual turnover or revenue reaches RM1 million.'
423: - E-INVOICE â€” FORMAT AND MODEL: 'The e-Invoice must be generated in the form of XML or JSON file format' (not PDF/JPG). Two transmission mechanisms: MyInvois Portal and API. 'The e-Invoice model in Malaysia adopts the Continuous Transaction Control (CTC) Model'. Consolidated e-Invoice must be issued 'within seven (7) calendar days after the month end'. Self-billed e-Invoice for importation of goods due 'latest by the end of the second month following the month' of importation.
424: - E-INVOICE â€” CLASSIFICATION REQUIREMENT (from IRBM e-Invoice Specific Guideline VERSION 4.8, https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf): data field no. 9 is 'Classification' = 'Classification of product or services', with the instruction to input 'a 3-digit integer (e.g., "000" to "999"), in accordance with the catalogue set by IRBM'. Related fields include no. 6 'Supplier's SST Registration Number' and no. 7 "Supplier's Malaysia Standard Industrial Classification (MSIC code)". So classification is at LINE-ITEM level, using IRBM's own catalogue, and is independent of the general ledger account.
425: - E-INVOICE â€” the IRBM classification catalogue (https://sdk.myinvois.hasil.gov.my/codes/classification-codes/) contains 45 codes numbered 001 to 045, ranging from '001 Breastfeeding equipment' to '045 Self-billed - Non-monetary payment to agents, dealers or distributors'. This is a transaction-type/product catalogue, NOT an accounting chart of accounts.
426: - E-INVOICE â€” no industry is exempt: 'Currently, there are no industries that are exempted from the e-Invoice implementation.' And deductions are unaffected for now: 'Yes, taxpayers can continue to claim tax deductions or personal tax relief using existing documentation until such time the legislation has been amended.'
427: - PAYROLL â€” SOCSO/PERKESO wage ceiling: 'Effective 1 October 2024, PERKESO will enforce a new wage ceiling for contributions from RM5,000 to RM6,000 per month' (perkeso.gov.my rate-of-contribution and kadar-caruman pages).
428: - PAYROLL â€” SOCSO contribution is a BRACKET TABLE, not a flat percentage. Verified from the official PERKESO PDF 'EMPLOYEES' SOCIAL SECURITY ACT 1969 (ACT 4): NEW CONTRIBUTION RATE INCLUDING THE NON-EMPLOYMENT INJURY SECURITY SCHEME (SKBBK)' (https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf, 8 pages, 65 wage brackets). Columns are FIRST CATEGORY (Employment Injury Scheme, Invalidity Scheme and Non-Employment Injury Scheme) with EMPLOYER SHARE and EMPLOYEE SHARE split into INVALIDITY and NON-EMPLOYMENT INJURY sub-columns; and SECOND CATEGORY (Employment Injury Scheme and Non-Employment Injury Scheme). Top bracket 65 'Where wages exceed RM6,000': First Category employer RM104.15, employee invalidity RM29.75 + non-employment injury RM44.65, total RM178.55; Second Category employer RM74.40, employee RM44.65, total RM119.05.
429: - PAYROLL â€” a NEW third SOCSO component now exists: the Non-Employment Injury Security Scheme / Skim Kemalangan Bukan Bencana Kerja (SKBBK), branded LINDUNG 24 JAM, appearing as its own column in PERKESO's official current contribution table. It is an EMPLOYEE-borne component distinct from the Employment Injury and Invalidity schemes, requiring its own payroll line and payable tracking.
430: - PAYROLL â€” PERKESO administers separately-legislated schemes: Employees' Social Security Act 1969 (Act 4) for Employment Injury + Invalidity + SKBBK, and the Employment Insurance System Act 2017 (Act 800) for EIS. PERKESO publishes two distinct rate documents, 'Contribution Rate of Act 4' and 'Contribution Rate of Act 800', confirming SOCSO and EIS are computed and remitted as separate items.
431: - PAYROLL â€” HRD CORP LEVY (official HRD Corp support centre, https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy): governed by 'Section 2, 14, and 15 of the PSMB Act 2001'. Formula verbatim: 'LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1%'. Standard rate 1% of monthly wages; reduced rate '0.5% of the monthly wages' for employers below the mandatory employee threshold. Levy base INCLUDES basic salary and fixed allowance, leave pay and wage arrears; EXCLUDES bonuses, gratuity, travel allowances, apprenticeship payments, overtime and shift differentials. Payment due 'within 15 days of the following month'; later payments are classified as arrears.
432: - PAYROLL â€” MTD/PCB: LHDN operates 'Monthly Tax Deduction (MTD)' / 'Potongan Cukai Bulanan (PCB)' with an official 'SPECIFICATION FOR MONTHLY TAX DEDUCTION (MTD)' computerised-calculation specification published annually on hasil.gov.my, plus the e-CP39 / e-PCB / e-Data PCB submission channels and Form CP39. MTD is an employee-borne income tax withholding remitted by the employer to LHDN â€” structurally different from EPF/SOCSO/EIS/HRD (which involve employer cost), so it must sit in its own payable account.
433: - PAYROLL â€” LHDN link back to the ledger: ITA s.34(4) makes 'Contribution to an approved scheme in excess of 19% of the employee's remuneration' non-allowable, and s.39(1)(d) disallows 'Payment to any unapproved provident fund'. This confirms employer EPF contributions must be tracked as a distinct expense line measurable against employee remuneration.
434: 
435: ### Line items / taxonomy / categories
436: 
437: - === LHDN FORM C â€” 'FINANCIAL PARTICULARS OF COMPANY (MAIN BUSINESS)' (working sheet HK-FIC, Item G17 attachment). THIS IS THE AUTHORITATIVE 59-ITEM PRESENTATION TAXONOMY A MALAYSIAN SDN BHD LEDGER MUST ROLL UP INTO ===
438: - 1 Business code
439: - 2 Type of business activity
440: - --- STATEMENT OF PROFIT OR LOSS ---
441: - 3 Sales / turnover
442: - LESS:
443: - 4 Opening inventory
444: - 5 Cost of purchases
445: - 6 Cost of production
446: - 7 Closing inventory
447: - 8 Cost of sales (4 + 5 + 6 - 7)
448: - 9 GROSS PROFIT/LOSS (3 - 8)
449: - 10 Foreign currency exchange gain
450: - 11 Other business income
451: - 12 Other income
452: - 13 Non-taxable profits
453: - EXPENDITURE:
454: - 14 Interest
455: - 15 Professional, technical, management and legal fees
456: - 16 Technical fee payments to non-resident receipients
457: - 17 Contract payments
458: - 18 Directors' fee
459: - 19 Salaries and wages
460: - 20 Cost of Employee Share Options
461: - 21 Royalties
462: - 22 Rental/lease
463: - 23 Maintenance and repairs
464: - 24 Research and development
465: - 25 Promotion and advertisement
466: - 26 Travelling and accommodation
467: - 27 Foreign currency exchange loss
468: - 28 Other expenditure
469: - 29 TOTAL EXPENDITURE (14 to 28)
470: - 30 NET PROFIT/LOSS
471: - 31 Non-allowable expenses
472: - --- STATEMENT OF FINANCIAL POSITION / NON-CURRENT ASSETS ---
473: - 32 Motor vehicles
474: - 33 Plant and equipment
475: - 34 Land and buildings
476: - 35 Other non-current assets
477: - 36 TOTAL NON-CURRENT ASSETS (32 to 35)
478: - 37 Total cost of non-current assets acquired in the basis period
479: - 38 Investments
480: - --- CURRENT ASSETS ---
481: - 39 Trade debtors
482: - 40 Other debtors
483: - 41 Inventory
484: - 42 Loans to directors
485: - 43 Cash in hand and cash at bank
486: - 44 Other current assets
487: - 45 TOTAL CURRENT ASSETS (39 to 44)
488: - 46 TOTAL ASSETS (36 + 38 + 45)
489: - --- LIABILITIES AND OWNERS' EQUITY / CURRENT LIABILITIES ---
490: - 47 Loans and bank overdrafts
491: - 48 Trade creditors
492: - 49 Other creditors
493: - 50 Loans from directors
494: - 51 Other current liabilities
495: - 52 TOTAL CURRENT LIABILITIES (47 to 51)
496: - 53 Non-current liabilities
497: - 54 TOTAL LIABILITIES (52 + 53)
498: - --- SHAREHOLDERS' EQUITY ---
499: - 55 Issued and fully paid-up capital
500: - 56 Profit and loss appropriation account
501: - 57 Reserve account
502: - 58 TOTAL EQUITY (55 + 56 + 57)
503: - 59 TOTAL LIABILITIES AND EQUITY (54 + 58)
504: - === FORM C PART A â€” INCOME SOURCES AND TAX-COMPUTATION ADJUSTMENTS (ledger must segregate these) ===
505: - A1 Aggregate statutory income from sources of business(es) and partnership(s) in Malaysia
506: - A2 Aggregate statutory income from sources of business(es) and partnership(s) outside Malaysia received in Malaysia
507: - A4 LESS: Business losses brought forward (Restricted to A3)
508: - A6 Aggregate of other statutory income from sources in Malaysia - Dividends, interest, discounts, rents, royalties, premiums and other income and additions pursuant to paragraph 43(1)(c)
509: - A7 Aggregate of other statutory income from sources outside Malaysia received in Malaysia - Dividends, interest, discounts, rents, royalties, premiums, capital gains and other income
510: - A10 LESS: Current year business losses (Restricted to A9)

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$lines = Get-Content -LiteralPath '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; for ("'$i=509; $i -lt $lines.Count; $i++) { '"'{0:D3}: {1}' -f ("'$i+1), $lines[$i] }' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 762ms:
510: - A10 LESS: Current year business losses (Restricted to A9)
511: - A11 Prospecting expenditure under schedule 4 / pre-operational business expenditure under schedule 4B / permitted expenses under section 60F or 60H
512: - A12 Approved donations/gifts/contributions
513: - A13 Zakat perniagaan (Restricted to 2.5% of A9)
514: - A15 LESS: Claim for loss under Group Relief provision
515: - A17 TAXABLE PIONEER INCOME
516: - PART C: CAPITAL ALLOWANCES AND CHARGES UNDER SCHEDULE 3, REINVESTMENT ALLOWANCE UNDER SCHEDULE 7A AND INVESTMENT ALLOWANCE FOR SERVICE SECTOR UNDER SCHEDULE 7B
517: - C1b Total accelerated capital allowance (if relevant)
518: - C2 Claim for industrial building allowance under subparagraph 42(1) Schedule 3
519: - === NON-DEDUCTIBLE / ADD-BACK CATEGORIES (Form C Guidebook 2025, para 1.2.3) â€” each needs its own ledger account so it is not buried in item 28 'Other expenditure' ===
520: - Entertainment [ITA 39(1)(l)]
521: - Donations [39(1)(b) example] â€” note approved donations are claimed separately at Form C item A12, so approved vs non-approved donations need separate accounts
522: - Gifts (except for own employees) [39(1)(b) example]
523: - Fines for violation of law including fines and expenses relating to income tax appeals [39(1)(b) example]
524: - Depreciation â€” added back; relief given instead as Schedule 3 capital allowances (Form C Part C)
525: - All types of provision (including general provision for doubtful debts) other than specific provision for doubtful debts
526: - Specific provision for doubtful debts â€” DEDUCTIBLE (must be split from general provision)
527: - Any form of private or domestic expenses [39(1)(a)]
528: - Leave passage for employee within or outside Malaysia [39(1)(m)]
529: - Payment exceeding RM100,000 for rental of non-commercial motor vehicle [39(1)(k)]
530: - Interest not deductible against business income [33(2)]
531: - Contribution to an approved scheme in excess of 19% of the employee's remuneration [34(4)]
532: - Payment to any unapproved provident fund [39(1)(d)]
533: - Withholding-tax-failure disallowances: interest/royalty to non-residents without s.109 [39(1)(f)]; contract payment without s.107A [39(1)(i)]; payment to non-residents without s.109B [39(1)(j)]; without s.109A [39(1)(q)]; cash payments to resident agents/dealers/distributors without s.107D [39(1)(s)]
534: - Payment made by a resident person to a Labuan company [39(1)(r)]
535: - Annual report printing/distribution and AGM/EGM costs [39(1)(b) example]
536: - Stock exchange listing expenses [39(1)(b) example]
537: - Pre-commencement or cessation of business expenses [39(1)(b) example]
538: - Legal expenses in connection with the acquisition of assets or private matters [39(1)(b) example]
539: - Club membership (entrance) fees and private club membership subscriptions [39(1)(b) example]
540: - Expenditure relating to changes in the authorised capital and paid-up capital
541: - Professional fees related to the acquisition of fixed assets or investments
542: - Renovations and improvements to buildings (capital, not repairs â€” must be split from item 23 'Maintenance and repairs')
543: - Capital withdrawn or sum employed as capital [39(1)(c)]
544: - === SST LEDGER ACCOUNTS REQUIRED (SST is single-stage, NO input tax credit) ===
545: - Sales Tax Payable (output) â€” accrual basis, recognised when goods are sold, disposed or first used; rates exempt / 5% (or specific) / 10% default under the Sales Tax (Rate of Tax) Order 2025 and Sales Tax (Goods Exempted from Tax) Order 2025
546: - Service Tax Payable (output) â€” PAYMENT basis, recognised when payment is received, with a 12-month deemed-collection trigger from invoice date; needs rate segregation 8% vs 6%
547: - Service Tax Payable â€” 6% subset (F&B, parking, logistics, telecommunications; plus post-1-July-2025 construction, private healthcare/TCM/allied health, and education)
548: - Service Tax Payable â€” 8% subset (general taxable services; plus rental or leasing, and beauty treatment)
549: - Service Tax Payable â€” credit/charge cards at the specific rate of RM25 per principal/supplementary card per year
550: - Imported Taxable Services â€” service tax self-accounted by the recipient (MySST maintains a separate 'Non-Registrant: Imported Service' registration channel)
551: - NO 'Input Tax Recoverable' / 'SST Receivable' account â€” sales tax and service tax borne on purchases are NOT creditable and must be capitalised into the cost of the expense or asset
552: - Sales Tax Exemption tracking (Schedule A / B / C exemption certificates; registered manufacturers may buy raw materials, components, packing and packaging materials, manufacturing aids and cleanroom equipment exempt under the Sales Tax (Persons Exempted from Payment of Tax) Order 2018)
553: - === STATUTORY PAYROLL PAYABLES â€” each a SEPARATE payable (different statute, authority, form and basis) ===
554: - EPF / KWSP Payable (Employees Provident Fund Act 1991) â€” split employer contribution (expense) vs employee contribution (deduction from wages); s.34(4) ITA caps deductibility at 19% of remuneration
555: - SOCSO / PERKESO Payable â€” Employees' Social Security Act 1969 (Act 4); bracket table not a flat %; wage ceiling RM6,000/month from 1 October 2024; First Category (Employment Injury + Invalidity + SKBBK) vs Second Category (Employment Injury + SKBBK)
556: - SOCSO â€” Non-Employment Injury Security Scheme (SKBBK / Skim Kemalangan Bukan Bencana Kerja, 'LINDUNG 24 JAM') â€” new employee-borne component with its own column in PERKESO's official contribution table
557: - EIS / SIP Payable (Employment Insurance System Act 2017, Act 800) â€” administered by PERKESO but a separate Act and a separate published rate document from Act 4
558: - HRD Corp Levy Payable (PSMB Act 2001, ss. 2, 14, 15) â€” LEVY = [(BASIC SALARY - UNPAID LEAVE) + FIXED ALLOWANCE] x 1% (or 0.5% reduced rate); employer-only cost; due within 15 days of the following month
559: - MTD / PCB Payable (Potongan Cukai Bulanan, ITA 1967) â€” employee income tax withheld and remitted to LHDN via e-PCB / e-Data PCB / e-CP39, Form CP39; employee-borne, not an employer cost
560: - Zakat perniagaan payable (if applicable) â€” claimed at Form C item A13, restricted to 2.5% of aggregate income
561: - === E-INVOICE / MyInvois FIELDS THAT TOUCH THE LEDGER (classification is line-item level, not account level) ===
562: - Classification â€” 3-digit integer '000' to '999' from the IRBM catalogue (45 codes currently, 001 'Breastfeeding equipment' to 045 'Self-billed - Non-monetary payment to agents, dealers or distributors')
563: - Supplier's SST Registration Number
564: - Supplier's Malaysia Standard Industrial Classification (MSIC code)
565: - Description of Product / Services
566: 
567: ### UNVERIFIED â€” do not encode
568: 
569: - EPF (KWSP) CONTRIBUTION PERCENTAGES â€” NOT VERIFIED. kwsp.gov.my returned HTTP 403 Forbidden to every attempt (the mandatory-contribution page, the EPF Act 1991 Third Schedule page, and the Third Schedule PDF), both via WebFetch and via curl with full browser headers. The commonly cited figures (employer 13% for wages up to RM5,000 and 12% above RM5,000; employee 11%; reduced rates for age 60+; 2% employer / 2% employee for foreign workers from October 2025) appear only in third-party blogs and MUST NOT be treated as verified. Retrieve the EPF Act 1991 Third Schedule directly before encoding any EPF rate.
570: - SOCSO FLAT PERCENTAGES (1.75% employer / 0.5% employee) â€” NOT VERIFIED as stated percentages. The official PERKESO document is a 65-bracket RM table, not a percentage schedule. Deriving 1.75%/0.5% from the top bracket is approximate (employer RM104.15 / RM6,000 = 1.736%). Any implementation should use the official bracket table, not a percentage.
571: - EIS (Act 800) RATES â€” NOT VERIFIED. The official PERKESO PDF '151124-Rate Contribution ACT 800.pdf' was retrieved but contained no extractable text layer (0 characters â€” likely a scanned image). The commonly cited 0.2% employer / 0.2% employee split on a RM6,000 ceiling comes only from blogs.
572: - SKBBK EFFECTIVE DATE â€” NOT VERIFIED from an official page. The scheme's existence and rate columns ARE confirmed from PERKESO's own PDF, but the widely reported commencement of 1 June 2026, the reported 0.75% employee contribution rate, and the reported voluntary-for-Malaysians / mandatory-for-foreign-workers split all come from third-party payroll vendors. The linked official FAQ (050626-FAQSkimLINDUNG24Jam.pdf) sits behind an internal IP address (172.25.36.31) and is not publicly reachable.
573: - RENTAL / LEASING SERVICE TAX RATE REDUCTION 8% -> 6% FROM 1 JANUARY 2026 â€” NOT VERIFIED, AND THE OFFICIAL PAGE CONTRADICTS IT. The live MySST expansion FAQ (fetched today, site last updated 19/07/2026) still states 'The tax rate for rental or leasing services is 8%.' A reported reduction to 6% effective 1 January 2026, implemented as a service tax EXEMPTION pending gazetting of subsidiary legislation, appears only in a KPMG Malaysia commentary on 'Amendment to Service Tax Policy 2/2025'. Service Tax Policy Nos. 1/2026-4/2026 exist on the MySST site but their PDF contents were not retrieved. VERIFY before encoding a rental service tax rate.
574: - WHETHER BEAUTY / PERSONAL-CARE SERVICES WERE DROPPED FROM THE 1 JULY 2025 EXPANSION â€” CONFLICTING. The live official MySST FAQ still describes beauty treatment services as taxable at a flat 8% with a RM500,000 threshold, but secondary sources report beauty services were withdrawn after public feedback. Not resolved from an official page.
575: - ENTERTAINMENT 50% DEDUCTION PROVISO â€” NOT VERIFIED. The Form C Guidebook 2025 confirms entertainment is non-allowable under ITA 39(1)(l) and uses it as an add-back example, but the guidebook does not state the well-known proviso allowing 50% (or 100% for certain categories such as staff entertainment and promotional gifts). Confirm against LHDN Public Ruling on entertainment expense before building a 50%/100% split into the CoA.
576: - FORM C FOR YA2026 â€” NOT AVAILABLE. Only the YA2025 form (CP5 - Pin. 2025) and its guidebook are published on hasil.gov.my. The 59-item financial particulars taxonomy is stable across YA2022-YA2025 (sample forms exist for each), but the YA2026 form may differ.
577: - WHETHER THE E-INVOICE 'Classification' FIELD IS STRICTLY MANDATORY ON EVERY LINE â€” PARTIALLY VERIFIED. The Specific Guideline v4.8 shows it as data field no. 9 with explicit input instructions, and the SDK says 'taxpayers should be using the code values', but neither page carried an explicit mandatory/optional flag. Confirm against the MyInvois SDK validation rules / UBL schema.
578: - MTD/PCB REMITTANCE DUE DATE (15th of the following month) â€” WEAKLY VERIFIED. Confirmed only via search-engine summaries of hasil.gov.my pages; the LHDN MTD payment page (https://www.hasil.gov.my/en/employers/mtd-payment/) returned 404 on direct fetch because the site was recently restructured, and the MTD specification PDF URL also 404'd. The MTD/PCB scheme itself, the e-CP39/e-PCB channels and Form CP39 are confirmed to exist.
579: - HRD CORP EMPLOYEE-COUNT THRESHOLDS (10+ employees mandatory at 1%; 5-9 employees optional at 0.5%) â€” PARTIALLY VERIFIED. The official HRD Corp support centre confirms the 1% and 0.5% rates and the PSMB Act 2001 basis, but the specific employee-count cut-offs and the sector coverage under the First Schedule of the PSMB Act were paraphrased from search results rather than read from the official page text.
580: - SST 'NO INPUT TAX CREDIT' â€” INFERRED FROM STRONG OFFICIAL EVIDENCE, NOT FROM A SINGLE EXPLICIT SENTENCE. Confirmed officially that sales tax is a 'single stage tax', that GST input tax claims ended with a final GST-03 return in 2018, and that no input-credit mechanism appears anywhere in the SST registration/accounting pages. No official page was found that states in one sentence 'input tax is not claimable under SST'. The conclusion is sound but rests on composition of these facts.
581: - MySST GENERAL GUIDES ARE PARTLY STALE: the current 'General guideline for Sales Tax' PDF hosted on the live site is 'Panduan Umum Cukai Jualan - Ver 4, Sehingga 15 Januari 2019' (Malay only, dated 2019) and therefore predates both the March 2024 service tax rate change and the July 2025 expansion. Rate/threshold facts above were taken from the live HTML pages and 2025 FAQs, not from this guide.
582: - CORPORATE TAX RATES: Form C Part B shows apportionment rows at 15, 17 and 24 percent, but the form does not state the chargeable-income bands or the eligibility conditions (e.g. SME paid-up capital and gross income tests) that determine which rate applies. Confirm the bands from the ITA / LHDN rate page before use.
583: 
584: ### Sources
585: 
586: - https://www.hasil.gov.my/wp-content/uploads/samplerf_c2025_2.pdf
587: - https://www.hasil.gov.my/wp-content/uploads/guidebook_c2025_2.pdf
588: - https://www.hasil.gov.my/en/muat-turun-borang/muat-turun-borang-syarikat/
589: - https://www.hasil.gov.my/en/muat-turun-borang/
590: - https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf
591: - https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf
592: - https://sdk.myinvois.hasil.gov.my/codes/classification-codes/
593: - https://mysst.customs.gov.my/registering-business/
594: - https://mysst.customs.gov.my/understanding-sst/
595: - https://mysst.customs.gov.my/accounting-sst/
596: - https://mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/
597: - https://mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/
598: - https://mysst.customs.gov.my/service-tax-policy/
599: - https://mysst.customs.gov.my/about-exemption/
600: - https://mysst.customs.gov.my/general-guide/
601: - https://mysst.customs.gov.my/wp-content/uploads/2025/03/Panduan-Umum_Cukai-Jualan_18012019-v4-2.pdf
602: - https://www.mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025
603: - https://www.perkeso.gov.my/en/our-services/employer-employee/kadar-caruman.html
604: - https://www.perkeso.gov.my/en/rate-of-contribution.html
605: - https://www.perkeso.gov.my/images/lindung/lindung-24-jam/NewContributionRateIncludingSKBBK.pdf
606: - https://www.perkeso.gov.my/images/dokumen/151124-Rate%20Contribution%20ACT%20800.pdf
607: - https://www.perkeso.gov.my/en/our-services/protection/employment-insurance.html
608: - https://supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy
609: 

2026-07-24T09:45:33.212917Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
codex
The first pass already exposes a structural issue: the template says every core block is needed by every Sdn Bhd, yet it seeds activity-dependent balances (SST output, payroll levies, borrowings) while omitting several face/tax-analysis categories that recur in ordinary practice. I’m now separating “must be distinct for clean statutory/tax mapping” from “optional industry or transaction modules,” so the recommendations do not bloat the universal core.
web search: 
web search: site:hasil.gov.my "section 6D" incorporation expenditure company tax rebate Malaysia ...
web search: 
web search: site:ifrs.org IFRS for SMEs start-up activities legal secretarial costs establishing legal entity 18.15 ...
web search: 
web search: site:phl.hasil.gov.my PR 11/2013 pre-operational business expenditure pdf ...
2026-07-24T09:48:40.589642Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 
2026-07-24T09:48:45.599973Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR_11_2013.pdf incorporation expenditure rules 1974 ...
2026-07-24T09:48:53.751393Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "incorporation expenses" "paid-up capital" Malaysia tax deduction ...
2026-07-24T09:49:01.766271Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "Income Tax (Deduction For Incorporation Expenses)" "2017" Malaysia ...
2026-07-24T09:49:12.902341Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Amended Guidelines On Tax Deduction Of Secretarial Fees And Tax Filing Fees" ...
2026-07-24T09:49:25.960686Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "Amended Guidelines On Tax Deduction Of Secretarial Fees And Tax Filing Fees From YA 2022 Onwards" ...
2026-07-24T09:49:33.782034Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ssm.com.my Companies Act 2016 section 230 directors fees private company pdf ...
2026-07-24T09:49:41.230535Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016 section 230 fees benefits directors private company ...
2026-07-24T09:49:48.736155Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 
2026-07-24T09:49:53.939061Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam PR 3/2008 entertainment employees full deduction Malaysia ...
web search: 
web search: 'employees'
web search: 
web search: 
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR_4_2015.pdf "employees" "fully" ...
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR_4_2015.pdf "employees of that person" ...
web search: 
web search: site:hasil.gov.my "Deductions for Approved Training" Rules Malaysia official ...
web search: 
web search: site:hasil.gov.my company zakat perniagaan subsection 44(11A) official ...
web search: 
web search: site:ifrs.org/content/dam/ifrs/publications/ifrs-for-smes 20.9 finance lease lessee lower fair value present value minimum lease payments ...
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR_5_2014.pdf "capital portion" hire purchase ...
web search: 
web search: "Public Ruling No. 5/2014" "capital portion" hire purchase ...
web search: 
web search: site:hasil.gov.my "Public Ruling No. 5/2025" construction contracts retention sum ...
2026-07-24T09:51:34.148860Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:imi.gov.my levy foreign workers employer Malaysia official ...
2026-07-24T09:51:42.321963Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam PR 2/2003 key-man insurance Malaysia deductible ...
2026-07-24T09:51:54.648185Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my single tier dividend system section 108 Malaysia company official ...
2026-07-24T09:52:02.917424Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam PR 6/2006 legal professional expenses stamp duty loan agreement acquisition asset Malaysia ...
2026-07-24T09:52:10.996910Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR6_2006.pdf "loan agreement" ...
warning: Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.
context compacted
2026-07-24T09:54:37.450115Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
codex
I’ve finished the account-by-account map. The main defects are not merely “missing expense names”: current/non-current presentation, provisions and employee-benefit liabilities, tax-sensitive splits, and the boundary between core and activity-specific modules all need correction. I’m now checking the few treatments where Malaysian tax law can overturn an intuitive accounting answer—especially incorporation costs, hire purchase, and director payments.
The two repo sources are fully reviewed and every existing account is mapped. Official-source verification is now focused on accounting/tax treatments and the suspected gaps.
  ✓ Read repository guidance, the full COA template, and the official-source research memo
  ✓ Map all 106 accounts against MPERS/MBRS/Form C and identify gaps or risky classifications
  → Verify disputed Malaysian accounting, company-law, payroll, and tax treatments against official sources
  • Produce the add/change/remove/refuse-to-assert findings with concrete codes and citations
2026-07-24T09:54:47.668591Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my public ruling foreign exchange gains losses Malaysia unrealised realised business tax PDF ...
2026-07-24T09:54:55.150718Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'apps/dashboard/app/shared/coaTemplate.ts'; Select-String -Path "'$p -Pattern "allowance|impairment|Directors|SST on purchases|Foreign exchange|Management fee|Donations|Travel|insurance|Legal|Cost of goods|Deferred tax|Revenue|Other income|Rental" -Context 0,4' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 913ms:

> apps\dashboard\app\shared\coaTemplate.ts:64: * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 
COGS, 900-xxx
  apps\dashboard\app\shared\coaTemplate.ts:65: * mnemonic operating expenses, 999-R00 rounding). Numeric order 
identifies the block; it
  apps\dashboard\app\shared\coaTemplate.ts:66: * does not dictate statement order — the MPERS mapping does that.
  apps\dashboard\app\shared\coaTemplate.ts:67: *
  apps\dashboard\app\shared\coaTemplate.ts:68: *   100-199 equity        200-299 non-current assets   300-399 current 
assets
> apps\dashboard\app\shared\coaTemplate.ts:123:      "Trade receivables carries the receivable control marker. 
Director and related-party balances are separate, directional and never netted — MPERS Section 33 related-party 
disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
  apps\dashboard\app\shared\coaTemplate.ts:124:    accounts: [
  apps\dashboard\app\shared\coaTemplate.ts:125:      {
  apps\dashboard\app\shared\coaTemplate.ts:126:        code: "300-000",
  apps\dashboard\app\shared\coaTemplate.ts:127:        name: "Trade receivables — control",
> apps\dashboard\app\shared\coaTemplate.ts:132:      { code: "300-900", name: "Allowance for impairment — trade 
receivables", type: "asset", mpers: "Trade and other receivables" },
  apps\dashboard\app\shared\coaTemplate.ts:133:      { code: "310-B01", name: "Bank — main operating account", type: 
"asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 …" },
  apps\dashboard\app\shared\coaTemplate.ts:134:      { code: "320-C01", name: "Cash on hand / petty cash", type: 
"asset", mpers: "Cash and cash equivalents" },
  apps\dashboard\app\shared\coaTemplate.ts:135:      { code: "340-P01", name: "Prepayments", type: "asset", mpers: 
"Trade and other receivables" },
  apps\dashboard\app\shared\coaTemplate.ts:136:      { code: "340-D01", name: "Deposits paid", type: "asset", mpers: 
"Trade and other receivables" },
> apps\dashboard\app\shared\coaTemplate.ts:138:      { code: "350-D01", name: "Amount owing from director", type: 
"asset", mpers: "Trade and other receivables — related party", note: "Directional. Never net against 420-D01 without a 
legally enforceable right of set-off." },
  apps\dashboard\app\shared\coaTemplate.ts:139:      { code: "350-R01", name: "Amount owing from related company", 
type: "asset", mpers: "Trade and other receivables — related party" },
  apps\dashboard\app\shared\coaTemplate.ts:140:      { code: "360-T01", name: "Tax instalments paid / current tax 
receivable", type: "asset", mpers: "Current tax assets" },
  apps\dashboard\app\shared\coaTemplate.ts:141:    ],
  apps\dashboard\app\shared\coaTemplate.ts:142:  },
> apps\dashboard\app\shared\coaTemplate.ts:162:      { code: "410-006", name: "EIS payable", type: "liability", mpers: 
"Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) — separate from Act 4." },
  apps\dashboard\app\shared\coaTemplate.ts:163:      { code: "410-007", name: "PCB / MTD payable", type: "liability", 
mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form 
CP39)." },
  apps\dashboard\app\shared\coaTemplate.ts:164:      { code: "410-008", name: "HRD Corp levy payable", type: 
"liability", mpers: "Trade and other payables", note: "PSMB Act 2001 — applies only to employers within scope or 
registered voluntarily." },
  apps\dashboard\app\shared\coaTemplate.ts:165:      { code: "420-D01", name: "Amount owing to director", type: 
"liability", mpers: "Trade and other payables — related party" },
  apps\dashboard\app\shared\coaTemplate.ts:166:      { code: "420-R01", name: "Amount owing to related company", type: 
"liability", mpers: "Trade and other payables — related party" },
> apps\dashboard\app\shared\coaTemplate.ts:182:      { code: "430-WHT", name: "Withholding tax payable", type: 
"liability", mpers: "Trade and other payables", note: "Payments to non-residents — ITA s.107A contract payments, s.4A 
technical/management fees." },
  apps\dashboard\app\shared\coaTemplate.ts:183:      { code: "440-001", name: "Current tax payable (provision for 
taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision — it belongs 
in current tax liabilities." },
  apps\dashboard\app\shared\coaTemplate.ts:184:      { code: "460-L01", name: "Borrowings — current", type: 
"liability", mpers: "Financial liabilities — current" },
  apps\dashboard\app\shared\coaTemplate.ts:185:      { code: "461-L01", name: "Borrowings — non-current", type: 
"liability", mpers: "Financial liabilities — non-current" },
  apps\dashboard\app\shared\coaTemplate.ts:186:      { code: "490-D01", name: "Customer deposits", type: "liability", 
mpers: "Trade and other payables" },
> apps\dashboard\app\shared\coaTemplate.ts:194:    blurb: "Revenue split by nature; other income kept apart from 
revenue so the MPERS 5.5 face lines map cleanly.",
  apps\dashboard\app\shared\coaTemplate.ts:195:    accounts: [
> apps\dashboard\app\shared\coaTemplate.ts:196:      { code: "500-000", name: "Revenue", type: "income", mpers: 
"Revenue" },
> apps\dashboard\app\shared\coaTemplate.ts:197:      { code: "500-S01", name: "Service revenue", type: "income", 
mpers: "Revenue" },
> apps\dashboard\app\shared\coaTemplate.ts:198:      { code: "500-G01", name: "Sale of goods", type: "income", mpers: 
"Revenue" },
> apps\dashboard\app\shared\coaTemplate.ts:199:      { code: "510-RET", name: "Sales returns and allowances (contra)", 
type: "income", mpers: "Revenue — net" },
> apps\dashboard\app\shared\coaTemplate.ts:200:      { code: "510-DIS", name: "Sales discounts (contra)", type: 
"income", mpers: "Revenue — net" },
> apps\dashboard\app\shared\coaTemplate.ts:201:      { code: "530-000", name: "Other income", type: "income", mpers: 
"Other income" },
> apps\dashboard\app\shared\coaTemplate.ts:202:      { code: "530-R01", name: "Rental income", type: "income", mpers: 
"Other income", note: "Present as revenue instead where letting is a principal activity." },
> apps\dashboard\app\shared\coaTemplate.ts:203:      { code: "530-G01", name: "Gain on disposal of assets", type: 
"income", mpers: "Other income" },
> apps\dashboard\app\shared\coaTemplate.ts:204:      { code: "530-FX1", name: "Realised foreign exchange gain", type: 
"income", mpers: "Other income", note: "Realised and unrealised kept apart — unrealised amounts are a tax-computation 
adjustment." },
> apps\dashboard\app\shared\coaTemplate.ts:205:      { code: "530-FX2", name: "Unrealised foreign exchange gain", 
type: "income", mpers: "Other income" },
  apps\dashboard\app\shared\coaTemplate.ts:206:      { code: "540-I01", name: "Interest income", type: "income", 
mpers: "Finance income" },
  apps\dashboard\app\shared\coaTemplate.ts:207:    ],
  apps\dashboard\app\shared\coaTemplate.ts:208:  },
  apps\dashboard\app\shared\coaTemplate.ts:209:  {
> apps\dashboard\app\shared\coaTemplate.ts:215:      { code: "610-100", name: "Cost of goods sold / purchases", type: 
"expense", mpers: "Cost of sales" },
  apps\dashboard\app\shared\coaTemplate.ts:216:      { code: "610-S01", name: "Subcontractor and direct service 
costs", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract 
payments." },
  apps\dashboard\app\shared\coaTemplate.ts:217:      { code: "610-F01", name: "Freight and carriage inward", type: 
"expense", mpers: "Cost of sales" },
  apps\dashboard\app\shared\coaTemplate.ts:218:      { code: "610-RET", name: "Purchase returns (contra)", type: 
"expense", mpers: "Cost of sales" },
  apps\dashboard\app\shared\coaTemplate.ts:219:      { code: "610-DIS", name: "Purchase discounts (contra)", type: 
"expense", mpers: "Cost of sales" },
> apps\dashboard\app\shared\coaTemplate.ts:230:      { code: "810-T02", name: "Deferred tax expense / (income)", type: 
"expense", mpers: "Tax expense" },
  apps\dashboard\app\shared\coaTemplate.ts:231:    ],
  apps\dashboard\app\shared\coaTemplate.ts:232:  },
  apps\dashboard\app\shared\coaTemplate.ts:233:  {
  apps\dashboard\app\shared\coaTemplate.ts:234:    key: "operating-expenses",
> apps\dashboard\app\shared\coaTemplate.ts:238:      "Split to serve the LHDN tax computation: entertainment is 
separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an 
add-back or restricted deduction.",
  apps\dashboard\app\shared\coaTemplate.ts:239:    accounts: [
  apps\dashboard\app\shared\coaTemplate.ts:240:      { code: "900-A01", name: "Accounting fee", type: "expense", 
mpers: "Administrative expenses" },
  apps\dashboard\app\shared\coaTemplate.ts:241:      { code: "900-A02", name: "Audit fee", type: "expense", mpers: 
"Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." 
},
  apps\dashboard\app\shared\coaTemplate.ts:242:      { code: "900-A03", name: "Advertising and marketing", type: 
"expense", mpers: "Selling and distribution expenses" },
> apps\dashboard\app\shared\coaTemplate.ts:245:      { code: "900-B03", name: "Impairment loss — trade receivables", 
type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation 
distinction." },
  apps\dashboard\app\shared\coaTemplate.ts:246:      { code: "900-C01", name: "Commission expense", type: "expense", 
mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately 
disclosed." },
> apps\dashboard\app\shared\coaTemplate.ts:247:      { code: "900-D01", name: "Directors' fees and remuneration", 
type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4) disclosure." },
> apps\dashboard\app\shared\coaTemplate.ts:248:      { code: "900-D02", name: "Depreciation", type: "expense", mpers: 
"Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
> apps\dashboard\app\shared\coaTemplate.ts:249:      { code: "900-DON", name: "Donations", type: "expense", mpers: 
"Other operating expenses", note: "Deductibility depends on approved-institution status." },
  apps\dashboard\app\shared\coaTemplate.ts:250:      { code: "900-E01", name: "EPF — employer contribution", type: 
"expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of 
remuneration, so this must be separately measurable." },
  apps\dashboard\app\shared\coaTemplate.ts:251:      { code: "900-E02", name: "SOCSO and EIS — employer contribution", 
type: "expense", mpers: "Employee benefits" },
  apps\dashboard\app\shared\coaTemplate.ts:252:      { code: "900-E03", name: "Entertainment — staff", type: 
"expense", mpers: "Administrative expenses", note: "Kept apart from client entertainment: the deduction restriction 
differs." },
  apps\dashboard\app\shared\coaTemplate.ts:253:      { code: "900-E04", name: "Entertainment — client / business", 
type: "expense", mpers: "Administrative expenses", note: "Restricted deduction." },
> apps\dashboard\app\shared\coaTemplate.ts:254:      { code: "900-F01", name: "Realised foreign exchange loss", type: 
"expense", mpers: "Other operating expenses" },
> apps\dashboard\app\shared\coaTemplate.ts:255:      { code: "900-F02", name: "Unrealised foreign exchange loss", 
type: "expense", mpers: "Other operating expenses", note: "Tax-computation adjustment." },
  apps\dashboard\app\shared\coaTemplate.ts:256:      { code: "900-FIN", name: "Fines and penalties", type: "expense", 
mpers: "Other operating expenses", note: "Non-deductible." },
  apps\dashboard\app\shared\coaTemplate.ts:257:      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: 
"Employee benefits" },
> apps\dashboard\app\shared\coaTemplate.ts:258:      { code: "900-I01", name: "Insurance", type: "expense", mpers: 
"Administrative expenses" },
> apps\dashboard\app\shared\coaTemplate.ts:259:      { code: "900-L01", name: "Legal and professional fees", type: 
"expense", mpers: "Administrative expenses" },
  apps\dashboard\app\shared\coaTemplate.ts:260:      { code: "900-M01", name: "Motor vehicle expenses", type: 
"expense", mpers: "Administrative expenses" },
> apps\dashboard\app\shared\coaTemplate.ts:261:      { code: "900-M02", name: "Management fees", type: "expense", 
mpers: "Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, 
to be separately disclosed." },
> apps\dashboard\app\shared\coaTemplate.ts:262:      { code: "900-O01", name: "Rental of premises", type: "expense", 
mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 — check the 
supplier's registration status." },
  apps\dashboard\app\shared\coaTemplate.ts:263:      { code: "900-P01", name: "Printing, stationery and postage", 
type: "expense", mpers: "Administrative expenses" },
  apps\dashboard\app\shared\coaTemplate.ts:264:      { code: "900-R01", name: "Repairs and maintenance", type: 
"expense", mpers: "Administrative expenses", note: "Repairs vs capital improvement is a tax-computation distinction." 
},
  apps\dashboard\app\shared\coaTemplate.ts:265:      { code: "900-S01", name: "Salaries and wages", type: "expense", 
mpers: "Employee benefits" },
  apps\dashboard\app\shared\coaTemplate.ts:266:      { code: "900-S03", name: "Software and subscriptions", type: 
"expense", mpers: "Administrative expenses" },
> apps\dashboard\app\shared\coaTemplate.ts:270:        name: "SST on purchases (expensed)",
  apps\dashboard\app\shared\coaTemplate.ts:271:        type: "expense",
  apps\dashboard\app\shared\coaTemplate.ts:272:        special: "sst_purchase_cost",
  apps\dashboard\app\shared\coaTemplate.ts:273:        mpers: "Administrative expenses",
  apps\dashboard\app\shared\coaTemplate.ts:274:        note: "Malaysian SST is NOT a credit-offset VAT — it is a cost. 
Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT 
be routed here.",
> apps\dashboard\app\shared\coaTemplate.ts:277:      { code: "900-T02", name: "Travel and accommodation", type: 
"expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep 
local and overseas distinguishable." },
  apps\dashboard\app\shared\coaTemplate.ts:278:      { code: "900-T03", name: "Toll and parking", type: "expense", 
mpers: "Administrative expenses", note: "Do NOT combine with fines — the tax treatment differs." },
  apps\dashboard\app\shared\coaTemplate.ts:279:      { code: "900-U01", name: "Utilities", type: "expense", mpers: 
"Administrative expenses" },
  apps\dashboard\app\shared\coaTemplate.ts:280:    ],
  apps\dashboard\app\shared\coaTemplate.ts:281:  },
> apps\dashboard\app\shared\coaTemplate.ts:299:      { code: "330-900", name: "Allowance for inventory obsolescence", 
type: "asset", mpers: "Inventories" },
  apps\dashboard\app\shared\coaTemplate.ts:300:      { code: "620-ADJ", name: "Inventory movement and stock 
adjustments", type: "expense", mpers: "Cost of sales" },
  apps\dashboard\app\shared\coaTemplate.ts:301:    ],
  apps\dashboard\app\shared\coaTemplate.ts:302:  },
  apps\dashboard\app\shared\coaTemplate.ts:303:  {
> apps\dashboard\app\shared\coaTemplate.ts:305:    title: "Investments and deferred tax (optional)",
  apps\dashboard\app\shared\coaTemplate.ts:306:    tier: "optional",
> apps\dashboard\app\shared\coaTemplate.ts:307:    blurb: "Seed only where the entity holds investments or recognises 
deferred tax.",
  apps\dashboard\app\shared\coaTemplate.ts:308:    accounts: [
  apps\dashboard\app\shared\coaTemplate.ts:309:      { code: "230-001", name: "Investment property — cost", type: 
"asset", mpers: "Investment property" },
  apps\dashboard\app\shared\coaTemplate.ts:310:      { code: "231-001", name: "Accumulated depreciation — investment 
property", type: "asset", mpers: "Investment property" },
  apps\dashboard\app\shared\coaTemplate.ts:311:      { code: "240-S01", name: "Investment in subsidiaries", type: 
"asset", mpers: "Investments in subsidiaries" },
> apps\dashboard\app\shared\coaTemplate.ts:313:      { code: "260-DTA", name: "Deferred tax asset", type: "asset", 
mpers: "Deferred tax assets" },
> apps\dashboard\app\shared\coaTemplate.ts:314:      { code: "450-DTL", name: "Deferred tax liability", type: 
"liability", mpers: "Deferred tax liabilities" },
  apps\dashboard\app\shared\coaTemplate.ts:315:    ],
  apps\dashboard\app\shared\coaTemplate.ts:316:  },
  apps\dashboard\app\shared\coaTemplate.ts:317:];
  apps\dashboard\app\shared\coaTemplate.ts:318:



2026-07-24T09:55:00.921040Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Select-String -Path 'apps/dashboard/app/shared/coaTemplate.ts' -Pattern '%|20\\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|threshold|rate|RM'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 799ms:

apps\dashboard\app\shared\coaTemplate.ts:5:// MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources, and a cross-model 
(gpt-5.6-sol)
apps\dashboard\app\shared\coaTemplate.ts:9://   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both 
extracted in full
apps\dashboard\app\shared\coaTemplate.ts:11://   sequence or format in which items are to be presented", and 4.9(b) 
permits renaming
apps\dashboard\app\shared\coaTemplate.ts:12://   and resequencing. CA 2016 s.245 is outcome-based — records must 
"sufficiently explain
apps\dashboard\app\shared\coaTemplate.ts:18:// Form C analysis and tax-computation add-backs. It is a starting point a 
professional
apps\dashboard\app\shared\coaTemplate.ts:21:// DELIBERATELY ABSENT: rates, thresholds, percentages, effective dates. 
SST rates, tax
apps\dashboard\app\shared\coaTemplate.ts:22:// bands, EPF/SOCSO/EIS/HRD rates and MyInvois deadlines are 
effective-dated compliance
apps\dashboard\app\shared\coaTemplate.ts:23:// facts that change (service tax moved 6%->8% on 1 Mar 2024; scope 
expanded 1 Jul 2025;
apps\dashboard\app\shared\coaTemplate.ts:24:// Service Tax Policies 1-4/2026 are live). They must never be encoded in 
an account name
apps\dashboard\app\shared\coaTemplate.ts:27:// FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. 
MPERS (2025) —
apps\dashboard\app\shared\coaTemplate.ts:28:// Malaysia's adoption of IFRS for SMEs 3rd edition — was gazetted 10 
October 2025 and
apps\dashboard\app\shared\coaTemplate.ts:29:// applies to annual periods beginning on or after 1 January 2027 (early 
adoption
apps\dashboard\app\shared\coaTemplate.ts:30:// permitted). Sections 4 and 5 are substantively unchanged between them, 
so this template
apps\dashboard\app\shared\coaTemplate.ts:38:  /** control-account marker; only 'payable' | 'receivable' are permitted 
by the DB */
apps\dashboard\app\shared\coaTemplate.ts:49:  /** why this account exists as a separate line (tax analysis, statutory 
disclosure, MPERS split) */
apps\dashboard\app\shared\coaTemplate.ts:63: * Code scheme (extends the convention already in use by the firm: 100-000 
share capital,
apps\dashboard\app\shared\coaTemplate.ts:81:      "No share-premium account: Companies Act 2016 s.74 abolished par 
value for shares (s.618 handled the transition of pre-existing premium balances).",
apps\dashboard\app\shared\coaTemplate.ts:98:        note: "A conversion account, not permanent equity. Must net to nil 
and be cleared before statutory statements are finalised.",
apps\dashboard\app\shared\coaTemplate.ts:106:    blurb: "Cost and accumulated depreciation held separately, as MPERS 
Section 17 disclosure requires.",
apps\dashboard\app\shared\coaTemplate.ts:123:      "Trade receivables carries the receivable control marker. Director 
and related-party balances are separate, directional and never netted — MPERS Section 33 related-party disclosure, and 
CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
apps\dashboard\app\shared\coaTemplate.ts:132:      { code: "300-900", name: "Allowance for impairment — trade 
receivables", type: "asset", mpers: "Trade and other receivables" },
apps\dashboard\app\shared\coaTemplate.ts:148:      "Every statutory payroll deduction is its own payable — EPF, SOCSO, 
SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be 
independently reconcilable.",
apps\dashboard\app\shared\coaTemplate.ts:162:      { code: "410-006", name: "EIS payable", type: "liability", mpers: 
"Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) — separate from Act 4." },
apps\dashboard\app\shared\coaTemplate.ts:163:      { code: "410-007", name: "PCB / MTD payable", type: "liability", 
mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form 
CP39)." },
apps\dashboard\app\shared\coaTemplate.ts:164:      { code: "410-008", name: "HRD Corp levy payable", type: 
"liability", mpers: "Trade and other payables", note: "PSMB Act 2001 — applies only to employers within scope or 
registered voluntarily." },
apps\dashboard\app\shared\coaTemplate.ts:180:        note: "Sales tax is a single-stage tax on 
manufacturers/importers, accounted on an ACCRUAL basis — a different regime from service tax. Seeded without the 
marker because the schema permits only one sst_output account per client.",
apps\dashboard\app\shared\coaTemplate.ts:213:    blurb: "Form C requires contract and subcontract payments to be 
separately disclosed.",
apps\dashboard\app\shared\coaTemplate.ts:216:      { code: "610-S01", name: "Subcontractor and direct service costs", 
type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." 
},
apps\dashboard\app\shared\coaTemplate.ts:226:    blurb: "MPERS 5.5 requires finance costs and tax expense as separate 
face lines.",
apps\dashboard\app\shared\coaTemplate.ts:238:      "Split to serve the LHDN tax computation: entertainment is 
separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an 
add-back or restricted deduction.",
apps\dashboard\app\shared\coaTemplate.ts:241:      { code: "900-A02", name: "Audit fee", type: "expense", mpers: 
"Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." 
},
apps\dashboard\app\shared\coaTemplate.ts:245:      { code: "900-B03", name: "Impairment loss — trade receivables", 
type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation 
distinction." },
apps\dashboard\app\shared\coaTemplate.ts:246:      { code: "900-C01", name: "Commission expense", type: "expense", 
mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately 
disclosed." },
apps\dashboard\app\shared\coaTemplate.ts:247:      { code: "900-D01", name: "Directors' fees and remuneration", type: 
"expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4) disclosure." },
apps\dashboard\app\shared\coaTemplate.ts:250:      { code: "900-E01", name: "EPF — employer contribution", type: 
"expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of 
remuneration, so this must be separately measurable." },
apps\dashboard\app\shared\coaTemplate.ts:261:      { code: "900-M02", name: "Management fees", type: "expense", mpers: 
"Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be 
separately disclosed." },
apps\dashboard\app\shared\coaTemplate.ts:262:      { code: "900-O01", name: "Rental of premises", type: "expense", 
mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 — check the 
supplier's registration status." },
apps\dashboard\app\shared\coaTemplate.ts:274:        note: "Malaysian SST is NOT a credit-offset VAT — it is a cost. 
Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT 
be routed here.",
apps\dashboard\app\shared\coaTemplate.ts:277:      { code: "900-T02", name: "Travel and accommodation", type: 
"expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep 
local and overseas distinguishable." },
apps\dashboard\app\shared\coaTemplate.ts:330: * 1. clara.coa_accounts permits only ONE account per client carrying 
special_acc_type
apps\dashboard\app\shared\coaTemplate.ts:332: *    thresholds, rates and — critically — different accounting bases 
(sales tax accrual,
apps\dashboard\app\shared\coaTemplate.ts:333: *    service tax payment). A dual registrant needs two separately tagged 
control accounts,



2026-07-24T09:55:07.882326Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Public Ruling No. 4/2019" bad debts PDF ...
2026-07-24T09:55:15.643289Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: 
2026-07-24T09:55:22.406932Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my PR 11 2013 incorporation expenses deduction rules 2003 authorised capital company Malaysia ...
2026-07-24T09:55:28.356314Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ssm.com.my Companies Act 2016 authorised capital abolished no par value Malaysia FAQ ...
2026-07-24T09:55:35.660903Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "section 6D" company rebate incorporation expenses 2025 Malaysia ...
2026-07-24T09:55:42.560097Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: "Income Tax (Deduction of Incorporation Expenses) Rules 2003" authorised capital 2.5 million ...
2026-07-24T09:55:50.101816Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ifrs.org "formation and start-up activities" "IFRS for SMEs" Section 18 PDF ...
web search: 
web search: site:hasil.gov.my "Public Ruling No. 5/2014" hire purchase PDF capital allowance interest ...
web search: 
web search: 'principal'
web search: 
web search: site:phl.hasil.gov.my/pdf/pdfam/PR_5_2014.pdf "capital portion" ...
web search: 
web search: site:ssm.com.my Companies Act 2016 section 230 fees benefits private company directors approval FAQ ...
web search: 
web search: site:ssm.com.my/Pages/Legal_Framework/Document "230" "fees of the directors" private company ...
web search: 
web search: site:hasil.gov.my/media/ "FORM C 2025" "DIRECTORS’ FEE" "SALARIES AND WAGES" ...
web search: 
web search: site:hasil.gov.my "tax filing fee" "approved tax agent" deduction Malaysia guidelines 2022 ...
web search: 
web search: site:hasil.gov.my employer deduction employee medical expenses staff welfare Malaysia public ruling ...
web search: 
web search: site:hasil.gov.my Form C 2025 zakat business aggregate income company A13 ...
web search: 
web search: site:ifrs.org/supporting-implementation/smes/module-4.pdf current non-current assets liabilities IFRS for SMEs ...
web search: 
web search: site:ssm.com.my MBRS taxonomy MPERS current non-current trade receivables payables provisions employee benefits PDF ...
web search: 
web search: site:ifrs.org/supporting-implementation/smes "investment property" "fair value can be measured reliably without undue cost or effort" Section 16 ...
2026-07-24T09:57:32.247407Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ssm.com.my Companies Act 2016 section 131 132 dividends profits solvent directors authorize ...
2026-07-24T09:57:40.238250Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:imi.gov.my foreign worker levy deposit employer responsible refund Malaysia temporary employment pass ...
2026-07-24T09:57:46.820629Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Public Ruling No. 6/2006" legal professional expenses capital revenue PDF ...
2026-07-24T09:57:54.039017Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Public Ruling No. 2/2003" key-man insurance deductible PDF ...
2026-07-24T09:58:04.866062Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:mysst.customs.gov.my service tax no input tax credit Malaysia SST purchase cost official ...
2026-07-24T09:58:12.062900Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:ifrs.org/supporting-implementation/smes/module-7.pdf bank overdrafts repayable on demand integral part cash management IFRS SMEs ...
2026-07-24T09:58:22.658782Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; Select-String -Path "'$p -Pattern '"'4.11|Contribution to zakat|Directors|tax filing|Hire|incorporation|pre-oper|deposits|provisions|employee benefits|opening inventory|SST|non-resident|retention|dividend|research and development' | Select-Object LineNumber,Line" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 844ms:

LineNumber Line                                                                                                        
---------- ----                                                                                                        
        11 **What MPERS legally IS.** MPERS is a MASB Approved Accounting Standard issued under subsection 7(1) of t...
        13 **What it MANDATES.** Only (a) minimum *line items* that must appear on the face of the primary statement...
        17 **Practical design consequence for a Sdn Bhd default CoA.** The chart of accounts is a free design choice...
        24 - CA 2016 s.244(1)-(2) verbatim: 'The approved accounting standards shall apply to the financial statemen...
        25 - CA 2016 s.245(1) verbatim is outcome-based, not structural: directors shall 'cause to be kept the accou...
        49 - SSMxT 2022 added a new statement to the MPERS entry points: 'New statement added in MPERS FS & KFI for ...
        71 - (p) provisions;                                                                                           
        80 - === MPERS 4.11 — SUB-CLASSIFICATIONS, FACE OR NOTES (verbatim) — THE PRACTICAL CoA DRIVER ===             
        81 - 4.11 An entity shall disclose, either in the statement of financial position or in the notes, the follo...
        86 - (e) provisions for employee benefits and other provisions; and                                            
        89 - 4.12 An entity with share capital shall disclose the following, either in the statement of financial po...
       113 - (i) some gains and losses arising on translating the financial statements of a foreign operation (see S...
       116 - Analysis by nature of expense — (a) Under this method of classification, expenses are aggregated in the...
       122 - (a) the directors' remuneration; (b) the directors' retirement benefits; (c) compensation to directors ...
       123 - === EQUITY SECTION FOR A POST-2017 Sdn Bhd (derived from CA 2016 s.74/s.618 + MPERS 4.11(f)) ===          
       144 - MPERS Section 6's combined 'Statement of Income and Retained Earnings' option: I verified from the MASB...
       198 - Applicable statements for a FULL financial statements filing (Architecture Table 1 and FAQ §1.6, minimu...
       202 - The FS-MPERS entry point is ssmt-fs-mpers_2022-12-31_entry_point.xsd at http://xbrl.ssm.com.my/taxonomy...
       206 - MINIMUM BREAKDOWN — hard validation, FS-MPERS Statement of Financial Position. Business rule IDs SOFP-M...
       210 - Rule volume per statement for FS-MPERS (counted from the SSM Business Rules workbook, sheet 'FS-MPERS -...
       211 - Mandatory scope-of-filing facts for FS-MPERS (Error severity): Date of financial statements approved by...
       216 - KFI-MPERS (the reduced filing available only after EA2 approval) has these ELRs: [020000] Scope of fili...
       263 - ifrs-smes_NoncurrentProvisionsForEmployeeBenefits | Employee benefits                                     
       264 - ifrs-smes_NoncurrentProvisions | Provisions                                                               
       271 - ifrs-smes_CurrentProvisionsForEmployeeBenefits | Employee benefits                                        
       272 - ifrs-smes_CurrentProvisions | Provisions                                                                  
       289 - ifrs-smes_ResearchAndDevelopmentExpense | Research and development expense                                
       297 - ssmt-mpers_ContributionOfZakat | Contribution to zakat                                                    
       307 - ssmt-mpers_EmployeeBenefitsExpenseByNature | Employee benefits expense                                    
       320 - Other receivables split into: due-from-related-parties block (holding company, subsidiaries, associates...
       324 - ifrs-smes_Revenue | ssmt-mpers_Expenditure (Expenditure) | ifrs-smes_ProfitLossBeforeTax | ifrs-smes_Pr...
       340 - ssmt_DateOfFinancialStatementsApprovedByBoardOfDirectors | ssmt_DateOfCirculationOfFinancialStatementsA...
       351 - EXACT SEMANTICS OF SOME DUPLICATED NAMES IN THE MANDATORY-ELEMENT LISTS. The SOFP mandatory rule text l...
       375 ## LHDN / RMCD (tax, SST, e-invoice)                                                                        
       383 (2) RMCD / MySST — Sales Tax Act 2018 and Service Tax Act 2018 mandate registration at prescribed thresho...
       385 (3) LHDN e-Invoice / MyInvois — mandates issuance of structured XML/JSON e-Invoices per a phased timeline...
       395 - FORM C Part A confirms the income-source taxonomy a company must report: A1 'Aggregate statutory income...
       396 - FORM C Part A tax-computation adjustment lines verified: A4 'LESS: Business losses brought forward (Res...
       398 - FORM C GUIDEBOOK 2025 paragraph 1.2.3 'Non-allowable Expenses' lists verbatim by legal provision: 33(2)...
       400 - FORM C GUIDEBOOK 2025 additional non-allowable items listed without a section number, verbatim: 'All ty...
       402 - FORM C GUIDEBOOK 2025 section 1.3 mandates documentation retention: 'Documents, records and other writt...
       403 - FORM C also requires separately disclosed data for: contract/subcontract payments, commissions and rent...
       404 - SST — GST REPEALED: The RMCD General Guide on Sales Tax (Panduan Umum Cukai Jualan, Ver 4) confirms the...
       405 - SST — SINGLE STAGE: mysst.customs.gov.my/understanding-sst/ defines Sales Tax verbatim as 'A single sta...
       406 - SST — TAXABLE PERIOD: 'The standard taxable period for SST (both Sales and Service Tax) is bimonthly (o...
       407 - SST — ACCOUNTING BASIS DIFFERS BY TAX (mysst.customs.gov.my/accounting-sst/): Sales Tax is accounted on...
       408 - SALES TAX REGISTRATION THRESHOLD (mysst.customs.gov.my/registering-business/): 'SALES VALUE OF TAXABLE ...
       409 - SALES TAX RATES from 1 July 2025 (mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/):...
       410 - SERVICE TAX RATE (mysst.customs.gov.my/registering-business/, Service Tax tab): 'Rate of tax is amended...
       411 - SERVICE TAX GROUP THRESHOLDS pre-expansion (mysst.customs.gov.my/registering-business/): Group A RM 500...
       412 - SERVICE TAX EXPANSION EFFECTIVE 1 JULY 2025 (mysst.customs.gov.my/faq-expansion-of-service-tax-scope-20...
       416 - SERVICE TAX EXPANSION — FINANCIAL SERVICES: 'Any financial service provider whose taxable services exce...
       419 - MySST publishes Service Tax Policy Nos. 1/2026, 2/2026, 3/2026 and 4/2026 (list at mysst.customs.gov.my...
       424 - E-INVOICE — CLASSIFICATION REQUIREMENT (from IRBM e-Invoice Specific Guideline VERSION 4.8, https://www...
       443 - 4 Opening inventory                                                                                       
       456 - 16 Technical fee payments to non-resident receipients                                                     
       458 - 18 Directors' fee                                                                                         
       464 - 24 Research and development                                                                               
       484 - 42 Loans to directors                                                                                     
       493 - 50 Loans from directors                                                                                   
       508 - A6 Aggregate of other statutory income from sources in Malaysia - Dividends, interest, discounts, rents...
       509 - A7 Aggregate of other statutory income from sources outside Malaysia received in Malaysia - Dividends, ...
       511 - A11 Prospecting expenditure under schedule 4 / pre-operational business expenditure under schedule 4B /...
       533 - Withholding-tax-failure disallowances: interest/royalty to non-residents without s.109 [39(1)(f)]; cont...
       544 - === SST LEDGER ACCOUNTS REQUIRED (SST is single-stage, NO input tax credit) ===                           
       550 - Imported Taxable Services — service tax self-accounted by the recipient (MySST maintains a separate 'No...
       551 - NO 'Input Tax Recoverable' / 'SST Receivable' account — sales tax and service tax borne on purchases ar...
       563 - Supplier's SST Registration Number                                                                        
       573 - RENTAL / LEASING SERVICE TAX RATE REDUCTION 8% -> 6% FROM 1 JANUARY 2026 — NOT VERIFIED, AND THE OFFICI...
       574 - WHETHER BEAUTY / PERSONAL-CARE SERVICES WERE DROPPED FROM THE 1 JULY 2025 EXPANSION — CONFLICTING. The ...
       580 - SST 'NO INPUT TAX CREDIT' — INFERRED FROM STRONG OFFICIAL EVIDENCE, NOT FROM A SINGLE EXPLICIT SENTENCE...
       581 - MySST GENERAL GUIDES ARE PARTLY STALE: the current 'General guideline for Sales Tax' PDF hosted on the ...
       593 - https://mysst.customs.gov.my/registering-business/                                                        
       594 - https://mysst.customs.gov.my/understanding-sst/                                                           
       595 - https://mysst.customs.gov.my/accounting-sst/                                                              
       596 - https://mysst.customs.gov.my/faq-expansion-of-service-tax-scope-2025/                                     
       597 - https://mysst.customs.gov.my/faq-transition-of-sales-tax-rate-changes-2025/                               
       598 - https://mysst.customs.gov.my/service-tax-policy/                                                          
       599 - https://mysst.customs.gov.my/about-exemption/                                                             
       600 - https://mysst.customs.gov.my/general-guide/                                                               
       601 - https://mysst.customs.gov.my/wp-content/uploads/2025/03/Panduan-Umum_Cukai-Jualan_18012019-v4-2.pdf       



2026-07-24T09:58:29.307176Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$text=Get-Content '"'apps/dashboard/app/shared/coaTemplate.ts' -Raw; "'$matches=[regex]::Matches($text,'"'code:\\s*\"(["'^"]+)"'"'); \"count="'$($matches.Count)"; $matches | ForEach-Object {$_.Groups[1].Value} | Group-Object | Where-Object Count -gt 1 | Format-Table -AutoSize' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 759ms:
count=106

2026-07-24T09:58:39.106126Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$text=Get-Content '"'apps/dashboard/app/shared/coaTemplate.ts' -Raw; "'$accountLines=Select-String -Path '"'apps/dashboard/app/shared/coaTemplate.ts' -Pattern 'code:\\s*\"'; "'$withNote=$accountLines | Where-Object {$_.Line -match '"'note:'}; \"single-line accounts="'$($accountLines.Count) single-line notes=$($withNote.Count)"' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 886ms:
single-line accounts=106 single-line notes=28

2026-07-24T09:58:48.795732Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Select-String -Path 'apps/dashboard/app/shared/coaTemplate.ts' -Pattern 'key:|title:|tier:'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 843ms:

apps\dashboard\app\shared\coaTemplate.ts:54:  key: string;
apps\dashboard\app\shared\coaTemplate.ts:55:  title: string;
apps\dashboard\app\shared\coaTemplate.ts:57:  tier: "core" | "optional";
apps\dashboard\app\shared\coaTemplate.ts:77:    key: "equity",
apps\dashboard\app\shared\coaTemplate.ts:78:    title: "Equity",
apps\dashboard\app\shared\coaTemplate.ts:79:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:103:    key: "ppe",
apps\dashboard\app\shared\coaTemplate.ts:104:    title: "Property, plant and equipment",
apps\dashboard\app\shared\coaTemplate.ts:105:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:119:    key: "current-assets",
apps\dashboard\app\shared\coaTemplate.ts:120:    title: "Current assets",
apps\dashboard\app\shared\coaTemplate.ts:121:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:144:    key: "liabilities",
apps\dashboard\app\shared\coaTemplate.ts:145:    title: "Liabilities",
apps\dashboard\app\shared\coaTemplate.ts:146:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:191:    key: "income",
apps\dashboard\app\shared\coaTemplate.ts:192:    title: "Income",
apps\dashboard\app\shared\coaTemplate.ts:193:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:210:    key: "cost-of-sales",
apps\dashboard\app\shared\coaTemplate.ts:211:    title: "Cost of sales",
apps\dashboard\app\shared\coaTemplate.ts:212:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:223:    key: "finance-tax",
apps\dashboard\app\shared\coaTemplate.ts:224:    title: "Finance costs and tax",
apps\dashboard\app\shared\coaTemplate.ts:225:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:234:    key: "operating-expenses",
apps\dashboard\app\shared\coaTemplate.ts:235:    title: "Operating expenses",
apps\dashboard\app\shared\coaTemplate.ts:236:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:283:    key: "system",
apps\dashboard\app\shared\coaTemplate.ts:284:    title: "System",
apps\dashboard\app\shared\coaTemplate.ts:285:    tier: "core",
apps\dashboard\app\shared\coaTemplate.ts:290:    key: "inventory",
apps\dashboard\app\shared\coaTemplate.ts:291:    title: "Inventories (optional)",
apps\dashboard\app\shared\coaTemplate.ts:292:    tier: "optional",
apps\dashboard\app\shared\coaTemplate.ts:304:    key: "investments",
apps\dashboard\app\shared\coaTemplate.ts:305:    title: "Investments and deferred tax (optional)",
apps\dashboard\app\shared\coaTemplate.ts:306:    tier: "optional",



2026-07-24T09:58:55.690496Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'apps/dashboard/app/shared/coaTemplate.ts'; Get-Content "'$p | Select-Object -Skip 145 -First 47' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 675ms:
    tier: "core",
    blurb:
      "Every statutory payroll deduction is its own payable â€” EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable.",
    accounts: [
      { code: "400-000", name: "Trade payables â€” control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
      { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables" },
      { code: "410-002", name: "Salaries and wages payable", type: "liability", mpers: "Trade and other payables" },
      { code: "410-003", name: "EPF payable", type: "liability", mpers: "Trade and other payables", note: "Employees Provident Fund Act 1991." },
      { code: "410-004", name: "SOCSO payable", type: "liability", mpers: "Trade and other payables", note: "Employees' Social Security Act 1969 (Act 4)." },
      {
        code: "410-005",
        name: "SKBBK payable (LINDUNG 24 JAM)",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Non-Employment Injury Security Scheme â€” a distinct employee-borne PERKESO component with its own column in the official contribution table.",
      },
      { code: "410-006", name: "EIS payable", type: "liability", mpers: "Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) â€” separate from Act 4." },
      { code: "410-007", name: "PCB / MTD payable", type: "liability", mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form CP39)." },
      { code: "410-008", name: "HRD Corp levy payable", type: "liability", mpers: "Trade and other payables", note: "PSMB Act 2001 â€” applies only to employers within scope or registered voluntarily." },
      { code: "420-D01", name: "Amount owing to director", type: "liability", mpers: "Trade and other payables â€” related party" },
      { code: "420-R01", name: "Amount owing to related company", type: "liability", mpers: "Trade and other payables â€” related party" },
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker â€” see the SST limitation note below.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Sales tax is a single-stage tax on manufacturers/importers, accounted on an ACCRUAL basis â€” a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
      },
      { code: "430-WHT", name: "Withholding tax payable", type: "liability", mpers: "Trade and other payables", note: "Payments to non-residents â€” ITA s.107A contract payments, s.4A technical/management fees." },
      { code: "440-001", name: "Current tax payable (provision for taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision â€” it belongs in current tax liabilities." },
      { code: "460-L01", name: "Borrowings â€” current", type: "liability", mpers: "Financial liabilities â€” current" },
      { code: "461-L01", name: "Borrowings â€” non-current", type: "liability", mpers: "Financial liabilities â€” non-current" },
      { code: "490-D01", name: "Customer deposits", type: "liability", mpers: "Trade and other payables" },
      { code: "490-R01", name: "Deferred income / contract liabilities", type: "liability", mpers: "Other liabilities" },
    ],
  },
  {
    key: "income",
    title: "Income",

web search: 
web search: site:hasil.gov.my/media/forms/upload/guidebook_c2025_2.pdf "tax filing fee" ...
2026-07-24T10:00:38.220322Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Public Ruling No. 4/2015" entertainment employees fully allowable PDF ...
2026-07-24T10:00:45.527313Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 88 column 5
web search: 
web search: site:hasil.gov.my "Section 6D rebate" 2026 company Malaysia extension ...
warning: Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.
context compacted
codex
The official-source cross-check is complete. Two points materially change the answer: ordinary formation costs are expensed under MPERS but their tax relief is not safely generalisable to a 2025 incorporation; and SST is usually a cost, but the template’s absolute “no input credit” rule ignores the limited sales-tax deduction facility for qualifying manufacturers.
Completed the read-only account map and official-source verification; preparing the consolidated adversarial findings.
  ✓ Read repository instructions, COA template, and source-research memo
  ✓ Map all existing accounts and identify structural/accounting gaps
  ✓ Verify MPERS, Companies Act, LHDN, SSM/MBRS, payroll, SST, and practice claims against official sources
  ✓ Deliver additions, changes/splits, removals, and assertions requiring further official verification
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n '900-A|900-D0|900-SST|900-FIN|900-E0|900-O0|500-000|530-000|360-T01|440-001|490-D01|610-100|610-S01|900-B03|900-DON|900-M02|900-T02|900-L01|900-I01|900-S03|200-R01|810-T02|230-001|231-001' apps/dashboard/app/shared/coaTemplate.ts" in C:\Users\zhant\Desktop\clara-rebuild
2026-07-24T10:05:35.949674Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 2.3 seconds
Output:
rg : The term 'rg' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the 
spelling of the name, or if a path was included, verify that the path is correct and try again.
At line:2 char:1
+ rg -n '900-A|900-D0|900-SST|900-FIN|900-E0|900-O0|500-000|530-000|360 ...
+ ~~
    + CategoryInfo          : ObjectNotFound: (rg:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
 

 exited 1 in 2325ms:
rg : The term 'rg' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the 
spelling of the name, or if a path was included, verify that the path is correct and try again.
At line:2 char:1
+ rg -n '900-A|900-D0|900-SST|900-FIN|900-E0|900-O0|500-000|530-000|360 ...
+ ~~
    + CategoryInfo          : ObjectNotFound: (rg:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Select-String -Path 'apps/dashboard/app/shared/coaTemplate.ts' -Pattern '900-A|900-D0|900-SST|900-FIN|900-E0|900-O0|500-000|530-000|360-T01|440-001|490-D01|610-100|610-S01|900-B03|900-DON|900-M02|900-T02|900-L01|900-I01|900-S03|200-R01|810-T02|230-001|231-001'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 1198ms:

apps\dashboard\app\shared\coaTemplate.ts:64: * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 
COGS, 900-xxx
apps\dashboard\app\shared\coaTemplate.ts:111:      { code: "200-R01", name: "Renovation — cost", type: "asset", mpers: 
"Property, plant and equipment" },
apps\dashboard\app\shared\coaTemplate.ts:140:      { code: "360-T01", name: "Tax instalments paid / current tax 
receivable", type: "asset", mpers: "Current tax assets" },
apps\dashboard\app\shared\coaTemplate.ts:183:      { code: "440-001", name: "Current tax payable (provision for 
taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision — it belongs 
in current tax liabilities." },
apps\dashboard\app\shared\coaTemplate.ts:186:      { code: "490-D01", name: "Customer deposits", type: "liability", 
mpers: "Trade and other payables" },
apps\dashboard\app\shared\coaTemplate.ts:196:      { code: "500-000", name: "Revenue", type: "income", mpers: 
"Revenue" },
apps\dashboard\app\shared\coaTemplate.ts:201:      { code: "530-000", name: "Other income", type: "income", mpers: 
"Other income" },
apps\dashboard\app\shared\coaTemplate.ts:215:      { code: "610-100", name: "Cost of goods sold / purchases", type: 
"expense", mpers: "Cost of sales" },
apps\dashboard\app\shared\coaTemplate.ts:216:      { code: "610-S01", name: "Subcontractor and direct service costs", 
type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." 
},
apps\dashboard\app\shared\coaTemplate.ts:230:      { code: "810-T02", name: "Deferred tax expense / (income)", type: 
"expense", mpers: "Tax expense" },
apps\dashboard\app\shared\coaTemplate.ts:240:      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: 
"Administrative expenses" },
apps\dashboard\app\shared\coaTemplate.ts:241:      { code: "900-A02", name: "Audit fee", type: "expense", mpers: 
"Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." 
},
apps\dashboard\app\shared\coaTemplate.ts:242:      { code: "900-A03", name: "Advertising and marketing", type: 
"expense", mpers: "Selling and distribution expenses" },
apps\dashboard\app\shared\coaTemplate.ts:245:      { code: "900-B03", name: "Impairment loss — trade receivables", 
type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation 
distinction." },
apps\dashboard\app\shared\coaTemplate.ts:247:      { code: "900-D01", name: "Directors' fees", type: "expense", mpers: 
"Administrative expenses", note: "Fees require member approval (Companies Act 2016 s.230) and do not attract EPF — 
keep apart from salary. CA 2016 s.249(4) disclosure." },
apps\dashboard\app\shared\coaTemplate.ts:248:      { code: "900-D04", name: "Directors' salaries and benefits", type: 
"expense", mpers: "Employee benefits", note: "Employment income: EPF/SOCSO/PCB apply, unlike fees. CA 2016 s.249(4) 
disclosure." },
apps\dashboard\app\shared\coaTemplate.ts:263:      { code: "900-D02", name: "Depreciation", type: "expense", mpers: 
"Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
apps\dashboard\app\shared\coaTemplate.ts:264:      { code: "900-DON", name: "Donations", type: "expense", mpers: 
"Other operating expenses", note: "Deductibility depends on approved-institution status." },
apps\dashboard\app\shared\coaTemplate.ts:265:      { code: "900-E01", name: "EPF — employer contribution", type: 
"expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of 
remuneration, so this must be separately measurable." },
apps\dashboard\app\shared\coaTemplate.ts:266:      { code: "900-E02", name: "SOCSO and EIS — employer contribution", 
type: "expense", mpers: "Employee benefits" },
apps\dashboard\app\shared\coaTemplate.ts:268:        code: "900-E03",
apps\dashboard\app\shared\coaTemplate.ts:275:        code: "900-E04",
apps\dashboard\app\shared\coaTemplate.ts:282:        code: "900-E05",
apps\dashboard\app\shared\coaTemplate.ts:289:        code: "900-E06",
apps\dashboard\app\shared\coaTemplate.ts:297:      { code: "900-FIN", name: "Fines and penalties", type: "expense", 
mpers: "Other operating expenses", note: "Non-deductible." },
apps\dashboard\app\shared\coaTemplate.ts:299:      { code: "900-I01", name: "Insurance", type: "expense", mpers: 
"Administrative expenses" },
apps\dashboard\app\shared\coaTemplate.ts:300:      { code: "900-L01", name: "Legal and professional fees", type: 
"expense", mpers: "Administrative expenses" },
apps\dashboard\app\shared\coaTemplate.ts:302:      { code: "900-M02", name: "Management fees", type: "expense", mpers: 
"Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be 
separately disclosed." },
apps\dashboard\app\shared\coaTemplate.ts:303:      { code: "900-O01", name: "Rental of premises", type: "expense", 
mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 — check the 
supplier's registration status." },
apps\dashboard\app\shared\coaTemplate.ts:307:      { code: "900-S03", name: "Software and subscriptions", type: 
"expense", mpers: "Administrative expenses" },
apps\dashboard\app\shared\coaTemplate.ts:310:        code: "900-SST",
apps\dashboard\app\shared\coaTemplate.ts:318:      { code: "900-T02", name: "Travel and accommodation", type: 
"expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep 
local and overseas distinguishable." },
apps\dashboard\app\shared\coaTemplate.ts:365:      { code: "230-001", name: "Investment property — cost", type: 
"asset", mpers: "Investment property" },
apps\dashboard\app\shared\coaTemplate.ts:366:      { code: "231-001", name: "Accumulated depreciation — investment 
property", type: "asset", mpers: "Investment property" },



exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$coaPath = '"'apps/dashboard/app/shared/coaTemplate.ts'; "'$content = Get-Content -LiteralPath $coaPath; "lines=$($content.Count)"; "codes=$((Select-String -LiteralPath $coaPath -Pattern '"'code: \"').Count)\"; Select-String -LiteralPath "'$coaPath -Pattern '"'"'^  '"\\{|"'^    label:|''^    optional:'"'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 936ms:
lines=397
codes=117

apps\dashboard\app\shared\coaTemplate.ts:76:  {
apps\dashboard\app\shared\coaTemplate.ts:102:  {
apps\dashboard\app\shared\coaTemplate.ts:118:  {
apps\dashboard\app\shared\coaTemplate.ts:143:  {
apps\dashboard\app\shared\coaTemplate.ts:190:  {
apps\dashboard\app\shared\coaTemplate.ts:209:  {
apps\dashboard\app\shared\coaTemplate.ts:222:  {
apps\dashboard\app\shared\coaTemplate.ts:233:  {
apps\dashboard\app\shared\coaTemplate.ts:323:  {
apps\dashboard\app\shared\coaTemplate.ts:330:  {
apps\dashboard\app\shared\coaTemplate.ts:345:  {
apps\dashboard\app\shared\coaTemplate.ts:359:  {



exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short -- apps/dashboard/app/shared/coaTemplate.ts docs/plan/research/wave-b/malaysian-coa-official-research.md; git diff -- apps/dashboard/app/shared/coaTemplate.ts' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 941ms:
?? apps/dashboard/app/shared/coaTemplate.ts
?? docs/plan/research/wave-b/malaysian-coa-official-research.md
warning: unable to access 'C:\Users\zhant/.config/git/ignore': Permission denied
warning: unable to access 'C:\Users\zhant/.config/git/ignore': Permission denied

codex
The target file changed while I was reviewing it: it now contains 117 account entries rather than the 106 in the request, and it already includes a directors’ fees/salary split plus several new expense codes. I’m reconciling the answer to the current 117-account version so I don’t report already-fixed gaps; I’ll call out the version drift explicitly.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'apps/dashboard/app/shared/coaTemplate.ts'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 911ms:
// The default Chart of Accounts template for a Malaysian private company (Sdn Bhd).
//
// PROVENANCE â€” read docs/plan/research/wave-b/malaysian-coa-official-research.md before
// changing anything here. Two independent lanes fed this file: web research against
// MASB/MPERS, SSM/MBRS and LHDN/RMCD official sources, and a cross-model (gpt-5.6-sol)
// domain review. Both reached the same conclusion:
//
//   MALAYSIA HAS NO STATUTORY CHART OF ACCOUNTS. The phrase "chart of accounts" appears
//   ZERO times in MPERS and ZERO times in the Companies Act 2016 (both extracted in full
//   and grep-verified). MPERS 4.9 is explicit: "This Standard does not prescribe the
//   sequence or format in which items are to be presented", and 4.9(b) permits renaming
//   and resequencing. CA 2016 s.245 is outcome-based â€” records must "sufficiently explain
//   the transactions and financial position of the company".
//
// So this template is NOT an official list. It is a defensible default whose only binding
// constraint is MAPPABILITY: every account rolls up cleanly to (a) the MPERS 4.2 / 5.5
// face line items, (b) the SSM MBRS (SSMxT) taxonomy actually filed, and (c) the LHDN
// Form C analysis and tax-computation add-backs. It is a starting point a professional
// edits per client â€” not a rule.
//
// DELIBERATELY ABSENT: rates, thresholds, percentages, effective dates. SST rates, tax
// bands, EPF/SOCSO/EIS/HRD rates and MyInvois deadlines are effective-dated compliance
// facts that change (service tax moved 6%->8% on 1 Mar 2024; scope expanded 1 Jul 2025;
// Service Tax Policies 1-4/2026 are live). They must never be encoded in an account name
// or in this file. MyInvois classification codes are transaction metadata, not accounts.
//
// FRAMEWORK NOTE: MPERS (2016) is the standard in force as at July 2026. MPERS (2025) â€”
// Malaysia's adoption of IFRS for SMEs 3rd edition â€” was gazetted 10 October 2025 and
// applies to annual periods beginning on or after 1 January 2027 (early adoption
// permitted). Sections 4 and 5 are substantively unchanged between them, so this template
// is unaffected by that transition.

export type CoaTemplateAccount = {
  code: string;
  name: string;
  /** matches clara.coa_accounts.account_type */
  type: "asset" | "liability" | "equity" | "income" | "expense";
  /** control-account marker; only 'payable' | 'receivable' are permitted by the DB */
  accountClass?: "payable" | "receivable";
  /** DB CHECK: opening_balance_equity/retained_earnings require equity; sst_purchase_cost requires expense */
  special?:
    | "rounding"
    | "sst_output"
    | "sst_purchase_cost"
    | "opening_balance_equity"
    | "retained_earnings";
  /** which MPERS 4.2 / 5.5 face line item this rolls into â€” the mapping that makes the chart defensible */
  mpers: string;
  /** why this account exists as a separate line (tax analysis, statutory disclosure, MPERS split) */
  note?: string;
};

export type CoaTemplateBlock = {
  key: string;
  title: string;
  /** core = every Sdn Bhd needs it; optional = offer, do not seed by default */
  tier: "core" | "optional";
  blurb: string;
  accounts: CoaTemplateAccount[];
};

/**
 * Code scheme (extends the convention already in use by the firm: 100-000 share capital,
 * 150-000 retained earnings, 310-B01 banks, 500-000 revenue, 610-100 COGS, 900-xxx
 * mnemonic operating expenses, 999-R00 rounding). Numeric order identifies the block; it
 * does not dictate statement order â€” the MPERS mapping does that.
 *
 *   100-199 equity        200-299 non-current assets   300-399 current assets
 *   400-499 liabilities   500-599 income               600-699 cost of sales
 *   800-899 finance + tax expense                      900-989 operating expenses
 *   990-999 system
 *
 * DB constraint: account_code must match ^[0-9]{4,8}$ or ^[0-9]{3}-[0-9A-Z]{2,4}$.
 */
export const COA_TEMPLATE: CoaTemplateBlock[] = [
  {
    key: "equity",
    title: "Equity",
    tier: "core",
    blurb:
      "No share-premium account: Companies Act 2016 s.74 abolished par value for shares (s.618 handled the transition of pre-existing premium balances).",
    accounts: [
      { code: "100-000", name: "Share capital", type: "equity", mpers: "Equity â€” share capital" },
      { code: "120-000", name: "Other reserves", type: "equity", mpers: "Equity â€” other reserves" },
      {
        code: "150-000",
        name: "Retained earnings",
        type: "equity",
        special: "retained_earnings",
        mpers: "Equity â€” retained earnings",
      },
      {
        code: "190-OBE",
        name: "Opening balance equity (system clearing)",
        type: "equity",
        special: "opening_balance_equity",
        mpers: "Equity â€” temporary conversion account",
        note: "A conversion account, not permanent equity. Must net to nil and be cleared before statutory statements are finalised.",
      },
    ],
  },
  {
    key: "ppe",
    title: "Property, plant and equipment",
    tier: "core",
    blurb: "Cost and accumulated depreciation held separately, as MPERS Section 17 disclosure requires.",
    accounts: [
      { code: "200-M01", name: "Motor vehicles â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-F01", name: "Furniture and fittings â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-C01", name: "Computer equipment â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "200-R01", name: "Renovation â€” cost", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-M01", name: "Accumulated depreciation â€” motor vehicles", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-F01", name: "Accumulated depreciation â€” furniture and fittings", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-C01", name: "Accumulated depreciation â€” computer equipment", type: "asset", mpers: "Property, plant and equipment" },
      { code: "210-R01", name: "Accumulated depreciation â€” renovation", type: "asset", mpers: "Property, plant and equipment" },
    ],
  },
  {
    key: "current-assets",
    title: "Current assets",
    tier: "core",
    blurb:
      "Trade receivables carries the receivable control marker. Director and related-party balances are separate, directional and never netted â€” MPERS Section 33 related-party disclosure, and CA 2016 s.249(4) allows the Registrar to require loans-to-directors disclosure.",
    accounts: [
      {
        code: "300-000",
        name: "Trade receivables â€” control",
        type: "asset",
        accountClass: "receivable",
        mpers: "Trade and other receivables",
      },
      { code: "300-900", name: "Allowance for impairment â€” trade receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "310-B01", name: "Bank â€” main operating account", type: "asset", mpers: "Cash and cash equivalents", note: "One code per real bank account: 310-B02, 310-B03 â€¦" },
      { code: "320-C01", name: "Cash on hand / petty cash", type: "asset", mpers: "Cash and cash equivalents" },
      { code: "340-P01", name: "Prepayments", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-D01", name: "Deposits paid", type: "asset", mpers: "Trade and other receivables" },
      { code: "340-O01", name: "Other receivables", type: "asset", mpers: "Trade and other receivables" },
      { code: "350-D01", name: "Amount owing from director", type: "asset", mpers: "Trade and other receivables â€” related party", note: "Directional. Never net against 420-D01 without a legally enforceable right of set-off." },
      { code: "350-R01", name: "Amount owing from related company", type: "asset", mpers: "Trade and other receivables â€” related party" },
      { code: "360-T01", name: "Tax instalments paid / current tax receivable", type: "asset", mpers: "Current tax assets" },
    ],
  },
  {
    key: "liabilities",
    title: "Liabilities",
    tier: "core",
    blurb:
      "Every statutory payroll deduction is its own payable â€” EPF, SOCSO, SKBBK, EIS, PCB and HRD Corp are separately legislated, separately computed and separately remitted, so they must be independently reconcilable.",
    accounts: [
      { code: "400-000", name: "Trade payables â€” control", type: "liability", accountClass: "payable", mpers: "Trade and other payables" },
      { code: "410-001", name: "Accrued expenses", type: "liability", mpers: "Trade and other payables" },
      { code: "410-002", name: "Salaries and wages payable", type: "liability", mpers: "Trade and other payables" },
      { code: "410-003", name: "EPF payable", type: "liability", mpers: "Trade and other payables", note: "Employees Provident Fund Act 1991." },
      { code: "410-004", name: "SOCSO payable", type: "liability", mpers: "Trade and other payables", note: "Employees' Social Security Act 1969 (Act 4)." },
      {
        code: "410-005",
        name: "SKBBK payable (LINDUNG 24 JAM)",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Non-Employment Injury Security Scheme â€” a distinct employee-borne PERKESO component with its own column in the official contribution table.",
      },
      { code: "410-006", name: "EIS payable", type: "liability", mpers: "Trade and other payables", note: "Employment Insurance System Act 2017 (Act 800) â€” separate from Act 4." },
      { code: "410-007", name: "PCB / MTD payable", type: "liability", mpers: "Trade and other payables", note: "Employee-borne income tax withheld and remitted by the employer (Form CP39)." },
      { code: "410-008", name: "HRD Corp levy payable", type: "liability", mpers: "Trade and other payables", note: "PSMB Act 2001 â€” applies only to employers within scope or registered voluntarily." },
      { code: "420-D01", name: "Amount owing to director", type: "liability", mpers: "Trade and other payables â€” related party" },
      { code: "420-R01", name: "Amount owing to related company", type: "liability", mpers: "Trade and other payables â€” related party" },
      {
        code: "430-SVT",
        name: "Service tax output payable",
        type: "liability",
        special: "sst_output",
        mpers: "Trade and other payables",
        note: "Service tax is accounted on a PAYMENT basis. Carries the sst_output automation marker â€” see the SST limitation note below.",
      },
      {
        code: "430-SLT",
        name: "Sales tax output payable",
        type: "liability",
        mpers: "Trade and other payables",
        note: "Sales tax is a single-stage tax on manufacturers/importers, accounted on an ACCRUAL basis â€” a different regime from service tax. Seeded without the marker because the schema permits only one sst_output account per client.",
      },
      { code: "430-WHT", name: "Withholding tax payable", type: "liability", mpers: "Trade and other payables", note: "Payments to non-residents â€” ITA s.107A contract payments, s.4A technical/management fees." },
      { code: "440-001", name: "Current tax payable (provision for taxation)", type: "liability", mpers: "Current tax liabilities", note: "NOT an MPERS Section 21 provision â€” it belongs in current tax liabilities." },
      { code: "460-L01", name: "Borrowings â€” current", type: "liability", mpers: "Financial liabilities â€” current" },
      { code: "461-L01", name: "Borrowings â€” non-current", type: "liability", mpers: "Financial liabilities â€” non-current" },
      { code: "490-D01", name: "Customer deposits", type: "liability", mpers: "Trade and other payables" },
      { code: "490-R01", name: "Deferred income / contract liabilities", type: "liability", mpers: "Other liabilities" },
    ],
  },
  {
    key: "income",
    title: "Income",
    tier: "core",
    blurb: "Revenue split by nature; other income kept apart from revenue so the MPERS 5.5 face lines map cleanly.",
    accounts: [
      { code: "500-000", name: "Revenue", type: "income", mpers: "Revenue" },
      { code: "500-S01", name: "Service revenue", type: "income", mpers: "Revenue" },
      { code: "500-G01", name: "Sale of goods", type: "income", mpers: "Revenue" },
      { code: "510-RET", name: "Sales returns and allowances (contra)", type: "income", mpers: "Revenue â€” net" },
      { code: "510-DIS", name: "Sales discounts (contra)", type: "income", mpers: "Revenue â€” net" },
      { code: "530-000", name: "Other income", type: "income", mpers: "Other income" },
      { code: "530-R01", name: "Rental income", type: "income", mpers: "Other income", note: "Present as revenue instead where letting is a principal activity." },
      { code: "530-G01", name: "Gain on disposal of assets", type: "income", mpers: "Other income" },
      { code: "530-FX1", name: "Realised foreign exchange gain", type: "income", mpers: "Other income", note: "Realised and unrealised kept apart â€” unrealised amounts are a tax-computation adjustment." },
      { code: "530-FX2", name: "Unrealised foreign exchange gain", type: "income", mpers: "Other income" },
      { code: "540-I01", name: "Interest income", type: "income", mpers: "Finance income" },
    ],
  },
  {
    key: "cost-of-sales",
    title: "Cost of sales",
    tier: "core",
    blurb: "Form C requires contract and subcontract payments to be separately disclosed.",
    accounts: [
      { code: "610-100", name: "Cost of goods sold / purchases", type: "expense", mpers: "Cost of sales" },
      { code: "610-S01", name: "Subcontractor and direct service costs", type: "expense", mpers: "Cost of sales", note: "Form C requires separate disclosure of contract/subcontract payments." },
      { code: "610-F01", name: "Freight and carriage inward", type: "expense", mpers: "Cost of sales" },
      { code: "610-RET", name: "Purchase returns (contra)", type: "expense", mpers: "Cost of sales" },
      { code: "610-DIS", name: "Purchase discounts (contra)", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "finance-tax",
    title: "Finance costs and tax",
    tier: "core",
    blurb: "MPERS 5.5 requires finance costs and tax expense as separate face lines.",
    accounts: [
      { code: "800-I01", name: "Interest expense â€” borrowings", type: "expense", mpers: "Finance costs" },
      { code: "810-T01", name: "Current income tax expense", type: "expense", mpers: "Tax expense" },
      { code: "810-T02", name: "Deferred tax expense / (income)", type: "expense", mpers: "Tax expense" },
    ],
  },
  {
    key: "operating-expenses",
    title: "Operating expenses",
    tier: "core",
    blurb:
      "Split to serve the LHDN tax computation: entertainment is separated staff vs client, and depreciation, donations, fines and unrealised FX are isolated because each is an add-back or restricted deduction.",
    accounts: [
      { code: "900-A01", name: "Accounting fee", type: "expense", mpers: "Administrative expenses" },
      { code: "900-A02", name: "Audit fee", type: "expense", mpers: "Administrative expenses", note: "CA 2016 s.249(4): the Registrar may require auditors' remuneration to be disclosed." },
      { code: "900-A03", name: "Advertising and marketing", type: "expense", mpers: "Selling and distribution expenses" },
      { code: "900-B01", name: "Bank charges", type: "expense", mpers: "Administrative expenses" },
      { code: "900-B02", name: "Bad debts written off", type: "expense", mpers: "Other operating expenses" },
      { code: "900-B03", name: "Impairment loss â€” trade receivables", type: "expense", mpers: "Other operating expenses", note: "Specific vs general provisioning is a tax-computation distinction." },
      { code: "900-C01", name: "Commission expense", type: "expense", mpers: "Selling and distribution expenses", note: "Form C requires commissions paid to residents to be separately disclosed." },
      { code: "900-D01", name: "Directors' fees", type: "expense", mpers: "Administrative expenses", note: "Fees require member approval (Companies Act 2016 s.230) and do not attract EPF â€” keep apart from salary. CA 2016 s.249(4) disclosure." },
      { code: "900-D04", name: "Directors' salaries and benefits", type: "expense", mpers: "Employee benefits", note: "Employment income: EPF/SOCSO/PCB apply, unlike fees. CA 2016 s.249(4) disclosure." },
      {
        code: "900-I02",
        name: "Incorporation expenses â€” qualifying",
        type: "expense",
        mpers: "Administrative expenses",
        note: "ONLY the six heads in the Income Tax (Deduction For Incorporation Expenses) Rules 2003 [P.U.(A) 475/2003, amended 472/2005]: M&A/prospectus preparation and printing, company registration and statutory documents, preliminary contracts, debenture/share certificate printing, company seal, underwriting commission. Authorised capital must not exceed RM2.5m.",
      },
      {
        code: "900-I03",
        name: "Incorporation expenses â€” non-qualifying",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Everything else in an incorporation bundle â€” secretarial fees, service tax, travelling, sundries. LHDN PR 11/2013 Example 5 is explicit that a single mixed 'preliminary expenses' account CANNOT be adjudicated, so the split is mandatory, not stylistic.",
      },
      { code: "900-D02", name: "Depreciation", type: "expense", mpers: "Administrative expenses", note: "Non-deductible; replaced by capital allowances in the tax computation." },
      { code: "900-DON", name: "Donations", type: "expense", mpers: "Other operating expenses", note: "Deductibility depends on approved-institution status." },
      { code: "900-E01", name: "EPF â€” employer contribution", type: "expense", mpers: "Employee benefits", note: "ITA s.34(4) restricts approved-scheme contributions above 19% of remuneration, so this must be separately measurable." },
      { code: "900-E02", name: "SOCSO and EIS â€” employer contribution", type: "expense", mpers: "Employee benefits" },
      {
        code: "900-E03",
        name: "Entertainment â€” fully deductible (s.39(1)(l) provisos)",
        type: "expense",
        mpers: "Administrative expenses",
        note: "100% deductible: staff entertainment, gifts bearing the business logo, sales-incentive trips, product launches to customers. LHDN PR 4/2015 Table 1.",
      },
      {
        code: "900-E04",
        name: "Entertainment â€” 50% restricted",
        type: "expense",
        mpers: "Administrative expenses",
        note: "ITA s.39(1)(l) disallows 50%: gifts without a logo, festive hampers, and â€” note â€” entertainment to SUPPLIERS, which PR 4/2015 excludes from the 'related wholly to sales' proviso.",
      },
      {
        code: "900-E05",
        name: "Entertainment â€” non-deductible",
        type: "expense",
        mpers: "Administrative expenses",
        note: "Fails s.33(1) entirely per PR 4/2015 Table 1: own AGM, wedding gifts, entertainment to employees of RELATED companies, closed-transaction prospects, cash contributions to a customer's event.",
      },
      {
        code: "900-E06",
        name: "Leave passage",
        type: "expense",
        mpers: "Administrative expenses",
        note: "ITA s.39(1)(m) disallows employee leave passage EXCEPT the s.39(1)(l)(viii) yearly local event with the employee's immediate family. Always a permanent add-back candidate â€” keep it alone.",
      },
      { code: "900-F01", name: "Realised foreign exchange loss", type: "expense", mpers: "Other operating expenses" },
      { code: "900-F02", name: "Unrealised foreign exchange loss", type: "expense", mpers: "Other operating expenses", note: "Tax-computation adjustment." },
      { code: "900-FIN", name: "Fines and penalties", type: "expense", mpers: "Other operating expenses", note: "Non-deductible." },
      { code: "900-H01", name: "HRD Corp levy", type: "expense", mpers: "Employee benefits" },
      { code: "900-I01", name: "Insurance", type: "expense", mpers: "Administrative expenses" },
      { code: "900-L01", name: "Legal and professional fees", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M01", name: "Motor vehicle expenses", type: "expense", mpers: "Administrative expenses" },
      { code: "900-M02", name: "Management fees", type: "expense", mpers: "Administrative expenses", note: "Form C requires management fees to residents, and s.4A fees to non-residents, to be separately disclosed." },
      { code: "900-O01", name: "Rental of premises", type: "expense", mpers: "Administrative expenses", note: "Rental became a taxable service for service tax from 1 July 2025 â€” check the supplier's registration status." },
      { code: "900-P01", name: "Printing, stationery and postage", type: "expense", mpers: "Administrative expenses" },
      { code: "900-R01", name: "Repairs and maintenance", type: "expense", mpers: "Administrative expenses", note: "Repairs vs capital improvement is a tax-computation distinction." },
      { code: "900-S01", name: "Salaries and wages", type: "expense", mpers: "Employee benefits" },
      { code: "900-S03", name: "Software and subscriptions", type: "expense", mpers: "Administrative expenses" },
      { code: "900-S04", name: "Company secretarial fee", type: "expense", mpers: "Administrative expenses" },
      {
        code: "900-SST",
        name: "SST on purchases (expensed)",
        type: "expense",
        special: "sst_purchase_cost",
        mpers: "Administrative expenses",
        note: "Malaysian SST is NOT a credit-offset VAT â€” it is a cost. Only for SST on operating expenses: SST attributable to inventory or PPE forms part of that asset's cost and must NOT be routed here.",
      },
      { code: "900-T01", name: "Telephone and internet", type: "expense", mpers: "Administrative expenses" },
      { code: "900-T02", name: "Travel and accommodation", type: "expense", mpers: "Administrative expenses", note: "Form C requires overseas trips to be separately disclosed. Keep local and overseas distinguishable." },
      { code: "900-T03", name: "Toll and parking", type: "expense", mpers: "Administrative expenses", note: "Do NOT combine with fines â€” the tax treatment differs." },
      { code: "900-U01", name: "Utilities", type: "expense", mpers: "Administrative expenses" },
    ],
  },
  {
    key: "system",
    title: "System",
    tier: "core",
    blurb: "Machine-owned. A recurring or material rounding balance means a coding or calculation defect, not a real expense.",
    accounts: [{ code: "999-R00", name: "Rounding", type: "expense", special: "rounding", mpers: "Other operating expenses" }],
  },
  {
    key: "hire-purchase",
    title: "Hire purchase / finance lease (optional)",
    tier: "optional",
    blurb:
      "Near-universal for Malaysian SME motor vehicles. MPERS retains the finance/operating lease distinction (20.4) â€” it is NOT IFRS 16 â€” and 20.13(a) requires the net carrying amount by class, so HP assets stay separate from owned ones.",
    accounts: [
      { code: "200-H01", name: "Motor vehicles under hire purchase â€” cost", type: "asset", mpers: "Property, plant and equipment", note: "Separate class from owned vehicles: MPERS 20.13(a) requires the net carrying amount for each class held under finance lease." },
      { code: "210-H01", name: "Accumulated depreciation â€” motor vehicles under hire purchase", type: "asset", mpers: "Property, plant and equipment", note: "MPERS 20.12 may impose a different useful life â€” the shorter of the lease term and the asset's useful life." },
      { code: "470-H01", name: "Hire purchase liability â€” current", type: "liability", mpers: "Financial liabilities â€” current", note: "The current/non-current split comes from MPERS 4.4 and 4.7(c), not Section 20." },
      { code: "471-H01", name: "Hire purchase liability â€” non-current", type: "liability", mpers: "Financial liabilities â€” non-current", note: "MPERS 4.8: all other liabilities as non-current." },
      { code: "470-H02", name: "Unexpired hire purchase finance charges (interest in suspense)", type: "liability", mpers: "Financial liabilities â€” contra", note: "Only needed where the contract is booked at gross instalment value; contra to the HP liability so it is measured per MPERS 20.9." },
      { code: "800-H01", name: "Hire purchase finance charges", type: "expense", mpers: "Finance costs", note: "MPERS 20.11 requires minimum lease payments to be apportioned between the finance charge and the reduction of the liability." },
    ],
  },
  {
    key: "inventory",
    title: "Inventories (optional)",
    tier: "optional",
    blurb: "Seed only for entities that hold stock.",
    accounts: [
      { code: "330-T01", name: "Trading inventory", type: "asset", mpers: "Inventories" },
      { code: "330-R01", name: "Raw materials", type: "asset", mpers: "Inventories" },
      { code: "330-W01", name: "Work in progress", type: "asset", mpers: "Inventories" },
      { code: "330-F01", name: "Finished goods", type: "asset", mpers: "Inventories" },
      { code: "330-900", name: "Allowance for inventory obsolescence", type: "asset", mpers: "Inventories" },
      { code: "620-ADJ", name: "Inventory movement and stock adjustments", type: "expense", mpers: "Cost of sales" },
    ],
  },
  {
    key: "investments",
    title: "Investments and deferred tax (optional)",
    tier: "optional",
    blurb: "Seed only where the entity holds investments or recognises deferred tax.",
    accounts: [
      { code: "230-001", name: "Investment property â€” cost", type: "asset", mpers: "Investment property" },
      { code: "231-001", name: "Accumulated depreciation â€” investment property", type: "asset", mpers: "Investment property" },
      { code: "240-S01", name: "Investment in subsidiaries", type: "asset", mpers: "Investments in subsidiaries" },
      { code: "240-A01", name: "Investment in associates", type: "asset", mpers: "Investments in associates" },
      { code: "260-DTA", name: "Deferred tax asset", type: "asset", mpers: "Deferred tax assets" },
      { code: "450-DTL", name: "Deferred tax liability", type: "liability", mpers: "Deferred tax liabilities" },
    ],
  },
];

export const CORE_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "core");
export const OPTIONAL_BLOCKS = COA_TEMPLATE.filter((b) => b.tier === "optional");

export function templateAccounts(blockKeys: string[]): CoaTemplateAccount[] {
  return COA_TEMPLATE.filter((b) => blockKeys.includes(b.key)).flatMap((b) => b.accounts);
}

/**
 * KNOWN SCHEMA LIMITATIONS surfaced while building this template â€” recorded, not worked
 * around. Both are Wave-C/D candidates, not blockers:
 *
 * 1. clara.coa_accounts permits only ONE account per client carrying special_acc_type
 *    'sst_output'. Sales tax and service tax are distinct regimes with different scopes,
 *    thresholds, rates and â€” critically â€” different accounting bases (sales tax accrual,
 *    service tax payment). A dual registrant needs two separately tagged control accounts,
 *    or every journal leg must carry an effective-dated sales/service treatment dimension.
 *    This template puts the marker on service tax (much the commoner case for SME service
 *    providers) and seeds sales tax as a plain liability.
 *
 * 2. special_acc_type 'sst_purchase_cost' is constrained to account_type='expense'. That
 *    is correct for the operating-expense automation path, but SST attributable to
 *    inventory or PPE should be capitalised into the asset's cost and cannot be.
 */

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$researchPath = '"'docs/plan/research/wave-b/malaysian-coa-official-research.md'; "'$r = Get-Content -LiteralPath $researchPath; "lines=$($r.Count)"; Select-String -LiteralPath $researchPath -Pattern '"'"'^#|''^##|''^###'"'" in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 962ms:
lines=609

docs\plan\research\wave-b\malaysian-coa-official-research.md:1:# Malaysian CoA — official-source research (2026-07-24)
docs\plan\research\wave-b\malaysian-coa-official-research.md:7:## MASB / MPERS
docs\plan\research\wave-b\malaysian-coa-official-research.md:9:### Authority
docs\plan\research\wave-b\malaysian-coa-official-research.md:19:### Verified facts
docs\plan\research\wave-b\malaysian-coa-official-research.md:51:### Line items / taxonomy / categories
docs\plan\research\wave-b\malaysian-coa-official-research.md:134:### UNVERIFIED — do not encode
docs\plan\research\wave-b\malaysian-coa-official-research.md:146:### Sources
docs\plan\research\wave-b\malaysian-coa-official-research.md:163:## SSM / MBRS (XBRL filing)
docs\plan\research\wave-b\malaysian-coa-official-research.md:165:### Authority
docs\plan\research\wave-b\malaysian-coa-official-research.md:187:### Verified facts
docs\plan\research\wave-b\malaysian-coa-official-research.md:224:### Line items / taxonomy / categories
docs\plan\research\wave-b\malaysian-coa-official-research.md:342:### UNVERIFIED — do not encode
docs\plan\research\wave-b\malaysian-coa-official-research.md:357:### Sources
docs\plan\research\wave-b\malaysian-coa-official-research.md:375:## LHDN / RMCD (tax, SST, e-invoice)
docs\plan\research\wave-b\malaysian-coa-official-research.md:377:### Authority
docs\plan\research\wave-b\malaysian-coa-official-research.md:391:### Verified facts
docs\plan\research\wave-b\malaysian-coa-official-research.md:435:### Line items / taxonomy / categories
docs\plan\research\wave-b\malaysian-coa-official-research.md:567:### UNVERIFIED — do not encode
docs\plan\research\wave-b\malaysian-coa-official-research.md:584:### Sources



exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'apps/dashboard/app/shared/coaTemplate.ts'; "'$codes = Select-String -LiteralPath $p -Pattern '"'code: \"(["'^"]+)"'"' | ForEach-Object { "'$_.Matches[0].Groups[1].Value }; "count=$($codes.Count) unique=$(@($codes | Sort-Object -Unique).Count)"; $codes | Group-Object | Where-Object Count -gt 1 | Select-Object Name,Count' in C:\Users\zhant\Desktop\clara-rebuild
 succeeded in 1064ms:
count=117 unique=117

codex
## Verdict

The template is a strong foundation, but the current version is not yet safe as a universal “professionally defensible” default. Its principal weaknesses are:

- incomplete current/non-current and provision/employee-benefit coverage;
- tax conclusions embedded too aggressively in account names and notes;
- conditional regimes being labelled “core”;
- several accounts that combine amounts Form C or tax computations need separately;
- inconsistent treatment of deferred tax, SST and investment property.

There was also version drift during the review. At final read, [coaTemplate.ts](/C:/Users/zhant/Desktop/clara-rebuild/apps/dashboard/app/shared/coaTemplate.ts:75) contains **117 unique accounts in 12 blocks: 9 core and 3 optional**, not the requested 106/10/8+2. Formation costs, a directors’ split and a hire-purchase block have already been added. I reviewed this current 117-account version. The [official-source research memo](/C:/Users/zhant/Desktop/clara-rebuild/docs/plan/research/wave-b/malaysian-coa-official-research.md:375) remains a sound starting point.

## A. Accounts to add

Proposed codes follow the existing ranges; bundled rows are activity-specific modules.

| Code | Account | Type | Block/tier | Why |
|---|---|---:|---|---|
| `900-PRE` | Pre-opening / pre-operating expenses — tax review | Expense | Operating expenses; start-up optional | MPERS expenses start-up, establishment, pre-opening and training expenditure unless it forms part of another recognised asset. Precommencement tax deduction is not automatic because the expenditure may precede production of gross income. Keep separate from legal incorporation costs. [IFRS for SMEs Module 18](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-18.pdf); [LHDN company FAQ](https://www.hasil.gov.my/en/company/frequently-asked-question-company/?bt_warnabg=4). |
| `900-A04` | Tax return preparation / tax-agent filing fee | Expense | Operating expenses; compliance | Accounting and audit are already separate. Tax-return filing should also be separate because the specific deduction rules do not cover every kind of tax advice. [LHDN tax appendices](https://phl.hasil.gov.my/pdf/pdfam/Appendices_2021_2_B_BT_M_MT.pdf). |
| `900-A05` | Tax advisory, investigation and appeal fees — tax review | Expense | Operating expenses | Distinguishes ordinary filing from advice, restructuring, objections, investigations and appeals, whose deductibility depends on purpose and capital/revenue character. |
| `900-S02` | Staff welfare — non-entertainment | Expense | Employee module; optional | Prevents meals, gifts and events governed by entertainment rules from contaminating ordinary employee welfare. Existing entertainment accounts are not a substitute. [LHDN PR 4/2015](https://phl.hasil.gov.my/pdf/pdfam/PR_4_2015.pdf). |
| `900-M03` | Employee medical and dental benefits | Expense | Employee module; optional | Useful for payroll/benefit reporting and tax evidence. It should not carry an automatic deductible/non-deductible conclusion. |
| `900-T04` | Employee training and development | Expense | Employee module; optional | Separates ordinary training, approved programmes and HRD-claimable costs. Accounting treatment is expense; enhanced tax claims require a separate rules engine or schedule. |
| `530-HRD` | HRD Corp grants/reimbursements | Income | Employee module; optional | Keeps training reimbursements out of revenue and allows matching/reconciliation to claims. [HRD Corp employer guidance](https://hrdcorp.gov.my/employers). |
| `810-Z01` | Business zakat contribution | Expense | Finance/tax; optional | A company’s business zakat is dealt with as a deduction from aggregate income—not an individual-style rebate against tax payable. It also appears distinctly in the MBRS taxonomy. [Form C 2025](https://www.hasil.gov.my/media/1offthzg/samplerf_c2025_2.pdf); [SSM taxonomy](https://www.ssm.com.my/Pages/Services/Other-Services/mbrs%20pdf/MBRS%20SSM%20Taxonomy%20SSMxT_v1.0%2005Sept2018.pdf). |
| `440-ZKT` | Business zakat payable | Liability | Liabilities; zakat optional | Required where zakat expense has been accrued but not paid. Do not net it into current income tax. |
| `250-DEP` | Refundable deposits — non-current | Asset | Non-current assets | `340-D01 Deposits paid` forces every rental, utility and security deposit into current assets. Classification must follow expected recovery. [SSM MBRS FAQ](https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/FAQ_MBRS_ISSB.pdf). |
| `250-DIR`, `250-REL` | Non-current amount owing from director / related company | Asset | Non-current assets | Existing related-party receivables are all current. MPERS requires current/non-current presentation and separate related-party analysis; maturity cannot be inferred from the counterparty name. |
| `472-DIR`, `472-REL` | Non-current amount owing to director / related company | Liability | Non-current liabilities | Same issue on the liability side. Never net solely because the same director or group entity is involved. |
| `451-EB1`, `452-EB1` | Employee-benefit obligations — current / non-current | Liability | Liabilities; employee module | Payroll remittance payables do not cover annual leave, bonuses, gratuities or other employee-benefit obligations. |
| `453-PR1`, `454-PR1` | Other provisions — current / non-current | Liability | Liabilities | Accrued invoices and MPERS Section 21 provisions are different. Recognise only a present obligation with probable outflow and a reliable estimate—never a general reserve. [IFRS for SMEs Module 21](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2026-modules/module-21.pdf). |
| `310-FD1` | Short-term fixed deposits / placements | Asset | Current assets; treasury optional | Separates cash equivalents from placements that fail the cash-equivalent criteria. |
| `250-PDG` | Pledged or restricted deposits — non-current | Asset | Non-current assets; treasury optional | A pledged deposit should not automatically be presented as freely available cash. |
| `460-OD1` | Bank overdraft | Liability | Liabilities; financing optional | Separate from term borrowings. It enters cash equivalents for cash-flow presentation only when repayable on demand and integral to cash management. [IFRS for SMEs Module 7](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-07.pdf). |
| `410-CC1` | Corporate credit-card payable | Liability | Liabilities; treasury optional | Common independent reconciliation/control balance; should not disappear inside trade payables. |
| `340-UNB` | Unbilled receivables / accrued income | Asset | Current assets | Needed for earned consideration not yet invoiced. For Section 23 contracts, distinguish this from a contract asset arising from performance conditions. |
| `360-WHT` | Withholding tax receivable / tax credits | Asset | Current assets; tax | Prevents foreign or domestic tax credits from being mixed with CP204 instalments and current tax overpayments. |
| `160-DIV` | Dividends declared / distribution clearing | Equity | Equity | Dividends are distributions, never P&L expenses. A separate clearing account improves the retained-earnings roll-forward. |
| `410-DIV` | Dividends payable | Liability | Liabilities | Recognise when validly authorised and no longer at the company’s discretion. Companies Act ss.131–132 require profits, solvency and directors’ authorisation. [Companies Act 2016](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf). |
| `370-CON`, `370-RET`, `492-RET` | Contract asset; retention receivable; retention payable | Asset / asset / liability | Construction module; optional | Construction entities need gross due-from/due-to and retention balances, without contract-level offsetting. Tax recognition of retention sums has its own rules. [LHDN PR 5/2025](https://www.hasil.gov.my/media/2ddparpd/public-ruling-no-5_2025-construction-contracts.pdf); [IFRS for SMEs Module 23](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-23.pdf). |
| `900-FWL`, `410-FWL`, `340-FWB`/`250-FWB` | Foreign-worker levy/pass costs; payable; refundable bond/deposit | Expense / liability / asset | Foreign-worker module; optional | The levy is an expense when incurred; a refundable security bond is an asset, not an expense. Current/non-current depends on expected recovery. [Immigration Department guidance](https://www.imi.gov.my/index.php/en/main-services/pass/visitor-pass/visitors-pass-temporary-employment/). |
| `900-STP` | Stamp duty and registration costs — revenue items | Expense | Operating expenses; tax review | Provides an analysis line, but stamp duty on PPE, leases, financing, share issues or acquisitions must follow the underlying transaction rather than being dumped here. [LHDN stamp duty](https://www.hasil.gov.my/en/stamp-duty); [LHDN PR 6/2006](https://phl.hasil.gov.my/pdf/pdfam/PR6_2006.pdf). |
| `530-DIV`, `530-ROY`, `530-GRT` | Dividend income; royalty/licence income; government grants/subsidies | Income | Income; relevant modules | Form C analyses these income streams separately. Source/residence should preferably be transaction metadata or tax-schedule dimensions. [Form C 2025](https://www.hasil.gov.my/media/1offthzg/samplerf_c2025_2.pdf). |
| `900-RYL`, `900-RND`, `900-DSP`, `900-MVR`, `900-EQR` | Royalties/licence fees; R&D; loss on disposal; motor-vehicle rental; equipment rental | Expense | Operating expenses | These have materially different Form C, withholding-tax or tax-computation treatments. A single professional/rental/motor account is insufficient. |
| `220-SW1`, `221-SW1`, `900-AMO` | Acquired software/intangibles; accumulated amortisation; amortisation | Asset / contra asset / expense | Intangibles module; optional | `900-S03` should be recurring SaaS and subscriptions. Acquired software meeting recognition criteria is not an immediate subscription expense. Internally generated start-up/research expenditure remains expensed. [IFRS for SMEs Module 18](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-18.pdf). |
| `200-P01`/`210-P01`, `200-O01`/`210-O01`, `200-B01`/`210-B01`, `200-L01` | Plant and machinery; office equipment; buildings; land | Asset / contra asset | PPE module; optional by activity | The existing four PPE classes are too service-office-centric. Land is not depreciated; buildings, machinery and office equipment require separate useful lives and capital-allowance classifications. |
| `530-IPG`, `900-IPL` | Investment-property fair-value gain / loss | Income / expense | Investments; optional | The current investment-property module supports only a cost/depreciation presentation. MPERS Section 16 requires fair value through profit or loss where reliably measurable without undue cost or effort. [IFRS for SMEs Module 16](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-16.pdf). |
| `430-ITS` | Service tax payable — imported taxable services | Liability | SST service module; optional | Imported taxable services create a different self-accounting workflow from ordinary output service tax. [MySST](https://mysst.customs.gov.my/). |

## B. Accounts to change or split

| Existing account(s) | Required change | Reason |
|---|---|---|
| `900-I02` / `900-I03` | Rename to neutral factual categories such as **company formation costs—tax review** and **other precommencement costs—tax review**. Remove “qualifying” from the ledger conclusion. | Accounting: an ordinary incorporation fee is expensed when the service is received; start-up expenditure is not an intangible asset. Direct equity-issue costs reduce equity, and costs directly attributable to another recognised asset follow that asset. Tax: ordinary precommencement expenditure is not automatically deductible, while the 2003/2005 incorporation-expense Rules provide a narrow specific deduction. The current note relies on an “authorised capital” threshold even though CA 2016 abolished authorised capital. LHDN still lists claim code 111, but I found no current official clarification resolving that mismatch for a 2025-incorporated company. [LHDN PR 11/2013](https://phl.hasil.gov.my/pdf/pdfam/PR_11_2013.pdf); [Form C 2025 guide](https://www.hasil.gov.my/media/forms/upload/form_02611f0e-14a9-4878-ba3c-715de631055b/18cf917c-0d68-4eb6-b98a-974be1ede26d/guidebook_c2025_2.pdf); [SSM no-par-value guidance](https://www.ssm.com.my/Pages/Training_Academy/Training_Calendar-and_Brochure/2019/COMPANIES%20ACT%202016.%20%20NO%20PAR%20VALUE%20%26%20ISSUANCE%20OF%20SHARES%20AND%20OTHER%20SECURITIES.pdf). |
| Hire-purchase block | Keep `470-H01`, `471-H01` and `800-H01`; treat the HP asset split as helpful but not mandatory if the fixed-asset register carries a finance-lease tag. | MPERS requires a net finance-lease obligation and allocation of each payment between finance charge and principal. Tax capital allowances are based on the qualifying capital portion paid—not necessarily the MPERS carrying amount—so a separate HP/CA schedule is essential. HP interest needs its own finance-cost line for s.33/s.140C review. [IFRS for SMEs Module 20](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-20.pdf); [LHDN PR 5/2014](https://phl.hasil.gov.my/pdf/pdfam/PR_5_2014.pdf); [LHDN s.140C](https://www.hasil.gov.my/en/international/restriction-on-deductibility-of-interest-section-140c-income-tax-act-1967/). |
| `900-D01` | Retain Directors’ fees, but correct its note. | For a private company, CA s.230 generally permits board approval subject to the constitution, followed by notification to shareholders; it is not a blanket prior “member approval” rule. |
| `900-D04` | Split into `900-D04 Directors’ salaries and bonuses` and `900-D05 Directors’ benefits/other remuneration`. | Form C separately analyses director fees and salaries. Benefits also need payroll/BIK analysis. EPF and SOCSO consequences depend on whether the director is remunerated under a contract of service, not merely whether the GL label says “fee.” The current assertions that fees never attract EPF/SOCSO are too categorical. [KWSP mandatory contributions](https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution); [PERKESO employer registration](https://www.perkeso.gov.my/en/our-services/employer-employee/employer-registration/); [SSM Companies Act booklet](https://www.ssm.com.my/Pages/Publication/Booklet/document/Booklet%20-%20CDR%20%28FINAL%29.pdf). |
| `900-A01`, `900-A02` | Retain separately; do not recombine. Add the tax filing/advisory accounts above. | Audit, accounting, tax filing and contentious/advisory tax work have distinct statutory, disclosure and deduction bases. |
| `610-100` | Split into `610-PUR Purchases` and `610-COS Cost of sales`, or derive COGS through a controlled inventory subledger. | “COGS / purchases” combines two different Form C fields. For inventory clients, opening inventory, purchases, production/direct costs and closing inventory must be reconstructable. |
| `610-S01` | Split subcontractor payments from other direct service costs, or require a reliable subcontract/WHT dimension. | Form C and withholding-tax analysis require subcontract/contract payments to remain separately identifiable. |
| `300-900`, `900-B03` | Split or tag specific/individually assessed impairment versus collective/general allowance. | LHDN distinguishes evidence-based specific bad debts/impairment from general provisions. [LHDN PR 4/2019](https://phl.hasil.gov.my/pdf/pdfam/PR_04_2019.pdf). |
| `360-T01` | Split tax instalments paid from current-tax receivable/overpayment. | Instalments, refunds and withholding-tax credits must reconcile independently even though all roll up to current tax assets. |
| `430-WHT` | Expand the note and preferably split by remittance workflow: contract payments, interest/royalties and s.4A payments. | The present note mentions only s.107A and s.4A; it omits other common withholding provisions and differing remittance documentation. |
| `440-001` | Rename **Current income tax payable**. | The parenthetical “provision for taxation” invites confusion with MPERS Section 21 provisions, notwithstanding the corrective note. |
| `490-D01`, `490-R01` | Rename the first **refundable customer deposits** and the second **contract liability/deferred income**; add non-current variants where material. | Refundable deposits, advances that form contract consideration and performance-based contract liabilities are not interchangeable. |
| `900-E02` | Split employer SOCSO and employer EIS, or enforce separate payroll dimensions. | They are separately legislated, computed and reconciled; the template already recognises that distinction in liability accounts. |
| `900-DON` | Split approved/eligible donations from other donations, or require an approval-status field. | The current account acknowledges the distinction but does not preserve it. |
| `900-L01` | Split ordinary revenue legal/professional costs from capital/transaction costs. | Legal fees follow their purpose; property, financing, capital and acquisition work should not be treated as routine administrative expenditure. |
| `900-M02` | Split resident management fees from non-resident technical/management fees, or require residence/WHT coding. | The note identifies the need but the single balance cannot satisfy it without dependable transaction metadata. |
| `900-T02` | Split local and overseas travel, or make trip-location coding mandatory. | The note promises distinguishability that the account itself does not provide. |
| `900-FIN` | Split statutory/tax fines from commercial damages, contractual charges and compensatory settlements. | “All fines and penalties are non-deductible” is too broad. Commercial compensation may be revenue expenditure depending on purpose; statutory penalties usually are not. |
| `900-I01` | Rename **Insurance and takaful**. Add optional `900-KMI Key-person insurance/takaful—tax review` where needed. | Takaful does not need a separate generic expense account merely because of its label. Key-person policies do because business-loss purpose, beneficiary and investment elements can change the tax treatment. [LHDN PR 2/2003](https://phl.hasil.gov.my/pdf/pdfam/PR2_2003.pdf). |
| `900-S03` | Rename **Software subscriptions and SaaS**. | Acquired or separately controlled software belongs in the intangible module; implementation/configuration costs need facts-based analysis. |
| `200-R01` / `210-R01` | Rename **Leasehold improvements** where that is what the balance represents. | “Renovation” is too broad: repairs belong in P&L, while only expenditure meeting PPE recognition criteria is capitalised. |
| `900-D02` and other expenses mapped solely to administration | Allocate by function or cost centre: production/COS, selling, and administration. | Depreciation of production machinery or delivery assets cannot always roll into administrative expenses if the entity presents expenses by function. |
| FX gain/loss accounts | Keep realised/unrealised split, but add revenue/capital-source classification. | Unrealised is not the only tax distinction. Revenue FX and capital FX have different tax consequences; the current notes overstate “unrealised = tax adjustment.” [LHDN PR 12/2019](https://phl.hasil.gov.my/pdf/pdfam/PR_12_2019.pdf). |
| Deferred-tax accounts | Place `810-T02`, `260-DTA` and `450-DTL` in the same module. | A core deferred-tax P&L account with optional balance-sheet accounts is internally inconsistent. Deferred tax recognition is an accounting conclusion, not an optional bookkeeping preference. |
| SST and payroll accounts | Move sales tax, service tax, imported services, HRD, payroll and foreign-worker accounts into independently selectable modules. | They are conditional on activity, registration or employees. The current definition “core = every Sdn Bhd needs it” is demonstrably false. PPE and borrowings are also not universal. If the practice wants all accounts pre-seeded, rename the tier from “core” to “standard practice set.” |
| Tax-sensitive notes and names | Remove embedded threshold/rate/date conclusions from `900-I02`, `900-E01`, `900-E03`–`E04` and `900-O01`. | The file currently contains an incorporation threshold, contribution percentage, entertainment percentages and a service-tax effective date despite explicitly saying none are encoded. Store effective-dated tax treatment outside the COA. |

### Specific incorporation conclusion

For the real client’s **INCORPORATION FEE**:

- Book expense under MPERS when the incorporation/legal service has been received, unless the particular component is directly attributable to issuing equity or another recognised asset.
- Do not capitalise a generic “preliminary expenses” intangible.
- Keep a distinct formation-cost account and supporting invoice breakdown.
- Do not label it tax-deductible merely because it is called an incorporation fee.
- Do not apply the historical incorporation-expense relief automatically to a 2025-incorporated company until the authorised-capital mismatch is resolved from a current official source.
- The historical s.6D incorporation rebate is not a substitute: the current Form C guide describes an eligibility commencement window that does not cover a 2025 commencement.

## C. Accounts or structures to remove

1. **Remove `470-H02 Unexpired hire-purchase finance charges` from the standard HP module.** MPERS measures the lease liability net. Retain an interest-in-suspense compatibility account only for a specifically approved legacy gross-instalment workflow, with mandatory reconciliation to the net MPERS liability.

2. **Remove `900-SST` as a permanent P&L posting destination.** Non-recoverable SST follows the underlying purchase:

   - inventory SST → inventory cost;
   - PPE SST → PPE cost;
   - operating-expense SST → that operating expense.

   If automation needs the special account, make it a zero-balance clearing account. The present “SST is a cost” note is also too absolute: SST is not VAT, but qualifying registered manufacturers have a limited sales-tax deduction facility. [MySST sales-tax deduction facility](https://mysst.customs.gov.my/news-1-application-of-tax-deduction-facilities-formerly-known-as-credit-system/).

3. **Make `500-000 Revenue` and `530-000 Other income` non-posting headers**, or remove them once detailed children are enabled. Allowing journals to both parent and detailed accounts creates reporting leakage.

4. **Do not seed `231-001 Accumulated depreciation—investment property` unconditionally.** It is appropriate under the cost model, but not as the automatic companion to every investment property where fair value through P&L is required.

5. **Do not add an s.108 balance or tax-credit account.** Malaysia’s former imputation-account mechanism is obsolete under the single-tier system. Dividends belong in equity/payable accounts, not tax expense. [LHDN PR 5/2011](https://phl.hasil.gov.my/pdf/pdfam/PR5_2011.pdf).

6. **Do not add an IFRS 16-style generic right-of-use asset for ordinary operating leases.** MPERS Section 20 retains the finance/operating lease distinction; the HP finance-lease module is the relevant treatment.

Undrawn bank facilities, guarantees and charges should likewise be maintained in facility/commitment registers and disclosures—not represented as fake zero-value GL liabilities.

## D. What I would refuse to assert without another official-source/facts check

| Issue | Assertion I would not encode | Required evidence |
|---|---|---|
| 2025 incorporation expenditure | That the 2003/2005 Rules definitely apply—or definitely do not apply—to a post-CA-2016 company whose constitution has no authorised-capital concept | Current gazetted amendment, IRBM ruling/technical clarification, or written tax-agent position for the facts |
| Directors’ payments | That every “director fee” is EPF/SOCSO-exempt, or every director payment is employment remuneration | Appointment terms, employment/service contract, board resolution, payroll treatment and current KWSP/PERKESO classification |
| Staff welfare, medical and training | Blanket full deduction, blanket add-back, or automatic double deduction | Nature, recipients, business purpose, payroll/BIK treatment, HRD approval and applicable incentive rules |
| Zakat | Eligibility, deductible quantum or receiving authority | Current ITA provision, payer status, recognised authority and payment evidence |
| HP tax claims | Exact deductible interest or capital-allowance amount from the accounting ledger alone | HP agreement, deposit, instalments actually paid, business/private use, asset class and applicable CA restrictions |
| SST | Whether a purchase tax amount is deductible, exempt, recoverable or cost | Registration type, manufacturer status, goods/service classification, invoice and current RMCD facility/exemption |
| Stamp duty and legal fees | Blanket revenue deduction | Underlying lease, loan, property, capital, acquisition or trading transaction |
| Foreign-worker levy/pass costs | Blanket deduction of every levy, permit, agent charge and bond | Legal payer, refundability, employment purpose and whether any amount is a penalty or capital deposit |
| Insurance/takaful | Deductibility of key-person or investment-linked premiums | Policyholder, insured person, beneficiary, purpose, surrender/investment component and financing assignment |
| FX | Taxability/deductibility based only on realised versus unrealised | Revenue/capital nexus, source transaction and settlement facts |
| Retention sums | Recognition solely from invoice date or certificate label | Contract terms, certification, entitlement, defects-liability conditions and PR 5/2025 facts |
| Rates, caps and dates generally | Any permanent account-name conclusion | Effective-dated compliance tables outside the COA |

No files were edited.
tokens used
589,486
## Verdict

The template is a strong foundation, but the current version is not yet safe as a universal “professionally defensible” default. Its principal weaknesses are:

- incomplete current/non-current and provision/employee-benefit coverage;
- tax conclusions embedded too aggressively in account names and notes;
- conditional regimes being labelled “core”;
- several accounts that combine amounts Form C or tax computations need separately;
- inconsistent treatment of deferred tax, SST and investment property.

There was also version drift during the review. At final read, [coaTemplate.ts](/C:/Users/zhant/Desktop/clara-rebuild/apps/dashboard/app/shared/coaTemplate.ts:75) contains **117 unique accounts in 12 blocks: 9 core and 3 optional**, not the requested 106/10/8+2. Formation costs, a directors’ split and a hire-purchase block have already been added. I reviewed this current 117-account version. The [official-source research memo](/C:/Users/zhant/Desktop/clara-rebuild/docs/plan/research/wave-b/malaysian-coa-official-research.md:375) remains a sound starting point.

## A. Accounts to add

Proposed codes follow the existing ranges; bundled rows are activity-specific modules.

| Code | Account | Type | Block/tier | Why |
|---|---|---:|---|---|
| `900-PRE` | Pre-opening / pre-operating expenses — tax review | Expense | Operating expenses; start-up optional | MPERS expenses start-up, establishment, pre-opening and training expenditure unless it forms part of another recognised asset. Precommencement tax deduction is not automatic because the expenditure may precede production of gross income. Keep separate from legal incorporation costs. [IFRS for SMEs Module 18](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-18.pdf); [LHDN company FAQ](https://www.hasil.gov.my/en/company/frequently-asked-question-company/?bt_warnabg=4). |
| `900-A04` | Tax return preparation / tax-agent filing fee | Expense | Operating expenses; compliance | Accounting and audit are already separate. Tax-return filing should also be separate because the specific deduction rules do not cover every kind of tax advice. [LHDN tax appendices](https://phl.hasil.gov.my/pdf/pdfam/Appendices_2021_2_B_BT_M_MT.pdf). |
| `900-A05` | Tax advisory, investigation and appeal fees — tax review | Expense | Operating expenses | Distinguishes ordinary filing from advice, restructuring, objections, investigations and appeals, whose deductibility depends on purpose and capital/revenue character. |
| `900-S02` | Staff welfare — non-entertainment | Expense | Employee module; optional | Prevents meals, gifts and events governed by entertainment rules from contaminating ordinary employee welfare. Existing entertainment accounts are not a substitute. [LHDN PR 4/2015](https://phl.hasil.gov.my/pdf/pdfam/PR_4_2015.pdf). |
| `900-M03` | Employee medical and dental benefits | Expense | Employee module; optional | Useful for payroll/benefit reporting and tax evidence. It should not carry an automatic deductible/non-deductible conclusion. |
| `900-T04` | Employee training and development | Expense | Employee module; optional | Separates ordinary training, approved programmes and HRD-claimable costs. Accounting treatment is expense; enhanced tax claims require a separate rules engine or schedule. |
| `530-HRD` | HRD Corp grants/reimbursements | Income | Employee module; optional | Keeps training reimbursements out of revenue and allows matching/reconciliation to claims. [HRD Corp employer guidance](https://hrdcorp.gov.my/employers). |
| `810-Z01` | Business zakat contribution | Expense | Finance/tax; optional | A company’s business zakat is dealt with as a deduction from aggregate income—not an individual-style rebate against tax payable. It also appears distinctly in the MBRS taxonomy. [Form C 2025](https://www.hasil.gov.my/media/1offthzg/samplerf_c2025_2.pdf); [SSM taxonomy](https://www.ssm.com.my/Pages/Services/Other-Services/mbrs%20pdf/MBRS%20SSM%20Taxonomy%20SSMxT_v1.0%2005Sept2018.pdf). |
| `440-ZKT` | Business zakat payable | Liability | Liabilities; zakat optional | Required where zakat expense has been accrued but not paid. Do not net it into current income tax. |
| `250-DEP` | Refundable deposits — non-current | Asset | Non-current assets | `340-D01 Deposits paid` forces every rental, utility and security deposit into current assets. Classification must follow expected recovery. [SSM MBRS FAQ](https://www.ssm.com.my/Pages/Register_Business_Company_LLP/Company/document/FAQ_MBRS_ISSB.pdf). |
| `250-DIR`, `250-REL` | Non-current amount owing from director / related company | Asset | Non-current assets | Existing related-party receivables are all current. MPERS requires current/non-current presentation and separate related-party analysis; maturity cannot be inferred from the counterparty name. |
| `472-DIR`, `472-REL` | Non-current amount owing to director / related company | Liability | Non-current liabilities | Same issue on the liability side. Never net solely because the same director or group entity is involved. |
| `451-EB1`, `452-EB1` | Employee-benefit obligations — current / non-current | Liability | Liabilities; employee module | Payroll remittance payables do not cover annual leave, bonuses, gratuities or other employee-benefit obligations. |
| `453-PR1`, `454-PR1` | Other provisions — current / non-current | Liability | Liabilities | Accrued invoices and MPERS Section 21 provisions are different. Recognise only a present obligation with probable outflow and a reliable estimate—never a general reserve. [IFRS for SMEs Module 21](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2026-modules/module-21.pdf). |
| `310-FD1` | Short-term fixed deposits / placements | Asset | Current assets; treasury optional | Separates cash equivalents from placements that fail the cash-equivalent criteria. |
| `250-PDG` | Pledged or restricted deposits — non-current | Asset | Non-current assets; treasury optional | A pledged deposit should not automatically be presented as freely available cash. |
| `460-OD1` | Bank overdraft | Liability | Liabilities; financing optional | Separate from term borrowings. It enters cash equivalents for cash-flow presentation only when repayable on demand and integral to cash management. [IFRS for SMEs Module 7](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-07.pdf). |
| `410-CC1` | Corporate credit-card payable | Liability | Liabilities; treasury optional | Common independent reconciliation/control balance; should not disappear inside trade payables. |
| `340-UNB` | Unbilled receivables / accrued income | Asset | Current assets | Needed for earned consideration not yet invoiced. For Section 23 contracts, distinguish this from a contract asset arising from performance conditions. |
| `360-WHT` | Withholding tax receivable / tax credits | Asset | Current assets; tax | Prevents foreign or domestic tax credits from being mixed with CP204 instalments and current tax overpayments. |
| `160-DIV` | Dividends declared / distribution clearing | Equity | Equity | Dividends are distributions, never P&L expenses. A separate clearing account improves the retained-earnings roll-forward. |
| `410-DIV` | Dividends payable | Liability | Liabilities | Recognise when validly authorised and no longer at the company’s discretion. Companies Act ss.131–132 require profits, solvency and directors’ authorisation. [Companies Act 2016](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf). |
| `370-CON`, `370-RET`, `492-RET` | Contract asset; retention receivable; retention payable | Asset / asset / liability | Construction module; optional | Construction entities need gross due-from/due-to and retention balances, without contract-level offsetting. Tax recognition of retention sums has its own rules. [LHDN PR 5/2025](https://www.hasil.gov.my/media/2ddparpd/public-ruling-no-5_2025-construction-contracts.pdf); [IFRS for SMEs Module 23](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-23.pdf). |
| `900-FWL`, `410-FWL`, `340-FWB`/`250-FWB` | Foreign-worker levy/pass costs; payable; refundable bond/deposit | Expense / liability / asset | Foreign-worker module; optional | The levy is an expense when incurred; a refundable security bond is an asset, not an expense. Current/non-current depends on expected recovery. [Immigration Department guidance](https://www.imi.gov.my/index.php/en/main-services/pass/visitor-pass/visitors-pass-temporary-employment/). |
| `900-STP` | Stamp duty and registration costs — revenue items | Expense | Operating expenses; tax review | Provides an analysis line, but stamp duty on PPE, leases, financing, share issues or acquisitions must follow the underlying transaction rather than being dumped here. [LHDN stamp duty](https://www.hasil.gov.my/en/stamp-duty); [LHDN PR 6/2006](https://phl.hasil.gov.my/pdf/pdfam/PR6_2006.pdf). |
| `530-DIV`, `530-ROY`, `530-GRT` | Dividend income; royalty/licence income; government grants/subsidies | Income | Income; relevant modules | Form C analyses these income streams separately. Source/residence should preferably be transaction metadata or tax-schedule dimensions. [Form C 2025](https://www.hasil.gov.my/media/1offthzg/samplerf_c2025_2.pdf). |
| `900-RYL`, `900-RND`, `900-DSP`, `900-MVR`, `900-EQR` | Royalties/licence fees; R&D; loss on disposal; motor-vehicle rental; equipment rental | Expense | Operating expenses | These have materially different Form C, withholding-tax or tax-computation treatments. A single professional/rental/motor account is insufficient. |
| `220-SW1`, `221-SW1`, `900-AMO` | Acquired software/intangibles; accumulated amortisation; amortisation | Asset / contra asset / expense | Intangibles module; optional | `900-S03` should be recurring SaaS and subscriptions. Acquired software meeting recognition criteria is not an immediate subscription expense. Internally generated start-up/research expenditure remains expensed. [IFRS for SMEs Module 18](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-18.pdf). |
| `200-P01`/`210-P01`, `200-O01`/`210-O01`, `200-B01`/`210-B01`, `200-L01` | Plant and machinery; office equipment; buildings; land | Asset / contra asset | PPE module; optional by activity | The existing four PPE classes are too service-office-centric. Land is not depreciated; buildings, machinery and office equipment require separate useful lives and capital-allowance classifications. |
| `530-IPG`, `900-IPL` | Investment-property fair-value gain / loss | Income / expense | Investments; optional | The current investment-property module supports only a cost/depreciation presentation. MPERS Section 16 requires fair value through profit or loss where reliably measurable without undue cost or effort. [IFRS for SMEs Module 16](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-16.pdf). |
| `430-ITS` | Service tax payable — imported taxable services | Liability | SST service module; optional | Imported taxable services create a different self-accounting workflow from ordinary output service tax. [MySST](https://mysst.customs.gov.my/). |

## B. Accounts to change or split

| Existing account(s) | Required change | Reason |
|---|---|---|
| `900-I02` / `900-I03` | Rename to neutral factual categories such as **company formation costs—tax review** and **other precommencement costs—tax review**. Remove “qualifying” from the ledger conclusion. | Accounting: an ordinary incorporation fee is expensed when the service is received; start-up expenditure is not an intangible asset. Direct equity-issue costs reduce equity, and costs directly attributable to another recognised asset follow that asset. Tax: ordinary precommencement expenditure is not automatically deductible, while the 2003/2005 incorporation-expense Rules provide a narrow specific deduction. The current note relies on an “authorised capital” threshold even though CA 2016 abolished authorised capital. LHDN still lists claim code 111, but I found no current official clarification resolving that mismatch for a 2025-incorporated company. [LHDN PR 11/2013](https://phl.hasil.gov.my/pdf/pdfam/PR_11_2013.pdf); [Form C 2025 guide](https://www.hasil.gov.my/media/forms/upload/form_02611f0e-14a9-4878-ba3c-715de631055b/18cf917c-0d68-4eb6-b98a-974be1ede26d/guidebook_c2025_2.pdf); [SSM no-par-value guidance](https://www.ssm.com.my/Pages/Training_Academy/Training_Calendar-and_Brochure/2019/COMPANIES%20ACT%202016.%20%20NO%20PAR%20VALUE%20%26%20ISSUANCE%20OF%20SHARES%20AND%20OTHER%20SECURITIES.pdf). |
| Hire-purchase block | Keep `470-H01`, `471-H01` and `800-H01`; treat the HP asset split as helpful but not mandatory if the fixed-asset register carries a finance-lease tag. | MPERS requires a net finance-lease obligation and allocation of each payment between finance charge and principal. Tax capital allowances are based on the qualifying capital portion paid—not necessarily the MPERS carrying amount—so a separate HP/CA schedule is essential. HP interest needs its own finance-cost line for s.33/s.140C review. [IFRS for SMEs Module 20](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-20.pdf); [LHDN PR 5/2014](https://phl.hasil.gov.my/pdf/pdfam/PR_5_2014.pdf); [LHDN s.140C](https://www.hasil.gov.my/en/international/restriction-on-deductibility-of-interest-section-140c-income-tax-act-1967/). |
| `900-D01` | Retain Directors’ fees, but correct its note. | For a private company, CA s.230 generally permits board approval subject to the constitution, followed by notification to shareholders; it is not a blanket prior “member approval” rule. |
| `900-D04` | Split into `900-D04 Directors’ salaries and bonuses` and `900-D05 Directors’ benefits/other remuneration`. | Form C separately analyses director fees and salaries. Benefits also need payroll/BIK analysis. EPF and SOCSO consequences depend on whether the director is remunerated under a contract of service, not merely whether the GL label says “fee.” The current assertions that fees never attract EPF/SOCSO are too categorical. [KWSP mandatory contributions](https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution); [PERKESO employer registration](https://www.perkeso.gov.my/en/our-services/employer-employee/employer-registration/); [SSM Companies Act booklet](https://www.ssm.com.my/Pages/Publication/Booklet/document/Booklet%20-%20CDR%20%28FINAL%29.pdf). |
| `900-A01`, `900-A02` | Retain separately; do not recombine. Add the tax filing/advisory accounts above. | Audit, accounting, tax filing and contentious/advisory tax work have distinct statutory, disclosure and deduction bases. |
| `610-100` | Split into `610-PUR Purchases` and `610-COS Cost of sales`, or derive COGS through a controlled inventory subledger. | “COGS / purchases” combines two different Form C fields. For inventory clients, opening inventory, purchases, production/direct costs and closing inventory must be reconstructable. |
| `610-S01` | Split subcontractor payments from other direct service costs, or require a reliable subcontract/WHT dimension. | Form C and withholding-tax analysis require subcontract/contract payments to remain separately identifiable. |
| `300-900`, `900-B03` | Split or tag specific/individually assessed impairment versus collective/general allowance. | LHDN distinguishes evidence-based specific bad debts/impairment from general provisions. [LHDN PR 4/2019](https://phl.hasil.gov.my/pdf/pdfam/PR_04_2019.pdf). |
| `360-T01` | Split tax instalments paid from current-tax receivable/overpayment. | Instalments, refunds and withholding-tax credits must reconcile independently even though all roll up to current tax assets. |
| `430-WHT` | Expand the note and preferably split by remittance workflow: contract payments, interest/royalties and s.4A payments. | The present note mentions only s.107A and s.4A; it omits other common withholding provisions and differing remittance documentation. |
| `440-001` | Rename **Current income tax payable**. | The parenthetical “provision for taxation” invites confusion with MPERS Section 21 provisions, notwithstanding the corrective note. |
| `490-D01`, `490-R01` | Rename the first **refundable customer deposits** and the second **contract liability/deferred income**; add non-current variants where material. | Refundable deposits, advances that form contract consideration and performance-based contract liabilities are not interchangeable. |
| `900-E02` | Split employer SOCSO and employer EIS, or enforce separate payroll dimensions. | They are separately legislated, computed and reconciled; the template already recognises that distinction in liability accounts. |
| `900-DON` | Split approved/eligible donations from other donations, or require an approval-status field. | The current account acknowledges the distinction but does not preserve it. |
| `900-L01` | Split ordinary revenue legal/professional costs from capital/transaction costs. | Legal fees follow their purpose; property, financing, capital and acquisition work should not be treated as routine administrative expenditure. |
| `900-M02` | Split resident management fees from non-resident technical/management fees, or require residence/WHT coding. | The note identifies the need but the single balance cannot satisfy it without dependable transaction metadata. |
| `900-T02` | Split local and overseas travel, or make trip-location coding mandatory. | The note promises distinguishability that the account itself does not provide. |
| `900-FIN` | Split statutory/tax fines from commercial damages, contractual charges and compensatory settlements. | “All fines and penalties are non-deductible” is too broad. Commercial compensation may be revenue expenditure depending on purpose; statutory penalties usually are not. |
| `900-I01` | Rename **Insurance and takaful**. Add optional `900-KMI Key-person insurance/takaful—tax review` where needed. | Takaful does not need a separate generic expense account merely because of its label. Key-person policies do because business-loss purpose, beneficiary and investment elements can change the tax treatment. [LHDN PR 2/2003](https://phl.hasil.gov.my/pdf/pdfam/PR2_2003.pdf). |
| `900-S03` | Rename **Software subscriptions and SaaS**. | Acquired or separately controlled software belongs in the intangible module; implementation/configuration costs need facts-based analysis. |
| `200-R01` / `210-R01` | Rename **Leasehold improvements** where that is what the balance represents. | “Renovation” is too broad: repairs belong in P&L, while only expenditure meeting PPE recognition criteria is capitalised. |
| `900-D02` and other expenses mapped solely to administration | Allocate by function or cost centre: production/COS, selling, and administration. | Depreciation of production machinery or delivery assets cannot always roll into administrative expenses if the entity presents expenses by function. |
| FX gain/loss accounts | Keep realised/unrealised split, but add revenue/capital-source classification. | Unrealised is not the only tax distinction. Revenue FX and capital FX have different tax consequences; the current notes overstate “unrealised = tax adjustment.” [LHDN PR 12/2019](https://phl.hasil.gov.my/pdf/pdfam/PR_12_2019.pdf). |
| Deferred-tax accounts | Place `810-T02`, `260-DTA` and `450-DTL` in the same module. | A core deferred-tax P&L account with optional balance-sheet accounts is internally inconsistent. Deferred tax recognition is an accounting conclusion, not an optional bookkeeping preference. |
| SST and payroll accounts | Move sales tax, service tax, imported services, HRD, payroll and foreign-worker accounts into independently selectable modules. | They are conditional on activity, registration or employees. The current definition “core = every Sdn Bhd needs it” is demonstrably false. PPE and borrowings are also not universal. If the practice wants all accounts pre-seeded, rename the tier from “core” to “standard practice set.” |
| Tax-sensitive notes and names | Remove embedded threshold/rate/date conclusions from `900-I02`, `900-E01`, `900-E03`–`E04` and `900-O01`. | The file currently contains an incorporation threshold, contribution percentage, entertainment percentages and a service-tax effective date despite explicitly saying none are encoded. Store effective-dated tax treatment outside the COA. |

### Specific incorporation conclusion

For the real client’s **INCORPORATION FEE**:

- Book expense under MPERS when the incorporation/legal service has been received, unless the particular component is directly attributable to issuing equity or another recognised asset.
- Do not capitalise a generic “preliminary expenses” intangible.
- Keep a distinct formation-cost account and supporting invoice breakdown.
- Do not label it tax-deductible merely because it is called an incorporation fee.
- Do not apply the historical incorporation-expense relief automatically to a 2025-incorporated company until the authorised-capital mismatch is resolved from a current official source.
- The historical s.6D incorporation rebate is not a substitute: the current Form C guide describes an eligibility commencement window that does not cover a 2025 commencement.

## C. Accounts or structures to remove

1. **Remove `470-H02 Unexpired hire-purchase finance charges` from the standard HP module.** MPERS measures the lease liability net. Retain an interest-in-suspense compatibility account only for a specifically approved legacy gross-instalment workflow, with mandatory reconciliation to the net MPERS liability.

2. **Remove `900-SST` as a permanent P&L posting destination.** Non-recoverable SST follows the underlying purchase:

   - inventory SST → inventory cost;
   - PPE SST → PPE cost;
   - operating-expense SST → that operating expense.

   If automation needs the special account, make it a zero-balance clearing account. The present “SST is a cost” note is also too absolute: SST is not VAT, but qualifying registered manufacturers have a limited sales-tax deduction facility. [MySST sales-tax deduction facility](https://mysst.customs.gov.my/news-1-application-of-tax-deduction-facilities-formerly-known-as-credit-system/).

3. **Make `500-000 Revenue` and `530-000 Other income` non-posting headers**, or remove them once detailed children are enabled. Allowing journals to both parent and detailed accounts creates reporting leakage.

4. **Do not seed `231-001 Accumulated depreciation—investment property` unconditionally.** It is appropriate under the cost model, but not as the automatic companion to every investment property where fair value through P&L is required.

5. **Do not add an s.108 balance or tax-credit account.** Malaysia’s former imputation-account mechanism is obsolete under the single-tier system. Dividends belong in equity/payable accounts, not tax expense. [LHDN PR 5/2011](https://phl.hasil.gov.my/pdf/pdfam/PR5_2011.pdf).

6. **Do not add an IFRS 16-style generic right-of-use asset for ordinary operating leases.** MPERS Section 20 retains the finance/operating lease distinction; the HP finance-lease module is the relevant treatment.

Undrawn bank facilities, guarantees and charges should likewise be maintained in facility/commitment registers and disclosures—not represented as fake zero-value GL liabilities.

## D. What I would refuse to assert without another official-source/facts check

| Issue | Assertion I would not encode | Required evidence |
|---|---|---|
| 2025 incorporation expenditure | That the 2003/2005 Rules definitely apply—or definitely do not apply—to a post-CA-2016 company whose constitution has no authorised-capital concept | Current gazetted amendment, IRBM ruling/technical clarification, or written tax-agent position for the facts |
| Directors’ payments | That every “director fee” is EPF/SOCSO-exempt, or every director payment is employment remuneration | Appointment terms, employment/service contract, board resolution, payroll treatment and current KWSP/PERKESO classification |
| Staff welfare, medical and training | Blanket full deduction, blanket add-back, or automatic double deduction | Nature, recipients, business purpose, payroll/BIK treatment, HRD approval and applicable incentive rules |
| Zakat | Eligibility, deductible quantum or receiving authority | Current ITA provision, payer status, recognised authority and payment evidence |
| HP tax claims | Exact deductible interest or capital-allowance amount from the accounting ledger alone | HP agreement, deposit, instalments actually paid, business/private use, asset class and applicable CA restrictions |
| SST | Whether a purchase tax amount is deductible, exempt, recoverable or cost | Registration type, manufacturer status, goods/service classification, invoice and current RMCD facility/exemption |
| Stamp duty and legal fees | Blanket revenue deduction | Underlying lease, loan, property, capital, acquisition or trading transaction |
| Foreign-worker levy/pass costs | Blanket deduction of every levy, permit, agent charge and bond | Legal payer, refundability, employment purpose and whether any amount is a penalty or capital deposit |
| Insurance/takaful | Deductibility of key-person or investment-linked premiums | Policyholder, insured person, beneficiary, purpose, surrender/investment component and financing assignment |
| FX | Taxability/deductibility based only on realised versus unrealised | Revenue/capital nexus, source transaction and settlement facts |
| Retention sums | Recognition solely from invoice date or certificate label | Contract terms, certification, entitlement, defects-liability conditions and PR 5/2025 facts |
| Rates, caps and dates generally | Any permanent account-name conclusion | Effective-dated compliance tables outside the COA |

No files were edited.
