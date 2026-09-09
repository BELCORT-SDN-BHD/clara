# Clara — Project Progress

## Current State

- Updated: 2026-09-09 (MYT), end of the first `/implement` session including the hosted rollout.
- `main` at 6d4efd3d (PR #684 tickets, #685 docs, #686 leftovers all merged by fast-forward after green CI); PR #687 (web guard-cell hardening + README TLS note) pending CI. `main` requires the `ci` check, so every push goes branch → PR → green → fast-forward of the same SHA.
- Hosted: `clara-runtime` **v77** (image `refresh-6d4efd3d`, Node 22) live; migration **0177 landed** on the live database (frontier 172, consumer-first order, runtime quiesced for the cutover); all seven lane DSNs now `sslmode=verify-full` against the shipped pooler CA (`/ready` `checks.tls` pinned ×7, validated); the operation census matched the live catalog.
- Tickets: #616, #617, #618 **closed** with local + hosted evidence. #606 stays open for one item: the real upload journey on the deployed stack needs a signed-in session in the owner's browser (the agent does not enter passwords; no service-role key is stored locally). Everything else on #606 is done and recorded.
- Local verification recorded per commit; last fresh-cluster runs: db 4101/4006 pass/94 skipped (one x85-b3 timing flake, since fixed to the DB clock), runtime 2114/2111 pass/1 skipped/1 Windows-only EICAR.
- Owner edits left uncommitted on purpose: `.codex/config.toml`, the Mobbin paragraph in `apps/web/README.md`.

## Completed

- [x] Product decisions, research and prototype direction accepted; [formal spec #612](https://github.com/BELCORT-SDN-BHD/clara/issues/612) and 71 tickets published (#606, #614–#683).
- [x] [#606](https://github.com/BELCORT-SDN-BHD/clara/issues/606) classify after extraction: migration 0177 (pg_get_functiondef splice), extraction-aware facts_gate consumer, fixture and pin alignment, precondition drill 18/18.
- [x] [#616](https://github.com/BELCORT-SDN-BHD/clara/issues/616) Node 22 host: root/CI/Dockerfile/test scripts on 22.23.2, node24 action pins, Linux image boot + restart smoke.
- [x] [#617](https://github.com/BELCORT-SDN-BHD/clara/issues/617) readiness observability: three-plus states per dependency, per-lane pool errors, consumer categories, leader state, TLS posture, fault-injection cells, recovery checklist.
- [x] [#618](https://github.com/BELCORT-SDN-BHD/clara/issues/618) operation-contract census tool + gate, six roles added to the T17 grant roster, sandbox-marker helper, C-26 no-writer proof.

## In Progress

- [ ] #606 hosted upload journey (owner signs in on app.clarabook.com; agent drives the upload and records the classify-after-extraction trail), then close #606.

## Known Issues

- Frozen `chatTurn_v1` still calls `get_journal_entry` on the read pool (found by the census, waived with evidence, needs a successor version, not an edit).
- `clara._tf_firm_document_limits_upsert` (0007) rewrites all limit columns; no public writer exists, so no boundary fix — needs a migration if a writer is ever added.
- `packages/reporting-render` still pins a Node 20 base by digest (its determinism drill pins that digest; owner decision). `packages/backup` moved to Node 22 (built, not deployed).
- `packages/runtime/tests/p6-1-chatturn-v16-db.test.mjs` now restores the sequence it moves, but its committed 2^53 receipt makes the cell non-idempotent on a reused database (append-only table); fresh clusters are unaffected. 27 bare `db-tests.md` mentions remain in comments; the v16 guard cell and x85-b3 timing flakes are fixed.

## Next Steps

1. Owner: sign in on app.clarabook.com so the #606 upload journey can be driven and recorded; then close #606. Merge PR #687 when green (or ask the agent).
2. Next implementation frontier: #614 (scoped shell and route migration, unblocks seven tickets), then #615, #619–#622; the ToolLoopAgent successor ticket (blocked by #616) once #616 closes.
3. [Final acceptance #683](https://github.com/BELCORT-SDN-BHD/clara/issues/683) owns integrated delivery, blueprint synchronization and explicit closure of #612/#597.
