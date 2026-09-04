*Part 2 of 3 of the FS-10 cutover PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs10-cutover-prep-2026-09-03-part1.md` · Next: `fs10-cutover-prep-2026-09-03-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*


1. **Unset arm (the one the earlier draft omitted).** With `CLARA_PUBLIC_ORIGINS` **absent** on the preview
   version, make a real same-origin POST from the preview app.
   → *Read:* it is REFUSED. Absent is fail-closed by construction, not permissive — the wall falls back to
   `Host` and the request URL and consults `x-forwarded-host` not at all (`apps/web/lib/same-origin.ts`, the
   "CODEX ROUND 2, N3" block at `:38-57`; `readSameOriginConfig` at `:72-93` yields an empty allowlist).
2. **Set it**, widened for the walk: `wrangler secret put CLARA_PUBLIC_ORIGINS --name clara-web` with
   `https://app.clarabook.com,https://<preview-host>`.
3. **The two configured arms** (`apps/web/README.md:453-454` — "POST from the real app … confirm it
   succeeds; then replay it with an `Origin` you did not list and confirm a 403"): the same real POST from the preview app now
   **succeeds**; the same POST replayed with an `Origin` you did not list returns **403**.

→ *Read:* all three, or the wall is unproven. Arm 1 is what distinguishes "configured" from "working".

**S12 [L] Walk the preview route by route.** The population is **29 production pages** — `find apps/web/app
-name page.tsx` returned **30** on `5eab358d`, of which `(e2e)/money-input-harness` is the build-time-inert 404
stub — cross-checked against `apps/web/lib/command/routes.ts` (whose oracle is derived from the live tree by
`routes.test.ts`). **Re-run the `find` at ceremony time; do not carry 29/30 forward as a number.**
→ *Read, per route:* the HTTP status and the page's own landmark actually rendered — not just a 200.
Plus the Route Handlers behaving as designed. **CORRECTED COUNT: `apps/web` now has SEVEN Route Handlers, not
two** (measured on `5eab358d` — `find apps/web/app -name route.ts`): `app/api/invite/route.ts`,
`app/api/runtime/[...path]/route.ts`, `app/logout/route.ts`, `app/(entry)/auth/confirm/verify/route.ts`,
`app/(entry)/auth/recover/route.ts`, and #517's two — `app/(entry)/checkout/route.ts` and
`app/(entry)/checkout/success/claim/route.ts`. Specifically:
`/api/runtime/*` answers **403** unscoped (`route.ts:145-151`, the guard dominates the proxy) and **503**
`runtime_not_configured` when `CLARA_RUNTIME_URL` is absent (`route.ts:44-46`); `/api/invite` fails closed
with `mail_not_configured` if any of its three names is unset; `POST /checkout` refuses fail-closed while
`STRIPE_SECRET_KEY` or the pepper is absent (`lib/checkout/stripe-session.ts:212-217`).
*Instrument note:* `pnpm --filter @clara/web e2e` **cannot** do this walk — the rig serves a LOCAL build, mocks
Supabase at `${appOrigin}/e2e-supabase` (`apps/web/e2e/run.mjs:14-28`) **and serves the chat legs itself**
(`apps/web/e2e/chat-parity-mock.mjs:209-211`). The remote walk is a manual browser walk, or a Playwright script
written for the ceremony. See §7 item 5.

**S13 [L] Prove the hard acceptance lines on the deployed preview.**
1. **The signup journey's honest state — RE-STATED, because the premise changed.** The FS-10 order's line
   (`:459-461`) was *"self-serve signup is unreachable in the deployed build until FS-4 closes the confirmation
   login-CSRF binding"*, and it required *"a positive read of the deployed route's behaviour, never an
   assumption."* **FS-4 IS NOW CLOSED** (P11: #517 merged `aa789d65`, 17:02 MYT 2026-09-03; `0164` on `main`),
   so the line no longer resolves to "FS-4 is open" and must not be restated that way. **What to read instead is
   the deployed wall's ACTUAL behaviour**, whose cause is now the runtime's half, not the web half:
   `app/(entry)/auth/confirm/verify/confirmation-wall.ts:168-174` returns `{kind:"unavailable"}` when
   `CLARA_RUNTIME_URL` or `CLARA_AUTH_WALL_SERVICE_TOKEN` is absent or the client IP does not resolve, and the
   runtime's `/api/auth-wall/confirm` answers **503 per request** while `CLARA_AUTH_WALL_SERVICE_TOKEN` is unset
   there (`packages/runtime/src/authWallRoutes.ts:30-31`, `:115` `auth_wall_unconfigured`, `:129`
   `auth_wall_lane_unconfigured`, `:136` `verify_unconfigured`, `:152,158` `origin_digest_unavailable`) — and
   under D2 the runtime does not hold it until FS-11 step 11.
   → *Read:* walk `/signup` and `/auth/confirm` on the preview and record **what actually happens** — the
   journey must not complete, and the refusal must be the honest "this is not available" the wall renders, not a
   crash and not a silent success. A screenshot of the refusal, not a claim about the code.
2. **The interview runner has an `apps/web` home** (裁-78) → walk it end to end on the preview (P8; it already
   goes through the same-origin proxy, so it is also the first live proof that the proxy path works).

**S14 [L] Walk the chat/SSE leg — the step D1 exists to make passable.**
→ *Read:* open a thread, send a turn, watch the stream attach and events arrive, and read the browser's Network
tab for the actual request URLs (they must be `https://<preview>/api/runtime/chat/…` and
`…/api/runtime/tasks/<id>/stream`, not `clara-runtime.fly.dev`).
**This is the step that settles the one thing D1's measurement could not: whether a Route Handler's streamed
body survives OpenNext-on-Workers.** If the stream does not attach — or attaches but delivers events only in one
buffered burst at the end — **STOP before the DNS change** and take the fallback in D1 (a runtime CORS allowlist
on `/api/chat` and `/api/tasks`, which is a `packages/runtime` PR). Do not work around it in the ceremony.

**S15 [L] Walk the 11-line security checklist against the preview** (`security-pass-2026-09-02.md:545-593`),
recording each line's verdict and, for lines 3/4/5/7, the **numbered FS-11 step** they defer to per D3 — a
written deferral, never a tick. Line 6 is 裁-146's re-cut: accepting the rate limits as the wall means accepting
the **Resend plan's** cap and Supabase's raised auth rate limit **in writing, by their numbers**, not the default
mailer's 2/hour.

**S16 [O/L] The invite-link `?ct=` edge-log redaction (D7).**
The edge changes owner here, so the checklist's line (`wave-g-setup-checklist.md:140-145`) changes owner with it.
Look, on screen, for a query-value redaction control that applies to the `clara-web` Worker's zone/access logs;
configure it if one exists.
→ *Read:* the checklist's own proof shape — hit a live invite link against the preview, then read the
edge/access log line and show the `ct` value **masked or absent**. If no such control exists on this account,
write a dated, explicit deferral into the as-run naming the exposure — and name in it the fact the checklist
does not: the link carries **two** bearer factors, `/invite/<token_hash>?ct=<clara_token>`
(`apps/web/lib/identity/doors.ts:59,80`; `lib/members/invite-mail.ts:10,97`), and redacting the query leaves the
path segment in the log.

### Phase E — the repoint (the DNS change)

**S17 [O] Remove `app.clarabook.com` from the Pages project.**
Cloudflare dashboard → Workers & Pages → `clara` → **Custom domains → remove `app.clarabook.com`**.
(Cloudflare will not attach one hostname to both a Pages project and a Worker, so the removal precedes the add.)
→ *Read:* the domain is gone from the Pages project's custom-domain list.

**S18 [L] Promote the EXACT version that was walked.**
`wrangler versions deploy` (choose the version id printed in S9) — or, if the version has been rebuilt,
`pnpm --filter @clara/web exec opennextjs-cloudflare deploy`.
*Prefer promoting the walked version:* what was proven is then what serves.
→ *Read:* `wrangler deployments list --name clara-web` showing the promoted version id at 100%.

**S19 [O] Attach the custom domain to the Worker.**
Cloudflare dashboard → Workers & Pages → `clara-web` → **Settings → Domains & Routes → Add → Custom domain →
`app.clarabook.com`**.
*(Cloudflare's documented alternative is a `routes: [{ "pattern": "app.clarabook.com", "custom_domain": true }]`
entry in `wrangler.jsonc` — that is a **repo change**, so it rides a PR, never the ceremony floor.)*
→ *Read:* the domain shows **Active** on the Worker; `curl -sI https://app.clarabook.com` returns the Worker's
response (not the dashboard's); `dig app.clarabook.com`.

**S20 [O/L] Narrow `CLARA_PUBLIC_ORIGINS` back to the production set** (drop the preview origin).
→ *Read:* the same three-armed proof as S11 (the unset arm may be skipped here — it was proven on the preview
and re-running it would deliberately break the live origin); at minimum: a real POST succeeds; an unlisted
`Origin` gets 403.

**S21 [L] Re-walk on the real origin.** The routes again (abbreviated is acceptable only if stated as such in
the as-run), plus:
- the `__Host-clara-auth` cookie actually lands after a login (P21);
- document intake begin/bytes/finalize through `/api/runtime/*`;
- chat + a live SSE turn (S14's read, now on the real origin);
- **the password-recovery arm end to end** — request a reset, receive the LINK mail, follow it to
  `/auth/recover`, watch it spend the `?code=`, set a password, land signed in. This is the arm P19's template
  rule protects and D6 deferred from the preview; without it the LINK-vs-CODE ruling is never exercised.
- **the signup-confirm arm** is walked here too if, and only if, the Mail gate (P22) has certified; otherwise
  record it as owed to FS-11/the Wave-G walk.
→ *Read:* per-route status + landmark, the cookie visible in the browser's cookie store, and the recover arm's
final signed-in state.

**S22 [L] Preview close-out — before the soak closes, and before anything irreversible.**
Three acts, each with its own read, because a walk that widened something must narrow it back:
1. **Delete the preview alias and disable the preview URL** for `clara-web` (Cloudflare → `clara-web` →
   Settings → Domains & Routes → preview URLs).
   → *Read:* `curl -sI https://<preview-host>` no longer serves the app.
2. **Re-read Supabase's redirect allowlist** through the Management API (`GET /v1/projects/{ref}/config/auth`).
   → *Read:* **exactly two entries** — `https://app.clarabook.com/auth/confirm` and
   `https://app.clarabook.com/auth/recover` — **and no wildcard** (`wave-g-setup-checklist.md:151-156`). Under
   D6 nothing was widened, so this is a confirmation; if the owner ruled otherwise, this is the narrowing.
3. **Re-read the *Reset password* template** through the same API: still a LINK template (P19).
→ *Read:* all three recorded in the as-run. R4's public preview surface is closed by act 1, and the record says
so.

**S23 [O/L] Soak (D5).** Leave the Worker serving `app.clarabook.com` for the owner's window with the Pages
project still intact and re-attachable. **The delete steps below are irreversible; the soak is what buys the
cheap rollback.** Observations, all three recorded: periodic `curl -sI https://app.clarabook.com` at open,
mid-window and close; one abbreviated route re-walk at the close; one read of the Worker's error/exception count
for the window. **Per D4, the soak closes and is recorded BEFORE FS-11 opens** — FS-11 stops the runtime
(`fs11-wave-g-reset-prep.md:296` step 8 restarts it; `:228` step 3 quiesces) and runs `DROP SCHEMA clara CASCADE`
(`:237` step 4) followed by a fresh apply of `0001`…`0164` (`:254` step 5, and §1.1 — **there is no delta
apply**; constraint 15 keeps `workflow` / `graphile_worker` / `spike` untouched), so a soak reading taken across
the reset measures the reset, not the Worker.

### Phase F — prove, then delete

**S24 [L] The source-delete commit — a SEPARATE commit from everything above.**
Delete `apps/dashboard`; PR body carries the 61-suite classification table (P6), both exit gates' outputs, the
deploy-record read from S4, and the "Skills/MCP consumed" line the P6 orders make mandatory
(`orders-p6.md:10-11`). Full ADR-061 ladder — this touches code.
→ *Read:* `pnpm typecheck && pnpm lint && pnpm build && pnpm test` green at the root with `apps/dashboard`
gone; CI green; the ONE fresh-context opus review CLEAR (裁-86/111/133 — native lanes only).

**S25 [O] Retire the Pages project.**
Cloudflare dashboard → Workers & Pages → `clara` → **Settings → Delete project**.
→ *Read:* `wrangler pages project list` no longer lists `clara`.
**Irreversible — do not run before S23's soak has closed with its three observations recorded and S21's proof is
in the as-run.**

**S26 [L] Pay the one owed documentation line (R-3, re-scoped by P10):** `record_notification`'s
verify-then-decide outcome (`orders-p6.md:461-464`).
→ *Read:* `grep -rn "record_notification" docs/ops/` now returns the line (it returned **zero** on `5eab358d`).
**Do NOT re-file the `verify_snapshot` line** — it was paid on 2026-08-29 as `docs/ops/DR.md` §11 (`:452-500`,
its header at `:455-459` states it is that owed line). Re-filing it would duplicate a paid obligation.

**S27 [L] The as-run and the posture flip.** Write the as-run to `docs/plan/completed/` (FS-10 order `:475`;
suggested name in the house convention: `fs10-cutover-asrun-2026-09-XX.md`), tick the six Cloudflare boxes in
`docs/ops/wave-g-setup-checklist.md:204-217`, and change `PROGRESS.md`'s posture **only after all of it**
(`orders-p6.md:468-469`: "that is what 'the wave completes' means"). Also true the `PROGRESS.md` line asserting
Pages serves the OLD `apps/dashboard`, `apps/dashboard/README.md`'s SUPERSEDED banner, and file §8's truing
lines. **裁-150: no next lanes are dispatched off the back of this ceremony** — what remains goes into
PROGRESS's Backlog and Known issues as rows, and the session closes after the beta-live e2e.

---

## 3 · Rollback — point Pages back at `apps/dashboard`

The rollback's cost rises monotonically with the phase, which is the whole reason for the ordering.

| Rolled back after | How | Positive read that the rollback WORKED |
|---|---|---|
| **S6** (Git disconnect) | Cloudflare → `clara` → Settings → Builds & deployments → **Connect to Git** again. Nothing was unpublished; the last build never stopped serving. | `curl -s https://app.clarabook.com` returns the dashboard's HTML; the deployments list shows a new build after the next push. *(Reconnecting resumes per-PR builds — only do it if the cutover is genuinely abandoned.)* |
| **S7–S16** (build / upload / preview walk) | Nothing to undo — a `versions upload` routes no traffic. Run S22's close-out anyway (alias deleted, allowlist re-read). | `app.clarabook.com` still resolves to Pages and serves the dashboard (unchanged since S4's read). |
| **S17–S23** (the repoint) — **this is a repoint, not a restore** | ① Workers & Pages → `clara-web` → Settings → **Domains & Routes → remove `app.clarabook.com`**. ② Workers & Pages → `clara` (Pages) → **Custom domains → add `app.clarabook.com`**. ③ Leave the Worker deployed but unrouted. | `curl -sI https://app.clarabook.com` returns the **Pages** response again; the dashboard's `/chat` renders; its Pages Function proxy answers — `apps/dashboard/functions/api/[[path]].js` forwards `/api/*` to `CLARA_RUNTIME_ORIGIN` (falling back to `https://clara-runtime.fly.dev`), so a chat turn on the dashboard is the end-to-end read. |
| **S18 only** (a bad Worker version, domain already moved) | `wrangler rollback --name clara-web`, or `wrangler versions deploy <previous-version-id>`. | `wrangler deployments list --name clara-web` shows the previous version at 100%; the route re-walk is green. |
| **S24** (the source delete merged) | `git revert` the delete commit + a fresh build. **This is a RESTORE**, and it is why the delete must never ride the repoint commit. | `apps/dashboard` back on `main`; `pnpm --filter @clara/dashboard build` green. |
| **S25** (Pages project deleted) | **NONE.** The project, its build history and its Function config are gone; recovery means recreating the project from scratch and rebuilding from a restored `apps/dashboard`. | — |

**Rollback preflight, before any of it:** re-read S4's deploy record so the rollback target is the deployment
you actually intend to serve, not the newest one a stray build produced.

**One rollback the dashboard cannot give you back:** if FS-11 has already run its reset, rolling FS-10 back to
Pages restores the OLD app against a NEW database — `apps/dashboard` is not the app `0164` was built for. That
is D4's whole point, and it is why the soak closes first.

---

## 4 · Owner acts / 老板要做的事

*(Bilingual by instruction — English first, then 大白话. These are the things to DO; the things to DECIDE are the
OWNER DECISIONS block at the top.)*

**A1. Grant Cloudflare access for the `clara-web` Workers deploy.**
Either drive the dashboard yourself, or hand a scoped Cloudflare API token to the lead **environment to
environment — never typed into chat, never into the repo** (`wave-g-setup-checklist.md:205`; hard constraint 4).
**A1（大白话）** 给 Cloudflare 的权限。要么老板自己点，要么把一个权限受限的 Cloudflare API token **从环境变量传到环境变量**交给
lead —— 绝对不写进聊天、不写进代码库。

**A2. Disconnect the Pages project `clara`'s Git integration — this is the FIRST mutating act (S6).**
**A2（大白话）** 先把旧的 Pages 项目 `clara` 跟 GitHub 的自动构建**断开**。不断开的话，以后每合并一个文档 PR，旧版 dashboard 就会
被重新部署一次，等于白做。断开不会让网站下线 —— 最后一次构建仍然在服务，这正是我们留的后路。

**A3. Put the nine environment values on the `clara-web` Worker, env-to-env, and MINT the two shared ones (S8/D2).**
`wrangler secret put <NAME> --name clara-web`, one at a time. Three traps: `CLARA_TRUSTED_CLIENT_IP_HEADER` is
**`CF-Connecting-IP`** on `apps/web` but **`X-Clara-Client-IP`** on the runtime — same name, different correct
values; `CLARA_RATE_WALL_PEPPER` + `CLARA_AUTH_WALL_SERVICE_TOKEN` are minted **once, here**, and FS-11 step 11
must reuse the **same bytes** on the runtime or the wall splits in two and every confirmation 401s; and
`STRIPE_SECRET_KEY` is the **sandbox/TEST** key for the whole beta (裁-126) — there is no live key at this
ceremony.
**A3（大白话）** 往新的 Worker 里放九个环境变量（密钥），一个一个放，值永远不打印出来。三个最容易错的地方：
`CLARA_TRUSTED_CLIENT_IP_HEADER` 这个名字在网页端要填 `CF-Connecting-IP`，在 runtime 那边要填 `X-Clara-Client-IP`——
名字一样、值不一样；pepper 和 service token **这一场造一次**，FS-11 那边必须用**一模一样的**值，差一个字符所有注册确认都会失败；
Stripe 的密钥整个 beta 都用**沙盒的**，不是真钱的。

**A4. Move the domain `app.clarabook.com` from Pages to the Worker — only AFTER the preview walk passes (S17/S19).**
**A4（大白话）** 把域名从旧的 Pages 项目搬到新的 Worker —— **一定要先在预览网址上一页一页走完、确认没问题之后**再搬。先从 Pages
上摘掉，再挂到 `clara-web` 上。

**A5. Delete the Pages project `clara` — LAST, and it cannot be undone (S25).**
Only after the Worker has served the real domain through the agreed soak, the soak's three observations are
recorded, and the as-run holds S21's proof.
**A5（大白话）** 最后一步才删掉旧的 Pages 项目，**删了就回不来了**。必须等新版在真实域名上跑够了约定的观察期、三项观察都写进
as-run 之后再删。删之前，回滚只是"把域名搬回去"；删之后，回滚变成"重建"。

**A6. Confirm the *Reset password* email template is still a LINK template (P19), by Management API read.**
**A6（大白话）** Supabase 的"重置密码"邮件模板要**保持是链接**，不能改成纯验证码 —— 因为找回密码那条路要靠链接里的 `?code=`
才能换到会话。用 Management API 读回来确认，不要只看后台界面。

**A7. Run the 裁-147 Stripe-problem check before the domain moves (P13).**
`clara.list_stripe_event_problems(false)` must come back empty of unhandled rows; any row is resolved through
`clara.resolve_stripe_event_problem(uuid, text, text)` with its reason first.
**A7（大白话）** 搬域名之前，跑一下"有没有没处理的 Stripe 问题事件"这个查询，必须是空的。有的话先用配套的门标记处理掉、写清楚原因。
运营方的界面是 beta 之后才建（裁-147），所以现在这是一条**手工检查**。

---

## 5 · Risks — measured, each with its evidence

**R1 · CHAT AND SSE DO NOT WORK FROM THE DEPLOYED ORIGIN TODAY — SETTLED BY MEASUREMENT, not by inference.
The highest-value finding in this prep, and a LAUNCH BLOCKER (D1).**

*How the runtime base URL is chosen.*
- `apps/web/lib/clara/api.ts:56-58` — `runtimeBase()` returns
  `(process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "")`. It is a `NEXT_PUBLIC_*` value, so it
  is **inlined into the browser bundle at build time**, not read at request time.
- `api.ts:73-82` — `runtimeFetch(path, token, init)` fetches `` `${runtimeBase()}${path}` ``. The five chat call
  sites pass runtime-absolute paths: `:116` and `:129` `"/api/chat/sessions"`, `:138` the same (POST), `:148`
  `` `/api/chat/sessions/${id}/messages` ``, `:172` `` `/api/chat/${sessionId}/turns` ``.
- `api.ts:196-197` — `resolveStreamAuth()` hands `runtimeBase()` out; `lib/clara/useClaraThread.ts:70-72` passes
  it to `lib/clara/stream.ts`, whose `openTaskStream` at `:240-242` fetches
  `` `${opts.runtimeBase}/api/tasks/${taskId}/stream` ``.
- **There is no rewrite anywhere to catch it.** `apps/web/next.config.ts:47-55` declares, in its own words,
  "DELIBERATELY no `rewrites()` for the runtime proxy", and the file has no `rewrites` key.

*What the same-origin proxy actually carries.*
- `apps/web/app/api/runtime/[...path]/route.ts:34-38` reads **`CLARA_RUNTIME_URL`** — a **server-side-only**
  name (no `NEXT_PUBLIC_` prefix, `:23-26`) — at **request** time, and `:44-46` returns a typed
  `503 runtime_not_configured` when it is absent.
- `:48` builds the target as `` `${base}/api/${path.map(encodeURIComponent).join("/")}${search}` `` — so
  `/api/runtime/<p…>` → `<runtime>/api/<p…>`, **path-generic**. `:28-32` says so explicitly: *"It carries no
  per-route allowlist of its own; the runtime is the authority on which paths exist."*
- **So the proxy DOES carry the chat and stream routes structurally** — `/api/runtime/chat/sessions` →
  `<runtime>/api/chat/sessions`, `/api/runtime/tasks/<id>/stream` → `<runtime>/api/tasks/<id>/stream` — and it
  sends the right credential for them: `lib/runtime/outbound.ts:69-84` registers only the two intake capability
  legs, and `:123-131` defaults **every unclassified leg to `session`**, so `:196-198` writes the
  guard-verified `Authorization: Bearer <session JWT>` — exactly what `packages/runtime/src/chatRoutes.ts:137,160,181,200`
  and `streamRoute.ts:28` authenticate.
- **And it streams by construction:** `route.ts:116` returns `new Response(res.body, {status, headers})` — the
  body is passed through, not buffered — and the response allow-list at `:108-109` includes `content-type` and
  `cache-control`, so the runtime's `text/event-stream` and `no-cache, no-transform`
  (`packages/runtime/src/streamRoute.ts:47-53`) survive. `signal: req.signal` (`:75`) propagates the abort.
  Dropped and harmless: `X-Accel-Buffering` (an nginx hint) and the hop-by-hop `Connection`. The one header the
  outbound allow-list drops that a reader might worry about — `accept: text/event-stream`
  (`outbound.ts:54`, `BODY_HEADERS` is `content-type`/`content-length` only) — is **not read** by
  `streamRoute.ts`, which sets the SSE headers unconditionally at `:47-53`. The proxy exports GET, POST and PUT
  (`route.ts:153-155`), which covers every chat and stream verb.
- **The proxy is already the live pattern for two other lanes**, which is the positive evidence that this shape
  works: `apps/web/lib/interview/api.ts:281,302,323,377,433` addresses `/api/runtime/interview/…`, and
  `apps/web/lib/documents/intake.ts:11` states in its own header that it uses **no** `runtimeBase()` /
  `NEXT_PUBLIC_CLARA_RUNTIME_URL`.

*Why it is nevertheless broken today — the chat lane never asks for the proxy path.*
- **Variable UNSET** ⇒ `runtimeBase()` is `""` ⇒ the browser calls `/api/chat/sessions`,
  `/api/chat/<id>/turns` and `/api/tasks/<id>/stream` **on `apps/web`'s own origin**. `apps/web` has **seven**
  Route Handlers (S12's list) and **none of them is `/api/chat/*` or `/api/tasks/*`** — so every one of those
  requests 404s. The proxy's prefix is `/api/runtime/`, and no prefix value of `NEXT_PUBLIC_CLARA_RUNTIME_URL`
  can turn `"/api/chat/sessions"` into `"/api/runtime/chat/sessions"`; the closest, `"/api/runtime"`, produces
  `/api/runtime/api/chat/sessions` → `<runtime>/api/api/chat/sessions`, a doubled segment.
- **Variable SET** to the Fly origin ⇒ a cross-origin browser call to `clara-runtime.fly.dev/api/chat/…`. The
  runtime's CORS middleware is mounted on **`/api/intake` only** — `packages/runtime/src/intakeRoutes.ts:60-82`
  (`router.use("/api/intake", …)`, whose own comment reads *"This middleware is mounted only on /api/intake"*),
  reading `CLARA_INTAKE_CORS_ORIGINS` at `:19`. `chatRoutes()` and `streamRoutes()` are mounted separately at
  `packages/runtime/src/index.ts:94-95` and inherit nothing. A repo-wide search for `Access-Control-Allow-Origin`
  in `packages/runtime` finds it at `intakeRoutes.ts:69` and nowhere else. So the response carries no
  `Access-Control-Allow-Origin` and the browser blocks it.
- **Why no test caught it.** `apps/web/e2e/chat-parity-mock.mjs:209-211` says it outright: *"`lib/clara/api.ts`'s
  `runtimeBase()` is empty in this harness (no `NEXT_PUBLIC_CLARA_RUNTIME_URL`), so the browser calls these paths
  on the app origin directly — **they never reach `next start`**"* — and the harness's own HTTP server answers
  `/api/chat/*` and `/api/tasks/*` itself at `:212-240` (messages `:215`, turns `:224`, stream `:232`). The suite passes because a mock, not `apps/web`, serves those
  paths. The deployed Worker has no such server.

*The recommended ceremony setting, and its positive read.* **There is no ceremony setting that fixes this** —
leaving `NEXT_PUBLIC_CLARA_RUNTIME_URL` unset does *not* route chat through the proxy, it routes it to a
nonexistent handler. The fix is a code PR before FS-10 (D1, recommendation (b)): repoint `lib/clara/api.ts`,
`lib/clara/stream.ts` and `lib/clara/useClaraThread.ts` at `/api/runtime/*`, after which the ceremony setting is
**`NEXT_PUBLIC_CLARA_RUNTIME_URL` unset (and, once (b) lands, gone from the codebase entirely), with
`CLARA_RUNTIME_URL` set as a Worker secret in S8.** Its positive read is S14 on the preview: a chat turn sent, a
stream attached, events arriving incrementally, and the browser's Network tab showing
`https://<preview>/api/runtime/chat/…` and `…/api/runtime/tasks/<id>/stream` — never `clara-runtime.fly.dev`.
The residual unknown (streaming through OpenNext-on-Workers) is unproven in the repo and is exactly what S14
measures; fallback (a) stands if it fails.

**R2 · The security pass's cutover checklist collides with the FS-10→FS-11 re-sequencing — now pointed at
numbered steps (D3).** Line 3 (`CLARA_TRUSTED_CLIENT_IP_HEADER` + `CLARA_RATE_WALL_PEPPER` live, `originDigest`
no longer `undefined` at `verify/handler.ts:208`) → **FS-11 step 11**
(`fs11-wave-g-reset-prep.md:379-396`). Line 4 (`clara_auth_wall_login` flipped to LOGIN with a password out of
band, its DSN in the runtime env only) → **FS-11 step 10** (`:331`). Line 7 (the DPA read repointed at
`get_current_dpa_document()` + one completed TEST-mode paid walk) → **FS-11 step 12** (`:415`), and under
裁-148 that walk is **once at the seeded beta price, sandbox, MYR 0** — not a non-zero price. **Line 5
(`packages/db/deploy/acl-baseline.sql` run on the live project after the migration chain) has NO numbered FS-11
step** — FS-11 names the baseline only inside its §5 rollback (`:501-503`) — so D3 asks for one inserted after
FS-11 step 5, with reads `VERIFY: OK` and a positive read that `clara_auth_wall` holds **no `public` USAGE**
(measured on a migrations-only rig it still does — `security-pass-2026-09-02.md:560-564`). Until then the
deployed origin must not serve `/signup` to a real applicant, which is S13's read.

**R3 · `wrangler.jsonc` declares no `vars` block, and `apps/web/.env.example` is missing four names.** The
non-secret Worker configuration has no declared home in the repo (`wave-g-setup-checklist.md:136-138`), and
`.env.example` (125 lines, nine names at `:34,35,60,71,92,97,107,116,125`) carries none of
`CLARA_RATE_WALL_PEPPER`, `CLARA_TRUSTED_CLIENT_IP_HEADER`, `CLARA_AUTH_WALL_SERVICE_TOKEN`,
`STRIPE_SECRET_KEY`. Setting them all as secrets works (`init.js:87-92` copies `vars` and secrets alike into
`process.env`), but the configuration then lives only in the Cloudflare account with no repo-visible record —
exactly the shape the `NEXT_PUBLIC_CLARA_RUNTIME_URL` incident punished
(`docs/ops/incident-2026-07-26-intake-storage.md:41-56`). **D8** is the small PR.

**R4 · A `workers.dev` preview URL is publicly reachable and is wired to the LIVE Supabase project.** Everything
in the estate is a resettable TEST fixture (constraint 13/ADR-0075), so the data exposure is bounded by ruling —
but the *surface* is real. **S22 act 1 now closes it with a read**, rather than leaving it as advice.

**R5 · The Supabase redirect-URL allowlist is ruled to be exactly two entries with no wildcard**
(`wave-g-setup-checklist.md:151-156`). Walking the signup-confirm or password-recover arms on a preview host
would require temporarily widening it — a security-mechanism change, and constraint 14's operative clause says
mechanisms are never weakened for testing convenience. **D6 rules it down to a password-login-only preview walk**,
with both arms proven on the real origin at S21 and the allowlist re-read at S22 act 2.

**R6 · `NEXT_PUBLIC_*` values are frozen at build time.** Changing `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_ANON_KEY` after S7 requires a **rebuild and a new upload** — changing the Worker's env does
nothing for them (`docs/ops/incident-2026-07-26-intake-storage.md:55-58`). Under D1(b) this risk shrinks: the
third such value, `NEXT_PUBLIC_CLARA_RUNTIME_URL`, leaves the browser bundle entirely, and `CLARA_RUNTIME_URL`
(request-time, `route.ts:34-38`) takes its place.

**R7 · `cf:build` does not run in CI and has never run on this host.** It is not a CI gate
(`apps/web/README.md:158-163`), and it fails reproducibly on Windows/Node 20. The first genuinely successful
`cf:build` will therefore happen **during** the ceremony unless it is rehearsed on WSL beforehand. Rehearse it.

**R8 · Disconnecting the Pages Git integration is itself a change to the old app's lifecycle.** It does not
unpublish, but from S6 onward the dashboard is frozen at whatever build is live. If the cutover is abandoned
mid-flight and a dashboard fix is needed, the integration has to be reconnected first.

**R9 · The parity gate's declarer is `chatTurn.v16.parts.ts` while the runtime serves `chatTurn_v17`.** 裁-121②
requires this be **re-checked at every `_vN` bump**, so read whether a `chatTurn.v17.parts.ts` exists rather than
assuming it does not (`check-parts-parity.mjs:24`).

**R10 · Every census number in this record is a dated document claim.** The 61 suites, the "ten NotBuiltNote
surfaces", the 29/30 pages, the seven Route Handlers, the `0164` ceiling — all are censuses on a moving tree, and
the orders themselves say to re-run rather than trust (`orders-p6.md:439`, `fe-train-plan-2026-08-30.md:407-409`).
Treat them as controls on your derivation, never as the derivation.

**R11 · The soak runs into FS-11's destructive reset unless D4 is ruled.** FS-11 stops the runtime and runs
`DROP SCHEMA clara CASCADE` + a fresh apply of `0001`…`0164` — there is no delta apply
(`fs11-wave-g-reset-prep.md` §1.1, steps 3-5 at `:228,:237,:254`; constraint 15 keeps `workflow`,
`graphile_worker` and `spike` untouched). A soak observation taken across that window measures the reset, not the
Worker, and the S25 delete would then be gated on nothing.

---

## 6 · Actor summary

**Owner decisions (before the ceremony opens):** D1 the chat/SSE origin fix **(blocker)** · D2 who mints the
pepper and service token **(blocker)** · D3 the deferred security lines and their FS-11 step numbers · D4 the
between-ceremony posture · D5 the soak window and its observations · D6 the preview walk vs the redirect
allowlist · D7 the `?ct=` redaction · D8 the small pre-ceremony config PR.

**Owner acts:** A1 Cloudflare access · A2 disconnect the Pages Git integration (S6) · A3 the nine Worker
secrets, minting the two shared values (S8, and S11/S20's `CLARA_PUBLIC_ORIGINS` edits if the token is not
delegated) · A4 move `app.clarabook.com` Pages → Worker (S17, S19) · A5 delete the Pages project (S25) · A6
confirm the *Reset password* LINK template · A7 the 裁-147 Stripe-problem check.

**Lead:** S1 pin the tip · S2 the CI sweep · S3 the tree re-measurement · S4 the deploy-record read (with the
owner, if dashboard access is the owner's) · S5 the four exit gates + OPS.x · S7 the WSL build · S9/S10 the
version upload and size read · S11 the three-armed origin wall · S12 the route-by-route preview walk · S13 the
signup/interview acceptance reads · S14 the chat/SSE walk · S15 the 11-line security walk · S16 the `?ct=`
redaction · S18 promote the walked version · S21 the real-origin re-walk incl. the recover arm · S22 the preview
close-out · S24 the source-delete PR under the full ladder · S26 the one owed doc line · S27 the as-run, the
checklist ticks, the `PROGRESS.md` posture flip, and §8's truing lines.

---

## 7 · What I could NOT find in the repo — stated, never invented

1. **No Cloudflare Pages / Workers / DNS / cutover / rollback runbook exists under `docs/ops/`.** Searched for
   `cloudflare|pages project|wrangler|workers.dev|custom domain|app.clarabook` across `docs/ops/`: the only
   hits are the Wave-G checklist's six FS-10 boxes (`:204-217`), its `wrangler secret list` proof line
   (`:134-138`), and the 2026-07-26 intake incident's narrative. **Every dashboard click in §2 and §3 above is
   derived from the Cloudflare product's own documented mechanism, not from a repo recipe** — the custom-domain
   `routes`/`custom_domain` shape and `wrangler versions upload --preview-alias` were checked against
   Cloudflare's official docs; the *click paths* are the standard dashboard locations and should be confirmed
   on screen before being executed.
2. **The "pending FS-10 notes" that two Wave-G lines point at do not exist as a document.**
   `wave-g-setup-checklist.md:52-53` and `:155-156` both park the *Reset password* template BOX in "the pending
   FS-10 notes" and say "do not double-file it here" — and nothing in the repo is that list. (The template
   *rule* now does have a home — 裁-146 wrote it at `:49-54`; it is the tickable box that is homeless.) This
   record carries it as P19/A6; §8 files the truing line that gives it a permanent one.
3. **No named as-run filename or template for FS-10.** The order says only "an as-run in
   `docs/plan/completed/`" (`:475`). FS-11's order names `wave-g-reduced-asrun-2026-09-XX.md`; the FS-10
   equivalent is unnamed. §2 S27 proposes one — a proposal, not a repo fact.
4. **No soak-window duration** between the repoint (S19) and the Pages delete (S25) is specified anywhere in the
   repo. D5 asks the owner for the number; the 24 hours in D5's recommendation is a recommendation, not a repo
   fact.
5. **No instrument in the repo walks a REMOTE deployed origin.** `apps/web/e2e/run.mjs` serves a local
   production build, mocks Supabase at `${appOrigin}/e2e-supabase` (`:14-28`), and mounts its own chat/SSE
   answers (`chat-parity-mock.mjs:209-240`; the mock's own handlers at `:215`, `:224`, `:232`); every spec is written against that harness. The route-by-route
   preview walk has no existing script — it is manual, or a new Playwright script written for the ceremony.
6. **No resolution in the repo for the chat/SSE origin gap (R1).** No CORS configuration for the runtime's chat
   or stream routes, no `/api/chat` Route Handler in `apps/web`, and no ruling or design note addressing it.
   The gap is now MEASURED (R1) and the fix is D1 — but the fix is not in the repo today.
7. **No recorded ceremony-time verification that Pages currently serves the dashboard.** The cutover order says
   the alignment audit could not settle it from the repo and requires a deploy-record check
   (`orders-p6.md:456-460`) — which is why S4 exists.
8. **No `cf:upload` script** in `apps/web/package.json` (only `cf:build`/`cf:preview`/`cf:deploy`/`cf-typegen`),
   so S9 uses the `pnpm … exec opennextjs-cloudflare upload` form; adding a script would be a repo change.
9. **No measured value for the Worker's compressed size.** The ≤ 10 MiB ceiling is stated in the FS-10 order
   (`:468`); nothing in the repo records what the artifact actually measures, because `cf:build` has never
   succeeded on this host.
10. **No Cloudflare-side mechanism for the `?ct=` log redaction is named anywhere in the repo.** The checklist
    (`:140-145`) states the obligation and its proof shape and stops there; whether this account/plan exposes a
    query-value redaction control for a Worker's zone or access logs is **unmeasured**. S16's first act is to
    look; D7 rules what happens if the answer is no.
11. **No numbered FS-11 step runs `packages/db/deploy/acl-baseline.sql`.** It appears in FS-11's §5 rollback
    (`fs11-wave-g-reset-prep.md:501-503`) and in the security pass's line 5, but not as a step in either
    ceremony's step list. D3 asks for one.
12. **No proof anywhere that a Next.js Route Handler's streamed response body survives OpenNext-on-Workers.**
    Searched `apps/web` for a streaming test through the proxy: the only streaming assertions are against the
    e2e's own mock server. S14 is the first measurement.

---

## 8 · Truing lines this ceremony owes the repo

Each is a repo text this record measured as WRONG or HOMELESS. None is edited here (this lane is read-only on
the repo); each rides truing-4 or S27.

1. **`docs/ops/wave-g-setup-checklist.md:190-193`** — "The Wave-G walk exercises checkout in Stripe TEST mode at
   a **non-zero test price**… A zero-amount or skipped checkout does not satisfy this line." **Superseded by
   裁-148 point 1**: walk checkout **once at the seeded beta price (sandbox, MYR 0)**; the non-zero-price walk
   belongs to the real-money switch ceremony (裁-125/126). And 裁-148 point 2: **no temporary "make a priced plan
   current" OPS act at Wave-G.**
2. **`docs/ops/wave-g-setup-checklist.md:129`** and **`docs/plan/active/checkout-gate-design-part3.md:180`** —
   "`STRIPE_SECRET_KEY` … the TEST-mode restricted key **until the launch sitting** (裁-81/87)". **Superseded by
   裁-126**: Stripe stays in the BELCORT **sandbox for the whole beta**; the key changes at the separate
   real-money switch ceremony, not at the launch sitting.
3. **`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:487`** — "→ **switch Stripe to LIVE** + the
   RM0 price at the launch sitting → beta." Same supersession (裁-126/148); the RM 0 price is right, the LIVE
   switch is not.
4. **`docs/ops/wave-g-setup-checklist.md`, Signup-gate section (`:147-178`)** — needs the *Reset password*
