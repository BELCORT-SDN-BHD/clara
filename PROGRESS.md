# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-23 — the opener train is CEREMONIED, F-A2's PR-0 gate has RUN, **all seven
Track-A design sets are at GATED v2**, and the test-data authority is WIDENED; trued at every
clock-out)*

- **THE TEST-DATA AUTHORITY IS WIDENED — ADR-0075, owner-ruled 2026-08-23.** **No real client exists before
  go-live:** every client in the estate is TEST DATA authorised by its owner and factory-reset at the Wave-G
  e2e. **DATA is free** — delete, reseed, reverse, re-run any client's data, documents, consents and close
  state, **live DB included**, without asking; the corpus is the owner's three folders and no oracle exists
  beyond them. **GATES are walked by the agent as the owner's DELEGATE** through the REAL audited doors,
  receipted (law-71 acts, consent signatures, capability grants, password-bearing acts with secrets
  env-to-env and never printed; **e-filing excluded by nature**). **MECHANISMS NEVER MOVE** — RLS, the
  attribution walls, receipts, roles/grants and the generic name-only wall are the product under test, and
  that clause is the operative one on any collision. **Hard constraint 12 is RETIRED as a named constraint**
  (the GENERIC name-only wall stays; `0062`/`0063` untouched), **13 is REWRITTEN** (BELCORT is the operator
  firm, everything else a resettable fixture), **14's beta expiry STANDS**. Digest **law 82** (§12). Every
  wave still validates in full — a Known-issues or Backlog row is the only lawful home for a deferral.

- **THE F-A2 OPENER TRAIN IS LIVE — Windows A and B ran COMBINED, 2026-08-21 ~10:56-11:02 MYT**
  (as-run: `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`). **Live DB: 97 migrations,
  frontier `0102_f_a2_statement_activation`; runtime v66.** All five merged PRs applied and
  deployed: #270 `a36044bb` (③④⑤) · #271 `e330f421` (①② DB) · #273 `90073b14` (⑥) · #272
  `c695a675` (①② runtime) · #274 `7f5617e0` (activation). Combined deliberately — a fully-merged
  train makes a split create a stall gap, not separate risk; both flips independently reviewed,
  machine STOPPED across both. Evaluator flip 4/4→5/5 + NOTIFY; probe 20/21 with the one red
  owned as a **probe defect**; the **`0102` coverage probe said NO as designed**, naming
  synthetic sandbox firm `39008536` — ACCEPTED. **Both manifests fully deploy-locked.**

- **THE RE-MEASURE: 12 / 20 corroborated — against 0 / 20 for the same twenty under v1**
  (12 arm · 0 plain · 8 refusing, each with its failing conjunct named; prediction hit 14/20).
  **The denominator rule travels with that number: 20 is a deliberately refusal-heavy SAMPLE of
  the 33, so 12/20 is NOT comparable to 0/33** — 0/20 → 12/20 is the like-for-like result.
  Opener ② was the bundle's hard floor (`type_code` `'01'`×19 + `'03'` on a genuine debit note);
  lock 3 fired on the corpus's only true SST registrant; infra vindicated (19 documents, 40
  calls, zero failures on the lane that produced 7 casualties two days earlier). **Honest
  caveat: this measures the *witness verdict*, not a posted entry** — F-A2 proper is unbuilt, so
  every corroborating invoice still routes to the human-confirm draft lane.

- **THE TRACK-A SITTING IS CLOSED — ADR-0074, 2026-08-22: fourteen principle rulings (TA-P1 …
  TA-P14) scope F-A3…F-A9 and widen F-A10.** **The four CONSTITUTIONAL AMENDMENTS were RATIFIED
  by the owner 2026-08-22, together with laws 78-81 and the rider R-TA-P1-walls on law 78:** law
  71's roster becomes an **OPEN REGISTER** (any act it does not reserve is the agent's, and it
  ships WALLED — B6 · B14 · the entrance seam) · **invariant (a) becomes the agent's JUDGEMENT
  under structural walls** · law 21 narrows to periodic POSTING belts · law 76's "LLM" drift is
  trued. **The PRD §6.2(a) / ARCHITECTURE §0.1 product-text edits LANDED (#287); the `AGENTS.md`
  home for invariant (a) stays FLAGGED for the owner** (see Known issues). **Ruled ahead of PR-1 on
  purpose:** the one-architecture TEST retires the **bank rules machine whole** (superseding
  **WCC-R5**'s bank arm) and RECORDS **7A-R3 + E-R13 as dissolved** with it. Orchestrator
  dissents on file: TA-P1, TA-P7. Mechanism of record: `docs/plan/active/wave-f-contract.md`
  (amended in place) + the sitting record `docs/plan/active/track-a-sitting-1.md` (`-2`, `-3`).
- **F-A2 IS DESIGNED AND ITS AUTHORITY QUESTIONS ARE RULED — ADR-0072.** Five ruling blocks:
  opener ⑥ ratified plus the **"delete the old era" directive** (execution tier retires *inside*
  Wave F; **the post-Window-A re-extraction is TWENTY documents, superseding the full-64
  backfill** — so the legacy fallback arms' trigger falls through its own "whichever lands
  first" clause to the Wave-G reset, where F-A10 closes; legacy DATA rows die at that reset;
  the spike schemas DROP there after a cold archive, so **constraint 15's spike clause retires
  THEN, not now**) · high-stakes **RE-CONFIRMED at any amount, no thresholds** (build's
  fail-closed ceiling on file as dissent) · **OQ-4's three exits** and **OQ-6's
  no-category-gate on the agent lane**, the human lane's gate **STANDING** · **R1 RULED** ·
  the **corpus reshaped into TWO TIERS**. **Design set of record:
  `docs/plan/active/f-a2-agentic-posting-design.md` + four annexes (Annex J is new).**

- **THE WITNESS-PAIR CUTOVER (F-A1) IS LIVE — ceremonied 2026-08-20.** Every invoice-kind
  document mints `llm_witness`; the Azure invoice engine survives only as the tombstone insert;
  `witness_extraction` consents granted+activated for RS/BEE/RPR. **The F-A1 corpus measurement**
  (`docs/plan/completed/f-a1-corpus-measurement.md`) is the 0/33 baseline the re-measure reads
  against, and its live incident minted riders ③④⑤ — **all three now live-proven** (Known issues).

- **The standing law is ADR-0071 + ADR-0072 + ADR-0074 + ADR-0075.** The Charter's twelve rulings are digest
  **laws 71-76**; 0072 re-trues its scoping without changing a law; **0074 folds laws 78-81 (§11)
  and amends laws 2, 21, 71 and 76 in place — ALL RATIFIED by the owner 2026-08-22, law 78
  carrying the rider R-TA-P1-walls.** **Deep-scan findings N1-N6**
  keep their dispositions (N1→F-A2 · N2/N3→F-A5 · N4→F-A4 · N5→F-T4 · N6 doc-truth staleness) —
  and **N2/N4 are now treated as LOST records** (TA-P14 clause 6): re-scanned at their items'
  design stage, rediscoveries registered anew, the old ids retired.

- **The render deployment is LIVE and WIRED (ζ's fly ceremony, 2026-08-15):** app
  `clara-render`, one hourly machine, image pinned tag-AND-digest, the `reports/` storage
  policy pair ADDED (no UPDATE policy — x-upsert:false immutability stands), the leader's
  dispatch half BOUND via **`fly secrets deploy`** (a plain restart does NOT bind staged
  secrets), verified by an in-VM PROCESS read with both controls. **The end-to-end re-render DR
  drill is still UNRUN** — no sealed artifact exists yet (`docs/ops/DR-render.md` keeps that
  boundary explicit), and **TA-P14 now schedules it BEFORE N3's chart work.**
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
- **CI (ADR-0073, 2026-08-21):** self-hosted `clara-wsl` + `clara-wsl-2` (private-repo-only
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
| Wave F · Track A — **F-A2 proper** | **PR-0 GATE RAN 2026-08-21/22; design at v6.** Gate record `docs/plan/active/f-a2-pr0-gate-record.md`: 8-lens independent review + Codex cross-model pass, every finding adversarially verified — **3 blockers** (the generic-on-directional hole → **B15** · B10/B11's pre-stamp counterparty raise → projected-state predicate · the unbuildable-as-written `interactive_client` limb → corrected, both CHECKs extend) + **11 materials** (headline: B4-sales derived against a body superseded at `0022` — 4 independent confirmations) + nits; **S1 seam and T3's pin held every attack**. **Width: B12/B13 CUT on correctness grounds · PR-1 = THREE files, one D1 window · chat parity RIDES THE TRAIN — owner-ruled 2026-08-22 (方案二, D34), overriding the gate's severance; orchestrator's dissent on file.** **OQ-2/3/5 RULED 2026-08-22** (owner, per recommendations: stop-write-keep-table + drop the permanently-false `rule_backed` column · preview verb retires + the seeding tick re-points to the knowledge layer · B4-generic adopted with both costs priced and MEASURED at PR-4). Build NOT started — PR-1 authoring is next. | design | — |
| Wave F · Track A — **F-A3 bank agency** | **DESIGN v2, GATED 2026-08-22** — the seven `bank-agency-*` files (survey · design · four annexes · gate record [`bank-agency-gate-record.md`](docs/plan/active/bank-agency-gate-record.md)); gate 1 ran two lenses, 5 blockers / 6 materials folded, width severed into PR-1a pure extraction · PR-1b agent limb · PR-1c egress · the clock PR (which sequences AFTER F-A4 mints the wake kind, R-L7). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): open-register verbs (enter/void statement · certify · unmatch ANY pair · resolve exception incl. write-off · **the 60-day waiver, running at 60 until F-A3's battery gives the owner data**) + a duplicate-payment wall + `add_bank_account`'s COA-binding check · new `bank_matching` purpose, per client · clock-driven under law 71 · **the bank rules machine retires whole and 7A-R3/E-R13 are recorded dissolved** · owns drawer-2's vacuous-green gate | design | — |
| Wave F · Track A — **F-A4 close key ①** | **DESIGN v2, GATED 2026-08-22** — the five `close-key-1-*` files; gate record [`close-key-1-gate-record.md`](docs/plan/active/close-key-1-gate-record.md) (3 blockers / 10 materials folded; **OQ-7/OQ-8/OQ-9 ruled by R-L12/R-L13/R-L11**). **OWNS the clock spine** (R-L7 — F-A3/F-A5/F-A8 consume it) and **OWNS task #17 Fix A at PR-1b** (R-L9/GM-7/D-23). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): mints the product's FIRST calendar wake source (new wake kind, CHECK pair, six rosters; law 71 posture, no ramp) · open-year / abandon-any / re-freeze / snapshot-mint pass to her · **the minimal human doors are IN SCOPE** (finalize · abandon · a "Clara proposes close" card + its durable carrier) · evaluator-backed adjustments post, judgement accruals draft · owns the uncoded-voucher gate · **shares ONE D1 window with task #17 and TA-P6 on `finalize_close`** | design | — |
| Wave F · Track A — **F-A5 reporting agency** | **DESIGN v2, GATED 2026-08-22** — the five `reporting-agency-*` files (renamed from `fa5-agency-*` at landing); gate record [`reporting-agency-gate-record.md`](docs/plan/active/reporting-agency-gate-record.md) (3 blockers / 7 materials / 1 nit folded; **OQ-5 ruled by R-L14** — the solo self-attestation arm on the agent lane; **the sandbox EXPORT path severed to lane F-A5b, R-L15**). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **"end to end" rewritten open→evaluate→seal→render — ISSUE IS HUMAN** · the issue wall re-arms on the DIRECTING human, self-run fails closed to a human, `agent_prepared` receipts, a solo arm · self-run packs exempt from `0084`'s orphan-adoption · sandbox exports with a **byte-burned watermark** + the covered-recipient cross-client test · **the first real seal + byte-reproduction drill precedes N3** | design | — |
| Wave F · Track A — **F-A6 audited freeform read** | **DESIGN v2, GATED 2026-08-22** — the five `freeform-read-*` files; gate record [`freeform-read-gate-record.md`](docs/plan/active/freeform-read-gate-record.md) (4 blockers / 5 materials folded; **GB-1 ruled by R-L16** — the default SHIPS with grant + one-arm/one-settle and its three required cells; **the cross-client sibling verb severed to lane F-A6 v2, R-L17**; **XLSX/DOCX structured-parse excluded in v1, R-L18** — a named contract deviation). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): a **DECIDED** read surface: server-side client scoping, cross-client as a named receipted action, HOME chat firm-wide, an **enumerated table list printed as an audit line (closes audit GAP5-5, HIGH)**, `interactive` only at first, no RBAC tiering, no per-firm signature gate · a **DEFINER read wrapper** — no receipt, no read · bookkeeper+ human read surface · law 28's cross-model pass still mandatory | design | — |
| Wave F · Track A — **F-A7 filing + interview** | **DESIGN v2, GATED 2026-08-22** — the five `filing-and-interview-*` files; gate record [`filing-and-interview-gate-record.md`](docs/plan/active/filing-and-interview-gate-record.md) (6 blockers / 8 materials folded; severed into five trains — π additive · γ egress · α constitutional; **AM-8 WIDENED at landing**: Clara reverses her own posted misattribution herself and raises the question, only the cross-client re-home stays the human's). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED** — the α train's judgement half was gated on the ratification and is now unblocked on that axis. Ruled scope (ADR-0074): **attribution becomes her JUDGEMENT under structural walls — CONSTITUTIONAL, and RATIFIED as digest law 79 on 2026-08-22, so the judgement half is no longer signature-blocked**; four riders ship with it (contradiction wall · ROME-family collision guard · correction path + misrouted-egress event · the firm-scoped unattributed-document carrier) · the firm-level NARROW purpose with its closed document list, **gated on C6** · `classify` must come under governance first · the promotion door · F-A7b = CLIENT onboarding only | design | — |
| Wave F · Track A — **F-A8 internet lane** | **DESIGN v2, GATED 2026-08-22** — the four `internet-lane-*` files; gate record [`internet-lane-gate-record.md`](docs/plan/active/internet-lane-gate-record.md) (6 blockers / 9 materials folded; the annex was reconciled wholesale, PR-1 is greenfield **Tier-1 only**). **Two obligations still open before PR-2:** the law-28 cross-model pass on the Tier-2 injection surface, and the unnamed Tier-2 search VENDOR (`wake_web_search` does not ship until named). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): **depends on F-T1 for the SST rate table** (F-A8 only attaches the fetch) · Tier-1 closes to `fx_rates` + SST rate + SST threshold · rows land through an **audited owner one-click door, not a PR** (two mechanical checks; `0016`'s assertion relaxed for Tier-1 only) · immutable+supersede, backdate triggers an impact scan, **missing row REFUSES** · no client identity on Tier 2 in v1 · **citation enforced at the tool boundary** | design | — |
| Wave F · Track A — **F-A9 metering** | **DESIGN v2, GATED 2026-08-22** — the four `metering-*` files; gate record [`metering-gate-record.md`](docs/plan/active/metering-gate-record.md) (4 blockers / 6 materials folded; **PR-0 = the chat-cap hotfix FIRST**, then PR-1A the ledger reshape with no D1; **`llm_usage_events.firm_id` becomes NULLABLE for platform-level calls, R-L10** — a NULL firm is a platform call, never an unmetered one). **PR-1 prerequisite SATISFIED 2026-08-22** — the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls (TA-P1 · TA-P5's law-21 narrowing · TA-P7 · law 76); **the remaining prerequisite is F-A2's PR-1 MERGED**. Ruled scope (ADR-0074): ONE ledger: `llm_usage_events` reshaped for any call kind, **`client_id` + triggering actor added NOW (irreversible if missed)**; the Slice-4 ledger + reserve/reconcile machinery retire — **that deletes live real data, and the owner's ruling is recorded as that sentence** · the brake census is design's first deliverable (one page, one owner signature) · **the chat token cap ships as a HOTFIX ahead of F-A9** · the `refused_budget` rename is mandatory | design | — |
| Wave F · Track A — **F-A5b sandbox export** | **REGISTERED 2026-08-22 (R-L15)** — severed out of F-A5's v2 as SEQUENCING, explicitly **not** a narrowing of TA-P10 C′. Its own design pass and its own PR-0 **carrying the law-28 cross-model pass**, plus OQ-1/OQ-2's `sandbox_watermark` trio and OQ-3's recipient-scope model (the mechanical "recipient covers every `client_id` in the file" check that lets a group owner see a multi-company comparison). F-A5 proper keeps the sealed lane's `artifact_watermark` trio. Default on the wording: no row seeded, literals stay, R-N1 registered. | design | — |
| Wave F · Track A — **F-A6 v2 cross-client named read** | **REGISTERED 2026-08-22 (R-L17)** — severed out of F-A6 v1 as SEQUENCING, explicitly **not** a narrowing of TA-P9 A(2): the cross-client sibling verb cannot function until **F-A2's `interactive_client` limb merges**. v1's refusal `cross_client_unavailable` must NAME the deferred action (the battery cell forcing the naming stays in v1); HOME chat is unaffected. **Also carries R-L18's deferral** — XLSX/DOCX `structured_parse` content, excluded from v1 because `document_extractions`/`document_regions` carry no `client_id`, so a client pin would leak a sibling's document body (`get_document_extract` stays the door). | design | — |
| Wave G · frontend (Codex session, parallel) | **HANDOFF LANDED 2026-08-23** — `docs/plan/active/frontend-handoff-2026-08-23.md`: the complete enterprise frontend (signup/invite · onboarding · the two-pane Agentic OS shell · documents · drafts · bank · close · reports · receipts · admin) built in THIS repo as the new **apps/web** package on branch **frontend/web**, replacing `apps/dashboard` at cutover. **ALIGN BEFORE CODE** — §8's grill-first list goes to the owner (visual direction · two-pane IA · card-catalog extensions · mobile scope · i18n EN/BM/中文 · the a11y bar above the legal floor · per-journey "done") before product code, per constraint 6. Settled and closed in §0: Cloudflare Workers via `@opennextjs/cloudflare` · Supabase cookie auth, invite-only first · Resend carrying no client data · Tailwind + shadcn adopted · the LIVE project as the data (ADR-0075) · crude Track-A doors replaced IN PLACE with the same verb, never a new gate. | design | — |
| Wave F · Track B — **F-T3 draft tax computation** | **DESIGN v1 2026-08-23** (`tax-computation-survey.md` · `-design.md` · `-annexes.md`); **PR-0 gate pending**; **hard-gated on F-A5 PR-1 + F-A4 `close_receipts`**; owner questions **OQ-1/7/8** for the sitting. Three findings reorder the item: the tax layer is **greenfield** (zero repo hits for `cp204`/`form_c`/`add_back`/`chargeable`, and `0041`'s `ca_class` trio is written by the register and read by nothing — F-T3 is WD-R12's first consumer) · **no acceptance oracle exists in the owner's three folders** (no Form C/B/P, no CP204, no computation worksheet, no FA register — so acceptance cannot be "reproduce the accountant's prior year", **OQ-1**) · **the number path is live but has never carried a run** (`reporting_periods`/`period_snapshots` zero rows, no `report_run` ever opened) — a hard sequencing dependency, not a build-time discovery. | design | — |
| Wave F · Track B — **F-T4 fix queue** | **DESIGN v1 2026-08-23** (`fix-queue-survey.md` · `-design.md` · `-annexes.md`); **PR-0 gate pending.** Five PRs: **the ceremony DSN bridge first** (in-repo at last — it was never in the repo, and every remaining Wave-F/G ceremony walks it) · **N5 as a governed `refusal_remedies` table** rather than a `fix` backfill across ten applied migrations, preserving the coding mapper's no-raw-text hardening · **the 401/403 split** with a retryable `engine_auth` code, at the two human doors only · **P-3's drawer-1 census via a `banking_arrangement` client FACT** on the `trade_nature` precedent, never an attestation (drawer 1 has no attestation path and gains none) · **item E's two cells**. **The claims accounting convention (§8) is an OWNER SITTING QUESTION**, with MPERS / CA 2016 / LHDN citations fetched 2026-08-23 and four NOT-FOUND absences recorded honestly. Cross-item **X-1**: the bank-class COA account any registry-vs-ledger predicate keys on is **minted by registration**, which makes F-A3's arm 4 vacuous on the same population. **No rig ran — every body-level claim is a prediction for PR-0's replay.** | design | — |
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
3. **F-A2 BUILD per its design** (`docs/plan/active/f-a2-agentic-posting-design.md` + the three
   annexes, v4, DONE): PR-0 the judgement-logic + cross-model gate → PR-1 (two DB files, ONE D1
   window) → PR-1b the pack splice → PR-2 the runtime (`autoDraft_v9`, `chatTurn_v13`, the new
   frozen infra `_vN`) → PR-3 cutover + retirement (D1) → PR-4 acceptance. **Two more ceremony
   windows, from merged `main`.** Track B runs in parallel; **task #17 is unblocked** (ADR-0072 ④).
4. ~~**THE TRACK-A DESIGN FAN-OUT**~~ — **DONE 2026-08-22: all seven design sets are at v2, each
   GATED with its own PR-0 gate record** (see the lane rows; the member tables in
   `docs/plan/active/track-a-sitting-1.md` (`-2`, `-3`) stay the per-item consequence map, and R-B
   the 71 design-layer questions). **What remains is BUILD**, in this order: ~~the digest re-sign~~
   **SATISFIED 2026-08-22** · **F-A4 mints the clock spine first** (R-L7; F-A3's clock PR,
   F-A5 and F-A8 consume it) · two items ship AHEAD of their parent (TA-P12's chat token-cap
   hotfix before F-A9; the first real seal + byte-reproduction drill before N3 in F-A5) · **three
   lines share ONE D1 window on `finalize_close`** (task #17 Fix A, **owned by F-A4 PR-1b** ·
   TA-P4's receipt columns · TA-P6's `segregation_mode`) · two severed lanes are registered but
   unscheduled (**F-A5b** sandbox export, **F-A6 v2** cross-client named read).
5. ~~**THE OWNER'S DIGEST SIGN-OFF is the next constitutional gate.**~~ **GIVEN 2026-08-22 — laws
   78-81 and the four annotated laws (2, 21, 71, 76) are RATIFIED, law 78 carrying the rider
   R-TA-P1-walls; F-A7a's judgement half is unblocked.** The two follow-ups the signature did not
   itself do: ~~the PRD §6.2(a) / ARCHITECTURE §0.1 product-text edits~~ **LANDED (#287)**, and the
   **`AGENTS.md` home question for invariant (a) — still OPEN, the owner's call.** ~~R1~~, ~~the corpus
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

**Named build debts (deadline-triggered):**
- **The `closing_transfer`/SST-turnover latent (0056) — R1 RULED 2026-08-20 (ADR-0072 ④), task #17
  UNBLOCKED; the full argument moved 2026-08-22 to
  `docs/plan/completed/progress-archive-2026-08-part2.md`.** State: **Fix A's OWNER is F-A4 PR-1b**
  (R-L9 / GM-7 / close-key-1 D-23 — the double claim between F-A4 and Track B is resolved to one
  owner); **Track B's 13-cell battery rides it.** Shape unchanged: BOTH writer bodies
  (`finalize_close` + the `0085:379-386` B3 reopen mirrors) marked at birth in ONE migration — a
  single-body fix INVERTS the defect into compounding inflation — D1 on the `0085` template, a
  forward-only proof asserted fail-closed at apply. Blast radius advisory-only (a suppressed 80%
  early-warning ladder, never a wrong book). Fix B stays STRUCTURALLY BLOCKED. **OD-7 discharged by
  the same ruling.** *(task #17)*
- **Reconciler follow-ups (#255's law-1 review — all pre-existing, none blocking, each its own
  PR):** the `expired` key collision (`reconciler.mjs:633` spreads `intakeRecovery`
  unconditionally after `expiry`, always clobbering `expireClarifies`' count — unread by
  `leader.mjs` today; clarify-expiry survives the rules-machine retirement, so the Charter does
  not reach it) · the leader render-pair try/catch (`leader.mjs:200-211`) still swallows
  halt-class errors — unreachable today, but the one remaining halt-eating catch on that path ·
  `wiki-projection.mjs:333-346`/`:594-599` carry three bare `to_regprocedure` probes.
- **`high_stakes_amount_cents` has no governed self-serve verb** (found by the 2026-08-21
  client-naming audit): the RM100k threshold was set by a one-time hand-run deploy script
  (ADR-0044's ceremony); a future SaaS firm cannot configure its own threshold through an
  audited door. Not a defect today (the column and its `is_high_stakes` reader are fully
  generic and per-firm); a **Wave-G OS-surface item** — the governed verb ships with the
  firm-setup flow. *(audit record: session log 2026-08-21)*
- **`closing_stock` producer verb** — before any real goods-trader close. **Wave G does NOT
  schedule it:** ADR-0072 ⑤ defaulted OD-2 to "not in the first pass". *(PR #228 residual 5)*
- **`opening_tb.line` producer + the K-doc door** — Phase-5, review-gated. The Wave-G corpus
  does not need it: its run script seeds brown-field openings by key, not by document. *(ADR-043)*
- **δ NAMED RESIDUALS — all five STAND, none scheduled; the full text moved 2026-08-22 to
  `docs/plan/completed/progress-archive-2026-08-part2.md`** (F10's `transaction_timeout` · the
  B4 dollar-quoted sandwich · the 57014 `caller_reported` label · the RS guard's
  between-transactions lift window · the Supavisor headroom re-measure). **η — not δ — owns the
  production human/OBO/wake caller**; direct wake/runtime evaluator grants and synthetic human
  JWTs stay forbidden — a law statement, and it next matters at **F-A5's OBO closure**.

**Structured-format lanes (event-triggered; registered 2026-08-20 so they live here, not only in
code comments). Both were verified at the bytes, and both differ from how the lane gets casually
described — each disposition is what the read SAW:**
- **OFX/QFX — the parser is BUILT and UNEXERCISED, not unbuilt.** Intake canonicalizes four spellings
  to one mime (`intake.mjs:44-48`), `scan.mjs` detects both dialects, intake is deliberately
  **STORE-ONLY** (`intake-lanes.mjs:54`), and `parseStatementOfx` (`statement-parse.mjs:331`) maps
  identity, currency, period, `LEDGERBAL` and every `STMTTRN` behind the same interface as CSV — with a
  named limitation (OFX prints no opening and no totals, so it corroborates only where continuity
  supplies the opening). **Missing: a runtime battery over the parser body, and a real client file.
  Trigger: the first client whose bank exports OFX.** *(Wave C-b §4.3)*
- **XLSX/DOCX — parsed VALUES-ONLY; the gap is SEMANTICS, not a parser.** They route to
  `structured_parse` (`intake-lanes.mjs:55`) and `structured-worker.mjs` reads them, but every region
  carries **`monetary_cents: null`** and a structural `field_path` (`sheets.0.B7`), never an accounting
  one: **no facts**, content reachable only by AI-assisted read. **NOW OWNED by lane F-A6 v2** (R-L18 —
  excluded from F-A6 v1 because `document_extractions`/`document_regions` carry no `client_id`).
  **The design decision is not the parser:** unattended posting from a spreadsheet needs its **own
  corroboration anchor** — *which cell is the total is a judgement, not a structure.*

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
~~The monthly harness ablation~~ **STALE** (G7 declined its benchmark); ~~the system-prompt investment pass~~ **RE-HOMED to F-A2**.

**The F6–F9 register (ADR-0066), trued 2026-08-20:** **C1 `failed_retry` unwitnessed live** — drill unrun,
but **the door is reachable on live data for the first time** (`v_lane` is now `llm_witness` and the corpus
run left real terminally-failed witness tasks) · **the `internal` lane has no self-service door**,
live-relevant for the same reason · admission-time envelope label · mint-time-only ocr reclaim bound (both
survive on the surviving OCR lane) · ~~the 401/403 split~~ **RE-HOMED to F-T4** · **F8's single-use door +
two 0034 inherits + the landscape-refresh autonomy class — re-examine at F-A2**, which replaces F8's host
lane · F9 no-unpark path + parked-residual acceptance. ~~X7's five residuals~~, ~~`in_vendor_block`/
`is_vendor_name` unproven live~~ and ~~the parked 6/6/6/85 floor~~ — **all three STALE**, the first two
closing as *retired unproven*.

**Gates on the operating runway:** **Gate P** (first native-MYR SST-stated supplier bill, or the Wave-G reset;
reminders RETIRED per ADR-0068). Restated so it is not re-derived: ADR-0066 **measured the waiting population
at seven documents**, all newest-`ocr`-task failed/`bad_type` with NULL `document_kind` — **F6 does NOT unblock
them**; the only honest remedies are an owner re-export or the 401/403 split above. The capitalised/
mixed-purchase tax-allocation question and the Gate D residuals ride it · **Gate S**'s real-XML leg,
UNSCHEDULED, waiting on the world · **FINCARE RSINV-2510/02** needs a human coding decision, **but its
recorded blocker is stale** (ADR-0066 pinned it on Azure typing no `CustomerName` region; the witness pair
needs none) — re-ask after the F-A2 re-extraction.

**η residuals (Wave-E close, PRs #240/#242) — all four STAND, none scheduled; the full text
moved 2026-08-22 to `docs/plan/completed/progress-archive-2026-08-part2.md`:** the estate-wide
whitespace-blind blank-op-key idiom (one uniform pass, never per-lane) · the co-effective policy
seed-test's fixture design (append-only `clara.edge_policy_sets`) · the δ-family window-blind
wall-side policy resolution (**a false refusal, never a false preview**; retires when wall and
writer resolve by window together) · `0084`'s out-of-tree tooling at `C:\ct\` (see Tooling).

**CI economics overhaul — BUILT 2026-08-21, ADR-0073; the block moved 2026-08-22 to
`docs/plan/completed/progress-archive-2026-08-part2.md`** (the ADR is the record). **Surviving
residuals, unchanged:** lever (4) HYBRID runners **DECLINED** ($0 preference) · **the operating
practice — after any PR touching a closed drill or the pipeline, run `gh workflow run ci.yml` by
hand** (`docs/ops/ci-runner.md`) · a stale PR needs `gh pr update-branch` + re-green, **never
`--admin`** (#277) · batch-CI-per-wave stays REJECTED.

**Wave-F planning inputs — DISPOSED by ADR-0071/contract:** #25 SUPERSEDED · E-R13 ABSORBED (F-A3) · FX-lite
principle pre-seeded (P-FX; timing stays a sitting item) · claims (E-R10) → F-T4 · **staff allowances /
self-billed detection / WHT are UNSCHEDULED** — F-T1..F-T4 name none of the three, and "Track-B candidate" is
not a schedule. **Wave-G:** the OS surface + the UX-debt backlog (E-R10) + design trio population + **the
factory reset + full E2E rebuild from raw documents** (ADR-0072 ⑤ rules its shape; ADR-0075 makes the whole
estate resettable). **Roadmaps, risks, Phase-5:** `docs/plan/active/roadmap.md`.

**Wave-D/C carried deferrals:** ~~FA carry-down's first real firing~~ and ~~one real
reducing-balance asset~~ — **ABSORBED into the Wave-G corpus** (§6 puts both on the bank-volume
slot's opening register) · first live real recurring template (event-triggered; the corpus slot
matrix names no recurring-template slot) · C-a residuals (§5.3 pool segregation · the Section-I
wedge remedy · the real-PG dead-letter battery, declined) · C-c F-3 documented-as-is.

**Slice-era standing residuals — the full block moved 2026-08-23 to
`docs/plan/completed/progress-archive-2026-08-part2.md`** (verbatim; none has a PR, every row carries its
disposition). Live pointers only: the **Supabase non-superuser deploy-role CI** leg is DESIGNATED to the
weekly sweep by ADR-0073, its own PR · the **Slice-4** residuals (compliance export · trace-debug surface ·
chat-visibility toggle · the S4-V2 engine-hook-lifetime canary watch · job-level liveness) stand ·
**Slice-2/3/6 and Wave-A** rows are deferred, declined, event-triggered or absorbed (F-A2 · F-A7a · Wave G).

**Interview v3 residuals — ALL THREE RE-HOMED TO F-A7b, and TA-P14 makes that binding** (the contract now
names them): `readClearsError` never checks `runId` · **the concurrent-submitter receipt gap** — a RUNTIME
CONTRACT change, the fix being a server-authored per-(run, park, submission) receipt · **the interview e2e
de-pin**, whose own text calls it a dated tripwire "stale at the next core bump" — **F-A7b IS that bump**.

**Owner/legal:** **C6 legal pack DRAFTED + CITATION-VERIFIED 2026-08-22** — the three documents
ADR-0074/TA-P3 put ahead of F-A7's firm-level narrow purpose are on disk in
[`docs/ops/legal/`](docs/ops/legal/) (OpenAI DPA brief · the client AI-authorization letter
template en/ms/zh whose purpose list IS the future onboarding click-through · the PDPA s.129
cross-border basis memo), each carrying a DRAFT / not-legal-advice banner. **Owner items: NONE**
— the training-share toggle was confirmed OFF by the owner 2026-08-22, the DPA auto-incorporates
through the Business Terms (no click), and ZDR / the entity note / the Malaysian-lawyer pass are
record-keeping or post-beta. **They gate nothing.** **The real-data egress gate is the CLIENT's own
onboarding click (F-A7b), which is product work, not paperwork** · tracing stays OFF · **the OpenAI
processor bundle — NON-BLOCKING by the 2026-08-18 direct-release ruling; the DPA-first
recommendation on file as dissent (F-A1 design §5)**, live-relevant because the witness pair
ships real client documents daily · the first monthly LIGHT DR sitting (WB-R26) · PITR
(deferred) · **WB-R22's target capability**, still the only route by which B3's
`distinct_checker` arm gets exercised on real books · PRD §9 · the old SGD-document clarify.

**Tooling follow-ups. RE-HOMED to the F-A2 / F-T4 fix queues by the 2026-08-20 audit — four items:**
**(1) the ceremony DSN bridge belongs IN-REPO** (commit the pooler CA + a dsn-pipe successor; the 2026-08-19
ceremony ran `sslmode=no-verify` because the prior sessions' pinned-CA tooling was session-local and gone —
the handoffs-rule failure shape **twice now**, and the highest-value item here: every remaining Wave-F/G
ceremony walks it) · **(2) the wiki CoR-comment gate** · **(3) `0057` §11's writer-roster successor** ·
**(4) `0007`'s firm-limits pseudo-upsert**. **Still unscheduled:** the dr-verify trio (UTC hashing · the
STRICT canary probe's stale expectation · the AP-gate ILIKE example) · the runtime boot line should name its
bundle version (the positive-read law's second leg, hand-assembled at four ceremonies now) · Supavisor
headroom re-measure (**one item registered twice** — the δ residual above) · the local disposable Supabase
stack · the ComplianceWatchCard `acknowledged_at` echo · the unreverted-admin-grant lint watch · **`0084`'s
derivation tooling retained only at `C:\ct\`** — the machine-local-custody shape that bit the DSN bridge
twice; worth pricing for in-repo custody.

## Known issues

- ~~**R-OWNER — B15's second door**~~ — **RULED 2026-08-22 (owner, option C), now a PR-1 BUILD OBLIGATION,
  not a gap.** Full record archived in `-part2.md`; the obligation lives at `0074-annex-a-mechanisms.md`
  R-OWNER + `docs/plan/active/f-a2-annexes-4-build.md` J.4 (`_document_direction` recut so ONE held hard id
  suffices, new `untestable` class, D1 + `prosrc`-SHA pin; B15 also refuses
  `generic_registration_untestable`) — **D18 now stands for direction-SILENT documents only.**
- **The `AGENTS.md` home for invariant (a) is FLAGGED, not drafted** (ADR-0074/TA-P7). The
  sitting record names "constraint 2" as the third home, but constraint 2 is the
  DB-owns-every-authoritative-number law and **no hard constraint states invariant (a) at all**
  — so it is either a no-op or a new clause. Owner's call at sign-off; nothing was guessed in.
- **The wiki dynamic-SQL gate reads CoR-block comments UN-MASKED** (found 2026-08-20 on 0097):
  `parseCoRPatches` tests `CREATE_FN_RE` against a block whose `--` comments survive the
  file-level `maskComments` (dollar-quoted interiors are skipped), so a create-function phrase
  **quoted in a comment** reclassifies the block as a dynamic function-creator and reds the
  gate. Workaround: wording — never quote a recut statement in a CoR comment. Real fix = mask
  the block's own comments before the CREATE test + a selftest cell. Judgement logic, its own
  reviewed PR; **re-homed to the F-A2 fix queue.**
- ~~Riders ③④⑤ 0-live~~ · ~~corroboration 0/33~~ · ~~ci.yml over 500~~ · ~~the stranded pair~~ —
  **all four RESOLVED and ARCHIVED 2026-08-22** (`-part2.md`; re-measure 12/20 stands in posture).

**THE NEXT-ROUND QUEUE (from the 2026-08-21 re-measure; the first four are PROMPT-side — the
evaluator stays strict, and widening it would be a frozen-evaluator change needing its own
version + ceremony):**
- **MYR currency-code prompt fix — the largest measured refusal cause outside the arm, and a
  FALSE refusal (2/20).** Both EZSEC documents answer `value("RINGGIT MALAYSIA")`; the rule
  reduces to letters and demands `('RM','MYR')`, so `'RINGGITMALAYSIA'` lands outside and the
  document is judged **unproven, not foreign**. Every other conjunct was read individually on
  both and holds. **Ask for the currency CODE, not the printed rendering** (witnessFacts v3).
  *(Two undriven EZSEC documents share the layout.)*
- **Dash-is-not-a-value clarification.** Vision reports a bare `-` as `state:'value'`, text as
  `not_printed`; the mismatch sets `v_agree_ok := false` unconditionally and cost **both
  BRIGHTPATH documents**. (`509e788d` also has a rounding SIGN split: text `+0.40` vs `- 0.40`.)
- **Vision-prompt check against the bare SST-id shape** (`[A-Z]\d{2}-\d{4}-\d{8}`). Lock 3 caught
  the one genuine registrant on the **text** channel alone — the margin was one channel, not two.
- **`coverage.pages` is emitted EMPTY on every text row (20/20).** Well-formed, and **no lock
  reads it** (verified against the live evaluator body), so nothing fails closed — but a field
  that always says `[]` cannot be promoted into a lock without being fixed first. **Fix in the
  v2 behavior or drop it, before anything reads it.**
- **The discount-no-net class counts 3, not 2** (`f48a8830`, `6f82065e`, `bd6d37fb` — all ROME
  SECRETARY / D&D-family); the third came from a *changed read*, not a changed rule. **Trues the
  number in the on-file owner trigger question** on whether sub-case (b) should admit a printed
  discount — still the owner's, since the change would be the evaluator inventing structure.
- **M1's reconciler re-mint is a NAMED FOLLOW-UP** (found at #270's review, not shipped in it):
  the sidecar `runId` is clobbered on the re-mint path —
  `packages/runtime/lib/reconciler-documents.mjs:198-206` with `packages/runtime/lib/spool.mjs:124`.
  A real defect with a known site pair; its own PR, not a rider on a pacing fix.
- *(The stranded-pair row is in the archived batch above; the `0051` door's `v_lane` defect
  stays unrepaired by design — no new member can mint post-cutover.)*
- **0057 §11's writer roster has no live successor** (PR-4 review): a future unrostered
  books-writer would pass silently — the roster runs only at 0057's own apply. Candidate: a
  standing census cell. **Sharper since the cutover:** `0096` rotated the writer estate and
  `0098` added `_persist_statement_core_v2`, so the guarded population grew while the roster
  stayed pinned. **Re-homed to the F-A2 fix queue.**
- **Rig recipe pin + the WSL split-brain cure** — full record ARCHIVED 2026-08-22 to
  `docs/plan/completed/progress-archive-2026-08-part2.md` (verbatim); **the standing law stands:**
  drive the db suite with libpq `PG*` vars + `CLARA_ALLOW_DESTRUCTIVE=1`, NEVER `DATABASE_URL`,
  and cure WSL split-brain with a full `wsl --shutdown` when runners are IDLE, then one keeper.
- **Three genuinely dangling doc paths** — `RENUMBER.md`, `algebra.md`, `INTERFACE-PINS.md`:
  authored in build worktrees, never committed. Inert (digest law 41 + ADR-058 carry the
  renumber procedure); re-author only on a real need.
- **Two γ post-CLEAN NITs** (PR #231, residuals 4–5): skeleton self-citation drift · S11.4c's
  `''`-vs-NULL branch. One-word fixes awaiting the next `0057`-area batch.
- ~~**BEE's opening TB**~~ — **RESOLVED 2026-08-20** for ADR-043 by a live read; record archived
  in `docs/plan/completed/progress-archive-2026-08-part2.md`. **The one residual that stays open:**
  the four `opening_items` sum to +7,850,406 cents with no `obe_plug` item while the journal
  balances through `190-OBE` — **UNADJUDICATED** (sign convention unknown, nothing guessed).
- **WSL VM/NAT operating law** (2026-08-14/15 incident; narrative archived): a detached keeper for any
  port-dependent WSL work (`Start-Process -WindowStyle Hidden wsl.exe -ArgumentList "-e","sleep","43200"` —
  NAT dies ~10 min after the last client detaches even with the VM held); NEVER `wsl --shutdown` with runners
  busy (restart services via `wsl -u root systemctl restart`); never diagnose VM health with a probe that
  cycles the VM.
- **The 0007 firm-limits pseudo-upsert trigger is column-hardcoded** (`_tf_firm_document_limits_upsert`): a
  partial-column INSERT against an existing firm row silently RESETS the other limit columns to their
  defaults, and `0090`'s `llm_witness_concurrency` is invisible to it entirely — settable only by direct
  UPDATE, and exactly the knob the corpus incident made people want to turn. **Re-homed to the F-A2 fix
  queue**, riding the pacing work.
- ~~**The statement-pair coin flip**~~ — **HEALED FORWARD-ONLY as of 2026-08-21** (`0102`'s router
  re-key + the `statementFacts_v2` repoint); record archived in `-part2.md`. **The residual that
  never closes: the historical coin-flipped pairs are NEVER repaired** — `superseded_by` is
  once-only (CLR08), so they are counted and named, never rewritten (design §3.9 note 5).
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
- **Local-only test-isolation flake in the db package** (pre-existing, NOT functional):
  `a21-prestate.test.mjs` leaks `PGDATABASE` into the shared Node process, so reused-DB
  full-suite runs inflate failures (13 vs the true 7; `pipeline.test.mjs` self-diagnoses the
  mismatch). CI green both ways. Fix candidate: scope the env var inside the subprocess.
- **The estate-wide whitespace-blind blank-op-key idiom** stays REGISTERED under η residuals
  in the Backlog — noted here so a Known-issues-only reader does not miss it.
- **VHDX compaction residue** (2026-08-14 disk-full event; narrative archived): the ~60GB
  `ext4.vhdx` stays large — the elevated `diskpart compact vdisk` is an OWNER-KEY item
  (runners idle first). Standing practice: fleet runs prune docker volumes as stages finish.

## Session log

*(Entries through the 2026-08-21 Window A+B ceremony are verbatim in
`docs/plan/completed/progress-archive-2026-08.md` + `-part2.md`, alongside F-A1's operative
records: its ceremony as-runs and the corpus measurement.)*

- **2026-08-22 (the TRACK-A SITTING · the TRACK-A v2 DESIGN LANDING)** — fourteen rulings TA-P1…TA-P14
  with four constitutional amendments, then all seven design sets to gated v2 (36 files), rulings
  R-L11…R-L18, the C6 pack and the owner's ratification. **Both entries ARCHIVED VERBATIM** to
  `docs/plan/completed/progress-archive-2026-08-part2.md`; the governing minute is
  `docs/adr/0074-the-track-a-sitting.md` (+ `0074-annex-a-mechanisms.md`), the design sets in
  `docs/plan/active/` are the operative record. Merged as #284/#285/#286/#287.
- **2026-08-23 (the ALIGNMENT GRILL — ADR-0075; the SPLIT PASS)** — **the owner widened the test-data
  authority** (posture above carries it in full: data free · gates walked by the delegate through the real
  audited doors · mechanisms never move · constraints 12/13/14 re-scoped · digest law 82). Same session: the
  numbers law re-confirmed with Clara authoring rules/evaluators through the TA-P8 promotion door; **digest
  law 77 ratified** (#286); the **invariant-(a) product text** amended in PRD §6.2(a)/§6-3 and ARCHITECTURE
  §0.1 (#287). **The SPLIT PASS ran the same day** — nine files had reached exactly 500 and every added line
  was being bought by re-wrapping: `docs/adr/README.md` → `README-log.md` (the six dated re-truing minutes),
  `0074` → `0074-annex-a-mechanisms.md` (the exact register, the residue, TA-P1's dissent), and this file
  swept again. **F-A9's D17 ruled (R-L19): price rows are developer-seeded migration data; PR-1E dropped.**

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
