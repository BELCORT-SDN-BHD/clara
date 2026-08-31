# PROGRESS archive — 2026-08, part 6

*Verbatim bullets moved out of `PROGRESS.md` on 2026-08-31 (the #454 merge round) to keep the
file inside its 500-line cap. Every item below was fully CLOSED/DONE at the time of the move;
open residuals stayed in `PROGRESS.md`. Bytes preserved verbatim, per the archive law.*

## From `## Backlog` (the debt-clearing sprint block)

- ~~**裁-22 — DB-resolved proposal citations**~~ — **DONE: `0143` (#409), merged + ceremonied 2026-08-29 03:17Z, live 141/`0146`; closed by fact per 裁-25 G2.**
- ~~**F-A6 PR-2 runtime obligations H-4/H-5/S-1**~~ — **DONE: shipped in #423, `packages/runtime/lib/freeform-read.mjs`** (see the F-A6 lane row).
- ~~**R4/R5/R7 digest addenda**~~ — **LANDED 2026-08-27:** evaluator two-halves ceremony (`docs/adr/README.md` §5), #352 closed-wave-floor law + four-runner confirmation (§10). *(R2/R3/R6 also LANDED and remain dropped.)*
- ~~β's §0 collision note~~ — **RESOLVED**: the rename (c623178) landed with pr-1b at W2+W3.
- ~~F-A3 PR-3/C1-bis D1 write-quiesce obligation~~ — **DISCHARGED 2026-08-26**: 0134 merged
  (#348) + ceremonied inside W4's combined quiesced window; full record in `-part3.md`.
- ~~**Manual journal-entry compose UI → the Codex frontend build.**~~ **DONE 2026-08-27** — `apps/web`'s P3 journals lane shipped hand-compose (`compose-dialog.tsx` + `entry-lines-editor.tsx`, #364); flagged closed by the handoff-conformance audit. · ~~**`coding_rules` propose/sign retirement**~~ — **DONE**: `0118` (F-A2 PR-3, #324) drops the five coding-rule verbs (with their five autopost siblings) outright, confirmed absent by the tail assertion; `coding_rules` stays KEEP-AS-HISTORY, consistent with OQ-2's ruling. · ~~**The autoDraft 8-step cap**~~ — **DONE**: `autoDraft.v9.impl.ts:197`, `AUTODRAFT_STEP_BUDGET = 8`, design-cell docstring (F-A2 PR-2, #323).

## From `## Known issues`

- ~~**The sweep-red fixture class (2026-08-29, after #414)**~~ — **CLOSED**: the manual sweep went
  RED on the closed-wave drill **§4.11** and all four **D-b frontier legs** because the shared
  `seedAdmission` fixture followed HEAD and wrote `token_hash` at pre-`0147` frontiers; **#415
  made it frontier-aware (catalog-probed) and its branch sweep turned the four frontier legs
  green**; product code was never wrong, and `0147` applied after it (live 142). **THE LESSON
  STANDS:** the closed drills and the frontier matrix run **only** on the weekly sweep or a manual
  dispatch (ADR-0073), so a PR that changes a SHARED TEST FIXTURE must `gh workflow run ci.yml`
  on its own branch **before merge** — the per-PR legs cannot see those legs at all.
- ~~**Local-only test-isolation flake in the db package**~~ — **MOOT, 2026-08-23 (F-A2 PR-3):**
  a21-prestate.test.mjs, the file that leaked `PGDATABASE` into the shared Node process, is
  whole-file RETIRED with the rules-execution tier (Annex B.1/B.6) — the flake retires with it.
