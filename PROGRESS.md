# Clara — progress
The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

**⇢ 2026-09-04 ≈09:00 MYT — THE REPAIR SESSION IS OPEN on the owner's ask.** Three sources — the
owner's UIUX flaws file, issue **#541** (the authenticated e2e audit, 36 defects) and the handover's
own rows — are being unified into one register, each item anchored to code by a mapping workflow
before any lane opens. Five rulings opened it, 裁-186…190 in
[`mohe-grill-rulings-2026-09-04-pm.md`](docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md),
minuted as [ADR-0078](docs/adr/0078-consent-declaration-attestations-abolished-rbac.md): consent is a
firm-level declaration made once at the DPA stage; every attestation ceremony and maker-checker wall
is abolished with basic RBAC as the only human gate and automatic receipts kept; the wall-removal DB
lane runs this session after the P0 block; the two production deploys (runtime v75, the web Worker)
are the lead's as the owner's delegate; native lanes only. The posture below is the beta's and still
holds.

**⇢ BETA IS LIVE, AND IT IS CLOSED. THE SPRINT SESSION IS OVER.** The owner ruled **裁-185** on
2026-09-04 ≈06:15 MYT (`AskUserQuestion`, option 1 of 3 — "GO — 封閉 beta（建議）"): the product is live
at `https://app.clarabook.com` for **BELCORT and owner-invited testers only**, and open applicants
wait for **a new runtime image (v75 or later)** + the statement-lane fixes + the "Enter a statement"
form fix + **DPA v2**.
Sign-ups are not switched off at the platform (`disable_signup: false`, read by Management API), so
the closure is an OPERATING posture — the owner controls who gets the address — not a technical wall.
Under **裁-150** this session CLOSES with the PR that carries this edit: **the repo is the handover
and there are NO next lanes.** The next session starts on the owner's ask.

**⇢ READ THIS NEXT: [`docs/plan/active/beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md)
and its [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) and
[part 3](docs/plan/active/beta-handover-2026-09-04-part3.md).** That is the complete report
裁-185 asked for — the posture in plain language, the milestone tally of the beta-live walk, **every
backlog item and known issue across backend, frontend, harness, ops and legal** with an id, an owner,
a next step, a size guess and a priority tier, the harness notes, and an ordered pick-list. **The
Backlog and Known-issues sections below are SHORT ROWS pointing at that file's ids; the detail lives
there**, and the two sections as they read before this truing were moved byte-for-byte to
[`docs/plan/completed/progress-archive-2026-08-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md).

**What ran, and what it proved.** FS-10 (the P6-X cutover) opened 22:10 MYT 2026-09-03 and moved
`app.clarabook.com` from Cloudflare Pages to the Worker `clara-web` at **≈00:31 MYT 2026-09-04**;
FS-11 (the Wave-G factory reset) opened ≈01:32 and closed with BELCORT re-minted through the
product's own self-serve door; the 裁-184 product walk ran to 05:44. As-runs:
[`fs10-cutover-asrun-2026-09-03-part3.md`](docs/plan/completed/fs10-cutover-asrun-2026-09-03-part3.md)
· [`fs11-wave-g-asrun-2026-09-03-part4.md`](docs/plan/completed/fs11-wave-g-asrun-2026-09-03-part4.md)
(+ parts 5 and 6) ·
[`launch-sitting-record-2026-09-04-part3.md`](docs/plan/completed/launch-sitting-record-2026-09-04-part3.md).
**Honest tally: of the ELEVEN enumerated milestones — 6 PASS · 1 PARTIAL · 2 FAIL · 2 NOT REACHED**
(never "16 of 16"; sixteen was never enumerated anywhere — 裁-164). **Every refusal in the walk was
fail-closed with a plain receipt, and no wrong number entered the books at any point.**

- **Web:** Cloudflare Worker `clara-web`, version **I = `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**,
  100 %, six secrets + three vars. Both `workers.dev` URLs OFF (404). **The Pages project `clara` is
  DELETED** and `clara-e3o.pages.dev` no longer resolves — **there is no repoint rollback**; a broken
  Worker is fixed FORWARD by re-promoting a walked version (裁-156, dissent filed on it).
- **Runtime:** Fly machine `48ee715b763048`, 2/2 checks, `/ready` **true**. `fly status` VERSION reads
  **74**, and `fly releases --json` at 06:21 settled what that means: **v71, v72, v73 and v74 all
  carry the same image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`** — v72–v74 are the night's three
  `fly secrets import` releases (裁-179 ×2 + the freeform password), **not new code**, so the served
  code is the **v71** build of `344f7ad8` and **the next real deploy is v75**. **#533's reconciler
  unwire is MERGED AND NOT SERVING:** the DB no longer defines `clara.reconcile_autopost_rules`, v71
  still calls it, and the runtime logs the error every ~2 s. **A new image (v75 or later) is handover
  row H-01 and it is the first thing to do.** `held_outbox` **6** at the close (0 at 02:39) is **read
  and explained**: `/ready` at 06:21 shows `wakeEngine.heldForDisabledSource` 6 with the warning "6
  held/queued wake-engine row(s) awaiting a disabled/unregistered source" — the designed loudness of
  裁-165's disabled wake sources (`docs/plan/active/g1-wake-engine-design.md:114`), not a fault.
- **Database:** factory-reset and re-applied from scratch — **159 migrations, frontier
  `0164_checkout_gate_c6_web_reads`**, 19 `clara%` roles, `verify_evaluator_freeze()` reading
  `{"ok": true, "verified_deployed": 7, "verified_registered": 8}`. All six runtime lane DSNs now
  carry `uselibpqcompat=true&sslmode=require` — **encrypted, certificate UNVERIFIED** (裁-179 option
  c; before tonight four of them were PLAINTEXT). verify-full is handover row H-43.
- **Estate:** firms **Alara · Borneo · BELCORT** (`04daf86c-3aaf-4c59-9442-cce93f3582af`,
  `is_operator = true`, the only operator firm the unique index admits) · clients Meridian Logistics ·
  Sunrise Retail · Highland Coffee · ROME PROPERTIES `acb60b65…` · **ROME SECRETARY `7a045c7f…`**
  (active, 86-account chart, one sales invoice posted, one bank receipt settled, and **FY2025 OPEN
  with two close runs, both ABANDONED** — run 1 at 05:39 to book the settlement, run 2
  `db941c04-f78e-4595-9004-08df90be1631` at 23:55:11Z = 07:55 MYT at the clock-out, so the period
  wall is not left on for the next session; no attestation, no finalize). **BEE CREATIVE SOLUTION and
  ROME PUBLIC ADVISORY were NOT re-onboarded** — they died with the schema at step 4 and are owed
  before the next full-estate walk (constraint 13).
- **Books pins — RE-CUT.** The standing RS pin **3,396,500 = 3,396,500 is UNPROVEN POST-RESET: its
  SUBJECT no longer exists.** Those books were built through the product at Slice 6 and died at the
  step-4 drop under **裁-177** (the owner waived the pre-reset dump; dissent filed). **The new pins,
  both re-derived by `trial_balance_as_of` from the DB and never read off a chat reply:** at **20:58Z**
  `1100` Dr 2,800.00 / `4000` Cr 2,800.00, and at **21:40Z** `1020` Dr 2,800.00 · `1100` net 0 ·
  `4000` Cr 2,800.00.
- **`main` = `ba8e7d35`** (#540, the `apps/dashboard` source delete). The hand sweep **33781966143**
  on it: **SUCCESS, 13 of 13 jobs**, ≈02:14 MYT — the tree without `apps/dashboard` is proven green
  across every leg including the closed-wave drills and the four frontier legs.
- **The test-data authority has EXPIRED WITH BETA.** Constraint 14 is DATA-scoped and expires at beta,
  and 裁-162's FS-11-scoped supersession of `docs/ops/DR.md`'s owner-run classifier expired with the
  ceremony. **From here: no agent-run destructive command against the live project.** BELCORT is the
  operator firm; the Rome/BEE clients remain resettable TEST fixtures (ADR-0075, constraint 13).
- **CI** is GitHub-hosted on `ubuntu-latest` (裁-135) and **the repo is PUBLIC**; the four `clara-wsl`
  runners are stopped and disabled. After any PR touching a closed drill or the pipeline itself, run
  `gh workflow run ci.yml` by hand, and read a sweep's verdict from `gh run view`'s job list.
- **Hard-blocked ids** (canary `daba7f2e` · witness `d023b48c`) — hook-enforced
  (`scripts/hooks/pinned-ids-guard.mjs`). Their clara-side rows died with the schema at step 4
  (裁-160, accepted); the hook and the constraint are unchanged.

## Lanes

| lane | branch | state |
|---|---|---|
| `docs-rulings-186` | branch docs/rulings-186-190-2026-09-04 | this PR — 裁-186…190 and ADR-0078 trued into the digest, the PRD, ARCHITECTURE, the index and the harness |
| map-and-sweep (workflow) | — | running: anchors every register item to code, sweeps sibling flaws |
| the P0 block, the UIUX lanes, the wall-removal lane (裁-188), the two deploys (裁-189) | — | queued, opened by the orchestrator in that order |

The sprint's build closed on 2026-09-03,
the beta-live e2e ran on 09-03/09-04, and every lane in the old table was `merged` or `ceremonied` —
**that table was moved verbatim to
[`docs/plan/completed/progress-archive-2026-08-part7.md`](docs/plan/completed/progress-archive-2026-08-part7.md)**
(md5 `20a52f66ade141634b0fe9441d75e675`), which is the only place the per-lane build history of Wave F
and the beta sprint is written down. That table is the beta sprint's closed lanes; the live lanes are in the table above.

## Next

**The owner reads the handover's Backlog and Known issues and picks.** The recommended order is
[`beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md) §E, and its first block
is the only one that gates anything:

1. **The P0 block — everything the beta stays CLOSED until.** a new runtime image, v75 or later
   (H-01) · the "Enter a statement"
   institution/account pair (H-06) · one `statementFacts.v3` train for the period-bounds inference,
   the witness→roster normalisation and the task settlement (H-02 · H-03 · H-05) · `autoDraft_v10`
   for the masked CLR23 (H-17) · the client-consent surface, built the owner's way — collected in the
   onboarding interview and granted on commit (H-18, 裁-182) · the /auth/confirm link (H-35) ·
   **DPA v2** (H-36) and the Stripe product-description edit (H-37) · verify-full TLS (H-43) and the
   two password rotations (H-42) · **C-07 the XML MIME gate (裁-175, lifted into P0 because beta now
   takes real uploads)** · the re-migration runbook truings and the per-lane boot probe (H-47 ·
   H-48). ≈**7 lane-units** plus a handful of owner minutes. **The order of H-43 and C-07 is the
   LEAD's** — both rulings called themselves the first post-beta code item; the owner re-orders them
   at the next session's opening if he disagrees.
2. **The walk's P1 product rows**, starting with **H-21** — projecting the onboarding interview's
   captures, which alone unblocks four separate symptoms.
3. **The pre-上市 roadmap in its ruled order** (裁-148 · 裁-150): the pricing sitting (裁-58, which
   everything downstream waits on) → the billing TIER tranche + the AI usage ledger (裁-144) → the
   lawyer's pass over the DPA, the beta terms and the consent text (裁-125) → the real-money switch
   with Stripe live mode, KYB and the NON-ZERO checkout walk (裁-126/148) = **上市**.
4. **Hygiene** — handover [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) §C.3 and §C.5.

**One process item owed:** 裁-171 ordered the twenty knowingly-open items read aloud item by item at
the launch sitting. The 裁-184 walk consumed the sitting and **the reading did not happen**. The list
is ENUMERATED at
[`launch-sitting-record-2026-09-04-part1.md`](docs/plan/completed/launch-sitting-record-2026-09-04-part1.md)
§3, and every item is also a row in the handover's parts 1–3 — by NAME, not by line. The reading
itself is a next-session item.

## Backlog

**Every row lives in [`beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md)
and its [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) and
[part 3](docs/plan/active/beta-handover-2026-09-04-part3.md), each with what was measured,
why it matters, the fix shape, a size guess, an owner, a ruling number and a tier.** The rows below
are the index. The pre-truing text of both sections is archived verbatim in
[`progress-archive-2026-08-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md).

- **P0 — before the first EXTERNAL applicant (15 rows), handover §C.1:** H-01 the v71↔DB skew
  (`reconcile_autopost_rules`; a new image, v75 or later) · **C-07 the XML `blob:` open with no MIME
  gate and no CSP (裁-175)** · H-02 Maybank headers state no period bounds · H-03 the
  witness→`bank_institutions` code normalisation · H-05 the stranded `statement_facts` task ·
  H-06 the "Enter a statement" form omits the institution/account PAIR · H-17 `autoDraft_v9`'s masked
  CLR23 · H-18 the client-consent grant has no web surface · H-35 no link to /auth/confirm ·
  H-36 the DPA v1 placeholder · H-37 ruling numbers on the Stripe checkout page · H-42 the two
  unrotated role passwords (裁-178, accepted risk) · H-43 verify-full TLS on the six lane DSNs
  (裁-179) · H-47 a live re-migration flips ceremonied roles to NOLOGIN and `0154`'s absolute role
  census blocks it · H-48 no per-lane DSN probe at boot.
- **P1 — before 上市, the walk's own rows, handover §C.2:** H-04 the classifier does not recognise
  bank statements · H-07/H-08 the close-prep chat lane cannot read a close run, and says the wrong
  reason · H-09 the payer-identifier refusal has no UI to satisfy it · H-11 no "Begin close" after an
  abandon · H-12 `uncoded_documents` false-fails on a filed statement · H-15/H-16 zero report
  templates and a chat export tool that does not exist · H-19/H-20 `set_sales_lane_activation` and
  `add_client_identifier` have no surface · H-21 **the interview's captures are never projected** ·
  H-26/H-27 `[object Object]` and raw capture JSON on screen · H-30 the apply-chart dialog cannot be
  scrolled to its button · H-38 checkout does not carry the applicant's email · H-39 a duplicate
  Stripe webhook endpoint · H-40 two undecided Supabase auth settings ·
  H-45 the Resend cap was never read · H-46 the Mail gate is not formally certified · H-49 DR probe
  `4.9` is UNPROVEN IN THE FIELD (裁-172).
- **P1 — already ruled before the launch night, handover §C.1's second table:** C-01 the pre-上市
  roadmap · C-02 the billing tier tranche + the AI usage ledger (AI is UNMETERED in beta) ·
  C-03 the C-2 operator screen (裁-147) · C-04 the pool error contract (裁-149) · C-05 G1 PR-2
  (裁-165) · C-06 the beta Terms of Service (裁-129/166) · C-08 the ten 裁-176 ports and fixes · C-09 the checkout/webhook follow-ups ·
  C-10 `livemode` stored-never-read and the stranded-payment path · C-11 SSE re-authorisation ·
  C-12 `/ready`'s hard storage gate (裁-61) · C-13 the archived backend queue (裁-123) · C-14 the
  overdue R2 restore drill (裁-163) · C-15 the bigint wire boundary (裁-71⑨) · C-16 single-machine Fly
  with no HA and no external alerting.
- **P2 — hygiene, handover part 2 §C.3 · §C.4 and part 3:** **22** web/product nits from the walk
  (H-10 · H-13 · H-14 · H-22 … H-34 · **H-44, the `held_outbox` 6 now read and explained as 裁-165's
  disabled-source counter** · H-50 … H-56) · the full CARRIED registry **C-17 … C-88**
  (database, runtime, frontend, reporting/close/tax, ops/DR/security, harness/CI — **C-77 … C-88 are
  twelve rows in part 3 that carry the fourteen a fresh-context review found missing from the first
  cut — ten as rows, four as named dispositions**) ·
  and **§C.5, the seventeen documentation truings the rulings ordered that this truing did NOT
  execute** — the Wave-G checklist and `docs/ops/DR.md` lines from 裁-161/162/169/170/177, the T-K
  wrangler comment, the `0161`→`0163` citations, and the rest, each naming its file.
- **The owner's own acts:** the two `clarabook-frontend` recut PRs (裁-168) · the Stripe dashboard
  edits (H-37, H-39) · the two Supabase auth decisions (H-40) · the Resend cap read (H-45) · the Mail
  certification call (H-46) · the elevated-shell worktree removal and the WSL `.vhdx` compaction
  (裁-173) · destroying his own `codex-e2e-rate-wall-sleeper` machine on `clara-backup`.

## Known issues

Same index rule: the detail is in the handover. What a reader most needs to know today:

- **The serving image and the schema disagree** (H-01) — `reconcile_autopost_rules` is called by v71
  and defined nowhere; the autopost reconcile belt is dead and the log storms every ~2 s. **A new
  image, v75 or later — v72–v74 are the night's secrets-import releases on the v71 image.**
- **Bank statements cannot be ingested by either AI path** (H-02 · H-03 · H-04 · H-05), and **the
  human "Enter a statement" form has never been reachable** (H-06). A firm can get a statement in
  only through the DB door today.
- **The unattended coder refuses every sales invoice** with a masked CLR23 and opens a human question
  no answer can satisfy (H-17). The CHAT path codes the same document correctly.
- **A firm cannot enable AI processing for a client through the product** (H-18) — the grant and the
  per-purpose activation are dark doors.
- **The onboarding interview's captures never reach the database** (H-21) — no `client_identifiers`,
  no `client_facts`, no `clients.fy_end_month`, no `bank_accounts`. Four separate symptoms, one cause.
- **Two role passwords sit unrotated in this session's transcript** by ruling (H-42, 裁-178), and
  **all six runtime lane DSNs run TLS with the certificate unverified** (H-43, 裁-179).
- **The DPA in force is the v1 placeholder** (H-36), and **the Stripe checkout page shows internal
  ruling numbers** (H-37).
- **DR probe `4.9` is UNPROVEN IN THE FIELD** (H-49) — its subject died with the schema by ruling and
  the verify script hard-codes the ids.
- **The 500-line ceiling is a WRITE-BLOCKING PreToolUse hook, and FOUR documents this session will
  touch again are at or near it — measured on this branch at the final truing, 2026-09-04:**
  [`docs/adr/README.md`](docs/adr/README.md) **499** (its ruling rows now live in
  [`README-rulings-2026-09.md`](docs/adr/README-rulings-2026-09.md), which has room),
  [`docs/adr/README-log.md`](docs/adr/README-log.md) **499** (445 before the launch night's five
  dated minutes), `docs/plan/active/checkout-gate-design-part2.md` **500**, and the newest ruling
  ledger [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md)
  **480**. **That is a SCOPED list, not a repo census** — measured the same way, the repo holds
  **20** tracked `.md` files at exactly 500, **8** at 499 and **31** already ABOVE 500 (historical
  records the hook grandfathers because nothing rewrites them). **A 501st line is refused AT THE
  WRITE, so the next writer of ANY file archives or splits before it adds; check the count first.**
- **Host and worktree hygiene — the census is a WALK, never a list (裁-173).** Measured at 06:20 on
  2026-09-04: **12 worktrees under the .claude/worktrees directory remain from merged lanes, three of them
  LOCKED**; the WSL `.vhdx` compaction is owed again (~50 GB reclaimable at the last measure).
  **Re-walk with `git worktree list` before touching anything** — the count and the names move every
  session. **Removal is junction-UNSAFE by default:** never `robocopy /mir` a worktree without
  `/XJ`, and `git worktree remove --force` and `Remove-Item -Recurse` are not junction-safe on this
  host either (2026-09-01: 2000 tracked files deleted under the main checkout; 2026-09-02: the main
  checkout's `apps/web/node_modules` emptied). Unlink every reparse point FIRST, re-walk to prove none
  remain, THEN remove; post-flight `git status` on main plus `ls apps/web/node_modules/next`. The
  locked ones need an elevated shell after a Claude Code restart, then `git worktree prune`. Two
  standing host facts: the OpenNext/Workers artifact must be BUILT ON LINUX, and **WSL idle-terminates
  without a Windows-side holder** — plant a detached keeper before any port-dependent WSL work.
- **`0154`'s cluster-wide role census, the CI half — CLOSED BY MEASUREMENT.** #525 derived the roster
  from `packages/db/deploy/roles-bootstrap.sql` and pinned it, and four hosted sweeps since
  (33712469717 · 33723755257 · 33757365379 · 33781966143) came back 13/13 green including
  `closed-wave-drills`. **The LIVE-cluster half is open as H-47.**
- **RISK 50, the Mail gate — TRUED.** Transport, sender identity and **delivery of a real six-digit
  signup code to a NON-team address** are all proven (FS-10 S21, after an OTP-length fix: the project
  carried `mailer_otp_length` = **8** against the app's six-digit form). Time-to-arrive and the From
  header were asked and **are not recorded**, and FS-11's own code went to a TEAM address — so the
  ceremony's certification line is the owner's call, carried as H-46.
- **The confirmation login-CSRF finding — TRUED.** The always-refusing stub is gone; the wall is wired
  for real by FS-4 C-6 Lane B (#517) and answered in the field (one attempt, accepted, 167 ms). What
  is carried is a **re-measurement** of the browser-identity half plus the `token_hash`-in-logs and
  replay siblings (handover part 2, C-63). **Closed in the same breath: the `__Host-clara-auth`
  HTTPS deployed-origin acceptance line** — the origin serves HTTPS on the Worker and the cookie
  landed in the field.

## Session log

*(Entries through 2026-08-21 are verbatim in `docs/plan/completed/progress-archive-2026-08.md` +
`-part2.md`; 2026-08-22…08-30-noon in `-part4.md` + `-part5.md`; the 2026-08-30-evening through
2026-09-03-small-hours entries in
[`-part7.md`](docs/plan/completed/progress-archive-2026-08-part7.md), moved across four earlier
truings to keep this file inside its cap. **At the FINAL clock-out truing on 2026-09-04 the
2026-09-03 entry and the whole `Lanes` table moved to `-part7.md`, and the whole `Backlog` and
`Known issues` sections moved to
[`-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md)** — all four byte-for-byte, each
md5 computed on both sides of the move and each verified present in its archive before this file lost
it.)*

- **2026-09-04 — BETA WENT LIVE, AND THE SPRINT SESSION CLOSED.** In one continuous sitting from
  22:10 MYT on 2026-09-03: **FS-10** built the OpenNext/Workers artifact in WSL, created the Worker
  `clara-web`, walked it on its preview through eight versions (catching that version H carried FIVE
  of six secrets — read, not assumed — and promoting **I** instead), proved the SSE body genuinely
  streams through the Worker (TTFB 1.83 s of a 6.05 s total, so 裁-151's fallback was never needed),
  and moved `app.clarabook.com` off Pages at **≈00:31**; the real-origin re-walk was clean, so the
  Pages project was deleted in the same sitting per **裁-156** and #540 merged as **`ba8e7d35`** with a
  13/13 sweep behind it. **FS-11** then dropped and rebuilt the whole `clara` schema — a staged drop
  after a single transaction ran out of lock slots, 159 migrations re-applied (through a `0154`
  role-census wall that a live cluster cannot pass without renaming a deploy-minted role), a
  circuit-breaker outage traced to the re-migration silently flipping every ceremonied role to
  NOLOGIN, and a TLS probe that found **four production lane DSNs running in PLAINTEXT** — and BELCORT
  was re-minted through the product's own signup → code → DPA → MYR 0 checkout door, with every
  Stripe event answering 200. The **裁-184 product walk** then ran the real thing on real Malaysian
  documents: a client onboarded through the in-thread interview, a chart planted, invoices OCR'd, the
  agent's witness reads matching the PDF exactly, a journal proposed by Clara and approved by the
  human, a bank line matched and settled, fifteen close gates evaluated live. **Six of eleven
  milestones passed; the statement lane, the unattended coder and the report path failed, and every
  failure was fail-closed with a receipt.** The owner ruled **裁-185** at ≈06:15: **GO, closed beta**,
  and asked for one complete list of everything to repair. Thirty-five rulings 裁-151…185 are in
  [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md); the list is
  the handover. **Nine of the fifteen P0 rows were found only because the walk used the real product
  against real documents on the live estate — a mocked e2e would have found none of them.**

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
