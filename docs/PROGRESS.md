# Clara — Project Progress

## Current State

- Updated: 2026-09-10 (MYT), after the first `/implement` session closed its four tickets.
- `main` at 56f2233e (PRs #684–#688 all merged by fast-forward after green CI) plus this follow-ups update. `main` requires the `ci` check, so every push goes branch → PR → green → fast-forward of the same SHA.
- Hosted: `clara-runtime` **v77** (image `refresh-6d4efd3d`, Node 22) live; migration **0177 landed** on the live database (frontier 172, consumer-first order, runtime quiesced for the cutover); all seven lane DSNs now `sslmode=verify-full` against the shipped pooler CA (`/ready` `checks.tls` pinned ×7, validated); the operation census matched the live catalog.
- Tickets: #606, #616, #617, #618 **closed** with local + hosted evidence. The #606 hosted journey (owner signed in, agent drove a real upload through the client Documents workbench on 2026-09-10 01:21 MYT) showed the classify task created 98 ms after `document.extraction_completed`, one task per lane, downstream facts once; the trail is on the ticket.
- Local verification recorded per commit; last fresh-cluster runs: db 4101/4006 pass/94 skipped (one x85-b3 timing flake, since fixed to the DB clock), runtime 2114/2111 pass/1 skipped/1 Windows-only EICAR.
- Owner edits left uncommitted on purpose: `.codex/config.toml`, the Mobbin paragraph in `apps/web/README.md`.

## Completed

- [x] Product decisions, research and prototype direction accepted; [formal spec #612](https://github.com/BELCORT-SDN-BHD/clara/issues/612) and 71 tickets published (#606, #614–#683).
- [x] [#606](https://github.com/BELCORT-SDN-BHD/clara/issues/606) classify after extraction: migration 0177 (pg_get_functiondef splice), extraction-aware facts_gate consumer, fixture and pin alignment, precondition drill 18/18, hosted upload journey recorded.
- [x] [#616](https://github.com/BELCORT-SDN-BHD/clara/issues/616) Node 22 host: root/CI/Dockerfile/test scripts on 22.23.2, node24 action pins, Linux image boot + restart smoke.
- [x] [#617](https://github.com/BELCORT-SDN-BHD/clara/issues/617) readiness observability: three-plus states per dependency, per-lane pool errors, consumer categories, leader state, TLS posture, fault-injection cells, recovery checklist.
- [x] [#618](https://github.com/BELCORT-SDN-BHD/clara/issues/618) operation-contract census tool + gate, six roles added to the T17 grant roster, sandbox-marker helper, C-26 no-writer proof.

## In Progress

- Nothing in flight. The next frontier is listed under Next Steps.

## Known Issues

GitHub owns these now. Side findings from the first implementation session live in the [Refresh follow-ups](https://github.com/BELCORT-SDN-BHD/clara/milestone/1) milestone, all `needs-triage`: #689 (p6-1 cell not idempotent on a reused DB), #690 (bare `db-tests.md` citations), #691 (reporting-render Node 20 digest, owner decision), #692 (0007 limits trigger, no writer yet), #693 (Windows-only EICAR/Defender). Two findings were attached to the tickets that will fix them instead: the frozen `chatTurn_v1` read-pool call (comments on #623/#637) and the Documents list that does not re-poll (comments on #633/#650). #683's second criterion needs each of these to carry a decision before close-out. `packages/backup` moved to Node 22 (built, not deployed).

## Next Steps

1. Next implementation frontier: #614 (scoped shell and route migration, unblocks seven tickets), then #615, #619–#622; the ToolLoopAgent successor ticket is unblocked now that #616 is closed.
2. Owner: run `/triage` over the Refresh follow-ups milestone (#689–#693) when convenient; #691 and #693 need a decision, the rest are agent-sized once labelled `ready-for-agent`.
3. [Final acceptance #683](https://github.com/BELCORT-SDN-BHD/clara/issues/683) owns integrated delivery, blueprint synchronization and explicit closure of #612/#597.
