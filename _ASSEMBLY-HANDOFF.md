# Assembly handoff — refactor/harness-v2

**Consumed inputs for the orchestrator.** The two extraction files that the ADR and tree lanes
left behind (`docs/adr/_part2-extraction.md`, `docs/plan/_progress-extraction.md`) were copied
here verbatim and then deleted from the tree, so the assembled branch carries no temporary
handoff files. Everything below Part A and Part B is the assembly lane's own record.

Fill `PROGRESS.md`'s `TODO:ORCH` blocks from Part B (posture / next / backlog) and Part A (the
PART 2 open register), then author `docs/adr/0069` on this branch.

---

## Part A — verbatim: the former `docs/adr/_part2-extraction.md`

# PART 2 extraction — the open-items register, bucketed

**TEMPORARY handoff file for the orchestrator.** `docs/PROJECTLOG.md`'s PART 2 (39,885
bytes, the live open register) is the only part of the six deleted files that was not a
decision entry. It is decomposed here into three buckets so the assembly can route each
line. **Delete this file once PROGRESS.md and the digest have absorbed it.**

Source of record: `docs/PROJECTLOG.md` PART 2 at commit `099a5bf`, last housekept
2026-08-09 at the F6–F9 close and edited through 2026-08-11. Bucket A is written for a
backlog: one line per item, with its trigger/owner where the register named one.

---

## BUCKET A — OPEN items → PROGRESS.md backlog

### A1. Named build items with a deadline

| # | Item | Trigger / deadline |
|---|---|---|
| A1.1 | **B3 implementation** — a D1-class migration changing `reopen_fiscal_year`'s body from the today-dated `reverse_entry` route to a dedicated `ends_on`-dated reversal under the target-bound permit (M2). δ/ε carry **no** interim-exclusion obligation. | **Before the FIRST REAL CLOSE finalizes** (the E-acceptance's BEE FY2025 close), and in any case before any real reopen. *(ADR-068)* |
| A1.2 | **The `closing_stock` producer verb** before any real goods-trader close. | The first real goods-trader client. *(ADR-067 open list; home = REBUILD-PLAN)* |
| A1.3 | **The `opening_tb.line` producer + the K-doc door** — the document-tied carry-down remains unproven on any client. | Phase-5, review-gated. *(ADR-043; home = REBUILD-PLAN)* |

### A2. The F6–F9 batch register (open residuals from ADR-066)

- **C1 — F6's `failed_retry` witness is UNWITNESSED live.** The §1 population (a lane whose
  newest task is terminally `failed`) has never run outside the rig. Needs a purpose-built
  sandbox upload that fails first. Green on the rig is not a field witness.
- **F6 §2 — the `internal` lane has no self-service door.** The recovery door serves the
  ingest and facts lanes only; an `internal`-lane terminal failure has no user-reachable retry.
- **F6 — the envelope engine label is an ADMISSION-TIME snapshot** (five stamp expressions
  across three modules). Pre-existence proven, registered, deliberately not changed.
- **F6 — the ocr reclaim bound is MINT-TIME-ONLY.** The requeue/reclaim cycle predates the
  door by 44 migrations; the cap bites at claim time.
- **F6 — the 401/403 → retryable auth-code split is a WAVE F item.** Today a credential-outage
  failure classifies with the deterministic `bad_type` class and is refused as not-retryable.
  One of Gate P's two honest remedies.
- **F8 — the door is SINGLE-USE PER WITHDRAWAL and a no-op retry spends it** (one re-admission
  per withdrawal, `p_origin='one_click'` only). Attended doors remain the fallback.
- **F8 — two inherited-from-0034 items:** a refused re-admission still deletes its op receipt;
  a refused re-admission still burns a sales backfill slot. Both pre-date `0053`, left untouched.
- **F8 — the sweep-side landscape refresh is a FUTURE OWNER-RULED AUTONOMY CLASS.** Letting the
  estate sweep re-offer a withdrawn filing after a landscape change needs its own owner ruling,
  not a code change.
- **F9 — there is NO UNPARK PATH.** Four state writers examined; none exits `'parked'`. No human
  verb reaches a parked run.
- **F9 — the parked-residual acceptance stands** with its named reasons (`{ok:false, je_review}`
  unreachable; multiple distinct successful drafts unreachable).
- **X7's FIVE recorded residuals stand** (module headers + `extraction-slice-contract.md`).
  Residual (5) is owner-accepted 2026-08-09 and re-confirmed on the widened envelope. **Not
  witnessed in the field:** `in_vendor_block` and `is_vendor_name` both counted ZERO on the
  KONG CHENG pair — proven on the battery, unproven live.
- *(Parked, unchanged: the sandbox floor sits at its exact 6/6/6/85 minimum with zero headroom;
  `SYNTHETIC-TEST-MY-INV-0023.pdf` is pre-generated and untouched if headroom is ever wanted.)*

### A3. Gates on the operating runway

- **Gate P** — closes on the first native-MYR SST-stated supplier bill (ADR-062), **or**
  discharges at the Wave-G factory reset (ADR-068). Structurally unclosable on the current
  corpus. **Reminders are RETIRED** — do not chase the seven re-exports. `0036 §A`'s
  capitalised/mixed-purchase tax-allocation question remains a NAMED Gate-P design item, and
  Gate D residuals ride along.
- **Gate S** — the real-MyInvois-XML leg closes on the first genuine e-invoice document any
  client receives or issues (ADR-062). The synthetic leg closed at ADR-049.
- **FINCARE (#10, RSINV-2510/02, RM2,500)** never drafted — the extraction captured no buyer
  name at all, correctly, and F7 deliberately does not fix it. **Needs a human coding decision**
  to enter the books.

### A4. Wave-F planning inputs (both waiting on the same sitting)

- **The FX-lite prioritization question** — purchase-side foreign bills over effective-dated
  BNM rate tables, DB-computed conversion citing the rate row. Corpus-measured as routine
  Malaysian-SME reality. The E grill closed WITHOUT ruling it.
- **The LLM-third-reader roadmap (#25)** — ruled-and-recorded at E-R1, NOT built this wave.

### A5. Wave-G

- **THE WAVE-G CLOSE-OUT ITEM — owner-ruled 2026-08-11: FACTORY RESET + FULL E2E REBUILD FROM
  RAW DOCUMENTS.** At the Wave G close (pre-beta, ADR-060 authority still in force), reset the
  product's DATA and re-run the whole raw-document corpus through the then-current pipeline as
  the final end-to-end review. The definitive discharge for every stuck-bytes class, the Gate-P
  seven included. Scope: DATA only per ADR-060 §2; the frozen prior build and the spike's parked
  run stay out of scope. Plan the ceremony at Wave-G planning. **The resumption of "real data
  untouchable" at beta rides the same gate.**

### A6. Wave-D / Wave-C carried deferrals

- **Wave-D real half, still deferred with measured reasons:** the FA **carry-down** first real
  firing (needs a client that owned assets at opening) · the ≥1 real **reducing-balance** asset ·
  the first LIVE real **recurring template** (no going-concern client with a genuine month-end
  accrual pattern exists yet).
- **Wave-C C-c residual (F-3):** the completing-recon GUC one-receipt width — one recon per
  transaction is the lawful shape; documented, fine as-is.
- **Wave-C C-a residuals:** §5.3 pool segregation (the WCA-R8 pin is its live evidence) · the
  Section-I wedge remedy (`cancel_agent_task` → re-admit) · the real-PG dead-letter battery
  (declined as not-cheap).
- ⚠️ **Verify before carrying:** the register still lists C-c **(F-1)** — the allocation-date
  guard — as "the guard builds in Wave E". It was ruled at E-R12 (ADR-065) and **appears to have
  been built in lane α / `0055`** (ADR-067). Confirm and close, or carry. Likewise the two
  documented historical scars at RPR (as-of 2025-08-31, 2025-09-30).

### A7. Owner / legal obligations

- **C6 checklist (ADR-011):** the DPA execution, firm-facing disclosure text, and PDPA
  cross-border check are OWNER/legal work items **before any vendor trace export**; engineering
  keeps the vendor-trace flag OFF until all three are evidenced.
- **R2 backup cadence (WB-R26):** monthly LIGHT human-assisted drill + quarterly STRICT. **The
  first monthly sitting is still to schedule** (owner + agent). Wiring done 2026-07-22.
- **PITR** — deferred, owner-tracked (the rest of the ADR-020 DR gate is closed; re-run the
  full-profile drill quarterly).
- **Server-side branch protection on `main`** — owner-only plan upgrade; the git-base freeze-lint
  + CI are the interim gate.
- **The onboarding commit-lane shape (WB-R22):** target = a scoped review-attestation capability
  (future migration). The audited temp-admin ceremony stands meanwhile.
- **Deferred product questions (PRD §9):** billing / scale guardrails · MyInvois depth (API pull
  + issuance) · tax-comp v1-vs-v1.1 slip · multi-currency · opening-balance onboarding.
- **The old pending SGD-document clarify** in the owner's inbox.

### A8. Tooling / instrument follow-ups

- **The dr-verify tooling trio:** UTC hashing before content-md5 · the STRICT canary probe's
  stale "pending" expectation (the canary is now EXPIRED on both sides) · the stale AP-gate
  ILIKE example.
- **OPS — the runtime boot line does not name its bundle version.** Naming it would make the
  positive-read deploy law's second leg a one-line read. *(Ceremony finding, 2026-08-08.)*
- **DOC — `slices/forks/RENUMBER.md` is a DANGLING PATH in this checkout**, cited by
  `CLAUDE.md`, `wave-7a-design-skeleton.md` and several `x42*` test headers. The
  migration-numbers-claim-at-MERGE law stands; only the pointer is broken. *(Lane 2/3 territory.)*
- **Supavisor session headroom watch** — steady at baseline (35/60 total, runtime pool 11 at the
  F6–F9 ceremony). Re-measure at the next wave's consumer additions.
- **Local disposable Supabase stack** (`supabase start`) as the intended local test target —
  needs Docker (unavailable). Interim = a throwaway remote schema / the throwaway-PG17.6 rig.
- **ComplianceWatchCard `acknowledged_at` echo** — the queue envelope doesn't carry it (UI-only;
  the DB trail is complete).
- **The unreverted-admin-grant lint watch** (Gate-O era) — rides along; no trigger yet.

### A9. Open adjudications and deferred hardening (by slice)

- **C-b acceptance-night item (1):** the 0017 authoritative-extraction trigger's **kind-blind
  supersede**. Readers were fixed kind-honestly; **the trigger's own kind-scoped supersede stays
  an OPEN ADJUDICATION**, needing an `authoritative_extraction_id` consumer census before any
  migration candidate.
- **Always-run role/membership reconciliation (Slice-2 HIGH 6/7)** — deferred; poisoning needs
  SUPERUSER (outside the threat model).
- **Supabase non-superuser deploy-role CI (Slice-2 HIGH 8/9)** — CI applies migrations as
  superuser; a job running the full set under a Supabase-shaped non-superuser role is the
  follow-up.
- **Opaque/HMAC pack tokens (Slice-3 C12)** — declined; a stronger structural binding is optional.
- **`activate_taxonomy_version(v)` operator fn (Slice-3 C8)** + **predicate-dimension taxonomy
  schema (Slice-3 C16)** — ship when a second taxonomy version / workflow-period-materiality
  routing state first exists.
- **Slice-4 residuals (ADR-017):** per-part-type field schemas → the fail-closed card catalog ·
  audited owner compliance export + a visibility-aware trace-debug surface · per-firm
  chat-visibility toggle + un-share · S4-V2 engine-hook-lifetime ≥14d (**the canary watch — see
  bucket B**) · job-level engine liveness · firm-local-time budgets · billing-grade metering.
- **Slice-6 / Wave-A residuals (ADR-019/023):** task-per-ingest coding · a dedicated proactive
  notification-inbox surface (the one-queue is the interim) · agent-visible attribution
  candidates.

### A10. Interview v3 residuals (no PR owns these)

- **The optimistic-bubble rollback** — a thrown submit leaves the optimistic answer bubble in the
  thread; a retyped DIFFERENT answer at the same park never renders (the bubble id keys on
  park+phase).
- **Guard follow-ups** (found convergently by the native review and Codex round 7; neither
  gating): announces are counted only inside `ask` while arms are counted file-wide; and `ask` is
  not proven reachable from the registered export. Close by counting ANNOUNCE file-wide.
- **The 409 recovery's ≤4 sequential fetches carry no AbortSignal/timeout** while `busy` disables
  the input. Cosmetic under normal conditions.
- **`readClearsError` never checks runId** — unreachable while `refresh` passes its own run's
  state; one line if ever wanted.
- **UNOWNED — the concurrent-submitter receipt gap** (a RUNTIME CONTRACT change, not a dashboard
  fix): *"a higher park index ⇒ my answer landed"* is an inference, not a receipt — any
  bookkeeper+ of the firm can win a CLIENT-scope hook (`interviewRoutes.ts:337` gates on role +
  plan binding only, whereas the FIRM branch at `:318` binds ONE principal). The real fix is a
  server-authored per-(run, park, submission) receipt.
- **UNOWNED — `interview-e2e.mjs:246`** de-pins by naming `interview.v2.core.ts` inside a clause
  that says no version is named there. True today, stale at the next core bump — a dated tripwire.
- ⚠️ **Verify before carrying:** ADR-062 (6) records PR #199 landing "bubble rollback incl.
  deliverValue, guard file-wide announces + closed-set call-argument reachability, structural
  fetch bounds in runtimeFetch". That reads as discharging the first three bullets above, but the
  register was never updated. **Confirm against `main` before carrying them forward.**

---

## BUCKET B — STANDING pins and laws → the digest

All of these are already lifted into `README.md`'s standing-laws digest at the cited number.
Listed here only to prove nothing was lost in transit.

| PART 2 item | Digest |
|---|---|
| THE ENRICHMENT TRAP (RS's 11 customers, 0 registrations — never enrich) | §6.59 |
| The three laws minted 2026-08-06 (independent review · absence-is-not-evidence · spelling-is-not-identity) | §3.27 |
| ADR-060 IS IN FORCE + expires at beta | §6.55 |
| ADR-060's §1 SCOPE, NARROWED (client/accounting data in the live project only) | §6.56 |
| The v54 belt-gap incident's **positive-read deploy law** | §5.46 |
| Standing law: scan any branch with CI's own pinned gitleaks config BEFORE pushing | §4.44 |
| The AST guard's NAMED COST — do not "fix" a red by loosening the guard | §3.36 |
| Canary `daba7f2e` — NEVER answer (S4-V2 watch) | §7.63 |
| The belt witness `d023b48c` — NEVER approve | §7.64 |
| Archive branch `build/wave-d-b-0042` — NEVER MERGE | §7.65 |
| Never re-grill WD/WDB rulings, any ladder's adjudications, the hold-ladder's settled residuals | §7.67 |
| **LAW clarification (a):** the Slice-2 "agent never computes a figure" narrowing — an agent-proposed draft becomes authoritative only after exact-revision human approval; deterministic derivation of legs from persisted OCR facts is the Slice-5 pipeline. *(The quoted wording pre-dates the E-R4 amendment; the substance survives unchanged.)* | §1.1 |
| **LAW clarification (b):** the wake-secret txn-local property is a RUNTIME POOL contract (Slice 4), not DB-enforceable | §6.62 |
| A sole proprietor is NOT an employee — his account is EQUITY (WC-R10) | §2.19 |
| Gate P / Gate S re-scoped to operating runway (the closing conditions themselves) | §… — carried in **A3** as gate conditions rather than laws |

---

## BUCKET C — narrative / state → superseded by PROGRESS.md, note only

None of this is an instruction; it is the register's record of what happened. It belongs in
`PROGRESS.md` (or nowhere), not in a decision record. Listed so the deletion is deliberate.

- The **PART 2 housekeeping trail** itself (housekept 2026-07-29, 08-01, 08-05, 08-06, 08-07,
  08-08, 08-09) and every `*(Pruned to ADR-0NN …)*` bookkeeping line.
- **The 2506 backfill execution narrative** — batch `e312ec72`, entry `2d226fe7` owner-approved,
  DR 300-000 / CR 500-000, 280,000¢, posting 2025-06-06, **TB 3,116,500 → 3,396,500, diff 0**;
  and the discovery that RSINV-2506/01 IS the H1 probe document `bd6d37fb`.
- **The 2512 KONG CHENG leg** — both documents reading `KONG CHENG RESTAURANTS SDN BHD` under
  `clara-invoice-norm:v11`, counterparty `256d6100` born ONCE name-only, entry `f6da5aff`
  approved, TB 3,116,500 = 3,116,500. *(The name-only birth rule survives as the enrichment trap,
  bucket B; the figures are history.)*
- **The F6–F9 batch's PR/sha trail** (#219 `96d5175`/`0051` · #216 `3d3bad3`/`0052` + #220
  `4615372` · #217 `5dc138e`/`0053` · #218 `f2424e8`/`0054`) — git holds this.
- **The Wave-E campaign design packet landing narrative** (PR #223 `9431e8f`, seven files, the
  108-cell matrix, the four-round ladder) and the five owner questions' *resolution* narrative.
  The **rulings** themselves live in ADR-065..068; the packet is `docs/plan/`'s.
- **Gate-P's measurement narrative** — the local `AI Open` folder's 8 PDFs byte-identical to the
  live store, the expired Stripe hosted-invoice links, the portal inaccessibility. *(The ruling
  it produced — Wave-G reset, reminders retired — is A3/A5.)*
- **The #43/#44 research narrative** and the owner's in-session sign-off. **Keep one pointer,
  not the prose:** `~/.clara-tools/captures/gov-pulls-2026-08-11/` holds MPERS 2016
  (`e5114a24…`), MPERS 2025 (`59f8c5fe…`), MPERS 2025 BC+IE (`b547b13d…`), the 2023 Pillar Two
  amendment (`501293e5…`), PR 5/2000 original + Revised (`31930482…`/`1a177344…`) and PR 7/2021
  (`2b0f0ac6…`). **Lane ε seeds against these hashes** — that dependency is real and should
  survive into PROGRESS.md even though the story around it should not.
- **Wave C / D / E closure narratives**, live posture pins (migration counts, runtime versions,
  Supavisor readings, TB pins) and the `~~struck-through~~` discharge trails (MG188-2, MG188-3's
  eight comment refs, the Codex account lock/return, the MSIC backfill discharge).
- **The v54 belt-gap incident's full narrative** (build times, the 08-06 16:09Z tick, v55's boot
  sweep producing draft `d023b48c`). The **law** and the **witness pin** survive in bucket B; the
  incident story is history.
- **The WCC-R9 / RM5,000-bill confirmations**, the ROME PUBLIC allocation ruling, and the
  Wave-D/Wave-C "COMPLETE / CLOSED" status blocks — all now redundant with the ADRs themselves.
- **The three §7-A/Wave-B gate closure narratives** (Gate K, Gate F, Gate O) — in ADR-043, 0045,
  0038.

---

## Completeness note

Every bullet in PART 2 (lines 225–361 of `docs/PROJECTLOG.md` at `099a5bf`) is assigned to
exactly one bucket above, including the parenthetical/struck-through lines. **Two items carry a
⚠️ verify-before-carrying flag** (A6's C-c F-1 guard and A10's three interview residuals): the
register's text and a later ADR disagree about whether they are already discharged, and the
honest move is to check `main` rather than to drop or duplicate them.


---

## Part B — verbatim: the former `docs/plan/_progress-extraction.md`

# REBUILD-PLAN extraction — handoff for PROGRESS.md

> **Temporary working file**, produced at the 2026-08-12 harness docs-tree refactor when
> `docs/plan/REBUILD-PLAN.md` was deleted. That file's dated STATUS chronology moved verbatim to
> `docs/plan/completed/rebuild-plan-history.md`; its `coding_kind` roadmap table moved verbatim
> into `docs/ARCHITECTURE.md`. This file carries everything else — the CURRENT-as-of-deletion
> posture, the still-open named build debts, and the forward-looking Wave F / Wave G / Risks /
> Phase-5 content — reorganized into the sections below so the orchestrator composing the
> harness's new `PROGRESS.md` can paste each section in directly. **Not re-verified against
> `CLAUDE.md` or memory as part of this extraction — the content below is exactly what
> REBUILD-PLAN.md said at the moment of archival; the orchestrator reconciles it against the
> live pin before publishing.** Delete this file once its content is folded into `PROGRESS.md`.

---

## Posture

55 migrations (frontier `0056`) · Fly `clara-runtime` v60 · CI on the SELF-HOSTED runner
(PR #227; gate unchanged) · **WAVE E LANES α AND β BUILT, MERGED AND CEREMONIED** (α = PR
#226/`0055`, the E-R12 trio; β = PR #228/`0056`, the close model — INERT until the first
human `open_fiscal_year`; as-run records now at
`docs/plan/completed/wave-e-lane-alpha-acceptance.md` +
`docs/plan/completed/wave-e-lane-beta-acceptance.md`; the ADR-062 MSIC debt discharged through
the door). Waves A / A2 / A2.1 / B / C / D and §7-A are closed; the first strike (F6–F9) closed
at ADR-066.

## Next

**NEXT = lane γ (registry + snapshots, skeleton §2.11–§2.12), then δ..θ** — ONE campaign per
E-R7, acceptance F→A→B→C→D→E per the matrix (`docs/plan/active/wave-e-acceptance-matrix.md` +
`-part2.md`). Records of record for the in-build wave now live under `docs/plan/active/`:
`wave-e-contract.md`, `wave-e-design-skeleton.md` (+3 parts), `wave-e-design-reporting.md`
(+part2), `wave-e-acceptance-matrix.md` (+part2).

## Backlog

### Wave F — tax

**Wave F — tax.** The SST engine per the practice map (periods, payment basis, dual-registrant exports, SST-02, bad-debt relief); the payroll deadline calendar; **last: the draft tax computation** (add-backs, CA, chargeable income, forms — the slice allowed to slip to v1.1). *Inherited by ADR-065:* the **settlement-corroboration door BUILD** (E-R13 — executes the registered 7A-R3 narrowing + defines the alternate corroboration predicate) · the **claims accounting class** (employee paid-on-behalf, E-R10) · **third-reader planning** (#25) · the **FX-lite decision** (passed through the E grill unruled — must be ruled at F planning).

### Wave G — the OS surface

**Wave G — the OS surface.** Proactive inbox (allowlisted wakes), cross-scope needs-you, ⌘K Ask/Do/Go + ActionPanels, plan-as-document for close/onboarding, exports UI, generative-UI completion + parity CI gates, the design floors. *Inherited by ADR-065:* the **UX-debt backlog** (E-R10: userflow/signin/signup/firm-setup · raw-document click-through · real session auth replacing the hand-mint JWT) · the **claims submission/approval surface**.

### Risks (top 8)

| # | Risk | Mitigation |
|---|---|---|
| 1 | WDK in-flight-run replay across deploys (verified doc-silent) | Slice-0 spike ACs; pinned versions; name-versioned workflows; drain-active-runs deploy policy; LangGraph fallback behind the seam |
| 2 | Intrinsic side-effects widen the audited-fn surface (composite writers) | One composite fn per workflow class, rig-tested with negative paths; the F3 failure criterion as a per-wave regression suite |
| 3 | Scope creep in the compliance-correct core | The practice map's Part-5 scope ledger is the authority; tax-comp is pre-authorized to slip |
| 4 | The wiki becomes an unbounded token/complexity sink | Lint caps page count/size per client; context packs inject pages by relevance budget; wiki is advisory-only so degradation is graceful |
| 5 | C6 checklist slips (DPA/disclosure/PDPA) while tracing ships | Vendor trace export is **feature-flagged off** until the checklist is evidenced; DB run history carries debugging meanwhile. **Ownership: the DPA execution, the firm-facing disclosure text, and the PDPA cross-border check are OWNER/legal work items (Tao), tracked from Gate-2 approval — engineering's only task is keeping the flag off until all three are evidenced** |
| 6 | Design ambition (parts[], cards, evidence viewer) outruns the build | The design-critical path (`docs/design/PRODUCT_DESIGN.md` §4, formerly DIRECTION.md) is ordered; the fail-closed catalog means unbuilt cards degrade to nothing, never to broken UI |
| 7 | Old-build habits re-imported via ported code | Every PORT lands with its tests + a re-review against the findings that touched it; DROP list enforced in review |
| 8 | Single-maintainer bus factor on a bigger stack | Boring choices everywhere else (Next.js, Postgres, shadcn); the runtime is the one novel bet, seam-isolated |

### Phase 5 — Verification plan (the hero prompt's criteria, made falsifiable)

Run against synthetic / labelled-synthetic data — local/dev, **or the live sandbox firm** under ADR-048's pulled-forward methodology and **ADR-060's pre-beta data doctrine** (every firm's data in the live project is partner-authorized test state until beta; mechanisms, process and secrets stay unrelaxed). *This line originally read "local/dev with synthetic data only"; in practice every acceptance since Wave C-b has run against the live project's sandbox firm with named real-book halves, and ADR-060 ratified that posture.* Every scenario records: **what was read, changed, synced, skipped, or blocked.**

1. **End-to-end use cases** (each with evidence): document ingestion + classification; bank statement ingestion → coding → reconciliation → exception handling; SOFP/balance-sheet preparation + review; AR/AP sync, matching, aging, list updates; payment coding to AP/AR; customer/vendor ledger updates; year-end depreciation calculation + posting; fixed-asset disposal treatment; report generation with provenance, scope, audit trail.
2. **Acceptance criteria** (Workstream G): schema/context retrieval before workflows; relevance determination; scoping by client/entity/period/permission with zero cross-client mixing; COA validation; lock-date/closed-period/approval checks before posting; outcome sync-back; read/changed/synced/skipped/blocked records; resumability under interruption.
3. **The F3 failure criterion applied to every accounting workflow:** skill loaded → context retrieved → correct tool → GL posted → subledger/register/reporting/KB side-effects completed or explicitly surfaced. **Any workflow that leaves required state stale fails.**
4. **Load & limits (first-party QA of our own product, new build only):** batch sizes to design targets, large files, mixed types, duplicate handling, partial failures, retries, queue behavior, OCR throughput, unassigned persistence — **measured ceilings recorded in the docs, not guessed.**
5. **Resumability:** kill and restart the server mid-workflow (mid-close, mid-onboarding, mid-bulk); resume-or-reconcile with **no double-posting and no lost context**; parked clarifications resume after ≥48h.
6. **The AI-quality eval harness (GAP3-6, now a real gate):** attribution precision + abstention, coding accuracy by document class, must-ask recall, auto-post precision — falsifiable thresholds set at Gate 3, measured before cutover readiness.
7. **Structural-guard negative tests:** SELECT-wrapped writer fails; provenance mismatch RAISES; wake allowlist blocks; maker=checker blocked on high-stakes; revision-token mismatch rejects; stale context-pack token rejects; double carry-down seed RAISES; cross-FY reverse-out-of-order RAISES; **bank matching (GAP1-1/1-2): a wrong-account/wrong-period/amount-beyond-tolerance match RAISES; a second match on an exclusively-matched entry is blocked; re-match without an explicit unmatch is blocked.**
8. **Data-egress verification:** with vendor tracing flagged on, verify the DPA/disclosure evidence exists; with it off, prove zero trace egress.
9. **Final report:** pass/fail per scenario, measured limits, known gaps, the supersession manifest, and the old-project decommission checklist (decommission executes only after owner sign-off).

**Methodology carried from the owner's harness notes (Gate-1 E2):** user-journey simulation against the production-mode build (not dev-only), state-transition acceptance criteria with an observable UI + DB assertion per transition, verification-before-completion as a hard per-slice gate, and a cross-feature happy-path regression suite run on every evaluation.

## Named build debts

- **The `closing_stock` producer verb** — ships before any real goods-trader close (PR #228 residual 5).
- **The B3 ends_on-reopen implementation (ADR-068)** — a D1-class migration on
  `reopen_fiscal_year`, before the FIRST REAL CLOSE finalizes (BEE FY2025) and in any case
  before any real reopen.
- **The `opening_tb.line` producer** — the opening parser reads a `document_regions.field_path`
  that nothing in the pipeline emits, so the document-tied carry-down has never worked on any
  real client (both real seeds are `keyed`). Phase-5, review-gated — carried in `CLAUDE.md`'s
  open-items register; the original finding is preserved in
  `docs/plan/completed/rebuild-plan-history.md` (the Wave-B remainder block).

---

## Part C — the assembly lane's record

Branch `refactor/harness-v2`, cut from `origin/main` @ `099a5bf`. **PR #231 (Wave E lane γ) merged
mid-assembly**, moving `origin/main` to `9a0ba9b`; it is merged in here as the sixth merge, and the
matrix reconciliation the brief anticipated was needed after all — see C.1.

### C.1 Merge conflicts

Six `--no-ff` merges. **Two conflicts.**

**(1) `.gitignore`, merging L4 over L3.**

- `refactor/agents-entry` added `!.claude/rules/`; `refactor/hooks-lint` added `!.claude/hooks/`
  at the same position in the `.claude/*` negation block.
- Resolved as the union — both negations kept — plus `!.claude/settings.json` for assembly item
  (a). `.claude/hooks/` does not exist on disk (L4 put the guard under `scripts/hooks/`); the
  negation is kept anyway as the conservative resolution and as the home a future hook would use.

**(2) `docs/plan/active/wave-e-acceptance-matrix.md`, merging the γ `origin/main`.** γ amended the
matrix (241 lines) at the old flat path while L2 had moved it to `active/`; git followed the rename
and conflicted on content. Resolved to **γ's side**, then re-swept for paths, per the brief's rule
(apply the move to the newest content). Verified: the file is byte-identical to
`origin/main:docs/plan/wave-e-acceptance-matrix.md` except for one rewritten cite.

γ also **minted a new file**, `wave-e-acceptance-matrix-part2.md`, at the old flat path. With no
counterpart on this branch there was nothing for git to rename, so it landed at `docs/plan/` and was
moved to `active/` by hand — likewise byte-identical to γ apart from two rewritten cites. Its row is
added to `docs/plan/index.md`, and the matrix's own row now describes the split.

γ's `docs/plan/active/wave-e-design-skeleton-part3.md` amendment auto-merged through the rename and
needed no path fixes. Its migration (`0057`) and the eight x57 test files came in clean; the test
headers got the path sweep, the migration did not (byte-stable by law).

The other four lane merges were clean. Ownership really was disjoint.

### C.2 Tracking proof (`git ls-files`)

```
.claude/rules/db-migrations.md
.claude/rules/runtime-workflows.md
.claude/settings.json
scripts/check-harness-links.mjs
scripts/check-harness-links.selftest.mjs
scripts/hooks/pinned-ids-guard-checks.mjs
scripts/hooks/pinned-ids-guard.mjs
scripts/hooks/pinned-ids-guard.selftest.mjs
```

All eight tracked; `git check-ignore -v .claude/settings.json` returns nothing.

### C.3 Reference sweep

- **Mechanical pass:** 184 references rewritten across 136 files, from a rename map built out of
  L2's own `git diff -M` output (so the map cannot drift from what actually moved). The γ merge
  added 10 more across 6 files (the amended matrix, the new part2, and the x57 test headers),
  which were authored against the pre-refactor tree.
- **Reverted out of that pass, deliberately:** the 130 files in `frozen-workflows.json` and
  `packages/db/deploy/*.sql`. The first sweep hit frozen workflow bodies and produced 15
  freeze-lint violations — comment-only, but a frozen body is byte-stable or it is not frozen.
  Deploy SQL is already-executed ceremony material, same class as the migrations.
- **Contextual pass by hand** (~40 sites): PROJECTLOG → `docs/adr/` (or `PROGRESS.md` where the
  cite was to PART 2, the open register), REBUILD-PLAN → `PROGRESS.md` / `docs/plan/index.md` /
  `docs/plan/completed/rebuild-plan-history.md` by context, and mentions of the now-deleted files
  de-backticked so they read as history rather than as a live path.
- **Real broken paths found and fixed** (pre-existing, not caused by this refactor):
  `docs/design/PRODUCT_DESIGN.md` pointed at `docs/DESIGN_SYSTEM.md` / `docs/FRONTEND.md`, which
  live under `docs/design/`; `docs/ops/DR.md` named nine files package-relative
  (`deploy/roles-bootstrap.sql`, `scripts/dr-verify.mjs`, …) that resolve only from
  `packages/db/` or `packages/backup/`; the reporting design named `lib/reconciler.mjs` for
  `packages/runtime/lib/reconciler.mjs`.

### C.4 `check-harness-links` — 458 → 0

STRICT is now `true`. The finding count fell in three stages, and the shape of what was left
matters more than the number:

| stage | findings | what moved |
|---|---|---|
| STRICT flip, pre-sweep | 458 | baseline |
| after the mechanical + contextual sweep | 402 (135 outside the archive trees) | stale paths gone |
| after the lint work below | 0 | |

**Only about 15% of the baseline was stale cross-references.** The rest was the backtick
heuristic firing on prose. Two changes, both inside the lint's own sanctioned mechanisms:

1. **Four structural rules narrowing the BACKTICK heuristic only** — explicit markdown links are
   untouched and must still resolve. A span is not a path candidate if it contains whitespace (a
   shell command, `GET /ready`, an SQL clause), or template/glob/expression metacharacters, or is
   an npm specifier (`@clara/db`), or is a slash-joined set of snake_case identifiers
   (`fy_end_month/day`).
   The last one rests on a property verified empirically at assembly, not assumed: **zero tracked
   paths in this repo have an underscore in any directory segment, and no extensionless tracked
   file has one either** — paths here are kebab-case, underscores are SQL/JS identifiers. So the
   rule cannot mask a real path, and `docs/adr` / `packages/db` stay fully checked.
2. **`HOP_CONTENT_EXEMPT_PREFIXES`** for `docs/plan/completed/`, `docs/plan/research/` and
   `docs/adr/0*` — 122 reached files. These are append-only or owner-ruled frozen, so a stale
   cite inside one cannot be repaired without rewriting a historical record; failing CI on them
   is a gate that can never legitimately go green. Their existence as reference *targets* is
   still validated, and `docs/adr/README.md` (an entry) stays fully checked, including its
   bidirectional index check.

Plus about 20 named `NON_PATH_ALLOWLIST` entries, each with a one-line reason.

**Genuinely dangling, recorded not fixed:** `RENUMBER.md` (the merge-time renumber procedure
minted by ADR-058), `algebra.md` (the metric-algebra research dossier behind lane δ) and
`INTERFACE-PINS.md` (the Wave-A pin sheet) were authored in build worktrees and never committed.
Nothing in the repo holds their content. The *laws* they encode do survive — RENUMBER's is
AGENTS.md hard constraint 10 plus ADR-058's own body. They are allowlisted with that provenance
rather than pointed anywhere false. `ci.yml` still cites RENUMBER §2(4) in six comments; left
alone, since the § clause has no home to point at either.

### C.5 Conflict audit

One contradiction, one gap, both fixed; the rest of the family was consistent.

- **CONTRADICTION (fixed).** `AGENTS.md:43` asserted *"A docs-only PR (zero code paths touched)
  takes the single-lane review; everything else takes the full ADR-061 ladder"* — while
  `AGENTS.md:123` said *"Review intensity is uniform (ADR-061): the full ladder for every
  substantive change"*, and ADR-061 itself records that tiering *"on instrument/UI/doc"* was
  proposed and **declined**. The phrase "single-lane review" appears nowhere else in the repo and
  no later ADR reinstates tiering, so this was introduced at L3, not inherited. It weakened a
  ruled safety posture, so it is rewritten to state the uniform ladder and to name what a
  docs-only diff actually shrinks: the CI job set, never the review.
- **GAP (fixed).** `scripts/hooks/pinned-ids-guard.selftest.mjs` ran in **no** gate — not in
  `pnpm lint`, not in `ci.yml`. The guard is judgement logic protecting two never-expiring safety
  pins, and CI cannot exercise a PreToolUse hook in situ, so the self-test was the only available
  protection and it was unwired. Added to `pnpm lint` and to the ci.yml harness-links step.
- **Stale assertions corrected:** the hook's own header claimed `.claude/settings.json` is
  gitignored and registration must be per-checkout (it is tracked now); its block-message
  provenance cited "CLAUDE.md PERMANENT SAFETY PINS" (CLAUDE.md is a one-line `@AGENTS.md` import
  now — retargeted to AGENTS.md hard constraint 11, and the self-test assertion with it);
  `ci.yml` still said STRICT=false and "flip it at assembly"; `README.md` called `CLAUDE.md` the
  full agent guide and described `pnpm lint` as "freeze-lint + leak-scan" (seven gates now);
  eight `apps/dashboard` modules cited "CLAUDE.md law" for the DB-owns-numbers invariant.
- **Checked, consistent, no finding:** reset scoping (`.claude/rules/db-migrations.md`,
  `packages/db/AGENTS.md`, `packages/db/README.md` all say `clara` schema only, never
  `workflow`/`graphile_worker`/`spike`) · state authority (AGENTS.md constraint 8, PROGRESS.md's
  header, and the ADR digest all name `PROGRESS.md`) · migration numbering and immutability ·
  workflow versioning · ceremony rules (main-pinned, D1 quiesce) · the model/dispatch law.

### C.6 Deliberately not done

- **The `docs/plan/completed/` and `docs/plan/research/` bodies were not edited** (owner-ruled
  exempt). Their internal sibling cites still name the pre-refactor flat `docs/plan/` tree and are
  now dangling *as history*. Only their index rows in `docs/plan/index.md` describe present
  reality. About 267 of the original lint findings lived here.
- **ADR bodies got the mechanical path sweep but no prose rewriting.** They are append-only.
- **`docs/audit/` untouched.** Its `docs/PROJECTLOG.md:90`-style cites are evidence about the
  **frozen prior repo**, not this one — ADR-033 there is a different decision than ADR-033 here.
  Rewriting them would have falsified audit evidence.
- **Migration `.sql` comments and `packages/db/deploy/*.sql` untouched** (byte-stable / executed).
- **The autopost-vendor-binding completed record** — L5 routed a `:129` → "§6 invariant 3" fix
  there, and flagged a pre-existing **§6a mis-cite** on the same line. Not touched: the file is a
  completed record. Both remain open for the owner if they want the record amended.
- **`README.md`'s inline status snapshot was replaced by a pointer to `PROGRESS.md`**, not
  updated. It claimed "2026-08-06 · 44 migrations (frontier 0045)", which is stale, and
  AGENTS.md constraint 8 makes `PROGRESS.md` the one home. Flagging rather than fixing the number,
  since the orchestrator owns the real posture.
- **`packages/db/README.md` and `packages/runtime/README.md` carry point-in-time
  migration-frontier and runtime-version pins** that will read stale against whatever posture goes
  into PROGRESS.md. The db README self-labels its ledger as a snapshot with the authoritative
  query beside it. Worth a look when the posture block is written.

### C.7 Recorded dissent — tracking `.claude/settings.json`

The orchestrator ruled that `.claude/settings.json` ships **tracked**, carrying only the
PreToolUse registration for `scripts/hooks/pinned-ids-guard.mjs`. That ruling **overrides the
L4 lane's own recommendation**, which is recorded here so the PR carries the alternative rather
than burying it.

**L4's position (from its `pinned-ids-guard.mjs` header at `7a81bea`, in substance):** the
registration *"is still necessarily local: merging a hooks.PreToolUse entry into settings.json is
a per-checkout act, not something a git commit alone can deliver, since settings.json itself
stays untracked by design."* L4 read the repo's `.claude/*` ignore block — which excepted only
`!.claude/skills/`, plus `!.claude/hooks/` as of its own branch — as a deliberate line rather
than an accident, framing it the way the harness framed itself: *skills are the tracked, shared
toolchain; settings and permissions are not.* On that reading L4 shipped the hook under
`scripts/hooks/` (tracked either way), documented the snippet in the header, and left the wiring
to each checkout. It also recorded, as measured fact, that no prior registration existed anywhere
it could have — not this worktree, not the main checkout's `settings.local.json`, not the
user-level `~/.claude/settings.json`, not any sibling refactor worktree — so its hook shipped as
the first registration of the guard.

**The ruling's grounds, which prevail:**

1. **The official convention is the opposite split.** `settings.json` is project-shared and
   checked in; `settings.local.json` is personal and gitignored. The blanket `.claude/*` ignore
   in this repo predates there being any shared setting worth committing — it is not a considered
   decision that shared settings should not exist.
2. **The owner's Q4 ruling requires the pins enforced MECHANICALLY on every checkout.** A manual
   per-checkout wiring step is captured-once-enforced-maybe, which is the exact failure shape the
   pins exist to prevent. L4's own measurement is the argument against its own conclusion: the
   guard had been authored and documented, and *no checkout anywhere had it registered.*

**What shipped:** `!.claude/settings.json` in the ignore block; a tracked `.claude/settings.json`
holding the hooks block and nothing else; and the header comment trued from "necessarily local"
to the convention, with the reversal stated on the record so it is not silently re-litigated.

Two things worth noting for the PR reader. L4's factual claim was correct at the time it was
written and is not overturned — only its conclusion is. And the assembly pass separately found
that the guard's self-test ran in **no gate at all** (C.5), which is the same failure class from
the other direction: an instrument that exists, is documented, and is enforced nowhere.
