# Prototypes

Throwaway experiments kept as evidence of what was tried and what it proved. None of this is
production code, none of it is built or tested by CI, and nothing here imports from the live
application or is imported by it.

| Directory | What it proved | Provenance |
|---|---|---|
| `clara-visual/` | The A+B visual direction for the Clara rail: a chat surface built from the message, bubble, questionnaire, attachment, marker, chart and message-scroller primitives, with three captured variants at desktop and narrow width. Sources are under `src/`, laid out as they sat in the web app. | Published 2026-09-18 from `codex/prototype-clara-visual` @ `8f72de0d` |
| `agent-harness-validation/` | That a Workflow durable agent survives a real process restart on a supported-runtime Postgres World, that the tool loop resumes, and where the runtime boundary sits. Carries its own `last-pass.json` records. | Published 2026-09-18 from `codex/research-agent-harness` @ `2d34cd3e` |
| `workflow-agent-candidate/` | A minimal import check for the candidate agent package. | Published 2026-09-18 from `codex/research-agent-harness` @ `2d34cd3e` |
| `native-workflowagent-v1/` | The native Workflow agent shape, with its own integration test. | Already in the repository |
| `accounting-work-interaction.html` | The Accounting Work interaction model, as a single self-contained page. | Already in the repository |
| `agent-harness/` | A retained runtime-boundary pass record. | Already in the repository |

**Why they were republished.** The 2026-09-08 research phase ran in separate branches and sibling
working directories. Its reports were merged; these artifacts were not, so
`refresh-2026-09-08-phase-handoff.md` recorded that the prototype branches "remain local: a new
clone cannot fetch their unpushed hashes" and asked for them to be transferred before anyone
relied on them. That was done on 2026-09-18 and the branches were then deleted.

**Reading the two rescued prototypes.** The `clara-visual` sources were extracted from the web app
tree, so their import paths assume that tree; they are reference material, not a runnable app in
this location. The `agent-harness-validation` rig is runnable, but the commands in
`refresh-2026-09-08-agent-harness-validation.md` name the original sibling directory and its
scratch toolchain paths, which no longer exist; treat the recorded passes as the evidence and
re-derive the paths if you re-run it.
