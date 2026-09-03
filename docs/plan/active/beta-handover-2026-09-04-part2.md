# Clara beta — the handover, part 2: the P2 rows, the carried registry, and the owed truings

*Continues [`beta-handover-2026-09-04.md`](beta-handover-2026-09-04.md), which carries the posture,
the milestone tally, the P0 and P1 rows, the harness notes and the pick-list. **Read that first.***

**Why this file exists.** `PROGRESS.md` was re-cut at the final clock-out truing to short rows
pointing at ids, so the DETAIL of every still-open item lives here. **Every row that was in
`PROGRESS.md`'s Backlog or Known issues before this truing and is still open is carried below** — and
the original text of those two sections was moved BYTE-FOR-BYTE into
[`progress-archive-2026-08-part8.md`](../completed/progress-archive-2026-08-part8.md) first, so the
words as they stood are recoverable even where a row here is a compression of them.

Tiers are the same as part 1: **P0** before the first external applicant · **P1** before 上市 ·
**P2** hygiene.

---

## C.3 · P2 — hygiene found by the beta-live walk

Every one of these was seen on screen or in a console during the 裁-184 walk. None blocks anything.

| id | area | what was seen | fix shape |
|---|---|---|---|
| **H-10** | docs | The human bank settle refused **`CLR19 · write_into_closed_period`** because a close run was in progress — **correct behaviour**, caused by the walk's own order (`begin_close` at 05:22, a settlement dated inside the closing FY at 05:38). The refused settlement rolled back WHOLE: the entry id in the message does not exist in `journal_entries` | Document the ordering in the close/bank runbook so it is not re-diagnosed as a defect |
| **H-13** | docs / db | `open_bank_recon_items` FAILED with **`statement_gaps` = 11 months** because the client has one month of statements and the gate demands FY-wide coverage (basis `exceptions_gaps_and_registry_v1b`) — **a product behaviour, not a defect** | Say so in the product's own gate copy, so a firm mid-year is not told its close is broken |
| **H-14** | docs / product | Bank reconciliation certify is **BLOCKED by `recon_opening_mismatch`** and the door refuses to certify: the statement opens at RM1,000 while the GL bank account opens at 0 (the opening position was deferred at onboarding), so GL 2,800 ≠ bank 3,800 by exactly the missing opening. `get_bank_reconciliation` read `can_complete FALSE`, `difference 0`, `chain_ok true`. **The lead did NOT assert an opening position on the owner's behalf** — an attestation is a professional act, and fabricating a 1-January balance is exactly the number the product refuses | Document the opening-seed ceremony (`create_opening_seed` → `record_opening_target(s)` → `draft_opening_item` → `approve_opening_seed`) as the honest remedy: it needs a real tie document and an attestation |
| **H-22** | web / db | The two "What kind of document is this?" **open questions stay OPEN** on the client's Needs-your-attention list after the human sets the kind | Resolve the question when the kind is set |
| **H-23** | web / db | The client home lists **"Uncoded filing" ×4** while the `uncoded_documents` gate measured **0** on run 1 — two different censuses of the same word | Reconcile the two, or name them differently on screen |
| **H-24** | web | The **`Ask Clara` composer does not submit on Enter** (the text stays in the box, Send stays enabled) | Submit on Enter, newline on Shift+Enter |
| **H-25** | web | `/activity` console error **×4**: `MISSING_MESSAGE: CodingQuestionsSignals.agentTasks.loading (en)` | Add the key to the `en` catalog |
| **H-28** | web | During the interview the checklist card's header read **"1 / 1"** while the DB held **16** plan items — the card does not re-read the plan while the run is live. It corrected itself on completion (19/19) | Re-read the plan on each interview turn |
| **H-29** | web | The CoA apply row shows *"No chart-of-accounts decision has been recorded yet"* **although `coa_seed_decision = firm_template` was answered** — the helper reads the wrong field | Read the answered field |
| **H-31** | web | `/favicon.ico` **404** — no favicon ships | Ship one |
| **H-32** | web | The clarify card renders the clarify payload as a **raw JSON blob** plus a bare date "Sep 17, 2026" (an expiry, unlabelled) | A reader for the clarify payload; label the date |
| **H-33** | web | The clarify answer form is **duplicated** — the main page and the Clara pane both render it (Playwright's strict mode saw two "Your answer" controls) | Render it once |
| **H-34** | web | Registers → Counterparty hygiene says **"No counterparties recorded yet"** while a CUSTOMER exists — the default Vendors toggle hides customers | Default to the direction that has rows, or say "no vendors" |
| **H-50** | web | The client workspace header still read **"Status Onboarding"** after the commit until a reload | Refresh the header on commit |
| **H-51** | web | **`/clients` has no "add a client" control** — onboarding starts only in the chat lane. A discoverability finding, recorded as such at the walk rather than as a build failure | An entry point on `/clients` that opens the same "Do" |
| **H-52** | product | The interview still asks for an **SST number after `sst_regime = not_registered`**, and a `skip` is accepted without the confirmation echo every other capture gets | A small flow fix; rides 裁-181's normaliser work |
| **H-53** | product | **Consent evidence sits in the coding lane.** After the authorization letter was filed it appeared as a third RS filing awaiting coding | Exclude `consent_evidence`-kind filings from the coding lane |
| **H-41** | design | The **two `clarabook-frontend` recut PRs** — 裁-64②'s `--input` token value and R3 §9's focus-ring founder amendment — are the owner's, in the design-authority repo, outside every lane's write boundary. Until they land the ClaraBook design law drifts from the shipped app and any future port re-imports the drift. 裁-167 rides the same row: if the design repo later implements token contract §5.2 (32/36/40), `apps/web` follows | Owner · 裁-168 |

**Two practices minted by the walk, recorded so they are not re-learned:** a door reason typed
through psql on Windows must be **ASCII** (a non-UTF8 ellipsis from the console failed a
`dismiss_open_question`); and **`fs11-*` style operator scripts must be dry-run through the real pipe
with a dummy value before an owner types a real secret** (裁-178's origin).

---

## C.4 · The carried registry — everything that was open before the launch night

Grouped by area. **Nothing here was closed by the walk unless the row says so.** Full original text:
[`progress-archive-2026-08-part8.md`](../completed/progress-archive-2026-08-part8.md).

### Backend · database

- **C-17 · `clara.client_identifiers` needs a UNIQUE `(client_id, kind, value_normalized)` before
  beta scale (裁-41)** — `0007:235` left it non-unique by design, so two separately-settled confirms
  mint two identical identity rows. The pre-flight must NAME existing duplicates and REFUSE, never
  dedupe. **P1.**
- **C-18 · `wake_open_firm_question` can still mint the first `onboarding_proposed` question with a
  caller-supplied kind and candidates**, bypassing Door 2's egress authorisation (CLR28), the A14
  name-family wall and 裁-22's basis resolution. A small migration refusing Door-2-owned kinds from
  that verb. **P1.**
- **C-19 · 99 `exception when unique_violation` handlers and only ~15 read `constraint_name`.** The
  live site is `0154_binding_proposal_pr_1.sql:2574-2576`, which relabels EVERY unique violation as
  `binding_conflict`. **This is the same class as H-17's CLR23 mask** — a constraint-blind handler
  telling the user the wrong thing. A sweep. **P1.**
- **C-20 · `clara.firm_egress_dispatch_authorizations` (`0123`) is owned by `postgres`** — the only
  clara TABLE not owned by `clara_fn_owner`. A small owner-repoint migration. **P2.**
- **C-21 · `bank_agent_due_claims` has no retention path**, owed before F-A3 enables its wake source
  (rides C-05 / G1 PR-2). **P1.**
- **C-22 · The wake-fn allowlist is name-bound, not signature-bound.** **P2.**
- **C-23 · MBB-7(b): five legacy `trigger_kind='wake_task'` credential-uuid writer sites** —
  `wake_file_document` (`0126:1532`), `wake_open_firm_question` (`:1580`), `wake_reattribute_document`
  (`:1796`), `wake_propose_filing_correction` (`:1922`) and `wake_propose_client_onboarding` (live
  body `0143:642`) stamp the wake CREDENTIAL's uuid where the `0103:274` contract means a task/turn
  id. Not a live-data risk; mint a `wake_credential` trigger_kind before a ninth receipt table
  spreads it. **P2.**
- **C-24 · The two owner-excepted doors, both MEASURED 2026-08-30 with verdicts.**
  **`get_journal_entry` (single-arg, `0004:716`) → RETIRE, as its OWN migration** — never bundled
  with 裁-12's `create_account_set_v1` retirement (two unrelated doors, two independent rollbacks).
  **`record_notification` / `wake_record_notification` → KEEP AS-IS**: both live and audited, zero
  callers anywhere, and `clara.notifications` has no `_visible` view and no frontend read path — the
  table is write-only from the product's perspective but not itself dead. **P2.**
- **C-25 · The VACUOUS-GREEN-GATE class, two of three instances still open.** (a) the uncoded-voucher
  gate, blind with 21/21 filings NULL `financial_date` (`0056:1397`'s BETWEEN never satisfied by NULL;
  `:1404-1405` makes the miss permanent) → F-A4. **Note the interaction with H-12: repairing (a) will
  flip currently-green clients red, which was accepted at the sitting.** (c) drawer 1 returning `tie`
  on an EMPTY `bank_accounts` registry (`0056:962`) → F-T4. *(b) was DONE by `0121`.)* **P1.**
- **C-26 · The `0007` firm-limits pseudo-upsert trigger is column-hardcoded** — a partial-column
  INSERT against an existing firm row silently RESETS the other limit columns to their defaults, and
  `0090`'s `llm_witness_concurrency` is invisible to it entirely. **P1.**
- **C-27 · `0057` §11's writer roster has no live successor** — the roster runs only at `0057`'s own
  apply, so a future unrostered books-writer passes silently; `0096` and `0098` already grew the
  guarded population while the pin stayed fixed. Candidate: a standing census cell. **P1.**
- **C-28 · `high_stakes_amount_cents` has no governed self-serve verb** (set once by a hand-run
  deploy script, ADR-0044) — a firm-setup surface item. **P2.**
- **C-29 · `closing_stock` producer verb** — needed before any real goods-trader close; **this is
  what makes the `closing_stock_present` gate UNKNOWN in H-21's symptom list.** **P1.**
- **C-30 · `opening_tb.line` producer + the K-doc door** — Phase-5, review-gated; the corpus does not
  need it. **P2.**
- **C-31 · `0154`'s cluster-wide role census, the CI half — CLOSED BY MEASUREMENT.** The
  weekly-sweep drill `packages/db/tests/rig-docs-upgrade.test.mjs` was recorded as "still exposed and
  will red on its next sweep"; #525 derived the roster from `packages/db/deploy/roles-bootstrap.sql`
  and pinned it with a drift-guard cell, and **four hosted sweeps since (33712469717 · 33723755257 ·
  33757365379 · 33781966143) came back 13 of 13 GREEN including `closed-wave-drills`.** The row is
  closed. **The LIVE-cluster half is NOT** — it is H-47 in part 1.
- **C-32 · dr-verify 4.6 reads NULL-vs-materialized-default ACLs as drift** (`0103`: 12 no-op relation
  revokes → 96 phantom rows). The instrument-side normalization
  (`aclexplode(coalesce(acl, acldefault(...)))`) is judgement logic on a verification tool and needs
  its own reviewed PR. **P2.**
- **C-33 · The remaining named DB residuals, one line each:** π-E1's self-referential `betaLanded`
  check (gate on the `schema_migrations` stem) · the wiki-lint unprovable-kind waiver being
  function-wide rather than per-target · the candidate-parameterized `evaluate_witness_identity`
  variant (design v1 landed) · `document_regions.field_path` caller-supplied and un-CHECKed ·
  consolidating `wake_propose_bank_identifier_promotion` onto pi's `_identifier_promotion_core` · a
  shared marker-survival helper before any FOURTH `_sandbox_client_set` recut · F-A3 PR-3/C2's
  per-subject-account digest-binding, unimplemented for all thirteen agent bank cores (acceptance
  criteria are `bank-agency-annexes-2-record.md` Annex K A33) · the autonomous `bank_agent` driver's
  op_key shape rule (carry `taskId` at colon-field 2, or no colons at all) · the unadjudicated
  `opening_items` +7,850,406-cent sum with no `obe_plug` item (sign convention unknown, nothing
  guessed) · `_close_wake_ctx`'s CLR11 rung reachability (a hypothesis, never measured). **P2.**

### Backend · runtime

- **C-34 · Reconciler follow-ups (all pre-existing, none blocking, each its own PR):** the `expired`
  key collision at `reconciler.mjs:676` clobbering `expireClarifies`' count · the leader render-pair
  try/catch at `leader.mjs:206-217` still swallowing halt-class errors · three bare
  `to_regprocedure` probes in `wiki-projection.mjs`. **P2.**
- **C-35 · M1's reconciler re-mint clobbers the sidecar `runId`** —
  `packages/runtime/lib/reconciler-documents.mjs:450` does a full `writeTaskMeta` overwrite where the
  merging `mergeTaskMeta` was wanted (with `packages/runtime/lib/spool.mjs:124`). A real defect with
  a known site pair; its own PR. **P1.**
- **C-36 · The NEXT-ROUND prompt-side queue, five items** (the evaluator stays strict; widening it is
  a frozen-evaluator change with its own version and ceremony): the MYR currency-code prompt fix
  (a FALSE refusal 2/20 — ask for the CODE) · the dash-is-not-a-value clarification · the bare-SST-id
  vision-prompt check · `coverage.pages` empty 20/20 · the discount-no-net class counting 3, not 2.
  **P1** — and note the walk's own H-04 belongs to the same family of prompt work.
- **C-37 · Structured-format lanes, both verified at the bytes.** **OFX/QFX — the parser is BUILT and
  UNEXERCISED, not unbuilt**: intake canonicalizes four spellings, `scan.mjs` detects both dialects,
  intake is STORE-ONLY, and `parseStatementOfx` maps identity/currency/period/`LEDGERBAL`/every
  `STMTTRN`. Missing: a runtime battery and a real client file; trigger = the first OFX-exporting
  bank. **XLSX/DOCX — parsed VALUES-ONLY; the gap is SEMANTICS, not a parser**: every region carries
  `monetary_cents: null` and a structural `field_path`, so no facts — owned by F-A6 v2. **P2.**
- **C-38 · Stale dependency cites in frozen provenance comments** — the freeze-lint-frozen files cite
  `ai@7.0.31` / `@workflow/core` v4.6.0. **Structurally uneditable (constraint 9), so they stay and
  are read as dated provenance.** Two EDITABLE test files carry the same cites and should be trued in
  the next test-touching PR: `ledger-44-autodraft-v4.test.mjs`, `wave-e-f9-autodraft-v7-retry.test.mjs`.
  **P2.**

### Frontend · apps/web

- **C-39 · The dashboard→web capability diff's five post-beta drops** (record:
  [`dashboard-web-capability-diff-2026-09-02.md`](dashboard-web-capability-diff-2026-09-02.md)):
  `remap_bank_account_coa` built and tested with no web control · adjustment templates' `p_replaces`
  and `p_schedule` hardcoded null from the web · the onboarding plan's append-only revision history
  has no web read · the document-tied deterministic opening-balance parse path is unreachable · the
  chat session list / switcher. Each is an honest-note candidate on its surface until built. **P1.**
- **C-40 · UI-only residuals on live verbs (no backend gap):** bank —
  `resolve_and_book_bank_line`'s matched_booking/settlement leg and `get_bank_reconciliation`'s full
  snapshot view are unwired (`apps/web/components/bank/exceptions-section.tsx`,
  `apps/web/components/bank/reconciliation-section.tsx` — **the walk saw the second one's own honest
  "Not built yet" card**, which is H-14's neighbour); reports — `ExportRecipientsPanel`'s
  external-recipient `covered_clients` form is not built. **P1.**
- **C-41 · Doors with no apps/web home:** `record_document_service_period` + the
  `document_service_periods` read (live since `0140`) · `0154`'s `decline_vendor_identity_binding`,
  `reset_binding_decline`, `eligible_binding_signer_count`, `binding_identity_review` · the
  counterparty hygiene panel's `counterparty_aliases_visible` + `counterparty_merges` wiring (and
  `merge_id` on `MergeCounterpartiesResult`) · P6-R's alias-panel wiring over the live masked view
  `clara.counterparty_aliases_visible` · **`clara.create_firm`, whose only caller was deleted with
  `apps/dashboard` in #540 — it now has NO caller anywhere** (the self-registration doors are what
  `apps/web` uses). **P1/P2.**
- **C-42 · Post-beta UI rows ruled 2026-09-02:** streaming provisional reply text (裁-132 — beta
  ships the settled-only thread plus an honest progress indicator) · **a parked clarify does not
  survive a page reload** (`activeTaskId` is in-memory; mirror the dashboard's task-list poll or read
  `agent_interruptions` on mount) · the (firm)/(full) route error boundaries have a browser proof only
  on the (entry) one · the password-reset page's precondition is "a session", not "a recovery
  session", and tightening it needs the amr/aal claim `resolveServerSession` does not surface. **P1.**
- **C-43 · ⌘K, two gaps.** It is **NOT rank-shaped** — the palette lists routes the caller's rank
  cannot open (the nav registry's floors and the route's own door are the walls; derive the Go list
  from the registry). And it **cannot reach a client BY NAME from firm altitude** — `CLIENT_ROUTES`
  render only once the URL already resolves a `clientId`, so ⌘K reaches the register but never a
  named client. The second has no order anywhere. **P1.**
- **C-44 · Two FS-9 conformance residuals** (DS-07 CLOSED by 裁-167). **DS-09 per-field validation
  association** — 2 rendered `aria-invalid` sites against **70** `confirmDisabled=` occurrences across
  **49** files (count the file, never this line). **DS-15** — five self-declared "PORT DRIFT,
  CONFORMED" recuts in `apps/web/app/globals.css` carry no ruling number: a governance-hygiene gap,
  not a defect in the values. **P2.**
- **C-45 · Smaller web rows:** `ApplyStandardChartControl`'s first-read-failure arm is uncelled (the
  stranded-loading shape #519 retired one component over) · document refusal copy —
  `document-filings-history.tsx` lacks `refused_concurrency` and `apps/web/lib/documents/doors.ts`
  carries stale `refused_budget` prose · **Q5's i18n hardcoded-string lint ban**, promised by
  `apps/web/README.md` "once product screens land" — they have landed · a lint gate for the two
  duplicate-scanner classes (`JSON.parse` keeps the LAST of two sibling keys, so a value-level
  `apps/web/messages/en.json` diff can never see a duplicate; two sides adding the same `aria-label` merge with
  no conflict marker — both instruments positive-controlled, zero live defects at the last sweep) ·
  the Route-Handler `Vary` follow-up from #499 (Next 16.3.3 replaces middleware's `Vary` on Route
  Handler responses; the durable fix is a route-level `headers()`; the primary control
  `Cache-Control: private, no-store` IS delivered and e2e-pinned). **P2.**

### Reporting, close, tax and the unbuilt product surface

- **C-46 · The reports chain end to end + F-A5b PR-3 (download)** — and the walk showed why it
  matters: H-15 and H-16 in part 1. **P1.**
- **C-47 · The e2e re-render DR drill stays UNRUN until the first sealed artifact**
  ([`docs/ops/DR-render.md`](../../ops/DR-render.md)); TA-P14 schedules it before N3. Three named
  neighbours: N1 the seal-drill CI leg decision (weekly sweep or not), N2 the drill and F-A5 PR-1
  cell D cannot share a database (a one-way evaluator flip), N3 no cell for "a human archives
  `signed_original` on an agent-prepared run". **P1.**
- **C-48 · F-A4 PR-2b (the close runtime train)** and **F-A7b's FIRM-side setup interview** are both
  unbuilt and named in their design sets. **P1.**
- **C-49 · Tax: F-T2's payroll-calendar rows** (its 8 owner questions were ruled 裁-39, so the lane is
  unblocked) and **payroll document ingestion as a first-class capability** (its own purpose class and
  sensitivity walls — an owner decision, future scope). **F-A8's internet lane** still owes the law-28
  cross-model pass on the Tier-2 injection surface and a NAMED Tier-2 search vendor before
  `wake_web_search` ships. **P1/P2.**
- **C-50 · Gates on the operating runway:** **Gate P** (the first native-MYR SST-stated supplier bill,
  or the Wave-G reset) — ADR-0066 measured the waiting population at seven documents, all newest-`ocr`
  failed/`bad_type` with NULL `document_kind`; remedies are an owner re-export or the 401/403 split ·
  **Gate S**'s real-XML leg, unscheduled · **FINCARE RSINV-2510/02** needs a human coding decision.
  **Note: these gates named documents in the PRE-RESET estate, which no longer exists** — re-census
  them against the post-reset estate before acting. **P2.**
- **C-51 · The F6–F9 register (ADR-0066):** C1 `failed_retry` unwitnessed live (the drill is unrun) ·
  the `internal` lane has no self-service door · admission-time envelope label · mint-time-only ocr
  reclaim bound · F8's single-use door + two `0034` inherits + landscape-refresh autonomy · F9's
  no-unpark path. **P2.**
- **C-52 · Interview v3 residuals, all three re-homed to F-A7b:** `readClearsError` never checks
  `runId` · the concurrent-submitter receipt gap (a RUNTIME CONTRACT change — a server-authored
  per-(run, park, submission) receipt) · the interview e2e de-pin. **裁-181's normaliser and H-21's
  capture projection both land in this neighbourhood — build them together.** **P1.**
- **C-53 · COA:** PR-d, Annex G's admin editor over `0150`'s nine COA doors (extend the row's wording
  past "0150's nine" to cover `0156`'s `firm_coa_drift`), has no train; PR-c's trim half
  (`wake_propose_coa_template_trim`, its allowlist row and the receipt write) is PARKED and unbuilt,
  and law 28's cross-model adversarial pass attaches to that verb when it is built. **Also from Gate
  1's census: three orphan verbs minted at `0156` — `add_coa_template_family`, `coa_template_drift`,
  `get_coa_template_adoption` — now carry honest NotBuilt notes on their designated surfaces
  (#540 `32ace139`) but still have no train.** **P2.**
- **C-54 · Owner-batch 91b / 94 / 96 / 97 and item 84 — post-beta, ruled 裁-127.** 91b the compat-door
  drain horizon · 94 the bank-agent cadence (1 h) · 96 the supersession pointer in the frozen Slice-4
  contract · 97 section-only MSIC families · 84 per the owner-batch list. Each gets its sitting.
  **P2.**
- **C-55 · The gate-record OQ long tail, carried and not yet ruled** — F-T1 OQ-1/2/3/5/6/7/8/9/10 ·
  F-A4 OQ-1..6 · F-T3 OQ-2/3/9 · F-A8 OI-1 · F-A7 gate §5 item 3 · F-A9 TA-P13-OQ-2/4 · the fix-queue
  claims-auto-post widening trigger · bank-agency OQ-8 · reporting-agency OQ-4 + P12 · freeform OQ-A.
  **The standing rule that came out of the 2026-08-23 harness audit:** an OQ that survives its gate
  gets a Backlog line **the day the gate record lands**, not the day it is finally ruled. **P2.**
- **C-56 · Owner-side product decisions still open:** the pricing amounts (裁-58, gates everything
  downstream) · FX-lite build timing · OD-3's bar figures for every slot but BEE · 裁-64①'s rate-wall
  design sitting, which P4-D refuses to start without · R1's judgement-confidence conjunct drop · R9's
  **PITR HOLD**, whose trigger is the beta-prep checklist and which is therefore now DUE. **P1.**

### Ops, DR and security

- **C-57 · `/ready`'s two remaining incident follow-ups** (the storage-probe half landed, WARN-only):
  **(b)** a permanent CI battery over the storage **GRANT** surface — still absent, because the landed
  test exercises the probe mechanism, not the live Supabase grant/policy surface, which stays applied
  by ceremony rather than migration; **(c)** the storage-role re-examination. Their cost lands hardest
  now that beta is live: a silent grant-surface regression means a real firm's uploads fail while the
  service reports healthy. **P1.**
- **C-58 · External `/ready` uptime and alerting is unwired**, and the CI synthetic-canary seed is
  unbuilt. With one Fly machine and no HA (part 1, C-16) nothing pages anyone when the product is
  down. **P1.**
- **C-59 · The gitleaks push arm is UNSCOPED** — `--log-opts "--diff-merges=first-parent --all"` in
  `.github/actions/lint-suite/action.yml` scans every fetched branch; scoping it is a coverage trade
  the file's own comment states. *(The stale-runner-refs half is RETIRED by 裁-135: every job now runs
  on a fresh single-tenant VM.)* **P2.**
- **C-60 · Ungated destructive test helpers** — every `CREATE DATABASE` / `DROP DATABASE` /
  `DROP ROLE` under `packages/*/tests` must pass a guard; `assertDestructiveAllowed()` is called by
  five top-level scripts only, and two raw-superuser sites remain (#485's inline copy in
  `fs7-v17-chatturn-db.test.mjs`, #498's `cloneAmbientDatabase()` in
  `packages/db/tests/migrate-harness.mjs`). Blast radius is bounded per site, but a live-cluster env
  would dump the live estate into a sibling database with nothing refusing. Same row: give the clone
  idiom ONE spelling. **P1.**
- **C-61 · Bump the three Node-20 GitHub Actions** (checkout, setup-node, pnpm/action-setup) —
  warning-only, but on hosted runners GitHub decides when the fallback ends. **P2.**
- **C-62 · Two `op_key` conventions coexist** — most wrappers mint fresh keys, P4-5/P6-2 use
  deterministic actor-scoped keys. The rule to make: every deterministic key carries an actor id from
  a positive caller read, and every governed door hashes the actor server-side. Audit
  `apps/web/lib/reports/api.ts` first. Owner sitting. **P1.**
- **C-63 · The confirmation login-CSRF finding — TRUED.** The always-refusing stub is GONE: the wall
  is **wired for real by FS-4 C-6 Lane B (#517)**, `POST /api/auth-wall/confirm` performs claim →
  verifyOtp → settle inside one server request, `attempt_id` never crosses the wire, and the walk
  exercised it in the field (one attempt, **accepted**, 167 ms). **What is NOT re-measured and is
  carried:** whether the browser-identity half of the original finding is fully answered, plus the
  `token_hash`-in-logs and single-use-replay siblings from the same law-28 leg. **P1, as a
  re-measurement.**
- **C-64 · Host and worktree hygiene (owner's elevated shell).** Three locked worktree shells
  (`agent-a9f6854ecb5fbc759`, `agent-ac1c38bc266b18dc1`, `agent-aae5e2c5571e21b91`) plus the corrupted
  `agent-a13c9c7d877268370`; none holds anything, and removal needs an elevated shell after a Claude
  Code restart, then `git worktree prune`. **VHDX compaction is owed again** — last measured
  2026-09-02 at 66 GB with 16 GB used inside (~50 GB reclaimable); runners idle, `wsl --shutdown`
  first, then the owner's elevated `diskpart`/`Optimize-VHD` (裁-173). **P2.**
- **C-65 · The unresolved worktree incident (2026-08-31 ~02:50)** — an uncommitted
  `.claude/skills/orchestrator-fable/SKILL.md` edit vanished from the main checkout; content and
  cause unknown. Ask the owner; try editor history; add a post-lane main-status tripwire. **P2.**

### Harness, CI and instruments

- **C-66 · The drain helper has no asserting cell, and two kits own a top-level `after()`.**
  `waitForBackendsClear` in `packages/db/tests/migrate-harness.mjs` cured the CI relay-teardown class
  (#534), but its two call sites only PRINT — gut the helper and every gate stays green. The cell is
  ~25 lines (a planted straggler reds it; a closed pool clears in ~1 ms; an ended admin client returns
  rather than throwing). Same PR: sweep `matcher-testkit.mjs` and `g1-wake-bodies.fixtures.mjs` to the
  ONE-TEARDOWN shape. **Two older instrument carries ride here:**
  `packages/runtime/tests/relay-drain.test.mjs:74` sleeps 200 ms blind before asserting a NOTIFY
  arrived (replace with a bounded poll), and #518's D4 — the §3.0.2 ambiguity cell has never executed
  its assert because the deferred constraint fires on a different POOLED connection (the class is "a
  deferred-constraint assertion needs the same session"). **P2.**
- **C-67 · Two CI-shape decisions one line apart** in `.github/actions/db-estate-suite/action.yml:59`:
  `pnpm -r --if-present test` runs **without `--no-bail`**, so a runtime red aborts before
  `packages/db` prints its totals and a red run carries **no positive evidence for the db half** (it
  cost real diagnosis time three times in one day); and the same line runs `packages/db` and
  `packages/runtime` CONCURRENTLY against one service cluster, which is the load that made the
  teardown race bite. `--no-bail` is uncontroversial; the concurrency question needs a measured
  before/after on the leg's wall time. **P2.**
- **C-68 · harness-links' two remaining blind spots.** **(a) The colon rule** — `file:line` citations
  are structurally skipped (`STRUCTURALLY_NOT_A_PATH_RE` contains `:`), so a `helpers.ts:9999` plant
  stays green; the FILE half could be resolved by dropping the `:N` suffix, and the fix needs a
  selftest cell driving the exported `main()`. **(b) Scope** — the harness-menu READMEs
  (`apps/web/README.md`, `packages/db/README.md`, `PROGRESS.md`'s own menu rows) are still not
  content-scanned; widening there surfaces 22 findings across 9 roots, so it is its own triage PR.
  **Also:** 706 of the validated references resolve by UNIQUE BASENAME rather than a written path
  (measured 2026-09-02; 0 broken) — the durable fix is authoring real paths at each site; and the
  `NON_PATH_ALLOWLIST`'s `frozen-evaluators.json` exemption still calls that file "(unbuilt)" although
  it is tracked at the repo root (a CODE change). **P2.**
- **C-69 · Cross-package parts parity — the FIELD-level test is still owed.** #454 shipped a
  **kind-coverage** gate: `packages/runtime/scripts/check-parts-parity.mjs:366` takes only
  `declaredPartShapes(...).keys()` and the reader side reads only each union member's `type`
  discriminant, so a dropped, renamed or mistyped FIELD in `apps/web/lib/parts/types.ts` still passes.
  The v16 shapes were verified field-by-field ONCE, by a review's own AST comparator — never a
  standing gate. **P1.**
- **C-70 · OPS.x — the deployed parts-version hold.** CI proves `reader ⊇ emittable` inside one
  commit, which cannot prove the DEPLOYED web is at least the runtime version about to ship. A
  separate ops/CI PR must have the deployed web publish a catalog/version stamp and make the runtime
  deploy read and compare it before rollout. **The walk gave this row a live example:** the parity
  gate's census names `chatTurn.v16.prompt.ts:187` as the emit site while **v17 serves**. **P1.**
- **C-71 · The `ninth-rowkind-seeding-proposal` estate flake — the CAPPED-FIRM-WIDE-READ family.** One
  cell of 3,884 reded on a hosted run: a seeded row read through a firm-wide query capped at 500.
  Order/population-dependent, not host-specific. A bounded lane is owed: make the cell read its own
  row by id or scope the cap, **and then census every other firm-wide-read-capped assertion** — a cap
  invisible until the corpus grows past it is a time bomb in every sibling cell. **P2.**
- **C-72 · The CI cleanup chain rests on an UNENFORCED invariant.** Each drill step drops its OWN
  database by name and then sweeps chain-minted roles; `DROP ROLE` consults `pg_shdepend` across every
  database, so a step whose database survives its cleanup makes the NEXT step's sweep fail `2BP01`.
  Nothing enforces the pairing. **Rule for anyone adding a drill step: the step's database is dropped
  by the very next cleanup, with `PGDATABASE=postgres` explicit.** The durable fix belongs in
  `packages/db/tests/rig-cluster-reset.mjs`. **P2.**
- **C-73 · Two load-dependent test instruments, both base-side.** `apps/web/e2e/entry-faces-walk.spec.ts`
  was fixed by #510; `packages/runtime/tests/intake-e2e.mjs:254` still asserts four concurrent
  20,000-row CSV parses have NOT finished by the time a chat-turn POST returns — a race by
  construction. Harden with a progress checkpoint, not wall-clock ordering, next time the file is
  touched. **P2.**
- **C-74 · 裁-110 · RESERVED — the cross-package test-guard proposal is NOT YET IN ANY LEDGER.** A
  `git grep 裁-110` over `main` returns zero files and the 09-01-pm ledger jumps 109 → 111. The
  incident family it answers is the cross-package shared-DB test class fixed piecewise across
  #482/#485/#497/#498/#501. **The proposal must be AUTHORED INTO a ledger before the owner sitting;
  until then this row is its only record.** **P2.**
- **C-75 · The dated-tripwire class, seen three times** — pin the monotonic DIRECTION, never a
  ceremony-state; a trued pin proves both ways; sweep for a candidate at every ceremony. Same family:
  `--lock-deployed` is BLANKET (run it only when every dark entry is genuinely deployed; a scoped
  `--only` flag would be its own PR) — **the FS-11 as-run deliberately did NOT run it.** **P2.**
- **C-76 · Beta-boundary instruments (ADR-0069)** — a quality-score document (A–D per domain/layer),
  the doc-gardening recurring agent, and a tool/interface-design pass over the custom MCP surfaces.
  **P2.**

---

## C.5 · The documentation truings the rulings ordered, and which are NOT yet executed

**Stated plainly because several rulings say "executed at the final truing" and this truing did not
do them:** the final truing's scope was the records, the ledger, the digest rows, the handover and
`PROGRESS.md`. The lines below are owed to files this PR did not open, and each is a small docs edit
for whichever lane next has the file.

| where | what the line must say | ruling |
|---|---|---|
| `docs/ops/wave-g-setup-checklist.md` | the step **4b** purge line (auth users + Storage OBJECTS, never buckets or policies) | 裁-161 |
| `docs/ops/wave-g-setup-checklist.md` | the pre-reset backup gate re-cut: *"for a TEST-DATA reset before beta live the gate is waived by ruling (裁-177); for any reset after beta live it binds in full"* | 裁-177 |
| `docs/ops/wave-g-setup-checklist.md` | the signup-gate section gains **"OTP length = 6, read back by Management API (`mailer_otp_length`)"** — the live config was **8** and no document named the setting | 裁-92 · measured at S21 |
| `docs/ops/wave-g-setup-checklist.md` | 裁-169's TWO read-back lines with their values (`rate_limit_email_sent` = 100/hour is now known; the Resend cap is H-45) | 裁-169 |
| `docs/ops/wave-g-setup-checklist.md` | the dated fact that **BELCORT is not SST-registered**, so Stripe Tax stays off | 裁-170 |
| `docs/ops/wave-g-setup-checklist.md` · `docs/ops/DR.md` | **"re-enable LOGIN on the ceremonied roles"** immediately after MIGRATE, plus the `0154` role-rename recipe (this is H-47) | measured at FS-11 step 9 |
| `docs/ops/DR.md` | 裁-162's scope-and-expiry sentence: the owner-run classifier's supersession was FS-11-scoped and **has expired** | 裁-162 |
| `docs/ops/DR-full-drill.md` · `packages/db/scripts/dr-verify-checks.mjs` | probe `4.9`'s replacement subject, or the honest UNPROVEN marker (this is H-49) | 裁-172 |
| `apps/web/wrangler.jsonc` (comment) + the FS-10 rider | **T-K:** the claim that "every walled POST refuses on a workers.dev preview" is FALSE — `apps/web/lib/same-origin.ts:179-181` accepts an Origin whose host is the request's own host | measured at FS-10 S12 |
| `apps/web/wrangler.jsonc` | move `INVITE_MAIL_FROM` from a secret into `vars` (it is not credential-bearing; "one name, one home") | FS-10 S8a |
| the remote-walk instrument's README | two instrument-expectation rows are wrong (/auth/recover/password's anonymous landmark is the recovery-REQUEST form; `/money-input-harness` sits behind the auth gate), and **its `routes` mode must not POST a real invite** — the FS-10 walk created one on the live database | measured at FS-10 S12 |
| `packages/runtime/README.md` + the checklist | the lane DSNs' TLS posture is documented **nowhere**, and neither is `pg-connection-string` 2.14's semantics (`sslmode=require` ≠ libpq's without `uselibpqcompat=true`) | 裁-179 |
| eight files under `packages/runtime/` | fifteen citations of `0161` that mean C-3's auth-wall role pair, now `0163` — a docs-shaped edit inside runtime files scores CODE, so it rides the next runtime PR | 裁-108's discipline |
| five active plan docs | *"six cadence gates / six daily belts"* where the leader now exports FIVE `*Due` predicates and the reconciler runs FOUR — a `(historical count; see ARCHITECTURE §2.2)` rider on each, never a re-guess | measured 2026-09-03 |
| `packages/runtime/README.md` | the pointer chain terminates at a STATE sentence ("VERSION 71") rather than the law it demonstrates, which survives at `:182` | measured 2026-09-03 |
| `docs/product/PRD.md` §9 item 3 | 裁-145's note says four of five are live; **three** are (the Beta terms are not) | 裁-166 |
| `docs/ARCHITECTURE.md` | the per-pool background-client error CONTRACT (rides C-04's PR) | 裁-149 |

---

*Written at the final clock-out truing, 2026-09-04, under 裁-185 and 裁-150. Every row names what was
measured, and every row that says "not measured" means exactly that.*
