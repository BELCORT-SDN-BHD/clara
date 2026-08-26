# PROGRESS.md archive — 2026-08, part 3

*(Continues `progress-archive-2026-08-part2.md`, which reached the 500-line cap. Entries move
here verbatim from `PROGRESS.md` at clock-outs; the live file keeps only current posture.)*

## Archived at the 2026-08-26 W4 clock-out (verbatim moves from PROGRESS.md)

**Posture bullets superseded by the W4 bullet (records: the four ceremony as-runs):**

- **W2+W3 MERGED AND CEREMONIED — 2026-08-25 (~10:47-11:05 MYT combined apply window).** Nine
  cars merged and LIVE (eight PRs tonight + 0118 pre-merged): F-A2 PR-3 cutover+retirement (`0118`, #324) · F-A3 PR-1a (`0119`, #327) ·
  F-A4 PR-1b (`0120`, #329) · F-A3 PR-1b (`0121`, #328) · F-A3 PR-1c (`0122`, #330) · F-A7 γ
  (`0123`, #331) · F-A7 α (`0124`/`0125`, #332) · F-A7 β (`0126`, #333) · F-A5 PR-3 (`0127`,
  #334). **Live DB: 122 migrations, frontier `0127_f_a5_pr3_signed_original_archive`.** As-run:
  `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. **Track A's backend is now fully LIVE**
  (F-A2, F-A3, F-A4, F-A5 through the seal drill, and F-A7's full π/γ/α/β family); the only
  Track-A backend item left is **F-A3/PR-3, the clock train (W4)**. The full manual-dispatch CI
  sweep ran ALL-GREEN on the `0127` frontier *before* the window opened (run `32801086161`,
  including the closed-wave drills and the D-b frontier matrix — this is the measured basis for
  striking the earlier d-b2-under-floor known issue, see Known issues). **The owner-mandated
  debt-clearing sprint runs next** — see Backlog.
- **THE WAVE-F TRAIN + W1 — 2026-08-24 (~16:03-16:10 MYT).** Four train cars merged + live
  (agent-receipts layer · close-gate measurement · the `begin_chat_turn` law-76 recut · the
  F-A2 posting core), live 103/`0108`. Full detail (car-by-car, the two CI mechanism fixes
  #314/0103) in `docs/plan/completed/wave-f-w1-ceremony-asrun.md` (#315). The post-W1 cascade
  (0109-0111 + PR-2 + GM-10) completed via the D-a deploy window (live 112/`0117`) ahead of
  the W2+W3 window above.
- **F-A7 β's full double-review ladder** (Codex 7 + opus 4 findings fixed, delta CLEAN; owner
  ruling B10) **CLOSED 2026-08-24 @ `6892033`, MERGED + CEREMONIED 2026-08-25** as part of the
  W2+W3 window (`0126`, #333) — full ladder detail in the F-A7 lane row.
- **The F-A2 opener train (2026-08-21) and its 0/20 → 12/20 re-measure** — superseded in
  posture by the Wave-F/W2+W3 trains above; records: `f-a2-window-ab-ceremony-asrun.md` + lane row.

**Backlog/Known-issues rows completed and closed at W4:**

- **F-A3 PR-3/C1-bis carries an UNDISCHARGED D1 write-quiesce obligation.** The receipt
  identity fix lands as its OWN migration — a
  fix-forward recut-on-recut (`packages/db/migrations/0134_f_a3_pr3_c1bis_receipt_identity.sql`),
  because 0129 is applied history and applied migrations are
  immutable (`.claude/rules/db-migrations.md`; the in-place edit was tried and reproducibly
  trips the runner's checksum-drift abort). It REPLACES `clara._agent_bank_receipt`'s live body
  for the second time, so it needs a write-quiesce window at ceremony exactly as 0129 did.
  **Numbered 0134 on the assumption it merges AFTER G1's 0133 — renumber at merge if the train
  reorders** (nothing in the file depends on its own number; its gate and its test both read the
  catalog, never a filename or a `schema_migrations` row). *(Fast-follow PR, 2026-08-26.)*
  → **DISCHARGED 2026-08-26: 0134 merged (#348) and ceremonied inside W4's combined
  write-quiesce window** (`wave-f-w4-ceremony-asrun.md` §4-§5).
- ~~**OWNER CARD: Annex A.4 row 7 vs invariant (i) — `agent_prepared` label on preparation-less
  closes**~~ (F-A4 PR-1b cross-model review, 2026-08-25). **RULED 2026-08-25 (owner,
  debt-clearing sprint): the label follows the real `v_agent_prepared` probe on row 7 too —
  a new truthful `no_preparation` mode for a year no human AND no agent prepared, review
  requirements at least as strict as `agent_prepared`'s by construction (the existing
  self-attestation gate governs both outcomes identically).** D-2 (all-agent-drafted +
  human-approved-without-revision year → `agent_prepared`, no distinct-checker raise) stays
  exactly as-ruled — a framing note records it, no checker logic moved. **BUILT same day**:
  branch f-a4/pr-1b2-a4-truth, migration `packages/db/migrations/0128_f_a4_pr_1b2_a4_truth.sql` (CoRs
  `finalize_close`; `reopen_fiscal_year` investigated and found to share none of the row-7 arm,
  pinned not touched — its own CLR05 gates already exclude the "nobody at all" state row 7
  labels), `close_receipts.segregation_mode` CHECK widened extend-only, Annex A.4 rewritten
  (row 7 + both invariants + the reopen paragraph, all now literally true), same-commit test
  file `packages/db/tests/f-a4-pr1b2-a4-truth.test.mjs` (agent-prepared / human-prepared / no-preparation
  behaviorally proven on live rig calls, plus the CHECK's four-value census). Rig-verified:
  152/152 across the close-model family incl. the four new cells; F-A5's separate `issue_mode`
  census (a different table, different writer) confirmed unaffected. Pending: review ladder
  (judgement logic → independent pass, ADR-061 full ladder), merge, D1-quiesced ceremony.
  → **COMPLETED: 0128 merged and ceremonied at W4 2026-08-26.**

## Forward obligations from the 2026-08-24 β review ladder + train night — archived verbatim 2026-08-27

*(Condensed to a single pointer line in `PROGRESS.md`'s Backlog at the 磨合 window's opening.
None blocks beta; each was named at its own finding.)*

- **The candidate-parameterized `evaluate_witness_identity` variant → pi/F-A1-successor scope.**
  Widens B3's corroborated-anchor floor beyond hard-id; ALSO the exact event that makes β's B2
  collision wall outcome-bearing (today B2 is rung-vector/label quality — everything it flags, B3
  already refuses) AND the β named-skip's path (i). **DESIGN v1 LANDED 2026-08-25** — see
  `witness-identity-variant-survey.md` (+`-design`/`-annex`): a firm-guarded candidate-uuid array
  on `evaluate_witness_identity_v2`, plus a homoglyph gap the same pass closed (`R0ME PROPERTIES`
  had zero `name_family_candidates` coverage — new confusables fold); ship as one unit (cell W2).
- **F-A2/PR-2-successor prompt: `candidates` becomes MANDATORY** (B2 arm (b)'s feed — the
  runtime does not supply it today, by design).
- **`document_regions.field_path` is caller-supplied and un-CHECKed** — a future producer
  emitting a path containing tin/ssm/brn/account manufactures a corroborated anchor. No live
  producer does today; the obligation rides the PRODUCER lanes, not β.
- **Consolidate `wake_propose_bank_identifier_promotion` onto pi's `_identifier_promotion_core`**
  (post-W4/beta-era; fa3-pr1b's own analysis: fold is the correct long-run shape,
  `bank_account` already an enumerated kind; the rename stands meanwhile).
- **A shared marker-survival helper before any FOURTH `_sandbox_client_set` recut** — three
  migrations recut this ~19KB body (0132→0135→0136); cross-lane marker post-checks are
  per-AUTHOR discipline; a shared prior-markers helper makes it structural. *(2026-08-26.)*
- **Closed-wave-floor law (minted at #352): a PR retiring/moving an object pinned by a
  closed-wave floor trues the floor IN THE SAME PR** (grep the drill kits for every dropped
  name; closed drills don't run per-PR, so an untrued floor reds the NEXT sweep far from its
  cause). Succession pattern: stem-OR-witness, exact-signature absences + positive controls.
  *(Lifted into the ADR digest §10 at #356 and `.claude/rules/db-tests.md`.)*

## The W4 posture bullet — archived verbatim 2026-08-27 at the 磨合 window's opening

*(Moved out of `PROGRESS.md`'s Current posture when the 磨合 bullet superseded it there; the
W4 window itself is unchanged fact, and its as-run remains
`docs/plan/completed/wave-f-w4-ceremony-asrun.md`.)*

- **W4 (THE CLOSING WINDOW) MERGED AND CEREMONIED — 2026-08-26 (~18:55-19:05 MYT).** The
  Wave-F merge train's final eight items landed on `main` (0129 #343 · 0131 #346 · 0132 #345 ·
  0133 G1 #349 · 0134 C1-bis #348 · #347 card-1 design docs · **0135 card-1 substitution seam
  #351** · 0136 fix-forward #350), then NINE migrations ceremonied to live in one combined
  D1-quiesced window: **live 122/`0127` → 131/`0136`** (0128 and 0130, merged post-W2W3 with
  no window of their own, rode this one). **The BL-3 deploy flip ran: `('evaluate_metric', 2)`
  DARK → deployed — card-1's stage (b) is LIT** (freeze 7/7; manifest `--lock-deployed`
  stamped v2 AND trued the stale `evaluate_fs_pack_agent_v1` entry from the 08-24 C-flip).
  As-run: `docs/plan/completed/wave-f-w4-ceremony-asrun.md`. **The pre-window sweep gate
  earned its keep**: the first manual dispatch came back RED — the closed-wave D-b2 drill's
  B3 floor still pinned `accept_bank_rule_suggestion`, which `0129` legitimately retired —
  fixed as **#352** (succession-aware floors, stem-OR-witness branch, independent review
  CLEAN with a mutation matrix), second sweep ALL-GREEN incl. the first true
  `wave-e-contract-drills` run this cycle. 0135 itself carried a fix-before-merge adversary
  finding (lag-over-cell period mislabel → two guards; pc(cell,cell) proven legitimate) and
  0136 a both-direction superseded-body re-derivation with a dual-derivation byte-proof.
  **Next: the frontend 磨合 window (its own session) → Wave G (factory reset + estate e2e +
  beta).** The byte-burn render worker stays F-A5b PR-3 by prior ruling — sequenced, not owed.
- **The earlier Wave-F windows (W1 2026-08-24 · D-a cascade · W2+W3 2026-08-25) and the F-A2
  opener train (2026-08-21)** — superseded in posture by the W4 bullet; the four bullets moved
  verbatim to this file earlier. Records: the four as-runs (`wave-f-w1-` ·
  `f-a2-window-ab-` · `wave-f-w2w3-` · `wave-f-w4-ceremony-asrun.md`).
