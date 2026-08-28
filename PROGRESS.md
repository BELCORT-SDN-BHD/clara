# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-28 — **THE 磨合 WINDOW IS OPEN AND SPRINTING: P1-P3 MERGED IN FULL
(#357-#367) · the night train #368-#384 ALL MERGED** (PR-1c `0138` · rulings ledgers · P4
design set · verb census · `0139` · needs-you wiring · PR-2a `0140` · Mobbin grounding ·
the port-wave plan · the resource audit · the ceremony as-run) — **LIVE 135/`0140`** (the
0139+0140 D1 window RAN 2026-08-28), F-A7b BUILD-AUTHORIZED, **the PORT WAVE IS RUNNING:
T0 seam + WAVE A COMPLETE — T3/T6/T5/T9 MERGED (#382 #385 #386 #387 #390); Wave B
(T4/T7/T8/T10) BUILT and in independent review; P4's `0141` in its final pin round**)*

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

- **W4 (THE CLOSING WINDOW) MERGED AND CEREMONIED 2026-08-26** — the Wave-F train's final
  eight items merged (0129 #343 · 0131 #346 · 0132 #345 · 0133 G1 #349 · 0134 #348 · #347 ·
  0135 #351 · 0136 #350) and NINE migrations ceremonied in one combined D1 window, **live
  122/`0127` → 131/`0136`**, the BL-3 flip lighting card-1 stage (b) (freeze 7/7, manifest
  locked). The pre-window sweep gate earned its keep (a stale closed-wave floor caught RED,
  fixed as #352). As-run `docs/plan/completed/wave-f-w4-ceremony-asrun.md`; **the full bullet
  and the earlier Wave-F windows (W1 · D-a · W2+W3 · the F-A2 opener train) are archived
  verbatim in `docs/plan/completed/progress-archive-2026-08-part3.md`.** The byte-burn render
  worker stays F-A5b PR-3 by prior ruling — sequenced, not owed.

- **THE TEST-DATA AUTHORITY IS WIDENED — ADR-0075 (digest law 82), owner-ruled 2026-08-23.**
  Every client is a resettable TEST fixture until go-live: **DATA is free** (live DB included);
  **GATES are walked by the agent as the owner's delegate** through the REAL audited doors,
  receipted, secrets env-to-env (e-filing excluded); **MECHANISMS NEVER MOVE** — the operative
  clause on any collision. Constraints 12 retired / 13 rewritten / 14's beta expiry stands.
  A Known-issues or Backlog row is the only lawful home for a deferral.

- **The Track-A sitting (ADR-0074, fourteen TA-P rulings + the four ratified constitutional
  amendments + laws 78-81), ADR-0072's five F-A2 ruling blocks, and the F-A1 witness-pair
  cutover (live 2026-08-20, 0/33 baseline)** — all standing law; bullets archived verbatim
  2026-08-24 to `docs/plan/completed/progress-archive-2026-08-part2.md`. Records:
  ADR digest laws 71-82 · `wave-f-contract.md` · the sitting records · the F-A1 as-runs.

- **The standing law is ADR-0071 + 0072 + 0074 + 0075 (digest laws 71-82).** Deep-scan N1-N6
  keep their dispositions; N2/N4 are LOST records re-scanned at design stage (TA-P14 cl. 6).
- **The render deployment is LIVE and WIRED (ζ, 2026-08-15):** `clara-render` hourly, image
  tag-AND-digest, `reports/` policy pair, dispatch bound via `fly secrets deploy`, PROCESS-read
  verified. **The e2e re-render DR drill stays UNRUN until the first sealed artifact**
  (`docs/ops/DR-render.md`); TA-P14 schedules it before N3.
- **Hard constraint 12 is STRUCTURAL:** `0062` walls RS-customer enrichment in the DB
  (fact-driven, uuid-pinned, self-proven at apply); `0063` makes lifting it an OWNER act.
- **Harness hardening live in-repo:** the dispatch-model-guard PreToolUse hook (constraint 5,
  44-case selftest) beside pinned-ids; `.claude/rules/`; the Wave-E δ contract drill.
- **Runtime:** Fly `clara-runtime`, single machine, `/ready` 200 — last known tag **v66 (2026-08-21)**, carrying **witnessFacts.v2** + **statementFacts_v2** + riders ③④. **MEASURED 2026-08-26 in-VM (labelled, version tag un-re-derived this session):** the serving bundle's registry pins `chatTurn: chatTurn_v13` / `autoDraft: autoDraft_v9` — `chatTurn_v14` is **NOT** yet serving (Next item 1's pre-flight note). The three `CLARA_RENDER_FLY_*` values are bound. Dashboard: Pages `app.clarabook.com`. `clara-backup` daily. `clara-render` hourly.
- **Books pins:** RS trial balance **3,396,500 = 3,396,500** (`trial_balance_as_of`, re-read
  at every ceremony) · RS customers **11/11 NAME-ONLY** (the enrichment trap holds) ·
  `client_facts` = 7 rows (3 carryover + 3 MSIC + 1 doored entity_type).
- **The close model is LIVE-INERT:** zero `fiscal_years` rows; activation is the first human
  `open_fiscal_year`. The snapshot registry is likewise inert (zero `reporting_periods` /
  `period_snapshots`) until the first `mint_month_snapshot`.
- **CI (ADR-0073 two-runner base; expanded to four 2026-08-23, `docs/ops/ci-runner.md` §"Runner
  count expansion to four" — ADR/digest addendum owed, owner CONFIRMED the expansion standing
  2026-08-26, see Backlog):** self-hosted
  `clara-wsl`/`-2`/`-3`/`-4` — FOUR instances since
  2026-08-23, all verified online (private-repo-only
  law). Per-PR (~13 min, parallel): lint · build · estate suite + deploy-onto-existing ·
  live e2es + DR pair · render drill · partition gate; **closed-wave drills + frontier
  matrix on the weekly sweep + manual dispatch only**; required check `ci` = fail-closed
  meta-gate. After any PR touching a closed drill or the pipeline: `gh workflow run ci.yml`.
- **Hard-blocked ids** (canary `daba7f2e` · witness `d023b48c`) — hook-enforced
  (`scripts/hooks/pinned-ids-guard.mjs`, tracked `.claude/settings.json`).

## Lanes

| Lane | Scope | State | PR |
|---|---|---|---|
| Wave F · Track A | **F-A1 IS DELIVERED (2026-08-20)** — PR-1 #263 (0089-0095) · PR-2 #265 (witnessFacts.v1, v64) · PR-3a #266 (autoDraft_v8 + chatTurn_v12) · **PR-3 #267 (0096 + 0097 CUTOVER, ceremonied 2026-08-20)** · **PR-4 #268 (0098, shipped UNPOINTED — activated at the 2026-08-21 window)**. Consents granted+activated RS/BEE/RPR. **Corpus MEASURED**: witness 0/33 vs legacy 28/92 on two named conjuncts (NIL-TAX; the type_code prompt-intent mismatch) — **both fixed by the openers and re-measured 2026-08-21**. D12 identity gate PASSES. | ceremonied | #263 #265 #266 #267 #268 |
| Wave F · Track A — **the F-A2 openers ①-⑥ + the statement activation** | **CEREMONIED 2026-08-21** (combined Windows A+B; as-run `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`). ③④⑤ #270 `a36044bb` · ①② DB #271 `e330f421` (0099/0100) · ⑥ #273 `90073b14` (0101) · ①② runtime #272 `c695a675` (witnessFacts.v2) · activation #274 `7f5617e0` (0102). **Live 97/`0102`, runtime v66**; both freeze manifests deploy-locked. **Re-measure 12/20 vs 0/20 like-for-like** (denominator rule binds). | **ceremonied** | #270 #271 #272 #273 #274 |
| Wave F · Track A — **F-A2 proper** | **PR-0 GATE RAN 2026-08-21/22; design at v6.1** (#282, `cfa0710` — the PR-1 build trues, six orchestrator rulings under the standing delegation, **R-L1..R-L6 ledgered as D38-D43**: **D38** B8 resolved from the sources — no citation names a SUPERSEDED fact generation, α scoping, C.3 becomes a five-cell set · **D39** the retirement CLAIM SPLIT — breeding-claim tests retire in PR-1 with the 8th body, verb-existence tests in PR-3 · **D40** lock order is the delegate's own (filing `FOR SHARE` → entry row → vendor `203005003` → client `203005004`), closing an ABBA against a concurrent human approve · **D41** the D1 list stays TEN and the supplier floor's BODY moves · **D42** B7's amount-bearing evidence is `field_path='invoice.total'` · **D43** `sweep_runs.posted_count` is a FOURTH counter, so finalize is drafted + skipped + refused + posted = expected). Gate record `docs/plan/active/f-a2-pr0-gate-record.md`: 8-lens independent review + Codex cross-model pass, every finding adversarially verified — **3 blockers** (the generic-on-directional hole → **B15** · B10/B11's pre-stamp counterparty raise → projected-state predicate · the unbuildable-as-written `interactive_client` limb → corrected, both CHECKs extend) + **11 materials** (headline: B4-sales derived against a body superseded at `0022` — 4 independent confirmations) + nits; **S1 seam and T3's pin held every attack**. **Width: B12/B13 CUT on correctness grounds · PR-1 = THREE files, one D1 window · chat parity RIDES THE TRAIN — owner-ruled 2026-08-22 (方案二, D34), overriding the gate's severance; orchestrator's dissent on file.** **OQ-2/3/5 RULED 2026-08-22** (owner, per recommendations: stop-write-keep-table + drop the permanently-false `rule_backed` column · preview verb retires + the seeding tick re-points to the knowledge layer · B4-generic adopted with both costs priced and MEASURED at PR-4). Build NOT started — PR-1 authoring is next. **R1 relaxation approved 2026-08-23.** **BUILT AND LANDED 2026-08-24: PR-1 MERGED (0106-0108, #311, five review rounds + cross-model) and W1-CEREMONIED (live 103)**; PR-1b = 0109 (#316, cascade) · PR-2 runtime (autoDraft_v9/chatTurn_v13, WDK registrations bundle-proven; **GM-10 re-admit door found missing by the verify lane and in Codex build** + two stale pin bumps) shipped via the D-a deploy window. **PR-3 (cutover + rules-tier retirement, 17 verbs) MERGED (0118, #324) and CEREMONIED 2026-08-25** as part of the W2+W3 window — as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. F-A2 proper is now fully live end to end. | **merged + ceremonied** | #311 #324 |
| Wave F · Track A — **F-A3 bank agency** | **DESIGN v2, GATED 2026-08-22** — the seven `bank-agency-*` files (survey · design · four annexes · gate record [`bank-agency-gate-record.md`](docs/plan/active/bank-agency-gate-record.md)); gate 1 ran two lenses, 5 blockers / 6 materials folded, width severed into PR-1a pure extraction · PR-1b agent limb · PR-1c egress · the clock PR (which sequences AFTER F-A4 mints the wake kind, R-L7). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): open-register verbs (enter/void statement · certify · unmatch ANY pair · resolve exception incl. write-off · **the 60-day waiver, running at 60 until F-A3's battery gives the owner data**) + a duplicate-payment wall + `add_bank_account`'s COA-binding check · new `bank_matching` purpose, per client · clock-driven under law 71 · **the bank rules machine retires whole and 7A-R3/E-R13 are recorded dissolved** · owns drawer-2's vacuous-green gate. **BUILT 2026-08-24: PR-1a/1b/1c authored + reviewed (1b's D-11 near-erasure caught and rebuilt from the live catalog); 1b's promotion verb RENAMED `wake_propose_bank_identifier_promotion` (c623178, conductor arbitration — F-A7 owns the door per TA-P8; consolidation onto pi's `_identifier_promotion_core` is a ledgered forward obligation)**. **ALL THREE MERGED + CEREMONIED 2026-08-25 as part of the W2+W3 window**: PR-1a (`0119`, #327, nine pure core extractions) · PR-1b (`0121`, #328, the agent limb — a first-chain-meeting fix round found + fixed the DR-roles omission and the frozen-window cross-PR pin, see lane-brief) · PR-1c (`0122`, #330, `bank_matching` admitted to the egress-purpose family). As-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. **PR-3 (the clock train, W4) BUILT 2026-08-25, migration `0129`** (branch f-a3/pr-3-clock, PR #343): the eleven-verb bank-rules learn loop retires whole (`propose_bank_rule` · `sign_bank_rule` · `retire_bank_rule` · `accept_bank_rule_suggestion` · `_bank_rule_sightings` · `_bank_rule_pattern_norm` · `list_bank_rule_candidates` · `list_bank_rules` · `list_bank_line_suggestions` · `match_bank_line`'s and `settle_from_bank_line`'s rule-arity overloads) — **E-R13 and 7A-R3 are RECORDED DISSOLVED with the machine** (E-R13's corroboration intent rides the witness pair, F-A1; 7A-R3 was already recorded dissolved at TA-P11 clause 2); `clara.bank_rules` and its history stay KEEP-AS-HISTORY. Also carries OQ-7 (staff-advance sibling, deliberately EXCLUDED from chat parity — the ordering decision, permanently pinned by a roster-difference cell), the SS3 identifier-promotion confirm door (OQ-8, scoped to bank_account only after a review-round fix closed a statutory-identifier-injection gap), and SS4 chat parity (OQ-6) with a full owner-ruled provenance-threading fix (an `interactive_client` act now writes the real human's identity/kind/attended-arm through every bank-agent receipt and agent-core ctx; a `bank_agent` act is byte-unchanged; `entry_post_receipts_via_wake_kind_check` widened extend-only). **A SECOND fix round closed a dense review batch 2026-08-25**: the falsely-claimed `wake_fn_allowlist.fn_name` non-bug (refuted live — the column is a real generated alias from `0007`, the claim traced to checking only `0002`; both flagged prestate/tail queries ran clean before and after) · MUST 2a (the DOA `wake_book_staff_advance_application` allowlist row, added in the SAME commit as the `f31w.o` roster's extend-only 13→14 pin, plus the CLR08 agent-post-receipt wall it was missing) · MUST 2b (the confirm door's two-sided normalization mismatch — `client_identifiers.value_normalized` re-derived to match `counterparties.registration_normalized`'s stripping, both polarities incl. punctuated forms cells) · MUST 2c (the confirm door no longer accepts a model-proposed `identifier_kind` — typed `identifier_kind_out_of_scope` refusal, `bank_account` only) · MUST 2d (the confirm door refuses `promotion_target_ambiguous` on `count(distinct client_id) > 1` instead of silently picking one) · the SS-TAIL byte-identity wall now actually proves non-vacuity (was declared-but-unused) · a `lock_timeout` + the D1 inventory's ACCESS EXCLUSIVE line · `identifier_promotion_confirm` dropped from `bank_agent_receipts_act_kind_check` (law 31, no writer) · the vestigial `p_via_rule` parameter censused closed · the three new dashboard doors (`listOpenBankLineExceptionProposals`, `getBankAgencyHold`/`setBankAgencyHold`, `listOpenBankIdentifierPromotionProposals`/`confirmBankIdentifierPromotion`) gained full wire-shape pinning cells in `bankApi.test.ts` · `packages/runtime/lib/pools.mjs`'s now-false "interactive_client holds EXACTLY ONE allowlist row" docstring corrected (the frozen `chatTurn.v13.infra.ts` twin is left byte-untouched, constraint 9). Full estate suite + migration replay re-run clean on a freshly rebuilt INSTANCE-UNIQUE rig after a fleet scratch-dir collision required re-deriving every prior "green" claim. **PR-3 MERGED (#343, 0129) and the chatturn-v14 grants half MERGED (0130); both CEREMONIED at W4 2026-08-26** — the eleven-verb retirement is LIVE (probe: absent + surviving-overload controls, as-run §7). The chatTurn_v14 runtime-bundle deploy state was NOT re-measured this session — re-derive at the 磨合 opening before assuming v14 serves. **F-A3 owes G1's INSERT-and-flip follow-up** (the `bank_agent` `wake_engine_sources` row ships `enabled=false`; F-A3 flips it when its wake workflow body ships). | **PR-1a/1b/1c + PR-3 merged + ceremonied** | #327 #328 #330 #343 |
| Wave F · Track A — **F-A4 close key ①** | **DESIGN v2, GATED 2026-08-22** — the five `close-key-1-*` files; gate record [`close-key-1-gate-record.md`](docs/plan/active/close-key-1-gate-record.md) (3 blockers / 10 materials folded; **OQ-7/OQ-8/OQ-9 ruled by R-L12/R-L13/R-L11**). **OWNS the clock spine** (R-L7 — F-A3/F-A5/F-A8 consume it) and **OWNS task #17 Fix A at PR-1b** (R-L9/GM-7/D-23). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): mints the product's FIRST calendar wake source (new wake kind, CHECK pair, six rosters; law 71 posture, no ramp) · open-year / abandon-any / re-freeze / snapshot-mint pass to her · **the minimal human doors are IN SCOPE** (finalize · abandon · a "Clara proposes close" card + its durable carrier) · evaluator-backed adjustments post, judgement accruals draft · owns the uncoded-voucher gate · **shares ONE D1 window with task #17 and TA-P6 on `finalize_close`**. **BUILT AND LANDED 2026-08-24: PR-1a MERGED (0104, #310) and W1-CEREMONIED** — the measurement layer's first live census fired as designed (4 clients / 28 undated filings, R-3/P2). **PR-1b (Window-B close-lifecycle writers + task #17 Fix A) went through a MUST-FIX cross-model round (Codex + opus, 11-item fix order, all closed 6bcba5c) and MERGED + CEREMONIED 2026-08-25** (`0120`, #329) as part of the W2+W3 window — as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. **Annex A.4 row 7 RULED 2026-08-25 (owner, debt-clearing sprint) and BUILT same day**: `segregation_mode` follows the real `v_agent_prepared` probe on row 7 too — a new truthful `no_preparation` value (CHECK widened, extend-only) for a year no human AND no agent prepared, `agent_prepared` reserved for when the agent genuinely did; D-2 (all-agent-drafted + human-approved-without-revision → `agent_prepared`, no distinct-checker raise) stays exactly as-ruled, framing note added. `finalize_close` CoR'd; `reopen_fiscal_year` investigated and found to share none of the row-7 arm (its own CLR05 gates already exclude the "nobody at all" state), pinned not touched. Branch f-a4/pr-1b2-a4-truth, migration `packages/db/migrations/0128_f_a4_pr_1b2_a4_truth.sql` — built + rig-verified (152/152 close-model family incl. 4 new behavioral cells across the three modes + the CHECK census, F-A5's separate `issue_mode` census unaffected) — **MERGED + W4-CEREMONIED 2026-08-26 (`0128`)**. ~~PR-1c (`statutory_deadlines` DDL)~~ — **RE-LABELED 2026-08-27: `statutory_deadlines` was never this train's content; the DDL re-homes to the payroll-calendar spec (F-T2) as its own currently-UNOWNED lane.** **PR-1c SHIPPED AS THE CLOSE AGENT LIMB — `0138`, #368, MERGED 2026-08-27**: `close_proposals` + `agent_act_receipts` + `close_prep_holds` (forced RLS) · the deferred Tier-C receipt wall on `close_runs` · twelve wake wrappers (six reads + begin/abandon/open-year/depreciation-catchup/snapshot-mint/propose) · `settle_close_proposal` · `p_from_proposal` attestation provenance · wrapper 13 parked with a positive-absence cell. Full ladder: Codex adversarial (2 HIGH/6 MED/2 LOW) + native double-rig fresh-context review (confirmed HIGH-2 broader — the ON-CONFLICT receipt could return the WRONG VERDICT on 9/12 wrappers — and found the seam-census CI-red) + **the owner's law-71 ruling 2026-08-27 (the design's reading stands: preparation is agent-lawful; finalize/reopen/attest/settle are human-only)** + fix round FIX-1..12 (headline: fail-closed receipt identity guard + `(verdict, rung_digest)` in the unique key) + **re-verification CLEAR**; seven residuals carried by name (item 1 PRIORITY: a firm viewer reads agent model/rationale off `close_proposals` — next debt batch). Records: `docs/plan/active/fa4-pr1c-codex-review-2026-08-27.md` · `docs/plan/active/fa4-pr1c-fix-order-2026-08-27.md`. **PR-2a SHIPPED — `0140`, #377, MERGED 2026-08-28** (design 4-pass #372 with §13.1 owner rulings + the §13.2 self-twin ruling): the prepayment limb — `document_service_periods` + wrapper-12 draft-only + the `prepayment_schedule_v1` evaluator (single-member freeze, `deployed=false`) + five CoRs incl. the 42846-forced `_adj_period_lines` deviation + `proposed_request_digest` = sha256 over `jsonb_build_array(...)` (the injective transform-stable identity — never md5, never a delimiter concat) + the congruence walls (per-line one-positive-side; exact cadence tiling). Full ladder: double build review ×3 rounds + Codex digest pass + a CI-caught seam-census red (the dbSeamCensus ledger owed `0140`'s three new projection keys — live unrendered debt assigned to PR-3's sign surface, the instrument ceiling now in the census test's own header). **The `0139`+`0140` apply CEREMONIED 2026-08-28** (D1 window; W36/W37 null-stability rig-proven first, tripwire 7/7 byte-match on live; as-run `docs/plan/completed/mohe-0139-0140-apply-asrun.md` — live 135/`0140`, the limb live-inert, evaluator `deployed=false` until PR-2b). PR-2b = the runtime train (close-key-1-design.md:477's referent). **The `0137`+`0138` apply CEREMONIED 2026-08-27** (windowless — no live writer body moved; as-run `docs/plan/completed/mohe-0137-0138-apply-asrun.md`; live 133/`0138`, the limb live-inert behind `enabled=false`). F-A4 owes G1's INSERT-and-flip follow-up (the `close_prep` `wake_engine_sources` row ships `enabled=false`). | **PR-1a/1b/1b2/1c/2a merged; 0139+0140 ceremony owed** | #310 #329 #342 #368 #377 |
| Wave F · Track A — **F-A5 reporting agency** | **DESIGN v2, GATED 2026-08-22** — the five `reporting-agency-*` files (renamed from `fa5-agency-*` at landing); gate record [`reporting-agency-gate-record.md`](docs/plan/active/reporting-agency-gate-record.md) (3 blockers / 7 materials / 1 nit folded; **OQ-5 ruled by R-L14** — the solo self-attestation arm on the agent lane; **the sandbox EXPORT path severed to lane F-A5b, R-L15**). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **"end to end" rewritten open→evaluate→seal→render — ISSUE IS HUMAN** · the issue wall re-arms on the DIRECTING human, self-run fails closed to a human, `agent_prepared` receipts, a solo arm · self-run packs exempt from `0084`'s orphan-adoption · sandbox exports with a **byte-burned watermark** + the covered-recipient cross-client test · **the first real seal + byte-reproduction drill precedes N3**. **BUILT AND LANDED 2026-08-24: PR-1 MERGED (0111, #318 — `clara._hash`'s 55 call sites froze at its merge)**; PR-2 (0112) and the C-flip ceremony landed via the D-a deploy window (live 112/`0117`). **PR-3 (the 11 h seal + byte-reproduction drill, Track A's last unbuilt item) went through a full cross-model ladder (MF1/MF2/fold-in/S4-S8 all fixed with mutation proofs, D1 NONE confirmed by catalog differential) and MERGED + CEREMONIED 2026-08-25** (`0127`, #334) as part of the W2+W3 window — as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. Three debt-sprint items named at review (N1 seal-drill CI leg decision, N2 drill/cell-D doc line, N3 defence-in-depth cell — see Backlog). PR-4 renderer next. | **PR-1/PR-3 merged + ceremonied** | #318 #334 |
| Wave F · Track A — **F-A6 audited freeform read** | **DESIGN v2, GATED 2026-08-22** — the five `freeform-read-*` files; gate record [`freeform-read-gate-record.md`](docs/plan/active/freeform-read-gate-record.md) (4 blockers / 5 materials folded; **GB-1 ruled by R-L16** — the default SHIPS with grant + one-arm/one-settle and its three required cells; **the cross-client sibling verb severed to lane F-A6 v2, R-L17**; **XLSX/DOCX structured-parse excluded in v1, R-L18** — a named contract deviation). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): a **DECIDED** read surface: server-side client scoping, cross-client as a named receipted action, HOME chat firm-wide, an **enumerated table list printed as an audit line (closes audit GAP5-5, HIGH)**, `interactive` only at first, no RBAC tiering, no per-firm signature gate · a **DEFINER read wrapper** — no receipt, no read · bookkeeper+ human read surface · law 28's cross-model pass still mandatory. **PR-1 BUILT 2026-08-24** (battery + censuses + closed-world roster maps; P-12 measured FALSE — 57014 untrappable → Tier D); the law-28 pass runs via a native fresh-context lane (Codex's cyber filter refused the prompt); merges post-W2. **Independent review round 1 (2026-08-25) came back FIX ROUND REQUIRED (4 MUST-FIX)** — headline: §0.1c's security register described a fold that was largely not built, proven by exfiltrating a live `clara.wake_secret` through the real verb. **Round 1 CLOSED, pushed `445e1d0`**: MF-1 (H-1 secret-clearing genuinely built — `_freeform_firm()`/`_freeform_shares_firm()` off the armed receipt row, txn-scoped `arm_txid`, all 35 policies swapped, secret cleared before the cursor opens — the reviewer's own fresh-rig re-attempt REFUTED ITS OWN hypothesis, confirming the clear is real), MF-4 (acl-baseline.sql's three load-bearing `confined` arrays widened 5→7, replayed live), MF-2/MF-3 (function-scan plan census + `function_not_enumerated` refusal; `scope`/`scope_clients`/`scope_note` model-facing keys), all five SHOULDs, all three NOTEs, a full §0.1c line-by-line re-derivation (found a 5th false register claim beyond the reviewer's four — three "built into the battery" citations against a battery file that does not exist), and the B-1 pg_catalog residual folded to its definitive owner ruling (#340: structurally NO-GO on managed Supabase, measured). Estate suite on the real post-merge 0001-0128 catalog: 2959/2884/2/73, both failures confirmed environmental (a destructive-guard correctly refusing an unauthorized seed step; a `grep`-not-on-PATH artifact of the verification launch mechanism) — neither is F-A6 code. **Round 2 (narrow) IN PROGRESS 2026-08-25**: the same reviewer measured a live MF-2 census escape (`ROWS FROM (query_to_xml(...), generate_series(1,1))` and `XMLTABLE` both produce a Function Scan the name-keyed census missed — `Relation Name`/`Function Name` absent, `relations_read=[]`, the whole relation materialized past every cap) — fix is a ~3-line switch to `Node Type in ('Function Scan','Table Function Scan')`, the one key every plan node carries unconditionally; the scalar `query_to_xml` residual (H-3, no `Function Scan` node ever, by construction) stays open by design, unchanged. Plus 7 true-ups riding the same commit: `rig-meta.mjs`'s `clara_freeform_ro` expected-EXECUTE roster (was still asserting `wake_firm`/`shares_my_firm_wake`, the two functions MF-1 retired), S-1's register note (a payload-reachable `_freeform_settle`-from-inside-its-own-SQL primitive, Tier-D denial not forgery; a same-transaction wording fix), §2.1's stale "still registered" B-1 line, the pgcatalog-hardening-rehearsal doc's §7→§9 citation slip, two deploy postverify scripts' stale login-role arrays (missing `clara_wake_bank(_login)`/`clara_wake_filing`/`clara_freeform_(ro/login)`), `model_snapshot`'s no-v1-writer note (π ordinals 9/10 permanently NULL, PR-2-populated), and this row. **Named PR-2 (runtime) obligations, load-bearing not optional** (full text: `freeform-read-design.md` §7 item 4, and `freeform-read-annexes-2-record.md` Annex J R-3's S-1 note): **H-4** — the pool, not the verb, must set a session-level `statement_timeout` before calling `wake_freeform_read`; a `SET LOCAL` inside the verb cannot bound a single FETCH (PG arms the statement timer once, at the top-level statement's start), so this is the only wall that fires inside a stalled fetch. **H-5** — `withFreeformRead` must release the freeform pool connection with `DISCARD ALL`, not `reset all` (`reset all` does not release a session advisory lock a payload took on a well-known firm-derived key). **S-1** — `withFreeformRead` must call ONLY `wake_freeform_read`, never `_freeform_arm`/`_freeform_settle` directly (both are GRANTED to `clara_freeform_ro`, callable outside the verb entirely — a DB-unenforceable runtime-wiring discipline). **PR-1 MERGED (#346, `0131`, round-2's Node-Type census fix folded pre-merge) + W4-CEREMONIED 2026-08-26**; the H-4/H-5/S-1 runtime obligations above remain PR-2's load-bearing contract. | **PR-1 merged + ceremonied; PR-2 (runtime) next** | #346 |
| Wave F · Track A — **F-A7 filing + interview** | **DESIGN v2, GATED 2026-08-22** — the five `filing-and-interview-*` files; gate record [`filing-and-interview-gate-record.md`](docs/plan/active/filing-and-interview-gate-record.md) (6 blockers / 8 materials folded; severed into five trains — π additive · γ egress · α constitutional; **AM-8 WIDENED at landing**: Clara reverses her own posted misattribution herself and raises the question, only the cross-client re-home stays the human's). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED** — the α train's judgement half was gated on the ratification and is now unblocked on that axis. Ruled scope (ADR-0074): **attribution becomes her JUDGEMENT under structural walls — CONSTITUTIONAL, and RATIFIED as digest law 79 on 2026-08-22, so the judgement half is no longer signature-blocked**; four riders ship with it (contradiction wall · ROME-family collision guard · correction path + misrouted-egress event · the firm-scoped unattributed-document carrier) · the firm-level NARROW purpose with its closed document list, **gated on C6** · `classify` must come under governance first · the promotion door · F-A7b = CLIENT onboarding only. **BUILT AND (π) LANDED 2026-08-24: π MERGED (0103, #313 — after the conductor's no-op-revoke DR fix) and W1-CEREMONIED**. **γ, α AND β ALL MERGED + CEREMONIED 2026-08-25** as part of the W2+W3 window (as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`): **γ** — firm-narrow typed-egress governance (`0123`, #331), independent review CLEAN + a fold round for three findings, closed 2425b61; a cross-package fixture gap found and fixed (see lane-brief). **α** — judgement-basis admission + the congruence wall (`0124`/`0125`, #332), delta-probe CLEAR-TO-MERGE with 4 should-fixes landed and 8 prestate sha pins matching. **β** — the filing verb + interview wake surface (`0126`, #333); Codex 7 findings (1 CRITICAL cross-client double-file, rig-confirmed then fixed) + opus 4 (two production-shape inerts fixed) + delta re-probe CLEAN; **owner ruling B10** (other-client active filing → refuse + ask; human verb untouched); a first-chain-meeting fix round closed three failure classes (c5e8e10, reviewer's formal verdict CLEAR-TO-MERGE); 47-cell battery. F-A7's π/γ/α/β family is now fully live. | **π/γ/α/β merged + ceremonied** | #313 #331 #332 #333 |
| Wave F · Track A — **F-A8 internet lane** | **DESIGN v2, GATED 2026-08-22** — the four `internet-lane-*` files; gate record [`internet-lane-gate-record.md`](docs/plan/active/internet-lane-gate-record.md) (6 blockers / 9 materials folded; the annex was reconciled wholesale, PR-1 is greenfield **Tier-1 only**). **Two obligations still open before PR-2:** the law-28 cross-model pass on the Tier-2 injection surface, and the unnamed Tier-2 search VENDOR (`wake_web_search` does not ship until named). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **depends on F-T1 for the SST rate table** (F-A8 only attaches the fetch) · Tier-1 closes to `fx_rates` + SST rate + SST threshold · rows land through an **audited owner one-click door, not a PR** (two mechanical checks; `0016`'s assertion relaxed for Tier-1 only) · immutable+supersede, backdate triggers an impact scan, **missing row REFUSES** · no client identity on Tier 2 in v1 · **citation enforced at the tool boundary** | design | — |
| Wave F · Track A — **G1 wake-execution engine** (cross-item: F-A3/F-A4/F-A5/F-A7) | **RULED 2026-08-25** (owner: mechanism (b), one engine on the existing `kind='wake'` held projection) — design/gate/annexes at `docs/plan/active/g1-wake-engine-*`. **BUILT + MERGED + W4-CEREMONIED 2026-08-26** (`0133`, #349): `clara.wake_engine_sources` registry (forced RLS), the held→running→settled state matrix, `_settle_wake_task`'s dual outbox/task projections, its own `wake_engine_task_dead_letters` table. **Registry ships EMPTY by design §5** — `bank_agent`/`close_prep` seed rows land `enabled=false`; F-A3 and F-A4 each owe an INSERT-and-flip follow-up (recorded in both lane rows too). ADR/digest entry PENDING OWNER (see Backlog). | **merged + ceremonied; sources empty pending rollout** | #349 |
| Wave F · Track A — **F-A9 metering** | **DESIGN v2, GATED 2026-08-22** — the four `metering-*` files; gate record [`metering-gate-record.md`](docs/plan/active/metering-gate-record.md) (4 blockers / 6 materials folded; **PR-0 = the chat-cap hotfix FIRST**, then PR-1A the ledger reshape with no D1; **`llm_usage_events.firm_id` becomes NULLABLE for platform-level calls, R-L10** — a NULL firm is a platform call, never an unmetered one). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): ONE ledger: `llm_usage_events` reshaped for any call kind, **`client_id` + triggering actor added NOW (irreversible if missed)**; the Slice-4 ledger + reserve/reconcile machinery retire — **that deletes live real data, and the owner's ruling is recorded as that sentence** · the brake census is design's first deliverable (one page, one owner signature) · **the chat token cap ships as a HOTFIX ahead of F-A9** · the `refused_budget` rename is mandatory. **PR-4 re-homed to the Wave-G reset, W5 removed, ruling 2026-08-23.** **BUILT AND LANDED 2026-08-24: PR-0 MERGED (0105, #312) and W1-CEREMONIED — the `begin_chat_turn` recut is LIVE, law 76 is structural**; PR-1A = 0110 (#317, cascade; the reshaped writer `record_agent_usage_event` is F-A2/PR-2's chat-usage dependency). | **PR-0 merged + ceremonied** | #312 |
| Wave F · Track A — **F-A5b sandbox export** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — `sandbox-export-survey.md` · `-design.md` · `-annexes.md` · gate record [`sandbox-export-gate-record.md`](docs/plan/active/sandbox-export-gate-record.md) (four blockers / six materials / one nit folded). **The `sandbox_watermark` trio was owner-ratified 2026-08-23** (design §3.6a, owner question 1/OQ-2; survey X12) and B1's substitution seam likewise ruled (§3.6b/OQ-3's recipient-scope model) — **the lane is now BUILD-READY, no longer dark**; build rides the debt-clearing sprint. Default on the wording stands: no row seeded, and a missing row for the locale REFUSES the render. **REGISTERED 2026-08-22 (R-L15)** — severed out of F-A5's v2 as SEQUENCING, explicitly **not** a narrowing of TA-P10 C′; F-A5 proper keeps the sealed lane's `artifact_watermark` trio. **BUILT AND LANDED 2026-08-26: PR-1 (`0132`, #345) · the card-1 substitution seam stages (a)+(b) (`0135`, #351 — design docs #347; double-leg review + adversary re-attack, the ONE M6 finding fixed-before-merge with two guards; pc(cell,cell) proven legitimate) · the freeform basis fix-forward (`0136`, #350 — both-direction superseded-body re-derivation, dual-derivation byte-proof, A1/A2 adversary folds) — ALL MERGED + W4-CEREMONIED, and the BL-3 flip ran: `('evaluate_metric', 2)` is DEPLOYED, stage (b) LIT (freeze 7/7, manifest locked).** Remaining in-lane: **PR-3, the byte-burn render worker (placeholder→PDF end-to-end)** — sequenced AFTER card-1 by the pre-build ruling (0132:40), not owed to 磨合. | **PR-1 + card-1 + 0136 merged + ceremonied; stage (b) LIT; PR-3 next** | #345 #347 #351 #350 |
| Wave F · Track A — **F-A6 v2 cross-client named read** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — `freeform-read-v2-survey.md` · `-design.md` · `-annexes.md` · gate record [`freeform-read-v2-gate-record.md`](docs/plan/active/freeform-read-v2-gate-record.md) (two blockers / twelve materials folded; four OWNER CARDS stay open). **Hard prerequisite: F-A2 PR-1 MERGED** — the verb cannot function until `interactive_client` and both `wake_credentials` CHECKs land (design §6, survey U2). **Owner confirmation 2026-08-23: v1 waits for v2** (D-22 / R-L17) — recorded here because the lane's own survey (U4) and annexes flagged that the repo did not yet carry it. **REGISTERED 2026-08-22 (R-L17)** — severed out of F-A6 v1 as SEQUENCING, explicitly **not** a narrowing of TA-P9 A(2): the cross-client sibling verb cannot function until **F-A2's `interactive_client` limb merges**. v1's refusal `cross_client_unavailable` must NAME the deferred action (the battery cell forcing the naming stays in v1); HOME chat is unaffected. **Also carries R-L18's deferral** — XLSX/DOCX `structured_parse` content, excluded from v1 because `document_extractions`/`document_regions` carry no `client_id`, so a client pin would leak a sibling's document body (`get_document_extract` stays the door). | design | — |
| 磨合 · frontend (`apps/web`) | **P1+P2+P3.0 MERGED (#357 #362 #363) · P3 WORKBENCH FOLD COMPLETE — PR PENDING.** Charter: `frontend-handoff-2026-08-23.md` + its 08-24 addendum, widened by `harness-audit-rulings-2026-08-26.md` (R8/R9) and **RULED IN FULL by `mohe-grill-rulings-2026-08-27.md`** (Q1-Q9 + Q-A…Q-F — the production app is `apps/web` in THIS repo, the Codex `clarabook-frontend` output is design law + prototype evidence, merged and archived). **P1 MERGED #357**: Next 16.3.3 + TS strict + Tailwind v4 + shadcn(base-nova) + the ratified ClaraBook tokens (ported byte-verbatim; brand package verified 42/42) + next-intl + `@opennextjs/cloudflare`, plus 9 vendored design skills. **P2 (the shell) BUILT on four parallel branches** — **web/p2-auth** (Supabase SSR cookie auth, invite-only; Next 16 renamed middleware→proxy.ts) · **web/p2-parts** (the LIVE 18-member typed-`parts[]` union + the compile-time coverage guard + hydrate-never-trust + the two-lane wire with HTTP-status-before-CLR made structural) · **web/p2-rail** (the persistent Clara rail + URL-addressable full-screen thread escalation + the SSE authority model with backoff/give-up) · **web/p2-cmdk** (⌘K Go/Ask/Do, Do honestly inert until P3). Each went build → independent review → fix → re-verify; the cross-model (Codex) security pass on auth returned two HIGH (dropped anti-cache headers on the cookie writer; caller-supplied OTP purpose reaching an ambient session) — **both fixed in the auth fix round (13/13 dispositioned: 10 fixed, 3 recorded as owner/deploy obligations in `apps/web/README.md`) and re-proven by a fresh-context adversarial pass (CLEAR-WITH-NOTES: live header probe, bypass construction attempts, four positive controls proving the tests bind; its three actionable notes — dotenv precedence in the key gate, Origin scheme, a stale pointer — fixed in-fold)**. **P2 (the shell: auth · rail/threads · 18-part renderer · ⌘K) MERGED #362 and P3.0 (the human-lane `getRows`/`callDoor` foundation) MERGED #363.** **THE P3 WORKBENCH IS BUILT — five parallel lanes** (journals+JE review · firm needs-you/activity/register/registers/knowledge · close doors+reports/sandbox/freeform · documents+runtime proxy · bank), each through build → verb census at the LIVE migration body → independent opus review → fix round(s) → re-verification to CLEAR; the reviews caught and closed, among others: a fabricated RM 0.00/"tied" on the certify screen, a `__gate__` sentinel making year-end close unreachable, three invisible-refusal surfaces, a keystroke-eating amount input, the superseded-body row_kind gap, and a CORS-dead runtime boundary redesigned as a same-origin route-handler proxy (cookie-free, request-time env). Folded on **web/p3** + a dedupe commit (one `business-date` law · kebab `single-fire-guard` · citation truings); **521/521 tests** (exact per-branch delta arithmetic), typecheck/lint/leak-scan/build clean. Cross-cutting new mechanisms: the shared `useHydratedPart` latest-started-wins epoch guard · the component render harness with wire-body assertions · `apps/web/AGENTS.md` house laws. **Backend gaps: ~~PR-1c~~ CLEARED #368 (`0138`) · ~~the three human read surfaces~~ CLEARED #365 (`0137`; note `users_visible` includes REMOVED members by design — pickers filter via `firm_memberships`; the needs-you gaps card still renders not-built and owes the wiring) · still open: the byte-download door (F-A5b PR-3) · `list_freeform_reads`.** **P3 COMPLETED 2026-08-27**: #364 (the five-lane workbench fold, 521/521) → **#367 (the finale: ClaraBook token-contract conformance + motion + the six-door trigger fix · the three Q7 a11y CI gates · fold-seam truings — fold-delta review CLEAR, 583/583; the contrast gate is now UNCONDITIONALLY STRICT, and the seam pass found a throwing-`describe()` had been silently UNREGISTERING 4 declared tests)**. **The evening grill R1-R7 RULED + merged (#369)**: ClaraBook brand + Ledger Fold adopted · identity-canvas founder note (entry pages only) · focus ring unified on shadcn (a §9 founder amendment; recut PR owed to clarabook-frontend) · primitives build-on-demand · Mobbin MCP into `.mcp.json` (rides the next code PR) · the admin-floor draft-vs-sign law · F-A7b onboarding = in-thread interview. **The ClaraBook handoff conformance AUDIT ran** (consumed / diverged-by-ruling / gaps): Ledger Fold port + ClaraBook copy pass owed pre-P6; onboarding wizard routes superseded by R7. **The 08-28 sprint extended the lane**: the needs-you gaps card WIRED (#375 — `loadFirmOpenQuestions`/resolve/dismiss + the promotions loaders/doors, the two STALE-NOT-BUILT notes trued, 604/604) · **P4's design of record MERGED #376** (11 backend-asks · `requireFirmScope()` on three entrances · the `_create_firm_core`/`_add_member_core`/`_claim_identity_core` splits · operator floor = OWNER + `is_operator` · `uq_firms_one_operator`) with its Mobbin grounding #378 (7 build flags — reject-reason required · no bulk ops v1 · single-email invite · inline actions · Asana two-card tier) · the port-wave Mobbin sibling #380 · **the verb-coverage census #374 + the port-wave plan #379 (ruling A)** govern full-product coverage. **THE PORT WAVE IS RUNNING.** **T0 seam MERGED #382** (per-line test manifest + a count-control gate with a positive control — it immediately found 5 `.test.mjs` files the old bare-dir arg had been running unnamed; the needs-you affordance registry; the tab arrays final; 11 i18n namespaces). **Wave A COMPLETE: T3 #385 · T6 #386 · T5 #387 · T9 #390 MERGED** (T9 shipped the wave's consolidated `clickButton` instrument + the fake-DOM event globals; 729 tests on main). **Wave B BUILT 2026-08-28 (T4 `6c52713a` · T7 `31a4aad8` · T8 `34b18f6d` · T10 `626ebc9d`) — four independent opus reviews dispatched; two census-found backend gaps recorded under Known issues.** Every Wave-A car took the full ladder and every car came back FIX-REQUIRED — the defects the four gates could not see: a residual input that turned a typed RM50.00 into RM5.00 (three doors, proven key-by-key); a panel asserting an empty ledger it never read; a spinner rendered over a real 401; an unpinned refusal-banner contract (deleting it left the battery green); a client-side re-derivation of a DB predicate spawning phantom Retire triggers; a `!` turning a legitimate DB null into a silent blank. All closed, each re-verified by the SAME reviewer with both-direction mutation controls. **Wave-A instrument laws now binding on every later train** (folded into the Wave-B work orders): `h.fireEvent` silently no-ops on anything inside an open dialog's PORTAL — the shared guarded `clickButton` in `apps/web/test/hookHarness.ts` is the one instrument (it throws on a disabled node: assert the gate, then act); a click test must assert a DISCRIMINATING post-condition; loading/empty/error are three distinguishable states. **Next: Wave B reviews → fix rounds → same-reviewer re-verify → serialized merges → Wave C (T1/T2/T11 — after F-A7b PR-a merges, 裁-8) ‖ P4 tranches → the live-data e2e walk (Q9 rung 5; T1/T9 = FIRST EXECUTION per §9.3) → P6 at the DEEPEST tier (裁-9: four-card `chatTurn_v15` bump + WHOLE-frontend polish against the complete handoff resource set, a third conformance pass as the ENTRY gate → the cutover PR retiring `apps/dashboard`).** | **P1-P3 + P4 design merged; T0 + Wave A MERGED; Wave B in review** | #357 #362-#367 #375 #376 #378-#380 #382 #385-#387 #390 |
| Wave F · Track B — **F-T1 SST engine** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — the six `sst-engine-*` files (survey · design §1-§4 · design-part2 §5-§12 · annexes · annexes-2 · gate record [`sst-engine-gate-record.md`](docs/plan/active/sst-engine-gate-record.md)); five fresh-context lenses + independent re-attack (two blockers / sixteen materials / five nits confirmed, eight refuted). Fourteen findings folded into v2; **four reserved to the owner as OQ-11…OQ-14**, each blocking a PR. **OWNS the SST rate table F-A8 depends on** (ADR-0074/TA-P2). **OQ-4 RULED (owner, 2026-08-23): the GL carries the deferral** — `sst_output_deferred` credited at invoice for every payment-basis service-tax registrant, transfers to `sst_output` on allocation or the twelve-month day, whichever comes first; lands as PR-4b, a new D1 window sequenced after F-A2 PR-1. **PR-1 BUILT + REVIEWED 2026-08-24** (the F2 semantic inversion — predecessors seeded already-superseded — fixed at `0c46d2b`, reviewer re-probed 11/11); lands pre-beta if it fits, else opens the beta window (owner's B-variant re-scope, 2026-08-24). | **PR-1 built + reviewed** | — |
| Wave F · Track B — **F-T2 payroll deadline calendar** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** (`payroll-calendar-survey.md` · `-design.md` · `-annexes.md` · gate record [`payroll-calendar-gate-record.md`](docs/plan/active/payroll-calendar-gate-record.md)); gate fold complete. **Mints NO wake kind** — the chase rides `wake_record_notification` on the existing `proactive` credential (allowlisted for exactly that one function, `0002:558`), because the notice needs no capability that kind does not already have: the one-architecture test applied to a lane that could easily have invented a second. **The `statutory_deadlines` DDL SHIPPED 2026-08-28 as its own lane — `0139`, #373** (27 cols, 25 named constraints, relacl-IS-NULL census, the two-armed preintegration gate folded into `packages/db/package.json`'s `--import` chain; LIVE-EMPTY since the 2026-08-28 window) — **PR-1's blocker is DISCHARGED**; F-T2 contributes ROWS, not the table. **Eight owner questions**, including **the HRD Corp deadline conflict** (15th vs the last day of the following month) and **the weekend rule** (v1 is `working_day_basis = 'weekends_only'`, the field present so "public holidays are not handled" is a visible limitation, not a silent one). | design | — |
| Wave F · Track B — **F-T3 draft tax computation** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — gate record [`tax-computation-gate-record.md`](docs/plan/active/tax-computation-gate-record.md): five fresh-context lenses, **eleven blockers / eleven materials / one nit CONFIRMED, nine REFUTED — all twenty-two folded, none reserved for the owner**. **v1.2 folds the conductor's measured corrections**: the frozen evaluator closure collapses from ~12 members to **ONE** (`verify_evaluator_freeze()` ignores `deployed` and hashes the full `pg_get_functiondef`, so twelve members would freeze twelve bodies estate-wide and raise at a *later* lane's apply — **D-16**, re-measured at PR-0 as **P-10**) · `client_fact_keys` gains the generic name-only-wall scoping obligation, its own seed block and battery cell **C15** (**D-17**) · the `dispose_fixed_asset` prosrc pin corrects to `0041:3643` · **F-A9 is NOT an evaluator-roster claimant** (its priced view has no `prosrc`); the live claimants in merge order are **F-A5 PR-2 + the C-flip ceremony → F-A8 PR-1 → F-T3** · merge order recorded: **F-A8 PR-1 (train 13) → F-T1's SST tables → F-T3 PR-1**, F-T1 having no train slot yet. **v1.1** — three of the nine owner questions are RULED under the standing delegation: **OQ-6 → R-L25** (the Wave-F Tier-1 closure re-opens for F-T3's two tables, which land as **developer-seeded fact tables through the PR ladder**, not through TA-P2's one-click door — contract note `[TB-2026-08-23]`), plus **OQ-4** and **OQ-5**, and the law-review belt. **The owner ruled ALL-IN in Wave F** — F-T3 is not slipped to a later version. Base **v1** — (`tax-computation-survey.md` · `-design.md` · `-annexes.md`); **PR-0 gate pending**; **hard-gated on F-A5 PR-1 + F-A4 `close_receipts`**; owner questions **OQ-1/7/8** for the sitting. Three findings reorder the item: the tax layer is **greenfield** (zero repo hits for `cp204`/`form_c`/`add_back`/`chargeable`, and `0041`'s `ca_class` trio is written by the register and read by nothing — F-T3 is WD-R12's first consumer) · **no acceptance oracle exists in the owner's three folders** (no Form C/B/P, no CP204, no computation worksheet, no FA register — so acceptance cannot be "reproduce the accountant's prior year", **OQ-1**) · **the number path is live but has never carried a run** (`reporting_periods`/`period_snapshots` zero rows, no `report_run` ever opened) — a hard sequencing dependency, not a build-time discovery. | design | — |
| Wave F · Track B — **F-T4 fix queue** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** (`fix-queue-survey.md` · `-design.md` · `-annexes.md` · gate record [`fix-queue-gate-record.md`](docs/plan/active/fix-queue-gate-record.md), part of the joint Track-B gate — 19 confirmed incl. 6 blockers/10 materials, 14 folded into v2; **PR-1 (the DSN bridge) severed by owner ruling and builds standalone**). Five PRs: **the ceremony DSN bridge first** (in-repo at last — it was never in the repo, and every remaining Wave-F/G ceremony walks it) · **N5 as a governed `refusal_remedies` table** rather than a `fix` backfill across ten applied migrations, preserving the coding mapper's no-raw-text hardening · **the 401/403 split** with a retryable `engine_auth` code, at the two human doors only · **P-3's drawer-1 census via a `banking_arrangement` client FACT** on the `trade_nature` precedent, never an attestation (drawer 1 has no attestation path and gains none) · **item E's two cells**. **The claims accounting convention (§8) is an OWNER SITTING QUESTION**, with MPERS / CA 2016 / LHDN citations fetched 2026-08-23 and four NOT-FOUND absences recorded honestly. Cross-item **X-1**: the bank-class COA account any registry-vs-ledger predicate keys on is **minted by registration**, which makes F-A3's arm 4 vacuous on the same population. **No rig ran — every body-level claim is a prediction for PR-0's replay.** **PR-1 (the ceremony DSN bridge) MERGED 2026-08-23 (#308)** and already carried the W1 ceremony's every live connection (`verify-full` + pinned CA, env-to-env). | **PR-1 merged; rest beta-era** | #308 |
| Wave F · Track B | tax per the contract (F-T1..F-T4). **task #17 UNBLOCKED** — R1 ruled (ADR-0072 ④); Fix A's **owner = F-A4 PR-1b, and Track B's 13-cell battery rides it** (R-L9 / close-key-1 D-23 — the double claim is resolved to one owner). Shape unchanged: both writer bodies in ONE migration, D1 on the 0085 template. **F-T1 now also OWNS the SST rate table** (ADR-0074/TA-P2 — F-A8 depends on it) | design | — |
| Harness — **the CI economics overhaul (ADR-0073)** | **DELIVERED 2026-08-21, proven on all three event paths same-day**: PR run green in **~13 min** (was ~42) · post-merge push green · the manual dispatch full sweep green incl. all 12 closed-wave drills + 4 frontier legs in their new sweep-only home. Reviews: 5-lens adversarial workflow (3 confirmed → fixed: `bash -e {0}` exact shells · classifier learns `.github/actions/**` · per-run dispatch concurrency group) + Codex cross-model (3 shared-host races → fixed). | merged | #278 |

*(The sixteen terminal Wave-E rows moved verbatim to the archive, 2026-08-18.)*

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. **THE FRONTEND 磨合 WINDOW IS OPEN AND RUNNING** — pre-flight discharged, P1-P3 merged,
   the night train #368-#384 merged, `0139`+`0140` ceremonied (live 135); the port wave is
   running (posture bullet above carries the full list and the Wave-A instrument laws).
   **In flight**: Wave B (T4/T7/T8/T10) in independent review · P4's `0141` in its final pin
   round · F-A7b PR-a building. **Still owed in this window** (owner rulings,
   `harness-audit-rulings-2026-08-26.md`): the F-A7b train · all three firm tiers' UI
   (tier-3 LIVE AT BETA behind its own security gate) · **the pricing-amounts sitting**
   (before P4 ships) · the R2 PRD two-tier wording (drafted + owner-approved 2026-08-27,
   `docs/plan/active/r2-prd-two-tier-wording-draft-2026-08-27.md` — the PRD edit still owed)
   · the live-data e2e walk (Q9 rung 5). Then **Wave G: factory reset + estate e2e + beta
   live**.
2. **Owner-key acceptance items** (the constitutional human half): ~~the #43 sitting~~ —
   **DONE 2026-08-16** (three dispositions, merged #249, ceremonied; **E-R14 OPEN**).
   ~~The BEE FY2025 live close~~ — **RULED 2026-08-16, deferred WHOLESALE to the Wave-G reset**
   (narrative archived; ADR-0072 ⑤ builds on it). **BEE's golden bar, confirmed 2026-08-20
   against the client's own papers: FY2025 SALES RM 68,640.00 · net PROFIT RM 47,245.65 ·
   capital B/F (65,747.97)** — FY2024's closing `FINANCED BY` total is that same
   `(65,747.97)`, printed on two independently-produced documents. No BEE coding sittings in
   Wave F. Then: the first real render/seal round-trip (closes DR-render's unrun-drill
   boundary) → RPR historical MPERS pack → RS snapshot witness; the ms/zh claim-policy copy;
   the optional elevated `diskpart` VHDX compact (~50GB, runners idle).
3. ~~**F-A2 BUILD per its design**~~ — **DONE: PR-0 → PR-1 (W1) → PR-2 (D-a deploy) → PR-3
   cutover+retirement (W2+W3, #324) all merged + ceremonied.** PR-4 acceptance remains, folded
   into the Wave-G e2e corpus run per the owner's 2026-08-23 ruling (`wave-f-sprint-dag.md` §9 —
   mechanism-smoke right after ceremony, SCALE legs fold into Wave-G; p50 ~T0+48h → ~T0+36h).
4. ~~**THE TRACK-A DESIGN FAN-OUT + BUILD**~~ — **DONE** (all seven sets v2-gated 2026-08-22;
   build DONE for F-A2/F-A3/F-A4/F-A5/F-A6 v1/F-A5b through card-1/F-A7 across W1+D-a+W2W3+W4).
   Remaining: F-A8 · F-A9 PR-1A · F-A5b PR-3 render worker · F-A6 v2 · Track B.
5. ~~**THE OWNER'S DIGEST SIGN-OFF**~~ — **GIVEN 2026-08-22** (laws 78-81 + the four annotated
   laws ratified; every named follow-up landed or ruled — #287, invariant-(a) home, R1, corpus,
   CI overhaul, OQ-2/3/5, R-OWNER, C6). **Still open for the owner**: FX-lite build timing ·
   the corpus's oracle-tier gaps (BEE GL/TB both FYs + full FY2025 doc · RPR Feb/Mar-2025
   statements or a written none-exist · named producer/certifier for RS+RPR · the
   authoritative RPR series) · OD-3's bar figures for every slot but BEE.

## Backlog

Registered but not scheduled. Sources of record in brackets.

**THE DEBT-CLEARING SPRINT IS NEXT (owner mandate, 2026-08-24): everything except full Track B
clears in the 磨合 window.** New items folded in from the W2/W3 review ladders (2026-08-25) —
the forward-obligations block and the F-A5b/W4 items below also ride this sprint:
- **π-E1's `betaLanded` check is SELF-REFERENTIAL** (blind at n ∈ {0,6}) — gate on the
  `schema_migrations` stem like `wb-0020`'s idiom; covered twice already, not a hole.
- **N1** — `fa5-pr3-real-seal-drill.mjs` has no CI leg, decision item: weekly sweep or not.
  **N2** — the drill and F-A5 PR-1 cell D can't share a database (one-way evaluator flip).
  **N3** — no cell for "human archives `signed_original` on an agent-prepared run"; shipped
  behaviour measured correct, candidate cell for a future touch. · ~~F-A5/PR-3 scanner nit~~
  **MOOT** (its checker script was deleted by `0118`). · **Wiki-lint's unprovable-kind waiver
  is function-wide, not per-target** (Codex B4 on F-A4 PR-1b) — harden it.

**Forward obligations minted at the 2026-08-24 β review ladder + train night** (each named at
its finding; none blocks beta):
- **The candidate-parameterized `evaluate_witness_identity` variant → pi/F-A1-successor scope**
  — **DESIGN v1 LANDED 2026-08-25**, `witness-identity-variant-survey.md` (+`-design`/`-annex`);
  ships as one unit (cell W2). · **F-A2/PR-2-successor prompt: `candidates` becomes MANDATORY**
  (B2 arm (b)'s feed). · **`document_regions.field_path` is caller-supplied and un-CHECKed** —
  the obligation rides the PRODUCER lanes, not β. · **Consolidate
  `wake_propose_bank_identifier_promotion` onto pi's `_identifier_promotion_core`** (beta-era;
  the rename stands meanwhile). · **A shared marker-survival helper before any FOURTH
  `_sandbox_client_set` recut** (three migrations recut that ~19KB body, 0132→0135→0136).
  · **The closed-wave-floor law (minted at #352)** now lives in the ADR digest §10 (#356) and
  `.claude/rules/db-tests.md`; the full text of each obligation above is archived verbatim in
  `docs/plan/completed/progress-archive-2026-08-part3.md`.
- **F-A6 PR-2 runtime obligations (load-bearing, not optional)** — named in `freeform-read-design.md` §7 item 4 and `freeform-read-annexes-2-record.md` Annex J R-3's S-1 note: **H-4** the POOL, not the verb, must set a session `statement_timeout` before calling `wake_freeform_read` (a verb-local `SET LOCAL` cannot bound a single FETCH) · **H-5** `withFreeformRead` releases the freeform pool connection with `DISCARD ALL`, never `reset all` (which does not release a payload-taken session advisory lock) · **S-1** `withFreeformRead` calls ONLY `wake_freeform_read`, never `_freeform_arm`/`_freeform_settle` directly (both GRANTED to `clara_freeform_ro`, callable outside the verb).
- **ClaraBook resource-audit residuals (2026-08-28, `clarabook-resource-audit-2026-08-28.md`)** —
  the Clara mascot assets (P6 + owner batch) · the WCAG 2.2 target-size owner question (§4,
  recommendation: adopt at P6) · the Mobbin flow-video viewing pass (裁-4 7d).
- **Gate-record OQ long tail (audited 2026-08-26)** — carried, not yet ruled: F-T1 OQ-1/2/3/5/6/7/8/9/10 · F-A4 OQ-1..6 · F-T3 OQ-2/3/9 · F-A8 OI-1 · F-A7 gate §5 item 3 (dual-attribution severance) · F-A9 TA-P13-OQ-2/4 · fix-queue's claims-auto-post widening trigger · bank-agency OQ-8's later-relation question · reporting-agency OQ-4 + P12 · freeform OQ-A — one row, pointers only.
- **Small unrecorded follow-ups (audit 2026-08-26)** — wb-o's AMB-11 adjudication request (`docs/plan/research/wave-b/0017-ambiguity-adjudications.md`) · the metering `firm_usage_daily`/`task_usage` read-drop follow-up (`metering-survey.md:447`, design §3.9 — PR-1 only stops reading them) · `chatTurn.v14.bank`'s per-rung friendly-message table · `wake-engine.mjs:70-79`'s CAS cancel-race guard is a NAMED obligation on whoever ships the first `bank_agent`/`close_prep` wake workflow body — VERIFIED still absent from `chatTurn.v14.bank.ts` (zero `cas`/`cancel` hits, 2026-08-26).
- **Dated-tripwire class, seen 3×** (f-a2 witness v2 08-21 · #352's closed-wave floor · B5.4) — pin the monotonic DIRECTION, never a ceremony-state; a trued pin proves both ways; sweep for a candidate at every ceremony. Same-audit reviewer items: `--lock-deployed` is BLANKET (stamps every non-`true` entry — run only when every dark entry is genuinely deployed; a scoped `--only` flag would be its own PR, none exists today) · the D-a window (08-24) has NO as-run document · the `frozen-evaluators.json` `evaluate_fs_pack_agent_v1` migration-path one-liner is fixed in this PR (see M1).
**Owner rulings from the harness-audit sitting (2026-08-26)** — full text `docs/plan/active/harness-audit-rulings-2026-08-26.md`, one section per card:
- **R1 — the judgement-confidence conjunct drop**: a future migration removes `assert_client_resolved`'s `confidence>=0.95` conjunct for `method='judgement'` rows (full ladder); until then it's a harmless failsafe (judgement rows mint at 1.0).
- **R2 — PRD two-tier reporting wording**: §4/§6 gain the two-tier text; exact wording awaits the owner's word-by-word review — do NOT edit PRD.md for this without it.
- **R3 — G1 wake-engine ADR**: owed next session — one page, mechanism (a) heard-vs-overruled + (b) chosen, cross-lane impact, plus its digest line.
- **R4/R5/R7 — digest addenda owed**: §10 gains the #352 closed-wave-floor law + the four-runner-expansion CONFIRMATION (AMBIGUITY #2 from `harness-audit-2026-08-23.md` now CLOSED); §5 gains the evaluator two-halves ceremony beside law 50 (naming the 08-24 half-skip).
- **R6 — a new docs/ops/ceremony-practices.md** *(not yet created)*: written during 磨合 (combined-window practice · sleeper-machine DSN recipe · run-id-pinned DONE watchers); maintained via clock-out sweep + harness-links.
- **R8c — the pricing-amounts sitting**: SHAPE ruled (base monthly/firm + metered overage, F-A9's ledger the substrate); amounts deferred to a dedicated sitting.
- **R9 — PITR HOLD**: deferred again; trigger = the beta-prep checklist. (R9's storage-probe half ships in 磨合 — Next item 1.)
- **Tier-A raises leave NO durable trace** (no receipt, no audit row — design-consistent,
  conductor-closed with reviewer concurrence) — an OBSERVABILITY gap candidate, not a wall gap.
- ~~β's §0 collision note~~ — **RESOLVED**: the rename (c623178) landed with pr-1b at W2+W3.
- **F-A3 PR-3/C2's per-subject-account digest-binding is NOT implemented, for ANY of the
  thirteen agent bank cores** (Codex's final leg re-probed after the third round's PR-body note
  claimed "3 of 13 trivially derivable" — false on re-measurement, corrected: none of the
  thirteen carries a directly-named bank-account-id parameter). Only task-binding shipped.
  Closes the cross-task staleness leak; the narrower same-task cross-account leak stays open.
  **Acceptance criteria to close it, registered as `bank-agency-annexes-2-record.md` Annex K
  A33** (not merely this line): a derivation path per core, a subject-binding parameter on
  `_agent_verify_inputs_digest`, and a same-task cross-account negative cell per derivable core.
  *(F-A3 PR-3 review rounds 3-4, 2026-08-25, PR #343.)*
- ~~F-A3 PR-3/C1-bis D1 write-quiesce obligation~~ — **DISCHARGED 2026-08-26**: 0134 merged
  (#348) + ceremonied inside W4's combined quiesced window; full record in `-part3.md`.
- **The autonomous `bank_agent` driver, when built, must mint op_keys that either carry
  `taskId` at colon-field 2 (chatTurn_v14's own `bank-{verb}:{taskId}:{segment}:{payload}`
  shape) or contain no colons at all** — `_agent_verify_inputs_digest`'s C2 task-binding falls
  back to the original client+digest-only check only when the op_key carries NO parseable task
  field; an op_key with SOME colons but a wrong/absent task in field 2 would silently change the
  binding for that lane. Today's autonomous-lane test fixtures use `opk()`'s underscore-joined
  shape, which carries no colons and is safe. *(Same round.)*

**Unowned gaps found by the 2026-08-23 alignment scan — now OWNED** (each was real work with no home;
the owner is named so none of them drifts back into nobody's queue):
- ~~**Manual journal-entry compose UI → the Codex frontend build.**~~ **DONE 2026-08-27** —
  `apps/web`'s P3 journals lane shipped hand-compose (`compose-dialog.tsx` +
  `entry-lines-editor.tsx`, #364); flagged closed by the handoff-conformance audit.
- ~~**`coding_rules` propose/sign retirement**~~ — **DONE**: `0118` (F-A2 PR-3, #324) drops the five coding-rule verbs (with their five autopost siblings) outright, confirmed absent by the tail assertion; `coding_rules` stays KEEP-AS-HISTORY, consistent with OQ-2's ruling.
- ~~**The autoDraft 8-step cap**~~ — **DONE**: `autoDraft.v9.impl.ts:197`, `AUTODRAFT_STEP_BUDGET = 8`, design-cell docstring (F-A2 PR-2, #323).
- **Payroll document ingestion as a first-class product capability** (own purpose class + sensitivity walls) — owner decision, future scope. *(F-T2 B1/B14 ruling, 2026-08-23: `payroll-calendar-gate-record.md` OC-1.)*

**Named build debts (deadline-triggered):**
- **task #17 Fix A (the `closing_transfer`/SST-turnover latent, 0056) — SHIPPED LIVE 2026-08-25**
  with F-A4 PR-1b (`0120`, #329); Fix B STRUCTURALLY BLOCKED, **OD-7 discharged** (`-part2.md`).
- **Reconciler follow-ups (#255's law-1 review — all pre-existing, none blocking, each its own PR):** the `expired` key collision (`reconciler.mjs:676` clobbers `expireClarifies`' count, unread today) · the leader render-pair try/catch (`leader.mjs:206-217`) still swallows halt-class errors, unreachable today · `wiki-projection.mjs:333-346`/`:607-609`'s three bare `to_regprocedure` probes.
- **`high_stakes_amount_cents` has no governed self-serve verb** (2026-08-21 client-naming
  audit): the RM100k threshold was set by a one-time hand-run deploy script (ADR-0044); not a
  defect today (fully generic/per-firm) — a **Wave-G OS-surface item**, ships with firm-setup.
- **`closing_stock` producer verb** — before any real goods-trader close. **Wave G does NOT
  schedule it:** ADR-0072 ⑤ defaulted OD-2 to "not in the first pass". *(PR #228 residual 5)*
- **`opening_tb.line` producer + the K-doc door** — Phase-5, review-gated. The Wave-G corpus
  does not need it: its run script seeds brown-field openings by key, not by document. *(ADR-043)*
- **δ NAMED RESIDUALS — all five STAND, none scheduled; full text archived to `-part2.md`**
  (F10's `transaction_timeout` · the B4 dollar-quoted sandwich · the 57014 `caller_reported`
  label · the RS guard's lift window · Supavisor headroom re-measure). **η — not δ — owns the
  production human/OBO/wake caller**; direct grants + synthetic human JWTs stay forbidden — next
  matters at **F-A5's OBO closure**.

**Structured-format lanes (event-triggered; registered 2026-08-20 so they live here, not only in
code comments). Both were verified at the bytes, and both differ from how the lane gets casually
described — each disposition is what the read SAW:**
- **OFX/QFX — the parser is BUILT and UNEXERCISED, not unbuilt.** Intake canonicalizes four
  spellings to one mime (`intake.mjs:44-48`), `scan.mjs` detects both dialects, intake is
  **STORE-ONLY** (`intake-lanes.mjs:54`), and `parseStatementOfx` (`statement-parse.mjs:331`)
  maps identity/currency/period/`LEDGERBAL`/every `STMTTRN` behind CSV's interface (OFX prints
  no opening/totals, so it corroborates only where continuity supplies the opening). **Missing:
  a runtime battery + a real client file. Trigger: the first OFX-exporting bank.** *(Wave C-b §4.3)*
- **XLSX/DOCX — parsed VALUES-ONLY; the gap is SEMANTICS, not a parser.** They route to
  `structured_parse` (`intake-lanes.mjs:55`)/`structured-worker.mjs`, but every region carries
  **`monetary_cents: null`** and a structural `field_path` (`sheets.0.B7`), never accounting —
  **no facts**, AI-assisted read only. **NOW OWNED by F-A6 v2** (R-L18 — no `client_id` on
  `document_extractions`/`document_regions`). Unattended posting needs its own corroboration
  anchor — *which cell is the total is a judgement, not a structure.*

**The VACUOUS-GREEN-GATE class (2026-08-16) — ALL THREE INSTANCES NOW HAVE HOMES (TA-P14, 2026-08-22).** The
class RULE was already DISCHARGED (Wave-G corpus §7.4 adopts it verbatim). The repair assignment, ruled by
measurement origin: **(a)** the uncoded-voucher gate, blind with 21/21 filings NULL `financial_date`
(`0056:1397`'s BETWEEN never satisfied by NULL; `:1404-1405` makes the miss permanent) → **F-A4** ·
**(b)** drawer 2's bank gate, blind with 0 registered accounts against RM 39,252.03 of real balance (`0056:1360-1361` enumerates only `bank_statements`) → **F-A3**, **DONE** (`0121` §I "THE SHARED REGISTRY-LEDGER PREDICATE + THE DRAWER-2 GATE'S REPAIRED ARM 4", live since #328) · **(c)** drawer 1 returning `tie` on an EMPTY `bank_accounts` registry (`0056:962`) → the corpus's P-3, **F-T4**, still open. Repairing (a) will flip some currently-green clients red — accepted at the sitting.

> **Dispositions applied 2026-08-20** (a full audit of all 88 rows against ADR-0071, the F-A1
> delivery and ADR-0072): 7 STALE · 8 DISCHARGED · 8 ABSORBED. Each is marked in place below;
> **the argument that earned each disposition is archived** in
> `docs/plan/completed/progress-archive-2026-08.md`, so this file stays a state file. A
> disposition is not a deletion — any row can be re-opened by naming it.

**Beta-boundary instruments (ADR-0069):** a quality-score document, A–D per domain/layer · the
doc-gardening recurring agent · a tool/interface-design pass over the custom MCP surfaces.
~~The monthly harness ablation~~ **STALE**; ~~the system-prompt investment pass~~ **RE-HOMED to F-A2**.

**The F6–F9 register (ADR-0066), trued 2026-08-20:** **C1 `failed_retry` unwitnessed live** —
drill unrun, the door now reachable on live data (`v_lane`=`llm_witness`, real terminally-failed
witness tasks exist) · the `internal` lane has no self-service door, live-relevant · admission-
time envelope label · mint-time-only ocr reclaim bound (both survive) · ~~401/403 split~~
**RE-HOMED to F-T4** · **F8's single-use door + two 0034 inherits + landscape-refresh autonomy —
re-examine at F-A2** · F9 no-unpark path + parked-residual acceptance. ~~X7's five residuals~~,
~~`in_vendor_block`/`is_vendor_name` unproven live~~, ~~the parked 6/6/6/85 floor~~ — all STALE.

**Gates on the operating runway:** **Gate P** (first native-MYR SST-stated supplier bill, or
Wave-G reset; reminders RETIRED). ADR-0066 measured the waiting population at **seven
documents**, all newest-`ocr` failed/`bad_type` with NULL `document_kind` — F6 does NOT unblock
them; remedies are an owner re-export or the 401/403 split. The capitalised/mixed-purchase
tax-allocation question + Gate D residuals ride it · **Gate S**'s real-XML leg, UNSCHEDULED ·
**FINCARE RSINV-2510/02** needs a human coding decision (recorded blocker is STALE — Azure
typing gap, the witness pair needs none) — re-ask after the F-A2 re-extraction.

**η residuals (Wave-E, PRs #240/#242) — all four STAND, none scheduled; full text archived to
`-part2.md`:** the estate-wide whitespace-blind blank-op-key idiom · the co-effective policy
seed-test's fixture design (`clara.edge_policy_sets`) · the δ-family window-blind wall-side
policy resolution (**a false refusal, never a false preview**) · `0084`'s `C:\ct\` tooling.

**CI economics overhaul — BUILT 2026-08-21, ADR-0073; block archived to `-part2.md`** (the ADR
is the record). **Surviving residuals:** lever (4) HYBRID runners **DECLINED** · the operating
practice (`gh workflow run ci.yml` by hand after any closed-drill/pipeline PR, `docs/ops/ci-runner.md`)
· a stale PR needs `gh pr update-branch`, **never `--admin`** (#277) · batch-CI-per-wave REJECTED.

**Wave-F planning inputs — DISPOSED by ADR-0071/contract:** #25 SUPERSEDED · E-R13 ABSORBED
(F-A3) · FX-lite principle pre-seeded (P-FX; timing stays a sitting item) · claims (E-R10) →
F-T4 · **staff allowances/self-billed detection/WHT are UNSCHEDULED** (F-T1..F-T4 name none).
**Wave-G:** the OS surface + UX-debt backlog (E-R10) + design trio population + **the factory
reset + full E2E rebuild from raw documents** (ADR-0072 ⑤; ADR-0075 makes the estate
resettable). **Roadmaps, risks, Phase-5:** `docs/plan/active/roadmap.md`.

**Wave-D/C carried deferrals:** ~~FA carry-down's first real firing~~ / ~~one real
reducing-balance asset~~ — **ABSORBED into the Wave-G corpus** · first live real recurring
template (event-triggered) · C-a residuals (§5.3 pool segregation · Section-I wedge remedy ·
real-PG dead-letter battery, declined) · C-c F-3 documented-as-is.

**Slice-era standing residuals — full block archived to `-part2.md`** (verbatim, 2026-08-23;
none has a PR, every row carries its disposition). Live pointers: the **Supabase non-superuser
deploy-role CI** leg DESIGNATED to the weekly sweep (ADR-0073) · **Slice-4** residuals
(compliance export · trace-debug surface · chat-visibility toggle · S4-V2 canary watch ·
job-level liveness) stand · **Slice-2/3/6 and Wave-A** deferred/declined/event-triggered/absorbed.

**Interview v3 residuals — ALL THREE RE-HOMED TO F-A7b** (TA-P14 binding): `readClearsError`
never checks `runId` · **the concurrent-submitter receipt gap** (RUNTIME CONTRACT change — a
server-authored per-(run, park, submission) receipt) · **the interview e2e de-pin** — F-A7b IS
its "next core bump".

**Owner/legal:** **C6 legal pack DRAFTED + CITATION-VERIFIED 2026-08-22**, on disk in
[`docs/ops/legal/`](docs/ops/legal/) (OpenAI DPA brief · client AI-authorization letter en/ms/zh ·
PDPA s.129 memo). **Owner items: NONE** — they gate nothing (real-data egress gates on F-A7b's
client onboarding click instead). Full text (the OpenAI processor bundle dissent, WB-R26/PITR,
WB-R22, the old SGD clarify) archived verbatim 2026-08-25 to `-part2.md`.

**Tooling follow-ups** (RE-HOMED to the F-A2 / F-T4 fix queues, 2026-08-20 audit): the ceremony
DSN bridge belongs IN-REPO (highest-value — done, see F-T4 PR-1) · the wiki CoR-comment gate ·
`0057` §11's writer-roster successor · `0007`'s firm-limits pseudo-upsert. Still unscheduled:
the dr-verify trio · the runtime boot line's bundle version · Supavisor headroom re-measure ·
the local disposable Supabase stack · the ComplianceWatchCard echo · the unreverted-admin-grant
lint watch · `0084`'s `C:\ct\`-only tooling. Full text archived verbatim 2026-08-25 to `-part2.md`.

- **The unrecorded-obligation backlog (harness audit, 2026-08-23 — `docs/plan/active/harness-audit-2026-08-23.md`).**
  The audit measured that this file is NOT the only home for forward-looking obligations: ~18 carry no row here at
  all — chiefly **unruled owner-questions inside design sets already marked GATED v2** (F-A3, F-A4, F-A8, F-A9,
  F-T3) plus three DR/incident follow-ups — and ~5 more live in Lanes/Next/posture instead of Backlog or Known
  issues. **Standing rule from here: an OQ that survives its gate gets a Backlog line the day the gate record
  lands, not the day it is finally ruled** — a gate record is a minute, not a work queue. The audit's §A table is
  the list to work through; each item is closed by ruling it or by giving it a row.

- **`/ready` carries NO storage check at all — MEASURED 2026-08-23, not inferred.** `checkReadiness()` (`packages/runtime/lib/health.mjs:86-130`) probes DB reachability, the world and control heartbeats, the taxonomy pointer and relay health; **storage is absent from the check set entirely.** So the 2026-07-26 intake-storage incident's headline failure mode is unchanged: during that outage `/ready` reported `ready:true` for ~12h, and today it would again — the incident report called this "a read-only check", but the measurement says there is no storage probe of any kind. Its three named follow-ups (`docs/ops/incident-2026-07-26-intake-storage.md:249-261`) are therefore ALL still open: (a) a storage **write** probe on `/ready`, (b) a permanent CI battery over the storage-grant surface — **also measured absent**: no storage test exists in either `packages/db/tests/` or `packages/runtime/tests/`, and the grant surface is not in any migration (it is applied Supabase-side by ceremony, which is precisely why the battery was asked for), and (c) the storage-role re-examination. **A factory reset does not touch any of the three** — they are code and infrastructure, not data — and their cost lands hardest in beta, when a silent storage failure means a real client's uploads fail while the service reports healthy. **Recommendation: (a) ships before the frontend merge** (it is small — write, read back, delete, folded into the existing readiness set); (b) and (c) can follow beta. Recorded here under the standing rule this file learned the same day: a measured obligation gets a row, not a mention in a runbook.

## Known issues

- ~~Annex A.4 row 7~~ (RULED+BUILT, `0128` live, `no_preparation` mode) · ~~R-OWNER/B15's second door~~ (BUILT `0106`, #311, tail-proven; D18 stands for direction-SILENT documents only) · ~~the `AGENTS.md` invariant-(a) home~~ (DECIDED (b): PRD §6 invariant 2(b) is the single home) — all resolved; full records archived verbatim in `-part2.md`/`-part3.md`.
- **The wiki dynamic-SQL gate reads CoR-block comments UN-MASKED** (found 2026-08-20 on 0097):
  `parseCoRPatches` tests `CREATE_FN_RE` against a block whose `--` comments survive the file-level
  `maskComments` (dollar-quoted interiors are skipped), so a create-function phrase **quoted in a comment**
  reclassifies the block as a dynamic function-creator and reds the gate. Workaround: wording — never quote
  a recut statement in a CoR comment. Real fix = mask the block's own comments before the CREATE test + a
  selftest cell. Judgement logic, its own reviewed PR; **re-homed to the F-A2 fix queue.**
- **Two backend gaps found by the Wave-B rung-0 census (2026-08-28), recorded — not built around:** (1) `clara.counterparty_aliases` has NO `clara_authenticated` read policy (owner + freeform_ro only, per `pg_policy`), so `retire_counterparty_alias` — itself EXECUTE-granted — has no honest UI path: no granted read returns an alias id. T8 ships the retire dialog UNMOUNTED + a NotBuiltNote. **RULED 2026-08-28 (裁-11, `mohe-grill-rulings-2026-08-28.md`): ADD the policy in P4 DB tranche-2** — copy the `counterparties` table's human-read policy shape verbatim; no D1; PR body names T8's hygiene panel as the home; T8's alias wiring rides along after the ceremony.
  (2) `SweepReceiptPart` renders as an id-only summary card (`PartRenderer.tsx` SUMMARY_TYPES, alongside eight other unhydrated part types), so `acknowledge_sweep_run`/`get_sweep_run` have no UI control — a standing P3-era gap outside the port wave's §5 scope; T7 wired both as lib fns + wire-shape tests and names it on the sweep panel. Both go to the owner's next 待裁 batch. *(The 2026-08-22 resolved quartet — riders ③④⑤ · corroboration 0/33 · ci.yml over 500 · the stranded pair — is archived in `-part2.md`.)*
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

**THE NEXT-ROUND QUEUE (2026-08-21 re-measure; the first four are PROMPT-side — the evaluator
stays strict, widening it = a frozen-evaluator change with its own version + ceremony).** Five
named items, measured detail archived verbatim 2026-08-24 in `-part2.md`: the MYR
currency-code prompt fix (FALSE refusal 2/20; ask for the CODE, witnessFacts v3) · the
dash-is-not-a-value clarification (both BRIGHTPATH docs + one rounding sign split) · the
bare-SST-id vision-prompt check (lock 3's margin was one channel) · `coverage.pages` empty
20/20 (fix in v2 or drop before promotion) · the discount-no-net class counts 3, not 2
(trues the on-file owner trigger question).
- **M1's reconciler re-mint is a NAMED FOLLOW-UP** (found at #270's review, not shipped in it): the sidecar `runId` is
  clobbered on the re-mint path — `packages/runtime/lib/reconciler-documents.mjs:450` with
  `packages/runtime/lib/spool.mjs:124`. *(Cite TRUED 2026-08-23: `:198-206` is `documentTaskSnapshot`, a SELECT — the
  clobber is the re-enqueue's `writeTaskMeta(task.taskId, { ...task, runId: … })` full overwrite at `:450`, where the
  merging `mergeTaskMeta` was wanted.)* A real defect with a known site pair; its own PR, not a rider on a pacing fix.
- *(The stranded-pair row is in the archived batch above; the `0051` door's `v_lane` defect
  stays unrepaired by design — no new member can mint post-cutover.)*
- **0057 §11's writer roster has no live successor** (PR-4 review): a future unrostered books-writer would pass
  silently — the roster runs only at 0057's own apply. Candidate: a standing census cell. **Sharper since the
  cutover:** `0096` rotated the writer estate and `0098` added `_persist_statement_core_v2`, so the guarded
  population grew while the roster stayed pinned. **Re-homed to the fix queue (now lane F-T4, beta-era).**
- **Rig recipe pin + the WSL split-brain cure** — full record ARCHIVED 2026-08-22 to
  `docs/plan/completed/progress-archive-2026-08-part2.md` (verbatim); **the standing law stands:**
  drive the db suite with libpq `PG*` vars + `CLARA_ALLOW_DESTRUCTIVE=1`, NEVER `DATABASE_URL`,
  and cure WSL split-brain with a full `wsl --shutdown` when runners are IDLE, then one keeper.
- **Three dangling doc paths** (`RENUMBER.md` · `algebra.md` · `INTERFACE-PINS.md`) — inert (law 41 + ADR-058); re-author only on real need.
- **Two γ post-CLEAN NITs** (PR #231, residuals 4–5) — one-word fixes, next `0057`-area batch.
- ~~**BEE's opening TB**~~ — **RESOLVED 2026-08-20** for ADR-043 by a live read; record archived
  in `docs/plan/completed/progress-archive-2026-08-part2.md`. **The one residual that stays open:**
  the four `opening_items` sum to +7,850,406 cents with no `obe_plug` item while the journal
  balances through `190-OBE` — **UNADJUDICATED** (sign convention unknown, nothing guessed).
- **WSL VM/NAT operating law** (2026-08-14/15 incident; narrative archived): a detached keeper for any
  port-dependent WSL work (`Start-Process -WindowStyle Hidden wsl.exe -ArgumentList "-e","sleep","43200"` — NAT dies
  ~10 min after the last client detaches even with the VM held); NEVER `wsl --shutdown` with runners busy (restart
  services via `wsl -u root systemctl restart`); never diagnose VM health with a probe that cycles the VM.
- **The 0007 firm-limits pseudo-upsert trigger is column-hardcoded** (`_tf_firm_document_limits_upsert`): a
  partial-column INSERT against an existing firm row silently RESETS the other limit columns to their defaults, and
  `0090`'s `llm_witness_concurrency` is invisible to it entirely — settable only by direct UPDATE, and exactly the
  knob the corpus incident made people want to turn. **Re-homed to the fix queue (now lane F-T4, beta-era)**, riding the pacing work.
- ~~**The statement-pair coin flip**~~ — **HEALED FORWARD-ONLY as of 2026-08-21** (`0102`'s router
  re-key + the `statementFacts_v2` repoint); record archived in `-part2.md`. **The residual that
  never closes: the historical coin-flipped pairs are NEVER repaired** — `superseded_by` is
  once-only (CLR08), so they are counted and named, never rewritten (design §3.9 note 5).
- **2026-08-23: stale dependency cites in frozen provenance comments, after the ai/workflow bump** (#293
  review). The freeze-lint-frozen files — `witnessFacts.v1.services.mjs`, `witnessFacts.v2.services.mjs`,
  `statementFacts.v2.services.mjs` and eight autoDraft/chatTurn impl files — carry provenance comments citing
  `ai@7.0.31` and `@workflow/core` v4.6.0. **True at their authoring date and STRUCTURALLY UNEDITABLE**
  (constraint 9: a frozen body's bytes never change), so they stay and are read as dated provenance, not as
  current fact. **Two EDITABLE test files carry the same stale cites and should be trued in the next
  test-touching PR:** `ledger-44-autodraft-v4.test.mjs` and `wave-e-f9-autodraft-v7-retry.test.mjs`.
- **MAX_PATH breaks git's RECOVERY verbs too** — archived in `-part2.md`; practice: `git rebase
  --quit` → MIXED reset → `symbolic-ref`, never abort→hard-reset; short-path clones for conflicts.
- **2026-08-23: two shared-tree branch incidents in one night — every git-active lane runs in its own
  worktree (no docs-only exception).** Both times a sibling lane checked out its branch in the SHARED
  main tree while another lane had uncommitted edits and an expectation of its own branch; the second
  time a landing commit went to LOCAL `main` (caught before any push to `origin/main`, repaired by
  moving refs, nothing lost). **The lane's own care is not the control** — it cannot see another
  lane's checkout. The control is isolation. Practices that follow: cut every branch inside your
  worktree · print `git branch --show-current` INSIDE the commit command, not before it · after any
  surprise, resolve state against `git show origin/<branch>:<file>`, never against a working tree.
- ~~**Local-only test-isolation flake in the db package**~~ — **MOOT, 2026-08-23 (F-A2 PR-3):**
  a21-prestate.test.mjs, the file that leaked `PGDATABASE` into the shared Node process, is
  whole-file RETIRED with the rules-execution tier (Annex B.1/B.6) — the flake retires with it.
- **The estate-wide whitespace-blind blank-op-key idiom** stays REGISTERED under η residuals
  in the Backlog — noted here so a Known-issues-only reader does not miss it.
- **2026-08-24: gitleaks scans EVERY ref, so any unmerged branch can red every PR's lint**
  (f-t1/pr-1's fixture scope_keys, cleared by the #319 allowlist entry). Practice: fixture
  labels avoid `key='<high-entropy>'` shapes; adjudicate-then-allowlist by CAPTURED VALUE,
  never by fingerprint (squash rewrites shas).
- **2026-08-24: dr-verify 4.6 reads NULL-vs-materialized-default ACLs as drift** (0103: 12
  no-op relation revokes → 96 phantom rows). Migration-side rule (revoke-from-public is
  FUNCTIONS-ONLY) is in the lane brief; the instrument-side normalization
  (`aclexplode(coalesce(acl, acldefault(...)))`) is a fix-queue candidate — judgement logic on
  a verification tool, its own reviewed PR.
- ~~**VHDX compaction residue**~~ — **RESOLVED 2026-08-27/28** after a THIRD disk-zero bite mid-磨合 (C: 0 bytes → staged recovery → `docker volume prune` returned **87.25 GB from 359 anonymous rig volumes** → the owner ran the elevated `diskpart compact vdisk`: vhdx ~100 GB → ~25 GB, **C: 82 GB free**; every run in the disk window voided as suspect-green and re-run). Standing practice BINDING: fleet runs prune docker volumes as stages finish; conductor sweeps `docker volume prune` at every wave close; keeper re-planted after every manual WSL restart.

## Session log

*(Entries through the 2026-08-21 Window A+B ceremony are verbatim in
`docs/plan/completed/progress-archive-2026-08.md` + `-part2.md`, alongside F-A1's operative
records: its ceremony as-runs and the corpus measurement.)*

- **2026-08-27/28 (THE 磨合 SPRINT NIGHT)** — **twelve PRs #368-#379 merged** under the
  owner's standing autonomous mandate; three grill batches ruled (R1-R7 · 裁-1…裁-7 · the
  law-71 close-lane ruling); the port wave ruled A and planned (11 trains); `0139`/`0140`
  landed (ceremony owed); the CI meta-gate caught `0140`'s seam-census red (the ledger owed
  three projection keys — trued extend-only, the instrument ceiling recorded in the test
  header); the THIRD disk-zero event recovered + permanently fixed (87 GB volume prune + the
  owner-run diskpart compact, C: 82 GB free); T0 seam lane dispatched at close; **the
  0139+0140 D1 window RAN same night — live 135/`0140`** (as-run in completed/).
- **2026-08-25 (THE W2+W3 COMBINED CLOSE)** — the six-car train merged and **CEREMONIED live
  112→122/`0127`**, Track A's backend fully live; four cars took a first-chain-meeting fix
  round (lane-brief rules ①-⑦ minted). As-run
  `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`.
- **2026-08-27 (THE 磨合 WINDOW OPENS)** — the opening grill RULED IN FULL
  (`mohe-grill-rulings-2026-08-27.md`); **F-A7b's gate SAT and CLOSED** (BUILD-AUTHORIZED);
  `chatTurn_v14` deployed + bundle-proven; #356-#360 merged. P2's four shell lanes built in
  parallel worktrees through build→review→fix→re-verify; the Codex security pass on auth
  returned two HIGH (anti-cache headers; OTP purpose) — both fixed pre-fold.
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

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
