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

**What deliberately STAYED in the archive, named here so nobody hunts for it.** A row was left behind
only when its action is DONE, or when its content is a LAW or a practice rather than a task.
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

---

*Written at the final clock-out truing, 2026-09-04, under 裁-185 and 裁-150. Every row names what was
measured, and every row that says "not measured" means exactly that.*
