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
