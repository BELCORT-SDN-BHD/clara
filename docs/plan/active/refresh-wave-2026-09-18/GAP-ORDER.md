# Gap-map work order — wave 2026-09-18 (read-only census, one ticket per worker)

You are writing the **gap map** for ONE ticket of the #612 refresh spec. A gap map is the verified
current-state census the orchestrator writes the implementation brief from. It is **read-only**:
you open source, run `git log/show/blame`, `gh issue view`, `codebase-memory-mcp` queries and
`node -e` parsers over manifests. You do **not** edit any tracked file, do not check out branches,
do not run migrations, tests, builds or Playwright, do not touch `C:\Users\zhant\Desktop\clara-wt\*`
(the implementation rigs are being built while you read). Base commit: **`abcc5030`** in the main
checkout `C:\Users\zhant\Desktop\clara-rebuild`. Reason at maximum effort; every claim carries a
`path:line` you opened in this pass, or is labelled **unverified**.

## 1. Read, in this order

1. Your ticket with comments: `gh issue view <n> --comments`. Every acceptance criterion and every
   "Historical obligations" row is a line you must disposition.
2. The spec body and appendices, saved locally (read the whole appendix C row for your journeys,
   the appendix D rows for every component your journey names, and the appendix A/B rows your
   ticket cites by id):
   - `C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\spec\612-body.md`
   - `...\scratchpad\spec\appendix-C-journeys.md` · `appendix-D-components.md` · `appendix-E-map.md`
   - `...\scratchpad\spec\comment-5589270292.md` (A.1) · `comment-5589270908.md` (A.2) · `comment-5589271633.md` (B)
   - Wayfinder controlling decisions: `comment-5581778992.md` (Accounting Work) · `comment-5582778719.md`
     (complete accounting operations) · `comment-5583365852.md` (Client Knowledge) ·
     `comment-5583995499.md` (navigation/components) · `comment-5585923205.md` (dashboard
     definitions) · `comment-5587196374.md` (frontend flows) · `comment-5587677017.md` (A Home + B
     Work) · `comment-5588548302.md` (runtime route) · `comment-5588831144.md` (direct-debit scope).
3. `docs/PRD.md` (whole), `docs/ARCHITECTURE.md` (whole; §4 lock order and role roster, §5 data
   flows, §6 trade-offs and "刻意不做的事", §7 accepted-but-unimplemented), `CONTEXT.md` (the terms
   your domain uses), `AGENTS.md`.
4. The previous wave's rulings, because they bind this one unless the orchestrator overturns them:
   `docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md` (§0 D1–D13, §1 frozen-body plan, §2
   per-ticket rulings, §3 ratifications), `SYNTHESIS.md` §0–§2, `WORK-ORDER.md` (the house rules
   implementers live under — your slice must be buildable under them), and `gap-649.md` +
   `brief-649.md` as the **shape** to copy.
5. The module READMEs for the modules you touch: `packages/db/README.md`, `packages/db/tests/README.md`,
   `packages/runtime/README.md`, `apps/web/README.md`; `frozen-workflows.json` and
   `scripts/check-frozen-workflows.mjs` (header) for the freeze law; `packages/runtime/workflows/registry.ts`
   for the pins (`chatTurn_v20`, `claraWork_v4`, `clientOnboarding_v5` at base).
6. The migrations that create and later splice every door, table, trigger and check your slice
   touches (`grep -n` across `packages/db/migrations/*.sql`; a live function body is often NOT its
   creating file's text — record the splice history: created in X, recut in Y, Z). The frontier at
   base is **0224** (219 files).
7. The existing tests that already cover your journey (db battery names and cell ids, runtime
   `tests/*.mjs`, web `tests/*.test.tsx`, Playwright `e2e/*.spec.ts` + `*-mock.mjs`).
8. Open tickets that overlap your scope: `gh issue list --state open --label ready-for-agent --limit 200 --json number,title`
   and read every one whose title touches your domain (the orchestrator names the known ones in your
   prompt). Overlap is a **boundary to draw**, never a reason to build the other ticket's slice.

## 2. House facts you carry (do not re-derive; cite them)

- Migrations are append-only, numbered by the **orchestrator** at synthesis. Write "ONE new
  migration (number assigned by SYNTHESIS)" — never pick a number. A recut of a governed function
  must pin its **live** body by pre-image sha256 in the prestate (measured on a rig, never
  transcribed) and re-prove owner / SECURITY DEFINER / fixed `search_path` / ACL in the tail.
- Frozen workflow bodies and their transitive relative-import closure are immutable
  (`frozen-workflows.json`, `deployed:true`). Behaviour changes ship as a new `_vN` body cut ONCE
  per wave by the integration worker; an implementer writes a **successor contract** (exact tool
  name, zod input, door call with argument order, refusal mapping, part kind, prompt stanza) and
  delivers the database door + a NEW runtime module outside every frozen closure + the human web
  door. Anything a frozen body imports freezes on import; durable rules go in the migration.
- Lock order `accounting_plans → accounting_work → agent_tasks → agent_interruptions`; integer
  cents; `Asia/Kuala_Lumpur` calendar days; FORCE RLS and no app-role DML; roles in
  `packages/db/deploy/roles-bootstrap.sql`; human doors are `clara_authenticated` + `_human_ctx`
  floors, agent doors are `clara_runtime` + actor-explicit `_for` twins with live-authority recheck.
- `accounting_work.purpose` is a closed IN-list in the posting core (`0195:1711`; DECISIONS
  2026-09-15 §1.3 forbade recutting the core THAT wave). If your slice needs a new purpose or a core
  recut, say exactly which functions, their splice history and the blast radius — the orchestrator
  decides whether this wave recuts.
- Retired lanes: the vendor-binding proposal lane (O37 / D6) and the 0045 adjustment-template lane
  (#927→#929 in flight) are retired workflows — propose nothing inside them; check LEGACY marks in
  `apps/web/lib/navigation/tree.ts` before proposing an entrance.
- `docs/PRD.md` and `docs/ARCHITECTURE.md` are never edited by implementation. Where your ticket
  builds what the blueprint lists as deferred or describes differently, record **blueprint drift**
  with the exact line.
- Shared files other lanes edit concurrently (one-line registrations only): `apps/web/e2e/serve-built.mjs`,
  `apps/web/e2e/e2e-fixture-ownership.test.ts`, `apps/web/lib/navigation/tree.ts`,
  `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `packages/db/tests/rig-meta.mjs`,
  `packages/db/package.json` (gate chain), `.github/actions/db-live-gates/action.yml`, `CONTEXT.md`.
- UI: shadcn `base-nova` over Base UI; production-installed components are listed in appendix D;
  adding one goes through `pnpm --filter @clara/web ui:add` (`apps/web/scripts/ui-add.mjs` guards
  it); Field/FieldGroup for new inputs; StateBanner / inline Alert for refusals; no Sonner; no
  Vercel AI Elements (Clara's parts are her own typed `PartRenderer` kinds).
- Evidence law: a skipped frontier-gated battery is not evidence; local ≠ hosted; every AC closes
  with a red-first cell, a browser-walk leg, or a **named** residual.

## 3. Output — write `docs/plan/active/refresh-wave-2026-09-18/gap-<n>.DRAFT.md`

Copy `gap-649.md`'s section order exactly:

1. Title + one-line journey path; reconciliation note (which lenses reviewed it — filled by the reconciler).
2. **大白话** — 6–12 lines of plain Chinese for the owner: what the ticket makes happen for an
   accountant, what exists today, what is missing, what the hard call is. Concrete example
   (a client name, an amount) beats an abstract rule.
3. **Acceptance** — a table, one row per AC: `to build` / `partial` / `verify-only` / `descoped
   (authority)`, with today's `path:line`.
4. **Historical rows** — one row per historical obligation id: what it asked, what is true today,
   disposition.
5. **Current state by module** — DB (tables, doors with signatures, grants, floors, splice
   history), Runtime (routes, workflows, libs, frozen or not), Web (routes, components, hooks,
   parts), Tests (what exists, cell ids).
6. **Frozen-body verdict** — does the slice need a `chatTurn_v21` / `claraWork_v5` / other
   successor? Name each tool or step with its exact contract, and what ships WITHOUT the cut.
7. **Pinned function recut** — every governed function the slice must recut, with creation file
   and every splice (file:line), and the signature-overload hazards (`0103:1055-1070` census).
8. **Overlaps** — a table: ticket (this wave's other nine AND open follow-ups), what is shared,
   shared paths, the boundary you propose.
9. **Proposed slice** — Migration (one additive file; every object, door signature, floor, grant,
   trigger, check, event, tail assertion, gate module, `rig-meta` cohort), Runtime (new non-frozen
   modules, route edits, successor contract stanza), Web (routes, components, states: loading /
   successful-empty / no-results / partial-stale / invalid-saving / denied / failed /
   cancelled-recovery; 320px; 200%; keyboard/focus; SR names; reduced motion; URL/Back; drafts),
   Docs (CONTEXT terms in "term / _Avoid_" shape, READMEs).
10. **Tests** — the red-first cells by id (`p<n>.<area>.<name>`), the runtime World leg, the web
    unit files, the Playwright walk + mock and the RPC verbs the mock answers.
11. **Effort** — S / M / L / XL with the reason.
12. **Questions** — ONLY questions whose answer changes what gets built. Each: 大白话 framing (the
    question, today, the recommendation, the cost of the alternative), then the code names. One
    recommendation per question.
13. **Risks** — merge collisions (exact files), census suites that will red, blast radius.
14. **Unverified** — everything you could not open or measure, and why.
15. **What the refuters changed** — filled by the reconciler.

Return, as your final message, a JSON object matching the schema you were given (a compact
summary of the map: paths, verdicts, questions, effort). The file is the deliverable; the JSON is
the orchestrator's index into it.
