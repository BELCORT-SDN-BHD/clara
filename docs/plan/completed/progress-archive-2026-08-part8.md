# PROGRESS archive — 2026-08, part 8

*Opened on **2026-09-04**, at the final clock-out truing, because
[`progress-archive-2026-08-part7.md`](progress-archive-2026-08-part7.md) could not take two more
sections without breaching the repo's 500-line document ceiling — the same convention every earlier
part followed.*

*It holds the **whole `Backlog` section and the whole `Known issues` section of `PROGRESS.md` as
they stood immediately before the final truing**, moved BYTE-FOR-BYTE (md5s below, computed on both
sides of the move) and verified present here before `PROGRESS.md` lost them.*

**Why they moved, and where their content lives now.** 裁-185 (the owner's GO for a CLOSED beta) asked
for one complete list of every backlog item and known issue — backend, frontend, harness and ops — as
the handover for the next session, and 裁-150 made the repo that handover. That list is
[`beta-handover-2026-09-04.md`](../active/beta-handover-2026-09-04.md) and its
[part 2](../active/beta-handover-2026-09-04-part2.md), where **every still-open row below is carried
with an id, an owner, a next step, a size guess and a priority tier**, together with the ~50 rows the
beta-live walk added. `PROGRESS.md` keeps short rows pointing at those ids, per its own rule that it
is a state file and not a second copy of the detail.

**So this file is the PROVENANCE, not the queue.** Read the handover to know what is open; read here
to see exactly how a row was worded before 2026-09-04, or to recover a sentence the compression in
the handover did not carry.

---

## The `Backlog` section as it stood on 2026-09-04 (md5 `22d19d182cbf3b8a04c5ee0bafd65abc`)

## Backlog

Registered but not scheduled. Sources of record in brackets.

**THE OWNER'S PICK-LIST (裁-150, 2026-09-03) — read the eight rows below IN ORDER; everything after them is the standing registry, unordered.** After the beta-live e2e this session closes and there are no next lanes: the owner picks from here, and every row carries **owner · next step · ruling**. The order is the pre-上市 ROADMAP first (rows 1–2, because they are the only rows that gate 上市), then the two post-beta product PRs already RULED (rows 3–4, ready to dispatch as written), then the day's technical rows (5–8, each cheap and none beta-gating). A row that names no ruling is a lead-minted follow-up, not an owner decision.

1. **THE PRE-上市 ROADMAP — the ordered path from beta live to 官方上市 (裁-148 point 3, aligned with the owner 2026-09-03 ≈17:14; re-affirmed by 裁-150).** **Beta live** on the built half — agent-template legal texts and RM 0 — → **the pricing sitting** (裁-58, the ringgit amounts, still an open owner question) → **the billing TIER tranche** (裁-144, row 2 below) → **the LAWYER'S PASS** over the DPA, the beta terms and the consent text (裁-125: every beta legal text ships as an agent template and is refined with a lawyer at official launch, never darkened) → **the REAL-MONEY SWITCH: Stripe live mode + `CLARA_STRIPE_LIVEMODE` + KYB + the NON-ZERO checkout walk** (裁-125/126/148 — the walk that Wave-G no longer does) = **上市**. **Owner:** the owner, step by step. **Next step:** the pricing sitting, which everything downstream waits on. **Rulings:** 裁-58 · 125 · 126 · 144 · 148 · 150.
2. **THE BILLING TIER TRANCHE — designed since 2026-08-30, unbuilt, and due before the FIRST PAID MONTH (裁-144).** BUILT today: Checkout + webhook + the fail-closed admission gate + `clara.billing_plans` (`0163_checkout_gate_c3_folded_door.sql`, `amounts_ruled=false` → RM0/`trial`). UNBUILT: the rest of `docs/plan/active/billing-design.md` §5 PR-1 (price-config tables, client lifecycle states, seat capacity, the capacity walls) + all of PR-2 (the deterministic monthly invoice evaluator under constraint 2, invoices/invoice_lines, the issuance door) + **an AI usage LEDGER**, which is also **silent risk 49: AI is UNMETERED in beta** — no `ai_usage`/token ledger migration exists (measured: zero hits across `packages/db/migrations`), so the owner's OpenAI bill is bounded only by beta being invite-scale at RM0. The owner's own specification is filed verbatim at `docs/plan/active/billing-model-owner-spec-2026-09-03.md` beside the 08-30 design set. **Owner:** a post-beta DB+runtime lane, ≈6–10 lane-units. **Next step:** grill the spec against `billing-design.md` §5, then build the LEDGER and the lifecycle states FIRST so usage history exists from day one. **Ruling:** 裁-144 (and 裁-42/58 for the amounts).
3. **THE C-2 OPERATOR SCREEN — the Stripe problem-event queue has doors and no surface (裁-147).** `clara.list_stripe_event_problems(boolean)` and `clara.resolve_stripe_event_problem(uuid, text, text)` are live, granted and walled to an owner of the operator firm (`0160_checkout_gate_c2_stripe_events.sql`); a census over `apps` and `packages/runtime` returns **zero** callers, while the design promised a review surface. Until the screen exists the Wave-G checklist's manual line is the surface — at the walk and again at cutover the queue must read EMPTY of unresolved rows. **Owner:** the first post-beta UI lane (an `/admin` card at the operator floor, next to the unclaimed-payment queue `list_unconsumed_registration_payments`, which owes the same surface). **Next step:** build it after beta live; keep running the checklist line meanwhile. **Ruling:** 裁-147.
4. **THE POOL ERROR CONTRACT — the runtime dies on any idle-backend error (裁-149, option C).** `packages/runtime/lib/relay.mjs` attaches no `'error'` listener to `makePool()`'s pool or to the leader's `makeClient()` session, so pg turns a failover, a pooler restart or a maintenance kill into an `uncaughtException` and the process exits (Fly restarts it; durable runs resume). Ruled: the GENERAL pool gets a listener that logs, COUNTS and raises a health flag on `/ready`; the LEADER stays CRASH-LOUD because losing its session releases the advisory lock and a standby takes over — the designed failover; the behaviour is written as a CONTRACT in `docs/ARCHITECTURE.md`, per pool; every other `new Pool` in the runtime is censused in the same PR. **Owner:** a post-beta runtime lane, ≈0.5 lane-unit riding a v7x deploy. **Next step:** after beta live — today's fail-loud behaviour is safe. **Ruling:** 裁-149.
5. **THE DRAIN HELPER HAS NO ASSERTING CELL, and two kits still own a top-level `after()` (rev-534 N-B/N-4, merged by ruling without them).** `waitForBackendsClear` in `packages/db/tests/migrate-harness.mjs` cured the CI relay-teardown class (#534 `e7577af6`), but its two call sites only PRINT: gut the helper and every gate stays green. The cell is the reviewer's H1/H2/H3 — a planted straggler reds it (`cleared=false`, `remaining=1`, within the deadline), a closed pool clears in about a millisecond, an ended admin client returns rather than throwing — roughly 25 lines, home `packages/db/tests/migrate-harness-clone-guard.test.mjs`, plus a `@returns` line for the `remaining: -1` first-probe sentinel. Same PR: sweep `packages/runtime/tests/matcher-testkit.mjs` and `g1-wake-bodies.fixtures.mjs` to the ONE-TEARDOWN shape (a kit exports a plain close; the importer registers the single `after`). **Two older instrument carries ride here** (moved from the standing registry so one owner holds them): `packages/runtime/tests/relay-drain.test.mjs:74` sleeps 200 ms blind before asserting a NOTIFY payload arrived, on an every-PR suite — replace it with a bounded poll on the `g1-wake-engine.test.mjs:831` shape (the wider `sleep()`/`setTimeout()` settle-loop census, 18 db + 20 runtime files, is its own later sweep and is not claimed here) — and #518's D4, where the §3.0.2 ambiguity cell has never executed its assert because the deferred constraint fires on a different POOLED connection: the class is "a deferred-constraint assertion needs the same session", and every such cell needs the same read. **AND THE ESTATE LEG'S TWO CI-SHAPE DECISIONS, one line apart (rev-533 N-6, rev-534):** `.github/actions/db-estate-suite/action.yml:59` runs `pnpm -r --if-present test` **without `--no-bail`**, so a runtime red aborts before `packages/db` prints its totals and a red run carries **no positive evidence for the db half** — that cost real diagnosis time three times today; the same line runs `packages/db` and `packages/runtime` CONCURRENTLY against the one service cluster, which is the load that made the teardown race bite on 2-core runners, and `--workspace-concurrency=1` would make the leg deterministic and slower. **Owner:** the next db lane for the cells; a tiny CI PR for the action (they can be one PR or two). **Next step:** write the drain cell; add `--no-bail`, which is uncontroversial; decide the concurrency question with a measured before/after on the leg's wall time. State the suite's provenance in any body that quotes a pass count (Windows `spawnSync` cannot invoke a `.cmd` shim, so the run was WSL or a `PG_DUMP` override; 1925→1930). **Ruling:** none — review carries.
6. **HARNESS-LINKS' TWO REMAINING BLIND SPOTS, both post-beta (rev-527 RESIDUAL-1, rev-532 R-3).** (a) The **colon rule**: `file:line` citations are structurally skipped (`STRUCTURALLY_NOT_A_PATH_RE` contains `:`), so a `helpers.ts:9999` plant stays green even after #532 — the FILE half of a `path:line` span could be resolved by dropping the `:N` suffix, and the fix needs the selftest cell that drives the exported `main()`. (b) **Scope**: #532 widened the roots to every agent entry point, but the harness-menu READMEs (`apps/web/README.md`, `packages/db/README.md`, and this file's own menu rows) are still not content-scanned; widening there surfaces 22 findings across 9 roots — routes, a MIME type, LISTEN/NOTIFY, npm specifiers, template placeholders, a handful genuine — so it is its own triage PR, not a sprint item. **Owner:** a small checker PR after beta. **Next step:** (a) first; (b) only with the triage budget. **Ruling:** none — review carries (the D4 class).
7. **PROSE FROZEN AT A SUPERSEDED FACT — three riders, none mechanical, each judged by what it NAMES.** (a) **Fifteen citations of `0161`** meaning C-3's auth-wall role pair — which is now `0163` — across eight files under `packages/runtime/` (#511 merged after the renumber with its prose frozen); a docs-shaped edit inside runtime files scores CODE under the CI classifier, so it rides the next runtime PR rather than a truing. (b) **Five ACTIVE plan docs still say "six cadence gates / six daily belts"** — `bank-agency-survey.md:79-81`, `tax-prep-wake-annexes.md:235-237`, `tax-prep-wake-design.md:58-60`, `close-key-1-design.md:85`, `close-key-1-annexes-2-record.md:282` — while after #533 the leader exports FIVE `*Due` predicates and the reconciler runs FOUR daily belts; a "(historical count; see ARCHITECTURE §2.2)" rider on each, never a re-guess. (c) The runtime README's **pointer chain terminates at a STATE sentence** rather than the law it demonstrates: after #531 and #533 both pointers land on the chatTurn bullet, which now states "VERSION 71", while the law-shaped sentence survives at `packages/runtime/README.md:182` — re-point one pointer, or add four words to the bullet. **Owner:** whichever lane next opens those files. **Next step:** ride, never a dedicated PR. **Ruling:** none — 裁-108's citation-truing discipline applied after the fact.
8. **THE OWNER'S OWN OPEN ACTS, carried here so the pick-list is complete.** The two `clarabook-frontend` recut PRs — the 裁-64② token recut and the R3 §9 focus-ring founder amendment — are the owner's to open in the DESIGN-AUTHORITY repo, and the ClaraBook design law drifts from this repo until they land; DS-07's control height is an owner DECISION, not a lane's (FS-9's record). **Owner:** the owner. **Next step:** a launch-sitting item; none of it is beta-gating. **Rulings:** 裁-64② · R3 §9 · FS-9's sign-off record.

- **OPS.x — deployed parts-version hold (minted by PR #454 round 4):** CI now proves
  `reader ⊇ emittable` inside one commit, but that cannot prove the web version already deployed is
  at least the runtime version about to ship. A separate ops/CI PR must have the deployed web
  publish a catalog/version stamp and make the runtime deploy read and compare it before rollout.
  Until then, same-commit parity is a build gate, not the deploy-ordering hold. **Round 6 hardened that build
  instrument fail-closed:** exact AST-site exemptions match once; mutable computed keys, every unreviewed
  spread, unknown literal kind and unsupported declaration form throws; declarations come from the TypeScript
  AST rather than regex. *(TRUED at the 2026-08-31 merge: #459's 26-kind reader is on main, and the
  standalone gate was re-proven GREEN there — RED at the 22-kind historical reader — by the #454
  fresh review.)*

**Fact-truing additions, 2026-08-31:**
- **Frontier apply order:** `0154` applies inside 裁-18b PR-3's combined D1 window; `0155` applies only after the Wave-G factory reset (裁-45/裁-67), never by surgical delete or a weakened mechanism.
- **P4-7 magiclink arm (裁-65):** no order or branch exists; #455 correctly keeps the fail-closed 409 until it lands.
- **FS-0 census residual (2026-08-31):** the row-bound names and 8 NO-HOME dispositions live in `docs/plan/active/verb-coverage-census-2026-08-31.md` (§row-bound · §NO HOME) — capabilities (`grant/revoke_firm_capability`), `set_turnover_classification` (裁-80 note at P6-T), client-alias hygiene (`add/retire_client_alias`), `record_client_fact` (FS-5 rung-0 decides); ~~`set_firm_high_stakes_threshold`~~ **CLOSES WITH #489** (裁-97, built, armed BEHIND) · ~~`verify_snapshot`~~ **CLOSE** (裁-98, runbook `docs/ops/DR.md` §11); each gets its FS-8 note or ruling, none is silent.
- **Four standing owed items, each with its source of record, folded onto one line 2026-09-03 for the cap (no content dropped):** the **F-A7b FIRM-side setup interview** (`docs/adr/0074-annex-a-mechanisms.md:131`) · **external `/ready` uptime/alerting wiring** (`docs/ops/DR.md`) · the **CI synthetic-canary seed** (`docs/ops/DR-full-drill.md`) · the **`/ready` HA decision** — keep the ruled hard storage gate on one machine or fund two-machine HA, the current single-machine blast radius being recorded under Known issues.
- **CI gitleaks push scan:** ~~persistent runner clones retain refs/remotes/pull/*~~ **RETIRED by 裁-135/#516** — every job now runs on a fresh single-tenant VM and the checkout action fetches branches and tags plus at most this PR's own merge ref, with `--prune` (measured in the lint job's own log). **What is still live:** the push arm is UNSCOPED — `--log-opts "--diff-merges=first-parent --all"` in `.github/actions/lint-suite/action.yml` scans every fetched branch, and scoping it is a coverage trade the file's own comment states (dropping `--all` shrinks the scan to HEAD's own ancestry).
- **Cross-package parts parity — the FIELD-level test is still owed** (re-measured 2026-08-31 after a premature closure): #454 shipped a **kind-coverage** gate, not a field one — `packages/runtime/scripts/check-parts-parity.mjs:366` takes only `declaredPartShapes(...).keys()` (the field arrays `part-shapes.mjs` extracts are discarded) and `readerPartKinds` reads only each union member's `type` discriminant, so a dropped, renamed or mistyped FIELD in `apps/web/lib/parts/types.ts` still passes. The v16 shapes were verified field-by-field ONCE, by the #454 review's own AST comparator — a one-time read, never a standing gate.
- **Document refusal copy:** `apps/web/components/documents/document-filings-history.tsx` lacks `refused_concurrency`, and `apps/web/lib/documents/doors.ts` still carries stale `refused_budget` prose.
- **COA PR-d:** Annex G's admin editor over `0150`'s nine COA doors has no train (`docs/plan/active/coa-template-annexes.md`).
- **COA PR-c's trim half is PARKED under the beta pivot (裁-79/裁-80):** `wake_propose_coa_template_trim`, its allowlist row and the receipt write (`coa-template-annexes.md:344`) are unbuilt and not scheduled — the 2026-08-31 pivot admits only 裁-77's named backend list, and this verb is not on it. #463 re-scoped to carry only D-7's
  interview-consumption half (`clientOnboarding_v4`); law 28's mandatory cross-model adversarial pass (`coa-template-gate-record.md:439`, the injection surface of model-proposed family names) attaches to this verb WHEN it is built post-beta, not to #463.
- **Service periods:** `record_document_service_period` plus the `document_service_periods` read (live since `0140`) have no apps/web home; the FE residual table names the owed NotBuiltNote.
- **Binding corrections/visibility:** `0154`'s `decline_vendor_identity_binding`, `reset_binding_decline`, `eligible_binding_signer_count`, and `binding_identity_review` are merged-not-live and have no frontend home.
- **Counterparty hygiene panel:** one PR on `apps/web/components/registers/counterparty-hygiene-panel.tsx` must wire `counterparty_aliases_visible` + `counterparty_merges` and add `merge_id` to `MergeCounterpartiesResult` (`docs/plan/active/fe-train-plan-2026-08-30.md` §4).
- **裁-12 retirement:** `create_account_set_v1` gets its own migration, never bundled with `get_journal_entry`'s retirement.
- **裁-64① rate-wall design sitting:** unscheduled; P4-D refuses to start without the server-courier-vs-edge decision.

- **The e2e re-render DR drill stays UNRUN until the first sealed artifact** (`docs/ops/DR-render.md`; TA-P14 schedules it before N3) — the forward obligation carried inline from the archived render-deployment bullet (part7), per the archive law.

**The standing follow-up ledger (09-01-pm ledger, `mohe-grill-rulings-2026-09-01-pm.md:409-417`) — ten items, none blocks beta:**
- The 756-site / 88-file `settleUntil` fixed-iteration sweep, helper hoisted to a shared test/hookHarness.ts (future file) first (#491's corrected census — the original estimate was 20× low). (09-01-pm ledger, standing follow-up)
- Freeze-lint drift guard refusing tests/-path registrations (the #485 M1 class). (09-01-pm ledger, standing follow-up)
- p4t2-registration's actor-scoped audit count (the last schema-wide census, #482 reviewer NIT-3). (09-01-pm ledger, standing follow-up)
- A gate binding a11y shadows to their real pages + a tree→registry ⌘K cell (#453 reviewer's class note). (09-01-pm ledger, standing follow-up)
- `components/reports/DoorDialog.tsx:90`'s identical close-polarity bypass. (09-01-pm ledger, standing follow-up)
- C-5's order items: the projector's nested-PII strip wall (裁-91's containment half), the webhook route surfacing rejected events loudly (never 200-and-drop), C-2's `constraint_name` re-raise hazard if a second unique is ever added. (09-01-pm ledger, standing follow-up)
- `coa_chart_apply`'s checklist row gap (from FS-5 scouting). (09-01-pm ledger, standing follow-up)
- The wave-g checklist's confirm-template line, re-pointed to the 裁-92 OTP form (located by the C-3 driver). (09-01-pm ledger, standing follow-up)
- `_close_wake_ctx`'s CLR11 rung reachability via the credential-pin path — a hypothesis, not yet measured; a dedicated pass is owed. (09-01-pm ledger, standing follow-up)
- #488's `page.tsx` 900s clamp, to be trued to C-3's real window. (09-01-pm ledger, standing follow-up)

- **Route-Handler `Vary` follow-up (from #499, non-gating).** Next 16.3.3's App Router REPLACES middleware's `Vary` on Route Handler responses (curl cross-checked at the Playwright leg). #499 pins observed reality plus an honest residual; the durable fix is a route-level `headers()` declaration. The primary control — `Cache-Control: private, no-store` from `applyAuthState` — IS delivered and e2e-pinned.
- **裁-110 · RESERVED — the cross-package test-guard proposal, PENDING owner presentation and NOT YET IN ANY LEDGER** (git grep 裁-110 over main = zero files; the 09-01-pm ledger jumps 109→111). The incident family it answers: the cross-package shared-DB test class fixed piecewise across #482/#485/#497/#498/#501. The full proposal must be AUTHORED INTO the ledger before the owner sitting; until then this row is its only record.
- **harness-links: 706 references resolve by UNIQUE BASENAME, not a written path** (measured 2026-09-02 at main `4a0e80b2`: 706 of 3635 validated refs across 203 files, 0 broken — the truing PR's own docs raise it slightly). Non-blocking; the durable fix is authoring real paths at each site.
- **UI-only residuals on live verbs (no backend gap):** bank — `resolve_and_book_bank_line`'s matched_booking/settlement leg + `get_bank_reconciliation`'s full snapshot view unwired (`apps/web/components/bank/{exceptions,reconciliation}-section.tsx`); reports — `ExportRecipientsPanel`'s external-recipient covered_clients form (`kind='external'` arm of `register_export_recipient`) not built.
- **`revoke_invite`'s asymmetric lock order** (#482 round-3 NIT-A): takes only the invite-row lock, not the firm lock first — a narrow non-widening race window; the named safe fix (`FOR UPDATE` on the actor's own membership row) rides a later db train.
- **The lawyer-reviewed DPA text is owed at LAUNCH** (#478 item 3, 裁-90): beta ships the placeholder body; the real text publishes as a NEW version row in the versioned store — zero code change.
- **Q5 i18n hardcoded-string lint ban still owed** (`apps/web/README.md:87-88`'s own promise, "once product screens land" — they have landed).
- **check-harness-links `NON_PATH_ALLOWLIST` — ~~four stale-permissive entries~~ **DONE by #506 `18aba67d`** (6 deletions from the checker). **The one residual:** its `frozen-evaluators.json` exemption still calls that file "(unbuilt)" although it is tracked at the repo root. Rides FS-12 (the harness-truings code PR), a CODE change, not this docs PR.

**THE DEBT-CLEARING SPRINT IS NEXT (owner mandate, 2026-08-24): everything except full Track B clears in the 磨合 window.** W2/W3 ladder items (2026-08-25), the forward-obligations block and the F-A5b/W4 items below ride it:
- **The two owner-excepted-door verdicts owed since `port-wave-plan-2026-08-28.md:82` — MEASURED 2026-08-30, not deferred further (mohe-alignment-audit-2026-08-29.md R-3):**
  - **`get_journal_entry` (single-arg, `0004:716`)** — grant to `clara_authenticated` stands, untouched since creation; the `clara_agent_ro` grant was revoked at `0009_coding_floor.sql:2885` in favour of the client-scoped `get_journal_entry_for` (`0011`), which every live `chatTurn` tool set (through `v15`) calls instead — `get_journal_entry` itself is registered as a tool nowhere in `v2`..`v15`'s tool files and has zero frontend call sites. **Disposition: RETIRE, as its OWN migration — do NOT bundle with 裁-12's `create_account_set_v1` retirement.** The two doors are functionally unrelated (report-metric account sets vs. a superseded single-arg journal read) and were named as two SEPARATE owner exceptions, not one; coupling them into one D1 window buys nothing and only entangles two independent rollbacks.
  - **`record_notification` / `wake_record_notification` (`0004:509,654`) — "verify-then-decide" verdict.** Measured: both doors are live, correctly audited (`_record_notification_core`, `0005:819`, inserts into `clara.notifications` and appends a `notification.recorded` event), but have **zero callers anywhere in the product** — no `chatTurn` tool file (`v1`..`v15`) ever registers either name, and no frontend file references `record_notification` at all. `clara.notifications` itself has **no `_visible` view and no frontend read path** — the table is write-only from the product's perspective today, though other migrations (`0007`,`0009`,`0015`-`0017`,`0027`,`0125`,`0131`) insert into it for their own purposes, so the table is not itself dead. **Disposition: KEEP AS-IS, no UI home yet.** The generic notification log is plausible future substrate (a firm-wide activity/notification feed), but no journey currently names it as its destination; opening a UI home is a product-scope question for a later wave, not a retirement candidate — recorded here so the "verify-then-decide" ledger line closes with a verdict rather than staying open indefinitely.
- **π-E1's `betaLanded` check is SELF-REFERENTIAL** (blind at n ∈ {0,6}) — gate on the
  `schema_migrations` stem like `wb-0020`'s idiom; covered twice already, not a hole.
- **N1** — `fa5-pr3-real-seal-drill.mjs` has no CI leg, decision item: weekly sweep or not. **N2** — the drill and F-A5 PR-1 cell D can't share a database (one-way evaluator flip). **N3** — no cell for "human archives `signed_original` on an agent-prepared run"; shipped
  behaviour measured correct, candidate cell for a future touch. · ~~F-A5/PR-3 scanner nit~~ **MOOT** (its checker script was deleted by `0118`). · **Wiki-lint's unprovable-kind waiver is function-wide, not per-target** (Codex B4 on F-A4 PR-1b) — harden it.

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
- **ClaraBook resource-audit residuals (2026-08-28, `docs/plan/active/clarabook-resource-audit-2026-08-28.md`)** — RULED 裁-13 (WCAG 2.2 target-size gate, P6) · RULED 裁-14 (Clara mascot, P6) · only the Mobbin flow-video viewing pass remains open (裁-4 7d).
- **Gate-record OQ long tail (audited 2026-08-26)** — carried, not yet ruled: F-T1 OQ-1/2/3/5/6/7/8/9/10 · F-A4 OQ-1..6 · F-T3 OQ-2/3/9 · F-A8 OI-1 · F-A7 gate §5 item 3 (dual-attribution severance) · F-A9 TA-P13-OQ-2/4 · fix-queue's claims-auto-post widening trigger · bank-agency OQ-8's later-relation question · reporting-agency OQ-4 + P12 · freeform OQ-A — one row, pointers only.
- **Small unrecorded follow-ups (audit 2026-08-26)** — wb-o's AMB-11 adjudication request (`docs/plan/research/wave-b/0017-ambiguity-adjudications.md`) · the metering `firm_usage_daily`/`task_usage` read-drop follow-up (`docs/plan/active/metering-survey.md`, design §3.9 — PR-1 only stops reading them) · per-rung friendly-message table · the wake cancel re-read landed in `bankAgent.v1`/`closePrep.v1`, but the DB-side status-predicated CAS settle remains with G1 PR-2.
- **Dated-tripwire class, seen 3×** (f-a2 witness v2 08-21 · #352's closed-wave floor · B5.4) — pin the monotonic DIRECTION, never a ceremony-state; a trued pin proves both ways; sweep for a candidate at every ceremony. Same-audit reviewer items: `--lock-deployed` is BLANKET (stamps every non-`true` entry — run only when every dark entry is genuinely deployed; a scoped `--only` flag would be its own PR, none exists today) · the D-a window (08-24) has NO as-run document · the `frozen-evaluators.json` `evaluate_fs_pack_agent_v1` migration-path one-liner is fixed in this PR (see M1).
**Owner rulings from the harness-audit sitting (2026-08-26)** — full text `docs/plan/active/harness-audit-rulings-2026-08-26.md`, one section per card:
- **R1 — the judgement-confidence conjunct drop**: a future migration removes `assert_client_resolved`'s `confidence>=0.95` conjunct for `method='judgement'` rows (full ladder); until then it's a harmless failsafe (judgement rows mint at 1.0).
- **R8c — the pricing-amounts sitting**: SHAPE superseded by 裁-42 (per-firm base + paid seats + shared AI allowance + Active-Client slots + proration, configurable); amounts remain open, RM-denominated (裁-50), every plan RM0/`trial` until the sitting (裁-58).
- **R9 — PITR HOLD**: deferred again; trigger = the beta-prep checklist. (R9's storage-probe half ships in 磨合 — Next item 1.)
- **Tier-A raises leave NO durable trace** (no receipt, no audit row — design-consistent,
  conductor-closed with reviewer concurrence) — an OBSERVABILITY gap candidate, not a wall gap.
- **F-A3 PR-3/C2's per-subject-account digest-binding is NOT implemented, for ANY of the
  thirteen agent bank cores** (Codex's final leg re-probed after the third round's PR-body note
  claimed "3 of 13 trivially derivable" — false on re-measurement, corrected: none of the
  thirteen carries a directly-named bank-account-id parameter). Only task-binding shipped.
  Closes the cross-task staleness leak; the narrower same-task cross-account leak stays open.
  **Acceptance criteria to close it, registered as `bank-agency-annexes-2-record.md` Annex K
  A33** (not merely this line): a derivation path per core, a subject-binding parameter on
  `_agent_verify_inputs_digest`, and a same-task cross-account negative cell per derivable core.
  *(F-A3 PR-3 review rounds 3-4, 2026-08-25, PR #343.)*
- **The autonomous `bank_agent` driver, when built, must mint op_keys that either carry
  `taskId` at colon-field 2 (chatTurn_v14's own `bank-{verb}:{taskId}:{segment}:{payload}`
  shape) or contain no colons at all** — `_agent_verify_inputs_digest`'s C2 task-binding falls
  back to the original client+digest-only check only when the op_key carries NO parseable task
  field; an op_key with SOME colons but a wrong/absent task in field 2 would silently change the
  binding for that lane. Today's autonomous-lane test fixtures use `opk()`'s underscore-joined
  shape, which carries no colons and is safe. *(Same round.)*

**Unowned gaps found by the 2026-08-23 alignment scan — now OWNED** (each was real work with no home;
the owner is named so none of them drifts back into nobody's queue):
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

- **`/ready`'s storage write probe (follow-up (a)) LANDED — TRUED 2026-08-30, was "carries NO storage check at all" (stale, that read was 2026-08-23).** `checkReadiness()` now wires `storageProbeHealth()` into `checks.storage` (`packages/runtime/lib/health.mjs:302-316`) and is **WARN-only as shipped today**. **裁-61 ruled a hard readiness failure; #460 is mid-review.** With one non-HA Fly machine (`packages/runtime/fly.toml`), the hard gate makes a storage outage a whole-runtime outage (chat, turns, SSE, interviews and reports), not only an upload outage with unit coverage in `packages/runtime/tests/storage-probe.test.mjs` (exercises the probe's own round trip against `storage.mjs`'s test shims; `checks.storage`'s presence is pinned in `ready.test.mjs`'s rig-gated cell). The other two of the incident's three named follow-ups (`docs/ops/incident-2026-07-26-intake-storage.md:249-261`) remain open: (b) a permanent CI battery over the storage-**grant** surface — still measured absent, since the landed test exercises the probe mechanism, not the live Supabase grant/policy surface itself, which stays applied by ceremony rather than migration — and (c) the storage-role re-examination. Their cost still lands hardest in beta, when a silent grant-surface regression means a real client's uploads fail while the service reports healthy.
- **MBB-7(b) — five legacy `trigger_kind='wake_task'` credential-uuid writer sites, confirmed live by the 2026-08-30 census** (`mohe-alignment-audit-2026-08-29.md:571` originally found three; two more since counted): `wake_file_document` (`0126:1532`), `wake_open_firm_question` (`0126:1580`), `wake_reattribute_document` (`0126:1796`), `wake_propose_filing_correction` (`0126:1922`), and `wake_propose_client_onboarding` (LIVE body `0143:642`, recut from `0142:491`) all stamp the wake **credential's** uuid as `trigger_id` where the `0103:274` contract means a task/turn id — beta-era, a fixed cost, **not** a live-data risk (the audit's own recommendation: mint the `wake_credential` trigger_kind before 裁-18b's ninth receipt-table member spreads the same pattern further).

- **The archived backend queue (裁-123, 2026-09-02) — #447 (BS-2 kind wall) · #448 (BS-3 unique violation) · #452 (binding PR-3) · #456 (G1 PR-2a DB) · #449 (G1 PR-2b runtime) · #460 (`/ready` hard storage gate, 裁-61).** Each branch carries its round as a WIP commit, each closed PR carries a resume note (what the round was, its verify bar, the rig it needs), and `docs/plan/active/archive-parked-lanes-2026-09-02.md` maps them (refs, comments, what could not be removed). **Re-integration is post-beta, one lane each, from the resume note — never from memory**; #460's 裁-61 ruling (hard readiness failure) still stands and re-opens with it.
- **Owner-batch 91b / 94 / 96 / 97 and item 84 — post-beta, RULED 裁-127 (2026-09-02):** 91b the compat-door drain horizon · 94 the bank-agent cadence (1 h) · 96 the supersession pointer in the frozen Slice-4 contract · 97 section-only MSIC families (the interim fail-closed default stands; the client-onboarding interview's own standard-chart step is 裁-128's button, not this item) · 84 per the owner-batch list's own text. Each gets its sitting after beta live.
- **⌘K is NOT rank-shaped** (#504 review, recorded as a deliberate gap): the palette lists routes the caller's rank cannot open; the nav registry's floors are the wall, the route's own door the second. Post-beta: derive the Go list from the same registry. Same family: **the firm-threads switcher** (裁-117 — one thread per altitude is the beta shape; a small "firm threads" list later).
- **Runtime SSE re-authorisation on the poll tick** (裁-120 B-M3: `assertTaskStreamAccess` runs once at open; a removed member keeps the live transcript for up to 30 min) — folded into C-5's order; this row is its home if C-5 lands without it.
- **`livemode` is stored but never read** (裁-120 A-M5): C-5's webhook route gates on `CLARA_STRIPE_LIVEMODE` (fail-closed when unset); the live flip at the pricing sitting must include that env change and a re-run of the sandbox round trip against the live account.
- **A paid applicant who joined another firm strands their payment** (裁-120 A-M4): #493's fold adds the operator read `list_unconsumed_registration_payments()`; the operator SURFACE that lists it (an `/admin` registrations card, operator floor) is owed at P6/FS-10 — until then the read is reachable by the operator owner through the audited SQL door only.

- **The dashboard→web capability diff's five post-beta drops (裁-121①, record `docs/plan/active/dashboard-web-capability-diff-2026-09-02.md`; the other two were ruled IN by 裁-130):** (1) `remap_bank_account_coa` is built and tested but no web control calls it · (2) adjustment templates' `p_replaces` (supersede) and `p_schedule` (amortisation) are hardcoded null from the web · (3) the onboarding plan's append-only revision history has no web read · (4) the document-tied deterministic opening-balance parse path is unreachable (every seed hardcoded to skip it — manual opening balances through the shared money input still work; a client carrying forward existing books pays in typing, not correctness) · (5) the chat session list / switcher (裁-117's row above). Each is an honest-note candidate on its surface until built.
- **The beta terms (裁-129) follow-ups:** the `kind` discriminator on the DPA document store + the per-kind partial unique index (additive, unnumbered until merge prep, its own RED-before cell) ride the next DB PR touching the store; `sign_dpa`'s carrier gains `kind`; the signup step presents BOTH documents with their own byte-identity hashes (裁-90 extends to the terms); §10.3's RM 5,000 floor and the 27 `[LAWYER]` / 34 `[verify]` markers are the launch sitting's list — never darkened for beta (裁-125).
- **A lint gate for the two duplicate-scanner classes (2026-09-02, the class bit TWICE in one day):** lift the raw-text duplicate-sibling-key scanner and the duplicate-JSX-attribute scanner into `apps/web/scripts/` as a build gate, each shipping its own positive control. The reason travels with them: `JSON.parse` keeps the LAST of two sibling keys, so a value-level `apps/web/messages/en.json` diff can never see a duplicate (#507 + #508 independently added `Clara.thread.composerLabel`, main carried both, #514 removed one), and two sides adding the same `aria-label` line merge into two attributes with no conflict marker. A read-only sweep of main at `803bdf98` found exactly one such key and zero duplicate attributes across 384 files, both instruments positive-controlled — so this is cheap prevention, not a backlog of known defects.
- **Bump the three Node-20 GitHub Actions (#516 LOW-3):** the checkout, setup-node and pnpm/action-setup actions target the deprecated Node 20 action runtime and are being force-run on Node 24. Pre-existing and warning-only, but on hosted runners GitHub decides when the fallback ends — a small CI PR before that date.
- **The checkout/webhook DB follow-ups, all before the real-money switch (裁-57 paid launch):** (1) the deploy postverify guard `packages/db/deploy/extraction-slice-0022-postverify.sql:165-167` iterates a HARDCODED role list that omits all four new checkout-gate roles, so the "no machine role gains `clara_authenticated`'s reach" wall does not cover them by construction — derive the list from the catalog as `0154`'s census does, or add the four; (2) a durable trace for a DOOR refusal on the webhook path — `stripe_event_problems.event_id` references `stripe_events`, so a refused event stores nothing today; the filed shape is a NEW sibling relation `clara.stripe_event_refusals` (event_id text, deliberately NOT an FK, append-only, owner-only forced RLS) written by ONE new SECURITY DEFINER verb granted to `clara_stripe_webhook` and called from the route's CLR10/23514 arm before the 400, NOT a nullable FK (that FK is a merged C-2 wall). Cost stated: the webhook role goes 2→3 executable routines, which reds `c2.8`, `0160`'s fail-closed tail and `c5db.6` — the follow-up updates those pins deliberately. (3) **The RM0 relaxation's forward hazard:** with `payment_status` NULL the applier does NOT file `payment_not_settled` today (the RM0 disjunct passes it as a legal `no_payment_required`) — harmless at RM0, but when 裁-58/裁-28's relaxation tightens to proof of settled payment, **a NULLed `payment_status` must be treated as NOT settled**.
- **Ungated destructive test helpers — a census, and one spelling of the clone idiom:** every `CREATE DATABASE` / `DROP DATABASE` / `DROP ROLE` under `packages/*/tests` must pass a guard; `assertDestructiveAllowed()` is called only by five top-level scripts today, and the two known raw-superuser sites are #485's inline copy in `packages/runtime/tests/fs7-v17-chatturn-db.test.mjs` and #498's `cloneAmbientDatabase()` in `packages/db/tests/migrate-harness.mjs` (blast radius is bounded — each drops only its own minted name — but a live-cluster env would dump the live estate into a sibling database with nothing refusing). Same row: point the inline copy at the shared helper so the idiom has ONE spelling.
- **Post-beta UI rows ruled 2026-09-02:** streaming provisional reply text (裁-132 — beta ships the settled-only thread plus an honest progress indicator; the provisional-vs-settled rule is the design question) · **a parked clarify does not survive a page reload** (`activeTaskId` is in-memory; 裁-132's own alignment paragraph orders the read-path decision to the P6-5 train — mirror the dashboard's task-list poll, or read `agent_interruptions` on mount) · the (firm)/(full) route error boundaries have a browser proof only on the (entry) one (a text pin plus the shared component's test carry the rest) · the password-reset page's precondition is "a session", not "a recovery session" — tightening it needs the amr/aal claim `resolveServerSession` does not surface today.
- **`ApplyStandardChartControl`'s first-read-failure arm is uncelled** (found by rev-p6-5): it is the stranded-loading shape #519 retired in `ClaraThreadView` one component over — a first read that fails leaves the control in a state no cell covers. Cheap, and the next lane with that file open should cell it rather than mint a train for it.
- **Three FS-9 conformance residuals that owed an ADR-0075 §6 home and had none** (measured 2026-09-03: zero hits outside the record; each points at `clarabook-conformance-pass-3-2026-09-02.md`'s banner). **DS-07 — the control-height question is an OWNER DECISION, not a lane's:** no `--control-*` token exists in `apps/web` at all; `apps/web/components/ui/button.tsx:61-66` ships four heights (`h-6`/`h-7`/`h-8`/`h-9` = 24/28/32/36) and `apps/web/components/ui/input.tsx:12` ships one control height (`h-8` = 32 — its other `h-6` is the `file:` pseudo-element, not the control), while the design repo's token contract §5.2 says 32/36/40. Upstream-inherited, so the question is **which artifact is authoritative**, and it belongs beside the two `clarabook-frontend` recut PRs at the launch sitting — **not beta-gating** (裁-13 passes at 24px). **DS-09 — per-field validation association:** 2 rendered `aria-invalid={…}` sites (`apps/web/components/common/money-input.tsx:113`, `apps/web/components/reports/ArtifactRow.tsx:184`) against **70** `confirmDisabled=` occurrences across **49** files — count the file, never this line. **DS-15 — the five self-declared "PORT DRIFT, CONFORMED" recuts** in `apps/web/app/globals.css` carry no 裁/R/Q number: a governance-hygiene gap, not a defect in the values themselves.
- **⌘K cannot reach a client BY NAME from firm altitude — post-beta, and ordered nowhere** (FS-9's record, IA-15). `CLIENT_ROUTES` render only once the URL already resolves a `clientId`, and no row indexes client names, so ⌘K reaches the register itself (`clientRegister`, `apps/web/lib/command/routes.ts`) but never a named client — it is not "one way in, from anywhere" for the client register. 裁-37 governs the "Do" half into P6-5; **this reachability half has no order anywhere**, which is exactly why ADR-0075 §6 requires it to sit here rather than only in a record.

---

## The `Known issues` section as it stood on 2026-09-04 (md5 `62bd0d89ecced1114e81a66a47ce2e48`)

## Known issues

- **RISK 50 — THE MAIL GATE: transport PROVEN, the signup-code arm NOT CERTIFIED (裁-146; the launch-blocking half is retired).** Supabase's DEFAULT mailer delivers only to the project's organisation-team addresses (*Email address not authorized*), at 2 messages/hour, with no SLA — so with it no outside beta user could finish signup, and the failure is invisible from the app because `supabase.auth.signUp` resolves normally and the UI paints "check your email". **MEASURED:** the owner configured custom SMTP at ≈16:08 MYT 2026-09-03 (Enable custom SMTP ON, host smtp.resend.com, sender no-reply@mail.clarabook.com, name Clara; port/username/password below the screenshot's fold and NOT read back), and at ≈16:55 a Supabase *Invite user* mail sent through it arrived at a private address OUTSIDE the team — **the Invite-user template arm, not the signup-code arm**, so transport and sender identity are proven and nothing more. **REPORTED, not measured (裁-112) at ≈17:00, words only:** the test user deleted, the Rate Limits raise applied — **the raised value was not stated, so no number is recorded anywhere: unknown, not merely unverified** — and the *Confirm signup* template confirmed to carry `{{ .Token }}`. **Owner:** the owner for the acts, the walk for the proof. **Next step:** at the Wave-G walk, read all three back through the Management API and send a REAL /signup confirmation code to a NON-team address; "Mail" certifies only then, and the checklist's two proof-bearing boxes stay OPEN until it does. **Ruling:** 裁-146.
- **THE RUNTIME DIES ON ANY IDLE-BACKEND ERROR — RULED 裁-149, SCHEDULED AFTER BETA.** `packages/runtime/lib/relay.mjs` attaches no `'error'` listener to `makePool()`'s pool or to the leader's `makeClient()` session, so pg's contract turns a failover, a pooler restart or a maintenance kill into an `uncaughtException`: the process exits, Fly restarts it, durable runs resume by design. It is a real availability hazard and it is also, today, SAFE — fail-loud, never silent. The fix is ruled (general pool logs + counts + a `/ready` health flag; the leader stays crash-loud so its lost advisory lock fails over) and sits at Backlog pick-list row 4. Found by rev-534 while settling the CI teardown class, whose TEST-side cure merged as #534 `e7577af6`. **Owner:** a post-beta runtime lane. **Next step:** nothing before beta live. **Ruling:** 裁-149.
- **THREE DOCUMENTS ARE AT OR ONE LINE FROM THE 500-LINE CEILING, which is a WRITE-BLOCKING PreToolUse hook and not a CI gate** — measured on this tree: `PROGRESS.md` and `docs/adr/README.md` after this truing's two splits, `docs/plan/active/checkout-gate-design-part2.md` at exactly 500 after 裁-147's re-point, and `docs/plan/active/mohe-grill-rulings-2026-09-03.md` climbing. A 501st line is REFUSED at the write, so the next writer of any of them **archives or splits before it adds** — the digest's rows now live in `docs/adr/README-rulings-2026-09.md` and §C's 09-02 clauses in `frontend-sprint-handoff-2026-08-31-orders-c-archive-2026-09-02.md`, both moved byte-for-byte, and `PROGRESS.md`'s own overflow goes to `docs/plan/completed/progress-archive-2026-08-part7.md` (part8 when part7 fills). **Owner:** the final clock-out truing, first. **Next step:** archive before add — this truing moved fifteen lines to make room and still landed within a handful of the cap. **Ruling:** none — a mechanical constraint, recorded so it never surprises a lane mid-write.
- **Two load-dependent test instruments, both base-side, both now named:** `apps/web/e2e/entry-faces-walk.spec.ts:93` (the login keyboard tab-order cell) failed 4 runs in 5 on UNMODIFIED main — **#510 MERGED the fix** (the walk now anchors on real document focus), so a train's browser leg no longer has to exonerate that cell by hand; and `packages/runtime/tests/intake-e2e.mjs:254` asserts four concurrent 20,000-row CSV parses have NOT finished by the time a chat-turn POST returns, a race by construction that flipped under fleet contention (harden with a progress checkpoint, not wall-clock ordering, next time the file is touched). **The 2026-09-02 runner-fleet saturation class that produced two same-second false reds is MOOT on hosted CI** (one fresh single-tenant VM per job) — kept only as the reason those two instruments are on this list.
- **The `ninth-rowkind-seeding-proposal` estate flake — the CAPPED-FIRM-WIDE-READ family, a lane and a census owed.** On the hosted migration's first run ONE cell of 3,884 reded: a seeded row read through a firm-wide query capped at 500. The #516 review classified it order/population-dependent, NOT host-specific and NOT introduced by #516 (the `clients.status='active'` hypothesis was refuted, and "did not reproduce on run 3" is weak evidence because run 3 is a different tree). **A bounded sonnet lane is owed:** make the cell read its own seeded row by id, or raise/scope the cap — and then **census every other firm-wide-read-capped assertion in the estate for the same shape**, because a cap that is invisible until the corpus grows past it is a time bomb in every sibling cell.
- **The CI cleanup chain rests on an UNENFORCED invariant — a drill database that outlives its own cleanup breaks the NEXT one** (found by `rev-drill` at #524 r2, recorded not built around). Each drill step's cleanup drops its OWN database by name and then sweeps chain-minted roles; `DROP ROLE` consults `pg_shdepend` across every database in the cluster, so a step whose database survives its own cleanup leaves dependency rows that make the FOLLOWING step's sweep fail with `2BP01`. Nothing enforces the pairing today — it holds only because every step happens to name its own database in the cleanup that follows it. **Rule for anyone adding a drill step: the step's database is dropped by the very next cleanup, with `PGDATABASE=postgres` explicit (a session cannot drop the database it is connected to).** The durable fix is to enforce the pairing in `packages/db/tests/rig-cluster-reset.mjs` rather than in step order; until then this row is the enforcement.
- **Three locked worktree shells** — `agent-a9f6854ecb5fbc759`, `agent-ac1c38bc266b18dc1` and `agent-aae5e2c5571e21b91` (the older #485 lane; its branch is archived to origin as `fs7-485-evaluator-fix-archive-2026-09-02`, every internal link unlinked, contents gone, the root directory EBUSY on rmdir from any cwd). **None holds anything** — removal needs an elevated shell after the next Claude Code restart, then `git worktree prune`.
- **Two host facts that cost lanes time (record, not defects):** the OpenNext/Workers artifact must be BUILT ON LINUX — `cf:build` fails reproducibly on this Windows/Node-20 host inside `copyTracedFiles`, an environment mismatch and not a regression — so FS-10's cutover builds it in WSL and repeats #505's two-sided middleware grep on THAT artifact. And **WSL idle-terminates without a Windows-side holder**, taking every lane's docker container down at once (it happened again ~21:xx on 2026-09-02; Postgres crash-recovered to its last committed migration in every rig, no data loss) — plant a detached keeper before any port-dependent WSL work. Also recorded: the money-input e2e harness route compiles to a prerendered 404 stub in production (inert behind the wall, flag-gated at build time) — acceptable, noted so the pattern is not repeated casually.
- **P6-1 bigint wire boundary, measured on PR #454's real Postgres 17 rig:**
  `wake_freeform_read` emits `read_id` as a JSON number, so receipt `9007199254740993` reaches the
  wrapper already rounded to `9007199254740992`. `chatTurn_v16` fails closed (no card, no throw),
  but ids above 2^53 cannot render until the database emits text. **Fix queue 裁-71⑨, batched with
  the next DB pass:** recut `wake_freeform_read` to emit `read_id::text`, and move
  `apps/web/lib/reports/types.ts` from `id: number` to `id: string`; this is a live-writer D1
  window and deliberately does not ride the runtime-only PR.
- **The two pointers a fresh reader needs, and one that keeps moving.** **State bridge:** this file's posture plus the newest ledger, [`mohe-grill-rulings-2026-09-02-pm.md`](docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md) — superseding the "Evening state bridge — 2026-09-01 close" in [`mohe-grill-rulings-2026-09-01-pm.md`](docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md), which supersedes `sprint-session-state-2026-08-31-afternoon.md`; both are kept as dated records. **The owner page:** its id changes on EVERY terminal `/login` — a re-login orphans the session's artifacts, the republish to the old URL is refused for want of write access, and the page comes back at a new id (it moved three times over 2026-09-02/03, and two truing rounds spent effort chasing it). **So the harness cites the page by TITLE ONLY — "Clara beta runway 0902" — and records no artifact id anywhere**; after each terminal re-login the page is republished once and the CURRENT link is handed to the owner at that checkpoint. An id written into a document here is stale by the next re-login, which is why none is written.
- **SECURITY — the confirmation login-CSRF / session-swap hole (found 2026-08-31 by #461's Codex law-28 leg; mechanism verified by the orchestrator at the live bodies).** The confirmation route's POST (/auth/confirm) proves the click came from a Clara page, never that THIS browser initiated the signup owning `token_hash`. **The FS-4 design gate ran the fix and is CLEAR (#473):** the wall is now an honest-refusing STUB at `apps/web/app/(entry)/auth/confirm/verify/confirmation-wall.ts` — THE STUB ALWAYS REFUSES until wired. **C-3 and C-5 are the wiring owners** (裁-102: `/signup`'s indirect resend via `supabase.auth.signUp` is the pre-existing sibling gap, deferred with all four pieces to C-3's `claim_confirmation_attempt`/`settle_confirmation_attempt`). Exposure is zero while `apps/web` is undeployed, and **"self-serve signup unreachable in the deployed build until the wall is wired" stays a hard FS-10 cutover acceptance line.** The `token_hash`-in-logs and single-use-replay siblings from the same leg remain open, riding the same wiring PRs.
- **Two `op_key` conventions coexist:** most wrappers mint fresh keys; P4-5/P6-2 use deterministic actor-scoped keys. Rule to make: every deterministic key carries actor id from a positive caller read and every governed door hashes the actor server-side; audit `apps/web/lib/reports/api.ts` first. Owner sitting required.
- **Unresolved worktree incident (2026-08-31 ~02:50 MYT):** an uncommitted `.claude/skills/orchestrator-fable/SKILL.md` edit vanished from the main checkout; content and cause are unknown. Ask the owner, try editor history, and add a post-lane main-status tripwire.
- **`clara.create_firm` has zero apps/web home:** its only caller remains `apps/dashboard/app/onboarding/firm/FirmCommitForm.tsx`; #461's signup flow uses different self-registration doors.
- **The wiki dynamic-SQL gate reads CoR/DO-block comments UN-MASKED** (0097 2026-08-20; hit again by 裁-17 2026-08-29): a create-function phrase quoted in a comment inside dollar-quoting reclassifies the block as a dynamic creator. Workaround: never spell the DDL verb in such a comment. Real fix = mask the block's own comments + a selftest; **re-homed to the F-A2 fix queue.**
- **Found by the 2026-08-29 dawn reviews, recorded not built around:** (1) ~~**M9 `list_open_items_by_counterparty` firm/client mismatch**~~ — **CLOSED: `0149` (#427), applied live 2026-08-30 00:30Z; tail drift-guarded.** (2) The interview asks "Apply the standard LHDN-aligned MPERS Chart of Accounts seed?" (`requiredForCommit`) and NOTHING consumes `coa_seed_decision` — a shipped promise 裁-21 closes. (3) ~~`wake_propose_identifier_promotion` has NO duplicate-open wall (0103)~~ — **CLOSED: #425 (`0148`) merged and APPLIED LIVE 2026-08-30 00:30Z (the duplicate-open wall on BOTH agent proposal doors, censused by property on live).** **Two successors it does NOT close, both minted by its own review and both pre-beta:** (3a) `wake_open_firm_question` can still mint the FIRST `onboarding_proposed` question with a caller-supplied kind and candidates, **bypassing Door 2's egress authorisation (CLR28), the A14 name-family wall and 裁-22's basis resolution** — the fix is a small migration refusing Door-2-owned kinds from that verb; (3b) 99 `exception when unique_violation` handlers in the chain and only ~15 read `constraint_name` — the live site is `0154_binding_proposal_pr_1.sql:2574-2576` (TRUED 2026-08-30; was `0028:769-771` — `0154` recut the body, this handler is byte-identical) **relabels EVERY unique_violation as `binding_conflict`**; a sweep at the fix queue. **And the identity table itself: RULED 2026-08-30 (裁-41) — `clara.client_identifiers` gains a UNIQUE `(client_id, kind, value_normalized)` before beta, its pre-flight NAMING existing duplicates and REFUSING, never deduping** (`0007:235` left it non-unique by design, so two separately-settled confirms still mint two identical identity rows). (3c) **P1, 裁-19 PR-1 — MEASURED AT THE 0149 APPLY (2026-08-30 00:30Z): live carried 0 pre-existing merges without a carrier row**, so PR-2's un-merge door will reach every live merge; the class stays recorded (a merge made on a frontier before `0149` would have had no carrier); the same measurement priced the canonicalising read at **~15% of an aging read** (14-15 µs per open item, ~+14 ms on a 1 000-item book), a third of which a `cross join lateral` rewrite removes in its own round. (3d) **F-A9 PR-1B's two:** `_approve_entry_core`'s refusal prose still names a "budget" gate that no longer exists (a sixth writer body, its own follow-up, with the drafting-trio exact-equality pin re-cut), and ~~the 0031 postverify step-4/6 red~~ **CLOSED #443 (`fa2a4ece`, 6/6 green on 0001–0155)**. (4) ~~`approve_opening_seed`/`approve_opening_correction` serializable proconfig pin~~ — **CLOSED: READ ON LIVE and confirmed at the 2026-08-29 ceremony.** (5) T11 N2: the live `resolve_onboarding_plan_item` re-resolves any state; the card disables settled items → **RULED 2026-08-29 (裁-27): "Amend resolution" is allowed on a resolved item, at P6.**
- **Wave-B rung-0 gaps, TRUED 2026-08-31:** (1) ~~authenticated alias read missing~~ — **DB half CLOSED by `0145` §F:** masked security-barrier view `clara.counterparty_aliases_visible`, live since 2026-08-29; P6-R still owes T8's alias-panel wiring. (2) ~~SweepReceipt was id-only~~ — **CLOSED #459:** `SweepReceiptCard` hydrates `get_sweep_run` and offers `acknowledge_sweep_run`. *(The 2026-08-22 resolved quartet — riders ③④⑤ · corroboration 0/33 · ci.yml over 500 · the stranded pair — is archived in `-part2.md`.)*
- **F-A7 gamma residuals R1/R2/R3 — ALL THREE STAND; full text archived verbatim 2026-08-30 to `docs/plan/completed/progress-archive-2026-08-part4.md`** (R1 classify egress ungoverned until the
  runtime side lands · R2 no `consume_firm_egress_dispatch` verb, `expires_at` decorative · R3
  `document_intakes.origin` never extended with `onboarding_interview`, the live CHECK refuses).
- **裁-71⑩ backend backlogs** — `clara.firm_egress_dispatch_authorizations` (0123) is owned by `postgres`, the only clara TABLE not owned by `clara_fn_owner` (a small owner-repoint migration) · `bank_agent_due_claims` has no retention path, owed before F-A3 enables the source · the wake-fn allowlist is name-bound, not signature-bound. **Also:** main's post-#457 push run 33314770566 went red on gitleaks for a since-rewritten P4-5 fixture commit (`381e8c82`, unreachable now); rerun dispatched.

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
- ~~**VHDX compaction residue**~~ — ~~RESOLVED 2026-08-27/28~~ (held only until the next cycle: a THIRD disk-zero bite → `docker volume prune` returned 87.25 GB from 359 anonymous rig volumes → the owner's elevated `diskpart compact vdisk` took vhdx ~100 GB → ~25 GB, C: 82 GB free). **VHDX COMPACTION OWED AGAIN (re-opened 2026-09-01).** disk-cleaner took C: 13.8→18.6 GB; 52.9 GB is reclaimable inside the WSL disk file — owner's elevated `diskpart` in the COMBINED pause window (vhdx + the owner's Claude Code update) ordered open 2026-09-02. **Re-measured 2026-09-02 10:00: the vhdx file is 66 GB with 16 GB used inside (~50 GB reclaimable); 33.77 GB of orphan rig volumes were pruned and ~9 GB of dead worktrees removed the same morning (C: 38 GB free). The compaction runs after the cascade lands — runners idle, `wsl --shutdown` first, the owner's elevated `diskpart`.** Standing practice BINDING: fleet runs prune docker volumes as stages finish; conductor sweeps `docker volume prune` at every wave close; keeper re-planted after every manual WSL restart.
- **Corrupted / locked worktree directories** — `agent-a13c9c7d877268370` (left by a dead lane; git cannot clean it) plus `agent-a9f6854ecb5fbc759` and `agent-ac1c38bc266b18dc1` (EBUSY at the 2026-09-02 cleanup): need removal from an elevated shell after `git worktree prune`; re-census at the next sweep.
- **Staging and beta MUST be served over HTTPS — an FS-10 cutover acceptance line, not a dev preference.** `apps/web/lib/supabase/cookie-options.ts` names `__Host-clara-auth` with `Secure`; over plain HTTP the browser drops it silently and the session never lands, with no error at any layer. `apps/web/README.md:451` covers only local-dev/Safari; this row is the deployed-origin obligation's home.
- **2026-09-01 21:48 incident — a cleaner lane's `robocopy /mir` WITHOUT `/XJ` followed a junction out of a reviewer worktree and filesystem-deleted 2000 tracked files under the MAIN checkout's `apps/` + `packages/`** (git index untouched; restored via `git restore`, zero loss). **LAW: never `robocopy /mir` any worktree without `/XJ`; after ANY bulk cleanup, run `git status` on the MAIN checkout as a post-flight check.** **CORRECTED 2026-09-02 (the 裁-123 cleanup incident): `git worktree remove --force` is NOT junction-safe on this host either — it followed a lane's `apps/web/node_modules` junction into the MAIN checkout's real install and emptied it (`next` gone, `.pnpm` damaged; repaired by a link-aware remove + `pnpm install --frozen-lockfile`, zero tracked-file loss).** The junction-safe primitive is: unlink every reparse point FIRST (`fs.rmdirSync` on the link itself), re-walk to prove none remain, THEN remove the directory; post-flight adds `ls apps/web/node_modules/next` on main. `Remove-Item -Recurse` on a directory that still contains junctions is equally unsafe.
- **`0154`'s cluster-wide role census × a second in-file migration replay (found by #485's 2026-09-02 fix round).** `packages/db/migrations/0154_binding_proposal_pr_1.sql:3788` asserts `pg_roles like 'clara%'` = 14 CLUSTER-wide; roles are not per-database, so any test that replays the migrations into a private database on a server the estate already migrated past `0160` (two webhook roles) refuses CLR10 at its own 0154 checkpoint. #485's fs7-v17 chat-turn DB test file (on that branch, commit `8703f912`) now CLONES the ambient estate database (`pg_dump | psql`) instead of replaying. **Still exposed: `packages/db/tests/rig-docs-upgrade.test.mjs` (the weekly-sweep closed-wave drill) replays the real migrations directory into a reset target several times in one file and will red on its next sweep** — its own fix lane is owed before the next `gh workflow run ci.yml`.
