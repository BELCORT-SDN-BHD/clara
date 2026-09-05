# Domain Docs

How the engineering skills (mattpocock/skills) should consume this repo's domain documentation.

**This repo uses a lean single-source harness rooted at `CLAUDE.md`.** Before exploring or proposing work, read the relevant harness doc (via the `CLAUDE.md` "Where the truth lives" table) and query the codebase graph.

## Before exploring, read these (in order of relevance to the task)

- **`AGENTS.md`** (repo root) — the agent entry point: the fourteen hard constraints (numbered 1–15 with 12 vacant), the menu of where truth lives, the working protocol. (`CLAUDE.md` only imports it.)
- **`docs/product/PRD.md`** — what Clara is, users, scope, and the product invariants that are LAW (§6). The domain glossary lives here.
- **`docs/ARCHITECTURE.md`** — the target backend map: the event spine, the four structural invariants, the data plane, the AI-SDK 7 + Workflow-DevKit runtime, reporting. Appendix A = the Slice-0 spike results + the binding workflow-versioning policy.
- **`docs/plan/index.md`** — the plan index: live contracts and design docs under `docs/plan/active/`, closed ones under `docs/plan/completed/`. Current posture and the backlog live in `PROGRESS.md`.
- **`docs/design/PRODUCT_DESIGN.md`** — the design source-of-truth (two-pane Agentic OS, typed `parts[]`, card catalog, a11y/perf floors).
- **`docs/adr/`** — the append-only decision log, one file per ADR (start at `docs/adr/README.md`'s digest). Read the ADRs that touch your area; if your change contradicts one, surface it rather than silently overriding, and add a new ADR.
- **`docs/audit/`** — the Gate-1 audit of the frozen prior build (11 failure patterns, salvage manifest, owner rulings) — the "why the rebuild is shaped this way" evidence.
- **codebase-memory graph** (project `C-Users-zhant-Desktop-clara-rebuild`) — for live CODE structure (functions, callers, routes, imports), query the graph (`get_architecture` / `search_graph` / `trace_path`) first; cheaper and fresher than file-by-file reading.

The frozen prior build (`C:\Users\zhant\Desktop\initial acc software skillmd` + Supabase `belcort-shared`) is READ-ONLY audit evidence — reference it via `docs/audit/`, never modify it.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the terms as defined in `docs/product/PRD.md` (e.g. *journal entry*, *auto-draft*, *needs_review*, *client KB rule / wiki*, *output SST*, *reverse-not-delete*, *structural invariant*, *maker/checker*, *context pack*). Don't drift to synonyms.

## Flag ADR conflicts

If your output contradicts an existing decision in `docs/adr/`, surface it explicitly rather than silently overriding:

> _Contradicts ADR-00X — but worth reopening because…_

Then, once a decision is made, record it as a **new** ADR (append-only; supersede, never rewrite). Decisions go in `docs/adr/`; **status/progress goes in `PROGRESS.md`, not the ADR log.**
