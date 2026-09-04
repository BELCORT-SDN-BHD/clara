*Part 3 of 3 of the FS-10 P6-X cutover as-run (2026-09-03 → 09-04). **Parts 1 and 2 are the ceremony's step TEMPLATE (S1…S27, 49 boxes), written before it opened; this part is the CUTOVER AS IT HAPPENED** and governs on any divergence. Previous: `fs10-cutover-asrun-2026-09-03-part2.md` · Next: none (this is the last part).*
*Written at the final clock-out truing from the lead's own as-run notes. Every id, sha, stamp and reading is transcribed; where the notes are silent the line says "not recorded". No secret, DSN or token value appears anywhere.*

# FS-10 · the P6-X cutover — AS RUN

**Opened** 22:10:21 MYT 2026-09-03 (S1), **the domain moved** ≈00:31 MYT 2026-09-04 (S19), **closed**
≈02:39 MYT with the Pages project's deletion read back as absent. Ruled open the same night by
**裁-174** (owner, against the lead's "tomorrow morning" recommendation; the dissent is filed on that
ruling), with three measured preconditions: the hand sweep **33757365379** on `9d5d844e` SUCCESS
13/13 (read from `gh run view --json jobs`, concluded 22:02:49 MYT), the remote-walk instrument in
place and smoke-run, and the as-run template written.

---

## The instrument (built for this ceremony, 21:0x)

`remote-walk.mjs` — 1,970 lines, with a README, a report template and two recorded runs. Modes
`routes | signup | product | operator | all`; 30 `page.tsx` (29 production plus the inert e2e stub
read as a 404); landmarks are each page's own `h1` from `messages/en.json`; **the anonymous arm flags
a 200 on a protected page as a SECURITY finding**; chat/SSE are classified (proxy PASS · `/api/chat`
FAIL-a · cross-origin FAIL-b); it refuses non-HTTPS without `--allow-http`, refuses a belcort or
clarabook signup address, and requires the team-roster affirmation. **Discrimination control PROVEN:**
`--mode routes` against `example.com` returned 36 rows with 30 correct FAILs, exit 1; a signup run
with `tao@belcort.com` refused with exit 2. Two facts learned building it: load `@playwright/test`
through `createRequire` (the ESM namespace carries only `default`), and **never pipe the script to
`head`/`grep`** — a closing pipe kills the run before the reports are written.

## Phase A–C · build, upload, secrets

- **S7 the Workers build — 21:34 MYT (13:34:14Z), in a WSL clone at `9d5d844e`, node v22.23.2.**
  `cf:build` exit 0; `.open-next/worker.js` **2,278 B** (the thin entry), `.open-next` 46 M
  uncompressed; sha256 of `worker.js`
  `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`. Censuses: `clara-runtime.fly.dev`
  in assets **0** · `money-input-harness` refs in `worker.js` **0** · the two e2e env names **0**.
  **One asset matched the leak grep and was RESOLVED by reading its context:**
  `assets/_next/static/chunks/0o0odk6y737zu.js` carries supabase-js's own key-class check
  `e.startsWith("sb_publishable_")||e.startsWith("sb_secret_")` — **a prefix LITERAL, not a value.**
  *(The build had to run on Linux: `cf:build` fails reproducibly on this Windows/Node-20 host inside
  `copyTracedFiles`. Windows `wrangler --version` also fails, so S7 and S9 both ran from WSL.)*
- **S4's read-only half, 21:36 and 21:55.** `nslookup app.clarabook.com` → 104.21.20.206 /
  172.67.194.103 (+ two AAAA), Cloudflare-proxied. **The deploy record, read not derived:**
  `wrangler pages project list` → project `clara`, domains `clara-e3o.pages.dev` +
  `app.clarabook.com`, Git provider **YES**, created 2026-07-21; `pages deployment list` → Production
  **`0b557abd-e4d0-4d22-9ff2-ae821f5eead8`**, branch `main`, commit `9d5d844`, ~1 h old (Pages had
  rebuilt the OLD dashboard on #539's merge, exactly as the checklist says it does); the newest entry
  a FAILED Preview build of `web/p6-x-source-delete` @ `b98197d` — the deleted app cannot build, which
  is #540's own commit body. `wrangler versions list --name clara-web` → **"This Worker does not exist
  on your account" [10007]** — `clara-web` had never been uploaded.
- **P-9/P-10 MET 21:54.** The owner ran `wrangler login` in WSL (browser OAuth). Account
  "Tools@belcort.com's Account", id **`ac42cba1bda978bd00f6c45d0e25dc24`** = the repo's truncated
  `ac42cba1…`. Two other Pages projects on the account (`luxe-wealth-consultancy`,
  `belcort-namecard`) — untouched.
- **S6 DONE by the owner ≈22:2x**, read back 22:25: `wrangler pages project list` → `clara` Git
  Provider **No** (it had been Yes at 21:55).
- **S9a REFUSED 22:25:51Z:** *"You cannot upload a new version of a Worker that does not yet exist."*
  → **S9a′ = `opennextjs-cloudflare deploy`**, which creates the Worker and deploys version A with no
  route and no custom domain attached, so the only host it can serve is the `workers.dev` one — the
  same exposure class as a preview alias.
- **S9a′ DONE 14:27:01Z (22:27 MYT):** Worker **`clara-web`** created, version **A =
  `de3e4530-0e33-44ba-a552-a7f4cb55b3d1`**, host `https://clara-web.tools-ac4.workers.dev`, 75 assets;
  bindings printed: `ASSETS` + `CLARA_RUNTIME_URL` + `CLARA_PUBLIC_ORIGINS` (app.clarabook.com only) +
  `CLARA_TRUSTED_CLIENT_IP_HEADER`. **S10 READ: Total Upload 15,164.37 KiB / gzip 3,355.72 KiB — under
  the 10 MiB compressed ceiling.** Worker startup 42 ms. First reads: `/` → 307 `/login?next=%2F`;
  `/login` → 200 text/html; `Cache-Control: private, no-store`.
- **S8 the six secrets — the OWNER, 14:36–14:40Z.** Order settled from Cloudflare's own docs
  (context7, 21:58): `secret put` makes a new version AND deploys, `versions secret put` makes a
  version without deploying — so the phase order is **S9a upload → six `versions secret put` → S9b
  upload again**. `wrangler versions list` afterwards showed one `create_version_api` version per
  secret; `wrangler secret list --name clara-web` at 22:44 read **all six names**. **裁-152's minting
  sentence: the pepper and the auth-wall service token were minted by the owner here, ≈22:38 MYT
  2026-09-03; FS-11 step 12 reuses those bytes verbatim.**
- **S9b DONE 14:45:11Z: version H = `d59dabad-d667-407a-a655-27588ef96c58`**, preview alias
  `https://cutover-clara-web.tools-ac4.workers.dev`, no new assets, same upload size, startup 35 ms.
- **THE H DEFECT, caught by reading rather than assuming — 22:49.** `wrangler versions view d59dabad…`
  read **FIVE secrets, not six** (`CLARA_AUTH_WALL_SERVICE_TOKEN` ABSENT), while the newest
  secret-version `7f3705e8` carried all six. The eight versions in order: A `de3e4530` 14:26:52 ·
  `09c98965` 14:36:29 · `ba1947fd` 14:36:53 · `3bb2724a` 14:38:14 · `20dce387` 14:38:57 · `5036056e`
  14:39:56 · `7f3705e8` 14:40:16 · H `d59dabad` 14:45:06. **Cause unproven** (a lagging read at upload
  time is the likeliest); **the FACT is that H ≠ six, so H is NOT the version to promote.** Fixed by
  the owner re-putting the token → **version I = `c5b1e051-6c68-4f56-8ba2-28b3265979e1`** (15:32:06Z),
  whose `versions view` reads **SIX** secret names plus the three vars. **I is the version walked and
  promoted; H and the `cutover` alias are retired from the ceremony.**

## Phase D · the preview walks

- **S12 anonymous on H (run `routes-20260903-224817`): 36 rows, 34 substantive PASS, 2
  instrument-expectation mismatches, 2 NOT-WALKED, exit 1.** Every protected page → `/login?next=…`
  (×29). Route Handlers fail closed anonymously: `/api/runtime/*` 307, `/api/invite` 307 both arms,
  `POST /checkout` 307. **Both "FAIL"s were resolved by CODE READS, not waved through:**
  `/auth/recover/password` anonymous renders the recovery-REQUEST form by design
  (`components/entry/password-reset-route.tsx:16` — `if (session === null) return
  <PasswordRecoveryForm invalidLink />`), so the instrument's landmark expectation was wrong;
  `/money-input-harness` returns 307 to `/login` because the auth gate precedes the stub's 404.
- **S12 anonymous on I (`routes-20260903-233338`): 36 rows — 32 PASS, the same 2 mismatches, 2
  NOT-WALKED.** Identical to H.
- **S12 AUTHENTICATED on I (the owner's run `routes-20260903-234237`, ≈23:42–23:46): 65 rows, 3
  "FAIL", 13 NOT-WALKED.** Sign-in PASS; **`__Host-clara-auth` LANDED over HTTPS** — secure, path=/,
  sameSite=Lax, httpOnly=**false** (DELIBERATE, `cookie-options.ts:26-28`: the browser client reads
  `document.cookie`) → security line 11 READ. **All 11 firm landmarks PASS.** The 9 client routes and
  the two Clara threads were NOT-WALKED because BELCORT on the pre-reset database had no client link.
  **`POST /api/invite` same-origin returned 200 `ok:true`** where the instrument expected a refusal —
  **and the refusal expectation was the LEAD's, DERIVED and never measured**:
  `apps/web/lib/same-origin.ts:179-181` accepts an Origin that is allowlisted **OR whose host is the
  request's own host**, so a preview's own origin is same-origin by the wall's own law. The
  cross-origin arm returned **403 `cross_origin`** — the wall IS consulted. *(Truing T-K: the
  `wrangler.jsonc` comment and rider R3 claiming "every walled POST refuses on a workers.dev preview"
  are FALSE and are re-cut in the next `apps/web` PR.)* **The walk MUTATED one row**: a real invite was
  created on the live database by the probe (a dummy address); test data, wiped by FS-11's reset, and
  recorded rather than hidden.
- **S13/S14 manual on I, ≈23:50 → 00:20.** **S13 PASS** — ⌘K "Do" → client onboarding started; the
  interview runner rides the proxy (`/api/runtime/interview/state` polled ≈1/s, 109 requests; `answer`
  15.01 s; "Commit onboarding" rendered). **One console 404** on an interview `state` poll for a run
  id the runtime did not find — timing unknown, recorded as observed once.
  **S14 PASSES on the decisive read:** the owner's Timing panel on a second chat turn's `stream` row —
  **TTFB 1.83 s · Content Download 4.22 s · total 6.05 s · `Content-Type: text/event-stream;
  charset=utf-8`.** Headers arrived at ~1.8 s and the body downloaded over 4.2 s ⇒ **the SSE body
  STREAMS through OpenNext-on-Workers**; a buffered body would have shown TTFB ≈ the whole duration.
  The earlier "整段跳出來" (the whole reply appearing at once) is the PRODUCT's one-part text shape —
  `packages/runtime/src/streamRoute.ts:54-56` flushes headers at open and emits one SSE event per
  workflow event, and the reply text is a single `freeform_result` part. **裁-151's fallback (a
  runtime CORS PR) is NOT needed; no STOP before DNS.**
- **S16 the `?ct=` look — DONE ≈00:35 (裁-155).** `apps/web/wrangler.jsonc` has no `observability`
  block, no `logpush`, no `tail_consumers`; on screen: **Workers Logs OFF, no Logpush job, no
  query-string redaction control on this plan.** So the exposure has **no log to land in today** —
  recorded as a deferral-by-absence with a standing rule: *if Workers Logs are ever enabled, `?ct=`
  lands in invocation logs and the decision is re-taken.* A Known-issues row carries it.

## Phase E · the switch

- **S18 promote — 16:23:58Z = 00:24 MYT 09-04**, run BEFORE S17 (the order swap is the lead's:
  promoting a version moves no traffic while no custom domain is attached, and it shortens the
  S17→S19 no-target window to two dashboard clicks). `wrangler versions deploy c5b1e051…@100% --yes`
  → *"Deployed clara-web version c5b1e051-… at 100% (1.87 sec)"*; no non-versioned settings to sync.
- **S17 (remove the custom domain from Pages) DONE by the owner; the MINUTE was not given.** Recorded
  as **BOUNDED BY READS: after 00:24:40 and before 00:31:18.**
- **S19 attach + read — 00:31:18–00:31:41 MYT 2026-09-04.** `clara-web → Domains` lists
  `app.clarabook.com` · Production · zone clarabook.com. `curl -sI https://app.clarabook.com/` → **307
  `/login?next=%2F`, `Cache-Control: private, no-store`, `Server: cloudflare`**, CF-RAYs …-SIN /
  …-HKG / …-NRT across three attempts; `/login` → **200**. That is the WORKER's response, not the
  Pages dashboard's. **THE CUTOVER HAPPENED AT ≈00:31 MYT 2026-09-04.**

## Phase F · the real-origin re-walk (S21) — the gate 裁-156 put on everything after it

- **Anonymous (`routes-20260904-003213`, 00:32–00:33): 36 rows — 32 PASS, the same 2 known
  instrument-expectation mismatches, 2 NOT-WALKED** — identical to the preview reads on I.
- **Chat ✓ (≈00:40):** on `app.clarabook.com` the requests are
  `app.clarabook.com/api/runtime/chat/sessions/…`, `/api/runtime/tasks/…/stream` (4.27 s),
  `/api/runtime/chat/…/turns` (202); the reply rendered. S14's four reads hold on the real origin.
- **The signup arm, three attempts, and the two defects only a real walk could find.** Attempt 1 (same
  browser, signed in) skipped to the firm step and "Register my firm" was **REFUSED `CLR09 · actor
  already belongs to a firm`** — the DB's wall refusing a second firm, a good negative read, but the
  Mail arm was not exercised. Attempt 2 (incognito, a private Gmail): **the six-digit code ARRIVED** —
  and the page rendered was the "exists-unconfirmed" variant **with NO link to `/auth/confirm`**
  (`signup-account-form.tsx` links only `/login` at `:265`/`:325`), so the owner could not find where
  to type it. **UX DEFECT → Known issue.** Attempt 3, at `/auth/confirm` directly (≈00:55): **the
  mail's code had EIGHT digits and the form takes six.** *"gmail 給我 8 個 digits, 我只能打 6 個."*
  **A Supabase project setting nobody had read: `mailer_otp_length` = 8 (default 6, range 6–10) —
  against the app's six-digit form (裁-92).** The owner set it to 6 in the dashboard and re-requested
  the code.
- **S21 PASSES ≈01:05.** With the length fixed, the confirm page accepted six digits and answered
  **"Confirmation isn't available yet — we couldn't check your code just now, so we haven't counted
  this as an attempt. Your code is still good"** — the wall's honest `unavailable`, exactly as
  expected while C-5's runtime half was unset until FS-11 step 12. The **password-recovery arm walked
  END TO END on the real origin** (「和你說的一模一樣」): the LINK mail → `/auth/recover` spent the code
  → a new password set → signed in. **Observation 3: Worker Errors = 0** in Cloudflare Metrics over
  the walk window. *(The authenticated ROUTE walk on the real origin was ABBREVIATED — login, firm
  home and a chat turn — and is stated as such; the full 11-landmark authenticated walk was taken on
  the SAME version I on its preview host.)*
- **S22 (00:5x–01:18, owner + lead).** Both `workers.dev` URLs turned OFF; read back 01:16:
  `clara-web.tools-ac4.workers.dev/login` → **404**, the preview host `c5b1e051-clara-web…/login` →
  **404**, `app.clarabook.com/login` → **200**. The Supabase auth config read through the Management
  API at 17:14:57Z found **`uri_allow_list` = FOUR entries** where the ruled shape is exactly two —
  **wider than ruled, no wildcard** — and the owner narrowed it to the two at ≈01:18. The same read
  gave `disable_signup: false`, `mailer_otp_length: 6` (fixed), `mailer_otp_exp: 3600`,
  **`rate_limit_email_sent: 100`/hour (裁-169's number 2, written down for the first time)**, SMTP
  `smtp.resend.com` / user `resend` / sender `no-reply@mail.clarabook.com`, the confirmation template
  carrying `{{ .Token }}` and no link (security line 8 ticked by API read), and the recovery template
  carrying a LINK.
- **S24 (#540's merge) ≈01:00** — read CLEAN with every check SUCCESS including `ci` at `ae0cc114`;
  merged as **`ba8e7d35`**; the hand sweep **33781966143** dispatched on it came back **SUCCESS,
  13/13**, ≈02:14 MYT.
- **S25 (delete the Pages project) — BLOCKED in the dashboard** (*"Your project has too many
  deployments to be deleted"*) and completed through the Pages API from WSL across five script runs:
  **1,039 + 739 + 300 deployments deleted**, the active production deployment `0b557abd` refusing
  `8000034` until the project itself went, then `attempt 1 -> ok`. **Read back 02:39: `wrangler pages
  project list` shows only `luxe-wealth-consultancy` and `belcort-namecard` — `clara` is ABSENT — and
  `https://clara-e3o.pages.dev/` no longer resolves (curl exit 6).** *(One self-inflicted lesson: the
  lead piped a mutating script's output to `head`, which cut it mid-round — the instrument's own law,
  broken by its author.)*

---

## What FS-10 left behind

**Owed truing lines carried into the handover:** T-K (the false "every walled POST refuses on a
preview" claim in `wrangler.jsonc`'s comment and rider R3) · the `INVITE_MAIL_FROM` move from a
secret into `vars` at the next `apps/web` PR touching `wrangler.jsonc` · the remote-walk README's
two instrument-expectation rows (`/auth/recover/password`'s anonymous landmark and
`/money-input-harness` behind the auth gate) · the instrument's `routes` mode must not POST a real
invite · the checklist's literal UNSET probe at `:95-99`, discharged by substitution here.

**Standing facts worth keeping:** the Worker's own version history is the only rollback surface now
(裁-156 removed the Pages fallback deliberately, and the owner's ground is on that ruling); the
served version is **I = `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**; `CLARA_PUBLIC_ORIGINS` is narrow
(`app.clarabook.com` only) and a `vars` block REPLACES dashboard-set plain-text vars on every deploy.

---

*Written at the final clock-out truing, 2026-09-04. No secret, token or DSN value appears in this
record; the account id and the version ids are public identifiers.*
