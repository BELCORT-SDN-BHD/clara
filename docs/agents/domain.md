# Domain Docs

How the engineering skills (mattpocock/skills) should consume this repo's domain documentation.

**This repo uses a lean single-source harness rooted at `CLAUDE.md`.** Before exploring or proposing work, read the relevant harness doc (via the `CLAUDE.md` "Where the truth lives" table) and query the codebase graph.

## Before exploring, read these (in order of relevance to the task)

- **`CLAUDE.md`** (repo root) — the harness index: where everything lives, the cardinal invariants, the working protocol, boundaries.
- **`docs/prd/PRD.md`** — what Clara is, users, scope, and the product invariants that are LAW (§6). The domain glossary lives here.
- **`docs/architecture/ARCHITECTURE.md`** — the target backend map: the event spine, the four structural invariants, the data plane, the AI-SDK 7 + Workflow-DevKit runtime, reporting. Appendix A = the Slice-0 spike results + the binding workflow-versioning policy.
- **`docs/plan/REBUILD-PLAN.md`** — the Phase 3–5 slice plan, gates, and Phase-5 verification.
- **`docs/design/DIRECTION.md`** — the design source-of-truth (two-pane Agentic OS, typed `parts[]`, card catalog, a11y/perf floors).
- **`docs/PROJECTLOG.md`** — the append-only ADR-style decision log. Read the ADRs that touch your area; if your change contradicts one, surface it rather than silently overriding, and add a new ADR.
- **`docs/audit/`** — the Gate-1 audit of the frozen prior build (11 failure patterns, salvage manifest, owner rulings) — the "why the rebuild is shaped this way" evidence.
- **codebase-memory graph** (project `C-Users-zhant-Desktop-clara-rebuild`) — for live CODE structure (functions, callers, routes, imports), query the graph (`get_architecture` / `search_graph` / `trace_path`) first; cheaper and fresher than file-by-file reading.

The frozen prior build (`C:\Users\zhant\Desktop\initial acc software skillmd` + Supabase `belcort-shared`) is READ-ONLY audit evidence — reference it via `docs/audit/`, never modify it.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the terms as defined in `docs/prd/PRD.md` (e.g. *journal entry*, *auto-draft*, *needs_review*, *client KB rule / wiki*, *output SST*, *reverse-not-delete*, *structural invariant*, *maker/checker*, *context pack*). Don't drift to synonyms.

## Flag ADR conflicts

If your output contradicts an existing decision in `docs/PROJECTLOG.md`, surface it explicitly rather than silently overriding:

> _Contradicts PROJECTLOG ADR-00X — but worth reopening because…_

Then, once a decision is made, record it as a **new** ADR (append-only; supersede, never rewrite). Decisions go in PROJECTLOG; **status/progress goes in memory + `docs/plan/`, not the ADR log.**
