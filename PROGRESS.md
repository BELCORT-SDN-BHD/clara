# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

*(as of 2026-08-12, the harness-v2 assembly — trued at every clock-out)*

- **Live DB:** 56 migrations, frontier **`0057_wave_e_registry_snapshots`** (α `0055` + β `0056`
  + γ `0057` all applied; the 0057 ceremony ran quiesce-free — additive DDL only, backup
  `r2:clara-dr/db-snapshots/2026/2026-08-11T21-58-08-367Z` taken first).
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
| harness-v2 | the grand refactor (this tree) — ADR-0069 | in review | — |
| Wave E · δ | the deterministic evaluator + metric algebra (E-R4/E-R5) | design | — |
| Wave E · ε..θ | seeds/FS pack/reporting/surfaces per the skeleton | not started | — |

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

1. **Land harness-v2**: dual-lane ladder on the refactor branch → owner signs the standing-laws
   digest (`docs/adr/README.md`) → PR → merge → memory demotion rewrite + codegraph re-index.
2. **Lane δ** (the evaluator): ground via `docs/plan/active/wave-e-design-reporting.md` (+part2)
   and the skeleton's δ sections; its work order must pick up the named δ debts below.
3. **Wave-F planning sitting** (owner): the FX-lite ruling + the third-reader roadmap (#25) —
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
- **δ owes:** E1b's consumer half + E6's independent-evaluator half (noteLane'd, no forcing
  function) · the agent's period/snapshot reads as a wake-pack design item (the γ recorded
  deviation) · `bank_reconciliations`' staleness arm has no firing cell. *(PR #231 residuals)*

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
- ⚠️ **Verify first, then carry or close:** ADR-062 (6) records PR #199 landing "bubble rollback incl. deliverValue, guard file-wide announces + closed-set call-argument reachability, structural fetch bounds in runtimeFetch" — that reads as discharging the next three bullets, but the register was never updated. **Confirm against `main` before carrying them.**
- **The optimistic-bubble rollback** — a thrown submit leaves the optimistic answer bubble in the thread, and a retyped DIFFERENT answer at the same park never renders (the bubble id keys on park+phase).
- **Guard follow-ups** (convergent: native review + Codex round 7; neither gating) — announces are counted only inside `ask` while arms are counted file-wide, and `ask` is not proven reachable from the registered export. Close by counting ANNOUNCE file-wide.
- **The 409 recovery's ≤4 sequential fetches carry no AbortSignal/timeout** while `busy` disables the input. Cosmetic under normal conditions.
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
  authored in build worktrees, never committed; content survives in ADR-058's body + AGENTS
  constraint 10 (renumber law). Recorded at the harness-v2 assembly; re-author only if a real
  need appears.
- **Two γ post-CLEAN NITs** (PR #231 body, residuals 4–5): a +25-line self-citation drift in
  the third skeleton amendment · S11.4c's absent-function branch tests `''` where a no-row
  SELECT leaves NULL (near-zero reachability). One-word/two-char fixes for the next 0057-area
  batch.
- **⚠️ interview-v3 optimistic-bubble residual** — the old register carried it as open while
  ADR-0062 §6 records PR #199 landing the batch; not re-verified at the refactor. Verify
  against the runtime source at the δ session, then close or carry properly.
- **Owner question OPEN: the standing-laws digest sign-off** (raised 2026-08-12) — the 67-law
  digest in `docs/adr/README.md` awaits the owner's final review; the harness-v2 merge is
  gated on it.

## Session log

- **2026-08-12** — the α+β EARLY ceremony (0055+0056 live, MSIC debt discharged, ADR-0067) ·
  the ADR-0068 evening sitting (B3 ruled · sign-offs · Gate-P defers) · lane γ end-to-end
  (build → 7-round ladder → 42 findings killed → PR #231 merged → 0057 ceremonied) · the
  harness grand refactor grilled (10 rulings + 5 supplements + 5 increments), built by five
  lanes, assembled on the harness-v2 branch (ADR-0069).

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then
lanes, then anything that moved into or out of the backlog. It is cheap to update and
expensive to distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever
after, which costs far more than the updates ever did.
