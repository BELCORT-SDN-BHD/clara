# 磨合-session grill rulings — 2026-08-26/27

*The owner (Tao) ruled every item below in the 磨合 opening grill (this session, 2026-08-26
night → 08-27). This file is the ruling record for the frontend build; it composes with
`frontend-handoff-2026-08-23.md` (§0 stands untouched), the 08-24 addendum (+ its §7), the
mohe handoff (#355) and `harness-audit-rulings-2026-08-26.md` (R1-R9). Where this file and
PROGRESS.md disagree, PROGRESS.md wins or is stale. Evidence basis: the six-reader
adversarially-verified alignment scan of `clarabook-frontend` PR #1 vs clara @ `a87cc71`
(frontier `0136`), run 2026-08-26 this session.*

## The nine rulings (Q1-Q9)

1. **Q1 — Codex artifact status: (a).** The Codex `clarabook-frontend` output is DESIGN LAW +
   prototype evidence, not the production app. Production = **`apps/web` in THIS repo**, Next
   15/16 on Cloudflare Workers, TypeScript, branch **frontend/web**, replacing `apps/dashboard`
   at cutover — §0 of the base handoff stands in full. The Codex design system / brand /
   routing IA / screens are PORTED in. Grounds (scan-verified): their integration contract is
   36 commits stale and materially wrong on bank/filing/close/freeform/reports; the prototype
   is JS (no compile-time parts guard is possible); its hand-rolled `window.history` router is
   not portable; `createMutationIntent` (revision+idempotency) is defined but never called;
   no parts[] renderer exists — Clara answers in prose there.
2. **Q2 — Interaction model: (a) rail-first + thread escalation.** Every workspace carries the
   persistent Clara RAIL (PRD §5a law); a work thread can ESCALATE to full-screen (deep work:
   close prep, interviews, multi-document review), URL-addressable, collapsible back to the
   rail. Full-screen is the rail conversation enlarged, never a separate universe; the
   remove-the-rail acceptance test binds every workbench screen regardless. Codex's durable
   parallel-threads idea is adopted in this form; their Clara-as-modal-Sheet (<1200px) shape
   is rejected as a modal.
3. **Q3 — IA: (a) two-level workspace skeleton, merged.** Firm altitude: firm home ·
   cross-client Needs-you inbox · client register · **firm activity = the receipts/open-register
   feed** (the ADR-0074 inversion made surface) · admin (tiers/RBAC/metering). Client
   workspace: ONE workspace, accounting objects as tabs — journals · documents · bank · close
   · reports · registers · knowledge; every object offers its verbs (ActionPanels); Codex's
   "data library" folds into documents/knowledge. Cross-cutting: ⌘K Ask/Do/Go single entry ·
   URL-as-truth · client switch = a security event that clears prior-client local state
   (Codex mechanism adopted).
4. **Q4 — Visual law: (a) the ClaraBook brand system v1.0 is RATIFIED** (this ruling is the
   owner approval the Codex log lacked for the naming split — dated 2026-08-26). Naming law:
   **ClaraBook = platform, Clara = the agent**. The token map, shadcn/Base-UI-first rule and
   the motion discipline (motion explains change · immediate feedback · visible focus · no
   decorative perpetual animation) port into apps/web wholesale; raw color values in page
   components are lint-banned. Caveats: brand package ratification is subject to its checksums
   verifying clean; light-theme-only is a BETA-scope ruling, not permanent; brand-foundation
   changes follow the decision-log change-control, adopted into this repo.
5. **Q5 — i18n: (a) three layers.** Statutory/client-facing instruments (PDPA notices, client
   authorization, watermark locale) ship **BM+EN from day one** (zh follows; source texts
   already exist in `docs/ops/legal/`). UI chrome is English-first for beta but ALL strings go
   through an i18n framework (next-intl) from day one — hardcoded UI strings are lint-banned.
   Clara's conversation is naturally multilingual, no gate. (Scan verified the Codex
   "English-only" line was a bundled approval that dropped their own PDPA caveat — superseded
   by this ruling.)
6. **Q6 — Mobile: (a) desktop-first + the mobile decision corridor.** Desktop = the full
   workbench. Narrow screens get a designed corridor: Needs-you inbox · Clara threads (the
   full-screen form — resolves the no-modal law on phones) · receipts/activity read · the
   reserved-human-act doors. No dedicated mobile bookkeeping surfaces, no native app, ONE web
   app/URL/codebase.
7. **Q7 — Accessibility: (a) WCAG 2.1 AA** is the formal bar (now a dedicated ruling), with
   three CI gates: constructive token-level contrast (OKLCH, guaranteed at generation) · axe
   scans riding the playwright e2es · keyboard-walk tests on the approve/review/close
   journeys. Manual screen-reader review once per major surface, deliberately NOT in CI. AAA
   declined (density trade-off).
8. **Q8 — Card catalog: (a) workbench-first + ONE batched wire extension.** All new Wave-F
   surfaces (receipts, firm questions, close plan, freeform read, report archive) build first
   as workbench objects on direct RLS reads + governed doors — zero wire change. Chat wire
   adds exactly FOUR part types in a single runtime version bump (chatTurn_v15 era):
   `agent_receipt` (generic, reads `agent_receipts_visible`) · `firm_question`
   (resolve/dismiss doors) · `close_proposal` · `freeform_result`. Live/working state renders
   at the SSE layer (AG-UI shape borrowed, no dependency), NOT as a persisted part type.
   Catalog total: 18 live + 4 new = 22. **[TRUED 2026-08-30, ruling preserved as written:
   `chatTurn_v15` shipped 2026-08-29 for the unrelated F-A6 PR-2 freeform read and is now
   consumed+frozen, so this Q8 bump lands as `chatTurn_v16`; MBB-4 also found the catalog
   baseline already at 22 (the `chatTurn_v14` receipt kinds were already live on the wire), so
   the delta this bump completes is 22 → 26, not 18 → 22.]** The generative-UI stack is
   layered: **AI SDK carries
   the parts (wire) · shadcn + ClaraBook tokens dress the cards (visual) · our registered
   catalog + tsc guard + hydrate-never-trust hooks govern them (mechanism)`; model-authored
   markup (streamUI-style) is forbidden.**
9. **Q9 — Build order + done formula: (a), with graph-parallel conduct.** Per-journey DONE =
   (1) screens built against LIVE verbs — no affordance without a named backend verb ·
   (2) hydrate-never-trust throughout, no optimistic UI · (3) the three a11y CI gates green ·
   (4) an impeccable/Emil polish pass · (5) an end-to-end walk on live test data (ADR-0075).
   Cross-cutting: every crude door replaced IN PLACE, same verb, no new gate; the UI never
   invents a number, verb, receipt or link. Phases: **P0** pre-flight (chatTurn_v14 deploy ·
   `/ready` storage probe PR) → **P1** foundation (apps/web scaffold, tokens ported, CI gates:
   worker ≤10MiB · a11y ×3 · string lint · catalog parity; Emil skills committed) → **P2**
   shell (two-level IA · Supabase SSR cookie invite-only auth · client-switch clearing ·
   URL-as-truth · ⌘K skeleton · rail+thread · 18-part renderer + tsc guard) → **P3** workbench
   (documents → JE review → queue → bank → close doors → reports/archive → registers →
   receipts/activity + firm Needs-you + freeform page) → **P4** firm tiers (T1 invite/RBAC ·
   T2 operator-approved creation · T3 screens flag-hidden; admin/metering; pricing SHAPE only)
   → **P5** F-A7b joint design gate (runs EARLY, parallel with P1/P2 — its train builds after
   it closes) → **P6** the four-part wire bump · global polish · the cutover PR ceremony.
   Conduct: dependency-graph parallel lanes, each git-active lane in its own worktree, pinned
   worker models, the uniform review ladder intact — speed from parallelism, never from
   skipped rungs.

## The final batch (Q-A … Q-F)

- **Q-A — Codex repo disposition: APPROVED.** Merge `clarabook-frontend` PR #1 into that
  repo's `main`; the repo is designated the DESIGN-ASSET ARCHIVE (brand package, design
  system, prototype evidence). Product code never lives there; we reference, never nest. An
  errata page for its now-stale integration claims lands in THIS repo (`docs/plan/active/`),
  their history is not rewritten.
- **Q-B — Tier-3 payments: STRIPE.** Checkout shell is built provider-agnostic; Stripe is the
  named first-class provider. Wiring rides the pricing-amounts sitting + tier-3's own
  security gate (R8b).
- **Q-C — F-A7b playbook set: CONFIRMED as the starting five** — ① predecessor hands over
  audited FS + GL · ② values-only management accounts · ③ bank statements only · ④ shoebox ·
  ⑤ mid-year switch with a records gap. Per-situation treatments (what Clara may build, must
  request, and must never fabricate — law 22) are proposed BY the F-A7b design gate and ruled
  there; the adaptive interview itself is already ruled (R8a).
- **Q-D — Debt-sprint backend items ride this window as parallel lanes: APPROVED** (storage
  probe PR · G1 ADR · digest addenda R4/R5/R7 · `docs/ops/ceremony-practices.md` · N-cells) —
  each on its own ladder.
- **Q-E — Pricing-amounts sitting: APPROVED** — scheduled when P4 nears; conductor brings
  F-A9 usage data.
- **Q-F — FYI block accepted:** chatTurn_v14 deploys under the standing ceremony grant at P0 ·
  BM/zh statutory copy comes to the owner for signature when wired · R2's PRD sentences get
  word-by-word owner review before any PR · Mobbin/Stripe MCP auth requested at need.

## Standing evidence pointers

- The alignment scan's confirmed headline findings (full detail in the scan record, this
  session): the Codex contract's `begin_close` prohibition is now wrong (0120 shipped it,
  human-gated) · its 21-part union carries three retired types (`kb_rule_proposal`,
  `rule_post_receipt`, `bank_rule_proposal`; live union = 18) · bank agency split into
  13 live wake verbs + a permanently retired rules loop (0129) · filing/attribution is LIVE
  (0123-0126) · the freeform read surface (0131) is absent from their handoff entirely ·
  two report download paths now exist (0127 archive, 0132 sandbox export) · no invented verb
  names found — their manifests are honest about their own staleness.
- Resources: 8 Emil Kowalski skills installed at `.claude/skills/` (committed with the first
  磨合 PR) · shadcn MCP pinned in `.mcp.json` (4.12.0) — pair with a project shadcn SKILL.md
  (official if found, else authored thin) · Mobbin + Stripe MCPs present, auth at need.
