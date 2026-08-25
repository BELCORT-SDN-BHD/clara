# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-25 — **W2+W3 MERGED AND CEREMONIED — LIVE 122/`0127`, TRACK A BACKEND FULLY
LIVE**; trued at every clock-out)*

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

- **THE TEST-DATA AUTHORITY IS WIDENED — ADR-0075 (digest law 82), owner-ruled 2026-08-23.**
  Every client is a resettable TEST fixture until go-live: **DATA is free** (live DB included);
  **GATES are walked by the agent as the owner's delegate** through the REAL audited doors,
  receipted, secrets env-to-env (e-filing excluded); **MECHANISMS NEVER MOVE** — the operative
  clause on any collision. Constraints 12 retired / 13 rewritten / 14's beta expiry stands.
  A Known-issues or Backlog row is the only lawful home for a deferral.

- **The F-A2 opener train (2026-08-21) and its 0/20 → 12/20 re-measure** — superseded in
  posture by the Wave-F/W2+W3 trains above; records: `f-a2-window-ab-ceremony-asrun.md` + lane row.

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
- **Runtime:** Fly `clara-runtime`, single machine, `/ready` 200 — **v66 (2026-08-21)**, carrying
  autoDraft_v8 + chatTurn_v12 + **witnessFacts.v2** + **statementFacts_v2** + riders ③④, all four
  verified by in-VM bundle grep. The three `CLARA_RENDER_FLY_*` values are bound. Dashboard:
  Pages `app.clarabook.com`. `clara-backup` daily. `clara-render` hourly.
- **Books pins:** RS trial balance **3,396,500 = 3,396,500** (`trial_balance_as_of`, re-read
  at every ceremony) · RS customers **11/11 NAME-ONLY** (the enrichment trap holds) ·
  `client_facts` = 7 rows (3 carryover + 3 MSIC + 1 doored entity_type).
- **The close model is LIVE-INERT:** zero `fiscal_years` rows; activation is the first human
  `open_fiscal_year`. The snapshot registry is likewise inert (zero `reporting_periods` /
  `period_snapshots`) until the first `mint_month_snapshot`.
- **CI (ADR-0073, 2026-08-21):** self-hosted `clara-wsl`/`-2`/`-3`/`-4` — FOUR instances since
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
| Wave F · Track A — **F-A3 bank agency** | **DESIGN v2, GATED 2026-08-22** — the seven `bank-agency-*` files (survey · design · four annexes · gate record [`bank-agency-gate-record.md`](docs/plan/active/bank-agency-gate-record.md)); gate 1 ran two lenses, 5 blockers / 6 materials folded, width severed into PR-1a pure extraction · PR-1b agent limb · PR-1c egress · the clock PR (which sequences AFTER F-A4 mints the wake kind, R-L7). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): open-register verbs (enter/void statement · certify · unmatch ANY pair · resolve exception incl. write-off · **the 60-day waiver, running at 60 until F-A3's battery gives the owner data**) + a duplicate-payment wall + `add_bank_account`'s COA-binding check · new `bank_matching` purpose, per client · clock-driven under law 71 · **the bank rules machine retires whole and 7A-R3/E-R13 are recorded dissolved** · owns drawer-2's vacuous-green gate. **BUILT 2026-08-24: PR-1a/1b/1c authored + reviewed (1b's D-11 near-erasure caught and rebuilt from the live catalog); 1b's promotion verb RENAMED `wake_propose_bank_identifier_promotion` (c623178, conductor arbitration — F-A7 owns the door per TA-P8; consolidation onto pi's `_identifier_promotion_core` is a ledgered forward obligation)**. **ALL THREE MERGED + CEREMONIED 2026-08-25 as part of the W2+W3 window**: PR-1a (`0119`, #327, nine pure core extractions) · PR-1b (`0121`, #328, the agent limb — a first-chain-meeting fix round found + fixed the DR-roles omission and the frozen-window cross-PR pin, see lane-brief) · PR-1c (`0122`, #330, `bank_matching` admitted to the egress-purpose family). As-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. **PR-3 (the clock train, W4) BUILT 2026-08-25, migration `0129`** (branch f-a3/pr-3-clock, PR #343): the eleven-verb bank-rules learn loop retires whole (`propose_bank_rule` · `sign_bank_rule` · `retire_bank_rule` · `accept_bank_rule_suggestion` · `_bank_rule_sightings` · `_bank_rule_pattern_norm` · `list_bank_rule_candidates` · `list_bank_rules` · `list_bank_line_suggestions` · `match_bank_line`'s and `settle_from_bank_line`'s rule-arity overloads) — **E-R13 and 7A-R3 are RECORDED DISSOLVED with the machine** (E-R13's corroboration intent rides the witness pair, F-A1; 7A-R3 was already recorded dissolved at TA-P11 clause 2); `clara.bank_rules` and its history stay KEEP-AS-HISTORY. Also carries OQ-7 (staff-advance sibling, deliberately EXCLUDED from chat parity — the ordering decision, permanently pinned by a roster-difference cell), the SS3 identifier-promotion confirm door (OQ-8, scoped to bank_account only after a review-round fix closed a statutory-identifier-injection gap), and SS4 chat parity (OQ-6) with a full owner-ruled provenance-threading fix (an `interactive_client` act now writes the real human's identity/kind/attended-arm through every bank-agent receipt and agent-core ctx; a `bank_agent` act is byte-unchanged; `entry_post_receipts_via_wake_kind_check` widened extend-only). **A SECOND fix round closed a dense review batch 2026-08-25**: the falsely-claimed `wake_fn_allowlist.fn_name` non-bug (refuted live — the column is a real generated alias from `0007`, the claim traced to checking only `0002`; both flagged prestate/tail queries ran clean before and after) · MUST 2a (the DOA `wake_book_staff_advance_application` allowlist row, added in the SAME commit as the `f31w.o` roster's extend-only 13→14 pin, plus the CLR08 agent-post-receipt wall it was missing) · MUST 2b (the confirm door's two-sided normalization mismatch — `client_identifiers.value_normalized` re-derived to match `counterparties.registration_normalized`'s stripping, both polarities incl. punctuated forms cells) · MUST 2c (the confirm door no longer accepts a model-proposed `identifier_kind` — typed `identifier_kind_out_of_scope` refusal, `bank_account` only) · MUST 2d (the confirm door refuses `promotion_target_ambiguous` on `count(distinct client_id) > 1` instead of silently picking one) · the SS-TAIL byte-identity wall now actually proves non-vacuity (was declared-but-unused) · a `lock_timeout` + the D1 inventory's ACCESS EXCLUSIVE line · `identifier_promotion_confirm` dropped from `bank_agent_receipts_act_kind_check` (law 31, no writer) · the vestigial `p_via_rule` parameter censused closed · the three new dashboard doors (`listOpenBankLineExceptionProposals`, `getBankAgencyHold`/`setBankAgencyHold`, `listOpenBankIdentifierPromotionProposals`/`confirmBankIdentifierPromotion`) gained full wire-shape pinning cells in `bankApi.test.ts` · `packages/runtime/lib/pools.mjs`'s now-false "interactive_client holds EXACTLY ONE allowlist row" docstring corrected (the frozen `chatTurn.v13.infra.ts` twin is left byte-untouched, constraint 9). Full estate suite + migration replay re-run clean on a freshly rebuilt INSTANCE-UNIQUE rig after a fleet scratch-dir collision required re-deriving every prior "green" claim. A parallel lane (branch f-a3/pr-3-chatturn-v14) built the runtime half (`chatTurn_v14`); merge-in and joint re-review are next. | **PR-1a/1b/1c merged + ceremonied; PR-3 built, review-round fixes landed, merge-in with chatturn-v14 next** | #327 #328 #330 #343 |
| Wave F · Track A — **F-A4 close key ①** | **DESIGN v2, GATED 2026-08-22** — the five `close-key-1-*` files; gate record [`close-key-1-gate-record.md`](docs/plan/active/close-key-1-gate-record.md) (3 blockers / 10 materials folded; **OQ-7/OQ-8/OQ-9 ruled by R-L12/R-L13/R-L11**). **OWNS the clock spine** (R-L7 — F-A3/F-A5/F-A8 consume it) and **OWNS task #17 Fix A at PR-1b** (R-L9/GM-7/D-23). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): mints the product's FIRST calendar wake source (new wake kind, CHECK pair, six rosters; law 71 posture, no ramp) · open-year / abandon-any / re-freeze / snapshot-mint pass to her · **the minimal human doors are IN SCOPE** (finalize · abandon · a "Clara proposes close" card + its durable carrier) · evaluator-backed adjustments post, judgement accruals draft · owns the uncoded-voucher gate · **shares ONE D1 window with task #17 and TA-P6 on `finalize_close`**. **BUILT AND LANDED 2026-08-24: PR-1a MERGED (0104, #310) and W1-CEREMONIED** — the measurement layer's first live census fired as designed (4 clients / 28 undated filings, R-3/P2). **PR-1b (Window-B close-lifecycle writers + task #17 Fix A) went through a MUST-FIX cross-model round (Codex + opus, 11-item fix order, all closed 6bcba5c) and MERGED + CEREMONIED 2026-08-25** (`0120`, #329) as part of the W2+W3 window — as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. **Annex A.4 row 7 RULED 2026-08-25 (owner, debt-clearing sprint) and BUILT same day**: `segregation_mode` follows the real `v_agent_prepared` probe on row 7 too — a new truthful `no_preparation` value (CHECK widened, extend-only) for a year no human AND no agent prepared, `agent_prepared` reserved for when the agent genuinely did; D-2 (all-agent-drafted + human-approved-without-revision → `agent_prepared`, no distinct-checker raise) stays exactly as-ruled, framing note added. `finalize_close` CoR'd; `reopen_fiscal_year` investigated and found to share none of the row-7 arm (its own CLR05 gates already exclude the "nobody at all" state), pinned not touched. Branch f-a4/pr-1b2-a4-truth, migration `packages/db/migrations/0128_f_a4_pr_1b2_a4_truth.sql` — built + rig-verified (152/152 close-model family incl. 4 new behavioral cells across the three modes + the CHECK census, F-A5's separate `issue_mode` census unaffected), awaiting review + merge + D1-quiesced ceremony. PR-1c (`statutory_deadlines` DDL, F-T2's unblock) next. | **PR-1a + PR-1b merged + ceremonied; PR-1b2 (A.4 truth) built, pending merge** | #310 #329 |
| Wave F · Track A — **F-A5 reporting agency** | **DESIGN v2, GATED 2026-08-22** — the five `reporting-agency-*` files (renamed from `fa5-agency-*` at landing); gate record [`reporting-agency-gate-record.md`](docs/plan/active/reporting-agency-gate-record.md) (3 blockers / 7 materials / 1 nit folded; **OQ-5 ruled by R-L14** — the solo self-attestation arm on the agent lane; **the sandbox EXPORT path severed to lane F-A5b, R-L15**). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **"end to end" rewritten open→evaluate→seal→render — ISSUE IS HUMAN** · the issue wall re-arms on the DIRECTING human, self-run fails closed to a human, `agent_prepared` receipts, a solo arm · self-run packs exempt from `0084`'s orphan-adoption · sandbox exports with a **byte-burned watermark** + the covered-recipient cross-client test · **the first real seal + byte-reproduction drill precedes N3**. **BUILT AND LANDED 2026-08-24: PR-1 MERGED (0111, #318 — `clara._hash`'s 55 call sites froze at its merge)**; PR-2 (0112) and the C-flip ceremony landed via the D-a deploy window (live 112/`0117`). **PR-3 (the 11 h seal + byte-reproduction drill, Track A's last unbuilt item) went through a full cross-model ladder (MF1/MF2/fold-in/S4-S8 all fixed with mutation proofs, D1 NONE confirmed by catalog differential) and MERGED + CEREMONIED 2026-08-25** (`0127`, #334) as part of the W2+W3 window — as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`. Three debt-sprint items named at review (N1 seal-drill CI leg decision, N2 drill/cell-D doc line, N3 defence-in-depth cell — see Backlog). PR-4 renderer next. | **PR-1/PR-3 merged + ceremonied** | #318 #334 |
| Wave F · Track A — **F-A6 audited freeform read** | **DESIGN v2, GATED 2026-08-22** — the five `freeform-read-*` files; gate record [`freeform-read-gate-record.md`](docs/plan/active/freeform-read-gate-record.md) (4 blockers / 5 materials folded; **GB-1 ruled by R-L16** — the default SHIPS with grant + one-arm/one-settle and its three required cells; **the cross-client sibling verb severed to lane F-A6 v2, R-L17**; **XLSX/DOCX structured-parse excluded in v1, R-L18** — a named contract deviation). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): a **DECIDED** read surface: server-side client scoping, cross-client as a named receipted action, HOME chat firm-wide, an **enumerated table list printed as an audit line (closes audit GAP5-5, HIGH)**, `interactive` only at first, no RBAC tiering, no per-firm signature gate · a **DEFINER read wrapper** — no receipt, no read · bookkeeper+ human read surface · law 28's cross-model pass still mandatory. **PR-1 BUILT 2026-08-24** (battery + censuses + closed-world roster maps; P-12 measured FALSE — 57014 untrappable → Tier D); the law-28 pass runs via a native fresh-context lane (Codex's cyber filter refused the prompt); merges post-W2. | **PR-1 built** | — |
| Wave F · Track A — **F-A7 filing + interview** | **DESIGN v2, GATED 2026-08-22** — the five `filing-and-interview-*` files; gate record [`filing-and-interview-gate-record.md`](docs/plan/active/filing-and-interview-gate-record.md) (6 blockers / 8 materials folded; severed into five trains — π additive · γ egress · α constitutional; **AM-8 WIDENED at landing**: Clara reverses her own posted misattribution herself and raises the question, only the cross-client re-home stays the human's). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED** — the α train's judgement half was gated on the ratification and is now unblocked on that axis. Ruled scope (ADR-0074): **attribution becomes her JUDGEMENT under structural walls — CONSTITUTIONAL, and RATIFIED as digest law 79 on 2026-08-22, so the judgement half is no longer signature-blocked**; four riders ship with it (contradiction wall · ROME-family collision guard · correction path + misrouted-egress event · the firm-scoped unattributed-document carrier) · the firm-level NARROW purpose with its closed document list, **gated on C6** · `classify` must come under governance first · the promotion door · F-A7b = CLIENT onboarding only. **BUILT AND (π) LANDED 2026-08-24: π MERGED (0103, #313 — after the conductor's no-op-revoke DR fix) and W1-CEREMONIED**. **γ, α AND β ALL MERGED + CEREMONIED 2026-08-25** as part of the W2+W3 window (as-run `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`): **γ** — firm-narrow typed-egress governance (`0123`, #331), independent review CLEAN + a fold round for three findings, closed 2425b61; a cross-package fixture gap found and fixed (see lane-brief). **α** — judgement-basis admission + the congruence wall (`0124`/`0125`, #332), delta-probe CLEAR-TO-MERGE with 4 should-fixes landed and 8 prestate sha pins matching. **β** — the filing verb + interview wake surface (`0126`, #333); Codex 7 findings (1 CRITICAL cross-client double-file, rig-confirmed then fixed) + opus 4 (two production-shape inerts fixed) + delta re-probe CLEAN; **owner ruling B10** (other-client active filing → refuse + ask; human verb untouched); a first-chain-meeting fix round closed three failure classes (c5e8e10, reviewer's formal verdict CLEAR-TO-MERGE); 47-cell battery. F-A7's π/γ/α/β family is now fully live. | **π/γ/α/β merged + ceremonied** | #313 #331 #332 #333 |
| Wave F · Track A — **F-A8 internet lane** | **DESIGN v2, GATED 2026-08-22** — the four `internet-lane-*` files; gate record [`internet-lane-gate-record.md`](docs/plan/active/internet-lane-gate-record.md) (6 blockers / 9 materials folded; the annex was reconciled wholesale, PR-1 is greenfield **Tier-1 only**). **Two obligations still open before PR-2:** the law-28 cross-model pass on the Tier-2 injection surface, and the unnamed Tier-2 search VENDOR (`wake_web_search` does not ship until named). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **depends on F-T1 for the SST rate table** (F-A8 only attaches the fetch) · Tier-1 closes to `fx_rates` + SST rate + SST threshold · rows land through an **audited owner one-click door, not a PR** (two mechanical checks; `0016`'s assertion relaxed for Tier-1 only) · immutable+supersede, backdate triggers an impact scan, **missing row REFUSES** · no client identity on Tier 2 in v1 · **citation enforced at the tool boundary** | design | — |
| Wave F · Track A — **F-A9 metering** | **DESIGN v2, GATED 2026-08-22** — the four `metering-*` files; gate record [`metering-gate-record.md`](docs/plan/active/metering-gate-record.md) (4 blockers / 6 materials folded; **PR-0 = the chat-cap hotfix FIRST**, then PR-1A the ledger reshape with no D1; **`llm_usage_events.firm_id` becomes NULLABLE for platform-level calls, R-L10** — a NULL firm is a platform call, never an unmetered one). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): ONE ledger: `llm_usage_events` reshaped for any call kind, **`client_id` + triggering actor added NOW (irreversible if missed)**; the Slice-4 ledger + reserve/reconcile machinery retire — **that deletes live real data, and the owner's ruling is recorded as that sentence** · the brake census is design's first deliverable (one page, one owner signature) · **the chat token cap ships as a HOTFIX ahead of F-A9** · the `refused_budget` rename is mandatory. **PR-4 re-homed to the Wave-G reset, W5 removed, ruling 2026-08-23.** **BUILT AND LANDED 2026-08-24: PR-0 MERGED (0105, #312) and W1-CEREMONIED — the `begin_chat_turn` recut is LIVE, law 76 is structural**; PR-1A = 0110 (#317, cascade; the reshaped writer `record_agent_usage_event` is F-A2/PR-2's chat-usage dependency). | **PR-0 merged + ceremonied** | #312 |
| Wave F · Track A — **F-A5b sandbox export** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — `sandbox-export-survey.md` · `-design.md` · `-annexes.md` · gate record [`sandbox-export-gate-record.md`](docs/plan/active/sandbox-export-gate-record.md) (four blockers / six materials / one nit folded). **The `sandbox_watermark` trio was SIGNED 2026-08-23** (design §3.6a, owner question 1/OQ-2; survey X12) and B1's substitution seam likewise ruled (§3.6b/OQ-3's recipient-scope model) — **the lane is now BUILD-READY, no longer dark**; build rides the debt-clearing sprint. Default on the wording stands: no row seeded, and a missing row for the locale REFUSES the render. **REGISTERED 2026-08-22 (R-L15)** — severed out of F-A5's v2 as SEQUENCING, explicitly **not** a narrowing of TA-P10 C′; F-A5 proper keeps the sealed lane's `artifact_watermark` trio. | **design (build-ready)** | — |
| Wave F · Track A — **F-A6 v2 cross-client named read** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — `freeform-read-v2-survey.md` · `-design.md` · `-annexes.md` · gate record [`freeform-read-v2-gate-record.md`](docs/plan/active/freeform-read-v2-gate-record.md) (two blockers / twelve materials folded; four OWNER CARDS stay open). **Hard prerequisite: F-A2 PR-1 MERGED** — the verb cannot function until `interactive_client` and both `wake_credentials` CHECKs land (design §6, survey U2). **Owner confirmation 2026-08-23: v1 waits for v2** (D-22 / R-L17) — recorded here because the lane's own survey (U4) and annexes flagged that the repo did not yet carry it. **REGISTERED 2026-08-22 (R-L17)** — severed out of F-A6 v1 as SEQUENCING, explicitly **not** a narrowing of TA-P9 A(2): the cross-client sibling verb cannot function until **F-A2's `interactive_client` limb merges**. v1's refusal `cross_client_unavailable` must NAME the deferred action (the battery cell forcing the naming stays in v1); HOME chat is unaffected. **Also carries R-L18's deferral** — XLSX/DOCX `structured_parse` content, excluded from v1 because `document_extractions`/`document_regions` carry no `client_id`, so a client pin would leak a sibling's document body (`get_document_extract` stays the door). | design | — |
| Wave G · frontend (Codex session, parallel) | **HANDOFF LANDED 2026-08-23** — `docs/plan/active/frontend-handoff-2026-08-23.md`: the complete enterprise frontend (signup/invite · onboarding · the two-pane Agentic OS shell · documents · drafts · bank · close · reports · receipts · admin) built in THIS repo as the new **apps/web** package on branch **frontend/web**, replacing `apps/dashboard` at cutover. **ALIGN BEFORE CODE** — §8's grill-first list goes to the owner (visual direction · two-pane IA · card-catalog extensions · mobile scope · i18n EN/BM/中文 · the a11y bar above the legal floor · per-journey "done") before product code, per constraint 6. Settled and closed in §0: Cloudflare Workers via `@opennextjs/cloudflare` · Supabase cookie auth, invite-only first · Resend carrying no client data · Tailwind + shadcn adopted · the LIVE project as the data (ADR-0075) · crude Track-A doors replaced IN PLACE with the same verb, never a new gate. | design | — |
| Wave F · Track B — **F-T1 SST engine** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — the six `sst-engine-*` files (survey · design §1-§4 · design-part2 §5-§12 · annexes · annexes-2 · gate record [`sst-engine-gate-record.md`](docs/plan/active/sst-engine-gate-record.md)); five fresh-context lenses + independent re-attack (two blockers / sixteen materials / five nits confirmed, eight refuted). Fourteen findings folded into v2; **four reserved to the owner as OQ-11…OQ-14**, each blocking a PR. **OWNS the SST rate table F-A8 depends on** (ADR-0074/TA-P2). **OQ-4 RULED (owner, 2026-08-23): the GL carries the deferral** — `sst_output_deferred` credited at invoice for every payment-basis service-tax registrant, transfers to `sst_output` on allocation or the twelve-month day, whichever comes first; lands as PR-4b, a new D1 window sequenced after F-A2 PR-1. **PR-1 BUILT + REVIEWED 2026-08-24** (the F2 semantic inversion — predecessors seeded already-superseded — fixed at `0c46d2b`, reviewer re-probed 11/11); lands pre-beta if it fits, else opens the beta window (owner's B-variant re-scope, 2026-08-24). | **PR-1 built + reviewed** | — |
| Wave F · Track B — **F-T2 payroll deadline calendar** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** (`payroll-calendar-survey.md` · `-design.md` · `-annexes.md` · gate record [`payroll-calendar-gate-record.md`](docs/plan/active/payroll-calendar-gate-record.md)); gate fold complete. **Mints NO wake kind** — the chase rides `wake_record_notification` on the existing `proactive` credential (allowlisted for exactly that one function, `0002:558`), because the notice needs no capability that kind does not already have: the one-architecture test applied to a lane that could easily have invented a second. **PR-1 is BLOCKED on F-A4's `statutory_deadlines` DDL (PR-1c)** — F-T2 contributes ROWS, not the table. **Eight owner questions**, including **the HRD Corp deadline conflict** (15th vs the last day of the following month) and **the weekend rule** (v1 is `working_day_basis = 'weekends_only'`, the field present so "public holidays are not handled" is a visible limitation, not a silent one). | design | — |
| Wave F · Track B — **F-T3 draft tax computation** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** — gate record [`tax-computation-gate-record.md`](docs/plan/active/tax-computation-gate-record.md): five fresh-context lenses, **eleven blockers / eleven materials / one nit CONFIRMED, nine REFUTED — all twenty-two folded, none reserved for the owner**. **v1.2 folds the conductor's measured corrections**: the frozen evaluator closure collapses from ~12 members to **ONE** (`verify_evaluator_freeze()` ignores `deployed` and hashes the full `pg_get_functiondef`, so twelve members would freeze twelve bodies estate-wide and raise at a *later* lane's apply — **D-16**, re-measured at PR-0 as **P-10**) · `client_fact_keys` gains the generic name-only-wall scoping obligation, its own seed block and battery cell **C15** (**D-17**) · the `dispose_fixed_asset` prosrc pin corrects to `0041:3643` · **F-A9 is NOT an evaluator-roster claimant** (its priced view has no `prosrc`); the live claimants in merge order are **F-A5 PR-2 + the C-flip ceremony → F-A8 PR-1 → F-T3** · merge order recorded: **F-A8 PR-1 (train 13) → F-T1's SST tables → F-T3 PR-1**, F-T1 having no train slot yet. **v1.1** — three of the nine owner questions are RULED under the standing delegation: **OQ-6 → R-L25** (the Wave-F Tier-1 closure re-opens for F-T3's two tables, which land as **developer-seeded fact tables through the PR ladder**, not through TA-P2's one-click door — contract note `[TB-2026-08-23]`), plus **OQ-4** and **OQ-5**, and the law-review belt. **The owner ruled ALL-IN in Wave F** — F-T3 is not slipped to a later version. Base **v1** — (`tax-computation-survey.md` · `-design.md` · `-annexes.md`); **PR-0 gate pending**; **hard-gated on F-A5 PR-1 + F-A4 `close_receipts`**; owner questions **OQ-1/7/8** for the sitting. Three findings reorder the item: the tax layer is **greenfield** (zero repo hits for `cp204`/`form_c`/`add_back`/`chargeable`, and `0041`'s `ca_class` trio is written by the register and read by nothing — F-T3 is WD-R12's first consumer) · **no acceptance oracle exists in the owner's three folders** (no Form C/B/P, no CP204, no computation worksheet, no FA register — so acceptance cannot be "reproduce the accountant's prior year", **OQ-1**) · **the number path is live but has never carried a run** (`reporting_periods`/`period_snapshots` zero rows, no `report_run` ever opened) — a hard sequencing dependency, not a build-time discovery. | design | — |
| Wave F · Track B — **F-T4 fix queue** | **DESIGN v2, GATE-FOLDED 2026-08-23, ALL CARDS RULED 2026-08-23 (dispositions in the gate records); BUILD-READY subject to each item's structural gates** (`fix-queue-survey.md` · `-design.md` · `-annexes.md` · gate record [`fix-queue-gate-record.md`](docs/plan/active/fix-queue-gate-record.md), part of the joint Track-B gate — 19 confirmed incl. 6 blockers/10 materials, 14 folded into v2; **PR-1 (the DSN bridge) severed by owner ruling and builds standalone**). Five PRs: **the ceremony DSN bridge first** (in-repo at last — it was never in the repo, and every remaining Wave-F/G ceremony walks it) · **N5 as a governed `refusal_remedies` table** rather than a `fix` backfill across ten applied migrations, preserving the coding mapper's no-raw-text hardening · **the 401/403 split** with a retryable `engine_auth` code, at the two human doors only · **P-3's drawer-1 census via a `banking_arrangement` client FACT** on the `trade_nature` precedent, never an attestation (drawer 1 has no attestation path and gains none) · **item E's two cells**. **The claims accounting convention (§8) is an OWNER SITTING QUESTION**, with MPERS / CA 2016 / LHDN citations fetched 2026-08-23 and four NOT-FOUND absences recorded honestly. Cross-item **X-1**: the bank-class COA account any registry-vs-ledger predicate keys on is **minted by registration**, which makes F-A3's arm 4 vacuous on the same population. **No rig ran — every body-level claim is a prediction for PR-0's replay.** **PR-1 (the ceremony DSN bridge) MERGED 2026-08-23 (#308)** and already carried the W1 ceremony's every live connection (`verify-full` + pinned CA, env-to-env). | **PR-1 merged; rest beta-era** | #308 |
| Wave F · Track B | tax per the contract (F-T1..F-T4). **task #17 UNBLOCKED** — R1 ruled (ADR-0072 ④); Fix A's **owner = F-A4 PR-1b, and Track B's 13-cell battery rides it** (R-L9 / close-key-1 D-23 — the double claim is resolved to one owner). Shape unchanged: both writer bodies in ONE migration, D1 on the 0085 template. **F-T1 now also OWNS the SST rate table** (ADR-0074/TA-P2 — F-A8 depends on it) | design | — |
| Harness — **the CI economics overhaul (ADR-0073)** | **DELIVERED 2026-08-21, proven on all three event paths same-day**: PR run green in **~13 min** (was ~42) · post-merge push green · the manual dispatch full sweep green incl. all 12 closed-wave drills + 4 frontier legs in their new sweep-only home. Reviews: 5-lens adversarial workflow (3 confirmed → fixed: `bash -e {0}` exact shells · classifier learns `.github/actions/**` · per-run dispatch concurrency group) + Codex cross-model (3 shared-host races → fixed). | merged | #278 |

*(The sixteen terminal Wave-E rows moved verbatim to the archive, 2026-08-18.)*

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. ~~The two opener ceremonies~~ — **DONE 2026-08-21, run COMBINED**
   (`docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`).
   **What they leave for the next round**, all prompt-side and none of it frozen-evaluator work:
   the **MYR currency-code prompt fix**, the **dash-is-not-a-value clarification**, the
   **vision-side SST-id shape check**, and **`coverage.pages`** (see Known issues).
   ~~The stranded-pair re-fires~~ — **DONE 2026-08-21** (Known issues).
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
4. ~~**THE TRACK-A DESIGN FAN-OUT**~~ — **DONE 2026-08-22** (all seven design sets v2, gated;
   see the lane rows, `docs/plan/active/track-a-sitting-1.md` (`-2`,`-3`) for the consequence
   map). ~~**BUILD**~~ is now DONE for F-A2/F-A3/F-A4/F-A5/F-A7 (W1 + D-a + W2+W3); F-A8,
   F-A9's PR-1A and Track B remain. Two severed lanes registered but unscheduled: **F-A5b**
   sandbox export (BUILD-READY, the `sandbox_watermark` trio signed 2026-08-23) · **F-A6 v2**
   cross-client named read.
5. ~~**THE OWNER'S DIGEST SIGN-OFF is the next constitutional gate.**~~ **GIVEN 2026-08-22 — laws
   78-81 and the four annotated laws (2, 21, 71, 76) are RATIFIED, law 78 carrying the rider
   R-TA-P1-walls; F-A7a's judgement half is unblocked.** The two follow-ups the signature did not
   itself do: ~~the PRD §6.2(a) / ARCHITECTURE §0.1 product-text edits~~ **LANDED (#287)**, and the
   ~~`AGENTS.md` home question for invariant (a)~~ **DECIDED (b) 2026-08-23 — PRD §6 is the single home; no duplicate clause in AGENTS.md.** ~~R1~~, ~~the corpus
   decisions~~, ~~the CI overhaul~~, ~~F-A2's
   OQ-2/3/5~~ and ~~R-OWNER~~ are all RULED. Still open: **FX-lite build timing** · **the
   corpus's oracle-tier gaps** (BEE's GL + TB for both FYs and the full FY2025 document · RPR's
   Feb/Mar-2025 statements or a written statement that none exist · a named producer/certifier
   for RS and RPR · which RPR statement series is authoritative) · **OD-3's bar figures for
   every slot but BEE**. ~~The C6 checklist~~ — **DRAFTED + VERIFIED 2026-08-22, owner items NONE**
   (Backlog · Owner/legal); it no longer gates F-A7's narrow purpose, the client's onboarding
   click does.

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
  behaviour measured correct, candidate cell for a future touch.
- ~~The F-A5/PR-3 scanner nit~~ — **MOOT**: the vendor-binding post-control checker script it
  named was itself DELETED by F-A2 PR-3's rules-tier retirement (`0118`, same window; verified
  via git history, no successor) — see the AGENTS.md staleness flag in Known issues.
- **Wiki-lint's unprovable-kind waiver is function-wide, not per-target** (Codex B4 on F-A4
  PR-1b, `0055`-shared design) — harden it. **Three stale `UNNUMBERED_f_a2_*.sql`** beside
  0106-0108 — cleanup-queue deletion.

**Forward obligations minted at the 2026-08-24 β review ladder + train night** (each named at
its finding; none blocks beta):
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
- **Tier-A raises leave NO durable trace** (no receipt, no audit row — design-consistent,
  conductor-closed with reviewer concurrence) — an OBSERVABILITY gap candidate, not a wall gap.
- ~~β's §0 collision note re f-a3 goes stale at W2 rebase~~ — **RESOLVED**, the rename (c623178)
  landed with pr-1b at the W2+W3 close.

**Unowned gaps found by the 2026-08-23 alignment scan — now OWNED** (each was real work with no home;
the owner is named so none of them drifts back into nobody's queue):
- **Manual journal-entry compose UI → the Codex frontend build.** The verb exists
  (`wake_draft_entry`); no surface composes a JE by hand. Not a DB gap — a UI gap, new app owns it.
- **`coding_rules` propose/sign retirement → F-A2 PR-4's closing criterion.** TA-P11 retired the bank rules
  machine whole; the CODING rules machine's propose/sign path has no equivalent retirement date. Writes stop,
  history stays as knowledge fuel — the same treatment, consistent with OQ-2's ruling.
- **The autoDraft 8-step cap → F-A2 PR-2's design cell.** The cap appears in no brake census and no
  design; `autoDraft_v9` either states it as a named, designed bound or removes it. An undocumented
  step ceiling is a silent stop.
- **Payroll document ingestion as a first-class product capability** (own purpose class + sensitivity walls) — owner decision, future scope. *(F-T2 B1/B14 ruling, 2026-08-23: `payroll-calendar-gate-record.md` OC-1.)*

**Named build debts (deadline-triggered):**
- **The `closing_transfer`/SST-turnover latent (0056) — task #17 Fix A SHIPPED LIVE 2026-08-25**
  as part of F-A4 PR-1b (`0120`, #329, the W2+W3 window): both writer bodies (`finalize_close` +
  the `0085:379-386` B3 reopen mirrors) marked in ONE migration, D1 on the `0085` template,
  forward-only proof fail-closed at apply. Track B's 13-cell battery rides it. Fix B stays
  STRUCTURALLY BLOCKED; **OD-7 discharged.** Full argument archived 2026-08-22 to `-part2.md`.
  *(task #17 — CLOSED)*
- **Reconciler follow-ups (#255's law-1 review — all pre-existing, none blocking, each its own
  PR):** the `expired` key collision (`reconciler.mjs:633` clobbers `expireClarifies`' count,
  unread today) · the leader render-pair try/catch (`leader.mjs:200-211`) still swallows
  halt-class errors, unreachable today · `wiki-projection.mjs:333-346`/`:594-599`'s three bare
  `to_regprocedure` probes.
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
**(b)** drawer 2's bank gate, blind with 0 registered accounts against RM 39,252.03 of real balance
(`0056:1360-1361` enumerates only `bank_statements`) → **F-A3** · **(c)** drawer 1 returning `tie` on an EMPTY
`bank_accounts` registry (`0056:962`) → the corpus's P-3, **F-T4**. Repairing (a) and (b) will flip some
currently-green clients red — accepted at the sitting.

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
- ~~**R-OWNER — B15's second door**~~ — **RULED 2026-08-22 (owner, option C), now a PR-1 BUILD OBLIGATION**; full record archived in `-part2.md`, obligation at `0074-annex-a-mechanisms.md` R-OWNER + `f-a2-annexes-4-build.md` J.4 (D18 now stands for direction-SILENT documents only).
- ~~**The `AGENTS.md` home for invariant (a)**~~ — **DECIDED (b) 2026-08-23 (owner): PRD §6.2(a) is the single home; no duplicate clause in `AGENTS.md`.** Record verbatim in `docs/plan/completed/progress-archive-2026-08-part2.md`.
- **The wiki dynamic-SQL gate reads CoR-block comments UN-MASKED** (found 2026-08-20 on 0097):
  `parseCoRPatches` tests `CREATE_FN_RE` against a block whose `--` comments survive the file-level
  `maskComments` (dollar-quoted interiors are skipped), so a create-function phrase **quoted in a comment**
  reclassifies the block as a dynamic function-creator and reds the gate. Workaround: wording — never quote
  a recut statement in a CoR comment. Real fix = mask the block's own comments before the CREATE test + a
  selftest cell. Judgement logic, its own reviewed PR; **re-homed to the F-A2 fix queue.**
- ~~Riders ③④⑤ 0-live~~ · ~~corroboration 0/33~~ · ~~ci.yml over 500~~ · ~~the stranded pair~~ —
  **all four RESOLVED and ARCHIVED 2026-08-22** (`-part2.md`; re-measure 12/20 stands in posture).
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

**THE NEXT-ROUND QUEUE (from the 2026-08-21 re-measure; the first four are PROMPT-side — the
evaluator stays strict, and widening it would be a frozen-evaluator change needing its own
version + ceremony):**
- **MYR currency-code prompt fix** — FALSE refusal 2/20 ('RINGGITMALAYSIA' vs `('RM','MYR')`);
  ask for the CODE (witnessFacts v3).
- **Dash-is-not-a-value clarification** — vision `-` = value vs text not_printed cost both
  BRIGHTPATH documents (+ one rounding sign split).
- **Vision-prompt check on the bare SST-id shape** — lock 3's margin was one channel, not two.
- **`coverage.pages` emitted empty 20/20** — no lock reads it; fix in v2 or drop before promotion.
- **Discount-no-net class counts 3, not 2** — trues the on-file owner trigger question.
  *(Measured detail for all five: archived verbatim 2026-08-24 in `-part2.md`.)*
- **M1's reconciler re-mint is a NAMED FOLLOW-UP** (found at #270's review, not shipped in it): the sidecar `runId` is
  clobbered on the re-mint path — `packages/runtime/lib/reconciler-documents.mjs:450` with
  `packages/runtime/lib/spool.mjs:124`. *(Cite TRUED 2026-08-23: `:198-206` is `documentTaskSnapshot`, a SELECT — the
  clobber is the re-enqueue's `writeTaskMeta(task.taskId, { ...task, runId: … })` full overwrite at `:450`, where the
  merging `patchTaskMeta` was wanted.)* A real defect with a known site pair; its own PR, not a rider on a pacing fix.
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
- **Three genuinely dangling doc paths** (`RENUMBER.md` · `algebra.md` · `INTERFACE-PINS.md`) —
  authored in worktrees, never committed; inert (law 41 + ADR-058); re-author only on real need.
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
- **MAX_PATH breaks git's RECOVERY verbs too** — archived (verbatim) in `-part2.md`; standing
  practice: `git rebase --quit` → MIXED `git reset <sha>` → `git symbolic-ref`, never
  abort→hard-reset; prefer fresh short-path clones for conflict-bearing operations.
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
- **2026-08-24: gitleaks scans EVERY ref, so any branch can red every PR's lint** — f-t1/pr-1's
  fixture scope_keys (`_ft1_test_immutability_probe*`) blocked the whole cascade until the
  regex allowlist entry (#319, independently ACKed). New CI hazard class: an entropy-shaped
  test constant on ANY unmerged branch is estate-wide. Practice: fixture labels avoid
  `key='<high-entropy>'` shapes; adjudicate-then-allowlist by CAPTURED VALUE, never by
  fingerprint (squash rewrites shas — the config's own rule).
- **2026-08-24: dr-verify 4.6 reads NULL-vs-materialized-default ACLs as drift** (the 0103
  incident: 12 no-op relation revokes → 96 phantom source-only rows). The migration-side rule
  (revoke-from-public is FUNCTIONS-ONLY) is now in the lane brief; the instrument-side
  normalization (`aclexplode(coalesce(acl, acldefault(...)))`) is a candidate fix-queue item —
  judgement logic on a verification tool, its own reviewed PR.
- **VHDX compaction residue — RE-BITTEN 2026-08-24 as a FULL disk-zero event** (C: hit 0 bytes;
  WSL ext4 went EIO; all four runners died mid-run ~40 min). Root cause: 369 never-pruned
  throwaway rig volumes (100.8 GB) inside WSL + 65 build worktrees (34 GB) + artifacts.
  Recovered same-day: container+volume+builder prune (101 GB internal), 4.7 GB host artifacts,
  WSL restart + **a detached keeper (the 08-14 law was on file and was NOT re-applied after the
  manual restarts — conductor error, owned)**. The `ext4.vhdx` file stays **109.5 GB host-side**
  (internal use now 11 G / 1 TB — no growth for months; `--set-sparse` refused by WSL).
  **OWNER GRANTED FULL PERMISSION 2026-08-24** for the elevated compact: conductor picks an
  idle window, `wsl --shutdown`, then elevated `diskpart` → `select vdisk file="C:\Users\zhant\
  AppData\Local\wsl\{dd65d2d5-2451-49a5-8436-6857685a4eae}\ext4.vhdx"` → `compact vdisk`
  (~95 GB returned). Standing practice now BINDING: fleet runs prune their docker volumes as
  stages finish, and the conductor sweeps `docker volume prune` at every wave close.

## Session log

*(Entries through the 2026-08-21 Window A+B ceremony are verbatim in
`docs/plan/completed/progress-archive-2026-08.md` + `-part2.md`, alongside F-A1's operative
records: its ceremony as-runs and the corpus measurement.)*

- **2026-08-25 (THE W2+W3 COMBINED CLOSE)** — the six-car train (F-A2 PR-3 · F-A3 PR-1a/1b/1c ·
  F-A4 PR-1b · F-A7 γ/α/β · F-A5 PR-3) merged and **CEREMONIED live 112→122/`0127`** (as-run
  `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`); Track A's backend is now fully live.
  Four of six cars needed a first-chain-meeting fix round (DR-roles+frozen-window on pr-1b,
  cross-package fixture on γ, three failure classes on β) — new lane-brief rules ①-⑦ minted.
  The full manual-dispatch sweep ran ALL-GREEN pre-window (run `32801086161`). Owner card parked
  on F-A4 PR-1b's Annex A.4 row 7 (Known issues). Debt-clearing sprint opens next (Backlog).
- **2026-08-24 (THE TRAIN NIGHT + W1)** — two CI mechanism fixes (#314 OS-assigned ports; the
  no-op relation-revoke DR fix); four train cars merged, **W1 ceremonied live 97→103** (as-run
  #315); F-A7 β's double review ladder CLOSED (owner ruling B10); GM-10 found + Codex-built; the
  gitleaks all-refs class allowlisted (#319); **the disk-zero incident** (WSL EIO, ~40 min
  outage, 101 GB pruned, keeper re-armed, owner granted the VHDX compact); the 529 storm bridged
  by the Codex cross-model substitution.
- **2026-08-22 (the TRACK-A SITTING · v2 DESIGN LANDING)** — fourteen rulings TA-P1…TA-P14 +
  all seven design sets to gated v2 (36 files); governing minute
  `docs/adr/0074-the-track-a-sitting.md`; full entries archived verbatim to `-part2.md`. Merged
  #284/#285/#286/#287.
- **2026-08-23 (the ALIGNMENT GRILL — ADR-0075; the SPLIT PASS)** — the owner widened the
  test-data authority (posture above carries it in full; digest law 82); digest law 77 ratified
  (#286); the invariant-(a) product text amended (#287); the SPLIT PASS moved nine at-cap files
  to their `-part2`/`-log` companions. **F-A9's D17 ruled (R-L19).**

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
