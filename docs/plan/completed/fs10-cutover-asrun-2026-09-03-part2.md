*Part 2 of 3 of the FS-10 P6-X cutover as-run (2026-09-03 → 09-04) — filed VERBATIM at the final clock-out truing. **Parts 1 and 2 are the ceremony's step TEMPLATE (S1…S27, 49 boxes), written before it opened; part 3 is the cutover AS IT HAPPENED and governs on any divergence.** Previous: `fs10-cutover-asrun-2026-09-03-part1.md` · Next: `fs10-cutover-asrun-2026-09-03-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

```
**`STRIPE_SECRET_KEY` is the TEST/sandbox key for the whole beta** (裁-126 / 裁-148). There is no live key at
this ceremony and none at the launch sitting; the live switch is its own later ceremony.

→ *Read:* `wrangler secret list --name clara-web` (names only, values redacted) showing all five, and
**write this sentence into the closing block, dated:**

> *"`CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN` were minted here at FS-10 S8 on
> 2026-09-03 at ____ MYT. **These are the minting values FS-11 step 12 must reuse verbatim** on
> `clara-runtime`; the hash-equality proof runs THERE, where the comparison first has two operands."*

**Do not run the hash comparison here.** The runtime holds neither value until FS-11 step 12, so a comparison
now would compare a hash against nothing and read as a pass — the false-measurement class.
- [ ] as run: ______________________

**S8a [O] `INVITE_MAIL_FROM` — set as a secret, and here is why, because it is not credential-bearing.**
```sh
wrangler secret put INVITE_MAIL_FROM --name clara-web
```
`wrangler.jsonc`'s own comment says it is *"deliberately ABSENT"* from `vars` — not a secret, but a deployment
fact (the verified Resend sending address) the repo does not state, and inventing one in a committed file
would be worse than leaving it to the ceremony. That leaves exactly one mechanism: a dashboard plain-text
variable would be **erased by the `vars` block at the next upload**, silently and with no diff to read, so
`wrangler secret put` is the only home that survives. The courier is fail-closed on all three of
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and this — with any one unset `/api/invite` answers 503
`mail_not_configured` and creates nothing.
→ *Read:* six names now in `wrangler secret list --name clara-web`.
- [ ] as run: ______________________

**S8b [O/L] The two names that must stay ABSENT on the Worker.**
- `CLARA_ALLOW_INSECURE_LOOPBACK` — absent. Set to `1` it would let plain-HTTP loopback origins through the
  same-origin wall (`apps/web/lib/same-origin.ts:89-93`), which is how an invite could be mailed with both
  bearer factors pointing at whatever is listening on the recipient's machine.
- `NEXT_PUBLIC_CLARA_RUNTIME_URL` — gone from the codebase by 裁-151 and it must not come back, at build time
  or on the Worker.
→ *Read:* neither name appears in `wrangler secret list --name clara-web`, and neither is in the deployed
`vars` (S9's upload output prints the bindings).
- [ ] as run: ______________________

### Phase D — the preview, BEFORE any DNS change

**S9 [L] Upload a version without routing production traffic.**
```sh
pnpm --filter @clara/web exec opennextjs-cloudflare upload -- --preview-alias cutover
```
Verified in the installed adapter at `apps/web/node_modules/@opennextjs/cloudflare/dist/cli/commands/upload.js`
— it shells to `wrangler versions upload` and passes `wranglerArgs` straight through, so `--preview-alias`
reaches wrangler. `--preview-alias` needs wrangler ≥ 4.21.0; the repo pins **4.126.0**
(`apps/web/package.json:49`). **A version upload routes no traffic** — that is the "repoint first, prove,
delete second" shape one step earlier. There is no `cf:upload` script; the `exec` form needs no repo change.
→ *Read:* the printed **version id** and the **preview URL**, both written into the closing block; the printed
bindings showing the three `vars` names with `CLARA_PUBLIC_ORIGINS` = `https://app.clarabook.com`;
`curl -sI https://<preview-host>` → 200.
- [ ] as run: ______________________

**S10 [L] Record the artifact size.**
→ *Read:* wrangler's own total/compressed size line — **≤ 10 MiB compressed, or STOP**
(`frontend-sprint-handoff-2026-08-31-orders.md:419`). Nothing in the repo records what this artifact actually
measures, because `cf:build` has never succeeded on this estate: this is the first measurement.
- [ ] as run: ______________________

**S11 [O/L] The origin wall — RE-CUT by 裁-154 and the #539 posture: this is a READ, not a write.**

The prep's three-armed shape (unset → widen → prove) is superseded. `CLARA_PUBLIC_ORIGINS` ships **NARROW**
from the first upload and **is never widened for a preview** — widening the allowlist to make a preview
convenient is how the wall stops being a wall, and the widened value is the one that would then ride to
production in a committed file. Three reads instead:

1. **The served value.** From S9's upload output (and the Worker's bindings on screen): `CLARA_PUBLIC_ORIGINS`
   = `https://app.clarabook.com` only.
2. **The preview refusal — the wall's positive proof.** On the `workers.dev` preview host, every
   same-origin-walled POST (the invite courier, the `/auth/confirm` POST, checkout, recovery) **REFUSES**,
   because the preview's own origin is not in the list. Record this as the wall's positive proof, not as a
   misconfiguration. It is the stronger read: it proves the list is *consulted*, not merely present.
3. **The cross-origin arm.** The walk instrument's cross-origin `POST /api/invite` probe replays the request
   with an `Origin` that is not listed and expects **403** — it rides the same `proveSameOrigin` +
   `readSameOriginConfig` machinery (`apps/web/lib/members/courier.ts:78,297-300`).

**Recorded honestly, not glossed:** the Wave-G checklist's literal instruction is *"confirm the fail-closed
behaviour under a deliberately-unset probe first"* (`docs/ops/wave-g-setup-checklist.md:95-99`). That probe is
**NOT RUN** tonight, because unsetting the name now means editing a committed `vars` block, and the ruling is
not to reach for it. The unset behaviour is covered by the shipped unit suite instead —
`apps/web/tests/same-origin.test.ts:107` (*"absent means not configured, not permissive"*) and `:471` (*"with
no allowlist the request URL's own origin is the answer"*), both of which CI runs on every PR. Write that
substitution into the as-run as a substitution, with this residual named: the ceremony proves the wall refuses
an unlisted origin; the unit suite proves it refuses when unconfigured.
- [ ] as run: ______________________

**S12 [L] Walk the preview route by route.**
```sh
cd "…/scratchpad/ceremonies/remote-walk"
ORIGIN=https://<preview-host> WALK_EMAIL=<an existing account> node remote-walk.mjs --mode routes
```
Population re-derived at `9d5d844e`: **29 production pages** of 30 `page.tsx` files, and **7 Route Handlers**
(`(entry)/auth/confirm/verify`, `(entry)/auth/recover`, `(entry)/checkout`, `(entry)/checkout/success/claim`,
`api/invite`, `api/runtime/[...path]`, `logout`). Re-run the derivation at ceremony time; a page added since is
a route the script would silently not walk.
→ *Read, per route:* the HTTP status **and the page's own landmark actually rendered** — never just a 200.
Plus the Route Handlers behaving as designed: `/api/runtime/*` gated anonymously and **403** for a session
with no firm; `/api/invite` fail-closed; `POST /checkout` gated with no session. And one negative read that
belongs to the build, not the wall: **`/money-input-harness` must 404** — it is one of
`lib/supabase/proxy.ts`'s public prefixes only when `CLARA_E2E_MONEY_INPUT_HARNESS=1`, so a reachable page
there means the e2e opt-in rode the build.
*Instrument note:* `pnpm --filter @clara/web e2e` **cannot** take these reads — it builds and serves locally,
mocks Supabase at `${appOrigin}/e2e-supabase`, and serves the chat and SSE answers from its own mock. It is
the right instrument for what it proves and the wrong one for a deployed origin.
- [ ] as run: ______________________

**S13 [L] The two hard acceptance lines, on the deployed preview.**
1. **The signup journey's honest state.** FS-4 is closed, so the old framing (*"unreachable until FS-4
   closes"*) no longer resolves and must not be restated. What to read is the deployed wall's **actual**
   behaviour, whose cause is now the runtime's half: `confirmation-wall.ts` returns `unavailable` when
   `CLARA_RUNTIME_URL` or `CLARA_AUTH_WALL_SERVICE_TOKEN` is missing or the client IP does not resolve, and
   the runtime's `/api/auth-wall/confirm` answers **503 per request** while its own service token is unset —
   which under 裁-152 it is until FS-11 step 12.
   → *Read:* walk `/signup` and `/auth/confirm` and record **what actually happens**. The journey must not
   complete, and the refusal must be the honest "this is not available" the wall renders — not a crash, not a
   silent success. A screenshot of the refusal, not a claim about the code.
2. **The interview runner has an `apps/web` home** (裁-78, a hard acceptance line). Walk it end to end. It
   already rides the same-origin proxy, so this is also the first live proof that the proxy path works.
- [ ] as run: ______________________

**S14 [L] The chat and SSE walk — and the OpenNext-on-Workers STREAMING PROOF.**
```sh
ORIGIN=https://<preview-host> WALK_EMAIL=<account> node remote-walk.mjs --mode product
```
**This is the step that settles the one thing no repo artifact proves: whether a Next.js Route Handler's
streamed response body survives OpenNext-on-Workers.** Nothing in the repo measures it; the only streaming
assertions anywhere are against the e2e's own mock server.

→ *Read, all four, on a real chat turn:*
1. **The request URLs**, from the browser's Network tab: `https://<preview>/api/runtime/chat/…` and
   `https://<preview>/api/runtime/tasks/<id>/stream`. **Never `clara-runtime.fly.dev`.** The instrument
   classifies rather than asserts a spelling: an `/api/chat/…` on the app origin means the proxy PR did not
   land; a `clara-runtime.fly.dev` URL is the pre-PR cross-origin wiring. Either is a **FAIL**.
2. **`content-type: text/event-stream`** on the stream response.
3. **A chunked body** — `transfer-encoding: chunked`. Measured on the wire by #539's review: `cache-control`
   is **`private, no-store`** (the auth floor), **not** `no-cache, no-transform`. Do not expect the runtime's
   own value; the proxy's allow-list re-writes it.
4. **The reply appearing INCREMENTALLY.** This is the load-bearing half and it is invisible to a status code:
   whether events arrive progressively or in one buffered burst at the very end is the operator's own reading.
   Record it in words.

**If the stream does not attach, or attaches but delivers only one burst at the end: STOP BEFORE THE DNS
CHANGE.** Take 裁-151's standing fallback — a runtime CORS allowlist on `/api/chat` and `/api/tasks`, which is
a `packages/runtime` PR under the full ladder. **Do not work around it inside the ceremony.**

Also record here, in passing, any same-origin-walled POST refusal the walk meets on the preview: it is S11
read 2 observed a second time, and it belongs in the record as the wall working.
- [ ] as run: ______________________

**S15 [L] Walk the eleven-line security cutover checklist against the preview**
(`docs/plan/active/security-pass-2026-09-02.md:541-593`, re-read at `9d5d844e`). **Seven are ticked with their
reads. FOUR ARE WRITTEN AS DEFERRALS AND ARE NEVER TICKED** (裁-153).

| # | Line | FS-10 verdict |
|---|---|---|
| 1 | The C-5 runtime route exists and is wired, replacing both stubs in `confirmation-wall.ts` | [ ] tick with the read |
| 2 | That route does claim → `verifyOtp` → settle inside ONE server request; `attempt_id` never crosses the wire; the outcome derived from `verifyOtp`, never the request body | [ ] tick with the read |
| **3** | The trusted client-IP courier is live; `originDigest` no longer `undefined` | **DEFERRED to FS-11 step 12** — write it, never tick it |
| **4** | `clara_auth_wall_login` flipped to LOGIN out of band, its DSN in the runtime env only | **DEFERRED to FS-11 step 11** |
| **5** | `packages/db/deploy/acl-baseline.sql` run on the live project | **DEFERRED to FS-11 step 6** — with its own reads there: `ACL baseline verify: OK`, the eleven-role roster `usage_public = f`, and `clara_auth_wall` holding **no `public` USAGE** |
| 6 | The `/signup` send path is walled server-side, or the project's mail rate limits are accepted **in writing, by their numbers** | [ ] tick — and 裁-146's re-cut means the **Resend plan's** cap plus Supabase's raised auth rate limit, **not** the default mailer's 2/hour. Write both numbers. |
| **7** | The DPA read repointed at `get_current_dpa_document()` **and** one completed TEST-mode paid walk | **DEFERRED to FS-11 step 13** — and under 裁-148 that walk is **once at the seeded beta price, sandbox, MYR 0**, never a non-zero price. Its DPA-read half is already met on the tree. |
| 8 | The "Confirm signup" template emits `{{ .Token }}` with no link, by **Management API read, not a screenshot** | [ ] tick with the API read |
| 9 | A `livemode` gate exists before any mode flip, **or the flip is explicitly deferred and recorded** | [ ] tick as the recorded deferral |
| 10 | An operator can see an unconsumed payment | [ ] tick or record honestly — no door surfaces one today |
| 11 | HTTPS on the deployed origin | [ ] tick — the read is `__Host-clara-auth` actually landing after a login (both `__Host-` cookies are dropped silently over plain HTTP with no error at any layer) |

- [ ] as run: ______________________

**S16 [O/L] The invite link's `?ct=` edge-log redaction (裁-155).** The edge changes owner here from Pages to a
Worker, so the checklist's line changes owner with it.

**First act: LOOK, on screen.** Whether this Cloudflare account and plan expose a query-value redaction control
for a Worker's zone or access logs is **NOT MEASURED anywhere in the repo** — the checklist
(`docs/ops/wave-g-setup-checklist.md:140-145`) states the obligation and its proof shape and stops.
*(**NOT IN REPO — read on screen.** Cloudflare doc pages to search for by title, in this order: **"Logs ·
Logpush"** and its **"Logpush job object"** / **"Filters"** / **"Custom fields"** pages; **"Workers ·
Observability · Logs"**; **"Rules · Transform Rules"**. Whether any of them offers query-value redaction on
this plan is exactly what S16 goes to find out — do not assume one does, and do not write a click path this
record cannot support.)*

→ *Read, one of two, and never a silent skip:*
- **If a control exists:** configure it, then hit **one live invite link** against the deployment and read the
  edge/access log line, showing the `ct` value **masked or absent**. The burned link is the evidence.
- **If none exists:** write a **dated, explicit deferral** here naming the exposure — plaintext bearer material
  in ingress logs — with the owner as the actor and 裁-155 as the ruling, and open a `PROGRESS.md`
  Known-issues row for it at S27.

**State in either case the fact the checklist does not:** the link carries **TWO** bearer factors —
`/invite/<token_hash>?ct=<clara_token>` (`apps/web/lib/identity/doors.ts:59,80`;
`lib/members/invite-mail.ts:10,97`). Redacting the query leaves the `token_hash` **path segment** in the log
line. "Redacted" here means one factor of two, and it is written that way.
- [ ] as run: ______________________

### Phase E — the repoint

**S17 [O] Remove `app.clarabook.com` from the Pages project.**
Cloudflare → Workers & Pages → `clara` → **Custom domains → remove `app.clarabook.com`**. Cloudflare will not
attach one hostname to both a Pages project and a Worker, so the removal precedes the add.
*(**NOT IN REPO — confirm on screen.** Cloudflare doc page: **"Pages · Custom domains"**.)*
→ *Read:* the domain is gone from the Pages project's custom-domain list. **Record the wall-clock minute** —
this opens the only window in which the hostname has no target.
- [ ] as run: ______________________

**S18 [L] Promote the EXACT version that was walked.**
```sh
pnpm --filter @clara/web exec wrangler versions deploy      # choose the version id printed at S9
pnpm --filter @clara/web exec wrangler deployments list --name clara-web
```
*Promote the walked version, do not rebuild:* what was proven is then what serves. A rebuild produces a
different artifact and voids the walk.
→ *Read:* the promoted version id at **100%**, and it is S9's id.
- [ ] as run: ______________________

**S19 [O] Attach the custom domain to the Worker.**
Cloudflare → Workers & Pages → `clara-web` → **Settings → Domains & Routes → Add → Custom domain →
`app.clarabook.com`**.
*(**NOT IN REPO — confirm on screen.** Cloudflare doc pages: **"Workers · Configuration · Routes and
domains"**. The documented alternative — a `routes: [{ "pattern": "app.clarabook.com", "custom_domain": true }]`
entry in `wrangler.jsonc` — is a **repo change** and would ride a PR, never the ceremony floor.)*
→ *Read:* the domain shows **Active** on the Worker; `dig app.clarabook.com`; `curl -sI
https://app.clarabook.com` returns the **Worker's** response, not the dashboard's.
- [ ] as run: ______________________

**S20 [L] `CLARA_PUBLIC_ORIGINS` — a READ, not a write.**
The prep's "narrow it back" step is **vacated**: nothing was ever widened (裁-154), and the value ships from
the committed `vars` block, so there is no dashboard edit to undo.
→ *Read:* the Worker's served bindings still show `CLARA_PUBLIC_ORIGINS` = `https://app.clarabook.com`, and on
the real origin a genuine same-origin POST now **succeeds** where the preview refused — the wall's other half.
- [ ] as run: ______________________

**S21 [L] THE REAL-ORIGIN RE-WALK — the gate on everything irreversible (裁-154 + 裁-156).**
```sh
ORIGIN=https://app.clarabook.com WALK_EMAIL=<account> node remote-walk.mjs --mode routes
ORIGIN=https://app.clarabook.com WALK_EMAIL=<account> node remote-walk.mjs --mode product
```
**Every read below must be clean. Any one of them not clean ⇒ NO DELETE.** Fix forward on the Worker
(`wrangler versions deploy <previous-id>`); never a Pages rollback (裁-156 — after S25 there is none).

- [ ] **The routes**, per route: status and the page's own landmark. Abbreviated is acceptable **only if
      stated as abbreviated** in the record.
- [ ] **Password login**, and the **`__Host-clara-auth` cookie actually landing** — visible in the browser's
      cookie store with `Secure`, `Path=/`, no `Domain`. Attributes and names only; a cookie value is a bearer
      credential and never goes on the record.
- [ ] **Chat and a live SSE turn** — S14's four reads again, on the real origin, streaming incrementally.
- [ ] **The signup-confirm arm** (裁-154, deferred here from the preview): a real `/signup` to the **non-team**
      address (P-13), the **six-digit code** arriving through the custom SMTP, and the confirm page verifying
      it. Record the arrival time and the From address. *If the Mail gate (裁-146 point 3) has not certified,
      record this arm as owed to FS-11 / the Wave-G walk — do not tick it.*
- [ ] **The password-recover arm end to end** — request a reset, receive the **LINK** mail, follow it to
      `/auth/recover`, watch it spend the `?code=`, set a password, land signed in. This is the arm the
      LINK-template rule protects; without it the LINK-vs-CODE ruling is never exercised.
- [ ] **The origin wall on the real origin** — a genuine same-origin POST succeeds; the same POST replayed
      with an unlisted `Origin` returns **403**.
- [ ] **Observation 1 (folded in from the vacated soak):** `curl -sI https://app.clarabook.com` — the status
      and the served `server` / `cf-ray` headers, written verbatim.
- [ ] **Observation 2:** the route walk above, which is this observation.
- [ ] **Observation 3:** one read of the Worker's **error / exception count over the walk window** in
      Cloudflare's observability view. *(**NOT IN REPO — read on screen.** Cloudflare doc page: **"Workers ·
      Observability"**.)*

as run (one line per read): ______________________

### Phase F — close out, delete, merge, record

**Run order: S22 → S25 → S24 → S26 → S27.** `S23` (the soak) is **VACATED by 裁-156**; the number is retired,
not reused.

**S22 [L/O] Preview close-out — a walk that opened a surface closes it.**
1. **[O] Delete the preview alias and disable the preview URL** for `clara-web` (Cloudflare → `clara-web` →
   Settings → Domains & Routes → preview URLs).
   → *Read:* `curl -sI https://<preview-host>` no longer serves the app.
   *(A `workers.dev` preview is publicly reachable and is wired to the LIVE Supabase project. The data
   exposure is bounded by ruling — everything in the estate is a resettable test fixture, constraint 13 — but
   the SURFACE is real, and this act is what closes it.)*
2. **[O] Re-read Supabase's redirect allowlist** through the Management API
   (`GET /v1/projects/{ref}/config/auth`).
   → *Read:* **exactly two entries** — `https://app.clarabook.com/auth/confirm` and
   `https://app.clarabook.com/auth/recover` — **and no wildcard**. Under 裁-154 nothing was widened, so this is
   a confirmation, not a narrowing. Confirm it anyway: it is the read that proves nothing drifted.
3. **[O] Re-read the *Reset password* template** through the same API.
   → *Read:* still a **LINK** template, unchanged. `/auth/recover` spends a `?code=`; a bare-token template
   would dead-end the recovery arm. Read it back through the API, never from a screenshot.
- [ ] as run: ______________________

**S25 [O] Retire the Pages project — IRREVERSIBLE, in the same sitting, gated by S21 (裁-156).**

**Preconditions, all three already taken:** the Git integration is disconnected (S6); the custom domain is off
the project (S17); **S21 came back clean on every read**. If any S21 read was not clean, **do not run this
step** — fix forward on the Worker and leave the Pages project as an inert leftover, never as a fallback.

Cloudflare → Workers & Pages → `clara` → **Settings → Delete project**.
*(**NOT IN REPO — confirm on screen.** Cloudflare doc page: **"Pages · Manage a project"**.)*
```sh
pnpm --filter @clara/web exec wrangler pages project list
```
→ *Read:* `clara` is **no longer listed**.

**The owner's ground, recorded as ruled (裁-156, verbatim):** 「不觀察，舊的 frontend 完全不能用，直接換 and 删」 —
the legacy dashboard is not a product anyone may use, so the rollback the soak protects protects nothing. **The
dissent is filed, not relitigated:** the recommendation was 24 hours with three observations. **The consequence,
stated once and accepted:** after this step the project, its build history and its Function configuration are
gone; recovery means recreating the project from scratch and rebuilding from a restored `apps/dashboard`.
- [ ] as run: ______________________

**S24 [L] Merge the `apps/dashboard` source-delete PR (裁-158) — AFTER S21 passed and this record holds its
proof.**
PR **#____________**, branch `web/p6-x-source-delete`, opened by the `delete-dashboard` lane with a
DO-NOT-MERGE-BEFORE-FS-10-S21 banner. It rebases onto `9d5d844e`. It carries the 61-suite classification table,
both exit gates' outputs, S4's deploy-record read, and the mandatory "Skills/MCP consumed" line.
```sh
gh pr checks <n>          # every required check green, the `ci` meta-gate included
gh pr merge <n> --squash  # on green CI and a CLEAR review only
gh workflow run ci.yml    # a code merge after the sweep — 裁-158 point 3
```
→ *Read:* the merge commit sha; the ONE fresh-context opus review **CLEAR** (裁-86 / 裁-111 / 裁-133 — native
lanes only, no Codex leg until beta live); and the dispatched sweep's run id. **FS-11 does not wait for that
sweep**, but the launch sitting reads it, so record the id here even though its verdict lands later.
- [ ] as run: ______________________

**S26 [L] Pay the one owed documentation line (R-3, re-scoped).**
The `verify_snapshot` half was **already paid** on 2026-08-29 as `docs/ops/DR.md` §11 — **do not re-file it**;
re-filing a paid obligation is how a duplicate enters the record. What is still owed is
**`record_notification`'s "verify-then-decide" outcome**.
```sh
grep -rn "record_notification" docs/ops/     # returned ZERO before this line is paid
```
→ *Read:* the grep now returns the line.
- [ ] as run: ______________________

**S27 [L] The as-run, the checklist ticks, and the posture flip — in that order.**
1. File this record, completed, to `docs/plan/completed/fs10-cutover-asrun-2026-09-03.md` (the order says only
   *"an as-run in `docs/plan/completed/`"*; the filename is this record's proposal, not a repo fact) and add
   its row to `docs/plan/index.md` per that index's own path-stability convention.
2. Tick the six Cloudflare boxes in `docs/ops/wave-g-setup-checklist.md:290-300`.
3. Open the `PROGRESS.md` Known-issues rows this ceremony minted — at minimum S16's `?ct=` deferral if a
   control did not exist.
4. Change `PROGRESS.md`'s posture **only after all of it** — that is what "the wave completes" means. True the
   line asserting Pages serves the old `apps/dashboard` (`PROGRESS.md:20`), `docs/ARCHITECTURE.md:52`, and
   `docs/design/FRONTEND.md:41`.
5. **PROGRESS has ONE author** (session law) — if another lane is writing it, hand these lines to that author
   rather than writing them in parallel.
6. **裁-150: no next lanes are dispatched off the back of this ceremony.** What remains goes into Backlog and
   Known issues as rows. FS-11 opens immediately after this record is written (裁-157), with no maintenance
   page and its window recorded.
- [ ] as run: ______________________

---

## 3 · ROLLBACK — re-cut under 裁-156

The cost rises monotonically with the phase, which is the whole reason for the ordering. **Before any of it,
re-read S4's deploy record** so the rollback target is the deployment you actually intend to serve.

| Rolled back after | How | The positive read that the rollback WORKED |
|---|---|---|
| **S6** (Git disconnect) | Cloudflare → `clara` → Settings → Builds & deployments → **Connect to Git** again. Nothing was unpublished; the last build never stopped serving. | `curl -s https://app.clarabook.com` returns the dashboard's HTML; a new build appears after the next push. *(Reconnecting resumes per-PR builds — only if the cutover is genuinely abandoned.)* |
| **S7–S16** (build, upload, preview walk) | Nothing to undo — a version upload routes no traffic. Run S22's close-out anyway. | `app.clarabook.com` still resolves to Pages and serves the dashboard, unchanged since S4's read. |
| **S17–S21, BEFORE S25** — **still a repoint, not a restore** | ① `clara-web` → Settings → Domains & Routes → **remove `app.clarabook.com`**. ② Pages `clara` → **Custom domains → add `app.clarabook.com`**. ③ Leave the Worker deployed but unrouted. | `curl -sI https://app.clarabook.com` returns the **Pages** response again; the dashboard's `/chat` renders and a chat turn completes through its Pages Function proxy (`apps/dashboard/functions/api/[[path]].js`). |
| **S18 only** (a bad Worker version, domain already moved) | `wrangler versions deploy <previous-version-id>`, or `wrangler rollback --name clara-web`. | `wrangler deployments list --name clara-web` shows the previous version at 100%; the route re-walk is green. |
| **AFTER S25** (the Pages project deleted) | **THERE IS NO ROLLBACK. FIX FORWARD ONLY** — `wrangler versions deploy` back to a previously walked version. The Worker's own version history is the entire rollback surface. | `wrangler deployments list --name clara-web` shows the re-promoted id at 100%, and S21's reads re-taken come back clean. |
| **S24** (the source delete merged) | `git revert` the merge + a fresh build. **This is a RESTORE** — which is exactly why it must never ride the repoint commit. | `apps/dashboard` back on `main`; its build green. |

**One rollback nothing can give back:** once FS-11 has run its reset, rolling FS-10 back would put the OLD app
in front of a NEW database — `apps/dashboard` is not the app `0164` was built for. Under 裁-156/157 FS-11
follows immediately, so in practice the repoint rollback lives only until FS-11 opens.

---

## 4 · THE CLOSING BLOCK — fill every line before the record is filed

| What | Reading |
|---|---|
| Ceremony base sha (`git log -1`) | ______________________ |
| Sweep run id + verdict, from `gh run view --json jobs` | `33757365379` → ______ of 13 `success`, concluded ______ |
| Clock at open / at close (from `date`, both MYT and UTC) | ______________________ |
| The Pages deployment that was serving at S4 (id, commit, branch, timestamp) | ______________________ |
| Worker version id **uploaded** at S9 (and the preview host) | ______________________ |
| Worker artifact size, compressed (≤ 10 MiB) | ______________________ |
| Worker version id **promoted** at S18 (must equal S9's) | ______________________ |
| `app.clarabook.com` DNS record as read at S19 (`dig`, and the dashboard's own view) | ______________________ |
| `curl -sI https://app.clarabook.com` — status, `server`, `cf-ray` | ______________________ |
| Secrets present on `clara-web`, **by NAME only** (expect six) | ______________________ |
| The 裁-152 minting sentence, dated | *"…minted at FS-10 S8 on 2026-09-03 at ____ MYT; FS-11 step 12 reuses these bytes verbatim."* |
| The three `vars` names as SERVED (not as intended) | ______________________ |
| Security lines **3 / 4 / 5 / 7** — written as deferrals, not ticked | FS-11 steps **12 / 11 / 6 / 13** |
| The other seven security lines, each with its read | ______________________ |
| **S16 outcome** — configured + proven, or a dated explicit deferral naming the exposure | ______________________ |
| **S21 readings**, one line per read, including the three folded observations | ______________________ |
| Worker error/exception count over the S21 window | ______________________ |
| Pages project state after S25 (`wrangler pages project list`) | ______________________ |
| Source-delete PR number + merge sha (S24) | #______ → ______________________ |
| The post-merge sweep run id dispatched at S24 | ______________________ |
| FS-11 window opened at (裁-157 — no maintenance page; errors expected and recorded) | ______________________ |

---

## 5 · WHAT THIS RECORD COULD NOT TAKE FROM THE REPO — stated, never invented

1. **No Cloudflare runbook of any kind exists under `docs/ops/`.** Every dashboard click path in this file is
   marked **NOT IN REPO — confirm on screen**, with the Cloudflare doc page title to have open beside it:
   *"Workers & Pages"*, *"Pages · Custom domains"*, *"Pages · Git integration"*, *"Pages · Manage a project"*,
   *"Workers · Configuration · Routes and domains"*, *"Workers · Observability"*.
2. **Whether this Cloudflare plan offers query-value log redaction is unmeasured** (S16). Doc pages to search:
   *"Logs · Logpush"* (and its *"Logpush job object"* / *"Filters"* / *"Custom fields"* pages), *"Workers ·
   Observability · Logs"*, *"Rules · Transform Rules"*. Do not assume any of them provides it.
3. **No as-run filename or template is named in the repo for FS-10.** The order says only *"an as-run in
   `docs/plan/completed/`"*. `fs10-cutover-asrun-2026-09-03.md` is this record's proposal.
4. **No measured value for the Worker's compressed size.** The ≤ 10 MiB ceiling is stated in the order; S10 is
   the first measurement in this estate's history.
5. **No repo proof that a Route Handler's streamed body survives OpenNext-on-Workers.** S14 is the first
   measurement; every streaming assertion in the tree is against the e2e's own mock server.
6. **The Cloudflare account is named in the repo only as `ac42cba1…`** (a truncated id in a handoff table).
   Confirm the full account on screen at P-9.
7. **The Pages project's current deployment is a claim, not evidence.** `PROGRESS.md:20`,
   `docs/ARCHITECTURE.md:52` and `docs/design/FRONTEND.md:41` all assert Pages serves the old dashboard. S4
   exists because that is the claim being verified.
