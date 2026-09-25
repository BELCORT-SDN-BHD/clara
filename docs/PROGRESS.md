# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme running now: plan, work order, rig, the grill record, lane reports), `docs/plan/active/rider-1008-legal-enforcement-mode/` (#1008 with its release as-run), `docs/plan/active/refresh-wave-2026-09-18/` (the last mainline wave: DECISIONS, reports, the triage audit and what was applied, the release runbook with § RESULTS). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main` = **`061a6992b`** (PR #1140, riders CUT PHASE: migrations `0320`, `0321`, `0323`, a VERSION
  CUT repointing `chatTurn v21→v22`, `claraWork v5→v6`, `statementFacts v3→v4`) on top of wave 4
  (PR #1053, `6da02a8de`), wave 3 (PR #1039, `46cf7c852`), wave 2 (PR #1029, `68b979bf9`), wave 1
  (PR #1025) and #1008. The docs PR recording this release's as-run follows. `frozen-workflows.json`
  now fully deploy-locked: `check-frozen-workflows --lock-deployed` locked 35 entries (this cut's 25
  plus wave 4's 10 that were never locked), committed as `204b7c199` on `docs/riders-cut-as-run`;
  `bodies` moved from 57 to 60.
- Hosted (2026-09-25 05:41Z–05:44Z window): DB **312 / `0323_trade_invoice_probe_self_exclusion`**;
  `clara-runtime` image **`refresh-061a6992`**
  (`sha256:11f5fb843d6bb695a9b010c09ab413725200dccbb86bff6056922b4b37f59975`, machine
  `48ee715b763048`, `bodies=60`, pins move to `chatTurn=chatTurn_v22` / `claraWork=claraWork_v6` /
  `statementFacts=statementFacts_v4`, the other eleven unchanged); web
  **`3089d906-5bae-48cb-9666-72dff5aa8ef4`** (tag `refresh-061a6992`). As-run:
  `riders-2026-09-20/RELEASE-WC-RUNBOOK.md` § RESULTS (outage 05:41:06Z–05:43:18Z, migrate 3 files
  in 22 s). Restore point before the window: full dump `2026-09-25T05-15-27-499Z`
  (221,062,708 bytes). Verification: `riders-2026-09-20/reports/waveC-gates.md`.
- Rollback: web one command back to **`57c5dbab-5706-4a8b-a50a-a96fa37f6d97`** (lawful, previously
  100%). The runtime's own rollback preflight read **ALLOWED** against `refresh-6da02a8d` as of
  2026-09-25T05:46:59Z, but that image is a lawful boot target **only while `chatTurn_v22`,
  `claraWork_v6` and `statementFacts_v4` each carry zero non-terminal runs**: it carries none of the
  three bodies, so the first non-terminal run on any of them turns the preflight's verdict to
  REFUSED (`unsupported_body`) by name. This is a snapshot, not a standing guarantee, and it
  degrades the moment the release starts taking traffic on a successor body. No below-frontier
  database rollback is drafted.
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark** (2026-09-20: a legal or similar compliance gate prompts and never disables; enforcement returns before launch after the lawyer's review; access control is not loosened); **Client KB, no manual pre-registration**; **shadcn upstream is the standard**; firms self-serve and pricing follows usage; accounting treatments are checked against the standard and Clara asks for professional judgements.

## In Progress

- **The riders programme (owner, 2026-09-20; sharpened 2026-09-23: every non-mainline ticket CLOSED, none left open): this long-running session finishes EVERYTHING outside the #597 mainline.** Plan and method: `riders-2026-09-20/README.md`. **Wave 1 DONE, HOSTED, 42 closed** (PR #1025). **Wave 2 DONE, HOSTED, 41 closed** (PR #1029; #885 PARTIAL, remainder #1030). **Wave 3 DONE, HOSTED, 40 closed** (PR #1039; #990 PARTIAL, producer half #1037; residuals #1036 and #1038 filed). **Wave 4 DONE, HOSTED, 25 closed** (PR #1053, `6da02a8de`; 19 DONE, 5 PARTIAL: #933 #940 #941 #942 #1036; #944 closed by the blueprint commit). **CUT PHASE DONE, HOSTED** (PR #1140, `061a6992b`; migrations `0320`, `0321`, `0323`, a VERSION CUT repointing `chatTurn v21→v22`, `claraWork v5→v6`, `statementFacts v3→v4`; `bodies` 57→60; the rollback preflight's first live demonstration of a repointed-pin refusal, `waveC-gates.md` §1.4). Tickets #985, #1000, #1030, #1037 and #1135 drafted and verified in the closure set (four DONE, one PARTIAL, #1135), pending the orchestrator posting them with the release evidence. New in this phase: no new signed-out surface, no new relation beyond one `wake_fn_allowlist` row; the risk carried by the image rather than the database. Next: the **sweep wave** (7 lanes, 41 tickets, running; lane L8, #1136 and #1137's agent-granted twins, is next), then the #597 mainline resumes from a clean state. Follow-ups filed by the programme so far: #1014 to #1038, plus wave 4's #1041, #1043 (closed), #1044, #1046–#1052, and the cut phase's #1136, #1137.
- **Grill 2026-09-20 — DONE and applied** (`riders-2026-09-20/GRILL-2026-09-20.md`): 24 rulings, one question at a time; 19 tickets promoted to `ready-for-agent` with briefs, 5 closed with reopen triggers, #1012 filed (retire the prior-GL seeding lane), notes on #663 and #665. `ready-for-human` 0, `needs-triage` 0.
- **#1008 — DONE**: implemented, three lenses + fix + recheck, PR #1011, released, closed with hosted evidence. On hosted BELCORT and the E2E audit firm got Work's model authority back with no owner action; the two SEEDED demo firms (Alara Advisory, Borneo Books) stay not live until their owners accept once, because the system never creates an acceptance for a person.
- Earlier on 2026-09-20: the triage audit applied (`refresh-wave-2026-09-18/reports/TRIAGE-APPLIED-2026-09-20.md`), the signed-in walk of the ten wave surfaces done, #1005 #1007 #1009 filed, #962 closed on the owner's answer.

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH (four runtime files), the Defender/EICAR skip, host-contention flakes under many concurrent lanes, `next build` panicking `0xc0000142` under heavy contention (a retry clears it, #869). CI (Linux) does not see them.
- Hosted, correct rather than broken: zero published cash account sets (every client home shows the cash arm's empty state until a human publishes one); one `document_processing_tasks` row reads `statement_facts · running` with no live run behind it.
- The flip of the legal mode has no web control yet (follow-up in `rider-1008…/reports/1008-final.md`); consents minted under `prompt` are not re-derived at the launch flip (a later ticket decides).
- `scripts/ops/dsn-pipe.mjs` pins the CA with its Windows spelling, so the backup runs under a WSL wrapper (#917, wave 1 lane 05).
- Blueprint drift recorded for the #683 sync, not edited: the lists in the 2026-09-15 and 2026-09-18 waves, the pins line (serving v21 / v5 / v5, now bodies=57 with two new families), 0195's activation assumption (replaced for beta by #1008), and the pack-shaped-read rule generalised by the #991 ruling.

## Next Steps

1. **Lane L8**: the two agent-granted twins for #1136 (three reads) and #1137 (two reads), plus two
   more only if the owner rules OBO twins for the tenancy confirmations (`SWEEP-PLAN.md`).
2. **The sweep wave's remaining lanes (L1–L7, 41 tickets total), then its integration and hosted
   release.**
3. Then the #597 mainline resumes from a clean state, next session: the mainline's remaining children
   (#645, #661–#683), ending with **#682** (verify the real accounting journey on the released
   combination) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
4. **The owner's signed-in walk of the three successor bodies** (`chatTurn_v22`, `claraWork_v6`,
   `statementFacts_v4`): one chat walk and one Work walk per body, per
   `RELEASE-WC-RUNBOOK.md` step 8's table, not done in the 2026-09-25 window, needs the owner's own
   browser session. The waves 2–4 walk done 2026-09-25 found three surfaces still not exercisable on
   hosted data (a payroll summary or agreement upload, a fresh invite, and starting the firm-setup
   checklist); those same limits apply to this cut's document-shaped walks.
5. Owner, whenever convenient: accept Terms of Service v1 for BELCORT on `/settings/firm` (a prompt now, not a block); have the two seeded demo firms' owners accept once if those firms are to be tested with Work.
6. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 (`clara.publish_legal_document`) and flip the legal mode to `enforce` before launch.
7. Housekeeping when the programme ends: the ten `clara-wt/<n>` worktrees and `clara-wt/int`; WSL clusters `rl01…rl10`, `rigint`, `rigrt`, `rigreh`.
