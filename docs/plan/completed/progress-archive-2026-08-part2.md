# PROGRESS archive — part 2 (sections split out 2026-08-21)

> **The outgrow law applied to the archive itself.** `progress-archive-2026-08.md` passed the
> 500-line limit on 2026-08-21, so its newest sections moved here — the same SPLIT-never-prune
> rule that created the archive out of `PROGRESS.md` in the first place. **Every byte below is
> verbatim.** Part 1 holds everything archived up to and including the 2026-08-20 backlog
> dispositions; this file holds what was archived after it.
>
> Read part 1 first: `progress-archive-2026-08.md`.

## Session-log entries archived 2026-08-22 (the Track-A sitting's clock-out sweep; moved verbatim)

- **2026-08-21/22 (the PR-0 gate + housekeeping session)** — **F-A2's PR-0 gate ran both legs**
  (8-lens native review workflow + Codex cross-model, ~60 verified lanes): 3 blockers, 11
  materials, width severance ruled — record `docs/plan/active/f-a2-pr0-gate-record.md`, design
  folded to v5. **The stranded pair re-fired and settled** (archive part2 has the record).
  **WSL exit-255 diagnosed benign** (VM-teardown marking, not container flake). Known-issues
  archive sweep (4 resolved rows → part2). **Owner sitting (2026-08-22): 方案二 ruled — chat
  parity back IN-TRAIN (D34, gate severance overridden in part, dissent on file) · OQ-2/3/5
  all RULED per recommendations (D35-D37) · design → v6.**
- **2026-08-21 (the CI-economics session)** — **ADR-0073 delivered and proven on all three
  event paths same-day** (#278): per-PR ~13 min (was ~42) · post-merge push green · manual
  dispatch sweep green incl. all 12 closed-wave drills + 4 frontier legs. Reviews: 5-lens
  adversarial workflow + Codex cross-model; 6 confirmed findings, all fixed pre-merge (the
  `shell: bash` pipefail injection the headline). **Owner rulings:** the test-bed/data stays
  until the Wave-G reset (re-confirms ADR-0072 ⑤), answered by the **client-naming audit** —
  152 refs swept, adversarially verified, **0 confirmed hard-coded client logic** (the two
  raw flags: a one-time ADR-0044 hand-run data script; the pinned-ids safety net). One
  forward gap registered: the `high_stakes_amount_cents` governed-verb item (Backlog).

## Backlog block archived 2026-08-22 — the δ NAMED RESIDUALS, in full (moved verbatim; PROGRESS.md keeps a pointer)

- **δ NAMED RESIDUALS (all deliberate, each recorded in its file/PR):** F10 — a DB-level
  `transaction_timeout` on PG17 would bound the advisory-lock wait (fail-closed direction; one
  round trip if ever wanted) · the B4 sandwich — an in-one-dollar-quoted-block off/create/on
  toggle evades both `check_function_bodies` layers (closing it is its own reviewed pass) · the
  57014 cancellation receipt class is an authenticated caller's attestation by construction
  (rollback erases server-side trace; honestly labelled `caller_reported` — a label, not a task)
  · the RS guard's two-file split carries a between-transactions lift window
  (prestate-mitigated) · Supavisor headroom re-measure. **η — not δ — owns the production
  human/OBO/wake caller**; direct wake/runtime evaluator grants and synthetic human JWTs stay
  forbidden (a law statement; it next matters at F-A5's OBO closure).

## Backlog block archived 2026-08-22 — the η residuals, in full (moved verbatim; PROGRESS.md keeps a pointer)

**η residuals (Wave-E close, PRs #240/#242) — all four STAND, none scheduled:**
- **The blank-op-key idiom is whitespace-blind, estate-wide** — single-argument `btrim()` trims
  SPACES only, so a tab-only or newline-only op key passes every blank-key refusal in the
  estate. Not an η regression, and not reachable from the real caller (`stableOpKey` normalizes
  first). The fix is one whitespace-class-aware expression at every site in a **single pass** —
  per-lane patching leaves the estate inconsistent, worse than one uniform blind spot.
- **The co-effective policy seed-test wants its own fixture design** — the seed it needs
  carries two co-effective `eps_v1` versions, but `clara.edge_policy_sets` is append-only, so
  it cannot be torn down between runs and would change the estate every later cell reads.
- **δ-family: policy resolution is window-blind on the wall side** —
  `clara._tf_metric_cell_integrity` resolves policies with NO effective-window filter, so a
  window-filtering preview core would CLR11 every preview. η's compose core matches the wall
  term-for-term and fail-closes as an effectivity REFUSAL: **a false refusal, never a false
  preview.** Retires when wall and writer resolve by window together — no date.
- **`0084`'s out-of-tree derivation tooling is RETAINED** at `C:\ct\` — see Tooling
  follow-ups, where its machine-local-custody hazard is now priced.

## Known issues archived 2026-08-22 (both DIAGNOSED and carried as standing operating law; moved verbatim)

- **WSL exit-255 containers — DIAGNOSED 2026-08-21, benign:** docker marks still-running
  containers `Exited (255)` when the WSL VM is torn down under them; all seven on the host
  correlate exactly with VM restarts (8/15 · 8/19 · 8/21), dockerd clean, disk/memory ample.
  A red CI leg with exit-255 services means a VM teardown happened mid-run — the standing
  no-`wsl --shutdown`-with-busy-runners law already forbids the cause.
- **MAX_PATH breaks git's RECOVERY verbs too (2026-08-14, fleet lesson):** the three tracked
  long-path PDFs under `packages/runtime/test-storage/` make `git rebase --abort` fail with
  the rebase state SURVIVING, and a follow-up `git reset --hard` fails the same way — the
  instinctive abort→hard-reset pair leaves the clone MORE stuck at each step. **The escape:**
  `git rebase --quit`, then a MIXED `git reset <sha>` (index-only, no long-path writes), then
  `git symbolic-ref HEAD refs/heads/<branch>` — verify the target sha is an ancestor of origin
  BEFORE resetting, so the recovery is free by construction. Prefer fresh short-path clones
  (`core.longpaths true`) for any conflict-bearing operation.

## Session-log entry archived 2026-08-21 (the 2026-08-20 night, closed by the next day's ceremony; moved verbatim)

- **2026-08-20 (the F-A2 opener train + the corpus sitting)** — the night after the cutover.
  **The train, all five merged:** #270 ③④⑤ · #271 ①② DB · #273 ⑥ · #272 ①② runtime · #274 the
  Window-B activation. ⑥ was ratified after a rig replay proved `_coding_lane_core`'s
  kind-blindness behaviourally — **and proved the method**: the live body is three
  `pg_get_functiondef` splices past its last static `create or replace`, so a
  grep-the-migrations census would have found nothing and been unsound, not merely unlucky.
  **The design ladder:** F-A2's design ran v1→v4 through an adversarial round, a delta round and
  a final verify — the delta round REVERSED v2's durable-CHECK weakening on a reader census it
  ran instead of promising; the verify caught a four-apostrophe SQL default that made the
  *which-model-posted* wall always pass. **The sitting:** ADR-0072's five ruling blocks, plus
  the later 20-document re-extraction ruling. **The live reads:** three, each in a rolled-back
  read-only transaction — G-11 priced at a zero client-scoped population, BEE's opening-TB
  discrepancy settled for ADR-043, a **closed** stranded pair behind `failed_retry`'s un-widened
  door. **The catch worth naming:** the roster-gate review lane found a defect on `main` itself.

## Known-issues entries archived 2026-08-21 (RESOLVED at or before the combined Window A+B; moved verbatim)

*Both are closed. The ceremony that closed the second is
`docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`.*

- **The BEE opening-TB record discrepancy — RESOLVED 2026-08-20 by a live read** (read-only,
  rolled back). **ADR-043 is current; this file's old "empty opening TB" phrasing was the wrong
  reading.** Seed `1e60960e` is `finalized`, keyed, `as_of` 2024-12-31, and the book holds
  **4 approved opening entries dated 2024-12-31 totalling RM 210,000.00 = RM 210,000.00**, with
  `150-CAP` dr **RM 65,747.97** — the desk's capital B/F exactly. The "empty" reading almost
  certainly came from an EARLIER seed `ec53ab9d`, **cancelled** (document-tied; its parse
  returned `no_opening_tb_lines` across 153 regions) and recreated as the keyed seed under
  WB-R15. **One stored-number oddity recorded UNADJUDICATED:** the four `opening_items` sum to
  +7,850,406 cents with no `obe_plug` item while the journal balances through `190-OBE` — the
  reader did not know that table's sign convention and did not guess. BEE's Wave-G run is
  brown-field from an existing seed; corpus open question 1 answered.
- **The statement-reader pair self-supersedes by uuid coin flip TODAY** (0038:1781-1798 — same
  kind, same transaction-scoped `extracted_at`): a live pre-existing defect the F-A1
  kind-scoping does NOT touch (both readers share one kind); COUNTED at every 0089 apply.
  **CORRECTED 2026-08-20 — the recorded heal-point was WRONG.** `0098` merged **UNPOINTED** (its
  own header: *BUILT, FROZEN and UNPOINTED*), so no live statement reaches the two-kind writer
  yet and **the coin flip is still live**. It heals **FORWARD-ONLY at the ACTIVATION window**,
  and **the historical pairs are never repaired** — `superseded_by` is once-only (CLR08), so
  `0098` counts them instead. Design §3.9 note 5 carries the same fix.
  *(Archiving note, 2026-08-21: the ACTIVATION window named above RAN — `0102` re-keyed the
  router and repointed `statementFacts_v2`. The forward-only heal is therefore in force from
  that date, and the never-healing historical population stays named in PROGRESS as a
  one-line residual.)*

## Session-log entries archived 2026-08-20 (the outgrow law; moved verbatim from PROGRESS.md)

*The F-A1 build nights, 2026-08-18 and 2026-08-19. Moved once F-A1 was DELIVERED and its
acceptance records existed in their own files, which are the operative record now. Extends
this file's "Session log (entries through 2026-08-16)" section by the same law that created it.*

- **2026-08-18 (the Agentic Charter session)** — ADR-0071 minted (twelve rulings,
  laws 71-76); full entry in the archive.
- **2026-08-18 (evening, 开工)** — #255 → v63; the F-A1 design driven v1→v3 (48
  findings, two lanes MERGEABLE); moved verbatim to the archive at the ceremony sweep.
- **2026-08-18 (night, the F-A1 rulings + build kickoff)** — owner ruled in-session (design
  doc §5): OQ-1 **OpenAI-direct** (Azure declined) · OQ-2 **witness_extraction RATIFIED**
  (WB-R23) · cutover **DIRECT RELEASE** (the DPA-first recommendation filed as dissent;
  DPA → Owner/legal, non-blocking) · PR-0 **re-shaped to a third native adversarial lane**
  (Codex re-enters at future builds). The 0017 consumer census ran + was byte-spot-checked
  (kind-scoping breaks no production consumer; the INSERT surface provably centralized).
  The PR-0-native lane RAN (opus, fresh context): MERGEABLE-WITH-CONDITIONS — 3 blockers +
  15 material + 5 nits, ALL adjudicated at the bytes and folded (B3's disposition AMENDED
  to the polarity-free self-referential withdrawal — the review's own document_kind fix
  was unsound); design → v3.1 + the new `f-a1-annexes.md` (estate survey / adjudication
  register / battery sketch — the 500-line split). The 0017 builder lane (killed mid-run
  by the usage limit) RESUMED post-reset with the M3/M4/M5 addendum. S0.9's resolved
  record archived per the outgrow law. Docs-only PR: this truing + the v3.1 fold set.
- **2026-08-18 (late night, PR-1 build + assembly)** — four builder lanes delivered PR-1's
  DB estate (0089-0095), each rig-green on its own throwaway postgres:17; the 0089 pre-fix
  census proved the cross-kind supersede defect LIVE (16/17 OCR rows) and 0/17 post-fix;
  the filing-client join resolved FAIL-CLOSED via `document_filings` (design silence,
  §3.3); the writer lane's TRUE-merged-chain rig caught the one cross-lane defect
  (fixtures probing pre-rename constraint names), fixed at assembly; annex B carries the
  full record. Two Known-issues registered (limits-upsert hazard; statement-pair coin
  flip). Owner ruling same evening: review lanes NEVER wait for Codex.
- **2026-08-18 (deep night, the verify+review→fix round)** — integration verify: F-A1
  itself fully green, 36 suite reds ALL one class (closed-world censuses lawfully
  outgrown — extended with named rosters, never weakened; incl. CI's own δ-contract
  drill leg). The opus fresh-context review (law 1): NOT-MERGEABLE → 2 blockers
  (B1 C2-overreach onto the two token belts — would have zeroed corroboration on every
  RM-printed invoice, caught PRE-FREEZE; B2 the queued→failed trigger arm → wall 13) +
  7 material (customer_taxid restored; contest validated write-side + raise-proof
  fail-closed read; the M3 reference-value contract for the cross-regime duplicate
  walls; token-bounded citation matching; the witness_citation_regions numbering door;
  magnitude guards; the identity leaf renamed into the lint's discovery surface) +
  6 nits — all adjudicated (one review disposition AMENDED, one residual RULED),
  fixed on f-a1/pr1-fixes and re-proven; design/annex/PROGRESS trued. Next:
  fix-diff re-review → PR.
- **2026-08-19 (~03:30 MYT, the PR-1 merge + ceremony)** — PR #263 merged (d8abf19;
  CI took 3 rounds — the dashboard seam ledger and a runtime pre-0089-era cell were
  the 4th/5th closed-world catches, both extended/trued). The D1 ceremony ran (fourth
  execution; as-run: `docs/plan/completed/f-a1-pr1-ceremony-asrun.md`): backup banked
  → sleeper DSN bridge (reconstructed — dsn-pipe was session-local and GONE) → stop +
  110s staleness → 7/7 applied with live prestate evidence → 28/28 positive reads →
  deploy flip 2→4 → NOTIFY → `/ready` 200 → `--lock-deployed` (manifest in this PR).
  Deviation recorded: `sslmode=no-verify` (CA-unpinned TLS) — the pinned-CA tooling
  gap registered under Tooling follow-ups.

- **2026-08-21 (the combined Window A+B ceremony + the re-measure)** — the opener train went
  live in one window instead of two, on the grounds that a fully-merged train makes a split
  create a stall gap rather than separate risk. **92/`0097` → 97/`0102`, v65 → v66.** The
  ceremony's own instruments earned their keep twice: the **positive control caught a
  `$`-expansion bug** that had every PROCESS read returning a false "unset", and the
  **tripwire aborted on a module-resolution error BEFORE any stop** — zero downtime, which is
  exactly why it runs pre-quiesce. One probe red, adjudicated a **probe defect** (an assertion
  on a re-worded comment string). The `0102` coverage probe **said NO** and named the synthetic
  sandbox firm — accepted. **The re-measure: 12/20, against 0/20 like-for-like**, with opener ②
  clearing the bundle's hard floor, lock 3 firing on the one genuine registrant, and 19
  documents firing at once with zero failures on the lane that produced 7 casualties two days
  earlier. Four prompt-side findings queued; both freeze manifests deploy-locked.
  *(As-run: `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`.)*

## Known-issues rows archived at the 2026-08-22 sweep (each resolved; moved with their records)

- **F-A2 riders ③④⑤ / the 0-live gap — RESOLVED 2026-08-21, LIVE-PROVEN.** ③ and ④ went live
  in v66 and were exercised on their first outing under the heaviest load yet (19 documents at
  once, 40 calls, zero failures) against the F-A1 run's 7 casualties and four hangs on the same
  lane; ⑤ ran at the ceremony and returned 0.
- **The witness corroboration rate 0/33 — RE-MEASURED 12/20** vs 0/20 like-for-like (denominator
  rule binds). Fail-closed posture unchanged at the time of archiving: F-A2 proper unbuilt, so
  corroborating invoices still rode the human-confirm draft lane.
- **ci.yml over the 500-line harness limit — RESOLVED 2026-08-21 by ADR-0073's composite-action
  refactor** (lever 5): ci.yml 500 lines exactly; step bodies verbatim in `.github/actions/*`.
- **The `failed_retry` stranded pair — RE-FIRED AND SETTLED 2026-08-21 (the full record).**
  `0097` left `0051`'s `failed_retry` door scoped to `v_lane` alone; the stranded population
  measured CLOSED at 3 (2 truly stranded — `0cb7c1f1` BEE · `c597a24b` ROME SECRETARY — 1
  rescued by `receipt_backfill`). Both re-fired through the ordinary backstop
  `clara.enqueue_invoice_facts` as `clara_runtime`: read-only pre-confirm first (each document's
  only extraction attempt a `failed` legacy-lane task; all three `witness_extraction`
  activations ACTIVE), both calls returned `queued` (tasks `1d23b9d7…` · `d352338a…`), both
  settled `done` within minutes, and each document now carries `llm_text_facts` +
  `llm_vision_facts` both `done`. DSN captured env-to-env from a `clara-backup` sleeper (one
  recreate needed: `fly machine run` takes the command as split argv — a quoted `"sleep 5400"`
  becomes a single argv-0 and the machine flaps exit-1), never printed; sleeper destroyed at
  close. The `0051` door defect itself is unrepaired by design (per-document remedy; no new
  member can mint post-cutover).
