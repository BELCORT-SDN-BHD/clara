# Vendored: mattpocock/skills

This repo **vendors** Matt Pocock's skill pack (git-tracked under `.claude/skills/`, flat —
not `skills/<bucket>/<name>/`) on purpose: every lane and CI job needs the same skill text
without a network fetch, and freeze-lint-style provenance requires the content to sit in our
own history. Upstream also documents two non-vendored install paths this repo does NOT use:
`claude plugins install mattpocock-skills` and `npx skills@latest add mattpocock/skills`.

**Tracks:** github.com/mattpocock/skills @ `3cca18b368ae95cdbdebbff572ccafa662551015`
(2026-09-04, CHANGELOG.md `mattpocock-skills` v1.2.3).

## Name map (local flat name = upstream bucket/name)

| Local | Upstream | Why renamed |
|---|---|---|
| `code-reviewbymatt` | `engineering/code-review` | avoids colliding with Claude Code's built-in `/code-review` |
| `writing-great-skills` | `productivity/writing-for-agents` | upstream did a clean rename (2026-07-23, no alias); we kept the old local folder name — see "Open decision" below |
| everything else (31 skills) | same leaf name, `engineering/` `in-progress/` `misc/` or `productivity/` | 1:1 |

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
  writing-for-agents→writing-great-skills — **added**: `to-questionnaire`, `wait-what`

## Local-only skills (upstream retired them; kept here, owner to rule on deleting)

All six came from one upstream commit, `c66bdee` (2026-08-05, "remove six unused skills and
the personal bucket"), none were ever in the Claude Code plugin:

- `design-an-interface` → absorbed by `codebase-design` (ships as `DESIGN-IT-TWICE.md`)
- `qa` → absorbed by `triage` + `to-tickets`
- `request-refactor-plan` → absorbed by `to-spec` + `improve-codebase-architecture`
- `ubiquitous-language` → absorbed by `domain-modeling`
- `edit-article`, `obsidian-vault` → personal to Matt (the latter hardcoded his own vault path); deleted with the `personal/` bucket, not absorbed anywhere

## Open decision for the lead

The work order's own ADD list named `productivity/writing-for-agents` as a skill to add,
but its top-of-brief name map already identifies `writing-great-skills` AS
`writing-for-agents` (renamed upstream). Treating both instructions literally would mean
carrying a stale pre-rename copy AND a new one side by side. This PR follows the identity
mapping: `writing-great-skills/` was updated in place with `writing-for-agents`' HEAD content
(GLOSSARY.md removed — merged into SKILL.md upstream; SKILL-MECHANICS.md added), keeping the
local folder name and, like `code-reviewbymatt`, deviating only on the SKILL.md `name:` line.
No separate `writing-for-agents/` folder was created. Flag if a second, upstream-named copy
was actually wanted.

## Non-mattpocock skills sharing `.claude/skills/`

animate, animation-vocabulary, apple-design, ask-sonner, emil-design-eng,
find-animation-opportunities, improve-animations, review-animations, shadcn,
orchestrator-fable — untouched by this vendoring.

## Update recipe

1. Clone upstream with full history to a scratch dir; note `git rev-parse HEAD` + date.
2. Per local mattpocock-origin file: `git hash-object` it, then check the sha exists anywhere
   in upstream history (`git cat-file -e`) — pristine vs. locally modified.
3. For every pristine file whose skill still exists upstream, checkout upstream HEAD's copy
   (`git checkout <upstream-remote>/main -- <path>`) and `git mv` it into the flat local slot;
   never overwrite a locally-modified file.
4. Add any upstream skill dir missing locally, flat, byte-exact.
5. Re-run the gates below; `git status --short` should show only `.claude/skills/**`.
