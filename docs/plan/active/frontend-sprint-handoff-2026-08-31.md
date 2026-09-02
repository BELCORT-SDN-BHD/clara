# The frontend-sprint handoff — 2026-08-31 (the beta sprint's opening document)

*Written by the outgoing Claude orchestrator at the 2026-08-31 sitting, for a reader with **no
session, no transcript and no task board — only this repo** (`.claude/rules/handoffs.md`). Every
resume path below names a file, a document or a command. Session-local names (lane names, run ids,
a scratchpad path) appear only as dated historical labels. `PROGRESS.md` stays the state authority;
this file is the dated bridge into it. The companion orders are
[`frontend-sprint-handoff-2026-08-31-orders.md`](frontend-sprint-handoff-2026-08-31-orders.md).*

## 0 · Who you are, and what this is

**You are the next Claude Code session — the orchestrator (裁-82 as amended by 裁-85: the seat
stays here; Codex and native lanes are the hands, each picked per task by the `orchestrator-fable`
philosophy — the most effective, suitable, economical model that does not sacrifice quality)** — and
this is your opening document (裁-82,
[`mohe-grill-rulings-2026-08-31.md`](mohe-grill-rulings-2026-08-31.md)). Clara's core backend is
built, ceremonied and live; the production frontend `apps/web` is ~90 % on `main` and deployed
nowhere; `app.clarabook.com` still serves the retiring `apps/dashboard`. **Your job is the beta
runway:** finish the P4 trains, close the four holes the happy-path trace found, replace the old
frontend at `app.clarabook.com` with `apps/web`, stand up Stripe under the ruled pay model, walk
the reduced Wave G, and launch. **Unbuilt backend is paused, not built** — it appears in the UI as
honest not-built-yet flows and lives in `PROGRESS.md` rows. Nothing in this file outranks
`AGENTS.md`'s fourteen hard constraints.

## 1 · Clock-in, in this order

0. Run the `orchestrator-fable` skill (the dispatch philosophy and the ladder); recall memory for
   preferences and lessons only (constraint 8).
1. `AGENTS.md` (the constraints; the harness menu — it now carries a frontend row).
2. `PROGRESS.md` — "Current posture" (the 2026-08-31 pivot bullet) · Lanes · Next · Backlog ·
   Known issues (the parked PRs each have a row with its resume path).
3. This file, then [`mohe-grill-rulings-2026-08-31.md`](mohe-grill-rulings-2026-08-31.md) (裁-73…84
   — the rulings this sprint executes) and, when an older ruling is cited, the ledgers of 08-27 ·
   08-27-evening · 08-28 · 08-29 · 08-30 in `docs/plan/active/`.
4. `apps/web/README.md` + `apps/web/AGENTS.md` (the house laws: `getRows`/`callDoor`, verbatim
   `DoorRefusal`, no optimistic UI, next-intl, semantic tokens, the two dialog-testing laws).
5. [`fe-train-plan-2026-08-30.md`](fe-train-plan-2026-08-30.md) + its two orders companions — **§0
   of the P4 orders is the shared preamble every order in this sprint inherits** (worktree
   mechanics, the junction precondition, the four verify commands, the instrument laws, the design
   resources rule). Read it once, obey it everywhere.
6. Per train: the design of record named in its order (billing · fa7b · reporting-agency ·
   close-key-1 · p4-design · port-wave-plan).

## 2 · The world as measured (2026-08-31, `main 652844d8`) — with the command that re-proves it

| Fact | Re-prove |
|---|---|
| Repo migration frontier `0155`; `0154` and `0155` are on main and **NOT applied live** | `ls packages/db/migrations \| tail -3`; PROGRESS.md posture |
| Live DB 148 migrations / frontier `0153` (ceremonied 2026-08-30 00:30Z) | `docs/plan/completed/mohe-0148-0153-apply-asrun.md`; a `schema_migrations` read via `scripts/ops/dsn-pipe.mjs` (`docs/ops/dsn-bridge.md`, DSN env-to-env only) |
| Runtime: Fly `clara-runtime` tag `v69`, serving `chatTurn: chatTurn_v15` | `fly ssh console -a clara-runtime -C "sh -c 'grep -oa \"chatTurn: chatTurn_v1[0-9]\" /app/.output/server/index.mjs \| head -1'"`; `packages/runtime/workflows/registry.ts` |
| `clara.wake_engine_sources`: `bank_agent` + `close_prep` rows, both `enabled=false` | `docs/adr/0076-g1-universal-wake-execution-engine.md`; a live read of the table |
| `app.clarabook.com` serves `apps/dashboard` (Next 15, Cloudflare Pages). **The Pages project is Git-connected to this repo: every PR and every push to `main` triggers a Pages build** — a "Cloudflare Pages" check appears on every PR (seen on #465, 2026-08-31), so a merge to `main` re-deploys the OLD dashboard automatically until the project is disconnected at the cutover | the PR checks list (`gh pr checks <n>`); the Cloudflare dashboard, account `ac42cba1…`, Pages project `clara` — read it, do not derive it (fe-train-plan §6 OQ-5) |
| `apps/web` (Next 16.3.3, `@opennextjs/cloudflare`, wrangler name `clara-web`) is merged, never deployed | `apps/web/wrangler.jsonc`; `git log --oneline -- apps/web \| head` |
| The parts catalog is 26 members; four readers (`agent_receipt` · `firm_question` · `close_proposal` · `freeform_result`) wait for their declarer `chatTurn_v16` (#454) | `apps/web/lib/parts/types.ts` header; `gh pr view 454` |
| Zero Stripe code; no Stripe MCP mounted in ~/.codex/config.toml; no `STRIPE*` env on the host | `git grep -il stripe -- apps packages scripts`; `codex mcp list` |
| Thirteen open PRs (dispositions in §4); eight lanes' fold rounds uncommitted in their worktrees under .claude/worktrees/ (untracked, this machine) | `gh pr list --state open`; `git worktree list` |
| Seven throwaway rigs were left up on 2026-08-31 dawn (`kw2-rig` 56061 · `uv4-rig` 56060 · `bpr3e-rig` 56057 · `g1p2db4-rig` 56063 · `g1p2rt4-rig` 56062 · `ready-hard-r6-rig` 56056 · `prb2-rig` 56058) — all re-creatable; remove any you do not use | `wsl -e docker ps` |
| The detailed round notes of the paused night live on disk under the 2026-08-31 session scratchpad named in PROGRESS.md's dawn entry — a **historical label**, not a resume step; every bar you need is restated in the orders | — |

## 3 · The rulings in force for this sprint (one line each; full text in the 08-31 ledger)

- **裁-73** firm creation = Stripe Checkout (subscription, zero-amount price, card on file) →
  signature-verified idempotent webhook → one `firm_admissions` row → the existing `create_firm`.
- **裁-74** unpaid signup = holding page + resume checkout; no reminder mail; never deleted.
- **裁-75** run the live-catalog census, then amend 裁-72 to the measured residual + honest notes;
  the cutover no longer waits for P6-C1…C7.
- **裁-76** the G1 clocks (#456/#449) are post-beta; 裁-59 amended: Wave G proves the *interactive*
  agent.
- **裁-77** reports: chat tools over the report wrappers + F-A5b PR-3 PDF + the twelve close
  wrappers as chat tools — the only new backend this sprint admits.
- **裁-78** the F-A7b interview runner is ported before the cutover; a hard cutover criterion.
- **裁-79** finish #462 + #454; park #447 #448 #452 #456 #449 #460 with rows.
- **裁-80** Track B paused; P6-T ships the IA shell only.
- **裁-81 → 裁-87** Stripe: this session's claude.ai connector does the account-level objects from
  DB rows (TEST first); lanes build the code; keys env-to-env only.
- **裁-82 → 裁-85** the seat stays in the Claude Code session; lanes by fit (Codex for heavy
  execution, sonnet for bounded work, opus for judgement); a family that is out is substituted, builds
  included, recorded in the PR body. **裁-83** a reduced Wave G precedes beta. *(native only until
  beta live — 裁-133, 2026-09-02: no Codex lane of any kind, builds included; sonnet-5 xhigh
  bounded, opus-5 xhigh judgement/security/review; effort stays xhigh.)*
- **裁-84 → 裁-86** the lean ladder: ONE fresh-context opus review leg **+ a real-browser Playwright
  e2e leg on every frontend train**, the axe scan riding it. **裁-111 (2026-09-01):** the
  cross-family Codex adversarial leg is SUSPENDED until beta live — the opus lane is the complete
  gate meanwhile; law 28 resumes at beta unless the owner rules otherwise.
- Standing and untouched: 裁-57 paid beta · 裁-58 RM0/"trial" (never render "RM0") · 裁-62 tax inert
  · 裁-68 the tier-3 gate (DPA e-sign · rate wall · email-bound token · checkout success) ·
  裁-64①②③④ · 裁-65 P4-7 · Q1–Q9 + Q-A…F (08-27) · R1–R7 · 裁-1…裁-56.

## 4 · The thirteen open PRs — disposition

**SUPERSEDED BY EVENTS 2026-09-02 — all thirteen concluded: seven merged (08-31…09-01), six
ARCHIVED and CLOSED at 03:23Z under 裁-123, rounds WIP-committed to pushed refs and every
worktree removed. Resume from the PR comment + `archive-parked-lanes-2026-09-02.md` — NEVER from
a worktree.** The table below is the dated snapshot this sprint opened from, kept for the record.

| PR | What | Disposition | Where the bar lives |
|---|---|---|---|
| #451 | P4-2 scope spine | **FINISH** — round 9 drafted-uncommitted in worktree p4-2-cx; verify bar = the 16-probe RED-before table (restated in orders FS-1) | orders FS-1 |
| #461 | P4-3 entry group | **FINISH** — round 6 merge-gating: `Referrer-Policy: strict-origin` on /auth/confirm (never accept `Origin: null`) | orders FS-2 |
| #455 | P4-4 members/invites | **FINISH** — CLEAR both legs at `1a131a5a`; merge-forward onto #451 | orders FS-3 |
| #453 | P4-5 operator queue | **FINISH** — CLEAR at `b6359309`; retarget after #451; operator tooling, not the tier-3 path | orders FS-3 |
| #454 | P6-1 `chatTurn_v16` | **FINISH** — merge-prepped `c5e0fef7`; one fresh read-only review, then merge + Fly deploy | orders FS-6 |
| #462 | COA template apply (PR-b) | **FINISH** — round 2 uncommitted in worktree coa-prb; full suite + lint + push; true the interview copy in the same pass | orders FS-6 |
| #463 | COA PR-c (draft) | stays as built; reviews after #462 (裁-23 Q5: no agent bulk-apply) | orders FS-6 |
| #447 | `wake_open_firm_question` kind wall | **PARK** — Known-issues row | PROGRESS.md |
| #448 | `unique_violation` constraint_name | **PARK** — pushed head is CI-red as parked; row says so | PROGRESS.md |
| #452 | 裁-18b PR-3 (+ `0154`'s window) | **PARK** — `0154` stays unapplied; row | PROGRESS.md |
| #456 · #449 | G1 PR-2a / PR-2b | **PARK** (裁-76) — rows | PROGRESS.md |
| #460 | `/ready` hard-fail (裁-61) | **PARK** — the HA question first | PROGRESS.md |

**Parked means:** PR open and labelled paused; worktree untouched (the uncommitted diff IS the
round); never reset, never rebased by anyone else; resume only from its Known-issues row.

## 5 · The runway (build order; sizes in P3-lane units, 1.0 ≈ 20–40 files, full ladder)

| # | Train | Size | Order |
|---|---|---|---|
| 0 | Live-catalog verb census on a throwaway rig → amend 裁-72 (裁-75) | 0.3 | FS-0 |
| 1 | #451 P4-2 spine → #461 P4-3 entry (+ the `strict-origin` fix) → #455 P4-4 → #453 P4-5 | in PR | FS-1…3 |
| 2 | #462 COA apply (+ interview copy) · #454 `chatTurn_v16` + Fly deploy | in PR | FS-6 |
| 3 | **The checkout / signup-gate train** (裁-73/74/68/81) — its own design gate + security review FIRST (R8, 2026-08-26), then build | 0.5 FE + 0.4 BE | FS-4 |
| 4 | **The interview-runner port** (裁-78) | 0.7 | FS-5 |
| 5 | **Reports + close-prep chat tools** (`chatTurn_v17`) + F-A5b PR-3 PDF (裁-77) | 0.4 + 0.2 + 0.6 | FS-7 |
| 6 | P6-T tax IA shell + the honest-note sweep for paused lanes (裁-80) | 0.3 + 0.3 | FS-8 |
| 7 | P6-3 a11y/token finish · P6-4 money input · P6-5 agentic finish · P6-6 identity · P6-R hygiene | 0.8 · 0.6 · 0.7 · 0.6 · 0.3 | orders-p6 |
| 7b | The 09-02 gate additions (裁-116…128): tasks #14/#15/#16, the rail state bleed + thread re-point, client name in the header, route error boundaries, password recovery, the COA checklist apply button, the Q-D6 close-seal wall, FS-7 echelon 2 (PDF) | ≈1.5 + 0.3 DB + PDF | mohe-grill-rulings-2026-09-02.md |
| 8 | The third conformance pass (裁-9's P6 entry gate) | 0.3 | FS-9 |
| 9 | **P6-X cutover** — Workers deploy, DNS, 61-suite classification, the 裁-78 criterion | 0.5 + ceremony | FS-10 |
| 10 | **Reduced Wave G** — reset · apply `0155` · the 16-step walk · as-run → **beta** | ceremony | FS-11 |

Run at most **3–4 heavy lanes** concurrently (a full suite, a build or a rig each) — nine
concurrent lanes exhausted this host's process budget on 2026-08-31 (`0xC0000142`); stagger
full-suite gates.

## 6 · The laws you inherit (the ones that cost money to learn)

- **Verb-census-first, at the LIVE body** (rung 0): never cite a migration's first `CREATE`;
  chase `CREATE OR REPLACE`. **No affordance without a named backend verb; a missing verb renders
  a dated `NotBuiltNote` naming verb + lane — never a fake control.**
- **Hydrate-never-trust, no optimistic UI; the UI never sums a cent.** A `DoorRefusal` renders
  verbatim and is never retried.
- **RED-before for every wall**: write the mutant, see the cell red, record it. A test that stays
  green with the component deleted proves nothing. A cell that walks a LIST is proven by a mutant
  OUTSIDE the list.
- **Absence is not evidence; spelling is not identity** (review laws 2 and 3). A grep miss is a
  not-found-by-pattern.
- **Every dispatch pins a model** (`gpt-5.6-sol`, `model_reasoning_effort=xhigh`) *(native only
  until beta live — 裁-133, 2026-09-02: no Codex lane of any kind, builds included; sonnet-5 xhigh
  for bounded work, opus-5 xhigh for judgement/security/review; effort stays xhigh)*; every lane in
  its own worktree; never `pnpm install` inside a lane (junction the main checkout's
  `node_modules`); rigs are instance-unique throwaway `postgres:17` containers; **DSNs and keys come
  from the environment only, never argv, never a file in the repo.**
- **Migrations claim numbers at MERGE; workflow bodies are frozen once deployed** — a behavioural
  change to `chatTurn` is a new `_vN` export + a registry repoint (constraint 9); the freeze-lint
  enforces it.
- **The review ladder (裁-86, lean):** build → own suite green (the four commands) → RED-before
  proofs → push → **ONE fresh-context opus-5 xhigh read-only review** (its own context, refute-first;
  report shape in orders §A) → fold → the same reviewer re-verifies → the owner may read →
  `gh pr merge --squash` on green CI. **裁-111 (2026-09-01):** the cross-family Codex adversarial
  leg is SUSPENDED until beta live — the opus lane is the complete gate for the remainder of the
  sprint; law 28 resumes at beta unless the owner rules otherwise. **Every frontend train also
  walks its journey in a real browser (Playwright) on the BUILT app** — the e2e leg, with the axe
  scan riding it. Uniform for every code PR (ADR-061).
- **A deferral's only lawful home is a `PROGRESS.md` Backlog/Known-issues row** (ADR-0075 §6). A
  paused lane's `NotBuiltNote` is swept against that row, not against a merge that will not come.
- **Harness clock-out, every session:** true `PROGRESS.md` (posture · lanes · backlog · known
  issues), keep every harness file ≤ 500 lines (archive verbatim to
  `docs/plan/completed/progress-archive-*.md`), run `node scripts/check-harness-links.mjs`
  (backticked paths must exist), and record any ruling you needed from the owner in a dated
  ledger — never build around an ambiguity.
- **Design resources are consumed and NAMED** (orders-p4 §0.6/0.7): the ClaraBook token contract
  (ported verbatim into `apps/web/app/globals.css`), shadcn/Base UI base-nova, the Emil motion
  rules, Mobbin evidence for any new pattern, the three a11y gates (+ the target-size gate owed),
  light theme only, desktop-first. **Every PR body states which skills/MCP queries the surface
  consumed** — "none" is a valid, honest line. Check current official docs (context7 or a cited
  source) for Next 16 · `@opennextjs/cloudflare` · shadcn · `@supabase/ssr` · Stripe before
  building against remembered APIs.

## 7 · The owner's own acts (nothing here is yours to do)

1. Open the Stripe account; submit the Malaysian-entity KYB **today** (verification takes days;
   TEST mode does not wait for it). Authenticate the claude.ai **Stripe connector** in this session
   on the TEST-mode account (裁-87); give build lanes a TEST restricted key env-to-env; the LIVE
   key only at the launch sitting. **裁-126:** the sandbox account is **"BELCORT 沙盒"** for the
   whole beta journey; the TEST restricted key lives in the user's environment as
   `STRIPE_SECRET_KEY` (name only — the value is never printed or committed).
2. Supabase Auth settings per `docs/ops/wave-g-setup-checklist.md` (signup ON, redirect URLs
   exactly `/signup` + /auth/confirm, confirm-email ON, autoconfirm OFF, the signup-confirmation
   mail template in the 裁-92 6-digit-code form — the checklist's token-hash instruction is
   superseded for signup; the invite-accept link arm keeps its template — password policy, JWT
   900 s) — owner-proven with a receipt.
3. Cloudflare: account access for the Workers deploy (`clara-web`) and the `app.clarabook.com` DNS
   switch; Resend hardening per the checklist.
4. ~~Sign ADR-0077~~ — **DONE: signed at the 2026-08-31 evening sitting (裁-93)**, digest §14 is law.
5. The pricing sitting (the RM amounts, 裁-58) — before or after launch, the owner's date.

## 8 · Design law, and every resource you must consume (the owner's standing question)

**The design authority is the repo github.com/BELCORT-SDN-BHD/clarabook-frontend** (PR #1 merged
2026-08-26, `a7709883`; one open PR #2 on the brand guideline — re-fetch at FS-9). Owner rulings
Q1/Q4 (`mohe-grill-rulings-2026-08-27.md`): its output is **DESIGN LAW + prototype evidence**; the
production app is `apps/web` in THIS repo; the design system, brand, routing IA and screens are
**PORTED, never redesigned** — "no redesign should be needed" is the standard you are held to, and a
deviation exists only as an owner ruling (裁-N) recorded in a ledger, never absorbed. The prototype
is a Vite/JS app with a fixture adapter: port its CONTRACTS and its look, not its code (Q1 grounds:
no compile-time parts guard, a hand-rolled router, `createMutationIntent` never called).

**Read these, in that repo, before the first line of any surface** (paths are that repo's):
- **Founder decisions and gate status** — 01_FRONTEND_DECISION_LOG.md (the latest settled decision
  wins; brand-foundation changes need founder approval) · 00_FRONTEND_DESIGN_PROGRAM.md (scope and
  sequence) · 02_FRONTEND_GOVERNING_BRIEF.md · HANDOFF.md (the machine setup and the verification
  receipt: 14 contract tests, bundle budgets, 42/42 brand checksums).
- **Brand** — output/pdf/clarabook-brand-guideline-package-v1.0/public/ (the 25-page guideline PDF,
  the Ledger Fold platform mark, the Clara mascot — Clara is the agent, ClaraBook the platform; the
  identity canvas #F7F6F2 is for entry pages only; white-dominant product canvas) · g3-identity/ ·
  07_G3_1_IDENTITY_DIRECTION_REVIEW.md · 08_G3_2_LEDGER_FOLD_IDENTITY_SYSTEM_REVIEW.md.
- **Tokens and components** — g5-design-system/docs/01-TOKEN-CONTRACT.md (the contract
  `apps/web/app/globals.css` cites section by section: shell #F7F7F5 vs surface-subtle #F5F6F4,
  `--interaction` and `--focus` as separate roles, `--clara` reserved for Clara-actor attribution,
  Source Sans 3 / Source Serif 4 as local fonts, the space/radius/motion scales) ·
  02-COMPONENT-MATRIX.md · 03-PATTERN-CONTRACTS.md · 04-STATE-ACCESSIBILITY-CONTRACT.md ·
  05-FRONTEND-HANDOFF-BOUNDARY.md · the executable reference g5-design-system/clarabook-design-system/
  (**shadcn/Base UI first — never invent a competing primitive**).
- **The prototype, the descriptive parity reference** — g6-high-fidelity/clarabook-prototype/
  (every screen and component; the thread model; client switch as a security event) and its
  handoff/FRONTEND_BACKEND_CONTRACT.md + frontend-backend-manifest.json + frontend-action-manifest.json
  (the integration LAW: the browser never holds a service credential · a slug selects, UUID+RLS
  authorises · no exact verb = no enabled action · the browser computes no cents · revision +
  idempotency on every mutation · re-read after success AND failure · transport status before
  business refusal · unknown parts fail closed). `docs/plan/active/codex-frontend-handoff-errata-2026-08-27.md`
  trues seven stale rows of those manifests, and the verb census supersedes their journey table.
- **Reference provenance** — mobbin-evidence/ + 03_G1_PRIMARY_SOURCE_RESEARCH.md ·
  05_G2_MOBBIN_FOUNDATION_SAMPLE.md · 06_G2_COMPLETE_REFERENCE_REPORT.md · 09_G4_G6_REFERENCE_AND_PROCESS_BRIEF.md.
  **Mobbin evidence FIRST for any new UI/flow pattern**; references inform hierarchy and behaviour,
  never identity, scope or backend law. The in-repo grounding files
  (`docs/plan/active/p4-mobbin-grounding-2026-08-28.md`, `docs/plan/active/mobbin-grounding-wave-2026-08-28.md`)
  show the expected shape: cited screens → takeaways mapped to EXISTING components → named anti-patterns.
- **Change control** (PR #1 §8) binds here too: **A** brand-foundation (founder approval + decision-log
  entry + regenerate the package and checksums) · **B** design-system foundation (shadcn base; token,
  doc and executable reference move together; founder approval if the visual language moves) ·
  **C** product flow/page (manifest check, Mobbin first, preserve the firm/client boundary and
  full-screen Clara resolution, reuse components, update manifests and tests, no fixture-only action
  may look authoritative) · **D** adapter/integration (exact settled contracts only). PR #1 §9's
  review checklist is part of every frontend PR's self-review.

**Already ported into this repo — keep it that way:** `apps/web/app/globals.css` (tokens byte-verbatim
from `a86e48a`) · `apps/web/components.json` base-nova · the root `eslint.config.mjs` (the raw-colour and
default-palette ban scoped to `apps/web`'s app/ and components/ trees) · the three a11y gates (`apps/web/scripts/check-token-contrast.mjs`,
`apps/web/test/a11yRules.ts`, `apps/web/test/keyboardWalk.ts`; the WCAG 2.2 target-size gate is
owed at P6-3) · `apps/web/AGENTS.md` house laws · R4's StateBanner-over-toast and prose-state laws
(`apps/web/components/common/state.tsx`) · the two dialog-testing laws · light theme only (a beta
ruling) · desktop-first + the mobile corridor (Q6) · next-intl for every string. **Ruled deviations
from the prototype — cite them, never "fix" them back:** Q2 rail-first with thread escalation (the
prototype's Clara-as-modal Sheet rejected) · Q3 the two-level IA (its "data library" folds into
documents/knowledge) · Q5 three-layer i18n (its English-only line superseded) · R7 onboarding as the
in-thread interview (its wizard routes superseded) · R3/裁-1 the focus ring unified on shadcn at 70%
· 裁-64③ the offset Button ring · 裁-2 4c the `--input` recut (origin: that repo, then re-port).

**The vendored skills (plain markdown you can read; open the SKILL.md before building a surface of
that kind):** `.claude/skills/emil-design-eng` (motion explains change · immediate feedback · visible
focus · no decorative perpetual animation) · `.claude/skills/animate` · `.claude/skills/animation-vocabulary`
· `.claude/skills/review-animations` · `.claude/skills/improve-animations` ·
`.claude/skills/find-animation-opportunities` · `.claude/skills/apple-design` · `.claude/skills/ask-sonner`
· `.claude/skills/shadcn` (+ its rules, CLI and registry notes) · `.claude/skills/design-an-interface`
· `.claude/skills/codebase-design` · `.claude/skills/tdd` · `.claude/skills/prototype` · `.claude/skills/qa`.
The plugin skills `impeccable` and `frontend-design` are available to this session (Claude plugins)
— use them for the per-surface polish/acceptance lens of Q9's DONE rung 4; a Codex build lane cannot
read them, so the orchestrator applies that lens at review, beside `emil-design-eng` +
`apple-design` + the prototype parity pass (FS-9).

**The MCP servers this session holds** (`.mcp.json` + the claude.ai connectors; the owner connects
them in-session, 裁-87): **mobbin** (reference grounding) · **shadcn** (registry queries) ·
**codebase-memory-mcp** (the code graph, constraint 7) · **context7** (the newest official docs for
Next 16 · `@opennextjs/cloudflare` · shadcn · `@supabase/ssr` · Stripe, before building against a
remembered API) · **Playwright / Claude-in-Chrome** (the e2e leg, 裁-86) · **the Stripe connector**
(TEST-mode account, 裁-87). The orchestrator does the grounding and hands each lane a cited order; a
Codex lane that itself needs Mobbin or Stripe mounts them per the orders' §B. **Every PR body
carries the line "Skills/MCP consumed: …"** — "none" is honest; a named-but-unused skill is a
false claim.

## 9 · What "beta-ready" means (the definition of done)

All sixteen happy-path steps walk end to end on the reset estate with the desktop corpus —
signup → checkout (test price, test card) → firm born → members invited → client onboarded through
the in-thread interview → documents posted unattended → bank matched in chat → fiscal year opened
→ year-end closed with human keys → management-accounts PDF downloaded → FY2 opened — each step
receipted, the as-run written in `docs/plan/completed/`, the cutover's route-by-route proof and
61-suite classification attached, every paused lane visible as an honest note with a row, and
`PROGRESS.md` trued. Then the domain points at `apps/web` and the first invited firm signs up.
