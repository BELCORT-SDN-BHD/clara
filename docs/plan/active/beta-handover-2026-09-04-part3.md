# Clara beta — the handover, part 3: §C.4 continued, and the owed documentation truings

*Part 3 of 3. Continues [`beta-handover-2026-09-04-part2.md`](beta-handover-2026-09-04-part2.md),
which holds the P2 rows from the walk (§C.3) and the carried registry C-17…C-76 (§C.4); the posture,
the milestone tally, the P0/P1 rows, the harness notes and the pick-list are in
[`beta-handover-2026-09-04.md`](beta-handover-2026-09-04.md). **Read part 1 first.***

*Opened at the final clock-out truing because part 2 reached the repo's 500-line ceiling — the same
split convention the ADR digest and the ruling ledgers use.*

---

## C.4 (continued)

### Carried at the review's insistence — the fourteen rows the first cut missed

*The exact split, because "fourteen" and "twelve" are different numbers and both are true of
something here: a fresh-context review probed **fourteen** pre-PR rows and found none carried. **TEN
of them are carried below**; the **other FOUR are dispositions**, named in this section's closing
paragraph (the `__Host-clara-auth` line closed by measurement, the two LAWS moved to the handover's
§D, and the dangling doc paths kept inert). The rows below number **twelve** — C-77, C-86 and C-88
carry further material the same sweep turned up, and C-77 alone holds a ten-item ledger.*

- **C-77 · The 09-01-pm STANDING FOLLOW-UP LEDGER — ten items, none blocking beta**
  (`docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`, its own closing list): the **756-site /
  88-file `settleUntil` fixed-iteration sweep**, with the helper hoisted to a shared test-hook
  harness FIRST (#491's corrected census — the original estimate was 20× low) · a **freeze-lint drift
  guard refusing test-path registrations (a `tests/…` path)** (the #485 M1 class) · **p4t2-registration's
  actor-scoped audit count**, the last schema-wide census · **a gate binding a11y shadows to their
  real pages** plus a tree→registry ⌘K cell · **`apps/web/components/reports/DoorDialog.tsx`'s
  identical close-polarity bypass** · **C-5's three order items** — the projector's nested-PII strip
  wall (裁-91's containment half), the webhook route surfacing rejected events LOUDLY rather than
  200-and-drop, and C-2's `constraint_name` re-raise hazard if a second unique is ever added ·
  **`coa_chart_apply`'s checklist row gap** · **the Wave-G checklist's confirm-template line**,
  re-pointed at the 裁-92 OTP form · **`_close_wake_ctx`'s CLR11 rung reachability** (a hypothesis,
  never measured — also named in C-33) · **#488's `page.tsx` 900 s clamp**, to be trued to C-3's real
  window. **P2, except C-5's three, which are P1 and belong beside C-09.**
- **C-78 · P4-7's magiclink arm (裁-65)** — **no order and no branch exists**; #455 correctly keeps
  the fail-closed **409** until one does. It is a product decision before it is a build. **P2.**
- **C-79 · The FS-0 verb census's EIGHT NO-HOME dispositions** —
  [`verb-coverage-census-2026-08-31.md`](verb-coverage-census-2026-08-31.md) (§row-bound · §NO HOME):
  firm capabilities (`grant/revoke_firm_capability`), `set_turnover_classification` (裁-80's note at
  P6-T), client-alias hygiene (`add/retire_client_alias`), `record_client_fact` (FS-5 rung-0
  decides). *(`set_firm_high_stakes_threshold` CLOSED with #489 and again at Gate 1's census;
  `verify_snapshot` CLOSED at 裁-98.)* Each owes an FS-8 note or a ruling — **none may be silent**,
  which is the whole point of the census. **P1.**
- **C-80 · `revoke_invite`'s asymmetric lock order** — it takes only the invite-row lock, never the
  firm lock first: a narrow, non-widening race window. The named safe fix (`FOR UPDATE` on the
  actor's own membership row) rides a later db train. **P2.**
- **C-81 · The δ named residuals — all five STAND, none scheduled** (full text in
  `progress-archive-2026-08-part2.md`): F10's `transaction_timeout` · the B4 dollar-quoted sandwich ·
  the 57014 `caller_reported` label · the RS guard's lift window · the Supavisor headroom re-measure.
  **η, not δ, owns the production human/OBO/wake caller** — direct grants and synthetic human JWTs
  stay FORBIDDEN, and that matters next at F-A5's OBO closure. **P2.**
- **C-82 · The η residuals (Wave-E, #240/#242) — all four STAND**: the estate-wide **whitespace-blind
  blank-op-key idiom** · the co-effective policy seed-test's fixture design (`clara.edge_policy_sets`)
  · the δ-family window-blind wall-side policy resolution (**a false refusal, never a false
  preview**) · `0084`'s `C:\ct\`-only tooling. **P2.**
- **C-83 · The 2026-08-23 harness audit's UNRECORDED-OBLIGATION backlog**
  ([`harness-audit-2026-08-23.md`](harness-audit-2026-08-23.md) §A) — the audit measured that
  `PROGRESS.md` was not the only home for forward obligations: **~18 carry no row anywhere**, chiefly
  unruled owner-questions inside design sets already marked GATED v2 (F-A3, F-A4, F-A8, F-A9, F-T3),
  plus three DR/incident follow-ups, and ~5 more that live in Lanes/Next rather than Backlog. §A's
  table is the list to work through; each item closes by being RULED or by getting a row. *(The
  standing rule it minted — an OQ that survives its gate gets a Backlog line the day the gate record
  lands — is in C-55.)* **P2.**
- **C-84 · The wiki dynamic-SQL gate reads CoR/DO-block comments UN-MASKED** — a create-function
  phrase quoted in a comment inside dollar-quoting reclassifies the whole block as a dynamic creator
  (hit at `0097` on 2026-08-20 and again at 裁-17 on 2026-08-29). The workaround in force is "never
  spell the DDL verb in such a comment"; the real fix is to mask the block's own comments and add a
  selftest. **P2.**
- **C-85 · F-A7's γ residuals R1 / R2 / R3 — all three STAND** (full text verbatim in
  `progress-archive-2026-08-part4.md`): **R1** classify egress ungoverned until the runtime side
  lands · **R2** no `consume_firm_egress_dispatch` verb, so `expires_at` is decorative · **R3**
  `document_intakes.origin` was never extended with `onboarding_interview` and the live CHECK refuses
  it. **R3 is the one the walk brushed against**: the onboarding interview's own attach seam filed its
  two sample invoices under origin `documents_tab`. **P1.**
- **C-86 · The 2026-08-29 dawn-review successors still open.** (3a) and (3b) are C-18 and C-19. **(3c)
  裁-19 PR-2's un-merge door** — measured at the `0149` apply that live carried **0** pre-existing
  merges without a carrier row, so PR-2 will reach every live merge; the canonicalising read was
  priced at ~15 % of an aging read (~14–15 µs per open item, ~+14 ms on a 1,000-item book), a third
  of which a `cross join lateral` rewrite removes. **(3d) `_approve_entry_core`'s refusal prose still
  names a "budget" gate that no longer exists** — a sixth writer body, with the drafting-trio
  exact-equality pin re-cut. Same row: the **two γ post-CLEAN NITs** (PR #231 residuals 4–5),
  one-word fixes for the next `0057`-area batch. **P2.**
- **C-87 · The ClaraBook resource-audit's last open residual** — the **Mobbin flow-video viewing
  pass** (裁-4 7d). 裁-13's target-size gate and 裁-14's mascot both shipped at P6. **P2.**
- **C-88 · Four small carried sets, one line each.** **Small unrecorded follow-ups (audit
  2026-08-26):** wb-o's AMB-11 adjudication request · the metering `firm_usage_daily`/`task_usage`
  read-drop follow-up · a per-rung friendly-message table · the DB-side status-predicated CAS settle
  (rides C-05). **Tooling follow-ups, unscheduled:** the dr-verify trio · the runtime boot line's
  bundle version · a local disposable Supabase stack · the ComplianceWatchCard echo · the
  unreverted-admin-grant lint watch. **Tier-A raises leave NO durable trace** (no receipt, no audit
  row — design-consistent, conductor-closed with reviewer concurrence): an OBSERVABILITY gap
  candidate, not a wall gap. **Wave-D/C and Slice-era deferrals:** the first live real recurring
  template (event-triggered) · C-a's §5.3 pool segregation and Section-I wedge remedy · C-c F-3
  documented-as-is · Slice-4's compliance export, trace-debug surface, chat-visibility toggle and
  job-level liveness. **P2.**

**What deliberately STAYED in the archive — the FOUR dispositions, named here so nobody hunts.** A
row was left behind only when its action is DONE, or when its content is a LAW or a practice rather
than a task.
**CLOSED BY MEASUREMENT: the `__Host-clara-auth` HTTPS deployed-origin acceptance line** —
`app.clarabook.com` now serves the Worker over HTTPS and the cookie landed in the field (secure,
path=/, sameSite=Lax, at FS-10 S12's authenticated arm, and the FS-11 step-13 walk signed in on it).
**Moved to the handover's §D as LAWS, not backlog:** every git-active lane runs in its own worktree
(no docs-only exception), the junction-safe removal primitive, the libpq `PG*` rig rule and the WSL
keeper. **Kept archived as practices, named in §D in one clause:** the MAX_PATH recovery-verb
sequence and the gitleaks fixture-label rule. **Kept archived as inert:** the three dangling doc
paths (`RENUMBER.md` · `algebra.md` · `INTERFACE-PINS.md`) — law 41 + ADR-058, re-author only on real
need. All of it is byte-for-byte in
[`progress-archive-2026-08-part8.md`](../completed/progress-archive-2026-08-part8.md) and its
siblings.

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
| `docs/ops/incident-2026-07-26-intake-storage.md:55` · `docs/ops/wave-g-setup-checklist.md:95,114-116,134-138` · `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:418-419` | **review-539's T-H list — three live instructions that now teach the OPPOSITE of what shipped.** 裁-151 removed `NEXT_PUBLIC_CLARA_RUNTIME_URL` and moved `CLARA_RUNTIME_URL`, `CLARA_PUBLIC_ORIGINS` and `CLARA_TRUSTED_CLIENT_IP_HEADER` into `apps/web/wrangler.jsonc`'s `vars` block, yet the incident record's **FIX** line still instructs a reader to set the deleted variable — while `apps/web/.env.example:109` says in capitals that it "IS GONE, DELIBERATELY, AND MUST NOT COME BACK" — and the checklist still lists all three among the `wrangler secret put` names and their proof line. Two historical research records also need a date stamp | 裁-151 · FS-10 S8a |

---

## Errata — measured 2026-09-06 on `main` at `95441fe6`

**Why this section exists.** The handover was written on 2026-09-04 and every row was true then. The
repair session's PRs then merged and the 2026-09-05 ceremony deployed them, and a read-only
per-item disposition pass on 2026-09-06 found that a handful of rows now carry a **wrong premise, a
wrong cause, a wrong owner, a wrong anchor or a rejected prescription** — the kinds of error that
send the next lane to fix the wrong thing. Each entry below quotes what the handover says, states
what is true now, and names the line the correction was read at. **A correction is written here only
where the current text was opened and read; the two claims that could not be reproduced say so.**
The rows themselves are left standing — annotating them in place would make the handover disagree
with its own dated record.

**Causes and premises — a lane acting on the original text would fix the wrong thing.**

- **H-04** (part 1, `:196`) — the handover prescribes *"Prompt / few-shot work on the classify
  lane"*. **That is not the cause.** The ceremony measured the real one: the classify lane settles
  **before** its OCR extraction is persisted (1.4 s, 3.1 s, 5.7 s and 5.8 s early on all four
  documents that have ever run it, each with exactly one `ocr` extraction at `version_n` 1), and
  `readExtractionText` requires `status='done'`, so the classifier is handed an **empty string** and
  answers `other`. #558 sharpened the prompt against a cause that was not the cause, and 裁-199's
  recall gate passed only because the baseline arm never reproduced the defect. **Fix the
  dispatcher, not the prompt.** Evidence: ceremony as-run part 1 §5.1a; `PROGRESS.md` posture block
  and the new P0 row.
- **H-29** (part 2, `:42`) — the handover says *"the helper reads the wrong field"* and prescribes
  *"Read the answered field"*. **The helper is faithful.** `0170`'s own header records the
  measurement: `apps/web/lib/onboarding/coa.ts:89` maps the row's own key, the interview writes
  `answer:{seed}` and the DB reads `i.answer->>'seed'`. The verdict is DB-computed, and its cause is
  the state predicate in `clara.coa_chart_state`'s `dec` CTE at
  `packages/db/migrations/0156_coa_apply_template.sql:1080-1088` (`p2.state = 'committed'`): while
  onboarding is open the CTE returns no row and the CASE falls to `else 'undecided'` on a client who
  HAS decided. 裁-193 settled what that should mean, so `0170` adds `seed_decision_plan_state`
  rather than widening the read. **The web half — one sentence on the card saying "decided in the
  interview, applies after commit" — is still owed.**
- **C-10** (part 1, `:232`) — *"`livemode` is stored and never read"*. **The gate exists, at the
  route.** `packages/runtime/lib/stripe-livemode.mjs` refuses a mode-mismatched event **before**
  `record_stripe_event` and fails closed when `CLARA_STRIPE_LIVEMODE` is unset; shipped in #511
  (`344f7ad8`, 2026-09-03), with #544 extending the key-class gate to the web arm. The stored COLUMN
  stays deliberately unread, by that module's own stated design. **Only the stranded-payment clause
  of C-10 carries.**
- **C-11** (part 1, `:233`) — *"`assertTaskStreamAccess` runs once at open, so a removed member keeps
  the live transcript"*. **False since before the handover was written.**
  `packages/runtime/src/streamRoute.ts:64-88` re-runs `authenticate` + `assertTaskStreamAccess` in
  the poll's own checkout and closes the stream with an explicit `revoked` event; the block's own
  header dates it "B-M3 (security pass, 2026-09-02)" and it shipped in #511 (`344f7ad8`,
  2026-09-03). **The row should be struck, not scheduled.**
- **C-60** (part 2, `:283`) — *"two raw-superuser sites remain"*, naming the inline copy in
  `fs7-v17-chatturn-db.test.mjs` and `cloneAmbientDatabase()` in `migrate-harness.mjs`. **Both were
  converted by #498 (`d427059f`, 2026-09-03):** `packages/db/tests/migrate-harness.mjs:139-140` calls
  `assertDestructiveAllowed()` as the function's first statement, and
  `packages/runtime/tests/fs7-v17-chatturn-db.test.mjs:145-158` states in its own words that "no
  local reimplementation remains in this file". The "ONE spelling" half of the row is done too.
  **What honestly carries is the general sweep** — whether every `CREATE`/`DROP DATABASE`/`DROP ROLE`
  under `packages/*/tests` routes through the guard, which needs a per-site read.
- **C-74** (part 2, `:383` — **not part 3**, where an earlier index placed it) — *"a `git grep 裁-110`
  over `main` returns zero files"*. **裁-110 is authored**, at
  [`mohe-grill-rulings-2026-09-02.md:15`](mohe-grill-rulings-2026-09-02.md) as
  `裁-110 · RESERVED (recorded 2026-09-02 to close a silent numbering gap)`, merged in `33e94855`
  (#503) two days before the handover was written. **The substance carries:** the cross-package
  test-guard proposal itself is still unruled, which is what the row should now say.

**Prescriptions that were tried and rejected — do not re-attempt them.**

- **H-23** (part 2, `:38`) — the fix shape reads *"Reconcile the two, or name them differently on
  screen"*. **The first arm is not executable.** #551 measured that the remaining divergences between
  the Needs-you queue's census and the close gate's `uncoded_documents` census — the FY date range,
  the join key and the reversal predicate — are **design, not drift**, and unifying them would
  invalidate attestations already signed. **The naming arm was taken:** `apps/web/messages/en.json:103`
  now reads `"Filing awaiting an entry"`, pinned by
  `apps/web/components/firm/needs-you-row-facts.test.tsx:171`, whose assertion states the reason —
  "the old label collided with the close gate's own `uncoded_documents` census, which counts only
  FY-DATED filings". `en.json:2683` is still `"Uncoded filings"` on the gate's own side, which is
  correct there. **Screen wording only; never reconcile the censuses.**
- **H-33** (part 2, `:45`) — the fix shape reads *"Render it once"*. **Rejected, with the reason in
  the source.** `apps/web/components/journals/interruptions-panel.tsx:146-156` records that the
  workbench form and the rail's `ClarifyCard` are **two legitimate altitudes of ONE door**, not two
  doors, and neither is suppressed; the accessible-name collision was fixed by making the workbench
  copy say where it is while the rail keeps the short name. **What actually remains** (named at
  `:157-164`, not silently left): **both submit buttons still read "Answer"**, so the duplicate
  accessible-name class survives one control over. Renaming it reds
  `apps/web/components/parts/clarify-card.test.tsx`, so it belongs to whoever owns both files at
  once — a one-line follow-up, not a re-render.

**Wrong owner, wrong anchor, wrong count.**

- **The Worker's shape** (part 1, `:35-37`) — *"version **I** … deployed at 100 % and carrying six
  secrets and three vars"*. **Both halves moved.** The variable count was **four**, read live at the
  2026-09-05 ceremony: `CLARA_PUBLIC_ORIGINS`, `CLARA_RUNTIME_URL`, `CLARA_STRIPE_LIVEMODE` and
  `CLARA_TRUSTED_CLIENT_IP_HEADER` (six secrets is right). And version **I** `c5b1e051…` was
  **superseded at that ceremony by `90c1a5d0-f808-4b88-bd28-d2395d9bc26a` at 100 %**; `c5b1e051…` is
  now the rollback target under 裁-156, not the serving version.
- **H-38** (part 1, `:210`) — the owner column reads *"a runtime lane"*. **It is a WEB lane.** The
  Checkout Session create lives at `apps/web/lib/checkout/stripe-session.ts`, where #544 landed the
  fix (`:348-353`, setting `customer_email` only when present because Stripe 400s on an empty value).
  The row is closed; the owner column would have misrouted it.
- **C-25(a)** (part 2, `:100-101`) — anchors the vacuous-green uncoded gate at `0056:1397`. **The live
  body moved.** `packages/db/migrations/0166_close_gate_codeable_population.sql:109` re-cut
  `clara._close_gate_uncoded` for H-12 and **kept** the `financial_date between` predicate (`:125`),
  so the NULL blindness is unchanged but the anchor and its sha pin are not. **C-25(c) — the
  drawer-1 `tie` on an empty registry at `0056:962` — was NOT re-checked against `0167`**, which
  re-cut drawer 2; re-scope it before building.
- **C-35** (part 2, `:146-147`) — names the site `packages/runtime/lib/reconciler-documents.mjs:450`.
  **The full-overwrite `writeTaskMeta` is at `:451`**, and there is a **second one at `:480`** on the
  engine-lost requeue path that the row does not name. Both want the merging `mergeTaskMeta`.
- **C-44** (part 2, `:200-201`) — quotes *"2 rendered `aria-invalid` sites"* against **70**
  `confirmDisabled=` occurrences. **The `confirmDisabled=` count still measures 70. The
  `aria-invalid` number does not reproduce, in either direction:** a plain grep over `apps/web` today
  returns **15 raw occurrences across 11 files**, most of them Tailwind `aria-invalid:` state
  variants inside the shadcn primitives rather than rendered attributes, and a repo-wide tracked
  count returns 41. A separate 2026-09-06 pass reported 26 and that figure could not be reproduced
  here either. **The row's own advice applies to itself — count the file, never any of these lines.**

**One prescription that points at a document nobody has written.**

- **H-10 · H-14 · H-54** (part 2, `:34`, `:36` and `:52`) each prescribe writing something into a
  **close or bank runbook**. **No such runbook exists:** `docs/ops/` holds 29 files today and
  none of them is one (measured by listing the directory, 2026-09-06). The three should be merged
  into a single deliverable — write one close/bank manual carrying the CLR19 mid-close settle
  behaviour, the opening-seed remedy ceremony (`create_opening_seed` → `record_opening_target(s)` →
  `draft_opening_item` → `approve_opening_seed`), and the fact that beginning a close FREEZES the
  whole year.

---

*Written at the final clock-out truing, 2026-09-04, under 裁-185 and 裁-150. Every row names what was
measured, and every row that says "not measured" means exactly that. **The Errata section above was
added 2026-09-06** from the per-item disposition of the owner's flaws list, issue #541 and this
handover's own rows; the four disposition records are filed verbatim under
[`docs/plan/completed/`](../completed/report-disposition-2026-09-06-r3-handover-h.md).*
