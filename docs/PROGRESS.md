# Clara — Project Progress

## Current State

- Updated: 2026-09-09 (MYT), end of the first `/implement` session.
- Latest `main` commit: e619066f (PR #684 merged by fast-forward after a green hosted CI run: 2d87f8ec #606, 3b4e5b26 #616, 05f9f524 #606 fixture, 0164a2f0 #617, 7f4f90a4 #618). `main` requires the `ci` check, so every push goes through a branch and pull request first.
- Phase: implementation of the published refresh tickets has started. #606, #616, #617 and #618 are implemented and verified locally; none is closed (hosted evidence outstanding, see each issue's latest comment).
- Local verification (fresh PostgreSQL 17.11 clusters through the repo runner 0001–0177, Node 22.23.2): `@clara/db` 4101 tests · 4006 pass · 0 fail (one timing flake in `x85-b3-reopen-ends-on` passes 3/3 alone) · 94 skipped; `@clara/runtime` 2109 · 2107 pass · 1 skipped · 1 Windows-only failure (`intake-unit` EICAR cell, Windows Defender quarantines the fixture); root `pnpm lint`, `pnpm typecheck`, web build, post-build gates, live-gate e2es (intake, interview, kill-resume, version-cutover) and the Node 22 Linux image smoke (WSL Docker, postgres:17) all pass.
- Unrelated owner edits left uncommitted on purpose: `.codex/config.toml` and the Mobbin paragraph in `apps/web/README.md`.

## Completed

- [x] Product decisions, research and prototype direction accepted; [formal spec #612](https://github.com/BELCORT-SDN-BHD/clara/issues/612) and 71 tickets published (#606, #614–#683).
- [x] [#606](https://github.com/BELCORT-SDN-BHD/clara/issues/606) classify after extraction: migration 0177 (pg_get_functiondef splice), extraction-aware facts_gate consumer, fixture and pin alignment, precondition drill 18/18.
- [x] [#616](https://github.com/BELCORT-SDN-BHD/clara/issues/616) Node 22 host: root/CI/Dockerfile/test scripts on 22.23.2, node24 action pins, Linux image boot + restart smoke.
- [x] [#617](https://github.com/BELCORT-SDN-BHD/clara/issues/617) readiness observability: three-plus states per dependency, per-lane pool errors, consumer categories, leader state, TLS posture, fault-injection cells, recovery checklist.
- [x] [#618](https://github.com/BELCORT-SDN-BHD/clara/issues/618) operation-contract census tool + gate, six roles added to the T17 grant roster, sandbox-marker helper, C-26 no-writer proof.

## In Progress

- [ ] Hosted evidence for the four tickets: GitHub CI on the pushed branch, Fly release order for #606 (consumer before 0177) and #616, then closing comments. Blueprints already reflect the implemented state (Architecture §§ agent/host, documents, §10/§11).

## Known Issues

- Frozen `chatTurn_v1` still calls `get_journal_entry` on the read pool (found by the census, waived with evidence, needs a successor version, not an edit).
- `clara._tf_firm_document_limits_upsert` (0007) rewrites all limit columns; no public writer exists, so no boundary fix — needs a migration if a writer is ever added.
- `packages/backup` still builds on `node:20-bookworm-slim` (outside #616's stated boundary; owner decision).
- `packages/runtime/tests/p6-1-chatturn-v16-db.test.mjs` leaves the freeform_read_log sequence high on a reused rig (pre-existing; fresh clusters are unaffected).

## Next Steps

1. Owner: deploy per `packages/runtime/README.md` (consumer image before migration 0177), record the Fly/hosted-journey evidence on #606/#616/#617/#618, then close them (or close now on local + CI evidence — owner's call; the tickets are labelled ready-for-human).
2. Next implementation frontier: #614 (scoped shell and route migration, unblocks seven tickets), then #615, #619–#622; the ToolLoopAgent successor ticket (blocked by #616) once #616 closes.
3. [Final acceptance #683](https://github.com/BELCORT-SDN-BHD/clara/issues/683) owns integrated delivery, blueprint synchronization and explicit closure of #612/#597.
