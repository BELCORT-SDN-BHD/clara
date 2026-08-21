# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-21 — the F-A2 opener train is CEREMONIED; trued at every clock-out)*

- **THE F-A2 OPENER TRAIN IS LIVE — Windows A and B ran COMBINED, 2026-08-21 ~10:56-11:02 MYT**
  (as-run: `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`). **Live DB: 97 migrations,
  frontier `0102_f_a2_statement_activation`; runtime v66.** All five merged PRs applied and
  deployed: #270 `a36044bb` (③④⑤) · #271 `e330f421` (①② DB, 0099/0100) · #273 `90073b14` (⑥,
  0101) · #272 `c695a675` (①② runtime, witnessFacts.v2) · #274 `7f5617e0` (activation, 0102).
  **The windows were combined deliberately** — a fully-merged train makes a split create a stall
  gap rather than separate risk; both flips independently reviewed, machine STOPPED across
  both. Evaluator flip 4/4→5/5 + NOTIFY; probe 20/21, the one red owned as a
  **probe defect**; the **`0102` coverage probe said NO as designed**, naming the synthetic
  sandbox firm `39008536` — **ACCEPTED** (no real counterparty, and ADR-0072 ⑤ already rules it
  out of existence at the reset). v66 verified by in-VM bundle greps, `/ready` 200, zombie sweep
  0, sleeper destroyed. **Both manifests fully deploy-locked** — 1 evaluator + 24 workflow
  bodies, zero hash changes.

- **THE RE-MEASURE: 12 / 20 corroborated — against 0 / 20 for the same twenty under v1**
  (12 arm · 0 plain · 8 refusing, each with its failing conjunct named). **The denominator rule
  travels with that number: 20 is a deliberately refusal-heavy SAMPLE of the 33, so 12/20 is NOT
  comparable to 0/33** — 0/20 → 12/20 is the like-for-like comparison and the real result.
  Prediction hit 14/20. **Opener ② delivered and was the bundle's hard floor** (`type_code` =
  `'01'` ×19 and `'03'` on a genuine debit note — correct, not merely permissive); **lock 3
  fired on the corpus's only true SST registrant**, so the false presumption did not fire;
  **infra vindicated** — 19 documents at once, 40 calls, zero failures/timeouts/stragglers on
  the lane that produced 7 casualties and four 30-95-minute hangs two days earlier. **The honest
  caveat: this measures the *witness verdict*, not a posted entry. Every corroborating invoice
  holds an unattended-eligible ticket nothing yet redeems** — F-A2 proper is unbuilt, so they
  still route to the human-confirm draft lane.

- **F-A2 IS DESIGNED, ITS AUTHORITY QUESTIONS ARE RULED, AND THE WAVE-G CORPUS SITTING IS
  CLOSED — ADR-0072.** Five ruling blocks in one in-session sitting: opener ⑥ ratified plus the
  **"delete the old era" directive** (the execution tier retires *inside* Wave F; **the
  post-Window-A re-extraction is TWENTY documents, superseding the full-64 backfill** — so the
  legacy fallback arms' trigger falls through its own "whichever lands first" clause to the
  Wave-G reset, where F-A10 closes; legacy DATA rows die at that reset; the spike schemas DROP
  there after a cold archive, so **constraint 15's spike clause retires THEN, not now**) ·
  high-stakes **RE-CONFIRMED at any amount with no thresholds** (the build's fail-closed ceiling
  on file as dissent; the HUMAN lane and ADR-0044 untouched) · **OQ-4's three exits** and
  **OQ-6's no-category-gate on the agent lane**, the human lane's gate on the same categories
  **STANDING** · **R1 RULED** — a closing transfer is not turnover, Fix A to Track B, task #17
  unblocked · and the **corpus reshaped into TWO TIERS** (oracle + open-intake reality), because
  two of the three designated clients are terminal-period books for companies in strike-off.
  **Design set of record: `docs/plan/active/f-a2-agentic-posting-design.md` + three annexes.**

- **THE WITNESS-PAIR CUTOVER (F-A1) IS LIVE — ceremonied 2026-08-20.** Every invoice-kind
  document mints `llm_witness`; the Azure invoice engine survives only as the tombstone insert;
  `witness_extraction` consents granted+activated for RS/BEE/RPR. **The F-A1 corpus measurement**
  (`docs/plan/completed/f-a1-corpus-measurement.md`) is the 0/33 baseline the re-measure reads
  against, and its live incident minted riders ③④⑤ — **all three now live-proven** (Known issues).

- **The standing law is ADR-0071 + ADR-0072.** The Agentic Charter's twelve rulings are digest
  **laws 71-76** and its Wave-F re-scope is `docs/plan/active/wave-f-contract.md`; ADR-0072
  re-trues its scoping without changing a law. **Deep-scan findings N1-N6** keep their
  dispositions (N1→F-A2 · N2/N3→F-A5 · N4→F-A4 · N5→F-T4 · N6 doc-truth staleness incl. stale
  `0056:57`/autodraft-header/runtime-README lines — Wave-F fix-queue riders). *(The Charter's
  own posture bullet is archived — its content is the digest's now.)*

- **The render deployment is LIVE and WIRED (ζ's fly ceremony, 2026-08-15):** app
  `clara-render`, one hourly machine, image pinned tag-AND-digest, the `reports/` storage
  policy pair ADDED (no UPDATE policy — x-upsert:false immutability stands), first live run a
  clean drain, and the leader's dispatch half BOUND via **`fly secrets deploy`** (a plain
  restart does NOT bind staged secrets — ζ caught the first "bound" claim resting on an
  app-level `secrets list` read), verified by an in-VM PROCESS read with both controls.
  **The end-to-end re-render DR drill is deliberately still UNRUN** — no sealed artifact exists
  yet, and `docs/ops/DR-render.md` keeps that boundary explicit.
- **Hard constraint 12 is STRUCTURAL:** `0062` walls RS-customer enrichment in the DB
  (fact-driven, uuid-pinned, self-proven at apply); `0063` makes lifting it an OWNER act.
- **Harness hardening live in-repo:** the dispatch-model-guard PreToolUse hook (constraint 5
  mechanically enforced, 44-case selftest in CI) beside pinned-ids; `.claude/rules/db-tests.md`
  + `handoffs.md`; the ci.yml Wave-E δ contract drill (closes the sweep-skip false-green shape).
- **Runtime:** Fly `clara-runtime`, single machine, `/ready` 200 — **v66 (2026-08-21)**, carrying
  autoDraft_v8 + chatTurn_v12 + **witnessFacts.v2** + **statementFacts_v2** + riders ③④, all four
  verified by in-VM bundle grep. The three `CLARA_RENDER_FLY_*` values are bound. Dashboard:
  Pages `app.clarabook.com`. `clara-backup` daily. `clara-render` hourly.
- **Books pins:** RS trial balance **3,396,500 = 3,396,500** (`trial_balance_as_of`, re-read at
  every ceremony) · RS customers **11/11 NAME-ONLY** (the enrichment trap holds; the one
  registered counterparty is a vendor, out of scope) · `client_facts` = 7 rows (3 carryover +
  3 MSIC + 1 doored entity_type).
- **The close model is LIVE-INERT:** zero `fiscal_years` rows; activation is the first human
  `open_fiscal_year`. The snapshot registry is likewise inert (zero `reporting_periods` /
  `period_snapshots`) until the first `mint_month_snapshot`.
- **CI:** the self-hosted `clara-wsl` + `clara-wsl-2` runner instances (private-repo-only law).
  Gates: the 7-script lint family + typecheck/build + the full DB suite on a throwaway
  `postgres:17` + deploy-onto-existing.
- **Hard-blocked ids** (canary `daba7f2e` · witness `d023b48c`) are hook-enforced —
  `scripts/hooks/pinned-ids-guard.mjs` via the tracked `.claude/settings.json`.

## Lanes

| Lane | Scope | State | PR |
|---|---|---|---|
| Wave F · Track A | **F-A1 IS DELIVERED (2026-08-20)** — PR-1 #263 (0089-0095) · PR-2 #265 (witnessFacts.v1, v64) · PR-3a #266 (autoDraft_v8 + chatTurn_v12) · **PR-3 #267 (0096 + 0097 CUTOVER, ceremonied 2026-08-20)** · **PR-4 #268 (0098, shipped UNPOINTED — activated at the 2026-08-21 window)**. Consents granted+activated RS/BEE/RPR. **Corpus MEASURED**: witness 0/33 vs legacy 28/92 on two named conjuncts (NIL-TAX; the type_code prompt-intent mismatch) — **both fixed by the openers and re-measured 2026-08-21**. D12 identity gate PASSES. | ceremonied | #263 #265 #266 #267 #268 |
| Wave F · Track A — **the F-A2 openers ①-⑥ + the statement activation** | **CEREMONIED 2026-08-21** (combined Windows A+B; as-run `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`). ③④⑤ #270 `a36044bb` · ①② DB #271 `e330f421` (0099/0100) · ⑥ #273 `90073b14` (0101) · ①② runtime #272 `c695a675` (witnessFacts.v2) · activation #274 `7f5617e0` (0102). **Live 97/`0102`, runtime v66**; both freeze manifests deploy-locked. **Re-measure 12/20 vs 0/20 like-for-like** (denominator rule binds). | **ceremonied** | #270 #271 #272 #273 #274 |
| Wave F · Track A — **F-A2 proper** | **DESIGNED (v4), RULED, NOT YET BUILT.** Design of record `docs/plan/active/f-a2-agentic-posting-design.md` + `f-a2-annexes-{1-estate,2-mechanics,3-record}.md`, driven v1→v4 through an adversarial round, a delta round and a final verify (the delta round REVERSED v2's durable-CHECK weakening on its own reader census; the verify caught a four-apostrophe SQL default that made the which-model-posted wall always pass). **Authority RULED — ADR-0072:** any amount/no thresholds · OQ-4 three exits · OQ-6 no category gate on the agent lane, human lane's gate STANDS. The unattended posting lane (PR-0..PR-4 + PR-1b, two further D1 windows) has **NOT started** — every corroborating invoice holds an unattended-eligible ticket nothing yet redeems. **OQ-2/3/5 stay open with recommendations.** | design | — |
| Wave F · Track B | tax per the contract (F-T1..F-T4). **task #17 UNBLOCKED** — R1 ruled (ADR-0072 ④), Fix A proceeds: both writer bodies in ONE migration, 13-cell battery, D1 on the 0085 template | design | — |

*(The sixteen terminal Wave-E rows moved verbatim to the archive, 2026-08-18.)*

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. ~~The two opener ceremonies~~ — **DONE 2026-08-21, run COMBINED**
   (`docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`).
   **What they leave for the next round**, all prompt-side and none of it frozen-evaluator work:
   the **MYR currency-code prompt fix**, the **dash-is-not-a-value clarification**, the
   **vision-side SST-id shape check**, and **`coverage.pages`** (see Known issues). **Still owed
   from before the window:** two ordinary re-fires for the stranded pair.
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
4. **The remaining owner-sitting items.** ~~R1~~ and ~~the Wave-G corpus decisions~~ are
   **RULED — ADR-0072** (④ and ⑤). Still open: **the CI economics overhaul** · **FX-lite build
   timing** (ADR-0071/P-FX; law 18 MYR-only stands) · **F-A2's OQ-2 / OQ-3 / OQ-5** (design §4,
   each with a recommendation) · **the corpus's oracle-tier gaps** (BEE's GL + TB for both FYs
   and the full FY2025 document · RPR's Feb/Mar-2025 statements or a written statement that none
   exist · a named producer/certifier for RS and RPR · which RPR statement series is
   authoritative) · **OD-3's acceptance-bar figures for every slot but BEE**.

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
- **`closing_stock` producer verb** — before any real goods-trader close. **Wave G does NOT
  schedule it:** ADR-0072 ⑤ defaulted OD-2 to "not in the first pass". *(PR #228 residual 5)*
- **`opening_tb.line` producer + the K-doc door** — Phase-5, review-gated. The Wave-G corpus
  does not need it: its run script seeds brown-field openings by key, not by document. *(ADR-043)*
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

**Structured-format lanes (event-triggered; registered 2026-08-20 so they live here, not only in
code comments). Both were verified at the bytes, and both differ from how the lane gets casually
described — each disposition is what the read SAW:**
- **OFX/QFX — the parser is BUILT and UNEXERCISED, not unbuilt.** Intake canonicalizes four
  declared spellings to one mime (`intake.mjs:44-48`), `scan.mjs` detects both dialects by
  signature, and intake is deliberately **STORE-ONLY** (`intake-lanes.mjs:54`). The reader is
  real — `parseStatementOfx` (`statement-parse.mjs:331`) maps identity, currency, period,
  `LEDGERBAL` and every `STMTTRN`, behind the same `parseStatementFile` interface as CSV, with
  a named limitation (OFX prints no opening and no totals, so it corroborates only where
  continuity supplies the opening — deriving it would make the chain check tautological).
  **Missing: a runtime battery over the parser body (DB routing is tested, the body is not),
  and a real client file. Trigger: the first client whose bank exports OFX.** *(Wave C-b §4.3)*
- **XLSX/DOCX — parsed VALUES-ONLY; the gap is SEMANTICS, not a parser.** They route to
  `structured_parse` (`intake-lanes.mjs:55`) and `structured-worker.mjs` does read them, but
  every region carries **`monetary_cents: null`** and a structural `field_path` (`sheets.0.B7`),
  never an accounting one: **no facts**, content reachable only by AI-assisted read (widens at
  **F-A6**). **Trigger:** a client whose recurring source documents are spreadsheets (payroll
  listings) where per-cell extraction would beat an AI read. **The design decision rides the
  trigger and is not the parser:** unattended posting from an arbitrary spreadsheet needs **its
  own corroboration anchor** — *which cell is the total is a judgement, not a structure.*

**The VACUOUS-GREEN-GATE class (2026-08-16):** a gate that passes because it had NOTHING IN
SCOPE is not evidence, and must be distinguished from one that measured a population and found
it clean. **The class RULE is DISCHARGED** — the Wave-G corpus §7.4 adopts it verbatim (every
gate exercised in both polarities; an unexercised gate is reported BY NAME, never counted as
passed). **The three instances STAND, and nothing schedules their repair** — they are code, so
the Wave-G data reset does not touch them: (a) the uncoded gate blind with 21/21 filings NULL
`financial_date` (`0056:1397`'s BETWEEN is never satisfied by NULL; `:1404-1405` makes the miss
permanent) · (b) drawer 2's bank gate blind with 0 registered accounts against RM 39,252.03 of
real balance (`0056:1360-1361` enumerates only `bank_statements`) · (c) drawer 1 returns `tie`
on an EMPTY `bank_accounts` registry (`0056:962`) — one level below the very comment
(`:969-972`) citing the ADR-066 lesson. **(c) has a home** — the corpus's P-3, picked up by
F-T4; **(a) and (b) do not.** The corpus exercises all three either way.

> **Dispositions applied 2026-08-20** (a full audit of all 88 rows against ADR-0071, the F-A1
> delivery and ADR-0072): 7 STALE · 8 DISCHARGED · 8 ABSORBED. Each is marked in place below;
> **the argument that earned each disposition is archived** in
> `docs/plan/completed/progress-archive-2026-08.md`, so this file stays a state file. A
> disposition is not a deletion — any row can be re-opened by naming it.

**Beta-boundary instruments (ADR-0069):** a quality-score document, A–D per domain/layer · the
doc-gardening recurring agent · a tool/interface-design pass over the custom MCP surfaces.
~~The monthly harness-simplification ablation~~ — **STALE** (G7 declined the benchmark it was
blocked on). ~~The system-prompt investment pass~~ — **RE-HOMED to F-A2** (law 71 makes it
load-bearing, and G7 removed the instrument that would have caught its absence).

**The F6–F9 register (ADR-0066), trued 2026-08-20:** **C1 `failed_retry` unwitnessed live** —
drill still unrun, but **the door is reachable on live data for the first time** (the cutover
changed its population: `v_lane` is now `llm_witness`, and the corpus run left real
terminally-failed witness tasks) · **the `internal` lane has no self-service door** —
live-relevant for the same reason · admission-time envelope label · mint-time-only ocr reclaim
bound (both survive on the surviving OCR lane) · ~~the 401/403 split "(Wave F)"~~ — **its home
never existed; RE-HOMED to F-T4** · **F8's single-use door + two 0034 inherits + the
landscape-refresh autonomy class** — **re-examine at F-A2**, which replaces F8's host lane ·
F9 no-unpark path + parked-residual acceptance. ~~X7's five residuals~~,
~~`in_vendor_block`/`is_vendor_name` unproven live~~ and ~~the parked 6/6/6/85 floor + its
headroom PDF~~ — **all three STALE**; the first two close as *retired unproven*, the lane that
would ask them being gone.

**Gates on the operating runway:** **Gate P** (first native-MYR SST-stated supplier bill, or
the Wave-G reset; reminders RETIRED per ADR-0068). Restated so it is not re-derived: ADR-0066
**measured the waiting population at seven documents**, all newest-`ocr`-task failed/`bad_type`
with NULL `document_kind` — **F6 does NOT unblock them**; the only two honest remedies are an
owner re-export or the 401/403 split above. The capitalised/mixed-purchase tax-allocation
question and the Gate D residuals ride it · **Gate S**'s real-XML leg — honestly UNSCHEDULED,
waiting on the world · **FINCARE RSINV-2510/02** still needs a human coding decision, **but its
recorded blocker is stale**: ADR-0066 pinned the cause on Azure typing no `CustomerName`
region, and the witness pair does not depend on one — re-ask after the F-A2 re-extraction.

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

**CI economics overhaul (assessment 2026-08-15).** *An OWNER-SITTING item, not scheduled build
work: it says "REGISTERED for Wave F" but the contract puts it under "Deferred / not reached",
so no Wave-F item owns it.* The CONTENT is right and the docs-only fence works. **The COST
problem is structural:** the monolithic `ci` job re-proves EVERY closed wave's drill serially
(~45-60 min, growing one full-chain apply per wave). Fix, in order of leverage: **(1)** demote
CLOSED-wave drills to the weekly sweep, keep only the CURRENT wave's per-PR (biggest cut) ·
**(2)** split the monolith into parallel jobs · **(3)** real pnpm-store + docker-layer caching
(also kills the setup-pnpm race) · **(4)** HYBRID runners — GitHub-hosted for the cheap legs,
self-hosted for the DB estate · **(5)** the ci.yml composite-action refactor (same work as the
500-line Known issue) · **(6)** the branch-protection interplay measured on #244: required check
`ci`, `strict: true`, `enforce_admins: true` — a docs-only PR whose `ci` leg SKIPPED merges fine
while up-to-date, but once main moves protection reports "Required status check 'ci' is
expected"; the fix is `gh pr update-branch` + re-green, **never `--admin`**. **Batch-CI-per-wave
was CONSIDERED AND REJECTED** — the per-PR gate caught T17 drift, a seam census gap, the
frontier-ordering violation and the S0.9 flake in ONE night. Scope routing, not frequency
reduction; changing per-PR uniformity is ADR-061 territory, an owner ruling.

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
  REMAINING: the standing per-PR CI job under that role — **schedule it WITH the CI-economics
  overhaul**, since it collides with the same cost problem. *(Slice-2 HIGH 8/9)*
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

**Interview v3 residuals — ALL THREE RE-HOMED TO F-A7b** (fold them into its design or they are
still UNOWNED in Wave G): `readClearsError` never checks `runId` (unreachable today, one line if
wanted) · **the concurrent-submitter receipt gap** — a RUNTIME CONTRACT change, not a dashboard
fix: "a higher park index ⇒ my answer landed" is an inference, not a receipt; the real fix is a
server-authored per-(run, park, submission) receipt · **the interview e2e de-pin** — its own
text calls it a dated tripwire "stale at the next core bump", and **F-A7b IS that bump**.

**Owner/legal:** the C6 checklist (DPA · disclosure · PDPA basis) before any vendor trace
export — **now load-bearing on the corpus**: ADR-0072 ⑤ ruled full custody permission with
tracing OFF, and the flag stays off until all three are evidenced · **the OpenAI processor
bundle — NON-BLOCKING by the 2026-08-18 direct-release ruling; the DPA-first recommendation is
on file as dissent (F-A1 design §5)**, now live-relevant because the witness pair ships real
client documents to the processor daily · the first monthly LIGHT DR sitting (WB-R26's cadence
binds) · PITR (deferred, owner-tracked) · **WB-R22's target capability** — **now the only route
by which B3's `distinct_checker` arm ever gets exercised on real books**, since ADR-0072 ⑤
ruled OD-5's second principal NOT provisioned · PRD §9 · the old SGD-document clarify.
*(~~Server-side branch protection~~ left this list 2026-08-20 — DISCHARGED on #244's measured
`strict`+`enforce_admins`; record in the archive.)*

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
local disposable Supabase stack (needs Docker) · ComplianceWatchCard `acknowledged_at` echo ·
the unreverted-admin-grant lint watch · **`0084`'s derivation tooling retained only at
`C:\ct\`** — three in-repo proofs mean nothing breaks if the folder dies, but it is the same
machine-local-custody shape that bit the DSN bridge twice; worth pricing for in-repo custody.

## Known issues

- **The wiki dynamic-SQL gate reads CoR-block comments UN-MASKED** (found 2026-08-20 on 0097):
  `parseCoRPatches` tests `CREATE_FN_RE` against a block whose `--` comments survive the
  file-level `maskComments` (dollar-quoted interiors are skipped), so a create-function phrase
  **quoted in a comment** reclassifies the block as a dynamic function-creator and reds the
  gate. Workaround: wording — never quote a recut statement in a CoR comment. Real fix = mask
  the block's own comments before the CREATE test + a selftest cell. Judgement logic, its own
  reviewed PR; **re-homed to the F-A2 fix queue.**
- ~~**F-A2 riders ③④⑤ / the 0-live gap**~~ — **RESOLVED 2026-08-21, LIVE-PROVEN.** ③ and ④ went
  live in v66 and were exercised on their first outing under the heaviest load yet (19 documents
  at once, 40 calls, zero failures) against the F-A1 run's 7 casualties and four hangs on the
  same lane; ⑤ ran at the ceremony and returned 0.
- ~~**The witness corroboration rate is 0/33**~~ — **RE-MEASURED 12/20** vs 0/20 like-for-like.
  **Fail-closed posture UNCHANGED**: corroboration is achievable but F-A2 proper is unbuilt, so
  those invoices still ride the human-confirm draft lane and nothing posts unattended.

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
- **The `failed_retry` stranded pair — CLOSED AT 2, STILL OWED, and it cannot recur.** `0097`
  left `0051`'s `failed_retry` door scoped to `v_lane` alone, so post-cutover a document whose
  newest `invoice_facts` task is `failed` with no `llm_witness` sibling makes that door's
  subquery return NULL and `NULL = 'failed'` is not true. **Measured live: the population is
  CLOSED at 3** — 2 truly stranded (`0cb7c1f1` BEE · `c597a24b` ROME SECRETARY), the third
  rescued by `receipt_backfill`. **Remedy: an ordinary re-fire** — both clients hold an ACTIVE
  `witness_extraction` activation, so the backstop mints a fresh task with no migration; only
  the HUMAN verb refuses. **Not done at the 2026-08-21 window; still owed.** No new document can
  enter this state — every post-cutover invoice has an `llm_witness` task by construction.
- **0057 §11's writer roster has no live successor** (PR-4 review): a future unrostered
  books-writer would pass silently — the roster runs only at 0057's own apply. Candidate: a
  standing census cell. **Sharper since the cutover:** `0096` rotated the writer estate and
  `0098` added `_persist_statement_core_v2`, so the guarded population grew while the roster
  stayed pinned. **Re-homed to the F-A2 fix queue.**
- **The WSL host is showing container instability** (observed 2026-08-20): containers exit
  **255**, including CI **service** containers, which makes a red leg indistinguishable from a
  real failure until someone looks. Not diagnosed. **Inspect while runners are IDLE and BEFORE
  the next ceremony night** — the worst moment to learn the host drops containers is mid-D1.
- **Rig recipe pin (2026-08-20):** drive the db suite with libpq `PG*` vars +
  `CLARA_ALLOW_DESTRUCTIVE=1`, NEVER `DATABASE_URL` (a21-prestate ×6 + pipeline ×1 red
  otherwise — the CI shape is ci.yml's own env). Same session: WSL **split-brain** mode
  (`wsl -l -v` says Stopped while vmmem lives; every `wsl` command boots a second userland; two
  runner copies fight one registration → Conflict crashloop) — cure is a full `wsl --shutdown`
  when runners are IDLE, then one keeper.
- **Three genuinely dangling doc paths** — `RENUMBER.md`, `algebra.md`, `INTERFACE-PINS.md`:
  authored in build worktrees, never committed. Inert: the renumber procedure's content
  survives as digest law 41 and ADR-058's body. Re-author only on a real need.
- **Two γ post-CLEAN NITs** (PR #231, residuals 4–5): skeleton self-citation drift · S11.4c's
  `''`-vs-NULL branch. One-word fixes awaiting the next `0057`-area batch — `0096` was a writer
  rotation, not that batch.
- **BEE's opening TB — RESOLVED 2026-08-20** for ADR-043 by a live read (record archived; BEE's
  Wave-G run is brown-field from the existing keyed seed, and corpus open question 1 is
  answered). **One stored-number oddity stays UNADJUDICATED:** the four `opening_items` sum to
  +7,850,406 cents with no `obe_plug` item while the journal balances through `190-OBE` — the
  reader did not know that table's sign convention and did not guess.
- **ci.yml exceeds the 500-line harness file limit** (pre-existing; a GitHub workflow cannot
  split across files) — the hook flags every edit. The composite-action refactor that fixes it
  is CI-economics item (5): one piece of work, registered twice.
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
- **MAX_PATH breaks git's RECOVERY verbs too (2026-08-14, fleet lesson):** the three tracked
  long-path PDFs under `packages/runtime/test-storage/` make `git rebase --abort` fail with
  the rebase state SURVIVING, and a follow-up `git reset --hard` fails the same way — the
  instinctive abort→hard-reset pair leaves the clone MORE stuck at each step. **The escape:**
  `git rebase --quit`, then a MIXED `git reset <sha>` (index-only, no long-path writes), then
  `git symbolic-ref HEAD refs/heads/<branch>` — verify the target sha is an ancestor of origin
  BEFORE resetting, so the recovery is free by construction. Prefer fresh short-path clones
  (`core.longpaths true`) for any conflict-bearing operation.
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

*(Entries through 2026-08-19 — the F-A1 build nights included — are verbatim in
`docs/plan/completed/progress-archive-2026-08.md`, alongside F-A1's operative records: its
ceremony as-runs and the corpus measurement.)*

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

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
