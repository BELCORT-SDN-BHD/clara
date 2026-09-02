# PROGRESS archive — 2026-08, part 7

*Verbatim text moved out of `PROGRESS.md` on 2026-09-02 (the pre-pause truing sweep) to keep the
file inside its 500-line cap: the demoted 2026-08-31 beta-pivot posture banner, the
2026-08-30-noon-through-W4-closing historical `Current posture` bullets, five more now-historical
posture bullets, and the two oldest `Session log` entries — preserved below exactly as they read in
`PROGRESS.md` before this move; every ruling any of them cites still stands. Bytes preserved
verbatim, per the archive law.*

## The demoted posture banner (superseded 2026-09-02 by the pre-pause truing sweep's banner)

**⇢ THE BETA PIVOT — 2026-08-31 morning sitting (~09:30–12:30 MYT; ledger `docs/plan/active/mohe-grill-rulings-2026-08-31.md`, 裁-73…裁-84; ADR-0077 SIGNED at the evening sitting, 裁-93). THE SEAT STAYS IN THE CLAUDE CODE SESSION (裁-82 as amended by 裁-85 at the second sitting: lanes by fit — Codex for heavy execution, sonnet for bounded work, opus for judgement); the sprint's opening document is `docs/plan/active/frontend-sprint-handoff-2026-08-31.md` + `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md` — a fresh reader starts THERE after this file.** The direction: unbuilt backend (Track B tax, the G1 clocks, the non-critical residuals) is PAUSED and recorded, never built; all effort goes to `apps/web` replacing `apps/dashboard` at `app.clarabook.com`, Stripe under the ruled pay model (paid beta at RM0/"trial"), a reduced Wave G, then beta. The happy-path trace (a 167-agent harness-drift scan + trace, 2026-08-31) found four holes no row carried: **no path from a paid signup to a born firm** (裁-73: Stripe Checkout → signed webhook → `firm_admissions` → `create_firm`) · **the F-A7b interview RUNNER exists only in the old dashboard** (裁-78: port before cutover) · **nothing in the product can open a report run** (裁-77: chat tools + PDF) · **裁-72's 110-verb scope rested on a census pinned at `0138`** (裁-75: re-measure, then amend). The lean ladder (裁-84 → 裁-86): ONE fresh-context opus review + a real-browser Playwright e2e leg on every frontend train (law 28 kept by the build/review split); Stripe's account-level objects through this session's connector (裁-81 → 裁-87). Open PRs: FINISH #461 #455 #453 (P4, retargeted to main; ~~#451~~ **MERGED `fd04df19` 2026-08-31 evening**) · #462 (+ interview copy) · ~~#454~~ **MERGED `ec045eed` + runtime v70 DEPLOYED 2026-08-31 08:21Z, `chatTurn: chatTurn_v16` bundle-proven, manifest deploy-locked**; PARK #447 #448 #452 #456 #449 #460 (Known-issues rows; worktrees untouched). Landed 2026-08-31: #464 (the dawn resume map, still the parked lanes' per-PR detail) · #465 (the harness truing, 100+ fact findings) · this PR. *(The previous banner: PAUSED 06:55 MYT after the 磨合 sprint night — #459 P6-2 the card wave and #450 P4-1 the invite repair landed; #440 closed (裁-66).)*

## From `## Current posture` — the 2026-08-30-noon through W4-closing historical block

*(as of 2026-08-30 12:00 MYT — **THE NOON STATE: main `cf912b0f`, repo frontier `0155`, LIVE 148/`0153`.** Landed since 08:40: **#433 `0154` 裁-18b PR-1** (the binding proposal door — on main, NOT applied: its D1 ceremony is COMBINED with PR-3's window) · **#434** the 0148–0153 as-run · **#435 `0155` 裁-41** (`client_identifiers` UNIQUE — on main, NOT applied: live ROME SECRETARY carries two duplicate groups, owner route (a) = ride the Wave-G reset) · **#436 + #438** the hrd-b closed-wave drill's two successor fixes (baseline holds out ≥`0147`; B-or-mutant placed under B's REAL basename so `0154`'s stem witness sees it — sweep 33288656180's 3/5 red was exactly this) · **#437 the G1 wake bodies `bankAgent_v1` + `closePrep_v1`** (runtime, zero migrations; five fold rounds / 26 defects each pinned RED-before; native as-built CLEAR at every tip; Codex `gpt-5.6-sol` ×6, r6 CLEAR LOW-only — the three LOWs ride G1 PR-2; **both `wake_engine_sources` rows stay `enabled=false` and the image is NOT deployed: neither source has a PRODUCER, so the 裁-40 flip is inert until G1 PR-2 builds them**). Earlier that morning — **THE OVERNIGHT MERGE TRAIN IS LANDED AND LIVE: `0148` #425 · `0149` #427 · `0150` #428 · `0151` #429 · `0152` #431 · `0153` #432 all on `main` (`3ecbe657`) and CEREMONIED in one ceremony of TWO D1 windows 2026-08-30 00:30Z–00:35Z — LIVE 148/`0153`**, as-run `docs/plan/completed/mohe-0148-0153-apply-asrun.md` (window 1 was refused at `0151` by the file's own >90-s heartbeat guard — correct, the kit's pacing was the defect; window 2 paced on a positive heartbeat-age read); the manual sweep dispatched after (run 33283730630) · **#430 the billing design set is on `main`** (8 owner questions) · 裁-18b PR-1 → #433 (sign refuses `post_time_control_absent` until PR-3 mints the witness) · 裁-41 → #435 · G1 → #437 (all three above) · **THE HOST INCIDENT 03:55–04:40 MYT (C: at 0 bytes; WSL dead; every rig-backed result of that hour invalidated and re-run) is recovered** — 82 GB of orphan docker volumes pruned inside WSL; the VHDX compaction (admin) is the owner's; lessons in the ledger. Earlier that night: **THE 磨合 WINDOW IS SPRINTING: P1-P3 + the night train #368-#384 MERGED** · **PORT WAVE COMPLETE — 11/11 trains on main** (Wave C: T11 #405 · T1 #406 · T2 #407) ·
**THE PRE-BETA BACKEND QUEUE IS MERGED AND LIVE: `0142` F-A7b PR-a #401 · `0143` 裁-22 #409 ·
`0144` hardening A #410 (ELEVEN barrier views after a demonstrated cross-tenant leak) · `0145` P4
tranche-2 #411 · `0146` 裁-17 #412 — ceremonied in ONE ~51-s D1 window 2026-08-29 03:17Z, LIVE
141/`0146`**, as-run `docs/plan/completed/mohe-0142-0146-apply-asrun.md` · **HARDENING B (裁-16) IS FULLY LANDED: merged #414 AND APPLIED — `0147` ceremonied 2026-08-29 08:46:55Z–08:47:42Z (a 47-s D1 window, `/ready` 200), LIVE 142/`0147`**, as-run `docs/plan/completed/mohe-0147-apply-asrun.md` · **F-A6 PR-2 IS MERGED AND DEPLOYED — #423, runtime `v69`, `chatTurn_v15` bundle-proven SERVING, so Clara's audited FREEFORM READ IS LIVE IN CHAT (H-4/H-5/S-1 discharged); deploy ceremony 2026-08-29 18:04Z-18:08Z** · also merged 2026-08-29: **#421** the alignment audit's no-ruling-needed fixes · **#422** the 裁-18b PR-0 design gate record · **#424** the COA research addendum (MPERS 4.2 items + the Q8 reclassification); **#425** (`0148`, the duplicate-open wall on both agent proposal doors) is MERGING · **THE SITTINGS ARE RULED THROUGH 裁-44** — 裁-23…裁-28 on 08-29 morning (`docs/plan/active/mohe-grill-rulings-2026-08-28.md`) and **裁-29…裁-44** in `docs/plan/active/mohe-grill-rulings-2026-08-29.md`; `docs/plan/active/mohe-owner-batch-2026-08-29.md` is answered in both batches **except the pricing AMOUNTS**, the model itself having been ruled at 裁-42)*

- **ELEVEN LANES RAN THIS NIGHT — ALL ELEVEN LANDED BY NOON 2026-08-30** (裁-21 PR-a `0150` · 裁-19 PR-1
  `0149` · F-T3 PR-1 `0152` · F-A9 PR-1B `0151` · 裁-18b PR-1 `0154` · F-T1 `0153` · 裁-41 `0155` · G1
  wake bodies #437 · billing design #430 · the two drill fixes). **Numbers were claimed at MERGE, in
  dependency order** (constraint 10). **Two sweeps ran after the ceremony:** 33283730630 (`db-estate`
  red = a HARNESS race — `fetch-base-main`'s `main:refs/remotes/origin/main` rejected non-ff after a
  docs merge advanced main mid-run; CI fix queue: force the ref; never merge into main mid-sweep) and
  33288656180 (green everywhere except the hrd-b drill, = #438). **The closing sweep ran GREEN** —
  workflow_dispatch 33294666367 on `main`, 2026-08-30 05:25Z; main has advanced since, so a fresh sweep is owed at the next merge.
- **Owed next, in order — SUPERSEDED 2026-08-31 by the pivot (Next item 1):** the G1 PR-2a/2b · 裁-18b PR-2/PR-3 chain is PARKED post-beta (裁-76/裁-79; Known issues carry each PR's resume path); the owner-run-when-idle VHDX compaction stands.

- **THE 磨合 (frontend integration) WINDOW OPENED 2026-08-26/27** — its own session, per
  `docs/plan/active/mohe-session-handoff-2026-08-26.md`; `chatTurn_v14` deployed +
  bundle-proven serving as the named pre-flight. **Landed this window: #356-#379** — the
  opening docs batch + P1 foundation + `/ready` storage probe + F-A7b's gate set (#356-#360)
  · P2+P3 in full (#362-#367) · the three ruling ledgers (the
  `mohe-grill-rulings-2026-08-27.md` family) · `0137`/`0138`/`0139`/`0140` (#365 #368 #373 #377) · the P4 design
  set + Mobbin grounding pair (#376 #378) · the verb-coverage census (#374, the roster
  authority) · needs-you wiring (#375) · **the port-wave plan, owner ruling A** (#379:
  115 names, T0 + 11 trains, waves A-E, `apps/dashboard` retires at the P6 cutover).
- **The owner's 磨合 opening grill is RULED IN FULL** — `docs/plan/active/mohe-grill-rulings-2026-08-27.md`
  (Q1-Q9 + Q-A…Q-F): the Codex `clarabook-frontend` output is DESIGN LAW + prototype evidence,
  the production app is **`apps/web` in this repo** (§0 stands) · **rail-first with thread
  escalation**, never a modal · the two-level IA with **client-switch as a security event** ·
  **the ClaraBook brand system RATIFIED** (package verified 42/42) · i18n three layers
  (statutory BM+EN day one) · desktop-first + a mobile decision corridor · **WCAG 2.1 AA, three
  CI gates** · the catalog is **18 live + 4 in one batched wire bump**, workbench-first · the
  per-journey DONE formula + the P0-P6 order.
- **F-A7b's gate CLOSED 2026-08-27** (`docs/plan/active/fa7b-gate-record.md`): the five
  materials playbooks approved as proposed (bank-only and shoebox take **NO opening seed** —
  deferred activation, visible banner, chase list, the FY1 cost on screen day one) · **Q-D1
  ALL-PROPOSE** · **Q-D6 no seal while the banner is up, no override door** · **Q-D8 the
  interview normalizer ships** (law-28 pass mandatory) · Q-D9 the FY1 basis note names the
  opening's source; the human KEYED door is always open.

- **W4 (THE CLOSING WINDOW) MERGED AND CEREMONIED 2026-08-26** — the Wave-F train's final eight
  items merged (0129 #343 · 0131 #346 · 0132 #345 · 0133 G1 #349 · 0134 #348 · #347 · 0135 #351 ·
  0136 #350), NINE migrations ceremonied in one combined D1 window, **live 122/`0127` →
  131/`0136`**, the BL-3 flip lighting card-1 stage (b) (freeze 7/7, manifest locked); the
  pre-window sweep gate earned its keep (a stale closed-wave floor caught RED, fixed as #352).
  As-run `docs/plan/completed/wave-f-w4-ceremony-asrun.md`; **the full bullet and the earlier
  Wave-F windows (W1 · D-a · W2+W3 · the F-A2 opener train) are archived verbatim in
  `docs/plan/completed/progress-archive-2026-08-part3.md`.** The byte-burn render worker stays
  F-A5b PR-3 by prior ruling — sequenced, not owed.

## From `## Current posture` — five more bullets pulled at the same clock-out

*(The named keep-list covers only the ADR-0075/standing-law/Runtime/Books/close-model/CI/
hard-blocked-ids bullets; these five were the rest of the pre-09-02 posture block.)*

- **The Track-A sitting (ADR-0074, fourteen TA-P rulings + the four ratified constitutional
  amendments + laws 78-81), ADR-0072's five F-A2 ruling blocks, and the F-A1 witness-pair
  cutover (live 2026-08-20, 0/33 baseline)** — all standing law; bullets archived verbatim
  2026-08-24 to `docs/plan/completed/progress-archive-2026-08-part2.md`. Records:
  ADR digest laws 71-82 · `wave-f-contract.md` · the sitting records · the F-A1 as-runs.

- **The render deployment is LIVE and WIRED (ζ, 2026-08-15):** `clara-render` hourly, image
  tag-AND-digest, `reports/` policy pair, dispatch bound via `fly secrets deploy`, PROCESS-read
  verified. **The e2e re-render DR drill stays UNRUN until the first sealed artifact**
  (`docs/ops/DR-render.md`); TA-P14 schedules it before N3.
- **Hard constraint 12 is STRUCTURAL:** `0062` walls RS-customer enrichment in the DB
  (fact-driven, uuid-pinned, self-proven at apply); `0063` makes lifting it an OWNER act.
  *(Superseded framing, 2026-09-02: hard constraint 12 is now VACANT per AGENTS.md — the
  name-only wall is a PRODUCT INVARIANT, `docs/product/PRD.md` §6 invariant 2(b), not an agent
  constraint; `0062`/`0063` themselves are untouched and this bullet's mechanism claim still
  holds, only its "hard constraint 12" label is stale.)*
- **Harness hardening live in-repo:** the dispatch-model-guard PreToolUse hook (constraint 5,
  44-case selftest) beside pinned-ids; `.claude/rules/`; the Wave-E δ contract drill.

- **Evening sitting 2026-08-30: 裁-57…72 filed** — paid beta (RM0 trial until the pricing sitting), checkout tranche + tier-3 signup gate on the critical path, tax inert at beta (裁-62), cutover after ALL 110 dashboard-only/orphan verbs have an apps/web home (裁-72, trains P6-C1…C7), P4-7 magiclink arm (裁-65), `/ready` hard-fail (裁-61), DB-resolved proposal bases (裁-69). Ledger: `docs/plan/active/mohe-grill-rulings-2026-08-30.md`.

## From `## Session log` — the two oldest entries, pulled 2026-09-02 to keep the file inside its cap

- **2026-08-31 morning — THE BETA PIVOT (裁-73…裁-84).** The owner's direction (stop unbuilt backend, all-in frontend, Stripe, direct beta, Codex takes over) grilled one question per turn after a 167-agent harness-drift scan (13 families, 136 verified findings → #465) and a happy-path trace; the four holes, the twelve rulings and the two dissents are in `docs/plan/active/mohe-grill-rulings-2026-08-31.md`; the handoff of record is `docs/plan/active/frontend-sprint-handoff-2026-08-31.md` (+ orders); ADR-0077 drafted (SIGNED that evening, 裁-93). Native review capacity was measured BACK (the dawn entry's "until Sep 5" is dissolved). **Second sitting (~13:00 MYT, 裁-85…87):** the owner kept the seat here — lanes by the orchestrator-fable philosophy, the lean ladder (one opus leg + a Playwright e2e leg), Stripe through this session's connector; the handoff re-cut as the next Claude session's opening document.
- **2026-08-30 evening (裁-57…72)** — paid-beta ruling, checkout tranche + tier-3 gate on the critical path, tax inert at beta, the P6 cutover criterion widened to all 110 verbs (trains P6-C1…C7), P4-7 magiclink arm, `/ready` hard-fail, DB-resolved proposal bases. Full ledger `docs/plan/active/mohe-grill-rulings-2026-08-30.md`; posture bullet above carries the digest.

## The 2026-09-02 03:00 pre-pause sweep banner (moved verbatim 2026-09-02 at the checkpoint truing)

**⇢ THE PRE-PAUSE TRUING SWEEP — 2026-09-02 ~03:00 MYT (this file's own clock-out PR).** The owner has ordered a COMBINED PAUSE WINDOW opening now: vhdx compaction (52.9 GB reclaimable inside the WSL disk file) + the owner's own Claude Code update (this session and every lane terminate; state must live in-repo). **Resume starts from THIS file plus the evening state bridge in `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`** (§"Evening state bridge — 2026-09-01 close"). **Frontier** (as of this PR's base, `4a0e80b2`): the repo frontier is `0159` (`0154`–`0159` merged but NOT applied); **LIVE stays 148/`0153`** until the Wave-G reset applies the full unapplied span (re-verify live with `select count(*), max(version) from clara.schema_migrations` before trusting this snapshot). **15 PRs merged 2026-09-01 UTC** — #455 #478 #482 #483 #486 #487 #488 #490 #491 #492 #494 #496 #497 #500 #502 — under **裁-111's two-leg gate: the cross-family Codex adversarial review is SUSPENDED until beta live** (owner ruling, 2026-09-01 late afternoon; Codex stays a BUILD lane throughout), so ONE fresh-context opus read-only review plus the Playwright browser e2e leg is now the complete review gate — this REPLACES every prior phrasing that described law 28 as split across a build leg and a review leg; **裁-112** folded the OVERCLAIM lens into both surviving briefs. **Open queue right now:** **#484** (claims `0160`; 裁-113's rewrite+checked-waiver executed, scoped re-review CONFIRM pending; `db-live-gates` RED under diagnosis — `0160`'s new webhook role pair × merged `0154`'s role-count guard × roles surviving a schema reset; lander fixing; auto-merge armed) — **THE GATE for the rest of the C-chain** · **#493** (C-3, claims `0161` after #484) review-CLEARED, DIRTY and deliberately UNNUMBERED per 裁-108 · **#499 #498 #495 #489 #485** review-complete and auto-armed, all held BEHIND (the cascade is FROZEN for the owner's pause window) · **#501** (the shared-helper round) CLEAR on correctness, retarget to `main` owed (#497 merged 18:22Z) · the **backend queue** #447 #448 #452 #456 #449 #460 drains non-gating in parallel behind (measured: #460/#456/#452/#448/#447 DIRTY, #449 BEHIND). **Beta-gating remainder:** the five P6 polish trains · FS-9 conformance · FS-10 cutover · FS-11 the reduced Wave G · the four alignment items (Next item 1's new sub-list). **Standing review law:** the 09-01 morning and afternoon/evening sittings' ledgers (`docs/plan/active/mohe-grill-rulings-2026-09-01.md` + `-09-01-pm.md`) carry **裁-107/107a/107b (the bidirectional seam↔door diff, in the PR body, cited by every claim about a door), 裁-108 (an unnumbered migration merges silently and never applies), 裁-112(a/b/c) (scope-not-pattern · model-as-oracle · duplicated-predicate), and 裁-113 (rewrite + checked waiver, never a trusted one)** as STANDING review laws, binding on every PR from here forward. *(The previous banner — the 2026-08-31 beta pivot — is archived verbatim in `progress-archive-2026-08-part7.md`; its rulings all stand.)*
