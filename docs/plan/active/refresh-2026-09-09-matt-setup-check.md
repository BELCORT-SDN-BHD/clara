# Matt Pocock setup verification and restoration

Checked 2026-09-09 for the owner's explicit request. This is an audit record, not a new skills configuration or lockfile.

## Source and restoration

Official source: [mattpocock/skills](https://github.com/mattpocock/skills) at immutable [3cca18b368ae95cdbdebbff572ccafa662551015](https://github.com/mattpocock/skills/commit/3cca18b368ae95cdbdebbff572ccafa662551015), version 1.2.3. Historical project provenance is recoverable at Clara commit `861707d62301487a355d9e27950c90e176ac56f3`, `.claude/skills/VENDORED-mattpocock.md`. Current main has no such manifest or skills-lock file; none was invented.

Compared all 37 vendored skills / 100 upstream files in each of the independent `.claude/skills` and `.agents/skills` copies. This includes upstream engineering/productivity/misc/in-progress directories, not just the plugin manifest's default subset. No package upgrade was performed.

The only content deviation was `name: code-reviewbymatt`; the review procedure was unchanged. Restored the original directory/name `code-review` and discovery metadata in both installs. The [official skill](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/code-review/SKILL.md) matches Git blob `e28d7acbf7b3bb4d7817b7eb5d9c105af03f6ec4` and SHA-256 `47f4e52c21694def9c7c11cbfbf891ca35eac7a93e395797515be3c8a409ae50`.

Seven stale `.agents` directories absent from this source were moved to recoverable external backup: design-an-interface, edit-article, obsidian-vault, qa, request-refactor-plan, ubiquitous-language and writing-great-skills. They were already absent from the tracked `.claude` set. Historical worktrees and artifacts were preserved.

The custom orchestrator-fable skill remains separately owned. Its single old review-name reference was corrected in each copy. No active code-reviewbymatt directory/reference remains in those roots. `.agents` is ignored local installation; `.claude` contains tracked copies. A fresh session reloads the skill catalog with the original name.

The worker verified both copies; root independently compared 200 installed files against the 100 official Git blobs with no differences. The worker's aggregate manifest SHA-256 for each copy is `69d86c582c7fd0c2d7af13437402b19af4397969c5c68af899e4d4f6909dc7bc`.

## GitHub and original configuration

GitHub Issues is enabled for BELCORT-SDN-BHD/clara, authenticated gh resolves the existing remote, all five default triage labels exist, and native sub-issue/dependency endpoints work.

The three docs/agents files (issue-tracker, triage-labels, domain) match the original setup-template text; root verified equality after normalising CRLF/LF. AGENTS has one Agent skills block and CLAUDE points to AGENTS. Existing GitHub/default-label/single-context choices are retained. There is no need to restart setup, add a connector, or invent a GitHub entry in Codex config: the original skills deliberately use gh.

The pre-existing .codex/config.toml modification was preserved. Clara-specific acceptance stays in PRD/spec/issues, not upstream skills.

## Backup and preservation

External backup: `C:\Users\zhant\AppData\Local\Temp\clara-matt-backup-20260909-012115-5ab35273`, 19 verified entries, retired directories under removed-from-workspace. Manifest SHA-256: `7c64e4fbdce6a4ff85d4c232b752f081d79a37292bcbdbff6037cfbc106f8335`.

Original custom-orchestrator files were separately copied to `C:\Users\zhant\AppData\Local\Temp\clara-orchestrator-review-name-20260909` before the reference correction. The tracked restoration and this audit are preserved in the local research-ui-contract snapshot; its exact closing commit is recorded on the map. No push, deployment or provider/runtime configuration change was performed.

## Formal spec

The original /to-spec template and test-seam check were followed. The owner explicitly accepted Work-to-complete-outcome plus real database/Workflow, full frontend, Knowledge and financial acceptance. [Clara refresh spec：统一自主会计、持久 Work、Client Knowledge 与完整 UIUX](https://github.com/BELCORT-SDN-BHD/clara/issues/612) is published with its acceptance appendices and ready-for-agent label. Next is /to-tickets, including review of the concrete split.
