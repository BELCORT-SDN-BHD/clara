# Clara beta — the handover, 2026-09-04

**Read this first on the next session.** It is written for someone with no session, no transcript
and no task board — only this repo. It carries the posture, what the beta-live e2e proved and
failed, **the complete Backlog and Known-issues list across backend, frontend, harness, ops and
legal**, the harness notes, and an ordered pick-list.

Written at the final clock-out truing under **裁-185** (the owner's GO, 2026-09-04 ≈06:15 MYT) and
**裁-150** (after the e2e this session closes, the repo IS the handover, there are no next lanes).
`PROGRESS.md` stays the state authority and carries short rows pointing at the ids below;
**this file carries the detail.** Its siblings
[`beta-handover-2026-09-04-part2.md`](beta-handover-2026-09-04-part2.md) and
[`-part3.md`](beta-handover-2026-09-04-part3.md) carry the P2 rows, the whole CARRIED registry
(everything already open before the launch night, C-17…C-88) and the documentation truings still
owed.

---

## A · Posture, in plain language

**Clara's beta is LIVE, and it is CLOSED.** `https://app.clarabook.com` serves the real product to
BELCORT and to whoever the owner invites. Sign-ups are not switched off at the platform
(`disable_signup: false`, read through the Supabase Management API), so the closure is an OPERATING
posture — the owner controls who is given the address — not a technical wall.

**What is running — every line below was READ, never assumed, and the reads span 00:24 → 07:55 MYT
on 2026-09-04 rather than one stamp:** the Worker's promotion read back at 00:24:40 and the
workers.dev closure at 01:16, the migration frontier at 01:58:53, the sweep at ≈02:14, the Pages
deletion at 02:39, the estate at 03:08–03:14, the runtime's `fly releases` and full `/ready` at
06:21, and the close-run abandon last, at 07:55.

- **The web** is a Cloudflare Worker, `clara-web`, version **I =
  `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**, deployed at 100 % and carrying six secrets and three
  vars. The custom domain moved from Cloudflare Pages to this Worker at **≈00:31 MYT 2026-09-04**.
  Both `workers.dev` URLs are OFF (404). **The old Pages project `clara` is DELETED** and
  `clara-e3o.pages.dev` no longer resolves — so **there is no repoint rollback**; a broken Worker is
  fixed FORWARD by re-promoting a previously walked version (裁-156, the owner's ruling, dissent
  filed on it).
- **The runtime** is Fly machine **`48ee715b763048`**, 2/2 checks, `/ready` **true**. Its `fly
  status` VERSION reads **74** — and `fly releases --json` at 06:21 settled why: **v71, v72, v73 and
  v74 ALL carry the same image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`.** v72–v74 are the night's
  three `fly secrets import` releases (裁-179's TLS re-import ×2 plus the freeform password), **not
  new code**, so the served code is still the **v71** build of `344f7ad8` and **the next real deploy
  is v75**. `held_outbox` was **6** at the close (0 at 02:39) — **read and explained, not a mystery**:
  the 06:21 `/ready` shows `wakeEngine.heldForDisabledSource` **6** with the warning "6 held/queued
  wake-engine row(s) awaiting a disabled/unregistered source", which is exactly what 裁-165's disabled
  wake sources are supposed to produce (`docs/plan/active/g1-wake-engine-design.md:114` names that
  counter and calls the loudness deliberate). Row **H-44** (part 2, §C.3) carries the one thing left
  to do with it: verify the class when C-05 finally enables the sources.
- **The database** was factory-reset and re-applied from scratch: **159 migrations,
  frontier `0164_checkout_gate_c6_web_reads`**, 19 `clara%` roles, the evaluator freeze reading
  `{"ok": true, "verified_deployed": 7, "verified_registered": 8}`.
- **The estate** holds firms **Alara · Borneo · BELCORT** (`04daf86c-3aaf-4c59-9442-cce93f3582af`,
  `is_operator = true`, the only operator firm the unique index will ever admit) and clients
  Meridian Logistics · Sunrise Retail · Highland Coffee · ROME PROPERTIES `acb60b65…` ·
  **ROME SECRETARY `7a045c7f…`** — active, 86-account chart applied, one sales invoice posted, one
  bank receipt settled, and **FY2025 OPEN with TWO close runs, both ABANDONED**: run 1
  (`0f057658-78d6-4536-b68f-a396b61f0e67`) at 05:39 so the bank settlement could be booked, and run 2
  (`db941c04-f78e-4595-9004-08df90be1631`, begun through the door 05:42:30 only to re-measure the
  gates after that settlement) at **23:55:11Z = 07:55 MYT**, at the clock-out, so **the period wall is
  not left on for the next session**. The Close tab then read "2025-01-01 – 2025-12-31 · open ·
  fy_end: asserted", run state abandoned. **No attestation, no finalize.**
  **BEE CREATIVE SOLUTION and ROME PUBLIC ADVISORY were NOT re-onboarded** — both were constraint-13
  fixtures that went with the schema at the step-4 drop, and only ROME PROPERTIES came back (through
  `onboard-rpr`) plus ROME SECRETARY (through the interview). **They are owed before the next
  full-estate walk** (constraint 13, ADR-0075).
- **`main` = `ba8e7d35`** (#540, the `apps/dashboard` source delete). The hand sweep
  **33781966143** on it came back **SUCCESS, 13 of 13 jobs**, ≈02:14 MYT.

**The one thing that is merged and NOT serving: #533 `d9520061`, F-A2's reconciler unwire.** The
database no longer defines `clara.reconcile_autopost_rules`, the v71 image still calls it, and the
runtime logs `function clara.reconcile_autopost_rules() does not exist` **every ~2 seconds**. The
autopost-rules reconcile belt is inert until **a NEW runtime image built from `ba8e7d35` or later** is
deployed — **the next release is v75**; v72, v73 and v74 are the night's secrets-import releases on
the v71 image and carry no new code. That is row **H-01** and it is the first thing to do.

**What is PROVEN, with its receipt.** The admission chain end to end on the real origin: signup →
a six-digit emailed code → the C-5 confirmation door (one `clara.confirmation_attempts` row,
outcome **accepted**, 167 ms) → the DPA signature (byte-identity against
`docs/ops/legal/clara-beta-dpa.md` §2 HOLDS) → a sandbox MYR 0 Stripe checkout (8 webhook events,
**all 200 OK**) → **BELCORT born** → a member invited. Then the product itself: a client onboarded
through the in-thread interview (19/19, committed with an attestation), the standard chart applied
(86 accounts, 23 families), two invoices uploaded through the Slice-5 intake pair and OCR'd, the
agent's two LLM witness reads matching the OCR and the PDF **exactly**, a journal proposed by
`chatTurn_v17` and approved by the human, a bank statement entered, its line matched and settled,
and a close run whose fifteen gates were evaluated live.

**And the two trial balances, both re-derived by `trial_balance_as_of` from the DB — never read off
a chat reply (constraint 2):**

- **20:58Z** — `1100` Trade Receivables Control **Dr 2,800.00** · `4000` Sales / Fees Income
  **Cr 2,800.00**.
- **21:40Z** — `1020` Bank Current Account **Dr 2,800.00** · `1100` **net 0** · `4000`
  **Cr 2,800.00**.

**The sentence that matters most: every refusal in the whole walk was fail-closed with a plain
receipt, and no wrong number entered the books at any point.** Several things did not work. Nothing
lied.

**One consequence of 裁-177 the owner should see plainly.** The reset ran with **no pre-reset dump**
(the owner ruled it, dissent filed), so ROME SECRETARY's 3,396,500 books — built through the product
at Slice 6 and the estate's standing books pin — are gone. **That pin is UNPROVEN POST-RESET because
its subject no longer exists**, and the two figures above are the new pin. The old database survives
only in the encrypted nightly R2 bundle, whose decryptability has been unproven since 2026-07-22
(row C-14).

---

## B · The milestone tally of the beta-live walk

The denominator is the **eleven** milestones actually enumerated in the repo
([`frontend-sprint-handoff-2026-08-31.md`](frontend-sprint-handoff-2026-08-31.md) plus 裁-83's list),
per **裁-164 part 1**. *Not "16 of 16" — sixteen was never enumerated anywhere, and nothing was
invented to reach it.*

| # | milestone | verdict | receipt / where it stopped |
|---|---|---|---|
| 1 | signup | **PASS** | code sent 18:56:25.199Z, `email_confirmed_at` 18:58:10.340Z; one `confirmation_attempts` row, **accepted**, 167 ms |
| 2 | checkout | **PASS as MYR 0, sandbox** | `checkout_intents` `d827718e…`; `stripe_events` `evt_1UBfwb…` `checkout.session.completed`, livemode **f**, amount_total **0 myr**; **8 events all 200 OK**. No card collected (`payment_method_collection: if_required`) — the non-zero walk belongs to the real-money switch (裁-148) |
| 3 | firm born | **PASS** | `clara.firms` `04daf86c…` BELCORT, 19:07:27.385Z; registration approved with `decided_by` **null** (the self-serve door) |
| 4 | members invited | **PASS on the row; delivery NOT read back** | `firm_invites` `771960a8…`, admin, pending, 19:15:59.283Z, +7 d |
| 5 | client onboarded through the interview | **PASS** | `clientOnboarding_v4` 19:25:15.760Z → completed 19:48:38.5Z; plan 19/19 committed at revision 20; chart 86 accounts / 23 families |
| 6 | documents posted **unattended** | **FAIL** — the chat path passed instead | `autoDraft_v9` admitted twice, refused itself twice with a MASKED `CLR23` (`agent_tasks` `failed · error_code internal`, `tokens: 0` — the model was never called). Row **H-17**. The same invoice WAS coded by `chatTurn_v17` and approved by the human |
| 7 | bank matched in chat | **PARTIAL** | agent READ + PROPOSE **PASS**; agent WRITE **REFUSED** (`payer_identifier_contradiction`, receipt `a451fbfa…`, correct); human settle **PASS** (`e66e9531…`, `bank_matches` `a2409de1…`). **But no statement could be ingested by either AI path** — it entered through the human door |
| 8 | fiscal year opened | **PASS** | `fiscal_years` `c6e02492…` FY2025, 21:21:48Z. **Left OPEN at the clock-out** — two close runs were begun and BOTH abandoned (run 1 at 05:39 to book the bank settlement, run 2 at 23:55:11Z / 07:55 MYT so the period wall is not left on); no attestation, no finalize |
| 9 | year-end closed with human keys | **NOT REACHED — deliberately** | begin/gates/abandon all PASS; finalize never attempted: run 2 came back 2 FAIL + 2 UNKNOWN. **No attestation was made on the owner's behalf** |
| 10 | management-accounts PDF downloaded | **FAIL** | `report_templates` / `report_specs` / `report_artifacts` all **0**; no export tool in `chatTurn_v17`. Rows **H-15**, **H-16** |
| 11 | FY2 opened | **NOT REACHED** | not walked, out of time; nothing blocks it |

**Honest count: 6 PASS · 1 PARTIAL · 2 FAIL · 2 NOT REACHED, of 11.**

**The agentic section (裁-164 part 2), by its own rules** — *"a backend defect found here is a launch
blocker if it breaks (a) or (b)"*:

- **(a) statement → intake → reconciliation → drafts → human — FAIL at the first step.** Both AI
  ingest paths refused, at two different walls (rows H-02, H-03), and the classifier read both
  statements as `other` (H-04). Certify is BLOCKED by a genuine data gap (H-14).
- **(b) chat as the accounting execution surface — PASS on onboarding and on the journal proposal ·
  FAIL on close-prep (H-07) · FAIL on the report render (H-16).**
- **(c) auto-post / automatic wake — OFF BY RULING (裁-165)**, layer 2 ships disabled. Recorded as
  ruled, never as a failure.
- **(d) witness / FA / adjustment authorities — DARK IN THE UI** as predicted; the walk found
  **three more dark doors** (H-18, H-19, H-20).

That is why the launch question was put as a real go/no-go with a real NO-GO option, and why 裁-185
chose a CLOSED beta.

---

## C · The complete Backlog and Known-issues list

**How to read a row.** Every row carries **what was MEASURED** (with the id or path the record
gives), **why it matters**, **the fix shape**, a **size guess** in lane-units (1 unit ≈ one
full-ladder PR: build + one fresh-context opus review + CI), an **owner**, a **ruling number** where
one exists, and a **tier**:

- **P0 — before the first EXTERNAL applicant.** 裁-185 opened beta CLOSED precisely so these can be
  done first.
- **P1 — before 上市** (the official launch).
- **P2 — hygiene.** Real, cheap, and nothing waits on it. **The P2 rows and the CARRIED
  registry are in [part 2](beta-handover-2026-09-04-part2.md) (C-17…C-76) and
  [part 3](beta-handover-2026-09-04-part3.md) (C-77…C-88, plus §C.5's owed truings).**

*A size guess is a guess. A row that says "not measured" means nobody measured it — that is a fact,
not a hedge.*

### C.1 · P0 — before the first external applicant (15 rows)

| id | area | what was measured · why it matters | fix shape · size · owner · ruling |
|---|---|---|---|
| **H-01** | runtime / ops | **The serving image and the schema disagree.** v71 (built from `344f7ad8`) calls `clara.reconcile_autopost_rules()`, which #533 `d9520061` removed from the DB; the runtime logs `function … does not exist` **every ~2 s** since the reset. The autopost-rules reconcile belt is DEAD and the log is a storm that will hide the next real error | **Deploy a NEW IMAGE** built from `ba8e7d35` or later — **the next release is v75** (v72–v74 are the night's three secrets-import releases on the v71 image, measured 06:21 by `fly releases --json`: all four carry `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`) — through the runtime deploy ceremony (`docs/ops/` recipe; the as-run pattern is `docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`). No migration, no quiesce. **0.3 unit** · owner: a runtime deploy lane · 裁-185 pt 2 |
| **H-02** | runtime / db | **The statement lane refuses Maybank.** `statementFacts.v2`'s `persistStatementWitnessPairStep` failed twice: *"the statement header does not state readable ISO period bounds and a statement date"*. Read off the OCR: the Maybank corporate current-account header prints `TARIKH PENYATA / STATEMENT DATE : 30/06/25` and `NOMBOR AKAUN …` and **no period bounds at all** — Maybank does not print "from–to". **This is the most common Malaysian SME bank format**, so bank ingest is effectively unavailable | Derive the period from the statement date's month when the header states no bounds, **or** let the witness infer it with a STATED basis (never a silent guess). A frozen body ⇒ a **new `statementFacts.v3`** + registry repoint (`.claude/rules/runtime-workflows.md`). **1 unit** · owner: a runtime lane · 裁-185 pt 2 |
| **H-03** | runtime | **The statement lane refuses Alliance for a different reason.** The two witness reads COMPLETED (the ALB header passes the bounds gate), then persist failed 3× on *"institution code ALLIANCE BANK is not a live entry in the bank institutions reference"*. **Corrected by measurement: the roster is NOT the gap** — `clara.bank_institutions` holds 17 live Malaysian banks **including `ALB · Alliance Bank Malaysia Berhad · active`**. The witness emits the printed NAME and the door expects the roster CODE | Normalise witness → roster inside `statementFacts_v2`'s successor (name → code lookup against `bank_institutions`, fail closed on no match). Rides H-02's new version. **+0.3 unit** · owner: the same lane · 裁-185 pt 2 |
| **H-05** | runtime | **A failed statement step strands its task.** Both times the run died, the `statement_facts` task was left **`running`, attempt 1, never settled** — and the router refuses to re-mint while a running task exists, so the document is stuck for ever with no operator surface. Cleared by hand both times through `clara.fail_statement_facts(task,'engine_error')` as `clara_fn_owner` | A finally-branch (or a WDK failure handler) that settles the task on step failure, plus a cell that kills the step and asserts the task settles. Rides H-02's new version. **+0.3 unit** · owner: the same lane · ruling: none — measured tonight |
| **H-06** | web | **The human statement door has NEVER been reachable from the web.** `apps/web/components/bank/statements-section.tsx:152-156` builds the header with only period_start / period_end / statement_date / opening_cents / closing_cents; `packages/db/migrations/0038_wave_c_b_bank.sql:1187-1200` (`_stmt_header_norm`) requires `institution_code` **and** `account_number` — "identity needs the PAIR". The form refuses `CLR10 · header_unreadable` every time, and **the selected bank account already carries both values**. With H-02/H-03 open this is the ONLY way a firm can get a statement in | Derive the pair from the selected account and send it. **A one-line fix plus a cell.** `apps/web/lib/bank/doors.test.ts:108` only proves the payload is posted verbatim, so a new cell must pin the pair. **0.3 unit** · owner: a web lane · 裁-185 pt 2 |
| **H-17** | runtime / db | **The unattended coder refuses itself on every sales invoice, and asks a question no answer can satisfy.** `autoDraft_v9` was admitted twice and returned `CLR23 "The counterparty could not be resolved as proposed."` both times; `agent_tasks` read `failed · error_code internal` with `tokens: 0` (the model was never called), and the live `_resolve_counterparty` would have answered `name_match_unregistered`, so **no door refused**. `autoDraft.v9.errors.ts:150-153` maps ANY 23505 whose constraint name contains "counterpart"/"alias" to CLR23. **Diagnosed by code reading, not from an observed stack (stated as such):** `uq_counterparties_client_unregistered_name` is (client, KIND, name) and would not collide, but **`uq_counterparty_aliases_live_name` is (client, alias_normalized) and is KIND-BLIND**, so a vendor-kind or kind-less birth collides with the customer's alias. The agent then opens a human question, and a second admission reproduces it exactly (state `parked`) | Two independent fixes: **(1)** the sales-side pre-flight must pass `kind=customer` (or the alias unique becomes kind-scoped — a migration); **(2)** the errors map must not turn a unique violation into a human question. A frozen body ⇒ **`autoDraft_v10`** + registry repoint. Add a cell reproducing the collision. **1.5 units** · owner: a runtime+db lane · 裁-164's verdict weight |
| **H-18** | web / db | **A real firm cannot enable AI processing for a client through the product.** The coding lane refuses `no_consent` until a live `clara.client_egress_consents` row exists. Steps 1–2 have surfaces (upload; the "Classify as consent evidence" button); **`clara.grant_client_egress` has NO web surface** (`grep grant_client_egress apps/web` → nothing; the Compliance register carries no grant control) and neither does `activate_client_egress_purpose`, which the CLASSIFY gate reads separately (`0123:1404-1426` keys on the typed purpose, not the base consent — two acts by design). Walked tonight only as the owner's delegate through the audited door under 裁-183 | Build the grant + per-purpose activate surface. **The owner's own product view (裁-182 rider) is better:** collect the client authorization letter INSIDE the onboarding interview and grant on commit — one act, no dark door. The MIA By-Law R114.3(b) obligation is per-CLIENT, so a firm-level consent cannot replace it. **2 units** · owner: a web+design lane · 裁-182 **Re-shaped by 裁-186 (2026-09-04): a firm-level declaration signed at the DPA stage auto-consents every client at the onboarding commit — the declaration becomes an admissible evidence kind for the grant door and the successor auto-mints the consent and activates every purpose citing it; a per-client letter uploaded later is an evidence UPGRADE, never a second consent. The lead's per-client dissent is filed once and not relitigated. See the eleventh ledger [`mohe-grill-rulings-2026-09-04-pm.md`](mohe-grill-rulings-2026-09-04-pm.md) and [ADR-0078](../../adr/0078-consent-declaration-attestations-abolished-rbac.md).** |
| **H-35** | web | **A returning unconfirmed applicant cannot find where to type the code.** The "exists-unconfirmed" page says *"We've sent you a six-digit code. Enter it on the next screen…"* and renders **no control to that screen** — `apps/web/components/entry/signup-account-form.tsx` links only `/login` (`:265`, `:325`). Hit twice: at FS-10 S21 by the owner and again at FS-11 step 13, where the lead had to navigate the tab to /auth/confirm by hand | Link to /auth/confirm from that variant (and carry the email through). **0.2 unit** · owner: a web lane · ruling: none — measured tonight |
| **H-36** | legal | **The live DPA is the v1 PLACEHOLDER.** `clara.dpa_documents` holds `clara-beta-2026-08-a`, **99 bytes**, sha `6d1c97a5…7b3`, matching `docs/ops/legal/clara-beta-dpa.md` §2 — so the byte-identity law (裁-90) HOLDS, but the body is a placeholder and the real bilingual v2 is still "proposed". BELCORT signing it is fine; an external firm signing a placeholder is not | Publish v2 as a NEW `dpa_documents` version (append-only; stamp v1's `effective_to`) — **zero code change**, and 裁-90's byte-identity law binds the new sha. **0.3 unit** · owner: the owner + the lawyer pass · 裁-90 / 裁-166 |
| **H-37** | ops | **The Stripe checkout page shows internal ruling numbers to the customer.** The sandbox product description reads *"ClaraBook beta plan — paid beta at the ruled trial price (裁-57/58); amounts not yet ruled."* | Edit the product description in the Stripe dashboard. **Minutes** · owner: the owner · ruling: none — measured tonight |
| **H-42** | ops / security | **Two role passwords were echoed into this session's transcript** by a psql `-c` / `\set` mistake (the ALTERs never ran, so the DATABASE never carried them; the two Fly DSNs imported at step 12 DO). **裁-178, owner, verbatim 「不用rotate le, I DONT CARE」 — NOT rotated, an accepted risk on the record.** The lead's dissent stands | Rotate `clara_auth_wall_login` and `clara_stripe_webhook_login`, then re-import the two DSNs env-to-env in one release. **0.2 unit** · owner: the owner · 裁-178 |
| **H-43** | runtime / ops | **All six runtime lane DSNs use TLS with the certificate UNVERIFIED.** Measured on the machine: before tonight the four original lanes carried **no `sslmode` at all** and connected over a plain `Socket`, `encrypted=false` — **credentials and data crossed Fly (sin) → AWS (ap-southeast-1) in PLAINTEXT.** 裁-179 chose option (c): all six re-imported with `uselibpqcompat=true&sslmode=require` (encrypted, cert unverified), with verify-full named **the first post-beta code PR** | `COPY ops/tls/pooler-ca.crt` into the runner stage of the runtime Dockerfile (the image ships no CA today), then all six DSNs → `sslmode=verify-full&sslrootcert=/app/ops/tls/pooler-ca.crt`, a `fly deploy` and six re-imports. **0.7 unit** · owner: a runtime lane · 裁-179. **ORDERING NOTE:** 裁-179's ledger entry calls this "the FIRST post-beta code item" (`:369`) and 裁-175 says the same of C-07 below; both sit in this P0 block and **putting TLS first is the LEAD's call, flagged for the owner to re-order at the next session's opening** |
| **H-47** | ops / db | **A live re-migration silently flips every ceremonied role to NOLOGIN.** After the full re-apply, `pg_authid` showed **every `clara_%` role at `rolcanlogin = f`** with passwords intact, and the pooler's circuit breaker locked out every consumer (`ECIRCUITBREAKER`); the runtime was 503 for about EIGHT minutes — the first `/health` 503 at 02:00:51, healthy again at 02:09:03 — until four `alter role … login` flips. **No checklist or runbook mentions it.** Same class: `0154_binding_proposal_pr_1.sql:3788` asserts an ABSOLUTE 14-role `clara%` census, and a live cluster carries 15 (the deploy-minted `clara_storage_docs`), so the migration chain **cannot re-apply on a live cluster** without renaming that role past the checkpoint | Two documentation truings plus one guard: a "re-enable LOGIN on the ceremonied roles" step right after MIGRATE in `docs/ops/wave-g-setup-checklist.md` and `docs/ops/DR.md`; the rename recipe beside it; and `0154`'s census re-cut to a roster MAP derived from `packages/db/deploy/roles-bootstrap.sql` (the shape #525 already used for CI). **0.5 unit** · owner: an ops+db lane · ruling: none — measured tonight |
| **C-07** | web (security) | **An uploaded XML executes script in `apps/web`'s OWN ORIGIN, under the session of whichever firm member opens it — and beta is now live, closed, with real uploads.** Measured at `9d5d844e`: `apps/web/lib/documents/bytes.ts` admits the MIME type application/xml, `fetchDocumentBytes` wraps the bytes in a `blob:` URL, `apps/web/lib/documents/open-in-new-tab.ts` navigates a new tab to it, and `apps/web/components/documents/document-metadata.tsx` calls that with **no MIME gate**; there is **no `Content-Security-Policy` anywhere in `apps/web`**. A `blob:` URL inherits the creating page's origin, so an XML carrying an inline stylesheet processing-instruction runs as that member. **MyInvois e-invoices ARE XML — an artifact a Malaysian firm will upload.** The owner ruled it post-beta (dissent filed) while beta was still unlaunched; it sits at P0 here because the closed beta now takes real documents | A MIME allowlist on open-in-new-tab (PDF + images), XML served as an attachment or through the structured view; **CSP is its own row**. **0.5 unit** · owner: a web lane · 裁-175. **ORDERING NOTE:** `ruling-175.md:21` calls this the "first post-beta code item" and 裁-179 says the same of H-43 above; **TLS first is the LEAD's ordering of two rulings that each named itself first, flagged for the owner to re-order at the next session's opening** |
| **H-48** | runtime | **A lane whose credential is wrong is invisible until first use.** `CLARA_FREEFORM_DATABASE_URL`'s password did not match `clara_freeform_login`'s — a mismatch LATENT since the F-A6 ceremony, never surfaced because the lane is lazy and the boot assert checks env PRESENCE only. It only appeared because 裁-179's probe touched every lane | Probe each lane DSN with a `select 1` at boot or in `/ready`, and fail the readiness check loudly. Beside it, the pooler lesson: **after an `ALTER ROLE … PASSWORD` through Supavisor, wait ≥ 2 min before calling a lane dead** (the auth verifier is cached; `pgbouncer.get_auth` is not readable by `postgres`). **0.5 unit** · owner: a runtime lane · ruling: none — measured tonight |

### C.2 · P1 — before 上市

**Product defects and gaps found by the walk**

| id | area | what was measured · why it matters | fix shape · size · owner · ruling |
|---|---|---|---|
| **H-04** | runtime | **The classifier does not recognise bank statements.** Two different banks, two different documents: `doc_classify · clara-classify-llm:v1` returned `{"verdict_kind":"other","confidence":0.05,"low_confidence":true}` for the 4-page Maybank statement and `other` at confidence **0** for the 5-page Alliance one. The low-confidence hold worked as designed (a human resolved the kind), but the most common document class in the product is unrecognised | Prompt / few-shot work on the classify lane, with a measured recall bar over the desktop corpus before and after. **0.7 unit** · owner: a runtime lane · ruling: none |
| **H-07** | runtime | **The close-prep chat lane cannot read a close run.** Clara answered `CLR-FREEFORM-B: read_unavailable`. Traced by code read: the DB correctly refused the model's SELECT because the close tables are **not on the freeform door's enumerated relation list** — fail-closed and right, but it makes 裁-164(b)'s close-prep leg unreachable through the product | Add the close relations to the enumerated list, with the receipt naming them. A frozen body ⇒ a new `chatTurn` freeform version. **0.7 unit** · owner: a runtime lane · ruling: none |
| **H-08** | runtime | **The refusal MISDESCRIBES its own cause.** `read_unavailable` is the COLLAPSED oracle token of `packages/runtime/workflows/chatTurn.v15.freeform.ts` (five reasons → one token, Annex D.2, deliberately oracle-safe), but its sentence is `readToolRefusalMessage({code:"42501"})`, which resolves to CLR03's *"This action needs an active bookkeeper (or higher) session for the firm."* The owner — who WAS the firm's owner and WAS signed in — was told to fix his session | Give the 42501 collapse its own oracle-safe wording ("this read is outside what the audited read door may see"), never CLR03's. Rides H-07. **+0.2 unit** · owner: the same lane · ruling: none |
| **H-09** | web / product | **The agent's bank settle refuses on an identity rung the product gives no way to satisfy.** `settle_from_bank_line` returned `CLR-BANK-B: payer_identifier_contradiction = not_evaluable`; receipt `a451fbfa…` shows every other rung passing. The customer has no payer identifier on file and the bank line's `KONG CHENG RESTAURA*` is a name fragment — **names are not identity, at the bank ledger.** Correct behaviour; but there is no UI to record a payer identifier | (1) Explain the refusal in the product's own words on the receipt card; (2) build the surface to record a counterparty payer identifier. **0.7 unit** · owner: a web lane · ruling: none |
| **H-11** | web | **After "Abandon close" the Close tab offers no "Begin close" button** — only the FY header and the abandoned run's gates. A second close run cannot be begun from the web; tonight's run 2 had to go through the door as the owner's delegate. **FIELD PROOF, taken again at the clock-out:** after run 2 was abandoned through the Close tab's own dialog at 23:55:11Z, a find over the main pane for "Begin close" returned **nothing** — only the FY header and the abandoned run's gates rendered. The row stands as written | Render "Begin close" whenever the FY is open and no run is in progress. **0.2 unit** · owner: a web lane · ruling: none |
| **H-12** | db | **The `uncoded_documents` close gate will FAIL every close once a statement is filed.** Run 2 measured `uncoded = [{filing 18d077b2…, document 38c8fd49… (the MBB statement), financial_date 2025-06-30}]` — a bank-statement filing carries a financial date and never gets a journal entry, so the gate reads it as uncoded. **A false fail on a blocking gate** | Exclude statement-kind filings from `_close_gate_uncoded`, or stop stamping a financial date on a statement filing. Pick one, with a cell for each direction. **0.5 unit** · owner: a db lane · ruling: none |
| **H-15** | db / product | **No statutory report can render at all.** `report_templates` · `report_specs` · `report_spec_versions` · `report_artifacts` all read **0** on the fresh estate; `finalize_close` seals artifacts against a template VERSION and none is seeded | Seed at least one management-accounts template version (a data act with its own ceremony, not a migration), then re-walk milestone 10. **1 unit** · owner: a reporting lane · ruling: none |
| **H-16** | web / runtime | **The Reports tab tells the user to ask for something the agent cannot do.** Its copy reads *"Ask Clara, in the rail, to build a sandbox view or request an export"*; `chatTurn_v17` carries no export tool, and Clara said so: *"no export tool is available."* A web↔runtime contract gap | Either give the chat an export tool (a new chatTurn version) or re-cut the copy to what exists today. Decide which; the honest copy is the cheap half. **0.3–1 unit** · owner: a web or runtime lane · ruling: none |
| **H-21** | db | **The onboarding interview's captures are never projected.** `commit_client_onboarding` (`0017_wave_b.sql`) sets `clients.status='active'`, snapshots the plan, audits, and **projects nothing else, by design** — measured immediately after the commit: `client_facts` **0 rows for RS and 0 in the estate**, `clients.fy_end_month/day` **NULL despite `fye=12`**, `bank_accounts` **0** despite the banks answer, and **`client_identifiers` 0 despite the SSM being captured.** It bit four times in one night: the FY-end dialog re-asked, `closing_stock_present` came back UNKNOWN on `trade_nature_fact_absent`, no bank account existed, and — **the expensive one** — the client's own sales invoice sat `direction_unresolved` because `_direction_from_extraction` (`0049:872-951`) found no matching identifier and took the `CLR30` contradiction branch. **Every interview-onboarded client will hit that** | Project the captures at commit: SSM/TIN → `client_identifiers`, FYE → `clients.fy_end_month/day`, MSIC / entity type → `client_facts`, the banks answer → a proposal (not a silent `bank_accounts` row). Each is an audited write through an existing door. **`trade_nature` is NOT part of this row: the interview never ASKS it** — measured on screen at 03:57, where the apply-chart dialog said in its own words "Clara could not read every fact her proposal depends on. Missing: trade_nature." So clearing `closing_stock_present`'s `trade_nature_fact_absent` needs **a new interview question or a fact door, not a projection**; see C-29 for the `closing_stock` producer half. **1.5 units** · owner: a db lane · ruling: none |
| **H-19** | web / ops | **`set_sales_lane_activation` has no web surface — and the walk had to FLIP it by SQL.** `firm_limits.sales_lane_active` is false by default (BELCORT had no `firm_limits` row at all), and while it is false a sales document's counterparty reason is mislabelled `vendor_unresolved` and `tier_a_fails` never drops out. **As run under 裁-183: the lane is now ACTIVE for BELCORT — `firm_limits.sales_lane_active = true`, watermark `2026-09-02T16:00Z`, audit `set_sales_lane_activation ok` at 20:43:16Z with `was_active false`** (the watermark was set deliberately BEFORE the walk's filings; the door's own copy warns that activating without one sets it at NOW, so **everything filed before a watermark is backlog by design and moves only through a recorded batch**). The defect is the door, not the state: EXECUTE is held by `clara_fn_owner` only, it carries no `_human_ctx`, and it was walked as clara_fn_owner by SQL because nothing in the product can reach it | Either a documented operator ceremony (like the G1 operator-firm one) or an operator-floor control — and a surface that shows a firm its sales-lane watermark. **0.5 unit** · owner: an ops or web lane · ruling: none |
| **H-20** | web | **`clara.add_client_identifier` has no web surface** — the only web mention is a needs-you gap notice. With H-21 fixed this becomes a repair door rather than a routine one, but it is still needed | A control on the client's identity panel, bookkeeper-floored. **0.3 unit** · owner: a web lane · ruling: none |
| **H-26** | web | **The onboarding checklist renders every structured answer as `[object Object]`** — the `interview_run` capture item shows the literal text, and so do ssm, mpers, framework, basis, coa, opening, fa and samples. Seen throughout the main onboarding journey | A reader for the capture item's answer shape. **0.3 unit** · owner: a web lane · ruling: none |
| **H-27** | web | **The interview echoes RAW capture JSON back to the user.** The "You · ssm" line renders `{"form":"combined_unified_and_legacy","normalized":…,"format_verified":true}` instead of the registration string; the mpers step renders `{"test":"ca2016_s244_private_entity","determination":"eligible"}` | Render the human-facing value, not the capture envelope. Rides H-26. **+0.2 unit** · owner: the same lane · ruling: none |
| **H-30** | web | **The apply-chart dialog is taller than the viewport and does not scroll.** The owner could not reach the Apply button (「我按不到」) and Playwright's click also failed with *"element is outside of the viewport"*. The chart was planted by activating the dialog's own button programmatically, with the owner's explicit intent on record | `max-height` + internal scroll, or a sticky footer. **0.2 unit** · owner: a web lane · ruling: none |
| **H-38** | runtime | **The checkout session does not carry the applicant's email**, so they retype it on Stripe's page and a typo births a Stripe customer under a different address than the registration | Pass `customer_email` into the session create inside `open_checkout_intent`'s caller. **0.3 unit** · owner: a runtime lane · ruling: none |
| **H-39** | ops | **Two Stripe webhook endpoints point at the same URL.** #1 (API `2026-08-26.dahlia`, payload **snapshot**, 233 events) is the one the C-2 handler reads; #2 (no API version, payload **thin**, 24 events) double-delivers. The op_key idempotency absorbs it, but it is noise and a second signing secret nobody holds | Delete endpoint #2 in the Stripe dashboard. **Minutes** · owner: the owner · ruling: none |
| **H-40** | ops | **Two Supabase auth settings disagree with the checklist and no decision was taken:** `jwt_exp` = **3600** where the checklist expects **900**, and `password_hibp_enabled` = **false** where the checklist says HIBP on. Both read through the Management API | Two owner decisions, then two dashboard changes and a read-back. **Minutes** · owner: the owner · ruling: none |
| **H-45** | ops | **裁-169's number 1 — the Resend plan's mail cap — was never read.** Number 2 is now on the record (`rate_limit_email_sent` = **100/hour**, Management API). Security-pass line 6 is ticked against one of its two operands | Read the cap from the Resend dashboard with the plan name and write both numbers into `docs/ops/wave-g-setup-checklist.md`. **Minutes** · owner: the owner · 裁-169 |
| **H-46** | ops / legal | **The Mail gate (裁-146 pt 3) is not formally certified.** Two six-digit codes DID arrive: one at a **NON-team private Gmail** at FS-10 S21 (after the OTP-length fix) and one at `tools@belcort.com`, a **TEAM address**, at FS-11 step 13 (sent 18:56:25Z, verified 18:58:10Z). **Time-to-arrive and the From header were asked and are NOT recorded.** So the transport, the sender identity and the non-team delivery are all proven in substance; the ceremony's own certification line is not ticked | The owner rules whether the S21 Gmail code discharges 裁-146 pt 3; if not, one more send with the time and From recorded. **Minutes** · owner: the owner · 裁-146 |
| **H-49** | ops / db | **DR STRICT probe `4.9` has lost its subject.** The parked S4-V2 canary's clara-side rows went with `DROP SCHEMA clara CASCADE` (裁-160, accepted), and `packages/db/scripts/dr-verify-checks.mjs` **hard-codes those ids at `:398-399` and `:414-415`** — so naming a replacement is a CODE change. **Recorded UNPROVEN IN THE FIELD from 2026-09-04**, never silently skipped | Re-point `4.9` at a post-reset durable run with both a `workflow.workflow_runs` row and a clara-side projection — candidates: the `clientOnboarding_v4` run of 19:25:15.760Z, the `witnessFacts_v3` run of 20:33:50Z, the walk's `autoDraft_v9` / `chatTurn_v17` runs. Prefer a DERIVED subject over a new hard-coded id. **0.5 unit** · owner: a db lane · 裁-172 |

**Rows the walk did NOT find — already ruled, already owed, and still P1.** They are listed here
with their ruling so the pick-list is complete; their full text is in
[part 2](beta-handover-2026-09-04-part2.md) §C.4 and its
[part 3](beta-handover-2026-09-04-part3.md) continuation unless noted.

| id | area | one line | ruling |
|---|---|---|---|
| **C-01** | product / billing | **The pre-上市 roadmap, in order:** the pricing sitting → the billing TIER tranche → the lawyer's pass over the DPA / terms / consent text → the real-money switch (Stripe live mode + `CLARA_STRIPE_LIVEMODE` + KYB + the NON-ZERO checkout walk Wave-G no longer does) = 上市 | 裁-58 · 125 · 126 · 144 · 148 · 150 |
| **C-02** | db / runtime | **The billing TIER tranche is designed and unbuilt** — paid seats, Active-Client slots, the shared firm-wide AI allowance and its overage, invoicing, **and an AI usage LEDGER**, which is also the reason **AI is UNMETERED in beta** (zero `ai_usage`/token-ledger migrations exist). Build the LEDGER and the lifecycle states FIRST so usage history exists from day one. **The design is [`billing-design.md`](billing-design.md) §5 — PR-1's remainder (price-config tables, client lifecycle states, seat capacity, the capacity walls) and ALL of PR-2 (the deterministic monthly invoice evaluator under constraint 2, invoices/invoice_lines, the issuance door); the owner's own specification is filed verbatim at [`billing-model-owner-spec-2026-09-03.md`](billing-model-owner-spec-2026-09-03.md).** ≈6–10 units | 裁-144 (裁-42/58 for amounts) |
| **C-03** | web | **The C-2 operator screen** — `list_stripe_event_problems` / `resolve_stripe_event_problem` are live, granted and walled, with **zero callers**. Until it exists the Wave-G checklist's manual line is the surface (read EMPTY at the walk and at cutover; it read 0 rows at 03:11:01). Build it next to the unclaimed-payment queue, which owes the same surface | 裁-147 |
| **C-04** | runtime | **The pool error contract** — `packages/runtime/lib/relay.mjs` attaches no `'error'` listener, so any idle-backend error becomes an `uncaughtException` and the process dies (Fly restarts it; durable runs resume). Ruled: the general pool logs + counts + raises a `/ready` flag; the LEADER stays crash-loud because losing its advisory lock is the designed failover; the behaviour becomes a CONTRACT in `docs/ARCHITECTURE.md`. ≈0.5 unit | 裁-149 |
| **C-05** | db / runtime | **G1 PR-2** — the two producers, the eight deferred DB items and the `bank_agent_due_claims` retention path, then the 裁-40 flip through the G1 operator door. This is autonomy layer 2, OFF by ruling for beta | 裁-165 |
| **C-06** | legal | **The beta Terms of Service** — a separate document kind from the DPA (never one combined signature): the `kind` discriminator + per-kind partial unique index + `sign_dpa`'s carrier gaining `kind`, 裁-90's byte-identity law extended, the RM 5,000 floor and the 27 `[LAWYER]` / 34 `[verify]` markers resolved with the lawyer | 裁-129 · 裁-166 |
| **C-08** | web | **The ten 裁-176 ports/fixes** — the adjustment template panel + model (incl. the all-zero "balanced" defect), `CounterpartyPicker`, `OpeningCeremony` (step 1 = read `0018`'s mixed-batch rule), `QueueRowView` (direction-aware noun + severity as colour AND shape), `SeedingProposalRow`, `adjustmentApi`, `advancesApi` (**a live defect**: `staff-advances-register.tsx:45` sends `businessToday()` where the DB must decide today), `agingApi` (envelope-shape guard), and `dbSeamCensus` (**REBUILD, flagged INFRASTRUCTURE, before 上市**) | 裁-176 (a)…(l) |
| **C-09** | db / ops | **The checkout / webhook follow-ups before the real-money switch** — the postverify guard's hardcoded role list omitting the four checkout-gate roles; a durable trace for a DOOR refusal on the webhook path; and the RM0 relaxation's forward hazard (a NULL `payment_status` must be treated as NOT settled once the relaxation tightens). **The filed SHAPE of the durable trace, so it is not re-designed:** a NEW sibling relation `clara.stripe_event_refusals` (event_id text, deliberately NOT an FK — that FK is a merged C-2 wall — append-only, owner-only forced RLS), written by ONE new SECURITY DEFINER verb granted to `clara_stripe_webhook` and called from the route's CLR10/23514 arm before the 400. **Cost stated: it takes that role from two executable routines to three, which REDS `c2.8`, `0160`'s fail-closed tail and `c5db.6`** — the follow-up updates those three pins deliberately | 裁-57 · 裁-120 |
| **C-10** | db | **`livemode` is stored and never read** (the webhook route gates on `CLARA_STRIPE_LIVEMODE`, fail-closed when unset); **and a paid applicant who then joins another firm strands their payment** — reachable only through the audited SQL door today. Both are zero-cost at MYR 0 and both are owed before the real-money switch | 裁-120 A-M5 / A-M4 |
| **C-11** | runtime | **SSE re-authorisation on the poll tick** — `assertTaskStreamAccess` runs once at open, so a removed member keeps the live transcript for up to 30 min | 裁-120 B-M3 |
| **C-12** | runtime | **`/ready`'s hard storage gate** (#460) is mid-review and archived; 裁-61 ruled a hard readiness failure and that ruling re-opens with the PR. The incident's other two follow-ups stand: a permanent CI battery over the storage **grant** surface, and the storage-role re-examination | 裁-61 |
| **C-13** | db / runtime | **The archived backend queue** — #447 (BS-2 kind wall) · #448 (BS-3 unique violation) · #452 (binding PR-3) · #456 (G1 PR-2a DB) · #449 (G1 PR-2b runtime) · #460. Each closed PR carries a resume note; re-integration is one lane each, **from the resume note, never from memory** | 裁-123 |
| **C-14** | ops | **The monthly-light restore drill is overdue since 2026-07-22 and the latest R2 bundle's decryptability is unproven since then.** 裁-177 waived tonight's pre-reset dump, so the pre-reset database now survives ONLY in that unproven bundle | 裁-163 |
| **C-15** | db | **P6-1's bigint wire boundary** — `wake_freeform_read` emits `read_id` as a JSON number, so ids above 2^53 round; `chatTurn_v16` fails closed. Fix = emit `read_id::text` + move `apps/web/lib/reports/types.ts` to `id: string`. A live-writer D1 window | 裁-71⑨ |
| **C-16** | ops | **Single-machine Fly runtime, no HA** — the blast radius of one machine is chat, turns, SSE, interviews and reports. Keep the ruled hard storage gate on one machine, or fund two-machine HA. Plus external `/ready` uptime alerting, which is owed and unbuilt | ADR-060 / DR.md |

---

## D · Harness notes for the next session

**Clock in, in this order.**

1. **`PROGRESS.md`** — posture, lanes, next, the short Backlog and Known-issues rows.
2. **THIS FILE** and its [part 2](beta-handover-2026-09-04-part2.md) and
   [part 3](beta-handover-2026-09-04-part3.md) — the detail behind every row.
3. **[`docs/adr/README.md`](../../adr/README.md)** (the digest, the LAW) and its ruling rows, which
   now live in **[`docs/adr/README-rulings-2026-09.md`](../../adr/README-rulings-2026-09.md)** — the
   digest hit its 500-line ceiling on 2026-09-03 and every new row is written in the sibling. The
   dated minutes are in [`README-log.md`](../../adr/README-log.md).
4. **The ruling ledger chain**, newest last: `-08-31` → `-09-01` → `-09-01-pm` → `-09-02` →
   `-09-02-pm` → `-09-03` → **[`mohe-grill-rulings-2026-09-04.md`](mohe-grill-rulings-2026-09-04.md),
   which holds 裁-151…185**. Each file continues the previous one at its ceiling. The **texts of
   record** for 裁-151…177 are one file each under
   [`docs/plan/completed/owner-rulings-151-177-2026-09-03/`](../completed/owner-rulings-151-177-2026-09-03/)
   and those govern on any divergence.
5. A codebase-graph query (`codebase-memory-mcp`) plus the one `AGENTS.md` menu row your question
   needs. **Query the graph before you grep.**

**Things that will bite you if nobody tells you.**

- **The 500-line document ceiling is a WRITE-BLOCKING PreToolUse hook, not a CI gate.** A 501st line
  is refused AT THE WRITE, so you **archive or split BEFORE you add**. Every file this truing AUTHORED
  is ≤ 480 lines for headroom; **the two ADR files are the named exceptions, and they are not the
  same case** — `docs/adr/README.md` already stood at **499** on `main` and was trued IN PLACE with
  no line added, while `docs/adr/README-log.md` was **445** and this truing deliberately grew it to
  **499**, because the five dated minutes belong in it. Both are under the hook and both now have no
  headroom, which `PROGRESS.md`'s ceiling row records — along with the fact that the repo already
  holds 20 files at exactly 500 and 31 above it. `PROGRESS.md`'s overflow goes to
  `docs/plan/completed/progress-archive-2026-08-part7.md` (then `-part8.md`), byte-for-byte, with the
  moved text verified present in the archive before the source loses it.
- **`PROGRESS.md` has ONE author per PR.** Two lanes editing it is how a truing loses a row.
- **Ceremonies run from merged `main`, never from a branch**, and a live DSN reaches a ceremony only
  through `scripts/ops/dsn-pipe.mjs` against a throwaway `clara-backup` sleeper machine
  ([`docs/ops/dsn-bridge.md`](../../ops/dsn-bridge.md)). **The FS-11 sleeper `6834e7da567358` was
  DESTROYED at this clock-out; mint a new one per that runbook.** Give it a sleep that outlasts the
  ceremony (**≥ 6 h**) — tonight's died twice mid-ceremony, and `dsn-pipe: stdin was empty` means
  *the sleeper died*, never *the DSN is wrong*.
- **NATIVE LANES ONLY until the owner rules otherwise (裁-133).** sonnet-5 xhigh for bounded,
  mechanical, objectively testable work; opus-5 xhigh where judgement, security or ambiguity
  dominate, **and for every review**; Fable orchestrates. 裁-111 (the cross-family Codex review leg)
  is likewise SUSPENDED, not repealed. **Both are the owner's to resume at the next session's
  opening (裁-171)** — and the suspension binds the AGENT's lanes, not the owner's own tools.
- **Stripe stays in the SANDBOX for the whole beta (裁-126)**, at MYR 0 (`amounts_ruled=false`).
  Live mode, KYB and the non-zero checkout walk are one ceremony, after the pricing sitting.
- **The pinned ids are hard-blocked by a PreToolUse hook** — canary `daba7f2e` is NEVER answered,
  witness `d023b48c` is NEVER approved (`scripts/hooks/pinned-ids-guard.mjs`). Their clara-side rows
  died with the schema (裁-160); the hook and the constraint are unchanged.
- **Workflow bodies are frozen once deployed.** Every fix to `chatTurn`, `statementFacts`,
  `autoDraft` or `interview` in this list is a **NEW `_vN` export plus a registry repoint** — never
  an edit. `.claude/rules/runtime-workflows.md` and freeze-lint enforce it.
- **The test-data authority (constraint 14) is DATA-scoped and EXPIRES AT BETA — and beta is now
  live.** BELCORT is the operator firm; ROME SECRETARY, ROME PROPERTIES, BEE and the seed fixtures
  are resettable test data. **But 裁-162's supersession of `docs/ops/DR.md`'s owner-run classifier
  was FS-11-scoped and has expired: from here, no agent-run destructive command against the live
  project.** Ask the owner.
- **裁-183 is the night's standing precedent, and it is narrow:** where a mechanism is live but its
  FACE is missing or defective, the lead may walk the DOOR as the owner's delegate — through the
  real audited door with the human context, receipted — and must record both. It is not a licence to
  bypass a wall; **the product's security mechanisms are never weakened for testing convenience.**
- **CI is GitHub-hosted (裁-135), the repo is PUBLIC**, and the four WSL runners are stopped and
  disabled. After merging a PR that touches a closed drill or the pipeline itself, run
  `gh workflow run ci.yml` **by hand** — and read a sweep's verdict from `gh run view`'s job list,
  never from a PR's colours.
- **REMOVING A WORKTREE IS JUNCTION-UNSAFE ON THIS HOST — a law, paid for twice.** Never
  `robocopy /mir` any worktree without `/XJ`: on 2026-09-01 a cleaner lane followed a junction out of
  a reviewer worktree and filesystem-deleted **2000 tracked files** under the MAIN checkout's `apps/`
  and `packages/` (git index untouched; `git restore` recovered everything). And
  `git worktree remove --force` is **NOT** junction-safe either: on 2026-09-02 it followed a lane's
  `apps/web/node_modules` junction into the main checkout's real install and emptied it (`next` gone,
  `.pnpm` damaged; repaired by a link-aware remove plus `pnpm install --frozen-lockfile`).
  `Remove-Item -Recurse` on a directory that still contains junctions is equally unsafe. **The
  junction-safe primitive is: unlink every reparse point FIRST (`fs.rmdirSync` on the link itself),
  re-walk to prove none remain, THEN remove the directory. Post-flight is `git status` on the MAIN
  checkout plus `ls apps/web/node_modules/next`.**
- **EVERY GIT-ACTIVE LANE RUNS IN ITS OWN WORKTREE — no docs-only exception** (two shared-tree
  incidents in one night, 2026-08-23; the second put a landing commit on LOCAL `main`). A lane cannot
  see another lane's checkout, so its own care is not the control — isolation is. Cut every branch
  inside your worktree, print `git branch --show-current` INSIDE the commit command rather than
  before it, and after any surprise resolve state against `git show origin/<branch>:<file>`, never
  against a working tree. *(Related, archived rather than repeated here: MAX_PATH breaks git's own
  RECOVERY verbs, so the practice is `git rebase --quit` → MIXED reset → `symbolic-ref`, never
  abort-then-hard-reset — full text in `progress-archive-2026-08-part2.md`.)*
- **Drive the db suite with libpq `PG*` vars plus `CLARA_ALLOW_DESTRUCTIVE=1`, NEVER `DATABASE_URL`**,
  and cure a WSL split-brain with a full `wsl --shutdown` while runners are IDLE, then one keeper.
- **Two instrument laws learned the hard way tonight.** Never pipe a long-running or MUTATING script
  to `head`/`grep` — a closing pipe kills it mid-run (it cost a half-finished Pages deletion). And a
  secret-prompt script is **dry-run against its own ERROR path, through the real pipe, with a dummy
  value**, before an owner types a real one (that is how 裁-178's leak happened).

**Owner-side acts nobody else can do:** the two `clarabook-frontend` recut PRs (裁-168); the Stripe
product-description edit (H-37) and the duplicate webhook endpoint (H-39); the two Supabase auth
decisions (H-40); the Resend cap read (H-45); the Mail-gate call (H-46); the elevated-shell removal
of the LOCKED worktree shells and the WSL `.vhdx` compaction (裁-173) — **and that removal is
junction-unsafe by default: see the law in §D, unlink every reparse point FIRST or it follows a
junction into the main checkout, which has happened twice**; and destroying his own
`codex-e2e-rate-wall-sleeper` machine on `clara-backup` when he is done with it.

**One process item owed, not discharged:** 裁-171 ordered the twenty knowingly-open items read aloud
item by item at the launch sitting. **The walk consumed the sitting and the reading did not happen.**
**The list is ENUMERATED, item by item, at
[`launch-sitting-record-2026-09-04-part1.md`](../completed/launch-sitting-record-2026-09-04-part1.md)
§3** ("THE TWENTY KNOWINGLY-OPEN ITEMS", line 362), and every item is also a row above or in parts 2
and 3 — find each by its NAME, never by a line number, because the prep's own anchors are stale by
construction. **The READING is a next-session item.**

---

## E · The recommended pick-list, in order

**Everything in block 1 is P0 and the beta stays CLOSED until it is done.** Blocks 2 and 3 are P1;
block 4 is hygiene and can ride any lane that has the file open.

1. **Open the door for outsiders — the P0 block.**
   **(1)** H-01 deploy a NEW IMAGE (**v75 or later**) — one ceremony, retires the log storm and
   revives the belt.
   **(2)** H-06 the "Enter a statement" pair — one line, and it is the only bank ingest path that
   works today. **(3)** H-02 + H-03 + H-05 as ONE `statementFacts.v3` train — the period-bounds
   inference, the witness→roster normalisation, and the task settlement. **(4)** H-17
   `autoDraft_v10` — the kind-scoped counterparty birth and the un-masked error map. **(5)** H-18 the
   consent surface, built the owner's way (in the interview, granted on commit — 裁-182). **(6)**
   H-35 the confirm link. **(7)** H-36 DPA v2 + H-37 the Stripe copy — both owner acts, both minutes.
   **(8)** H-43 verify-full TLS, **(9)** C-07 the XML MIME gate, and **(10)** H-42 the two password
   rotations. **(11)** H-47 + H-48 — the re-migration runbook truings and the per-lane boot probe.
   **The order of (8) and (9) is the LEAD's, and it is flagged:** 裁-175 calls C-07 the "first
   post-beta code item" (`ruling-175.md:21`) and 裁-179 says the same of H-43 (ledger `:369`). Both
   sit in this P0 block because the P0 block IS the post-beta code queue; **TLS first is the lead's
   call, and the owner should re-order it at the next session's opening if he disagrees.**
   *Rough total: **7 lane-units** plus a handful of owner minutes.*
2. **Make the product whole — the walk's P1 product rows.** H-21 (the capture projection — it
   unblocks four separate symptoms and is the highest-leverage single row in this list), then H-12,
   H-11, H-26/H-27, H-30, H-09, H-20, H-19, then H-07 + H-08 together, then H-15 + H-16, then H-04.
3. **The pre-上市 roadmap (C-01), in its ruled order** — the pricing sitting (裁-58, the only thing
   everything downstream waits on) → the billing tier tranche + the AI usage ledger (C-02) → the
   lawyer's pass over the DPA, the terms and the consent text (C-06) → the real-money switch with KYB
   and the non-zero checkout walk. Alongside it, at whatever pace suits: C-03, C-04, C-05, C-08,
   C-09, C-10, C-11, C-12, C-13, C-15, C-16, and H-49. *(C-07 is no longer here — it moved into the
   P0 block, above.)*
4. **Hygiene** — [part 2](beta-handover-2026-09-04-part2.md) §C.3 and §C.4, and
   [part 3](beta-handover-2026-09-04-part3.md)'s §C.4 continuation and §C.5. None of it blocks
   anything; most of it rides a lane that already has the file open.

**A closing note on what tonight was worth.** Nine of the fifteen P0 rows, and most of the P1
product rows, were found by walking the real product against real Malaysian documents on the live
estate — the statement walls, the classifier's blindness, the stranded task, the web↔door gap, the
masked autodraft refusal, the dark consent door, the capture-projection gap. **A mocked end-to-end
would have found none of them.** That is the argument for doing it again before 上市.
