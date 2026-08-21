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

## Entries archived 2026-08-18 late night (outgrow law; moved verbatim)

- **2026-08-18 (the Agentic Charter session)** — the owner's vision-alignment questions
  driven to full resolution: the 2026-08-16 audit re-grounded by a six-lane code-level
  deep scan (pinned sonnet-5 xhigh; 340 tool calls; findings N1-N6), the owner grilled
  through the decision tree one question at a time (every ruling preceded by a plain-language
  briefing with costs stated; three build recommendations declined and the dissents
  filed), and **ADR-0071 minted** — judgement becomes the unattended posting authority,
  the LLM witness pair replaces the reader estate, the rules machine retires, close key ①
  and bank matching go agentic, reporting goes two-tier, internet goes two-tier,
  meter-never-cap. Digest re-trued (laws 71-76 + nine clause annotations); PRD /
  ARCHITECTURE / roadmap surgically amended; `docs/plan/active/wave-f-contract.md` minted
  (two tracks + the F-A10 retirement condition); PROGRESS split per the outgrow law (terminal
  lane rows + old session log → `docs/plan/completed/progress-archive-2026-08.md`). Carried one pre-existing
  uncommitted cosmetic AGENTS.md wording tweak ("menu"→"Harness menu" ×3) found in the
  tree — named, not silently absorbed. Harness sweep (owner-prompted): `docs/plan/index.md`
  re-trued (Wave-F live set + the PATH-STABILITY convention made explicit; PRD line 3
  reconciled); root README + the PR-232 body-notes re-home → immediate follow-up PR (both
  outside the docs-only fence). Docs-only PR; single-lane review per ADR-0069.

- **WSL VM idle teardown masqueraded as a disk I/O fault (2026-08-14; NAT half corrected
  2026-08-15).** After the disk-full recovery, containers died Exited(255) seconds after start
  and the distro logged `getpwuid(0) failed 5` — read initially as VHDX corruption. The real
  cause: WSL tears the VM down moments after the last wsl.exe client detaches, so every
  short-lived poll (`wsl docker ps`) booted the VM, exited, and doomed the containers it was
  checking. **Correction to the first fix note:** `vmIdleTimeout=-1` is INVALID (silently
  ignored); `vmIdleTimeout=86400000` holds the VM — but the NAT session STILL dies ~10 min
  after the last client detaches (port-forwards vanish while the VM lives), so a detached
  OS-level keeper remains required for any port-dependent work
  (`Start-Process -WindowStyle Hidden wsl.exe -ArgumentList "-e","sleep","43200"`). And never
  `wsl --shutdown` while the CI runners are busy (it killed running jobs twice) — restart
  runner services via `wsl -u root systemctl restart`, never by VM teardown. Rig-script law
  stands: hold one attached client for the life of the stage, and never diagnose VM health
  through a probe that itself cycles the VM.

- **The 2026-08-14 disk-full event + the VHDX compaction residue.** C: hit 0 bytes mid-run; root
  cause was 301 orphaned docker volumes (60.15GB) inside the WSL VHDX — the night's disposable
  PG17 stages never pruned — plus an 11.4GB npm cache. Both purged (`docker system prune -af
  --volumes` + cache delete); C: recovered to ~12GB free and the VHDX has ~950G internal room,
  so container work re-uses the existing allocation without growing the file. RESIDUE: the
  59.7GB `ext4.vhdx` itself stays large — compaction (`diskpart compact vdisk`) needs an
  elevated shell, which the agent session does not have; WSL's `--set-sparse` self-reports a
  data-corruption risk and was not forced. Owner-key item: run the compact from an admin
  PowerShell if the ~50GB matters. Standing practice going forward: long fleet runs prune
  docker volumes as stages finish, not at the end.

- **2026-08-18 (evening, 开工)** — Next 1 executed: #255 deployed as `clara-runtime` v63,
  triple-verified (v62 negative control → v63 PROCESS reads → `/ready`); lane row retired.
  Then the F-A1 design: a seven-lane grounding sweep + completeness critic over the
  extraction estate, design v1→v3 through a two-lane fresh-context adversarial review
  (48 findings adjudicated at the bytes; both lanes unconditional MERGEABLE on the final
  bytes). The Codex lane was BLOCKED by a vendor usage limit (lifts 2026-08-20) —
  re-registered as the build's PR-0 gate, not waived. OQ-1/OQ-2 queued for the sitting.
  *(Archived at the 2026-08-19 ceremony sweep.)*

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


## Posture bullet archived 2026-08-20 (superseded by the F-A1 cutover bullet; frontier moved 0095 -> 0097)

- **Live DB: 90 migrations, frontier `0095` (the F-A1 witness estate — ceremonied
  2026-08-19 ~03:30 MYT, `docs/plan/completed/f-a1-pr1-ceremony-asrun.md`): 28/28
  positive reads, evaluators deployed 4/4 one-way, LIVE-INERT for witness work until
  PR-3 mints the lane. Field notes: the in-file quiesce guard (0023's mechanism,
  carried by 0092) FIRED in a live ceremony for the first time — the recipe now waits
  110s post-stop; the statement-pair coin-flip measured on live (15 docs/24 pairs,
  named not repaired, heals at PR-4).** Earlier: the wording-seed
  ceremony ran 2026-08-16 after the owner's sign-off
  (`docs/plan/completed/masb-wording-ceremony-asrun.md`): 22 statutory-wording rows + 9
  lexicon + 3 claim policies, byte-per-packet. **E-R14 IS OPEN: en and zh statutory packs
  are ISSUABLE** (mpers_company rev 1 en 5/5 + zh 5/5 verified; rev 2 en 5/5 ready for
  2027); ms stays gated at 4/5 per the sign-off (notes.title held back — fabricated
  citation). Earlier the same day, the B3 ceremony ran
  2026-08-16 (D1 write-quiesce; `docs/plan/completed/b3-reopen-ceremony-asrun.md`):
  `reopen_fiscal_year` is now the `ends_on`-dated formal prior-period adjustment under the
  target-bound M2 permit, and reversing a close is a SEGREGATED act (reopener ≠ closer at
  ≥2 eligible; attested sole path; adoption arm for orphaned closes) — live BEFORE the
  first real close, as ADR-068 required. The pre-B3 silent-no-op reopen defect is dead.
  Earlier this close: three
  ceremonies ran from merged `main` this close: 0058-0063 (2026-08-14,
  `docs/plan/completed/wave-e-delta-ceremony-asrun.md`), 0064-0072 (2026-08-14 morning,
  `docs/plan/completed/wave-e-theta-epsilon-ceremony-asrun.md`), and 0077-0084 (2026-08-15,
  with a D1 write-quiesce for the writer-body swaps, the chatTurn v11 runtime deploy and the
  freeze deploy-lock — as-run + locked `frozen-workflows.json` MERGED at 263aa2d, PR #243).
  Every apply
  backed up to R2 first; positive reads + pgrst NOTIFY recorded each time. **Both evaluator
  closures are DEPLOYED AND FROZEN** (`verify_evaluator_freeze` ok, 2/2). **ROME SECRETARY is
  ARMED** (name-only fact through the audited door; the S4.5 behavioural self-proof fired on
  live). The A30b receipt table is live and empty.


## Posture bullet archived 2026-08-20 late (the Agentic Charter's own posture bullet; its content is now digest laws 71-76 + ADR-0071's body, and ADR-0072 re-trues its scoping)

*(previous posture, 2026-08-18 — the Agentic Charter)*

- **THE AGENTIC CHARTER IS RULED (ADR-0071, 2026-08-18; digest laws 71-76).** The owner's
  twelve-ruling grilling (structured-question record, plain-language briefing before every
  ruling) resolved the vision-alignment questions wholesale: **the agent's own judgement is
  the unattended posting authority** (zero runtime guardrails, permanent — build dissent on
  file); amounts are custodied by the **LLM witness pair** (same provider, text×vision
  channels, C1-C4 gates — deterministic DB verdict to the sen, region anchoring, arithmetic
  identities kept, stamped persisted reads); **the rules machine's execution tier retires**
  (knowledge layer = the learning loop); close **key ① goes to the agent, keys ②③ stay
  human**; bank **matching/adjustments go agentic, the red pen stays human**; reporting
  splits **sandbox-free / formal-side self-approved-to-firm_approved** (canonical + wording
  governance unchanged); **eval harness DECLINED**; **meter-never-cap**; internet is
  **two-tier** (official feeds→effective-dated tables + open web reading under three
  disciplines). Wave F re-scoped to TWO PARALLEL TRACKS —
  `docs/plan/active/wave-f-contract.md` is the contract of record, and its **F-A10
  retirement condition** guarantees two architectures never enter Wave G. Supersessions
  enumerated exactly in the ADR; §6.1 and invariants (a)(b)(c) stand untouched. Deep-scan
  findings **N1-N6** registered with dispositions (N1→F-A2 · N2/N3→F-A5 · N4→F-A4 ·
  N5→F-T4 · N6 doc-truth staleness incl. stale `0056:57`/autodraft-header/runtime-README
  lines — Wave-F fix-queue riders).

## The BEE live-fire refusal, archived 2026-08-20 (moved verbatim from PROGRESS.md's Next item 2; the RULING it records is carried forward in PROGRESS, in ADR-0072 ⑤ and in `docs/plan/active/wave-g-e2e-corpus-design.md` §1)

**The BEE FY2025 live close — DEFERRED ON ACCOUNTING-CORRECTNESS GROUNDS
(2026-08-16 live-fire sitting, owner-directed "make the right choice"):** the owner's
desk management accounts (LUXE WEALTH, proprietor-certified, TIN on file) state FY2025
SALES RM 68,640.00 / net PROFIT RM 47,245.65 / capital B/F (65,747.97), while Clara's
BEE book holds RM 0 income, an empty opening TB, and ~19 UNCODED ingested filings (the
year's real receipts — Maxis RM 2,495.40, the entertainment batch, the FA invoice all
identified against the claim folder). Finalizing would have sealed a knowingly-false
loss on a REAL client — refused under hard constraint 1. The machinery half of E-R9
stands PROVEN (30/30 twice on virgin rigs; every live gate read green; the auth→/close→
/queue chain exercised end-to-end via the owner's own session); **the refusal itself is
the live-fire's best outcome — five product signals pointed at the incompleteness before
the desk evidence confirmed it.** The management-accounts figures are the GOLDEN
STANDARD for the rebuild. **PATH RULED (owner, 2026-08-16): the BEE close and its
catch-up defer WHOLESALE to the Wave-G reset + full E2E rebuild from raw documents** —
the golden figures above are that rebuild's acceptance bar (the book must tie to
RM 68,640 sales / RM 47,245.65 profit before the close seals). No BEE coding sittings
in Wave F. The Lucy `ca4276a9` RM 500 draft is a VENDOR
(subcontractor) bill — correctly coded, approval rides the catch-up sitting; the
readiness lane's "revenue document" label was a misread, corrected here.

*Note added at archiving (2026-08-20): the "empty opening TB" clause above was measured
WRONG by a live read that night — see PROGRESS's Known issues. The rest stands.*

## Two more posture bullets archived 2026-08-20 late (Wave-E closeout narrative; both wholly historical, moved verbatim)

- **The post-wave tail is CLOSED OUT (2026-08-16 continuation session):** the E-R9
  close-lifecycle battery is merged (#253, d179e04a — 30 cells, three clean proof-runs incl.
  one at frontier `0088`; its review round hardened the machine-role census to a
  catalog-derived whitelist, pinned the ARM-0 predicate by identity, added the
  `revise_entry` freeze arm and made the B3 gate hard-assert instead of skip); the Wave-G
  E2E corpus design is merged (#254, 0970062f — 11 owner-decision points + 3 proposals for
  the sittings); the reconciler belt-isolation fix is merged (#255, 2bd7e12c — the §C
  open-task-settle starvation gap closed with per-item wraps + assembly-level containment,
  halt-class errors rethrown by class identity, 19-cell unit battery; **DEPLOYED 2026-08-18
  as `clara-runtime` release v63** — see the Runtime bullet). The shared checkout is trued
  to `main` and the codebase graph re-indexed (15,805 nodes). Each PR took an independent
  fresh-context review + a finding→fix→re-verify round before merge; strict branch
  protection serialized the merges exactly as the #244 note predicted (`update-branch` +
  re-green each, never `--admin`).
- **The δ review record:** cross-model (codex xhigh, initially NOT-MERGEABLE with 6 blockers)
  + a native 8-dimension adversarially-verified pass → an adjudicated fix docket (fake-receipt
  validation, in-body `check_function_bodies` double-layer refusal, owner-only RS lift floor,
  `percent_change` dimension equality, exact-division display rounding, provenance
  absent-key refusal, login-shell negative loops, pack-v5 consumer pins) → all ten fixes
  codex re-verified ALL-CONFIRMED on the final bytes → 87/87 zero-skip acceptance on pristine
  PG17 with source==staged==applied SHA-256 equality.

## Tombstones archived 2026-08-20 (the outgrow law; moved verbatim from PROGRESS.md)

*A 2026-08-20 read-only audit of every Backlog and Known-issues row against the newest
alignment found five struck-through or RESOLVED lines still sitting in the state file — the
exact drift the outgrow law exists to prevent. They are honest tombstones, not errors, so they
are MOVED here rather than deleted. Two further rows were DISCHARGED outright and are recorded
at the end of this section with the evidence that discharged them.*

**From Backlog → Named build debts:**

- ~~B3 implementation~~ — **RETIRED 2026-08-16**: live as `0085-0086` (ceremonied; the
  S11.2 roster join discharged in-code, verified by the four-lens review). *(ADR-0068)*

**From Backlog → Wave-D/C carried deferrals:**

**C-c F-1 is CLOSED** — the allocation-date guard was built in `0055` and verified at the live
apply (ADR-0067); the two RPR historical scars remain documented history.

**From Backlog → Interview v3 residuals:**

- **CLOSED 2026-08-14, verified against source + green runs (67/67 + 4/4):** the optimistic-bubble
  rollback (bubble id now keys park+phase+submitId, `thread.ts:83-85`; rollback on thrown submit
  incl. `deliverValue`), the guard follow-ups (ANNOUNCE counted file-wide + closed-set `ask`
  reachability, `wave-b-interview-park-ordering.test.mjs:283-446`), and the 409 recovery's
  unbounded fetches (`runtimeFetch` applies `AbortSignal.timeout(15s)` at the single chokepoint,
  `interviewApi.ts:69-80`). PR #199's ADR-062 (6) record was accurate; the register was stale.

**From Known issues:**

- **Working-tree custody — RESOLVED 2026-08-15/16**; full record in the archive.
- ~~0057's S0.9 birth self-test cluster-race flake~~ — **RESOLVED 2026-08-15 (PR #241,
  f90e0fd5)**: the checksum-keyed REPEATABLE-READ isolation pin, measured post-BEGIN; full
  record moved verbatim to `docs/plan/completed/progress-archive-2026-08.md` (2026-08-18).

**Two rows DISCHARGED outright and removed rather than archived** (each row's own demand was
met, so keeping it would be carrying a satisfied obligation as pending work):

1. **`0017`'s kind-blind supersede** (Slice-era standing residuals). It demanded an
   `authoritative_extraction_id` consumer census "before any migration candidate". The census
   exists and was byte-spot-checked (`docs/plan/active/f-a1-witness-pair-design.md` §3.9 (4),
   blast radius pinned at `0017:1512`, `:1536`, `:1703`, `:1723` plus its self-assertion
   battery), and the migration shipped as `0089_f_a1_kind_scoped_supersede.sql`, ceremonied
   2026-08-19 and live at frontier 92. Both halves of what the row asked for are done.
2. **Server-side branch protection (plan upgrade)** (Owner/legal). Measured live on PR #244
   and recorded in PROGRESS's own CI-economics item (6): the required check is `ci` with
   `strict: true` and `enforce_admins: true`, and `--admin` is correctly refused. Server-side
   protection is in force; the row predated the plan upgrade that put it there.

## Backlog dispositions applied 2026-08-20 — the REASONING, archived (PROGRESS keeps the one-line disposition and points here)

*The 2026-08-20 audit read all 88 Backlog and Known-issues rows against ADR-0071, the F-A1
delivery, ADR-0072's rulings and the Wave-G reset. Seven came back STALE, eight DISCHARGED,
eight ABSORBED. PROGRESS carries each disposition in one line; the argument that earned it is
here, so the state file stays a state file. **A disposition is not a deletion** — every row
below is still findable, and any of them can be re-opened by naming it.*

**STALE — superseded; stop carrying as pending.**

1. **The monthly harness-simplification ablation.** ADR-0071/G7 declined the eval harness and
   says in the ADR's own words that this backlog item "stays blocked on a benchmark that now
   will not exist". Its recorded prerequisite is unbuildable by ruling, so it is re-recorded
   as a named consequence of G7 rather than an instrument awaiting a prerequisite.
2. **X7's five residuals.** Byte-verified: `in_vendor_block`/`is_vendor_name` and the whole
   identity/anchor family (`invoice-customer-identity.mjs`, `invoice-identity-fold.mjs`,
   `invoice-block-geometry.mjs`, `invoice-anchor-sweep.mjs`, `invoice-party-grammar.mjs`) are
   imported by exactly one non-test file — `workflows/invoiceFacts.v1.azure.mjs`, the
   tombstoned engine. Since `0097` no invoice-kind document enqueues `invoice_facts`, so no
   new document can reach any of the five. They die with the reader estate at F-A10; residual
   (5)'s owner acceptance stays on the record as history.
3. **`in_vendor_block` / `is_vendor_name` "unproven live".** Same superseder, sharper: these
   two walls can now never be proven live, because the lane that would ask them is retired.
   Closed as **retired unproven** — not carried as an open proof obligation.
4. **The parked sandbox floor 6/6/6/85 + the pre-generated headroom PDF.** 6/6/6/85 is
   `_ocr_sales_floor`'s autopost floor (ADR-0064 §1) — pure rules-machine execution tier — and
   ADR-0071 retires §4.95's nine-control OCR-sales envelope with the rule lane. Headroom for a
   floor that retires buys nothing; `SYNTHETIC-TEST-MY-INV-0023.pdf` becomes an ordinary
   unused fixture.
5. **Slice-4's "firm-local-time budgets".** ADR-0071/G8 narrows PRD §8's budgets clause to
   metering-only — PRD §8 now reads "per-firm usage METERING (visible monthly spend, never a
   cap that pauses automation)" — and `0097` already removed the invoice path from page-budget
   reservation entirely (meter-never-cap). What survives is the engine-protective concurrency
   floor, which is not a firm-local-time budget.
6. **`roadmap.md` Phase-5 item 6's "a real gate".** Directly contradicted ADR-0071/G7. Fixed
   in the file 2026-08-20.
7. **`wave-g-e2e-corpus-design.md` §5 step 4's "standing rules earn autopost after the third
   approval".** Contradicted digest law 73, and it sat in the run script the corpus would
   actually be executed from. Fixed in the file 2026-08-20.

**ABSORBED — folded into a named item, recorded so it is not re-derived.**

- **FA carry-down's first real firing** and **one real reducing-balance asset** → the Wave-G
  corpus §6, which puts both on the bank-volume slot: assets exist at FY1 opening, closing NBV
  rolls to FY2 opening, "a reducing-balance asset among them".
- **Slice-4's per-part-type field schemas → the fail-closed card catalog** → **Wave G**'s
  design floors (`docs/design/` populates there).
- **Slice-4's billing-grade metering** → **F-A9** (per-call usage rows + a monthly per-firm
  rollup, visible, no cap — that is this item).
- **Slice-6/Wave-A's task-per-ingest coding** → **F-A2**, which inverts its premise exactly:
  S6-R10's "coding is chat-first, human-initiated" becomes one unattended coder reading every
  ingested document. The durable-task shape is F-A2's design call.
- **Slice-6/Wave-A's proactive notification-inbox surface** → **Wave G** (WA-R6 already
  subsumed AB-5 into the one-queue interim; the roadmap's Wave-G first line is the real one).
- **Slice-6/Wave-A's agent-visible attribution candidates** → **F-A7a**, whose
  `wake_file_document` gives the agent the filing judgement on the ≥0.95 attribution wall —
  it cannot exist while candidate visibility is withheld.
- **E-R13's settlement-corroboration door** → **F-A3**, and **claims (E-R10)** → **F-T4**,
  both already carried explicitly by the Wave-F contract.

**RE-HOMED — the item stands; only its address changed.**

- **The system-prompt investment pass** → **F-A2** (law 71 makes the agent's judgement the
  posting authority, so prompt quality stops being polish; G7 removed the instrument that
  would have caught its absence).
- **The 401/403 retryable auth-code split** → **the F-T4 fix queue.** Its recorded "(Wave F)"
  home never existed: `wave-f-contract.md` names it in neither track nor its deferred list.
  It is not stale — the OCR vendor stays Azure post-cutover, and it is one of only two honest
  remedies for Gate P's seven stuck documents.
- **All three interview v3 residuals** → **F-A7b**, which re-fronts the interview with a model
  normalizer while KEEPING the segment schema and the validate→echo→persist walk, so the
  park/submit contract survives and the gaps survive with it. The e2e de-pin's own text calls
  it "a dated tripwire… stale at the next core bump" — F-A7b *is* that bump, and taken at the
  wrong moment it is a red CI leg on someone else's PR.
- **The ceremony DSN bridge, the wiki CoR-comment gate, `0057` §11's writer-roster successor,
  and `0007`'s firm-limits upsert** → **the F-A2 / F-T4 fix queues** (see PROGRESS for which).

**Three audit observations that are not backlog rows, kept because they explain the counts.**

- **The honest row count is 88 against roughly 40 visible bullets** — the reconciler
  follow-ups (3), the δ named residuals (6), the Slice-4 residuals (7), the Slice-6/Wave-A
  residuals (3) and the F6-F9 register (8+) each read as ONE line and are 3-8 items.
- **WB-R2 is moot but has live code riders** the retirement PR must census: three cells in
  `packages/db/tests/wave-b/wb-s-seeding.test.mjs`, `packages/db/tests/x42-producer.test.mjs`
  and a load-bearing comment in `packages/runtime/lib/prior-gl-cells.mjs`. Closed-world census
  inputs — extend-never-weaken, per the F-A1 lesson.
- **Two of the ruler clauses the audit judged against existed only in-session** when it ran
  (the delete-the-old-era directive and R1's ruling). Both are now repo bytes: ADR-0072.

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
