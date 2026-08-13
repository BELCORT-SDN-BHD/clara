# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-14 early morning, the Wave E night run — trued at every clock-out)*

- **Live DB:** 56 migrations, frontier **`0057_wave_e_registry_snapshots`**. Repo frontier:
  **`0063`** — six new migrations built, reviewed and PG17-accepted this night (δ `0058-0061`
  + the RS name-only guard pair `0062-0063`), PR pending; live apply awaits the ceremony.
- **The δ review record:** cross-model (codex xhigh, initially NOT-MERGEABLE with 6 blockers)
  + a native 8-dimension adversarially-verified pass → an adjudicated fix docket (fake-receipt
  validation, in-body `check_function_bodies` double-layer refusal, owner-only RS lift floor,
  `percent_change` dimension equality, exact-division display rounding, provenance
  absent-key refusal, login-shell negative loops, pack-v5 consumer pins) → all ten fixes
  codex re-verified ALL-CONFIRMED on the final bytes → 87/87 zero-skip acceptance on pristine
  PG17 with source==staged==applied SHA-256 equality.
- **Hard constraint 12 is now STRUCTURAL:** `0062` walls RS-customer enrichment in the DB
  (fact-driven, uuid-pinned, behavioural self-proof at apply); `0063` makes lifting it an
  OWNER act. The AGENTS.md parenthetical ("rests on you") is stale pending its own docs PR
  after the owner reconciles the foreign AGENTS.md modification.
- **Harness hardening live in-repo:** the dispatch-model-guard PreToolUse hook (constraint 5
  mechanically enforced, 44-case selftest in CI) beside pinned-ids; `.claude/rules/db-tests.md`
  + `handoffs.md`; the ci.yml Wave-E δ contract drill (closes the sweep-skip false-green shape).
- **Runtime:** Fly `clara-runtime` **v60**, single machine, `/ready` green. Dashboard: Pages
  `app.clarabook.com`. `clara-backup` daily.
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
| Wave E · α | the E-R12 client-facts trio (`0055`) | ceremonied | #226 |
| Wave E · β | the close model (`0056`) | ceremonied | #228 |
| Wave E · γ | period registry + month snapshots (`0057`) | ceremonied | #231 |
| harness-v2 | the grand refactor — ADR-0069 | merged | #232 |
| Wave E · δ + RS guard + harness hardening | `0058-0063` + runner hardening + the dispatch-model hook — full ladder run (cross-model review → fix docket → re-verify → PG17 acceptance 87/87) | in review (PR-1) | — |
| Wave E · ε | FS reporting DB layer (7 migrations authored): template layers · claim assessment (incl. the seal-gate composition fix, η's cross-lane find) · chart AST · sealed artifacts — own-stage battery 48/48 + δ/θ coexistence proof | built, own PR next | — |
| Wave E · ζ | render worker + freeze CI half + DR §10 — authoring (render_jobs 4-file set + packages/reporting-render on disk) | building | — |
| Wave E · η | chatTurn_v11 + four wake wrappers (agent-lane cores calling δ internals; granted wrappers carry no DML) — DB half + v11 files authored, F7 rounding fold-in pending validation | building | — |
| Wave E · θ | `get_close_plan` + `/close` + `/reports` (plumbing grade) — rig 4/4 + dashboard 739/739 | built, own PR queued | — |

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. **Land PR-1** (δ `0058-0061` + RS guard `0062-0063` + runner hardening + harness hooks +
   docs): CI green on the two self-hosted runners → merge → the 0058-0063 ceremony from merged
   `main` (backup first · restored-backup rehearsal of the RS S3 arming + S4.5 self-proof ·
   additive apply with `lock_timeout` for the two trigger DDLs · `NOTIFY pgrst` · freeze
   `--lock-deployed` · positive reads). The evaluator `deployed=true` flip is a separate staged
   step inside the same ceremony (owner authorized the night run to include it).
2. **The ε → θ → ζ/η PR train**, each on the full ladder: ε claims numbers at its merge prep
   (its `--import` gate joins the package.json chain then); θ behind ε; ζ and η after their
   validations (η's rig run needs the post-PR-1 frontier + ε staged; ζ carries a Law-1
   independent pass on the leader-dispatch touch + the freeze manifest for its render modules).
3. **Owner-key acceptance items** (the constitutional human half, whenever the owner sits):
   the E-R9 corpus on live books — sandbox battery → BEE FY2025 first real close (drawer keys)
   → RPR historical MPERS pack → RS snapshot witness; wording seeds behind #43 (MASB verify)
   + #44; the ms/zh claim-policy copy (fail-closed until supplied).
4. **Wave-F planning sitting** (owner): the FX-lite ruling + the third-reader roadmap (#25) —
   both parked for that sitting (ADR-062/0065).

## Backlog

Registered but not scheduled. Sources of record in brackets.

**Named build debts (deadline-triggered):**
- **B3 implementation** — `reopen_fiscal_year` moves from the today-dated mirror to the
  dedicated `ends_on`-dated reversal under the target-bound permit. **Before the first real
  close finalizes (BEE FY2025), and in any case before any real reopen.** When it lands,
  `reopen_fiscal_year` joins 0057's S11.2 writer-census roster. *(ADR-0068)*
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

**Wave-F planning inputs:** FX-lite (BNM rate tables, DB-computed) · the LLM third reader
(#25) · the settlement-corroboration door BUILD (E-R13) · claims accounting (E-R10) · staff
allowances · self-billed e-invoice detection · WHT mechanic. **Wave-G:** the OS surface + the
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
- **Supabase non-superuser deploy-role CI** — CI applies migrations as superuser; the follow-up is a job running the full set under a Supabase-shaped non-superuser role. *(Slice-2 HIGH 8/9)*
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
- **Working-tree custody:** a foreign `AGENTS.md` modification exists in the ORIGINAL checkout
  (not this worktree); reconcile it with the owner before any AGENTS.md edit — the constraint-12
  parenthetical truing waits on that. The `.tmp-delta-*` / `.tmp-e6-*` stages and `err.txt`
  remain foreign/historical evidence — still untouched, still not to be deleted without
  authorization (they are now superseded as evidence by the 2026-08-14 acceptance record).
- **ci.yml exceeds the 500-line harness file limit** (pre-existing; a GitHub workflow cannot
  split across files) — the hook flags every edit; a composite-action refactor is a future
  candidate, not tonight's.
- **The ε/η/θ/ζ byte sets are IN this worktree but NOT in PR-1** — their commits ride their own
  PRs; until then they are untracked working state (do not mistake local presence for merged).

## Session log

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

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then
lanes, then anything that moved into or out of the backlog. It is cheap to update and
expensive to distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever
after, which costs far more than the updates ever did.
