# Vendored: mattpocock/skills

This repo **vendors** Matt Pocock's skill pack (git-tracked under `.claude/skills/`, flat — not `skills/<bucket>/<name>/`) on purpose: every lane and CI job needs the same skill text without a network fetch, and freeze-lint-style provenance requires the content to sit in our own history. Upstream also documents two non-vendored install paths this repo does NOT use: `claude plugins install mattpocock-skills` and `npx skills@latest add mattpocock/skills`.

**Tracks:** github.com/mattpocock/skills @ `3cca18b368ae95cdbdebbff572ccafa662551015`
(2026-09-04, CHANGELOG.md `mattpocock-skills` v1.2.3).

## Name map (local flat name = upstream bucket/name)

| Local | Upstream | Why renamed |
|---|---|---|
| `code-reviewbymatt` | `engineering/code-review` | avoids colliding with Claude Code's built-in `/code-review`; the SKILL.md `name:` line is the ONLY deviation from upstream HEAD anywhere in the skill — `agents/openai.yaml` (Codex `display_name`) is byte-exact to upstream's "Code Review" by owner ruling (2026-09-06 fold) |
| `writing-for-agents` | `productivity/writing-for-agents` | 1:1 as of 2026-09-06 — was vendored as `writing-great-skills` until then (upstream's own clean rename from `writing-great-skills`, 2026-07-23); the owner ruled to adopt the upstream name outright since a repo-wide grep found zero references to the old local folder name |
| everything else (35 skills — 43 mattpocock-origin, less 6 retired-upstream, less these 2 renamed) | same leaf name, `engineering/` `in-progress/` `misc/` or `productivity/` | 1:1 |

## Vendored per upstream bucket (37 dirs upstream; 33 mapped to local + 4 net-new)

- **engineering** (18/18 mapped): ask-matt, code-review→code-reviewbymatt, codebase-design,
  diagnosing-bugs, domain-modeling, grill-with-docs, implement, improve-codebase-architecture,
  prototype, research, resolving-merge-conflicts, setup-matt-pocock-skills, tdd, to-spec,
  to-tickets, triage, wayfinder, wizard
- **in-progress** (6/8 mapped, 2 added): claude-handoff, loop-me, setup-ts-deep-modules,
  writing-beats, writing-fragments, writing-shape — **added**: `implement-spec`, `retro`
- **misc** (4/4 mapped): git-guardrails-claude-code, migrate-to-shoehorn, scaffold-exercises,
  setup-pre-commit
- **productivity** (5/7 mapped, 2 added): grill-me, grilling, handoff, teach,
  writing-for-agents — **added**: `to-questionnaire`, `wait-what`

## Upstream-retired skills — DELETED here 2026-09-06 (owner: 「都删, 旧的, stale, drift 的都删」)

All six came from one upstream commit, `c66bdee` (2026-08-05, "remove six unused skills and
the personal bucket"); none were ever in the Claude Code plugin. #566 kept them pending the
owner's word; the word came the same day and the six directories are gone (the lock regenerated).
The two historical plan documents that named them were re-worded to plain text so the
harness-links gate stays green:

- design-an-interface → absorbed by `codebase-design` (ships as `DESIGN-IT-TWICE.md`)
- qa → absorbed by `triage` + `to-tickets`
- request-refactor-plan → absorbed by `to-spec` + `improve-codebase-architecture`
- ubiquitous-language → absorbed by `domain-modeling`
- edit-article, obsidian-vault → personal to Matt (the latter hardcoded his own vault path); deleted upstream with the `personal/` bucket

## Resolved decisions (fold, 2026-09-06)

1. `code-reviewbymatt/agents/openai.yaml` stays byte-exact to upstream ("Code Review"); the
   local branding lives only in the folder name and the SKILL.md `name:` line.
2. `writing-great-skills/` renamed to `writing-for-agents/` (folder + SKILL.md `name:`),
   adopting the upstream name outright — no duplicate folder.
3. The six upstream-retired skills stay; deletion is the owner's call, not this vendoring's.
4. `AGENTS.md` now carries the `## Agent skills` block (its last section) and
   `docs/agents/issue-tracker.md` carries upstream's "Wayfinding operations" section for
   `/wayfinder` — see the PR body for both blocks verbatim.

Non-mattpocock skills sharing `.claude/skills/` (untouched by this vendoring's file content):
animate, animation-vocabulary, apple-design, ask-sonner, emil-design-eng,
find-animation-opportunities, improve-animations, review-animations, shadcn, orchestrator-fable.

## Update recipe

1. Clone upstream with full history to a scratch dir; note `git rev-parse HEAD` + date.
2. Per local mattpocock-origin file: `git hash-object` it, then check the sha exists anywhere
   in upstream history (`git cat-file -e`) — pristine vs. locally modified.
3. For every pristine file whose skill still exists upstream, checkout upstream HEAD's copy
   (`git checkout <upstream-remote>/main -- <path>`) and `git mv` it into the flat local slot;
   never overwrite a locally-modified file.
4. Add any upstream skill dir missing locally, flat, byte-exact.
5. Re-run the gates below; `git status --short` should show only `.claude/skills/**`.
6. Regenerate `skills-lock.json` (`node scripts/gen-skills-lock.mjs`); `--check` first to confirm drift.

**`skills-lock.json`** (repo root, `scripts/gen-skills-lock.mjs`) hashes every skill listed above,
mattpocock or not; not wired into `pnpm lint`/CI. `--check` reported DRIFT before this vendoring
touched anything — last generated at `585346f0` (#246), never since. Regenerated (owner ruling,
2026-09-06 fold #2): the diff covers every skill this PR refreshed/added/renamed, **plus two things
unrelated to this PR that the stale lock had simply never caught up to** — `orchestrator-fable`'s
hash moved from two later, already-merged, unrelated edits (`7ea479ad` #339, `18aba67d` #506), and
the nine non-mattpocock skills above appear as new rows since the lock predates their addition.
