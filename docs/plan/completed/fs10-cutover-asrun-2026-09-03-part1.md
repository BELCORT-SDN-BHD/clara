*Part 1 of 3 of the FS-10 P6-X cutover as-run (2026-09-03 → 09-04) — filed VERBATIM at the final clock-out truing. **Parts 1 and 2 are the ceremony's step TEMPLATE (S1…S27, 49 boxes), written before it opened; part 3 is the cutover AS IT HAPPENED and governs on any divergence.** Previous: none (this is the first part) · Next: `fs10-cutover-asrun-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered. ONE exception, recorded here: the line wrap at "the owner's authenticated walk `routes-20260903-234237`" (≈line 172) was moved one word earlier — **the words are unchanged** — because gitleaks' `generic-api-key` rule read the blockquote marker starting the next line as a key/value separator in front of that walk-run name and reded the lint job.*

# FS-10 / P6-X — THE CUTOVER AS-RUN (executable)

**`app.clarabook.com`: Cloudflare Pages project `clara` (serving the legacy `apps/dashboard`) → Cloudflare
Worker `clara-web` (serving `apps/web`, built by `@opennextjs/cloudflare`).**

**Cut 2026-09-03 21:0x MYT (shell clock, `date`) by a read-only lane.** Base: merged `main`
**`9d5d844e`** (PR #539 merged 20:48 MYT). Nothing in this file has been run. Every repo fact below was
re-measured at `origin/main` **`9d5d844e`** for this cut — not carried from the prep.

**Source records.** The prep is `…/scratchpad/ceremonies/fs10-cutover-prep.md` (D1…D8, S1…S27, the acts, the
rollback table, its RIDERS block). The rulings that re-cut it are `…/scratchpad/truing/ruling-151.md` …
`ruling-158.md` and `ruling-174.md`, consolidated in `…/scratchpad/ceremonies/owner-decisions-2026-09-03.md`
§−1. **Where this file and the prep differ, this file governs** — the prep's body is pre-ruling text.

**How to use it.** Run top to bottom. Every step carries: the number, the ACTOR, the exact command where the
repo has one, the READ that proves it, a `[ ]` box, and an `as run:` line for the timestamp and the reading.
**A box is ticked only by a read that was actually taken.** Absence is not evidence and a derivation is not
evidence (AGENTS.md review law 2) — an unavailable read is written `NOT-WALKED`, never left blank and never
inferred.

**Actor key.** `[O]` = the owner — Cloudflare and Supabase dashboard clicks, `wrangler secret put` of
credential-bearing names env-to-env, the domain attach, the Pages project delete, and the minting of the two
shared secrets (裁-152). `[L]` = the lead — builds, uploads, reads, the Playwright walk, this record's
writing.

**Secrets discipline.** No value in this file, ever. Names only. Secrets move environment to environment and
are never typed into chat, a log, a PR or a screenshot (hard constraint 4; constraint 14's operative clause:
the product's security mechanisms are the thing under test and are never weakened for testing convenience).

---

## 0 · THE RULINGS THAT RE-CUT THE PREP — read before step 1

| 裁 | What it changes in the prep |
|---|---|
| **151** | Chat and SSE ride the same-origin `/api/runtime/*` proxy. **MERGED** — measured below (P-12). The runtime's CORS surface is not widened. Standing steer: the smoothest standard shape, an efficient architecture. |
| **152** | The owner **MINTS** `CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN` locally at **S8**, keeps them in a password manager, sets them env-to-env. The hash-equality proof is **deferred to FS-11 step 12**, where the comparison first has two operands. FS-10 records the two NAMES present plus the minting sentence. |
| **153** | Security-pass cutover lines **3 · 4 · 5 · 7** are written **"DEFERRED to FS-11 step 12 / 11 / 6 / 13"** — never ticked. The other seven are ticked with their reads. |
| **154** | **No allowlist widening at any point.** The preview walk is password-login only. The signup-confirm and password-recover arms are proven on the REAL origin at S21. |
| **155** | **S16** is the `?ct=` edge-log redaction: look on screen first; configure and prove with one live invite link if a control exists; otherwise a dated explicit deferral naming the exposure. Never a silent skip. |
| **156** | **NO SOAK.** Prep S23 is VACATED. The Pages project delete follows the real-origin re-walk **in the same sitting**, gated by S21 (the three observations folded into S21's own reads). After the delete there is no repoint rollback: a broken Worker is fixed **forward** through `wrangler versions`. |
| **157** | No maintenance page during FS-11. FS-10's as-run records the window. FS-11 may open as soon as this record is written. |
| **158** | The `apps/dashboard` **source delete is its own PR** (branch `web/p6-x-source-delete`), and it **merges after S21 passes**, never on the repoint commit. A hand `gh workflow run ci.yml` follows the merge. |
| **174** | FS-10 opens **tonight, 2026-09-03**, as soon as the hand sweep on `9d5d844e` is green and the remote-walk instrument is in place. |

**The one sequencing law that governs the whole ceremony**
(`docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md:451-454`, re-read at `9d5d844e`):

> The proxy repoint and the Pages retirement are separable from the source delete and **must not ride the same
> commit**: repoint first, **prove the Workers build serves every route**, *then* delete. **A rollback after a
> repoint is a repoint; a rollback after a delete is a restore.**

Under 裁-156 the second half is sharper still: after S25 there is no restore either. S21 is the only gate.

---

> **RIDER (lead, 21:12 MYT, measured):** (1) **The Windows-side `wrangler` is Node-22-gated too**
> (`wrangler --version` → "requires at least Node.js v22.0.0. You are using v20.19.5"), so **BOTH the build (S7)
> and the upload (S9) run from the WSL clone `~/fs10/clara` @ `9d5d844e`** prepared by the `fs10-build` lane
> (fnm Node 22, corepack pnpm, ext4). P-10's auth = `wrangler login` run INSIDE that WSL shell — it prints a URL,
> the owner approves it in the Windows browser (OAuth; no token typed anywhere). P-11's keeper is the lane's
> `wsl -d Ubuntu -- sleep 14400` background task. (2) **No `apps/web/.env.local` existed at 21:11** — the owner
> writes it in the MAIN checkout with the two `NEXT_PUBLIC_*` names (values from Supabase → Project Settings →
> API); the lane copies it into the clone, never prints it. (3) S8/S8a's `wrangler secret put` lines also run
> from that WSL shell (the owner types the values there). (4) P-14 measured 21:10: `clara-runtime` v71,
> machine `48ee715b763048`, 2/2 checks passing. (5) `apps/web/.open-next/` is gitignored (`.gitignore:27`).

> **READS TAKEN BEFORE S1 (lead, shell clock, 2026-09-03):**
> - **P-9 / P-10 MET 21:54** — `wrangler login` (OAuth, browser) in the WSL clone; `whoami` → Account
>   "Tools@belcort.com's Account", id `ac42cba1bda978bd00f6c45d0e25dc24` (matches the repo's `ac42cba1…`);
>   scopes include workers / workers_scripts / workers_routes / pages (write). Credentials in
>   `/root/.config/.wrangler/config/default.toml` (WSL only).
> - **P-11 MET 21:34** — build machine = WSL Ubuntu, node v22.23.2 at `/opt/node/bin`, pnpm 10.33.0, clone
>   `/root/fs10/clara` @ `9d5d844e` (ext4); keeper `sleep 14400` pid 1033107 alive.
> - **P-14 MET 21:10** — `fly status -a clara-runtime`: machine `48ee715b763048`, VERSION 71, started, 2/2 checks.
> - **P-15 MET 21:28** — PR **#540** open at `b98197df` (DO-NOT-MERGE banner; not armed). Its "Cloudflare
>   Pages" check FAILS by construction (the Pages integration builds the deleted app); not in the `ci` gate.
> - **S4 (the deploy record) READ 21:55, wrangler half:** Pages project `clara` — domains `clara-e3o.pages.dev`
>   + `app.clarabook.com`, Git provider YES; **Production deployment `0b557abd-e4d0-4d22-9ff2-ae821f5eead8`,
>   branch `main`, commit `9d5d844`, ≈1 h ago** (the OLD `apps/dashboard`, rebuilt on #539's merge); newest =
>   a FAILED Preview of `web/p6-x-source-delete` @ `b98197d`. **Worker `clara-web` does not exist on the
>   account** ("This Worker does not exist" [10007]) — S9's upload creates it. DNS half (21:36): `nslookup`
>   → 104.21.20.206 / 172.67.194.103 (+2 AAAA, Cloudflare-proxied); `curl -sI` → 200, `Server: cloudflare`,
>   `CF-RAY: a355241b2a5ac419-WAW`, text/html. The on-screen half (the dashboard's own view) is the owner's at S4.
> - **S7 DONE 21:34 (13:34:14Z)** — `cf:build` exit 0 in the WSL clone; `.open-next/worker.js` 2,278 B, sha256
>   `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`; `.open-next` 46 M uncompressed;
>   leak grep: assets 1 hit = supabase-js's `sb_secret_` PREFIX LITERAL (benign), worker.js 0; fly.dev in
>   assets 0; money-input-harness 0; e2e env names 0; node v22.23.2. The compressed size is read at S9/S10.
> - **S11 CORRECTION (measured 23:46 on version I by the owner's authenticated walk):** the same-origin
>   arm of `POST /api/invite` on the `workers.dev` preview **PASSES** (200, a real invite created), the
>   cross-origin arm **403 `cross_origin`**. `apps/web/lib/same-origin.ts:179-181` accepts an Origin that is
>   allowlisted OR whose host is the request's own host — the preview's own origin is same-origin by the
>   wall's law. The rider R3 / S11 read 2 claim "every walled POST refuses on the preview" was derived, not
>   measured, and is WRONG; strike it. S11's three reads become: (1) the served value = narrow ✓ (S9's
>   bindings); (2) the same-origin arm passes on any host the Worker serves; (3) the cross-origin arm 403s
>   (the wall consulted) ✓. The `wrangler.jsonc` comment carrying the wrong claim is a truing line (T-K).
> - **S13 PASS / S14 PASS (version I, the owner's manual walk 23:50–00:20 09-04):** S13 — ⌘K Do → client
>   onboarding; the interview runner rode `/api/runtime/interview/*` through the proxy on the live
>   runtime (client "Do", step 2 `entity_type` answered/recorded; "Commit onboarding" rendered; one console
>   404 on a `state` poll, timing unknown, recorded). S14 — the four reads: (1) `turns` 202 · `stream` 200 ·
>   `messages` 200 all same-origin under the app's chunk; no `clara-runtime.fly.dev` request; (2)
>   `Content-Type: text/event-stream; charset=utf-8`; (3) a streamed body (TTFB ≠ duration); (4) **TTFB
>   1.83 s, Content Download 4.22 s, total 6.05 s ⇒ INCREMENTAL on the wire** — the reply text appearing
>   at once is the product's single `freeform_result` part, not buffering. **The OpenNext-on-Workers
>   streaming question (notFound 4 / D1's unknown) is SETTLED: it streams. No fallback, no STOP.**
> - **S17–S21 AS RUN (09-04):** S17 [O] between 00:24:40 and 00:31:18 (the owner forgot the minute; bounded
>   by reads). S18 [L] 00:24 — `versions deploy c5b1e051…@100%` SUCCESS (run before S17 by the lead's order
>   swap: no traffic moves without a domain). S19 [O] ≈00:30 — `app.clarabook.com` attached to `clara-web`
>   (Production, zone clarabook.com). S19 read 00:31:18–41: `curl -sI https://app.clarabook.com/` → 307
>   `/login?next=%2F` · `Cache-Control: private, no-store` · `Server: cloudflare` · CF-RAY …-SIN/-HKG/-NRT;
>   `/login` 200 — the Worker. S20: served bindings = S18's version I (narrow origins); the same-origin POSTs
>   on the real origin succeeded (recovery set-password; chat `turns` 202). **S21 CLEAN on every read:**
>   anon routes `routes-20260904-003213` 32 PASS (+2 instrument mismatches, resolved by code reads);
>   authenticated ABBREVIATED (login · Firm home · chat) on the real origin, the full 11-landmark auth walk
>   on the same version I on its preview host; `__Host-clara-auth` landed; chat/SSE via `/api/runtime/*`
>   (streaming proven at S14); **signup-confirm arm: the six-digit code ARRIVED at a non-team Gmail; the
>   confirm page returned the honest "Confirmation isn't available yet … not counted as an attempt"** (the
>   C-5 runtime half unset until FS-11 step 12 — the full certification is FS-11 step 17); **recovery arm
>   end to end** (LINK mail → `/auth/recover` → new password → signed in); origin wall: same-origin
>   passes, cross-origin 403; Obs 1 ✓ · Obs 2 ✓ · Obs 3 Worker Errors = 0 (Cloudflare Metrics). **Found by
>   the walk: (a) Supabase `mailer_otp_length` was 8 vs the six-digit form — fixed by the owner to 6
>   (checklist truing: read it back at S22/the walk); (b) the "exists-unconfirmed" signup page has no link
>   to `/auth/confirm` (Known-issues, post-beta web PR); (c) one real test invite created by the
>   instrument's probe on I (wiped at FS-11). ⇒ S25 UNLOCKED (裁-156).**
> - **S24 DONE ≈01:00 09-04:** #540 (`web/p6-x-source-delete`, head `ae0cc114`, review CLEAR ×2, every
>   check SUCCESS incl. `ci`, 裁-176 a…l all ruled) squash-merged as **`ba8e7d35`** with the prepared message
>   (the counted 19/18/10/12; 裁-158/175/176 named). Hand sweep **33781966143** dispatched on it. The
>   main checkout and the WSL clone both at ba8e7d35 (`packages/db` delta vs 9d5d844e = one README line;
>   no migration moved). S24 ran before S25 by the lead's order — the two are independent, and the
>   Pages check had already detached at S6.
> - **S22 AS RUN (01:0x–01:15 09-04):** (1) [O] both `workers.dev` URLs (Production + Preview) switched OFF
>   ("已關閉"; the read-back curl is taken at close-out). (2) [L, with the owner's PAT env-to-env] the
>   Management API `GET /v1/projects/bzecqklouchkmdmdxlln/config/auth` at 17:14:57Z: `uri_allow_list` =
>   `https://app.clarabook.com, …/signup, …/auth/confirm, …/auth/recover` — **FOUR entries, no wildcard;
>   two MORE than the ruled pair** → narrowed by the owner to `…/auth/confirm` + `…/auth/recover` (or
>   accepted on the record); `disable_signup=false`; `mailer_otp_length=6` (was 8 — fixed at S21);
>   `mailer_otp_exp=3600`; `rate_limit_email_sent=100/h`; SMTP resend / no-reply@mail.clarabook.com / Clara;
>   the confirmation template = `{{ .Token }}` only (**security line 8 TICK**); (3) the recovery template =
>   `{{ .ConfirmationURL }}` LINK, unchanged ✓. The S4 on-screen half is moot after S25.
> - **S26 (R-3) — NOTHING OWED, measured by the find-r3 lane:** `verify_snapshot`'s runbook line was paid
>   2026-08-29 as `docs/ops/DR.md` §11 (#421, 裁-98); `record_notification`'s verify-then-decide verdict is
>   `PROGRESS.md:192` (#445, "KEEP AS-IS, no UI home yet"). The P6 orders' paragraph
>   (`fe-train-plan-2026-08-30-orders-p6.md:461-464`) is a STALE PREMISE → a truing line, not a new line.
> - **S16 OUTCOME (the owner's on-screen look, ≈00:35 09-04; 裁-155):** (1) Workers & Pages → `clara-web` →
>   Observability/Logs: **Workers Logs OFF** (no `observability` block in `wrangler.jsonc`; not enabled in the
>   dashboard). (2) Logpush: **not found on this account** — no Logpush job and no query-string redaction
>   control exists on this plan (Logpush is an Enterprise feature; the owner could not locate any such
>   section). **Reading:** no query-bearing access log exists for the Worker today, so the `?ct=` value has
>   no ingress log to land in; the burned-link proof cannot be taken because there is no log to read.
>   **Recorded as a DATED EXPLICIT DEFERRAL-BY-ABSENCE, not a tick:** the checklist line
>   (`wave-g-setup-checklist.md:140-145`) is discharged only while Workers Logs stay OFF and no Logpush job
>   exists; **standing rule for the Known-issues row: if Workers Logs are ever enabled on `clara-web`, the
>   invite link's `?ct=` (and the path's `token_hash`) land in invocation logs — re-decide redaction or
>   disable logs first.** The two bearer factors remain in the URL by design (mail client, browser history —
>   outside our logs). Owner = actor; 裁-155 = ruling.
> - **S15 VERDICTS as taken (lead, 00:1x 09-04, on version I `c5b1e051`):** **1 TICK** — the C-5 route
>   exists and is wired: `confirmation-wall.ts:122` `CONFIRM_ENDPOINT_PATH = "/api/auth-wall/confirm"`,
>   `:124` `SERVICE_TOKEN_VAR`, both stubs retired (`:2-11`); the runtime serves it on v71 (503 per request
>   until FS-11 step 12, expected). **2 TICK** — `:23-25`: claim → verifyOtp → settle inside ONE server
>   request; `attempt_id` never crosses the wire; a request carrying `attempt_id`/`attemptId`/`outcome` is
>   REFUSED 400 (`:187-190`); the outcome derives from `verifyOtp`. **3 / 4 / 5 / 7 DEFERRED** to FS-11 steps
>   12 / 11 / 6 / 13 (裁-153) — not ticked. **6** — the two numbers are read back by Management API at the
>   FS-11 walk and accepted as read (裁-169); FS-10 records "pending the walk's read", not ticked. **8** — the
>   Confirm-signup template `{{ .Token }}` by Management API read: OWNER's read with the PAT env-to-env at
>   S22 (script `…/scratchpad/ceremonies/s22-auth-config-read.mjs`), not a screenshot. **9 TICK as the
>   recorded deferral** — `livemode` stored-never-read is Known-issues A-M5 (裁-120), owed before the
>   real-money switch. **10 RECORDED HONESTLY** — no door surfaces an unconsumed payment today (裁-120 A-M4:
>   the audited SQL door only). **11 TICK** — `__Host-clara-auth` LANDED over HTTPS on I (secure, path=/,
>   sameSite=Lax; httpOnly=false by design `cookie-options.ts:26-28`), the owner's
>   authenticated walk `routes-20260903-234237`.
> - **S8 ↔ S9 ORDER, measured from Cloudflare's docs 21:58 (workers/configuration/secrets;
>   versions-and-deployments):** `wrangler secret put` creates a new version AND DEPLOYS it immediately;
>   `wrangler versions secret put` creates a new version WITHOUT deploying. And `clara-web` does not exist
>   until the first upload. So the phase runs **S9a → S8 → S9b**: (S9a) `opennextjs-cloudflare upload --
>   --preview-alias cutover` creates the Worker + version A (no traffic; the alias → A); (S8) the owner
>   runs `/root/fs10/s8-put.sh` in a REAL WSL terminal — six `wrangler versions secret put <NAME>
>   --name clara-web`, values typed hidden, each minting a new version (B…G), none deployed; (S9b) the same
>   upload command again → version H = the same code with the secrets inherited, the alias `cutover` → H.
>   **The positive read at S9b:** wrangler's printed bindings list the six secret NAMES + the three `vars`.
>   H is the version that is walked (S12–S16) and promoted (S18). If `versions secret put` refuses on a
>   never-deployed Worker, the recorded fallback is `wrangler secret put` (deploys the version — no route or
>   custom domain exists yet, so the only exposure is the `workers.dev` host the preview already exposes).
> - **P-2 NOT YET MET at 21:55** — sweep 33757365379: 12 of 13 jobs success, `closed-wave-drills` running
>   since 12:48:48Z (the reference leg takes ≈73 min → ETA ≈ 22:02 MYT); the `ci` meta-gate unreported.

## 1 · PRECONDITIONS — every one a positive read, taken before S1

### 1.1 The tip and the sweep

**P-1 [L] The ceremony runs from merged `main`, never a branch.**
```sh
cd /c/Users/zhant/Desktop/clara-rebuild
git fetch origin && git merge --ff-only origin/main && git log -1 --format='%H %s'
```
→ *Read:* the sha is **`9d5d844e0f471be2c99e093311563a98ee94c8b9`** or newer-and-deliberate. If it is newer,
STOP and re-read P-2: a sweep proves the commit it ran on, not the branch's name.
*Measured 2026-09-03 20:59 MYT:* `origin/main` = `9d5d844e`; the local checkout was at `f58e701e` and needs
the fast-forward above.
- [ ] as run: ______________________

**P-2 [L] The hand sweep on that exact tip is GREEN, 13 of 13, read from the JOB LIST.**
```sh
gh run view 33757365379 --json status,conclusion,headSha
gh run view 33757365379 --json jobs -q '.jobs[]|"\(.conclusion // "RUNNING")\t\(.name)"'
```
→ *Read:* `status=completed`, `conclusion=success`, `headSha=9d5d844e…`, and **thirteen** job rows all
`success`, the `ci` meta-gate included. A PR's colours are not this read (AGENTS.md CI section). A red or
missing leg means the ceremony does not open (`docs/ops/ceremony-practices.md` §1).
> **MEASURED 2026-09-03 21:03 MYT — THE SWEEP WAS STILL RUNNING.** `status=in_progress`, conclusion empty, on
> the right sha. Twelve jobs listed, ten `success` (`lint`, `changes`, four `db-slice-frontiers` legs,
> `db-live-gates`, `build`, `render-drill`, `db-split-partition-total`); **`closed-wave-drills` and `db-estate`
> were still running and the `ci` meta-gate had not reported.** Re-read at **21:08 MYT**: `db-estate` had gone
> `success` (eleven green), **`closed-wave-drills` still running, `ci` still unreported**. 裁-174's
> precondition is therefore **NOT YET SATISFIED at the time of this cut** — re-run the two commands above and
> record the completed 13-of-13 reading here before S1. `closed-wave-drills` is the leg with the estate's
> longest history of late failures, so its verdict is the one to wait for, not to assume.
- [ ] as run: ______________________

**P-3 [L] The remote-walk instrument is present and its route table has been reconciled against the deployed
tree.**
→ *Read:* `…/scratchpad/ceremonies/remote-walk/remote-walk.mjs` exists (measured 2026-09-03 19:45, 95,375
bytes) beside `README.md` and `walk-report.template.md`, and its §8 instruction has been honoured: re-derive
the page population on the deployed commit and reconcile it with the script's table.
*Measured at `9d5d844e`:* `git ls-tree -r --name-only origin/main -- apps/web/app | grep page.tsx` returns
**30** files, of which `app/(e2e)/money-input-harness/page.tsx` is the build-time-inert `notFound()` stub ⇒
**29 production pages**, matching the table's 29/30. `route.ts` returns **7** Route Handlers.
- [ ] as run: ______________________

**P-4 [L] The instrument has been smoke-run once, read-only, against the CURRENT Pages origin** (裁-174's own
precondition — a positive control that the reader reads).
```sh
cd "…/scratchpad/ceremonies/remote-walk"
ORIGIN=https://app.clarabook.com node remote-walk.mjs --mode routes
```
→ *Read:* the run completes and writes `runs/routes-<stamp>/ledger.json` + `walk-log.md`. Against the OLD
dashboard most Clara landmarks will FAIL — **that is the expected reading and it is the control**: it proves
the script takes real reads rather than passing vacuously. Record the exit code and the counts.
**Operational law from the instrument's own README §3:** do not pipe its output to `head` or `grep` — an
early-closing pipe kills the run mid-walk and the reports are never written.
- [ ] as run: ______________________

### 1.2 The tree facts (re-measure; never cite `PROGRESS.md`)

**P-5 [L] FS-4 is closed on this tree.**
```sh
gh pr view 517 --json state,mergedAt,mergeCommit
git merge-base --is-ancestor aa789d65 origin/main && echo ANCESTOR
git ls-tree -r --name-only origin/main -- packages/db/migrations | tail -1
```
→ *Read:* `MERGED`, merge commit `aa789d65`, an ancestor of the tip; the migration ceiling is
`0164_checkout_gate_c6_web_reads.sql`.
- [ ] as run: ______________________

**P-6 [L] The chat/SSE proxy repoint (裁-151) is on the tree. MEASURED TRUE at `9d5d844e`.**
```sh
git grep -n "api/runtime/chat" origin/main -- apps/web/lib/clara/api.ts
git grep -n "api/runtime/tasks" origin/main -- apps/web/lib/clara/stream.ts
```
→ *Read, measured:* `lib/clara/api.ts` calls `/api/runtime/chat/sessions` (`:164`, `:176`, `:186`),
`/api/runtime/chat/sessions/<id>/messages` (`:196`) and `/api/runtime/chat/<id>/turns` (`:220`);
`lib/clara/stream.ts:278` fetches `/api/runtime/tasks/<id>/stream`. `NEXT_PUBLIC_CLARA_RUNTIME_URL` survives
only in comments and in `api.test.ts`'s pins — it is not read for a base URL anywhere.
- [x] measured 2026-09-03 21:0x MYT by this cut. Re-confirm at the tip if the tip moved: ______________

**P-7 [L] The Worker's configuration has a repo home (裁-151 / OD-2 rode #539). MEASURED at `9d5d844e`.**
→ *Read, measured:* `apps/web/wrangler.jsonc` names the Worker **`clara-web`** and declares a `vars` block of
**three** names — `CLARA_RUNTIME_URL` = `https://clara-runtime.fly.dev`, `CLARA_PUBLIC_ORIGINS` =
`https://app.clarabook.com` (NARROW, from the first upload), `CLARA_TRUSTED_CLIENT_IP_HEADER` =
`CF-Connecting-IP`. Its own comment states the law: **one name, one home** — a `vars` name is never also a
`wrangler secret put`, and **this block REPLACES the Worker's plain-text variables on every upload**, so the
Cloudflare dashboard is not a second home for these three. `apps/web/.env.example` names twelve variables and
now carries all four FS-4 C-6 names.
- [x] measured by this cut. Re-confirm if the tip moved: ______________

**P-8 [O/L] 裁-147 — no unhandled Stripe problem events.**
Run as the operator through the CA-pinned DSN bridge (`docs/ops/dsn-bridge.md`), never `sslmode=no-verify`:
```sql
select * from clara.list_stripe_event_problems(false);
```
→ *Read:* **empty of unhandled rows.** Any row is resolved through
`clara.resolve_stripe_event_problem(uuid, text, text)` with its reason **before** the domain moves. There is
no operator screen for this by ruling (裁-147 point 1) — it is a manual line by design.
- [ ] as run: ______________________

### 1.3 The tools that must be in hand before 21:45

**P-9 [O] Cloudflare dashboard access for the account that owns BOTH `clara` (Pages) and `clara-web`
(Workers).** The repo names the account only as **`ac42cba1…`**, Pages project **`clara`**
(`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:52` — *"read it, do not derive it"*).
→ *Read:* both projects visible under one account in Workers & Pages.
- [ ] as run: ______________________

**P-10 [O/L] `wrangler` authenticated on the machine that builds and uploads.**
```sh
pnpm --filter @clara/web exec wrangler whoami
```
→ *Read:* the account id matches P-9. Either the owner drives, or a scoped `CLOUDFLARE_API_TOKEN` reaches the
lead **environment to environment, never printed**.
- [ ] as run: ______________________

**P-11 [L] The build machine is LINUX/WSL with Node ≥ 22, and the shell is held open.**
The repo is explicit (`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:417-419`;
`apps/web/README.md` §Cloudflare): build on WSL/Linux with **Node ≥ 22** — `wrangler@4.126.0` and its
transitive deps require it, while the monorepo root pins `>=20.19 <21`. `cf:build` **fails reproducibly on
Windows/Node 20.19.5** inside `buildExternalNodeMiddleware` → `copyTracedFiles` with
`ENOENT … middleware.js.nft.json`. That is an environment mismatch, **not** a regression, and it is not a CI
gate — so tonight's build is the first genuinely successful `cf:build` on this estate unless it was rehearsed.
**WSL idle-terminates without a Windows-side holder** (session lesson): every long rig dies at the same
elapsed point with `exit=255`. Keep a Windows-side process holding the distribution open for the whole
ceremony, or the build dies mid-flight and reads as a build failure.
→ *Read:* `node -v` ≥ v22 inside the build shell, and the keeper running.
- [ ] as run: ______________________

**P-12 [O] Supabase dashboard access** for the project's Authentication → URL Configuration and Email
Templates, plus the Management API token for the read-backs (`GET /v1/projects/{ref}/config/auth`).
→ *Read:* one Management API read returns 200.
- [ ] as run: ______________________

**P-13 [O] A NON-TEAM mailbox** for S21's signup-confirm arm — an address on neither `belcort.com` nor
`clarabook.com` (the walk instrument refuses an operator-domain address and exits 2). Under 裁-146 the
custom SMTP is Resend; the confirmation arm must carry a six-digit CODE, not a link.
- [ ] as run: ______________________

**P-14 [L] The runtime is up and serving the expected version** — read from `fly`, never from a document.
```sh
fly status -a clara-runtime
```
→ *Read:* the machine id, VERSION, and 2/2 checks; `GET /health` 200 and `GET /ready` true. The C-5 auth-wall
routes answering **503 per request** is EXPECTED here — their secrets ride FS-11 step 12 (裁-152).
- [ ] as run: ______________________

**P-15 [L] The source-delete PR is open with its DO-NOT-MERGE banner** (裁-158). Branch
`web/p6-x-source-delete`, opened by the `delete-dashboard` lane. **PR # ____________** *(measured 2026-09-03
21:00 MYT: no PRs open and the branch is not yet on `origin` — fill the number when it appears; it is not a
precondition for S1, only for S24).*
- [ ] as run: ______________________

---

## 2 · THE STEP LIST

**Run order under the rulings.** Phase A (S1–S5) → Phase B (S6) → Phase C (S7, S8, S8a, S8b) → Phase D
(S9–S16) → Phase E (S17–S21) → Phase F, **in this order: S22 → S25 → S24 → S26 → S27**. `S23` is **VACATED**
by 裁-156 and its number is retired rather than reused, so every prior citation of S24 and S25 still resolves.

### Phase A — settle the ground (no mutation)

**S1 [L] Pin the tip and open this as-run.**
```sh
git log -1 --format='%H %s' && date && date -u
```
→ *Read:* the sha written into the closing block as the ceremony's base, with both clocks. **Stamp every
timestamp in this file from `date`, never from the lead's own sense of the hour** (session lesson: the lead's
clock drifts).
- [ ] as run: ______________________

**S2 [L] Read the sweep to completion.** P-2's commands, re-run. 13 of 13 `success` or the ceremony does not
open.
- [ ] as run: ______________________

**S3 [L] Re-measure the tree facts.** P-5, P-6, P-7 at the tip, written verbatim into the closing block.
**No claim in this ceremony is taken from `PROGRESS.md`.**
- [ ] as run: ______________________

**S4 [O/L] The deploy-record check — the cutover's declared first act.**
`fe-train-plan-2026-08-30-orders-p6.md:456-459`: *"settle what `app.clarabook.com` actually serves today…
Check the deploy record, do not derive it."* Every repo claim that Pages serves the old dashboard is the claim
being **verified**, not the evidence.
```sh
pnpm --filter @clara/web exec wrangler pages project list
pnpm --filter @clara/web exec wrangler pages deployment list --project-name clara
dig app.clarabook.com
```
Plus, on screen: Cloudflare → Workers & Pages → `clara` → **Deployments** (newest deployment id, commit,
branch, timestamp) and the DNS record for `app.clarabook.com`.
*(**NOT IN REPO — read on screen.** No Cloudflare Pages/Workers/DNS runbook exists anywhere under
`docs/ops/`; the dashboard locations here are the product's standard ones and must be confirmed on screen.
Cloudflare's own doc pages to have open: **"Workers & Pages"**, **"Pages · Custom domains"**, **"Pages ·
Manage a project"**.)*
→ *Read:* the newest Pages deployment's four fields and the hostname's current target, verbatim.
- [ ] as run: ______________________

**S5 [L] The four exit gates and OPS.x.**
- **Gate 1 — the verb-coverage census re-run against a LIVE CATALOG on a throwaway rig.** The standing census
  is pinned to `0138`; the ceiling is now `0164`. Migration-text greps do not substitute — revokes make them
  unreliable. Rig per `packages/db/README.md` (`pnpm db:migrate`, `pnpm db:seed`), then a live `pg_proc`/grant
  read for the denominator. Pass = zero cutover-owed and zero un-dispositioned orphan in direction 1;
  direction 2 still 100%. Heed `docs/plan/active/verb-coverage-census-2026-08-31.md:41-48`'s two direction-2
  traps.
- **Gate 2 — the NotBuiltNote sweep DERIVED FROM THE LIVE TREE**, on the `apps/web/lib/command/routes.test.ts`
  pattern (it reads the tree and carries a vacuity control). Enumerate the notes on disk, resolve each against
  the lane it names, fail on any whose lane merged. A hand-kept list is the stale-not-built class arriving
  through the back door.
- **Gate 3 — a11y at four gates:** `pnpm --filter @clara/web lint` (contrast + test-manifest) and
  `pnpm --filter @clara/web test`.
- **Gate 4 — the 61-suite classification table** for `apps/dashboard`'s tests. **Under 裁-158 this belongs to
  the source-delete PR's body, not to this ceremony's floor** — confirm it is IN that PR (P-15) rather than
  producing it here. A "superseded" that names no equivalent is not evidence.
- **OPS.x (裁-121②):** `node packages/runtime/scripts/check-parts-parity.mjs` exit 0 with its census printed.
  Re-read whether a `chatTurn.v17.parts.ts` exists rather than inferring it —
  `ls packages/runtime/workflows/chatTurn.v1*.parts.ts`.
- [ ] as run: ______________________

### Phase B — stop the old app rebuilding (the first mutating act, and it is reversible)

**S6 [O] Disconnect the Pages project `clara`'s Git integration — BEFORE the Workers deploy and BEFORE the DNS
change.**
Cloudflare → Workers & Pages → `clara` → **Settings → Builds & deployments → Git integration → Disconnect**.
*(**NOT IN REPO — confirm on screen.** Cloudflare doc page to look for: **"Pages · Git integration"**.)*
*Why first:* the project builds on every PR and every push to `main`, so until it is disconnected **every docs
merge re-deploys the OLD dashboard** (`frontend-sprint-handoff-2026-08-31-orders.md:419-421`;
`docs/ops/wave-g-setup-checklist.md:293-296`).
→ *Read:* the Settings page shows **no connected repository**, and a subsequent push to `main` produces **no
new deployment** in the deployments list. A disconnect does not unpublish — the last successful build keeps
serving, which is what keeps the rollback in §3 alive until S25.
- [ ] as run: ______________________

### Phase C — build the artifact (on Linux) and put the environment on the Worker

**S7 [L] Build on WSL/Linux, Node ≥ 22.**
```sh
pnpm install --frozen-lockfile
# build-time environment, exported into THIS shell, never committed:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY      (the publishable/anon key — the gate below enforces its CLASS)
# MUST BE UNSET, both of them:
#   CLARA_E2E_MONEY_INPUT_HARNESS
#   CLARA_E2E_ROUTE_ERROR_PROBE
pnpm --filter @clara/web cf:build
```
`cf:build` = `node scripts/check-public-key.mjs && opennextjs-cloudflare build`
(`apps/web/package.json:16`, re-read at `9d5d844e`). The key gate **refuses to bundle** unless the anon slot
holds a publishable key or a legacy JWT whose decoded role is positively `anon` — the variable's NAME proves
nothing about its value.
**`NEXT_PUBLIC_*` values are frozen into the browser bundle here.** Changing one later needs a rebuild and a
new upload; changing the Worker's environment does nothing for them
(`docs/ops/incident-2026-07-26-intake-storage.md:55-58` — the incident whose root cause was exactly this).
→ *Read, all five:*
1. exit 0 and `.open-next/worker.js` present;
2. the two e2e opt-ins compiled to their inert stubs — the money-input route resolves to the 404 stub
   (`apps/web/next.config.ts:26-45`), so `/money-input-harness` must NOT be reachable on the deployment;
3. a leak-discipline grep of `.open-next/assets/` for `service_role` / `sb_secret` → **zero**;
4. the compressed size read from wrangler's own upload output at S9 (**≤ 10 MiB or STOP**);
5. `node -v` recorded, so the artifact's provenance is on the record.
- [ ] as run: ______________________

**S8 [O] Mint the two shared secrets and put the FIVE credential-bearing names on `clara-web`, env-to-env
(裁-152).**

**The three `vars` names are NOT secrets.** `CLARA_RUNTIME_URL`, `CLARA_PUBLIC_ORIGINS` and
`CLARA_TRUSTED_CLIENT_IP_HEADER` live in `apps/web/wrangler.jsonc` and ship with the upload. Never
`wrangler secret put` them: one name, one home, and the `vars` block overwrites the Worker's plain-text
variables on every upload anyway.

**Mint first, locally, on the owner's own machine.** Two independent random values, ≥ 32 bytes each:
```sh
openssl rand -base64 32     # → CLARA_RATE_WALL_PEPPER
openssl rand -base64 32     # → CLARA_AUTH_WALL_SERVICE_TOKEN
```
Keep both in the owner's password manager. They are **never pasted into chat, a log or a PR, and the lead
never sees them.**

Then, one name at a time, the value typed or piped and never echoed:
```sh
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   --name clara-web
wrangler secret put RESEND_API_KEY              --name clara-web
wrangler secret put CLARA_RATE_WALL_PEPPER      --name clara-web
wrangler secret put CLARA_AUTH_WALL_SERVICE_TOKEN --name clara-web
wrangler secret put STRIPE_SECRET_KEY           --name clara-web
wrangler secret list --name clara-web
