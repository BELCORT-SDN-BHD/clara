# PROGRESS archive — 2026-08, part 4

*The fourth companion to `PROGRESS.md`, opened 2026-08-30 under the same law as `-part2.md` and
`-part3.md`: `PROGRESS.md` is the STATE authority and must stay readable at its 500-line cap, so
blocks that have become HISTORY move here **verbatim**. Nothing is summarised on the way in — an
archive that paraphrases is a second, weaker copy of the record. `PROGRESS.md` keeps the pointer.*

---

## Session log entries, 2026-08-22 … 2026-08-25 (moved 2026-08-30, verbatim)

*Moved because the 磨合 sprint's own entries had pushed the file to its cap. The 2026-08-27 and
2026-08-27/28 entries stay in `PROGRESS.md`; everything earlier that was still inline is here.*

- **2026-08-25 (THE W2+W3 COMBINED CLOSE)** — the six-car train merged and **CEREMONIED live
  112→122/`0127`**, Track A's backend fully live; four cars took a first-chain-meeting fix
  round (lane-brief rules ①-⑦ minted). As-run
  `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`.
- **2026-08-24 (THE TRAIN NIGHT + W1)** — two CI mechanism fixes (#314 OS-assigned ports; the
  no-op relation-revoke DR fix); four train cars merged, **W1 ceremonied live 97→103** (as-run
  #315); F-A7 β's double review ladder CLOSED (owner ruling B10); GM-10 found + Codex-built; the
  gitleaks all-refs class allowlisted (#319); **the disk-zero incident** (WSL EIO, ~40 min
  outage, 101 GB pruned, keeper re-armed, owner granted the VHDX compact); the 529 storm bridged
  by the Codex cross-model substitution.
- **2026-08-22 (the TRACK-A SITTING · v2 DESIGN LANDING)** — fourteen rulings TA-P1…TA-P14 + all
  seven design sets to gated v2 (36 files); minute `docs/adr/0074-the-track-a-sitting.md`; full
  entries archived verbatim to `-part2.md`. Merged #284/#285/#286/#287.
- **2026-08-23 (the ALIGNMENT GRILL — ADR-0075; the SPLIT PASS)** — the owner widened the
  test-data authority (posture above carries it in full; digest law 82); digest law 77 ratified
  (#286); the invariant-(a) product text amended (#287); the SPLIT PASS moved nine at-cap files
  to their `-part2`/`-log` companions. **F-A9's D17 ruled (R-L19).**

---

## Known issues — the F-A7 gamma residuals (moved 2026-08-30, verbatim)

*Moved from `PROGRESS.md`'s Known issues for the same cap reason. **All three STAND** — none is
discharged by the move, and law 82 is satisfied by this record plus the pointer PROGRESS keeps.*

- **F-A7 gamma residuals** (independent γ review fold, 2026-08-25; recorded per law-82 — a
  deferral belongs here, not only in a commit message): **R1** classify egress stays UNGOVERNED
  by `GOVERNED_EGRESS_PURPOSES` (`packages/runtime/lib/egress.mjs`) until the runtime side lands
  — the DB half (`document_processing` purpose, the classify consent gate) is complete and
  gamma's own migration tail already states this is PR-rho's (annexes-2 SSI.1 train rho). **R2**
  the firm-narrow family has NO `consume_firm_egress_dispatch` verb and no body ever sets
  `firm_egress_dispatch_authorizations.consumed_at` — the client family's one-shot consume
  binding has no firm-scoped counterpart yet; `expires_at` is written and read by nothing
  (decorative at this frontier). Both are β/δ's to build, not gamma's. **R3**
  `document_intakes.origin` was NOT extended with `onboarding_interview` — annexes-2 §I.2 lists
  it as one of gamma's ALTER targets, but the pre-activation intake door it would gate did not
  ship this round (MEASURED: the live CHECK still refuses the value). A deliberate cut, not a
  miss — recorded so a later lane does not assume the door exists.
