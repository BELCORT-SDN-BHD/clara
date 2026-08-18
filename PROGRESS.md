# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-18, the Agentic Charter — trued at every clock-out)*

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

- **Live DB: 83 migrations, frontier `0088` (the #43 wording lexicon).** The wording-seed
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
- **The render deployment is LIVE and WIRED (ζ's fly ceremony, 2026-08-15):** app
  `clara-render`, machine `2862624f777308` (hourly schedule, restart on-failure max 3), image
  `registry.fly.io/clara-render:render-1@sha256:b25b600d…50ca6a` (four independent agreeing
  reads), the `reports/` storage policy pair ADDED (docs pair untouched; no UPDATE policy —
  x-upsert:false immutability stands), first live worker run a clean drain
  (`sealed=0 refused=0 abandoned=0`, typst 0.12.0 confirmed live), and the leader's dispatch
  half BOUND on `clara-runtime` — token minted + relayed stdin-to-stdin, staged, then
  **`fly secrets deploy`** (a plain machine restart does NOT bind staged secrets — ζ caught
  the first "bound" claim resting on an app-level `secrets list` read), verified by the
  PROCESS read (`printenv CLARA_RENDER_FLY_APP` → `clara-render` from inside the running VM,
  with the pre-deploy exit-1 as the negative and `CLARA_STORAGE_ROLE` as the positive
  control) + `/ready` 200. The end-to-end re-render DR drill is deliberately still unrun (no
  sealed artifact exists yet) — `docs/ops/DR-render.md` keeps that boundary explicit (#244).
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
- **Hard constraint 12 is now STRUCTURAL:** `0062` walls RS-customer enrichment in the DB
  (fact-driven, uuid-pinned, behavioural self-proof at apply); `0063` makes lifting it an
  OWNER act. The AGENTS.md parenthetical is TRUED (this branch; the original checkout's
  foreign AGENTS.md/PROGRESS.md modifications were discarded with the owner's approval after
  their intent — naming the graph MCP — was absorbed into the truing).
- **Harness hardening live in-repo:** the dispatch-model-guard PreToolUse hook (constraint 5
  mechanically enforced, 44-case selftest in CI) beside pinned-ids; `.claude/rules/db-tests.md`
  + `handoffs.md`; the ci.yml Wave-E δ contract drill (closes the sweep-skip false-green shape).
- **Runtime:** Fly `clara-runtime`, single machine, `/ready` green — **v63 (2026-08-18)
  carries #255's belt isolation** (ζ-law: v62 negative control read 0 `isLeaderHalt`; v63
  PROCESS reads positive in BOTH in-VM homes — the lib copy and the bundled server
  output, the load-bearing one; reconciler heartbeat beating). chatTurn **v11** deployed; the three
  `CLARA_RENDER_FLY_*` dispatch values bound (2026-08-15). Dashboard: Pages `app.clarabook.com`. `clara-backup` daily. `clara-render`
  hourly (see the render bullet above).
- **Books pins:** RS trial balance **3,396,500 = 3,396,500** (`trial_balance_as_of`, re-read at
  every ceremony) · RS customers **11/11 NAME-ONLY** (the enrichment trap holds; the one
  registered counterparty is a vendor, out of scope) · `client_facts` = 7 rows (3 carryover +
  3 MSIC + 1 doored entity_type).
- **The close model is LIVE-INERT:** zero `fiscal_years` rows; activation is the first human
  `open_fiscal_year`. The snapshot registry is likewise inert (zero `reporting_periods` /
  `period_snapshots` rows) until the first `mint_month_snapshot`.
- **CI:** the self-hosted `clara-wsl` runner (private-repo-only law). Gates: the 7-script lint
  family + typecheck/build + the full DB suite on throwaway `postgres:17` + deploy-onto-existing.
- **Hard-blocked ids** (canary `daba7f2e` · witness `d023b48c`) are hook-enforced —
  `scripts/hooks/pinned-ids-guard.mjs` via the tracked `.claude/settings.json`.

## Lanes

| Lane | Scope | State | PR |
|---|---|---|---|
| Wave F · Track A | the agentic core per `docs/plan/active/wave-f-contract.md` — F-A1 design doc `docs/plan/active/f-a1-witness-pair-design.md` (v3, two-lane fresh-context adversarial review to unconditional MERGEABLE, 2026-08-18); BUILD gated on PR-0 (the Codex cross-model pass, vendor limit lifts 2026-08-20) + the OQ-1/OQ-2 sitting | design | — |
| Wave F · Track B | tax per the contract (F-T1..F-T4) | design | — |

*(The sixteen terminal Wave-E rows moved verbatim to
`docs/plan/completed/progress-archive-2026-08.md`, 2026-08-18.)*

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. ~~Deploy #255's runtime bundle~~ — **DONE 2026-08-18: `clara-runtime` v63** (from
   merged `main` 64d8f8a; verification recorded in the Runtime posture bullet). The §C
   settle-starvation latent is closed on live. *(The 2026-08-15 "fresh session first
   acts" item was DONE 2026-08-16: checkout trued; graph re-indexed, 15,805 nodes.)*
2. **Owner-key acceptance items** (the constitutional human half): ~~the #43 sitting~~ —
   **DONE 2026-08-16** (signed with three dispositions, merged #249, ceremonied; E-R14
   OPEN). **The BEE FY2025 live close — DEFERRED ON ACCOUNTING-CORRECTNESS GROUNDS
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
   readiness lane's "revenue document" label was a misread, corrected here. Then: the first
   real render/seal round-trip (closes DR-render's unrun-drill boundary) → RPR historical
   MPERS pack → RS snapshot witness; the ms/zh claim-policy copy (fail-closed until
   supplied); the optional elevated `diskpart` VHDX compact (~50GB, runners idle).
3. **Wave-F BUILD kickoff per the contract** (`docs/plan/active/wave-f-contract.md`):
   Track A starts at F-A1 (witness-pair extraction) → F-A2 (agentic posting); Track B
   (tax) runs in parallel. **The vision-alignment questions are RULED — ADR-0071 closed
   them** (the audit's three recommendations dispositioned: interview ADOPTED F-A7b ·
   freeform read ADOPTED F-A6 · eval harness DECLINED/G7; the six gaps all land in the
   contract or are dissolved). Every build item takes the uniform ADR-061 ladder.
   **F-A1's design doc is DONE (see the lane row)**; its build sequence is PR-0..PR-4 +
   PR-3a per the doc's §6, with the 0017 trigger fix a hard PR-1 precondition.
4. **The remaining owner-sitting items** (NOT reached by ADR-0071, still open): **R1**
   (`closing_transfer`/SST — Fix A recommended, task #17 builds after the ruling) + **the
   Wave-G corpus decisions OD-1..OD-11 + P-1..P-3** (`wave-g-e2e-corpus-design.md` — incl.
   OD-5's second eligible principal, and the corpus doc's step-4 "standing rules earn
   autopost" wording needing its G1-alignment amendment) + **F-A1 OQ-1/OQ-2** (the
   LLM-vendor processor status; the witness_extraction typed purpose —
   `docs/plan/active/f-a1-witness-pair-design.md` §5) + **the CI economics overhaul** +
   **FX-lite build timing** (principle pre-seeded as ADR-0071/P-FX; law 18 MYR-only
   stands) + **the BEE opening-TB record discrepancy** (Known issues — which record
   describes the live book?).

## Backlog

Registered but not scheduled. Sources of record in brackets.

**Named build debts (deadline-triggered):**
- ~~B3 implementation~~ — **RETIRED 2026-08-16**: live as `0085-0086` (ceremonied; the
  S11.2 roster join discharged in-code, verified by the four-lens review). *(ADR-0068)*
- **The `closing_transfer`/SST-turnover latent (0056)** — finalize_close's closing entry is
  born `is_year_end` with `closing_transfer=false` and approved-row immutability means it
  can never be marked afterwards, so 0016's SST turnover exclusion is DEAD for close-model
  clients: post-close, the ends_on month's income bucket carries the full-year closing
  DEBIT and rolling-12 turnover reads ~0 — an SST registration watch that should fire does
  not (advisory-only blast radius: a wrong warning, never a wrong book). Found twice
  independently (the B3 review's accounting lens; the vision audit). **ANALYZED TO A
  SITTING-READY RECOMMENDATION 2026-08-16 (task #17):** mechanism byte-confirmed
  (`0016:602`'s exclusion is dead because `0056:2242-2246` births the entry without the
  marker; wall at `0016:4943-4986` admits the marker draft-to-draft only), and the
  DIRECTION corrected — income closing lines are DEBITS, `0016:582-588` sums credit−debit,
  so the defect DEFLATES rolling-12 turnover; the real harm is PERMANENT SUPPRESSION of
  the 80% early-warning ladder (`0016:679`), never a false alarm (the vision audit's
  inflation claim is corrected in-file). **Fix A recommended** — mark closing entries AND
  the B3 reopen mirrors (`0085:379-386`) at birth, BOTH writer bodies in ONE migration (a
  single-body fix INVERTS the defect into compounding inflation — the highest-value review
  assertion). Fix B (recut the 0016 evaluator) is STRUCTURALLY BLOCKED by the evaluator
  freeze (recut trips DUPLICATE+RECUT; the compliant path would need a `_v2` fork of both
  evaluators + a runtime deploy + a permanent two-evaluator estate) and would leave a lie
  in the data. 13-cell battery spec'd (T6 catches Fix B's regression class; T2/T4/T8/T9
  contract-blind). Shape: two `create or replace`, no signature change, D1 write-quiesce on
  the 0085 template; forward-only proof asserted fail-closed at apply (zero
  close_receipt-bearing entries — could not be read from live during analysis, so it is
  ASSERTED, never assumed). **Builds after the sitting's R1 ruling** (does the P&L→RE roll
  count as a "closing transfer" for the exclusion? 0016's authors assumed yes at
  `0016:210-219`); R1a (mirror inherits the marker) and R1b (a `clara_authenticated`-only
  DEFINER stamp does not breach the human-lane-marker pin, asserted CLR03-intact at apply)
  ride as sub-confirmations. BEE FY2025 defers wholesale to Wave G, so no near-term client
  deadline — but the fix gates the corpus's CLIENT-SST-1 slot (OD-7). *(task #17; B3 PR
  body carries the original site cites)*
- **Reconciler follow-ups (from #255's law-1 review, 2026-08-16 — all pre-existing, none
  blocking):** the `expired` key collision (`reconciler.mjs:633` spreads `intakeRecovery`
  unconditionally after `expiry`, always clobbering `expireClarifies`' count — unread by
  `leader.mjs` today; renaming a receipt key is a small behaviour change, own PR) · the
  leader render-pair try/catch (`leader.mjs:200-211`) still swallows halt-class errors
  (unreachable today — neither render belt touches relay — but it is the one remaining
  halt-eating catch in the leader path) · `wiki-projection.mjs:333-346`/`:594-599` carry
  three bare `to_regprocedure` probes (different loop, per-event checkpoint failure model;
  the same absent-vs-unreadable question applies).
- **`closing_stock` producer verb** — before any real goods-trader close. *(PR #228 residual 5)*
- **`opening_tb.line` producer + the K-doc door** — Phase-5, review-gated. *(ADR-043)*
- **δ NAMED RESIDUALS (all deliberate, each recorded in its file/PR):** F10 — a DB-level
  `transaction_timeout` on PG17 would bound the advisory-lock wait (fail-closed direction;
  pinning it on the lock client is one round trip if ever wanted) · the B4 sandwich — an
  in-one-dollar-quoted-block off/create/on toggle evades both `check_function_bodies` layers
  (closing it = post-body revalidation of created functions, its own reviewed pass) · the
  57014 cancellation receipt class is an authenticated caller's attestation by construction
  (rollback erases server-side trace; honestly labelled `caller_reported`) · the RS guard's
  two-file split carries a between-transactions lift window (prestate-mitigated, named) ·
  Supavisor headroom re-measure is deferred to η/ζ deploys (δ v1 wires zero standing
  consumers). η—not δ—owns the production human/OBO/wake caller; direct wake/runtime evaluator
  grants and synthetic human JWTs remain forbidden.

**The VACUOUS-GREEN-GATE class (registered generally, 2026-08-16):** a gate that passes
because it had NOTHING IN SCOPE is not evidence — it must be distinguished from a gate that
measured a population and found it clean. BEE instances, mechanism-verified at file:line on
main's bytes: the uncoded gate blind with 21/21 filings NULL `financial_date`
(`0056:1397`'s BETWEEN is never satisfied by NULL, and `:1404-1405`'s own comment makes the
miss permanent); the bank gates blind with 0 registered accounts vs RM39,252.03 of real
balance (`0056:1360-1361` enumerates only `bank_statements`). A THIRD instance found at the
corpus-design grounding (registered as the doc's P-3, not built): drawer 1 returns `tie` on
an EMPTY `bank_accounts` registry (`0056:962` initialises `v_state := 'tie'`; no zero-census
branch) — one level below the very comment (`:969-972`) that cites the ADR-066 lesson. Rule
adopted in the Wave-G corpus (`wave-g-e2e-corpus-design.md` §7): every close gate must be
EXERCISED — nonvacuously — by at least one corpus slot.

**Beta-boundary instruments (registered at the harness refactor, ADR-0069):**
- a quality-score document, A–D per domain/layer (file minted at the beta boundary) · the monthly harness-simplification ablation
  (needs a replayable benchmark first — candidate: a fixed battery replay) · the doc-gardening
  recurring agent (content staleness; harness-links covers breakage already) · a system-prompt
  investment pass for Clara's own runtime agent (packages/runtime) · a tool/interface-design
  pass over the custom MCP surfaces.

**The F6–F9 register (ADR-0066; unchanged):** C1 `failed_retry` unwitnessed live · the
`internal` lane has no self-service door · admission-time envelope label · mint-time-only ocr
reclaim bound · the 401/403 auth-code split (Wave F) · F8 single-use door + two 0034-inherited
items + the sweep-side landscape-refresh autonomy class (owner-ruled, future) · F9 no-unpark
path + parked-residual acceptance · X7's five residuals (residual 5 owner-accepted;
`in_vendor_block`/`is_vendor_name` unproven live). *Parked, unchanged: the sandbox floor sits
at its exact 6/6/6/85 minimum with zero headroom; `SYNTHETIC-TEST-MY-INV-0023.pdf` is
pre-generated and untouched if headroom is ever wanted.*

**Gates on the operating runway:** Gate P (first native-MYR SST-stated supplier bill, or the
Wave-G reset; reminders RETIRED per ADR-0068; the capitalised/mixed-purchase tax-allocation
question rides it, and the Gate D residuals ride along) · Gate S real-XML leg (first genuine
e-invoice) · FINCARE RSINV-2510/02
needs a human coding decision.

**η residuals (registered at the Wave-E close, PRs #240/#242):**
- **The blank-op-key idiom is whitespace-blind, estate-wide** — single-argument `btrim()`
  trims SPACES only, so a tab-only or newline-only op key passes every blank-key refusal in
  the estate: η's four wake wrappers and the pre-existing sites whose expression they copied
  character-for-character. Not an η regression, and not reachable from the real caller
  (`stableOpKey` normalizes before the key is built). The fix is one whitespace-class-aware
  expression applied at every site in a single pass — per-lane patching would leave the
  estate inconsistent, which is worse than the current uniform blind spot.
  *(owner-ruled estate-wide; η comparison sheet, PR #240)*
- **The co-effective policy seed-test wants its own fixture design** — promoting B1/B2's
  red-proofs to permanent cells needs a rig seed carrying two co-effective `eps_v1`
  versions, but `clara.edge_policy_sets` is append-only: such a seed cannot be torn down
  between runs and would change the estate every later cell reads. Registered honestly
  rather than forced in at merge time. *(PR #240 residual)*
- **δ-family: policy resolution is window-blind on the wall side** —
  `clara._tf_metric_cell_integrity` resolves policies with NO effective-window filter and
  re-derives `resolved_inputs_sha256` from that resolution, so a window-filtering preview
  core would CLR11 every preview. η's compose core therefore matches the wall term-for-term
  and fail-closes the mismatch as an effectivity REFUSAL — a false refusal, never a false
  preview. The compensating control retires when wall and writer resolve by window
  together, on δ's own ladder. *(B1 adjudication, PR #240)*
- **0084's out-of-tree derivation tooling is RETAINED** at `C:\ct\` (gen-approve.mjs +
  build-migration.mjs) as the reproduction path for the body substitution; the migration
  itself stands on three in-repo proofs (prosrc prestate pin, tail token re-read, δ's
  census) and does not depend on them.

**CI economics overhaul (owner-requested assessment 2026-08-15; REGISTERED for Wave F):**
the CONTENT is right (lint/secrets/typecheck/build/unit/integration/migration+upgrade drills/
DR round-trip/deploy-onto-existing — few estates carry the last two per-PR at all) and the
docs-only classifier fence already works (docs PRs run lint-only, minutes). The COST problem
is structural: the monolithic `ci` job re-proves EVERY closed wave's drill serially on two
runners (~45-60 min and growing one full-chain apply per wave). The registered fix, in order
of leverage: (1) demote CLOSED-wave drills to the weekly sweep, keep only the CURRENT wave's
drill per-PR (biggest cut; the weekly sweep + the estate suite still cover regressions);
(2) split the monolithic job into parallel jobs (dashboard/runtime/db-core/drills/DR);
(3) real pnpm-store + docker-layer caching (also kills the setup-pnpm race); (4) HYBRID
runners — GitHub-hosted for the cheap fast legs (lint/typecheck/unit), self-hosted for the
DB estate (wholesale GH-hosted is slower per-core and burns paid minutes on the heavy legs);
(5) the ci.yml composite-action refactor (the 500-line overflow); (6) NEW 2026-08-16 — the
branch-protection interplay measured on #244: required check = `ci` with `strict: true` +
`enforce_admins: true`; a docs-only PR whose `ci` leg SKIPPED merges fine while up-to-date
(#238 proved it), but the moment main moves the protection reports "Required status check
'ci' is expected" — the fix is `gh pr update-branch` + re-green, never `--admin` (which
enforce_admins correctly refuses). Consider requiring `changes`+`lint` alongside `ci` when
the required-check set is next reviewed (an owner-ruled protection change). Batch-CI-per-wave was
CONSIDERED AND REJECTED: tonight alone the per-PR gate caught T17 drift, a seam census gap,
the frontier-ordering violation and the S0.9 flake — defects that would have compounded
across a wave batch. Scope routing, not frequency reduction. (Any change to per-PR
uniformity itself is ADR-061 territory — an owner ruling, not an optimization.)

**Wave-F planning inputs — DISPOSED by ADR-0071/contract:** #25 SUPERSEDED (witness pair) ·
E-R13 ABSORBED (F-A3) · FX-lite principle pre-seeded (P-FX; timing stays a sitting item) ·
claims (E-R10) → F-T4 · staff allowances / self-billed detection / WHT stay Track-B candidates. **Wave-G:** the OS surface + the
UX-debt backlog (E-R10) + design trio population + **the owner-ruled factory reset + full
E2E rebuild from raw documents** (the definitive stuck-bytes discharge; beta's "real data
untouchable" resumption rides the same gate). **Forward roadmaps + risks + the Phase-5
verification plan:** `docs/plan/active/roadmap.md`.

**Wave-D/C carried deferrals:** FA carry-down first real firing (needs a client with assets at
opening) · one real reducing-balance asset · first live real recurring template · C-a residuals
(§5.3 pool segregation · the Section-I wedge remedy · the real-PG dead-letter battery,
declined) · C-c F-3 documented-as-is. **C-c F-1 is CLOSED** — the allocation-date guard was
built in `0055` and verified at the live apply (ADR-0067); the two RPR historical scars remain
documented history.

**Slice-era standing residuals** (carried from the retired PART 2 register; none has a PR):
- **0017's kind-blind supersede** — readers were fixed kind-honestly, but the authoritative-extraction trigger's own kind-scoped supersede is an OPEN ADJUDICATION; needs an `authoritative_extraction_id` consumer census before any migration candidate. *(C-b acceptance-night item 1)*
- **Always-run role/membership reconciliation** — deferred: poisoning needs SUPERUSER, outside the threat model. *(Slice-2 HIGH 6/7)*
- **Supabase non-superuser deploy-role CI** — CI applies migrations as superuser; PARTIALLY
  discharged 2026-08-14 by PR #234's non-superuser owner-login rehearsal (a real `migrate()`
  end-to-end as a Supabase-shaped login) plus two live ceremonies exercising the guarded
  SUSET branch against the managed cluster. REMAINING: the standing CI job running the full
  chain under that role on every PR. *(Slice-2 HIGH 8/9)*
- **Opaque/HMAC pack tokens** — declined; a stronger structural binding stays optional. *(Slice-3 C12)*
- **`activate_taxonomy_version(v)` operator fn + the predicate-dimension taxonomy schema** — ship when a second taxonomy version, or a workflow-period-materiality routing state, first exists. *(Slice-3 C8/C16)*
- **Slice-4 residuals** — per-part-type field schemas → the fail-closed card catalog · audited owner compliance export + a visibility-aware trace-debug surface · per-firm chat-visibility toggle + un-share · S4-V2 engine-hook-lifetime ≥14d (the canary watch) · job-level engine liveness · firm-local-time budgets · billing-grade metering. *(ADR-017)*
- **Slice-6 / Wave-A residuals** — task-per-ingest coding · a dedicated proactive notification-inbox surface (the one-queue is the interim) · agent-visible attribution candidates. *(ADR-019/023)*

**Interview v3 residuals** (no PR owns these):
- **CLOSED 2026-08-14, verified against source + green runs (67/67 + 4/4):** the optimistic-bubble
  rollback (bubble id now keys park+phase+submitId, `thread.ts:83-85`; rollback on thrown submit
  incl. `deliverValue`), the guard follow-ups (ANNOUNCE counted file-wide + closed-set `ask`
  reachability, `wave-b-interview-park-ordering.test.mjs:283-446`), and the 409 recovery's
  unbounded fetches (`runtimeFetch` applies `AbortSignal.timeout(15s)` at the single chokepoint,
  `interviewApi.ts:69-80`). PR #199's ADR-062 (6) record was accurate; the register was stale.
- **`readClearsError` never checks runId** — unreachable while `refresh` passes its own run's state; one line if ever wanted.
- **UNOWNED — the concurrent-submitter receipt gap** (a RUNTIME CONTRACT change, not a dashboard fix): *"a higher park index ⇒ my answer landed"* is an inference, not a receipt — any bookkeeper+ of the firm can win a CLIENT-scope hook (the route gates on role + plan binding only, whereas the FIRM branch binds ONE principal). The real fix is a server-authored per-(run, park, submission) receipt.
- **UNOWNED — the interview e2e de-pin** — `interview-e2e.mjs` names `interview.v2.core.ts` inside a clause that says no version is named there. True today, stale at the next core bump: a dated tripwire.

**Owner/legal:** the C6 checklist (DPA · disclosure text · PDPA basis) before any vendor trace
export · the first monthly LIGHT DR sitting (to schedule) · PITR (deferred, owner-tracked) ·
server-side branch protection (plan upgrade) · WB-R22 target capability · PRD §9 deferred
product questions · the old SGD-document clarify in the owner's inbox.

**Tooling follow-ups:** the dr-verify trio (UTC hashing · the STRICT canary probe's stale
expectation · the AP-gate ILIKE example) · the runtime boot line should name its bundle
version (the positive-read law's second leg) · Supavisor headroom re-measure at δ's consumer
additions · the local disposable Supabase stack (needs Docker) · ComplianceWatchCard
`acknowledged_at` echo (UI-only) · the unreverted-admin-grant lint watch.

## Known issues

- **Three genuinely dangling doc paths** — `RENUMBER.md`, `algebra.md`, `INTERFACE-PINS.md`:
  authored in build worktrees, never committed; the renumber procedure's content survives as
  the digest's law 41 (`docs/adr/README.md` §4 · Engineering and CI law) and ADR-058's body. Recorded at the harness-v2 assembly; re-author only if a real
  need appears.
- **Two γ post-CLEAN NITs** (PR #231 body, residuals 4–5): a +25-line self-citation drift in
  the third skeleton amendment · S11.4c's absent-function branch tests `''` where a no-row
  SELECT leaves NULL (near-zero reachability). One-word/two-char fixes for the next 0057-area
  batch.
- **Working-tree custody — RESOLVED 2026-08-15/16**; the full record moved verbatim to
  `docs/plan/completed/progress-archive-2026-08.md` (2026-08-18).
- **The BEE opening-TB record discrepancy (owner adjudication, found 2026-08-16 at the
  corpus-design grounding):** this file's BEE-deferral bullet (Next 2) says the book holds
  "an empty opening TB", while ADR-043 records a FINALIZED keyed opening seed `1e60960e`
  tying at RM 210,000.00 = 210,000.00 with capital (65,747.97) — the same figure as the
  owner's desk FY2025 capital B/F. Both cannot describe the live book. Which is current is
  the owner's read (a live query at the next sitting settles it); the corpus doc carries it
  as open question 1. Until adjudicated, treat NEITHER as ground truth in acceptance
  reasoning.
- **ci.yml exceeds the 500-line harness file limit** (pre-existing; a GitHub workflow cannot
  split across files) — the hook flags every edit; a composite-action refactor is a future
  candidate, not tonight's.
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
- **MAX_PATH breaks git's RECOVERY verbs too (2026-08-14, fleet lesson):** on this repo under
  Windows, the three tracked long-path PDFs under `packages/runtime/test-storage/` make
  `git rebase --abort` fail (`could not move back`) with the rebase state SURVIVING, and a
  follow-up `git reset --hard` also fails (the unresolved index writes through the same long
  paths) — the instinctive abort→hard-reset pair leaves the clone MORE stuck at each step.
  Escape that works: `git rebase --quit`, then a MIXED `git reset <sha>` (index-only, no
  long-path writes), then `git symbolic-ref HEAD refs/heads/<branch>`; verify the target sha
  is an ancestor of origin BEFORE resetting so the recovery is free by construction. Prefer
  fresh short-path clones (with `core.longpaths true`) for any conflict-bearing operation.
- **Local-only test-isolation flake in the db package (pre-existing, NOT a functional defect):**
  `a21-prestate.test.mjs` leaks `PGDATABASE` from its subprocess setup into the shared Node
  process, so a full-suite run against a REUSED database inflates failures (13 vs the true 7)
  and `pipeline.test.mjs`'s own error self-diagnoses the mismatch ("PGDATABASE=a21_prestate_…
  != url db …"). On a fresh single-pass database the same 7 fail deterministically in the two
  untouched files (`a21-prestate`, `pipeline` — last touched ba22326/e8dfcce); CI runs both
  green, so this is a LOCAL sequencing/env artifact. Found by θ during the T17 round
  (2026-08-14). Fix candidate: scope the env var inside the subprocess only. *(The η/ζ
  orphan-custody narrative that used to ride this bullet is CLOSED — both lanes merged and
  ceremonied 2026-08-14/15; the `zeta-custody-20260814`/`eta-custody-20260814` snapshot
  branches remain in git history as evidence. The v11 tools NUL-byte item was resolved on η's
  own ladder before merge — the merged `chatTurn.v11.tools.ts` is text-reviewable.)*
- **The estate-wide whitespace-blind blank-op-key idiom** stays REGISTERED under η residuals
  in the Backlog (single-pass estate fix, owner-ruled) — noted here so a Known-issues-only
  reader does not miss it.
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

## Session log

*(Entries through 2026-08-16 moved verbatim to
`docs/plan/completed/progress-archive-2026-08.md` at the 2026-08-18 clock-out.)*

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
- **2026-08-18 (evening, 开工)** — Next 1 executed: #255 deployed as `clara-runtime` v63,
  triple-verified (v62 negative control → v63 PROCESS reads → `/ready`); lane row retired.
  Then the F-A1 design: a seven-lane grounding sweep + completeness critic over the
  extraction estate, design v1→v3 through a two-lane fresh-context adversarial review
  (48 findings adjudicated at the bytes; both lanes unconditional MERGEABLE on the final
  bytes). The Codex lane was BLOCKED by a vendor usage limit (lifts 2026-08-20) —
  re-registered as the build's PR-0 gate, not waived. OQ-1/OQ-2 queued for the sitting.

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then
lanes, then anything that moved into or out of the backlog. It is cheap to update and
expensive to distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever
after, which costs far more than the updates ever did.
