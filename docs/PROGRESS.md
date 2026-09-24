# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme running now: plan, work order, rig, the grill record, lane reports), `docs/plan/active/rider-1008-legal-enforcement-mode/` (#1008 with its release as-run), `docs/plan/active/refresh-wave-2026-09-18/` (the last mainline wave: DECISIONS, reports, the triage audit and what was applied, the release runbook with § RESULTS). Clock in: read this, confirm the repo is clean (`git status`, `git log -1`, local `main` = `origin/main`), then ask the owner which ticket.

## Current State

- `main` = **`6da02a8de`** (PR #1053, riders wave 4: 25 tickets plus the pre-step outside the
  mainline, migrations `0295` to `0311` and `0315` to `0318`) on top of wave 3 (PR #1039, `46cf7c852`),
  wave 2 (PR #1029, `68b979bf9`), wave 1 (PR #1025) and #1008. The docs PR recording this release's
  as-run follows. No frozen workflow body changed; two new frozen families registered append-only
  (`payrollFacts.v1`, `agreementFacts.v1`): `bodies` moved from 55 to 57.
- Hosted (2026-09-24 17:54Z–17:59Z window): DB **309 / `0318_knowledge_fye_pair_applicability`**,
  legal enforcement mode **`prompt`**; `clara-runtime` image **`refresh-6da02a8d`**
  (`sha256:be29627ca473006daa3f0432e3e924e4c2844b3f9346893fe9b4ae21417bad80`, machine
  `48ee715b763048`, `bodies=57`, pins gain `payrollFacts_v1` / `agreementFacts_v1` beside the twelve
  unchanged); web **`57c5dbab-5706-4a8b-a50a-a96fa37f6d97`** (tag `refresh-6da02a8d`). As-run:
  `riders-2026-09-20/RELEASE-W4-RUNBOOK.md` § RESULTS (outage 17:54:08Z–17:58:55Z, migrate 21 files
  in 1 min 33 s). Restore point before the window: full dump `2026-09-24T17-30-29-801Z`
  (220,143,562 bytes). Verification: `riders-2026-09-20/reports/wave4-gates-A.md` and
  `wave4-gates-B.md`.
- Rollback: web one command back to `b659a3d4-a253-4f49-8a7e-c89306f6ab82` (previous:
  `686ab53f-4079-4305-8d0b-54efac86adc0`); the runtime must NOT return to `refresh-46cf7c85` at this
  ledger — its own rollback preflight now REFUSES it by name (`frontier_requires_contract`: 0254's
  `intake_refusal_record_v1` and 0279's `fa_parked_run_v1` door contracts are not declared by that
  image), the #1035 fix this wave shipped and its first live demonstration; no below-frontier
  database rollback is drafted; the legal mode returns to `enforce` through
  `clara.set_legal_enforcement_mode` as the operator firm's owner.
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark** (2026-09-20: a legal or similar compliance gate prompts and never disables; enforcement returns before launch after the lawyer's review; access control is not loosened); **Client KB, no manual pre-registration**; **shadcn upstream is the standard**; firms self-serve and pricing follows usage; accounting treatments are checked against the standard and Clara asks for professional judgements.

## In Progress

- **The riders programme (owner, 2026-09-20; sharpened 2026-09-23: every non-mainline ticket CLOSED, none left open): this long-running session finishes EVERYTHING outside the #597 mainline.** Plan and method: `riders-2026-09-20/README.md`. **Wave 1 DONE, HOSTED, 42 closed** (PR #1025). **Wave 2 DONE, HOSTED, 41 closed** (PR #1029; #885 PARTIAL, remainder #1030). **Wave 3 DONE, HOSTED, 40 closed** (PR #1039; #990 PARTIAL, producer half #1037; residuals #1036 and #1038 filed). **Wave 4 DONE, HOSTED, 25 closed** (PR #1053, `6da02a8de`; 19 DONE, 5 PARTIAL: #933 #940 #941 #942 #1036; #944 closed by the blueprint commit). New in this wave: `clara_invite_preview` / `clara_invite_preview_login` (#871), the signed-out invite-preview credential ceremony (run this window, one deviation: a stray psql meta-command broke the first attempt, fixed and re-run clean), and the rollback-preflight door-contract fix (#1035) that now correctly refuses the previous image. Next: the cut phase (`chatTurn_v22` / `claraWork_v6` for #985 #1000 #1030 #1037, carrying the successor contracts of #982 #1007 #986 #915 #931 #933 #937 #941 #942 #949), then the sweep wave (#1044 #1046 #1047 #1048 #1049 #1050 #1051 #1052, plus follow-ups still to be filed by the orchestrator from `scratchpad/release-w4/closures/INDEX.md`), then the #597 mainline resumes from a clean state. Follow-ups filed by the programme so far: #1014 to #1038, plus this wave's #1041, #1043 (closed), #1044, #1046–#1052.
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

1. The signed-in walk of the step-8 lane-surface tables of waves 2, 3 and 4 was done on 2026-09-25
   through the owner's Chrome session, read-only (RELEASE-W4-RUNBOOK.md, Signed-in walk): every
   surface renders on hosted data. Still owed by the owner, because each needs a write: one payroll
   summary or agreement upload (then the lane-01 surfaces), one fresh invite (then the signed-out
   preview of #871), and starting the firm-setup checklist (then the financial-year-end pair).
2. The cut phase: ONE shared successor cut `chatTurn_v22` / `claraWork_v6` for #985, #1000, #1030 and
   #1037 (`statementFacts_v4`), carrying the successor contracts of #982, #1007, #986, #915, #931,
   #933, #937, #941, #942 and #949.
3. The sweep wave: #1044, #1046, #1047, #1048, #1049, #1050, #1051, #1052, plus the follow-ups still
   to be filed by the orchestrator (to be filed by the orchestrator; see
   `scratchpad/release-w4/closures/INDEX.md`).
4. Then the #597 mainline resumes from a clean state, next session: the mainline's remaining children
   (#645, #661–#683), ending with **#682** (verify the real accounting journey on the released
   combination) → **#683** (final acceptance + blueprint sync, then close #612 and #597).
5. Owner, whenever convenient: accept Terms of Service v1 for BELCORT on `/settings/firm` (a prompt now, not a block); have the two seeded demo firms' owners accept once if those firms are to be tested with Work.
6. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 (`clara.publish_legal_document`) and flip the legal mode to `enforce` before launch.
7. Housekeeping when the programme ends: the ten `clara-wt/<n>` worktrees and `clara-wt/int`; WSL clusters `rl01…rl10`, `rigint`, `rigrt`, `rigreh`.
