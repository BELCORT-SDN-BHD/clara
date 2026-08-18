# PROGRESS archive — the Wave-E lane table + session log through 2026-08-16

> Split out of `PROGRESS.md` at the 2026-08-18 clock-out (the log's own law: a file that
> outgrows a read is SPLIT, never rewritten or pruned — every byte below is verbatim).
> The lane rows here are all terminal (ceremonied, or merged where nothing needed a
> ceremony — docs/test/CI work); the vocabulary's leave-once-ceremonied rule extends to
> merged-terminal rows. `PROGRESS.md` keeps the live rows and the current session log,
> and points here.

## The Wave-E lane table (terminal rows, as they stood 2026-08-18)

| Lane | Scope | State | PR |
|---|---|---|---|
| Wave E · α | the E-R12 client-facts trio (`0055`) | ceremonied | #226 |
| Wave E · β | the close model (`0056`) | ceremonied | #228 |
| Wave E · γ | period registry + month snapshots (`0057`) | ceremonied | #231 |
| harness-v2 | the grand refactor — ADR-0069 | merged | #232 |
| Wave E · δ + RS guard + harness hardening | `0058-0063` + runner hardening + the dispatch-model hook | **ceremonied (LIVE)** | #233 #234 #236 |
| Wave E · θ | `0064` `get_close_plan` + `/close` + `/reports` — T17 grant round + focused drill + guard-polarity uniformity | **ceremonied (LIVE)** | #237 |
| Wave E · ε | FS reporting DB layer `0065-0072` — three codex rounds to MERGE-READY, ten-commit rebase with byte-identical contribution guard | **ceremonied (LIVE)** | #235 |
| Wave E · ζ | render worker + freeze CI half + DR §10, migrations `0079-0083` — seven review rounds (5 blockers incl. a Typst-injection wall and a cross-tenant replay door; a testimony-sweep discipline with a mechanical proof harness); merged 69d11aba. **NOTE: the squash subject on main says "0073-0076" — stale pre-renumber testimony, immutable; the migrations DIRECTORY is the numbering authority and reads 0079-0083.** Fly ceremony ran 2026-08-15 (see posture); DR docs PR #244 | **ceremonied (LIVE)** | #239 #244 |
| Wave E · η | chatTurn_v11 + four wake wrappers `0077-0078` — behavioural battery with mutation proof; merged f852ae43. B4 (the approve-verb maker rule, `0084`, four arms incl. ARM-0 orphan adoption) merged f90e0fd5→faf33ecb; runtime v11 deployed at the 0077-0084 ceremony | **ceremonied (LIVE)** | #240 #242 |
| S0.9 runner fix | checksum-keyed per-migration isolation pin (0057 → repeatable read, MEASURED post-BEGIN); the birth-sentinel cluster race killed | **merged** | #241 |
| Wave-E close paperwork | the 0077-0084 ceremony as-run + the freeze deploy-lock (140/140 locked), merged 263aa2d; ζ's DR-render docs merged 2b01219; this truing PR closes the set | merged | #243 #244 |
| B3 | `reopen_fiscal_year` → the `ends_on`-dated prior-period adjustment + the segregation wall (reopener≠closer / attested sole / adoption arm), migrations `0085-0086`; four-lens review (9 refuted / 4 survived → fix round → CONFIRMED ×6); found the pre-B3 silent-no-op reopen bug AND the 0056 closing_transfer/SST latent (task #17); merged 3203093, **ceremonied 2026-08-16** | **ceremonied (LIVE)** | #247 |
| ε wording-state fix | the four assert-shipped-state cells → law-shaped fixtures (three cuts to an honest discriminator; the counterfactual table as proof); sequenced AHEAD of the wording merge; merged 585346f0 | **merged** | #246 |
| MASB wording seed | the #43 packet → statutory wording via the 0067-sanctioned path, migrations `0087-0088`; payload re-derived clean twice; **owner sign-off 2026-08-16** (both-labels ratified · benar-dan-patut held · asymmetry accepted); merged cd0dea2, **ceremonied 2026-08-16 — E-R14 OPEN (en+zh issuable)** | **ceremonied (LIVE)** | #249 |
| E-R9 battery | the 30-cell close-lifecycle battery → review round (catalog-derived machine-role census · ARM-0 predicate-identity pin · `revise_entry` freeze arm · hard B3 gate); 30/30 zero-skip at `0088`; merged d179e04a | **merged** | #253 |
| Wave-G corpus design | the owner-directed E2E corpus design (5 slots incl. BEE, two consecutive FY closes each, green+brown split, OD-1..11 + P-1..3); review round restored the (65,747.97) sign convention at every restatement + argued OD-9/10/11 inline; merged 0970062f | **merged** | #254 |

## Session log (entries through 2026-08-16)

- **2026-08-16 (the continuation session, after /clear)** — the board's four carryover
  tasks driven to done or sitting-ready by pinned parallel lanes (three Workflow fan-outs +
  two fix rounds, every dispatch model-pinned): the E-R9 battery merged through its
  independent review round (#253 — the review's MAJOR turned the machine-role blacklist
  into a catalog-derived whitelist); the Wave-G corpus design authored, reviewed and merged
  (#254 — ~30 cite-checks zero-discrepancy; found the third vacuous-green instance and the
  ≥2-eligible-principals reopen-drill hazard; the fix lane's whole-doc grep caught a third
  unsigned (65,747.97) the reviewer's location description missed); the vision audit's
  reconciler claim verified with a LOCATION CORRECTION (the load-bearing gap was
  reconcileTasks §C, not the belt assembly; lint was as clean as SST) and FIXED at #255
  (law-1 review: no blocker; its fix round rewrote a heartbeat rationale the bytes
  contradicted and counted the §C failures per the F1 law); the SST latent analyzed to a
  sitting-ready Fix-A recommendation with the audit's direction claim corrected in-file
  (deflation — permanent early-warning suppression, not inflation). Shared checkout trued
  to `main`; graph re-indexed; strict-protection merge serialization ran exactly per the
  #244 note (update-branch + re-green ×2, no --admin); the stale-draft custody cleanup
  executed with hash-verification and recorded honestly (pre-review ancestors, not
  duplicates). Tasks #18/#19/#20 closed; #17 holds for the sitting's R1.
- **2026-08-16 (the post-wave tail, same session)** — the #43 wording seed built to
  review-closed (payload re-derived clean twice; four honest hold-backs incl. a
  fabricated-citation refusal; PR-ready at bf72db1, held for the owner); ε's four
  assert-shipped-state cells rewritten law-shaped and merged (#246) ahead of the wording
  path; **B3 built, four-lens-reviewed (9 refuted / 4 survived incl. a segregation-wall
  MAJOR fixed via the B4 arms + a real 0056 silent-no-op reopen bug killed), merged (#247)
  and ceremonied (81/`0086`) — before the first real close, as ruled**; the vision-alignment
  audit delivered (sequenced-not-drifted; one true drift = the non-agentic interview; six
  gaps logged for the Wave-F planning sitting); the closing_transfer/SST latent found twice independently and
  registered; one runner outage (WSL VM stop) diagnosed by annotation and recovered by
  service restart, never VM teardown. One reviewer ran five assignments five-for-five with
  zero relitigated and zero waved-through findings.
- **2026-08-14/15 (the wave close)** — θ+ε merged and ceremonied (0064-0072, morning);
  ζ closed through seven review rounds (the grep-evidence rule + the phrase-family
  testimony-sweep harness minted mid-ladder) and merged as 0079-0083; η recovered from the
  180-red out-of-tree staging desync (the history-integrity guard was RIGHT all along),
  merged 0077-0078, then B4 (0084, four arms incl. ARM-0) after the adversarial panel
  found the null-maker fail-open; S0.9 root-caused to the cluster-wide birth-sentinel race
  and killed by the checksum-keyed isolation pin (#241). Codex's quota exhausted mid-close;
  the review lanes switched to native fresh-context panels per the owner's ruling and held
  the bar. The 0077-0084 ceremony ran with a D1 write-quiesce + the chatTurn v11 deploy +
  the freeze deploy-lock (140/140). ζ's fly ceremony landed `clara-render` live
  (tag-and-digest image, reports/ policy pair, clean first drain) and the dispatch half was
  wired onto `clara-runtime` via the stdin-to-stdin relay. The #43 MASB wording packet was
  researched to sign-off-ready from official sources. ADR-0070 gained the wave-close
  supplement (rulings 10-13). B3 and the wording-seed build lanes dispatched. Four of the
  orchestrator's own rulings were reversed by evidence during the rounds (grace window,
  verbatim requeue, digest-alone machine form, a genuine-check edge) — recorded as the
  triangle cutting both ways.
- **2026-08-12** — the α+β EARLY ceremony (0055+0056 live, MSIC debt discharged, ADR-0067) ·
  the ADR-0068 evening sitting (B3 ruled · sign-offs · Gate-P defers) · lane γ end-to-end
  (build → 7-round ladder → 42 findings killed → PR #231 merged → 0057 ceremonied) · the
  harness grand refactor grilled (10 rulings + 5 supplements + 5 increments), built by five
  lanes, then merged as PR #232 (ADR-0069).
- **2026-08-13/14 (the night run)** — owner authorized the ENTIRE Wave E with full permission.
  The /clear wiped the prior session's task board and writer transcripts; state was reconstructed
  from bytes via a 20-agent assessment (16 requirement verdicts + mid-edit sweep + completeness
  critic), minting `.claude/rules/handoffs.md`. Eight parallel lanes then closed δ (integrated +
  runner), built the RS name-only guard pair, the dispatch-model hook, and lanes ε/ζ/η/θ. The
  ADR-061 ladder ran in full: codex xhigh initial review (6 blockers — fake-receipt validation,
  in-body check_function_bodies bypass, RS lift/arming polarity among them) + a native
  8-dimension adversarially-verified pass (percent_change dimension gap, exact-division rounding,
  login-shell loops, pack-v5 consumer pins, the CI sweep-skip false-green) → adjudicated fix
  docket → three fix lanes → codex re-verify ALL-CONFIRMED → numbers 0058-0063 claimed (B4
  migration_version literal trued at rename) → PG17 acceptance 87/87 zero-skip with three-way
  SHA-256 equality. η's cross-lane review of ε found and fixed the seal-gate composition hole
  (uncertified now covers the full non-canonical population; 'stripped' de-conflated to
  section-deviation). Three interview-v3 residuals verified CLOSED. A session-limit outage
  killed all lanes mid-flight and the run resumed lossless from transcripts + bytes.
- **2026-08-13 (earlier)** — Wave E δ reached final-finding closure, not final acceptance. Exact-rational
  evaluation, E6, pack ordering/replay/atomic rollback, the 5,000-cell concurrency wall, A29
  lifecycle census, recursive A31 operand evidence, x57 staleness firing and migration-runner
  connection/NOTICE hardening were built and repeatedly reviewed. Independent lanes then found
  remaining run identity, selector, temporal reason, historical provenance, freeze, composition,
  refusal-receipt and runner-lifecycle gaps. Owner ruled: preserve the hard 5,000-cell limit and
  use a separate immutable refusal/cancellation receipt where no truthful metric cell can exist;
  δ v1 stays human-authenticated-only and η owns future OBO/wake wrappers. Clock-out paused the
  two sole writers at safe checkpoints; final review and pristine PG17 remain held. No commit,
  PR, numbering, merge, live mutation or deployment occurred.

## Known-issues records archived 2026-08-18 (moved verbatim from PROGRESS.md)

- **Working-tree custody (RESOLVED 2026-08-15):** the original checkout's foreign
  `AGENTS.md`/`PROGRESS.md` modifications were discarded with the owner's approval after
  their intent was absorbed (constraint-12 truing + naming the graph MCP, both on this
  branch). **CLEANUP EXECUTED 2026-08-16:** the `wave-e-delta-build` worktree's untracked
  ε/η/θ/ζ working copies and the `.tmp-delta-*`/`.tmp-e6-*` stages are DELETED — with a
  correction to the earlier wording: hash-verification found 26/31 were NOT byte-identical
  to main; they were PRE-REVIEW DRAFTS (ancestors — sampled diffs confirm main's versions
  are the revised descendants, e.g. 0064 +60/−39, the θ test +124/−37; "byte-for-byte" was
  true only of the TRACKED-file overlaps). Deleted as superseded: the finals are on `main`,
  the lane states survive in the custody branches, and the acceptance records carry the
  evidence. The worktree's status is clean.

## Known-issues entries archived 2026-08-18 (resolved; moved verbatim per the outgrow law)

- **0057's S0.9 birth self-test is a LATENT CLUSTER-RACE FLAKE on main (2026-08-15, root-caused
  and reproduced; fix commissioned).** The guard at 0057:250 asserts
  `pg_visible_in_snapshot(pg_current_xact_id(), pg_current_snapshot())` is false — but that
  expression is true iff ANY transaction that acquired a later xid has COMPLETED anywhere on
  the CLUSTER (snapshot xmax = latestCompletedXid+1; own xid is never in xip_list), so under
  READ COMMITTED it is a ~30ms race per 0057 application, four tickets per CI run in the
  Slice-5 docs-upgrade drill (shared service container = cross-database churn). Reproduced on
  main's own bytes (4 trips in 5 with a concurrent committer; 0 in 12 quiet). 0057's RUNTIME
  watermark predicate is SOUND (it reads a stored committed snapshot); only the birth-time
  self-proof is race-exposed. FIX (runner lane, own PR, full ladder — 0057's bytes are
  immutable): a per-migration isolation pin in migrate.mjs keyed on version + sha256
  (identity, not spelling), pinning exactly 0057 to REPEATABLE READ (snapshot precedes any
  own-xid allocation → deterministically false), fail-closed on sha mismatch; blanket RR is
  REJECTED — 0019 explicitly refuses it (CLR32). Validated: 0/5 under churn with the pin vs
  4/5 control; full drill 4/4. **RESOLVED 2026-08-15: PR #241 merged (f90e0fd5)** — the
  checksum-keyed isolation pin is live in the runner, the pin is MEASURED (post-BEGIN
  read-back of transaction_isolation with a refusal on mismatch), and the applied-skip note
  states only what the ledger records. The flake is dead for fresh-chain applies; live 0057
  predates the pin (applied at READ COMMITTED, race won) and its runtime predicate was always
  sound.
