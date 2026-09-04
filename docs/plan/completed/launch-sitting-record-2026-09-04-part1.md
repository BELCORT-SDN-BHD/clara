*Part 1 of 3 of the beta launch-sitting record (2026-09-03 → 09-04) — filed VERBATIM at the final clock-out truing. **Parts 1 and 2 are the sitting's PREP template, written before the walk; part 3 is the sitting AS IT HAPPENED and governs on any divergence.** Previous: none (this is the first part) · Next: `launch-sitting-record-2026-09-04-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# THE LAUNCH SITTING — agenda + RECORD TEMPLATE

**Status: TEMPLATE — the sitting has not convened.** Written read-only at `origin/main` =
**`9d5d844e`** (PR #539 merged 20:48 MYT 2026-09-03), measured 2026-09-03 ≈21:1x MYT by the shell
clock. Nothing here was executed.

**What this is.** The owner's beta-live **go/no-go** with the lead, held after **FS-10** (the
cutover) and **FS-11** (the reduced Wave G), in the same sitting as both (裁-174). It is a record to
be filled, not a reading. Every gate discharges on a **positive read with its instrument named**;
an absence discharges nothing and a derived state is not evidence
(`docs/product/EVALUATION_RUBRIC.md` DF-1 / DF-2 / DF-3 / EV-9).

**Two decisions this record used to owe are RULED.** DS-07 is **裁-167**; the two design-repo recut
PRs are **裁-168**. Neither is re-opened here — they are read out and recorded.

**The bar, in four lines.**
- **DF-1 / EV-1** — every gate discharges on a positive read with its instrument named. *A report is
  not a measurement* (裁-112).
- **DF-2 / DF-3 / EV-9** — "no error appeared" and "the deploy exited zero" are both refused.
- **DF-5** — *"a wall that never refused anything is not a wall that held — it is a wall that was
  never asked."* Any refusal criterion counting zero on the corpus is recorded **UNPROVEN IN THE
  FIELD**, with **which** of the two it was.
- **IT-4 / V-OWNER** — the own-eyes acts are cells **an agent can never satisfy**. That is the whole
  reason this sitting exists.

**裁-135 governs the paperwork.** The repo is **PUBLIC**. No as-run, ledger or `PROGRESS.md` line
written tonight may carry a secret, a DSN, a `whsec_`, a healthchecks ping URL or a PAT value.
**Hashes and redactions only.**

---

## 0 · PRECONDITIONS — the sitting does not convene until every one is filled

| # | precondition | instrument | `[ ]` | as read |
|---|---|---|---|---|
| P1 | **FS-10's as-run is CLOSED and filed** in `docs/plan/completed/` — Pages Git integration disconnected FIRST, the preview walked route by route, the domain attached, **S21's real-origin re-walk clean including confirm and recover**, the Pages project **deleted in the same sitting** (裁-156 — **no soak**) | the as-run path + its S21 verdict | `[ ]` | |
| P2 | **FS-11's as-run is CLOSED and filed** — `docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md`, every proof artifact retained (裁-122) | the as-run path | `[ ]` | |
| P3 | **The `apps/dashboard` SOURCE-delete PR is MERGED** (裁-158 — the owner ruled it lands **before** beta live; merge gate was FS-10 S21 passing) | `gh pr view <n>` → MERGED, sha | `[ ]` | |
| P4 | **The sweep AFTER that merge was dispatched by hand and read from the JOB LIST** — never a PR's colours | `gh run view <id> --json jobs` | `[ ]` | |
| P5 | **The FS-10 precondition sweep** — 裁-174 named **33757365379** on `9d5d844e` | `gh run view 33757365379 --json jobs` | `[ ]` | |
| P6 | **The Wave-G checklist re-walked WITH PROOFS** (裁-122) — every box either ticked with its named proof, or moved to a `PROGRESS.md` Known-issues row (ADR-0075 §6: a row is a deferral's only lawful home) | the checklist, end to end | `[ ]` | |
| P7 | **The owner's console acts are done**: the three below-the-fold SMTP fields (port · username = the literal `resend` · password); the sandbox `whsec_` in Fly secrets; the Supabase PAT; OTP expiry 60 min; the *Reset password* template read back as a **LINK** template | FS-11's steps 16–18 | `[ ]` | |

> **THREE RECORDS NAME THREE DIFFERENT SWEEP RUN IDS** and none of them can be quoted from memory:
> 裁-174 = **33757365379** · `AGENTS.md` CI/CD = **33723755257** (13/13 green, 07:44Z 09-03) · the
> launch-sitting prep = **33712469717** (13/13 green, 04:58Z 09-03). **Read the id you actually
> dispatched, from `gh run view`'s job list.** *(Flagged, not resolved.)*

---

## 1 · THE GO/NO-GO AGENDA

*Order is by what blocks a live launch, not by wave number. Every gate: its positive read, where the
evidence lives, and a line to fill.*

### G1 · MAIL — the launch gate (裁-146)

**Discharges on:** a **real signup confirmation** sent to and received at a **NON-team address**
through the custom SMTP, the **six-digit code** arriving in about a minute and **verifying on the
confirm page**. Walked at **FS-11 step 13** (裁-159 folds the certification into the self-serve
walk).

**What does NOT discharge it, named:** a settings screenshot; a message to a team address; the
≈16:55 09-03 *Invite user* proof — a different template, a **LINK** not a **CODE**, fired from the
dashboard rather than the app's own courier path.

| line | read | `[ ]` | as read |
|---|---|---|---|
| the code arrived at a non-team address, ≤ ~1 min, and verified | FS-11 step 13 | `[ ]` | |
| the mail carried **nothing to click** (`{{ .Token }}`) | the message itself | `[ ]` | |
| the test user deleted (read back, not reported) | FS-11 step 17 | `[ ]` | |
| the *Confirm signup* template still `{{ .Token }}` — **a Management API read, not a screenshot** | FS-11 step 17/18 | `[ ]` | |
| Resend key scope **`sending_access` only**, domain-restricted to `mail.clarabook.com` | FS-11 step 17 | `[ ]` | |
| **Message storage OFF** | FS-11 step 17 | `[ ]` | |
| **Team log access restricted** | FS-11 step 17 | `[ ]` | |

### G2 · THE CUTOVER (FS-10) and the eleven-line security checklist

**Discharges on:** the FS-10 as-run **plus every one of the eleven lines** at
`docs/plan/active/security-pass-2026-09-02.md:547-592` accounted for. **裁-153 assigns four of them
explicitly to FS-11 steps** — they are ticked there, not here, and the as-run says so beside each:

| line | subject | where it ticked | `[ ]` | as read |
|---|---|---|---|---|
| 3 | the trusted client-IP courier + the pepper | **FS-11 step 12** (裁-152) | `[ ]` | |
| 4 | `clara_auth_wall_login` flipped to LOGIN out of band | **FS-11 step 11** | `[ ]` | |
| 5 | `acl-baseline.sql` run on the live project | **FS-11 step 6** | `[ ]` | |
| 7 | the paid walk end to end (its DPA-read half already MET on the tree) | **FS-11 step 13** | `[ ]` | |
| 1 · 2 · 6 · 8 · 9 · 10 · 11 | the other seven | ticked at FS-10 as written | `[ ]` | |

**The variable most likely to be got wrong** — same NAME, two correct VALUES:
`CLARA_TRUSTED_CLIENT_IP_HEADER` is **`CF-Connecting-IP`** on `apps/web` and **`X-Clara-Client-IP`**
on the RUNTIME. Any other runtime value ⇒ **503 on every applicant's confirm**, with nothing in
either app's config looking wrong.

**Two reverted-state reads FS-10 owes this gate — GATING, not assumptions.** A preview walk can
widen the auth surface, and constraint 14's operative clause says a mechanism is never weakened for
testing convenience — so if it was widened, a **read** must prove it was put back:

| reverted-state read | instrument | `[ ]` | as read |
|---|---|---|---|
| the redirect allowlist is back to **exactly two entries, no wildcard** — `<origin>/auth/confirm` and `<origin>/auth/recover`. **裁-154 ruled there was no widening: the preview walk is password-only, confirm and recover on the real origin at S21** — so the expected read is *unchanged, still two* | the **Management API read** of `GET /v1/projects/{ref}/config/auth`, never the dashboard screen | `[ ]` | |
| the **`workers.dev` preview alias is deleted or preview URLs disabled** — it was publicly reachable and wired to the LIVE Supabase project | the alias returning nothing, recorded in the FS-10 as-run | `[ ]` | |

**Also on this gate:**

| line | `[ ]` | as read |
|---|---|---|
| the invite-link **`?ct=` query VALUE is redacted at the edge/access log** — proof is a request against a live invite link then a read of the log showing `ct` masked or absent. **裁-155: FS-10 S16 looks for the control first, then either configures and proves it, or files a dated explicit deferral.** Record which happened | `[ ]` | |
| Supabase Auth **"Allow new users to sign up" is ON** — with it OFF every gate below passes and no applicant can start | `[ ]` | |
| **OPS.x** — the Workers deploy's parts union ⊇ the serving runtime's emittable kinds (裁-121②) | `[ ]` | |
| **HTTPS-only on the deployed origin** — `__Host-` cookies are silently dropped over plain HTTP, with no error at any layer | `[ ]` | |

### G3 · THE RESET AND THE SPAN (FS-11)

| # | line | expected read | `[ ]` | as read |
|---|---|---|---|---|
| 1 | **The backup RESTORED, not merely taken** — 裁-163 route B: the fresh **LOCAL `--profile full`** dump into a throwaway PG17, the `dr-verify` subset, and **the post-restore ceremonies of `DR-full-drill.md:128-146`**. *A restore that skips them is not a proven restore.* **Gate rule: not clean ⇒ the reset does not open** | FS-11 step 2b's verdict + the dr-verify tally | `[ ]` | |
| 2 | **RESET = `DROP SCHEMA clara CASCADE`, scoped** — the runner preflights `pg_depend` and ABORTS rather than cascading beyond `clara`. **Constraint 15 proven by a READ**: `workflow`, `workflow_drizzle`, `graphile_worker`, `spike` all still present | FS-11 step 4 | `[ ]` | |
| 3 | **THE WHOLE CHAIN `0001`→`0164` applied — a FRESH apply, not a delta.** `clara.schema_migrations` lives inside the dropped schema. Count the directory, never a document: **159 files** at `9d5d844e` | `migrate: 159 new migration(s) applied · 159 total`; `schema_migrations` → 159 / `0164_checkout_gate_c6_web_reads` | `[ ]` | |
| 4 | **The two purges (裁-161)** — `auth.users` → 0; Storage objects per bucket → 0; **buckets and policies untouched** | FS-11 step 4b's before/after counts and its actor line | `[ ]` | |
| 5 | **ACL baseline applied and verified** — `ACL baseline verify: OK`, the eleven confined roles `usage_public = f` and `temp_db = f`, `clara_runtime` keeping both `t` | FS-11 step 6 | `[ ]` | |
| 6 | **SEED** synthetic only; `0155`'s UNIQUE constraint lands AFTER the reset, never before (裁-41/45/67) | FS-11 step 7 | `[ ]` | |
| 7 | **The evaluators re-deployed** — a full re-migration ships every one **DARK**. **The count is FS-11 step 3b.2's pre-reset read, NOT "nine"** (see the contradiction note at §5) | the roster now `deployed = true`; `verify_evaluator_freeze()` clean | `[ ]` | |
| 8 | **BELCORT re-minted through the self-serve door** (裁-159) and **`is_operator` set as its own ceremony step** (裁-121③) — exactly one row, `uq_firms_one_operator` still partial, `count = 1` | FS-11 steps 13 and 14 | `[ ]` | |
| 9 | **`stripe_object_map` seeded** — the two rows, **plus one `open_checkout_intent` that does NOT raise `CLR10`**. Without this seed a beta signup dies there | FS-11 steps 10 and 13 | `[ ]` | |
| 10 | **THE 裁-136 ONE-SHOT READ** — `select count(*) from clara.report_artifacts;` **after the seed and BEFORE the walk's first seal**. By the time this sitting convenes **the fact is no longer checkable**; G6 reads it back from the as-run | FS-11 step 15.4 | `[ ]` | |
| 11 | **The hash-equality proof** for the pepper and the service token, executed at FS-11 step 12 — the **first moment it had two operands** (裁-152) | the two digest pairs, values never shown | `[ ]` | |

### G4 · THE WALK — beta-ready as defined

**裁-164 re-cuts the denominator.** It is the **eleven enumerated milestones** plus **FS-11 step 16's
product walk**. **Nothing is invented to reach sixteen** — the "sixteen-step" label appears in six
places and the list never reaches sixteen; the only enumerations are the two identical eleven-arrow
chains. The as-run records **the honest count**.

| line | `[ ]` | as read |
|---|---|---|
| the honest count: ____ of **11** milestones + the product walk | `[ ]` | |
| the checkout leg walked **ONCE at the seeded beta price — sandbox, MYR 0** (裁-148); **no temporary "switch the current plan" OPS act** happened | `[ ]` | |
| every MBB-1 gap the corpus cannot supply marked **资料缺失** — BEE GL/TB for either FY · RPR Feb-2025 · RPR Mar-2025 · named producer/certifier for RS and RPR | `[ ]` | |
| the **RPR bank-statement series pick** recorded **with its coverage measurement** — a pick without the measurement is not this line | `[ ]` | |
| the **instrument** named: manual browser walk from a written script, or a ceremony-written Playwright script against the remote origin. **The repo's own rig serves a LOCAL build and mocks Supabase**, so a claim made from it does not satisfy 裁-86 | `[ ]` | |

**The AGENTIC section (裁-164 part 2) is a go/no-go input.**

| line | verdict weight | `[ ]` | as read |
|---|---|---|---|
| (a) **bank statement upload → intake → the belt's drafts in the Journals queue → one ADOPTED and one REFUSED** | **a defect here is a LAUNCH BLOCKER** | `[ ]` | |
| (b) **chat as the execution surface** — an onboarding Do · a coding/journal proposal · a close-prep turn · a report render, each disposed by the human, through `chatTurn_v17` | **a defect here is a LAUNCH BLOCKER** | `[ ]` | |
| (c) **autonomy layer 2 recorded "OFF by 裁-165"** — the G1 cadence wake sources `bank_agent` and `close_prep`. **Not a failure** | a Backlog row | `[ ]` | |
| (d) **witness activation and the FA/adjustment authorities recorded "no web surface at this tip"** — dark in the UI, the doors exist in the DB; **not walked through SQL** | a Backlog row | `[ ]` | |
| **law 71 held** — preparation is agent-lawful; **finalize, reopen, attest and settle are HUMAN-ONLY**. If any of those four could be walked by the agent, that is a **security finding**, not a walk item | **stop-the-line** | `[ ]` | |
| the fixture estate came back — ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION · ROME PUBLIC ADVISORY · Alara · Borneo — and **the RS trial balance still reads 3,396,500 = 3,396,500**. A firm that does not come back is stop-the-line; a figure that comes back **DIFFERENT** is stop-the-line | **stop-the-line** | `[ ]` | |

### G5 · BILLING / STRIPE — ruled, and therefore simple

**裁-126 + 裁-148:** beta runs **entirely in the BELCORT Stripe sandbox at MYR 0, for the whole
beta**. **There is no live-mode flip at this sitting.**

| | read | `[ ]` | as read |
|---|---|---|---|
| (a) the checkout completed **at the seeded beta price, MYR 0, with no payment details entered at all** — the plan row drives `payment_method_collection='if_required'` while the amount is 0. The chain end to end: checkout completes → the **signed webhook** arrives → **the firm is born** → the invoice/receipt surface renders | `[ ]` | |
| (b) **the string "RM0" appears on NO customer-facing surface** — they say "no fee is charged" / "trial" in words (裁-58). *Why:* "RM0" reads as *free*, and beta is not free, it is **unpriced** | `[ ]` | |
| (c) **Stripe Tax OFF for the whole beta** — resting on **裁-170**'s stated fact, not on an omission (see below) | `[ ]` | |
| (d) `CLARA_STRIPE_LIVEMODE = test`; the `whsec_` is the **sandbox** endpoint's | `[ ]` | |

**裁-170 — read into the record verbatim:**

> *"**BELCORT is NOT SST-registered** (owner's statement on the record, 2026-09-03). Beta is sandbox
> at MYR 0, so no tax amount exists to compute, and **Stripe Tax stays OFF for the whole beta as a
> consequence of that fact.** The real-money switch ceremony carries a line: re-confirm BELCORT's
> SST registration status; if registered by then, enable Stripe Tax and verify the service-tax rate
> and invoice format before the first priced checkout."*

`[ ]` Read aloud and accepted.  as read: ____________

**The pre-上市 roadmap this gate sits inside** (裁-148 point 3, carried as an ordered `PROGRESS.md`
Backlog list per 裁-150 point 3): **beta live** (template legal texts + RM 0) → the **pricing
sitting** (裁-58) → the **billing tier tranche** build (裁-144) → the **lawyer pass** on the legal
texts → the **real-money switch + KYB + the non-zero checkout walk** = **上市**.

### G6 · THE FIRST REAL SEALED ARTIFACT (裁-136) — a READ-BACK gate

Both lines are **read back from the FS-11 as-run**, never re-measured here.

| | read | `[ ]` | as read |
|---|---|---|---|
| the **first sealed artifact's manifest** names **`-raw`** in its `extraction_tool` string — read off the **artifact**, never off the source. A manifest that does not name `-raw` means an older image ran and **the seal must be redone** | `[ ]` | |
| the **pre-walk `clara.report_artifacts` count = 0** — the last moment that fact was checkable, and what makes *"no hash migration is owed"* a **measurement** rather than a memory | `[ ]` | |

**If either line is missing from the as-run it cannot be recovered.** The gate then records
**UNPROVEN IN THE FIELD**, with which it was, and a Known-issues row carries the consequence.

**After this gate the mode is load-bearing history:** any later change is a **HASH MIGRATION**
needing its own owner ruling — `clara.report_artifacts` is insert-once with UPDATE trigger-blocked.
**裁-136 is not a precedent for a second free change.**

### G7 · THE OPERATOR TIER (裁-143) — and 裁-147's manual line

| | read | `[ ]` | as read |
|---|---|---|---|
| BELCORT carries `is_operator`, and the operator surface renders for a BELCORT **owner** and **not** for anyone else — the door carries **both** gates, the owner floor **and** the operator-firm predicate | `[ ]` | |
| **the hard cap is LAW and nothing widened it** — two read queues (registration applications; Stripe problem events) plus one control that reads nothing (`clara.set_wake_source_enabled`), and **never any figure of another firm's books**. Both queues are pre-firm admission-plane objects, so §6 invariant 2's tenancy wall is untouched by design | `[ ]` | |
| **裁-147's manual line** — at the walk **and** at the cutover, `clara.list_stripe_event_problems()` (or a plain select on `clara.stripe_event_problems`) must be **EMPTY of unresolved rows**; anything present is cleared through `resolve_stripe_event_problem` **with its reason**. **The operator SCREEN is post-beta by ruling**, which is why this is manual | `[ ]` | |
| the flag was set by the **raw owner-run one-shot ceremony**, never an app screen and never an API — by design | `[ ]` | |

### G8 · LEGAL — **re-cut by 裁-166**

**The DPA, by its own byte-identity law** (`docs/ops/legal/clara-beta-dpa.md`, THE BYTE-IDENTITY
LAW). **The DB CHECK recomputes the digest from the STORED bytes, so nothing in the database can
catch file-vs-row drift — only this law and a reader can.** Two commands and a comparison, run at
the sitting:

1. **From the file**, at the repo root:
*(Fenced with FOUR backticks — the command's own body contains a triple-backtick literal, and a
three-backtick fence would close on it. Copy the inner line only.)*

````sh
node -e 'const F = "```"; const s = require("fs").readFileSync("docs/ops/legal/clara-beta-dpa.md","utf8"); const re = new RegExp("clara-dpa-body:begin ([^>]*?) -->\n" + F + "[a-z]*\n(.*?)\n" + F + "\n<!-- clara-dpa-body:end","gs"); for (const m of s.matchAll(re)) console.log(require("crypto").createHash("sha256").update(m[2],"utf8").digest("hex"), m[1].trim());'
````

> **RE-MEASURED at `9d5d844e` — the file now prints TWO lines, not one.** The prep expected one.
> - `6d1c97a5cf8a22994b12dcb1b113c53bc2b1edb282f5c1237ff1ef12c679c7b3` · `version=v1 seeded=yes` ·
>   **99 bytes** — this is the one with a DB counterpart.
> - `b458ab023799259e28e7550eededd401163c11742509568d960ac5d982c94067` · `version=v2 seeded=no` ·
>   **11,626 bytes** — **not seeded**, so it has no row and must not be expected to have one.

2. **From the row**, through the CA-pinned bridge:
   `select version, body_sha256, source_path, effective_from, effective_to from clara.dpa_documents order by version;`
3. **Compare the hex strings for v1.** Equal ⇒ the provenance claim holds. Unequal ⇒ the seeded row
   and the file have drifted, and the sitting has found a **real defect**, not a nit.

| | read | `[ ]` | as read |
|---|---|---|---|
| the v1 file digest and the v1 row's `body_sha256` are **equal** | `[ ]` | |
| the store carries **the DPA only** — **no terms row, and no `kind` column** | `[ ]` | |

**裁-166 — read into the record. Beta launches on the DPA signature ONLY.**

> *"The beta Terms of Service are **NOT SEEDED and NOT IN FORCE** at beta
> (`docs/ops/legal/clara-beta-terms.md`'s own version-history line says so). They become a dated
> **Backlog row**: the `kind` discriminator + a per-kind unique index + `sign_dpa`'s carrier gaining
> `kind`, riding the next DB PR touching the store; 裁-90's byte-identity law extends to the terms;
> completed with the lawyer pass before 上市."*

**And the count of documents, answered on the record (裁-166):**
- **Per FIRM, at signup, signed by the principal, ONCE per text version:** the **DPA** (live now) and,
  **from 上市**, the **Terms of Service**. A new version of either text prompts one re-acceptance;
  nothing is re-signed otherwise.
- **Per CLIENT the firm onboards:** the client authorization letter (en/ms/zh templates), signed
  between the firm and its client, **outside the app** — the firm's own file, not a Clara signature.
- **Per INVITED member (RBAC):** **nothing separate in beta** — the firm's signatures bind the firm.
  Whether each user account must accept the Terms individually at 上市 is a **lawyer question**,
  filed on the same Backlog row.
- The beta signup consent text is the DPA's beta wording, **not a third document**.

**The 裁-145 re-cut owed to `docs/product/PRD.md:290`** — measured after the ruling, and it is a
correction, not a nit:

> The note currently says *"Four of the five are therefore live (DPA e-sign · Beta terms · rate wall
> · Stripe checkout success)"*. **The Beta terms are NOT live.** Re-cut to: five items named; the
> email-bound token **RETIRED** (裁-89, never built); **THREE live** — DPA e-sign · rate wall ·
> Stripe checkout success; **the Beta terms are the not-yet-live fourth**, a Backlog row under
> 裁-166, in force from 上市 after the lawyer pass. **Any other text that copied "four live" is
> re-cut with it** (the digest row for 裁-145 and the `-09-03` ledger).

`[ ]` The 裁-166 paragraph read aloud and accepted.  as read: ____________
`[ ]` The PRD `:290` re-cut assigned to the final truing.  as read: ____________

**Standing:** the lawyer-reviewed DPA text is owed at official launch and publishes as a **new
version row, zero code change** (裁-90). The terms template carries **27 `[LAWYER]` and 34
`[verify]` markers, never darkened for beta** (裁-125).

### G9 · DR / READINESS / SLO — discharged by reads and dates, not by document claims

| | read | `[ ]` | as read |
|---|---|---|---|
| **the runtime**: `/ready` → `ready:true` with `checks.db.ok` true; `fly status -a clara-runtime` → the intended VERSION, `started`, checks **2/2** | `[ ]` | |
| **the backup alarm — a READ, not the document's claim.** `DR.md:297-299` *reports* a healthchecks.io dead-man's switch live since 2026-07-22, daily period, 26 h grace. The gate discharges on **opening the healthchecks.io check and reading its STATUS and LAST PING time** — green and within grace. Beside it, the last `clara-backup` run line from `fly logs -a clara-backup`. **The ping URL is a Fly secret — read the dashboard, never print the URL** (裁-135) | `[ ]` | |
| **the pre-reset restore's DATE** — FS-11 step 2b. Say on the record whether it also discharged the monthly-light cadence, so the two are not counted twice | `[ ]` | |

**The verify cadence, stated as three dates against their cadences** (`DR.md:431-440`):

| drill | cadence | last, per the repo | status at 2026-09-03 | `[ ]` |
|---|---|---|---|---|
| Monthly-light: decrypt the latest **R2 bundle** + restore + the `dr-verify` subset | monthly | **2026-07-22** | **OVERDUE ≈43 days** | `[ ]` |
| Local full-profile round trip, STRICT | the same bar, run locally | **2026-08-06**, 330 probes | 28 days — recent, but **not against an R2 bundle** | `[ ]` |
| Quarterly-full: the STRICT **fresh-project** drill | quarterly | **2026-07-20**, 177/0 STRICT | not due until ≈2026-10-20 | `[ ]` |

> **裁-163 RULED AGAINST discharging the overdue row here.** Route B was taken: the restore-proof
> used the **fresh LOCAL dump**, so **the off-site R2 bundle's decryptability stays UNPROVEN since
> 2026-07-22**. That is a **Known-issues row**, owner-actioned on a date the owner picks. The prep's
> earlier claim that the pre-reset restore discharges the monthly-light cadence **does not hold under
> 裁-163** — it was a route-A property.

**Knowingly open, accepted:**
- the **external `/ready` uptime check is NOT wired** — for the first hour **the lead is the alarm**;
- **no PITR** — the finest recovery granularity is the last daily backup. **This residual only has a
  recovery path behind it if the `age` identity is in hand** — asked below under 裁-171, not skipped;
- the e2e **re-render DR drill stays UNRUN** until the first sealed artifact.

### G10 · ENGINEERING GATES AND GOVERNANCE

| | read | `[ ]` | as read |
|---|---|---|---|
| **CI**: the required check `ci` is a fail-closed meta-gate; the sweep-only legs run on the weekly sweep + manual dispatch, and **a hand dispatch is OWED after any merge touching a closed drill or the pipeline** | `[ ]` | |
| **SG-3 stands unchanged at launch**: ADR-060/ADR-0075's authority is **DATA-scoped only**; the product's mechanisms never relax for convenience — **the operative clause on any collision**. This is what decides G2's two reverted-state reads | `[ ]` | |
| **SG-2, the agent-native surface test**: remove the chat rail and the workbench still shows what Clara did, why, with what evidence, and offers every Clara action as an object-level verb | `[ ]` | |
| **SG-4, accessibility is a shipping gate**: the token-contrast script, the WCAG rule engine, the keyboard walk, 裁-13's 24 px target floor, and the built-app leg `apps/web/e2e/a11y-finish-walk.spec.ts` | `[ ]` | |
| **裁-135 stands** until the owner reverses it at official launch: the repo is **PUBLIC**, CI is GitHub-hosted, and no paperwork written tonight carries a secret | `[ ]` | |

**裁-171 — the two time boxes, acknowledged in one line and NOT ruled tonight:**

> *"**裁-133** (no Codex lane of any kind, builds included) and **裁-111** (the cross-family Codex
> adversarial review leg) **remain SUSPENDED, not repealed.** Both are time-boxed 'until beta live';
> 裁-150 point 2 closes this session after the e2e with **no next lanes**, so there is nothing for
> either to resume into tonight. **Whether they resume is decided when the next session starts, on
> my ask.**"*

`[ ]` Read aloud and acknowledged by the owner.  as read: ____________

---

## 2 · THE DESIGN RULINGS, READ INTO THE RECORD

### 裁-167 · DS-07 — the design authority is followed, and the authority is **what it ships**

Owner's words: 「跟著clarabook-frontend就對了」.

> *"Follow `clarabook-frontend`" = follow what the design repo actually **ships**. Its component's
> size-variant block is **byte-identical** to the shipped `apps/web` block (md5
> `6f29955ea9f9f080f7e602149d6a4aa6`), so the shipped reference — **24 / 28 / 32 / 36 px** — is
> authoritative. The token contract's §5.2 (**32 / 36 / 40**) exists in **neither repo's code** and
> is recorded as **NEVER IMPLEMENTED in either repo**. If `clarabook-frontend` later implements
> §5.2, `apps/web` follows it then — a note on the DS-07 row, not a lane.*
>
> **Consequences.** 裁-13's 24 px target-size gate stays **GREEN** on the shipped heights. The 13
> `size="xs"` buttons sit on the **SC 2.5.8 floor with zero headroom** — lawful, with nothing to
> spare; recorded rather than silently carried. Record shape: a **digest row + a dated
> `README-log.md` line** (裁-137-shape, contract vs reference) — **never a new ADR** (裁-140). FS-9's
> open owner-owed line **closes**; `PROGRESS.md`'s DS-07 row gets its **owner and next step**.

`[ ]` Read aloud and accepted.  as read: ____________

### 裁-168 · The two `clarabook-frontend` recut PRs — DEFERRED with a dated Backlog row

> *Both PRs are the owner's own, in the design-authority repo, **outside every lane's write
> boundary**, and they change **no shipped behaviour here** — `apps/web/app/globals.css:304` already
> carries the lawful `--input` value via #515. **Backlog row (owner · next step · ruling):** "open
> the two recut PRs in `clarabook-frontend` — 裁-64② (`--input`), R3 §9 (focus ring) — on a date the
> owner picks; until then the design law drifts from the shipped app and any future port re-imports
> the drift." 裁-167's note rides the same row.*

`[ ]` Read aloud and accepted.  as read: ____________

---

## 3 · THE TWENTY KNOWINGLY-OPEN ITEMS — read aloud, item by item (裁-171)

*Every row below is already carried in `PROGRESS.md` (Known issues or Backlog), which ADR-0075 §6
makes the only lawful home for a deferral. **None is beta-gating on the record as it stands.** The
sitting's job is to accept them **out loud**, not to discover them.*

> **Anchors move.** The line numbers below are the anchors the prep recorded; `PROGRESS.md` is being
> edited tonight by the truing lane, so **find each row by its NAME, not by its line**.
>
> **裁-171 orders the reading:** **the two beta-shape items go FIRST** (items 1 and 2).

### The two beta-shape items — read FIRST

| # | item | anchor | `[ ]` read aloud, accepted |
|---|---|---|---|
| **1** | **`livemode` is stored and never read** (裁-120 A-M5). C-5's webhook route gates on `CLARA_STRIPE_LIVEMODE`, fail-closed when unset. **Beta never flips it** (裁-126/148) — harmless in the sandbox beta; **owed before the real-money switch**, together with a re-run of the sandbox round trip against the live account | `PROGRESS.md` Known issues | `[ ]` |
| **2** | **A paid applicant who then joins another firm strands their payment** (A-M4). `0163` adds the operator read `list_unconsumed_registration_payments()`; the operator **surface** is owed — until then it is reachable only through the audited SQL door. **MYR 0 in beta, so the stranded amount is zero**; owed before the real-money switch | `PROGRESS.md` Known issues | `[ ]` |

### Product / security shape

| # | item | anchor | `[ ]` |
|---|---|---|---|
| 3 | **Runtime SSE re-authorisation on the poll tick** (B-M3): `assertTaskStreamAccess` runs once at open, so a removed member keeps a live transcript for up to 30 minutes | Known issues | `[ ]` |
| 4 | **裁-102 is CLOSED AS SUBSTITUTED by 裁-169, not repealed** — `/signup`'s `supabase.auth.signUp` send path has no server-side wall of ours; the wall is **the two named numbers, accepted in writing** at FS-11 step 18 | `security-pass-2026-09-02.md` item 6, re-cut by 裁-146 | `[ ]` |
| 5 | **The `token_hash`-in-logs and single-use-replay siblings** of the confirmation login-CSRF finding remain open on the same wiring PRs | Known issues, the SECURITY row | `[ ]` |
| 6 | **DS-09 — per-field validation association**: 2 rendered `aria-invalid` sites against 70 `confirmDisabled=` occurrences across 49 files (**count the file, never the row**); form-level errors still announce via `StateBanner`'s `role="alert"`. FS-9 row 9, non-gating | `PROGRESS.md:379` | `[ ]` |
| 7 | **⌘K cannot reach a NAMED client from firm altitude** (FS-9 row 12) — ordered nowhere, post-beta by shape, **said out loud rather than assumed** | FS-9 record | `[ ]` |

### Billing / checkout follow-ups — all before the real-money switch (裁-57)

| # | item | anchor | `[ ]` |
|---|---|---|---|
| 8 | The deploy postverify guard `packages/db/deploy/extraction-slice-0022-postverify.sql:165-167` iterates a **hardcoded role list omitting all four checkout-gate roles**, so the "no machine role gains `clara_authenticated`'s reach" wall does not cover them **by construction** — derive the list from the catalog as `0154`'s census does | Backlog | `[ ]` |
| 9 | **A DOOR refusal on the webhook path stores nothing today** — `stripe_event_problems.event_id` references `stripe_events`, so a refused event leaves **no durable trace**. Filed shape: a sibling relation `clara.stripe_event_refusals`. **This one has a first-hour consequence** | Known issues | `[ ]` |
| 10 | **The C-2 operator screen is post-beta by ruling (裁-147)**, with the manual select standing in meanwhile | Backlog | `[ ]` |

### Legal / design authority

| # | item | anchor | `[ ]` |
|---|---|---|---|
| 11 | **The lawyer-reviewed DPA text is owed at LAUNCH** — beta ships the placeholder body; the real text publishes as a new version row, **zero code change** (裁-90). Same for the beta terms (裁-125) | Backlog | `[ ]` |
| 12 | **The beta terms' `kind` discriminator + per-kind partial unique index** ride the next DB PR touching the store; `sign_dpa`'s carrier gains `kind`; the signup step must present **both** documents with their own byte-identity hashes (裁-90 extends to the terms). **Now also carried by 裁-166's row** | Backlog | `[ ]` |
| 13 | **The two `clarabook-frontend` recut PRs (裁-64② and R3 §9) are the OWNER'S** — **ruled DEFERRED tonight by 裁-168**. The design law on that side drifts from the shipped app until they land | Backlog | `[ ]` |

### Engineering residue

| # | item | anchor | `[ ]` |
|---|---|---|---|
| 14 | **The archived backend queue (裁-123)** — #447 · #448 · #452 · #456 · #449 · #460. Each branch carries its round as a WIP commit and each closed PR a resume note; map is `docs/plan/active/archive-parked-lanes-2026-09-02.md`. **Re-integration is post-beta, one lane each, from the resume note — never from memory.** #460's 裁-61 ruling re-opens with it | Backlog | `[ ]` |
| 15 | **`reconciler.mjs` still calls the dropped `reconcile_autopost_rules()`** and re-fires every poll, **invisible in `beltErrors`**. Not data-affecting; noisy and wrong | Known issues | `[ ]` |
| 16 | **P6-1's bigint wire boundary** — `wake_freeform_read` emits `read_id` as a JSON number, so ids above 2^53 cannot render. `chatTurn_v16` fails closed. Fix queue 裁-71⑨, a D1 window | Backlog | `[ ]` |
| 17 | **The `ninth-rowkind-seeding-proposal` capped-firm-wide-read flake** — a bounded lane and an estate-wide census of the same shape are owed; **a cap invisible until the corpus grows past it is a time bomb in every sibling cell** | Known issues | `[ ]` |
| 18 | **The pool error contract is RULED AND SCHEDULED, not open-ended (裁-149)** — the general relay pool gains an `'error'` listener that logs, counts and raises a health flag on `/ready`; **the leader's dedicated `makeClient()` session stays CRASH-LOUD** so its loss releases the advisory lock and a standby takes over. **AFTER beta live**, as a product PR riding a v7x deploy, the contract written into `docs/ARCHITECTURE.md`. Today's fail-loud behaviour is safe and stays | Backlog | `[ ]` |
| 19 | **Locked worktree shells** — removal needs an elevated shell after a Claude Code restart, then `git worktree prune`. **None holds anything.** Three estate lists name **four distinct ids**; the teardown census settles it **by a walk**, never by any of them | `PROGRESS.md:390`, `:480` | `[ ]` |
| 20 | **Two untracked PNGs in the repo root + the vhdx compaction** — **裁-173: the PNGs were DELETED at the ruling**; the vhdx and the locked shells are the owner's elevated-shell acts at the pause window | 裁-173 | `[ ]` |

### The NEW rows minted by 裁-151…174 — read with the twenty

| # | row | owner | next step | ruling | `[ ]` |
|---|---|---|---|---|---|
| 21 | The **monthly-light restore drill is overdue since 2026-07-22** and the latest **R2 bundle's decryptability is unproven** since then | **owner** | run `DR.md:376-381` / `:431-436` with the `age` identity (custody: owner, off-repo AND off-R2) on a date the owner picks | **裁-163** | `[ ]` |
| 22 | **G1 PR-2** — the two producers + the eight deferred DB items + the retention path for `bank_agent_due_claims`; a DB+runtime train under the full ladder with a D1 window and a ceremony; then the 裁-40 flip through the G1 operator door | owner | before 上市 | **裁-165** | `[ ]` |
| 23 | **The beta terms of service** — the `kind` discriminator + per-kind unique index + `sign_dpa`'s carrier gaining `kind`; 裁-90's byte-identity law extended; the lawyer pass | owner | before 上市 | **裁-166** | `[ ]` |
| 24 | **The two design-repo recut PRs**, with 裁-167's §5.2 note riding | **owner** | open them on a date the owner picks | **裁-168** | `[ ]` |
| 25 | **The DR STRICT `4.9` replacement subject** — named from the post-reset estate, else **UNPROVEN IN THE FIELD**. If `dr-verify-checks.mjs` hard-codes the canary (it does, at `:398-399` and `:414-415`), that is a **code change** → a Backlog row naming the file, **not a hand edit on launch night** | lead → owner | at the final truing | **裁-172** | `[ ]` |
| 26 | The **orphaned durable run** — the canary's `workflow.workflow_runs` row survived the drop under constraint 15 with no clara-side projection | lead | record only | **裁-160** | `[ ]` |
| 27 | **The `?ct=` edge-log redaction** — **carried ONLY if FS-10's S16 look filed a dated deferral** (裁-155). If FS-10 configured and proved it, there is no row | owner | per 裁-155 | **裁-155** | `[ ]` |

`[ ]` **All twenty (plus the new rows) were read aloud, item by item, and accepted.**
as read: ___________________________________________________________________

---

## 4 · THE OWNER'S OWN-EYES ACTS — V-OWNER cells an agent can never satisfy

*Bilingual, per the sitting's own convention. Each was performed during FS-11; this record captures
the owner's confirmation.*

### Act 1 — The Mail code · 邮件验证码

**EN.** On the deployed origin, sign up with an address that is **NOT** in the Supabase project's
organisation team. Watch the mail arrive within about a minute. **Read the six digits off it
yourself**, type them into the confirm card, and see the account confirm. Then confirm with your own
eyes that the mail carried **nothing to click** — `{{ .Token }}`, not a link.

**中文.** 用一个**不在 Supabase 项目团队里**的邮箱，在正式网址上**注册**一次。等邮件——大概一分钟内应该
到。你自己**亲眼把六位数字读出来**，输进确认页，看着账号确认成功。再确认一件事：那封信里**没有任何可以
点的链接**，只有数字。**这一条是上线的硬门槛。** 截图不算，发到自己团队邮箱也不算，09-03 下午 16:55 那封
邀请信也不算——那是另一个模板、另一条路。

`[ ]` as read: ____________

### Act 2 — The sandbox round trip at the beta price · 沙盒里按 beta 价格走一遍

**EN.** In the Stripe sandbox account **"BELCORT 沙盒"** (`acct_1UAOhtHD90w0k86X`), complete the
checkout **the way a real beta customer will: at the seeded beta price, MYR 0, with no payment
details entered at all**. Watch the whole chain: the checkout completes → the **signed webhook**
arrives → **the firm is born**. Then look at the invoice/receipt surface. **裁-148: this is the ONLY
checkout walk at Wave-G.**

**中文.** 在 Stripe 沙盒账户里，按**真实 beta 客户**的走法走一遍：种下的 beta 价格、**MYR 0、整个过程一张
卡都不用输**。一路看下去：结账完成 → **带签名的 webhook 进来** → **事务所被创建出来**，最后看一眼发票/
收据那一页。非零价格那一次挪到"开真钱"那场仪式，今天**不要**临时把有价格的方案切成当前方案。

`[ ]` as read: ____________  ·  what the MYR 0 session actually collected: ____________

### Act 3 — The "RM0" rendering rule · 客户看到的页面上不许出现 "RM0"

**EN.** Walk back through the surfaces you just passed and confirm the string **"RM0" appears
nowhere**: they must say "no fee is charged" and "trial" in words.

**中文.** 把刚才经过的每一页回头看一遍，确认上面**一个 "RM0" 字样都没有**：只能用文字写"不收费""试用"。
