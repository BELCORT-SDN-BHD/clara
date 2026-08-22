# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-22 — the opener train is CEREMONIED and F-A2's PR-0 gate has RUN; trued at
every clock-out)*

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
  TA-P14) scope F-A3…F-A9 and widen F-A10.** **Four CONSTITUTIONAL AMENDMENTS are drafted and
  PENDING the owner's next digest sign-off — no product text is edited until then:** law 71's
  roster becomes an **OPEN REGISTER** (any act it does not reserve is the agent's) · **invariant
  (a) becomes the agent's JUDGEMENT under structural walls** (PRD §6.2(a) LAW · ARCH §0.1 ·
  digest law 2; **the `AGENTS.md` home is FLAGGED, not drafted** — see Known issues) · law 21
  narrows to periodic POSTING belts · law 76's "LLM" drift is trued. Laws **78-81** fold as
  digest §11 and enter the ratified set at the same signature. **Ruled ahead of PR-1 on
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

- **The standing law is ADR-0071 + ADR-0072 + ADR-0074.** The Charter's twelve rulings are digest
  **laws 71-76**; 0072 re-trues its scoping without changing a law; **0074 folds laws 78-81 (§11)
  and annotates laws 2, 21, 71 and 76 as AMENDED-PENDING-SIGN-OFF.** **Deep-scan findings N1-N6**
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
| Wave F · Track A — **F-A3 bank agency** | **RULED at the 2026-08-22 sitting — ADR-0074; design fan-out next.** Open-register verbs (enter/void statement · certify · unmatch ANY pair · resolve exception incl. write-off · **the 60-day waiver, running at 60 until F-A3's battery gives the owner data**) + a duplicate-payment wall + `add_bank_account`'s COA-binding check · new `bank_matching` purpose, per client · clock-driven under law 71 · **the bank rules machine retires whole and 7A-R3/E-R13 are recorded dissolved** · owns drawer-2's vacuous-green gate | design | — |
| Wave F · Track A — **F-A4 close key ①** | **RULED — ADR-0074; design fan-out next.** Mints the product's FIRST calendar wake source (new wake kind, CHECK pair, six rosters; law 71 posture, no ramp) · open-year / abandon-any / re-freeze / snapshot-mint pass to her · **the minimal human doors are IN SCOPE** (finalize · abandon · a "Clara proposes close" card + its durable carrier) · evaluator-backed adjustments post, judgement accruals draft · owns the uncoded-voucher gate · **shares ONE D1 window with task #17 and TA-P6 on `finalize_close`** | design | — |
| Wave F · Track A — **F-A5 reporting agency** | **RULED — ADR-0074; design fan-out next.** **"End to end" rewritten open→evaluate→seal→render — ISSUE IS HUMAN** · the issue wall re-arms on the DIRECTING human, self-run fails closed to a human, `agent_prepared` receipts, a solo arm · self-run packs exempt from `0084`'s orphan-adoption · sandbox exports with a **byte-burned watermark** + the covered-recipient cross-client test · **the first real seal + byte-reproduction drill precedes N3** | design | — |
| Wave F · Track A — **F-A6 audited freeform read** | **RULED — ADR-0074; design fan-out next.** A **DECIDED** read surface: server-side client scoping, cross-client as a named receipted action, HOME chat firm-wide, an **enumerated table list printed as an audit line (closes audit GAP5-5, HIGH)**, `interactive` only at first, no RBAC tiering, no per-firm signature gate · a **DEFINER read wrapper** — no receipt, no read · bookkeeper+ human read surface · law 28's cross-model pass still mandatory | design | — |
| Wave F · Track A — **F-A7 filing + interview** | **RULED — ADR-0074; design fan-out next.** **Attribution becomes her JUDGEMENT under structural walls — CONSTITUTIONAL, so the judgement half waits on the owner's digest sign-off**; four riders ship with it (contradiction wall · ROME-family collision guard · correction path + misrouted-egress event · the firm-scoped unattributed-document carrier) · the firm-level NARROW purpose with its closed document list, **gated on C6** · `classify` must come under governance first · the promotion door · F-A7b = CLIENT onboarding only | design | — |
| Wave F · Track A — **F-A8 internet lane** | **RULED — ADR-0074; design fan-out next.** **Depends on F-T1 for the SST rate table** (F-A8 only attaches the fetch) · Tier-1 closes to `fx_rates` + SST rate + SST threshold · rows land through an **audited owner one-click door, not a PR** (two mechanical checks; `0016`'s assertion relaxed for Tier-1 only) · immutable+supersede, backdate triggers an impact scan, **missing row REFUSES** · no client identity on Tier 2 in v1 · **citation enforced at the tool boundary** | design | — |
| Wave F · Track A — **F-A9 metering** | **RULED — ADR-0074; design fan-out next.** ONE ledger: `llm_usage_events` reshaped for any call kind, **`client_id` + triggering actor added NOW (irreversible if missed)**; the Slice-4 ledger + reserve/reconcile machinery retire — **that deletes live real data, and the owner's ruling is recorded as that sentence** · the brake census is design's first deliverable (one page, one owner signature) · **the chat token cap ships as a HOTFIX ahead of F-A9** · the `refused_budget` rename is mandatory | design | — |
| Wave F · Track B | tax per the contract (F-T1..F-T4). **task #17 UNBLOCKED** — R1 ruled (ADR-0072 ④), Fix A proceeds: both writer bodies in ONE migration, 13-cell battery, D1 on the 0085 template. **F-T1 now also OWNS the SST rate table** (ADR-0074/TA-P2 — F-A8 depends on it) | design | — |
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
4. **THE TRACK-A DESIGN FAN-OUT — the sitting's direct successor.** F-A3…F-A9 are RULED
   (ADR-0074) and each now needs its design doc against the amended contract; the member tables
   in `docs/plan/active/track-a-sitting-1.md` (`-2`, `-3`) are the per-item consequence map, and
   R-B lists the 71 design-layer questions by project. Two items ship AHEAD of their parent
   (TA-P12's chat token-cap hotfix before F-A9; the first real seal + byte-reproduction drill
   before N3 in F-A5), and **three lines share ONE D1 window on `finalize_close`** (task #17
   Fix A · TA-P4's receipt columns · TA-P6's `segregation_mode`).
5. **THE OWNER'S DIGEST SIGN-OFF is the next constitutional gate.** Laws 78-81 and the four
   annotated laws (2, 21, 71, 76) are ruled-but-unratified until it happens; **F-A7a's
   judgement half may not build before it.** The **`AGENTS.md` home question** for invariant (a)
   rides the same signature. ~~R1~~, ~~the corpus decisions~~, ~~the CI overhaul~~, ~~F-A2's
   OQ-2/3/5~~ and ~~R-OWNER~~ are all RULED. Still open: **FX-lite build timing** · **the
   corpus's oracle-tier gaps** (BEE's GL + TB for both FYs and the full FY2025 document · RPR's
   Feb/Mar-2025 statements or a written statement that none exist · a named producer/certifier
   for RS and RPR · which RPR statement series is authoritative) · **OD-3's bar figures for
   every slot but BEE** · **the C6 checklist, CRITICAL PATH ahead of F-A7's narrow purpose**.

## Backlog

Registered but not scheduled. Sources of record in brackets.

**Named build debts (deadline-triggered):**
- **The `closing_transfer`/SST-turnover latent (0056) — R1 RULED 2026-08-20, task #17 IS
  UNBLOCKED, and it builds in Track B's fix queue.** The defect: `finalize_close`'s closing
  entry is born `is_year_end` with `closing_transfer=false`, and approved-row immutability
  means it can never be marked afterwards, so `0016`'s SST turnover exclusion is DEAD for
  close-model clients. Direction, corrected during analysis: income closing lines are DEBITS
  and `0016:582-588` sums credit−debit, so the defect **DEFLATES** rolling-12 turnover — the
  real harm is PERMANENT SUPPRESSION of the 80% early-warning ladder (`0016:679`), never a
  false alarm. Blast radius stays advisory-only: a missing warning, never a wrong book.
  **The ruling (ADR-0072 ④): a closing transfer is not turnover** — the P&L→RE roll is period
  machinery, which `0016`'s authors assumed at `0016:210-219` and what the exclusion was
  written to do. **Fix A proceeds:** mark closing entries AND the B3 reopen mirrors
  (`0085:379-386`) at birth, **BOTH writer bodies in ONE migration** — a single-body fix
  INVERTS the defect into compounding inflation, the review's highest-value assertion.
  **Fix B is STRUCTURALLY BLOCKED** by the evaluator freeze and would leave a lie in the data.
  Shape: two `create or replace`, no signature change, D1 on the `0085` template, a 13-cell
  battery (T6 catches Fix B's regression class; T2/T4/T8/T9 contract-blind), a forward-only
  proof asserted fail-closed at apply. R1a (mirror inherits the marker) and R1b (a
  `clara_authenticated`-only DEFINER stamp does not breach the human-lane-marker pin) ride as
  sub-confirmations. **OD-7 is discharged by the same ruling.** *(task #17)*
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
- **OFX/QFX — the parser is BUILT and UNEXERCISED, not unbuilt.** Intake canonicalizes four
  spellings to one mime (`intake.mjs:44-48`), `scan.mjs` detects both dialects, intake is
  deliberately **STORE-ONLY** (`intake-lanes.mjs:54`), and `parseStatementOfx`
  (`statement-parse.mjs:331`) maps identity, currency, period, `LEDGERBAL` and every `STMTTRN`
  behind the same interface as CSV — with a named limitation (OFX prints no opening and no
  totals, so it corroborates only where continuity supplies the opening). **Missing: a runtime
  battery over the parser body, and a real client file. Trigger: the first client whose bank
  exports OFX.** *(Wave C-b §4.3)*
- **XLSX/DOCX — parsed VALUES-ONLY; the gap is SEMANTICS, not a parser.** They route to
  `structured_parse` (`intake-lanes.mjs:55`) and `structured-worker.mjs` reads them, but every
  region carries **`monetary_cents: null`** and a structural `field_path` (`sheets.0.B7`), never
  an accounting one: **no facts**, content reachable only by AI-assisted read — **which is
  exactly what F-A6's decided read surface opens (TA-P9).** **Trigger:** a client whose
  recurring sources are spreadsheets. **The design decision is not the parser:** unattended
  posting from a spreadsheet needs its **own corroboration anchor** — *which cell is the total
  is a judgement, not a structure.*

**The VACUOUS-GREEN-GATE class (2026-08-16) — ALL THREE INSTANCES NOW HAVE HOMES (TA-P14,
2026-08-22).** The class RULE was already DISCHARGED (Wave-G corpus §7.4 adopts it verbatim).
The repair assignment, ruled by measurement origin: **(a)** the uncoded-voucher gate, blind with
21/21 filings NULL `financial_date` (`0056:1397`'s BETWEEN never satisfied by NULL;
`:1404-1405` makes the miss permanent) → **F-A4** · **(b)** drawer 2's bank gate, blind with 0
registered accounts against RM 39,252.03 of real balance (`0056:1360-1361` enumerates only
`bank_statements`) → **F-A3** · **(c)** drawer 1 returning `tie` on an EMPTY `bank_accounts`
registry (`0056:962`) → the corpus's P-3, **F-T4**. Repairing (a) and (b) will flip some
currently-green clients red — accepted at the sitting.

> **Dispositions applied 2026-08-20** (a full audit of all 88 rows against ADR-0071, the F-A1
> delivery and ADR-0072): 7 STALE · 8 DISCHARGED · 8 ABSORBED. Each is marked in place below;
> **the argument that earned each disposition is archived** in
> `docs/plan/completed/progress-archive-2026-08.md`, so this file stays a state file. A
> disposition is not a deletion — any row can be re-opened by naming it.

**Beta-boundary instruments (ADR-0069):** a quality-score document, A–D per domain/layer · the
doc-gardening recurring agent · a tool/interface-design pass over the custom MCP surfaces.
~~The monthly harness ablation~~ **STALE** (G7 declined its benchmark); ~~the system-prompt
investment pass~~ **RE-HOMED to F-A2**.

**The F6–F9 register (ADR-0066), trued 2026-08-20:** **C1 `failed_retry` unwitnessed live** —
drill unrun, but **the door is reachable on live data for the first time** (`v_lane` is now
`llm_witness` and the corpus run left real terminally-failed witness tasks) · **the `internal`
lane has no self-service door**, live-relevant for the same reason · admission-time envelope
label · mint-time-only ocr reclaim bound (both survive on the surviving OCR lane) · ~~the
401/403 split~~ **RE-HOMED to F-T4** · **F8's single-use door + two 0034 inherits + the
landscape-refresh autonomy class — re-examine at F-A2**, which replaces F8's host lane · F9
no-unpark path + parked-residual acceptance. ~~X7's five residuals~~, ~~`in_vendor_block`/
`is_vendor_name` unproven live~~ and ~~the parked 6/6/6/85 floor~~ — **all three STALE**, the
first two closing as *retired unproven*.

**Gates on the operating runway:** **Gate P** (first native-MYR SST-stated supplier bill, or the
Wave-G reset; reminders RETIRED per ADR-0068). Restated so it is not re-derived: ADR-0066
**measured the waiting population at seven documents**, all newest-`ocr`-task failed/`bad_type`
with NULL `document_kind` — **F6 does NOT unblock them**; the only honest remedies are an owner
re-export or the 401/403 split above. The capitalised/mixed-purchase tax-allocation question and
the Gate D residuals ride it · **Gate S**'s real-XML leg, UNSCHEDULED, waiting on the world ·
**FINCARE RSINV-2510/02** needs a human coding decision, **but its recorded blocker is stale**
(ADR-0066 pinned it on Azure typing no `CustomerName` region; the witness pair needs none) —
re-ask after the F-A2 re-extraction.

**η residuals (Wave-E close, PRs #240/#242) — all four STAND, none scheduled; the full text
moved 2026-08-22 to `docs/plan/completed/progress-archive-2026-08-part2.md`:** the estate-wide
whitespace-blind blank-op-key idiom (one uniform pass, never per-lane) · the co-effective policy
seed-test's fixture design (append-only `clara.edge_policy_sets`) · the δ-family window-blind
wall-side policy resolution (**a false refusal, never a false preview**; retires when wall and
writer resolve by window together) · `0084`'s out-of-tree tooling at `C:\ct\` (see Tooling).

**CI economics overhaul — BUILT 2026-08-21, ADR-0073** (levers 1+2+3+5; the ADR is the record).
Closed-wave drills + the D-b frontier matrix run on the weekly sweep + `workflow_dispatch`
only; per-PR runs lint · build · db-estate · db-live-gates · render-drill · partition gate in
parallel (~42 → ~20-25 min expected); the required check `ci` is a fail-closed meta-gate (also
closes two pre-existing fail-open shapes: lint was never required, and a failed classifier's
skip satisfied protection). **Surviving residuals:** lever (4) HYBRID runners **DECLINED** ($0
preference) · **the operating practice: after any PR touching a closed drill or the pipeline,
run `gh workflow run ci.yml` by hand** (recorded in `docs/ops/ci-runner.md`) · item (6)
branch-protection interplay stays as recorded (#277): a stale PR needs `gh pr update-branch` +
re-green — **never `--admin`**. Batch-CI-per-wave stays REJECTED (scope routing, not frequency
reduction).

**Wave-F planning inputs — DISPOSED by ADR-0071/contract:** #25 SUPERSEDED · E-R13 ABSORBED
(F-A3) · FX-lite principle pre-seeded (P-FX; timing stays a sitting item) · claims (E-R10) →
F-T4 · **staff allowances / self-billed detection / WHT are UNSCHEDULED** — F-T1..F-T4 name
none of the three, and "Track-B candidate" is not a schedule. **Wave-G:** the OS surface + the
UX-debt backlog (E-R10) + design trio population + **the factory reset + full E2E rebuild from
raw documents** (ADR-0072 ⑤ now rules its shape; beta's "real data untouchable" resumption
rides the same gate). **Roadmaps, risks, Phase-5:** `docs/plan/active/roadmap.md`.

**Wave-D/C carried deferrals:** ~~FA carry-down's first real firing~~ and ~~one real
reducing-balance asset~~ — **ABSORBED into the Wave-G corpus** (§6 puts both on the bank-volume
slot's opening register) · first live real recurring template (event-triggered; the corpus slot
matrix names no recurring-template slot) · C-a residuals (§5.3 pool segregation · the Section-I
wedge remedy · the real-PG dead-letter battery, declined) · C-c F-3 documented-as-is.

**Slice-era standing residuals** (carried from the retired PART 2 register; none has a PR).
*(The `0017` kind-blind-supersede row is GONE 2026-08-20 — DISCHARGED whole; record in the archive.)*
- **Always-run role/membership reconciliation** — deferred: poisoning needs SUPERUSER, outside the threat model. *(Slice-2 HIGH 6/7)*
- **Supabase non-superuser deploy-role CI** — PARTIALLY discharged by #234's non-superuser
  owner-login rehearsal plus two live ceremonies exercising the guarded SUSET branch.
  REMAINING: the standing CI leg under that role — **DESIGNATED to the weekly sweep by
  ADR-0073, its own PR** (candidate design on file in the ADR: harden the
  deploy-onto-existing leg's role posture on the sweep first; promote to per-PR only if
  measured cheap). *(Slice-2 HIGH 8/9)*
- **Opaque/HMAC pack tokens** — declined; recorded, not pending work. *(Slice-3 C12)*
- **`activate_taxonomy_version(v)` + the predicate-dimension taxonomy schema** — event-triggered: ships when a second taxonomy version first exists. *(Slice-3 C8/C16)*
- **Slice-4 residuals** *(ADR-017)* — audited owner compliance export + a visibility-aware
  trace-debug surface · per-firm chat-visibility toggle + un-share · S4-V2
  engine-hook-lifetime ≥14d (the canary watch — a *watch* precisely because `daba7f2e` is
  hard-blocked from ever being answered) · job-level engine liveness. ~~Per-part-type field
  schemas → the fail-closed card catalog~~ **ABSORBED → Wave G** · ~~firm-local-time
  budgets~~ **STALE** (G8 narrowed §8 to metering-only) · ~~billing-grade metering~~
  **ABSORBED → F-A9**.
- **Slice-6 / Wave-A residuals — ALL THREE ABSORBED** *(ADR-019/023)*: task-per-ingest coding
  → **F-A2** (which inverts its premise exactly) · the proactive notification-inbox surface →
  **Wave G** · agent-visible attribution candidates → **F-A7a**.

**Interview v3 residuals — ALL THREE RE-HOMED TO F-A7b, and TA-P14 makes that binding** (the
contract now names them): `readClearsError` never checks `runId` · **the concurrent-submitter
receipt gap** — a RUNTIME CONTRACT change, the fix being a server-authored per-(run, park,
submission) receipt · **the interview e2e de-pin**, whose own text calls it a dated tripwire
"stale at the next core bump" — **F-A7b IS that bump**.

**Owner/legal:** **the C6 checklist (DPA · disclosure · PDPA basis) is now CRITICAL PATH** —
ADR-0074/TA-P3 puts it ahead of F-A7's firm-level narrow purpose, on top of its standing role
before any vendor trace export (tracing stays OFF until all three are evidenced) · **the OpenAI
processor bundle — NON-BLOCKING by the 2026-08-18 direct-release ruling; the DPA-first
recommendation on file as dissent (F-A1 design §5)**, live-relevant because the witness pair
ships real client documents daily · the first monthly LIGHT DR sitting (WB-R26) · PITR
(deferred) · **WB-R22's target capability**, still the only route by which B3's
`distinct_checker` arm gets exercised on real books · PRD §9 · the old SGD-document clarify.

**Tooling follow-ups. RE-HOMED to the F-A2 / F-T4 fix queues by the 2026-08-20 audit — four
items:** **(1) the ceremony DSN bridge belongs IN-REPO** (commit the pooler CA + a dsn-pipe
successor; the 2026-08-19 ceremony ran `sslmode=no-verify` because the prior sessions'
pinned-CA tooling was session-local and gone — the handoffs-rule failure shape **twice now**,
and the highest-value item here: every remaining Wave-F/G ceremony walks it) · **(2) the wiki
CoR-comment gate** · **(3) `0057` §11's writer-roster successor** · **(4) `0007`'s firm-limits
pseudo-upsert**. **Still unscheduled:** the dr-verify trio (UTC hashing · the STRICT canary
probe's stale expectation · the AP-gate ILIKE example) · the runtime boot line should name its
bundle version (the positive-read law's second leg, hand-assembled at four ceremonies now) ·
Supavisor headroom re-measure (**one item registered twice** — the δ residual above) · the
local disposable Supabase stack · the ComplianceWatchCard `acknowledged_at` echo · the
unreverted-admin-grant lint watch · **`0084`'s derivation tooling retained only at `C:\ct\`** —
the machine-local-custody shape that bit the DSN bridge twice; worth pricing for in-repo custody.

## Known issues

- **R-OWNER — B15's SECOND DOOR: RULED 2026-08-22, option C, INTO PR-1** (raised by the F-1
  verifier after the sitting closed; now a **PR-1 build obligation, not a gap**). A supplier
  bill **STATING a registration** that is **untestable** because the client file holds neither
  TIN nor SSM resolved to `none` (`0049:986-988`) — and `0049:975-979` records that real
  Malaysian clients typically hold an SSM and no TIN — so the generic arm PASSED and **GB-1's
  phantom-payment shape landed through D18's door.** **The root fix rides PR-1:**
  `_document_direction`'s testability is recut so **ONE held hard id suffices** (compare the
  stated registration against every id the client holds; a stated id of a kind the client has
  not recorded → a NEW evidence class **`untestable`**), joining **PR-1's D1 list with a
  `prosrc`-SHA pin**. **Orchestrator rider, ledgered (walls validate, fail-closed): B15 ALSO
  refuses `generic_registration_untestable` when a registration is STATED but untestable** —
  **D18 now stands for direction-SILENT documents only.** Record: ADR-0074 R-OWNER +
  `docs/plan/active/f-a2-annexes-4-build.md` J.4 (which names PR-1's four build consequences).
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
  **all four RESOLVED and ARCHIVED 2026-08-22** (records in
  `docs/plan/completed/progress-archive-2026-08-part2.md`; re-measure 12/20 stands in posture).

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
- **Rig recipe pin (2026-08-20):** drive the db suite with libpq `PG*` vars +
  `CLARA_ALLOW_DESTRUCTIVE=1`, NEVER `DATABASE_URL` (a21-prestate ×6 + pipeline ×1 red
  otherwise — the CI shape is ci.yml's own env). Same session: WSL **split-brain** mode
  (`wsl -l -v` says Stopped while vmmem lives; every `wsl` command boots a second userland; two
  runner copies fight one registration → Conflict crashloop) — cure is a full `wsl --shutdown`
  when runners are IDLE, then one keeper.
- **Three genuinely dangling doc paths** — `RENUMBER.md`, `algebra.md`, `INTERFACE-PINS.md`:
  authored in build worktrees, never committed. Inert (digest law 41 + ADR-058 carry the
  renumber procedure); re-author only on a real need.
- **Two γ post-CLEAN NITs** (PR #231, residuals 4–5): skeleton self-citation drift · S11.4c's
  `''`-vs-NULL branch. One-word fixes awaiting the next `0057`-area batch.
- **BEE's opening TB — RESOLVED 2026-08-20** for ADR-043 by a live read (record archived; BEE's
  Wave-G run is brown-field from the existing keyed seed, and corpus open question 1 is
  answered). **One stored-number oddity stays UNADJUDICATED:** the four `opening_items` sum to
  +7,850,406 cents with no `obe_plug` item while the journal balances through `190-OBE` — the
  reader did not know that table's sign convention and did not guess.
- **WSL VM/NAT operating law** (2026-08-14/15 incident; narrative archived): a detached keeper
  for any port-dependent WSL work (`Start-Process -WindowStyle Hidden wsl.exe -ArgumentList
  "-e","sleep","43200"` — NAT dies ~10 min after the last client detaches even with the VM
  held); NEVER `wsl --shutdown` with runners busy (restart services via `wsl -u root systemctl
  restart`); never diagnose VM health with a probe that cycles the VM.
- **The 0007 firm-limits pseudo-upsert trigger is column-hardcoded**
  (`_tf_firm_document_limits_upsert`): a partial-column INSERT against an existing firm row
  silently RESETS the other limit columns to their defaults, and `0090`'s
  `llm_witness_concurrency` is invisible to it entirely — settable only by direct UPDATE, and
  exactly the knob the corpus incident made people want to turn. **Re-homed to the F-A2 fix
  queue**, riding the pacing work.
- **The statement-pair coin flip — HEALED FORWARD-ONLY as of 2026-08-21**, when `0102`'s router
  re-key and `statementFacts_v2` repoint made the ACTIVATION window real (full record archived).
  **The residual that never closes: the historical coin-flipped pairs are NEVER repaired** —
  `superseded_by` is once-only (CLR08), so they are counted and named, never rewritten. Design
  §3.9 note 5 carries the same statement.
- **MAX_PATH breaks git's RECOVERY verbs too** — ARCHIVED 2026-08-22 to
  `docs/plan/completed/progress-archive-2026-08-part2.md` (verbatim); the standing practice
  stands: `git rebase --quit` → MIXED `git reset <sha>` → `git symbolic-ref`, never
  abort→hard-reset, and prefer fresh short-path clones for conflict-bearing operations.
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

- **2026-08-22 (the TRACK-A SITTING)** — **fourteen principle rulings, TA-P1 … TA-P14, closing
  every Track-A authority question for F-A3…F-A9 in one sitting; ADR-0074 is the record.** Each
  option was briefed with its cost stated in advance and a fail-closed silence default; the
  orchestrator's two dissents (TA-P1's two-question rule, TA-P7's DB-judged corroboration) are
  on file, dissent-then-execute. **Four CONSTITUTIONAL AMENDMENTS fall out and are NOT yet
  ratified** — they enter the set at the owner's next digest sign-off, and no product text was
  edited: law 71's roster → an OPEN REGISTER · **invariant (a) → attribution is the agent's
  JUDGEMENT under structural walls** (PRD §6.2(a) LAW · ARCH §0.1 · digest law 2; the
  `AGENTS.md` home is FLAGGED, not drafted — its constraint 2 does not state invariant (a) at
  all) · law 21 → periodic POSTING belts only · law 76's "LLM" drift trued. **Ruled ahead of
  PR-1, deliberately:** TA-P11's one-architecture test retires the bank rules machine whole
  (superseding **WCC-R5**'s bank arm) and RECORDS 7A-R3 + E-R13 as dissolved with it —
  ADR-0072① forbids a law lapsing by inertia. Also minted: three number-origins + a governed
  policy-table door relaxing `0016` (TA-P2) · one purpose per processing class, C6 to critical
  path (TA-P3) · mechanically-bound receipts + a DEFINER read wrapper (TA-P4) · the calendar
  wake source (TA-P5) · walls re-aim at the DIRECTING human (TA-P6) · learned identifiers are
  context, never keys, plus a promotion door (TA-P8) · the DECIDED read surface closing audit
  GAP5-5 (TA-P9) · byte-burned watermarks + the covered-recipient export test (TA-P10) · the
  brake census, three gates REMOVED (TA-P12) · ONE metering ledger with `client_id` added now
  or never (TA-P13) · closed-loop DONE (TA-P14). **Delegation recorded:** on TEST DATA the
  agent may perform law-71 human acts as the owner's delegate through the real audited doors,
  ledgered — **e-filing excluded by its nature**; real client data stays the owner's. **Same
  day, after the sitting: R-OWNER RULED — B15's second door, option C into PR-1** (Known issues).

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
