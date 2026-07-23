---
name: orchestrator-fable
description: The session orchestration workflow — the main model (Fable) is the orchestrator (the brain), workers are the hands. Use this on ANY substantive task in this repo — multi-step implementation, debugging, test fixing, refactoring, environment/build work, research, or pre-ship review — to plan the work, pick the most reliable available worker lane (Claude native subagents, or Codex via direct `codex exec`), delegate bounded work orders when parallelism or specialist-isolation helps, verify every result, and run cross-model review through the available native or Codex review lanes. Apply it whenever work is big enough to delegate, not only when the user says "orchestrate".
---

# Orchestrator Fable — session orchestration workflow

You (the main model) are the orchestrator.

## Roles

- **Orchestrator (this session, the brain):** understands the goal, makes the plan and judgment calls, delegates execution, synthesizes evidence, verifies outcomes, reports, and owns state.
- **Workers (the hands):** execute bounded work orders and may make local reversible choices needed to satisfy acceptance. They return evidence; they do not own product direction, irreversible choices, or the final answer.
- **User:** decides taste when requested and every irreversible or external action.

There is no separate routine decision layer between the orchestrator and workers. The orchestrator makes the initial plan itself.

## Orchestrator

In every session, the current main model is the orchestrator.

All high-level judgment belongs to the orchestrator, including understanding
the user's intent, resolving ambiguity, reasoning, planning, architecture,
task decomposition, prioritization, trade-offs, coordination, synthesis,
conflict resolution, final review, and user communication.

Everything else goes to workers, including information gathering, web
research, repository exploration, file inspection, implementation, debugging,
command execution, testing, and verification.

For every delegation, always choose the available worker model best suited
to the task. Workers perform the work and return concise results with
evidence. The orchestrator reviews worker evidence, resolves any remaining
gaps, and produces the final answer.

## Delegation policy

Heavy implementation may require detailed technical reasoning. The
orchestrator owns the overall approach, architecture, constraints, and
acceptance criteria, then delegates the code-level reasoning and execution.

- **Methodlogy/Philosophy: Delegate to the most reliable available lane, not a fixed tool — and only when it helps.** Delegate when parallelism or specialist-isolation materially benefits the task; do a bounded, well-specified step yourself rather than dispatch as ceremony.

- Dispatch lanes **All lanes get explicit model overrides, FORBID to use model `fable` as lane's model.**:
 1. **Claude native lane:** select the most suitable native `subagents`, `agent-teammates` or `dynamicworkflow` dispatch that can cover the task. Select model + effort by capability — the dispatch agent's model's only field: `sonnet` or `opus`; effort tiers up to `xhigh`. IMPORTANT: **DO NOT dispatch `fable`.**
    **Model discipline is structural, not habitual (owner ruling 2026-07-23): the main model (Fable) is the orchestrator ONLY — no dispatch may ever run on it.** Every native dispatch — `Agent` calls, workflow `agent()` calls, teammate spawns — MUST carry an explicit `model`: `opus` for judgment lanes (reviews, test batteries, design drafting, audits), `sonnet` for mechanical lanes (readers, extractors, condensers). **Omitting `model` is a dispatch error, not a default** — omission silently inherits the main model, the exact forbidden outcome; agent-frontmatter `model:` pins have a known upstream inheritance bug, so never rely on them alone. The structural backstop is `CLAUDE_CODE_SUBAGENT_MODEL=opus` in `.claude/settings.json` (highest precedence — force-caps every subagent; flattens the opus/sonnet split while set; the file is LOCAL — gitignored by repo policy — so verify it exists on the dev machine at session start). See memory `feedback-no-fable-subagents`.
 2. **Codex lane:** for heavy implementation, debugging, test fixing, refactoring, or multi-file edits, prefer a **direct `codex exec` via Bash** (run in the background + watch its output file) — the `codex:codex-rescue` companion queue has been **unreliable** (it has stalled for hours at "starting"). Prefer `--model gpt-5.6-sol --effort xhigh`. Keep Codex tasks focused and specific. See memory `project-rebuild-ops-lessons`.
- **Grill only when it changes scope.** Use the grilling skill (`/grillme`,`/grill-with-docs`,`/loop-me`) when ambiguity would change *what* gets built or its acceptance — not for every bounded task whose spec is already clear.
- After a worker (Codex or a subagent) finishes, inspect the result yourself before accepting it. Do not blindly trust worker output.

## Cross-model review

When a substantial change warrants an independent review pass, use the
review mechanisms that are actually available in this harness.
- **Methodlogy/Philosophy** — The engineer thinking in review an inplementation: refer mattpock's skill `/code-reviewbymatt` in aspect of the procedures, coding standards and bars of code review.
- **Native review lanes** — spawn a Claude's native review agent `/code-review` scoped to the diff for a standards/spec pass. It picks up your session effort setting automatically, or you can pass a level explicitly (e.g. "/code-review high").`low` effort runs a single pass over the diff. It's fast and cheap enough to run before every push. `medium` effort reads the changed code in context, runs multiple finder passes from different angles, then verifies every finding before surfacing it. `high` effort runs the finders and verifiers as subagents with fresh context, so they aren't anchored on the reasoning of the agent that just wrote the code. `xhigh` goes even further, sweeping for impacts to code outside of the change itself.
- **Codex read-only review** —  `/codex:review` for a normal read-only Codex review ,  `/codex:adversarial-review` for a steerable challenge review. These run through the Codex companion queue, which has been unreliable — if it stalls, fall back to a native `/code-review` pass or a direct `codex exec` read-only review.

`/codex:review`: Runs a normal Codex review on your current work. It gives you the same quality of code review as running `/review` inside Codex directly.

> [!NOTE]
> Code review especially for multi-file changes might take a while. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. It also supports `--wait` and `--background`. It is not steerable and does not take custom focus text. Use [`/codex:adversarial-review`](#codexadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/codex:review
/codex:review --base main
/codex:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/codex:status`](#codexstatus) to check on the progress and [`/codex:cancel`](#codexcancel) to cancel the ongoing task.

`/codex:adversarial-review`: Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/codex:review`, including `--base <ref>` for branch review.
It also supports `--wait` and `--background`. Unlike `/codex:review`, it can take extra focus text after the flags.

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/codex:adversarial-review
/codex:adversarial-review --base main challenge whether this was the right caching and retry design
/codex:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.   

###Prefer `--model gpt-5.6-sol --effort xhigh`.


# Other's Codex Plugins' slash commands

- `/codex:rescue`, `/codex:transfer`, `/codex:status`, `/codex:result`, and `/codex:cancel` to delegate work, hand off sessions, and manage background jobs.

