# Clara — progress
The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

**⇢ 2026-09-06 ≈00:57 MYT — THE CEREMONY RAN. ALL THREE ARMS ARE DEPLOYED.** The 裁-198 window
opened on sweep **`33967641251`** (13 jobs / 13 SUCCESS, concluded 2026-09-05T14:14:39Z) and the
fixed 裁-189 order was walked end to end from merged `main` at **`0351f022`**:

| arm | before | after | proof |
|---|---|---|---|
| DB | 159 applied / `0164` | **171 applied / `0176_counterparty_alias_kind_scope`** | 12 files applied 16:12:41→16:13:26Z in a **9 m 46 s** quiesce window; all six audited bodies re-cut, all 17 witnesses byte-identical |
| runtime | v74, image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ` | **v75, `registry.fly.io/clara-runtime:v75-gate-0351f022`** | released BY IMAGE after a build-only push, matched to the gated artefact by Fly **image id** `img_wd57v5d3lej9p38o` |
| web Worker | version **I** `c5b1e051…` | **`90c1a5d0-f808-4b88-bd28-d2395d9bc26a` at 100 %** | new bytes proved by content-hashed chunk names present in the served `/login` |

**`/ready` now serves the NEW shape**: `checks.pools` present, **seven lanes**, settled on the first
poll, no `pending`, no `stalled` — `runtime`/`read`/`write`/`freeform`/`stripe_webhook`/`auth_wall`
all `ok`, **only `bank` skipped (`dsn_not_configured`)**. The "/api/build-info" route returns
`git_sha 0351f022…` with `frontier {171, 0176…}`. **H-01 is CLOSED by this deploy.** Two smoke
walks passed in the owner's own signed-in session: **§4.2 PASS ×4** before the Worker step, **§6.2
PASS ×7** after, with **0 console errors** on every page and Enter-to-send working — the
discriminating proof the new Worker reached the browser.

**As-run: [`docs/ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](docs/ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md)
+ [part 2](docs/ops/runtime-deploy-2026-09-05-part2-worker-and-deviations.md)** (nine deviations,
D-1…D-9). **AXE was NOT run in the ceremony walk** — the MCP browser has none; accessibility is
carried by the frontend trains' own Playwright legs per surface under 裁-86.

**THE ONE FINDING THAT OUTLIVES THE DEPLOY — read it before treating H-04 as addressed.** The 裁-199
recall gate PASSED (per-kind non-regression, zero confident-and-wrong) **while the defect it was
created for turned out to lie elsewhere**. The baseline arm did NOT reproduce H-04, so the run shows
v75's prompt is **not worse** on any kind and does **not** show it is better. Root cause, measured:
**the classify lane settles BEFORE the OCR extraction is persisted** — 1.4 to 5.8 s late on all four
documents, each with exactly one extraction (`version_n` 1), and `readExtractionText` requires
`status='done'` — so the classifier is handed an **empty string** and answers `other` at ≤ 0.05.
#558's prompt sharpening addressed a cause that was not the cause. **H-04 stays OPEN**, and the
ordering race is a **new P0** below.

**⇢ 2026-09-05 — the "repair session landed, nothing deployed yet" posture block, with the merge
table of all nineteen PRs and the three-arm deploy plan, was MOVED to
[`docs/plan/completed/progress-archive-2026-09-part2.md`](docs/plan/completed/progress-archive-2026-09-part2.md)
at the ceremony's clock-out** (byte-for-byte, md5 `e109f798187a8a3608f71bd744688d6a`, 80 lines) — this file could not
hold it and the new posture inside the 500-line ceiling. Its "NOTHING IS DEPLOYED" claim was true
when written and is superseded by the block at the top of this file.

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

**⇢ The beta-live posture block that stood here — the 裁-185 GO paragraph and the whole "What ran,
and what it proved" bullet list — moved BYTE-FOR-BYTE to
[`progress-archive-2026-09-part1.md`](docs/plan/completed/progress-archive-2026-09-part1.md)** at
this truing (md5 `50f77696976ce97534407334231a8206`, 80 lines, 7294 bytes, computed on both sides of
the move and verified present there before this file lost it). It is still exactly right about
2026-09-04 ≈06:15 MYT; it is no longer a statement of today's posture. **Beta remains LIVE and
CLOSED** at `https://app.clarabook.com` for BELCORT and owner-invited testers — 裁-185 is not
reversed, and the closure is still an OPERATING posture, not a technical wall.

## Lanes

| lane | state |
|---|---|
| every build lane of the repair session | **closed** — all eighteen PRs (#543…#560) are merged; the per-lane table is in the session log below, not here |
| the DB ceremony for `0165`…`0176` (裁-189) | **DONE 2026-09-05** — 12 applied in a 9 m 46 s window; frontier **171 / `0176`** |
| runtime v75 (裁-189) | **DONE 2026-09-05** — released by image after the gate; `/ready` in the new seven-lane shape |
| the web Worker promotion (裁-189) | **DONE 2026-09-05** — `90c1a5d0…` at 100 %; rollback = re-promote `c5b1e051…` (裁-156) |
| H-43, the `verify-full` flip on the six lane DSNs | **still OWED** — NOT part of this ceremony; the pooler CA has shipped in the image since #558, which is its prerequisite |
| the queued tickets, in the 裁-202 order | **not started. The order is RULED (裁-202, 2026-09-06): Q-00 → Q-03 → Q-01+Q-02 → Q-02b → Q-04 → Q-05 → Q-06 → Q-07 → Q-08 → Q-09 → Q-10 → Q-11 → Q-12** — Q-00 is the classify/OCR race plus #558's harness-in-image defects, and Q-02b is the new "small faces" web lane. Full contents in the Backlog. Orders filed at `docs/plan/completed/repair-session-2026-09-04-orders.md` (rules: `…-house-rules.md`; register: `…-register.md`; roster: `…-roster.md`); the ruling's own decision sheet and its four evidence records are the `report-disposition-2026-09-06-*` files in the same directory |

The sprint's build closed on 2026-09-03,
the beta-live e2e ran on 09-03/09-04, and every lane in the old table was `merged` or `ceremonied` —
**that table was moved verbatim to
[`docs/plan/completed/progress-archive-2026-08-part7.md`](docs/plan/completed/progress-archive-2026-08-part7.md)**
(md5 `20a52f66ade141634b0fe9441d75e675`), which is the only place the per-lane build history of Wave F
and the beta sprint is written down. That table is the beta sprint's closed lanes; the live lanes are in the table above.

## Next

**THE PICK IS RULED — 裁-202 (owner, 2026-09-06 ≈02:20 MYT).** Twenty decisions, all per
recommendation, D-8 = 甲 and D-10 deferred, taken over a per-item disposition of all 216 rows of the
three opening reports. **The order is Q-00 → Q-03 → Q-01+Q-02 → Q-02b → Q-04 … Q-12**, carried in the
Backlog below; the sheet the owner ruled from and its four evidence records are the
`report-disposition-2026-09-06-*` files under `docs/plan/completed/`.

1. **Q-00 — THE CLASSIFY/OCR ORDERING RACE, ahead of everything.** The dispatcher must gate the
   classify lane on the extraction lane's `done` (or re-run classify on extraction completion),
   **with a cell that plants a classify task ahead of its extraction and asserts it WAITS.** The same
   lane fixes #558's two harness-in-image defects (D-2). Until it lands, the AI intake path for the
   most common Malaysian document class is dead, and H-04 stays open.
2. **The P0 block — CODED AND NOW SERVING, as of the 2026-09-05 ceremony.** The repair session wrote
   code for H-02 · H-03 · H-05 (#545) · H-06 (#549) · H-35 · H-38 (#544) · H-43 · H-48 · H-04's
   harness (#558) · C-07 (#555) · H-17 · H-19 (#556), **and all three deploy steps have now run**, so
   every one of them reaches a user. **Two caveats the ceremony measured rather than assumed:**
   **H-04 is NOT closed** — its root cause is the classify/OCR ordering race, not the prompt (see the
   posture block and the new P0 row) — and **H-43 is NOT done**: the image carries the pooler CA but
   the `verify-full` flip is its own ceremony, still owed. **Still unbuilt in P0:** H-18 the
   client-consent surface, which 裁-186 re-shaped into
   the firm-level DPA-stage declaration · **DPA v2** (H-36) and the Stripe product-description edit
   (H-37), both owner acts · the two password rotations (H-42, 裁-178 accepted) · H-47 the
   re-migration preflight and runbooks. **H-01 is closed by the v75 deploy itself.**
3. **Then Q-03, then Q-01+Q-02 as ONE D1 window** — H-21's captures projection and 裁-186's consent
   declaration both re-cut `commit_client_onboarding`, so they are one lane (D-3). H-21 alone
   unblocks four separate symptoms.
4. **The pre-上市 roadmap in its ruled order** (裁-148 · 裁-150): the pricing sitting (裁-58, which
   everything downstream waits on) → the billing TIER tranche + the AI usage ledger (裁-144) → the
   lawyer's pass over the DPA, the beta terms and the consent text (裁-125) → the real-money switch
   with Stripe live mode, KYB and the NON-ZERO checkout walk (裁-126/148) = **上市**.
5. **Hygiene** — handover [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) §C.3 and §C.5.

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

- **H-43 and H-48 — THE CODE SHIPPED IN #558 (`2060c762`, merged 2026-09-04). What is left is an
  OPERATOR CEREMONY, not a build.** On `main` today: the per-lane boot probe
  (`packages/runtime/lib/lane-probe.mjs`, whose own line 128 calls it "the full seven-lane roster",
  surfaced on `/ready` under `checks.pools` at `packages/runtime/lib/health.mjs:361-372`) · the TLS
  boot assert (`packages/runtime/lib/tls-ca.mjs`) · the build-info route
  `apps/web/app/api/build-info/route.ts` · the
  classify recall harness (`packages/runtime/scripts/measure-classify-recall.mjs`). **H-48 was
  closed by code and OPENED FOR REAL at the v75 deploy on 2026-09-05: `/ready` serves `checks.pools`
  with all seven lanes** (measured 2026-09-06 on `main` at `95441fe6`; the sentence here read
  "opens for real at the v75 deploy" until this truing). **H-43's remainder is the ceremony in
  [`runtime-tls-verify-full-ceremony.md`](docs/ops/runtime-tls-verify-full-ceremony.md): flip the
  FIVE runtime DSN secrets that take the pin in that ceremony to `verify-full`** — three more take
  it whenever their own operator ceremonies run, and `DATABASE_URL` is checked by the code but is
  not a deployed secret. The 2026-09-04 posture block keeps its historical wording; these rows are
  the current state.
- **THE QUEUE, IN ITS RULED ORDER (裁-202, owner, 2026-09-06 ≈02:20 MYT — twenty decisions, all per
  recommendation, D-8 = 甲, D-10 deferred).** The order is
  **Q-00 → Q-03 → Q-01+Q-02 → Q-02b → Q-04 → Q-05 → Q-06 → Q-07 → Q-08 → Q-09 → Q-10 → Q-11 → Q-12**
  (orders filed in `docs/plan/completed/repair-session-2026-09-04-orders.md`; the decision sheet and
  its four evidence records are the `report-disposition-2026-09-06-*` files beside it).
  **Q-00** the classify/OCR race — **ahead of everything** — plus, in the SAME lane, #558's two
  harness-in-image defects · **Q-03** DB-C, the wall-removal lane (裁-188), moved to directly after
  Q-00, with `firms.high_stakes_amount_cents` riding that migration — **deleted or demoted to an
  advisory number, never a new door** · **Q-01 + Q-02 are ONE lane in ONE D1 window** (both re-cut
  `commit_client_onboarding`) · **Q-02b, the "small faces" web lane:** the DPA signed-state hydrate
  (CB-AE2E-007) · the OTP resend (CB-AE2E-006) · `/activity` rewired to `list_firm_timeline`
  (CB-AE2E-018) · the client AI-state readout over `client_egress_state` · the payer-identifier UI
  (H-09) · the sales-lane panel over the `0176` wrapper with **F-02** (H-19 / CB-AE2E-012) · the two
  now-false `en.json` strings and the `ClaraThreadMenu` archive control · and the **FY-end countdown
  strip** (D-8: "GI clock" = 甲, no backend, ≈0.3; the statutory-calendar reading 乙 becomes a
  pre-上市 row, 丙 not now) · **Q-04** L10 `chatTurn` v18 (H-07 · H-08) · **Q-05** the web copy sweep ·
  **Q-06** reporting H-15, publishing **ONE management template** — statutory waits for the lawyer
  (D-15) · **Q-07** the required browser-smoke CI job (裁-192) · **Q-08** H-47 the re-migration
  preflight and runbooks · **Q-09** CB-001 the Terms document kind, **its sitting held THIS WEEK**
  (D-6) · then 裁-197's three: **Q-10** chatTurn tools and cards for the five gaps (≈1.5) ·
  **Q-11** real readers for the nine ids-only part kinds (≈1) · **Q-12** provisional streaming text in
  the rail (≈0.7).
- **ALSO RULED at 裁-202, each a named row with an owner:** **D-6** the placeholder / `[verify]`-token
  **deploy-gate cell (≈0.2) is built NOW**, not held for the DPA bytes · **D-13** CSP enforcement **by
  hashes**, before the real-money switch · **D-14** the **restore drill (C-14) runs FIRST**, then the
  PITR decision (C-56) · **D-16** **ONE close/bank handbook**, folding H-10 · H-13 · H-14 · H-54,
  which today each prescribe writing into a runbook that does not exist · **D-20** **one field
  re-verification walk after Q-00**: a real Maybank/Alliance statement through to reconciliation, a
  clean client finalized entirely through the UI with no DB bridge (CB-AE2E-004), and one sales
  invoice re-run for H-17's `tokens 0` residual. **D-5:** #541's exit-pack items JOURNAL-01 and
  CONSENT-01 are **re-cut to 裁-187's and 裁-186's shapes before they can be graded** — as written
  they are ungradeable. **D-10** chat export files are DEFERRED (no lane; #549's honest copy stands)
  and **D-19** "card component" CLOSES UNNAMED, re-opening when the owner names the card and screen.
  **D-11** onboarding full-screen stays opt-in · **D-12** no new UI dependency · **D-18** the two ORPHANED ROWS settle by hand at the next ceremony.
- **NEW — follow-ups the lanes and reviews surfaced, each needing an owner and a next step:**
  **F-01** `clara.sst_threshold_schedule` has no `clara_authenticated` grant, so the Tax tab's
  turnover-classification control cannot offer the statutory thresholds (裁-196 d; a SELECT grant or
  a definer read, DB-D) · **F-02** the requeue-once lane (裁-195; copy
  `readmit_autodraft_after_withdrawal`, ≈0.5) · **F-03** the 裁-196 (a)+(b) runtime follow-up —
  refuse to boot on `sslmode=no-verify`, and fail `/ready` for a CONFIGURED-but-unreachable
  non-runtime lane only (≈0.5, L9) · **F-04** the classifier engine-id `:v2` bump, which needs a DB
  lane and an in-flight transition posture because `enqueue_document_processing` hard-codes `:v1`
  (#558) · **F-05** the whole-prefix claim on the PostgREST rpc route in
  `apps/web/e2e/fs4-checkout-mock.mjs`, held closed today only by `workers: 1` · **F-06**
  `apps/web/app/globals.css` is above the 500-line write hook and the next writer must split it
  first.
- **P0 — the CLASSIFY/OCR ORDERING RACE, minted by the 2026-09-05 ceremony. This is Q-00, ahead of
  everything (裁-202 D-2).** The classify lane is dispatched and settles BEFORE the extraction lane
  persists its regions, so the classifier reads an empty string and returns `other` at ≤ 0.05 on a
  document it would otherwise get right. **Measured on all four documents that have ever run it** —
  classify finished 1.4 s, 3.1 s, 5.7 s and 5.8 s before its OCR row existed; each has exactly ONE
  `ocr` extraction (`version_n` 1), so there was no earlier row to read. **This is the real H-04**;
  #558's prompt sharpening addressed a different cause. **Fix:** the dispatcher gates classify on the
  extraction's `done` (or re-runs classify on extraction completion), **with a cell that plants a
  classify task ahead of its extraction and asserts it WAITS.** Evidence and the reproduction table:
  ceremony as-run part 1 §5.1a.
- **P0 — `#558`'s recall harness cannot run inside the image it ships in (two defects). 裁-202 D-2
  puts BOTH in the Q-00 lane.** (i) `packages/runtime/Dockerfile`'s final stage does not
  `COPY workflows/`, so `classify.mjs`'s line-28 import breaks EVERY standalone script in the image
  (the server is unaffected — it runs the nitro bundle, where the import is inlined).
  (ii) `scripts/measure-classify-recall.mjs:284` builds a bare `pg.Client` and never `SET ROLE`s, so
  it fails **42501** through every lane login by design of `roles-bootstrap.sql:190`
  (`INHERIT FALSE, SET TRUE`); route it through `packages/runtime/lib/pools.mjs`'s checkout, or
  `set role clara_runtime` after connect. **The pooler does not forward `PGOPTIONS`,** so the env-only
  workaround is closed — worth a line in `docs/ops/dsn-bridge.md`. **Lesson: an ops script that ships
  in an image must be PROVEN INSIDE THAT IMAGE before its PR merges;** #558's review verified it on
  the dev host only.
- **P0 — before the first EXTERNAL applicant, handover §C.1** (struck rows measured 2026-09-06 on
  `main` at `95441fe6`)**:** ~~H-01 the v71↔DB skew~~ **CLOSED by the v75 deploy, 2026-09-05** ·
  ~~C-07 the XML `blob:` open with no MIME gate~~ **CLOSED by #555, serving 2026-09-05** — what
  remains is a NEW row: flipping the CSP from report-only to enforcing (11 violations measured, all
  Next's own inline script and style), which needs a hashes-or-`unsafe-inline` decision ·
  ~~H-02 Maybank headers state no period bounds~~ · ~~H-03 the witness→`bank_institutions` code
  normalisation~~ · ~~H-05 the stranded `statement_facts` task~~ **all three CLOSED by #545, serving
  2026-09-05** (H-05's ONE 2026-09-04 orphan row still needs settling by hand — see ORPHANED ROWS
  (ii) below) · ~~H-06 the "Enter a statement" form omits the institution/account PAIR~~ **CLOSED by
  #549, serving 2026-09-05** · ~~H-17 `autoDraft_v9`'s masked CLR23~~ **CLOSED by #556 + `0176`, serving 2026-09-05, with an unexplained `tokens 0` residual** (Known issues) ·
  **H-18 the client-consent grant has no web surface — the FACT stands, the PRESCRIPTION is now 裁-186's** (Known issues; **Q-02**) ·
  ~~H-35 no link to /auth/confirm~~ **CLOSED by #544, serving 2026-09-05** · H-36 the DPA v1
  placeholder · H-37 ruling numbers on the Stripe checkout page · H-42 the two unrotated role
  passwords (裁-178, accepted risk) · H-43 verify-full TLS on the six lane DSNs (裁-179) · H-47 a
  live re-migration flips ceremonied roles to NOLOGIN and `0154`'s absolute role census blocks it ·
  ~~H-48 no per-lane DSN probe at boot~~ **CLOSED — `/ready` serves
  `checks.pools` with seven lanes since v75.**
- **`apps/web/README.md` is 514 lines — already over the 500-line write hook**, so the routine
  Worker redeploy runbook the ceremony earned could NOT be folded into it as planned. It landed as
  its own file, [`docs/ops/worker-redeploy-runbook.md`](docs/ops/worker-redeploy-runbook.md); fold
  it in when the README is next split. (Same class as the `apps/web/app/globals.css` row above.)
- **The four ceremony truings of 2026-09-05** (only `bank` skipped on `/ready`; FOUR Worker env vars, not three; the `clara-backup` one-off machine id in `wave-b-0019-ceremony-runbook.md` is CURRENT; `last_refusal` lives on `clara.autodraft_attempts`, not `clara.agent_tasks`) **moved BYTE-FOR-BYTE** to [`progress-archive-2026-09-part3.md`](docs/plan/completed/progress-archive-2026-09-part3.md), md5 `ee4533413bc33a7ab7f7f0a2a648c3b2`; their source is the ceremony as-run.
- **ORPHANED ROWS, both ruled PROCEED and DO NOT TOUCH at the ceremony; the owner decides disposition:**
  **(i)** `workflow.workflow_runs` `wrun_01M1MNTV64Z681KNQ6QVM4HEDH`, `clientOnboarding_v4`,
  `running` since `2026-09-03 22:22:05` UTC with zero progress — a launch-night orphan whose subject
  is the **E2E audit fixture** "Pine & Co E2E Sdn Bhd" under firm "Clara E2E Audit 2026-09-04", and
  whose onboarding plan reached `committed` 21 minutes later, so only the engine row is stuck.
  **(ii)** `clara.document_processing_tasks` `8923e85a…`, lane `statement_facts`, `running` since
  `2026-09-04 00:28:20` UTC while its workflow run `wrun_01M1MX20K6TCVBN000G2SJN7M6` reads `failed`
  twelve seconds later — **an orphan of H-03 itself**, the settlement-on-step-failure defect #545
  fixes. Settle by hand or by the stranded-requeue path.
- **P1 — before 上市, the walk's own rows, handover §C.2** (measured 2026-09-06 on `main` at
  `95441fe6`; **H-11 · H-12 · H-16 · H-26 · H-27 · H-30 · H-38 left this line — all seven are CLOSED
  and serving since 2026-09-05**: H-11 and H-16 by #549, H-12 by `0165`+`0166`, H-26 · H-27 · H-30 by
  #546, H-38 by #544)**:** **H-04 the classifier does not recognise bank statements — RESTATED: the
  cause is the classify/OCR ordering race**, not the prompt, so the prescription is the dispatcher
  gate named in the new P0 row ABOVE, never another prompt pass · H-07/H-08 the close-prep chat lane cannot read a close
  run, and says the wrong reason · **H-09 the payer-identifier DOOR IS BUILT and its FACE is not** —
  `0174:785` mints `clara.set_counterparty_identifiers` (granted `:855`) to record or clear the
  registration number and TIN on an EXISTING counterparty, while `apps/web` has zero call sites for
  it and no copy explaining the refusal · **H-15 zero report
  templates** (`packages/db/seeds/` holds only the smoke and core seeds; the structural blocker is the
  publisher/renderer manifest disagreement) · **H-19 the sales-lane REGISTRY IS BUILT and its FACE is
  not** — `0176:327` mints the owner-floored `set_firm_sales_lane_activation` wrapper (granted
  `:369`) taking the firm from `_human_ctx`, and no `apps/web` surface calls it ·
  H-20 `add_client_identifier` has no surface · H-21 **the interview's captures are never
  projected** · H-39 a duplicate Stripe webhook endpoint · H-40 two undecided Supabase auth
  settings · H-45 the Resend cap was never read · H-46 the Mail gate is not formally certified ·
  **H-49 the DR canary REGISTRY IS BUILT and the SCRIPT still hard-codes the ids** — `0174:928` creates `clara.dr_canary_subjects` (no UI, by ruling) while
  `packages/db/scripts/dr-verify-checks.mjs:399,:415` still carries the two id prefixes and no
  ceremony has seeded a row; probe `4.9` stays UNPROVEN IN THE FIELD (裁-172).
- **P1 — already ruled before the launch night, handover §C.1's second table:** C-01 the pre-上市
  roadmap · C-02 the billing tier tranche + the AI usage ledger (AI is UNMETERED in beta) ·
  C-03 the C-2 operator screen (裁-147) · ~~C-04 the pool error contract (裁-149)~~ **CLOSED by #558, serving 2026-09-05** —
  `packages/runtime/lib/pool-error-contract.mjs` + the contract at `docs/ARCHITECTURE.md` §4.3; 裁-149's clause 2 corrected by erratum in #559 · C-05 G1 PR-2
  (裁-165) · C-06 the beta Terms of Service (裁-129/166) · C-08 the ten 裁-176 ports and fixes · C-09 the checkout/webhook follow-ups ·
  **C-10 — ONLY THE STRANDED-PAYMENT CLAUSE CARRIES.** Its `livemode`-stored-never-read half is a stale premise: `packages/runtime/lib/stripe-livemode.mjs` refuses a mode-mismatched event BEFORE
  `record_stripe_event` and fails closed when the mode is unset (#511, 2026-09-03; #544 extends the
  key-class gate to the web arm). The stored COLUMN stays deliberately unread, by design ·
  ~~C-11 SSE re-authorisation~~ **its premise was FALSE when the row was written** —
  `packages/runtime/src/streamRoute.ts:64-88` re-runs `authenticate` + `assertTaskStreamAccess`
  inside the poll's own checkout and closes with an explicit `revoked` event; #511 (`344f7ad8`,
  2026-09-03) ·
  C-12 `/ready`'s hard storage gate (裁-61) · C-13 the archived backend queue (裁-123) · C-14 the
  overdue R2 restore drill (裁-163) · C-15 the bigint wire boundary (裁-71⑨) · C-16 single-machine Fly
  with no HA and no external alerting.
- **P2 — hygiene, handover part 2 §C.3 · §C.4 and part 3:** **22** web/product nits from the walk,
  of which **12 are CLOSED and serving** (measured 2026-09-06 on `main` at `95441fe6`) — H-22 ·
  H-24 · H-25 · H-28 · H-31 · H-32 · H-34 · H-50 · H-51 · H-53 · H-55 · H-56 — **and 10 are open:**
  H-10 · H-13 · H-14 · H-23 · H-29 · H-33 · H-52 · H-54 (open or partial; **H-23 and H-33 carry
  REJECTED prescriptions — read the part-3 Errata before acting**) · H-41 (the owner's own, 裁-168) ·
  **H-44, the `held_outbox` 6, explained as 裁-165's disabled-source counter, rides C-05** · the full
  CARRIED registry **C-17 … C-88**
  (database, runtime, frontend, reporting/close/tax, ops/DR/security, harness/CI — **C-77 … C-88 are
  twelve rows in part 3 that carry the fourteen a fresh-context review found missing from the first
  cut — ten as rows, four as named dispositions**) ·
  and **§C.5, the seventeen documentation truings the rulings ordered that this truing did NOT
  execute** — the Wave-G checklist and `docs/ops/DR.md` lines from 裁-161/162/169/170/177, the T-K
  wrangler comment, the `0161`→`0163` citations, and the rest, each naming its file.
- **The owner's own acts. FIVE are ruled for TODAY, 2026-09-06 (裁-202 D-7):** H-37 the Stripe
  checkout page copy · H-39 the duplicate webhook endpoint · H-40 the two Supabase settings
  (`jwt_exp`, HIBP) · H-45 the Resend cap read back into the checklist · H-46 the call on whether
  S21's Gmail code certifies 裁-146 point 3. **Also ruled: the DPA v2 draft goes to the lawyer NOW**
  (H-36, D-6), and **the Terms sitting is held THIS WEEK** (Q-09 · CB-AE2E-001 — must checkout
  require BOTH receipts, and may a Terms body with 27 lawyer markers be seeded). Standing, unruled:
  the two `clarabook-frontend` recut PRs (裁-168) · the elevated-shell worktree removal and the WSL
  `.vhdx` compaction (裁-173) · destroying his own `codex-e2e-rate-wall-sleeper` machine on
  `clara-backup`.

## Known issues

Same index rule: the detail is in the handover. What a reader most needs to know today:

**From the 2026-09-04→05 session. The rows below were first measured on `main` at `5007bbcc`; each
one still standing was RE-MEASURED on `main` at `95441fe6` on 2026-09-06 and says so where it
changed.**

- **EVERYTHING THE SESSION BUILT IS SERVING** (measured 2026-09-06 on `main` at `95441fe6`; the
  earlier "NOTHING THE SESSION BUILT IS SERVING" text was true when written and is now false).
  **All NINETEEN PRs #543…#561 are ancestors of `0351f022`** — each tested with
  `git merge-base --is-ancestor` on its own merge commit — and `0351f022` IS #561's merge commit, so
  the ceremony carried every one: runtime **v75** (`img_wd57v5d3lej9p38o`), web Worker
  **`90c1a5d0…`**, DB frontier **171 / `0176`**. *(Both 2026-09-06 disposition reports say #560
  landed AFTER the web build. It did not — `2f736758` merged before #551. It changes no serving byte
  for a different reason: it edits only an e2e spec, which the Worker bundle does not carry.)*
  **The `0174`/`archived_at` ordering hazard is PAST** — the ceremony applied the DB first — and its
  reader was never `apps/web`: the SELECT naming the column is the RUNTIME's at
  `packages/runtime/src/chatRoutes.ts:178`; on `apps/web` it appears only in comments and one string.
- **No door can close an open question whose document filing was RETIRED** (review-551 on #551).
  `retire_document_filing` never touches `open_questions`, and both `resolve` and
  `dismiss_open_question` are walled by `_active_document_filing`; `0169` now makes the same orphan
  block `set_document_kind` too — a correct refusal that widens a pre-existing dead end by one door.
  Needs a small door (`dismiss_orphaned_question`, or a lift inside `retire_document_filing`).
- **A chart planted mid-interview survived a cancelled client and blocked every later apply forever**
  (`0173`'s own header, lines 98–115). Until that rung the door consulted the onboarding plan
  nowhere, so a chart could be applied mid-interview and, if the client was then CANCELLED, archived
  holding it, with `chart_not_empty` refusing afterwards. 裁-193's rung closes the path forward;
  **any client already in that state predates the fix and is not repaired by it.**
- **`clara.sst_threshold_schedule` has no firm-user read** (裁-196 d) — the Tax tab's classification
  control can only offer the client's own watch groups.
- **The classifier engine id cannot be bumped to `:v2` without a DB lane** (#558) —
  `enqueue_document_processing` hard-codes `:v1` at `0123:1128`, `classify_document` matches it
  exactly at `0016:3225-3228`, and `0102:447` byte-pins it. A bump today strands every classify task.
- **Three e2e-harness rules the CI-E2E lane (裁-192) must carry, or the browser gate ships blind:**
  **(i)** the table primitive has **no browser coverage** — no walk face renders a read-only table
  that scrolls, and axe applies `scrollable-region-focusable` only to a region that actually scrolls,
  so `apps/web/components/ui/table.tsx`'s `tabIndex` is unproven in a browser · **(ii)** the mock
  **body-consumption** order hazard — `bank-close-registers-mock.mjs:206` reads the request body
  unconditionally on every PostgREST rpc POST, and only hook ORDER keeps the later lanes alive; the
  fix is one memoising `readJson` plus a parse-after-match cell · **(iii)** the **selector-luck**
  class, found 2026-09-05 on `documents-viewer-walk.spec.ts:198` — a generic `svg[aria-hidden='true']`
  picked a breakpoint-hidden icon on one tree and the overlay on another with identical code, so the
  cell passed by luck; every smoke spec must use a subject-scoped locator and assert it resolved
  before measuring.
- **`packages/runtime/README.md` is stale against #558.** Grepped on `main` at `5007bbcc`, it names
  `packages/runtime/lib/tls-ca.mjs` exactly once — line 398, about the in-image CA path and its
  drift cell — and names **none** of the per-lane boot probe, the build-info route, the recall
  harness, or the
  new `/ready` shape that reports `checks.pools`. A reader following that README today will not
  learn the runtime grew a boot probe. **Owner: the 裁-196 runtime follow-up lane**, which is
  already touching the same files.
- **The H-04 classify gate's floor is NON-REGRESSION, not a number** (**裁-199**, which closed this
  the same day it was filed). Runtime v75 ships when per-KIND recall with the new prompt is ≥ the
  live prompt's, **kind by kind and never as an aggregate** — an aggregate can rise while bank
  statements collapse, the exact H-04 failure the walk found — **and when no row the new prompt gets
  wrong at confidence ≥ 0.8 was right under the live one; ONE such case blocks the image.** Do not
  mistake `packages/runtime/scripts/measure-classify-recall.mjs`'s `CONFIDENCE_GATE` of `0.8` for a
  pass mark: it is the per-row bar `clara.classify_document` itself applies, at the script's own
  line 63. **No absolute floor exists yet, by ruling** — the first run against the real corpus mints
  the baseline and the owner sets a number then.
- **`apps/web/README.md` has no routine Worker redeploy or version-promote runbook.** It documents
  the `wrangler.jsonc` bindings and the secrets posture, and it carries no deploy or release
  section at all — the only walked procedure anywhere is the FS-10 first-deploy as-run, which is a
  one-time cutover record, not a repeatable runbook. **The v75 and Worker ceremony as-run creates
  it**; until then a promote is done from memory, and there is no repoint rollback (裁-156).
- **Two stale in-code claims, both measured:** `apps/web/components/firm/identifier-promotion-row.tsx:7`
  still cites the pre-numbering name UNNUMBERED_proposal_basis_resolved.sql, which has since been
  numbered `packages/db/migrations/0143_proposal_basis_resolved.sql` ·
  `apps/web/app/(firm)/clients/[clientId]/layout.tsx:65-66` says "22 call sites in 20 files on this
  tree, **7** of them client-altitude" — the 22 and the 20 still measure true, but the
  client-altitude count is **9**: four `<PageHeader>` call sites in pages under the client route plus
  five in workbench components that render only there (close, documents, journals, reports, tax).
  The comment undercounts because it filtered by route path and the five workbenches live under the
  components tree.

**New at the 2026-09-06 disposition truing, both measured on `main` at `95441fe6`:**

- **THE DB'S HIGH-STAKES WALL SURVIVED THE REMOVAL OF THE UI CONTROL THAT CONFIGURED IT.**
  `_approve_entry_core`'s segregation rungs still stand at
  `packages/db/migrations/0037_wave_c_a_subledger.sql:1992` and **no migration in `0165`…`0176` names
  `high_stakes` at all** (grepped, zero files), while #550 deleted the Change-threshold control
  outright under 裁-187, its own cells now pinning the absence
  (`apps/web/components/firm-admin/firm-admin-pages-a11y.test.tsx:253`). So an above-threshold
  approval still refuses and **there is no surface left on which to change the threshold.**
  **UNMEASURED: whether any live firm carries a non-zero `high_stakes_amount_cents`** — the bridge
  sleeper was destroyed at the ceremony's teardown, so no live read was taken. At zero the dead angle
  is theoretical; above it, that firm cannot approve. **DISPOSITION IS RULED — 裁-202 D-4:** the field
  rides Q-03's wall-removal migration (裁-188) — **deleted or demoted to advisory, never a new door**.
- **THREE IN-TREE CLAIMS WENT FALSE WHEN `0174` APPLIED, and two of them are USER-FACING copy.**
  (i) `apps/web/components/clara/ClaraThreadMenu.tsx:23` still tells a reader "the table has no
  `archived_at`" — `0174:578` added the column and `0174:650` mints `clara.archive_chat_session`
  (granted `:684`), so **the archive control is buildable and simply unbuilt.** (ii)
  `apps/web/app/(firm)/activity/page.tsx:26-32` still comments that the firm-wide timeline read "is
  a DATABASE gap" — `clara.list_firm_timeline` exists at `0174:453`, granted `:513`, and Firm Home
  renders it through `apps/web/lib/firm/timeline.ts`. (iii) The two `en.json` strings asserting those
  absences — `:260` `timelineNotBuilt` and `:475` `archiveNote` — are now **factually wrong on a beta
  user's screen**, telling them the product lacks what it has. **Route:** the copy sweep (**Q-05**)
  or whichever web lane next opens those files; the two strings should not wait for the sweep's turn.

- ~~**The serving image and the schema disagree** (H-01)~~ — **CLOSED, and the storm is MEASURED
  STOPPED, not inferred stopped.** The acceptance clause ("ten minutes of log without the retired
  function") was taken 2026-09-05 over a **48 m 30 s** window (17:08:15Z→17:56:45Z) on machine
  `48ee715b763048`: **100 lines, every one the 30-second `WIKI_PROJECTION dormant` heartbeat** — so
  100 is the window's true content, not a truncation cap — with `reconcile_autopost_rules` matched
  **0**, `does not exist` **0**, errors and warnings **0**. **This was measured AFTER the R2 record
  was written** — by the ceremony lane on 2026-09-05, `fly logs -a clara-runtime`, machine
  `48ee715b763048`, reported to the lead at 17:56:52Z; **the R2 record's "never measured" line
  describes the state before that read**, and both are true of their own moment. On `main` the
  retired name survives only in comments, plus a regression guard that reds if a caller ever returns.
- **Only H-04 now stands among the bank-statement rows, and its CAUSE HAS CHANGED.** H-02 · H-03 ·
  H-05 (#545) and H-06 (#549) are closed and serving since 2026-09-05, so the human "Enter a
  statement" form is reachable and the hand-key path works. What still breaks the AI path is the
  **classify/OCR ordering race** (the new P0 above), not a prompt and not the header parser. Two
  provisos: no real Malaysian statement has been re-run on v75, so these four are closed on CODE AND
  SHIPPING, not on a field re-proof; and one 2026-09-04 `statement_facts` task is still stranded
  `running` (ORPHANED ROWS (ii)).
- ~~**The unattended coder refuses every sales invoice**~~ — **CLOSED by #556 + `0176`, serving
  2026-09-05.** `autoDraft_v10` maps 23505 by exact constraint name instead of a substring and the
  alias unique is kind-scoped, so a collision no longer surfaces as an unanswerable CLR23. **The
  residual is real and unqueued:** #556 states the walk's `error_code internal` / `tokens 0` shape —
  the model never called at all — is NOT explained by v10. Re-run one sales invoice; if the shape
  survives it is a new defect, not this one.
- **A firm still cannot enable AI processing for a client through the product** (H-18) — **the FACT
  stands, the PRESCRIPTION does not.** Measured 2026-09-06: `apps/web` has **zero call sites** for
  any egress verb, while the READ door `clara.client_egress_state` is live and granted (`0174:271`,
  `:366`). The old fix shape — a per-client grant plus per-purpose activation — was **replaced by
  裁-186 / ADR-0078**: consent is ONE firm-level declaration signed at the DPA stage, and the
  onboarding commit auto-mints each client's consent citing it. Build that declaration plus a
  per-client state readout (**Q-02**), never the per-client button.
- **The onboarding interview's captures never reach the database** (H-21) — no `client_identifiers`,
  no `client_facts`, no `clients.fy_end_month`, no `bank_accounts`. Four separate symptoms, one cause.
- **Two role passwords sit unrotated in this session's transcript** by ruling (H-42, 裁-178), and
  **all six runtime lane DSNs run TLS with the certificate unverified** (H-43, 裁-179).
- **The DPA in force is the v1 placeholder** (H-36), and **the Stripe checkout page shows internal
  ruling numbers** (H-37).
- **DR probe `4.9` is UNPROVEN IN THE FIELD** (H-49) — its subject died with the schema by ruling and
  the verify script hard-codes the ids.
- **Two standing laws, kept live here; their dated 2026-09-04 measurements moved BYTE-FOR-BYTE at the
  裁-202 commit** (md5 `ee00ad7ca2b8e8ee099f06482fbe99e9`) **because those counts self-stale.**
  **(1) The 500-line ceiling is a WRITE-BLOCKING PreToolUse hook** — a 501st line is refused AT THE
  WRITE, so the next writer of ANY file checks its count and archives or splits BEFORE adding.
  **(2) The worktree census is a WALK, never a list (裁-173)** — re-walk `git worktree list` first, unlink every reparse point, re-walk to prove none remain, then remove, then post-flight `git status` on main; never `robocopy /mir` without `/XJ` — the exact procedure that removed **all 60** .claude/worktrees entries from merged lanes on **2026-09-06** (`git worktree list` now shows `main` only).
  **The WSL `.vhdx` was 77.3 GB before `wsl --shutdown`, 31.8 GB after it** — Windows reclaimed the freed sparse blocks automatically at 06:47; the distro holds ~9.5 GB, so a `diskpart` → `compact vdisk` (admin) is OPTIONAL for the remaining ~20 GB, not owed — and **the CI runner fleet is separately DECOMMISSIONED** (`docs/ops/ci-runner.md` "Decommissioned 2026-09-06"); WSL itself stays live for the DB test rigs and the Worker's Linux-only OpenNext build. **WSL idle-terminates without a Windows-side holder** — plant a detached keeper before the next port-dependent WSL work.
- **`0154`'s cluster-wide role census, the CI half — CLOSED BY MEASUREMENT** (#525 derived the roster from `packages/db/deploy/roles-bootstrap.sql` and pinned it; four hosted sweeps came back 13/13 green including `closed-wave-drills`); **the record moved BYTE-FOR-BYTE** to [`progress-archive-2026-09-part3.md`](docs/plan/completed/progress-archive-2026-09-part3.md), md5 `eab73a1686b9f07c4812ca7495f460a9`. **The LIVE-cluster half stays open as H-47.**
- **Two TRUED findings' pointer text (RISK 50, the Mail gate; the confirmation login-CSRF finding)** moved BYTE-FOR-BYTE at this truing to [`progress-archive-2026-09-part3.md`](docs/plan/completed/progress-archive-2026-09-part3.md), md5 `61f7233bf690c46e5b3cb43dceb55641`; the live obligations stay carried as **H-46** and **C-63**.

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
it. **At the 2026-09-05 repair-session clock-out the beta-live posture block moved to the first
2026-09 part,
[`progress-archive-2026-09-part1.md`](docs/plan/completed/progress-archive-2026-09-part1.md)** — 80
lines, 7294 bytes, md5 `50f77696976ce97534407334231a8206` on both sides.)*

- **BOTH 2026-09-04 ENTRIES MOVED BYTE-FOR-BYTE at the 2026-09-06 disposition truing** to
  [`progress-archive-2026-09-part3.md`](docs/plan/completed/progress-archive-2026-09-part3.md), each
  md5-proved on both sides: **"BETA WENT LIVE"** (`759c32130a33e2584574fcdbd506c6ea`) — FS-10's
  Worker cutover, FS-11's schema rebuild and re-mint of BELCORT through the product's own door, and
  the 裁-184 walk in which six of eleven milestones passed with every failure fail-closed and
  receipted, ending in **裁-185 GO, closed beta** — and **"THE REPAIR SESSION"**
  (`fb1f9181f13d71d3444fa62474f73088`), eighteen PRs under 裁-186…200, every register item anchored
  to code before a lane opened. **Read the second with its supersession note:** its title and last
  sentence say NOTHING DEPLOYED, true when written and superseded by the posture block above.
- **2026-09-06 — THE DISPOSITION SITTING, four PRs, all merged:** #564 filed the repair session's orders,
  rules, register, roster and ceremony order/runsheet verbatim; #565 dispositioned every item of the three
  opening reports against `fc39c361` (裁-202: 66 of 128 walk rows FIXED and serving, the ruled queue
  Q-00 → Q-03 → Q-01+Q-02 → Q-02b → …) and trued this file; #566 vendored mattpocock/skills at `3cca18b3`
  (v1.2.3; six upstream-retired skills kept pending the owner's word); #567 killed the 0.28 % CLR10
  account-number fixture flake CI met on #566 (`f-a3pr3.mfA.pos`), with a 10 000-draw property cell;
  the host clean-up — runners decommissioned, docker pruned 25 GB, 60 worktrees removed,
  codebase-memory-mcp 0.10.8, canonical graph rebuilt (39 970 nodes / 204 921 edges).

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
